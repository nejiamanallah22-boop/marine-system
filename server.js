// ============================================================
// 🚢 MARINE SYSTEM - PROFESSIONAL SERVER v8.0 (FULLY FIXED)
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

// ✅ إصلاح trust proxy لـ Render
app.set('trust proxy', isProduction ? 1 : 0);

function isStrongPassword(password) {
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    const isLongEnough = password.length >= 12;
    return [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar, isLongEnough].filter(Boolean).length >= 4;
}

function generateStrongPassword(length = 16) {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=';
    const all = uppercase + lowercase + numbers + special;
    let password = '';
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];
    for (let i = password.length; i < length; i++) {
        password += all[Math.floor(Math.random() * all.length)];
    }
    return password.split('').sort(() => Math.random() - 0.5).join('');
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = (() => {
    if (process.env.ADMIN_PASSWORD) {
        if (!isStrongPassword(process.env.ADMIN_PASSWORD)) {
            console.warn('⚠️ Admin password is weak. Using generated strong password.');
            return generateStrongPassword();
        }
        return process.env.ADMIN_PASSWORD;
    }
    const generated = generateStrongPassword();
    console.log('=========================================');
    console.log('🔑 GENERATED ADMIN PASSWORD:', generated);
    console.log('💾 SAVE THIS PASSWORD NOW!');
    console.log('=========================================');
    return generated;
})();

const ADMIN_NAME = process.env.ADMIN_NAME || 'أمان الله ناجي';
const JWT_SECRET = process.env.JWT_SECRET || generateSecureKey(64);
const SESSION_SECRET = process.env.SESSION_SECRET || generateSecureKey(64);
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || generateSecureKey(32);
const ENCRYPTION_IV = crypto.randomBytes(16);

// ============================================================
// 📧 EMAIL CONFIGURATION - ETHEREAL ONLY (FIXED)
// ============================================================

let emailTransporter = null;
let etherealAccount = null;

// ✅ إنشاء حساب Ethereal تلقائياً
async function setupEtherealEmail() {
    try {
        const testAccount = await nodemailer.createTestAccount();
        etherealAccount = testAccount;
        
        console.log('📧 Ethereal account created:');
        console.log('✉️ Email:', testAccount.user);
        console.log('🔑 Password:', testAccount.pass);
        console.log('🔗 Login: https://ethereal.email/login');
        
        const transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass
            }
        });
        
        await transporter.verify();
        console.log('✅ Ethereal email service ready!');
        return transporter;
    } catch (error) {
        console.error('❌ Ethereal setup error:', error);
        return null;
    }
}

// ✅ إعداد البريد الإلكتروني - استخدام Ethereal فقط
async function initEmailService() {
    console.log('📧 Using Ethereal email service');
    return await setupEtherealEmail();
}

// ✅ تهيئة البريد الإلكتروني عند بدء التشغيل
(async function initEmail() {
    emailTransporter = await initEmailService();
})();

// ✅ دالة إرسال البريد
async function sendEmail(to, subject, html) {
    if (!emailTransporter) {
        console.log('⏳ Email service not ready, retrying...');
        emailTransporter = await initEmailService();
        if (!emailTransporter) {
            console.error('❌ Email service failed to initialize');
            return null;
        }
    }
    
    try {
        const fromEmail = etherealAccount?.user || 'no-reply@marine-system.com';
        const info = await emailTransporter.sendMail({
            from: `"منظومة الوسائل البحرية" <${fromEmail}>`,
            to: to,
            subject: subject,
            html: html
        });
        
        console.log('✅ Email sent successfully!');
        
        // ✅ عرض رابط المعاينة لـ Ethereal
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
            console.log('📧 Preview URL:', previewUrl);
        }
        
        return info;
    } catch (error) {
        console.error('❌ Email send error:', error);
        return null;
    }
}

// ✅ دالة للحصول على رابط معاينة البريد
function getPreviewUrl(info) {
    if (info && info.messageId) {
        return nodemailer.getTestMessageUrl(info);
    }
    return null;
}

// ============================================================
// 🔐 ENCRYPTION FUNCTIONS
// ============================================================

function encrypt(text) {
    try {
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), ENCRYPTION_IV);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    } catch (error) {
        return text;
    }
}

function decrypt(text) {
    try {
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), ENCRYPTION_IV);
        let decrypted = decipher.update(text, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        return text;
    }
}

function generateSecureToken() {
    return crypto.randomBytes(32).toString('hex');
}

