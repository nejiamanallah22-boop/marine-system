/**
 * ============================================================
 * 🚢 MARINE SYSTEM - ENTERPRISE BACKEND
 * @version 8.0.0
 * ============================================================
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// 🔐 MIDDLEWARE
// ============================================================

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ============================================================
// ⏱️ RATE LIMITING
// ============================================================

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'طلبات كثيرة جداً' }
});
app.use('/api/', limiter);

// ============================================================
// 🗄️ MONGODB CONNECTION
// ============================================================

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/marine';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ متصل بـ MongoDB'))
.catch(err => console.error('❌ خطأ في الاتصال:', err));

// ============================================================
// 📦 MODELS
// ============================================================

// 👤 نموذج المستخدم
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['super_admin', 'admin', 'user', 'operator', 'viewer'], default: 'user' },
    unit: { type: String, default: 'غير محدد' },
    status: { type: String, enum: ['نشط', 'غير نشط'], default: 'نشط' },
    faceVerified: { type: Boolean, default: false },
    faceImage: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// 🚢 نموذج المركب
const VesselSchema = new mongoose.Schema({
    name: { type: String, required: true },
    num: { type: String, required: true },
    len: { type: Number, required: true },
    region: { type: String, required: true },
    zone: { type: String, required: true },
    port: { type: String, default: '-' },
    supp: { type: String, default: '-' },
    stat: { type: String, enum: ['صالح', 'معطب', 'صيانة'], default: 'صالح' },
    break: { type: String, default: '-' },
    fDate: { type: String, default: '' },
    eDate: { type: String, default: '' },
    ref: { type: String, default: '' },
    repairUnit: { type: String, default: '' },
    cat: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const Vessel = mongoose.model('Vessel', VesselSchema);

// 🔧 نموذج الصيانة
const MaintenanceSchema = new mongoose.Schema({
    vesselId: { type: String, required: true },
    vesselName: { type: String, required: true },
    type: { type: String, enum: ['دورية', 'طارئة', 'وقائية', 'إصلاح شامل'], default: 'دورية' },
    status: { type: String, enum: ['مكتملة', 'قيد التنفيذ', 'قيد الانتظار', 'متأخرة'], default: 'قيد الانتظار' },
    cost: { type: Number, default: 0 },
    date: { type: String, default: '' },
    technician: { type: String, default: '' },
    description: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});
const Maintenance = mongoose.model('Maintenance', MaintenanceSchema);

// ============================================================
// 🔐 AUTH MIDDLEWARE
// ============================================================

const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ success: false, error: 'غير مسجل الدخول' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({ success: false, error: 'مستخدم غير موجود' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'جلسة غير صالحة' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'غير مصدق' });
        }
        if (roles.length > 0 && !roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'ليس لديك صلاحية' });
        }
        next();
    };
};

// ============================================================
// 🏥 HEALTH CHECK
// ============================================================

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '8.0.0'
    });
});

// ============================================================
// 🔐 AUTH ROUTES
// ============================================================

// تسجيل الدخول
app.post('/api/auth/login', [
    body('username').trim().notEmpty().withMessage('اسم المستخدم مطلوب'),
    body('password').notEmpty().withMessage('كلمة المرور مطلوبة')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { username, password } = req.body;

    try {
        const user = await User.findOne({ email: username });
        if (!user) {
            return res.status(401).json({ success: false, error: 'بيانات غير صحيحة' });
        }

        if (user.status === 'غير نشط') {
            return res.status(403).json({ success: false, error: 'الحساب معطل' });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ success: false, error: 'بيانات غير صحيحة' });
        }

        const token = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'secret_key',
            { expiresIn: '7d' }
        );

        // 2FA للمدراء فقط (محاكاة)
        if (user.role === 'super_admin' || user.role === 'admin') {
            return res.json({
                success: true,
                requiresOtp: true,
                transactionId: 'mock_txn_' + Date.now(),
                message: 'تم إرسال رمز التحقق (استخدم 123456)'
            });
        }

        res.json({
            success: true,
            token: token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                unit: user.unit,
                status: user.status,
                faceVerified: user.faceVerified
            }
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
    }
});

// التحقق من 2FA
app.post('/api/auth/verify-otp', [
    body('transactionId').notEmpty(),
    body('otp').isLength({ min: 6, max: 6 })
], async (req, res) => {
    const { transactionId, otp } = req.body;

    if (otp !== '123456') {
        return res.status(401).json({ success: false, error: 'رمز غير صحيح' });
    }

    try {
        const user = await User.findOne({ email: 'admin@marine.tn' });
        if (!user) {
            return res.status(404).json({ success: false, error: 'مستخدم غير موجود' });
        }

        const token = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'secret_key',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token: token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                unit: user.unit,
                status: user.status,
                faceVerified: user.faceVerified
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, error: 'حدث خطأ' });
    }
});

// الحصول على معلومات المستخدم الحالي
app.get('/api/auth/me', authenticate, async (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            unit: req.user.unit,
            status: req.user.status,
            faceVerified: req.user.faceVerified
        }
    });
});

// تسجيل الخروج
app.post('/api/auth/logout', authenticate, (req, res) => {
    res.json({ success: true, message: 'تم تسجيل الخروج' });
});

// ============================================================
// 👤 USERS ROUTES - إدارة المستخدمين (مع المصادقة)
// ============================================================

// 📋 جلب جميع المستخدمين
app.get('/api/users', authenticate, authorize('super_admin', 'admin'), async (req, res) => {
    try {
        const users = await User.find({}).select('-password');
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ➕ إضافة مستخدم جديد
app.post('/api/users', authenticate, authorize('super_admin', 'admin'), [
    body('name').notEmpty().withMessage('الاسم مطلوب'),
    body('email').isEmail().withMessage('بريد غير صالح'),
    body('password').isLength({ min: 6 }).withMessage('كلمة المرور 6 أحرف على الأقل')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    try {
        const { name, email, password, role, unit, status } = req.body;

        // التحقق من عدم وجود البريد
        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(400).json({ success: false, error: 'البريد موجود مسبقاً' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            name,
            email,
            password: hashedPassword,
            role: role || 'user',
            unit: unit || 'غير محدد',
            status: status || 'نشط'
        });

        await user.save();

        res.json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                unit: user.unit,
                status: user.status,
                faceVerified: user.faceVerified
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✏️ تحديث مستخدم
app.put('/api/users/:id', authenticate, authorize('super_admin', 'admin'), async (req, res) => {
    try {
        const { name, email, role, unit, status } = req.body;
        
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'مستخدم غير موجود' });
        }

        if (name) user.name = name;
        if (email) user.email = email;
        if (role) user.role = role;
        if (unit) user.unit = unit;
        if (status) user.status = status;
        user.updatedAt = new Date();

        await user.save();

        res.json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                unit: user.unit,
                status: user.status,
                faceVerified: user.faceVerified
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🗑️ حذف مستخدم
app.delete('/api/users/:id', authenticate, authorize('super_admin'), async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'تم الحذف' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔑 تغيير كلمة المرور
app.post('/api/users/:id/password', authenticate, authorize('super_admin', 'admin'), [
    body('password').isLength({ min: 6 }).withMessage('كلمة المرور 6 أحرف على الأقل')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    try {
        const { password } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'مستخدم غير موجود' });
        }

        user.password = await bcrypt.hash(password, 10);
        user.updatedAt = new Date();
        await user.save();

        res.json({ success: true, message: 'تم تغيير كلمة المرور' });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🚢 VESSELS ROUTES
// ============================================================

app.get('/api/vessels', authenticate, async (req, res) => {
    try {
        const vessels = await Vessel.find({}).sort({ createdAt: -1 });
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/vessels', authenticate, authorize('super_admin', 'admin'), async (req, res) => {
    try {
        const vessel = new Vessel(req.body);
        await vessel.save();
        res.json({ success: true, vessel });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/vessels/:id', authenticate, authorize('super_admin', 'admin'), async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: new Date() },
            { new: true }
        );
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'مركب غير موجود' });
        }
        res.json({ success: true, vessel });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/vessels/:id', authenticate, authorize('super_admin', 'admin'), async (req, res) => {
    try {
        await Vessel.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'تم الحذف' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🔧 MAINTENANCE ROUTES
// ============================================================

app.get('/api/maintenance', authenticate, async (req, res) => {
    try {
        const records = await Maintenance.find({}).sort({ createdAt: -1 });
        res.json({ success: true, records });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/maintenance', authenticate, authorize('super_admin', 'admin'), async (req, res) => {
    try {
        const record = new Maintenance(req.body);
        await record.save();
        res.json({ success: true, record });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/maintenance/:id', authenticate, authorize('super_admin', 'admin'), async (req, res) => {
    try {
        const record = await Maintenance.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: new Date() },
            { new: true }
        );
        if (!record) {
            return res.status(404).json({ success: false, error: 'سجل غير موجود' });
        }
        res.json({ success: true, record });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/maintenance/:id', authenticate, authorize('super_admin', 'admin'), async (req, res) => {
    try {
        await Maintenance.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'تم الحذف' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🌱 SEED DATABASE - إنشاء المستخدم الأول
// ============================================================

app.post('/api/seed', async (req, res) => {
    try {
        const adminExists = await User.findOne({ email: 'admin@marine.tn' });
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await User.create({
                name: 'أمان الله ناجي',
                email: 'admin@marine.tn',
                password: hashedPassword,
                role: 'super_admin',
                unit: 'الإدارة العامة',
                status: 'نشط',
                faceVerified: true
            });
            console.log('✅ تم إنشاء المستخدم admin@marine.tn');
        }

        const vesselsCount = await Vessel.countDocuments();
        if (vesselsCount === 0) {
            await Vessel.insertMany([
                { name: 'الوحدة 101', num: '101', len: 11, region: 'الشمال', zone: 'تونس', port: 'الميناء', supp: 'القاعدة', stat: 'صالح' },
                { name: 'الوحدة 202', num: '202', len: 25, region: 'الساحل', zone: 'سوسة', port: 'الميناء', supp: 'القاعدة', stat: 'معطب', break: 'محرك', fDate: '2026-01-15' },
                { name: 'الوحدة 303', num: '303', len: 8, region: 'الوسط', zone: 'صفاقس', port: 'الميناء', supp: 'القاعدة', stat: 'صالح' },
                { name: 'الوحدة 404', num: '404', len: 30, region: 'الجنوب', zone: 'قابس', port: 'الميناء', supp: 'القاعدة', stat: 'صيانة', break: 'هيكل', fDate: '2026-01-10', eDate: '2026-02-10' },
                { name: 'الوحدة 505', num: '505', len: 12, region: 'الشمال', zone: 'بنزرت', port: 'الميناء', supp: 'القاعدة', stat: 'معطب', break: 'كهرباء', fDate: '2026-01-20' }
            ]);
            console.log('✅ تم إنشاء 5 مراكب افتراضية');
        }

        res.json({ success: true, message: 'تمت تهيئة البيانات بنجاح' });

    } catch (error) {
        console.error('❌ Seed error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🚀 START SERVER
// ============================================================

app.listen(PORT, async () => {
    console.log('========================================');
    console.log('🚢 MARINE SYSTEM - ENTERPRISE BACKEND');
    console.log('========================================');
    console.log(`📡 الخادم يعمل على: http://localhost:${PORT}`);
    console.log(`🔐 البيئة: ${process.env.NODE_ENV || 'development'}`);
    console.log('========================================');
    
    // تشغيل التهيئة التلقائية
    try {
        await fetch(`http://localhost:${PORT}/api/seed`, { method: 'POST' });
    } catch (e) {
        console.log('⏳ انتظار بدء الخادم...');
    }
});
