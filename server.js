const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== Middleware ====================
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ==================== دوال مساعدة ====================
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1';
}

function getCurrentDate() {
    const d = new Date();
    return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
}

function getCurrentTime() {
    const d = new Date();
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

// ==================== البيانات (في الذاكرة) ====================
let users = [
    { id: 1, name: 'admin', pass: hashPassword('1234'), role: 'مسؤول', enabled: true },
    { id: 2, name: 'editor', pass: hashPassword('1234'), role: 'محرر', enabled: true },
    { id: 3, name: 'viewer', pass: hashPassword('1234'), role: 'مشاهد', enabled: true }
];

let vessels = [
    { id: 1, name: 'البروق 1', num: 'B001', len: 11, reg: 'الشمال', zone: 'تونس', port: 'تونس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'البروق' },
    { id: 2, name: 'خافرة معطوبة', num: 'K002', len: 20, reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: '', stat: 'معطب', break: 'محرك محترق', fDate: '2024-05-01', eDate: '2024-06-15', ref: 'REF001', cat: 'خوافر' },
    { id: 3, name: 'زورق صيانة', num: 'Z003', len: 15, reg: 'الجنوب', zone: 'جربة', port: 'جربة', supp: '', stat: 'صيانة', break: 'عطل كهربائي', fDate: '2024-05-10', eDate: '2024-05-30', ref: 'REF002', cat: 'زوارق مزدوجة' }
];

let tickets = [];
let activityLogs = [];
let userLocations = [];
let maintenanceRecords = [
    {
        id: '1',
        vesselId: 1,
        type: 'كبرى',
        unit: 'وحدة الصيانة والإسناد البحري تونس',
        technician: 'أحمد المنصوري',
        faultType: 'محرك',
        startDate: '2024-06-01',
        endDate: '2024-06-15',
        status: 'منتهية',
        description: 'صيانة كبرى للمحرك الرئيسي',
        repair: 'استبدال مجموعة المكبس بالكامل',
        cost: 4500,
        notes: 'تم الانتهاء بنجاح',
        parts: [
            { name: 'مكبس', qty: 4, price: 800 },
            { name: 'حلقات مكبس', qty: 4, price: 150 }
        ]
    },
    {
        id: '2',
        vesselId: 2,
        type: 'طارئة',
        unit: 'وحدة الصيانة والإسناد البحري صفاقس',
        technician: 'محمد الصغير',
        faultType: 'كهرباء',
        startDate: '2024-06-10',
        endDate: '',
        status: 'قيد الإصلاح',
        description: 'عطل كهربائي شامل في لوحة التحكم',
        repair: 'إعادة تركيب لوحة الكهرباء واستبدال القواطع',
        cost: 2800,
        notes: 'بانتظار وصول قطع الغيار',
        parts: [
            { name: 'لوحة تحكم', qty: 1, price: 2000 },
            { name: 'قواطع كهربائية', qty: 5, price: 80 }
        ]
    }
];
let nextId = 10;

// ==================== دوال السجلات ====================
function logActivity(username, role, action, details, ip) {
    const log = {
        id: Date.now(),
        userName: username,
        userRole: role,
        action: action,
        details: details,
        date: getCurrentDate(),
        time: getCurrentTime(),
        ip: ip,
        timestamp: new Date().toISOString()
    };
    activityLogs.unshift(log);
    if (activityLogs.length > 1000) activityLogs.pop();
    return log;
}

// ==================== API تسجيل الدخول ====================
app.post('/api/login', (req, res) => {
    const { name, pass } = req.body;
    const hashedInputPass = hashPassword(pass);
    const user = users.find(u => u.name === name && u.pass === hashedInputPass);
    
    if (!user || !user.enabled) {
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userRole = user.role;
    
    logActivity(user.name, user.role, 'تسجيل دخول', `قام بتسجيل الدخول`, getClientIp(req));
    
    res.json({ success: true, name: user.name, role: user.role, id: user.id });
});

app.post('/api/logout', (req, res) => {
    if (req.session.userId) {
        logActivity(req.session.userName, req.session.userRole, 'تسجيل خروج', 'قام بتسجيل الخروج', getClientIp(req));
        userLocations = userLocations.filter(l => l.userId !== req.session.userId);
    }
    req.session.destroy();
    res.json({ success: true });
});

// ✅ التحقق من الجلسة الحالية
app.get('/api/me', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    res.json({
        id: req.session.userId,
        name: req.session.userName,
        role: req.session.userRole
    });
});

// ==================== API تتبع المستخدمين ====================
app.post('/api/update-location', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    
    const { lat, lng, page } = req.body;
    const existingIndex = userLocations.findIndex(l => l.userId === req.session.userId);
    const locationData = {
        userId: req.session.userId,
        userName: req.session.userName,
        userRole: req.session.userRole,
        lat: lat,
        lng: lng,
        page: page || 'unknown',
        lastUpdate: new Date().toISOString(),
        lastSeen: new Date().toLocaleTimeString('ar-TN')
    };
    
    if (existingIndex !== -1) {
        userLocations[existingIndex] = locationData;
    } else {
        userLocations.push(locationData);
    }
    
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    userLocations = userLocations.filter(l => new Date(l.lastUpdate) > fiveMinutesAgo);
    
    res.json({ success: true });
});

app.get('/api/user-locations', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    
    if (req.session.userRole === 'مسؤول') {
        res.json(userLocations);
    } else {
        const myLocation = userLocations.find(l => l.userId === req.session.userId);
        res.json(myLocation ? [myLocation] : []);
    }
});

