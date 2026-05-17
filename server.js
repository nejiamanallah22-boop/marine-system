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

const DUMMY_HASH = bcrypt.hashSync('dummy_password_for_timing_attack', 10);
const SHUTDOWN_TIMEOUT = 15000;
const SEARCH_MAX_LENGTH = 50;
const SANITIZE_MAX_DEPTH = 10;

// ================= CONFIG OBJECT =================
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

// Validate secrets length
if (config.jwt.secret && config.jwt.secret.length < 32) {
    logger.warn('JWT secret should be at least 32 characters long');
}
if (config.jwt.refreshSecret && config.jwt.refreshSecret.length < 32) {
    logger.warn('JWT refresh secret should be at least 32 characters long');
}

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
    app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : 'loopback');
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
const getLimiterConfig = (options) => ({
    windowMs: options.windowMs || config.rateLimit.windowMs,
    max: options.max || config.rateLimit.max,
    keyGenerator: options.keyGenerator || (req => requestIp.getClientIp(req) || req.ip || 'global'),
    message: options.message || { error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false,
    ...(rateLimitStore && { store: rateLimitStore })
});

const generalLimiter = rateLimit(getLimiterConfig({
    max: config.rateLimit.max,
    skip: req => req.path === '/api/health'
}));
const loginLimiter = rateLimit(getLimiterConfig({
    max: config.rateLimit.loginMax,
    skipSuccessfulRequests: true,
    keyGenerator: req => requestIp.getClientIp(req) || req.ip
}));
const loginIpLimiter = rateLimit(getLimiterConfig({
    max: config.rateLimit.ipMax,
    keyGenerator: req => requestIp.getClientIp(req) || req.ip
}));

app.use('/api/', generalLimiter);

// ================= QUEUE SETUP =================
let logQueue = null, logWorker = null;
const getBullConnection = () => ({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    connectTimeout: 10000,
    maxRetriesPerRequest: null,
    keepAlive: 10000
});

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
        const logs = job.data.logs.slice(0, 100);
        if (logs.length) await Log.insertMany(logs, { ordered: false });
    }, { connection: bullConnection, concurrency: 5 });
    logWorker.on('error', (err) => logger.error('Worker error:', err));
    logger.info('Queue initialized');
    return true;
};

// ================= MODELS =================
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
    if (this.isModified('pass')) this.pass = await bcrypt.hash(this.pass, 12);
    next();
});
userSchema.methods.comparePassword = async function(candidate) {
    return bcrypt.compare(candidate, this.pass);
};
userSchema.methods.toJSON = function() {
    const obj = this.toObject();
    delete obj.pass;
    return obj;
};
const User = mongoose.model('User', userSchema);

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

const replySchema = new mongoose.Schema({
    message: { type: String, required: true, trim: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    by: { type: String, required: true },
    role: { type: String, required: true }
});
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

// ================= SANITIZATION =================
const sanitizeObj = (obj, depth = 0) => {
    if (depth > SANITIZE_MAX_DEPTH) return obj;
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
        return obj.map(item => typeof item === 'string' ? xss(item) : sanitizeObj(item, depth + 1));
    }
    if (obj instanceof Date || obj instanceof mongoose.Types.ObjectId || Buffer.isBuffer(obj) || obj instanceof RegExp) {
        return obj;
    }
    const sanitized = {};
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (typeof value === 'string') sanitized[key] = xss(value);
        else if (value && typeof value === 'object') sanitized[key] = sanitizeObj(value, depth + 1);
        else sanitized[key] = value;
    }
    return sanitized;
};

// ================= MIDDLEWARE =================
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

app.use((req, res, next) => {
    res.setTimeout(10000, () => res.status(504).json({ error: 'Request timeout' }));
    next();
});
app.use((req, res, next) => {
    req.requestId = uuidv4();
    res.setHeader('X-Request-Id', req.requestId);
    next();
});
function validateObjectId(req, res, next) {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'ID parameter is required' });
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid ID format' });
    next();
}
app.use(cors({
    origin: (origin, cb) => {
        if (!origin && isDev) return cb(null, true);
        if (!origin && isProd) return cb(new Error('Origin required'));
        if (config.cors.allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error('CORS not allowed'));
    },
    credentials: true
}));

