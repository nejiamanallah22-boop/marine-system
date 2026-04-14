const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'marine_super_secret_key_2024';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ملف قاعدة البيانات
const DB_PATH = path.join(__dirname, 'data', 'database.json');

// التأكد من وجود مجلد data
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
}

// ==================== دوال قاعدة البيانات ====================

function readDB() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            const defaultDB = {
                vessels: [
                    { id: uuidv4(), name: "البروق 1", number: "B001", length: 11, region: "الشمال", zone: "تونس", port: "تونس", support_location: "قاعدة الشمال", status: "صالح", breakdown_type: "", breakdown_date: "", end_date: "", reference: "", category: "البروق", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
                    { id: uuidv4(), name: "صقر 1", number: "S001", length: 10, region: "الساحل", zone: "سوسة", port: "سوسة", support_location: "قاعدة الساحل", status: "صالح", breakdown_type: "", breakdown_date: "", end_date: "", reference: "", category: "صقور", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
                    { id: uuidv4(), name: "خافرة 1", number: "K001", length: 20, region: "الوسط", zone: "صفاقس", port: "صفاقس", support_location: "قاعدة الوسط", status: "معطب", breakdown_type: "عطل في المحرك", breakdown_date: "2025-03-10", end_date: "2025-04-10", reference: "REF001", category: "خوافر", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
                    { id: uuidv4(), name: "زورق 1", number: "Z001", length: 15, region: "الجنوب", zone: "جربة", port: "جربة", support_location: "قاعدة الجنوب", status: "صيانة", breakdown_type: "صيانة دورية", breakdown_date: "2025-03-15", end_date: "2025-04-05", reference: "REF002", category: "زوارق مزدوجة", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
                    { id: uuidv4(), name: "طوافة 1", number: "T001", length: 35, region: "الشمال", zone: "بنزرت", port: "بنزرت", support_location: "قاعدة الشمال", status: "صالح", breakdown_type: "", breakdown_date: "", end_date: "", reference: "", category: "طوافات", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
                ],
                users: [
                    { id: uuidv4(), username: "admin", password: bcrypt.hashSync("1234", 10), role: "مسؤول", enabled: true, createdAt: new Date().toISOString() },
                    { id: uuidv4(), username: "editor", password: bcrypt.hashSync("1234", 10), role: "محرر", enabled: true, createdAt: new Date().toISOString() },
                    { id: uuidv4(), username: "viewer", password: bcrypt.hashSync("1234", 10), role: "مشاهد", enabled: true, createdAt: new Date().toISOString() }
                ],
                logs: [],
                tickets: []
            };
            fs.writeFileSync(DB_PATH, JSON.stringify(defaultDB, null, 2));
            return defaultDB;
        }
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (error) {
        console.error('خطأ في قراءة قاعدة البيانات:', error);
        return { vessels: [], users: [], logs: [], tickets: [] };
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('خطأ في كتابة قاعدة البيانات:', error);
        return false;
    }
}

// ==================== دوال مساعدة ====================

function addLog(username, role, action, details) {
    const db = readDB();
    db.logs.unshift({
        id: uuidv4(),
        userName: username,
        userRole: role,
        action: action,
        details: details,
        date: new Date().toISOString(),
        timestamp: Date.now()
    });
    if (db.logs.length > 1000) db.logs = db.logs.slice(0, 1000);
    writeDB(db);
}

function getCategory(length) {
    const n = parseFloat(length);
    if (n === 11) return "البروق";
    if (n >= 8 && n <= 12) return "صقور";
    if (n > 12 && n <= 25) return "خوافر";
    if (n >= 30) return "طوافات";
    return "زوارق مزدوجة";
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
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const db = readDB();
    
    const user = db.users.find(u => u.username === username);
    
    if (!user) {
        return res.status(401).json({ error: 'اسم المستخدم غير موجود' });
    }
    
    if (!user.enabled) {
        return res.status(401).json({ error: 'هذا الحساب معطل' });
    }
    
    const isValidPassword = bcrypt.compareSync(password, user.password);
    
    if (!isValidPassword) {
        return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
    }
    
    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        SECRET_KEY,
        { expiresIn: '24h' }
    );
    
    addLog(user.username, user.role, 'تسجيل دخول', 'قام بتسجيل الدخول إلى النظام');
    
    res.json({
        success: true,
        token: token,
        user: {
            id: user.id,
            username: user.username,
            role: user.role
        }
    });
});

// ==================== المراكب ====================

app.get('/api/vessels', verifyToken, (req, res) => {
    const db = readDB();
    res.json(db.vessels);
});

app.post('/api/vessels', verifyToken, (req, res) => {
    const { name, number, length, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'الاسم مطلوب' });
    }
    
    const db = readDB();
    const newVessel = {
        id: uuidv4(),
        name: name,
        number: number || '',
        length: length || 0,
        region: region || '',
        zone: zone || '',
        port: port || '',
        support_location: support_location || '',
        status: status || 'صالح',
        breakdown_type: breakdown_type || '',
        breakdown_date: breakdown_date || '',
        end_date: end_date || '',
        reference: reference || '',
        category: getCategory(length),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    db.vessels.push(newVessel);
    writeDB(db);
    
    addLog(req.user.username, req.user.role, 'إضافة مركب', `قام بإضافة مركب: ${name}`);
    
    res.json({ success: true, vessel: newVessel });
});

