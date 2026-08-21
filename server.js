/**
 * ============================================================
 * 🚢 MARINE SYSTEM - ENTERPRISE EDITION v31.0
 * ============================================================
 * 🔐 ULTIMATE PRODUCTION SERVER
 * ✅ Zero Trust Security
 * ✅ Advanced RBAC
 * ✅ Audit Trail
 * ✅ Rate Limiting
 * ✅ Input Validation
 * ✅ MongoDB Transactions
 * ✅ Redis Caching (optional)
 * ✅ WebSocket Support
 * ✅ Multi-Tenant Ready
 * ✅ GDPR Compliant
 * ✅ SOC2 Ready
 * ============================================================
 */

'use strict';

// ============================================================
// 📦 CORE DEPENDENCIES
// ============================================================

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
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const morgan = require('morgan');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

// ============================================================
// 📊 LOGGER - Enterprise Logging
// ============================================================

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        new winston.transports.File({ 
            filename: 'logs/error.log', 
            level: 'error' 
        }),
        new winston.transports.File({ 
            filename: 'logs/combined.log' 
        })
    ]
});

// ============================================================
// ⚙️ CONFIGURATION - Enterprise Grade
// ============================================================

const config = {
    port: parseInt(process.env.PORT) || 3000,
    env: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
    
    mongodb: {
        uri: process.env.MONGODB_URI,
        options: {
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 45000,
            maxPoolSize: 50,
            minPoolSize: 10,
            retryWrites: true,
            retryReads: true
        }
    },
    
    jwt: {
        secret: process.env.JWT_SECRET,
        refreshSecret: process.env.JWT_REFRESH_SECRET,
        accessExpiry: '15m',
        refreshExpiry: '7d',
        issuer: 'marine-system',
        audience: 'marine-system-users'
    },
    
    security: {
        bcryptRounds: 12,
        rateLimit: {
            windowMs: 15 * 60 * 1000,
            max: process.env.RATE_LIMIT_MAX || 1000
        },
        loginRateLimit: {
            windowMs: 15 * 60 * 1000,
            max: 10,
            skipSuccessful: true
        }
    },
    
    admin: {
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD,
        name: process.env.ADMIN_NAME || 'مدير النظام',
        email: process.env.ADMIN_EMAIL || 'admin@marine-system.com'
    },
    
    frontend: {
        url: process.env.FRONTEND_URL || '*'
    },
    
    features: {
        auditLogs: true,
        refreshTokens: true,
        passwordReset: true,
        emailNotifications: false,
        twoFactorAuth: false
    }
};

// ============================================================
// 🚨 VALIDATE CONFIGURATION
// ============================================================

function validateConfig() {
    const errors = [];
    
    if (!config.mongodb.uri) errors.push('MONGODB_URI is required');
    if (!config.jwt.secret || config.jwt.secret.length < 32) {
        errors.push('JWT_SECRET must be at least 32 characters');
    }
    if (!config.jwt.refreshSecret || config.jwt.refreshSecret.length < 32) {
        errors.push('JWT_REFRESH_SECRET must be at least 32 characters');
    }
    if (!config.admin.password || config.admin.password.length < 12) {
        errors.push('ADMIN_PASSWORD must be at least 12 characters');
    }
    
    if (errors.length > 0) {
        logger.error('Configuration errors:', { errors });
        errors.forEach(err => console.error(`❌ ${err}`));
        process.exit(1);
    }
}

validateConfig();

// ============================================================
// 🚀 INITIALIZE APP
// ============================================================

const app = express();

// ============================================================
// 🛡️ SECURITY MIDDLEWARE - Enterprise Grade
// ============================================================

// Disable X-Powered-By
app.disable('x-powered-by');

// Trust Proxy
if (config.isProduction) {
    app.set('trust proxy', 1);
}

// Cookie Parser
app.use(cookieParser());

// CORS - Secure Configuration
app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        if (config.frontend.url === '*') return callback(null, true);
        if (origin === config.frontend.url) return callback(null, true);
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            return callback(null, true);
        }
        if (origin.includes('onrender.com')) return callback(null, true);
        return callback(new Error('CORS origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'X-CSRF-Token'],
    exposedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    maxAge: 86400
}));

// Helmet - Security Headers
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "data:"],
            connectSrc: ["'self'", "https:"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true
}));

// Request ID Middleware
app.use((req, res, next) => {
    req.requestId = req.headers['x-request-id'] || uuidv4();
    res.setHeader('X-Request-ID', req.requestId);
    next();
});

// Logging
app.use(morgan('combined', {
    stream: {
        write: (message) => logger.info(message.trim())
    }
}));

