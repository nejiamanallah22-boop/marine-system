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

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'your-super-secret-key-change-in-production';
const REFRESH_TOKEN_SECRET = 'your-refresh-secret-key-change-in-production';

// ==================== إعدادات الأمان ====================
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==================== Rate Limit ====================
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/', limiter);

// ==================== قاعدة البيانات ====================
if (!fs.existsSync('./data')) fs.mkdirSync('./data');
let db;

async function initDB() {
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
            breakdown_date TEXT, end_date TEXT, reference TEXT, created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS logs (
            id TEXT PRIMARY KEY, timestamp TEXT, username TEXT,
            user_role TEXT, action TEXT, details TEXT, ip TEXT
        );
        CREATE TABLE IF NOT EXISTS tickets (
            id TEXT PRIMARY KEY, date TEXT, time TEXT, username TEXT,
            subject TEXT, message TEXT, status TEXT, created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id TEXT PRIMARY KEY, user_id TEXT, token TEXT, created_at TEXT
        );
    `);
    
    // مستخدمين افتراضيين
    const users = await db.all('SELECT * FROM users');
    if (users.length === 0) {
        const salt = await bcrypt.genSalt(10);
        await db.run(`INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)`, [uuidv4(), 'admin', await bcrypt.hash('admin123', salt), 'مسؤول', 1, new Date().toISOString()]);
        await db.run(`INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)`, [uuidv4(), 'editor', await bcrypt.hash('editor123', salt), 'محرر', 1, new Date().toISOString()]);
        await db.run(`INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)`, [uuidv4(), 'viewer', await bcrypt.hash('viewer123', salt), 'مشاهد', 1, new Date().toISOString()]);
        console.log('✅ تم إنشاء المستخدمين');
    }
    
    // مراكب افتراضية
    const vessels = await db.all('SELECT * FROM vessels');
    if (vessels.length === 0) {
        await db.run(`INSERT INTO vessels VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [uuidv4(), 'البروق-1', 'B001', 11, 'البروق', 'الشمال', 'تونس', 'تونس', 'حلق الوادي', 'صالح', '', '', '', '', new Date().toISOString()]);
        await db.run(`INSERT INTO vessels VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [uuidv4(), 'صقر-1', 'S001', 10, 'صقور', 'الساحل', 'سوسة', 'سوسة', 'المنستير', 'صالح', '', '', '', '', new Date().toISOString()]);
        await db.run(`INSERT INTO vessels VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [uuidv4(), 'خوفة-1', 'K001', 20, 'خوافر', 'الوسط', 'صفاقس', 'صفاقس', 'المهدية', 'معطب', 'محرك', '2024-01-15', '2024-02-15', 'REF001', new Date().toISOString()]);
        console.log('✅ تم إنشاء المراكب');
    }
}

// ==================== دوال مساعدة ====================
async function addLog(username, role, action, details, req) {
    await db.run(`INSERT INTO logs VALUES (?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), new Date().toISOString(), username, role, action, details, req?.ip || 'unknown']);
}

function authenticateToken(req, res, next) {
    const auth = req.headers['authorization'];
    const token = auth?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'غير مصرح' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch { res.status(403).json({ error: 'رمز غير صالح' }); }
}

function authorize(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'ليس لديك صلاحية' });
        next();
    };
}

// ==================== API Routes ====================

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await db.get('SELECT * FROM users WHERE username = ? AND enabled = 1', [username]);
    if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({ error: 'بيانات غير صحيحة' });
    }
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    await addLog(user.username, user.role, 'تسجيل دخول', 'قام بتسجيل الدخول', req);
    res.json({ success: true, token, user: { id: user.id, username: user.username, role: user.role } });
});

// تسجيل الخروج
app.post('/api/logout', authenticateToken, async (req, res) => {
    await addLog(req.user.username, req.user.role, 'تسجيل خروج', 'قام بتسجيل الخروج', req);
    res.json({ success: true });
});

// ==================== المراكب ====================
app.get('/api/vessels', authenticateToken, async (req, res) => {
    const vessels = await db.all('SELECT * FROM vessels ORDER BY created_at DESC');
    res.json(vessels);
});

app.post('/api/vessels', authenticateToken, authorize('مسؤول', 'محرر'), async (req, res) => {
    const { name, number, length, category, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference } = req.body;
    if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
    await db.run(`INSERT INTO vessels VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [uuidv4(), name, number || '', length || 0, category || '', region || '', zone || '', port || '', support_location || '', status || 'صالح', breakdown_type || '', breakdown_date || '', end_date || '', reference || '', new Date().toISOString()]);
    await addLog(req.user.username, req.user.role, 'إضافة مركب', `تم إضافة "${name}"`, req);
    res.json({ success: true });
});

