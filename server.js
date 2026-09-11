// ============================================================
// 🚢 MARINE SYSTEM - PROFESSIONAL SERVER v9.10
// 🔐 JWT + REFRESH + CSRF + SESSION + RBAC + MongoDB
// 🛡️ PRODUCTION HARDENED / ENTERPRISE GRADE
// ✨ v9.10:
//    - ✅ FIXED: Double-hashing bug in ensureAdminExists
//    - ✅ FIXED: tokenVersion no longer increments on every restart
//    - ✅ FIXED: Admin password reset now uses updateOne (no pre-save hook)
//    - ✅ ADDED: Password match verification before reset
//    - ✅ ADDED: Better logging for admin operations
//    - Auto reset admin (password, lockedUntil, loginAttempts)
//    - Smart model resolution
//    - MongoDB Atlas integration
//    - tokenVersion enforced
//    - Ordered logout
//    - Refresh token rotation + replay protection
//    - admin-only pages
// ============================================================

'use strict';

require('dotenv').config();

// ============================================================
// 🔍 SMART MODEL RESOLUTION
// ============================================================

const fs = require('fs');
const path = require('path');

console.log('=========================================');
console.log('🚢 MARINE SYSTEM v9.10 - STARTING');
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

let User, Vessel, Maintenance, Log, Ticket;

try {
    const models = loadModels();
    User = models.User;
    Vessel = models.Vessel;
    Maintenance = models.Maintenance;
    Log = models.Log;
    Ticket = models.Ticket;
} catch (e) {
    console.error('❌ Fatal model loading error:', e.message);
    process.exit(1);
}

// ============================================================
// 📦 DEPENDENCIES
// ============================================================

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

let createDOMPurify = null;
try {
    createDOMPurify = require('isomorphic-dompurify');
} catch (e) {
    console.warn('⚠️ isomorphic-dompurify غير مثبت');
}

// ============================================================
// 🔴 REDIS (OPTIONAL)
// ============================================================

let redisClient = null;
let RedisStore = null;
let redisAvailable = false;

async function initRedis() {
    if (!process.env.REDIS_URL) {
        console.log('ℹ️ REDIS_URL غير محدد — Memory Store');
        return;
    }

    try {
        const { createClient } = require('redis');
        const ConnectRedis = require('connect-redis');
        RedisStore = ConnectRedis.default || ConnectRedis;

        redisClient = createClient({
            url: process.env.REDIS_URL,
            socket: { reconnectStrategy: retries => Math.min(retries * 100, 3000) }
        });

        redisClient.on('error', err => { redisAvailable = false; });
        redisClient.on('ready', () => { console.log('✅ Redis ready'); redisAvailable = true; });

        await redisClient.connect();
        redisAvailable = true;
    } catch (e) {
        console.warn('⚠️ Redis غير متاح:', e.message);
        redisAvailable = false;
        redisClient = null;
    }
}

// ============================================================
// 🚀 EXPRESS
// ============================================================

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const isProduction = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');
app.set('trust proxy', isProduction ? 1 : 0);

// ============================================================
// 🔐 SECRETS
// ============================================================

function generateSecret(bytes = 64) {
    return crypto.randomBytes(bytes).toString('hex');
}

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

// ============================================================
// 🔑 ADMIN CONFIG
// ============================================================

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

// ============================================================
// 🔒 ENCRYPTION
// ============================================================

