const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// ==================== التأكد من المتغيرات البيئية ====================
const requiredEnvVars = ['JWT_SECRET', 'REFRESH_TOKEN_SECRET', 'ENCRYPTION_KEY'];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`❌ خطأ: ${envVar} غير موجود في المتغيرات البيئية`);
        process.exit(1);
    }
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
if (keyBuffer.length !== 32) {
    console.error('❌ خطأ: ENCRYPTION_KEY يجب أن يكون 64 حرف hex (32 bytes)');
    process.exit(1);
}

// ==================== إعداد التطبيق ====================
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', true);
app.disable('x-powered-by');

// ==================== إنشاء مجلد البيانات ====================
if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data');
}
if (!fs.existsSync('./backups')) {
    fs.mkdirSync('./backups');
}

// ==================== HTTPS إجبارية ====================
if (isProduction) {
    app.use((req, res, next) => {
        if (req.headers['x-forwarded-proto'] !== 'https') {
            return res.redirect(301, `https://${req.headers.host}${req.url}`);
        }
        next();
    });
}

// ==================== Security Headers ====================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// ==================== CORS (مقيد) ====================
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('مصدر غير مصرح به'));
        }
    },
    credentials: true
}));

app.use((err, req, res, next) => {
    if (err.message === 'مصدر غير مصرح به') {
        return res.status(403).json({ error: 'مصدر غير مصرح به' });
    }
    next(err);
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ==================== Rate Limiters ====================
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'طلبات كثيرة، يرجى المحاولة لاحقاً' }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    message: { error: 'محاولات دخول كثيرة، يرجى المحاولة بعد 15 دقيقة' }
});

const strictLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'طلبات كثيرة على هذه الخدمة، يرجى التهدئة' }
});

app.use('/api/', globalLimiter);

// ==================== قاعدة البيانات SQLite ====================
let db;

async function initDatabase() {
    db = await open({
        filename: './data/marine.db',
        driver: sqlite3.Database
    });

    // إنشاء الجداول
    await db.exec(`
        -- المستخدمين
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            created_at TEXT NOT NULL
        );

        -- المراكب
        CREATE TABLE IF NOT EXISTS vessels (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            number TEXT,
            length REAL,
            category TEXT,
            region TEXT,
            zone TEXT,
            port TEXT,
            support_location TEXT,
            status TEXT,
            breakdown_type TEXT,
            breakdown_date TEXT,
            end_date TEXT,
            reference TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT
        );

        -- الجلسات
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            ip TEXT,
            user_agent TEXT,
            created_at TEXT NOT NULL,
            last_active TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        -- Refresh tokens (مع device_id لدعم الأجهزة المتعددة)
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            token_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            device_id TEXT,
            device_name TEXT,
            last_used TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        -- سجل النشاطات
        CREATE TABLE IF NOT EXISTS logs (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            username TEXT NOT NULL,
            user_role TEXT NOT NULL,
            action TEXT NOT NULL,
            details TEXT,
            ip_address TEXT,
            user_agent TEXT
        );

        -- التذاكر
        CREATE TABLE IF NOT EXISTS tickets (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            username TEXT NOT NULL,
            subject TEXT NOT NULL,
            message TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        -- فهارس للبحث السريع
        CREATE INDEX IF NOT EXISTS idx_vessels_name ON vessels(name);
        CREATE INDEX IF NOT EXISTS idx_vessels_status ON vessels(status);
        CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_logs_username ON logs(username);
        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
    `);

    console.log('✅ قاعدة البيانات SQLite جاهزة');
}

// ==================== دوال مساعدة ====================
function sha256(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

function getRealIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.ip || req.socket.remoteAddress;
}

