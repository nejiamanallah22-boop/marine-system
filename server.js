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

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'my_super_secret_key_change_this';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'my_refresh_secret_key_change_this';

app.set('trust proxy', true);
app.disable('x-powered-by');

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
}));

app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Rate Limiters
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, skipSuccessfulRequests: true });
app.use('/api/', globalLimiter);

// مجلد البيانات
if (!fs.existsSync('./data')) fs.mkdirSync('./data');

let db;

async function initDatabase() {
    db = await open({
        filename: './data/marine.db',
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

        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            ip TEXT,
            user_agent TEXT,
            created_at TEXT NOT NULL,
            last_active TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            token_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            device_id TEXT
        );

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

        CREATE INDEX IF NOT EXISTS idx_vessels_name ON vessels(name);
        CREATE INDEX IF NOT EXISTS idx_vessels_status ON vessels(status);
        CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_logs_username ON logs(username);
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
    `);

    console.log('✅ قاعدة البيانات جاهزة');
}

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
        if (!req.user) return res.status(401).json({ error: 'غير مصرح به' });
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'ليس لديك صلاحية لهذه العملية' });
        }
        next();
    };
}

// ==================== تهيئة البيانات الأولية ====================
async function initData() {
    await initDatabase();
    
    const userCount = await db.get('SELECT COUNT(*) as c FROM users');
    if (userCount.c === 0) {
        const salt = await bcrypt.genSalt(10);
        await db.run(
            `INSERT INTO users (id, username, password, role, enabled, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), "admin", await bcrypt.hash("admin123", salt), "مسؤول", 1, new Date().toISOString()]
        );
        await db.run(
            `INSERT INTO users (id, username, password, role, enabled, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), "editor", await bcrypt.hash("editor123", salt), "محرر", 1, new Date().toISOString()]
        );
        await db.run(
            `INSERT INTO users (id, username, password, role, enabled, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), "viewer", await bcrypt.hash("viewer123", salt), "مشاهد", 1, new Date().toISOString()]
        );
        console.log('✅ تم إنشاء المستخدمين الافتراضيين');
    }
    
    const vesselCount = await db.get('SELECT COUNT(*) as c FROM vessels');
    if (vesselCount.c === 0) {
        const vessels = [
            { name: "البروق-1", number: "B001", length: 11, category: "البروق", region: "الشمال", zone: "تونس", port: "تونس", support_location: "حلق الوادي", status: "صالح", breakdown_type: "", breakdown_date: "", end_date: "", reference: "" },
            { name: "صقر-1", number: "S001", length: 10, category: "صقور", region: "الساحل", zone: "سوسة", port: "سوسة", support_location: "المنستير", status: "صالح", breakdown_type: "", breakdown_date: "", end_date: "", reference: "" },
            { name: "خوفة-1", number: "K001", length: 20, category: "خوافر", region: "الوسط", zone: "صفاقس", port: "صفاقس", support_location: "المهدية", status: "معطب", breakdown_type: "محرك", breakdown_date: "2024-01-15", end_date: "2024-02-15", reference: "REF001" },
            { name: "زورق-1", number: "Z001", length: 15, category: "زوارق مزدوجة", region: "الجنوب", zone: "جربة", port: "جربة", support_location: "قابس", status: "صيانة", breakdown_type: "كهرباء", breakdown_date: "2024-01-20", end_date: "2024-02-20", reference: "REF002" }
        ];
        for (const v of vessels) {
            await db.run(
                `INSERT INTO vessels (id, name, number, length, category, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [uuidv4(), v.name, v.number, v.length, v.category, v.region, v.zone, v.port, v.support_location, v.status, v.breakdown_type, v.breakdown_date, v.end_date, v.reference, new Date().toISOString()]
            );
        }
        console.log('✅ تم إنشاء المراكب الافتراضية');
    }
    
    if ((await db.get('SELECT COUNT(*) as c FROM logs')).c === 0) {
        await db.run(`INSERT INTO logs (id, timestamp, username, user_role, action, details, ip_address, user_agent)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                     [uuidv4(), new Date().toISOString(), "system", "system", "تهيئة النظام", "تم تهيئة قاعدة البيانات", "localhost", "system"]);
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

// ==================== Refresh Tokens ====================
async function saveRefreshToken(userId, token, deviceId = null) {
    const tokenHash = sha256(token);
    await db.run('DELETE FROM refresh_tokens WHERE user_id = ? AND device_id = ?', [userId, deviceId || 'default']);
    await db.run(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, created_at, device_id)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), userId, tokenHash, new Date().toISOString(), deviceId || 'default']
    );
}

async function verifyRefreshToken(token) {
    try {
        const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET);
        const tokenHash = sha256(token);
        const rt = await db.get('SELECT * FROM refresh_tokens WHERE token_hash = ? AND user_id = ?', [tokenHash, decoded.id]);
        if (!rt) return null;
        return decoded;
    } catch {
        return null;
    }
}

async function revokeRefreshToken(token) {
    const tokenHash = sha256(token);
    await db.run('DELETE FROM refresh_tokens WHERE token_hash = ?', [tokenHash]);
}

// ==================== API Routes ====================

// تسجيل الدخول
app.post('/api/login', loginLimiter, async (req, res) => {
    const { username, password, deviceId } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }
    
    const user = await db.get('SELECT * FROM users WHERE username = ? AND enabled = 1', [username]);
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
    
    const refreshToken = jwt.sign({ id: user.id }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
    const sessionId = await createSession(user.id, req);
    await saveRefreshToken(user.id, refreshToken, deviceId);
    await addLog(user.username, user.role, 'تسجيل دخول', 'قام المستخدم بتسجيل الدخول', req);
    
    res.json({
        success: true,
        accessToken,
        refreshToken,
        sessionId,
        user: { id: user.id, username: user.username, role: user.role }
    });
});

