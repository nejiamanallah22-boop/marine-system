const express = require('express');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

// ==================== Middleware ====================
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
const DATA_DIR = './data';
const DB_FILE = path.join(DATA_DIR, 'database.json');

// التأكد من وجود مجلد البيانات
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// تهيئة قاعدة البيانات الافتراضية
function initDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        // تشفير كلمات المرور الافتراضية
        const salt = bcrypt.genSaltSync(10);
        
        const defaultData = {
            vessels: [
                {id: 1, name: "المركب الحربي 101", number: "H101", length: 11, category: "البروق", region: "الشمال", zone: "تونس", port: "حلق الوادي", support_location: "قاعدة تونس", status: "صالح", breakdown_type: "", breakdown_date: "", end_date: "", reference: "REF001", createdAt: new Date().toISOString()},
                {id: 2, name: "الصقر السريع", number: "S201", length: 10, category: "صقور", region: "الساحل", zone: "سوسة", port: "سوسة", support_location: "قاعدة سوسة", status: "صالح", breakdown_type: "", breakdown_date: "", end_date: "", reference: "REF002", createdAt: new Date().toISOString()},
                {id: 3, name: "الخوفرة 1", number: "K301", length: 18, category: "خوافر", region: "الوسط", zone: "صفاقس", port: "صفاقس", support_location: "قاعدة صفاقس", status: "معطب", breakdown_type: "عطل في المحرك", breakdown_date: "2024-03-10", end_date: "2024-04-10", reference: "REF003", createdAt: new Date().toISOString()},
                {id: 4, name: "الطوافة الكبرى", number: "T401", length: 35, category: "طوافات", region: "الجنوب", zone: "جربة", port: "جربة", support_location: "قاعدة جربة", status: "صالح", breakdown_type: "", breakdown_date: "", end_date: "", reference: "REF004", createdAt: new Date().toISOString()},
                {id: 5, name: "الزورق المزدوج", number: "Z501", length: 7, category: "زوارق مزدوجة", region: "الجنوب", zone: "جرجيس", port: "جرجيس", support_location: "قاعدة جرجيس", status: "صيانة", breakdown_type: "صيانة دورية", breakdown_date: "2024-03-15", end_date: "2024-04-05", reference: "REF005", createdAt: new Date().toISOString()}
            ],
            users: [
                {id: 1, username: "admin", password: bcrypt.hashSync("admin123", salt), role: "مسؤول", enabled: true, createdAt: new Date().toISOString()},
                {id: 2, username: "officer", password: bcrypt.hashSync("officer123", salt), role: "محرر", enabled: true, createdAt: new Date().toISOString()},
                {id: 3, username: "viewer", password: bcrypt.hashSync("viewer123", salt), role: "مشاهد", enabled: true, createdAt: new Date().toISOString()}
            ],
            logs: [],
            tickets: [],
            settings: {
                systemName: "منظومة الوسائل البحرية",
                version: "2.0.0",
                lastBackup: null
            }
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2));
        console.log('✅ تم إنشاء قاعدة البيانات الافتراضية');
    }
}

// دوال مساعدة لقاعدة البيانات
function readDatabase() {
    const data = fs.readFileSync(DB_FILE);
    return JSON.parse(data);
}

function writeDatabase(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// تسجيل النشاطات
function logActivity(username, userRole, action, details, req) {
    const data = readDatabase();
    const now = new Date();
    const log = {
        id: Date.now(),
        username: username,
        userRole: userRole,
        action: action,
        details: details,
        ip: req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        date: now.toISOString(),
        time: now.toLocaleTimeString('ar-EG')
    };
    data.logs.unshift(log);
    if (data.logs.length > 1000) data.logs = data.logs.slice(0, 1000);
    writeDatabase(data);
}

// ==================== API Routes ====================

// تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبة' });
    }
    
    const data = readDatabase();
    const user = data.users.find(u => u.username === username && u.enabled === true);
    
    if (!user) {
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    const isValidPassword = bcrypt.compareSync(password, user.password);
    
    if (!isValidPassword) {
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    logActivity(user.username, user.role, 'تسجيل دخول', `قام بتسجيل الدخول من ${req.ip}`, req);
    
    res.json({
        success: true,
        user: {
            id: user.id,
            username: user.username,
            role: user.role
        }
    });
});