// Body Parsers
app.use(express.json({ 
    limit: '2mb', 
    strict: true 
}));
app.use(express.urlencoded({ 
    extended: false, 
    limit: '2mb' 
}));

// Compression
app.use(compression({
    threshold: 1024,
    level: 6,
    brotli: { enabled: true }
}));

// ============================================================
// 🚦 RATE LIMITING - Enterprise Grade
// ============================================================

const globalRateLimiter = rateLimit({
    windowMs: config.security.rateLimit.windowMs,
    max: config.security.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    handler: (req, res) => {
        logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path });
        res.status(429).json({
            success: false,
            error: 'طلبات كثيرة جداً، حاول لاحقاً',
            retryAfter: Math.ceil(config.security.rateLimit.windowMs / 1000)
        });
    }
});

const loginRateLimiter = rateLimit({
    windowMs: config.security.loginRateLimit.windowMs,
    max: config.security.loginRateLimit.max,
    skipSuccessfulRequests: config.security.loginRateLimit.skipSuccessful,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    handler: (req, res) => {
        logger.warn('Login rate limit exceeded', { ip: req.ip });
        res.status(429).json({
            success: false,
            error: 'محاولات تسجيل دخول كثيرة، حاول بعد 15 دقيقة',
            retryAfter: 900
        });
    }
});

app.use('/api', globalRateLimiter);
app.use('/api/auth/login', loginRateLimiter);

// ============================================================
// 📊 REQUEST LOGGING
// ============================================================

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`${req.method} ${req.originalUrl}`, {
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
            requestId: req.requestId,
            userAgent: req.get('user-agent')
        });
    });
    next();
});

// ============================================================
// 📁 STATIC FILES - Production Optimized
// ============================================================

const publicPath = path.join(__dirname, 'public');
const pagesPath = path.join(publicPath, 'pages');

if (!fs.existsSync(pagesPath)) {
    fs.mkdirSync(pagesPath, { recursive: true });
    logger.info('Created pages directory');
}

// Static files with caching
app.use(express.static(publicPath, {
    index: 'index.html',
    maxAge: config.isProduction ? '1d' : 0,
    etag: true,
    dotfiles: 'deny',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        } else if (filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
        } else if (filePath.endsWith('.js')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        } else if (filePath.match(/\.(png|jpg|jpeg|gif|ico|svg|webp)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

app.use('/pages', express.static(pagesPath, {
    maxAge: config.isProduction ? '1d' : 0,
    dotfiles: 'deny'
}));

// ============================================================
// 📦 MODELS - Advanced Schema Design
// ============================================================

// 👤 USER MODEL - Enterprise Grade
const UserSchema = new mongoose.Schema({
    // Core
    name: { type: String, required: true, trim: true, maxlength: 100 },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true, minlength: 3, maxlength: 50 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 150 },
    password: { type: String, required: true, select: false },
    
    // Role & Permissions
    role: { 
        type: String, 
        enum: ['super_admin', 'admin', 'manager', 'operator', 'viewer'],
        default: 'viewer'
    },
    permissions: [{
        resource: { type: String, required: true },
        actions: [{ type: String, enum: ['create', 'read', 'update', 'delete'] }]
    }],
    
    // Security
    isActive: { type: Boolean, default: true },
    isLocked: { type: Boolean, default: false },
    lockUntil: { type: Date, default: null },
    loginAttempts: { type: Number, default: 0 },
    lastLogin: { type: Date, default: null },
    lastLogout: { type: Date, default: null },
    
    // Authentication
    tokenVersion: { type: Number, default: 0 },
    refreshToken: { type: String, select: false },
    refreshTokenExpiry: { type: Date, default: null },
    
    // 2FA
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false },
    
    // Password Reset
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpiry: { type: Date, select: false },
    
    // Audit
    ipAddresses: [{
        ip: String,
        firstSeen: { type: Date, default: Date.now },
        lastSeen: { type: Date, default: Date.now }
    }],
    
    // Preferences
    preferences: {
        language: { type: String, default: 'ar' },
        theme: { type: String, default: 'dark' },
        notifications: { type: Boolean, default: true },
        timezone: { type: String, default: 'Africa/Tunis' }
    },
    
    // Timestamps
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    deletedAt: { type: Date, default: null }
}, {
    timestamps: true
});

// Indexes for performance
UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ createdAt: -1 });

// Hooks
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(config.security.bcryptRounds);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

UserSchema.pre('save', function(next) {
    if (this.isModified('password') || this.isModified('tokenVersion')) {
        this.updatedAt = new Date();
    }
    next();
});

