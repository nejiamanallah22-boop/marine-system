/**
 * ============================================================
 * 🚢 MARINE SYSTEM - SERVER v44.1 (FIXED)
 * ============================================================
 * ✅ إصلاح تحذيرات MongoDB (Duplicate indexes)
 * ✅ إصلاح CORS لـ Render.com
 * ✅ تحسين الأداء
 * ============================================================
 */

'use strict';

// ============================================================
// 📦 LOAD ENVIRONMENT
// ============================================================
require('dotenv').config();

// ✅ التحقق من المتغيرات البيئية الأساسية
const requiredEnv = [
    'MONGODB_URI',
    'JWT_SECRET',
    'REFRESH_TOKEN_SECRET'
];

const missingEnv = requiredEnv.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingEnv.forEach(key => console.error(`   - ${key}`));
    console.log('\n📝 Please check your .env file');
    process.exit(1);
}

// ============================================================
// 📦 IMPORTS
// ============================================================
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const morgan = require('morgan');
const winston = require('winston');

const app = express();

// ============================================================
// ⚙️ CONFIGURATION
// ============================================================
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// ✅ إعدادات CORS - متغيرات البيئة
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [];

// ✅ إضافة URL الخاص بـ Render تلقائياً
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || process.env.RENDER_URL || null;
if (RENDER_URL && !ALLOWED_ORIGINS.includes(RENDER_URL)) {
    ALLOWED_ORIGINS.push(RENDER_URL);
}

// ✅ إضافة localhost للتطوير
if (!IS_PRODUCTION) {
    ALLOWED_ORIGINS.push('http://localhost:3000');
    ALLOWED_ORIGINS.push('http://localhost:5000');
    ALLOWED_ORIGINS.push('http://127.0.0.1:3000');
    ALLOWED_ORIGINS.push('http://127.0.0.1:5000');
}

console.log('\n' + '='.repeat(60));
console.log('🚢 MARINE SYSTEM v44.1');
console.log('='.repeat(60));
console.log(`✅ Port: ${PORT}`);
console.log(`✅ Environment: ${NODE_ENV}`);
console.log(`✅ Allowed Origins: ${ALLOWED_ORIGINS.length}`);
console.log('   ' + ALLOWED_ORIGINS.join('\n   '));
console.log('='.repeat(60) + '\n');

// ============================================================
// 📊 LOGGER
// ============================================================
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({
            filename: process.env.LOG_FILE || 'logs/combined.log',
            maxsize: 10485760,
            maxFiles: 5,
            tailable: true
        }),
        new winston.transports.File({
            filename: process.env.LOG_ERROR_FILE || 'logs/error.log',
            level: 'error',
            maxsize: 10485760,
            maxFiles: 5,
            tailable: true
        })
    ]
});

if (!IS_PRODUCTION) {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

// ============================================================
// 🗄️ MONGODB - اتصال
// ============================================================
const connectDB = async () => {
    try {
        const options = {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE) || 10,
            minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE) || 2,
            family: 4,
            ...(process.env.MONGODB_USER && {
                auth: {
                    username: process.env.MONGODB_USER,
                    password: process.env.MONGODB_PASSWORD
                },
                authSource: process.env.MONGODB_AUTH_SOURCE || 'admin'
            })
        };

        await mongoose.connect(process.env.MONGODB_URI, options);
        logger.info('✅ MongoDB Connected');
    } catch (error) {
        logger.error('❌ MongoDB Connection Error:', error.message);
        if (IS_PRODUCTION) {
            logger.info('🔄 Retrying in 5 seconds...');
            setTimeout(connectDB, 5000);
        } else {
            process.exit(1);
        }
    }
};

// ============================================================
// 📦 MODELS - بدون تكرار Indexes
// ============================================================