// ================= REDIS HELPERS =================
const redisKeys = {
    refreshToken: (userId, tokenHash) => `rt:${userId}:${tokenHash}`,
    usedRefreshToken: (tokenHash) => `used:${tokenHash}`,
    bruteForce: (ip, username) => `bf:${ip}:${(username || '').substring(0, 50)}`,
    bruteForceIp: (ip) => `bfip:${ip}`,
    deviceBruteForce: (fp) => `bfdev:${fp}`,
    cache: (prefix) => `cache:${prefix}`,
    lock: (key) => `lock:${key}`,
    stats: 'stats:cache',
    vesselsVersion: 'vessels:version'
};
async function setRedis(key, val, ttl) { if (!isRedisReady()) return false; try { await redis.setex(key, ttl, JSON.stringify(val)); return true; } catch(e){ return false; } }
async function getRedis(key) { if (!isRedisReady()) return null; try { const d = await redis.get(key); return d ? JSON.parse(d) : null; } catch(e){ return null; } }
async function delRedis(key) { if (isRedisReady()) await redis.del(key).catch(()=>{}); }
async function delRedisPattern(pattern, maxKeys = 1000) { if (!isRedisReady()) return; let deleted = 0, cursor='0'; do { const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100); cursor=next; if(keys.length){ const pipe=redis.pipeline(); keys.forEach(k=>pipe.del(k)); await pipe.exec(); deleted+=keys.length; if(deleted>=maxKeys) break; } } while(cursor!=='0'); }
async function invalidateVesselsCache() { if(isRedisReady()) await redis.incr(redisKeys.vesselsVersion).catch(()=>{}); }
async function acquireLock(key, ttl=15) { if(!isRedisReady()) return true; try { const r=await redis.set(redisKeys.lock(key),'1','NX','EX',ttl); return r==='OK'; } catch(e){ return true; } }
async function releaseLock(key) { if(isRedisReady()) await delRedis(redisKeys.lock(key)); }
async function markRefreshTokenUsed(hash) { if(isRedisReady()) await setRedis(redisKeys.usedRefreshToken(hash), true, 86400); }
async function isRefreshTokenUsed(hash) { if(!isRedisReady()) return false; return !!(await getRedis(redisKeys.usedRefreshToken(hash))); }

// ================= BRUTE FORCE =================
async function checkBruteForce(ip, username, ua) {
    const safeUsername = (username||'').substring(0,50);
    const fp = crypto.createHash('sha256').update(`${ip}:${ua||''}`).digest('hex').substring(0,32);
    const [data, ipData, devData] = await Promise.all([
        getRedis(redisKeys.bruteForce(ip, safeUsername)),
        getRedis(redisKeys.bruteForceIp(ip)),
        getRedis(redisKeys.deviceBruteForce(fp))
    ]);
    return (data?.blockedUntil > Date.now()) || (ipData?.blockedUntil > Date.now()) || (devData?.blockedUntil > Date.now());
}
async function recordBruteForceAttempt(ip, username, ua) {
    const safeUsername = (username||'').substring(0,50);
    const fp = crypto.createHash('sha256').update(`${ip}:${ua||''}`).digest('hex').substring(0,32);
    const key = redisKeys.bruteForce(ip, safeUsername), ipKey = redisKeys.bruteForceIp(ip), devKey = redisKeys.deviceBruteForce(fp);
    let data = (await getRedis(key)) || { attempts:0, blockedUntil:0 };
    let ipData = (await getRedis(ipKey)) || { attempts:0, blockedUntil:0 };
    let devData = (await getRedis(devKey)) || { attempts:0, blockedUntil:0 };
    data.attempts++; ipData.attempts++; devData.attempts++;
    const { maxAttempts, blockTime } = config.bruteForce;
    if(data.attempts >= maxAttempts) { data.blockedUntil = Date.now()+blockTime; await setRedis(key, data, Math.ceil(blockTime/1000)); } else await setRedis(key, data, 900);
    if(ipData.attempts >= maxAttempts*3) { ipData.blockedUntil = Date.now()+blockTime*2; await setRedis(ipKey, ipData, Math.ceil(blockTime*2/1000)); } else await setRedis(ipKey, ipData, 900);
    if(devData.attempts >= maxAttempts*2) { devData.blockedUntil = Date.now()+blockTime; await setRedis(devKey, devData, Math.ceil(blockTime/1000)); } else await setRedis(devKey, devData, 900);
}
async function resetBruteForce(ip, username, ua) {
    const safeUsername = (username||'').substring(0,50);
    const fp = crypto.createHash('sha256').update(`${ip}:${ua||''}`).digest('hex').substring(0,32);
    await delRedis(redisKeys.bruteForce(ip, safeUsername));
    await delRedis(redisKeys.deviceBruteForce(fp));
}

