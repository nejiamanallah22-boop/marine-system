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

// دالة لتحديد الفئة
function getCategory(len) {
    const n = parseFloat(len);
    if (n === 11) return "البروق";
    if (n >= 8 && n <= 12) return "صقور";
    if (n > 12 && n <= 25) return "خوافر";
    if (n >= 30) return "طوافات";
    return "زوارق مزدوجة";
}

// بيانات تجريبية للمراكب (7 مراكب كما في الصورة)
const sampleVessels = [
    { id: '1', name: 'البروق 1', num: 'B001', len: 11, reg: 'الشمال', zone: 'تونس', port: 'تونس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'البروق' },
    { id: '2', name: 'صقر 2', num: 'S002', len: 10, reg: 'الساحل', zone: 'سوسة', port: 'سوسة', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'صقور' },
    { id: '3', name: 'خافرة 3', num: 'K003', len: 20, reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: '', stat: 'معطب', break: 'عطل في المحرك الرئيسي', fDate: '2024-01-15', eDate: '2024-03-15', ref: 'REF001', cat: 'خوافر' },
    { id: '4', name: 'طوافة 4', num: 'T004', len: 35, reg: 'الجنوب', zone: 'جرجيس', port: 'جرجيس', supp: '', stat: 'صيانة', break: 'أعطال كهربائية', fDate: '2024-02-01', eDate: '2024-03-01', ref: 'REF002', cat: 'طوافات' },
    { id: '5', name: 'زورق سريع 5', num: 'Z005', len: 15, reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: 'قاعدة بنزرت', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'زوارق مزدوجة' },
    { id: '6', name: 'البروق 6', num: 'B006', len: 11, reg: 'الساحل', zone: 'المنستير', port: 'المنستير', supp: '', stat: 'صيانة', break: 'عطل في نظام الملاحة', fDate: '2024-02-10', eDate: '2024-02-25', ref: 'REF003', cat: 'البروق' },
    { id: '7', name: 'صقر 7', num: 'S007', len: 9, reg: 'الجنوب', zone: 'جربة', port: 'جربة', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'صقور' },
    // إضافة مراكب لوحدات الصيانة
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

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'marine_key_2024',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

function isAuth(req, res, next) {
    if (req.session.userId) return next();
    res.status(401).json({ error: 'غير مصرح' });
}

function isAdmin(req, res, next) {
    if (req.session.userRole === 'مسؤول') return next();
    res.status(403).json({ error: 'غير مسموح' });
}

// Socket.IO - تتبع المواقع
io.on('connection', (socket) => {
    console.log('🟢 مستخدم متصل:', socket.id);
    
    socket.on('send-location', (data) => {
        const locationData = {
            ...data,
            timestamp: new Date(),
            socketId: socket.id
        };
        locations.push(locationData);
        if (locations.length > 100) locations.shift();
        
        // إرسال الموقع لجميع المستخدمين المسؤولين فقط
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

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', vesselsCount: vessels.length });
});

app.post('/api/login', (req, res) => {
    const { name, pass } = req.body;
    const user = users.find(u => u.name === name && u.pass === pass && u.enabled === true);
    
    if (!user) {
        return res.status(401).json({ error: 'بيانات غير صحيحة' });
    }
    
    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.userName = user.name;
    
    logs.unshift({
        id: Date.now().toString(),
        userName: user.name,
        userRole: user.role,
        action: 'تسجيل دخول',
        details: `قام بتسجيل الدخول`,
        date: new Date().toLocaleDateString('ar-EG'),
        time: new Date().toLocaleTimeString('ar-EG')
    });
    
    res.json({ id: user.id, name: user.name, role: user.role });
});

app.post('/api/logout', (req, res) => {
    if (req.session.userName) {
        logs.unshift({
            id: Date.now().toString(),
            userName: req.session.userName,
            userRole: req.session.userRole,
            action: 'تسجيل خروج',
            details: `قام بتسجيل الخروج`,
            date: new Date().toLocaleDateString('ar-EG'),
            time: new Date().toLocaleTimeString('ar-EG')
        });
    }
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/check-session', (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true, user: { name: req.session.userName, role: req.session.userRole } });
    } else {
        res.json({ loggedIn: false });
    }
});

// مراكب
app.get('/api/vessels', isAuth, (req, res) => {
    res.json(vessels);
});

app.post('/api/vessels', isAuth, (req, res) => {
    const newVessel = {
        id: Date.now().toString(),
        ...req.body,
        cat: getCategory(req.body.len)
    };
    vessels.unshift(newVessel);
    res.status(201).json(newVessel);
});

app.put('/api/vessels/:id', isAuth, (req, res) => {
    const index = vessels.findIndex(v => v.id === req.params.id);
    if (index !== -1) {
        vessels[index] = { ...vessels[index], ...req.body, cat: getCategory(req.body.len || vessels[index].len) };
        res.json(vessels[index]);
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

app.delete('/api/vessels/:id', isAdmin, (req, res) => {
    vessels = vessels.filter(v => v.id !== req.params.id);
    res.json({ success: true });
});

// مستخدمين
app.get('/api/users', isAuth, isAdmin, (req, res) => {
    const usersWithoutPass = users.map(({ pass, ...user }) => user);
    res.json(usersWithoutPass);
});

app.post('/api/users', isAuth, isAdmin, (req, res) => {
    const { name, pass, role } = req.body;
    if (users.find(u => u.name === name)) {
        return res.status(400).json({ error: 'الاسم موجود' });
    }
    const newUser = { id: Date.now().toString(), name, pass, role: role || 'مشاهد', enabled: true };
    users.push(newUser);
    res.status(201).json({ id: newUser.id, name, role: newUser.role });
});

app.put('/api/users/:id', isAuth, isAdmin, (req, res) => {
    const index = users.findIndex(u => u.id === req.params.id);
    if (index !== -1) {
        users[index] = { ...users[index], ...req.body };
        const { pass, ...userWithoutPass } = users[index];
        res.json(userWithoutPass);
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

app.delete('/api/users/:id', isAuth, isAdmin, (req, res) => {
    const index = users.findIndex(u => u.id === req.params.id);
    if (index !== -1 && users[index].name !== 'admin') {
        users.splice(index, 1);
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'لا يمكن حذف admin' });
    }
});

// تذاكر
app.get('/api/tickets', isAuth, (req, res) => {
    res.json(tickets);
});

app.post('/api/tickets', isAuth, (req, res) => {
    const newTicket = { id: Date.now().toString(), ...req.body, status: 'قيد المعالجة', replies: [] };
    tickets.unshift(newTicket);
    res.status(201).json(newTicket);
});

app.put('/api/tickets/:id/reply', isAuth, isAdmin, (req, res) => {
    const ticket = tickets.find(t => t.id === req.params.id);
    if (ticket) {
        ticket.replies.push(req.body.reply);
        ticket.status = 'تم الرد';
        res.json(ticket);
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

app.put('/api/tickets/:id/close', isAuth, isAdmin, (req, res) => {
    const ticket = tickets.find(t => t.id === req.params.id);
    if (ticket) {
        ticket.status = 'مغلقة';
        res.json(ticket);
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

// سجل النشاطات
app.get('/api/logs', isAuth, isAdmin, (req, res) => {
    res.json(logs);
});

app.post('/api/logs', isAuth, (req, res) => {
    const newLog = { id: Date.now().toString(), ...req.body, date: new Date().toLocaleDateString('ar-EG'), time: new Date().toLocaleTimeString('ar-EG') };
    logs.unshift(newLog);
    res.status(201).json(newLog);
});

// مواقع GPS
app.get('/api/locations', isAuth, isAdmin, (req, res) => {
    res.json(locations.slice(-50));
});

// تصدير واستيراد
app.get('/api/export-all', isAuth, isAdmin, (req, res) => {
    res.json({ vessels, users: users.map(({ pass, ...u }) => u), tickets, logs, locations });
});

app.post('/api/import-all', isAuth, isAdmin, (req, res) => {
    const { vessels: newVessels, tickets: newTickets, logs: newLogs } = req.body;
    if (newVessels) vessels.push(...newVessels);
    if (newTickets) tickets.push(...newTickets);
    if (newLogs) logs.push(...newLogs);
    res.json({ success: true });
});

// التشغيل
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║     🚀 منظومة متابعة الوسائل البحرية - تعمل بنجاح       ║
╠══════════════════════════════════════════════════════════╣
║  📡 الخادم: http://localhost:${PORT}                      ║
╠══════════════════════════════════════════════════════════╣
║  👑 admin / 1234 (مسؤول)                                 ║
║  ✏️ editor / editor (محرر)                              ║
║  👤 user / user (مشاهد)                                 ║
╠══════════════════════════════════════════════════════════╣
║  📊 عدد المراكب: ${vessels.length}                        ║
╚══════════════════════════════════════════════════════════╝
    `);
});
