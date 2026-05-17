const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const requestIp = require('request-ip');
require('dotenv').config();

const app = express();

// ================= الإعدادات الأساسية =================
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'my_super_secret_jwt_key_change_me';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/marine_db';

// الأمان والضغط
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestIp.mw());
app.use(cors({ origin: true, credentials: true }));

// Rate limiting (منع الهجمات)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    keyGenerator: (req) => requestIp.getClientIp(req) || req.ip,
    message: { error: 'طلبات كثيرة، يرجى المحاولة لاحقاً' }
});
app.use('/api/', limiter);

// ================= نماذج قاعدة البيانات =================

// نموذج المستخدم
const userSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true, minlength: 3 },
    pass: { type: String, required: true },
    role: { type: String, default: 'مشاهد', enum: ['مسؤول', 'محرر', 'مشاهد'] },
    enabled: { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0 }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
    if (this.isModified('pass')) {
        this.pass = await bcrypt.hash(this.pass, 12);
    }
    next();
});
userSchema.methods.comparePassword = async function(candidate) {
    return bcrypt.compare(candidate, this.pass);
};
const User = mongoose.model('User', userSchema);

// نموذج المركب
const vesselSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
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

// نموذج الردود (subdocument)
const replySchema = new mongoose.Schema({
    adminName: String,
    reply: String,
    date: String,
    time: String
});

// نموذج التذكرة
const ticketSchema = new mongoose.Schema({
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, default: 'قيد المعالجة', enum: ['قيد المعالجة', 'تم الرد', 'مغلقة'] },
    replies: [replySchema],
    date: { type: String, default: '' },
    time: { type: String, default: '' }
}, { timestamps: true });
const Ticket = mongoose.model('Ticket', ticketSchema);

// نموذج سجل الأنشطة
const logSchema = new mongoose.Schema({
    userName: String,
    userRole: String,
    action: String,
    details: String,
    ip: String,
    device: String,
    date: String,
    time: String
}, { timestamps: true });
const Log = mongoose.model('Log', logSchema);

// ================= دوال مساعدة =================
const getCurrentDate = () => {
    const d = new Date();
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
};
const getCurrentTime = () => {
    const d = new Date();
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};
const formatDoc = (doc) => {
    if (!doc) return null;
    const obj = doc.toObject();
    const { _id, __v, pass, ...rest } = obj;
    return { ...rest, id: _id.toString() };
};
const formatArray = (arr) => arr.map(formatDoc);

// تحديد فئة المركب بناءً على الطول (كما في الواجهة)
function getCategory(len) {
    const n = parseFloat(len);
    if (isNaN(n)) return 'غير محدد';
    if (n === 11) return 'البروق';
    if (n >= 8 && n <= 12 && n !== 11) return 'صقور';
    if (n > 12 && n <= 25) return 'خوافر';
    if (n >= 30) return 'طوافات';
    return 'زوارق مزدوجة';
}

// تسجيل النشاط
async function addLog(userName, userRole, action, details, req = null) {
    try {
        await Log.create({
            userName,
            userRole,
            action,
            details,
            ip: req ? requestIp.getClientIp(req) : '',
            device: req ? req.headers['user-agent'] : '',
            date: getCurrentDate(),
            time: getCurrentTime()
        });
    } catch (err) {
        console.error('Log error:', err.message);
    }
}

// ================= وسائط المصادقة والصلاحيات =================
const auth = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'غير مصرح، يرجى تسجيل الدخول' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user || !user.enabled) return res.status(401).json({ error: 'حساب غير موجود أو معطل' });
        req.user = user;
        req.userId = user._id;
        req.userRole = user.role;
        req.userName = user.name;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'رمز غير صالح أو منتهي' });
    }
};

const checkRole = (roles) => (req, res, next) => {
    if (!roles.includes(req.userRole)) {
        return res.status(403).json({ error: 'لا تملك الصلاحية لهذا الإجراء' });
    }
    next();
};