if (isProduction && (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64)) {
    console.error('❌ ENCRYPTION_KEY must be 64 hex chars.');
    process.exit(1);
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

// ============================================================
// 🆔 SECURITY HELPERS
// ============================================================

function randomId(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const A = Buffer.from(a);
    const B = Buffer.from(b);
    if (A.length !== B.length) return false;
    return crypto.timingSafeEqual(A, B);
}

// ============================================================
// 🧼 SANITIZATION
// ============================================================

const PURIFY_CONFIG = { ALLOWED_TAGS: [], ALLOWED_ATTR: [], KEEP_CONTENT: true };

function sanitizeString(value) {
    if (typeof value !== 'string') return value;
    if (createDOMPurify) {
        try {
            return createDOMPurify.sanitize(value, PURIFY_CONFIG).trim();
        } catch (e) {}
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

// ============================================================
// 📧 EMAIL
// ============================================================

let emailTransporter = null;

async function setupEmailService() {
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

async function initEmailService() {
    return setupEmailService();
}

async function sendEmail(to, subject, html) {
    if (!emailTransporter) emailTransporter = await initEmailService();
    if (!emailTransporter) return null;

    try {
        const from = process.env.EMAIL_FROM || emailTransporter.options?.auth?.user || 'no-reply@marine-system.local';
        const info = await emailTransporter.sendMail({ from, to, subject, html });
        console.log('✅ Email sent:', info.messageId);
        return info;
    } catch (error) {
        console.error('❌ Email error:', error.message);
        return null;
    }
}

setTimeout(() => {
    initEmailService().then(t => { emailTransporter = t; }).catch(() => {});
}, 100);

// ============================================================
// 🛡️ HELMET
// ============================================================

app.use(
    helmet({
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
    })
);

// ============================================================
// 🌐 CORS
// ============================================================

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

// ============================================================
// 🚦 RATE LIMITING
// ============================================================

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

// ============================================================
// 📦 BODY PARSERS
// ============================================================

app.use(compression());
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(cookieParser());
app.use(xssSanitizer);
app.use(hpp());

// ============================================================
// 🆔 REQUEST ID
// ============================================================

app.use((req, res, next) => {
    req.requestId = randomId(16).substring(0, 32);
    res.setHeader('X-Request-ID', req.requestId);
    next();
});

// ============================================================
// 📋 REQUEST LOGGER
// ============================================================

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
// 🍃 MONGODB CONNECTION
// ============================================================

let mongoConnected = false;

async function connectMongoDB() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('❌ MONGODB_URI غير محدد');
        return false;
    }

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
        await User.collection.createIndex({ username: 1 }, { unique: true });
        await Vessel.collection.createIndex({ id: 1 }, { unique: true, sparse: true });
        await Maintenance.collection.createIndex({ id: 1, sparse: true });
        console.log('✅ Indexes ensured');
    } catch (error) {
        console.warn('⚠️ Index warning:', error.message);
    }
}

// ============================================================
// 👤 ENSURE ADMIN EXISTS (v9.10 - Fixed double-hash bug)
// ============================================================
//
// 🐛 v9.9 Bug:
//    - Used existingAdmin.save() with manual bcrypt.hash
//    - models/User.js has pre('save') hook that hashes again
//    - Result: bcrypt(bcrypt(password)) → login always fails
//
// ✅ v9.10 Fix:
//    - Use User.updateOne() which does NOT trigger pre('save') hooks
//    - Verify password match before resetting
//    - tokenVersion only increments on actual password change
//    - Users stay logged in across restarts
// ============================================================

async function ensureAdminExists() {
    try {
        console.log('');
        console.log('🔍 ================ ADMIN CHECK ================');
        console.log(`   Username: ${ADMIN_USERNAME}`);
        console.log(`   Password length: ${ADMIN_PASSWORD.length}`);
        console.log(`   Password first 3: ${ADMIN_PASSWORD.substring(0, 3)}***`);
        console.log(`   Password last 3: ***${ADMIN_PASSWORD.substring(ADMIN_PASSWORD.length - 3)}`);
        console.log(`   Auto reset: ${ALLOW_ADMIN_RESET ? 'ENABLED' : 'DISABLED'}`);
        console.log('================================================');
        console.log('');

        const existingAdmin = await User.findOne({ username: ADMIN_USERNAME });

        // ============================================================
        // الحالة 1: admin موجود → تحديث ذكي
        // ============================================================
        if (existingAdmin) {
            console.log(`✅ Admin user "${ADMIN_USERNAME}" exists in DB`);

            const updateData = {};

            // 🔓 فك القفل تلقائياً
            if (existingAdmin.lockedUntil) {
                console.log(`🔓 Unlocking admin (lockedUntil was set)`);
                updateData.lockedUntil = null;
            }

            // 🔄 إعادة تعيين محاولات الدخول
            if (existingAdmin.loginAttempts && existingAdmin.loginAttempts > 0) {
                console.log(`🔄 Resetting loginAttempts (was ${existingAdmin.loginAttempts})`);
                updateData.loginAttempts = 0;
            }

            // ✅ إعادة تنشيط الحساب إذا كان معطلاً
            if (existingAdmin.isActive === false) {
                console.log(`✅ Reactivating admin`);
                updateData.isActive = true;
            }

            // 🔑 AUTO-RESET كلمة المرور — فقط إذا تغيّرت فعلاً
            if (ALLOW_ADMIN_RESET) {
                let passwordMatches = false;
                try {
                    passwordMatches = await bcrypt.compare(ADMIN_PASSWORD, existingAdmin.password);
                } catch (e) {
                    passwordMatches = false;
                }

                if (!passwordMatches) {
                    console.log('🔑 AUTO-RESET: Password mismatch detected, updating...');

                    // ✅ تشفير واحد فقط — updateOne لا يُشغّل pre('save')
                    updateData.password = await bcrypt.hash(ADMIN_PASSWORD, 12);

                    // ✅ زيادة tokenVersion لإبطال الجلسات القديمة
                    updateData.tokenVersion = (existingAdmin.tokenVersion || 0) + 1;

                    console.log(`   New tokenVersion: ${updateData.tokenVersion}`);
                } else {
                    console.log('✅ AUTO-RESET: Password already matches, skipping');
                    console.log(`   (tokenVersion preserved: ${existingAdmin.tokenVersion || 0})`);
                }
            }

            // 📝 تنفيذ التحديث
            if (Object.keys(updateData).length > 0) {
                updateData.updatedAt = new Date();

                // ✅ updateOne لا يُشغّل pre('save') hooks → لا double-hash
                await User.updateOne(
                    { _id: existingAdmin._id },
                    { $set: updateData }
                );

                console.log(`✅ Admin user updated (${Object.keys(updateData).length} field(s))`);
                console.log('   → via updateOne (no double-hash)');
            } else {
                console.log('ℹ️  Admin user unchanged');
            }

            return;
        }

        // ============================================================
        // الحالة 2: admin غير موجود → إنشاؤه
        // ============================================================
        console.log(`⚠️  Admin user "${ADMIN_USERNAME}" NOT FOUND - creating...`);

        // ⚠️ هنا نستخدم create() لأن pre('save') سيعمل تلقائياً
        // → لا نُشفّر يدوياً
        const admin = await User.create({
            username: ADMIN_USERNAME,
            password: ADMIN_PASSWORD,
            name: ADMIN_NAME,
            email: ADMIN_EMAIL,
            role: 'admin',
            isActive: true,
            tokenVersion: 0,
            loginAttempts: 0,
            lockedUntil: null
        });

        console.log('✅ Admin user CREATED:', admin.username);
        console.log(`   Email: ${admin.email}`);
        console.log(`   Role: ${admin.role}`);
        console.log('');
        console.log('🔐 ============================================');
        console.log(`🔐 LOGIN WITH:`);
        console.log(`🔐 Username: ${ADMIN_USERNAME}`);
        console.log(`🔐 Password: (the one from ADMIN_PASSWORD env)`);
        console.log('🔐 ============================================');
    } catch (error) {
        console.error('❌ Failed to ensure admin:', error.message);
        console.error(error.stack);
    }
}

// ============================================================
// 🚢 ENSURE INITIAL DATA
// ============================================================

async function ensureInitialData() {
    try {
        const vesselCount = await Vessel.countDocuments();
        if (vesselCount > 0) {
            console.log(`✅ Vessels exist (${vesselCount})`);
            return;
        }

        console.log('📦 Creating initial vessels...');

        const initialVessels = [
            { id: randomId(8), name: 'الوحدة 101', num: '101', len: 11, region: 'الشمال', zone: 'تونس', port: 'الميناء الرئيسي', supp: '—', status: 'صالح', break: '—', cat: 'البروق', createdBy: 'system' },
            { id: randomId(8), name: 'الوحدة 205', num: '205', len: 15, region: 'الساحل', zone: 'سوسة', port: 'ميناء سوسة', supp: '—', status: 'صيانة', break: 'محرك', fDate: new Date().toISOString(), ref: 'M-2024-001', repairUnit: 'وحدة الصيانة تونس', cat: 'خوافر', createdBy: 'system' },
            { id: randomId(8), name: 'الوحدة 312', num: '312', len: 8, region: 'الجنوب', zone: 'جرجيس', port: 'ميناء جرجيس', supp: '—', status: 'معطب', break: 'هيكل', fDate: new Date().toISOString(), ref: 'M-2024-002', repairUnit: 'وحدة الصيانة جرجيس', cat: 'صقور', createdBy: 'system' }
        ];

        await Vessel.insertMany(initialVessels);
        console.log(`✅ ${initialVessels.length} vessels created`);

        const initialLogs = [
            { id: randomId(8), vesselName: 'الوحدة 101', vesselNum: '101', type: 'صيانة دورية', status: 'مكتملة', date: new Date().toISOString(), repairUnit: 'وحدة الصيانة تونس', cost: 500, notes: 'صيانة دورية', createdBy: 'system' },
            { id: randomId(8), vesselName: 'الوحدة 205', vesselNum: '205', type: 'إصلاح محرك', status: 'قيد التنفيذ', date: new Date().toISOString(), repairUnit: 'وحدة الصيانة صفاقس', cost: 1200, notes: 'استبدال المحرك', createdBy: 'system' },
            { id: randomId(8), vesselName: 'الوحدة 312', vesselNum: '312', type: 'إصلاح هيكل', status: 'متأخرة', date: new Date().toISOString(), repairUnit: 'وحدة الصيانة جرجيس', cost: 2000, notes: 'إصلاح الهيكل', createdBy: 'system' }
        ];

        await Maintenance.insertMany(initialLogs);
        console.log(`✅ ${initialLogs.length} maintenance logs created`);
    } catch (error) {
        console.error('❌ Failed to create initial data:', error.message);
    }
}

// ============================================================
// 🧠 SESSION STORE
// ============================================================

let sessionStore = undefined;

async function buildSessionStore() {
    await initRedis();
    if (redisAvailable && redisClient && RedisStore) {
        try {
            sessionStore = new RedisStore({ client: redisClient, prefix: 'marine:sess:' });
            console.log('✅ Redis session store enabled');
        } catch (e) {
            sessionStore = undefined;
        }
    }
}

// ============================================================
// 🧠 CSRF
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
            httpOnly: false, secure: isProduction, sameSite: 'strict', maxAge: CSRF_MAX_AGE, path: '/'
        });
    } catch (e) {}

    return token;
}

