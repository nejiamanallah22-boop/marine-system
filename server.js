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

// ==================== إنشاء الجداول ====================
db.serialize(() => {
    // حذف الجدول القديم وإعادة إنشائه (للتأكد من وجود كل الأعمدة)
    db.run("DROP TABLE IF EXISTS vessels");
    console.log("✅ تم حذف الجدول القديم");
    
    // جدول المستخدمين
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log("✅ تم إنشاء جدول المستخدمين");
    
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
        category TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log("✅ تم إنشاء جدول المراكب");
    
    // جدول سجل النشاطات (Logs) - مهم لتتبع المستخدمين
    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        role TEXT,
        action TEXT,
        details TEXT,
        date TEXT,
        time TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log("✅ تم إنشاء جدول سجل النشاطات");
    
    // جدول تذاكر الدعم
    db.run(`CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        subject TEXT,
        message TEXT,
        status TEXT DEFAULT 'قيد المعالجة',
        date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log("✅ تم إنشاء جدول التذاكر");
    
    // ==================== إضافة المستخدمين الافتراضيين ====================
    db.get("SELECT * FROM users WHERE username = 'admin'", async (err, row) => {
        if (!row) {
            const hash = await bcrypt.hash('1234', 10);
            db.run("INSERT INTO users (username, password, role, enabled) VALUES (?, ?, ?, ?)", 
                ['admin', hash, 'مسؤول', 1]);
            db.run("INSERT INTO users (username, password, role, enabled) VALUES (?, ?, ?, ?)", 
                ['editor', hash, 'محرر', 1]);
            db.run("INSERT INTO users (username, password, role, enabled) VALUES (?, ?, ?, ?)", 
                ['viewer', hash, 'مشاهد', 1]);
            console.log('✅ تم إنشاء المستخدمين (admin, editor, viewer)');
        }
    });
    
    // ==================== إضافة بيانات تجريبية ====================
    db.get("SELECT * FROM vessels LIMIT 1", (err, row) => {
        if (!row) {
            db.run(`INSERT INTO vessels (name, number, length, region, zone, port, status, category) VALUES 
                ('البروق 1', 'B001', 11, 'الشمال', 'تونس', 'تونس', 'صالح', 'البروق')`);
            db.run(`INSERT INTO vessels (name, number, length, region, zone, port, status, category) VALUES 
                ('صقر 1', 'S001', 10, 'الساحل', 'سوسة', 'سوسة', 'صالح', 'صقور')`);
            db.run(`INSERT INTO vessels (name, number, length, region, zone, port, status, breakdown_type, breakdown_date, end_date, category) VALUES 
                ('خافرة 1', 'K001', 20, 'الوسط', 'صفاقس', 'صفاقس', 'معطب', 'عطل محرك', '2024-03-01', '2024-04-01', 'خوافر')`);
            db.run(`INSERT INTO vessels (name, number, length, region, zone, port, status, breakdown_type, breakdown_date, end_date, category) VALUES 
                ('زورق 1', 'Z001', 15, 'الجنوب', 'جربة', 'جربة', 'صيانة', 'صيانة كهرباء', '2024-02-15', '2024-03-15', 'زوارق مزدوجة')`);
            db.run(`INSERT INTO vessels (name, number, length, region, zone, port, status, category) VALUES 
                ('طوافة 1', 'T001', 35, 'الشمال', 'بنزرت', 'بنزرت', 'صالح', 'طوافات')`);
            console.log('✅ تم إضافة مراكب تجريبية');
        }
    });
});

// ==================== دوال مساعدة ====================
function getCurrentDate() {
    const now = new Date();
    return {
        date: `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}`,
        time: `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`
    };
}

function logActivity(userId, username, role, action, details) {
    const { date, time } = getCurrentDate();
    db.run(`INSERT INTO logs (user_id, username, role, action, details, date, time) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, username, role, action, details, date, time],
        (err) => {
            if (err) console.error("خطأ في تسجيل النشاط:", err.message);
        });
}

// ==================== API Routes ====================

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'خطأ في البيانات' });
        }
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid || !user.enabled) {
            return res.status(401).json({ error: 'خطأ في البيانات' });
        }
        
        // تسجيل نشاط تسجيل الدخول
        logActivity(user.id, user.username, user.role, 'تسجيل دخول', 'قام بتسجيل الدخول إلى النظام');
        
        res.json({ 
            success: true, 
            user: { id: user.id, username: user.username, role: user.role } 
        });
    });
});

// جلب جميع المراكب
app.get('/api/vessels', (req, res) => {
    db.all("SELECT * FROM vessels ORDER BY id DESC", (err, vessels) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(vessels || []);
        }
    });
});

