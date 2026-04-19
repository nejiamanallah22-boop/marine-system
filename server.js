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
const requiredEnvVars = ['JWT_SECRET', 'REFRESH_TOKEN_SECRET'];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`❌ خطأ: ${envVar} غير موجود`);
        process.exit(1);
    }
}

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
const isProduction = process.env.NODE_ENV === 'production';

// ==================== إعدادات الأمان ====================
app.set('trust proxy', true);
app.disable('x-powered-by');

if (isProduction) {
    app.use((req, res, next) => {
        if (req.headers['x-forwarded-proto'] !== 'https') {
            return res.redirect(301, `https://${req.headers.host}${req.url}`);
        }
        next();
    });
}

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
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
}));

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

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ==================== Rate Limiters ====================
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, skipSuccessfulRequests: true });
const strictLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });

app.use('/api/', globalLimiter);

// ==================== قاعدة البيانات ====================
if (!fs.existsSync('./data')) fs.mkdirSync('./data');
let db;

async function initDatabase() {
    db = await open({ filename: './data/marine.db', driver: sqlite3.Database });
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, username TEXT UNIQUE, password TEXT,
            role TEXT, enabled INTEGER, created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS vessels (
            id TEXT PRIMARY KEY, name TEXT, number TEXT, length REAL,
            category TEXT, region TEXT, zone TEXT, port TEXT,
            support_location TEXT, status TEXT, breakdown_type TEXT,
            breakdown_date TEXT, end_date TEXT, reference TEXT,
            created_at TEXT, updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY, user_id TEXT, ip TEXT,
            user_agent TEXT, created_at TEXT, last_active TEXT
        );
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id TEXT PRIMARY KEY, user_id TEXT, token_hash TEXT,
            created_at TEXT, device_id TEXT, last_used TEXT
        );
        CREATE TABLE IF NOT EXISTS logs (
            id TEXT PRIMARY KEY, timestamp TEXT, username TEXT,
            user_role TEXT, action TEXT, details TEXT, ip_address TEXT
        );
        CREATE TABLE IF NOT EXISTS tickets (
            id TEXT PRIMARY KEY, date TEXT, time TEXT, username TEXT,
            subject TEXT, message TEXT, status TEXT, created_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_vessels_name ON vessels(name);
        CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
    `);
    console.log('✅ قاعدة البيانات جاهزة');
}

function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function getRealIP(req) { return req.headers['x-forwarded-for']?.split(',')[0] || req.ip; }

async function addLog(username, role, action, details, req = null) {
    await db.run(
        `INSERT INTO logs VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), new Date().toISOString(), username, role, action, details, req ? getRealIP(req) : 'system']
    );
}

async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'غير مصرح به' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
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
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'ليس لديك صلاحية' });
        }
        next();
    };
}

// ==================== تهيئة البيانات ====================
async function initData() {
    await initDatabase();
    
    const userCount = await db.get('SELECT COUNT(*) as c FROM users');
    if (userCount.c === 0 && !isProduction) {
        const salt = await bcrypt.genSalt(10);
        await db.run(`INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), "admin", await bcrypt.hash("Admin@123456", salt), "مسؤول", 1, new Date().toISOString()]);
        await db.run(`INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), "editor", await bcrypt.hash("Editor@123456", salt), "محرر", 1, new Date().toISOString()]);
        await db.run(`INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), "viewer", await bcrypt.hash("Viewer@123456", salt), "مشاهد", 1, new Date().toISOString()]);
        console.log('✅ تم إنشاء المستخدمين');
    }
    
    const vesselCount = await db.get('SELECT COUNT(*) as c FROM vessels');
    if (vesselCount.c === 0) {
        const vessels = [
            { name: "البروق-1", number: "B001", length: 11, category: "البروق", region: "الشمال", zone: "تونس", port: "تونس", status: "صالح" },
            { name: "صقر-1", number: "S001", length: 10, category: "صقور", region: "الساحل", zone: "سوسة", port: "سوسة", status: "صالح" },
            { name: "خوفة-1", number: "K001", length: 20, category: "خوافر", region: "الوسط", zone: "صفاقس", port: "صفاقس", status: "معطب" },
            { name: "زورق-1", number: "Z001", length: 15, category: "زوارق مزدوجة", region: "الجنوب", zone: "جربة", port: "جربة", status: "صيانة" }
        ];
        for (const v of vessels) {
            await db.run(`INSERT INTO vessels (id, name, number, length, category, region, zone, port, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [uuidv4(), v.name, v.number, v.length, v.category, v.region, v.zone, v.port, v.status, new Date().toISOString()]);
        }
        console.log('✅ تم إنشاء المراكب');
    }
}