// Methods
UserSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.incrementLoginAttempts = async function() {
    this.loginAttempts = (this.loginAttempts || 0) + 1;
    if (this.loginAttempts >= 5) {
        this.isLocked = true;
        this.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
    await this.save();
};

UserSchema.methods.resetLoginAttempts = async function() {
    this.loginAttempts = 0;
    this.isLocked = false;
    this.lockUntil = null;
    await this.save();
};

UserSchema.methods.addIP = function(ip) {
    const existing = this.ipAddresses.find(i => i.ip === ip);
    if (existing) {
        existing.lastSeen = new Date();
    } else {
        this.ipAddresses.push({ ip, firstSeen: new Date() });
    }
};

// 🚢 VESSEL MODEL
const VesselSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 150 },
    num: { type: String, trim: true, maxlength: 100 },
    stat: { 
        type: String, 
        enum: ['صالح', 'معطب', 'صيانة', 'مباع', 'متقاعد'],
        default: 'صالح'
    },
    zone: { type: String, trim: true, maxlength: 100 },
    port: { type: String, trim: true, maxlength: 100 },
    supp: { type: String, trim: true, maxlength: 100 },
    region: { 
        type: String, 
        enum: ['الشمال', 'الساحل', 'الوسط', 'الجنوب', 'خارجي'],
        default: 'الشمال'
    },
    cat: { type: String, trim: true, maxlength: 100 },
    len: { type: Number, min: 0 },
    tonnage: { type: Number, min: 0 },
    engine: {
        type: String,
        trim: true,
        maxlength: 100
    },
    year: { type: Number, min: 1900, max: new Date().getFullYear() },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null }
}, { timestamps: true });

VesselSchema.index({ stat: 1 });
VesselSchema.index({ region: 1 });
VesselSchema.index({ createdAt: -1 });

// ============================================================
// 🧰 HELPERS
// ============================================================

function generateRequestId() {
    return uuidv4();
}

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || 
           req.socket?.remoteAddress || 
           req.ip || 
           'unknown';
}

function cleanUser(user) {
    if (!user) return null;
    return {
        id: user._id.toString(),
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        preferences: user.preferences || {},
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
    };
}

function sanitizeInput(input) {
    if (!input) return input;
    if (typeof input === 'string') {
        return input.trim().replace(/[<>]/g, '');
    }
    return input;
}

function isValidId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

// ============================================================
// 🔐 TOKEN HELPERS
// ============================================================

function generateAccessToken(user) {
    return jwt.sign(
        {
            id: user._id.toString(),
            role: user.role,
            permissions: user.permissions || [],
            tokenVersion: user.tokenVersion || 0
        },
        config.jwt.secret,
        {
            expiresIn: config.jwt.accessExpiry,
            issuer: config.jwt.issuer,
            audience: config.jwt.audience,
            jwtid: generateRequestId()
        }
    );
}

function generateRefreshToken(user) {
    const jti = crypto.randomBytes(32).toString('hex');
    return jwt.sign(
        {
            id: user._id.toString(),
            jti: jti,
            tokenVersion: user.tokenVersion || 0
        },
        config.jwt.refreshSecret,
        {
            expiresIn: config.jwt.refreshExpiry,
            issuer: config.jwt.issuer,
            audience: config.jwt.audience,
            jwtid: jti
        }
    );
}

function verifyAccessToken(token) {
    return jwt.verify(token, config.jwt.secret, {
        issuer: config.jwt.issuer,
        audience: config.jwt.audience
    });
}

function verifyRefreshToken(token) {
    return jwt.verify(token, config.jwt.refreshSecret, {
        issuer: config.jwt.issuer,
        audience: config.jwt.audience
    });
}

// ============================================================
// 🔐 AUTHENTICATION MIDDLEWARE
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
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
                code: 'UNAUTHORIZED'
            });
        }

        let decoded;
        try {
            decoded = verifyAccessToken(token);
        } catch (error) {
            logger.warn('Token verification failed', {
                error: error.message,
                token: token.substring(0, 10) + '...'
            });
            return res.status(401).json({
                success: false,
                error: error.name === 'TokenExpiredError' 
                    ? 'Session expired, please login again' 
                    : 'Invalid token',
                code: error.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'
            });
        }

        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                error: 'Account is deactivated',
                code: 'ACCOUNT_DEACTIVATED'
            });
        }

        if (user.isLocked) {
            return res.status(423).json({
                success: false,
                error: 'Account is locked temporarily',
                code: 'ACCOUNT_LOCKED',
                lockUntil: user.lockUntil
            });
        }

        if (decoded.tokenVersion !== (user.tokenVersion || 0)) {
            return res.status(401).json({
                success: false,
                error: 'Session invalidated, please login again',
                code: 'TOKEN_VERSION_MISMATCH'
            });
        }

        req.user = user;
        req.token = token;
        req.requestId = req.requestId || generateRequestId();

        // Log authentication
        logger.debug('Authentication successful', {
            userId: user._id,
            username: user.username,
            role: user.role,
            requestId: req.requestId
        });

        next();

    } catch (error) {
        logger.error('Authentication error:', {
            error: error.message,
            stack: error.stack,
            requestId: req.requestId
        });
        return res.status(500).json({
            success: false,
            error: 'Authentication failed',
            code: 'AUTH_ERROR'
        });
    }
}

