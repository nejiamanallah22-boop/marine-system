// ============================================================
// 🚢 MARINE SYSTEM - PROFESSIONAL SERVER v10.8.1 (FIXED)
// 🔐 JWT + REFRESH + CSRF + SESSION + RBAC + MongoDB
// 🤖 AI + IMPORT + SETTINGS + LOGO
// 📌 OWNERSHIP + 👤 USER BADGE + 📍 FORCE GPS v6
// ✨ v10.8.1: All critical bugs fixed + Memory leak fixes +
//             CSRF hardening + res.sendFile loop fix + Rate limit tune
// ============================================================
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('=========================================');
console.log('🚢 MARINE SYSTEM v10.8.1 - STARTING');
console.log('=========================================');
console.log('🔍 __dirname:', __dirname);
console.log('🔍 Node version:', process.version);

function findModelsPath() {
    const candidates = [
        path.join(__dirname, 'models'), path.join(__dirname, '..', 'models'),
        path.join(process.cwd(), 'models'), path.join(process.cwd(), 'src', 'models'),
        '/opt/render/project/src/models', '/opt/render/project/models', './models'
    ];
    const REQUIRED = ['index.js', 'User.js', 'Vessel.js', 'Maintenance.js'];
    for (const c of candidates) {
        try {
            const r = path.resolve(c);
            if (!fs.existsSync(r)) continue;
            const files = fs.readdirSync(r);
            if (REQUIRED.every(f => files.includes(f))) { console.log(`✅ Models: ${r}`); return r; }
        } catch (e) {}
    }
    return null;
}
function loadModels() {
    const p = findModelsPath();
    if (!p) { console.error('❌ FATAL: models dir missing'); process.exit(1); }
    try {
        const m = require(p);
        if (!m.User || !m.Vessel || !m.Maintenance) throw new Error('Missing models');
        console.log('✅ Models loaded'); return m;
    } catch (e) { console.error('❌ Models:', e.message); process.exit(1); }
}

let User, Vessel, Maintenance, Log, Ticket, Note, Notification, UserSettings, SystemLogo;
try {
    const m = loadModels();
    User = m.User; Vessel = m.Vessel; Maintenance = m.Maintenance; Log = m.Log; Ticket = m.Ticket;
    Note = m.Note || null; Notification = m.Notification || null;
    UserSettings = m.UserSettings || null; SystemLogo = m.SystemLogo || null;
    console.log('📦 Optional:', 'Note=' + (Note?'✅':'❌'), 'Notif=' + (Notification?'✅':'❌'),
        'Settings=' + (UserSettings?'✅':'❌'), 'Logo=' + (SystemLogo?'✅':'❌'));
} catch (e) { console.error('❌', e.message); process.exit(1); }

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const compression = require('compression');
const nodemailer = require('nodemailer');

const fetchSafe = (() => {
    if (typeof globalThis.fetch === 'function') return globalThis.fetch;
    try { return require('node-fetch'); } catch (e) { return null; }
})();

const aiAndImportRoutes = require('./routes/ai-and-import');
const settingsRoutes = require('./routes/settings');

let createDOMPurify = null;
try { createDOMPurify = require('isomorphic-dompurify'); } catch (e) {}

// ============ REDIS ============
let redisClient = null, RedisStore = null, redisAvailable = false, redisInitPromise = null;

function normalizeRedisUrl(u) {
    if (!u || typeof u !== 'string') return u;
    if (u.startsWith('rediss://')) return u;
    const tls = ['upstash.io','redislabs.com','redis-cloud.com','aivencloud.com','digitalocean.com'];
    if (tls.some(h => u.includes(h)) && u.startsWith('redis://')) return u.replace(/^redis:\/\//,'rediss://');
    return u;
}
async function initRedis() {
    if (redisInitPromise) return redisInitPromise;
    redisInitPromise = (async () => {
        if (!process.env.REDIS_URL) { console.log('ℹ️ REDIS_URL unset — Memory'); return null; }
        try {
            const { createClient } = require('redis');
            let CR; try { CR = require('connect-redis'); } catch (e) {}
            RedisStore = CR ? (CR.default || CR) : null;
            const url = normalizeRedisUrl(process.env.REDIS_URL);
            const isTLS = url.startsWith('rediss://');
            redisClient = createClient({
                url,
                socket: {
                    tls: isTLS, rejectUnauthorized: false,
                    reconnectStrategy: (r) => r > 10 ? new Error('limit') : Math.min(r*200,3000),
                    connectTimeout: 8000, keepAlive: 5000
                }
            });
            redisClient.on('error', () => { redisAvailable = false; });
            redisClient.on('ready', () => { console.log('✅ Redis ready'); redisAvailable = true; });
            redisClient.on('end', () => { redisAvailable = false; });

            // ✅ FIX #9: proper timeout with unref
            let timeoutId;
            const timeoutPromise = new Promise((_, rej) => {
                timeoutId = setTimeout(() => rej(new Error('timeout')), 15000);
                if (timeoutId.unref) timeoutId.unref();
            });
            try {
                await Promise.race([redisClient.connect(), timeoutPromise]);
                clearTimeout(timeoutId);
            } catch (e) {
                clearTimeout(timeoutId);
                throw e;
            }
            redisAvailable = true; return redisClient;
        } catch (e) {
            console.warn('⚠️ Redis:', e.message); redisAvailable = false;
            try { if (redisClient?.isOpen) await redisClient.quit(); } catch(_) {}
            redisClient = null; return null;
        }
    })();
    return redisInitPromise;
}
function getRedisClient() { return redisAvailable ? redisClient : null; }
function isRedisAvailable() { return !!(redisAvailable && redisClient); }
async function redisSafe(fn, fallback = null) {
    if (!isRedisAvailable()) return fallback;
    try { return await fn(redisClient); } catch (e) { return fallback; }
}

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const isProduction = process.env.NODE_ENV === 'production';
const COOKIE_SAMESITE = process.env.SESSION_COOKIE_SAMESITE || 'lax';

app.disable('x-powered-by');
app.set('trust proxy', isProduction ? 1 : 0);

// ============ OWNERSHIP HEADERS ============
app.use((req, res, next) => {
    res.setHeader('X-System-Name', 'Marine System');
    res.setHeader('X-System-Version', '10.8.1');
    res.setHeader('X-Developer', 'Aman Allah Naji');
    res.setHeader('X-Organization', 'Direction des Moyens Maritimes - Garde Nationale Tunisienne');
    res.setHeader('X-Copyright', 'Copyright 2024-' + new Date().getFullYear() + ' Aman Allah Naji');
    next();
});

function generateSecret(b=64) { return crypto.randomBytes(b).toString('hex'); }

if (isProduction) {
    const req = ['JWT_SECRET','JWT_REFRESH_SECRET','SESSION_SECRET'];
    const miss = req.filter(k => !process.env[k] || process.env[k].length < 32);
    if (miss.length) { console.error('❌ Missing secrets:', miss.join(',')); process.exit(1); }
}

const JWT_SECRET = process.env.JWT_SECRET || generateSecret(64);
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || generateSecret(64);
const SESSION_SECRET = process.env.SESSION_SECRET || generateSecret(64);

const ACCESS_TOKEN_EXPIRES = '15m';
const REFRESH_TOKEN_EXPIRES = '7d';
const ACCESS_TOKEN_MAX_AGE = 15*60*1000;
const REFRESH_TOKEN_MAX_AGE = 7*24*60*60*1000;
const CSRF_MAX_AGE = 8*60*60*1000;
const RESET_TOKEN_TTL = 60*60*1000;

// ✅ FIX #2 & #3: Memory caps
const MAX_MEMORY_SESSIONS = 10000;
const MAX_MEMORY_RESET_TOKENS = 5000;
const MAX_MEMORY_REVOKED = 50000;
const MAX_MEMORY_LOCATIONS = 5000;

function isStrongPassword(p) {
    if (typeof p !== 'string' || p.length < 12) return false;
    const c = [/[A-Z]/.test(p), /[a-z]/.test(p), /\d/.test(p),
        /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p)];
    return c.filter(Boolean).length >= 3;
}
function generateStrongPassword(len=20) {
    const U='ABCDEFGHIJKLMNOPQRSTUVWXYZ', L='abcdefghijklmnopqrstuvwxyz',
        N='0123456789', S='!@#$%^&*()_+-=', A=U+L+N+S;
    const c = [U[crypto.randomInt(U.length)], L[crypto.randomInt(L.length)],
        N[crypto.randomInt(N.length)], S[crypto.randomInt(S.length)]];
    while (c.length < len) c.push(A[crypto.randomInt(A.length)]);
    for (let i=c.length-1;i>0;i--) { const j=crypto.randomInt(i+1); [c[i],c[j]]=[c[j],c[i]]; }
    return c.join('');
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_NAME = process.env.ADMIN_NAME || 'أمان الله ناجي';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@marine-system.local';
const ALLOW_ADMIN_RESET = process.env.ALLOW_ADMIN_RESET === 'true'; // ✅ FIX #10: default false

let ADMIN_PASSWORD, ADMIN_PASSWORD_GENERATED = false;
if (process.env.ADMIN_PASSWORD) {
    if (!isStrongPassword(process.env.ADMIN_PASSWORD)) {
        console.error('❌ ADMIN_PASSWORD weak');
        if (isProduction) process.exit(1);
        ADMIN_PASSWORD = generateStrongPassword(); ADMIN_PASSWORD_GENERATED = true;
    } else ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
} else {
    if (isProduction) { console.error('❌ ADMIN_PASSWORD required'); process.exit(1); }
    ADMIN_PASSWORD = generateStrongPassword(); ADMIN_PASSWORD_GENERATED = true;
    // ✅ FIX #12: don't print password in production
    if (!isProduction) console.log('🔑 DEV PASSWORD:', ADMIN_PASSWORD);
}
if (isProduction && (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64)) {
    console.error('❌ ENCRYPTION_KEY must be 64 hex'); process.exit(1);
}
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

function randomId(b=32) { return crypto.randomBytes(b).toString('hex'); }
function hashToken(t) { return crypto.createHash('sha256').update(t).digest('hex'); }
function safeEqual(a,b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const A = Buffer.from(a), B = Buffer.from(b);
    return A.length === B.length && crypto.timingSafeEqual(A,B);
}

// ✅ FIX #5: strict ID query with length check
function buildIdQuery(idParam) {
    if (!idParam || typeof idParam !== 'string') return null;
    const t = idParam.trim();
    if (!t || t.length > 100) return null;
    if (/^[a-f0-9]{24}$/i.test(t) && mongoose.Types.ObjectId.isValid(t)) return { _id: t };
    if (/^[a-zA-Z0-9_-]{1,64}$/.test(t)) return { id: t };
    return null;
}

const PURIFY_CONFIG = { ALLOWED_TAGS: [], ALLOWED_ATTR: [], KEEP_CONTENT: true };
function sanitizeString(v) {
    if (typeof v !== 'string') return v;
    if (createDOMPurify) { try { return createDOMPurify.sanitize(v, PURIFY_CONFIG).trim(); } catch (e) {} }
    return v.replace(/[<>]/g,'').replace(/javascript:/gi,'').replace(/on\w+=/gi,'').trim();
}
function sanitizeDeep(o, d=0) {
    if (d > 10) return o;
    if (o == null) return o;
    if (typeof o === 'string') return sanitizeString(o);
    if (typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(x => sanitizeDeep(x, d+1));
    const c = {};
    for (const k of Object.keys(o)) {
        if (['__proto__','constructor','prototype'].includes(k)) continue;
        c[k] = sanitizeDeep(o[k], d+1);
    }
    return c;
}
function xssSanitizer(req, res, next) {
    try {
        if (req.body && typeof req.body === 'object') req.body = sanitizeDeep(req.body);
        if (req.query && typeof req.query === 'object') req.query = sanitizeDeep(req.query);
        if (req.params && typeof req.params === 'object') req.params = sanitizeDeep(req.params);
    } catch (e) {}
    next();
}

// ============ EMAIL ============
let emailTransporter = null, emailInitPromise = null;
function isValidEmail(e) {
    return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
}
async function setupEmailService() {
    if (process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY) {
        console.log('✅ Mailjet API'); return null;
    }
    try {
        if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            const t = nodemailer.createTransport({
                host: process.env.EMAIL_HOST, port: Number(process.env.EMAIL_PORT) || 587,
                secure: process.env.EMAIL_SECURE === 'true',
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
                tls: { rejectUnauthorized: false }, connectionTimeout: 10000,
                pool: true, maxConnections: 3
            });
            await t.verify(); console.log('✅ SMTP ready'); return t;
        }
        if (isProduction) return null;
        const acc = await nodemailer.createTestAccount();
        const t = nodemailer.createTransport({
            host:'smtp.ethereal.email', port:587, secure:false,
            auth:{user:acc.user, pass:acc.pass}
        });
        await t.verify(); console.log('✅ Ethereal'); return t;
    } catch (e) { console.error('❌ Email:', e.message); return null; }
}
async function initEmailService() {
    if (emailInitPromise) return emailInitPromise;
    emailInitPromise = setupEmailService(); return emailInitPromise;
}
async function withRetry(fn, n=3, d=500) {
    let last;
    for (let i=0;i<n;i++) { try { return await fn(); } catch(e) {
        last = e; if (i < n-1) await new Promise(r => setTimeout(r, d*Math.pow(2,i)));
    }}
    throw last;
}
async function sendEmail(to, subj, html) {
    if (!isValidEmail(to)) { console.warn('⚠️ Invalid email:', to); return null; } // ✅ FIX #13
    const k1 = process.env.MAILJET_API_KEY, k2 = process.env.MAILJET_SECRET_KEY;
    if (k1 && k2) {
        if (!fetchSafe) return null;
        try {
            const auth = Buffer.from(`${k1}:${k2}`).toString('base64');
            return await withRetry(async () => {
                const r = await fetchSafe('https://api.mailjet.com/v3.1/send', {
                    method: 'POST',
                    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ Messages: [{
                        From: { Email: process.env.EMAIL_FROM || 'nejiamanallah22@gmail.com',
                                Name: process.env.EMAIL_FROM_NAME || 'منظومة الوسائل البحرية' },
                        To: [{ Email: to }], Subject: subj, HTMLPart: html
                    }]})
                });
                if (!r.ok) throw new Error(`${r.status}`);
                return r.json();
            });
        } catch (e) { console.error('❌ Mailjet:', e.message); return null; }
    }
    if (!emailTransporter) emailTransporter = await initEmailService();
    if (!emailTransporter) return null;
    try {
        const from = process.env.EMAIL_FROM || 'no-reply@marine-system.local';
        return await withRetry(() => emailTransporter.sendMail({ from, to, subject: subj, html }));
    } catch (e) { console.error('❌ SMTP:', e.message); return null; }
}
setTimeout(() => { initEmailService().then(t => { emailTransporter = t; }).catch(()=>{}); }, 100);

