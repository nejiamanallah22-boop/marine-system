// ============================================================
// 🚢 MARINE SYSTEM - SERVER v15.0
// ============================================================
// 🔐 PRODUCTION READY - SECURE EDITION
// ============================================================

'use strict';

// ============================================================
// 📦 DEPENDENCIES
// ============================================================

require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

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
const IS_PRODUCTION = NODE_ENV === 'production';

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NAME = process.env.ADMIN_NAME || 'مدير النظام';

const publicPath = path.join(__dirname, 'public');

// ============================================================
// 🚨 ENVIRONMENT VALIDATION
// ============================================================

console.log('\n' + '='.repeat(60));
console.log('🚢 MARINE SYSTEM v15.0 - PRODUCTION');
console.log('='.repeat(60));

const errors = [];

if (!MONGODB_URI) errors.push('❌ MONGODB_URI is required');
if (!JWT_SECRET || JWT_SECRET.length < 32) errors.push('❌ JWT_SECRET must be at least 32 characters');
if (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET.length < 32) errors.push('❌ JWT_REFRESH_SECRET must be at least 32 characters');

if (IS_PRODUCTION) {
    if (!FRONTEND_URL || FRONTEND_URL === '*') {
        errors.push('❌ FRONTEND_URL must be explicitly set in production');
    }
    if (!ADMIN_EMAIL) errors.push('❌ ADMIN_EMAIL is required in production');
    if (!ADMIN_PASSWORD) errors.push('❌ ADMIN_PASSWORD is required in production');
    if (ADMIN_PASSWORD && ADMIN_PASSWORD.length < 12) {
        errors.push('❌ ADMIN_PASSWORD must be at least 12 characters in production');
    }
}

if (errors.length > 0) {
    errors.forEach(err => console.error(err));
    process.exit(1);
}

console.log(`✅ Environment: ${NODE_ENV}`);
console.log(`✅ Port: ${PORT}`);
console.log(`✅ Frontend URL: ${FRONTEND_URL}`);
console.log('='.repeat(60) + '\n');

// ============================================================
// 🔐 TOKEN HELPERS
// ============================================================

function generateAccessToken(user) {
    return jwt.sign(
        { 
            id: user._id.toString(), 
            name: user.name, 
            email: user.email, 
            role: user.role,
            tokenVersion: user.tokenVersion || 0
        },
        JWT_SECRET,
        { expiresIn: '15m', issuer: 'marine-system' }
    );
}

function generateRefreshToken(user) {
    const jti = crypto.randomBytes(16).toString('hex');
    return jwt.sign(
        { 
            id: user._id.toString(),
            jti: jti
        },
        JWT_REFRESH_SECRET,
        { expiresIn: '7d', issuer: 'marine-system' }
    );
}

function hashRefreshToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function verifyAccessToken(token) {
    return jwt.verify(token, JWT_SECRET, { issuer: 'marine-system' });
}

// ============================================================
// 🔐 SECURITY HELPERS
// ============================================================

function logSecurityEvent(event, userId, req, details = {}) {
    const safeDetails = { ...details };
    delete safeDetails.password;
    delete safeDetails.token;
    delete safeDetails.refreshToken;
    if (safeDetails.identifier) {
        safeDetails.identifier = safeDetails.identifier.substring(0, 3) + '***';
    }

    console.log('🔐 SECURITY:', JSON.stringify({
        timestamp: new Date().toISOString(),
        event,
        userId: userId || 'anonymous',
        ip: req?.ip || 'unknown',
        userAgent: req?.get('user-agent') || 'unknown',
        path: req?.path || 'unknown',
        ...safeDetails
    }));
}

function pickAllowedFields(body, allowedFields) {
    const result = {};
    for (const field of allowedFields) {
        if (body[field] !== undefined) {
            result[field] = body[field];
        }
    }
    return result;
}

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

function cleanUser(user) {
    if (!user) return null;
    return {
        id: user._id?.toString(),
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        preferences: user.preferences || {},
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        tokenVersion: user.tokenVersion || 0
    };
}

// ============================================================
// ✅ VALIDATION FUNCTIONS
// ============================================================

function validateVessel(data, partial = false) {
    const errors = [];
    if (data.name !== undefined) {
        if (!data.name || typeof data.name !== 'string' || data.name.trim().length < 2) {
            errors.push('اسم المركب مطلوب (حرفين على الأقل)');
        }
    } else if (!partial) {
        errors.push('اسم المركب مطلوب');
    }
    if (data.stat && !['صالح', 'معطب', 'صيانة'].includes(data.stat)) {
        errors.push('الحالة غير صالحة');
    }
    if (data.region && !['الشمال', 'الساحل', 'الوسط', 'الجنوب'].includes(data.region)) {
        errors.push('المنطقة غير صالحة');
    }
    return errors;
}

