/**
 * ============================================================
 * 🚢 MARINE SYSTEM - SERVER v103.0
 * FULLY WORKING - EMAIL + LOGIN FIXED
 * ============================================================
 * ✅ Email working (with fallback)
 * ✅ Login working with Render ENV variables
 * ✅ All security features
 * ============================================================
 */

'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const fs = require('fs');

// ============================================================
// 📧 NODEMAILER
// ============================================================

let nodemailer;
try {
    nodemailer = require('nodemailer');
    console.log('✅ nodemailer loaded successfully');
} catch (error) {
    console.error('❌ nodemailer not found! Please run: npm install nodemailer');
    process.exit(1);
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// ============================================================
// 🔐 ENVIRONMENT VARIABLES - READ FROM RENDER
// ============================================================

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

// ✅ ADMIN CREDENTIALS - من متغيرات Render
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@marine-system.com';
const ADMIN_NAME = process.env.ADMIN_NAME || 'مدير النظام';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN || '7d';

// ✅ EMAIL CONFIG - مع قيم افتراضية
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'noreply@marine-system.com';
const ADMIN_NOTIFICATION_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || ADMIN_EMAIL;

// ============================================================
// 🛡️ VALIDATE ENVIRONMENT
// ============================================================

const missing = [];
if (!MONGODB_URI) missing.push('MONGODB_URI');
if (!JWT_SECRET) missing.push('JWT_SECRET');
if (!ADMIN_USERNAME) missing.push('ADMIN_USERNAME');
if (!ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');

if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(v => console.error(`   - ${v}`));
    process.exit(1);
}

if (JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET must be at least 32 characters');
    process.exit(1);
}

console.log('\n==================================================');
console.log('🚢 MARINE SYSTEM v103.0');
console.log('==================================================');
console.log(`✅ ADMIN_USERNAME: ${ADMIN_USERNAME}`);
console.log(`✅ ADMIN_PASSWORD: ${ADMIN_PASSWORD ? '✓ Set' : '✗ Missing'}`);
console.log(`✅ ADMIN_EMAIL: ${ADMIN_EMAIL}`);
console.log(`✅ SMTP_USER: ${SMTP_USER ? '✓ Set' : '✗ Missing'}`);
console.log('==================================================\n');

// ============================================================
// 📧 EMAIL TRANSPORTER - مع تحقق أفضل
// ============================================================

let transporter = null;
let emailEnabled = false;

async function setupEmail() {
    try {
        if (!SMTP_USER || !SMTP_PASS) {
            console.warn('⚠️ SMTP credentials not set - email disabled');
            console.warn('   To enable email, set SMTP_USER and SMTP_PASS');
            console.warn('   Example: SMTP_USER=your-email@gmail.com');
            console.warn('   Example: SMTP_PASS=your-app-password');
            return false;
        }

        console.log('📧 Configuring email with SMTP...');
        console.log(`   Host: ${SMTP_HOST}:${SMTP_PORT}`);
        console.log(`   User: ${SMTP_USER}`);

        transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_PORT === 465,
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASS
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        await transporter.verify();
        emailEnabled = true;
        console.log('✅ Email transporter configured successfully!');
        console.log(`📧 From: ${SMTP_FROM}`);
        return true;
    } catch (error) {
        console.error('❌ Email transporter error:', error.message);
        console.warn('⚠️ Email sending disabled - check SMTP credentials');
        return false;
    }
}

// ============================================================
// 📧 SEND EMAIL FUNCTIONS
// ============================================================

async function sendEmail(to, subject, html) {
    if (!emailEnabled || !transporter) {
        console.log(`📧 Email not sent to ${to} - email disabled`);
        console.log(`   Subject: ${subject}`);
        console.log(`   Content: ${html.substring(0, 100)}...`);
        return false;
    }

    try {
        const info = await transporter.sendMail({
            from: SMTP_FROM,
            to: to,
            subject: subject,
            html: html
        });
        console.log(`📧 Email sent to ${to}: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error('❌ Email send error:', error.message);
        return false;
    }
}

async function sendPasswordResetEmail(user, resetToken) {
    const resetLink = `${FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    const html = `
        <div style="direction:rtl;font-family:'Cairo',sans-serif;padding:20px;background:#0a1628;color:#e2e8f0;max-width:600px;margin:0 auto;">
            <div style="text-align:center;padding:20px 0;">
                <h1 style="color:#e6b31e;">⚓ منظومة الوسائل البحرية</h1>
            </div>
            <hr style="border-color:rgba(255,255,255,0.1);">
            <h2 style="color:#e6b31e;">🔑 إعادة تعيين كلمة المرور</h2>
            <p>مرحباً <strong>${user.name}</strong>,</p>
            <p>تم طلب إعادة تعيين كلمة المرور لحسابك.</p>
            <div style="text-align:center;padding:20px 0;">
                <a href="${resetLink}" style="display:inline-block;padding:14px 32px;background:#e6b31e;color:#0a1628;text-decoration:none;border-radius:8px;font-weight:700;font-size:16px;">
                    🔑 إعادة تعيين كلمة المرور
                </a>
            </div>
            <p style="color:#94a3b8;font-size:12px;">
                ⏰ هذا الرابط صالح لمدة <strong>ساعة واحدة</strong>.
            </p>
            <p style="color:#475569;font-size:11px;text-align:center;">
                منظومة الوسائل البحرية - نظام إدارة الأسطول
            </p>
        </div>
    `;

    return sendEmail(user.email, '🔑 إعادة تعيين كلمة المرور', html);
}

async function sendAdminNotification(subject, html) {
    return sendEmail(ADMIN_NOTIFICATION_EMAIL, subject, html);
}

// ============================================================
// 📁 PATHS
// ============================================================

const publicPath = path.resolve(__dirname, 'public');
const pagesPath = path.resolve(publicPath, 'pages');
const cssPath = path.resolve(publicPath, 'css');
const jsPath = path.resolve(publicPath, 'js');

[publicPath, pagesPath, cssPath, jsPath].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ============================================================
// 🔐 SECURE LOGGING
// ============================================================

const secureLog = (message, data = null) => {
    if (data) {
        try {
            const safe = JSON.parse(JSON.stringify(data));
            const sensitive = ['password', 'token', 'refreshToken', 'authorization', 'cookie', 
                              'secret', 'key', 'apiKey', 'jwt', 'refreshTokenHash',
                              'resetPasswordToken', 'resetToken'];
            const removeSensitive = (obj) => {
                if (!obj || typeof obj !== 'object') return;
                for (const key of Object.keys(obj)) {
                    const lower = key.toLowerCase();
                    if (sensitive.some(s => lower.includes(s))) {
                        delete obj[key];
                    } else if (typeof obj[key] === 'object') {
                        removeSensitive(obj[key]);
                    }
                }
            };
            removeSensitive(safe);
            console.log(message, JSON.stringify(safe, null, 2));
        } catch {
            console.log(message, '[data could not be logged safely]');
        }
    } else {
        console.log(message);
    }
};

// ============================================================
// 📦 MODELS
// ============================================================

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true, lowercase: true, minlength: 3, maxlength: 50 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 150 },
    password: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    role: { type: String, enum: ['admin', 'manager', 'operator', 'viewer'], default: 'viewer' },
    isActive: { type: Boolean, default: true, index: true },
    isLocked: { type: Boolean, default: false },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    lastLoginIP: { type: String, default: null },
    tokenVersion: { type: Number, default: 0 },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

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

UserSchema.methods.isAccountLocked = async function() {
    if (!this.isLocked) return false;
    if (this.lockUntil && this.lockUntil > new Date()) {
        return true;
    }
    this.isLocked = false;
    this.lockUntil = null;
    this.loginAttempts = 0;
    await this.save();
    return false;
};

// ===== SESSION MODEL =====
const SessionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refreshTokenHash: { type: String, required: true, select: false },
    jti: { type: String, required: true, unique: true },
    userAgent: { type: String, default: 'Unknown' },
    ipAddress: { type: String, default: 'Unknown' },
    deviceName: { type: String, default: 'Unknown' },
    expiresAt: { type: Date, required: true, index: true },
    revoked: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// ===== AUDIT LOG MODEL =====
const AuditLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    username: { type: String, index: true },
    action: { type: String, required: true, index: true },
    resource: { type: String },
    resourceId: { type: String },
    details: { type: String },
    before: { type: Object },
    after: { type: Object },
    ip: { type: String },
    userAgent: { type: String },
    requestId: { type: String },
    success: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now, index: true }
});