// ============================================================
// 👤 USER MODEL
// ============================================================
const UserSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true, 
        trim: true,
        minlength: 2,
        maxlength: 100
    },
    username: { 
        type: String, 
        required: true, 
        unique: true, 
        trim: true, 
        lowercase: true,
        minlength: 3,
        maxlength: 50
    },
    email: { 
        type: String, 
        required: true, 
        unique: true, 
        lowercase: true, 
        trim: true
    },
    password: { 
        type: String, 
        required: true, 
        select: false,
        minlength: 8
    },
    role: { 
        type: String, 
        enum: ['admin', 'manager', 'operator', 'viewer'], 
        default: 'viewer' 
    },
    isActive: { type: Boolean, default: true },
    isLocked: { type: Boolean, default: false },
    tokenVersion: { type: Number, default: 0 },
    lastLogin: { type: Date },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    refreshToken: { type: String, select: false },
    refreshTokenVersion: { type: Number, default: 0 },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// ✅ Indexes - تعريف واحد فقط
UserSchema.index({ username: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ isActive: 1 });
UserSchema.index({ role: 1 });

// ============================================================
// 📋 SESSION MODEL
// ============================================================
const SessionSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    token: { 
        type: String, 
        required: true, 
        unique: true 
    },
    refreshToken: { 
        type: String, 
        required: true, 
        unique: true 
    },
    ip: { type: String },
    userAgent: { type: String },
    expiresAt: { type: Date, required: true },
    isRevoked: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// ✅ Indexes - تعريف واحد فقط
SessionSchema.index({ token: 1 }, { unique: true });
SessionSchema.index({ refreshToken: 1 }, { unique: true });
SessionSchema.index({ userId: 1 });
SessionSchema.index({ expiresAt: 1 });

// ============================================================
// 📋 AUDIT LOG MODEL
// ============================================================
const AuditLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: { type: String },
    action: { type: String, required: true },
    resource: { type: String },
    resourceId: { type: String },
    details: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
    status: { type: String, enum: ['success', 'failure'], default: 'success' },
    timestamp: { type: Date, default: Date.now }
});

// ✅ Indexes
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ username: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });

// ============================================================
// 🚢 VESSEL MODEL
// ============================================================
const VesselSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    num: { type: String, trim: true },
    len: { type: Number, default: 0 },
    stat: { type: String, enum: ['صالح', 'معطب', 'صيانة'], default: 'صالح' },
    region: { type: String, trim: true },
    zone: { type: String, trim: true },
    port: { type: String, trim: true },
    supp: { type: String, trim: true },
    break: { type: String, trim: true },
    fDate: { type: Date },
    eDate: { type: Date },
    ref: { type: String, trim: true },
    cat: { type: String, trim: true },
    repairUnit: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// ✅ Indexes
VesselSchema.index({ name: 1 });
VesselSchema.index({ stat: 1 });
VesselSchema.index({ num: 1 });

// ============================================================
// 📦 MODELS INIT
// ============================================================
const User = mongoose.model('User', UserSchema);
const Session = mongoose.model('Session', SessionSchema);
const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
const Vessel = mongoose.model('Vessel', VesselSchema);

// ============================================================
// 🧰 HELPERS
// ============================================================
function cleanUser(user) {
    if (!user) return null;
    return {
        id: user._id.toString(),
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        twoFactorEnabled: user.twoFactorEnabled || false,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
    };
}

function generateToken(user) {
    return jwt.sign(
        { 
            id: user._id.toString(), 
            role: user.role, 
            tokenVersion: user.tokenVersion || 0,
            jti: crypto.randomBytes(16).toString('hex')
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRY || '15m', issuer: 'marine-system' }
    );
}

function generateRefreshToken() {
    return crypto.randomBytes(64).toString('hex');
}

function verifyToken(token) {
    try {
        return jwt.verify(token, process.env.JWT_SECRET, { issuer: 'marine-system' });
    } catch { return null; }
}

function generateNonce() {
    return crypto.randomBytes(16).toString('base64');
}

function sanitizeInput(input) {
    if (!input) return '';
    if (typeof input !== 'string') return input;
    return input.replace(/[<>]/g, '').trim();
}

// ============================================================
// 🔐 SECURITY MIDDLEWARE
// ============================================================