app.put('/api/vessels/:id', verifyToken, (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    
    const db = readDB();
    const vesselIndex = db.vessels.findIndex(v => v.id === id);
    
    if (vesselIndex === -1) {
        return res.status(404).json({ error: 'المركب غير موجود' });
    }
    
    db.vessels[vesselIndex] = {
        ...db.vessels[vesselIndex],
        ...updates,
        category: updates.length ? getCategory(updates.length) : db.vessels[vesselIndex].category,
        updatedAt: new Date().toISOString()
    };
    
    writeDB(db);
    
    addLog(req.user.username, req.user.role, 'تعديل مركب', `قام بتعديل مركب: ${db.vessels[vesselIndex].name}`);
    
    res.json({ success: true, vessel: db.vessels[vesselIndex] });
});

app.delete('/api/vessels/:id', verifyToken, verifyAdmin, (req, res) => {
    const { id } = req.params;
    
    const db = readDB();
    const vessel = db.vessels.find(v => v.id === id);
    
    if (!vessel) {
        return res.status(404).json({ error: 'المركب غير موجود' });
    }
    
    db.vessels = db.vessels.filter(v => v.id !== id);
    writeDB(db);
    
    addLog(req.user.username, req.user.role, 'حذف مركب', `قام بحذف مركب: ${vessel.name}`);
    
    res.json({ success: true });
});

// ==================== المستخدمين ====================

app.get('/api/users', verifyToken, verifyAdmin, (req, res) => {
    const db = readDB();
    const safeUsers = db.users.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
        enabled: u.enabled,
        createdAt: u.createdAt
    }));
    res.json(safeUsers);
});

app.post('/api/users', verifyToken, verifyAdmin, (req, res) => {
    const { username, password, role } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبة' });
    }
    
    const db = readDB();
    
    if (db.users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
    }
    
    const newUser = {
        id: uuidv4(),
        username: username,
        password: bcrypt.hashSync(password, 10),
        role: role || 'مشاهد',
        enabled: true,
        createdAt: new Date().toISOString()
    };
    
    db.users.push(newUser);
    writeDB(db);
    
    addLog(req.user.username, req.user.role, 'إضافة مستخدم', `قام بإضافة مستخدم: ${username}`);
    
    res.json({ success: true, user: { id: newUser.id, username: newUser.username, role: newUser.role } });
});

app.put('/api/users/:id/password', verifyToken, verifyAdmin, (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    
    if (!password) {
        return res.status(400).json({ error: 'كلمة المرور الجديدة مطلوبة' });
    }
    
    const db = readDB();
    const user = db.users.find(u => u.id === id);
    
    if (!user) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    if (user.username === 'admin' && req.user.username !== 'admin') {
        return res.status(403).json({ error: 'لا يمكن تغيير كلمة مرور المدير الرئيسي' });
    }
    
    user.password = bcrypt.hashSync(password, 10);
    writeDB(db);
    
    addLog(req.user.username, req.user.role, 'تغيير كلمة مرور', `قام بتغيير كلمة مرور المستخدم: ${user.username}`);
    
    res.json({ success: true });
});

app.put('/api/users/:id/toggle', verifyToken, verifyAdmin, (req, res) => {
    const { id } = req.params;
    const { enabled } = req.body;
    
    const db = readDB();
    const user = db.users.find(u => u.id === id);
    
    if (!user) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    if (user.username === 'admin') {
        return res.status(403).json({ error: 'لا يمكن تعطيل المدير الرئيسي' });
    }
    
    user.enabled = enabled;
    writeDB(db);
    
    addLog(req.user.username, req.user.role, enabled ? 'تفعيل مستخدم' : 'تعطيل مستخدم', `قام ${enabled ? 'بتفعيل' : 'بتعطيل'} المستخدم: ${user.username}`);
    
    res.json({ success: true });
});