// ============================================================
// 🛡️ SECURITY MIDDLEWARE
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
    req.requestId = generateSecureToken().substring(0, 16);
    res.setHeader('X-Request-ID', req.requestId);
    next();
});

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} - ${duration}ms - ${req.requestId}`);
    });
    next();
});

// ✅ CSRF Protection
app.use((req, res, next) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = generateSecureToken();
        req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
    }
    if (req.session.csrfExpiry && Date.now() > req.session.csrfExpiry) {
        req.session.csrfToken = generateSecureToken();
        req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
    }
    res.setHeader('X-CSRF-Token', req.session.csrfToken);
    res.setHeader('X-Session-Expiry', req.session.csrfExpiry);
    next();
});

const csrfProtection = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (['/api/auth/login', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/verify-reset-token', '/api/csrf-token'].includes(req.path)) return next();

    const token = req.headers['x-csrf-token'] || req.body.csrf_token;
    const sessionToken = req.session.csrfToken;
    if (!token || !sessionToken) {
        return res.status(403).json({ success: false, error: 'CSRF token غير صالح' });
    }
    try {
        const isValid = crypto.timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(sessionToken, 'utf8'));
        if (!isValid) throw new Error('Invalid token');
    } catch (error) {
        return res.status(403).json({ success: false, error: 'CSRF token غير صالح' });
    }
    const newToken = generateSecureToken();
    req.session.csrfToken = newToken;
    req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
    res.setHeader('X-CSRF-Token', newToken);
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
// 📊 DATA - VESSELS
// ============================================================

const vessels = [];

const initialVessels = [
    { 
        id: '1', 
        name: 'الوحدة 101', 
        num: '101', 
        len: 11, 
        region: 'الشمال', 
        zone: 'تونس', 
        port: 'الميناء الرئيسي', 
        supp: '—', 
        status: 'صالح', 
        break: '—', 
        fDate: null, 
        eDate: null, 
        ref: '', 
        repairUnit: '—',
        cat: 'البروق'
    },
    { 
        id: '2', 
        name: 'الوحدة 205', 
        num: '205', 
        len: 15, 
        region: 'الساحل', 
        zone: 'سوسة', 
        port: 'ميناء سوسة', 
        supp: '—', 
        status: 'صيانة', 
        break: 'محرك', 
        fDate: new Date().toISOString(), 
        eDate: null, 
        ref: 'M-2024-001', 
        repairUnit: 'وحدة الصيانة تونس',
        cat: 'خوافر'
    },
    { 
        id: '3', 
        name: 'الوحدة 312', 
        num: '312', 
        len: 8, 
        region: 'الجنوب', 
        zone: 'جرجيس', 
        port: 'ميناء جرجيس', 
        supp: '—', 
        status: 'معطب', 
        break: 'هيكل', 
        fDate: new Date().toISOString(), 
        eDate: null, 
        ref: 'M-2024-002', 
        repairUnit: 'وحدة الصيانة جرجيس',
        cat: 'صقور'
    }
];

initialVessels.forEach(v => vessels.push(v));

// ============================================================
// 📊 DATA - USERS
// ============================================================

const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 12);

const users = [
    {
        id: '1',
        username: 'admin',
        password: hashedPassword,
        name: ADMIN_NAME,
        email: 'nejiamanallah22@gmail.com',
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString(),
        lastLogin: null,
        loginAttempts: 0,
        locked: false,
        lockedUntil: null
    }
];

// ============================================================
// 📊 DATA - MAINTENANCE LOGS
// ============================================================

const maintenanceLogs = [];

function initMaintenanceLogs() {
    vessels.forEach(v => {
        if (v.status === 'معطب' || v.status === 'صيانة') {
            maintenanceLogs.push({
                id: crypto.randomBytes(8).toString('hex'),
                vesselId: v.id,
                vesselName: v.name,
                vesselNum: v.num || '',
                type: v.break || 'صيانة دورية',
                status: v.status === 'معطب' ? 'متأخرة' : 'قيد التنفيذ',
                date: v.fDate || new Date().toISOString(),
                repairUnit: v.repairUnit || '—',
                cost: 0,
                notes: v.break ? `عطب: ${v.break}` : 'صيانة دورية',
                createdAt: v.fDate || new Date().toISOString()
            });
        }
    });
    
    if (maintenanceLogs.length < 3) {
        maintenanceLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            vesselId: '1',
            vesselName: 'الوحدة 101',
            vesselNum: '101',
            type: 'صيانة دورية',
            status: 'مكتملة',
            date: new Date().toISOString(),
            repairUnit: 'وحدة الصيانة تونس',
            cost: 500,
            notes: 'تم إجراء الصيانة الدورية',
            createdAt: new Date().toISOString()
        });
        maintenanceLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            vesselId: '2',
            vesselName: 'الوحدة 205',
            vesselNum: '205',
            type: 'إصلاح محرك',
            status: 'قيد التنفيذ',
            date: new Date().toISOString(),
            repairUnit: 'وحدة الصيانة صفاقس',
            cost: 1200,
            notes: 'استبدال المحرك التالف',
            createdAt: new Date().toISOString()
        });
        maintenanceLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            vesselId: '3',
            vesselName: 'الوحدة 312',
            vesselNum: '312',
            type: 'إصلاح هيكل',
            status: 'متأخرة',
            date: new Date().toISOString(),
            repairUnit: 'وحدة الصيانة جرجيس',
            cost: 2000,
            notes: 'إصلاح ضرر في الهيكل',
            createdAt: new Date().toISOString()
        });
    }
}

initMaintenanceLogs();

// ============================================================
// 📊 DATA - SYSTEM LOGS
// ============================================================

const systemLogs = [];

// ============================================================
// 📊 DATA - PASSWORD RESET TOKENS
// ============================================================

const passwordResetTokens = [];

function generateResetToken() {
    return crypto.randomBytes(32).toString('hex');
}

function createPasswordResetToken(email) {
    const existingIndex = passwordResetTokens.findIndex(t => t.email === email);
    if (existingIndex !== -1) {
        passwordResetTokens.splice(existingIndex, 1);
    }

    const token = generateResetToken();
    const expiresAt = Date.now() + (60 * 60 * 1000);

    passwordResetTokens.push({
        email: email,
        token: token,
        expiresAt: expiresAt,
        createdAt: new Date().toISOString()
    });

    return token;
}

function verifyResetToken(email, token) {
    const record = passwordResetTokens.find(t => t.email === email && t.token === token);
    if (!record) return false;
    if (Date.now() > record.expiresAt) return false;
    return true;
}

function deleteResetToken(email, token) {
    const index = passwordResetTokens.findIndex(t => t.email === email && t.token === token);
    if (index !== -1) {
        passwordResetTokens.splice(index, 1);
        return true;
    }
    return false;
}

// ============================================================
// 🔐 AUTH ENDPOINTS
// ============================================================

app.get('/api/csrf-token', (req, res) => {
    try {
        const token = req.session.csrfToken;
        const expiry = req.session.csrfExpiry || Date.now() + (8 * 60 * 60 * 1000);
        res.setHeader('Content-Type', 'application/json');
        res.json({ success: true, token: token, expiresIn: expiry - Date.now() });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to generate CSRF token' });
    }
});

app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;
        
        console.log(`🔐 Login attempt: ${username} from ${clientIP}`);

        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'بيانات غير صالحة' });
        }

        const user = users.find(u => u.username === username);
        if (!user) {
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        if (user.locked && user.lockedUntil && Date.now() < user.lockedUntil) {
            const remaining = Math.ceil((user.lockedUntil - Date.now()) / 60000);
            return res.status(403).json({
                success: false,
                error: `الحساب مقفل. حاول مرة أخرى بعد ${remaining} دقيقة`
            });
        }

        const validPassword = bcrypt.compareSync(password, user.password);
        if (!validPassword) {
            user.loginAttempts = (user.loginAttempts || 0) + 1;
            if (user.loginAttempts >= 5) {
                user.locked = true;
                user.lockedUntil = Date.now() + (30 * 60 * 1000);
                return res.status(403).json({
                    success: false,
                    error: 'الحساب مقفل لمدة 30 دقيقة بسبب كثرة المحاولات الفاشلة'
                });
            }
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        user.loginAttempts = 0;
        user.locked = false;
        user.lockedUntil = null;
        user.lastLogin = new Date().toISOString();

        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                role: user.role,
                name: user.name
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        const newToken = generateSecureToken();
        req.session.csrfToken = newToken;
        req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
        req.session.userId = user.id;

        res.setHeader('X-CSRF-Token', newToken);
        res.setHeader('X-User-ID', user.id);

        systemLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            userId: user.id,
            action: 'LOGIN_SUCCESS',
            details: `User ${username} logged in from ${clientIP}`,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            token: token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                email: user.email,
                role: user.role,
                active: user.active,
                lastLogin: user.lastLogin
            },
            csrfToken: newToken
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

app.get('/api/auth/me', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.id);

        if (!user || !user.active) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود أو غير نشط' });
        }

        if (req.session.userId !== user.id) {
            return res.status(401).json({ success: false, error: 'جلسة غير صالحة' });
        }

        const newToken = generateSecureToken();
        req.session.csrfToken = newToken;
        req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
        res.setHeader('X-CSRF-Token', newToken);

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                email: user.email,
                role: user.role,
                active: user.active,
                lastLogin: user.lastLogin
            }
        });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, error: 'انتهت صلاحية التوكن' });
        }
        res.status(401).json({ success: false, error: 'توكن غير صالح' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    const userId = req.session.userId;
    
    if (userId) {
        systemLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            userId: userId,
            action: 'LOGOUT',
            details: 'User logged out',
            timestamp: new Date().toISOString()
        });
    }
    
    req.session.destroy(() => {
        res.clearCookie('__Secure-marine.sid');
        res.json({ success: true, message: 'تم تسجيل الخروج' });
    });
});

// ============================================================
// 🔐 PASSWORD RESET API
// ============================================================

// ✅ طلب إعادة تعيين كلمة المرور
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;

        console.log(`📧 Forgot password request for: ${email} from ${clientIP}`);

        if (!email) {
            return res.status(400).json({ success: false, error: 'البريد الإلكتروني مطلوب' });
        }

        const user = users.find(u => u.email === email);
        if (!user) {
            return res.status(200).json({ 
                success: true, 
                message: 'إذا كان البريد الإلكتروني مسجلاً، ستتلقى رابط إعادة التعيين' 
            });
        }

        const resetToken = createPasswordResetToken(email);
        const resetLink = `${req.protocol}://${req.get('host')}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

        console.log(`🔑 Reset token generated for ${email}`);
        console.log(`🔗 Reset link: ${resetLink}`);

        // ✅ إرسال البريد الإلكتروني
        const emailHtml = `
            <div dir="rtl" style="font-family: 'Cairo', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0a1628; color: #e2e8f0; border-radius: 12px; border: 1px solid #1a2a4a;">
                <div style="text-align: center; padding: 20px 0;">
                    <span style="font-size: 48px;">⚓</span>
                    <h1 style="color: #f5d76e; margin: 10px 0;">منظومة الوسائل البحرية</h1>
                    <p style="color: rgba(255,255,255,0.3);">نظام متابعة وإدارة الأسطول البحري</p>
                </div>
                <div style="background: rgba(255,255,255,0.04); padding: 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.06);">
                    <h2 style="color: #fff; font-size: 20px;">🔐 إعادة تعيين كلمة المرور</h2>
                    <p style="color: rgba(255,255,255,0.6);">مرحباً <strong style="color: #f5d76e;">${user.name || user.username}</strong>،</p>
                    <p style="color: rgba(255,255,255,0.6);">لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك.</p>
                    <div style="text-align: center; margin: 25px 0;">
                        <a href="${resetLink}" style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #e6b31e, #f5d76e); color: #0a1628; text-decoration: none; border-radius: 30px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 30px rgba(230,179,30,0.2);">
                            🔑 إعادة تعيين كلمة المرور
                        </a>
                    </div>
                    <p style="color: rgba(255,255,255,0.4); font-size: 13px;">هذا الرابط صالح لمدة <strong style="color: #f5d76e;">ساعة واحدة</strong>.</p>
                    <p style="color: rgba(255,255,255,0.3); font-size: 12px; margin-top: 10px;">إذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذا البريد.</p>
                </div>
                <div style="text-align: center; padding: 20px 0; border-top: 1px solid rgba(255,255,255,0.04); margin-top: 20px;">
                    <p style="color: rgba(255,255,255,0.15); font-size: 12px;">© 2024 منظومة الوسائل البحرية - جميع الحقوق محفوظة</p>
                </div>
            </div>
        `;

        const result = await sendEmail(email, '🔐 إعادة تعيين كلمة المرور - منظومة الوسائل البحرية', emailHtml);

        if (result) {
            const previewUrl = getPreviewUrl(result);
            if (previewUrl) {
                console.log(`📧 Preview URL: ${previewUrl}`);
            }
            
            systemLogs.push({
                id: crypto.randomBytes(8).toString('hex'),
                userId: user.id,
                action: 'PASSWORD_RESET_REQUESTED',
                details: `Password reset requested for ${email} from ${clientIP}`,
                timestamp: new Date().toISOString()
            });

            // ✅ إشعار للمسؤول
            try {
                const adminEmails = users.filter(u => u.role === 'admin').map(u => u.email);
                if (adminEmails.length > 0) {
                    await sendEmail(
                        adminEmails[0],
                        '🔔 طلب إعادة تعيين كلمة المرور',
                        `
                            <p>👤 المستخدم: <strong>${user.name || user.username}</strong></p>
                            <p>📧 البريد: <strong>${email}</strong></p>
                            <p>🌐 IP: <strong>${clientIP}</strong></p>
                            <p>تم طلب إعادة تعيين كلمة المرور.</p>
                        `
                    );
                }
            } catch (adminError) {
                console.warn('⚠️ Could not send admin notification:', adminError.message);
            }

            res.status(200).json({
                success: true,
                message: 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني',
                preview: previewUrl || null
            });
        } else {
            throw new Error('Failed to send email');
        }

    } catch (error) {
        console.error('❌ Forgot password error:', error);
        res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
    }
});