// ✅ 1. CORS - مُصلح بالكامل
app.use(cors({
    origin: function(origin, callback) {
        // ✅ السماح بطلبات بدون Origin (مثل Postman) في التطوير فقط
        if (!origin) {
            if (!IS_PRODUCTION) {
                return callback(null, true);
            }
            return callback(new Error('CORS: Origin not allowed'));
        }
        
        // ✅ التحقق من السماح
        const isAllowed = ALLOWED_ORIGINS.some(allowed => {
            // ✅ دعم wildcard
            if (allowed === '*') return true;
            // ✅ دعم مطابقة جزئية (مثل *.onrender.com)
            if (allowed.startsWith('*.')) {
                const domain = allowed.substring(2);
                return origin.includes(domain) || origin.endsWith(domain);
            }
            return origin === allowed;
        });
        
        if (isAllowed) {
            return callback(null, true);
        }
        
        // ✅ السماح بـ localhost في التطوير
        if (!IS_PRODUCTION && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
            return callback(null, true);
        }
        
        logger.warn('CORS blocked:', origin);
        callback(new Error('CORS: Origin not allowed'));
    },
    credentials: process.env.CORS_CREDENTIALS === 'true' || true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Accept',
        'X-Request-ID',
        'X-CSRF-Token'
    ],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    maxAge: 86400
}));

// ✅ 2. Security Headers
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "blob:"],
            fontSrc: ["'self'"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: []
        }
    },
    hsts: {
        maxAge: parseInt(process.env.HSTS_MAX_AGE) || 31536000,
        includeSubDomains: process.env.HSTS_INCLUDE_SUBDOMAINS !== 'false',
        preload: process.env.HSTS_PRELOAD === 'true'
    },
    xssFilter: true,
    noSniff: true,
    referrerPolicy: { policy: process.env.REFERRER_POLICY || 'strict-origin-when-cross-origin' }
}));

// ✅ 3. Rate Limiting
const globalLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'طلبات كثيرة جداً' },
    keyGenerator: (req) => req.ip
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'محاولات كثيرة، حاول بعد 15 دقيقة' },
    keyGenerator: (req) => req.ip
});

app.use('/api', globalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

// ✅ 4. Body Parsers
app.use(express.json({ 
    limit: process.env.MAX_FILE_SIZE || '1mb' 
}));
app.use(express.urlencoded({ 
    extended: true, 
    limit: process.env.MAX_FILE_SIZE || '1mb' 
}));
app.use(cookieParser());

// ✅ 5. Compression
app.use(compression());

// ✅ 6. Logging
app.use(morgan('combined', { 
    stream: { 
        write: (message) => logger.info(message.trim()) 
    } 
}));

// ✅ 7. Request ID
app.use((req, res, next) => {
    req.requestId = req.headers['x-request-id'] || uuidv4();
    res.setHeader('X-Request-ID', req.requestId);
    next();
});

// ============================================================
// 🔐 AUTH MIDDLEWARE
// ============================================================
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false, 
                error: 'غير مصرح' 
            });
        }

        const token = authHeader.substring(7).trim();
        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ 
                success: false, 
                error: 'توكن غير صالح' 
            });
        }

        const user = await User.findById(decoded.id);
        if (!user || !user.isActive) {
            return res.status(401).json({ 
                success: false, 
                error: 'غير مصرح' 
            });
        }

        const lockCheck = user.checkLock ? user.checkLock() : null;
        if (lockCheck && lockCheck.locked) {
            return res.status(423).json({
                success: false,
                error: `الحساب مقفل، حاول بعد ${lockCheck.remainingMinutes} دقيقة`
            });
        }

        if (decoded.tokenVersion !== (user.tokenVersion || 0)) {
            return res.status(401).json({ 
                success: false, 
                error: 'انتهت صلاحية الجلسة' 
            });
        }

        req.user = user;
        next();
    } catch (error) {
        logger.error('Auth error:', error.message);
        return res.status(401).json({ 
            success: false, 
            error: 'غير مصرح' 
        });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                error: 'ليس لديك صلاحية' 
            });
        }
        next();
    };
};

