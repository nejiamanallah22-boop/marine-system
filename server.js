const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const requestIp = require('request-ip');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const UAParser = require('ua-parser-js');
const Redis = require('ioredis');
const { Queue, Worker } = require('bullmq');
const { v4: uuidv4 } = require('uuid');
const xss = require('xss');
const winston = require('winston');
require('dotenv').config();

// ================= CREATE APP =================
const app = express();

// ================= STRUCTURED LOGGING =================
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({ format: winston.format.simple() })
    ]
});

// ================= CONFIGURATION =================
const isProd = process.env.NODE_ENV === 'production';
const isDev = !isProd;
const PORT = process.env.PORT || 5000;

// Generate valid dummy hash at startup
const DUMMY_HASH = bcrypt.hashSync('dummy_password_for_timing_attack', 10);
const SHUTDOWN_TIMEOUT = 15000;
const SEARCH_MAX_LENGTH = 50;
const SANITIZE_MAX_DEPTH = 10;

// ================= CENTRALIZED CONFIG VALIDATION =================
const config = {
    jwt: {
        secret: process.env.JWT_SECRET,
        refreshSecret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '24h',
        refreshExpiresIn: '7d',
        algorithm: 'HS256',
        issuer: 'marine-system',
        audience: 'marine-users'
    },
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        retryStrategy: (t) => Math.min(t * 50, 2000)
    },
    cors: {
        allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)
    },
    rateLimit: {
        windowMs: 15 * 60 * 1000,
        max: 100,
        loginMax: 10,
        ipMax: 30
    },
    bruteForce: {
        maxAttempts: parseInt(process.env.BRUTE_FORCE_MAX_ATTEMPTS) || 10,
        blockTime: parseInt(process.env.BRUTE_FORCE_BLOCK_TIME) || 3600000
    },
    mongodb: {
        uri: process.env.MONGO_URI,
        options: {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            family: 4
        }
    }
};

// Validate JWT secrets length
if (config.jwt.secret && config.jwt.secret.length < 32) {
    logger.warn('JWT secret should be at least 32 characters long');
}
if (config.jwt.refreshSecret && config.jwt.refreshSecret.length < 32) {
    logger.warn('JWT refresh secret should be at least 32 characters long');
}

// Validate critical config
if (!config.jwt.secret || !config.jwt.refreshSecret || !config.mongodb.uri) {
    logger.error('Missing required environment variables');
    process.exit(1);
}

if (isProd && config.cors.allowedOrigins.length === 0) {
    logger.error('ALLOWED_ORIGINS required in production');
    process.exit(1);
}

// ================= SECURITY HEADERS =================
app.disable('x-powered-by');

if (isProd) {
    if (process.env.TRUST_PROXY === 'true') {
        app.set('trust proxy', 1);
    } else {
        app.set('trust proxy', 'loopback');
    }
} else {
    app.set('trust proxy', false);
}

// ================= MONGOOSE SETUP =================
mongoose.set('autoIndex', isDev);
mongoose.set('sanitizeFilter', true);
mongoose.set('strictQuery', true);

// ================= REDIS CONNECTION =================
const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    retryStrategy: config.redis.retryStrategy,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 10000,
    commandTimeout: 5000,
    keepAlive: 10000
});

redis.on('connect', () => logger.info('Redis connecting...'));
redis.on('ready', () => {
    logger.info('Redis ready');
    initRateLimitStore();
    initQueue();
});
redis.on('error', (err) => logger.error('Redis error:', err.message));
redis.on('close', () => logger.warn('Redis closed'));

const isRedisReady = () => redis && redis.status === 'ready';

// ================= RATE LIMIT STORE =================
let rateLimitStore = null;

// FIXED: Correct RedisStore import for all versions
const { RedisStore } = require('rate-limit-redis');

const initRateLimitStore = () => {
    if (!rateLimitStore && isRedisReady()) {
        try {
            rateLimitStore = new RedisStore({
                sendCommand: (...args) => redis.call(...args),
                prefix: 'rl:'
            });
            logger.info('Rate limit store initialized');
        } catch (err) {
            logger.error('Rate limit store failed:', err.message);
            rateLimitStore = undefined;
        }
    }
};

// ================= RATE LIMITERS =================
const getLimiterConfig = (options) => {
    return {
        windowMs: options.windowMs || config.rateLimit.windowMs,
        max: options.max || config.rateLimit.max,
        keyGenerator: options.keyGenerator || (req => requestIp.getClientIp(req) || req.ip || 'global'),
        message: options.message || { error: 'Too many requests' },
        standardHeaders: true,
        legacyHeaders: false,
        ...(rateLimitStore && { store: rateLimitStore })
    };
};

const generalLimiter = rateLimit(getLimiterConfig({
    max: config.rateLimit.max,
    skip: req => req.path === '/api/health'
}));

// FIXED: Removed username from rate limit key to prevent enumeration
const loginLimiter = rateLimit(getLimiterConfig({
    max: config.rateLimit.loginMax,
    skipSuccessfulRequests: true,
    keyGenerator: req => {
        const ip = requestIp.getClientIp(req) || req.ip;
        return `${ip}`;
    },
    message: { error: 'Too many login attempts' }
}));

const loginIpLimiter = rateLimit(getLimiterConfig({
    max: config.rateLimit.ipMax,
    keyGenerator: req => requestIp.getClientIp(req) || req.ip,
    message: { error: 'Too many requests from this IP' }
}));

app.use('/api/', generalLimiter);

// ================= QUEUE SETUP =================
let logQueue = null;
let logWorker = null;

const getBullConnection = () => {
    return {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        connectTimeout: 10000,
        maxRetriesPerRequest: null,
        keepAlive: 10000
    };
};