// تغيير كلمة المرور
app.post('/api/change-password', (req, res) => {
    const { userId, oldPassword, newPassword } = req.body;
    
    if (!userId || !oldPassword || !newPassword) {
        return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }
    
    if (newPassword.length < 4) {
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
    }
    
    const data = readDatabase();
    const user = data.users.find(u => u.id === parseInt(userId));
    
    if (!user) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    const isValidOldPassword = bcrypt.compareSync(oldPassword, user.password);
    
    if (!isValidOldPassword) {
        return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    }
    
    user.password = bcrypt.hashSync(newPassword, 10);
    writeDatabase(data);
    
    logActivity(user.username, user.role, 'تغيير كلمة مرور', 'قام بتغيير كلمة المرور الخاصة به', req);
    
    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
});

// إدارة المستخدمين (للمسؤول فقط)
app.get('/api/users', (req, res) => {
    const data = readDatabase();
    const users = data.users.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
        enabled: u.enabled,
        createdAt: u.createdAt
    }));
    res.json(users);
});

app.post('/api/users', (req, res) => {
    const { username, password, role, adminId } = req.body;
    
    // التحقق من صلاحيات المسؤول
    const data = readDatabase();
    const admin = data.users.find(u => u.id === parseInt(adminId) && u.role === 'مسؤول');
    
    if (!admin) {
        return res.status(403).json({ error: 'غير مصرح بهذه العملية' });
    }
    
    if (!username || !password) {
        return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبة' });
    }
    
    if (data.users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
    }
    
    const newUser = {
        id: Date.now(),
        username: username,
        password: bcrypt.hashSync(password, 10),
        role: role || 'مشاهد',
        enabled: true,
        createdAt: new Date().toISOString()
    };
    
    data.users.push(newUser);
    writeDatabase(data);
    
    logActivity(admin.username, admin.role, 'إضافة مستخدم', `أضاف المستخدم ${username}`, req);
    
    res.json({ success: true, user: newUser });
});

app.put('/api/users/:id', (req, res) => {
    const { password, enabled, adminId } = req.body;
    const userId = parseInt(req.params.id);
    
    const data = readDatabase();
    const admin = data.users.find(u => u.id === parseInt(adminId) && u.role === 'مسؤول');
    
    if (!admin) {
        return res.status(403).json({ error: 'غير مصرح بهذه العملية' });
    }
    
    const user = data.users.find(u => u.id === userId);
    
    if (!user) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    if (password) {
        user.password = bcrypt.hashSync(password, 10);
        logActivity(admin.username, admin.role, 'تغيير كلمة مرور مستخدم', `قام بتغيير كلمة مرور المستخدم ${user.username}`, req);
    }
    
    if (enabled !== undefined) {
        user.enabled = enabled;
        logActivity(admin.username, admin.role, `${enabled ? 'تفعيل' : 'تعطيل'} مستخدم`, `${enabled ? 'فعل' : 'عطل'} المستخدم ${user.username}`, req);
    }
    
    writeDatabase(data);
    res.json({ success: true });
});

app.delete('/api/users/:id', (req, res) => {
    const { adminId } = req.body;
    const userId = parseInt(req.params.id);
    
    const data = readDatabase();
    const admin = data.users.find(u => u.id === parseInt(adminId) && u.role === 'مسؤول');
    
    if (!admin) {
        return res.status(403).json({ error: 'غير مصرح بهذه العملية' });
    }
    
    const userToDelete = data.users.find(u => u.id === userId);
    
    if (!userToDelete) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    if (userToDelete.username === 'admin') {
        return res.status(400).json({ error: 'لا يمكن حذف المستخدم الرئيسي' });
    }
    
    data.users = data.users.filter(u => u.id !== userId);
    writeDatabase(data);
    
    logActivity(admin.username, admin.role, 'حذف مستخدم', `حذف المستخدم ${userToDelete.username}`, req);
    
    res.json({ success: true });
});

// إدارة المراكب
app.get('/api/vessels', (req, res) => {
    const data = readDatabase();
    res.json(data.vessels);
});

app.post('/api/vessels', (req, res) => {
    const vessel = req.body;
    const data = readDatabase();
    
    const newVessel = {
        ...vessel,
        id: Date.now(),
        category: getCategoryFromLength(vessel.length),
        createdAt: new Date().toISOString()
    };
    
    data.vessels.push(newVessel);
    writeDatabase(data);
    
    res.json({ success: true, vessel: newVessel });
});

