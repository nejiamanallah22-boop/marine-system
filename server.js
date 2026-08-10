// ============================================================
// 🚢 MARINE SYSTEM - server.js
// Production Server - Express + MongoDB + JWT
// متوافق مع:
// User.js
// Vessel.js
// Maintenance.js
// Ticket.js
// Note.js
// Log.js
// ============================================================

'use strict';

console.log('🚀 بدء تشغيل Marine System...');

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

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
// ⚙️ CONFIG
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
    (JWT_SECRET ? `${JWT_SECRET}_refresh` : null);

const FRONTEND_URL =
    process.env.FRONTEND_URL || '*';

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI غير موجود في Environment Variables');
    process.exit(1);
}

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error(
        '❌ JWT_SECRET غير موجود أو قصير جداً. يجب أن يكون 32 حرفاً على الأقل.'
    );
    process.exit(1);
}

// ============================================================
// 🔐 SECURITY
// ============================================================

app.disable('x-powered-by');

app.set('trust proxy', 1);

app.use(
    helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' }
    })
);

// CORS
app.use(
    cors({
        origin: FRONTEND_URL === '*'
            ? true
            : FRONTEND_URL.split(',').map(v => v.trim()),
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'Accept'
        ]
    })
);

// Body limits
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({
    extended: true,
    limit: '2mb'
}));

// ============================================================
// 🚦 RATE LIMIT
// ============================================================

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: NODE_ENV === 'production' ? 500 : 2000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'طلبات كثيرة جداً. حاول لاحقاً.'
    }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'محاولات تسجيل دخول كثيرة. حاول بعد قليل.'
    }
});

app.use('/api', globalLimiter);

// ============================================================
// 📁 STATIC FILES
// ============================================================

const publicPath = path.join(__dirname, 'public');

app.use(
    express.static(publicPath, {
        index: 'index.html',
        maxAge: NODE_ENV === 'production' ? '1d' : 0
    })
);

app.use('/css', express.static(path.join(publicPath, 'css')));
app.use('/js', express.static(path.join(publicPath, 'js')));
app.use('/pages', express.static(path.join(publicPath, 'pages')));
app.use('/images', express.static(path.join(publicPath, 'images')));

// ============================================================
// 🧰 HELPERS
// ============================================================

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

function cleanUser(user) {
    if (!user) return null;

    return {
        id: user._id?.toString() || user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        lastLogin: user.lastLogin || null,
        preferences: user.preferences || {},
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
    };
}

function generateAccessToken(user) {
    return jwt.sign(
        {
            id: user._id.toString(),
            name: user.name,
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

function verifyAccessToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

async function writeLog({
    action,
    resource,
    resourceId,
    resourceModel,
    user,
    req,
    details = {},
    status = 'success',
    error = null
}) {
    try {
        await Log.logAction({
            action,
            resource,
            resourceId,
            resourceModel,
            user: user?._id,
            userName: user?.name,
            userEmail: user?.email,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            details,
            status,
            error
        });
    } catch (err) {
        console.error('⚠️ Log error:', err.message);
    }
}

// ============================================================
// 🔐 AUTHENTICATION MIDDLEWARE
// ============================================================

async function authenticate(req, res, next) {
    try {
        const header = req.headers.authorization;

        if (!header || !header.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'غير مصرح. رمز الدخول غير موجود.'
            });
        }

        const token = header.substring(7);

        let decoded;

        try {
            decoded = verifyAccessToken(token);
        } catch (err) {
            return res.status(401).json({
                success: false,
                error: 'رمز الدخول غير صالح أو منتهي.'
            });
        }

        if (!decoded?.id || !isValidObjectId(decoded.id)) {
            return res.status(401).json({
                success: false,
                error: 'رمز دخول غير صالح.'
            });
        }

        const user = await User.findById(decoded.id).select(
            '+password'
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'المستخدم غير موجود.'
            });
        }

        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                error: 'الحساب معطل.'
            });
        }

        if (user.isLocked) {
            return res.status(423).json({
                success: false,
                error: 'الحساب مقفل مؤقتاً.'
            });
        }

        if (
            decoded.iat &&
            user.changedPasswordAfter(decoded.iat)
        ) {
            return res.status(401).json({
                success: false,
                error: 'تم تغيير كلمة المرور. يرجى تسجيل الدخول من جديد.'
            });
        }

        req.user = user;

        next();

    } catch (error) {
        console.error('Authentication error:', error);

        return res.status(401).json({
            success: false,
            error: 'فشل التحقق من الهوية.'
        });
    }
}