const initQueue = () => {
    if (!isRedisReady()) {
        logger.warn('Queue waiting for Redis...');
        return false;
    }
    
    if (logQueue) return true;
    
    const bullConnection = getBullConnection();
    
    logQueue = new Queue('log-queue', {
        connection: bullConnection,
        defaultJobOptions: {
            removeOnComplete: 1000,
            removeOnFail: 5000,
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 }
        }
    });
    
    logWorker = new Worker('log-queue', async job => {
        try {
            const logs = job.data.logs.slice(0, 100);
            if (logs.length) {
                await Log.insertMany(logs, { ordered: false });
            }
        } catch (error) {
            logger.error('Batch log error:', error);
            throw error;
        }
    }, { 
        connection: bullConnection, 
        concurrency: 5
    });
    
    logWorker.on('error', (err) => logger.error('Worker error:', err));
    logger.info('Queue initialized');
    return true;
};

// ================= MODELS =================

// User Model
const userSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 50 },
    pass: { type: String, required: true },
    role: { type: String, default: 'مشاهد', enum: ['مسؤول', 'محرر', 'مشاهد'] },
    enabled: { type: Boolean, default: true },
    lastLogin: { type: Date, default: null },
    lastLoginIP: { type: String, default: '' },
    lastLoginDevice: { type: String, default: '' },
    lastLoginDeviceId: { type: String, default: '' },
    lastLoginUserAgent: { type: String, default: '' },
    loginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 }
}, { timestamps: true, autoCreate: false });

userSchema.index({ name: 1 });
userSchema.index({ enabled: 1 });

userSchema.pre('save', async function(next) {
    if (this.isModified('pass')) {
        this.pass = await bcrypt.hash(this.pass, 12);
    }
    next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.pass);
};

userSchema.methods.toJSON = function() {
    const obj = this.toObject();
    delete obj.pass;
    return obj;
};

const User = mongoose.model('User', userSchema);

// Vessel Model
const vesselSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    num: { type: String, unique: true, sparse: true, trim: true },
    len: { type: Number, default: 0, min: 0, max: 100 },
    reg: { type: String, default: '', trim: true },
    zone: { type: String, default: '', trim: true },
    port: { type: String, default: '', trim: true },
    supp: { type: String, default: '', trim: true },
    stat: { type: String, default: 'صالح', enum: ['صالح', 'معطب', 'صيانة'] },
    break: { type: String, default: '', trim: true },
    fDate: { type: String, default: '' },
    eDate: { type: String, default: '' },
    ref: { type: String, default: '', trim: true },
    cat: { type: String, default: '', trim: true }
}, { timestamps: true, autoCreate: false });

vesselSchema.index({ stat: 1, createdAt: -1 });
vesselSchema.index({ name: 1 });
vesselSchema.index({ num: 1 }, { sparse: true });
vesselSchema.index({ name: 'text', num: 'text' });

const Vessel = mongoose.model('Vessel', vesselSchema);

// Reply Schema
const replySchema = new mongoose.Schema({
    message: { type: String, required: true, trim: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    by: { type: String, required: true },
    role: { type: String, required: true }
});

// Ticket Schema
const ticketSchema = new mongoose.Schema({
    userName: { type: String, required: true, trim: true },
    userRole: { type: String, required: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    status: { type: String, default: 'قيد المعالجة', enum: ['قيد المعالجة', 'تم الرد', 'مغلقة'] },
    replies: [replySchema],
    date: { type: String, default: '' },
    time: { type: String, default: '' }
}, { timestamps: true, autoCreate: false });

ticketSchema.index({ status: 1, createdAt: -1 });
ticketSchema.index({ userName: 1, createdAt: -1 });

const Ticket = mongoose.model('Ticket', ticketSchema);

// Log Model
const logSchema = new mongoose.Schema({
    requestId: { type: String, default: '' },
    userName: { type: String, required: true, trim: true },
    userRole: { type: String, required: true },
    action: { type: String, required: true },
    details: { type: String, default: '', trim: true },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    device: { type: String, default: '' }
}, { timestamps: true, autoCreate: false });

logSchema.index({ createdAt: -1 });
logSchema.index({ userName: 1, createdAt: -1 });

const Log = mongoose.model('Log', logSchema);

// ================= FIXED SANITIZE FUNCTION =================
// FIXED: Return original object at max depth instead of empty object
const sanitizeObj = (obj, depth = 0) => {
    if (depth > SANITIZE_MAX_DEPTH) return obj;
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
        return obj.map(item =>
            typeof item === 'string'
                ? xss(item)
                : sanitizeObj(item, depth + 1)
        );
    }

    if (
        obj instanceof Date ||
        obj instanceof mongoose.Types.ObjectId ||
        Buffer.isBuffer(obj) ||
        obj instanceof RegExp
    ) {
        return obj;
    }

    const sanitized = {};

    for (const key of Object.keys(obj)) {
        const value = obj[key];

        if (typeof value === 'string') {
            sanitized[key] = xss(value);
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeObj(value, depth + 1);
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized;
};

// ================= MIDDLEWARE =================
// FIXED: Removed unsafe-inline from CSP
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:", "http:"],
            connectSrc: ["'self'", "https:", "http:"],
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        }
    }
}));

app.use(compression());
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(requestIp.mw());
app.use(express.static('public'));

// API timeout
app.use((req, res, next) => {
    res.setTimeout(10000, () => {
        res.status(504).json({ error: 'Request timeout' });
    });
    next();
});

// Request ID middleware
app.use((req, res, next) => {
    req.requestId = uuidv4();
    res.setHeader('X-Request-Id', req.requestId);
    next();
});

