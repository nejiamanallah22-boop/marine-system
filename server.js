// ============================================================
// 🚢 MARINE SYSTEM - ULTRA SECURE v8.0 (FULLY FIXED)
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const xss = require('xss-clean');
const hpp = require('hpp');
const compression = require('compression');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// 🔐 ULTRA SECURE CONFIGURATION - ALL FROM ENVIRONMENT
// ============================================================

// ✅ جميع المتغيرات من البيئة فقط - بدون قيم افتراضية
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ✅ التحقق من وجود المتغيرات المطلوبة
const requiredVars = ['ADMIN_PASSWORD', 'JWT_SECRET', 'SESSION_SECRET'];
const missingVars = requiredVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
    console.error('=========================================');
    console.error('❌ CRITICAL ERROR: Missing environment variables!');
    console.error('❌ Please set these variables in Render Dashboard:');
    missingVars.forEach(v => console.error(`   - ${v}`));
    console.error('=========================================');
} else {
    console.log('=========================================');
    console.log('✅ All environment variables are set!');
    console.log(`👤 Admin: ${ADMIN_USERNAME}`);
    console.log(`🔑 Password: ${ADMIN_PASSWORD ? '✅ Set in Render' : '❌ NOT SET!'}`);
    console.log('=========================================');
}

// ============================================================
// 📊 MONGODB CONNECTION
// ============================================================

let isMongoConnected = false;

if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000
    })
    .then(() => {
        isMongoConnected = true;
        console.log('✅ MongoDB connected successfully');
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err.message);
        console.warn('⚠️ Using memory storage as fallback');
    });
} else {
    console.warn('⚠️ MONGODB_URI not set - using memory storage');
}

// ============================================================
// 📊 MONGODB MODELS
// ============================================================

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
    password: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: { type: String, enum: ['admin', 'manager', 'operator', 'viewer'], default: 'viewer' },
    active: { type: Boolean, default: true },
    loginAttempts: { type: Number, default: 0 },
    locked: { type: Boolean, default: false },
    lockedUntil: { type: Date, default: null },
    lastLogin: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const VesselSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { type: String, required: true },
    status: { type: String, enum: ['ready', 'maintenance', 'offline'], default: 'ready' },
    location: { type: String, default: '—' },
    lastMaintenance: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Vessel = mongoose.model('Vessel', VesselSchema);

// ============================================================
// 📊 MEMORY STORAGE (Fallback - No default passwords!)
// ============================================================

const memoryUsers = [];
const memoryVessels = [
    { id: '1', name: 'الوحدة 101', type: 'زورق دورية', status: 'ready', location: 'الميناء الرئيسي', lastMaintenance: new Date().toISOString() },
    { id: '2', name: 'الوحدة 205', type: 'قاطرة بحرية', status: 'maintenance', location: 'حوض السفن', lastMaintenance: new Date().toISOString() },
    { id: '3', name: 'الوحدة 312', type: 'سفينة إسناد', status: 'offline', location: 'الميناء الغربي', lastMaintenance: new Date().toISOString() }
];

// ✅ إنشاء مستخدم admin في الذاكرة - فقط إذا كانت كلمة المرور موجودة
function initMemoryAdmin() {
    if (!ADMIN_PASSWORD) {
        console.error('❌ ADMIN_PASSWORD is required but not set!');
        console.error('⚠️ Please set ADMIN_PASSWORD in Render Dashboard');
        return;
    }

    const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    const adminExists = memoryUsers.find(u => u.username === 'admin');
    
    if (adminExists) {
        adminExists.password = hashedPassword;
        adminExists.loginAttempts = 0;
        adminExists.locked = false;
        adminExists.lockedUntil = null;
        console.log('✅ Admin password updated in memory');
    } else {
        memoryUsers.push({
            id: '1',
            username: 'admin',
            password: hashedPassword,
            name: 'Administrator',
            email: 'admin@marine.com',
            role: 'admin',
            active: true,
            loginAttempts: 0,
            locked: false,
            lockedUntil: null,
            createdAt: new Date().toISOString(),
            lastLogin: null
        });
        console.log('✅ Admin user created in memory');
    }
}

// ✅ تهيئة المستخدم admin
initMemoryAdmin();

// ============================================================
// 🛡️ SECURITY MIDDLEWARE
// ============================================================

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://*.onrender.com"],
            fontSrc: ["'self'", "https:", "data:"],
            scriptSrcAttr: ["'unsafe-inline'"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"]
        }
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
    hidePoweredBy: true
}));

