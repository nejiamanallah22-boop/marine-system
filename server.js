// ============================================================
// 🚢 MARINE SYSTEM - v8.2 HARDENED / PRODUCTION FIXED
// ============================================================
// SERVER-ONLY HARDENED VERSION
//
// FIXES:
// ✅ API routes always handled before page fallback
// ✅ API 404 always returns JSON
// ✅ No API request receives index.html
// ✅ No wildcard route before API
// ✅ Fixed CSRF token race condition
// ✅ Authentication middleware
// ✅ Admin RBAC
// ✅ Secure Render proxy configuration
// ✅ Secure HttpOnly/SameSite session cookie
// ✅ Removed dangerous cookie domain
// ✅ No password logging
// ✅ Strict JWT algorithm
// ✅ Request IDs
// ✅ Security headers
// ✅ Rate limiting
// ✅ Body limits
// ✅ Path traversal protection
// ✅ Server-side files not publicly exposed
// ✅ Safe static asset handling
// ✅ Graceful shutdown
// ✅ Node.js 26 compatible
//
// IMPORTANT:
// This version keeps the existing frontend/API contract.
// No frontend changes are required.
// ============================================================

'use strict';

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

// ============================================================
// 🔧 BASIC CONFIG
// ============================================================

const PORT =
    Number.parseInt(process.env.PORT, 10) || 5000;

const isProduction =
    process.env.NODE_ENV === 'production';

// ============================================================
// 🔐 EXPRESS / RENDER
// ============================================================

if (isProduction) {
    // Render terminates HTTPS at the proxy.
    // Trust exactly one proxy hop.
    app.set('trust proxy', 1);
}

app.disable('x-powered-by');

// ============================================================
// 🔐 SECURE CONFIGURATION HELPERS
// ============================================================

function generateSecureKey(bytes = 32) {
    return crypto
        .randomBytes(bytes)
        .toString('hex');
}

function generateSecureToken() {
    return crypto
        .randomBytes(32)
        .toString('hex');
}

function generateRequestId() {
    return crypto
        .randomBytes(16)
        .toString('hex');
}

// ============================================================
// 🔑 PASSWORD POLICY
// ============================================================

function isStrongPassword(password) {

    if (typeof password !== 'string') {
        return false;
    }

    const hasUpperCase =
        /[A-Z]/.test(password);

    const hasLowerCase =
        /[a-z]/.test(password);

    const hasNumbers =
        /\d/.test(password);

    const hasSpecialChar =
        /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(
            password
        );

    const isLongEnough =
        password.length >= 12;

    return (
        hasUpperCase &&
        hasLowerCase &&
        hasNumbers &&
        hasSpecialChar &&
        isLongEnough
    );
}

// ============================================================
// 🔐 CRYPTOGRAPHIC PASSWORD GENERATOR
// ============================================================

function generateStrongPassword(length = 20) {

    const uppercase =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    const lowercase =
        'abcdefghijklmnopqrstuvwxyz';

    const numbers =
        '0123456789';

    const special =
        '!@#$%^&*()_+-=';

    const all =
        uppercase +
        lowercase +
        numbers +
        special;

    const randomChar = (set) =>
        set[
            crypto.randomInt(
                0,
                set.length
            )
        ];

    let password = '';

    password += randomChar(uppercase);
    password += randomChar(lowercase);
    password += randomChar(numbers);
    password += randomChar(special);

    while (password.length < length) {
        password += randomChar(all);
    }

    const chars =
        password.split('');

    for (
        let i = chars.length - 1;
        i > 0;
        i--
    ) {
        const j =
            crypto.randomInt(
                0,
                i + 1
            );

        [
            chars[i],
            chars[j]
        ] = [
            chars[j],
            chars[i]
        ];
    }

    return chars.join('');
}

// ============================================================
// 🔑 ENVIRONMENT VARIABLES
// ============================================================

const ADMIN_USERNAME =
    process.env.ADMIN_USERNAME ||
    'admin';

let ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {

    if (isProduction) {

        console.error(
            '❌ FATAL: ADMIN_PASSWORD must be configured in production.'
        );

        process.exit(1);
    }

    ADMIN_PASSWORD =
        generateStrongPassword();

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
    process.env.ADMIN_NAME ||
    'أمان الله ناجي';

// ============================================================
// 🔐 JWT SECRET
// ============================================================

const JWT_SECRET =
    process.env.JWT_SECRET ||
    generateSecureKey(64);

if (
    isProduction &&
    (
        !process.env.JWT_SECRET ||
        JWT_SECRET.length < 64
    )
) {

    console.error(
        '❌ FATAL: JWT_SECRET must be configured in production and be sufficiently long.'
    );

    process.exit(1);
}

// ============================================================
// 🍪 SESSION SECRET
// ============================================================

const SESSION_SECRET =
    process.env.SESSION_SECRET ||
    generateSecureKey(64);

if (
    isProduction &&
    (
        !process.env.SESSION_SECRET ||
        SESSION_SECRET.length < 64
    )
) {

    console.error(
        '❌ FATAL: SESSION_SECRET must be configured in production and be sufficiently long.'
    );

    process.exit(1);
}

// ============================================================
// 🔐 ENCRYPTION KEY
// ============================================================

let ENCRYPTION_KEY =
    process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {

    ENCRYPTION_KEY =
        generateSecureKey(32);

    if (isProduction) {

        console.error(
            '❌ FATAL: ENCRYPTION_KEY must be configured in production.'
        );

        process.exit(1);
    }
}

if (
    !/^[0-9a-fA-F]{64}$/.test(
        ENCRYPTION_KEY
    )
) {

    console.error(
        '❌ FATAL: ENCRYPTION_KEY must be exactly 64 hexadecimal characters.'
    );

    process.exit(1);
}

// ============================================================
// 🔐 ENCRYPTION IV
// ============================================================

let ENCRYPTION_IV;

if (process.env.ENCRYPTION_IV) {

    if (
        !/^[0-9a-fA-F]{32}$/.test(
            process.env.ENCRYPTION_IV
        )
    ) {

        console.error(
            '❌ FATAL: ENCRYPTION_IV must be exactly 32 hexadecimal characters.'
        );

        process.exit(1);
    }

    ENCRYPTION_IV =
        Buffer.from(
            process.env.ENCRYPTION_IV,
            'hex'
        );

} else {

    ENCRYPTION_IV =
        crypto.randomBytes(16);

    if (isProduction) {

        console.error(
            '❌ FATAL: ENCRYPTION_IV must be configured in production.'
        );

        process.exit(1);
    }
}

// ============================================================
// ⚙️ APPLICATION CONFIG
// ============================================================

const CONFIG = {

    rateLimit: {

        window:
            Number.parseInt(
                process.env.RATE_LIMIT_WINDOW,
                10
            ) || 15,

        max:
            Number.parseInt(
                process.env.RATE_LIMIT_MAX,
                10
            ) || 100
    },

    authRateLimit: {

        window:
            Number.parseInt(
                process.env.AUTH_RATE_LIMIT_WINDOW,
                10
            ) || 15,

        max:
            Number.parseInt(
                process.env.AUTH_RATE_LIMIT_MAX,
                10
            ) || 5
    },

    csrf: {

        expiry:
            Number.parseInt(
                process.env.CSRF_TOKEN_EXPIRY,
                10
            ) || 8
    },

    session: {

        maxAge:
            Number.parseInt(
                process.env.SESSION_MAX_AGE,
                10
            ) || 30
    },

    password: {

        saltRounds:
            Number.parseInt(
                process.env.PASSWORD_SALT_ROUNDS,
                10
            ) || 12
    },

    security: {

        maxLoginAttempts:
            Number.parseInt(
                process.env.MAX_LOGIN_ATTEMPTS,
                10
            ) || 5,

        accountLockTime:
            Number.parseInt(
                process.env.ACCOUNT_LOCK_TIME,
                10
            ) || 30
    },

    token: {

        expiry:
            process.env.TOKEN_EXPIRY ||
            '7d'
    }
};

// ============================================================
// 🔐 ENCRYPTION
// ============================================================
//
// IMPORTANT:
// This preserves compatibility with your current encrypted
// in-memory data.
//
// For MongoDB production storage, migrate to AES-256-GCM
// with a unique IV per record and authentication tag.
// ============================================================

function encrypt(text) {

    try {

        if (
            text === null ||
            text === undefined
        ) {
            return '';
        }

        const cipher =
            crypto.createCipheriv(
                'aes-256-cbc',
                Buffer.from(
                    ENCRYPTION_KEY,
                    'hex'
                ),
                ENCRYPTION_IV
            );

        let encrypted =
            cipher.update(
                String(text),
                'utf8',
                'hex'
            );

        encrypted +=
            cipher.final('hex');

        return encrypted;

    } catch (error) {

        console.error(
            '❌ Encryption error'
        );

        return String(text);
    }
}

function decrypt(text) {

    try {

        if (!text) {
            return '';
        }

        const decipher =
            crypto.createDecipheriv(
                'aes-256-cbc',
                Buffer.from(
                    ENCRYPTION_KEY,
                    'hex'
                ),
                ENCRYPTION_IV
            );

        let decrypted =
            decipher.update(
                text,
                'hex',
                'utf8'
            );

        decrypted +=
            decipher.final('utf8');

        return decrypted;

    } catch (error) {

        console.error(
            '❌ Decryption error'
        );

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

                defaultSrc: [
                    "'self'"
                ],

                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
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
                    'https:'
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

                scriptSrcAttr: [
                    "'unsafe-inline'"
                ],

                upgradeInsecureRequests:
                    isProduction
                        ? []
                        : null
            }
        },

        hsts:
            isProduction
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
            policy:
                'strict-origin-when-cross-origin'
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
    .map(
        origin => origin.trim()
    )
    .filter(Boolean);

app.use(
    cors({

        origin: function (
            origin,
            callback
        ) {

            // Same-origin requests and
            // non-browser requests.
            if (!origin) {
                return callback(
                    null,
                    true
                );
            }

            if (
                allowedOrigins.includes(
                    origin
                )
            ) {

                return callback(
                    null,
                    true
                );
            }

            // Development convenience.
            if (!isProduction) {

                return callback(
                    null,
                    true
                );
            }

            return callback(
                new Error(
                    'Not allowed by CORS'
                )
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

app.use(
    compression()
);

// ============================================================
// 🚦 RATE LIMITING
// ============================================================

const limiter =
    rateLimit({

        windowMs:
            CONFIG.rateLimit.window *
            60 *
            1000,

        max:
            CONFIG.rateLimit.max,

        message: {
            success: false,
            error:
                'Too many requests, please try again later.'
        },

        standardHeaders: true,

        legacyHeaders: false,

        keyGenerator: (req) =>
            req.ip ||
            req.socket.remoteAddress ||
            'unknown'
    });

app.use(
    '/api/',
    limiter
);

// ============================================================
// 🔐 AUTH RATE LIMITER
// ============================================================

const authLimiter =
    rateLimit({

        windowMs:
            CONFIG.authRateLimit.window *
            60 *
            1000,

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
            req.ip ||
            req.socket.remoteAddress ||
            'unknown'
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
// 🧹 INPUT PROTECTION
// ============================================================

app.use(
    xss()
);

app.use(
    hpp()
);

// ============================================================
// 📦 BODY LIMITS
// ============================================================

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

app.use(
    cookieParser()
);

// ============================================================
// 🍪 SESSION
// ============================================================
//
// IMPORTANT:
// MemoryStore is acceptable only for this temporary
// single-instance version.
//
// For real production:
// MongoStore or Redis should be used.
// ============================================================

const sessionConfig = {

    secret:
        SESSION_SECRET,

    resave:
        false,

    saveUninitialized:
        false,

    name:
        '__Secure-marine.sid',

    cookie: {

        secure:
            isProduction,

        httpOnly:
            true,

        sameSite:
            'strict',

        maxAge:
            CONFIG.session.maxAge *
            24 *
            60 *
            60 *
            1000,

        path:
            '/'
    },

    rolling:
        true
};

app.use(
    session(sessionConfig)
);

// ============================================================
// 🆔 REQUEST ID
// ============================================================

app.use(
    (req, res, next) => {

        req.requestId =
            generateRequestId();

        res.setHeader(
            'X-Request-ID',
            req.requestId
        );

        next();
    }
);

// ============================================================
// 📋 SECURITY REQUEST LOGGING
// ============================================================

app.use(
    (req, res, next) => {

        const start =
            Date.now();

        res.on(
            'finish',
            () => {

                const duration =
                    Date.now() -
                    start;

                console.log(
                    `[${new Date().toISOString()}] ` +
                    `${req.method} ` +
                    `${req.path} ` +
                    `${res.statusCode} ` +
                    `${duration}ms ` +
                    `${req.requestId}`
                );
            }
        );

        next();
    }
);

// ============================================================
// 🛡️ CSRF TOKEN INITIALIZATION
// ============================================================

function initializeCsrfToken(req) {

    const now =
        Date.now();

    const expiryMs =
        CONFIG.csrf.expiry *
        60 *
        60 *
        1000;

    if (
        !req.session.csrfToken ||
        !req.session.csrfExpiry ||
        now >
            req.session.csrfExpiry
    ) {

        req.session.csrfToken =
            generateSecureToken();

        req.session.csrfExpiry =
            now +
            expiryMs;
    }
}

app.use(
    (req, res, next) => {

        try {

            initializeCsrfToken(req);

            res.setHeader(
                'X-CSRF-Token',
                req.session.csrfToken
            );

            res.setHeader(
                'X-Session-Expiry',
                String(
                    req.session.csrfExpiry
                )
            );

            next();

        } catch (error) {

            console.error(
                '❌ CSRF initialization error'
            );

            return res.status(500).json({
                success: false,
                error:
                    'Security initialization failed',
                requestId:
                    req.requestId
            });
        }
    }
);

// ============================================================
// 🛡️ CSRF VALIDATION
// ============================================================

function csrfProtection(
    req,
    res,
    next
) {

    // Safe methods do not require CSRF.
    if (
        [
            'GET',
            'HEAD',
            'OPTIONS'
        ].includes(req.method)
    ) {

        return next();
    }

    // Login must remain compatible with
    // the current frontend.
    //
    // The login request obtains its initial CSRF
    // token from /api/csrf-token, but is excluded
    // here because the authenticated session is
    // created during login.
    const skipPaths = [
        '/api/auth/login',
        '/api/csrf-token'
    ];

    if (
        skipPaths.includes(
            req.path
        )
    ) {

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
            error:
                'CSRF token مفقود',
            requestId:
                req.requestId
        });
    }

    if (!sessionToken) {

        return res.status(403).json({
            success: false,
            error:
                'جلسة غير صالحة',
            requestId:
                req.requestId
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
                error:
                    'CSRF token غير صالح',
                requestId:
                    req.requestId
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
                error:
                    'CSRF token غير صالح',
                requestId:
                    req.requestId
            });
        }

        // IMPORTANT:
        // Token is NOT rotated after every request.
        // This prevents race conditions when the
        // frontend sends multiple requests simultaneously.

        next();

    } catch (error) {

        console.error(
            '❌ CSRF validation error'
        );

        return res.status(403).json({
            success: false,
            error:
                'CSRF token غير صالح',
            requestId:
                req.requestId
        });
    }
}

// ============================================================
// 🔐 JWT HELPERS
// ============================================================

function createAccessToken(user) {

    return jwt.sign(

        {
            id:
                user.id,

            username:
                user.username,

            role:
                user.role,

            jti:
                crypto
                    .randomBytes(16)
                    .toString('hex')
        },

        JWT_SECRET,

        {
            expiresIn:
                CONFIG.token.expiry,

            algorithm:
                'HS256'
        }
    );
}

function verifyAccessToken(token) {

    return jwt.verify(
        token,
        JWT_SECRET,
        {
            algorithms: [
                'HS256'
            ]
        }
    );
}

// ============================================================
// 👤 CLIENT IP
// ============================================================

function getClientIP(req) {

    return (
        req.ip ||
        req.socket?.remoteAddress ||
        'unknown'
    );
}

// ============================================================
// 📊 IN-MEMORY DATA
// ============================================================
//
// IMPORTANT:
// This data disappears after Render restart/redeploy.
//
// Replace with MongoDB for persistent production data.
// ============================================================

const users = [
    {
        id:
            crypto
                .randomBytes(16)
                .toString('hex'),

        username:
            ADMIN_USERNAME,

        password:
            bcrypt.hashSync(
                ADMIN_PASSWORD,
                CONFIG.password.saltRounds
            ),

        name:
            encrypt(
                ADMIN_NAME
            ),

        role:
            'admin',

        active:
            true,

        createdAt:
            new Date().toISOString(),

        lastLogin:
            null,

        loginAttempts:
            0,

        locked:
            false,

        lockedUntil:
            null
    }
];

const vessels = [

    {
        id:
            crypto
                .randomBytes(8)
                .toString('hex'),

        name:
            encrypt(
                'الوحدة 101'
            ),

        type:
            encrypt(
                'زورق دورية'
            ),

        status:
            'ready',

        location:
            encrypt(
                'الميناء الرئيسي'
            ),

        lastMaintenance:
            new Date().toISOString(),

        createdAt:
            new Date().toISOString()
    },

    {
        id:
            crypto
                .randomBytes(8)
                .toString('hex'),

        name:
            encrypt(
                'الوحدة 205'
            ),

        type:
            encrypt(
                'قاطرة بحرية'
            ),

        status:
            'maintenance',

        location:
            encrypt(
                'حوض السفن'
            ),

        lastMaintenance:
            new Date().toISOString(),

        createdAt:
            new Date().toISOString()
    },

    {
        id:
            crypto
                .randomBytes(8)
                .toString('hex'),

        name:
            encrypt(
                'الوحدة 312'
            ),

        type:
            encrypt(
                'سفينة إسناد'
            ),

        status:
            'offline',

        location:
            encrypt(
                'الميناء الغربي'
            ),

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
            crypto
                .randomBytes(8)
                .toString('hex'),

        userId:
            userId || null,

        action:

            typeof action === 'string'
                ? action.slice(0, 100)
                : 'UNKNOWN',

        details:

            typeof details === 'string'
                ? details.slice(0, 500)
                : '',

        ip:
            ip || 'unknown',

        timestamp:
            new Date().toISOString()
    });

    if (
        auditLogs.length >
        1000
    ) {

        auditLogs.shift();
    }
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
            !authHeader.startsWith(
                'Bearer '
            )
        ) {

            return res.status(401).json({
                success: false,
                error:
                    'غير مصرح',
                requestId:
                    req.requestId
            });
        }

        const token =
            authHeader
                .slice(7)
                .trim();

        if (!token) {

            return res.status(401).json({
                success: false,
                error:
                    'توكن غير صالح',
                requestId:
                    req.requestId
            });
        }

        const decoded =
            verifyAccessToken(
                token
            );

        if (
            !decoded ||
            !decoded.id ||
            !decoded.username ||
            !decoded.role
        ) {

            return res.status(401).json({
                success: false,
                error:
                    'توكن غير صالح',
                requestId:
                    req.requestId
            });
        }

        const user =
            users.find(
                u =>
                    u.id ===
                    decoded.id
            );

        if (
            !user ||
            !user.active
        ) {

            return res.status(401).json({
                success: false,
                error:
                    'المستخدم غير موجود أو غير نشط',
                requestId:
                    req.requestId
            });
        }

        // Prevent token role tampering.
        if (
            decoded.role !==
            user.role
        ) {

            return res.status(401).json({
                success: false,
                error:
                    'صلاحيات التوكن غير صالحة',
                requestId:
                    req.requestId
            });
        }

        // Session binding.
        if (
            req.session.userId &&
            req.session.userId !==
                user.id
        ) {

            return res.status(401).json({
                success: false,
                error:
                    'جلسة غير صالحة',
                requestId:
                    req.requestId
            });
        }

        req.user =
            user;

        req.auth =
            decoded;

        next();

    } catch (error) {

        if (
            error &&
            error.name ===
                'TokenExpiredError'
        ) {

            return res.status(401).json({
                success: false,
                error:
                    'انتهت صلاحية التوكن',
                requestId:
                    req.requestId
            });
        }

        return res.status(401).json({
            success: false,
            error:
                'توكن غير صالح',
            requestId:
                req.requestId
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
        req.user.role !==
            'admin'
    ) {

        return res.status(403).json({
            success: false,
            error:
                'غير مصرح - صلاحيات المسؤول مطلوبة',
            requestId:
                req.requestId
        });
    }

    next();
}

// ============================================================
// 📁 SAFE STATIC FILES
// ============================================================
//
// DO NOT expose the whole project root with express.static.
// The old configuration could expose server.js/package.json/etc.
//
// Only explicitly public directories are exposed.
// ============================================================

function staticOptions() {

    return {

        dotfiles:
            'deny',

        index:
            false,

        fallthrough:
            true,

        redirect:
            false,

        maxAge:
            isProduction
                ? '1d'
                : 0
    };
}

app.use(
    '/pages',
    express.static(
        path.join(
            __dirname,
            'pages'
        ),
        staticOptions()
    )
);

app.use(
    '/public',
    express.static(
        path.join(
            __dirname,
            'public'
        ),
        staticOptions()
    )
);

app.use(
    '/css',
    express.static(
        path.join(
            __dirname,
            'css'
        ),
        staticOptions()
    )
);

app.use(
    '/js',
    express.static(
        path.join(
            __dirname,
            'js'
        ),
        staticOptions()
    )
);

app.use(
    '/assets',
    express.static(
        path.join(
            __dirname,
            'assets'
        ),
        staticOptions()
    )
);

// ============================================================
// 📄 PAGE FILE HELPER
// ============================================================

function findPageFile(
    pageName
) {

    if (
        typeof pageName !==
        'string'
    ) {

        return null;
    }

    // Strict filename policy.
    if (
        !/^[a-zA-Z0-9_-]+$/.test(
            pageName
        )
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

    for (
        const filePath
        of possiblePaths
    ) {

        try {

            if (
                fs.existsSync(
                    filePath
                )
            ) {

                return filePath;
            }

        } catch (error) {

            return null;
        }
    }

    return null;
}

// ============================================================
// 📄 SERVE PAGE
// ============================================================

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
        `📄 Serving page: ${pageName}`
    );

    res.sendFile(
        filePath,
        {
            headers: {
                'Content-Type':
                    'text/html; charset=utf-8'
            }
        }
    );

    return true;
}

// ============================================================
// ============================================================
// 🔐 API ROUTES
// ============================================================
// IMPORTANT:
// ALL API ROUTES ARE DEFINED BEFORE PAGE ROUTES/FALLBACK.
// ============================================================
// ============================================================

// ============================================================
// 🛡️ CSRF TOKEN
// ============================================================

app.get(
    '/api/csrf-token',
    (req, res) => {

        try {

            initializeCsrfToken(
                req
            );

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
                'Pragma',
                'no-cache'
            );

            res.setHeader(
                'X-CSRF-Token',
                token
            );

            return res.status(200).json({

                success:
                    true,

                token:

                    token,

                expiresIn:
                    Math.max(
                        0,
                        expiry -
                            Date.now()
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
            } =
                req.body || {};

            const clientIP =
                getClientIP(req);

            if (
                typeof username !==
                    'string' ||
                typeof password !==
                    'string' ||
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
            // ACCOUNT LOCK
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
                            ) /
                            60000
                        );

                    return res.status(403).json({
                        success: false,
                        error:
                            `الحساب مقفل. حاول مرة أخرى بعد ${remaining} دقيقة`,
                        requestId:
                            req.requestId
                    });
                }

                user.locked =
                    false;

                user.lockedUntil =
                    null;

                user.loginAttempts =
                    0;
            }

            // ------------------------------------------------
            // PASSWORD CHECK
            // ------------------------------------------------

            const validPassword =
                bcrypt.compareSync(
                    password,
                    user.password
                );

            if (!validPassword) {

                user.loginAttempts =
                    (
                        user.loginAttempts ||
                        0
                    ) + 1;

                if (
                    user.loginAttempts >=
                    CONFIG.security.maxLoginAttempts
                ) {

                    user.locked =
                        true;

                    user.lockedUntil =
                        Date.now() +
                        (
                            CONFIG.security
                                .accountLockTime *
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
            // SUCCESSFUL LOGIN
            // ------------------------------------------------

            user.loginAttempts =
                0;

            user.locked =
                false;

            user.lockedUntil =
                null;

            user.lastLogin =
                new Date().toISOString();

            // ------------------------------------------------
            // SESSION REGENERATION
            // Prevent session fixation.
            // ------------------------------------------------

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
                        createAccessToken(
                            user
                        );

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

                        success:
                            true,

                        token:
                            token,

                        user: {

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

                success:
                    true,

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
            } =
                req.body || {};

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

            // Prevent reusing the same password.
            const samePassword =
                bcrypt.compareSync(
                    newPassword,
                    req.user.password
                );

            if (samePassword) {

                return res.status(400).json({
                    success: false,
                    error:
                        'كلمة المرور الجديدة يجب أن تختلف عن الحالية',
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

            // Invalidate current authenticated
            // session token state by generating
            // a fresh CSRF token.
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

            res.setHeader(
                'X-CSRF-Token',
                req.session.csrfToken
            );

            res.setHeader(
                'X-Session-Expiry',
                String(
                    req.session.csrfExpiry
                )
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
//
// CSRF remains intentionally omitted to preserve compatibility
// with the current frontend logout request.
// ============================================================

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
            } =
                req.body || {};

            if (
                typeof name !==
                    'string' ||
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

            const cleanName =
                name.trim()
                    .slice(0, 150);

            const cleanType =
                typeof type === 'string'
                    ? type
                        .trim()
                        .slice(0, 150)
                    : 'غير محدد';

            const cleanLocation =
                typeof location === 'string'
                    ? location
                        .trim()
                        .slice(0, 250)
                    : '—';

            const now =
                new Date().toISOString();

            const newVessel = {

                id:
                    crypto
                        .randomBytes(8)
                        .toString('hex'),

                name:
                    encrypt(
                        cleanName
                    ),

                type:
                    encrypt(
                        cleanType
                    ),

                status:
                    safeStatus,

                location:
                    encrypt(
                        cleanLocation
                    ),

                lastMaintenance:
                    now,

                createdAt:
                    now
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

                success:
                    true,

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

        try {

            const safeLogs =
                auditLogs
                    .slice(-100)
                    .map(log => ({
                        id:
                            log.id,

                        userId:
                            log.userId,

                        action:
                            log.action,

                        details:
                            log.details,

                        ip:
                            log.ip,

                        timestamp:
                            log.timestamp
                    }));

            return res.status(200).json(
                safeLogs
            );

        } catch (error) {

            console.error(
                '❌ Logs error'
            );

            return res.status(500).json({
                success: false,
                error:
                    'خطأ في قراءة السجلات',
                requestId:
                    req.requestId
            });
        }
    }
);

// ============================================================
// ❤️ SYSTEM STATUS
// ============================================================
//
// Kept public for frontend health checks.
// Does not expose secrets.
// ============================================================

app.get(
    '/api/status',
    (req, res) => {

        res.setHeader(
            'Cache-Control',
            'no-store'
        );

        return res.status(200).json({

            success:
                true,

            status:
                'online',

            version:
                '8.2.0',

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
//
// VERY IMPORTANT:
// No unknown API endpoint can ever receive index.html.
// ============================================================

app.use(
    '/api',
    (req, res) => {

        return res.status(404).json({

            success:
                false,

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

// ============================================================
// 🏠 HOME
// ============================================================

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

            try {

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
                                    'text/html; charset=utf-8',
                                'Cache-Control':
                                    isProduction
                                        ? 'no-cache'
                                        : 'no-store'
                            }
                        }
                    );
                }

            } catch (error) {
                // Continue searching.
            }
        }

        return res.status(404).send(

            '<!DOCTYPE html>' +
            '<html lang="ar" dir="rtl">' +
            '<head>' +
            '<meta charset="UTF-8">' +
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
            '<title>Marine System</title>' +
            '</head>' +
            '<body>' +
            '<h1>❌ index.html غير موجود</h1>' +
            '</body>' +
            '</html>'
        );
    }
);

// ============================================================
// 📄 /pages/:page
// ============================================================

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
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
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

// ============================================================
// 🔗 SHORT PAGE URL
// ============================================================

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
//
// IMPORTANT:
// This is intentionally LAST.
// API has already been handled above.
// ============================================================

app.use(
    (req, res) => {

        // ----------------------------------------------------
        // NEVER return HTML for API.
        // ----------------------------------------------------

        if (
            req.path === '/api' ||
            req.path.startsWith(
                '/api/'
            )
        ) {

            return res.status(404).json({

                success:
                    false,

                error:
                    'API endpoint not found',

                path:
                    req.path,

                requestId:
                    req.requestId
            });
        }

        // ----------------------------------------------------
        // Missing file.
        // ----------------------------------------------------

        if (
            req.path.includes('.')
        ) {

            return res.status(404).send(
                '❌ ملف غير موجود'
            );
        }

        // ----------------------------------------------------
        // SPA fallback.
        // ----------------------------------------------------

        const indexPath =
            path.join(
                __dirname,
                'index.html'
            );

        try {

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

        } catch (error) {
            // Fall through to 404.
        }

        return res.status(404).send(

            '<!DOCTYPE html>' +
            '<html lang="ar" dir="rtl">' +
            '<head>' +
            '<meta charset="UTF-8">' +
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
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
    (
        err,
        req,
        res,
        next
    ) => {

        console.error(
            '❌ Global error:',
            err?.message ||
                'Unknown error'
        );

        if (
            res.headersSent
        ) {

            return next(err);
        }

        const status =
            Number(err?.status);

        const safeStatus =
            status >= 400 &&
            status < 600
                ? status
                : 500;

        // API errors must always be JSON.
        if (
            req.path === '/api' ||
            req.path.startsWith(
                '/api/'
            )
        ) {

            return res
                .status(safeStatus)
                .json({

                    success:
                        false,

                    error:
                        isProduction
                            ? 'حدث خطأ في الخادم'
                            : (
                                  err?.message ||
                                  'Server error'
                              ),

                    requestId:
                        req.requestId
                });
        }

        return res
            .status(safeStatus)
            .send(
                isProduction
                    ? 'حدث خطأ في الخادم'
                    : (
                          err?.message ||
                          'Server error'
                      )
            );
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
                '🚢 MARINE SYSTEM v8.2 HARDENED'
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

            // NEVER log the password.
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
                '🔒 Secure static files: ENABLED'
            );

            console.log(
                '🌐 API routes: BEFORE PAGE FALLBACK'
            );

            console.log(
                '========================================='
            );

            if (isProduction) {

                console.warn(
                    '⚠️ Session store: MemoryStore - temporary only.'
                );

                console.warn(
                    '⚠️ Data store: In-memory - temporary only.'
                );

                console.warn(
                    '⚠️ Production recommendation: MongoDB + persistent session store.'
                );
            }
        }
    );

// ============================================================
// 🛑 GRACEFUL SHUTDOWN
// ============================================================

let shuttingDown = false;

function shutdown(
    signal
) {

    if (shuttingDown) {
        return;
    }

    shuttingDown =
        true;

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
    () =>
        shutdown(
            'SIGTERM'
        )
);

process.on(
    'SIGINT',
    () =>
        shutdown(
            'SIGINT'
        )
);

// ============================================================
// 🚨 UNHANDLED REJECTION
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

// ============================================================
// 🚨 UNCAUGHT EXCEPTION
// ============================================================

process.on(
    'uncaughtException',
    (error) => {

        console.error(
            '❌ Uncaught Exception:',
            error
        );

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

module.exports =
    app;
