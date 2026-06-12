const express = require('express');
const session = require('express-session');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// بيانات أولية
let vessels = [
    { id: '1', name: 'البروق 1', num: 'B001', len: 11, reg: 'الشمال', zone: 'تونس', port: 'تونس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'البروق' },
    { id: '2', name: 'صقر 2', num: 'S002', len: 10, reg: 'الساحل', zone: 'سوسة', port: 'سوسة', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'صقور' },
    { id: '3', name: 'خافرة 3', num: 'K003', len: 20, reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: '', stat: 'معطب', break: 'عطل في المحرك', fDate: '2024-01-15', eDate: '2024-03-15', ref: 'REF001', cat: 'خوافر' },
    { id: '4', name: 'طوافة 4', num: 'T004', len: 35, reg: 'الجنوب', zone: 'جرجيس', port: 'جرجيس', supp: '', stat: 'صيانة', break: 'أعطال كهربائية', fDate: '2024-02-01', eDate: '2024-03-01', ref: 'REF002', cat: 'طوافات' },
    { id: '5', name: 'زورق سريع 5', num: 'Z005', len: 15, reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: 'قاعدة بنزرت', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'زوارق مزدوجة' },
    { id: '6', name: 'البروق 6', num: 'B006', len: 11, reg: 'الساحل', zone: 'المنستير', port: 'المنستير', supp: '', stat: 'صيانة', break: 'عطل في نظام الملاحة', fDate: '2024-02-10', eDate: '2024-02-25', ref: 'REF003', cat: 'البروق' },
    { id: '7', name: 'صقر 7', num: 'S007', len: 9, reg: 'الجنوب', zone: 'جربة', port: 'جربة', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'صقور' }
];

let users = [
    { id: '1', name: 'admin', pass: '1234', role: 'مسؤول', enabled: true },
    { id: '2', name: 'user', pass: 'user', role: 'مشاهد', enabled: true }
];

let tickets = [];
let logs = [];
let locations = [];

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Auth middleware
function isAuth(req, res, next) {
    if (req.session.userId) return next();
    res.status(401).json({ error: 'غير مصرح' });
}

function isAdmin(req, res, next) {
    if (req.session.userRole === 'مسؤول') return next();
    res.status(403).json({ error: 'غير مسموح' });
}

// Socket.IO
io.on('connection', (socket) => {
    console.log('🟢 مستخدم متصل:', socket.id);
    socket.on('send-location', (data) => {
        locations.push({ ...data, timestamp: new Date() });
        io.emit('receive-location', data);
    });
    socket.on('disconnect', () => console.log('🔴 مستخدم انقطع:', socket.id));
});

// ==================== API Routes ====================

// Login
app.post('/api/login', (req, res) => {
    const { name, pass } = req.body;
    const user = users.find(u => u.name === name && u.pass === pass && u.enabled);
    if (!user) return res.status(401).json({ error: 'بيانات غير صحيحة' });
    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.userName = user.name;
    res.json({ id: user.id, name: user.name, role: user.role });
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

// Vessels
app.get('/api/vessels', isAuth, (req, res) => res.json(vessels));

app.post('/api/vessels', isAuth, (req, res) => {
    const newVessel = { id: Date.now().toString(), ...req.body };
    vessels.unshift(newVessel);
    res.status(201).json(newVessel);
});

app.put('/api/vessels/:id', isAuth, (req, res) => {
    const index = vessels.findIndex(v => v.id === req.params.id);
    if (index !== -1) {
        vessels[index] = { ...vessels[index], ...req.body };
        res.json(vessels[index]);
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

app.delete('/api/vessels/:id', isAdmin, (req, res) => {
    vessels = vessels.filter(v => v.id !== req.params.id);
    res.json({ success: true });
});

// Users
app.get('/api/users', isAuth, isAdmin, (req, res) => {
    res.json(users.map(({ pass, ...u }) => u));
});

app.post('/api/users', isAuth, isAdmin, (req, res) => {
    const { name, pass, role } = req.body;
    if (users.find(u => u.name === name)) {
        return res.status(400).json({ error: 'الاسم موجود' });
    }
    const newUser = { id: Date.now().toString(), name, pass, role, enabled: true };
    users.push(newUser);
    res.status(201).json({ id: newUser.id, name, role });
});

app.put('/api/users/:id', isAuth, isAdmin, (req, res) => {
    const index = users.findIndex(u => u.id === req.params.id);
    if (index !== -1) {
        users[index] = { ...users[index], ...req.body };
        res.json(users[index]);
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

// Tickets
app.get('/api/tickets', isAuth, (req, res) => res.json(tickets));

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

// Logs
app.get('/api/logs', isAuth, isAdmin, (req, res) => res.json(logs));

app.post('/api/logs', isAuth, (req, res) => {
    const newLog = { id: Date.now().toString(), ...req.body, date: new Date().toLocaleDateString('ar-EG'), time: new Date().toLocaleTimeString('ar-EG') };
    logs.unshift(newLog);
    res.status(201).json(newLog);
});

// Locations
app.get('/api/locations', isAuth, isAdmin, (req, res) => res.json(locations.slice(-50)));

// Export/Import
app.get('/api/export-all', isAuth, isAdmin, (req, res) => {
    res.json({ vessels, users: users.map(({ pass, ...u }) => u), tickets, logs, locations });
});

app.post('/api/import-all', isAuth, isAdmin, (req, res) => {
    const { vessels: v, tickets: t, logs: l } = req.body;
    if (v) vessels.push(...v);
    if (t) tickets.push(...t);
    if (l) logs.push(...l);
    res.json({ success: true });
});

// Serve HTML
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
server.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`========================================`);
    console.log(`📝 Login credentials:`);
    console.log(`   👑 admin / 1234 (Admin)`);
    console.log(`   👤 user / user (Viewer)`);
    console.log(`========================================\n`);
});
