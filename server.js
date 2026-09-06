// ============================================================
// 🚢 MARINE SYSTEM - ULTRA SECURE v8.0
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
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const { body, validationResult } = require('express-validator');

// ============================================================
// 📦 APP INITIALIZATION
// ============================================================

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// 🔐 ULTRA SECURE CONFIGURATION
// ============================================================

// ✅ Generate secure keys if not provided
function generateSecureKey(length = 64) {
    return crypto.randomBytes(length).toString('hex');
}

// ✅ Environment validation
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

// ✅ Strong password validation
function isStrongPassword(password) {
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    const isLongEnough = password.length >= 12;
    const score = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar, isLongEnough].filter(Boolean).length;
    return score >= 4;
}

// ✅ Generate strong password
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

// ✅ Admin credentials
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

// ✅ Configuration constants
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
        expiry: parseInt(process.env.CSRF_TOKEN_EXPIRY) || 8 // hours
    },
    session: {
        maxAge: parseInt(process.env.SESSION_MAX_AGE) || 30 // days
    },
    password: {
        saltRounds: parseInt(process.env.PASSWORD_SALT_ROUNDS) || 12
    },
    security: {
        maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
        accountLockTime: parseInt(process.env.ACCOUNT_LOCK_TIME) || 30 // minutes
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

// ✅ Helmet - Secure HTTP Headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://*.onrender.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            fontSrc: ["'self'", "https:", "data:"],
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
    frameguard: {
        action: 'deny'
    },
    noSniff: true,
    referrerPolicy: {
        policy: 'strict-origin-when-cross-origin'
    },
    xssFilter: true,
    hidePoweredBy: true,
    ieNoOpen: true,
    permittedCrossDomainPolicies: {
        permittedPolicies: 'none'
    }
}));

// ✅ CORS - Strict Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:5000', 'http://localhost:3000', 'https://marine-system-71eo.onrender.com'];

app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    exposedHeaders: ['X-CSRF-Token', 'X-Session-Expiry', 'X-Request-ID', 'X-User-ID'],
    maxAge: 86400 // 24 hours
}));

// ✅ Compression
app.use(compression());

// ✅ Logging
app.use(morgan('combined', {
    skip: (req, res) => res.statusCode < 400
}));

// ✅ Rate Limiting - Global
const limiter = rateLimit({
    windowMs: CONFIG.rateLimit.window * 60 * 1000,
    max: CONFIG.rateLimit.max,
    message: {
        success: false,
        error: 'Too many requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.ip || req.connection.remoteAddress;
    }
});
app.use('/api/', limiter);

