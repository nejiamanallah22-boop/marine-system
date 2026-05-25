const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// رابط قاعدة البيانات
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://fleet_user:Marine2025@cluster0.ajb5w1z.mongodb.net/marine_fleet?retryWrites=true&w=majority';

console.log('🔄 جاري الاتصال بقاعدة البيانات...');

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ متصل بـ MongoDB Atlas'))
    .catch(err => console.error('❌ خطأ:', err.message));

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
    zone: String, port: String, stat: String
});
const Vessel = mongoose.model('Vessel', vesselSchema);

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(session({ secret: 'secret', resave: false, saveUninitialized: true }));

// ==================== API Routes ====================

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    console.log('📝 محاولة تسجيل دخول:', req.body.name);
    try {
        const user = await User.findOne({ name: req.body.name, pass: req.body.pass, enabled: true });
        if (!user) {
            console.log('❌ فشل: مستخدم غير موجود');
            return res.status(401).json({ error: 'بيانات غير صحيحة' });
        }
        req.session.userId = user._id;
        req.session.userRole = user.role;
        req.session.userName = user.name;
        console.log('✅ تسجيل دخول ناجح:', req.body.name);
        res.json({ id: user._id, name: user.name, role: user.role });
    } catch (err) {
        console.error('❌ خطأ:', err);
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

// المستخدمين
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

// إنشاء مستخدم admin تلقائياً
(async () => {
    try {
        const adminExists = await User.findOne({ name: 'admin' });
        if (!adminExists) {
            await User.create({ name: 'admin', pass: '1234', role: 'مسؤول', enabled: true });
            console.log('✅ تم إنشاء مستخدم admin (admin / 1234)');
        } else {
            console.log('✅ مستخدم admin موجود بالفعل');
        }
    } catch (err) {
        console.error('❌ خطأ في إنشاء المستخدم:', err.message);
    }
})();

// تشغيل الخادم
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`🔐 admin / 1234`);
    console.log(`📡 رابط التطبيق: https://marine-system-71eo.onrender.com`);
});