// ============================================================
// 👮 ROLE AUTHORIZATION
// ============================================================

function authorize(...roles) {
    return (req, res, next) => {

        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'غير مصرح.'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'ليس لديك صلاحية لتنفيذ هذه العملية.'
            });
        }

        next();
    };
}

// ============================================================
// ❤️ HEALTH
// ============================================================

app.get('/health', async (req, res) => {

    const dbState = mongoose.connection.readyState;

    res.json({
        success: true,
        status: 'ok',
        service: 'Marine System',
        environment: NODE_ENV,
        database:
            dbState === 1
                ? 'connected'
                : 'disconnected',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// 🔐 AUTH
// ============================================================

app.post(
    '/api/auth/login',
    loginLimiter,
    async (req, res) => {

        const started = Date.now();

        try {

            let { email, password } = req.body;

            email = String(email || '')
                .trim()
                .toLowerCase();

            password = String(password || '');

            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'البريد الإلكتروني وكلمة المرور مطلوبان.'
                });
            }

            const user = await User
                .findOne({ email })
                .select('+password');

            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: 'بيانات الدخول غير صحيحة.'
                });
            }

            if (user.isLocked) {
                return res.status(423).json({
                    success: false,
                    error: 'الحساب مقفل مؤقتاً.'
                });
            }

            if (!user.isActive) {
                return res.status(403).json({
                    success: false,
                    error: 'الحساب معطل.'
                });
            }

            const valid = await user.comparePassword(password);

            if (!valid) {

                await user.incrementLoginAttempts();

                await writeLog({
                    action: 'login',
                    resource: 'user',
                    resourceId: user._id,
                    resourceModel: 'User',
                    user,
                    req,
                    status: 'error',
                    error: 'Invalid password'
                });

                return res.status(401).json({
                    success: false,
                    error: 'بيانات الدخول غير صحيحة.'
                });
            }

            await user.resetLoginAttempts();
            await user.updateLastLogin();

            const accessToken =
                generateAccessToken(user);

            const refreshToken =
                generateRefreshToken(user);

            // تخزين refresh token
            user.refreshToken = refreshToken;
            await user.save();

            await writeLog({
                action: 'login',
                resource: 'user',
                resourceId: user._id,
                resourceModel: 'User',
                user,
                req,
                details: {
                    duration: Date.now() - started
                }
            });

            res.json({
                success: true,
                token: accessToken,
                accessToken,
                refreshToken,
                user: cleanUser(user)
            });

        } catch (error) {

            console.error('Login error:', error);

            res.status(500).json({
                success: false,
                error: 'حدث خطأ داخلي في الخادم.'
            });
        }
    }
);

// ============================================================
// 🔄 REFRESH TOKEN
// ============================================================

app.post('/api/auth/refresh', async (req, res) => {

    try {

        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                error: 'Refresh token مطلوب.'
            });
        }

        let decoded;

        try {
            decoded = jwt.verify(
                refreshToken,
                JWT_REFRESH_SECRET
            );
        } catch {
            return res.status(401).json({
                success: false,
                error: 'Refresh token غير صالح.'
            });
        }

        const user = await User
            .findById(decoded.id)
            .select('+refreshToken');

        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                error: 'المستخدم غير صالح.'
            });
        }

        if (
            !user.refreshToken ||
            user.refreshToken !== refreshToken
        ) {
            return res.status(401).json({
                success: false,
                error: 'Refresh token غير صالح.'
            });
        }

        const accessToken =
            generateAccessToken(user);

        const newRefreshToken =
            generateRefreshToken(user);

        user.refreshToken = newRefreshToken;

        await user.save();

        res.json({
            success: true,
            accessToken,
            token: accessToken,
            refreshToken: newRefreshToken
        });

    } catch (error) {

        console.error('Refresh error:', error);

        res.status(500).json({
            success: false,
            error: 'فشل تحديث رمز الدخول.'
        });
    }
});