function validateMaintenance(data, partial = false) {
    const errors = [];
    if (data.description !== undefined) {
        if (!data.description || typeof data.description !== 'string' || data.description.trim().length < 3) {
            errors.push('وصف الصيانة مطلوب (3 أحرف على الأقل)');
        }
    } else if (!partial) {
        errors.push('وصف الصيانة مطلوب');
    }
    if (data.technician !== undefined) {
        if (!data.technician || typeof data.technician !== 'string' || data.technician.trim().length < 2) {
            errors.push('اسم الفني مطلوب');
        }
    } else if (!partial) {
        errors.push('اسم الفني مطلوب');
    }
    if (data.cost !== undefined && (typeof data.cost !== 'number' || data.cost < 0)) {
        errors.push('التكلفة يجب أن تكون رقم موجب');
    }
    return errors;
}

async function writeLog({ action, resource, resourceId, resourceModel, user, req, details = {}, status = 'success', error = null }) {
    try {
        if (Log && typeof Log.logAction === 'function') {
            await Log.logAction({
                action, resource, resourceId, resourceModel,
                user: user?._id, userName: user?.name, userEmail: user?.email,
                ipAddress: req?.ip, userAgent: req?.get('user-agent'),
                details, status, error
            });
        }
    } catch (err) {
        console.error('⚠️ Log error:', err.message);
    }
}

// ============================================================
// 🔐 SECURITY MIDDLEWARE
// ============================================================

app.disable('x-powered-by');
app.set('trust proxy', 1);

// ✅ Cookie Parser
app.use(cookieParser());

// ✅ Helmet
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https://*.googleapis.com", "https://*.gstatic.com", "https://*.openstreetmap.org"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "https://*.openstreetmap.org", "https://*.googleapis.com"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// ============================================================
// 🌐 CORS
// ============================================================

const allowedOrigins = FRONTEND_URL ? [FRONTEND_URL] : [];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        console.warn(`⚠️ CORS blocked: ${origin}`);
        return callback(new Error('CORS origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    maxAge: 86400
}));

// ============================================================
// 📦 BODY PARSERS
// ============================================================

app.use(express.json({ limit: '1mb', strict: true }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(compression({ threshold: 1024, level: 6 }));

// ============================================================
// 🚦 RATE LIMITING
// ============================================================

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: IS_PRODUCTION ? 500 : 5000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: req => req.path === '/health',
    message: { success: false, error: 'طلبات كثيرة جداً، حاول لاحقاً' }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'محاولات تسجيل دخول كثيرة، حاول بعد قليل' }
});

const userLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    keyGenerator: (req) => {
        if (req.user?._id) return req.user._id.toString();
        return req.ip || 'anonymous';
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'تجاوزت الحد المسموح من الطلبات' }
});

app.use('/api', globalLimiter);
app.use('/api/auth/login', loginLimiter);

// ============================================================
// 📊 REQUEST LOGGER
// ============================================================

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
});

// ============================================================
// 📁 STATIC FILES
// ============================================================

app.use(express.static(publicPath, {
    index: 'index.html',
    maxAge: IS_PRODUCTION ? '1d' : 0,
    etag: true,
    dotfiles: 'deny'
}));

['css', 'js', 'pages', 'images'].forEach(dir => {
    app.use(`/${dir}`, express.static(path.join(publicPath, dir), {
        maxAge: IS_PRODUCTION ? '1d' : 0
    }));
});

// ============================================================
// 🔐 AUTHENTICATION
// ============================================================

async function authenticate(req, res, next) {
    try {
        // ✅ محاولة قراءة التوكن من Cookie أولاً
        let token = req.cookies?.auth_token;
        
        // ✅ إذا لم يكن في Cookie، حاول من Authorization header
        if (!token) {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7).trim();
            }
        }

        if (!token) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }

        let decoded;
        try {
            decoded = verifyAccessToken(token);
        } catch (error) {
            logSecurityEvent('token_verification_failed', null, req, { error: error.name });
            return res.status(401).json({
                success: false,
                error: error.name === 'TokenExpiredError' 
                    ? 'انتهت الجلسة، يرجى تسجيل الدخول من جديد' 
                    : 'رمز الدخول غير صالح'
            });
        }

        if (!decoded?.id || !isValidObjectId(decoded.id)) {
            return res.status(401).json({ success: false, error: 'رمز الدخول غير صالح' });
        }

        const user = await User.findById(decoded.id).select('+password +refreshToken');
        if (!user) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود' });
        }

        if (!user.isActive) {
            return res.status(403).json({ success: false, error: 'الحساب معطل' });
        }

        if (user.isLocked) {
            return res.status(423).json({ success: false, error: 'الحساب مقفل مؤقتاً' });
        }

        if (decoded.tokenVersion !== undefined && user.tokenVersion !== undefined) {
            if (decoded.tokenVersion !== user.tokenVersion) {
                logSecurityEvent('token_version_mismatch', user._id, req, {
                    tokenVersion: decoded.tokenVersion,
                    userVersion: user.tokenVersion
                });
                return res.status(401).json({ 
                    success: false, 
                    error: 'انتهت الجلسة، يرجى تسجيل الدخول من جديد' 
                });
            }
        }

        if (decoded.iat && typeof user.changedPasswordAfter === 'function' && user.changedPasswordAfter(decoded.iat)) {
            return res.status(401).json({ success: false, error: 'تم تغيير كلمة المرور، يرجى تسجيل الدخول من جديد' });
        }

        req.user = user;
        
        userLimiter(req, res, () => {
            next();
        });

    } catch (error) {
        console.error('❌ Authentication error:', error);
        return res.status(401).json({ success: false, error: 'فشل التحقق من الهوية' });
    }
}