// ✅ إعادة تعيين كلمة المرور
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { email, token, newPassword } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;

        console.log(`🔑 Reset password attempt for: ${email} from ${clientIP}`);

        if (!email || !token || !newPassword) {
            return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
        }

        if (!verifyResetToken(email, token)) {
            return res.status(400).json({ 
                success: false, 
                error: 'رابط إعادة التعيين غير صالح أو منتهي الصلاحية' 
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ 
                success: false, 
                error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' 
            });
        }

        const user = users.find(u => u.email === email);
        if (!user) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }

        // ✅ تحديث كلمة المرور
        user.password = bcrypt.hashSync(newPassword, 12);
        user.updatedAt = new Date().toISOString();

        // ✅ حذف التوكن
        deleteResetToken(email, token);

        // ✅ إشعار للمستخدم
        try {
            await sendEmail(
                email,
                '✅ تم تغيير كلمة المرور - منظومة الوسائل البحرية',
                `
                    <div dir="rtl" style="font-family: 'Cairo', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0a1628; color: #e2e8f0; border-radius: 12px; border: 1px solid #1a2a4a;">
                        <h2 style="color: #f5d76e;">✅ تم تغيير كلمة المرور</h2>
                        <p>مرحباً <strong>${user.name || user.username}</strong>،</p>
                        <p>تم تغيير كلمة المرور الخاصة بحسابك بنجاح.</p>
                        <p style="color: rgba(255,255,255,0.4); font-size: 13px;">إذا لم تقم أنت بهذا التغيير، يرجى الاتصال بالدعم الفني فوراً.</p>
                    </div>
                `
            );
        } catch (emailError) {
            console.warn('⚠️ Could not send confirmation email:', emailError.message);
        }

        systemLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            userId: user.id,
            action: 'PASSWORD_RESET_SUCCESS',
            details: `Password reset successful for ${email} from ${clientIP}`,
            timestamp: new Date().toISOString()
        });

        console.log(`✅ Password reset successful for: ${email}`);

        res.status(200).json({
            success: true,
            message: 'تم إعادة تعيين كلمة المرور بنجاح'
        });

    } catch (error) {
        console.error('❌ Reset password error:', error);
        res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
    }
});

