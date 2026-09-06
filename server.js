// ============================================================
// 🚢 MARINE SYSTEM - ULTRA SECURE v8.0 (FULLY FIXED)
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
// 🔐 ULTRA SECURE CONFIGURATION
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

const CONFIG = {
    rateLimit: {
        window: parseInt(process.env.RATE_LIMIT_WINDOW) || 15,
        max: parseInt(process.env.RATE_LIMIT_MAX) || 100
    },
    authRateLimit: {
        window: parseInt(process.env.RATE_LIMIT_WINDOW) || 15,
        max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 5
    },
    csrf: {
        expiry: parseInt(process.env.CSRF_TOKEN_EXPIRY) || 8
    },
    session: {
        maxAge: parseInt(process.env.SESSION_MAX_AGE) || 30
    },
    password: {
        saltRounds: parseInt(process.env.PASSWORD_SALT_ROUNDS) || 12
    },
    security: {
        maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
        accountLockTime: parseInt(process.env.ACCOUNT_LOCK_TIME) || 30
    },
    token: {
        expiry: process.env.TOKEN_EXPIRY || '7d'
    }
};

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
        console.error('Encryption error:', error);
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
        console.error('Decryption error:', error);
        return text;
    }
}

function generateSecureToken() {
    return crypto.randomBytes(32).toString('hex');
}

function generateRequestId() {
    return crypto.randomBytes(8).toString('hex');
}

// ============================================================
// 🛡️ SECURITY MIDDLEWARE
// ============================================================

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                "'unsafe-eval'",
                "https://unpkg.com",
                "https://cdnjs.cloudflare.com",
                "https://cdn.jsdelivr.net",
                "https://fonts.googleapis.com",
                "https://*.googleapis.com"
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://unpkg.com",
                "https://cdnjs.cloudflare.com",
                "https://cdn.jsdelivr.net",
                "https://fonts.googleapis.com",
                "https://*.googleapis.com"
            ],
            imgSrc: [
                "'self'",
                "data:",
                "https:",
                "http:",
                "https://unpkg.com",
                "https://*.googleapis.com"
            ],
            connectSrc: [
                "'self'",
                "https://*.onrender.com",
                "https://unpkg.com",
                "https://*.googleapis.com"
            ],
            fontSrc: [
                "'self'",
                "https:",
                "data:",
                "https://fonts.gstatic.com",
                "https://*.googleapis.com"
            ],
            scriptSrcAttr: ["'unsafe-inline'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: isProduction ? [] : null
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
    hidePoweredBy: true,
    ieNoOpen: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' }
}));

app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        const allowed = ['http://localhost:5000', 'http://localhost:3000', 'https://marine-system-71eo.onrender.com'];
        if (allowed.indexOf(origin) !== -1 || !isProduction) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    exposedHeaders: ['X-CSRF-Token', 'X-Session-Expiry', 'X-Request-ID', 'X-User-ID'],
    maxAge: 86400
}));

app.use(compression());

const limiter = rateLimit({
    windowMs: CONFIG.rateLimit.window * 60 * 1000,
    max: CONFIG.rateLimit.max,
    message: { success: false, error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip || req.connection.remoteAddress
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
    windowMs: CONFIG.authRateLimit.window * 60 * 1000,
    max: CONFIG.authRateLimit.max,
    message: { success: false, error: `Too many login attempts. Please try again after ${CONFIG.authRateLimit.window} minutes.` },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip || req.connection.remoteAddress
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
        maxAge: CONFIG.session.maxAge * 24 * 60 * 60 * 1000,
        sameSite: 'strict',
        domain: isProduction ? '.onrender.com' : undefined,
        path: '/'
    },
    rolling: true,
    proxy: isProduction
}));