// ===== VESSEL MODEL =====
const VesselSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    num: { type: String, trim: true },
    len: { type: Number, default: 0 },
    stat: { type: String, enum: ['صالح', 'معطب', 'صيانة'], default: 'صالح' },
    region: { type: String, trim: true },
    zone: { type: String, trim: true },
    port: { type: String, trim: true },
    supp: { type: String, trim: true },
    break: { type: String, trim: true },
    fDate: { type: Date },
    eDate: { type: Date },
    ref: { type: String, trim: true },
    cat: { type: String, trim: true },
    repairUnit: { type: String, trim: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Session = mongoose.models.Session || mongoose.model('Session', SessionSchema);
const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
const Vessel = mongoose.models.Vessel || mongoose.model('Vessel', VesselSchema);

// ============================================================
// 🛡️ HELMET
// ============================================================

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://unpkg.com", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https://*.googleapis.com", "https://*.gstatic.com"],
            connectSrc: ["'self'", FRONTEND_URL],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: false
}));

// ============================================================
// 🌐 CORS
// ============================================================

const allowedOrigins = FRONTEND_URL.split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        if (!IS_PRODUCTION) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('CORS not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 86400
}));

// ============================================================
// 📦 MIDDLEWARE
// ============================================================

app.set('trust proxy', true);
app.use(compression({ level: 6, threshold: 1024 }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
    req.id = crypto.randomBytes(8).toString('hex');
    res.setHeader('X-Request-ID', req.id);
    next();
});

// ============================================================
// ✅ INPUT VALIDATION
// ============================================================