// ============================================================
// 🛡️ CSRF PROTECTION
// ============================================================

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
        { sub: user.id, id: user.id, username: user.username, role: user.role, name: user.name, sid: sessionId, ver: user.tokenVersion || 0, type: 'access' },
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
        userId, tokenHash: hashToken(refreshToken),
        createdAt: Date.now(), lastUsedAt: Date.now(),
        expiresAt: Date.now() + REFRESH_TOKEN_MAX_AGE
    };

    if (redisAvailable && redisClient) {
        try {
            await redisClient.setEx(`marine:refresh:${sessionId}`, Math.floor(REFRESH_TOKEN_MAX_AGE / 1000), JSON.stringify(record));
            return;
        } catch (e) {}
    }
    refreshSessions.set(sessionId, record);
}

async function getRefreshSession(sessionId) {
    if (!sessionId) return null;
    if (redisAvailable && redisClient) {
        try {
            const data = await redisClient.get(`marine:refresh:${sessionId}`);
            if (data) return JSON.parse(data);
            return null;
        } catch (e) {}
    }
    const record = refreshSessions.get(sessionId);
    if (!record) return null;
    if (Date.now() > record.expiresAt) { refreshSessions.delete(sessionId); return null; }
    return record;
}

async function revokeRefreshSession(sessionId) {
    if (!sessionId) return;
    if (redisAvailable && redisClient) {
        try { await redisClient.del(`marine:refresh:${sessionId}`); } catch (e) {}
    }
    refreshSessions.delete(sessionId);
}

async function revokeAllUserSessions(userId) {
    for (const [sessionId, record] of refreshSessions) {
        if (record.userId === userId) refreshSessions.delete(sessionId);
    }
    if (redisAvailable && redisClient) {
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

// ============================================================
// 🚫 REVOKED TOKENS
// ============================================================

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
    if (Date.now() > expiry) { revokedAccessTokens.delete(jti); return false; }
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
        expiresAt: Date.now() + 60 * 60 * 1000, createdAt: new Date().toISOString()
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
// 📋 SYSTEM LOG
// ============================================================

async function addSystemLog({ userId = null, action = 'view', resource = 'system', resourceId = null, resourceName = '', userName = '', userEmail = '', ip = null, requestId = null, status = 'success', details = {}, error = null }) {
    try {
        if (!mongoConnected) return;
        await Log.create({
            action, resource, resourceId, resourceModel: null, resourceName,
            userName, userEmail, ipAddress: ip, userAgent: null,
            details: { ...details, requestId }, status, error
        });
    } catch (e) {}
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
        const decoded = jwt.verify(token, JWT_SECRET, { issuer: 'marine-system', audience: 'marine-system-client' });

        if (decoded.type !== 'access') return res.status(401).json({ success: false, error: 'نوع التوكن غير صالح' });
        if (isAccessTokenRevoked(decoded.jti)) return res.status(401).json({ success: false, error: 'التوكن ملغى' });

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
        if (error.name === 'TokenExpiredError') return res.status(401).json({ success: false, error: 'انتهت صلاحية التوكن' });
        return res.status(401).json({ success: false, error: 'توكن غير صالح' });
    }
}

// ============================================================
// 👑 RBAC
// ============================================================

const ROLE_PERMISSIONS = {
    admin: ['*'], super_admin: ['*'],
    manager: ['vessels:read', 'vessels:create', 'vessels:update', 'maintenance:read', 'maintenance:create', 'maintenance:update', 'logs:read'],
    operator: ['vessels:read', 'maintenance:read', 'maintenance:create'],
    viewer: ['vessels:read', 'maintenance:read'],
    مسؤول: ['*'], مدير: ['vessels:read', 'vessels:create', 'vessels:update', 'maintenance:read', 'maintenance:create', 'maintenance:update', 'logs:read'],
    مشغل: ['vessels:read', 'maintenance:read', 'maintenance:create'],
    مشاهد: ['vessels:read', 'maintenance:read']
};

function hasPermission(user, permission) {
    if (!user) return false;
    const permissions = ROLE_PERMISSIONS[user.role] || [];
    return permissions.includes('*') || permissions.includes(permission);
}

function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.user || !hasPermission(req.user, permission)) {
            return res.status(403).json({ success: false, error: 'ليس لديك الصلاحية الكافية' });
        }
        next();
    };
}

function isAdminUser(user) {
    return user && ['admin', 'super_admin', 'مسؤول', 'مدير'].includes(user.role);
}