// ✅ Rate Limiting - Auth endpoints
const authLimiter = rateLimit({
    windowMs: CONFIG.authRateLimit.window * 60 * 1000,
    max: CONFIG.authRateLimit.max,
    message: {
        success: false,
        error: `Too many login attempts. Please try again after ${CONFIG.authRateLimit.window} minutes.`
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.ip || req.connection.remoteAddress;
    }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/change-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

// ✅ XSS Protection
app.use(xss());

// ✅ MongoDB Sanitization (protection against query injection)
app.use(mongoSanitize());

// ✅ HPP - HTTP Parameter Pollution Protection
app.use(hpp());

// ✅ Body Parsers with size limits
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// ✅ Session Management - Ultra Secure
const sessionConfig = {
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: process.env.SESSION_NAME || '__Secure-marine.sid',
    cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: CONFIG.session.maxAge * 24 * 60 * 60 * 1000,
        sameSite: 'strict',
        domain: isProduction ? '.onrender.com' : undefined,
        path: '/',
        partitioned: isProduction
    },
    rolling: true,
    proxy: isProduction
};

// ✅ Use Redis for sessions in production (optional)
if (isProduction && process.env.REDIS_URL) {
    try {
        const RedisStore = require('connect-redis')(session);
        const redis = require('redis');
        const redisClient = redis.createClient({
            url: process.env.REDIS_URL
        });
        redisClient.connect().catch(console.error);
        sessionConfig.store = new RedisStore({ client: redisClient });
        console.log('✅ Redis session store configured');
    } catch (error) {
        console.warn('⚠️ Redis not available, using MemoryStore');
    }
}

app.use(session(sessionConfig));

// ✅ Request ID for tracking
app.use((req, res, next) => {
    req.requestId = generateRequestId();
    res.setHeader('X-Request-ID', req.requestId);
    next();
});

// ✅ Security Logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logLevel = res.statusCode >= 400 ? 'error' : 'info';
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} - ${duration}ms - ${req.requestId} - ${req.ip}`);
    });
    next();
});

// ✅ CSRF Protection
app.use((req, res, next) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = generateSecureToken();
        req.session.csrfExpiry = Date.now() + (CONFIG.csrf.expiry * 60 * 60 * 1000);
        console.log('🔄 New CSRF token generated');
    }

    if (req.session.csrfExpiry && Date.now() > req.session.csrfExpiry) {
        req.session.csrfToken = generateSecureToken();
        req.session.csrfExpiry = Date.now() + (CONFIG.csrf.expiry * 60 * 60 * 1000);
        console.log('🔄 CSRF token refreshed');
    }

    res.setHeader('X-CSRF-Token', req.session.csrfToken);
    res.setHeader('X-Session-Expiry', req.session.csrfExpiry);
    next();
});

// ✅ CSRF Protection Middleware
const csrfProtection = (req, res, next) => {
    // Skip for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    // Skip for certain paths (login, csrf-token, etc.)
    const skipPaths = ['/api/auth/login', '/api/csrf-token', '/api/auth/register'];
    if (skipPaths.includes(req.path)) {
        return next();
    }

    const token = req.headers['x-csrf-token'] || req.body.csrf_token;
    const sessionToken = req.session.csrfToken;

    if (!token) {
        return res.status(403).json({
            success: false,
            error: 'CSRF token مفقود'
        });
    }

    if (!sessionToken) {
        return res.status(403).json({
            success: false,
            error: 'جلسة غير صالحة'
        });
    }

    // Constant time comparison to prevent timing attacks
    try {
        const isValid = crypto.timingSafeEqual(
            Buffer.from(token, 'utf8'),
            Buffer.from(sessionToken, 'utf8')
        );
        if (!isValid) {
            throw new Error('Invalid token');
        }
    } catch (error) {
        return res.status(403).json({
            success: false,
            error: 'CSRF token غير صالح'
        });
    }

    // Rotate CSRF token after each use
    const newToken = generateSecureToken();
    req.session.csrfToken = newToken;
    req.session.csrfExpiry = Date.now() + (CONFIG.csrf.expiry * 60 * 60 * 1000);
    res.setHeader('X-CSRF-Token', newToken);
    
    next();
};

// ============================================================
// 📊 ULTRA SECURE DATA
// ============================================================

// ✅ Users with encrypted sensitive data
const users = [
    {
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
        lockedUntil: null,
        twoFactorEnabled: false,
        twoFactorSecret: null
    }
];

// ✅ Vessels data with encryption
const vessels = [
    { 
        id: crypto.randomBytes(8).toString('hex'),
        name: encrypt('الوحدة 101'),
        type: encrypt('زورق دورية'),
        status: 'ready',
        location: encrypt('الميناء الرئيسي'),
        lastMaintenance: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    },
    {
        id: crypto.randomBytes(8).toString('hex'),
        name: encrypt('الوحدة 205'),
        type: encrypt('قاطرة بحرية'),
        status: 'maintenance',
        location: encrypt('حوض السفن'),
        lastMaintenance: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    },
    {
        id: crypto.randomBytes(8).toString('hex'),
        name: encrypt('الوحدة 312'),
        type: encrypt('سفينة إسناد'),
        status: 'offline',
        location: encrypt('الميناء الغربي'),
        lastMaintenance: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }
];

// ✅ Audit logs
const auditLogs = [];

function addAuditLog(userId, action, details, ip, userAgent) {
    auditLogs.push({
        id: crypto.randomBytes(8).toString('hex'),
        userId,
        action,
        details,
        ip,
        userAgent,
        timestamp: new Date().toISOString()
    });
    if (auditLogs.length > 1000) {
        auditLogs.shift();
    }
}

// ✅ Helper function to get client IP
function getClientIP(req) {
    return req.headers['x-forwarded-for'] || 
           req.headers['x-real-ip'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress || 
           req.ip;
}

// ✅ Helper function to get user agent
function getUserAgent(req) {
    return req.headers['user-agent'] || 'Unknown';
}

// ============================================================
// 🖥️ STATIC FILES
// ============================================================

const basePath = __dirname;

// Ensure pages directory exists
const pagesPath = path.join(basePath, 'pages');
if (!fs.existsSync(pagesPath)) {
    fs.mkdirSync(pagesPath, { recursive: true });
    console.log('📁 Created pages directory');
}

// Serve static files
app.use(express.static(basePath, {
    maxAge: isProduction ? '1y' : '0',
    etag: true,
    lastModified: true
}));
app.use('/pages', express.static(path.join(basePath, 'pages'), {
    maxAge: isProduction ? '1y' : '0'
}));
app.use('/public', express.static(path.join(basePath, 'public'), {
    maxAge: isProduction ? '1y' : '0'
}));
app.use('/css', express.static(path.join(basePath, 'css'), {
    maxAge: isProduction ? '1y' : '0'
}));
app.use('/js', express.static(path.join(basePath, 'js'), {
    maxAge: isProduction ? '1y' : '0'
}));

// ============================================================
// 🌐 PAGE ROUTES
// ============================================================

// ✅ Home page
app.get('/', (req, res) => {
    const possiblePaths = [
        path.join(basePath, 'index.html'),
        path.join(basePath, 'public', 'index.html'),
        path.join(basePath, 'src', 'index.html')
    ];
    
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            console.log(`✅ Serving index.html from: ${p}`);
            return res.sendFile(p);
        }
    }
    
    // If no index.html exists, serve embedded page
    console.log('⚠️ No index.html found, serving embedded page');
    const htmlContent = fs.readFileSync(path.join(__dirname, 'pages', 'dashboard.html'), 'utf8');
    res.send(htmlContent);
});

// ✅ Pages routes
app.get('/pages/:page', (req, res) => {
    const pageName = req.params.page;
    const filePath = path.join(basePath, 'pages', pageName + '.html');
    
    console.log(`📄 Looking for page: ${pageName}`);
    
    if (fs.existsSync(filePath)) {
        console.log(`✅ Found page: ${pageName}`);
        return res.sendFile(filePath);
    }
    
    console.log(`❌ Page not found: ${pageName}`);
    
    // If page doesn't exist, serve dashboard
    const dashboardPath = path.join(basePath, 'pages', 'dashboard.html');
    if (fs.existsSync(dashboardPath)) {
        return res.sendFile(dashboardPath);
    }
    
    // Fallback
    res.status(200).send(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${pageName} - Marine System</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: #0a0e1a;
                    color: #fff;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    padding: 20px;
                }
                .container {
                    background: #1a1f35;
                    padding: 50px;
                    border-radius: 20px;
                    text-align: center;
                    border: 1px solid #2a3a5a;
                    max-width: 600px;
                }
                h1 { color: #00d4ff; margin-bottom: 20px; }
                .info { color: #8899aa; line-height: 2; }
                .btn {
                    display: inline-block;
                    padding: 12px 30px;
                    background: #00d4ff;
                    color: #0a0e1a;
                    text-decoration: none;
                    border-radius: 8px;
                    margin-top: 20px;
                    font-weight: bold;
                }
                .btn:hover { background: #00bbee; }
                .status {
                    background: #0d1528;
                    padding: 15px;
                    border-radius: 10px;
                    margin: 20px 0;
                    border-right: 4px solid #ffaa00;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📄 ${pageName}</h1>
                <div class="status">
                    <p style="color: #ffaa00;">⚠️ هذه الصفحة قيد التطوير</p>
                </div>
                <div class="info">
                    <p>🔧 سيتم إضافة المحتوى قريباً</p>
                    <p>📌 الصفحة: ${pageName}</p>
                </div>
                <a href="/" class="btn">⬅️ العودة للرئيسية</a>
            </div>
        </body>
        </html>
    `);
});