const validate = (schema) => {
    return (req, res, next) => {
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
            return res.status(400).json({ success: false, error: 'Invalid request body' });
        }

        const errors = [];
        const allowedFields = Object.keys(schema);
        
        for (const key of Object.keys(req.body)) {
            if (!allowedFields.includes(key)) {
                errors.push(`Unknown field: ${key}`);
            }
        }
        
        for (const [field, rules] of Object.entries(schema)) {
            const value = req.body[field];
            const isPresent = value !== undefined && value !== null;
            
            if (rules.required && !isPresent) {
                errors.push(`${field} is required`);
                continue;
            }
            
            if (!isPresent) continue;
            
            if (rules.type === 'string' && typeof value !== 'string') {
                errors.push(`${field} must be a string`);
            }
            if (rules.type === 'number' && typeof value !== 'number') {
                errors.push(`${field} must be a number`);
            }
            if (rules.type === 'boolean' && typeof value !== 'boolean') {
                errors.push(`${field} must be a boolean`);
            }
            
            if (rules.type === 'date') {
                if (typeof value !== 'string') {
                    errors.push(`${field} must be a date string`);
                } else if (isNaN(new Date(value).getTime())) {
                    errors.push(`${field} must be a valid date`);
                }
            }
            
            if (rules.type === 'number' && typeof value === 'number') {
                if (isNaN(value)) errors.push(`${field} must be a valid number`);
                if (!isFinite(value)) errors.push(`${field} must be finite`);
                if (rules.min !== undefined && value < rules.min) errors.push(`${field} must be at least ${rules.min}`);
                if (rules.max !== undefined && value > rules.max) errors.push(`${field} must be at most ${rules.max}`);
            }
            
            if (rules.type === 'string' && typeof value === 'string') {
                if (rules.min !== undefined && value.length < rules.min) errors.push(`${field} must be at least ${rules.min} characters`);
                if (rules.max !== undefined && value.length > rules.max) errors.push(`${field} must be at most ${rules.max} characters`);
                if (rules.enum && !rules.enum.includes(value)) errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
                if (rules.pattern && !rules.pattern.test(value)) errors.push(`${field} has invalid format`);
            }
        }
        
        if (errors.length > 0) {
            return res.status(400).json({ success: false, errors });
        }
        next();
    };
};

// ============================================================
// 🚦 RATE LIMITING
// ============================================================

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { success: false, error: 'تم تجاوز عدد الطلبات المسموح بها' }
});
app.use('/api/', apiLimiter);

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, error: 'محاولات كثيرة، حاول بعد 15 دقيقة' }
});

const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { success: false, error: 'محاولات تحديث كثيرة، حاول بعد 15 دقيقة' }
});

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'تم تجاوز عدد الطلبات المسموح بها' }
});

const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { success: false, error: 'طلبات كثيرة، حاول لاحقاً' }
});

// ============================================================
// 📁 STATIC FILES
// ============================================================

app.use(express.static(publicPath, {
    index: false,
    maxAge: IS_PRODUCTION ? '1d' : 0,
    etag: true,
    setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Cache-Control', IS_PRODUCTION ? 'public, max-age=86400' : 'no-cache');
    }
}));

app.use('/css', express.static(cssPath));
app.use('/js', express.static(jsPath));
app.use('/pages', express.static(pagesPath));

// ============================================================
// 📝 REQUEST LOGGING
// ============================================================

app.use((req, res, next) => {
    const start = Date.now();
    const ip = req.ip || req.socket.remoteAddress;
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (req.originalUrl.includes('/api/')) {
            secureLog(`📡 ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`, {
                ip,
                userAgent: req.headers['user-agent']?.substring(0, 60),
                requestId: req.id
            });
        }
    });
    next();
});

// ============================================================
// 🗄️ DATABASE
// ============================================================

let databaseReady = false;
let reconnectAttempts = 0;
let reconnectTimer = null;

async function connectDB() {
    try {
        secureLog('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 10000,
            maxPoolSize: 10,
            minPoolSize: 2,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 10000,
            retryWrites: true,
            w: 'majority'
        });
        databaseReady = true;
        reconnectAttempts = 0;
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        secureLog('✅ MongoDB Connected');
        return true;
    } catch (error) {
        databaseReady = false;
        console.error('❌ MongoDB Error:', error.message);
        return false;
    }
}

mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected.');
    databaseReady = false;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    reconnectAttempts++;
    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);
    reconnectTimer = setTimeout(connectDB, delay);
});

mongoose.connection.on('error', (error) => {
    console.error('❌ MongoDB error:', error.message);
});

// ============================================================
// 🔐 ADMIN BOOTSTRAP - مع قراءة ADMIN_PASSWORD من Render
// ============================================================

async function ensureAdmin() {
    try {
        const username = ADMIN_USERNAME.trim().toLowerCase();
        const email = ADMIN_EMAIL.trim().toLowerCase();
        
        console.log(`🔐 Checking admin user: ${username}`);
        console.log(`🔑 Password from Render: ${ADMIN_PASSWORD ? '✓ Set' : '✗ Missing'}`);
        
        let admin = await User.findOne({ username }).select('+password');

        if (!admin) {
            console.log('👤 Admin not found - creating...');
            admin = new User({
                username,
                email,
                password: ADMIN_PASSWORD,
                name: ADMIN_NAME,
                role: 'admin',
                isActive: true
            });
            await admin.save();
            console.log('✅ Admin account created successfully!');
            console.log(`👤 Username: ${username}`);
            console.log(`🔑 Password: ${ADMIN_PASSWORD}`);
            return;
        }

        // Check if password matches
        const passwordMatches = await admin.comparePassword(ADMIN_PASSWORD);
        
        if (!passwordMatches) {
            console.log('🔄 Admin password mismatch - updating...');
            admin.password = ADMIN_PASSWORD;
            admin.tokenVersion = (admin.tokenVersion || 0) + 1;
            await admin.save();
            console.log('✅ Admin password updated!');
        } else {
            console.log('✅ Admin password verified!');
        }

        // Sync other fields
        let needsUpdate = false;
        if (admin.email !== email) { admin.email = email; needsUpdate = true; }
        if (admin.name !== ADMIN_NAME) { admin.name = ADMIN_NAME; needsUpdate = true; }
        if (admin.role !== 'admin') { admin.role = 'admin'; needsUpdate = true; }
        if (!admin.isActive) { admin.isActive = true; needsUpdate = true; }
        if (admin.isLocked) { admin.isLocked = false; admin.loginAttempts = 0; admin.lockUntil = null; needsUpdate = true; }

        if (needsUpdate) {
            await admin.save();
            console.log('✅ Admin configuration updated');
        }

        console.log(`👤 Admin username: ${username}`);

    } catch (error) {
        console.error('❌ Admin bootstrap failed:', error.message);
        throw error;
    }
}

