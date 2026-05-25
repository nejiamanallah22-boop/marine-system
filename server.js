const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// ==================== الاتصال بقاعدة البيانات ====================
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://hamza:hamza123@cluster0.ajb5w1z.mongodb.net/marine_fleet';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ متصل بـ MongoDB Atlas'))
    .catch(err => console.error('❌ خطأ في الاتصال:', err.message));

// ==================== إعداد البريد الإلكتروني ====================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'nejiamanallah22@gmail.com',
        pass: process.env.EMAIL_PASS || 'your_app_password_here'
    }
});

async function sendLoginEmail(username, role, time, ip) {
    try {
        await transporter.sendMail({
            from: '"منظومة الوسائل البحرية" <nejiamanallah22@gmail.com>',
            to: 'nejiamanallah22@gmail.com',
            subject: `🔐 تسجيل دخول جديد - ${username}`,
            html: `
                <div dir="rtl" style="font-family: Tahoma; padding: 20px;">
                    <h2 style="color: #2e7d32;">⚓ منظومة متابعة الوسائل البحرية</h2>
                    <h3>🔐 تم تسجيل دخول جديد</h3>
                    <p><strong>👤 المستخدم:</strong> ${username}</p>
                    <p><strong>🔑 الصلاحية:</strong> ${role}</p>
                    <p><strong>⏰ الوقت:</strong> ${time}</p>
                    <p><strong>🌐 IP:</strong> ${ip || 'غير متوفر'}</p>
                    <hr>
                    <small>تم الإرسال تلقائياً من النظام</small>
                </div>
            `
        });
        console.log(`📧 تم إرسال إشعار تسجيل الدخول: ${username}`);
    } catch(error) {
        console.error('❌ فشل إرسال البريد:', error.message);
    }
}

// ==================== نماذج قاعدة البيانات ====================
const vesselSchema = new mongoose.Schema({
    name: { type: String, required: true },
    num: String,
    len: Number,
    reg: String,
    zone: String,
    port: String,
    supp: String,
    stat: { type: String, default: 'صالح' },
    break: String,
    fDate: Date,
    eDate: Date,
    ref: String,
    cat: String
}, { timestamps: true });
const Vessel = mongoose.model('Vessel', vesselSchema);

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    pass: { type: String, required: true },
    role: { type: String, enum: ['مسؤول', 'محرر', 'مشاهد'], default: 'مشاهد' },
    enabled: { type: Boolean, default: true }
});
const User = mongoose.model('User', userSchema);

const ticketSchema = new mongoose.Schema({
    userName: String,
    userRole: String,
    subject: String,
    message: String,
    date: String,
    time: String,
    status: { type: String, default: 'قيد المعالجة' },
    replies: [{
        adminName: String,
        reply: String,
        date: String,
        time: String
    }]
});
const Ticket = mongoose.model('Ticket', ticketSchema);

const logSchema = new mongoose.Schema({
    userName: String,
    userRole: String,
    action: String,
    details: String,
    date: String,
    time: String
});
const Log = mongoose.model('Log', logSchema);

const locationSchema = new mongoose.Schema({
    userName: String,
    userRole: String,
    lat: Number,
    lng: Number,
    timestamp: { type: Date, default: Date.now }
});
const Location = mongoose.model('Location', locationSchema);

// ==================== Middleware ====================
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: process.env.SESSION_SECRET || 'marine_super_secret_2025',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));

function isAuthenticated(req, res, next) {
    if (req.session.userId) return next();
    res.status(401).json({ error: 'غير مصرح' });
}

function hasRole(roles) {
    return (req, res, next) => {
        if (roles.includes(req.session.userRole)) return next();
        res.status(403).json({ error: 'ليس لديك صلاحية' });
    };
}

// ==================== WebSocket - تتبع المواقع ====================
io.on('connection', (socket) => {
    console.log('✅ مستخدم متصل عبر WebSocket:', socket.id);
    
    socket.on('send-location', async (data) => {
        const { userName, userRole, lat, lng } = data;
        if (lat && lng) {
            try {
                await Location.create({ userName, userRole, lat, lng });
                socket.broadcast.emit('receive-location', { userName, lat, lng, time: new Date() });
            } catch(err) { console.error('خطأ في حفظ الموقع:', err); }
        }
    });
    
    socket.on('disconnect', () => {
        console.log('❌ مستخدم غير متصل:', socket.id);
    });
});

