const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== الاتصال بقاعدة البيانات ====================
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://marineUser:marineUser@cluster0.ajb5w1z.mongodb.net/marine_fleet?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ متصل بـ MongoDB Atlas بنجاح'))
    .catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message));

// ==================== نماذج قاعدة البيانات ====================

// نموذج المستخدم
const userSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    pass: { type: String, required: true },
    role: { type: String, enum: ['مسؤول', 'محرر', 'مشاهد'], default: 'مشاهد' },
    enabled: { type: Boolean, default: true }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

// نموذج المركب
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

// نموذج تذكرة الدعم
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
}, { timestamps: true });
const Ticket = mongoose.model('Ticket', ticketSchema);

// نموذج سجل النشاطات
const logSchema = new mongoose.Schema({
    userName: String,
    userRole: String,
    action: String,
    details: String,
    date: String,
    time: String
}, { timestamps: true });
const Log = mongoose.model('Log', logSchema);

// ==================== Middleware ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// إدارة الجلسات
app.use(session({
    secret: process.env.SESSION_SECRET || 'marine_system_secret_key_2025',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));

// دوال المساعدة
function isAuthenticated(req, res, next) {
    if (req.session.userId) return next();
    res.status(401).json({ error: 'غير مصرح، يرجى تسجيل الدخول' });
}

function hasRole(roles) {
    return (req, res, next) => {
        if (roles.includes(req.session.userRole)) return next();
        res.status(403).json({ error: 'ليس لديك صلاحية لهذه العملية' });
    };
}

function getCurrentDate() {
    const now = new Date();
    return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
}

function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

// ==================== مسارات المصادقة ====================

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    const { name, pass } = req.body;
    console.log('📝 محاولة تسجيل دخول:', name);
    
    try {
        const user = await User.findOne({ name, pass, enabled: true });
        if (!user) {
            console.log('❌ فشل تسجيل الدخول: مستخدم غير موجود');
            return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
        
        req.session.userId = user._id;
        req.session.userRole = user.role;
        req.session.userName = user.name;
        
        console.log('✅ تسجيل دخول ناجح:', name);
        res.json({ id: user._id, name: user.name, role: user.role });
    } catch (err) {
        console.error('❌ خطأ في تسجيل الدخول:', err);
        res.status(500).json({ error: 'خطأ داخلي في السيرفر' });
    }
});

// تسجيل الخروج
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// التحقق من الجلسة
app.get('/api/check-session', (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true, user: { name: req.session.userName, role: req.session.userRole } });
    } else {
        res.json({ loggedIn: false });
    }
});

// ==================== مسارات المراكب ====================

// جلب جميع المراكب
app.get('/api/vessels', isAuthenticated, async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json(vessels);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// إضافة مركب جديد
app.post('/api/vessels', isAuthenticated, hasRole(['مسؤول', 'محرر']), async (req, res) => {
    try {
        const vessel = new Vessel(req.body);
        await vessel.save();
        console.log('✅ تم إضافة مركب جديد:', vessel.name);
        res.status(201).json(vessel);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// تحديث مركب
app.put('/api/vessels/:id', isAuthenticated, hasRole(['مسؤول', 'محرر']), async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
        res.json(vessel);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// حذف مركب
app.delete('/api/vessels/:id', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndDelete(req.params.id);
        if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== مسارات المستخدمين ====================

// جلب جميع المستخدمين (للمسؤول فقط)
app.get('/api/users', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const users = await User.find().select('-pass');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// إضافة مستخدم جديد (للمسؤول فقط)
app.post('/api/users', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const { name, pass, role } = req.body;
        const existing = await User.findOne({ name });
        if (existing) return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
        
        const user = new User({ name, pass, role, enabled: true });
        await user.save();
        res.status(201).json({ id: user._id, name, role });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// تحديث مستخدم (للمسؤول فقط)
app.put('/api/users/:id', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-pass');
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
        res.json(user);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// حذف مستخدم (للمسؤول فقط)
app.delete('/api/users/:id', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== مسارات التذاكر ====================

// جلب جميع التذاكر (للمسؤول فقط)
app.get('/api/tickets', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        res.json(tickets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// إضافة تذكرة جديدة
app.post('/api/tickets', isAuthenticated, async (req, res) => {
    try {
        const ticket = new Ticket(req.body);
        await ticket.save();
        res.status(201).json(ticket);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// الرد على تذكرة (للمسؤول فقط)
app.put('/api/tickets/:id/reply', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
        
        ticket.replies.push(req.body.reply);
        ticket.status = 'تم الرد';
        await ticket.save();
        res.json(ticket);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// إغلاق تذكرة (للمسؤول فقط)
app.put('/api/tickets/:id/close', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
        
        ticket.status = 'مغلقة';
        await ticket.save();
        res.json(ticket);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ==================== مسارات سجل النشاطات ====================

// جلب سجل النشاطات (للمسؤول فقط)
app.get('/api/logs', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const logs = await Log.find().sort({ createdAt: -1 });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// إضافة سجل نشاط
app.post('/api/logs', isAuthenticated, async (req, res) => {
    try {
        const log = new Log(req.body);
        await log.save();
        res.status(201).json(log);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ==================== مسارات التصدير والاستيراد ====================

// تصدير جميع البيانات (للمسؤول فقط)
app.get('/api/export-all', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const vessels = await Vessel.find();
        const users = await User.find().select('-pass');
        const tickets = await Ticket.find();
        const logs = await Log.find();
        res.json({ vessels, users, tickets, logs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// استيراد جميع البيانات (للمسؤول فقط)
app.post('/api/import-all', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const { vessels, users, tickets, logs } = req.body;
        if (vessels) await Vessel.insertMany(vessels);
        if (users) await User.insertMany(users);
        if (tickets) await Ticket.insertMany(tickets);
        if (logs) await Log.insertMany(logs);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ==================== إنشاء مستخدم admin افتراضي ====================
(async () => {
    try {
        const adminExists = await User.findOne({ name: 'admin' });
        if (!adminExists) {
            await User.create({
                name: 'admin',
                pass: '1234',
                role: 'مسؤول',
                enabled: true
            });
            console.log('✅ تم إنشاء مستخدم admin افتراضي (admin / 1234)');
        } else {
            console.log('✅ مستخدم admin موجود بالفعل');
        }
    } catch (err) {
        console.error('❌ خطأ في إنشاء المستخدم:', err.message);
    }
})();

// ==================== تشغيل الخادم ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 ========================================`);
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`🚀 ========================================`);
    console.log(`🔐 تسجيل الدخول:`);
    console.log(`   📧 admin`);
    console.log(`   🔑 1234`);
    console.log(`========================================\n`);
});
