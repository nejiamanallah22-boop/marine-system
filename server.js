const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'my_super_secret_key_123456789';
const REFRESH_TOKEN_SECRET = 'my_refresh_secret_key_987654321';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// مجلد البيانات
if (!fs.existsSync('./data')) fs.mkdirSync('./data');

let db;

async function initDB() {
    db = await open({
        filename: './data/marine.db',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT,
            enabled INTEGER,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS vessels (
            id TEXT PRIMARY KEY,
            name TEXT,
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
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS logs (
            id TEXT PRIMARY KEY,
            timestamp TEXT,
            username TEXT,
            user_role TEXT,
            action TEXT,
            details TEXT,
            ip_address TEXT
        );

        CREATE TABLE IF NOT EXISTS tickets (
            id TEXT PRIMARY KEY,
            date TEXT,
            time TEXT,
            username TEXT,
            subject TEXT,
            message TEXT,
            status TEXT,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            token_hash TEXT,
            created_at TEXT
        );
    `);

    // إنشاء مستخدم افتراضي
    const adminExists = await db.get('SELECT * FROM users WHERE username = ?', ['admin']);
    if (!adminExists) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('admin123', salt);
        await db.run(
            `INSERT INTO users (id, username, password, role, enabled, created_at) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), 'admin', hashedPassword, 'مسؤول', 1, new Date().toISOString()]
        );
        console.log('✅ تم إنشاء مستخدم admin بكلمة مرور: admin123');
    }

    // إنشاء مراكب افتراضية
    const vesselsCount = await db.get('SELECT COUNT(*) as c FROM vessels');
    if (vesselsCount.c === 0) {
        const vessels = [
            { name: 'البروق-1', number: 'B001', length: 11, category: 'البروق', region: 'الشمال', zone: 'تونس', port: 'تونس', status: 'صالح' },
            { name: 'صقر-1', number: 'S001', length: 10, category: 'صقور', region: 'الساحل', zone: 'سوسة', port: 'سوسة', status: 'صالح' },
            { name: 'خوفة-1', number: 'K001', length: 20, category: 'خوافر', region: 'الوسط', zone: 'صفاقس', port: 'صفاقس', status: 'معطب' }
        ];
        for (const v of vessels) {
            await db.run(
                `INSERT INTO vessels (id, name, number, length, category, region, zone, port, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [uuidv4(), v.name, v.number, v.length, v.category, v.region, v.zone, v.port, v.status, new Date().toISOString()]
            );
        }
        console.log('✅ تم إنشاء مراكب افتراضية');
    }
}

// ==================== API Routes ====================

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    const user = await db.get('SELECT * FROM users WHERE username = ? AND enabled = 1', [username]);
    if (!user) {
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
    
    res.json({ accessToken: token });
});

// الحصول على جميع المراكب
app.get('/api/vessels', async (req, res) => {
    const vessels = await db.all('SELECT * FROM vessels ORDER BY created_at DESC');
    res.json(vessels);
});

// إضافة مركب
app.post('/api/vessels', async (req, res) => {
    const { name, number, length, category, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference } = req.body;
    
    if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
    
    const vessel = {
        id: uuidv4(),
        name: name,
        number: number || '',
        length: length || 0,
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
    
    res.json({ success: true, vessel });
});

// تحديث مركب
app.put('/api/vessels/:id', async (req, res) => {
    const { name, number, length, category, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference } = req.body;
    
    await db.run(
        `UPDATE vessels SET name=?, number=?, length=?, category=?, region=?, zone=?, port=?, support_location=?, status=?, breakdown_type=?, breakdown_date=?, end_date=?, reference=?
         WHERE id=?`,
        [name, number, length, category, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference, req.params.id]
    );
    
    res.json({ success: true });
});

// حذف مركب
app.delete('/api/vessels/:id', async (req, res) => {
    await db.run('DELETE FROM vessels WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

// الحصول على المستخدمين
app.get('/api/users', async (req, res) => {
    const users = await db.all('SELECT id, username, role, enabled, created_at FROM users');
    res.json(users);
});

// إضافة مستخدم
app.post('/api/users', async (req, res) => {
    const { username, password, role } = req.body;
    
    const existing = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (existing) {
        return res.status(400).json({ error: 'المستخدم موجود' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    await db.run(
        `INSERT INTO users (id, username, password, role, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), username, hashedPassword, role || 'مشاهد', 1, new Date().toISOString()]
    );
    
    res.json({ success: true });
});

// تغيير كلمة المرور
app.put('/api/users/:id/password', async (req, res) => {
    const { password } = req.body;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    await db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.params.id]);
    res.json({ success: true });
});

// تبديل حالة المستخدم
app.put('/api/users/:id/toggle', async (req, res) => {
    const { enabled } = req.body;
    await db.run('UPDATE users SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, req.params.id]);
    res.json({ success: true });
});

// حذف مستخدم
app.delete('/api/users/:id', async (req, res) => {
    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

// السجلات
app.get('/api/logs', async (req, res) => {
    const logs = await db.all('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 200');
    res.json(logs);
});

app.post('/api/logs', async (req, res) => {
    const log = req.body;
    await db.run(
        `INSERT INTO logs (id, timestamp, username, user_role, action, details, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), log.timestamp, log.username, log.user_role, log.action, log.details, log.ip_address]
    );
    res.json({ success: true });
});

// التذاكر
app.get('/api/tickets', async (req, res) => {
    const tickets = await db.all('SELECT * FROM tickets ORDER BY created_at DESC');
    res.json(tickets);
});

app.post('/api/tickets', async (req, res) => {
    const { subject, message, username } = req.body;
    const now = new Date();
    await db.run(
        `INSERT INTO tickets (id, date, time, username, subject, message, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), now.toLocaleDateString('ar-TN'), now.toLocaleTimeString('ar-TN'), username, subject, message, 'قيد المعالجة', now.toISOString()]
    );
    res.json({ success: true });
});

// تصدير البيانات
app.get('/api/export', async (req, res) => {
    const vessels = await db.all('SELECT * FROM vessels');
    res.json({ vessels });
});

// استيراد البيانات
app.post('/api/import', async (req, res) => {
    const { vessels } = req.body;
    if (vessels && Array.isArray(vessels)) {
        for (const v of vessels) {
            await db.run(
                `INSERT OR REPLACE INTO vessels (id, name, number, length, category, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [v.id || uuidv4(), v.name, v.number, v.length, v.category, v.region, v.zone, v.port, v.support_location, v.status, v.breakdown_type, v.breakdown_date, v.end_date, v.reference, v.created_at || new Date().toISOString()]
            );
        }
    }
    res.json({ success: true });
});

// إحصائيات
app.get('/api/stats', async (req, res) => {
    const total = await db.get('SELECT COUNT(*) as c FROM vessels');
    const good = await db.get('SELECT COUNT(*) as c FROM vessels WHERE status = "صالح"');
    res.json({ total: total.c, good: good.c });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// ==================== تشغيل السيرفر ====================
async function start() {
    await initDB();
    app.listen(PORT, () => {
        console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
        console.log(`║     🚀 السيرفر يعمل على http://localhost:${PORT}                  ║`);
        console.log(`╠══════════════════════════════════════════════════════════════╣`);
        console.log(`║  🔑 admin / admin123                                         ║`);
        console.log(`╚══════════════════════════════════════════════════════════════╝\n`);
    });
}

start();