// ==================== API Routes ====================

// تسجيل الدخول
app.post('/api/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'بيانات ناقصة' });
    
    const user = await db.get('SELECT * FROM users WHERE username = ? AND enabled = 1', [username.toLowerCase()]);
    if (!user || !(await bcrypt.compare(password, user.password))) {
        await addLog(username, 'غير معروف', 'محاولة دخول فاشلة', 'بيانات غير صحيحة', req);
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    const accessToken = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ id: user.id }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
    const tokenHash = sha256(refreshToken);
    
    await db.run(`DELETE FROM refresh_tokens WHERE user_id = ?`, [user.id]);
    await db.run(`INSERT INTO refresh_tokens VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), user.id, tokenHash, new Date().toISOString(), 'default', new Date().toISOString()]);
    
    await addLog(user.username, user.role, 'تسجيل دخول', 'قام المستخدم بتسجيل الدخول', req);
    res.json({ accessToken, refreshToken });
});

// تجديد التوكن
app.post('/api/refresh', strictLimiter, async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token مطلوب' });
    
    try {
        const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
        const tokenHash = sha256(refreshToken);
        const stored = await db.get('SELECT * FROM refresh_tokens WHERE token_hash = ? AND user_id = ?', [tokenHash, decoded.id]);
        if (!stored) return res.status(403).json({ error: 'Refresh token غير صالح' });
        
        const user = await db.get('SELECT * FROM users WHERE id = ? AND enabled = 1', [decoded.id]);
        if (!user) return res.status(403).json({ error: 'مستخدم غير موجود' });
        
        const newAccessToken = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
        const newRefreshToken = jwt.sign({ id: user.id }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
        const newTokenHash = sha256(newRefreshToken);
        
        await db.run(`DELETE FROM refresh_tokens WHERE token_hash = ?`, [tokenHash]);
        await db.run(`INSERT INTO refresh_tokens VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), user.id, newTokenHash, new Date().toISOString(), stored.device_id, new Date().toISOString()]);
        
        res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
    } catch {
        res.status(403).json({ error: 'Refresh token غير صالح' });
    }
});

// تسجيل الخروج
app.post('/api/logout', async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        const tokenHash = sha256(refreshToken);
        await db.run(`DELETE FROM refresh_tokens WHERE token_hash = ?`, [tokenHash]);
    }
    res.json({ success: true });
});

// ==================== المراكب ====================
app.get('/api/vessels', authenticateToken, async (req, res) => {
    const vessels = await db.all('SELECT * FROM vessels ORDER BY created_at DESC');
    res.json(vessels);
});

