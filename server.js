/**
 * ============================================================
 * 🚢 MARINE SYSTEM - SERVER v22.0
 * HARDENED / RENDER / MONGODB ATLAS
 * ============================================================
 *
 * ✅ Auto Admin
 * ✅ MongoDB Atlas
 * ✅ Secure Login
 * ✅ Account Lockout
 * ✅ JWT Access Cookie
 * ✅ Refresh Token Cookie
 * ✅ Session Management
 * ✅ CSRF Protection
 * ✅ Rate Limiting
 * ✅ CORS
 * ✅ Helmet
 * ✅ Audit Log
 * ✅ RBAC
 * ✅ Vessels API
 * ✅ Users API
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
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const app = express();

/* ============================================================
   CONFIG
   ============================================================ */

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

const PORT = Number(process.env.PORT || 5000);

const MONGODB_URI = process.env.MONGODB_URI;

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

const ADMIN_USERNAME =
    process.env.ADMIN_USERNAME || 'admin';

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD;

const ADMIN_EMAIL =
    process.env.ADMIN_EMAIL || 'admin@marine-system.local';

const ADMIN_NAME =
    process.env.ADMIN_NAME || 'مدير النظام';

const ACCESS_TOKEN_EXPIRES = '15m';

const REFRESH_TOKEN_DAYS = 7;

const LOCK_MINUTES = 15;

const MAX_LOGIN_ATTEMPTS = 5;

/* ============================================================
   PRODUCTION VALIDATION
   ============================================================ */

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is required');
    process.exit(1);
}

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error(
        '❌ JWT_SECRET is required and must contain at least 32 characters'
    );
    process.exit(1);
}

if (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET.length < 32) {
    console.error(
        '❌ JWT_REFRESH_SECRET is required and must contain at least 32 characters'
    );
    process.exit(1);
}

if (IS_PRODUCTION && (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12)) {
    console.error(
        '❌ ADMIN_PASSWORD is required in production and must contain at least 12 characters'
    );
    process.exit(1);
}

/* ============================================================
   CORS
   ============================================================ */

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS
        .split(',')
        .map(x => x.trim())
        .filter(Boolean)
    : [];

function corsOrigin(origin, callback) {

    if (!origin) {
        return callback(null, true);
    }

    if (!IS_PRODUCTION) {
        return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
        return callback(null, true);
    }

    return callback(
        new Error('CORS origin not allowed')
    );
}

/* ============================================================
   LOG
   ============================================================ */

console.log('');
console.log('='.repeat(65));
console.log('🚢 MARINE SYSTEM v22.0');
console.log('='.repeat(65));
console.log(`Environment: ${NODE_ENV}`);
console.log(`Port: ${PORT}`);
console.log(`Admin: ${ADMIN_USERNAME}`);
console.log(`MongoDB: configured`);
console.log('='.repeat(65));
console.log('');

/* ============================================================
   MONGODB
   ============================================================ */

mongoose.set('strictQuery', true);

mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    minPoolSize: 2,
    family: 4
})
.then(() => {
    console.log('✅ MongoDB Connected');
})
.catch(error => {
    console.error(
        '❌ MongoDB connection error:',
        error.message
    );
    process.exit(1);
});

/* ============================================================
   MODELS
   ============================================================ */

/* ---------------- USER ---------------- */

const UserSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },

    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        maxlength: 100
    },

    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        maxlength: 254
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

    loginAttempts: {
        type: Number,
        default: 0
    },

    lockUntil: {
        type: Date,
        default: null
    },

    lastLogin: {
        type: Date,
        default: null
    },

    createdAt: {
        type: Date,
        default: Date.now
    },

    updatedAt: {
        type: Date,
        default: Date.now
    }

}, {
    timestamps: false
});

UserSchema.index(
    { username: 1 },
    { unique: true }
);

UserSchema.index(
    { email: 1 },
    { unique: true }
);

UserSchema.pre(
    'save',
    async function(next) {

        this.updatedAt = new Date();

        if (!this.isModified('password')) {
            return next();
        }

        try {

            this.password =
                await bcrypt.hash(
                    this.password,
                    12
                );

            next();

        } catch (error) {
            next(error);
        }
    }
);