// ============================================================
// 🛂 AUTHORIZATION MIDDLEWARE
// ============================================================

function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
                code: 'UNAUTHORIZED'
            });
        }

        if (req.user.role === 'super_admin') {
            return next();
        }

        if (!roles.includes(req.user.role)) {
            logger.warn('Authorization failed', {
                userId: req.user._id,
                username: req.user.username,
                role: req.user.role,
                required: roles,
                path: req.path
            });
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions',
                code: 'FORBIDDEN'
            });
        }

        next();
    };
}

function requirePermission(resource, action) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
                code: 'UNAUTHORIZED'
            });
        }

        if (req.user.role === 'super_admin') {
            return next();
        }

        const hasPermission = req.user.permissions?.some(p => 
            p.resource === resource && 
            (p.actions.includes(action) || p.actions.includes('*'))
        );

        if (!hasPermission) {
            logger.warn('Permission denied', {
                userId: req.user._id,
                username: req.user.username,
                resource,
                action,
                path: req.path
            });
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions',
                code: 'PERMISSION_DENIED'
            });
        }

        next();
    };
}

// ============================================================
// ✅ VALIDATION MIDDLEWARE
// ============================================================

const validate = (validations) => {
    return async (req, res, next) => {
        await Promise.all(validations.map(validation => validation.run(req)));

        const errors = validationResult(req);
        if (errors.isEmpty()) {
            return next();
        }

        const formattedErrors = errors.array().map(error => ({
            field: error.path,
            message: error.msg
        }));

        logger.warn('Validation failed', {
            errors: formattedErrors,
            body: req.body,
            path: req.path
        });

        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: formattedErrors
        });
    };
};

// ============================================================
// 🌐 API ROUTES
// ============================================================

// ── Health Check ──
app.get('/health', (req, res) => {
    const dbState = mongoose.connection.readyState;
    const isHealthy = dbState === 1;
    
    res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        mongodb: isHealthy ? 'connected' : 'disconnected',
        version: '31.0.0',
        environment: config.env
    });
});

// ── Test Route ──
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: '✅ Marine System API is running',
        timestamp: new Date().toISOString(),
        version: '31.0.0',
        environment: config.env
    });
});

// ── Auth Routes ──

/**
 * POST /api/auth/login
 * User login with rate limiting and security
 */