async function addLog(username, role, action, details, req = null) {
    try {
        await db.run(
            `INSERT INTO logs (id, timestamp, username, user_role, action, details, ip_address, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), new Date().toISOString(), username, role, action, details, req ? getRealIP(req) : 'system', req ? req.headers['user-agent'] : 'system']
        );
    } catch (error) {
        console.error('خطأ في تسجيل النشاط:', error);
    }
}

// ==================== Middleware التوثيق ====================
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const sessionId = req.headers['x-session-id'];
    
    if (!token) {
        return res.status(401).json({ error: 'غير مصرح به - يرجى تسجيل الدخول' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        if (sessionId) {
            const session = await db.get('SELECT * FROM sessions WHERE id = ? AND user_id = ?', [sessionId, decoded.id]);
            if (!session) {
                return res.status(401).json({ error: 'الجلسة غير صالحة أو منتهية' });
            }
            await db.run('UPDATE sessions SET last_active = ? WHERE id = ?', [new Date().toISOString(), sessionId]);
        }
        
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'انتهت الجلسة', expired: true });
        }
        return res.status(403).json({ error: 'رمز غير صالح' });
    }
}

function authorizeRole(...roles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'غير مصرح به' });
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'ليس لديك صلاحية لهذه العملية' });
        }
        next();
    };
}

// ==================== Validation Rules ====================
const validateVessel = [
    body('name').trim().notEmpty().withMessage('اسم المركب مطلوب').isLength({ min: 2, max: 100 }),
    body('number').optional().trim().isLength({ max: 50 }),
    body('length').optional().isFloat({ min: 0, max: 1000 }),
    body('region').optional().trim(),
    body('status').optional().isIn(['صالح', 'معطب', 'صيانة'])
];

const validateUser = [
    body('username').trim().notEmpty().withMessage('اسم المستخدم مطلوب')
        .isLength({ min: 3, max: 50 })
        .matches(/^[a-zA-Z0-9_]+$/).withMessage('اسم المستخدم يحتوي على أحرف غير مسموحة'),
    body('password').isLength({ min: 8 }).withMessage('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
        .matches(/[A-Z]/).withMessage('يجب أن تحتوي كلمة المرور على حرف كبير')
        .matches(/[a-z]/).withMessage('يجب أن تحتوي كلمة المرور على حرف صغير')
        .matches(/[0-9]/).withMessage('يجب أن تحتوي كلمة المرور على رقم')
        .matches(/[^A-Za-z0-9]/).withMessage('يجب أن تحتوي كلمة المرور على رمز خاص'),
    body('role').optional().isIn(['مشاهد', 'محرر', 'مسؤول'])
];

// ==================== تهيئة البيانات الأولية ====================
async function initData() {
    await initDatabase();
    
    // التحقق من وجود مستخدمين
    const userCount = await db.get('SELECT COUNT(*) as count FROM users');
    if (userCount.count === 0 && !isProduction) {
        const salt = await bcrypt.genSalt(10);
        await db.run(
            `INSERT INTO users (id, username, password, role, enabled, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), "admin", await bcrypt.hash("Admin@123456", salt), "مسؤول", 1, new Date().toISOString()]
        );
        await db.run(
            `INSERT INTO users (id, username, password, role, enabled, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), "editor", await bcrypt.hash("Editor@123456", salt), "محرر", 1, new Date().toISOString()]
        );
        await db.run(
            `INSERT INTO users (id, username, password, role, enabled, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), "viewer", await bcrypt.hash("Viewer@123456", salt), "مشاهد", 1, new Date().toISOString()]
        );
        console.log('✅ تم إنشاء المستخدمين الافتراضيين');
    }
    
    // التحقق من وجود مراكب
    const vesselCount = await db.get('SELECT COUNT(*) as count FROM vessels');
    if (vesselCount.count === 0) {
        const vessels = [
            { name: "البروق-1", number: "B001", length: 11, category: "البروق", region: "الشمال", zone: "تونس", port: "تونس", status: "صالح" },
            { name: "صقر-1", number: "S001", length: 10, category: "صقور", region: "الساحل", zone: "سوسة", port: "سوسة", status: "صالح" },
            { name: "خوفة-1", number: "K001", length: 20, category: "خوافر", region: "الوسط", zone: "صفاقس", port: "صفاقس", status: "معطب" },
            { name: "زورق-1", number: "Z001", length: 15, category: "زوارق مزدوجة", region: "الجنوب", zone: "جربة", port: "جربة", status: "صيانة" }
        ];
        
        for (const v of vessels) {
            await db.run(
                `INSERT INTO vessels (id, name, number, length, category, region, zone, port, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [uuidv4(), v.name, v.number, v.length, v.category, v.region, v.zone, v.port, v.status, new Date().toISOString()]
            );
        }
        console.log('✅ تم إنشاء المراكب الافتراضية');
    }
}

// ==================== Session Management ====================
async function createSession(userId, req) {
    const session = {
        id: uuidv4(),
        user_id: userId,
        ip: getRealIP(req),
        user_agent: req.headers['user-agent'],
        created_at: new Date().toISOString(),
        last_active: new Date().toISOString()
    };
    
    await db.run(
        `INSERT INTO sessions (id, user_id, ip, user_agent, created_at, last_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [session.id, session.user_id, session.ip, session.user_agent, session.created_at, session.last_active]
    );
    
    return session.id;
}

async function revokeSession(sessionId) {
    await db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
}

async function revokeAllUserSessions(userId) {
    await db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

async function revokeAllUserRefreshTokens(userId) {
    await db.run('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
}

async function revokeRefreshTokenByDevice(userId, deviceId) {
    await db.run('DELETE FROM refresh_tokens WHERE user_id = ? AND device_id = ?', [userId, deviceId]);
}

// ==================== Refresh Tokens ====================
async function saveRefreshToken(userId, token, deviceId, deviceName = null) {
    const tokenHash = sha256(token);
    await db.run('DELETE FROM refresh_tokens WHERE user_id = ? AND device_id = ?', [userId, deviceId]);
    await db.run(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, created_at, device_id, device_name, last_used)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), userId, tokenHash, new Date().toISOString(), deviceId, deviceName, new Date().toISOString()]
    );
}

async function verifyRefreshToken(token) {
    try {
        const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET);
        const tokenHash = sha256(token);
        const rt = await db.get('SELECT * FROM refresh_tokens WHERE token_hash = ? AND user_id = ?', [tokenHash, decoded.id]);
        if (!rt) return null;
        
        // تحديث وقت آخر استخدام
        await db.run('UPDATE refresh_tokens SET last_used = ? WHERE token_hash = ?', [new Date().toISOString(), tokenHash]);
        
        return { decoded, deviceId: rt.device_id };
    } catch {
        return null;
    }
}

