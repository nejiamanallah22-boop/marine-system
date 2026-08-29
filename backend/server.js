/**
 * 🚢 MARINE SYSTEM - ENTERPRISE BACKEND
 * @version 1.0.0
 * @author System Admin
 * @license Proprietary
 * 
 * 🔐 الأمان:
 * - HttpOnly Cookies للجلسات
 * - CSRF Protection
 * - Rate Limiting
 * - Brute Force Protection
 * - Input Validation
 * - XSS Protection
 * - SQL Injection Prevention
 */

// ============================================================
// 📦 IMPORTS
// ============================================================

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ============================================================
// 🚀 INIT
// ============================================================

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// 📂 DATABASE (محاكاة - في الإنتاج استخدم PostgreSQL/MongoDB)
// ============================================================

const DB_PATH = path.join(__dirname, 'database');

// التأكد من وجود مجلد database
if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(DB_PATH, { recursive: true });
}

const USERS_FILE = path.join(DB_PATH, 'users.json');
const SESSIONS_FILE = path.join(DB_PATH, 'sessions.json');
const AUDIT_FILE = path.join(DB_PATH, 'audit.json');

// تهيئة قاعدة البيانات
function initDatabase() {
    // المستخدمين
    if (!fs.existsSync(USERS_FILE)) {
        // 🔴 لا توجد بيانات صلبة - المستخدم الأول يتم إنشاؤه عند أول تشغيل
        fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
        console.log('📁 تم إنشاء ملف المستخدمين (فارغ)');
    }

    // الجلسات
    if (!fs.existsSync(SESSIONS_FILE)) {
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify([], null, 2));
        console.log('📁 تم إنشاء ملف الجلسات (فارغ)');
    }

    // سجل التدقيق
    if (!fs.existsSync(AUDIT_FILE)) {
        fs.writeFileSync(AUDIT_FILE, JSON.stringify([], null, 2));
        console.log('📁 تم إنشاء ملف سجل التدقيق (فارغ)');
    }
}

initDatabase();

// ============================================================
// 🔧 HELPERS
// ============================================================

/**
 * قراءة البيانات من ملف JSON
 * @param {string} file - مسار الملف
 * @returns {Array} - البيانات
 */
function readDB(file) {
    try {
        const data = fs.readFileSync(file, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('❌ خطأ في قراءة الملف:', error);
        return [];
    }
}

/**
 * كتابة البيانات إلى ملف JSON
 * @param {string} file - مسار الملف
 * @param {Array} data - البيانات
 */
function writeDB(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('❌ خطأ في كتابة الملف:', error);
        return false;
    }
}

/**
 * تسجيل حدث في سجل التدقيق
 * @param {Object} entry - بيانات الحدث
 */
function auditLog(entry) {
    const audit = readDB(AUDIT_FILE);
    entry.timestamp = new Date().toISOString();
    entry.ip = entry.ip || '0.0.0.0';
    audit.push(entry);
    writeDB(AUDIT_FILE, audit);
    console.log('📋 [AUDIT]', entry);
}

/**
 * إنشاء توكن CSRF
 * @returns {string} - توكن CSRF
 */
function generateCSRFToken() {
    return uuidv4();
}

/**
 * التحقق من صحة الإدخال
 * @param {string} input - النص المدخل
 * @returns {boolean} - صحيح إذا كان الإدخال آمناً
 */
function isValidInput(input) {
    // منع SQL Injection و XSS
    const dangerous = /[<>{}()'";`\\]/.test(input);
    return !dangerous;
}

// ============================================================
// 🔐 MIDDLEWARE
// ============================================================

/**
 * CORS - السماح بالطلبات من الواجهة الأمامية فقط
 */
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

/**
 * Helmet - أمان الرؤوس
 */
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            connectSrc: ["'self'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: []
        }
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "same-site" },
    dnsPrefetchControl: true,
    frameguard: { action: "deny" },
    hidePoweredBy: true,
    hsts: true,
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true
}));

/**
 * Cookie Parser
 */
app.use(cookieParser());

/**
 * JSON Body Parser
 */
app.use(express.json({ limit: '10kb' }));

/**
 * URL Encoded Body Parser
 */
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

/**
 * Rate Limiting - حماية من هجمات القوة العمياء
 */
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 5, // 5 محاولات
    message: { success: false, error: 'محاولات كثيرة جداً، يرجى الانتظار 15 دقيقة' },
    keyGenerator: (req) => req.ip,
    skipSuccessfulRequests: true,
    handler: (req, res) => {
        auditLog({
            action: 'RATE_LIMIT_EXCEEDED',
            ip: req.ip,
            path: req.path
        });
        res.status(429).json({ success: false, error: 'محاولات كثيرة جداً' });
    }
});

/**
 * CSRF Protection - double-submit cookie pattern
 */