UserSchema.methods.comparePassword =
    function(candidatePassword) {

        return bcrypt.compare(
            candidatePassword,
            this.password
        );
    };

/* ---------------- SESSION ---------------- */

const SessionSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    refreshTokenHash: {
        type: String,
        required: true,
        unique: true
    },

    jti: {
        type: String,
        required: true,
        unique: true
    },

    ip: String,

    userAgent: String,

    expiresAt: {
        type: Date,
        required: true,
        index: true
    },

    isRevoked: {
        type: Boolean,
        default: false
    },

    createdAt: {
        type: Date,
        default: Date.now
    },

    lastUsedAt: {
        type: Date,
        default: Date.now
    }

});

/* ---------------- VESSEL ---------------- */

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

    ref: {
        type: String,
        trim: true
    },

    cat: {
        type: String,
        trim: true
    },

    repairUnit: {
        type: String,
        trim: true
    },

    createdAt: {
        type: Date,
        default: Date.now
    },

    updatedAt: {
        type: Date,
        default: Date.now
    }

});

VesselSchema.index({
    name: 1
});

/* ---------------- AUDIT ---------------- */

const AuditLogSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    username: String,

    action: {
        type: String,
        required: true
    },

    resource: String,

    resourceId: String,

    details: mongoose.Schema.Types.Mixed,

    ip: String,

    userAgent: String,

    status: {
        type: String,
        enum: [
            'success',
            'failure'
        ],
        default: 'success'
    },

    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }

});

/* ---------------- MODELS ---------------- */

const User =
    mongoose.model('User', UserSchema);

const Session =
    mongoose.model('Session', SessionSchema);

const Vessel =
    mongoose.model('Vessel', VesselSchema);

const AuditLog =
    mongoose.model('AuditLog', AuditLogSchema);

/* ============================================================
   HELPERS
   ============================================================ */

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

function hashToken(token) {

    return crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
}

function safeEqual(a, b) {

    const A = Buffer.from(String(a));
    const B = Buffer.from(String(b));

    if (A.length !== B.length) {
        return false;
    }

    return crypto.timingSafeEqual(A, B);
}

/* ============================================================
   ACCESS TOKEN
   ============================================================ */

function generateAccessToken(user) {

    return jwt.sign(

        {
            id: user._id.toString(),
            role: user.role,
            tokenVersion:
                user.tokenVersion || 0
        },

        JWT_SECRET,

        {
            expiresIn: ACCESS_TOKEN_EXPIRES,
            issuer: 'marine-system',
            audience: 'marine-system-client'
        }
    );
}

function verifyAccessToken(token) {

    try {

        return jwt.verify(
            token,
            JWT_SECRET,
            {
                issuer: 'marine-system',
                audience: 'marine-system-client'
            }
        );

    } catch {

        return null;
    }
}

/* ============================================================
   REFRESH TOKEN
   ============================================================ */

function generateRefreshToken() {

    return crypto
        .randomBytes(64)
        .toString('hex');
}

/* ============================================================
   COOKIE OPTIONS
   ============================================================ */

function accessCookieOptions() {

    return {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000,
        path: '/'
    };
}

function refreshCookieOptions() {

    return {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: 'strict',
        maxAge:
            REFRESH_TOKEN_DAYS *
            24 *
            60 *
            60 *
            1000,
        path: '/api/auth'
    };
}

/* ============================================================
   AUDIT
   ============================================================ */

async function audit(
    req,
    action,
    options = {}
) {

    try {

        await AuditLog.create({

            userId:
                req.user?._id || null,

            username:
                req.user?.username || null,

            action,

            resource:
                options.resource || null,

            resourceId:
                options.resourceId || null,

            details:
                options.details || null,

            ip:
                req.ip,

            userAgent:
                req.headers['user-agent'],

            status:
                options.status || 'success'
        });

    } catch (error) {

        console.error(
            'Audit error:',
            error.message
        );
    }
}

/* ============================================================
   MIDDLEWARE
   ============================================================ */

app.set(
    'trust proxy',
    1
);

app.disable('x-powered-by');

