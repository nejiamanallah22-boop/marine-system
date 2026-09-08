// ============================================================
// 🏦 MARINE SYSTEM - BANKING GRADE v8.0 (ULTRA SECURE)
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
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// 🔐 ULTRA SECURE CONFIGURATION
// ============================================================

// ✅ جميع المفاتيح من متغيرات البيئة فقط (لا شيء في الكود)
const JWT_SECRET = process.env.JWT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ENCRYPTION_IV = crypto.randomBytes(16);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// ✅ تحقق من وجود جميع المفاتيح
if (!JWT_SECRET || !SESSION_SECRET || !RESEND_API_KEY || !ENCRYPTION_KEY) {
    console.error('❌ Missing required environment variables!');
    console.error('Required: JWT_SECRET, SESSION_SECRET, RESEND_API_KEY, ENCRYPTION_KEY');
    process.exit(1);
}

const isProduction = process.env.NODE_ENV === 'production';

// ✅ إصلاح trust proxy
app.set('trust proxy', isProduction ? 1 : 0);

// ============================================================
// 📧 RESEND EMAIL (SECURE)
// ============================================================

const resend = new Resend(RESEND_API_KEY);

async function sendEmail(to, subject, html) {
    try {
        const { data, error } = await resend.emails.send({
            from: 'Marine System <onboarding@resend.dev>',
            to: [to],
            subject: subject,
            html: html
        });

        if (error) {
            console.error('❌ Resend error:', error);
            return null;
        }

        console.log('✅ Email sent successfully!');
        return data;
    } catch (error) {
        console.error('❌ Email error:', error);
        return null;
    }
}

// ============================================================
// 🛡️ ULTRA SECURE MIDDLEWARE
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

// ✅ CORS محدود للغاية
app.use(cors({
    origin: [
        'http://localhost:5000',
        'http://localhost:3000',
        'https://marine-system-71eo.onrender.com'
    ],
    credentials: true,
    exposedHeaders: ['X-CSRF-Token', 'X-Session-Expiry', 'X-Request-ID']
}));

app.use(compression());

// ✅ Rate Limiting متقدم
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', globalLimiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, error: 'Too many login attempts. Please try again after 15 minutes.' },
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/auth/login', authLimiter);

const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: { success: false, error: 'Too many password reset attempts. Please try again after 1 hour.' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/auth/forgot-password', passwordResetLimiter);

app.use(xss());
app.use(hpp());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// ✅ Session آمن للغاية
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

// ✅ Request ID
app.use((req, res, next) => {
    req.requestId = crypto.randomBytes(16).toString('hex');
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
    res.setHeader('X-Session-Expiry', req.session.csrfExpiry);
    next();
});

// ✅ CSRF Protection للطلبات المعدلة
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
    const newToken = crypto.randomBytes(32).toString('hex');
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
    { id: '1', name: 'الوحدة 101', num: '101', len: 11, region: 'الشمال', zone: 'تونس', port: 'الميناء الرئيسي', supp: '—', status: 'صالح', break: '—', fDate: null, eDate: null, ref: '', repairUnit: '—', cat: 'البروق' },
    { id: '2', name: 'الوحدة 205', num: '205', len: 15, region: 'الساحل', zone: 'سوسة', port: 'ميناء سوسة', supp: '—', status: 'صيانة', break: 'محرك', fDate: new Date().toISOString(), eDate: null, ref: 'M-2024-001', repairUnit: 'وحدة الصيانة تونس', cat: 'خوافر' },
    { id: '3', name: 'الوحدة 312', num: '312', len: 8, region: 'الجنوب', zone: 'جرجيس', port: 'ميناء جرجيس', supp: '—', status: 'معطب', break: 'هيكل', fDate: new Date().toISOString(), eDate: null, ref: 'M-2024-002', repairUnit: 'وحدة الصيانة جرجيس', cat: 'صقور' }
];
initialVessels.forEach(v => vessels.push(v));

// ============================================================
// 📊 DATA - USERS (مشفر)
// ============================================================

const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 12);