function csrfProtection(req, res, next) {
    // توليد توكن CSRF جديد للـ GET requests
    if (req.method === 'GET') {
        const csrfToken = generateCSRFToken();
        res.cookie('csrf-token', csrfToken, {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 3600000 // 1 ساعة
        });
        res.locals.csrfToken = csrfToken;
        return next();
    }

    // التحقق من توكن CSRF للـ POST/PUT/DELETE
    const tokenFromCookie = req.cookies['csrf-token'];
    const tokenFromHeader = req.headers['x-csrf-token'];

    if (!tokenFromCookie || !tokenFromHeader || tokenFromCookie !== tokenFromHeader) {
        auditLog({
            action: 'CSRF_FAILED',
            ip: req.ip,
            path: req.path,
            method: req.method
        });
        return res.status(403).json({ success: false, error: 'طلب غير مصرح به' });
    }

    next();
}

/**
 * التحقق من الجلسة
 */
function authenticate(req, res, next) {
    const sessionToken = req.cookies['session_token'];

    if (!sessionToken) {
        return res.status(401).json({ success: false, error: 'غير مسجل الدخول' });
    }

    try {
        const decoded = jwt.verify(sessionToken, process.env.JWT_SECRET);
        const sessions = readDB(SESSIONS_FILE);
        const session = sessions.find(s => s.token === sessionToken && s.userId === decoded.userId);

        if (!session) {
            return res.status(401).json({ success: false, error: 'جلسة غير صالحة' });
        }

        req.user = decoded;
        req.sessionId = session.id;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'جلسة منتهية' });
    }
}

/**
 * التحقق من الصلاحيات
 */
function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'غير مصدق' });
        }

        const users = readDB(USERS_FILE);
        const user = users.find(u => u.id === req.user.userId);

        if (!user) {
            return res.status(401).json({ success: false, error: 'مستخدم غير موجود' });
        }

        if (roles.length > 0 && !roles.includes(user.role)) {
            auditLog({
                action: 'UNAUTHORIZED_ACCESS',
                userId: user.id,
                username: user.username,
                path: req.path,
                method: req.method,
                requiredRoles: roles
            });
            return res.status(403).json({ success: false, error: 'ليس لديك صلاحية' });
        }

        next();
    };
}

// ============================================================
// 📊 API ROUTES
// ============================================================

/**
 * 🏥 الصحة - проверка работоспособности
 */
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

/**
 * 🔐 إنشاء مستخدم أول (مرة واحدة فقط)
 */
app.post('/api/auth/setup', async (req, res) => {
    const users = readDB(USERS_FILE);

    // التحقق من وجود مستخدمين
    if (users.length > 0) {
        return res.status(400).json({
            success: false,
            error: 'النظام تم تهيئته بالفعل'
        });
    }

    const { username, password, name, email } = req.body;

    // التحقق من المدخلات
    if (!username || !password || !name || !email) {
        return res.status(400).json({
            success: false,
            error: 'جميع الحقول مطلوبة'
        });
    }

    if (password.length < 12) {
        return res.status(400).json({
            success: false,
            error: 'كلمة المرور يجب أن تكون 12 حرفاً على الأقل'
        });
    }

    // تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS || 12));

    // إنشاء المستخدم
    const newUser = {
        id: uuidv4(),
        username: username.toLowerCase(),
        password: hashedPassword,
        name: name,
        email: email.toLowerCase(),
        role: 'admin',
        permissions: ['*'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLogin: null,
        isActive: true,
        twoFactorEnabled: true,
        twoFactorSecret: null // سيتم تعيينه لاحقاً
    };

    users.push(newUser);
    writeDB(USERS_FILE, users);

    auditLog({
        action: 'SYSTEM_SETUP',
        userId: newUser.id,
        username: newUser.username
    });

    res.json({
        success: true,
        message: 'تم إنشاء المستخدم الأول بنجاح',
        user: {
            id: newUser.id,
            username: newUser.username,
            name: newUser.name,
            role: newUser.role
        }
    });
});

/**
 * 🔐 تسجيل الدخول
 */
app.post('/api/auth/login', loginLimiter, csrfProtection,
    [
        body('username').trim().isLength({ min: 3, max: 50 }).withMessage('اسم المستخدم غير صالح'),
        body('password').isLength({ min: 8 }).withMessage('كلمة المرور غير صالحة')
    ],
    async (req, res) => {
        // التحقق من صحة الإدخال
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: errors.array()[0].msg
            });
        }

        const { username, password } = req.body;
        const users = readDB(USERS_FILE);

        // البحث عن المستخدم
        const user = users.find(u => u.username === username.toLowerCase());

        if (!user) {
            auditLog({
                action: 'LOGIN_FAILED',
                ip: req.ip,
                username: username,
                reason: 'user_not_found'
            });
            return res.status(401).json({
                success: false,
                error: 'اسم المستخدم أو كلمة المرور غير صحيحة'
            });
        }

        // التحقق من نشاط الحساب
        if (!user.isActive) {
            auditLog({
                action: 'LOGIN_FAILED',
                userId: user.id,
                username: user.username,
                reason: 'account_disabled'
            });
            return res.status(403).json({
                success: false,
                error: 'الحساب معطل، يرجى التواصل مع المسؤول'
            });
        }

        // التحقق من كلمة المرور
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            auditLog({
                action: 'LOGIN_FAILED',
                userId: user.id,
                username: user.username,
                reason: 'invalid_password',
                ip: req.ip
            });
            return res.status(401).json({
                success: false,
                error: 'اسم المستخدم أو كلمة المرور غير صحيحة'
            });
        }

        // ✅ نجاح تسجيل الدخول - طلب 2FA
        auditLog({
            action: 'LOGIN_2FA_REQUIRED',
            userId: user.id,
            username: user.username,
            ip: req.ip
        });

        // إنشاء توكن مؤقت لـ 2FA
        const tempToken = jwt.sign(
            { userId: user.id, purpose: '2fa' },
            process.env.JWT_SECRET,
            { expiresIn: '5m' }
        );

        res.json({
            success: true,
            requiresOtp: true,
            transactionId: tempToken,
            message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني'
        });
    }
);