app.delete('/api/users/:id', verifyToken, verifyAdmin, (req, res) => {
    const { id } = req.params;
    
    const db = readDB();
    const user = db.users.find(u => u.id === id);
    
    if (!user) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    if (user.username === 'admin') {
        return res.status(403).json({ error: 'لا يمكن حذف المدير الرئيسي' });
    }
    
    db.users = db.users.filter(u => u.id !== id);
    writeDB(db);
    
    addLog(req.user.username, req.user.role, 'حذف مستخدم', `قام بحذف المستخدم: ${user.username}`);
    
    res.json({ success: true });
});

// ==================== سجل النشاطات ====================

app.get('/api/logs', verifyToken, verifyAdmin, (req, res) => {
    const db = readDB();
    res.json(db.logs);
});

// ==================== تذاكر الدعم ====================

app.get('/api/tickets', verifyToken, (req, res) => {
    const db = readDB();
    if (req.user.role !== 'مسؤول') {
        const userTickets = db.tickets.filter(t => t.userName === req.user.username);
        return res.json(userTickets);
    }
    res.json(db.tickets);
});

app.post('/api/tickets', verifyToken, (req, res) => {
    const { subject, message } = req.body;
    
    if (!subject || !message) {
        return res.status(400).json({ error: 'العنوان والرسالة مطلوبة' });
    }
    
    const db = readDB();
    const newTicket = {
        id: uuidv4(),
        userName: req.user.username,
        subject: subject,
        message: message,
        status: 'قيد المعالجة',
        createdAt: new Date().toISOString()
    };
    
    db.tickets.unshift(newTicket);
    writeDB(db);
    
    addLog(req.user.username, req.user.role, 'إرسال تذكرة دعم', `قام بإرسال تذكرة: ${subject}`);
    
    res.json({ success: true, ticket: newTicket });
});

// ==================== تصدير واستيراد البيانات ====================

// تصدير جميع البيانات
app.get('/api/export', verifyToken, verifyAdmin, (req, res) => {
    const db = readDB();
    const exportData = {
        exportDate: new Date().toISOString(),
        version: "1.0",
        vessels: db.vessels,
        users: db.users.map(u => ({
            id: u.id,
            username: u.username,
            role: u.role,
            enabled: u.enabled,
            createdAt: u.createdAt
        })),
        tickets: db.tickets,
        logs: db.logs.slice(0, 500)
    };
    
    addLog(req.user.username, req.user.role, 'تصدير بيانات', 'قام بتصدير جميع البيانات');
    res.json(exportData);
});

// استيراد البيانات
app.post('/api/import', verifyToken, verifyAdmin, (req, res) => {
    const { vessels, users, tickets, mergeMode } = req.body;
    const db = readDB();
    
    try {
        if (vessels && Array.isArray(vessels)) {
            if (mergeMode === 'replace') {
                db.vessels = vessels;
            } else {
                const existingIds = new Set(db.vessels.map(v => v.id));
                const newVessels = vessels.filter(v => !existingIds.has(v.id));
                db.vessels.push(...newVessels);
            }
        }
        
        if (users && Array.isArray(users) && mergeMode === 'replace') {
            const adminExists = users.find(u => u.username === 'admin');
            if (!adminExists) {
                const currentAdmin = db.users.find(u => u.username === 'admin');
                if (currentAdmin) users.push(currentAdmin);
            }
            db.users = users.map(u => ({
                ...u,
                password: u.password || bcrypt.hashSync("1234", 10)
            }));
        }
        
        if (tickets && Array.isArray(tickets)) {
            if (mergeMode === 'replace') {
                db.tickets = tickets;
            } else {
                const existingIds = new Set(db.tickets.map(t => t.id));
                const newTickets = tickets.filter(t => !existingIds.has(t.id));
                db.tickets.unshift(...newTickets);
            }
        }
        
        writeDB(db);
        addLog(req.user.username, req.user.role, 'استيراد بيانات', `قام باستيراد البيانات (وضع: ${mergeMode === 'replace' ? 'استبدال' : 'دمج'})`);
        res.json({ success: true, message: 'تم استيراد البيانات بنجاح' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في استيراد البيانات: ' + error.message });
    }
});

// إحصائيات النظام
app.get('/api/stats', verifyToken, (req, res) => {
    const db = readDB();
    const stats = {
        totalVessels: db.vessels.length,
        operationalVessels: db.vessels.filter(v => v.status === 'صالح').length,
        maintenanceVessels: db.vessels.filter(v => v.status === 'صيانة').length,
        brokenVessels: db.vessels.filter(v => v.status === 'معطب').length,
        totalUsers: db.users.length,
        totalTickets: db.tickets.length,
        recentLogs: db.logs.slice(0, 10)
    };
    res.json(stats);
});

// ==================== تشغيل الخادم ====================

app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
    console.log(`📁 قاعدة البيانات: ${DB_PATH}`);
    console.log(`🔐 بيانات الدخول: admin / 1234 | editor / 1234 | viewer / 1234`);
});
