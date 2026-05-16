const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== الاتصال بقاعدة البيانات ==========
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ تم الاتصال بـ MongoDB Atlas');
        initializeDatabase();
    })
    .catch(err => console.error('❌ خطأ في الاتصال:', err.message));

// ========== نماذج MongoDB ==========

// نموذج المستخدم
const User = mongoose.model('User', new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    pass: { type: String, required: true },
    role: { type: String, default: 'مشاهد' },
    enabled: { type: Boolean, default: true }
}));

// نموذج المركب
const Vessel = mongoose.model('Vessel', new mongoose.Schema({
    name: { type: String, required: true },
    num: { type: String, default: '' },
    len: { type: Number, default: 0 },
    reg: { type: String, default: '' },
    zone: { type: String, default: '' },
    port: { type: String, default: '' },
    supp: { type: String, default: '' },
    stat: { type: String, default: 'صالح' },
    break: { type: String, default: '' },
    fDate: { type: String, default: '' },
    eDate: { type: String, default: '' },
    ref: { type: String, default: '' },
    cat: { type: String, default: '' }
}));

// نموذج التذكرة
const Ticket = mongoose.model('Ticket', new mongoose.Schema({
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    status: { type: String, default: 'قيد المعالجة' },
    replies: { type: Array, default: [] }
}, { timestamps: true }));

