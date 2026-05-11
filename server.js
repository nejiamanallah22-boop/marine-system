const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();

// CORS مفتوح لتجربة الاختبار (يمكن تقييده لاحقاً)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static('public'));
app.set('trust proxy', 1);

// فحص المتغيرات البيئية
if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
    console.error('❌ تأكد من تعيين MONGO_URI و JWT_SECRET في Render');
    process.exit(1);
}
console.log('✅ البيئة جاهزة');

// ======================== نماذج البيانات ========================
const vesselSchema = new mongoose.Schema({
    name: { type: String, required: true, index: true },
    num: String,
    len: { type: Number, required: true, min: 0 },
    reg: String,
    zone: String,
    port: String,
    supp: String,
    stat: { type: String, default: 'صالح' },
    break: String,
    fDate: String,
    eDate: String,
    ref: String,
    cat: String
}, { timestamps: true });
const Vessel = mongoose.model('Vessel', vesselSchema);

const userSchema = new mongoose.Schema({
    name: { type: String, unique: true, required: true },
    pass: String,
    role: { type: String, default: 'مشاهد' },
    enabled: { type: Boolean, default: true }
});
const User = mongoose.model('User', userSchema);

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

async function addLog(userName, action, details) {
    // يمكنك تفعيل السجلات لاحقاً
    console.log(`📝 سجل: ${userName} - ${action} - ${details}`);
}

// ======================== وسائط المصادقة ========================
function auth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'لا يوجد رمز' });
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    token = token.trim();
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        res.status(401).json({ error: 'رمز غير صالح' });
    }
}

// ======================== API Routes ========================
app.get('/', (req, res) => res.send('✅ Marine API active'));
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
        res.json({ token, user: { name: user.name, role: user.role } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ** نقطة النهاية الأساسية: جلب جميع السفن **
app.get('/api/vessels', auth, async (req, res) => {
    try {
        const vessels = await Vessel.find().lean().sort({ _id: -1 }).limit(500);
        console.log(`📊 المستخدم ${req.user.name} طلب السفن - العدد: ${vessels.length}`);
        res.json(vessels);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'فشل الجلب' });
    }
});

// ** نقطة نهاية لمعرفة عدد السجلات في قاعدة البيانات (للتشخيص) **
app.get('/api/count', auth, async (req, res) => {
    const count = await Vessel.countDocuments();
    res.json({ count, dbName: mongoose.connection.name, user: req.user.name });
});

// إضافة سفينة جديدة
app.post('/api/vessels', auth, async (req, res) => {
    try {
        const { name, len } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'الاسم مطلوب' });
        const lenNum = parseFloat(len);
        if (isNaN(lenNum) || lenNum < 0) return res.status(400).json({ error: 'طول غير صالح' });
        const newVessel = {
            name: name.trim(),
            len: lenNum,
            cat: getCategory(lenNum),
            ...req.body
        };
        const vessel = await Vessel.create(newVessel);
        console.log(`➕ ${req.user.name} أضاف سفينة: ${vessel.name}`);
        res.status(201).json(vessel);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'فشل الإضافة' });
    }
});

// باقي المسارات (تحديث، حذف، تذاكر، مستخدمين) مشابهة للكود السابق... 
// (أضفها بنفسك أو استخدم الكود الكامل الموجود في الرد السابق)
// ...

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ======================== إنشاء مستخدم افتراضي ========================
async function createDefaultUser() {
    const existing = await User.findOne({ name: 'admin' });
    if (!existing) {
        const hashed = bcrypt.hashSync('admin123', 10);
        await User.create({ name: 'admin', pass: hashed, role: 'مدير', enabled: true });
        console.log('✅ admin/admin123');
    }
}

// ======================== تشغيل الخادم ========================
const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 })
    .then(async () => {
        console.log('✅ MongoDB متصل');
        await createDefaultUser();
        app.listen(PORT, () => console.log(`🚀 على port ${PORT}`));
    })
    .catch(err => console.error('❌ فشل الاتصال:', err));