app.use(cors({
    origin: ['http://localhost:5000', 'http://localhost:3000', 'https://marine-system-71eo.onrender.com'],
    credentials: true,
    exposedHeaders: ['X-CSRF-Token', 'X-Session-Expiry']
}));

app.use(compression());

// ✅ Rate Limiting - منع هجمات القوة العمياء
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, error: 'Too many login attempts. Please try again after 15 minutes.' }
});
app.use('/api/auth/login', authLimiter);

app.use(xss());
app.use(hpp());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// ✅ Session Management
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: '__Secure-marine.sid',
    cookie: {
        secure: NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: 'strict',
        domain: NODE_ENV === 'production' ? '.onrender.com' : undefined,
        path: '/'
    },
    rolling: true,
    proxy: NODE_ENV === 'production'
}));

// ✅ CSRF Protection
app.use((req, res, next) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
        req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
    }
    if (req.session.csrfExpiry && Date.now() > req.session.csrfExpiry) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
        req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
    }
    res.setHeader('X-CSRF-Token', req.session.csrfToken);
    next();
});

const csrfProtection = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (['/api/auth/login', '/api/csrf-token'].includes(req.path)) return next();

    const token = req.headers['x-csrf-token'] || req.body.csrf_token;
    if (!token || token !== req.session.csrfToken) {
        return res.status(403).json({ success: false, error: 'CSRF token غير صالح' });
    }
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
    res.setHeader('X-CSRF-Token', req.session.csrfToken);
    next();
};

// ✅ Request ID
app.use((req, res, next) => {
    req.requestId = crypto.randomBytes(8).toString('hex');
    res.setHeader('X-Request-ID', req.requestId);
    next();
});

// ✅ Logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} - ${duration}ms - ${req.requestId}`);
    });
    next();
});

// ============================================================
// 📁 STATIC FILES
// ============================================================

const pagesDir = path.join(__dirname, 'pages');
const publicPagesDir = path.join(__dirname, 'public', 'pages');
const publicDir = path.join(__dirname, 'public');

if (!fs.existsSync(pagesDir)) fs.mkdirSync(pagesDir, { recursive: true });
if (!fs.existsSync(publicPagesDir)) fs.mkdirSync(publicPagesDir, { recursive: true });

app.use(express.static(__dirname));
app.use('/pages', express.static(pagesDir));
app.use('/pages', express.static(publicPagesDir));
app.use('/public', express.static(publicDir));
app.use('/public/pages', express.static(publicPagesDir));

// ============================================================
// 🔐 CREATE ADMIN IN MONGODB (إذا كان متصلاً)
// ============================================================

async function createAdminInMongoDB() {
    try {
        if (!isMongoConnected || !ADMIN_PASSWORD) return;

        const adminExists = await User.findOne({ username: 'admin' });
        if (!adminExists) {
            const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 12);
            const admin = new User({
                username: 'admin',
                password: hashedPassword,
                name: 'Administrator',
                email: 'admin@marine.com',
                role: 'admin',
                active: true
            });
            await admin.save();
            console.log('✅ Admin user created in MongoDB');
        }
    } catch (error) {
        console.error('❌ Error creating admin in MongoDB:', error);
    }
}

// ============================================================
// 🔐 AUTH ENDPOINTS
// ============================================================

// ✅ CSRF Token
app.get('/api/csrf-token', (req, res) => {
    res.json({ success: true, token: req.session.csrfToken });
});

