// ============================================================
// 🚢 MARINE SYSTEM - SERVER v16.1 (FIXED)
// ============================================================
// ✅ تم إصلاح: duplicate key error, indexes, vessel model
// ============================================================

'use strict';

// ============================================================
// 📦 DEPENDENCIES
// ============================================================

require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// ============================================================
// ⚙️ CONFIGURATION
// ============================================================

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'my_super_secret_key_1234567890123456';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'another_secret_key_1234567890123456';
const FRONTEND_URL = process.env.FRONTEND_URL || '*';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@marine-system.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Marine@2024#Secure';
const ADMIN_NAME = process.env.ADMIN_NAME || 'مدير النظام';

const publicPath = path.join(__dirname, 'public');

console.log('\n' + '='.repeat(60));
console.log('🚢 MARINE SYSTEM v16.1 - FIXED');
console.log('='.repeat(60));
console.log(`✅ MONGODB_URI: ${MONGODB_URI ? 'موجود' : '❌ غير موجود'}`);
console.log('='.repeat(60) + '\n');

// ============================================================
// 📦 MODELS (مع إصلاح مشكلة unique)
// ============================================================

// ----- نموذج المستخدم -----
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    username: { type: String, unique: true, sparse: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true, select: false },
    role: { 
        type: String, 
        enum: ['admin', 'editor', 'viewer', 'مشاهد', 'محرر', 'مسؤول'],
        default: 'مشاهد' 
    },
    isActive: { type: Boolean, default: true },
    isLocked: { type: Boolean, default: false },
    tokenVersion: { type: Number, default: 0 },
    refreshToken: { type: String, select: false },
    lastLogin: { type: Date },
    loginAttempts: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// ----- نموذج المركب (مع إصلاح unique) -----
const VesselSchema = new mongoose.Schema({
    name: { type: String, required: true },
    num: { type: String, default: '' }, // ❌ تم إزالة unique: true
    len: { type: Number, required: true },
    cat: { type: String, default: '' },
    reg: { type: String, default: '' },
    zone: { type: String, default: '' },
    port: { type: String, default: '' },
    supp: { type: String, default: '' },
    stat: { 
        type: String, 
        enum: ['صالح', 'معطب', 'صيانة'],
        default: 'صالح' 
    },
    break: { type: String, default: '' },
    fDate: { type: String, default: '' },
    eDate: { type: String, default: '' },
    ref: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// نماذج أخرى (اختيارية)
const MaintenanceSchema = new mongoose.Schema({
    vesselId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel' },
    description: { type: String, required: true },
    technician: { type: String, required: true },
    cost: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'in-progress', 'completed'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const TicketSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, enum: ['open', 'in-progress', 'closed'], default: 'open' },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

const NoteSchema = new mongoose.Schema({
    content: { type: String, required: true },
    vesselId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

const LogSchema = new mongoose.Schema({
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    details: { type: mongoose.Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now }
});

// ============================================================
// 📦 MODELS REGISTRATION
// ============================================================

const User = mongoose.model('User', UserSchema);
const Vessel = mongoose.model('Vessel', VesselSchema);
const Maintenance = mongoose.model('Maintenance', MaintenanceSchema);
const Ticket = mongoose.model('Ticket', TicketSchema);
const Note = mongoose.model('Note', NoteSchema);
const Log = mongoose.model('Log', LogSchema);

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

// ============================================================
// 🗄️ DATABASE CONNECTION & INITIALIZATION
// ============================================================

async function connectDatabase() {
    if (!MONGODB_URI) {
        console.error('❌ MONGODB_URI is required!');
        process.exit(1);
    }
    
    console.log('🗄️ Connecting to MongoDB...');
    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 45000,
            maxPoolSize: 20,
            minPoolSize: 2
        });
        console.log('✅ MongoDB Connected');
        console.log(`📚 Database: ${mongoose.connection.name}`);
    } catch (error) {
        console.error('❌ MongoDB Connection Failed:', error.message);
        process.exit(1);
    }
}

// ============================================================
// 🛠️ CREATE MODELS AND INDEXES
// ============================================================

async function initializeDatabase() {
    try {
        const db = mongoose.connection.db;
        
        // ----- التحقق من وجود مجموعة vessels -----
        const collections = await db.listCollections({ name: 'vessels' }).toArray();
        
        if (collections.length === 0) {
            console.log('📦 إنشاء مجموعة vessels...');
            await db.createCollection('vessels');
            
            // ✅ إضافة نموذج اختبار
            await db.collection('vessels').insertOne({
                name: "البروق 1",
                num: "001",
                len: 11,
                cat: "البروق",
                reg: "الشمال",
                zone: "بنزرت",
                port: "بنزرت",
                stat: "صالح",
                break: "",
                fDate: "",
                eDate: "",
                ref: "REF001",
                createdAt: new Date(),
                updatedAt: new Date()
            });
            console.log('✅ تم إنشاء نموذج اختبار');
        }
        
        // ----- إنشاء الفهارس (بدون unique) -----
        console.log('📊 إنشاء الفهارس...');
        
        // حذف الفهرس القديم إذا كان موجوداً
        try {
            await db.collection('vessels').dropIndex('num_1');
            console.log('🗑️ تم حذف الفهرس القديم num_1');
        } catch(e) {
            // الفهرس غير موجود، نكمل
        }
        
        // إنشاء فهارس جديدة
        await db.collection('vessels').createIndex({ num: 1 }, { unique: false });
        await db.collection('vessels').createIndex({ name: 1 });
        await db.collection('vessels').createIndex({ stat: 1 });
        await db.collection('vessels').createIndex({ reg: 1 });
        await db.collection('vessels').createIndex({ cat: 1 });
        
        console.log('✅ تم إنشاء الفهارس بنجاح');
        
    } catch (error) {
        console.error('❌ خطأ في تهيئة قاعدة البيانات:', error.message);
    }
}

// ============================================================
// 👤 CREATE ADMIN USER
// ============================================================

async function createInitialAdmin() {
    try {
        const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@marine-system.com').trim().toLowerCase();
        const adminPassword = String(process.env.ADMIN_PASSWORD || 'Marine@2024#Secure');
        const adminName = process.env.ADMIN_NAME || 'مدير النظام';

        const existing = await User.findOne({ 
            $or: [{ email: adminEmail }, { username: 'admin' }]
        });

        if (existing) {
            if (!existing.isActive) {
                existing.isActive = true;
                existing.tokenVersion = (existing.tokenVersion || 0) + 1;
                await existing.save();
                console.log('✅ تم تفعيل حساب المدير');
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
        console.log('✅ تم إنشاء المدير بنجاح!');
        console.log(`📧 Email: ${adminEmail}`);
        console.log(`🔑 Password: ${adminPassword}`);

    } catch (error) {
        console.error('❌ خطأ في إنشاء المدير:', error.message);
    }
}

// ============================================================
// 🔐 MIDDLEWARE
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
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"]
        }
    }
}));

