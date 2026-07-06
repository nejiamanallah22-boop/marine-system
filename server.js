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

// ==================== استيراد النماذج ====================
let User, Vessel, Ticket, Log;

try {
    // محاولة استيراد النماذج من مجلد models
    const modelsPath = path.join(__dirname, 'models');
    
    if (fs.existsSync(path.join(modelsPath, 'User.js'))) {
        User = require('./models/User');
        console.log('✅ تم تحميل نموذج User');
    }
    if (fs.existsSync(path.join(modelsPath, 'Vessel.js'))) {
        Vessel = require('./models/Vessel');
        console.log('✅ تم تحميل نموذج Vessel');
    }
    if (fs.existsSync(path.join(modelsPath, 'Ticket.js'))) {
        Ticket = require('./models/Ticket');
        console.log('✅ تم تحميل نموذج Ticket');
    }
    if (fs.existsSync(path.join(modelsPath, 'Log.js'))) {
        Log = require('./models/Log');
        console.log('✅ تم تحميل نموذج Log');
    }
} catch (err) {
    console.log('⚠️ لا يمكن تحميل النماذج من مجلد models، سيتم استخدام البيانات المؤقتة');
}

// ==================== بيانات مؤقتة (في حالة عدم وجود قاعدة بيانات) ====================
const DEFAULT_USERS = [
    { name: 'admin', pass: '1234', role: 'مسؤول', enabled: true },
    { name: 'user', pass: '1234', role: 'محرر', enabled: true },
    { name: 'viewer', pass: '1234', role: 'مشاهد', enabled: true }
];

let memoryVessels = [];
let memoryTickets = [];
let memoryLogs = [];
let memoryLocations = [];
let onlineUsers = new Set();

// ==================== البحث عن index.html ====================
const findIndexHtml = () => {
    const paths = [
        path.join(__dirname, 'public', 'index.html'),
        path.join(__dirname, 'index.html'),
        path.join(__dirname, 'src', 'index.html')
    ];
    
    for (const p of paths) {
        if (fs.existsSync(p)) {
            console.log('✅ تم العثور على index.html في:', p);
            return p;
        }
    }
    console.log('❌ لم يتم العثور على index.html');
    return null;
};

const indexHtmlPath = findIndexHtml();

// ==================== الملفات الثابتة ====================
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname)));

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

// ==================== دوال للتعامل مع النماذج أو الذاكرة ====================
async function getVessels() {
    if (Vessel) {
        try {
            return await Vessel.find();
        } catch (err) {
            console.error('خطأ في جلب المراكب من DB:', err);
            return memoryVessels;
        }
    }
    return memoryVessels;
}

async function saveVessel(data) {
    if (Vessel) {
        try {
            const vessel = new Vessel(data);
            await vessel.save();
            return vessel;
        } catch (err) {
            console.error('خطأ في حفظ المركب في DB:', err);
            const vessel = { ...data, _id: Date.now().toString() };
            memoryVessels.push(vessel);
            return vessel;
        }
    }
    const vessel = { ...data, _id: Date.now().toString() };
    memoryVessels.push(vessel);
    return vessel;
}

async function updateVessel(id, data) {
    if (Vessel) {
        try {
            return await Vessel.findByIdAndUpdate(id, data, { new: true });
        } catch (err) {
            console.error('خطأ في تحديث المركب في DB:', err);
            const index = memoryVessels.findIndex(v => v._id === id);
            if (index === -1) return null;
            memoryVessels[index] = { ...memoryVessels[index], ...data };
            return memoryVessels[index];
        }
    }
    const index = memoryVessels.findIndex(v => v._id === id);
    if (index === -1) return null;
    memoryVessels[index] = { ...memoryVessels[index], ...data };
    return memoryVessels[index];
}

async function deleteVessel(id) {
    if (Vessel) {
        try {
            await Vessel.findByIdAndDelete(id);
            return true;
        } catch (err) {
            console.error('خطأ في حذف المركب من DB:', err);
            const index = memoryVessels.findIndex(v => v._id === id);
            if (index === -1) return false;
            memoryVessels.splice(index, 1);
            return true;
        }
    }
    const index = memoryVessels.findIndex(v => v._id === id);
    if (index === -1) return false;
    memoryVessels.splice(index, 1);
    return true;
}

async function getUsers() {
    if (User) {
        try {
            return await User.find().select('-pass');
        } catch (err) {
            console.error('خطأ في جلب المستخدمين من DB:', err);
            return DEFAULT_USERS.map(u => ({ ...u, _id: u.name }));
        }
    }
    return DEFAULT_USERS.map(u => ({ ...u, _id: u.name }));
}

async function saveUser(data) {
    if (User) {
        try {
            const user = new User(data);
            await user.save();
            return user;
        } catch (err) {
            console.error('خطأ في حفظ المستخدم في DB:', err);
            DEFAULT_USERS.push(data);
            return data;
        }
    }
    DEFAULT_USERS.push(data);
    return data;
}

async function updateUser(id, data) {
    if (User) {
        try {
            return await User.findByIdAndUpdate(id, data, { new: true }).select('-pass');
        } catch (err) {
            console.error('خطأ في تحديث المستخدم في DB:', err);
            const index = DEFAULT_USERS.findIndex(u => u.name === id);
            if (index === -1) return null;
            DEFAULT_USERS[index] = { ...DEFAULT_USERS[index], ...data };
            return DEFAULT_USERS[index];
        }
    }
    const index = DEFAULT_USERS.findIndex(u => u.name === id);
    if (index === -1) return null;
    DEFAULT_USERS[index] = { ...DEFAULT_USERS[index], ...data };
    return DEFAULT_USERS[index];
}

