const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();

// ==================== إعدادات أساسية ====================
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'my_very_secret_key_change_me';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/marine_db';

// وسائط (Middleware)
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));   // تقديم الواجهة إذا كانت في مجلد public

// ==================== نماذج قاعدة البيانات ====================

// مستخدم
const userSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    pass: { type: String, required: true },
    role: { type: String, default: 'مشاهد', enum: ['مسؤول', 'محرر', 'مشاهد'] },
    enabled: { type: Boolean, default: true }
});
userSchema.pre('save', async function(next) {
    if (this.isModified('pass')) {
        this.pass = await bcrypt.hash(this.pass, 10);
    }
    next();
});
userSchema.methods.comparePassword = async function(candidate) {
    return bcrypt.compare(candidate, this.pass);
};
const User = mongoose.model('User', userSchema);

// مركب
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

// رد تذكرة
const replySchema = new mongoose.Schema({
    adminName: String,
    reply: String,
    date: String,
    time: String
});

// تذكرة
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

// سجل نشاط
const logSchema = new mongoose.Schema({
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    action: { type: String, required: true },
    details: { type: String, default: '' },
    ip: { type: String, default: '' },
    device: { type: String, default: '' },
    date: { type: String, default: '' },
    time: { type: String, default: '' }
}, { timestamps: true });
const Log = mongoose.model('Log', logSchema);

// ==================== دوال مساعدة ====================
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

// تسجيل النشاط
async function addLog(userName, userRole, action, details, req = null) {
    try {
        await Log.create({
            userName,
            userRole,
            action,
            details,
            ip: req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : '',
            device: req ? req.headers['user-agent'] : '',
            date: getCurrentDate(),
            time: getCurrentTime()
        });
    } catch (err) {
        console.error('Log error:', err.message);
    }
}

// تحديد فئة المركب (كما في الواجهة)
function getCategory(len) {
    const n = parseFloat(len);
    if (isNaN(n)) return 'غير محدد';
    if (n === 11) return 'البروق';
    if (n >= 8 && n <= 12 && n !== 11) return 'صقور';
    if (n > 12 && n <= 25) return 'خوافر';
    if (n >= 30) return 'طوافات';
    return 'زوارق مزدوجة';
}

// ==================== وسائط المصادقة والصلاحيات ====================
const auth = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'غير مصرح، يرجى تسجيل الدخول' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user || !user.enabled) {
            return res.status(401).json({ error: 'حساب غير موجود أو معطل' });
        }
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
        return res.status(403).json({ error: 'لا تملك الصلاحية للقيام بهذا الإجراء' });
    }
    next();
};

// ==================== مسارات API ====================

