const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const db = new sqlite3.Database('./database.sqlite');

// إنشاء الجداول مع كل الأعمدة المطلوبة
db.serialize(() => {
    // حذف الجدول القديم وإعادة إنشائه
    db.run("DROP TABLE IF EXISTS vessels");
    console.log("✅ تم حذف الجدول القديم");
    
    // جدول المستخدمين
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT,
        enabled INTEGER DEFAULT 1
    )`);
    
    // جدول المراكب - مع كل الأعمدة
    db.run(`CREATE TABLE vessels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        number TEXT,
        length REAL,
        region TEXT,
        zone TEXT,
        port TEXT,
        support_location TEXT,
        status TEXT,
        breakdown_type TEXT,
        breakdown_date TEXT,
        end_date TEXT,
        reference TEXT,
        category TEXT
    )`);
    console.log("✅ تم إنشاء جدول المراكب بالأعمدة الصحيحة");
    
    // إضافة المستخدمين الافتراضيين
    db.get("SELECT * FROM users WHERE username = 'admin'", async (err, row) => {
        if (!row) {
            const hash = await bcrypt.hash('1234', 10);
            db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", ['admin', hash, 'مسؤول']);
            db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", ['editor', hash, 'محرر']);
            db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", ['viewer', hash, 'مشاهد']);
            console.log('✅ تم إنشاء المستخدمين');
        }
    });
    
    // إضافة بيانات تجريبية
    db.get("SELECT * FROM vessels LIMIT 1", (err, row) => {
        if (!row) {
            db.run(`INSERT INTO vessels (name, number, length, region, zone, port, status, category) VALUES 
                ('البروق 1', 'B001', 11, 'الشمال', 'تونس', 'تونس', 'صالح', 'البروق')`);
            db.run(`INSERT INTO vessels (name, number, length, region, zone, port, status, breakdown_type, breakdown_date, end_date, category) VALUES 
                ('خافرة 1', 'K001', 20, 'الوسط', 'صفاقس', 'صفاقس', 'معطب', 'عطل محرك', '2024-03-01', '2024-04-01', 'خوافر')`);
            db.run(`INSERT INTO vessels (name, number, length, region, zone, port, status, breakdown_type, breakdown_date, end_date, category) VALUES 
                ('زورق 1', 'Z001', 15, 'الجنوب', 'جربة', 'جربة', 'صيانة', 'صيانة كهرباء', '2024-02-15', '2024-03-15', 'زوارق مزدوجة')`);
            console.log('✅ تم إضافة مراكب تجريبية');
        }
    });
});

// API Routes
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
        if (!user) return res.status(401).json({ error: 'خطأ في البيانات' });
        const valid = await bcrypt.compare(password, user.password);
        if (!valid || !user.enabled) return res.status(401).json({ error: 'خطأ في البيانات' });
        res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
    });
});

app.get('/api/vessels', (req, res) => {
    db.all("SELECT * FROM vessels ORDER BY id DESC", (err, vessels) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(vessels || []);
        }
    });
});

app.post('/api/vessels', (req, res) => {
    const { name, number, length, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference, category } = req.body;
    
    db.run(`INSERT INTO vessels (name, number, length, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference, category) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, number, length, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference, category],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true, id: this.lastID });
            }
        });
});

app.delete('/api/vessels/:id', (req, res) => {
    db.run("DELETE FROM vessels WHERE id = ?", [req.params.id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

app.get('/api/users', (req, res) => {
    db.all("SELECT id, username, role, enabled FROM users", (err, users) => {
        res.json(users || []);
    });
});

app.post('/api/users', async (req, res) => {
    const { username, password, role } = req.body;
    const hash = await bcrypt.hash(password, 10);
    db.run("INSERT INTO users (username, password, role, enabled) VALUES (?, ?, ?, ?)",
        [username, hash, role, 1],
        function(err) {
            if (err) res.status(500).json({ error: err.message });
            else res.json({ success: true, id: this.lastID });
        });
});

app.put('/api/users/:id/password', async (req, res) => {
    const { password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    db.run("UPDATE users SET password = ? WHERE id = ?", [hash, req.params.id], function(err) {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ success: true });
    });
});

app.put('/api/users/:id/toggle', (req, res) => {
    const { enabled } = req.body;
    db.run("UPDATE users SET enabled = ? WHERE id = ?", [enabled ? 1 : 0, req.params.id], function(err) {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ success: true });
    });
});

app.delete('/api/users/:id', (req, res) => {
    db.run("DELETE FROM users WHERE id = ?", [req.params.id], function(err) {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ success: true });
    });
});

app.get('/api/logs', (req, res) => {
    db.all("SELECT * FROM logs ORDER BY created_at DESC LIMIT 500", (err, logs) => {
        res.json(logs || []);
    });
});

app.get('/api/tickets', (req, res) => {
    db.all("SELECT * FROM tickets ORDER BY created_at DESC LIMIT 50", (err, tickets) => {
        res.json(tickets || []);
    });
});

app.post('/api/tickets', (req, res) => {
    const { subject, message } = req.body;
    const date = new Date().toLocaleDateString('fr-FR');
    db.run(`INSERT INTO tickets (subject, message, date) VALUES (?, ?, ?)`,
        [subject, message, date],
        function(err) {
            if (err) res.status(500).json({ error: err.message });
            else res.json({ success: true, id: this.lastID });
        });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ═══════════════════════════════════════
    🌊 منظومة الوسائل البحرية - الخادم يعمل!
    📍 http://localhost:${PORT}
    👤 admin / 1234
    ═══════════════════════════════════════
    `);
});