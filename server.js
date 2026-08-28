/**
 * ============================================================
 * 🚢 MARINE SYSTEM - SERVER v38.7 (READS FROM RENDER ENV)
 * ============================================================
 * ✅ FIXED: Reads ADMIN_PASSWORD from Render environment
 * ✅ FIXED: Uses your existing credentials
 * ✅ FIXED: Admin creation with Render variables
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
// ⚙️ CONFIGURATION - 📌 تقرأ من متغيرات Render
// ============================================================

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MONGODB_URI = process.env.MONGODB_URI;

// ✅ JWT_SECRET - من Render
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET is missing or too short');
    process.exit(1);
}

// ✅ ADMIN CREDENTIALS - من متغيرات Render
// 🔥 هذه هي المتغيرات التي كنت تخزن فيها كلمة المرور
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; // <-- هذا هو المتغير المهم
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@marine-system.com';
const ADMIN_NAME = process.env.ADMIN_NAME || 'مدير النظام';

// ✅ التحقق من وجود كلمة المرور
if (!ADMIN_PASSWORD) {
    console.error('❌ ADMIN_PASSWORD is missing from Render environment variables!');
    console.error('   Please add ADMIN_PASSWORD to your Render environment variables.');
    process.exit(1);
}

console.log('\n' + '='.repeat(60));
console.log('🚢 MARINE SYSTEM v38.7 - RENDER ENV');
console.log('='.repeat(60));
console.log(`✅ Environment: ${NODE_ENV}`);
console.log(`✅ Port: ${PORT}`);
console.log(`✅ MongoDB: ${MONGODB_URI ? '✓' : '✗'}`);
console.log(`✅ JWT_SECRET: ${JWT_SECRET ? '✓' : '✗'}`);
console.log(`✅ ADMIN_USERNAME: ${ADMIN_USERNAME}`);
console.log(`✅ ADMIN_PASSWORD: ${ADMIN_PASSWORD ? '✓ Set' : '✗ Missing'}`);
console.log(`✅ ADMIN_EMAIL: ${ADMIN_EMAIL}`);
console.log('='.repeat(60) + '\n');

// ============================================================
// 📦 MODELS
// ============================================================

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

const VesselSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    num: { type: String, trim: true },
    len: { type: Number, default: 0 },
    stat: { 
        type: String, 
        enum: ['صالح', 'معطب', 'صيانة'],
        default: 'صالح'
    },
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

const LogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: { type: String },
    action: { type: String },
    details: { type: String },
    ip: { type: String },
    userAgent: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Vessel = mongoose.model('Vessel', VesselSchema);
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
// 📁 STATIC FILES
// ============================================================

const publicPath = path.join(__dirname, 'public');
const pagesPath = path.join(publicPath, 'pages');
const cssPath = path.join(publicPath, 'css');
const jsPath = path.join(publicPath, 'js');

if (!fs.existsSync(publicPath)) fs.mkdirSync(publicPath, { recursive: true });
if (!fs.existsSync(pagesPath)) fs.mkdirSync(pagesPath, { recursive: true });
if (!fs.existsSync(cssPath)) fs.mkdirSync(cssPath, { recursive: true });
if (!fs.existsSync(jsPath)) fs.mkdirSync(jsPath, { recursive: true });

// ============================================================
// 🔥 CORS
// ============================================================

app.use(cors({
    origin: '*',
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Session-Id']
}));

// ============================================================
// MIDDLEWARE
// ============================================================

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());
app.use(cookieParser());

app.use(express.static(publicPath, { index: false, maxAge: 0, etag: false }));
app.use('/css', express.static(cssPath));
app.use('/js', express.static(jsPath));
app.use('/pages', express.static(pagesPath));

// ============================================================
// 🚦 RATE LIMITING
// ============================================================

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'طلبات كثيرة جداً، حاول لاحقاً' }
});
app.use('/api', limiter);

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
        return true;
    } catch (error) {
        console.error('❌ MongoDB Connection Failed:', error.message);
        return false;
    }
}

// ============================================================
// 🔐 CREATE ADMIN - 🔥 يستخدم ADMIN_PASSWORD من Render
// ============================================================

async function createAdmin() {
    try {
        console.log('🔐 Creating/updating admin user...');

        const existing = await User.findOne({
            $or: [{ username: ADMIN_USERNAME }, { email: ADMIN_EMAIL }]
        }).select('+password');

        if (existing) {
            // ✅ التحقق من كلمة المرور
            const passwordMatches = await bcrypt.compare(ADMIN_PASSWORD, existing.password);
            
            if (!passwordMatches) {
                console.log('🔄 Updating admin password...');
                existing.password = ADMIN_PASSWORD;
                existing.tokenVersion = (existing.tokenVersion || 0) + 1;
                await existing.save();
                console.log('✅ Admin password updated');
            } else {
                console.log('✅ Admin already exists with correct password');
            }
            
            console.log(`👤 Username: ${ADMIN_USERNAME}`);
            console.log(`🔑 Password: ${ADMIN_PASSWORD}`);
            return;
        }

        // ✅ إنشاء Admin جديد
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
        console.log('✅ Admin created successfully');
        console.log(`👤 Username: ${ADMIN_USERNAME}`);
        console.log(`🔑 Password: ${ADMIN_PASSWORD}`);

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
        if (count === 0) {
            console.log('🌱 Adding sample vessels...');
            const sampleVessels = [
                { name: 'البروق 1', num: 'B001', len: 11, region: 'الشمال', stat: 'صالح', cat: 'البروق', port: 'تونس' },
                { name: 'صقر 2', num: 'S002', len: 10, region: 'الساحل', stat: 'صالح', cat: 'صقور', port: 'سوسة' },
                { name: 'خافرة 3', num: 'K003', len: 20, region: 'الوسط', stat: 'معطب', cat: 'خوافر', port: 'صفاقس' }
            ];
            await Vessel.insertMany(sampleVessels);
            console.log(`✅ Added ${sampleVessels.length} sample vessels`);
        }
    } catch (error) {
        console.error('❌ Seed error:', error.message);
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

// ============================================================
// 🔐 LOGIN - 🔥 يستخدم ADMIN_PASSWORD من Render
// ============================================================

app.post('/api/auth/login', async (req, res) => {
    console.log('🔐 [LOGIN] Request received');
    console.log(`   👤 Username: ${req.body.username || 'not provided'}`);

    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: '⚠️ اسم المستخدم وكلمة المرور مطلوبان'
            });
        }

        // ✅ البحث عن المستخدم
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

        // ✅ التحقق من الحساب
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                error: '❌ الحساب معطل'
            });
        }

        // ✅ التحقق من القفل
        const lockCheck = user.checkLock();
        if (lockCheck && lockCheck.locked) {
            return res.status(423).json({
                success: false,
                error: `❌ الحساب مقفل مؤقتاً. حاول بعد ${lockCheck.remainingMinutes} دقيقة`
            });
        }

        // ✅ مقارنة كلمة المرور
        const isValid = await user.comparePassword(password);
        if (!isValid) {
            await user.incrementLoginAttempts();
            console.warn(`❌ [LOGIN] Invalid password for: ${user.username}`);
            return res.status(401).json({
                success: false,
                error: '❌ اسم المستخدم أو كلمة المرور غير صحيحة'
            });
        }

        // ✅ نجاح تسجيل الدخول
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
        console.log(`✅ [LOGIN] Success: ${user.username}`);

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
// 👤 CURRENT USER
// ============================================================

app.get('/api/auth/me', authenticate, (req, res) => {
    console.log(`👤 [ME] User: ${req.user.username}`);
    res.json({ success: true, user: cleanUser(req.user) });
});

// ============================================================
// ✅ VERIFY TOKEN
// ============================================================

app.get('/api/auth/verify', authenticate, (req, res) => {
    console.log(`✅ [VERIFY] Token valid for: ${req.user.username}`);
    res.json({ success: true, user: cleanUser(req.user), message: 'التوكن صالح' });
});

// ============================================================
// 🚪 LOGOUT
// ============================================================

app.post('/api/auth/logout', authenticate, async (req, res) => {
    console.log(`🚪 [LOGOUT] User: ${req.user.username}`);
    res.json({ success: true, message: 'تم تسجيل الخروج' });
});

// ============================================================
// 🚢 VESSELS
// ============================================================

app.get('/api/vessels', authenticate, async (req, res) => {
    console.log(`🚢 [VESSELS] GET - User: ${req.user.username}`);
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 👥 USERS
// ============================================================

app.get('/api/users', authenticate, async (req, res) => {
    console.log(`👥 [USERS] GET - User: ${req.user.username}`);
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📊 SESSIONS
// ============================================================

app.get('/api/sessions', authenticate, async (req, res) => {
    console.log(`📊 [SESSIONS] GET - User: ${req.user.username}`);
    try {
        const users = await User.find().select('name username email role isActive lastLogin createdAt');
        const logs = await Log.find().sort({ createdAt: -1 }).limit(50);
        
        const sessions = users.map((user, index) => {
            const userLogs = logs.filter(log => log.username === user.username);
            return {
                id: `sess_${index}`,
                username: user.username,
                userName: user.name,
                role: user.role,
                status: user.isActive ? 'active' : 'inactive',
                lastActivity: userLogs.length > 0 ? userLogs[0].createdAt : user.lastLogin || user.createdAt
            };
        });
        
        res.json({ success: true, sessions });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📋 LOGS
// ============================================================

app.get('/api/logs', authenticate, async (req, res) => {
    console.log(`📋 [LOGS] GET - User: ${req.user.username}`);
    try {
        const logs = await Log.find().sort({ createdAt: -1 }).limit(100);
        res.json({ success: true, logs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🏠 HOME
// ============================================================

app.get('/', (req, res) => {
    console.log(`🏠 [HOME] GET`);
    res.sendFile(path.join(publicPath, 'index.html'));
});

// ============================================================
// ⚡ FALLBACK - SPA
// ============================================================

app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: 'API not found' });
});

app.get('*', (req, res) => {
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

    app.listen(PORT, '0.0.0.0', () => {
        console.log('');
        console.log('='.repeat(60));
        console.log('🚢 MARINE SYSTEM v38.7 - RENDER ENV');
        console.log('🚀 SERVER STARTED');
        console.log('='.repeat(60));
        console.log(`🌍 Environment: ${NODE_ENV}`);
        console.log(`🚀 Port: ${PORT}`);
        console.log('🗄️ MongoDB: Connected ✅');
        console.log('🔐 JWT: Enabled');
        console.log('='.repeat(60));
        console.log('🔑 LOGIN CREDENTIALS:');
        console.log(`   👤 Username: ${ADMIN_USERNAME}`);
        console.log(`   🔑 Password: ${ADMIN_PASSWORD}`);
        console.log('='.repeat(60));
        console.log(`🌐 Open: http://localhost:${PORT}`);
        console.log('='.repeat(60));
        console.log('');
    });
}

startServer();

module.exports = app;