async function rotateRefreshToken(oldToken, userId, deviceId, deviceName = null) {
    const tokenHash = sha256(oldToken);
    await db.run('DELETE FROM refresh_tokens WHERE token_hash = ?', [tokenHash]);
    
    const newRefreshToken = jwt.sign(
        { id: userId },
        REFRESH_TOKEN_SECRET,
        { expiresIn: '7d' }
    );
    await saveRefreshToken(userId, newRefreshToken, deviceId, deviceName);
    return newRefreshToken;
}

async function cleanupOldData() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    await db.run('DELETE FROM sessions WHERE last_active < ?', [sevenDaysAgo]);
    await db.run('DELETE FROM refresh_tokens WHERE created_at < ?', [sevenDaysAgo]);
    await db.run('DELETE FROM logs WHERE timestamp < ?', [thirtyDaysAgo]);
    console.log('✅ تم تنظيف البيانات القديمة');
}

setInterval(cleanupOldData, 24 * 60 * 60 * 1000);

// ==================== API Routes ====================

// تسجيل الدخول
app.post('/api/login', loginLimiter, async (req, res) => {
    const { username, password, deviceId: clientDeviceId, deviceName } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }
    
    const user = await db.get('SELECT * FROM users WHERE username = ? AND enabled = 1', [username.toLowerCase()]);
    
    if (!user) {
        await addLog(username, 'غير معروف', 'محاولة دخول فاشلة', 'اسم مستخدم غير موجود', req);
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        await addLog(username, 'غير معروف', 'محاولة دخول فاشلة', 'كلمة مرور خاطئة', req);
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    const accessToken = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
    
    const refreshToken = jwt.sign(
        { id: user.id },
        REFRESH_TOKEN_SECRET,
        { expiresIn: '7d' }
    );
    
    const deviceId = clientDeviceId || uuidv4();
    const sessionId = await createSession(user.id, req);
    await saveRefreshToken(user.id, refreshToken, deviceId, deviceName || req.headers['user-agent']);
    await addLog(user.username, user.role, 'تسجيل دخول', `قام المستخدم بتسجيل الدخول من جهاز ${deviceName || 'غير معروف'}`, req);
    
    res.json({
        success: true,
        accessToken,
        refreshToken,
        sessionId,
        deviceId,
        user: { id: user.id, username: user.username, role: user.role }
    });
});

