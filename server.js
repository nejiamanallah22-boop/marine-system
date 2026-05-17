const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();

// ================= إعدادات أساسية =================
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'my_super_secret_key_change_me';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/marine_db';

// ================= الحصول على IP المحلي للكمبيوتر =================
function getLocalIp() {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// ================= Middleware =================
// مهم جداً: السماح لجميع الأصول (من الهاتف أو أي جهاز)
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public')); // إذا كانت الواجهة موجودة في مجلد public

// ================= نماذج قاعدة البيانات =================
const userSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    pass: { type: String, required: true },
    role: { type: String, default: 'مشاهد', enum: ['مسؤول', 'محرر', 'مشاهد'] },
    enabled: { type: Boolean, default: true }
});
userSchema.pre('save', async function(next) {
    if (this.isModified('pass')) this.pass = await bcrypt.hash(this.pass, 12);
    next();
});
userSchema.methods.comparePassword = async function(candidate) {
    return bcrypt.compare(candidate, this.pass);
};
const User = mongoose.model('User', userSchema);

const vesselSchema = new mongoose.Schema({
    name: String, num: String, len: Number, reg: String, zone: String,
    port: String, supp: String, stat: String, break: String,
    fDate: String, eDate: String, ref: String, cat: String
}, { timestamps: true });
const Vessel = mongoose.model('Vessel', vesselSchema);

const ticketSchema = new mongoose.Schema({
    userName: String, userRole: String, subject: String, message: String,
    status: { type: String, default: 'قيد المعالجة' },
    replies: [{ adminName: String, reply: String, date: String, time: String }],
    date: String, time: String
}, { timestamps: true });
const Ticket = mongoose.model('Ticket', ticketSchema);

const logSchema = new mongoose.Schema({
    userName: String, userRole: String, action: String, details: String,
    ip: String, device: String, date: String, time: String
}, { timestamps: true });
const Log = mongoose.model('Log', logSchema);

// ================= دوال مساعدة =================
const getCurrentDate = () => {
    const d = new Date();
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
};
const getCurrentTime = () => {
    const d = new Date();
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};
const formatDoc = (doc) => {
    if (!doc) return null;
    const obj = doc.toObject();
    const { _id, __v, pass, ...rest } = obj;
    return { ...rest, id: _id.toString() };
};
const formatArray = (arr) => arr.map(formatDoc);

// ================= وسائط المصادقة والصلاحيات =================
const auth = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'غير مصرح' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user || !user.enabled) return res.status(401).json({ error: 'حساب غير صالح' });
        req.user = user;
        req.userId = user._id;
        req.userRole = user.role;
        req.userName = user.name;
        next();
    } catch {
        res.status(401).json({ error: 'رمز غير صالح' });
    }
};
const checkRole = (roles) => (req, res, next) => {
    if (!roles.includes(req.userRole)) return res.status(403).json({ error: 'غير مسموح' });
    next();
};

// ================= مسارات API =================
// المصادقة
app.post('/api/login', async (req, res) => {
    const { name, pass } = req.body;
    const user = await User.findOne({ name });
    if (!user || !(await user.comparePassword(pass)))
        return res.status(401).json({ error: 'بيانات غير صحيحة' });
    const token = jwt.sign({ id: user._id, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, name: user.name, role: user.role });
});
app.post('/api/logout', auth, (req, res) => res.json({ success: true }));
app.get('/api/verify', auth, (req, res) => res.json({ valid: true, name: req.userName, role: req.userRole }));