// ================= مسارات المصادقة =================
app.post('/api/login', async (req, res) => {
    try {
        const { name, pass } = req.body;
        if (!name || !pass) return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });

        const user = await User.findOne({ name });
        if (!user || !user.enabled) return res.status(401).json({ error: 'بيانات غير صحيحة أو حساب معطل' });

        const isValid = await user.comparePassword(pass);
        if (!isValid) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });

        const token = jwt.sign(
            { id: user._id, name: user.name, role: user.role, tokenVersion: user.tokenVersion },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        await addLog(user.name, user.role, 'تسجيل دخول', 'قام بتسجيل الدخول', req);
        res.json({ token, name: user.name, role: user.role });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

app.post('/api/logout', auth, async (req, res) => {
    await addLog(req.userName, req.userRole, 'تسجيل خروج', 'قام بتسجيل الخروج', req);
    res.json({ success: true });
});

app.get('/api/verify', auth, (req, res) => {
    res.json({ valid: true, name: req.userName, role: req.userRole, user: formatDoc(req.user) });
});

// ================= مسارات المراكب =================
app.get('/api/vessels', auth, async (req, res) => {
    const vessels = await Vessel.find().sort({ createdAt: -1 });
    res.json(formatArray(vessels));
});

app.get('/api/vessels/all', auth, async (req, res) => {
    const vessels = await Vessel.find().sort({ name: 1 });
    res.json(formatArray(vessels));
});

app.post('/api/vessels', auth, checkRole(['مسؤول', 'محرر']), async (req, res) => {
    try {
        const { name, len } = req.body;
        if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
        const cat = getCategory(len);
        const vessel = await Vessel.create({ ...req.body, cat });
        await addLog(req.userName, req.userRole, 'إضافة مركب', `أضاف مركب "${vessel.name}"`, req);
        res.status(201).json(formatDoc(vessel));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/vessels/:id', auth, checkRole(['مسؤول', 'محرر']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'معرف غير صالح' });
        const update = { ...req.body };
        if (update.len !== undefined) update.cat = getCategory(update.len);
        const vessel = await Vessel.findByIdAndUpdate(id, update, { new: true });
        if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
        await addLog(req.userName, req.userRole, 'تعديل مركب', `عدل مركب "${vessel.name}"`, req);
        res.json(formatDoc(vessel));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/vessels/:id', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const { id } = req.params;
        const vessel = await Vessel.findByIdAndDelete(id);
        if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
        await addLog(req.userName, req.userRole, 'حذف مركب', `حذف مركب "${vessel.name}"`, req);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= مسارات التذاكر =================
app.get('/api/tickets', auth, checkRole(['مسؤول', 'محرر']), async (req, res) => {
    const tickets = await Ticket.find().sort({ createdAt: -1 });
    res.json(formatArray(tickets));
});

app.post('/api/tickets', auth, async (req, res) => {
    try {
        const { subject, message } = req.body;
        if (!subject || !message) return res.status(400).json({ error: 'الموضوع والرسالة مطلوبان' });
        const ticket = await Ticket.create({
            userName: req.userName,
            userRole: req.userRole,
            subject,
            message,
            date: getCurrentDate(),
            time: getCurrentTime(),
            status: 'قيد المعالجة',
            replies: []
        });
        await addLog(req.userName, req.userRole, 'إنشاء تذكرة', `موضوع: ${subject}`, req);
        res.status(201).json(formatDoc(ticket));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// الرد على تذكرة
app.put('/api/tickets/:id/reply', auth, checkRole(['مسؤول', 'محرر']), async (req, res) => {
    try {
        const { id } = req.params;
        const { reply } = req.body;
        if (!reply || !reply.reply) return res.status(400).json({ error: 'نص الرد مطلوب' });
        const ticket = await Ticket.findById(id);
        if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
        ticket.replies.push({
            adminName: req.userName,
            reply: reply.reply,
            date: getCurrentDate(),
            time: getCurrentTime()
        });
        ticket.status = 'تم الرد';
        await ticket.save();
        await addLog(req.userName, req.userRole, 'رد على تذكرة', `رد على تذكرة: ${ticket.subject}`, req);
        res.json({ success: true, ticket: formatDoc(ticket) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// إغلاق تذكرة
app.put('/api/tickets/:id/close', auth, checkRole(['مسؤول', 'محرر']), async (req, res) => {
    try {
        const { id } = req.params;
        const ticket = await Ticket.findById(id);
        if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
        ticket.status = 'مغلقة';
        await ticket.save();
        await addLog(req.userName, req.userRole, 'إغلاق تذكرة', `أغلق تذكرة: ${ticket.subject}`, req);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= مسارات المستخدمين (للمسؤول فقط) =================
app.get('/api/users', auth, checkRole(['مسؤول']), async (req, res) => {
    const users = await User.find().select('-pass');
    res.json(formatArray(users));
});

app.post('/api/users', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const { name, pass, role, enabled } = req.body;
        if (!name || !pass) return res.status(400).json({ error: 'الاسم وكلمة المرور مطلوبان' });
        if (await User.findOne({ name })) return res.status(400).json({ error: 'الاسم موجود مسبقاً' });
        const user = await User.create({ name, pass, role: role || 'مشاهد', enabled: enabled !== false });
        await addLog(req.userName, req.userRole, 'إضافة مستخدم', `أضاف مستخدم: ${name}`, req);
        res.status(201).json(formatDoc(user));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id);
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
        if (req.body.name && req.body.name !== user.name) {
            if (await User.findOne({ name: req.body.name })) return res.status(400).json({ error: 'الاسم موجود' });
            user.name = req.body.name;
        }
        if (req.body.pass) { user.pass = req.body.pass; user.tokenVersion++; }
        if (req.body.role) user.role = req.body.role;
        if (req.body.enabled !== undefined && user.enabled !== req.body.enabled) {
            user.enabled = req.body.enabled;
            if (!user.enabled) user.tokenVersion++;
        }
        await user.save();
        await addLog(req.userName, req.userRole, 'تعديل مستخدم', `عدل مستخدم: ${user.name}`, req);
        res.json(formatDoc(user));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const { id } = req.params;
        if (req.userId === id) return res.status(400).json({ error: 'لا يمكن حذف حسابك الخاص' });
        const user = await User.findByIdAndDelete(id);
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
        await addLog(req.userName, req.userRole, 'حذف مستخدم', `حذف مستخدم: ${user.name}`, req);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= سجل الأنشطة (للمسؤول فقط) =================
app.get('/api/logs', auth, checkRole(['مسؤول']), async (req, res) => {
    const logs = await Log.find().sort({ createdAt: -1 }).limit(500);
    res.json(formatArray(logs));
});

app.post('/api/logs', auth, async (req, res) => {
    // هذا المسار يمكن أن يستخدم من الواجهة لتسجيل الأنشطة، لكننا نستخدم دالة addLog أعلاه.
    res.json({ success: true });
});

// ================= تصدير واستيراد البيانات (للمسؤول فقط) =================
app.get('/api/export-all', auth, checkRole(['مسؤول']), async (req, res) => {
    const vessels = await Vessel.find();
    const users = await User.find().select('-pass');
    const tickets = await Ticket.find();
    const logs = await Log.find().limit(1000);
    res.json({ vessels, users, tickets, logs, exportDate: new Date() });
});

app.post('/api/import-all', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const { vessels, users, tickets } = req.body;
        if (vessels && Array.isArray(vessels)) {
            await Vessel.deleteMany({});
            await Vessel.insertMany(vessels);
        }
        if (users && Array.isArray(users)) {
            await User.deleteMany({});
            for (const u of users) {
                await User.create({ name: u.name, pass: u.pass || 'Temp@123', role: u.role, enabled: u.enabled });
            }
        }
        if (tickets && Array.isArray(tickets)) {
            await Ticket.deleteMany({});
            await Ticket.insertMany(tickets);
        }
        await addLog(req.userName, req.userRole, 'استيراد بيانات', 'قام باستيراد جميع البيانات', req);
        res.json({ success: true, message: 'تم استيراد البيانات بنجاح' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= إحصائيات =================
app.get('/api/stats', auth, checkRole(['مسؤول']), async (req, res) => {
    const vessels = await Vessel.countDocuments();
    const tickets = await Ticket.countDocuments();
    const users = await User.countDocuments();
    res.json({ vessels, tickets, users });
});

// ================= فحص صحة السيرفر =================
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', mongo: mongoose.connection.readyState === 1, timestamp: new Date() });
});

// ================= تقديم الواجهة الأمامية (اختياري) =================
// تعليق: إذا كنت تخدم الواجهة من مجلد `public`، استخدم هذا.
app.use(express.static('public'));

// ================= إنشاء المستخدمين والمراكب الافتراضية =================
async function initDatabase() {
    const admin = await User.findOne({ name: 'admin' });
    if (!admin) {
        await User.create({ name: 'admin', pass: 'Admin@123456', role: 'مسؤول', enabled: true });
        await User.create({ name: 'editor', pass: 'Editor@123456', role: 'محرر', enabled: true });
        await User.create({ name: 'viewer', pass: 'Viewer@123456', role: 'مشاهد', enabled: true });
        console.log('✅ تم إنشاء المستخدمين: admin (Admin@123456), editor (Editor@123456), viewer (Viewer@123456)');
    }
    const vesselsCount = await Vessel.countDocuments();
    if (vesselsCount === 0) {
        await Vessel.insertMany([
            { name: "البروق 1", num: "B001", len: 11, reg: "الشمال", stat: "صالح", cat: "البروق" },
            { name: "صقر 1", num: "S001", len: 10, reg: "الساحل", stat: "صالح", cat: "صقور" },
            { name: "خافرة 1", num: "K001", len: 20, reg: "الوسط", stat: "معطب", break: "عطل محرك", fDate: "2025-04-01", cat: "خوافر" }
        ]);
        console.log('✅ تم إنشاء مراكب افتراضية');
    }
}

// ================= تشغيل الخادم =================
mongoose.connect(MONGO_URI, { maxPoolSize: 10 })
    .then(async () => {
        console.log('✅ متصل بقاعدة البيانات');
        await initDatabase();
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`);
            console.log(`📡 http://localhost:${PORT}`);
            console.log(`👤 بيانات الدخول: admin / Admin@123456`);
        });
    })
    .catch(err => {
        console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message);
        process.exit(1);
    });