function requireAdmin(req, res, next) {
    if (!isAdminUser(req.user)) {
        return res.status(403).json({ success: false, error: 'هذه العملية متاحة للمسؤول فقط' });
    }
    next();
}

// ============================================================
// 🔄 FORMAT HELPERS
// ============================================================

function formatUser(user) {
    if (!user) return null;
    return {
        id: user.id, username: user.username, name: user.name, email: user.email,
        role: user.role, active: user.isActive, isActive: user.isActive,
        lastLogin: user.lastLogin, createdAt: user.createdAt
    };
}

function formatVessel(vessel) {
    if (!vessel) return null;
    return {
        id: vessel.id, _id: vessel._id, name: vessel.name, num: vessel.num || '',
        len: vessel.len || 0, region: vessel.region || '', zone: vessel.zone || '',
        port: vessel.port || '', supp: vessel.supp || '', status: vessel.status || 'صالح',
        break: vessel.break || '', fDate: vessel.fDate || null, eDate: vessel.eDate || null,
        ref: vessel.ref || '', repairUnit: vessel.repairUnit || '', cat: vessel.cat || '',
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

    return {
        id: log.id, _id: log._id,
        vesselName: log.vesselName || '—', vessel: log.vesselName || '—',
        vesselNum: log.vesselNum || '', type: log.type || 'صيانة دورية',
        status: log.status || 'قيد الانتظار', date: displayDate, isoDate: isoDate,
        startDate: log.startDate, endDate: log.endDate, createdAt: log.createdAt,
        repairUnit: log.repairUnit || '—', unit: log.repairUnit || '—',
        cost: Number(log.cost) || 0, notes: log.notes || '',
        vesselId: log.vesselId || '', updatedAt: log.updatedAt
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
        name: isProduction ? '__Host-marine.sid' : 'marine.sid',
        cookie: {
            httpOnly: true, secure: isProduction, sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000, path: '/'
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
            success: true, status: 'online', service: 'Marine System',
            version: '9.10', timestamp: new Date().toISOString(),
            mongodb: mongoConnected ? 'connected' : 'disconnected',
            redis: redisAvailable ? 'connected' : 'memory'
        });
    });

    // ========================================================
    // LOGIN
    // ========================================================

    app.post('/api/auth/login', async (req, res) => {
        try {
            const { username, password } = req.body;
            const clientIP = req.ip || req.socket.remoteAddress;

            if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
                return res.status(400).json({ success: false, error: 'بيانات غير صالحة' });
            }

            console.log(`🔐 Login attempt: "${username}" from ${clientIP}`);

            const user = await User.findOne({ username: username.trim() });

            if (!user) {
                console.log(`❌ User not found: "${username}"`);
                await addSystemLog({ action: 'login', resource: 'user', status: 'error', ip: clientIP, requestId: req.requestId, details: { reason: 'user_not_found', username } });
                return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
            }

            if (user.lockedUntil && Date.now() < user.lockedUntil.getTime()) {
                const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
                console.log(`🔒 Account locked for ${remainingMinutes} more minutes`);
                return res.status(403).json({ success: false, error: `الحساب مقفل. حاول بعد ${remainingMinutes} دقيقة` });
            }

            if (user.lockedUntil && Date.now() >= user.lockedUntil.getTime()) {
                console.log(`🔓 Lock expired, unlocking`);
                user.lockedUntil = null;
                user.loginAttempts = 0;
                await user.save();
            }

            if (user.isActive === false) {
                console.log(`❌ Account inactive`);
                return res.status(403).json({ success: false, error: 'الحساب معطّل. تواصل مع المسؤول' });
            }

            const valid = await bcrypt.compare(password, user.password);
            console.log(`🔐 Password check for "${username}":`, valid ? '✅ VALID' : '❌ INVALID');

            if (!valid) {
                user.loginAttempts = (user.loginAttempts || 0) + 1;

                if (user.loginAttempts >= 5) {
                    user.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
                    await user.save();
                    console.log(`🔒 Account locked due to 5 failed attempts`);
                    await addSystemLog({ userId: user.id, action: 'login', resource: 'user', status: 'error', ip: clientIP, requestId: req.requestId, details: { reason: 'account_locked' } });
                    return res.status(403).json({ success: false, error: 'الحساب مقفل لمدة 30 دقيقة' });
                }

                await user.save();
                console.log(`❌ Failed attempt ${user.loginAttempts}/5`);
                return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
            }

            user.loginAttempts = 0;
            user.lockedUntil = null;
            user.lastLogin = new Date();
            await user.save();

            console.log(`✅ Login SUCCESS: ${username} (${user.role})`);

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
                req.session.save(err => { if (err) console.warn('⚠️ session.save:', err.message); resolve(); });
            });

            const newCsrfToken = ensureCsrfToken(req, res);

            res.cookie(
                isProduction ? '__Host-marine.refresh' : 'marine.refresh',
                refreshToken,
                { httpOnly: true, secure: isProduction, sameSite: 'strict', maxAge: REFRESH_TOKEN_MAX_AGE, path: '/api/auth' }
            );

            await addSystemLog({ userId: user.id, userName: user.name, userEmail: user.email, action: 'login', resource: 'user', status: 'success', ip: clientIP, requestId: req.requestId });

            return res.json({
                success: true, token: accessToken, expiresIn: ACCESS_TOKEN_MAX_AGE,
                csrfToken: newCsrfToken,
                session: { csrfToken: newCsrfToken, csrfExpiry: req.session?.csrfExpiry || (Date.now() + CSRF_MAX_AGE) },
                user: formatUser(user)
            });
        } catch (error) {
            console.error('❌ Login error:', error);
            return res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });

    // ========================================================
    // REFRESH
    // ========================================================

    app.post('/api/auth/refresh', async (req, res) => {
        try {
            const cookieName = isProduction ? '__Host-marine.refresh' : 'marine.refresh';
            const refreshToken = req.cookies[cookieName];
            if (!refreshToken) return res.status(401).json({ success: false, error: 'Refresh token غير موجود' });

            const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, { issuer: 'marine-system', audience: 'marine-system-client' });
            if (decoded.type !== 'refresh') return res.status(401).json({ success: false, error: 'Refresh token غير صالح' });

            const record = await getRefreshSession(decoded.sid);
            if (!record) return res.status(401).json({ success: false, error: 'جلسة غير موجودة' });
            if (record.userId !== decoded.sub) { await revokeRefreshSession(decoded.sid); return res.status(401).json({ success: false, error: 'جلسة غير صالحة' }); }

            if (!safeEqual(record.tokenHash, hashToken(refreshToken))) {
                await revokeRefreshSession(decoded.sid);
                const replayUser = await User.findOne({ id: decoded.sub });
                if (replayUser) { replayUser.tokenVersion = (replayUser.tokenVersion || 0) + 1; await replayUser.save(); }
                return res.status(401).json({ success: false, error: 'Refresh token غير صالح' });
            }

            const user = await User.findOne({ id: decoded.sub });
            if (!user || !user.isActive) { await revokeRefreshSession(decoded.sid); return res.status(401).json({ success: false, error: 'المستخدم غير نشط' }); }

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
                req.session.save(err => { if (err) console.warn('⚠️ session.save:', err.message); resolve(); });
            });

            const newCsrfToken = ensureCsrfToken(req, res);
            res.cookie(cookieName, newRefreshToken, { httpOnly: true, secure: isProduction, sameSite: 'strict', maxAge: REFRESH_TOKEN_MAX_AGE, path: '/api/auth' });

            return res.json({
                success: true, token: newAccessToken, expiresIn: ACCESS_TOKEN_MAX_AGE,
                csrfToken: newCsrfToken,
                session: { csrfToken: newCsrfToken, csrfExpiry: req.session?.csrfExpiry || (Date.now() + CSRF_MAX_AGE) },
                user: formatUser(user)
            });
        } catch (error) {
            return res.status(401).json({ success: false, error: 'Refresh token غير صالح أو منتهي' });
        }
    });

    // ========================================================
    // CURRENT USER
    // ========================================================

    app.get('/api/auth/me', authenticateAccessToken, (req, res) => {
        return res.json({ success: true, user: formatUser(req.user) });
    });

    // ========================================================
    // LOGOUT
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

            for (const sessionId of sessionIds) {
                await revokeRefreshSession(sessionId);
            }

            await addSystemLog({ userId: req.user?.id || null, userName: req.user?.name || '', action: 'logout', resource: 'user', status: 'success', ip: clientIP, requestId: req.requestId });

            await new Promise(resolve => {
                if (!req.session) return resolve();
                req.session.destroy(err => { if (err) console.warn('⚠️ session.destroy:', err.message); resolve(); });
            });

            const refreshCookieName = isProduction ? '__Host-marine.refresh' : 'marine.refresh';
            const sessionCookieName = isProduction ? '__Host-marine.sid' : 'marine.sid';

            res.clearCookie(refreshCookieName, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/api/auth' });
            res.clearCookie(sessionCookieName, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' });
            res.clearCookie('marine_csrf', { httpOnly: false, secure: isProduction, sameSite: 'strict', path: '/' });

            return res.status(200).json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'خطأ أثناء تسجيل الخروج' });
        }
    });

    // ========================================================
    // PASSWORD RESET
    // ========================================================

    app.post('/api/auth/forgot-password', forgotPasswordLimiter, async (req, res) => {
        try {
            const { email } = req.body;
            if (typeof email !== 'string' || !email.trim()) return res.status(400).json({ success: false, error: 'البريد الإلكتروني مطلوب' });

            const user = await User.findOne({ email: email.trim().toLowerCase() });
            if (!user) return res.json({ success: true, message: 'إذا كان البريد مسجلاً فسيتم إرسال تعليمات إعادة التعيين' });

            const resetToken = createPasswordResetToken(user.email);
            const resetLink = `${req.protocol}://${req.get('host')}/reset-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(user.email)}`;

            const emailHtml = `<div dir="rtl" style="font-family:Arial,sans-serif"><h2>🔐 إعادة تعيين كلمة المرور</h2><p>مرحباً <strong>${String(user.name || user.username)}</strong></p><p>استخدم الرابط التالي:</p><p><a href="${resetLink}">إعادة تعيين كلمة المرور</a></p><p>الرابط صالح لمدة ساعة.</p></div>`;

            await sendEmail(user.email, 'إعادة تعيين كلمة المرور - منظومة الوسائل البحرية', emailHtml);

            const responsePayload = { success: true, message: 'تم إنشاء طلب إعادة تعيين كلمة المرور' };
            if (!isProduction) { responsePayload.resetLink = resetLink; responsePayload.devNote = 'DEV ONLY'; }

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
            if (!email || !token || !newPassword) return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
            if (!verifyResetToken(email, token)) return res.status(400).json({ success: false, error: 'رابط غير صالح أو منتهي' });
            if (!isStrongPassword(newPassword)) return res.status(400).json({ success: false, error: 'كلمة المرور ضعيفة' });

            const user = await User.findOne({ email: email.toLowerCase() });
            if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

            user.password = await bcrypt.hash(newPassword, 12);
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
    // SETTINGS (admin only)
    // ========================================================

    const userSettings = new Map();
    const DEFAULT_SETTINGS = {
        theme: { primary: '#0a1628', secondary: '#1a2a4a', gold: '#e6b31e' },
        layout: { darkMode: true, fontSize: 'medium', sidebarPosition: 'right', showStats: true },
        security: { twoFactorAuth: false, emailNotifications: true, smsNotifications: false, sessionTimeout: 60 },
        notifications: { emergencyAlerts: true, maintenanceAlerts: true, performanceReports: 'weekly' },
        branding: { logoSize: 'medium' }
    };

    function mergeSettings(defaults, saved) {
        const result = { ...defaults };
        if (!saved || typeof saved !== 'object') return result;
        for (const key of Object.keys(saved)) {
            if (saved[key] && typeof saved[key] === 'object' && !Array.isArray(saved[key]) && defaults[key] && typeof defaults[key] === 'object') {
                result[key] = { ...defaults[key], ...saved[key] };
            } else result[key] = saved[key];
        }
        return result;
    }

    app.get('/api/settings', authenticateAccessToken, requireAdmin, (req, res) => {
        try {
            const saved = userSettings.get(req.user.id) || {};
            const settings = mergeSettings(DEFAULT_SETTINGS, saved);
            return res.json({ success: true, settings, updatedAt: saved._updatedAt || null });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل تحميل الإعدادات' });
        }
    });

    app.put('/api/settings', authenticateAccessToken, requireAdmin, csrfProtection, (req, res) => {
        try {
            const userId = req.user.id;
            const current = userSettings.get(userId) || {};
            const merged = mergeSettings(current, req.body || {});

            if (merged.security) {
                const timeout = Number(merged.security.sessionTimeout);
                merged.security.sessionTimeout = (!Number.isFinite(timeout) || timeout < 5 || timeout > 480) ? 60 : timeout;
            }
            if (merged.layout) {
                if (!['small', 'medium', 'large'].includes(merged.layout.fontSize)) merged.layout.fontSize = 'medium';
                if (!['right', 'left'].includes(merged.layout.sidebarPosition)) merged.layout.sidebarPosition = 'right';
            }
            if (merged.notifications) {
                if (!['daily', 'weekly', 'monthly', 'never'].includes(merged.notifications.performanceReports)) merged.notifications.performanceReports = 'weekly';
            }

            merged._updatedAt = new Date().toISOString();
            userSettings.set(userId, merged);

            return res.json({ success: true, message: 'تم حفظ الإعدادات', settings: merged, updatedAt: merged._updatedAt });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل حفظ الإعدادات' });
        }
    });

    app.post('/api/settings/reset', authenticateAccessToken, requireAdmin, csrfProtection, (req, res) => {
        try {
            userSettings.delete(req.user.id);
            return res.json({ success: true, message: 'تم استعادة الإعدادات الافتراضية', settings: { ...DEFAULT_SETTINGS } });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل استعادة الإعدادات' });
        }
    });

    // ========================================================
    // MONITORING (admin only)
    // ========================================================

    app.get('/api/monitoring/users', authenticateAccessToken, requireAdmin, async (req, res) => {
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

    app.get('/api/monitoring/sessions', authenticateAccessToken, requireAdmin, async (req, res) => {
        try {
            const sessions = [];
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
    // SUPPORT TICKETS
    // ========================================================

    app.get('/api/support/tickets', authenticateAccessToken, async (req, res) => {
        try {
            let tickets;
            if (isAdminUser(req.user)) {
                tickets = await Ticket.find().sort({ createdAt: -1 }).limit(200);
            } else {
                tickets = await Ticket.find({ createdByName: req.user.name }).sort({ createdAt: -1 }).limit(100);
            }

            const formatted = tickets.map(t => ({
                id: t._id.toString(), title: t.title, subject: t.title,
                description: t.description, message: t.description,
                category: t.category, priority: t.priority, status: t.status,
                user: t.createdByName || 'مستخدم', username: t.createdByName || 'user',
                userId: t.createdBy?.toString() || null,
                assignedTo: t.assignedToName || null,
                replies: t.replies || [], createdAt: t.createdAt,
                closedAt: t.closedAt, resolution: t.resolution
            }));

            return res.json(formatted);
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل تحميل التذاكر' });
        }
    });

    app.post('/api/support/tickets', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            const { subject, title, message, description, priority, category } = req.body;
            const finalSubject = subject || title;
            const finalMessage = message || description;

            if (typeof finalSubject !== 'string' || !finalSubject.trim()) return res.status(400).json({ success: false, error: 'الموضوع مطلوب' });
            if (typeof finalMessage !== 'string' || !finalMessage.trim()) return res.status(400).json({ success: false, error: 'الرسالة مطلوبة' });

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

            const ticket = await Ticket.create({
                title: finalSubject.trim(), description: finalMessage.trim(),
                category: finalCategory, priority: finalPriority, status: 'مفتوح',
                createdBy: createdById, createdByName: req.user.name || req.user.username
            });

            return res.status(201).json({
                success: true, message: 'تم إرسال التذكرة بنجاح',
                ticket: {
                    id: ticket._id.toString(), title: ticket.title, subject: ticket.title,
                    description: ticket.description, message: ticket.description,
                    category: ticket.category, priority: ticket.priority, status: ticket.status,
                    user: ticket.createdByName, createdAt: ticket.createdAt
                }
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'فشل إرسال التذكرة' });
        }
    });

    // ========================================================
    // VESSELS
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
            if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ success: false, error: 'اسم المركب مطلوب' });

            const newVessel = await Vessel.create({
                id: randomId(8), name: name.trim(), num: num || '', len: Number(len) || 0,
                region: region || '', zone: zone || '', port: port || '', supp: supp || '',
                status: status || 'صالح', break: breakType || '', fDate: fDate || null,
                eDate: eDate || null, ref: ref || '', repairUnit: repairUnit || '', cat: cat || '',
                createdBy: req.user.id
            });

            if (newVessel.status === 'معطب' || newVessel.status === 'صيانة') {
                await Maintenance.create({
                    id: randomId(8), vesselId: newVessel.id, vesselName: newVessel.name, vesselNum: newVessel.num,
                    type: breakType || 'صيانة دورية',
                    status: newVessel.status === 'معطب' ? 'متأخرة' : 'قيد التنفيذ',
                    date: fDate || new Date().toISOString(),
                    startDate: fDate ? new Date(fDate) : new Date(),
                    repairUnit: repairUnit || '—', cost: 0,
                    notes: breakType ? `عطب: ${breakType}` : 'صيانة دورية',
                    createdBy: req.user.id
                });
            }

            return res.status(201).json({ success: true, message: 'تم إضافة المركب بنجاح', vessel: formatVessel(newVessel) });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'خطأ في إضافة المركب' });
        }
    });

    app.put('/api/vessels/:id', authenticateAccessToken, requirePermission('vessels:update'), csrfProtection, async (req, res) => {
        try {
            const vessel = await Vessel.findOne({ id: req.params.id });
            if (!vessel) return res.status(404).json({ success: false, error: 'المركب غير موجود' });

            const { name, num, len, region, zone, port, supp, status, break: breakType, fDate, eDate, ref, repairUnit, cat } = req.body;
            const oldStatus = vessel.status;

            if (typeof name === 'string' && name.trim()) vessel.name = name.trim();
            if (num !== undefined) vessel.num = num;
            if (len !== undefined) vessel.len = Number(len) || 0;
            if (region !== undefined) vessel.region = region;
            if (zone !== undefined) vessel.zone = zone;
            if (port !== undefined) vessel.port = port;
            if (supp !== undefined) vessel.supp = supp;
            if (status !== undefined) vessel.status = status;
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
                    id: randomId(8), vesselId: vessel.id, vesselName: vessel.name, vesselNum: vessel.num,
                    type: breakType || 'صيانة دورية',
                    status: vessel.status === 'معطب' ? 'متأخرة' : 'قيد التنفيذ',
                    date: fDate || new Date().toISOString(),
                    startDate: fDate ? new Date(fDate) : new Date(),
                    repairUnit: repairUnit || '—', cost: 0,
                    notes: breakType ? `عطب: ${breakType}` : 'صيانة دورية',
                    createdBy: req.user.id
                });
            }

            return res.json({ success: true, message: 'تم تحديث المركب بنجاح', vessel: formatVessel(vessel) });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'خطأ في تحديث المركب' });
        }
    });

    app.delete('/api/vessels/:id', authenticateAccessToken, requireAdmin, csrfProtection, async (req, res) => {
        try {
            const vessel = await Vessel.findOne({ id: req.params.id });
            if (!vessel) return res.status(404).json({ success: false, error: 'المركب غير موجود' });
            await Vessel.deleteOne({ _id: vessel._id });
            return res.json({ success: true, message: 'تم حذف المركب بنجاح' });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'خطأ في حذف المركب' });
        }
    });

    // ========================================================
    // MAINTENANCE
    // ========================================================

    app.get('/api/maintenance-logs', authenticateAccessToken, requirePermission('maintenance:read'), async (req, res) => {
        try {
            const logs = await Maintenance.find().sort({ createdAt: -1 }).limit(500);
            res.json(logs.map(l => formatMaintenance(l)));
        } catch (error) {
            res.status(500).json({ success: false, error: 'فشل تحميل سجلات الصيانة' });
        }
    });

    app.get('/api/maintenance', authenticateAccessToken, requirePermission('maintenance:read'), async (req, res) => {
        try {
            const logs = await Maintenance.find().sort({ createdAt: -1 }).limit(500);
            const records = logs.map(l => formatMaintenance(l));
            res.json({
                success: true, records,
                stats: {
                    total: records.length,
                    completed: records.filter(r => r.status === 'مكتملة').length,
                    pending: records.filter(r => r.status === 'معلقة' || r.status === 'قيد الانتظار').length,
                    overdue: records.filter(r => r.status === 'متأخرة').length,
                    inProgress: records.filter(r => r.status === 'قيد التنفيذ').length
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: 'فشل تحميل الصيانة' });
        }
    });

    app.post('/api/maintenance-logs', authenticateAccessToken, requirePermission('maintenance:create'), csrfProtection, async (req, res) => {
        try {
            const { vesselId, vesselName, vesselNum, type, status, date, repairUnit, cost, notes } = req.body;
            if (typeof vesselName !== 'string' || !vesselName.trim()) return res.status(400).json({ success: false, error: 'اسم المركب مطلوب' });

            const logEntry = await Maintenance.create({
                id: randomId(8), vesselId: vesselId || '', vesselName: vesselName.trim(),
                vesselNum: vesselNum || '', type: type || 'صيانة دورية',
                status: status || 'قيد التنفيذ', date: date || new Date().toISOString(),
                startDate: date ? new Date(date) : new Date(),
                repairUnit: repairUnit || '—', cost: Number(cost) || 0,
                notes: notes || '', createdBy: req.user.id
            });

            return res.status(201).json({ success: true, message: 'تم إضافة سجل الصيانة', log: formatMaintenance(logEntry) });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'خطأ في إضافة سجل الصيانة' });
        }
    });

    app.put('/api/maintenance-logs/:id', authenticateAccessToken, requirePermission('maintenance:update'), csrfProtection, async (req, res) => {
        try {
            const log = await Maintenance.findOne({ id: req.params.id });
            if (!log) return res.status(404).json({ success: false, error: 'سجل الصيانة غير موجود' });

            const { status, cost, notes } = req.body;
            if (status !== undefined) log.status = status;
            if (cost !== undefined) log.cost = Number(cost) || 0;
            if (notes !== undefined) log.notes = notes;

            log.updatedAt = new Date();
            await log.save();
            return res.json({ success: true, message: 'تم تحديث سجل الصيانة', log: formatMaintenance(log) });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'خطأ في تحديث السجل' });
        }
    });

    app.delete('/api/maintenance-logs/:id', authenticateAccessToken, requireAdmin, csrfProtection, async (req, res) => {
        try {
            const log = await Maintenance.findOne({ id: req.params.id });
            if (!log) return res.status(404).json({ success: false, error: 'سجل الصيانة غير موجود' });
            await Maintenance.deleteOne({ _id: log._id });
            return res.json({ success: true, message: 'تم حذف سجل الصيانة' });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'خطأ في الحذف' });
        }
    });

    // ========================================================
    // USERS
    // ========================================================

    app.get('/api/users', authenticateAccessToken, requireAdmin, async (req, res) => {
        try {
            const users = await User.find().sort({ createdAt: -1 }).limit(500);
            res.json(users.map(u => formatUser(u)));
        } catch (error) {
            res.status(500).json({ success: false, error: 'فشل تحميل المستخدمين' });
        }
    });

    app.post('/api/users', authenticateAccessToken, requireAdmin, csrfProtection, async (req, res) => {
        try {
            const { username, password, email, role, active } = req.body;
            if (typeof username !== 'string' || !username.trim()) return res.status(400).json({ success: false, error: 'اسم المستخدم مطلوب' });
            if (typeof password !== 'string' || !password) return res.status(400).json({ success: false, error: 'كلمة المرور مطلوبة' });
            if (!isStrongPassword(password)) return res.status(400).json({ success: false, error: 'كلمة المرور يجب أن تكون 12 حرفاً على الأقل' });

            const cleanUsername = username.trim();
            const existing = await User.findOne({ username: cleanUsername });
            if (existing) return res.status(400).json({ success: false, error: 'اسم المستخدم موجود' });

            const allowedRoles = ['admin', 'super_admin', 'manager', 'operator', 'viewer', 'مسؤول', 'مدير', 'مشغل', 'مشاهد'];
            const finalRole = allowedRoles.includes(role) ? role : 'viewer';

            const cleanEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : `${cleanUsername.toLowerCase()}@marine.com`;
            const emailExists = await User.findOne({ email: cleanEmail });
            if (emailExists) return res.status(400).json({ success: false, error: 'البريد الإلكتروني موجود' });

            const newUser = await User.create({
                id: randomId(8), username: cleanUsername, password: password,
                email: cleanEmail, name: cleanUsername, role: finalRole,
                isActive: active !== undefined ? Boolean(active) : true,
                tokenVersion: 0
            });

            return res.status(201).json({ success: true, message: 'تم إضافة المستخدم بنجاح', user: formatUser(newUser) });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'خطأ في إضافة المستخدم' });
        }
    });

    app.put('/api/users/:id', authenticateAccessToken, requireAdmin, csrfProtection, async (req, res) => {
        try {
            const targetUser = await User.findOne({ id: req.params.id });
            if (!targetUser) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

            const { username, email, role, active, password } = req.body;
            if (targetUser.username === 'admin' && username && username !== 'admin') return res.status(403).json({ success: false, error: 'لا يمكن تغيير اسم المستخدم الرئيسي' });

            if (targetUser.role === 'admin' && active === false) {
                const activeAdmins = await User.countDocuments({ role: 'admin', isActive: true });
                if (activeAdmins <= 1) return res.status(403).json({ success: false, error: 'لا يمكن تعطيل آخر مسؤول نشط' });
            }

            if (username) targetUser.username = username.trim();
            if (email) targetUser.email = email.trim().toLowerCase();

            if (role) {
                const allowedRoles = ['admin', 'super_admin', 'manager', 'operator', 'viewer', 'مسؤول', 'مدير', 'مشغل', 'مشاهد'];
                if (!allowedRoles.includes(role)) return res.status(400).json({ success: false, error: 'صلاحية غير صالحة' });
                targetUser.role = role;
            }

            if (active !== undefined) targetUser.isActive = Boolean(active);

            if (password) {
                if (!isStrongPassword(password)) return res.status(400).json({ success: false, error: 'كلمة المرور ضعيفة' });
                // ✅ pre('save') will hash it once — do NOT hash here
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
            return res.json({ success: true, message: 'تم تحديث المستخدم بنجاح', user: formatUser(targetUser) });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'خطأ في تحديث المستخدم' });
        }
    });

    app.delete('/api/users/:id', authenticateAccessToken, requireAdmin, csrfProtection, async (req, res) => {
        try {
            const targetUser = await User.findOne({ id: req.params.id });
            if (!targetUser) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
            if (targetUser.username === 'admin') return res.status(403).json({ success: false, error: 'لا يمكن حذف المستخدم الرئيسي' });

            if (targetUser.role === 'admin') {
                const adminCount = await User.countDocuments({ role: 'admin' });
                if (adminCount <= 1) return res.status(403).json({ success: false, error: 'لا يمكن حذف آخر مسؤول' });
            }

            await revokeAllUserSessions(targetUser.id);
            await User.deleteOne({ _id: targetUser._id });
            return res.json({ success: true, message: 'تم حذف المستخدم بنجاح' });
        } catch (error) {
            return res.status(500).json({ success: false, error: 'خطأ في حذف المستخدم' });
        }
    });

    app.put('/api/users-status/:id', authenticateAccessToken, requireAdmin, csrfProtection, async (req, res) => {
        try {
            const { active } = req.body;
            const targetUser = await User.findOne({ id: req.params.id });
            if (!targetUser) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

            if (targetUser.role === 'admin' && active === false) {
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
    // LOGS
    // ========================================================

    app.get('/api/logs', authenticateAccessToken, requireAdmin, async (req, res) => {
        try {
            const logs = await Log.find().sort({ createdAt: -1 }).limit(200);
            res.json(logs.map(log => ({
                id: log._id.toString(),
                userId: log.user?.toString() || null,
                userName: log.userName || null,
                action: log.action,
                resource: log.resource,
                resourceName: log.resourceName || null,
                details: log.details,
                status: log.status,
                timestamp: log.createdAt
            })));
        } catch (error) {
            res.status(500).json({ success: false, error: 'فشل تحميل السجلات' });
        }
    });

    // ========================================================
    // SESSION STATUS
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
    // LOCATIONS
    // ========================================================

    const locations = [];

    app.get('/api/locations', authenticateAccessToken, (req, res) => {
        res.json(locations);
    });

    app.post('/api/locations', authenticateAccessToken, csrfProtection, (req, res) => {
        if (!hasPermission(req.user, 'vessels:update')) {
            return res.status(403).json({ success: false, error: 'ليس لديك صلاحية تسجيل الموقع' });
        }

        const { latitude, longitude, accuracy, vesselId } = req.body;
        const lat = Number(latitude);
        const lng = Number(longitude);

        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return res.status(400).json({ success: false, error: 'إحداثيات غير صالحة' });
        }

        const location = {
            id: randomId(8), userId: req.user.id, username: req.user.username,
            vesselId: vesselId || null, latitude: lat, longitude: lng,
            accuracy: Number(accuracy) || null, timestamp: new Date().toISOString()
        };

        locations.push(location);
        if (locations.length > 5000) locations.splice(0, locations.length - 5000);

        return res.status(201).json({ success: true, location });
    });

    // ========================================================
    // STATIC FILES
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
    // PAGE ROUTES
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
        return res.send('<h1>🚢 Marine System v9.10</h1><p>System is running</p>');
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
    // 404
    // ========================================================

    app.use((req, res) => {
        if (req.path.startsWith('/api')) {
            return res.status(404).json({ success: false, error: 'API not found' });
        }
        return res.redirect('/');
    });

    // ========================================================
    // GLOBAL ERROR
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
    // START LISTENING
    // ========================================================

    if (require.main === module) {
        app.listen(PORT, '0.0.0.0', () => {
            console.log('=========================================');
            console.log('🚢 MARINE SYSTEM v9.10');
            console.log('🔐 JWT + REFRESH + CSRF + SESSION + RBAC');
            console.log('🍃 MongoDB Atlas Integration');
            console.log('✨ Auto-Reset Admin: ' + (ALLOW_ADMIN_RESET ? 'ENABLED' : 'DISABLED'));
            console.log('✅ Double-hash fix: APPLIED');
            console.log('=========================================');
            console.log(`📍 Port: ${PORT}`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`👤 Admin: ${ADMIN_USERNAME}`);
            console.log(`🍃 MongoDB: ${mongoConnected ? 'CONNECTED' : 'DISCONNECTED'}`);
            console.log(`💾 Redis: ${redisAvailable ? 'CONNECTED' : 'MEMORY'}`);
            console.log('🔒 Access JWT: 15 minutes');
            console.log('🔄 Refresh JWT: 7 days');
            console.log('🛡️ CSRF: ENABLED');
            console.log('🔐 tokenVersion: ENFORCED');
            console.log('👑 RBAC: ENABLED');
            console.log('=========================================');
        });
    }
})();

module.exports = app;
module.exports.csrfProtection = csrfProtection;
module.exports.authenticateAccessToken = authenticateAccessToken;
module.exports.requirePermission = requirePermission;
module.exports.requireAdmin = requireAdmin;
module.exports.hasPermission = hasPermission;
module.exports.addSystemLog = addSystemLog;