// المراكب
app.get('/api/vessels', auth, async (req, res) => {
    const vessels = await Vessel.find().sort({ createdAt: -1 });
    res.json(formatArray(vessels));
});
app.post('/api/vessels', auth, checkRole(['مسؤول', 'محرر']), async (req, res) => {
    const vessel = await Vessel.create(req.body);
    res.status(201).json(formatDoc(vessel));
});
app.put('/api/vessels/:id', auth, checkRole(['مسؤول', 'محرر']), async (req, res) => {
    const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(formatDoc(vessel));
});
app.delete('/api/vessels/:id', auth, checkRole(['مسؤول']), async (req, res) => {
    await Vessel.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// التذاكر
app.get('/api/tickets', auth, checkRole(['مسؤول', 'محرر']), async (req, res) => {
    const tickets = await Ticket.find().sort({ createdAt: -1 });
    res.json(formatArray(tickets));
});
app.post('/api/tickets', auth, async (req, res) => {
    const { subject, message } = req.body;
    const ticket = await Ticket.create({
        userName: req.userName, userRole: req.userRole, subject, message,
        date: getCurrentDate(), time: getCurrentTime(), status: 'قيد المعالجة', replies: []
    });
    res.status(201).json(formatDoc(ticket));
});
app.put('/api/tickets/:id/reply', auth, checkRole(['مسؤول', 'محرر']), async (req, res) => {
    const ticket = await Ticket.findById(req.params.id);
    const { reply } = req.body;
    ticket.replies.push({ adminName: req.userName, reply: reply.reply, date: getCurrentDate(), time: getCurrentTime() });
    ticket.status = 'تم الرد';
    await ticket.save();
    res.json({ success: true });
});
app.put('/api/tickets/:id/close', auth, checkRole(['مسؤول', 'محرر']), async (req, res) => {
    await Ticket.findByIdAndUpdate(req.params.id, { status: 'مغلقة' });
    res.json({ success: true });
});

// المستخدمين
app.get('/api/users', auth, checkRole(['مسؤول']), async (req, res) => {
    const users = await User.find().select('-pass');
    res.json(formatArray(users));
});
app.post('/api/users', auth, checkRole(['مسؤول']), async (req, res) => {
    const { name, pass, role } = req.body;
    const user = await User.create({ name, pass, role: role || 'مشاهد', enabled: true });
    res.status(201).json(formatDoc(user));
});
app.put('/api/users/:id', auth, checkRole(['مسؤول']), async (req, res) => {
    const user = await User.findById(req.params.id);
    if (req.body.pass) user.pass = req.body.pass;
    if (req.body.role) user.role = req.body.role;
    if (req.body.enabled !== undefined) user.enabled = req.body.enabled;
    await user.save();
    res.json(formatDoc(user));
});
app.delete('/api/users/:id', auth, checkRole(['مسؤول']), async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// سجل الأنشطة
app.get('/api/logs', auth, checkRole(['مسؤول']), async (req, res) => {
    const logs = await Log.find().sort({ createdAt: -1 }).limit(200);
    res.json(formatArray(logs));
});
app.post('/api/logs', auth, async (req, res) => {
    const { action, details } = req.body;
    await Log.create({ userName: req.userName, userRole: req.userRole, action, details, ip: req.ip, device: req.headers['user-agent'], date: getCurrentDate(), time: getCurrentTime() });
    res.json({ success: true });
});

// تصدير واستيراد
app.get('/api/export-all', auth, checkRole(['مسؤول']), async (req, res) => {
    const vessels = await Vessel.find();
    const users = await User.find().select('-pass');
    const tickets = await Ticket.find();
    res.json({ vessels, users, tickets });
});
app.post('/api/import-all', auth, checkRole(['مسؤول']), async (req, res) => {
    const { vessels, users, tickets } = req.body;
    if (vessels) { await Vessel.deleteMany({}); await Vessel.insertMany(vessels); }
    if (users) { await User.deleteMany({}); for (const u of users) await User.create({ name: u.name, pass: u.pass, role: u.role, enabled: u.enabled }); }
    if (tickets) { await Ticket.deleteMany({}); await Ticket.insertMany(tickets); }
    res.json({ success: true });
});

// إحصائيات
app.get('/api/stats', auth, checkRole(['مسؤول']), async (req, res) => {
    res.json({ vessels: await Vessel.countDocuments(), tickets: await Ticket.countDocuments(), users: await User.countDocuments() });
});

// فحص الصحة
app.get('/api/health', (req, res) => res.json({ status: 'OK', mongo: mongoose.connection.readyState === 1 }));

// ================= تقديم الواجهة الأمامية إذا كانت في مجلد public =================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================= بيانات افتراضية =================
async function init() {
    if (!await User.findOne({ name: 'admin' })) {
        await User.create({ name: 'admin', pass: 'Admin@123456', role: 'مسؤول', enabled: true });
        await User.create({ name: 'editor', pass: 'Editor@123456', role: 'محرر', enabled: true });
        await User.create({ name: 'viewer', pass: 'Viewer@123456', role: 'مشاهد', enabled: true });
        console.log('✅ تم إنشاء المستخدمين');
    }
    if ((await Vessel.countDocuments()) === 0) {
        await Vessel.insertMany([
            { name: "البروق 1", num: "B001", len: 11, reg: "الشمال", stat: "صالح", cat: "البروق" },
            { name: "صقر 1", num: "S001", len: 10, reg: "الساحل", stat: "صالح", cat: "صقور" },
            { name: "خافرة 1", num: "K001", len: 20, reg: "الوسط", stat: "معطب", break: "عطل محرك", fDate: "2025-04-01", cat: "خوافر" }
        ]);
        console.log('✅ تم إنشاء مراكب افتراضية');
    }
}

// ================= تشغيل السيرفر على 0.0.0.0 =================
mongoose.connect(MONGO_URI, { maxPoolSize: 10 })
    .then(async () => {
        console.log('✅ متصل بقاعدة البيانات');
        await init();
        const localIp = getLocalIp();
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n🚀 السيرفر يعمل على:`);
            console.log(`📡 محلياً: http://localhost:${PORT}`);
            console.log(`📱 من الهاتف أو أي جهاز في نفس الشبكة: http://${localIp}:${PORT}`);
            console.log(`\n👤 بيانات الدخول:`);
            console.log(`   admin   / Admin@123456`);
            console.log(`   editor  / Editor@123456`);
            console.log(`   viewer  / Viewer@123456`);
        });
    })
    .catch(err => {
        console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message);
        process.exit(1);
    });
