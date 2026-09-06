// ============================================================
// 🚢 MARINE SYSTEM - ULTRA SECURE v8.0
// ============================================================

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
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// 🔐 ULTRA SECURE CONFIGURATION
// ============================================================

// ✅ Generate secure keys if not provided
function generateSecureKey(length = 64) {
    return crypto.randomBytes(length).toString('hex');
}

// ✅ Validate environment
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

// ✅ Admin credentials with automatic secure password generation
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = (() => {
    if (process.env.ADMIN_PASSWORD) {
        // Validate password strength
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

// ✅ JWT & Session Secrets
const JWT_SECRET = process.env.JWT_SECRET || generateSecureKey(64);
const SESSION_SECRET = process.env.SESSION_SECRET || generateSecureKey(64);
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || generateSecureKey(32);
const ENCRYPTION_IV = crypto.randomBytes(16);

// ✅ Admin name
const ADMIN_NAME = process.env.ADMIN_NAME || 'أمان الله ناجي';

// ============================================================
// 🔒 SECURITY FUNCTIONS
// ============================================================

// ✅ Strong password validation
function isStrongPassword(password) {
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    const isLongEnough = password.length >= 12;
    
    return [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar, isLongEnough].filter(Boolean).length >= 4;
}

// ✅ Generate strong password
function generateStrongPassword(length = 16) {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=';
    const all = uppercase + lowercase + numbers + special;
    
    let password = '';
    // Ensure at least one of each type
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];
    
    // Fill remaining
    for (let i = password.length; i < length; i++) {
        password += all[Math.floor(Math.random() * all.length)];
    }
    
    // Shuffle
    return password.split('').sort(() => Math.random() - 0.5).join('');
}

// ✅ Encryption/Decryption for sensitive data
function encrypt(text) {
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), ENCRYPTION_IV);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return encrypted.toString('hex');
}

function decrypt(text) {
    const encryptedText = Buffer.from(text, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), ENCRYPTION_IV);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

// ✅ CSRF Token Generator (ultra secure)
function generateSecureToken() {
    return crypto.randomBytes(32).toString('hex');
}

// ============================================================
// 🛡️ SECURITY MIDDLEWARE
// ============================================================

// ✅ Helmet - Secure HTTP headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://*.onrender.com"],
        },
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
    }
}));

// ✅ Compression
app.use(compression());

// ✅ CORS - Strict configuration
app.use(cors({
    origin: isProduction ? [
        'https://marine-system-71eo.onrender.com',
        'https://*.onrender.com'
    ] : [
        'http://localhost:5000',
        'http://localhost:3000'
    ],
    credentials: true,
    exposedHeaders: ['X-CSRF-Token', 'X-Session-Expiry', 'X-Request-ID'],
    maxAge: 86400 // 24 hours
}));

// ✅ Rate Limiting - Prevent brute force
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
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

// ✅ Strict rate limit for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per 15 minutes
    message: {
        success: false,
        error: 'Too many login attempts. Please try again after 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// ✅ Apply rate limiting
app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/change-password', authLimiter);

// ✅ XSS Protection
app.use(xss());

// ✅ Prevent HTTP Parameter Pollution
app.use(hpp());

// ✅ Body parsers with size limits
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// ✅ Session Management - Ultra Secure
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: '__Secure-marine.sid',
    cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: 'strict',
        domain: isProduction ? '.onrender.com' : undefined,
        path: '/',
        partitioned: isProduction
    },
    rolling: true,
    proxy: isProduction
}));

// ✅ Request ID generation for tracking
app.use((req, res, next) => {
    req.requestId = crypto.randomBytes(8).toString('hex');
    res.setHeader('X-Request-ID', req.requestId);
    next();
});

// ✅ Security logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} - ${duration}ms - ${req.requestId}`);
    });
    next();
});

// ✅ CSRF Protection - Ultra Secure
app.use((req, res, next) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = generateSecureToken();
        req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000); // 8 hours
        console.log('🔄 New CSRF token generated');
    }

    if (req.session.csrfExpiry && Date.now() > req.session.csrfExpiry) {
        req.session.csrfToken = generateSecureToken();
        req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
        console.log('🔄 CSRF token refreshed');
    }

    res.setHeader('X-CSRF-Token', req.session.csrfToken);
    res.setHeader('X-Session-Expiry', req.session.csrfExpiry);
    next();
});

// ✅ CSRF Protection Middleware
const csrfProtection = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
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
    req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
    res.setHeader('X-CSRF-Token', newToken);
    
    next();
};

// ============================================================
// 🖥️ STATIC FILES
// ============================================================

const basePath = __dirname;
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

// ============================================================
// 📊 ULTRA SECURE DATA
// ============================================================

// ✅ Users with encrypted sensitive data
const users = [
    {
        id: crypto.randomBytes(16).toString('hex'),
        username: ADMIN_USERNAME,
        password: bcrypt.hashSync(ADMIN_PASSWORD, 12), // Increased rounds
        name: encrypt(ADMIN_NAME),
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString(),
        lastLogin: null,
        loginAttempts: 0,
        locked: false,
        lockedUntil: null
    },
    {
        id: crypto.randomBytes(16).toString('hex'),
        username: 'manager',
        password: bcrypt.hashSync(generateStrongPassword(16), 12),
        name: encrypt('مدير النظام'),
        role: 'manager',
        active: true,
        createdAt: new Date().toISOString(),
        lastLogin: null,
        loginAttempts: 0,
        locked: false,
        lockedUntil: null
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
        metadata: encrypt('sensitive data')
    },
    {
        id: crypto.randomBytes(8).toString('hex'),
        name: encrypt('الوحدة 205'),
        type: encrypt('قاطرة بحرية'),
        status: 'maintenance',
        location: encrypt('حوض السفن'),
        lastMaintenance: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        metadata: encrypt('sensitive data')
    }
];