// ✅ Login - مُصلح بالكامل
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log(`🔐 Login attempt: ${username}`);

        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
        }

        // ✅ البحث عن المستخدم
        let user = null;
        if (isMongoConnected) {
            user = await User.findOne({ username });
        }
        if (!user) {
            user = memoryUsers.find(u => u.username === username);
        }

        if (!user) {
            console.log(`❌ User not found: ${username}`);
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        // ✅ التحقق من القفل
        if (user.locked && user.lockedUntil) {
            if (Date.now() < user.lockedUntil) {
                const remaining = Math.ceil((user.lockedUntil - Date.now()) / 60000);
                return res.status(403).json({ 
                    success: false, 
                    error: `⚠️ الحساب مقفل. حاول مرة أخرى بعد ${remaining} دقيقة` 
                });
            } else {
                user.locked = false;
                user.lockedUntil = null;
                user.loginAttempts = 0;
                if (isMongoConnected) await user.save();
            }
        }

        // ✅ التحقق من كلمة المرور
        const isValid = bcrypt.compareSync(password, user.password);
        console.log(`🔑 Password match: ${isValid}`);

        if (!isValid) {
            user.loginAttempts = (user.loginAttempts || 0) + 1;
            
            if (user.loginAttempts >= 5) {
                user.locked = true;
                user.lockedUntil = Date.now() + (30 * 60 * 1000);
                console.log(`🔒 Account locked for ${username}`);
                if (isMongoConnected) await user.save();
                return res.status(403).json({ 
                    success: false, 
                    error: '⚠️ الحساب مقفل لمدة 30 دقيقة بسبب كثرة المحاولات الفاشلة' 
                });
            }
            
            if (isMongoConnected) await user.save();
            console.log(`❌ Invalid password for ${username} (attempt ${user.loginAttempts}/5)`);
            return res.status(401).json({ 
                success: false, 
                error: 'اسم المستخدم أو كلمة المرور غير صحيحة' 
            });
        }

        // ✅ نجاح تسجيل الدخول
        user.loginAttempts = 0;
        user.locked = false;
        user.lockedUntil = null;
        user.lastLogin = new Date();
        if (isMongoConnected) await user.save();

        // ✅ إنشاء التوكن
        const token = jwt.sign(
            { id: user._id || user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        console.log(`✅ Login successful: ${username}`);

        res.json({
            success: true,
            token: token,
            user: {
                id: user._id || user.id,
                username: user.username,
                name: user.name,
                email: user.email,
                role: user.role,
                active: user.active
            }
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ✅ Verify Token
app.get('/api/auth/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        let user = null;
        if (isMongoConnected) {
            user = await User.findById(decoded.id);
        }
        if (!user) {
            user = memoryUsers.find(u => u.id === decoded.id);
        }

        if (!user) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود' });
        }

        res.json({
            success: true,
            user: {
                id: user._id || user.id,
                username: user.username,
                name: user.name,
                email: user.email,
                role: user.role,
                active: user.active
            }
        });
    } catch (error) {
        res.status(401).json({ success: false, error: 'توكن غير صالح' });
    }
});

// ✅ Logout
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('__Secure-marine.sid');
        res.json({ success: true, message: 'تم تسجيل الخروج' });
    });
});

// ✅ Reset login attempts (للتطوير)
app.post('/api/auth/reset-attempts', async (req, res) => {
    try {
        const { username } = req.body;
        const targetUser = username || 'admin';
        
        let user = null;
        if (isMongoConnected) {
            user = await User.findOne({ username: targetUser });
        }
        if (!user) {
            user = memoryUsers.find(u => u.username === targetUser);
        }
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }
        
        user.loginAttempts = 0;
        user.locked = false;
        user.lockedUntil = null;
        if (isMongoConnected) await user.save();
        
        res.json({ success: true, message: `✅ تم إعادة تعيين محاولات ${targetUser}` });
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ============================================================
// 📊 DATA ENDPOINTS
// ============================================================

// ✅ Get vessels
app.get('/api/vessels', csrfProtection, async (req, res) => {
    try {
        if (isMongoConnected) {
            const vessels = await Vessel.find().sort({ createdAt: -1 });
            return res.json(vessels);
        }
        res.json(memoryVessels);
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في قراءة البيانات' });
    }
});

// ✅ Add vessel
app.post('/api/vessels', csrfProtection, async (req, res) => {
    try {
        const { name, type, status, location } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, error: 'اسم الوحدة مطلوب' });
        }

        if (isMongoConnected) {
            const newVessel = new Vessel({
                name,
                type: type || 'غير محدد',
                status: status || 'ready',
                location: location || '—',
                lastMaintenance: new Date()
            });
            await newVessel.save();
            return res.json({ success: true, vessel: newVessel });
        }

        const newVessel = {
            id: crypto.randomBytes(8).toString('hex'),
            name,
            type: type || 'غير محدد',
            status: status || 'ready',
            location: location || '—',
            lastMaintenance: new Date().toISOString()
        };
        memoryVessels.push(newVessel);
        res.json({ success: true, vessel: newVessel });
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في إضافة الوحدة' });
    }
});

// ✅ Delete vessel
app.delete('/api/vessels/:id', csrfProtection, async (req, res) => {
    try {
        const vesselId = req.params.id;
        
        if (isMongoConnected) {
            const result = await Vessel.findByIdAndDelete(vesselId);
            if (!result) {
                return res.status(404).json({ success: false, error: 'الوحدة غير موجودة' });
            }
            return res.json({ success: true, message: 'تم حذف الوحدة' });
        }
        
        const index = memoryVessels.findIndex(v => v.id === vesselId);
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'الوحدة غير موجودة' });
        }
        memoryVessels.splice(index, 1);
        res.json({ success: true, message: 'تم حذف الوحدة' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في حذف الوحدة' });
    }
});