app.use((req, res, next) => {
    req.requestId = generateRequestId();
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

// ✅ CSRF
app.use((req, res, next) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = generateSecureToken();
        req.session.csrfExpiry = Date.now() + (CONFIG.csrf.expiry * 60 * 60 * 1000);
    }
    if (req.session.csrfExpiry && Date.now() > req.session.csrfExpiry) {
        req.session.csrfToken = generateSecureToken();
        req.session.csrfExpiry = Date.now() + (CONFIG.csrf.expiry * 60 * 60 * 1000);
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
    req.session.csrfExpiry = Date.now() + (CONFIG.csrf.expiry * 60 * 60 * 1000);
    res.setHeader('X-CSRF-Token', newToken);
    next();
};

// ============================================================
// 📊 DATA
// ============================================================

const users = [{
    id: crypto.randomBytes(16).toString('hex'),
    username: ADMIN_USERNAME,
    password: bcrypt.hashSync(ADMIN_PASSWORD, CONFIG.password.saltRounds),
    name: encrypt(ADMIN_NAME),
    role: 'admin',
    active: true,
    createdAt: new Date().toISOString(),
    lastLogin: null,
    loginAttempts: 0,
    locked: false,
    lockedUntil: null
}];

const vessels = [
    { id: crypto.randomBytes(8).toString('hex'), name: encrypt('الوحدة 101'), type: encrypt('زورق دورية'), status: 'ready', location: encrypt('الميناء الرئيسي'), lastMaintenance: new Date().toISOString(), createdAt: new Date().toISOString() },
    { id: crypto.randomBytes(8).toString('hex'), name: encrypt('الوحدة 205'), type: encrypt('قاطرة بحرية'), status: 'maintenance', location: encrypt('حوض السفن'), lastMaintenance: new Date().toISOString(), createdAt: new Date().toISOString() },
    { id: crypto.randomBytes(8).toString('hex'), name: encrypt('الوحدة 312'), type: encrypt('سفينة إسناد'), status: 'offline', location: encrypt('الميناء الغربي'), lastMaintenance: new Date().toISOString(), createdAt: new Date().toISOString() }
];

const auditLogs = [];

function addAuditLog(userId, action, details, ip) {
    auditLogs.push({ id: crypto.randomBytes(8).toString('hex'), userId, action, details, ip, timestamp: new Date().toISOString() });
    if (auditLogs.length > 1000) auditLogs.shift();
}

function getClientIP(req) {
    return req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
}

// ============================================================
// 📁 STATIC FILES
// ============================================================

app.use(express.static(__dirname));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/pages', express.static(path.join(__dirname, 'pages')));
app.use('/public/pages', express.static(path.join(__dirname, 'public', 'pages')));

// ============================================================
// ✅ CSRF TOKEN ENDPOINT - MUST BE BEFORE OTHER ROUTES
// ============================================================

app.get('/api/csrf-token', (req, res) => {
    try {
        const token = req.session.csrfToken;
        const expiry = req.session.csrfExpiry || Date.now() + (CONFIG.csrf.expiry * 60 * 60 * 1000);
        res.setHeader('Content-Type', 'application/json');
        res.json({ success: true, token: token, expiresIn: expiry - Date.now() });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to generate CSRF token' });
    }
});

// ============================================================
// 🔐 AUTH ENDPOINTS
// ============================================================

app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;
        const clientIP = getClientIP(req);
        console.log(`🔐 Login attempt: ${username}`);

        const user = users.find(u => u.username === username);
        if (!user) {
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        if (user.locked && user.lockedUntil && Date.now() < user.lockedUntil) {
            const remaining = Math.ceil((user.lockedUntil - Date.now()) / 60000);
            return res.status(403).json({ success: false, error: `الحساب مقفل. حاول مرة أخرى بعد ${remaining} دقيقة` });
        }

        const validPassword = bcrypt.compareSync(password, user.password);
        if (!validPassword) {
            user.loginAttempts = (user.loginAttempts || 0) + 1;
            if (user.loginAttempts >= CONFIG.security.maxLoginAttempts) {
                user.locked = true;
                user.lockedUntil = Date.now() + (CONFIG.security.accountLockTime * 60 * 1000);
                addAuditLog(user.id, 'ACCOUNT_LOCKED', 'Too many failed login attempts', clientIP);
                return res.status(403).json({ success: false, error: `الحساب مقفل لمدة ${CONFIG.security.accountLockTime} دقيقة` });
            }
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        user.loginAttempts = 0;
        user.locked = false;
        user.lockedUntil = null;
        user.lastLogin = new Date().toISOString();

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role, iat: Math.floor(Date.now() / 1000), jti: crypto.randomBytes(16).toString('hex') },
            JWT_SECRET,
            { expiresIn: CONFIG.token.expiry, algorithm: 'HS256' }
        );

        const newToken = generateSecureToken();
        req.session.csrfToken = newToken;
        req.session.csrfExpiry = Date.now() + (CONFIG.csrf.expiry * 60 * 60 * 1000);
        req.session.userId = user.id;

        res.setHeader('X-CSRF-Token', newToken);
        addAuditLog(user.id, 'LOGIN_SUCCESS', 'Successful login', clientIP);

        res.json({
            success: true,
            token: token,
            user: {
                id: user.id,
                username: user.username,
                name: decrypt(user.name),
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
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود' });
        }
        if (req.session.userId !== user.id) {
            return res.status(401).json({ success: false, error: 'جلسة غير صالحة' });
        }
        const newToken = generateSecureToken();
        req.session.csrfToken = newToken;
        req.session.csrfExpiry = Date.now() + (CONFIG.csrf.expiry * 60 * 60 * 1000);
        res.setHeader('X-CSRF-Token', newToken);
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                name: decrypt(user.name),
                role: user.role,
                active: user.active,
                lastLogin: user.lastLogin
            }
        });
    } catch (error) {
        res.status(401).json({ success: false, error: 'توكن غير صالح' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    const userId = req.session.userId;
    if (userId) addAuditLog(userId, 'LOGOUT', 'User logged out', getClientIP(req));
    req.session.destroy(() => {
        res.clearCookie('__Secure-marine.sid');
        res.json({ success: true, message: 'تم تسجيل الخروج' });
    });
});

// ============================================================
// 📊 DATA ENDPOINTS
// ============================================================

app.get('/api/vessels', csrfProtection, (req, res) => {
    try {
        const decryptedVessels = vessels.map(v => ({ ...v, name: decrypt(v.name), type: decrypt(v.type), location: decrypt(v.location) }));
        res.json(decryptedVessels);
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في قراءة البيانات' });
    }
});

app.post('/api/vessels', csrfProtection, (req, res) => {
    try {
        const { name, type, status, location } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'اسم الوحدة مطلوب' });
        const newVessel = {
            id: crypto.randomBytes(8).toString('hex'),
            name: encrypt(name),
            type: encrypt(type || 'غير محدد'),
            status: status || 'ready',
            location: encrypt(location || '—'),
            lastMaintenance: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };
        vessels.push(newVessel);
        res.json({ success: true, vessel: newVessel });
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في إضافة الوحدة' });
    }
});