// تجديد التوكن
app.post('/api/refresh', strictLimiter, async (req, res) => {
    const { refreshToken, deviceId, deviceName } = req.body;
    
    if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token مطلوب' });
    }
    
    const result = await verifyRefreshToken(refreshToken);
    if (!result) {
        return res.status(403).json({ error: 'Refresh token غير صالح' });
    }
    
    const { decoded, deviceId: oldDeviceId } = result;
    const user = await db.get('SELECT * FROM users WHERE id = ? AND enabled = 1', [decoded.id]);
    
    if (!user) {
        return res.status(403).json({ error: 'مستخدم غير موجود أو معطل' });
    }
    
    const newAccessToken = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
    
    const finalDeviceId = deviceId || oldDeviceId;
    const newRefreshToken = await rotateRefreshToken(refreshToken, user.id, finalDeviceId, deviceName);
    
    res.json({ 
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
    });
});

// تسجيل الخروج
app.post('/api/logout', authenticateToken, async (req, res) => {
    const { refreshToken, sessionId, deviceId } = req.body;
    
    if (refreshToken) {
        const tokenHash = sha256(refreshToken);
        await db.run('DELETE FROM refresh_tokens WHERE token_hash = ?', [tokenHash]);
    }
    if (sessionId) {
        await revokeSession(sessionId);
    }
    if (deviceId) {
        await revokeRefreshTokenByDevice(req.user.id, deviceId);
    }
    
    await addLog(req.user.username, req.user.role, 'تسجيل خروج', 'قام المستخدم بتسجيل الخروج', req);
    res.json({ success: true });
});

// تسجيل الخروج من جميع الأجهزة
app.post('/api/logout/all', authenticateToken, async (req, res) => {
    await revokeAllUserSessions(req.user.id);
    await revokeAllUserRefreshTokens(req.user.id);
    await addLog(req.user.username, req.user.role, 'تسجيل خروج شامل', 'تم تسجيل الخروج من جميع الأجهزة', req);
    res.json({ success: true });
});

// الحصول على الأجهزة المسجلة
app.get('/api/devices', authenticateToken, async (req, res) => {
    const devices = await db.all(
        'SELECT device_id, device_name, created_at, last_used FROM refresh_tokens WHERE user_id = ? ORDER BY last_used DESC',
        [req.user.id]
    );
    res.json(devices);
});

// حذف جهاز معين
app.delete('/api/devices/:deviceId', authenticateToken, async (req, res) => {
    await revokeRefreshTokenByDevice(req.user.id, req.params.deviceId);
    await addLog(req.user.username, req.user.role, 'حذف جهاز', `تم حذف الجهاز ${req.params.deviceId}`, req);
    res.json({ success: true });
});

// ==================== المراكب ====================
app.get('/api/vessels', authenticateToken, async (req, res) => {
    const vessels = await db.all('SELECT * FROM vessels ORDER BY created_at DESC');
    res.json(vessels);
});