// ObjectId validation middleware
function validateObjectId(req, res, next) {
    const { id } = req.params;
    if (!id) {
        return res.status(400).json({ error: 'ID parameter is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
    }
    next();
}

// ================= CORS =================
app.use(cors({
    origin: (origin, cb) => {
        if (!origin && isDev) {
            return cb(null, true);
        }
        if (!origin && isProd) {
            return cb(new Error('Origin required'));
        }
        if (config.cors.allowedOrigins.includes(origin)) {
            return cb(null, true);
        }
        return cb(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

// ================= REDIS HELPERS =================
const redisKeys = {
    refreshToken: (userId, tokenHash) => `rt:${userId}:${tokenHash}`,
    usedRefreshToken: (tokenHash) => `used:${tokenHash}`,
    bruteForce: (ip, username) => `bf:${ip}:${(username || '').substring(0, 50)}`,
    bruteForceIp: (ip) => `bfip:${ip}`,
    // FIXED: Added deviceBruteForce to redisKeys
    deviceBruteForce: (fingerprint) => `bfdev:${fingerprint}`,
    cache: (prefix) => `cache:${prefix}`,
    lock: (key) => `lock:${key}`,
    stats: 'stats:cache',
    vesselsVersion: 'vessels:version'
};

async function setRedis(key, val, ttl) {
    if (!isRedisReady()) return false;
    try {
        await redis.setex(key, ttl, JSON.stringify(val));
        return true;
    } catch (error) {
        logger.error('Redis set error:', error);
        return false;
    }
}

async function getRedis(key) {
    if (!isRedisReady()) return null;
    try {
        const d = await redis.get(key);
        if (!d) return null;
        return JSON.parse(d);
    } catch (error) {
        logger.error('Redis get error:', error);
        return null;
    }
}

async function delRedis(key) {
    if (!isRedisReady()) return;
    try {
        await redis.del(key);
    } catch (error) {
        logger.error('Redis del error:', error);
    }
}

async function delRedisPattern(pattern, maxKeys = 1000) {
    if (!isRedisReady()) return;
    let deletedCount = 0;
    try {
        let cursor = '0';
        do {
            const [nextCursor, keys] = await redis.scan(
                cursor,
                'MATCH',
                pattern,
                'COUNT',
                100
            );
            cursor = nextCursor;
            if (keys.length) {
                const pipeline = redis.pipeline();
                keys.forEach(k => pipeline.del(k));
                await pipeline.exec();
                deletedCount += keys.length;
                if (deletedCount >= maxKeys) {
                    logger.warn(`Deleted ${deletedCount} keys, stopping to prevent overload`);
                    break;
                }
            }
        } while (cursor !== '0');
    } catch (error) {
        logger.error('Redis delete pattern error:', error);
    }
}

async function invalidateVesselsCache() {
    if (!isRedisReady()) return;
    try {
        await redis.incr(redisKeys.vesselsVersion);
    } catch (error) {
        logger.error('Version increment error:', error);
    }
}

async function acquireLock(key, ttlSeconds = 15) {
    if (!isRedisReady()) return true;
    const lockKey = redisKeys.lock(key);
    try {
        const result = await redis.set(lockKey, '1', 'NX', 'EX', ttlSeconds);
        return result === 'OK';
    } catch (error) {
        logger.error('Lock acquire error:', error);
        return true;
    }
}

async function releaseLock(key) {
    if (!isRedisReady()) return;
    await delRedis(redisKeys.lock(key));
}

async function markRefreshTokenUsed(tokenHash) {
    if (!isRedisReady()) return;
    await setRedis(redisKeys.usedRefreshToken(tokenHash), true, 60 * 60 * 24);
}

async function isRefreshTokenUsed(tokenHash) {
    if (!isRedisReady()) return false;
    return !!(await getRedis(redisKeys.usedRefreshToken(tokenHash)));
}

// ================= BRUTE FORCE =================
async function checkBruteForce(ip, username, userAgent) {
    const safeUsername = (username || '').substring(0, 50);
    const deviceFingerprint = crypto.createHash('sha256').update(`${ip}:${userAgent || ''}`).digest('hex').substring(0, 32);
    const key = redisKeys.bruteForce(ip, safeUsername);
    const ipKey = redisKeys.bruteForceIp(ip);
    const deviceKey = redisKeys.deviceBruteForce(deviceFingerprint);
    
    const [data, ipData, deviceData] = await Promise.all([
        getRedis(key),
        getRedis(ipKey),
        getRedis(deviceKey)
    ]);
    
    if (data && data.blockedUntil && data.blockedUntil > Date.now()) return true;
    if (ipData && ipData.blockedUntil && ipData.blockedUntil > Date.now()) return true;
    if (deviceData && deviceData.blockedUntil && deviceData.blockedUntil > Date.now()) return true;
    return false;
}

async function recordBruteForceAttempt(ip, username, userAgent) {
    const safeUsername = (username || '').substring(0, 50);
    const deviceFingerprint = crypto.createHash('sha256').update(`${ip}:${userAgent || ''}`).digest('hex').substring(0, 32);
    const key = redisKeys.bruteForce(ip, safeUsername);
    const ipKey = redisKeys.bruteForceIp(ip);
    const deviceKey = redisKeys.deviceBruteForce(deviceFingerprint);
    
    const [data, ipData, deviceData] = await Promise.all([
        getRedis(key),
        getRedis(ipKey),
        getRedis(deviceKey)
    ]);
    
    const currentData = data || { attempts: 0, blockedUntil: 0 };
    const currentIpData = ipData || { attempts: 0, blockedUntil: 0 };
    const currentDeviceData = deviceData || { attempts: 0, blockedUntil: 0 };
    
    currentData.attempts++;
    currentIpData.attempts++;
    currentDeviceData.attempts++;
    
    const { maxAttempts, blockTime } = config.bruteForce;
    
    if (currentData.attempts >= maxAttempts) {
        currentData.blockedUntil = Date.now() + blockTime;
        await setRedis(key, currentData, Math.ceil(blockTime / 1000));
    } else {
        await setRedis(key, currentData, 15 * 60);
    }
    
    if (currentIpData.attempts >= maxAttempts * 3) {
        currentIpData.blockedUntil = Date.now() + blockTime * 2;
        await setRedis(ipKey, currentIpData, Math.ceil(blockTime * 2 / 1000));
    } else {
        await setRedis(ipKey, currentIpData, 15 * 60);
    }
    
    if (currentDeviceData.attempts >= maxAttempts * 2) {
        currentDeviceData.blockedUntil = Date.now() + blockTime;
        await setRedis(deviceKey, currentDeviceData, Math.ceil(blockTime / 1000));
    } else {
        await setRedis(deviceKey, currentDeviceData, 15 * 60);
    }
}

async function resetBruteForce(ip, username, userAgent) {
    const safeUsername = (username || '').substring(0, 50);
    const deviceFingerprint = crypto.createHash('sha256').update(`${ip}:${userAgent || ''}`).digest('hex').substring(0, 32);
    await delRedis(redisKeys.bruteForce(ip, safeUsername));
    await delRedis(redisKeys.deviceBruteForce(deviceFingerprint));
}

// ================= HELPER FUNCTIONS =================
function getCurrentDate() {
    const now = new Date();
    return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
}

function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

function getDeviceInfo(ua) {
    if (!ua) return 'Unknown';
    try {
        const parser = new UAParser(ua);
        const result = parser.getResult();
        const browser = result.browser?.name || 'Browser';
        const os = result.os?.name || 'OS';
        return `${browser} on ${os}`;
    } catch {
        return 'Unknown';
    }
}

function escapeRegex(str) {
    if (!str || typeof str !== 'string') return '';
    if (str.length > SEARCH_MAX_LENGTH) {
        return str.substring(0, SEARCH_MAX_LENGTH);
    }
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeFormatResponse(doc) {
    if (!doc) return null;
    try {
        const obj = doc.toObject ? doc.toObject() : doc;
        const { _id, __v, pass, ...rest } = obj;
        const id = _id?.toString() || obj.id || null;
        return { ...rest, id };
    } catch {
        return doc;
    }
}

function safeFormatArray(arr = []) {
    if (!Array.isArray(arr)) return [];
    return arr.map(safeFormatResponse);
}

function generateCacheKey(obj) {
    const sorted = Object.keys(obj).sort().reduce((acc, key) => {
        acc[key] = obj[key];
        return acc;
    }, {});
    const str = JSON.stringify(sorted);
    return crypto.createHash('sha256').update(str).digest('hex');
}

async function logActivity(userName, userRole, action, details, req = null) {
    const ua = req?.headers?.['user-agent'] || '';
    const logEntry = {
        requestId: req?.requestId || '',
        userName: userName || 'system',
        userRole: userRole || 'system',
        action,
        details: (details || '').substring(0, 500),
        ip: requestIp.getClientIp(req) || req?.ip || '',
        userAgent: ua,
        device: getDeviceInfo(ua)
    };
    
    if (logQueue && isRedisReady()) {
        logQueue.add('log', { logs: [logEntry] }).catch(e => logger.error('Queue add error:', e));
    } else {
        Log.create(logEntry).catch(e => logger.error('Log create error:', e));
    }
}

// ================= TOKEN FUNCTIONS =================
async function generateTokens(user, deviceId, deviceName, ip, userAgent) {
    const jti = uuidv4();
    const refreshVersion = uuidv4();
    
    const accessToken = jwt.sign(
        { userId: user._id, role: user.role, name: user.name, jti, tokenVersion: user.tokenVersion },
        config.jwt.secret,
        { 
            expiresIn: config.jwt.expiresIn,
            algorithm: config.jwt.algorithm,
            issuer: config.jwt.issuer,
            audience: config.jwt.audience
        }
    );
    
    const refreshToken = jwt.sign(
        { userId: user._id, deviceId, version: refreshVersion },
        config.jwt.refreshSecret,
        { 
            expiresIn: config.jwt.refreshExpiresIn,
            algorithm: config.jwt.algorithm,
            issuer: config.jwt.issuer,
            audience: config.jwt.audience
        }
    );
    
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const refreshData = {
        userId: user._id,
        deviceId,
        deviceName: deviceName || 'Unknown Device',
        ip: ip || '',
        userAgent: userAgent || '',
        createdAt: Date.now(),
        version: refreshVersion
    };
    await setRedis(redisKeys.refreshToken(user._id.toString(), tokenHash), refreshData, 7 * 24 * 60 * 60);
    return { accessToken, refreshToken, jti, tokenHash };
}

// ================= VALIDATION =================
const validateLogin = [
    body('name').trim().notEmpty().withMessage('اسم المستخدم مطلوب'),
    body('pass').notEmpty().withMessage('كلمة المرور مطلوبة')
];

const validateVessel = [
    body('name').trim().isLength({ min: 2 }).withMessage('اسم المركب يجب أن يكون حرفين على الأقل'),
    body('len').optional().isInt({ min: 0, max: 100 }).withMessage('الطول يجب أن يكون بين 0 و 100'),
    body('stat').optional().isIn(['صالح', 'معطب', 'صيانة']).withMessage('الحالة غير صالحة')
];

const validateTicket = [
    body('subject').trim().isLength({ min: 3 }).withMessage('عنوان التذكرة يجب أن يكون 3 أحرف على الأقل'),
    body('message').trim().isLength({ min: 5 }).withMessage('رسالة التذكرة يجب أن تكون 5 أحرف على الأقل')
];

const validateUser = [
    body('name').trim().isLength({ min: 3 }).withMessage('اسم المستخدم يجب أن يكون 3 أحرف على الأقل'),
    body('pass').optional()
        .isLength({ min: 8 }).withMessage('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
        .matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])?[A-Za-z\d@$!%*?&]{8,}$/)
        .withMessage('كلمة المرور يجب أن تحتوي على حرف كبير وصغير ورقم على الأقل')
];

const validationHandler = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    // Sanitize after validation
    if (req.body) req.body = sanitizeObj({ ...req.body });
    if (req.query) req.query = sanitizeObj({ ...req.query });
    next();
};

// ================= ROLE MIDDLEWARE =================
const roleMiddleware = (allowedRoles) => {
    return (req, res, next) => {
        if (!allowedRoles.includes(req.userRole)) {
            return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
        }
        next();
    };
};

// FIXED: Cache user in request to avoid double query
const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    
    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    
    try {
        const decoded = jwt.verify(token, config.jwt.secret, {
            algorithms: [config.jwt.algorithm],
            issuer: config.jwt.issuer,
            audience: config.jwt.audience
        });
        
        const user = await User.findById(decoded.userId).select('+tokenVersion');
        
        if (!user || !user.enabled) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        
        if (decoded.tokenVersion !== user.tokenVersion) {
            return res.status(401).json({ error: 'Token invalidated. Please login again.' });
        }
        
        // Cache user in request for later use
        req.user = user;
        req.userId = decoded.userId;
        req.userRole = user.role;
        req.userName = user.name;
        req.jti = decoded.jti;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
        }
        res.status(401).json({ error: 'Invalid token' });
    }
};

const adminMiddleware = roleMiddleware(['مسؤول']);
const editorOrAdminMiddleware = roleMiddleware(['محرر', 'مسؤول']);

// ================= DATABASE CONNECTION =================
mongoose.connect(config.mongodb.uri, config.mongodb.options)
    .then(async () => {
        logger.info('Connected to MongoDB Atlas');
        await initializeDatabase();
    })
    .catch(err => {
        logger.error('MongoDB Connection Error:', err.message);
        process.exit(1);
    });

mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
});

// ================= INITIALIZE DATABASE =================
async function initializeDatabase() {
    try {
        if (process.env.CREATE_DEFAULT_USERS === 'true') {
            const adminExists = await User.findOne({ name: 'admin' });
            if (!adminExists) {
                await User.create({ name: 'admin', pass: 'Admin@123456', role: 'مسؤول', enabled: true });
                await User.create({ name: 'editor', pass: 'Editor@123456', role: 'محرر', enabled: true });
                await User.create({ name: 'viewer', pass: 'Viewer@123456', role: 'مشاهد', enabled: true });
                logger.info('Default users created');
            }
        }
        
        if (process.env.CREATE_DEFAULT_VESSELS === 'true') {
            const vesselsCount = await Vessel.countDocuments();
            if (vesselsCount === 0) {
                await Vessel.insertMany([
                    { name: "البروق 1", num: "B001", len: 11, reg: "الشمال", zone: "تونس", stat: "صالح", cat: "البروق" },
                    { name: "صقر 1", num: "S001", len: 10, reg: "الساحل", zone: "سوسة", stat: "صالح", cat: "صقور" },
                    { name: "خافرة 1", num: "K001", len: 20, reg: "الوسط", zone: "صفاقس", stat: "معطب", break: "عطل في المحرك", cat: "خوافر" },
                    { name: "زورق 1", num: "Z001", len: 15, reg: "الجنوب", zone: "جربة", stat: "صيانة", cat: "زوارق مزدوجة" },
                    { name: "طوافة 1", num: "T001", len: 35, reg: "الشمال", zone: "بنزرت", stat: "صالح", cat: "طوافات" }
                ]);
                logger.info('Default vessels created');
            }
        }
        logger.info('Database initialized successfully');
    } catch (error) {
        logger.error('Initialization error:', error);
    }
}

// ================= ASYNC HANDLER =================
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// ================= HEALTH CHECK =================
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        redis: isRedisReady(),
        mongo: mongoose.connection.readyState === 1,
        queue: logQueue !== null
    });
});