// نموذج سجل النشاطات
const Log = mongoose.model('Log', new mongoose.Schema({
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    action: { type: String, required: true },
    details: { type: String, default: '' },
    date: { type: String, default: () => {
        const now = new Date();
        return `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}`;
    }},
    time: { type: String, default: () => {
        const now = new Date();
        return `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    }}
}));

// ========== تهيئة قاعدة البيانات ==========
async function initializeDatabase() {
    try {
        // 1. إنشاء المستخدمين
        const adminExists = await User.findOne({ name: 'admin' });
        if (!adminExists) {
            await User.create({ name: 'admin', pass: 'admin123', role: 'مسؤول', enabled: true });
            await User.create({ name: 'editor', pass: 'editor123', role: 'محرر', enabled: true });
            await User.create({ name: 'viewer', pass: 'viewer123', role: 'مشاهد', enabled: true });
            console.log('✅ تم إنشاء المستخدمين');
        }

        // 2. إنشاء المراكب (بينها معطوبة)
        const vesselsCount = await Vessel.countDocuments();
        if (vesselsCount === 0) {
            await Vessel.insertMany([
                { name: "البروق 1", num: "B001", len: 11, reg: "الشمال", zone: "تونس", port: "تونس", supp: "قاعدة الشمال", stat: "صالح", cat: "البروق" },
                { name: "صقر 1", num: "S001", len: 10, reg: "الساحل", zone: "سوسة", port: "سوسة", supp: "قاعدة الساحل", stat: "صالح", cat: "صقور" },
                { name: "طوافة 1", num: "T001", len: 35, reg: "الشمال", zone: "بنزرت", port: "بنزرت", supp: "قاعدة الشمال", stat: "صالح", cat: "طوافات" },
                { name: "خافرة 1", num: "K001", len: 20, reg: "الوسط", zone: "صفاقس", port: "صفاقس", supp: "قاعدة الوسط", stat: "معطب", break: "عطل في المحرك الرئيسي", fDate: "2025-03-10", eDate: "2025-04-10", ref: "REF001", cat: "خوافر" },
                { name: "زورق 1", num: "Z001", len: 15, reg: "الجنوب", zone: "جربة", port: "جربة", supp: "قاعدة الجنوب", stat: "صيانة", break: "صيانة دورية", fDate: "2025-03-15", eDate: "2025-04-05", ref: "REF002", cat: "زوارق مزدوجة" },
                { name: "البروق 2", num: "B002", len: 11, reg: "الساحل", zone: "المنستير", port: "المنستير", supp: "قاعدة الساحل", stat: "معطب", break: "عطل في الكهرباء", fDate: "2025-03-20", eDate: "2025-04-15", ref: "REF003", cat: "البروق" },
                { name: "صقر 2", num: "S002", len: 9, reg: "الوسط", zone: "المهدية", port: "المهدية", supp: "قاعدة الوسط", stat: "صيانة", break: "تغيير زيوت", fDate: "2025-03-25", eDate: "2025-04-08", ref: "REF004", cat: "صقور" }
            ]);
            console.log('✅ تم إنشاء 7 مراكب (3 صالح + 2 معطب + 2 صيانة)');
        }

        // 3. إنشاء تذكرة
        const ticketsCount = await Ticket.countDocuments();
        if (ticketsCount === 0) {
            await Ticket.create({
                userName: "viewer",
                userRole: "مشاهد",
                subject: "مشكلة في عرض البيانات",
                message: "البيانات لا تظهر بشكل صحيح في جدول الأسطول البحري",
                date: new Date().toLocaleDateString('ar-EG'),
                time: new Date().toLocaleTimeString('ar-EG'),
                status: "قيد المعالجة",
                replies: []
            });
            console.log('✅ تم إنشاء تذكرة افتراضية');
        }

        console.log('🎉 تم تهيئة قاعدة البيانات بنجاح!');
    } catch (error) {
        console.error('❌ خطأ في تهيئة قاعدة البيانات:', error);
    }
}

// ========== Routes ==========

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    try {
        const user = await User.findOne({ name: req.body.name, pass: req.body.pass, enabled: true });
        if (user) {
            res.json({ name: user.name, role: user.role });
        } else {
            res.status(401).json({ error: 'بيانات غير صحيحة' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// جلب المراكب
app.get('/api/vessels', async (req, res) => {
    try {
        const vessels = await Vessel.find();
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// إضافة مركب
app.post('/api/vessels', async (req, res) => {
    try {
        const vessel = new Vessel(req.body);
        await vessel.save();
        res.status(201).json(vessel);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// تعديل مركب
app.put('/api/vessels/:id', async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(vessel);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// حذف مركب
app.delete('/api/vessels/:id', async (req, res) => {
    try {
        await Vessel.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// جلب المستخدمين
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// إضافة مستخدم
app.post('/api/users', async (req, res) => {
    try {
        const user = new User(req.body);
        await user.save();
        res.status(201).json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// تعديل مستخدم
app.put('/api/users/:id', async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// حذف مستخدم
app.delete('/api/users/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== التذاكر ==========

// جلب التذاكر
app.get('/api/tickets', async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        res.json(tickets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// إضافة تذكرة
app.post('/api/tickets', async (req, res) => {
    try {
        const ticket = new Ticket(req.body);
        await ticket.save();
        res.status(201).json(ticket);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// الرد على تذكرة
app.put('/api/tickets/:id/reply', async (req, res) => {
    try {
        const ticket = await Ticket.findByIdAndUpdate(
            req.params.id,
            {
                $push: { replies: req.body.reply },
                $set: { status: 'تم الرد' }
            },
            { new: true }
        );
        ticket ? res.json(ticket) : res.status(404).json({ error: 'التذكرة غير موجودة' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// إغلاق تذكرة
app.put('/api/tickets/:id/close', async (req, res) => {
    try {
        const ticket = await Ticket.findByIdAndUpdate(
            req.params.id,
            { $set: { status: 'مغلقة' } },
            { new: true }
        );
        ticket ? res.json(ticket) : res.status(404).json({ error: 'التذكرة غير موجودة' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// تحديث تذكرة عام
app.put('/api/tickets/:id', async (req, res) => {
    try {
        const ticket = await Ticket.findByIdAndUpdate(req.params.id, req.body, { new: true });
        ticket ? res.json(ticket) : res.status(404).json({ error: 'التذكرة غير موجودة' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// حذف تذكرة
app.delete('/api/tickets/:id', async (req, res) => {
    try {
        await Ticket.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== سجل النشاطات ==========

app.get('/api/logs', async (req, res) => {
    try {
        const logs = await Log.find().sort({ _id: -1 });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/logs', async (req, res) => {
    try {
        const log = new Log(req.body);
        await log.save();
        res.status(201).json(log);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== تصدير واستيراد ==========

app.get('/api/export-all', async (req, res) => {
    try {
        res.json({
            vessels: await Vessel.find(),
            users: await User.find(),
            tickets: await Ticket.find(),
            logs: await Log.find(),
            exportDate: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/import-all', async (req, res) => {
    try {
        const { vessels, users, tickets, logs } = req.body;
        if (vessels) { await Vessel.deleteMany({}); await Vessel.insertMany(vessels); }
        if (users) { await User.deleteMany({}); await User.insertMany(users); }
        if (tickets) { await Ticket.deleteMany({}); await Ticket.insertMany(tickets); }
        if (logs) { await Log.deleteMany({}); await Log.insertMany(logs); }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== Route اختبار ==========
app.get('/api/test', (req, res) => {
    res.json({ status: 'success', message: 'السيرفر يعمل' });
});

// ========== Route إعادة تعيين قاعدة البيانات ==========
app.get('/api/reset-db', async (req, res) => {
    try {
        await User.deleteMany({});
        await Vessel.deleteMany({});
        await Ticket.deleteMany({});
        
        await User.create({ name: 'admin', pass: 'admin123', role: 'مسؤول', enabled: true });
        await User.create({ name: 'editor', pass: 'editor123', role: 'محرر', enabled: true });
        await User.create({ name: 'viewer', pass: 'viewer123', role: 'مشاهد', enabled: true });
        
        await Vessel.create({ name: 'خافرة 1', num: 'K001', len: 20, reg: 'الوسط', stat: 'معطب', break: 'عطل في المحرك', fDate: '2025-03-10', eDate: '2025-04-10', cat: 'خوافر' });
        await Vessel.create({ name: 'البروق 1', num: 'B001', len: 11, reg: 'الشمال', stat: 'صالح', cat: 'البروق' });
        
        await Ticket.create({ userName: 'viewer', userRole: 'مشاهد', subject: 'مشكلة في النظام', message: 'البيانات لا تظهر', date: new Date().toLocaleDateString('ar-EG'), time: new Date().toLocaleTimeString('ar-EG'), status: 'قيد المعالجة', replies: [] });
        
        res.json({ success: true, message: 'تم إعادة تعيين قاعدة البيانات' });
    } catch(error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== تشغيل السيرفر ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`);
    console.log(`📡 http://localhost:${PORT}`);
});
