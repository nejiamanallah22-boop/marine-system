// ============================================================
// 🚢 MARINE SYSTEM - ENTERPRISE EDITION (PROFESSIONAL)
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
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// 🔐 CONFIGURATION
// ============================================================

function generateSecureKey(length = 64) {
    return crypto.randomBytes(length).toString('hex');
}

const isProduction = process.env.NODE_ENV === 'production';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/marine-system';

// ✅ Admin credentials
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_NAME = process.env.ADMIN_NAME || 'أمان الله ناجي';
const JWT_SECRET = process.env.JWT_SECRET || generateSecureKey(64);
const SESSION_SECRET = process.env.SESSION_SECRET || generateSecureKey(64);

// ✅ Email
const EMAIL_USER = process.env.EMAIL_USER || 'nejiamanallah22@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS;

console.log('=========================================');
console.log('🔐 ADMIN CREDENTIALS:');
console.log('👤 Username: ' + ADMIN_USERNAME);
console.log('🔑 Password: ' + ADMIN_PASSWORD);
console.log('=========================================');

// ============================================================
// 📊 MONGODB CONNECTION
// ============================================================

console.log('🔄 Connecting to MongoDB...');
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000
})
.then(() => {
    console.log('✅ MongoDB connected successfully!');
})
.catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    console.warn('⚠️ Continuing without MongoDB...');
});

// ============================================================
// 📊 MODELS
// ============================================================

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
    password: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    role: { type: String, enum: ['admin', 'manager', 'operator', 'viewer'], default: 'viewer' },
    permissions: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    twoFactorSecret: { type: String, default: null },
    twoFactorEnabled: { type: Boolean, default: false },
    loginAttempts: { type: Number, default: 0 },
    locked: { type: Boolean, default: false },
    lockedUntil: { type: Date, default: null },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
    lastLogin: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const VesselSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { type: String, required: true },
    status: { type: String, enum: ['ready', 'maintenance', 'offline'], default: 'ready' },
    location: { type: String, default: '—' },
    lastMaintenance: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const AuditLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true },
    details: { type: String },
    ip: { type: String },
    userAgent: { type: String },
    timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Vessel = mongoose.model('Vessel', VesselSchema);
const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

// ============================================================
// 📧 EMAIL
// ============================================================

let transporter = null;
if (EMAIL_USER && EMAIL_PASS) {
    try {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: EMAIL_USER, pass: EMAIL_PASS },
            tls: { rejectUnauthorized: false }
        });
        transporter.verify((error) => {
            if (error) console.error('❌ Email error:', error);
            else console.log('✅ Email ready: ' + EMAIL_USER);
        });
    } catch (error) {
        console.error('❌ Email setup error:', error);
    }
}

async function sendEmail(to, subject, html) {
    if (!transporter) return false;
    try {
        await transporter.sendMail({
            from: '"Marine System" <' + EMAIL_USER + '>',
            to: to,
            subject: subject,
            html: html
        });
        return true;
    } catch (error) {
        console.error('❌ Email send error:', error);
        return false;
    }
}

// ============================================================
// 🛡️ MIDDLEWARE
// ============================================================

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https:", "https://unpkg.com"],
            connectSrc: ["'self'", "https://*.onrender.com", "https://unpkg.com", "https://*.googleapis.com", "https://*.leafletjs.com", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https:", "data:", "https://fonts.gstatic.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
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
    exposedHeaders: ['X-CSRF-Token', 'X-Session-Expiry', 'X-Request-ID']
}));

app.use(compression());

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

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: '__Secure-marine.sid',
    cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: 'strict',
        domain: isProduction ? '.onrender.com' : undefined,
        path: '/'
    },
    rolling: true,
    proxy: isProduction
}));

app.use((req, res, next) => {
    req.requestId = generateSecureKey().substring(0, 16);
    res.setHeader('X-Request-ID', req.requestId);
    next();
});