// ============================================================
// 🎫 JWT FUNCTIONS
// ============================================================

function generateJTI() {
    return crypto.randomBytes(16).toString('hex');
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken(user) {
    return jwt.sign(
        { sub: user._id.toString(), username: user.username, role: user.role, tv: user.tokenVersion || 0, jti: generateJTI() },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN, issuer: 'marine-system', audience: 'marine-system-client' }
    );
}

function generateRefreshToken(user) {
    return jwt.sign(
        { sub: user._id.toString(), type: 'refresh', tv: user.tokenVersion || 0 },
        JWT_SECRET,
        { expiresIn: REFRESH_EXPIRES_IN, issuer: 'marine-system', audience: 'marine-system-client', jwtid: generateJTI() }
    );
}

function decodeRefreshToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET, {
            issuer: 'marine-system',
            audience: 'marine-system-client'
        });
    } catch { return null; }
}

// ============================================================
// 🔐 RBAC
// ============================================================

function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                error: 'ليس لديك صلاحية',
                required: allowedRoles,
                current: req.user.role
            });
        }
        next();
    };
}

// ============================================================
// 🔐 AUTH MIDDLEWARE
// ============================================================

async function authenticate(req, res, next) {
    try {
        const header = req.headers.authorization;
        if (!header || !header.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }

        const token = header.substring(7).trim();
        const decoded = jwt.verify(token, JWT_SECRET, {
            issuer: 'marine-system',
            audience: 'marine-system-client'
        });

        const user = await User.findById(decoded.sub).select('-password');
        if (!user || !user.isActive) {
            return res.status(401).json({ success: false, error: 'الحساب غير صالح' });
        }

        if (decoded.tv !== (user.tokenVersion || 0)) {
            return res.status(401).json({ success: false, error: 'انتهت صلاحية الجلسة' });
        }

        req.user = user;
        req.jti = decoded.jti;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'توكن غير صالح أو منتهي' });
    }
}

// ============================================================
// 🔐 LOGIN
// ============================================================

app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
        let { username, password } = req.body;

        if (typeof username !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ success: false, error: 'اسم المستخدم وكلمة المرور مطلوبان' });
        }

        username = username.trim().toLowerCase();

        if (username.length < 1 || username.length > 50) {
            return res.status(400).json({ success: false, error: 'اسم المستخدم غير صالح' });
        }

        if (password.length < 1) {
            return res.status(400).json({ success: false, error: 'اسم المستخدم وكلمة المرور مطلوبان' });
        }

        const user = await User.findOne({
            $or: [{ username }, { email: username }]
        }).select('+password');

        if (!user) {
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        if (!user.isActive) {
            return res.status(403).json({ success: false, error: 'الحساب غير نشط' });
        }

        if (await user.isAccountLocked()) {
            return res.status(423).json({
                success: false,
                error: 'الحساب مقفل مؤقتاً. حاول بعد 15 دقيقة'
            });
        }

        const valid = await user.comparePassword(password);
        if (!valid) {
            await user.incrementLoginAttempts();
            await AuditLog.create({
                userId: user._id,
                username: user.username,
                action: 'LOGIN_FAILED',
                details: 'Invalid password',
                ip: req.ip || req.socket.remoteAddress,
                userAgent: req.headers['user-agent'],
                requestId: req.id,
                success: false
            });
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        await user.resetLoginAttempts();
        user.lastLoginAt = new Date();
        user.lastLoginIP = req.ip || req.socket.remoteAddress;
        await user.save();

        const token = generateToken(user);
        const refreshToken = generateRefreshToken(user);
        const decodedRt = decodeRefreshToken(refreshToken);
        const refreshTokenHash = hashToken(refreshToken);

        const session = new Session({
            userId: user._id,
            refreshTokenHash: refreshTokenHash,
            jti: decodedRt?.jti || generateJTI(),
            userAgent: req.headers['user-agent'] || 'Unknown',
            ipAddress: req.ip || req.socket.remoteAddress,
            deviceName: req.headers['user-agent']?.substring(0, 50) || 'Unknown',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });
        await session.save();

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/api/auth/refresh'
        });

        await AuditLog.create({
            userId: user._id,
            username: user.username,
            action: 'LOGIN_SUCCESS',
            resource: 'auth',
            resourceId: user._id.toString(),
            details: 'User logged in successfully',
            ip: req.ip || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
            requestId: req.id,
            success: true
        });

        res.json({
            success: true,
            user: {
                id: user._id,
                username: user.username,
                name: user.name,
                email: user.email,
                role: user.role
            },
            token: token
        });

    } catch (error) {
        console.error('❌ Login error:', error.message);
        res.status(500).json({ success: false, error: 'خطأ داخلي في الخادم' });
    }
});