// إضافة مركب جديد
app.post('/api/vessels', (req, res) => {
    const { name, number, length, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference, category } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'اسم المركب مطلوب' });
    }
    
    db.run(`INSERT INTO vessels (name, number, length, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference, category) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, number || '', length || 0, region || '', zone || '', port || '', support_location || '', status || 'صالح', breakdown_type || '', breakdown_date || '', end_date || '', reference || '', category || ''],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                // تسجيل النشاط (سنضيف user_id لاحقاً من التوكن)
                res.json({ success: true, id: this.lastID, message: 'تمت الإضافة بنجاح' });
            }
        });
});

// حذف مركب
app.delete('/api/vessels/:id', (req, res) => {
    const id = req.params.id;
    
    db.run("DELETE FROM vessels WHERE id = ?", [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true, message: 'تم الحذف بنجاح' });
        }
    });
});

// ==================== إدارة المستخدمين ====================

// جلب جميع المستخدمين
app.get('/api/users', (req, res) => {
    db.all("SELECT id, username, role, enabled, created_at FROM users", (err, users) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(users || []);
        }
    });
});

// إضافة مستخدم جديد
app.post('/api/users', async (req, res) => {
    const { username, password, role } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
    }
    
    // التحقق من عدم وجود المستخدم
    db.get("SELECT id FROM users WHERE username = ?", [username], async (err, existing) => {
        if (existing) {
            return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
        }
        
        const hash = await bcrypt.hash(password, 10);
        db.run("INSERT INTO users (username, password, role, enabled) VALUES (?, ?, ?, ?)",
            [username, hash, role || 'مشاهد', 1],
            function(err) {
                if (err) {
                    res.status(500).json({ error: err.message });
                } else {
                    res.json({ success: true, id: this.lastID, message: 'تمت إضافة المستخدم' });
                }
            });
    });
});

// تغيير كلمة مرور المستخدم
app.put('/api/users/:id/password', async (req, res) => {
    const { password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    
    db.run("UPDATE users SET password = ? WHERE id = ?", [hash, req.params.id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true, message: 'تم تغيير كلمة المرور' });
        }
    });
});

// تفعيل/تعطيل مستخدم
app.put('/api/users/:id/toggle', (req, res) => {
    const { enabled } = req.body;
    const newStatus = enabled ? 1 : 0;
    
    db.run("UPDATE users SET enabled = ? WHERE id = ?", [newStatus, req.params.id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true, message: enabled ? 'تم تفعيل المستخدم' : 'تم تعطيل المستخدم' });
        }
    });
});

// حذف مستخدم
app.delete('/api/users/:id', (req, res) => {
    db.run("DELETE FROM users WHERE id = ?", [req.params.id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true, message: 'تم حذف المستخدم' });
        }
    });
});

// ==================== سجل النشاطات (تتبع المستخدمين) ====================
app.get('/api/logs', (req, res) => {
    db.all("SELECT * FROM logs ORDER BY created_at DESC LIMIT 500", (err, logs) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(logs || []);
        }
    });
});

// ==================== تذاكر الدعم ====================
app.get('/api/tickets', (req, res) => {
    db.all("SELECT * FROM tickets ORDER BY created_at DESC LIMIT 50", (err, tickets) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(tickets || []);
        }
    });
});

app.post('/api/tickets', (req, res) => {
    const { subject, message } = req.body;
    const { date } = getCurrentDate();
    
    if (!subject || !message) {
        return res.status(400).json({ error: 'العنوان والرسالة مطلوبان' });
    }
    
    db.run(`INSERT INTO tickets (subject, message, date, status) VALUES (?, ?, ?, ?)`,
        [subject, message, date, 'قيد المعالجة'],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true, id: this.lastID, message: 'تم إرسال التذكرة' });
            }
        });
});

// ==================== إحصائيات سريعة ====================
app.get('/api/stats', (req, res) => {
    db.all("SELECT * FROM vessels", (err, vessels) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            const total = vessels.length;
            const salih = vessels.filter(v => v.status === 'صالح').length;
            const mo3atab = vessels.filter(v => v.status === 'معطب').length;
            const siyana = vessels.filter(v => v.status === 'صيانة').length;
            const efficiency = total > 0 ? ((salih / total) * 100).toFixed(1) : 0;
            
            res.json({ total, salih, mo3atab, siyana, efficiency });
        }
    });
});

// ==================== تشغيل الخادم ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ═══════════════════════════════════════════════════
    🌊 منظومة الوسائل البحرية - الخادم يعمل بنجاح!
    📍 http://localhost:${PORT}
    ───────────────────────────────────────────────────
    👤 حسابات الدخول:
       مسؤول: admin / 1234
       محرر: editor / 1234
       مشاهد: viewer / 1234
    ═══════════════════════════════════════════════════
    `);
});