/* ---------------- CORS ---------------- */

app.use(
    cors({
        origin: corsOrigin,
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
            'Authorization',
            'Accept',
            'X-CSRF-Token',
            'X-Request-ID'
        ]
    })
);

/* ---------------- HELMET ---------------- */

app.use(
    helmet({
        contentSecurityPolicy: false,

        hsts: IS_PRODUCTION
            ? {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: false
            }
            : false,

        referrerPolicy: {
            policy:
                'strict-origin-when-cross-origin'
        },

        noSniff: true,

        frameguard: {
            action: 'deny'
        }
    })
);

/* ---------------- BODY ---------------- */

app.use(
    express.json({
        limit: '1mb'
    })
);

app.use(
    express.urlencoded({
        extended: false,
        limit: '1mb'
    })
);

app.use(cookieParser());

app.use(compression());

/* ============================================================
   GENERAL RATE LIMIT
   ============================================================ */

const apiLimiter =
    rateLimit({

        windowMs:
            15 * 60 * 1000,

        max: 100,

        standardHeaders: true,

        legacyHeaders: false,

        message: {
            success: false,
            error:
                'طلبات كثيرة جداً. حاول لاحقاً.'
        }
    });

app.use(
    '/api',
    apiLimiter
);

/* ============================================================
   LOGIN RATE LIMIT
   ============================================================ */

const loginLimiter =
    rateLimit({

        windowMs:
            15 * 60 * 1000,

        max: 10,

        standardHeaders: true,

        legacyHeaders: false,

        message: {
            success: false,
            error:
                'محاولات تسجيل دخول كثيرة. حاول لاحقاً.'
        }
    });

app.use(
    '/api/auth/login',
    loginLimiter
);

/* ============================================================
   CSRF
   ============================================================ */

function generateCsrfToken() {

    return crypto
        .randomBytes(32)
        .toString('hex');
}

function requireCsrf(req, res, next) {

    const safeMethods = [
        'GET',
        'HEAD',
        'OPTIONS'
    ];

    if (
        safeMethods.includes(
            req.method
        )
    ) {
        return next();
    }

    const cookieToken =
        req.cookies?.csrfToken;

    const headerToken =
        req.headers['x-csrf-token'];

    if (
        !cookieToken ||
        !headerToken ||
        !safeEqual(
            cookieToken,
            headerToken
        )
    ) {

        return res.status(403).json({
            success: false,
            error:
                'CSRF validation failed'
        });
    }

    next();
}

app.use(
    '/api',
    requireCsrf
);

/* ============================================================
   CSRF TOKEN ENDPOINT
   ============================================================ */

app.get(
    '/api/auth/csrf-token',
    (req, res) => {

        const token =
            generateCsrfToken();

        res.cookie(
            'csrfToken',
            token,
            {
                httpOnly: false,
                secure: IS_PRODUCTION,
                sameSite: 'strict',
                maxAge:
                    2 *
                    60 *
                    60 *
                    1000,
                path: '/'
            }
        );

        res.set(
            'Cache-Control',
            'no-store'
        );

        return res.json({
            success: true,
            token
        });
    }
);

/* ============================================================
   AUTHENTICATION
   ============================================================ */

async function authenticate(
    req,
    res,
    next
) {

    try {

        let token = null;

        /* Authorization header */

        const authHeader =
            req.headers.authorization;

        if (
            authHeader &&
            authHeader.startsWith(
                'Bearer '
            )
        ) {

            token =
                authHeader
                    .substring(7)
                    .trim();
        }

        /* HttpOnly cookie */

        if (!token) {

            token =
                req.cookies?.accessToken ||
                null;
        }

        if (!token) {

            return res.status(401).json({
                success: false,
                error:
                    'غير مصرح'
            });
        }

        const decoded =
            verifyAccessToken(token);

        if (!decoded) {

            return res.status(401).json({
                success: false,
                error:
                    'انتهت صلاحية الجلسة'
            });
        }

        const user =
            await User.findById(
                decoded.id
            );

        if (
            !user ||
            !user.isActive
        ) {

            return res.status(401).json({
                success: false,
                error:
                    'غير مصرح'
            });
        }

        /* Auto unlock */

        if (
            user.isLocked &&
            user.lockUntil &&
            user.lockUntil <= new Date()
        ) {

            user.isLocked = false;
            user.lockUntil = null;
            user.loginAttempts = 0;

            await user.save();
        }

        if (user.isLocked) {

            const remaining =
                user.lockUntil
                    ? Math.max(
                        0,
                        Math.ceil(
                            (
                                user.lockUntil.getTime() -
                                Date.now()
                            ) / 1000
                        )
                    )
                    : LOCK_MINUTES * 60;

            return res.status(423).json({
                success: false,
                locked: true,
                retryAfter: remaining,
                error:
                    'الحساب مقفل مؤقتاً'
            });
        }

        if (
            decoded.tokenVersion !==
            (user.tokenVersion || 0)
        ) {

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
            'Authentication error:',
            error.message
        );

        return res.status(401).json({
            success: false,
            error:
                'غير مصرح'
        });
    }
}