// ============ SECURITY MIDDLEWARE ============
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'","'unsafe-inline'",'https://unpkg.com','https://cdnjs.cloudflare.com','https://cdn.jsdelivr.net','https://fonts.googleapis.com'],
            styleSrc: ["'self'","'unsafe-inline'",'https://unpkg.com','https://cdnjs.cloudflare.com','https://cdn.jsdelivr.net','https://fonts.googleapis.com'],
            imgSrc: ["'self'",'data:','blob:','https:','https://unpkg.com'],
            connectSrc: ["'self'",'https://*.onrender.com','https://unpkg.com','https://*.googleapis.com','https://*.leafletjs.com','https://cdn.jsdelivr.net'],
            fontSrc: ["'self'",'https:','data:','https://fonts.gstatic.com'],
            scriptSrcAttr: ["'unsafe-inline'"],
            objectSrc: ["'none'"], frameSrc: ["'none'"],
            baseUri: ["'self'"], formAction: ["'self'"],
            ...(isProduction ? { upgradeInsecureRequests: [] } : {})
        }
    },
    hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    frameguard: { action: 'deny' }, noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hidePoweredBy: true, crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' }
}));

const allowedOrigins = (process.env.FRONTEND_URL ||
    'http://localhost:5000,http://localhost:3000,https://marine-system-71eo.onrender.com')
    .split(',').map(v => v.trim()).filter(Boolean);

app.use(cors({
    origin(o, cb) {
        if (!o) return cb(null, true);
        if (allowedOrigins.includes(o)) return cb(null, true);
        return cb(new Error('CORS origin denied'));
    },
    credentials: true,
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization','X-CSRF-Token','X-Request-ID'],
    exposedHeaders: ['X-CSRF-Token','X-Session-Expiry','X-Request-ID']
}));

// ✅ FIX #11 & #16: higher limits + skip for health/csrf
const apiLimiter = rateLimit({ 
    windowMs: 15*60*1000, max: 2000, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req) => (req.user && req.user.id) ? req.user.id : (req.ip || 'unknown'),
    message: { success: false, error: 'Too many requests.' }
});
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20, standardHeaders: true, legacyHeaders: false,
    message: { success: false, error: 'Too many authentication attempts.' } });
const forgotPasswordLimiter = rateLimit({ windowMs: 60*60*1000, max: 5, standardHeaders: true, legacyHeaders: false,
    message: { success: false, error: 'Too many password reset attempts.' } });

app.use('/api', (req, res, next) => {
    if (req.path === '/health' || req.path === '/csrf-token') return next();
    return apiLimiter(req, res, next);
});
app.use('/api/auth/login', authLimiter);
app.use(compression());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false, limit: '5mb' }));
app.use(cookieParser());
app.use(hpp({ whitelist: ['status','type','category','priority','region','role'] }));
app.use(xssSanitizer);