// ================= HELPERS =================
function getCurrentDate() { const d=new Date(); return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`; }
function getCurrentTime() { const d=new Date(); return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`; }
function getDeviceInfo(ua) { if(!ua) return 'Unknown'; try { const p=new UAParser(ua); const r=p.getResult(); return `${r.browser?.name||'Browser'} on ${r.os?.name||'OS'}`; } catch(e){ return 'Unknown'; } }
function escapeRegex(str) { if(!str || typeof str!=='string') return ''; if(str.length>SEARCH_MAX_LENGTH) return str.substring(0,SEARCH_MAX_LENGTH); return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function safeFormatResponse(doc) { if(!doc) return null; try { const obj=doc.toObject?doc.toObject():doc; const {_id,__v,pass,...rest}=obj; return {...rest, id:_id?.toString()}; } catch(e){ return doc; } }
function safeFormatArray(arr) { return Array.isArray(arr)?arr.map(safeFormatResponse):[]; }
function generateCacheKey(obj) { const str=JSON.stringify(Object.keys(obj).sort().reduce((a,k)=>(a[k]=obj[k],a),{})); return crypto.createHash('sha256').update(str).digest('hex'); }
async function logActivity(userName, userRole, action, details, req=null) {
    const entry={ requestId:req?.requestId||'', userName:userName||'system', userRole:userRole||'system', action, details:(details||'').substring(0,500), ip:requestIp.getClientIp(req)||req?.ip||'', userAgent:req?.headers?.['user-agent']||'', device:getDeviceInfo(req?.headers?.['user-agent']) };
    if(logQueue && isRedisReady()) logQueue.add('log', { logs:[entry] }).catch(e=>logger.error('Queue add error'));
    else Log.create(entry).catch(e=>logger.error('Log create error'));
}

// ================= TOKEN FUNCTIONS =================
async function generateTokens(user, deviceId, deviceName, ip, ua) {
    const jti=uuidv4(), refreshVersion=uuidv4();
    const accessToken=jwt.sign({ userId:user._id, role:user.role, name:user.name, jti, tokenVersion:user.tokenVersion }, config.jwt.secret, { expiresIn:config.jwt.expiresIn, algorithm:config.jwt.algorithm, issuer:config.jwt.issuer, audience:config.jwt.audience });
    const refreshToken=jwt.sign({ userId:user._id, deviceId, version:refreshVersion }, config.jwt.refreshSecret, { expiresIn:config.jwt.refreshExpiresIn, algorithm:config.jwt.algorithm, issuer:config.jwt.issuer, audience:config.jwt.audience });
    const hash=crypto.createHash('sha256').update(refreshToken).digest('hex');
    await setRedis(redisKeys.refreshToken(user._id.toString(), hash), { userId:user._id, deviceId, deviceName, ip, userAgent:ua, createdAt:Date.now(), version:refreshVersion }, 7*24*3600);
    return { accessToken, refreshToken, jti, hash };
}

// ================= VALIDATION =================
const validateLogin = [ body('name').trim().notEmpty(), body('pass').notEmpty() ];
const validateVessel = [ body('name').trim().isLength({ min:2 }), body('len').optional().isInt({ min:0, max:100 }), body('stat').optional().isIn(['صالح','معطب','صيانة']) ];
const validateTicket = [ body('subject').trim().isLength({ min:3 }), body('message').trim().isLength({ min:5 }) ];
const validateUser = [ body('name').trim().isLength({ min:3 }), body('pass').optional().isLength({ min:8 }).matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])?[A-Za-z\d@$!%*?&]{8,}$/) ];
const validationHandler = (req,res,next)=>{ const err=validationResult(req); if(!err.isEmpty()) return res.status(400).json({ errors:err.array() }); next(); };