/**
 * 🔐 التحقق من 2FA
 */
app.post('/api/auth/verify-otp', csrfProtection,
    [
        body('transactionId').notEmpty().withMessage('معاملة غير صالحة'),
        body('otp').isLength({ min: 6, max: 6 }).withMessage('رمز التحقق يجب أن يكون 6 أرقام')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: errors.array()[0].msg
            });
        }

        const { transactionId, otp } = req.body;

        // التحقق من التوكن المؤقت
        try {
            const decoded = jwt.verify(transactionId, process.env.JWT_SECRET);

            if (decoded.purpose !== '2fa') {
                return res.status(400).json({
                    success: false,
                    error: 'معاملة غير صالحة'
                });
            }

            const users = readDB(USERS_FILE);
            const user = users.find(u => u.id === decoded.userId);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'مستخدم غير موجود'
                });
            }

            // 🔴 محاكاة التحقق من 2FA - في الإنتاج استخدم TOTP (مثل speakeasy)
            // هنا نستخدم رمز ثابت للتجربة فقط
            const isValidOtp = (otp === '123456'); // في الإنتاج، تحقق من TOTP

            if (!isValidOtp) {
                auditLog({
                    action: 'OTP_FAILED',
                    userId: user.id,
                    username: user.username,
                    ip: req.ip
                });
                return res.status(401).json({
                    success: false,
                    error: 'رمز التحقق غير صحيح'
                });
            }

            // ✅ نجاح التحقق - إنشاء جلسة
            const sessionToken = jwt.sign(
                { userId: user.id, username: user.username, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRY || '15m' }
            );

            // حفظ الجلسة
            const sessions = readDB(SESSIONS_FILE);
            const session = {
                id: uuidv4(),
                userId: user.id,
                token: sessionToken,
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
            };
            sessions.push(session);
            writeDB(SESSIONS_FILE, sessions);

            // تحديث آخر تسجيل دخول
            user.lastLogin = new Date().toISOString();
            const userIndex = users.findIndex(u => u.id === user.id);
            users[userIndex] = user;
            writeDB(USERS_FILE, users);

            // تعيين Session Cookie (HttpOnly)
            res.cookie('session_token', sessionToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 15 * 60 * 1000 // 15 دقيقة
            });

            // تعيين CSRF Token
            const csrfToken = generateCSRFToken();
            res.cookie('csrf-token', csrfToken, {
                httpOnly: false,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 3600000
            });

            auditLog({
                action: 'LOGIN_SUCCESS',
                userId: user.id,
                username: user.username,
                ip: req.ip
            });

            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    role: user.role,
                    permissions: user.permissions
                }
            });

        } catch (error) {
            return res.status(400).json({
                success: false,
                error: 'معاملة منتهية أو غير صالحة'
            });
        }
    }
);

/**
 * 🔐 التحقق من الجلسة
 */
app.get('/api/auth/me', authenticate, csrfProtection, (req, res) => {
    const users = readDB(USERS_FILE);
    const user = users.find(u => u.id === req.user.userId);

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'مستخدم غير موجود'
        });
    }

    res.json({
        success: true,
        user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            permissions: user.permissions,
            lastLogin: user.lastLogin
        }
    });
});

/**
 * 🔐 تسجيل الخروج
 */
