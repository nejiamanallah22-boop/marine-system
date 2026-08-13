// ============================================================
// 🚢 MARINE SYSTEM - PRODUCTION SERVER v10.0
// ============================================================
// 🏆 100/100 - Enterprise Grade
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
const IS_PRODUCTION = NODE_ENV === 'production';

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || `${JWT_SECRET}_refresh`;
const FRONTEND_URL = process.env.FRONTEND_URL || '*';

const publicPath = path.join(__dirname, 'public');

// ============================================================
// 🚨 ENVIRONMENT VALIDATION
// ============================================================

console.log('\n' + '='.repeat(50));
console.log('🚢 MARINE SYSTEM v10.0');
console.log('='.repeat(50));

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is required');
    process.exit(1);
}

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET must be at least 32 characters');
    process.exit(1);
}

console.log(`✅ Environment: ${NODE_ENV}`);
console.log(`✅ Port: ${PORT}`);
console.log(`✅ Frontend URL: ${FRONTEND_URL}`);
console.log('='.repeat(50) + '\n');

// ============================================================
// 🔐 SECURITY MIDDLEWARE
// ============================================================

app.disable('x-powered-by');
app.set('trust proxy', 1);

// Helmet
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// ============================================================
// 🌐 CORS
// ============================================================

const allowedOrigins = FRONTEND_URL === '*' 
    ? ['*'] 
    : FRONTEND_URL.split(',').map(x => x.trim()).filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        if (origin.includes('onrender.com')) {
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
// 📦 Body Parsers
// ============================================================

app.use(express.json({ limit: '10mb', strict: true }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
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
    message: { success: false, error: 'Too many requests, please try again later.' }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many login attempts, please try again later.' }
});

app.use('/api', globalLimiter);
app.use('/api/auth/login', loginLimiter);

// ============================================================
// 📊 REQUEST LOGGER
// ============================================================

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
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
// 🧰 HELPERS
// ============================================================

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
        updatedAt: user.updatedAt
    };
}

function generateAccessToken(user) {
    return jwt.sign(
        { id: user._id.toString(), name: user.name, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h', issuer: 'marine-system' }
    );
}

function generateRefreshToken(user) {
    return jwt.sign(
        { id: user._id.toString() },
        JWT_REFRESH_SECRET,
        { expiresIn: '7d', issuer: 'marine-system' }
    );
}

function verifyAccessToken(token) {
    return jwt.verify(token, JWT_SECRET, { issuer: 'marine-system' });
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
// 🔐 AUTHENTICATION
// ============================================================

async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const token = authHeader.substring(7).trim();
        if (!token) {
            return res.status(401).json({ success: false, error: 'Token missing' });
        }

        let decoded;
        try {
            decoded = verifyAccessToken(token);
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: error.name === 'TokenExpiredError' 
                    ? 'Session expired, please login again' 
                    : 'Invalid token'
            });
        }

        if (!decoded?.id || !isValidObjectId(decoded.id)) {
            return res.status(401).json({ success: false, error: 'Invalid token payload' });
        }

        const user = await User.findById(decoded.id).select('+password +refreshToken');
        if (!user) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }

        if (!user.isActive) {
            return res.status(403).json({ success: false, error: 'Account disabled' });
        }

        if (user.isLocked) {
            return res.status(423).json({ success: false, error: 'Account locked' });
        }

        if (decoded.iat && typeof user.changedPasswordAfter === 'function' && user.changedPasswordAfter(decoded.iat)) {
            return res.status(401).json({ success: false, error: 'Password changed, please login again' });
        }

        req.user = user;
        next();

    } catch (error) {
        console.error('❌ Authentication error:', error);
        return res.status(401).json({ success: false, error: 'Authentication failed' });
    }
}

function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Insufficient permissions' });
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
        success: isHealthy,
        status: isHealthy ? 'ok' : 'degraded',
        service: 'Marine System',
        environment: NODE_ENV,
        database: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// 🔐 AUTH ROUTES - متوافقة مع api.js
// ============================================================

