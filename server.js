const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();

// ======================== CROSS-ORIGIN (CORS) ========================
// السماح لجميع النطاقات (للتبسيط، لكن في الإنتاج يفضل تحديدها)
app.use(cors({
    origin: '*', // أو استخدم القائمة المسموحة
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public')); // تقديم الملفات الثابتة (index.html, script.js)

// تفعيل trust proxy (مفيد لـ Render)
app.set('trust proxy', 1);

// ======================== التحقق من المتغيرات البيئية ========================
if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI غير موجود في .env');
    process.exit(1);
}
if (!process.env.JWT_SECRET) {
    console.error('❌ JWT_SECRET غير موجود في .env');
    process.exit(1);
}
console.log('✅ البيئة جاهزة');

// ======================== نماذج قاعدة البيانات ========================
const vesselSchema = new mongoose.Schema({
    name: { type: String, required: true, index: true },
    num: { type: String, default: '' },
    len: { type: Number, required: true, min: 0 },
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

const userSchema = new mongoose.Schema({
    name: { type: String, unique: true, required: true },
    pass: { type: String, required: true },
    role: { type: String, default: 'مشاهد', enum: ['مشاهد', 'كاتب', 'مدير'] },
    enabled: { type: Boolean, default: true }
});
const User = mongoose.model('User', userSchema);

const ticketSchema = new mongoose.Schema({
    userName: String,
    subject: String,
    message: String,
    status: { type: String, default: 'قيد المعالجة' },
    date: { type: Date, default: Date.now }
});
const Ticket = mongoose.model('Ticket', ticketSchema);

const logSchema = new mongoose.Schema({
    userName: String,
    action: String,
    details: String,
    date: { type: Date, default: Date.now }
});
const Log = mongoose.model('Log', logSchema);

// ======================== دوال مساعدة ========================
function getCategory(len) {
    const n = parseFloat(len);
    if (isNaN(n)) return 'غير محدد';
    if (n === 11) return 'البروق';
    if (n >= 8 && n <= 12 && n !== 11) return 'صقور';
    if (n > 12 && n <= 25) return 'خوافر';
    if (n >= 30) return 'طوافات';
    return 'زوارق مزدوجة';
}

async function addLog(userName, action, details = '') {
    try {
        await Log.create({ userName, action, details });
    } catch (err) {
        console.error('فشل تسجيل الحدث:', err.message);
    }
}

// ======================== وسائط المصادقة ========================
function auth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'لا يوجد رمز دخول' });
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    token = token.trim();
    if (!token) return res.status(401).json({ error: 'رمز فارغ' });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        console.error('JWT خطأ:', err.message);
        return res.status(401).json({ error: 'رمز غير صالح' });
    }
}

function checkRole(roles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'غير مصرح' });
        if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'لا تصلاحية' });
        next();
    };
}

// ======================== نقاط النهاية (API) ========================
app.get('/', (req, res) => res.send('✅ Marine API is running'));
app.get('/api/ping', (req, res) => res.json({ ok: true, time: Date.now() }));

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    try {
        let { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبة' });
        username = username.trim();
        const user = await User.findOne({ name: username });
        if (!user || !user.enabled) return res.status(401).json({ error: 'مستخدم غير موجود أو معطل' });
        const valid = bcrypt.compareSync(password, user.pass);
        if (!valid) return res.status(401).json({ error: 'كلمة مرور خاطئة' });
        const token = jwt.sign({ id: user._id, name: user.name, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
        await addLog(user.name, 'تسجيل دخول', 'نجح');
        res.json({ token, user: { name: user.name, role: user.role } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// جلب جميع السفن (مع تحسين الأداء)
app.get('/api/vessels', auth, async (req, res) => {
    try {
        console.log("👤 مستخدم:", req.user?.name);
        const vessels = await Vessel.find().lean().sort({ _id: -1 }).limit(500);
        console.log(`📊 تم إرجاع ${vessels.length} سفينة`);
        res.json(vessels);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'فشل جلب السفن' });
    }
});

// إضافة سفينة جديدة
app.post('/api/vessels', auth, async (req, res) => {
    try {
        const { name, len } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'الاسم مطلوب' });
        const lenNum = parseFloat(len);
        if (isNaN(lenNum) || lenNum < 0) return res.status(400).json({ error: 'طول غير صحيح' });
        const vessel = await Vessel.create({
            ...req.body,
            name: name.trim(),
            len: lenNum,
            cat: getCategory(lenNum)
        });
        await addLog(req.user.name, 'إضافة سفينة', vessel.name);
        res.status(201).json(vessel);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'فشل الإضافة' });
    }
});

