// ============================================================
// 🚀 منظومة الوسائل البحرية - الخادم الرئيسي
// ✅ يستخدم مكتبة الأمان المستقلة
// ============================================================

const express = require('express');
const http = require('http');
const https = require('https');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const xss = require('xss');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// ============================================================
// 📚 استيراد مكتبة الأمان
// ============================================================

const { SecurityManager, CONFIG, logger } = require('./lib/security');

// ============================================================
// ✅ التحقق من المتغيرات البيئية
// ============================================================

const requiredEnvVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    console.error('❌ خطأ: المتغيرات البيئية التالية مفقودة:');
    missingEnvVars.forEach(varName => {
        console.error(`   - ${varName}`);
    });
    console.error('\n📝 قم بإنشاء ملف .env');
    process.exit(1);
}

// ============================================================
// ✅ التحقق من صحة مفتاح التشفير
// ============================================================

const encryptionKey = process.env.ENCRYPTION_KEY;
if (!/^[0-9a-f]{64}$/i.test(encryptionKey)) {
    console.error('❌ خطأ: ENCRYPTION_KEY يجب أن يكون 64 حرفاً Hex (32 بايت)');
    process.exit(1);
}

// ============================================================
// 📋 إعدادات الخادم
// ============================================================

const SERVER_CONFIG = {
    port: parseInt(process.env.PORT) || 3443,
    environment: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
    appName: 'MarineSecuritySystem',
    version: '8.0.0',

    ssl: {
        enabled: process.env.SSL_ENABLED === 'true',
        key: process.env.SSL_KEY_PATH,
        cert: process.env.SSL_CERT_PATH,
        ca: process.env.SSL_CA_PATH
    },

    redis: {
        enabled: process.env.REDIS_ENABLED === 'true',
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB) || 0
    },

    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    
    performance: {
        maxRequestSize: '1mb',
        locationsPerPage: 100,
        maxLocationPages: 100
    }
};

// ============================================================
// 🚀 تهيئة التطبيق والأمان
// ============================================================

const app = express();
const security = new SecurityManager();
let server;
let io;

// ============================================================
// 💾 مدير البيانات
// ============================================================

class DataManager {
    constructor() {
        this.data = {
            users: [],
            vessels: [],
            tickets: [],
            logs: [],
            locations: [],
            incidents: []
        };
        this.filePath = 'data.encrypted';
        this.initialized = false;
        this.locationPage = 0;
        this.locationCache = [];
        this.saveTimer = null;
    }

    async initialize() {
        try {
            await security.initialize();
            
            let encryptedData;
            try {
                encryptedData = await fs.readFile(this.filePath, 'utf8');
            } catch (error) {
                const backups = await this.getBackups();
                if (backups.length > 0) {
                    encryptedData = await fs.readFile(backups[0], 'utf8');
                    logger.info(`✅ تم الاستعادة من: ${backups[0]}`);
                } else {
                    throw new Error('لا توجد نسخ احتياطية');
                }
            }

            const decrypted = security.decrypt(JSON.parse(encryptedData));
            this.data = decrypted;
            logger.info('✅ تم تحميل البيانات');
        } catch (error) {
            logger.info('📝 إنشاء بيانات جديدة');
            await this.createDefaultData();
        }
        this.initialized = true;
    }

    async getBackups() {
        try {
            const files = await fs.readdir('.');
            return files.filter(f => f.startsWith('data.backup.') && f.endsWith('.encrypted'))
                .sort()
                .reverse();
        } catch {
            return [];
        }
    }