// ==================== API المراكب ====================
app.get('/api/vessels', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    res.json(vessels);
});

app.post('/api/vessels', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    if (req.session.userRole === 'مشاهد') {
        return res.status(403).json({ error: 'لا تملك صلاحية الإضافة' });
    }
    
    const newVessel = { 
        id: nextId++, 
        name: req.body.name,
        createdAt: new Date().toISOString()
    };
    vessels.push(newVessel);
    
    logActivity(req.session.userName, req.session.userRole, 'إضافة مركب', 
        `أضاف مركب جديد: ${newVessel.name}`, getClientIp(req));
    
    res.json({ success: true, vessel: newVessel });
});

app.put('/api/vessels/:id', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    if (req.session.userRole === 'مشاهد') {
        return res.status(403).json({ error: 'لا تملك صلاحية التعديل' });
    }
    
    const index = vessels.findIndex(v => v.id == req.params.id);
    if (index !== -1) {
        const oldName = vessels[index].name;
        vessels[index] = { ...vessels[index], ...req.body, updatedAt: new Date().toISOString() };
        
        logActivity(req.session.userName, req.session.userRole, 'تعديل مركب', 
            `عدل المركب: ${oldName}`, getClientIp(req));
        
        res.json({ success: true, vessel: vessels[index] });
    } else {
        res.status(404).json({ error: 'مركب غير موجود' });
    }
});

app.delete('/api/vessels/:id', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    if (req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'لا تملك صلاحية الحذف' });
    }
    
    const vessel = vessels.find(v => v.id == req.params.id);
    vessels = vessels.filter(v => v.id != req.params.id);
    
    logActivity(req.session.userName, req.session.userRole, 'حذف مركب', 
        `حذف المركب: ${vessel?.name}`, getClientIp(req));
    
    res.json({ success: true });
});

// ==================== API المستخدمين ====================
app.get('/api/users', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    
    const safeUsers = users.map(u => ({ 
        id: u.id, 
        name: u.name, 
        role: u.role, 
        enabled: u.enabled 
    }));
    
    res.json(safeUsers);
});

app.post('/api/users', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    
    const { name, pass, role } = req.body;
    
    if (!name || !pass) {
        return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
    }
    
    if (users.find(u => u.name === name)) {
        return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
    }
    
    const newUser = { 
        id: nextId++, 
        name: name, 
        pass: hashPassword(pass),
        role: role || 'مشاهد', 
        enabled: true,
        lastLogin: null
    };
    
    users.push(newUser);
    logActivity(req.session.userName, req.session.userRole, 'إضافة مستخدم', 
        `أضاف مستخدم جديد: ${name}`, getClientIp(req));
    
    res.json({ success: true, user: { id: newUser.id, name: newUser.name, role: newUser.role, enabled: newUser.enabled } });
});

