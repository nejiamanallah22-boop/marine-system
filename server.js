const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();

// ======================== MIDDLEWARE ========================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ======================== ENVIRONMENT CHECK ========================
if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI is missing in .env file');
    process.exit(1);
}
if (!process.env.JWT_SECRET) {
    console.error('❌ JWT_SECRET is missing in .env file');
    process.exit(1);
}
console.log('✅ Environment variables loaded');

// ======================== DATABASE MODELS ========================

// Vessel model
const vesselSchema = new mongoose.Schema({
    name: { type: String, required: [true, 'اسم السفينة مطلوب'], index: true },
    num: { type: String, default: '' },
    len: { type: Number, required: [true, 'الطول مطلوب'], min: 0 },
    reg: { type: String, index: true, default: '' },
    zone: { type: String, default: '' },
    port: { type: String, default: '' },
    supp: { type: String, default: '' },
    stat: { type: String, default: 'صالح', index: true },
    break: { type: String, default: '' },
    fDate: { type: String, default: '' },
    eDate: { type: String, default: '' },
    ref: { type: String, default: '' },
    cat: { type: String, index: true }
}, { timestamps: true });

const Vessel = mongoose.model('Vessel', vesselSchema);

// User model
const userSchema = new mongoose.Schema({
    name: { type: String, unique: true, required: true },
    pass: { type: String, required: true },
    role: { type: String, default: 'مشاهد', enum: ['مشاهد', 'كاتب', 'مدير'] },
    enabled: { type: Boolean, default: true }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// Ticket model
const ticketSchema = new mongoose.Schema({
    userName: { type: String, required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, default: 'قيد المعالجة', enum: ['قيد المعالجة', 'تم الرد', 'مغلق'] },
    date: { type: Date, default: Date.now }
}, { timestamps: true });

const Ticket = mongoose.model('Ticket', ticketSchema);

// Log model
const logSchema = new mongoose.Schema({
    userName: { type: String, required: true },
    action: { type: String, required: true },
    details: { type: String, default: '' },
    date: { type: Date, default: Date.now }
}, { timestamps: true });

const Log = mongoose.model('Log', logSchema);

// ======================== HELPER FUNCTIONS ========================
function getCategory(len) {
    const n = parseFloat(len);
    if (isNaN(n)) return 'غير محدد';
    if (n === 11) return 'البروق';
    if (n >= 8 && n <= 12 && n !== 11) return 'صقور';  // تعديل: 12 تصبح صقور وليس بروق
    if (n > 12 && n <= 25) return 'خوافر';
    if (n >= 30) return 'طوافات';
    return 'زوارق مزدوجة';
}

// تسجيل الإجراءات في السجل
async function addLog(userName, action, details = '') {
    try {
        await Log.create({ userName, action, details });
    } catch (err) {
        console.error('Failed to save log:', err.message);
    }
}

// ======================== AUTHENTICATION MIDDLEWARE ========================
function auth(req, res, next) {
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).json({ error: 'الرمز غير موجود، يرجى تسجيل الدخول' });
    }
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        res.status(401).json({ error: 'رمز غير صالح أو منتهي الصلاحية' });
    }
}

function checkRole(roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'لا تملك الصلاحية للقيام بهذا الإجراء' });
        }
        next();
    };
}

// ======================== ROUTES ========================

// ----------------------- تسجيل الدخول -----------------------
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
        }

        const user = await User.findOne({ name: username, enabled: true });
        if (!user) {
            return res.status(401).json({ error: 'اسم المستخدم غير موجود أو معطل' });
        }

        const valid = bcrypt.compareSync(password, user.pass);
        if (!valid) {
            return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
        }

        const token = jwt.sign(
            { id: user._id, name: user.name, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        await addLog(user.name, 'تسجيل دخول', `قام بتسجيل الدخول بنجاح`);
        res.json({ token, user: { name: user.name, role: user.role } });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'حدث خطأ في الخادم أثناء تسجيل الدخول' });
    }
});