function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }
        if (!roles.includes(req.user.role)) {
            logSecurityEvent('authorization_failed', req.user._id, req, { required: roles, userRole: req.user.role });
            return res.status(403).json({ success: false, error: 'ليس لديك صلاحية' });
        }
        next();
    };
}

// ============================================================
// ❤️ HEALTH
// ============================================================

app.get('/health', (req, res) => {
    const dbState = mongoose.connection.readyState;
    const isHealthy = dbState === 1;
    res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'ok' : 'degraded',
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// 🔐 AUTH ROUTES
// ============================================================

app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const start = Date.now();
    try {
        const identifier = String(req.body.username || req.body.email || req.body.identifier || '').trim().toLowerCase();
        const password = String(req.body.password || '');

        logSecurityEvent('login_attempt', null, req, { identifier: identifier.substring(0, 3) + '***' });

        if (!identifier || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'اسم المستخدم وكلمة المرور مطلوبان' 
            });
        }

        const user = await User.findOne({
            $or: [
                { email: identifier },
                { username: identifier }
            ]
        }).select('+password +refreshToken');

        if (!user) {
            logSecurityEvent('login_failed_user_not_found', null, req);
            return res.status(401).json({ 
                success: false, 
                error: 'بيانات الدخول غير صحيحة' 
            });
        }

        if (!user.isActive) {
            logSecurityEvent('login_failed_inactive', user._id, req);
            return res.status(403).json({ 
                success: false, 
                error: 'الحساب معطل' 
            });
        }

        if (user.isLocked) {
            logSecurityEvent('login_failed_locked', user._id, req);
            return res.status(423).json({ 
                success: false, 
                error: 'الحساب مقفل مؤقتاً' 
            });
        }

        const isValid = await user.comparePassword(password);
        if (!isValid) {
            logSecurityEvent('login_failed_password', user._id, req);
            if (typeof user.incrementLoginAttempts === 'function') {
                await user.incrementLoginAttempts();
            }
            return res.status(401).json({ 
                success: false, 
                error: 'بيانات الدخول غير صحيحة' 
            });
        }

        if (typeof user.resetLoginAttempts === 'function') {
            await user.resetLoginAttempts();
        }

        user.lastLogin = new Date();
        user.tokenVersion = (user.tokenVersion || 0) + 1;

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);
        user.refreshToken = hashRefreshToken(refreshToken);
        await user.save();

        // ✅ إرسال التوكنات في HttpOnly Cookies
        res.cookie('auth_token', accessToken, {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000
        });

        res.cookie('refresh_token', refreshToken, {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        logSecurityEvent('login_success', user._id, req);

        await writeLog({
            action: 'login',
            resource: 'user',
            resourceId: user._id,
            resourceModel: 'User',
            user,
            req,
            details: { duration: Date.now() - start }
        });

        res.json({
            success: true,
            user: cleanUser(user)
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        logSecurityEvent('login_error', null, req, { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: IS_PRODUCTION ? 'حدث خطأ في الخادم' : error.message 
        });
    }
});

app.post('/api/auth/refresh', async (req, res) => {
    try {
        const refreshToken = req.cookies?.refresh_token || req.body.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ success: false, error: 'Refresh token مطلوب' });
        }

        let decoded;
        try {
            decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, { issuer: 'marine-system' });
        } catch {
            return res.status(401).json({ success: false, error: 'Refresh token غير صالح' });
        }

        if (!decoded?.id || !isValidObjectId(decoded.id)) {
            return res.status(401).json({ success: false, error: 'Refresh token غير صالح' });
        }

        const user = await User.findById(decoded.id).select('+refreshToken +tokenVersion');
        if (!user || !user.isActive) {
            return res.status(401).json({ success: false, error: 'Refresh token غير صالح' });
        }

        const hashedToken = hashRefreshToken(refreshToken);
        if (!user.refreshToken || user.refreshToken !== hashedToken) {
            logSecurityEvent('refresh_token_reuse_detected', user._id, req, { jti: decoded.jti });
            user.tokenVersion = (user.tokenVersion || 0) + 1;
            user.refreshToken = undefined;
            await user.save();
            return res.status(401).json({ 
                success: false, 
                error: 'Refresh token غير صالح - تم إلغاء الجلسة' 
            });
        }

        const accessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);
        user.refreshToken = hashRefreshToken(newRefreshToken);
        await user.save();

        res.cookie('auth_token', accessToken, {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000
        });

        res.cookie('refresh_token', newRefreshToken, {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({ success: true });

    } catch (error) {
        console.error('❌ Refresh error:', error);
        res.status(500).json({ success: false, error: 'فشل تحديث الجلسة' });
    }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
    try {
        logSecurityEvent('logout', req.user._id, req);
        req.user.tokenVersion = (req.user.tokenVersion || 0) + 1;
        req.user.refreshToken = undefined;
        await req.user.save();

        // ✅ حذف Cookies
        res.clearCookie('auth_token');
        res.clearCookie('refresh_token');

        await writeLog({ action: 'logout', resource: 'user', resourceId: req.user._id, resourceModel: 'User', user: req.user, req });
        res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ success: false, error: 'فشل تسجيل الخروج' });
    }
});

