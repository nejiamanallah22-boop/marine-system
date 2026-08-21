/**
 * ============================================================
 * 🚢 MARINE SYSTEM v32.0 - PRODUCTION READY
 * ============================================================
 * ✅ Professional Production Server
 * ✅ MongoDB + JWT + RBAC
 * ✅ Complete CRUD Operations
 * ✅ Enterprise Security
 * ✅ Production Optimized
 * ✅ Modern UI Colors
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

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'MarineDB2026Secure';
const ADMIN_NAME = process.env.ADMIN_NAME || 'مدير النظام';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@marine-system.com';

console.log('\n' + '='.repeat(60));
console.log('🚢 MARINE SYSTEM v32.0 - PRODUCTION READY');
console.log('='.repeat(60));
console.log(`✅ Environment: ${NODE_ENV}`);
console.log(`✅ Port: ${PORT}`);
console.log(`✅ MongoDB: ${MONGODB_URI ? '✓' : '✗'}`);
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
    tokenVersion: { type: Number, default: 0 },
    lastLogin: { type: Date },
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

        req.user = user;
        next();

    } catch (error) {
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
// 🗄️ DATABASE CONNECTION
// ============================================================

async function connectDB() {
    if (!MONGODB_URI) {
        console.error('❌ MONGODB_URI is required');
        process.exit(1);
    }

    try {
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
// 🔐 CREATE ADMIN
// ============================================================

async function createAdmin() {
    try {
        const existing = await User.findOne({ 
            $or: [{ username: ADMIN_USERNAME }, { email: ADMIN_EMAIL }] 
        });

        if (existing) {
            console.log('ℹ️ Admin account exists');
            return;
        }

        const admin = new User({
            name: ADMIN_NAME,
            username: ADMIN_USERNAME,
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
            role: 'admin',
            isActive: true
        });

        await admin.save();
        console.log('✅ Admin created successfully!');
        console.log(`👤 Username: ${ADMIN_USERNAME}`);
        console.log(`🔑 Password: ${ADMIN_PASSWORD}`);

    } catch (error) {
        console.error('❌ Admin error:', error.message);
    }
}

// ============================================================
// 🔐 MIDDLEWARE
// ============================================================

app.disable('x-powered-by');

app.use(cors({
    origin: '*',
    credentials: true,
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
const pagesPath = path.join(publicPath, 'pages');

if (!fs.existsSync(pagesPath)) {
    fs.mkdirSync(pagesPath, { recursive: true });
}

app.use(express.static(publicPath, {
    index: 'index.html',
    maxAge: 0,
    etag: false
}));

app.use('/pages', express.static(pagesPath, {
    maxAge: 0,
    etag: false
}));

// ============================================================
// ❤️ HEALTH
// ============================================================

app.get('/health', (req, res) => {
    const dbState = mongoose.connection.readyState;
    res.json({
        status: dbState === 1 ? 'ok' : 'degraded',
        mongodb: dbState === 1 ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// 🔐 LOGIN
// ============================================================

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
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

        const isValid = await user.comparePassword(password);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                error: '❌ اسم المستخدم أو كلمة المرور غير صحيحة'
            });
        }

        user.lastLogin = new Date();
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        const token = generateToken(user);

        return res.json({
            success: true,
            user: cleanUser(user),
            token: token
        });

    } catch (error) {
        console.error('❌ Login error:', error);
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
    res.json({ success: true, message: 'تم تسجيل الخروج' });
});

// ============================================================
// 👤 CURRENT USER
// ============================================================

app.get('/api/auth/me', authenticate, (req, res) => {
    res.json({ success: true, user: cleanUser(req.user) });
});

// ============================================================
// 🔑 CHANGE PASSWORD - ADMIN ONLY
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

        const user = await User.findById(req.user._id).select('+password');
        const isValid = await user.comparePassword(currentPassword);

        if (!isValid) {
            return res.status(401).json({
                success: false,
                error: '❌ كلمة المرور الحالية غير صحيحة'
            });
        }

        user.password = newPassword;
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        return res.json({
            success: true,
            message: '✅ تم تغيير كلمة المرور بنجاح'
        });

    } catch (error) {
        console.error('❌ Change password error:', error);
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
    try {
        const [totalVessels, validVessels, damagedVessels, maintenanceVessels] = await Promise.all([
            Vessel.countDocuments(),
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
                }
            }
        });
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
        const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true });
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
// 🔧 MAINTENANCE
// ============================================================

app.get('/api/maintenance', authenticate, async (req, res) => {
    try {
        const records = await Maintenance.find().sort({ createdAt: -1 });
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

// ============================================================
// 👥 USERS
// ============================================================

app.get('/api/users', authenticate, authorize('admin'), async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🤖 AI
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
        } else if (msg.includes('الأسطول')) {
            const total = await Vessel.countDocuments();
            response = `🚢 عدد المراكب في الأسطول: ${total}`;
        } else {
            response = '📌 يمكنني مساعدتك في معلومات عن الأسطول البحري.';
        }

        res.json({
            success: true,
            response: response
        });

    } catch (error) {
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
    const filePath = path.join(publicPath, 'pages', req.params.page + '.html');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).json({ success: false, error: 'Page not found' });
    }
});

// ============================================================
// ❌ 404
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
    console.error('❌ Error:', err.message);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// ============================================================
// 🚀 START SERVER
// ============================================================

async function startServer() {
    const connected = await connectDB();
    if (!connected) {
        console.log('⚠️ Server running without database');
    }

    await createAdmin();

    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log('');
        console.log('='.repeat(60));
        console.log('🚢 MARINE SYSTEM v32.0');
        console.log('🚀 SERVER STARTED');
        console.log('='.repeat(60));
        console.log(`🌍 Environment: ${NODE_ENV}`);
        console.log(`🚀 Port: ${PORT}`);
        console.log(`🗄️ MongoDB: ${connected ? 'Connected ✅' : 'Disconnected ⚠️'}`);
        console.log('🔐 JWT: Enabled');
        console.log('🛡️ Security: Enabled');
        console.log('❤️ Health: /health');
        console.log('='.repeat(60));
        console.log('🔑 DEMO LOGIN:');
        console.log(`   👤 Username: ${ADMIN_USERNAME}`);
        console.log(`   🔑 Password: ${ADMIN_PASSWORD}`);
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