// ✅ Audit logs
const auditLogs = [];

// ✅ Audit log function
function addAuditLog(userId, action, details, ip) {
    auditLogs.push({
        id: crypto.randomBytes(8).toString('hex'),
        userId,
        action,
        details,
        ip,
        timestamp: new Date().toISOString()
    });
    // Keep only last 1000 logs
    if (auditLogs.length > 1000) {
        auditLogs.shift();
    }
}

// ============================================================
// 🔐 AUTH ENDPOINTS - ULTRA SECURE
// ============================================================

// ✅ Get CSRF Token
app.get('/api/csrf-token', (req, res) => {
    const token = req.session.csrfToken;
    res.json({
        success: true,
        token: token,
        expiresIn: req.session.csrfExpiry ? req.session.csrfExpiry - Date.now() : 28800000
    });
});

// ✅ Login with advanced security
app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;
        
        console.log(`🔐 Login attempt: ${username} from ${clientIP}`);

        // Input validation
        if (!username || !password || username.length > 50 || password.length > 100) {
            return res.status(400).json({ success: false, error: 'بيانات غير صالحة' });
        }

        const user = users.find(u => u.username === username);
        if (!user) {
            addAuditLog(null, 'LOGIN_FAILED', `Invalid username: ${username}`, clientIP);
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        // Check if account is locked
        if (user.locked && user.lockedUntil && Date.now() < user.lockedUntil) {
            return res.status(403).json({
                success: false,
                error: `الحساب مقفل. حاول مرة أخرى بعد ${Math.ceil((user.lockedUntil - Date.now()) / 60000)} دقيقة`
            });
        }

        // Verify password
        const validPassword = bcrypt.compareSync(password, user.password);
        if (!validPassword) {
            user.loginAttempts = (user.loginAttempts || 0) + 1;
            
            // Lock account after 5 failed attempts
            if (user.loginAttempts >= 5) {
                user.locked = true;
                user.lockedUntil = Date.now() + (30 * 60 * 1000); // 30 minutes
                addAuditLog(user.id, 'ACCOUNT_LOCKED', 'Too many failed login attempts', clientIP);
                return res.status(403).json({
                    success: false,
                    error: 'الحساب مقفل لمدة 30 دقيقة بسبب كثرة المحاولات الفاشلة'
                });
            }
            
            addAuditLog(user.id, 'LOGIN_FAILED', 'Invalid password', clientIP);
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
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
                expiresIn: '7d',
                algorithm: 'HS256'
            }
        );

        // Rotate CSRF token
        const newToken = generateSecureToken();
        req.session.csrfToken = newToken;
        req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
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

// ✅ Verify Token with security checks
app.get('/api/auth/me', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }

        const token = authHeader.split(' ')[1];
        
        // Verify token
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        const user = users.find(u => u.id === decoded.id);

        if (!user || !user.active) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود أو غير نشط' });
        }

        // Check if session is valid
        if (req.session.userId !== user.id) {
            return res.status(401).json({ success: false, error: 'جلسة غير صالحة' });
        }

        // Rotate CSRF token
        const newToken = generateSecureToken();
        req.session.csrfToken = newToken;
        req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
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

// ✅ Change Password with validation
app.post('/api/auth/change-password', csrfProtection, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;
        
        // Validate passwords
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
        }
        
        if (!isStrongPassword(newPassword)) {
            return res.status(400).json({
                success: false,
                error: 'كلمة المرور الجديدة ضعيفة. يجب أن تحتوي على 12 حرف على الأقل، حروف كبيرة وصغيرة، أرقام ورموز خاصة'
            });
        }

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
            addAuditLog(user.id, 'PASSWORD_CHANGE_FAILED', 'Invalid current password', clientIP);
            return res.status(401).json({ success: false, error: 'كلمة المرور الحالية غير صحيحة' });
        }

        // Update password
        user.password = bcrypt.hashSync(newPassword, 12);
        
        addAuditLog(user.id, 'PASSWORD_CHANGED', 'Password changed successfully', clientIP);

        res.json({ 
            success: true, 
            message: '✅ تم تغيير كلمة المرور بنجاح' 
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ✅ Logout with session cleanup
app.post('/api/auth/logout', (req, res) => {
    const userId = req.session.userId;
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (userId) {
        addAuditLog(userId, 'LOGOUT', 'User logged out', clientIP);
    }
    
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.clearCookie('__Secure-marine.sid', {
            path: '/',
            httpOnly: true,
            secure: isProduction,
            sameSite: 'strict'
        });
        res.json({ success: true, message: 'تم تسجيل الخروج' });
    });
});

// ============================================================
// 📊 SECURE API ENDPOINTS
// ============================================================

// ✅ Get vessels with decryption
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

// ✅ Get audit logs (Admin only)
app.get('/api/audit-logs', csrfProtection, (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Check if user is admin
        const user = users.find(u => u.id === decoded.id);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'غير مصرح' });
        }

        res.json(auditLogs.slice(-100)); // Return last 100 logs
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
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
    console.log('=========================================');
    console.log('💾 SAVE ADMIN CREDENTIALS!');
    console.log('🔐 Use strong passwords only!');
    console.log('=========================================');
});

module.exports = app;