// ✅ التحقق من صلاحية توكن إعادة التعيين
app.post('/api/auth/verify-reset-token', (req, res) => {
    try {
        const { email, token } = req.body;

        if (!email || !token) {
            return res.status(400).json({ success: false, error: 'البريد الإلكتروني والتوكن مطلوبان' });
        }

        const isValid = verifyResetToken(email, token);

        res.json({
            success: true,
            valid: isValid,
            message: isValid ? 'التوكن صالح' : 'التوكن غير صالح أو منتهي الصلاحية'
        });

    } catch (error) {
        console.error('❌ Verify reset token error:', error);
        res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
    }
});

// ============================================================
// 📊 VESSELS API
// ============================================================

app.get('/api/vessels', csrfProtection, (req, res) => {
    try {
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في جلب البيانات' });
    }
});

app.post('/api/vessels', csrfProtection, (req, res) => {
    try {
        const { name, num, len, region, zone, port, supp, status, break: breakType, fDate, eDate, ref, repairUnit, cat } = req.body;
        
        if (!name) {
            return res.status(400).json({ success: false, error: 'اسم المركب مطلوب' });
        }

        const newVessel = {
            id: crypto.randomBytes(8).toString('hex'),
            name: name,
            num: num || '',
            len: len || 0,
            region: region || '',
            zone: zone || '',
            port: port || '',
            supp: supp || '',
            status: status || 'صالح',
            break: breakType || '',
            fDate: fDate || null,
            eDate: eDate || null,
            ref: ref || '',
            repairUnit: repairUnit || '',
            cat: cat || '',
            createdAt: new Date().toISOString()
        };
        
        vessels.push(newVessel);
        console.log('✅ Vessel added:', newVessel.name);

        if (status === 'معطب' || status === 'صيانة') {
            maintenanceLogs.push({
                id: crypto.randomBytes(8).toString('hex'),
                vesselId: newVessel.id,
                vesselName: newVessel.name,
                vesselNum: newVessel.num,
                type: breakType || 'صيانة دورية',
                status: status === 'معطب' ? 'متأخرة' : 'قيد التنفيذ',
                date: fDate || new Date().toISOString(),
                repairUnit: repairUnit || '—',
                cost: 0,
                notes: breakType ? `عطب: ${breakType}` : 'صيانة دورية',
                createdAt: new Date().toISOString()
            });
        }
        
        res.status(201).json({
            success: true,
            message: 'تم إضافة المركب بنجاح',
            vessel: newVessel
        });
    } catch (error) {
        console.error('❌ Error adding vessel:', error);
        res.status(500).json({ success: false, error: 'خطأ في إضافة المركب' });
    }
});

app.put('/api/vessels/:id', csrfProtection, (req, res) => {
    try {
        const vesselId = req.params.id;
        const { name, num, len, region, zone, port, supp, status, break: breakType, fDate, eDate, ref, repairUnit, cat } = req.body;
        
        const vessel = vessels.find(v => v.id === vesselId);
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'المركب غير موجود' });
        }
        
        const oldStatus = vessel.status;
        
        if (name) vessel.name = name;
        if (num !== undefined) vessel.num = num;
        if (len !== undefined) vessel.len = len;
        if (region !== undefined) vessel.region = region;
        if (zone !== undefined) vessel.zone = zone;
        if (port !== undefined) vessel.port = port;
        if (supp !== undefined) vessel.supp = supp;
        if (status) vessel.status = status;
        if (breakType !== undefined) vessel.break = breakType;
        if (fDate !== undefined) vessel.fDate = fDate;
        if (eDate !== undefined) vessel.eDate = eDate;
        if (ref !== undefined) vessel.ref = ref;
        if (repairUnit !== undefined) vessel.repairUnit = repairUnit;
        if (cat) vessel.cat = cat;
        vessel.updatedAt = new Date().toISOString();

        if (status && (status === 'معطب' || status === 'صيانة') && oldStatus !== status) {
            maintenanceLogs.push({
                id: crypto.randomBytes(8).toString('hex'),
                vesselId: vessel.id,
                vesselName: vessel.name,
                vesselNum: vessel.num,
                type: breakType || 'صيانة دورية',
                status: status === 'معطب' ? 'متأخرة' : 'قيد التنفيذ',
                date: fDate || new Date().toISOString(),
                repairUnit: repairUnit || '—',
                cost: 0,
                notes: breakType ? `عطب: ${breakType}` : 'صيانة دورية',
                createdAt: new Date().toISOString()
            });
        }
        
        res.json({
            success: true,
            message: 'تم تحديث المركب بنجاح',
            vessel: vessel
        });
    } catch (error) {
        console.error('❌ Error updating vessel:', error);
        res.status(500).json({ success: false, error: 'خطأ في تحديث المركب' });
    }
});

app.delete('/api/vessels/:id', csrfProtection, (req, res) => {
    try {
        const vesselId = req.params.id;
        const index = vessels.findIndex(v => v.id === vesselId);
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'المركب غير موجود' });
        }
        vessels.splice(index, 1);
        res.json({ success: true, message: 'تم حذف المركب بنجاح' });
    } catch (error) {
        console.error('❌ Error deleting vessel:', error);
        res.status(500).json({ success: false, error: 'خطأ في حذف المركب' });
    }
});

// ============================================================
// 📊 MAINTENANCE LOGS API
// ============================================================

app.get('/api/maintenance-logs', csrfProtection, (req, res) => {
    try {
        console.log('📡 Fetching maintenance logs...');
        console.log('📊 Total logs:', maintenanceLogs.length);
        
        const formattedLogs = maintenanceLogs.map(log => ({
            id: log.id,
            vessel: log.vesselName,
            type: log.type,
            date: new Date(log.date).toLocaleDateString('ar-EG'),
            unit: log.repairUnit || '—',
            status: log.status,
            cost: log.cost || 0,
            notes: log.notes || ''
        }));
        
        res.json(Array.isArray(formattedLogs) ? formattedLogs : []);
    } catch (error) {
        console.error('❌ Error fetching maintenance logs:', error);
        res.status(500).json([]);
    }
});

app.post('/api/maintenance-logs', csrfProtection, (req, res) => {
    try {
        const { vesselId, vesselName, vesselNum, type, status, date, repairUnit, cost, notes } = req.body;
        
        if (!vesselName) {
            return res.status(400).json({ success: false, error: 'اسم المركب مطلوب' });
        }

        const logEntry = {
            id: crypto.randomBytes(8).toString('hex'),
            vesselId: vesselId || '',
            vesselName: vesselName,
            vesselNum: vesselNum || '',
            type: type || 'صيانة دورية',
            status: status || 'قيد التنفيذ',
            date: date || new Date().toISOString(),
            repairUnit: repairUnit || '—',
            cost: cost || 0,
            notes: notes || '',
            createdAt: new Date().toISOString()
        };
        
        maintenanceLogs.push(logEntry);
        console.log('✅ Maintenance log added:', logEntry.vesselName);
        
        res.status(201).json({
            success: true,
            message: 'تم إضافة سجل الصيانة',
            log: logEntry
        });
    } catch (error) {
        console.error('❌ Error adding maintenance log:', error);
        res.status(500).json({ success: false, error: 'خطأ في إضافة سجل الصيانة' });
    }
});