    async createDefaultData() {
        if (this.data.users.length > 0) return;

        const hashedPassword = await bcrypt.hash('SecurePass123!', 12);
        const totpSecret = security.generateTOTPSecret();

        this.data.users = [{
            id: uuidv4(),
            name: 'admin',
            password: hashedPassword,
            role: 'القيادة_العليا',
            enabled: true,
            twoFactorSecret: totpSecret.base32,
            twoFactorEnabled: true,
            twoFactorUrl: totpSecret.otpauth_url,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            isAdmin: true,
            mustChangePassword: true
        }];

        this.data.vessels = [];
        this.data.tickets = [];
        this.data.locations = [];

        await this.save(true);

        logger.warn('⚠️ تم إنشاء حساب إداري افتراضي');
        logger.warn('   👤 admin');
        logger.warn('   🔑 SecurePass123!');
        logger.warn('   ⚠️ يرجى تغيير كلمة المرور فوراً!');
    }

    async addLocation(location) {
        this.locationCache.push(location);

        if (this.locationCache.length >= SERVER_CONFIG.performance.locationsPerPage) {
            await this.flushLocationPage();
        }

        this.data.locations.push(location);
        if (this.data.locations.length > 10000) {
            this.data.locations = this.data.locations.slice(-10000);
        }

        await this.save();
        return location;
    }

    async flushLocationPage() {
        if (this.locationCache.length === 0) return;

        try {
            const pageData = {
                page: this.locationPage,
                count: this.locationCache.length,
                data: this.locationCache,
                timestamp: new Date().toISOString()
            };

            const filename = `archive/locations.page.${this.locationPage}.json`;
            await fs.writeFile(filename, JSON.stringify(pageData, null, 2));

            this.locationPage++;
            this.locationCache = [];

            logger.info(`📄 تم حفظ صفحة المواقع #${this.locationPage - 1}`);
        } catch (error) {
            logger.error('❌ فشل حفظ صفحة المواقع:', error);
        }
    }

    async getLocations(page = 0, limit = 100) {
        let locations = this.data.locations.slice(-limit);

        if (page > 0) {
            try {
                const filename = `archive/locations.page.${page}.json`;
                const data = await fs.readFile(filename, 'utf8');
                const parsed = JSON.parse(data);
                locations = parsed.data.concat(locations);
            } catch (error) {
                // الملف غير موجود
            }
        }

        return locations.slice(0, limit);
    }

    async save(immediate = false) {
        if (immediate) {
            return this._saveToFile();
        }
        // استخدام Queue من الأمان
        security.queueEncrypt(this.data);
    }

    async _saveToFile() {
        try {
            const encrypted = security.encrypt(this.data);
            await security.atomicWrite(this.filePath, JSON.stringify(encrypted, null, 2));
            logger.info('💾 تم حفظ البيانات');
        } catch (error) {
            logger.error('❌ فشل حفظ البيانات:', error);
            throw error;
        }
    }

    findUser(name) {
        return this.data.users.find(u => u.name === name && u.enabled);
    }

    findUserById(id) {
        return this.data.users.find(u => u.id === id && u.enabled);
    }

    async validateUser(name, password, twoFactorCode = null) {
        const lockStatus = security.checkLockout(name);
        if (lockStatus.locked) {
            throw new Error(`المستخدم مقفل لمدة ${lockStatus.remaining} دقيقة`);
        }

        const user = this.findUser(name);
        if (!user) {
            security.recordFailedAttempt(name);
            throw new Error('بيانات تسجيل الدخول غير صحيحة');
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            const status = security.recordFailedAttempt(name);
            if (status.locked) {
                throw new Error('تم قفل المستخدم');
            }
            throw new Error('بيانات تسجيل الدخول غير صحيحة');
        }

        if (user.mustChangePassword) {
            throw new Error('يجب تغيير كلمة المرور في أول تسجيل دخول');
        }

        if (user.twoFactorEnabled) {
            if (!twoFactorCode) {
                throw new Error('مطلوب رمز التحقق الثنائي');
            }
            const isValid = security.verifyTOTP(user.twoFactorSecret, twoFactorCode);
            if (!isValid) {
                throw new Error('رمز التحقق الثنائي غير صحيح');
            }
        }

        security.resetFailedAttempts(name);
        user.lastLogin = new Date().toISOString();
        await this.save();

        return user;
    }

