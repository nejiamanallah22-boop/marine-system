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

// ==================== اتصال قاعدة البيانات ====================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/marine_fleet';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('✅ تم الاتصال بقاعدة البيانات MongoDB');
}).catch(err => {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err);
    process.exit(1);
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

// نموذج المستخدمين (Users)
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

// الحصول على جميع المراكب
app.get('/api/vessels', async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json(vessels);
    } catch (error) {
        console.error('خطأ في /api/vessels:', error);
        res.status(500).json({ error: error.message });
    }
});

// إضافة مركب جديد
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

// تحديث مركب
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

// حذف مركب
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

// الحصول على جميع المستخدمين
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().select('-pass');
        res.json(users);
    } catch (error) {
        console.error('خطأ في /api/users:', error);
        res.status(500).json({ error: error.message });
    }
});

// إضافة مستخدم جديد
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

// تحديث مستخدم
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

// حذف مستخدم
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

// الحصول على جميع التذاكر
app.get('/api/tickets', async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        res.json(tickets);
    } catch (error) {
        console.error('خطأ في /api/tickets:', error);
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
        console.error('خطأ في POST /api/tickets:', error);
        res.status(500).json({ error: error.message });
    }
});

// الرد على تذكرة (مع تحديث الحالة إلى "تم الرد")
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

// إغلاق تذكرة
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

// الحصول على جميع السجلات
app.get('/api/logs', async (req, res) => {
    try {
        const logs = await Log.find().sort({ createdAt: -1 });
        res.json(logs);
    } catch (error) {
        console.error('خطأ في /api/logs:', error);
        res.status(500).json({ error: error.message });
    }
});

// إضافة سجل جديد
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

// تصدير جميع البيانات
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

// استيراد جميع البيانات
app.post('/api/import-all', async (req, res) => {
    try {
        const { vessels, users, tickets, logs } = req.body;
        
        // حذف البيانات الحالية
        await Vessel.deleteMany({});
        await User.deleteMany({});
        await Ticket.deleteMany({});
        await Log.deleteMany({});
        
        // إضافة البيانات الجديدة
        if (vessels && vessels.length > 0) {
            await Vessel.insertMany(vessels);
        }
        
        if (users && users.length > 0) {
            await User.insertMany(users);
        }
        
        if (tickets && tickets.length > 0) {
            await Ticket.insertMany(tickets);
        }
        
        if (logs && logs.length > 0) {
            await Log.insertMany(logs);
        }
        
        res.json({ message: 'تم استيراد البيانات بنجاح' });
    } catch (error) {
        console.error('خطأ في POST /api/import-all:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== إنشاء مستخدم مسؤول افتراضي إذا لم يكن موجوداً ====================

async function createDefaultAdmin() {
    try {
        const adminExists = await User.findOne({ name: 'admin' });
        if (!adminExists) {
            const admin = new User({
                name: 'admin',
                pass: 'admin123',
                role: 'مسؤول',
                enabled: true
            });
            await admin.save();
            console.log('✅ تم إنشاء المستخدم المسؤول الافتراضي: admin / admin123');
        }
        
        // إنشاء مستخدم تجريبي للاختبار
        const userExists = await User.findOne({ name: 'user' });
        if (!userExists) {
            const user = new User({
                name: 'user',
                pass: 'user123',
                role: 'محرر',
                enabled: true
            });
            await user.save();
            console.log('✅ تم إنشاء مستخدم تجريبي: user / user123');
        }
    } catch (error) {
        console.error('خطأ في إنشاء المستخدم الافتراضي:', error);
    }
}

// ==================== تشغيل السيرفر ====================

app.listen(PORT, async () => {
    console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
    await createDefaultAdmin();
});

// معالجة الأخطاء غير المتوقعة
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});
