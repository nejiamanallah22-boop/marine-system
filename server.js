const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const fs = require('fs');
const path = require('path');

// ==================== إعدادات الأمان ====================
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'your-super-secret-key-change-this-in-production-2024';
const REFRESH_SECRET = 'your-refresh-secret-key-change-this-2024';

app.set('trust proxy', true);
app.disable('x-powered-by');

// ==================== Middleware ====================
app.use(helmet({
    contentSecurityPolicy: false
}));

app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ==================== Rate Limiting ====================
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'طلبات كثيرة، يرجى المحاولة لاحقاً' }
});
app.use('/api/', limiter);

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'محاولات دخول كثيرة' }
});

// ==================== قاعدة البيانات ====================
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

let db;

async function initDB() {
    db = await open({
        filename: path.join(DATA_DIR, 'marine.db'),
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            created_at TEXT NOT NULL
        );

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

        CREATE TABLE IF NOT EXISTS logs (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            username TEXT NOT NULL,
            user_role TEXT NOT NULL,
            action TEXT NOT NULL,
            details TEXT,
            ip TEXT
        );

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

        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            token TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
    `);

    // المستخدمين الافتراضيين
    const users = await db.all('SELECT * FROM users');
    if (users.length === 0) {
        const salt = await bcrypt.genSalt(10);
        await db.run(`INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), 'admin', await bcrypt.hash('admin123', salt), 'مسؤول', 1, new Date().toISOString()]);
        await db.run(`INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), 'editor', await bcrypt.hash('editor123', salt), 'محرر', 1, new Date().toISOString()]);
        await db.run(`INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), 'viewer', await bcrypt.hash('viewer123', salt), 'مشاهد', 1, new Date().toISOString()]);
        console.log('✅ تم إنشاء المستخدمين الافتراضيين');
    }

    // المراكب الافتراضية
    const vessels = await db.all('SELECT * FROM vessels');
    if (vessels.length === 0) {
        await db.run(`INSERT INTO vessels (id, name, number, length, category, region, zone, port, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), 'البروق-1', 'B001', 11, 'البروق', 'الشمال', 'تونس', 'تونس', 'صالح', new Date().toISOString()]);
        await db.run(`INSERT INTO vessels (id, name, number, length, category, region, zone, port, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), 'صقر-1', 'S001', 10, 'صقور', 'الساحل', 'سوسة', 'سوسة', 'صالح', new Date().toISOString()]);
        await db.run(`INSERT INTO vessels (id, name, number, length, category, region, zone, port, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), 'خوفة-1', 'K001', 20, 'خوافر', 'الوسط', 'صفاقس', 'صفاقس', 'معطب', new Date().toISOString()]);
        console.log('✅ تم إنشاء المراكب الافتراضية');
    }
}

// ==================== دوال مساعدة ====================
function getIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
}

async function addLog(username, role, action, details, req) {
    try {
        await db.run(`INSERT INTO logs VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), new Date().toISOString(), username, role, action, details, req ? getIP(req) : 'system']);
    } catch (err) {
        console.error('خطأ في التسجيل:', err);
    }
}

// ==================== Middleware التوثيق ====================
async function auth(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'غير مصرح' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        res.status(403).json({ error: 'رمز غير صالح' });
    }
}

function roleAuth(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'ليس لديك صلاحية' });
        }
        next();
    };
}

// ==================== API Routes ====================

// تسجيل الدخول
app.post('/api/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }
    
    const user = await db.get('SELECT * FROM users WHERE username = ? AND enabled = 1', [username]);
    
    if (!user) {
        await addLog(username, 'غير معروف', 'login_failed', 'مستخدم غير موجود', req);
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
        await addLog(username, 'غير معروف', 'login_failed', 'كلمة مرور خاطئة', req);
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    const refreshToken = jwt.sign({ id: user.id }, REFRESH_SECRET, { expiresIn: '7d' });
    
    await db.run(`INSERT INTO refresh_tokens VALUES (?, ?, ?, ?)`, [uuidv4(), user.id, refreshToken, new Date().toISOString()]);
    await addLog(user.username, user.role, 'login', 'تسجيل دخول ناجح', req);
    
    res.json({ success: true, token, refreshToken, user: { id: user.id, username: user.username, role: user.role } });
});