    async changePassword(userId, oldPassword, newPassword) {
        const user = this.findUserById(userId);
        if (!user) throw new Error('المستخدم غير موجود');

        const strength = security.validatePasswordStrength(newPassword);
        if (!strength.valid) {
            throw new Error(strength.errors.join('. '));
        }

        const valid = await bcrypt.compare(oldPassword, user.password);
        if (!valid) {
            throw new Error('كلمة المرور القديمة غير صحيحة');
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        user.password = hashedPassword;
        user.mustChangePassword = false;
        user.passwordChangedAt = new Date().toISOString();

        await this.save();
        return true;
    }

    async shutdown() {
        await this.flushLocationPage();
        await this._saveToFile();
        logger.info('✅ تم إغلاق البيانات بشكل آمن');
    }
}

const dataManager = new DataManager();

// ============================================================
// 🛡️ وسائط الأمان (Express)
// ============================================================

function sanitizeInput(obj) {
    if (typeof obj === 'string') {
        return xss(obj, {
            whiteList: {},
            stripIgnoreTag: true,
            stripIgnoreTagBody: ['script', 'style']
        });
    }
    if (typeof obj === 'object' && obj !== null) {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = sanitizeInput(value);
        }
        return result;
    }
    return obj;
}

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: SERVER_CONFIG.isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'"],
            styleSrc: SERVER_CONFIG.isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "https:"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

app.use(cors({
    origin: (origin, callback) => {
        if (SERVER_CONFIG.isProduction) {
            if (!origin || SERVER_CONFIG.allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Origin غير مسموح به'));
            }
        } else {
            callback(null, true);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-2FA-Token']
}));

app.use(compression());
app.use(express.json({ limit: SERVER_CONFIG.performance.maxRequestSize }));
app.use(express.urlencoded({ extended: true, limit: SERVER_CONFIG.performance.maxRequestSize }));

app.use((req, res, next) => {
    if (req.body) req.body = sanitizeInput(req.body);
    if (req.query) req.query = sanitizeInput(req.query);
    if (req.params) req.params = sanitizeInput(req.params);
    next();
});

app.use((req, res, next) => {
    if (security.isIPBlocked(req.ip)) {
        return res.status(403).json({ error: 'عنوان IP محظور' });
    }
    next();
});

const defaultLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'طلبات كثيرة، حاول بعد 15 دقيقة' },
    handler: (req, res) => {
        security.blockIP(req.ip, 'مفرط');
        res.status(429).json({ error: 'تم حظر IP مؤقتاً' });
    }
});
app.use('/api/', defaultLimiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'محاولات كثيرة، حاول بعد 15 دقيقة' }
});

// ============================================================
// ✅ وسيط المصادقة
// ============================================================

const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'مطلوب مصادقة' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'رمز غير صالح' });
        }

        const decoded = security.verifyToken(token, 'access');
        const session = security.validateSession(decoded.sessionId);
        if (!session.valid) {
            return res.status(401).json({ error: 'جلسة غير صالحة' });
        }

        req.user = decoded;
        req.sessionId = decoded.sessionId;
        session.session.lastActivity = Date.now();
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'انتهت صلاحية الجلسة' });
        }
        return res.status(403).json({ error: 'غير مصرح' });
    }
};

const authorize = (resource, action) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'غير مصرح' });
        }

        const user = dataManager.findUserById(req.user.id);
        if (!user || !user.enabled) {
            return res.status(403).json({ error: 'المستخدم غير مفعل' });
        }

        if (!security.hasPermission(user.role, resource, action)) {
            security.logSecurityEvent('UNAUTHORIZED_ACCESS', {
                user: user.name,
                resource,
                action,
                ip: req.ip
            });
            return res.status(403).json({ error: 'ليس لديك صلاحية' });
        }

        const roleConfig = security.getRoleConfig(user.role);
        if (roleConfig?.twoFactorRequired && !req.headers['x-2fa-token']) {
            return res.status(401).json({
                error: 'مطلوب رمز التحقق الثنائي',
                requires2FA: true
            });
        }

        next();
    };
};