app.use((req, res, next) => {
    req.requestId = randomId(16).substring(0, 32);
    res.setHeader('X-Request-ID', req.requestId);
    next();
});
app.use((req, res, next) => {
    const t = Date.now();
    res.on('finish', () => {
        if (!req.path.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf)$/)) {
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${Date.now()-t}ms RID=${req.requestId}`);
        }
    });
    next();
});

// ============ OWNERSHIP DB SIGNATURE ============
async function registerOwnershipSignature() {
    try {
        if (!SystemLogo) return;
        const ex = await SystemLogo.findOne({ key: 'developer_signature' });
        if (ex) return;
        await SystemLogo.create({
            key: 'developer_signature',
            developer: 'أمان الله ناجي',
            organization: 'إدارة إسناد الوحدات البحرية',
            organizationFull: 'الحرس الوطني التونسي - الإدارة العامة لحرس الحدود',
            systemName: 'منظومة الوسائل البحرية',
            version: '10.8.1',
            firstDeployment: new Date(),
            signature: 'AMAN-ALLAH-NAJI-MARINE-SYSTEM-' + new Date().getFullYear()
        });
        console.log('📌 Signature registered');
    } catch (e) { console.warn('⚠️ Signature:', e.message); }
}

// ============ MONGODB ============
let mongoConnected = false;
async function connectMongoDB() {
    const uri = process.env.MONGODB_URI;
    if (!uri) { console.error('❌ MONGODB_URI unset'); return false; }
    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 15000, socketTimeoutMS: 45000,
            connectTimeoutMS: 15000, maxPoolSize: 10, minPoolSize: 2
        });
        mongoConnected = true;
        console.log('✅ MongoDB:', mongoose.connection.name, '@', mongoose.connection.host);
        mongoose.connection.on('error', e => { console.error('❌ Mongo:', e.message); mongoConnected = false; });
        mongoose.connection.on('disconnected', () => { mongoConnected = false; });
        mongoose.connection.on('reconnected', () => { console.log('✅ Mongo reconnected'); mongoConnected = true; });
        await createIndexes();
        await ensureAdminExists();
        await registerOwnershipSignature();
        await cleanupLegacyDemoVessels();
        return true;
    } catch (e) { console.error('❌ Mongo:', e.message); mongoConnected = false; return false; }
}

async function createIndexes() {
    const tasks = [
        { col:'users', spec:{ id:1 }, opts:{ unique:true, sparse:true, background:true } },
        { col:'users', spec:{ username:1 }, opts:{ unique:true, sparse:true, background:true } },
        { col:'users', spec:{ email:1 }, opts:{ sparse:true, background:true } },
        { col:'vessels', spec:{ id:1 }, opts:{ unique:true, sparse:true, background:true } },
        { col:'vessels', spec:{ status:1 }, opts:{ background:true } },
        { col:'maintenances', spec:{ id:1 }, opts:{ sparse:true, background:true } },
        { col:'maintenances', spec:{ vesselId:1 }, opts:{ background:true } },
        { col:'maintenances', spec:{ status:1 }, opts:{ background:true } },
        { col:'logs', spec:{ createdAt:-1 }, opts:{ background:true } },
        { col:'logs', spec:{ action:1, resource:1 }, opts:{ background:true } }
    ];
    for (const t of tasks) {
        try {
            if (mongoose.connection.collections[t.col]) {
                await mongoose.connection.collections[t.col].createIndex(t.spec, t.opts);
            }
        } catch (e) { if (!/already exists|duplicate/i.test(e.message)) console.warn('⚠️ idx', e.message); }
    }
    console.log('✅ Indexes ensured');
}

async function ensureAdminExists() {
    try {
        console.log('');
        console.log('🔍 ================ ADMIN CHECK ================');
        console.log(`   Username: ${ADMIN_USERNAME}`);
        console.log(`   Auto reset: ${ALLOW_ADMIN_RESET ? 'ENABLED' : 'DISABLED'}`);
        console.log('================================================');
        const ex = await User.findOne({ username: ADMIN_USERNAME });
        if (ex) {
            console.log(`✅ Admin "${ADMIN_USERNAME}" exists`);
            const upd = {};
            if (ex.lockedUntil) upd.lockedUntil = null;
            if (ex.loginAttempts > 0) upd.loginAttempts = 0;
            if (ex.isActive === false) upd.isActive = true;
            if (String(ex.role||'').trim() !== 'admin') upd.role = 'admin';
            // ✅ FIX #10: only reset if ALLOW_ADMIN_RESET === true
            if (ALLOW_ADMIN_RESET) {
                let ok = false;
                try { ok = await bcrypt.compare(ADMIN_PASSWORD, ex.password); } catch(e) {}
                if (!ok) {
                    upd.password = await bcrypt.hash(ADMIN_PASSWORD, 12);
                    upd.tokenVersion = (ex.tokenVersion || 0) + 1;
                    console.log('🔄 Admin password reset (ALLOW_ADMIN_RESET=true)');
                }
            }
            if (Object.keys(upd).length) {
                upd.updatedAt = new Date();
                await User.updateOne({ _id: ex._id }, { $set: upd });
                console.log(`✅ Admin updated (${Object.keys(upd).length} fields)`);
            }
            return;
        }
        console.log(`⚠️ Creating admin "${ADMIN_USERNAME}"...`);
        const a = await User.create({
            username: ADMIN_USERNAME, password: ADMIN_PASSWORD, name: ADMIN_NAME,
            email: ADMIN_EMAIL, role: 'admin', region: '', isActive: true,
            tokenVersion: 0, loginAttempts: 0, lockedUntil: null
        });
        console.log('✅ Admin created:', a.username);
    } catch (e) { console.error('❌ Admin:', e.message); }
}

// ============ LEGACY CLEANUP (NO SEED) ============
const LEGACY_DEMO = ['الوحدة 101','الوحدة 205','الوحدة 312'];
const CLEANUP_MARKER = 'legacy-demo-vessels-removed-v2';
async function cleanupLegacyDemoVessels() {
    try {
        const already = await Log.findOne({
            action: 'cleanup', resource: 'system', resourceName: CLEANUP_MARKER
        }).lean();
        if (already) { console.log('ℹ️ Legacy cleanup done'); return; }

        // ✅ FIX #7: safer filter — only old vessels created by 'system' before 2024
        const demo = await Vessel.find({ 
            name: { $in: LEGACY_DEMO }, 
            createdBy: 'system',
            createdAt: { $lt: new Date('2024-01-01T00:00:00Z') }
        }).lean();
        if (!demo.length) {
            try { await Log.create({ action:'cleanup', resource:'system',
                resourceName: CLEANUP_MARKER, status:'success',
                details:{ removed:0, reason:'none-found' } }); } catch(e) {}
            console.log('ℹ️ No legacy demo vessels');
            return;
        }
        console.log(`🧹 Removing ${demo.length} legacy demo vessels...`);
        const ids = demo.map(v => v.id).filter(Boolean);
        const oids = demo.map(v => v._id).filter(Boolean);
        const vr = await Vessel.deleteMany({ _id: { $in: oids } });
        const mr = await Maintenance.deleteMany({ vesselId: { $in: ids } });
        try { await Log.create({ action:'cleanup', resource:'system',
            resourceName: CLEANUP_MARKER, status:'success',
            details:{ removedVessels: vr.deletedCount, removedLogs: mr.deletedCount,
                timestamp: new Date().toISOString() } }); } catch(e) {}
        console.log(`✅ Removed ${vr.deletedCount} vessels + ${mr.deletedCount} logs`);
    } catch (e) { console.warn('⚠️ Cleanup:', e.message); }
}

// ============ SESSION STORE ============
let sessionStore = undefined;
async function buildSessionStore() {
    await initRedis();
    if (redisAvailable && redisClient && RedisStore) {
        try {
            sessionStore = new RedisStore({ client: redisClient, prefix: 'marine:sess:', ttl: 30*24*60*60 });
            console.log('✅ Redis session store');
        } catch (e) { sessionStore = undefined; }
    } else {
        console.log('ℹ️ Session store: Memory');
    }
    if (isProduction && !redisAvailable && process.env.REQUIRE_REDIS_IN_PROD === 'true') {
        console.error('❌ FATAL: Redis required in prod'); process.exit(1);
    }
}

// ============ CSRF ============
function ensureCsrfToken(req, res) {
    if (!req.session) return null;
    const now = Date.now();
    if (!req.session.csrfToken || now > (req.session.csrfExpiry || 0)) {
        req.session.csrfToken = randomId(32);
        req.session.csrfExpiry = now + CSRF_MAX_AGE;
    }
    const t = req.session.csrfToken;
    res.setHeader('X-CSRF-Token', t);
    res.setHeader('X-Session-Expiry', req.session.csrfExpiry);
    try { res.cookie('marine_csrf', t, {
        httpOnly: false, secure: isProduction, sameSite: COOKIE_SAMESITE,
        maxAge: CSRF_MAX_AGE, path: '/'
    }); } catch(e) {}
    return t;
}

const csrfExcluded = new Set([
    '/api/auth/login','/api/auth/forgot-password','/api/auth/reset-password',
    '/api/auth/verify-reset-token','/api/auth/refresh','/api/csrf-token','/api/health'
]);
function looksLikeClientCsrfToken(t) {
    return typeof t === 'string' && t.length >= 20 && t.length <= 200 &&
        /^\d{10,16}\.[a-z0-9]{5,30}\.[a-z0-9]{5,20}$/i.test(t);
}

// ✅ FIX #4: hardened CSRF with proper session validation
async function csrfProtection(req, res, next) {
    if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
    if (csrfExcluded.has(req.path)) return next();

    const provided = req.headers['x-csrf-token'] || req.body?.csrf_token || req.cookies?.marine_csrf;
    const sTok = req.session?.csrfToken || null;
    const cTok = req.cookies?.marine_csrf || null;

    // Case 1: matches session token
    if (provided && sTok && safeEqual(String(provided), String(sTok))) return next();

    // Case 2: matches cookie token AND (no session OR cookie matches session)
    if (provided && cTok && safeEqual(String(provided), String(cTok))) {
        if (!sTok || safeEqual(String(cTok), String(sTok))) return next();
    }

    // Case 3: dev-only fallback
    if (!isProduction && !sTok && looksLikeClientCsrfToken(provided)) return next();

    // Case 4: authenticated user with valid refresh session
    if (req.auth && req.user && req.auth.sid && req.auth.sub === req.user.id) {
        try {
            const rec = await getRefreshSession(req.auth.sid);
            if (rec && rec.userId === req.user.id) return next();
        } catch (e) {}
    }

    return res.status(403).json({ success: false, error: 'CSRF token غير صالح أو مفقود', code: 'CSRF_INVALID' });
}

// ============ JWT ============
function generateAccessToken(user, sid) {
    return jwt.sign({
        sub: user.id, id: user.id, username: user.username, role: user.role,
        name: user.name, sid, ver: user.tokenVersion || 0, type: 'access'
    }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES, issuer: 'marine-system',
        audience: 'marine-system-client', jwtid: randomId(16) });
}
function generateRefreshToken(user, sid) {
    return jwt.sign({ sub: user.id, id: user.id, sid, type: 'refresh' },
        JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES, issuer: 'marine-system',
            audience: 'marine-system-client', jwtid: randomId(32) });
}

// ============ REFRESH SESSIONS (Redis-first) ============
const refreshSessionsMemory = new Map();
async function saveRefreshSession({ sessionId, userId, refreshToken }) {
    const rec = {
        userId, tokenHash: hashToken(refreshToken),
        createdAt: Date.now(), lastUsedAt: Date.now(),
        expiresAt: Date.now() + REFRESH_TOKEN_MAX_AGE
    };
    const ok = await redisSafe(async c => {
        await c.setEx(`marine:refresh:${sessionId}`, Math.floor(REFRESH_TOKEN_MAX_AGE/1000), JSON.stringify(rec));
        return true;
    }, false);
    if (!ok) {
        // ✅ FIX #2: enforce cap
        if (refreshSessionsMemory.size >= MAX_MEMORY_SESSIONS) {
            const sorted = [...refreshSessionsMemory.entries()].sort((a,b) => a[1].lastUsedAt - b[1].lastUsedAt);
            const toDelete = sorted.slice(0, Math.max(1, Math.floor(MAX_MEMORY_SESSIONS * 0.1)));
            for (const [k] of toDelete) refreshSessionsMemory.delete(k);
        }
        refreshSessionsMemory.set(sessionId, rec);
    }
}
async function getRefreshSession(sessionId) {
    if (!sessionId) return null;
    const r = await redisSafe(async c => {
        const d = await c.get(`marine:refresh:${sessionId}`);
        return d ? JSON.parse(d) : null;
    }, undefined);
    if (r !== undefined) {
        if (!r) return null;
        if (Date.now() > r.expiresAt) { await redisSafe(c => c.del(`marine:refresh:${sessionId}`)); return null; }
        return r;
    }
    const rec = refreshSessionsMemory.get(sessionId);
    if (!rec) return null;
    if (Date.now() > rec.expiresAt) { refreshSessionsMemory.delete(sessionId); return null; }
    return rec;
}
async function revokeRefreshSession(sessionId) {
    if (!sessionId) return;
    await redisSafe(c => c.del(`marine:refresh:${sessionId}`));
    refreshSessionsMemory.delete(sessionId);
}
async function revokeAllUserSessions(userId) {
    for (const [k, v] of refreshSessionsMemory) if (v.userId === userId) refreshSessionsMemory.delete(k);
    if (isRedisAvailable()) {
        try {
            let cursor = 0;
            do {
                const r = await redisClient.scan(cursor, { MATCH: 'marine:refresh:*', COUNT: 200 });
                cursor = Number(r.cursor) || 0;
                for (const key of (r.keys || [])) {
                    const d = await redisClient.get(key);
                    if (!d) continue;
                    try { if (JSON.parse(d).userId === userId) await redisClient.del(key); } catch(e) {}
                }
            } while (cursor !== 0);
        } catch(e) {}
    }
}

const revokedAccessTokensMemory = new Map();
async function revokeAccessToken(decoded) {
    if (!decoded?.jti) return;
    const ttl = decoded.exp ? Math.max(1, decoded.exp - Math.floor(Date.now()/1000)) : 15*60;
    const ok = await redisSafe(c => c.setEx(`marine:revoked:${decoded.jti}`, ttl, '1'), false);
    if (!ok) {
        // ✅ FIX #2: enforce cap
        if (revokedAccessTokensMemory.size >= MAX_MEMORY_REVOKED) {
            const sorted = [...revokedAccessTokensMemory.entries()].sort((a,b) => a[1] - b[1]);
            const toDelete = sorted.slice(0, Math.max(1, Math.floor(MAX_MEMORY_REVOKED * 0.1)));
            for (const [k] of toDelete) revokedAccessTokensMemory.delete(k);
        }
        revokedAccessTokensMemory.set(decoded.jti, Date.now() + ttl*1000);
    }
}
async function isAccessTokenRevoked(jti) {
    if (!jti) return false;
    const r = await redisSafe(c => c.exists(`marine:revoked:${jti}`), null);
    if (r !== null) return r > 0;
    const exp = revokedAccessTokensMemory.get(jti);
    if (!exp) return false;
    if (Date.now() > exp) { revokedAccessTokensMemory.delete(jti); return false; }
    return true;
}

// ✅ FIX #2: cleanup every minute
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of revokedAccessTokensMemory) if (now > v) revokedAccessTokensMemory.delete(k);
    for (const [k, v] of refreshSessionsMemory) if (now > v.expiresAt) refreshSessionsMemory.delete(k);
    pruneResetMem();
    // locations cleanup
    if (app.locals.__locMem) {
        for (const [uid, loc] of app.locals.__locMem) {
            if (now - new Date(loc.timestamp).getTime() > 24*60*60*1000) {
                app.locals.__locMem.delete(uid);
            }
        }
    }
}, 60*1000).unref();

// ============ PASSWORD RESET (Redis-first) ============
const resetTokensMemory = [];
function pruneResetMem() {
    const now = Date.now();
    for (let i = resetTokensMemory.length-1; i >= 0; i--)
        if (resetTokensMemory[i].expiresAt < now) resetTokensMemory.splice(i,1);
    if (resetTokensMemory.length > MAX_MEMORY_RESET_TOKENS)
        resetTokensMemory.splice(0, resetTokensMemory.length - MAX_MEMORY_RESET_TOKENS);
}
async function createPasswordResetToken(email) {
    const token = randomId(32);
    const tokenHash = hashToken(token);
    const expiresAt = Date.now() + RESET_TOKEN_TTL;
    const ok = await redisSafe(async c => {
        await c.setEx(`marine:reset:${tokenHash}`, Math.floor(RESET_TOKEN_TTL/1000),
            JSON.stringify({ email, expiresAt }));
        return true;
    }, false);
    if (!ok) {
        pruneResetMem();
        const i = resetTokensMemory.findIndex(x => x.email === email);
        if (i !== -1) resetTokensMemory.splice(i,1);
        resetTokensMemory.push({ email, tokenHash, expiresAt });
    }
    return token;
}
async function findResetTokenRecord(token) {
    if (typeof token !== 'string' || !token) return null;
    const h = hashToken(token);
    const r = await redisSafe(async c => {
        const d = await c.get(`marine:reset:${h}`);
        return d ? JSON.parse(d) : null;
    }, undefined);
    if (r !== undefined) {
        if (!r) return null;
        if (Date.now() > r.expiresAt) { await redisSafe(c => c.del(`marine:reset:${h}`)); return null; }
        return { email: r.email, tokenHash: h, expiresAt: r.expiresAt };
    }
    pruneResetMem();
    const rec = resetTokensMemory.find(x => safeEqual(x.tokenHash, h));
    if (!rec || Date.now() > rec.expiresAt) return null;
    return rec;
}
async function consumeResetToken(token) {
    if (typeof token !== 'string') return;
    const h = hashToken(token);
    await redisSafe(c => c.del(`marine:reset:${h}`));
    const i = resetTokensMemory.findIndex(x => safeEqual(x.tokenHash, h));
    if (i !== -1) resetTokensMemory.splice(i,1);
}
async function verifyResetToken(email, token) {
    const r = await findResetTokenRecord(token);
    return !!(r && r.email === email);
}

// ============ LOG + NOTIFY ============
async function addSystemLog({ userId=null, action='view', resource='system',
    resourceId=null, resourceName='', userName='', userEmail='', ip=null,
    requestId=null, status='success', details={}, error=null }) {
    try {
        if (!mongoConnected) return;
        await Log.create({ action, resource, resourceId, resourceModel: null,
            resourceName, userName, userEmail, ipAddress: ip, userAgent: null,
            details: { ...details, requestId }, status, error });
    } catch (e) {}
}
async function notify({ userId=null, type='info', category='system', title,
    message='', link=null, icon='bell', actorName=null, metadata={} }) {
    try {
        if (!mongoConnected || !Notification || !title) return null;
        const n = new Notification({ id: randomId(8), userId, type, category,
            title, message, link, icon, actorName, metadata, isRead: false });
        return await n.save();
    } catch (e) { return null; }
}

// ============ AUTH MIDDLEWARE ============
function extractBearerToken(req) {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) return null;
    return h.slice(7).trim() || null;
}
function authenticateAccessToken(req, res, next) {
    const token = extractBearerToken(req);
    if (!token) return res.status(401).json({ success: false, error: 'غير مصرح' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET, {
            issuer: 'marine-system', audience: 'marine-system-client'
        });
        if (decoded.type !== 'access')
            return res.status(401).json({ success: false, error: 'نوع التوكن غير صالح' });
        isAccessTokenRevoked(decoded.jti).then(revoked => {
            if (revoked) return res.status(401).json({ success: false, error: 'التوكن ملغى' });
            User.findOne({ id: decoded.sub }).then(user => {
                if (!user || user.isActive !== true)
                    return res.status(401).json({ success: false, error: 'المستخدم غير موجود أو غير نشط' });
                if (typeof decoded.ver !== 'number' || decoded.ver !== (user.tokenVersion || 0))
                    return res.status(401).json({ success: false, error: 'جلسة منتهية', code: 'TOKEN_VERSION_MISMATCH' });
                if (!decoded.sid)
                    return res.status(401).json({ success: false, error: 'جلسة غير صالحة', code: 'SESSION_ID_MISSING' });
                req.user = user; req.auth = decoded; next();
            }).catch(() => res.status(500).json({ success: false, error: 'خطأ في الخادم' }));
        }).catch(() => res.status(500).json({ success: false, error: 'خطأ' }));
    } catch (e) {
        if (e.name === 'TokenExpiredError')
            return res.status(401).json({ success: false, error: 'انتهت صلاحية التوكن' });
        return res.status(401).json({ success: false, error: 'توكن غير صالح' });
    }
}

// ============ RBAC ============
const ROLE_PERMISSIONS = {
    admin: ['*'],
    manager: ['dashboard:view','vessels:read','vessels:create','vessels:update',
        'maintenance:read','maintenance:create','maintenance:update','maintenance:delete',
        'notes:read','notes:create','notes:update','notes:delete',
        'notifications:read','logs:read'],
    editor: ['dashboard:view','vessels:read','vessels:create','vessels:update',
        'maintenance:read','maintenance:create','maintenance:update',
        'notes:read','notes:create','notes:update','notifications:read'],
    maintenance_unit: ['dashboard:view','vessels:read','vessels:create','vessels:update',
        'maintenance:read','maintenance:create','maintenance:update',
        'notes:read','notes:create','notes:update','notifications:read'],
    viewer: ['dashboard:view','vessels:read','maintenance:read','notes:read','notifications:read']
};
const SENSITIVE_PERMISSIONS = {
    'users:manage': ['admin'],
    'monitoring:view': ['admin','manager','maintenance_unit'],
    'settings:manage': ['admin'],
    'sensitive:view': ['admin','manager'],
    'ready:view': ['admin','manager']
};
const ROLE_LABELS = {
    admin: 'مسؤول النظام', manager: 'مدير الأسطول', editor: 'محرر',
    maintenance_unit: 'وحدة الصيانة', viewer: 'مشاهد'
};
const LEGACY_ROLE_MAP = {
    'مسؤول':'admin','مدير':'manager','محرر':'editor','مشغل':'maintenance_unit',
    'مشاهد':'viewer','operator':'maintenance_unit','super_admin':'admin'
};
function normalizeRole(r) {
    if (!r) return 'viewer';
    const t = String(r).trim();
    if (ROLE_PERMISSIONS[t]) return t;
    return LEGACY_ROLE_MAP[t] || 'viewer';
}
function hasPermission(user, perm) {
    if (!user) return false;
    const role = normalizeRole(user.role);
    if (SENSITIVE_PERMISSIONS[perm]) return SENSITIVE_PERMISSIONS[perm].includes(role);
    const p = ROLE_PERMISSIONS[role] || [];
    if (p.includes('*') || p.includes(perm)) return true;
    const [res] = perm.split(':');
    return p.includes(`${res}:*`);
}
function requirePermission(perm) {
    return (req, res, next) => {
        if (!req.user || !hasPermission(req.user, perm))
            return res.status(403).json({ success: false, error: 'ليس لديك الصلاحية',
                code: 'PERMISSION_DENIED', required: perm });
        next();
    };
}
function requireOneOf(...perms) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ success: false, error: 'غير مصرح' });
        if (!perms.some(p => hasPermission(req.user, p)))
            return res.status(403).json({ success: false, error: 'ليس لديك الصلاحية',
                code: 'PERMISSION_DENIED', required: perms });
        next();
    };
}
function isAdminUser(u) { return u && normalizeRole(u.role) === 'admin'; }
function requireAdmin(req, res, next) {
    if (!isAdminUser(req.user))
        return res.status(403).json({ success: false, error: 'للمسؤول فقط', code: 'ADMIN_ONLY' });
    next();
}

// ============ FORMATTERS ============
function formatUser(u) {
    if (!u) return null;
    const role = normalizeRole(u.role);
    return {
        id: u.id, _id: u._id ? u._id.toString() : null,
        username: u.username, name: u.name, email: u.email,
        role, roleLabel: ROLE_LABELS[role] || role,
        region: u.region || '', active: u.isActive, isActive: u.isActive,
        lastLogin: u.lastLogin, createdAt: u.createdAt
    };
}
function formatVessel(v) {
    if (!v) return null;
    return {
        id: v.id, _id: v._id ? v._id.toString() : null,
        name: v.name, num: v.num || '', len: v.len || 0,
        region: v.region || '', zone: v.zone || '', port: v.port || '',
        supp: v.supp || '', status: v.status || v.stat || 'صالح',
        stat: v.stat || v.status || 'صالح', break: v.break || '',
        fDate: v.fDate || null, eDate: v.eDate || null,
        ref: v.ref || '', repairUnit: v.repairUnit || '',
        cat: v.cat || '', category: v.cat || v.category || '',
        type: v.type || '', location: v.location || '',
        createdAt: v.createdAt, updatedAt: v.updatedAt
    };
}
function formatMaintenance(log) {
    if (!log) return null;
    const iso = log.date || log.startDate || log.createdAt || new Date().toISOString();
    let disp = iso;
    try { const d = new Date(iso); if (!isNaN(d.getTime())) disp = d.toLocaleDateString('ar-EG'); } catch(e) {}
    const raw = log.partsUsed || log.parts || [];
    const parts = (Array.isArray(raw) ? raw : []).map(p => ({
        name: p.partName || p.name || '', quantity: Number(p.quantity) || 1,
        price: Number(p.cost || p.price) || 0,
        total: (Number(p.cost || p.price) || 0) * (Number(p.quantity) || 1)
    }));
    return {
        id: log.id, _id: log._id ? log._id.toString() : null,
        vesselId: log.vesselId || '', vesselName: log.vesselName || '—',
        vessel: log.vesselName || '—', vesselNum: log.vesselNum || '',
        repairUnit: log.repairUnit || '—', unit: log.repairUnit || '—',
        technician: log.supervisorName || log.supervisor || 'غير محدد',
        supervisorName: log.supervisorName || '',
        phone: typeof log.supervisor === 'string' ? log.supervisor : '',
        type: log.type || 'صيانة دورية', interventionType: log.type || 'صيانة دورية',
        faultType: log.faultType || 'أخرى', priority: log.priority || 'متوسط',
        date: disp, isoDate: iso, startDate: log.startDate, endDate: log.endDate,
        createdAt: log.createdAt, updatedAt: log.updatedAt,
        cost: Number(log.cost) || 0, parts, partsUsed: parts,
        description: log.description || '', notes: log.notes || '',
        status: log.status || 'قيد الانتظار'
    };
}

// ============ HTML INJECTION HELPERS (FIX #1, #17) ============
// Store original methods once — prevents infinite loops and duplicate injection
const ORIGINAL_SEND = express.response.send;
const ORIGINAL_SENDFILE = express.response.sendFile;

// Track which injections have been applied per response
function createInjectionState() {
    return { ownership: false, badge: false, gps: false };
}

function applyInjections(html, state) {
    if (typeof html !== 'string' || !html.includes('</body>')) return html;
    // Each injector checks its own flag
    return html;
}

// ============ STARTUP ============
(async () => {
    const mongoOk = await connectMongoDB();
    if (!mongoOk && isProduction) { console.error('❌ Mongo required in prod'); process.exit(1); }
    await buildSessionStore();

    app.use(session({
        secret: SESSION_SECRET, resave: false, saveUninitialized: false,
        ...(sessionStore ? { store: sessionStore } : {}),
        name: isProduction ? '__Secure-marine.sid' : 'marine.sid',
        cookie: {
            httpOnly: true, secure: isProduction, sameSite: COOKIE_SAMESITE,
            maxAge: 30*24*60*60*1000, path: '/'
        },
        rolling: true, proxy: isProduction
    }));

    app.use((req, res, next) => { ensureCsrfToken(req, res); next(); });

    // ============ PUBLIC ============
    app.get('/api/csrf-token', (req, res) => {
        const t = ensureCsrfToken(req, res);
        return res.json({ success: true, token: t || null, expiresIn: CSRF_MAX_AGE });
    });

    app.get('/api/health', (req, res) => {
        res.json({
            success: true, status: 'online', service: 'Marine System', version: '10.8.1',
            developer: 'أمان الله ناجي', organization: 'إدارة إسناد الوحدات البحرية',
            timestamp: new Date().toISOString(),
            mongodb: mongoConnected ? 'connected' : 'disconnected',
            redis: redisAvailable ? 'connected' : 'memory',
            email: (process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY) ? 'mailjet'
                : (process.env.EMAIL_HOST ? 'smtp' : 'not-configured'),
            models: { User: !!User, Vessel: !!Vessel, Maintenance: !!Maintenance,
                Log: !!Log, Ticket: !!Ticket, Note: !!Note,
                Notification: !!Notification, UserSettings: !!UserSettings, SystemLogo: !!SystemLogo }
        });
    });

    // ============ LOGIN ============
    app.post('/api/auth/login', async (req, res) => {
        try {
            const { username, password } = req.body;
            const ip = req.ip || req.socket.remoteAddress;
            if (typeof username !== 'string' || typeof password !== 'string' || !username || !password)
                return res.status(400).json({ success: false, error: 'بيانات غير صالحة' });
            const user = await User.findOne({ username: username.trim() });
            if (!user) {
                await addSystemLog({ action: 'login', resource: 'user', status: 'error',
                    ip, requestId: req.requestId, details: { reason: 'not_found', username } });
                return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
            }
            if (user.lockedUntil && Date.now() < user.lockedUntil.getTime()) {
                const m = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
                return res.status(403).json({ success: false, error: `الحساب مقفل. حاول بعد ${m} دقيقة` });
            }
            if (user.lockedUntil && Date.now() >= user.lockedUntil.getTime()) {
                user.lockedUntil = null; user.loginAttempts = 0; await user.save();
            }
            if (user.isActive === false)
                return res.status(403).json({ success: false, error: 'الحساب معطّل' });
            const ok = await bcrypt.compare(password, user.password);
            if (!ok) {
                user.loginAttempts = (user.loginAttempts || 0) + 1;
                if (user.loginAttempts >= 5) {
                    user.lockedUntil = new Date(Date.now() + 30*60*1000);
                    await user.save();
                    return res.status(403).json({ success: false, error: 'الحساب مقفل لمدة 30 دقيقة' });
                }
                await user.save();
                return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
            }
            user.loginAttempts = 0; user.lockedUntil = null;
            user.lastLogin = new Date(); await user.save();

            const sid = randomId(32);
            const at = generateAccessToken(user, sid);
            const rt = generateRefreshToken(user, sid);
            await saveRefreshSession({ sessionId: sid, userId: user.id, refreshToken: rt });

            if (req.session) { req.session.userId = user.id; req.session.sessionId = sid; }
            await new Promise(r => { if (!req.session) return r(); req.session.save(() => r()); });

            const csrf = ensureCsrfToken(req, res);
            const rcn = isProduction ? '__Secure-marine.refresh' : 'marine.refresh';
            res.cookie(rcn, rt, { httpOnly: true, secure: isProduction,
                sameSite: COOKIE_SAMESITE, maxAge: REFRESH_TOKEN_MAX_AGE, path: '/api/auth' });

            await addSystemLog({ userId: user.id, userName: user.name, userEmail: user.email,
                action: 'login', resource: 'user', status: 'success', ip, requestId: req.requestId });

            res.json({ success: true, token: at, expiresIn: ACCESS_TOKEN_MAX_AGE,
                csrfToken: csrf,
                session: { csrfToken: csrf, csrfExpiry: req.session?.csrfExpiry || (Date.now()+CSRF_MAX_AGE) },
                user: formatUser(user) });
        } catch (e) { res.status(500).json({ success: false, error: 'خطأ في الخادم' }); }
    });

    // ============ REFRESH ============
    app.post('/api/auth/refresh', async (req, res) => {
        try {
            const cn = isProduction ? '__Secure-marine.refresh' : 'marine.refresh';
            const rt = req.cookies[cn];
            if (!rt) return res.status(401).json({ success: false, error: 'Refresh غير موجود' });
            const decoded = jwt.verify(rt, JWT_REFRESH_SECRET, {
                issuer: 'marine-system', audience: 'marine-system-client' });
            if (decoded.type !== 'refresh')
                return res.status(401).json({ success: false, error: 'Refresh غير صالح' });
            const rec = await getRefreshSession(decoded.sid);
            if (!rec) return res.status(401).json({ success: false, error: 'جلسة غير موجودة' });
            if (rec.userId !== decoded.sub) {
                await revokeRefreshSession(decoded.sid);
                return res.status(401).json({ success: false, error: 'جلسة غير صالحة' });
            }
            if (!safeEqual(rec.tokenHash, hashToken(rt))) {
                await revokeRefreshSession(decoded.sid);
                const u = await User.findOne({ id: decoded.sub });
                if (u) { u.tokenVersion = (u.tokenVersion || 0) + 1; await u.save(); }
                return res.status(401).json({ success: false, error: 'Refresh غير صالح' });
            }
            const user = await User.findOne({ id: decoded.sub });
            if (!user || !user.isActive) {
                await revokeRefreshSession(decoded.sid);
                return res.status(401).json({ success: false, error: 'المستخدم غير نشط' });
            }
            const nsid = randomId(32);
            const nrt = generateRefreshToken(user, nsid);
            const nat = generateAccessToken(user, nsid);
            await revokeRefreshSession(decoded.sid);
            await saveRefreshSession({ sessionId: nsid, userId: user.id, refreshToken: nrt });
            if (req.session) { req.session.userId = user.id; req.session.sessionId = nsid; }
            await new Promise(r => { if (!req.session) return r(); req.session.save(() => r()); });
            const csrf = ensureCsrfToken(req, res);
            res.cookie(cn, nrt, { httpOnly: true, secure: isProduction,
                sameSite: COOKIE_SAMESITE, maxAge: REFRESH_TOKEN_MAX_AGE, path: '/api/auth' });
            res.json({ success: true, token: nat, expiresIn: ACCESS_TOKEN_MAX_AGE,
                csrfToken: csrf,
                session: { csrfToken: csrf, csrfExpiry: req.session?.csrfExpiry || (Date.now()+CSRF_MAX_AGE) },
                user: formatUser(user) });
        } catch (e) { res.status(401).json({ success: false, error: 'Refresh غير صالح أو منتهي' }); }
    });

    // ============ ME ============
    app.get('/api/auth/me', authenticateAccessToken, (req, res) => {
        res.json({ success: true, user: formatUser(req.user) });
    });

    // ============ PERMISSIONS ============
    app.get('/api/auth/permissions', authenticateAccessToken, (req, res) => {
        const role = normalizeRole(req.user.role);
        res.json({
            success: true, role, roleLabel: ROLE_LABELS[role] || role,
            permissions: ROLE_PERMISSIONS[role] || [],
            capabilities: {
                canViewVessels: hasPermission(req.user, 'vessels:read'),
                canCreateVessels: hasPermission(req.user, 'vessels:create'),
                canUpdateVessels: hasPermission(req.user, 'vessels:update'),
                canDeleteVessels: hasPermission(req.user, 'vessels:delete'),
                canViewMaintenance: hasPermission(req.user, 'maintenance:read'),
                canCreateMaintenance: hasPermission(req.user, 'maintenance:create'),
                canUpdateMaintenance: hasPermission(req.user, 'maintenance:update'),
                canDeleteMaintenance: hasPermission(req.user, 'maintenance:delete'),
                canViewNotes: hasPermission(req.user, 'notes:read'),
                canCreateNotes: hasPermission(req.user, 'notes:create'),
                canUpdateNotes: hasPermission(req.user, 'notes:update'),
                canDeleteNotes: hasPermission(req.user, 'notes:delete'),
                canViewNotifications: true,
                canManageUsers: hasPermission(req.user, 'users:manage'),
                canViewMonitoring: hasPermission(req.user, 'monitoring:view'),
                canViewLogs: hasPermission(req.user, 'logs:read'),
                canManageSettings: hasPermission(req.user, 'settings:manage'),
                canViewSensitive: hasPermission(req.user, 'sensitive:view'),
                canViewReady: hasPermission(req.user, 'ready:view')
            }
        });
    });

    // ============ LOGOUT ============
    app.post('/api/auth/logout', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            const ip = req.ip || req.socket.remoteAddress;
            if (req.auth?.jti) await revokeAccessToken(req.auth);
            const sids = new Set();
            if (req.auth?.sid) sids.add(req.auth.sid);
            if (req.session?.sessionId) sids.add(req.session.sessionId);
            for (const s of sids) await revokeRefreshSession(s);
            await addSystemLog({ userId: req.user?.id || null, userName: req.user?.name || '',
                action: 'logout', resource: 'user', status: 'success', ip, requestId: req.requestId });
            await new Promise(r => { if (!req.session) return r(); req.session.destroy(() => r()); });
            const rcn = isProduction ? '__Secure-marine.refresh' : 'marine.refresh';
            const scn = isProduction ? '__Secure-marine.sid' : 'marine.sid';
            res.clearCookie(rcn, { httpOnly: true, secure: isProduction, sameSite: COOKIE_SAMESITE, path: '/api/auth' });
            res.clearCookie(scn, { httpOnly: true, secure: isProduction, sameSite: COOKIE_SAMESITE, path: '/' });
            res.clearCookie('marine_csrf', { httpOnly: false, secure: isProduction, sameSite: COOKIE_SAMESITE, path: '/' });
            res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
        } catch (e) { res.status(500).json({ success: false, error: 'خطأ أثناء الخروج' }); }
    });

    // ============ PASSWORD RESET ============
    app.post('/api/auth/forgot-password', forgotPasswordLimiter, async (req, res) => {
        try {
            const { email } = req.body;
            if (typeof email !== 'string' || !email.trim())
                return res.status(400).json({ success: false, error: 'البريد مطلوب' });
            const user = await User.findOne({ email: email.trim().toLowerCase() });
            if (!user) return res.json({ success: true, message: 'إذا كان البريد مسجلاً فسيتم الإرسال' });
            const token = await createPasswordResetToken(user.email);
            const link = `${req.protocol}://${req.get('host')}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(user.email)}`;
            const html = `<div dir="rtl" style="font-family:Arial"><h2>🔐 إعادة تعيين كلمة المرور</h2><p>مرحباً <strong>${String(user.name || user.username)}</strong></p><p>استخدم الرابط:</p><p><a href="${link}">إعادة تعيين</a></p><p>صالح لمدة ساعة.</p></div>`;
            await sendEmail(user.email, 'إعادة تعيين كلمة المرور', html);
            const p = { success: true, message: 'تم إنشاء طلب إعادة التعيين' };
            if (!isProduction) { p.resetLink = link; p.devNote = 'DEV ONLY'; }
            res.json(p);
        } catch (e) { res.status(500).json({ success: false, error: 'خطأ' }); }
    });
    app.post('/api/auth/verify-reset-token', async (req, res) => {
        try {
            const { email, token } = req.body;
            const valid = typeof email === 'string' && typeof token === 'string'
                && await verifyResetToken(email, token);
            res.json({ success: true, valid });
        } catch (e) { res.status(500).json({ success: false, error: 'خطأ' }); }
    });
    app.post('/api/auth/reset-password', async (req, res) => {
        try {
            const { email, token, newPassword } = req.body;
            if (!email || !token || !newPassword)
                return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
            if (!await verifyResetToken(email, token))
                return res.status(400).json({ success: false, error: 'رابط غير صالح أو منتهي' });
            if (!isStrongPassword(newPassword))
                return res.status(400).json({ success: false, error: 'كلمة المرور ضعيفة' });
            const user = await User.findOne({ email: email.toLowerCase() });
            if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
            user.password = newPassword;
            user.tokenVersion = (user.tokenVersion || 0) + 1;
            await user.save();
            await revokeAllUserSessions(user.id);
            await consumeResetToken(token);
            res.json({ success: true, message: 'تم إعادة التعيين بنجاح' });
        } catch (e) { res.status(500).json({ success: false, error: 'خطأ' }); }
    });

    // ============ NOTES ============
    app.get('/api/notes', authenticateAccessToken, async (req, res) => {
        try {
            if (!Note) return res.json([]);
            const notes = await Note.find().sort({ createdAt: -1 }).limit(500).lean();
            res.json(notes.map(n => ({ id: n._id.toString(), title: n.title, content: n.content,
                type: n.type, number: n.number, status: n.status,
                weekNumber: n.weekNumber, year: n.year,
                createdByName: n.createdByName || 'مستخدم',
                createdAt: n.createdAt, updatedAt: n.updatedAt })));
        } catch (e) { res.status(500).json({ success: false, error: 'فشل التحميل' }); }
    });
    app.get('/api/notes/:id', authenticateAccessToken, async (req, res) => {
        try {
            if (!Note) return res.status(404).json({ success: false, error: 'غير متاح' });
            const q = buildIdQuery(req.params.id);
            if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
            const note = await Note.findOne(q);
            if (!note) return res.status(404).json({ success: false, error: 'غير موجودة' });
            note.views = (note.views || 0) + 1; await note.save();
            res.json({ success: true, note: { id: note._id.toString(), title: note.title,
                content: note.content, type: note.type, number: note.number, status: note.status,
                createdByName: note.createdByName, createdAt: note.createdAt, views: note.views } });
        } catch (e) { res.status(500).json({ success: false, error: 'فشل' }); }
    });
    app.post('/api/notes', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            if (!Note) return res.status(500).json({ success: false, error: 'غير متاح' });
            const { title, content, date, priority, type, weekNumber } = req.body;
            if (typeof title !== 'string' || !title.trim())
                return res.status(400).json({ success: false, error: 'العنوان مطلوب' });
            if (typeof content !== 'string' || !content.trim())
                return res.status(400).json({ success: false, error: 'المحتوى مطلوب' });
            let nt = type || 'عام';
            if (priority === 'عاجل') nt = 'عاجلة'; else if (priority === 'مهم') nt = 'مهمة';
            let wn = weekNumber;
            if (!wn) {
                try {
                    const d = date ? new Date(date) : new Date();
                    const s = new Date(d.getFullYear(), 0, 1);
                    const diff = Math.floor((d - s) / 86400000);
                    wn = Math.ceil((diff + s.getDay() + 1) / 7);
                    wn = Math.max(1, Math.min(53, wn));
                } catch(e) { wn = 1; }
            }
            let cid;
            try { cid = mongoose.Types.ObjectId.isValid(req.user._id) ? req.user._id : new mongoose.Types.ObjectId(); }
            catch(e) { cid = new mongoose.Types.ObjectId(); }
            const note = await Note.create({
                title: title.trim(), content: content.trim(), type: nt,
                weekNumber: wn, year: new Date().getFullYear(), status: 'مسودة',
                createdBy: cid, createdByName: req.user.name || req.user.username
            });
            await addSystemLog({ userId: req.user.id, userName: req.user.name,
                action: 'create', resource: 'note', resourceId: note._id.toString(),
                resourceName: note.title, status: 'success', ip: req.ip, requestId: req.requestId });
            await notify({ type: 'success', category: 'system', title: 'ملاحظة جديدة',
                message: 'تم إضافة "' + note.title + '"', link: '/pages/notes.html',
                icon: 'sticky-note', actorName: req.user.name || req.user.username });
            res.status(201).json({ success: true, message: 'تمت الإضافة',
                note: { id: note._id.toString(), title: note.title, content: note.content,
                    type: note.type, status: note.status,
                    createdByName: note.createdByName, createdAt: note.createdAt } });
        } catch (e) { res.status(500).json({ success: false, error: 'فشل', details: e.message }); }
    });
    app.put('/api/notes/:id', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            if (!Note) return res.status(500).json({ success: false, error: 'غير متاح' });
            const q = buildIdQuery(req.params.id);
            if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
            const note = await Note.findOne(q);
            if (!note) return res.status(404).json({ success: false, error: 'غير موجودة' });
            const { title, content, priority, type } = req.body;
            if (title !== undefined) note.title = title.trim();
            if (content !== undefined) note.content = content.trim();
            if (type !== undefined) note.type = type;
            else if (priority !== undefined) {
                note.type = priority === 'عاجل' ? 'عاجلة' : (priority === 'مهم' ? 'مهمة' : 'عام');
            }
            await note.save();
            await addSystemLog({ userId: req.user.id, userName: req.user.name,
                action: 'update', resource: 'note', resourceId: note._id.toString(),
                resourceName: note.title, status: 'success', ip: req.ip, requestId: req.requestId });
            await notify({ type: 'info', category: 'system', title: 'تعديل ملاحظة',
                message: 'تم تعديل "' + note.title + '"', link: '/pages/notes.html',
                icon: 'edit', actorName: req.user.name || req.user.username });
            res.json({ success: true, message: 'تم التحديث',
                note: { id: note._id.toString(), title: note.title, content: note.content,
                    type: note.type, status: note.status, createdAt: note.createdAt } });
        } catch (e) { res.status(500).json({ success: false, error: 'فشل', details: e.message }); }
    });
    app.delete('/api/notes/:id', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            if (!Note) return res.status(500).json({ success: false, error: 'غير متاح' });
            const q = buildIdQuery(req.params.id);
            if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
            const note = await Note.findOne(q);
            if (!note) return res.status(404).json({ success: false, error: 'غير موجودة' });
            const title = note.title, nid = note._id.toString();
            await Note.deleteOne({ _id: note._id });
            await addSystemLog({ userId: req.user.id, userName: req.user.name,
                action: 'delete', resource: 'note', resourceId: nid, resourceName: title,
                status: 'success', ip: req.ip, requestId: req.requestId });
            await notify({ type: 'warning', category: 'system', title: 'حذف ملاحظة',
                message: 'تم حذف "' + title + '"', link: '/pages/notes.html',
                icon: 'trash', actorName: req.user.name || req.user.username });
            res.json({ success: true, message: 'تم الحذف' });
        } catch (e) { res.status(500).json({ success: false, error: 'فشل', details: e.message }); }
    });

    // ============ NOTIFICATIONS ============
    app.get('/api/notifications', authenticateAccessToken, async (req, res) => {
        try {
            if (!Notification) return res.json({ success: true, notifications: [], unreadCount: 0, total: 0 });
            const limit = Math.min(parseInt(req.query.limit) || 20, 100);
            const uid = req.user.id;
            const items = await Notification.find({ $or: [{ userId: uid }, { userId: null }] })
                .sort({ createdAt: -1 }).limit(limit).lean();
            const unread = await Notification.countDocuments({ $or: [{ userId: uid }, { userId: null }], isRead: false });
            res.json({ success: true, notifications: items.map(n => ({
                id: n._id.toString(), type: n.type, category: n.category,
                title: n.title, message: n.message, link: n.link, icon: n.icon,
                isRead: n.isRead, actorName: n.actorName, createdAt: n.createdAt
            })), unreadCount: unread, total: items.length });
        } catch (e) { res.status(500).json({ success: false, error: 'فشل' }); }
    });
    app.get('/api/notifications/unread-count', authenticateAccessToken, async (req, res) => {
        try {
            if (!Notification) return res.json({ success: true, unreadCount: 0 });
            const c = await Notification.countDocuments({ $or: [{ userId: req.user.id }, { userId: null }], isRead: false });
            res.json({ success: true, unreadCount: c });
        } catch (e) { res.status(500).json({ success: false, error: 'فشل' }); }
    });
    app.put('/api/notifications/:id/read', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            if (!Notification) return res.json({ success: true, updated: 0 });
            const q = buildIdQuery(req.params.id);
            if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
            const r = await Notification.updateOne(q, { $set: { isRead: true } });
            res.json({ success: true, updated: r.modifiedCount });
        } catch (e) { res.status(500).json({ success: false, error: 'فشل' }); }
    });
    app.put('/api/notifications/read-all', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            if (!Notification) return res.json({ success: true, updated: 0 });
            const r = await Notification.updateMany(
                { $or: [{ userId: req.user.id }, { userId: null }], isRead: false },
                { $set: { isRead: true } });
            res.json({ success: true, updated: r.modifiedCount });
        } catch (e) { res.status(500).json({ success: false, error: 'فشل' }); }
    });
    app.delete('/api/notifications/:id', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            if (!Notification) return res.json({ success: true });
            const q = buildIdQuery(req.params.id);
            if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
            await Notification.deleteOne(q);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ success: false, error: 'فشل' }); }
    });
    app.delete('/api/notifications', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            if (!Notification) return res.json({ success: true, deleted: 0 });
            const r = await Notification.deleteMany({ $or: [{ userId: req.user.id }, { userId: null }] });
            res.json({ success: true, deleted: r.deletedCount });
        } catch (e) { res.status(500).json({ success: false, error: 'فشل' }); }
    });

    // ============ MONITORING ============
    app.get('/api/monitoring/users', authenticateAccessToken, requirePermission('monitoring:view'), async (req, res) => {
        try {
            const users = await User.find().sort({ createdAt: -1 }).limit(500);
            const total = await User.countDocuments();
            const active = await User.countDocuments({ isActive: true });
            res.json({ success: true, users: users.map(formatUser),
                stats: { total, active, inactive: total - active } });
        } catch (e) { res.status(500).json({ success: false, error: 'فشل' }); }
    });
    app.get('/api/monitoring/sessions', authenticateAccessToken, requirePermission('monitoring:view'), async (req, res) => {
        try {
            const sessions = [];
            if (isRedisAvailable()) {
                try {
                    let cursor = 0;
                    do {
                        const r = await redisClient.scan(cursor, { MATCH: 'marine:refresh:*', COUNT: 200 });
                        cursor = Number(r.cursor) || 0;
                        for (const key of (r.keys || [])) {
                            const d = await redisClient.get(key);
                            if (!d) continue;
                            const rec = JSON.parse(d);
                            if (rec.expiresAt > Date.now()) {
                                const u = await User.findOne({ id: rec.userId });
                                sessions.push({
                                    sessionId: key.replace('marine:refresh:', '').substring(0, 12) + '...',
                                    userId: rec.userId, username: u?.username || 'unknown',
                                    name: u?.name || 'unknown', role: u?.role || 'unknown',
                                    createdAt: rec.createdAt, lastUsedAt: rec.lastUsedAt, expiresAt: rec.expiresAt
                                });
                            }
                        }
                    } while (cursor !== 0);
                } catch (e) {}
            }
            for (const [sid, rec] of refreshSessionsMemory) {
                if (rec.expiresAt > Date.now()) {
                    const u = await User.findOne({ id: rec.userId });
                    sessions.push({
                        sessionId: sid.substring(0, 12) + '...',
                        userId: rec.userId, username: u?.username || 'unknown',
                        name: u?.name || 'unknown', role: u?.role || 'unknown',
                        createdAt: rec.createdAt, lastUsedAt: rec.lastUsedAt, expiresAt: rec.expiresAt
                    });
                }
            }
            res.json({ success: true, sessions, stats: { total: sessions.length } });
        } catch (e) { res.status(500).json({ success: false, error: 'فشل' }); }
    });

    // ============ TICKETS ============
    app.get('/api/support/tickets', authenticateAccessToken, async (req, res) => {
        try {
            let tickets;
            if (isAdminUser(req.user))
                tickets = await Ticket.find().sort({ createdAt: -1 }).limit(200);
            else
                tickets = await Ticket.find({ createdByName: req.user.name }).sort({ createdAt: -1 }).limit(100);
            res.json(tickets.map(t => ({
                id: t._id.toString(), title: t.title, subject: t.title,
                description: t.description, message: t.description,
                category: t.category, priority: t.priority, status: t.status,
                user: t.createdByName || 'مستخدم', username: t.createdByName || 'user',
                userId: t.createdBy?.toString() || null,
                assignedTo: t.assignedToName || null,
                replies: t.replies || [], createdAt: t.createdAt,
                closedAt: t.closedAt, resolution: t.resolution
            })));
        } catch (e) { res.status(500).json({ success: false, error: 'فشل' }); }
    });
    app.post('/api/support/tickets', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            const { subject, title, message, description, priority, category } = req.body;
            const s = subject || title, m = message || description;
            if (typeof s !== 'string' || !s.trim())
                return res.status(400).json({ success: false, error: 'الموضوع مطلوب' });
            if (typeof m !== 'string' || !m.trim())
                return res.status(400).json({ success: false, error: 'الرسالة مطلوبة' });
            const pr = ['منخفضة','متوسطة','عالية','عاجلة','منخفض','متوسط','عالي','حرج'].includes(priority) ? priority : 'متوسط';
            const ct = ['فني','لوجستي','إداري','تشغيلي','أمني','أخرى'].includes(category) ? category : 'فني';
            let cid;
            try { cid = mongoose.Types.ObjectId.isValid(req.user._id) ? req.user._id : new mongoose.Types.ObjectId(); }
            catch(e) { cid = new mongoose.Types.ObjectId(); }
            const t = await Ticket.create({
                title: s.trim(), description: m.trim(), category: ct, priority: pr,
                status: 'مفتوح', createdBy: cid, createdByName: req.user.name || req.user.username
            });
            res.status(201).json({ success: true, message: 'تم الإرسال',
                ticket: { id: t._id.toString(), title: t.title, subject: t.title,
                    description: t.description, message: t.description,
                    category: t.category, priority: t.priority, status: t.status,
                    user: t.createdByName, createdAt: t.createdAt } });
        } catch (e) { res.status(500).json({ success: false, error: 'فشل' }); }
    });

    // ============ VESSELS ============
    app.get('/api/vessels', authenticateAccessToken, requirePermission('vessels:read'), async (req, res) => {
        try {
            const vessels = await Vessel.find().sort({ createdAt: -1 }).limit(500);
            res.json(vessels.map(formatVessel));
        } catch (e) { res.status(500).json({ success: false, error: 'فشل' }); }
    });
    app.post('/api/vessels', authenticateAccessToken, requirePermission('vessels:create'), csrfProtection, async (req, res) => {
        try {
            const b = req.body;
            if (typeof b.name !== 'string' || !b.name.trim())
                return res.status(400).json({ success: false, error: 'اسم المركب مطلوب' });
            const nv = await Vessel.create({
                id: randomId(8), name: b.name.trim(), num: b.num || '',
                len: Number(b.len) || 0, region: b.region || '', zone: b.zone || '',
                port: b.port || '', supp: b.supp || '',
                status: b.status || 'صالح', stat: b.status || 'صالح',
                break: b.break || '', fDate: b.fDate || null, eDate: b.eDate || null,
                ref: b.ref || '', repairUnit: b.repairUnit || '', cat: b.cat || '',
                createdBy: req.user.id
            });
            if (nv.status === 'معطب' || nv.status === 'صيانة') {
                await Maintenance.create({
                    id: randomId(8), vesselId: nv.id, vesselName: nv.name, vesselNum: nv.num,
                    type: b.break || 'صيانة دورية',
                    status: nv.status === 'معطب' ? 'متأخرة' : 'قيد التنفيذ',
                    date: b.fDate || new Date().toISOString(),
                    startDate: b.fDate ? new Date(b.fDate) : new Date(),
                    repairUnit: b.repairUnit || '—', cost: 0,
                    notes: b.break ? `عطب: ${b.break}` : 'صيانة دورية', createdBy: req.user.id
                });
            }
            await addSystemLog({ userId: req.user.id, userName: req.user.name,
                action: 'create', resource: 'vessel', resourceId: nv.id, resourceName: nv.name,
                status: 'success', ip: req.ip, requestId: req.requestId });
            await notify({ type: 'success', category: 'vessel', title: 'مركب جديد',
                message: 'تم إضافة "' + nv.name + '"', link: '/pages/fleet.html',
                icon: 'ship', actorName: req.user.name || req.user.username });
            res.status(201).json({ success: true, message: 'تمت الإضافة', vessel: formatVessel(nv) });
        } catch (e) { res.status(500).json({ success: false, error: 'خطأ' }); }
    });
    app.put('/api/vessels/:id', authenticateAccessToken, requirePermission('vessels:update'), csrfProtection, async (req, res) => {
        try {
            const q = buildIdQuery(req.params.id);
            if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
            const v = await Vessel.findOne(q);
            if (!v) return res.status(404).json({ success: false, error: 'غير موجود' });
            const b = req.body, old = v.status || v.stat;
            if (typeof b.name === 'string' && b.name.trim()) v.name = b.name.trim();
            if (b.num !== undefined) v.num = b.num;
            if (b.len !== undefined) v.len = Number(b.len) || 0;
            if (b.region !== undefined) v.region = b.region;
            if (b.zone !== undefined) v.zone = b.zone;
            if (b.port !== undefined) v.port = b.port;
            if (b.supp !== undefined) v.supp = b.supp;
            if (b.status !== undefined) { v.status = b.status; v.stat = b.status; }
            else if (b.stat !== undefined) { v.status = b.stat; v.stat = b.stat; }
            if (b.break !== undefined) v.break = b.break;
            if (b.fDate !== undefined) v.fDate = b.fDate;
            if (b.eDate !== undefined) v.eDate = b.eDate;
            if (b.ref !== undefined) v.ref = b.ref;
            if (b.repairUnit !== undefined) v.repairUnit = b.repairUnit;
            if (b.cat !== undefined) v.cat = b.cat;
            v.updatedAt = new Date(); await v.save();
            if (v.status && (v.status === 'معطب' || v.status === 'صيانة') && old !== v.status) {
                await Maintenance.create({
                    id: randomId(8), vesselId: v.id, vesselName: v.name, vesselNum: v.num,
                    type: b.break || 'صيانة دورية',
                    status: v.status === 'معطب' ? 'متأخرة' : 'قيد التنفيذ',
                    date: b.fDate || new Date().toISOString(),
                    startDate: b.fDate ? new Date(b.fDate) : new Date(),
                    repairUnit: b.repairUnit || '—', cost: 0,
                    notes: b.break ? `عطب: ${b.break}` : 'صيانة دورية', createdBy: req.user.id
                });
            }
            await addSystemLog({ userId: req.user.id, userName: req.user.name,
                action: 'update', resource: 'vessel', resourceId: v.id, resourceName: v.name,
                status: 'success', ip: req.ip, requestId: req.requestId });
            await notify({ type: 'info', category: 'vessel', title: 'تعديل مركب',
                message: 'تم تعديل "' + v.name + '"', link: '/pages/fleet.html',
                icon: 'edit', actorName: req.user.name || req.user.username });
            res.json({ success: true, message: 'تم التحديث', vessel: formatVessel(v) });
        } catch (e) { res.status(500).json({ success: false, error: 'خطأ' }); }
    });
    app.delete('/api/vessels/:id', authenticateAccessToken, requirePermission('vessels:delete'), csrfProtection, async (req, res) => {
        try {
            const q = buildIdQuery(req.params.id);
            if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
            const v = await Vessel.findOne(q);
            if (!v) return res.status(404).json({ success: false, error: 'غير موجود' });
            const name = v.name, id = v.id;
            await Vessel.deleteOne({ _id: v._id });
            await addSystemLog({ userId: req.user.id, userName: req.user.name,
                action: 'delete', resource: 'vessel', resourceId: id, resourceName: name,
                status: 'success', ip: req.ip, requestId: req.requestId });
            await notify({ type: 'warning', category: 'vessel', title: 'حذف مركب',
                message: 'تم حذف "' + name + '"', link: '/pages/fleet.html',
                icon: 'trash', actorName: req.user.name || req.user.username });
            res.json({ success: true, message: 'تم الحذف' });
        } catch (e) { res.status(500).json({ success: false, error: 'خطأ' }); }
    });

    // ============ MAINTENANCE ============
    async function handleGetMaint(req, res) {
        try {
            const logs = await Maintenance.find().sort({ createdAt: -1 }).limit(500);
            const recs = logs.map(formatMaintenance);
            res.json({ success: true, records: recs, data: recs, total: recs.length,
                stats: {
                    total: recs.length,
                    completed: recs.filter(r => r.status === 'مكتملة').length,
                    pending: recs.filter(r => r.status === 'قيد الانتظار' || r.status === 'معلقة').length,
                    overdue: recs.filter(r => r.status === 'متأخرة').length,
                    inProgress: recs.filter(r => r.status === 'قيد التنفيذ' || r.status === 'قيد الإنجاز').length
                }});
        } catch (e) { res.status(500).json({ success: false, error: 'فشل' }); }
    }
    app.get('/api/maintenance', authenticateAccessToken, requirePermission('maintenance:read'), handleGetMaint);
    app.get('/api/maintenance-logs', authenticateAccessToken, requirePermission('maintenance:read'), handleGetMaint);

    async function handleCreateMaint(req, res) {
        try {
            const b = req.body;
            if (typeof b.vesselName !== 'string' || !b.vesselName.trim())
                return res.status(400).json({ success: false, error: 'اسم المركب مطلوب' });
            const raw = b.partsUsed || b.parts || [];
            const parts = (Array.isArray(raw) ? raw : []).map(p => ({
                partName: p.partName || p.name || '',
                quantity: Number(p.quantity) || 1,
                cost: Number(p.cost || p.price) || 0
            })).filter(p => p.partName);
            const le = await Maintenance.create({
                id: randomId(8), vesselId: b.vesselId || '',
                vesselName: b.vesselName.trim(), vesselNum: b.vesselNum || '',
                type: b.type || 'صيانة دورية', priority: b.priority || 'متوسط',
                status: b.status || 'قيد التنفيذ',
                date: b.date || new Date().toISOString(),
                startDate: b.startDate ? new Date(b.startDate) : new Date(),
                endDate: b.endDate ? new Date(b.endDate) : null,
                repairUnit: b.repairUnit || b.unit || '—',
                cost: Number(b.cost) || 0,
                description: b.description || '', notes: b.notes || '',
                supervisorName: b.supervisorName || b.technician || '',
                supervisor: b.supervisor || null, faultType: b.faultType || 'أخرى',
                partsUsed: parts, createdBy: req.user.id
            });
            await addSystemLog({ userId: req.user.id, userName: req.user.name,
                action: 'create', resource: 'maintenance', resourceId: le.id,
                resourceName: le.vesselName, status: 'success', ip: req.ip, requestId: req.requestId });
            await notify({ type: 'info', category: 'maintenance', title: 'مهمة صيانة',
                message: 'تم إضافة "' + le.vesselName + '"', link: '/pages/maintenance.html',
                icon: 'wrench', actorName: req.user.name || req.user.username });
            const f = formatMaintenance(le);
            res.status(201).json({ success: true, message: 'تمت الإضافة', log: f, record: f, data: f });
        } catch (e) { res.status(500).json({ success: false, error: 'خطأ', details: e.message }); }
    }
    app.post('/api/maintenance', authenticateAccessToken, requirePermission('maintenance:create'), csrfProtection, handleCreateMaint);
    app.post('/api/maintenance-logs', authenticateAccessToken, requirePermission('maintenance:create'), csrfProtection, handleCreateMaint);

    async function handleUpdateMaint(req, res) {
        try {
            const q = buildIdQuery(req.params.id);
            if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
            const l = await Maintenance.findOne(q);
            if (!l) return res.status(404).json({ success: false, error: 'غير موجود' });
            const fields = ['status','cost','notes','description','endDate','priority','repairUnit','supervisorName','type','faultType'];
            fields.forEach(f => { if (req.body[f] !== undefined) l[f] = req.body[f]; });
            if (req.body.partsUsed || req.body.parts) {
                const raw = req.body.partsUsed || req.body.parts;
                l.partsUsed = (Array.isArray(raw) ? raw : []).map(p => ({
                    partName: p.partName || p.name || '',
                    quantity: Number(p.quantity) || 1,
                    cost: Number(p.cost || p.price) || 0
                })).filter(p => p.partName);
            }
            l.updatedAt = new Date(); await l.save();
            await notify({ type: 'info', category: 'maintenance', title: 'تعديل صيانة',
                message: 'تم تعديل "' + l.vesselName + '"', link: '/pages/maintenance.html',
                icon: 'edit', actorName: req.user.name || req.user.username });
            const f = formatMaintenance(l);
            res.json({ success: true, message: 'تم التحديث', log: f, record: f, data: f });
        } catch (e) { res.status(500).json({ success: false, error: 'خطأ' }); }
    }
    app.put('/api/maintenance/:id', authenticateAccessToken, requirePermission('maintenance:update'), csrfProtection, handleUpdateMaint);
    app.put('/api/maintenance-logs/:id', authenticateAccessToken, requirePermission('maintenance:update'), csrfProtection, handleUpdateMaint);

    async function handleDeleteMaint(req, res) {
        try {
            const q = buildIdQuery(req.params.id);
            if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
            const l = await Maintenance.findOne(q);
            if (!l) return res.status(404).json({ success: false, error: 'غير موجود' });
            const name = l.vesselName, id = l.id;
            await Maintenance.deleteOne({ _id: l._id });
            await addSystemLog({ userId: req.user.id, userName: req.user.name,
                action: 'delete', resource: 'maintenance', resourceId: id, resourceName: name,
                status: 'success', ip: req.ip, requestId: req.requestId });
            res.json({ success: true, message: 'تم الحذف' });
        } catch (e) { res.status(500).json({ success: false, error: 'خطأ' }); }
    }
    app.delete('/api/maintenance/:id', authenticateAccessToken, requirePermission('maintenance:delete'), csrfProtection, handleDeleteMaint);
    app.delete('/api/maintenance-logs/:id', authenticateAccessToken, requirePermission('maintenance:delete'), csrfProtection, handleDeleteMaint);

    async function handleCompleteMaint(req, res) {
        try {
            const q = buildIdQuery(req.params.id);
            if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
            const l = await Maintenance.findOne(q);
            if (!l) return res.status(404).json({ success: false, error: 'غير موجود' });
            l.status = 'مكتملة'; l.endDate = new Date(); await l.save();
            let vUpdated = false;
            try {
                const vq = buildIdQuery(l.vesselId);
                if (vq) {
                    const v = await Vessel.findOne(vq);
                    if (v) {
                        v.status = 'صالح'; v.stat = 'صالح'; v.break = '';
                        v.fDate = null; v.eDate = new Date().toISOString().split('T')[0];
                        v.updatedAt = new Date(); await v.save();
                        vUpdated = true;
                    }
                }
            } catch (e) {}
            await addSystemLog({ userId: req.user.id, userName: req.user.name,
                action: 'complete', resource: 'maintenance', resourceId: l.id,
                resourceName: l.vesselName, status: 'success', ip: req.ip, requestId: req.requestId });
            await notify({ type: 'success', category: 'maintenance', title: 'إكمال صيانة',
                message: 'تم إكمال "' + l.vesselName + '"', link: '/pages/maintenance.html',
                icon: 'check', actorName: req.user.name || req.user.username });
            res.json({ success: true,
                message: 'تم الإكمال' + (vUpdated ? ' وتحديث حالة المركب' : ''),
                log: formatMaintenance(l), record: formatMaintenance(l), vesselUpdated: vUpdated });
        } catch (e) { res.status(500).json({ success: false, error: e.message }); }
    }
    app.post('/api/maintenance/:id/complete', authenticateAccessToken, requirePermission('maintenance:update'), csrfProtection, handleCompleteMaint);
    app.post('/api/maintenance-logs/:id/complete', authenticateAccessToken, requirePermission('maintenance:update'), csrfProtection, handleCompleteMaint);

    // ============ USERS ============
    app.get('/api/users', authenticateAccessToken, requirePermission('users:manage'), async (req, res) => {
        try {
            const users = await User.find().sort({ createdAt: -1 }).limit(500);
            res.json(users.map(formatUser));
        } catch (e) { res.status(500).json({ success: false, error: 'فشل' }); }
    });
    app.post('/api/users', authenticateAccessToken, requirePermission('users:manage'), csrfProtection, async (req, res) => {
        try {
            const { username, password, email, role, region, active } = req.body;
            if (typeof username !== 'string' || !username.trim())
                return res.status(400).json({ success: false, error: 'اسم المستخدم مطلوب' });
            if (typeof password !== 'string' || !password)
                return res.status(400).json({ success: false, error: 'كلمة المرور مطلوبة' });
            if (!isStrongPassword(password))
                return res.status(400).json({ success: false, error: 'كلمة المرور ضعيفة' });
            const un = username.trim();
            if (await User.findOne({ username: un }))
                return res.status(400).json({ success: false, error: 'اسم المستخدم موجود' });
            const roles = ['admin','manager','editor','maintenance_unit','viewer','مسؤول','مدير','مشغل','مشاهد','operator','super_admin'];
            const r = roles.includes(role) ? normalizeRole(role) : 'viewer';
            const em = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : `${un.toLowerCase()}@marine.com`;
            if (await User.findOne({ email: em }))
                return res.status(400).json({ success: false, error: 'البريد موجود' });
            const u = await User.create({
                id: randomId(8), username: un, password, email: em, name: un, role: r,
                region: typeof region === 'string' ? region.trim() : '',
                isActive: active !== undefined ? Boolean(active) : true, tokenVersion: 0
            });
            await addSystemLog({ userId: req.user.id, userName: req.user.name,
                action: 'create', resource: 'user', resourceId: u.id, resourceName: u.username,
                status: 'success', ip: req.ip, requestId: req.requestId });
            await notify({ type: 'success', category: 'user', title: 'مستخدم جديد',
                message: 'تم إضافة "' + u.username + '"', link: '/pages/users.html',
                icon: 'user-plus', actorName: req.user.name || req.user.username });
            res.status(201).json({ success: true, message: 'تمت الإضافة', user: formatUser(u) });
        } catch (e) { res.status(500).json({ success: false, error: 'خطأ' }); }
    });
    app.put('/api/users/:id', authenticateAccessToken, requirePermission('users:manage'), csrfProtection, async (req, res) => {
        try {
            const q = buildIdQuery(req.params.id);
            if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
            const u = await User.findOne(q);
            if (!u) return res.status(404).json({ success: false, error: 'غير موجود' });
            const { username, email, role, region, active, password } = req.body;
            if (u.username === 'admin' && username && username !== 'admin')
                return res.status(403).json({ success: false, error: 'لا يمكن تغيير الاسم الرئيسي' });
            if (normalizeRole(u.role) === 'admin' && active === false) {
                const a = await User.countDocuments({ role: 'admin', isActive: true });
                if (a <= 1) return res.status(403).json({ success: false, error: 'لا يمكن تعطيل آخر مسؤول' });
            }
            if (username) u.username = username.trim();
            if (email) u.email = email.trim().toLowerCase();
            if (role) {
                const roles = ['admin','manager','editor','maintenance_unit','viewer','مسؤول','مدير','مشغل','مشاهد','operator','super_admin'];
                if (!roles.includes(role)) return res.status(400).json({ success: false, error: 'صلاحية غير صالحة' });
                u.role = normalizeRole(role);
            }
            if (region !== undefined) u.region = typeof region === 'string' ? region.trim() : '';
            if (active !== undefined) u.isActive = Boolean(active);
            if (password) {
                if (!isStrongPassword(password)) return res.status(400).json({ success: false, error: 'كلمة ضعيفة' });
                u.password = password;
                u.tokenVersion = (u.tokenVersion || 0) + 1;
                await revokeAllUserSessions(u.id);
            }
            if (active === false) {
                u.tokenVersion = (u.tokenVersion || 0) + 1;
                await revokeAllUserSessions(u.id);
            }
            u.updatedAt = new Date(); await u.save();
            await addSystemLog({ userId: req.user.id, userName: req.user.name,
                action: 'update', resource: 'user', resourceId: u.id, resourceName: u.username,
                status: 'success', ip: req.ip, requestId: req.requestId });
            await notify({ type: 'info', category: 'user', title: 'تعديل مستخدم',
                message: 'تم تعديل "' + u.username + '"', link: '/pages/users.html',
                icon: 'user-edit', actorName: req.user.name || req.user.username });
            res.json({ success: true, message: 'تم التحديث', user: formatUser(u) });
        } catch (e) { res.status(500).json({ success: false, error: 'خطأ' }); }
    });
    app.delete('/api/users/:id', authenticateAccessToken, requirePermission('users:manage'), csrfProtection, async (req, res) => {
        try {
            const q = buildIdQuery(req.params.id);
            if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
            const u = await User.findOne(q);
            if (!u) return res.status(404).json({ success: false, error: 'غير موجود' });
            if (u.username === 'admin') return res.status(403).json({ success: false, error: 'لا يمكن حذف الرئيسي' });
            if (normalizeRole(u.role) === 'admin') {
                const c = await User.countDocuments({ role: 'admin' });
                if (c <= 1) return res.status(403).json({ success: false, error: 'لا يمكن حذف آخر مسؤول' });
            }
            const un = u.username, uid = u.id;
            await revokeAllUserSessions(u.id);
            await User.deleteOne({ _id: u._id });
            await addSystemLog({ userId: req.user.id, userName: req.user.name,
                action: 'delete', resource: 'user', resourceId: uid, resourceName: un,
                status: 'success', ip: req.ip, requestId: req.requestId });
            await notify({ type: 'warning', category: 'user', title: 'حذف مستخدم',
                message: 'تم حذف "' + un + '"', link: '/pages/users.html',
                icon: 'user-times', actorName: req.user.name || req.user.username });
            res.json({ success: true, message: 'تم الحذف' });
        } catch (e) { res.status(500).json({ success: false, error: 'خطأ' }); }
    });
    app.put('/api/users-status/:id', authenticateAccessToken, requirePermission('users:manage'), csrfProtection, async (req, res) => {
        try {
            const { active } = req.body;
            const q = buildIdQuery(req.params.id);
            if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
            const u = await User.findOne(q);
            if (!u) return res.status(404).json({ success: false, error: 'غير موجود' });
            if (normalizeRole(u.role) === 'admin' && active === false) {
                const c = await User.countDocuments({ role: 'admin', isActive: true });
                if (c <= 1) return res.status(403).json({ success: false, error: 'لا يمكن تعطيل آخر مسؤول' });
            }
            u.isActive = Boolean(active); u.updatedAt = new Date();
            if (!u.isActive) {
                u.tokenVersion = (u.tokenVersion || 0) + 1;
                await revokeAllUserSessions(u.id);
            }
            await u.save();
            await notify({ type: 'info', category: 'user',
                title: u.isActive ? 'تفعيل مستخدم' : 'تعطيل مستخدم',
                message: (u.isActive ? 'تم تفعيل "' : 'تم تعطيل "') + u.username + '"',
                link: '/pages/users.html', icon: 'user-cog',
                actorName: req.user.name || req.user.username });
            res.json({ success: true,
                message: `تم ${u.isActive ? 'تفعيل' : 'تعطيل'} المستخدم`,
                user: { id: u.id, username: u.username, active: u.isActive } });
        } catch (e) { res.status(500).json({ success: false, error: 'خطأ' }); }
    });

    // ============ LOGS ============
    app.get('/api/logs', authenticateAccessToken, requirePermission('logs:read'), async (req, res) => {
        try {
            const logs = await Log.find({ action: { $nin: ['seed','cleanup'] } })
                .sort({ createdAt: -1 }).limit(200);
            res.json(logs.map(l => ({
                id: l._id.toString(), userId: l.user?.toString() || null,
                userName: l.userName || null, action: l.action, resource: l.resource,
                resourceName: l.resourceName || null, details: l.details,
                status: l.status, timestamp: l.createdAt
            })));
        } catch (e) { res.status(500).json({ success: false, error: 'فشل' }); }
    });

    // ============ SESSION STATUS ============
    app.get('/api/session-status', authenticateAccessToken, (req, res) => {
        res.json({ success: true, hasSession: !!req.session, userId: req.user.id,
            sessionId: (req.session && req.session.sessionId) || (req.auth && req.auth.sid) || null });
    });

    // ============ LIVE LOCATIONS (Redis-first) ============
    const LOCATION_MAX_AGE = 24*60*60*1000;
    const LOCATION_PREFIX = 'marine:loc:';

    app.get('/api/locations', authenticateAccessToken, async (req, res) => {
        try {
            const now = Date.now();
            const list = [];
            if (isRedisAvailable()) {
                try {
                    let cursor = 0;
                    do {
                        const r = await redisClient.scan(cursor, { MATCH: `${LOCATION_PREFIX}*`, COUNT: 200 });
                        cursor = Number(r.cursor) || 0;
                        for (const key of (r.keys || [])) {
                            const d = await redisClient.get(key);
                            if (!d) continue;
                            try {
                                const loc = JSON.parse(d);
                                if (now - new Date(loc.timestamp).getTime() > LOCATION_MAX_AGE) {
                                    await redisClient.del(key);
                                    continue;
                                }
                                list.push(loc);
                            } catch (e) {}
                        }
                    } while (cursor !== 0);
                } catch (e) {}
            } else if (app.locals.__locMem) {
                for (const [uid, loc] of app.locals.__locMem) {
                    if (now - new Date(loc.timestamp).getTime() <= LOCATION_MAX_AGE) list.push(loc);
                }
            }
            list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            res.json({ success: true, count: list.length, locations: list,
                viewer: { id: req.user.id, username: req.user.username,
                    role: normalizeRole(req.user.role) } });
        } catch (e) { res.status(500).json({ success: false, error: 'فشل' }); }
    });

    app.post('/api/locations', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            const { latitude, longitude, accuracy, vesselId } = req.body;
            const lat = Number(latitude), lng = Number(longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)
                return res.status(400).json({ success: false, error: 'إحداثيات غير صالحة' });
            const role = normalizeRole(req.user.role);
            const loc = {
                id: randomId(8), userId: req.user.id, username: req.user.username,
                name: req.user.name || req.user.username, role,
                roleLabel: ROLE_LABELS[role] || role,
                region: req.user.region || '', vesselId: vesselId || null,
                latitude: lat, longitude: lng,
                accuracy: Number(accuracy) || null,
                timestamp: new Date().toISOString()
            };
            const ok = await redisSafe(async c => {
                await c.setEx(`${LOCATION_PREFIX}${req.user.id}`,
                    Math.floor(LOCATION_MAX_AGE/1000), JSON.stringify(loc));
                return true;
            }, false);
            if (!ok) {
                // ✅ FIX #3: memory fallback with cap
                if (!app.locals.__locMem) app.locals.__locMem = new Map();
                if (app.locals.__locMem.size >= MAX_MEMORY_LOCATIONS) {
                    const sorted = [...app.locals.__locMem.entries()]
                        .sort((a,b) => new Date(a[1].timestamp) - new Date(b[1].timestamp));
                    const toDelete = sorted.slice(0, Math.max(1, Math.floor(MAX_MEMORY_LOCATIONS * 0.1)));
                    for (const [k] of toDelete) app.locals.__locMem.delete(k);
                }
                app.locals.__locMem.set(req.user.id, loc);
            }
            res.status(201).json({ success: true, location: loc });
        } catch (e) { res.status(500).json({ success: false, error: 'فشل' }); }
    });

    app.delete('/api/locations/me', authenticateAccessToken, csrfProtection, async (req, res) => {
        await redisSafe(c => c.del(`${LOCATION_PREFIX}${req.user.id}`));
        if (app.locals.__locMem) app.locals.__locMem.delete(req.user.id);
        res.json({ success: true });
    });

    // ============ AI + IMPORT ============
    aiAndImportRoutes(app, {
        User, Vessel, Maintenance, Notification,
        authenticateAccessToken, csrfProtection,
        requirePermission, hasPermission,
        randomId, addSystemLog, notify
    });

    // ============ SETTINGS + LOGO ============
    if (UserSettings && SystemLogo) {
        try {
            settingsRoutes(app, {
                UserSettings, SystemLogo,
                authenticateAccessToken, requireAdmin, requirePermission,
                csrfProtection, addSystemLog, notify
            });
        } catch (e) { console.error('❌ Settings routes:', e.message); }
    } else {
        console.warn('⚠️ Settings disabled (models missing)');
    }

    // ============ HTML INJECTION (FIXED — single unified middleware) ============
    // ✅ FIX #1 & #17: Single injection middleware, no nested sendFile wrapping
    const OWNERSHIP_META = `
<meta name="author" content="أمان الله ناجي">
<meta name="creator" content="أمان الله ناجي">
<meta name="developer" content="أمان الله ناجي">
<meta name="publisher" content="إدارة إسناد الوحدات البحرية">
<meta name="owner" content="إدارة إسناد الوحدات البحرية - الحرس الوطني التونسي">
<meta name="copyright" content="© ${new Date().getFullYear()} أمان الله ناجي - جميع الحقوق محفوظة">
<meta name="application-name" content="منظومة الوسائل البحرية">
<meta name="generator" content="Marine System v10.8.1 - Aman Allah Naji">
`;
    const OWNERSHIP_CSS = `
<style id="ownership-signature-style">
#dev-signature{position:fixed!important;bottom:6px!important;left:50%!important;transform:translateX(-50%)!important;padding:3px 10px!important;background:rgba(6,9,17,0.35)!important;backdrop-filter:blur(6px)!important;border:1px solid rgba(230,179,30,0.1)!important;border-radius:20px!important;font-family:'Cairo','Segoe UI',Tahoma,sans-serif!important;z-index:1!important;pointer-events:none!important;user-select:none!important;opacity:0.4!important;direction:rtl!important;line-height:1.2!important;max-width:200px!important;white-space:nowrap!important;display:flex!important;align-items:center!important;gap:5px!important;}
#dev-signature:hover{opacity:0.8!important;}
#dev-signature .sig-icon{color:#e6b31e!important;font-size:9px!important;}
#dev-signature .sig-name{color:#f7d774!important;font-weight:700!important;font-size:9.5px!important;}
#dev-signature .sig-role{display:none!important;}
@media (max-width:1024px){#dev-signature{display:none!important;}}
@media print{#dev-signature{display:none!important;}}
</style>`;
    const OWNERSHIP_HTML = `
<div id="dev-signature" role="contentinfo" aria-label="توقيع المطور">
    <span class="sig-icon">⚓</span>
    <span class="sig-name">أمان الله ناجي</span>
    <span class="sig-role">إدارة إسناد الوحدات البحرية</span>
</div>`;
    const OWNERSHIP_CONSOLE = `
<script>(function(){try{
console.log('%c⚓ منظومة الوسائل البحرية','background:linear-gradient(135deg,#060911,#0a1020);color:#f7d774;font-size:20px;font-weight:900;padding:12px 24px;border-radius:8px;');
console.log('%c👨‍💻 أمان الله ناجي — إدارة إسناد الوحدات البحرية','background:#0a1020;color:#e6b31e;font-size:13px;font-weight:700;padding:8px 24px;');
}catch(e){}})();<\/script>`;

    const USER_BADGE_CSS = `
<style id="user-info-badge-style">
#user-info-badge{position:fixed!important;top:42px!important;left:20px!important;display:none;align-items:center!important;gap:10px!important;padding:8px 14px!important;background:rgba(6,9,17,0.88)!important;backdrop-filter:blur(14px)!important;border:1px solid rgba(230,179,30,0.3)!important;border-radius:12px!important;font-family:'Cairo','Segoe UI',Tahoma,sans-serif!important;z-index:9998!important;pointer-events:none!important;user-select:none!important;box-shadow:0 6px 24px rgba(0,0,0,0.45)!important;direction:rtl!important;max-width:360px!important;}
#user-info-badge.uib-visible{display:flex!important;}
#user-info-badge .uib-avatar{width:34px!important;height:34px!important;border-radius:50%!important;background:linear-gradient(135deg,#f7d774 0%,#e6b31e 50%,#b8860b 100%)!important;display:flex!important;align-items:center!important;justify-content:center!important;color:#060911!important;font-weight:900!important;font-size:15px!important;flex-shrink:0!important;}
#user-info-badge .uib-info{display:flex!important;flex-direction:column!important;line-height:1.35!important;min-width:0!important;}
#user-info-badge .uib-name{color:#f7d774!important;font-weight:800!important;font-size:12.5px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;}
#user-info-badge .uib-meta{display:flex!important;align-items:center!important;gap:8px!important;flex-wrap:wrap!important;font-size:10.5px!important;}
#user-info-badge .uib-role{color:#e6b31e!important;font-weight:700!important;}
#user-info-badge .uib-role::before{content:'👤 '!important;font-size:10px!important;}
#user-info-badge .uib-region{color:#60a5fa!important;font-weight:700!important;}
#user-info-badge .uib-region::before{content:'📍 '!important;font-size:10px!important;}
#user-info-badge .uib-sep{color:#475569!important;font-size:9px!important;}
@media print{#user-info-badge{display:none!important;}}
@media (max-width:768px){#user-info-badge{top:36px!important;left:10px!important;padding:6px 10px!important;max-width:260px!important;}}
</style>`;
    const USER_BADGE_HTML = `
<div id="user-info-badge" role="status" aria-label="معلومات المستخدم">
    <div class="uib-avatar">م</div>
    <div class="uib-info">
        <span class="uib-name">—</span>
        <span class="uib-meta"><span class="uib-role"></span><span class="uib-region"></span></span>
    </div>
</div>`;
    const USER_BADGE_SCRIPT = `
<script>(function(){'use strict';
function readUser(){
 var ks=['marine_user','currentUser','user','marine_current_user'];
 var st=[window.localStorage,window.sessionStorage];
 for(var s=0;s<st.length;s++){var store=st[s];if(!store)continue;
  for(var i=0;i<ks.length;i++){try{var r=store.getItem(ks[i]);
   if(r){var p=JSON.parse(r);if(p&&(p.name||p.username||p.role))return p;}}catch(e){}}}
 return null;
}
function updateBadge(){try{
 var b=document.getElementById('user-info-badge');if(!b)return;
 var u=readUser();if(!u){b.classList.remove('uib-visible');return;}
 var n=u.name||u.username||'مستخدم';
 var rl=u.roleLabel||u.role||'';
 var rg=u.region||'';
 var av=b.querySelector('.uib-avatar');if(av)av.textContent=(String(n).trim().charAt(0)||'م').toUpperCase();
 var ne=b.querySelector('.uib-name');if(ne)ne.textContent=n;
 var re=b.querySelector('.uib-role');if(re){re.textContent=rl;re.style.display=rl?'':'none';}
 var ge=b.querySelector('.uib-region');if(ge){ge.textContent=rg;ge.style.display=rg?'':'none';}
 b.classList.add('uib-visible');
}catch(e){}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',updateBadge);
else updateBadge();
setInterval(updateBadge,1500);
})();<\/script>`;

    const FORCE_GPS_CSS = `
<style id="force-gps-style">
#force-gps-modal{position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;width:100vw!important;height:100vh!important;z-index:2147483647!important;background:rgba(6,9,17,0.98)!important;display:flex!important;align-items:center!important;justify-content:center!important;font-family:'Cairo','Segoe UI',sans-serif!important;direction:rtl!important;padding:20px!important;margin:0!important;box-sizing:border-box!important;}
#force-gps-modal.gps-ok{display:none!important;}
#force-gps-modal .fg-box{max-width:460px!important;width:100%!important;background:linear-gradient(135deg,rgba(18,26,44,0.98) 0%,rgba(24,34,56,0.95) 100%)!important;border:2px solid rgba(230,179,30,0.4)!important;border-radius:20px!important;padding:32px 24px!important;text-align:center!important;box-shadow:0 24px 64px rgba(0,0,0,0.8)!important;}
#force-gps-modal .fg-icon{width:72px!important;height:72px!important;margin:0 auto 18px!important;border-radius:50%!important;background:linear-gradient(135deg,#f7d774 0%,#e6b31e 50%,#b8860b 100%)!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:34px!important;color:#060911!important;}
#force-gps-modal .fg-title{font-size:20px!important;font-weight:900!important;margin:0 0 10px!important;color:#f7d774!important;}
#force-gps-modal .fg-desc{font-size:13.5px!important;color:#cbd5e1!important;line-height:1.7!important;margin:0 0 22px!important;}
#force-gps-modal .fg-desc strong{color:#fca5a5!important;font-weight:800!important;}
#force-gps-modal .fg-btn{display:inline-flex!important;align-items:center!important;gap:10px!important;padding:14px 32px!important;border:none!important;border-radius:12px!important;background:linear-gradient(135deg,#f7d774 0%,#e6b31e 50%,#b8860b 100%)!important;color:#060911!important;font-family:inherit!important;font-size:15px!important;font-weight:800!important;cursor:pointer!important;box-shadow:0 8px 24px rgba(230,179,30,0.5)!important;}
#force-gps-modal .fg-btn:disabled{opacity:0.6!important;cursor:wait!important;}
#force-gps-modal .fg-status{margin-top:14px!important;font-size:12px!important;color:#94a3b8!important;min-height:18px!important;}
#force-gps-modal .fg-status.error{color:#fca5a5!important;}
#force-gps-modal .fg-status.success{color:#6ee7b7!important;}
#force-gps-modal .fg-warn{margin-top:18px!important;padding:10px!important;background:rgba(239,68,68,0.1)!important;border:1px solid rgba(239,68,68,0.3)!important;border-radius:10px!important;font-size:11.5px!important;color:#fca5a5!important;}
@media print{#force-gps-modal{display:none!important;}}
</style>`;
    const FORCE_GPS_HTML = `
<div id="force-gps-modal" class="gps-ok" role="dialog" aria-modal="true">
    <div class="fg-box">
        <div class="fg-icon">📍</div>
        <h2 class="fg-title">مطلوب الوصول إلى موقعك</h2>
        <p class="fg-desc">لتشغيل <strong>منظومة الوسائل البحرية</strong>، يجب السماح بالوصول إلى موقعك.<br>هذا الإجراء <strong>إلزامي</strong>.</p>
        <button type="button" class="fg-btn" id="fgAllowBtn"><span>📍</span><span>السماح بالوصول</span></button>
        <div class="fg-status" id="fgStatus"></div>
        <div class="fg-warn">⚠️ بعد النقر اختر <strong>"السماح"</strong> في نافذة المتصفح.</div>
    </div>
</div>`;
    // ✅ FIX #8 & #18: proper cleanup + iframe handling
    const FORCE_GPS_SCRIPT = `
<script>(function(){'use strict';
var MID='force-gps-modal',INT=30000,first=false,watchId=null,lastSent=0,asking=false,verified=false,lastVerify=0;
var pollTimer=null;
function getModal(){return document.getElementById(MID);}
function show(){var m=getModal();if(m)m.classList.remove('gps-ok');}
function hide(){var m=getModal();if(m)m.classList.add('gps-ok');}
function setStatus(t,c){var e=document.getElementById('fgStatus');if(e){e.textContent=t||'';e.className='fg-status'+(c?' '+c:'');}}
function getToken(){try{return localStorage.getItem('marine_auth_token')||localStorage.getItem('marine_token')||localStorage.getItem('token')||'';}catch(e){return '';}}
function getCsrf(){try{var m=document.cookie.match(/marine_csrf=([^;]+)/);return m?decodeURIComponent(m[1]):'';}catch(e){return '';}}
function verifyLogin(cb){
 var t=getToken();if(!t){cb(false);return;}
 if(verified&&(Date.now()-lastVerify<60000)){cb(true);return;}
 var x=new XMLHttpRequest();
 x.open('GET','/api/auth/me',true);
 x.setRequestHeader('Authorization','Bearer '+t);
 x.setRequestHeader('Accept','application/json');
 x.withCredentials=true;
 x.onreadystatechange=function(){
  if(x.readyState!==4)return;
  if(x.status===200){verified=true;lastVerify=Date.now();cb(true);}
  else{verified=false;cb(false);}
 };
 x.onerror=function(){cb(false);};
 x.send();
}
async function postLoc(coords){
 var t=getToken(),c=getCsrf();
 try{
  var r=await fetch('/api/locations',{method:'POST',
   headers:{'Content-Type':'application/json','Authorization':'Bearer '+t,'X-CSRF-Token':c||''},
   credentials:'include',
   body:JSON.stringify({latitude:coords.latitude,longitude:coords.longitude,accuracy:coords.accuracy||null})});
  if(r.ok){lastSent=Date.now();return {ok:true};}
  var txt='';try{txt=await r.text();}catch(e){}
  return {ok:false,status:r.status,body:txt};
 }catch(e){return {ok:false,status:0,error:e.message};}
}
function startWatch(){
 if(watchId!==null||!navigator.geolocation)return;
 try{watchId=navigator.geolocation.watchPosition(
  function(p){if(!verified)return;postLoc(p.coords);},
  function(){},
  {enableHighAccuracy:true,timeout:15000,maximumAge:60000});}catch(e){}
}
function request(){
 if(asking)return;asking=true;
 var b=document.getElementById('fgAllowBtn');if(b)b.disabled=true;
 // ✅ FIX #8: better iframe/unsupported detection
 if(!navigator.geolocation){
  asking=false;if(b)b.disabled=false;
  setStatus('❌ المتصفح لا يدعم خدمة الموقع','error');
  return;
 }
 setStatus('⏳ التحقق من الجلسة...');
 verifyLogin(function(ok){
  if(!ok){asking=false;if(b)b.disabled=false;setStatus('⚠️ يجب تسجيل الدخول أولاً','error');setTimeout(hide,2000);return;}
  setStatus('📍 جاري طلب الموقع...');
  navigator.geolocation.getCurrentPosition(async function(p){
   setStatus('📡 جاري الإرسال...');
   var r=await postLoc(p.coords);
   asking=false;if(b)b.disabled=false;
   if(r.ok){first=true;setStatus('✅ تم تسجيل موقعك','success');setTimeout(hide,600);startWatch();}
   else if(r.status===401){verified=false;setStatus('⚠️ جلسة منتهية','error');setTimeout(hide,2500);}
   else setStatus('⚠️ فشل الإرسال ('+(r.status||'شبكة')+')','error');
  },function(err){
   asking=false;if(b)b.disabled=false;
   var m='حدث خطأ';
   if(err.code===1)m='⚠️ رفضت الوصول. يجب السماح.';
   else if(err.code===2)m='⚠️ تعذّر التحديد. تحقق من GPS.';
   else if(err.code===3)m='⚠️ انتهت المهلة.';
   setStatus(m,'error');
  },{enableHighAccuracy:true,timeout:20000,maximumAge:0});
 });
}
function startSend(){
 setInterval(function(){
  if(!first||watchId===null)return;
  if(Date.now()-lastSent<INT)return;
  if(!navigator.geolocation||!verified)return;
  navigator.geolocation.getCurrentPosition(function(p){postLoc(p.coords);},function(){},
   {enableHighAccuracy:true,timeout:10000,maximumAge:60000});
 },INT);
}
function init(){
 var b=document.getElementById('fgAllowBtn');if(b)b.addEventListener('click',request);
 hide();
 pollTimer=setInterval(function(){
  if(first)return;
  var t=getToken();if(!t){hide();return;}
  if(verified&&(Date.now()-lastVerify<60000)){show();return;}
  verifyLogin(function(v){if(v)show();else hide();});
 },2000);
 startSend();
}
window.addEventListener('beforeunload',function(){
 if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
 if(watchId!==null&&navigator.geolocation){try{navigator.geolocation.clearWatch(watchId);}catch(e){}}
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else init();
})();<\/script>`;

    // ✅ FIX #1 & #17: Single unified injection middleware
    const INJECTION_SKIP_REGEX = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map|json|xml|txt)$/i;

    function injectAll(html) {
        if (typeof html !== 'string' || !html.includes('</body>')) return html;
        
        // Ownership
        if (!html.includes('ownership-signature-style')) {
            if (html.includes('</head>')) html = html.replace('</head>', OWNERSHIP_META + OWNERSHIP_CSS + OWNERSHIP_CONSOLE + '\n</head>');
            else html = OWNERSHIP_META + OWNERSHIP_CSS + OWNERSHIP_CONSOLE + html;
            html = html.replace('</body>', OWNERSHIP_HTML + '\n</body>');
        }
        // User badge
        if (!html.includes('user-info-badge-style')) {
            if (html.includes('</head>')) html = html.replace('</head>', USER_BADGE_CSS + '\n</head>');
            if (/<body[^>]*>/i.test(html)) html = html.replace(/(<body[^>]*>)/i, '$1' + USER_BADGE_HTML);
            html = html.replace('</body>', USER_BADGE_SCRIPT + '\n</body>');
        }
        // Force GPS
        if (!html.includes('force-gps-style')) {
            if (html.includes('</head>')) html = html.replace('</head>', FORCE_GPS_CSS + '\n</head>');
            if (/<body[^>]*>/i.test(html)) html = html.replace(/(<body[^>]*>)/i, '$1' + FORCE_GPS_HTML);
            else html = FORCE_GPS_HTML + html;
            html = html.replace('</body>', FORCE_GPS_SCRIPT + '\n</body>');
        }
        return html;
    }

    app.use((req, res, next) => {
        if (req.path.startsWith('/api/') || INJECTION_SKIP_REGEX.test(req.path)) return next();

        // Save original for THIS response only
        const originalSend = res.send;
        const originalSendFile = res.sendFile;

        res.send = function (body) {
            try {
                if (typeof body === 'string' && body.includes('</body>')) {
                    body = injectAll(body);
                }
            } catch (e) {}
            return originalSend.call(this, body);
        };

        res.sendFile = function (filePath, options, callback) {
            if (typeof options === 'function') { callback = options; options = {}; }
            try {
                if (typeof filePath === 'string' && /\.html?$/i.test(filePath) && fs.existsSync(filePath)) {
                    let content = fs.readFileSync(filePath, 'utf8');
                    content = injectAll(content);
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    return originalSend.call(this, content);
                }
            } catch (e) {}
            return originalSendFile.call(this, filePath, options, callback);
        };

        next();
    });

    // ============ STATIC FILES ============
    const pagesDir = path.join(__dirname, 'pages');
    const publicPagesDir = path.join(__dirname, 'public', 'pages');
    const publicDir = path.join(__dirname, 'public');
    if (!fs.existsSync(pagesDir)) fs.mkdirSync(pagesDir, { recursive: true });
    if (!fs.existsSync(publicPagesDir)) fs.mkdirSync(publicPagesDir, { recursive: true });

    function findPageFile(name) {
        const paths = [
            path.join(publicPagesDir, name + '.html'),
            path.join(pagesDir, name + '.html'),
            path.join(publicDir, name + '.html'),
            path.join(__dirname, name + '.html')
        ];
        for (const p of paths) if (fs.existsSync(p)) return p;
        return null;
    }
    app.use(express.static(__dirname, { index: false }));
    app.use('/pages', express.static(pagesDir));
    app.use('/pages', express.static(publicPagesDir));
    app.use('/public', express.static(publicDir));
    app.use('/public/pages', express.static(publicPagesDir));

    // ============ PAGE ROUTES ============
    app.get('/', (req, res) => {
        const possible = [
            path.join(__dirname, 'index.html'),
            path.join(publicDir, 'index.html'),
            path.join(pagesDir, 'index.html'),
            path.join(publicPagesDir, 'index.html')
        ];
        for (const p of possible) if (fs.existsSync(p)) return res.sendFile(p);
        res.send('<h1>🚢 Marine System v10.8.1</h1><p>Running</p>');
    });
    app.get('/pages/:page', (req, res) => {
        const fp = findPageFile(req.params.page);
        if (fp) return res.sendFile(fp);
        res.status(404).send('<h1>❌ 404</h1>');
    });
    app.get('/:page', (req, res, next) => {
        const skip = ['api','pages','public','css','js','assets','favicon.ico'];
        if (skip.includes(req.params.page)) return next();
        const fp = findPageFile(req.params.page);
        if (fp) return res.sendFile(fp);
        next();
    });

    // ============ 404 ============
    app.use((req, res) => {
        if (req.path.startsWith('/api')) return res.status(404).json({ success: false, error: 'API not found' });
        res.redirect('/');
    });

    // ============ ERROR ============
    app.use((err, req, res, next) => {
        console.error('❌ Global:', err.message);
        if (err.message === 'CORS origin denied') return res.status(403).json({ success: false, error: 'CORS origin denied' });
        res.status(err.status || 500).json({ success: false,
            error: isProduction ? 'حدث خطأ في الخادم' : err.message });
    });

    // ============ LISTEN ============
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log('=========================================');
        console.log('🚢 MARINE SYSTEM v10.8.1 (FIXED)');
        console.log('🔐 JWT + REFRESH + CSRF + SESSION + RBAC');
        console.log('🍃 MongoDB Atlas');
        console.log('📦 NO SEED — NO FAKE VESSELS');
        console.log('💾 Redis-first Maps');
        console.log('📍 Force GPS v6');
        console.log('=========================================');
        console.log(`📍 Port: ${PORT}`);
        console.log(`🌍 Env: ${process.env.NODE_ENV || 'development'}`);
        console.log(`👤 Admin: ${ADMIN_USERNAME}`);
        console.log(`🍃 MongoDB: ${mongoConnected ? 'CONNECTED' : 'DISCONNECTED'}`);
        console.log(`💾 Redis: ${redisAvailable ? 'CONNECTED' : 'MEMORY'}`);
        console.log('=========================================');
        console.log('👨‍💻 أمان الله ناجي');
        console.log('🏛️  إدارة إسناد الوحدات البحرية');
        console.log('=========================================');
    });

    // ============ GRACEFUL SHUTDOWN ============
    async function shutdown(signal) {
        console.log(`\n⚠️ ${signal} received — shutting down...`);
        server.close(async () => {
            try { if (mongoose.connection.readyState === 1) await mongoose.connection.close(); } catch (e) {}
            try { if (redisClient && redisClient.isOpen) await redisClient.quit(); } catch (e) {}
            console.log('✅ Shutdown complete');
            process.exit(0);
        });
        setTimeout(() => { console.error('❌ Forced exit'); process.exit(1); }, 10000).unref();
    }
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
    process.on('unhandledRejection', (r) => console.error('❌ Unhandled rejection:', r));
    process.on('uncaughtException', (e) => { console.error('❌ Uncaught:', e); shutdown('uncaughtException'); });
})();

// ============ EXPORTS ============
module.exports = app;
module.exports.csrfProtection = csrfProtection;
module.exports.authenticateAccessToken = authenticateAccessToken;
module.exports.requirePermission = requirePermission;
module.exports.requireOneOf = requireOneOf;
module.exports.requireAdmin = requireAdmin;
module.exports.hasPermission = hasPermission;
module.exports.normalizeRole = normalizeRole;
module.exports.addSystemLog = addSystemLog;
module.exports.getRedisClient = getRedisClient;
module.exports.isRedisAvailable = isRedisAvailable;