app.post('/api/vessels', authenticateToken, authorizeRole('مسؤول', 'محرر'), async (req, res) => {
    const { name, number, length, category, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'الاسم مطلوب' });
    
    const vessel = {
        id: uuidv4(), name: name.trim(), number: number || '', length: parseFloat(length) || 0,
        category: category || '', region: region || '', zone: zone || '', port: port || '',
        support_location: support_location || '', status: status || 'صالح', breakdown_type: breakdown_type || '',
        breakdown_date: breakdown_date || '', end_date: end_date || '', reference: reference || '',
        created_at: new Date().toISOString()
    };
    
    await db.run(`INSERT INTO vessels VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [vessel.id, vessel.name, vessel.number, vessel.length, vessel.category, vessel.region, vessel.zone,
         vessel.port, vessel.support_location, vessel.status, vessel.breakdown_type, vessel.breakdown_date,
         vessel.end_date, vessel.reference, vessel.created_at, null]);
    
    await addLog(req.user.username, req.user.role, 'إضافة مركب', `تم إضافة "${name}"`, req);
    res.json({ success: true, vessel });
});

app.put('/api/vessels/:id', authenticateToken, authorizeRole('مسؤول', 'محرر'), async (req, res) => {
    const { name, number, length, category, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference } = req.body;
    const existing = await db.get('SELECT * FROM vessels WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'غير موجود' });
    
    await db.run(`UPDATE vessels SET name=?, number=?, length=?, category=?, region=?, zone=?, port=?,
        support_location=?, status=?, breakdown_type=?, breakdown_date=?, end_date=?, reference=?, updated_at=?
        WHERE id=?`,
        [name, number, length, category, region, zone, port, support_location, status, breakdown_type,
         breakdown_date, end_date, reference, new Date().toISOString(), req.params.id]);
    
    await addLog(req.user.username, req.user.role, 'تعديل مركب', `تم تعديل "${name}"`, req);
    res.json({ success: true });
});

app.delete('/api/vessels/:id', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const vessel = await db.get('SELECT * FROM vessels WHERE id = ?', [req.params.id]);
    if (!vessel) return res.status(404).json({ error: 'غير موجود' });
    
    await db.run('DELETE FROM vessels WHERE id = ?', [req.params.id]);
    await addLog(req.user.username, req.user.role, 'حذف مركب', `تم حذف "${vessel.name}"`, req);
    res.json({ success: true });
});

// ==================== المستخدمين ====================
app.get('/api/users', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const users = await db.all('SELECT id, username, role, enabled, created_at FROM users');
    res.json(users);
});

app.post('/api/users', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'بيانات ناقصة' });
    if (password.length < 8) return res.status(400).json({ error: 'كلمة المرور 8 أحرف على الأقل' });
    
    const existing = await db.get('SELECT * FROM users WHERE username = ?', [username.toLowerCase()]);
    if (existing) return res.status(400).json({ error: 'المستخدم موجود' });
    
    const salt = await bcrypt.genSalt(10);
    await db.run(`INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), username.toLowerCase(), await bcrypt.hash(password, salt), role || 'مشاهد', 1, new Date().toISOString()]);
    
    await addLog(req.user.username, req.user.role, 'إضافة مستخدم', `تم إضافة "${username}"`, req);
    res.json({ success: true });
});

app.put('/api/users/:id/password', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const { password } = req.body;
    if (!password || password.length < 8) return res.status(400).json({ error: 'كلمة المرور 8 أحرف على الأقل' });
    
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'غير موجود' });
    
    const salt = await bcrypt.genSalt(10);
    await db.run('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash(password, salt), req.params.id]);
    await addLog(req.user.username, req.user.role, 'تغيير كلمة مرور', `تم تغيير كلمة مرور "${user.username}"`, req);
    res.json({ success: true });
});

app.put('/api/users/:id/toggle', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const { enabled } = req.body;
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'غير موجود' });
    if (user.username === 'admin' && !enabled) return res.status(403).json({ error: 'لا يمكن تعطيل admin' });
    
    await db.run('UPDATE users SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, req.params.id]);
    await addLog(req.user.username, req.user.role, enabled ? 'تفعيل مستخدم' : 'تعطيل مستخدم', `تم ${enabled ? 'تفعيل' : 'تعطيل'} "${user.username}"`, req);
    res.json({ success: true });
});