// تحديث سفينة
app.put('/api/vessels/:id', auth, checkRole(['مدير', 'كاتب']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'معرف غير صالح' });
        const update = { ...req.body };
        if (update.len !== undefined) {
            const lenNum = parseFloat(update.len);
            if (isNaN(lenNum) || lenNum < 0) return res.status(400).json({ error: 'طول غير صحيح' });
            update.len = lenNum;
            update.cat = getCategory(lenNum);
        }
        if (update.name) update.name = update.name.trim();
        const vessel = await Vessel.findByIdAndUpdate(id, update, { new: true, runValidators: true });
        if (!vessel) return res.status(404).json({ error: 'غير موجودة' });
        await addLog(req.user.name, 'تحديث سفينة', vessel.name);
        res.json(vessel);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'فشل التحديث' });
    }
});

// حذف سفينة
app.delete('/api/vessels/:id', auth, checkRole(['مدير']), async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndDelete(req.params.id);
        if (!vessel) return res.status(404).json({ error: 'غير موجودة' });
        await addLog(req.user.name, 'حذف سفينة', vessel.name);
        res.json({ message: 'تم الحذف' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'فشل الحذف' });
    }
});

// ----------------------- التذاكر -----------------------
app.get('/api/tickets', auth, checkRole(['مدير', 'كاتب']), async (req, res) => {
    const tickets = await Ticket.find().sort({ createdAt: -1 });
    res.json(tickets);
});
app.post('/api/tickets', auth, async (req, res) => {
    const { subject, message } = req.body;
    if (!subject || !message) return res.status(400).json({ error: 'الموضوع والرسالة مطلوبان' });
    const ticket = await Ticket.create({ userName: req.user.name, subject, message });
    await addLog(req.user.name, 'تذكرة جديدة', subject);
    res.status(201).json(ticket);
});
app.put('/api/tickets/:id', auth, checkRole(['مدير', 'كاتب']), async (req, res) => {
    const { status } = req.body;
    if (!['قيد المعالجة', 'تم الرد', 'مغلق'].includes(status)) return res.status(400).json({ error: 'حالة غير صالحة' });
    const ticket = await Ticket.findByIdAndUpdate(req.params.id, { status }, { new: true });
    res.json(ticket);
});

// ----------------------- السجلات -----------------------
app.get('/api/logs', auth, checkRole(['مدير']), async (req, res) => {
    const logs = await Log.find().sort({ createdAt: -1 }).limit(200);
    res.json(logs);
});

// ----------------------- المستخدمين -----------------------
app.get('/api/users', auth, checkRole(['مدير']), async (req, res) => {
    const users = await User.find().select('-pass');
    res.json(users);
});
app.post('/api/users', auth, checkRole(['مدير']), async (req, res) => {
    const { name, password, role, enabled } = req.body;
    if (!name || !password) return res.status(400).json({ error: 'الاسم وكلمة المرور مطلوبان' });
    const existing = await User.findOne({ name: name.trim() });
    if (existing) return res.status(400).json({ error: 'الاسم موجود' });
    const hashed = bcrypt.hashSync(password, 10);
    const user = await User.create({ name: name.trim(), pass: hashed, role: role || 'مشاهد', enabled: enabled !== undefined ? enabled : true });
    await addLog(req.user.name, 'إضافة مستخدم', user.name);
    res.status(201).json({ id: user._id, name: user.name, role: user.role, enabled: user.enabled });
});
app.delete('/api/users/:id', auth, checkRole(['مدير']), async (req, res) => {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'غير موجود' });
    await addLog(req.user.name, 'حذف مستخدم', user.name);
    res.json({ message: 'تم الحذف' });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// تقديم الواجهة الأمامية (أي طلب آخر يذهب إلى index.html)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ======================== إنشاء مستخدم admin افتراضي ========================
async function createDefaultUser() {
    try {
        const existing = await User.findOne({ name: 'admin' });
        if (!existing) {
            const hashed = bcrypt.hashSync('admin123', 10);
            await User.create({ name: 'admin', pass: hashed, role: 'مدير', enabled: true });
            console.log('✅ تم إنشاء المستخدم الافتراضي: admin / admin123');
        }
    } catch (err) {
        console.error('فشل إنشاء المستخدم الافتراضي:', err.message);
    }
}

// ======================== بدء الخادم ========================
const PORT = process.env.PORT || 3000;

process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

async function start() {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 45000,
            maxPoolSize: 20
        });
        console.log('✅ تم الاتصال بـ MongoDB');
        await createDefaultUser();
        app.listen(PORT, () => {
            console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
            console.log(`⚠️ رابط التطبيق: ${process.env.PUBLIC_URL || 'https://your-app.onrender.com'}`);
        });
    } catch (err) {
        console.error('❌ فشل بدء الخادم:', err.message);
        process.exit(1);
    }
}

start();
