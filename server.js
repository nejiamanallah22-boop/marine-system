const express = require('express');
const session = require('express-session');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 10000;

// ==================== البيانات المخزنة في الذاكرة ====================
let vessels = [];
let tickets = [];
let logs = [];
let locations = [];

// دالة لتحديد الفئة بناءً على الطول
function getCategory(len) {
    const n = parseFloat(len);
    if (n === 11) return "البروق";
    if (n >= 8 && n <= 12) return "صقور";
    if (n > 12 && n <= 25) return "خوافر";
    if (n >= 30) return "طوافات";
    return "زوارق مزدوجة";
}

// بيانات تجريبية افتراضية للمراكب
const sampleVessels = [
    { id: '1', name: 'البروق 1', num: 'B001', len: 11, reg: 'الشمال', zone: 'تونس', port: 'تونس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'البروق' },
    { id: '2', name: 'صقر 2', num: 'S002', len: 10, reg: 'الساحل', zone: 'سوسة', port: 'سوسة', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'صقور' },
    { id: '3', name: 'خافرة 3', num: 'K003', len: 20, reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: '', stat: 'معطب', break: 'عطل في المحرك الرئيسي', fDate: '2024-01-15', eDate: '2024-03-15', ref: 'REF001', cat: 'خوافر' },
    { id: '4', name: 'طوافة 4', num: 'T004', len: 35, reg: 'الجنوب', zone: 'جرجيس', port: 'جرجيس', supp: '', stat: 'صيانة', break: 'أعطال كهربائية', fDate: '2024-02-01', eDate: '2024-03-01', ref: 'REF002', cat: 'طوافات' },
    { id: '5', name: 'زورق سريع 5', num: 'Z005', len: 15, reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: 'قاعدة بنزرت', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'زوارق مزدوجة' },
    { id: '6', name: 'البروق 6', num: 'B006', len: 11, reg: 'الساحل', zone: 'المنستير', port: 'المنستير', supp: '', stat: 'صيانة', break: 'عطل في نظام الملاحة', fDate: '2024-02-10', eDate: '2024-02-25', ref: 'REF003', cat: 'البروق' },
    { id: '7', name: 'صقر 7', num: 'S007', len: 9, reg: 'الجنوب', zone: 'جربة', port: 'جربة', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'صقور' },
];

vessels.push(...sampleVessels);

// المستخدمون
const users = [
    { id: '1', name: 'admin', pass: '1234', role: 'مسؤول', enabled: true },
    { id: '2', name: 'user', pass: 'user', role: 'مشاهد', enabled: true },
    { id: '3', name: 'editor', pass: 'editor', role: 'محرر', enabled: true },
];

// بيانات تجريبية للتذاكر
const sampleTickets = [
    {
        id: '1',
        userName: 'admin',
        userRole: 'مسؤول',
        subject: 'مشكلة في تحميل البيانات',
        message: 'البيانات لا تظهر بشكل صحيح في صفحة الأسطول',
        date: '15/02/2024',
        time: '10:30',
        status: 'قيد المعالجة',
        replies: []
    }
];
tickets.push(...sampleTickets);

// ==================== Middleware ====================
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'marine_secret_key_2024',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Middleware للتحقق من المصادقة
function isAuth(req, res, next) {
    if (req.session.userId) return next();
    res.status(401).json({ error: 'غير مصرح، يرجى تسجيل الدخول' });
}

function isAdmin(req, res, next) {
    if (req.session.userRole === 'مسؤول') return next();
    res.status(403).json({ error: 'غير مسموح - هذه الخاصية للمسؤول فقط' });
}

function canEdit(req, res, next) {
    if (req.session.userRole === 'مسؤول' || req.session.userRole === 'محرر') return next();
    res.status(403).json({ error: 'غير مسموح - ليس لديك صلاحية التعديل' });
}

// ==================== Socket.IO ====================
io.on('connection', (socket) => {
    console.log('🟢 مستخدم جديد متصل:', socket.id);
    
    socket.on('send-location', (data) => {
        const locationData = {
            ...data,
            timestamp: new Date(),
            socketId: socket.id
        };
        locations.push(locationData);
        
        // الاحتفاظ فقط بآخر 100 موقع
        if (locations.length > 100) locations.shift();
        
        // بث الموقع لجميع المستخدمين
        io.emit('receive-location', {
            userName: data.userName,
            userRole: data.userRole,
            lat: data.lat,
            lng: data.lng,
            time: new Date()
        });
        
        console.log(`📍 موقع ${data.userName}: ${data.lat}, ${data.lng}`);
    });
    
    socket.on('disconnect', () => {
        console.log('🔴 مستخدم انقطع:', socket.id);
    });
});

// ==================== API Routes ====================

// التحقق من صحة الخادم
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        vesselsCount: vessels.length,
        session: req.session.userId ? 'active' : 'none'
    });
});

// تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { name, pass } = req.body;
    console.log('محاولة تسجيل دخول:', name);
    
    const user = users.find(u => u.name === name && u.pass === pass && u.enabled === true);
    
    if (!user) {
        return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    
    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.userName = user.name;
    
    // تسجيل نشاط تسجيل الدخول
    logs.unshift({
        id: Date.now().toString(),
        userName: user.name,
        userRole: user.role,
        action: 'تسجيل دخول',
        details: `قام بتسجيل الدخول إلى النظام`,
        date: new Date().toLocaleDateString('ar-EG'),
        time: new Date().toLocaleTimeString('ar-EG')
    });
    
    res.json({ id: user.id, name: user.name, role: user.role });
});

// تسجيل الخروج
app.post('/api/logout', (req, res) => {
    if (req.session.userName) {
        logs.unshift({
            id: Date.now().toString(),
            userName: req.session.userName,
            userRole: req.session.userRole,
            action: 'تسجيل خروج',
            details: `قام بتسجيل الخروج من النظام`,
            date: new Date().toLocaleDateString('ar-EG'),
            time: new Date().toLocaleTimeString('ar-EG')
        });
    }
    req.session.destroy();
    res.json({ success: true });
});

// التحقق من الجلسة
app.get('/api/check-session', (req, res) => {
    if (req.session.userId) {
        res.json({ 
            loggedIn: true, 
            user: { 
                name: req.session.userName, 
                role: req.session.userRole 
            } 
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// ==================== مسارات المراكب ====================

// جلب جميع المراكب
app.get('/api/vessels', isAuth, (req, res) => {
    res.json(vessels);
});

// إضافة مركب جديد
app.post('/api/vessels', canEdit, (req, res) => {
    const newVessel = {
        id: Date.now().toString(),
        ...req.body,
        cat: getCategory(req.body.len)
    };
    vessels.unshift(newVessel);
    
    // تسجيل النشاط
    logs.unshift({
        id: Date.now().toString(),
        userName: req.session.userName,
        userRole: req.session.userRole,
        action: 'إضافة مركب',
        details: `قام بإضافة مركب "${newVessel.name}" رقم ${newVessel.num || 'غير محدد'}`,
        date: new Date().toLocaleDateString('ar-EG'),
        time: new Date().toLocaleTimeString('ar-EG')
    });
    
    res.status(201).json(newVessel);
});

// تعديل مركب
app.put('/api/vessels/:id', canEdit, (req, res) => {
    const index = vessels.findIndex(v => v.id === req.params.id);
    if (index !== -1) {
        const oldName = vessels[index].name;
        vessels[index] = { 
            ...vessels[index], 
            ...req.body, 
            cat: getCategory(req.body.len || vessels[index].len) 
        };
        
        // تسجيل النشاط
        logs.unshift({
            id: Date.now().toString(),
            userName: req.session.userName,
            userRole: req.session.userRole,
            action: 'تعديل مركب',
            details: `قام بتعديل مركب "${oldName}" إلى "${vessels[index].name}"`,
            date: new Date().toLocaleDateString('ar-EG'),
            time: new Date().toLocaleTimeString('ar-EG')
        });
        
        res.json(vessels[index]);
    } else {
        res.status(404).json({ error: 'المركب غير موجود' });
    }
});

// حذف مركب
app.delete('/api/vessels/:id', isAdmin, (req, res) => {
    const index = vessels.findIndex(v => v.id === req.params.id);
    if (index !== -1) {
        const deletedName = vessels[index].name;
        vessels = vessels.filter(v => v.id !== req.params.id);
        
        // تسجيل النشاط
        logs.unshift({
            id: Date.now().toString(),
            userName: req.session.userName,
            userRole: req.session.userRole,
            action: 'حذف مركب',
            details: `قام بحذف مركب "${deletedName}"`,
            date: new Date().toLocaleDateString('ar-EG'),
            time: new Date().toLocaleTimeString('ar-EG')
        });
        
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'المركب غير موجود' });
    }
});

// ==================== مسارات المستخدمين ====================

// جلب جميع المستخدمين
app.get('/api/users', isAuth, isAdmin, (req, res) => {
    const usersWithoutPass = users.map(({ pass, ...user }) => user);
    res.json(usersWithoutPass);
});

// إضافة مستخدم جديد
app.post('/api/users', isAuth, isAdmin, (req, res) => {
    const { name, pass, role } = req.body;
    
    if (users.find(u => u.name === name)) {
        return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
    }
    
    const newUser = { 
        id: Date.now().toString(), 
        name, 
        pass, 
        role: role || 'مشاهد', 
        enabled: true 
    };
    users.push(newUser);
    
    // تسجيل النشاط
    logs.unshift({
        id: Date.now().toString(),
        userName: req.session.userName,
        userRole: req.session.userRole,
        action: 'إضافة مستخدم',
        details: `قام بإضافة مستخدم جديد: ${name} (${newUser.role})`,
        date: new Date().toLocaleDateString('ar-EG'),
        time: new Date().toLocaleTimeString('ar-EG')
    });
    
    res.status(201).json({ id: newUser.id, name, role: newUser.role });
});

// تحديث مستخدم
app.put('/api/users/:id', isAuth, isAdmin, (req, res) => {
    const index = users.findIndex(u => u.id === req.params.id);
    if (index !== -1) {
        users[index] = { ...users[index], ...req.body };
        const { pass, ...userWithoutPass } = users[index];
        res.json(userWithoutPass);
    } else {
        res.status(404).json({ error: 'المستخدم غير موجود' });
    }
});

// حذف مستخدم
app.delete('/api/users/:id', isAuth, isAdmin, (req, res) => {
    const index = users.findIndex(u => u.id === req.params.id);
    if (index !== -1) {
        const deletedName = users[index].name;
        users.splice(index, 1);
        
        // تسجيل النشاط
        logs.unshift({
            id: Date.now().toString(),
            userName: req.session.userName,
            userRole: req.session.userRole,
            action: 'حذف مستخدم',
            details: `قام بحذف المستخدم: ${deletedName}`,
            date: new Date().toLocaleDateString('ar-EG'),
            time: new Date().toLocaleTimeString('ar-EG')
        });
        
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'المستخدم غير موجود' });
    }
});

// ==================== مسارات التذاكر ====================

// جلب جميع التذاكر
app.get('/api/tickets', isAuth, (req, res) => {
    res.json(tickets);
});

// إضافة تذكرة جديدة
app.post('/api/tickets', isAuth, (req, res) => {
    const newTicket = {
        id: Date.now().toString(),
        ...req.body,
        status: 'قيد المعالجة',
        replies: []
    };
    tickets.unshift(newTicket);
    
    // تسجيل النشاط
    logs.unshift({
        id: Date.now().toString(),
        userName: req.session.userName,
        userRole: req.session.userRole,
        action: 'إرسال تذكرة',
        details: `قام بإرسال تذكرة دعم: ${newTicket.subject}`,
        date: new Date().toLocaleDateString('ar-EG'),
        time: new Date().toLocaleTimeString('ar-EG')
    });
    
    res.status(201).json(newTicket);
});

// الرد على تذكرة
app.put('/api/tickets/:id/reply', isAuth, isAdmin, (req, res) => {
    const ticket = tickets.find(t => t.id === req.params.id);
    if (ticket) {
        ticket.replies.push(req.body.reply);
        ticket.status = 'تم الرد';
        
        res.json(ticket);
    } else {
        res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
});

// إغلاق تذكرة
app.put('/api/tickets/:id/close', isAuth, isAdmin, (req, res) => {
    const ticket = tickets.find(t => t.id === req.params.id);
    if (ticket) {
        ticket.status = 'مغلقة';
        res.json(ticket);
    } else {
        res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
});

// ==================== مسارات سجل النشاطات ====================

// جلب سجل النشاطات
app.get('/api/logs', isAuth, isAdmin, (req, res) => {
    res.json(logs);
});

// إضافة نشاط (يستخدم من前端)
app.post('/api/logs', isAuth, (req, res) => {
    const newLog = {
        id: Date.now().toString(),
        ...req.body,
        date: new Date().toLocaleDateString('ar-EG'),
        time: new Date().toLocaleTimeString('ar-EG')
    };
    logs.unshift(newLog);
    res.status(201).json(newLog);
});

// ==================== مسارات GPS ====================

// جلب المواقع المحفوظة
app.get('/api/locations', isAuth, (req, res) => {
    res.json(locations.slice(-50)); // آخر 50 موقع
});

// ==================== مسارات التصدير والاستيراد ====================

// تصدير جميع البيانات
app.get('/api/export-all', isAuth, isAdmin, (req, res) => {
    res.json({
        vessels,
        users: users.map(({ pass, ...user }) => user),
        tickets,
        logs,
        locations
    });
});

// استيراد البيانات
app.post('/api/import-all', isAuth, isAdmin, (req, res) => {
    const { vessels: newVessels, tickets: newTickets, logs: newLogs } = req.body;
    
    if (newVessels && newVessels.length) vessels.push(...newVessels);
    if (newTickets && newTickets.length) tickets.push(...newTickets);
    if (newLogs && newLogs.length) logs.push(...newLogs);
    
    res.json({ success: true });
});

// ==================== التشغيل ====================
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║     🚀 منظومة متابعة الوسائل البحرية - تعمل بنجاح       ║
╠══════════════════════════════════════════════════════════╣
║  📡 الخادم يعمل على: http://localhost:${PORT}             ║
║  🔌 Socket.IO جاهز للعمل                                 ║
╠══════════════════════════════════════════════════════════╣
║  📝 بيانات الدخول:                                       ║
║  👑 admin / 1234 (مسؤول - كامل الصلاحيات)               ║
║  ✏️ editor / editor (محرر - يمكنه التعديل)              ║
║  👤 user / user (مشاهد - قراءة فقط)                     ║
╠══════════════════════════════════════════════════════════╣
║  📊 عدد المراكب في النظام: ${vessels.length}              ║
╚══════════════════════════════════════════════════════════╝
    `);
});
