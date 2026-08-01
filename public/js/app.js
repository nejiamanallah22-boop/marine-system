const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const helmet = require('helmet');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const requestIp = require('request-ip');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
let UAParser;
try {
    UAParser = require('ua-parser-js');
} catch (e) {
    UAParser = null;
}
const Redis = require('ioredis');
const { Queue, Worker, QueueEvents } = require('bullmq');
const { v4: uuidv4 } = require('uuid');
const xss = require('xss');
require('dotenv').config();

const app = express();

// Disable X-Powered-By header
app.disable('x-powered-by');

// Trust proxy for correct IP behind reverse proxies
app.set('trust proxy', 1);

// Auto-index only in development
mongoose.set('autoIndex', process.env.NODE_ENV !== 'production');

// ================= ENV VALIDATION =================
const requiredEnv = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'MONGO_URI'];
for (const env of requiredEnv) {
    if (!process.env[env]) {
        console.error(`❌ Missing ${env}`);
        process.exit(1);
    }
}

// ================= REDIS =================
const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD,
    retryStrategy: t => Math.min(t * 50, 2000),
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('Redis error:', err));

const isRedisReady = () => redis?.status === 'connect' || redis?.status === 'ready';

// ================= RATE LIMIT REDIS STORE =================
const rateLimitStore = new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: 'rl:'
});

// ================= QUEUE =================
const bullConnection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD
};

const logQueue = new Queue('log-queue', { connection: bullConnection });
const queueEvents = new QueueEvents('log-queue', { connection: bullConnection });

// ================= MODELS =================

// User Model with tokenVersion for multi-device logout
const userSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 50 },
    pass: { type: String, required: true },
    role: { type: String, default: 'مشاهد', enum: ['مسؤول', 'محرر', 'مشاهد'] },
    enabled: { type: Boolean, default: true },
    lastLogin: { type: Date, default: null },
    lastLoginIP: { type: String, default: '' },
    lastLoginDevice: { type: String, default: '' },
    loginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 }
}, { timestamps: true });

userSchema.index({ name: 1, enabled: 1 });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });

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
}, { timestamps: true });

vesselSchema.index({ stat: 1, createdAt: -1 });
vesselSchema.index({ reg: 1, stat: 1 });
vesselSchema.index({ name: 1 });
vesselSchema.index({ num: 1 }, { sparse: true });

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
}, { timestamps: true });

ticketSchema.index({ status: 1, createdAt: -1 });
ticketSchema.index({ userName: 1, status: 1 });
ticketSchema.index({ createdAt: -1 });

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
}, { timestamps: true });

logSchema.index({ createdAt: -1 });
logSchema.index({ userName: 1, createdAt: -1 });
logSchema.index({ action: 1, createdAt: -1 });
logSchema.index({ requestId: 1 });

const Log = mongoose.model('Log', logSchema);

// ================= BULLMQ WORKER =================
const logWorker = new Worker('log-queue', async job => {
    try {
        await Log.insertMany(job.data.logs);
    } catch (error) {
        console.error('Batch log error:', error);
        throw error;
    }
}, { connection: bullConnection, concurrency: 5 });

logWorker.on('error', (err) => console.error('Worker error:', err));

// ================= MIDDLEWARE =================
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(requestIp.mw());
app.use(express.static('public'));

// Request ID middleware
app.use((req, res, next) => {
    req.requestId = uuidv4();
    res.setHeader('X-Request-Id', req.requestId);
    next();
});

// XSS SAFE - Only sanitize string fields, handles arrays
const sanitizeString = (str) => {
    if (typeof str === 'string') return xss(str);
    return str;
};

const sanitizeObj = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    for (const k in obj) {
        const val = obj[k];
        if (typeof val === 'string') {
            obj[k] = sanitizeString(val);
        } else if (Array.isArray(val)) {
            obj[k] = val.map(item => {
                if (typeof item === 'string') return sanitizeString(item);
                if (item && typeof item === 'object') return sanitizeObj(item);
                return item;
            });
        } else if (val && typeof val === 'object' && !(val instanceof Date)) {
            sanitizeObj(val);
        }
    }
    return obj;
};

app.use((req, res, next) => {
    if (req.body) sanitizeObj(req.body);
    if (req.query) sanitizeObj(req.query);
    // Don't sanitize params to preserve ObjectId format
    next();
});

// ObjectId validation middleware
function validateObjectId(req, res, next) {
    const { id } = req.params;
    if (id && !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
    }
    next();
}