app.put('/api/users/:id', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    
    const index = users.findIndex(u => u.id == req.params.id);
    if (index !== -1) {
        const { name, role, enabled } = req.body;
        if (name !== undefined) users[index].name = name;
        if (role !== undefined) users[index].role = role;
        if (enabled !== undefined) users[index].enabled = enabled;
        
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'مستخدم غير موجود' });
    }
});

app.put('/api/users/:id/password', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    
    const { newPassword } = req.body;
    if (!newPassword) {
        return res.status(400).json({ error: 'كلمة المرور الجديدة مطلوبة' });
    }
    
    const index = users.findIndex(u => u.id == req.params.id);
    if (index !== -1) {
        users[index].pass = hashPassword(newPassword);
        logActivity(req.session.userName, req.session.userRole, 'تغيير كلمة مرور', 
            `غير كلمة مرور المستخدم: ${users[index].name}`, getClientIp(req));
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'مستخدم غير موجود' });
    }
});

app.delete('/api/users/:id', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    
    const user = users.find(u => u.id == req.params.id);
    if (user && user.name === 'admin') {
        return res.status(400).json({ error: 'لا يمكن حذف المستخدم admin' });
    }
    
    users = users.filter(u => u.id != req.params.id);
    logActivity(req.session.userName, req.session.userRole, 'حذف مستخدم', 
        `حذف المستخدم: ${user?.name}`, getClientIp(req));
    
    res.json({ success: true });
});

// ==================== API التذاكر ====================
app.get('/api/tickets', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    res.json(tickets);
});

app.post('/api/tickets', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    
    const newTicket = { 
        _id: Date.now().toString(), 
        ...req.body, 
        replies: [],
        createdAt: new Date().toISOString()
    };
    tickets.unshift(newTicket);
    
    logActivity(req.session.userName, req.session.userRole, 'إرسال تذكرة', 
        `أرسل تذكرة دعم: ${req.body.subject}`, getClientIp(req));
    
    res.json({ success: true, ticket: newTicket });
});

app.put('/api/tickets/:id/reply', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    
    const ticket = tickets.find(t => t._id === req.params.id);
    if (ticket) {
        ticket.replies.push(req.body.reply);
        ticket.status = 'تم الرد';
        logActivity(req.session.userName, req.session.userRole, 'رد على تذكرة', 
            `رد على تذكرة: ${ticket.subject}`, getClientIp(req));
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'تذكرة غير موجودة' });
    }
});

app.put('/api/tickets/:id/close', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    
    const ticket = tickets.find(t => t._id === req.params.id);
    if (ticket) {
        ticket.status = 'مغلقة';
        logActivity(req.session.userName, req.session.userRole, 'إغلاق تذكرة', 
            `أغلق التذكرة: ${ticket.subject}`, getClientIp(req));
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'تذكرة غير موجودة' });
    }
});

// ==================== API سجل النشاطات ====================
app.get('/api/logs', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    res.json(activityLogs);
});

app.post('/api/logs', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    
    const { action, details } = req.body;
    const log = logActivity(
        req.session.userName, 
        req.session.userRole, 
        action, 
        details, 
        getClientIp(req)
    );
    
    res.json({ success: true, log });
});

// ==================== API تصدير واستيراد ====================
app.get('/api/export-all', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    
    const exportData = {
        vessels: vessels,
        tickets: tickets,
        maintenance: maintenanceRecords,
        users: users.map(u => ({ id: u.id, name: u.name, role: u.role, enabled: u.enabled })),
        exportDate: new Date().toISOString(),
        version: '2.0'
    };
    
    logActivity(req.session.userName, req.session.userRole, 'تصدير بيانات', 
        'قام بتصدير جميع البيانات', getClientIp(req));
    
    res.json(exportData);
});

