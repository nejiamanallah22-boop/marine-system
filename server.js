// ============================================================
// 🚢 MARINE SYSTEM - PROFESSIONAL SERVER v10.9.0
// 🔐 JWT + REFRESH + CSRF + SESSION + RBAC + MongoDB
// 🤖 AI + IMPORT + SETTINGS + LOGO
// 📌 OWNERSHIP + 👤 USER BADGE + 📍 FORCE GPS v5
// ✨ v10.9.0: Multi-device support (sessionKey) + cleaner locations
// ============================================================

'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');

console.log('=========================================');
console.log('🚢 MARINE SYSTEM v10.9.0 - STARTING');
console.log('=========================================');
console.log('🔍 __dirname:', __dirname);
console.log('🔍 process.cwd():', process.cwd());
console.log('🔍 Node version:', process.version);

function findModelsPath() {
    const candidates = [
        path.join(__dirname, 'models'),
        path.join(__dirname, '..', 'models'),
        path.join(process.cwd(), 'models'),
        path.join(process.cwd(), 'src', 'models'),
        '/opt/render/project/src/models',
        '/opt/render/project/models',
        './models'
    ];
    const REQUIRED_FILES = ['index.js', 'User.js', 'Vessel.js', 'Maintenance.js'];
    for (const candidate of candidates) {
        try {
            const resolved = path.resolve(candidate);
            if (!fs.existsSync(resolved)) continue;
            const files = fs.readdirSync(resolved);
            const hasAllRequired = REQUIRED_FILES.every(f => files.includes(f));
            if (hasAllRequired) {
                console.log(`✅ Models found at: ${resolved}`);
                return resolved;
            }
        } catch (e) {}
    }
    return null;
}

function loadModels() {
    const modelsPath = findModelsPath();
    if (!modelsPath) {
        console.error('❌❌❌ FATAL: Cannot find models directory!');
        process.exit(1);
    }
    try {
        const models = require(modelsPath);
        if (!models.User || !models.Vessel || !models.Maintenance) {
            throw new Error('Missing required models');
        }
        console.log('✅ Models loaded successfully');
        return models;
    } catch (e) {
        console.error('❌ Failed to load models:', e.message);
        process.exit(1);
    }
}

let User, Vessel, Maintenance, Log, Ticket, Note, Notification;
let UserSettings, SystemLogo;

try {
    const models = loadModels();
    User         = models.User;
    Vessel       = models.Vessel;
    Maintenance  = models.Maintenance;
    Log          = models.Log;
    Ticket       = models.Ticket;
    Note         = models.Note || null;
    Notification = models.Notification || null;
    UserSettings = models.UserSettings || null;
    SystemLogo   = models.SystemLogo || null;
    console.log('📦 Optional models:',
        'Note=' + (Note ? '✅' : '❌'),
        'Notification=' + (Notification ? '✅' : '❌'),
        'UserSettings=' + (UserSettings ? '✅' : '❌'),
        'SystemLogo=' + (SystemLogo ? '✅' : '❌')
    );
} catch (e) {
    console.error('❌ Fatal model loading error:', e.message);
    process.exit(1);
}

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

const aiAndImportRoutes = require('./routes/ai-and-import');
const settingsRoutes = require('./routes/settings');

let createDOMPurify = null;
try {
    createDOMPurify = require('isomorphic-dompurify');
} catch (e) {
    console.warn('⚠️ isomorphic-dompurify غير مثبت');
}

// ============================================================
// 🚀 REDIS
// ============================================================
let redisClient = null;
let RedisStore = null;
let redisAvailable = false;

function normalizeRedisUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
    if (rawUrl.startsWith('rediss://')) return rawUrl;
    const tlsHosts = ['upstash.io', 'redislabs.com', 'redis-cloud.com', 'aivencloud.com', 'digitalocean.com'];
    const isTLSHost = tlsHosts.some(h => rawUrl.includes(h));
    if (isTLSHost && rawUrl.startsWith('redis://')) {
        console.log('🔐 Auto-upgrade: redis:// → rediss:// for TLS host');
        return rawUrl.replace(/^redis:\/\//, 'rediss://');
    }
    return rawUrl;
}

async function initRedis() {
    if (!process.env.REDIS_URL) {
        console.log('ℹ️ REDIS_URL غير محدد — Memory Store');
        return null;
    }
    try {
        const { createClient } = require('redis');
        let ConnectRedis;
        try { ConnectRedis = require('connect-redis'); } catch (e) {
            console.warn('⚠️ connect-redis غير مثبت');
        }
        RedisStore = ConnectRedis ? (ConnectRedis.default || ConnectRedis) : null;

        const finalUrl = normalizeRedisUrl(process.env.REDIS_URL);
        const isTLS = finalUrl.startsWith('rediss://');
        const hostPart = finalUrl.split('@')[1] || 'unknown';
        console.log('🔄 Redis: connecting to', hostPart, '| TLS:', isTLS);

        redisClient = createClient({
            url: finalUrl,
            socket: {
                tls: isTLS,
                rejectUnauthorized: false,
                reconnectStrategy: (retries) => {
                    if (retries > 5) {
                        console.error('❌ Redis: reconnect limit reached');
                        return new Error('Redis reconnect limit');
                    }
                    return Math.min(retries * 200, 2000);
                },
                connectTimeout: 8000
            }
        });

        redisClient.on('error', (err) => {
            if (redisAvailable) console.warn('⚠️ Redis error:', err.message);
            redisAvailable = false;
        });
        redisClient.on('connect', () => console.log('🔄 Redis: connecting...'));
        redisClient.on('ready', () => {
            console.log('✅ Redis: connected and ready');
            redisAvailable = true;
        });
        redisClient.on('reconnecting', () => console.log('🔄 Redis: reconnecting...'));
        redisClient.on('end', () => {
            console.log('🔌 Redis: connection closed');
            redisAvailable = false;
        });

        await Promise.race([
            redisClient.connect(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connect timeout (15s)')), 15000))
        ]);
        redisAvailable = true;
        return redisClient;
    } catch (e) {
        console.warn('⚠️ Redis غير متاح:', e.message);
        redisAvailable = false;
        try { if (redisClient && redisClient.isOpen) await redisClient.quit(); } catch (_) {}
        redisClient = null;
        return null;
    }
}

function getRedisClient() { return redisAvailable ? redisClient : null; }
function isRedisAvailable() { return redisAvailable && redisClient && redisClient.isReady; }

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const isProduction = process.env.NODE_ENV === 'production';
const COOKIE_SAMESITE = process.env.SESSION_COOKIE_SAMESITE || 'lax';

app.disable('x-powered-by');
app.set('trust proxy', isProduction ? 1 : 0);

// ============================================================
// 📌 OWNERSHIP HEADERS
// ============================================================
app.use((req, res, next) => {
    res.setHeader('X-System-Name', 'Marine System');
    res.setHeader('X-System-Version', '10.9.0');
    res.setHeader('X-Developer', 'Aman Allah Naji');
    res.setHeader('X-Organization', 'Direction des Moyens Maritimes - Garde Nationale Tunisienne');
    res.setHeader('X-Copyright', 'Copyright 2024-' + new Date().getFullYear() + ' Aman Allah Naji');
    next();
});

function generateSecret(bytes = 64) { return crypto.randomBytes(bytes).toString('hex'); }

if (isProduction) {
    const requiredSecrets = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'SESSION_SECRET'];
    const missing = requiredSecrets.filter(key => !process.env[key] || process.env[key].length < 32);
    if (missing.length > 0) {
        console.error('❌ FATAL: Missing secrets:', missing.join(', '));
        process.exit(1);
    }
}

const JWT_SECRET = process.env.JWT_SECRET || generateSecret(64);
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || generateSecret(64);
const SESSION_SECRET = process.env.SESSION_SECRET || generateSecret(64);

const ACCESS_TOKEN_EXPIRES = '15m';
const REFRESH_TOKEN_EXPIRES = '7d';
const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const CSRF_MAX_AGE = 8 * 60 * 60 * 1000;

function isStrongPassword(password) {
    if (typeof password !== 'string') return false;
    const checks = [
        /[A-Z]/.test(password),
        /[a-z]/.test(password),
        /\d/.test(password),
        /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
        password.length >= 12
    ];
    return checks.filter(Boolean).length >= 4;
}

function generateStrongPassword(length = 20) {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=';
    const all = uppercase + lowercase + numbers + special;
    const chars = [
        uppercase[crypto.randomInt(uppercase.length)],
        lowercase[crypto.randomInt(lowercase.length)],
        numbers[crypto.randomInt(numbers.length)],
        special[crypto.randomInt(special.length)]
    ];
    while (chars.length < length) chars.push(all[crypto.randomInt(all.length)]);
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_NAME = process.env.ADMIN_NAME || 'أمان الله ناجي';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@marine-system.local';

const ALLOW_ADMIN_RESET = process.env.ALLOW_ADMIN_RESET !== 'false';
console.log('🔑 ALLOW_ADMIN_RESET:', ALLOW_ADMIN_RESET ? 'ENABLED' : 'DISABLED');

let ADMIN_PASSWORD;
let ADMIN_PASSWORD_GENERATED = false;

if (process.env.ADMIN_PASSWORD) {
    if (!isStrongPassword(process.env.ADMIN_PASSWORD)) {
        console.error('❌ ADMIN_PASSWORD too weak.');
        if (isProduction) process.exit(1);
        ADMIN_PASSWORD = generateStrongPassword();
        ADMIN_PASSWORD_GENERATED = true;
    } else {
        ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    }
} else {
    if (isProduction) {
        console.error('❌ ADMIN_PASSWORD required in production.');
        process.exit(1);
    }
    ADMIN_PASSWORD = generateStrongPassword();
    ADMIN_PASSWORD_GENERATED = true;
    console.log('🔑 DEV ADMIN PASSWORD:', ADMIN_PASSWORD);
}

if (isProduction && (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64)) {
    console.error('❌ ENCRYPTION_KEY must be 64 hex chars.');
    process.exit(1);
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

function randomId(bytes = 32) { return crypto.randomBytes(bytes).toString('hex'); }
function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }

function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const A = Buffer.from(a);
    const B = Buffer.from(b);
    if (A.length !== B.length) return false;
    return crypto.timingSafeEqual(A, B);
}

function buildIdQuery(idParam) {
    const conditions = [];
    if (!idParam) return null;
    if (mongoose.Types.ObjectId.isValid(idParam)) conditions.push({ _id: idParam });
    conditions.push({ id: idParam });
    return { $or: conditions };
}

const PURIFY_CONFIG = { ALLOWED_TAGS: [], ALLOWED_ATTR: [], KEEP_CONTENT: true };

function sanitizeString(value) {
    if (typeof value !== 'string') return value;
    if (createDOMPurify) {
        try { return createDOMPurify.sanitize(value, PURIFY_CONFIG).trim(); } catch (e) {}
    }
    return value.replace(/[<>]/g, '').replace(/javascript:/gi, '').replace(/on\w+=/gi, '').trim();
}

function sanitizeDeep(obj, depth = 0) {
    if (depth > 10) return obj;
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return sanitizeString(obj);
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => sanitizeDeep(item, depth + 1));
    const cleaned = {};
    for (const key of Object.keys(obj)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
        cleaned[key] = sanitizeDeep(obj[key], depth + 1);
    }
    return cleaned;
}

function xssSanitizer(req, res, next) {
    try {
        if (req.body && typeof req.body === 'object') req.body = sanitizeDeep(req.body);
        if (req.query && typeof req.query === 'object') req.query = sanitizeDeep(req.query);
        if (req.params && typeof req.params === 'object') req.params = sanitizeDeep(req.params);
    } catch (err) {}
    next();
}

let emailTransporter = null;

async function setupEmailService() {
    if (process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY) {
        console.log('✅ Mailjet API configured — SMTP disabled');
        return null;
    }
    try {
        if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            const transporter = nodemailer.createTransport({
                host: process.env.EMAIL_HOST,
                port: Number(process.env.EMAIL_PORT) || 587,
                secure: process.env.EMAIL_SECURE === 'true',
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
                tls: { rejectUnauthorized: false },
                connectionTimeout: 10000,
                greetingTimeout: 10000,
                socketTimeout: 15000
            });
            await transporter.verify();
            console.log('✅ SMTP email ready:', process.env.EMAIL_USER);
            return transporter;
        }
        console.warn('⚠️ EMAIL_HOST غير محدد — Ethereal');
        const testAccount = await nodemailer.createTestAccount();
        const transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: { user: testAccount.user, pass: testAccount.pass }
        });
        await transporter.verify();
        console.log('✅ Ethereal email ready (DEV)');
        return transporter;
    } catch (error) {
        console.error('❌ Email setup error:', error.message);
        return null;
    }
}

async function initEmailService() { return setupEmailService(); }

async function sendEmail(to, subject, html) {
    const mjApiKey = process.env.MAILJET_API_KEY;
    const mjSecretKey = process.env.MAILJET_SECRET_KEY;

    if (mjApiKey && mjSecretKey) {
        try {
            const auth = Buffer.from(`${mjApiKey}:${mjSecretKey}`).toString('base64');
            const response = await fetch('https://api.mailjet.com/v3.1/send', {
                method: 'POST',
                headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    Messages: [{
                        From: {
                            Email: process.env.EMAIL_FROM || 'nejiamanallah22@gmail.com',
                            Name: process.env.EMAIL_FROM_NAME || 'منظومة الوسائل البحرية'
                        },
                        To: [{ Email: to }],
                        Subject: subject,
                        HTMLPart: html
                    }]
                })
            });
            if (!response.ok) {
                const errText = await response.text();
                console.error('❌ Mailjet API error:', response.status, errText.slice(0, 300));
                return null;
            }
            const data = await response.json();
            console.log('✅ Email sent via Mailjet API →', to);
            return data;
        } catch (error) {
            console.error('❌ Mailjet error:', error.message);
            return null;
        }
    }

    if (!emailTransporter) emailTransporter = await initEmailService();
    if (!emailTransporter) return null;
    try {
        const from = process.env.EMAIL_FROM || emailTransporter.options?.auth?.user || 'no-reply@marine-system.local';
        const info = await emailTransporter.sendMail({ from, to, subject, html });
        console.log('✅ Email sent via SMTP:', info.messageId);
        return info;
    } catch (error) {
        console.error('❌ SMTP error:', error.message);
        return null;
    }
}

setTimeout(() => {
    initEmailService().then(t => { emailTransporter = t; }).catch(() => {});
}, 100);

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
            imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'https://unpkg.com'],
            connectSrc: ["'self'", 'https://*.onrender.com', 'https://unpkg.com', 'https://*.googleapis.com', 'https://*.leafletjs.com', 'https://cdn.jsdelivr.net'],
            fontSrc: ["'self'", 'https:', 'data:', 'https://fonts.gstatic.com'],
            scriptSrcAttr: ["'unsafe-inline'"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            ...(isProduction ? { upgradeInsecureRequests: [] } : {})
        }
    },
    hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hidePoweredBy: true,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' }
}));

const allowedOrigins = (
    process.env.FRONTEND_URL ||
    'http://localhost:5000,http://localhost:3000,https://marine-system-71eo.onrender.com'
).split(',').map(v => v.trim()).filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('CORS origin denied'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-ID'],
    exposedHeaders: ['X-CSRF-Token', 'X-Session-Expiry', 'X-Request-ID']
}));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 500,
    standardHeaders: true, legacyHeaders: false,
    message: { success: false, error: 'Too many requests.' }
});
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 20,
    standardHeaders: true, legacyHeaders: false,
    message: { success: false, error: 'Too many authentication attempts.' }
});
const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, max: 5,
    standardHeaders: true, legacyHeaders: false,
    message: { success: false, error: 'Too many password reset attempts.' }
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use(compression());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false, limit: '5mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
    req.requestId = randomId(16).substring(0, 32);
    res.setHeader('X-Request-ID', req.requestId);
    next();
});

