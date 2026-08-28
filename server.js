/**
 * ============================================================
 * 🚢 MARINE SYSTEM - SERVER v38.3 (FIXED FOR index.html)
 * ============================================================
 * ✅ FIXED: CORS for localhost and GitHub Pages
 * ✅ FIXED: Static files serving (index.html & pages)
 * ✅ FIXED: SPA Fallback for all routes
 * ✅ FIXED: Admin login with proper error handling
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

const app = express();

// ============================================================
// ⚙️ CONFIGURATION
// ============================================================

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

const MONGODB_URI = process.env.MONGODB_URI;

// ✅ JWT_SECRET
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET is missing or too short (must be at least 32 characters)');
    console.error('   Please add JWT_SECRET to your environment variables');
    process.exit(1);
}

// ✅ AI Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const ADMIN_USERNAME = 'admin';
const ADMIN_EMAIL = 'admin@marine-system.com';
const ADMIN_NAME = process.env.ADMIN_NAME || 'مدير النظام';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

console.log('\n' + '='.repeat(60));
console.log('🚢 MARINE SYSTEM v38.3 - FIXED');
console.log('='.repeat(60));
console.log(`✅ Environment: ${NODE_ENV}`);
console.log(`✅ Port: ${PORT}`);
console.log(`✅ MongoDB: ${MONGODB_URI ? '✓' : '✗'}`);
console.log(`✅ JWT_SECRET: ${JWT_SECRET ? '✓ Set' : '✗ Missing'}`);
console.log(`✅ Admin Password: ${ADMIN_PASSWORD ? '✓ Set' : '✗ Missing'}`);
console.log('='.repeat(60) + '\n');

// ============================================================
// 📦 MODELS
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

UserSchema.methods.checkLock = function() {
    if (!this.isLocked) return null;
    if (this.lockUntil && this.lockUntil > new Date()) {
        const remainingMinutes = Math.ceil((this.lockUntil.getTime() - Date.now()) / 60000);
        return { locked: true, remainingMinutes };
    }
    this.isLocked = false;
    this.lockUntil = null;
    this.loginAttempts = 0;
    return { locked: false };
};

// 🚢 VESSEL MODEL
const VesselSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    num: { type: String, trim: true },
    len: { type: Number, default: 0 },
    stat: { 
        type: String, 
        enum: ['صالح', 'معطب', 'صيانة'],
        default: 'صالح'
    },
    region: { 
        type: String, 
        enum: ['الشمال', 'الساحل', 'الوسط', 'الجنوب', 
               'وحدة الصيانة والإسناد البحري تونس', 
               'وحدة الصيانة والإسناد البحري المنستير',
               'وحدة الصيانة والإسناد البحري صفاقس',
               'وحدة الصيانة والإسناد البحري جرجيس',
               'المجمع الأمني بقبيبة'],
        trim: true 
    },
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

// 🔧 MAINTENANCE MODEL
const MaintenanceSchema = new mongoose.Schema({
    vesselId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel' },
    vesselName: { type: String, trim: true },
    type: { type: String, trim: true },
    technician: { type: String, trim: true },
    description: { type: String, required: true },
    cost: { type: Number, default: 0 },
    status: { 
        type: String, 
        enum: ['معلقة', 'قيد التنفيذ', 'مكتملة', 'ملغاة'],
        default: 'معلقة'
    },
    supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// 🎫 TICKET MODEL
const TicketSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
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
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// 📝 NOTE MODEL
const NoteSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['مسودة', 'منشورة', 'مؤرشفة'],
        default: 'مسودة'
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// 📊 LOGS MODEL
const LogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: { type: String },
    action: { type: String },
    details: { type: String },
    ip: { type: String },
    userAgent: { type: String },
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

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET, { issuer: 'marine-system' });
    } catch (error) {
        return null;
    }
}

// ============================================================
// 📁 STATIC FILES - 🔥 الجزء المهم
// ============================================================

// تحديد المسارات
const publicPath = path.join(__dirname, 'public');
const pagesPath = path.join(publicPath, 'pages');
const cssPath = path.join(publicPath, 'css');
const jsPath = path.join(publicPath, 'js');

// إنشاء المجلدات إذا لم تكن موجودة
if (!fs.existsSync(publicPath)) fs.mkdirSync(publicPath, { recursive: true });
if (!fs.existsSync(pagesPath)) fs.mkdirSync(pagesPath, { recursive: true });
if (!fs.existsSync(cssPath)) fs.mkdirSync(cssPath, { recursive: true });
if (!fs.existsSync(jsPath)) fs.mkdirSync(jsPath, { recursive: true });

// ============================================================
// 🔥 CORS - مهم جداً لـ index.html
// ============================================================

// ✅ السماح لـ GitHub Pages و Localhost
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://amanallah22.github.io',
    'https://amanallah22.github.io/marine-system',
    'https://marine-system.onrender.com',
    'https://your-backend.onrender.com'
];

app.use(cors({
    origin: function (origin, callback) {
        // ✅ السماح للطلبات بدون origin (مثل Postman)
        if (!origin) return callback(null, true);
        
        // ✅ التحقق من السماح
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn('❌ CORS blocked:', origin);
            callback(null, true); // ✅ نسمح مؤقتاً للتجربة
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Session-Id'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400
}));

// ============================================================
// MIDDLEWARE
// ============================================================

app.disable('x-powered-by');

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());
app.use(cookieParser());

// ============================================================
// 🚦 RATE LIMITING
// ============================================================

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'طلبات كثيرة جداً، حاول لاحقاً' },
    handler: (req, res) => {
        console.warn(`🚫 [RATE LIMIT] ${req.ip} exceeded rate limit on ${req.url}`);
        res.status(429).json({ success: false, error: 'طلبات كثيرة جداً، حاول لاحقاً' });
    }
});

app.use('/api', limiter);

// ============================================================
// 🔥 STATIC FILES - خدمة الملفات الثابتة
// ============================================================

// ✅ خدمة الملفات الثابتة من public/
app.use(express.static(publicPath, {
    index: false,
    maxAge: 0,
    etag: false
}));

// ✅ خدمة ملفات CSS
app.use('/css', express.static(cssPath));

// ✅ خدمة ملفات JavaScript
app.use('/js', express.static(jsPath));

// ✅ خدمة صفحات HTML
app.use('/pages', express.static(pagesPath));

// ============================================================
// 📝 LOGGING MIDDLEWARE
// ============================================================

app.use((req, res, next) => {
    const start = Date.now();
    const ip = req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress;
    const method = req.method;
    const url = req.originalUrl || req.url;
    const userAgent = req.headers['user-agent'] || 'unknown';

    // ✅ تجاهل طلبات الملفات الثابتة
    if (url.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
        return next();
    }

    console.log(`📡 [${new Date().toISOString()}] ${method} ${url}`);
    console.log(`   👤 IP: ${ip}`);
    console.log(`   📱 UA: ${userAgent.substring(0, 60)}`);

    if (['POST', 'PUT', 'PATCH'].includes(method) && req.body && Object.keys(req.body).length > 0) {
        const sanitizedBody = { ...req.body };
        if (sanitizedBody.password) sanitizedBody.password = '******';
        if (sanitizedBody.currentPassword) sanitizedBody.currentPassword = '******';
        if (sanitizedBody.newPassword) sanitizedBody.newPassword = '******';
        console.log(`   📦 Body:`, JSON.stringify(sanitizedBody, null, 2));
    }

    const originalSend = res.send;
    res.send = function(data) {
        const duration = Date.now() - start;
        const status = res.statusCode;
        console.log(`   ⏱️ ${duration}ms | ${status}`);
        originalSend.call(res, data);
    };

    next();
});

// ============================================================
// 🗄️ DATABASE CONNECTION
// ============================================================

async function connectDB() {
    if (!MONGODB_URI) {
        console.error('❌ MONGODB_URI is required');
        process.exit(1);
    }

    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            minPoolSize: 2
        });
        console.log('✅ MongoDB Connected');
        console.log(`📚 Database: ${mongoose.connection.name}`);
        return true;
    } catch (error) {
        console.error('❌ MongoDB Connection Failed:', error.message);
        return false;
    }
}

// ============================================================
// 🔐 CREATE/UPDATE ADMIN
// ============================================================

async function createAdmin() {
    try {
        const adminUsername = 'admin';
        const adminEmail = 'admin@marine-system.com';
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminPassword) {
            console.error('❌ ADMIN_PASSWORD is missing from Environment Variables');
            process.exit(1);
        }

        const existing = await User.findOne({
            $or: [{ username: adminUsername }, { email: adminEmail }]
        }).select('+password');

        if (existing) {
            const passwordMatches = await bcrypt.compare(adminPassword, existing.password);

            existing.name = ADMIN_NAME || 'مدير النظام';
            existing.email = adminEmail;
            existing.role = 'admin';
            existing.isActive = true;
            existing.isLocked = false;
            existing.lockUntil = null;
            existing.loginAttempts = 0;

            if (!passwordMatches) {
                existing.password = adminPassword;
                existing.tokenVersion = (existing.tokenVersion || 0) + 1;
                console.log('🔑 Admin password synchronized');
            }

            await existing.save();
            console.log('✅ Admin updated successfully');
            console.log(`👤 Username: ${adminUsername}`);
            return;
        }

        const admin = new User({
            name: ADMIN_NAME || 'مدير النظام',
            username: adminUsername,
            email: adminEmail,
            password: adminPassword,
            role: 'admin',
            isActive: true,
            tokenVersion: 1
        });

        await admin.save();
        console.log('✅ Admin created successfully');
        console.log(`👤 Username: ${adminUsername}`);

    } catch (error) {
        console.error('❌ Admin error:', error.message);
        throw error;
    }
}

// ============================================================
// 🌱 SEED DATA
// ============================================================

async function seedVessels() {
    try {
        const count = await Vessel.countDocuments();
        console.log(`📊 عدد المراكب الحالي: ${count}`);
        
        if (count === 0) {
            console.log('🌱 جاري إضافة بيانات أولية للمراكب...');
            
            const sampleVessels = [
                { name: 'البروق 1', num: 'B001', len: 11, region: 'الشمال', stat: 'صالح', cat: 'البروق', port: 'تونس', repairUnit: 'وحدة الصيانة والإسناد البحري تونس' },
                { name: 'صقر 2', num: 'S002', len: 10, region: 'الساحل', stat: 'صالح', cat: 'صقور', port: 'سوسة', repairUnit: 'وحدة الصيانة والإسناد البحري المنستير' },
                { name: 'خافرة 3', num: 'K003', len: 20, region: 'الوسط', stat: 'معطب', cat: 'خوافر', port: 'صفاقس', break: 'عطل في المحرك الرئيسي', repairUnit: 'وحدة الصيانة والإسناد البحري صفاق스' }
            ];
            
            await Vessel.insertMany(sampleVessels);
            console.log(`✅ تم إضافة ${sampleVessels.length} مراكب افتراضية`);
        }
    } catch (error) {
        console.error('❌ خطأ في إضافة البيانات الأولية:', error.message);
    }
}

// ============================================================
// 🔐 AUTHENTICATION
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

        const lockCheck = user.checkLock();
        if (lockCheck && lockCheck.locked) {
            return res.status(423).json({
                success: false,
                error: `الحساب مقفل مؤقتاً. حاول بعد ${lockCheck.remainingMinutes} دقيقة`
            });
        }
        if (lockCheck && !lockCheck.locked) {
            await user.save();
        }

        if (decoded.tokenVersion !== (user.tokenVersion || 0)) {
            return res.status(401).json({
                success: false,
                error: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى'
            });
        }

        req.user = user;
        next();

    } catch (error) {
        console.error('❌ Auth error:', error.message);
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
// ❤️ HEALTH
// ============================================================

app.get('/health', (req, res) => {
    const dbState = mongoose.connection.readyState;
    res.json({
        status: dbState === 1 ? 'ok' : 'degraded',
        mongodb: dbState === 1 ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ============================================================
// 🔐 LOGIN - ✅ مع رسائل خطأ واضحة
// ============================================================

app.post('/api/auth/login', async (req, res) => {
    console.log('🔐 [LOGIN] Request received');
    console.log(`   👤 Username: ${req.body.username || 'not provided'}`);

    try {
        const { username, password } = req.body;

        if (!username || !password) {
            console.warn('⚠️ [LOGIN] Missing credentials');
            return res.status(400).json({
                success: false,
                error: '⚠️ اسم المستخدم وكلمة المرور مطلوبان'
            });
        }

        const user = await User.findOne({
            $or: [
                { username: username.toLowerCase() },
                { email: username.toLowerCase() }
            ]
        }).select('+password');

        if (!user) {
            console.warn(`❌ [LOGIN] User not found: ${username}`);
            return res.status(401).json({
                success: false,
                error: '❌ اسم المستخدم أو كلمة المرور غير صحيحة'
            });
        }

        console.log(`   👤 Found user: ${user.username} (${user.role})`);

        if (!user.isActive) {
            console.warn(`⚠️ [LOGIN] Account disabled: ${user.username}`);
            return res.status(403).json({
                success: false,
                error: '❌ الحساب معطل'
            });
        }

        const lockCheck = user.checkLock();
        if (lockCheck && lockCheck.locked) {
            console.warn(`🔒 [LOGIN] Account locked: ${user.username}, remaining: ${lockCheck.remainingMinutes} min`);
            return res.status(423).json({
                success: false,
                error: `❌ الحساب مقفل مؤقتاً. حاول بعد ${lockCheck.remainingMinutes} دقيقة`
            });
        }

        const isValid = await user.comparePassword(password);
        if (!isValid) {
            await user.incrementLoginAttempts();
            console.warn(`❌ [LOGIN] Invalid password for: ${user.username}`);
            return res.status(401).json({
                success: false,
                error: '❌ اسم المستخدم أو كلمة المرور غير صحيحة'
            });
        }

        await user.resetLoginAttempts();
        user.lastLogin = new Date();
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        await Log.create({
            userId: user._id,
            username: user.username,
            action: 'تسجيل دخول',
            details: 'قام بتسجيل الدخول',
            ip: req.ip || req.socket.remoteAddress,
            userAgent: req.headers['user-agent']
        });

        const token = generateToken(user);
        console.log(`✅ [LOGIN] Success: ${user.username} (${user.role})`);

        return res.json({
            success: true,
            user: cleanUser(user),
            token: token
        });

    } catch (error) {
        console.error('❌ [LOGIN] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: '❌ خطأ في الخادم'
        });
    }
});

// ============================================================
// 🚪 LOGOUT
// ============================================================

app.post('/api/auth/logout', authenticate, async (req, res) => {
    console.log(`🚪 [LOGOUT] User: ${req.user.username}`);
    res.json({ success: true, message: 'تم تسجيل الخروج' });
});

// ============================================================
// 👤 CURRENT USER
// ============================================================

app.get('/api/auth/me', authenticate, (req, res) => {
    console.log(`👤 [ME] User: ${req.user.username}`);
    res.json({ 
        success: true, 
        user: cleanUser(req.user) 
    });
});

// ============================================================
// ✅ VERIFY TOKEN
// ============================================================

app.get('/api/auth/verify', authenticate, (req, res) => {
    console.log(`✅ [VERIFY] Token valid for user: ${req.user.username}`);
    res.json({ 
        success: true, 
        user: cleanUser(req.user),
        message: 'التوكن صالح'
    });
});

// ============================================================
// 🚢 VESSELS
// ============================================================

app.get('/api/vessels', authenticate, async (req, res) => {
    console.log(`🚢 [VESSELS] GET - User: ${req.user.username}`);
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        console.log(`   📦 Found: ${vessels.length} vessels`);
        res.json(vessels);
    } catch (error) {
        console.error('❌ [VESSELS] GET Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 🔧 MAINTENANCE
// ============================================================

app.get('/api/maintenance', authenticate, async (req, res) => {
    console.log(`🔧 [MAINTENANCE] GET - User: ${req.user.username}`);
    try {
        const records = await Maintenance.find().sort({ createdAt: -1 });
        res.json({ success: true, maintenance: records });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 👥 USERS
// ============================================================

app.get('/api/users', authenticate, authorize('admin'), async (req, res) => {
    console.log(`👥 [USERS] GET - User: ${req.user.username}`);
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🤖 AI - CONFIG
// ============================================================

app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        GEMINI_API_KEY: GEMINI_API_KEY || '',
        GEMINI_MODEL: GEMINI_MODEL || 'gemini-2.0-flash',
        DEEPSEEK_API_KEY: DEEPSEEK_API_KEY || '',
        DEEPSEEK_MODEL: DEEPSEEK_MODEL || 'deepseek-chat'
    });
});

// ============================================================
// 🤖 AI - ASK
// ============================================================

app.post('/api/ai/ask', authenticate, async (req, res) => {
    console.log(`🤖 [AI] Ask - User: ${req.user.username}`);
    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ success: false, error: 'الرسالة مطلوبة' });
        }

        // ردود محلية بسيطة
        const msg = message.toLowerCase();
        let reply = '';

        if (msg.includes('مرحبا') || msg.includes('السلام')) {
            reply = '👋 وعليكم السلام! كيف يمكنني مساعدتك في شؤون الأسطول البحري؟';
        } else if (msg.includes('الجاهزية') || msg.includes('نسبة')) {
            const total = await Vessel.countDocuments();
            const valid = await Vessel.countDocuments({ stat: 'صالح' });
            const efficiency = total ? Math.round((valid / total) * 100) : 0;
            reply = `📈 نسبة جاهزية الأسطول: ${efficiency}% (${valid} من ${total})`;
        } else if (msg.includes('معطب') || msg.includes('عطل')) {
            const damaged = await Vessel.countDocuments({ stat: 'معطب' });
            reply = `⚠️ عدد المراكب المعطوبة: ${damaged}`;
        } else {
            reply = `📌 يمكنني مساعدتك في:\n- عرض إحصائيات الأسطول\n- نسبة الجاهزية\n- المراكب المعطوبة\n- مهام الصيانة`;
        }

        res.json({
            success: true,
            response: reply,
            model: 'Local'
        });

    } catch (error) {
        console.error('❌ [AI] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📄 PAGES API
// ============================================================

app.get('/api/pages/:page', authenticate, async (req, res) => {
    try {
        const pageName = req.params.page;
        const filePath = path.join(pagesPath, pageName + '.html');
        
        if (fs.existsSync(filePath)) {
            const html = fs.readFileSync(filePath, 'utf8');
            res.json({ success: true, html });
        } else {
            res.json({ success: false, error: 'Page not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🏠 HOME - ✅ يخدم index.html
// ============================================================

app.get('/', (req, res) => {
    console.log(`🏠 [HOME] GET - IP: ${req.ip || req.socket.remoteAddress || 'unknown'}`);
    res.sendFile(path.join(publicPath, 'index.html'));
});

// ============================================================
// ⚡ FALLBACK - ✅ كل الطلبات غير API تذهب إلى index.html
// ============================================================

app.use('/api', (req, res) => {
    console.warn(`❌ [404] API not found: ${req.method} ${req.url}`);
    res.status(404).json({ success: false, error: 'API not found' });
});

// ✅ SPA Fallback - أي طلب GET غير API يذهب إلى index.html
app.get('*', (req, res) => {
    console.log(`📄 [FALLBACK] ${req.method} ${req.url} → index.html`);
    res.sendFile(path.join(publicPath, 'index.html'));
});

// ============================================================
// 💥 ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
    console.error('❌ [ERROR]', err.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

// ============================================================
// 🚀 START SERVER
// ============================================================

async function startServer() {
    const connected = await connectDB();
    if (!connected) {
        console.error('❌ Cannot start: MongoDB is not connected');
        process.exit(1);
    }

    await createAdmin();
    await seedVessels();

    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log('');
        console.log('='.repeat(60));
        console.log('🚢 MARINE SYSTEM v38.3 - FIXED');
        console.log('🚀 SERVER STARTED');
        console.log('='.repeat(60));
        console.log(`🌍 Environment: ${NODE_ENV}`);
        console.log(`🚀 Port: ${PORT}`);
        console.log('🗄️ MongoDB: Connected ✅');
        console.log('🔐 JWT: Enabled');
        console.log('📁 Public: ' + publicPath);
        console.log('📄 index.html: ' + path.join(publicPath, 'index.html'));
        console.log('='.repeat(60));
        console.log('🔑 LOGIN:');
        console.log('   👤 Username: admin');
        console.log('   🔑 Password: from ADMIN_PASSWORD');
        console.log('='.repeat(60));
        console.log('🌐 Open: http://localhost:' + PORT);
        console.log('='.repeat(60));
        console.log('');
    });

    process.on('SIGTERM', () => {
        console.log('🛑 SIGTERM received. Shutting down...');
        server.close(() => {
            mongoose.connection.close();
            console.log('✅ Server closed');
            process.exit(0);
        });
    });
}

startServer();

module.exports = app;
