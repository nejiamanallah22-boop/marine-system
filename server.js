// ============================================================
// 🚢 MARINE SYSTEM - FULL SERVER WITH ALL ROUTES
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

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// 🔐 CONFIGURATION
// ============================================================

function generateSecureKey(length = 64) {
    return crypto.randomBytes(length).toString('hex');
}

const isProduction = process.env.NODE_ENV === 'production';

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
    if (['/api/auth/login', '/api/csrf-token'].includes(req.path)) return next();

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
        email: 'admin@marine.com',
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

// ✅ إضافة بيانات أولية
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

// ✅ إضافة بيانات افتراضية إضافية
if (maintenanceLogs.length < 3) {
    maintenanceLogs.push({
        id: crypto.randomBytes(8).toString('hex'),
        vesselId: '1',
        vesselName: 'الوحدة 101',
        vesselNum: '101',
        type: 'صيانة دورية',
        status: 'مكتملة',
        date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        repairUnit: 'وحدة الصيانة تونس',
        cost: 500,
        notes: 'صيانة دورية كاملة',
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    });
    maintenanceLogs.push({
        id: crypto.randomBytes(8).toString('hex'),
        vesselId: '2',
        vesselName: 'الوحدة 205',
        vesselNum: '205',
        type: 'إصلاح محرك',
        status: 'قيد التنفيذ',
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        repairUnit: 'وحدة الصيانة صفاقس',
        cost: 1200,
        notes: 'استبدال المحرك',
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    });
    maintenanceLogs.push({
        id: crypto.randomBytes(8).toString('hex'),
        vesselId: '3',
        vesselName: 'الوحدة 312',
        vesselNum: '312',
        type: 'إصلاح هيكل',
        status: 'متأخرة',
        date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        repairUnit: 'وحدة الصيانة جرجيس',
        cost: 2000,
        notes: 'إصلاح الهيكل الخارجي',
        createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
    });
}

// ============================================================
// 📊 DATA - SYSTEM LOGS
// ============================================================

const systemLogs = [];

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
            { id: user.id, username: user.username, role: user.role },
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
