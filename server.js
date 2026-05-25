const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// الاتصال بقاعدة البيانات
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://hamza:hamza123@cluster0.ajb5w1z.mongodb.net/marine_fleet?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ متصل بـ MongoDB Atlas'))
    .catch(err => console.error('❌ خطأ:', err.message));

// نماذج بسيطة
const vesselSchema = new mongoose.Schema({
    name: String, num: String, len: Number, reg: String,
    zone: String, port: String, stat: String
});
const Vessel = mongoose.model('Vessel', vesselSchema);

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    pass: { type: String, required: true },
    role: { type: String, default: 'مشاهد' },
    enabled: { type: Boolean, default: true }
});
const User = mongoose.model('User', userSchema);

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(session({ secret: 'secret', resave: false, saveUninitialized: true }));

// تسجيل الدخول (مبسط)
app.post('/api/login', async (req, res) => {
    console.log('محاولة تسجيل دخول:', req.body);
    const { name, pass } = req.body;
    try {
        const user = await User.findOne({ name, pass, enabled: true });
        if (!user) {
            console.log('❌ مستخدم غير موجود:', name);
            return res.status(401).json({ error: 'بيانات غير صحيحة' });
        }
        req.session.userId = user._id;
        req.session.userRole = user.role;
        req.session.userName = user.name;
        console.log('✅ تسجيل دخول ناجح:', name);
        res.json({ id: user._id, name: user.name, role: user.role });
    } catch (err) {
        console.error('❌ خطأ في تسجيل الدخول:', err);
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

// API المراكب
app.get('/api/vessels', async (req, res) => {
    if (!req.session.userId) return res.status(401).json([]);
    const vessels = await Vessel.find();
    res.json(vessels);
});

app.post('/api/vessels', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    const vessel = new Vessel(req.body);
    await vessel.save();
    res.status(201).json(vessel);
});

app.put('/api/vessels/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(vessel);
});

app.delete('/api/vessels/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    await Vessel.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// API المستخدمين
app.get('/api/users', async (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') return res.status(403).json([]);
    const users = await User.find().select('-pass');
    res.json(users);
});

app.post('/api/users', async (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مسموح' });
    const { name, pass, role } = req.body;
    const existing = await User.findOne({ name });
    if (existing) return res.status(400).json({ error: 'اسم المستخدم موجود' });
    const user = new User({ name, pass, role, enabled: true });
    await user.save();
    res.status(201).json({ id: user._id, name, role });
});

app.put('/api/users/:id', async (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مسموح' });
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-pass');
    res.json(user);
});

app.delete('/api/users/:id', async (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مسموح' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// تصدير واستيراد
app.get('/api/export-all', async (req, res) => {
    const vessels = await Vessel.find();
    const users = await User.find().select('-pass');
    res.json({ vessels, users });
});

app.post('/api/import-all', async (req, res) => {
    const { vessels, users } = req.body;
    if (vessels) await Vessel.insertMany(vessels);
    if (users) await User.insertMany(users);
    res.json({ success: true });
});

// إنشاء مستخدم admin افتراضي
(async () => {
    const adminExists = await User.findOne({ name: 'admin' });
    if (!adminExists) {
        await User.create({ name: 'admin', pass: '1234', role: 'مسؤول', enabled: true });
        console.log('✅ تم إنشاء مستخدم admin (admin / 1234)');
    } else {
        console.log('✅ مستخدم admin موجود بالفعل');
    }
})();

// تشغيل الخادم
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`🔐 admin / 1234`);
});