app.get('/api/auth/me', authenticate, (req, res) => {
    res.json({ success: true, user: cleanUser(req.user) });
});

// ============================================================
// 👥 USERS
// ============================================================

app.get('/api/users', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [users, total] = await Promise.all([
            User.find().select('-password -refreshToken').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
            User.countDocuments()
        ]);
        
        res.json({ 
            success: true, 
            users,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'فشل تحميل المستخدمين' });
    }
});

app.post('/api/users', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const allowedFields = ['name', 'username', 'email', 'password', 'role', 'isActive'];
        const data = pickAllowedFields(req.body, allowedFields);

        if (!data.name || !data.password || (!data.email && !data.username)) {
            return res.status(400).json({ success: false, error: 'الاسم وكلمة المرور والبريد الإلكتروني مطلوبون' });
        }

        const normalizedEmail = data.email ? String(data.email).trim().toLowerCase() : undefined;
        const normalizedUsername = data.username ? String(data.username).trim().toLowerCase() : undefined;

        if (normalizedEmail) {
            const exists = await User.findOne({ email: normalizedEmail });
            if (exists) return res.status(409).json({ success: false, error: 'البريد الإلكتروني موجود مسبقاً' });
        }
        if (normalizedUsername) {
            const exists = await User.findOne({ username: normalizedUsername });
            if (exists) return res.status(409).json({ success: false, error: 'اسم المستخدم موجود مسبقاً' });
        }

        const allowedRoles = ['مسؤول', 'محرر', 'مستخدم', 'مشاهد'];
        const user = new User({
            name: data.name,
            username: normalizedUsername,
            email: normalizedEmail,
            password: data.password,
            role: allowedRoles.includes(data.role) ? data.role : 'مستخدم',
            isActive: typeof data.isActive === 'boolean' ? data.isActive : true
        });

        await user.save();
        logSecurityEvent('user_created', req.user._id, req, { newUser: user.email });
        await writeLog({ action: 'create', resource: 'user', resourceId: user._id, resourceModel: 'User', user: req.user, req });

        res.status(201).json({ success: true, user: cleanUser(user) });
    } catch (error) {
        res.status(400).json({ success: false, error: 'فشل إنشاء المستخدم' });
    }
});

app.put('/api/users/:id', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ success: false, error: 'معرف المستخدم غير صالح' });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }

        if (user.role === 'مسؤول') {
            const adminCount = await User.countDocuments({ role: 'مسؤول', isActive: true });
            if (adminCount <= 1 && req.body.isActive === false) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'لا يمكن تعطيل المسؤول الوحيد في النظام' 
                });
            }
        }

        const allowedFields = ['name', 'username', 'email', 'password', 'role', 'isActive', 'preferences'];
        const data = pickAllowedFields(req.body, allowedFields);

        if (data.email) {
            const normalizedEmail = String(data.email).trim().toLowerCase();
            const existing = await User.findOne({ 
                email: normalizedEmail, 
                _id: { $ne: id } 
            });
            if (existing) {
                return res.status(409).json({ success: false, error: 'البريد الإلكتروني مستخدم من قبل' });
            }
            data.email = normalizedEmail;
        }

        if (data.username) {
            const normalizedUsername = String(data.username).trim().toLowerCase();
            const existing = await User.findOne({ 
                username: normalizedUsername, 
                _id: { $ne: id } 
            });
            if (existing) {
                return res.status(409).json({ success: false, error: 'اسم المستخدم مستخدم من قبل' });
            }
            data.username = normalizedUsername;
        }

        let passwordChanged = false;
        let roleChanged = false;
        let activeChanged = false;

        if (data.name !== undefined) user.name = data.name;
        if (data.username !== undefined) user.username = data.username;
        if (data.email !== undefined) user.email = data.email;
        if (data.password) {
            user.password = data.password;
            passwordChanged = true;
        }
        if (data.role !== undefined) {
            const allowedRoles = ['مسؤول', 'محرر', 'مستخدم', 'مشاهد'];
            if (!allowedRoles.includes(data.role)) {
                return res.status(400).json({ success: false, error: 'الدور غير صالح' });
            }
            if (user.role === 'مسؤول' || data.role === 'مسؤول') {
                logSecurityEvent('admin_role_change', req.user._id, req, {
                    targetUser: user.email,
                    oldRole: user.role,
                    newRole: data.role
                });
            }
            user.role = data.role;
            roleChanged = true;
        }
        if (typeof data.isActive === 'boolean') {
            user.isActive = data.isActive;
            activeChanged = true;
        }
        if (data.preferences) {
            user.preferences = { ...(user.preferences || {}), ...data.preferences };
        }

        if (passwordChanged || roleChanged || activeChanged) {
            user.tokenVersion = (user.tokenVersion || 0) + 1;
            user.refreshToken = undefined;
        }

        await user.save();

        logSecurityEvent('user_updated', req.user._id, req, { 
            updatedUser: user.email,
            passwordChanged,
            roleChanged,
            activeChanged
        });
        await writeLog({ action: 'update', resource: 'user', resourceId: user._id, resourceModel: 'User', user: req.user, req });

        res.json({ success: true, user: cleanUser(user) });
    } catch (error) {
        res.status(400).json({ success: false, error: 'فشل تحديث المستخدم' });
    }
});

