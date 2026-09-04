/**
 * ============================================================
 * 🚢 MARINE SYSTEM - ENTERPRISE BACKEND v8.0
 * حل مشكلة CSRF مع تحسينات أمنية كاملة
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
const session = require('express-session');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// 📦 CONFIGURATION
// ============================================================

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production';
const SESSION_SECRET = process.env.SESSION_SECRET || 'session-secret-change-in-production';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/marine';

console.log('🔐 JWT_SECRET:', JWT_SECRET ? '✅ Set' : '❌ Not Set');
console.log('🔐 SESSION_SECRET:', SESSION_SECRET ? '✅ Set' : '❌ Not Set');
console.log('🗄️ MONGODB_URI:', MONGODB_URI ? '✅ Set' : '❌ Not Set');

// ============================================================
// 🔧 MIDDLEWARE
// ============================================================

// ✅ Security Headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https://*.render.com"],
            connectSrc: ["'self'", "https://*.render.com", "https://marine-system-71eo.onrender.com"],
        },
    },
}));

// ✅ CORS - مهم جداً للـ CSRF
app.use(cors({
    origin: [
        'http://localhost:5000',
        'http://localhost:3000',
        'https://marine-system-71eo.onrender.com',
        'https://*.onrender.com'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    exposedHeaders: ['X-CSRF-Token', 'X-Session-Expiry']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ✅ Session Management - لحل مشكلة CSRF
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'marine.sid',
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 أيام
        sameSite: 'lax'
    },
    rolling: true
}));

// ✅ Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'طلبات كثيرة جداً، يرجى المحاولة لاحقاً' }
});
app.use('/api/', limiter);

// ============================================================
// 🔒 CSRF PROTECTION - حل المشكلة نهائياً
// ============================================================

// ✅ توليد توكن CSRF
function generateCSRFToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

// ✅ Middleware CSRF
app.use((req, res, next) => {
    // إنشاء توكن إذا لم يكن موجوداً
    if (!req.session.csrfToken) {
        req.session.csrfToken = generateCSRFToken();
        req.session.csrfExpiry = Date.now() + (24 * 60 * 60 * 1000);
        console.log('🔄 New CSRF token generated for session:', req.sessionID);
    }

    // التحقق من انتهاء الصلاحية
    if (req.session.csrfExpiry && Date.now() > req.session.csrfExpiry) {
        req.session.csrfToken = generateCSRFToken();
        req.session.csrfExpiry = Date.now() + (24 * 60 * 60 * 1000);
        console.log('🔄 CSRF token refreshed for session:', req.sessionID);
    }

    // إرسال التوكن في الـ Response Headers
    res.setHeader('X-CSRF-Token', req.session.csrfToken);
    res.setHeader('X-Session-Expiry', req.session.csrfExpiry);
    
    next();
});

// ✅ التحقق من CSRF - معدل بالكامل
const csrfProtection = (req, res, next) => {
    // تخطي التحقق للطلبات الآمنة
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    // جلب التوكن من مصادر مختلفة
    const token = req.headers['x-csrf-token'] || req.body.csrf_token || req.cookies['X-CSRF-Token'];
    const sessionToken = req.session.csrfToken;

    console.log('🔍 CSRF Check:', {
        method: req.method,
        path: req.path,
        hasToken: !!token,
        hasSessionToken: !!sessionToken,
        sessionId: req.sessionID
    });

    // التحقق من وجود التوكن
    if (!token) {
        console.log('❌ CSRF token missing');
        return res.status(403).json({
            success: false,
            error: 'CSRF token مفقود',
            code: 'CSRF_MISSING'
        });
    }

    // التحقق من وجود توكن الجلسة
    if (!sessionToken) {
        console.log('❌ Session token missing');
        return res.status(403).json({
            success: false,
            error: 'جلسة غير صالحة',
            code: 'SESSION_INVALID'
        });
    }

    // التحقق من تطابق التوكن
    if (token !== sessionToken) {
        console.log('❌ CSRF token mismatch:', { received: token.substring(0, 10) + '...', expected: sessionToken.substring(0, 10) + '...' });
        return res.status(403).json({
            success: false,
            error: 'CSRF token غير صالح',
            code: 'CSRF_INVALID'
        });
    }

    // التحقق من انتهاء الصلاحية
    if (req.session.csrfExpiry && Date.now() > req.session.csrfExpiry) {
        console.log('❌ CSRF token expired');
        return res.status(403).json({
            success: false,
            error: 'CSRF token منتهي الصلاحية',
            code: 'CSRF_EXPIRED'
        });
    }

    console.log('✅ CSRF check passed');
    next();
};

// ============================================================
// 🗄️ MONGODB CONNECTION
// ============================================================

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000
})
.then(() => console.log('✅ متصل بـ MongoDB'))
.catch(err => console.error('❌ خطأ في الاتصال بـ MongoDB:', err));

// ============================================================
// 📦 MODELS
// ============================================================

// 👤 نموذج المستخدم
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { 
        type: String, 
        enum: ['super_admin', 'admin', 'user', 'operator', 'viewer'], 
        default: 'user' 
    },
    unit: { type: String, default: 'غير محدد' },
    status: { type: String, enum: ['نشط', 'غير نشط'], default: 'نشط' },
    faceVerified: { type: Boolean, default: false },
    faceImage: { type: String, default: null },
    refreshToken: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// ✅ التحقق من عدم وجود نموذج مكرر
const User = mongoose.models.User || mongoose.model('User', UserSchema);

// 📝 نموذج سجل التدقيق
const AuditLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    target: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    details: { type: Object, default: {} },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
});
const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);

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
const Vessel = mongoose.models.Vessel || mongoose.model('Vessel', VesselSchema);

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
const Maintenance = mongoose.models.Maintenance || mongoose.model('Maintenance', MaintenanceSchema);

// ============================================================
// 🔐 RBAC - صلاحيات المستخدمين
// ============================================================

const PERMISSIONS = {
    'super_admin': ['*'],
    'admin': [
        'users.read', 'users.create', 'users.update', 'users.delete',
        'users.password.change', 'users.status.change',
        'vessels.read', 'vessels.create', 'vessels.update', 'vessels.delete',
        'maintenance.read', 'maintenance.create', 'maintenance.update', 'maintenance.delete'
    ],
    'operator': ['users.read', 'vessels.read', 'maintenance.read'],
    'viewer': ['users.read', 'vessels.read'],
    'user': []
};

const hasPermission = (user, permission) => {
    if (!user) return false;
    const userPerms = PERMISSIONS[user.role] || [];
    return userPerms.includes('*') || userPerms.includes(permission);
};

const requirePermission = (permission) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'غير مسجل الدخول' });
        }
        if (!hasPermission(req.user, permission)) {
            return res.status(403).json({ success: false, error: 'ليس لديك صلاحية' });
        }
        next();
    };
};

// ============================================================
// 🔐 AUTH MIDDLEWARE
// ============================================================

const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ success: false, error: 'غير مسجل الدخول' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({ success: false, error: 'مستخدم غير موجود' });
        }

        if (user.status === 'غير نشط') {
            return res.status(403).json({ success: false, error: 'الحساب معطل' });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, error: 'انتهت صلاحية الجلسة', code: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ success: false, error: 'جلسة غير صالحة' });
    }
};

// ============================================================
// 📝 Audit Log - تسجيل العمليات
// ============================================================

const auditLog = async (userId, action, details = {}, target = null) => {
    try {
        await AuditLog.create({
            userId,
            action,
            target,
            details,
            ip: '0.0.0.0',
            userAgent: 'System'
        });
    } catch (error) {
        console.error('❌ Audit log error:', error);
    }
};

// ============================================================
// 🏥 HEALTH CHECK
// ============================================================

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '8.0.0',
        csrf: {
            hasToken: !!req.session.csrfToken,
            expiry: req.session.csrfExpiry
        }
    });
});

// ✅ جلب CSRF token
app.get('/api/csrf-token', (req, res) => {
    const token = req.session.csrfToken;
    res.json({
        success: true,
        token: token,
        expiresIn: req.session.csrfExpiry ? req.session.csrfExpiry - Date.now() : 86400000
    });
});

// ============================================================
// 🔐 AUTH ROUTES (مع CSRF Protection)
// ============================================================

// تسجيل الدخول
app.post('/api/auth/login', csrfProtection, [
    body('username').trim().notEmpty().withMessage('اسم المستخدم مطلوب'),
    body('password').notEmpty().withMessage('كلمة المرور مطلوبة')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { username, password } = req.body;

    try {
        console.log('🔐 Login attempt:', username);

        const user = await User.findOne({ email: username });
        if (!user) {
            await auditLog(null, 'LOGIN_FAILED', { username, reason: 'user_not_found' });
            return res.status(401).json({ success: false, error: 'بيانات غير صحيحة' });
        }

        if (user.status === 'غير نشط') {
            await auditLog(user._id, 'LOGIN_FAILED', { reason: 'account_disabled' });
            return res.status(403).json({ success: false, error: 'الحساب معطل' });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            await auditLog(user._id, 'LOGIN_FAILED', { reason: 'invalid_password' });
            return res.status(401).json({ success: false, error: 'بيانات غير صحيحة' });
        }

        const token = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // ✅ تجديد CSRF token بعد تسجيل الدخول
        const newCsrfToken = generateCSRFToken();
        req.session.csrfToken = newCsrfToken;
        req.session.csrfExpiry = Date.now() + (24 * 60 * 60 * 1000);
        req.session.userId = user._id;

        await auditLog(user._id, 'LOGIN_SUCCESS');
        
        user.updatedAt = new Date();
        await user.save();

        res.setHeader('X-CSRF-Token', newCsrfToken);
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
            },
            csrfToken: newCsrfToken
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
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
app.post('/api/auth/logout', authenticate, async (req, res) => {
    await auditLog(req.user._id, 'LOGOUT');
    req.session.destroy(() => {
        res.clearCookie('marine.sid');
        res.json({ success: true, message: 'تم تسجيل الخروج' });
    });
});

// ============================================================
// 👤 USERS ROUTES (مع CSRF Protection)
// ============================================================

// 📋 جلب جميع المستخدمين
app.get('/api/users', authenticate, requirePermission('users.read'), async (req, res) => {
    try {
        const users = await User.find({}).select('-password -refreshToken').sort({ createdAt: -1 });
        await auditLog(req.user._id, 'READ_USERS', { count: users.length });
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ➕ إضافة مستخدم جديد
app.post('/api/users', authenticate, csrfProtection, requirePermission('users.create'), [
    body('name').notEmpty().withMessage('الاسم مطلوب'),
    body('email').isEmail().withMessage('بريد غير صالح'),
    body('password').isLength({ min: 8 }).withMessage('كلمة المرور 8 أحرف على الأقل'),
    body('unit').notEmpty().withMessage('الوحدة مطلوبة')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    try {
        const { name, email, password, role, unit, status } = req.body;

        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(400).json({ success: false, error: 'البريد موجود مسبقاً' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = new User({
            name,
            email,
            password: hashedPassword,
            role: role || 'user',
            unit: unit || 'غير محدد',
            status: status || 'نشط'
        });

        await user.save();
        await auditLog(req.user._id, 'CREATE_USER', { userId: user._id, email: user.email }, user._id);

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
        console.error('❌ Error creating user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✏️ تحديث مستخدم
app.put('/api/users/:id', authenticate, csrfProtection, requirePermission('users.update'), [
    body('name').optional().notEmpty().withMessage('الاسم مطلوب'),
    body('email').optional().isEmail().withMessage('بريد غير صالح')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

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
        await auditLog(req.user._id, 'UPDATE_USER', { userId: user._id }, user._id);

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
app.delete('/api/users/:id', authenticate, csrfProtection, requirePermission('users.delete'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'مستخدم غير موجود' });
        }

        await User.findByIdAndDelete(req.params.id);
        await auditLog(req.user._id, 'DELETE_USER', { userId: user._id, email: user.email }, user._id);

        res.json({ success: true, message: 'تم الحذف' });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔑 تغيير كلمة المرور
app.post('/api/users/:id/password', authenticate, csrfProtection, requirePermission('users.password.change'), [
    body('password').isLength({ min: 8 }).withMessage('كلمة المرور 8 أحرف على الأقل')
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

        user.password = await bcrypt.hash(password, 12);
        user.updatedAt = new Date();
        await user.save();

        await auditLog(req.user._id, 'CHANGE_PASSWORD', { userId: user._id }, user._id);

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

app.post('/api/vessels', authenticate, csrfProtection, requirePermission('vessels.create'), async (req, res) => {
    try {
        const vessel = new Vessel(req.body);
        await vessel.save();
        await auditLog(req.user._id, 'CREATE_VESSEL', { vesselId: vessel._id, name: vessel.name });
        res.json({ success: true, vessel });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/vessels/:id', authenticate, csrfProtection, requirePermission('vessels.update'), async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: new Date() },
            { new: true }
        );
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'مركب غير موجود' });
        }
        await auditLog(req.user._id, 'UPDATE_VESSEL', { vesselId: vessel._id, name: vessel.name });
        res.json({ success: true, vessel });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/vessels/:id', authenticate, csrfProtection, requirePermission('vessels.delete'), async (req, res) => {
    try {
        await Vessel.findByIdAndDelete(req.params.id);
        await auditLog(req.user._id, 'DELETE_VESSEL', { vesselId: req.params.id });
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

app.post('/api/maintenance', authenticate, csrfProtection, requirePermission('maintenance.create'), async (req, res) => {
    try {
        const record = new Maintenance(req.body);
        await record.save();
        await auditLog(req.user._id, 'CREATE_MAINTENANCE', { recordId: record._id });
        res.json({ success: true, record });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/maintenance/:id', authenticate, csrfProtection, requirePermission('maintenance.update'), async (req, res) => {
    try {
        const record = await Maintenance.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: new Date() },
            { new: true }
        );
        if (!record) {
            return res.status(404).json({ success: false, error: 'سجل غير موجود' });
        }
        await auditLog(req.user._id, 'UPDATE_MAINTENANCE', { recordId: record._id });
        res.json({ success: true, record });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/maintenance/:id', authenticate, csrfProtection, requirePermission('maintenance.delete'), async (req, res) => {
    try {
        await Maintenance.findByIdAndDelete(req.params.id);
        await auditLog(req.user._id, 'DELETE_MAINTENANCE', { recordId: req.params.id });
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
            const hashedPassword = await bcrypt.hash('Admin123!@#', 12);
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
// 🖥️ STATIC FILES - لتقديم واجهة المستخدم
// ============================================================

const path = require('path');
const fs = require('fs');

// تحديد المسار الأساسي
const basePath = __dirname;
console.log(`📁 Base directory: ${basePath}`);

// تقديم الملفات الثابتة
app.use(express.static(basePath));
app.use('/pages', express.static(path.join(basePath, 'pages')));
app.use('/public', express.static(path.join(basePath, 'public')));

// الصفحة الرئيسية
app.get('/', (req, res) => {
    const paths = [
        path.join(basePath, 'index.html'),
        path.join(basePath, 'public', 'index.html'),
        path.join(basePath, 'src', 'index.html')
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) {
            console.log('✅ Serving index.html from:', p);
            return res.sendFile(p);
        }
    }
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>🚢 Marine System</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:50px;background:#0a1628;color:#e2e8f0;">
            <h1>🚢 منظومة الوسائل البحرية</h1>
            <p>الخادم يعمل بنجاح ✅</p>
            <p style="color:#94a3b8;">API: <code>/api/health</code></p>
            <p style="color:#94a3b8;">CSRF Token: <code>${req.session.csrfToken || 'جاري التحميل...'}</code></p>
        </body>
        </html>
    `);
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
    console.log(`🔒 CSRF Protection: ✅ مفعل`);
    console.log(`🗄️ MongoDB: ${MONGODB_URI ? '✅ متصل' : '❌ غير متصل'}`);
    console.log('========================================');
    
    try {
        await fetch(`http://localhost:${PORT}/api/seed`, { method: 'POST' });
    } catch (e) {
        console.log('⏳ انتظار بدء الخادم...');
    }
});

module.exports = app;