/* ============================================================
   AUTHORIZATION
   ============================================================ */

function authorize(...roles) {

    return (
        req,
        res,
        next
    ) => {

        if (
            !req.user ||
            !roles.includes(
                req.user.role
            )
        ) {

            return res.status(403).json({
                success: false,
                error:
                    'ليس لديك صلاحية'
            });
        }

        next();
    };
}

/* ============================================================
   LOGIN
   ============================================================ */

app.post(
    '/api/auth/login',
    async (req, res) => {

        try {

            const username =
                typeof req.body.username ===
                'string'
                    ? req.body.username
                        .trim()
                        .toLowerCase()
                    : '';

            const password =
                typeof req.body.password ===
                'string'
                    ? req.body.password
                    : '';

            if (
                !username ||
                !password ||
                username.length > 100 ||
                password.length > 256
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

                }).select('+password');

            /*
             * Generic response.
             * We intentionally do not reveal
             * whether the username exists.
             */

            if (!user) {

                await audit(
                    req,
                    'LOGIN_FAILURE',
                    {
                        status:
                            'failure'
                    }
                );

                return res.status(401).json({
                    success: false,
                    error:
                        'اسم المستخدم أو كلمة المرور غير صحيحة'
                });
            }

            /* Auto unlock */

            if (
                user.isLocked &&
                user.lockUntil &&
                user.lockUntil <= new Date()
            ) {

                user.isLocked = false;
                user.lockUntil = null;
                user.loginAttempts = 0;

                await user.save();
            }

            /* Check lock */

            if (user.isLocked) {

                const remaining =
                    user.lockUntil
                        ? Math.max(
                            0,
                            Math.ceil(
                                (
                                    user.lockUntil.getTime() -
                                    Date.now()
                                ) / 1000
                            )
                        )
                        : LOCK_MINUTES * 60;

                return res.status(423).json({
                    success: false,
                    locked: true,
                    retryAfter:
                        remaining,
                    error:
                        'الحساب مقفل مؤقتاً'
                });
            }

            /* Account disabled */

            if (!user.isActive) {

                return res.status(401).json({
                    success: false,
                    error:
                        'اسم المستخدم أو كلمة المرور غير صحيحة'
                });
            }

            const valid =
                await user.comparePassword(
                    password
                );

            if (!valid) {

                user.loginAttempts =
                    (user.loginAttempts || 0) + 1;

                if (
                    user.loginAttempts >=
                    MAX_LOGIN_ATTEMPTS
                ) {

                    user.isLocked = true;

                    user.lockUntil =
                        new Date(
                            Date.now() +
                            LOCK_MINUTES *
                            60 *
                            1000
                        );

                    await user.save();

                    await audit(
                        req,
                        'ACCOUNT_LOCKED',
                        {
                            status:
                                'failure'
                        }
                    );

                    return res.status(423).json({
                        success: false,
                        locked: true,
                        retryAfter:
                            LOCK_MINUTES * 60,
                        error:
                            'تم قفل الحساب مؤقتاً'
                    });
                }

                await user.save();

                await audit(
                    req,
                    'LOGIN_FAILURE',
                    {
                        status:
                            'failure'
                    }
                );

                return res.status(401).json({
                    success: false,
                    error:
                        'اسم المستخدم أو كلمة المرور غير صحيحة'
                });
            }

            /* Successful login */

            user.loginAttempts = 0;
            user.isLocked = false;
            user.lockUntil = null;
            user.lastLogin = new Date();

            user.tokenVersion =
                (user.tokenVersion || 0) + 1;

            await user.save();

            const accessToken =
                generateAccessToken(
                    user
                );

            const refreshToken =
                generateRefreshToken();

            const refreshHash =
                hashToken(
                    refreshToken
                );

            const jti =
                uuidv4();

            await Session.deleteMany({
                userId: user._id,
                expiresAt: {
                    $lt: new Date()
                }
            });

            await Session.create({

                userId:
                    user._id,

                refreshTokenHash:
                    refreshHash,

                jti,

                ip:
                    req.ip,

                userAgent:
                    req.headers['user-agent'],

                expiresAt:
                    new Date(
                        Date.now() +
                        REFRESH_TOKEN_DAYS *
                        24 *
                        60 *
                        60 *
                        1000
                    )
            });

            res.cookie(
                'accessToken',
                accessToken,
                accessCookieOptions()
            );

            res.cookie(
                'refreshToken',
                refreshToken,
                refreshCookieOptions()
            );

            await audit(
                req,
                'LOGIN_SUCCESS'
            );

            return res.json({

                success: true,

                user:
                    cleanUser(user)

            });

        } catch (error) {

            console.error(
                'Login error:',
                error.message
            );

            return res.status(500).json({
                success: false,
                error:
                    'حدث خطأ في الخادم'
            });
        }
    }
);

