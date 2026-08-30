/**
 * ============================================================
 * 🚢 MARINE SYSTEM - SERVER v22.0
 * ============================================================
 * Production Hardened / Render + MongoDB Atlas
 *
 * ✅ إصلاح مشكلة Express 5 wildcard
 * ✅ انتظار اتصال MongoDB قبل تشغيل السيرفر
 * ✅ Admin تلقائي من Environment Variables
 * ✅ لا توجد كلمة مرور افتراضية
 * ✅ JWT Access Token قصير
 * ✅ Refresh Token آمن + Rotation
 * ✅ Sessions مخزنة بشكل Hash
 * ✅ Token Version
 * ✅ Brute Force Protection
 * ✅ Account Lockout
 * ✅ CORS مضبوط
 * ✅ Helmet
 * ✅ Rate Limiting
 * ✅ Audit Logs
 * ✅ Graceful Shutdown
 * ✅ متوافق مع Render
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
   ⚙️ CONFIGURATION
============================================================ */

const PORT = Number(process.env.PORT) || 5000;

const NODE_ENV = process.env.NODE_ENV || 'development';

const IS_PRODUCTION = NODE_ENV === 'production';

const APP_NAME = 'Marine System';

const JWT_ISSUER = 'marine-system';

const ACCESS_TOKEN_EXPIRES = '15m';

const REFRESH_TOKEN_DAYS = 7;

const REFRESH_TOKEN_MS =
    REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000;


/* ============================================================
   🔐 SECRETS
============================================================ */

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error('❌ JWT_SECRET is required');
    process.exit(1);
}

if (JWT_SECRET.length < 32) {
    console.error(
        '❌ JWT_SECRET must contain at least 32 characters'
    );
    process.exit(1);
}


/* ============================================================
   👤 ADMIN CONFIGURATION
============================================================ */

const ADMIN_USERNAME =
    (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD;

const ADMIN_EMAIL =
    (process.env.ADMIN_EMAIL || 'admin@marine-system.local')
        .trim()
        .toLowerCase();

const ADMIN_NAME =
    (process.env.ADMIN_NAME || 'مدير النظام').trim();


if (IS_PRODUCTION) {

    if (!ADMIN_PASSWORD) {
        console.error(
            '❌ ADMIN_PASSWORD is required in production'
        );

        process.exit(1);
    }

    if (ADMIN_PASSWORD.length < 12) {
        console.error(
            '❌ ADMIN_PASSWORD must contain at least 12 characters'
        );

        process.exit(1);
    }

}


/* ============================================================
   🗄️ MONGODB
============================================================ */

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is required');
    process.exit(1);
}


/* ============================================================
   🌐 CORS
============================================================ */

const ALLOWED_ORIGINS =
    process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS
            .split(',')
            .map(origin => origin.trim())
            .filter(Boolean)
        : [];


/* ============================================================
   🔧 TRUST PROXY
============================================================ */

if (IS_PRODUCTION) {
    app.set('trust proxy', 1);
}


/* ============================================================
   🛡️ REQUEST ID
============================================================ */

app.use((req, res, next) => {

    const requestId =
        req.headers['x-request-id'] ||
        uuidv4();

    req.requestId = String(requestId);

    res.setHeader(
        'X-Request-ID',
        req.requestId
    );

    next();
});


/* ============================================================
   🛡️ CORS
============================================================ */

app.use(cors({

    origin: function (origin, callback) {

        /*
         * Requests without Origin:
         * curl / server-to-server / health checks
         */

        if (!origin) {
            return callback(null, true);
        }

        /*
         * Development:
         * allow localhost
         */

        if (!IS_PRODUCTION) {

            if (
                origin.startsWith('http://localhost:') ||
                origin.startsWith('http://127.0.0.1:')
            ) {
                return callback(null, true);
            }

        }

        if (ALLOWED_ORIGINS.includes(origin)) {
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
        'Authorization',
        'Accept',
        'X-Request-ID'
    ],

    exposedHeaders: [
        'X-Request-ID'
    ]

}));


/* ============================================================
   🛡️ HELMET
============================================================ */

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

        frameguard: {
            action: 'deny'
        },

        noSniff: true,

        referrerPolicy: {
            policy: 'strict-origin-when-cross-origin'
        },

        crossOriginEmbedderPolicy: false

    })
);


/* ============================================================
   🚦 RATE LIMIT
============================================================ */