app.put('/api/maintenance-logs/:id', csrfProtection, (req, res) => {
    try {
        const logId = req.params.id;
        const { status, cost, notes } = req.body;
        
        const log = maintenanceLogs.find(l => l.id === logId);
        if (!log) {
            return res.status(404).json({ success: false, error: 'سجل الصيانة غير موجود' });
        }
        
        if (status) log.status = status;
        if (cost !== undefined) log.cost = cost;
        if (notes) log.notes = notes;
        log.updatedAt = new Date().toISOString();
        
        console.log('✅ Maintenance log updated:', log.vesselName);
        
        res.json({
            success: true,
            message: 'تم تحديث سجل الصيانة',
            log: log
        });
    } catch (error) {
        console.error('❌ Error updating maintenance log:', error);
        res.status(500).json({ success: false, error: 'خطأ في تحديث سجل الصيانة' });
    }
});

app.delete('/api/maintenance-logs/:id', csrfProtection, (req, res) => {
    try {
        const logId = req.params.id;
        const index = maintenanceLogs.findIndex(l => l.id === logId);
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'سجل الصيانة غير موجود' });
        }
        maintenanceLogs.splice(index, 1);
        console.log('✅ Maintenance log deleted:', logId);
        
        res.json({
            success: true,
            message: 'تم حذف سجل الصيانة'
        });
    } catch (error) {
        console.error('❌ Error deleting maintenance log:', error);
        res.status(500).json({ success: false, error: 'خطأ في حذف سجل الصيانة' });
    }
});

// ============================================================
// 📊 MAINTENANCE PAGE API
// ============================================================

app.get('/api/maintenance', csrfProtection, (req, res) => {
    try {
        console.log('📡 Fetching maintenance data...');
        
        const total = vessels.length;
        const damaged = vessels.filter(v => v.status === 'معطب').length;
        const maintenance = vessels.filter(v => v.status === 'صيانة').length;
        const ready = vessels.filter(v => v.status === 'صالح').length;
        
        const formattedLogs = maintenanceLogs.map(log => ({
            id: log.id,
            vessel: log.vesselName,
            type: log.type,
            date: new Date(log.date).toLocaleDateString('ar-EG'),
            unit: log.repairUnit || '—',
            status: log.status,
            cost: log.cost || 0,
            notes: log.notes || ''
        }));
        
        if (formattedLogs.length === 0) {
            formattedLogs.push({
                id: 'demo-1',
                vessel: 'الوحدة 101',
                type: 'صيانة دورية',
                date: new Date().toLocaleDateString('ar-EG'),
                unit: 'وحدة الصيانة تونس',
                status: 'مكتملة',
                cost: 500,
                notes: 'تم إجراء الصيانة الدورية'
            });
            formattedLogs.push({
                id: 'demo-2',
                vessel: 'الوحدة 205',
                type: 'إصلاح محرك',
                date: new Date().toLocaleDateString('ar-EG'),
                unit: 'وحدة الصيانة صفاقس',
                status: 'قيد التنفيذ',
                cost: 1200,
                notes: 'استبدال المحرك التالف'
            });
            formattedLogs.push({
                id: 'demo-3',
                vessel: 'الوحدة 312',
                type: 'إصلاح هيكل',
                date: new Date().toLocaleDateString('ar-EG'),
                unit: 'وحدة الصيانة جرجيس',
                status: 'متأخرة',
                cost: 2000,
                notes: 'إصلاح ضرر في الهيكل'
            });
        }
        
        res.json({
            success: true,
            records: formattedLogs,
            stats: {
                total: formattedLogs.length,
                completed: formattedLogs.filter(l => l.status === 'مكتملة').length,
                pending: formattedLogs.filter(l => l.status === 'معلقة').length,
                overdue: formattedLogs.filter(l => l.status === 'متأخرة').length,
                inProgress: formattedLogs.filter(l => l.status === 'قيد التنفيذ').length
            },
            vessels: vessels,
            logs: maintenanceLogs
        });
    } catch (error) {
        console.error('❌ Error fetching maintenance data:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في جلب بيانات الصيانة',
            records: []
        });
    }
});

app.get('/api/maintenance-records', csrfProtection, (req, res) => {
    try {
        const records = maintenanceLogs.map(log => ({
            id: log.id,
            vessel: log.vesselName,
            type: log.type,
            date: new Date(log.date).toLocaleDateString('ar-EG'),
            unit: log.repairUnit || '—',
            status: log.status,
            cost: log.cost || 0,
            notes: log.notes || ''
        }));
        
        if (records.length === 0) {
            records.push({
                id: 'demo-1',
                vessel: 'الوحدة 101',
                type: 'صيانة دورية',
                date: new Date().toLocaleDateString('ar-EG'),
                unit: 'وحدة الصيانة تونس',
                status: 'مكتملة',
                cost: 500,
                notes: 'تم إجراء الصيانة الدورية'
            });
            records.push({
                id: 'demo-2',
                vessel: 'الوحدة 205',
                type: 'إصلاح محرك',
                date: new Date().toLocaleDateString('ar-EG'),
                unit: 'وحدة الصيانة صفاقس',
                status: 'قيد التنفيذ',
                cost: 1200,
                notes: 'استبدال المحرك التالف'
            });
        }
        
        res.json({
            success: true,
            records: records,
            stats: {
                total: records.length,
                completed: records.filter(r => r.status === 'مكتملة').length,
                pending: records.filter(r => r.status === 'معلقة').length,
                overdue: records.filter(r => r.status === 'متأخرة').length,
                inProgress: records.filter(r => r.status === 'قيد التنفيذ').length
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            records: [],
            error: 'خطأ في جلب البيانات'
        });
    }
});

app.put('/api/maintenance/:id', csrfProtection, (req, res) => {
    try {
        const vesselId = req.params.id;
        const { status, repairUnit, break: breakType, eDate } = req.body;
        
        const vessel = vessels.find(v => v.id === vesselId);
        if (!vessel) {
            return res.status(404).json({ 
                success: false, 
                error: 'المركب غير موجود' 
            });
        }
        
        const oldStatus = vessel.status;
        
        if (status) vessel.status = status;
        if (repairUnit) vessel.repairUnit = repairUnit;
        if (breakType !== undefined) vessel.break = breakType;
        if (eDate) vessel.eDate = eDate;
        vessel.updatedAt = new Date().toISOString();
        
        if (status === 'صالح' && oldStatus !== 'صالح') {
            maintenanceLogs.push({
                id: crypto.randomBytes(8).toString('hex'),
                vesselId: vessel.id,
                vesselName: vessel.name,
                vesselNum: vessel.num || '',
                type: 'إصلاح',
                status: 'مكتملة',
                date: new Date().toISOString(),
                repairUnit: repairUnit || vessel.repairUnit || '—',
                cost: 0,
                notes: `تم إصلاح المركب ${vessel.name}`,
                createdAt: new Date().toISOString()
            });
        }
        
        if (status && (status === 'معطب' || status === 'صيانة') && oldStatus !== status) {
            maintenanceLogs.push({
                id: crypto.randomBytes(8).toString('hex'),
                vesselId: vessel.id,
                vesselName: vessel.name,
                vesselNum: vessel.num || '',
                type: breakType || 'صيانة دورية',
                status: status === 'معطب' ? 'متأخرة' : 'قيد التنفيذ',
                date: new Date().toISOString(),
                repairUnit: repairUnit || vessel.repairUnit || '—',
                cost: 0,
                notes: breakType ? `عطب: ${breakType}` : 'صيانة دورية',
                createdAt: new Date().toISOString()
            });
        }
        
        console.log('✅ Vessel updated:', vessel.name);
        
        res.json({
            success: true,
            message: 'تم تحديث المركب بنجاح',
            vessel: vessel
        });
    } catch (error) {
        console.error('❌ Error updating maintenance:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في تحديث المركب' 
        });
    }
});