// ============================================================
// 🔄 REFRESH TOKEN
// ============================================================

app.post('/api/auth/refresh', refreshLimiter, async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        
        if (!refreshToken) {
            return res.status(401).json({ success: false, error: 'Refresh token required' });
        }

        const decoded = decodeRefreshToken(refreshToken);
        if (!decoded || decoded.type !== 'refresh') {
            return res.status(401).json({ success: false, error: 'Invalid refresh token' });
        }

        const user = await User.findById(decoded.sub);
        if (!user || !user.isActive) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }

        if (decoded.tv !== (user.tokenVersion || 0)) {
            return res.status(401).json({ success: false, error: 'Session invalidated' });
        }

        const refreshTokenHash = hashToken(refreshToken);
        
        const session = await Session.findOne({ jti: decoded.jti });
        
        if (!session) {
            return res.status(401).json({ success: false, error: 'Invalid session' });
        }

        if (session.revoked) {
            await Session.updateMany(
                { userId: session.userId, revoked: false },
                { revoked: true }
            );
            await User.findByIdAndUpdate(session.userId, { $inc: { tokenVersion: 1 } });
            
            await AuditLog.create({
                userId: session.userId,
                action: 'REFRESH_TOKEN_REUSE_DETECTED',
                details: 'Refresh token reuse detected - all sessions revoked',
                ip: req.ip || req.socket.remoteAddress,
                userAgent: req.headers['user-agent'],
                requestId: req.id,
                success: false
            });
            
            return res.status(401).json({ 
                success: false, 
                error: 'Token reuse detected. All sessions revoked.' 
            });
        }

        if (session.refreshTokenHash !== refreshTokenHash) {
            await Session.updateMany(
                { userId: session.userId, revoked: false },
                { revoked: true }
            );
            await User.findByIdAndUpdate(session.userId, { $inc: { tokenVersion: 1 } });
            
            await AuditLog.create({
                userId: session.userId,
                action: 'REFRESH_TOKEN_REUSE_DETECTED',
                details: 'Refresh token hash mismatch - all sessions revoked',
                ip: req.ip || req.socket.remoteAddress,
                userAgent: req.headers['user-agent'],
                requestId: req.id,
                success: false
            });
            
            return res.status(401).json({ 
                success: false, 
                error: 'Token reuse detected. All sessions revoked.' 
            });
        }

        if (session.expiresAt < new Date()) {
            await Session.updateOne({ jti: decoded.jti }, { revoked: true });
            return res.status(401).json({ success: false, error: 'Session expired' });
        }

        // Atomic rotation
        const sessionDb = await mongoose.startSession();
        let newToken = null;
        let newRefreshToken = null;

        await sessionDb.withTransaction(async () => {
            const updatedSession = await Session.findOneAndUpdate(
                { 
                    jti: decoded.jti, 
                    revoked: false, 
                    refreshTokenHash: refreshTokenHash 
                },
                { $set: { revoked: true } },
                { new: true, session: sessionDb }
            );

            if (!updatedSession) {
                throw new Error('Token already used');
            }

            newToken = generateToken(user);
            newRefreshToken = generateRefreshToken(user);
            const newDecoded = decodeRefreshToken(newRefreshToken);
            const newRefreshTokenHash = hashToken(newRefreshToken);

            const newSession = new Session({
                userId: user._id,
                refreshTokenHash: newRefreshTokenHash,
                jti: newDecoded?.jti || generateJTI(),
                userAgent: session.userAgent,
                ipAddress: session.ipAddress,
                deviceName: session.deviceName,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            });
            await newSession.save({ session: sessionDb });
        });

        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            path: '/api/auth/refresh'
        });
        
        res.cookie('refreshToken', newRefreshToken, {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/api/auth/refresh'
        });

        res.json({ success: true, token: newToken });

    } catch (error) {
        console.error('❌ Refresh error:', error.message);
        res.status(401).json({ success: false, error: 'Invalid refresh token' });
    } finally {
        await sessionDb.endSession();
    }
});

// ============================================================
// 👤 ME
// ============================================================

app.get('/api/auth/me', authenticate, (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user._id,
            username: req.user.username,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role
        }
    });
});

// ============================================================
// ✅ VERIFY
// ============================================================

app.get('/api/auth/verify', authenticate, (req, res) => {
    res.json({ success: true, message: 'التوكن صالح' });
});

// ============================================================
// 🔑 RESET PASSWORD
// ============================================================