// ----------------------- السفن (Vessels) -----------------------
// جلب جميع السفن
app.get('/api/vessels', auth, async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json(vessels);
    } catch (err) {
        console.error('GET vessels error:', err);
        res.status(500).json({ error: 'فشل في جلب بيانات السفن' });
    }
});

// إضافة سفينة جديدة
app.post('/api/vessels', auth, async (req, res) => {
    try {
        const { name, len } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'اسم السفينة مطلوب' });
        }
        if (len === undefined || isNaN(parseFloat(len)) || parseFloat(len) < 0) {
            return res.status(400).json({ error: 'الطول يجب أن يكون رقماً موجباً' });
        }

        const category = getCategory(len);
        const vesselData = { ...req.body, name: name.trim(), len: parseFloat(len), cat: category };
        
        const vessel = await Vessel.create(vesselData);
        await addLog(req.user.name, 'إضافة سفينة', `أضاف سفينة باسم "${vessel.name}"`);
        res.status(201).json(vessel);
    } catch (err) {
        console.error('POST vessel error:', err);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'فشل في إضافة السفينة' });
    }
});

// تحديث سفينة
app.put('/api/vessels/:id', auth, checkRole(['مدير', 'كاتب']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'معرف غير صالح' });
        }
        const { len, name } = req.body;
        const updateData = { ...req.body };
        if (len !== undefined) {
            const lenNum = parseFloat(len);
            if (isNaN(lenNum) || lenNum < 0) {
                return res.status(400).json({ error: 'الطول يجب أن يكون رقماً موجباً' });
            }
            updateData.len = lenNum;
            updateData.cat = getCategory(lenNum);
        }
        if (name) updateData.name = name.trim();

        const vessel = await Vessel.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
        if (!vessel) {
            return res.status(404).json({ error: 'السفينة غير موجودة' });
        }
        await addLog(req.user.name, 'تحديث سفينة', `عدّل سفينة "${vessel.name}"`);
        res.json(vessel);
    } catch (err) {
        console.error('PUT vessel error:', err);
        res.status(500).json({ error: 'فشل في تحديث السفينة' });
    }
});

// حذف سفينة
app.delete('/api/vessels/:id', auth, checkRole(['مدير']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'معرف غير صالح' });
        }
        const vessel = await Vessel.findByIdAndDelete(id);
        if (!vessel) {
            return res.status(404).json({ error: 'السفينة غير موجودة' });
        }
        await addLog(req.user.name, 'حذف سفينة', `حذف سفينة "${vessel.name}"`);
        res.json({ message: 'تم حذف السفينة بنجاح' });
    } catch (err) {
        console.error('DELETE vessel error:', err);
        res.status(500).json({ error: 'فشل في حذف السفينة' });
    }
});

// ----------------------- التذاكر (Tickets) -----------------------
// جلب جميع التذاكر (للمدير والكاتب فقط)
app.get('/api/tickets', auth, checkRole(['مدير', 'كاتب']), async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        res.json(tickets);
    } catch (err) {
        console.error('GET tickets error:', err);
        res.status(500).json({ error: 'فشل في جلب التذاكر' });
    }
});

// إضافة تذكرة جديدة (أي مستخدم مسجل)
app.post('/api/tickets', auth, async (req, res) => {
    try {
        const { subject, message } = req.body;
        if (!subject || !message) {
            return res.status(400).json({ error: 'الموضوع والرسالة مطلوبان' });
        }
        const ticket = await Ticket.create({
            userName: req.user.name,
            subject,
            message
        });
        await addLog(req.user.name, 'إضافة تذكرة', `موضوع: ${subject}`);
        res.status(201).json(ticket);
    } catch (err) {
        console.error('POST ticket error:', err);
        res.status(500).json({ error: 'فشل في إرسال التذكرة' });
    }
});

