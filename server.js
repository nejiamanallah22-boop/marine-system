const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== قاعدة بيانات بسيطة في الذاكرة ====================
let users = [
    { id: 1, name: 'admin', pass: '1234', role: 'مسؤول', enabled: true },
    { id: 2, name: 'editor', pass: '1234', role: 'محرر', enabled: true },
    { id: 3, name: 'viewer', pass: '1234', role: 'مشاهد', enabled: true }
];

let vessels = [
    { id: 1, name: "البروق 1", num: "B001", len: 11, reg: "الشمال", zone: "تونس", port: "تونس", supp: "", stat: "صالح", break: "", fDate: "", eDate: "", ref: "", cat: "البروق" },
    { id: 2, name: "صقر 1", num: "S001", len: 10, reg: "الساحل", zone: "سوسة", port: "سوسة", supp: "", stat: "صالح", break: "", fDate: "", eDate: "", ref: "", cat: "صقور" },
    { id: 3, name: "خافرة 1", num: "K001", len: 20, reg: "الوسط", zone: "صفاقس", port: "صفاقس", supp: "", stat: "معطب", break: "محرك", fDate: "2024-03-01", eDate: "2024-04-01", ref: "REF001", cat: "خوافر" },
    { id: 4, name: "زورق 1", num: "Z001", len: 15, reg: "الجنوب", zone: "جربة", port: "جربة", supp: "", stat: "صيانة", break: "كهرباء", fDate: "2024-02-15", eDate: "2024-03-15", ref: "REF002", cat: "زوارق مزدوجة" },
    { id: 5, name: "طوافة 1", num: "T001", len: 35, reg: "الشمال", zone: "بنزرت", port: "بنزرت", supp: "", stat: "صالح", break: "", fDate: "", eDate: "", ref: "", cat: "طوافات" }
];

let logs = [];
let tickets = [];
let nextId = 6;

// ==================== Middleware ====================
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: process.env.SESSION_SECRET || 'marine_fleet_secret_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ==================== Routes ====================

app.post('/api/login', (req, res) => {
    const { name, pass } = req.body;
    const user = users.find(u => u.name === name);
    
    if (!user) return res.status(401).json({ error: 'اسم المستخدم غير صحيح' });
    if (!user.enabled) return res.status(401).json({ error: 'هذا المستخدم معطل' });
    if (user.pass !== pass) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
    
    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userRole = user.role;
    
    res.json({ name: user.name, role: user.role, id: user.id });
});

app.post('/api/logout', (req, res) => {
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

function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    next();
}

// Vessels
app.get('/api/vessels', requireAuth, (req, res) => {
    res.json(vessels);
});

app.post('/api/vessels', requireAuth, (req, res) => {
    const newVessel = { id: nextId++, ...req.body };
    vessels.push(newVessel);
    res.status(201).json(newVessel);
});

app.put('/api/vessels/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    if (index !== -1) {
        vessels[index] = { ...vessels[index], ...req.body };
        res.json(vessels[index]);
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

app.delete('/api/vessels/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    vessels = vessels.filter(v => v.id !== id);
    res.json({ success: true });
});

// Users
app.get('/api/users', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    const usersWithoutPass = users.map(u => ({ id: u.id, name: u.name, role: u.role, enabled: u.enabled }));
    res.json(usersWithoutPass);
});

app.post('/api/users', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    const { name, pass, role, enabled } = req.body;
    const newUser = { id: nextId++, name, pass, role, enabled };
    users.push(newUser);
    res.status(201).json({ id: newUser.id, name: newUser.name, role: newUser.role, enabled: newUser.enabled });
});

app.put('/api/users/:id', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    const index = users.findIndex(u => u.id === id);
    if (index !== -1) {
        users[index] = { ...users[index], ...req.body };
        res.json({ id: users[index].id, name: users[index].name, role: users[index].role, enabled: users[index].enabled });
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

// Logs
app.get('/api/logs', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    res.json(logs);
});

app.post('/api/logs', requireAuth, (req, res) => {
    const log = { id: Date.now(), ...req.body };
    logs.unshift(log);
    if (logs.length > 500) logs = logs.slice(0, 500);
    res.status(201).json(log);
});

// Tickets
app.get('/api/tickets', requireAuth, (req, res) => {
    res.json(tickets);
});

app.post('/api/tickets', requireAuth, (req, res) => {
    const newTicket = { id: Date.now(), ...req.body };
    tickets.unshift(newTicket);
    res.status(201).json(newTicket);
});

app.put('/api/tickets/:id/reply', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    const ticket = tickets.find(t => t.id === id);
    if (ticket) {
        if (!ticket.replies) ticket.replies = [];
        ticket.replies.push(req.body.reply);
        ticket.status = 'تم الرد';
        res.json(ticket);
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

app.put('/api/tickets/:id/close', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    const ticket = tickets.find(t => t.id === id);
    if (ticket) {
        ticket.status = 'مغلقة';
        res.json(ticket);
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

// Export/Import
app.get('/api/export-all', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    res.json({ vessels, users: users.map(u => ({ id: u.id, name: u.name, role: u.role, enabled: u.enabled })), logs, tickets });
});

app.post('/api/import-all', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    const { vessels: newVessels, tickets: newTickets, logs: newLogs } = req.body;
    if (newVessels) vessels = newVessels;
    if (newTickets) tickets = newTickets;
    if (newLogs) logs = newLogs;
    res.json({ success: true });
});

// Serve HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
