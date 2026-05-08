const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'votre_cle_secrete_marine_2025';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==================== قاعدة بيانات مؤقتة (في الذاكرة) ====================
// في التطبيق الحقيقي، استخدم MongoDB أو PostgreSQL

let vessels = [
    { id: 101, name: "البروق 1", num: "B001", len: 11, reg: "الشمال", zone: "تونس", port: "تونس", supp: "قاعدة الشمال", stat: "صالح", break: "", fDate: null, eDate: null, ref: "", cat: "البروق", createdAt: new Date(), updatedAt: new Date() },
    { id: 102, name: "صقر 1", num: "S001", len: 10, reg: "الساحل", zone: "سوسة", port: "سوسة", supp: "قاعدة الساحل", stat: "صالح", break: "", fDate: null, eDate: null, ref: "", cat: "صقور", createdAt: new Date(), updatedAt: new Date() },
    { id: 103, name: "خافرة 1", num: "K001", len: 20, reg: "الوسط", zone: "صفاقس", port: "صفاقس", supp: "قاعدة الوسط", stat: "معطب", break: "عطل في المحرك", fDate: "2025-03-10", eDate: "2025-04-10", ref: "REF001", cat: "خوافر", createdAt: new Date(), updatedAt: new Date() },
    { id: 104, name: "زورق 1", num: "Z001", len: 15, reg: "الجنوب", zone: "جربة", port: "جربة", supp: "قاعدة الجنوب", stat: "صيانة", break: "صيانة دورية", fDate: "2025-03-15", eDate: "2025-04-05", ref: "REF002", cat: "زوارق مزدوجة", createdAt: new Date(), updatedAt: new Date() },
    { id: 105, name: "طوافة 1", num: "T001", len: 35, reg: "الشمال", zone: "بنزرت", port: "بنزرت", supp: "قاعدة الشمال", stat: "صالح", break: "", fDate: null, eDate: null, ref: "", cat: "طوافات", createdAt: new Date(), updatedAt: new Date() },
    { id: 106, name: "البروق 2", num: "B002", len: 11, reg: "الساحل", zone: "المنستير", port: "المنستير", supp: "قاعدة الساحل", stat: "معطب", break: "عطل في الكهرباء", fDate: "2025-03-20", eDate: "2025-04-15", ref: "REF003", cat: "البروق", createdAt: new Date(), updatedAt: new Date() },
    { id: 107, name: "صقر 2", num: "S002", len: 9, reg: "الوسط", zone: "المهدية", port: "المهدية", supp: "قاعدة الوسط", stat: "صيانة", break: "تغيير زيوت", fDate: "2025-03-25", eDate: "2025-04-08", ref: "REF004", cat: "صقور", createdAt: new Date(), updatedAt: new Date() },
    { id: 108, name: "خافرة 2", num: "K002", len: 22, reg: "الجنوب", zone: "قابس", port: "قابس", supp: "قاعدة الجنوب", stat: "صالح", break: "", fDate: null, eDate: null, ref: "", cat: "خوافر", createdAt: new Date(), updatedAt: new Date() },
    { id: 109, name: "زورق 2", num: "Z002", len: 8, reg: "الشمال", zone: "طبرقة", port: "طبرقة", supp: "قاعدة الشمال", stat: "معطب", break: "عطل في المضخة", fDate: "2025-03-05", eDate: "2025-04-20", ref: "REF005", cat: "زوارق مزدوجة", createdAt: new Date(), updatedAt: new Date() },
    { id: 110, name: "طوافة 2", num: "T002", len: 40, reg: "الساحل", zone: "نابل", port: "نابل", supp: "قاعدة الساحل", stat: "صيانة", break: "صيانة شاملة", fDate: "2025-03-01", eDate: "2025-04-25", ref: "REF006", cat: "طوافات", createdAt: new Date(), updatedAt: new Date() }
];

let users = [
    { id: 1, name: "admin", password: "$2a$10$XQwZxYxYxYxYxYxYxYxYxO", role: "مسؤول", enabled: true }, // password: 1234
    { id: 2, name: "editor", password: "$2a$10$XQwZxYxYxYxYxYxYxYxYxO", role: "محرر", enabled: true },
    { id: 3, name: "viewer", password: "$2a$10$XQwZxYxYxYxYxYxYxYxYxO", role: "مشاهد", enabled: true }
];

let logs = [];
let tickets = [];

let nextVesselId = 111;
let nextUserId = 4;
let nextTicketId = 1;

