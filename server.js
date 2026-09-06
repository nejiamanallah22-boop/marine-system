'use strict';

/*
============================================================
🚢 MARINE SYSTEM
🔐 HARDENED PRODUCTION SERVER
Version: 9.0
============================================================

IMPORTANT:
- API routes are registered BEFORE page routes.
- NEVER expose __dirname as a static directory.
- Root "/" serves index.html automatically.
- Supports index.html in:
    ./index.html
    ./public/index.html
    ./pages/index.html
    ./src/index.html
- Supports pages in:
    ./pages/
    ./public/
    ./public/pages/
    ./src/
- Render compatible.
============================================================
*/

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
const compression = require('compression');
const hpp = require('hpp');

const app = express();

/* ============================================================
   CONFIGURATION
============================================================ */

const PORT = Number(process.env.PORT) || 5000;

const NODE_ENV = String(process.env.NODE_ENV || 'development')
    .trim()
    .toLowerCase();

const isProduction = NODE_ENV === 'production';

const CONFIG = {
    security: {
        maxLoginAttempts: 5,
        accountLockTime: 15
    },

    password: {
        saltRounds: 12
    },

    token: {
        expiry: process.env.JWT_EXPIRES_IN || '15m'
    },

    session: {
        maxAge: 24 * 60 * 60
    },

    csrf: {
        expiry: 8
    },

    rateLimit: {
        window: 15,
        max: 200
    },

    authRateLimit: {
        window: 15,
        max: 10
    },

    bodyLimit: '10kb'
};

/* ============================================================
   ENVIRONMENT VALIDATION
============================================================ */

function fatal(message) {
    console.error(`❌ FATAL: ${message}`);
    process.exit(1);
}

function requireSecret(name, minLength = 64) {
    const value = process.env[name];

    if (!value || typeof value !== 'string') {
        fatal(`${name} must be configured in production.`);
    }

    if (value.length < minLength) {
        fatal(`${name} must be configured in production and be sufficiently long.`);
    }

    return value;
}

let JWT_SECRET;
let SESSION_SECRET;
let ENCRYPTION_KEY;
let ENCRYPTION_IV;

if (isProduction) {
    JWT_SECRET = requireSecret('JWT_SECRET', 64);
    SESSION_SECRET = requireSecret('SESSION_SECRET', 64);

    ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

    if (!ENCRYPTION_KEY) {
        fatal('ENCRYPTION_KEY must be configured in production.');
    }

    if (!/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY)) {
        fatal('ENCRYPTION_KEY must contain exactly 64 hexadecimal characters.');
    }

    ENCRYPTION_IV = process.env.ENCRYPTION_IV;

    if (!ENCRYPTION_IV) {
        fatal('ENCRYPTION_IV must be configured in production.');
    }

    if (!/^[0-9a-fA-F]{32}$/.test(ENCRYPTION_IV)) {
        fatal('ENCRYPTION_IV must contain exactly 32 hexadecimal characters.');
    }
} else {
    JWT_SECRET =
        process.env.JWT_SECRET ||
        crypto.randomBytes(64).toString('hex');

    SESSION_SECRET =
        process.env.SESSION_SECRET ||
        crypto.randomBytes(64).toString('hex');

    ENCRYPTION_KEY =
        process.env.ENCRYPTION_KEY ||
        crypto.randomBytes(32).toString('hex');

    ENCRYPTION_IV =
        process.env.ENCRYPTION_IV ||
        crypto.randomBytes(16).toString('hex');
}

/* ============================================================
   ADMIN CONFIGURATION
============================================================ */

const ADMIN_USERNAME =
    String(process.env.ADMIN_USERNAME || 'admin').trim();

const ADMIN_NAME =
    String(process.env.ADMIN_NAME || 'مدير النظام').trim();

const ADMIN_PASSWORD =
    String(process.env.ADMIN_PASSWORD || '').trim();

if (isProduction && !ADMIN_PASSWORD) {
    fatal('ADMIN_PASSWORD must be configured in production.');
}

function isStrongPassword(password) {
    return (
        typeof password === 'string' &&
        password.length >= 12 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /[0-9]/.test(password) &&
        /[^A-Za-z0-9]/.test(password)
    );
}

if (isProduction && !isStrongPassword(ADMIN_PASSWORD)) {
    fatal(
        'ADMIN_PASSWORD must be at least 12 characters and contain uppercase, lowercase, number and special character.'
    );
}

/* ============================================================
   CRYPTOGRAPHY
============================================================ */

const AES_KEY = Buffer.from(ENCRYPTION_KEY, 'hex');
const AES_IV = Buffer.from(ENCRYPTION_IV, 'hex');