const validate = (validations) => {
    return async (req, res, next) => {
        await Promise.all(validations.map(validation => validation.run(req)));

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                errors: errors.array().map(err => ({
                    field: err.param,
                    message: err.msg
                }))
            });
        }
        next();
    };
};

// ============================================================
// 📡 نقاط النهاية
// ============================================================

function getCategory(len) {
    const n = parseFloat(len);
    if (n === 11) return "البروق";
    if (n >= 8 && n <= 12) return "صقور";
    if (n > 12 && n <= 25) return "خوافر";
    if (n >= 30) return "طوافات";
    return "زوارق مزدوجة";
}

// ===== المصادقة =====

app.post('/api/auth/change-password',
    authenticate,
    validate([
        body('oldPassword').notEmpty(),
        body('newPassword').isLength({ min: 8 })
    ]),
    async (req, res) => {
        try {
            await dataManager.changePassword(req.user.id, req.body.oldPassword, req.body.newPassword);
            res.json({ success: true });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

app.post('/api/auth/login',
    authLimiter,
    validate([
        body('name').notEmpty().trim().escape(),
        body('password').notEmpty()
    ]),
    async (req, res) => {
        try {
            const { name, password, twoFactorCode } = req.body;

            const user = await dataManager.validateUser(name, password, twoFactorCode);
            const { session, accessToken, refreshToken } = security.createSession(user, {
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                deviceId: req.headers['x-device-id'] || uuidv4()
            });

            security.logSecurityEvent('LOGIN_SUCCESS', {
                user: user.name,
                role: user.role,
                ip: req.ip
            });

            res.json({
                success: true,
                user: {
                    id: user.id,
                    name: user.name,
                    role: user.role,
                    permissions: security.getRoleConfig(user.role)?.permissions || []
                },
                accessToken,
                refreshToken,
                sessionId: session.id,
                deviceId: session.deviceId,
                sessionTimeout: security.getRoleConfig(user.role)?.sessionTimeout || 3600,
                twoFactorEnabled: user.twoFactorEnabled
            });

        } catch (error) {
            if (error.message.includes('مقفل')) {
                return res.status(423).json({ error: error.message });
            }
            if (error.message.includes('التحقق الثنائي')) {
                return res.status(401).json({
                    error: error.message,
                    requires2FA: true
                });
            }
            if (error.message.includes('تغيير كلمة المرور')) {
                return res.status(401).json({
                    error: error.message,
                    mustChangePassword: true
                });
            }
            res.status(401).json({ error: 'بيانات تسجيل الدخول غير صحيحة' });
        }
    }
);

app.post('/api/auth/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(401).json({ error: 'مطلوب رمز تحديث' });
        }

        const decoded = security.verifyToken(refreshToken, 'refresh');
        const user = dataManager.findUserById(decoded.id);
        if (!user || !user.enabled) {
            return res.status(401).json({ error: 'مستخدم غير موجود' });
        }

        const { session, accessToken, refreshToken: newRefreshToken } = security.createSession(user, {
            deviceId: decoded.deviceId
        });

        res.json({
            accessToken,
            refreshToken: newRefreshToken,
            sessionId: session.id
        });
    } catch (error) {
        res.status(401).json({ error: 'رمز تحديث غير صالح' });
    }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
    security.revokeSession(req.sessionId);
    security.logSecurityEvent('LOGOUT', { user: req.user.name });
    res.json({ success: true });
});

// ===== المراكب =====

app.get('/api/vessels', authenticate, authorize('vessels', 'read'), async (req, res) => {
    try {
        let vessels = dataManager.data.vessels;
        if (req.user.role === 'مشاهد') {
            vessels = vessels.map(v => ({
                id: v.id, name: v.name, num: v.num, len: v.len,
                cat: v.cat, status: v.status, zone: v.zone, port: v.port
            }));
        }
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب البيانات' });
    }
});

