const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'marine_super_secret_key_2024';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==================== قاعدة البيانات SQLite ====================
const db = new sqlite3.Database('./data/marine_system.db', (err) => {
    if (err) {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
    } else {
        console.log('✅ تم الاتصال بقاعدة بيانات SQLite بنجاح');
    }
});

// إنشاء الجداول
db.serialize(() => {
    // جدول المستخدمين
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'مشاهد',
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // جدول المراكب
    db.run(`CREATE TABLE IF NOT EXISTS vessels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        number TEXT,
        length REAL,
        region TEXT,
        zone TEXT,
        port TEXT,
        support_location TEXT,
        status TEXT DEFAULT 'صالح',
        breakdown_type TEXT,
        breakdown_date TEXT,
        end_date TEXT,
        reference TEXT,
        category TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // جدول سجل النشاطات
    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        username TEXT,
        user_role TEXT,
        action TEXT,
        details TEXT,
        date TEXT,
        time TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // جدول تذاكر الدعم
    db.run(`CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        username TEXT,
        subject TEXT,
        message TEXT,
        status TEXT DEFAULT 'قيد المعالجة',
        date TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // إنشاء الفهارس (Indexes) لتحسين الأداء
    db.run(`CREATE INDEX IF NOT EXISTS idx_vessels_region ON vessels(region)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_vessels_status ON vessels(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at)`);
    
    console.log('✅ تم إنشاء جميع الجداول والفهارس');
});

// ==================== دوال مساعدة ====================
function getCurrentDateTime() {
    const now = new Date();
    return {
        date: `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}`,
        time: `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`
    };
}

function getCategory(length) {
    const n = parseFloat(length);
    if (n === 11) return "البروق";
    if (n >= 8 && n <= 12) return "صقور";
    if (n > 12 && n <= 25) return "خوافر";
    if (n >= 30) return "طوافات";
    return "زوارق مزدوجة";
}

function logActivity(userId, username, userRole, action, details) {
    const { date, time } = getCurrentDateTime();
    const id = uuidv4();
    db.run(`INSERT INTO logs (id, user_id, username, user_role, action, details, date, time) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, userId || null, username, userRole, action, details, date, time]);
}

// ==================== Middleware ====================
function verifyToken(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) {
        return res.status(401).json({ error: 'غير مصرح به - يرجى تسجيل الدخول' });
    }
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'جلسة غير صالحة - يرجى إعادة تسجيل الدخول' });
    }
}

function verifyAdmin(req, res, next) {
    if (req.user.role !== 'مسؤول') {
        return res.status(403).json({ error: 'ليس لديك صلاحية - هذه الخاصية للمسؤول فقط' });
    }
    next();
}

// ==================== API Routes ====================

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
        
        if (!user.enabled) {
            return res.status(401).json({ error: 'هذا الحساب معطل' });
        }
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
        
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            SECRET_KEY,
            { expiresIn: '24h' }
        );
        
        logActivity(user.id, user.username, user.role, 'تسجيل دخول', 'قام بتسجيل الدخول');
        
        res.json({ 
            success: true, 
            token: token,
            user: { id: user.id, username: user.username, role: user.role } 
        });
    });
});

// ==================== المراكب ====================

// جلب جميع المراكب
app.get('/api/vessels', verifyToken, (req, res) => {
    db.all("SELECT * FROM vessels ORDER BY created_at DESC", [], (err, vessels) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(vessels || []);
        }
    });
});

// إضافة مركب جديد
app.post('/api/vessels', verifyToken, (req, res) => {
    const { name, number, length, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'اسم المركب مطلوب' });
    }
    
    const id = uuidv4();
    const category = getCategory(length);
    const now = new Date().toISOString();
    
    db.run(`INSERT INTO vessels (id, name, number, length, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference, category, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, number || '', length || 0, region || '', zone || '', port || '', support_location || '', status || 'صالح', breakdown_type || '', breakdown_date || '', end_date || '', reference || '', category, now, now],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                logActivity(req.user.id, req.user.username, req.user.role, 'إضافة مركب', `قام بإضافة مركب: ${name}`);
                res.json({ success: true, id: id, message: 'تمت الإضافة بنجاح' });
            }
        });
});