app.delete('/api/users/:id', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const { id } = req.params;
        if (String(req.user._id) === String(id)) {
            return res.status(400).json({ success: false, error: 'لا يمكنك حذف حسابك بنفسك' });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }

        if (user.role === 'مسؤول') {
            const adminCount = await User.countDocuments({ role: 'مسؤول' });
            if (adminCount <= 1) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'لا يمكن حذف المسؤول الوحيد في النظام' 
                });
            }
        }

        await user.deleteOne();

        logSecurityEvent('user_deleted', req.user._id, req, { deletedUser: user.email });
        await writeLog({ action: 'delete', resource: 'user', resourceId: user._id, resourceModel: 'User', user: req.user, req });

        res.json({ success: true, message: 'تم حذف المستخدم' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'فشل حذف المستخدم' });
    }
});

// ============================================================
// 🚢 VESSELS
// ============================================================

app.get('/api/vessels', authenticate, async (req, res) => {
    try {
        const { page = 1, limit = 100, status, region } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const filter = {};
        if (status) filter.stat = status;
        if (region) filter.region = region;

        if (req.user.role === 'مشاهد') {
            filter.stat = 'صالح';
        }

        const [vessels, total] = await Promise.all([
            Vessel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
            Vessel.countDocuments(filter)
        ]);
        
        res.json({ 
            success: true, 
            vessels,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'فشل تحميل المراكب' });
    }
});

app.get('/api/vessels/stats', authenticate, async (req, res) => {
    try {
        const statusStats = await Vessel.aggregate([
            { $group: { _id: '$stat', count: { $sum: 1 } } }
        ]);
        const categoryStats = await Vessel.aggregate([
            { $group: { _id: '$cat', count: { $sum: 1 } } }
        ]);
        res.json({ success: true, status: statusStats, categories: categoryStats });
    } catch (error) {
        res.status(500).json({ success: false, error: 'فشل تحميل إحصائيات المراكب' });
    }
});

app.get('/api/vessels/:id', authenticate, async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'معرف المركب غير صالح' });
        }
        const vessel = await Vessel.findById(req.params.id);
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'المركب غير موجود' });
        }
        res.json({ success: true, vessel });
    } catch (error) {
        res.status(500).json({ success: false, error: 'فشل تحميل المركب' });
    }
});

app.post('/api/vessels', authenticate, authorize('مسؤول', 'محرر'), async (req, res) => {
    try {
        const allowedFields = ['name', 'num', 'stat', 'zone', 'port', 'supp', 'region', 'cat', 'len'];
        const data = pickAllowedFields(req.body, allowedFields);

        const errors = validateVessel(data, false);
        if (errors.length > 0) {
            return res.status(400).json({ success: false, errors });
        }

        const vessel = new Vessel(data);
        await vessel.save();
        await writeLog({ action: 'create', resource: 'vessel', resourceId: vessel._id, resourceModel: 'Vessel', resourceName: vessel.name, user: req.user, req });
        res.status(201).json({ success: true, vessel });
    } catch (error) {
        res.status(400).json({ success: false, error: 'فشل إضافة المركب' });
    }
});