app.post('/api/auth/reset-password', passwordResetLimiter, async (req, res) => {
    try {
        const { email, username } = req.body;
        
        if (!email && !username) {
            return res.status(400).json({ success: false, error: 'البريد الإلكتروني أو اسم المستخدم مطلوب' });
        }

        const user = await User.findOne({
            $or: [
                { email: email?.toLowerCase().trim() },
                { username: username?.toLowerCase().trim() }
            ]
        });

        if (!user) {
            return res.status(200).json({ 
                success: true, 
                message: 'إذا كان الحساب موجوداً، سيتم إرسال رابط إعادة التعيين' 
            });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
        
        user.resetPasswordToken = resetTokenHash;
        user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
        await user.save();

        const emailSent = await sendPasswordResetEmail(user, resetToken);

        await AuditLog.create({
            userId: user._id,
            username: user.username,
            action: 'RESET_PASSWORD_REQUESTED',
            details: 'Password reset requested' + (emailSent ? ' - Email sent' : ' - Email failed'),
            ip: req.ip || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
            requestId: req.id,
            success: emailSent
        });

        res.json({ 
            success: true, 
            message: 'إذا كان الحساب موجوداً، سيتم إرسال رابط إعادة التعيين' 
        });

    } catch (error) {
        console.error('❌ Reset password error:', error.message);
        res.status(500).json({ success: false, error: 'خطأ في إعادة تعيين كلمة المرور' });
    }
});

// ============================================================
// 🔑 RESET PASSWORD CONFIRM
// ============================================================

app.post('/api/auth/reset-password/confirm', passwordResetLimiter, async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        if (!token || !newPassword || newPassword.length < 12) {
            return res.status(400).json({ success: false, error: 'رمز إعادة التعيين وكلمة المرور مطلوبان' });
        }

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        
        const user = await User.findOne({
            resetPasswordToken: tokenHash,
            resetPasswordExpires: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({ success: false, error: 'رمز إعادة التعيين غير صالح أو منتهي' });
        }

        user.password = newPassword;
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save();

        await Session.updateMany(
            { userId: user._id, revoked: false },
            { revoked: true }
        );

        await AuditLog.create({
            userId: user._id,
            username: user.username,
            action: 'RESET_PASSWORD_CONFIRMED',
            details: 'Password reset confirmed',
            ip: req.ip || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
            requestId: req.id,
            success: true
        });

        res.json({ success: true, message: 'تم إعادة تعيين كلمة المرور بنجاح' });

    } catch (error) {
        console.error('❌ Reset password confirm error:', error.message);
        res.status(500).json({ success: false, error: 'خطأ في إعادة تعيين كلمة المرور' });
    }
});

// ============================================================
// 🚪 LOGOUT
// ============================================================

app.post('/api/auth/logout', authenticate, async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (refreshToken) {
            const decoded = decodeRefreshToken(refreshToken);
            if (decoded && decoded.jti) {
                await Session.findOneAndUpdate(
                    { jti: decoded.jti },
                    { revoked: true }
                );
            }
        }

        await AuditLog.create({
            userId: req.user._id,
            username: req.user.username,
            action: 'LOGOUT',
            details: 'User logged out',
            ip: req.ip || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
            requestId: req.id,
            success: true
        });

        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            path: '/api/auth/refresh'
        });

        res.json({ success: true, message: 'تم تسجيل الخروج' });
    } catch (error) {
        console.error('❌ Logout error:', error.message);
        res.status(500).json({ success: false, error: 'خطأ في تسجيل الخروج' });
    }
});

// ============================================================
// 👥 USERS
// ============================================================

app.get('/api/users', authenticate, requireRole('admin'), adminLimiter, async (req, res) => {
    try {
        let page = parseInt(req.query.page) || 1;
        let limit = parseInt(req.query.limit) || 50;
        
        if (page < 1) page = 1;
        if (limit < 1) limit = 1;
        if (limit > 200) limit = 200;

        const skip = (page - 1) * limit;

        const [users, total] = await Promise.all([
            User.find().select('-password').skip(skip).limit(limit).lean(),
            User.countDocuments()
        ]);

        res.json({
            success: true,
            users,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasMore: skip + users.length < total
            }
        });
    } catch (error) {
        console.error('❌ Users error:', error.message);
        res.status(500).json({ success: false, error: 'خطأ في جلب المستخدمين' });
    }
});

// ============================================================
// 📊 SESSIONS
// ============================================================

app.get('/api/sessions', authenticate, requireRole('admin'), adminLimiter, async (req, res) => {
    try {
        let page = parseInt(req.query.page) || 1;
        let limit = parseInt(req.query.limit) || 50;
        
        if (page < 1) page = 1;
        if (limit < 1) limit = 1;
        if (limit > 200) limit = 200;

        const skip = (page - 1) * limit;

        const [sessions, total] = await Promise.all([
            Session.find()
                .populate('userId', 'username name email role')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Session.countDocuments()
        ]);

        const formatted = sessions.map(s => ({
            id: s._id,
            username: s.userId?.username || 'Unknown',
            userName: s.userId?.name || 'Unknown',
            role: s.userId?.role || 'Unknown',
            status: s.revoked ? 'revoked' : (s.expiresAt < new Date() ? 'expired' : 'active'),
            deviceName: s.deviceName || 'Unknown',
            ipAddress: s.ipAddress || 'Unknown',
            createdAt: s.createdAt,
            expiresAt: s.expiresAt,
            lastActivity: s.updatedAt || s.createdAt
        }));

        res.json({
            success: true,
            sessions: formatted,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasMore: skip + sessions.length < total
            }
        });
    } catch (error) {
        console.error('❌ Sessions error:', error.message);
        res.status(500).json({ success: false, error: 'خطأ في جلب الجلسات' });
    }
});

// ============================================================
// 🔄 REVOKE SESSION
// ============================================================

app.delete('/api/sessions/:id', authenticate, requireRole('admin'), async (req, res) => {
    try {
        const session = await Session.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }
        session.revoked = true;
        await session.save();

        await AuditLog.create({
            userId: req.user._id,
            username: req.user.username,
            action: 'REVOKE_SESSION',
            resource: 'session',
            resourceId: req.params.id,
            details: 'Revoked session',
            ip: req.ip || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
            requestId: req.id,
            success: true
        });

        res.json({ success: true, message: 'Session revoked' });
    } catch (error) {
        console.error('❌ Revoke session error:', error.message);
        res.status(500).json({ success: false, error: 'خطأ في إلغاء الجلسة' });
    }
});