// ============================================================
// 🔐 CREATE ADMIN
// ============================================================
async function createAdmin() {
    try {
        const adminUsername = process.env.ADMIN_USERNAME || 'admin';
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@marine-system.com';
        const adminName = process.env.ADMIN_NAME || 'مدير النظام';

        const existing = await User.findOne({ username: adminUsername }).select('+password');
        if (existing) {
            const passwordMatches = await bcrypt.compare(adminPassword, existing.password);
            if (!passwordMatches) {
                existing.password = await bcrypt.hash(adminPassword, 12);
                existing.tokenVersion = (existing.tokenVersion || 0) + 1;
                await existing.save();
                logger.info('✅ Admin password updated');
            }
            logger.info(`✅ Admin exists: ${adminUsername}`);
            return;
        }

        const admin = new User({
            name: adminName,
            username: adminUsername,
            email: adminEmail,
            password: await bcrypt.hash(adminPassword, 12),
            role: 'admin',
            isActive: true,
            tokenVersion: 1
        });
        await admin.save();
        logger.info(`✅ Admin created: ${adminUsername}`);
    } catch (error) {
        logger.error('❌ Admin error:', error.message);
    }
}

// ============================================================
// 🌱 SEED VESSELS
// ============================================================
async function seedVessels() {
    try {
        const count = await Vessel.countDocuments();
        if (count === 0) {
            const vessels = [
                { name: 'البروق 1', num: 'B001', len: 11, region: 'الشمال', stat: 'صالح', cat: 'البروق', port: 'تونس' },
                { name: 'صقر 2', num: 'S002', len: 10, region: 'الساحل', stat: 'صالح', cat: 'صقور', port: 'سوسة' },
                { name: 'خافرة 3', num: 'K003', len: 20, region: 'الوسط', stat: 'معطب', cat: 'خوافر', port: 'صفاقس' }
            ];
            await Vessel.insertMany(vessels);
            logger.info(`✅ Added ${vessels.length} vessels`);
        }
    } catch (error) {
        logger.error('❌ Seed error:', error.message);
    }
}

// ============================================================
// 📋 AUDIT LOG
// ============================================================
async function logAudit(userId, username, action, resource, resourceId, details, status, req) {
    try {
        await AuditLog.create({
            userId,
            username,
            action,
            resource,
            resourceId,
            details,
            ip: req?.ip || req?.connection?.remoteAddress || 'unknown',
            userAgent: req?.headers?.['user-agent'] || 'unknown',
            status: status || 'success'
        });
    } catch (error) {
        logger.error('❌ Audit log error:', error.message);
    }
}

// ============================================================
// 🔐 AUTH ROUTES
// ============================================================

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: 'اسم المستخدم وكلمة المرور مطلوبان'
            });
        }

        const user = await User.findOne({
            $or: [
                { username: username.toLowerCase() },
                { email: username.toLowerCase() }
            ]
        }).select('+password');

        if (!user) {
            await logAudit(null, username, 'LOGIN_FAILED', 'auth', null, { reason: 'User not found' }, 'failure', req);
            return res.status(401).json({
                success: false,
                error: 'اسم المستخدم أو كلمة المرور غير صحيحة'
            });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            user.loginAttempts = (user.loginAttempts || 0) + 1;
            if (user.loginAttempts >= 5) {
                user.isLocked = true;
                user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
            }
            await user.save();
            await logAudit(user._id, user.username, 'LOGIN_FAILED', 'auth', null, { reason: 'Invalid password' }, 'failure', req);
            return res.status(401).json({
                success: false,
                error: 'اسم المستخدم أو كلمة المرور غير صحيحة'
            });
        }

        user.loginAttempts = 0;
        user.isLocked = false;
        user.lockUntil = null;
        user.lastLogin = new Date();
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        const token = generateToken(user);
        const refreshToken = generateRefreshToken();
        
        const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
        user.refreshToken = hashedRefreshToken;
        user.refreshTokenVersion = (user.refreshTokenVersion || 0) + 1;
        await user.save();

        await Session.create({
            userId: user._id,
            token: token,
            refreshToken: refreshToken,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        await logAudit(user._id, user.username, 'LOGIN_SUCCESS', 'auth', null, {}, 'success', req);

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/api/auth/refresh'
        });

        return res.json({
            success: true,
            user: cleanUser(user),
            token: token
        });

    } catch (error) {
        logger.error('❌ Login error:', error.message);
        return res.status(500).json({
            success: false,
            error: 'حدث خطأ في الخادم'
        });
    }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
    try {
        await Session.deleteOne({ token: req.headers.authorization?.substring(7) });
        
        req.user.tokenVersion = (req.user.tokenVersion || 0) + 1;
        req.user.refreshToken = null;
        await req.user.save();

        res.clearCookie('refreshToken', { path: '/api/auth/refresh' });

        await logAudit(req.user._id, req.user.username, 'LOGOUT', 'auth', null, {}, 'success', req);

        res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/auth/me', authenticate, (req, res) => {
    res.json({ success: true, user: cleanUser(req.user) });
});