const apiLimiter = rateLimit({

    windowMs: 15 * 60 * 1000,

    max: IS_PRODUCTION ? 200 : 1000,

    standardHeaders: true,

    legacyHeaders: false,

    message: {
        success: false,
        error: 'طلبات كثيرة جداً، حاول لاحقاً'
    },

    keyGenerator: req => req.ip

});


const loginLimiter = rateLimit({

    windowMs: 15 * 60 * 1000,

    max: 5,

    skipSuccessfulRequests: true,

    standardHeaders: true,

    legacyHeaders: false,

    message: {
        success: false,
        error: 'محاولات تسجيل دخول كثيرة، حاول بعد 15 دقيقة'
    },

    keyGenerator: req => req.ip

});


app.use('/api', apiLimiter);

app.use(
    '/api/auth/login',
    loginLimiter
);


/* ============================================================
   📦 BODY PARSERS
============================================================ */

app.use(
    express.json({
        limit: '2mb'
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: '2mb'
    })
);

app.use(cookieParser());

app.use(compression());


/* ============================================================
   🏥 HEALTH CHECK
============================================================ */

app.get('/health', async (req, res) => {

    const mongoState = mongoose.connection.readyState;

    const mongoConnected =
        mongoState === 1;

    res.status(
        mongoConnected ? 200 : 503
    ).json({

        success: mongoConnected,

        status: mongoConnected
            ? 'ok'
            : 'degraded',

        application: APP_NAME,

        environment: NODE_ENV,

        database: mongoConnected
            ? 'connected'
            : 'disconnected',

        uptime: Math.floor(
            process.uptime()
        ),

        timestamp: new Date().toISOString(),

        requestId: req.requestId

    });

});


/* ============================================================
   🗄️ DATABASE MODELS
============================================================ */


/* ============================================================
   👤 USER
============================================================ */