app.post('/api/vessels',
    authenticate,
    authorize('vessels', 'write'),
    validate([
        body('name').notEmpty().trim().escape().isLength({ max: 100 }),
        body('num').notEmpty().trim().escape(),
        body('len').isNumeric()
    ]),
    async (req, res) => {
        try {
            const vessel = {
                id: uuidv4(),
                ...req.body,
                cat: getCategory(req.body.len),
                createdAt: new Date().toISOString(),
                createdBy: req.user.name
            };
            dataManager.data.vessels.push(vessel);
            await dataManager.save();
            if (io) io.emit('vessel-added', vessel);
            res.status(201).json(vessel);
        } catch (error) {
            res.status(500).json({ error: 'خطأ في إضافة المركب' });
        }
    }
);

app.put('/api/vessels/:id',
    authenticate,
    authorize('vessels', 'write'),
    async (req, res) => {
        try {
            const index = dataManager.data.vessels.findIndex(v => v.id === req.params.id);
            if (index === -1) return res.status(404).json({ error: 'المركب غير موجود' });

            dataManager.data.vessels[index] = {
                ...dataManager.data.vessels[index],
                ...req.body,
                updatedAt: new Date().toISOString(),
                updatedBy: req.user.name
            };
            await dataManager.save();
            if (io) io.emit('vessel-updated', dataManager.data.vessels[index]);
            res.json(dataManager.data.vessels[index]);
        } catch (error) {
            res.status(500).json({ error: 'خطأ في تحديث المركب' });
        }
    }
);

app.delete('/api/vessels/:id',
    authenticate,
    authorize('vessels', 'delete'),
    async (req, res) => {
        try {
            const index = dataManager.data.vessels.findIndex(v => v.id === req.params.id);
            if (index === -1) return res.status(404).json({ error: 'المركب غير موجود' });

            dataManager.data.vessels.splice(index, 1);
            await dataManager.save();
            if (io) io.emit('vessel-deleted', { id: req.params.id });
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'خطأ في حذف المركب' });
        }
    }
);

// ===== المواقع =====

app.post('/api/locations',
    authenticate,
    authorize('locations', 'write'),
    validate([
        body('lat').isFloat({ min: -90, max: 90 }),
        body('lng').isFloat({ min: -180, max: 180 })
    ]),
    async (req, res) => {
        try {
            const { lat, lng } = security.validateCoordinates(
                parseFloat(req.body.lat),
                parseFloat(req.body.lng)
            );

            const location = {
                id: uuidv4(),
                userId: req.user.id,
                userName: req.user.name,
                userRole: req.user.role,
                lat,
                lng,
                vesselId: req.body.vesselId,
                timestamp: new Date().toISOString()
            };

            await dataManager.addLocation(location);

            const safeLocation = {
                id: location.id,
                lat: location.lat,
                lng: location.lng,
                vesselId: location.vesselId,
                timestamp: location.timestamp
            };

            if (io) io.emit('secure-location', safeLocation);
            res.status(201).json(safeLocation);
        } catch (error) {
            if (error.message.includes('الإحداثيات')) {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: 'خطأ في تسجيل الموقع' });
        }
    }
);

app.get('/api/locations',
    authenticate,
    authorize('locations', 'read'),
    async (req, res) => {
        try {
            const { limit = 100, page = 0, vesselId } = req.query;

            let locations = await dataManager.getLocations(parseInt(page), parseInt(limit));

            if (vesselId) {
                locations = locations.filter(l => l.vesselId === vesselId);
            }

            const safeLocations = locations.map(l => ({
                id: l.id,
                lat: l.lat,
                lng: l.lng,
                vesselId: l.vesselId,
                timestamp: l.timestamp
            }));

            res.json({
                data: safeLocations,
                page: parseInt(page),
                limit: parseInt(limit),
                total: dataManager.data.locations.length
            });
        } catch (error) {
            res.status(500).json({ error: 'خطأ في جلب المواقع' });
        }
    }
);