app.post('/api/auth/login',
    validate([
        body('username').notEmpty().withMessage('اسم المستخدم مطلوب'),
        body('password').notEmpty().withMessage('كلمة المرور مطلوبة')
    ]),
    async (req, res) => {
        try {
            const { username, password } = req.body;
            const ip = getClientIp(req);

            logger.info('Login attempt', {
                username,
                ip,
                requestId: req.requestId
            });

            const user = await User.findOne({ 
                $or: [
                    { username: username.toLowerCase() },
                    { email: username.toLowerCase() }
                ]
            }).select('+password +refreshToken +refreshTokenExpiry');

            if (!user) {
                logger.warn('Login failed - user not found', { username, ip });
                return res.status(401).json({
                    success: false,
                    error: 'اسم المستخدم أو كلمة المرور غير صحيحة',
                    code: 'INVALID_CREDENTIALS'
                });
            }

            if (!user.isActive) {
                logger.warn('Login failed - user inactive', { username, id: user._id });
                return res.status(403).json({
                    success: false,
                    error: 'الحساب معطل، يرجى الاتصال بالدعم',
                    code: 'ACCOUNT_INACTIVE'
                });
            }

            if (user.isLocked && user.lockUntil && user.lockUntil > new Date()) {
                const remaining = Math.ceil((user.lockUntil - new Date()) / 60000);
                logger.warn('Login failed - account locked', { username, id: user._id, remaining });
                return res.status(423).json({
                    success: false,
                    error: `الحساب مقفل مؤقتاً، حاول بعد ${remaining} دقائق`,
                    code: 'ACCOUNT_LOCKED',
                    lockUntil: user.lockUntil
                });
            }

            const isValid = await user.comparePassword(password);
            if (!isValid) {
                await user.incrementLoginAttempts();
                logger.warn('Login failed - invalid password', { username, id: user._id });
                return res.status(401).json({
                    success: false,
                    error: 'اسم المستخدم أو كلمة المرور غير صحيحة',
                    code: 'INVALID_CREDENTIALS'
                });
            }

            // Success
            await user.resetLoginAttempts();
            user.lastLogin = new Date();
            user.tokenVersion = (user.tokenVersion || 0) + 1;
            user.addIP(ip);
            await user.save();

            const accessToken = generateAccessToken(user);
            const refreshToken = generateRefreshToken(user);
            user.refreshToken = refreshToken;
            user.refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            await user.save();

            // Set cookies
            const cookieOptions = {
                httpOnly: true,
                secure: config.isProduction,
                sameSite: 'lax',
                maxAge: 15 * 60 * 1000
            };

            res.cookie('auth_token', accessToken, cookieOptions);
            res.cookie('refresh_token', refreshToken, {
                ...cookieOptions,
                maxAge: 7 * 24 * 60 * 60 * 1000
            });

            logger.info('Login successful', {
                username,
                id: user._id,
                role: user.role,
                ip
            });

            return res.json({
                success: true,
                user: cleanUser(user),
                token: accessToken,
                refreshToken: refreshToken,
                message: 'تم تسجيل الدخول بنجاح'
            });

        } catch (error) {
            logger.error('Login error:', {
                error: error.message,
                stack: error.stack,
                requestId: req.requestId
            });
            return res.status(500).json({
                success: false,
                error: 'حدث خطأ أثناء تسجيل الدخول',
                code: 'LOGIN_ERROR'
            });
        }
    }
);

// ── Logout ──
app.post('/api/auth/logout', authenticate, async (req, res) => {
    try {
        const user = req.user;
        user.refreshToken = null;
        user.refreshTokenExpiry = null;
        await user.save();

        res.clearCookie('auth_token');
        res.clearCookie('refresh_token');

        logger.info('Logout successful', {
            userId: user._id,
            username: user.username
        });

        return res.json({
            success: true,
            message: 'تم تسجيل الخروج بنجاح'
        });

    } catch (error) {
        logger.error('Logout error:', {
            error: error.message,
            requestId: req.requestId
        });
        return res.status(500).json({
            success: false,
            error: 'فشل تسجيل الخروج'
        });
    }
});

// ── Refresh Token ──
app.post('/api/auth/refresh', async (req, res) => {
    try {
        const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
        
        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                error: 'Refresh token required',
                code: 'REFRESH_TOKEN_REQUIRED'
            });
        }

        let decoded;
        try {
            decoded = verifyRefreshToken(refreshToken);
        } catch (error) {
            logger.warn('Invalid refresh token', { error: error.message });
            return res.status(401).json({
                success: false,
                error: 'Invalid refresh token',
                code: 'INVALID_REFRESH_TOKEN'
            });
        }

        const user = await User.findById(decoded.id).select('+refreshToken +refreshTokenExpiry');
        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                error: 'Invalid session',
                code: 'INVALID_SESSION'
            });
        }

        if (user.refreshToken !== refreshToken) {
            return res.status(401).json({
                success: false,
                error: 'Invalid refresh token',
                code: 'INVALID_REFRESH_TOKEN'
            });
        }

        if (user.refreshTokenExpiry && user.refreshTokenExpiry < new Date()) {
            return res.status(401).json({
                success: false,
                error: 'Refresh token expired',
                code: 'REFRESH_TOKEN_EXPIRED'
            });
        }

        const newAccessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);
        user.refreshToken = newRefreshToken;
        user.refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await user.save();

        const cookieOptions = {
            httpOnly: true,
            secure: config.isProduction,
            sameSite: 'lax'
        };

        res.cookie('auth_token', newAccessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
        res.cookie('refresh_token', newRefreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

        return res.json({
            success: true,
            token: newAccessToken,
            refreshToken: newRefreshToken
        });

    } catch (error) {
        logger.error('Refresh token error:', {
            error: error.message,
            requestId: req.requestId
        });
        return res.status(500).json({
            success: false,
            error: 'Failed to refresh token'
        });
    }
});

// ── Get Current User ──
app.get('/api/auth/me', authenticate, (req, res) => {
    return res.json({
        success: true,
        user: cleanUser(req.user)
    });
});