app.use((req, res, next) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = generateSecureKey().substring(0, 32);
        req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
    }
    if (req.session.csrfExpiry && Date.now() > req.session.csrfExpiry) {
        req.session.csrfToken = generateSecureKey().substring(0, 32);
        req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
    }
    res.setHeader('X-CSRF-Token', req.session.csrfToken);
    res.setHeader('X-Session-Expiry', req.session.csrfExpiry);
    next();
});

const csrfProtection = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (['/api/auth/login', '/api/csrf-token'].includes(req.path)) return next();

    const token = req.headers['x-csrf-token'] || req.body.csrf_token;
    const sessionToken = req.session.csrfToken;
    if (!token || !sessionToken || token !== sessionToken) {
        return res.status(403).json({ success: false, error: 'CSRF token غير صالح' });
    }
    req.session.csrfToken = generateSecureKey().substring(0, 32);
    req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
    res.setHeader('X-CSRF-Token', req.session.csrfToken);
    next();
};

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
// 🔐 RBAC
// ============================================================

const permissions = {
    admin: ['create', 'read', 'update', 'delete', 'manage_users', 'manage_vessels', 'view_logs', 'manage_backups'],
    manager: ['create', 'read', 'update', 'manage_vessels'],
    operator: ['read', 'update'],
    viewer: ['read']
};

function checkPermission(role, action) {
    return permissions[role]?.includes(action) || false;
}

function requirePermission(action) {
    return async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ success: false, error: 'غير مصرح' });
            }
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await User.findById(decoded.id);
            if (!user || !user.active) {
                return res.status(401).json({ success: false, error: 'غير مصرح' });
            }
            if (!checkPermission(user.role, action)) {
                return res.status(403).json({ success: false, error: 'ليس لديك صلاحية' });
            }
            req.user = user;
            next();
        } catch (error) {
            res.status(401).json({ success: false, error: 'غير مصرح' });
        }
    };
}

// ============================================================
// 🔐 CREATE ADMIN - FIXED
// ============================================================