// تجديد التوكن
app.post('/api/refresh', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token مطلوب' });
    
    const stored = await db.get('SELECT * FROM refresh_tokens WHERE token = ?', [refreshToken]);
    if (!stored) return res.status(403).json({ error: 'Refresh token غير صالح' });
    
    try {
        const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
        const user = await db.get('SELECT * FROM users WHERE id = ? AND enabled = 1', [decoded.id]);
        if (!user) return res.status(403).json({ error: 'مستخدم غير موجود' });
        
        const newToken = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        const newRefreshToken = jwt.sign({ id: user.id }, REFRESH_SECRET, { expiresIn: '7d' });
        
        await db.run(`DELETE FROM refresh_tokens WHERE token = ?`, [refreshToken]);
        await db.run(`INSERT INTO refresh_tokens VALUES (?, ?, ?, ?)`, [uuidv4(), user.id, newRefreshToken, new Date().toISOString()]);
        
        res.json({ token: newToken, refreshToken: newRefreshToken });
    } catch {
        res.status(403).json({ error: 'Refresh token غير صالح' });
    }
});

// تسجيل الخروج
app.post('/api/logout', auth, async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        await db.run(`DELETE FROM refresh_tokens WHERE token = ?`, [refreshToken]);
    }
    await addLog(req.user.username, req.user.role, 'logout', 'تسجيل خروج', req);
    res.json({ success: true });
});

// ==================== المراكب ====================
app.get('/api/vessels', auth, async (req, res) => {
    const vessels = await db.all('SELECT * FROM vessels ORDER BY created_at DESC');
    res.json(vessels);
});

app.post('/api/vessels', auth, roleAuth('مسؤول', 'محرر'), async (req, res) => {
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
    
    await db.run(`INSERT INTO vessels VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [vessel.id, vessel.name, vessel.number, vessel.length, vessel.category, vessel.region, vessel.zone,
         vessel.port, vessel.support_location, vessel.status, vessel.breakdown_type, vessel.breakdown_date,
         vessel.end_date, vessel.reference, vessel.created_at, null]);
    
    await addLog(req.user.username, req.user.role, 'add_vessel', `إضافة مركب: ${name}`, req);
    res.json({ success: true, vessel });
});

app.put('/api/vessels/:id', auth, roleAuth('مسؤول', 'محرر'), async (req, res) => {
    const { name, number, length, category, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference } = req.body;
    
    const existing = await db.get('SELECT * FROM vessels WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'المركب غير موجود' });
    
    await db.run(`UPDATE vessels SET name=?, number=?, length=?, category=?, region=?, zone=?, port=?,
        support_location=?, status=?, breakdown_type=?, breakdown_date=?, end_date=?, reference=?, updated_at=?
        WHERE id=?`,
        [name, number, length, category, region, zone, port, support_location, status, breakdown_type,
         breakdown_date, end_date, reference, new Date().toISOString(), req.params.id]);
    
    await addLog(req.user.username, req.user.role, 'edit_vessel', `تعديل مركب: ${name}`, req);
    res.json({ success: true });
});

app.delete('/api/vessels/:id', auth, roleAuth('مسؤول'), async (req, res) => {
    const vessel = await db.get('SELECT * FROM vessels WHERE id = ?', [req.params.id]);
    if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
    
    await db.run('DELETE FROM vessels WHERE id = ?', [req.params.id]);
    await addLog(req.user.username, req.user.role, 'delete_vessel', `حذف مركب: ${vessel.name}`, req);
    res.json({ success: true });
});

// ==================== المستخدمين ====================
app.get('/api/users', auth, roleAuth('مسؤول'), async (req, res) => {
    const users = await db.all('SELECT id, username, role, enabled, created_at FROM users');
    res.json(users);
});

app.post('/api/users', auth, roleAuth('مسؤول'), async (req, res) => {
    const { username, password, role } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
    }
    if (password.length < 4) {
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
    }
    
    const existing = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (existing) return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
    
    const salt = await bcrypt.genSalt(10);
    await db.run(`INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), username, await bcrypt.hash(password, salt), role || 'مشاهد', 1, new Date().toISOString()]);
    
    await addLog(req.user.username, req.user.role, 'add_user', `إضافة مستخدم: ${username}`, req);
    res.json({ success: true });
});