// ================= AUTH MIDDLEWARE =================
const authMiddleware = async (req,res,next)=>{
    const token = req.headers.authorization?.split(' ')[1];
    if(!token) return res.status(401).json({ error:'No token' });
    try {
        const decoded = jwt.verify(token, config.jwt.secret, { algorithms:[config.jwt.algorithm], issuer:config.jwt.issuer, audience:config.jwt.audience });
        const user = await User.findById(decoded.userId).select('+tokenVersion');
        if(!user || !user.enabled || decoded.tokenVersion !== user.tokenVersion) return res.status(401).json({ error:'Invalid token' });
        req.user = user; req.userId = decoded.userId; req.userRole = user.role; req.userName = user.name;
        next();
    } catch(e) { res.status(401).json({ error:'Invalid token' }); }
};
const adminMiddleware = (req,res,next)=>{ if(req.userRole !== 'مسؤول') return res.status(403).json({ error:'Access denied' }); next(); };
const editorOrAdmin = (req,res,next)=>{ if(req.userRole !== 'مسؤول' && req.userRole !== 'محرر') return res.status(403).json({ error:'Access denied' }); next(); };

// ================= HEALTH CHECK =================
app.get('/api/health', (req,res)=>{ res.json({ status:'OK', timestamp:new Date().toISOString(), mongo:mongoose.connection.readyState===1, redis:isRedisReady(), queue:logQueue!==null }); });