// ================= AUTH ROUTES =================
app.post('/api/login', loginLimiter, loginIpLimiter, validateLogin, validationHandler, asyncHandler(async (req, res) => {
    const clientIp = requestIp.getClientIp(req) || req.ip;
    const { name, pass } = req.body;
    const userAgent = req.headers['user-agent'] || '';
    
    if (await checkBruteForce(clientIp, name, userAgent)) {
        return res.status(429).json({ error: 'Account temporarily locked. Please try again later.' });
    }
    
    const user = await User.findOne({ name });
    
    let isValid = false;
    if (user) {
        isValid = await user.comparePassword(pass);
    } else {
        isValid = await bcrypt.compare(pass || 'dummy', DUMMY_HASH);
    }
    
    if (!user || !isValid) {
        await recordBruteForceAttempt(clientIp, name, userAgent);
        if (user) {
            user.loginAttempts++;
            if (user.loginAttempts >= config.bruteForce.maxAttempts) {
                user.lockedUntil = new Date(Date.now() + config.bruteForce.blockTime);
            }
            await user.save();
        }
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (user.lockedUntil && user.lockedUntil > new Date()) {
        return res.status(429).json({ error: 'Account temporarily locked. Please try again later.' });
    }
    
    await resetBruteForce(clientIp, name, userAgent);
    
    const deviceId = crypto.randomUUID();
    const deviceName = getDeviceInfo(userAgent);
    const { accessToken, refreshToken, jti } = await generateTokens(user, deviceId, deviceName, clientIp, userAgent);
    
    user.loginAttempts = 0;
    user.lockedUntil = null;
    user.lastLogin = new Date();
    user.lastLoginIP = clientIp;
    user.lastLoginDevice = deviceName;
    user.lastLoginDeviceId = deviceId;
    user.lastLoginUserAgent = userAgent;
    await user.save();
    
    await logActivity(user.name, user.role, 'تسجيل دخول', `تسجيل دخول من جهاز ${deviceName}`, req);
    
    res.json({ token: accessToken, refreshToken, name: user.name, role: user.role, deviceId });
}));

app.post('/api/refresh', asyncHandler(async (req, res) => {
    const { refreshToken, deviceId } = req.body;
    const clientIp = requestIp.getClientIp(req) || req.ip;
    const userAgent = req.headers['user-agent'] || '';
    
    if (!refreshToken) return res.status(401).json({ error: 'Invalid credentials' });
    if (!deviceId) return res.status(401).json({ error: 'Device ID required' });
    
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    if (await isRefreshTokenUsed(tokenHash)) {
        logger.warn(`Refresh token replay detected: ${tokenHash.substring(0, 16)}`);
        return res.status(401).json({ error: 'Token already used' });
    }
    
    const lockKey = `refresh:${tokenHash}`;
    const lockAcquired = await acquireLock(lockKey, 15);
    
    if (!lockAcquired) {
        return res.status(409).json({ error: 'Please try again' });
    }
    
    try {
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, config.jwt.refreshSecret, {
                algorithms: [config.jwt.algorithm],
                issuer: config.jwt.issuer,
                audience: config.jwt.audience
            });
        } catch (error) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const tokenData = await getRedis(redisKeys.refreshToken(decoded.userId, tokenHash));
        if (!tokenData) return res.status(401).json({ error: 'Invalid credentials' });
        
        // Device mismatch check
        if (tokenData.deviceId !== deviceId) {
            await delRedis(redisKeys.refreshToken(decoded.userId, tokenHash));
            logger.warn(`Device mismatch for user ${decoded.userId}`);
            return res.status(401).json({ error: 'Device mismatch' });
        }
        
        const user = await User.findById(decoded.userId);
        if (!user || !user.enabled) return res.status(401).json({ error: 'Invalid credentials' });
        
        if (tokenData.version !== decoded.version) {
            await delRedis(redisKeys.refreshToken(decoded.userId, tokenHash));
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Mark as used AFTER all validations pass
        await markRefreshTokenUsed(tokenHash);
        await delRedis(redisKeys.refreshToken(decoded.userId, tokenHash));
        
        const deviceName = tokenData.deviceName || 'Unknown Device';
        const { accessToken, refreshToken: newRefreshToken, jti, tokenHash: newTokenHash } = 
            await generateTokens(user, deviceId, deviceName, clientIp, userAgent);
        
        res.json({ token: accessToken, refreshToken: newRefreshToken, deviceId });
    } finally {
        await releaseLock(lockKey);
    }
}));