app.delete('/api/users/:id', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'غير موجود' });
    if (user.username === 'admin') return res.status(403).json({ error: 'لا يمكن حذف admin' });
    if (user.id === req.user.id) return res.status(403).json({ error: 'لا يمكن حذف حسابك' });
    
    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    await addLog(req.user.username, req.user.role, 'حذف مستخدم', `تم حذف "${user.username}"`, req);
    res.json({ success: true });
});

// ==================== السجلات ====================
app.get('/api/logs', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const { limit = 200 } = req.query;
    const logs = await db.all('SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?', [parseInt(limit)]);
    res.json(logs);
});

// ==================== التذاكر ====================
app.get('/api/tickets', authenticateToken, async (req, res) => {
    const tickets = await db.all('SELECT * FROM tickets ORDER BY created_at DESC');
    if (req.user.role !== 'مسؤول') {
        res.json(tickets.filter(t => t.username === req.user.username));
    } else {
        res.json(tickets);
    }
});

app.post('/api/tickets', authenticateToken, async (req, res) => {
    const { subject, message } = req.body;
    if (!subject || !message) return res.status(400).json({ error: 'بيانات ناقصة' });
    
    const now = new Date();
    await db.run(`INSERT INTO tickets VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), now.toLocaleDateString('ar-TN'), now.toLocaleTimeString('ar-TN'),
         req.user.username, subject, message, 'قيد المعالجة', now.toISOString()]);
    
    await addLog(req.user.username, req.user.role, 'إرسال تذكرة', `تم إرسال "${subject}"`, req);
    res.json({ success: true });
});

// ==================== تصدير ====================
app.get('/api/export', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const vessels = await db.all('SELECT * FROM vessels');
    res.json({ vessels, exportDate: new Date().toISOString(), exportedBy: req.user.username });
});

app.post('/api/import', strictLimiter, authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const { vessels } = req.body;
    if (!vessels || !Array.isArray(vessels)) return res.status(400).json({ error: 'بيانات غير صالحة' });
    
    for (const v of vessels) {
        if (!v.name) return res.status(400).json({ error: 'اسم المركب مطلوب' });
        await db.run(`INSERT OR REPLACE INTO vessels VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [v.id || uuidv4(), v.name, v.number || '', v.length || 0, v.category || '', v.region || '',
             v.zone || '', v.port || '', v.support_location || '', v.status || 'صالح', v.breakdown_type || '',
             v.breakdown_date || '', v.end_date || '', v.reference || '', v.created_at || new Date().toISOString(), null]);
    }
    await addLog(req.user.username, req.user.role, 'استيراد بيانات', `تم استيراد ${vessels.length} مركب`, req);
    res.json({ success: true });
});

// ==================== إحصائيات ====================
app.get('/api/stats', authenticateToken, async (req, res) => {
    const vessels = await db.all('SELECT * FROM vessels');
    const total = vessels.length;
    const good = vessels.filter(v => v.status === 'صالح').length;
    const broken = vessels.filter(v => v.status === 'معطب').length;
    const maint = vessels.filter(v => v.status === 'صيانة').length;
    res.json({ total, good, broken, maint, efficiency: total ? ((good / total) * 100).toFixed(1) : 0 });
});

// ==================== Health Check ====================
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ==================== تشغيل السيرفر ====================
async function startServer() {
    await initData();
    app.listen(PORT, () => {
        console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
        console.log(`║     🚀 السيرفر يعمل على http://localhost:${PORT}                  ║`);
        console.log(`╠══════════════════════════════════════════════════════════════╣`);
        console.log(`║  🔑 admin / Admin@123456                                     ║`);
        console.log(`║  🔑 editor / Editor@123456                                   ║`);
        console.log(`║  🔑 viewer / Viewer@123456                                   ║`);
        console.log(`╚══════════════════════════════════════════════════════════════╝\n`);
    });
}

startServer();