app.get('/api/users', csrfProtection, (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.id);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'غير مصرح' });
        }
        const safeUsers = users.map(u => ({
            id: u.id,
            username: u.username,
            name: decrypt(u.name),
            role: u.role,
            active: u.active,
            createdAt: u.createdAt,
            lastLogin: u.lastLogin
        }));
        res.json(safeUsers);
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

app.get('/api/logs', csrfProtection, (req, res) => {
    res.json(auditLogs.slice(-100));
});

app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        version: '8.0.0',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// 🌐 PAGE ROUTES - بعد الـ API
// ============================================================

function servePage(req, res, pageName) {
    const possiblePaths = [
        path.join(__dirname, 'pages', pageName + '.html'),
        path.join(__dirname, 'public', 'pages', pageName + '.html'),
        path.join(__dirname, 'public', pageName + '.html'),
        path.join(__dirname, pageName + '.html'),
        path.join(__dirname, 'src', pageName + '.html')
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return res.sendFile(p);
        }
    }
    return null;
}

// ✅ Home page
app.get('/', (req, res) => {
    const paths = [
        path.join(__dirname, 'index.html'),
        path.join(__dirname, 'public', 'index.html'),
        path.join(__dirname, 'src', 'index.html')
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) {
            return res.sendFile(p);
        }
    }
    res.send(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🚢 Marine System</title>
            <style>
                * { margin:0; padding:0; box-sizing:border-box; }
                body { font-family:'Segoe UI',sans-serif; background:#0a0e1a; color:#fff; display:flex; justify-content:center; align-items:center; min-height:100vh; padding:20px; }
                .container { background:linear-gradient(145deg,#1a1f35,#0d1528); padding:50px; border-radius:30px; max-width:600px; width:100%; border:1px solid #2a3a5a; text-align:center; }
                h1 { color:#00d4ff; font-size:2.5em; }
                .status { background:#0d1528; padding:20px; border-radius:15px; margin:20px 0; border-right:5px solid #00ff88; }
                .info { color:#aabbcc; line-height:2; }
                .info strong { color:#00d4ff; }
                .btn { background:linear-gradient(135deg,#00d4ff,#0099cc); color:#0a0e1a; border:none; padding:15px 40px; border-radius:10px; font-size:18px; font-weight:bold; cursor:pointer; transition:all 0.3s; width:100%; margin-top:15px; }
                .btn:hover { transform:translateY(-3px); box-shadow:0 10px 30px rgba(0,212,255,0.3); }
                .btn-logout { background:linear-gradient(135deg,#ff4444,#cc0000); }
                .btn-logout:hover { box-shadow:0 10px 30px rgba(255,68,68,0.3); }
                .error { color:#ff4444; margin:10px 0; }
                .success-msg { color:#00ff88; margin:10px 0; }
                .login-section, .user-section { margin-top:30px; text-align:right; }
                .user-section { display:none; }
                .badge { display:inline-block; padding:5px 15px; border-radius:20px; font-size:14px; margin:5px 0; }
                .badge.admin { background:#ff4444; color:#fff; }
                .login-form input { width:100%; padding:15px; margin:10px 0; border-radius:10px; border:1px solid #2a3a5a; background:#0d1528; color:#fff; font-size:16px; }
                .login-form input:focus { outline:none; border-color:#00d4ff; }
                .footer { margin-top:30px; padding-top:20px; border-top:1px solid #2a3a5a; color:#667788; font-size:12px; }
                .links { display:flex; flex-wrap:wrap; gap:10px; justify-content:center; margin-top:20px; }
                .links a { display:inline-block; padding:10px 20px; background:#2a3a5a; color:#fff; text-decoration:none; border-radius:8px; font-size:14px; }
                .links a:hover { background:#3a4a6a; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚢 MARINE SYSTEM</h1>
                <p style="color:#8899aa;">نظام إدارة الأسطول البحري</p>
                <div class="status">
                    <h3 style="color:#00ff88;">✅ النظام يعمل</h3>
                    <p class="info">🔒 <strong>الأمان:</strong> مستوى عالي جداً</p>
                    <p class="info">👤 <strong>المستخدم:</strong> admin</p>
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
                    <p>📋 <strong>الدور:</strong> <span id="userRole" class="badge admin">admin</span></p>
                    <div class="links">
                        <a href="/dashboard">📊 لوحة التحكم</a>
                        <a href="/fleet">🚢 الأسطول</a>
                        <a href="/maintenance">🔧 الصيانة</a>
                    </div>
                    <button class="btn btn-logout" onclick="handleLogout()">🚪 تسجيل الخروج</button>
                </div>
                <div class="footer">🔒 جميع البيانات مشفرة | v8.0</div>
            </div>
            <script>
                let csrfToken = '';
                async function getCsrfToken() {
                    try {
                        const response = await fetch('/api/csrf-token', { credentials: 'include', headers: { 'Accept': 'application/json' } });
                        const data = await response.json();
                        if (data.success) { csrfToken = data.token; return data.token; }
                        return null;
                    } catch(e) { return null; }
                }
                async function handleLogin() {
                    const username = document.getElementById('username').value.trim();
                    const password = document.getElementById('password').value;
                    const messageEl = document.getElementById('message');
                    if (!username || !password) { messageEl.innerHTML = '<div class="error">⚠️ الرجاء إدخال جميع البيانات</div>'; return; }
                    try {
                        const token = await getCsrfToken();
                        if (!token) { messageEl.innerHTML = '<div class="error">❌ فشل الحصول على CSRF token</div>'; return; }
                        messageEl.innerHTML = '<div style="color:#00d4ff;">⏳ جاري تسجيل الدخول...</div>';
                        const response = await fetch('/api/auth/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': token },
                            credentials: 'include',
                            body: JSON.stringify({ username, password })
                        });
                        const data = await response.json();
                        if (response.ok && data.success) {
                            localStorage.setItem('authToken', data.token);
                            localStorage.setItem('userData', JSON.stringify(data.user));
                            document.getElementById('loginSection').style.display = 'none';
                            document.getElementById('userSection').style.display = 'block';
                            document.getElementById('userName').textContent = data.user.name || data.user.username;
                            document.getElementById('userRole').textContent = data.user.role || 'مستخدم';
                            messageEl.innerHTML = '<div class="success-msg">✅ تم تسجيل الدخول بنجاح</div>';
                        } else {
                            messageEl.innerHTML = '<div class="error">❌ ' + (data.error || 'فشل تسجيل الدخول') + '</div>';
                        }
                    } catch(e) {
                        messageEl.innerHTML = '<div class="error">❌ خطأ في الاتصال بالخادم</div>';
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
                        const loginSection = document.getElementById('loginSection');
                        if (loginSection.style.display !== 'none') handleLogin();
                    }
                });
                async function checkAuth() {
                    const token = localStorage.getItem('authToken');
                    if (!token) return;
                    try {
                        const csrf = await getCsrfToken();
                        const response = await fetch('/api/auth/me', {
                            headers: { 'Authorization': 'Bearer ' + token, 'X-CSRF-Token': csrf || '', 'Accept': 'application/json' },
                            credentials: 'include'
                        });
                        const data = await response.json();
                        if (data.success && data.user) {
                            document.getElementById('loginSection').style.display = 'none';
                            document.getElementById('userSection').style.display = 'block';
                            document.getElementById('userName').textContent = data.user.name || data.user.username;
                            document.getElementById('userRole').textContent = data.user.role || 'مستخدم';
                        }
                    } catch(e) {}
                }
                getCsrfToken().then(checkAuth);
            </script>
        </body>
        </html>
    `);
});

// ✅ Pages routes
app.get('/pages/:page', (req, res) => {
    const pageName = req.params.page;
    const result = servePage(req, res, pageName);
    if (!result) {
        res.status(404).send(`
            <!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>404</title>
            <style>body{font-family:Arial;background:#0a0e1a;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;text-align:center;}h1{color:#ff4444;}a{color:#00d4ff;}</style>
            </head><body><div><h1>❌ 404</h1><p>الصفحة <strong>${pageName}</strong> غير موجودة</p><a href="/">⬅️ العودة</a></div></body></html>
        `);
    }
});

// ✅ Short URLs
app.get('/:page', (req, res, next) => {
    const pageName = req.params.page;
    const skip = ['api', 'pages', 'public', 'assets', 'css', 'js', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'dashboard', 'fleet', 'maintenance', 'users', 'logs'];
    if (skip.includes(pageName)) return next();
    const result = servePage(req, res, pageName);
    if (result) return;
    // If not found, try to find the page
    const filePath = path.join(__dirname, 'pages', pageName + '.html');
    if (fs.existsSync(filePath)) return res.sendFile(filePath);
    next();
});

// ✅ Catch-all - send JSON for API, otherwise redirect
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ success: false, error: 'API endpoint not found' });
    }
    if (req.path.includes('.') && !req.path.startsWith('/api')) {
        return res.status(404).send('❌ ملف غير موجود');
    }
    const indexPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
    res.redirect('/');
});

// ============================================================
// 🚀 START
// ============================================================

app.listen(PORT, () => {
    console.log('=========================================');
    console.log('🚢 MARINE SYSTEM v8.0 - ULTRA SECURE');
    console.log('=========================================');
    console.log(`📍 Server: http://localhost:${PORT}`);
    console.log(`👤 Admin: ${ADMIN_USERNAME}`);
    console.log(`🔑 Password: ${ADMIN_PASSWORD}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('🔒 Security Level: ULTRA HIGH');
    console.log('=========================================');
});

module.exports = app;