/* ============================================================
   REFRESH
   ============================================================ */

app.post(
    '/api/auth/refresh',
    async (req, res) => {

        try {

            const refreshToken =
                req.cookies?.refreshToken;

            if (!refreshToken) {

                return res.status(401).json({
                    success: false,
                    error:
                        'لا توجد جلسة'
                });
            }

            const hash =
                hashToken(
                    refreshToken
                );

            const session =
                await Session.findOne({
                    refreshTokenHash:
                        hash,
                    isRevoked:
                        false,
                    expiresAt: {
                        $gt: new Date()
                    }
                });

            if (!session) {

                res.clearCookie(
                    'refreshToken',
                    refreshCookieOptions()
                );

                res.clearCookie(
                    'accessToken',
                    accessCookieOptions()
                );

                return res.status(401).json({
                    success: false,
                    error:
                        'انتهت الجلسة'
                });
            }

            const user =
                await User.findById(
                    session.userId
                );

            if (
                !user ||
                !user.isActive
            ) {

                session.isRevoked = true;
                await session.save();

                return res.status(401).json({
                    success: false,
                    error:
                        'غير مصرح'
                });
            }

            const newAccessToken =
                generateAccessToken(
                    user
                );

            const newRefreshToken =
                generateRefreshToken();

            session.refreshTokenHash =
                hashToken(
                    newRefreshToken
                );

            session.lastUsedAt =
                new Date();

            await session.save();

            res.cookie(
                'accessToken',
                newAccessToken,
                accessCookieOptions()
            );

            res.cookie(
                'refreshToken',
                newRefreshToken,
                refreshCookieOptions()
            );

            return res.json({
                success: true
            });

        } catch (error) {

            console.error(
                'Refresh error:',
                error.message
            );

            return res.status(500).json({
                success: false,
                error:
                    'حدث خطأ في الخادم'
            });
        }
    }
);

/* ============================================================
   ME
   ============================================================ */

app.get(
    '/api/auth/me',
    authenticate,
    (req, res) => {

        res.set(
            'Cache-Control',
            'no-store'
        );

        return res.json({

            success: true,

            user:
                cleanUser(
                    req.user
                )
        });
    }
);

/* ============================================================
   LOGOUT
   ============================================================ */

