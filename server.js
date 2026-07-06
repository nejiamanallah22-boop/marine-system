const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
const PORT = process.env.PORT || 3000;

// ==================== Middleware ====================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== بيانات المستخدمين ====================
// ✅ admin / 1234
const DEFAULT_USERS = [
    { name: 'admin', pass: '1234', role: 'مسؤول', enabled: true },
    { name: 'user', pass: '1234', role: 'محرر', enabled: true },
    { name: 'viewer', pass: '1234', role: 'مشاهد', enabled: true }
];

// ==================== بيانات المراكب ====================
let vessels = [
    { _id: '1', name: 'المركب 1', num: 'M001', len: 12, reg: 'الشمال', zone: 'تونس', port: 'تونس', supp: 'قاعدة الشمال', stat: 'صالح', break: '', fDate: '2024-01-01', eDate: '2024-12-31', ref: 'REF001', cat: 'صقور' },
    { _id: '2', name: 'المركب 2', num: 'M002', len: 8, reg: 'الساحل', zone: 'سوسة', port: 'سوسة', supp: 'قاعدة الساحل', stat: 'صيانة', break: 'محرك', fDate: '2024-01-15', eDate: '2024-02-15', ref: 'REF002', cat: 'البروق' },
    { _id: '3', name: 'المركب 3', num: 'M003', len: 15, reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: 'قاعدة الوسط', stat: 'معطب', break: 'هيكل', fDate: '2024-01-20', eDate: '', ref: 'REF003', cat: 'خوافر' }
];

let tickets = [];
let logs = [];
let locations = [];
let onlineUsers = new Set();

// ==================== دوال مساعدة ====================
function getCurrentDate() {
    const now = new Date();
    return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
}

function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

function getCat(len) {
    let n = parseFloat(len);
    if (n === 11) return "البروق";
    if (n >= 8 && n <= 12) return "صقور";
    if (n > 12 && n <= 25) return "خوافر";
    if (n >= 30) return "طوافات";
    return "زوارق مزدوجة";
}

// ==================== مسار تسجيل الدخول ====================
app.post('/api/login', (req, res) => {
    console.log('📝 محاولة تسجيل دخول:', req.body);
    const { name, pass } = req.body;
    
    if (!name || !pass) {
        return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }
    
    const user = DEFAULT_USERS.find(u => u.name === name && u.pass === pass && u.enabled === true);
    
    if (!user) {
        console.log('❌ فشل تسجيل الدخول:', name);
        return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    
    console.log('✅ تسجيل دخول ناجح:', name);
    res.json({ 
        id: user.name, 
        name: user.name, 
        role: user.role,
        token: 'fake-token-' + Date.now()
    });
});

// ==================== مسارات المراكب ====================
app.get('/api/vessels', (req, res) => {
    console.log('📊 جلب المراكب:', vessels.length);
    res.json(vessels);
});

app.post('/api/vessels', (req, res) => {
    console.log('➕ إضافة مركب:', req.body.name);
    const vessel = { 
        ...req.body, 
        _id: Date.now().toString(),
        cat: req.body.cat || getCat(req.body.len)
    };
    vessels.push(vessel);
    io.emit('vessel-added', vessel);
    res.status(201).json(vessel);
});

app.put('/api/vessels/:id', (req, res) => {
    const index = vessels.findIndex(v => v._id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'المركب غير موجود' });
    vessels[index] = { ...vessels[index], ...req.body };
    console.log('✏️ تعديل مركب:', vessels[index].name);
    io.emit('vessel-updated', vessels[index]);
    res.json(vessels[index]);
});

app.delete('/api/vessels/:id', (req, res) => {
    const index = vessels.findIndex(v => v._id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'المركب غير موجود' });
    const name = vessels[index].name;
    vessels.splice(index, 1);
    console.log('🗑️ حذف مركب:', name);
    io.emit('vessel-deleted', { id: req.params.id });
    res.json({ success: true });
});

// ==================== مسارات المستخدمين ====================
app.get('/api/users', (req, res) => {
    const users = DEFAULT_USERS.map(u => {
        const { pass, ...rest } = u;
        return { ...rest, _id: u.name };
    });
    console.log('👥 جلب المستخدمين:', users.length);
    res.json(users);
});

app.post('/api/users', (req, res) => {
    const { name, pass, role } = req.body;
    if (DEFAULT_USERS.find(u => u.name === name)) {
        return res.status(400).json({ error: 'اسم المستخدم موجود' });
    }
    const user = { name, pass, role, enabled: true };
    DEFAULT_USERS.push(user);
    res.status(201).json(user);
});

app.put('/api/users/:id', (req, res) => {
    const index = DEFAULT_USERS.findIndex(u => u.name === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'المستخدم غير موجود' });
    DEFAULT_USERS[index] = { ...DEFAULT_USERS[index], ...req.body };
    const { pass, ...rest } = DEFAULT_USERS[index];
    res.json(rest);
});

app.delete('/api/users/:id', (req, res) => {
    const index = DEFAULT_USERS.findIndex(u => u.name === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'المستخدم غير موجود' });
    DEFAULT_USERS.splice(index, 1);
    res.json({ success: true });
});