async function createAdminUser() {
    try {
        if (mongoose.connection.readyState !== 1) {
            console.warn('⚠️ MongoDB not ready, waiting...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        const adminExists = await User.findOne({ username: 'admin' });
        
        if (!adminExists) {
            const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 12);
            console.log('🔑 Admin password hash: ' + hashedPassword);
            
            const admin = new User({
                username: ADMIN_USERNAME,
                password: hashedPassword,
                name: ADMIN_NAME,
                email: 'admin@marine.com',
                role: 'admin',
                permissions: permissions.admin,
                active: true
            });
            await admin.save();
            console.log('✅ Admin user created successfully!');
            console.log('👤 Username: ' + ADMIN_USERNAME);
            console.log('🔑 Password: ' + ADMIN_PASSWORD);
        } else {
            // ✅ تحقق من كلمة المرور
            const isValid = bcrypt.compareSync(ADMIN_PASSWORD, adminExists.password);
            if (!isValid) {
                console.log('🔄 Updating admin password...');
                adminExists.password = bcrypt.hashSync(ADMIN_PASSWORD, 12);
                await adminExists.save();
                console.log('✅ Admin password updated!');
                console.log('🔑 New password: ' + ADMIN_PASSWORD);
            } else {
                console.log('✅ Admin password is valid');
            }
            console.log('✅ Admin user exists');
        }
    } catch (error) {
        console.error('❌ Error creating admin:', error);
    }
}

// ============================================================
// 🔐 AUTH ENDPOINTS
// ============================================================

app.get('/api/csrf-token', (req, res) => {
    res.json({ success: true, token: req.session.csrfToken });
});

// ✅ LOGIN - FIXED
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password, twoFactorToken } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;
        
        console.log('🔐 Login attempt: ' + username);

        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
        }

        const user = await User.findOne({ username });
        if (!user) {
            await AuditLog.create({ userId: null, action: 'LOGIN_FAILED', details: 'Invalid username: ' + username, ip: clientIP });
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        // ✅ التحقق من القفل
        if (user.locked && user.lockedUntil && Date.now() < user.lockedUntil) {
            const remaining = Math.ceil((user.lockedUntil - Date.now()) / 60000);
            return res.status(403).json({ success: false, error: 'الحساب مقفل. حاول بعد ' + remaining + ' دقائق' });
        }

        // ✅ التحقق من كلمة المرور
        const isValidPassword = bcrypt.compareSync(password, user.password);
        console.log('🔑 Password valid: ' + isValidPassword);

        if (!isValidPassword) {
            user.loginAttempts = (user.loginAttempts || 0) + 1;
            if (user.loginAttempts >= 5) {
                user.locked = true;
                user.lockedUntil = Date.now() + (30 * 60 * 1000);
                await user.save();
                await AuditLog.create({ userId: user._id, action: 'ACCOUNT_LOCKED', details: 'Too many failed attempts', ip: clientIP });
                return res.status(403).json({ success: false, error: 'الحساب مقفل لمدة 30 دقيقة' });
            }
            await user.save();
            await AuditLog.create({ userId: user._id, action: 'LOGIN_FAILED', details: 'Invalid password', ip: clientIP });
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        // ✅ 2FA Check
        if (user.twoFactorEnabled) {
            if (!twoFactorToken) {
                return res.status(200).json({
                    success: true,
                    requiresTwoFactor: true,
                    userId: user._id,
                    message: 'الرجاء إدخال رمز 2FA'
                });
            }
            const verified = speakeasy.totp.verify({
                secret: user.twoFactorSecret,
                encoding: 'base32',
                token: twoFactorToken,
                window: 2
            });
            if (!verified) {
                return res.status(401).json({ success: false, error: 'رمز 2FA غير صحيح' });
            }
        }

        // ✅ نجاح تسجيل الدخول
        user.loginAttempts = 0;
        user.locked = false;
        user.lockedUntil = null;
        user.lastLogin = new Date();
        await user.save();

        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        req.session.csrfToken = generateSecureKey().substring(0, 32);
        req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
        req.session.userId = user._id.toString();

        res.setHeader('X-CSRF-Token', req.session.csrfToken);
        await AuditLog.create({ userId: user._id, action: 'LOGIN_SUCCESS', details: 'Successful login', ip: clientIP });

        res.json({
            success: true,
            token: token,
            user: {
                id: user._id,
                username: user.username,
                name: user.name,
                email: user.email,
                role: user.role,
                permissions: user.permissions,
                twoFactorEnabled: user.twoFactorEnabled,
                active: user.active
            },
            csrfToken: req.session.csrfToken
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ✅ VERIFY TOKEN
app.get('/api/auth/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user || !user.active) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود' });
        }
        req.session.csrfToken = generateSecureKey().substring(0, 32);
        req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
        res.setHeader('X-CSRF-Token', req.session.csrfToken);
        res.json({
            success: true,
            user: {
                id: user._id,
                username: user.username,
                name: user.name,
                email: user.email,
                role: user.role,
                permissions: user.permissions,
                twoFactorEnabled: user.twoFactorEnabled,
                active: user.active
            }
        });
    } catch (error) {
        res.status(401).json({ success: false, error: 'توكن غير صالح' });
    }
});

// ✅ LOGOUT
app.post('/api/auth/logout', async (req, res) => {
    if (req.session.userId) {
        await AuditLog.create({ userId: req.session.userId, action: 'LOGOUT', details: 'User logged out', ip: req.ip });
    }
    req.session.destroy(() => {
        res.clearCookie('__Secure-marine.sid');
        res.json({ success: true, message: 'تم تسجيل الخروج' });
    });
});

