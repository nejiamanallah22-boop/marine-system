```js
// ============================================================
// 🚢 MARINE SYSTEM - v8.1 HARDENED / FULLY FIXED
// ============================================================
// FIXES:
// ✅ API routes BEFORE page routes
// ✅ NO wildcard route before API
// ✅ API 404 always returns JSON
// ✅ Page fallback only for non-API requests
// ✅ Fixed CSRF rotation race condition
// ✅ Authentication middleware
// ✅ Admin RBAC
// ✅ Secure Render proxy configuration
// ✅ Secure session cookie
// ✅ Removed dangerous cookie domain
// ✅ No password logging
// ✅ Strict JWT algorithm
// ✅ Request IDs
// ✅ Security headers
// ✅ Rate limiting
// ✅ Body limits
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

const PORT = Number(process.env.PORT) || 5000;
const isProduction = process.env.NODE_ENV === 'production';

// ============================================================
// 🔧 EXPRESS / RENDER
// ============================================================

if (isProduction) {
    // Render sits behind a proxy.
    app.set('trust proxy', 1);
}

app.disable('x-powered-by');

// ============================================================
// 🔐 SECURE CONFIGURATION
// ============================================================

function generateSecureKey(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
}

function generateSecureToken() {
    return crypto.randomBytes(32).toString('hex');
}

function generateRequestId() {
    return crypto.randomBytes(16).toString('hex');
}

function isStrongPassword(password) {
    if (typeof password !== 'string') return false;

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(password);
    const isLongEnough = password.length >= 12;

    return (
        hasUpperCase &&
        hasLowerCase &&
        hasNumbers &&
        hasSpecialChar &&
        isLongEnough
    );
}

function generateStrongPassword(length = 20) {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=';
    const all = uppercase + lowercase + numbers + special;

    const randomChar = (set) =>
        set[crypto.randomInt(0, set.length)];

    let password = '';

    password += randomChar(uppercase);
    password += randomChar(lowercase);
    password += randomChar(numbers);
    password += randomChar(special);

    while (password.length < length) {
        password += randomChar(all);
    }

    // Cryptographically safer shuffle
    const chars = password.split('');

    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    return chars.join('');
}

// ============================================================
// 🔑 ENVIRONMENT VARIABLES
// ============================================================

const ADMIN_USERNAME =
    process.env.ADMIN_USERNAME || 'admin';

let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
    if (isProduction) {
        console.error(
            '❌ FATAL: ADMIN_PASSWORD must be configured in production.'
        );
        process.exit(1);
    }

    ADMIN_PASSWORD = generateStrongPassword();

    console.warn(
        '⚠️ DEVELOPMENT ONLY: Generated temporary admin password.'
    );
    console.warn(
        '⚠️ Configure ADMIN_PASSWORD in .env before production.'
    );
}

if (!isStrongPassword(ADMIN_PASSWORD)) {
    console.error(
        '❌ FATAL: ADMIN_PASSWORD is weak.'
    );
    console.error(
        'Password must contain 12+ chars, uppercase, lowercase, number and special character.'
    );

    if (isProduction) {
        process.exit(1);
    }
}

const ADMIN_NAME =
    process.env.ADMIN_NAME || 'أمان الله ناجي';

// ------------------------------------------------------------
// JWT SECRET
// ------------------------------------------------------------

const JWT_SECRET =
    process.env.JWT_SECRET || generateSecureKey(64);

if (isProduction && (!process.env.JWT_SECRET || JWT_SECRET.length < 64)) {
    console.error(
        '❌ FATAL: JWT_SECRET must be configured in production.'
    );
    process.exit(1);
}

// ------------------------------------------------------------
// SESSION SECRET
// ------------------------------------------------------------

const SESSION_SECRET =
    process.env.SESSION_SECRET || generateSecureKey(64);

if (
    isProduction &&
    (!process.env.SESSION_SECRET || SESSION_SECRET.length < 64)
) {
    console.error(
        '❌ FATAL: SESSION_SECRET must be configured in production.'
    );
    process.exit(1);
}

// ------------------------------------------------------------
// ENCRYPTION KEY
// ------------------------------------------------------------

let ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
    ENCRYPTION_KEY = generateSecureKey(32);

    if (isProduction) {
        console.error(
            '❌ FATAL: ENCRYPTION_KEY must be configured in production.'
        );
        process.exit(1);
    }
}

if (!/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY)) {
    console.error(
        '❌ FATAL: ENCRYPTION_KEY must be exactly 64 hexadecimal characters.'
    );
    process.exit(1);
}

// IMPORTANT:
// CBC IV must remain stable for decrypting existing encrypted data.
// For this demo/in-memory version we use an ENV IV.
// In production DB encryption, use a random IV per record and store it
// alongside ciphertext.

let ENCRYPTION_IV;

if (process.env.ENCRYPTION_IV) {
    if (!/^[0-9a-fA-F]{32}$/.test(process.env.ENCRYPTION_IV)) {
        console.error(
            '❌ FATAL: ENCRYPTION_IV must be exactly 32 hexadecimal characters.'
        );
        process.exit(1);
    }

    ENCRYPTION_IV = Buffer.from(
        process.env.ENCRYPTION_IV,
        'hex'
    );
} else {
    ENCRYPTION_IV = crypto.randomBytes(16);

    if (isProduction) {
        console.error(
            '❌ FATAL: ENCRYPTION_IV must be configured in production.'
        );
        process.exit(1);
    }
}

// ============================================================
// ⚙️ CONFIG
// ============================================================

const CONFIG = {
    rateLimit: {
        window:
            parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 15,

        max:
            parseInt(process.env.RATE_LIMIT_MAX, 10) || 100
    },

    authRateLimit: {
        window:
            parseInt(process.env.AUTH_RATE_LIMIT_WINDOW, 10) || 15,

        max:
            parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 5
    },

    csrf: {
        expiry:
            parseInt(process.env.CSRF_TOKEN_EXPIRY, 10) || 8
    },

    session: {
        maxAge:
            parseInt(process.env.SESSION_MAX_AGE, 10) || 30
    },

    password: {
        saltRounds:
            parseInt(process.env.PASSWORD_SALT_ROUNDS, 10) || 12
    },

    security: {
        maxLoginAttempts:
            parseInt(process.env.MAX_LOGIN_ATTEMPTS, 10) || 5,

        accountLockTime:
            parseInt(process.env.ACCOUNT_LOCK_TIME, 10) || 30
    },

    token: {
        expiry:
            process.env.TOKEN_EXPIRY || '7d'
    }
};

// ============================================================
// 🔐 ENCRYPTION
// ============================================================

function encrypt(text) {
    try {
        if (text === null || text === undefined) {
            return '';
        }

        const cipher = crypto.createCipheriv(
            'aes-256-cbc',
            Buffer.from(ENCRYPTION_KEY, 'hex'),
            ENCRYPTION_IV
        );

        let encrypted = cipher.update(
            String(text),
            'utf8',
            'hex'
        );

        encrypted += cipher.final('hex');

        return encrypted;
    } catch (error) {
        console.error('❌ Encryption error');
        return String(text);
    }
}

function decrypt(text) {
    try {
        if (!text) return '';

        const decipher = crypto.createDecipheriv(
            'aes-256-cbc',
            Buffer.from(ENCRYPTION_KEY, 'hex'),
            ENCRYPTION_IV
        );

        let decrypted = decipher.update(
            text,
            'hex',
            'utf8'
        );

        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('❌ Decryption error');
        return text;
    }
}

// ============================================================
// 🛡️ SECURITY HEADERS
// ============================================================

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],

                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    // Keep unsafe-eval only if an existing frontend
                    // library genuinely requires it.
                    "'unsafe-eval'",
                    'https://unpkg.com',
                    'https://cdnjs.cloudflare.com',
                    'https://fonts.googleapis.com',
                    'https://*.googleapis.com'
                ],

                styleSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    'https://unpkg.com',
                    'https://cdnjs.cloudflare.com',
                    'https://fonts.googleapis.com',
                    'https://*.googleapis.com'
                ],

                imgSrc: [
                    "'self'",
                    'data:',
                    'https:',
                    'http:'
                ],

                connectSrc: [
                    "'self'",
                    'https://*.onrender.com',
                    'https://unpkg.com',
                    'https://*.googleapis.com'
                ],

                fontSrc: [
                    "'self'",
                    'https:',
                    'data:',
                    'https://fonts.gstatic.com',
                    'https://*.googleapis.com'
                ],

                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],

                scriptSrcAttr: ["'unsafe-inline'"],

                upgradeInsecureRequests:
                    isProduction ? [] : null
            }
        },

        hsts: isProduction
            ? {
                  maxAge: 31536000,
                  includeSubDomains: true,
                  preload: true
              }
            : false,

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
    })
);

// ============================================================
// 🌐 CORS
// ============================================================

const allowedOrigins = (
    process.env.ALLOWED_ORIGINS ||
    (
        isProduction
            ? 'https://marine-system-71eo.onrender.com'
            : 'http://localhost:5000,http://localhost:3000'
    )
)
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: function (origin, callback) {
            // Same-origin / non-browser requests
            if (!origin) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            // Development convenience only
            if (!isProduction) {
                return callback(null, true);
            }

            return callback(
                new Error('Not allowed by CORS')
            );
        },

        credentials: true,

        exposedHeaders: [
            'X-CSRF-Token',
            'X-Session-Expiry',
            'X-Request-ID',
            'X-User-ID'
        ],

        maxAge: 86400
    })
);

// ============================================================
// 📦 COMPRESSION
// ============================================================

app.use(compression());

// ============================================================
// 🚦 RATE LIMITING
// ============================================================

const limiter = rateLimit({
    windowMs:
        CONFIG.rateLimit.window * 60 * 1000,

    max:
        CONFIG.rateLimit.max,

    message: {
        success: false,
        error: 'Too many requests, please try again later.'
    },

    standardHeaders: true,
    legacyHeaders: false,

    keyGenerator: (req) =>
        req.ip || req.socket.remoteAddress
});

app.use('/api/', limiter);

// ------------------------------------------------------------
// AUTH RATE LIMIT
// ------------------------------------------------------------

const authLimiter = rateLimit({
    windowMs:
        CONFIG.authRateLimit.window * 60 * 1000,

    max:
        CONFIG.authRateLimit.max,

    message: {
        success: false,
        error:
            `Too many authentication attempts. ` +
            `Try again after ${CONFIG.authRateLimit.window} minutes.`
    },

    standardHeaders: true,
    legacyHeaders: false,

    keyGenerator: (req) =>
        req.ip || req.socket.remoteAddress
});

app.use(
    '/api/auth/login',
    authLimiter
);

app.use(
    '/api/auth/change-password',
    authLimiter
);

// ============================================================
// 🧹 INPUT MIDDLEWARE
// ============================================================

app.use(xss());
app.use(hpp());

app.use(
    express.json({
        limit: '10kb',
        strict: true
    })
);

app.use(
    express.urlencoded({
        extended: false,
        limit: '10kb'
    })
);

app.use(cookieParser());

// ============================================================
// 🍪 SESSION
// ============================================================

const sessionConfig = {
    secret: SESSION_SECRET,

    resave: false,

    saveUninitialized: false,

    name: '__Secure-marine.sid',

    cookie: {
        secure: isProduction,

        httpOnly: true,

        sameSite: 'strict',

        maxAge:
            CONFIG.session.maxAge *
            24 *
            60 *
            60 *
            1000,

        path: '/'
    },

    rolling: true
};

// IMPORTANT:
// express-session's default MemoryStore is NOT suitable for
// production / multi-instance deployment.
//
// Replace store with Redis or MongoStore before real production.

app.use(session(sessionConfig));

// ============================================================
// 🆔 REQUEST ID
// ============================================================

app.use((req, res, next) => {
    req.requestId = generateRequestId();

    res.setHeader(
        'X-Request-ID',
        req.requestId
    );

    next();
});

// ============================================================
// 📋 SECURITY LOGGING
// ============================================================

app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration =
            Date.now() - start;

        console.log(
            `[${new Date().toISOString()}] ` +
            `${req.method} ` +
            `${req.path} ` +
            `${res.statusCode} ` +
            `${duration}ms ` +
            `${req.requestId}`
        );
    });

    next();
});

// ============================================================
// 🛡️ CSRF TOKEN CREATION
// ============================================================

app.use((req, res, next) => {
    try {
        if (!req.session.csrfToken) {
            req.session.csrfToken =
                generateSecureToken();

            req.session.csrfExpiry =
                Date.now() +
                (
                    CONFIG.csrf.expiry *
                    60 *
                    60 *
                    1000
                );
        }

        if (
            req.session.csrfExpiry &&
            Date.now() > req.session.csrfExpiry
        ) {
            req.session.csrfToken =
                generateSecureToken();

            req.session.csrfExpiry =
                Date.now() +
                (
                    CONFIG.csrf.expiry *
                    60 *
                    60 *
                    1000
                );
        }

        res.setHeader(
            'X-CSRF-Token',
            req.session.csrfToken
        );

        res.setHeader(
            'X-Session-Expiry',
            String(req.session.csrfExpiry)
        );

        next();

    } catch (error) {
        console.error(
            '❌ CSRF initialization error'
        );

        return res.status(500).json({
            success: false,
            error: 'Security initialization failed',
            requestId: req.requestId
        });
    }
});

// ============================================================
// 🛡️ CSRF VALIDATION
// ============================================================

const csrfProtection = (
    req,
    res,
    next
) => {

    // Safe methods don't require CSRF
    if (
        ['GET', 'HEAD', 'OPTIONS']
            .includes(req.method)
    ) {
        return next();
    }

    // Login is intentionally excluded because
    // it creates the authenticated session.
    //
    // CSRF token is still generated by the GET
    // /api/csrf-token endpoint before login.
    const skipPaths = [
        '/api/auth/login',
        '/api/csrf-token'
    ];

    if (skipPaths.includes(req.path)) {
        return next();
    }

    const token =
        req.headers['x-csrf-token'] ||
        req.body?.csrf_token;

    const sessionToken =
        req.session?.csrfToken;

    if (!token) {
        return res.status(403).json({
            success: false,
            error: 'CSRF token مفقود',
            requestId: req.requestId
        });
    }

    if (!sessionToken) {
        return res.status(403).json({
            success: false,
            error: 'جلسة غير صالحة',
            requestId: req.requestId
        });
    }

    try {
        const tokenBuffer =
            Buffer.from(String(token), 'utf8');

        const sessionBuffer =
            Buffer.from(String(sessionToken), 'utf8');

        // timingSafeEqual requires same length
        if (
            tokenBuffer.length !==
            sessionBuffer.length
        ) {
            return res.status(403).json({
                success: false,
                error: 'CSRF token غير صالح',
                requestId: req.requestId
            });
        }

        const isValid =
            crypto.timingSafeEqual(
                tokenBuffer,
                sessionBuffer
            );

        if (!isValid) {
            return res.status(403).json({
                success: false,
                error: 'CSRF token غير صالح',
                requestId: req.requestId
            });
        }

        // IMPORTANT:
        // DO NOT rotate the token on every request.
        // This avoids race conditions with parallel requests.

        next();

    } catch (error) {
        console.error(
            '❌ CSRF validation error'
        );

        return res.status(403).json({
            success: false,
            error: 'CSRF token غير صالح',
            requestId: req.requestId
        });
    }
};

// ============================================================
// 🔐 JWT HELPERS
// ============================================================

function createAccessToken(user) {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            role: user.role,

            jti:
                crypto.randomBytes(16)
                    .toString('hex')
        },

        JWT_SECRET,

        {
            expiresIn:
                CONFIG.token.expiry,

            algorithm: 'HS256'
        }
    );
}

function verifyAccessToken(token) {
    return jwt.verify(
        token,
        JWT_SECRET,
        {
            algorithms: ['HS256']
        }
    );
}

// ============================================================
// 👤 AUTHENTICATION MIDDLEWARE
// ============================================================

function requireAuth(
    req,
    res,
    next
) {
    try {
        const authHeader =
            req.headers.authorization;

        if (
            !authHeader ||
            !authHeader.startsWith('Bearer ')
        ) {
            return res.status(401).json({
                success: false,
                error: 'غير مصرح',
                requestId: req.requestId
            });
        }

        const token =
            authHeader.slice(7).trim();

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'توكن غير صالح',
                requestId: req.requestId
            });
        }

        const decoded =
            verifyAccessToken(token);

        const user =
            users.find(
                u => u.id === decoded.id
            );

        if (!user || !user.active) {
            return res.status(401).json({
                success: false,
                error:
                    'المستخدم غير موجود أو غير نشط',
                requestId: req.requestId
            });
        }

        // Session binding
        if (
            req.session.userId &&
            req.session.userId !== user.id
        ) {
            return res.status(401).json({
                success: false,
                error: 'جلسة غير صالحة',
                requestId: req.requestId
            });
        }

        req.user = user;
        req.auth = decoded;

        next();

    } catch (error) {

        if (
            error.name ===
            'TokenExpiredError'
        ) {
            return res.status(401).json({
                success: false,
                error: 'انتهت صلاحية التوكن',
                requestId: req.requestId
            });
        }

        return res.status(401).json({
            success: false,
            error: 'توكن غير صالح',
            requestId: req.requestId
        });
    }
}

// ============================================================
// 👑 ADMIN RBAC
// ============================================================

function requireAdmin(
    req,
    res,
    next
) {
    if (
        !req.user ||
        req.user.role !== 'admin'
    ) {
        return res.status(403).json({
            success: false,
            error: 'غير مصرح - صلاحيات المسؤول مطلوبة',
            requestId: req.requestId
        });
    }

    next();
}

// ============================================================
// 📊 IN-MEMORY DATA
// ============================================================
// NOTE:
// This data disappears after server restart.
// Replace with MongoDB for production.

const users = [
    {
        id:
            crypto.randomBytes(16)
                .toString('hex'),

        username:
            ADMIN_USERNAME,

        password:
            bcrypt.hashSync(
                ADMIN_PASSWORD,
                CONFIG.password.saltRounds
            ),

        name:
            encrypt(ADMIN_NAME),

        role: 'admin',

        active: true,

        createdAt:
            new Date().toISOString(),

        lastLogin: null,

        loginAttempts: 0,

        locked: false,

        lockedUntil: null
    }
];

const vessels = [
    {
        id:
            crypto.randomBytes(8)
                .toString('hex'),

        name:
            encrypt('الوحدة 101'),

        type:
            encrypt('زورق دورية'),

        status:
            'ready',

        location:
            encrypt('الميناء الرئيسي'),

        lastMaintenance:
            new Date().toISOString(),

        createdAt:
            new Date().toISOString()
    },

    {
        id:
            crypto.randomBytes(8)
                .toString('hex'),

        name:
            encrypt('الوحدة 205'),

        type:
            encrypt('قاطرة بحرية'),

        status:
            'maintenance',

        location:
            encrypt('حوض السفن'),

        lastMaintenance:
            new Date().toISOString(),

        createdAt:
            new Date().toISOString()
    },

    {
        id:
            crypto.randomBytes(8)
                .toString('hex'),

        name:
            encrypt('الوحدة 312'),

        type:
            encrypt('سفينة إسناد'),

        status:
            'offline',

        location:
            encrypt('الميناء الغربي'),

        lastMaintenance:
            new Date().toISOString(),

        createdAt:
            new Date().toISOString()
    }
];

const auditLogs = [];

// ============================================================
// 📝 AUDIT LOG
// ============================================================

function addAuditLog(
    userId,
    action,
    details,
    ip
) {
    auditLogs.push({
        id:
            crypto.randomBytes(8)
                .toString('hex'),

        userId:
            userId || null,

        action,

        details,

        ip,

        timestamp:
            new Date().toISOString()
    });

    if (auditLogs.length > 1000) {
        auditLogs.shift();
    }
}

// ============================================================
// 🌐 CLIENT IP
// ============================================================

function getClientIP(req) {
    return (
        req.ip ||
        req.socket?.remoteAddress ||
        'unknown'
    );
}

// ============================================================
// 📁 STATIC FILES
// ============================================================

app.use(
    express.static(__dirname, {
        index: false,

        dotfiles: 'deny',

        fallthrough: true,

        redirect: false,

        maxAge:
            isProduction
                ? '1d'
                : 0
    })
);

app.use(
    '/pages',
    express.static(
        path.join(__dirname, 'pages'),
        {
            dotfiles: 'deny',
            index: false
        }
    )
);

app.use(
    '/public',
    express.static(
        path.join(__dirname, 'public'),
        {
            dotfiles: 'deny',
            index: false
        }
    )
);

app.use(
    '/css',
    express.static(
        path.join(__dirname, 'css'),
        {
            dotfiles: 'deny'
        }
    )
);

app.use(
    '/js',
    express.static(
        path.join(__dirname, 'js'),
        {
            dotfiles: 'deny'
        }
    )
);

app.use(
    '/assets',
    express.static(
        path.join(__dirname, 'assets'),
        {
            dotfiles: 'deny'
        }
    )
);

// ============================================================
// 📄 PAGE HELPER
// ============================================================

function findPageFile(pageName) {

    // Prevent path traversal
    if (
        typeof pageName !== 'string' ||
        !/^[a-zA-Z0-9_-]+$/.test(pageName)
    ) {
        return null;
    }

    const possiblePaths = [
        path.join(
            __dirname,
            'pages',
            `${pageName}.html`
        ),

        path.join(
            __dirname,
            'public',
            `${pageName}.html`
        ),

        path.join(
            __dirname,
            `${pageName}.html`
        ),

        path.join(
            __dirname,
            'src',
            `${pageName}.html`
        )
    ];

    for (const filePath of possiblePaths) {
        if (fs.existsSync(filePath)) {
            return filePath;
        }
    }

    return null;
}

function servePage(
    req,
    res,
    pageName
) {
    const filePath =
        findPageFile(pageName);

    if (!filePath) {
        return false;
    }

    console.log(
        `📄 Serving page: ${pageName}`
    );

    return res.sendFile(
        filePath,
        {
            headers: {
                'Content-Type':
                    'text/html; charset=utf-8'
            }
        }
    );
}

// ============================================================
// ============================================================
// 🔐 API ROUTES
// ⚠️ IMPORTANT: ALL API ROUTES ARE BEFORE PAGE FALLBACK
// ============================================================
// ============================================================

// ============================================================
// 🔐 CSRF TOKEN
// ============================================================

app.get(
    '/api/csrf-token',
    (req, res) => {
        try {
            if (!req.session.csrfToken) {
                req.session.csrfToken =
                    generateSecureToken();

                req.session.csrfExpiry =
                    Date.now() +
                    (
                        CONFIG.csrf.expiry *
                        60 *
                        60 *
                        1000
                    );
            }

            if (
                req.session.csrfExpiry &&
                Date.now() >
                    req.session.csrfExpiry
            ) {
                req.session.csrfToken =
                    generateSecureToken();

                req.session.csrfExpiry =
                    Date.now() +
                    (
                        CONFIG.csrf.expiry *
                        60 *
                        60 *
                        1000
                    );
            }

            const token =
                req.session.csrfToken;

            const expiry =
                req.session.csrfExpiry;

            res.setHeader(
                'Content-Type',
                'application/json; charset=utf-8'
            );

            res.setHeader(
                'Cache-Control',
                'no-store, no-cache, must-revalidate, private'
            );

            res.setHeader(
                'X-CSRF-Token',
                token
            );

            return res.status(200).json({
                success: true,
                token,
                expiresIn:
                    Math.max(
                        0,
                        expiry - Date.now()
                    ),
                requestId:
                    req.requestId
            });

        } catch (error) {
            console.error(
                '❌ CSRF token error'
            );

            return res.status(500).json({
                success: false,
                error:
                    'Failed to generate CSRF token',
                requestId:
                    req.requestId
            });
        }
    }
);

// ============================================================
// 🔑 LOGIN
// ============================================================

app.post(
    '/api/auth/login',
    (req, res) => {
        try {

            const {
                username,
                password
            } = req.body || {};

            const clientIP =
                getClientIP(req);

            if (
                typeof username !== 'string' ||
                typeof password !== 'string' ||
                !username.trim() ||
                !password
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'بيانات غير صالحة',
                    requestId:
                        req.requestId
                });
            }

            const cleanUsername =
                username.trim();

            const user =
                users.find(
                    u =>
                        u.username ===
                        cleanUsername
                );

            if (!user) {

                addAuditLog(
                    null,
                    'LOGIN_FAILED',
                    'Invalid username',
                    clientIP
                );

                return res.status(401).json({
                    success: false,
                    error:
                        'اسم المستخدم أو كلمة المرور غير صحيحة',
                    requestId:
                        req.requestId
                });
            }

            // ------------------------------------------------
            // Account lock
            // ------------------------------------------------

            if (
                user.locked &&
                user.lockedUntil
            ) {
                if (
                    Date.now() <
                    user.lockedUntil
                ) {
                    const remaining =
                        Math.ceil(
                            (
                                user.lockedUntil -
                                Date.now()
                            ) / 60000
                        );

                    return res.status(403).json({
                        success: false,
                        error:
                            `الحساب مقفل. حاول مرة أخرى بعد ${remaining} دقيقة`,
                        requestId:
                            req.requestId
                    });
                }

                // Lock expired
                user.locked = false;
                user.lockedUntil = null;
                user.loginAttempts = 0;
            }

            // ------------------------------------------------
            // Password verification
            // ------------------------------------------------

            const validPassword =
                bcrypt.compareSync(
                    password,
                    user.password
                );

            if (!validPassword) {

                user.loginAttempts =
                    (user.loginAttempts || 0) + 1;

                if (
                    user.loginAttempts >=
                    CONFIG.security.maxLoginAttempts
                ) {
                    user.locked = true;

                    user.lockedUntil =
                        Date.now() +
                        (
                            CONFIG.security.accountLockTime *
                            60 *
                            1000
                        );

                    addAuditLog(
                        user.id,
                        'ACCOUNT_LOCKED',
                        'Too many failed login attempts',
                        clientIP
                    );

                    return res.status(403).json({
                        success: false,
                        error:
                            `الحساب مقفل لمدة ${CONFIG.security.accountLockTime} دقيقة بسبب كثرة المحاولات الفاشلة`,
                        requestId:
                            req.requestId
                    });
                }

                addAuditLog(
                    user.id,
                    'LOGIN_FAILED',
                    'Invalid password',
                    clientIP
                );

                return res.status(401).json({
                    success: false,
                    error:
                        'اسم المستخدم أو كلمة المرور غير صحيحة',
                    requestId:
                        req.requestId
                });
            }

            // ------------------------------------------------
            // Successful login
            // ------------------------------------------------

            user.loginAttempts = 0;
            user.locked = false;
            user.lockedUntil = null;
            user.lastLogin =
                new Date().toISOString();

            // Regenerate session after authentication
            req.session.regenerate(
                (sessionError) => {

                    if (sessionError) {
                        console.error(
                            '❌ Session regeneration error'
                        );

                        return res.status(500).json({
                            success: false,
                            error:
                                'خطأ في إنشاء الجلسة',
                            requestId:
                                req.requestId
                        });
                    }

                    // New CSRF token after authentication
                    const newCsrfToken =
                        generateSecureToken();

                    req.session.csrfToken =
                        newCsrfToken;

                    req.session.csrfExpiry =
                        Date.now() +
                        (
                            CONFIG.csrf.expiry *
                            60 *
                            60 *
                            1000
                        );

                    req.session.userId =
                        user.id;

                    req.session.authenticated =
                        true;

                    const token =
                        createAccessToken(user);

                    res.setHeader(
                        'X-CSRF-Token',
                        newCsrfToken
                    );

                    res.setHeader(
                        'X-User-ID',
                        user.id
                    );

                    addAuditLog(
                        user.id,
                        'LOGIN_SUCCESS',
                        'Successful login',
                        clientIP
                    );

                    return res.status(200).json({
                        success: true,

                        token,

                        user: {
                            id: user.id,
                            username:
                                user.username,
                            name:
                                decrypt(user.name),
                            role:
                                user.role,
                            active:
                                user.active,
                            lastLogin:
                                user.lastLogin
                        },

                        csrfToken:
                            newCsrfToken,

                        requestId:
                            req.requestId
                    });
                }
            );

        } catch (error) {

            console.error(
                '❌ Login error:',
                error.message
            );

            return res.status(500).json({
                success: false,
                error:
                    'خطأ في الخادم',
                requestId:
                    req.requestId
            });
        }
    }
);

// ============================================================
// 👤 CURRENT USER
// ============================================================

app.get(
    '/api/auth/me',
    requireAuth,
    (req, res) => {

        try {

            return res.status(200).json({
                success: true,

                user: {
                    id:
                        req.user.id,

                    username:
                        req.user.username,

                    name:
                        decrypt(
                            req.user.name
                        ),

                    role:
                        req.user.role,

                    active:
                        req.user.active,

                    lastLogin:
                        req.user.lastLogin
                },

                requestId:
                    req.requestId
            });

        } catch (error) {

            console.error(
                '❌ Auth/me error'
            );

            return res.status(500).json({
                success: false,
                error:
                    'خطأ في الخادم',
                requestId:
                    req.requestId
            });
        }
    }
);

// ============================================================
// 🔐 CHANGE PASSWORD
// ============================================================

app.post(
    '/api/auth/change-password',
    requireAuth,
    csrfProtection,
    async (req, res) => {

        try {

            const {
                currentPassword,
                newPassword
            } = req.body || {};

            if (
                !currentPassword ||
                !newPassword
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'جميع الحقول مطلوبة',
                    requestId:
                        req.requestId
                });
            }

            if (
                !isStrongPassword(
                    newPassword
                )
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'كلمة المرور الجديدة ضعيفة. يجب أن تحتوي على 12 حرف على الأقل، حروف كبيرة وصغيرة، أرقام ورموز خاصة',
                    requestId:
                        req.requestId
                });
            }

            const validPassword =
                bcrypt.compareSync(
                    currentPassword,
                    req.user.password
                );

            if (!validPassword) {

                addAuditLog(
                    req.user.id,
                    'PASSWORD_CHANGE_FAILED',
                    'Invalid current password',
                    getClientIP(req)
                );

                return res.status(401).json({
                    success: false,
                    error:
                        'كلمة المرور الحالية غير صحيحة',
                    requestId:
                        req.requestId
                });
            }

            req.user.password =
                await bcrypt.hash(
                    newPassword,
                    CONFIG.password.saltRounds
                );

            addAuditLog(
                req.user.id,
                'PASSWORD_CHANGED',
                'Password changed successfully',
                getClientIP(req)
            );

            return res.status(200).json({
                success: true,
                message:
                    '✅ تم تغيير كلمة المرور بنجاح',
                requestId:
                    req.requestId
            });

        } catch (error) {

            console.error(
                '❌ Change password error:',
                error.message
            );

            return res.status(500).json({
                success: false,
                error:
                    'خطأ في الخادم',
                requestId:
                    req.requestId
            });
        }
    }
);

// ============================================================
// 🚪 LOGOUT
// ============================================================
// CSRF intentionally not required here to remain compatible
// with the existing frontend logout implementation.

app.post(
    '/api/auth/logout',
    (req, res) => {

        const userId =
            req.session?.userId;

        if (userId) {
            addAuditLog(
                userId,
                'LOGOUT',
                'User logged out',
                getClientIP(req)
            );
        }

        req.session.destroy(
            (error) => {

                if (error) {
                    console.error(
                        '❌ Logout error'
                    );

                    return res.status(500).json({
                        success: false,
                        error:
                            'خطأ في تسجيل الخروج',
                        requestId:
                            req.requestId
                    });
                }

                res.clearCookie(
                    '__Secure-marine.sid',
                    {
                        path: '/',
                        httpOnly: true,
                        secure:
                            isProduction,
                        sameSite:
                            'strict'
                    }
                );

                return res.status(200).json({
                    success: true,
                    message:
                        'تم تسجيل الخروج',
                    requestId:
                        req.requestId
                });
            }
        );
    }
);

// ============================================================
// 🚢 GET VESSELS
// ============================================================

app.get(
    '/api/vessels',
    requireAuth,
    (req, res) => {

        try {

            const decryptedVessels =
                vessels.map(
                    vessel => ({
                        id:
                            vessel.id,

                        name:
                            decrypt(
                                vessel.name
                            ),

                        type:
                            decrypt(
                                vessel.type
                            ),

                        status:
                            vessel.status,

                        location:
                            decrypt(
                                vessel.location
                            ),

                        lastMaintenance:
                            vessel.lastMaintenance,

                        createdAt:
                            vessel.createdAt
                    })
                );

            return res.status(200).json(
                decryptedVessels
            );

        } catch (error) {

            console.error(
                '❌ Error reading vessels'
            );

            return res.status(500).json({
                success: false,
                error:
                    'خطأ في قراءة البيانات',
                requestId:
                    req.requestId
            });
        }
    }
);

// ============================================================
// ➕ ADD VESSEL
// ============================================================

app.post(
    '/api/vessels',
    requireAuth,
    requireAdmin,
    csrfProtection,
    (req, res) => {

        try {

            const {
                name,
                type,
                status,
                location
            } = req.body || {};

            if (
                typeof name !== 'string' ||
                !name.trim()
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'اسم الوحدة مطلوب',
                    requestId:
                        req.requestId
                });
            }

            const allowedStatuses = [
                'ready',
                'maintenance',
                'offline'
            ];

            const safeStatus =
                allowedStatuses.includes(
                    status
                )
                    ? status
                    : 'ready';

            const newVessel = {
                id:
                    crypto.randomBytes(8)
                        .toString('hex'),

                name:
                    encrypt(
                        name.trim()
                    ),

                type:
                    encrypt(
                        typeof type === 'string'
                            ? type.trim()
                            : 'غير محدد'
                    ),

                status:
                    safeStatus,

                location:
                    encrypt(
                        typeof location === 'string'
                            ? location.trim()
                            : '—'
                    ),

                lastMaintenance:
                    new Date().toISOString(),

                createdAt:
                    new Date().toISOString()
            };

            vessels.push(
                newVessel
            );

            addAuditLog(
                req.user.id,
                'VESSEL_CREATED',
                'New vessel created',
                getClientIP(req)
            );

            return res.status(201).json({
                success: true,

                vessel: {
                    id:
                        newVessel.id,

                    name:
                        decrypt(
                            newVessel.name
                        ),

                    type:
                        decrypt(
                            newVessel.type
                        ),

                    status:
                        newVessel.status,

                    location:
                        decrypt(
                            newVessel.location
                        ),

                    lastMaintenance:
                        newVessel.lastMaintenance,

                    createdAt:
                        newVessel.createdAt
                },

                requestId:
                    req.requestId
            });

        } catch (error) {

            console.error(
                '❌ Add vessel error:',
                error.message
            );

            return res.status(500).json({
                success: false,
                error:
                    'خطأ في إضافة الوحدة',
                requestId:
                    req.requestId
            });
        }
    }
);

// ============================================================
// 👥 GET USERS - ADMIN
// ============================================================

app.get(
    '/api/users',
    requireAuth,
    requireAdmin,
    (req, res) => {

        try {

            const safeUsers =
                users.map(
                    user => ({
                        id:
                            user.id,

                        username:
                            user.username,

                        name:
                            decrypt(
                                user.name
                            ),

                        role:
                            user.role,

                        active:
                            user.active,

                        createdAt:
                            user.createdAt,

                        lastLogin:
                            user.lastLogin
                    })
                );

            return res.status(200).json(
                safeUsers
            );

        } catch (error) {

            console.error(
                '❌ Users error'
            );

            return res.status(500).json({
                success: false,
                error:
                    'خطأ في الخادم',
                requestId:
                    req.requestId
            });
        }
    }
);

// ============================================================
// 📝 AUDIT LOGS - ADMIN
// ============================================================

app.get(
    '/api/logs',
    requireAuth,
    requireAdmin,
    (req, res) => {

        return res.status(200).json(
            auditLogs.slice(-100)
        );
    }
);

// ============================================================
// ❤️ SYSTEM STATUS
// ============================================================

app.get(
    '/api/status',
    (req, res) => {

        return res.status(200).json({
            success: true,
            status: 'online',
            version: '8.1.0',
            environment:
                isProduction
                    ? 'production'
                    : 'development',
            timestamp:
                new Date().toISOString(),
            requestId:
                req.requestId
        });
    }
);

// ============================================================
// 🚫 API 404
// ============================================================
// VERY IMPORTANT:
// Unknown /api/... NEVER receives index.html.
// It ALWAYS returns JSON.
// ============================================================

app.use(
    '/api',
    (req, res) => {

        return res.status(404).json({
            success: false,
            error:
                'API endpoint not found',
            path:
                req.path,
            requestId:
                req.requestId
        });
    }
);

// ============================================================
// 🌐 PAGE ROUTES
// ============================================================

// ------------------------------------------------------------
// HOME
// ------------------------------------------------------------

app.get(
    '/',
    (req, res) => {

        const indexCandidates = [
            path.join(
                __dirname,
                'index.html'
            ),

            path.join(
                __dirname,
                'public',
                'index.html'
            ),

            path.join(
                __dirname,
                'src',
                'index.html'
            )
        ];

        for (
            const indexPath
            of indexCandidates
        ) {

            if (
                fs.existsSync(
                    indexPath
                )
            ) {

                return res.sendFile(
                    indexPath,
                    {
                        headers: {
                            'Content-Type':
                                'text/html; charset=utf-8'
                        }
                    }
                );
            }
        }

        return res.status(404).send(
            '<!DOCTYPE html>' +
            '<html lang="ar" dir="rtl">' +
            '<head>' +
            '<meta charset="UTF-8">' +
            '<title>Marine System</title>' +
            '</head>' +
            '<body>' +
            '<h1>❌ index.html غير موجود</h1>' +
            '</body>' +
            '</html>'
        );
    }
);

// ------------------------------------------------------------
// /pages/:page
// ------------------------------------------------------------

app.get(
    '/pages/:page',
    (req, res) => {

        const pageName =
            req.params.page;

        if (
            servePage(
                req,
                res,
                pageName
            )
        ) {
            return;
        }

        return res.status(404).send(
            '<!DOCTYPE html>' +
            '<html lang="ar" dir="rtl">' +
            '<head>' +
            '<meta charset="UTF-8">' +
            '<title>404</title>' +
            '</head>' +
            '<body>' +
            '<h1>❌ 404</h1>' +
            '<p>الصفحة غير موجودة</p>' +
            '<a href="/">العودة للرئيسية</a>' +
            '</body>' +
            '</html>'
        );
    }
);

// ------------------------------------------------------------
// SHORT PAGE URLS
// ------------------------------------------------------------

app.get(
    '/:page',
    (req, res, next) => {

        const pageName =
            req.params.page;

        const reserved = [
            'api',
            'pages',
            'public',
            'assets',
            'css',
            'js',
            'favicon.ico',
            'robots.txt',
            'sitemap.xml'
        ];

        if (
            reserved.includes(
                pageName
            )
        ) {
            return next();
        }

        if (
            pageName.includes('.')
        ) {
            return next();
        }

        if (
            servePage(
                req,
                res,
                pageName
            )
        ) {
            return;
        }

        return next();
    }
);

// ============================================================
// 🌐 FINAL NON-API FALLBACK
// ============================================================
// IMPORTANT:
// This is app.use(), not an early app.get('*').
// API has already been handled above.
// ============================================================

app.use(
    (req, res) => {

        // Never return HTML for an API request.
        if (
            req.path.startsWith('/api/')
        ) {
            return res.status(404).json({
                success: false,
                error:
                    'API endpoint not found',
                requestId:
                    req.requestId
            });
        }

        // Missing files
        if (
            req.path.includes('.')
        ) {
            return res.status(404).send(
                '❌ ملف غير موجود'
            );
        }

        // SPA fallback
        const indexPath =
            path.join(
                __dirname,
                'index.html'
            );

        if (
            fs.existsSync(indexPath)
        ) {

            return res.sendFile(
                indexPath,
                {
                    headers: {
                        'Content-Type':
                            'text/html; charset=utf-8'
                    }
                }
            );
        }

        return res.status(404).send(
            '<!DOCTYPE html>' +
            '<html lang="ar" dir="rtl">' +
            '<head>' +
            '<meta charset="UTF-8">' +
            '<title>404</title>' +
            '</head>' +
            '<body>' +
            '<h1>❌ الصفحة غير موجودة</h1>' +
            '</body>' +
            '</html>'
        );
    }
);

// ============================================================
// 🔧 GLOBAL ERROR HANDLER
// ============================================================

app.use(
    (err, req, res, next) => {

        console.error(
            '❌ Global error:',
            err.message
        );

        if (
            res.headersSent
        ) {
            return next(err);
        }

        const status =
            Number(err.status) >= 400 &&
            Number(err.status) < 600
                ? Number(err.status)
                : 500;

        return res.status(status).json({
            success: false,

            error:
                isProduction
                    ? 'حدث خطأ في الخادم'
                    : err.message,

            requestId:
                req.requestId
        });
    }
);

// ============================================================
// 🚀 START SERVER
// ============================================================

const server =
    app.listen(
        PORT,
        () => {

            console.log(
                '========================================='
            );

            console.log(
                '🚢 MARINE SYSTEM v8.1 HARDENED'
            );

            console.log(
                '========================================='
            );

            console.log(
                `📍 Port: ${PORT}`
            );

            console.log(
                `🌍 Environment: ${
                    isProduction
                        ? 'production'
                        : 'development'
                }`
            );

            console.log(
                `👤 Admin username: ${ADMIN_USERNAME}`
            );

            // NEVER log password.
            console.log(
                '🔑 Admin password: [PROTECTED]'
            );

            console.log(
                '🛡️ Helmet: ENABLED'
            );

            console.log(
                '🛡️ CSRF: ENABLED'
            );

            console.log(
                '🔐 JWT: ENABLED'
            );

            console.log(
                '🚦 Rate limiting: ENABLED'
            );

            console.log(
                '👑 RBAC: ENABLED'
            );

            console.log(
                '🆔 Request IDs: ENABLED'
            );

            console.log(
                '🌐 API routes: BEFORE PAGE FALLBACK'
            );

            console.log(
                '========================================='
            );

            if (isProduction) {
                console.warn(
                    '⚠️ IMPORTANT: Use MongoDB/Redis session store in production.'
                );

                console.warn(
                    '⚠️ IMPORTANT: In-memory users/vessels/logs are temporary.'
                );
            }
        }
    );

// ============================================================
// 🛑 GRACEFUL SHUTDOWN
// ============================================================

function shutdown(signal) {

    console.log(
        `\n🛑 ${signal} received. Shutting down...`
    );

    server.close(
        () => {

            console.log(
                '✅ HTTP server closed.'
            );

            process.exit(0);
        }
    );

    setTimeout(
        () => {
            console.error(
                '❌ Forced shutdown.'
            );

            process.exit(1);
        },
        10000
    ).unref();
}

process.on(
    'SIGTERM',
    () => shutdown('SIGTERM')
);

process.on(
    'SIGINT',
    () => shutdown('SIGINT')
);

// ============================================================
// 🚨 PROCESS SAFETY
// ============================================================

process.on(
    'unhandledRejection',
    (reason) => {

        console.error(
            '❌ Unhandled Promise Rejection:',
            reason
        );
    }
);

process.on(
    'uncaughtException',
    (error) => {

        console.error(
            '❌ Uncaught Exception:',
            error
        );

        // Do not continue in an unknown state.
        if (isProduction) {
            shutdown(
                'uncaughtException'
            );
        }
    }
);

// ============================================================
// 📦 EXPORT
// ============================================================

module.exports = app;
```