// ==================== دوال مساعدة ====================
function getCategoryFromLength(len) {
    const n = parseFloat(len);
    if (n === 11) return "البروق";
    if (n >= 8 && n <= 12) return "صقور";
    if (n > 12 && n <= 25) return "خوافر";
    if (n >= 30) return "طوافات";
    return "زوارق مزدوجة";
}

function logActivity(user, action, details) {
    logs.unshift({
        id: Date.now(),
        userName: user.name,
        userRole: user.role,
        action: action,
        details: details,
        date: new Date().toLocaleDateString('ar-TN'),
        time: new Date().toLocaleTimeString('ar-TN'),
        timestamp: new Date()
    });
    // الاحتفاظ بآخر 500 سجل فقط
    if (logs.length > 500) logs.pop();
}

// ==================== Middleware التحقق من التوكن ====================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: "غير مصرح به - يرجى تسجيل الدخول" });
    }
    
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            return res.status(403).json({ error: "انتهت صلاحية الجلسة" });
        }
        req.user = user;
        next();
    });
}

function checkRole(roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: "ليس لديك صلاحية للقيام بهذا الإجراء" });
        }
        next();
    };
}

// ==================== مسارات المصادقة (Auth) ====================
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: "يرجى إدخال اسم المستخدم وكلمة المرور" });
    }
    
    const user = users.find(u => u.name === username);
    
    if (!user) {
        return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    }
    
    if (!user.enabled) {
        return res.status(401).json({ error: "هذا المستخدم معطل" });
    }
    
    // في التطبيق الحقيقي، استخدم bcrypt للمقارنة
    // const isValid = await bcrypt.compare(password, user.password);
    const isValid = (password === "1234"); // مؤقت
    
    if (!isValid) {
        return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    }
    
    const token = jwt.sign(
        { id: user.id, name: user.name, role: user.role },
        SECRET_KEY,
        { expiresIn: '24h' }
    );
    
    logActivity(user, "تسجيل دخول", "قام بتسجيل الدخول إلى النظام");
    
    res.json({
        token,
        user: {
            id: user.id,
            name: user.name,
            role: user.role
        }
    });
});

app.post('/api/auth/logout', authenticateToken, (req, res) => {
    logActivity(req.user, "تسجيل خروج", "قام بتسجيل الخروج من النظام");
    res.json({ message: "تم تسجيل الخروج بنجاح" });
});

// ==================== مسارات المراكب (Vessels) ====================
app.get('/api/vessels', authenticateToken, (req, res) => {
    res.json(vessels);
});

app.get('/api/vessels/:id', authenticateToken, (req, res) => {
    const vessel = vessels.find(v => v.id === parseInt(req.params.id));
    if (!vessel) {
        return res.status(404).json({ error: "المركب غير موجود" });
    }
    res.json(vessel);
});

app.post('/api/vessels', authenticateToken, checkRole(['مسؤول', 'محرر']), (req, res) => {
    const { name, num, len, reg, zone, port, supp, stat, break: breakDesc, fDate, eDate, ref } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: "اسم المركب مطلوب" });
    }
    
    if ((stat === 'معطب' || stat === 'صيانة') && !fDate) {
        return res.status(400).json({ error: "تاريخ العطب إلزامي للمراكب المعطوبة أو التي تحت الصيانة" });
    }
    
    const existingVessel = vessels.find(v => v.name === name);
    if (existingVessel) {
        return res.status(400).json({ error: "مركب بنفس الاسم موجود بالفعل" });
    }
    
    const newVessel = {
        id: nextVesselId++,
        name,
        num: num || "",
        len: len || 0,
        reg: reg || "",
        zone: zone || "",
        port: port || "",
        supp: supp || "",
        stat: stat || "صالح",
        break: breakDesc || "",
        fDate: fDate || null,
        eDate: eDate || null,
        ref: ref || "",
        cat: getCategoryFromLength(len),
        createdAt: new Date(),
        updatedAt: new Date()
    };
    
    vessels.push(newVessel);
    logActivity(req.user, "إضافة مركب", `قام بإضافة مركب جديد: ${name}`);
    
    res.status(201).json(newVessel);
});