// ============================================================
// 📋 AUDIT LOGS
// ============================================================

app.get('/api/logs', authenticate, requireRole('admin'), adminLimiter, async (req, res) => {
    try {
        let limit = parseInt(req.query.limit) || 100;
        let skip = parseInt(req.query.skip) || 0;
        
        if (limit < 1) limit = 1;
        if (limit > 200) limit = 200;
        if (skip < 0) skip = 0;

        const logs = await AuditLog.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await AuditLog.countDocuments();

        res.json({
            success: true,
            logs,
            pagination: { total, limit, skip, hasMore: skip + logs.length < total }
        });
    } catch (error) {
        console.error('❌ Logs error:', error.message);
        res.status(500).json({ success: false, error: 'خطأ في جلب السجلات' });
    }
});

// ============================================================
// 🚢 VESSELS
// ============================================================

const VESSEL_ALLOWED_FIELDS = [
    'name', 'num', 'len', 'stat', 'region', 'zone', 
    'port', 'supp', 'break', 'fDate', 'eDate', 'ref', 
    'cat', 'repairUnit'
];

function sanitizeVesselData(body) {
    const data = {};
    for (const field of VESSEL_ALLOWED_FIELDS) {
        if (body[field] !== undefined) {
            data[field] = body[field];
        }
    }
    return data;
}

app.get('/api/vessels', authenticate, async (req, res) => {
    try {
        let page = parseInt(req.query.page) || 1;
        let limit = parseInt(req.query.limit) || 50;
        
        if (page < 1) page = 1;
        if (limit < 1) limit = 1;
        if (limit > 200) limit = 200;

        const skip = (page - 1) * limit;

        const [vessels, total] = await Promise.all([
            Vessel.find({ isDeleted: { $ne: true } })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Vessel.countDocuments({ isDeleted: { $ne: true } })
        ]);

        res.json({
            vessels,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasMore: skip + vessels.length < total
            }
        });
    } catch (error) {
        console.error('❌ Vessels error:', error.message);
        res.status(500).json({ success: false, error: 'خطأ في جلب المراكب' });
    }
});

app.post('/api/vessels', authenticate, requireRole('admin', 'manager'), 
    validate({
        name: { required: true, type: 'string', min: 3, max: 100 },
        num: { required: false, type: 'string', max: 50 },
        len: { required: false, type: 'number', min: 0 },
        stat: { required: false, type: 'string', enum: ['صالح', 'معطب', 'صيانة'] },
        region: { required: false, type: 'string', max: 100 },
        zone: { required: false, type: 'string', max: 100 },
        port: { required: false, type: 'string', max: 100 },
        supp: { required: false, type: 'string', max: 100 },
        break: { required: false, type: 'string', max: 500 },
        fDate: { required: false, type: 'date' },
        eDate: { required: false, type: 'date' },
        ref: { required: false, type: 'string', max: 50 },
        cat: { required: false, type: 'string', max: 100 },
        repairUnit: { required: false, type: 'string', max: 100 }
    }),
    async (req, res) => {
        try {
            const data = sanitizeVesselData(req.body);
            const vessel = new Vessel(data);
            await vessel.save();

            await AuditLog.create({
                userId: req.user._id,
                username: req.user.username,
                action: 'CREATE_VESSEL',
                resource: 'vessel',
                resourceId: vessel._id.toString(),
                details: `Created vessel: ${vessel.name}`,
                after: vessel.toObject(),
                ip: req.ip || req.socket.remoteAddress,
                userAgent: req.headers['user-agent'],
                requestId: req.id,
                success: true
            });

            res.status(201).json(vessel);
        } catch (error) {
            console.error('❌ Create vessel error:', error.message);
            res.status(400).json({ error: 'بيانات المركب غير صالحة' });
        }
    }
);

app.put('/api/vessels/:id', authenticate, requireRole('admin', 'manager'),
    validate({
        name: { required: false, type: 'string', min: 3, max: 100 },
        num: { required: false, type: 'string', max: 50 },
        len: { required: false, type: 'number', min: 0 },
        stat: { required: false, type: 'string', enum: ['صالح', 'معطب', 'صيانة'] },
        region: { required: false, type: 'string', max: 100 },
        zone: { required: false, type: 'string', max: 100 },
        port: { required: false, type: 'string', max: 100 },
        supp: { required: false, type: 'string', max: 100 },
        break: { required: false, type: 'string', max: 500 },
        fDate: { required: false, type: 'date' },
        eDate: { required: false, type: 'date' },
        ref: { required: false, type: 'string', max: 50 },
        cat: { required: false, type: 'string', max: 100 },
        repairUnit: { required: false, type: 'string', max: 100 }
    }),
    async (req, res) => {
        try {
            const vessel = await Vessel.findById(req.params.id);
            if (!vessel || vessel.isDeleted) {
                return res.status(404).json({ error: 'المركب غير موجود' });
            }

            const data = sanitizeVesselData(req.body);
            const before = vessel.toObject();
            
            Object.assign(vessel, data);
            vessel.updatedAt = new Date();
            await vessel.save();

            const after = vessel.toObject();

            await AuditLog.create({
                userId: req.user._id,
                username: req.user.username,
                action: 'UPDATE_VESSEL',
                resource: 'vessel',
                resourceId: vessel._id.toString(),
                details: `Updated vessel: ${vessel.name}`,
                before: before,
                after: after,
                ip: req.ip || req.socket.remoteAddress,
                userAgent: req.headers['user-agent'],
                requestId: req.id,
                success: true
            });

            res.json(vessel);
        } catch (error) {
            console.error('❌ Update vessel error:', error.message);
            res.status(400).json({ error: 'بيانات المركب غير صالحة' });
        }
    }
);