// ==================== مسارات المصادقة ====================
app.post('/api/login', async (req, res) => {
    const { name, pass } = req.body;
    const user = await User.findOne({ name, pass, enabled: true });
    if (!user) return res.status(401).json({ error: 'بيانات غير صحيحة' });
    
    req.session.userId = user._id;
    req.session.userRole = user.role;
    req.session.userName = user.name;
    
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const currentTime = new Date().toLocaleString('ar-EG');
    
    await sendLoginEmail(user.name, user.role, currentTime, ip);
    
    res.json({ id: user._id, name: user.name, role: user.role });
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

// ==================== مسارات المراكب ====================
app.get('/api/vessels', isAuthenticated, async (req, res) => {
    const vessels = await Vessel.find().sort({ createdAt: -1 });
    res.json(vessels);
});

app.post('/api/vessels', isAuthenticated, hasRole(['مسؤول', 'محرر']), async (req, res) => {
    const vessel = new Vessel(req.body);
    await vessel.save();
    res.status(201).json(vessel);
});

app.put('/api/vessels/:id', isAuthenticated, hasRole(['مسؤول', 'محرر']), async (req, res) => {
    const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(vessel);
});

app.delete('/api/vessels/:id', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    await Vessel.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// ==================== مسارات المستخدمين ====================
app.get('/api/users', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    const users = await User.find().select('-pass');
    res.json(users);
});

app.post('/api/users', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    const { name, pass, role } = req.body;
    const existing = await User.findOne({ name });
    if (existing) return res.status(400).json({ error: 'اسم المستخدم موجود' });
    const user = new User({ name, pass, role, enabled: true });
    await user.save();
    res.status(201).json({ id: user._id, name, role });
});

app.put('/api/users/:id', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-pass');
    res.json(user);
});

app.delete('/api/users/:id', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// ==================== مسارات التذاكر ====================
app.get('/api/tickets', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    const tickets = await Ticket.find().sort({ createdAt: -1 });
    res.json(tickets);
});

app.post('/api/tickets', isAuthenticated, async (req, res) => {
    const ticket = new Ticket(req.body);
    await ticket.save();
    res.status(201).json(ticket);
});

app.put('/api/tickets/:id/reply', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
    ticket.replies.push(req.body.reply);
    ticket.status = 'تم الرد';
    await ticket.save();
    res.json(ticket);
});

app.put('/api/tickets/:id/close', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
    ticket.status = 'مغلقة';
    await ticket.save();
    res.json(ticket);
});

// ==================== مسارات سجل التتبع ====================
app.get('/api/logs', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    const logs = await Log.find().sort({ createdAt: -1 });
    res.json(logs);
});

app.post('/api/logs', isAuthenticated, async (req, res) => {
    const log = new Log(req.body);
    await log.save();
    res.status(201).json(log);
});

// ==================== مسارات مواقع GPS ====================
app.get('/api/locations', isAuthenticated, async (req, res) => {
    const locations = await Location.find().sort({ timestamp: -1 }).limit(100);
    res.json(locations);
});

// ==================== مسارات التصدير والاستيراد ====================
app.get('/api/export-all', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    const vessels = await Vessel.find();
    const users = await User.find().select('-pass');
    const tickets = await Ticket.find();
    const logs = await Log.find();
    res.json({ vessels, users, tickets, logs });
});

app.post('/api/import-all', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    const { vessels, users, tickets, logs } = req.body;
    if (vessels) await Vessel.deleteMany({}) && await Vessel.insertMany(vessels);
    if (users) await User.deleteMany({}) && await User.insertMany(users);
    if (tickets) await Ticket.deleteMany({}) && await Ticket.insertMany(tickets);
    if (logs) await Log.deleteMany({}) && await Log.insertMany(logs);
    res.json({ success: true });
});

// ==================== إنشاء مستخدم admin افتراضي ====================
(async () => {
    const adminExists = await User.findOne({ name: 'admin' });
    if (!adminExists) {
        await User.create({ name: 'admin', pass: '1234', role: 'مسؤول', enabled: true });
        console.log('✅ تم إنشاء مستخدم admin افتراضي (admin / 1234)');
    }
})();

// ==================== تشغيل الخادم ====================
server.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
    console.log(`🔐 admin / 1234`);
    console.log(`📧 إشعارات البريد الإلكتروني: مفعلة`);
    console.log(`🗺️ خريطة GPS و WebSocket: مفعلة`);
});
