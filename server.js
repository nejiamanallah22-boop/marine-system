// ============================================================
// 🚢 MARINE SYSTEM - server.js
// Production Ready - Express + MongoDB + JWT
// ============================================================

'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// ============================================================
// 📦 MODELS
// ============================================================

const User = require('./models/User');
const Vessel = require('./models/Vessel');
const Maintenance = require('./models/Maintenance');
const Ticket = require('./models/Ticket');
const Note = require('./models/Note');
const Log = require('./models/Log');

// ============================================================
// ⚙️ CONFIGURATION
// ============================================================

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const MONGODB_URI =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI;

const JWT_SECRET = process.env.JWT_SECRET;

const JWT_REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET ||
    (JWT_SECRET ? `${JWT_SECRET}_refresh_secret` : null);

const FRONTEND_URL =
    process.env.FRONTEND_URL || '*';

const publicPath = path.join(__dirname, 'public');

// ============================================================
// 🚨 ENVIRONMENT VALIDATION
// ============================================================

console.log('');
console.log('==========================================');
console.log('🚢 MARINE SYSTEM');
console.log('==========================================');

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI / MONGO_URI غير موجود');
    process.exit(1);
}

if (!JWT_SECRET) {
    console.error('❌ JWT_SECRET غير موجود');
    process.exit(1);
}

if (JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET يجب أن يكون 32 حرفاً على الأقل');
    process.exit(1);
}

if (!JWT_REFRESH_SECRET) {
    console.error('❌ JWT_REFRESH_SECRET غير موجود');
    process.exit(1);
}

console.log(`🌍 Environment: ${NODE_ENV}`);
console.log(`🚀 Port: ${PORT}`);

// ============================================================
// 🔐 SECURITY
// ============================================================

app.disable('x-powered-by');

app.set('trust proxy', 1);

app.use(
    helmet({
        crossOriginResourcePolicy: {
            policy: 'cross-origin'
        },

        contentSecurityPolicy: false
    })
);

// ============================================================
// 🌐 CORS
// ============================================================

const allowedOrigins =
    FRONTEND_URL === '*'
        ? '*'
        : FRONTEND_URL
            .split(',')
            .map(x => x.trim())
            .filter(Boolean);

app.use(
    cors({
        origin: (origin, callback) => {

            // Requests without Origin
            if (!origin) {
                return callback(null, true);
            }

            // Development / wildcard
            if (allowedOrigins === '*') {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            console.warn(
                `⚠️ CORS blocked: ${origin}`
            );

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
            'X-Requested-With'
        ]
    })
);

// ============================================================
// 📦 BODY PARSERS
// ============================================================

app.use(
    express.json({
        limit: '5mb',
        strict: true
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: '5mb'
    })
);

// ============================================================
// 🗜️ COMPRESSION
// ============================================================

app.use(
    compression({
        threshold: 1024
    })
);

// ============================================================
// 🚦 RATE LIMIT
// ============================================================

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,

    max:
        NODE_ENV === 'production'
            ? 1000
            : 5000,

    standardHeaders: true,
    legacyHeaders: false,

    skip: req =>
        req.path === '/health',

    message: {
        success: false,
        error: 'طلبات كثيرة جداً، حاول لاحقاً.'
    }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,

    max: 10,

    skipSuccessfulRequests: true,

    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        error: 'محاولات تسجيل الدخول كثيرة جداً. حاول بعد قليل.'
    }
});

app.use('/api', globalLimiter);

// ============================================================
// 📊 REQUEST LOGGER
// ============================================================