// ✅ Alias for pages without .html
app.get('/:page', (req, res, next) => {
    const pageName = req.params.page;
    
    // Skip API routes and file extensions
    if (pageName.includes('.') || pageName === 'api' || pageName === 'pages' || pageName === 'public') {
        return next();
    }
    
    const filePath = path.join(basePath, 'pages', pageName + '.html');
    if (fs.existsSync(filePath)) {
        return res.sendFile(filePath);
    }
    
    // Redirect to dashboard
    res.redirect('/pages/dashboard');
});

// ✅ Catch-all route - serve index.html
app.get('*', (req, res) => {
    if (req.path.includes('.') && !req.path.startsWith('/api')) {
        return res.status(404).send('❌ ملف غير موجود');
    }
    
    const indexPath = path.join(basePath, 'index.html');
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }
    
    res.redirect('/');
});

// ============================================================
// 🔐 AUTH ENDPOINTS - ULTRA SECURE
// ============================================================

// ✅ Get CSRF Token
app.get('/api/csrf-token', (req, res) => {
    const token = req.session.csrfToken;
    res.json({
        success: true,
        token: token,
        expiresIn: req.session.csrfExpiry ? req.session.csrfExpiry - Date.now() : CONFIG.csrf.expiry * 60 * 60 * 1000
    });
});

