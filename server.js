const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// ==================== نماذج قاعدة البيانات ====================

// نموذج المركب
const VesselSchema = new mongoose.Schema({
    name: { type: String, required: true },
    num: String,
    len: Number,
    reg: String,
    zone: String,
    port: String,
    supp: String,
    stat: { type: String, enum: ['صالح', 'معطب', 'صيانة'], default: 'صالح' },
    break: String,
    fDate: String,
    eDate: String,
    ref: String,
    cat: String
}, { timestamps: true });

// نموذج المستخدم
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    pass: { type: String, required: true },
    role: { type: String, enum: ['مسؤول', 'محرر', 'مشاهد'], default: 'مشاهد' },
    enabled: { type: Boolean, default: true }
});

// نموذج التذكرة
const TicketSchema = new mongoose.Schema({
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

// نموذج سجل التتبع
const LogSchema = new mongoose.Schema({
    userName: String,
    userRole: String,
    action: String,
    details: String,
    date: String,
    time: String
}, { timestamps: true });

const Vessel = mongoose.model('Vessel', VesselSchema);
const User = mongoose.model('User', UserSchema);
const Ticket = mongoose.model('Ticket', TicketSchema);
const Log = mongoose.model('Log', LogSchema);

// ==================== الاتصال بقاعدة البيانات ====================
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/marine_db')
    .then(async () => {
        console.log('✅ متصل بقاعدة البيانات MongoDB');
        
        // إنشاء مستخدم مسؤول افتراضي إذا لم يكن موجوداً
        const adminExists = await User.findOne({ name: 'admin' });
        if (!adminExists) {
            const hashedPass = require('bcryptjs').hashSync('admin123', 10);
            await User.create({ name: 'admin', pass: hashedPass, role: 'مسؤول', enabled: true });
            console.log('✅ تم إنشاء المستخدم الافتراضي: admin / admin123');
        }
    })
    .catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));

// ==================== دوال مساعدة ====================
const bcrypt = require('bcryptjs');

// ==================== API - المراكب ====================
app.get('/api/vessels', async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json(vessels);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/vessels', async (req, res) => {
    try {
        const vessel = new Vessel(req.body);
        await vessel.save();
        res.json(vessel);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/vessels/:id', async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(vessel);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/vessels/:id', async (req, res) => {
    try {
        await Vessel.findByIdAndDelete(req.params.id);
        res.json({ message: 'deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== API - المستخدمين ====================
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().select('-pass');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const { name, pass, role, enabled } = req.body;
        const hashedPass = bcrypt.hashSync(pass, 10);
        const user = new User({ name, pass: hashedPass, role, enabled });
        await user.save();
        res.json({ ...user.toObject(), pass: undefined });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const updateData = { ...req.body };
        if (updateData.pass) {
            updateData.pass = bcrypt.hashSync(updateData.pass, 10);
        }
        const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-pass');
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== API - تسجيل الدخول ====================
app.post('/api/login', async (req, res) => {
    try {
        const { name, pass } = req.body;
        const user = await User.findOne({ name });
        
        if (!user) {
            return res.json({ error: 'اسم المستخدم غير موجود' });
        }
        
        if (!user.enabled) {
            return res.json({ error: 'هذا الحساب معطل. يرجى مراجعة المسؤول' });
        }
        
        const isValid = bcrypt.compareSync(pass, user.pass);
        if (!isValid) {
            return res.json({ error: 'كلمة المرور غير صحيحة' });
        }
        
        res.json({ _id: user._id, name: user.name, role: user.role, enabled: user.enabled });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== API - التذاكر ====================
app.get('/api/tickets', async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        res.json(tickets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tickets', async (req, res) => {
    try {
        const ticket = new Ticket(req.body);
        await ticket.save();
        res.json(ticket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tickets/:id/reply', async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ error: 'التذكرة غير موجودة' });
        }
        
        ticket.replies.push(req.body.reply);
        ticket.status = 'تم الرد';
        await ticket.save();
        res.json(ticket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tickets/:id/close', async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ error: 'التذكرة غير موجودة' });
        }
        
        ticket.status = 'مغلقة';
        await ticket.save();
        res.json(ticket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== API - سجل التتبع ====================
app.get('/api/logs', async (req, res) => {
    try {
        const logs = await Log.find().sort({ createdAt: -1 });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/logs', async (req, res) => {
    try {
        const log = new Log(req.body);
        await log.save();
        res.json(log);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== API - تصدير واستيراد ====================
app.get('/api/export-all', async (req, res) => {
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

app.post('/api/import-all', async (req, res) => {
    try {
        const { vessels, users, tickets, logs } = req.body;
        
        if (vessels && Array.isArray(vessels)) {
            await Vessel.deleteMany({});
            await Vessel.insertMany(vessels);
        }
        
        if (tickets && Array.isArray(tickets)) {
            await Ticket.deleteMany({});
            await Ticket.insertMany(tickets);
        }
        
        if (logs && Array.isArray(logs)) {
            await Log.deleteMany({});
            await Log.insertMany(logs);
        }
        
        res.json({ message: 'تم الاستيراد بنجاح' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== تشغيل الخادم ====================
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
});
