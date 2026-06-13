const express = require('express');
const session = require('express-session');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// ==================== البيانات المخزنة في الذاكرة ====================
let vessels = [];
let tickets = [];
let logs = [];
let locations = [];

// دالة لتحديد الفئة
function getCategory(len) {
    const n = parseFloat(len);
    if (n === 11) return "البروق";
    if (n >= 8 && n <= 12) return "صقور";
    if (n > 12 && n <= 25) return "خوافر";
    if (n >= 30) return "طوافات";
    if (n === 0) return "وحدات صيانة";
    return "زوارق مزدوجة";
}

// البيانات الأولية للمراكب (7 مراكب + وحدات الصيانة)
const sampleVessels = [
    // المراكب الأساسية
    { id: '1', name: 'البروق 1', num: 'B001', len: 11, reg: 'الشمال', zone: 'تونس', port: 'تونس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'البروق' },
    { id: '2', name: 'صقر 2', num: 'S002', len: 10, reg: 'الساحل', zone: 'سوسة', port: 'سوسة', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'صقور' },
    { id: '3', name: 'خافرة 3', num: 'K003', len: 20, reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: '', stat: 'معطب', break: 'عطل في المحرك الرئيسي', fDate: '2024-01-15', eDate: '2024-03-15', ref: 'REF001', cat: 'خوافر' },
    { id: '4', name: 'طوافة 4', num: 'T004', len: 35, reg: 'الجنوب', zone: 'جرجيس', port: 'جرجيس', supp: '', stat: 'صيانة', break: 'أعطال كهربائية', fDate: '2024-02-01', eDate: '2024-03-01', ref: 'REF002', cat: 'طوافات' },
    { id: '5', name: 'زورق سريع 5', num: 'Z005', len: 15, reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: 'قاعدة بنزرت', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'زوارق مزدوجة' },
    { id: '6', name: 'البروق 6', num: 'B006', len: 11, reg: 'الساحل', zone: 'المنستير', port: 'المنستير', supp: '', stat: 'صيانة', break: 'عطل في نظام الملاحة', fDate: '2024-02-10', eDate: '2024-02-25', ref: 'REF003', cat: 'البروق' },
    { id: '7', name: 'صقر 7', num: 'S007', len: 9, reg: 'الجنوب', zone: 'جربة', port: 'جربة', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'صقور' },
    // وحدات الصيانة
    { id: '8', name: 'وحدة صيانة تونس', num: 'M001', len: 0, reg: 'وحدة الصيانة والإسناد البحري تونس', zone: 'تونس', port: 'تونس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'وحدات صيانة' },
    { id: '9', name: 'وحدة صيانة المنستير', num: 'M002', len: 0, reg: 'وحدة الصيانة والإسناد البحري المنستير', zone: 'المنستير', port: 'المنستير', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'وحدات صيانة' },
    { id: '10', name: 'وحدة صيانة صفاقس', num: 'M003', len: 0, reg: 'وحدة الصيانة والإسناد البحري صفاقس', zone: 'صفاقس', port: 'صفاقس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'وحدات صيانة' },
    { id: '11', name: 'وحدة صيانة جرجيس', num: 'M004', len: 0, reg: 'وحدة الصيانة والإسناد البحري جرجيس', zone: 'جرجيس', port: 'جرجيس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'وحدات صيانة' },
    { id: '12', name: 'المجمع الأمني بقبيبة', num: 'A001', len: 0, reg: 'المجمع الأمني بقبيبة', zone: 'قبيبة', port: 'قبيبة', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'مراكز قيادة' }
];
vessels.push(...sampleVessels);

// المستخدمون
const users = [
    { id: '1', name: 'admin', pass: '1234', role: 'مسؤول', enabled: true },
    { id: '2', name: 'user', pass: 'user', role: 'مشاهد', enabled: true },
    { id: '3', name: 'editor', pass: 'editor', role: 'محرر', enabled: true },
];

// بيانات تذاكر تجريبية
const sampleTickets = [
    { id: '1', userName: 'admin', userRole: 'مسؤول', subject: 'اختبار النظام', message: 'النظام يعمل بشكل جيد', date: '15/02/2024', time: '10:30', status: 'قيد المعالجة', replies: [] }
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
        // حفظ الموقع
        const locationData = {
            userName: data.userName,
            userRole: data.userRole,
            lat: data.lat,
            lng: data.lng,
            timestamp: new Date()
        };
        locations.push(locationData);
        
        // الاحتفاظ بآخر 100 موقع فقط
        if (locations.length > 100) locations.shift();
        
        // بث الموقع لجميع المستخدمين المتصلين
        io.emit('receive-location', {
            userName: data.userName,
            userRole: data.userRole,
            lat: data.lat,
            lng: data.lng,
            time: new Date()
        });
        
        console.log(`📍 موقع من ${data.userName}: ${data.lat}, ${data.lng}`);
    });
    
    socket.on('disconnect', () => {
        console.log('🔴 مستخدم انقطع:', socket.id);
    });
});

// ==================== API Routes ====================

// التحقق من صحة الخادم
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', vesselsCount: vessels.length });
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
    
    // تسجيل النشاط
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
            user: { name: req.session.userName, role: req.session.userRole } 
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// ==================== مسارات المراكب ====================
app.get('/api/vessels', isAuth, (req, res) => {
    res.json(vessels);
});

app.post('/api/vessels', canEdit, (req, res) => {
    const newVessel = {
        id: Date.now().toString(),
        ...req.body,
        cat: getCategory(req.body.len)
    };
    vessels.unshift(newVessel);
    
    logs.unshift({
        id: Date.now().toString(),
        userName: req.session.userName,
        userRole: req.session.userRole,
        action: 'إضافة مركب',
        details: `قام بإضافة مركب "${newVessel.name}"`,
        date: new Date().toLocaleDateString('ar-EG'),
        time: new Date().toLocaleTimeString('ar-EG')
    });
    
    res.status(201).json(newVessel);
});

app.put('/api/vessels/:id', canEdit, (req, res) => {
    const index = vessels.findIndex(v => v.id === req.params.id);
    if (index !== -1) {
        const oldName = vessels[index].name;
        vessels[index] = { 
            ...vessels[index], 
            ...req.body, 
            cat: getCategory(req.body.len || vessels[index].len) 
        };
        
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

app.delete('/api/vessels/:id', isAdmin, (req, res) => {
    const index = vessels.findIndex(v => v.id === req.params.id);
    if (index !== -1) {
        const deletedName = vessels[index].name;
        vessels = vessels.filter(v => v.id !== req.params.id);
        
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
app.get('/api/users', isAuth, isAdmin, (req, res) => {
    const usersWithoutPass = users.map(({ pass, ...user }) => user);
    res.json(usersWithoutPass);
});

app.post('/api/users', isAuth, isAdmin, (req, res) => {
    const { name, pass, role } = req.body;
    
    if (!name || !pass) {
        return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
    }
    
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

app.delete('/api/users/:id', isAuth, isAdmin, (req, res) => {
    const index = users.findIndex(u => u.id === req.params.id);
    if (index !== -1 && users[index].name !== 'admin') {
        const deletedName = users[index].name;
        users.splice(index, 1);
        
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
        res.status(400).json({ error: 'لا يمكن حذف المستخدم admin' });
    }
});

// ==================== مسارات التذاكر ====================
app.get('/api/tickets', isAuth, (req, res) => {
    res.json(tickets);
});

app.post('/api/tickets', isAuth, (req, res) => {
    const newTicket = {
        id: Date.now().toString(),
        ...req.body,
        status: 'قيد المعالجة',
        replies: []
    };
    tickets.unshift(newTicket);
    
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
app.get('/api/logs', isAuth, isAdmin, (req, res) => {
    res.json(logs);
});

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
// ✅ فقط المسؤول يمكنه رؤية المواقع
app.get('/api/locations', isAuth, isAdmin, (req, res) => {
    // إرجاع المواقع بدون موقع المسؤول الحالي
    const filteredLocations = locations.filter(loc => loc.userName !== req.session.userName);
    res.json(filteredLocations.slice(-50));
});

// ==================== مسارات التصدير والاستيراد ====================
app.get('/api/export-all', isAuth, isAdmin, (req, res) => {
    res.json({
        vessels,
        users: users.map(({ pass, ...user }) => user),
        tickets,
        logs,
        locations
    });
});

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
║  📡 الخادم: http://localhost:${PORT}                      ║
╠══════════════════════════════════════════════════════════╣
║  📝 بيانات الدخول:                                       ║
║  👑 admin / 1234 (مسؤول - كامل الصلاحيات)               ║
║  ✏️ editor / editor (محرر - يمكنه التعديل)              ║
║  👤 user / user (مشاهد - قراءة فقط)                     ║
╠══════════════════════════════════════════════════════════╣
║  📊 عدد المراكب في النظام: ${vessels.length}              ║
║  🗺️ تتبع المواقع: متاح للمسؤول فقط                      ║
╚══════════════════════════════════════════════════════════╝
    `);
});
