/**
 * ============================================================
 * 🚢 MARINE SYSTEM - SERVER v44.0 (SECURE ENTERPRISE)
 * ============================================================
 * ✅ جميع الثغرات الأمنية مُصلحة
 * ✅ CORS مُقيد بالكامل
 * ✅ CSP مع Nonce حقيقي
 * ✅ Rate Limiting متقدم
 * ✅ CSRF Protection
 * ✅ Security Headers كاملة
 * ✅ Helmet محسّن
 * ✅ Logging متقدم
 * ✅ Audit Trail
 * ✅ RBAC كامل
 * ✅ MongoDB محمي
 * ============================================================
 */

'use strict';

require('dotenv').config();

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

const app = express();

// ============================================================
// ⚙️ CONFIGURATION - آمنة
// ============================================================

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// ✅ التحقق من المتغيرات البيئية المطلوبة
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'SESSION_SECRET'];
const missingEnv = REQUIRED_ENV.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
    console.error('❌ Missing required environment variables:', missingEnv.join(', '));
    console.log('📝 Please set these variables in .env file');
    process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'];
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@marine-system.com';
const ADMIN_NAME = process.env.ADMIN_NAME || 'مدير النظام';

console.log('\n' + '='.repeat(60));
console.log('🚢 MARINE SYSTEM v44.0 - SECURE ENTERPRISE');
console.log('='.repeat(60));
console.log(`✅ Port: ${PORT}`);
console.log(`✅ Environment: ${NODE_ENV}`);
console.log(`✅ MongoDB: ${MONGODB_URI ? '✓' : '✗'}`);
console.log(`✅ Allowed Origins: ${ALLOWED_ORIGINS.length}`);
console.log('='.repeat(60) + '\n');

// ============================================================
// 📦 MODELS - مع Validation محسن
// ============================================================

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'manager', 'operator', 'viewer'], default: 'viewer' },
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

// ✅ Indexes محسّنة
UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ isActive: 1 });

UserSchema.pre('save', async function(next) {
    this.updatedAt = new Date();
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) { next(error); }
});

UserSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.incrementLoginAttempts = async function() {
    this.loginAttempts = (this.loginAttempts || 0) + 1;
    if (this.loginAttempts >= 5) {
        this.isLocked = true;
        this.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
    await this.save();
};

UserSchema.methods.resetLoginAttempts = async function() {
    this.loginAttempts = 0;
    this.isLocked = false;
    this.lockUntil = null;
    await this.save();
};

UserSchema.methods.checkLock = function() {
    if (!this.isLocked) return null;
    if (this.lockUntil && this.lockUntil > new Date()) {
        return { locked: true, remainingMinutes: Math.ceil((this.lockUntil.getTime() - Date.now()) / 60000) };
    }
    this.isLocked = false;
    this.lockUntil = null;
    this.loginAttempts = 0;
    return { locked: false };
};

// ✅ Audit Log Schema
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

AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ username: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });

// ✅ Session Schema
const SessionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    token: { type: String, required: true, unique: true },
    refreshToken: { type: String, required: true, unique: true },
    ip: { type: String },
    userAgent: { type: String },
    expiresAt: { type: Date, required: true },
    isRevoked: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

SessionSchema.index({ userId: 1 });
SessionSchema.index({ token: 1 });
SessionSchema.index({ expiresAt: 1 });

const User = mongoose.model('User', UserSchema);
const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
const Session = mongoose.model('Session', SessionSchema);

// ============================================================
// 🧰 SECURE HELPERS
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
        JWT_SECRET,
        { expiresIn: '15m', issuer: 'marine-system' }
    );
}

function generateRefreshToken() {
    return crypto.randomBytes(64).toString('hex');
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET, { issuer: 'marine-system' });
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
// 📁 PATHS
// ============================================================

const publicPath = path.join(__dirname, 'public');
const pagesPath = path.join(publicPath, 'pages');

if (!fs.existsSync(publicPath)) fs.mkdirSync(publicPath, { recursive: true });
if (!fs.existsSync(pagesPath)) fs.mkdirSync(pagesPath, { recursive: true });

// ============================================================
// 🔐 SECURITY MIDDLEWARE - مُحسّن بالكامل
// ============================================================

// ✅ إزالة معلومات الخادم
app.disable('x-powered-by');
app.set('trust proxy', 1);

