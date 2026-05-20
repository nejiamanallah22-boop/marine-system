const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// تحميل متغيرات البيئة
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== إعدادات الأمان والحماية ====================

// تمكين compression للاستجابة بشكل أسرع
app.use(compression());

// إعدادات الأمان مع Helmet (تم تعديلها لتتوافق مع الواجهة)
app.use(helmet({
    contentSecurityPolicy: false, // لتمكين استخدام Chart.js
    crossOriginEmbedderPolicy: false
}));

// تحديد معدل الطلبات لمنع هجمات DDoS
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100, // الحد الأقصى 100 طلب لكل IP
    message: 'تم تجاوز عدد الطلبات المسموح بها، يرجى المحاولة لاحقاً',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

// CORS للإنتاج
const corsOptions = {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};
app.use(cors(corsOptions));

// Middleware أساسية
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// خدمة الملفات الثابتة
app.use(express.static('public'));

// ==================== اتصال قاعدة البيانات MongoDB Atlas ====================

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/marine_fleet';

// إعدادات اتصال MongoDB للإنتاج
const mongooseOptions = {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4,
};

mongoose.connect(MONGODB_URI, mongooseOptions)
    .then(() => {
        console.log('✅ تم الاتصال بقاعدة البيانات MongoDB Atlas');
    })
    .catch(err => {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
        // في بيئة الإنتاج، لا نخرج من العملية إذا فشل الاتصال بقاعدة البيانات
        // لأنها قد تعيد المحاولة
        if (process.env.NODE_ENV !== 'production') {
            process.exit(1);
        }
    });

// مراقبة حالة الاتصال
mongoose.connection.on('error', (err) => {
    console.error('خطأ في اتصال MongoDB:', err.message);
});

mongoose.connection.on('disconnected', () => {
    console.log('⚠️ تم فقدان الاتصال بـ MongoDB، جاري إعادة المحاولة...');
});

// ==================== نماذج (Schemas) قاعدة البيانات ====================

// نموذج المراكب (Vessels)
const vesselSchema = new mongoose.Schema({
    name: { type: String, required: true },
    num: { type: String, default: '' },
    len: { type: Number, default: 0 },
    reg: { type: String, default: '' },
    zone: { type: String, default: '' },
    port: { type: String, default: '' },
    supp: { type: String, default: '' },
    stat: { type: String, default: 'صالح', enum: ['صالح', 'معطب', 'صيانة'] },
    break: { type: String, default: '' },
    fDate: { type: String, default: '' },
    eDate: { type: String, default: '' },
    ref: { type: String, default: '' },
    cat: { type: String, default: '' }
}, { timestamps: true });

const Vessel = mongoose.model('Vessel', vesselSchema);

// نموذج المستخدمين (Users) - مع تشفير كلمة المرور للإنتاج
const userSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    pass: { type: String, required: true },
    role: { type: String, default: 'مشاهد', enum: ['مسؤول', 'محرر', 'مشاهد'] },
    enabled: { type: Boolean, default: true }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// نموذج التذاكر (Tickets)
const replySchema = new mongoose.Schema({
    adminName: String,
    reply: String,
    date: String,
    time: String
});

const ticketSchema = new mongoose.Schema({
    userName: { type: String, required: true },
    userRole: { type: String, default: '' },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    status: { type: String, default: 'قيد المعالجة', enum: ['قيد المعالجة', 'تم الرد', 'مغلقة'] },
    replies: [replySchema]
}, { timestamps: true });

const Ticket = mongoose.model('Ticket', ticketSchema);

// نموذج سجل النشاطات (Logs)
const logSchema = new mongoose.Schema({
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    action: { type: String, required: true },
    details: { type: String, default: '' },
    date: { type: String, required: true },
    time: { type: String, required: true }
}, { timestamps: true });

const Log = mongoose.model('Log', logSchema);

// ==================== دوال مساعدة ====================
function getCurrentDate() {
    const now = new Date();
    return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
}

function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

// ==================== API Routes للمراكب (Vessels) ====================