app.use(cors({
    origin: FRONTEND_URL || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(compression());

// ============================================================
// 🚦 RATE LIMITING
// ============================================================

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: IS_PRODUCTION ? 500 : 5000,
    skip: req => req.path === '/health',
    message: { success: false, error: 'طلبات كثيرة جداً، حاول لاحقاً' }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    message: { success: false, error: 'محاولات تسجيل دخول كثيرة' }
});

app.use('/api', globalLimiter);
app.use('/api/auth/login', loginLimiter);

// ============================================================
// 📁 STATIC FILES
// ============================================================

app.use(express.static(publicPath, {
    index: 'index.html',
    maxAge: IS_PRODUCTION ? '1d' : 0
}));

// ============================================================
// 🔐 AUTHENTICATION
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

        const decoded = verifyAccessToken(token);
        const user = await User.findById(decoded.id);
        
        if (!user || !user.isActive) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود أو غير نشط' });
        }

        req.user = user;
        next();

    } catch (error) {
        return res.status(401).json({ 
            success: false, 
            error: error.name === 'TokenExpiredError' ? 'انتهت الجلسة' : 'رمز الدخول غير صالح'
        });
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
// ❤️ HEALTH
// ============================================================

app.get('/health', (req, res) => {
    const dbState = mongoose.connection.readyState;
    res.json({
        status: dbState === 1 ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        database: dbState === 1 ? 'connected' : 'disconnected'
    });
});

// ============================================================
// 🔐 AUTH ROUTES
// ============================================================

app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
        const identifier = String(req.body.username || req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');

        if (!identifier || !password) {
            return res.status(400).json({ success: false, error: 'اسم المستخدم وكلمة المرور مطلوبان' });
        }

        const user = await User.findOne({
            $or: [{ email: identifier }, { username: identifier }]
        }).select('+password +refreshToken');

        if (!user) {
            return res.status(401).json({ success: false, error: 'بيانات الدخول غير صحيحة' });
        }

        const isValid = await user.comparePassword(password);
        if (!isValid) {
            return res.status(401).json({ success: false, error: 'بيانات الدخول غير صحيحة' });
        }

        user.lastLogin = new Date();
        user.tokenVersion = (user.tokenVersion || 0) + 1;

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);
        user.refreshToken = hashRefreshToken(refreshToken);
        await user.save();

        res.cookie('auth_token', accessToken, {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000
        });

        res.cookie('refresh_token', refreshToken, {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('auth_token');
    res.clearCookie('refresh_token');
    res.json({ success: true, message: 'تم تسجيل الخروج' });
});

app.get('/api/me', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }
        res.json({
            id: user._id,
            name: user.name,
            username: user.username,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            lastLogin: user.lastLogin
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ============================================================
// 📡 VESSELS API (المعدلة والمصححة)
// ============================================================

// ✅ جلب جميع المراكب
app.get('/api/vessels', authenticate, async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json(vessels);
    } catch (error) {
        console.error('❌ Error fetching vessels:', error);
        res.status(500).json({ error: 'فشل في جلب البيانات' });
    }
});

// ✅ إضافة مركب جديد (مع إصلاح مشكلة التكرار)
app.post('/api/vessels', authenticate, authorize('admin', 'مسؤول', 'editor', 'محرر'), async (req, res) => {
    try {
        const vesselData = req.body;
        
        // ✅ التحقق من وجود رقم مكرر
        if (vesselData.num) {
            const existing = await Vessel.findOne({ num: vesselData.num });
            if (existing) {
                // إضافة لاحقة عشوائية لجعل الرقم فريداً
                const suffix = Math.floor(Math.random() * 10000);
                vesselData.num = vesselData.num + '-' + suffix;
                console.log(`⚠️ رقم مكرر، تم تغييره إلى: ${vesselData.num}`);
            }
        }
        
        const vessel = new Vessel(vesselData);
        await vessel.save();
        res.status(201).json(vessel);
        
    } catch (error) {
        console.error('❌ Error saving vessel:', error);
        
        // ✅ معالجة خطأ التكرار
        if (error.code === 11000) {
            return res.status(400).json({ 
                error: 'الرقم موجود بالفعل، يرجى استخدام رقم آخر' 
            });
        }
        res.status(500).json({ error: error.message || 'فشل في حفظ المركب' });
    }
});

// ✅ تحديث مركب
app.put('/api/vessels/:id', authenticate, authorize('admin', 'مسؤول', 'editor', 'محرر'), async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: new Date() },
            { new: true, runValidators: true }
        );
        if (!vessel) {
            return res.status(404).json({ error: 'المركب غير موجود' });
        }
        res.json(vessel);
    } catch (error) {
        console.error('❌ Error updating vessel:', error);
        res.status(500).json({ error: 'فشل في تحديث المركب' });
    }
});