app.get('/api/vessels/search', authenticateToken, async (req, res) => {
    const { q, category, region, status } = req.query;
    let query = 'SELECT * FROM vessels WHERE 1=1';
    const params = [];
    
    if (q) {
        query += ' AND (name LIKE ? OR number LIKE ?)';
        params.push(`%${q}%`, `%${q}%`);
    }
    if (category && category !== 'الكل') {
        query += ' AND category = ?';
        params.push(category);
    }
    if (region && region !== 'الكل') {
        query += ' AND region = ?';
        params.push(region);
    }
    if (status && status !== 'الكل') {
        query += ' AND status = ?';
        params.push(status);
    }
    
    query += ' ORDER BY created_at DESC';
    const vessels = await db.all(query, params);
    res.json(vessels);
});

app.post('/api/vessels', authenticateToken, authorizeRole('مسؤول', 'محرر'), validateVessel, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    
    const { name, number, length, category, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference } = req.body;
    
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'اسم المركب مطلوب' });
    }
    
    const vessel = {
        id: uuidv4(),
        name: name.trim(),
        number: number || '',
        length: parseFloat(length) || 0,
        category: category || '',
        region: region || '',
        zone: zone || '',
        port: port || '',
        support_location: support_location || '',
        status: status || 'صالح',
        breakdown_type: breakdown_type || '',
        breakdown_date: breakdown_date || '',
        end_date: end_date || '',
        reference: reference || '',
        created_at: new Date().toISOString()
    };
    
    await db.run(
        `INSERT INTO vessels (id, name, number, length, category, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [vessel.id, vessel.name, vessel.number, vessel.length, vessel.category, vessel.region, vessel.zone, vessel.port, vessel.support_location, vessel.status, vessel.breakdown_type, vessel.breakdown_date, vessel.end_date, vessel.reference, vessel.created_at]
    );
    
    await addLog(req.user.username, req.user.role, 'إضافة مركب', `تم إضافة المركب "${name}"`, req);
    res.json({ success: true, vessel });
});

app.put('/api/vessels/:id', authenticateToken, authorizeRole('مسؤول', 'محرر'), validateVessel, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    
    const id = req.params.id;
    const { name, number, length, category, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference } = req.body;
    
    const existing = await db.get('SELECT * FROM vessels WHERE id = ?', [id]);
    if (!existing) {
        return res.status(404).json({ error: 'المركب غير موجود' });
    }
    
    await db.run(
        `UPDATE vessels SET 
            name = ?, number = ?, length = ?, category = ?, region = ?, zone = ?, port = ?, 
            support_location = ?, status = ?, breakdown_type = ?, breakdown_date = ?, 
            end_date = ?, reference = ?, updated_at = ?
         WHERE id = ?`,
        [name, number, length, category, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference, new Date().toISOString(), id]
    );
    
    await addLog(req.user.username, req.user.role, 'تعديل مركب', `تم تعديل المركب "${name}"`, req);
    res.json({ success: true });
});

app.delete('/api/vessels/:id', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const id = req.params.id;
    const vessel = await db.get('SELECT * FROM vessels WHERE id = ?', [id]);
    
    if (!vessel) {
        return res.status(404).json({ error: 'المركب غير موجود' });
    }
    
    await db.run('DELETE FROM vessels WHERE id = ?', [id]);
    await addLog(req.user.username, req.user.role, 'حذف مركب', `تم حذف المركب "${vessel.name}"`, req);
    res.json({ success: true });
});

// ==================== المستخدمين ====================
app.get('/api/users', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const users = await db.all('SELECT id, username, role, enabled, created_at FROM users');
    res.json(users);
});

app.post('/api/users', authenticateToken, authorizeRole('مسؤول'), validateUser, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    
    const { username, password, role } = req.body;
    
    const existing = await db.get('SELECT * FROM users WHERE username = ?', [username.toLowerCase()]);
    if (existing) {
        return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const newUser = {
        id: uuidv4(),
        username: username.toLowerCase(),
        password: await bcrypt.hash(password, salt),
        role: role || 'مشاهد',
        enabled: 1,
        created_at: new Date().toISOString()
    };
    
    await db.run(
        `INSERT INTO users (id, username, password, role, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [newUser.id, newUser.username, newUser.password, newUser.role, newUser.enabled, newUser.created_at]
    );
    
    await addLog(req.user.username, req.user.role, 'إضافة مستخدم', `تم إضافة المستخدم "${username}" برتبة ${role}`, req);
    res.json({ success: true });
});