// تجديد التوكن
app.post('/api/refresh', async (req, res) => {
    const { refreshToken, deviceId } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token مطلوب' });
    
    const decoded = await verifyRefreshToken(refreshToken);
    if (!decoded) return res.status(403).json({ error: 'Refresh token غير صالح' });
    
    const user = await db.get('SELECT * FROM users WHERE id = ? AND enabled = 1', [decoded.id]);
    if (!user) return res.status(403).json({ error: 'مستخدم غير موجود' });
    
    const newAccessToken = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
    
    const newRefreshToken = jwt.sign({ id: user.id }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
    await revokeRefreshToken(refreshToken);
    await saveRefreshToken(user.id, newRefreshToken, deviceId);
    
    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
});

// تسجيل الخروج
app.post('/api/logout', async (req, res) => {
    const { refreshToken, sessionId } = req.body;
    if (refreshToken) await revokeRefreshToken(refreshToken);
    if (sessionId) await db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
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

app.post('/api/vessels', authenticateToken, authorizeRole('مسؤول', 'محرر'), async (req, res) => {
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

app.put('/api/vessels/:id', authenticateToken, authorizeRole('مسؤول', 'محرر'), async (req, res) => {
    const { name, number, length, category, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference } = req.body;
    const id = req.params.id;
    
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

app.post('/api/users', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const { username, password, role } = req.body;
    
    if (!username || !username.trim()) {
        return res.status(400).json({ error: 'اسم المستخدم مطلوب' });
    }
    if (!password || password.length < 4) {
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
    }
    
    const existing = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (existing) {
        return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const newUser = {
        id: uuidv4(),
        username: username.trim(),
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

app.put('/api/users/:id/password', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const { password } = req.body;
    const userId = req.params.id;
    
    if (!password || password.length < 4) {
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
    }
    
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
        [ticket.id, ticket.date, ticket.time, ticket.username, ticket.subject, ticket.message, ticket.status, ticket.created_at]
    );
    
    await addLog(req.user.username, req.user.role, 'إرسال تذكرة', `تم إرسال تذكرة: "${subject}"`, req);
    res.json({ success: true });
});

// ==================== تصدير واستيراد ====================
app.get('/api/export', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const vessels = await db.all('SELECT * FROM vessels');
    res.json({ vessels, exportDate: new Date().toISOString(), exportedBy: req.user.username });
});

app.post('/api/import', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const { vessels } = req.body;
    if (!vessels || !Array.isArray(vessels)) {
        return res.status(400).json({ error: 'بيانات غير صالحة' });
    }
    
    for (const v of vessels) {
        if (!v.name) continue;
        await db.run(
            `INSERT OR REPLACE INTO vessels (id, name, number, length, category, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [v.id || uuidv4(), v.name, v.number || '', v.length || 0, v.category || '', v.region || '', v.zone || '', v.port || '', v.support_location || '', v.status || 'صالح', v.breakdown_type || '', v.breakdown_date || '', v.end_date || '', v.reference || '', v.created_at || new Date().toISOString()]
        );
    }
    
    await addLog(req.user.username, req.user.role, 'استيراد بيانات', `تم استيراد ${vessels.length} مركب`, req);
    res.json({ success: true });
});

// ==================== إحصائيات ====================
app.get('/api/stats', authenticateToken, async (req, res) => {
    const total = await db.get('SELECT COUNT(*) as c FROM vessels');
    const good = await db.get('SELECT COUNT(*) as c FROM vessels WHERE status = "صالح"');
    const broken = await db.get('SELECT COUNT(*) as c FROM vessels WHERE status = "معطب"');
    const maint = await db.get('SELECT COUNT(*) as c FROM vessels WHERE status = "صيانة"');
    
    const categories = await db.all('SELECT category, COUNT(*) as c FROM vessels GROUP BY category');
    const regions = await db.all('SELECT region, COUNT(*) as c FROM vessels GROUP BY region');
    
    res.json({
        total: total.c,
        good: good.c,
        broken: broken.c,
        maint: maint.c,
        efficiency: total.c ? ((good.c / total.c) * 100).toFixed(1) : 0,
        categories: categories.reduce((acc, cat) => { acc[cat.category] = cat.c; return acc; }, {}),
        regions: regions.reduce((acc, reg) => { acc[reg.region] = reg.c; return acc; }, {})
    });
});

// ==================== Health Check ====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== تشغيل السيرفر ====================
async function startServer() {
    await initData();
    app.listen(PORT, () => {
        console.log(`\n╔══════════════════════════════════════════════════════════════════════════════╗`);
        console.log(`║                    🚀 السيرفر الكامل يعمل على http://localhost:${PORT}                      ║`);
        console.log(`╠══════════════════════════════════════════════════════════════════════════════╣`);
        console.log(`║  🔑 admin / admin123 (مسؤول كامل الصلاحيات)                                  ║`);
        console.log(`║  🔑 editor / editor123 (محرر - إضافة وتعديل)                                 ║`);
        console.log(`║  🔑 viewer / viewer123 (مشاهد - عرض فقط)                                    ║`);
        console.log(`╠══════════════════════════════════════════════════════════════════════════════╣`);
        console.log(`║  ✅ جميع الصفحات تعمل:                                                       ║`);
        console.log(`║     📋 السجل العام | 🔧 سجل الصيانة | 📊 جاهزية الأسطول                       ║`);
        console.log(`║     💬 الدعم الفني | 📜 تتبع المستخدمين | 👥 إدارة المستخدمين                 ║`);
        console.log(`╚══════════════════════════════════════════════════════════════════════════════╝\n`);
    });
}

startServer();