app.put('/api/users/:id/password', auth, roleAuth('مسؤول'), async (req, res) => {
    const { password } = req.body;
    
    if (!password || password.length < 4) {
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
    }
    
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    
    const salt = await bcrypt.genSalt(10);
    await db.run('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash(password, salt), req.params.id]);
    
    await addLog(req.user.username, req.user.role, 'change_password', `تغيير كلمة مرور: ${user.username}`, req);
    res.json({ success: true });
});

app.put('/api/users/:id/toggle', auth, roleAuth('مسؤول'), async (req, res) => {
    const { enabled } = req.body;
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (user.username === 'admin' && enabled === false) {
        return res.status(403).json({ error: 'لا يمكن تعطيل المستخدم الرئيسي' });
    }
    
    await db.run('UPDATE users SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, req.params.id]);
    await addLog(req.user.username, req.user.role, enabled ? 'enable_user' : 'disable_user', `${enabled ? 'تفعيل' : 'تعطيل'} مستخدم: ${user.username}`, req);
    res.json({ success: true });
});

app.delete('/api/users/:id', auth, roleAuth('مسؤول'), async (req, res) => {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (user.username === 'admin') return res.status(403).json({ error: 'لا يمكن حذف المستخدم الرئيسي' });
    if (user.id === req.user.id) return res.status(403).json({ error: 'لا يمكن حذف حسابك الحالي' });
    
    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    await addLog(req.user.username, req.user.role, 'delete_user', `حذف مستخدم: ${user.username}`, req);
    res.json({ success: true });
});

// ==================== السجلات ====================
app.get('/api/logs', auth, roleAuth('مسؤول'), async (req, res) => {
    const logs = await db.all('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 200');
    res.json(logs);
});

// ==================== التذاكر ====================
app.get('/api/tickets', auth, async (req, res) => {
    const tickets = await db.all('SELECT * FROM tickets ORDER BY created_at DESC');
    if (req.user.role !== 'مسؤول') {
        res.json(tickets.filter(t => t.username === req.user.username));
    } else {
        res.json(tickets);
    }
});

app.post('/api/tickets', auth, async (req, res) => {
    const { subject, message } = req.body;
    
    if (!subject || !message) {
        return res.status(400).json({ error: 'العنوان والرسالة مطلوبان' });
    }
    
    const now = new Date();
    await db.run(`INSERT INTO tickets VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), now.toLocaleDateString('ar-TN'), now.toLocaleTimeString('ar-TN'),
         req.user.username, subject, message, 'قيد المعالجة', now.toISOString()]);
    
    await addLog(req.user.username, req.user.role, 'add_ticket', `إضافة تذكرة: ${subject}`, req);
    res.json({ success: true });
});

// ==================== إحصائيات ====================
app.get('/api/stats', auth, async (req, res) => {
    const total = await db.get('SELECT COUNT(*) as c FROM vessels');
    const good = await db.get(`SELECT COUNT(*) as c FROM vessels WHERE status = 'صالح'`);
    const broken = await db.get(`SELECT COUNT(*) as c FROM vessels WHERE status = 'معطب'`);
    const maint = await db.get(`SELECT COUNT(*) as c FROM vessels WHERE status = 'صيانة'`);
    
    res.json({
        total: total.c,
        good: good.c,
        broken: broken.c,
        maint: maint.c,
        efficiency: total.c ? ((good.c / total.c) * 100).toFixed(1) : 0
    });
});

// ==================== تصدير واستيراد ====================
app.get('/api/export', auth, roleAuth('مسؤول'), async (req, res) => {
    const vessels = await db.all('SELECT * FROM vessels');
    res.json({ vessels, exportDate: new Date().toISOString() });
});

app.post('/api/import', auth, roleAuth('مسؤول'), async (req, res) => {
    const { vessels } = req.body;
    if (!vessels || !Array.isArray(vessels)) {
        return res.status(400).json({ error: 'بيانات غير صالحة' });
    }
    
    for (const v of vessels) {
        await db.run(`INSERT OR REPLACE INTO vessels VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [v.id || uuidv4(), v.name, v.number || '', v.length || 0, v.category || '', v.region || '',
             v.zone || '', v.port || '', v.support_location || '', v.status || 'صالح', v.breakdown_type || '',
             v.breakdown_date || '', v.end_date || '', v.reference || '', v.created_at || new Date().toISOString(), null]);
    }
    
    await addLog(req.user.username, req.user.role, 'import_data', `استيراد ${vessels.length} مركب`, req);
    res.json({ success: true });
});

// ==================== Health Check ====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== تشغيل السيرفر ====================
async function start() {
    await initDB();
    app.listen(PORT, () => {
        console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
        console.log(`║     🚀 السيرفر يعمل على http://localhost:${PORT}                  ║`);
        console.log(`╠══════════════════════════════════════════════════════════════╣`);
        console.log(`║  🔑 admin / admin123                                         ║`);
        console.log(`║  🔑 editor / editor123                                       ║`);
        console.log(`║  🔑 viewer / viewer123                                       ║`);
        console.log(`╚══════════════════════════════════════════════════════════════╝\n`);
    });
}

start();