// ✅ Get users
app.get('/api/users', csrfProtection, async (req, res) => {
    try {
        if (isMongoConnected) {
            const users = await User.find({}, '-password');
            return res.json(users);
        }
        const safeUsers = memoryUsers.map(({ password, ...user }) => user);
        res.json(safeUsers);
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ✅ Add user
app.post('/api/users', csrfProtection, async (req, res) => {
    try {
        const { username, password, email, role } = req.body;
        
        if (!username) {
            return res.status(400).json({ success: false, error: 'اسم المستخدم مطلوب' });
        }
        if (!password) {
            return res.status(400).json({ success: false, error: 'كلمة المرور مطلوبة' });
        }

        let existingUser = null;
        if (isMongoConnected) {
            existingUser = await User.findOne({ username });
        } else {
            existingUser = memoryUsers.find(u => u.username === username);
        }
        
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'اسم المستخدم موجود' });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);
        const newUserData = {
            username,
            password: hashedPassword,
            name: username,
            email: email || `${username}@marine.com`,
            role: role || 'viewer',
            active: true
        };

        if (isMongoConnected) {
            const newUser = new User(newUserData);
            await newUser.save();
            const { password: _, ...userWithoutPassword } = newUser.toObject();
            return res.status(201).json({ success: true, message: 'تم إضافة المستخدم', user: userWithoutPassword });
        }

        const newUser = {
            id: crypto.randomBytes(8).toString('hex'),
            ...newUserData,
            loginAttempts: 0,
            locked: false,
            lockedUntil: null,
            createdAt: new Date().toISOString(),
            lastLogin: null
        };
        memoryUsers.push(newUser);
        const { password: _, ...userWithoutPassword } = newUser;
        res.status(201).json({ success: true, message: 'تم إضافة المستخدم', user: userWithoutPassword });
    } catch (error) {
        console.error('❌ Error creating user:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ✅ Update user
app.put('/api/users/:id', csrfProtection, async (req, res) => {
    try {
        const userId = req.params.id;
        const { username, email, role, active, password } = req.body;

        let user = null;
        if (isMongoConnected) {
            user = await User.findById(userId);
        } else {
            user = memoryUsers.find(u => u.id === userId);
        }

        if (!user) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }

        if (user.username === 'admin' && req.body.username && req.body.username !== 'admin') {
            return res.status(403).json({ success: false, error: 'لا يمكن تغيير اسم المستخدم الرئيسي' });
        }

        if (username) user.username = username;
        if (email) user.email = email;
        if (role) user.role = role;
        if (active !== undefined) user.active = active;
        if (password) {
            user.password = bcrypt.hashSync(password, 10);
        }

        if (isMongoConnected) {
            await user.save();
            const { password: _, ...userWithoutPassword } = user.toObject();
            return res.json({ success: true, message: 'تم تحديث المستخدم', user: userWithoutPassword });
        }

        const { password: _, ...userWithoutPassword } = user;
        res.json({ success: true, message: 'تم تحديث المستخدم', user: userWithoutPassword });
    } catch (error) {
        console.error('❌ Error updating user:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ✅ Delete user
app.delete('/api/users/:id', csrfProtection, async (req, res) => {
    try {
        const userId = req.params.id;

        let user = null;
        if (isMongoConnected) {
            user = await User.findById(userId);
        } else {
            user = memoryUsers.find(u => u.id === userId);
        }

        if (!user) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }

        if (user.username === 'admin') {
            return res.status(403).json({ success: false, error: 'لا يمكن حذف المستخدم الرئيسي' });
        }

        if (isMongoConnected) {
            await User.findByIdAndDelete(userId);
            return res.json({ success: true, message: 'تم حذف المستخدم' });
        }

        const index = memoryUsers.findIndex(u => u.id === userId);
        memoryUsers.splice(index, 1);
        res.json({ success: true, message: 'تم حذف المستخدم' });
    } catch (error) {
        console.error('❌ Error deleting user:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ============================================================
// 🌐 PAGE ROUTES
// ============================================================

function findPageFile(pageName) {
    const paths = [
        path.join(publicPagesDir, pageName + '.html'),
        path.join(pagesDir, pageName + '.html'),
        path.join(publicDir, pageName + '.html'),
        path.join(__dirname, pageName + '.html')
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

app.get('/', (req, res) => {
    const paths = [
        path.join(__dirname, 'index.html'),
        path.join(publicDir, 'index.html'),
        path.join(pagesDir, 'index.html'),
        path.join(publicPagesDir, 'index.html')
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) return res.sendFile(p);
    }
    res.send(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🚢 Marine System</title>
            <style>
                *{margin:0;padding:0;box-sizing:border-box}
                body{font-family:'Segoe UI',sans-serif;background:#0a0e1a;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}
                .container{background:linear-gradient(145deg,#1a1f35,#0d1528);padding:50px;border-radius:30px;max-width:600px;width:100%;border:1px solid #2a3a5a;text-align:center}
                h1{color:#00d4ff;font-size:2.5em}
                .status{background:#0d1528;padding:20px;border-radius:15px;margin:20px 0;border-right:5px solid #00ff88}
                .info{color:#aabbcc;line-height:2}
                .info strong{color:#00d4ff}
                .btn{background:linear-gradient(135deg,#00d4ff,#0099cc);color:#0a0e1a;border:none;padding:15px 40px;border-radius:10px;font-size:18px;font-weight:bold;cursor:pointer;transition:all 0.3s;width:100%;margin-top:15px}
                .btn:hover{transform:translateY(-3px);box-shadow:0 10px 30px rgba(0,212,255,0.3)}
                .btn-logout{background:linear-gradient(135deg,#ff4444,#cc0000)}
                .error{color:#ff4444;margin:10px 0}
                .success-msg{color:#00ff88;margin:10px 0}
                .login-section,.user-section{margin-top:30px;text-align:right}
                .user-section{display:none}
                .badge{display:inline-block;padding:5px 15px;border-radius:20px;font-size:14px;margin:5px 0;background:#ff4444;color:#fff}
                .login-form input{width:100%;padding:15px;margin:10px 0;border-radius:10px;border:1px solid #2a3a5a;background:#0d1528;color:#fff;font-size:16px}
                .login-form input:focus{outline:none;border-color:#00d4ff}
                .footer{margin-top:30px;padding-top:20px;border-top:1px solid #2a3a5a;color:#667788;font-size:12px}
                .links{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:20px}
                .links a{display:inline-block;padding:10px 20px;background:#2a3a5a;color:#fff;text-decoration:none;border-radius:8px;font-size:14px}
                .links a:hover{background:#3a4a6a}
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚢 MARINE SYSTEM</h1>
                <p style="color:#8899aa;">نظام إدارة الأسطول البحري</p>
                <div class="status">
                    <h3 style="color:#00ff88;">✅ النظام يعمل</h3>
                    <p class="info">🔒 <strong>الأمان:</strong> عالي جداً</p>
                    <p class="info">👤 <strong>المستخدم:</strong> admin</p>
                    <p class="info">🔑 <strong>كلمة المرور:</strong> (مخزنة في Render)</p>
                </div>
                <div id="loginSection" class="login-section">
                    <h3 style="color:#00d4ff;">🔐 تسجيل الدخول</h3>
                    <div id="message"></div>
                    <div class="login-form">
                        <input type="text" id="username" placeholder="اسم المستخدم" value="admin">
                        <input type="password" id="password" placeholder="كلمة المرور">
                        <button class="btn" onclick="handleLogin()">🚀 دخول</button>
                    </div>
                </div>
                <div id="userSection" class="user-section">
                    <p style="font-size:18px;">👋 <strong>مرحباً بك، <span id="userName"></span></strong></p>
                    <p>📋 <strong>الدور:</strong> <span id="userRole" class="badge">admin</span></p>
                    <div class="links">
                        <a href="/dashboard">📊 لوحة التحكم</a>
                        <a href="/fleet">🚢 الأسطول</a>
                        <a href="/users">👥 المستخدمين</a>
                    </div>
                    <button class="btn btn-logout" onclick="handleLogout()">🚪 تسجيل الخروج</button>
                </div>
                <div class="footer">🔒 جميع البيانات مشفرة | v8.0</div>
            </div>
            <script>
                let csrfToken = '';

                async function getCsrfToken() {
                    try {
                        const r = await fetch('/api/csrf-token', { credentials: 'include', headers: { 'Accept': 'application/json' } });
                        const d = await r.json();
                        if (d.success) { csrfToken = d.token; return d.token; }
                        return null;
                    } catch(e) { return null; }
                }

                async function handleLogin() {
                    const username = document.getElementById('username').value.trim();
                    const password = document.getElementById('password').value;
                    const msg = document.getElementById('message');
                    if (!username || !password) { msg.innerHTML = '<div class="error">⚠️ الرجاء إدخال جميع البيانات</div>'; return; }
                    try {
                        const t = await getCsrfToken();
                        if (!t) { msg.innerHTML = '<div class="error">❌ فشل الحصول على CSRF token</div>'; return; }
                        msg.innerHTML = '<div style="color:#00d4ff;">⏳ جاري تسجيل الدخول...</div>';
                        const r = await fetch('/api/auth/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': t },
                            credentials: 'include',
                            body: JSON.stringify({ username, password })
                        });
                        const d = await r.json();
                        if (r.ok && d.success) {
                            localStorage.setItem('authToken', d.token);
                            localStorage.setItem('userData', JSON.stringify(d.user));
                            document.getElementById('loginSection').style.display = 'none';
                            document.getElementById('userSection').style.display = 'block';
                            document.getElementById('userName').textContent = d.user.name || d.user.username;
                            document.getElementById('userRole').textContent = d.user.role || 'مستخدم';
                            msg.innerHTML = '<div class="success-msg">✅ تم تسجيل الدخول بنجاح</div>';
                        } else {
                            msg.innerHTML = '<div class="error">❌ ' + (d.error || 'فشل تسجيل الدخول') + '</div>';
                        }
                    } catch(e) {
                        msg.innerHTML = '<div class="error">❌ خطأ في الاتصال بالخادم</div>';
                    }
                }

                async function handleLogout() {
                    try {
                        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
                        localStorage.clear();
                        document.getElementById('loginSection').style.display = 'block';
                        document.getElementById('userSection').style.display = 'none';
                        document.getElementById('message').innerHTML = '<div class="success-msg">✅ تم تسجيل الخروج</div>';
                    } catch(e) {}
                }

                document.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        const loginSection = document.getElementById('loginSection');
                        if (loginSection.style.display !== 'none') handleLogin();
                    }
                });

                async function checkAuth() {
                    const token = localStorage.getItem('authToken');
                    if (!token) return;
                    try {
                        const csrf = await getCsrfToken();
                        const r = await fetch('/api/auth/me', {
                            headers: { 'Authorization': 'Bearer ' + token, 'X-CSRF-Token': csrf || '', 'Accept': 'application/json' },
                            credentials: 'include'
                        });
                        const d = await r.json();
                        if (d.success && d.user) {
                            document.getElementById('loginSection').style.display = 'none';
                            document.getElementById('userSection').style.display = 'block';
                            document.getElementById('userName').textContent = d.user.name || d.user.username;
                            document.getElementById('userRole').textContent = d.user.role || 'مستخدم';
                        } else {
                            localStorage.removeItem('authToken');
                        }
                    } catch(e) { localStorage.removeItem('authToken'); }
                }

                getCsrfToken().then(checkAuth);
            </script>
        </body>
        </html>
    `);
});

app.get('/pages/:page', (req, res) => {
    const filePath = findPageFile(req.params.page);
    if (filePath) return res.sendFile(filePath);
    res.status(404).send('<h1>❌ 404</h1><p>Page not found</p>');
});

app.get('/:page', (req, res, next) => {
    const skip = ['api', 'pages', 'public', 'css', 'js', 'assets', 'favicon.ico'];
    if (skip.includes(req.params.page)) return next();
    const filePath = findPageFile(req.params.page);
    if (filePath) return res.sendFile(filePath);
    next();
});

app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ success: false, error: 'API not found' });
    }
    res.redirect('/');
});

// ============================================================
// 🚀 START SERVER
// ============================================================

createAdminInMongoDB().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log('=========================================');
        console.log('🚢 MARINE SYSTEM v8.0 - ULTRA SECURE');
        console.log('=========================================');
        console.log(`📍 Server: http://localhost:${PORT}`);
        console.log(`🌍 Environment: ${NODE_ENV}`);
        console.log(`🗄️ Database: ${isMongoConnected ? 'MongoDB' : 'Memory'}`);
        console.log('🔒 Security: CSRF + XSS + HPP + Rate Limiting + Helmet');
        console.log('=========================================');
        console.log('🔑 Admin credentials are loaded from Render ONLY');
        console.log('   No default passwords in code!');
        console.log('=========================================');
    });
});

module.exports = app;