app.put('/api/vessels/:id', authenticate, authorize('مسؤول', 'محرر'), async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'معرف المركب غير صالح' });
        }

        const allowedFields = ['name', 'num', 'stat', 'zone', 'port', 'supp', 'region', 'cat', 'len'];
        const data = pickAllowedFields(req.body, allowedFields);

        const errors = validateVessel(data, true);
        if (errors.length > 0) {
            return res.status(400).json({ success: false, errors });
        }

        const vessel = await Vessel.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'المركب غير موجود' });
        }
        await writeLog({ action: 'update', resource: 'vessel', resourceId: vessel._id, resourceModel: 'Vessel', resourceName: vessel.name, user: req.user, req });
        res.json({ success: true, vessel });
    } catch (error) {
        res.status(400).json({ success: false, error: 'فشل تحديث المركب' });
    }
});

app.delete('/api/vessels/:id', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'معرف المركب غير صالح' });
        }
        const vessel = await Vessel.findByIdAndDelete(req.params.id);
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'المركب غير موجود' });
        }
        await writeLog({ action: 'delete', resource: 'vessel', resourceId: vessel._id, resourceModel: 'Vessel', resourceName: vessel.name, user: req.user, req });
        res.json({ success: true, message: 'تم حذف المركب' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'فشل حذف المركب' });
    }
});

// ============================================================
// 🔧 MAINTENANCE
// ============================================================

app.get('/api/maintenance', authenticate, async (req, res) => {
    try {
        const { page = 1, limit = 50, status, vesselId } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const filter = {};
        if (status) filter.status = status;
        if (vesselId) filter.vesselId = vesselId;

        if (req.user.role === 'مشاهد') {
            filter.status = 'مكتملة';
        }

        const [records, total] = await Promise.all([
            Maintenance.find(filter)
                .populate('vesselId', 'name num cat stat')
                .populate('supervisor', 'name email')
                .sort({ startDate: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Maintenance.countDocuments(filter)
        ]);
        
        res.json({ 
            success: true, 
            maintenance: records,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'فشل تحميل سجلات الصيانة' });
    }
});

app.get('/api/maintenance/stats', authenticate, async (req, res) => {
    try {
        const stats = await Maintenance.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, error: 'فشل تحميل إحصائيات الصيانة' });
    }
});

app.get('/api/maintenance/vessel/:vesselId', authenticate, async (req, res) => {
    try {
        if (!isValidObjectId(req.params.vesselId)) {
            return res.status(400).json({ success: false, error: 'معرف المركب غير صالح' });
        }
        const records = await Maintenance.find({ vesselId: req.params.vesselId }).sort({ startDate: -1 });
        res.json({ success: true, maintenance: records });
    } catch (error) {
        res.status(500).json({ success: false, error: 'فشل تحميل سجلات الصيانة' });
    }
});

app.post('/api/maintenance', authenticate, authorize('مسؤول', 'محرر'), async (req, res) => {
    try {
        const allowedFields = [
            'vesselId', 'vesselName', 'type', 'unit', 'technician', 
            'description', 'repair', 'faultType', 'cost', 'notes', 
            'parts', 'status', 'date', 'startDate', 'endDate'
        ];
        const data = pickAllowedFields(req.body, allowedFields);

        data.supervisor = req.user._id;

        const errors = validateMaintenance(data, false);
        if (errors.length > 0) {
            return res.status(400).json({ success: false, errors });
        }

        const record = new Maintenance(data);
        await record.save();
        await writeLog({ action: 'create', resource: 'maintenance', resourceId: record._id, resourceModel: 'Maintenance', user: req.user, req });
        res.status(201).json({ success: true, maintenance: record });
    } catch (error) {
        res.status(400).json({ success: false, error: 'فشل إضافة سجل الصيانة' });
    }
});

app.put('/api/maintenance/:id', authenticate, authorize('مسؤول', 'محرر'), async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'معرف الصيانة غير صالح' });
        }

        const allowedFields = [
            'vesselId', 'vesselName', 'type', 'unit', 'technician', 
            'description', 'repair', 'faultType', 'cost', 'notes', 
            'parts', 'status', 'date', 'startDate', 'endDate'
        ];
        const data = pickAllowedFields(req.body, allowedFields);

        const errors = validateMaintenance(data, true);
        if (errors.length > 0) {
            return res.status(400).json({ success: false, errors });
        }

        const record = await Maintenance.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
        if (!record) {
            return res.status(404).json({ success: false, error: 'سجل الصيانة غير موجود' });
        }
        await writeLog({ action: 'update', resource: 'maintenance', resourceId: record._id, resourceModel: 'Maintenance', user: req.user, req });
        res.json({ success: true, maintenance: record });
    } catch (error) {
        res.status(400).json({ success: false, error: 'فشل تحديث سجل الصيانة' });
    }
});

app.delete('/api/maintenance/:id', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'معرف الصيانة غير صالح' });
        }
        const record = await Maintenance.findByIdAndDelete(req.params.id);
        if (!record) {
            return res.status(404).json({ success: false, error: 'سجل الصيانة غير موجود' });
        }
        await writeLog({ action: 'delete', resource: 'maintenance', resourceId: record._id, resourceModel: 'Maintenance', user: req.user, req });
        res.json({ success: true, message: 'تم حذف سجل الصيانة' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'فشل حذف سجل الصيانة' });
    }
});

