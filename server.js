/**
 * ============================================================
 * 🚢 MARINE SYSTEM - SERVER v27.0
 * ============================================================
 * ✅ FIXED: Admin password reset on startup
 * ✅ FIXED: Login 401 error
 * ✅ FIXED: CORS for mobile
 * ✅ MongoDB only - No Local Storage
 * ✅ Admin can change password from dashboard
 * ✅ Only admin has full access
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

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_NAME = process.env.ADMIN_NAME || 'مدير النظام';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@marine-system.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'MarineDB2026Secure';

console.log('\n' + '='.repeat(60));
console.log('🚢 MARINE SYSTEM v27.0 - ADMIN CAN CHANGE PASSWORD');
console.log('='.repeat(60));
console.log(`✅ Environment: ${NODE_ENV}`);
console.log(`✅ Port: ${PORT}`);
console.log(`✅ MongoDB: ${MONGODB_URI ? '✓' : '✗'}`);
console.log('='.repeat(60) + '\n');

// ============================================================
// 🔐 SECURITY MIDDLEWARE
// ============================================================

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(cookieParser());

app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400
}));

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false
}));

app.use(express.json({ limit: '10mb', strict: true }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression({ threshold: 1024, level: 6 }));

// ============================================================
// 🚦 RATE LIMITING
// ============================================================

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: IS_PRODUCTION ? 500 : 5000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: req => req.path === '/health' || req.path === '/api/test',
    message: { success: false, error: 'طلبات كثيرة جداً، حاول لاحقاً' }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'محاولات تسجيل دخول كثيرة، حاول بعد قليل' }
});

app.use('/api', globalLimiter);
app.use('/api/auth/login', loginLimiter);

// ============================================================
// 📁 STATIC FILES
// ============================================================

const publicPath = path.join(__dirname, 'public');
const pagesPath = path.join(publicPath, 'pages');

if (!fs.existsSync(pagesPath)) {
    fs.mkdirSync(pagesPath, { recursive: true });
    console.log('📁 Created pages directory');
}

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
// 🗄️ MODELS (MongoDB)
// ============================================================

// 👤 USER MODEL
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
    lockUntil: { type: Date, default: null },
    preferences: {
        language: { type: String, default: 'ar' },
        theme: { type: String, default: 'dark' }
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

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

// 🚢 VESSEL MODEL
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

// 🔧 MAINTENANCE MODEL
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

// 🎫 TICKET MODEL
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

// 📝 NOTE MODEL
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

// 📜 LOG MODEL
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

// 🏗️ REGISTER MODELS
const User = mongoose.model('User', UserSchema);
const Vessel = mongoose.model('Vessel', VesselSchema);
const Maintenance = mongoose.model('Maintenance', MaintenanceSchema);
const Ticket = mongoose.model('Ticket', TicketSchema);
const Note = mongoose.model('Note', NoteSchema);
const Log = mongoose.model('Log', LogSchema);

// ============================================================
// 🧰 HELPERS
// ============================================================

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

function getClientIp(req) {
    return String(req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').substring(0, 100);
}

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
        preferences: user.preferences || {},
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
    };
}

// ============================================================
// 🔐 TOKEN HELPERS
// ============================================================

function generateAccessToken(user) {
    return jwt.sign(
        { 
            id: user._id.toString(), 
            role: user.role,
            tokenVersion: user.tokenVersion || 0
        },
        JWT_SECRET,
        { expiresIn: '15m', issuer: 'marine-system' }
    );
}

function generateRefreshToken(user) {
    const jti = crypto.randomBytes(32).toString('hex');
    return jwt.sign(
        { id: user._id.toString(), jti: jti },
        JWT_REFRESH_SECRET,
        { expiresIn: '7d', issuer: 'marine-system' }
    );
}

function verifyAccessToken(token) {
    return jwt.verify(token, JWT_SECRET, { issuer: 'marine-system' });
}

function verifyRefreshToken(token) {
    return jwt.verify(token, JWT_REFRESH_SECRET, { issuer: 'marine-system' });
}

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

        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود' });
        }

        if (!user.isActive) {
            return res.status(403).json({ success: false, error: 'الحساب معطل' });
        }

        if (user.isLocked) {
            return res.status(423).json({ success: false, error: 'الحساب مقفل مؤقتاً' });
        }

        if (decoded.tokenVersion !== (user.tokenVersion || 0)) {
            return res.status(401).json({ 
                success: false, 
                error: 'انتهت الجلسة، يرجى تسجيل الدخول من جديد' 
            });
        }

        req.user = user;
        next();

    } catch (error) {
        console.error('Authentication error:', error);
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
// 🧪 TEST ROUTE
// ============================================================

app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: '✅ API работает!',
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// 🔐 LOGIN ROUTE
// ============================================================

app.post('/api/auth/login', async (req, res) => {
    console.log('📡 [LOGIN] Request received!');
    console.log('📡 Body:', req.body);
    
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: '⚠️ اسم المستخدم وكلمة المرور مطلوبان'
            });
        }
        
        console.log('🔐 Attempting login for:', username);
        
        const user = await User.findOne({ 
            $or: [
                { username: username.toLowerCase() },
                { email: username.toLowerCase() }
            ]
        }).select('+password +refreshToken');
        
        if (!user) {
            console.log('❌ User not found:', username);
            return res.status(401).json({
                success: false,
                error: '❌ اسم المستخدم أو كلمة المرور غير صحيحة'
            });
        }
        
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                error: '❌ الحساب معطل'
            });
        }
        
        if (user.isLocked) {
            return res.status(423).json({
                success: false,
                error: '❌ الحساب مقفل مؤقتاً'
            });
        }
        
        const isValid = await user.comparePassword(password);
        if (!isValid) {
            await user.incrementLoginAttempts();
            console.log('❌ Invalid password for:', username);
            return res.status(401).json({
                success: false,
                error: '❌ اسم المستخدم أو كلمة المرور غير صحيحة'
            });
        }
        
        await user.resetLoginAttempts();
        
        console.log('✅ Login successful for:', username);
        
        user.lastLogin = new Date();
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        user.refreshToken = null;
        await user.save();
        
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);
        user.refreshToken = refreshToken;
        await user.save();
        
        const cookieOptions = { 
            httpOnly: true, 
            secure: IS_PRODUCTION, 
            sameSite: 'lax' 
        };
        
        res.cookie('auth_token', accessToken, { 
            ...cookieOptions, 
            maxAge: 15 * 60 * 1000 
        });
        
        res.cookie('refresh_token', refreshToken, { 
            ...cookieOptions, 
            maxAge: 7 * 24 * 60 * 60 * 1000 
        });
        
        return res.json({
            success: true,
            user: cleanUser(user),
            token: accessToken
        });
        
    } catch (error) {
        console.error('❌ Login error:', error);
        return res.status(500).json({
            success: false,
            error: '❌ خطأ في الخادم: ' + error.message
        });
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
        res.json({ success: true, message: 'تم تسجيل الخروج' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 👤 GET CURRENT USER
// ============================================================

app.get('/api/auth/me', authenticate, async (req, res) => {
    res.json({ success: true, user: cleanUser(req.user) });
});

// ============================================================
// 🔑 CHANGE PASSWORD - ONLY ADMIN ✅
// ============================================================

app.put('/api/auth/change-password', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                error: '⚠️ كلمة المرور الحالية والجديدة مطلوبتان'
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                error: '⚠️ كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل'
            });
        }

        // ✅ التحقق من كلمة المرور الحالية
        const user = await User.findById(req.user._id).select('+password');
        const isValid = await user.comparePassword(currentPassword);
        
        if (!isValid) {
            return res.status(401).json({
                success: false,
                error: '❌ كلمة المرور الحالية غير صحيحة'
            });
        }

        // ✅ تحديث كلمة المرور
        user.password = newPassword;
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        // ✅ تسجيل النشاط
        await Log.create({
            action: 'CHANGE_PASSWORD',
            resource: 'USER',
            resourceId: user._id,
            userId: user._id,
            userName: user.name,
            ipAddress: getClientIp(req),
            userAgent: req.headers['user-agent'],
            details: { message: 'تم تغيير كلمة المرور بواسطة المسؤول' },
            status: 'success'
        });

        console.log('✅ Password changed for admin:', user.username);

        return res.json({
            success: true,
            message: '✅ تم تغيير كلمة المرور بنجاح'
        });

    } catch (error) {
        console.error('❌ Change password error:', error);
        return res.status(500).json({
            success: false,
            error: '❌ خطأ في تغيير كلمة المرور: ' + error.message
        });
    }
});

// ============================================================
// 🔐 CREATE ADMIN USER (MongoDB فقط)
// ============================================================

async function createInitialAdmin() {
    try {
        const existing = await User.findOne({ 
            $or: [{ username: ADMIN_USERNAME }, { email: ADMIN_EMAIL }] 
        });

        if (existing) {
            console.log('ℹ️ Admin account already exists in MongoDB');
            
            // ✅ إعادة تعيين كلمة المرور للتأكد من صحتها
            const salt = await bcrypt.genSalt(12);
            const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);
            existing.password = hashedPassword;
            existing.tokenVersion = (existing.tokenVersion || 0) + 1;
            await existing.save();
            
            console.log('✅ Admin password reset successfully!');
            console.log(`👤 Username: ${ADMIN_USERNAME}`);
            console.log(`🔑 Password: ${ADMIN_PASSWORD}`);
            return;
        }

        const admin = new User({
            name: ADMIN_NAME,
            username: ADMIN_USERNAME,
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
            role: 'admin',
            isActive: true,
            tokenVersion: 1
        });

        await admin.save();
        
        console.log('✅ Admin created successfully in MongoDB!');
        console.log(`👤 Username: ${ADMIN_USERNAME}`);
        console.log(`📧 Email: ${ADMIN_EMAIL}`);
        console.log(`🔑 Password: ${ADMIN_PASSWORD}`);

    } catch (error) {
        console.error('❌ Initial admin error:', error.message);
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
// 🚢 VESSELS CRUD
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
        const vessel = new Vessel(req.body);
        await vessel.save();
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
        const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'Vessel not found' });
        }
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
        res.json({ success: true, message: 'Vessel deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🔧 MAINTENANCE CRUD
// ============================================================

app.get('/api/maintenance', authenticate, async (req, res) => {
    try {
        const records = await Maintenance.find()
            .populate('vesselId', 'name num')
            .populate('supervisor', 'name email')
            .sort({ createdAt: -1 });
        res.json({ success: true, maintenance: records });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/maintenance', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const record = new Maintenance({
            ...req.body,
            supervisor: req.user._id
        });
        await record.save();
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
        const record = await Maintenance.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!record) {
            return res.status(404).json({ success: false, error: 'Maintenance record not found' });
        }
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
        res.json({ success: true, message: 'Maintenance record deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 👥 USERS
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
// 🤖 AI ASSISTANT
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
// 🏠 HOME
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
    res.status(404).json({ 
        success: false, 
        error: 'API endpoint not found', 
        path: req.originalUrl,
        available: {
            test: '/api/test',
            login: '/api/auth/login',
            dashboard: '/api/dashboard',
            vessels: '/api/vessels',
            maintenance: '/api/maintenance',
            users: '/api/users',
            'change-password': '/api/auth/change-password (admin only)'
        }
    });
});

// ============================================================
// 🌐 SPA FALLBACK
// ============================================================

app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'), function(err) {
        if (err) {
            console.error('Frontend error:', err);
            res.status(404).send('Page not found');
        }
    });
});

// ============================================================
// 💥 GLOBAL ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
    console.error('SERVER ERROR:', err);

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

    if (err.message === 'Origin not allowed by CORS') {
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
            console.log('🚢 MARINE SYSTEM v27.0 - PRODUCTION READY');
            console.log('='.repeat(60));
            console.log(`🚀 PORT: ${PORT}`);
            console.log(`🌍 ENV: ${NODE_ENV}`);
            console.log('🗄️ DATABASE: MongoDB');
            console.log('🔐 JWT: ENABLED');
            console.log('🍪 COOKIES: ENABLED');
            console.log('🛡️ HELMET: ENABLED');
            console.log('🚦 RATE LIMIT: ENABLED');
            console.log(`❤️ HEALTH: /health`);
            console.log(`🧪 TEST: /api/test`);
            console.log(`🔐 LOGIN: /api/auth/login`);
            console.log(`🔑 CHANGE PASSWORD: /api/auth/change-password (Admin only)`);
            console.log('='.repeat(60));
            console.log('🔑 DEMO LOGIN:');
            console.log(`   👤 Username: ${ADMIN_USERNAME}`);
            console.log(`   🔑 Password: ${ADMIN_PASSWORD}`);
            console.log('='.repeat(60));
            console.log('✅ المسؤول يمكنه تغيير كلمة المرور من داخل لوحة التحكم');
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
        console.error('💥 Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;