function encrypt(text) {
    try {
        if (text === null || text === undefined) {
            return '';
        }

        const cipher = crypto.createCipheriv(
            'aes-256-cbc',
            AES_KEY,
            AES_IV
        );

        let encrypted = cipher.update(String(text), 'utf8', 'hex');
        encrypted += cipher.final('hex');

        return encrypted;
    } catch (error) {
        console.error('❌ Encryption error:', error.message);

        if (isProduction) {
            throw new Error('Encryption failure');
        }

        return String(text);
    }
}

function decrypt(encrypted) {
    try {
        if (!encrypted) {
            return '';
        }

        const decipher = crypto.createDecipheriv(
            'aes-256-cbc',
            AES_KEY,
            AES_IV
        );

        let decrypted = decipher.update(
            encrypted,
            'hex',
            'utf8'
        );

        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('❌ Decryption error:', error.message);

        if (isProduction) {
            throw new Error('Decryption failure');
        }

        return encrypted;
    }
}

/* ============================================================
   SECURE RANDOM HELPERS
============================================================ */

function generateSecureToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
}

function generateRequestId() {
    return crypto.randomUUID();
}

/* ============================================================
   EXPRESS BASICS
============================================================ */

app.disable('x-powered-by');

if (isProduction) {
    app.set('trust proxy', 1);
} else {
    app.set('trust proxy', 1);
}

/* ============================================================
   HELMET
============================================================ */

app.use(
    helmet({
        contentSecurityPolicy: {
            useDefaults: true,

            directives: {
                defaultSrc: ["'self'"],

                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "'unsafe-eval'",
                    'https://unpkg.com',
                    'https://cdnjs.cloudflare.com',
                    'https://cdn.jsdelivr.net',
                    'https://cdn.sheetjs.com',
                    'https://fonts.googleapis.com',
                    'https://*.googleapis.com'
                ],

                scriptSrcAttr: [
                    "'unsafe-inline'"
                ],

                styleSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    'https://unpkg.com',
                    'https://cdnjs.cloudflare.com',
                    'https://cdn.jsdelivr.net',
                    'https://fonts.googleapis.com',
                    'https://*.googleapis.com'
                ],

                imgSrc: [
                    "'self'",
                    'data:',
                    'blob:',
                    'https:',
                    'http:'
                ],

                connectSrc: [
                    "'self'",
                    'https://*.onrender.com',
                    'https://unpkg.com',
                    'https://cdnjs.cloudflare.com',
                    'https://cdn.jsdelivr.net',
                    'https://*.googleapis.com',
                    'wss://*.onrender.com',
                    'ws://localhost:*'
                ],

                fontSrc: [
                    "'self'",
                    'https:',
                    'data:',
                    'https://fonts.gstatic.com',
                    'https://*.googleapis.com'
                ],

                objectSrc: [
                    "'none'"
                ],

                mediaSrc: [
                    "'self'"
                ],

                frameSrc: [
                    "'none'"
                ],

                baseUri: [
                    "'self'"
                ],

                formAction: [
                    "'self'"
                ],

                workerSrc: [
                    "'self'",
                    'blob:'
                ],

                upgradeInsecureRequests: isProduction
                    ? []
                    : null
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

        crossOriginEmbedderPolicy: false,

        crossOriginResourcePolicy: {
            policy: 'cross-origin'
        },

        permittedCrossDomainPolicies: {
            permittedPolicies: 'none'
        }
    })
);

/* ============================================================
   CORS
============================================================ */

const allowedOrigins = (
    process.env.ALLOWED_ORIGINS ||
    'https://marine-system-71eo.onrender.com'
)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

app.use(
    cors({
        origin(origin, callback) {
            // Browser same-origin / non-browser requests
            if (!origin) {
                return callback(null, true);
            }

            if (
                !isProduction ||
                allowedOrigins.includes(origin)
            ) {
                return callback(null, true);
            }

            console.warn('🚫 CORS rejected:', origin);

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

/* ============================================================
   COMPRESSION
============================================================ */

app.use(compression());

/* ============================================================
   BODY PARSERS
============================================================ */

app.use(
    express.json({
        limit: CONFIG.bodyLimit,
        strict: true
    })
);

app.use(
    express.urlencoded({
        extended: false,
        limit: CONFIG.bodyLimit
    })
);

app.use(cookieParser());

/* ============================================================
   HPP
============================================================ */

app.use(hpp());

/* ============================================================
   REQUEST ID
============================================================ */

app.use((req, res, next) => {
    req.requestId = generateRequestId();

    res.setHeader(
        'X-Request-ID',
        req.requestId
    );

    next();
});

/* ============================================================
   SECURITY LOGGING
============================================================ */

app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;

        console.log(
            `[${new Date().toISOString()}] ` +
            `${req.method} ${req.originalUrl} ` +
            `${res.statusCode} ` +
            `${duration}ms ` +
            `ID=${req.requestId}`
        );
    });

    next();
});

/* ============================================================
   SESSION
============================================================ */

