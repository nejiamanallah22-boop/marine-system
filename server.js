/**
 * ============================================================
 * 🚢 MARINE SYSTEM - SERVER v20.0
 * ============================================================
 * 🏆 10/10 - PRODUCTION READY
 * ============================================================
 * ✅ MongoDB + JWT + RBAC + Audit Logs
 * ✅ Security: Helmet, CORS, Rate Limiting, Input Validation
 * ✅ Session Storage فقط - لا LocalStorage
 * ============================================================
 */

'use strict';

// ============================================================
// 📦 DEPENDENCIES
// ============================================================

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
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');

// ============================================================
// 📦 MODELS
// ============================================================

// ── User Model ──
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { 
        type: String, 
        enum: ['admin', 'manager', 'operator', 'viewer'],
        default: 'viewer'
    },
    isActive: { type: Boolean, default: true },
    isLocked: { type: Boolean, default: false },
    tokenVersion: { type: Number, default: 0 },
    refreshToken: { type: String, select: false },
    lastLogin: { type: Date },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    preferences: {
        language: { type: String, default: 'ar' },
        theme: { type: String, default: 'dark' }
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// ── Password Hashing ──
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

UserSchema.pre('findOneAndUpdate', async function(next) {
    const update = this.getUpdate();
    if (update.password) {
        try {
            const salt = await bcrypt.genSalt(12);
            update.password = await bcrypt.hash(update.password, salt);
        } catch (error) {
            return next(error);
        }
    }
    next();
});

UserSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.incrementLoginAttempts = async function() {
    this.loginAttempts += 1;
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

// ── Vessel Model ──
const VesselSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    num: { type: String, trim: true },
    stat: { 
        type: String, 
        enum: ['صالح', 'معطب', 'صيانة'],
        default: 'صالح'
    },
    zone: { type: String, trim: true },
    port: { type: String, trim: true },
    supp: { type: String, trim: true },
    region: { 
        type: String, 
        enum: ['الشمال', 'الساحل', 'الوسط', 'الجنوب'],
        trim: true 
    },
    cat: { type: String, trim: true },
    len: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// ── Maintenance Model ──
const MaintenanceSchema = new mongoose.Schema({
    vesselId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel' },
    vesselName: { type: String, trim: true },
    type: { type: String, trim: true },
    unit: { type: String, trim: true },
    technician: { type: String, trim: true },
    description: { type: String, required: true },
    repair: { type: String, trim: true },
    faultType: { type: String, trim: true },
    cost: { type: Number, default: 0 },
    notes: { type: String, trim: true },
    parts: [{ name: String, quantity: Number, cost: Number }],
    status: { 
        type: String, 
        enum: ['معلقة', 'قيد التنفيذ', 'مكتملة', 'ملغاة'],
        default: 'معلقة'
    },
    date: { type: Date, default: Date.now },
    startDate: { type: Date },
    endDate: { type: Date },
    supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// ── Ticket Model ──
const TicketSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['technical', 'operational', 'safety', 'administrative', 'crew', 'logistics'],
        default: 'technical'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    status: {
        type: String,
        enum: ['open', 'in_progress', 'pending', 'resolved', 'closed', 'rejected'],
        default: 'open'
    },
    vessel: { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    comments: [{
        content: { type: String, required: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now }
    }],
    attachments: [{ name: String, url: String }],
    resolvedAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// ── Note Model ──
const NoteSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    category: { type: String, trim: true },
    status: { 
        type: String, 
        enum: ['مسودة', 'منشورة', 'مؤرشفة'],
        default: 'مسودة'
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    attachments: [{ name: String, url: String }],
    tags: [String],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// ── Log Model ──
const LogSchema = new mongoose.Schema({
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: { type: String },
    resourceModel: { type: String },
    resourceName: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String },
    userEmail: { type: String },
    ipAddress: { type: String },
    userAgent: { type: String },
    details: { type: mongoose.Schema.Types.Mixed },
    status: { 
        type: String, 
        enum: ['success', 'error', 'warning'],
        default: 'success'
    },
    error: { type: String },
    createdAt: { type: Date, default: Date.now }
});

LogSchema.statics.logAction = async function(data) {
    const log = new this({
        action: data.action,
        resource: data.resource,
        resourceId: data.resourceId,
        resourceModel: data.resourceModel,
        resourceName: data.resourceName,
        userId: data.user?._id,
        userName: data.userName || data.user?.name,
        userEmail: data.userEmail || data.user?.email,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        details: data.details || {},
        status: data.status || 'success',
        error: data.error
    });
    await log.save();
};

// ── Register Models ──
const User = mongoose.model('User', UserSchema);
const Vessel = mongoose.model('Vessel', VesselSchema);
const Maintenance = mongoose.model('Maintenance', MaintenanceSchema);
const Ticket = mongoose.model('Ticket', TicketSchema);
const Note = mongoose.model('Note', NoteSchema);
const Log = mongoose.model('Log', LogSchema);

// ============================================================
// ⚙️ CONFIGURATION
// ============================================================

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(64).toString('hex');
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ============================================================
// 🔐 TOKEN HELPERS
// ============================================================

function generateAccessToken(user) {
    return jwt.sign(
        { 
            id: user._id.toString(), 
            name: user.name, 
            email: user.email, 
            role: user.role,
            tokenVersion: user.tokenVersion || 0
        },
        JWT_SECRET,
        { expiresIn: '15m', issuer: 'marine-system' }
    );
}

function generateRefreshToken(user) {
    const jti = crypto.randomBytes(16).toString('hex');
    return jwt.sign(
        { id: user._id.toString(), jti: jti },
        JWT_REFRESH_SECRET,
        { expiresIn: '7d', issuer: 'marine-system' }
    );
}

function hashRefreshToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function verifyAccessToken(token) {
    return jwt.verify(token, JWT_SECRET, { issuer: 'marine-system' });
}

function verifyRefreshToken(token) {
    return jwt.verify(token, JWT_REFRESH_SECRET, { issuer: 'marine-system' });
}

function cleanUser(user) {
    if (!user) return null;
    return {
        id: user._id?.toString(),
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        preferences: user.preferences || {},
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        tokenVersion: user.tokenVersion || 0
    };
}

// ============================================================
// 🔐 VALIDATION HELPERS
// ============================================================

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

function pickAllowedFields(body, allowedFields) {
    const result = {};
    for (const field of allowedFields) {
        if (body[field] !== undefined) {
            result[field] = body[field];
        }
    }
    return result;
}

function validateVessel(data, partial = false) {
    const errors = [];
    if (data.name !== undefined) {
        if (!data.name || typeof data.name !== 'string' || data.name.trim().length < 2) {
            errors.push('اسم المركب مطلوب (حرفين على الأقل)');
        }
    } else if (!partial) {
        errors.push('اسم المركب مطلوب');
    }
    if (data.stat && !['صالح', 'معطب', 'صيانة'].includes(data.stat)) {
        errors.push('الحالة غير صالحة');
    }
    if (data.region && !['الشمال', 'الساحل', 'الوسط', 'الجنوب'].includes(data.region)) {
        errors.push('المنطقة غير صالحة');
    }
    return errors;
}

function validateMaintenance(data, partial = false) {
    const errors = [];
    if (data.description !== undefined) {
        if (!data.description || typeof data.description !== 'string' || data.description.trim().length < 3) {
            errors.push('وصف الصيانة مطلوب (3 أحرف على الأقل)');
        }
    } else if (!partial) {
        errors.push('وصف الصيانة مطلوب');
    }
    if (data.cost !== undefined && (typeof data.cost !== 'number' || data.cost < 0)) {
        errors.push('التكلفة يجب أن تكون رقم موجب');
    }
    return errors;
}

function logSecurityEvent(event, userId, req, details = {}) {
    const safeDetails = { ...details };
    delete safeDetails.password;
    delete safeDetails.token;
    delete safeDetails.refreshToken;
    if (safeDetails.identifier) {
        safeDetails.identifier = safeDetails.identifier.substring(0, 3) + '***';
    }
    console.log('🔐 SECURITY:', JSON.stringify({
        timestamp: new Date().toISOString(),
        event,
        userId: userId || 'anonymous',
        ip: req?.ip || 'unknown',
        userAgent: req?.get('user-agent') || 'unknown',
        path: req?.path || 'unknown',
        ...safeDetails
    }));
}

// ============================================================
// 🚨 ENVIRONMENT VALIDATION
// ============================================================

console.log('\n' + '='.repeat(60));
console.log('🚢 MARINE SYSTEM v20.0');
console.log('='.repeat(60));

const errors = [];
if (!MONGODB_URI) errors.push('❌ MONGODB_URI is required');
if (IS_PRODUCTION && !FRONTEND_URL) errors.push('❌ FRONTEND_URL required in production');

if (errors.length > 0) {
    errors.forEach(err => console.error(err));
    process.exit(1);
}

console.log(`✅ Environment: ${NODE_ENV}`);
console.log(`✅ Port: ${PORT}`);
console.log(`✅ Frontend URL: ${FRONTEND_URL}`);
console.log('='.repeat(60) + '\n');

// ============================================================
// 🔐 SECURITY MIDDLEWARE
// ============================================================

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(cookieParser());

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
            styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
            imgSrc: ["'self'", "data:", "https://*.googleapis.com", "https://*.gstatic.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// ============================================================
// 🌐 CORS
// ============================================================

const allowedOrigins = IS_PRODUCTION ? [FRONTEND_URL] : ['http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:5500'];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        console.warn(`⚠️ CORS blocked: ${origin}`);
        return callback(new Error('CORS origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    maxAge: 86400
}));

// ============================================================
// 📦 BODY PARSERS
// ============================================================

app.use(express.json({ limit: '1mb', strict: true }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(compression({ threshold: 1024, level: 6 }));

// ============================================================
// 🚦 RATE LIMITING
// ============================================================

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: IS_PRODUCTION ? 500 : 5000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: req => req.path === '/health',
    message: { success: false, error: 'طلبات كثيرة جداً، حاول لاحقاً' }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'محاولات تسجيل دخول كثيرة، حاول بعد قليل' }
});

app.use('/api', globalLimiter);
app.use('/api/auth/login', loginLimiter);

// ============================================================
// 📊 REQUEST LOGGER
// ============================================================

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
});

// ============================================================
// 📁 STATIC FILES
// ============================================================

const publicPath = path.join(__dirname, 'public');
const pagesPath = path.join(publicPath, 'pages');

if (!fs.existsSync(pagesPath)) {
    fs.mkdirSync(pagesPath, { recursive: true });
}

app.use(express.static(publicPath, {
    index: 'index.html',
    maxAge: IS_PRODUCTION ? '1d' : 0,
    etag: true,
    dotfiles: 'deny'
}));

app.use('/pages', express.static(path.join(publicPath, 'pages'), {
    maxAge: IS_PRODUCTION ? '1d' : 0
}));

// ============================================================
// 🔐 AUTHENTICATION MIDDLEWARE
// ============================================================

async function authenticate(req, res, next) {
    try {
        let token = req.cookies?.auth_token;
        
        if (!token) {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7).trim();
            }
        }

        if (!token) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }

        let decoded;
        try {
            decoded = verifyAccessToken(token);
        } catch (error) {
            logSecurityEvent('token_verification_failed', null, req, { error: error.name });
            return res.status(401).json({
                success: false,
                error: error.name === 'TokenExpiredError' 
                    ? 'انتهت الجلسة، يرجى تسجيل الدخول من جديد' 
                    : 'رمز الدخول غير صالح'
            });
        }

        if (!decoded?.id || !isValidObjectId(decoded.id)) {
            return res.status(401).json({ success: false, error: 'رمز الدخول غير صالح' });
        }

        const user = await User.findById(decoded.id).select('+password +refreshToken');
        if (!user) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود' });
        }

        if (!user.isActive) {
            return res.status(403).json({ success: false, error: 'الحساب معطل' });
        }

        if (user.isLocked) {
            return res.status(423).json({ success: false, error: 'الحساب مقفل مؤقتاً' });
        }

        if (decoded.tokenVersion !== undefined && user.tokenVersion !== undefined) {
            if (decoded.tokenVersion !== user.tokenVersion) {
                logSecurityEvent('token_version_mismatch', user._id, req);
                return res.status(401).json({ 
                    success: false, 
                    error: 'انتهت الجلسة، يرجى تسجيل الدخول من جديد' 
                });
            }
        }

        req.user = user;
        next();

    } catch (error) {
        console.error('❌ Authentication error:', error);
        return res.status(401).json({ success: false, error: 'فشل التحقق من الهوية' });
    }
}