app.get('/api/auth/verify', authenticate, (req, res) => {
    res.json({ success: true, user: cleanUser(req.user), message: 'التوكن صالح' });
});

// ============================================================
// 👥 USERS CRUD
// ============================================================

app.get('/api/users', authenticate, authorize('admin'), async (req, res) => {
    try {
        const users = await User.find({}).select('-password -refreshToken').sort({ createdAt: -1 });
        await logAudit(req.user._id, req.user.username, 'READ_USERS', 'users', null, { count: users.length }, 'success', req);
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/users', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { name, username, email, password, role } = req.body;

        if (!name || !username || !email || !password) {
            return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
        }

        const sanitizedName = sanitizeInput(name);
        const sanitizedUsername = sanitizeInput(username).toLowerCase();
        const sanitizedEmail = sanitizeInput(email).toLowerCase();

        const existing = await User.findOne({
            $or: [{ email: sanitizedEmail }, { username: sanitizedUsername }]
        });
        if (existing) {
            return res.status(400).json({ success: false, error: 'البريد أو اسم المستخدم موجود' });
        }

        if (password.length < 8) {
            return res.status(400).json({ success: false, error: 'كلمة المرور 8 أحرف على الأقل' });
        }

        const user = new User({
            name: sanitizedName,
            username: sanitizedUsername,
            email: sanitizedEmail,
            password: await bcrypt.hash(password, 12),
            role: role || 'viewer',
            isActive: true
        });

        await user.save();

        await logAudit(req.user._id, req.user.username, 'CREATE_USER', 'users', user._id.toString(), {
            username: user.username,
            role: user.role
        }, 'success', req);

        res.status(201).json({ success: true, user: cleanUser(user), message: 'تم إضافة المستخدم' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/users/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, username, email, role, isActive } = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }

        if (user.role === 'admin' && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'لا يمكن تعديل مسؤول' });
        }

        if (name) user.name = sanitizeInput(name);
        if (username) user.username = sanitizeInput(username).toLowerCase();
        if (email) user.email = sanitizeInput(email).toLowerCase();
        if (role) user.role = role;
        if (isActive !== undefined) user.isActive = isActive;

        await user.save();

        await logAudit(req.user._id, req.user.username, 'UPDATE_USER', 'users', user._id.toString(), {
            username: user.username,
            role: user.role
        }, 'success', req);

        res.json({ success: true, user: cleanUser(user), message: 'تم تحديث المستخدم' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/users/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { id } = req.params;

        if (id === req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'لا يمكن حذف حسابك' });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }

        if (user.role === 'admin') {
            return res.status(403).json({ success: false, error: 'لا يمكن حذف المسؤول' });
        }

        const username = user.username;
        await user.deleteOne();

        await logAudit(req.user._id, req.user.username, 'DELETE_USER', 'users', id, { username }, 'success', req);

        res.json({ success: true, message: 'تم حذف المستخدم' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/users/:id/password', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { password } = req.body;

        if (!password || password.length < 8) {
            return res.status(400).json({ success: false, error: 'كلمة المرور 8 أحرف على الأقل' });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }

        if (user.role === 'admin' && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'لا يمكن تغيير كلمة مرور المسؤول' });
        }

        user.password = await bcrypt.hash(password, 12);
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        user.refreshToken = null;
        await user.save();

        await Session.deleteMany({ userId: user._id });

        await logAudit(req.user._id, req.user.username, 'CHANGE_PASSWORD', 'users', user._id.toString(), {
            username: user.username
        }, 'success', req);

        res.json({ success: true, message: 'تم تغيير كلمة المرور' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🚢 VESSELS ROUTES
// ============================================================

app.get('/api/vessels', authenticate, async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json({ success: true, vessels });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/vessels', authenticate, authorize('manager', 'admin'), async (req, res) => {
    try {
        const vessel = new Vessel(req.body);
        await vessel.save();
        await logAudit(req.user._id, req.user.username, 'CREATE_VESSEL', 'vessels', vessel._id.toString(), {
            name: vessel.name,
            num: vessel.num
        }, 'success', req);
        res.status(201).json({ success: true, vessel });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/vessels/:id', authenticate, authorize('manager', 'admin'), async (req, res) => {
    try {
        const vessel = await Vessel.findById(req.params.id);
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'السفينة غير موجودة' });
        }
        Object.assign(vessel, req.body);
        vessel.updatedAt = new Date();
        await vessel.save();
        await logAudit(req.user._id, req.user.username, 'UPDATE_VESSEL', 'vessels', vessel._id.toString(), {
            name: vessel.name,
            num: vessel.num
        }, 'success', req);
        res.json({ success: true, vessel });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/vessels/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const vessel = await Vessel.findById(req.params.id);
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'السفينة غير موجودة' });
        }
        await vessel.deleteOne();
        await logAudit(req.user._id, req.user.username, 'DELETE_VESSEL', 'vessels', req.params.id, {
            name: vessel.name,
            num: vessel.num
        }, 'success', req);
        res.json({ success: true, message: 'تم حذف السفينة' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📊 SESSIONS ROUTES
// ============================================================

app.get('/api/sessions', authenticate, authorize('admin'), async (req, res) => {
    try {
        const sessions = await Session.find({ isRevoked: false })
            .populate('userId', 'username name email role')
            .sort({ createdAt: -1 });

        const result = sessions.map(s => ({
            id: s._id,
            username: s.userId?.username || 'unknown',
            userName: s.userId?.name || 'unknown',
            role: s.userId?.role || 'unknown',
            ip: s.ip,
            userAgent: s.userAgent,
            createdAt: s.createdAt,
            expiresAt: s.expiresAt,
            isActive: s.expiresAt > new Date()
        }));

        res.json({ success: true, sessions: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/sessions/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const session = await Session.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ success: false, error: 'الجلسة غير موجودة' });
        }
        session.isRevoked = true;
        await session.save();
        await logAudit(req.user._id, req.user.username, 'REVOKE_SESSION', 'sessions', req.params.id, {}, 'success', req);
        res.json({ success: true, message: 'تم إبطال الجلسة' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📋 AUDIT ROUTES
// ============================================================

app.get('/api/audit', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { limit = 50, skip = 0, action, username } = req.query;
        const filter = {};
        if (action) filter.action = action;
        if (username) filter.username = username;

        const logs = await AuditLog.find(filter)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip));

        const total = await AuditLog.countDocuments(filter);

        res.json({
            success: true,
            logs,
            pagination: { total, limit: parseInt(limit), skip: parseInt(skip) }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📁 STATIC FILES
// ============================================================

const publicPath = path.join(__dirname, 'public');
const pagesPath = path.join(publicPath, 'pages');

if (!fs.existsSync(publicPath)) fs.mkdirSync(publicPath, { recursive: true });
if (!fs.existsSync(pagesPath)) fs.mkdirSync(pagesPath, { recursive: true });

app.use(express.static(publicPath, { 
    index: false, 
    maxAge: IS_PRODUCTION ? '1d' : 0,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
        if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000');
        }
    }
}));

app.get('/', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        let html = fs.readFileSync(indexPath, 'utf8');
        const nonce = generateNonce();
        html = html.replace(/\{\{NONCE\}\}/g, nonce);
        res.setHeader('Content-Security-Policy', 
            `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests; block-all-mixed-content;`
        );
        res.send(html);
    } else {
        res.status(404).send('index.html not found');
    }
});

app.get('*', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        let html = fs.readFileSync(indexPath, 'utf8');
        const nonce = generateNonce();
        html = html.replace(/\{\{NONCE\}\}/g, nonce);
        res.setHeader('Content-Security-Policy', 
            `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests; block-all-mixed-content;`
        );
        res.send(html);
    } else {
        res.status(404).send('index.html not found');
    }
});

// ============================================================
// 💥 ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
    logger.error('❌ Error:', err.message);
    logger.error('📋 Stack:', err.stack);
    
    res.status(500).json({ 
        success: false, 
        error: IS_PRODUCTION ? 'حدث خطأ في الخادم' : err.message 
    });
});

