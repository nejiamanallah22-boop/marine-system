const express = require('express');
const session = require('express-session');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 3000;

// ==================== البيانات الأولية ====================
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
let activeSockets = new Map();

// ==================== Middleware ====================
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'marine_secret_key_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: false
    }
}));

// ==================== Middleware التحقق ====================
function isAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    res.status(401).json({ error: 'غير مصرح، يرجى تسجيل الدخول' });
}

function isAdmin(req, res, next) {
    if (req.session && req.session.userRole === 'مسؤول') {
        return next();
    }
    res.status(403).json({ error: 'غير مسموح - هذه الخاصية للمسؤول فقط' });
}

// ==================== Socket.IO ====================
io.on('connection', (socket) => {
    console.log('🟢 مستخدم متصل:', socket.id);
    
    let userInfo = null;

    socket.on('register-user', (data) => {
        userInfo = {
            userId: data.userId,
            userName: data.userName,
            userRole: data.userRole,
            socketId: socket.id
        };
        activeSockets.set(socket.id, userInfo);
        console.log(`✅ تم تسجيل المستخدم ${data.userName} (${data.userRole})`);
        
        // إرسال المواقع الحالية للمستخدم الجديد إذا كان مسؤول
        if (data.userRole === 'مسؤول') {
            socket.emit('all-locations', locations.slice(-100));
        }
    });

    socket.on('send-location', (data) => {
        if (!userInfo) {
            console.log('❌ مستخدم غير مسجل حاول إرسال موقع');
            return;
        }
        
        const locationData = {
            userId: userInfo.userId,
            userName: userInfo.userName,
            userRole: userInfo.userRole,
            lat: data.lat,
            lng: data.lng,
            timestamp: new Date().toISOString()
        };
        
        locations.push(locationData);
        
        if (locations.length > 1000) {
            locations = locations.slice(-500);
        }
        
        // بث الموقع لجميع المستخدمين
        io.emit('receive-location', locationData);
    });

    socket.on('disconnect', () => {
        if (userInfo) {
            console.log(`🔴 مستخدم انقطع: ${userInfo.userName}`);
            activeSockets.delete(socket.id);
        }
    });
});

// ==================== API Routes ====================

// تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { name, pass } = req.body;
    const user = users.find(u => u.name === name && u.pass === pass && u.enabled);
    
    if (!user) {
        return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    
    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.userName = user.name;
    
    res.json({ 
        id: user.id, 
        name: user.name, 
        role: user.role,
        sessionId: req.sessionID
    });
});

// تسجيل الخروج
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        res.json({ success: true });
    });
});

// التحقق من الجلسة
app.get('/api/check-session', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({ 
            loggedIn: true, 
            user: { 
                name: req.session.userName, 
                role: req.session.userRole,
                id: req.session.userId
            } 
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// ==================== Vessels Routes ====================
app.get('/api/vessels', isAuth, (req, res) => {
    res.json(vessels);
});

app.post('/api/vessels', isAuth, (req, res) => {
    if (!req.body.name || req.body.name.trim() === '') {
        return res.status(400).json({ error: 'اسم المركب مطلوب' });
    }
    
    const newVessel = { 
        id: Date.now().toString(), 
        name: req.body.name,
        num: req.body.num || '',
        len: parseFloat(req.body.len) || 0,
        reg: req.body.reg || '',
        zone: req.body.zone || '',
        port: req.body.port || '',
        supp: req.body.supp || '',
        stat: req.body.stat || 'صالح',
        break: req.body.break || '',
        fDate: req.body.fDate || '',
        eDate: req.body.eDate || '',
        ref: req.body.ref || '',
        cat: getCatFromLen(parseFloat(req.body.len))
    };
    
    vessels.unshift(newVessel);
    res.status(201).json(newVessel);
});

app.put('/api/vessels/:id', isAuth, (req, res) => {
    const index = vessels.findIndex(v => v.id === req.params.id);
    if (index !== -1) {
        vessels[index] = { 
            ...vessels[index], 
            ...req.body,
            cat: getCatFromLen(parseFloat(req.body.len || vessels[index].len))
        };
        res.json(vessels[index]);
    } else {
        res.status(404).json({ error: 'المركب غير موجود' });
    }
});

app.delete('/api/vessels/:id', isAdmin, (req, res) => {
    const index = vessels.findIndex(v => v.id === req.params.id);
    if (index !== -1) {
        vessels.splice(index, 1);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'المركب غير موجود' });
    }
});

// ==================== Users Routes ====================
app.get('/api/users', isAuth, isAdmin, (req, res) => {
    const usersWithoutPass = users.map(({ pass, ...u }) => u);
    res.json(usersWithoutPass);
});

app.post('/api/users', isAuth, isAdmin, (req, res) => {
    const { name, pass, role } = req.body;
    
    if (!name || !pass) {
        return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
    }
    
    if (users.find(u => u.name === name)) {
        return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
    }
    
    const newUser = { 
        id: Date.now().toString(), 
        name, 
        pass, 
        role: role || 'مشاهد', 
        enabled: true 
    };
    users.push(newUser);
    res.status(201).json({ id: newUser.id, name, role: newUser.role });
});

app.put('/api/users/:id', isAuth, isAdmin, (req, res) => {
    const index = users.findIndex(u => u.id === req.params.id);
    if (index !== -1) {
        if (users[index].name === 'admin' && req.body.name && req.body.name !== 'admin') {
            return res.status(400).json({ error: 'لا يمكن تغيير اسم المستخدم admin' });
        }
        
        users[index] = { ...users[index], ...req.body };
        
        if (req.session.userId === req.params.id) {
            if (req.body.role) req.session.userRole = req.body.role;
            if (req.body.name) req.session.userName = req.body.name;
        }
        
        const { pass, ...userWithoutPass } = users[index];
        res.json(userWithoutPass);
    } else {
        res.status(404).json({ error: 'المستخدم غير موجود' });
    }
});

app.delete('/api/users/:id', isAuth, isAdmin, (req, res) => {
    const index = users.findIndex(u => u.id === req.params.id);
    if (index !== -1 && users[index].name !== 'admin') {
        users.splice(index, 1);
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'لا يمكن حذف المستخدم admin' });
    }
});