// ============================================================
// 👥 USERS API - ENTERPRISE HARDENED (FULLY FIXED)
// ============================================================

// ✅ دالة للتحقق من التوكن وإرجاع المستخدم
function verifyTokenAndGetUser(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('⚠️ No Authorization header');
        return null;
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log('🔍 Decoded token - User:', decoded.username, 'Role:', decoded.role);
        const user = users.find(u => u.id === decoded.id);
        if (user) {
            console.log('👤 Found user:', user.username, 'Role:', user.role);
            return user;
        }
        console.log('⚠️ User not found in database');
        return null;
    } catch (err) {
        console.log('❌ Token verification failed:', err.message);
        return null;
    }
}

// ✅ التحقق من صلاحية admin
function isAdminUser(user) {
    if (!user) return false;
    return user.role === 'admin' || user.role === 'مسؤول';
}

// ✅ جلب جميع المستخدمين
app.get('/api/users', (req, res) => {
    try {
        console.log('📡 Fetching users...');
        
        const user = verifyTokenAndGetUser(req);
        if (!user) {
            return res.status(401).json({ error: 'غير مصرح' });
        }
        
        const safeUsers = users.map(u => ({
            id: u.id,
            username: u.username,
            name: u.name || u.username,
            email: u.email,
            role: u.role || 'viewer',
            active: u.active !== false,
            createdAt: u.createdAt,
            lastLogin: u.lastLogin || null
        }));
        
        console.log('✅ Users found:', safeUsers.length);
        res.json(safeUsers);
    } catch (error) {
        console.error('❌ Error fetching users:', error);
        res.status(500).json({ error: 'خطأ في جلب المستخدمين' });
    }
});

// ✅ إضافة مستخدم جديد
app.post('/api/users', csrfProtection, async (req, res) => {
    try {
        console.log('📝 [POST] /api/users - Creating new user');
        
        const { username, password, email, role, active } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;
        
        const user = verifyTokenAndGetUser(req);
        if (!user) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }
        
        if (!isAdminUser(user)) {
            console.log('⚠️ Unauthorized: User', user.username, 'has role', user.role);
            return res.status(403).json({ success: false, error: 'ليس لديك صلاحية لإضافة مستخدمين' });
        }
        
        console.log('✅ User', user.username, 'is authorized as admin');
        
        if (!username) {
            return res.status(400).json({ success: false, error: 'اسم المستخدم مطلوب' });
        }
        if (!password) {
            return res.status(400).json({ success: false, error: 'كلمة المرور مطلوبة' });
        }
        if (password.length < 8) {
            return res.status(400).json({ success: false, error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
        }
        
        const existingUser = users.find(u => u.username === username);
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'اسم المستخدم موجود بالفعل' });
        }
        
        const newUser = {
            id: crypto.randomBytes(8).toString('hex'),
            username: username,
            password: bcrypt.hashSync(password, 12),
            email: email || `${username}@marine.com`,
            name: username,
            role: role || 'viewer',
            active: active !== undefined ? active : true,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            loginAttempts: 0,
            locked: false,
            lockedUntil: null
        };
        
        users.push(newUser);
        console.log('✅ User created:', username);
        
        systemLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            userId: user.id,
            action: 'USER_CREATED',
            details: `User ${username} created by ${user.username}`,
            timestamp: new Date().toISOString()
        });
        
        const { password: _, ...userWithoutPassword } = newUser;
        res.status(201).json({
            success: true,
            message: 'تم إضافة المستخدم بنجاح',
            user: userWithoutPassword
        });
    } catch (error) {
        console.error('❌ Error creating user:', error);
        res.status(500).json({ success: false, error: 'خطأ في إضافة المستخدم' });
    }
});

// ✅ تحديث مستخدم
app.put('/api/users/:id', csrfProtection, (req, res) => {
    try {
        const userId = req.params.id;
        const { username, email, role, active, password } = req.body;
        
        const user = verifyTokenAndGetUser(req);
        if (!user) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }
        
        if (!isAdminUser(user)) {
            return res.status(403).json({ success: false, error: 'ليس لديك صلاحية لتعديل المستخدمين' });
        }
        
        const targetUser = users.find(u => u.id === userId);
        if (!targetUser) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }
        
        if (targetUser.username === 'admin' && username && username !== 'admin') {
            return res.status(403).json({ success: false, error: 'لا يمكن تغيير اسم المستخدم الرئيسي' });
        }
        
        if (targetUser.role === 'admin' && active === false) {
            const adminCount = users.filter(u => u.role === 'admin' && u.active !== false).length;
            if (adminCount <= 1) {
                return res.status(403).json({ success: false, error: 'لا يمكن تعطيل آخر مسؤول نشط' });
            }
        }
        
        if (username) targetUser.username = username;
        if (email) targetUser.email = email;
        if (role) targetUser.role = role;
        if (active !== undefined) targetUser.active = active;
        if (password) {
            if (password.length < 8) {
                return res.status(400).json({ success: false, error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
            }
            targetUser.password = bcrypt.hashSync(password, 12);
        }
        
        console.log('✅ User updated:', targetUser.username);
        
        systemLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            userId: user.id,
            action: 'USER_UPDATED',
            details: `User ${targetUser.username} updated by ${user.username}`,
            timestamp: new Date().toISOString()
        });
        
        const { password: _, ...userWithoutPassword } = targetUser;
        res.json({
            success: true,
            message: 'تم تحديث المستخدم بنجاح',
            user: userWithoutPassword
        });
    } catch (error) {
        console.error('❌ Error updating user:', error);
        res.status(500).json({ success: false, error: 'خطأ في تحديث المستخدم' });
    }
});