// ================= AUTH ROUTES =================
app.post('/api/login', loginLimiter, loginIpLimiter, validateLogin, validationHandler, async (req,res)=>{
    const ip = requestIp.getClientIp(req)||req.ip, {name,pass}=req.body, ua=req.headers['user-agent']||'';
    if(await checkBruteForce(ip, name, ua)) return res.status(429).json({ error:'Account locked' });
    const user = await User.findOne({ name });
    let isValid = user ? await user.comparePassword(pass) : await bcrypt.compare(pass, DUMMY_HASH);
    if(!user || !isValid){
        await recordBruteForceAttempt(ip, name, ua);
        if(user){ user.loginAttempts++; if(user.loginAttempts>=config.bruteForce.maxAttempts) user.lockedUntil = new Date(Date.now()+config.bruteForce.blockTime); await user.save(); }
        return res.status(401).json({ error:'Invalid credentials' });
    }
    if(user.lockedUntil && user.lockedUntil>new Date()) return res.status(429).json({ error:'Account locked' });
    await resetBruteForce(ip, name, ua);
    const deviceId = crypto.randomUUID(), deviceName = getDeviceInfo(ua);
    const { accessToken, refreshToken } = await generateTokens(user, deviceId, deviceName, ip, ua);
    user.loginAttempts=0; user.lockedUntil=null; user.lastLogin=new Date(); user.lastLoginIP=ip; user.lastLoginDevice=deviceName; user.lastLoginDeviceId=deviceId; user.lastLoginUserAgent=ua;
    await user.save();
    await logActivity(user.name, user.role, 'تسجيل دخول', `من جهاز ${deviceName}`, req);
    res.json({ token:accessToken, refreshToken, name:user.name, role:user.role, deviceId });
});
app.post('/api/refresh', async (req,res)=>{
    const { refreshToken, deviceId } = req.body;
    if(!refreshToken||!deviceId) return res.status(401).json({ error:'Missing token' });
    const hash=crypto.createHash('sha256').update(refreshToken).digest('hex');
    if(await isRefreshTokenUsed(hash)) return res.status(401).json({ error:'Token reused' });
    const lock = await acquireLock(`refresh:${hash}`,15);
    if(!lock) return res.status(409).json({ error:'Try again' });
    try{
        const decoded=jwt.verify(refreshToken, config.jwt.refreshSecret, { algorithms:[config.jwt.algorithm], issuer:config.jwt.issuer, audience:config.jwt.audience });
        const tokenData=await getRedis(redisKeys.refreshToken(decoded.userId, hash));
        if(!tokenData||tokenData.deviceId!==deviceId||tokenData.version!==decoded.version) return res.status(401).json({ error:'Invalid token' });
        const user=await User.findById(decoded.userId);
        if(!user||!user.enabled) return res.status(401).json({ error:'User disabled' });
        await markRefreshTokenUsed(hash); await delRedis(redisKeys.refreshToken(decoded.userId, hash));
        const { accessToken, refreshToken: newRt } = await generateTokens(user, deviceId, tokenData.deviceName, tokenData.ip, tokenData.userAgent);
        res.json({ token:accessToken, refreshToken:newRt, deviceId });
    } catch(e){ res.status(401).json({ error:'Invalid token' }); }
    finally{ await releaseLock(`refresh:${hash}`); }
});
app.post('/api/logout', authMiddleware, async (req,res)=>{
    const { refreshToken }=req.body;
    if(refreshToken){ const hash=crypto.createHash('sha256').update(refreshToken).digest('hex'); await markRefreshTokenUsed(hash); await delRedis(redisKeys.refreshToken(req.userId, hash)); }
    await logActivity(req.userName, req.userRole, 'تسجيل خروج', '', req);
    res.json({ success:true });
});
app.post('/api/logout-all', authMiddleware, async (req,res)=>{
    const lockKey=`logoutall:${req.userId}`;
    const lock=await acquireLock(lockKey,10);
    if(!lock) return res.status(409).json({ error:'Try again' });
    try{
        await User.findByIdAndUpdate(req.userId, { $inc:{ tokenVersion:1 } });
        await delRedisPattern(`rt:${req.userId}:*`);
        await logActivity(req.userName, req.userRole, 'تسجيل خروج من الكل', '', req);
        res.json({ success:true });
    } finally{ await releaseLock(lockKey); }
});
app.get('/api/verify', authMiddleware, (req,res)=>{
    const user=req.user.toJSON(); delete user.pass;
    res.json({ valid:true, name:req.userName, role:req.userRole, user });
});