app.post('/api/import-all', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    
    const { vessels: newVessels, tickets: newTickets, maintenance: newMaintenance } = req.body;
    
    if (newVessels && Array.isArray(newVessels)) {
        vessels = newVessels;
    }
    if (newTickets && Array.isArray(newTickets)) {
        tickets = newTickets;
    }
    if (newMaintenance && Array.isArray(newMaintenance)) {
        maintenanceRecords = newMaintenance;
    }
    
    logActivity(req.session.userName, req.session.userRole, 'استيراد بيانات', 
        'قام باستيراد البيانات من ملف', getClientIp(req));
    
    res.json({ success: true });
});

// ==================== ✅ API الصيانة ====================

// جلب جميع سجلات الصيانة
app.get('/api/maintenance', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    res.json(maintenanceRecords);
});

// إضافة سجل صيانة جديد
app.post('/api/maintenance', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    if (req.session.userRole === 'مشاهد') {
        return res.status(403).json({ error: 'لا تملك صلاحية الإضافة' });
    }
    
    const newRecord = { 
        id: Date.now().toString(), 
        ...req.body,
        createdAt: new Date().toISOString()
    };
    maintenanceRecords.push(newRecord);
    
    logActivity(req.session.userName, req.session.userRole, 'إضافة سجل صيانة', 
        `أضاف سجل صيانة للمركب: ${req.body.vesselId}`, getClientIp(req));
    
    res.json({ success: true, record: newRecord });
});

// تحديث سجل صيانة
app.put('/api/maintenance/:id', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    if (req.session.userRole === 'مشاهد') {
        return res.status(403).json({ error: 'لا تملك صلاحية التعديل' });
    }
    
    const index = maintenanceRecords.findIndex(r => r.id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ error: 'السجل غير موجود' });
    }
    
    maintenanceRecords[index] = { 
        ...maintenanceRecords[index], 
        ...req.body, 
        updatedAt: new Date().toISOString() 
    };
    
    logActivity(req.session.userName, req.session.userRole, 'تعديل سجل صيانة', 
        `عدل سجل الصيانة: ${req.params.id}`, getClientIp(req));
    
    res.json({ success: true, record: maintenanceRecords[index] });
});

// حذف سجل صيانة
app.delete('/api/maintenance/:id', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    if (req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'لا تملك صلاحية الحذف' });
    }
    
    const record = maintenanceRecords.find(r => r.id === req.params.id);
    maintenanceRecords = maintenanceRecords.filter(r => r.id !== req.params.id);
    
    logActivity(req.session.userName, req.session.userRole, 'حذف سجل صيانة', 
        `حذف سجل الصيانة: ${req.params.id}`, getClientIp(req));
    
    res.json({ success: true });
});

// ==================== API الاختبار ====================
app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        server: 'Marine Tracking System v2.0'
    });
});

// ==================== تنظيف المواقع القديمة ====================
setInterval(() => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    userLocations = userLocations.filter(l => new Date(l.lastUpdate) > fiveMinutesAgo);
}, 60 * 1000);

// ==================== تشغيل السيرفر ====================
app.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║     🚀 منظومة الوسائل البحرية - نظام متابعة الأسطول       ║`);
    console.log(`╠══════════════════════════════════════════════════════════════╣`);
    console.log(`║  ✅ السيرفر يعمل على: http://localhost:${PORT}                  ║`);
    console.log(`║  🗺️  خريطة تتبع المستخدمين: نشطة                          ║`);
    console.log(`║  🔐 تشفير كلمات المرور: SHA-256                            ║`);
    console.log(`║  🛠️  نظام الصيانة: مفعل                                   ║`);
    console.log(`║  📦  التخزين: في الذاكرة (للتجربة)                        ║`);
    console.log(`╠══════════════════════════════════════════════════════════════╣`);
    console.log(`║  📝 بيانات الدخول التجريبية:                                ║`);
    console.log(`║     👑 admin / 1234  (مسؤول كامل الصلاحيات)                ║`);
    console.log(`║     ✏️ editor / 1234 (محرر - يمكنه الإضافة والتعديل)       ║`);
    console.log(`║     👁️ viewer / 1234 (مشاهد - قراءة فقط)                   ║`);
    console.log(`╚══════════════════════════════════════════════════════════════╝\n`);
});
