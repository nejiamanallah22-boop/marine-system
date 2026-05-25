const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// استخدام متغير البيئة للاتصال
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ خطأ: متغير MONGO_URI غير موجود في البيئة');
    process.exit(1);
}

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ متصل بـ MongoDB Atlas'))
    .catch(err => console.error('❌ خطأ في الاتصال:', err.message));

// نماذج بسيطة
const userSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    pass: { type: String, required: true },
    role: { type: String, default: 'مشاهد' },
    enabled: { type: Boolean, default: true }
});
const User = mongoose.model('User', userSchema);

app.use(express.json());
app.use(express.static('public'));
app.use(session({ secret: 'secret', resave: false, saveUninitialized: true }));

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    console.log('محاولة تسجيل دخول:', req.body.name);
    try {
        const user = await User.findOne({ name: req.body.name, pass: req.body.pass, enabled: true });
        if (!user) {
            return res.status(401).json({ error: 'بيانات غير صحيحة' });
        }
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

// إنشاء مستخدم admin افتراضي
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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`🔐 admin / 1234`);
});