// ===== النظام =====

app.get('/api/online-users', authenticate, async (req, res) => {
    res.json({
        users: security.getOnlineUsers(),
        count: security.getOnlineUsers().length
    });
});

app.get('/api/security/logs', authenticate, authorize('logs', 'read'), async (req, res) => {
    const { limit = 100 } = req.query;
    res.json(security.getAuditLogs(parseInt(limit)));
});

app.get('/api/system/health', authenticate, authorize('system', 'read'), async (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: SERVER_CONFIG.version,
        environment: SERVER_CONFIG.environment,
        connections: io ? io.engine.clientsCount : 0,
        sessions: security.sessionTokens.size,
        locations: dataManager.data.locations.length,
        onlineUsers: security.getOnlineUsers().length,
        memory: process.memoryUsage()
    });
});

// ============================================================
// 🔌 Socket.IO
// ============================================================

async function createServer() {
    let httpServer;

    if (SERVER_CONFIG.isProduction && SERVER_CONFIG.ssl.enabled) {
        try {
            const sslOptions = {
                key: await fs.readFile(SERVER_CONFIG.ssl.key),
                cert: await fs.readFile(SERVER_CONFIG.ssl.cert),
                ca: SERVER_CONFIG.ssl.ca ? await fs.readFile(SERVER_CONFIG.ssl.ca) : undefined
            };
            httpServer = https.createServer(sslOptions, app);
            logger.info('🔒 خادم HTTPS جاهز');
        } catch (error) {
            logger.error('❌ فشل تحميل شهادات SSL:', error);
            process.exit(1);
        }
    } else {
        httpServer = http.createServer(app);
    }

    let ioOptions = {
        cors: {
            origin: SERVER_CONFIG.isProduction ? SERVER_CONFIG.allowedOrigins : '*',
            methods: ['GET', 'POST'],
            credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000
    };

    // Redis Adapter للتوسع
    if (SERVER_CONFIG.redis.enabled) {
        try {
            const redisAdapter = require('@socket.io/redis-adapter');
            const { createClient } = require('redis');

            const redisClient = createClient({
                url: `redis://${SERVER_CONFIG.redis.host}:${SERVER_CONFIG.redis.port}`,
                password: SERVER_CONFIG.redis.password,
                db: SERVER_CONFIG.redis.db
            });

            await redisClient.connect();

            const pubClient = redisClient.duplicate();
            await pubClient.connect();

            ioOptions.adapter = redisAdapter(pubClient, redisClient);
            logger.info('✅ تم تفعيل Redis Adapter');
        } catch (error) {
            logger.warn('⚠️ فشل تفعيل Redis Adapter:', error.message);
        }
    }

    const ioInstance = socketIo(httpServer, ioOptions);

    ioInstance.use((socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) return next(new Error('مطلوب مصادقة'));

            const decoded = security.verifyToken(token, 'access');
            const session = security.validateSession(decoded.sessionId);
            if (!session.valid) {
                return next(new Error('جلسة غير صالحة'));
            }

            socket.user = decoded;
            socket.session = session.session;
            next();
        } catch (error) {
            next(new Error('مصادقة غير صالحة'));
        }
    });

    ioInstance.on('connection', (socket) => {
        const userName = socket.user?.name || 'مجهول';
        logger.info(`📡 اتصال SocketIO: ${userName}`);

        security.addOnlineUser(userName);
        ioInstance.emit('online-users', security.getOnlineUsers());

        socket.on('send-location', async (data) => {
            try {
                if (!security.checkSocketRate(socket.id)) {
                    socket.emit('error', { message: 'معدل الطلبات مرتفع' });
                    return;
                }

                const { lat, lng } = security.validateCoordinates(
                    parseFloat(data.lat),
                    parseFloat(data.lng)
                );

                const location = {
                    id: uuidv4(),
                    userId: socket.user.id,
                    userName: socket.user.name,
                    userRole: socket.user.role,
                    lat,
                    lng,
                    vesselId: data.vesselId,
                    timestamp: new Date().toISOString()
                };

                await dataManager.addLocation(location);

                const safeLocation = {
                    id: location.id,
                    lat: location.lat,
                    lng: location.lng,
                    vesselId: location.vesselId,
                    timestamp: location.timestamp
                };

                socket.broadcast.emit('receive-location', safeLocation);
            } catch (error) {
                if (error.message.includes('الإحداثيات')) {
                    socket.emit('error', { message: error.message });
                } else {
                    socket.emit('error', { message: 'خطأ في إرسال الموقع' });
                }
            }
        });

        socket.on('get-online-users', () => {
            socket.emit('online-users', security.getOnlineUsers());
        });

        socket.heartbeatInterval = setInterval(() => {
            if (socket.session?.id) {
                const session = security.validateSession(socket.session.id);
                if (!session.valid) {
                    socket.emit('error', { message: 'انتهت صلاحية الجلسة' });
                    socket.disconnect(true);
                }
            }
        }, 30000);

        socket.on('disconnect', () => {
            if (socket.heartbeatInterval) {
                clearInterval(socket.heartbeatInterval);
            }
            security.removeOnlineUser(userName);
            ioInstance.emit('online-users', security.getOnlineUsers());
            logger.info(`📡 قطع اتصال: ${userName}`);
        });
    });

    return { server: httpServer, io: ioInstance };
}