// ✅ 2FA SETUP
app.post('/api/auth/2fa/setup', csrfProtection, async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود' });
        }

        const secret = speakeasy.generateSecret({ length: 20 });
        user.twoFactorSecret = secret.base32;
        await user.save();

        const otpauthUrl = speakeasy.otpauthURL({
            secret: secret.ascii,
            label: 'Marine System (' + user.username + ')',
            issuer: 'Marine System'
        });

        QRCode.toDataURL(otpauthUrl, (err, qrCode) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'فشل توليد QR Code' });
            }
            res.json({
                success: true,
                qrCode: qrCode,
                secret: secret.base32,
                message: 'امسح رمز QR باستخدام Google Authenticator'
            });
        });
    } catch (error) {
        console.error('2FA setup error:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ✅ VERIFY 2FA
app.post('/api/auth/2fa/verify', csrfProtection, async (req, res) => {
    try {
        const { token } = req.body;
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }
        const jwtToken = authHeader.split(' ')[1];
        const decoded = jwt.verify(jwtToken, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user || !user.twoFactorSecret) {
            return res.status(401).json({ success: false, error: '2FA غير مفعل' });
        }

        const verified = speakeasy.totp.verify({
            secret: user.twoFactorSecret,
            encoding: 'base32',
            token: token,
            window: 2
        });

        if (!verified) {
            return res.status(401).json({ success: false, error: 'الرمز غير صحيح' });
        }

        user.twoFactorEnabled = true;
        await user.save();
        await AuditLog.create({ userId: user._id, action: '2FA_ENABLED', details: 'Two-factor authentication enabled' });

        res.json({ success: true, message: '✅ تم تفعيل 2FA بنجاح' });
    } catch (error) {
        console.error('2FA verify error:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ✅ DISABLE 2FA
app.post('/api/auth/2fa/disable', csrfProtection, async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود' });
        }

        user.twoFactorEnabled = false;
        user.twoFactorSecret = null;
        await user.save();
        await AuditLog.create({ userId: user._id, action: '2FA_DISABLED', details: 'Two-factor authentication disabled' });

        res.json({ success: true, message: '✅ تم تعطيل 2FA' });
    } catch (error) {
        console.error('2FA disable error:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ✅ FORGOT PASSWORD
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.json({ success: true, message: 'إذا كان البريد مسجلاً، سيتم إرسال رابط' });
        }

        const resetToken = generateSecureKey().substring(0, 32);
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000;
        await user.save();

        const resetUrl = (process.env.APP_URL || 'http://localhost:5000') + '/reset-password/' + resetToken;
        const html = `
            <h1>إعادة تعيين كلمة المرور</h1>
            <p>مرحباً ${user.name}،</p>
            <p>انقر على الرابط التالي لإعادة تعيين كلمة المرور:</p>
            <a href="${resetUrl}">${resetUrl}</a>
            <p>هذا الرابط صالح لمدة ساعة واحدة.</p>
        `;

        await sendEmail(user.email, 'إعادة تعيين كلمة المرور - Marine System', html);
        res.json({ success: true, message: '✅ تم إرسال رابط إعادة التعيين' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ✅ RESET PASSWORD
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });
        if (!user) {
            return res.status(400).json({ success: false, error: 'الرابط غير صالح' });
        }

        user.password = bcrypt.hashSync(newPassword, 12);
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save();

        res.json({ success: true, message: '✅ تم إعادة تعيين كلمة المرور' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ============================================================
// 📊 DATA ENDPOINTS
// ============================================================

app.get('/api/vessels', csrfProtection, requirePermission('read'), async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في قراءة البيانات' });
    }
});

app.post('/api/vessels', csrfProtection, requirePermission('create'), async (req, res) => {
    try {
        const { name, type, status, location } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, error: 'اسم الوحدة مطلوب' });
        }
        const newVessel = new Vessel({
            name,
            type: type || 'غير محدد',
            status: status || 'ready',
            location: location || '—',
            lastMaintenance: new Date()
        });
        await newVessel.save();
        await AuditLog.create({ userId: req.user._id, action: 'VESSEL_CREATED', details: 'Created vessel: ' + name });
        res.json({ success: true, vessel: newVessel });
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في إضافة الوحدة' });
    }
});

app.get('/api/users', csrfProtection, requirePermission('manage_users'), async (req, res) => {
    try {
        const users = await User.find({}, '-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

app.post('/api/users', csrfProtection, requirePermission('manage_users'), async (req, res) => {
    try {
        const { username, password, email, role, active } = req.body;
        if (!username) return res.status(400).json({ success: false, error: 'اسم المستخدم مطلوب' });
        if (!password) return res.status(400).json({ success: false, error: 'كلمة المرور مطلوبة' });

        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ success: false, error: 'اسم المستخدم موجود' });

        const newUser = new User({
            username,
            password: bcrypt.hashSync(password, 12),
            email: email || username + '@marine.com',
            name: username,
            role: role || 'viewer',
            permissions: permissions[role] || permissions.viewer,
            active: active !== undefined ? active : true
        });
        await newUser.save();
        await AuditLog.create({ userId: req.user._id, action: 'USER_CREATED', details: 'Created user: ' + username });

        const userObj = newUser.toObject();
        delete userObj.password;
        res.status(201).json({ success: true, message: 'تم إضافة المستخدم', user: userObj });
    } catch (error) {
        console.error('❌ Error creating user:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

app.put('/api/users/:id', csrfProtection, requirePermission('manage_users'), async (req, res) => {
    try {
        const userId = req.params.id;
        const { username, email, role, active, password } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

        if (user.username === 'admin' && req.user.username !== 'admin') {
            return res.status(403).json({ success: false, error: 'لا يمكن تعديل المستخدم الرئيسي' });
        }

        if (username) user.username = username;
        if (email) user.email = email;
        if (role) {
            user.role = role;
            user.permissions = permissions[role] || permissions.viewer;
        }
        if (active !== undefined) user.active = active;
        if (password) user.password = bcrypt.hashSync(password, 12);

        await user.save();
        await AuditLog.create({ userId: req.user._id, action: 'USER_UPDATED', details: 'Updated user: ' + user.username });

        const userObj = user.toObject();
        delete userObj.password;
        res.json({ success: true, message: 'تم تحديث المستخدم', user: userObj });
    } catch (error) {
        console.error('❌ Error updating user:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

app.delete('/api/users/:id', csrfProtection, requirePermission('manage_users'), async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        if (user.username === 'admin') {
            return res.status(403).json({ success: false, error: 'لا يمكن حذف المستخدم الرئيسي' });
        }
        await User.findByIdAndDelete(userId);
        await AuditLog.create({ userId: req.user._id, action: 'USER_DELETED', details: 'Deleted user: ' + user.username });
        res.json({ success: true, message: 'تم حذف المستخدم' });
    } catch (error) {
        console.error('❌ Error deleting user:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

app.get('/api/audit-logs', csrfProtection, requirePermission('view_logs'), async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(limit).populate('userId', 'username');
        res.json(logs);
    } catch (error) {
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
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>🚢 Marine System</title>
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
                    <p class="info">🔒 <strong>الأمان:</strong> Enterprise</p>
                    <p class="info">👤 <strong>المستخدم:</strong> admin</p>
                    <p class="info">🔑 <strong>كلمة المرور:</strong> admin123</p>
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
                <div class="footer">🔒 جميع البيانات مشفرة | v8.0 Enterprise</div>
            </div>
            <script>
                var csrfToken = '';

                async function getCsrfToken() {
                    try {
                        var r = await fetch('/api/csrf-token', { credentials: 'include', headers: { 'Accept': 'application/json' } });
                        var d = await r.json();
                        if (d.success) { csrfToken = d.token; return d.token; }
                        return null;
                    } catch(e) { return null; }
                }

                async function handleLogin() {
                    var username = document.getElementById('username').value.trim();
                    var password = document.getElementById('password').value;
                    var msg = document.getElementById('message');
                    if (!username || !password) { msg.innerHTML = '<div class="error">⚠️ الرجاء إدخال جميع البيانات</div>'; return; }
                    try {
                        var t = await getCsrfToken();
                        if (!t) { msg.innerHTML = '<div class="error">❌ فشل الحصول على CSRF token</div>'; return; }
                        msg.innerHTML = '<div style="color:#00d4ff;">⏳ جاري تسجيل الدخول...</div>';
                        var r = await fetch('/api/auth/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': t },
                            credentials: 'include',
                            body: JSON.stringify({ username: username, password: password })
                        });
                        var d = await r.json();
                        if (d.requiresTwoFactor) {
                            msg.innerHTML = '<div style="color:#f5d76e;">🔐 الرجاء إدخال رمز 2FA</div>' +
                                '<input type="text" id="twoFactorInput" placeholder="رمز 2FA" style="width:100%;padding:15px;margin:10px 0;border-radius:10px;border:1px solid #2a3a5a;background:#0d1528;color:#fff;font-size:16px;text-align:center;">' +
                                '<button class="btn" onclick="verifyTwoFactor()" style="background:linear-gradient(135deg,#f5d76e,#e6b31e);">🔐 تحقق</button>';
                            return;
                        }
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

                async function verifyTwoFactor() {
                    var token = document.getElementById('twoFactorInput').value;
                    var msg = document.getElementById('message');
                    if (!token) { msg.innerHTML = '<div class="error">⚠️ الرجاء إدخال رمز 2FA</div>'; return; }
                    try {
                        var t = await getCsrfToken();
                        var r = await fetch('/api/auth/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': t },
                            credentials: 'include',
                            body: JSON.stringify({ username: document.getElementById('username').value, password: document.getElementById('password').value, twoFactorToken: token })
                        });
                        var d = await r.json();
                        if (r.ok && d.success) {
                            localStorage.setItem('authToken', d.token);
                            localStorage.setItem('userData', JSON.stringify(d.user));
                            document.getElementById('loginSection').style.display = 'none';
                            document.getElementById('userSection').style.display = 'block';
                            document.getElementById('userName').textContent = d.user.name || d.user.username;
                            document.getElementById('userRole').textContent = d.user.role || 'مستخدم';
                            msg.innerHTML = '<div class="success-msg">✅ تم تسجيل الدخول بنجاح</div>';
                        } else {
                            msg.innerHTML = '<div class="error">❌ ' + (d.error || 'رمز 2FA غير صحيح') + '</div>';
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
                        var loginSection = document.getElementById('loginSection');
                        if (loginSection.style.display !== 'none') {
                            if (document.getElementById('twoFactorInput')) {
                                verifyTwoFactor();
                            } else {
                                handleLogin();
                            }
                        }
                    }
                });

                async function checkAuth() {
                    var token = localStorage.getItem('authToken');
                    if (!token) return;
                    try {
                        var csrf = await getCsrfToken();
                        var r = await fetch('/api/auth/me', {
                            headers: { 'Authorization': 'Bearer ' + token, 'X-CSRF-Token': csrf || '', 'Accept': 'application/json' },
                            credentials: 'include'
                        });
                        var d = await r.json();
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

createAdminUser().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log('=========================================');
        console.log('🚢 MARINE SYSTEM v8.0 - PROFESSIONAL');
        console.log('=========================================');
        console.log('📍 Server: http://localhost:' + PORT);
        console.log('👤 Admin: ' + ADMIN_USERNAME);
        console.log('🔑 Password: ' + ADMIN_PASSWORD);
        console.log('🔒 Security: 2FA + RBAC + CSRF + XSS + HPP');
        console.log('=========================================');
    });
});

module.exports = app;
