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

// تهيئة قاعدة بيانات SQLite
async function initDatabase() {
    db = await open({
        filename: './marine.db',
        driver: sqlite3.Database
    });

    // إنشاء الجداول
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

    // إنشاء مستخدم مسؤول افتراضي
    const adminExists = await db.get('SELECT * FROM users WHERE name = ?', ['admin']);
    if (!adminExists) {
        const hashedPass = bcrypt.hashSync('admin123', 10);
        await db.run('INSERT INTO users (name, pass, role, enabled) VALUES (?, ?, ?, ?)',
                     ['admin', hashedPass, 'مسؤول', 1]);
        console.log('✅ تم إنشاء المستخدم الافتراضي: admin / admin123');
    }
    console.log('✅ قاعدة بيانات SQLite جاهزة');
}

// ==================== API Routes (مختصرة كمثال) ====================
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

// يمكنك إضافة باقي Routes (PUT, DELETE, users, tickets, logs) بنفس النمط الموجود مسبقاً

app.listen(PORT, async () => {
    await initDatabase();
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
});