// ============================================================
// 📂 الملفات الثابتة
// ============================================================

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// 🚀 تشغيل الخادم
// ============================================================

let isShuttingDown = false;

async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n🛑 إيقاف الخادم (${signal})...`);

    try {
        if (server) {
            server.close(() => logger.info('🔌 تم إغلاق الخادم'));
        }
        if (io) {
            io.close(() => logger.info('🔌 تم إغلاق Socket.IO'));
        }

        await dataManager.shutdown();
        await security.shutdown();

        logger.info('✅ تم إيقاف الخادم بشكل آمن');
        process.exit(0);
    } catch (error) {
        logger.error('❌ خطأ أثناء الإيقاف:', error);
        process.exit(1);
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGQUIT', () => shutdown('SIGQUIT'));

process.on('uncaughtException', (error) => {
    logger.error('❌ استثناء غير متوقع:', error);
    shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
    logger.error('❌ رفض غير معالج:', reason);
    shutdown('unhandledRejection');
});

async function startServer() {
    try {
        await dataManager.initialize();

        const { server: createdServer, io: createdIo } = await createServer();
        server = createdServer;
        io = createdIo;

        server.listen(SERVER_CONFIG.port, '0.0.0.0', () => {
            console.log('========================================');
            console.log(`🚀 ${SERVER_CONFIG.appName} v${SERVER_CONFIG.version}`);
            console.log(`🌐 ${SERVER_CONFIG.isProduction ? 'https' : 'http'}://localhost:${SERVER_CONFIG.port}`);
            console.log('========================================');
            console.log(`🔒 الجلسات: ${security.sessionTokens.size}`);
            console.log(`📍 المواقع: ${dataManager.data.locations.length}`);
            console.log(`📄 صفحات المواقع: ${dataManager.locationPage}`);
            console.log(`🚫 القائمة السوداء: ${security.blacklistedTokens.size}`);
            console.log('========================================');
            console.log('👤 admin / SecurePass123! (يجب تغييرها)');
            console.log('========================================');
        });

        setInterval(async () => {
            try {
                await dataManager._saveToFile();
            } catch (error) {
                logger.error('❌ فشل الحفظ التلقائي:', error);
            }
        }, 30000);

    } catch (error) {
        logger.error('❌ فشل بدء الخادم:', error);
        process.exit(1);
    }
}

startServer();

// ============================================================
// ✅ نهاية الخادم
// ============================================================