const UserSchema =
    new mongoose.Schema({

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
            minlength: 3,
            maxlength: 50
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            maxlength: 150
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

        lastLogin: {
            type: Date
        },

        loginAttempts: {
            type: Number,
            default: 0
        },

        lockUntil: {
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

    });


UserSchema.index(
    { username: 1 },
    { unique: true }
);

UserSchema.index(
    { email: 1 },
    { unique: true }
);


/* ============================================================
   🔐 PASSWORD HASH
============================================================ */

UserSchema.pre(
    'save',
    async function (next) {

        this.updatedAt = new Date();

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


/* ============================================================
   🔐 PASSWORD CHECK
============================================================ */

UserSchema.methods.comparePassword =
    async function (candidatePassword) {

        return bcrypt.compare(
            candidatePassword,
            this.password
        );

    };


/* ============================================================
   🚫 LOGIN ATTEMPTS
============================================================ */

UserSchema.methods.incrementLoginAttempts =
    async function () {

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
    async function () {

        this.loginAttempts = 0;

        this.isLocked = false;

        this.lockUntil = null;

        await this.save();

    };


UserSchema.methods.checkLock =
    async function () {

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

        this.isLocked = false;

        this.lockUntil = null;

        this.loginAttempts = 0;

        await this.save();

        return {
            locked: false
        };

    };


/* ============================================================
   🔑 SESSION
============================================================ */

const SessionSchema =
    new mongoose.Schema({

        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        tokenHash: {
            type: String,
            required: true,
            unique: true
        },

        refreshTokenHash: {
            type: String,
            required: true,
            unique: true
        },

        ip: {
            type: String,
            maxlength: 100
        },

        userAgent: {
            type: String,
            maxlength: 500
        },

        deviceId: {
            type: String,
            maxlength: 200
        },

        expiresAt: {
            type: Date,
            required: true
        },

        lastUsedAt: {
            type: Date,
            default: Date.now
        },

        isRevoked: {
            type: Boolean,
            default: false
        },

        createdAt: {
            type: Date,
            default: Date.now
        }

    });


SessionSchema.index({
    expiresAt: 1
}, {
    expireAfterSeconds: 0
});


SessionSchema.index({
    userId: 1,
    createdAt: -1
});


/* ============================================================
   🚢 VESSEL
============================================================ */

const VesselSchema =
    new mongoose.Schema({

        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150
        },

        num: {
            type: String,
            trim: true,
            maxlength: 50
        },

        len: {
            type: Number,
            default: 0,
            min: 0
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

        fDate: {
            type: Date
        },

        eDate: {
            type: Date
        },

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


/* ============================================================
   📋 AUDIT LOG
============================================================ */

const AuditLogSchema =
    new mongoose.Schema({

        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },

        username: {
            type: String
        },

        action: {
            type: String,
            required: true
        },

        resource: {
            type: String
        },

        resourceId: {
            type: String
        },

        details: {
            type: mongoose.Schema.Types.Mixed
        },

        ip: {
            type: String
        },

        userAgent: {
            type: String
        },

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
            default: Date.now
        }

    });


AuditLogSchema.index({
    userId: 1,
    timestamp: -1
});

AuditLogSchema.index({
    timestamp: -1
});


/* ============================================================
   📦 MODELS
============================================================ */

const User =
    mongoose.model(
        'User',
        UserSchema
    );

const Session =
    mongoose.model(
        'Session',
        SessionSchema
    );

const Vessel =
    mongoose.model(
        'Vessel',
        VesselSchema
    );

const AuditLog =
    mongoose.model(
        'AuditLog',
        AuditLogSchema
    );


/* ============================================================
   🧰 HELPERS
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


/* ============================================================
   🔐 HASH TOKEN
============================================================ */

function hashToken(token) {

    return crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

}


/* ============================================================
   🔑 ACCESS TOKEN
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

            expiresIn:
                ACCESS_TOKEN_EXPIRES,

            issuer:
                JWT_ISSUER,

            jwtid:
                uuidv4()

        }

    );

}


/* ============================================================
   🔄 REFRESH TOKEN
============================================================ */

function generateRefreshToken() {

    return crypto
        .randomBytes(64)
        .toString('hex');

}


/* ============================================================
   🔎 VERIFY JWT
============================================================ */

function verifyToken(token) {

    try {

        return jwt.verify(
            token,
            JWT_SECRET,
            {
                issuer: JWT_ISSUER
            }
        );

    } catch {

        return null;

    }

}


/* ============================================================
   🔐 SAFE COOKIE OPTIONS
============================================================ */

function refreshCookieOptions() {

    return {

        httpOnly: true,

        secure: IS_PRODUCTION,

        sameSite: 'strict',

        maxAge: REFRESH_TOKEN_MS,

        path: '/api/auth'

    };

}


/* ============================================================
   📋 AUDIT
============================================================ */

async function writeAudit({

    userId = null,

    username = null,

    action,

    resource = null,

    resourceId = null,

    details = null,

    ip = null,

    userAgent = null,

    status = 'success'

}) {

    try {

        await AuditLog.create({

            userId,

            username,

            action,

            resource,

            resourceId,

            details,

            ip,

            userAgent,

            status

        });

    } catch (error) {

        console.error(
            '⚠️ Audit error:',
            error.message
        );

    }

}


/* ============================================================
   🔐 AUTHENTICATION
============================================================ */

const authenticate =
    async (req, res, next) => {

        try {

            const authHeader =
                req.headers.authorization;

            if (
                !authHeader ||
                !authHeader.startsWith('Bearer ')
            ) {

                return res.status(401).json({

                    success: false,

                    error: 'غير مصرح'

                });

            }


            const token =
                authHeader
                    .substring(7)
                    .trim();


            if (!token) {

                return res.status(401).json({

                    success: false,

                    error: 'توكن غير صالح'

                });

            }


            const decoded =
                verifyToken(token);


            if (!decoded) {

                return res.status(401).json({

                    success: false,

                    error: 'توكن غير صالح أو منتهي'

                });

            }


            const user =
                await User
                    .findById(decoded.id);


            if (
                !user ||
                !user.isActive
            ) {

                return res.status(401).json({

                    success: false,

                    error: 'غير مصرح'

                });

            }


            const lockCheck =
                await user.checkLock();


            if (
                lockCheck &&
                lockCheck.locked
            ) {

                return res.status(423).json({

                    success: false,

                    error:
                        `الحساب مقفل، حاول بعد ${lockCheck.remainingMinutes} دقيقة`

                });

            }


            if (
                decoded.tokenVersion !==
                (user.tokenVersion || 0)
            ) {

                return res.status(401).json({

                    success: false,

                    error: 'انتهت صلاحية الجلسة'

                });

            }


            /*
             * التأكد من وجود Session
             */

            const tokenHash =
                hashToken(token);


            const session =
                await Session.findOne({

                    tokenHash,

                    userId: user._id,

                    isRevoked: false,

                    expiresAt: {
                        $gt: new Date()
                    }

                });


            if (!session) {

                return res.status(401).json({

                    success: false,

                    error: 'الجلسة غير صالحة'

                });

            }


            session.lastUsedAt =
                new Date();

            await session.save();


            req.user = user;

            req.session = session;

            req.token = token;

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

    };


/* ============================================================
   👮 AUTHORIZATION
============================================================ */

const authorize =
    (...roles) => {

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

    };


/* ============================================================
   🔐 AUTH - LOGIN
============================================================ */

app.post(
    '/api/auth/login',
    async (req, res) => {

        try {

            const username =
                String(
                    req.body?.username || ''
                )
                    .trim()
                    .toLowerCase();


            const password =
                String(
                    req.body?.password || ''
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
                await User
                    .findOne({

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

                await writeAudit({

                    action: 'LOGIN_FAILED',

                    details: {
                        reason: 'user_not_found'
                    },

                    ip: req.ip,

                    userAgent:
                        req.headers['user-agent'],

                    status: 'failure'

                });


                return res.status(401).json({

                    success: false,

                    error:
                        'اسم المستخدم أو كلمة المرور غير صحيحة'

                });

            }


            /*
             * التحقق من القفل
             */

            const lockCheck =
                await user.checkLock();


            if (
                lockCheck &&
                lockCheck.locked
            ) {

                return res.status(423).json({

                    success: false,

                    error:
                        `الحساب مقفل، حاول بعد ${lockCheck.remainingMinutes} دقيقة`

                });

            }


            if (!user.isActive) {

                return res.status(403).json({

                    success: false,

                    error:
                        'الحساب غير نشط'

                });

            }


            const isValid =
                await user.comparePassword(
                    password
                );


            if (!isValid) {

                await user.incrementLoginAttempts();


                await writeAudit({

                    userId: user._id,

                    username: user.username,

                    action: 'LOGIN_FAILED',

                    details: {
                        reason: 'invalid_password'
                    },

                    ip: req.ip,

                    userAgent:
                        req.headers['user-agent'],

                    status: 'failure'

                });


                return res.status(401).json({

                    success: false,

                    error:
                        'اسم المستخدم أو كلمة المرور غير صحيحة'

                });

            }


            /*
             * نجاح تسجيل الدخول
             */

            await user.resetLoginAttempts();


            user.lastLogin =
                new Date();


            user.tokenVersion =
                (user.tokenVersion || 0) + 1;


            await user.save();


            /*
             * Access Token
             */

            const token =
                generateAccessToken(user);


            /*
             * Refresh Token
             */

            const refreshToken =
                generateRefreshToken();


            /*
             * Session
             */

            await Session.create({

                userId: user._id,

                tokenHash:
                    hashToken(token),

                refreshTokenHash:
                    hashToken(refreshToken),

                ip: req.ip,

                userAgent:
                    req.headers['user-agent'],

                deviceId:
                    req.headers['x-device-id'] ||
                    null,

                expiresAt:
                    new Date(
                        Date.now() +
                        REFRESH_TOKEN_MS
                    ),

                lastUsedAt:
                    new Date(),

                isRevoked: false

            });


            /*
             * Cookie
             */

            res.cookie(
                'refreshToken',
                refreshToken,
                refreshCookieOptions()
            );


            await writeAudit({

                userId: user._id,

                username: user.username,

                action: 'LOGIN_SUCCESS',

                ip: req.ip,

                userAgent:
                    req.headers['user-agent'],

                status: 'success'

            });


            return res.json({

                success: true,

                user:
                    cleanUser(user),

                token,

                expiresIn:
                    ACCESS_TOKEN_EXPIRES

            });


        } catch (error) {

            console.error(
                '❌ Login error:',
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
   🔄 REFRESH TOKEN
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
                        'Refresh Token مفقود'

                });

            }


            const refreshHash =
                hashToken(refreshToken);


            const session =
                await Session.findOne({

                    refreshTokenHash:
                        refreshHash,

                    isRevoked: false,

                    expiresAt: {
                        $gt: new Date()
                    }

                });


            if (!session) {

                res.clearCookie(
                    'refreshToken',
                    {
                        path: '/api/auth'
                    }
                );


                return res.status(401).json({

                    success: false,

                    error:
                        'جلسة التحديث غير صالحة'

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


                res.clearCookie(
                    'refreshToken',
                    {
                        path: '/api/auth'
                    }
                );


                return res.status(401).json({

                    success: false,

                    error:
                        'المستخدم غير صالح'

                });

            }


            /*
             * Rotation
             */

            const newAccessToken =
                generateAccessToken(user);


            const newRefreshToken =
                generateRefreshToken();


            session.tokenHash =
                hashToken(
                    newAccessToken
                );


            session.refreshTokenHash =
                hashToken(
                    newRefreshToken
                );


            session.lastUsedAt =
                new Date();


            session.expiresAt =
                new Date(
                    Date.now() +
                    REFRESH_TOKEN_MS
                );


            await session.save();


            res.cookie(
                'refreshToken',
                newRefreshToken,
                refreshCookieOptions()
            );


            return res.json({

                success: true,

                token:
                    newAccessToken,

                expiresIn:
                    ACCESS_TOKEN_EXPIRES

            });


        } catch (error) {

            console.error(
                '❌ Refresh error:',
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
   🚪 LOGOUT
============================================================ */

app.post(
    '/api/auth/logout',
    authenticate,
    async (req, res) => {

        try {

            if (req.session) {

                req.session.isRevoked =
                    true;

                await req.session.save();

            }


            /*
             * زيادة tokenVersion
             * تلغي كل Access Tokens الخاصة بالمستخدم
             */

            req.user.tokenVersion =
                (req.user.tokenVersion || 0) + 1;

            await req.user.save();


            res.clearCookie(
                'refreshToken',
                {
                    path: '/api/auth'
                }
            );


            await writeAudit({

                userId: req.user._id,

                username: req.user.username,

                action: 'LOGOUT',

                ip: req.ip,

                userAgent:
                    req.headers['user-agent']

            });


            return res.json({

                success: true,

                message:
                    'تم تسجيل الخروج'

            });


        } catch (error) {

            console.error(
                '❌ Logout error:',
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
   👤 CURRENT USER
============================================================ */

app.get(
    '/api/auth/me',
    authenticate,
    (req, res) => {

        return res.json({

            success: true,

            user:
                cleanUser(req.user)

        });

    }
);


/* ============================================================
   👥 USERS
============================================================ */

app.get(
    '/api/users',
    authenticate,
    authorize('admin'),
    async (req, res) => {

        try {

            const users =
                await User
                    .find({})
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

            console.error(
                '❌ Users error:',
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
   👤 CREATE USER
============================================================ */

app.post(
    '/api/users',
    authenticate,
    authorize('admin'),
    async (req, res) => {

        try {

            const {
                name,
                username,
                email,
                password,
                role = 'viewer'
            } = req.body;


            if (
                !name ||
                !username ||
                !email ||
                !password
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        'جميع بيانات المستخدم مطلوبة'

                });

            }


            if (password.length < 12) {

                return res.status(400).json({

                    success: false,

                    error:
                        'كلمة المرور يجب أن تحتوي على 12 حرفاً على الأقل'

                });

            }


            const allowedRoles = [
                'admin',
                'manager',
                'operator',
                'viewer'
            ];


            if (
                !allowedRoles.includes(role)
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        'صلاحية المستخدم غير صحيحة'

                });

            }


            const normalizedUsername =
                username
                    .trim()
                    .toLowerCase();


            const normalizedEmail =
                email
                    .trim()
                    .toLowerCase();


            const existing =
                await User.findOne({

                    $or: [

                        {
                            username:
                                normalizedUsername
                        },

                        {
                            email:
                                normalizedEmail
                        }

                    ]

                });


            if (existing) {

                return res.status(409).json({

                    success: false,

                    error:
                        'اسم المستخدم أو البريد الإلكتروني موجود مسبقاً'

                });

            }


            const user =
                await User.create({

                    name:
                        String(name).trim(),

                    username:
                        normalizedUsername,

                    email:
                        normalizedEmail,

                    password,

                    role,

                    isActive: true,

                    tokenVersion: 0

                });


            await writeAudit({

                userId: req.user._id,

                username: req.user.username,

                action: 'CREATE_USER',

                resource: 'User',

                resourceId:
                    user._id.toString(),

                details: {
                    username:
                        user.username,

                    role:
                        user.role
                },

                ip: req.ip,

                userAgent:
                    req.headers['user-agent']

            });


            return res.status(201).json({

                success: true,

                user:
                    cleanUser(user)

            });


        } catch (error) {

            console.error(
                '❌ Create user error:',
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
   🚢 VESSELS - GET
============================================================ */

app.get(
    '/api/vessels',
    authenticate,
    async (req, res) => {

        try {

            const vessels =
                await Vessel
                    .find({})
                    .sort({
                        createdAt: -1
                    })
                    .lean();


            return res.json({

                success: true,

                vessels

            });


        } catch (error) {

            console.error(
                '❌ Vessels error:',
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
   🚢 CREATE VESSEL
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

            const vessel =
                await Vessel.create(
                    req.body
                );


            await writeAudit({

                userId:
                    req.user._id,

                username:
                    req.user.username,

                action:
                    'CREATE_VESSEL',

                resource:
                    'Vessel',

                resourceId:
                    vessel._id.toString(),

                details: {
                    name:
                        vessel.name
                },

                ip:
                    req.ip,

                userAgent:
                    req.headers['user-agent']

            });


            return res.status(201).json({

                success: true,

                vessel

            });


        } catch (error) {

            console.error(
                '❌ Create vessel error:',
                error.message
            );

            return res.status(400).json({

                success: false,

                error:
                    'بيانات المركب غير صحيحة'

            });

        }

    }
);


/* ============================================================
   🚢 UPDATE VESSEL
============================================================ */

app.put(
    '/api/vessels/:id',
    authenticate,
    authorize(
        'admin',
        'manager',
        'operator'
    ),
    async (req, res) => {

        try {

            if (
                !mongoose.Types.ObjectId.isValid(
                    req.params.id
                )
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        'معرف المركب غير صحيح'

                });

            }


            const vessel =
                await Vessel.findByIdAndUpdate(

                    req.params.id,

                    {
                        ...req.body,
                        updatedAt:
                            new Date()
                    },

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


            await writeAudit({

                userId:
                    req.user._id,

                username:
                    req.user.username,

                action:
                    'UPDATE_VESSEL',

                resource:
                    'Vessel',

                resourceId:
                    vessel._id.toString(),

                details: {
                    name:
                        vessel.name
                },

                ip:
                    req.ip,

                userAgent:
                    req.headers['user-agent']

            });


            return res.json({

                success: true,

                vessel

            });


        } catch (error) {

            console.error(
                '❌ Update vessel error:',
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
   🚢 DELETE VESSEL
============================================================ */

app.delete(
    '/api/vessels/:id',
    authenticate,
    authorize('admin'),
    async (req, res) => {

        try {

            if (
                !mongoose.Types.ObjectId.isValid(
                    req.params.id
                )
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        'معرف المركب غير صحيح'

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


            await writeAudit({

                userId:
                    req.user._id,

                username:
                    req.user.username,

                action:
                    'DELETE_VESSEL',

                resource:
                    'Vessel',

                resourceId:
                    req.params.id,

                details: {
                    name:
                        vessel.name
                },

                ip:
                    req.ip,

                userAgent:
                    req.headers['user-agent']

            });


            return res.json({

                success: true,

                message:
                    'تم حذف المركب'

            });


        } catch (error) {

            console.error(
                '❌ Delete vessel error:',
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
   📋 AUDIT LOGS
============================================================ */

app.get(
    '/api/audit-logs',
    authenticate,
    authorize('admin'),
    async (req, res) => {

        try {

            const limit =
                Math.min(
                    Number(req.query.limit) || 100,
                    500
                );


            const logs =
                await AuditLog
                    .find({})
                    .sort({
                        timestamp: -1
                    })
                    .limit(limit)
                    .lean();


            return res.json({

                success: true,

                logs

            });


        } catch (error) {

            console.error(
                '❌ Audit logs error:',
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
   🧹 SESSION CLEANUP
============================================================ */

async function cleanupSessions() {

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


        if (result.deletedCount > 0) {

            console.log(
                `🧹 Removed ${result.deletedCount} sessions`
            );

        }

    } catch (error) {

        console.error(
            '⚠️ Session cleanup error:',
            error.message
        );

    }

}


/* ============================================================
   🌱 SEED VESSELS
============================================================ */

async function seedVessels() {

    try {

        const count =
            await Vessel.countDocuments();


        if (count === 0) {

            const vessels = [

                {
                    name: 'البروق 1',
                    num: 'B001',
                    len: 11,
                    region: 'الشمال',
                    stat: 'صالح',
                    cat: 'البروق',
                    port: 'تونس'
                },

                {
                    name: 'صقر 2',
                    num: 'S002',
                    len: 10,
                    region: 'الساحل',
                    stat: 'صالح',
                    cat: 'صقور',
                    port: 'سوسة'
                },

                {
                    name: 'خافرة 3',
                    num: 'K003',
                    len: 20,
                    region: 'الوسط',
                    stat: 'معطب',
                    cat: 'خوافر',
                    port: 'صفاقس'
                }

            ];


            await Vessel.insertMany(
                vessels
            );


            console.log(
                `✅ Added ${vessels.length} demo vessels`
            );

        } else {

            console.log(
                `ℹ️ Existing vessels: ${count}`
            );

        }

    } catch (error) {

        console.error(
            '❌ Seed error:',
            error.message
        );

    }

}


/* ============================================================
   👑 ENSURE ADMIN
============================================================ */

async function ensureAdmin() {

    try {

        const existing =
            await User
                .findOne({
                    username:
                        ADMIN_USERNAME
                })
                .select('+password');


        /*
         * ADMIN موجود
         */

        if (existing) {

            let changed = false;


            /*
             * تأكيد أن الحساب Admin
             */

            if (existing.role !== 'admin') {

                existing.role = 'admin';

                changed = true;

                console.log(
                    '✅ Existing admin role corrected'
                );

            }


            /*
             * تأكيد النشاط
             */

            if (!existing.isActive) {

                existing.isActive = true;

                changed = true;

            }


            /*
             * تغيير كلمة المرور إذا تغيرت
             */

            if (ADMIN_PASSWORD) {

                const passwordMatches =
                    await bcrypt.compare(
                        ADMIN_PASSWORD,
                        existing.password
                    );


                if (!passwordMatches) {

                    existing.password =
                        ADMIN_PASSWORD;

                    existing.tokenVersion =
                        (existing.tokenVersion || 0) + 1;

                    changed = true;

                    /*
                     * إلغاء الجلسات القديمة
                     */

                    await Session.updateMany(

                        {
                            userId:
                                existing._id
                        },

                        {
                            $set: {
                                isRevoked: true
                            }
                        }

                    );


                    console.log(
                        '🔐 Admin password synchronized'
                    );

                }

            }


            /*
             * Email
             */

            if (
                ADMIN_EMAIL &&
                existing.email !== ADMIN_EMAIL
            ) {

                existing.email =
                    ADMIN_EMAIL;

                changed = true;

            }


            /*
             * Name
             */

            if (
                ADMIN_NAME &&
                existing.name !== ADMIN_NAME
            ) {

                existing.name =
                    ADMIN_NAME;

                changed = true;

            }


            if (changed) {

                await existing.save();

            }


            console.log(
                `✅ Admin ready: ${ADMIN_USERNAME}`
            );

            return;

        }


        /*
         * إنشاء Admin جديد
         */

        if (!ADMIN_PASSWORD) {

            throw new Error(
                'ADMIN_PASSWORD is required to create the administrator'
            );

        }


        const admin =
            new User({

                name:
                    ADMIN_NAME,

                username:
                    ADMIN_USERNAME,

                email:
                    ADMIN_EMAIL,

                password:
                    ADMIN_PASSWORD,

                role:
                    'admin',

                isActive:
                    true,

                tokenVersion:
                    1

            });


        await admin.save();


        console.log(
            `✅ Admin created: ${ADMIN_USERNAME}`
        );

    } catch (error) {

        console.error(
            '❌ Admin error:',
            error.message
        );

        throw error;

    }

}


/* ============================================================
   📁 STATIC FILES
============================================================ */

const publicPath =
    path.join(
        __dirname,
        'public'
    );


if (!fs.existsSync(publicPath)) {

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

            index: false,

            maxAge:
                IS_PRODUCTION
                    ? '1d'
                    : 0,

            etag: true,

            dotfiles: 'deny'

        }

    )

);


/* ============================================================
   🏠 ROOT
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
            fs.existsSync(indexPath)
        ) {

            return res.sendFile(
                indexPath
            );

        }


        return res.status(404).send(
            'Marine System - index.html not found'
        );

    }
);


/* ============================================================
   🌐 SPA FALLBACK
   ============================================================
   ⚠️ مهم:
   لا نستخدم app.get('*')
   لتجنب مشكلة Express 5:
   PathError: Missing parameter name
============================================================ */

app.use(
    (req, res, next) => {

        /*
         * API غير موجود
         */

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


        /*
         * فقط طلبات HTML
         */

        const acceptsHtml =
            req.headers.accept &&
            req.headers.accept.includes(
                'text/html'
            );


        if (!acceptsHtml) {

            return next();

        }


        const indexPath =
            path.join(
                publicPath,
                'index.html'
            );


        if (
            fs.existsSync(indexPath)
        ) {

            return res.sendFile(
                indexPath
            );

        }


        return res.status(404).send(
            'index.html not found'
        );

    }
);


/* ============================================================
   ❌ 404
============================================================ */

app.use(
    (req, res) => {

        return res.status(404).json({

            success: false,

            error:
                'المسار غير موجود',

            requestId:
                req.requestId

        });

    }
);


/* ============================================================
   💥 ERROR HANDLER
============================================================ */

app.use(
    (err, req, res, next) => {

        console.error(
            '❌ Server error:',
            err.message
        );


        /*
         * CORS error
         */

        if (
            err.message ===
            'CORS origin not allowed'
        ) {

            return res.status(403).json({

                success: false,

                error:
                    'Origin غير مسموح'

            });

        }


        /*
         * JSON malformed
         */

        if (
            err instanceof SyntaxError &&
            err.status === 400 &&
            err.type ===
                'entity.parse.failed'
        ) {

            return res.status(400).json({

                success: false,

                error:
                    'JSON غير صالح'

            });

        }


        return res.status(500).json({

            success: false,

            error:
                IS_PRODUCTION
                    ? 'حدث خطأ في الخادم'
                    : err.message,

            requestId:
                req.requestId

        });

    }
);


/* ============================================================
   🗄️ MONGODB CONNECTION
============================================================ */

async function connectDatabase() {

    console.log(
        '🗄️ Connecting to MongoDB...'
    );


    await mongoose.connect(
        MONGODB_URI,
        {

            serverSelectionTimeoutMS:
                10000,

            socketTimeoutMS:
                45000,

            connectTimeoutMS:
                10000,

            maxPoolSize:
                10,

            minPoolSize:
                2,

            family:
                4

        }
    );


    console.log(
        `✅ MongoDB Connected: ${mongoose.connection.name}`
    );

}


/* ============================================================
   🚀 START SERVER
============================================================ */

let server = null;

async function startServer() {

    try {

        console.log('');
        console.log(
            '='.repeat(65)
        );

        console.log(
            '🚢 MARINE SYSTEM v22.0'
        );

        console.log(
            '='.repeat(65)
        );

        console.log(
            `⚙️ Environment: ${NODE_ENV}`
        );

        console.log(
            `🌐 Port: ${PORT}`
        );


        /*
         * MongoDB
         */

        await connectDatabase();


        /*
         * Admin
         */

        await ensureAdmin();


        /*
         * Demo vessels
         */

        await seedVessels();


        /*
         * Cleanup
         */

        await cleanupSessions();


        /*
         * Start
         */

        server =
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
                        `🌍 Port: ${PORT}`
                    );

                    console.log(
                        `🔐 Environment: ${NODE_ENV}`
                    );

                    console.log(
                        '🗄️ MongoDB: Connected ✅'
                    );

                    console.log(
                        '🛡️ Helmet: Enabled ✅'
                    );

                    console.log(
                        '🚦 Rate Limit: Enabled ✅'
                    );

                    console.log(
                        '🔑 JWT: Access 15m + Refresh 7d'
                    );

                    console.log(
                        `👤 Admin: ${ADMIN_USERNAME}`
                    );

                    console.log(
                        '🔑 Password: ********'
                    );

                    console.log(
                        '='.repeat(65)
                    );

                    console.log(
                        '✅ Server is ready!'
                    );

                    console.log('');

                }
            );


    } catch (error) {

        console.error('');

        console.error(
            '='.repeat(65)
        );

        console.error(
            '❌ FAILED TO START SERVER'
        );

        console.error(
            '='.repeat(65)
        );

        console.error(
            error.message
        );

        console.error('');

        process.exit(1);

    }

}


/* ============================================================
   🛑 GRACEFUL SHUTDOWN
============================================================ */

async function shutdown(signal) {

    console.log(
        `\n🛑 ${signal} received`
    );


    if (server) {

        server.close(
            async () => {

                console.log(
                    '🔌 HTTP server closed'
                );


                try {

                    await mongoose.connection.close();

                    console.log(
                        '🗄️ MongoDB connection closed'
                    );

                    process.exit(0);

                } catch (error) {

                    console.error(
                        '❌ Shutdown error:',
                        error.message
                    );

                    process.exit(1);

                }

            }
        );

    } else {

        await mongoose.connection.close();

        process.exit(0);

    }

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
   💥 UNHANDLED ERRORS
============================================================ */

process.on(
    'unhandledRejection',
    error => {

        console.error(
            '❌ Unhandled Rejection:',
            error
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

        process.exit(1);

    }
);


/* ============================================================
   ▶️ START
============================================================ */

startServer();
