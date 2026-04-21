const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

// ==================== Middleware ====================
app.use(compression());
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'تم تجاوز حد الطلبات، يرجى المحاولة لاحقاً' }
});
app.use('/api/', limiter);

// ==================== Database Setup ====================
const db = new sqlite3.Database('./marine_fleet.db');

// دالة مساعدة للحصول على الفئة بناءً على الطول
function getCategoryFromLength(len) {
    const n = parseFloat(len);
    if (isNaN(n)) return "زوارق مزدوجة";
    if (n === 11) return "البروق";
    if (n >= 8 && n <= 12) return "صقور";
    if (n > 12 && n <= 25) return "خوافر";
    if (n >= 30) return "طوافات";
    return "زوارق مزدوجة";
}

// إنشاء الجداول
db.serialize(() => {
    // 1. جدول المستخدمين
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'مشاهد',
            enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
        )
    `);

    // 2. جدول المراكب
    db.run(`
        CREATE TABLE IF NOT EXISTS vessels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            number TEXT,
            length REAL,
            category TEXT,
            region TEXT,
            zone TEXT,
            port TEXT,
            support_location TEXT,
            status TEXT DEFAULT 'صالح',
            breakdown_type TEXT,
            breakdown_date TEXT,
            end_date TEXT,
            reference TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 3. جدول سجل النشاطات
    db.run(`
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            user_role TEXT,
            action TEXT,
            details TEXT,
            ip_address TEXT,
            user_agent TEXT,
            date TEXT,
            time TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 4. جدول التذاكر
    db.run(`
        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            subject TEXT,
            message TEXT,
            status TEXT DEFAULT 'قيد المعالجة',
            priority TEXT DEFAULT 'متوسطة',
            response TEXT,
            date TEXT,
            time TEXT,
            resolved_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // إدخال المستخدم الافتراضي
    const defaultPassword = bcrypt.hashSync('admin123', 10);
    db.run(`
        INSERT OR IGNORE INTO users (username, password, role, enabled)
        VALUES ('admin', ?, 'مسؤول', 1)
    `, [defaultPassword]);

    // إدخال مستخدم تجريبي إضافي
    const officerPassword = bcrypt.hashSync('officer123', 10);
    db.run(`
        INSERT OR IGNORE INTO users (username, password, role, enabled)
        VALUES ('officer', ?, 'محرر', 1)
    `, [officerPassword]);

    // إدخال بيانات تجريبية إذا كان جدول المراكب فارغاً
    db.get('SELECT COUNT(*) as count FROM vessels', (err, row) => {
        if (!err && row && row.count === 0) {
            const demoVessels = [
                ['المركب الحربي 101', 'H101', 11, 'الشمال', 'تونس', 'حلق الوادي', 'قاعدة تونس البحرية', 'صالح', '', '', '', 'REF-MIL-001'],
                ['المركب الحربي 102', 'H102', 11, 'الشمال', 'بنزرت', 'بنزرت', 'قاعدة بنزرت البحرية', 'معطب', 'محرك رئيسي', '2024-01-15', '2024-04-15', 'REF-MIL-002'],
                ['الصقر السريع', 'S201', 10, 'الساحل', 'سوسة', 'سوسة', 'قاعدة سوسة البحرية', 'صالح', '', '', '', 'REF-FST-001'],
                ['الصقر البحري', 'S202', 9, 'الساحل', 'المنستير', 'المنستير', 'قاعدة المنستير', 'صيانة', 'نظام كهربائي', '2024-02-01', '2024-03-15', 'REF-FST-002'],
                ['الخوفرة 1', 'K301', 18, 'الوسط', 'صفاقس', 'صفاقس', 'قاعدة صفاقس', 'صالح', '', '', '', 'REF-KHW-001'],
                ['الخوفرة 2', 'K302', 20, 'الوسط', 'المهدية', 'المهدية', 'قاعدة المهدية', 'معطب', 'هيكل', '2024-01-20', '2024-05-20', 'REF-KHW-002'],
                ['الطوافة الكبرى', 'T401', 35, 'الجنوب', 'جربة', 'جربة', 'قاعدة جربة', 'صالح', '', '', '', 'REF-TWF-001'],
                ['الزورق المزدوج', 'Z501', 7, 'الجنوب', 'جرجيس', 'جرجيس', 'قاعدة جرجيس', 'صالح', '', '', '', 'REF-ZWR-001'],
                ['نجم البحر', 'N601', 15, 'الوسط', 'قابس', 'قابس', 'قاعدة قابس', 'صالح', '', '', '', 'REF-NAJ-001'],
                ['سيف البحر', 'S702', 22, 'الجنوب', 'قابس', 'قابس', 'قاعدة قابس', 'صيانة', 'محركات', '2024-02-10', '2024-03-20', 'REF-SEF-001']
            ];

            const stmt = db.prepare(`
                INSERT INTO vessels (
                    name, number, length, category, region, zone, port, 
                    support_location, status, breakdown_type, breakdown_date, end_date, reference
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            demoVessels.forEach(v => {
                const category = getCategoryFromLength(v[2]);
                stmt.run([
                    v[0], v[1], v[2], category, v[3], v[4], v[5], 
                    v[6], v[7], v[8], v[9], v[10], v[11]
                ], (err) => {
                    if (err) console.error('خطأ في إدخال بيانات تجريبية:', err.message);
                });
            });
            
            stmt.finalize();
            console.log('✅ تم إدخال 10 مراكب تجريبية');
        }
    });
});

// ==================== Helper Functions ====================
function getCurrentDateTime() {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    return { date, time };
}

function logAction(username, user_role, action, details, req) {
    const { date, time } = getCurrentDateTime();
    const ip_address = req.ip || req.connection?.remoteAddress || 'unknown';
    const user_agent = req.headers['user-agent'] || 'unknown';
    db.run(`
        INSERT INTO logs (username, user_role, action, details, ip_address, user_agent, date, time) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [username, user_role, action, details, ip_address, user_agent, date, time], (err) => {
        if (err) console.error('خطأ في تسجيل النشاط:', err.message);
    });
}

// ==================== API Routes ====================

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبة' });
    }
    db.get('SELECT * FROM users WHERE username = ? AND enabled = 1', [username], (err, user) => {
        if (err) {
            console.error('خطأ في قاعدة البيانات:', err.message);
            return res.status(500).json({ error: 'خطأ في الخادم' });
        }
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        }
        
        // تحديث آخر تسجيل دخول
        db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
        
        logAction(user.username, user.role, 'تسجيل دخول', 'قام بتسجيل الدخول إلى النظام', req);
        res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
    });
});