app.post('/api/logout', authMiddleware, asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        await markRefreshTokenUsed(tokenHash);
        await delRedis(redisKeys.refreshToken(req.userId, tokenHash));
    }
    await logActivity(req.userName, req.userRole, 'تسجيل خروج', 'تم تسجيل الخروج', req);
    res.json({ success: true });
}));

app.post('/api/logout-all', authMiddleware, asyncHandler(async (req, res) => {
    const lockKey = `logoutall:${req.userId}`;
    const lock = await acquireLock(lockKey, 10);
    if (!lock) {
        return res.status(409).json({ error: 'Please try again' });
    }
    
    try {
        await User.findByIdAndUpdate(req.userId, { $inc: { tokenVersion: 1 } });
        await delRedisPattern(`rt:${req.userId}:*`);
        await logActivity(req.userName, req.userRole, 'تسجيل خروج من الكل', 'تم تسجيل الخروج من جميع الأجهزة', req);
        res.json({ success: true });
    } finally {
        await releaseLock(lockKey);
    }
}));

app.get('/api/verify', authMiddleware, asyncHandler(async (req, res) => {
    // Use cached user from request
    const user = req.user.toJSON();
    delete user.pass;
    res.json({ valid: true, name: req.userName, role: req.userRole, user });
}));

// ================= VESSEL ROUTES =================
app.get('/api/vessels', asyncHandler(async (req, res) => {
    const cacheVersion = await getRedis(redisKeys.vesselsVersion);
    const version = cacheVersion || 1;
    const cacheKey = `cache:vessels:${version}:${generateCacheKey(req.query)}`;
    const cached = await getRedis(cacheKey);
    if (cached) return res.json(cached);
    
    const { page = 1, limit = 50, search, stat, reg, useTextSearch = 'false' } = req.query;
    const query = {};
    const safeLimit = Math.min(parseInt(limit) || 50, 100);
    // FIXED: Handle NaN in pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const skip = (pageNum - 1) * safeLimit;
    
    if (search && typeof search === 'string') {
        if (search.length > SEARCH_MAX_LENGTH) {
            return res.status(400).json({ error: `Search term too long (max ${SEARCH_MAX_LENGTH} chars)` });
        }
        
        if (useTextSearch === 'true') {
            query.$text = { $search: search };
        } else {
            const escapedSearch = escapeRegex(search);
            if (escapedSearch) {
                query.$or = [
                    { name: { $regex: new RegExp(`^${escapedSearch}`, 'i') } },
                    { num: { $regex: new RegExp(`^${escapedSearch}`, 'i') } }
                ];
            }
        }
    }
    if (stat && stat !== 'الكل') query.stat = stat;
    if (reg && reg !== 'الكل') query.reg = reg;
    
    let vesselsQuery = Vessel.find(query);
    if (useTextSearch !== 'true') {
        vesselsQuery = vesselsQuery.sort({ createdAt: -1 });
    } else {
        vesselsQuery = vesselsQuery.sort({ score: { $meta: "textScore" } });
    }
    
    const [vessels, total] = await Promise.all([
        vesselsQuery.skip(skip).limit(safeLimit),
        Vessel.countDocuments(query)
    ]);
    
    const result = {
        data: safeFormatArray(vessels),
        pagination: { page: pageNum, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) }
    };
    await setRedis(cacheKey, result, 60);
    res.json(result);
}));