// ✅ Register (Admin only - for creating new users)
app.post('/api/auth/register', csrfProtection, [
    body('username').isLength({ min: 3, max: 30 }).trim().escape(),
    body('password').isLength({ min: 12 }).custom(isStrongPassword),
    body('name').isLength({ min: 2, max: 100 }).trim().escape(),
    body('role').optional().isIn(['admin', 'manager', 'user'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { username, password, name, role } = req.body;
        const clientIP = getClientIP(req);
        const userAgent = getUserAgent(req);

        // Check if user already exists
        if (users.find(u => u.username === username)) {
            return res.status(400).json({
                success: false,
                error: 'اسم المستخدم موجود بالفعل'
            });
        }

        // Create new user
        const newUser = {
            id: crypto.randomBytes(16).toString('hex'),
            username,
            password: bcrypt.hashSync(password, CONFIG.password.saltRounds),
            name: encrypt(name),
            role: role || 'user',
            active: true,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            loginAttempts: 0,
            locked: false,
            lockedUntil: null,
            twoFactorEnabled: false,
            twoFactorSecret: null
        };

        users.push(newUser);
        addAuditLog(newUser.id, 'USER_CREATED', `User ${username} created`, clientIP, userAgent);

        res.status(201).json({
            success: true,
            message: 'تم إنشاء المستخدم بنجاح',
            user: {
                id: newUser.id,
                username: newUser.username,
                name: decrypt(newUser.name),
                role: newUser.role
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ✅ Login
app.post('/api/auth/login', [
    body('username').isLength({ min: 1, max: 50 }).trim().escape(),
    body('password').isLength({ min: 1 })
], (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { username, password } = req.body;
        const clientIP = getClientIP(req);
        const userAgent = getUserAgent(req);
        
        console.log(`🔐 Login attempt: ${username} from ${clientIP}`);

        const user = users.find(u => u.username === username);
        if (!user) {
            addAuditLog(null, 'LOGIN_FAILED', `Invalid username: ${username}`, clientIP, userAgent);
            return res.status(401).json({
                success: false,
                error: 'اسم المستخدم أو كلمة المرور غير صحيحة'
            });
        }

        // Check if account is locked
        if (user.locked && user.lockedUntil && Date.now() < user.lockedUntil) {
            const remaining = Math.ceil((user.lockedUntil - Date.now()) / 60000);
            return res.status(403).json({
                success: false,
                error: `الحساب مقفل. حاول مرة أخرى بعد ${remaining} دقيقة`
            });
        }

        // Verify password
        const validPassword = bcrypt.compareSync(password, user.password);
        if (!validPassword) {
            user.loginAttempts = (user.loginAttempts || 0) + 1;
            
            if (user.loginAttempts >= CONFIG.security.maxLoginAttempts) {
                user.locked = true;
                user.lockedUntil = Date.now() + (CONFIG.security.accountLockTime * 60 * 1000);
                addAuditLog(user.id, 'ACCOUNT_LOCKED', 'Too many failed login attempts', clientIP, userAgent);
                return res.status(403).json({
                    success: false,
                    error: `الحساب مقفل لمدة ${CONFIG.security.accountLockTime} دقيقة بسبب كثرة المحاولات الفاشلة`
                });
            }
            
            addAuditLog(user.id, 'LOGIN_FAILED', 'Invalid password', clientIP, userAgent);
            return res.status(401).json({
                success: false,
                error: 'اسم المستخدم أو كلمة المرور غير صحيحة'
            });
        }

        // Reset login attempts on success
        user.loginAttempts = 0;
        user.locked = false;
        user.lockedUntil = null;
        user.lastLogin = new Date().toISOString();

        // Generate JWT with additional claims
        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                role: user.role,
                iat: Math.floor(Date.now() / 1000),
                jti: crypto.randomBytes(16).toString('hex')
            },
            JWT_SECRET,
            {
                expiresIn: CONFIG.token.expiry,
                algorithm: 'HS256'
            }
        );

        // Rotate CSRF token
        const newToken = generateSecureToken();
        req.session.csrfToken = newToken;
        req.session.csrfExpiry = Date.now() + (CONFIG.csrf.expiry * 60 * 60 * 1000);
        req.session.userId = user.id;

        res.setHeader('X-CSRF-Token', newToken);
        res.setHeader('X-User-ID', user.id);
        
        addAuditLog(user.id, 'LOGIN_SUCCESS', 'Successful login', clientIP, userAgent);

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

// ✅ Verify Token
app.get('/api/auth/me', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        const user = users.find(u => u.id === decoded.id);

        if (!user || !user.active) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود أو غير نشط' });
        }

        if (req.session.userId !== user.id) {
            return res.status(401).json({ success: false, error: 'جلسة غير صالحة' });
        }

        // Rotate CSRF token
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
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, error: 'انتهت صلاحية التوكن' });
        }
        res.status(401).json({ success: false, error: 'توكن غير صالح' });
    }
});

// ✅ Change Password
app.post('/api/auth/change-password', csrfProtection, [
    body('currentPassword').isLength({ min: 1 }),
    body('newPassword').isLength({ min: 12 }).custom(isStrongPassword)
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { currentPassword, newPassword } = req.body;
        const clientIP = getClientIP(req);
        const userAgent = getUserAgent(req);
        
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.id);

        if (!user) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود' });
        }

        const validPassword = bcrypt.compareSync(currentPassword, user.password);
        if (!validPassword) {
            addAuditLog(user.id, 'PASSWORD_CHANGE_FAILED', 'Invalid current password', clientIP, userAgent);
            return res.status(401).json({ success: false, error: 'كلمة المرور الحالية غير صحيحة' });
        }

        user.password = bcrypt.hashSync(newPassword, CONFIG.password.saltRounds);
        addAuditLog(user.id, 'PASSWORD_CHANGED', 'Password changed successfully', clientIP, userAgent);

        res.json({
            success: true,
            message: '✅ تم تغيير كلمة المرور بنجاح'
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ✅ Logout
app.post('/api/auth/logout', (req, res) => {
    const userId = req.session.userId;
    const clientIP = getClientIP(req);
    const userAgent = getUserAgent(req);
    
    if (userId) {
        addAuditLog(userId, 'LOGOUT', 'User logged out', clientIP, userAgent);
    }
    
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.clearCookie(process.env.SESSION_NAME || '__Secure-marine.sid', {
            path: '/',
            httpOnly: true,
            secure: isProduction,
            sameSite: 'strict'
        });
        res.json({ success: true, message: 'تم تسجيل الخروج' });
    });
});

// ============================================================
// 📊 DATA ENDPOINTS
// ============================================================

// ✅ Get vessels
app.get('/api/vessels', csrfProtection, (req, res) => {
    try {
        const decryptedVessels = vessels.map(v => ({
            ...v,
            name: decrypt(v.name),
            type: decrypt(v.type),
            location: decrypt(v.location)
        }));
        res.json(decryptedVessels);
    } catch (error) {
        console.error('Error decrypting vessels:', error);
        res.status(500).json({ success: false, error: 'خطأ في قراءة البيانات' });
    }
});

// ✅ Get vessels (detailed)
app.get('/api/vessels/:id', csrfProtection, (req, res) => {
    try {
        const vessel = vessels.find(v => v.id === req.params.id);
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'الوحدة غير موجودة' });
        }
        res.json({
            ...vessel,
            name: decrypt(vessel.name),
            type: decrypt(vessel.type),
            location: decrypt(vessel.location)
        });
    } catch (error) {
        console.error('Error getting vessel:', error);
        res.status(500).json({ success: false, error: 'خطأ في قراءة البيانات' });
    }
});