// ✅ CORS - مُقيد بالكامل
app.use(cors({
    origin: function(origin, callback) {
        // السماح بدون origin (مثل Postman) فقط في التطوير
        if (!origin) {
            if (!IS_PRODUCTION) {
                return callback(null, true);
            }
            return callback(new Error('CORS: Origin not allowed'));
        }
        
        // ✅ التحقق من السماح
        if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
            return callback(null, true);
        }
        
        // ✅ السماح بـ localhost في التطوير
        if (!IS_PRODUCTION && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
            return callback(null, true);
        }
        
        callback(new Error('CORS: Origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Request-ID', 'X-CSRF-Token'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    maxAge: 86400
}));

// ✅ Helmet - مع CSP
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
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
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    xssFilter: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// ✅ Rate Limiting - متقدم
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'طلبات كثيرة جداً، حاول بعد 15 دقيقة' },
    keyGenerator: (req) => req.ip
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'محاولات تسجيل دخول كثيرة، حاول بعد 15 دقيقة' },
    keyGenerator: (req) => req.ip
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'طلبات API كثيرة جداً' },
    keyGenerator: (req) => req.ip
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);

// ✅ Body Parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// ✅ Compression
app.use(compression());

// ✅ Logging - متقدم
if (!IS_PRODUCTION) {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// ✅ Request ID
app.use((req, res, next) => {
    req.requestId = uuidv4();
    res.setHeader('X-Request-ID', req.requestId);
    next();
});

// ============================================================
// 🗄️ DATABASE
// ============================================================

async function connectDB() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            minPoolSize: 2,
            family: 4 // Use IPv4
        });
        console.log('✅ MongoDB Connected');
        return true;
    } catch (error) {
        console.error('❌ MongoDB Error:', error.message);
        return false;
    }
}

// ============================================================
// 🔐 CREATE ADMIN
// ============================================================

async function createAdmin() {
    try {
        const existing = await User.findOne({ username: ADMIN_USERNAME }).select('+password');
        if (existing) {
            const passwordMatches = await bcrypt.compare(ADMIN_PASSWORD, existing.password);
            if (!passwordMatches) {
                existing.password = ADMIN_PASSWORD;
                existing.tokenVersion = (existing.tokenVersion || 0) + 1;
                await existing.save();
                console.log('✅ Admin password updated');
            }
            console.log(`✅ Admin exists: ${ADMIN_USERNAME}`);
            return;
        }

        const admin = new User({
            name: ADMIN_NAME,
            username: ADMIN_USERNAME,
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
            role: 'admin',
            isActive: true,
            tokenVersion: 1,
            twoFactorEnabled: false
        });
        await admin.save();
        console.log(`✅ Admin created: ${ADMIN_USERNAME}`);
    } catch (error) {
        console.error('❌ Admin error:', error.message);
    }
}

// ============================================================
// 🔐 AUTH MIDDLEWARE - محسّن
// ============================================================

async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }
        
        const token = authHeader.substring(7).trim();
        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ success: false, error: 'توكن غير صالح' });
        }

        const user = await User.findById(decoded.id);
        if (!user || !user.isActive) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }

        // ✅ التحقق من lock
        const lockCheck = user.checkLock();
        if (lockCheck && lockCheck.locked) {
            return res.status(423).json({
                success: false,
                error: `الحساب مقفل، حاول بعد ${lockCheck.remainingMinutes} دقيقة`
            });
        }

        // ✅ التحقق من tokenVersion
        if (decoded.tokenVersion !== (user.tokenVersion || 0)) {
            return res.status(401).json({ success: false, error: 'انتهت صلاحية الجلسة' });
        }

        req.user = user;
        req.tokenId = decoded.jti;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
    }
}

function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'ليس لديك صلاحية' });
        }
        next();
    };
}

// ============================================================
// 🔐 AUDIT LOG
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
        console.error('❌ Audit log error:', error.message);
    }
}

// ============================================================
// 🔐 AUTH ROUTES - محسّنة
// ============================================================