/*
IMPORTANT:
We intentionally DO NOT set:
domain: '.onrender.com'

because that would allow the cookie to be sent to
other services/subdomains under onrender.com.

The cookie is therefore host-only.
*/

const sessionConfig = {
    secret: SESSION_SECRET,

    name: '__Secure-marine.sid',

    resave: false,

    saveUninitialized: false,

    rolling: true,

    proxy: isProduction,

    cookie: {
        secure: isProduction,
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        maxAge:
            CONFIG.session.maxAge *
            24 *
            60 *
            60 *
            1000
    }
};

app.use(session(sessionConfig));

/* ============================================================
   CSRF TOKEN INITIALIZATION
============================================================ */

app.use((req, res, next) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken =
            generateSecureToken();

        req.session.csrfExpiry =
            Date.now() +
            CONFIG.csrf.expiry *
                60 *
                60 *
                1000;
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
            CONFIG.csrf.expiry *
                60 *
                60 *
                1000;
    }

    res.setHeader(
        'X-CSRF-Token',
        req.session.csrfToken
    );

    res.setHeader(
        'X-Session-Expiry',
        String(req.session.csrfExpiry || '')
    );

    next();
});

/* ============================================================
   RATE LIMITING
============================================================ */

const limiter = rateLimit({
    windowMs:
        CONFIG.rateLimit.window *
        60 *
        1000,

    max: CONFIG.rateLimit.max,

    standardHeaders: true,

    legacyHeaders: false,

    message: {
        success: false,
        error:
            'Too many requests, please try again later.'
    },

    keyGenerator: req => {
        return (
            req.ip ||
            req.socket.remoteAddress ||
            'unknown'
        );
    }
});

app.use('/api/', limiter);

/* ============================================================
   AUTH RATE LIMIT
============================================================ */

const authLimiter = rateLimit({
    windowMs:
        CONFIG.authRateLimit.window *
        60 *
        1000,

    max: CONFIG.authRateLimit.max,

    standardHeaders: true,

    legacyHeaders: false,

    message: {
        success: false,
        error:
            `Too many login attempts. ` +
            `Please try again after ${CONFIG.authRateLimit.window} minutes.`
    },

    keyGenerator: req => {
        return (
            req.ip ||
            req.socket.remoteAddress ||
            'unknown'
        );
    }
});

app.use(
    '/api/auth/login',
    authLimiter
);

app.use(
    '/api/auth/change-password',
    authLimiter
);

/* ============================================================
   DATA
============================================================ */

const users = [
    {
        id: generateSecureToken(16),

        username: ADMIN_USERNAME,

        password: bcrypt.hashSync(
            ADMIN_PASSWORD,
            CONFIG.password.saltRounds
        ),

        name: encrypt(ADMIN_NAME),

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
        id: generateSecureToken(8),

        name: encrypt('الوحدة 101'),

        type: encrypt('زورق دورية'),

        status: 'ready',

        location: encrypt('الميناء الرئيسي'),

        lastMaintenance:
            new Date().toISOString(),

        createdAt:
            new Date().toISOString()
    },

    {
        id: generateSecureToken(8),

        name: encrypt('الوحدة 205'),

        type: encrypt('قاطرة بحرية'),

        status: 'maintenance',

        location: encrypt('حوض السفن'),

        lastMaintenance:
            new Date().toISOString(),

        createdAt:
            new Date().toISOString()
    },

    {
        id: generateSecureToken(8),

        name: encrypt('الوحدة 312'),

        type: encrypt('سفينة إسناد'),

        status: 'offline',

        location: encrypt('الميناء الغربي'),

        lastMaintenance:
            new Date().toISOString(),

        createdAt:
            new Date().toISOString()
    }
];

const auditLogs = [];

/* ============================================================
   AUDIT
============================================================ */

function addAuditLog(
    userId,
    action,
    details,
    ip
) {
    auditLogs.push({
        id: generateSecureToken(8),

        userId: userId || null,

        action: String(action || ''),

        details: String(details || ''),

        ip: String(ip || ''),

        timestamp:
            new Date().toISOString()
    });

    if (auditLogs.length > 1000) {
        auditLogs.shift();
    }
}

/* ============================================================
   CLIENT IP
============================================================ */

function getClientIP(req) {
    return (
        req.ip ||
        req.socket?.remoteAddress ||
        'unknown'
    );
}

/* ============================================================
   CSRF PROTECTION
============================================================ */