// ============================================================
// 📊 DASHBOARD
// ============================================================

app.get('/api/dashboard', authenticate, async (req, res) => {
    try {
        const [totalVessels, activeMaintenance, openTickets, publishedNotes, validVessels, damagedVessels, maintenanceVessels] = await Promise.all([
            Vessel.countDocuments(),
            Maintenance.countDocuments({ status: { $in: ['معلقة', 'قيد التنفيذ'] } }),
            Ticket.countDocuments({ status: { $ne: 'مغلق' } }),
            Note.countDocuments({ status: 'منشورة' }),
            Vessel.countDocuments({ stat: 'صالح' }),
            Vessel.countDocuments({ stat: 'معطب' }),
            Vessel.countDocuments({ stat: 'صيانة' })
        ]);

        res.json({
            success: true,
            data: {
                vessels: { total: totalVessels, valid: validVessels, damaged: damagedVessels, maintenance: maintenanceVessels },
                activeMaintenance,
                openTickets,
                publishedNotes
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'فشل تحميل لوحة التحكم' });
    }
});

// ============================================================
// 📝 NOTES
// ============================================================

app.get('/api/notes', authenticate, async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const filter = {};
        if (req.user.role === 'مشاهد') {
            filter.status = 'منشورة';
        }

        const [notes, total] = await Promise.all([
            Note.find(filter)
                .populate('createdBy', 'name email')
                .populate('approvedBy', 'name email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Note.countDocuments(filter)
        ]);
        
        res.json({ 
            success: true, 
            notes,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'فشل تحميل المذكرات' });
    }
});

app.post('/api/notes', authenticate, authorize('مسؤول', 'محرر'), async (req, res) => {
    try {
        const allowedFields = ['title', 'content', 'status'];
        const data = pickAllowedFields(req.body, allowedFields);

        if (!data.title || !data.content) {
            return res.status(400).json({ success: false, error: 'العنوان والمحتوى مطلوبان' });
        }

        const note = new Note({
            ...data,
            createdBy: req.user._id,
            createdByName: req.user.name
        });
        await note.save();
        await writeLog({ action: 'create', resource: 'note', resourceId: note._id, resourceModel: 'Note', resourceName: note.title, user: req.user, req });
        res.status(201).json({ success: true, note });
    } catch (error) {
        res.status(400).json({ success: false, error: 'فشل إنشاء المذكرة' });
    }
});

// ============================================================
// 🎫 TICKETS
// ============================================================

app.get('/api/tickets', authenticate, async (req, res) => {
    try {
        const { page = 1, limit = 50, status } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const filter = {};
        if (status) filter.status = status;

        if (req.user.role === 'مشاهد') {
            filter.status = 'مغلق';
        } else if (req.user.role === 'مستخدم') {
            filter.$or = [
                { createdBy: req.user._id },
                { assignedTo: req.user._id }
            ];
        }

        const [tickets, total] = await Promise.all([
            Ticket.find(filter)
                .populate('createdBy', 'name email')
                .populate('assignedTo', 'name email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Ticket.countDocuments(filter)
        ]);
        
        res.json({ 
            success: true, 
            tickets,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'فشل تحميل التذاكر' });
    }
});

app.post('/api/tickets', authenticate, async (req, res) => {
    try {
        const allowedFields = ['title', 'message', 'priority', 'assignedTo'];
        const data = pickAllowedFields(req.body, allowedFields);

        if (!data.title || !data.message) {
            return res.status(400).json({ success: false, error: 'العنوان والرسالة مطلوبان' });
        }

        const ticket = new Ticket({
            ...data,
            createdBy: req.user._id,
            createdByName: req.user.name
        });
        await ticket.save();
        await writeLog({ action: 'create', resource: 'ticket', resourceId: ticket._id, resourceModel: 'Ticket', resourceName: ticket.title, user: req.user, req });
        res.status(201).json({ success: true, ticket });
    } catch (error) {
        res.status(400).json({ success: false, error: 'فشل إنشاء التذكرة' });
    }
});

// ============================================================
// ❌ API 404
// ============================================================

app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: 'API غير موجود', path: req.originalUrl });
});

// ============================================================
// 🌐 FRONTEND FALLBACK
// ============================================================

app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    res.sendFile(indexPath, error => {
        if (error) {
            console.error('Frontend error:', error.message);
            if (!res.headersSent) {
                res.status(404).send('Marine System - الصفحة غير موجودة');
            }
        }
    });
});