app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - started;
        if (!req.path.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf)$/)) {
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms RID=${req.requestId}`);
        }
    });
    next();
});

// ============================================================
// 📌 DB OWNERSHIP SIGNATURE
// ============================================================
async function registerOwnershipSignature() {
    try {
        if (!SystemLogo) return;
        const existing = await SystemLogo.findOne({ key: 'developer_signature' });
        if (existing) {
            console.log('📌 Developer signature already in DB');
            return;
        }
        await SystemLogo.create({
            key: 'developer_signature',
            developer: 'أمان الله ناجي',
            organization: 'إدارة إسناد الوحدات البحرية',
            organizationFull: 'الحرس الوطني التونسي - الإدارة العامة لحرس الحدود',
            systemName: 'منظومة الوسائل البحرية',
            version: '10.9.0',
            firstDeployment: new Date(),
            signature: 'AMAN-ALLAH-NAJI-MARINE-SYSTEM-' + new Date().getFullYear()
        });
        console.log('📌 Developer signature registered in DB');
    } catch (e) {
        console.warn('⚠️ DB signature:', e.message);
    }
}

// ============================================================
// 🍃 MONGODB
// ============================================================
let mongoConnected = false;

async function connectMongoDB() {
    const uri = process.env.MONGODB_URI;
    if (!uri) { console.error('❌ MONGODB_URI غير محدد'); return false; }
    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 15000,
            maxPoolSize: 10,
            minPoolSize: 2
        });
        mongoConnected = true;
        console.log('✅ MongoDB connected');
        console.log(`📊 Database: ${mongoose.connection.name}`);
        console.log(`🌐 Host: ${mongoose.connection.host}`);
        mongoose.connection.on('error', err => {
            console.error('❌ MongoDB error:', err.message);
            mongoConnected = false;
        });
        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️ MongoDB disconnected');
            mongoConnected = false;
        });
        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB reconnected');
            mongoConnected = true;
        });

        await createIndexes();
        await ensureAdminExists();
        await registerOwnershipSignature();
        await cleanupDemoVessels();
        await ensureInitialData();
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        mongoConnected = false;
        return false;
    }
}

async function createIndexes() {
    try {
        await Vessel.collection.createIndex({ id: 1 }, { unique: true, sparse: true });
        await Maintenance.collection.createIndex({ id: 1 }, { sparse: true });
        console.log('✅ Indexes ensured');
    } catch (error) {
        console.warn('⚠️ Index warning:', error.message);
    }
}

async function ensureAdminExists() {
    try {
        console.log('');
        console.log('🔍 ================ ADMIN CHECK ================');
        console.log(`   Username: ${ADMIN_USERNAME}`);
        console.log(`   Password length: ${ADMIN_PASSWORD.length}`);
        console.log(`   Auto reset: ${ALLOW_ADMIN_RESET ? 'ENABLED' : 'DISABLED'}`);
        console.log('================================================');
        console.log('');

        const existingAdmin = await User.findOne({ username: ADMIN_USERNAME });
        if (existingAdmin) {
            console.log(`✅ Admin user "${ADMIN_USERNAME}" exists in DB`);
            const updateData = {};
            if (existingAdmin.lockedUntil) updateData.lockedUntil = null;
            if (existingAdmin.loginAttempts && existingAdmin.loginAttempts > 0) updateData.loginAttempts = 0;
            if (existingAdmin.isActive === false) updateData.isActive = true;
            const currentRole = String(existingAdmin.role || '').trim();
            if (currentRole !== 'admin') updateData.role = 'admin';

            if (ALLOW_ADMIN_RESET) {
                let passwordMatches = false;
                try { passwordMatches = await bcrypt.compare(ADMIN_PASSWORD, existingAdmin.password); }
                catch (e) { passwordMatches = false; }
                if (!passwordMatches) {
                    updateData.password = await bcrypt.hash(ADMIN_PASSWORD, 12);
                    updateData.tokenVersion = (existingAdmin.tokenVersion || 0) + 1;
                }
            }
            if (Object.keys(updateData).length > 0) {
                updateData.updatedAt = new Date();
                await User.updateOne({ _id: existingAdmin._id }, { $set: updateData });
                console.log(`✅ Admin user updated (${Object.keys(updateData).length} field(s))`);
            } else {
                console.log('ℹ️  Admin user unchanged');
            }
            return;
        }

        console.log(`⚠️  Admin user "${ADMIN_USERNAME}" NOT FOUND - creating...`);
        const admin = await User.create({
            username: ADMIN_USERNAME,
            password: ADMIN_PASSWORD,
            name: ADMIN_NAME,
            email: ADMIN_EMAIL,
            role: 'admin',
            region: '',
            isActive: true,
            tokenVersion: 0,
            loginAttempts: 0,
            lockedUntil: null
        });
        console.log('✅ Admin user CREATED:', admin.username);
    } catch (error) {
        console.error('❌ Failed to ensure admin:', error.message);
    }
}

// ============================================================
// 📦 INITIAL DATA
// ============================================================
const SEED_MARKER = 'initial-data-planted-v1';
const DEMO_VESSEL_NAMES = ['الوحدة 101', 'الوحدة 205', 'الوحدة 312'];

async function ensureInitialData() {
    try {
        let seedMarker = null;
        try {
            seedMarker = await Log.findOne({
                action: 'seed', resource: 'system', resourceName: SEED_MARKER
            }).lean();
        } catch (e) {}

        if (seedMarker) {
            console.log('ℹ️ Initial data already planted — skipping');
            return;
        }

        const vesselCount = await Vessel.countDocuments();
        if (vesselCount > 0) {
            console.log(`✅ Vessels exist (${vesselCount}) — marking as planted`);
            try {
                await Log.create({
                    action: 'seed', resource: 'system', resourceName: SEED_MARKER, status: 'success',
                    details: { reason: 'existing-data-detected', vesselCount, timestamp: new Date().toISOString() }
                });
            } catch (e) {}
            return;
        }

        const seedEnabledInProd = process.env.SEED_DEFAULT_DATA === 'true';
        if (isProduction && !seedEnabledInProd) {
            console.log('ℹ️ Production mode — default seed DISABLED');
            try {
                await Log.create({
                    action: 'seed', resource: 'system', resourceName: SEED_MARKER, status: 'skipped',
                    details: { reason: 'production-no-seed', timestamp: new Date().toISOString() }
                });
            } catch (e) {}
            return;
        }

        console.log('📦 Creating initial vessels (ONE TIME ONLY)...');
        const nowIso = new Date().toISOString();

        const initialVessels = [
            { id: randomId(8), name: 'الوحدة 101', num: '101', len: 11, region: 'الشمال', zone: 'تونس', port: 'الميناء الرئيسي', supp: '—', status: 'صالح', break: '—', cat: 'البروق', createdBy: 'system' },
            { id: randomId(8), name: 'الوحدة 205', num: '205', len: 15, region: 'الساحل', zone: 'سوسة', port: 'ميناء سوسة', supp: '—', status: 'صيانة', break: 'محرك', fDate: nowIso, ref: 'M-2024-001', repairUnit: 'وحدة الصيانة تونس', cat: 'خوافر', createdBy: 'system' },
            { id: randomId(8), name: 'الوحدة 312', num: '312', len: 8, region: 'الجنوب', zone: 'جرجيس', port: 'ميناء جرجيس', supp: '—', status: 'معطب', break: 'هيكل', fDate: nowIso, ref: 'M-2024-002', repairUnit: 'وحدة الصيانة جرجيس', cat: 'صقور', createdBy: 'system' }
        ];

        await Vessel.insertMany(initialVessels);
        console.log(`✅ ${initialVessels.length} vessels created`);

        const initialLogs = [
            { id: randomId(8), vesselName: 'الوحدة 101', vesselNum: '101', type: 'صيانة دورية', status: 'مكتملة', date: nowIso, repairUnit: 'وحدة الصيانة تونس', cost: 500, notes: 'صيانة دورية', createdBy: 'system' },
            { id: randomId(8), vesselName: 'الوحدة 205', vesselNum: '205', type: 'إصلاح محرك', status: 'قيد التنفيذ', date: nowIso, repairUnit: 'وحدة الصيانة صفاقس', cost: 1200, notes: 'استبدال المحرك', createdBy: 'system' },
            { id: randomId(8), vesselName: 'الوحدة 312', vesselNum: '312', type: 'إصلاح هيكل', status: 'متأخرة', date: nowIso, repairUnit: 'وحدة الصيانة جرجيس', cost: 2000, notes: 'إصلاح الهيكل', createdBy: 'system' }
        ];

        await Maintenance.insertMany(initialLogs);
        console.log(`✅ ${initialLogs.length} maintenance logs created`);

        try {
            await Log.create({
                action: 'seed', resource: 'system', resourceName: SEED_MARKER, status: 'success',
                details: { vessels: initialVessels.length, maintenanceLogs: initialLogs.length, timestamp: new Date().toISOString() }
            });
            console.log('✅ Permanent seed marker created');
        } catch (e) {
            console.warn('⚠️ Could not create permanent marker:', e.message);
        }
    } catch (error) {
        console.error('❌ Failed in ensureInitialData:', error.message);
    }
}

async function cleanupDemoVessels() {
    try {
        const cleanupMarker = await Log.findOne({
            action: 'cleanup', resource: 'system', resourceName: 'demo-vessels-removed'
        }).lean();

        if (cleanupMarker) {
            console.log('ℹ️ Demo vessel cleanup already done');
            return;
        }

        const demoVessels = await Vessel.find({ name: { $in: DEMO_VESSEL_NAMES }, createdBy: 'system' }).lean();

        if (demoVessels.length === 0) {
            console.log('ℹ️ No demo vessels found — nothing to cleanup');
            try {
                await Log.create({
                    action: 'cleanup', resource: 'system', resourceName: 'demo-vessels-removed', status: 'success',
                    details: { removed: 0, reason: 'none-found' }
                });
            } catch (e) {}
            return;
        }

        console.log(`🧹 Found ${demoVessels.length} demo vessels — removing...`);
        const demoIds = demoVessels.map(v => v.id).filter(Boolean);
        const demoObjectIds = demoVessels.map(v => v._id).filter(Boolean);

        const vesselResult = await Vessel.deleteMany({ _id: { $in: demoObjectIds } });
        const logResult = await Maintenance.deleteMany({ vesselId: { $in: demoIds } });

        console.log(`✅ Removed ${vesselResult.deletedCount} demo vessels + ${logResult.deletedCount} maintenance logs`);

        try {
            await Log.create({
                action: 'cleanup', resource: 'system', resourceName: 'demo-vessels-removed', status: 'success',
                details: { removedVessels: vesselResult.deletedCount, removedLogs: logResult.deletedCount, names: DEMO_VESSEL_NAMES, timestamp: new Date().toISOString() }
            });
        } catch (e) {}
    } catch (error) {
        console.error('❌ Cleanup error:', error.message);
    }
}

// ============================================================
// 🍪 SESSION STORE
// ============================================================
let sessionStore = undefined;

async function buildSessionStore() {
    await initRedis();
    if (redisAvailable && redisClient && RedisStore) {
        try {
            sessionStore = new RedisStore({
                client: redisClient,
                prefix: 'marine:sess:',
                ttl: 30 * 24 * 60 * 60
            });
            console.log('✅ Redis session store enabled');
        } catch (e) {
            console.warn('⚠️ Redis session store failed:', e.message);
            sessionStore = undefined;
        }
    } else {
        console.log('ℹ️ Session Store: Memory (Redis unavailable)');
    }
}

// ============================================================
// 🔒 CSRF
// ============================================================
function ensureCsrfToken(req, res) {
    if (!req.session) return null;
    const now = Date.now();
    const expiry = req.session.csrfExpiry || 0;
    if (!req.session.csrfToken || now > expiry) {
        req.session.csrfToken = randomId(32);
        req.session.csrfExpiry = now + CSRF_MAX_AGE;
    }
    const token = req.session.csrfToken;
    res.setHeader('X-CSRF-Token', token);
    res.setHeader('X-Session-Expiry', req.session.csrfExpiry);
    try {
        res.cookie('marine_csrf', token, {
            httpOnly: false,
            secure: isProduction,
            sameSite: COOKIE_SAMESITE,
            maxAge: CSRF_MAX_AGE,
            path: '/'
        });
    } catch (e) {}
    return token;
}

const csrfExcluded = new Set([
    '/api/auth/login',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/verify-reset-token',
    '/api/csrf-token',
    '/api/health'
]);

function looksLikeClientCsrfToken(token) {
    if (typeof token !== 'string') return false;
    if (token.length < 20 || token.length > 200) return false;
    return /^\d{10,16}\.[a-z0-9]{5,30}\.[a-z0-9]{5,20}$/i.test(token);
}

function csrfProtection(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (csrfExcluded.has(req.path)) return next();
    const provided = req.headers['x-csrf-token'] || req.body?.csrf_token || req.cookies?.marine_csrf;
    const sessionToken = req.session?.csrfToken || null;
    const cookieToken = req.cookies?.marine_csrf || null;
    if (provided && sessionToken && safeEqual(String(provided), String(sessionToken))) return next();
    if (provided && cookieToken && safeEqual(String(provided), String(cookieToken))) {
        if (!sessionToken || safeEqual(String(cookieToken), String(sessionToken))) return next();
    }
    if (!isProduction && !sessionToken && looksLikeClientCsrfToken(provided)) return next();
    if (req.auth && req.user && req.auth.sid && req.auth.sub === req.user.id) {
        const refreshRecordPromise = getRefreshSession(req.auth.sid);
        return Promise.resolve(refreshRecordPromise)
            .then(record => {
                if (record && record.userId === req.user.id) return next();
                return res.status(403).json({ success: false, error: 'CSRF token غير صالح', code: 'CSRF_INVALID' });
            })
            .catch(() => {
                return res.status(403).json({ success: false, error: 'CSRF verification failed', code: 'CSRF_INVALID' });
            });
    }
    return res.status(403).json({ success: false, error: 'CSRF token غير صالح أو مفقود', code: 'CSRF_INVALID' });
}

// ============================================================
// 🔐 JWT
// ============================================================
function generateAccessToken(user, sessionId) {
    return jwt.sign(
        {
            sub: user.id, id: user.id, username: user.username, role: user.role,
            name: user.name, sid: sessionId, ver: user.tokenVersion || 0, type: 'access'
        },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRES, issuer: 'marine-system', audience: 'marine-system-client', jwtid: randomId(16) }
    );
}

function generateRefreshToken(user, sessionId) {
    return jwt.sign(
        { sub: user.id, id: user.id, sid: sessionId, type: 'refresh' },
        JWT_REFRESH_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRES, issuer: 'marine-system', audience: 'marine-system-client', jwtid: randomId(32) }
    );
}

// ============================================================
// 🔄 REFRESH SESSIONS
// ============================================================
const refreshSessions = new Map();

async function saveRefreshSession({ sessionId, userId, refreshToken }) {
    const record = {
        userId,
        tokenHash: hashToken(refreshToken),
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        expiresAt: Date.now() + REFRESH_TOKEN_MAX_AGE
    };

    if (isRedisAvailable()) {
        try {
            await redisClient.setEx(
                `marine:refresh:${sessionId}`,
                Math.floor(REFRESH_TOKEN_MAX_AGE / 1000),
                JSON.stringify(record)
            );
            return;
        } catch (e) {}
    }
    refreshSessions.set(sessionId, record);
}

async function getRefreshSession(sessionId) {
    if (!sessionId) return null;
    if (isRedisAvailable()) {
        try {
            const data = await redisClient.get(`marine:refresh:${sessionId}`);
            if (data) return JSON.parse(data);
            return null;
        } catch (e) {}
    }
    const record = refreshSessions.get(sessionId);
    if (!record) return null;
    if (Date.now() > record.expiresAt) {
        refreshSessions.delete(sessionId);
        return null;
    }
    return record;
}

async function revokeRefreshSession(sessionId) {
    if (!sessionId) return;
    if (isRedisAvailable()) {
        try { await redisClient.del(`marine:refresh:${sessionId}`); } catch (e) {}
    }
    refreshSessions.delete(sessionId);
}

async function revokeAllUserSessions(userId) {
    for (const [sessionId, record] of refreshSessions) {
        if (record.userId === userId) refreshSessions.delete(sessionId);
    }
    if (isRedisAvailable()) {
        try {
            const keys = await redisClient.keys('marine:refresh:*');
            for (const key of keys) {
                const data = await redisClient.get(key);
                if (!data) continue;
                const record = JSON.parse(data);
                if (record.userId === userId) await redisClient.del(key);
            }
        } catch (e) {}
    }
}

const revokedAccessTokens = new Map();

function revokeAccessToken(decoded) {
    if (!decoded?.jti) return;
    const expiry = decoded.exp ? decoded.exp * 1000 : Date.now() + ACCESS_TOKEN_MAX_AGE;
    revokedAccessTokens.set(decoded.jti, expiry);
}

function isAccessTokenRevoked(jti) {
    if (!jti) return false;
    const expiry = revokedAccessTokens.get(jti);
    if (!expiry) return false;
    if (Date.now() > expiry) {
        revokedAccessTokens.delete(jti);
        return false;
    }
    return true;
}

setInterval(() => {
    const now = Date.now();
    for (const [jti, expiry] of revokedAccessTokens) {
        if (now > expiry) revokedAccessTokens.delete(jti);
    }
    for (const [sessionId, record] of refreshSessions) {
        if (now > record.expiresAt) refreshSessions.delete(sessionId);
    }
}, 10 * 60 * 1000).unref();

// ============================================================
// 🔑 PASSWORD RESET
// ============================================================
const passwordResetTokens = [];

function createPasswordResetToken(email) {
    const existingIndex = passwordResetTokens.findIndex(item => item.email === email);
    if (existingIndex !== -1) passwordResetTokens.splice(existingIndex, 1);
    const token = randomId(32);
    passwordResetTokens.push({
        email, tokenHash: hashToken(token),
        expiresAt: Date.now() + 60 * 60 * 1000,
        createdAt: new Date().toISOString()
    });
    return token;
}

function findResetTokenRecord(token) {
    if (typeof token !== 'string' || !token) return null;
    const hashed = hashToken(token);
    const record = passwordResetTokens.find(item => safeEqual(item.tokenHash, hashed));
    if (!record) return null;
    if (Date.now() > record.expiresAt) return null;
    return record;
}

function verifyResetToken(email, token) {
    const record = findResetTokenRecord(token);
    return !!(record && record.email === email);
}

// ============================================================
// 📊 SYSTEM LOG + NOTIFICATIONS
// ============================================================
async function addSystemLog({
    userId = null, action = 'view', resource = 'system',
    resourceId = null, resourceName = '', userName = '', userEmail = '',
    ip = null, requestId = null, status = 'success', details = {}, error = null
}) {
    try {
        if (!mongoConnected) return;
        await Log.create({
            action, resource, resourceId, resourceModel: null, resourceName,
            userName, userEmail, ipAddress: ip, userAgent: null,
            details: { ...details, requestId }, status, error
        });
    } catch (e) {}
}

async function notify({
    userId = null, type = 'info', category = 'system',
    title, message = '', link = null, icon = 'bell',
    actorName = null, metadata = {}
}) {
    try {
        if (!mongoConnected) return null;
        if (!Notification) return null;
        if (!title) return null;
        const notif = new Notification({
            id: randomId(8),
            userId, type, category, title, message, link, icon, actorName, metadata,
            isRead: false
        });
        return await notif.save();
    } catch (e) {
        console.error('❌ notify() error:', e.message);
        return null;
    }
}

// ============================================================
// 🔐 AUTH MIDDLEWARE
// ============================================================
function extractBearerToken(req) {
    const header = req.headers.authorization;
    if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    return token || null;
}

function authenticateAccessToken(req, res, next) {
    const token = extractBearerToken(req);
    if (!token) return res.status(401).json({ success: false, error: 'غير مصرح' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET, {
            issuer: 'marine-system', audience: 'marine-system-client'
        });

        if (decoded.type !== 'access') {
            return res.status(401).json({ success: false, error: 'نوع التوكن غير صالح' });
        }
        if (isAccessTokenRevoked(decoded.jti)) {
            return res.status(401).json({ success: false, error: 'التوكن ملغى' });
        }

        User.findOne({ id: decoded.sub })
            .then(user => {
                if (!user || user.isActive !== true) {
                    return res.status(401).json({ success: false, error: 'المستخدم غير موجود أو غير نشط' });
                }
                if (typeof decoded.ver !== 'number' || decoded.ver !== (user.tokenVersion || 0)) {
                    return res.status(401).json({ success: false, error: 'جلسة التوثيق منتهية', code: 'TOKEN_VERSION_MISMATCH' });
                }
                if (!decoded.sid) {
                    return res.status(401).json({ success: false, error: 'جلسة التوثيق غير صالحة', code: 'SESSION_ID_MISSING' });
                }
                req.user = user;
                req.auth = decoded;
                next();
            })
            .catch(err => {
                console.error('❌ Auth lookup error:', err.message);
                return res.status(500).json({ success: false, error: 'خطأ في الخادم' });
            });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, error: 'انتهت صلاحية التوكن' });
        }
        return res.status(401).json({ success: false, error: 'توكن غير صالح' });
    }
}

// ============================================================
// 👑 RBAC
// ============================================================
const ROLE_PERMISSIONS = {
    admin: ['*'],
    manager: [
        'dashboard:view',
        'vessels:read', 'vessels:create', 'vessels:update',
        'maintenance:read', 'maintenance:create', 'maintenance:update', 'maintenance:delete',
        'notes:read', 'notes:create', 'notes:update', 'notes:delete',
        'notifications:read', 'logs:read'
    ],
    editor: [
        'dashboard:view',
        'vessels:read', 'vessels:create', 'vessels:update',
        'maintenance:read', 'maintenance:create', 'maintenance:update',
        'notes:read', 'notes:create', 'notes:update', 'notifications:read'
    ],
    maintenance_unit: [
        'dashboard:view',
        'vessels:read', 'vessels:create', 'vessels:update',
        'maintenance:read', 'maintenance:create', 'maintenance:update',
        'notes:read', 'notes:create', 'notes:update', 'notifications:read'
    ],
    viewer: ['dashboard:view', 'vessels:read', 'maintenance:read', 'notes:read', 'notifications:read']
};

const SENSITIVE_PERMISSIONS = {
    'users:manage': ['admin'],
    'monitoring:view': ['admin', 'manager', 'maintenance_unit'],
    'settings:manage': ['admin'],
    'sensitive:view': ['admin', 'manager'],
    'ready:view': ['admin', 'manager']
};

const ROLE_LABELS = {
    admin: 'مسؤول النظام',
    manager: 'مدير الأسطول',
    editor: 'محرر',
    maintenance_unit: 'وحدة الصيانة',
    viewer: 'مشاهد'
};

const LEGACY_ROLE_MAP = {
    'مسؤول': 'admin', 'مدير': 'manager', 'محرر': 'editor',
    'مشغل': 'maintenance_unit', 'مشاهد': 'viewer',
    'operator': 'maintenance_unit', 'super_admin': 'admin'
};

function normalizeRole(role) {
    if (!role) return 'viewer';
    const trimmed = String(role).trim();
    if (ROLE_PERMISSIONS[trimmed]) return trimmed;
    return LEGACY_ROLE_MAP[trimmed] || 'viewer';
}

function hasPermission(user, permission) {
    if (!user) return false;
    const role = normalizeRole(user.role);
    if (SENSITIVE_PERMISSIONS[permission]) {
        return SENSITIVE_PERMISSIONS[permission].includes(role);
    }
    const permissions = ROLE_PERMISSIONS[role] || [];
    if (permissions.includes('*')) return true;
    if (permissions.includes(permission)) return true;
    const [resource] = permission.split(':');
    if (permissions.includes(`${resource}:*`)) return true;
    return false;
}

function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.user || !hasPermission(req.user, permission)) {
            return res.status(403).json({
                success: false, error: 'ليس لديك الصلاحية الكافية',
                code: 'PERMISSION_DENIED', required: permission
            });
        }
        next();
    };
}

function requireOneOf(...permissions) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ success: false, error: 'غير مصرح' });
        const hasAny = permissions.some(p => hasPermission(req.user, p));
        if (!hasAny) {
            return res.status(403).json({
                success: false, error: 'ليس لديك الصلاحية الكافية',
                code: 'PERMISSION_DENIED', required: permissions
            });
        }
        next();
    };
}

function isAdminUser(user) { return user && normalizeRole(user.role) === 'admin'; }

function requireAdmin(req, res, next) {
    if (!isAdminUser(req.user)) {
        return res.status(403).json({
            success: false, error: 'هذه العملية متاحة للمسؤول فقط', code: 'ADMIN_ONLY'
        });
    }
    next();
}

// ============================================================
// 📝 FORMATTERS
// ============================================================
function formatUser(user) {
    if (!user) return null;
    const normalizedRole = normalizeRole(user.role);
    return {
        id: user.id,
        _id: user._id ? user._id.toString() : null,
        username: user.username,
        name: user.name,
        email: user.email,
        role: normalizedRole,
        roleLabel: ROLE_LABELS[normalizedRole] || normalizedRole,
        region: user.region || '',
        active: user.isActive,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
    };
}

function formatVessel(vessel) {
    if (!vessel) return null;
    return {
        id: vessel.id,
        _id: vessel._id ? vessel._id.toString() : null,
        name: vessel.name, num: vessel.num || '', len: vessel.len || 0,
        region: vessel.region || '', zone: vessel.zone || '', port: vessel.port || '',
        supp: vessel.supp || '',
        status: vessel.status || vessel.stat || 'صالح',
        stat: vessel.stat || vessel.status || 'صالح',
        break: vessel.break || '',
        fDate: vessel.fDate || null, eDate: vessel.eDate || null,
        ref: vessel.ref || '', repairUnit: vessel.repairUnit || '',
        cat: vessel.cat || '', category: vessel.cat || vessel.category || '',
        type: vessel.type || '', location: vessel.location || '',
        createdAt: vessel.createdAt, updatedAt: vessel.updatedAt
    };
}

function formatMaintenance(log) {
    if (!log) return null;
    const isoDate = log.date || log.startDate || log.createdAt || new Date().toISOString();
    let displayDate = isoDate;
    try {
        const d = new Date(isoDate);
        if (!isNaN(d.getTime())) displayDate = d.toLocaleDateString('ar-EG');
    } catch (e) {}

    const rawParts = log.partsUsed || log.parts || [];
    const parts = (Array.isArray(rawParts) ? rawParts : []).map(p => ({
        name: p.partName || p.name || '',
        quantity: Number(p.quantity) || 1,
        price: Number(p.cost || p.price) || 0,
        total: (Number(p.cost || p.price) || 0) * (Number(p.quantity) || 1)
    }));

    return {
        id: log.id,
        _id: log._id ? log._id.toString() : null,
        vesselId: log.vesselId || '',
        vesselName: log.vesselName || '—',
        vessel: log.vesselName || '—',
        vesselNum: log.vesselNum || '',
        repairUnit: log.repairUnit || '—',
        unit: log.repairUnit || '—',
        technician: log.supervisorName || log.supervisor || 'غير محدد',
        supervisorName: log.supervisorName || '',
        phone: typeof log.supervisor === 'string' ? log.supervisor : '',
        type: log.type || 'صيانة دورية',
        interventionType: log.type || 'صيانة دورية',
        faultType: log.faultType || 'أخرى',
        priority: log.priority || 'متوسط',
        date: displayDate, isoDate: isoDate,
        startDate: log.startDate, endDate: log.endDate,
        createdAt: log.createdAt, updatedAt: log.updatedAt,
        cost: Number(log.cost) || 0,
        parts: parts, partsUsed: parts,
        description: log.description || '', notes: log.notes || '',
        status: log.status || 'قيد الانتظار'
    };
}

// ============================================================
// 🚀 STARTUP
// ============================================================
(async () => {
    const mongoOk = await connectMongoDB();
    if (!mongoOk && isProduction) {
        console.error('❌ FATAL: MongoDB is required in production');
        process.exit(1);
    }

    await buildSessionStore();

    app.use(session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        ...(sessionStore ? { store: sessionStore } : {}),
        name: isProduction ? '__Secure-marine.sid' : 'marine.sid',
        cookie: {
            httpOnly: true,
            secure: isProduction,
            sameSite: COOKIE_SAMESITE,
            maxAge: 30 * 24 * 60 * 60 * 1000,
            path: '/'
        },
        rolling: true,
        proxy: isProduction
    }));

    app.use((req, res, next) => {
        ensureCsrfToken(req, res);
        next();
    });

    // ========================================================
    // PUBLIC ENDPOINTS
    // ========================================================
    app.get('/api/csrf-token', (req, res) => {
        const token = ensureCsrfToken(req, res);
        return res.json({ success: true, token: token || null, expiresIn: CSRF_MAX_AGE });
    });

    app.get('/api/health', (req, res) => {
        return res.json({
            success: true, status: 'online', service: 'Marine System', version: '10.9.0',
            developer: 'أمان الله ناجي', organization: 'إدارة إسناد الوحدات البحرية',
            timestamp: new Date().toISOString(),
            mongodb: mongoConnected ? 'connected' : 'disconnected',
            redis: redisAvailable ? 'connected' : 'memory',
            email: (process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY) ? 'mailjet-api' : (process.env.EMAIL_HOST ? 'smtp' : 'not-configured'),
            seed: { marker: SEED_MARKER, production: isProduction, enabled: process.env.SEED_DEFAULT_DATA === 'true' },
            models: {
                User: !!User, Vessel: !!Vessel, Maintenance: !!Maintenance,
                Log: !!Log, Ticket: !!Ticket, Note: !!Note,
                Notification: !!Notification, UserSettings: !!UserSettings, SystemLogo: !!SystemLogo
            }
        });
    });

    // ========================================================
    // 🔐 LOGIN
    // ========================================================
    app.post('/api/auth/login', async (req, res) => {
        try {
            const { username, password } = req.body;
            const clientIP = req.ip || req.socket.remoteAddress;

            if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
                return res.status(400).json({ success: false, error: 'بيانات غير صالحة' });
            }

            const user = await User.findOne({ username: username.trim() });
            if (!user) {
                await addSystemLog({
                    action: 'login', resource: 'user', status: 'error',
                    ip: clientIP, requestId: req.requestId,
                    details: { reason: 'user_not_found', username }
                });
                return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
            }

            if (user.lockedUntil && Date.now() < user.lockedUntil.getTime()) {
                const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
                return res.status(403).json({ success: false, error: `الحساب مقفل. حاول بعد ${remainingMinutes} دقيقة` });
            }

            if (user.lockedUntil && Date.now() >= user.lockedUntil.getTime()) {
                user.lockedUntil = null;
                user.loginAttempts = 0;
                await user.save();
            }

            if (user.isActive === false) {
                return res.status(403).json({ success: false, error: 'الحساب معطّل. تواصل مع المسؤول' });
            }

            const valid = await bcrypt.compare(password, user.password);
            if (!valid) {
                user.loginAttempts = (user.loginAttempts || 0) + 1;
                if (user.loginAttempts >= 5) {
                    user.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
                    await user.save();
                    return res.status(403).json({ success: false, error: 'الحساب مقفل لمدة 30 دقيقة' });
                }
                await user.save();
                return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
            }

            user.loginAttempts = 0;
            user.lockedUntil = null;
            user.lastLogin = new Date();
            await user.save();

            const sessionId = randomId(32);
            const accessToken = generateAccessToken(user, sessionId);
            const refreshToken = generateRefreshToken(user, sessionId);

            await saveRefreshSession({ sessionId, userId: user.id, refreshToken });

            if (req.session) {
                req.session.userId = user.id;
                req.session.sessionId = sessionId;
            }

            await new Promise(resolve => {
                if (!req.session) return resolve();
                req.session.save(err => {
                    if (err) console.warn('⚠️ session.save:', err.message);
                    resolve();
                });
            });

            const newCsrfToken = ensureCsrfToken(req, res);

            const refreshCookieName = isProduction ? '__Secure-marine.refresh' : 'marine.refresh';
            res.cookie(refreshCookieName, refreshToken, {
                httpOnly: true, secure: isProduction,
                sameSite: COOKIE_SAMESITE, maxAge: REFRESH_TOKEN_MAX_AGE, path: '/api/auth'
            });

            await addSystemLog({
                userId: user.id, userName: user.name, userEmail: user.email,
                action: 'login', resource: 'user', status: 'success',
                ip: clientIP, requestId: req.requestId
            });

            return res.json({
                success: true, token: accessToken, expiresIn: ACCESS_TOKEN_MAX_AGE,
                csrfToken: newCsrfToken,
                session: {
                    csrfToken: newCsrfToken,
                    csrfExpiry: req.session?.csrfExpiry || (Date.now() + CSRF_MAX_AGE)
                },
                user: formatUser(user)
            });
        } catch (error) {
            console.error('❌ Login error:', error);
            return res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });

    // ========================================================
    // 🔄 REFRESH
    // ========================================================
    app.post('/api/auth/refresh', async (req, res) => {
        try {
            const cookieName = isProduction ? '__Secure-marine.refresh' : 'marine.refresh';
            const refreshToken = req.cookies[cookieName];
            if (!refreshToken) return res.status(401).json({ success: false, error: 'Refresh token غير موجود' });

            const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, {
                issuer: 'marine-system', audience: 'marine-system-client'
            });
            if (decoded.type !== 'refresh') {
                return res.status(401).json({ success: false, error: 'Refresh token غير صالح' });
            }

            const record = await getRefreshSession(decoded.sid);
            if (!record) return res.status(401).json({ success: false, error: 'جلسة غير موجودة' });
            if (record.userId !== decoded.sub) {
                await revokeRefreshSession(decoded.sid);
                return res.status(401).json({ success: false, error: 'جلسة غير صالحة' });
            }
            if (!safeEqual(record.tokenHash, hashToken(refreshToken))) {
                await revokeRefreshSession(decoded.sid);
                const replayUser = await User.findOne({ id: decoded.sub });
                if (replayUser) {
                    replayUser.tokenVersion = (replayUser.tokenVersion || 0) + 1;
                    await replayUser.save();
                }
                return res.status(401).json({ success: false, error: 'Refresh token غير صالح' });
            }

            const user = await User.findOne({ id: decoded.sub });
            if (!user || !user.isActive) {
                await revokeRefreshSession(decoded.sid);
                return res.status(401).json({ success: false, error: 'المستخدم غير نشط' });
            }

            const newSessionId = randomId(32);
            const newRefreshToken = generateRefreshToken(user, newSessionId);
            const newAccessToken = generateAccessToken(user, newSessionId);

            await revokeRefreshSession(decoded.sid);
            await saveRefreshSession({ sessionId: newSessionId, userId: user.id, refreshToken: newRefreshToken });

            if (req.session) {
                req.session.userId = user.id;
                req.session.sessionId = newSessionId;
            }
            await new Promise(resolve => {
                if (!req.session) return resolve();
                req.session.save(err => {
                    if (err) console.warn('⚠️ session.save:', err.message);
                    resolve();
                });
            });

            const newCsrfToken = ensureCsrfToken(req, res);
            res.cookie(cookieName, newRefreshToken, {
                httpOnly: true, secure: isProduction,
                sameSite: COOKIE_SAMESITE, maxAge: REFRESH_TOKEN_MAX_AGE, path: '/api/auth'
            });

            return res.json({
                success: true, token: newAccessToken, expiresIn: ACCESS_TOKEN_MAX_AGE,
                csrfToken: newCsrfToken,
                session: {
                    csrfToken: newCsrfToken,
                    csrfExpiry: req.session?.csrfExpiry || (Date.now() + CSRF_MAX_AGE)
                },
                user: formatUser(user)
            });
        } catch (error) {
            return res.status(401).json({ success: false, error: 'Refresh token غير صالح أو منتهي' });
        }
    });

    // ========================================================
    // 👤 CURRENT USER
    // ========================================================
    app.get('/api/auth/me', authenticateAccessToken, (req, res) => {
        return res.json({ success: true, user: formatUser(req.user) });
    });

    // ========================================================
    // 🔑 USER PERMISSIONS
    // ========================================================
    app.get('/api/auth/permissions', authenticateAccessToken, (req, res) => {
        const role = normalizeRole(req.user.role);
        const permissions = ROLE_PERMISSIONS[role] || [];

        const capabilities = {
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
        };

        return res.json({
            success: true, role,
            roleLabel: ROLE_LABELS[role] || role,
            permissions, capabilities
        });
    });

    // ========================================================
    // 🚪 LOGOUT
    // ========================================================
    app.post('/api/auth/logout', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            const clientIP = req.ip || req.socket.remoteAddress;
            const accessJti = req.auth?.jti;
            const jwtSessionId = req.auth?.sid;
            const expressSessionId = req.session?.sessionId;

            if (accessJti) revokeAccessToken(req.auth);

            const sessionIds = new Set();
            if (jwtSessionId) sessionIds.add(jwtSessionId);
            if (expressSessionId) sessionIds.add(expressSessionId);
            for (const sessionId of sessionIds) await revokeRefreshSession(sessionId);

            // ✅ v10.9: حذف موقع هذه الجلسة تحديداً
            try {
                if (jwtSessionId) liveLocations.delete(jwtSessionId);
                if (expressSessionId && expressSessionId !== jwtSessionId) liveLocations.delete(expressSessionId);
            } catch(e) {}

            await addSystemLog({
                userId: req.user?.id || null, userName: req.user?.name || '',
                action: 'logout', resource: 'user', status: 'success',
                ip: clientIP, requestId: req.requestId
            });

            await new Promise(resolve => {
                if (!req.session) return resolve();
                req.session.destroy(err => {
                    if (err) console.warn('⚠️ session.destroy:', err.message);
                    resolve();
                });
            });

            const refreshCookieName = isProduction ? '__Secure-marine.refresh' : 'marine.refresh';
            const sessionCookieName = isProduction ? '__Secure-marine.sid' : 'marine.sid';

            res.clearCookie(refreshCookieName, { httpOnly: true, secure: isProduction, sameSite: COOKIE_SAMESITE, path: '/api/auth' });
            res.clearCookie(sessionCookieName, { httpOnly: true, secure: isProduction, sameSite: COOKIE_SAMESITE, path: '/' });
            res.clearCookie('marine_csrf', { httpOnly: false, secure: isProduction, sameSite: COOKIE_SAMESITE, path: '/' });

            return res.status(200).json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'خطأ أثناء تسجيل الخروج' });
        }
    });

    // ========================================================
    // 🔐 PASSWORD RESET
    // ========================================================
    app.post('/api/auth/forgot-password', forgotPasswordLimiter, async (req, res) => {
        try {
            const { email } = req.body;
            if (typeof email !== 'string' || !email.trim()) {
                return res.status(400).json({ success: false, error: 'البريد الإلكتروني مطلوب' });
            }
            const user = await User.findOne({ email: email.trim().toLowerCase() });
            if (!user) return res.json({ success: true, message: 'إذا كان البريد مسجلاً فسيتم إرسال تعليمات إعادة التعيين' });

            const resetToken = createPasswordResetToken(user.email);
            const resetLink = `${req.protocol}://${req.get('host')}/reset-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(user.email)}`;
            const emailHtml = `<div dir="rtl" style="font-family:Arial,sans-serif"><h2>🔐 إعادة تعيين كلمة المرور</h2><p>مرحباً <strong>${String(user.name || user.username)}</strong></p><p>استخدم الرابط التالي:</p><p><a href="${resetLink}">إعادة تعيين كلمة المرور</a></p><p>الرابط صالح لمدة ساعة.</p></div>`;
            await sendEmail(user.email, 'إعادة تعيين كلمة المرور - منظومة الوسائل البحرية', emailHtml);

            const responsePayload = { success: true, message: 'تم إنشاء طلب إعادة تعيين كلمة المرور' };
            if (!isProduction) {
                responsePayload.resetLink = resetLink;
                responsePayload.devNote = 'DEV ONLY';
            }
            return res.json(responsePayload);
        } catch (error) {
            return res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
        }
    });

    app.post('/api/auth/verify-reset-token', (req, res) => {
        try {
            const { email, token } = req.body;
            const valid = typeof email === 'string' && typeof token === 'string' && verifyResetToken(email, token);
            return res.json({ success: true, valid });
        } catch {
            return res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
        }
    });

    app.post('/api/auth/reset-password', async (req, res) => {
        try {
            const { email, token, newPassword } = req.body;
            if (!email || !token || !newPassword) {
                return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
            }
            if (!verifyResetToken(email, token)) {
                return res.status(400).json({ success: false, error: 'رابط غير صالح أو منتهي' });
            }
            if (!isStrongPassword(newPassword)) {
                return res.status(400).json({ success: false, error: 'كلمة المرور ضعيفة' });
            }
            const user = await User.findOne({ email: email.toLowerCase() });
            if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

            user.password = newPassword;
            user.tokenVersion = (user.tokenVersion || 0) + 1;
            await user.save();

            await revokeAllUserSessions(user.id);

            const index = passwordResetTokens.findIndex(item => item.email === email && safeEqual(item.tokenHash, hashToken(token)));
            if (index !== -1) passwordResetTokens.splice(index, 1);

            return res.json({ success: true, message: 'تم إعادة تعيين كلمة المرور بنجاح' });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
        }
    });

    // ========================================================
    // 📝 NOTES
    // ========================================================
    app.get('/api/notes', authenticateAccessToken, async (req, res) => {
        try {
            if (!Note) return res.json([]);
            const notes = await Note.find().sort({ createdAt: -1 }).limit(500).lean();
            return res.json(notes.map(n => ({
                id: n._id.toString(), title: n.title, content: n.content,
                type: n.type, number: n.number, status: n.status,
                weekNumber: n.weekNumber, year: n.year,
                createdByName: n.createdByName || 'مستخدم',
                createdAt: n.createdAt, updatedAt: n.updatedAt
            })));
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل تحميل الملاحظات' });
        }
    });

    app.get('/api/notes/:id', authenticateAccessToken, async (req, res) => {
        try {
            if (!Note) return res.status(404).json({ success: false, error: 'الموديل غير متاح' });
            const note = await Note.findById(req.params.id);
            if (!note) return res.status(404).json({ success: false, error: 'الملاحظة غير موجودة' });
            note.views = (note.views || 0) + 1;
            await note.save();
            return res.json({
                success: true,
                note: {
                    id: note._id.toString(), title: note.title, content: note.content,
                    type: note.type, number: note.number, status: note.status,
                    createdByName: note.createdByName, createdAt: note.createdAt, views: note.views
                }
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل تحميل الملاحظة' });
        }
    });

    app.post('/api/notes', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            if (!Note) return res.status(500).json({ success: false, error: 'موديل الملاحظات غير متاح' });

            const { title, content, date, priority, type, weekNumber } = req.body;
            if (typeof title !== 'string' || !title.trim()) {
                return res.status(400).json({ success: false, error: 'العنوان مطلوب' });
            }
            if (typeof content !== 'string' || !content.trim()) {
                return res.status(400).json({ success: false, error: 'المحتوى مطلوب' });
            }

            var noteType = type || 'عام';
            if (priority === 'عاجل') noteType = 'عاجلة';
            else if (priority === 'مهم') noteType = 'مهمة';

            var weekNum = weekNumber;
            if (!weekNum) {
                try {
                    var d = date ? new Date(date) : new Date();
                    var start = new Date(d.getFullYear(), 0, 1);
                    var diff = Math.floor((d - start) / 86400000);
                    weekNum = Math.ceil((diff + start.getDay() + 1) / 7);
                    if (weekNum < 1) weekNum = 1;
                    if (weekNum > 53) weekNum = 53;
                } catch (e) { weekNum = 1; }
            }

            var createdById;
            try {
                createdById = mongoose.Types.ObjectId.isValid(req.user._id) ? req.user._id : new mongoose.Types.ObjectId();
            } catch (e) {
                createdById = new mongoose.Types.ObjectId();
            }

            const note = await Note.create({
                title: title.trim(), content: content.trim(),
                type: noteType, weekNumber: weekNum,
                year: new Date().getFullYear(), status: 'مسودة',
                createdBy: createdById,
                createdByName: req.user.name || req.user.username
            });

            await addSystemLog({
                userId: req.user.id, userName: req.user.name,
                action: 'create', resource: 'note',
                resourceId: note._id.toString(), resourceName: note.title,
                status: 'success', ip: req.ip, requestId: req.requestId
            });

            await notify({
                type: 'success', category: 'system',
                title: 'ملاحظة جديدة',
                message: 'تم إضافة "' + note.title + '" بواسطة ' + (req.user.name || req.user.username),
                link: '/pages/notes.html', icon: 'sticky-note',
                actorName: req.user.name || req.user.username
            });

            return res.status(201).json({
                success: true, message: 'تم إضافة الملاحظة بنجاح',
                note: {
                    id: note._id.toString(), title: note.title, content: note.content,
                    type: note.type, status: note.status,
                    createdByName: note.createdByName, createdAt: note.createdAt
                }
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل إضافة الملاحظة', details: error.message });
        }
    });

    app.put('/api/notes/:id', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            if (!Note) return res.status(500).json({ success: false, error: 'موديل الملاحظات غير متاح' });

            const { title, content, priority, type } = req.body;
            const idQuery = buildIdQuery(req.params.id);
            const note = await Note.findOne(idQuery);
            if (!note) return res.status(404).json({ success: false, error: 'الملاحظة غير موجودة' });

            if (title !== undefined) note.title = title.trim();
            if (content !== undefined) note.content = content.trim();

            if (type !== undefined) {
                note.type = type;
            } else if (priority !== undefined) {
                if (priority === 'عاجل') note.type = 'عاجلة';
                else if (priority === 'مهم') note.type = 'مهمة';
                else note.type = 'عام';
            }

            await note.save();

            await addSystemLog({
                userId: req.user.id, userName: req.user.name,
                action: 'update', resource: 'note',
                resourceId: note._id.toString(), resourceName: note.title,
                status: 'success', ip: req.ip, requestId: req.requestId
            });

            await notify({
                type: 'info', category: 'system',
                title: 'تعديل ملاحظة',
                message: 'تم تعديل "' + note.title + '" بواسطة ' + (req.user.name || req.user.username),
                link: '/pages/notes.html', icon: 'edit',
                actorName: req.user.name || req.user.username
            });

            return res.json({
                success: true, message: 'تم تحديث الملاحظة',
                note: {
                    id: note._id.toString(), title: note.title, content: note.content,
                    type: note.type, status: note.status, createdAt: note.createdAt
                }
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل تحديث الملاحظة', details: error.message });
        }
    });

    app.delete('/api/notes/:id', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            if (!Note) return res.status(500).json({ success: false, error: 'موديل الملاحظات غير متاح' });

            const idQuery = buildIdQuery(req.params.id);
            const note = await Note.findOne(idQuery);
            if (!note) return res.status(404).json({ success: false, error: 'الملاحظة غير موجودة' });

            const title = note.title;
            const noteId = note._id.toString();
            await Note.deleteOne({ _id: note._id });

            await addSystemLog({
                userId: req.user.id, userName: req.user.name,
                action: 'delete', resource: 'note',
                resourceId: noteId, resourceName: title,
                status: 'success', ip: req.ip, requestId: req.requestId
            });

            await notify({
                type: 'warning', category: 'system',
                title: 'حذف ملاحظة',
                message: 'تم حذف "' + title + '" بواسطة ' + (req.user.name || req.user.username),
                link: '/pages/notes.html', icon: 'trash',
                actorName: req.user.name || req.user.username
            });

            return res.json({ success: true, message: 'تم حذف الملاحظة' });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل حذف الملاحظة', details: error.message });
        }
    });

    // ========================================================
    // 🔔 NOTIFICATIONS
    // ========================================================
    app.get('/api/notifications', authenticateAccessToken, async (req, res) => {
        try {
            if (!Notification) return res.json({ success: true, notifications: [], unreadCount: 0, total: 0 });
            const limit = Math.min(parseInt(req.query.limit) || 20, 100);
            const userId = req.user.id;

            const notifications = await Notification.find({
                $or: [{ userId: userId }, { userId: null }]
            }).sort({ createdAt: -1 }).limit(limit).lean();

            const unreadCount = await Notification.countDocuments({
                $or: [{ userId: userId }, { userId: null }], isRead: false
            });

            return res.json({
                success: true,
                notifications: notifications.map(n => ({
                    id: n._id.toString(), type: n.type, category: n.category,
                    title: n.title, message: n.message, link: n.link, icon: n.icon,
                    isRead: n.isRead, actorName: n.actorName, createdAt: n.createdAt
                })),
                unreadCount, total: notifications.length
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل تحميل الإشعارات' });
        }
    });

    app.get('/api/notifications/unread-count', authenticateAccessToken, async (req, res) => {
        try {
            if (!Notification) return res.json({ success: true, unreadCount: 0 });
            const unreadCount = await Notification.countDocuments({
                $or: [{ userId: req.user.id }, { userId: null }], isRead: false
            });
            return res.json({ success: true, unreadCount });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل جلب العدد' });
        }
    });

    app.put('/api/notifications/:id/read', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            if (!Notification) return res.json({ success: true, updated: 0 });
            const idQuery = buildIdQuery(req.params.id);
            const result = await Notification.updateOne(idQuery, { $set: { isRead: true } });
            return res.json({ success: true, updated: result.modifiedCount });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل التحديث' });
        }
    });

    app.put('/api/notifications/read-all', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            if (!Notification) return res.json({ success: true, updated: 0 });
            const result = await Notification.updateMany(
                { $or: [{ userId: req.user.id }, { userId: null }], isRead: false },
                { $set: { isRead: true } }
            );
            return res.json({ success: true, updated: result.modifiedCount });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل التحديث' });
        }
    });

    app.delete('/api/notifications/:id', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            if (!Notification) return res.json({ success: true });
            const idQuery = buildIdQuery(req.params.id);
            await Notification.deleteOne(idQuery);
            return res.json({ success: true });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل الحذف' });
        }
    });

    app.delete('/api/notifications', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            if (!Notification) return res.json({ success: true, deleted: 0 });
            const result = await Notification.deleteMany({
                $or: [{ userId: req.user.id }, { userId: null }]
            });
            return res.json({ success: true, deleted: result.deletedCount });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل الحذف' });
        }
    });

    // ========================================================
    // 📊 MONITORING
    // ========================================================
    app.get('/api/monitoring/users', authenticateAccessToken, requirePermission('monitoring:view'), async (req, res) => {
        try {
            const users = await User.find().sort({ createdAt: -1 }).limit(500);
            const total = await User.countDocuments();
            const active = await User.countDocuments({ isActive: true });
            return res.json({
                success: true,
                users: users.map(u => formatUser(u)),
                stats: { total, active, inactive: total - active }
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل تحميل بيانات المستخدمين' });
        }
    });

    app.get('/api/monitoring/sessions', authenticateAccessToken, requirePermission('monitoring:view'), async (req, res) => {
        try {
            const sessions = [];
            if (isRedisAvailable()) {
                try {
                    const keys = await redisClient.keys('marine:refresh:*');
                    for (const key of keys) {
                        const data = await redisClient.get(key);
                        if (!data) continue;
                        const record = JSON.parse(data);
                        if (record.expiresAt > Date.now()) {
                            const user = await User.findOne({ id: record.userId });
                            sessions.push({
                                sessionId: key.replace('marine:refresh:', '').substring(0, 12) + '...',
                                userId: record.userId,
                                username: user?.username || 'unknown',
                                name: user?.name || 'unknown',
                                role: user?.role || 'unknown',
                                createdAt: record.createdAt,
                                lastUsedAt: record.lastUsedAt,
                                expiresAt: record.expiresAt
                            });
                        }
                    }
                } catch (e) {
                    console.warn('⚠️ Redis sessions read error:', e.message);
                }
            }
            for (const [sessionId, record] of refreshSessions) {
                if (record.expiresAt > Date.now()) {
                    const user = await User.findOne({ id: record.userId });
                    sessions.push({
                        sessionId: sessionId.substring(0, 12) + '...',
                        userId: record.userId,
                        username: user?.username || 'unknown',
                        name: user?.name || 'unknown',
                        role: user?.role || 'unknown',
                        createdAt: record.createdAt,
                        lastUsedAt: record.lastUsedAt,
                        expiresAt: record.expiresAt
                    });
                }
            }
            return res.json({ success: true, sessions, stats: { total: sessions.length } });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل تحميل الجلسات' });
        }
    });

    // ========================================================
    // 📍 LIVE LOCATIONS (v10.9.0 — multi-device via sessionKey)
    // ========================================================
    const liveLocations = new Map();          // sessionKey -> location
    const LOCATION_MAX_AGE = 24 * 60 * 60 * 1000;
    const MAX_SESSIONS_PER_USER = 5;          // ✅ حد أقصى 5 أجهزة لكل مستخدم

    function buildLocationsList() {
        const now = Date.now();
        const list = [];
        for (const [key, loc] of liveLocations) {
            if (now - new Date(loc.timestamp).getTime() > LOCATION_MAX_AGE) {
                liveLocations.delete(key);
                continue;
            }
            list.push(loc);
        }
        list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return list;
    }

    function getLocationSessionKey(req) {
        // ✅ استخدم sessionId من JWT — يدعم أجهزة متعددة
        if (req.auth && req.auth.sid) return req.auth.sid;
        // fallback: استخدم userId
        return req.user.id;
    }

    // ✅ تنظيف الجلسات القديمة لنفس المستخدم (يمنع التراكم)
    function pruneUserSessions(userId) {
        const userKeys = [];
        for (const [key, loc] of liveLocations) {
            if (loc.userId === userId) userKeys.push(key);
        }
        if (userKeys.length <= MAX_SESSIONS_PER_USER) return;
        // احذف الأقدم
        userKeys.sort((a, b) => {
            const ta = new Date(liveLocations.get(a).timestamp).getTime();
            const tb = new Date(liveLocations.get(b).timestamp).getTime();
            return ta - tb;
        });
        const toRemove = userKeys.slice(0, userKeys.length - MAX_SESSIONS_PER_USER);
        for (const k of toRemove) liveLocations.delete(k);
    }

    app.get('/api/locations', authenticateAccessToken, (req, res) => {
        try {
            const list = buildLocationsList();
            return res.json({
                success: true,
                count: list.length,
                locations: list,
                viewer: {
                    id: req.user.id,
                    username: req.user.username,
                    name: req.user.name,
                    role: normalizeRole(req.user.role),
                    roleLabel: ROLE_LABELS[normalizeRole(req.user.role)] || req.user.role,
                    sessionKey: getLocationSessionKey(req)
                }
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل تحميل المواقع' });
        }
    });

    app.get('/api/monitoring/locations',
        authenticateAccessToken,
        requirePermission('monitoring:view'),
        (req, res) => {
            try {
                const list = buildLocationsList();
                return res.json({
                    success: true,
                    count: list.length,
                    locations: list,
                    viewer: {
                        id: req.user.id,
                        username: req.user.username,
                        name: req.user.name,
                        role: normalizeRole(req.user.role),
                        roleLabel: ROLE_LABELS[normalizeRole(req.user.role)] || req.user.role,
                        sessionKey: getLocationSessionKey(req)
                    }
                });
            } catch (error) {
                return res.status(500).json({ success: false, error: 'فشل تحميل المواقع' });
            }
        }
    );

    // ✅ v10.9: POST — multi-device support
    app.post('/api/locations', authenticateAccessToken, csrfProtection, (req, res) => {
        try {
            const { latitude, longitude, accuracy, vesselId } = req.body;
            const lat = Number(latitude);
            const lng = Number(longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                return res.status(400).json({ success: false, error: 'إحداثيات غير صالحة' });
            }

            const role = normalizeRole(req.user.role);
            const sessionKey = getLocationSessionKey(req);

            // ✅ تنظيف الجلسات القديمة لنفس المستخدم
            pruneUserSessions(req.user.id);

            const location = {
                id: randomId(8),
                sessionKey: sessionKey,             // ✅ جديد
                userId: req.user.id,
                username: req.user.username,
                name: req.user.name || req.user.username,
                role: role,
                roleLabel: ROLE_LABELS[role] || role,
                region: req.user.region || '',
                vesselId: vesselId || null,
                latitude: lat,
                longitude: lng,
                accuracy: Number(accuracy) || null,
                timestamp: new Date().toISOString(),
                userAgent: String(req.headers['user-agent'] || '').substring(0, 150)  // ✅ جديد
            };

            liveLocations.set(sessionKey, location);
            console.log('📍 Location:', location.name, '| session:', String(sessionKey).substring(0, 8), '| total:', liveLocations.size);
            return res.status(201).json({ success: true, location });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل حفظ الموقع' });
        }
    });

    app.delete('/api/locations/me', authenticateAccessToken, csrfProtection, (req, res) => {
        try {
            const sessionKey = getLocationSessionKey(req);
            liveLocations.delete(sessionKey);
            return res.json({ success: true });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل الحذف' });
        }
    });

    // ✅ v10.9: endpoint لعرض الجلسات النشطة لكل مستخدم
    app.get('/api/locations/sessions',
        authenticateAccessToken,
        requirePermission('monitoring:view'),
        (req, res) => {
            try {
                const list = buildLocationsList();
                const byUser = {};
                list.forEach(loc => {
                    if (!byUser[loc.userId]) {
                        byUser[loc.userId] = {
                            userId: loc.userId,
                            name: loc.name,
                            role: loc.role,
                            roleLabel: loc.roleLabel,
                            region: loc.region,
                            sessions: []
                        };
                    }
                    byUser[loc.userId].sessions.push({
                        sessionKey: String(loc.sessionKey || loc.userId).substring(0, 12) + '...',
                        latitude: loc.latitude,
                        longitude: loc.longitude,
                        accuracy: loc.accuracy,
                        timestamp: loc.timestamp,
                        userAgent: loc.userAgent || null
                    });
                });
                return res.json({
                    success: true,
                    usersCount: Object.keys(byUser).length,
                    totalSessions: list.length,
                    users: Object.values(byUser)
                });
            } catch (error) {
                return res.status(500).json({ success: false, error: 'فشل تحميل الجلسات' });
            }
        }
    );

    // ========================================================
    // 🎫 SUPPORT TICKETS (visible to ALL users)
    // ========================================================

    app.get('/api/support/tickets', authenticateAccessToken, async (req, res) => {
        try {
            const tickets = await Ticket.find()
                .sort({ createdAt: -1 })
                .limit(500)
                .lean();

            const formatted = tickets.map(t => ({
                id: t._id.toString(),
                _id: t._id.toString(),
                title: t.title,
                subject: t.title,
                description: t.description,
                message: t.description,
                category: t.category,
                priority: t.priority,
                status: t.status,
                sender: t.sender || t.createdByName || 'مستخدم',
                user: t.sender || t.createdByName || 'مستخدم',
                username: t.createdByName || 'user',
                userId: t.createdBy?.toString() || null,
                assignedTo: t.assignedToName || null,
                replies: t.replies || [],
                createdAt: t.createdAt,
                closedAt: t.closedAt,
                resolution: t.resolution
            }));

            return res.json(formatted);
        } catch (error) {
            console.error('❌ Support tickets GET error:', error.message);
            return res.status(500).json({ success: false, error: 'فشل تحميل التذاكر' });
        }
    });

    app.post('/api/support/tickets', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            const { subject, title, message, description, priority, category, sender } = req.body;
            const finalSubject = subject || title;
            const finalMessage = message || description;

            if (typeof finalSubject !== 'string' || !finalSubject.trim()) {
                return res.status(400).json({ success: false, error: 'الموضوع مطلوب' });
            }
            if (typeof finalMessage !== 'string' || !finalMessage.trim()) {
                return res.status(400).json({ success: false, error: 'الرسالة مطلوبة' });
            }

            const allowedPriorities = ['منخفضة', 'متوسطة', 'عالية', 'عاجلة', 'منخفض', 'متوسط', 'عالي', 'حرج'];
            const finalPriority = allowedPriorities.includes(priority) ? priority : 'متوسط';

            const allowedCategories = ['فني', 'لوجستي', 'إداري', 'تشغيلي', 'أمني', 'أخرى'];
            const finalCategory = allowedCategories.includes(category) ? category : 'فني';

            let createdById;
            try {
                createdById = mongoose.Types.ObjectId.isValid(req.user._id) ? req.user._id : new mongoose.Types.ObjectId();
            } catch (e) {
                createdById = new mongoose.Types.ObjectId();
            }

            const finalSender = (
                typeof sender === 'string' && sender.trim()
                    ? sender.trim()
                    : (req.user.name || req.user.username || 'مستخدم')
            ).substring(0, 120);

            const ticket = await Ticket.create({
                title: finalSubject.trim(),
                description: finalMessage.trim(),
                category: finalCategory,
                priority: finalPriority,
                status: 'مفتوح',
                sender: finalSender,
                createdBy: createdById,
                createdByName: req.user.name || req.user.username
            });

            try {
                if (Notification) {
                    const allUsers = await User.find({ isActive: true })
                        .select('id name username')
                        .limit(200)
                        .lean();

                    let notifiedCount = 0;
                    for (const u of allUsers) {
                        if (u.id === req.user.id) continue;
                        const result = await notify({
                            userId: u.id,
                            type: 'info',
                            category: 'support',
                            title: '🎫 تذكرة دعم جديدة',
                            message: `${finalSender}: ${finalSubject.trim().substring(0, 60)}`,
                            link: '/pages/support.html',
                            icon: 'ticket-alt',
                            actorName: finalSender,
                            metadata: {
                                ticketId: ticket._id.toString(),
                                priority: finalPriority
                            }
                        });
                        if (result) notifiedCount++;
                    }
                    console.log(`📢 Support ticket notification → ${notifiedCount} users`);
                } else {
                    console.warn('⚠️ Notification model not available — skipping notify');
                }
            } catch (notifErr) {
                console.warn('⚠️ Support notify failed:', notifErr.message);
            }

            return res.status(201).json({
                success: true,
                message: 'تم إرسال التذكرة بنجاح',
                ticket: {
                    id: ticket._id.toString(),
                    _id: ticket._id.toString(),
                    title: ticket.title,
                    subject: ticket.title,
                    description: ticket.description,
                    message: ticket.description,
                    category: ticket.category,
                    priority: ticket.priority,
                    status: ticket.status,
                    sender: ticket.sender || finalSender,
                    user: ticket.sender || finalSender,
                    createdAt: ticket.createdAt
                }
            });
        } catch (error) {
            console.error('❌ Support ticket POST error:', error.message);
            return res.status(500).json({ success: false, error: 'فشل إرسال التذكرة' });
        }
    });

    app.get('/api/monitoring/support-tickets',
        authenticateAccessToken,
        requirePermission('monitoring:view'),
        async (req, res) => {
            try {
                const tickets = await Ticket.find()
                    .sort({ createdAt: -1 })
                    .limit(500)
                    .lean();
                return res.json({
                    success: true,
                    count: tickets.length,
                    tickets: tickets.map(t => ({
                        id: t._id.toString(),
                        subject: t.title,
                        message: t.description,
                        priority: t.priority,
                        status: t.status,
                        sender: t.sender || t.createdByName || 'مستخدم',
                        createdAt: t.createdAt
                    }))
                });
            } catch (error) {
                return res.status(500).json({ success: false, error: 'فشل تحميل التذاكر' });
            }
        }
    );

    // ========================================================
    // 🚢 VESSELS
    // ========================================================
    app.get('/api/vessels', authenticateAccessToken, requirePermission('vessels:read'), async (req, res) => {
        try {
            const vessels = await Vessel.find().sort({ createdAt: -1 }).limit(500);
            res.json(vessels.map(v => formatVessel(v)));
        } catch (error) {
            res.status(500).json({ success: false, error: 'فشل تحميل السفن' });
        }
    });

    app.post('/api/vessels', authenticateAccessToken, requirePermission('vessels:create'), csrfProtection, async (req, res) => {
        try {
            const { name, num, len, region, zone, port, supp, status, break: breakType, fDate, eDate, ref, repairUnit, cat } = req.body;
            if (typeof name !== 'string' || !name.trim()) {
                return res.status(400).json({ success: false, error: 'اسم المركب مطلوب' });
            }

            const newVessel = await Vessel.create({
                id: randomId(8), name: name.trim(), num: num || '',
                len: Number(len) || 0, region: region || '', zone: zone || '',
                port: port || '', supp: supp || '',
                status: status || 'صالح', stat: status || 'صالح',
                break: breakType || '', fDate: fDate || null, eDate: eDate || null,
                ref: ref || '', repairUnit: repairUnit || '', cat: cat || '',
                createdBy: req.user.id
            });

            if (newVessel.status === 'معطب' || newVessel.status === 'صيانة') {
                await Maintenance.create({
                    id: randomId(8), vesselId: newVessel.id,
                    vesselName: newVessel.name, vesselNum: newVessel.num,
                    type: breakType || 'صيانة دورية',
                    status: newVessel.status === 'معطب' ? 'متأخرة' : 'قيد التنفيذ',
                    date: fDate || new Date().toISOString(),
                    startDate: fDate ? new Date(fDate) : new Date(),
                    repairUnit: repairUnit || '—', cost: 0,
                    notes: breakType ? `عطب: ${breakType}` : 'صيانة دورية',
                    createdBy: req.user.id
                });
            }

            await addSystemLog({
                userId: req.user.id, userName: req.user.name,
                action: 'create', resource: 'vessel',
                resourceId: newVessel.id, resourceName: newVessel.name,
                status: 'success', ip: req.ip, requestId: req.requestId
            });

            await notify({
                type: 'success', category: 'vessel',
                title: 'مركب جديد',
                message: 'تم إضافة "' + newVessel.name + '" بواسطة ' + (req.user.name || req.user.username),
                link: '/pages/fleet.html', icon: 'ship',
                actorName: req.user.name || req.user.username
            });

            return res.status(201).json({
                success: true, message: 'تم إضافة المركب بنجاح',
                vessel: formatVessel(newVessel)
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'خطأ في إضافة المركب' });
        }
    });

    app.put('/api/vessels/:id', authenticateAccessToken, requirePermission('vessels:update'), csrfProtection, async (req, res) => {
        try {
            const idQuery = buildIdQuery(req.params.id);
            if (!idQuery) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

            const vessel = await Vessel.findOne(idQuery);
            if (!vessel) return res.status(404).json({ success: false, error: 'المركب غير موجود' });

            const { name, num, len, region, zone, port, supp, status, stat, break: breakType, fDate, eDate, ref, repairUnit, cat } = req.body;
            const oldStatus = vessel.status || vessel.stat;

            if (typeof name === 'string' && name.trim()) vessel.name = name.trim();
            if (num !== undefined) vessel.num = num;
            if (len !== undefined) vessel.len = Number(len) || 0;
            if (region !== undefined) vessel.region = region;
            if (zone !== undefined) vessel.zone = zone;
            if (port !== undefined) vessel.port = port;
            if (supp !== undefined) vessel.supp = supp;
            if (status !== undefined) { vessel.status = status; vessel.stat = status; }
            else if (stat !== undefined) { vessel.status = stat; vessel.stat = stat; }
            if (breakType !== undefined) vessel.break = breakType;
            if (fDate !== undefined) vessel.fDate = fDate;
            if (eDate !== undefined) vessel.eDate = eDate;
            if (ref !== undefined) vessel.ref = ref;
            if (repairUnit !== undefined) vessel.repairUnit = repairUnit;
            if (cat !== undefined) vessel.cat = cat;

            vessel.updatedAt = new Date();
            await vessel.save();

            if (vessel.status && (vessel.status === 'معطب' || vessel.status === 'صيانة') && oldStatus !== vessel.status) {
                await Maintenance.create({
                    id: randomId(8), vesselId: vessel.id,
                    vesselName: vessel.name, vesselNum: vessel.num,
                    type: breakType || 'صيانة دورية',
                    status: vessel.status === 'معطب' ? 'متأخرة' : 'قيد التنفيذ',
                    date: fDate || new Date().toISOString(),
                    startDate: fDate ? new Date(fDate) : new Date(),
                    repairUnit: repairUnit || '—', cost: 0,
                    notes: breakType ? `عطب: ${breakType}` : 'صيانة دورية',
                    createdBy: req.user.id
                });
            }

            await addSystemLog({
                userId: req.user.id, userName: req.user.name,
                action: 'update', resource: 'vessel',
                resourceId: vessel.id, resourceName: vessel.name,
                status: 'success', ip: req.ip, requestId: req.requestId
            });

            await notify({
                type: 'info', category: 'vessel',
                title: 'تعديل مركب',
                message: 'تم تعديل "' + vessel.name + '" بواسطة ' + (req.user.name || req.user.username),
                link: '/pages/fleet.html', icon: 'edit',
                actorName: req.user.name || req.user.username
            });

            return res.json({
                success: true, message: 'تم تحديث المركب بنجاح',
                vessel: formatVessel(vessel)
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'خطأ في تحديث المركب' });
        }
    });

    app.delete('/api/vessels/:id', authenticateAccessToken, requirePermission('vessels:delete'), csrfProtection, async (req, res) => {
        try {
            const idQuery = buildIdQuery(req.params.id);
            if (!idQuery) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

            const vessel = await Vessel.findOne(idQuery);
            if (!vessel) return res.status(404).json({ success: false, error: 'المركب غير موجود' });

            const vesselName = vessel.name;
            const vesselId = vessel.id;
            await Vessel.deleteOne({ _id: vessel._id });

            await addSystemLog({
                userId: req.user.id, userName: req.user.name,
                action: 'delete', resource: 'vessel',
                resourceId: vesselId, resourceName: vesselName,
                status: 'success', ip: req.ip, requestId: req.requestId
            });

            await notify({
                type: 'warning', category: 'vessel',
                title: 'حذف مركب',
                message: 'تم حذف "' + vesselName + '" بواسطة ' + (req.user.name || req.user.username),
                link: '/pages/fleet.html', icon: 'trash',
                actorName: req.user.name || req.user.username
            });

            return res.json({ success: true, message: 'تم حذف المركب بنجاح' });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'خطأ في حذف المركب' });
        }
    });

    // ========================================================
    // 🔧 MAINTENANCE
    // ========================================================
    async function handleGetMaintenance(req, res) {
        try {
            const logs = await Maintenance.find().sort({ createdAt: -1 }).limit(500);
            const records = logs.map(l => formatMaintenance(l));
            return res.json({
                success: true, records, data: records, total: records.length,
                stats: {
                    total: records.length,
                    completed: records.filter(r => r.status === 'مكتملة').length,
                    pending: records.filter(r => r.status === 'قيد الانتظار' || r.status === 'معلقة').length,
                    overdue: records.filter(r => r.status === 'متأخرة').length,
                    inProgress: records.filter(r => r.status === 'قيد التنفيذ' || r.status === 'قيد الإنجاز').length
                }
            });
        } catch (error) {
            console.error('❌ GET maintenance:', error);
            return res.status(500).json({ success: false, error: 'فشل تحميل الصيانة' });
        }
    }
    app.get('/api/maintenance', authenticateAccessToken, requirePermission('maintenance:read'), handleGetMaintenance);
    app.get('/api/maintenance-logs', authenticateAccessToken, requirePermission('maintenance:read'), handleGetMaintenance);

    async function handleCreateMaintenance(req, res) {
        try {
            const { vesselId, vesselName, vesselNum, type, status, date, startDate, endDate, repairUnit, unit, cost, technician, supervisorName, supervisor, description, notes, partsUsed, parts, priority, faultType } = req.body;
            if (typeof vesselName !== 'string' || !vesselName.trim()) {
                return res.status(400).json({ success: false, error: 'اسم المركب مطلوب' });
            }

            const rawParts = partsUsed || parts || [];
            const normalizedParts = (Array.isArray(rawParts) ? rawParts : []).map(p => ({
                partName: p.partName || p.name || '',
                quantity: Number(p.quantity) || 1,
                cost: Number(p.cost || p.price) || 0
            })).filter(p => p.partName);

            const logEntry = await Maintenance.create({
                id: randomId(8), vesselId: vesselId || '',
                vesselName: vesselName.trim(), vesselNum: vesselNum || '',
                type: type || 'صيانة دورية', priority: priority || 'متوسط',
                status: status || 'قيد التنفيذ',
                date: date || new Date().toISOString(),
                startDate: startDate ? new Date(startDate) : new Date(),
                endDate: endDate ? new Date(endDate) : null,
                repairUnit: repairUnit || unit || '—',
                cost: Number(cost) || 0,
                description: description || '', notes: notes || '',
                supervisorName: supervisorName || technician || '',
                supervisor: supervisor || null,
                faultType: faultType || 'أخرى',
                partsUsed: normalizedParts,
                createdBy: req.user.id
            });

            await addSystemLog({
                userId: req.user.id, userName: req.user.name,
                action: 'create', resource: 'maintenance',
                resourceId: logEntry.id, resourceName: logEntry.vesselName,
                status: 'success', ip: req.ip, requestId: req.requestId
            });

            await notify({
                type: 'info', category: 'maintenance',
                title: 'مهمة صيانة جديدة',
                message: 'تم إضافة "' + logEntry.vesselName + '" بواسطة ' + (req.user.name || req.user.username),
                link: '/pages/maintenance.html', icon: 'wrench',
                actorName: req.user.name || req.user.username
            });

            return res.status(201).json({
                success: true, message: 'تم إضافة سجل الصيانة',
                log: formatMaintenance(logEntry),
                record: formatMaintenance(logEntry),
                data: formatMaintenance(logEntry)
            });
        } catch (error) {
            console.error('❌ POST maintenance:', error);
            return res.status(500).json({ success: false, error: 'خطأ في إضافة السجل', details: error.message });
        }
    }
    app.post('/api/maintenance', authenticateAccessToken, requirePermission('maintenance:create'), csrfProtection, handleCreateMaintenance);
    app.post('/api/maintenance-logs', authenticateAccessToken, requirePermission('maintenance:create'), csrfProtection, handleCreateMaintenance);

    async function handleUpdateMaintenance(req, res) {
        try {
            const idQuery = buildIdQuery(req.params.id);
            if (!idQuery) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

            const log = await Maintenance.findOne(idQuery);
            if (!log) return res.status(404).json({ success: false, error: 'السجل غير موجود' });

            const allowedFields = ['status', 'cost', 'notes', 'description', 'endDate', 'priority', 'repairUnit', 'supervisorName', 'type', 'faultType'];
            allowedFields.forEach(field => {
                if (req.body[field] !== undefined) log[field] = req.body[field];
            });

            if (req.body.partsUsed || req.body.parts) {
                const rawParts = req.body.partsUsed || req.body.parts;
                log.partsUsed = (Array.isArray(rawParts) ? rawParts : []).map(p => ({
                    partName: p.partName || p.name || '',
                    quantity: Number(p.quantity) || 1,
                    cost: Number(p.cost || p.price) || 0
                })).filter(p => p.partName);
            }

            log.updatedAt = new Date();
            await log.save();

            await notify({
                type: 'info', category: 'maintenance',
                title: 'تعديل صيانة',
                message: 'تم تعديل "' + log.vesselName + '" بواسطة ' + (req.user.name || req.user.username),
                link: '/pages/maintenance.html', icon: 'edit',
                actorName: req.user.name || req.user.username
            });

            return res.json({
                success: true, message: 'تم تحديث السجل',
                log: formatMaintenance(log),
                record: formatMaintenance(log),
                data: formatMaintenance(log)
            });
        } catch (error) {
            console.error('❌ PUT maintenance:', error);
            return res.status(500).json({ success: false, error: 'خطأ في التحديث' });
        }
    }
    app.put('/api/maintenance/:id', authenticateAccessToken, requirePermission('maintenance:update'), csrfProtection, handleUpdateMaintenance);
    app.put('/api/maintenance-logs/:id', authenticateAccessToken, requirePermission('maintenance:update'), csrfProtection, handleUpdateMaintenance);

    async function handleDeleteMaintenance(req, res) {
        try {
            const idQuery = buildIdQuery(req.params.id);
            if (!idQuery) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

            const log = await Maintenance.findOne(idQuery);
            if (!log) return res.status(404).json({ success: false, error: 'السجل غير موجود' });

            const vesselName = log.vesselName;
            const logId = log.id;
            await Maintenance.deleteOne({ _id: log._id });

            await addSystemLog({
                userId: req.user.id, userName: req.user.name,
                action: 'delete', resource: 'maintenance',
                resourceId: logId, resourceName: vesselName,
                status: 'success', ip: req.ip, requestId: req.requestId
            });

            return res.json({ success: true, message: 'تم حذف السجل' });
        } catch (error) {
            console.error('❌ DELETE maintenance:', error);
            return res.status(500).json({ success: false, error: 'خطأ في الحذف' });
        }
    }
    app.delete('/api/maintenance/:id', authenticateAccessToken, requirePermission('maintenance:delete'), csrfProtection, handleDeleteMaintenance);
    app.delete('/api/maintenance-logs/:id', authenticateAccessToken, requirePermission('maintenance:delete'), csrfProtection, handleDeleteMaintenance);

    async function handleCompleteMaintenance(req, res) {
        try {
            const idQuery = buildIdQuery(req.params.id);
            if (!idQuery) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

            const log = await Maintenance.findOne(idQuery);
            if (!log) return res.status(404).json({ success: false, error: 'السجل غير موجود' });

            log.status = 'مكتملة';
            log.endDate = new Date();
            await log.save();

            let vesselUpdated = false;
            try {
                const vesselIdQuery = buildIdQuery(log.vesselId);
                if (vesselIdQuery) {
                    const vessel = await Vessel.findOne(vesselIdQuery);
                    if (vessel) {
                        vessel.status = 'صالح';
                        vessel.stat = 'صالح';
                        vessel.break = '';
                        vessel.fDate = null;
                        vessel.eDate = new Date().toISOString().split('T')[0];
                        vessel.updatedAt = new Date();
                        await vessel.save();
                        vesselUpdated = true;
                        console.log('✅ تم تحديث حالة المركب:', vessel.name, '→ صالح');
                    }
                }
            } catch (vErr) {
                console.warn('⚠️ لم يتم تحديث السجل العام:', vErr.message);
            }

            await addSystemLog({
                userId: req.user.id, userName: req.user.name,
                action: 'complete', resource: 'maintenance',
                resourceId: log.id, resourceName: log.vesselName,
                status: 'success', ip: req.ip, requestId: req.requestId
            });

            await notify({
                type: 'success', category: 'maintenance',
                title: 'إكمال صيانة',
                message: 'تم إكمال صيانة "' + log.vesselName + '"',
                link: '/pages/maintenance.html', icon: 'check',
                actorName: req.user.name || req.user.username
            });

            return res.json({
                success: true,
                message: 'تم إكمال الصيانة' + (vesselUpdated ? ' وتحديث حالة المركب' : ''),
                log: formatMaintenance(log),
                record: formatMaintenance(log),
                vesselUpdated
            });
        } catch (error) {
            console.error('❌ POST complete:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }
    app.post('/api/maintenance/:id/complete', authenticateAccessToken, requirePermission('maintenance:update'), csrfProtection, handleCompleteMaintenance);
    app.post('/api/maintenance-logs/:id/complete', authenticateAccessToken, requirePermission('maintenance:update'), csrfProtection, handleCompleteMaintenance);

    // ========================================================
    // 👥 USERS
    // ========================================================
    app.get('/api/users', authenticateAccessToken, requirePermission('users:manage'), async (req, res) => {
        try {
            const users = await User.find().sort({ createdAt: -1 }).limit(500);
            res.json(users.map(u => formatUser(u)));
        } catch (error) {
            res.status(500).json({ success: false, error: 'فشل تحميل المستخدمين' });
        }
    });

    app.post('/api/users', authenticateAccessToken, requirePermission('users:manage'), csrfProtection, async (req, res) => {
        try {
            const { username, password, email, role, region, active } = req.body;

            if (typeof username !== 'string' || !username.trim()) {
                return res.status(400).json({ success: false, error: 'اسم المستخدم مطلوب' });
            }
            if (typeof password !== 'string' || !password) {
                return res.status(400).json({ success: false, error: 'كلمة المرور مطلوبة' });
            }
            if (!isStrongPassword(password)) {
                return res.status(400).json({ success: false, error: 'كلمة المرور يجب أن تكون 12 حرفاً على الأقل' });
            }

            const cleanUsername = username.trim();
            const existing = await User.findOne({ username: cleanUsername });
            if (existing) return res.status(400).json({ success: false, error: 'اسم المستخدم موجود' });

            const allowedRoles = ['admin', 'manager', 'editor', 'maintenance_unit', 'viewer', 'مسؤول', 'مدير', 'مشغل', 'مشاهد', 'operator', 'super_admin'];
            const finalRole = allowedRoles.includes(role) ? normalizeRole(role) : 'viewer';

            const cleanEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : `${cleanUsername.toLowerCase()}@marine.com`;
            const emailExists = await User.findOne({ email: cleanEmail });
            if (emailExists) return res.status(400).json({ success: false, error: 'البريد الإلكتروني موجود' });

            const newUser = await User.create({
                id: randomId(8), username: cleanUsername, password: password,
                email: cleanEmail, name: cleanUsername, role: finalRole,
                region: typeof region === 'string' ? region.trim() : '',
                isActive: active !== undefined ? Boolean(active) : true,
                tokenVersion: 0
            });

            await addSystemLog({
                userId: req.user.id, userName: req.user.name,
                action: 'create', resource: 'user',
                resourceId: newUser.id, resourceName: newUser.username,
                status: 'success', ip: req.ip, requestId: req.requestId
            });

            await notify({
                type: 'success', category: 'user',
                title: 'مستخدم جديد',
                message: 'تم إضافة "' + newUser.username + '" بواسطة ' + (req.user.name || req.user.username),
                link: '/pages/users.html', icon: 'user-plus',
                actorName: req.user.name || req.user.username
            });

            return res.status(201).json({
                success: true, message: 'تم إضافة المستخدم بنجاح',
                user: formatUser(newUser)
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'خطأ في إضافة المستخدم' });
        }
    });

    app.put('/api/users/:id', authenticateAccessToken, requirePermission('users:manage'), csrfProtection, async (req, res) => {
        try {
            const idQuery = buildIdQuery(req.params.id);
            if (!idQuery) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

            const targetUser = await User.findOne(idQuery);
            if (!targetUser) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

            const { username, email, role, region, active, password } = req.body;

            if (targetUser.username === 'admin' && username && username !== 'admin') {
                return res.status(403).json({ success: false, error: 'لا يمكن تغيير اسم المستخدم الرئيسي' });
            }

            if (normalizeRole(targetUser.role) === 'admin' && active === false) {
                const activeAdmins = await User.countDocuments({ role: 'admin', isActive: true });
                if (activeAdmins <= 1) return res.status(403).json({ success: false, error: 'لا يمكن تعطيل آخر مسؤول نشط' });
            }

            if (username) targetUser.username = username.trim();
            if (email) targetUser.email = email.trim().toLowerCase();

            if (role) {
                const allowedRoles = ['admin', 'manager', 'editor', 'maintenance_unit', 'viewer', 'مسؤول', 'مدير', 'مشغل', 'مشاهد', 'operator', 'super_admin'];
                if (!allowedRoles.includes(role)) return res.status(400).json({ success: false, error: 'صلاحية غير صالحة' });
                targetUser.role = normalizeRole(role);
            }

            if (region !== undefined) targetUser.region = typeof region === 'string' ? region.trim() : '';
            if (active !== undefined) targetUser.isActive = Boolean(active);

            if (password) {
                if (!isStrongPassword(password)) return res.status(400).json({ success: false, error: 'كلمة المرور ضعيفة' });
                targetUser.password = password;
                targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
                await revokeAllUserSessions(targetUser.id);
            }

            if (active === false) {
                targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
                await revokeAllUserSessions(targetUser.id);
            }

            targetUser.updatedAt = new Date();
            await targetUser.save();

            await addSystemLog({
                userId: req.user.id, userName: req.user.name,
                action: 'update', resource: 'user',
                resourceId: targetUser.id, resourceName: targetUser.username,
                status: 'success', ip: req.ip, requestId: req.requestId
            });

            await notify({
                type: 'info', category: 'user',
                title: 'تعديل مستخدم',
                message: 'تم تعديل "' + targetUser.username + '" بواسطة ' + (req.user.name || req.user.username),
                link: '/pages/users.html', icon: 'user-edit',
                actorName: req.user.name || req.user.username
            });

            return res.json({
                success: true, message: 'تم تحديث المستخدم بنجاح',
                user: formatUser(targetUser)
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'خطأ في تحديث المستخدم' });
        }
    });

    app.delete('/api/users/:id', authenticateAccessToken, requirePermission('users:manage'), csrfProtection, async (req, res) => {
        try {
            const idQuery = buildIdQuery(req.params.id);
            if (!idQuery) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

            const targetUser = await User.findOne(idQuery);
            if (!targetUser) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
            if (targetUser.username === 'admin') return res.status(403).json({ success: false, error: 'لا يمكن حذف المستخدم الرئيسي' });

            if (normalizeRole(targetUser.role) === 'admin') {
                const adminCount = await User.countDocuments({ role: 'admin' });
                if (adminCount <= 1) return res.status(403).json({ success: false, error: 'لا يمكن حذف آخر مسؤول' });
            }

            const deletedUsername = targetUser.username;
            const deletedUserId = targetUser.id;

            await revokeAllUserSessions(targetUser.id);
            await User.deleteOne({ _id: targetUser._id });

            await addSystemLog({
                userId: req.user.id, userName: req.user.name,
                action: 'delete', resource: 'user',
                resourceId: deletedUserId, resourceName: deletedUsername,
                status: 'success', ip: req.ip, requestId: req.requestId
            });

            await notify({
                type: 'warning', category: 'user',
                title: 'حذف مستخدم',
                message: 'تم حذف "' + deletedUsername + '" بواسطة ' + (req.user.name || req.user.username),
                link: '/pages/users.html', icon: 'user-times',
                actorName: req.user.name || req.user.username
            });

            return res.json({ success: true, message: 'تم حذف المستخدم بنجاح' });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'خطأ في حذف المستخدم' });
        }
    });

    app.put('/api/users-status/:id', authenticateAccessToken, requirePermission('users:manage'), csrfProtection, async (req, res) => {
        try {
            const { active } = req.body;
            const idQuery = buildIdQuery(req.params.id);
            if (!idQuery) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

            const targetUser = await User.findOne(idQuery);
            if (!targetUser) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

            if (normalizeRole(targetUser.role) === 'admin' && active === false) {
                const adminCount = await User.countDocuments({ role: 'admin', isActive: true });
                if (adminCount <= 1) return res.status(403).json({ success: false, error: 'لا يمكن تعطيل آخر مسؤول نشط' });
            }

            targetUser.isActive = Boolean(active);
            targetUser.updatedAt = new Date();
            if (!targetUser.isActive) {
                targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
                await revokeAllUserSessions(targetUser.id);
            }
            await targetUser.save();

            await notify({
                type: 'info', category: 'user',
                title: targetUser.isActive ? 'تفعيل مستخدم' : 'تعطيل مستخدم',
                message: (targetUser.isActive ? 'تم تفعيل "' : 'تم تعطيل "') + targetUser.username + '" بواسطة ' + (req.user.name || req.user.username),
                link: '/pages/users.html', icon: 'user-cog',
                actorName: req.user.name || req.user.username
            });

            return res.json({
                success: true,
                message: `تم ${targetUser.isActive ? 'تفعيل' : 'تعطيل'} المستخدم بنجاح`,
                user: { id: targetUser.id, username: targetUser.username, active: targetUser.isActive }
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'خطأ' });
        }
    });

    // ========================================================
    // 📜 LOGS
    // ========================================================
    app.get('/api/logs', authenticateAccessToken, requirePermission('logs:read'), async (req, res) => {
        try {
            const logs = await Log.find({
                action: { $nin: ['seed', 'cleanup'] }
            }).sort({ createdAt: -1 }).limit(200);

            res.json(logs.map(log => ({
                id: log._id.toString(),
                userId: log.user?.toString() || null,
                userName: log.userName || null,
                action: log.action, resource: log.resource,
                resourceName: log.resourceName || null,
                details: log.details, status: log.status, timestamp: log.createdAt
            })));
        } catch (error) {
            res.status(500).json({ success: false, error: 'فشل تحميل السجلات' });
        }
    });

    // ========================================================
    // 📊 SESSION STATUS
    // ========================================================
    app.get('/api/session-status', authenticateAccessToken, (req, res) => {
        res.json({
            success: true,
            hasSession: !!req.session,
            userId: req.user.id,
            sessionId: (req.session && req.session.sessionId) || (req.auth && req.auth.sid) || null
        });
    });

    // ========================================================
    // 🤖 AI + IMPORT
    // ========================================================
    aiAndImportRoutes(app, {
        User, Vessel, Maintenance, Notification,
        authenticateAccessToken, csrfProtection,
        requirePermission, hasPermission,
        randomId, addSystemLog, notify
    });

    // ========================================================
    // ⚙️ SETTINGS + LOGO
    // ========================================================
    if (UserSettings && SystemLogo) {
        try {
            settingsRoutes(app, {
                UserSettings, SystemLogo,
                authenticateAccessToken, requireAdmin, requirePermission,
                csrfProtection, addSystemLog, notify
            });
        } catch (e) {
            console.error('❌ Failed to register settings routes:', e.message);
        }
    } else {
        console.warn('⚠️ UserSettings or SystemLogo model missing — settings disabled');
    }

    // ========================================================
    // 📌 OWNERSHIP SIGNATURE
    // ========================================================
    const OWNERSHIP_META = `
<meta name="author" content="أمان الله ناجي">
<meta name="creator" content="أمان الله ناجي">
<meta name="designer" content="أمان الله ناجي">
<meta name="developer" content="أمان الله ناجي">
<meta name="publisher" content="إدارة إسناد الوحدات البحرية">
<meta name="owner" content="إدارة إسناد الوحدات البحرية - الحرس الوطني التونسي">
<meta name="copyright" content="© ${new Date().getFullYear()} أمان الله ناجي - جميع الحقوق محفوظة">
<meta name="application-name" content="منظومة الوسائل البحرية">
<meta name="generator" content="Marine System v10.9.0 - Aman Allah Naji">
<meta property="og:site_name" content="منظومة الوسائل البحرية">
<meta property="og:author" content="أمان الله ناجي">
<meta name="twitter:creator" content="@amanallah_naji">
`;

    const OWNERSHIP_CSS = `
<style id="ownership-signature-style">
#dev-signature {
    position: fixed !important;
    bottom: 6px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    padding: 3px 10px !important;
    background: rgba(6, 9, 17, 0.35) !important;
    backdrop-filter: blur(6px) !important;
    -webkit-backdrop-filter: blur(6px) !important;
    border: 1px solid rgba(230, 179, 30, 0.1) !important;
    border-radius: 20px !important;
    font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif !important;
    z-index: 1 !important;
    pointer-events: none !important;
    user-select: none !important;
    opacity: 0.4 !important;
    transition: opacity 0.3s ease !important;
    direction: rtl !important;
    line-height: 1.2 !important;
    box-shadow: none !important;
    max-width: 200px !important;
    white-space: nowrap !important;
    display: flex !important;
    align-items: center !important;
    gap: 5px !important;
}
#dev-signature:hover { opacity: 0.8 !important; }
#dev-signature .sig-icon { color: #e6b31e !important; font-size: 9px !important; }
#dev-signature .sig-name { color: #f7d774 !important; font-weight: 700 !important; font-size: 9.5px !important; }
#dev-signature .sig-role { display: none !important; }
@media (max-width: 1024px) {
    #dev-signature { display: none !important; }
}
@media print { #dev-signature { display: none !important; } }
</style>`;

    const OWNERSHIP_HTML = `
<div id="dev-signature" role="contentinfo" aria-label="توقيع المطور">
    <span class="sig-icon">⚓</span>
    <span class="sig-name">أمان الله ناجي</span>
    <span class="sig-role">إدارة إسناد الوحدات البحرية</span>
</div>`;

    const OWNERSHIP_CONSOLE = `
<script>
(function(){
    try {
        console.log('%c⚓ منظومة الوسائل البحرية',
            'background:linear-gradient(135deg,#060911,#0a1020);color:#f7d774;font-size:20px;font-weight:900;padding:12px 24px;border-radius:8px;text-shadow:0 0 20px #e6b31e;');
        console.log('%c👨‍💻 تصميم وتطوير: أمان الله ناجي — إدارة إسناد الوحدات البحرية',
            'background:#0a1020;color:#e6b31e;font-size:13px;font-weight:700;padding:8px 24px;border-radius:0 0 8px 8px;');
        console.log('%c🚢 System Version: 10.9.0 | © ' + new Date().getFullYear() + ' All Rights Reserved',
            'color:#64748b;font-size:11px;');
    } catch(e){}
})();
<\/script>`;

    function injectOwnership(html) {
        try {
            if (typeof html !== 'string') return html;
            if (!html.includes('</body>')) return html;
            if (html.includes('ownership-signature-style')) return html;

            if (html.includes('</head>')) {
                html = html.replace('</head>', OWNERSHIP_META + OWNERSHIP_CSS + OWNERSHIP_CONSOLE + '\n</head>');
            } else {
                html = OWNERSHIP_META + OWNERSHIP_CSS + OWNERSHIP_CONSOLE + html;
            }
            html = html.replace('</body>', OWNERSHIP_HTML + '\n</body>');
            return html;
        } catch (e) {
            return html;
        }
    }

    app.use((req, res, next) => {
        if (req.path.startsWith('/api/') ||
            /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map|json|xml|txt)$/i.test(req.path)) {
            return next();
        }

        const originalSend = res.send.bind(res);
        res.send = function (body) {
            try {
                if (typeof body === 'string' && body.includes('</body>')) {
                    body = injectOwnership(body);
                }
            } catch (e) {}
            return originalSend(body);
        };

        const originalSendFile = res.sendFile.bind(res);
        res.sendFile = function (filePath, options, callback) {
            if (typeof options === 'function') { callback = options; options = {}; }
            try {
                if (typeof filePath === 'string' && /\.html?$/i.test(filePath) && fs.existsSync(filePath)) {
                    let content = fs.readFileSync(filePath, 'utf8');
                    if (content.includes('</body>')) {
                        content = injectOwnership(content);
                    }
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    return originalSend(content);
                }
            } catch (e) {
                console.warn('⚠️ Ownership injection failed:', e.message);
            }
            return originalSendFile(filePath, options, callback);
        };

        next();
    });

    console.log('📌 Ownership signature middleware registered');

    // ========================================================
    // 👤 USER INFO BADGE
    // ========================================================
    const USER_BADGE_CSS = `
<style id="user-info-badge-style">
#user-info-badge {
    position: fixed !important;
    top: 42px !important;
    left: 20px !important;
    display: none;
    align-items: center !important;
    gap: 10px !important;
    padding: 8px 14px !important;
    background: rgba(6, 9, 17, 0.88) !important;
    backdrop-filter: blur(14px) !important;
    -webkit-backdrop-filter: blur(14px) !important;
    border: 1px solid rgba(230, 179, 30, 0.3) !important;
    border-radius: 12px !important;
    font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif !important;
    z-index: 9998 !important;
    pointer-events: none !important;
    user-select: none !important;
    box-shadow: 0 6px 24px rgba(0,0,0,0.45) !important;
    direction: rtl !important;
    max-width: 360px !important;
    transition: opacity 0.4s ease !important;
}
#user-info-badge.uib-visible {
    display: flex !important;
    animation: uibSlideIn 0.5s cubic-bezier(0.4, 0, 0.2, 1) !important;
}
@keyframes uibSlideIn {
    0% { opacity: 0; transform: translateX(-20px); }
    100% { opacity: 1; transform: translateX(0); }
}
#user-info-badge .uib-avatar {
    width: 34px !important; height: 34px !important;
    border-radius: 50% !important;
    background: linear-gradient(135deg, #f7d774 0%, #e6b31e 50%, #b8860b 100%) !important;
    display: flex !important; align-items: center !important; justify-content: center !important;
    color: #060911 !important; font-weight: 900 !important; font-size: 15px !important;
    flex-shrink: 0 !important;
    box-shadow: 0 4px 12px rgba(230, 179, 30, 0.4) !important;
}
#user-info-badge .uib-info {
    display: flex !important; flex-direction: column !important;
    line-height: 1.35 !important; min-width: 0 !important;
}
#user-info-badge .uib-name {
    color: #f7d774 !important; font-weight: 800 !important; font-size: 12.5px !important;
    white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important;
}
#user-info-badge .uib-meta {
    display: flex !important; align-items: center !important;
    gap: 8px !important; flex-wrap: wrap !important;
    font-size: 10.5px !important; margin-top: 1px !important;
}
#user-info-badge .uib-role { color: #e6b31e !important; font-weight: 700 !important; white-space: nowrap !important; }
#user-info-badge .uib-role::before { content: '👤 ' !important; font-size: 10px !important; }
#user-info-badge .uib-region { color: #60a5fa !important; font-weight: 700 !important; white-space: nowrap !important; }
#user-info-badge .uib-region::before { content: '📍 ' !important; font-size: 10px !important; }
#user-info-badge .uib-sep { color: #475569 !important; font-size: 9px !important; }
@media print { #user-info-badge { display: none !important; } }
@media (max-width: 768px) {
    #user-info-badge { top: 36px !important; left: 10px !important; padding: 6px 10px !important; max-width: 260px !important; gap: 8px !important; }
    #user-info-badge .uib-avatar { width: 28px !important; height: 28px !important; font-size: 13px !important; }
    #user-info-badge .uib-name { font-size: 11px !important; }
    #user-info-badge .uib-meta { font-size: 9px !important; gap: 5px !important; }
}
</style>`;

    const USER_BADGE_HTML = `
<div id="user-info-badge" role="status" aria-live="polite" aria-label="معلومات المستخدم الحالي">
    <div class="uib-avatar">م</div>
    <div class="uib-info">
        <span class="uib-name">—</span>
        <span class="uib-meta">
            <span class="uib-role"></span>
            <span class="uib-region"></span>
        </span>
    </div>
</div>`;

    const USER_BADGE_SCRIPT = `
<script>
(function(){
    'use strict';
    function readUser() {
        var keys = ['marine_user', 'currentUser', 'user', 'marine_current_user'];
        var stores = [window.localStorage, window.sessionStorage];
        for (var s = 0; s < stores.length; s++) {
            var store = stores[s];
            if (!store) continue;
            for (var i = 0; i < keys.length; i++) {
                try {
                    var raw = store.getItem(keys[i]);
                    if (raw) {
                        var parsed = JSON.parse(raw);
                        if (parsed && (parsed.name || parsed.username || parsed.role)) return parsed;
                    }
                } catch(e) {}
            }
        }
        return null;
    }
    function updateBadge() {
        try {
            var badge = document.getElementById('user-info-badge');
            if (!badge) return;
            var user = readUser();
            if (!user) { badge.classList.remove('uib-visible'); return; }
            var name = user.name || user.username || 'مستخدم';
            var roleLabel = user.roleLabel || user.role || '';
            var region = user.region || '';
            var avatar = badge.querySelector('.uib-avatar');
            if (avatar) { var init = String(name).trim().charAt(0) || 'م'; avatar.textContent = init.toUpperCase(); }
            var nameEl = badge.querySelector('.uib-name');
            if (nameEl) nameEl.textContent = name;
            var roleEl = badge.querySelector('.uib-role');
            var regionEl = badge.querySelector('.uib-region');
            var metaEl = badge.querySelector('.uib-meta');
            if (roleEl) { roleEl.textContent = roleLabel; roleEl.style.display = roleLabel ? '' : 'none'; }
            if (regionEl) { regionEl.textContent = region; regionEl.style.display = region ? '' : 'none'; }
            if (metaEl) {
                var existingSep = metaEl.querySelector('.uib-sep');
                if (existingSep) existingSep.remove();
                if (roleLabel && region) {
                    var sep = document.createElement('span');
                    sep.className = 'uib-sep';
                    sep.textContent = '•';
                    if (roleEl && regionEl) metaEl.insertBefore(sep, regionEl);
                }
            }
            badge.classList.add('uib-visible');
        } catch(e) {}
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateBadge);
    } else { updateBadge(); }
    window.addEventListener('storage', function(e) {
        if (['marine_user', 'currentUser', 'user', 'marine_token', 'token', 'marine_auth_token'].indexOf(e.key) !== -1) updateBadge();
    });
    setInterval(updateBadge, 1500);
    window.addEventListener('pageshow', updateBadge);
})();
<\/script>`;

    app.use((req, res, next) => {
        if (req.path.startsWith('/api/') ||
            /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map|json|xml|txt)$/i.test(req.path)) {
            return next();
        }

        const injectBadge = (html) => {
            if (typeof html !== 'string' || !html.includes('</body>')) return html;
            if (html.includes('user-info-badge-style')) return html;
            if (html.includes('</head>')) {
                html = html.replace('</head>', USER_BADGE_CSS + '\n</head>');
            }
            if (/<body[^>]*>/i.test(html)) {
                html = html.replace(/(<body[^>]*>)/i, '$1' + USER_BADGE_HTML);
            }
            html = html.replace('</body>', USER_BADGE_SCRIPT + '\n</body>');
            return html;
        };

        const originalSend = res.send.bind(res);
        res.send = function (body) {
            try { body = injectBadge(body); } catch(e) {}
            return originalSend(body);
        };

        const originalSendFile = res.sendFile.bind(res);
        res.sendFile = function (filePath, options, callback) {
            if (typeof options === 'function') { callback = options; options = {}; }
            try {
                if (typeof filePath === 'string' && /\.html?$/i.test(filePath) && fs.existsSync(filePath)) {
                    let content = fs.readFileSync(filePath, 'utf8');
                    content = injectBadge(content);
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    return originalSend(content);
                }
            } catch (e) {
                console.warn('⚠️ User badge injection failed:', e.message);
            }
            return originalSendFile(filePath, options, callback);
        };

        next();
    });

    console.log('👤 User info badge middleware registered');

    // ========================================================
    // 📍 FORCE GPS v5
    // ========================================================
    const FORCE_GPS_CSS = `
<style id="force-gps-style">
#force-gps-modal {
    position: fixed !important;
    top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
    width: 100vw !important; height: 100vh !important;
    z-index: 2147483647 !important;
    background: rgba(6, 9, 17, 0.98) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-family: 'Cairo', 'Segoe UI', sans-serif !important;
    direction: rtl !important;
    padding: 20px !important;
    margin: 0 !important;
    box-sizing: border-box !important;
}
#force-gps-modal.gps-ok { display: none !important; }
#force-gps-modal .fg-box {
    max-width: 460px !important;
    width: 100% !important;
    background: linear-gradient(135deg, rgba(18, 26, 44, 0.98) 0%, rgba(24, 34, 56, 0.95) 100%) !important;
    border: 2px solid rgba(230, 179, 30, 0.4) !important;
    border-radius: 20px !important;
    padding: 32px 24px !important;
    text-align: center !important;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.8) !important;
    animation: fgSlideIn 0.5s cubic-bezier(0.4, 0, 0.2, 1) !important;
}
@keyframes fgSlideIn {
    0% { opacity: 0; transform: translateY(30px) scale(0.95); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
}
#force-gps-modal .fg-icon {
    width: 72px !important; height: 72px !important;
    margin: 0 auto 18px !important;
    border-radius: 50% !important;
    background: linear-gradient(135deg, #f7d774 0%, #e6b31e 50%, #b8860b 100%) !important;
    display: flex !important; align-items: center !important; justify-content: center !important;
    font-size: 34px !important; color: #060911 !important;
    box-shadow: 0 12px 40px rgba(230, 179, 30, 0.5) !important;
    animation: fgPulse 2s ease-in-out infinite !important;
}
@keyframes fgPulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.06); }
}
#force-gps-modal .fg-title {
    font-size: 20px !important; font-weight: 900 !important;
    margin: 0 0 10px !important; color: #f7d774 !important;
}
#force-gps-modal .fg-desc {
    font-size: 13.5px !important; color: #cbd5e1 !important;
    line-height: 1.7 !important; margin: 0 0 22px !important;
}
#force-gps-modal .fg-desc strong { color: #fca5a5 !important; font-weight: 800 !important; }
#force-gps-modal .fg-btn {
    display: inline-flex !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 14px 32px !important;
    border: none !important; border-radius: 12px !important;
    background: linear-gradient(135deg, #f7d774 0%, #e6b31e 50%, #b8860b 100%) !important;
    color: #060911 !important;
    font-family: inherit !important;
    font-size: 15px !important;
    font-weight: 800 !important;
    cursor: pointer !important;
    box-shadow: 0 8px 24px rgba(230, 179, 30, 0.5) !important;
    transition: all 0.3s ease !important;
}
#force-gps-modal .fg-btn:hover { transform: translateY(-2px) scale(1.02) !important; }
#force-gps-modal .fg-btn:disabled { opacity: 0.6 !important; cursor: wait !important; }
#force-gps-modal .fg-status {
    margin-top: 14px !important; font-size: 12px !important;
    color: #94a3b8 !important; min-height: 18px !important;
}
#force-gps-modal .fg-status.error { color: #fca5a5 !important; }
#force-gps-modal .fg-status.success { color: #6ee7b7 !important; }
#force-gps-modal .fg-warn {
    margin-top: 18px !important;
    padding: 10px !important;
    background: rgba(239, 68, 68, 0.1) !important;
    border: 1px solid rgba(239, 68, 68, 0.3) !important;
    border-radius: 10px !important;
    font-size: 11.5px !important;
    color: #fca5a5 !important;
    line-height: 1.6 !important;
}
@media print { #force-gps-modal { display: none !important; } }
</style>`;

    const FORCE_GPS_HTML = `
<div id="force-gps-modal" class="gps-ok" role="dialog" aria-modal="true" aria-label="مطلوب الوصول إلى الموقع">
    <div class="fg-box">
        <div class="fg-icon">📍</div>
        <h2 class="fg-title">مطلوب الوصول إلى موقعك</h2>
        <p class="fg-desc">
            لتشغيل <strong>منظومة الوسائل البحرية</strong>، يجب السماح بالوصول إلى موقعك الجغرافي.
            <br>
            هذا الإجراء <strong>إلزامي</strong> ولا يمكن تخطّيه.
        </p>
        <button type="button" class="fg-btn" id="fgAllowBtn">
            <span>📍</span>
            <span>السماح بالوصول</span>
        </button>
        <div class="fg-status" id="fgStatus"></div>
        <div class="fg-warn">
            ⚠️ بعد النقر، سيطلب منك المتصفح الموافقة.
            اختر <strong>"السماح" (Allow)</strong> في النافذة المنبثقة.
        </div>
    </div>
</div>`;

    const FORCE_GPS_SCRIPT = `
<script>
(function(){
    'use strict';
    var MODAL_ID = 'force-gps-modal';
    var SEND_INTERVAL = 30000;
    var MIN_ACCURACY = 500;
    var firstSuccess = false;
    var watchId = null;
    var lastSent = 0;
    var asking = false;
    var userClicked = false;
    var loginVerified = false;
    var lastVerifyAt = 0;

    function log() {
        try { console.log.apply(console, ['[GPS]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }
    function warn() {
        try { console.warn.apply(console, ['[GPS]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }
    function getModal() { return document.getElementById(MODAL_ID); }
    function showModal() { var m = getModal(); if (m) m.classList.remove('gps-ok'); }
    function hideModal() { var m = getModal(); if (m) m.classList.add('gps-ok'); }
    function setStatus(t, c) {
        var el = document.getElementById('fgStatus');
        if (el) { el.textContent = t || ''; el.className = 'fg-status' + (c ? ' ' + c : ''); }
    }

    function getToken() {
        try {
            return localStorage.getItem('marine_auth_token')
                || localStorage.getItem('marine_token')
                || localStorage.getItem('token')
                || '';
        } catch(e) { return ''; }
    }
    function getCsrf() {
        try { var m = document.cookie.match(/marine_csrf=([^;]+)/); return m ? decodeURIComponent(m[1]) : ''; } catch(e) { return ''; }
    }

    function verifyLogin(callback) {
        var token = getToken();
        if (!token) { callback(false); return; }
        if (loginVerified && (Date.now() - lastVerifyAt < 60000)) { callback(true); return; }

        var xhr = new XMLHttpRequest();
        xhr.open('GET', '/api/auth/me', true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.withCredentials = true;
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== 4) return;
            if (xhr.status === 200) {
                loginVerified = true;
                lastVerifyAt = Date.now();
                log('✅ login verified');
                callback(true);
            } else {
                loginVerified = false;
                log('❌ login failed:', xhr.status);
                callback(false);
            }
        };
        xhr.onerror = function() { callback(false); };
        xhr.send();
    }

    async function postLocation(coords) {
        var token = getToken();
        var csrf = getCsrf();

        try {
            var res = await fetch('/api/locations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token,
                    'X-CSRF-Token': csrf || ''
                },
                credentials: 'include',
                body: JSON.stringify({
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    accuracy: coords.accuracy || null
                })
            });

            log('POST /api/locations →', res.status);
            if (res.ok) {
                lastSent = Date.now();
                return { ok: true };
            }
            var txt = '';
            try { txt = await res.text(); } catch(e) {}
            log('response:', txt.substring(0, 200));
            return { ok: false, status: res.status, body: txt };
        } catch(e) {
            warn('fetch error:', e.message);
            return { ok: false, status: 0, error: e.message };
        }
    }

    function startWatching() {
        if (watchId !== null) return;
        if (!navigator.geolocation) return;
        try {
            watchId = navigator.geolocation.watchPosition(
                function(pos) {
                    if (!loginVerified) return;
                    postLocation(pos.coords);
                },
                function(err) { log('watch err:', err.message); },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
            );
        } catch(e) {}
    }

    function requestLocation() {
        if (asking) return;
        asking = true;
        userClicked = true;
        var btn = document.getElementById('fgAllowBtn');
        if (btn) btn.disabled = true;

        if (!navigator.geolocation) {
            asking = false;
            if (btn) btn.disabled = false;
            setStatus('❌ المتصفح لا يدعم تحديد الموقع', 'error');
            return;
        }

        setStatus('⏳ جاري التحقق من الجلسة...');

        verifyLogin(function(loggedIn) {
            if (!loggedIn) {
                asking = false;
                if (btn) btn.disabled = false;
                setStatus('⚠️ يجب تسجيل الدخول أولاً', 'error');
                setTimeout(function() { hideModal(); }, 2000);
                return;
            }

            setStatus('📍 جاري طلب الموقع من المتصفح...');
            navigator.geolocation.getCurrentPosition(
                async function(pos) {
                    setStatus('📡 جاري إرسال الموقع...');
                    var result = await postLocation(pos.coords);
                    asking = false;
                    if (btn) btn.disabled = false;

                    if (result.ok) {
                        firstSuccess = true;
                        setStatus('✅ تم تسجيل موقعك بنجاح', 'success');
                        setTimeout(hideModal, 600);
                        startWatching();
                    } else if (result.status === 401) {
                        loginVerified = false;
                        setStatus('⚠️ جلسة منتهية. يرجى تسجيل الدخول مرة أخرى.', 'error');
                        setTimeout(hideModal, 2500);
                    } else {
                        setStatus('⚠️ فشل الإرسال (كود: ' + (result.status || 'شبكة') + ')', 'error');
                    }
                },
                function(err) {
                    asking = false;
                    if (btn) btn.disabled = false;
                    var msg = 'حدث خطأ';
                    if (err.code === 1) msg = '⚠️ رفضت الوصول. يجب السماح للمتابعة.';
                    else if (err.code === 2) msg = '⚠️ تعذّر تحديد الموقع. تحقق من GPS.';
                    else if (err.code === 3) msg = '⚠️ انتهت المهلة. حاول مجدداً.';
                    setStatus(msg, 'error');
                },
                { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
            );
        });
    }

    function startPeriodicSend() {
        setInterval(function() {
            if (!firstSuccess) return;
            if (watchId === null) return;
            if (Date.now() - lastSent < SEND_INTERVAL) return;
            if (!navigator.geolocation) return;
            if (!loginVerified) return;
            navigator.geolocation.getCurrentPosition(
                function(pos) { postLocation(pos.coords); },
                function() {},
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
            );
        }, SEND_INTERVAL);
    }

    function init() {
        var btn = document.getElementById('fgAllowBtn');
        if (btn) btn.addEventListener('click', requestLocation);

        hideModal();

        setInterval(function() {
            if (firstSuccess) return;

            var token = getToken();
            if (!token) {
                hideModal();
                return;
            }

            if (loginVerified && Date.now() - lastVerifyAt < 60000) {
                showModal();
                return;
            }

            verifyLogin(function(valid) {
                if (valid) showModal();
                else hideModal();
            });
        }, 2000);

        startPeriodicSend();
        log('Force GPS initialized — waiting for valid session');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else { init(); }
})();
<\/script>`;

    app.use((req, res, next) => {
        if (req.path.startsWith('/api/') ||
            /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map|json|xml|txt)$/i.test(req.path)) {
            return next();
        }

        const injectGPS = (html) => {
            if (typeof html !== 'string' || !html.includes('</body>')) return html;
            if (html.includes('force-gps-style')) return html;
            if (html.includes('</head>')) {
                html = html.replace('</head>', FORCE_GPS_CSS + '\n</head>');
            }
            if (/<body[^>]*>/i.test(html)) {
                html = html.replace(/(<body[^>]*>)/i, '$1' + FORCE_GPS_HTML);
            } else {
                html = FORCE_GPS_HTML + html;
            }
            html = html.replace('</body>', FORCE_GPS_SCRIPT + '\n</body>');
            return html;
        };

        const originalSend = res.send.bind(res);
        res.send = function (body) {
            try { body = injectGPS(body); } catch(e) {}
            return originalSend(body);
        };

        const originalSendFile = res.sendFile.bind(res);
        res.sendFile = function (filePath, options, callback) {
            if (typeof options === 'function') { callback = options; options = {}; }
            try {
                if (typeof filePath === 'string' && /\.html?$/i.test(filePath) && fs.existsSync(filePath)) {
                    let content = fs.readFileSync(filePath, 'utf8');
                    content = injectGPS(content);
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    return originalSend(content);
                }
            } catch (e) {
                console.warn('⚠️ Force GPS injection failed:', e.message);
            }
            return originalSendFile(filePath, options, callback);
        };

        next();
    });

    console.log('📍 Force GPS v5 middleware registered (login-verified, no auto-send)');

    // ========================================================
    // 📁 STATIC FILES
    // ========================================================
    const pagesDir = path.join(__dirname, 'pages');
    const publicPagesDir = path.join(__dirname, 'public', 'pages');
    const publicDir = path.join(__dirname, 'public');

    if (!fs.existsSync(pagesDir)) fs.mkdirSync(pagesDir, { recursive: true });
    if (!fs.existsSync(publicPagesDir)) fs.mkdirSync(publicPagesDir, { recursive: true });

    function findPageFile(pageName) {
        const possiblePaths = [
            path.join(publicPagesDir, pageName + '.html'),
            path.join(pagesDir, pageName + '.html'),
            path.join(publicDir, pageName + '.html'),
            path.join(__dirname, pageName + '.html')
        ];
        for (const filePath of possiblePaths) {
            if (fs.existsSync(filePath)) return filePath;
        }
        return null;
    }

    app.use(express.static(__dirname, { index: false }));
    app.use('/pages', express.static(pagesDir));
    app.use('/pages', express.static(publicPagesDir));
    app.use('/public', express.static(publicDir));
    app.use('/public/pages', express.static(publicPagesDir));

    // ========================================================
    // 📄 PAGE ROUTES
    // ========================================================
    app.get('/', (req, res) => {
        const possible = [
            path.join(__dirname, 'index.html'),
            path.join(publicDir, 'index.html'),
            path.join(pagesDir, 'index.html'),
            path.join(publicPagesDir, 'index.html')
        ];
        for (const filePath of possible) {
            if (fs.existsSync(filePath)) return res.sendFile(filePath);
        }
        return res.send('<h1>🚢 Marine System v10.9.0</h1><p>System is running</p>');
    });

    app.get('/pages/:page', (req, res) => {
        const filePath = findPageFile(req.params.page);
        if (filePath) return res.sendFile(filePath);
        return res.status(404).send('<h1>❌ 404</h1><p>Page not found</p>');
    });

    app.get('/:page', (req, res, next) => {
        const skip = ['api', 'pages', 'public', 'css', 'js', 'assets', 'favicon.ico'];
        if (skip.includes(req.params.page)) return next();
        const filePath = findPageFile(req.params.page);
        if (filePath) return res.sendFile(filePath);
        next();
    });

    // ========================================================
    // ❌ 404
    // ========================================================
    app.use((req, res) => {
        if (req.path.startsWith('/api')) {
            return res.status(404).json({ success: false, error: 'API not found' });
        }
        return res.redirect('/');
    });

    // ========================================================
    // ⚠️ GLOBAL ERROR
    // ========================================================
    app.use((err, req, res, next) => {
        console.error('❌ Global error:', err.message);
        if (err.message === 'CORS origin denied') {
            return res.status(403).json({ success: false, error: 'CORS origin denied' });
        }
        return res.status(err.status || 500).json({
            success: false,
            error: isProduction ? 'حدث خطأ في الخادم' : err.message
        });
    });

    // ========================================================
    // 🚀 START LISTENING
    // ========================================================
    if (require.main === module) {
        app.listen(PORT, '0.0.0.0', () => {
            console.log('=========================================');
            console.log('🚢 MARINE SYSTEM v10.9.0');
            console.log('🔐 JWT + REFRESH + CSRF + SESSION + RBAC');
            console.log('🍃 MongoDB Atlas Integration');
            console.log('📦 Seed Protection: ONE-TIME ONLY');
            console.log('🔧 Maintenance Routes: UNIFIED');
            console.log('👤 User region/unit: ENABLED');
            console.log('📌 Ownership Signature: ACTIVE');
            console.log('👤 User Info Badge: ENABLED');
            console.log('📍 Force GPS: MANDATORY v5');
            console.log('🎫 Support Tickets: ALL USERS CAN SEE ALL');
            console.log('🗺️  Monitoring: MULTI-DEVICE SUPPORT (sessionKey)');
            console.log('🤖 AI Assistant + Smart Import: ' +
                (process.env.GEMINI_API_KEY ? 'CONFIGURED' : 'NOT CONFIGURED'));
            console.log('📧 Email: ' + (
                (process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY)
                    ? 'MAILJET API ✅'
                    : (process.env.EMAIL_HOST ? 'SMTP' : '❌ NOT CONFIGURED')
            ));
            console.log('=========================================');
            console.log(`📍 Port: ${PORT}`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`👤 Admin: ${ADMIN_USERNAME}`);
            console.log(`🍃 MongoDB: ${mongoConnected ? 'CONNECTED' : 'DISCONNECTED'}`);
            console.log(`💾 Redis: ${redisAvailable ? 'CONNECTED ✅' : 'MEMORY ⚠️'}`);
            console.log('=========================================');
            console.log('👨‍💻 Developer: أمان الله ناجي');
            console.log('🏛️  Organization: إدارة إسناد الوحدات البحرية');
            console.log('=========================================');
        });
    }
})();

// ============================================================
// 📤 MODULE EXPORTS
// ============================================================
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
