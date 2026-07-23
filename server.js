const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ============================================================
// ✅ Socket.IO
// ============================================================
const io = socketIO(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ============================================================
// ✅ حل مشكلة CSS
// ============================================================
app.use((req, res, next) => {
    if (req.url.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
    } else if (req.url.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
    }
    next();
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// 🗄️ MongoDB
// ============================================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/marine_db';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.log('❌ MongoDB Error:', err.message));

// ============================================================
// 📊 نماذج البيانات
// ============================================================

// نموذج المراكب
const vesselSchema = new mongoose.Schema({
    name: { type: String, required: true },
    num: String,
    len: Number,
    cat: String,
    reg: String,
    zone: String,
    port: String,
    supp: String,
    stat: { type: String, default: 'صالح' },
    break: String,
    fDate: String,
    eDate: String,
    ref: String
}, { timestamps: true });

const Vessel = mongoose.model('Vessel', vesselSchema);

// نموذج الإشعارات
const notificationSchema = new mongoose.Schema({
    message: { type: String, required: true },
    type: { type: String, default: 'info' }, // info, success, warning, danger
    icon: { type: String, default: '🔔' },
    read: { type: Boolean, default: false },
    userId: { type: String, default: 'all' },
    createdAt: { type: Date, default: Date.now }
});

const Notification = mongoose.model('Notification', notificationSchema);

// ============================================================
// 🔐 Login
// ============================================================
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (email === 'admin' && password === '123456') {
        res.json({
            success: true,
            token: 'fake-token',
            user: { id: 1, name: 'Admin', email: 'admin', role: 'مسؤول' }
        });
    } else {
        res.status(401).json({ success: false, error: 'بيانات غير صحيحة' });
    }
});

app.get('/api/auth/me', (req, res) => {
    res.json({ success: true, user: { id: 1, name: 'Admin', email: 'admin', role: 'مسؤول' } });
});

// ============================================================
// 🚢 المراكب - مع إرسال إشعار
// ============================================================

app.get('/api/vessels', async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/vessels', async (req, res) => {
    try {
        const vessel = new Vessel(req.body);
        const saved = await vessel.save();
        
        // ✅ إرسال إشعار عند إضافة مركب
        const notification = new Notification({
            message: `🚢 تم إضافة مركب جديد: ${saved.name}`,
            type: 'success',
            icon: '🚢'
        });
        await notification.save();
        
        // ✅ بث الإشعار لجميع المستخدمين عبر Socket.IO
        io.emit('new-notification', {
            message: `🚢 تم إضافة مركب جديد: ${saved.name}`,
            type: 'success',
            icon: '🚢',
            time: new Date().toISOString()
        });
        
        res.status(201).json({ success: true, data: saved });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.delete('/api/vessels/:id', async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndDelete(req.params.id);
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'غير موجود' });
        }
        
        // ✅ إرسال إشعار عند حذف مركب
        const notification = new Notification({
            message: `🗑️ تم حذف مركب: ${vessel.name}`,
            type: 'danger',
            icon: '🗑️'
        });
        await notification.save();
        
        io.emit('new-notification', {
            message: `🗑️ تم حذف مركب: ${vessel.name}`,
            type: 'danger',
            icon: '🗑️',
            time: new Date().toISOString()
        });
        
        res.json({ success: true, message: 'تم الحذف' });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🔔 الإشعارات
// ============================================================

// جلب جميع الإشعارات
app.get('/api/notifications', async (req, res) => {
    try {
        const notifications = await Notification.find()
            .sort({ createdAt: -1 })
            .limit(50);
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// جلب عدد الإشعارات غير المقروءة
app.get('/api/notifications/unread-count', async (req, res) => {
    try {
        const count = await Notification.countDocuments({ read: false });
        res.json({ count });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// تحديث حالة الإشعار (قراءة)
app.put('/api/notifications/:id/read', async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { read: true });
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// تحديث جميع الإشعارات كقراءة
app.put('/api/notifications/read-all', async (req, res) => {
    try {
        await Notification.updateMany({ read: false }, { read: true });
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🎫 التذاكر
// ============================================================
const ticketSchema = new mongoose.Schema({
    subject: String,
    message: String,
    status: { type: String, default: 'قيد المعالجة' },
    userName: String,
    date: String,
    time: String,
    replies: Array
}, { timestamps: true });

const Ticket = mongoose.model('Ticket', ticketSchema);

app.get('/api/tickets', async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        res.json(tickets);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/tickets', async (req, res) => {
    try {
        const ticket = new Ticket(req.body);
        const saved = await ticket.save();
        
        const notification = new Notification({
            message: `🎫 تذكرة جديدة: ${saved.subject}`,
            type: 'info',
            icon: '🎫'
        });
        await notification.save();
        io.emit('new-notification', {
            message: `🎫 تذكرة جديدة: ${saved.subject}`,
            type: 'info',
            icon: '🎫',
            time: new Date().toISOString()
        });
        
        res.status(201).json({ success: true, data: saved });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📝 المذكرات
// ============================================================
const noteSchema = new mongoose.Schema({
    title: String,
    content: String,
    date: String,
    time: String,
    week: String,
    createdBy: String
}, { timestamps: true });

const Note = mongoose.model('Note', noteSchema);

app.get('/api/notes', async (req, res) => {
    try {
        const notes = await Note.find().sort({ createdAt: -1 });
        res.json(notes);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/notes', async (req, res) => {
    try {
        const note = new Note(req.body);
        const saved = await note.save();
        
        const notification = new Notification({
            message: `📝 مذكرة جديدة: ${saved.title}`,
            type: 'info',
            icon: '📝'
        });
        await notification.save();
        io.emit('new-notification', {
            message: `📝 مذكرة جديدة: ${saved.title}`,
            type: 'info',
            icon: '📝',
            time: new Date().toISOString()
        });
        
        res.status(201).json({ success: true, data: saved });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.delete('/api/notes/:id', async (req, res) => {
    try {
        const note = await Note.findByIdAndDelete(req.params.id);
        if (!note) {
            return res.status(404).json({ success: false, error: 'غير موجود' });
        }
        
        const notification = new Notification({
            message: `🗑️ تم حذف مذكرة: ${note.title}`,
            type: 'danger',
            icon: '🗑️'
        });
        await notification.save();
        io.emit('new-notification', {
            message: `🗑️ تم حذف مذكرة: ${note.title}`,
            type: 'danger',
            icon: '🗑️',
            time: new Date().toISOString()
        });
        
        res.json({ success: true, message: 'تم الحذف' });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 👥 المستخدمين
// ============================================================
const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    role: String,
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const user = new User(req.body);
        const saved = await user.save();
        
        const notification = new Notification({
            message: `👤 مستخدم جديد: ${saved.name}`,
            type: 'success',
            icon: '👤'
        });
        await notification.save();
        io.emit('new-notification', {
            message: `👤 مستخدم جديد: ${saved.name}`,
            type: 'success',
            icon: '👤',
            time: new Date().toISOString()
        });
        
        res.status(201).json({ success: true, data: saved });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📍 المواقع
// ============================================================
const locationSchema = new mongoose.Schema({
    userName: String,
    lat: Number,
    lng: Number,
    timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const Location = mongoose.model('Location', locationSchema);

app.get('/api/locations', async (req, res) => {
    try {
        const locations = await Location.find().sort({ timestamp: -1 });
        res.json(locations);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/locations', async (req, res) => {
    try {
        const location = new Location(req.body);
        const saved = await location.save();
        res.status(201).json({ success: true, data: saved });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📜 السجلات
// ============================================================
const logSchema = new mongoose.Schema({
    userName: String,
    action: String,
    details: String,
    date: String,
    time: String
}, { timestamps: true });

const Log = mongoose.model('Log', logSchema);

app.get('/api/logs', async (req, res) => {
    try {
        const logs = await Log.find().sort({ createdAt: -1 });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 💾 Export / Import
// ============================================================
app.get('/api/export-all', async (req, res) => {
    try {
        const [vessels, users, tickets, logs, locations, notes, notifications] = await Promise.all([
            Vessel.find(),
            User.find(),
            Ticket.find(),
            Log.find(),
            Location.find(),
            Note.find(),
            Notification.find()
        ]);
        res.json({ vessels, users, tickets, logs, locations, notes, notifications });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/import-all', async (req, res) => {
    try {
        const { vessels, users, tickets, logs, locations, notes, notifications } = req.body;
        if (vessels) { await Vessel.deleteMany({}); await Vessel.insertMany(vessels); }
        if (users) { await User.deleteMany({}); await User.insertMany(users); }
        if (tickets) { await Ticket.deleteMany({}); await Ticket.insertMany(tickets); }
        if (logs) { await Log.deleteMany({}); await Log.insertMany(logs); }
        if (locations) { await Location.deleteMany({}); await Location.insertMany(locations); }
        if (notes) { await Note.deleteMany({}); await Note.insertMany(notes); }
        if (notifications) { await Notification.deleteMany({}); await Notification.insertMany(notifications); }
        res.json({ success: true, message: '✅ تم الاستيراد' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// ❤️ Health
// ============================================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// 🏠 Home
// ============================================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// 📡 Socket.IO - الاتصالات
// ============================================================
io.on('connection', (socket) => {
    console.log('📡 مستخدم متصل:', socket.id);
    
    // إرسال الإشعارات السابقة عند الاتصال
    socket.on('get-notifications', async () => {
        try {
            const notifications = await Notification.find()
                .sort({ createdAt: -1 })
                .limit(20);
            socket.emit('notifications-list', notifications);
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('📡 مستخدم غير متصل:', socket.id);
    });
});

// ============================================================
// 🚀 تشغيل السيرفر
// ============================================================
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Server: http://localhost:${PORT}`);
    console.log('📧 admin / 🔑 123456');
    console.log('✅ Socket.IO جاهز للإشعارات');
});