// تحديث مركب
app.put('/api/vessels/:id', verifyToken, (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    
    const fields = [];
    const values = [];
    
    Object.keys(updates).forEach(key => {
        if (key !== 'id' && key !== 'created_at') {
            fields.push(`${key} = ?`);
            values.push(updates[key]);
        }
    });
    fields.push(`updated_at = ?`);
    values.push(new Date().toISOString());
    values.push(id);
    
    if (fields.length === 0) {
        return res.status(400).json({ error: 'لا توجد بيانات للتحديث' });
    }
    
    db.run(`UPDATE vessels SET ${fields.join(', ')} WHERE id = ?`, values, function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else if (this.changes === 0) {
            res.status(404).json({ error: 'المركب غير موجود' });
        } else {
            logActivity(req.user.id, req.user.username, req.user.role, 'تعديل مركب', `قام بتعديل مركب ID: ${id}`);
            res.json({ success: true, message: 'تم التحديث بنجاح' });
        }
    });
});

// حذف مركب
app.delete('/api/vessels/:id', verifyToken, verifyAdmin, (req, res) => {
    const { id } = req.params;
    
    db.get("SELECT name FROM vessels WHERE id = ?", [id], (err, vessel) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        db.run("DELETE FROM vessels WHERE id = ?", [id], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else if (this.changes === 0) {
                res.status(404).json({ error: 'المركب غير موجود' });
            } else {
                logActivity(req.user.id, req.user.username, req.user.role, 'حذف مركب', `قام بحذف مركب: ${vessel?.name || 'غير معروف'}`);
                res.json({ success: true, message: 'تم الحذف بنجاح' });
            }
        });
    });
});

// ==================== المستخدمين ====================

// جلب جميع المستخدمين (للمسؤول فقط)
app.get('/api/users', verifyToken, verifyAdmin, (req, res) => {
    db.all("SELECT id, username, role, enabled, created_at FROM users ORDER BY created_at", [], (err, users) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(users || []);
        }
    });
});

// إضافة مستخدم جديد
app.post('/api/users', verifyToken, verifyAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
    }
    
    db.get("SELECT id FROM users WHERE username = ?", [username], async (err, existing) => {
        if (existing) {
            return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
        }
        
        const id = uuidv4();
        const hash = await bcrypt.hash(password, 10);
        db.run("INSERT INTO users (id, username, password, role, enabled) VALUES (?, ?, ?, ?, ?)",
            [id, username, hash, role || 'مشاهد', 1],
            function(err) {
                if (err) {
                    res.status(500).json({ error: err.message });
                } else {
                    logActivity(req.user.id, req.user.username, req.user.role, 'إضافة مستخدم', `قام بإضافة مستخدم: ${username}`);
                    res.json({ success: true, id: id, message: 'تمت إضافة المستخدم' });
                }
            });
    });
});

// تغيير كلمة مرور المستخدم
app.put('/api/users/:id/password', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    
    if (!password) {
        return res.status(400).json({ error: 'كلمة المرور الجديدة مطلوبة' });
    }
    
    // منع تغيير كلمة مرور admin إذا لم يكن admin الحالي هو admin
    db.get("SELECT username FROM users WHERE id = ?", [id], async (err, user) => {
        if (user && user.username === 'admin' && req.user.username !== 'admin') {
            return res.status(403).json({ error: 'لا يمكن تغيير كلمة مرور المدير الرئيسي' });
        }
        
        const hash = await bcrypt.hash(password, 10);
        db.run("UPDATE users SET password = ? WHERE id = ?", [hash, id], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else if (this.changes === 0) {
                res.status(404).json({ error: 'المستخدم غير موجود' });
            } else {
                logActivity(req.user.id, req.user.username, req.user.role, 'تغيير كلمة مرور', `قام بتغيير كلمة مرور المستخدم ID: ${id}`);
                res.json({ success: true, message: 'تم تغيير كلمة المرور' });
            }
        });
    });
});

