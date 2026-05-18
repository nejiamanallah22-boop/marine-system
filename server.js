const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------- الاتصال بقاعدة البيانات --------------------
const MONGO_URI = 'mongodb+srv://hamza:hamza123@cluster0.ajb5w1z.mongodb.net/marine_fleet?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ متصل بـ MongoDB Atlas'))
    .catch(err => console.log('❌ فشل الاتصال:', err.message));

// ==================== نماذج قاعدة البيانات ====================

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

// نموذج المستخدم
const userSchema = new mongoose.Schema({
    name: { type: String, unique: true, required: true },
    pass: { type: String, required: true }, // سيتم تخزينها مشفرة
    role: { type: String, default: 'مشاهد' },
    enabled: { type: Boolean, default: true }
});

const User = mongoose.model('User', userSchema);

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

// نموذج تذاكر الدعم
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

// ==================== Middleware ====================
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'marine_fleet_secret_key_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 ساعة
}));

// Middleware للتحقق من تسجيل الدخول
const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    next();
};

// ==================== دوال مساعدة ====================
async function hashPassword(password) {
    return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}

// ==================== تهيئة البيانات الافتراضية ====================
async function initializeData() {
    try {
        // إنشاء المستخدمين الافتراضيين إذا لم يوجدوا
        const adminExists = await User.findOne({ name: 'admin' });
        if (!adminExists) {
            const adminPass = await hashPassword('1234');
            await User.create([
                { name: 'admin', pass: adminPass, role: 'مسؤول', enabled: true },
                { name: 'editor', pass: await hashPassword('1234'), role: 'محرر', enabled: true },
                { name: 'viewer', pass: await hashPassword('1234'), role: 'مشاهد', enabled: true }
            ]);
            console.log('✅ تم إنشاء المستخدمين الافتراضيين');
        }
        
        // إنشاء مراكب افتراضية إذا لم يوجدوا
        const vesselsCount = await Vessel.countDocuments();
        if (vesselsCount === 0) {
            await Vessel.create([
                { name: "البروق 1", num: "B001", len: 11, reg: "الشمال", zone: "تونس", port: "تونس", stat: "صالح", cat: "البروق" },
                { name: "صقر 1", num: "S001", len: 10, reg: "الساحل", zone: "سوسة", port: "سوسة", stat: "صالح", cat: "صقور" },
                { name: "خافرة 1", num: "K001", len: 20, reg: "الوسط", zone: "صفاقس", port: "صفاقس", stat: "معطب", break: "محرك", fDate: new Date("2024-03-01"), eDate: new Date("2024-04-01"), ref: "REF001", cat: "خوافر" },
                { name: "زورق 1", num: "Z001", len: 15, reg: "الجنوب", zone: "جربة", port: "جربة", stat: "صيانة", break: "كهرباء", fDate: new Date("2024-02-15"), eDate: new Date("2024-03-15"), ref: "REF002", cat: "زوارق مزدوجة" },
                { name: "طوافة 1", num: "T001", len: 35, reg: "الشمال", zone: "بنزرت", port: "بنزرت", stat: "صالح", cat: "طوافات" }
            ]);
            console.log('✅ تم إنشاء مراكب افتراضية');
        }
    } catch (error) {
        console.error('خطأ في التهيئة:', error);
    }
}