function csrfProtection(req, res, next) {
    if (
        ['GET', 'HEAD', 'OPTIONS'].includes(
            req.method
        )
    ) {
        return next();
    }

    /*
    Login is intentionally excluded because the login
    page needs to establish the authenticated session.

    The CSRF token is still generated before login.
    */

    const skipPaths = [
        '/api/auth/login',
        '/api/csrf-token'
    ];

    if (
        skipPaths.includes(req.path)
    ) {
        return next();
    }

    const token =
        req.headers['x-csrf-token'] ||
        req.body?.csrf_token;

    const sessionToken =
        req.session.csrfToken;

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

    try {
        const tokenBuffer =
            Buffer.from(
                String(token),
                'utf8'
            );

        const sessionBuffer =
            Buffer.from(
                String(sessionToken),
                'utf8'
            );

        if (
            tokenBuffer.length !==
            sessionBuffer.length
        ) {
            return res.status(403).json({
                success: false,
                error: 'CSRF token غير صالح'
            });
        }

        const valid =
            crypto.timingSafeEqual(
                tokenBuffer,
                sessionBuffer
            );

        if (!valid) {
            return res.status(403).json({
                success: false,
                error: 'CSRF token غير صالح'
            });
        }

        /*
        Rotate token after successful state-changing request.
        */

        const newToken =
            generateSecureToken();

        req.session.csrfToken =
            newToken;

        req.session.csrfExpiry =
            Date.now() +
            CONFIG.csrf.expiry *
                60 *
                60 *
                1000;

        res.setHeader(
            'X-CSRF-Token',
            newToken
        );

        return next();

    } catch (error) {
        console.error(
            'CSRF validation error:',
            error.message
        );

        return res.status(403).json({
            success: false,
            error: 'CSRF token غير صالح'
        });
    }
}

/* ============================================================
   JWT
============================================================ */

function createAccessToken(user) {
    return jwt.sign(
        {
            id: user.id,

            username: user.username,

            role: user.role,

            jti: generateSecureToken(16)
        },

        JWT_SECRET,

        {
            expiresIn:
                CONFIG.token.expiry,

            algorithm: 'HS256'
        }
    );
}

/* ============================================================
   JWT AUTH MIDDLEWARE
============================================================ */

function requireAuth(req, res, next) {
    try {
        const authHeader =
            req.headers.authorization;

        if (
            !authHeader ||
            !authHeader.startsWith(
                'Bearer '
            )
        ) {
            return res.status(401).json({
                success: false,
                error: 'غير مصرح'
            });
        }

        const token =
            authHeader.substring(7).trim();

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'توكن مفقود'
            });
        }

        const decoded =
            jwt.verify(
                token,
                JWT_SECRET,
                {
                    algorithms: ['HS256']
                }
            );

        const user =
            users.find(
                u => u.id === decoded.id
            );

        if (
            !user ||
            !user.active
        ) {
            return res.status(401).json({
                success: false,
                error:
                    'المستخدم غير موجود أو غير نشط'
            });
        }

        if (
            req.session.userId &&
            req.session.userId !== user.id
        ) {
            return res.status(401).json({
                success: false,
                error: 'الجلسة غير صالحة'
            });
        }

        req.user = user;

        req.tokenPayload = decoded;

        next();

    } catch (error) {
        if (
            error.name ===
            'TokenExpiredError'
        ) {
            return res.status(401).json({
                success: false,
                error:
                    'انتهت صلاحية التوكن'
            });
        }

        return res.status(401).json({
            success: false,
            error: 'توكن غير صالح'
        });
    }
}

/* ============================================================
   ADMIN AUTH
============================================================ */

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
            error: 'صلاحيات المدير مطلوبة'
        });
    }

    next();
}

/* ============================================================
   NO-CACHE API
============================================================ */

app.use('/api/', (req, res, next) => {
    res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, private'
    );

    res.setHeader(
        'Pragma',
        'no-cache'
    );

    res.setHeader(
        'Expires',
        '0'
    );

    next();
});

/*
============================================================
IMPORTANT:
ALL API ROUTES COME BEFORE STATIC/PAGE ROUTES.
============================================================
*/

/* ============================================================
   API — CSRF
============================================================ */

app.get(
    '/api/csrf-token',
    (req, res) => {
        res.setHeader(
            'Cache-Control',
            'no-store'
        );

        res.json({
            success: true,

            token:
                req.session.csrfToken,

            expiresIn:
                req.session.csrfExpiry
                    ? req.session.csrfExpiry -
                      Date.now()
                    : CONFIG.csrf.expiry *
                      60 *
                      60 *
                      1000
        });
    }
);

/* ============================================================
   API — LOGIN
============================================================ */