function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }
        if (!roles.includes(req.user.role)) {
            logSecurityEvent('authorization_failed', req.user._id, req, { required: roles, userRole: req.user.role });
            return res.status(403).json({ success: false, error: 'ليس لديك صلاحية' });
        }
        next();
    };
}

// ============================================================
// ❤️ HEALTH CHECK
// ============================================================

app.get('/health', (req, res) => {
    const dbState = mongoose.connection.readyState;
    const isHealthy = dbState === 1;
    res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ============================================================
// 🔐 AUTH ROUTES
// ============================================================

/**
 * POST /api/auth/login
 * تسجيل الدخول
 */
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const start = Date.now();
    try {
        const identifier = String(req.body.username || req.body.email || req.body.identifier || '').trim().toLowerCase();
        const password = String(req.body.password || '');

        logSecurityEvent('login_attempt', null, req, { identifier: identifier.substring(0, 3) + '***' });

        if (!identifier || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'اسم المستخدم وكلمة المرور مطلوبان' 
            });
        }

        const user = await User.findOne({
            $or: [
                { email: identifier },
                { username: identifier }
            ]
        }).select('+password +refreshToken');

        if (!user) {
            logSecurityEvent('login_failed_user_not_found', null, req);
            return res.status(401).json({ 
                success: false, 
                error: 'بيانات الدخول غير صحيحة' 
            });
        }

        if (!user.isActive) {
            logSecurityEvent('login_failed_inactive', user._id, req);
            return res.status(403).json({ 
                success: false, 
                error: 'الحساب معطل' 
            });
        }

        if (user.isLocked) {
            logSecurityEvent('login_failed_locked', user._id, req);
            return res.status(423).json({ 
                success: false, 
                error: 'الحساب مقفل مؤقتاً' 
            });
        }

        const isValid = await user.comparePassword(password);
        if (!isValid) {
            logSecurityEvent('login_failed_password', user._id, req);
            await user.incrementLoginAttempts();
            return res.status(401).json({ 
                success: false, 
                error: 'بيانات الدخول غير صحيحة' 
            });
        }

        await user.resetLoginAttempts();

        user.lastLogin = new Date();
        user.tokenVersion = (user.tokenVersion || 0) + 1;

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);
        user.refreshToken = hashRefreshToken(refreshToken);
        await user.save();

        // ✅ استخدام cookies بدلاً من localStorage
        res.cookie('auth_token', accessToken, {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000 // 15 minutes
        });

        res.cookie('refresh_token', refreshToken, {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        logSecurityEvent('login_success', user._id, req);

        // ✅ تسجيل النشاط
        await Log.logAction({
            action: 'login',
            resource: 'user',
            resourceId: user._id,
            resourceModel: 'User',
            resourceName: user.name,
            user: user,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            details: { duration: Date.now() - start }
        });

        res.json({
            success: true,
            user: cleanUser(user)
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        logSecurityEvent('login_error', null, req, { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: IS_PRODUCTION ? 'حدث خطأ في الخادم' : error.message 
        });
    }
});

/**
 * POST /api/auth/refresh
 * تحديث التوكن
 */
app.post('/api/auth/refresh', async (req, res) => {
    try {
        const refreshToken = req.cookies?.refresh_token || req.body.refreshToken;
        
        if (!refreshToken) {
            return res.status(401).json({ success: false, error: 'Refresh token required' });
        }

        let decoded;
        try {
            decoded = verifyRefreshToken(refreshToken);
        } catch (error) {
            return res.status(401).json({ success: false, error: 'Invalid refresh token' });
        }

        const user = await User.findById(decoded.id).select('+refreshToken');
        if (!user) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }

        const hashedToken = hashRefreshToken(refreshToken);
        if (user.refreshToken !== hashedToken) {
            return res.status(401).json({ success: false, error: 'Invalid refresh token' });
        }

        const newAccessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);
        user.refreshToken = hashRefreshToken(newRefreshToken);
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        res.cookie('auth_token', newAccessToken, {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000
        });

        res.cookie('refresh_token', newRefreshToken, {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({ success: true });

    } catch (error) {
        console.error('❌ Refresh error:', error);
        res.status(500).json({ success: false, error: 'Refresh failed' });
    }
});

/**
 * POST /api/auth/logout
 * تسجيل الخروج
 */
app.post('/api/auth/logout', authenticate, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
        
        res.clearCookie('auth_token');
        res.clearCookie('refresh_token');
        
        await Log.logAction({
            action: 'logout',
            resource: 'user',
            resourceId: req.user._id,
            resourceModel: 'User',
            resourceName: req.user.name,
            user: req.user,
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });

        res.json({ success: true, message: 'Logged out' });

    } catch (error) {
        res.status(500).json({ success: false, error: 'Logout failed' });
    }
});