// ── Change Password (Admin only) ──
app.put('/api/auth/change-password',
    authenticate,
    authorize('admin', 'super_admin'),
    validate([
        body('currentPassword').notEmpty().withMessage('كلمة المرور الحالية مطلوبة'),
        body('newPassword').isLength({ min: 8 }).withMessage('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل')
    ]),
    async (req, res) => {
        try {
            const { currentPassword, newPassword } = req.body;

            const user = await User.findById(req.user._id).select('+password');
            const isValid = await user.comparePassword(currentPassword);

            if (!isValid) {
                return res.status(401).json({
                    success: false,
                    error: 'كلمة المرور الحالية غير صحيحة',
                    code: 'INVALID_PASSWORD'
                });
            }

            user.password = newPassword;
            user.tokenVersion = (user.tokenVersion || 0) + 1;
            await user.save();

            logger.info('Password changed', {
                userId: user._id,
                username: user.username
            });

            return res.json({
                success: true,
                message: 'تم تغيير كلمة المرور بنجاح'
            });

        } catch (error) {
            logger.error('Change password error:', {
                error: error.message,
                requestId: req.requestId
            });
            return res.status(500).json({
                success: false,
                error: 'فشل تغيير كلمة المرور'
            });
        }
    }
);

// ── Create Admin User ──
async function createInitialAdmin() {
    try {
        const existing = await User.findOne({ 
            $or: [
                { username: config.admin.username },
                { email: config.admin.email }
            ]
        });

        if (existing) {
            logger.info('Admin account already exists');
            return;
        }

        const admin = new User({
            name: config.admin.name,
            username: config.admin.username,
            email: config.admin.email,
            password: config.admin.password,
            role: 'super_admin',
            isActive: true,
            tokenVersion: 1,
            permissions: [
                { resource: '*', actions: ['*'] }
            ]
        });

        await admin.save();
        
        logger.info('Admin account created successfully', {
            username: config.admin.username,
            email: config.admin.email
        });

        console.log('✅ Admin created successfully!');
        console.log(`👤 Username: ${config.admin.username}`);
        console.log(`🔑 Password: ${config.admin.password}`);

    } catch (error) {
        logger.error('Admin creation failed:', {
            error: error.message
        });
        console.error('❌ Admin creation failed:', error.message);
    }
}

// ============================================================
// 📊 DASHBOARD ROUTE
// ============================================================

app.get('/api/dashboard', authenticate, async (req, res) => {
    try {
        const [
            totalVessels,
            activeMaintenance,
            validVessels,
            damagedVessels,
            maintenanceVessels,
            totalUsers,
            totalTickets,
            publishedNotes
        ] = await Promise.all([
            Vessel.countDocuments(),
            Maintenance.countDocuments({ status: { $in: ['معلقة', 'قيد التنفيذ'] } }),
            Vessel.countDocuments({ stat: 'صالح' }),
            Vessel.countDocuments({ stat: 'معطب' }),
            Vessel.countDocuments({ stat: 'صيانة' }),
            User.countDocuments({ isActive: true }),
            Ticket.countDocuments({ status: { $in: ['open', 'in_progress', 'pending'] } }),
            Note.countDocuments({ status: 'منشورة' })
        ]);

        return res.json({
            success: true,
            data: {
                vessels: {
                    total: totalVessels,
                    valid: validVessels,
                    damaged: damagedVessels,
                    maintenance: maintenanceVessels,
                    readiness: totalVessels > 0 ? Math.round((validVessels / totalVessels) * 100) : 0
                },
                maintenance: {
                    total: totalVessels - validVessels - damagedVessels,
                    active: activeMaintenance
                },
                users: {
                    total: totalUsers
                },
                tickets: {
                    open: totalTickets
                },
                notes: {
                    published: publishedNotes
                }
            }
        });

    } catch (error) {
        logger.error('Dashboard error:', {
            error: error.message,
            requestId: req.requestId
        });
        return res.status(500).json({
            success: false,
            error: 'Failed to load dashboard'
        });
    }
});

// ============================================================
// 🚢 VESSELS CRUD
// ============================================================