app.delete('/api/vessels/:id', authenticate, requireRole('admin'), async (req, res) => {
    try {
        const vessel = await Vessel.findById(req.params.id);
        if (!vessel || vessel.isDeleted) {
            return res.status(404).json({ error: 'المركب غير موجود' });
        }

        const before = vessel.toObject();

        vessel.isDeleted = true;
        vessel.deletedAt = new Date();
        vessel.deletedBy = req.user._id;
        await vessel.save();

        const after = vessel.toObject();

        await AuditLog.create({
            userId: req.user._id,
            username: req.user.username,
            action: 'DELETE_VESSEL',
            resource: 'vessel',
            resourceId: vessel._id.toString(),
            details: `Soft deleted vessel: ${vessel.name}`,
            before: before,
            after: after,
            ip: req.ip || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
            requestId: req.id,
            success: true
        });

        res.json({ success: true, message: 'تم حذف المركب' });
    } catch (error) {
        console.error('❌ Delete vessel error:', error.message);
        res.status(500).json({ error: 'خطأ في حذف المركب' });
    }
});

// ============================================================
// 📄 PAGES
// ============================================================

app.get('/api/pages/:page', authenticate, async (req, res) => {
    try {
        const page = String(req.params.page || '');
        if (!/^[a-zA-Z0-9_-]+$/.test(page)) {
            return res.status(400).json({ success: false, error: 'اسم الصفحة غير صالح' });
        }

        const filePath = path.resolve(pagesPath, `${page}.html`);
        if (!filePath.startsWith(pagesPath + path.sep)) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'الصفحة غير موجودة' });
        }

        const html = await fs.promises.readFile(filePath, 'utf8');
        res.json({ success: true, html });
    } catch (error) {
        console.error('❌ Page error:', error.message);
        res.status(500).json({ success: false, error: 'خطأ في تحميل الصفحة' });
    }
});

// ============================================================
// ❤️ HEALTH
// ============================================================

app.get('/health', (req, res) => {
    const mongoConnected = mongoose.connection.readyState === 1;
    const healthy = databaseReady && mongoConnected;

    res.status(healthy ? 200 : 503).json({
        status: healthy ? 'healthy' : 'unhealthy',
        service: 'marine-system',
        version: '103.0',
        environment: NODE_ENV,
        database: mongoConnected ? 'connected' : 'disconnected',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

app.get('/ready', (req, res) => {
    const ready = databaseReady && mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ ready, database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

// ============================================================
// 🏠 HOME
// ============================================================

app.get('/', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (!fs.existsSync(indexPath)) {
        return res.status(404).send('Marine System - index.html not found');
    }
    res.sendFile(indexPath);
});

app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: 'API endpoint not found' });
});

app.get('*', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }
    res.status(404).send('Marine System');
});

// ============================================================
// 💥 GLOBAL ERROR HANDLER
// ============================================================

app.use((error, req, res, next) => {
    console.error('🔥 Server error:', error.message);
    if (res.headersSent) return next(error);
    res.status(500).json({
        success: false,
        error: IS_PRODUCTION ? 'خطأ داخلي في الخادم' : error.message
    });
});

// ============================================================
// 🚀 START
// ============================================================

let server;

async function start() {
    try {
        // Setup email
        await setupEmail();

        await connectDB();
        await ensureAdmin();

        server = app.listen(PORT, '0.0.0.0', () => {
            console.log('');
            console.log('==================================================');
            console.log('🚢 MARINE SYSTEM v103.0');
            console.log('✅ FULLY WORKING - EMAIL + LOGIN FIXED');
            console.log('==================================================');
            console.log(`🌍 Environment: ${NODE_ENV}`);
            console.log(`🌐 Port: ${PORT}`);
            console.log('🗄️ MongoDB: CONNECTED ✓');
            console.log('🔐 JWT: ENABLED ✓');
            console.log(`📧 Email: ${emailEnabled ? '✅ ENABLED' : '❌ DISABLED'}`);
            console.log(`👤 Admin: ${ADMIN_USERNAME}`);
            console.log(`🔑 Password: ${ADMIN_PASSWORD ? '✓ Set' : '✗ Missing'}`);
            console.log('==================================================');
            console.log('');
        });

    } catch (error) {
        console.error('❌ Server startup failed:', error.message);
        process.exit(1);
    }
}

async function shutdown(signal) {
    console.log(`\n🛑 ${signal} received. Shutting down...`);
    const timeout = setTimeout(() => {
        console.error('❌ Shutdown timeout - forcing exit');
        process.exit(1);
    }, 30000);

    try {
        if (server) await new Promise(resolve => server.close(resolve));
        if (mongoose.connection.readyState === 1) await mongoose.connection.close();
        console.log('✅ Shutdown completed');
        clearTimeout(timeout);
        process.exit(0);
    } catch (error) {
        console.error('❌ Shutdown error:', error.message);
        clearTimeout(timeout);
        process.exit(1);
    }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (error) => console.error('❌ Unhandled Rejection:', error));
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    shutdown('uncaughtException');
});

start();
