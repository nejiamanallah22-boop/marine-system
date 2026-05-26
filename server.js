const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

let db;

// ==================== دوال مساعدة ====================
function getCurrentDate() {
    const now = new Date();
    return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
}

function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

// ==================== تهيئة قاعدة البيانات ====================
async function initDatabase() {
    db = await open({
        filename: './marine.db',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS vessels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            num TEXT,
            len REAL,
            reg TEXT,
            zone TEXT,
            port TEXT,
            supp TEXT,
            stat TEXT DEFAULT 'صالح',
            break TEXT,
            fDate TEXT,
            eDate TEXT,
            ref TEXT,
            cat TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            pass TEXT NOT NULL,
            role TEXT DEFAULT 'مشاهد',
            enabled INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userName TEXT,
            userRole TEXT,
            subject TEXT,
            message TEXT,
            date TEXT,
            time TEXT,
            status TEXT DEFAULT 'قيد المعالجة',
            replies TEXT DEFAULT '[]',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userName TEXT,
            userRole TEXT,
            action TEXT,
            details TEXT,
            date TEXT,
            time TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // إنشاء مستخدمين افتراضيين
    const adminExists = await db.get('SELECT * FROM users WHERE name = ?', ['admin']);
    if (!adminExists) {
        const hashedPass = bcrypt.hashSync('admin123', 10);
        await db.run('INSERT INTO users (name, pass, role, enabled) VALUES (?, ?, ?, ?)',
                     ['admin', hashedPass, 'مسؤول', 1]);
        console.log('✅ تم إنشاء المستخدم الافتراضي: admin / admin123');
    }

    const editorExists = await db.get('SELECT * FROM users WHERE name = ?', ['editor']);
    if (!editorExists) {
        const hashedPass = bcrypt.hashSync('editor123', 10);
        await db.run('INSERT INTO users (name, pass, role, enabled) VALUES (?, ?, ?, ?)',
                     ['editor', hashedPass, 'محرر', 1]);
        console.log('✅ تم إنشاء المستخدم: editor / editor123');
    }

    const viewerExists = await db.get('SELECT * FROM users WHERE name = ?', ['viewer']);
    if (!viewerExists) {
        const hashedPass = bcrypt.hashSync('viewer123', 10);
        await db.run('INSERT INTO users (name, pass, role, enabled) VALUES (?, ?, ?, ?)',
                     ['viewer', hashedPass, 'مشاهد', 1]);
        console.log('✅ تم إنشاء المستخدم: viewer / viewer123');
    }

    console.log('✅ قاعدة بيانات SQLite جاهزة');
}

// ==================== API - المراكب ====================
app.get('/api/vessels', async (req, res) => {
    try {
        const vessels = await db.all('SELECT * FROM vessels ORDER BY createdAt DESC');
        res.json(vessels);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/vessels', async (req, res) => {
    try {
        const { name, num, len, reg, zone, port, supp, stat, break: brk, fDate, eDate, ref, cat } = req.body;
        const result = await db.run(
            `INSERT INTO vessels (name, num, len, reg, zone, port, supp, stat, break, fDate, eDate, ref, cat)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, num, len, reg, zone, port, supp, stat, brk, fDate, eDate, ref, cat]
        );
        const newVessel = await db.get('SELECT * FROM vessels WHERE id = ?', [result.lastID]);
        res.json(newVessel);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/vessels/:id', async (req, res) => {
    try {
        const { name, num, len, reg, zone, port, supp, stat, break: brk, fDate, eDate, ref, cat } = req.body;
        await db.run(
            `UPDATE vessels SET name=?, num=?, len=?, reg=?, zone=?, port=?, supp=?, stat=?, break=?, fDate=?, eDate=?, ref=?, cat=?
             WHERE id=?`,
            [name, num, len, reg, zone, port, supp, stat, brk, fDate, eDate, ref, cat, req.params.id]
        );
        const updated = await db.get('SELECT * FROM vessels WHERE id = ?', [req.params.id]);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/vessels/:id', async (req, res) => {
    try {
        await db.run('DELETE FROM vessels WHERE id = ?', [req.params.id]);
        res.json({ message: 'deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== API - المستخدمين ====================
app.get('/api/users', async (req, res) => {
    try {
        const users = await db.all('SELECT id, name, role, enabled FROM users');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const { name, pass, role, enabled } = req.body;
        const hashedPass = bcrypt.hashSync(pass, 10);
        const result = await db.run(
            'INSERT INTO users (name, pass, role, enabled) VALUES (?, ?, ?, ?)',
            [name, hashedPass, role, enabled ? 1 : 0]
        );
        res.json({ id: result.lastID, name, role, enabled });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const { name, pass, role, enabled } = req.body;
        if (pass) {
            const hashedPass = bcrypt.hashSync(pass, 10);
            await db.run('UPDATE users SET name=?, pass=?, role=?, enabled=? WHERE id=?',
                         [name, hashedPass, role, enabled ? 1 : 0, req.params.id]);
        } else {
            await db.run('UPDATE users SET name=?, role=?, enabled=? WHERE id=?',
                         [name, role, enabled ? 1 : 0, req.params.id]);
        }
        const updated = await db.get('SELECT id, name, role, enabled FROM users WHERE id = ?', [req.params.id]);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ message: 'deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== API - تسجيل الدخول ====================
app.post('/api/login', async (req, res) => {
    try {
        const { name, pass } = req.body;
        const user = await db.get('SELECT * FROM users WHERE name = ?', [name]);
        
        if (!user) return res.json({ error: 'اسم المستخدم غير موجود' });
        if (!user.enabled) return res.json({ error: 'هذا الحساب معطل' });
        
        const isValid = bcrypt.compareSync(pass, user.pass);
        if (!isValid) return res.json({ error: 'كلمة المرور غير صحيحة' });
        
        res.json({ id: user.id, name: user.name, role: user.role, enabled: user.enabled });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== API - التذاكر ====================
app.get('/api/tickets', async (req, res) => {
    try {
        const tickets = await db.all('SELECT * FROM tickets ORDER BY createdAt DESC');
        tickets.forEach(t => { t.replies = t.replies ? JSON.parse(t.replies) : []; });
        res.json(tickets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tickets', async (req, res) => {
    try {
        const { userName, userRole, subject, message, date, time, status, replies } = req.body;
        const result = await db.run(
            `INSERT INTO tickets (userName, userRole, subject, message, date, time, status, replies)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userName, userRole, subject, message, date, time, status, JSON.stringify(replies || [])]
        );
        const newTicket = await db.get('SELECT * FROM tickets WHERE id = ?', [result.lastID]);
        newTicket.replies = JSON.parse(newTicket.replies);
        res.json(newTicket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tickets/:id/reply', async (req, res) => {
    try {
        const ticket = await db.get('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
        if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
        
        const replies = JSON.parse(ticket.replies || '[]');
        replies.push(req.body.reply);
        
        await db.run('UPDATE tickets SET replies = ?, status = ? WHERE id = ?',
                     [JSON.stringify(replies), 'تم الرد', req.params.id]);
        
        const updated = await db.get('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
        updated.replies = JSON.parse(updated.replies);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tickets/:id/close', async (req, res) => {
    try {
        await db.run('UPDATE tickets SET status = ? WHERE id = ?', ['مغلقة', req.params.id]);
        const updated = await db.get('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
        updated.replies = JSON.parse(updated.replies || '[]');
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== API - سجل التتبع ====================
app.get('/api/logs', async (req, res) => {
    try {
        const logs = await db.all('SELECT * FROM logs ORDER BY createdAt DESC');
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/logs', async (req, res) => {
    try {
        const { userName, userRole, action, details, date, time } = req.body;
        const result = await db.run(
            `INSERT INTO logs (userName, userRole, action, details, date, time)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userName, userRole, action, details, date, time]
        );
        res.json({ id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== API - تصدير واستيراد ====================
app.get('/api/export-all', async (req, res) => {
    try {
        const vessels = await db.all('SELECT * FROM vessels');
        const users = await db.all('SELECT id, name, role, enabled FROM users');
        const tickets = await db.all('SELECT * FROM tickets');
        const logs = await db.all('SELECT * FROM logs');
        res.json({ vessels, users, tickets, logs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/import-all', async (req, res) => {
    try {
        const { vessels } = req.body;
        if (vessels && Array.isArray(vessels)) {
            await db.run('DELETE FROM vessels');
            for (const v of vessels) {
                await db.run(
                    `INSERT INTO vessels (name, num, len, reg, zone, port, supp, stat, break, fDate, eDate, ref, cat)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [v.name, v.num, v.len, v.reg, v.zone, v.port, v.supp, v.stat, v.break, v.fDate, v.eDate, v.ref, v.cat]
                );
            }
        }
        res.json({ message: 'تم الاستيراد بنجاح' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== تشغيل الخادم ====================
async function startServer() {
    await initDatabase();
    app.listen(PORT, () => {
        console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
    });
}

startServer();