app.put('/api/users/:id/password', authenticateToken, authorizeRole('مسؤول'), validateUser, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    
    const { password } = req.body;
    const userId = req.params.id;
    
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    const salt = await bcrypt.genSalt(10);
    await db.run('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash(password, salt), userId]);
    
    await addLog(req.user.username, req.user.role, 'تغيير كلمة مرور', `تم تغيير كلمة مرور المستخدم "${user.username}"`, req);
    res.json({ success: true });
});

app.put('/api/users/:id/toggle', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const { enabled } = req.body;
    const userId = req.params.id;
    
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    if (user.username === 'admin' && enabled === false) {
        return res.status(403).json({ error: 'لا يمكن تعطيل المستخدم الرئيسي' });
    }
    
    await db.run('UPDATE users SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, userId]);
    await addLog(req.user.username, req.user.role, enabled ? 'تفعيل مستخدم' : 'تعطيل مستخدم', `تم ${enabled ? 'تفعيل' : 'تعطيل'} المستخدم "${user.username}"`, req);
    res.json({ success: true });
});

app.delete('/api/users/:id', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const userId = req.params.id;
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    
    if (!user) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    if (user.username === 'admin') {
        return res.status(403).json({ error: 'لا يمكن حذف المستخدم الرئيسي' });
    }
    
    if (user.id === req.user.id) {
        return res.status(403).json({ error: 'لا يمكن حذف حسابك الحالي' });
    }
    
    await db.run('DELETE FROM users WHERE id = ?', [userId]);
    await addLog(req.user.username, req.user.role, 'حذف مستخدم', `تم حذف المستخدم "${user.username}"`, req);
    res.json({ success: true });
});

// ==================== السجلات ====================
app.get('/api/logs', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const { limit = 200, startDate, endDate, action, username } = req.query;
    let query = 'SELECT * FROM logs WHERE 1=1';
    const params = [];
    
    if (startDate) {
        query += ' AND date(timestamp) >= date(?)';
        params.push(startDate);
    }
    if (endDate) {
        query += ' AND date(timestamp) <= date(?)';
        params.push(endDate);
    }
    if (action) {
        query += ' AND action = ?';
        params.push(action);
    }
    if (username) {
        query += ' AND username = ?';
        params.push(username);
    }
    
    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(parseInt(limit));
    
    const logs = await db.all(query, params);
    res.json(logs);
});

// ==================== التذاكر ====================
app.get('/api/tickets', authenticateToken, async (req, res) => {
    let query = 'SELECT * FROM tickets';
    const params = [];
    
    if (req.user.role !== 'مسؤول') {
        query += ' WHERE username = ?';
        params.push(req.user.username);
    }
    
    query += ' ORDER BY created_at DESC';
    const tickets = await db.all(query, params);
    res.json(tickets);
});

app.post('/api/tickets', authenticateToken, async (req, res) => {
    const { subject, message } = req.body;
    
    if (!subject || !subject.trim()) {
        return res.status(400).json({ error: 'عنوان التذكرة مطلوب' });
    }
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'الرسالة مطلوبة' });
    }
    
    const now = new Date();
    const ticket = {
        id: uuidv4(),
        date: now.toLocaleDateString('ar-TN'),
        time: now.toLocaleTimeString('ar-TN'),
        username: req.user.username,
        subject: subject.trim(),
        message: message.trim(),
        status: 'قيد المعالجة',
        created_at: now.toISOString()
    };
    
    await db.run(
        `INSERT INTO tickets (id, date, time, username, subject, message, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [ticket.id, ticket.date, ticket.time, ticket.username, ticket.subject, ticket.message, ticket.status, ticket.created_at