app.use((req, res, next) => {

    const started = Date.now();

    res.on('finish', () => {

        const duration =
            Date.now() - started;

        if (NODE_ENV !== 'test') {

            console.log(
                `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
            );
        }
    });

    next();
});

// ============================================================
// 📁 STATIC FRONTEND
// ============================================================

app.use(
    express.static(publicPath, {
        index: 'index.html',

        maxAge:
            NODE_ENV === 'production'
                ? '1d'
                : 0,

        etag: true
    })
);

app.use(
    '/css',
    express.static(
        path.join(publicPath, 'css')
    )
);

app.use(
    '/js',
    express.static(
        path.join(publicPath, 'js')
    )
);

app.use(
    '/pages',
    express.static(
        path.join(publicPath, 'pages')
    )
);

app.use(
    '/images',
    express.static(
        path.join(publicPath, 'images')
    )
);

// ============================================================
// 🧰 HELPERS
// ============================================================

function isValidObjectId(id) {

    return mongoose.Types.ObjectId.isValid(id);
}

// ------------------------------------------------------------

function cleanUser(user) {

    if (!user) {
        return null;
    }

    return {
        id:
            user._id
                ? user._id.toString()
                : user.id,

        _id:
            user._id
                ? user._id.toString()
                : undefined,

        name: user.name || '',

        username:
            user.username || '',

        email:
            user.email || '',

        role:
            user.role || 'مستخدم',

        isActive:
            user.isActive !== false,

        lastLogin:
            user.lastLogin || null,

        preferences:
            user.preferences || {},

        createdAt:
            user.createdAt || null,

        updatedAt:
            user.updatedAt || null
    };
}

// ============================================================
// 🔑 PASSWORD
// ============================================================

async function comparePassword(user, password) {

    if (
        user &&
        typeof user.comparePassword === 'function'
    ) {
        return user.comparePassword(password);
    }

    if (!user || !user.password) {
        return false;
    }

    return bcrypt.compare(
        password,
        user.password
    );
}

// ============================================================
// 🔐 JWT
// ============================================================

function generateAccessToken(user) {

    return jwt.sign(
        {
            id: user._id.toString(),

            name: user.name,

            username:
                user.username || undefined,

            email: user.email,

            role: user.role
        },

        JWT_SECRET,

        {
            expiresIn: '24h',
            issuer: 'marine-system'
        }
    );
}

// ------------------------------------------------------------

function generateRefreshToken(user) {

    return jwt.sign(
        {
            id: user._id.toString()
        },

        JWT_REFRESH_SECRET,

        {
            expiresIn: '7d',
            issuer: 'marine-system'
        }
    );
}

// ------------------------------------------------------------

function verifyAccessToken(token) {

    return jwt.verify(
        token,
        JWT_SECRET,
        {
            issuer: 'marine-system'
        }
    );
}

// ============================================================
// 📜 LOGGING
// ============================================================

async function writeLog({
    action,
    resource,
    resourceId,
    resourceModel,
    resourceName,
    user,
    req,
    details = {},
    status = 'success',
    error = null
}) {

    try {

        if (
            !Log ||
            typeof Log.logAction !== 'function'
        ) {
            return;
        }

        await Log.logAction({
            action,
            resource,
            resourceId,
            resourceModel,
            resourceName,

            user:
                user?._id || null,

            userName:
                user?.name || null,

            userEmail:
                user?.email || null,

            ipAddress:
                req?.ip || null,

            userAgent:
                req?.get('user-agent') || null,

            details,

            status,

            error
        });

    } catch (err) {

        console.error(
            '⚠️ Log error:',
            err.message
        );
    }
}

// ============================================================
// 🔐 AUTHENTICATION
// ============================================================

async function authenticate(req, res, next) {

    try {

        const authorization =
            req.headers.authorization;

        if (
            !authorization ||
            !authorization.startsWith('Bearer ')
        ) {

            return res.status(401).json({
                success: false,
                error: 'غير مصرح. يرجى تسجيل الدخول.'
            });
        }

        const token =
            authorization.substring(7).trim();

        if (!token) {

            return res.status(401).json({
                success: false,
                error: 'رمز الدخول مفقود.'
            });
        }

        let decoded;

        try {

            decoded =
                verifyAccessToken(token);

        } catch (error) {

            return res.status(401).json({
                success: false,
                error:
                    error.name === 'TokenExpiredError'
                        ? 'انتهت جلسة الدخول. يرجى تسجيل الدخول من جديد.'
                        : 'رمز الدخول غير صالح.'
            });
        }

        if (
            !decoded ||
            !decoded.id ||
            !isValidObjectId(decoded.id)
        ) {

            return res.status(401).json({
                success: false,
                error: 'رمز الدخول غير صالح.'
            });
        }

        const user =
            await User
                .findById(decoded.id)
                .select('+password +refreshToken');

        if (!user) {

            return res.status(401).json({
                success: false,
                error: 'المستخدم غير موجود.'
            });
        }

        if (user.isActive === false) {

            return res.status(403).json({
                success: false,
                error: 'الحساب معطل.'
            });
        }

        if (user.isLocked === true) {

            return res.status(423).json({
                success: false,
                error: 'الحساب مقفل مؤقتاً.'
            });
        }

        // Password change protection
        if (
            decoded.iat &&
            typeof user.changedPasswordAfter === 'function'
        ) {

            if (
                user.changedPasswordAfter(
                    decoded.iat
                )
            ) {

                return res.status(401).json({
                    success: false,
                    error:
                        'تم تغيير كلمة المرور. يرجى تسجيل الدخول من جديد.'
                });
            }
        }

        req.user = user;

        next();

    } catch (error) {

        console.error(
            '❌ Authentication:',
            error
        );

        return res.status(401).json({
            success: false,
            error: 'فشل التحقق من الهوية.'
        });
    }
}

// ============================================================
// 👮 AUTHORIZATION
// ============================================================

function authorize(...roles) {

    return (req, res, next) => {

        if (!req.user) {

            return res.status(401).json({
                success: false,
                error: 'غير مصرح.'
            });
        }

        if (
            !roles.includes(
                req.user.role
            )
        ) {

            return res.status(403).json({
                success: false,
                error:
                    'ليس لديك صلاحية لتنفيذ هذه العملية.'
            });
        }

        next();
    };
}

// ============================================================
// ❤️ HEALTH
// ============================================================

app.get('/health', (req, res) => {

    const state =
        mongoose.connection.readyState;

    const database =
        state === 1
            ? 'connected'
            : state === 2
                ? 'connecting'
                : 'disconnected';

    const healthy =
        state === 1;

    res.status(
        healthy ? 200 : 503
    ).json({

        success: healthy,

        status:
            healthy
                ? 'ok'
                : 'degraded',

        service:
            'Marine System',

        environment:
            NODE_ENV,

        database,

        uptime:
            Math.floor(
                process.uptime()
            ),

        timestamp:
            new Date().toISOString()
    });
});

// ============================================================
// 🔐 LOGIN
// ============================================================

app.post(
    '/api/auth/login',
    loginLimiter,
    async (req, res) => {

        const started =
            Date.now();

        try {

            /*
             * IMPORTANT:
             * نقبل:
             * email
             * username
             * identifier
             *
             * لأن index.html عندك يستخدم username.
             */

            const identifier =
                String(
                    req.body.identifier ||
                    req.body.email ||
                    req.body.username ||
                    ''
                )
                    .trim()
                    .toLowerCase();

            const password =
                String(
                    req.body.password || ''
                );

            if (!identifier || !password) {

                return res.status(400).json({
                    success: false,
                    error:
                        'اسم المستخدم أو البريد الإلكتروني وكلمة المرور مطلوبان.'
                });
            }

            /*
             * البحث بالبريد أو اسم المستخدم.
             * هذا يصلح حتى إذا كان schema يحتوي
             * email فقط أو email + username.
             */

            const user =
                await User.findOne({
                    $or: [
                        {
                            email:
                                identifier
                        },
                        {
                            username:
                                identifier
                        }
                    ]
                }).select(
                    '+password +refreshToken'
                );

            if (!user) {

                return res.status(401).json({
                    success: false,
                    error:
                        'اسم المستخدم أو كلمة المرور غير صحيحة.'
                });
            }

            if (user.isActive === false) {

                return res.status(403).json({
                    success: false,
                    error: 'الحساب معطل.'
                });
            }

            if (user.isLocked === true) {

                return res.status(423).json({
                    success: false,
                    error:
                        'الحساب مقفل مؤقتاً بسبب محاولات دخول فاشلة.'
                });
            }

            const valid =
                await comparePassword(
                    user,
                    password
                );

            if (!valid) {

                try {

                    if (
                        typeof user.incrementLoginAttempts ===
                        'function'
                    ) {

                        await user.incrementLoginAttempts();

                    } else {

                        user.loginAttempts =
                            (user.loginAttempts || 0) + 1;

                        await user.save();
                    }

                } catch (e) {

                    console.error(
                        'Login attempts error:',
                        e.message
                    );
                }

                await writeLog({
                    action: 'login',
                    resource: 'user',
                    resourceId: user._id,
                    resourceModel: 'User',
                    user,
                    req,
                    status: 'error',
                    error: 'Invalid credentials'
                });

                return res.status(401).json({
                    success: false,
                    error:
                        'اسم المستخدم أو كلمة المرور غير صحيحة.'
                });
            }

            // Reset failed attempts
            try {

                if (
                    typeof user.resetLoginAttempts ===
                    'function'
                ) {

                    await user.resetLoginAttempts();

                } else {

                    user.loginAttempts = 0;
                }

            } catch (e) {

                console.error(
                    'Reset attempts error:',
                    e.message
                );
            }

            // Update login
            if (
                typeof user.updateLastLogin ===
                'function'
            ) {

                await user.updateLastLogin();

            } else {

                user.lastLogin =
                    new Date();
            }

            const accessToken =
                generateAccessToken(user);

            const refreshToken =
                generateRefreshToken(user);

            user.refreshToken =
                refreshToken;

            await user.save();

            await writeLog({
                action: 'login',
                resource: 'user',
                resourceId: user._id,
                resourceModel: 'User',
                user,
                req,
                details: {
                    duration:
                        Date.now() - started
                }
            });

            return res.json({

                success: true,

                token:
                    accessToken,

                accessToken,

                refreshToken,

                user:
                    cleanUser(user)
            });

        } catch (error) {

            console.error(
                '❌ Login error:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    NODE_ENV === 'production'
                        ? 'حدث خطأ داخلي في الخادم.'
                        : error.message
            });
        }
    }
);

// ============================================================
// 🔄 REFRESH
// ============================================================

app.post(
    '/api/auth/refresh',
    async (req, res) => {

        try {

            const refreshToken =
                String(
                    req.body.refreshToken || ''
                ).trim();

            if (!refreshToken) {

                return res.status(401).json({
                    success: false,
                    error:
                        'Refresh token مطلوب.'
                });
            }

            let decoded;

            try {

                decoded =
                    jwt.verify(
                        refreshToken,
                        JWT_REFRESH_SECRET,
                        {
                            issuer:
                                'marine-system'
                        }
                    );

            } catch {

                return res.status(401).json({
                    success: false,
                    error:
                        'Refresh token غير صالح أو منتهي.'
                });
            }

            if (
                !decoded?.id ||
                !isValidObjectId(decoded.id)
            ) {

                return res.status(401).json({
                    success: false,
                    error:
                        'Refresh token غير صالح.'
                });
            }

            const user =
                await User
                    .findById(decoded.id)
                    .select('+refreshToken');

            if (
                !user ||
                user.isActive === false
            ) {

                return res.status(401).json({
                    success: false,
                    error:
                        'المستخدم غير صالح.'
                });
            }

            if (
                !user.refreshToken ||
                user.refreshToken !==
                    refreshToken
            ) {

                return res.status(401).json({
                    success: false,
                    error:
                        'Refresh token غير صالح.'
                });
            }

            const accessToken =
                generateAccessToken(user);

            const newRefreshToken =
                generateRefreshToken(user);

            user.refreshToken =
                newRefreshToken;

            await user.save();

            return res.json({

                success: true,

                token:
                    accessToken,

                accessToken,

                refreshToken:
                    newRefreshToken
            });

        } catch (error) {

            console.error(
                '❌ Refresh:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'فشل تحديث جلسة الدخول.'
            });
        }
    }
);

// ============================================================
// 🚪 LOGOUT
// ============================================================

app.post(
    '/api/auth/logout',
    authenticate,
    async (req, res) => {

        try {

            req.user.refreshToken =
                undefined;

            await req.user.save();

            await writeLog({
                action: 'logout',
                resource: 'user',
                resourceId: req.user._id,
                resourceModel: 'User',
                user: req.user,
                req
            });

            res.json({
                success: true,
                message:
                    'تم تسجيل الخروج بنجاح.'
            });

        } catch (error) {

            console.error(
                'Logout:',
                error
            );

            res.status(500).json({
                success: false,
                error:
                    'فشل تسجيل الخروج.'
            });
        }
    }
);

// ============================================================
// 👤 CURRENT USER
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
// 👥 USERS
// ============================================================

app.get(
    '/api/users',
    authenticate,
    authorize('مسؤول'),
    async (req, res) => {

        try {

            const users =
                await User
                    .find()
                    .select(
                        '-password -refreshToken'
                    )
                    .sort({
                        createdAt: -1
                    });

            res.json({
                success: true,
                users
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    'فشل تحميل المستخدمين.'
            });
        }
    }
);

// ------------------------------------------------------------
// CREATE USER
// ------------------------------------------------------------

app.post(
    '/api/users',
    authenticate,
    authorize('مسؤول'),
    async (req, res) => {

        try {

            const {
                name,
                username,
                email,
                password,
                role,
                isActive
            } = req.body;

            if (
                !name ||
                !password ||
                (!email && !username)
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'الاسم واسم المستخدم/البريد وكلمة المرور مطلوبة.'
                });
            }

            const normalizedEmail =
                email
                    ? String(email)
                        .trim()
                        .toLowerCase()
                    : undefined;

            const normalizedUsername =
                username
                    ? String(username)
                        .trim()
                        .toLowerCase()
                    : undefined;

            if (normalizedEmail) {

                const exists =
                    await User.findOne({
                        email:
                            normalizedEmail
                    });

                if (exists) {

                    return res.status(409).json({
                        success: false,
                        error:
                            'البريد الإلكتروني موجود مسبقاً.'
                    });
                }
            }

            if (normalizedUsername) {

                const exists =
                    await User.findOne({
                        username:
                            normalizedUsername
                    });

                if (exists) {

                    return res.status(409).json({
                        success: false,
                        error:
                            'اسم المستخدم موجود مسبقاً.'
                    });
                }
            }

            const allowedRoles = [
                'مسؤول',
                'محرر',
                'مستخدم',
                'مشاهد'
            ];

            const finalRole =
                allowedRoles.includes(role)
                    ? role
                    : 'مستخدم';

            const data = {
                name,
                password,
                role: finalRole,

                isActive:
                    typeof isActive === 'boolean'
                        ? isActive
                        : true
            };

            if (normalizedEmail) {
                data.email =
                    normalizedEmail;
            }

            if (normalizedUsername) {
                data.username =
                    normalizedUsername;
            }

            const user =
                new User(data);

            await user.save();

            await writeLog({
                action: 'create',
                resource: 'user',
                resourceId: user._id,
                resourceModel: 'User',
                user: req.user,
                req,
                details: {
                    name: user.name,
                    email: user.email,
                    username:
                        user.username,
                    role: user.role
                }
            });

            res.status(201).json({
                success: true,
                user:
                    cleanUser(user)
            });

        } catch (error) {

            console.error(
                'Create user:',
                error
            );

            res.status(400).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------
// UPDATE USER
// ------------------------------------------------------------

app.put(
    '/api/users/:id',
    authenticate,
    authorize('مسؤول'),
    async (req, res) => {

        try {

            const { id } =
                req.params;

            if (!isValidObjectId(id)) {

                return res.status(400).json({
                    success: false,
                    error:
                        'معرف المستخدم غير صالح.'
                });
            }

            const user =
                await User.findById(id);

            if (!user) {

                return res.status(404).json({
                    success: false,
                    error:
                        'المستخدم غير موجود.'
                });
            }

            const before =
                cleanUser(user);

            const {
                name,
                username,
                email,
                password,
                role,
                isActive,
                preferences
            } = req.body;

            if (name !== undefined) {
                user.name = name;
            }

            if (username !== undefined) {
                user.username =
                    String(username)
                        .trim()
                        .toLowerCase();
            }

            if (email !== undefined) {
                user.email =
                    String(email)
                        .trim()
                        .toLowerCase();
            }

            if (password) {
                user.password =
                    password;
            }

            if (role !== undefined) {

                const allowedRoles = [
                    'مسؤول',
                    'محرر',
                    'مستخدم',
                    'مشاهد'
                ];

                if (
                    !allowedRoles.includes(role)
                ) {

                    return res.status(400).json({
                        success: false,
                        error:
                            'الدور غير صالح.'
                    });
                }

                user.role =
                    role;
            }

            if (
                typeof isActive ===
                'boolean'
            ) {

                user.isActive =
                    isActive;
            }

            if (preferences) {

                const oldPreferences =
                    user.preferences?.toObject
                        ? user.preferences.toObject()
                        : (
                            user.preferences ||
                            {}
                        );

                user.preferences = {
                    ...oldPreferences,
                    ...preferences
                };
            }

            await user.save();

            await writeLog({
                action: 'update',
                resource: 'user',
                resourceId: user._id,
                resourceModel: 'User',
                user: req.user,
                req,
                details: {
                    before,
                    after:
                        cleanUser(user)
                }
            });

            res.json({
                success: true,
                user:
                    cleanUser(user)
            });

        } catch (error) {

            console.error(
                'Update user:',
                error
            );

            res.status(400).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------
// DELETE USER
// ------------------------------------------------------------

app.delete(
    '/api/users/:id',
    authenticate,
    authorize('مسؤول'),
    async (req, res) => {

        try {

            const { id } =
                req.params;

            if (
                String(req.user._id) ===
                String(id)
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'لا يمكنك حذف حسابك بنفسك.'
                });
            }

            const user =
                await User.findByIdAndDelete(
                    id
                );

            if (!user) {

                return res.status(404).json({
                    success: false,
                    error:
                        'المستخدم غير موجود.'
                });
            }

            await writeLog({
                action: 'delete',
                resource: 'user',
                resourceId: user._id,
                resourceModel: 'User',
                user: req.user,
                req,
                details: {
                    name: user.name,
                    email: user.email
                }
            });

            res.json({
                success: true,
                message:
                    'تم حذف المستخدم.'
            });

        } catch (error) {

            console.error(
                'Delete user:',
                error
            );

            res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ============================================================
// 🚢 VESSELS
// ============================================================

app.get(
    '/api/vessels',
    authenticate,
    async (req, res) => {

        try {

            const vessels =
                await Vessel
                    .find()
                    .sort({
                        createdAt: -1
                    });

            res.json({
                success: true,
                vessels
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------

app.get(
    '/api/vessels/stats',
    authenticate,
    async (req, res) => {

        try {

            let statusStats = [];
            let categoryStats = [];

            if (
                typeof Vessel.getStats ===
                'function'
            ) {

                statusStats =
                    await Vessel.getStats();

            } else {

                statusStats =
                    await Vessel.aggregate([
                        {
                            $group: {
                                _id: '$stat',
                                count:
                                    { $sum: 1 }
                            }
                        }
                    ]);
            }

            if (
                typeof Vessel.getCategoryStats ===
                'function'
            ) {

                categoryStats =
                    await Vessel.getCategoryStats();

            } else {

                categoryStats =
                    await Vessel.aggregate([
                        {
                            $group: {
                                _id: '$cat',
                                count:
                                    { $sum: 1 }
                            }
                        }
                    ]);
            }

            res.json({
                success: true,
                status:
                    statusStats,
                categories:
                    categoryStats
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------

app.get(
    '/api/vessels/:id',
    authenticate,
    async (req, res) => {

        try {

            if (
                !isValidObjectId(
                    req.params.id
                )
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'معرف القطعة غير صالح.'
                });
            }

            const vessel =
                await Vessel.findById(
                    req.params.id
                );

            if (!vessel) {

                return res.status(404).json({
                    success: false,
                    error:
                        'القطعة غير موجودة.'
                });
            }

            res.json({
                success: true,
                vessel
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------

app.post(
    '/api/vessels',
    authenticate,
    authorize('مسؤول', 'محرر'),
    async (req, res) => {

        try {

            const vessel =
                new Vessel(
                    req.body
                );

            await vessel.save();

            await writeLog({
                action: 'create',
                resource: 'vessel',
                resourceId:
                    vessel._id,
                resourceModel:
                    'Vessel',
                resourceName:
                    vessel.name,
                user:
                    req.user,
                req
            });

            res.status(201).json({
                success: true,
                vessel
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------

app.put(
    '/api/vessels/:id',
    authenticate,
    authorize('مسؤول', 'محرر'),
    async (req, res) => {

        try {

            if (
                !isValidObjectId(
                    req.params.id
                )
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'معرف القطعة غير صالح.'
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
                        'القطعة غير موجودة.'
                });
            }

            await writeLog({
                action: 'update',
                resource: 'vessel',
                resourceId:
                    vessel._id,
                resourceModel:
                    'Vessel',
                resourceName:
                    vessel.name,
                user:
                    req.user,
                req
            });

            res.json({
                success: true,
                vessel
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------

app.delete(
    '/api/vessels/:id',
    authenticate,
    authorize('مسؤول'),
    async (req, res) => {

        try {

            if (
                !isValidObjectId(
                    req.params.id
                )
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'معرف القطعة غير صالح.'
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
                        'القطعة غير موجودة.'
                });
            }

            await writeLog({
                action: 'delete',
                resource: 'vessel',
                resourceId:
                    vessel._id,
                resourceModel:
                    'Vessel',
                resourceName:
                    vessel.name,
                user:
                    req.user,
                req
            });

            res.json({
                success: true,
                message:
                    'تم حذف القطعة.'
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ============================================================
// 🔧 MAINTENANCE
// ============================================================

app.get(
    '/api/maintenance',
    authenticate,
    async (req, res) => {

        try {

            const records =
                await Maintenance
                    .find()
                    .populate(
                        'vesselId',
                        'name num cat stat'
                    )
                    .populate(
                        'supervisor',
                        'name email'
                    )
                    .sort({
                        startDate: -1
                    });

            res.json({
                success: true,
                maintenance:
                    records
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------

app.get(
    '/api/maintenance/stats',
    authenticate,
    async (req, res) => {

        try {

            let stats;

            if (
                typeof Maintenance.getStats ===
                'function'
            ) {

                stats =
                    await Maintenance.getStats();

            } else {

                stats =
                    await Maintenance.aggregate([
                        {
                            $group: {
                                _id: '$status',
                                count:
                                    { $sum: 1 }
                            }
                        }
                    ]);
            }

            res.json({
                success: true,
                stats
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------

app.get(
    '/api/maintenance/vessel/:vesselId',
    authenticate,
    async (req, res) => {

        try {

            if (
                !isValidObjectId(
                    req.params.vesselId
                )
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'معرف القطعة غير صالح.'
                });
            }

            let records;

            if (
                typeof Maintenance.findByVessel ===
                'function'
            ) {

                records =
                    await Maintenance.findByVessel(
                        req.params.vesselId
                    );

            } else {

                records =
                    await Maintenance
                        .find({
                            vesselId:
                                req.params.vesselId
                        })
                        .sort({
                            startDate: -1
                        });
            }

            res.json({
                success: true,
                maintenance:
                    records
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------

app.post(
    '/api/maintenance',
    authenticate,
    authorize('مسؤول', 'محرر'),
    async (req, res) => {

        try {

            const data = {
                ...req.body
            };

            if (!data.supervisor) {
                data.supervisor =
                    req.user._id;
            }

            const record =
                new Maintenance(data);

            await record.save();

            await writeLog({
                action: 'create',
                resource:
                    'maintenance',
                resourceId:
                    record._id,
                resourceModel:
                    'Maintenance',
                user:
                    req.user,
                req,
                details: {
                    vesselId:
                        record.vesselId,
                    type:
                        record.type,
                    status:
                        record.status
                }
            });

            res.status(201).json({
                success: true,
                maintenance:
                    record
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------

app.put(
    '/api/maintenance/:id',
    authenticate,
    authorize('مسؤول', 'محرر'),
    async (req, res) => {

        try {

            if (
                !isValidObjectId(
                    req.params.id
                )
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'معرف الصيانة غير صالح.'
                });
            }

            const record =
                await Maintenance.findByIdAndUpdate(
                    req.params.id,
                    req.body,
                    {
                        new: true,
                        runValidators: true
                    }
                );

            if (!record) {

                return res.status(404).json({
                    success: false,
                    error:
                        'سجل الصيانة غير موجود.'
                });
            }

            await writeLog({
                action: 'update',
                resource:
                    'maintenance',
                resourceId:
                    record._id,
                resourceModel:
                    'Maintenance',
                user:
                    req.user,
                req
            });

            res.json({
                success: true,
                maintenance:
                    record
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------

app.delete(
    '/api/maintenance/:id',
    authenticate,
    authorize('مسؤول'),
    async (req, res) => {

        try {

            if (
                !isValidObjectId(
                    req.params.id
                )
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'معرف الصيانة غير صالح.'
                });
            }

            const record =
                await Maintenance.findByIdAndDelete(
                    req.params.id
                );

            if (!record) {

                return res.status(404).json({
                    success: false,
                    error:
                        'سجل الصيانة غير موجود.'
                });
            }

            await writeLog({
                action: 'delete',
                resource:
                    'maintenance',
                resourceId:
                    record._id,
                resourceModel:
                    'Maintenance',
                user:
                    req.user,
                req
            });

            res.json({
                success: true,
                message:
                    'تم حذف سجل الصيانة.'
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ============================================================
// 🎫 TICKETS
// ============================================================

app.get(
    '/api/tickets',
    authenticate,
    async (req, res) => {

        try {

            const tickets =
                await Ticket
                    .find()
                    .populate(
                        'createdBy',
                        'name email'
                    )
                    .populate(
                        'assignedTo',
                        'name email'
                    )
                    .sort({
                        createdAt: -1
                    });

            res.json({
                success: true,
                tickets
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------

app.get(
    '/api/tickets/stats',
    authenticate,
    async (req, res) => {

        try {

            let status;
            let priority;

            if (
                typeof Ticket.getStats ===
                'function'
            ) {

                status =
                    await Ticket.getStats();

            } else {

                status =
                    await Ticket.aggregate([
                        {
                            $group: {
                                _id:
                                    '$status',
                                count:
                                    { $sum: 1 }
                            }
                        }
                    ]);
            }

            if (
                typeof Ticket.getPriorityStats ===
                'function'
            ) {

                priority =
                    await Ticket.getPriorityStats();

            } else {

                priority =
                    await Ticket.aggregate([
                        {
                            $group: {
                                _id:
                                    '$priority',
                                count:
                                    { $sum: 1 }
                            }
                        }
                    ]);
            }

            res.json({
                success: true,
                status,
                priority
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------

app.post(
    '/api/tickets',
    authenticate,
    async (req, res) => {

        try {

            const ticket =
                new Ticket({
                    ...req.body,
                    createdBy:
                        req.user._id,
                    createdByName:
                        req.user.name
                });

            await ticket.save();

            await writeLog({
                action: 'create',
                resource:
                    'ticket',
                resourceId:
                    ticket._id,
                resourceModel:
                    'Ticket',
                resourceName:
                    ticket.title,
                user:
                    req.user,
                req
            });

            res.status(201).json({
                success: true,
                ticket
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------

app.put(
    '/api/tickets/:id',
    authenticate,
    async (req, res) => {

        try {

            if (
                !isValidObjectId(
                    req.params.id
                )
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'معرف التذكرة غير صالح.'
                });
            }

            const ticket =
                await Ticket.findById(
                    req.params.id
                );

            if (!ticket) {

                return res.status(404).json({
                    success: false,
                    error:
                        'التذكرة غير موجودة.'
                });
            }

            Object.assign(
                ticket,
                req.body
            );

            await ticket.save();

            await writeLog({
                action: 'update',
                resource:
                    'ticket',
                resourceId:
                    ticket._id,
                resourceModel:
                    'Ticket',
                resourceName:
                    ticket.title,
                user:
                    req.user,
                req
            });

            res.json({
                success: true,
                ticket
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------
// REPLY
// ------------------------------------------------------------

app.post(
    '/api/tickets/:id/reply',
    authenticate,
    async (req, res) => {

        try {

            const message =
                String(
                    req.body.message || ''
                ).trim();

            const isInternal =
                Boolean(
                    req.body.isInternal
                );

            if (!message) {

                return res.status(400).json({
                    success: false,
                    error:
                        'الرد مطلوب.'
                });
            }

            const ticket =
                await Ticket.findById(
                    req.params.id
                );

            if (!ticket) {

                return res.status(404).json({
                    success: false,
                    error:
                        'التذكرة غير موجودة.'
                });
            }

            if (
                typeof ticket.addReply ===
                'function'
            ) {

                await ticket.addReply(
                    req.user._id,
                    req.user.name,
                    message,
                    isInternal
                );

            } else {

                ticket.replies =
                    ticket.replies || [];

                ticket.replies.push({
                    user:
                        req.user._id,
                    userName:
                        req.user.name,
                    message,
                    isInternal,
                    createdAt:
                        new Date()
                });

                await ticket.save();
            }

            res.json({
                success: true,
                ticket
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------
// CLOSE
// ------------------------------------------------------------

app.post(
    '/api/tickets/:id/close',
    authenticate,
    authorize('مسؤول', 'محرر'),
    async (req, res) => {

        try {

            const ticket =
                await Ticket.findById(
                    req.params.id
                );

            if (!ticket) {

                return res.status(404).json({
                    success: false,
                    error:
                        'التذكرة غير موجودة.'
                });
            }

            if (
                typeof ticket.close ===
                'function'
            ) {

                await ticket.close(
                    req.user._id,
                    req.body.resolution
                );

            } else {

                ticket.status =
                    'مغلق';

                if (
                    req.body.resolution
                ) {

                    ticket.resolution =
                        req.body.resolution;
                }

                await ticket.save();
            }

            await writeLog({
                action: 'approve',
                resource:
                    'ticket',
                resourceId:
                    ticket._id,
                resourceModel:
                    'Ticket',
                user:
                    req.user,
                req
            });

            res.json({
                success: true,
                ticket
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ============================================================
// 📝 NOTES
// ============================================================

app.get(
    '/api/notes',
    authenticate,
    async (req, res) => {

        try {

            const notes =
                await Note
                    .find()
                    .populate(
                        'createdBy',
                        'name email'
                    )
                    .populate(
                        'approvedBy',
                        'name email'
                    )
                    .sort({
                        createdAt: -1
                    });

            res.json({
                success: true,
                notes
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------

app.get(
    '/api/notes/latest',
    authenticate,
    async (req, res) => {

        try {

            let notes;

            if (
                typeof Note.getLatest ===
                'function'
            ) {

                notes =
                    await Note.getLatest(10);

            } else {

                notes =
                    await Note
                        .find()
                        .sort({
                            createdAt: -1
                        })
                        .limit(10);
            }

            res.json({
                success: true,
                notes
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------

app.get(
    '/api/notes/search',
    authenticate,
    async (req, res) => {

        try {

            const q =
                String(
                    req.query.q || ''
                ).trim();

            if (!q) {

                return res.status(400).json({
                    success: false,
                    error:
                        'كلمة البحث مطلوبة.'
                });
            }

            let notes;

            if (
                typeof Note.search ===
                'function'
            ) {

                notes =
                    await Note.search(q);

            } else {

                notes =
                    await Note.find({
                        $or: [
                            {
                                title:
                                    {
                                        $regex:
                                            q,
                                        $options:
                                            'i'
                                    }
                            },
                            {
                                content:
                                    {
                                        $regex:
                                            q,
                                        $options:
                                            'i'
                                    }
                            }
                        ]
                    })
                    .sort({
                        createdAt: -1
                    });
            }

            res.json({
                success: true,
                notes
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------

app.post(
    '/api/notes',
    authenticate,
    authorize('مسؤول', 'محرر'),
    async (req, res) => {

        try {

            const note =
                new Note({
                    ...req.body,
                    createdBy:
                        req.user._id,
                    createdByName:
                        req.user.name
                });

            await note.save();

            await writeLog({
                action: 'create',
                resource:
                    'note',
                resourceId:
                    note._id,
                resourceModel:
                    'Note',
                resourceName:
                    note.title,
                user:
                    req.user,
                req
            });

            res.status(201).json({
                success: true,
                note
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------

app.put(
    '/api/notes/:id',
    authenticate,
    authorize('مسؤول', 'محرر'),
    async (req, res) => {

        try {

            const note =
                await Note.findById(
                    req.params.id
                );

            if (!note) {

                return res.status(404).json({
                    success: false,
                    error:
                        'المذكرة غير موجودة.'
                });
            }

            Object.assign(
                note,
                req.body
            );

            await note.save();

            await writeLog({
                action: 'update',
                resource:
                    'note',
                resourceId:
                    note._id,
                resourceModel:
                    'Note',
                resourceName:
                    note.title,
                user:
                    req.user,
                req
            });

            res.json({
                success: true,
                note
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------
// PUBLISH
// ------------------------------------------------------------

app.post(
    '/api/notes/:id/publish',
    authenticate,
    authorize('مسؤول'),
    async (req, res) => {

        try {

            const note =
                await Note.findById(
                    req.params.id
                );

            if (!note) {

                return res.status(404).json({
                    success: false,
                    error:
                        'المذكرة غير موجودة.'
                });
            }

            if (
                typeof note.publish ===
                'function'
            ) {

                await note.publish(
                    req.user._id
                );

            } else {

                note.status =
                    'منشورة';

                note.approvedBy =
                    req.user._id;
            }

            note.approvedByName =
                req.user.name;

            await note.save();

            await writeLog({
                action: 'approve',
                resource:
                    'note',
                resourceId:
                    note._id,
                resourceModel:
                    'Note',
                resourceName:
                    note.title,
                user:
                    req.user,
                req
            });

            res.json({
                success: true,
                note
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------
// ARCHIVE
// ------------------------------------------------------------

app.post(
    '/api/notes/:id/archive',
    authenticate,
    authorize('مسؤول'),
    async (req, res) => {

        try {

            const note =
                await Note.findById(
                    req.params.id
                );

            if (!note) {

                return res.status(404).json({
                    success: false,
                    error:
                        'المذكرة غير موجودة.'
                });
            }

            if (
                typeof note.archive ===
                'function'
            ) {

                await note.archive();

            } else {

                note.status =
                    'مؤرشفة';

                await note.save();
            }

            await writeLog({
                action: 'update',
                resource:
                    'note',
                resourceId:
                    note._id,
                resourceModel:
                    'Note',
                resourceName:
                    note.title,
                user:
                    req.user,
                req
            });

            res.json({
                success: true,
                note
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------

app.delete(
    '/api/notes/:id',
    authenticate,
    authorize('مسؤول'),
    async (req, res) => {

        try {

            const note =
                await Note.findByIdAndDelete(
                    req.params.id
                );

            if (!note) {

                return res.status(404).json({
                    success: false,
                    error:
                        'المذكرة غير موجودة.'
                });
            }

            await writeLog({
                action: 'delete',
                resource:
                    'note',
                resourceId:
                    note._id,
                resourceModel:
                    'Note',
                resourceName:
                    note.title,
                user:
                    req.user,
                req
            });

            res.json({
                success: true,
                message:
                    'تم حذف المذكرة.'
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ============================================================
// 📜 LOGS
// ============================================================

app.get(
    '/api/logs',
    authenticate,
    authorize('مسؤول'),
    async (req, res) => {

        try {

            const limit =
                Math.min(
                    Math.max(
                        Number(
                            req.query.limit
                        ) || 100,
                        1
                    ),
                    500
                );

            let logs;

            if (
                typeof Log.getRecent ===
                'function'
            ) {

                logs =
                    await Log.getRecent(
                        limit
                    );

            } else {

                logs =
                    await Log
                        .find()
                        .sort({
                            createdAt: -1
                        })
                        .limit(limit);
            }

            res.json({
                success: true,
                logs
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ------------------------------------------------------------

app.get(
    '/api/logs/user/:userId',
    authenticate,
    authorize('مسؤول'),
    async (req, res) => {

        try {

            if (
                !isValidObjectId(
                    req.params.userId
                )
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        'معرف المستخدم غير صالح.'
                });
            }

            let logs;

            if (
                typeof Log.getUserLogs ===
                'function'
            ) {

                logs =
                    await Log.getUserLogs(
                        req.params.userId,
                        100
                    );

            } else {

                logs =
                    await Log
                        .find({
                            user:
                                req.params.userId
                        })
                        .sort({
                            createdAt: -1
                        })
                        .limit(100);
            }

            res.json({
                success: true,
                logs
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ============================================================
// 📊 DASHBOARD
// ============================================================

app.get(
    '/api/dashboard',
    authenticate,
    async (req, res) => {

        try {

            const [
                totalVessels,
                activeMaintenance,
                openTickets,
                publishedNotes,
                validVessels,
                damagedVessels,
                maintenanceVessels
            ] = await Promise.all([

                Vessel.countDocuments(),

                Maintenance.countDocuments({
                    status: {
                        $in: [
                            'معلقة',
                            'قيد التنفيذ'
                        ]
                    }
                }),

                Ticket.countDocuments({
                    status: {
                        $ne: 'مغلق'
                    }
                }),

                Note.countDocuments({
                    status:
                        'منشورة'
                }),

                Vessel.countDocuments({
                    stat:
                        'صالح'
                }),

                Vessel.countDocuments({
                    stat:
                        'معطب'
                }),

                Vessel.countDocuments({
                    stat:
                        'صيانة'
                })
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

                    activeMaintenance,

                    openTickets,

                    publishedNotes
                }
            });

        } catch (error) {

            console.error(
                'Dashboard:',
                error
            );

            res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ============================================================
// ❌ API 404
// ============================================================

app.use(
    '/api',
    (req, res) => {

        res.status(404).json({

            success: false,

            error:
                'API endpoint غير موجود.',

            path:
                req.originalUrl
        });
    }
);

// ============================================================
// 🌐 FRONTEND FALLBACK
// ============================================================

/*
 * مهم جداً:
 *
 * لا نستعمل:
 *
 * app.get('*', ...)
 *
 * لأن Express 5 قد يعطي PathError.
 *
 * نستعمل Regex متوافقاً مع Express 4 و Express 5.
 */

app.get(
    /^(?!\/api(?:\/|$)).*/,
    (req, res) => {

        const indexPath =
            path.join(
                publicPath,
                'index.html'
            );

        res.sendFile(
            indexPath,
            error => {

                if (error) {

                    console.error(
                        'Frontend error:',
                        error.message
                    );

                    if (!res.headersSent) {

                        res.status(404).send(
                            'Marine System - الصفحة غير موجودة'
                        );
                    }
                }
            }
        );
    }
);

// ============================================================
// 💥 GLOBAL ERROR HANDLER
// ============================================================

app.use(
    (err, req, res, next) => {

        console.error(
            '💥 SERVER ERROR:',
            err
        );

        if (
            res.headersSent
        ) {
            return next(err);
        }

        if (
            err.name ===
            'ValidationError'
        ) {

            return res.status(400).json({

                success: false,

                error:
                    'بيانات غير صالحة.',

                details:
                    Object.values(
                        err.errors || {}
                    ).map(
                        e => e.message
                    )
            });
        }

        if (
            err.name ===
            'CastError'
        ) {

            return res.status(400).json({

                success: false,

                error:
                    'معرف غير صالح.'
            });
        }

        if (
            err.code === 11000
        ) {

            return res.status(409).json({

                success: false,

                error:
                    'القيمة موجودة مسبقاً.'
            });
        }

        if (
            err.message ===
            'CORS origin not allowed'
        ) {

            return res.status(403).json({

                success: false,

                error:
                    'Origin غير مسموح.'
            });
        }

        return res.status(500).json({

            success: false,

            error:
                NODE_ENV ===
                'production'
                    ? 'حدث خطأ داخلي في الخادم.'
                    : err.message
        });
    }
);

// ============================================================
// 🗄️ DATABASE
// ============================================================

async function connectDatabase() {

    console.log(
        '🗄️ الاتصال بـ MongoDB...'
    );

    try {

        await mongoose.connect(
            MONGODB_URI,
            {
                serverSelectionTimeoutMS:
                    15000,

                socketTimeoutMS:
                    45000,

                maxPoolSize:
                    20,

                minPoolSize:
                    2,

                retryWrites:
                    true
            }
        );

        console.log(
            '✅ MongoDB Connected'
        );

        console.log(
            `📚 Database: ${mongoose.connection.name}`
        );

    } catch (error) {

        console.error(
            '❌ MongoDB Connection Failed:',
            error.message
        );

        throw error;
    }
}

// ============================================================
// 👤 INITIAL ADMIN
// ============================================================

async function createInitialAdmin() {

    try {

        const adminEmail =
            String(
                process.env.ADMIN_EMAIL ||
                ''
            )
                .trim()
                .toLowerCase();

        const adminPassword =
            String(
                process.env.ADMIN_PASSWORD ||
                ''
            );

        const adminName =
            process.env.ADMIN_NAME ||
            'مدير النظام';

        if (
            !adminEmail ||
            !adminPassword
        ) {

            console.log(
                'ℹ️ ADMIN_EMAIL / ADMIN_PASSWORD غير موجودين. تم تخطي إنشاء المدير.'
            );

            return;
        }

        const existing =
            await User.findOne({
                email:
                    adminEmail
            });

        if (existing) {

            console.log(
                'ℹ️ حساب المدير موجود مسبقاً.'
            );

            return;
        }

        const admin =
            new User({
                name:
                    adminName,

                email:
                    adminEmail,

                password:
                    adminPassword,

                role:
                    'مسؤول',

                isActive:
                    true
            });

        await admin.save();

        console.log(
            `✅ تم إنشاء المدير: ${adminEmail}`
        );

    } catch (error) {

        console.error(
            '❌ Initial admin error:',
            error.message
        );

        /*
         * لا نوقف السيرفر بسبب فشل
         * إنشاء المدير.
         */
    }
}

// ============================================================
// 🚀 START
// ============================================================

async function startServer() {

    try {

        await connectDatabase();

        await createInitialAdmin();

        const server =
            app.listen(
                PORT,
                '0.0.0.0',
                () => {

                    console.log('');
                    console.log(
                        '=========================================='
                    );
                    console.log(
                        '🚢 MARINE SYSTEM IS RUNNING'
                    );
                    console.log(
                        '=========================================='
                    );

                    console.log(
                        `🚀 PORT: ${PORT}`
                    );

                    console.log(
                        `🌍 ENV: ${NODE_ENV}`
                    );

                    console.log(
                        '🗄️ DATABASE: MongoDB'
                    );

                    console.log(
                        '🔐 JWT: ENABLED'
                    );

                    console.log(
                        '🛡️ HELMET: ENABLED'
                    );

                    console.log(
                        '🚦 RATE LIMIT: ENABLED'
                    );

                    console.log(
                        '📜 AUDIT LOGS: ENABLED'
                    );

                    console.log(
                        `❤️ HEALTH: /health`
                    );

                    console.log(
                        `🔐 LOGIN: /api/auth/login`
                    );

                    console.log(
                        '=========================================='
                    );
                    console.log('');
                }
            );

        // ====================================================
        // GRACEFUL SHUTDOWN
        // ====================================================

        let shuttingDown =
            false;

        const shutdown =
            async signal => {

                if (shuttingDown) {
                    return;
                }

                shuttingDown =
                    true;

                console.log(
                    `🛑 ${signal} - إغلاق الخادم...`
                );

                server.close(
                    async () => {

                        try {

                            await mongoose.connection.close();

                            console.log(
                                '✅ تم إغلاق MongoDB.'
                            );

                            process.exit(0);

                        } catch (error) {

                            console.error(
                                '❌ Shutdown error:',
                                error
                            );

                            process.exit(1);
                        }
                    }
                );

                setTimeout(
                    () => {
                        process.exit(1);
                    },
                    10000
                ).unref();
            };

        process.once(
            'SIGTERM',
            () =>
                shutdown('SIGTERM')
        );

        process.once(
            'SIGINT',
            () =>
                shutdown('SIGINT')
        );

    } catch (error) {

        console.error('');
        console.error(
            '💥 فشل تشغيل Marine System'
        );
        console.error(
            error
        );

        process.exit(1);
    }
}

// ============================================================
// 🚀 RUN
// ============================================================

startServer();

// ============================================================
// EXPORT
// ============================================================

module.exports = app;
