const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// ==================== Middlewares ====================
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static('public'));

// ==================== حماية من أخطاء مفاجئة ====================
process.on('uncaughtException', (err) => {
    console.error("❌ UNCAUGHT EXCEPTION:", err);
});

process.on('unhandledRejection', (err) => {
    console.error("❌ UNHANDLED REJECTION:", err);
});

// ==================== نماذج MongoDB ====================

// نموذج المستخدم
const userSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    pass: { type: String, required: true },
    role: { type: String, default: 'مشاهد' },
    enabled: { type: Boolean, default: true }
});
const User = mongoose.model('User', userSchema);

// نموذج المركب
const vesselSchema = new mongoose.Schema({
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
});
const Vessel = mongoose.model('Vessel', vesselSchema);

// نموذج التذكرة
const ticketSchema = new mongoose.Schema({
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
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
});
const Log = mongoose.model('Log', logSchema);

// ==================== الاتصال بقاعدة البيانات ====================
async function connectDB() {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error("MONGO_URI غير موجود في Environment Variables");
        }

        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ تم الاتصال بـ MongoDB Atlas");
        
        // تهيئة قاعدة البيانات بعد الاتصال
        await initializeDatabase();
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err);
        process.exit(1);
    }
}

// ==================== تهيئة قاعدة البيانات ====================
async function initializeDatabase() {
    try {
        // 1. إنشاء مستخدمين افتراضيين
        const adminExists = await User.findOne({ name: 'admin' });
        if (!adminExists) {
            await User.create({ name: 'admin', pass: 'admin123', role: 'مسؤول', enabled: true });
            await User.create({ name: 'editor', pass: 'editor123', role: 'محرر', enabled: true });
            await User.create({ name: 'viewer', pass: 'viewer123', role: 'مشاهد', enabled: true });
            console.log('✅ تم إنشاء المستخدمين');
        }

        // 2. إنشاء مراكب (بينها معطوبة لسجل الصيانة)
        const vesselsCount = await Vessel.countDocuments();
        if (vesselsCount === 0) {
            const defaultVessels = [
                // مراكب صالحة
                { name: "البروق 1", num: "B001", len: 11, reg: "الشمال", zone: "تونس", port: "تونس", supp: "قاعدة الشمال", stat: "صالح", cat: "البروق" },
                { name: "صقر 1", num: "S001", len: 10, reg: "الساحل", zone: "سوسة", port: "سوسة", supp: "قاعدة الساحل", stat: "صالح", cat: "صقور" },
                { name: "طوافة 1", num: "T001", len: 35, reg: "الشمال", zone: "بنزرت", port: "بنزرت", supp: "قاعدة الشمال", stat: "صالح", cat: "طوافات" },
                { name: "خافرة 2", num: "K002", len: 22, reg: "الجنوب", zone: "قابس", port: "قابس", supp: "قاعدة الجنوب", stat: "صالح", cat: "خوافر" },
                
                // مراكب معطوبة (ستظهر في سجل الصيانة)
                { name: "خافرة 1", num: "K001", len: 20, reg: "الوسط", zone: "صفاقس", port: "صفاقس", supp: "قاعدة الوسط", stat: "معطب", break: "عطل في المحرك الرئيسي", fDate: "2025-03-10", eDate: "2025-04-10", ref: "REF001", cat: "خوافر" },
                { name: "زورق 1", num: "Z001", len: 15, reg: "الجنوب", zone: "جربة", port: "جربة", supp: "قاعدة الجنوب", stat: "صيانة", break: "صيانة دورية - تغيير زيت", fDate: "2025-03-15", eDate: "2025-04-05", ref: "REF002", cat: "زوارق مزدوجة" },
                { name: "البروق 2", num: "B002", len: 11, reg: "الساحل", zone: "المنستير", port: "المنستير", supp: "قاعدة الساحل", stat: "معطب", break: "عطل في نظام الكهرباء", fDate: "2025-03-20", eDate: "2025-04-15", ref: "REF003", cat: "البروق" },
                { name: "صقر 2", num: "S002", len: 9, reg: "الوسط", zone: "المهدية", port: "المهدية", supp: "قاعدة الوسط", stat: "صيانة", break: "تغيير زيوت وفلتر", fDate: "2025-03-25", eDate: "2025-04-08", ref: "REF004", cat: "صقور" },
                { name: "زورق 2", num: "Z002", len: 8, reg: "الشمال", zone: "طبرقة", port: "طبرقة", supp: "قاعدة الشمال", stat: "معطب", break: "عطل في المضخة", fDate: "2025-03-05", eDate: "2025-04-20", ref: "REF005", cat: "زوارق مزدوجة" }
            ];
            await Vessel.insertMany(defaultVessels);
            console.log('✅ تم إنشاء 9 مراكب (4 صالح + 3 معطب + 2 صيانة)');
        }

        // 3. إنشاء تذكرة افتراضية
        const ticketsCount = await Ticket.countDocuments();
        if (ticketsCount === 0) {
            await Ticket.create({
                userName: "viewer",
                userRole: "مشاهد",
                subject: "مشكلة في عرض البيانات",
                message: "البيانات لا تظهر بشكل صحيح في جدول الأسطول البحري",
                date: "15/03/2025",
                time: "10:30",
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

// ==================== API Routes ====================

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    try {
        const user = await User.findOne({ name: req.body.name, pass: req.body.pass, enabled: true });
        if (user) {
            res.json({ name: user.name, role: user.role });
        } else {
            res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// إدارة المراكب
app.get('/api/vessels', async (req, res) => {
    try {
        const vessels = await Vessel.find();
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/vessels', async (req, res) => {
    try {
        const vessel = new Vessel(req.body);
        await vessel.save();
        res.status(201).json(vessel);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/vessels/:id', async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(vessel);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/vessels/:id', async (req, res) => {
    try {
        await Vessel.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// إدارة المستخدمين
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const user = new User(req.body);
        await user.save();
        res.status(201).json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== إدارة التذاكر ====================

// جلب جميع التذاكر
app.get('/api/tickets', async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        res.json(tickets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// إضافة تذكرة جديدة
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
        const { reply } = req.body;
        
        if (!reply || !reply.adminName || !reply.reply) {
            return res.status(400).json({ error: 'بيانات الرد غير مكتملة' });
        }

        const ticket = await Ticket.findByIdAndUpdate(
            req.params.id,
            {
                $push: { replies: reply },
                $set: { status: 'تم الرد' }
            },
            { new: true }
        );

        if (!ticket) {
            return res.status(404).json({ error: 'التذكرة غير موجودة' });
        }

        res.json(ticket);
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

        if (!ticket) {
            return res.status(404).json({ error: 'التذكرة غير موجودة' });
        }

        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// تحديث تذكرة عام
app.put('/api/tickets/:id', async (req, res) => {
    try {
        const ticket = await Ticket.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
        res.json(ticket);
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

// ==================== سجل النشاطات ====================

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

// ==================== تصدير واستيراد البيانات ====================

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

// ==================== نقطة اختبار ====================
app.get('/api/test', (req, res) => {
    res.json({ status: 'success', message: 'السيرفر يعمل بنجاح' });
});

// ==================== الصفحة الرئيسية ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== تشغيل السيرفر ====================
const PORT = process.env.PORT || 3000;

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`);
        console.log(`📡 http://localhost:${PORT}`);
    });
});
