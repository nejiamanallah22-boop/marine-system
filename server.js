const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ========== Middleware ==========
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== تعريف نماذج MongoDB (Models) ==========

// نموذج المراكب
const VesselSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
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

// نموذج المستخدمين
const UserSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: { type: String, required: true, unique: true },
    pass: { type: String, required: true },
    role: { type: String, default: 'مشاهد' },
    enabled: { type: Boolean, default: true }
});

// نموذج التذاكر (الدعم الفني)
const TicketSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    userName: { type: String, required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    date: { type: String, default: '' },
    status: { type: String, default: 'قيد المعالجة' }
});

// نموذج سجل التتبع (اللوجات)
const LogSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    action: { type: String, required: true },
    details: { type: String, default: '' },
    date: { type: String, default: '' },
    time: { type: String, default: '' }
});

// إنشاء النماذج
const Vessel = mongoose.model('Vessel', VesselSchema);
const User = mongoose.model('User', UserSchema);
const Ticket = mongoose.model('Ticket', TicketSchema);
const Log = mongoose.model('Log', LogSchema);

// ========== البيانات الافتراضية ==========
const DEFAULT_VESSELS = [
    { id: 101, name: "البروق 1", num: "B001", len: 11, reg: "الشمال", zone: "تونس", port: "تونس", supp: "قاعدة الشمال", stat: "صالح", break: "", fDate: "", eDate: "", ref: "", cat: "البروق" },
    { id: 102, name: "صقر 1", num: "S001", len: 10, reg: "الساحل", zone: "سوسة", port: "سوسة", supp: "قاعدة الساحل", stat: "صالح", break: "", fDate: "", eDate: "", ref: "", cat: "صقور" },
    { id: 103, name: "خافرة 1", num: "K001", len: 20, reg: "الوسط", zone: "صفاقس", port: "صفاقس", supp: "قاعدة الوسط", stat: "معطب", break: "عطل في المحرك", fDate: "2025-03-10", eDate: "2025-04-10", ref: "REF001", cat: "خوافر" },
    { id: 104, name: "زورق 1", num: "Z001", len: 15, reg: "الجنوب", zone: "جربة", port: "جربة", supp: "قاعدة الجنوب", stat: "صيانة", break: "صيانة دورية", fDate: "2025-03-15", eDate: "2025-04-05", ref: "REF002", cat: "زوارق مزدوجة" },
    { id: 105, name: "طوافة 1", num: "T001", len: 35, reg: "الشمال", zone: "بنزرت", port: "بنزرت", supp: "قاعدة الشمال", stat: "صالح", break: "", fDate: "", eDate: "", ref: "", cat: "طوافات" },
    { id: 106, name: "البروق 2", num: "B002", len: 11, reg: "الساحل", zone: "المنستير", port: "المنستير", supp: "قاعدة الساحل", stat: "معطب", break: "عطل في الكهرباء", fDate: "2025-03-20", eDate: "2025-04-15", ref: "REF003", cat: "البروق" },
    { id: 107, name: "صقر 2", num: "S002", len: 9, reg: "الوسط", zone: "المهدية", port: "المهدية", supp: "قاعدة الوسط", stat: "صيانة", break: "تغيير زيوت", fDate: "2025-03-25", eDate: "2025-04-08", ref: "REF004", cat: "صقور" },
    { id: 108, name: "خافرة 2", num: "K002", len: 22, reg: "الجنوب", zone: "قابس", port: "قابس", supp: "قاعدة الجنوب", stat: "صالح", break: "", fDate: "", eDate: "", ref: "", cat: "خوافر" },
    { id: 109, name: "زورق 2", num: "Z002", len: 8, reg: "الشمال", zone: "طبرقة", port: "طبرقة", supp: "قاعدة الشمال", stat: "معطب", break: "عطل في المضخة", fDate: "2025-03-05", eDate: "2025-04-20", ref: "REF005", cat: "زوارق مزدوجة" },
    { id: 110, name: "طوافة 2", num: "T002", len: 40, reg: "الساحل", zone: "نابل", port: "نابل", supp: "قاعدة الساحل", stat: "صيانة", break: "صيانة شاملة", fDate: "2025-03-01", eDate: "2025-04-25", ref: "REF006", cat: "طوافات" }
];

const DEFAULT_USERS = [
    { id: 1, name: "admin", pass: "1234", role: "مسؤول", enabled: true },
    { id: 2, name: "editor", pass: "1234", role: "محرر", enabled: true },
    { id: 3, name: "viewer", pass: "1234", role: "مشاهد", enabled: true }
];

