const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();

// CORS مفتوح للاختبار (يمكن تضييقه لاحقًا)
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json());
app.use(express.static('public'));
app.set('trust proxy', 1);

if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
    console.error('❌ MONGO_URI or JWT_SECRET missing');
    process.exit(1);
}

// ======================== نماذج البيانات ========================
const vesselSchema = new mongoose.Schema({
    name: { type: String, required: true, index: true },
    num: String, len: Number, reg: String, zone: String, port: String,
    supp: String, stat: { type: String, default: 'صالح' }, break: String,
    fDate: String, eDate: String, ref: String, cat: String
}, { timestamps: true });
const Vessel = mongoose.model('Vessel', vesselSchema);

const userSchema = new mongoose.Schema({
    name: { type: String, unique: true, required: true },
    pass: String,
    role: { type: String, default: 'مشاهد', enum: ['مدير', 'محرر', 'مشاهد'] },
    enabled: { type: Boolean, default: true }
});
const User = mongoose.model('User', userSchema);

const ticketSchema = new mongoose.Schema({
    userName: String, subject: String, message: String,
    status: { type: String, default: 'قيد المعالجة' },
    date: { type: Date, default: Date.now }
});
const Ticket = mongoose.model('Ticket', ticketSchema);

const logSchema = new mongoose.Schema({
    userName: String, userRole: String, action: String,
    details: String, date: { type: Date, default: Date.now }
});
const Log = mongoose.model('Log', logSchema);

// دوال مساعدة
function getCategory(len) {
    const n = parseFloat(len);
    if (isNaN(n)) return 'غير محدد';
    if (n === 11) return 'البروق';
    if (n >= 8 && n <= 12) return 'صقور';
    if (n > 12 && n <= 25) return 'خوافر';
    if (n >= 30) return 'طوافات';
    return 'زوارق مزدوجة';
}

async function addLog(userName, userRole, action, details) {
    try { await Log.create({ userName, userRole, action, details }); } catch(e) { console.error(e); }
}

// ======================== المصادقة ========================
function auth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'لا يوجد رمز' });
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    token = token.trim();
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) { res.status(401).json({ error: 'رمز غير صالح' }); }
}

function checkRole(roles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'غير مصرح' });
        if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'لا تصلاحية' });
        next();
    };
}