// ================= VESSEL ROUTES (modified for old frontend) =================
app.get('/api/vessels', async (req,res)=>{
    const cacheVersion = await getRedis(redisKeys.vesselsVersion);
    const version = cacheVersion || 1;
    const cacheKey = `cache:vessels:${version}:${generateCacheKey(req.query)}`;
    const cached = await getRedis(cacheKey);
    if (cached) return res.json(cached.data);   // RETURN ONLY ARRAY (compatibility)
    const { page=1, limit=50, search, stat, reg, useTextSearch='false' } = req.query;
    const query = {};
    const safeLimit = Math.min(parseInt(limit)||50,100);
    const pageNum = Math.max(1, parseInt(page)||1);
    const skip = (pageNum-1)*safeLimit;
    if(search && typeof search==='string' && search.length<=SEARCH_MAX_LENGTH){
        if(useTextSearch==='true') query.$text = { $search: search };
        else { const esc=escapeRegex(search); if(esc) query.$or = [{ name: { $regex: `^${esc}`, $options:'i' } }, { num: { $regex: `^${esc}`, $options:'i' } }]; }
    }
    if(stat && stat!=='الكل') query.stat=stat;
    if(reg && reg!=='الكل') query.reg=reg;
    let q = Vessel.find(query);
    if(useTextSearch!=='true') q = q.sort({ createdAt:-1 });
    else q = q.sort({ score: { $meta:"textScore" } });
    const [vessels, total] = await Promise.all([ q.skip(skip).limit(safeLimit), Vessel.countDocuments(query) ]);
    const result = { data: safeFormatArray(vessels), pagination: { page:pageNum, limit:safeLimit, total, pages: Math.ceil(total/safeLimit) } };
    await setRedis(cacheKey, result, 60);
    res.json(result.data);   // RETURN ONLY ARRAY
});
app.get('/api/vessels/all-paginated', async (req,res)=>{
    const { page=1, limit=100 } = req.query;
    const safeLimit = Math.min(parseInt(limit)||100,500);
    const pageNum = Math.max(1, parseInt(page)||1);
    const vessels = await Vessel.find().skip((pageNum-1)*safeLimit).limit(safeLimit).sort({ name:1 });
    res.json(safeFormatArray(vessels));   // RETURN ARRAY
});
app.get('/api/vessels/:id', validateObjectId, async (req,res)=>{ const v=await Vessel.findById(req.params.id); if(!v) return res.status(404).json({ error:'Not found' }); res.json(safeFormatResponse(v)); });
app.post('/api/vessels', authMiddleware, editorOrAdmin, validateVessel, validationHandler, async (req,res)=>{ const v=await Vessel.create(req.body); await invalidateVesselsCache(); await logActivity(req.userName, req.userRole, 'إضافة مركب', `أضاف ${v.name}`, req); res.status(201).json(safeFormatResponse(v)); });
app.put('/api/vessels/:id', validateObjectId, authMiddleware, editorOrAdmin, validateVessel, validationHandler, async (req,res)=>{ const v=await Vessel.findByIdAndUpdate(req.params.id, req.body, { new:true, runValidators:true }); if(!v) return res.status(404).json({ error:'Not found' }); await invalidateVesselsCache(); await logActivity(req.userName, req.userRole, 'تعديل مركب', `عدل ${v.name}`, req); res.json(safeFormatResponse(v)); });
app.delete('/api/vessels/:id', validateObjectId, authMiddleware, adminMiddleware, async (req,res)=>{ const v=await Vessel.findByIdAndDelete(req.params.id); if(!v) return res.status(404).json({ error:'Not found' }); await invalidateVesselsCache(); await logActivity(req.userName, req.userRole, 'حذف مركب', `حذف ${v.name}`, req); res.json({ success:true }); });