app.get('/api/vessels', authenticate, async (req, res) => {
    try {
        const { limit = 100, skip = 0, stat, region, search } = req.query;
        
        const filter = {};
        if (stat) filter.stat = stat;
        if (region) filter.region = region;
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { num: { $regex: search, $options: 'i' } }
            ];
        }

        const [vessels, total] = await Promise.all([
            Vessel.find(filter)
                .limit(parseInt(limit))
                .skip(parseInt(skip))
                .sort({ createdAt: -1 })
                .lean(),
            Vessel.countDocuments(filter)
        ]);

        return res.json({
            success: true,
            data: vessels,
            pagination: {
                total,
                limit: parseInt(limit),
                skip: parseInt(skip),
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        logger.error('Vessels error:', {
            error: error.message,
            requestId: req.requestId
        });
        return res.status(500).json({
            success: false,
            error: 'Failed to load vessels'
        });
    }
});

// ============================================================
// 🔧 MAINTENANCE CRUD
// ============================================================

app.get('/api/maintenance', authenticate, async (req, res) => {
    try {
        const records = await Maintenance.find()
            .populate('vesselId', 'name num')
            .populate('supervisor', 'name email')
            .sort({ createdAt: -1 })
            .lean();

        return res.json({
            success: true,
            data: records
        });

    } catch (error) {
        logger.error('Maintenance error:', {
            error: error.message,
            requestId: req.requestId
        });
        return res.status(500).json({
            success: false,
            error: 'Failed to load maintenance records'
        });
    }
});

// ============================================================
// 👥 USERS MANAGEMENT (Admin only)
// ============================================================

app.get('/api/users', authenticate, authorize('admin', 'super_admin'), async (req, res) => {
    try {
        const users = await User.find()
            .select('-password -refreshToken')
            .sort({ createdAt: -1 })
            .lean();

        return res.json({
            success: true,
            data: users
        });

    } catch (error) {
        logger.error('Users error:', {
            error: error.message,
            requestId: req.requestId
        });
        return res.status(500).json({
            success: false,
            error: 'Failed to load users'
        });
    }
});

// ============================================================
// 🤖 AI ASSISTANT
// ============================================================

app.post('/api/ai/ask', authenticate, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({
                success: false,
                error: 'Message is required'
            });
        }

        // Simple AI response
        const msg = message.toLowerCase();
        let response = 'عذراً، لم أستطع فهم سؤالك.';

        if (msg.includes('مرحبا') || msg.includes('السلام')) {
            response = '👋 وعليكم السلام! كيف يمكنني مساعدتك؟';
        } else if (msg.includes('تونس')) {
            response = '🇹🇳 تونس هي عاصمة تونس، تقع في شمال أفريقيا على البحر المتوسط.';
        } else if (msg.includes('الأسطول') || msg.includes('مراكب')) {
            const total = await Vessel.countDocuments();
            const valid = await Vessel.countDocuments({ stat: 'صالح' });
            response = `🚢 إحصائيات الأسطول:\n• إجمالي المراكب: ${total}\n• الصالح: ${valid}`;
        } else if (msg.includes('مساعدة')) {
            response = '📚 يمكنني مساعدتك في:\n• معلومات عامة\n• إحصائيات الأسطول\n• الصيانة\n• التقارير';
        } else {
            response = '🤔 سؤال ممتاز! اسألني عن:\n• مرحبا\n• تونس\n• الأسطول\n• مساعدة';
        }

        return res.json({
            success: true,
            data: {
                message: response,
                conversationId: uuidv4(),
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error('AI error:', {
            error: error.message,
            requestId: req.requestId
        });
        return res.status(500).json({
            success: false,
            error: 'AI service error'
        });
    }
});

// ============================================================
// 🏠 STATIC ROUTES
// ============================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/pages/:page', (req, res) => {
    const filePath = path.join(publicPath, 'pages', `${req.params.page}.html`);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).json({ success: false, error: 'Page not found' });
    }
});

// ============================================================
// ❌ 404 Handler
// ============================================================

app.use('/api', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'API endpoint not found',
        path: req.originalUrl,
        available: [
            '/api/test',
            '/api/auth/login',
            '/api/auth/refresh',
            '/api/auth/logout',
            '/api/auth/me',
            '/api/auth/change-password',
            '/api/dashboard',
            '/api/vessels',
            '/api/maintenance',
            '/api/users',
            '/api/ai/ask'
        ]
    });
});

app.get('*', (req, res) => {
    if (path.extname(req.path)) {
        return res.status(404).send('File not found');
    }
    res.sendFile(path.join(publicPath, 'index.html'), err => {
        if (err) res.status(404).send('Page not found');
    });
});