// تفعيل/تعطيل مستخدم
app.put('/api/users/:id/toggle', verifyToken, verifyAdmin, (req, res) => {
    const { id } = req.params;
    const { enabled } = req.body;
    const newStatus = enabled ? 1 : 0;
    
    db.get("SELECT username FROM users WHERE id = ?", [id], (err, user) => {
        if (user && user.username === 'admin') {
            return res.status(403).json({ error: 'لا يمكن تعطيل المدير الرئيسي' });
        }
        
        db.run("UPDATE users SET enabled = ? WHERE id = ?", [newStatus, id], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else if (this.changes === 0) {
                res.status(404).json({ error: 'المستخدم غير موجود' });
            } else {
                logActivity(req.user.id, req.user.username, req.user.role, enabled ? 'تفعيل مستخدم' : 'تعطيل مستخدم', `قام ${enabled ? 'بتفعيل' : 'بتعطيل'} المستخدم ID: ${id}`);
                res.json({ success: true, message: enabled ? 'تم تفعيل المستخدم' : 'تم تعطيل المستخدم' });
            }
        });
    });
});

// حذف مستخدم
app.delete('/api/users/:id', verifyToken, verifyAdmin, (req, res) => {
    const { id } = req.params;
    
    db.get("SELECT username FROM users WHERE id = ?", [id], (err, user) => {
        if (user && user.username === 'admin') {
            return res.status(403).json({ error: 'لا يمكن حذف المدير الرئيسي' });
        }
        
        db.run("DELETE FROM users WHERE id = ?", [id], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else if (this.changes === 0) {
                res.status(404).json({ error: 'المستخدم غير موجود' });
            } else {
                logActivity(req.user.id, req.user.username, req.user.role, 'حذف مستخدم', `قام بحذف المستخدم: ${user?.username || 'غير معروف'}`);
                res.json({ success: true, message: 'تم حذف المستخدم' });
            }
        });
    });
});

// ==================== سجل النشاطات ====================
app.get('/api/logs', verifyToken, verifyAdmin, (req, res) => {
    db.all("SELECT * FROM logs ORDER BY created_at DESC LIMIT 500", [], (err, logs) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(logs || []);
        }
    });
});

// ==================== تذاكر الدعم ====================
app.get('/api/tickets', verifyToken, (req, res) => {
    if (req.user.role !== 'مسؤول') {
        db.all("SELECT * FROM tickets WHERE username = ? ORDER BY created_at DESC", [req.user.username], (err, tickets) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json(tickets || []);
            }
        });
    } else {
        db.all("SELECT * FROM tickets ORDER BY created_at DESC LIMIT 50", [], (err, tickets) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json(tickets || []);
            }
        });
    }
});