app.post(
    '/api/auth/login',
    (req, res) => {
        try {
            const username =
                typeof req.body?.username ===
                'string'
                    ? req.body.username.trim()
                    : '';

            const password =
                typeof req.body?.password ===
                'string'
                    ? req.body.password
                    : '';

            const clientIP =
                getClientIP(req);

            console.log(
                '🔐 Login attempt:',
                username || '[empty]',
                'from',
                clientIP
            );

            if (
                !username ||
                !password
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'بيانات غير صالحة'
                });
            }

            const user =
                users.find(
                    u =>
                        u.username ===
                        username
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
                        'اسم المستخدم أو كلمة المرور غير صحيحة'
                });
            }

            if (
                user.locked &&
                user.lockedUntil &&
                Date.now() <
                    user.lockedUntil
            ) {
                const remaining =
                    Math.ceil(
                        (
                            user.lockedUntil -
                            Date.now()
                        ) /
                        60000
                    );

                return res.status(403).json({
                    success: false,
                    error:
                        'الحساب مقفل. حاول مرة أخرى بعد ' +
                        remaining +
                        ' دقيقة'
                });
            }

            /*
            Unlock automatically after lock duration.
            */

            if (
                user.locked &&
                user.lockedUntil &&
                Date.now() >=
                    user.lockedUntil
            ) {
                user.locked = false;
                user.lockedUntil = null;
                user.loginAttempts = 0;
            }

            const validPassword =
                bcrypt.compareSync(
                    password,
                    user.password
                );

            if (!validPassword) {
                user.loginAttempts =
                    (user.loginAttempts || 0) +
                    1;

                if (
                    user.loginAttempts >=
                    CONFIG.security
                        .maxLoginAttempts
                ) {
                    user.locked = true;

                    user.lockedUntil =
                        Date.now() +
                        CONFIG.security
                            .accountLockTime *
                            60 *
                            1000;

                    addAuditLog(
                        user.id,
                        'ACCOUNT_LOCKED',
                        'Too many failed login attempts',
                        clientIP
                    );

                    return res.status(403).json({
                        success: false,
                        error:
                            'الحساب مقفل لمدة ' +
                            CONFIG.security
                                .accountLockTime +
                            ' دقيقة بسبب كثرة المحاولات الفاشلة'
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
                        'اسم المستخدم أو كلمة المرور غير صحيحة'
                });
            }

            /*
            Successful login.
            */

            user.loginAttempts = 0;

            user.locked = false;

            user.lockedUntil = null;

            user.lastLogin =
                new Date().toISOString();

            /*
            Regenerate session after authentication
            to reduce session fixation risk.
            */

            req.session.regenerate(
                (sessionError) => {
                    if (sessionError) {
                        console.error(
                            'Session regeneration error:',
                            sessionError
                        );

                        return res.status(500).json({
                            success: false,
                            error:
                                'خطأ في إنشاء الجلسة'
                        });
                    }

                    req.session.userId =
                        user.id;

                    req.session.csrfToken =
                        generateSecureToken();

                    req.session.csrfExpiry =
                        Date.now() +
                        CONFIG.csrf.expiry *
                            60 *
                            60 *
                            1000;

                    const token =
                        createAccessToken(
                            user
                        );

                    res.setHeader(
                        'X-CSRF-Token',
                        req.session.csrfToken
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

                    return res.json({
                        success: true,

                        token,

                        user: {
                            id: user.id,

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

                            lastLogin:
                                user.lastLogin
                        },

                        csrfToken:
                            req.session.csrfToken
                    });
                }
            );

        } catch (error) {
            console.error(
                'Login error:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'خطأ في الخادم'
            });
        }
    }
);

/* ============================================================
   API — CURRENT USER
============================================================ */

app.get(
    '/api/auth/me',
    requireAuth,
    (req, res) => {
        try {
            const user =
                req.user;

            res.json({
                success: true,

                user: {
                    id: user.id,

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

                    lastLogin:
                        user.lastLogin
                },

                csrfToken:
                    req.session.csrfToken
            });

        } catch (error) {
            console.error(
                'Auth me error:',
                error
            );

            res.status(500).json({
                success: false,
                error:
                    'خطأ في الخادم'
            });
        }
    }
);

/* ============================================================
   API — CHANGE PASSWORD
============================================================ */

app.post(
    '/api/auth/change-password',
    csrfProtection,
    requireAuth,
    async (req, res) => {
        try {
            const {
                currentPassword,
                newPassword
            } = req.body || {};

            const clientIP =
                getClientIP(req);

            if (
                !currentPassword ||
                !newPassword
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'جميع الحقول مطلوبة'
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
                        'كلمة المرور الجديدة ضعيفة. يجب أن تحتوي على 12 حرف على الأقل، حروف كبيرة وصغيرة، أرقام ورموز خاصة'
                });
            }

            const user =
                req.user;

            const validPassword =
                bcrypt.compareSync(
                    currentPassword,
                    user.password
                );

            if (!validPassword) {
                addAuditLog(
                    user.id,
                    'PASSWORD_CHANGE_FAILED',
                    'Invalid current password',
                    clientIP
                );

                return res.status(401).json({
                    success: false,
                    error:
                        'كلمة المرور الحالية غير صحيحة'
                });
            }

            if (
                bcrypt.compareSync(
                    newPassword,
                    user.password
                )
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'لا يمكنك استخدام كلمة المرور الحالية'
                });
            }

            user.password =
                await bcrypt.hash(
                    newPassword,
                    CONFIG.password
                        .saltRounds
                );

            addAuditLog(
                user.id,
                'PASSWORD_CHANGED',
                'Password changed successfully',
                clientIP
            );

            return res.json({
                success: true,
                message:
                    '✅ تم تغيير كلمة المرور بنجاح'
            });

        } catch (error) {
            console.error(
                'Change password error:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'خطأ في الخادم'
            });
        }
    }
);

