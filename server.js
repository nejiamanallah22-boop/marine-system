// ============================================================
// 🚢 MARINE SYSTEM - PROFESSIONAL SERVER v9.6
// 🔐 JWT + REFRESH + CSRF + SESSION + RBAC
// 🛡️ PRODUCTION HARDENED / BACKWARD COMPATIBLE
// ✨ v9.6:
//    - /api/settings محمي بـ requireAdmin
//    - /api/monitoring/* جديد (admin فقط)
//    - tokenVersion enforced
//    - Ordered logout
//    - Refresh token rotation + replay protection
//    - Support tickets API
// ============================================================

'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const compression = require('compression');
const nodemailer = require('nodemailer');

// ============================================================
// 🧼 DOMPURIFY
// ============================================================

let createDOMPurify = null;

try {
    createDOMPurify = require('isomorphic-dompurify');
} catch (e) {
    console.warn('⚠️ isomorphic-dompurify غير مثبت — fallback بسيط');
}

// ============================================================
// 🔴 REDIS
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
            socket: {
                reconnectStrategy: retries => Math.min(retries * 100, 3000)
            }
        });

        redisClient.on('error', err => {
            console.warn('⚠️ Redis error:', err.message);
            redisAvailable = false;
        });

        redisClient.on('ready', () => {
            console.log('✅ Redis ready');
            redisAvailable = true;
        });

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
    const missing = requiredSecrets.filter(
        key => !process.env[key] || process.env[key].length < 32
    );

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
// 🔑 ADMIN
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

    while (chars.length < length) {
        chars.push(all[crypto.randomInt(all.length)]);
    }

    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    return chars.join('');
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';

let ADMIN_PASSWORD;

if (process.env.ADMIN_PASSWORD) {
    if (!isStrongPassword(process.env.ADMIN_PASSWORD)) {
        console.error('❌ ADMIN_PASSWORD too weak.');
        if (isProduction) process.exit(1);
        ADMIN_PASSWORD = generateStrongPassword();
    } else {
        ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    }
} else {
    if (isProduction) {
        console.error('❌ ADMIN_PASSWORD required in production.');
        process.exit(1);
    }
    ADMIN_PASSWORD = generateStrongPassword();
    console.log('🔑 DEV ADMIN PASSWORD:', ADMIN_PASSWORD);
}

const ADMIN_NAME = process.env.ADMIN_NAME || 'أمان الله ناجي';

// ============================================================
// 🔒 ENCRYPTION
// ============================================================

if (isProduction && (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64)) {
    console.error('❌ ENCRYPTION_KEY must be 64 hex chars.');
    process.exit(1);
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

function encrypt(text) {
    try {
        if (text === null || text === undefined) return text;
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        let encrypted = cipher.update(String(text), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return `${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
        return text;
    }
}

function decrypt(payload) {
    try {
        if (!payload || typeof payload !== 'string') return payload;
        const parts = payload.split(':');
        if (parts.length !== 2) return payload;
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        return payload;
    }
}

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
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                },
                tls: { rejectUnauthorized: false },
                connectionTimeout: 10000,
                greetingTimeout: 10000,
                socketTimeout: 15000
            });

            await transporter.verify();
            console.log('✅ Real SMTP email service ready');
            console.log(`📧 From: ${process.env.EMAIL_USER}`);
            return transporter;
        }

        console.warn('⚠️ EMAIL_HOST غير محدد — Ethereal (DEV ONLY)');
        const testAccount = await nodemailer.createTestAccount();
        const transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: { user: testAccount.user, pass: testAccount.pass }
        });

        await transporter.verify();
        console.log('✅ Ethereal email service ready (DEV)');
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
    if (!emailTransporter) {
        emailTransporter = await initEmailService();
    }
    if (!emailTransporter) {
        console.error('❌ Email transporter not ready');
        return null;
    }

    try {
        const from = process.env.EMAIL_FROM || emailTransporter.options?.auth?.user || 'no-reply@marine-system.local';
        const info = await emailTransporter.sendMail({ from, to, subject, html });
        console.log('✅ Email sent:', info.messageId);
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) console.log('📧 Ethereal preview:', previewUrl);
        return info;
    } catch (error) {
        console.error('❌ Email error:', error.message);
        return null;
    }
}

(async () => {
    emailTransporter = await initEmailService();
})();

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
    windowMs: 15 * 60 * 1000, max: 200,
    standardHeaders: true, legacyHeaders: false,
    message: { success: false, error: 'Too many requests.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 8,
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
// 📦 BODY
// ============================================================

app.use(compression());
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(cookieParser());
app.use(xssSanitizer);
app.use(hpp());

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
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms RID=${req.requestId}`);
    });
    next();
});

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
            httpOnly: false,
            secure: isProduction,
            sameSite: 'strict',
            maxAge: CSRF_MAX_AGE,
            path: '/'
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

    console.log('🔍 CSRF Check:', {
        path: req.path,
        method: req.method,
        hasProvided: !!provided,
        hasSession: !!sessionToken,
        hasCookie: !!cookieToken,
        hasHeader: !!req.headers['x-csrf-token'],
        hasAuthorization: !!extractBearerToken(req)
    });

    // 1) تطابق مع session
    if (provided && sessionToken && safeEqual(String(provided), String(sessionToken))) {
        return next();
    }

    // 2) تطابق مع cookie
    if (provided && cookieToken && safeEqual(String(provided), String(cookieToken))) {
        if (sessionToken && safeEqual(String(cookieToken), String(sessionToken))) {
            return next();
        }
    }

    // 3) dev fallback
    if (!isProduction && !sessionToken && looksLikeClientCsrfToken(provided)) {
        console.warn('⚠️ DEV: accepting client-format CSRF');
        return next();
    }

    // 4) production compat: JWT + active session
    if (req.auth && req.user && req.auth.sid && req.auth.sub === req.user.id) {
        const refreshRecordPromise = getRefreshSession(req.auth.sid);
        return Promise.resolve(refreshRecordPromise)
            .then(record => {
                if (record && record.userId === req.user.id) {
                    console.warn('⚠️ CSRF compat: authenticated JWT + active session');
                    return next();
                }
                return res.status(403).json({
                    success: false,
                    error: 'CSRF token غير صالح أو الجلسة منتهية',
                    code: 'CSRF_INVALID'
                });
            })
            .catch(() => {
                return res.status(403).json({
                    success: false,
                    error: 'CSRF verification failed',
                    code: 'CSRF_INVALID'
                });
            });
    }

    console.log('❌ CSRF FAILED:', {
        path: req.path,
        providedPrefix: provided ? String(provided).substring(0, 20) : null,
        sessionPrefix: sessionToken ? String(sessionToken).substring(0, 20) : null,
        cookiePrefix: cookieToken ? String(cookieToken).substring(0, 20) : null
    });

    return res.status(403).json({
        success: false,
        error: 'CSRF token غير صالح أو مفقود',
        code: 'CSRF_INVALID'
    });
}

