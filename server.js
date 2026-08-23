/**
 * ============================================================
 * 🚢 MARINE SYSTEM - SERVER v38.1 (AI INTEGRATED)
 * ============================================================
 * ✅ FIXED: Account lock timeout check
 * ✅ FIXED: Token version validation
 * ✅ FIXED: CORS configuration
 * ✅ FIXED: Admin unlock on restart
 * ✅ ADDED: DeepSeek AI Integration
 * ✅ ADDED: AI API endpoints
 * ✅ PRODUCTION READY 100%
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
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const ADMIN_USERNAME = 'admin';
const ADMIN_EMAIL = 'admin@marine-system.com';
const ADMIN_NAME = process.env.ADMIN_NAME || 'مدير النظام';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

console.log('\n' + '='.repeat(60));
console.log('🚢 MARINE SYSTEM v38.1 - AI INTEGRATED');
console.log('='.repeat(60));
console.log(`✅ Environment: ${NODE_ENV}`);
console.log(`✅ Port: ${PORT}`);
console.log(`✅ MongoDB: ${MONGODB_URI ? '✓' : '✗'}`);
console.log(`✅ JWT_SECRET: ${JWT_SECRET ? '✓ Set' : '✗ Missing'}`);
console.log(`✅ Admin Password: ${ADMIN_PASSWORD ? '✓ Set' : '✗ Missing'}`);
console.log(`✅ DeepSeek API: ${DEEPSEEK_API_KEY ? '✓ Set' : '✗ Missing'}`);
console.log(`✅ Gemini API: ${GEMINI_API_KEY ? '✓ Set' : '✗ Missing'}`);
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
    stat: { 
        type: String, 
        enum: ['صالح', 'معطب', 'صيانة'],
        default: 'صالح'
    },
    region: { 
        type: String, 
        enum: ['الشمال', 'الساحل', 'الوسط', 'الجنوب'],
        trim: true 
    },
    port: { type: String, trim: true },
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

// 🏗️ REGISTER MODELS
const User = mongoose.model('User', UserSchema);
const Vessel = mongoose.model('Vessel', VesselSchema);
const Maintenance = mongoose.model('Maintenance', MaintenanceSchema);
const Ticket = mongoose.model('Ticket', TicketSchema);
const Note = mongoose.model('Note', NoteSchema);

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
    return jwt.verify(token, JWT_SECRET, { issuer: 'marine-system' });
}

// ============================================================
// 📝 LOGGING MIDDLEWARE
// ============================================================

app.use((req, res, next) => {
    const start = Date.now();
    const ip = req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress;
    const method = req.method;
    const url = req.originalUrl || req.url;
    const userAgent = req.headers['user-agent'] || 'unknown';

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
        
        if (url.startsWith('/api/')) {
            try {
                const responseData = typeof data === 'string' ? JSON.parse(data) : data;
                if (responseData && typeof responseData === 'object') {
                    if (responseData.token) {
                        console.log(`   🔑 Token: ✓ (${responseData.token.substring(0, 15)}...)`);
                        delete responseData.token;
                    }
                    if (responseData.user && responseData.user.password) {
                        delete responseData.user.password;
                    }
                    console.log(`   📤 Response:`, JSON.stringify(responseData, null, 2));
                }
            } catch (e) {}
        }
        originalSend.call(res, data);
    };

    next();
});

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
// 🔐 MIDDLEWARE
// ============================================================

app.disable('x-powered-by');

app.use(cors({
    origin: '*',
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());
app.use(cookieParser());

// ============================================================
// 📁 STATIC FILES
// ============================================================

const publicPath = path.join(__dirname, 'public');
const cssPath = path.join(publicPath, 'css');
const pagesPath = path.join(publicPath, 'pages');
const jsPath = path.join(publicPath, 'js');

if (!fs.existsSync(publicPath)) fs.mkdirSync(publicPath, { recursive: true });
if (!fs.existsSync(cssPath)) fs.mkdirSync(cssPath, { recursive: true });
if (!fs.existsSync(pagesPath)) fs.mkdirSync(pagesPath, { recursive: true });
if (!fs.existsSync(jsPath)) fs.mkdirSync(jsPath, { recursive: true });

app.use(express.static(publicPath, {
    index: false,
    maxAge: 0,
    etag: false
}));

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
                console.log('🔑 Admin password synchronized with Render');
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
        uptime: process.uptime(),
        ai: {
            deepseek: !!DEEPSEEK_API_KEY,
            gemini: !!GEMINI_API_KEY
        }
    });
});

// ============================================================
// 🔐 LOGIN
// ============================================================

app.post('/api/auth/login', async (req, res) => {
    console.log('🔐 [LOGIN] Request received');
    console.log(`   👤 Username: ${req.body.username || 'not provided'}`);
    console.log(`   📡 IP: ${req.ip || req.socket.remoteAddress || 'unknown'}`);

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
        if (lockCheck && !lockCheck.locked) {
            await user.save();
        }

        const isValid = await user.comparePassword(password);
        if (!isValid) {
            await user.incrementLoginAttempts();
            console.warn(`❌ [LOGIN] Invalid password for: ${user.username} (attempt ${user.loginAttempts})`);
            return res.status(401).json({
                success: false,
                error: '❌ اسم المستخدم أو كلمة المرور غير صحيحة'
            });
        }

        await user.resetLoginAttempts();

        user.lastLogin = new Date();
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        const token = generateToken(user);
        console.log(`✅ [LOGIN] Success: ${user.username} (${user.role})`);
        console.log(`   🔑 Token: ${token.substring(0, 20)}...`);

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
    res.json({ success: true, user: cleanUser(req.user) });
});

// ============================================================
// 🔑 CHANGE PASSWORD
// ============================================================

app.put('/api/auth/change-password', authenticate, authorize('admin'), async (req, res) => {
    console.log(`🔑 [CHANGE PASSWORD] User: ${req.user.username}`);
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

        const user = await User.findById(req.user._id).select('+password');
        const isValid = await user.comparePassword(currentPassword);

        if (!isValid) {
            console.warn(`❌ [CHANGE PASSWORD] Invalid current password for: ${req.user.username}`);
            return res.status(401).json({
                success: false,
                error: '❌ كلمة المرور الحالية غير صحيحة'
            });
        }

        user.password = newPassword;
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        console.log(`✅ [CHANGE PASSWORD] Success for: ${req.user.username}`);
        return res.json({
            success: true,
            message: '✅ تم تغيير كلمة المرور بنجاح'
        });

    } catch (error) {
        console.error('❌ [CHANGE PASSWORD] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: '❌ خطأ في تغيير كلمة المرور'
        });
    }
});

// ============================================================
// 📊 DASHBOARD
// ============================================================

app.get('/api/dashboard', authenticate, async (req, res) => {
    console.log(`📊 [DASHBOARD] User: ${req.user.username}`);
    try {
        const [totalVessels, validVessels, damagedVessels, maintenanceVessels, totalUsers, totalTickets] = await Promise.all([
            Vessel.countDocuments(),
            Vessel.countDocuments({ stat: 'صالح' }),
            Vessel.countDocuments({ stat: 'معطب' }),
            Vessel.countDocuments({ stat: 'صيانة' }),
            User.countDocuments(),
            Ticket.countDocuments()
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
                users: totalUsers,
                tickets: totalTickets
            }
        });
    } catch (error) {
        console.error('❌ [DASHBOARD] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🚢 VESSELS
// ============================================================

app.get('/api/vessels', authenticate, async (req, res) => {
    console.log(`🚢 [VESSELS] GET - User: ${req.user.username}`);
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        console.log(`   📦 Found: ${vessels.length} vessels`);
        res.json({ success: true, vessels });
    } catch (error) {
        console.error('❌ [VESSELS] GET Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/vessels', authenticate, authorize('admin', 'manager'), async (req, res) => {
    console.log(`🚢 [VESSELS] POST - User: ${req.user.username}`);
    try {
        const vessel = new Vessel(req.body);
        await vessel.save();
        console.log(`   ✅ Created: ${vessel.name}`);
        res.status(201).json({ success: true, vessel });
    } catch (error) {
        console.error('❌ [VESSELS] POST Error:', error.message);
        res.status(400).json({ success: false, error: error.message });
    }
});

app.put('/api/vessels/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
    console.log(`🚢 [VESSELS] PUT - User: ${req.user.username}, ID: ${req.params.id}`);
    try {
        const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!vessel) {
            console.warn(`   ❌ Not found: ${req.params.id}`);
            return res.status(404).json({ success: false, error: 'Vessel not found' });
        }
        console.log(`   ✅ Updated: ${vessel.name}`);
        res.json({ success: true, vessel });
    } catch (error) {
        console.error('❌ [VESSELS] PUT Error:', error.message);
        res.status(400).json({ success: false, error: error.message });
    }
});

app.delete('/api/vessels/:id', authenticate, authorize('admin'), async (req, res) => {
    console.log(`🚢 [VESSELS] DELETE - User: ${req.user.username}, ID: ${req.params.id}`);
    try {
        const vessel = await Vessel.findByIdAndDelete(req.params.id);
        if (!vessel) {
            console.warn(`   ❌ Not found: ${req.params.id}`);
            return res.status(404).json({ success: false, error: 'Vessel not found' });
        }
        console.log(`   ✅ Deleted: ${vessel.name}`);
        res.json({ success: true, message: 'Vessel deleted' });
    } catch (error) {
        console.error('❌ [VESSELS] DELETE Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🔧 MAINTENANCE
// ============================================================

app.get('/api/maintenance', authenticate, async (req, res) => {
    console.log(`🔧 [MAINTENANCE] GET - User: ${req.user.username}`);
    try {
        const records = await Maintenance.find().sort({ createdAt: -1 });
        console.log(`   📦 Found: ${records.length} records`);
        res.json({ success: true, maintenance: records });
    } catch (error) {
        console.error('❌ [MAINTENANCE] GET Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/maintenance', authenticate, authorize('admin', 'manager'), async (req, res) => {
    console.log(`🔧 [MAINTENANCE] POST - User: ${req.user.username}`);
    try {
        const record = new Maintenance({
            ...req.body,
            supervisor: req.user._id
        });
        await record.save();
        console.log(`   ✅ Created: ${record.description.substring(0, 30)}...`);
        res.status(201).json({ success: true, maintenance: record });
    } catch (error) {
        console.error('❌ [MAINTENANCE] POST Error:', error.message);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 👥 USERS
// ============================================================

app.get('/api/users', authenticate, authorize('admin'), async (req, res) => {
    console.log(`👥 [USERS] GET - User: ${req.user.username}`);
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        console.log(`   📦 Found: ${users.length} users`);
        res.json({ success: true, users });
    } catch (error) {
        console.error('❌ [USERS] GET Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🎫 TICKETS
// ============================================================

app.get('/api/tickets', authenticate, async (req, res) => {
    console.log(`🎫 [TICKETS] GET - User: ${req.user.username}`);
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        console.log(`   📦 Found: ${tickets.length} tickets`);
        res.json({ success: true, tickets });
    } catch (error) {
        console.error('❌ [TICKETS] GET Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/tickets', authenticate, async (req, res) => {
    console.log(`🎫 [TICKETS] POST - User: ${req.user.username}`);
    try {
        const ticket = new Ticket({
            ...req.body,
            createdBy: req.user._id
        });
        await ticket.save();
        console.log(`   ✅ Created: ${ticket.title}`);
        res.status(201).json({ success: true, ticket });
    } catch (error) {
        console.error('❌ [TICKETS] POST Error:', error.message);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📝 NOTES
// ============================================================

app.get('/api/notes', authenticate, async (req, res) => {
    console.log(`📝 [NOTES] GET - User: ${req.user.username}`);
    try {
        const notes = await Note.find().sort({ createdAt: -1 });
        console.log(`   📦 Found: ${notes.length} notes`);
        res.json({ success: true, notes });
    } catch (error) {
        console.error('❌ [NOTES] GET Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/notes', authenticate, async (req, res) => {
    console.log(`📝 [NOTES] POST - User: ${req.user.username}`);
    try {
        const note = new Note({
            ...req.body,
            createdBy: req.user._id
        });
        await note.save();
        console.log(`   ✅ Created: ${note.title}`);
        res.status(201).json({ success: true, note });
    } catch (error) {
        console.error('❌ [NOTES] POST Error:', error.message);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🤖 AI - CONFIGURATION ENDPOINT
// ============================================================

app.get('/api/config', authenticate, (req, res) => {
    console.log(`🔑 [CONFIG] User: ${req.user.username}`);
    res.json({
        success: true,
        deepseek: {
            apiKey: DEEPSEEK_API_KEY ? '***' : '',
            model: DEEPSEEK_MODEL,
            enabled: !!DEEPSEEK_API_KEY
        },
        gemini: {
            apiKey: GEMINI_API_KEY ? '***' : '',
            model: GEMINI_MODEL,
            enabled: !!GEMINI_API_KEY
        }
    });
});

// ============================================================
// 🤖 AI - DEEPSEEK CHAT
// ============================================================

app.post('/api/ai/deepseek', authenticate, async (req, res) => {
    console.log(`🤖 [DEEPSEEK] User: ${req.user.username}`);
    try {
        const { message, context } = req.body;
        
        if (!message) {
            return res.status(400).json({ success: false, error: 'الرسالة مطلوبة' });
        }

        if (!DEEPSEEK_API_KEY) {
            return res.status(503).json({ 
                success: false, 
                error: 'DeepSeek API غير متاح. يرجى إضافة مفتاح API في متغيرات البيئة.' 
            });
        }

        console.log(`   💬 Message: ${message.substring(0, 50)}...`);

        // إعداد السياق للـ AI
        let contextPrompt = '';
        if (context) {
            contextPrompt = `\n\nسياق الأسطول الحالي:\n${context}`;
        }

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: DEEPSEEK_MODEL,
                messages: [
                    {
                        role: 'system',
                        content: `أنت مساعد ذكي متخصص في الأسطول البحري. لديك معرفة عامة واسعة وتجيب على جميع الأسئلة.
                        
                        تعليمات:
                        1. أنت خبير في الشؤون البحرية والمراكب والصيانة.
                        2. لديك معرفة عامة في جميع المجالات.
                        3. أجب باللغة العربية الفصحى.
                        4. كن دقيقاً ومفصلاً في إجاباتك.
                        5. إذا لم تعرف الإجابة، قل ذلك بصراحة.`
                    },
                    {
                        role: 'user',
                        content: message + contextPrompt
                    }
                ],
                max_tokens: 2000,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ DeepSeek API Error:', errorData);
            
            if (response.status === 401) {
                return res.status(401).json({
                    success: false,
                    error: 'مفتاح DeepSeek غير صالح. يرجى التحقق من متغيرات البيئة.'
                });
            }
            
            return res.status(response.status).json({
                success: false,
                error: errorData.error?.message || 'خطأ في الاتصال بـ DeepSeek'
            });
        }

        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content || 'عذراً، لم أستطع معالجة طلبك.';

        console.log(`   🤖 Response: ${reply.substring(0, 40)}...`);

        res.json({
            success: true,
            response: reply,
            model: DEEPSEEK_MODEL
        });

    } catch (error) {
        console.error('❌ [DEEPSEEK] Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'خطأ في الاتصال بـ DeepSeek: ' + error.message
        });
    }
});

// ============================================================
// 🤖 AI - GEMINI CHAT
// ============================================================

app.post('/api/ai/gemini', authenticate, async (req, res) => {
    console.log(`🤖 [GEMINI] User: ${req.user.username}`);
    try {
        const { message, context } = req.body;
        
        if (!message) {
            return res.status(400).json({ success: false, error: 'الرسالة مطلوبة' });
        }

        if (!GEMINI_API_KEY) {
            return res.status(503).json({ 
                success: false, 
                error: 'Gemini API غير متاح. يرجى إضافة مفتاح API في متغيرات البيئة.' 
            });
        }

        console.log(`   💬 Message: ${message.substring(0, 50)}...`);

        // Gemini uses a different endpoint format
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: message + (context ? `\n\nسياق الأسطول الحالي:\n${context}` : '')
                    }]
                }],
                generationConfig: {
                    maxOutputTokens: 2000,
                    temperature: 0.7
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ Gemini API Error:', errorData);
            
            if (response.status === 403) {
                return res.status(401).json({
                    success: false,
                    error: 'مفتاح Gemini غير صالح. يرجى التحقق من متغيرات البيئة.'
                });
            }
            
            return res.status(response.status).json({
                success: false,
                error: errorData.error?.message || 'خطأ في الاتصال بـ Gemini'
            });
        }

        const data = await response.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'عذراً، لم أستطع معالجة طلبك.';

        console.log(`   🤖 Response: ${reply.substring(0, 40)}...`);

        res.json({
            success: true,
            response: reply,
            model: GEMINI_MODEL
        });

    } catch (error) {
        console.error('❌ [GEMINI] Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'خطأ في الاتصال بـ Gemini: ' + error.message
        });
    }
});

// ============================================================
// 🤖 AI - SMART ROUTER
// ============================================================

app.post('/api/ai/ask', authenticate, async (req, res) => {
    console.log(`🤖 [AI] Ask - User: ${req.user.username}`);
    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ success: false, error: 'الرسالة مطلوبة' });
        }
        console.log(`   💬 Message: ${message.substring(0, 50)}...`);

        // جلب بيانات السياق
        const vessels = await Vessel.find().lean();
        const maintenance = await Maintenance.find().lean();
        const totalVessels = vessels.length;
        const validVessels = vessels.filter(v => v.stat === 'صالح').length;
        const damagedVessels = vessels.filter(v => v.stat === 'معطب').length;
        const maintenanceVessels = vessels.filter(v => v.stat === 'صيانة').length;
        const efficiency = totalVessels ? Math.round((validVessels / totalVessels) * 100) : 0;

        const context = `
📊 بيانات الأسطول الحالية:
- إجمالي المراكب: ${totalVessels}
- الصالح: ${validVessels} (${efficiency}%)
- تحت الصيانة: ${maintenanceVessels}
- المعطوب: ${damagedVessels}

🔧 مهام الصيانة: ${maintenance.length}

📋 المراكب:
${vessels.map(v => `- ${v.name} (${v.num || 'بدون رقم'}) - ${v.stat} - ${v.region || 'بدون إقليم'}`).join('\n')}
`;

        // اختيار أفضل نموذج بناءً على توفر المفاتيح
        let reply = '';
        let usedModel = '';

        if (DEEPSEEK_API_KEY) {
            // استخدم DeepSeek
            const deepseekResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
                },
                body: JSON.stringify({
                    model: DEEPSEEK_MODEL,
                    messages: [
                        {
                            role: 'system',
                            content: `أنت مساعد ذكي متخصص في الأسطول البحري التونسي. لديك معرفة عامة واسعة وتجيب على جميع الأسئلة.
                            
                            معلومات النظام:
                            - المنظومة: منظومة متابعة الوسائل البحرية
                            - المطور: أمان الله ناجي
                            - الإصدار: v38.0
                            
                            تعليمات:
                            1. أنت خبير في الشؤون البحرية والمراكب والصيانة.
                            2. لديك معرفة عامة في جميع المجالات.
                            3. أجب باللغة العربية الفصحى أو بالعامية التونسية حسب سؤال المستخدم.
                            4. استخدم بيانات الأسطول في إجاباتك.
                            5. كن دقيقاً ومفصلاً.`
                        },
                        {
                            role: 'user',
                            content: `${message}\n\n${context}`
                        }
                    ],
                    max_tokens: 2000,
                    temperature: 0.7
                })
            });

            if (deepseekResponse.ok) {
                const data = await deepseekResponse.json();
                reply = data.choices?.[0]?.message?.content || '';
                usedModel = `DeepSeek (${DEEPSEEK_MODEL})`;
            }
        }

        // إذا فشل DeepSeek أو لم يكن متاحاً، جرب Gemini
        if (!reply && GEMINI_API_KEY) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
            const geminiResponse = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `${message}\n\n${context}`
                        }]
                    }],
                    generationConfig: {
                        maxOutputTokens: 2000,
                        temperature: 0.7
                    }
                })
            });

            if (geminiResponse.ok) {
                const data = await geminiResponse.json();
                reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                usedModel = `Gemini (${GEMINI_MODEL})`;
            }
        }

        // إذا فشل كلا النموذجين، استخدم الرد المحلي
        if (!reply) {
            const msg = message.toLowerCase();
            if (msg.includes('مرحبا') || msg.includes('السلام')) {
                reply = '👋 وعليكم السلام! كيف يمكنني مساعدتك في شؤون الأسطول البحري؟';
            } else if (msg.includes('الجاهزية') || msg.includes('نسبة')) {
                reply = `📈 نسبة جاهزية الأسطول: ${efficiency}% (${validVessels} من ${totalVessels})`;
            } else if (msg.includes('معطب') || msg.includes('عطل')) {
                reply = `⚠️ عدد المراكب المعطوبة: ${damagedVessels}\n${vessels.filter(v => v.stat === 'معطب').map(v => `- ${v.name}`).join('\n')}`;
            } else if (msg.includes('صيانة')) {
                reply = `🔧 عدد المراكب تحت الصيانة: ${maintenanceVessels}\nعدد مهام الصيانة: ${maintenance.length}`;
            } else {
                reply = `📌 يمكنني مساعدتك في:\n- عرض إحصائيات الأسطول\n- نسبة الجاهزية\n- المراكب المعطوبة\n- مهام الصيانة\n- معلومات عامة`;
            }
            usedModel = 'Local (Offline)';
        }

        console.log(`   🤖 Used: ${usedModel}`);
        console.log(`   🤖 Response: ${reply.substring(0, 40)}...`);

        res.json({
            success: true,
            response: reply,
            model: usedModel
        });

    } catch (error) {
        console.error('❌ [AI] Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'خطأ في معالجة الطلب: ' + error.message
        });
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
            const defaultHtml = `
                <div class="page-content active">
                    <h2 style="color:#60a5fa;">📄 صفحة ${pageName}</h2>
                    <p style="color:rgba(255,255,255,0.3);">المحتوى قيد التطوير...</p>
                    <button class="btn btn-primary" onclick="showPage('dashboard')" style="margin-top:16px;">📊 العودة</button>
                </div>
            `;
            res.json({ success: true, html: defaultHtml });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🏠 HOME
// ============================================================

app.get('/', (req, res) => {
    console.log(`🏠 [HOME] GET - IP: ${req.ip || req.socket.remoteAddress || 'unknown'}`);
    res.sendFile(path.join(publicPath, 'index.html'));
});

// ============================================================
// ❌ 404
// ============================================================

app.use('/api', (req, res) => {
    console.warn(`❌ [404] API not found: ${req.method} ${req.url}`);
    res.status(404).json({ success: false, error: 'API not found' });
});

app.use((req, res) => {
    if (req.method === 'GET') {
        return res.sendFile(path.join(publicPath, 'index.html'));
    }
    res.status(404).json({ success: false, error: 'Not found' });
});

// ============================================================
// 💥 ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
    console.error('❌ [ERROR]', err.message);
    console.error('   Stack:', err.stack);
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

    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log('');
        console.log('='.repeat(60));
        console.log('🚢 MARINE SYSTEM v38.1 - AI INTEGRATED');
        console.log('🚀 SERVER STARTED');
        console.log('='.repeat(60));
        console.log(`🌍 Environment: ${NODE_ENV}`);
        console.log(`🚀 Port: ${PORT}`);
        console.log('🗄️ MongoDB: Connected ✅');
        console.log('🔐 JWT: Enabled');
        console.log('🛡️ Security: Enabled');
        console.log('❤️ Health: /health');
        console.log('🤖 AI Endpoints:');
        console.log('   - GET  /api/config       (AI Configuration)');
        console.log('   - POST /api/ai/ask       (Smart AI Router)');
        console.log('   - POST /api/ai/deepseek  (DeepSeek API)');
        console.log('   - POST /api/ai/gemini    (Gemini API)');
        console.log('='.repeat(60));
        console.log('🔑 LOGIN:');
        console.log('   👤 Username: admin');
        console.log('   🔑 Password: from ADMIN_PASSWORD in Render');
        console.log('='.repeat(60));
        console.log('✅ All issues fixed - Production Ready');
        console.log('📡 All requests will be logged in Render console');
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

    process.on('SIGINT', () => {
        console.log('🛑 SIGINT received. Shutting down...');
        server.close(() => {
            mongoose.connection.close();
            console.log('✅ Server closed');
            process.exit(0);
        });
    });
}

startServer();

module.exports = app;
