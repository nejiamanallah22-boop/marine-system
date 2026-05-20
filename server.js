const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// رابط MongoDB (استخدم هذا الرابط للتجربة المحلية)
const MONGODB_URI = 'mongodb://localhost:27017/marine_fleet';

console.log('🚀 جاري تشغيل السيرفر...');

// نموذج المراكب
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
}, { timestamps: true });

const Vessel = mongoose.model('Vessel', vesselSchema);

// نموذج المستخدمين
const userSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    pass: { type: String, required: true },
    role: { type: String, default: 'مشاهد' },
    enabled: { type: Boolean, default: true }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// نموذج التذاكر
const replySchema = new mongoose.Schema({
    adminName: String,
    reply: String,
    date: String,
    time: String
});

const ticketSchema = new mongoose.Schema({
    userName: String,
    userRole: String,
    subject: String,
    message: String,
    date: String,
    time: String,
    status: { type: String, default: 'قيد المعالجة' },
    replies: [replySchema]
}, { timestamps: true });

const Ticket = mongoose.model('Ticket', ticketSchema);

// نموذج السجلات
const logSchema = new mongoose.Schema({
    userName: String,
    userRole: String,
    action: String,
    details: String,
    date: String,
    time: String
}, { timestamps: true });

const Log = mongoose.model('Log', logSchema);

// دوال مساعدة
function getCurrentDate() {
    const now = new Date();
    return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
}

function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

// API Routes
app.get('/api/vessels', async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
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
        res.json({ message: 'تم الحذف' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().select('-pass');
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const user = new User(req.body);
        await user.save();
        const userWithoutPass = user.toObject();
        delete userWithoutPass.pass;
        res.status(201).json(userWithoutPass);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-pass');
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'تم الحذف' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/tickets', async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
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

app.put('/api/tickets/:id/reply', async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        ticket.replies.push(req.body.reply);
        ticket.status = 'تم الرد';
        await ticket.save();
        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/tickets/:id/close', async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        ticket.status = 'مغلقة';
        await ticket.save();
        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/logs', async (req, res) => {
    try {
        const logs = await Log.find().sort({ createdAt: -1 });
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

app.post('/api/login', async (req, res) => {
    try {
        const { name, pass } = req.body;
        const user = await User.findOne({ name });
        
        if (!user) return res.status(401).json({ error: 'اسم المستخدم غير موجود' });
        if (!user.enabled) return res.status(401).json({ error: 'الحساب معطل' });
        if (user.pass !== pass) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
        
        const userWithoutPass = user.toObject();
        delete userWithoutPass.pass;
        res.json(userWithoutPass);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/export-all', async (req, res) => {
    try {
        const vessels = await Vessel.find();
        const users = await User.find().select('-pass');
        const tickets = await Ticket.find();
        const logs = await Log.find();
        res.json({ vessels, users, tickets, logs });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/import-all', async (req, res) => {
    try {
        const { vessels, users, tickets, logs } = req.body;
        if (vessels) await Vessel.insertMany(vessels);
        if (users) await User.insertMany(users);
        if (tickets) await Ticket.insertMany(tickets);
        if (logs) await Log.insertMany(logs);
        res.json({ message: 'تم الاستيراد' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// إنشاء المستخدم الافتراضي
async function initDatabase() {
    try {
        const adminExists = await User.findOne({ name: 'admin' });
        if (!adminExists) {
            const admin = new User({
                name: 'admin',
                pass: '1234',
                role: 'مسؤول',
                enabled: true
            });
            await admin.save();
            console.log('✅ تم إنشاء المستخدم admin / 1234');
        }
    } catch (error) {
        console.error('خطأ:', error);
    }
}

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`\n🚀 السيرفر يعمل على http://localhost:${PORT}`);
    console.log(`🔐 admin / 1234\n`);
});

// اتصال MongoDB
mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('✅ متصل بـ MongoDB');
        initDatabase();
    })
    .catch(err => {
        console.error('❌ خطأ في اتصال MongoDB:', err.message);
        console.log('\n⚠️ يرجى تثبيت MongoDB محلياً أو استخدام MongoDB Atlas\n');
    });