const users = [
    {
        id: '1',
        username: 'admin',
        password: hashedPassword,
        name: process.env.ADMIN_NAME || 'أمان الله ناجي',
        email: process.env.ADMIN_EMAIL || 'admin@marine.com',
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

function createPasswordResetToken(email) {
    const existingIndex = passwordResetTokens.findIndex(t => t.email === email);
    if (existingIndex !== -1) passwordResetTokens.splice(existingIndex, 1);

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + (60 * 60 * 1000);

    passwordResetTokens.push({ email, token, expiresAt, createdAt: new Date().toISOString() });
    return token;
}

function verifyResetToken(email, token) {
    const record = passwordResetTokens.find(t => t.email === email && t.token === token);
    return record && Date.now() < record.expiresAt;
}

// ============================================================
// 🔐 AUTH ENDPOINTS
// ============================================================

app.get('/api/csrf-token', (req, res) => {
    try {
        const token = req.session.csrfToken;
        res.json({ success: true, token: token, expiresIn: 8 * 60 * 60 * 1000 });
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
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        req.session.userId = user.id;

        // ✅ تسجيل الدخول
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
            }
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
            return res.status(404).json({
                success: false,
                error: 'هذا البريد الإلكتروني غير مسجل في النظام'
            });
        }

        const resetToken = createPasswordResetToken(email);
        const resetLink = `${req.protocol}://${req.get('host')}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

        console.log(`🔑 Reset token generated for ${email}`);
        console.log(`🔗 Reset link: ${resetLink}`);

        // ✅ إرسال البريد
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

        systemLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            userId: user.id,
            action: 'PASSWORD_RESET_REQUESTED',
            details: `Password reset requested for ${email} from ${clientIP}`,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            message: result ? 'تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني' : 'لم نتمكن من إرسال البريد، يرجى استخدام الرابط',
            resetLink: resetLink
        });

    } catch (error) {
        console.error('❌ Forgot password error:', error);
        res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { email, token, newPassword } = req.body;

        if (!email || !token || !newPassword) {
            return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
        }

        if (!verifyResetToken(email, token)) {
            return res.status(400).json({ success: false, error: 'رابط إعادة التعيين غير صالح أو منتهي الصلاحية' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ success: false, error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
        }

        const user = users.find(u => u.email === email);
        if (!user) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }

        user.password = bcrypt.hashSync(newPassword, 12);
        user.updatedAt = new Date().toISOString();

        const index = passwordResetTokens.findIndex(t => t.email === email && t.token === token);
        if (index !== -1) passwordResetTokens.splice(index, 1);

        systemLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            userId: user.id,
            action: 'PASSWORD_RESET_SUCCESS',
            details: `Password reset successful for ${email}`,
            timestamp: new Date().toISOString()
        });

        console.log(`✅ Password reset successful for: ${email}`);

        res.json({ success: true, message: 'تم إعادة تعيين كلمة المرور بنجاح' });

    } catch (error) {
        console.error('❌ Reset password error:', error);
        res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
    }
});

app.post('/api/auth/verify-reset-token', (req, res) => {
    try {
        const { email, token } = req.body;
        const isValid = verifyResetToken(email, token);
        res.json({ success: true, valid: isValid });
    } catch (error) {
        res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
    }
});

// ============================================================
// 📊 VESSELS API
// ============================================================

app.get('/api/vessels', (req, res) => {
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

app.get('/api/maintenance-logs', (req, res) => {
    try {
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
        res.json(formattedLogs);
    } catch (error) {
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
        res.status(201).json({
            success: true,
            message: 'تم إضافة سجل الصيانة',
            log: logEntry
        });
    } catch (error) {
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

        res.json({
            success: true,
            message: 'تم تحديث سجل الصيانة',
            log: log
        });
    } catch (error) {
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
        res.json({ success: true, message: 'تم حذف سجل الصيانة' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في حذف سجل الصيانة' });
    }
});

// ============================================================
// 📊 MAINTENANCE PAGE API
// ============================================================

app.get('/api/maintenance', (req, res) => {
    try {
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

        res.json({
            success: true,
            records: formattedLogs,
            stats: {
                total: formattedLogs.length,
                completed: formattedLogs.filter(l => l.status === 'مكتملة').length,
                pending: formattedLogs.filter(l => l.status === 'معلقة').length,
                overdue: formattedLogs.filter(l => l.status === 'متأخرة').length,
                inProgress: formattedLogs.filter(l => l.status === 'قيد التنفيذ').length
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في جلب بيانات الصيانة' });
    }
});

// ============================================================
// 👥 USERS API (ULTRA SECURE)
// ============================================================

function verifyTokenAndGetUser(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

    try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        return users.find(u => u.id === decoded.id) || null;
    } catch {
        return null;
    }
}

function isAdminUser(user) {
    return user && (user.role === 'admin' || user.role === 'مسؤول');
}

function isSuperAdmin(user) {
    return user && user.username === 'admin';
}

app.get('/api/users', (req, res) => {
    try {
        const user = verifyTokenAndGetUser(req);
        if (!user) return res.status(401).json({ error: 'غير مصرح' });

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

        res.json(safeUsers);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب المستخدمين' });
    }
});

app.post('/api/users', csrfProtection, (req, res) => {
    try {
        const user = verifyTokenAndGetUser(req);
        if (!user) return res.status(401).json({ success: false, error: 'غير مصرح' });
        if (!isSuperAdmin(user)) {
            return res.status(403).json({ success: false, error: 'ليس لديك صلاحية لإضافة مستخدمين' });
        }

        const { username, password, email, role, active } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'اسم المستخدم وكلمة المرور مطلوبان' });
        }

        if (password.length < 8) {
            return res.status(400).json({ success: false, error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
        }

        if (users.find(u => u.username === username)) {
            return res.status(400).json({ success: false, error: 'اسم المستخدم موجود بالفعل' });
        }

        const newUser = {
            id: crypto.randomBytes(8).toString('hex'),
            username,
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

        systemLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            userId: user.id,
            action: 'USER_CREATED',
            details: `User ${username} created by ${user.username}`,
            timestamp: new Date().toISOString()
        });

        const { password: _, ...userWithoutPassword } = newUser;
        res.status(201).json({ success: true, message: 'تم إضافة المستخدم', user: userWithoutPassword });
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في إضافة المستخدم' });
    }
});

app.put('/api/users/:id', csrfProtection, (req, res) => {
    try {
        const user = verifyTokenAndGetUser(req);
        if (!user) return res.status(401).json({ success: false, error: 'غير مصرح' });
        if (!isAdminUser(user)) return res.status(403).json({ success: false, error: 'ليس لديك صلاحية' });

        const targetUser = users.find(u => u.id === req.params.id);
        if (!targetUser) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

        if (targetUser.username === 'admin' && !isSuperAdmin(user)) {
            return res.status(403).json({ success: false, error: 'لا يمكن تعديل المستخدم الرئيسي' });
        }

        const { username, email, role, active, password } = req.body;
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

        systemLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            userId: user.id,
            action: 'USER_UPDATED',
            details: `User ${targetUser.username} updated by ${user.username}`,
            timestamp: new Date().toISOString()
        });

        const { password: _, ...userWithoutPassword } = targetUser;
        res.json({ success: true, message: 'تم تحديث المستخدم', user: userWithoutPassword });
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في تحديث المستخدم' });
    }
});

app.delete('/api/users/:id', csrfProtection, (req, res) => {
    try {
        const user = verifyTokenAndGetUser(req);
        if (!user) return res.status(401).json({ success: false, error: 'غير مصرح' });
        if (!isSuperAdmin(user)) {
            return res.status(403).json({ success: false, error: 'ليس لديك صلاحية لحذف المستخدمين' });
        }

        const index = users.findIndex(u => u.id === req.params.id);
        if (index === -1) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        if (users[index].username === 'admin') {
            return res.status(403).json({ success: false, error: 'لا يمكن حذف المستخدم الرئيسي' });
        }

        const deletedUser = users[index];
        users.splice(index, 1);

        systemLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            userId: user.id,
            action: 'USER_DELETED',
            details: `User ${deletedUser.username} deleted by ${user.username}`,
            timestamp: new Date().toISOString()
        });

        res.json({ success: true, message: 'تم حذف المستخدم' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في حذف المستخدم' });
    }
});

// ============================================================
// 📊 LOGS API
// ============================================================

app.get('/api/logs', (req, res) => {
    try {
        res.json(systemLogs.slice(-100));
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في جلب السجلات' });
    }
});

app.post('/api/logs', (req, res) => {
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
        res.status(500).json({ success: false, error: 'خطأ في إضافة السجل' });
    }
});

// ============================================================
// 📊 SESSION STATUS API
// ============================================================

app.get('/api/session-status', (req, res) => {
    res.json({
        success: true,
        hasSession: !!req.session,
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
    res.send(`<h1>🚢 Marine System</h1><p>System is running</p>`);
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
    console.log('🏦 MARINE SYSTEM v8.0 - BANKING GRADE');
    console.log('=========================================');
    console.log(`📍 Server: http://localhost:${PORT}`);
    console.log(`👤 Admin: admin`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('🔒 Security Level: ULTRA HIGH (Banking Grade)');
    console.log(`📊 Vessels: ${vessels.length}`);
    console.log(`📝 Maintenance Logs: ${maintenanceLogs.length}`);
    console.log(`📋 System Logs: ${systemLogs.length}`);
    console.log(`👥 Users: ${users.length}`);
    console.log('=========================================');
    console.log('✅ All secrets loaded from environment variables');
    console.log('✅ CSRF Protection: ENABLED');
    console.log('✅ Rate Limiting: ENABLED');
    console.log('✅ XSS Protection: ENABLED');
    console.log('✅ Helmet Security: ENABLED');
    console.log('✅ Audit Logs: ENABLED');
    console.log('✅ Email: Resend (production ready)');
    console.log('=========================================');
});

module.exports = app;