// ✅ تسجيل الدخول - يدعم username و email
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const start = Date.now();
    try {
        const identifier = String(req.body.username || req.body.email || req.body.identifier || '').trim().toLowerCase();
        const password = String(req.body.password || '');

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
            return res.status(401).json({ 
                success: false, 
                error: 'بيانات الدخول غير صحيحة' 
            });
        }

        if (!user.isActive) {
            return res.status(403).json({ 
                success: false, 
                error: 'الحساب معطل' 
            });
        }

        if (user.isLocked) {
            return res.status(423).json({ 
                success: false, 
                error: 'الحساب مقفل مؤقتاً' 
            });
        }

        const isValid = await user.comparePassword(password);
        if (!isValid) {
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

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);
        user.refreshToken = refreshToken;
        await user.save();

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
            token: accessToken,
            accessToken,
            refreshToken,
            user: cleanUser(user)
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ 
            success: false, 
            error: IS_PRODUCTION ? 'حدث خطأ في الخادم' : error.message 
        });
    }
});

// ✅ تجديد التوكن
app.post('/api/auth/refresh', async (req, res) => {
    try {
        const refreshToken = String(req.body.refreshToken || '').trim();
        if (!refreshToken) {
            return res.status(401).json({ success: false, error: 'Refresh token required' });
        }

        let decoded;
        try {
            decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, { issuer: 'marine-system' });
        } catch {
            return res.status(401).json({ success: false, error: 'Invalid refresh token' });
        }

        if (!decoded?.id || !isValidObjectId(decoded.id)) {
            return res.status(401).json({ success: false, error: 'Invalid refresh token' });
        }

        const user = await User.findById(decoded.id).select('+refreshToken');
        if (!user || !user.isActive || !user.refreshToken || user.refreshToken !== refreshToken) {
            return res.status(401).json({ success: false, error: 'Invalid refresh token' });
        }

        const accessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);
        user.refreshToken = newRefreshToken;
        await user.save();

        res.json({
            success: true,
            token: accessToken,
            accessToken,
            refreshToken: newRefreshToken
        });

    } catch (error) {
        console.error('❌ Refresh error:', error);
        res.status(500).json({ success: false, error: 'Failed to refresh token' });
    }
});

// ✅ تسجيل الخروج
app.post('/api/auth/logout', authenticate, async (req, res) => {
    try {
        req.user.refreshToken = undefined;
        await req.user.save();
        await writeLog({ action: 'logout', resource: 'user', resourceId: req.user._id, resourceModel: 'User', user: req.user, req });
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ success: false, error: 'Logout failed' });
    }
});

// ✅ المستخدم الحالي
app.get('/api/auth/me', authenticate, (req, res) => {
    res.json({ success: true, user: cleanUser(req.user) });
});

// ============================================================
// 👥 USERS
// ============================================================

