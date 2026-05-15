const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ الاتصال بـ MongoDB Atlas
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://hamza:hamza123@cluster0.ajb5w1z.mongodb.net/marine_fleet?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ متصل بـ MongoDB Atlas بنجاح'))
    .catch(err => console.error('❌ خطأ في الاتصال:', err.message));

// ✅ نموذج المركب
const vesselSchema = new mongoose.Schema({
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
    damageDate: { type: Date },
    endDate: { type: Date },
    reference: { type: String, default: '' }
});

const Vessel = mongoose.model('Vessel', vesselSchema);

// ✅ Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ✅ إعداد الجلسات
app.use(session({
    secret: 'marine_system_secret_key_2025',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 } // ساعة واحدة
}));

// ✅ API: التحقق من الجلسة
app.get('/api/check-session', (req, res) => {
    if (req.session.loggedIn) {
        res.json({ loggedIn: true });
    } else {
        res.json({ loggedIn: false });
    }
});

// ✅ API: تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === 'admin' && password === '1234') {
        req.session.loggedIn = true;
        res.json({ success: true, message: 'تم تسجيل الدخول بنجاح' });
    } else {
        res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
    }
});

// ✅ API: تسجيل الخروج
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// ✅ API: جلب جميع المراكب (يتطلب تسجيل دخول)
app.get('/api/vessels', async (req, res) => {
    if (!req.session.loggedIn) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ✅ API: إضافة مركب جديد (يتطلب تسجيل دخول)
app.post('/api/vessels', async (req, res) => {
    if (!req.session.loggedIn) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    
    try {
        const existingVessel = await Vessel.findOne({ number: req.body.number });
        if (existingVessel) {
            return res.status(400).json({ error: 'مركب بنفس الرقم موجود بالفعل' });
        }
        
        const vessel = new Vessel(req.body);
        await vessel.save();
        console.log('✅ تم حفظ المركب:', vessel.name);
        res.status(201).json(vessel);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ✅ API: حذف مركب (يتطلب تسجيل دخول)
app.delete('/api/vessels/:number', async (req, res) => {
    if (!req.session.loggedIn) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    
    try {
        const deleted = await Vessel.findOneAndDelete({ number: req.params.number });
        if (!deleted) {
            return res.status(404).json({ error: 'المركب غير موجود' });
        }
        res.json({ message: 'تم الحذف' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ✅ تشغيل الخادم
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
    console.log(`📡 رابط التطبيق: http://localhost:${PORT}`);
    console.log(`🗄️ قاعدة البيانات: MongoDB Atlas`);
    console.log(`🔐 تسجيل الدخول: admin / 1234`);
});
