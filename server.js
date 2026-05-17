const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const requestIp = require('request-ip');
const { body, validationResult } = require('express-validator');
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
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestIp.mw());
app.use(cors({ origin: true, credentials: true }));

// منع الهجمات (الرسالة بالعربية)
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
    if (this.isModified('pass')) this.pass = await bcrypt.hash(this.pass, 12);
    next();
});
userSchema.methods.comparePassword = async function(candidate) {
    return bcrypt.compare(candidate, this.pass);
};
const User = mongoose.model('User', userSchema);

// نموذج المركب
const vesselSchema = new mongoose.Schema({
    name: { type: String, required: true },
    num: { type: String, unique: true, sparse: true },
    len: Number, reg: String, zone: String, port: String, supp: String,
    stat: { type: String, default: 'صالح', enum: ['صالح', 'معطب', 'صيانة'] },
    break: String, fDate: String, eDate: String, ref: String, cat: String
}, { timestamps: true });
const Vessel = mongoose.model('Vessel', vesselSchema);

// نموذج الردود (subdocument)
const replySchema = new mongoose.Schema({
    adminName: String, reply: String, date: String, time: String
});

// نموذج التذكرة
const ticketSchema = new mongoose.Schema({
    userName: String, userRole: String, subject: String, message: String,
    status: { type: String, default: 'قيد المعالجة' },
    replies: [replySchema], date: String, time: String
}, { timestamps: true });
const Ticket = mongoose.model('Ticket', ticketSchema);

// نموذج سجل النشاطات
const logSchema = new mongoose.Schema({
    requestId: String, userName: String, userRole: String, action: String, details: String,
    ip: String, device: String, date: String, time: String
}, { timestamps: true });
const Log = mongoose.model('Log', logSchema);

// ================= دوال مساعدة =================
const getCurrentDate = () => {
    const d = new Date();
    return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
};
const getCurrentTime = () => {
    const d = new Date();
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
};
const formatDoc = (doc) => {
    if (!doc) return null;
    const obj = doc.toObject();
    const { _id, __v, pass, ...rest } = obj;
    return { ...rest, id: _id.toString() };
};
const formatArray = (arr) => arr.map(formatDoc);