// ================= CORS =================
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
const isDev = process.env.NODE_ENV !== 'production';

app.use(cors({
    origin: (origin, cb) => {
        if (!origin && isDev) return cb(null, true);
        if (allowedOrigins.includes(origin)) {
            return cb(null, true);
        }
        return cb(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

// ================= RATE LIMIT =================
const generalLimiter = rateLimit({
    store: rateLimitStore,
    windowMs: 15 * 60 * 1000,
    max: 100,
    keyGenerator: req => requestIp.getClientIp(req) || req.ip || 'global',
    message: { error: 'Too many requests, please try again later.' },
    skip: req => req.path === '/api/health'
});

const loginLimiter = rateLimit({
    store: rateLimitStore,
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    keyGenerator: req => `${requestIp.getClientIp(req) || req.ip}:${req.body?.name || 'unknown'}`,
    message: { error: 'Too many login attempts, please try again later.' }
});

app.use('/api/', generalLimiter);

// ================= JWT CONFIG =================
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_EXPIRES_IN = '24h';
const JWT_REFRESH_EXPIRES_IN = '7d';

// ================= REDIS SAFE OPS =================
const redisKeys = {
    refreshToken: (userId, token) => `rt:${userId}:${token}`,
    bruteForce: (ip, username) => `bf:${ip}:${username}`,
    bruteForceIp: (ip) => `bfip:${ip}`,
    cache: (prefix) => `cache:${prefix}`,
    blacklist: (jti) => `blacklist:${jti}`,
    lock: (key) => `lock:${key}`
};

async function setRedis(key, val, ttl) {
    if (!isRedisReady()) return false;
    try {
        await redis.setex(key, ttl, JSON.stringify(val));
        return true;
    } catch (error) {
        console.error('Redis set error:', error);
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
        console.error('Redis get error:', error);
        return null;
    }
}

async function delRedis(key) {
    if (!isRedisReady()) return;
    try {
        await redis.del(key);
    } catch (error) {
        console.error('Redis del error:', error);
    }
}

async function delRedisPattern(pattern) {
    if (!isRedisReady()) return;
    try {
        let cursor = '0';
        const keys = [];
        do {
            const reply = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
            cursor = reply[0];
            keys.push(...reply[1]);
        } while (cursor !== '0');
        if (keys.length) {
            const pipeline = redis.pipeline();
            keys.forEach(k => pipeline.del(k));
            await pipeline.exec();
        }
    } catch (error) {
        console.error('Redis delete pattern error:', error);
    }
}

async function delCachePattern(prefix = '*') {
    await delRedisPattern(`cache:${prefix}`);
}

async function acquireLock(key, ttlSeconds = 5) {
    const lockKey = redisKeys.lock(key);
    const result = await redis.set(lockKey, '1', 'NX', 'EX', ttlSeconds);
    return result === 'OK';
}

async function releaseLock(key) {
    await delRedis(redisKeys.lock(key));
}

async function blacklistToken(jti, expirySeconds) {
    await setRedis(redisKeys.blacklist(jti), true, expirySeconds);
}

async function isTokenBlacklisted(jti) {
    return !!(await getRedis(redisKeys.blacklist(jti)));
}

// ================= BRUTE FORCE =================
async function checkBruteForce(ip, username) {
    const key = redisKeys.bruteForce(ip, username);
    const ipKey = redisKeys.bruteForceIp(ip);
    const data = await getRedis(key);
    const ipData = await getRedis(ipKey);
    if (data && data.blockedUntil && data.blockedUntil > Date.now()) return true;
    if (ipData && ipData.blockedUntil && ipData.blockedUntil > Date.now()) return true;
    return false;
}

async function recordBruteForceAttempt(ip, username) {
    const key = redisKeys.bruteForce(ip, username);
    const ipKey = redisKeys.bruteForceIp(ip);
    const data = (await getRedis(key)) || { attempts: 0, blockedUntil: 0 };
    const ipData = (await getRedis(ipKey)) || { attempts: 0, blockedUntil: 0 };
    
    data.attempts++;
    ipData.attempts++;
    
    const maxAttempts = parseInt(process.env.BRUTE_FORCE_MAX_ATTEMPTS) || 10;
    const blockTime = parseInt(process.env.BRUTE_FORCE_BLOCK_TIME) || 3600000;
    
    if (data.attempts >= maxAttempts) {
        data.blockedUntil = Date.now() + blockTime;
        await setRedis(key, data, Math.ceil(blockTime / 1000));
    } else {
        await setRedis(key, data, 3600);
    }
    
    if (ipData.attempts >= maxAttempts * 3) {
        ipData.blockedUntil = Date.now() + blockTime * 2;
        await setRedis(ipKey, ipData, Math.ceil(blockTime * 2 / 1000));
    } else {
        await setRedis(ipKey, ipData, 3600);
    }
}

async function resetBruteForce(ip, username) {
    await delRedis(redisKeys.bruteForce(ip, username));
    // Don't delete IP-based tracking immediately to prevent rapid attacks
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
    if (!ua || !UAParser) return 'Unknown';
    try {
        const parser = new UAParser(ua);
        const result = parser.getResult() || {};
        const browser = result.browser?.name || 'Browser';
        const os = result.os?.name || 'OS';
        return `${browser} on ${os}`;
    } catch {
        return 'Unknown';
    }
}

function escapeRegex(str) {
    if (!str || typeof str !== 'string') return '';
    if (str.length > 100) return str.substring(0, 100);
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanDocument(doc) {
    if (!doc || typeof doc !== 'object') return null;
    
    const plain = doc.toObject ? doc.toObject() : doc;
    
    const { _id, createdAt, updatedAt, __v, ...rest } = plain;
    return rest;
}

function cleanDocuments(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(doc => cleanDocument(doc)).filter(Boolean);
}

function safeFormatResponse(doc) {
    if (!doc) return null;
    try {
        const obj = doc.toObject ? doc.toObject() : doc;
        const { pass, ...rest } = obj;
        const id = obj._id?.toString?.() || obj.id || null;
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
    return crypto.createHash('md5').update(str).digest('hex');
}

async function logActivity(userName, userRole, action, details, req = null) {
    const ua = req?.headers?.['user-agent'] || '';
    const logEntry = {
        requestId: req?.requestId || '',
        userName: userName || 'system',
        userRole: userRole || 'system',
        action,
        details: details || '',
        ip: requestIp.getClientIp(req) || req?.ip || '',
        userAgent: ua,
        device: getDeviceInfo(ua)
    };
    try {
        await logQueue.add('log', { logs: [logEntry] }, {
            removeOnComplete: 1000,
            removeOnFail: 5000
        });
    } catch (e) {
        console.error('log fail fallback:', e);
        try {
            await Log.create(logEntry);
        } catch (err) {
            console.error('Fallback log error:', err);
        }
    }
}

// ================= TOKEN FUNCTIONS =================
async function generateTokens(user, deviceId, deviceName, ip) {
    const jti = uuidv4();
    const refreshVersion = uuidv4();
    
    const accessToken = jwt.sign(
        { userId: user._id, role: user.role, name: user.name, jti, tokenVersion: user.tokenVersion },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
    const refreshToken = jwt.sign(
        { userId: user._id, deviceId, version: refreshVersion },
        JWT_REFRESH_SECRET,
        { expiresIn: JWT_REFRESH_EXPIRES_IN }
    );
    const refreshData = {
        userId: user._id,
        deviceId,
        deviceName: deviceName || 'Unknown Device',
        ip: ip || '',
        createdAt: Date.now(),
        version: refreshVersion
    };
    await setRedis(redisKeys.refreshToken(user._id.toString(), refreshToken), refreshData, 7 * 24 * 60 * 60);
    return { accessToken, refreshToken, jti };
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
    body('pass').optional().isLength({ min: 4 }).withMessage('كلمة المرور يجب أن تكون 4 أحرف على الأقل')
];

const validationHandler = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
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

const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        if (!user || !user.enabled) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        if (decoded.tokenVersion !== user.tokenVersion) {
            return res.status(401).json({ error: 'Token invalidated. Please login again.' });
        }
        if (await isTokenBlacklisted(decoded.jti)) {
            return res.status(401).json({ error: 'Token invalidated. Please login again.' });
        }
        req.userId = decoded.userId;
        req.userRole = decoded.role;
        req.userName = decoded.name;
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
const superAdminOnly = roleMiddleware(['مسؤول']);

// ================= DATABASE CONNECTION =================
mongoose.connect(process.env.MONGO_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000
})
    .then(async () => {
        console.log('✅ Connected to MongoDB Atlas');
        await initializeDatabase();
    })
    .catch(err => {
        console.error('❌ MongoDB Connection Error:', err.message);
        process.exit(1);
    });

if (process.env.NODE_ENV === 'development') {
    mongoose.set('debug', true);
}

// ================= INITIALIZE DATABASE =================
async function initializeDatabase() {
    try {
        // Only create default users if explicitly enabled
        if (process.env.CREATE_DEFAULT_USERS === 'true') {
            const adminExists = await User.findOne({ name: 'admin' });
            if (!adminExists) {
                await User.create({ name: 'admin', pass: 'admin123', role: 'مسؤول', enabled: true });
                await User.create({ name: 'editor', pass: 'editor123', role: 'محرر', enabled: true });
                await User.create({ name: 'viewer', pass: 'viewer123', role: 'مشاهد', enabled: true });
                console.log('✅ Default users created');
            }
        }
        
        // Only create default vessels if explicitly enabled
        if (process.env.CREATE_DEFAULT_VESSELS === 'true') {
            const vesselsCount = await Vessel.countDocuments();
            if (vesselsCount === 0) {
                await Vessel.insertMany([
                    { name: "البروق 1", num: "B001", len: 11, reg: "الشمال", zone: "تونس", stat: "صالح", cat: "البروق" },
                    { name: "صقر 1", num: "S001", len: 10, reg: "الساحل", zone: "سوسة", stat: "صالح", cat: "صقور" },
                    { name: "خافرة 1", num: "K001", len: 20, reg: "الوسط", zone: "صفاقس", stat: "معطب", break: "عطل في المحرك", fDate: "2025-03-10", eDate: "2025-04-10", cat: "خوافر" },
                    { name: "زورق 1", num: "Z001", len: 15, reg: "الجنوب", zone: "جربة", stat: "صيانة", break: "صيانة دورية", fDate: "2025-03-15", eDate: "2025-04-05", cat: "زوارق مزدوجة" },
                    { name: "طوافة 1", num: "T001", len: 35, reg: "الشمال", zone: "بنزرت", stat: "صالح", cat: "طوافات" }
                ]);
                console.log('✅ Default vessels created');
            }
        }
        console.log('🎉 Database initialized successfully');
    } catch (error) {
        console.error('❌ Initialization error:', error);
    }
}

// ================= ASYNC HANDLER =================
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// ================= AUTH ROUTES =================
app.post('/api/login', loginLimiter, validateLogin, validationHandler, asyncHandler(async (req, res) => {
    const clientIp = requestIp.getClientIp(req) || req.ip;
    const { name, pass } = req.body;
    if (await checkBruteForce(clientIp, name)) {
        return res.status(429).json({ error: 'Account temporarily locked. Please try again later.' });
    }
    const user = await User.findOne({ name });
    await new Promise(resolve => setTimeout(resolve, 300));
    if (!user || !(await user.comparePassword(pass))) {
        await recordBruteForceAttempt(clientIp, name);
        if (user) {
            user.loginAttempts++;
            if (user.loginAttempts >= (parseInt(process.env.BRUTE_FORCE_MAX_ATTEMPTS) || 10)) {
                user.lockedUntil = new Date(Date.now() + (parseInt(process.env.BRUTE_FORCE_BLOCK_TIME) || 3600000));
            }
            await user.save();
        }
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
        return res.status(429).json({ error: 'Account temporarily locked. Please try again later.' });
    }
    await resetBruteForce(clientIp, name);
    const deviceId = req.headers['x-device-id'] || `web_${Date.now()}_${Math.random()}`;
    const userAgent = req.headers['user-agent'] || '';
    const deviceName = getDeviceInfo(userAgent);
    const { accessToken, refreshToken, jti } = await generateTokens(user, deviceId, deviceName, clientIp);
    user.loginAttempts = 0;
    user.lockedUntil = null;
    user.lastLogin = new Date();
    user.lastLoginIP = clientIp;
    user.lastLoginDevice = deviceName;
    await user.save();
    await logActivity(user.name, user.role, 'تسجيل دخول', `تسجيل دخول من جهاز ${deviceName}`, req);
    res.json({ token: accessToken, refreshToken, name: user.name, role: user.role, deviceId });
}));

app.post('/api/refresh', asyncHandler(async (req, res) => {
    const { refreshToken, deviceId } = req.body;
    const clientIp = requestIp.getClientIp(req) || req.ip;
    if (!refreshToken) return res.status(401).json({ error: 'Invalid credentials' });
    
    const lockAcquired = await acquireLock(`refresh:${refreshToken}`, 5);
    if (!lockAcquired) {
        return res.status(409).json({ error: 'Token already used, please login again' });
    }
    
    try {
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        } catch (error) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const tokenData = await getRedis(redisKeys.refreshToken(decoded.userId, refreshToken));
        if (!tokenData) return res.status(401).json({ error: 'Invalid credentials' });
        const user = await User.findById(decoded.userId);
        if (!user || !user.enabled) return res.status(401).json({ error: 'Invalid credentials' });
        if (tokenData.version !== decoded.version) {
            await delRedis(redisKeys.refreshToken(decoded.userId, refreshToken));
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const newDeviceId = deviceId || `web_${Date.now()}_${Math.random()}`;
        const deviceName = tokenData.deviceName || 'Unknown Device';
        const { accessToken, refreshToken: newRefreshToken, jti } = await generateTokens(user, newDeviceId, deviceName, clientIp);
        await delRedis(redisKeys.refreshToken(decoded.userId, refreshToken));
        res.json({ token: accessToken, refreshToken: newRefreshToken });
    } finally {
        await releaseLock(`refresh:${refreshToken}`);
    }
}));

app.post('/api/logout', authMiddleware, asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        await delRedis(redisKeys.refreshToken(req.userId, refreshToken));
    }
    if (req.jti) {
        await blacklistToken(req.jti, 24 * 60 * 60);
    }
    await logActivity(req.userName, req.userRole, 'تسجيل خروج', 'تم تسجيل الخروج', req);
    res.json({ success: true });
}));

app.post('/api/logout-all', authMiddleware, asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(req.userId, { $inc: { tokenVersion: 1 } });
    await delRedisPattern(`rt:${req.userId}:*`);
    await logActivity(req.userName, req.userRole, 'تسجيل خروج من الكل', 'تم تسجيل الخروج من جميع الأجهزة', req);
    res.json({ success: true });
}));

app.get('/api/verify', authMiddleware, asyncHandler(async (req, res) => {
    const user = await User.findById(req.userId).select('-pass');
    res.json({ valid: true, name: req.userName, role: req.userRole, user });
}));

// ================= VESSEL ROUTES =================
app.get('/api/vessels', asyncHandler(async (req, res) => {
    const cacheKey = redisKeys.cache(`vessels_${generateCacheKey(req.query)}`);
    const cached = await getRedis(cacheKey);
    if (cached) return res.json(cached);
    const { page = 1, limit = 50, search, stat, reg } = req.query;
    const query = {};
    const safeLimit = Math.min(parseInt(limit) || 50, 100);
    if (search && typeof search === 'string') {
        const escapedSearch = escapeRegex(search);
        if (escapedSearch) {
            query.$or = [
                { name: { $regex: escapedSearch, $options: 'i' } },
                { num: { $regex: escapedSearch, $options: 'i' } }
            ];
        }
    }
    if (stat && stat !== 'الكل') query.stat = stat;
    if (reg && reg !== 'الكل') query.reg = reg;
    const skip = (Math.max(1, parseInt(page)) - 1) * safeLimit;
    const [vessels, total] = await Promise.all([
        Vessel.find(query).skip(skip).limit(safeLimit).sort({ createdAt: -1 }),
        Vessel.countDocuments(query)
    ]);
    const result = {
        data: safeFormatArray(vessels),
        pagination: { page: parseInt(page), limit: safeLimit, total, pages: Math.ceil(total / safeLimit) }
    };
    await setRedis(cacheKey, result, 60);
    res.json(result);
}));

app.get('/api/vessels/all', asyncHandler(async (req, res) => {
    const vessels = await Vessel.find();
    res.json(safeFormatArray(vessels));
}));

app.post('/api/vessels', authMiddleware, editorOrAdminMiddleware, validateVessel, validationHandler, asyncHandler(async (req, res) => {
    const vessel = await Vessel.create(req.body);
    await delCachePattern('vessels');
    await logActivity(req.userName, req.userRole, 'إضافة مركب', `أضاف مركب ${vessel.name}`, req);
    res.status(201).json(safeFormatResponse(vessel));
}));

app.put('/api/vessels/:id', validateObjectId, authMiddleware, editorOrAdminMiddleware, validateVessel, validationHandler, asyncHandler(async (req, res) => {
    const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
    await delCachePattern('vessels');
    await logActivity(req.userName, req.userRole, 'تعديل مركب', `عدل مركب ${vessel.name}`, req);
    res.json(safeFormatResponse(vessel));
}));

app.delete('/api/vessels/:id', validateObjectId, authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
    const vessel = await Vessel.findByIdAndDelete(req.params.id);
    if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
    await delCachePattern('vessels
