const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// تخزين الجلسات البسيط (بدون express-session)
const sessions = new Map();

// نماذج MongoDB
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' }
});
const User = mongoose.model('User', UserSchema);

const VesselSchema = new mongoose.Schema({
    name: { type: String, required: true },
    number: { type: String, required: true, unique: true },
    length: { type: Number, default: 0 },
    category: { type: String, default: '' },
    region: { type: String, default: '' },
    zone: { type: String, default: '' },
    port: { type: String, default: '' },
    reinforcement: { type: String, default: '' },
    status: { type: String, default: 'نشط' },
    damage: { type: String, default: '' },
    damageDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    reference: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});
const Vessel = mongoose.model('Vessel', VesselSchema);

// الاتصال بـ MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ تم الاتصال بـ MongoDB Atlas');
        initializeDatabase();
    })
    .catch(err => console.error('❌ خطأ في الاتصال:', err));

async function initializeDatabase() {
    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists) {
        await User.create({ username: 'admin', password: 'admin123', role: 'admin' });
        console.log('✅ تم إنشاء المستخدم: admin / admin123');
    }
    const userExists = await User.findOne({ username: 'user' });
    if (!userExists) {
        await User.create({ username: 'user', password: 'user123', role: 'user' });
        console.log('✅ تم إنشاء المستخدم: user / user123');
    }
}

// التحقق من الجلسة
app.get('/api/check-session', (req, res) => {
    const token = req.headers.authorization;
    if (token && sessions.has(token)) {
        res.json({ loggedIn: true, username: sessions.get(token) });
    } else {
        res.json({ loggedIn: false });
    }
});

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    const user = await User.findOne({ username, password });
    if (user) {
        const token = Date.now().toString() + Math.random().toString();
        sessions.set(token, username);
        res.json({ success: true, token, username: user.username });
    } else {
        res.status(401).json({ success: false, message: 'بيانات غير صحيحة' });
    }
});

// تسجيل الخروج
app.post('/api/logout', (req, res) => {
    const token = req.headers.authorization;
    sessions.delete(token);
    res.json({ success: true });
});

// جلب المراكب
app.get('/api/vessels', async (req, res) => {
    const vessels = await Vessel.find().sort({ createdAt: -1 });
    res.json(vessels);
});

// إضافة مركب
app.post('/api/vessels', async (req, res) => {
    try {
        const existing = await Vessel.findOne({ number: req.body.number });
        if (existing) {
            return res.status(400).json({ message: 'الرقم موجود مسبقاً' });
        }
        const vessel = new Vessel(req.body);
        await vessel.save();
        res.status(201).json(vessel);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الحفظ' });
    }
});

// حذف مركب
app.delete('/api/vessels/:number', async (req, res) => {
    await Vessel.findOneAndDelete({ number: req.params.number });
    res.json({ message: 'تم الحذف' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على port ${PORT}`));
