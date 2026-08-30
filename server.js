/**
 * ============================================================
 * 🚢 MARINE SYSTEM - SERVER v21.0 (AUTO ADMIN)
 * ============================================================
 * ✅ ينشئ Admin تلقائياً من متغيرات البيئة
 * ✅ يضمن وجود المستخدم في قاعدة البيانات
 * ✅ يقوم بتحديث كلمة المرور إذا تغيرت
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

// ✅ JWT
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

// ✅ Admin - من متغيرات البيئة (مع قيم افتراضية آمنة)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Azerty@123456789';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@marine-system.com';
const ADMIN_NAME = process.env.ADMIN_NAME || 'مدير النظام';

// ✅ CORS
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['*'];

console.log('\n' + '='.repeat(60));
console.log('🚢 MARINE SYSTEM v21.0');
console.log('='.repeat(60));
console.log(`✅ Port: ${PORT}`);
console.log(`✅ Environment: ${NODE_ENV}`);
console.log(`✅ Admin: ${ADMIN_USERNAME}`);
console.log('='.repeat(60) + '\n');

// ============================================================
// 🗄️ MONGODB
// ============================================================
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is required');
    process.exit(1);
}

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
// 📦 MODELS
// ============================================================

// ✅ User
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
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

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

// ✅ Session
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

SessionSchema.index({ token: 1 }, { unique: true });
SessionSchema.index({ refreshToken: 1 }, { unique: true });

// ✅ Vessel
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

// ✅ Audit Log
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

// ============================================================
// 🔐 CREATE/UPDATE ADMIN - تلقائي
// ============================================================
async function ensureAdmin() {
    try {
        // ✅ البحث عن المستخدم
        const existing = await User.findOne({ username: ADMIN_USERNAME.toLowerCase() }).select('+password');
        
        if (existing) {
            // ✅ التحقق من كلمة المرور
            const passwordMatches = await bcrypt.compare(ADMIN_PASSWORD, existing.password);
            
            if (!passwordMatches) {
                // ✅ تحديث كلمة المرور إذا تغيرت
                existing.password = await bcrypt.hash(ADMIN_PASSWORD, 12);
                existing.tokenVersion = (existing.tokenVersion || 0) + 1;
                await existing.save();
                console.log('✅ Admin password updated');
            }
            
            // ✅ تحديث البريد الإلكتروني والاسم إذا تغير
            if (existing.email !== ADMIN_EMAIL.toLowerCase()) {
                existing.email = ADMIN_EMAIL.toLowerCase();
                await existing.save();
                console.log('✅ Admin email updated');
            }
            
            if (existing.name !== ADMIN_NAME) {
                existing.name = ADMIN_NAME;
                await existing.save();
                console.log('✅ Admin name updated');
            }
            
            console.log(`✅ Admin ready: ${ADMIN_USERNAME}`);
            return;
        }

        // ✅ إنشاء مستخدم جديد
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
// 🔐 MIDDLEWARE
// ============================================================

// ✅ CORS
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Request-ID']
}));

// ✅ Security Headers
app.use(helmet({
    contentSecurityPolicy: false,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
    xssFilter: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// ✅ Rate Limiting
app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'طلبات كثيرة جداً' },
    keyGenerator: (req) => req.ip
}));

app.use('/api/auth/login', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, error: 'محاولات كثيرة، حاول بعد 15 دقيقة' },
    keyGenerator: (req) => req.ip
}));

// ✅ Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(compression());

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

// ============================================================
// 👥 USERS
// ============================================================

app.get('/api/users', authenticate, authorize('admin'), async (req, res) => {
    try {
        const users = await User.find({}).select('-password -refreshToken').sort({ createdAt: -1 });
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🚢 VESSELS
// ============================================================

app.get('/api/vessels', authenticate, async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json({ success: true, vessels });
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
        res.send('Marine System - Upload index.html');
    }
});

app.get('*', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Page not found');
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
        // ✅ إنشاء Admin تلقائياً
        await ensureAdmin();
        await seedVessels();

        app.listen(PORT, '0.0.0.0', () => {
            console.log('');
            console.log('='.repeat(60));
            console.log('🚢 MARINE SYSTEM v21.0');
            console.log('🚀 SERVER RUNNING');
            console.log('='.repeat(60));
            console.log(`🌍 Port: ${PORT}`);
            console.log(`🔐 Environment: ${NODE_ENV}`);
            console.log('🗄️ MongoDB: Connected ✅');
            console.log('🛡️ CORS: All origins allowed');
            console.log('='.repeat(60));
            console.log('');
            console.log('🔑 LOGIN:');
            console.log(`   👤 Username: ${ADMIN_USERNAME}`);
            console.log(`   🔑 Password: ${ADMIN_PASSWORD}`);
            console.log(`   📧 Email: ${ADMIN_EMAIL}`);
            console.log('='.repeat(60));
            console.log(`🌐 URL: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}`);
            console.log('');
            console.log('✅ Server is ready!');
            console.log('');
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
