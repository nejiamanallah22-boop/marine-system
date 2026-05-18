const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== قاعدة البيانات ====================
let users = [
    { id: 1, name: 'admin', pass: '1234', role: 'مسؤول', enabled: true },
    { id: 2, name: 'editor', pass: '1234', role: 'محرر', enabled: true },
    { id: 3, name: 'viewer', pass: '1234', role: 'مشاهد', enabled: true }
];

// مراكب مع بيانات معطوبة لسجل الصيانة
let vessels = [
    { id: 1, name: "البروق 1", num: "B001", len: 11, reg: "الشمال", zone: "تونس", port: "تونس", supp: "", stat: "صالح", break: "", fDate: "", eDate: "", ref: "", cat: "البروق" },
    { id: 2, name: "خافرة معطوبة", num: "K002", len: 20, reg: "الوسط", zone: "صفاقس", port: "صفاقس", supp: "", stat: "معطب", break: "محرك محترق", fDate: "2024-05-01", eDate: "2024-06-15", ref: "REF001", cat: "خوافر" },
    { id: 3, name: "زورق صيانة", num: "Z003", len: 15, reg: "الجنوب", zone: "جربة", port: "جربة", supp: "", stat: "صيانة", break: "عطل كهربائي", fDate: "2024-05-10", eDate: "2024-05-30", ref: "REF002", cat: "زوارق مزدوجة" },
    { id: 4, name: "صقر الشمال", num: "S004", len: 10, reg: "الشمال", zone: "بنزرت", port: "بنزرت", supp: "", stat: "صالح", break: "", fDate: "", eDate: "", ref: "", cat: "صقور" }
];

let logs = [];
let tickets = [];
let nextId = 5;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'secret_key',
    resave: false,
    saveUninitialized: false
}));

// ==================== Routes ====================

// Login
app.post('/api/login', (req, res) => {
    const { name, pass } = req.body;
    const user = users.find(u => u.name === name);
    if (!user) return res.status(401).json({ error: 'اسم المستخدم غير صحيح' });
    if (!user.enabled) return res.status(401).json({ error: 'هذا المستخدم معطل' });
    if (user.pass !== pass) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userRole = user.role;
    res.json({ name: user.name, role: user.role });
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Auth middleware
function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    next();
}

// ==================== Vessels ====================
app.get('/api/vessels', requireAuth, (req, res) => {
    res.json(vessels);
});

app.post('/api/vessels', requireAuth, (req, res) => {
    const newVessel = { id: nextId++, ...req.body };
    vessels.push(newVessel);
    res.json({ success: true, message: 'تم الحفظ بنجاح' });
});

app.delete('/api/vessels/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    vessels = vessels.filter(v => v.id !== id);
    res.json({ success: true });
});

// ==================== Users ====================
app.get('/api/users', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    res.json(users.map(u => ({ id: u.id, name: u.name, role: u.role, enabled: u.enabled })));
});

app.post('/api/users', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    const { name, pass, role, enabled } = req.body;
    const newUser = { id: nextId++, name, pass, role, enabled };
    users.push(newUser);
    res.json({ success: true });
});

app.put('/api/users/:id', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    const index = users.findIndex(u => u.id === id);
    if (index !== -1) {
        users[index] = { ...users[index], ...req.body };
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

app.delete('/api/users/:id', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    users = users.filter(u => u.id !== id);
    res.json({ success: true });
});

// ==================== Logs ====================
app.get('/api/logs', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    res.json(logs);
});

app.post('/api/logs', requireAuth, (req, res) => {
    const log = { id: Date.now(), ...req.body };
    logs.unshift(log);
    res.json({ success: true });
});

// ==================== Tickets ====================
app.get('/api/tickets', requireAuth, (req, res) => {
    res.json(tickets);
});

app.post('/api/tickets', requireAuth, (req, res) => {
    const newTicket = { id: Date.now(), ...req.body, replies: [] };
    tickets.unshift(newTicket);
    res.json({ success: true });
});

app.put('/api/tickets/:id/reply', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    const id = parseInt(req.params.id);
    const ticket = tickets.find(t => t.id === id);
    if (!ticket) {
        return res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
    if (!ticket.replies) ticket.replies = [];
    ticket.replies.push(req.body.reply);
    ticket.status = 'تم الرد';
    res.json({ success: true });
});

app.put('/api/tickets/:id/close', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    const id = parseInt(req.params.id);
    const ticket = tickets.find(t => t.id === id);
    if (!ticket) {
        return res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
    ticket.status = 'مغلقة';
    res.json({ success: true });
});

// Export/Import
app.get('/api/export-all', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    res.json({ vessels, users, logs, tickets });
});

app.post('/api/import-all', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    const { vessels: newVessels, tickets: newTickets, logs: newLogs } = req.body;
    if (newVessels) vessels = newVessels;
    if (newTickets) tickets = newTickets;
    if (newLogs) logs = newLogs;
    res.json({ success: true });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 السيرفر يعمل على http://localhost:${PORT}`);
    console.log(`\n🔐 admin / 1234`);
    console.log(`📊 عدد المراكب المعطوبة: ${vessels.filter(v => v.stat === 'معطب' || v.stat === 'صيانة').length}\n`);
});