/* ============================================================
   API — LOGOUT
============================================================ */

app.post(
    '/api/auth/logout',
    (req, res) => {
        const userId =
            req.session?.userId;

        const clientIP =
            getClientIP(req);

        if (userId) {
            addAuditLog(
                userId,
                'LOGOUT',
                'User logged out',
                clientIP
            );
        }

        req.session.destroy(
            (err) => {
                if (err) {
                    console.error(
                        'Logout error:',
                        err
                    );
                }

                res.clearCookie(
                    '__Secure-marine.sid',
                    {
                        path: '/',
                        httpOnly: true,
                        secure: isProduction,
                        sameSite: 'strict'
                    }
                );

                return res.json({
                    success: true,
                    message:
                        'تم تسجيل الخروج'
                });
            }
        );
    }
);

/* ============================================================
   API — VESSELS
============================================================ */

app.get(
    '/api/vessels',
    requireAuth,
    (req, res) => {
        try {
            const decryptedVessels =
                vessels.map(v => ({
                    id: v.id,

                    name:
                        decrypt(
                            v.name
                        ),

                    type:
                        decrypt(
                            v.type
                        ),

                    status:
                        v.status,

                    location:
                        decrypt(
                            v.location
                        ),

                    lastMaintenance:
                        v.lastMaintenance,

                    createdAt:
                        v.createdAt
                }));

            return res.json(
                decryptedVessels
            );

        } catch (error) {
            console.error(
                'Vessels error:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'خطأ في قراءة البيانات'
            });
        }
    }
);

/* ============================================================
   API — ADD VESSEL
============================================================ */

app.post(
    '/api/vessels',
    csrfProtection,
    requireAuth,
    (req, res) => {
        try {
            const {
                name,
                type,
                status,
                location
            } = req.body || {};

            if (
                typeof name !==
                    'string' ||
                !name.trim()
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'اسم الوحدة مطلوب'
                });
            }

            if (
                name.length > 150 ||
                (type &&
                    String(type).length >
                        150) ||
                (location &&
                    String(location).length >
                        250)
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'البيانات طويلة جدًا'
                });
            }

            const newVessel = {
                id: generateSecureToken(8),

                name:
                    encrypt(
                        name.trim()
                    ),

                type:
                    encrypt(
                        type
                            ? String(
                                  type
                              ).trim()
                            : 'غير محدد'
                    ),

                status:
                    status || 'ready',

                location:
                    encrypt(
                        location
                            ? String(
                                  location
                              ).trim()
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

            return res.json({
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
                }
            });

        } catch (error) {
            console.error(
                'Add vessel error:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'خطأ في إضافة الوحدة'
            });
        }
    }
);

/* ============================================================
   API — USERS
============================================================ */

app.get(
    '/api/users',
    requireAuth,
    requireAdmin,
    (req, res) => {
        try {
            const safeUsers =
                users.map(u => ({
                    id: u.id,

                    username:
                        u.username,

                    name:
                        decrypt(
                            u.name
                        ),

                    role:
                        u.role,

                    active:
                        u.active,

                    createdAt:
                        u.createdAt,

                    lastLogin:
                        u.lastLogin
                }));

            return res.json(
                safeUsers
            );

        } catch (error) {
            console.error(
                'Users error:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'خطأ في الخادم'
            });
        }
    }
);

/* ============================================================
   API — LOGS
============================================================ */

app.get(
    '/api/logs',
    requireAuth,
    requireAdmin,
    (req, res) => {
        return res.json(
            auditLogs
                .slice(-100)
                .reverse()
        );
    }
);

/* ============================================================
   API — STATUS
============================================================ */

app.get(
    '/api/status',
    (req, res) => {
        return res.json({
            status: 'online',

            version: '9.0.0',

            environment:
                NODE_ENV,

            timestamp:
                new Date().toISOString()
        });
    }
);

/* ============================================================
   API — UNKNOWN ROUTE
============================================================ */

app.use(
    '/api',
    (req, res) => {
        return res.status(404).json({
            success: false,
            error:
                'المسار API غير موجود'
        });
    }
);

/*
============================================================
STATIC FILES
============================================================

DO NOT USE:

app.use(express.static(__dirname));

It exposes the whole application directory.

Instead we explicitly expose only frontend directories.
============================================================
*/

const ROOT_DIR = __dirname;