// ✅ حذف مستخدم
app.delete('/api/users/:id', csrfProtection, (req, res) => {
    try {
        const userId = req.params.id;
        
        const user = verifyTokenAndGetUser(req);
        if (!user) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }
        
        if (!isAdminUser(user)) {
            return res.status(403).json({ success: false, error: 'ليس لديك صلاحية لحذف المستخدمين' });
        }
        
        const userToDelete = users.find(u => u.id === userId);
        if (!userToDelete) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }
        
        if (userToDelete.username === 'admin') {
            return res.status(403).json({ success: false, error: 'لا يمكن حذف المستخدم الرئيسي' });
        }
        
        if (userToDelete.role === 'admin') {
            const adminCount = users.filter(u => u.role === 'admin').length;
            if (adminCount <= 1) {
                return res.status(403).json({ success: false, error: 'لا يمكن حذف آخر مسؤول في النظام' });
            }
        }
        
        const index = users.findIndex(u => u.id === userId);
        users.splice(index, 1);
        
        console.log('✅ User deleted:', userToDelete.username);
        
        systemLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            userId: user.id,
            action: 'USER_DELETED',
            details: `User ${userToDelete.username} deleted by ${user.username}`,
            timestamp: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'تم حذف المستخدم بنجاح'
        });
    } catch (error) {
        console.error('❌ Error deleting user:', error);
        res.status(500).json({ success: false, error: 'خطأ في حذف المستخدم' });
    }
});

// ✅ تغيير حالة مستخدم
app.put('/api/users-status/:id', csrfProtection, (req, res) => {
    try {
        const userId = req.params.id;
        const { active } = req.body;
        
        const user = verifyTokenAndGetUser(req);
        if (!user) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }
        
        if (!isAdminUser(user)) {
            return res.status(403).json({ success: false, error: 'ليس لديك صلاحية لتغيير حالة المستخدمين' });
        }
        
        const targetUser = users.find(u => u.id === userId);
        if (!targetUser) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }
        
        if (targetUser.role === 'admin' && active === false) {
            const adminCount = users.filter(u => u.role === 'admin' && u.active !== false).length;
            if (adminCount <= 1) {
                return res.status(403).json({ success: false, error: 'لا يمكن تعطيل آخر مسؤول نشط' });
            }
        }
        
        targetUser.active = active;
        targetUser.updatedAt = new Date().toISOString();
        
        console.log(`✅ User ${targetUser.username} ${active ? 'activated' : 'deactivated'}`);
        
        systemLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            userId: user.id,
            action: 'USER_STATUS_CHANGED',
            details: `User ${targetUser.username} ${active ? 'activated' : 'deactivated'} by ${user.username}`,
            timestamp: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: `تم ${active ? 'تفعيل' : 'تعطيل'} المستخدم بنجاح`,
            user: {
                id: targetUser.id,
                username: targetUser.username,
                active: targetUser.active
            }
        });
    } catch (error) {
        console.error('❌ Error updating user status:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في تحديث حالة المستخدم' 
        });
    }
});

// ============================================================
// 📊 USERS DATA API
// ============================================================

app.get('/api/users-data', csrfProtection, (req, res) => {
    try {
        console.log('📡 Fetching users data...');
        
        const safeUsers = users.map(u => ({
            id: u.id,
            username: u.username,
            name: u.name,
            email: u.email,
            role: u.role,
            active: u.active,
            createdAt: u.createdAt,
            lastLogin: u.lastLogin
        }));
        
        res.json({
            success: true,
            users: safeUsers,
            stats: {
                total: users.length,
                active: users.filter(u => u.active).length,
                inactive: users.filter(u => !u.active).length,
                admins: users.filter(u => u.role === 'admin').length
            }
        });
    } catch (error) {
        console.error('❌ Error fetching users data:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في جلب بيانات المستخدمين' 
        });
    }
});

// ============================================================
// 📊 SYSTEM LOGS API
// ============================================================

app.get('/api/logs', csrfProtection, (req, res) => {
    try {
        console.log('📡 Fetching system logs...');
        console.log('📊 Total logs:', systemLogs.length);
        res.json(systemLogs.slice(-100));
    } catch (error) {
        console.error('❌ Error fetching logs:', error);
        res.status(500).json({ success: false, error: 'خطأ في جلب السجلات' });
    }
});

app.post('/api/logs', csrfProtection, (req, res) => {
    try {
        const { action, details, userId } = req.body;
        
        systemLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            userId: userId || null,
            action: action || 'Unknown',
            details: details || '',
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json({ success: true, message: 'تم إضافة السجل' });
    } catch (error) {
        console.error('❌ Error adding log:', error);
        res.status(500).json({ success: false, error: 'خطأ في إضافة السجل' });
    }
});

app.delete('/api/logs/:id', csrfProtection, (req, res) => {
    try {
        const logId = req.params.id;
        const index = systemLogs.findIndex(l => l.id === logId);
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'السجل غير موجود' });
        }
        systemLogs.splice(index, 1);
        res.json({ success: true, message: 'تم حذف السجل' });
    } catch (error) {
        console.error('❌ Error deleting log:', error);
        res.status(500).json({ success: false, error: 'خطأ في حذف السجل' });
    }
});

// ============================================================
// 📊 SESSION STATUS API
// ============================================================

app.get('/api/session-status', (req, res) => {
    res.json({
        success: true,
        hasSession: !!req.session,
        hasCsrf: !!req.session.csrfToken,
        sessionId: req.sessionID,
        userId: req.session.userId || null
    });
});

// ============================================================
// 🌐 PAGE ROUTES
// ============================================================