app.post('/api/tickets', verifyToken, (req, res) => {
    const { subject, message } = req.body;
    const { date } = getCurrentDateTime();
    const id = uuidv4();
    
    if (!subject || !message) {
        return res.status(400).json({ error: 'العنوان والرسالة مطلوبان' });
    }
    
    db.run(`INSERT INTO tickets (id, user_id, username, subject, message, date, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, req.user.id, req.user.username, subject, message, date, 'قيد المعالجة'],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                logActivity(req.user.id, req.user.username, req.user.role, 'إرسال تذكرة', `قام بإرسال تذكرة: ${subject}`);
                res.json({ success: true, id: id, message: 'تم إرسال التذكرة' });
            }
        });
});

// ==================== إحصائيات سريعة ====================
app.get('/api/stats', verifyToken, (req, res) => {
    db.all("SELECT status, COUNT(*) as count FROM vessels GROUP BY status", [], (err, statusCounts) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        db.get("SELECT COUNT(*) as total FROM vessels", [], (err, totalResult) => {
            const total = totalResult?.total || 0;
            const salih = statusCounts.find(s => s.status === 'صالح')?.count || 0;
            const mo3atab = statusCounts.find(s => s.status === 'معطب')?.count || 0;
            const siyana = statusCounts.find(s => s.status === 'صيانة')?.count || 0;
            const efficiency = total > 0 ? ((salih / total) * 100).toFixed(1) : 0;
            
            res.json({ total, salih, mo3atab, siyana, efficiency });
        });
    });
});

// ==================== تصدير واستيراد البيانات ====================
app.get('/api/export', verifyToken, verifyAdmin, (req, res) => {
    db.all("SELECT * FROM vessels ORDER BY created_at DESC", [], (err, vessels) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            const exportData = {
                exportDate: new Date().toISOString(),
                version: "2.0",
                vessels: vessels
            };
            logActivity(req.user.id, req.user.username, req.user.role, 'تصدير بيانات', 'قام بتصدير جميع البيانات');
            res.json(exportData);
        }
    });
});

app.post('/api/import', verifyToken, verifyAdmin, (req, res) => {
    const { vessels } = req.body;
    
    if (!vessels || !Array.isArray(vessels)) {
        return res.status(400).json({ error: 'بيانات غير صالحة' });
    }
    
    let imported = 0;
    let errors = 0;
    let completed = 0;
    
    if (vessels.length === 0) {
        return res.json({ success: true, imported: 0, errors: 0, message: 'لا توجد بيانات للاستيراد' });
    }
    
    vessels.forEach(v => {
        const id = uuidv4();
        const now = new Date().toISOString();
        const category = getCategory(v.length);
        
        db.run(`INSERT INTO vessels (id, name, number, length, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference, category, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, v.name, v.number || '', v.length || 0, v.region || '', v.zone || '', v.port || '', v.support_location || '', v.status || 'صالح', v.breakdown_type || '', v.breakdown_date || '', v.end_date || '', v.reference || '', category, now, now],
            function(err) {
                if (err) errors++;
                else imported++;
                completed++;
                
                if (completed === vessels.length) {
                    logActivity(req.user.id, req.user.username, req.user.role, 'استيراد بيانات', `قام باستيراد ${imported} مركب`);
                    res.json({ success: true, imported, errors, message: `تم استيراد ${imported} مركب بنجاح` });
                }
            });
    });
});

// ==================== تهيئة المستخدمين الافتراضيين ====================
async function initializeDefaultUsers() {
    const defaultUsers = [
        { id: uuidv4(), username: 'admin', password: '1234', role: 'مسؤول' },
        { id: uuidv4(), username: 'editor', password: '1234', role: 'محرر' },
        { id: uuidv4(), username: 'viewer', password: '1234', role: 'مشاهد' }
    ];
    
    for (const user of defaultUsers) {
        db.get("SELECT id FROM users WHERE username = ?", [user.username], async (err, existing) => {
            if (!existing) {
                const hash = await bcrypt.hash(user.password, 10);
                db.run("INSERT INTO users (id, username, password, role, enabled) VALUES (?, ?, ?, ?, ?)",
                    [user.id, user.username, hash, user.role, 1]);
                console.log(`✅ تم إنشاء المستخدم: ${user.username}`);
            }
        });
    }
}

// ==================== تشغيل الخادم ====================
initializeDefaultUsers();

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ═══════════════════════════════════════════════════════════════
    🌊 منظومة الوسائل البحرية - الإصدار 2.0.0
    📍 الخادم يعمل على: http://localhost:${PORT}
    ───────────────────────────────────────────────────────────────
    👤 حسابات الدخول:
       🔐 مسؤول (admin): admin / 1234
       ✏️ محرر (editor): editor / 1234
       👁️ مشاهد (viewer): viewer / 1234
    ───────────────────────────────────────────────────────────────
    💾 قاعدة البيانات: SQLite (./data/marine_system.db)
    ═══════════════════════════════════════════════════════════════
    `);
});