app.post(
    '/api/auth/logout',
    authenticate,
    async (req, res) => {

        try {

            const refreshToken =
                req.cookies?.refreshToken;

            if (refreshToken) {

                await Session.updateOne(

                    {
                        userId:
                            req.user._id,

                        refreshTokenHash:
                            hashToken(
                                refreshToken
                            )
                    },

                    {
                        $set: {
                            isRevoked:
                                true
                        }
                    }
                );
            }

            req.user.tokenVersion =
                (req.user.tokenVersion || 0) + 1;

            await req.user.save();

            res.clearCookie(
                'accessToken',
                accessCookieOptions()
            );

            res.clearCookie(
                'refreshToken',
                refreshCookieOptions()
            );

            await audit(
                req,
                'LOGOUT'
            );

            return res.json({
                success: true,
                message:
                    'تم تسجيل الخروج'
            });

        } catch (error) {

            console.error(
                'Logout error:',
                error.message
            );

            return res.status(500).json({
                success: false,
                error:
                    'حدث خطأ في الخادم'
            });
        }
    }
);

/* ============================================================
   USERS
   ============================================================ */

app.get(
    '/api/users',
    authenticate,
    authorize('admin'),
    async (req, res) => {

        try {

            const users =
                await User.find({})
                    .select(
                        '-password'
                    )
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            return res.json({
                success: true,
                users
            });

        } catch (error) {

            return res.status(500).json({
                success: false,
                error:
                    'تعذر تحميل المستخدمين'
            });
        }
    }
);

/* ============================================================
   ADMIN UNLOCK
   ============================================================ */

app.patch(
    '/api/users/:id/unlock',
    authenticate,
    authorize('admin'),
    async (req, res) => {

        try {

            if (
                !mongoose.isValidObjectId(
                    req.params.id
                )
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'معرف المستخدم غير صالح'
                });
            }

            const user =
                await User.findById(
                    req.params.id
                );

            if (!user) {

                return res.status(404).json({
                    success: false,
                    error:
                        'المستخدم غير موجود'
                });
            }

            user.isLocked = false;
            user.lockUntil = null;
            user.loginAttempts = 0;

            user.tokenVersion =
                (user.tokenVersion || 0) + 1;

            await user.save();

            await Session.updateMany(
                {
                    userId:
                        user._id
                },
                {
                    $set: {
                        isRevoked:
                            true
                    }
                }
            );

            await audit(
                req,
                'ADMIN_UNLOCK_USER',
                {
                    resource:
                        'User',
                    resourceId:
                        user._id.toString()
                }
            );

            return res.json({
                success: true,
                message:
                    'تم فتح الحساب'
            });

        } catch (error) {

            console.error(
                'Unlock error:',
                error.message
            );

            return res.status(500).json({
                success: false,
                error:
                    'تعذر فتح الحساب'
            });
        }
    }
);

/* ============================================================
   VESSELS
   ============================================================ */

app.get(
    '/api/vessels',
    authenticate,
    async (req, res) => {

        try {

            const vessels =
                await Vessel.find({})
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            return res.json({
                success: true,
                vessels
            });

        } catch (error) {

            return res.status(500).json({
                success: false,
                error:
                    'تعذر تحميل المراكب'
            });
        }
    }
);

/* ============================================================
   CREATE VESSEL
   ============================================================ */

app.post(
    '/api/vessels',
    authenticate,
    authorize(
        'admin',
        'manager',
        'operator'
    ),
    async (req, res) => {

        try {

            const {
                name,
                num,
                len,
                stat,
                region,
                zone,
                port,
                supp,
                break: breakValue,
                fDate,
                eDate,
                ref,
                cat,
                repairUnit
            } = req.body;

            if (
                !name ||
                typeof name !== 'string' ||
                !name.trim()
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'اسم المركب مطلوب'
                });
            }

            const vessel =
                await Vessel.create({

                    name:
                        name.trim(),

                    num,

                    len:
                        Number(len) || 0,

                    stat,

                    region,

                    zone,

                    port,

                    supp,

                    break:
                        breakValue,

                    fDate,

                    eDate,

                    ref,

                    cat,

                    repairUnit

                });

            await audit(
                req,
                'VESSEL_CREATED',
                {
                    resource:
                        'Vessel',
                    resourceId:
                        vessel._id.toString()
                }
            );

            return res.status(201).json({
                success: true,
                vessel
            });

        } catch (error) {

            console.error(
                'Create vessel error:',
                error.message
            );

            return res.status(500).json({
                success: false,
                error:
                    'تعذر إنشاء المركب'
            });
        }
    }
);