app.put('/api/vessels/:id', (req, res) => {
    const vesselId = parseInt(req.params.id);
    const updates = req.body;
    const data = readDatabase();
    
    const index = data.vessels.findIndex(v => v.id === vesselId);
    
    if (index === -1) {
        return res.status(404).json({ error: 'المركب غير موجود' });
    }
    
    data.vessels[index] = {
        ...data.vessels[index],
        ...updates,
        category: getCategoryFromLength(updates.length || data.vessels[index].length),
        updatedAt: new Date().toISOString()
    };
    
    writeDatabase(data);
    res.json({ success: true });
});

app.delete('/api/vessels/:id', (req, res) => {
    const vesselId = parseInt(req.params.id);
    const data = readDatabase();
    
    data.vessels = data.vessels.filter(v => v.id !== vesselId);
    writeDatabase(data);
    
    res.json({ success: true });
});

// دالة مساعدة لتحديد الفئة
function getCategoryFromLength(length) {
    const n = parseFloat(length);
    if (isNaN(n)) return "زوارق مزدوجة";
    if (n === 11) return "البروق";
    if (n >= 8 && n <= 12) return "صقور";
    if (n > 12 && n <= 25) return "خوافر";
    if (n >= 30) return "طوافات";
    return "زوارق مزدوجة";
}

// سجل النشاطات
app.get('/api/logs', (req, res) => {
    const data = readDatabase();
    res.json(data.logs.slice(0, 200));
});

// التذاكر
app.get('/api/tickets', (req, res) => {
    const data = readDatabase();
    res.json(data.tickets);
});

app.post('/api/tickets', (req, res) => {
    const { username, subject, message } = req.body;
    const data = readDatabase();
    
    const newTicket = {
        id: Date.now(),
        username: username,
        subject: subject,
        message: message,
        status: 'قيد المعالجة',
        createdAt: new Date().toISOString()
    };
    
    data.tickets.unshift(newTicket);
    writeDatabase(data);
    
    res.json({ success: true, ticket: newTicket });
});

// إحصائيات سريعة
app.get('/api/stats', (req, res) => {
    const data = readDatabase();
    const total = data.vessels.length;
    const active = data.vessels.filter(v => v.status === 'صالح').length;
    const maintenance = data.vessels.filter(v => v.status === 'صيانة').length;
    const broken = data.vessels.filter(v => v.status === 'معطب').length;
    
    res.json({
        total,
        active,
        maintenance,
        broken,
        efficiency: total > 0 ? ((active / total) * 100).toFixed(1) : 0,
        totalUsers: data.users.length,
        totalTickets: data.tickets.length
    });
});

// تصدير البيانات
app.get('/api/export', (req, res) => {
    const data = readDatabase();
    const exportData = {
        exportDate: new Date().toISOString(),
        version: "2.0.0",
        vessels: data.vessels,
        users: data.users.map(u => ({ id: u.id, username: u.username, role: u.role, enabled: u.enabled })),
        tickets: data.tickets
    };
    res.json(exportData);
});

// استيراد البيانات
app.post('/api/import', (req, res) => {
    const { vessels, adminId } = req.body;
    
    const data = readDatabase();
    const admin = data.users.find(u => u.id === parseInt(adminId) && u.role === 'مسؤول');
    
    if (!admin) {
        return res.status(403).json({ error: 'غير مصرح بهذه العملية' });
    }
    
    if (vessels && Array.isArray(vessels)) {
        data.vessels = vessels;
        writeDatabase(data);
        logActivity(admin.username, admin.role, 'استيراد بيانات', `قام باستيراد ${vessels.length} مركب`, req);
        res.json({ success: true, count: vessels.length });
    } else {
        res.status(400).json({ error: 'بيانات غير صالحة' });
    }
});

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== بدء الخادم ====================
initDatabase();

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚢 نظام إدارة الأسطول البحري`);
    console.log(`📍 يعمل على: http://localhost:${PORT}`);
    console.log(`🔐 بيانات الدخول:`);
    console.log(`   admin / admin123 (مسؤول كامل)`);
    console.log(`   officer / officer123 (محرر)`);
    console.log(`   viewer / viewer123 (مشاهد)\n`);
});
