// server.js
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// ==================== الاتصال بقاعدة البيانات ====================
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ MONGO_URI غير موجود في متغيرات البيئة!');
    console.log('💡 أضف MONGO_URI في Environment Variables في Render');
    process.exit(1);
}

console.log('📡 محاولة الاتصال بقاعدة البيانات...');

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
})
.then(() => console.log('✅ متصل بـ MongoDB بنجاح'))
.catch(err => {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
    console.log('💡 تأكد من:');
    console.log('   1. صحة اسم المستخدم وكلمة المرور');
    console.log('   2. إضافة 0.0.0.0/0 في Network Access');
    console.log('   3. أن الرابط صحيح');
});

// ==================== Middleware ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ تصحيح: خدمة الملفات من مجلد public
app.use(express.static(path.join(__dirname, 'public')));

// ✅ تصحيح: مسار الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// إدارة الجلسات
app.use(session({
    secret: process.env.SESSION_SECRET || 'marine_system_secret_key_2025',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 3600000,
        secure: process.env.NODE_ENV === 'production'
    }
}));

// ... باقي الكود (نماذج قاعدة البيانات، المسارات، إلخ) ...

// ==================== تشغيل الخادم ====================
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 ========================================`);
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`🚀 ========================================`);
    console.log(`🔐 تسجيل الدخول:`);
    console.log(`   📧 admin`);
    console.log(`   🔑 1234`);
    console.log(`========================================\n`);
});