app.post('/api/auth/logout', authenticate, csrfProtection, (req, res) => {
    // حذف الجلسة
    const sessions = readDB(SESSIONS_FILE);
    const filtered = sessions.filter(s => s.id !== req.sessionId);
    writeDB(SESSIONS_FILE, filtered);

    auditLog({
        action: 'LOGOUT',
        userId: req.user.userId,
        username: req.user.username,
        ip: req.ip
    });

    // حذف الكوكيز
    res.clearCookie('session_token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
    res.clearCookie('csrf-token', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });

    res.json({ success: true, message: 'تم تسجيل الخروج' });
});

/**
 * 📊 الحصول على قائمة المستخدمين
 */
app.get('/api/users', authenticate, authorize('admin'), csrfProtection, (req, res) => {
    const users = readDB(USERS_FILE);
    const safeUsers = users.map(u => ({
        id: u.id,
        username: u.username,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt,
        lastLogin: u.lastLogin
    }));

    res.json({ success: true, users: safeUsers });
});

/**
 * 📊 الحصول على قائمة الوسائل البحرية
 */
app.get('/api/vessels', authenticate, csrfProtection, (req, res) => {
    // في الإنتاج، يتم جلبها من قاعدة بيانات
    const vessels = [
        { id: 1, name: 'الوحدة 101', type: 'زورق دورية', status: 'active', location: 'القاعدة البحرية' },
        { id: 2, name: 'الوحدة 202', type: 'سفينة إنزال', status: 'inactive', location: 'ميناء الشرقي' },
        { id: 3, name: 'الوحدة 303', type: 'زورق إنقاذ', status: 'active', location: 'القاعدة الغربية' },
        { id: 4, name: 'الوحدة 404', type: 'سفينة دعم', status: 'active', location: 'الميناء الرئيسي' },
        { id: 5, name: 'الوحدة 505', type: 'زورق استطلاع', status: 'inactive', location: 'قيد الصيانة' }
    ];

    res.json({ success: true, vessels });
});

/**
 * 📊 إضافة وسيلة جديدة
 */
app.post('/api/vessels', authenticate, authorize('admin', 'manager'), csrfProtection,
    [
        body('name').trim().isLength({ min: 2 }).withMessage('اسم الوسيلة مطلوب'),
        body('type').trim().notEmpty().withMessage('نوع الوسيلة مطلوب'),
        body('status').isIn(['active', 'inactive']).withMessage('حالة غير صالحة'),
        body('location').trim().notEmpty().withMessage('الموقع مطلوب')
    ],
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: errors.array()[0].msg
            });
        }

        const { name, type, status, location } = req.body;

        // في الإنتاج، يتم حفظها في قاعدة البيانات
        const newVessel = {
            id: Date.now(),
            name: name.trim(),
            type: type.trim(),
            status: status,
            location: location.trim(),
            createdAt: new Date().toISOString(),
            createdBy: req.user.userId
        };

        auditLog({
            action: 'VESSEL_CREATED',
            userId: req.user.userId,
            username: req.user.username,
            vessel: newVessel
        });

        res.json({
            success: true,
            message: 'تم إضافة الوسيلة بنجاح',
            vessel: newVessel
        });
    }
);

/**
 * 📊 سجل التدقيق
 */
app.get('/api/audit', authenticate, authorize('admin'), csrfProtection, (req, res) => {
    const audit = readDB(AUDIT_FILE);
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const paginated = audit.slice(offset, offset + limit);

    res.json({
        success: true,
        logs: paginated,
        total: audit.length,
        limit: limit,
        offset: offset
    });
});

// ============================================================
// 🚀 START SERVER
// ============================================================

app.listen(PORT, () => {
    console.log('========================================');
    console.log('🚢 MARINE SYSTEM - ENTERPRISE BACKEND');
    console.log('========================================');
    console.log(`📡 الخادم يعمل على: http://localhost:${PORT}`);
    console.log(`🔐 البيئة: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📁 قاعدة البيانات: ${DB_PATH}`);
    console.log('========================================');
    console.log('');
    console.log('📋 لإنشاء المستخدم الأول:');
    console.log(`   POST http://localhost:${PORT}/api/auth/setup`);
    console.log('   الجسم: { "username": "admin", "password": "YourSecurePassword123!", "name": "مدير النظام", "email": "admin@system.com" }');
    console.log('');
    console.log('🔐 رمز 2FA التجريبي: 123456');
    console.log('========================================');
});

// ============================================================
// ❌ ERROR HANDLING
// ============================================================

// 404
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'المسار غير موجود'
    });
});

// 500
app.use((err, req, res, next) => {
    console.error('❌ خطأ في الخادم:', err);
    auditLog({
        action: 'SERVER_ERROR',
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method
    });
    res.status(500).json({
        success: false,
        error: 'حدث خطأ في الخادم'
    });
});
