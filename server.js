/**
 * ============================================================
 * 🚢 MARINE SYSTEM - SERVER v39.0
 * PRODUCTION HARDENED
 * ============================================================
 *
 * FIXES:
 * ✅ /assets served correctly
 * ✅ /assets/js/index.js no longer receives index.html
 * ✅ /assets/css served correctly
 * ✅ /pages served correctly
 * ✅ HttpOnly Secure SameSite cookie authentication
 * ✅ CSRF protection
 * ✅ Origin / Referer validation
 * ✅ Restricted CORS
 * ✅ JWT tokenVersion validation
 * ✅ Login brute-force protection
 * ✅ Secure logout
 * ✅ Secure uploads
 * ✅ AI keys never exposed to browser
 * ✅ API 404 separated from frontend fallback
 * ✅ Render compatible
 *
 * ============================================================
 */

'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const crypto = require('crypto');

const app = express();

// ============================================================
// CONFIGURATION
// ============================================================

const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

const MONGODB_URI =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    '';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error(
        '❌ JWT_SECRET is missing or shorter than 32 characters'
    );
    process.exit(1);
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
    console.error(
        '❌ ADMIN_PASSWORD must exist and be at least 12 characters'
    );
    process.exit(1);
}

const ADMIN_USERNAME = 'admin';
const ADMIN_EMAIL = 'admin@marine-system.com';
const ADMIN_NAME =
    process.env.ADMIN_NAME || 'مدير النظام';

const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY || '';

const GEMINI_MODEL =
    process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const DEEPSEEK_API_KEY =
    process.env.DEEPSEEK_API_KEY || '';

const DEEPSEEK_MODEL =
    process.env.DEEPSEEK_MODEL || 'deepseek-chat';

const OPENAI_API_KEY =
    process.env.OPENAI_API_KEY || '';

const OPENAI_MODEL =
    process.env.OPENAI_MODEL || 'gpt-4o-mini';

const SESSION_MAX_AGE =
    8 * 60 * 60 * 1000;

const COOKIE_NAME = 'marine_session';
const CSRF_COOKIE_NAME = 'csrf_token';

// ============================================================
// PATHS
// ============================================================

const ROOT_DIR = __dirname;

const PUBLIC_DIR =
    path.join(ROOT_DIR, 'public');

const ASSETS_DIR =
    path.join(ROOT_DIR, 'assets');

const CSS_DIR =
    path.join(ROOT_DIR, 'css');

const JS_DIR =
    path.join(ROOT_DIR, 'js');

const PAGES_DIR =
    path.join(PUBLIC_DIR, 'pages');

const UPLOADS_DIR =
    path.join(ROOT_DIR, 'uploads');

// ============================================================
// ENSURE DIRECTORIES
// ============================================================

[
    PUBLIC_DIR,
    PAGES_DIR,
    UPLOADS_DIR
].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// ============================================================
// TRUST PROXY
// ============================================================

if (IS_PRODUCTION) {
    app.set('trust proxy', 1);
}

// ============================================================
// SECURITY BASICS
// ============================================================

app.disable('x-powered-by');

// ============================================================
// REQUEST LOGGING
// ============================================================

app.use((req, res, next) => {
    const started = Date.now();

    const forwarded =
        req.headers['x-forwarded-for'];

    const ip =
        typeof forwarded === 'string'
            ? forwarded.split(',')[0].trim()
            : req.ip;

    console.log(
        `📡 ${req.method} ${req.originalUrl} | ${ip}`
    );

    res.on('finish', () => {
        const duration =
            Date.now() - started;

        console.log(
            `   ↳ ${res.statusCode} | ${duration}ms`
        );
    });

    next();
});

// ============================================================
// BODY PARSERS
// ============================================================

app.use(express.json({
    limit: '2mb'
}));

app.use(express.urlencoded({
    extended: false,
    limit: '2mb'
}));

app.use(cookieParser());

app.use(compression());

// ============================================================
// CORS
// ============================================================

const allowedOrigins = new Set();

if (process.env.FRONTEND_URL) {
    allowedOrigins.add(
        process.env.FRONTEND_URL.replace(/\/$/, '')
    );
}

if (process.env.RENDER_EXTERNAL_URL) {
    allowedOrigins.add(
        process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '')
    );
}