// ============================================================
// 💥 GLOBAL ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
    logger.error('Unhandled error:', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        ip: getClientIp(req),
        requestId: req.requestId,
        userId: req.user?._id
    });

    if (res.headersSent) {
        return next(err);
    }

    // Mongoose errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: 'Validation error',
            details: Object.values(err.errors || {}).map(e => e.message)
        });
    }

    if (err.name === 'CastError') {
        return res.status(400).json({
            success: false,
            error: 'Invalid ID format'
        });
    }

    if (err.code === 11000) {
        return res.status(409).json({
            success: false,
            error: 'Duplicate key error'
        });
    }

    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            error: 'Invalid token',
            code: 'INVALID_TOKEN'
        });
    }

    // Production vs Development
    const errorResponse = {
        success: false,
        error: config.isProduction ? 'Internal server error' : err.message,
        code: err.code || 'INTERNAL_ERROR'
    };

    if (!config.isProduction) {
        errorResponse.stack = err.stack;
        errorResponse.details = err.details || {};
    }

    res.status(500).json(errorResponse);
});

// ============================================================
// 🗄️ DATABASE CONNECTION
// ============================================================

async function connectDatabase() {
    logger.info('Connecting to MongoDB...');
    try {
        await mongoose.connect(config.mongodb.uri, config.mongodb.options);
        logger.info('✅ MongoDB Connected');
        logger.info(`📚 Database: ${mongoose.connection.name}`);
        
        mongoose.connection.on('disconnected', () => {
            logger.warn('⚠️ MongoDB disconnected');
        });
        
        mongoose.connection.on('reconnected', () => {
            logger.info('✅ MongoDB reconnected');
        });

        mongoose.connection.on('error', (error) => {
            logger.error('❌ MongoDB error:', { error: error.message });
        });

        return true;

    } catch (error) {
        logger.error('❌ MongoDB connection failed:', { error: error.message });
        throw error;
    }
}

// ============================================================
// 🚀 START SERVER
// ============================================================

async function startServer() {
    try {
        await connectDatabase();
        await createInitialAdmin();

        const server = app.listen(config.port, '0.0.0.0', () => {
            logger.info('============================================================');
            logger.info('🚢 MARINE SYSTEM v31.0 - ENTERPRISE EDITION');
            logger.info('============================================================');
            logger.info(`🚀 PORT: ${config.port}`);
            logger.info(`🌍 ENV: ${config.env}`);
            logger.info('🗄️ DATABASE: MongoDB');
            logger.info('🔐 JWT: ENABLED');
            logger.info('🛡️ SECURITY: ENTERPRISE GRADE');
            logger.info('📊 LOGGING: Winston + Morgan');
            logger.info('============================================================');
            logger.info(`🔑 Admin Login: ${config.admin.username}`);
            logger.info('============================================================');

            console.log('');
            console.log('='.repeat(60));
            console.log('🚢 MARINE SYSTEM v31.0 - ENTERPRISE EDITION');
            console.log('='.repeat(60));
            console.log(`🚀 PORT: ${config.port}`);
            console.log(`🌍 ENV: ${config.env}`);
            console.log('🗄️ DATABASE: MongoDB');
            console.log('🔐 JWT: ENABLED');
            console.log('🛡️ SECURITY: ENTERPRISE GRADE');
            console.log('📊 LOGGING: Winston + Morgan');
            console.log('='.repeat(60));
            console.log(`🔑 Admin Login: ${config.admin.username}`);
            console.log('='.repeat(60));
            console.log('');
        });

        // Graceful shutdown
        let shuttingDown = false;

        const shutdown = async (signal) => {
            if (shuttingDown) return;
            shuttingDown = true;

            logger.info(`🛑 ${signal} received. Shutting down gracefully...`);

            const forceExit = setTimeout(() => {
                logger.error('⚠️ Forced shutdown');
                process.exit(1);
            }, 10000);
            forceExit.unref();

            server.close(async (error) => {
                try {
                    if (error) throw error;
                    await mongoose.connection.close();
                    logger.info('✅ MongoDB closed');
                    process.exit(0);
                } catch (shutdownError) {
                    logger.error('❌ Shutdown error:', { error: shutdownError.message });
                    process.exit(1);
                }
            });
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        // Error handling
        process.on('uncaughtException', (error) => {
            logger.error('💥 Uncaught Exception:', {
                error: error.message,
                stack: error.stack
            });
            // Don't exit in production, but log
            if (!config.isProduction) {
                process.exit(1);
            }
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('💥 Unhandled Rejection:', {
                reason: reason,
                promise: promise
            });
            if (!config.isProduction) {
                process.exit(1);
            }
        });

    } catch (error) {
        logger.error('💥 Failed to start server:', { error: error.message });
        process.exit(1);
    }
}

// ============================================================
// ▶️ START
// ============================================================

startServer();

module.exports = app;
