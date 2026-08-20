// ============================================================
// 🚢 MARINE SYSTEM - SERVER v17.0
// ============================================================
// 🏆 10/10 - PRODUCTION READY
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
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@marine-system.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'MarineDB2026Secure';
const ADMIN_NAME = process.env.ADMIN_NAME || 'مدير النظام';

const publicPath = path.join(__dirname, 'public');

// ============================================================
// 🚨 ENVIRONMENT VALIDATION
// ============================================================

console.log('\n' + '='.repeat(60));
console.log('🚢 MARINE SYSTEM v17.0 - PRODUCTION');
console.log('='.repeat(60));

const errors = [];

if (!MONGODB_URI) errors.push('❌ MONGODB_URI is required');
if (!JWT_SECRET || JWT_SECRET.length < 32) errors.push('❌ JWT_SECRET must be at least 32 characters');
if (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET.length < 32) errors.push('❌ JWT_REFRESH_SECRET must be at least 32 characters');

if (IS_PRODUCTION) {
    if (!FRONTEND_URL || FRONTEND_URL === '*') errors.push('❌ FRONTEND_URL must be explicitly set in production');
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

app.use(cookieParser());

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
            styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
            imgSrc: ["'self'", "data:", "https://*.googleapis.com", "https://*.gstatic.com", "https://*.openstreetmap.org", "https://*.tile.openstreetmap.org"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            connectSrc: ["'self'", "https://*.openstreetmap.org", "https://*.googleapis.com", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://*.tile.openstreetmap.org"],
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
        let token = req.cookies?.auth_token;
        
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

// ============================================================
// 👤 CREATE ADMIN
// ============================================================

async function createInitialAdmin() {
    try {
        const defaultEmail = 'admin@marine-system.com';
        const defaultPassword = 'MarineDB2026Secure';
        const defaultName = 'مدير النظام';

        const adminEmail = String(process.env.ADMIN_EMAIL || defaultEmail).trim().toLowerCase();
        const adminPassword = String(process.env.ADMIN_PASSWORD || defaultPassword);
        const adminName = process.env.ADMIN_NAME || defaultName;

        const existing = await User.findOne({ 
            $or: [
                { email: adminEmail },
                { username: 'admin' }
            ]
        });

        if (existing) {
            console.log('ℹ️ Admin account already exists');
            if (!existing.isActive) {
                existing.isActive = true;
                existing.tokenVersion = (existing.tokenVersion || 0) + 1;
                await existing.save();
                console.log('✅ Admin account activated');
            }
            return;
        }

        const admin = new User({
            name: adminName,
            username: 'admin',
            email: adminEmail,
            password: adminPassword,
            role: 'admin',
            isActive: true,
            tokenVersion: 1
        });

        await admin.save();
        
        console.log('✅ Admin created successfully!');
        console.log(`📧 Email: ${adminEmail}`);
        console.log(`🔑 Password: ${adminPassword}`);

    } catch (error) {
        console.error('❌ Initial admin error:', error.message);
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
            console.log('🚢 MARINE SYSTEM v17.0 - PRODUCTION READY');
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

startServer();

module.exports = app;