const STATIC_DIRECTORIES = [
    {
        url: '/public',
        directory:
            path.join(
                ROOT_DIR,
                'public'
            )
    },

    {
        url: '/pages',
        directory:
            path.join(
                ROOT_DIR,
                'pages'
            )
    },

    {
        url: '/css',
        directory:
            path.join(
                ROOT_DIR,
                'css'
            )
    },

    {
        url: '/js',
        directory:
            path.join(
                ROOT_DIR,
                'js'
            )
    },

    {
        url: '/assets',
        directory:
            path.join(
                ROOT_DIR,
                'assets'
            )
    },

    {
        url: '/src',
        directory:
            path.join(
                ROOT_DIR,
                'src'
            )
    }
];

for (const item of STATIC_DIRECTORIES) {
    if (
        fs.existsSync(
            item.directory
        )
    ) {
        app.use(
            item.url,
            express.static(
                item.directory,
                {
                    dotfiles: 'deny',

                    index: false,

                    fallthrough: true,

                    maxAge:
                        isProduction
                            ? '1h'
                            : 0
                }
            )
        );
    }
}

/* ============================================================
   PAGE FILE DISCOVERY
============================================================ */

function safePageName(pageName) {
    if (
        typeof pageName !==
        'string'
    ) {
        return false;
    }

    return /^[a-zA-Z0-9_-]{1,100}$/.test(
        pageName
    );
}

function findPageFile(pageName) {
    if (
        !safePageName(pageName)
    ) {
        return null;
    }

    const possiblePaths = [
        path.join(
            ROOT_DIR,
            'pages',
            `${pageName}.html`
        ),

        path.join(
            ROOT_DIR,
            'public',
            `${pageName}.html`
        ),

        path.join(
            ROOT_DIR,
            'public',
            'pages',
            `${pageName}.html`
        ),

        path.join(
            ROOT_DIR,
            'src',
            `${pageName}.html`
        ),

        path.join(
            ROOT_DIR,
            `${pageName}.html`
        )
    ];

    for (
        const filePath of possiblePaths
    ) {
        try {
            const resolved =
                path.resolve(
                    filePath
                );

            const root =
                path.resolve(
                    ROOT_DIR
                );

            if (
                !resolved.startsWith(
                    root +
                        path.sep
                )
            ) {
                continue;
            }

            if (
                fs.existsSync(
                    resolved
                ) &&
                fs.statSync(
                    resolved
                ).isFile()
            ) {
                return resolved;
            }
        } catch {
            // Ignore invalid paths
        }
    }

    return null;
}

/* ============================================================
   INDEX.HTML DISCOVERY
============================================================ */

function findIndexFile() {
    const candidates = [
        path.join(
            ROOT_DIR,
            'index.html'
        ),

        path.join(
            ROOT_DIR,
            'public',
            'index.html'
        ),

        path.join(
            ROOT_DIR,
            'pages',
            'index.html'
        ),

        path.join(
            ROOT_DIR,
            'public',
            'pages',
            'index.html'
        ),

        path.join(
            ROOT_DIR,
            'src',
            'index.html'
        )
    ];

    for (
        const filePath of candidates
    ) {
        try {
            if (
                fs.existsSync(
                    filePath
                ) &&
                fs.statSync(
                    filePath
                ).isFile()
            ) {
                return filePath;
            }
        } catch {
            // continue
        }
    }

    return null;
}

/* ============================================================
   SERVE PAGE
============================================================ */

function servePage(
    req,
    res,
    pageName
) {
    const filePath =
        findPageFile(
            pageName
        );

    if (!filePath) {
        return false;
    }

    console.log(
        `📄 Serving page "${pageName}" -> ${filePath}`
    );

    res.type('html');

    res.sendFile(
        filePath,
        {
            dotfiles: 'deny',
            acceptRanges: true,
            cacheControl: false
        },
        error => {
            if (error) {
                console.error(
                    'sendFile error:',
                    error
                );
            }
        }
    );

    return true;
}

/* ============================================================
   ROOT PAGE
============================================================ */