// تحديث حالة التذكرة (للمدير والكاتب)
app.put('/api/tickets/:id', auth, checkRole(['مدير', 'كاتب']), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!status || !['قيد المعالجة', 'تم الرد', 'مغلق'].includes(status)) {
            return res.status(400).json({ error: 'حالة غير صالحة' });
        }
        const ticket = await Ticket.findByIdAndUpdate(id, { status }, { new: true });
        if (!ticket) {
            return res.status(404).json({ error: 'التذكرة غير موجودة' });
        }
        await addLog(req.user.name, 'تحديث تذكرة', `غير حالة التذكرة إلى ${status}`);
        res.json(ticket);
    } catch (err) {
        console.error('PUT ticket error:', err);
        res.status(500).json({ error: 'فشل في تحديث التذكرة' });
    }
});

// ----------------------- السجلات (Logs) -----------------------
// جلب السجلات (للمدير فقط)
app.get('/api/logs', auth, checkRole(['مدير']), async (req, res) => {
    try {
        const logs = await Log.find().sort({ createdAt: -1 }).limit(200);
        res.json(logs);
    } catch (err) {
        console.error('GET logs error:', err);
        res.status(500).json({ error: 'فشل في جلب السجلات' });
    }
});

// ----------------------- المستخدمين (Users) -----------------------
// جلب المستخدمين (للمدير فقط)
app.get('/api/users', auth, checkRole(['مدير']), async (req, res) => {
    try {
        const users = await User.find().select('-pass');
        res.json(users);
    } catch (err) {
        console.error('GET users error:', err);
        res.status(500).json({ error: 'فشل في جلب المستخدمين' });
    }
});

// إضافة مستخدم جديد (للمدير فقط)
app.post('/api/users', auth, checkRole(['مدير']), async (req, res) => {
    try {
        const { name, password, role, enabled } = req.body;
        if (!name || !password) {
            return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
        }
        const existing = await User.findOne({ name });
        if (existing) {
            return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
        }
        const hashedPassword = bcrypt.hashSync(password, 10);
        const user = await User.create({
            name,
            pass: hashedPassword,
            role: role || 'مشاهد',
            enabled: enabled !== undefined ? enabled : true
        });
        await addLog(req.user.name, 'إضافة مستخدم', `أضاف مستخدم: ${name}`);
        res.status(201).json({ id: user._id, name: user.name, role: user.role, enabled: user.enabled });
    } catch (err) {
        console.error('POST user error:', err);
        res.status(500).json({ error: 'فشل في إضافة المستخدم' });
    }
});

// حذف مستخدم (للمدير فقط)
app.delete('/api/users/:id', auth, checkRole(['مدير']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'معرف غير صالح' });
        }
        const user = await User.findByIdAndDelete(id);
        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }
        await addLog(req.user.name, 'حذف مستخدم', `حذف مستخدم: ${user.name}`);
        res.json({ message: 'تم حذف المستخدم بنجاح' });
    } catch (err) {
        console.error('DELETE user error:', err);
        res.status(500).json({ error: 'فشل في حذف المستخدم' });
    }
});

// ----------------------- التحقق من الصحة -----------------------
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// ----------------------- تقديم الواجهة الأمامية -----------------------
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ======================== إنشاء مستخدم افتراضي ========================
async function createDefaultUser() {
    try {
        const existingAdmin = await User.findOne({ name: 'admin' });
        if (!existingAdmin) {
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            await User.create({
                name: 'admin',
                pass: hashedPassword,
                role: 'مدير',
                enabled: true
            });
            console.log('✅ تم إنشاء المستخدم الافتراضي: admin / admin123');
        } else {
            console.log('ℹ️ المستخدم admin موجود مسبقاً');
        }
    } catch (err) {
        console.error('❌ فشل في إنشاء المستخدم الافتراضي:', err.message);
    }
}

// ======================== معالجة الأخطاء العامة ========================
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    // لا ننهي العملية هنا، فقط نسجل
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err);
});

// ======================== بدء الخادم ========================
const PORT = process.env.PORT || 3000;

async function start() {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 10000,
            maxPoolSize: 10
        });
        console.log('✅ MongoDB connected successfully');

        await createDefaultUser();

        app.listen(PORT, () => {
            console.log(`🚀 Server is running on port ${PORT}`);
            console.log(`📌 Login with: admin / admin123`);
        });
    } catch (err) {
        console.error('❌ Failed to start server:', err.message);
        process.exit(1);
    }
}

start();
