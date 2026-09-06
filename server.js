// ============================================================
// 🚢 MARINE SYSTEM - ULTRA SECURE v8.0 (FULL CODE)
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

// ✅ Encryption/Decryption
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

// ✅ CSRF Token Generator
function generateSecureToken() {
    return crypto.randomBytes(32).toString('hex');
}

// ============================================================
// 🛡️ SECURITY MIDDLEWARE
// ============================================================

// ✅ Helmet
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
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// ✅ Compression
app.use(compression());

// ✅ CORS
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
    maxAge: 86400
}));

// ✅ Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, error: 'Too many login attempts. Please try again after 15 minutes.' }
});

app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/change-password', authLimiter);

// ✅ XSS Protection
app.use(xss());

// ✅ HPP
app.use(hpp());

// ✅ Body parsers
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// ✅ Session Management
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
    req.requestId = crypto.randomBytes(8).toString('hex');
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
        req.session.csrfToken = generateSecureToken();
        req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
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

    if (req.path === '/api/auth/login' || req.path === '/api/csrf-token') {
        return next();
    }

    const token = req.headers['x-csrf-token'] || req.body.csrf_token;
    const sessionToken = req.session.csrfToken;

    if (!token) {
        return res.status(403).json({ success: false, error: 'CSRF token مفقود' });
    }

    if (!sessionToken) {
        return res.status(403).json({ success: false, error: 'جلسة غير صالحة' });
    }

    try {
        const isValid = crypto.timingSafeEqual(
            Buffer.from(token, 'utf8'),
            Buffer.from(sessionToken, 'utf8')
        );
        if (!isValid) {
            throw new Error('Invalid token');
        }
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
// 📊 ULTRA SECURE DATA
// ============================================================

const users = [
    {
        id: crypto.randomBytes(16).toString('hex'),
        username: ADMIN_USERNAME,
        password: bcrypt.hashSync(ADMIN_PASSWORD, 12),
        name: encrypt(ADMIN_NAME),
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString(),
        lastLogin: null,
        loginAttempts: 0,
        locked: false,
        lockedUntil: null
    }
];

const vessels = [
    { 
        id: crypto.randomBytes(8).toString('hex'),
        name: encrypt('الوحدة 101'),
        type: encrypt('زورق دورية'),
        status: 'ready',
        location: encrypt('الميناء الرئيسي'),
        lastMaintenance: new Date().toISOString(),
        createdAt: new Date().toISOString()
    },
    {
        id: crypto.randomBytes(8).toString('hex'),
        name: encrypt('الوحدة 205'),
        type: encrypt('قاطرة بحرية'),
        status: 'maintenance',
        location: encrypt('حوض السفن'),
        lastMaintenance: new Date().toISOString(),
        createdAt: new Date().toISOString()
    },
    {
        id: crypto.randomBytes(8).toString('hex'),
        name: encrypt('الوحدة 312'),
        type: encrypt('سفينة إسناد'),
        status: 'offline',
        location: encrypt('الميناء الغربي'),
        lastMaintenance: new Date().toISOString(),
        createdAt: new Date().toISOString()
    }
];

const auditLogs = [];

function addAuditLog(userId, action, details, ip) {
    auditLogs.push({
        id: crypto.randomBytes(8).toString('hex'),
        userId,
        action,
        details,
        ip,
        timestamp: new Date().toISOString()
    });
    if (auditLogs.length > 1000) {
        auditLogs.shift();
    }
}

// ============================================================
// 🖥️ STATIC FILES
// ============================================================

const basePath = __dirname;
app.use(express.static(basePath, {
    maxAge: isProduction ? '1y' : '0',
    etag: true,
    lastModified: true
}));
app.use('/public', express.static(path.join(basePath, 'public'), {
    maxAge: isProduction ? '1y' : '0'
}));
app.use('/pages', express.static(path.join(basePath, 'pages'), {
    maxAge: isProduction ? '1y' : '0'
}));

// ============================================================
// 🌐 MAIN ROUTES
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
            return res.sendFile(p);
        }
    }
    
    // If no index.html exists, serve embedded page
    res.send(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🚢 Marine System</title>
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
                    background: linear-gradient(145deg, #1a1f35, #0d1528);
                    padding: 50px;
                    border-radius: 30px;
                    max-width: 600px;
                    width: 100%;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.8);
                    border: 1px solid #2a3a5a;
                    text-align: center;
                }
                h1 {
                    color: #00d4ff;
                    font-size: 2.5em;
                    margin-bottom: 10px;
                }
                .subtitle { color: #8899aa; margin-bottom: 20px; }
                .status {
                    background: #0d1528;
                    padding: 20px;
                    border-radius: 15px;
                    margin: 20px 0;
                    border-right: 5px solid #00ff88;
                }
                .status.success { border-right-color: #00ff88; }
                .info { color: #aabbcc; line-height: 2; }
                .info strong { color: #00d4ff; }
                .login-form input {
                    width: 100%;
                    padding: 15px;
                    margin: 10px 0;
                    border-radius: 10px;
                    border: 1px solid #2a3a5a;
                    background: #0d1528;
                    color: #fff;
                    font-size: 16px;
                    direction: rtl;
                }
                .login-form input:focus {
                    outline: none;
                    border-color: #00d4ff;
                    box-shadow: 0 0 20px rgba(0,212,255,0.1);
                }
                .btn {
                    background: linear-gradient(135deg, #00d4ff, #0099cc);
                    color: #0a0e1a;
                    border: none;
                    padding: 15px 40px;
                    border-radius: 10px;
                    font-size: 18px;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.3s;
                    width: 100%;
                    margin-top: 15px;
                }
                .btn:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 10px 30px rgba(0,212,255,0.3);
                }
                .btn-logout {
                    background: linear-gradient(135deg, #ff4444, #cc0000);
                }
                .btn-logout:hover {
                    box-shadow: 0 10px 30px rgba(255,68,68,0.3);
                }
                .error { color: #ff4444; margin: 10px 0; }
                .success-msg { color: #00ff88; margin: 10px 0; }
                .login-section, .user-section {
                    margin-top: 30px;
                    text-align: right;
                }
                .user-section { display: none; }
                .badge {
                    display: inline-block;
                    padding: 5px 15px;
                    border-radius: 20px;
                    font-size: 14px;
                    margin: 5px 0;
                }
                .badge.admin { background: #ff4444; color: #fff; }
                .badge.manager { background: #ffaa00; color: #000; }
                .status-dot {
                    display: inline-block;
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    margin-right: 8px;
                }
                .status-dot.online { background: #00ff88; }
                .footer {
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #2a3a5a;
                    color: #667788;
                    font-size: 12px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚢 MARINE SYSTEM</h1>
                <p class="subtitle">نظام إدارة الأسطول البحري</p>
                
                <div class="status success">
                    <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
                        <span class="status-dot online"></span>
                        <h3 style="margin:0;color:#00ff88;">✅ النظام يعمل</h3>
                    </div>
                    <p class="info">🔒 <strong>الأمان:</strong> مستوى عالي جداً</p>
                    <p class="info">🌐 <strong>الرابط:</strong> marine-system-71eo.onrender.com</p>
                    <p class="info">👤 <strong>المستخدم:</strong> ${ADMIN_USERNAME}</p>
                </div>

                <div id="loginSection" class="login-section">
                    <h3 style="color: #00d4ff; margin-bottom: 20px;">🔐 تسجيل الدخول</h3>
                    <div id="message"></div>
                    <div class="login-form">
                        <input type="text" id="username" placeholder="👤 اسم المستخدم" value="${ADMIN_USERNAME}">
                        <input type="password" id="password" placeholder="🔑 كلمة المرور">
                        <button class="btn" onclick="handleLogin()">🚀 دخول</button>
                    </div>
                </div>

                <div id="userSection" class="user-section">
                    <div style="background: #0d1528; padding: 20px; border-radius: 15px;">
                        <p style="font-size: 18px;">👋 <strong>مرحباً بك، <span id="userName"></span></strong></p>
                        <p>📋 <strong>الدور:</strong> <span id="userRole" class="badge admin">admin</span></p>
                        <p>🔐 <strong>الحالة:</strong> <span style="color:#00ff88;">● نشط</span></p>
                        <button class="btn btn-logout" onclick="handleLogout()">🚪 تسجيل الخروج</button>
                    </div>
                </div>

                <div class="footer">
                    🔒 جميع البيانات مشفرة | v8.0 Ultra Secure
                </div>
            </div>

            <script>
                let csrfToken = '';

                async function getCsrfToken() {
                    try {
                        const response = await fetch('/api/csrf-token', { credentials: 'include' });
                        const data = await response.json();
                        if (data.success) {
                            csrfToken = data.token;
                            return data.token;
                        }
                        return null;
                    } catch (error) {
                        console.error('CSRF Error:', error);
                        return null;
                    }
                }

                async function handleLogin() {
                    const username = document.getElementById('username').value;
                    const password = document.getElementById('password').value;
                    const messageEl = document.getElementById('message');

                    if (!username || !password) {
                        messageEl.innerHTML = '<div class="error">⚠️ الرجاء إدخال جميع البيانات</div>';
                        return;
                    }

                    try {
                        const token = await getCsrfToken();
                        if (!token) {
                            messageEl.innerHTML = '<div class="error">❌ فشل الحصول على CSRF token</div>';
                            return;
                        }

                        messageEl.innerHTML = '<div style="color:#00d4ff;">⏳ جاري تسجيل الدخول...</div>';

                        const response = await fetch('/api/auth/login', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-CSRF-Token': token
                            },
                            credentials: 'include',
                            body: JSON.stringify({ username, password })
                        });

                        const data = await response.json();

                        if (response.ok && data.success) {
                            localStorage.setItem('authToken', data.token);
                            localStorage.setItem('userData', JSON.stringify(data.user));
                            localStorage.setItem('csrfToken', data.csrfToken || token);
                            
                            messageEl.innerHTML = '<div class="success-msg">✅ تم تسجيل الدخول بنجاح</div>';
                            showUserInfo(data.user);
                        } else {
                            messageEl.innerHTML = `<div class="error">❌ ${data.error || 'فشل تسجيل الدخول'}</div>`;
                        }
                    } catch (error) {
                        console.error('Login error:', error);
                        messageEl.innerHTML = '<div class="error">❌ خطأ في الاتصال بالخادم</div>';
                    }
                }

                function showUserInfo(user) {
                    document.getElementById('loginSection').style.display = 'none';
                    document.getElementById('userSection').style.display = 'block';
                    document.getElementById('userName').textContent = user.name || user.username;
                    document.getElementById('userRole').textContent = user.role || 'مستخدم';
                    
                    const roleBadge = document.getElementById('userRole');
                    if (user.role === 'admin') {
                        roleBadge.className = 'badge admin';
                    } else if (user.role === 'manager') {
                        roleBadge.className = 'badge manager';
                    }
                }

                async function handleLogout() {
                    try {
                        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
                        localStorage.clear();
                        document.getElementById('loginSection').style.display = 'block';
                        document.getElementById('userSection').style.display = 'none';
                        document.getElementById('message').innerHTML = '<div class="success-msg">✅ تم تسجيل الخروج</div>';
                    } catch (error) {
                        console.error('Logout error:', error);
                    }
                }

                async function checkAuth() {
                    const token = localStorage.getItem('authToken');
                    if (token) {
                        try {
                            const csrf = await getCsrfToken();
                            const response = await fetch('/api/auth/me', {
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'X-CSRF-Token': csrf || ''
                                },
                                credentials: 'include'
                            });
                            const data = await response.json();
                            if (data.success) {
                                showUserInfo(data.user);
                                return;
                            }
                        } catch (error) {
                            console.error('Auth check failed:', error);
                        }
                    }
                    document.getElementById('loginSection').style.display = 'block';
                    document.getElementById('userSection').style.display = 'none';
                }

                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && document.getElementById('loginSection').style.display !== 'none') {
                        handleLogin();
                    }
                });

                getCsrfToken().then(() => checkAuth());
            </script>
        </body>
        </html>
    `);
});

// ✅ Catch-all route
app.get('*', (req, res) => {
    if (req.path.includes('.') && !req.path.startsWith('/api')) {
        return res.status(404).send('❌ ملف غير موجود');
    }
    res.redirect('/');
});

// ============================================================
// 🔐 AUTH ENDPOINTS
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

// ✅ Login
app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;
        
        console.log(`🔐 Login attempt: ${username} from ${clientIP}`);

        if (!username || !password || username.length > 50 || password.length > 100) {
            return res.status(400).json({ success: false, error: 'بيانات غير صالحة' });
        }

        const user = users.find(u => u.username === username);
        if (!user) {
            addAuditLog(null, 'LOGIN_FAILED', `Invalid username: ${username}`, clientIP);
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        if (user.locked && user.lockedUntil && Date.now() < user.lockedUntil) {
            return res.status(403).json({
                success: false,
                error: `الحساب مقفل. حاول مرة أخرى بعد ${Math.ceil((user.lockedUntil - Date.now()) / 60000)} دقيقة`
            });
        }

        const validPassword = bcrypt.compareSync(password, user.password);
        if (!validPassword) {
            user.loginAttempts = (user.loginAttempts || 0) + 1;
            
            if (user.loginAttempts >= 5) {
                user.locked = true;
                user.lockedUntil = Date.now() + (30 * 60 * 1000);
                addAuditLog(user.id, 'ACCOUNT_LOCKED', 'Too many failed login attempts', clientIP);
                return res.status(403).json({
                    success: false,
                    error: 'الحساب مقفل لمدة 30 دقيقة بسبب كثرة المحاولات الفاشلة'
                });
            }
            
            addAuditLog(user.id, 'LOGIN_FAILED', 'Invalid password', clientIP);
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
                iat: Math.floor(Date.now() / 1000),
                jti: crypto.randomBytes(16).toString('hex')
            },
            JWT_SECRET,
            { expiresIn: '7d', algorithm: 'HS256' }
        );

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

// ✅ Change Password
app.post('/api/auth/change-password', csrfProtection, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;
        
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

        user.password = bcrypt.hashSync(newPassword, 12);
        addAuditLog(user.id, 'PASSWORD_CHANGED', 'Password changed successfully', clientIP);

        res.json({ success: true, message: '✅ تم تغيير كلمة المرور بنجاح' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ✅ Logout
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

// ✅ Add vessel
app.post('/api/vessels', csrfProtection, (req, res) => {
    try {
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
            createdAt: new Date().toISOString()
        };
        
        vessels.push(newVessel);
        res.json({ success: true, vessel: newVessel });
    } catch (error) {
        console.error('Add vessel error:', error);
        res.status(500).json({ success: false, error: 'خطأ في إضافة الوحدة' });
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

        res.json(auditLogs.slice(-100));
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