app.get('/api/vessels/all-paginated', asyncHandler(async (req, res) => {
    const { page = 1, limit = 100 } = req.query;
    const safeLimit = Math.min(parseInt(limit) || 100, 500);
    const pageNum = Math.max(1, parseInt(page) || 1);
    const skip = (pageNum - 1) * safeLimit;
    
    const vessels = await Vessel.find()
        .skip(skip)
        .limit(safeLimit)
        .sort({ name: 1 });
    
    const total = await Vessel.countDocuments();
    
    res.json({
        data: safeFormatArray(vessels),
        pagination: { page: pageNum, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) }
    });
}));

app.get('/api/vessels/:id', validateObjectId, asyncHandler(async (req, res) => {
    const vessel = await Vessel.findById(req.params.id);
    if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
    res.json(safeFormatResponse(vessel));
}));

app.post('/api/vessels', authMiddleware, editorOrAdminMiddleware, validateVessel, validationHandler, asyncHandler(async (req, res) => {
    const vessel = await Vessel.create(req.body);
    await invalidateVesselsCache();
    await logActivity(req.userName, req.userRole, 'إضافة مركب', `أضاف مركب ${vessel.name}`, req);
    res.status(201).json(safeFormatResponse(vessel));
}));

app.put('/api/vessels/:id', validateObjectId, authMiddleware, editorOrAdminMiddleware, validateVessel, validationHandler, asyncHandler(async (req, res) => {
    const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
    await invalidateVesselsCache();
    await logActivity(req.userName, req.userRole, 'تعديل مركب', `عدل مركب ${vessel.name}`, req);
    res.json(safeFormatResponse(vessel));
}));