// ========== دالة تهيئة قاعدة البيانات ==========
async function initializeDatabase() {
    try {
        // تهيئة المستخدمين
        const userCount = await User.countDocuments();
        if (userCount === 0) {
            await User.insertMany(DEFAULT_USERS);
            console.log('✅ تم إضافة المستخدمين الافتراضيين');
        }

        // تهيئة المراكب
        const vesselCount = await Vessel.countDocuments();
        if (vesselCount === 0) {
            await Vessel.insertMany(DEFAULT_VESSELS);
            console.log('✅ تم إضافة المراكب الافتراضية');
        }
    } catch (error) {
        console.error('❌ خطأ في تهيئة البيانات:', error);
    }
}

// ========== دوال مساعدة ==========
function getCurrentDate() {
    const now = new Date();
    return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
}

function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

async function logActivity(userName, userRole, action, details) {
    const log = new Log({
        id: Date.now(),
        userName,
        userRole,
        action,
        details,
        date: getCurrentDate(),
        time: getCurrentTime()
    });
    await log.save();
    console.log(`📝 [${getCurrentDate()} ${getCurrentTime()}] ${userName}: ${action}`);
}

// ========== API Routes ==========

// 🔹 المراكب (Vessels)
app.get('/api/vessels', async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ id: 1 });
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/vessels', async (req, res) => {
    try {
        const vessel = new Vessel({
            ...req.body,
            id: Date.now()
        });
        await vessel.save();
        res.json(vessel);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/vessels/:id', async (req, res) => {
    try {
        const vessel = await Vessel.findOneAndUpdate(
            { id: parseInt(req.params.id) },
            req.body,
            { new: true }
        );
        res.json(vessel);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/vessels/:id', async (req, res) => {
    try {
        await Vessel.findOneAndDelete({ id: parseInt(req.params.id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔹 المستخدمين (Users)
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().sort({ id: 1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const user = new User({
            ...req.body,
            id: Date.now()
        });
        await user.save();
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const user = await User.findOneAndUpdate(
            { id: parseInt(req.params.id) },
            req.body,
            { new: true }
        );
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await User.findOneAndDelete({ id: parseInt(req.params.id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔹 تسجيل الدخول
app.post('/api/login', async (req, res) => {
    try {
        const { name, pass } = req.body;
        const user = await User.findOne({ name, pass, enabled: true });
        if (user) {
            await logActivity(user.name, user.role, 'تسجيل دخول', 'قام بتسجيل الدخول إلى النظام');
            res.json(user);
        } else {
            res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔹 التذاكر (Tickets)
app.get('/api/tickets', async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ id: -1 });
        res.json(tickets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/tickets', async (req, res) => {
    try {
        const ticket = new Ticket({
            ...req.body,
            id: Date.now(),
            date: getCurrentDate()
        });
        await ticket.save();
        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔹 سجل التتبع (Logs)
app.get('/api/logs', async (req, res) => {
    try {
        const logs = await Log.find().sort({ id: -1 });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/logs', async (req, res) => {
    try {
        const log = new Log({
            ...req.body,
            id: Date.now()
        });
        await log.save();
        res.json(log);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔹 تصدير جميع البيانات
app.get('/api/export-all', async (req, res) => {
    try {
        const vessels = await Vessel.find();
        const users = await User.find();
        const tickets = await Ticket.find();
        const logs = await Log.find();
        
        res.json({
            exportDate: new Date().toISOString(),
            vessels,
            users,
            tickets,
            logs
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔹 استيراد بيانات (للمسؤول فقط)
app.post('/api/import-all', async (req, res) => {
    try {
        const { vessels, users, tickets, logs } = req.body;
        
        if (vessels) await Vessel.deleteMany({});
        if (users) await User.deleteMany({});
        if (tickets) await Ticket.deleteMany({});
        if (logs) await Log.deleteMany({});
        
        if (vessels) await Vessel.insertMany(vessels);
        if (users) await User.insertMany(users);
        if (tickets) await Ticket.insertMany(tickets);
        if (logs) await Log.insertMany(logs);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔹 الاتصال بـ MongoDB Atlas وبدء السيرفر
async function startServer() {
    try {
        // التحقق من وجود MONGO_URI
        if (!process.env.MONGO_URI) {
            console.error('❌ خطأ: MONGO_URI غير موجود في ملف .env');
            process.exit(1);
        }

        // الاتصال بـ MongoDB Atlas
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ تم الاتصال بـ MongoDB Atlas بنجاح');

        // تهيئة البيانات الافتراضية
        await initializeDatabase();

        // بدء السيرفر
        app.listen(PORT, () => {
            console.log(`🚀 السيرفر يعمل على المنفذ: ${PORT}`);
            console.log(`📍 http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات:', error);
        process.exit(1);
    }
}

// تشغيل السيرفر
startServer();