// Vessels CRUD
app.get('/api/vessels', (req, res) => {
    db.all('SELECT * FROM vessels ORDER BY id DESC', [], (err, rows) => {
        if (err) {
            console.error('خطأ في جلب المراكب:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

app.post('/api/vessels', (req, res) => {
    const vessel = req.body;
    const category = getCategoryFromLength(vessel.length);
    
    const sql = `
        INSERT INTO vessels (
            name, number, length, category, region, zone, port, 
            support_location, status, breakdown_type, breakdown_date, end_date, reference
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.run(sql, [
        vessel.name, vessel.number, vessel.length, category, vessel.region, 
        vessel.zone, vessel.port, vessel.support_location, vessel.status, 
        vessel.breakdown_type || '', vessel.breakdown_date || '', vessel.end_date || '', vessel.reference || ''
    ], function(err) {
        if (err) {
            console.error('خطأ في إضافة مركب:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, id: this.lastID });
    });
});

app.put('/api/vessels/:id', (req, res) => {
    const vessel = req.body;
    const category = getCategoryFromLength(vessel.length);
    
    const sql = `
        UPDATE vessels SET 
            name=?, number=?, length=?, category=?, region=?, zone=?, port=?, 
            support_location=?, status=?, breakdown_type=?, breakdown_date=?, 
            end_date=?, reference=?, updated_at=CURRENT_TIMESTAMP 
        WHERE id=?
    `;
    
    db.run(sql, [
        vessel.name, vessel.number, vessel.length, category, vessel.region, 
        vessel.zone, vessel.port, vessel.support_location, vessel.status, 
        vessel.breakdown_type || '', vessel.breakdown_date || '', vessel.end_date || '', vessel.reference || '', 
        req.params.id
    ], function(err) {
        if (err) {
            console.error('خطأ في تحديث مركب:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

app.delete('/api/vessels/:id', (req, res) => {
    db.run('DELETE FROM vessels WHERE id = ?', [req.params.id], function(err) {
        if (err) {
            console.error('خطأ في حذف مركب:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

// Users management
app.get('/api/users', (req, res) => {
    db.all('SELECT id, username, role, enabled, created_at, last_login FROM users', [], (err, rows) => {
        if (err) {
            console.error('خطأ في جلب المستخدمين:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

app.post('/api/users', (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبة' });
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.run(`INSERT INTO users (username, password, role, enabled) VALUES (?, ?, ?, 1)`, 
        [username, hashedPassword, role || 'مشاهد'], 
        function(err) {
            if (err) {
                const errorMsg = err.message.includes('UNIQUE') ? 'اسم المستخدم موجود بالفعل' : err.message;
                return res.status(500).json({ error: errorMsg });
            }
            res.json({ success: true, id: this.lastID });
        });
});

app.put('/api/users/:id/password', (req, res) => {
    const { password } = req.body;
    if (!password) {
        return res.status(400).json({ error: 'كلمة المرور مطلوبة' });
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.run(`UPDATE users SET password = ? WHERE id = ?`, [hashedPassword, req.params.id], function(err) {
        if (err) {
            console.error('خطأ في تحديث كلمة المرور:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

app.put('/api/users/:id/toggle', (req, res) => {
    const { enabled } = req.body;
    db.run(`UPDATE users SET enabled = ? WHERE id = ?`, [enabled ? 1 : 0, req.params.id], function(err) {
        if (err) {
            console.error('خطأ في تبديل حالة المستخدم:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

app.delete('/api/users/:id', (req, res) => {
    db.run(`DELETE FROM users WHERE id = ? AND username != 'admin'`, [req.params.id], function(err) {
        if (err) {
            console.error('خطأ في حذف مستخدم:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

// Logs
app.get('/api/logs', (req, res) => {
    db.all('SELECT * FROM logs ORDER BY created_at DESC LIMIT 500', [], (err, rows) => {
        if (err) {
            console.error('خطأ في جلب السجلات:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

// Tickets
app.get('/api/tickets', (req, res) => {
    db.all('SELECT * FROM tickets ORDER BY created_at DESC', [], (err, rows) => {
        if (err) {
            console.error('خطأ في جلب التذاكر:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

app.post('/api/tickets', (req, res) => {
    const { username, subject, message } = req.body;
    const { date, time } = getCurrentDateTime();
    db.run(`
        INSERT INTO tickets (username, subject, message, status, date, time) 
        VALUES (?, ?, ?, 'قيد المعالجة', ?, ?)
    `, [username, subject, message, date, time], function(err) {
        if (err) {
            console.error('خطأ في إضافة تذكرة:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, id: this.lastID });
    });
});

// Export
app.get('/api/export', (req, res) => {
    db.all('SELECT * FROM vessels', [], (err, vessels) => {
        if (err) {
            console.error('خطأ في تصدير البيانات:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ 
            vessels: vessels || [], 
            exportDate: new Date().toISOString(),
            version: '1.0.0'
        });
    });
});

// Import
app.post('/api/import', (req, res) => {
    const { vessels } = req.body;
    if (!vessels || !Array.isArray(vessels)) {
        return res.status(400).json({ error: 'بيانات غير صالحة' });
    }
    
    db.run('DELETE FROM vessels', [], (err) => {
        if (err) {
            console.error('خطأ في مسح الجدول:', err.message);
            return res.status(500).json({ error: err.message });
        }
        
        const stmt = db.prepare(`
            INSERT INTO vessels (
                name, number, length, category, region, zone, port, 
                support_location, status, breakdown_type, breakdown_date, end_date, reference
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        vessels.forEach(v => {
            const category = getCategoryFromLength(v.length);
            stmt.run([
                v.name, v.number, v.length, category, v.region, v.zone, v.port,
                v.support_location, v.status, v.breakdown_type || '', v.breakdown_date || '', 
                v.end_date || '', v.reference || ''
            ]);
        });
        
        stmt.finalize((err) => {
            if (err) {
                console.error('خطأ في استيراد البيانات:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, importedCount: vessels.length });
        });
    });
});

// Statistics endpoint
app.get('/api/statistics', (req, res) => {
    db.get('SELECT COUNT(*) as total FROM vessels', [], (err, total) => {
        if (err) return res.status(500).json({ error: err.message });
        db.get("SELECT COUNT(*) as active FROM vessels WHERE status = 'صالح'", [], (err, active) => {
            if (err) return res.status(500).json({ error: err.message });
            db.get("SELECT COUNT(*) as maintenance FROM vessels WHERE status = 'صيانة'", [], (err, maintenance) => {
                if (err) return res.status(500).json({ error: err.message });
                db.get("SELECT COUNT(*) as broken FROM vessels WHERE status = 'معطب'", [], (err, broken) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({
                        total: total.total,
                        active: active.active,
                        maintenance: maintenance.maintenance,
                        broken: broken.broken,
                        efficiency: total.total > 0 ? ((active.active / total.total) * 100).toFixed(1) : 0
                    });
                });
            });
        });
    });
});

// Serve HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== Start Server ====================
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚢 نظام إدارة الأسطول البحري يعمل على المنفذ ${PORT}`);
    console.log(`📱 افتح http://localhost:${PORT}`);
    console.log(`\n🔐 بيانات الدخول الافتراضية:`);
    console.log(`   admin / admin123 (مسؤول كامل)`);
    console.log(`   officer / officer123 (محرر)\n`);
});

// معالجة إغلاق الخادم بشكل آمن
process.on('SIGTERM', () => {
    console.log('🛑 استلام إشارة الإغلاق...');
    server.close(() => {
        console.log('✅ تم إغلاق الخادم');
        db.close(() => {
            console.log('🔒 تم إغلاق قاعدة البيانات');
            process.exit(0);
        });
    });
});

process.on('SIGINT', () => {
    console.log('\n🛑 إيقاف الخادم...');
    server.close(() => {
        db.close(() => {
            console.log('👋 وداعاً!');
            process.exit(0);
        });
    });
});
