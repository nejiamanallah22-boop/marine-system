/**
 * ============================================================
 * 🚢 MARINE SYSTEM - SERVER v26.1
 * ============================================================
 * 🔐 SECURE PRODUCTION EDITION
 * ✅ FIXED: CORS for mobile devices
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
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');

const app = express();

// ============================================================
// ⚙️ CONFIGURATION
// ============================================================

const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || '').trim().toLowerCase();
const ADMIN_NAME = String(process.env.ADMIN_NAME || '').trim();
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const FRONTEND_URL = String(process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');

// ============================================================
// 🔒 ENVIRONMENT VALIDATION
// ============================================================

function validateEnvironment() {
    const errors = [];
    if (!MONGODB_URI) errors.push('MONGODB_URI is missing');
    if (!JWT_SECRET || JWT_SECRET.length < 32) errors.push('JWT_SECRET must be at least 32 characters');
    if (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET.length < 32) errors.push('JWT_REFRESH_SECRET must be at least 32 characters');
    if (!ADMIN_USERNAME) errors.push('ADMIN_USERNAME is missing');
    if (!ADMIN_NAME) errors.push('ADMIN_NAME is missing');
    if (!ADMIN_EMAIL) errors.push('ADMIN_EMAIL is missing');
    if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) errors.push('ADMIN_PASSWORD must be at least 12 characters');

    if (errors.length > 0) {
        console.error('\n❌ ENVIRONMENT CONFIGURATION ERROR:\n');
        errors.forEach(err => console.error(`   - ${err}`));
        console.error('\n');
        process.exit(1);
    }
}

validateEnvironment();

// ============================================================
// 🚀 APPLICATION SETTINGS
// ============================================================

app.disable('x-powered-by');
if (IS_PRODUCTION) app.set('trust proxy', 1);

// ============================================================
// 🍪 COOKIE PARSER
// ============================================================

app.use(cookieParser());

// ============================================================
// 🌐 CORS - ✅ FIXED FOR MOBILE
// ============================================================

app.use(cors({
    origin(origin, callback) {
        // ✅ السماح بجميع الطلبات من الهاتف
        if (!origin) {
            return callback(null, true);
        }
        
        // ✅ السماح للنطاق المحدد
        if (FRONTEND_URL && origin === FRONTEND_URL) {
            return callback(null, true);
        }
        
        // ✅ السماح للتطبيق نفسه (نفس المنفذ)
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            return callback(null, true);
        }
        
        // ✅ السماح لـ Render
        if (origin.includes('onrender.com')) {
            return callback(null, true);
        }
        
        // ❌ باقي الطلبات مرفوضة
        return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400
}));

// ============================================================
// 🛡️ SECURITY HEADERS
// ============================================================

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false
}));

// ============================================================
// 📦 BODY PARSERS
// ============================================================

app.use(express.json({ limit: '2mb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

// ============================================================
// ⚡ COMPRESSION
// ============================================================

app.use(compression({ threshold: 1024, level: 6 }));

// ============================================================
// 🚦 RATE LIMITING
// ============================================================

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: IS_PRODUCTION ? 1000 : 5000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: req => req.path === '/health',
    message: { success: false, error: 'طلبات كثيرة جداً، حاول لاحقاً' }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { success: false, error: 'محاولات تسجيل دخول كثيرة، حاول بعد قليل' }
});

app.use('/api', globalLimiter);
app.use('/api/auth/login', loginLimiter);

// ============================================================
// 📡 REQUEST LOGGER
// ============================================================

app.use((req, res, next) => {
    const start = Date.now();
    const requestId = crypto.randomBytes(8).toString('hex');
    req.requestId = requestId;
    console.log(`[${requestId}] → ${req.method} ${req.originalUrl}`);
    res.on('finish', () => {
        console.log(`[${requestId}] ← ${res.statusCode} ${Date.now() - start}ms`);
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
    console.log('📁 Created pages directory');
}

// ============================================================
// 🌐 STATIC SERVER
// ============================================================

app.use(express.static(publicPath, {
    index: 'index.html',
    maxAge: IS_PRODUCTION ? '1d' : 0,
    etag: true,
    dotfiles: 'deny',
    setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }
    }
}));

app.use('/pages', express.static(pagesPath, {
    maxAge: IS_PRODUCTION ? '1d' : 0,
    dotfiles: 'deny'
}));

// ============================================================
// 🗄️ MODELS
// ============================================================

// 👤 USER MODEL
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 100 },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true, minlength: 3, maxlength: 50 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 150 },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'manager', 'operator', 'viewer'], default: 'viewer' },
    isActive: { type: Boolean, default: true },
    isLocked: { type: Boolean, default: false },
    tokenVersion: { type: Number, default: 0 },
    lastLogin: { type: Date },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    preferences: {
        language: { type: String, default: 'ar' },
        theme: { type: String, default: 'dark' }
    }
}, { timestamps: true });

// 🔐 HASH PASSWORD
UserSchema.pre('save', async function(next) {
    try {
        if (!this.isModified('password')) return next();
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// 🔑 COMPARE PASSWORD
UserSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// 🚫 LOGIN ATTEMPTS
UserSchema.methods.incrementLoginAttempts = async function() {
    this.loginAttempts = (this.loginAttempts || 0) + 1;
    if (this.loginAttempts >= 5) {
        this.isLocked = true;
        this.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
    await this.save();
};

// 🔓 RESET LOGIN ATTEMPTS
UserSchema.methods.resetLoginAttempts = async function() {
    this.loginAttempts = 0;
    this.isLocked = false;
    this.lockUntil = null;
    await this.save();
};

// 🚢 VESSEL MODEL
const VesselSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 150 },
    num: { type: String, trim: true, maxlength: 100 },
    stat: { type: String, enum: ['صالح', 'معطب', 'صيانة'], default: 'صالح' },
    zone: { type: String, trim: true, maxlength: 100 },
    port: { type: String, trim: true, maxlength: 100 },
    supp: { type: String, trim: true, maxlength: 100 },
    region: { type: String, enum: ['الشمال', 'الساحل', 'الوسط', 'الجنوب'] },
    cat: { type: String, trim: true, maxlength: 100 },
    len: { type: String, trim: true, maxlength: 50 }
}, { timestamps: true });

VesselSchema.index({ createdAt: -1 });
VesselSchema.index({ stat: 1 });
VesselSchema.index({ region: 1 });

// 🔧 MAINTENANCE MODEL
const MaintenanceSchema = new mongoose.Schema({
    vesselId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel', index: true },
    vesselName: { type: String, trim: true, maxlength: 150 },
    type: { type: String, trim: true, maxlength: 100 },
    unit: { type: String, trim: true, maxlength: 150 },
    technician: { type: String, trim: true, maxlength: 150 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    repair: { type: String, trim: true, maxlength: 5000 },
    faultType: { type: String, trim: true, maxlength: 200 },
    cost: { type: Number, default: 0, min: 0 },
    notes: { type: String, trim: true, maxlength: 5000 },
    parts: [{ name: { type: String, trim: true }, quantity: { type: Number, min: 0 }, cost: { type: Number, min: 0 } }],
    status: { type: String, enum: ['معلقة', 'قيد التنفيذ', 'مكتملة', 'ملغاة'], default: 'معلقة' },
    date: { type: Date, default: Date.now },
    startDate: { type: Date },
    endDate: { type: Date },
    supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

MaintenanceSchema.index({ status: 1 });
MaintenanceSchema.index({ startDate: -1 });

// 🎫 TICKET MODEL
const TicketSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 250 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    type: { type: String, enum: ['technical', 'operational', 'safety', 'administrative', 'crew', 'logistics'], default: 'technical' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    status: { type: String, enum: ['open', 'in_progress', 'pending', 'resolved', 'closed', 'rejected'], default: 'open' },
    vessel: { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    comments: [{
        content: { type: String, required: true, trim: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now }
    }],
    resolvedAt: { type: Date }
}, { timestamps: true });

// 📝 NOTE MODEL
const NoteSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 250 },
    content: { type: String, required: true, trim: true, maxlength: 10000 },
    category: { type: String, trim: true, maxlength: 100 },
    status: { type: String, enum: ['مسودة', 'منشورة', 'مؤرشفة'], default: 'مسودة' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tags: [{ type: String, trim: true, maxlength: 50 }]
}, { timestamps: true });

// 📜 LOG MODEL
const LogSchema = new mongoose.Schema({
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String },
    ipAddress: { type: String },
    userAgent: { type: String },
    details: { type: mongoose.Schema.Types.Mixed },
    status: { type: String, enum: ['success', 'error', 'warning'], default: 'success' },
    error: { type: String }
}, { timestamps: true });

// 🏗️ REGISTER MODELS
const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Vessel = mongoose.models.Vessel || mongoose.model('Vessel', VesselSchema);
const Maintenance = mongoose.models.Maintenance || mongoose.model('Maintenance', MaintenanceSchema);
const Ticket = mongoose.models.Ticket || mongoose.model('Ticket', TicketSchema);
const Note = mongoose.models.Note || mongoose.model('Note', NoteSchema);
const Log = mongoose.models.Log || mongoose.model('Log', LogSchema);

// ============================================================
// 🧰 HELPERS
// ============================================================

function isValidObjectId(id) {
    if (!id) return false;
    return mongoose.Types.ObjectId.isValid(id);
}

function getClientIp(req) {
    return String(req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').substring(0, 100);
}

function getAllowedFields(source, fields) {
    const result = {};
    for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(source, field)) {
            result[field] = source[field];
        }
    }
    return result;
}

async function writeLog({ action, resource, resourceId = null, req = null, user = null, details = null, status = 'success', error = null }) {
    try {
        await Log.create({
            action,
            resource,
            resourceId: resourceId ? String(resourceId) : null,
            userId: user?._id || null,
            userName: user?.name || null,
            ipAddress: req ? getClientIp(req) : null,
            userAgent: req ? String(req.headers['user-agent'] || '').substring(0, 500) : null,
            details,
            status,
            error
        });
    } catch (logError) {
        console.error('Audit log error:', logError.message);
    }
}

// ============================================================
// 🔐 TOKEN HELPERS
// ============================================================

function generateAccessToken(user) {
    return jwt.sign(
        { id: user._id.toString(), role: user.role, tokenVersion: user.tokenVersion || 0 },
        JWT_SECRET,
        { expiresIn: '15m', issuer: 'marine-system', audience: 'marine-system-users' }
    );
}

function generateRefreshToken(user) {
    const jti = crypto.randomBytes(32).toString('hex');
    return jwt.sign(
        { id: user._id.toString(), jti, tokenVersion: user.tokenVersion || 0 },
        JWT_REFRESH_SECRET,
        { expiresIn: '7d', issuer: 'marine-system', audience: 'marine-system-users' }
    );
}

function verifyAccessToken(token) {
    return jwt.verify(token, JWT_SECRET, { issuer: 'marine-system', audience: 'marine-system-users' });
}

function verifyRefreshToken(token) {
    return jwt.verify(token, JWT_REFRESH_SECRET, { issuer: 'marine-system', audience: 'marine-system-users' });
}

function cleanUser(user) {
    if (!user) return null;
    return {
        id: user._id?.toString() || user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        preferences: user.preferences || {},
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
    };
}

// ============================================================
// 🔐 AUTHENTICATION
// ============================================================

async function authenticate(req, res, next) {
    try {
        let token = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7).trim();
        }
        if (!token) {
            token = req.cookies?.auth_token || null;
        }
        if (!token) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }

        let decoded;
        try {
            decoded = verifyAccessToken(token);
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: error.name === 'TokenExpiredError' ? 'انتهت الجلسة، يرجى تسجيل الدخول من جديد' : 'رمز الدخول غير صالح'
            });
        }

        if (!decoded?.id) {
            return res.status(401).json({ success: false, error: 'رمز الدخول غير صالح' });
        }

        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود' });
        }
        if (!user.isActive) {
            return res.status(403).json({ success: false, error: 'الحساب معطل' });
        }
        if (decoded.tokenVersion !== (user.tokenVersion || 0)) {
            return res.status(401).json({ success: false, error: 'الجلسة لم تعد صالحة' });
        }

        req.user = user;
        req.token = token;
        next();

    } catch (error) {
        console.error('Authentication error:', error.message);
        return res.status(401).json({ success: false, error: 'فشل التحقق من الهوية' });
    }
}

function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }
        if (!roles.includes(req.user.role)) {
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
        uptime: process.uptime(),
        mongodb: isHealthy ? 'connected' : 'disconnected'
    });
});

// ============================================================
// 🧪 API TEST
// ============================================================

app.get('/api/test', (req, res) => {
    res.json({ success: true, message: 'MARINE SYSTEM API WORKING', timestamp: new Date().toISOString() });
});

// ============================================================
// 🔐 LOGIN
// ============================================================

app.post('/api/auth/login', async (req, res) => {
    try {
        const username = String(req.body?.username || '').trim().toLowerCase();
        const password = String(req.body?.password || '');

        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'اسم المستخدم وكلمة المرور مطلوبان' });
        }

        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ success: false, error: 'قاعدة البيانات غير متصلة' });
        }

        const user = await User.findOne({ username }).select('+password');
        if (!user) {
            await writeLog({ action: 'LOGIN_FAILED', resource: 'AUTH', req, details: { username }, status: 'warning' });
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        if (!user.isActive) {
            return res.status(403).json({ success: false, error: 'الحساب معطل' });
        }

        if (user.isLocked && user.lockUntil && user.lockUntil <= new Date()) {
            user.isLocked = false;
            user.lockUntil = null;
            user.loginAttempts = 0;
            await user.save();
        }

        if (user.isLocked && user.lockUntil && user.lockUntil > new Date()) {
            return res.status(423).json({ success: false, error: 'الحساب مقفل مؤقتاً، حاول لاحقاً' });
        }

        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
            await user.incrementLoginAttempts();
            await writeLog({ action: 'LOGIN_FAILED', resource: 'AUTH', req, user, status: 'warning' });
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        await user.resetLoginAttempts();
        user.lastLogin = new Date();
        await user.save();

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        const cookieOptions = { httpOnly: true, secure: IS_PRODUCTION, sameSite: 'lax' };
        res.cookie('auth_token', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
        res.cookie('refresh_token', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

        res.setHeader('Cache-Control', 'no-store');

        await writeLog({ action: 'LOGIN_SUCCESS', resource: 'AUTH', req, user });

        return res.status(200).json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            user: cleanUser(user),
            token: accessToken
        });

    } catch (error) {
        console.error('Login error:', error.message);
        return res.status(500).json({ success: false, error: 'حدث خطأ أثناء تسجيل الدخول' });
    }
});

// ============================================================
// 🔄 REFRESH TOKEN
// ============================================================

app.post('/api/auth/refresh', async (req, res) => {
    try {
        const refreshToken = req.cookies?.refresh_token;
        if (!refreshToken) {
            return res.status(401).json({ success: false, error: 'لا يوجد Refresh Token' });
        }

        let decoded;
        try {
            decoded = verifyRefreshToken(refreshToken);
        } catch (error) {
            return res.status(401).json({ success: false, error: 'انتهت الجلسة، يرجى تسجيل الدخول' });
        }

        const user = await User.findById(decoded.id);
        if (!user || !user.isActive) {
            return res.status(401).json({ success: false, error: 'الجلسة غير صالحة' });
        }

        if (decoded.tokenVersion !== (user.tokenVersion || 0)) {
            return res.status(401).json({ success: false, error: 'الجلسة لم تعد صالحة' });
        }

        const newAccessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);

        const cookieOptions = { httpOnly: true, secure: IS_PRODUCTION, sameSite: 'lax' };
        res.cookie('auth_token', newAccessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
        res.cookie('refresh_token', newRefreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

        return res.json({ success: true, token: newAccessToken });

    } catch (error) {
        return res.status(500).json({ success: false, error: 'فشل تجديد الجلسة' });
    }
});

// ============================================================
// 🚪 LOGOUT
// ============================================================

app.post('/api/auth/logout', authenticate, async (req, res) => {
    try {
        res.clearCookie('auth_token');
        res.clearCookie('refresh_token');
        await writeLog({ action: 'LOGOUT', resource: 'AUTH', req, user: req.user });
        return res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'فشل تسجيل الخروج' });
    }
});

// ============================================================
// 👤 CURRENT USER
// ============================================================

app.get('/api/auth/me', authenticate, (req, res) => {
    return res.json({ success: true, user: cleanUser(req.user) });
});

// ============================================================
// 🔐 CREATE INITIAL ADMIN
// ============================================================

async function createInitialAdmin() {
    try {
        const existing = await User.findOne({ $or: [{ username: ADMIN_USERNAME }, { email: ADMIN_EMAIL }] });
        if (existing) {
            console.log('ℹ️ Admin account already exists');
            return;
        }

        const admin = new User({
            name: ADMIN_NAME,
            username: ADMIN_USERNAME,
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
            role: 'admin',
            isActive: true,
            tokenVersion: 0
        });

        await admin.save();
        console.log('✅ Admin account created successfully');
        console.log(`👤 Username: ${ADMIN_USERNAME}`);

    } catch (error) {
        console.error('Initial admin error:', error.message);
    }
}

// ============================================================
// 📊 DASHBOARD
// ============================================================

app.get('/api/dashboard', authenticate, async (req, res) => {
    try {
        const [totalVessels, activeMaintenance, validVessels, damagedVessels, maintenanceVessels, openTickets, publishedNotes] = await Promise.all([
            Vessel.countDocuments(),
            Maintenance.countDocuments({ status: { $in: ['معلقة', 'قيد التنفيذ'] } }),
            Vessel.countDocuments({ stat: 'صالح' }),
            Vessel.countDocuments({ stat: 'معطب' }),
            Vessel.countDocuments({ stat: 'صيانة' }),
            Ticket.countDocuments({ status: { $in: ['open', 'in_progress', 'pending'] } }),
            Note.countDocuments({ status: 'منشورة' })
        ]);

        return res.json({
            success: true,
            data: {
                vessels: { total: totalVessels, valid: validVessels, damaged: damagedVessels, maintenance: maintenanceVessels },
                activeMaintenance,
                openTickets,
                publishedNotes
            }
        });

    } catch (error) {
        console.error('Dashboard error:', error.message);
        return res.status(500).json({ success: false, error: 'فشل تحميل لوحة التحكم' });
    }
});

// ============================================================
// 🚢 VESSELS CRUD
// ============================================================

app.get('/api/vessels', authenticate, async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 100));
        const skip = (page - 1) * limit;
        const filter = {};
        if (req.query.stat) filter.stat = req.query.stat;
        if (req.query.region) filter.region = req.query.region;

        const [vessels, total] = await Promise.all([
            Vessel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            Vessel.countDocuments(filter)
        ]);

        return res.json({ success: true, vessels, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });

    } catch (error) {
        return res.status(500).json({ success: false, error: 'فشل تحميل المراكب' });
    }
});

app.post('/api/vessels', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const data = getAllowedFields(req.body, ['name', 'num', 'stat', 'zone', 'port', 'supp', 'region', 'cat', 'len']);
        const vessel = await Vessel.create(data);
        await writeLog({ action: 'CREATE', resource: 'VESSEL', resourceId: vessel._id, req, user: req.user, details: { name: vessel.name } });
        return res.status(201).json({ success: true, vessel });

    } catch (error) {
        return res.status(400).json({ success: false, error: 'فشل إنشاء المركب' });
    }
});

app.put('/api/vessels/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ success: false, error: 'معرف المركب غير صالح' });
        }
        const data = getAllowedFields(req.body, ['name', 'num', 'stat', 'zone', 'port', 'supp', 'region', 'cat', 'len']);
        const vessel = await Vessel.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'المركب غير موجود' });
        }
        await writeLog({ action: 'UPDATE', resource: 'VESSEL', resourceId: vessel._id, req, user: req.user });
        return res.json({ success: true, vessel });

    } catch (error) {
        return res.status(400).json({ success: false, error: 'فشل تحديث المركب' });
    }
});

app.delete('/api/vessels/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ success: false, error: 'معرف المركب غير صالح' });
        }
        const vessel = await Vessel.findByIdAndDelete(id);
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'المركب غير موجود' });
        }
        await writeLog({ action: 'DELETE', resource: 'VESSEL', resourceId: id, req, user: req.user, details: { name: vessel.name } });
        return res.json({ success: true, message: 'تم حذف المركب بنجاح' });

    } catch (error) {
        return res.status(500).json({ success: false, error: 'فشل حذف المركب' });
    }
});

// ============================================================
// 🔧 MAINTENANCE CRUD
// ============================================================

app.get('/api/maintenance', authenticate, async (req, res) => {
    try {
        const records = await Maintenance.find().populate('vesselId', 'name num').populate('supervisor', 'name email').sort({ createdAt: -1 }).lean();
        return res.json({ success: true, maintenance: records });

    } catch (error) {
        return res.status(500).json({ success: false, error: 'فشل تحميل سجلات الصيانة' });
    }
});

app.post('/api/maintenance', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const data = getAllowedFields(req.body, ['vesselId', 'vesselName', 'type', 'unit', 'technician', 'description', 'repair', 'faultType', 'cost', 'notes', 'parts', 'status', 'date', 'startDate', 'endDate']);
        data.supervisor = req.user._id;
        const record = await Maintenance.create(data);
        await writeLog({ action: 'CREATE', resource: 'MAINTENANCE', resourceId: record._id, req, user: req.user });
        return res.status(201).json({ success: true, maintenance: record });

    } catch (error) {
        return res.status(400).json({ success: false, error: 'فشل إنشاء سجل الصيانة' });
    }
});

app.put('/api/maintenance/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ success: false, error: 'معرف سجل الصيانة غير صالح' });
        }
        const data = getAllowedFields(req.body, ['vesselId', 'vesselName', 'type', 'unit', 'technician', 'description', 'repair', 'faultType', 'cost', 'notes', 'parts', 'status', 'date', 'startDate', 'endDate']);
        const record = await Maintenance.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
        if (!record) {
            return res.status(404).json({ success: false, error: 'سجل الصيانة غير موجود' });
        }
        await writeLog({ action: 'UPDATE', resource: 'MAINTENANCE', resourceId: record._id, req, user: req.user });
        return res.json({ success: true, maintenance: record });

    } catch (error) {
        return res.status(400).json({ success: false, error: 'فشل تحديث سجل الصيانة' });
    }
});

app.delete('/api/maintenance/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ success: false, error: 'معرف سجل الصيانة غير صالح' });
        }
        const record = await Maintenance.findByIdAndDelete(id);
        if (!record) {
            return res.status(404).json({ success: false, error: 'سجل الصيانة غير موجود' });
        }
        await writeLog({ action: 'DELETE', resource: 'MAINTENANCE', resourceId: id, req, user: req.user });
        return res.json({ success: true, message: 'تم حذف سجل الصيانة' });

    } catch (error) {
        return res.status(500).json({ success: false, error: 'فشل حذف سجل الصيانة' });
    }
});

// ============================================================
// 👥 USERS
// ============================================================

app.get('/api/users', authenticate, authorize('admin'), async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 }).lean();
        return res.json({ success: true, users });

    } catch (error) {
        return res.status(500).json({ success: false, error: 'فشل تحميل المستخدمين' });
    }
});

// ============================================================
// 🏠 HOME
// ============================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// ============================================================
// ❌ API 404
// ============================================================

app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: 'API endpoint not found', path: req.originalUrl });
});

// ============================================================
// 🌐 SPA FALLBACK
// ============================================================

app.get('*', (req, res, next) => {
    if (path.extname(req.path)) {
        return res.status(404).send('File not found');
    }
    res.sendFile(path.join(publicPath, 'index.html'), error => {
        if (error) next(error);
    });
});

// ============================================================
// 💥 GLOBAL ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
    console.error('SERVER ERROR:', err.message);

    if (res.headersSent) return next(err);

    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: 'بيانات غير صحيحة',
            details: Object.values(err.errors || {}).map(item => item.message)
        });
    }

    if (err.name === 'CastError') {
        return res.status(400).json({ success: false, error: 'صيغة المعرف غير صحيحة' });
    }

    if (err.code === 11000) {
        return res.status(409).json({ success: false, error: 'هذه البيانات موجودة مسبقاً' });
    }

    if (err.message === 'Origin not allowed by CORS') {
        return res.status(403).json({ success: false, error: 'المصدر غير مسموح به' });
    }

    return res.status(500).json({
        success: false,
        error: IS_PRODUCTION ? 'حدث خطأ داخلي في الخادم' : err.message
    });
});

// ============================================================
// 🗄️ DATABASE CONNECTION
// ============================================================

async function connectDatabase() {
    console.log('🗄️ Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 45000,
        maxPoolSize: 20,
        minPoolSize: 2,
        retryWrites: true
    });
    console.log('✅ MongoDB Connected');
    console.log(`📚 Database: ${mongoose.connection.name}`);
}

mongoose.connection.on('disconnected', () => console.warn('⚠️ MongoDB disconnected'));
mongoose.connection.on('reconnected', () => console.log('✅ MongoDB reconnected'));
mongoose.connection.on('error', error => console.error('❌ MongoDB error:', error.message));

// ============================================================
// 🚀 START SERVER
// ============================================================

async function startServer() {
    try {
        await connectDatabase();
        await createInitialAdmin();

        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log('');
            console.log('='.repeat(60));
            console.log('🚢 MARINE SYSTEM v26.1');
            console.log('🚀 SERVER STARTED');
            console.log('='.repeat(60));
            console.log(`🌍 Environment: ${NODE_ENV}`);
            console.log(`🚀 Port: ${PORT}`);
            console.log('🗄️ MongoDB: Connected');
            console.log('🔐 JWT: Enabled');
            console.log('🛡️ Security: Enabled');
            console.log('📱 Mobile Access: Enabled ✅');
            console.log('❤️ Health: /health');
            console.log('='.repeat(60));
            console.log(`👤 Admin Username: ${ADMIN_USERNAME}`);
            console.log('🔒 Admin password is stored securely in Environment Variables');
            console.log('='.repeat(60));
            console.log('');
        });

        let shuttingDown = false;

        async function shutdown(signal) {
            if (shuttingDown) return;
            shuttingDown = true;
            console.log(`🛑 ${signal} received. Shutting down...`);

            const forceExit = setTimeout(() => {
                console.error('⚠️ Forced shutdown');
                process.exit(1);
            }, 10000);
            forceExit.unref();

            server.close(async error => {
                try {
                    if (error) throw error;
                    await mongoose.connection.close();
                    console.log('✅ MongoDB closed');
                    process.exit(0);
                } catch (shutdownError) {
                    console.error('❌ Shutdown error:', shutdownError.message);
                    process.exit(1);
                }
            });
        }

        process.once('SIGTERM', () => shutdown('SIGTERM'));
        process.once('SIGINT', () => shutdown('SIGINT'));

    } catch (error) {
        console.error('💥 Failed to start server:', error.message);
        process.exit(1);
    }
}

startServer();

module.exports = app;