// ✅ حذف مركب
app.delete('/api/vessels/:id', authenticate, authorize('admin', 'مسؤول'), async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndDelete(req.params.id);
        if (!vessel) {
            return res.status(404).json({ error: 'المركب غير موجود' });
        }
        res.json({ message: 'تم حذف المركب بنجاح' });
    } catch (error) {
        console.error('❌ Error deleting vessel:', error);
        res.status(500).json({ error: 'فشل في حذف المركب' });
    }
});

// ============================================================
// 🚀 START SERVER
// ============================================================

async function startServer() {
    try {
        // 1. الاتصال بقاعدة البيانات
        await connectDatabase();
        
        // 2. تهيئة النماذج والفهارس
        await initializeDatabase();
        
        // 3. إنشاء المدير
        await createInitialAdmin();

        // 4. تشغيل الخادم
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log('\n' + '='.repeat(60));
            console.log('🚢 MARINE SYSTEM v16.1 - PRODUCTION READY');
            console.log('='.repeat(60));
            console.log(`🚀 PORT: ${PORT}`);
            console.log(`🌍 ENV: ${NODE_ENV}`);
            console.log(`🗄️ DATABASE: ${mongoose.connection.name}`);
            console.log(`❤️ HEALTH: /health`);
            console.log(`🔐 LOGIN: /api/auth/login`);
            console.log(`📡 VESSELS: /api/vessels`);
            console.log(`👤 ADMIN: ${ADMIN_EMAIL}`);
            console.log('='.repeat(60) + '\n');
        });

        // 5. إغلاق آمن
        let shuttingDown = false;
        const shutdown = async (signal) => {
            if (shuttingDown) return;
            shuttingDown = true;
            console.log(`🛑 ${signal} - Shutting down...`);
            server.close(async () => {
                await mongoose.connection.close();
                console.log('✅ MongoDB closed');
                process.exit(0);
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

// ============================================================
// 🏃‍♂️ RUN
// ============================================================

startServer();

module.exports = app;