// -------------------- المصادقة --------------------
app.post('/api/login', async (req, res) => {
    try {
        const { name, pass } = req.body;
        if (!name || !pass) {
            return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
        }
        const user = await User.findOne({ name });
        if (!user || !user.enabled) {
            return res.status(401).json({ error: 'بيانات غير صحيحة أو حساب معطل' });
        }
        const isValid = await user.comparePassword(pass);
        if (!isValid) {
            return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
        }
        const token = jwt.sign(
            { id: user._id, name: user.name, role: user.role },
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

// -------------------- المراكب --------------------
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
        const vesselData = { ...req.body };
        if (vesselData.len !== undefined) {
            vesselData.cat = getCategory(vesselData.len);
        }
        const vessel = await Vessel.create(vesselData);
        await addLog(req.userName, req.userRole, 'إضافة مركب', `أضاف مركب "${vessel.name}"`, req);
        res.status(201).json(formatDoc(vessel));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/vessels/:id', auth, checkRole(['مسؤول', 'محرر']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'معرف غير صالح' });
        }
        const updateData = { ...req.body };
        if (updateData.len !== undefined) {
            updateData.cat = getCategory(updateData.len);
        }
        const vessel = await Vessel.findByIdAndUpdate(id, updateData, { new: true });
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

// -------------------- التذاكر --------------------
app.get('/api/tickets', auth, checkRole(['مسؤول', 'محرر']), async (req, res) => {
    const tickets = await Ticket.find().sort({ createdAt: -1 });
    res.json(formatArray(tickets));
});

app.post('/api/tickets', auth, async (req, res) => {
    try {
        const { subject, message } = req.body;
        if (!subject || !message) {
            return res.status(400).json({ error: 'الموضوع والرسالة مطلوبان' });
        }
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

app.put('/api/tickets/:id/reply', auth, checkRole(['مسؤول', 'محرر']), async (req, res) => {
    try {
        const { id } = req.params;
        const { reply } = req.body;
        if (!reply || !reply.reply) {
            return res.status(400).json({ error: 'نص الرد مطلوب' });
        }
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

// -------------------- المستخدمين --------------------
app.get('/api/users', auth, checkRole(['مسؤول']), async (req, res) => {
    const users = await User.find().select('-pass');
    res.json(formatArray(users));
});

app.post('/api/users', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const { name, pass, role } = req.body;
        if (!name || !pass) {
            return res.status(400).json({ error: 'الاسم وكلمة المرور مطلوبان' });
        }
        const existing = await User.findOne({ name });
        if (existing) return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
        const user = await User.create({ name, pass, role: role || 'مشاهد', enabled: true });
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
            const existing = await User.findOne({ name: req.body.name });
            if (existing) return res.status(400).json({ error: 'الاسم موجود' });
            user.name = req.body.name;
        }
        if (req.body.pass) user.pass = req.body.pass;
        if (req.body.role) user.role = req.body.role;
        if (req.body.enabled !== undefined) user.enabled = req.body.enabled;
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
        if (req.userId === id) {
            return res.status(400).json({ error: 'لا يمكن حذف حسابك الخاص' });
        }
        const user = await User.findByIdAndDelete(id);
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
        await addLog(req.userName, req.userRole, 'حذف مستخدم', `حذف مستخدم: ${user.name}`, req);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// -------------------- سجل الأنشطة --------------------
app.get('/api/logs', auth, checkRole(['مسؤول']), async (req, res) => {
    const logs = await Log.find().sort({ createdAt: -1 }).limit(500);
    res.json(formatArray(logs));
});

app.post('/api/logs', auth, async (req, res) => {
    // يمكن للواجهة استخدام هذا المسار لتسجيل أنشطة إضافية
    res.json({ success: true });
});

// -------------------- تصدير واستيراد البيانات --------------------
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

// -------------------- إحصائيات --------------------
app.get('/api/stats', auth, checkRole(['مسؤول']), async (req, res) => {
    const vessels = await Vessel.countDocuments();
    const tickets = await Ticket.countDocuments();
    const users = await User.countDocuments();
    res.json({ vessels, tickets, users });
});

// -------------------- فحص الصحة --------------------
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', mongo: mongoose.connection.readyState === 1, timestamp: new Date() });
});

// ==================== إنشاء المستخدمين والمراكب الافتراضية ====================
async function initDatabase() {
    // حذف المستخدمين السابقين لضمان admin/admin123
    await User.deleteMany({});
    const hashedPass = await bcrypt.hash('admin123', 10);
    await User.create({ name: 'admin', pass: hashedPass, role: 'مسؤول', enabled: true });
    await User.create({ name: 'editor', pass: await bcrypt.hash('editor123', 10), role: 'محرر', enabled: true });
    await User.create({ name: 'viewer', pass: await bcrypt.hash('viewer123', 10), role: 'مشاهد', enabled: true });
    console.log('✅ تم إنشاء المستخدمين: admin/admin123, editor/editor123, viewer/viewer123');

    const vesselsCount = await Vessel.countDocuments();
    if (vesselsCount === 0) {
        await Vessel.insertMany([
            { name: "البروق 1", num: "B001", len: 11, reg: "الشمال", stat: "صالح", cat: "البروق" },
            { name: "صقر 1", num: "S001", len: 10, reg: "الساحل", stat: "صالح", cat: "صقور" },
            { name: "خافرة 1", num: "K001", len: 20, reg: "الوسط", stat: "معطب", break: "عطل محرك", fDate: "2025-04-01", cat: "خوافر" },
            { name: "زورق 1", num: "Z001", len: 15, reg: "الجنوب", stat: "صيانة", cat: "زوارق مزدوجة" }
        ]);
        console.log('✅ تم إنشاء مراكب افتراضية');
    }
}

// ==================== تشغيل الخادم ====================
mongoose.connect(MONGO_URI, { maxPoolSize: 10 })
    .then(async () => {
        console.log('✅ متصل بقاعدة البيانات MongoDB');
        await initDatabase();
        app.listen(PORT, '0.0.0.0', () => {
            const localIp = (() => {
                const os = require('os');
                const ifaces = os.networkInterfaces();
                for (const name of Object.keys(ifaces)) {
                    for (const iface of ifaces[name]) {
                        if (iface.family === 'IPv4' && !iface.internal) return iface.address;
                    }
                }
                return 'localhost';
            })();
            console.log(`\n🚀 السيرفر يعمل على:`);
            console.log(`📡 محلياً: http://localhost:${PORT}`);
            console.log(`📱 من الهاتف (نفس الشبكة): http://${localIp}:${PORT}`);
            console.log(`\n👤 بيانات الدخول:`);
            console.log(`   admin   / admin123`);
            console.log(`   editor  / editor123`);
            console.log(`   viewer  / viewer123`);
            console.log(`\n✨ واجهة التطبيق: ${localIp !== 'localhost' ? `http://${localIp}:${PORT}` : `http://localhost:${PORT}`}`);
        });
    })
    .catch(err => {
        console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message);
        process.exit(1);
    });