// ============================================================
// 🚀 START
// ============================================================

async function startServer() {
    try {
        await connectDB();
        
        // ✅ إعداد الأدلة
        ['logs', 'uploads', 'backups'].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });

        await createAdmin();
        await seedVessels();

        app.listen(PORT, '0.0.0.0', () => {
            console.log('');
            console.log('='.repeat(60));
            console.log('🚢 MARINE SYSTEM v44.1 - FIXED');
            console.log('🚀 SERVER RUNNING');
            console.log('='.repeat(60));
            console.log(`🌍 Port: ${PORT}`);
            console.log(`🌐 Host: 0.0.0.0 (all interfaces)`);
            console.log(`🔐 Environment: ${NODE_ENV}`);
            console.log('🗄️ MongoDB: Connected ✅');
            console.log(`🛡️ CORS: ${ALLOWED_ORIGINS.length} origins allowed`);
            console.log('🔒 CSP: Enabled with Nonce');
            console.log('📊 Rate Limiting: Enabled');
            console.log('='.repeat(60));
            console.log('');
            console.log('📋 API ENDPOINTS:');
            console.log('   🔐 AUTH:');
            console.log('   POST   /api/auth/login');
            console.log('   POST   /api/auth/logout');
            console.log('   POST   /api/auth/refresh');
            console.log('   GET    /api/auth/me');
            console.log('   GET    /api/auth/verify');
            console.log('   👥 USERS:');
            console.log('   GET    /api/users');
            console.log('   POST   /api/users');
            console.log('   PUT    /api/users/:id');
            console.log('   DELETE /api/users/:id');
            console.log('   POST   /api/users/:id/password');
            console.log('   🚢 VESSELS:');
            console.log('   GET    /api/vessels');
            console.log('   POST   /api/vessels');
            console.log('   PUT    /api/vessels/:id');
            console.log('   DELETE /api/vessels/:id');
            console.log('   📊 SESSIONS:');
            console.log('   GET    /api/sessions');
            console.log('   DELETE /api/sessions/:id');
            console.log('   📋 AUDIT:');
            console.log('   GET    /api/audit');
            console.log('='.repeat(60));
            console.log('');
            console.log('🔑 LOGIN CREDENTIALS:');
            console.log(`   👤 Username: ${process.env.ADMIN_USERNAME || 'admin'}`);
            console.log(`   🔑 Password: ${process.env.ADMIN_PASSWORD || 'admin123'}`);
            console.log('='.repeat(60));
            console.log('');
            console.log('✅ Server is ready!');
            console.log(`🌐 URL: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}`);
            console.log('');
        });

    } catch (error) {
        logger.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// ✅ Graceful Shutdown
process.on('SIGTERM', async () => {
    logger.info('🛑 SIGTERM received, shutting down gracefully...');
    await mongoose.disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('🛑 SIGINT received, shutting down gracefully...');
    await mongoose.disconnect();
    process.exit(0);
});

startServer();
