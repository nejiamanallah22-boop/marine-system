const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== بيانات المستخدمين الثابتة ====================
const DEFAULT_USERS = [
    { name: 'admin', pass: '1234', role: 'مسؤول' },
    { name: 'user', pass: '1234', role: 'محرر' },
    { name: 'viewer', pass: '1234', role: 'مشاهد' }
];

let memoryVessels = [];
let memoryTickets = [];
let memoryLogs = [];
let memoryLocations = [];
let onlineUsers = new Set();

// ==================== مسار تسجيل الدخول ====================
app.post('/api/login', (req, res) => {
    const { name, pass } = req.body;
    
    if (!name || !pass) {
        return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }
    
    const user = DEFAULT_USERS.find(u => u.name === name && u.pass === pass);
    
    if (!user) {
        return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    
    res.json({ id: user.name, name: user.name, role: user.role });
});

app.post('/api/logout', (req, res) => {
    res.json({ success: true });
});

// ==================== مسارات المراكب ====================
app.get('/api/vessels', (req, res) => {
    res.json(memoryVessels);
});

app.post('/api/vessels', (req, res) => {
    const vessel = { ...req.body, _id: Date.now().toString() };
    memoryVessels.push(vessel);
    res.status(201).json(vessel);
});

app.put('/api/vessels/:id', (req, res) => {
    const index = memoryVessels.findIndex(v => v._id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'المركب غير موجود' });
    memoryVessels[index] = { ...memoryVessels[index], ...req.body };
    res.json(memoryVessels[index]);
});

app.delete('/api/vessels/:id', (req, res) => {
    const index = memoryVessels.findIndex(v => v._id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'المركب غير موجود' });
    memoryVessels.splice(index, 1);
    res.json({ success: true });
});

// ==================== مسارات المستخدمين ====================
app.get('/api/users', (req, res) => {
    const users = DEFAULT_USERS.map(u => {
        const { pass, ...rest } = u;
        return { ...rest, enabled: true, _id: u.name };
    });
    res.json(users);
});

// ==================== مسارات التذاكر ====================
app.get('/api/tickets', (req, res) => {
    res.json(memoryTickets);
});

app.post('/api/tickets', (req, res) => {
    const ticket = { ...req.body, _id: Date.now().toString() };
    memoryTickets.push(ticket);
    res.status(201).json(ticket);
});

app.put('/api/tickets/:id/reply', (req, res) => {
    const ticket = memoryTickets.find(t => t._id === req.params.id);
    if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
    ticket.replies.push(req.body.reply);
    ticket.status = 'تم الرد';
    res.json(ticket);
});

app.put('/api/tickets/:id/close', (req, res) => {
    const ticket = memoryTickets.find(t => t._id === req.params.id);
    if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
    ticket.status = 'مغلقة';
    res.json(ticket);
});

// ==================== مسارات السجلات ====================
app.get('/api/logs', (req, res) => {
    res.json(memoryLogs);
});

app.post('/api/logs', (req, res) => {
    const log = { ...req.body, _id: Date.now().toString() };
    memoryLogs.push(log);
    res.status(201).json(log);
});

// ==================== مسارات GPS ====================
app.post('/api/locations', (req, res) => {
    const location = { ...req.body, _id: Date.now().toString() };
    memoryLocations.push(location);
    res.status(201).json(location);
});

app.get('/api/locations', (req, res) => {
    res.json(memoryLocations.slice(-100));
});

// ==================== مسارات التصدير والاستيراد ====================
app.get('/api/export-all', (req, res) => {
    res.json({ 
        vessels: memoryVessels, 
        users: DEFAULT_USERS, 
        tickets: memoryTickets, 
        logs: memoryLogs, 
        locations: memoryLocations 
    });
});

app.post('/api/import-all', (req, res) => {
    const { vessels, users, tickets, logs, locations } = req.body;
    if (vessels) memoryVessels = vessels;
    if (tickets) memoryTickets = tickets;
    if (logs) memoryLogs = logs;
    if (locations) memoryLocations = locations;
    res.json({ success: true });
});

// ==================== Socket.IO ====================
io.on('connection', (socket) => {
    console.log('📡 مستخدم متصل:', socket.id);
    
    socket.on('user-connected', (data) => {
        onlineUsers.add(data.userName);
        io.emit('online-users', { users: Array.from(onlineUsers) });
    });
    
    socket.on('send-location', (data) => {
        memoryLocations.push({
            userName: data.userName,
            userRole: data.userRole,
            lat: data.lat,
            lng: data.lng,
            timestamp: new Date().toISOString(),
            _id: Date.now().toString()
        });
        
        socket.broadcast.emit('receive-location', {
            userName: data.userName,
            lat: data.lat,
            lng: data.lng,
            time: new Date().toISOString()
        });
    });
    
    socket.on('get-online-users', () => {
        socket.emit('online-users', { users: Array.from(onlineUsers) });
    });
    
    socket.on('user-disconnected', (data) => {
        onlineUsers.delete(data.userName);
        io.emit('online-users', { users: Array.from(onlineUsers) });
    });
    
    socket.on('disconnect', () => {
        console.log('📡 مستخدم غير متصل:', socket.id);
    });
});

// ==================== الملفات الثابتة ====================
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== تشغيل الخادم ====================
server.listen(PORT, '0.0.0.0', () => {
    console.log('========================================');
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log('========================================');
    console.log('🔐 بيانات تسجيل الدخول:');
    console.log('   📧 admin');
    console.log('   🔑 1234');
    console.log('========================================');
    console.log('📍 نظام تتبع GPS نشط');
    console.log('========================================');
});