// ==================== Tickets Routes ====================
app.get('/api/tickets', isAuth, (req, res) => {
    res.json(tickets);
});

app.post('/api/tickets', isAuth, (req, res) => {
    const newTicket = { 
        id: Date.now().toString(), 
        ...req.body, 
        status: 'قيد المعالجة', 
        replies: [],
        date: new Date().toLocaleDateString('ar-EG'),
        time: new Date().toLocaleTimeString('ar-EG')
    };
    tickets.unshift(newTicket);
    res.status(201).json(newTicket);
});

app.put('/api/tickets/:id/reply', isAuth, isAdmin, (req, res) => {
    const ticket = tickets.find(t => t.id === req.params.id);
    if (ticket) {
        const reply = {
            adminName: req.session.userName,
            reply: req.body.reply,
            date: new Date().toLocaleDateString('ar-EG'),
            time: new Date().toLocaleTimeString('ar-EG')
        };
        ticket.replies.push(reply);
        ticket.status = 'تم الرد';
        res.json(ticket);
    } else {
        res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
});

app.put('/api/tickets/:id/close', isAuth, isAdmin, (req, res) => {
    const ticket = tickets.find(t => t.id === req.params.id);
    if (ticket) {
        ticket.status = 'مغلقة';
        res.json(ticket);
    } else {
        res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
});

// ==================== Logs Routes ====================
app.get('/api/logs', isAuth, isAdmin, (req, res) => {
    res.json(logs);
});

app.post('/api/logs', isAuth, (req, res) => {
    const newLog = { 
        id: Date.now().toString(), 
        userName: req.body.userName,
        userRole: req.body.userRole,
        action: req.body.action,
        details: req.body.details,
        date: new Date().toLocaleDateString('ar-EG'),
        time: new Date().toLocaleTimeString('ar-EG')
    };
    logs.unshift(newLog);
    
    if (logs.length > 500) {
        logs = logs.slice(0, 500);
    }
    res.status(201).json(newLog);
});

// ==================== Locations Routes ====================
app.get('/api/locations', isAuth, (req, res) => {
    if (req.session.userRole === 'مسؤول') {
        res.json(locations.slice(-100));
    } else {
        const userLocations = locations.filter(l => l.userId === req.session.userId);
        res.json(userLocations.slice(-50));
    }
});

// ==================== Export/Import Routes ====================
app.get('/api/export-all', isAuth, isAdmin, (req, res) => {
    const exportData = {
        vessels: vessels,
        users: users.map(({ pass, ...u }) => u),
        tickets: tickets,
        logs: logs,
        exportDate: new Date().toISOString()
    };
    res.json(exportData);
});

app.post('/api/import-all', isAuth, isAdmin, (req, res) => {
    try {
        const { vessels: v, users: u, tickets: t, logs: l } = req.body;
        
        if (v && Array.isArray(v)) vessels = v;
        if (t && Array.isArray(t)) tickets = t;
        if (l && Array.isArray(l)) logs = l;
        if (u && Array.isArray(u)) {
            const adminExists = u.some(user => user.name === 'admin');
            if (!adminExists) {
                u.push({ id: Date.now().toString(), name: 'admin', role: 'مسؤول', enabled: true });
            }
            users = u.map(user => ({ ...user, pass: user.pass || '1234' }));
        }
        
        res.json({ success: true, message: 'تم الاستيراد بنجاح' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في استيراد البيانات' });
    }
});

// ==================== Helper Functions ====================
function getCatFromLen(len) {
    const n = parseFloat(len);
    if (n === 11) return "البروق";
    if (n >= 8 && n <= 12) return "صقور";
    if (n > 12 && n <= 25) return "خوافر";
    if (n >= 30) return "طوافات";
    return "زوارق مزدوجة";
}

// ==================== Serve HTML ====================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== Start Server ====================
server.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`🚀 تم تشغيل السيرفر على http://localhost:${PORT}`);
    console.log(`========================================`);
    console.log(`📝 بيانات الدخول:`);
    console.log(`   👑 admin / 1234 (مسؤول كامل الصلاحيات)`);
    console.log(`   👤 user / user (مشاهد فقط)`);
    console.log(`========================================`);
    console.log(`📍 ميزات تتبع الموقع:`);
    console.log(`   - المسؤول: يرى جميع المستخدمين على الخريطة`);
    console.log(`   - المستخدم العادي: يرى موقعه فقط`);
    console.log(`========================================\n`);
});