async function deleteUser(id) {
    if (User) {
        try {
            await User.findByIdAndDelete(id);
            return true;
        } catch (err) {
            console.error('خطأ في حذف المستخدم من DB:', err);
            const index = DEFAULT_USERS.findIndex(u => u.name === id);
            if (index === -1) return false;
            DEFAULT_USERS.splice(index, 1);
            return true;
        }
    }
    const index = DEFAULT_USERS.findIndex(u => u.name === id);
    if (index === -1) return false;
    DEFAULT_USERS.splice(index, 1);
    return true;
}

// ==================== مسار تسجيل الدخول ====================
app.post('/api/login', async (req, res) => {
    console.log('📝 محاولة تسجيل دخول:', req.body);
    const { name, pass } = req.body;
    
    if (!name || !pass) {
        return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }
    
    try {
        let user = null;
        
        // البحث في قاعدة البيانات
        if (User) {
            try {
                user = await User.findOne({ name, pass, enabled: true });
            } catch (err) {
                console.error('خطأ في البحث عن المستخدم في DB:', err);
            }
        }
        
        // إذا لم يوجد، البحث في الذاكرة
        if (!user) {
            user = DEFAULT_USERS.find(u => u.name === name && u.pass === pass && u.enabled === true);
        }
        
        if (!user) {
            console.log('❌ فشل تسجيل الدخول:', name);
            return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
        
        console.log('✅ تسجيل دخول ناجح:', name);
        res.json({ id: user._id || user.name, name: user.name, role: user.role });
    } catch (error) {
        console.error('خطأ في تسجيل الدخول:', error);
        res.status(500).json({ error: 'خطأ داخلي في السيرفر' });
    }
});

app.post('/api/logout', (req, res) => {
    res.json({ success: true });
});

// ==================== مسارات المراكب ====================
app.get('/api/vessels', async (req, res) => {
    try {
        const vessels = await getVessels();
        res.json(vessels);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/vessels', async (req, res) => {
    try {
        const vessel = await saveVessel(req.body);
        res.status(201).json(vessel);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/vessels/:id', async (req, res) => {
    try {
        const vessel = await updateVessel(req.params.id, req.body);
        if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
        res.json(vessel);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/vessels/:id', async (req, res) => {
    try {
        const deleted = await deleteVessel(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'المركب غير موجود' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== مسارات المستخدمين ====================
app.get('/api/users', async (req, res) => {
    try {
        const users = await getUsers();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const user = await saveUser(req.body);
        res.status(201).json(user);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const user = await updateUser(req.params.id, req.body);
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
        res.json(user);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        const deleted = await deleteUser(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'المستخدم غير موجود' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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
    if (!ticket.replies) ticket.replies = [];
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
    const location = { 
        ...req.body, 
        _id: Date.now().toString(),
        timestamp: new Date().toISOString()
    };
    memoryLocations.push(location);
    res.status(201).json(location);
});

app.get('/api/locations', (req, res) => {
    res.json(memoryLocations.slice(-100));
});

// ==================== التصدير والاستيراد ====================
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
    if (users) { DEFAULT_USERS.length = 0; DEFAULT_USERS.push(...users); }
    if (tickets) memoryTickets = tickets;
    if (logs) memoryLogs = logs;
    if (locations) memoryLocations = locations;
    res.json({ success: true });
});

// ==================== Socket.IO ====================
io.on('connection', (socket) => {
    console.log('📡 مستخدم متصل:', socket.id);
    
    socket.on('user-connected', (data) => {
        if (data && data.userName) {
            onlineUsers.add(data.userName);
            io.emit('online-users', { users: Array.from(onlineUsers) });
        }
    });
    
    socket.on('send-location', (data) => {
        if (data && data.userName && data.lat && data.lng) {
            memoryLocations.push({
                userName: data.userName,
                userRole: data.userRole || 'مستخدم',
                lat: data.lat,
                lng: data.lng,
                timestamp: new Date().toISOString()
            });
            socket.broadcast.emit('receive-location', {
                userName: data.userName,
                lat: data.lat,
                lng: data.lng,
                time: new Date().toISOString()
            });
        }
    });
    
    socket.on('get-online-users', () => {
        socket.emit('online-users', { users: Array.from(onlineUsers) });
    });
    
    socket.on('user-disconnected', (data) => {
        if (data && data.userName) {
            onlineUsers.delete(data.userName);
            io.emit('online-users', { users: Array.from(onlineUsers) });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('📡 مستخدم غير متصل:', socket.id);
    });
});

// ==================== الصفحة الرئيسية ====================
app.get('/', (req, res) => {
    if (indexHtmlPath && fs.existsSync(indexHtmlPath)) {
        res.sendFile(indexHtmlPath);
    } else {
        // عرض صفحة بسيطة إذا لم يوجد index.html
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
                    .btn { display: inline-block; padding: 12px 30px; background: #2e7d32; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px; }
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
    }
});

// ==================== تشغيل الخادم ====================
server.listen(PORT, '0.0.0.0', () => {
    console.log('========================================');
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`🌐 https://marine-system-71eo.onrender.com`);
    console.log('========================================');
    console.log('📁 الملفات الموجودة:');
    console.log('   - models/ (User.js, Vessel.js, Ticket.js, Log.js)');
    console.log('   - public/index.html');
    console.log('   - server.js');
    console.log('========================================');
    console.log('🔐 بيانات تسجيل الدخول:');
    console.log('   📧 admin');
    console.log('   🔑 1234');
    console.log('========================================');
    console.log(`📊 عدد المراكب: ${memoryVessels.length}`);
    console.log('📍 نظام تتبع GPS نشط');
    console.log('========================================');
});