app.get(
    '/',
    (req, res) => {
        const indexFile =
            findIndexFile();

        if (!indexFile) {
            console.error(
                '❌ index.html not found.'
            );

            return res.status(500).type('html').send(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Marine System</title>
</head>
<body>
<h1>⚠️ واجهة الدخول غير موجودة</h1>
<p>لم يتم العثور على ملف index.html في المشروع.</p>
</body>
</html>
            `);
        }

        console.log(
            `🏠 Serving login/home page -> ${indexFile}`
        );

        res.type('html');

        return res.sendFile(
            indexFile,
            {
                dotfiles: 'deny',
                cacheControl: false
            }
        );
    }
);

/* ============================================================
   /LOGIN
============================================================ */

app.get(
    '/login',
    (req, res) => {
        const indexFile =
            findIndexFile();

        if (!indexFile) {
            return res.redirect('/');
        }

        res.type('html');

        return res.sendFile(
            indexFile,
            {
                dotfiles: 'deny',
                cacheControl: false
            }
        );
    }
);

/* ============================================================
   /PAGES/:PAGE
============================================================ */

app.get(
    '/pages/:page',
    (req, res) => {
        const pageName =
            req.params.page;

        if (
            !safePageName(
                pageName
            )
        ) {
            return res.status(400).type('html').send(
                '<h1>400 Bad Request</h1>'
            );
        }

        const found =
            servePage(
                req,
                res,
                pageName
            );

        if (found) {
            return;
        }

        return res.status(404).type('html').send(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>404</title>
</head>
<body>
<h1>❌ 404</h1>
<p>الصفحة غير موجودة.</p>
<a href="/">العودة إلى تسجيل الدخول</a>
</body>
</html>
        `);
    }
);

/* ============================================================
   SHORT PAGE URLS
============================================================ */

const RESERVED_PATHS = new Set([
    'api',
    'pages',
    'public',
    'assets',
    'css',
    'js',
    'src',
    'favicon.ico',
    'robots.txt',
    'sitemap.xml'
]);

app.get(
    '/:page',
    (req, res, next) => {
        const pageName =
            req.params.page;

        if (
            RESERVED_PATHS.has(
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
            !safePageName(
                pageName
            )
        ) {
            return next();
        }

        const found =
            servePage(
                req,
                res,
                pageName
            );

        if (found) {
            return;
        }

        return next();
    }
);

/* ============================================================
   FAVICON / ROBOTS
============================================================ */

app.get(
    '/robots.txt',
    (req, res) => {
        res.type('text/plain');

        res.send(
            'User-agent: *\nDisallow: /api/\n'
        );
    }
);

/* ============================================================
   UNKNOWN FILES
============================================================ */

app.use(
    (req, res, next) => {
        if (
            req.path.includes('.')
        ) {
            return res.status(404).send(
                '❌ الملف غير موجود'
            );
        }

        next();
    }
);

/* ============================================================
   FINAL 404
============================================================ */

app.use(
    (req, res) => {
        /*
        VERY IMPORTANT:
        Never return index.html for /api routes.
        API routes were already handled above.
        */

        if (
            req.path.startsWith(
                '/api/'
            )
        ) {
            return res.status(404).json({
                success: false,
                error:
                    'المسار غير موجود'
            });
        }

        return res.status(404).type('html').send(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>404</title>
<style>
body {
    font-family: Arial, sans-serif;
    text-align: center;
    padding: 60px;
}
a {
    text-decoration: none;
}
</style>
</head>
<body>
<h1>❌ 404</h1>
<p>الصفحة المطلوبة غير موجودة.</p>
<a href="/">⬅️ العودة إلى تسجيل الدخول</a>
</body>
</html>
        `);
    }
);

/* ============================================================
   GLOBAL ERROR HANDLER
============================================================ */

app.use(
    (err, req, res, next) => {
        console.error(
            '🔥 Global error:',
            err
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

            error: isProduction
                ? 'حدث خطأ في الخادم'
                : err.message,

            requestId:
                req.requestId
        });
    }
);

/* ============================================================
   START SERVER
============================================================ */

const server =
    app.listen(
        PORT,
        () => {
            console.log(
                '=============================================='
            );

            console.log(
                '🚢 MARINE SYSTEM v9.0'
            );

            console.log(
                '=============================================='
            );

            console.log(
                `📍 Port: ${PORT}`
            );

            console.log(
                `🌍 Environment: ${NODE_ENV}`
            );

            console.log(
                `🔐 JWT: ENABLED`
            );

            console.log(
                `🛡️ CSRF: ENABLED`
            );

            console.log(
                `🚦 Rate Limiting: ENABLED`
            );

            console.log(
                `🔒 Helmet: ENABLED`
            );

            console.log(
                `📁 Secure static routing: ENABLED`
            );

            console.log(
                `🏠 Index discovery: ENABLED`
            );

            console.log(
                `👤 Admin: ${ADMIN_USERNAME}`
            );

            console.log(
                `📊 Vessels: ${vessels.length}`
            );

            console.log(
                '=============================================='
            );

            console.log(
                '✅ SERVER READY'
            );

            console.log(
                '=============================================='
            );
        }
    );

/* ============================================================
   GRACEFUL SHUTDOWN
============================================================ */

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
                '⚠️ Forced shutdown.'
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

/* ============================================================
   PROCESS ERRORS
============================================================ */

process.on(
    'unhandledRejection',
    reason => {
        console.error(
            '❌ Unhandled Promise Rejection:',
            reason
        );
    }
);

process.on(
    'uncaughtException',
    error => {
        console.error(
            '❌ Uncaught Exception:',
            error
        );

        /*
        Do not silently continue after an uncaught exception
        in production.
        */

        if (isProduction) {
            process.exit(1);
        }
    }
);

/* ============================================================
   EXPORT
============================================================ */

module.exports = app;
