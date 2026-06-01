const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// رابط قاعدة البيانات
const MONGO_URI = 'mongodb+srv://marineUser:marineUser@cluster0.ajb5w1z.mongodb.net/marine_fleet?retryWrites=true&w=majority';

console.log('🔄 جاري الاتصال بقاعدة البيانات...');

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ متصل بـ MongoDB Atlas'))
    .catch(err => console.error('❌ خطأ في الاتصال:', err.message));

// نماذج البيانات
const userSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    pass: { type: String, required: true },
    role: { type: String, default: 'مشاهد' },
    enabled: { type: Boolean, default: true }
});
const User = mongoose.model('User', userSchema);

const vesselSchema = new mongoose.Schema({
    name: String, num: String, len: Number, reg: String,
    zone: String, port: String, supp: String, stat: String,
    break: String, fDate: Date, eDate: Date, ref: String, cat: String
});
const Vessel = mongoose.model('Vessel', vesselSchema);

const ticketSchema = new mongoose.Schema({
    userName: String, userRole: String, subject: String, message: String,
    date: String, time: String, status: String, replies: Array
});
const Ticket = mongoose.model('Ticket', ticketSchema);

const logSchema = new mongoose.Schema({
    userName: String, userRole: String, action: String,
    details: String, date: String, time: String
});
const Log = mongoose.model('Log', logSchema);

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(session({ secret: 'secret', resave: false, saveUninitialized: true }));

function isAuth(req, res, next) {
    if (req.session.userId) return next();
    res.status(401).json({ error: 'غير مصرح' });
}

// ==================== API Routes ====================

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    const { name, pass } = req.body;
    console.log('محاولة تسجيل دخول:', name);
    try {
        const user = await User.findOne({ name, pass, enabled: true });
        if (!user) return res.status(401).json({ error: 'بيانات غير صحيحة' });
        req.session.userId = user._id;
        req.session.userRole = user.role;
        req.session.userName = user.name;
        res.json({ id: user._id, name: user.name, role: user.role });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'خطأ في السيرفر' });
    }
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

// المراكب
app.get('/api/vessels', isAuth, async (req, res) => {
    const vessels = await Vessel.find().sort({ createdAt: -1 });
    res.json(vessels);
});

app.post('/api/vessels', isAuth, async (req, res) => {
    const vessel = new Vessel(req.body);
    await vessel.save();
    res.status(201).json(vessel);
});

app.put('/api/vessels/:id', isAuth, async (req, res) => {
    const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(vessel);
});

app.delete('/api/vessels/:id', isAuth, async (req, res) => {
    await Vessel.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// المستخدمين
app.get('/api/users', isAuth, async (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json([]);
    const users = await User.find().select('-pass');
    res.json(users);
});

app.post('/api/users', isAuth, async (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مسموح' });
    const { name, pass, role } = req.body;
    const existing = await User.findOne({ name });
    if (existing) return res.status(400).json({ error: 'اسم المستخدم موجود' });
    const user = new User({ name, pass, role, enabled: true });
    await user.save();
    res.status(201).json({ id: user._id, name, role });
});

app.put('/api/users/:id', isAuth, async (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مسموح' });
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-pass');
    res.json(user);
});

app.delete('/api/users/:id', isAuth, async (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مسموح' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// التذاكر
app.get('/api/tickets', isAuth, async (req, res) => {
    const tickets = await Ticket.find();
    res.json(tickets);
});

app.post('/api/tickets', isAuth, async (req, res) => {
    const ticket = new Ticket(req.body);
    await ticket.save();
    res.status(201).json(ticket);
});

app.put('/api/tickets/:id/reply', isAuth, async (req, res) => {
    const ticket = await Ticket.findById(req.params.id);
    ticket.replies.push(req.body.reply);
    ticket.status = 'تم الرد';
    await ticket.save();
    res.json(ticket);
});

app.put('/api/tickets/:id/close', isAuth, async (req, res) => {
    const ticket = await Ticket.findById(req.params.id);
    ticket.status = 'مغلقة';
    await ticket.save();
    res.json(ticket);
});

// سجل النشاطات
app.get('/api/logs', isAuth, async (req, res) => {
    const logs = await Log.find();
    res.json(logs);
});

app.post('/api/logs', isAuth, async (req, res) => {
    const log = new Log(req.body);
    await log.save();
    res.status(201).json(log);
});

// تصدير واستيراد
app.get('/api/export-all', isAuth, async (req, res) => {
    const vessels = await Vessel.find();
    const users = await User.find().select('-pass');
    const tickets = await Ticket.find();
    const logs = await Log.find();
    res.json({ vessels, users, tickets, logs });
});

app.post('/api/import-all', isAuth, async (req, res) => {
    const { vessels, users, tickets, logs } = req.body;
    if (vessels) await Vessel.insertMany(vessels);
    if (users) await User.insertMany(users);
    if (tickets) await Ticket.insertMany(tickets);
    if (logs) await Log.insertMany(logs);
    res.json({ success: true });
});

// إنشاء مستخدم admin
(async () => {
    try {
        const adminExists = await User.findOne({ name: 'admin' });
        if (!adminExists) {
            await User.create({ name: 'admin', pass: '1234', role: 'مسؤول', enabled: true });
            console.log('✅ تم إنشاء مستخدم admin (admin / 1234)');
        }
    } catch (err) {
        console.error('❌ خطأ:', err.message);
    }
})();

// تشغيل الخادم
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`🔐 admin / 1234`);
    console.log(`✅ متصل بـ MongoDB Atlas`);
});