const corsOptions = {
    origin(origin, callback) {

        // Same-origin / server-to-server
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.has(origin)) {
            return callback(null, true);
        }

        // Allow own Render domain if configured
        if (
            IS_PRODUCTION &&
            process.env.RENDER_EXTERNAL_HOSTNAME &&
            origin ===
                `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
        ) {
            return callback(null, true);
        }

        return callback(
            new Error('CORS origin not allowed')
        );
    },

    credentials: true,

    methods: [
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'OPTIONS'
    ],

    allowedHeaders: [
        'Content-Type',
        'Accept',
        'X-CSRF-Token',
        'Authorization'
    ]
};

app.use(cors(corsOptions));

// ============================================================
// HELMET
// ============================================================

app.use(
    helmet({
        contentSecurityPolicy: false,

        crossOriginEmbedderPolicy: false,

        crossOriginOpenerPolicy: {
            policy: 'same-origin'
        },

        crossOriginResourcePolicy: {
            policy: 'same-origin'
        },

        referrerPolicy: {
            policy: 'strict-origin-when-cross-origin'
        },

        frameguard: {
            action: 'deny'
        },

        hsts: IS_PRODUCTION
            ? {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }
            : false
    })
);

// ============================================================
// EXTRA SECURITY HEADERS
// ============================================================

app.use((req, res, next) => {

    res.setHeader(
        'X-Content-Type-Options',
        'nosniff'
    );

    res.setHeader(
        'X-DNS-Prefetch-Control',
        'off'
    );

    res.setHeader(
        'X-Permitted-Cross-Domain-Policies',
        'none'
    );

    res.setHeader(
        'Permissions-Policy',
        'microphone=(), camera=(), payment=(), usb=()'
    );

    if (IS_PRODUCTION) {
        res.setHeader(
            'Strict-Transport-Security',
            'max-age=31536000; includeSubDomains; preload'
        );
    }

    next();
});

// ============================================================
// RATE LIMITING
// ============================================================

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,

    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        error: 'طلبات كثيرة جداً، حاول لاحقاً'
    }
});

app.use('/api', apiLimiter);

// ============================================================
// LOGIN RATE LIMIT
// ============================================================

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,

    skipSuccessfulRequests: true,

    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        error: 'محاولات تسجيل دخول كثيرة جداً، حاول لاحقاً'
    }
});

// ============================================================
// MULTER
// ============================================================

const storage = multer.diskStorage({

    destination(req, file, cb) {
        cb(null, UPLOADS_DIR);
    },

    filename(req, file, cb) {

        const randomName =
            crypto.randomBytes(24)
                .toString('hex');

        const ext =
            path.extname(file.originalname)
                .toLowerCase();

        cb(
            null,
            `${randomName}${ext}`
        );
    }
});

const allowedMimeTypes = new Set([
    'image/png',
    'image/jpeg',
    'image/webp'
]);

const allowedExtensions = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.webp'
]);

const upload = multer({

    storage,

    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1
    },

    fileFilter(req, file, cb) {

        const ext =
            path.extname(file.originalname)
                .toLowerCase();

        if (
            allowedMimeTypes.has(file.mimetype) &&
            allowedExtensions.has(ext)
        ) {
            return cb(null, true);
        }

        cb(
            new Error(
                'نوع الملف غير مسموح'
            )
        );
    }
});

// ============================================================
// MONGOOSE MODELS
// ============================================================

const UserSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
    },

    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        maxlength: 80
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        maxlength: 160
    },

    password: {
        type: String,
        required: true,
        select: false
    },

    role: {
        type: String,
        enum: [
            'admin',
            'manager',
            'operator',
            'viewer'
        ],
        default: 'viewer'
    },

    isActive: {
        type: Boolean,
        default: true
    },

    isLocked: {
        type: Boolean,
        default: false
    },

    tokenVersion: {
        type: Number,
        default: 0
    },

    lastLogin: Date,

    loginAttempts: {
        type: Number,
        default: 0
    },

    lockUntil: {
        type: Date,
        default: null
    },

    twoFactorSecret: {
        type: String,
        select: false
    },

    twoFactorEnabled: {
        type: Boolean,
        default: false
    },

    twoFactorPending: {
        type: Boolean,
        default: false
    },

    sessionTimeout: {
        type: Number,
        default: 60,
        min: 5,
        max: 480
    },

    permissions: {
        canManageTheme: {
            type: Boolean,
            default: true
        },

        canManageBranding: {
            type: Boolean,
            default: true
        },

        canManageLayout: {
            type: Boolean,
            default: true
        },

        canManageSecurity: {
            type: Boolean,
            default: true
        },

        canManageNotifications: {
            type: Boolean,
            default: true
        },

        canManage2FA: {
            type: Boolean,
            default: true
        },

        canManageSession: {
            type: Boolean,
            default: true
        }
    }

}, {
    timestamps: true
});

UserSchema.pre(
    'save',
    async function(next) {

        if (!this.isModified('password')) {
            return next();
        }

        try {

            const salt =
                await bcrypt.genSalt(12);

            this.password =
                await bcrypt.hash(
                    this.password,
                    salt
                );

            next();

        } catch (error) {
            next(error);
        }
    }
);

UserSchema.methods.comparePassword =
    function(password) {
        return bcrypt.compare(
            password,
            this.password
        );
    };

UserSchema.methods.incrementLoginAttempts =
    async function() {

        this.loginAttempts =
            (this.loginAttempts || 0) + 1;

        if (this.loginAttempts >= 5) {

            this.isLocked = true;

            this.lockUntil =
                new Date(
                    Date.now() +
                    15 * 60 * 1000
                );
        }

        await this.save();
    };

UserSchema.methods.resetLoginAttempts =
    async function() {

        this.loginAttempts = 0;
        this.isLocked = false;
        this.lockUntil = null;

        await this.save();
    };

UserSchema.methods.checkLock =
    function() {

        if (!this.isLocked) {
            return null;
        }

        if (
            this.lockUntil &&
            this.lockUntil > new Date()
        ) {

            return {
                locked: true,

                remainingMinutes:
                    Math.ceil(
                        (
                            this.lockUntil.getTime() -
                            Date.now()
                        ) / 60000
                    )
            };
        }

        return {
            locked: false
        };
    };


// ============================================================
// SETTINGS
// ============================================================

const SettingsSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },

    theme: {
        primary: {
            type: String,
            default: '#0a1628'
        },

        secondary: {
            type: String,
            default: '#1a2a4a'
        },

        gold: {
            type: String,
            default: '#e6b31e'
        }
    },

    layout: {
        darkMode: {
            type: Boolean,
            default: true
        },

        fontSize: {
            type: String,
            enum: [
                'small',
                'medium',
                'large'
            ],
            default: 'medium'
        },

        sidebarPosition: {
            type: String,
            enum: [
                'right',
                'left'
            ],
            default: 'right'
        },

        showStats: {
            type: Boolean,
            default: true
        }
    },

    security: {
        twoFactorAuth: {
            type: Boolean,
            default: false
        },

        emailNotifications: {
            type: Boolean,
            default: true
        },

        smsNotifications: {
            type: Boolean,
            default: false
        },

        sessionTimeout: {
            type: Number,
            default: 60,
            min: 5,
            max: 480
        }
    },

    notifications: {
        emergencyAlerts: {
            type: Boolean,
            default: true
        },

        maintenanceAlerts: {
            type: Boolean,
            default: true
        },

        performanceReports: {
            type: String,
            enum: [
                'daily',
                'weekly',
                'monthly',
                'never'
            ],
            default: 'weekly'
        }
    },

    branding: {
        logoUrl: {
            type: String,
            default: null
        },

        logoName: {
            type: String,
            default: null
        },

        logoSize: {
            type: String,
            enum: [
                'small',
                'medium',
                'large'
            ],
            default: 'medium'
        },

        backgroundUrl: {
            type: String,
            default: null
        }
    }

}, {
    timestamps: true
});


// ============================================================
// VESSEL
// ============================================================

const VesselSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true,
        trim: true
    },

    num: {
        type: String,
        trim: true
    },

    len: {
        type: Number,
        default: 0
    },

    stat: {
        type: String,
        enum: [
            'صالح',
            'معطب',
            'صيانة'
        ],
        default: 'صالح'
    },

    region: {
        type: String,
        trim: true
    },

    zone: {
        type: String,
        trim: true
    },

    port: {
        type: String,
        trim: true
    },

    supp: {
        type: String,
        trim: true
    },

    break: {
        type: String,
        trim: true
    },

    fDate: Date,
    eDate: Date,

    ref: String,
    cat: String,
    repairUnit: String

}, {
    timestamps: true
});


// ============================================================
// MAINTENANCE
// ============================================================

const MaintenanceSchema = new mongoose.Schema({

    vesselId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vessel'
    },

    vesselName: String,

    type: String,

    technician: String,

    description: {
        type: String,
        required: true
    },

    cost: {
        type: Number,
        default: 0
    },

    status: {
        type: String,
        enum: [
            'معلقة',
            'قيد التنفيذ',
            'مكتملة',
            'ملغاة'
        ],
        default: 'معلقة'
    },

    supervisor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }

}, {
    timestamps: true
});


// ============================================================
// TICKET
// ============================================================

const TicketSchema = new mongoose.Schema({

    title: {
        type: String,
        required: true,
        trim: true
    },

    description: {
        type: String,
        required: true
    },

    priority: {
        type: String,
        enum: [
            'low',
            'medium',
            'high',
            'critical'
        ],
        default: 'medium'
    },

    status: {
        type: String,
        enum: [
            'open',
            'in_progress',
            'pending',
            'resolved',
            'closed',
            'rejected'
        ],
        default: 'open'
    },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }

}, {
    timestamps: true
});


// ============================================================
// NOTE
// ============================================================

const NoteSchema = new mongoose.Schema({

    title: {
        type: String,
        required: true,
        trim: true
    },

    content: {
        type: String,
        required: true
    },

    status: {
        type: String,
        enum: [
            'مسودة',
            'منشورة',
            'مؤرشفة'
        ],
        default: 'مسودة'
    },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }

}, {
    timestamps: true
});


// ============================================================
// LOG
// ============================================================

const LogSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    username: String,

    action: String,

    details: String,

    ip: String,

    userAgent: String

}, {
    timestamps: {
        createdAt: true,
        updatedAt: false
    }
});


// ============================================================
// REGISTER MODELS
// ============================================================

const User =
    mongoose.models.User ||
    mongoose.model('User', UserSchema);

const Settings =
    mongoose.models.Settings ||
    mongoose.model('Settings', SettingsSchema);

const Vessel =
    mongoose.models.Vessel ||
    mongoose.model('Vessel', VesselSchema);

const Maintenance =
    mongoose.models.Maintenance ||
    mongoose.model('Maintenance', MaintenanceSchema);

const Ticket =
    mongoose.models.Ticket ||
    mongoose.model('Ticket', TicketSchema);

const Note =
    mongoose.models.Note ||
    mongoose.model('Note', NoteSchema);

const Log =
    mongoose.models.Log ||
    mongoose.model('Log', LogSchema);


// ============================================================
// HELPERS
// ============================================================

function cleanUser(user) {

    if (!user) {
        return null;
    }

    return {
        id: user._id.toString(),
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
    };
}


// ============================================================
// JWT
// ============================================================

function generateToken(user) {

    return jwt.sign(
        {
            sub: user._id.toString(),
            role: user.role,
            tokenVersion:
                user.tokenVersion || 0
        },

        JWT_SECRET,

        {
            expiresIn: '8h',
            issuer: 'marine-system',
            audience: 'marine-system-web'
        }
    );
}

function verifyToken(token) {

    try {

        return jwt.verify(
            token,
            JWT_SECRET,
            {
                issuer: 'marine-system',
                audience: 'marine-system-web'
            }
        );

    } catch {
        return null;
    }
}


// ============================================================
// COOKIE HELPERS
// ============================================================

function setAuthCookie(res, token) {

    res.cookie(
        COOKIE_NAME,
        token,
        {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            path: '/',
            maxAge: SESSION_MAX_AGE
        }
    );
}


function clearAuthCookie(res) {

    res.clearCookie(
        COOKIE_NAME,
        {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            path: '/'
        }
    );
}


function generateCSRFToken() {

    return crypto
        .randomBytes(32)
        .toString('hex');
}


function setCSRFToken(res) {

    const token =
        generateCSRFToken();

    /*
     * CSRF cookie MUST NOT be HttpOnly
     * because frontend reads it.
     */

    res.cookie(
        CSRF_COOKIE_NAME,
        token,
        {
            httpOnly: false,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            path: '/',
            maxAge: SESSION_MAX_AGE
        }
    );

    return token;
}


// ============================================================
// ORIGIN / CSRF
// ============================================================

function validateOrigin(req) {

    const origin =
        req.headers.origin;

    const referer =
        req.headers.referer;

    const host =
        req.get('host');

    if (origin) {

        try {

            const originUrl =
                new URL(origin);

            return (
                originUrl.host === host
            );

        } catch {
            return false;
        }
    }

    if (referer) {

        try {

            const refererUrl =
                new URL(referer);

            return (
                refererUrl.host === host
            );

        } catch {
            return false;
        }
    }

    /*
     * For same-origin browser requests,
     * absence can occur in some environments.
     */

    return !IS_PRODUCTION;
}


function csrfProtection(
    req,
    res,
    next
) {

    const method =
        req.method.toUpperCase();

    if (
        ![
            'POST',
            'PUT',
            'PATCH',
            'DELETE'
        ].includes(method)
    ) {
        return next();
    }

    if (!validateOrigin(req)) {

        return res.status(403).json({
            success: false,
            error: 'Origin غير مصرح به'
        });
    }

    const headerToken =
        req.get('X-CSRF-Token');

    const cookieToken =
        req.cookies[CSRF_COOKIE_NAME];

    if (
        !headerToken ||
        !cookieToken ||
        headerToken.length !==
            cookieToken.length
    ) {

        return res.status(403).json({
            success: false,
            error: 'CSRF token غير صالح'
        });
    }

    try {

        const a =
            Buffer.from(
                headerToken,
                'utf8'
            );

        const b =
            Buffer.from(
                cookieToken,
                'utf8'
            );

        if (
            a.length !== b.length ||
            !crypto.timingSafeEqual(a, b)
        ) {

            return res.status(403).json({
                success: false,
                error: 'CSRF token غير صالح'
            });
        }

    } catch {

        return res.status(403).json({
            success: false,
            error: 'CSRF token غير صالح'
        });
    }

    next();
}


// Apply CSRF to API
app.use('/api', csrfProtection);


// ============================================================
// AUTHENTICATION
// ============================================================

async function authenticate(
    req,
    res,
    next
) {

    try {

        let token =
            req.cookies[COOKIE_NAME];

        /*
         * Temporary compatibility:
         * allow Bearer token for older clients.
         * New frontend should use HttpOnly cookie.
         */

        if (!token) {

            const auth =
                req.headers.authorization;

            if (
                auth &&
                auth.startsWith('Bearer ')
            ) {
                token =
                    auth.substring(7).trim();
            }
        }

        if (!token) {

            return res.status(401).json({
                success: false,
                error: 'غير مصرح'
            });
        }

        const decoded =
            verifyToken(token);

        if (!decoded) {

            return res.status(401).json({
                success: false,
                error: 'انتهت صلاحية الجلسة'
            });
        }

        const userId =
            decoded.sub ||
            decoded.id;

        const user =
            await User.findById(userId);

        if (
            !user ||
            !user.isActive
        ) {

            return res.status(401).json({
                success: false,
                error: 'غير مصرح'
            });
        }

        const lock =
            user.checkLock();

        if (
            lock &&
            lock.locked
        ) {

            return res.status(423).json({
                success: false,
                error:
                    `الحساب مقفل مؤقتاً. حاول بعد ${lock.remainingMinutes} دقيقة`
            });
        }

        if (
            lock &&
            !lock.locked
        ) {

            user.isLocked = false;
            user.lockUntil = null;
            user.loginAttempts = 0;

            await user.save();
        }

        if (
            Number(decoded.tokenVersion) !==
            Number(user.tokenVersion || 0)
        ) {

            clearAuthCookie(res);

            return res.status(401).json({
                success: false,
                error:
                    'انتهت صلاحية الجلسة'
            });
        }

        req.user = user;

        next();

    } catch (error) {

        console.error(
            '❌ Authentication error:',
            error.message
        );

        return res.status(401).json({
            success: false,
            error: 'غير مصرح'
        });
    }
}


// ============================================================
// AUTHORIZATION
// ============================================================

function authorize(...roles) {

    return (req, res, next) => {

        if (
            !req.user ||
            !roles.includes(
                req.user.role
            )
        ) {

            return res.status(403).json({
                success: false,
                error: 'ليس لديك صلاحية'
            });
        }

        next();
    };
}


function checkPermission(permission) {

    return async (
        req,
        res,
        next
    ) => {

        try {

            if (!req.user) {

                return res.status(401).json({
                    success: false,
                    error: 'غير مصرح'
                });
            }

            const user =
                await User.findById(
                    req.user._id
                );

            if (!user) {

                return res.status(401).json({
                    success: false,
                    error: 'المستخدم غير موجود'
                });
            }

            if (
                user.role === 'admin'
            ) {
                return next();
            }

            const permissions =
                user.permissions || {};

            if (
                permissions[permission] !== true
            ) {

                return res.status(403).json({
                    success: false,
                    error:
                        'ليس لديك صلاحية لهذه العملية'
                });
            }

            next();

        } catch (error) {

            console.error(
                'Permission error:',
                error.message
            );

            res.status(500).json({
                success: false,
                error:
                    'خطأ في التحقق من الصلاحيات'
            });
        }
    };
}


// ============================================================
// DATABASE
// ============================================================

async function connectDB() {

    if (!MONGODB_URI) {

        console.error(
            '❌ MONGODB_URI is missing'
        );

        process.exit(1);
    }

    try {

        console.log(
            '🔄 Connecting MongoDB...'
        );

        await mongoose.connect(
            MONGODB_URI,
            {
                serverSelectionTimeoutMS: 10000,
                socketTimeoutMS: 45000,
                maxPoolSize: 10,
                minPoolSize: 2
            }
        );

        console.log(
            '✅ MongoDB Connected'
        );

        console.log(
            `📚 Database: ${mongoose.connection.name}`
        );

        return true;

    } catch (error) {

        console.error(
            '❌ MongoDB error:',
            error.message
        );

        return false;
    }
}


// ============================================================
// ADMIN
// ============================================================

async function createAdmin() {

    const existing =
        await User.findOne({
            $or: [
                {
                    username:
                        ADMIN_USERNAME
                },
                {
                    email:
                        ADMIN_EMAIL
                }
            ]
        }).select('+password');

    if (existing) {

        existing.name =
            ADMIN_NAME;

        existing.email =
            ADMIN_EMAIL;

        existing.role =
            'admin';

        existing.isActive =
            true;

        existing.isLocked =
            false;

        existing.lockUntil =
            null;

        existing.loginAttempts =
            0;

        const matches =
            await bcrypt.compare(
                ADMIN_PASSWORD,
                existing.password
            );

        if (!matches) {

            existing.password =
                ADMIN_PASSWORD;

            existing.tokenVersion =
                (existing.tokenVersion || 0) + 1;

            console.log(
                '🔑 Admin password synchronized'
            );
        }

        existing.permissions = {
            canManageTheme: true,
            canManageBranding: true,
            canManageLayout: true,
            canManageSecurity: true,
            canManageNotifications: true,
            canManage2FA: true,
            canManageSession: true
        };

        await existing.save();

        console.log(
            '✅ Admin updated'
        );

        return;
    }

    const admin =
        new User({
            name: ADMIN_NAME,
            username: ADMIN_USERNAME,
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
            role: 'admin',
            isActive: true,
            tokenVersion: 1
        });

    await admin.save();

    console.log(
        '✅ Admin created'
    );
}


// ============================================================
// SEED
// ============================================================

async function seedVessels() {

    const count =
        await Vessel.countDocuments();

    console.log(
        `🚢 Vessels: ${count}`
    );

    if (count > 0) {
        return;
    }

    const vessels = [

        {
            name: 'البروق 1',
            num: 'B001',
            len: 11,
            region: 'الشمال',
            zone: 'تونس',
            stat: 'صالح',
            cat: 'البروق',
            port: 'تونس',
            repairUnit:
                'وحدة الصيانة والإسناد البحري تونس'
        },

        {
            name: 'صقر 2',
            num: 'S002',
            len: 10,
            region: 'الساحل',
            zone: 'سوسة',
            stat: 'صالح',
            cat: 'صقور',
            port: 'سوسة',
            repairUnit:
                'وحدة الصيانة والإسناد البحري المنستير'
        },

        {
            name: 'خافرة 3',
            num: 'K003',
            len: 20,
            region: 'الوسط',
            zone: 'صفاقس',
            stat: 'معطب',
            cat: 'خوافر',
            port: 'صفاقس',
            break:
                'عطل في المحرك الرئيسي',
            repairUnit:
                'وحدة الصيانة والإسناد البحري صفاقس'
        },

        {
            name: 'طوافة 4',
            num: 'T004',
            len: 35,
            region: 'الجنوب',
            zone: 'جرجيس',
            stat: 'صيانة',
            cat: 'طوافات',
            port: 'جرجيس',
            break:
                'أعطال كهربائية',
            repairUnit:
                'وحدة الصيانة والإسناد البحري جرجيس'
        },

        {
            name: 'زورق سريع 5',
            num: 'Z005',
            len: 15,
            region: 'الشمال',
            zone: 'بنزرت',
            stat: 'صالح',
            cat: 'زوارق مزدوجة',
            port: 'بنزرت',
            supp: 'قاعدة بنزرت',
            repairUnit:
                'وحدة الصيانة والإسناد البحري تونس'
        },

        {
            name: 'البروق 6',
            num: 'B006',
            len: 11,
            region: 'الساحل',
            zone: 'المنستير',
            stat: 'صيانة',
            cat: 'البروق',
            port: 'المنستير',
            break:
                'عطل في نظام الملاحة',
            repairUnit:
                'وحدة الصيانة والإسناد البحري المنستير'
        },

        {
            name: 'صقر 7',
            num: 'S007',
            len: 9,
            region: 'الجنوب',
            zone: 'جربة',
            stat: 'صالح',
            cat: 'صقور',
            port: 'جربة',
            repairUnit:
                'وحدة الصيانة والإسناد البحري جرجيس'
        }
    ];

    await Vessel.insertMany(vessels);

    console.log(
        `✅ Seeded ${vessels.length} vessels`
    );
}


// ============================================================
// HEALTH
// ============================================================

app.get('/health', (req, res) => {

    const db =
        mongoose.connection.readyState;

    res.json({
        status:
            db === 1
                ? 'ok'
                : 'degraded',

        mongodb:
            db === 1
                ? 'connected'
                : 'disconnected',

        timestamp:
            new Date().toISOString(),

        uptime:
            process.uptime()
    });
});


// ============================================================
// CSRF TOKEN
// ============================================================

app.get('/api/auth/csrf', (req, res) => {

    const token =
        setCSRFToken(res);

    res.json({
        success: true,
        csrfToken: token
    });
});


// ============================================================
// LOGIN
// ============================================================

app.post(
    '/api/auth/login',
    loginLimiter,
    async (req, res) => {

        try {

            const username =
                String(
                    req.body.username || ''
                )
                .trim()
                .toLowerCase();

            const password =
                String(
                    req.body.password || ''
                );

            if (
                !username ||
                !password
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'اسم المستخدم وكلمة المرور مطلوبان'
                });
            }

            const user =
                await User.findOne({
                    $or: [
                        {
                            username
                        },
                        {
                            email: username
                        }
                    ]
                })
                .select('+password');

            if (!user) {

                return res.status(401).json({
                    success: false,
                    error:
                        'اسم المستخدم أو كلمة المرور غير صحيحة'
                });
            }

            if (!user.isActive) {

                return res.status(403).json({
                    success: false,
                    error:
                        'الحساب معطل'
                });
            }

            const lock =
                user.checkLock();

            if (
                lock &&
                lock.locked
            ) {

                return res.status(423).json({
                    success: false,
                    error:
                        `الحساب مقفل مؤقتاً. حاول بعد ${lock.remainingMinutes} دقيقة`
                });
            }

            if (
                lock &&
                !lock.locked
            ) {

                user.isLocked = false;
                user.lockUntil = null;
                user.loginAttempts = 0;

                await user.save();
            }

            const valid =
                await user.comparePassword(
                    password
                );

            if (!valid) {

                await user.incrementLoginAttempts();

                return res.status(401).json({
                    success: false,
                    error:
                        'اسم المستخدم أو كلمة المرور غير صحيحة'
                });
            }

            await user.resetLoginAttempts();

            user.lastLogin =
                new Date();

            user.tokenVersion =
                (user.tokenVersion || 0) + 1;

            await user.save();

            const token =
                generateToken(user);

            setAuthCookie(
                res,
                token
            );

            setCSRFToken(res);

            await Log.create({
                userId: user._id,
                username: user.username,
                action: 'تسجيل دخول',
                details: 'تسجيل دخول ناجح',
                ip: req.ip,
                userAgent:
                    req.headers['user-agent']
            });

            /*
             * IMPORTANT:
             * Token is NOT returned.
             * It lives in HttpOnly cookie.
             */

            return res.json({
                success: true,
                user: cleanUser(user)
            });

        } catch (error) {

            console.error(
                'LOGIN ERROR:',
                error.message
            );

            res.status(500).json({
                success: false,
                error:
                    'خطأ داخلي في الخادم'
            });
        }
    }
);


// ============================================================
// LOGOUT
// ============================================================

app.post(
    '/api/auth/logout',
    authenticate,
    async (req, res) => {

        try {

            req.user.tokenVersion =
                (req.user.tokenVersion || 0) + 1;

            await req.user.save();

            await Log.create({
                userId: req.user._id,
                username: req.user.username,
                action: 'تسجيل خروج',
                details: 'تسجيل خروج',
                ip: req.ip,
                userAgent:
                    req.headers['user-agent']
            });

        } catch (error) {

            console.error(
                'Logout logging error:',
                error.message
            );
        }

        clearAuthCookie(res);

        res.clearCookie(
            CSRF_COOKIE_NAME,
            {
                secure: IS_PRODUCTION,
                sameSite: 'strict',
                path: '/'
            }
        );

        res.json({
            success: true,
            message:
                'تم تسجيل الخروج'
        });
    }
);


// ============================================================
// CURRENT USER
// ============================================================

app.get(
    '/api/auth/me',
    authenticate,
    (req, res) => {

        res.json({
            success: true,
            user:
                cleanUser(req.user)
        });
    }
);


// ============================================================
// VERIFY
// ============================================================

app.get(
    '/api/auth/verify',
    authenticate,
    (req, res) => {

        res.json({
            success: true,
            user:
                cleanUser(req.user),
            message:
                'التوكن صالح'
        });
    }
);


// ============================================================
// CHANGE PASSWORD
// ============================================================

app.put(
    '/api/auth/change-password',
    authenticate,
    async (req, res) => {

        try {

            const {
                currentPassword,
                newPassword
            } = req.body;

            if (
                !currentPassword ||
                !newPassword
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'كلمات المرور مطلوبة'
                });
            }

            if (
                newPassword.length < 12
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'كلمة المرور يجب أن تكون 12 حرفاً على الأقل'
                });
            }

            const user =
                await User.findById(
                    req.user._id
                ).select('+password');

            const valid =
                await user.comparePassword(
                    currentPassword
                );

            if (!valid) {

                return res.status(401).json({
                    success: false,
                    error:
                        'كلمة المرور الحالية غير صحيحة'
                });
            }

            user.password =
                newPassword;

            user.tokenVersion =
                (user.tokenVersion || 0) + 1;

            await user.save();

            clearAuthCookie(res);

            res.json({
                success: true,
                message:
                    'تم تغيير كلمة المرور. يرجى تسجيل الدخول مجدداً.'
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    'خطأ في تغيير كلمة المرور'
            });
        }
    }
);


// ============================================================
// USERS
// ============================================================

app.get(
    '/api/users',
    authenticate,
    authorize('admin'),
    async (req, res) => {

        try {

            const users =
                await User.find()
                    .select(
                        '-password -twoFactorSecret'
                    )
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            res.json({
                success: true,
                users
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    'خطأ في تحميل المستخدمين'
            });
        }
    }
);


// ============================================================
// USER PERMISSIONS
// ============================================================

app.get(
    '/api/users/me/permissions',
    authenticate,
    async (req, res) => {

        const user =
            await User.findById(
                req.user._id
            );

        if (!user) {

            return res.status(404).json({
                success: false,
                error:
                    'المستخدم غير موجود'
            });
        }

        res.json({
            success: true,
            permissions:
                user.permissions || {}
        });
    }
);


// ============================================================
// SETTINGS GET
// ============================================================

app.get(
    '/api/settings',
    authenticate,
    async (req, res) => {

        try {

            let settings =
                await Settings.findOne({
                    userId:
                        req.user._id
                });

            if (!settings) {

                settings =
                    await Settings.create({
                        userId:
                            req.user._id
                    });
            }

            res.json({
                success: true,
                settings:
                    settings.toObject()
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    'خطأ في تحميل الإعدادات'
            });
        }
    }
);


// ============================================================
// SETTINGS PUT
// ============================================================

app.put(
    '/api/settings',
    authenticate,
    async (req, res) => {

        try {

            let settings =
                await Settings.findOne({
                    userId:
                        req.user._id
                });

            if (!settings) {

                settings =
                    new Settings({
                        userId:
                            req.user._id
                    });
            }

            const perms =
                req.user.permissions || {};

            const {
                theme,
                layout,
                security,
                notifications,
                branding
            } = req.body;

            if (
                theme &&
                (
                    req.user.role === 'admin' ||
                    perms.canManageTheme !== false
                )
            ) {

                settings.theme = {
                    ...settings.theme?.toObject?.(),
                    ...theme
                };
            }

            if (
                layout &&
                (
                    req.user.role === 'admin' ||
                    perms.canManageLayout !== false
                )
            ) {

                settings.layout = {
                    ...settings.layout?.toObject?.(),
                    ...layout
                };
            }

            if (
                security &&
                (
                    req.user.role === 'admin' ||
                    perms.canManageSecurity !== false
                )
            ) {

                const safeSecurity =
                    { ...security };

                delete safeSecurity.twoFactorAuth;

                settings.security = {
                    ...settings.security?.toObject?.(),
                    ...safeSecurity
                };
            }

            if (
                notifications &&
                (
                    req.user.role === 'admin' ||
                    perms.canManageNotifications !== false
                )
            ) {

                settings.notifications = {
                    ...settings.notifications?.toObject?.(),
                    ...notifications
                };
            }

            if (
                branding &&
                (
                    req.user.role === 'admin' ||
                    perms.canManageBranding !== false
                )
            ) {

                settings.branding = {
                    ...settings.branding?.toObject?.(),
                    ...branding
                };
            }

            await settings.save();

            res.json({
                success: true,
                settings:
                    settings.toObject()
            });

        } catch (error) {

            console.error(
                'Settings error:',
                error.message
            );

            res.status(500).json({
                success: false,
                error:
                    'خطأ في حفظ الإعدادات'
            });
        }
    }
);


// ============================================================
// SETTINGS RESET
// ============================================================

app.post(
    '/api/settings/reset',
    authenticate,
    async (req, res) => {

        try {

            const sections =
                Array.isArray(
                    req.body.sections
                )
                    ? req.body.sections
                    : [];

            let settings =
                await Settings.findOne({
                    userId:
                        req.user._id
                });

            if (!settings) {

                settings =
                    new Settings({
                        userId:
                            req.user._id
                    });
            }

            const defaults = {

                theme: {
                    primary: '#0a1628',
                    secondary: '#1a2a4a',
                    gold: '#e6b31e'
                },

                layout: {
                    darkMode: true,
                    fontSize: 'medium',
                    sidebarPosition: 'right',
                    showStats: true
                },

                security: {
                    twoFactorAuth: false,
                    emailNotifications: true,
                    smsNotifications: false,
                    sessionTimeout: 60
                },

                notifications: {
                    emergencyAlerts: true,
                    maintenanceAlerts: true,
                    performanceReports: 'weekly'
                },

                branding: {
                    logoSize: 'medium'
                }
            };

            const perms =
                req.user.permissions || {};

            if (
                sections.includes('theme') &&
                (
                    req.user.role === 'admin' ||
                    perms.canManageTheme !== false
                )
            ) {
                settings.theme =
                    defaults.theme;
            }

            if (
                sections.includes('layout') &&
                (
                    req.user.role === 'admin' ||
                    perms.canManageLayout !== false
                )
            ) {
                settings.layout =
                    defaults.layout;
            }

            if (
                sections.includes('security') &&
                (
                    req.user.role === 'admin' ||
                    perms.canManageSecurity !== false
                )
            ) {

                settings.security = {
                    ...defaults.security,
                    twoFactorAuth:
                        settings.security
                            ?.twoFactorAuth ||
                        false
                };
            }

            if (
                sections.includes('notifications') &&
                (
                    req.user.role === 'admin' ||
                    perms.canManageNotifications !== false
                )
            ) {
                settings.notifications =
                    defaults.notifications;
            }

            if (
                sections.includes('branding') &&
                (
                    req.user.role === 'admin' ||
                    perms.canManageBranding !== false
                )
            ) {
                settings.branding =
                    defaults.branding;
            }

            await settings.save();

            res.json({
                success: true,
                settings:
                    settings.toObject()
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    'خطأ في إعادة الإعدادات'
            });
        }
    }
);


// ============================================================
// UPLOAD LOGO
// ============================================================

app.post(
    '/api/settings/logo',
    authenticate,
    checkPermission('canManageBranding'),
    upload.single('logo'),
    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    error:
                        'لم يتم تحميل ملف'
                });
            }

            const fileUrl =
                `/uploads/${req.file.filename}`;

            let settings =
                await Settings.findOne({
                    userId:
                        req.user._id
                });

            if (!settings) {

                settings =
                    new Settings({
                        userId:
                            req.user._id
                    });
            }

            settings.branding = {
                ...settings.branding?.toObject?.(),
                logoUrl: fileUrl,
                logoName:
                    req.file.originalname
            };

            await settings.save();

            res.json({
                success: true,
                logoUrl: fileUrl
            });

        } catch (error) {

            if (req.file) {
                try {
                    fs.unlinkSync(
                        req.file.path
                    );
                } catch {}
            }

            res.status(500).json({
                success: false,
                error:
                    'فشل تحميل الشعار'
            });
        }
    }
);


// ============================================================
// DELETE LOGO
// ============================================================

app.delete(
    '/api/settings/logo',
    authenticate,
    checkPermission('canManageBranding'),
    async (req, res) => {

        try {

            const settings =
                await Settings.findOne({
                    userId:
                        req.user._id
                });

            if (
                settings &&
                settings.branding?.logoUrl
            ) {

                const filename =
                    path.basename(
                        settings.branding.logoUrl
                    );

                const file =
                    path.join(
                        UPLOADS_DIR,
                        filename
                    );

                if (
                    file.startsWith(
                        UPLOADS_DIR
                    ) &&
                    fs.existsSync(file)
                ) {
                    fs.unlinkSync(file);
                }

                settings.branding.logoUrl =
                    null;

                settings.branding.logoName =
                    null;

                await settings.save();
            }

            res.json({
                success: true,
                message:
                    'تم حذف الشعار'
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    'فشل حذف الشعار'
            });
        }
    }
);


// ============================================================
// UPLOAD BACKGROUND
// ============================================================

app.post(
    '/api/settings/background',
    authenticate,
    checkPermission('canManageTheme'),
    upload.single('background'),
    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    error:
                        'لم يتم تحميل الملف'
                });
            }

            const fileUrl =
                `/uploads/${req.file.filename}`;

            let settings =
                await Settings.findOne({
                    userId:
                        req.user._id
                });

            if (!settings) {

                settings =
                    new Settings({
                        userId:
                            req.user._id
                    });
            }

            settings.branding = {
                ...settings.branding?.toObject?.(),
                backgroundUrl:
                    fileUrl
            };

            await settings.save();

            res.json({
                success: true,
                backgroundUrl:
                    fileUrl
            });

        } catch (error) {

            if (req.file) {
                try {
                    fs.unlinkSync(
                        req.file.path
                    );
                } catch {}
            }

            res.status(500).json({
                success: false,
                error:
                    'فشل تحميل الخلفية'
            });
        }
    }
);


// ============================================================
// SESSION TIMEOUT
// ============================================================

app.post(
    '/api/auth/session-timeout',
    authenticate,
    checkPermission('canManageSession'),
    async (req, res) => {

        const timeout =
            Number(req.body.timeout);

        if (
            !Number.isInteger(timeout) ||
            timeout < 5 ||
            timeout > 480
        ) {

            return res.status(400).json({
                success: false,
                error:
                    'المدة يجب أن تكون بين 5 و480 دقيقة'
            });
        }

        req.user.sessionTimeout =
            timeout;

        await req.user.save();

        res.json({
            success: true,
            timeout
        });
    }
);


// ============================================================
// VESSELS
// ============================================================

app.get(
    '/api/vessels',
    authenticate,
    async (req, res) => {

        try {

            const vessels =
                await Vessel.find()
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            res.json(vessels);

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    'خطأ في تحميل المراكب'
            });
        }
    }
);


app.post(
    '/api/vessels',
    authenticate,
    authorize(
        'admin',
        'manager'
    ),
    async (req, res) => {

        try {

            const vessel =
                new Vessel(req.body);

            await vessel.save();

            res.status(201).json(
                vessel
            );

        } catch (error) {

            res.status(400).json({
                success: false,
                error:
                    'بيانات المركب غير صحيحة'
            });
        }
    }
);


app.put(
    '/api/vessels/:id',
    authenticate,
    authorize(
        'admin',
        'manager'
    ),
    async (req, res) => {

        try {

            if (
                !mongoose.Types.ObjectId
                    .isValid(req.params.id)
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'معرف المركب غير صالح'
                });
            }

            const vessel =
                await Vessel.findByIdAndUpdate(
                    req.params.id,
                    req.body,
                    {
                        new: true,
                        runValidators: true
                    }
                );

            if (!vessel) {

                return res.status(404).json({
                    success: false,
                    error:
                        'المركب غير موجود'
                });
            }

            res.json(vessel);

        } catch (error) {

            res.status(400).json({
                success: false,
                error:
                    'فشل تحديث المركب'
            });
        }
    }
);


app.delete(
    '/api/vessels/:id',
    authenticate,
    authorize('admin'),
    async (req, res) => {

        try {

            if (
                !mongoose.Types.ObjectId
                    .isValid(req.params.id)
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'معرف غير صالح'
                });
            }

            const vessel =
                await Vessel.findByIdAndDelete(
                    req.params.id
                );

            if (!vessel) {

                return res.status(404).json({
                    success: false,
                    error:
                        'المركب غير موجود'
                });
            }

            res.json({
                success: true,
                message:
                    'تم حذف المركب'
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    'فشل حذف المركب'
            });
        }
    }
);


// ============================================================
// MAINTENANCE
// ============================================================

app.get(
    '/api/maintenance',
    authenticate,
    async (req, res) => {

        const records =
            await Maintenance.find()
                .sort({
                    createdAt: -1
                })
                .lean();

        res.json({
            success: true,
            maintenance:
                records
        });
    }
);


app.post(
    '/api/maintenance',
    authenticate,
    authorize(
        'admin',
        'manager'
    ),
    async (req, res) => {

        try {

            const record =
                new Maintenance({
                    ...req.body,
                    supervisor:
                        req.user._id
                });

            await record.save();

            res.status(201).json({
                success: true,
                maintenance:
                    record
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error:
                    'بيانات الصيانة غير صحيحة'
            });
        }
    }
);


// ============================================================
// TICKETS
// ============================================================

app.get(
    '/api/tickets',
    authenticate,
    async (req, res) => {

        const tickets =
            await Ticket.find()
                .sort({
                    createdAt: -1
                })
                .lean();

        res.json({
            success: true,
            tickets
        });
    }
);


app.post(
    '/api/tickets',
    authenticate,
    async (req, res) => {

        try {

            const ticket =
                new Ticket({
                    ...req.body,
                    createdBy:
                        req.user._id
                });

            await ticket.save();

            res.status(201).json({
                success: true,
                ticket
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error:
                    'بيانات التذكرة غير صحيحة'
            });
        }
    }
);


// ============================================================
// NOTES
// ============================================================

app.get(
    '/api/notes',
    authenticate,
    async (req, res) => {

        const notes =
            await Note.find()
                .sort({
                    createdAt: -1
                })
                .lean();

        res.json({
            success: true,
            notes
        });
    }
);


app.post(
    '/api/notes',
    authenticate,
    async (req, res) => {

        try {

            const note =
                new Note({
                    ...req.body,
                    createdBy:
                        req.user._id
                });

            await note.save();

            res.status(201).json({
                success: true,
                note
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error:
                    'بيانات المذكرة غير صحيحة'
            });
        }
    }
);


// ============================================================
// DASHBOARD
// ============================================================

app.get(
    '/api/dashboard',
    authenticate,
    async (req, res) => {

        try {

            const [
                totalVessels,
                validVessels,
                damagedVessels,
                maintenanceVessels,
                totalUsers,
                totalTickets
            ] =
                await Promise.all([

                    Vessel.countDocuments(),

                    Vessel.countDocuments({
                        stat: 'صالح'
                    }),

                    Vessel.countDocuments({
                        stat: 'معطب'
                    }),

                    Vessel.countDocuments({
                        stat: 'صيانة'
                    }),

                    User.countDocuments(),

                    Ticket.countDocuments()
                ]);

            res.json({
                success: true,

                data: {

                    vessels: {
                        total:
                            totalVessels,

                        valid:
                            validVessels,

                        damaged:
                            damagedVessels,

                        maintenance:
                            maintenanceVessels
                    },

                    users:
                        totalUsers,

                    tickets:
                        totalTickets
                }
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    'فشل تحميل لوحة التحكم'
            });
        }
    }
);


// ============================================================
// LOGS
// ============================================================

app.get(
    '/api/logs',
    authenticate,
    authorize('admin'),
    async (req, res) => {

        try {

            let limit =
                Number(req.query.limit || 100);

            let skip =
                Number(req.query.skip || 0);

            limit =
                Math.min(
                    Math.max(limit, 1),
                    500
                );

            skip =
                Math.max(skip, 0);

            const query = {};

            if (req.query.username) {
                query.username =
                    String(
                        req.query.username
                    ).slice(0, 80);
            }

            if (req.query.startDate) {

                const start =
                    new Date(
                        req.query.startDate
                    );

                if (!isNaN(start)) {

                    query.createdAt = {
                        $gte: start
                    };
                }
            }

            if (req.query.endDate) {

                const end =
                    new Date(
                        req.query.endDate
                    );

                if (!isNaN(end)) {

                    end.setHours(
                        23,
                        59,
                        59,
                        999
                    );

                    query.createdAt = {
                        ...(query.createdAt || {}),
                        $lte: end
                    };
                }
            }

            const logs =
                await Log.find(query)
                    .sort({
                        createdAt: -1
                    })
                    .skip(skip)
                    .limit(limit)
                    .lean();

            const total =
                await Log.countDocuments(
                    query
                );

            res.json({
                success: true,
                logs,
                pagination: {
                    total,
                    limit,
                    skip,
                    hasMore:
                        skip +
                        logs.length <
                        total
                }
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    'فشل تحميل السجلات'
            });
        }
    }
);


// ============================================================
// SESSIONS
// ============================================================

app.get(
    '/api/sessions',
    authenticate,
    authorize('admin'),
    async (req, res) => {

        try {

            const users =
                await User.find()
                    .select(
                        'name username email role isActive lastLogin createdAt'
                    )
                    .lean();

            const logs =
                await Log.find()
                    .sort({
                        createdAt: -1
                    })
                    .limit(500)
                    .lean();

            const sessions =
                users.map(
                    (user, index) => {

                        const userLogs =
                            logs.filter(
                                log =>
                                    log.username ===
                                    user.username
                            );

                        const last =
                            userLogs[0];

                        return {

                            id:
                                `user-session-${user._id}`,

                            userId:
                                user._id,

                            username:
                                user.username,

                            userName:
                                user.name,

                            role:
                                user.role,

                            status:
                                user.isActive
                                    ? 'active'
                                    : 'inactive',

                            ip:
                                last?.ip ||
                                'غير متوفر',

                            device:
                                last?.userAgent ||
                                'غير متوفر',

                            createdAt:
                                user.createdAt,

                            updatedAt:
                                last?.createdAt ||
                                user.lastLogin ||
                                user.createdAt,

                            lastActivity:
                                last?.createdAt ||
                                user.lastLogin ||
                                user.createdAt
                        };
                    }
                );

            res.json({
                success: true,
                sessions,
                total:
                    sessions.length,

                active:
                    sessions.filter(
                        s =>
                            s.status ===
                            'active'
                    ).length
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    'فشل تحميل الجلسات'
            });
        }
    }
);


// ============================================================
// AI CONFIG
// NEVER SEND API KEYS TO CLIENT
// ============================================================

app.get(
    '/api/config',
    authenticate,
    (req, res) => {

        res.json({
            success: true,

            GEMINI_ENABLED:
                Boolean(
                    GEMINI_API_KEY
                ),

            GEMINI_MODEL,

            DEEPSEEK_ENABLED:
                Boolean(
                    DEEPSEEK_API_KEY
                ),

            DEEPSEEK_MODEL,

            OPENAI_ENABLED:
                Boolean(
                    OPENAI_API_KEY
                ),

            OPENAI_MODEL
        });
    }
);


// ============================================================
// CHECK GEMINI
// ============================================================

app.get(
    '/api/check-gemini',
    authenticate,
    authorize('admin'),
    async (req, res) => {

        if (!GEMINI_API_KEY) {

            return res.json({
                success: false,
                error:
                    'GEMINI_API_KEY غير موجود'
            });
        }

        try {

            const {
                GoogleGenerativeAI
            } =
                require(
                    '@google/generative-ai'
                );

            const genAI =
                new GoogleGenerativeAI(
                    GEMINI_API_KEY
                );

            const model =
                genAI.getGenerativeModel({
                    model:
                        GEMINI_MODEL
                });

            const result =
                await model.generateContent(
                    'اختبار اتصال مختصر'
                );

            res.json({
                success: true,
                message:
                    'Gemini يعمل بنجاح',
                model:
                    GEMINI_MODEL
            });

        } catch (error) {

            res.json({
                success: false,
                error:
                    'فشل اتصال Gemini'
            });
        }
    }
);


// ============================================================
// AI ASK
// ============================================================

app.post(
    '/api/ai/ask',
    authenticate,
    async (req, res) => {

        try {

            const message =
                String(
                    req.body.message || ''
                )
                .trim();

            if (
                !message ||
                message.length > 5000
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'الرسالة غير صالحة'
                });
            }

            const vessels =
                await Vessel.find()
                    .lean();

            const maintenance =
                await Maintenance.find()
                    .lean();

            const total =
                vessels.length;

            const valid =
                vessels.filter(
                    v =>
                        v.stat ===
                        'صالح'
                ).length;

            const damaged =
                vessels.filter(
                    v =>
                        v.stat ===
                        'معطب'
                ).length;

            const underMaintenance =
                vessels.filter(
                    v =>
                        v.stat ===
                        'صيانة'
                ).length;

            const efficiency =
                total
                    ? Math.round(
                        valid /
                        total *
                        100
                    )
                    : 0;

            const context = `
بيانات الأسطول:
إجمالي المراكب: ${total}
الصالح: ${valid}
المعطوب: ${damaged}
تحت الصيانة: ${underMaintenance}
نسبة الجاهزية: ${efficiency}%
مهام الصيانة: ${maintenance.length}
`;

            let reply = '';
            let modelUsed = '';

            // ------------------------------------------------
            // GEMINI
            // ------------------------------------------------

            if (GEMINI_API_KEY) {

                try {

                    const {
                        GoogleGenerativeAI
                    } =
                        require(
                            '@google/generative-ai'
                        );

                    const genAI =
                        new GoogleGenerativeAI(
                            GEMINI_API_KEY
                        );

                    const model =
                        genAI.getGenerativeModel({
                            model:
                                GEMINI_MODEL,

                            generationConfig: {
                                maxOutputTokens:
                                    1500,

                                temperature:
                                    0.4
                            }
                        });

                    const result =
                        await model.generateContent(
                            `${message}\n\n${context}`
                        );

                    reply =
                        result.response.text();

                    modelUsed =
                        `Gemini (${GEMINI_MODEL})`;

                } catch (error) {

                    console.warn(
                        'Gemini failed:',
                        error.message
                    );
                }
            }

            // ------------------------------------------------
            // DEEPSEEK
            // ------------------------------------------------

            if (
                !reply &&
                DEEPSEEK_API_KEY
            ) {

                try {

                    const response =
                        await fetch(
                            'https://api.deepseek.com/v1/chat/completions',
                            {
                                method:
                                    'POST',

                                headers: {
                                    'Content-Type':
                                        'application/json',

                                    Authorization:
                                        `Bearer ${DEEPSEEK_API_KEY}`
                                },

                                body:
                                    JSON.stringify({
                                        model:
                                            DEEPSEEK_MODEL,

                                        messages: [
                                            {
                                                role:
                                                    'system',

                                                content:
                                                    'أنت مساعد متخصص في إدارة الأسطول البحري.'
                                            },

                                            {
                                                role:
                                                    'user',

                                                content:
                                                    `${message}\n\n${context}`
                                            }
                                        ],

                                        max_tokens:
                                            1500,

                                        temperature:
                                            0.4
                                    })
                            }
                        );

                    if (
                        response.ok
                    ) {

                        const data =
                            await response.json();

                        reply =
                            data.choices?.[0]
                                ?.message
                                ?.content ||
                            '';

                        modelUsed =
                            `DeepSeek (${DEEPSEEK_MODEL})`;
                    }

                } catch (error) {

                    console.warn(
                        'DeepSeek failed'
                    );
                }
            }

            // ------------------------------------------------
            // LOCAL FALLBACK
            // ------------------------------------------------

            if (!reply) {

                const msg =
                    message.toLowerCase();

                if (
                    msg.includes('الجاهزية')
                ) {

                    reply =
                        `📈 نسبة الجاهزية: ${efficiency}%`;
                }

                else if (
                    msg.includes('معطب')
                ) {

                    reply =
                        `⚠️ المراكب المعطوبة: ${damaged}`;
                }

                else if (
                    msg.includes('صيانة')
                ) {

                    reply =
                        `🔧 تحت الصيانة: ${underMaintenance}\nمهام الصيانة: ${maintenance.length}`;
                }

                else {

                    reply =
                        `📊 إجمالي المراكب: ${total}\n📈 الجاهزية: ${efficiency}%\n⚠️ المعطوب: ${damaged}\n🔧 الصيانة: ${underMaintenance}`;
                }

                modelUsed =
                    'Local';
            }

            res.json({
                success: true,
                response: reply,
                model: modelUsed
            });

        } catch (error) {

            console.error(
                'AI error:',
                error.message
            );

            res.status(500).json({
                success: false,
                error:
                    'فشل تشغيل المساعد الذكي'
            });
        }
    }
);


// ============================================================
// PAGES API
// ============================================================

const safePageName =
    /^[a-zA-Z0-9_-]+$/;

app.get(
    '/api/pages/:page',
    authenticate,
    async (req, res) => {

        const page =
            req.params.page;

        if (
            !safePageName.test(page)
        ) {

            return res.status(400).json({
                success: false,
                error:
                    'اسم الصفحة غير صالح'
            });
        }

        const file =
            path.join(
                PAGES_DIR,
                `${page}.html`
            );

        if (
            !file.startsWith(
                PAGES_DIR
            )
        ) {

            return res.status(400).json({
                success: false,
                error:
                    'مسار غير صالح'
            });
        }

        if (!fs.existsSync(file)) {

            return res.status(404).json({
                success: false,
                error:
                    'الصفحة غير موجودة'
            });
        }

        try {

            const html =
                fs.readFileSync(
                    file,
                    'utf8'
                );

            res.json({
                success: true,
                html
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    'فشل قراءة الصفحة'
            });
        }
    }
);


// ============================================================
// STATIC FILES
// ============================================================

/*
 * IMPORTANT:
 *
 * Your project currently has:
 *
 * assets/js/index.js
 *
 * NOT:
 *
 * public/assets/js/index.js
 *
 * Therefore /assets must point to ROOT/assets.
 */

// ------------------------------------------------------------
// /assets
// ------------------------------------------------------------

if (
    fs.existsSync(ASSETS_DIR)
) {

    app.use(
        '/assets',
        express.static(
            ASSETS_DIR,
            {
                index: false,
                dotfiles: 'deny',
                fallthrough: false,
                etag: true,
                maxAge:
                    IS_PRODUCTION
                        ? '1h'
                        : 0
            }
        )
    );

    console.log(
        '✅ Mounted /assets -> /assets'
    );
}


// ------------------------------------------------------------
// /assets/css
// ------------------------------------------------------------

if (
    fs.existsSync(CSS_DIR)
) {

    app.use(
        '/assets/css',
        express.static(
            CSS_DIR,
            {
                index: false,
                dotfiles: 'deny',
                fallthrough: false,
                etag: true,
                maxAge:
                    IS_PRODUCTION
                        ? '1h'
                        : 0
            }
        )
    );

    console.log(
        '✅ Mounted /assets/css -> /css'
    );
}


// ------------------------------------------------------------
// /assets/root-js
// ------------------------------------------------------------

if (
    fs.existsSync(JS_DIR)
) {

    app.use(
        '/assets/root-js',
        express.static(
            JS_DIR,
            {
                index: false,
                dotfiles: 'deny',
                fallthrough: false,
                etag: true
            }
        )
    );
}


// ------------------------------------------------------------
// /pages
// ------------------------------------------------------------

app.use(
    '/pages',
    express.static(
        PAGES_DIR,
        {
            index: false,
            dotfiles: 'deny',
            fallthrough: false,
            etag: true,
            maxAge: 0
        }
    )
);


// ------------------------------------------------------------
// /uploads
// ------------------------------------------------------------

app.use(
    '/uploads',
    express.static(
        UPLOADS_DIR,
        {
            index: false,
            dotfiles: 'deny',
            fallthrough: false,
            etag: true
        }
    )
);


// ============================================================
// ROOT
// ============================================================

app.get(
    '/',
    (req, res) => {

        const index =
            path.join(
                PUBLIC_DIR,
                'index.html'
            );

        if (!fs.existsSync(index)) {

            return res.status(500).send(
                'index.html غير موجود'
            );
        }

        res.sendFile(index);
    }
);


// ============================================================
// AI ASSISTANT DIRECT ROUTE
// ============================================================

app.get(
    '/ai-assistant',
    (req, res) => {

        const file =
            path.join(
                PAGES_DIR,
                'ai-assistant.html'
            );

        if (
            !fs.existsSync(file)
        ) {

            return res.status(404).send(
                'Page not found'
            );
        }

        res.sendFile(file);
    }
);


// ============================================================
// API 404
// ============================================================

app.use(
    '/api',
    (req, res) => {

        console.warn(
            `❌ API 404: ${req.method} ${req.originalUrl}`
        );

        res.status(404).json({
            success: false,
            error:
                'API endpoint not found'
        });
    }
);


// ============================================================
// STATIC RESOURCE 404
// ============================================================

app.use(
    (req, res, next) => {

        /*
         * NEVER return index.html for missing
         * JS/CSS/fonts/images/pages.
         */

        if (
            req.path.startsWith('/assets/') ||
            req.path.startsWith('/pages/') ||
            req.path.startsWith('/uploads/')
        ) {

            return res.status(404).send(
                'Resource not found'
            );
        }

        next();
    }
);


// ============================================================
// FRONTEND FALLBACK
// ============================================================

app.use(
    (req, res) => {

        if (
            req.method !== 'GET'
        ) {

            return res.status(404).json({
                success: false,
                error:
                    'Not found'
            });
        }

        const index =
            path.join(
                PUBLIC_DIR,
                'index.html'
            );

        if (
            !fs.existsSync(index)
        ) {

            return res.status(500).send(
                'Frontend unavailable'
            );
        }

        res.sendFile(index);
    }
);


// ============================================================
// ERROR HANDLER
// ============================================================

app.use(
    (err, req, res, next) => {

        console.error(
            '❌ SERVER ERROR:',
            err.message
        );

        if (
            res.headersSent
        ) {
            return next(err);
        }

        if (
            err.message ===
            'CORS origin not allowed'
        ) {

            return res.status(403).json({
                success: false,
                error:
                    'CORS forbidden'
            });
        }

        if (
            err instanceof
            multer.MulterError
        ) {

            return res.status(400).json({
                success: false,
                error:
                    'خطأ في تحميل الملف'
            });
        }

        res.status(500).json({
            success: false,
            error:
                'Internal server error'
        });
    }
);


// ============================================================
// START
// ============================================================

async function startServer() {

    const connected =
        await connectDB();

    if (!connected) {

        console.error(
            '❌ Server cannot start without MongoDB'
        );

        process.exit(1);
    }

    await createAdmin();

    await seedVessels();

    const server =
        app.listen(
            PORT,
            '0.0.0.0',
            () => {

                console.log('');
                console.log(
                    '============================================================'
                );

                console.log(
                    '🚢 MARINE SYSTEM v39.0'
                );

                console.log(
                    '🚀 SERVER STARTED'
                );

                console.log(
                    `🌍 Environment: ${NODE_ENV}`
                );

                console.log(
                    `🚀 Port: ${PORT}`
                );

                console.log(
                    '🗄️ MongoDB: Connected ✅'
                );

                console.log(
                    '🔐 HttpOnly Authentication: Enabled ✅'
                );

                console.log(
                    '🛡️ CSRF Protection: Enabled ✅'
                );

                console.log(
                    '🌐 Static Assets: Enabled ✅'
                );

                console.log(
                    '📁 /assets -> /assets'
                );

                console.log(
                    '📁 /assets/css -> /css'
                );

                console.log(
                    '📁 /pages -> /public/pages'
                );

                console.log(
                    '📁 /uploads -> /uploads'
                );

                console.log(
                    '============================================================'
                );

                console.log('');
            }
        );


    // --------------------------------------------------------
    // GRACEFUL SHUTDOWN
    // --------------------------------------------------------

    const shutdown =
        signal => {

            console.log(
                `🛑 ${signal} received`
            );

            server.close(
                async () => {

                    try {

                        await mongoose.connection.close();

                        console.log(
                            '✅ MongoDB connection closed'
                        );

                    } catch (error) {

                        console.error(
                            error.message
                        );
                    }

                    process.exit(0);
                }
            );
        };


    process.on(
        'SIGTERM',
        () => shutdown('SIGTERM')
    );

    process.on(
        'SIGINT',
        () => shutdown('SIGINT')
    );
}


startServer();

module.exports = app;
