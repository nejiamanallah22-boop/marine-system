const express = require('express');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// بيانات بسيطة
const users = [
    { id: 1, username: 'admin', password: '1234', role: 'admin' }
];

let vessels = [
    { id: 1, name: 'البروق 1', number: 'B001', length: 11, region: 'الشمال', status: 'صالح' },
    { id: 2, name: 'خافرة معطوبة', number: 'K002', length: 20, region: 'الوسط', status: 'معطب' }
];

let tickets = [];

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'simple_secret',
    resave: false,
    saveUninitialized: true
}));

// تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    console.log('Login attempt:', username, password);
    
    const user = users.find(u => u.username === username && u.password === password);
    
    if (user) {
        req.session.user = user;
        console.log('Login success:', username);
        res.json({ success: true, name: user.username, role: user.role });
    } else {
        console.log('Login failed:', username);
        res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
});

// تسجيل الخروج
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// جلب المراكب
app.get('/api/vessels', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    res.json(vessels);
});

// إضافة مركب
app.post('/api/vessels', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    const newVessel = { id: Date.now(), ...req.body };
    vessels.push(newVessel);
    res.json({ success: true });
});

// حذف مركب
app.delete('/api/vessels/:id', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    vessels = vessels.filter(v => v.id !== id);
    res.json({ success: true });
});

// جلب التذاكر
app.get('/api/tickets', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    res.json(tickets);
});

// إضافة تذكرة
app.post('/api/tickets', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    const newTicket = { id: Date.now(), ...req.body, replies: [] };
    tickets.unshift(newTicket);
    res.json({ success: true });
});

// الرد على تذكرة
app.post('/api/tickets/:id/reply', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
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
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    const ticket = tickets.find(t => t.id === id);
    if (ticket) {
        ticket.status = 'مغلقة';
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

// جلب المستخدمين
app.get('/api/users', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    res.json([{ id: 1, name: 'admin', role: 'admin', enabled: true }]);
});

// جلسات المستخدمين
app.get('/api/sessions', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    res.json([]);
});

app.get('/api/sessions/map', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    res.json([]);
});

app.get('/api/logs', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    res.json([]);
});

app.post('/api/logs', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    res.json({ success: true });
});

app.get('/api/export-all', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    res.json({ vessels, tickets });
});

app.post('/api/import-all', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'غير مصرح' });
    res.json({ success: true });
});

// اختبار
app.get('/api/test', (req, res) => {
    res.json({ status: 'OK', message: 'Server is running' });
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   🚀 SERVER RUNNING! 🚀                ║
╚════════════════════════════════════════╝

📡 http://localhost:${PORT}
🔑 admin / 1234

✅ Ready!
`);
});