/* ============================================================
   HEALTH
   ============================================================ */

app.get(
    '/api/health',
    async (req, res) => {

        const mongoReady =
            mongoose.connection.readyState === 1;

        return res.status(
            mongoReady ? 200 : 503
        ).json({

            success:
                mongoReady,

            service:
                'marine-system',

            version:
                '22.0',

            environment:
                NODE_ENV,

            mongodb:
                mongoReady
                    ? 'connected'
                    : 'disconnected',

            time:
                new Date().toISOString()
        });
    }
);

/* ============================================================
   CLEAN EXPIRED SESSIONS
   ============================================================ */

async function cleanExpiredSessions() {

    try {

        const result =
            await Session.deleteMany({
                $or: [
                    {
                        expiresAt: {
                            $lt: new Date()
                        }
                    },
                    {
                        isRevoked: true
                    }
                ]
            });

        if (
            result.deletedCount > 0
        ) {

            console.log(
                `🧹 Deleted ${result.deletedCount} expired sessions`
            );
        }

    } catch (error) {

        console.error(
            'Session cleanup error:',
            error.message
        );
    }
}

setInterval(
    cleanExpiredSessions,
    60 * 60 * 1000
);

/* ============================================================
   AUTO ADMIN
   ============================================================ */

async function ensureAdmin() {

    try {

        if (!ADMIN_PASSWORD) {

            console.error(
                '❌ ADMIN_PASSWORD is not configured'
            );

            return;
        }

        const username =
            ADMIN_USERNAME
                .trim()
                .toLowerCase();

        const email =
            ADMIN_EMAIL
                .trim()
                .toLowerCase();

        let admin =
            await User.findOne({
                username
            }).select('+password');

        if (!admin) {

            admin =
                new User({

                    name:
                        ADMIN_NAME,

                    username,

                    email,

                    password:
                        ADMIN_PASSWORD,

                    role:
                        'admin',

                    isActive:
                        true,

                    isLocked:
                        false,

                    loginAttempts:
                        0,

                    tokenVersion:
                        1
                });

            await admin.save();

            console.log(
                '✅ Admin created'
            );

            return;
        }

        let changed = false;

        /* Email */

        if (
            admin.email !== email
        ) {

            admin.email = email;

            changed = true;
        }

        /* Name */

        if (
            admin.name !==
            ADMIN_NAME
        ) {

            admin.name =
                ADMIN_NAME;

            changed = true;
        }

        /* Role */

        if (
            admin.role !== 'admin'
        ) {

            admin.role =
                'admin';

            changed = true;
        }

        /*
         * Password update.
         * We compare it first.
         * Mongoose will hash only once.
         */

        const passwordMatches =
            await bcrypt.compare(
                ADMIN_PASSWORD,
                admin.password
            );

        if (!passwordMatches) {

            admin.password =
                ADMIN_PASSWORD;

            admin.tokenVersion =
                (admin.tokenVersion || 0) + 1;

            admin.isLocked = false;
            admin.lockUntil = null;
            admin.loginAttempts = 0;

            changed = true;

            await Session.updateMany(
                {
                    userId:
                        admin._id
                },
                {
                    $set: {
                        isRevoked:
                            true
                    }
                }
            );

            console.log(
                '🔄 Admin password updated'
            );
        }

        if (changed) {
            await admin.save();
        }

        console.log(
            `✅ Admin ready: ${username}`
        );

    } catch (error) {

        console.error(
            '❌ ensureAdmin error:',
            error.message
        );

        throw error;
    }
}

/* ============================================================
   SEED VESSELS
   ============================================================ */