app.put('/api/vessels/:id', authenticateToken, authorize('مسؤول', 'محرر'), async (req, res) => {
    const { name, number, length, category, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference } = req.body;
    await db.run(`UPDATE vessels SET name=?, number=?, length=?, category=?, region=?, zone=?, port=?, support_location=?, status=?, breakdown_type=?, breakdown_date=?, end_date=?, reference=? WHERE id=?`, [name, number, length, category, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference, req.params.id]);
    await addLog(req.user.username, req.user.role, 'تعديل مركب', `تم تعديل "${name}"`, req);
    res.json({ success: true });
});

app.delete('/api/vessels/:id', authenticateToken, authorize('مسؤول'), async (req, res) => {
    await db.run('DELETE FROM vessels WHERE id = ?', [req.params.id]);
    await addLog(req.user.username, req.user.role, 'حذف مركب', `تم حذف مركب`, req);
    res.json({ success: true });
});

// ==================== المستخدمين ====================
app.get('/api/users', authenticateToken, authorize('مسؤول'), async (req, res) => {
    const users = await db.all('SELECT id, username, role, enabled, created_at FROM users');
    res.json(users);
});

app.post('/api/users', authenticateToken, authorize('مسؤول'), async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'بيانات ناقصة' });
    const existing = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (existing) return res.status(400).json({ error: 'المستخدم موجود' });
    const salt = await bcrypt.genSalt(10);
    await db.run(`INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)`, [uuidv4(), username, await bcrypt.hash(password, salt), role || 'مشاهد', 1, new Date().toISOString()]);
    await addLog(req.user.username, req.user.role, 'إضافة مستخدم', `تم إضافة "${username}"`, req);
    res.json({ success: true });
});

app.put('/api/users/:id/password', authenticateToken, authorize('مسؤول'), async (req, res) => {
    const { password } = req.body;
    const salt = await bcrypt.genSalt(10);
    await db.run('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash(password, salt), req.params.id]);
    await addLog(req.user.username, req.user.role, 'تغيير كلمة مرور', 'تم تغيير كلمة المرور', req);
    res.json({ success: true });
});

app.put('/api/users/:id/toggle', authenticateToken, authorize('مسؤول'), async (req, res) => {
    const { enabled } = req.body;
    await db.run('UPDATE users SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, req.params.id]);
    await addLog(req.user.username, req.user.role, enabled ? 'تفعيل مستخدم' : 'تعطيل مستخدم', '', req);
    res.json({ success: true });
});

app.delete('/api/users/:id', authenticateToken, authorize('مسؤول'), async (req, res) => {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (user?.username === 'admin') return res.status(403).json({ error: 'لا يمكن حذف المشرف' });
    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    await addLog(req.user.username, req.user.role, 'حذف مستخدم', `تم حذف "${user?.username}"`, req);
    res.json({ success: true });
});

// ==================== السجلات ====================
app.get('/api/logs', authenticateToken, authorize('مسؤول'), async (req, res) => {
    const logs = await db.all('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 200');
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
    await db.run(`INSERT INTO tickets VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), now.toLocaleDateString('ar-TN'), now.toLocaleTimeString('ar-TN'), req.user.username, subject, message, 'قيد المعالجة', now.toISOString()]);
    await addLog(req.user.username, req.user.role, 'إرسال تذكرة', `تم إرسال "${subject}"`, req);
    res.json({ success: true });
});

// ==================== تصدير ====================
app.get('/api/export', authenticateToken, authorize('مسؤول'), async (req, res) => {
    const vessels = await db.all('SELECT * FROM vessels');
    res.json({ vessels, exportDate: new Date().toISOString() });
});

app.post('/api/import', authenticateToken, authorize('مسؤول'), async (req, res) => {
    const { vessels } = req.body;
    if (vessels && Array.isArray(vessels)) {
        for (const v of vessels) {
            await db.run(`INSERT OR REPLACE INTO vessels VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [v.id || uuidv4(), v.name, v.number || '', v.length || 0, v.category || '', v.region || '', v.zone || '', v.port || '', v.support_location || '', v.status || 'صالح', v.breakdown_type || '', v.breakdown_date || '', v.end_date || '', v.reference || '', new Date().toISOString()]);
        }
        await addLog(req.user.username, req.user.role, 'استيراد بيانات', `تم استيراد ${vessels.length} مركب`, req);
    }
    res.json({ success: true });
});

// ==================== إحصائيات ====================
app.get('/api/stats', authenticateToken, async (req, res) => {
    const vessels = await db.all('SELECT * FROM vessels');
    const total = vessels.length;
    const good = vessels.filter(v => v.status === 'صالح').length;
    const broken = vessels.filter(v => v.status === 'معطب').length;
    const maint = vessels.filter(v => v.status === 'صيانة').length;
    const categories = {};
    vessels.forEach(v => { categories[v.category] = (categories[v.category] || 0) + 1; });
    res.json({ total, good, broken, maint, efficiency: total ? ((good / total) * 100).toFixed(1) : 0, categories });
});

// ==================== التشغيل ====================
initDB().then(() => {
    app.listen(PORT, () => console.log(`\n🚀 السيرفر يعمل على http://localhost:${PORT}\n🔑 admin/admin123 | editor/editor123 | viewer/viewer123\n`));
});