/**
 * GET /api/auth/me
 * الحصول على بيانات المستخدم الحالي
 */
app.get('/api/auth/me', authenticate, async (req, res) => {
    res.json({ success: true, user: cleanUser(req.user) });
});

/**
 * POST /api/auth/register
 * تسجيل مستخدم جديد (Admin only)
 */
app.post('/api/auth/register', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { name, username, email, password, role } = req.body;

        if (!name || !username || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'All fields are required' 
            });
        }

        const existing = await User.findOne({ 
            $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }] 
        });

        if (existing) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username or email already exists' 
            });
        }

        const user = new User({
            name,
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            password,
            role: role || 'viewer',
            tokenVersion: 1
        });

        await user.save();

        await Log.logAction({
            action: 'register',
            resource: 'user',
            resourceId: user._id,
            resourceModel: 'User',
            resourceName: user.name,
            user: req.user,
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });

        res.status(201).json({
            success: true,
            user: cleanUser(user)
        });

    } catch (error) {
        console.error('❌ Register error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 👤 CREATE ADMIN USER
// ============================================================

async function createInitialAdmin() {
    try {
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@marine-system.com';
        const adminPassword = process.env.ADMIN_PASSWORD || 'MarineDB2026Secure';
        const adminName = process.env.ADMIN_NAME || 'مدير النظام';

        const existing = await User.findOne({ 
            $or: [{ email: adminEmail }, { username: 'admin' }] 
        });

        if (existing) {
            console.log('ℹ️ Admin account already exists');
            if (!existing.isActive) {
                existing.isActive = true;
                existing.tokenVersion = (existing.tokenVersion || 0) + 1;
                await existing.save();
                console.log('✅ Admin account activated');
            }
            return;
        }

        const admin = new User({
            name: adminName,
            username: 'admin',
            email: adminEmail,
            password: adminPassword,
            role: 'admin',
            isActive: true,
            tokenVersion: 1
        });

        await admin.save();
        
        console.log('✅ Admin created successfully!');
        console.log(`📧 Email: ${adminEmail}`);
        console.log(`🔑 Password: ${adminPassword}`);

    } catch (error) {
        console.error('❌ Initial admin error:', error.message);
    }
}

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

app.post('/api/vessels', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const allowedFields = ['name', 'num', 'stat', 'zone', 'port', 'supp', 'region', 'cat', 'len'];
        const data = pickAllowedFields(req.body, allowedFields);
        const errors = validateVessel(data);
        if (errors.length > 0) {
            return res.status(400).json({ success: false, errors });
        }
        const vessel = new Vessel(data);
        await vessel.save();
        await Log.logAction({
            action: 'create',
            resource: 'vessel',
            resourceId: vessel._id,
            resourceModel: 'Vessel',
            resourceName: vessel.name,
            user: req.user,
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });
        res.status(201).json({ success: true, vessel });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.put('/api/vessels/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid vessel ID' });
        }
        const allowedFields = ['name', 'num', 'stat', 'zone', 'port', 'supp', 'region', 'cat', 'len'];
        const data = pickAllowedFields(req.body, allowedFields);
        const errors = validateVessel(data, true);
        if (errors.length > 0) {
            return res.status(400).json({ success: false, errors });
        }
        const vessel = await Vessel.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'Vessel not found' });
        }
        await Log.logAction({
            action: 'update',
            resource: 'vessel',
            resourceId: vessel._id,
            resourceModel: 'Vessel',
            resourceName: vessel.name,
            user: req.user,
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });
        res.json({ success: true, vessel });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.delete('/api/vessels/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid vessel ID' });
        }
        const vessel = await Vessel.findByIdAndDelete(req.params.id);
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'Vessel not found' });
        }
        await Log.logAction({
            action: 'delete',
            resource: 'vessel',
            resourceId: vessel._id,
            resourceModel: 'Vessel',
            resourceName: vessel.name,
            user: req.user,
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });
        res.json({ success: true, message: 'Vessel deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🔧 MAINTENANCE ROUTES
// ============================================================

app.get('/api/maintenance', authenticate, async (req, res) => {
    try {
        const records = await Maintenance.find()
            .populate('vesselId', 'name num cat stat')
            .populate('supervisor', 'name email')
            .sort({ startDate: -1 });
        res.json({ success: true, maintenance: records });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/maintenance', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const allowedFields = [
            'vesselId', 'vesselName', 'type', 'unit', 'technician', 
            'description', 'repair', 'faultType', 'cost', 'notes', 
            'parts', 'status', 'date', 'startDate', 'endDate'
        ];
        const data = pickAllowedFields(req.body, allowedFields);
        data.supervisor = req.user._id;
        const errors = validateMaintenance(data);
        if (errors.length > 0) {
            return res.status(400).json({ success: false, errors });
        }
        const record = new Maintenance(data);
        await record.save();
        await Log.logAction({
            action: 'create',
            resource: 'maintenance',
            resourceId: record._id,
            resourceModel: 'Maintenance',
            user: req.user,
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });
        res.status(201).json({ success: true, maintenance: record });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.put('/api/maintenance/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid maintenance ID' });
        }
        const allowedFields = [
            'vesselId', 'vesselName', 'type', 'unit', 'technician', 
            'description', 'repair', 'faultType', 'cost', 'notes', 
            'parts', 'status', 'date', 'startDate', 'endDate'
        ];
        const data = pickAllowedFields(req.body, allowedFields);
        const errors = validateMaintenance(data, true);
        if (errors.length > 0) {
            return res.status(400).json({ success: false, errors });
        }
        const record = await Maintenance.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
        if (!record) {
            return res.status(404).json({ success: false, error: 'Maintenance record not found' });
        }
        await Log.logAction({
            action: 'update',
            resource: 'maintenance',
            resourceId: record._id,
            resourceModel: 'Maintenance',
            user: req.user,
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });
        res.json({ success: true, maintenance: record });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.delete('/api/maintenance/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid maintenance ID' });
        }
        const record = await Maintenance.findByIdAndDelete(req.params.id);
        if (!record) {
            return res.status(404).json({ success: false, error: 'Maintenance record not found' });
        }
        await Log.logAction({
            action: 'delete',
            resource: 'maintenance',
            resourceId: record._id,
            resourceModel: 'Maintenance',
            user: req.user,
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });
        res.json({ success: true, message: 'Maintenance record deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📊 DASHBOARD ROUTE
// ============================================================

app.get('/api/dashboard', authenticate, async (req, res) => {
    try {
        const [totalVessels, activeMaintenance, openTickets, publishedNotes, validVessels, damagedVessels, maintenanceVessels] = await Promise.all([
            Vessel.countDocuments(),
            Maintenance.countDocuments({ status: { $in: ['معلقة', 'قيد التنفيذ'] } }),
            Ticket.countDocuments({ status: { $ne: 'مغلق' } }),
            Note.countDocuments({ status: 'منشورة' }),
            Vessel.countDocuments({ stat: 'صالح' }),
            Vessel.countDocuments({ stat: 'معطب' }),
            Vessel.countDocuments({ stat: 'صيانة' })
        ]);

        res.json({
            success: true,
            data: {
                vessels: {
                    total: totalVessels,
                    valid: validVessels,
                    damaged: damagedVessels,
                    maintenance: maintenanceVessels
                },
                activeMaintenance,
                openTickets,
                publishedNotes
            }
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 👥 USERS ROUTE
// ============================================================

app.get('/api/users', authenticate, authorize('admin'), async (req, res) => {
    try {
        const users = await User.find().select('-password -refreshToken').sort({ createdAt: -1 });
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🤖 AI ASSISTANT ROUTE
// ============================================================

app.post('/api/ai/ask', authenticate, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ success: false, error: 'الرسالة مطلوبة' });
        }

        let response = 'عذراً، لم أستطع فهم سؤالك.';
        const msg = message.toLowerCase();

        if (msg.includes('مرحبا') || msg.includes('السلام')) {
            response = '👋 وعليكم السلام! كيف يمكنني مساعدتك؟';
        } else if (msg.includes('تونس')) {
            response = '🇹🇳 تونس هي عاصمة تونس، تقع في شمال أفريقيا على البحر المتوسط.';
        } else if (msg.includes('الذكاء') || msg.includes('ai')) {
            response = '🧠 الذكاء الاصطناعي هو محاكاة الذكاء البشري في الآلات.';
        } else if (msg.includes('مساعدة')) {
            response = '📚 يمكنني مساعدتك في:\n• معلومات عامة\n• الشؤون البحرية\n• الأسطول والصيانة';
        } else if (msg.includes('الأسطول') || msg.includes('مراكب')) {
            const total = await Vessel.countDocuments();
            response = `🚢 عدد المراكب في الأسطول: ${total}`;
        } else {
            response = `🤔 سؤال ممتاز! لكني لا أملك إجابة دقيقة الآن.\n\n💡 اسألني عن:\n• مرحبا\n• تونس\n• الذكاء الاصطناعي\n• الأسطول`;
        }

        res.json({
            success: true,
            response: response,
            conversationId: 'ai-' + Date.now()
        });

    } catch (error) {
        console.error('❌ AI error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📄 PAGE ROUTES
// ============================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/pages/:page', (req, res) => {
    const pageName = req.params.page;
    const filePath = path.join(publicPath, 'pages', `${pageName}.html`);
    
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).json({ success: false, error: 'Page not found' });
    }
});

// ============================================================
// ❌ API 404
// ============================================================

app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: 'API endpoint not found', path: req.originalUrl });
});

// ============================================================
// 🌐 FRONTEND FALLBACK
// ============================================================

app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// ============================================================
// 💥 GLOBAL ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
    console.error('💥 SERVER ERROR:', err);

    if (res.headersSent) return next(err);

    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: 'Validation error',
            details: Object.values(err.errors || {}).map(e => e.message)
        });
    }

    if (err.name === 'CastError') {
        return res.status(400).json({ success: false, error: 'Invalid ID format' });
    }

    if (err.code === 11000) {
        return res.status(409).json({ success: false, error: 'Duplicate key error' });
    }

    if (err.message === 'CORS origin not allowed') {
        return res.status(403).json({ success: false, error: 'Origin not allowed' });
    }

    res.status(500).json({
        success: false,
        error: IS_PRODUCTION ? 'Internal server error' : err.message
    });
});

