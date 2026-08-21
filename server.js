/**
 * ============================================================
 * 🚢 MARINE SYSTEM - SERVER v33.0 (COMPLETE)
 * ============================================================
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// 📦 MODELS
// ============================================================

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'manager', 'viewer'], default: 'viewer' },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

UserSchema.methods.comparePassword = async function(candidate) {
    return bcrypt.compare(candidate, this.password);
};

const User = mongoose.model('User', UserSchema);

// ============================================================
// 🚢 VESSEL MODEL
// ============================================================

const VesselSchema = new mongoose.Schema({
    name: { type: String, required: true },
    num: { type: String },
    stat: { type: String, enum: ['صالح', 'معطب', 'صيانة'], default: 'صالح' },
    region: { type: String, enum: ['الشمال', 'الساحل', 'الوسط', 'الجنوب'] },
    port: { type: String },
    cat: { type: String },
    len: { type: Number },
    createdAt: { type: Date, default: Date.now }
});

const Vessel = mongoose.model('Vessel', VesselSchema);

// ============================================================
// 🧰 HELPERS
// ============================================================

function generateToken(user) {
    return jwt.sign(
        { id: user._id.toString(), role: user.role },
        process.env.JWT_SECRET || 'secret-key',
        { expiresIn: '7d' }
    );
}

function cleanUser(user) {
    return {
        id: user._id.toString(),
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive
    };
}

// ============================================================
// 🔐 AUTH MIDDLEWARE
// ============================================================

async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
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
// 🌐 MIDDLEWARE
// ============================================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// ❤️ HEALTH
// ============================================================

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// 🔐 LOGIN - ✅ هذا المسار مهم
// ============================================================

app.post('/api/auth/login', async (req, res) => {
    console.log('📡 Login attempt:', req.body);

    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: '⚠️ اسم المستخدم وكلمة المرور مطلوبان'
            });
        }

        const user = await User.findOne({
            $or: [{ username: username.toLowerCase() }, { email: username.toLowerCase() }]
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
// 🔐 LOGOUT
// ============================================================

app.post('/api/auth/logout', authenticate, (req, res) => {
    res.json({ success: true, message: 'تم تسجيل الخروج' });
});

// ============================================================
// 👤 CURRENT USER
// ============================================================

app.get('/api/auth/me', authenticate, (req, res) => {
    res.json({ success: true, user: cleanUser(req.user) });
});

// ============================================================
// 🔑 CHANGE PASSWORD
// ============================================================

app.put('/api/auth/change-password', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword || newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                error: '⚠️ كلمة المرور الحالية مطلوبة والجديدة يجب أن تكون 8 أحرف'
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
        await user.save();

        return res.json({
            success: true,
            message: '✅ تم تغيير كلمة المرور بنجاح'
        });

    } catch (error) {
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
        const total = await Vessel.countDocuments();
        const valid = await Vessel.countDocuments({ stat: 'صالح' });
        const damaged = await Vessel.countDocuments({ stat: 'معطب' });
        const maintenance = await Vessel.countDocuments({ stat: 'صيانة' });

        res.json({
            success: true,
            data: {
                vessels: { total, valid, damaged, maintenance }
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
        if (!vessel) return res.status(404).json({ success: false, error: 'غير موجود' });
        res.json({ success: true, vessel });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.delete('/api/vessels/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndDelete(req.params.id);
        if (!vessel) return res.status(404).json({ success: false, error: 'غير موجود' });
        res.json({ success: true, message: 'تم الحذف' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 👥 USERS
// ============================================================

app.get('/api/users', authenticate, authorize('admin'), async (req, res) => {
    try {
        const users = await User.find().select('-password');
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

        const total = await Vessel.countDocuments();
        const valid = await Vessel.countDocuments({ stat: 'صالح' });

        let response = 'عذراً، لم أستطع فهم سؤالك.';
        const msg = message.toLowerCase();

        if (msg.includes('مرحبا') || msg.includes('السلام')) {
            response = '👋 وعليكم السلام! كيف يمكنني مساعدتك؟';
        } else if (msg.includes('الأسطول') || msg.includes('مراكب')) {
            response = `🚢 عدد المراكب: ${total}\n✅ الصالح: ${valid}`;
        } else if (msg.includes('مساعدة')) {
            response = '📚 يمكنني مساعدتك في:\n• إحصائيات الأسطول\n• الصيانة\n• التقارير';
        } else {
            response = '💡 اسألني عن: مرحبا، الأسطول، مساعدة';
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
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// 🔐 CREATE ADMIN
// ============================================================

async function createAdmin() {
    try {
        const existing = await User.findOne({ username: 'admin' });
        if (existing) {
            console.log('ℹ️ Admin already exists');
            return;
        }

        const admin = new User({
            name: 'مدير النظام',
            username: 'admin',
            email: 'admin@marine-system.com',
            password: process.env.ADMIN_PASSWORD || 'MarineDB2026Secure',
            role: 'admin',
            isActive: true
        });

        await admin.save();
        console.log('✅ Admin created!');
        console.log('👤 Username: admin');
        console.log(`🔑 Password: ${process.env.ADMIN_PASSWORD || 'MarineDB2026Secure'}`);
    } catch (error) {
        console.error('❌ Admin error:', error.message);
    }
}

// ============================================================
// 🚀 START
// ============================================================

async function start() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/marine_system');
        console.log('✅ MongoDB Connected');

        await createAdmin();

        app.listen(PORT, () => {
            console.log('');
            console.log('='.repeat(60));
            console.log('🚢 MARINE SYSTEM v33.0');
            console.log('🚀 SERVER STARTED');
            console.log('='.repeat(60));
            console.log(`🌍 PORT: ${PORT}`);
            console.log('🔐 JWT: Enabled');
            console.log('❤️ Health: /health');
            console.log('🔑 Login: POST /api/auth/login');
            console.log('='.repeat(60));
            console.log('👤 admin');
            console.log(`🔑 ${process.env.ADMIN_PASSWORD || 'MarineDB2026Secure'}`);
            console.log('='.repeat(60));
            console.log('');
        });

    } catch (error) {
        console.error('❌ Failed to start:', error.message);
        process.exit(1);
    }
}

start();

module.exports = app;