app.delete('/api/vessels/:id', validateObjectId, authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
    const vessel = await Vessel.findByIdAndDelete(req.params.id);
    if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
    await invalidateVesselsCache();
    await logActivity(req.userName, req.userRole, 'حذف مركب', `حذف مركب ${vessel.name}`, req);
    res.json({ success: true, message: 'تم حذف المركب بنجاح' });
}));

// ================= TICKET ROUTES =================
app.get('/api/tickets', authMiddleware, asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status } = req.query;
    const query = {};
    const safeLimit = Math.min(parseInt(limit) || 20, 50);
    const pageNum = Math.max(1, parseInt(page) || 1);
    const skip = (pageNum - 1) * safeLimit;
    
    if (status && status !== 'الكل') {
        query.status = status;
    }
    
    if (req.userRole === 'مشاهد') {
        query.userName = req.userName;
    }
    
    const [tickets, total] = await Promise.all([
        Ticket.find(query).skip(skip).limit(safeLimit).sort({ createdAt: -1 }),
        Ticket.countDocuments(query)
    ]);
    
    res.json({
        data: safeFormatArray(tickets),
        pagination: { page: pageNum, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) }
    });
}));

app.get('/api/tickets/:id', validateObjectId, authMiddleware, asyncHandler(async (req, res) => {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
    
    if (req.userRole === 'مشاهد' && ticket.userName !== req.userName) {
        return res.status(403).json({ error: 'غير مصرح لك بمشاهدة هذه التذكرة' });
    }
    
    res.json(safeFormatResponse(ticket));
}));

app.post('/api/tickets', authMiddleware, validateTicket, validationHandler, asyncHandler(async (req, res) => {
    const ticketData = {
        userName: req.userName,
        userRole: req.userRole,
        subject: req.body.subject,
        message: req.body.message,
        date: getCurrentDate(),
        time: getCurrentTime(),
        status: 'قيد المعالجة'
    };
    
    const ticket = await Ticket.create(ticketData);
    await logActivity(req.userName, req.userRole, 'إنشاء تذكرة', `أنشأ تذكرة: ${ticket.subject}`, req);
    res.status(201).json(safeFormatResponse(ticket));
}));

app.post('/api/tickets/:id/reply', validateObjectId, authMiddleware, asyncHandler(async (req, res) => {
    const { message } = req.body;
    if (!message || message.trim().length < 2) {
        return res.status(400).json({ error: 'الرد يجب أن يكون حرفين على الأقل' });
    }
    
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
    
    if (req.userRole === 'مشاهد' && ticket.userName !== req.userName) {
        return res.status(403).json({ error: 'غير مصرح لك بالرد على هذه التذكرة' });
    }
    
    const reply = {
        message: message.trim(),
        date: getCurrentDate(),
        time: getCurrentTime(),
        by: req.userName,
        role: req.userRole
    };
    
    ticket.replies.push(reply);
    ticket.status = 'تم الرد';
    await ticket.save();
    
    await logActivity(req.userName, req.userRole, 'رد على تذكرة', `رد على تذكرة: ${ticket.subject}`, req);
    res.json(safeFormatResponse(ticket));
}));

app.put('/api/tickets/:id/close', validateObjectId, authMiddleware, asyncHandler(async (req, res) => {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
    
    if (req.userRole === 'مشاهد' && ticket.userName !== req.userName) {
        return res.status(403).json({ error: 'غير مصرح لك بإغلاق هذه التذكرة' });
    }
    
    ticket.status = 'مغلقة';
    await ticket.save();
    
    await logActivity(req.userName, req.userRole, 'إغلاق تذكرة', `أغلق تذكرة: ${ticket.subject}`, req);
    res.json({ success: true, message: 'تم إغلاق التذكرة' });
}));

// ================= USER MANAGEMENT ROUTES =================
app.get('/api/users', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search } = req.query;
    const query = {};
    const safeLimit = Math.min(parseInt(limit) || 20, 50);
    const pageNum = Math.max(1, parseInt(page) || 1);
    const skip = (pageNum - 1) * safeLimit;
    
    if (search && typeof search === 'string') {
        if (search.length > SEARCH_MAX_LENGTH) {
            return res.status(400).json({ error: `Search term too long (max ${SEARCH_MAX_LENGTH} chars)` });
        }
        query.name = { $regex: new RegExp(`^${escapeRegex(search)}`, 'i') };
    }
    
    const [users, total] = await Promise.all([
        User.find(query).select('-pass').skip(skip).limit(safeLimit).sort({ createdAt: -1 }),
        User.countDocuments(query)
    ]);
    
    res.json({
        data: safeFormatArray(users),
        pagination: { page: pageNum, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) }
    });
}));

app.get('/api/users/:id', validateObjectId, authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('-pass');
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json(safeFormatResponse(user));
}));

app.post('/api/users', authMiddleware, adminMiddleware, validateUser, validationHandler, asyncHandler(async (req, res) => {
    const existingUser = await User.findOne({ name: req.body.name });
    if (existingUser) {
        return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
    }
    
    if (!req.body.pass) {
        return res.status(400).json({ error: 'كلمة المرور مطلوبة' });
    }
    
    const userData = {
        name: req.body.name,
        pass: req.body.pass,
        role: req.body.role || 'مشاهد',
        enabled: req.body.enabled !== undefined ? req.body.enabled : true
    };
    
    const user = await User.create(userData);
    await logActivity(req.userName, req.userRole, 'إنشاء مستخدم', `أنشأ مستخدم: ${user.name}`, req);
    res.status(201).json(safeFormatResponse(user));
}));