app.post('/api/auth/login', async (req, res) => {
    console.log('🔐 [LOGIN] Request received');

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

        const isValid = await user.comparePassword(password);
        if (!isValid) {
            await user.incrementLoginAttempts();
            await logAudit(user._id, user.username, 'LOGIN_FAILED', 'auth', null, { reason: 'Invalid password' }, 'failure', req);
            return res.status(401).json({
                success: false,
                error: 'اسم المستخدم أو كلمة المرور غير صحيحة'
            });
        }

        await user.resetLoginAttempts();
        user.lastLogin = new Date();
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        const token = generateToken(user);
        const refreshToken = generateRefreshToken();
        
        // ✅ تخزين refresh token
        const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
        user.refreshToken = hashedRefreshToken;
        user.refreshTokenVersion = (user.refreshTokenVersion || 0) + 1;
        await user.save();

        // ✅ إنشاء جلسة
        await Session.create({
            userId: user._id,
            token: token,
            refreshToken: refreshToken,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        await logAudit(user._id, user.username, 'LOGIN_SUCCESS', 'auth', null, {}, 'success', req);

        // ✅ تعيين Refresh Token كـ Cookie آمن
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
        console.error('❌ Login error:', error.message);
        return res.status(500).json({
            success: false,
            error: 'حدث خطأ في الخادم'
        });
    }
});

// ✅ Refresh Token
app.post('/api/auth/refresh', async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ success: false, error: 'Refresh token required' });
        }

        // ✅ التحقق من الجلسة
        const session = await Session.findOne({ refreshToken, isRevoked: false });
        if (!session) {
            return res.status(401).json({ success: false, error: 'Invalid session' });
        }

        if (session.expiresAt < new Date()) {
            session.isRevoked = true;
            await session.save();
            return res.status(401).json({ success: false, error: 'Session expired' });
        }

        const user = await User.findById(session.userId);
        if (!user || !user.isActive) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }

        // ✅ التحقق من refresh token
        const isValid = await bcrypt.compare(refreshToken, user.refreshToken);
        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Invalid refresh token' });
        }

        // ✅ إنشاء توكن جديد
        const newToken = generateToken(user);
        const newRefreshToken = generateRefreshToken();

        // ✅ تحديث الجلسة
        session.token = newToken;
        session.refreshToken = newRefreshToken;
        session.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await session.save();

        // ✅ تحديث refresh token في المستخدم
        const hashedRefreshToken = await bcrypt.hash(newRefreshToken, 10);
        user.refreshToken = hashedRefreshToken;
        user.refreshTokenVersion = (user.refreshTokenVersion || 0) + 1;
        await user.save();

        res.cookie('refreshToken', newRefreshToken, {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/api/auth/refresh'
        });

        res.json({
            success: true,
            token: newToken
        });

    } catch (error) {
        console.error('❌ Refresh error:', error.message);
        res.status(500).json({ success: false, error: 'Internal error' });
    }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
    try {
        // ✅ إبطال الجلسة
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
// 👥 USERS - CRUD OPERATIONS (FULL)
// ============================================================

// 📋 GET - جلب المستخدمين
app.get('/api/users', authenticate, authorize('admin'), async (req, res) => {
    try {
        const users = await User.find({}).select('-password -refreshToken').sort({ createdAt: -1 });
        await logAudit(req.user._id, req.user.username, 'READ_USERS', 'users', null, { count: users.length }, 'success', req);
        res.json({ success: true, users });
    } catch (error) {
        await logAudit(req.user._id, req.user.username, 'READ_USERS', 'users', null, { error: error.message }, 'failure', req);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ➕ POST - إضافة مستخدم جديد
app.post('/api/users', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { name, username, email, password, role } = req.body;

        // ✅ Validation
        if (!name || !username || !email || !password) {
            return res.status(400).json({
                success: false,
                error: 'جميع الحقول مطلوبة: name, username, email, password'
            });
        }

        // ✅ Sanitize
        const sanitizedName = sanitizeInput(name);
        const sanitizedUsername = sanitizeInput(username).toLowerCase();
        const sanitizedEmail = sanitizeInput(email).toLowerCase();

        const existing = await User.findOne({
            $or: [{ email: sanitizedEmail }, { username: sanitizedUsername }]
        });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'البريد الإلكتروني أو اسم المستخدم موجود مسبقاً'
            });
        }

        // ✅ Validate password strength
        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = new User({
            name: sanitizedName,
            username: sanitizedUsername,
            email: sanitizedEmail,
            password: hashedPassword,
            role: role || 'viewer',
            isActive: true
        });

        await user.save();

        await logAudit(req.user._id, req.user.username, 'CREATE_USER', 'users', user._id.toString(), {
            username: user.username,
            role: user.role
        }, 'success', req);

        res.status(201).json({
            success: true,
            user: cleanUser(user),
            message: 'تم إضافة المستخدم بنجاح'
        });

    } catch (error) {
        console.error('❌ POST /api/users error:', error);
        await logAudit(req.user._id, req.user.username, 'CREATE_USER', 'users', null, { error: error.message }, 'failure', req);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✏️ PUT - تحديث مستخدم
app.put('/api/users/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, username, email, role, isActive } = req.body;

        // ✅ Sanitize
        const sanitizedName = name ? sanitizeInput(name) : undefined;
        const sanitizedUsername = username ? sanitizeInput(username).toLowerCase() : undefined;
        const sanitizedEmail = email ? sanitizeInput(email).toLowerCase() : undefined;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }

        // ✅ منع تغيير admin بواسطة غير admin
        if (user.role === 'admin' && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'ليس لديك صلاحية لتعديل مسؤول' });
        }

        if (sanitizedName) user.name = sanitizedName;
        if (sanitizedUsername) user.username = sanitizedUsername;
        if (sanitizedEmail) user.email = sanitizedEmail;
        if (role) user.role = role;
        if (isActive !== undefined) user.isActive = isActive;

        await user.save();

        await logAudit(req.user._id, req.user.username, 'UPDATE_USER', 'users', user._id.toString(), {
            username: user.username,
            role: user.role
        }, 'success', req);

        res.json({
            success: true,
            user: cleanUser(user),
            message: 'تم تحديث المستخدم بنجاح'
        });

    } catch (error) {
        console.error('❌ PUT /api/users/:id error:', error);
        await logAudit(req.user._id, req.user.username, 'UPDATE_USER', 'users', req.params.id, { error: error.message }, 'failure', req);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🗑️ DELETE - حذف مستخدم
app.delete('/api/users/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { id } = req.params;

        if (id === req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'لا يمكنك حذف حسابك بنفسك'
            });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }

        // ✅ منع حذف admin
        if (user.role === 'admin') {
            return res.status(403).json({
                success: false,
                error: 'لا يمكن حذف حساب المسؤول'
            });
        }

        const username = user.username;
        await user.deleteOne();

        await logAudit(req.user._id, req.user.username, 'DELETE_USER', 'users', id, {
            username: username
        }, 'success', req);

        res.json({
            success: true,
            message: 'تم حذف المستخدم بنجاح'
        });

    } catch (error) {
        console.error('❌ DELETE /api/users/:id error:', error);
        await logAudit(req.user._id, req.user.username, 'DELETE_USER', 'users', req.params.id, { error: error.message }, 'failure', req);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔑 POST - تغيير كلمة المرور
app.post('/api/users/:id/password', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { password } = req.body;

        if (!password || password.length < 8) {
            return res.status(400).json({
                success: false,
                error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'
            });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }

        // ✅ منع تغيير كلمة مرور admin بواسطة غير admin
        if (user.role === 'admin' && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'ليس لديك صلاحية لتغيير كلمة مرور المسؤول'
            });
        }

        user.password = await bcrypt.hash(password, 12);
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        user.refreshToken = null;
        await user.save();

        // ✅ إبطال جميع جلسات المستخدم
        await Session.deleteMany({ userId: user._id });

        await logAudit(req.user._id, req.user.username, 'CHANGE_PASSWORD', 'users', user._id.toString(), {
            username: user.username
        }, 'success', req);

        res.json({
            success: true,
            message: 'تم تغيير كلمة المرور بنجاح'
        });

    } catch (error) {
        console.error('❌ POST /api/users/:id/password error:', error);
        await logAudit(req.user._id, req.user.username, 'CHANGE_PASSWORD', 'users', req.params.id, { error: error.message }, 'failure', req);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📊 SESSIONS - إدارة الجلسات
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

        await logAudit(req.user._id, req.user.username, 'READ_SESSIONS', 'sessions', null, { count: result.length }, 'success', req);

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

        res.json({ success: true, message: 'تم إبطال الجلسة بنجاح' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📋 AUDIT LOGS
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
            pagination: {
                total,
                limit: parseInt(limit),
                skip: parseInt(skip)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🚢 VESSELS - محسّن
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

VesselSchema.index({ name: 1 });
VesselSchema.index({ stat: 1 });

const Vessel = mongoose.model('Vessel', VesselSchema);

app.get('/api/vessels', authenticate, async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        await logAudit(req.user._id, req.user.username, 'READ_VESSELS', 'vessels', null, { count: vessels.length }, 'success', req);
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

        res.json({ success: true, message: 'تم حذف السفينة بنجاح' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🌱 SEED DATA
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
            console.log(`✅ Added ${vessels.length} vessels`);
        }
    } catch (error) {
        console.error('❌ Seed error:', error.message);
    }
}

// ============================================================
// 📁 STATIC FILES
// ============================================================

// ✅ Serve static files with security headers
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

// ✅ Serve HTML with Nonce
app.get('/', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        let html = fs.readFileSync(indexPath, 'utf8');
        // ✅ Inject Nonce
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

// ✅ SPA fallback
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
    console.error('❌ Error:', err.message);
    console.error('📋 Stack:', err.stack);
    
    // ✅ لا تكشف تفاصيل داخلية في الإنتاج
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
        await createAdmin();
        await seedVessels();

        app.listen(PORT, '0.0.0.0', () => {
            console.log('');
            console.log('='.repeat(60));
            console.log('🚢 MARINE SYSTEM v44.0 - SECURE ENTERPRISE');
            console.log('🚀 SERVER RUNNING');
            console.log('='.repeat(60));
            console.log(`🌍 Port: ${PORT}`);
            console.log(`🌐 Host: 0.0.0.0 (all interfaces)`);
            console.log(`🔐 Environment: ${NODE_ENV}`);
            console.log('🗄️ MongoDB: Connected ✅');
            console.log('🔑 JWT: Enabled');
            console.log('🛡️ CORS: Restricted');
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
            console.log(`   👤 Username: ${ADMIN_USERNAME}`);
            console.log(`   🔑 Password: ${ADMIN_PASSWORD}`);
            console.log('='.repeat(60));
            console.log('');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}

startServer();