// ==================== مسارات التذاكر ====================
app.get('/api/tickets', (req, res) => {
    console.log('📋 جلب التذاكر:', tickets.length);
    res.json(tickets);
});

app.post('/api/tickets', (req, res) => {
    const ticket = { 
        ...req.body, 
        _id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        replies: []
    };
    tickets.push(ticket);
    res.status(201).json(ticket);
});

app.put('/api/tickets/:id/reply', (req, res) => {
    const ticket = tickets.find(t => t._id === req.params.id);
    if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
    if (!ticket.replies) ticket.replies = [];
    ticket.replies.push(req.body.reply);
    ticket.status = 'تم الرد';
    res.json(ticket);
});

app.put('/api/tickets/:id/close', (req, res) => {
    const ticket = tickets.find(t => t._id === req.params.id);
    if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
    ticket.status = 'مغلقة';
    res.json(ticket);
});

// ==================== مسارات السجلات ====================
app.get('/api/logs', (req, res) => {
    console.log('📜 جلب السجلات:', logs.length);
    res.json(logs);
});

app.post('/api/logs', (req, res) => {
    const log = { ...req.body, _id: Date.now().toString() };
    logs.push(log);
    if (logs.length > 1000) logs = logs.slice(-1000);
    res.status(201).json(log);
});

// ==================== مسارات GPS ====================
app.post('/api/locations', (req, res) => {
    const location = { 
        ...req.body, 
        _id: Date.now().toString(),
        timestamp: new Date().toISOString()
    };
    locations.push(location);
    if (locations.length > 10000) locations = locations.slice(-10000);
    res.status(201).json(location);
});

app.get('/api/locations', (req, res) => {
    console.log('📍 جلب المواقع:', locations.length);
    res.json(locations.slice(-100));
});

// ==================== التصدير والاستيراد ====================
app.get('/api/export-all', (req, res) => {
    res.json({ 
        vessels, 
        users: DEFAULT_USERS, 
        tickets, 
        logs, 
        locations 
    });
});

app.post('/api/import-all', (req, res) => {
    const { vessels: newVessels, users: newUsers, tickets: newTickets, logs: newLogs, locations: newLocations } = req.body;
    if (newVessels) vessels = newVessels;
    if (newUsers) { DEFAULT_USERS.length = 0; DEFAULT_USERS.push(...newUsers); }
    if (newTickets) tickets = newTickets;
    if (newLogs) logs = newLogs;
    if (newLocations) locations = newLocations;
    res.json({ success: true });
});

// ==================== Socket.IO ====================
io.on('connection', (socket) => {
    console.log('📡 مستخدم متصل:', socket.id);
    
    socket.on('user-connected', (data) => {
        if (data && data.userName) {
            onlineUsers.add(data.userName);
            io.emit('online-users', { users: Array.from(onlineUsers) });
            console.log('👤', data.userName, 'متصل');
        }
    });
    
    socket.on('send-location', (data) => {
        if (data && data.userName && data.lat && data.lng) {
            const locationData = {
                userName: data.userName,
                userRole: data.userRole || 'مستخدم',
                lat: data.lat,
                lng: data.lng,
                timestamp: new Date().toISOString()
            };
            locations.push(locationData);
            socket.broadcast.emit('receive-location', {
                userName: data.userName,
                lat: data.lat,
                lng: data.lng,
                time: new Date().toISOString()
            });
            console.log('📍 موقع من', data.userName, ':', data.lat, ',', data.lng);
        }
    });
    
    socket.on('get-online-users', () => {
        socket.emit('online-users', { users: Array.from(onlineUsers) });
    });
    
    socket.on('user-disconnected', (data) => {
        if (data && data.userName) {
            onlineUsers.delete(data.userName);
            io.emit('online-users', { users: Array.from(onlineUsers) });
            console.log('👤', data.userName, 'غير متصل');
        }
    });
    
    socket.on('disconnect', () => {
        console.log('📡 مستخدم غير متصل:', socket.id);
    });
});

// ==================== الملفات الثابتة ====================
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    const paths = [
        path.join(__dirname, 'index.html'),
        path.join(__dirname, 'public', 'index.html')
    ];
    
    for (const p of paths) {
        if (fs.existsSync(p)) {
            console.log('✅ تقديم index.html من:', p);
            return res.sendFile(p);
        }
    }
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>منظومة الوسائل البحرية</title></head>
        <body style="font-family:Arial;text-align:center;padding:50px;direction:rtl;">
            <h1 style="color:#2e7d32;">⚓ منظومة الوسائل البحرية</h1>
            <p>جاري تحميل التطبيق...</p>
            <p style="color:#999;font-size:14px;">يرجى التأكد من وجود ملف index.html</p>
        </body>
        </html>
    `);
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
    console.log(`📊 عدد المراكب: ${vessels.length}`);
    console.log(`👥 عدد المستخدمين: ${DEFAULT_USERS.length}`);
    console.log(`📋 عدد التذاكر: ${tickets.length}`);
    console.log(`📍 عدد المواقع: ${locations.length}`);
    console.log('========================================');
    console.log('📍 نظام تتبع GPS نشط');
    console.log('💡 الموقع الافتراضي: تونس العاصمة (36.8065, 10.1815)');
    console.log('========================================');
});
