const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
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

// ==================== ملف حفظ البيانات ====================
const DATA_FILE = path.join(__dirname, 'data.json');

// ==================== تحميل البيانات من الملف ====================
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            console.log('✅ تم تحميل البيانات من الملف');
            return data;
        }
    } catch (err) {
        console.error('❌ خطأ في تحميل البيانات:', err);
    }
    return null;
}

// ==================== حفظ البيانات في الملف ====================
function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('✅ تم حفظ البيانات في الملف');
        return true;
    } catch (err) {
        console.error('❌ خطأ في حفظ البيانات:', err);
        return false;
    }
}

// ==================== البيانات الافتراضية ====================
const DEFAULT_DATA = {
    users: [
        { name: 'admin', pass: '1234', role: 'مسؤول', enabled: true },
        { name: 'user', pass: '1234', role: 'محرر', enabled: true },
        { name: 'viewer', pass: '1234', role: 'مشاهد', enabled: true }
    ],
    vessels: [
        { _id: '1', name: 'المركب 1', num: 'M001', len: 12, reg: 'الشمال', zone: 'تونس', port: 'تونس', supp: 'قاعدة الشمال', stat: 'صالح', break: '', fDate: '2024-01-01', eDate: '2024-12-31', ref: 'REF001', cat: 'صقور' },
        { _id: '2', name: 'المركب 2', num: 'M002', len: 8, reg: 'الساحل', zone: 'سوسة', port: 'سوسة', supp: 'قاعدة الساحل', stat: 'صيانة', break: 'محرك', fDate: '2024-01-15', eDate: '2024-02-15', ref: 'REF002', cat: 'البروق' },
        { _id: '3', name: 'المركب 3', num: 'M003', len: 15, reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: 'قاعدة الوسط', stat: 'معطب', break: 'هيكل', fDate: '2024-01-20', eDate: '', ref: 'REF003', cat: 'خوافر' },
        { _id: '4', name: 'المركب 4', num: 'M004', len: 11, reg: 'الجنوب', zone: 'جرجيس', port: 'جرجيس', supp: 'قاعدة الجنوب', stat: 'صالح', break: '', fDate: '2024-02-01', eDate: '2024-12-31', ref: 'REF004', cat: 'البروق' },
        { _id: '5', name: 'المركب 5', num: 'M005', len: 25, reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: 'قاعدة الشمال', stat: 'صالح', break: '', fDate: '2024-02-01', eDate: '2024-12-31', ref: 'REF005', cat: 'خوافر' }
    ],
    tickets: [
        { _id: '1', userName: 'admin', userRole: 'مسؤول', subject: 'مشكلة في الخريطة', message: 'الخريطة لا تظهر بشكل صحيح', date: '01/01/2024', time: '10:00', status: 'تم الرد', replies: [{ adminName: 'admin', reply: 'تم إصلاح المشكلة', date: '02/01/2024', time: '11:00' }] }
    ],
    logs: [
        { userName: 'admin', userRole: 'مسؤول', action: 'تسجيل دخول', details: 'قام بتسجيل الدخول إلى النظام', date: '01/01/2024', time: '10:00' }
    ],
    locations: []
};

// ==================== تحميل البيانات أو استخدام الافتراضية ====================
let appData = loadData();
if (!appData) {
    appData = JSON.parse(JSON.stringify(DEFAULT_DATA));
    saveData(appData);
    console.log('📁 تم إنشاء ملف البيانات الافتراضي');
}

// ==================== متغيرات البيانات ====================
let users = appData.users;
let vessels = appData.vessels;
let tickets = appData.tickets;
let logs = appData.logs;
let locations = appData.locations;
let onlineUsers = new Set();

// ==================== حفظ البيانات تلقائياً ====================
function saveAllData() {
    appData.users = users;
    appData.vessels = vessels;
    appData.tickets = tickets;
    appData.logs = logs;
    appData.locations = locations;
    saveData(appData);
}

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
    
    const user = users.find(u => u.name === name && u.pass === pass && u.enabled === true);
    
    if (!user) {
        console.log('❌ فشل تسجيل الدخول:', name);
        return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    
    console.log('✅ تسجيل دخول ناجح:', name);
    res.json({ id: user.name, name: user.name, role: user.role });
});

app.post('/api/logout', (req, res) => {
    res.json({ success: true });
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
    saveAllData();
    res.status(201).json(vessel);
});

app.put('/api/vessels/:id', (req, res) => {
    const index = vessels.findIndex(v => v._id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'المركب غير موجود' });
    vessels[index] = { ...vessels[index], ...req.body };
    saveAllData();
    console.log('✏️ تعديل مركب:', vessels[index].name);
    res.json(vessels[index]);
});

app.delete('/api/vessels/:id', (req, res) => {
    const index = vessels.findIndex(v => v._id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'المركب غير موجود' });
    const name = vessels[index].name;
    vessels.splice(index, 1);
    saveAllData();
    console.log('🗑️ حذف مركب:', name);
    res.json({ success: true });
});