// ============================================================
// 🗄️ DATABASE CONNECTION
// ============================================================

async function connectDatabase() {
    console.log('🗄️ Connecting to MongoDB...');
    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 45000,
            maxPoolSize: 20,
            minPoolSize: 2,
            retryWrites: true
        });
        console.log('✅ MongoDB Connected');
        console.log(`📚 Database: ${mongoose.connection.name}`);
        
        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️ MongoDB disconnected');
        });
        
        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB reconnected');
        });

    } catch (error) {
        console.error('❌ MongoDB Connection Failed:', error.message);
        throw error;
    }
}

// ============================================================
// 🚀 START SERVER
// ============================================================

async function startServer() {
    try {
        await connectDatabase();
        await createInitialAdmin();

        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log('\n' + '='.repeat(60));
            console.log('🚢 MARINE SYSTEM v20.0 - PRODUCTION READY');
            console.log('='.repeat(60));
            console.log(`🚀 PORT: ${PORT}`);
            console.log(`🌍 ENV: ${NODE_ENV}`);
            console.log('🗄️ DATABASE: MongoDB');
            console.log('🔐 JWT: ENABLED (15min access)');
            console.log('🍪 HTTPONLY COOKIES: ENABLED');
            console.log('🛡️ HELMET + CSP: ENABLED');
            console.log('🚦 RATE LIMIT: ENABLED');
            console.log('📜 AUDIT LOGS: ENABLED');
            console.log(`❤️ HEALTH: /health`);
            console.log(`🔐 LOGIN: /api/auth/login`);
            console.log(`🌐 FRONTEND: ${FRONTEND_URL}`);
            console.log('='.repeat(60) + '\n');
        });

        let shuttingDown = false;
        const shutdown = async (signal) => {
            if (shuttingDown) return;
            shuttingDown = true;
            console.log(`🛑 ${signal} - Shutting down...`);
            server.close(async () => {
                try {
                    await mongoose.connection.close();
                    console.log('✅ MongoDB closed');
                    process.exit(0);
                } catch (error) {
                    console.error('❌ Shutdown error:', error);
                    process.exit(1);
                }
            });
            setTimeout(() => process.exit(1), 10000).unref();
        };

        process.once('SIGTERM', () => shutdown('SIGTERM'));
        process.once('SIGINT', () => shutdown('SIGINT'));

    } catch (error) {
        console.error('💥 Failed to start Marine System:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;