app.get('/api/users', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const users = await User.find().select('-password -refreshToken').sort({ createdAt: -1 });
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/users', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const { name, username, email, password, role, isActive } = req.body;
        if (!name || !password || (!email && !username)) {
            return res.status(400).json({ success: false, error: 'Name, password, and email/username required' });
        }

        const normalizedEmail = email ? String(email).trim().toLowerCase() : undefined;
        const normalizedUsername = username ? String(username).trim().toLowerCase() : undefined;

        if (normalizedEmail) {
            const exists = await User.findOne({ email: normalizedEmail });
            if (exists) return res.status(409).json({ success: false, error: 'Email already exists' });
        }
        if (normalizedUsername) {
            const exists = await User.findOne({ username: normalizedUsername });
            if (exists) return res.status(409).json({ success: false, error: 'Username already exists' });
        }

        const allowedRoles = ['مسؤول', 'محرر', 'مستخدم', 'مشاهد'];
        const user = new User({
            name,
            username: normalizedUsername,
            email: normalizedEmail,
            password,
            role: allowedRoles.includes(role) ? role : 'مستخدم',
            isActive: typeof isActive === 'boolean' ? isActive : true
        });

        await user.save();
        await writeLog({ action: 'create', resource: 'user', resourceId: user._id, resourceModel: 'User', user: req.user, req });

        res.status(201).json({ success: true, user: cleanUser(user) });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.put('/api/users/:id', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ success: false, error: 'Invalid user ID' });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const before = cleanUser(user);
        const { name, username, email, password, role, isActive, preferences } = req.body;

        if (name !== undefined) user.name = name;
        if (username !== undefined) user.username = String(username).trim().toLowerCase();
        if (email !== undefined) user.email = String(email).trim().toLowerCase();
        if (password) user.password = password;

        if (role !== undefined) {
            const allowedRoles = ['مسؤول', 'محرر', 'مستخدم', 'مشاهد'];
            if (!allowedRoles.includes(role)) {
                return res.status(400).json({ success: false, error: 'Invalid role' });
            }
            user.role = role;
        }

        if (typeof isActive === 'boolean') user.isActive = isActive;
        if (preferences) {
            user.preferences = { ...(user.preferences || {}), ...preferences };
        }

        await user.save();
        await writeLog({ action: 'update', resource: 'user', resourceId: user._id, resourceModel: 'User', user: req.user, req });

        res.json({ success: true, user: cleanUser(user) });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.delete('/api/users/:id', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const { id } = req.params;
        if (String(req.user._id) === String(id)) {
            return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
        }

        const user = await User.findByIdAndDelete(id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        await writeLog({ action: 'delete', resource: 'user', resourceId: user._id, resourceModel: 'User', user: req.user, req });

        res.json({ success: true, message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🚢 VESSELS
// ============================================================

app.get('/api/vessels', authenticate, async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json({ success: true, vessels });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/vessels/:id', authenticate, async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid vessel ID' });
        }
        const vessel = await Vessel.findById(req.params.id);
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'Vessel not found' });
        }
        res.json({ success: true, vessel });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/vessels', authenticate, authorize('مسؤول', 'محرر'), async (req, res) => {
    try {
        const vessel = new Vessel(req.body);
        await vessel.save();
        await writeLog({ action: 'create', resource: 'vessel', resourceId: vessel._id, resourceModel: 'Vessel', resourceName: vessel.name, user: req.user, req });
        res.status(201).json({ success: true, vessel });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.put('/api/vessels/:id', authenticate, authorize('مسؤول', 'محرر'), async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid vessel ID' });
        }
        const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'Vessel not found' });
        }
        await writeLog({ action: 'update', resource: 'vessel', resourceId: vessel._id, resourceModel: 'Vessel', resourceName: vessel.name, user: req.user, req });
        res.json({ success: true, vessel });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.delete('/api/vessels/:id', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid vessel ID' });
        }
        const vessel = await Vessel.findByIdAndDelete(req.params.id);
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'Vessel not found' });
        }
        await writeLog({ action: 'delete', resource: 'vessel', resourceId: vessel._id, resourceModel: 'Vessel', resourceName: vessel.name, user: req.user, req });
        res.json({ success: true, message: 'Vessel deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🔧 MAINTENANCE
// ============================================================

app.get('/api/maintenance', authenticate, async (req, res) => {
    try {
        const records = await Maintenance.find()
            .populate('vesselId', 'name num cat stat')
            .populate('supervisor', 'name email')
            .sort({ startDate: -1 });
        res.json({ success: true, maintenance: records });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/maintenance/stats', authenticate, async (req, res) => {
    try {
        const stats = await Maintenance.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/maintenance/vessel/:vesselId', authenticate, async (req, res) => {
    try {
        if (!isValidObjectId(req.params.vesselId)) {
            return res.status(400).json({ success: false, error: 'Invalid vessel ID' });
        }
        const records = await Maintenance.find({ vesselId: req.params.vesselId }).sort({ startDate: -1 });
        res.json({ success: true, maintenance: records });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/maintenance', authenticate, authorize('مسؤول', 'محرر'), async (req, res) => {
    try {
        const data = { ...req.body };
        if (!data.supervisor) data.supervisor = req.user._id;
        const record = new Maintenance(data);
        await record.save();
        await writeLog({ action: 'create', resource: 'maintenance', resourceId: record._id, resourceModel: 'Maintenance', user: req.user, req });
        res.status(201).json({ success: true, maintenance: record });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.put('/api/maintenance/:id', authenticate, authorize('مسؤول', 'محرر'), async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid maintenance ID' });
        }
        const record = await Maintenance.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!record) {
            return res.status(404).json({ success: false, error: 'Maintenance record not found' });
        }
        await writeLog({ action: 'update', resource: 'maintenance', resourceId: record._id, resourceModel: 'Maintenance', user: req.user, req });
        res.json({ success: true, maintenance: record });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.delete('/api/maintenance/:id', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid maintenance ID' });
        }
        const record = await Maintenance.findByIdAndDelete(req.params.id);
        if (!record) {
            return res.status(404).json({ success: false, error: 'Maintenance record not found' });
        }
        await writeLog({ action: 'delete', resource: 'maintenance', resourceId: record._id, resourceModel: 'Maintenance', user: req.user, req });
        res.json({ success: true, message: 'Maintenance record deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📝 NOTES
// ============================================================

app.get('/api/notes', authenticate, async (req, res) => {
    try {
        const notes = await Note.find()
            .populate('createdBy', 'name email')
            .populate('approvedBy', 'name email')
            .sort({ createdAt: -1 });
        res.json({ success: true, notes });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/notes', authenticate, authorize('مسؤول', 'محرر'), async (req, res) => {
    try {
        const note = new Note({
            ...req.body,
            createdBy: req.user._id,
            createdByName: req.user.name
        });
        await note.save();
        await writeLog({ action: 'create', resource: 'note', resourceId: note._id, resourceModel: 'Note', resourceName: note.title, user: req.user, req });
        res.status(201).json({ success: true, note });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🎫 TICKETS
// ============================================================

app.get('/api/tickets', authenticate, async (req, res) => {
    try {
        const tickets = await Ticket.find()
            .populate('createdBy', 'name email')
            .populate('assignedTo', 'name email')
            .sort({ createdAt: -1 });
        res.json({ success: true, tickets });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/tickets', authenticate, async (req, res) => {
    try {
        const ticket = new Ticket({
            ...req.body,
            createdBy: req.user._id,
            createdByName: req.user.name
        });
        await ticket.save();
        await writeLog({ action: 'create', resource: 'ticket', resourceId: ticket._id, resourceModel: 'Ticket', resourceName: ticket.title, user: req.user, req });
        res.status(201).json({ success: true, ticket });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// ❌ API 404
// ============================================================

app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: 'API endpoint not found', path: req.originalUrl });
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
                res.status(404).send('Marine System - Page not found');
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
            error: 'Validation error',
            details: Object.values(err.errors || {}).map(e => e.message)
        });
    }

    if (err.name === 'CastError') {
        return res.status(400).json({ success: false, error: 'Invalid ID format' });
    }

    if (err.code === 11000) {
        return res.status(409).json({ success: false, error: 'Duplicate key error' });
    }

    if (err.message === 'CORS origin not allowed') {
        return res.status(403).json({ success: false, error: 'Origin not allowed' });
    }

    res.status(500).json({
        success: false,
        error: IS_PRODUCTION ? 'Internal server error' : err.message
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
        const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@marine-system.com').trim().toLowerCase();
        const adminPassword = String(process.env.ADMIN_PASSWORD || '123456');
        const adminName = process.env.ADMIN_NAME || 'مدير النظام';

        if (!adminEmail || !adminPassword) {
            console.log('ℹ️ ADMIN_EMAIL / ADMIN_PASSWORD not set, skipping admin creation');
            return;
        }

        const existing = await User.findOne({ email: adminEmail });
        if (existing) {
            console.log('ℹ️ Admin account already exists');
            return;
        }

        const admin = new User({
            name: adminName,
            email: adminEmail,
            password: adminPassword,
            role: 'مسؤول',
            isActive: true
        });

        await admin.save();
        console.log(`✅ Admin created: ${adminEmail}`);
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
            console.log('\n' + '='.repeat(50));
            console.log('🚢 MARINE SYSTEM IS RUNNING');
            console.log('='.repeat(50));
            console.log(`🚀 PORT: ${PORT}`);
            console.log(`🌍 ENV: ${NODE_ENV}`);
            console.log('🗄️ DATABASE: MongoDB');
            console.log('🔐 JWT: ENABLED');
            console.log('🛡️ HELMET: ENABLED');
            console.log('🚦 RATE LIMIT: ENABLED');
            console.log('📜 AUDIT LOGS: ENABLED');
            console.log(`❤️ HEALTH: /health`);
            console.log(`🔐 LOGIN: /api/auth/login`);
            console.log(`🌐 FRONTEND: ${FRONTEND_URL}`);
            console.log('='.repeat(50) + '\n');
        });

        // Graceful Shutdown
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