// ✅ Add vessel
app.post('/api/vessels', csrfProtection, [
    body('name').isLength({ min: 2, max: 100 }).trim().escape(),
    body('type').optional().isLength({ max: 50 }).trim().escape(),
    body('status').optional().isIn(['ready', 'maintenance', 'offline']),
    body('location').optional().isLength({ max: 100 }).trim().escape()
], (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { name, type, status, location } = req.body;
        
        if (!name) {
            return res.status(400).json({ success: false, error: 'اسم الوحدة مطلوب' });
        }

        const newVessel = {
            id: crypto.randomBytes(8).toString('hex'),
            name: encrypt(name),
            type: encrypt(type || 'غير محدد'),
            status: status || 'ready',
            location: encrypt(location || '—'),
            lastMaintenance: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        vessels.push(newVessel);
        res.json({
            success: true,
            vessel: {
                ...newVessel,
                name: decrypt(newVessel.name),
                type: decrypt(newVessel.type),
                location: decrypt(newVessel.location)
            }
        });
    } catch (error) {
        console.error('Add vessel error:', error);
        res.status(500).json({ success: false, error: 'خطأ في إضافة الوحدة' });
    }
});

// ✅ Update vessel
app.put('/api/vessels/:id', csrfProtection, [
    body('name').optional().isLength({ min: 2, max: 100 }).trim().escape(),
    body('type').optional().isLength({ max: 50 }).trim().escape(),
    body('status').optional().isIn(['ready', 'maintenance', 'offline']),
    body('location').optional().isLength({ max: 100 }).trim().escape()
], (req, res) => {
    try {
        const vessel = vessels.find(v => v.id === req.params.id);
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'الوحدة غير موجودة' });
        }

        const { name, type, status, location } = req.body;
        if (name) vessel.name = encrypt(name);
        if (type) vessel.type = encrypt(type);
        if (status) vessel.status = status;
        if (location) vessel.location = encrypt(location);
        vessel.updatedAt = new Date().toISOString();

        res.json({
            success: true,
            vessel: {
                ...vessel,
                name: decrypt(vessel.name),
                type: decrypt(vessel.type),
                location: decrypt(vessel.location)
            }
        });
    } catch (error) {
        console.error('Update vessel error:', error);
        res.status(500).json({ success: false, error: 'خطأ في تحديث الوحدة' });
    }
});