// ==================== مسارات المستخدمين ====================
app.get('/api/users', (req, res) => {
    const usersList = users.map(u => {
        const { pass, ...rest } = u;
        return { ...rest, _id: u.name };
    });
    console.log('👥 جلب المستخدمين:', usersList.length);
    res.json(usersList);
});

app.post('/api/users', (req, res) => {
    const { name, pass, role } = req.body;
    if (users.find(u => u.name === name)) {
        return res.status(400).json({ error: 'اسم المستخدم موجود' });
    }
    const user = { name, pass, role, enabled: true };
    users.push(user);
    saveAllData();
    res.status(201).json(user);
});

app.put('/api/users/:id', (req, res) => {
    const index = users.findIndex(u => u.name === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'المستخدم غير موجود' });
    users[index] = { ...users[index], ...req.body };
    saveAllData();
    const { pass, ...rest } = users[index];
    res.json(rest);
});

app.delete('/api/users/:id', (req, res) => {
    const index = users.findIndex(u => u.name === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'المستخدم غير موجود' });
    users.splice(index, 1);
    saveAllData();
    res.json({ success: true });
});

// ==================== مسارات التذاكر ====================
app.get('/api/tickets', (req, res) => {
    console.log('📋 جلب التذاكر:', tickets.length);
    res.json(tickets);
});

app.post('/api/tickets', (req, res) => {
    const ticket = { ...req.body, _id: Date.now().toString() };
    tickets.push(ticket);
    saveAllData();
    res.status(201).json(ticket);
});

app.put('/api/tickets/:id/reply', (req, res) => {
    const ticket = tickets.find(t => t._id === req.params.id);
    if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
    if (!ticket.replies) ticket.replies = [];
    ticket.replies.push(req.body.reply);
    ticket.status = 'تم الرد';
    saveAllData();
    res.json(ticket);
});

app.put('/api/tickets/:id/close', (req, res) => {
    const ticket = tickets.find(t => t._id === req.params.id);
    if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
    ticket.status = 'مغلقة';
    saveAllData();
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
    saveAllData();
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
    saveAllData();
    res.status(201).json(location);
});

app.get('/api/locations', (req, res) => {
    console.log('📍 جلب المواقع:', locations.length);
    res.json(locations.slice(-100));
});

// ==================== التصدير والاستيراد ====================
app.get('/api/export-all', (req, res) => {
    res.json({ vessels, users, tickets, logs, locations });
});

app.post('/api/import-all', (req, res) => {
    const { vessels: v, users: u, tickets: t, logs: l, locations: loc } = req.body;
    if (v) { vessels = v; }
    if (u) { users = u; }
    if (t) { tickets = t; }
    if (l) { logs = l; }
    if (loc) { locations = loc; }
    saveAllData();
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
            saveAllData();
            
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
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    const paths = [
        path.join(__dirname, 'public', 'index.html'),
        path.join(__dirname, 'index.html')
    ];
    
    for (const p of paths) {
        if (fs.existsSync(p)) {
            console.log('✅ تقديم index.html من:', p);
            return res.sendFile(p);
        }
    }
    
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>منظومة الوسائل البحرية</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f4f7f9; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; direction: rtl; }
                .container { background: white; padding: 40px; border-radius: 15px; box-shadow: 0 5px 30px rgba(0,0,0,0.1); text-align: center; max-width: 500px; }
                h1 { color: #2e7d32; font-size: 32px; }
                .btn { display: inline-block; padding: 12px 30px; background: #2e7d32; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px; border: none; cursor: pointer; }
                .btn:hover { background: #1e5a22; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>⚓ منظومة الوسائل البحرية</h1>
                <p>📡 نظام تتبع GPS متكامل</p>
                <p style="color:#999;font-size:14px;">جاري تحميل التطبيق...</p>
                <button class="btn" onclick="window.location.reload()">🔄 إعادة تحميل</button>
            </div>
        </body>
        </html>
    `);
});

// ==================== تشغيل الخادم ====================
server.listen(PORT, '0.0.0.0', () => {
    console.log('========================================');
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`🌐 https://marine-system-71eo.onrender.com`);
    console.log('========================================');
    console.log('🔐 بيانات تسجيل الدخول:');
    console.log('   📧 admin');
    console.log('   🔑 1234');
    console.log('========================================');
    console.log(`📊 عدد المراكب: ${vessels.length}`);
    console.log(`👥 عدد المستخدمين: ${users.length}`);
    console.log(`📋 عدد التذاكر: ${tickets.length}`);
    console.log(`📍 عدد المواقع: ${locations.length}`);
    console.log('========================================');
    console.log('✅ البيانات محفوظة في ملف data.json');
    console.log('✅ التطبيق جاهز للاستخدام!');
    console.log('========================================');
});