// ============================================================
// 🚪 LOGOUT
// ============================================================

app.post(
    '/api/auth/logout',
    authenticate,
    async (req, res) => {

        try {

            req.user.refreshToken = undefined;

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
                message: 'تم تسجيل الخروج.'
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: 'فشل تسجيل الخروج.'
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
    async (req, res) => {

        res.json({
            success: true,
            user: cleanUser(req.user)
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

            const users = await User
                .find()
                .select('-password -refreshToken')
                .sort({ createdAt: -1 });

            res.json({
                success: true,
                users
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: 'فشل تحميل المستخدمين.'
            });
        }
    }
);

// إنشاء مستخدم
app.post(
    '/api/users',
    authenticate,
    authorize('مسؤول'),
    async (req, res) => {

        try {

            const {
                name,
                email,
                password,
                role,
                isActive
            } = req.body;

            if (!name || !email || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'الاسم والبريد وكلمة المرور مطلوبة.'
                });
            }

            const normalizedEmail =
                String(email).trim().toLowerCase();

            const exists =
                await User.findOne({
                    email: normalizedEmail
                });

            if (exists) {
                return res.status(409).json({
                    success: false,
                    error: 'البريد الإلكتروني موجود مسبقاً.'
                });
            }

            const allowedRoles = [
                'مسؤول',
                'محرر',
                'مستخدم'
            ];

            const finalRole =
                allowedRoles.includes(role)
                    ? role
                    : 'مستخدم';

            const user = new User({
                name,
                email: normalizedEmail,
                password,
                role: finalRole,
                isActive:
                    typeof isActive === 'boolean'
                        ? isActive
                        : true
            });

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
                    role: user.role
                }
            });

            res.status(201).json({
                success: true,
                user: cleanUser(user)
            });

        } catch (error) {

            console.error(error);

            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
);