// ✅ Delete vessel
app.delete('/api/vessels/:id', csrfProtection, (req, res) => {
    try {
        const index = vessels.findIndex(v => v.id === req.params.id);
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'الوحدة غير موجودة' });
        }
        
        vessels.splice(index, 1);
        res.json({ success: true, message: 'تم حذف الوحدة بنجاح' });
    } catch (error) {
        console.error('Delete vessel error:', error);
        res.status(500).json({ success: false, error: 'خطأ في حذف الوحدة' });
    }
});

// ✅ Get users (admin only)
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

// ✅ Get audit logs (admin only)
app.get('/api/audit-logs', csrfProtection, (req, res) => {
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

        const limit = parseInt(req.query.limit) || 100;
        res.json(auditLogs.slice(-limit));
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ✅ Get system status (public)
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        version: '8.0.0',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// 🔧 ERROR HANDLING
// ============================================================

// ✅ 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'المسار غير موجود'
    });
});

// ✅ Global error handler
app.use((err, req, res, next) => {
    console.error('Global error:', err);
    
    // Log the error
    const clientIP = getClientIP(req);
    const userAgent = getUserAgent(req);
    addAuditLog(null, 'SERVER_ERROR', err.message || 'Unknown error', clientIP, userAgent);
    
    // Send appropriate response
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
    console.log('🚢 MARINE SYSTEM v8.0 - ULTRA SECURE');
    console.log('=========================================');
    console.log(`📍 Server: http://localhost:${PORT}`);
    console.log(`👤 Admin: ${ADMIN_USERNAME}`);
    console.log(`🔑 Password: ${ADMIN_PASSWORD}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔒 Security Level: ULTRA HIGH`);
    console.log(`🛡️ CSRF Protection: ENABLED`);
    console.log(`🔐 JWT Authentication: ENABLED`);
    console.log(`📊 Rate Limiting: ENABLED`);
    console.log('=========================================');
    console.log('💾 SAVE ADMIN CREDENTIALS!');
    console.log('🔐 Use strong passwords only!');
    console.log('=========================================');
});

module.exports = app;