// ======================== مسارات API ========================
app.get('/', (req, res) => res.send('✅ Marine API running'));
app.get('/api/ping', (req, res) => res.json({ ok: true }));

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    try {
        let { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'مطلوب' });
        username = username.trim();
        const user = await User.findOne({ name: username });
        if (!user || !user.enabled) return res.status(401).json({ error: 'مستخدم غير صحيح' });
        const valid = bcrypt.compareSync(password, user.pass);
        if (!valid) return res.status(401).json({ error: 'كلمة مرور خاطئة' });
        const token = jwt.sign({ id: user._id, name: user.name, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
        await addLog(user.name, user.role, 'تسجيل دخول', 'نجح');
        res.json({ token, user: { name: user.name, role: user.role } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// المراكب
app.get('/api/vessels', auth, async (req, res) => {
    try {
        const vessels = await Vessel.find().lean().sort({ _id: -1 }).limit(500);
        res.json(vessels);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/vessels', auth, async (req, res) => {
    try {
        const { name, len, ...rest } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'الاسم مطلوب' });
        const lenNum = parseFloat(len);
        if (isNaN(lenNum) || lenNum < 0) return res.status(400).json({ error: 'طول غير صالح' });
        const vessel = await Vessel.create({ name: name.trim(), len: lenNum, cat: getCategory(lenNum), ...rest });
        await addLog(req.user.name, req.user.role, 'إضافة مركب', vessel.name);
        res.status(201).json(vessel);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/vessels/:id', auth, checkRole(['مدير', 'محرر']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'معرف غير صالح' });
        const update = { ...req.body };
        if (update.len !== undefined) {
            const lenNum = parseFloat(update.len);
            if (isNaN(lenNum) || lenNum < 0) return res.status(400).json({ error: 'طول غير صالح' });
            update.len = lenNum;
            update.cat = getCategory(lenNum);
        }
        const vessel = await Vessel.findByIdAndUpdate(id, update, { new: true });
        if (!vessel) return res.status(404).json({ error: 'غير موجود' });
        await addLog(req.user.name, req.user.role, 'تعديل مركب', vessel.name);
        res.json(vessel);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/vessels/:id', auth, checkRole(['مدير']), async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndDelete(req.params.id);
        if (!vessel) return res.status(404).json({ error: 'غير موجود' });
        await addLog(req.user.name, req.user.role, 'حذف مركب', vessel.name);
        res.json({ message: 'تم الحذف' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// التذاكر
app.get('/api/tickets', auth, async (req, res) => {
    try {
        let tickets;
        if (req.user.role === 'مدير') tickets = await Ticket.find().sort({ date: -1 });
        else tickets = await Ticket.find({ userName: req.user.name }).sort({ date: -1 });
        res.json(tickets);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tickets', auth, async (req, res) => {
    try {
        const { subject, message } = req.body;
        if (!subject || !message) return res.status(400).json({ error: 'العنوان والرسالة مطلوبان' });
        const ticket = await Ticket.create({ userName: req.user.name, subject, message, status: 'قيد المعالجة' });
        await addLog(req.user.name, req.user.role, 'إرسال تذكرة', subject);
        res.status(201).json(ticket);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/tickets/:id', auth, checkRole(['مدير']), async (req, res) => {
    try {
        const { status } = req.body;
        if (!['قيد المعالجة', 'تم الرد', 'مغلق'].includes(status)) return res.status(400).json({ error: 'حالة غير صالحة' });
        const ticket = await Ticket.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!ticket) return res.status(404).json({ error: 'غير موجود' });
        await addLog(req.user.name, req.user.role, 'تحديث تذكرة', `الحالة: ${status}`);
        res.json(ticket);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// سجل الأنشطة (للمدير فقط)
app.get('/api/logs', auth, checkRole(['مدير']), async (req, res) => {
    try {
        const logs = await Log.find().sort({ date: -1 }).limit(500);
        res.json(logs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// إدارة المستخدمين (للمدير فقط)
app.get('/api/users', auth, checkRole(['مدير']), async (req, res) => {
    try {
        const users = await User.find().select('-pass');
        res.json(users);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users', auth, checkRole(['مدير']), async (req, res) => {
    try {
        const { name, password, role, enabled } = req.body;
        if (!name || !password) return res.status(400).json({ error: 'الاسم وكلمة المرور مطلوبان' });
        const existing = await User.findOne({ name: name.trim() });
        if (existing) return res.status(400).json({ error: 'الاسم موجود' });
        const hashed = bcrypt.hashSync(password, 10);
        const user = await User.create({ name: name.trim(), pass: hashed, role: role || 'مشاهد', enabled: enabled !== undefined ? enabled : true });
        await addLog(req.user.name, req.user.role, 'إضافة مستخدم', user.name);
        res.status(201).json({ id: user._id, name: user.name, role: user.role, enabled: user.enabled });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/users/:id/password', auth, checkRole(['مدير']), async (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword) return res.status(400).json({ error: 'كلمة المرور مطلوبة' });
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'مستخدم غير موجود' });
        user.pass = bcrypt.hashSync(newPassword, 10);
        await user.save();
        await addLog(req.user.name, req.user.role, 'تغيير كلمة مرور', user.name);
        res.json({ message: 'تم التغيير' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/users/:id/toggle', auth, checkRole(['مدير']), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'غير موجود' });
        user.enabled = !user.enabled;
        await user.save();
        await addLog(req.user.name, req.user.role, user.enabled ? 'تفعيل مستخدم' : 'تعطيل مستخدم', user.name);
        res.json({ message: 'تم التغيير', enabled: user.enabled });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/users/:id', auth, checkRole(['مدير']), async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ error: 'غير موجود' });
        await addLog(req.user.name, req.user.role, 'حذف مستخدم', user.name);
        res.json({ message: 'تم الحذف' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// تصدير واستيراد البيانات (للمدير)
app.get('/api/export', auth, checkRole(['مدير']), async (req, res) => {
    try {
        const vessels = await Vessel.find().lean();
        const users = await User.find().select('-pass').lean();
        const tickets = await Ticket.find().lean();
        const logs = await Log.find().lean();
        res.json({ vessels, users, tickets, logs });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/import', auth, checkRole(['مدير']), async (req, res) => {
    try {
        const { vessels, users, tickets, logs } = req.body;
        if (vessels) { await Vessel.deleteMany({}); await Vessel.insertMany(vessels); }
        if (users) { await User.deleteMany({}); await User.insertMany(users); }
        if (tickets) { await Ticket.deleteMany({}); await Ticket.insertMany(tickets); }
        if (logs) { await Log.deleteMany({}); await Log.insertMany(logs); }
        await addLog(req.user.name, req.user.role, 'استيراد بيانات', 'من ملف JSON');
        res.json({ message: 'تم الاستيراد بنجاح' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// تقديم الواجهة الأمامية
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// إنشاء مستخدم افتراضي (admin)
async function createDefaultUser() {
    const existing = await User.findOne({ name: 'admin' });
    if (!existing) {
        const hashed = bcrypt.hashSync('admin123', 10);
        await User.create({ name: 'admin', pass: hashed, role: 'مدير', enabled: true });
        console.log('✅ تم إنشاء admin/admin123');
    }
}

const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 })
    .then(async () => {
        console.log('✅ MongoDB متصل');
        await createDefaultUser();
        app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
    })
    .catch(err => console.error('❌ فشل الاتصال:', err));