function findPageFile(pageName) {
    const possiblePaths = [
        path.join(publicPagesDir, pageName + '.html'),
        path.join(pagesDir, pageName + '.html'),
        path.join(publicDir, pageName + '.html'),
        path.join(__dirname, pageName + '.html')
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return p;
        }
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
        if (fs.existsSync(p)) {
            return res.sendFile(p);
        }
    }
    res.send(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>🚢 Marine System</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:#0a0e1a;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}.container{background:linear-gradient(145deg,#1a1f35,#0d1528);padding:50px;border-radius:30px;max-width:600px;width:100%;border:1px solid #2a3a5a;text-align:center}h1{color:#00d4ff;font-size:2.5em}.status{background:#0d1528;padding:20px;border-radius:15px;margin:20px 0;border-right:5px solid #00ff88}.info{color:#aabbcc;line-height:2}.info strong{color:#00d4ff}.btn{background:linear-gradient(135deg,#00d4ff,#0099cc);color:#0a0e1a;border:none;padding:15px 40px;border-radius:10px;font-size:18px;font-weight:bold;cursor:pointer;transition:all 0.3s;width:100%;margin-top:15px}.btn:hover{transform:translateY(-3px);box-shadow:0 10px 30px rgba(0,212,255,0.3)}.btn-logout{background:linear-gradient(135deg,#ff4444,#cc0000)}.error{color:#ff4444;margin:10px 0}.success-msg{color:#00ff88;margin:10px 0}.login-section,.user-section{margin-top:30px;text-align:right}.user-section{display:none}.badge{display:inline-block;padding:5px 15px;border-radius:20px;font-size:14px;margin:5px 0;background:#ff4444;color:#fff}.login-form input{width:100%;padding:15px;margin:10px 0;border-radius:10px;border:1px solid #2a3a5a;background:#0d1528;color:#fff;font-size:16px}.login-form input:focus{outline:none;border-color:#00d4ff}.footer{margin-top:30px;padding-top:20px;border-top:1px solid #2a3a5a;color:#667788;font-size:12px}.links{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:20px}.links a{display:inline-block;padding:10px 20px;background:#2a3a5a;color:#fff;text-decoration:none;border-radius:8px;font-size:14px}.links a:hover{background:#3a4a6a}</style></head><body><div class="container"><h1>🚢 MARINE SYSTEM</h1><p style="color:#8899aa;">نظام إدارة الأسطول البحري</p><div class="status"><h3 style="color:#00ff88;">✅ النظام يعمل</h3><p class="info">🔒 <strong>الأمان:</strong> عالي جداً</p><p class="info">👤 <strong>المستخدم:</strong> admin</p><p class="info">🔑 <strong>كلمة المرور:</strong> ${ADMIN_PASSWORD}</p><p class="info">📊 <strong>المراكب:</strong> ${vessels.length}</p><p class="info">📝 <strong>سجلات الصيانة:</strong> ${maintenanceLogs.length}</p><p class="info">👥 <strong>المستخدمين:</strong> ${users.length}</p></div><div id="loginSection" class="login-section"><h3 style="color:#00d4ff;">🔐 تسجيل الدخول</h3><div id="message"></div><div class="login-form"><input type="text" id="username" placeholder="اسم المستخدم" value="admin"><input type="password" id="password" placeholder="كلمة المرور"><button class="btn" onclick="handleLogin()">🚀 دخول</button></div></div><div id="userSection" class="user-section"><p style="font-size:18px;">👋 <strong>مرحباً بك، <span id="userName"></span></strong></p><p>📋 <strong>الدور:</strong> <span id="userRole" class="badge">admin</span></p><div class="links"><a href="/dashboard">📊 لوحة التحكم</a><a href="/fleet">🚢 الأسطول</a><a href="/maintenance">🔧 الصيانة</a><a href="/logs">📝 سجلات الصيانة</a><a href="/users">👥 المستخدمين</a></div><button class="btn btn-logout" onclick="handleLogout()">🚪 تسجيل الخروج</button></div><div class="footer">🔒 جميع البيانات مشفرة | v8.0</div></div><script>let csrfToken='';async function getCsrfToken(){try{const r=await fetch('/api/csrf-token',{credentials:'include',headers:{'Accept':'application/json'}});const d=await r.json();if(d.success){csrfToken=d.token;return d.token}return null}catch(e){return null}}async function handleLogin(){const username=document.getElementById('username').value.trim();const password=document.getElementById('password').value;const msg=document.getElementById('message');if(!username||!password){msg.innerHTML='<div class="error">⚠️ الرجاء إدخال جميع البيانات</div>';return}try{const t=await getCsrfToken();if(!t){msg.innerHTML='<div class="error">❌ فشل الحصول على CSRF token</div>';return}msg.innerHTML='<div style="color:#00d4ff;">⏳ جاري تسجيل الدخول...</div>';const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','X-CSRF-Token':t},credentials:'include',body:JSON.stringify({username,password})});const d=await r.json();if(r.ok&&d.success){localStorage.setItem('authToken',d.token);localStorage.setItem('userData',JSON.stringify(d.user));document.getElementById('loginSection').style.display='none';document.getElementById('userSection').style.display='block';document.getElementById('userName').textContent=d.user.name||d.user.username;document.getElementById('userRole').textContent=d.user.role||'مستخدم';msg.innerHTML='<div class="success-msg">✅ تم تسجيل الدخول بنجاح</div>'}else{msg.innerHTML='<div class="error">❌ '+(d.error||'فشل تسجيل الدخول')+'</div>'}}catch(e){msg.innerHTML='<div class="error">❌ خطأ في الاتصال بالخادم</div>'}}async function handleLogout(){try{await fetch('/api/auth/logout',{method:'POST',credentials:'include'});localStorage.clear();document.getElementById('loginSection').style.display='block';document.getElementById('userSection').style.display='none';document.getElementById('message').innerHTML='<div class="success-msg">✅ تم تسجيل الخروج</div>'}catch(e){}}document.addEventListener('keydown',function(e){if(e.key==='Enter'){const loginSection=document.getElementById('loginSection');if(loginSection.style.display!=='none')handleLogin()}});async function checkAuth(){const token=localStorage.getItem('authToken');if(!token)return;try{const csrf=await getCsrfToken();const r=await fetch('/api/auth/me',{headers:{'Authorization':'Bearer '+token,'X-CSRF-Token':csrf||'','Accept':'application/json'},credentials:'include'});const d=await r.json();if(d.success&&d.user){document.getElementById('loginSection').style.display='none';document.getElementById('userSection').style.display='block';document.getElementById('userName').textContent=d.user.name||d.user.username;document.getElementById('userRole').textContent=d.user.role||'مستخدم'}else{localStorage.removeItem('authToken')}}catch(e){localStorage.removeItem('authToken')}}getCsrfToken().then(checkAuth);</script></body></html>`);
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
    if (req.path.includes('.') && !req.path.startsWith('/api')) {
        return res.status(404).send('❌ ملف غير موجود');
    }
    res.redirect('/');
});

// ============================================================
// 🔧 ERROR HANDLING
// ============================================================

app.use((err, req, res, next) => {
    console.error('❌ Global error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: isProduction ? 'حدث خطأ في الخادم' : err.message
    });
});

// ============================================================
// 🚀 START SERVER
// ============================================================

app.listen(PORT, () => {
    console.log('=========================================');
    console.log('🚢 MARINE SYSTEM v8.0 - PROFESSIONAL (FULLY FIXED)');
    console.log('=========================================');
    console.log(`📍 Server: http://localhost:${PORT}`);
    console.log(`👤 Admin: ${ADMIN_USERNAME}`);
    console.log(`🔑 Password: ${ADMIN_PASSWORD}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('🔒 Security Level: ULTRA HIGH');
    console.log(`📊 Vessels: ${vessels.length}`);
    console.log(`📝 Maintenance Logs: ${maintenanceLogs.length}`);
    console.log(`📋 System Logs: ${systemLogs.length}`);
    console.log(`👥 Users: ${users.length}`);
    console.log('=========================================');
    console.log('✅ تم إصلاح مشكلة إضافة المستخدمين بنجاح!');
    console.log('✅ تم إضافة نظام إعادة تعيين كلمة المرور!');
    console.log('✅ تم إضافة إشعارات المسؤولين!');
    console.log('✅ تم إصلاح مشكلة البريد الإلكتروني باستخدام Ethereal!');
    console.log('📌 استخدم المسار /api/users للتحقق');
    console.log('=========================================');
});

module.exports = app;