// ================= وسائط المصادقة =================
const auth = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'غير مصرح به' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        if (!user || !user.enabled || decoded.tokenVersion !== user.tokenVersion)
            return res.status(401).json({ error: 'صلاحية منتهية' });
        req.user = user;
        req.userId = user._id;
        req.userRole = user.role;
        req.userName = user.name;
        next();
    } catch {
        res.status(401).json({ error: 'رمز غير صالح' });
    }
};
const admin = (req, res, next) => {
    if (req.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مسموح - مسؤول فقط' });
    next();
};
const editor = (req, res, next) => {
    if (!['مسؤول','محرر'].includes(req.userRole))
        return res.status(403).json({ error: 'غير مسموح - محرر أو مسؤول' });
    next();
};

// ================= مسارات المصادقة =================
app.post('/api/login', async (req, res) => {
    const { name, pass } = req.body;
    const user = await User.findOne({ name });
    if (!user || !(await user.comparePassword(pass)))
        return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    const token = jwt.sign(
        { userId: user._id, role: user.role, name: user.name, tokenVersion: user.tokenVersion },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
    user.lastLogin = new Date();
    await user.save();
    res.json({ token, name: user.name, role: user.role });
});

app.post('/api/logout', auth, (req, res) => res.json({ success: true }));
app.get('/api/verify', auth, (req, res) => {
    res.json({ valid: true, name: req.userName, role: req.userRole, user: formatDoc(req.user) });
});

// ================= مسارات المراكب =================
app.get('/api/vessels', async (req, res) => {
    const vessels = await Vessel.find().sort({ createdAt: -1 });
    res.json(formatArray(vessels));
});
app.get('/api/vessels/all', async (req, res) => {
    const vessels = await Vessel.find().sort({ name: 1 });
    res.json(formatArray(vessels));
});
app.post('/api/vessels', auth, editor, async (req, res) => {
    const vessel = await Vessel.create(req.body);
    res.status(201).json(formatDoc(vessel));
});
app.put('/api/vessels/:id', auth, editor, async (req, res) => {
    const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
    res.json(formatDoc(vessel));
});
app.delete('/api/vessels/:id', auth, admin, async (req, res) => {
    const vessel = await Vessel.findByIdAndDelete(req.params.id);
    if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
    res.json({ success: true });
});

// ================= مسارات التذاكر =================
app.get('/api/tickets', auth, async (req, res) => {
    let query = {};
    if (req.userRole === 'مشاهد') query.userName = req.userName;
    const tickets = await Ticket.find(query).sort({ createdAt: -1 });
    res.json(formatArray(tickets));
});
app.post('/api/tickets', auth, async (req, res) => {
    const { subject, message } = req.body;
    if (!subject || subject.length < 3 || !message || message.length < 5)
        return res.status(400).json({ error: 'العنوان أو الرسالة غير مكتملة' });
    const ticket = await Ticket.create({
        userName: req.userName, userRole: req.userRole, subject, message,
        date: getCurrentDate(), time: getCurrentTime(), status: 'قيد المعالجة', replies: []
    });
    res.status(201).json(formatDoc(ticket));
});
app.put('/api/tickets/:id/reply', auth, async (req, res) => {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
    if (req.userRole !== 'مسؤول' && ticket.userName !== req.userName)
        return res.status(403).json({ error: 'غير مسموح لك بالرد' });
    const { reply } = req.body;
    if (!reply || !reply.reply) return res.status(400).json({ error: 'نص الرد مطلوب' });
    ticket.replies.push({
        adminName: reply.adminName || req.userName,
        reply: reply.reply,
        date: reply.date || getCurrentDate(),
        time: reply.time || getCurrentTime()
    });
    ticket.status = 'تم الرد';
    await ticket.save();
    res.json({ success: true, ticket: formatDoc(ticket) });
});
app.put('/api/tickets/:id/close', auth, async (req, res) => {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
    if (req.userRole !== 'مسؤول' && ticket.userName !== req.userName)
        return res.status(403).json({ error: 'غير مسموح لك بالإغلاق' });
    ticket.status = 'مغلقة';
    await ticket.save();
    res.json({ success: true });
});

// ================= إدارة المستخدمين =================
app.get('/api/users', auth, admin, async (req, res) => {
    const users = await User.find().select('-pass').sort({ createdAt: -1 });
    res.json(formatArray(users));
});
app.post('/api/users', auth, admin, async (req, res) => {
    const { name, pass, role } = req.body;
    if (!name || name.length < 3 || !pass || pass.length < 8)
        return res.status(400).json({ error: 'الاسم (3 أحرف) وكلمة المرور (8 أحرف) مطلوبة' });
    if (await User.findOne({ name })) return res.status(400).json({ error: 'اسم المستخدم موجود' });
    const user = await User.create({ name, pass, role: role || 'مشاهد', enabled: true });
    res.status(201).json(formatDoc(user));
});
app.put('/api/users/:id', auth, admin, async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (req.body.name && req.body.name !== user.name) {
        if (await User.findOne({ name: req.body.name }))
            return res.status(400).json({ error: 'الاسم موجود' });
        user.name = req.body.name;
    }
    if (req.body.pass) { user.pass = req.body.pass; user.tokenVersion++; }
    if (req.body.role) user.role = req.body.role;
    if (req.body.enabled !== undefined && user.enabled !== req.body.enabled) {
        user.enabled = req.body.enabled;
        if (!user.enabled) user.tokenVersion++;
    }
    await user.save();
    res.json(formatDoc(user));
});
app.delete('/api/users/:id', auth, admin, async (req, res) => {
    if (req.userId === req.params.id) return res.status(400).json({ error: 'لا يمكن حذف حسابك' });
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json({ success: true });
});

// ================= سجل النشاطات =================
app.get('/api/logs', auth, admin, async (req, res) => {
    const logs = await Log.find().sort({ createdAt: -1 }).limit(500);
    res.json(formatArray(logs));
});
app.post('/api/logs', auth, async (req, res) => {
    const { userName, userRole, action, details, date, time } = req.body;
    await Log.create({
        requestId: req.requestId, userName, userRole, action, details,
        date: date || getCurrentDate(), time: time || getCurrentTime(),
        ip: requestIp.getClientIp(req), device: req.headers['user-agent']
    });
    res.json({ success: true });
});

// ================= تصدير واستيراد البيانات =================
app.get('/api/export-all', auth, admin, async (req, res) => {
    const vessels = await Vessel.find();
    const users = await User.find().select('-pass');
    const tickets = await Ticket.find();
    const logs = await Log.find().limit(1000);
    res.json({ vessels, users, tickets, logs, exportDate: new Date() });
});
app.post('/api/import-all', auth, admin, async (req, res) => {
    const { vessels, users, tickets } = req.body;
    if (vessels && Array.isArray(vessels)) {
        await Vessel.deleteMany({});
        await Vessel.insertMany(vessels);
    }
    if (users && Array.isArray(users)) {
        await User.deleteMany({});
        for (const u of users)
            await User.create({ name: u.name, pass: u.pass || 'Temp@123', role: u.role, enabled: u.enabled });
    }
    if (tickets && Array.isArray(tickets)) {
        await Ticket.deleteMany({});
        await Ticket.insertMany(tickets);
    }
    res.json({ success: true, message: 'تم استيراد البيانات' });
});

// ================= إحصائيات =================
app.get('/api/stats', auth, admin, async (req, res) => {
    const vessels = await Vessel.countDocuments();
    const tickets = await Ticket.countDocuments();
    const users = await User.countDocuments();
    res.json({ vessels, tickets, users });
});

// ================= فحص الصحة =================
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', mongo: mongoose.connection.readyState === 1, timestamp: new Date() });
});

// ================= بيانات افتراضية عند البدء =================
async function initDatabase() {
    if (!await User.findOne({ name: 'admin' })) {
        await User.create({ name: 'admin', pass: 'Admin@123456', role: 'مسؤول', enabled: true });
        await User.create({ name: 'editor', pass: 'Editor@123456', role: 'محرر', enabled: true });
        await User.create({ name: 'viewer', pass: 'Viewer@123456', role: 'مشاهد', enabled: true });
        console.log('✅ تم إنشاء المستخدمين: admin, editor, viewer');
    }
    if ((await Vessel.countDocuments()) === 0) {
        await Vessel.insertMany([
            { name: "البروق 1", num: "B001", len: 11, reg: "الشمال", stat: "صالح", cat: "البروق" },
            { name: "صقر 1", num: "S001", len: 10, reg: "الساحل", stat: "صالح", cat: "صقور" },
            { name: "خافرة 1", num: "K001", len: 20, reg: "الوسط", stat: "معطب", break: "عطل محرك", fDate: "2025-04-01", cat: "خوافر" }
        ]);
        console.log('✅ تم إنشاء مراكب افتراضية');
    }
}

// ================= تشغيل السيرفر =================
mongoose.connect(MONGO_URI, { maxPoolSize: 10 })
    .then(async () => {
        console.log('✅ متصل بقاعدة البيانات');
        await initDatabase();
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`);
            console.log(`📡 http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
        process.exit(1);
    });