// ============================================================
// 🔐 JWT
// ============================================================

function generateAccessToken(user, sessionId) {
    return jwt.sign(
        {
            sub: user.id,
            id: user.id,
            username: user.username,
            role: user.role,
            name: user.name,
            sid: sessionId,
            ver: user.tokenVersion || 0,
            type: 'access'
        },
        JWT_SECRET,
        {
            expiresIn: ACCESS_TOKEN_EXPIRES,
            issuer: 'marine-system',
            audience: 'marine-system-client',
            jwtid: randomId(16)
        }
    );
}

function generateRefreshToken(user, sessionId) {
    return jwt.sign(
        {
            sub: user.id,
            id: user.id,
            sid: sessionId,
            type: 'refresh'
        },
        JWT_REFRESH_SECRET,
        {
            expiresIn: REFRESH_TOKEN_EXPIRES,
            issuer: 'marine-system',
            audience: 'marine-system-client',
            jwtid: randomId(32)
        }
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

    if (redisAvailable && redisClient) {
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

    if (redisAvailable && redisClient) {
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
// 🚫 REVOKED ACCESS TOKENS
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
// 👤 USERS
// ============================================================

const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 12);

const users = [
    {
        id: '1',
        username: ADMIN_USERNAME,
        password: hashedPassword,
        name: ADMIN_NAME,
        email: process.env.ADMIN_EMAIL || 'admin@marine-system.local',
        role: 'admin',
        active: true,
        tokenVersion: 0,
        createdAt: new Date().toISOString(),
        lastLogin: null,
        loginAttempts: 0,
        locked: false,
        lockedUntil: null
    }
];

// ============================================================
// 🌉 GLOBAL BRIDGE
// ============================================================

global.__marineUsers = users;
global.__isAccessTokenRevoked = isAccessTokenRevoked;
global.__marineRevokedTokens = revokedAccessTokens;

// ============================================================
// 🚢 VESSELS
// ============================================================

const vessels = [];

const initialVessels = [
    {
        id: '1',
        name: 'الوحدة 101',
        num: '101',
        len: 11,
        region: 'الشمال',
        zone: 'تونس',
        port: 'الميناء الرئيسي',
        supp: '—',
        status: 'صالح',
        break: '—',
        fDate: null,
        eDate: null,
        ref: '',
        repairUnit: '—',
        cat: 'البروق'
    },
    {
        id: '2',
        name: 'الوحدة 205',
        num: '205',
        len: 15,
        region: 'الساحل',
        zone: 'سوسة',
        port: 'ميناء سوسة',
        supp: '—',
        status: 'صيانة',
        break: 'محرك',
        fDate: new Date().toISOString(),
        eDate: null,
        ref: 'M-2024-001',
        repairUnit: 'وحدة الصيانة تونس',
        cat: 'خوافر'
    },
    {
        id: '3',
        name: 'الوحدة 312',
        num: '312',
        len: 8,
        region: 'الجنوب',
        zone: 'جرجيس',
        port: 'ميناء جرجيس',
        supp: '—',
        status: 'معطب',
        break: 'هيكل',
        fDate: new Date().toISOString(),
        eDate: null,
        ref: 'M-2024-002',
        repairUnit: 'وحدة الصيانة جرجيس',
        cat: 'صقور'
    }
];

initialVessels.forEach(vessel => vessels.push(vessel));

// ============================================================
// 🔧 MAINTENANCE
// ============================================================

const maintenanceLogs = [];

function initMaintenanceLogs() {
    vessels.forEach(v => {
        if (v.status === 'معطب' || v.status === 'صيانة') {
            maintenanceLogs.push({
                id: randomId(8),
                vesselId: v.id,
                vesselName: v.name,
                vesselNum: v.num || '',
                type: v.break || 'صيانة دورية',
                status: v.status === 'معطب' ? 'متأخرة' : 'قيد التنفيذ',
                date: v.fDate || new Date().toISOString(),
                repairUnit: v.repairUnit || '—',
                cost: 0,
                notes: v.break ? `عطب: ${v.break}` : 'صيانة دورية',
                createdAt: new Date().toISOString()
            });
        }
    });

    if (maintenanceLogs.length < 3) {
        maintenanceLogs.push({
            id: randomId(8),
            vesselId: '1',
            vesselName: 'الوحدة 101',
            vesselNum: '101',
            type: 'صيانة دورية',
            status: 'مكتملة',
            date: new Date().toISOString(),
            repairUnit: 'وحدة الصيانة تونس',
            cost: 500,
            notes: 'تم إجراء الصيانة الدورية',
            createdAt: new Date().toISOString()
        });

        maintenanceLogs.push({
            id: randomId(8),
            vesselId: '2',
            vesselName: 'الوحدة 205',
            vesselNum: '205',
            type: 'إصلاح محرك',
            status: 'قيد التنفيذ',
            date: new Date().toISOString(),
            repairUnit: 'وحدة الصيانة صفاقس',
            cost: 1200,
            notes: 'استبدال المحرك التالف',
            createdAt: new Date().toISOString()
        });

        maintenanceLogs.push({
            id: randomId(8),
            vesselId: '3',
            vesselName: 'الوحدة 312',
            vesselNum: '312',
            type: 'إصلاح هيكل',
            status: 'متأخرة',
            date: new Date().toISOString(),
            repairUnit: 'وحدة الصيانة جرجيس',
            cost: 2000,
            notes: 'إصلاح ضرر في الهيكل',
            createdAt: new Date().toISOString()
        });
    }
}

initMaintenanceLogs();

// ============================================================
// 📋 SYSTEM LOGS
// ============================================================

const systemLogs = [];

function addSystemLog({ userId = null, action, details = '', ip = null, requestId = null }) {
    systemLogs.push({
        id: randomId(8),
        userId,
        action,
        details,
        ip,
        requestId,
        timestamp: new Date().toISOString()
    });

    if (systemLogs.length > 5000) {
        systemLogs.splice(0, systemLogs.length - 5000);
    }
}

// ============================================================
// 🔑 PASSWORD RESET
// ============================================================

const passwordResetTokens = [];

function createPasswordResetToken(email) {
    const existingIndex = passwordResetTokens.findIndex(item => item.email === email);
    if (existingIndex !== -1) passwordResetTokens.splice(existingIndex, 1);

    const token = randomId(32);
    passwordResetTokens.push({
        email,
        tokenHash: hashToken(token),
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
// 🔐 AUTH HELPERS
// ============================================================

function extractBearerToken(req) {
    const header = req.headers.authorization;
    if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
        return null;
    }
    const token = header.slice(7).trim();
    if (!token) return null;
    return token;
}

function authenticateAccessToken(req, res, next) {
    const token = extractBearerToken(req);

    if (!token) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET, {
            issuer: 'marine-system',
            audience: 'marine-system-client'
        });

        if (decoded.type !== 'access') {
            return res.status(401).json({ success: false, error: 'نوع التوكن غير صالح' });
        }

        if (isAccessTokenRevoked(decoded.jti)) {
            return res.status(401).json({ success: false, error: 'التوكن ملغى' });
        }

        const user = users.find(item => item.id === decoded.sub);

        if (!user || user.active !== true) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود أو غير نشط' });
        }

        // ✅ tokenVersion check
        if (typeof decoded.ver !== 'number' || decoded.ver !== (user.tokenVersion || 0)) {
            return res.status(401).json({
                success: false,
                error: 'جلسة التوثيق منتهية',
                code: 'TOKEN_VERSION_MISMATCH'
            });
        }

        if (!decoded.sid) {
            return res.status(401).json({
                success: false,
                error: 'جلسة التوثيق غير صالحة',
                code: 'SESSION_ID_MISSING'
            });
        }

        req.user = user;
        req.auth = decoded;

        next();
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
    super_admin: ['*'],
    manager: [
        'vessels:read', 'vessels:create', 'vessels:update',
        'maintenance:read', 'maintenance:create', 'maintenance:update',
        'logs:read'
    ],
    operator: [
        'vessels:read',
        'maintenance:read', 'maintenance:create'
    ],
    viewer: ['vessels:read', 'maintenance:read'],
    مسؤول: ['*'],
    مدير: [
        'vessels:read', 'vessels:create', 'vessels:update',
        'maintenance:read', 'maintenance:create', 'maintenance:update',
        'logs:read'
    ],
    مشغل: [
        'vessels:read',
        'maintenance:read', 'maintenance:create'
    ],
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
// 🚀 STARTUP
// ============================================================

(async () => {
    await buildSessionStore();

    app.use(session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        ...(sessionStore ? { store: sessionStore } : {}),
        name: isProduction ? '__Host-marine.sid' : 'marine.sid',
        cookie: {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000,
            path: '/'
        },
        rolling: true,
        proxy: isProduction
    }));

    // CSRF middleware
    app.use((req, res, next) => {
        ensureCsrfToken(req, res);
        next();
    });

    // ========================================================
    // CSRF TOKEN ENDPOINT
    // ========================================================

    app.get('/api/csrf-token', (req, res) => {
        const token = ensureCsrfToken(req, res);
        return res.json({
            success: true,
            token: token || null,
            expiresIn: CSRF_MAX_AGE
        });
    });

    // ========================================================
    // HEALTH
    // ========================================================

    app.get('/api/health', (req, res) => {
        return res.json({
            success: true,
            status: 'online',
            service: 'Marine System',
            version: '9.6',
            timestamp: new Date().toISOString(),
            redis: redisAvailable ? 'connected' : 'memory',
            csrfEnabled: true
        });
    });

    // ========================================================
    // 🔑 LOGIN
    // ========================================================

    app.post('/api/auth/login', async (req, res) => {
        try {
            const { username, password } = req.body;
            const clientIP = req.ip || req.socket.remoteAddress;

            if (
                typeof username !== 'string' ||
                typeof password !== 'string' ||
                !username || !password
            ) {
                return res.status(400).json({ success: false, error: 'بيانات غير صالحة' });
            }

            const user = users.find(item => item.username === username);

            if (!user) {
                addSystemLog({ action: 'LOGIN_FAILED', details: 'Unknown username', ip: clientIP, requestId: req.requestId });
                return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
            }

            if (user.locked && user.lockedUntil && Date.now() < user.lockedUntil) {
                return res.status(403).json({
                    success: false,
                    error: `الحساب مقفل. حاول بعد ${Math.ceil((user.lockedUntil - Date.now()) / 60000)} دقيقة`
                });
            }

            if (user.locked && user.lockedUntil && Date.now() >= user.lockedUntil) {
                user.locked = false;
                user.lockedUntil = null;
                user.loginAttempts = 0;
            }

            const valid = await bcrypt.compare(password, user.password);

            if (!valid) {
                user.loginAttempts = (user.loginAttempts || 0) + 1;

                if (user.loginAttempts >= 5) {
                    user.locked = true;
                    user.lockedUntil = Date.now() + 30 * 60 * 1000;

                    addSystemLog({ userId: user.id, action: 'ACCOUNT_LOCKED', details: 'Too many failures', ip: clientIP, requestId: req.requestId });

                    return res.status(403).json({
                        success: false,
                        error: 'الحساب مقفل لمدة 30 دقيقة'
                    });
                }

                addSystemLog({ userId: user.id, action: 'LOGIN_FAILED', details: 'Invalid password', ip: clientIP, requestId: req.requestId });

                return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
            }

            user.loginAttempts = 0;
            user.locked = false;
            user.lockedUntil = null;
            user.lastLogin = new Date().toISOString();

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

            res.cookie(
                isProduction ? '__Host-marine.refresh' : 'marine.refresh',
                refreshToken,
                {
                    httpOnly: true,
                    secure: isProduction,
                    sameSite: 'strict',
                    maxAge: REFRESH_TOKEN_MAX_AGE,
                    path: '/api/auth'
                }
            );

            addSystemLog({ userId: user.id, action: 'LOGIN_SUCCESS', details: `User ${user.username}`, ip: clientIP, requestId: req.requestId });

            return res.json({
                success: true,
                token: accessToken,
                expiresIn: ACCESS_TOKEN_MAX_AGE,
                csrfToken: newCsrfToken,
                session: {
                    csrfToken: newCsrfToken,
                    csrfExpiry: req.session?.csrfExpiry || (Date.now() + CSRF_MAX_AGE)
                },
                user: {
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    active: user.active,
                    lastLogin: user.lastLogin
                }
            });
        } catch (error) {
            console.error('Login error:', error);
            return res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });

    // ========================================================
    // 🔄 REFRESH
    // ========================================================

    app.post('/api/auth/refresh', async (req, res) => {
        try {
            const cookieName = isProduction ? '__Host-marine.refresh' : 'marine.refresh';
            const refreshToken = req.cookies[cookieName];

            if (!refreshToken) {
                return res.status(401).json({ success: false, error: 'Refresh token غير موجود' });
            }

            const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, {
                issuer: 'marine-system',
                audience: 'marine-system-client'
            });

            if (decoded.type !== 'refresh') {
                return res.status(401).json({ success: false, error: 'Refresh token غير صالح' });
            }

            const record = await getRefreshSession(decoded.sid);

            if (!record) {
                return res.status(401).json({ success: false, error: 'جلسة غير موجودة' });
            }

            if (record.userId !== decoded.sub) {
                await revokeRefreshSession(decoded.sid);
                return res.status(401).json({ success: false, error: 'جلسة غير صالحة' });
            }

            if (!safeEqual(record.tokenHash, hashToken(refreshToken))) {
                await revokeRefreshSession(decoded.sid);
                const replayUser = users.find(item => item.id === decoded.sub);
                if (replayUser) replayUser.tokenVersion = (replayUser.tokenVersion || 0) + 1;
                addSystemLog({ userId: decoded.sub, action: 'REFRESH_REPLAY', details: 'Replay detected', ip: req.ip, requestId: req.requestId });
                return res.status(401).json({ success: false, error: 'Refresh token غير صالح' });
            }

            const user = users.find(item => item.id === decoded.sub);
            if (!user || !user.active) {
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
                httpOnly: true,
                secure: isProduction,
                sameSite: 'strict',
                maxAge: REFRESH_TOKEN_MAX_AGE,
                path: '/api/auth'
            });

            return res.json({
                success: true,
                token: newAccessToken,
                expiresIn: ACCESS_TOKEN_MAX_AGE,
                csrfToken: newCsrfToken,
                session: {
                    csrfToken: newCsrfToken,
                    csrfExpiry: req.session?.csrfExpiry || (Date.now() + CSRF_MAX_AGE)
                },
                user: {
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    active: user.active,
                    lastLogin: user.lastLogin
                }
            });
        } catch (error) {
            return res.status(401).json({ success: false, error: 'Refresh token غير صالح أو منتهي' });
        }
    });

    // ========================================================
    // 👤 CURRENT USER
    // ========================================================

    app.get('/api/auth/me', authenticateAccessToken, (req, res) => {
        return res.json({
            success: true,
            user: {
                id: req.user.id,
                username: req.user.username,
                name: req.user.name,
                email: req.user.email,
                role: req.user.role,
                active: req.user.active,
                lastLogin: req.user.lastLogin
            }
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

            for (const sessionId of sessionIds) {
                await revokeRefreshSession(sessionId);
            }

            addSystemLog({
                userId: req.user?.id || null,
                action: 'LOGOUT',
                details: `User ${req.user?.username || 'unknown'} logged out`,
                ip: clientIP,
                requestId: req.requestId
            });

            await new Promise(resolve => {
                if (!req.session) return resolve();
                req.session.destroy(err => {
                    if (err) console.warn('⚠️ session.destroy:', err.message);
                    resolve();
                });
            });

            const refreshCookieName = isProduction ? '__Host-marine.refresh' : 'marine.refresh';
            const sessionCookieName = isProduction ? '__Host-marine.sid' : 'marine.sid';

            res.clearCookie(refreshCookieName, {
                httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/api/auth'
            });
            res.clearCookie(sessionCookieName, {
                httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/'
            });
            res.clearCookie('marine_csrf', {
                httpOnly: false, secure: isProduction, sameSite: 'strict', path: '/'
            });

            return res.status(200).json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
        } catch (error) {
            console.error('❌ Logout error:', error);
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

            const user = users.find(item => item.email === email.trim());

            if (!user) {
                return res.json({
                    success: true,
                    message: 'إذا كان البريد مسجلاً فسيتم إرسال تعليمات إعادة التعيين'
                });
            }

            const resetToken = createPasswordResetToken(user.email);
            const resetLink = `${req.protocol}://${req.get('host')}/reset-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(user.email)}`;

            const emailHtml = `
                <div dir="rtl" style="font-family:Arial,sans-serif">
                    <h2>🔐 إعادة تعيين كلمة المرور</h2>
                    <p>مرحباً <strong>${String(user.name || user.username)}</strong></p>
                    <p>استخدم الرابط التالي لإعادة تعيين كلمة المرور.</p>
                    <p><a href="${resetLink}">إعادة تعيين كلمة المرور</a></p>
                    <p>الرابط صالح لمدة ساعة واحدة.</p>
                </div>
            `;

            await sendEmail(user.email, 'إعادة تعيين كلمة المرور - منظومة الوسائل البحرية', emailHtml);

            addSystemLog({
                userId: user.id,
                action: 'PASSWORD_RESET_REQUESTED',
                details: 'Password reset requested',
                ip: req.ip,
                requestId: req.requestId
            });

            const responsePayload = {
                success: true,
                message: 'تم إنشاء طلب إعادة تعيين كلمة المرور'
            };

            if (!isProduction) {
                responsePayload.resetLink = resetLink;
                responsePayload.devNote = 'DEV ONLY';
            }

            return res.json(responsePayload);
        } catch (error) {
            console.error('Forgot password:', error.message);
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
                return res.status(400).json({ success: false, error: 'كلمة المرور ضعيفة (12 حرفاً على الأقل)' });
            }

            const user = users.find(item => item.email === email);

            if (!user) {
                return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
            }

            user.password = await bcrypt.hash(newPassword, 12);
            await revokeAllUserSessions(user.id);
            user.tokenVersion = (user.tokenVersion || 0) + 1;

            const index = passwordResetTokens.findIndex(
                item => item.email === email && safeEqual(item.tokenHash, hashToken(token))
            );

            if (index !== -1) passwordResetTokens.splice(index, 1);

            addSystemLog({
                userId: user.id,
                action: 'PASSWORD_RESET_SUCCESS',
                details: 'Password reset successful',
                ip: req.ip,
                requestId: req.requestId
            });

            return res.json({ success: true, message: 'تم إعادة تعيين كلمة المرور بنجاح' });
        } catch (error) {
            console.error('Reset password:', error.message);
            return res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
        }
    });

    // ========================================================
    // ⚙️ SETTINGS API (admin فقط)
    // ========================================================

    const userSettings = new Map();

    const DEFAULT_SETTINGS = {
        theme: {
            primary: '#0a1628',
            secondary: '#1a2a4a',
            gold: '#e6b31e'
        },
        layout: {
            darkMode: true,
            fontSize: 'medium',
            sidebarPosition: 'right',
            showStats: true
        },
        security: {
            twoFactorAuth: false,
            emailNotifications: true,
            smsNotifications: false,
            sessionTimeout: 60
        },
        notifications: {
            emergencyAlerts: true,
            maintenanceAlerts: true,
            performanceReports: 'weekly'
        },
        branding: {
            logoSize: 'medium'
        }
    };

    function mergeSettings(defaults, saved) {
        const result = { ...defaults };
        if (!saved || typeof saved !== 'object') return result;

        for (const key of Object.keys(saved)) {
            if (
                saved[key] &&
                typeof saved[key] === 'object' &&
                !Array.isArray(saved[key]) &&
                defaults[key] &&
                typeof defaults[key] === 'object'
            ) {
                result[key] = { ...defaults[key], ...saved[key] };
            } else {
                result[key] = saved[key];
            }
        }
        return result;
    }

    // ✅ GET /api/settings — admin فقط
    app.get(
        '/api/settings',
        authenticateAccessToken,
        requireAdmin,
        (req, res) => {
            try {
                const userId = req.user.id;
                const saved = userSettings.get(userId) || {};
                const settings = mergeSettings(DEFAULT_SETTINGS, saved);

                console.log('✅ GET /api/settings for admin:', req.user.username);

                return res.json({
                    success: true,
                    settings,
                    updatedAt: saved._updatedAt || null
                });
            } catch (error) {
                console.error('❌ Get settings error:', error);
                return res.status(500).json({ success: false, error: 'فشل تحميل الإعدادات' });
            }
        }
    );

    // ✅ PUT /api/settings — admin فقط
    app.put(
        '/api/settings',
        authenticateAccessToken,
        requireAdmin,
        csrfProtection,
        (req, res) => {
            try {
                const userId = req.user.id;
                const incoming = req.body || {};

                const current = userSettings.get(userId) || {};
                const merged = mergeSettings(current, incoming);

                if (merged.security) {
                    const timeout = Number(merged.security.sessionTimeout);
                    if (!Number.isFinite(timeout) || timeout < 5 || timeout > 480) {
                        merged.security.sessionTimeout = 60;
                    } else {
                        merged.security.sessionTimeout = timeout;
                    }
                }

                if (merged.layout) {
                    const allowedFonts = ['small', 'medium', 'large'];
                    if (!allowedFonts.includes(merged.layout.fontSize)) {
                        merged.layout.fontSize = 'medium';
                    }
                    const allowedSidebar = ['right', 'left'];
                    if (!allowedSidebar.includes(merged.layout.sidebarPosition)) {
                        merged.layout.sidebarPosition = 'right';
                    }
                }

                if (merged.notifications) {
                    const allowedReports = ['daily', 'weekly', 'monthly', 'never'];
                    if (!allowedReports.includes(merged.notifications.performanceReports)) {
                        merged.notifications.performanceReports = 'weekly';
                    }
                }

                merged._updatedAt = new Date().toISOString();
                userSettings.set(userId, merged);

                console.log('✅ PUT /api/settings for admin:', req.user.username);

                return res.json({
                    success: true,
                    message: 'تم حفظ الإعدادات بنجاح',
                    settings: merged,
                    updatedAt: merged._updatedAt
                });
            } catch (error) {
                console.error('❌ Save settings error:', error);
                return res.status(500).json({ success: false, error: 'فشل حفظ الإعدادات' });
            }
        }
    );

    // ✅ POST /api/settings/reset — admin فقط
    app.post(
        '/api/settings/reset',
        authenticateAccessToken,
        requireAdmin,
        csrfProtection,
        (req, res) => {
            try {
                const userId = req.user.id;
                userSettings.delete(userId);

                console.log('✅ POST /api/settings/reset for admin:', req.user.username);

                return res.json({
                    success: true,
                    message: 'تم استعادة الإعدادات الافتراضية',
                    settings: { ...DEFAULT_SETTINGS }
                });
            } catch (error) {
                console.error('❌ Reset settings error:', error);
                return res.status(500).json({ success: false, error: 'فشل استعادة الإعدادات' });
            }
        }
    );

    // ========================================================
    // 📊 MONITORING API (admin فقط)
    // ========================================================

    // ✅ GET /api/monitoring/users
    app.get(
        '/api/monitoring/users',
        authenticateAccessToken,
        requireAdmin,
        (req, res) => {
            try {
                const safeUsers = users.map(u => ({
                    id: u.id,
                    username: u.username,
                    name: u.name || u.username,
                    email: u.email,
                    role: u.role,
                    active: u.active,
                    lastLogin: u.lastLogin,
                    createdAt: u.createdAt
                }));

                return res.json({
                    success: true,
                    users: safeUsers,
                    stats: {
                        total: users.length,
                        active: users.filter(u => u.active).length,
                        inactive: users.filter(u => !u.active).length
                    }
                });
            } catch (error) {
                console.error('❌ Monitoring users error:', error);
                return res.status(500).json({ success: false, error: 'فشل تحميل بيانات المستخدمين' });
            }
        }
    );

    // ✅ GET /api/monitoring/sessions
    app.get(
        '/api/monitoring/sessions',
        authenticateAccessToken,
        requireAdmin,
        async (req, res) => {
            try {
                const sessions = [];

                for (const [sessionId, record] of refreshSessions) {
                    if (record.expiresAt > Date.now()) {
                        const user = users.find(u => u.id === record.userId);
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

                return res.json({
                    success: true,
                    sessions,
                    stats: {
                        total: sessions.length
                    }
                });
            } catch (error) {
                console.error('❌ Monitoring sessions error:', error);
                return res.status(500).json({ success: false, error: 'فشل تحميل الجلسات' });
            }
        }
    );

    // ========================================================
    // 🛟 SUPPORT TICKETS API
    // ========================================================

    const supportTickets = [];

    app.get(
        '/api/support/tickets',
        authenticateAccessToken,
        (req, res) => {
            try {
                const isAdmin = isAdminUser(req.user);
                const list = isAdmin
                    ? supportTickets
                    : supportTickets.filter(t => t.userId === req.user.id);
                return res.json(list);
            } catch (error) {
                console.error('❌ Get tickets error:', error);
                return res.status(500).json({ success: false, error: 'فشل تحميل التذاكر' });
            }
        }
    );

    app.post(
        '/api/support/tickets',
        authenticateAccessToken,
        csrfProtection,
        (req, res) => {
            try {
                const { subject, message, priority } = req.body;

                if (typeof subject !== 'string' || !subject.trim()) {
                    return res.status(400).json({ success: false, error: 'الموضوع مطلوب' });
                }

                if (typeof message !== 'string' || !message.trim()) {
                    return res.status(400).json({ success: false, error: 'الرسالة مطلوبة' });
                }

                const allowedPriorities = ['منخفضة', 'متوسطة', 'عالية', 'عاجلة'];
                const finalPriority = allowedPriorities.includes(priority) ? priority : 'متوسطة';

                const ticket = {
                    id: 'T-' + Date.now().toString(36) + '-' + randomId(3),
                    userId: req.user.id,
                    username: req.user.username,
                    user: req.user.name || req.user.username,
                    subject: subject.trim(),
                    message: message.trim(),
                    priority: finalPriority,
                    status: 'مفتوحة',
                    createdAt: new Date().toISOString()
                };

                supportTickets.push(ticket);

                if (supportTickets.length > 5000) {
                    supportTickets.splice(0, supportTickets.length - 5000);
                }

                console.log('✅ Support ticket created:', ticket.id);

                addSystemLog({
                    userId: req.user.id,
                    action: 'SUPPORT_TICKET_CREATED',
                    details: `Ticket ${ticket.id}: ${ticket.subject}`,
                    ip: req.ip,
                    requestId: req.requestId
                });

                return res.status(201).json({
                    success: true,
                    message: 'تم إرسال التذكرة بنجاح',
                    ticket
                });
            } catch (error) {
                console.error('❌ Create ticket error:', error);
                return res.status(500).json({ success: false, error: 'فشل إرسال التذكرة' });
            }
        }
    );

    // ========================================================
    // 🚢 VESSELS API
    // ========================================================

    app.get(
        '/api/vessels',
        authenticateAccessToken,
        requirePermission('vessels:read'),
        (req, res) => {
            res.json(vessels);
        }
    );

    app.post(
        '/api/vessels',
        authenticateAccessToken,
        requirePermission('vessels:create'),
        csrfProtection,
        (req, res) => {
            try {
                const {
                    name, num, len, region, zone, port, supp, status,
                    break: breakType, fDate, eDate, ref, repairUnit, cat
                } = req.body;

                if (typeof name !== 'string' || !name.trim()) {
                    return res.status(400).json({ success: false, error: 'اسم المركب مطلوب' });
                }

                const newVessel = {
                    id: randomId(8),
                    name: name.trim(),
                    num: num || '',
                    len: Number(len) || 0,
                    region: region || '',
                    zone: zone || '',
                    port: port || '',
                    supp: supp || '',
                    status: status || 'صالح',
                    break: breakType || '',
                    fDate: fDate || null,
                    eDate: eDate || null,
                    ref: ref || '',
                    repairUnit: repairUnit || '',
                    cat: cat || '',
                    createdAt: new Date().toISOString()
                };

                vessels.push(newVessel);

                if (newVessel.status === 'معطب' || newVessel.status === 'صيانة') {
                    maintenanceLogs.push({
                        id: randomId(8),
                        vesselId: newVessel.id,
                        vesselName: newVessel.name,
                        vesselNum: newVessel.num,
                        type: breakType || 'صيانة دورية',
                        status: newVessel.status === 'معطب' ? 'متأخرة' : 'قيد التنفيذ',
                        date: fDate || new Date().toISOString(),
                        repairUnit: repairUnit || '—',
                        cost: 0,
                        notes: breakType ? `عطب: ${breakType}` : 'صيانة دورية',
                        createdAt: new Date().toISOString()
                    });
                }

                addSystemLog({
                    userId: req.user.id,
                    action: 'VESSEL_CREATED',
                    details: `Vessel ${newVessel.name} created`,
                    ip: req.ip,
                    requestId: req.requestId
                });

                return res.status(201).json({
                    success: true,
                    message: 'تم إضافة المركب بنجاح',
                    vessel: newVessel
                });
            } catch (error) {
                console.error('Add vessel:', error.message);
                return res.status(500).json({ success: false, error: 'خطأ في إضافة المركب' });
            }
        }
    );

    app.put(
        '/api/vessels/:id',
        authenticateAccessToken,
        requirePermission('vessels:update'),
        csrfProtection,
        (req, res) => {
            try {
                const vessel = vessels.find(item => item.id === req.params.id);

                if (!vessel) {
                    return res.status(404).json({ success: false, error: 'المركب غير موجود' });
                }

                const {
                    name, num, len, region, zone, port, supp, status,
                    break: breakType, fDate, eDate, ref, repairUnit, cat
                } = req.body;

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

                vessel.updatedAt = new Date().toISOString();

                if (
                    vessel.status &&
                    (vessel.status === 'معطب' || vessel.status === 'صيانة') &&
                    oldStatus !== vessel.status
                ) {
                    maintenanceLogs.push({
                        id: randomId(8),
                        vesselId: vessel.id,
                        vesselName: vessel.name,
                        vesselNum: vessel.num,
                        type: breakType || 'صيانة دورية',
                        status: vessel.status === 'معطب' ? 'متأخرة' : 'قيد التنفيذ',
                        date: fDate || new Date().toISOString(),
                        repairUnit: repairUnit || '—',
                        cost: 0,
                        notes: breakType ? `عطب: ${breakType}` : 'صيانة دورية',
                        createdAt: new Date().toISOString()
                    });
                }

                addSystemLog({
                    userId: req.user.id,
                    action: 'VESSEL_UPDATED',
                    details: `Vessel ${vessel.name} updated`,
                    ip: req.ip,
                    requestId: req.requestId
                });

                return res.json({
                    success: true,
                    message: 'تم تحديث المركب بنجاح',
                    vessel
                });
            } catch (error) {
                return res.status(500).json({ success: false, error: 'خطأ في تحديث المركب' });
            }
        }
    );

    app.delete(
        '/api/vessels/:id',
        authenticateAccessToken,
        requireAdmin,
        csrfProtection,
        (req, res) => {
            const index = vessels.findIndex(item => item.id === req.params.id);

            if (index === -1) {
                return res.status(404).json({ success: false, error: 'المركب غير موجود' });
            }

            const deleted = vessels[index];
            vessels.splice(index, 1);

            addSystemLog({
                userId: req.user.id,
                action: 'VESSEL_DELETED',
                details: `Vessel ${deleted.name} deleted`,
                ip: req.ip,
                requestId: req.requestId
            });

            return res.json({ success: true, message: 'تم حذف المركب بنجاح' });
        }
    );

    // ========================================================
    // 🔧 MAINTENANCE API
    // ========================================================

    function formatMaintenanceLogs() {
        return maintenanceLogs.map(log => {
            const isoDate = log.date || log.createdAt || new Date().toISOString();
            let displayDate = isoDate;

            try {
                const d = new Date(isoDate);
                if (!isNaN(d.getTime())) {
                    displayDate = d.toLocaleDateString('ar-EG');
                }
            } catch (e) {}

            return {
                id: log.id,
                vesselName: log.vesselName || log.vessel || '—',
                vessel: log.vesselName || log.vessel || '—',
                vesselNum: log.vesselNum || '',
                type: log.type || 'صيانة دورية',
                date: displayDate,
                isoDate: isoDate,
                createdAt: log.createdAt || isoDate,
                repairUnit: log.repairUnit || log.unit || '—',
                unit: log.repairUnit || log.unit || '—',
                status: log.status || 'قيد الانتظار',
                cost: Number(log.cost) || 0,
                notes: log.notes || '',
                vesselId: log.vesselId || '',
                updatedAt: log.updatedAt || null
            };
        });
    }

    app.get(
        '/api/maintenance-logs',
        authenticateAccessToken,
        requirePermission('maintenance:read'),
        (req, res) => {
            res.json(formatMaintenanceLogs());
        }
    );

    app.get(
        '/api/maintenance',
        authenticateAccessToken,
        requirePermission('maintenance:read'),
        (req, res) => {
            const records = formatMaintenanceLogs();

            res.json({
                success: true,
                records,
                stats: {
                    total: records.length,
                    completed: records.filter(item => item.status === 'مكتملة').length,
                    pending: records.filter(item => item.status === 'معلقة').length,
                    overdue: records.filter(item => item.status === 'متأخرة').length,
                    inProgress: records.filter(item => item.status === 'قيد التنفيذ').length
                }
            });
        }
    );

    app.post(
        '/api/maintenance-logs',
        authenticateAccessToken,
        requirePermission('maintenance:create'),
        csrfProtection,
        (req, res) => {
            try {
                const {
                    vesselId, vesselName, vesselNum, type, status,
                    date, repairUnit, cost, notes
                } = req.body;

                if (typeof vesselName !== 'string' || !vesselName.trim()) {
                    return res.status(400).json({ success: false, error: 'اسم المركب مطلوب' });
                }

                const logEntry = {
                    id: randomId(8),
                    vesselId: vesselId || '',
                    vesselName: vesselName.trim(),
                    vesselNum: vesselNum || '',
                    type: type || 'صيانة دورية',
                    status: status || 'قيد التنفيذ',
                    date: date || new Date().toISOString(),
                    repairUnit: repairUnit || '—',
                    cost: Number(cost) || 0,
                    notes: notes || '',
                    createdAt: new Date().toISOString()
                };

                maintenanceLogs.push(logEntry);

                addSystemLog({
                    userId: req.user.id,
                    action: 'MAINTENANCE_CREATED',
                    details: `Maintenance for ${logEntry.vesselName}`,
                    ip: req.ip,
                    requestId: req.requestId
                });

                return res.status(201).json({
                    success: true,
                    message: 'تم إضافة سجل الصيانة',
                    log: logEntry
                });
            } catch {
                return res.status(500).json({ success: false, error: 'خطأ في إضافة سجل الصيانة' });
            }
        }
    );

    app.put(
        '/api/maintenance-logs/:id',
        authenticateAccessToken,
        requirePermission('maintenance:update'),
        csrfProtection,
        (req, res) => {
            const log = maintenanceLogs.find(item => item.id === req.params.id);

            if (!log) {
                return res.status(404).json({ success: false, error: 'سجل الصيانة غير موجود' });
            }

            const { status, cost, notes } = req.body;

            if (status !== undefined) log.status = status;
            if (cost !== undefined) log.cost = Number(cost) || 0;
            if (notes !== undefined) log.notes = notes;

            log.updatedAt = new Date().toISOString();

            return res.json({
                success: true,
                message: 'تم تحديث سجل الصيانة',
                log
            });
        }
    );

    app.delete(
        '/api/maintenance-logs/:id',
        authenticateAccessToken,
        requireAdmin,
        csrfProtection,
        (req, res) => {
            const index = maintenanceLogs.findIndex(item => item.id === req.params.id);

            if (index === -1) {
                return res.status(404).json({ success: false, error: 'سجل الصيانة غير موجود' });
            }

            maintenanceLogs.splice(index, 1);
            return res.json({ success: true, message: 'تم حذف سجل الصيانة' });
        }
    );

    // ========================================================
    // 👥 USERS API
    // ========================================================

    app.get('/api/users', authenticateAccessToken, requireAdmin, (req, res) => {
        const safeUsers = users.map(user => ({
            id: user.id,
            username: user.username,
            name: user.name || user.username,
            email: user.email,
            role: user.role || 'viewer',
            active: user.active !== false,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin || null
        }));

        res.json(safeUsers);
    });

    app.post(
        '/api/users',
        authenticateAccessToken,
        requireAdmin,
        csrfProtection,
        async (req, res) => {
            try {
                const { username, password, email, role, active } = req.body;

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

                if (users.some(item => item.username.toLowerCase() === cleanUsername.toLowerCase())) {
                    return res.status(400).json({ success: false, error: 'اسم المستخدم موجود بالفعل' });
                }

                const allowedRoles = ['admin', 'super_admin', 'manager', 'operator', 'viewer', 'مسؤول', 'مدير', 'مشغل', 'مشاهد'];
                const finalRole = allowedRoles.includes(role) ? role : 'viewer';

                const newUser = {
                    id: randomId(8),
                    username: cleanUsername,
                    password: await bcrypt.hash(password, 12),
                    email: typeof email === 'string' ? email.trim() : `${cleanUsername}@marine.com`,
                    name: cleanUsername,
                    role: finalRole,
                    active: active !== undefined ? Boolean(active) : true,
                    tokenVersion: 0,
                    createdAt: new Date().toISOString(),
                    lastLogin: null,
                    loginAttempts: 0,
                    locked: false,
                    lockedUntil: null
                };

                users.push(newUser);

                addSystemLog({
                    userId: req.user.id,
                    action: 'USER_CREATED',
                    details: `User ${newUser.username} created`,
                    ip: req.ip,
                    requestId: req.requestId
                });

                const { password: ignored, ...safeUser } = newUser;

                return res.status(201).json({
                    success: true,
                    message: 'تم إضافة المستخدم بنجاح',
                    user: safeUser
                });
            } catch (error) {
                console.error('Create user:', error.message);
                return res.status(500).json({ success: false, error: 'خطأ في إضافة المستخدم' });
            }
        }
    );

    app.put(
        '/api/users/:id',
        authenticateAccessToken,
        requireAdmin,
        csrfProtection,
        async (req, res) => {
            const targetUser = users.find(item => item.id === req.params.id);

            if (!targetUser) {
                return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
            }

            const { username, email, role, active, password } = req.body;

            if (targetUser.username === 'admin' && username && username !== 'admin') {
                return res.status(403).json({ success: false, error: 'لا يمكن تغيير اسم المستخدم الرئيسي' });
            }

            if (targetUser.role === 'admin' && active === false) {
                const activeAdmins = users.filter(user => user.role === 'admin' && user.active !== false).length;
                if (activeAdmins <= 1) {
                    return res.status(403).json({ success: false, error: 'لا يمكن تعطيل آخر مسؤول نشط' });
                }
            }

            if (username) targetUser.username = username.trim();
            if (email) targetUser.email = email.trim();

            if (role) {
                const allowedRoles = ['admin', 'super_admin', 'manager', 'operator', 'viewer', 'مسؤول', 'مدير', 'مشغل', 'مشاهد'];
                if (!allowedRoles.includes(role)) {
                    return res.status(400).json({ success: false, error: 'صلاحية غير صالحة' });
                }
                targetUser.role = role;
            }

            if (active !== undefined) targetUser.active = Boolean(active);

            if (password) {
                if (!isStrongPassword(password)) {
                    return res.status(400).json({ success: false, error: 'كلمة المرور ضعيفة' });
                }
                targetUser.password = await bcrypt.hash(password, 12);
                targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
                await revokeAllUserSessions(targetUser.id);
            }

            if (active === false) {
                targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
                await revokeAllUserSessions(targetUser.id);
            }

            targetUser.updatedAt = new Date().toISOString();

            addSystemLog({
                userId: req.user.id,
                action: 'USER_UPDATED',
                details: `User ${targetUser.username} updated`,
                ip: req.ip,
                requestId: req.requestId
            });

            const { password: ignored, ...safeUser } = targetUser;

            return res.json({
                success: true,
                message: 'تم تحديث المستخدم بنجاح',
                user: safeUser
            });
        }
    );

    app.delete(
        '/api/users/:id',
        authenticateAccessToken,
        requireAdmin,
        csrfProtection,
        async (req, res) => {
            const targetUser = users.find(item => item.id === req.params.id);

            if (!targetUser) {
                return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
            }

            if (targetUser.username === 'admin') {
                return res.status(403).json({ success: false, error: 'لا يمكن حذف المستخدم الرئيسي' });
            }

            if (targetUser.role === 'admin') {
                const adminCount = users.filter(user => user.role === 'admin').length;
                if (adminCount <= 1) {
                    return res.status(403).json({ success: false, error: 'لا يمكن حذف آخر مسؤول' });
                }
            }

            await revokeAllUserSessions(targetUser.id);
            targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;

            const index = users.findIndex(user => user.id === targetUser.id);
            users.splice(index, 1);

            addSystemLog({
                userId: req.user.id,
                action: 'USER_DELETED',
                details: `User ${targetUser.username} deleted`,
                ip: req.ip,
                requestId: req.requestId
            });

            return res.json({ success: true, message: 'تم حذف المستخدم بنجاح' });
        }
    );

    app.put(
        '/api/users-status/:id',
        authenticateAccessToken,
        requireAdmin,
        csrfProtection,
        async (req, res) => {
            const { active } = req.body;
            const targetUser = users.find(item => item.id === req.params.id);

            if (!targetUser) {
                return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
            }

            if (targetUser.role === 'admin' && active === false) {
                const adminCount = users.filter(user => user.role === 'admin' && user.active !== false).length;
                if (adminCount <= 1) {
                    return res.status(403).json({ success: false, error: 'لا يمكن تعطيل آخر مسؤول نشط' });
                }
            }

            targetUser.active = Boolean(active);
            targetUser.updatedAt = new Date().toISOString();

            if (!targetUser.active) {
                targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
                await revokeAllUserSessions(targetUser.id);
            }

            return res.json({
                success: true,
                message: `تم ${targetUser.active ? 'تفعيل' : 'تعطيل'} المستخدم بنجاح`,
                user: {
                    id: targetUser.id,
                    username: targetUser.username,
                    active: targetUser.active
                }
            });
        }
    );

    // ========================================================
    // 📋 LOGS
    // ========================================================

    app.get('/api/logs', authenticateAccessToken, requireAdmin, (req, res) => {
        const safeLogs = systemLogs.slice(-100).map(log => ({
            id: log.id,
            userId: log.userId,
            action: log.action,
            details: log.details,
            requestId: log.requestId,
            timestamp: log.timestamp
        }));

        res.json(safeLogs);
    });

    app.post(
        '/api/logs',
        authenticateAccessToken,
        requireAdmin,
        csrfProtection,
        (req, res) => {
            const { action, details } = req.body;

            addSystemLog({
                userId: req.user.id,
                action: typeof action === 'string' ? action : 'Unknown',
                details: typeof details === 'string' ? details : '',
                ip: req.ip,
                requestId: req.requestId
            });

            return res.status(201).json({ success: true, message: 'تم إضافة السجل' });
        }
    );

    // ========================================================
    // 🧠 SESSION STATUS
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
    // 📍 LOCATIONS
    // ========================================================

    const locations = [];

    app.get('/api/locations', authenticateAccessToken, (req, res) => {
        res.json(locations);
    });

    app.post(
        '/api/locations',
        authenticateAccessToken,
        csrfProtection,
        (req, res) => {
            if (!hasPermission(req.user, 'vessels:update')) {
                return res.status(403).json({ success: false, error: 'ليس لديك صلاحية تسجيل الموقع' });
            }

            const { latitude, longitude, accuracy, vesselId } = req.body;
            const lat = Number(latitude);
            const lng = Number(longitude);

            if (
                !Number.isFinite(lat) || !Number.isFinite(lng) ||
                lat < -90 || lat > 90 || lng < -180 || lng > 180
            ) {
                return res.status(400).json({ success: false, error: 'إحداثيات غير صالحة' });
            }

            const location = {
                id: randomId(8),
                userId: req.user.id,
                username: req.user.username,
                vesselId: vesselId || null,
                latitude: lat,
                longitude: lng,
                accuracy: Number(accuracy) || null,
                timestamp: new Date().toISOString()
            };

            locations.push(location);

            if (locations.length > 5000) {
                locations.splice(0, locations.length - 5000);
            }

            return res.status(201).json({ success: true, location });
        }
    );

    // ========================================================
    // 🌐 STATIC FILES
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
    // 🌐 PAGE ROUTES
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

        return res.send('<h1>🚢 Marine System</h1><p>System is running</p>');
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
    // 🚨 GLOBAL ERROR
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
    // 🚀 START
    // ========================================================

    if (require.main === module) {
        app.listen(PORT, () => {
            console.log('=========================================');
            console.log('🚢 MARINE SYSTEM v9.6');
            console.log('🔐 JWT + REFRESH + CSRF + SESSION + RBAC');
            console.log('✨ v9.6: Settings + Monitoring (admin only)');
            console.log('=========================================');
            console.log(`📍 Port: ${PORT}`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`👤 Admin: ${ADMIN_USERNAME}`);
            console.log(`📊 Vessels: ${vessels.length}`);
            console.log(`📝 Maintenance: ${maintenanceLogs.length}`);
            console.log(`👥 Users: ${users.length}`);
            console.log('🔒 Access JWT: 15 minutes');
            console.log('🔄 Refresh JWT: 7 days');
            console.log('🛡️ CSRF: ENABLED');
            console.log('🔐 tokenVersion: ENABLED');
            console.log('👑 RBAC: ENABLED');
            console.log(`💾 Redis: ${redisAvailable ? 'CONNECTED' : 'MEMORY FALLBACK'}`);
            console.log('=========================================');
        });
    }
})();

// ============================================================
// 📤 EXPORTS
// ============================================================

module.exports = app;
module.exports.csrfProtection = csrfProtection;
module.exports.authenticateAccessToken = authenticateAccessToken;
module.exports.requirePermission = requirePermission;
module.exports.requireAdmin = requireAdmin;
module.exports.hasPermission = hasPermission;
module.exports.users = users;
module.exports.vessels = vessels;
module.exports.maintenanceLogs = maintenanceLogs;
module.exports.systemLogs = systemLogs;
module.exports.revokedAccessTokens = revokedAccessTokens;
module.exports.isAccessTokenRevoked = isAccessTokenRevoked;
module.exports.addSystemLog = addSystemLog;