// ==================== مسارات المصادقة ====================
app.post('/api/login', async (req, res) => {
    const { name, pass } = req.body;
    
    if (!name || !pass) {
        return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }
    
    try {
        const user = await User.findOne({ name: name });
        
        if (!user) {
            return res.status(401).json({ error: 'اسم المستخدم غير صحيح' });
        }
        
        if (!user.enabled) {
            return res.status(401).json({ error: 'هذا المستخدم معطل' });
        }
        
        const isValid = await verifyPassword(pass, user.pass);
        
        if (!isValid) {
            return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
        }
        
        req.session.userId = user._id;
        req.session.userName = user.name;
        req.session.userRole = user.role;
        
        res.json({
            name: user.name,
            role: user.role,
            id: user._id
        });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في الخادم' });
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

// ==================== مسارات المراكب ====================
app.get('/api/vessels', requireAuth, async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/vessels', requireAuth, async (req, res) => {
    try {
        const vessel = new Vessel(req.body);
        await vessel.save();
        res.status(201).json(vessel);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put('/api/vessels/:id', requireAuth, async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(vessel);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/vessels/:id', requireAuth, async (req, res) => {
    try {
        await Vessel.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ==================== مسارات المستخدمين ====================
app.get('/api/users', requireAuth, async (req, res) => {
    if (req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    try {
        const users = await User.find().select('-pass');
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users', requireAuth, async (req, res) => {
    if (req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    try {
        const { name, pass, role, enabled } = req.body;
        const hashedPass = await hashPassword(pass);
        const user = new User({ name, pass: hashedPass, role, enabled });
        await user.save();
        res.status(201).json({ id: user._id, name: user.name, role: user.role, enabled: user.enabled });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put('/api/users/:id', requireAuth, async (req, res) => {
    if (req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    try {
        const updateData = { ...req.body };
        if (updateData.pass) {
            updateData.pass = await hashPassword(updateData.pass);
        }
        const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-pass');
        res.json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/users/:id', requireAuth, async (req, res) => {
    if (req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ==================== مسارات سجل النشاطات ====================
app.get('/api/logs', requireAuth, async (req, res) => {
    if (req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    try {
        const logs = await Log.find().sort({ createdAt: -1 }).limit(500);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/logs', requireAuth, async (req, res) => {
    try {
        const log = new Log(req.body);
        await log.save();
        res.status(201).json(log);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ==================== مسارات التذاكر ====================
app.get('/api/tickets', requireAuth, async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        res.json(tickets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/tickets', requireAuth, async (req, res) => {
    try {
        const ticket = new Ticket(req.body);
        await ticket.save();
        res.status(201).json(ticket);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put('/api/tickets/:id/reply', requireAuth, async (req, res) => {
    if (req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ error: 'التذكرة غير موجودة' });
        }
        
        ticket.replies.push(req.body.reply);
        ticket.status = 'تم الرد';
        await ticket.save();
        res.json(ticket);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put('/api/tickets/:id/close', requireAuth, async (req, res) => {
    if (req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ error: 'التذكرة غير موجودة' });
        }
        
        ticket.status = 'مغلقة';
        await ticket.save();
        res.json(ticket);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ==================== مسارات تصدير واستيراد البيانات ====================
app.get('/api/export-all', requireAuth, async (req, res) => {
    if (req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    try {
        const vessels = await Vessel.find();
        const users = await User.find().select('-pass');
        const logs = await Log.find();
        const tickets = await Ticket.find();
        
        res.json({
            vessels,
            users,
            logs,
            tickets,
            exportDate: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/import-all', requireAuth, async (req, res) => {
    if (req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    try {
        const { vessels, users, logs, tickets } = req.body;
        
        if (vessels && vessels.length) {
            await Vessel.deleteMany({});
            await Vessel.insertMany(vessels);
        }
        
        if (tickets && tickets.length) {
            await Ticket.deleteMany({});
            await Ticket.insertMany(tickets);
        }
        
        if (logs && logs.length) {
            await Log.deleteMany({});
            await Log.insertMany(logs);
        }
        
        res.json({ success: true, message: 'تم استيراد البيانات بنجاح' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== تشغيل الخادم ====================
app.listen(PORT, async () => {
    await initializeData();
    console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`);
    console.log(`🔐 بيانات الدخول:`);
    console.log(`   admin / 1234 (مسؤول كامل الصلاحيات)`);
    console.log(`   editor / 1234 (محرر)`);
    console.log(`   viewer / 1234 (مشاهد فقط)`);
});