// ================= TICKET ROUTES (modified for old frontend) =================
app.get('/api/tickets', authMiddleware, async (req,res)=>{
    const { page=1, limit=20, status } = req.query;
    const query = {};
    if(status && status!=='الكل') query.status=status;
    if(req.userRole==='مشاهد') query.userName=req.userName;
    const safeLimit = Math.min(parseInt(limit)||20,50);
    const pageNum = Math.max(1, parseInt(page)||1);
    const skip = (pageNum-1)*safeLimit;
    const [tickets, total] = await Promise.all([ Ticket.find(query).skip(skip).limit(safeLimit).sort({ createdAt:-1 }), Ticket.countDocuments(query) ]);
    res.json(safeFormatArray(tickets));   // RETURN ARRAY
});
app.get('/api/tickets/:id', validateObjectId, authMiddleware, async (req,res)=>{ const t=await Ticket.findById(req.params.id); if(!t) return res.status(404).json({ error:'Not found' }); if(req.userRole==='مشاهد' && t.userName!==req.userName) return res.status(403).json({ error:'Access denied' }); res.json(safeFormatResponse(t)); });
app.post('/api/tickets', authMiddleware, validateTicket, validationHandler, async (req,res)=>{
    const ticket = await Ticket.create({ userName:req.userName, userRole:req.userRole, subject:req.body.subject, message:req.body.message, date:getCurrentDate(), time:getCurrentTime(), status:'قيد المعالجة' });
    await logActivity(req.userName, req.userRole, 'إنشاء تذكرة', `موضوع: ${ticket.subject}`, req);
    res.status(201).json(safeFormatResponse(ticket));
});
app.post('/api/tickets/:id/reply', validateObjectId, authMiddleware, async (req,res)=>{
    const { message } = req.body;
    if(!message || message.trim().length<2) return res.status(400).json({ error:'Reply too short' });
    const ticket = await Ticket.findById(req.params.id);
    if(!ticket) return res.status(404).json({ error:'Not found' });
    if(req.userRole==='مشاهد' && ticket.userName!==req.userName) return res.status(403).json({ error:'Access denied' });
    ticket.replies.push({ message:message.trim(), date:getCurrentDate(), time:getCurrentTime(), by:req.userName, role:req.userRole });
    ticket.status = 'تم الرد';
    await ticket.save();
    await logActivity(req.userName, req.userRole, 'رد على تذكرة', `تذكرة: ${ticket.subject}`, req);
    res.json(safeFormatResponse(ticket));
});
app.put('/api/tickets/:id/close', validateObjectId, authMiddleware, async (req,res)=>{
    const ticket = await Ticket.findById(req.params.id);
    if(!ticket) return res.status(404).json({ error:'Not found' });
    if(req.userRole==='مشاهد' && ticket.userName!==req.userName) return res.status(403).json({ error:'Access denied' });
    ticket.status = 'مغلقة';
    await ticket.save();
    await logActivity(req.userName, req.userRole, 'إغلاق تذكرة', `تذكرة: ${ticket.subject}`, req);
    res.json({ success:true });
});

// ================= USER MANAGEMENT (modified for old frontend) =================
app.get('/api/users', authMiddleware, adminMiddleware, async (req,res)=>{
    const users = await User.find().select('-pass').sort({ createdAt:-1 });
    res.json(safeFormatArray(users));   // RETURN ARRAY
});
app.post('/api/users', authMiddleware, adminMiddleware, validateUser, validationHandler, async (req,res)=>{
    const existing = await User.findOne({ name: req.body.name });
    if(existing) return res.status(400).json({ error:'User exists' });
    const user = await User.create({ name:req.body.name, pass:req.body.pass, role:req.body.role||'مشاهد', enabled:req.body.enabled!==undefined?req.body.enabled:true });
    await logActivity(req.userName, req.userRole, 'إنشاء مستخدم', `مستخدم: ${user.name}`, req);
    res.status(201).json(safeFormatResponse(user));
});
app.put('/api/users/:id', validateObjectId, authMiddleware, adminMiddleware, validateUser, validationHandler, async (req,res)=>{
    const user = await User.findById(req.params.id);
    if(!user) return res.status(404).json({ error:'User not found' });
    if(req.body.name && req.body.name!==user.name){ const dup=await User.findOne({ name:req.body.name }); if(dup) return res.status(400).json({ error:'Name exists' }); user.name=req.body.name; }
    if(req.body.pass){ user.pass=req.body.pass; user.tokenVersion++; }
    if(req.body.role) user.role=req.body.role;
    if(req.body.enabled!==undefined && user.enabled!==req.body.enabled){ user.enabled=req.body.enabled; if(!user.enabled) user.tokenVersion++; }
    await user.save();
    if(!user.enabled||req.body.pass) await delRedisPattern(`rt:${user._id}:*`);
    await logActivity(req.userName, req.userRole, 'تعديل مستخدم', `مستخدم: ${user.name}`, req);
    res.json(safeFormatResponse(user));
});
app.delete('/api/users/:id', validateObjectId, authMiddleware, adminMiddleware, async (req,res)=>{
    if(req.userId===req.params.id) return res.status(400).json({ error:'Cannot delete self' });
    const user = await User.findByIdAndDelete(req.params.id);
    if(!user) return res.status(404).json({ error:'User not found' });
    await delRedisPattern(`rt:${user._id}:*`);
    await logActivity(req.userName, req.userRole, 'حذف مستخدم', `مستخدم: ${user.name}`, req);
    res.json({ success:true });
});

