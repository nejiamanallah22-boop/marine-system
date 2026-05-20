const express = require('express');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== المستخدمين (بتنسيق موحد) ====================
let users = [
    { id: 1, name: 'admin', pass: '1234', role: 'مسؤول', enabled: true },
    { id: 2, name: 'editor', pass: '1234', role: 'محرر', enabled: true },
    { id: 3, name: 'viewer', pass: '1234', role: 'مشاهد', enabled: true }
];

// ==================== المراكب ====================
let vessels = [
    { id: 1, name: 'البروق 1', num: 'B001', len: 11, reg: 'الشمال', zone: 'تونس', port: 'تونس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'البروق' },
    { id: 2, name: 'خافرة معطوبة', num: 'K002', len: 20, reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: '', stat: 'معطب', break: 'محرك محترق', fDate: '2024-05-01', eDate: '2024-06-15', ref: 'REF001', cat: 'خوافر' }
];

let tickets = [];
let userSessions = [];
let nextId = 3;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ==================== تسجيل الدخول (متوافق مع الواجهة) ====================
app.post('/api/login', (req, res) => {
    const { name, pass } = req.body;
    
    console.log(`📝 محاولة دخول: ${name}`);
    
    const user = users.find(u => u.name === name && u.pass === pass);
    
    if (!user) {
        console.log(`❌ فشل: ${name} غير موجود`);
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    if (!user.enabled) {
        console.log(`❌ فشل: ${name} معطل`);
        return res.status(401).json({ error: 'هذا الحساب معطل' });
    }
    
    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userRole = user.role;
    
    console.log(`✅ نجاح: ${name} (${user.role})`);
    
    // إرجاع البيانات بنفس تنسيق الواجهة
    res.json({ 
        success: true, 
        name: user.name, 
        role: user.role 
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// ==================== المراكب ====================
app.get('/api/vessels', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    res.json(vessels);
});

app.post('/api/vessels', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    const newVessel = { id: nextId++, ...req.body };
    vessels.push(newVessel);
    res.json({ success: true, message: 'تم الحفظ' });
});

app.put('/api/vessels/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    if (index !== -1) {
        vessels[index] = { ...vessels[index], ...req.body };
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

app.delete('/api/vessels/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    vessels = vessels.filter(v => v.id !== id);
    res.json({ success: true });
});

// ==================== المستخدمين ====================
app.get('/api/users', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    res.json(users.map(u => ({ id: u.id, name: u.name, role: u.role, enabled: u.enabled })));
});

app.post('/api/users', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    const { name, pass, role, enabled } = req.body;
    users.push({ id: nextId++, name, pass, role, enabled });
    res.json({ success: true });
});

app.put('/api/users/:id', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    const id = parseInt(req.params.id);
    const index = users.findIndex(u => u.id === id);
    if (index !== -1) {
        users[index] = { ...users[index], ...req.body };
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

app.delete('/api/users/:id', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    const id = parseInt(req.params.id);
    users = users.filter(u => u.id !== id);
    res.json({ success: true });
});

// ==================== التذاكر ====================
app.get('/api/tickets', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    res.json(tickets);
});

app.post('/api/tickets', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    tickets.unshift({ id: Date.now(), ...req.body, replies: [] });
    res.json({ success: true });
});

app.put('/api/tickets/:id/reply', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    const id = parseInt(req.params.id);
    const ticket = tickets.find(t => t.id === id);
    if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
    if (!ticket.replies) ticket.replies = [];
    ticket.replies.push(req.body.reply);
    ticket.status = 'تم الرد';
    res.json({ success: true });
});

app.put('/api/tickets/:id/close', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    const id = parseInt(req.params.id);
    const ticket = tickets.find(t => t.id === id);
    if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
    ticket.status = 'مغلقة';
    res.json({ success: true });
});

// ==================== جلسات المستخدمين ====================
app.get('/api/sessions', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    res.json(userSessions.filter(s => s.username === req.session.userName));
});

app.get('/api/sessions/map', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    res.json(userSessions);
});

app.get('/api/logs', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    res.json(userSessions);
});

app.post('/api/logs', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    res.json({ success: true });
});

// ==================== تصدير واستيراد ====================
app.get('/api/export-all', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    res.json({ vessels, users: users.map(u => ({ id: u.id, name: u.name, role: u.role, enabled: u.enabled })), tickets, sessions: userSessions });
});

app.post('/api/import-all', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    if (req.body.vessels) vessels = req.body.vessels;
    if (req.body.tickets) tickets = req.body.tickets;
    res.json({ success: true });
});

app.get('/api/test', (req, res) => {
    res.json({ status: 'OK', message: 'السيرفر يعمل' });
});

// ==================== تشغيل السيرفر ====================
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════╗
║     🚀 السيرفر يعمل بنجاح! 🚀                   ║
╚════════════════════════════════════════════════╝

📡 http://localhost:${PORT}

🔐 بيانات الدخول:
   👑 admin / 1234 (مسؤول)
   ✏️ editor / 1234 (محرر)
   👁️ viewer / 1234 (مشاهد)

✅ النظام جاهز للاستخدام!
`);
});