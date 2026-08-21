/**
 * ============================================================
 * 🚢 MARINE SYSTEM - SERVER v22.0
 * ============================================================
 * ✅ يعمل على الحاسوب والهاتف
 * ✅ إصلاح مشكلة عرض HTML على الهاتف
 * ✅ جميع الـ MIME Types صحيحة
 * ✅ يدعم جميع الأجهزة
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

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/marine_system';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(64).toString('hex');
const FRONTEND_URL = process.env.FRONTEND_URL || '*';

console.log('\n' + '='.repeat(60));
console.log('🚢 MARINE SYSTEM v22.0');
console.log('='.repeat(60));
console.log(`✅ Environment: ${NODE_ENV}`);
console.log(`✅ Port: ${PORT}`);
console.log(`✅ MongoDB: ${MONGODB_URI ? '✓' : '✗'}`);
console.log('='.repeat(60) + '\n');

// ============================================================
// 📁 STATIC FILES - مع MIME Types صحيحة للهاتف
// ============================================================

const publicPath = path.join(__dirname, 'public');
const pagesPath = path.join(publicPath, 'pages');

// ✅ إنشاء المجلدات إذا لم تكن موجودة
if (!fs.existsSync(pagesPath)) {
    fs.mkdirSync(pagesPath, { recursive: true });
    console.log('📁 Created pages directory');
}

// ✅ Middleware لإجبار Content-Type الصحيح لجميع الأجهزة
app.use((req, res, next) => {
    // ✅ منع التخزين المؤقت للـ HTML
    if (req.path.endsWith('.html') || req.path === '/' || req.path === '/index.html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('X-Content-Type-Options', 'nosniff');
    }
    // ✅ CSS
    else if (req.path.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
    }
    // ✅ JavaScript
    else if (req.path.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
    // ✅ JSON
    else if (req.path.endsWith('.json')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    next();
});

// ✅ خدمة الملفات الثابتة مع MIME Types الصحيحة
app.use(express.static(publicPath, {
    index: 'index.html',
    maxAge: IS_PRODUCTION ? '1d' : 0,
    etag: true,
    dotfiles: 'deny',
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        
        // ✅ جميع الـ MIME Types الصحيحة
        const mimeTypes = {
            '.html': 'text/html; charset=utf-8',
            '.htm': 'text/html; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.mjs': 'application/javascript; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.webp': 'image/webp',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
            '.ttf': 'font/ttf',
            '.eot': 'application/vnd.ms-fontobject',
            '.txt': 'text/plain; charset=utf-8',
            '.xml': 'text/xml; charset=utf-8',
            '.pdf': 'application/pdf'
        };

        if (mimeTypes[ext]) {
            res.setHeader('Content-Type', mimeTypes[ext]);
        }
        res.setHeader('X-Content-Type-Options', 'nosniff');
    }
}));

// ✅ مجلد الصفحات
app.use('/pages', express.static(path.join(publicPath, 'pages'), {
    maxAge: IS_PRODUCTION ? '1d' : 0,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
        res.setHeader('X-Content-Type-Options', 'nosniff');
    }
}));

// ============================================================
// 🔐 SECURITY MIDDLEWARE
// ============================================================

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(cookieParser());

// ✅ CORS - السماح للجميع (للحاسوب والهاتف)
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'Cookie'],
    exposedHeaders: ['Content-Type', 'Authorization', 'Set-Cookie'],
    maxAge: 86400
}));

// ✅ Helmet مع إعدادات متوافقة مع الهاتف
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'unsafe-none' },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
            styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
            imgSrc: ["'self'", "data:", "https://*.googleapis.com", "https://*.gstatic.com", "https://*.openstreetmap.org", "https://*.tile.openstreetmap.org"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            connectSrc: ["'self'", "https://*.openstreetmap.org", "https://*.googleapis.com", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://*.tile.openstreetmap.org"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: []
        }
    },
    hsts: {
        maxAge: 0,
        includeSubDomains: false,
        preload: false
    }
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
// 📊 REQUEST LOGGER
// ============================================================

app.use((req, res, next) => {
    const start = Date.now();
    console.log(`📡 ${req.method} ${req.originalUrl}`);
    res.on('finish', () => {
        console.log(`✅ ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
});

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

// ── Register Models ──
let User, Vessel, Maintenance, Ticket, Note, Log;

try {
    User = mongoose.model('User');
} catch (e) {
    User = mongoose.model('User', UserSchema);
}

try {
    Vessel = mongoose.model('Vessel');
} catch (e) {
    Vessel = mongoose.model('Vessel', VesselSchema);
}

try {
    Maintenance = mongoose.model('Maintenance');
} catch (e) {
    Maintenance = mongoose.model('Maintenance', MaintenanceSchema);
}

try {
    Ticket = mongoose.model('Ticket');
} catch (e) {
    Ticket = mongoose.model('Ticket', TicketSchema);
}

try {
    Note = mongoose.model('Note');
} catch (e) {
    Note = mongoose.model('Note', NoteSchema);
}

try {
    Log = mongoose.model('Log');
} catch (e) {
    Log = mongoose.model('Log', LogSchema);
}

// ============================================================
// 🔐 TOKEN HELPERS
// ============================================================

function generateAccessToken(user) {
    return jwt.sign(
        { 
            id: user._id?.toString() || user.id,
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
        { id: user._id?.toString() || user.id, jti: jti },
        JWT_REFRESH_SECRET,
        { expiresIn: '7d', issuer: 'marine-system' }
    );
}

function verifyAccessToken(token) {
    return jwt.verify(token, JWT_SECRET, { issuer: 'marine-system' });
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
        updatedAt: user.updatedAt,
        tokenVersion: user.tokenVersion || 0
    };
}

function isValidObjectId(id) {
    if (!id) return false;
    return mongoose.Types.ObjectId.isValid(id);
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
        mongodb: dbState === 1 ? 'connected' : 'disconnected'
    });
});

// ============================================================
// 🧪 TEST ROUTE
// ============================================================

app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: '✅ API работает!',
        timestamp: new Date().toISOString(),
        endpoints: {
            login: '/api/auth/login',
            health: '/health',
            dashboard: '/api/dashboard',
            vessels: '/api/vessels',
            maintenance: '/api/maintenance',
            users: '/api/users'
        }
    });
});

// ============================================================
// 🔐 LOGIN ROUTE - FIXED ✅
// ============================================================

app.post('/api/auth/login', async (req, res) => {
    console.log('📡 [LOGIN] Request received!');
    console.log('📡 Body:', req.body);
    
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            console.log('❌ Missing username or password');
            return res.status(400).json({
                success: false,
                error: '⚠️ اسم المستخدم وكلمة المرور مطلوبان'
            });
        }
        
        console.log('🔐 Attempting login for:', username);
        
        // ✅ بيانات تجريبية (تأكد من وجود مستخدم admin)
        if (username === 'admin' && password === 'MarineDB2026Secure') {
            console.log('✅ Login successful for admin (demo)');
            return res.json({
                success: true,
                user: {
                    id: '1',
                    name: 'مدير النظام',
                    username: 'admin',
                    role: 'admin',
                    email: 'admin@marine-system.com'
                },
                token: 'demo-token-' + Date.now()
            });
        }
        
        // ✅ إذا كان المستخدم موجود في قاعدة البيانات
        if (mongoose.connection.readyState === 1) {
            try {
                const user = await User.findOne({ username: username.toLowerCase() }).select('+password');
                
                if (user) {
                    const isValid = await user.comparePassword(password);
                    if (isValid) {
                        console.log('✅ Login successful from DB:', username);
                        
                        user.lastLogin = new Date();
                        user.tokenVersion = (user.tokenVersion || 0) + 1;
                        await user.save();
                        
                        const token = generateAccessToken(user);
                        
                        return res.json({
                            success: true,
                            user: cleanUser(user),
                            token: token
                        });
                    }
                }
            } catch (dbError) {
                console.error('❌ DB error:', dbError.message);
            }
        }
        
        console.log('❌ Login failed for:', username);
        return res.status(401).json({
            success: false,
            error: '❌ اسم المستخدم أو كلمة المرور غير صحيحة'
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
// 🔐 LOGOUT ROUTE
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
// 📊 DASHBOARD ROUTE
// ============================================================

app.get('/api/dashboard', authenticate, async (req, res) => {
    try {
        const [totalVessels, activeMaintenance, validVessels, damagedVessels, maintenanceVessels] = await Promise.all([
            Vessel.countDocuments(),
            Maintenance.countDocuments({ status: { $in: ['معلقة', 'قيد التنفيذ'] } }),
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
                openTickets: 0,
                publishedNotes: 0
            }
        });
    } catch (error) {
        console.error('Dashboard error:', error);
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
// 🔧 MAINTENANCE ROUTES
// ============================================================

app.get('/api/maintenance', authenticate, async (req, res) => {
    try {
        const records = await Maintenance.find()
            .populate('vesselId', 'name num')
            .populate('supervisor', 'name email')
            .sort({ startDate: -1 });
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
// 📄 PAGE ROUTES - ✅ مع Content-Type صحيح للهاتف
// ============================================================

// ✅ الصفحة الرئيسية
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(publicPath, 'index.html'));
});

// ✅ index.html
app.get('/index.html', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(publicPath, 'index.html'));
});

// ✅ صفحات التطبيق
app.get('/pages/:page', (req, res) => {
    const pageName = req.params.page;
    const filePath = path.join(publicPath, 'pages', `${pageName}.html`);
    
    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
            users: '/api/users'
        }
    });
});

// ============================================================
// 🌐 FRONTEND FALLBACK - ✅ مع Content-Type صحيح
// ============================================================

app.get('*', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
            console.log('🚢 MARINE SYSTEM v22.0 - PRODUCTION READY');
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
            console.log('='.repeat(60));
            console.log('🔑 DEMO LOGIN:');
            console.log(`   👤 Username: admin`);
            console.log(`   🔑 Password: MarineDB2026Secure`);
            console.log('='.repeat(60));
            console.log('📱 يعمل على الحاسوب والهاتف');
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
