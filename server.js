/**
 * ============================================================
 * 🚢 MARINE SYSTEM - SERVER v20.0 (FIXED)
 * ============================================================
 * ✅ إصلاح CORS
 * ✅ إصلاح Duplicate Indexes
 * ✅ دعم ALLOWED_ORIGINS=*
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

const app = express();

// ============================================================
// ⚙️ CONFIGURATION
// ============================================================
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// ✅ JWT - من متغيرات البيئة أو توليد تلقائي
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || crypto.randomBytes(64).toString('hex');

// ✅ بيانات Admin - فقط من متغيرات البيئة
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || null;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || null;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || null;
const ADMIN_NAME = process.env.ADMIN_NAME || null;

// ✅ CORS - دعم * و URLs محددة
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:3000', 'http://localhost:5000'];

// ✅ إضافة Render URL تلقائياً
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || process.env.RENDER_URL || null;
if (RENDER_URL && !ALLOWED_ORIGINS.includes(RENDER_URL)) {
    ALLOWED_ORIGINS.push(RENDER_URL);
}

// ✅ التحقق من MongoDB
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is required');
    process.exit(1);
}

console.log('\n' + '='.repeat(60));
console.log('🚢 MARINE SYSTEM v20.0');
console.log('='.repeat(60));
console.log(`✅ Port: ${PORT}`);
console.log(`✅ Environment: ${NODE_ENV}`);
console.log(`✅ Admin configured: ${ADMIN_USERNAME ? 'Yes' : 'No'}`);
console.log(`✅ Allowed Origins: ${ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS.join(', ') : 'None'}`);
console.log('='.repeat(60) + '\n');

// ============================================================
// 🗄️ MONGODB
// ============================================================
mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    minPoolSize: 2,
    family: 4
}).then(() => {
    console.log('✅ MongoDB Connected');
}).catch(err => {
    console.error('❌ MongoDB Error:', err.message);
    process.exit(1);
});

// ============================================================
// 📦 MODELS - بدون Duplicate Indexes
// ============================================================

// ✅ User Model - بدون index: true مكرر
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, trim: true, lowercase: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'manager', 'operator', 'viewer'], default: 'viewer' },
    isActive: { type: Boolean, default: true },
    isLocked: { type: Boolean, default: false },
    tokenVersion: { type: Number, default: 0 },
    lastLogin: { type: Date },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    refreshToken: { type: String, select: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// ✅ Indexes - تعريف واحد فقط
UserSchema.index({ username: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { unique: true });

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

// ✅ Session Model - بدون index: true مكرر
const SessionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    token: { type: String, required: true },
    refreshToken: { type: String, required: true },
    ip: { type: String },
    userAgent: { type: String },
    expiresAt: { type: Date, required: true },
    isRevoked: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

SessionSchema.index({ token: 1 }, { unique: true });
SessionSchema.index({ refreshToken: 1 }, { unique: true });
SessionSchema.index({ userId: 1 });
SessionSchema.index({ expiresAt: 1 });

// ✅ Vessel Model
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

// ✅ Audit Log Model
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

const User = mongoose.model('User', UserSchema);
const Session = mongoose.model('Session', SessionSchema);
const Vessel = mongoose.model('Vessel', VesselSchema);
const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

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
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
    };
}

function generateToken(user) {
    return jwt.sign(
        { id: user._id.toString(), role: user.role, tokenVersion: user.tokenVersion || 0 },
        JWT_SECRET,
        { expiresIn: '7d', issuer: 'marine-system' }
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

function sanitizeInput(input) {
    if (!input) return '';
    if (typeof input !== 'string') return input;
    return input.replace(/[<>]/g, '').trim();
}

// ============================================================
// 🔐 CREATE ADMIN
// ============================================================
async function createAdminIfConfigured() {
    if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !ADMIN_EMAIL || !ADMIN_NAME) {
        console.log('ℹ️ No admin credentials configured.');
        return;
    }

    try {
        const existing = await User.findOne({ username: ADMIN_USERNAME.toLowerCase() }).select('+password');
        if (existing) {
            const passwordMatches = await bcrypt.compare(ADMIN_PASSWORD, existing.password);
            if (!passwordMatches) {
                existing.password = await bcrypt.hash(ADMIN_PASSWORD, 12);
                existing.tokenVersion = (existing.tokenVersion || 0) + 1;
                await existing.save();
                console.log('✅ Admin password updated');
            }
            console.log(`✅ Admin exists: ${ADMIN_USERNAME}`);
            return;
        }

        const admin = new User({
            name: ADMIN_NAME,
            username: ADMIN_USERNAME.toLowerCase(),
            email: ADMIN_EMAIL.toLowerCase(),
            password: await bcrypt.hash(ADMIN_PASSWORD, 12),
            role: 'admin',
            isActive: true,
            tokenVersion: 1
        });
        await admin.save();
        console.log(`✅ Admin created: ${ADMIN_USERNAME}`);
    } catch (error) {
        console.error('❌ Admin error:', error.message);
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
            console.log(`✅ Added ${vessels.length} vessels`);
        }
    } catch (error) {
        console.error('❌ Seed error:', error.message);
    }
}

// ============================================================
// 🔐 MIDDLEWARE - CORS مُصلح
// ============================================================

// ✅ CORS - دعم * و Origins محددة
app.use(cors({
    origin: function(origin, callback) {
        // ✅ السماح بطلبات بدون Origin (مثل Postman)
        if (!origin) {
            return callback(null, true);
        }
        
        // ✅ إذا كان ALLOWED_ORIGINS يحتوي على *، السماح للجميع
        if (ALLOWED_ORIGINS.includes('*')) {
            return callback(null, true);
        }
        
        // ✅ التحقق من السماح
        const isAllowed = ALLOWED_ORIGINS.some(allowed => {
            if (allowed === '*') return true;
            if (allowed.startsWith('*.')) {
                const domain = allowed.substring(2);
                return origin.includes(domain) || origin.endsWith(domain);
            }
            return origin === allowed || origin.startsWith(allowed);
        });
        
        // ✅ السماح بـ localhost في التطوير
        if (!IS_PRODUCTION && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
            return callback(null, true);
        }
        
        if (isAllowed) {
            return callback(null, true);
        }
        
        console.warn('⚠️ CORS blocked:', origin);
        callback(new Error('CORS: Origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Request-ID', 'X-CSRF-Token'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    maxAge: 86400
}));

// ✅ Security Headers
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
            frameAncestors: ["'none'"]
        }
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
    xssFilter: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// ✅ Rate Limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'طلبات كثيرة جداً' },
    keyGenerator: (req) => req.ip
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, error: 'محاولات كثيرة، حاول بعد 15 دقيقة' },
    keyGenerator: (req) => req.ip
});

app.use('/api', globalLimiter);
app.use('/api/auth/login', authLimiter);

// ✅ Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(compression());

// ✅ Request ID
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

        const lockCheck = user.checkLock();
        if (lockCheck && lockCheck.locked) {
            return res.status(423).json({
                success: false,
                error: `الحساب مقفل، حاول بعد ${lockCheck.remainingMinutes} دقيقة`
            });
        }

        if (decoded.tokenVersion !== (user.tokenVersion || 0)) {
            return res.status(401).json({ success: false, error: 'انتهت صلاحية الجلسة' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'ليس لديك صلاحية' });
        }
        next();
    };
};

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
            return res.status(401).json({
                success: false,
                error: 'اسم المستخدم أو كلمة المرور غير صحيحة'
            });
        }

        const isValid = await user.comparePassword(password);
        if (!isValid) {
            await user.incrementLoginAttempts();
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

        const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
        user.refreshToken = hashedRefreshToken;
        await user.save();

        await Session.create({
            userId: user._id,
            token: token,
            refreshToken: refreshToken,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

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

app.post('/api/auth/refresh', async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ success: false, error: 'Refresh token required' });
        }

        const session = await Session.findOne({ refreshToken, isRevoked: false });
        if (!session || session.expiresAt < new Date()) {
            if (session) { session.isRevoked = true; await session.save(); }
            return res.status(401).json({ success: false, error: 'Invalid session' });
        }

        const user = await User.findById(session.userId);
        if (!user || !user.isActive) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }

        const isValid = await bcrypt.compare(refreshToken, user.refreshToken);
        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Invalid refresh token' });
        }

        const newToken = generateToken(user);
        const newRefreshToken = generateRefreshToken();

        session.token = newToken;
        session.refreshToken = newRefreshToken;
        session.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await session.save();

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

        res.json({ success: true, token: newToken });

    } catch (error) {
        res.status(500).json({ success: false, error: 'Internal error' });
    }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
    try {
        await Session.deleteOne({ token: req.headers.authorization?.substring(7) });
        req.user.tokenVersion = (req.user.tokenVersion || 0) + 1;
        req.user.refreshToken = null;
        await req.user.save();
        res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
        res.json({ success: true, message: 'تم تسجيل الخروج' });
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

        const existing = await User.findOne({
            $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }]
        });
        if (existing) {
            return res.status(400).json({ success: false, error: 'البريد أو اسم المستخدم موجود' });
        }

        if (password.length < 8) {
            return res.status(400).json({ success: false, error: 'كلمة المرور 8 أحرف على الأقل' });
        }

        const user = new User({
            name: sanitizeInput(name),
            username: sanitizeInput(username).toLowerCase(),
            email: sanitizeInput(email).toLowerCase(),
            password: await bcrypt.hash(password, 12),
            role: role || 'viewer',
            isActive: true
        });

        await user.save();

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

        await user.deleteOne();

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
        res.json({ success: true, message: 'تم حذف السفينة' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📊 SESSIONS
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
        res.json({ success: true, message: 'تم إبطال الجلسة' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📋 AUDIT
// ============================================================

app.get('/api/audit', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { limit = 50, skip = 0 } = req.query;
        const logs = await AuditLog.find()
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip));
        res.json({ success: true, logs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📁 STATIC FILES
// ============================================================

const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) fs.mkdirSync(publicPath, { recursive: true });

app.use(express.static(publicPath));

app.get('/', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('index.html not found');
    }
});

app.get('*', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('index.html not found');
    }
});

// ============================================================
// 💥 ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
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
        console.log('🔄 Starting server...');
        
        await createAdminIfConfigured();
        await seedVessels();

        app.listen(PORT, '0.0.0.0', () => {
            console.log('');
            console.log('='.repeat(60));
            console.log('🚢 MARINE SYSTEM v20.0');
            console.log('🚀 SERVER RUNNING');
            console.log('='.repeat(60));
            console.log(`🌍 Port: ${PORT}`);
            console.log(`🔐 Environment: ${NODE_ENV}`);
            console.log('🗄️ MongoDB: Connected ✅');
            console.log(`🛡️ CORS: ${ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS.join(', ') : 'None'}`);
            console.log('='.repeat(60));
            console.log('');
            
            if (ADMIN_USERNAME && ADMIN_PASSWORD) {
                console.log('🔑 LOGIN:');
                console.log(`   👤 Username: ${ADMIN_USERNAME}`);
                console.log(`   🔑 Password: ${ADMIN_PASSWORD}`);
            } else {
                console.log('🔑 No admin credentials configured.');
            }
            
            console.log('='.repeat(60));
            console.log(`🌐 URL: ${RENDER_URL || `http://localhost:${PORT}`}`);
            console.log('');
            console.log('✅ Server is ready!');
            console.log('');
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// ✅ Graceful Shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received, shutting down...');
    await mongoose.disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received, shutting down...');
    await mongoose.disconnect();
    process.exit(0);
});

startServer();