app.put('/api/vessels/:id', authenticateToken, checkRole(['مسؤول', 'محرر']), (req, res) => {
    const id = parseInt(req.params.id);
    const vesselIndex = vessels.findIndex(v => v.id === id);
    
    if (vesselIndex === -1) {
        return res.status(404).json({ error: "المركب غير موجود" });
    }
    
    const { name, num, len, reg, zone, port, supp, stat, break: breakDesc, fDate, eDate, ref } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: "اسم المركب مطلوب" });
    }
    
    if ((stat === 'معطب' || stat === 'صيانة') && !fDate) {
        return res.status(400).json({ error: "تاريخ العطب إلزامي للمراكب المعطوبة أو التي تحت الصيانة" });
    }
    
    vessels[vesselIndex] = {
        ...vessels[vesselIndex],
        name,
        num: num || "",
        len: len || 0,
        reg: reg || "",
        zone: zone || "",
        port: port || "",
        supp: supp || "",
        stat: stat || "صالح",
        break: breakDesc || "",
        fDate: fDate || null,
        eDate: eDate || null,
        ref: ref || "",
        cat: getCategoryFromLength(len),
        updatedAt: new Date()
    };
    
    logActivity(req.user, "تعديل مركب", `قام بتعديل المركب: ${name}`);
    res.json(vessels[vesselIndex]);
});

app.delete('/api/vessels/:id', authenticateToken, checkRole(['مسؤول']), (req, res) => {
    const id = parseInt(req.params.id);
    const vesselIndex = vessels.findIndex(v => v.id === id);
    
    if (vesselIndex === -1) {
        return res.status(404).json({ error: "المركب غير موجود" });
    }
    
    const deletedVessel = vessels[vesselIndex];
    vessels.splice(vesselIndex, 1);
    
    logActivity(req.user, "حذف مركب", `قام بحذف المركب: ${deletedVessel.name}`);
    res.json({ message: "تم حذف المركب بنجاح" });
});

// ==================== مسارات المستخدمين (Users) ====================
app.get('/api/users', authenticateToken, checkRole(['مسؤول']), (req, res) => {
    const safeUsers = users.map(u => ({
        id: u.id,
        name: u.name,
        role: u.role,
        enabled: u.enabled
    }));
    res.json(safeUsers);
});

app.post('/api/users', authenticateToken, checkRole(['مسؤول']), async (req, res) => {
    const { name, password, role } = req.body;
    
    if (!name || !password) {
        return res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبان" });
    }
    
    if (users.find(u => u.name === name)) {
        return res.status(400).json({ error: "اسم المستخدم موجود بالفعل" });
    }
    
    // const hashedPassword = await bcrypt.hash(password, 10);
    const hashedPassword = password; // مؤقت
    
    const newUser = {
        id: nextUserId++,
        name,
        password: hashedPassword,
        role: role || "مشاهد",
        enabled: true
    };
    
    users.push(newUser);
    logActivity(req.user, "إضافة مستخدم", `قام بإضافة مستخدم جديد: ${name}`);
    
    res.status(201).json({
        id: newUser.id,
        name: newUser.name,
        role: newUser.role,
        enabled: newUser.enabled
    });
});

app.put('/api/users/:id/password', authenticateToken, checkRole(['مسؤول']), async (req, res) => {
    const id = parseInt(req.params.id);
    const { newPassword } = req.body;
    
    if (!newPassword) {
        return res.status(400).json({ error: "كلمة المرور الجديدة مطلوبة" });
    }
    
    const user = users.find(u => u.id === id);
    if (!user) {
        return res.status(404).json({ error: "المستخدم غير موجود" });
    }
    
    // const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = newPassword; // مؤقت
    
    logActivity(req.user, "تغيير كلمة مرور", `قام بتغيير كلمة مرور المستخدم: ${user.name}`);
    res.json({ message: "تم تغيير كلمة المرور بنجاح" });
});

app.patch('/api/users/:id/toggle', authenticateToken, checkRole(['مسؤول']), (req, res) => {
    const id = parseInt(req.params.id);
    const user = users.find(u => u.id === id);
    
    if (!user) {
        return res.status(404).json({ error: "المستخدم غير موجود" });
    }
    
    user.enabled = !user.enabled;
    logActivity(req.user, `${user.enabled ? 'تفعيل' : 'تعطيل'} مستخدم`, `قام ${user.enabled ? 'بتفعيل' : 'بتعطيل'} المستخدم: ${user.name}`);
    
    res.json({ message: `تم ${user.enabled ? 'تفعيل' : 'تعطيل'} المستخدم بنجاح` });
});

