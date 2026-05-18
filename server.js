const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = 3000;

// ==================== البيانات ====================
const users = [
    { id: 1, username: 'admin', password: '1234', role: 'admin' },
    { id: 2, username: 'user', password: '1234', role: 'user' }
];

let vessels = [
    { id: 1, name: 'البروق 1', number: 'B001', length: 11, region: 'الشمال', zone: 'تونس', status: 'صالح', damage: '', date: '', endDate: '', reference: '' },
    { id: 2, name: 'خافرة معطوبة', number: 'K002', length: 20, region: 'الوسط', zone: 'صفاقس', status: 'معطب', damage: 'محرك محترق', date: '2024-05-01', endDate: '2024-06-15', reference: 'REF001' },
    { id: 3, name: 'زورق صيانة', number: 'Z003', length: 15, region: 'الجنوب', zone: 'جربة', status: 'صيانة', damage: 'عطل كهربائي', date: '2024-05-10', endDate: '2024-05-30', reference: 'REF002' }
];

let tickets = [];
let nextId = 4;

// ==================== Middleware ====================
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'my-secret-key',
    resave: false,
    saveUninitialized: true
}));

// ==================== Routes ====================

// تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    
    if (user) {
        req.session.user = user;
        res.json({ success: true, user: { username: user.username, role: user.role } });
    } else {
        res.status(401).json({ success: false, message: 'خطأ في اسم المستخدم أو كلمة المرور' });
    }
});

// تسجيل الخروج
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// التحقق من الجلسة
app.get('/api/check-session', (req, res) => {
    if (req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});

// جلب جميع المراكب
app.get('/api/vessels', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    res.json(vessels);
});

// إضافة مركب جديد
app.post('/api/vessels', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    const newVessel = { id: nextId++, ...req.body };
    vessels.push(newVessel);
    res.json({ success: true, vessel: newVessel });
});

// تحديث مركب
app.put('/api/vessels/:id', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    if (index !== -1) {
        vessels[index] = { ...vessels[index], ...req.body };
        res.json({ success: true, vessel: vessels[index] });
    } else {
        res.status(404).json({ error: 'المركب غير موجود' });
    }
});

// حذف مركب
app.delete('/api/vessels/:id', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    vessels = vessels.filter(v => v.id !== id);
    res.json({ success: true });
});

// جلب جميع التذاكر
app.get('/api/tickets', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    res.json(tickets);
});

// إضافة تذكرة جديدة
app.post('/api/tickets', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    const newTicket = { id: Date.now(), ...req.body, replies: [] };
    tickets.unshift(newTicket);
    res.json({ success: true, ticket: newTicket });
});

// الرد على تذكرة
app.post('/api/tickets/:id/reply', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    const ticket = tickets.find(t => t.id === id);
    if (ticket) {
        if (!ticket.replies) ticket.replies = [];
        ticket.replies.push({
            adminName: req.session.user.username,
            reply: req.body.reply,
            date: new Date().toLocaleDateString('ar-EG'),
            time: new Date().toLocaleTimeString('ar-EG')
        });
        ticket.status = 'تم الرد';
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
});

// إغلاق تذكرة
app.post('/api/tickets/:id/close', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    const ticket = tickets.find(t => t.id === id);
    if (ticket) {
        ticket.status = 'مغلقة';
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
});

// جلب سجل النشاطات
app.get('/api/logs', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    res.json([]);
});

// إضافة سجل نشاط
app.post('/api/logs', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    res.json({ success: true });
});

// جلب المستخدمين
app.get('/api/users', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    res.json(users.map(u => ({ id: u.id, name: u.username, role: u.role, enabled: true })));
});

// إضافة مستخدم
app.post('/api/users', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    res.json({ success: true });
});

// تحديث مستخدم
app.put('/api/users/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    res.json({ success: true });
});

// حذف مستخدم
app.delete('/api/users/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    res.json({ success: true });
});

// تصدير البيانات
app.get('/api/export-all', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    res.json({ vessels, tickets });
});

// استيراد البيانات
app.post('/api/import-all', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const { vessels: newVessels, tickets: newTickets } = req.body;
    if (newVessels) vessels = newVessels;
    if (newTickets) tickets = newTickets;
    res.json({ success: true });
});

// ==================== تشغيل السيرفر ====================
app.listen(PORT, () => {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   🚀 السيرفر يعمل بنجاح! 🚀          ║');
    console.log('╚════════════════════════════════════════╝\n');
    console.log(`📡 الرابط: http://localhost:${PORT}`);
    console.log('\n🔐 بيانات الدخول:');
    console.log('   👑 admin / 1234 (مدير كامل الصلاحيات)');
    console.log('   👤 user / 1234 (مستخدم عادي)\n');
    console.log(`📊 عدد المراكب: ${vessels.length}`);
    console.log(`🛠️  مراكب معطوبة: ${vessels.filter(v => v.status === 'معطب').length}`);
    console.log(`🔧 مراكب تحت صيانة: ${vessels.filter(v => v.status === 'صيانة').length}`);
    console.log('\n✅ النظام جاهز للاستخدام!\n');
});
