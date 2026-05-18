const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = 3000;

// بيانات بسيطة
const users = [
    { id: 1, name: 'admin', password: '1234', role: 'admin' }
];

// مراكب - فيها مراكب معطوبة لسجل الصيانة
let vessels = [
    { id: 1, name: 'البروق 1', num: 'B001', len: 11, reg: 'الشمال', zone: 'تونس', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '' },
    { id: 2, name: 'خافرة معطوبة', num: 'K002', len: 20, reg: 'الوسط', zone: 'صفاقس', stat: 'معطب', break: 'محرك محترق', fDate: '2024-05-01', eDate: '2024-06-15', ref: 'REF001' },
    { id: 3, name: 'زورق صيانة', num: 'Z003', len: 15, reg: 'الجنوب', zone: 'جربة', stat: 'صيانة', break: 'عطل كهربائي', fDate: '2024-05-10', eDate: '2024-05-30', ref: 'REF002' }
];

let tickets = [];

// وسط
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'key',
    resave: false,
    saveUninitialized: true
}));

// دوال مساعدة
function isAuth(req) {
    return req.session && req.session.userId;
}

// ==================== المسارات ====================

// تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { name, pass } = req.body;
    console.log('محاولة دخول:', name, pass);
    
    const user = users.find(u => u.name === name && u.password === pass);
    
    if (user) {
        req.session.userId = user.id;
        req.session.userName = user.name;
        req.session.userRole = user.role;
        console.log('دخول ناجح:', name);
        res.json({ name: user.name, role: user.role });
    } else {
        console.log('دخول فاشل:', name);
        res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
});

// تسجيل خروج
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// جلب المراكب
app.get('/api/vessels', (req, res) => {
    if (!isAuth(req)) return res.status(401).json({ error: 'غير مصرح' });
    console.log('جاري إرسال المراكب:', vessels.length);
    res.json(vessels);
});

// إضافة مركب
app.post('/api/vessels', (req, res) => {
    if (!isAuth(req)) return res.status(401).json({ error: 'غير مصرح' });
    const newVessel = { id: Date.now(), ...req.body };
    vessels.push(newVessel);
    console.log('تم إضافة مركب:', newVessel.name);
    res.json({ success: true, message: 'تم الحفظ بنجاح' });
});

// حذف مركب
app.delete('/api/vessels/:id', (req, res) => {
    if (!isAuth(req)) return res.status(401).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    vessels = vessels.filter(v => v.id !== id);
    res.json({ success: true });
});

// جلب التذاكر
app.get('/api/tickets', (req, res) => {
    if (!isAuth(req)) return res.status(401).json({ error: 'غير مصرح' });
    res.json(tickets);
});

// إضافة تذكرة
app.post('/api/tickets', (req, res) => {
    if (!isAuth(req)) return res.status(401).json({ error: 'غير مصرح' });
    const newTicket = { id: Date.now(), ...req.body, replies: [] };
    tickets.unshift(newTicket);
    res.json({ success: true });
});

// الرد على تذكرة
app.post('/api/tickets/:id/reply', (req, res) => {
    if (!isAuth(req)) return res.status(401).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    const ticket = tickets.find(t => t.id === id);
    if (ticket) {
        if (!ticket.replies) ticket.replies = [];
        ticket.replies.push(req.body.reply);
        ticket.status = 'تم الرد';
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

// إغلاق تذكرة
app.post('/api/tickets/:id/close', (req, res) => {
    if (!isAuth(req)) return res.status(401).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    const ticket = tickets.find(t => t.id === id);
    if (ticket) {
        ticket.status = 'مغلقة';
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

// مستخدمين
app.get('/api/users', (req, res) => {
    if (!isAuth(req) || req.session.userRole !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    res.json(users.map(u => ({ id: u.id, name: u.name, role: u.role, enabled: true })));
});

app.post('/api/users', (req, res) => {
    if (!isAuth(req) || req.session.userRole !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    res.json({ success: true });
});

app.put('/api/users/:id', (req, res) => {
    if (!isAuth(req) || req.session.userRole !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    res.json({ success: true });
});

app.delete('/api/users/:id', (req, res) => {
    if (!isAuth(req) || req.session.userRole !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    res.json({ success: true });
});

// سجل النشاطات
app.get('/api/logs', (req, res) => {
    if (!isAuth(req) || req.session.userRole !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    res.json([]);
});

app.post('/api/logs', (req, res) => {
    if (!isAuth(req)) return res.status(401).json({ error: 'غير مصرح' });
    res.json({ success: true });
});

// تصدير واستيراد
app.get('/api/export-all', (req, res) => {
    if (!isAuth(req) || req.session.userRole !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    res.json({ vessels, tickets });
});

app.post('/api/import-all', (req, res) => {
    if (!isAuth(req) || req.session.userRole !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    if (req.body.vessels) vessels = req.body.vessels;
    if (req.body.tickets) tickets = req.body.tickets;
    res.json({ success: true });
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('🚀 السيرفر يعمل!');
    console.log('========================================');
    console.log(`📡 http://localhost:${PORT}`);
    console.log('🔐 admin / 1234');
    console.log('========================================\n');
});