// ================= LOGS & STATS =================
app.get('/api/logs', authMiddleware, adminMiddleware, async (req,res)=>{
    const { page=1, limit=50, userName, action } = req.query;
    const query={};
    if(userName) query.userName=userName;
    if(action) query.action=action;
    const safeLimit=Math.min(parseInt(limit)||50,100);
    const pageNum=Math.max(1, parseInt(page)||1);
    const skip=(pageNum-1)*safeLimit;
    const [logs, total] = await Promise.all([ Log.find(query).skip(skip).limit(safeLimit).sort({ createdAt:-1 }), Log.countDocuments(query) ]);
    res.json({ data: safeFormatArray(logs), pagination: { page:pageNum, limit:safeLimit, total, pages: Math.ceil(total/safeLimit) } });
});
app.get('/api/stats', authMiddleware, adminMiddleware, async (req,res)=>{
    const cached = await getRedis(redisKeys.stats);
    if(cached) return res.json(cached);
    const [vessels, tickets, users, openTickets] = await Promise.all([ Vessel.countDocuments(), Ticket.countDocuments(), User.countDocuments(), Ticket.countDocuments({ status: { $ne: 'مغلقة' } }) ]);
    const vesselsByStat = await Vessel.aggregate([{ $group: { _id:'$stat', count:{$sum:1} } }]);
    const result = { vessels, tickets, users, openTickets, vesselsByStat: vesselsByStat.reduce((acc,curr)=>(acc[curr._id]=curr.count,acc),{}), cachedAt: new Date().toISOString() };
    await setRedis(redisKeys.stats, result, 300);
    res.json(result);
});

// ================= ERROR HANDLING =================
app.use((err,req,res,next)=>{
    logger.error(err);
    if(err.code===11000) return res.status(400).json({ error:'Duplicate key' });
    if(err.name==='ValidationError') return res.status(400).json({ error:err.message });
    res.status(500).json({ error:'Internal server error' });
});

// ================= DATABASE CONNECTION & START =================
mongoose.connect(config.mongodb.uri, config.mongodb.options)
    .then(async () => {
        logger.info('MongoDB connected');
        if(process.env.CREATE_DEFAULT_USERS==='true'){
            const admin = await User.findOne({ name:'admin' });
            if(!admin){
                await User.create({ name:'admin', pass:'Admin@123456', role:'مسؤول', enabled:true });
                await User.create({ name:'editor', pass:'Editor@123456', role:'محرر', enabled:true });
                await User.create({ name:'viewer', pass:'Viewer@123456', role:'مشاهد', enabled:true });
                logger.info('Default users created');
            }
        }
        if(process.env.CREATE_DEFAULT_VESSELS==='true'){
            const count = await Vessel.countDocuments();
            if(count===0){
                await Vessel.insertMany([
                    { name:"البروق 1", num:"B001", len:11, reg:"الشمال", stat:"صالح", cat:"البروق" },
                    { name:"صقر 1", num:"S001", len:10, reg:"الساحل", stat:"صالح", cat:"صقور" },
                    { name:"خافرة 1", num:"K001", len:20, reg:"الوسط", stat:"معطب", cat:"خوافر" },
                    { name:"زورق 1", num:"Z001", len:15, reg:"الجنوب", stat:"صيانة", cat:"زوارق" },
                    { name:"طوافة 1", num:"T001", len:35, reg:"الشمال", stat:"صالح", cat:"طوافات" }
                ]);
                logger.info('Default vessels created');
            }
        }
        const server = app.listen(PORT, '0.0.0.0', () => {
            logger.info(`🚀 Server running on port ${PORT}`);
            logger.info(`📡 http://localhost:${PORT}`);
        });
        process.on('SIGTERM', () => { server.close(() => { mongoose.connection.close(); if(redis) redis.quit(); process.exit(0); }); });
    })
    .catch(err => { logger.error('MongoDB connection error:', err.message); process.exit(1); });

module.exports = app;
