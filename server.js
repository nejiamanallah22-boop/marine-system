const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// ========== نماذج MongoDB ==========

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

// نموذج التذاكر (الدعم الفني)
const ticketSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    status: { type: String, default: 'قيد المعالجة' },
    replies: { type: Array, default: [] }
});
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

// ========== الاتصال بـ MongoDB Atlas ==========
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ تم الاتصال بـ MongoDB Atlas بنجاح');
        initializeDatabase();
    })
    .catch(err => {
        console.error('❌ خطأ في الاتصال بـ MongoDB:', err.message);
    });

// تهيئة قاعدة البيانات (إنشاء بيانات افتراضية)
async function initializeDatabase() {
    try {
        // إنشاء مستخدمين افتراضيين
        const adminExists = await User.findOne({ name: 'admin' });
        if (!adminExists) {
            await User.create({ name: 'admin', pass: 'admin123', role: 'مسؤول', enabled: true });
            console.log('✅ تم إنشاء المستخدم: admin / admin123 (مسؤول)');
        }

        const editorExists = await User.findOne({ name: 'editor' });
        if (!editorExists) {
            await User.create({ name: 'editor', pass: 'editor123', role: 'محرر', enabled: true });
            console.log('✅ تم إنشاء المستخدم: editor / editor123 (محرر)');
        }

        const viewerExists = await User.findOne({ name: 'viewer' });
        if (!viewerExists) {
            await User.create({ name: 'viewer', pass: 'viewer123', role: 'مشاهد', enabled: true });
            console.log('✅ تم إنشاء المستخدم: viewer / viewer123 (مشاهد)');
        }

        // إنشاء مراكب افتراضية إذا لم توجد
        const vesselsCount = await Vessel.countDocuments();
        if (vesselsCount === 0) {
            const defaultVessels = [
                { name: "البروق 1", num: "B001", len: 11, reg: "الشمال", zone: "تونس", port: "تونس", supp: "قاعدة الشمال", stat: "صالح", break: "", fDate: "", eDate: "", ref: "", cat: "البروق" },
                { name: "صقر 1", num: "S001", len: 10, reg: "الساحل", zone: "سوسة", port: "سوسة", supp: "قاعدة الساحل", stat: "صالح", break: "", fDate: "", eDate: "", ref: "", cat: "صقور" },
                { name: "خافرة 1", num: "K001", len: 20, reg: "الوسط", zone: "صفاقس", port: "صفاقس", supp: "قاعدة الوسط", stat: "معطب", break: "عطل في المحرك", fDate: "2025-03-10", eDate: "2025-04-10", ref: "REF001", cat: "خوافر" },
                { name: "زورق 1", num: "Z001", len: 15, reg: "الجنوب", zone: "جربة", port: "جربة", supp: "قاعدة الجنوب", stat: "صيانة", break: "صيانة دورية", fDate: "2025-03-15", eDate: "2025-04-05", ref: "REF002", cat: "زوارق مزدوجة" },
                { name: "طوافة 1", num: "T001", len: 35, reg: "الشمال", zone: "بنزرت", port: "بنزرت", supp: "قاعدة الشمال", stat: "صالح", break: "", fDate: "", eDate: "", ref: "", cat: "طوافات" }
            ];
            await Vessel.insertMany(defaultVessels);
            console.log('✅ تم إنشاء 5 مراكب افتراضية');
        }
    } catch (error) {
        console.error('خطأ في تهيئة قاعدة البيانات:', error);
    }
}

// ========== نقاط الاختبار ==========

// نقطة اختبار بسيطة للتحقق من أن السيرفر يعمل
app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'success', 
        message: 'السيرفر يعمل بنجاح ✅',
        time: new Date().toISOString()
    });
});

// نقطة للتحقق من المستخدمين في قاعدة البيانات
app.get('/api/check-users', async (req, res) => {
    try {
        const users = await User.find({}, { name: 1, role: 1, enabled: 1 });
        res.json({ count: users.length, users });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== API Routes ==========

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    const { name, pass } = req.body;
    
    try {
        const user = await User.findOne({ name, pass, enabled: true });
        
        if (user) {
            res.json({ 
                name: user.name,
                role: user.role,
                enabled: user.enabled
            });
        } else {
            res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
    } catch (error) {
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ========== إدارة المراكب ==========
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

// ========== إدارة المستخدمين ==========
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

// ========== إدارة التذاكر (الدعم الفني) ==========
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
        const ticket = new Ticket(req.body);
        await ticket.save();
        res.status(201).json(ticket);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/tickets/:id', async (req, res) => {
    try {
        const ticketId = parseInt(req.params.id);
        const ticket = await Ticket.findOneAndUpdate(
            { id: ticketId },
            req.body,
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

app.delete('/api/tickets/:id', async (req, res) => {
    try {
        await Ticket.findOneAndDelete({ id: parseInt(req.params.id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== إدارة سجل النشاطات ==========
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

// ========== تصدير واستيراد جميع البيانات ==========
app.get('/api/export-all', async (req, res) => {
    try {
        const vessels = await Vessel.find();
        const users = await User.find();
        const tickets = await Ticket.find();
        const logs = await Log.find();
        
        res.json({
            vessels,
            users,
            tickets,
            logs,
            exportDate: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/import-all', async (req, res) => {
    try {
        const { vessels, users, tickets, logs } = req.body;
        
        if (vessels) {
            await Vessel.deleteMany({});
            await Vessel.insertMany(vessels);
        }
        if (users) {
            await User.deleteMany({});
            await User.insertMany(users);
        }
        if (tickets) {
            await Ticket.deleteMany({});
            await Ticket.insertMany(tickets);
        }
        if (logs) {
            await Log.deleteMany({});
            await Log.insertMany(logs);
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== تشغيل السيرفر ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`);
    console.log(`📡 http://localhost:${PORT}`);
});