app.get('/api/vessels', async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json(vessels);
    } catch (error) {
        console.error('خطأ في /api/vessels:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/vessels', async (req, res) => {
    try {
        const vessel = new Vessel(req.body);
        await vessel.save();
        res.status(201).json(vessel);
    } catch (error) {
        console.error('خطأ في POST /api/vessels:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/vessels/:id', async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!vessel) {
            return res.status(404).json({ error: 'المركب غير موجود' });
        }
        res.json(vessel);
    } catch (error) {
        console.error('خطأ في PUT /api/vessels/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/vessels/:id', async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndDelete(req.params.id);
        if (!vessel) {
            return res.status(404).json({ error: 'المركب غير موجود' });
        }
        res.json({ message: 'تم الحذف بنجاح' });
    } catch (error) {
        console.error('خطأ في DELETE /api/vessels/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API Routes للمستخدمين (Users) ====================

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().select('-pass');
        res.json(users);
    } catch (error) {
        console.error('خطأ في /api/users:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const existingUser = await User.findOne({ name: req.body.name });
        if (existingUser) {
            return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
        }
        const user = new User(req.body);
        await user.save();
        const userWithoutPass = user.toObject();
        delete userWithoutPass.pass;
        res.status(201).json(userWithoutPass);
    } catch (error) {
        console.error('خطأ في POST /api/users:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        ).select('-pass');
        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }
        res.json(user);
    } catch (error) {
        console.error('خطأ في PUT /api/users/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }
        res.json({ message: 'تم الحذف بنجاح' });
    } catch (error) {
        console.error('خطأ في DELETE /api/users/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API Routes للتذاكر (Tickets) ====================

app.get('/api/tickets', async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        res.json(tickets);
    } catch (error) {
        console.error('خطأ في /api/tickets:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/tickets', async (req, res) => {
    try {
        const ticket = new Ticket(req.body);
        await ticket.save();
        res.status(201).json(ticket);
    } catch (error) {
        console.error('خطأ في POST /api/tickets:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/tickets/:id/reply', async (req, res) => {
    try {
        const { reply } = req.body;
        const ticket = await Ticket.findById(req.params.id);
        
        if (!ticket) {
            return res.status(404).json({ error: 'التذكرة غير موجودة' });
        }
        
        if (!ticket.replies) {
            ticket.replies = [];
        }
        
        ticket.replies.push(reply);
        ticket.status = 'تم الرد';
        
        await ticket.save();
        res.json(ticket);
    } catch (error) {
        console.error('خطأ في PUT /api/tickets/:id/reply:', error);
        res.status(500).json({ error: error.message });
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
    } catch (error) {
        console.error('خطأ في PUT /api/tickets/:id/close:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API Routes لسجل النشاطات (Logs) ====================

app.get('/api/logs', async (req, res) => {
    try {
        const logs = await Log.find().sort({ createdAt: -1 });
        res.json(logs);
    } catch (error) {
        console.error('خطأ في /api/logs:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/logs', async (req, res) => {
    try {
        const log = new Log(req.body);
        await log.save();
        res.status(201).json(log);
    } catch (error) {
        console.error('خطأ في POST /api/logs:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API Routes لتسجيل الدخول ====================

app.post('/api/login', async (req, res) => {
    try {
        const { name, pass } = req.body;
        
        const user = await User.findOne({ name: name });
        
        if (!user) {
            return res.status(401).json({ error: 'اسم المستخدم غير موجود' });
        }
        
        if (!user.enabled) {
            return res.status(401).json({ error: 'الحساب معطل، يرجى التواصل مع المسؤول' });
        }
        
        if (user.pass !== pass) {
            return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
        }
        
        const userWithoutPass = user.toObject();
        delete userWithoutPass.pass;
        
        res.json(userWithoutPass);
    } catch (error) {
        console.error('خطأ في POST /api/login:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API Routes للتصدير والاستيراد ====================

app.get('/api/export-all', async (req, res) => {
    try {
        const vessels = await Vessel.find();
        const users = await User.find().select('-pass');
        const tickets = await Ticket.find();
        const logs = await Log.find();
        
        res.json({
            vessels,
            users,
            tickets,
            logs,
            exportDate: getCurrentDate(),
            exportTime: getCurrentTime()
        });
    } catch (error) {
        console.error('خطأ في /api/export-all:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/import-all', async (req, res) => {
    try {
        const { vessels, users, tickets, logs } = req.body;
        
        if (vessels && vessels.length > 0) {
            await Vessel.deleteMany({});
            await Vessel.insertMany(vessels);
        }
        
        if (users && users.length > 0) {
            await User.deleteMany({});
            await User.insertMany(users);
        }
        
        if (tickets && tickets.length > 0) {
            await Ticket.deleteMany({});
            await Ticket.insertMany(tickets);
        }
        
        if (logs && logs.length > 0) {
            await Log.deleteMany({});
            await Log.insertMany(logs);
        }
        
        res.json({ message: 'تم استيراد البيانات بنجاح' });
    } catch (error) {
        console.error('خطأ في POST /api/import-all:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== Route للصفحة الرئيسية ====================

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== إنشاء المستخدمين الافتراضيين ====================

async function initializeDefaultData() {
    try {
        // إنشاء المستخدم المسؤول
        const adminExists = await User.findOne({ name: 'admin' });
        if (!adminExists) {
            const admin = new User({
                name: 'admin',
                pass: '1234',
                role: 'مسؤول',
                enabled: true
            });
            await admin.save();
            console.log('✅ تم إنشاء المستخدم المسؤول: admin / 1234');
        }
        
        // إنشاء مستخدم محرر
        const editorExists = await User.findOne({ name: 'editor' });
        if (!editorExists) {
            const editor = new User({
                name: 'editor',
                pass: 'editor123',
                role: 'محرر',
                enabled: true
            });
            await editor.save();
            console.log('✅ تم إنشاء مستخدم محرر: editor / editor123');
        }
        
        // إنشاء مستخدم مشاهد
        const viewerExists = await User.findOne({ name: 'viewer' });
        if (!viewerExists) {
            const viewer = new User({
                name: 'viewer',
                pass: 'viewer123',
                role: 'مشاهد',
                enabled: true
            });
            await viewer.save();
            console.log('✅ تم إنشاء مستخدم مشاهد: viewer / viewer123');
        }
        
        // إضافة بعض المراكب التجريبية إذا كانت قاعدة البيانات فارغة
        const vesselsCount = await Vessel.countDocuments();
        if (vesselsCount === 0) {
            const sampleVessels = [
                { name: 'البروق 1', num: 'B001', len: 11, reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', stat: 'صالح', cat: 'البروق' },
                { name: 'صقر البحر', num: 'S001', len: 10, reg: 'الساحل', zone: 'سوسة', port: 'سوسة', stat: 'صالح', cat: 'صقور' },
                { name: 'خافرة الساحل', num: 'K001', len: 20, reg: 'الساحل', zone: 'المنستير', port: 'المنستير', stat: 'صيانة', cat: 'خوافر', fDate: getCurrentDate(), break: 'محرك' },
                { name: 'طوافة الجنوب', num: 'T001', len: 35, reg: 'الجنوب', zone: 'جرجيس', port: 'جرجيس', stat: 'صالح', cat: 'طوافات' },
                { name: 'زورق النجدة', num: 'Z001', len: 15, reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', stat: 'معطب', cat: 'زوارق مزدوجة', fDate: getCurrentDate(), break: 'مضخة ماء' },
            ];
            await Vessel.insertMany(sampleVessels);
            console.log('✅ تم إضافة مراكب تجريبية');
        }
    } catch (error) {
        console.error('خطأ في تهيئة البيانات:', error);
    }
}

// ==================== تشغيل السيرفر ====================

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n🚀 السيرفر يعمل على http://localhost:${PORT}`);
    console.log(`🔐 admin / 1234`);
    console.log(`✅ متصل بـ MongoDB Atlas\n`);
    await initializeDefaultData();
});

// معالجة إشارات الإيقاف بشكل آمن
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    mongoose.connection.close(() => {
        console.log('MongoDB connection closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, closing server...');
    mongoose.connection.close(() => {
        console.log('MongoDB connection closed');
        process.exit(0);
    });
});