async function seedVessels() {

    try {

        const count =
            await Vessel.countDocuments();

        if (count > 0) {
            return;
        }

        const vessels = [

            {
                name:
                    'البروق 1',

                num:
                    'B001',

                len:
                    11,

                region:
                    'الشمال',

                stat:
                    'صالح',

                cat:
                    'البروق',

                port:
                    'تونس'
            },

            {
                name:
                    'صقر 2',

                num:
                    'S002',

                len:
                    10,

                region:
                    'الساحل',

                stat:
                    'صالح',

                cat:
                    'صقور',

                port:
                    'سوسة'
            },

            {
                name:
                    'خافرة 3',

                num:
                    'K003',

                len:
                    20,

                region:
                    'الوسط',

                stat:
                    'معطب',

                cat:
                    'خوافر',

                port:
                    'صفاقس'
            }

        ];

        await Vessel.insertMany(
            vessels
        );

        console.log(
            `✅ Added ${vessels.length} demo vessels`
        );

    } catch (error) {

        console.error(
            '❌ Seed error:',
            error.message
        );
    }
}

/* ============================================================
   STATIC FILES
   ============================================================ */

const publicPath =
    path.join(
        __dirname,
        'public'
    );

if (
    !fs.existsSync(
        publicPath
    )
) {

    fs.mkdirSync(
        publicPath,
        {
            recursive: true
        }
    );
}

app.use(
    express.static(
        publicPath,
        {
            etag: true,
            maxAge:
                IS_PRODUCTION
                    ? '1h'
                    : 0
        }
    )
);

/* ============================================================
   ROOT
   ============================================================ */

app.get(
    '/',
    (req, res) => {

        const indexPath =
            path.join(
                publicPath,
                'index.html'
            );

        if (
            fs.existsSync(
                indexPath
            )
        ) {

            return res.sendFile(
                indexPath
            );
        }

        return res.status(404).send(
            'Marine System: index.html not found'
        );
    }
);

/* ============================================================
   DASHBOARD
   ============================================================
   إذا كان لديك dashboard.html سيعمل.
   وإذا لم يكن موجوداً نرجع إلى index.html.
   ============================================================ */

app.get(
    '/dashboard',
    (req, res) => {

        const dashboardPath =
            path.join(
                publicPath,
                'dashboard.html'
            );

        const indexPath =
            path.join(
                publicPath,
                'index.html'
            );

        if (
            fs.existsSync(
                dashboardPath
            )
        ) {

            return res.sendFile(
                dashboardPath
            );
        }

        if (
            fs.existsSync(
                indexPath
            )
        ) {

            return res.sendFile(
                indexPath
            );
        }

        return res.status(404).send(
            'Dashboard not found'
        );
    }
);

/* ============================================================
   ERROR HANDLER
   ============================================================ */

app.use(
    (err, req, res, next) => {

        console.error(
            '❌ Server error:',
            err.message
        );

        if (
            res.headersSent
        ) {
            return next(err);
        }

        return res.status(500).json({

            success:
                false,

            error:
                IS_PRODUCTION
                    ? 'حدث خطأ في الخادم'
                    : err.message
        });
    }
);

/* ============================================================
   START
   ============================================================ */

async function startServer() {

    try {

        /*
         * Wait for MongoDB.
         */

        await mongoose.connection
            .asPromise();

        await ensureAdmin();

        await seedVessels();

        await cleanExpiredSessions();

        app.listen(
            PORT,
            '0.0.0.0',
            () => {

                console.log('');
                console.log(
                    '='.repeat(65)
                );
                console.log(
                    '🚢 MARINE SYSTEM v22.0'
                );
                console.log(
                    '🚀 SERVER RUNNING'
                );
                console.log(
                    '='.repeat(65)
                );
                console.log(
                    `🌐 Port: ${PORT}`
                );
                console.log(
                    `🔐 Environment: ${NODE_ENV}`
                );
                console.log(
                    '🗄️ MongoDB: Connected ✅'
                );
                console.log(
                    '🔒 Authentication: HttpOnly Cookies'
                );
                console.log(
                    '🛡️ CSRF: Enabled'
                );
                console.log(
                    '🔒 Account Lockout: Enabled'
                );
                console.log(
                    '📋 Audit Log: Enabled'
                );
                console.log(
                    '='.repeat(65)
                );
                console.log('');
            }
        );

    } catch (error) {

        console.error(
            '❌ Failed to start server:',
            error
        );

        process.exit(1);
    }
}

startServer();