app.put('/api/users/:id', validateObjectId, authMiddleware, adminMiddleware, validateUser, validationHandler, asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    
    if (req.body.name && req.body.name !== user.name) {
        const existingUser = await User.findOne({ name: req.body.name });
        if (existingUser) {
            return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
        }
        user.name = req.body.name;
    }
    
    if (req.body.pass) {
        user.pass = req.body.pass;
        user.tokenVersion++;
    }
    
    if (req.body.role) user.role = req.body.role;
    if (req.body.enabled !== undefined) {
        if (user.enabled !== req.body.enabled) {
            user.enabled = req.body.enabled;
            if (!user.enabled) {
                user.tokenVersion++;
            }
        }
    }
    
    await user.save();
    
    if (!user.enabled || req.body.pass) {
        await delRedisPattern(`rt:${user._id}:*`);
    }
    
    await logActivity(req.userName, req.userRole, 'تعديل مستخدم', `عدل مستخدم: ${user.name}`, req);
    res.json(safeFormatResponse(user));
}));

app.delete('/api/users/:id', validateObjectId, authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
    if (req.userId === req.params.id) {
        return res.status(400).json({ error: 'لا يمكن حذف حسابك الخاص' });
    }
    
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    
    await delRedisPattern(`rt:${user._id}:*`);
    await logActivity(req.userName, req.userRole, 'حذف مستخدم', `حذف مستخدم: ${user.name}`, req);
    res.json({ success: true, message: 'تم حذف المستخدم بنجاح' });
}));

// ================= LOGS ROUTE =================
app.get('/api/logs', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
    const { page = 1, limit = 50, userName, action } = req.query;
    const query = {};
    const safeLimit = Math.min(parseInt(limit) || 50, 100);
    const pageNum = Math.max(1, parseInt(page) || 1);
    const skip = (pageNum - 1) * safeLimit;
    
    if (userName) query.userName = userName;
    if (action) query.action = action;
    
    const [logs, total] = await Promise.all([
        Log.find(query).skip(skip).limit(safeLimit).sort({ createdAt: -1 }),
        Log.countDocuments(query)
    ]);
    
    res.json({
        data: safeFormatArray(logs),
        pagination: { page: pageNum, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) }
    });
}));

// ================= STATS ROUTE =================
app.get('/api/stats', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
    const cachedStats = await getRedis(redisKeys.stats);
    if (cachedStats) {
        return res.json(cachedStats);
    }
    
    const [vesselsCount, ticketsCount, usersCount, openTickets] = await Promise.all([
        Vessel.countDocuments(),
        Ticket.countDocuments(),
        User.countDocuments(),
        Ticket.countDocuments({ status: { $ne: 'مغلقة' } })
    ]);
    
    const vesselsByStat = await Vessel.aggregate([
        { $group: { _id: '$stat', count: { $sum: 1 } } }
    ]);
    
    const result = {
        vessels: vesselsCount,
        tickets: ticketsCount,
        users: usersCount,
        openTickets,
        vesselsByStat: vesselsByStat.reduce((acc, curr) => {
            acc[curr._id] = curr.count;
            return acc;
        }, {}),
        cachedAt: new Date().toISOString()
    };
    
    await setRedis(redisKeys.stats, result, 300);
    res.json(result);
}));

// ================= ERROR HANDLING =================
app.use((err, req, res, next) => {
    logger.error('Error:', err);
    
    if (err.name === 'MongoServerError' && err.code === 11000) {
        const field = Object.keys(err.keyPattern)[0];
        return res.status(400).json({ error: `قيمة مكررة للحقل: ${field}` });
    }
    
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(e => e.message);
        return res.status(400).json({ error: messages.join(', ') });
    }
    
    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({ error: 'CORS not allowed' });
    }
    
    if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
        return;
    }
    
    res.status(500).json({ error: 'حدث خطأ داخلي في الخادم' });
});

// ================= START SERVER =================
const server = app.listen(PORT, () => {
    logger.info(`\n🚀 Server running on port ${PORT}`);
    logger.info(`📡 Environment: ${isProd ? 'production' : 'development'}`);
    logger.info(`🔐 Redis: ${isRedisReady() ? 'Connected' : 'Not connected'}`);
    logger.info(`💾 MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Not connected'}`);
    logger.info(`📦 Queue: ${logQueue ? 'Initialized' : 'Waiting for Redis'}`);
    logger.info(`\n✨ API ready at http://localhost:${PORT}/api\n`);
});

// ================= GRACEFUL SHUTDOWN =================
let isShuttingDown = false;

const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    logger.info(`\n${signal} received, closing server...`);
    
    const forceTimeout = setTimeout(() => {
        logger.error('Force shutdown due to timeout');
        process.exit(1);
    }, SHUTDOWN_TIMEOUT);
    
    server.close(async () => {
        logger.info('HTTP server closed');
        
        if (logQueue) {
            try {
                await Promise.race([
                    logQueue.close(),
                    new Promise(resolve => setTimeout(resolve, 3000))
                ]);
                logger.info('Log queue closed');
            } catch (err) {
                logger.error('Error closing log queue:', err);
            }
        }
        
        if (logWorker) {
            try {
                await Promise.race([
                    logWorker.close(),
                    new Promise(resolve => setTimeout(resolve, 3000))
                ]);
                logger.info('Log worker closed');
            } catch (err) {
                logger.error('Error closing log worker:', err);
            }
        }
        
        if (redis) {
            try {
                await Promise.race([
                    redis.quit(),
                    new Promise(resolve => setTimeout(resolve, 3000))
                ]);
                logger.info('Redis closed');
            } catch (err) {
                logger.error('Error closing Redis:', err);
            }
        }
        
        try {
            await Promise.race([
                mongoose.connection.close(),
                new Promise(resolve => setTimeout(resolve, 5000))
            ]);
            logger.info('MongoDB closed');
        } catch (err) {
            logger.error('Error closing MongoDB:', err);
        }
        
        clearTimeout(forceTimeout);
        logger.info('Server shutdown complete\n');
        process.exit(0);
    });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    shutdown('UNCAUGHT_EXCEPTION');
});

module.exports = app;