// ============================================================
// 💥 GLOBAL ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
    console.error('💥 SERVER ERROR:', err);

    if (res.headersSent) return next(err);

    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: 'بيانات غير صالحة',
            details: Object.values(err.errors || {}).map(e => e.message)
        });
    }

    if (err.name === 'CastError') {
        return res.status(400).json({ success: false, error: 'معرف غير صالح' });
    }

    if (err.code === 11000) {
        return res.status(409).json({ success: false, error: 'القيمة موجودة مسبقاً' });
    }

    if (err.message === 'CORS origin not allowed') {
        return res.status(403).json({ success: false, error: 'Origin غير مسموح' });
    }

    res.status(500).json({
        success: false,
        error: IS_PRODUCTION ? 'حدث خطأ داخلي في الخادم' : err.message
    });
});

// ============================================================
// 🗄️ DATABASE
// ============================================================

async function connectDatabase() {
    console.log('🗄️ Connecting to MongoDB...');
    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 45000,
            maxPoolSize: 20,
            minPoolSize: 2,
            retryWrites: true
        });
        console.log('✅ MongoDB Connected');
        console.log(`📚 Database: ${mongoose.connection.name}`);
        
        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️ MongoDB disconnected');
        });
        
        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB reconnected');
        });

    } catch (error) {
        console.error('❌ MongoDB Connection Failed:', error.message);
        throw error;
    }
}

// ============================================================
// 👤 INITIAL ADMIN
// ============================================================

async function createInitialAdmin() {
    try {
        if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
            if (IS_PRODUCTION) {
                console.error('❌ ADMIN_EMAIL and ADMIN_PASSWORD are required in production');
                process.exit(1);
            }
            console.log('ℹ️ ADMIN_EMAIL / ADMIN_PASSWORD not set, skipping admin creation');
            return;
        }

        if (ADMIN_PASSWORD.length < 12) {
            console.error('❌ ADMIN_PASSWORD must be at least 12 characters');
            process.exit(1);
        }

        const adminEmail = String(ADMIN_EMAIL).trim().toLowerCase();
        if (!adminEmail.includes('@')) {
            console.error('❌ ADMIN_EMAIL must be a valid email');
            process.exit(1);
        }

        const existing = await User.findOne({ email: adminEmail });
        if (existing) {
            console.log('ℹ️ Admin account already exists');
            return;
        }

        const admin = new User({
            name: ADMIN_NAME,
            email: adminEmail,
            password: ADMIN_PASSWORD,
            role: 'مسؤول',
            isActive: true,
            tokenVersion: 1
        });

        await admin.save();
        console.log(`✅ Admin created: ${adminEmail}`);
        console.log('⚠️ Please change the admin password immediately after first login');
    } catch (error) {
        console.error('❌ Initial admin error:', error.message);
        if (IS_PRODUCTION) {
            process.exit(1);
        }
    }
}

// ============================================================
// 🚀 START SERVER
// ============================================================

async function startServer() {
    try {
        await connectDatabase();
        await createInitialAdmin();

        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log('\n' + '='.repeat(60));
            console.log('🚢 MARINE SYSTEM v15.0 - PRODUCTION READY');
            console.log('='.repeat(60));
            console.log(`🚀 PORT: ${PORT}`);
            console.log(`🌍 ENV: ${NODE_ENV}`);
            console.log('🗄️ DATABASE: MongoDB');
            console.log('🔐 JWT: ENABLED (15min access)');
            console.log('🍪 HTTPONLY COOKIES: ENABLED');
            console.log('🔄 TOKEN VERSION: ENABLED');
            console.log('🛡️ HELMET + CSP: ENABLED');
            console.log('🚦 RATE LIMIT: ENABLED');
            console.log('📜 AUDIT LOGS: ENABLED');
            console.log('🔐 SECURITY LOGGING: ENABLED');
            console.log('✅ INPUT VALIDATION: ENABLED');
            console.log('🔑 REFRESH TOKEN HASH: ENABLED');
            console.log('🔄 REFRESH TOKEN REUSE DETECTION: ENABLED');
            console.log('📝 PARTIAL VALIDATION: ENABLED');
            console.log('📊 PAGINATION: ENABLED');
            console.log('🔒 DATA-LEVEL RBAC: ENABLED');
            console.log('🛡️ ADMIN PROTECTION: ENABLED');
            console.log(`❤️ HEALTH: /health`);
            console.log(`🔐 LOGIN: /api/auth/login`);
            console.log(`🌐 FRONTEND: ${FRONTEND_URL}`);
            console.log('='.repeat(60) + '\n');
        });

        let shuttingDown = false;
        const shutdown = async (signal) => {
            if (shuttingDown) return;
            shuttingDown = true;
            console.log(`🛑 ${signal} - Shutting down...`);
            server.close(async () => {
                try {
                    await mongoose.connection.close();
                    console.log('✅ MongoDB closed');
                    process.exit(0);
                } catch (error) {
                    console.error('❌ Shutdown error:', error);
                    process.exit(1);
                }
            });
            setTimeout(() => process.exit(1), 10000).unref();
        };

        process.once('SIGTERM', () => shutdown('SIGTERM'));
        process.once('SIGINT', () => shutdown('SIGINT'));

    } catch (error) {
        console.error('💥 Failed to start Marine System:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;