// تعديل مستخدم
app.put(
    '/api/users/:id',
    authenticate,
    authorize('مسؤول'),
    async (req, res) => {

        try {

            const { id } = req.params;

            if (!isValidObjectId(id)) {
                return res.status(400).json({
                    success: false,
                    error: 'معرف المستخدم غير صالح.'
                });
            }

            const user =
                await User.findById(id);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'المستخدم غير موجود.'
                });
            }

            const before = cleanUser(user);

            const {
                name,
                email,
                password,
                role,
                isActive,
                preferences
            } = req.body;

            if (name !== undefined)
                user.name = name;

            if (email !== undefined)
                user.email =
                    String(email).trim().toLowerCase();

            if (role !== undefined) {

                if (
                    ![
                        'مسؤول',
                        'محرر',
                        'مستخدم'
                    ].includes(role)
                ) {
                    return res.status(400).json({
                        success: false,
                        error: 'الدور غير صالح.'
                    });
                }

                user.role = role;
            }

            if (typeof isActive === 'boolean')
                user.isActive = isActive;

            if (preferences)
                user.preferences = {
                    ...user.preferences?.toObject?.(),
                    ...preferences
                };

            if (password) {
                user.password = password;
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
                    changes: {
                        before,
                        after: cleanUser(user)
                    }
                }
            });

            res.json({
                success: true,
                user: cleanUser(user)
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
);

// حذف مستخدم
app.delete(
    '/api/users/:id',
    authenticate,
    authorize('مسؤول'),
    async (req, res) => {

        try {

            const { id } = req.params;

            if (String(req.user._id) === String(id)) {
                return res.status(400).json({
                    success: false,
                    error: 'لا يمكنك حذف حسابك بنفسك.'
                });
            }

            const user =
                await User.findByIdAndDelete(id);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'المستخدم غير موجود.'
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
                message: 'تم حذف المستخدم.'
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: error.message
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
                    .sort({ createdAt: -1 });

            res.json({
                success: true,
                vessels
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

app.get(
    '/api/vessels/stats',
    authenticate,
    async (req, res) => {

        try {

            const [
                statusStats,
                categoryStats
            ] = await Promise.all([
                Vessel.getStats(),
                Vessel.getCategoryStats()
            ]);

            res.json({
                success: true,
                status: statusStats,
                categories: categoryStats
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

app.get(
    '/api/vessels/:id',
    authenticate,
    async (req, res) => {

        try {

            if (!isValidObjectId(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    error: 'معرف القطعة غير صالح.'
                });
            }

            const vessel =
                await Vessel.findById(req.params.id);

            if (!vessel) {
                return res.status(404).json({
                    success: false,
                    error: 'القطعة غير موجودة.'
                });
            }

            res.json({
                success: true,
                vessel
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

app.post(
    '/api/vessels',
    authenticate,
    authorize('مسؤول', 'محرر'),
    async (req, res) => {

        try {

            const vessel =
                new Vessel(req.body);

            await vessel.save();

            await writeLog({
                action: 'create',
                resource: 'vessel',
                resourceId: vessel._id,
                resourceModel: 'Vessel',
                resourceName: vessel.name,
                user: req.user,
                req
            });

            res.status(201).json({
                success: true,
                vessel
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
);

app.put(
    '/api/vessels/:id',
    authenticate,
    authorize('مسؤول', 'محرر'),
    async (req, res) => {

        try {

            if (!isValidObjectId(req.params.id)) {
                return res.status(400).json({
                    success: false,
                    error: 'معرف القطعة غير صالح.'
                });
            }

            const before =
                await Vessel.findById(req.params.id);

            if (!before) {
                return res.status(404).json({
                    success: false,
                    error: 'القطعة غير موجودة.'
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

            await writeLog({
                action: 'update',
                resource: 'vessel',
                resourceId: vessel._id,
                resourceModel: 'Vessel',
                resourceName: vessel.name,
                user: req.user,
                req,
                details: {
                    before,
                    after: vessel
                }
            });

            res.json({
                success: true,
                vessel
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
);

app.delete(
    '/api/vessels/:id',
    authenticate,
    authorize('مسؤول'),
    async (req, res) => {

        try {

            const vessel =
                await Vessel.findByIdAndDelete(
                    req.params.id
                );

            if (!vessel) {
                return res.status(404).json({
                    success: false,
                    error: 'القطعة غير موجودة.'
                });
            }

            await writeLog({
                action: 'delete',
                resource: 'vessel',
                resourceId: vessel._id,
                resourceModel: 'Vessel',
                resourceName: vessel.name,
                user: req.user,
                req
            });

            res.json({
                success: true,
                message: 'تم حذف القطعة.'
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: error.message
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
                    .populate('vesselId', 'name num cat stat')
                    .populate('supervisor', 'name email')
                    .sort({ startDate: -1 });

            res.json({
                success: true,
                maintenance: records
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

app.get(
    '/api/maintenance/stats',
    authenticate,
    async (req, res) => {

        try {

            const stats =
                await Maintenance.getStats();

            res.json({
                success: true,
                stats
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

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
                    error: 'معرف القطعة غير صالح.'
                });
            }

            const records =
                await Maintenance.findByVessel(
                    req.params.vesselId
                );

            res.json({
                success: true,
                maintenance: records
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

app.post(
    '/api/maintenance',
    authenticate,
    authorize('مسؤول', 'محرر'),
    async (req, res) => {

        try {

            const record =
                new Maintenance({
                    ...req.body,
                    supervisor:
                        req.body.supervisor ||
                        req.user._id
                });

            await record.save();

            await writeLog({
                action: 'create',
                resource: 'maintenance',
                resourceId: record._id,
                resourceModel: 'Maintenance',
                user: req.user,
                req,
                details: {
                    vesselId: record.vesselId,
                    type: record.type,
                    status: record.status
                }
            });

            res.status(201).json({
                success: true,
                maintenance: record
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
);

app.put(
    '/api/maintenance/:id',
    authenticate,
    authorize('مسؤول', 'محرر'),
    async (req, res) => {

        try {

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
                    error: 'سجل الصيانة غير موجود.'
                });
            }

            await writeLog({
                action: 'update',
                resource: 'maintenance',
                resourceId: record._id,
                resourceModel: 'Maintenance',
                user: req.user,
                req
            });

            res.json({
                success: true,
                maintenance: record
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
);

app.delete(
    '/api/maintenance/:id',
    authenticate,
    authorize('مسؤول'),
    async (req, res) => {

        try {

            const record =
                await Maintenance.findByIdAndDelete(
                    req.params.id
                );

            if (!record) {
                return res.status(404).json({
                    success: false,
                    error: 'سجل الصيانة غير موجود.'
                });
            }

            await writeLog({
                action: 'delete',
                resource: 'maintenance',
                resourceId: record._id,
                resourceModel: 'Maintenance',
                user: req.user,
                req
            });

            res.json({
                success: true
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: error.message
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
                    .populate('createdBy', 'name email')
                    .populate('assignedTo', 'name email')
                    .sort({ createdAt: -1 });

            res.json({
                success: true,
                tickets
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

app.get(
    '/api/tickets/stats',
    authenticate,
    async (req, res) => {

        try {

            const [
                status,
                priority
            ] = await Promise.all([
                Ticket.getStats(),
                Ticket.getPriorityStats()
            ]);

            res.json({
                success: true,
                status,
                priority
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
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
                    createdBy: req.user._id,
                    createdByName: req.user.name
                });

            await ticket.save();

            await writeLog({
                action: 'create',
                resource: 'ticket',
                resourceId: ticket._id,
                resourceModel: 'Ticket',
                resourceName: ticket.title,
                user: req.user,
                req
            });

            res.status(201).json({
                success: true,
                ticket
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
);

app.put(
    '/api/tickets/:id',
    authenticate,
    async (req, res) => {

        try {

            const ticket =
                await Ticket.findById(
                    req.params.id
                );

            if (!ticket) {
                return res.status(404).json({
                    success: false,
                    error: 'التذكرة غير موجودة.'
                });
            }

            Object.assign(ticket, req.body);

            await ticket.save();

            await writeLog({
                action: 'update',
                resource: 'ticket',
                resourceId: ticket._id,
                resourceModel: 'Ticket',
                resourceName: ticket.title,
                user: req.user,
                req
            });

            res.json({
                success: true,
                ticket
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
);

// إضافة رد
app.post(
    '/api/tickets/:id/reply',
    authenticate,
    async (req, res) => {

        try {

            const {
                message,
                isInternal = false
            } = req.body;

            if (!message || !message.trim()) {
                return res.status(400).json({
                    success: false,
                    error: 'الرد مطلوب.'
                });
            }

            const ticket =
                await Ticket.findById(
                    req.params.id
                );

            if (!ticket) {
                return res.status(404).json({
                    success: false,
                    error: 'التذكرة غير موجودة.'
                });
            }

            await ticket.addReply(
                req.user._id,
                req.user.name,
                message.trim(),
                Boolean(isInternal)
            );

            res.json({
                success: true,
                ticket
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
);

// إغلاق تذكرة
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
                    error: 'التذكرة غير موجودة.'
                });
            }

            await ticket.close(
                req.user._id,
                req.body.resolution
            );

            await writeLog({
                action: 'approve',
                resource: 'ticket',
                resourceId: ticket._id,
                resourceModel: 'Ticket',
                user: req.user,
                req
            });

            res.json({
                success: true,
                ticket
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error: error.message
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
                    .populate('createdBy', 'name email')
                    .populate('approvedBy', 'name email')
                    .sort({ createdAt: -1 });

            res.json({
                success: true,
                notes
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

app.get(
    '/api/notes/latest',
    authenticate,
    async (req, res) => {

        try {

            const notes =
                await Note.getLatest(10);

            res.json({
                success: true,
                notes
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

app.get(
    '/api/notes/search',
    authenticate,
    async (req, res) => {

        try {

            const q =
                String(req.query.q || '').trim();

            if (!q) {
                return res.status(400).json({
                    success: false,
                    error: 'كلمة البحث مطلوبة.'
                });
            }

            const notes =
                await Note.search(q);

            res.json({
                success: true,
                notes
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

app.post(
    '/api/notes',
    authenticate,
    authorize('مسؤول', 'محرر'),
    async (req, res) => {

        try {

            const note =
                new Note({
                    ...req.body,
                    createdBy: req.user._id,
                    createdByName: req.user.name
                });

            await note.save();

            await writeLog({
                action: 'create',
                resource: 'note',
                resourceId: note._id,
                resourceModel: 'Note',
                resourceName: note.title,
                user: req.user,
                req
            });

            res.status(201).json({
                success: true,
                note
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
);

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
                    error: 'المذكرة غير موجودة.'
                });
            }

            Object.assign(note, req.body);

            await note.save();

            await writeLog({
                action: 'update',
                resource: 'note',
                resourceId: note._id,
                resourceModel: 'Note',
                resourceName: note.title,
                user: req.user,
                req
            });

            res.json({
                success: true,
                note
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
);

// نشر مذكرة
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
                    error: 'المذكرة غير موجودة.'
                });
            }

            await note.publish(
                req.user._id
            );

            note.approvedByName =
                req.user.name;

            await note.save();

            await writeLog({
                action: 'approve',
                resource: 'note',
                resourceId: note._id,
                resourceModel: 'Note',
                resourceName: note.title,
                user: req.user,
                req
            });

            res.json({
                success: true,
                note
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
);

// أرشفة مذكرة
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
                    error: 'المذكرة غير موجودة.'
                });
            }

            await note.archive();

            await writeLog({
                action: 'update',
                resource: 'note',
                resourceId: note._id,
                resourceModel: 'Note',
                resourceName: note.title,
                user: req.user,
                req
            });

            res.json({
                success: true,
                note
            });

        } catch (error) {

            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
);

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
                    error: 'المذكرة غير موجودة.'
                });
            }

            await writeLog({
                action: 'delete',
                resource: 'note',
                resourceId: note._id,
                resourceModel: 'Note',
                resourceName: note.title,
                user: req.user,
                req
            });

            res.json({
                success: true
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: error.message
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
                    Number(req.query.limit) || 100,
                    500
                );

            const logs =
                await Log.getRecent(limit);

            res.json({
                success: true,
                logs
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

app.get(
    '/api/logs/user/:userId',
    authenticate,
    authorize('مسؤول'),
    async (req, res) => {

        try {

            const logs =
                await Log.getUserLogs(
                    req.params.userId,
                    100
                );

            res.json({
                success: true,
                logs
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: error.message
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
                vessels,
                maintenance,
                tickets,
                notes
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
                    status: 'منشورة'
                })

            ]);

            const [
                validVessels,
                damagedVessels,
                vesselsMaintenance
            ] = await Promise.all([

                Vessel.countDocuments({
                    stat: 'صالح'
                }),

                Vessel.countDocuments({
                    stat: 'معطب'
                }),

                Vessel.countDocuments({
                    stat: 'صيانة'
                })

            ]);

            res.json({
                success: true,
                data: {
                    vessels: {
                        total: vessels,
                        valid: validVessels,
                        damaged: damagedVessels,
                        maintenance: vesselsMaintenance
                    },
                    activeMaintenance: maintenance,
                    openTickets: tickets,
                    publishedNotes: notes
                }
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

// ============================================================
// ❌ 404 API
// ============================================================

app.use('/api', (req, res) => {

    res.status(404).json({
        success: false,
        error: 'API endpoint غير موجود.',
        path: req.originalUrl
    });
});

// ============================================================
// 🌐 FRONTEND FALLBACK
// ============================================================

app.get('*', (req, res, next) => {

    if (req.path.startsWith('/api')) {
        return next();
    }

    const indexPath =
        path.join(publicPath, 'index.html');

    res.sendFile(indexPath, err => {

        if (err) {
            res.status(404).send(
                'Marine System - الصفحة غير موجودة'
            );
        }

    });
});

// ============================================================
// 💥 ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {

    console.error('💥 Server Error:', err);

    if (res.headersSent) {
        return next(err);
    }

    if (err.name === 'ValidationError') {

        return res.status(400).json({
            success: false,
            error: 'بيانات غير صالحة.',
            details: Object.values(err.errors)
                .map(e => e.message)
        });
    }

    if (err.name === 'CastError') {

        return res.status(400).json({
            success: false,
            error: 'معرف غير صالح.'
        });
    }

    if (err.code === 11000) {

        return res.status(409).json({
            success: false,
            error: 'القيمة موجودة مسبقاً.'
        });
    }

    res.status(500).json({
        success: false,
        error:
            NODE_ENV === 'production'
                ? 'حدث خطأ داخلي في الخادم.'
                : err.message
    });
});

// ============================================================
// 🗄️ DATABASE
// ============================================================

async function connectDatabase() {

    try {

        console.log('🗄️ الاتصال بـ MongoDB...');

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
            '✅ MongoDB Connected:',
            mongoose.connection.name
        );

    } catch (error) {

        console.error(
            '❌ MongoDB Connection Failed:',
            error.message
        );

        process.exit(1);
    }
}

// ============================================================
// 👤 CREATE FIRST ADMIN
// ============================================================

async function createInitialAdmin() {

    try {

        const count =
            await User.countDocuments();

        if (count > 0) {
            return;
        }

        const email =
            process.env.ADMIN_EMAIL;

        const password =
            process.env.ADMIN_PASSWORD;

        const name =
            process.env.ADMIN_NAME ||
            'مدير النظام';

        if (!email || !password) {

            console.warn(
                '⚠️ لا يوجد ADMIN_EMAIL / ADMIN_PASSWORD. لم يتم إنشاء مدير تلقائياً.'
            );

            return;
        }

        const admin =
            new User({
                name,
                email,
                password,
                role: 'مسؤول',
                isActive: true
            });

        await admin.save();

        console.log(
            `✅ تم إنشاء حساب المدير: ${email}`
        );

    } catch (error) {

        console.error(
            '❌ Initial admin error:',
            error.message
        );
    }
}

// ============================================================
// 🚀 START SERVER
// ============================================================

async function startServer() {

    await connectDatabase();

    await createInitialAdmin();

    const server =
        app.listen(PORT, '0.0.0.0', () => {

            console.log('');
            console.log('==========================================');
            console.log('🚢 MARINE SYSTEM');
            console.log('==========================================');
            console.log(`🚀 PORT: ${PORT}`);
            console.log(`🌍 ENV: ${NODE_ENV}`);
            console.log('🗄️ DATABASE: MongoDB');
            console.log('🔐 JWT: Enabled');
            console.log('🛡️ Helmet: Enabled');
            console.log('🚦 Rate Limit: Enabled');
            console.log('📜 Audit Logs: Enabled');
            console.log('==========================================');
            console.log(
                `❤️ Health: /health`
            );
            console.log(
                `🔐 Login: /api/auth/login`
            );
            console.log('==========================================');
            console.log('');

        });

    // ========================================================
    // 🛑 GRACEFUL SHUTDOWN
    // ========================================================

    const shutdown = async signal => {

        console.log(
            `\n🛑 ${signal} - إغلاق الخادم...`
        );

        server.close(async () => {

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
        });
    };

    process.on('SIGTERM', () =>
        shutdown('SIGTERM')
    );

    process.on('SIGINT', () =>
        shutdown('SIGINT')
    );
}

// ============================================================
// 🚀 RUN
// ============================================================

startServer().catch(error => {

    console.error(
        '💥 فشل تشغيل الخادم:',
        error
    );

    process.exit(1);
});

// ============================================================
// EXPORT
// ============================================================

module.exports = app;