app.delete('/api/users/:id', authenticateToken, checkRole(['مسؤول']), (req, res) => {
    const id = parseInt(req.params.id);
    const userIndex = users.findIndex(u => u.id === id);
    
    if (userIndex === -1) {
        return res.status(404).json({ error: "المستخدم غير موجود" });
    }
    
    const deletedUser = users[userIndex];
    users.splice(userIndex, 1);
    
    logActivity(req.user, "حذف مستخدم", `قام بحذف المستخدم: ${deletedUser.name}`);
    res.json({ message: "تم حذف المستخدم بنجاح" });
});

// ==================== مسارات سجل التتبع (Logs) ====================
app.get('/api/logs', authenticateToken, checkRole(['مسؤول']), (req, res) => {
    const { startDate, endDate } = req.query;
    let filteredLogs = [...logs];
    
    if (startDate) {
        const start = new Date(startDate);
        filteredLogs = filteredLogs.filter(l => new Date(l.timestamp) >= start);
    }
    
    if (endDate) {
        const end = new Date(endDate);
        filteredLogs = filteredLogs.filter(l => new Date(l.timestamp) <= end);
    }
    
    res.json(filteredLogs);
});

// ==================== مسارات تذاكر الدعم (Tickets) ====================
app.get('/api/tickets', authenticateToken, (req, res) => {
    const userTickets = tickets.filter(t => t.userName === req.user.name || req.user.role === 'مسؤول');
    res.json(userTickets);
});

app.post('/api/tickets', authenticateToken, (req, res) => {
    const { subject, message } = req.body;
    
    if (!subject || !message) {
        return res.status(400).json({ error: "العنوان والرسالة مطلوبان" });
    }
    
    const newTicket = {
        id: nextTicketId++,
        userName: req.user.name,
        subject,
        message,
        date: new Date().toLocaleDateString('ar-TN'),
        status: "قيد المعالجة",
        createdAt: new Date()
    };
    
    tickets.unshift(newTicket);
    logActivity(req.user, "إرسال تذكرة دعم", `قام بإرسال تذكرة: ${subject}`);
    
    res.status(201).json(newTicket);
});

// ==================== مسارات الإحصائيات (Statistics) ====================
app.get('/api/statistics', authenticateToken, (req, res) => {
    const total = vessels.length;
    const ok = vessels.filter(v => v.stat === 'صالح').length;
    const maint = vessels.filter(v => v.stat === 'صيانة').length;
    const broken = vessels.filter(v => v.stat === 'معطب').length;
    const efficiency = total ? ((ok / total) * 100).toFixed(1) : 0;
    
    const categories = {};
    const regions = {};
    
    vessels.forEach(v => {
        categories[v.cat] = (categories[v.cat] || 0) + 1;
        regions[v.reg] = (regions[v.reg] || 0) + 1;
    });
    
    res.json({
        total,
        ok,
        maint,
        broken,
        efficiency,
        categories,
        regions
    });
});

// ==================== مسارات الاستيراد والتصدير ====================
app.get('/api/export', authenticateToken, checkRole(['مسؤول']), (req, res) => {
    const exportData = {
        exportDate: new Date().toISOString(),
        version: "1.0",
        vessels,
        users: users.map(u => ({ id: u.id, name: u.name, role: u.role, enabled: u.enabled })),
        tickets,
        logs
    };
    
    res.json(exportData);
});

app.post('/api/import', authenticateToken, checkRole(['مسؤول']), (req, res) => {
    const { vessels: importedVessels, users: importedUsers, tickets: importedTickets, logs: importedLogs } = req.body;
    
    if (importedVessels) vessels = importedVessels;
    if (importedUsers) users = importedUsers;
    if (importedTickets) tickets = importedTickets;
    if (importedLogs) logs = importedLogs;
    
    logActivity(req.user, "استيراد بيانات", "قام باستيراد البيانات من ملف نسخ احتياطي");
    res.json({ message: "تم استيراد البيانات بنجاح" });
});

// ==================== خدمة الملفات الثابتة ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/zones', authenticateToken, (req, res) => {
    const zones = {
        "الشمال": ["تونس", "بنزرت", "طبرقة"],
        "الساحل": ["سوسة", "المنستير", "نابل"],
        "الوسط": ["صفاقس", "المهدية", "قرقنة"],
        "الجنوب": ["جرجيس", "جربة", "قابس"]
    };
    res.json(zones);
});

app.get('/api/categories', authenticateToken, (req, res) => {
    const categories = ["البروق", "صقور", "خوافر", "زوارق مزدوجة", "طوافات"];
    res.json(categories);
});

// ==================== تشغيل الخادم ====================
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`📱 http://localhost:${PORT}`);
    console.log(`🔐 بيانات الدخول الافتراضية: admin / 1234`);
});
