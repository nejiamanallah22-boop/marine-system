require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== متغيرات البيئة ====================
const MONGO_URI = process.env.MONGO_URI;
const SESSION_SECRET = process.env.SESSION_SECRET || 'marine_secret_2026';

if (!MONGO_URI) {
    console.error('❌ MONGO_URI مطلوب. يرجى إضافته في متغيرات البيئة');
    process.exit(1);
}

// ==================== الاتصال بـ MongoDB ====================
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ متصل بـ MongoDB'))
    .catch(err => console.error('❌ فشل الاتصال بـ MongoDB:', err.message));

// ==================== نماذج MongoDB ====================
const userSchema = new mongoose.Schema({
    name: { type: String, unique: true, required: true },
    pass: { type: String, required: true },
    role: { type: String, default: 'مشاهد' },
    enabled: { type: Boolean, default: true },
    isMainAdmin: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const vesselSchema = new mongoose.Schema({
    name: String, num: String, len: Number, reg: String, zone: String,
    port: String, supp: String, stat: String, break: String,
    fDate: String, eDate: String, ref: String, cat: String,
    createdAt: { type: Date, default: Date.now }
});

const ticketSchema = new mongoose.Schema({
    userName: String, userRole: String, subject: String, message: String,
    date: String, time: String, status: String, replies: Array,
    createdAt: { type: Date, default: Date.now }
});

const sessionSchema = new mongoose.Schema({
    username: String, role: String, ip: String,
    lat: Number, lon: Number, userAgent: String,
    loginTime: { type: Date, default: Date.now },
    sessionId: String
});

const User = mongoose.model('User', userSchema);
const Vessel = mongoose.model('Vessel', vesselSchema);
const Ticket = mongoose.model('Ticket', ticketSchema);
const UserSession = mongoose.model('UserSession', sessionSchema);

// ==================== Middleware ====================
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use(cookieParser());

const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use('/api/', apiLimiter);

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000, httpOnly: true, secure: false, sameSite: 'lax' }
}));

// ==================== Async Handler ====================
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1';
}

function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    next();
}

function requireEditor(req, res, next) {
    const allowed = ['مسؤول', 'محرر'];
    if (!req.session.userId || !allowed.includes(req.session.userRole)) return res.status(403).json({ error: 'غير مصرح' });
    next();
}

// ==================== تهيئة المستخدمين الافتراضيين (مع التأكيد) ====================
async function initializeUsers() {
    try {
        // التحقق من وجود المستخدم admin
        let adminExists = await User.findOne({ name: 'admin' });
        
        if (!adminExists) {
            const hashedPass = await bcrypt.hash('1234', 10);
            
            // إنشاء admin
            await User.create({ 
                name: 'admin', 
                pass: hashedPass, 
                role: 'مسؤول', 
                enabled: true, 
                isMainAdmin: true 
            });
            
            // إنشاء editor
            await User.create({ 
                name: 'editor', 
                pass: hashedPass, 
                role: 'محرر', 
                enabled: true 
            });
            
            // إنشاء viewer
            await User.create({ 
                name: 'viewer', 
                pass: hashedPass, 
                role: 'مشاهد', 
                enabled: true 
            });
            
            console.log('✅ تم إنشاء المستخدمين: admin, editor, viewer (كلمة المرور: 1234)');
        } else {
            console.log('✅ المستخدمين موجودين بالفعل');
            
            // التأكد من أن كلمة مرور admin صحيحة (في حالة تغيرها)
            const adminUser = await User.findOne({ name: 'admin' });
            const isValid = await bcrypt.compare('1234', adminUser.pass);
            if (!isValid) {
                // إعادة تعيين كلمة المرور إلى 1234
                const newHashedPass = await bcrypt.hash('1234', 10);
                await User.updateOne({ name: 'admin' }, { pass: newHashedPass });
                await User.updateOne({ name: 'editor' }, { pass: newHashedPass });
                await User.updateOne({ name: 'viewer' }, { pass: newHashedPass });
                console.log('✅ تم إعادة تعيين كلمات المرور إلى 1234');
            }
        }
        
        // عرض عدد المستخدمين في قاعدة البيانات
        const userCount = await User.countDocuments();
        console.log(`📊 عدد المستخدمين في قاعدة البيانات: ${userCount}`);
        
    } catch (err) {
        console.error('❌ خطأ في إنشاء المستخدمين:', err.message);
    }
}

// ==================== تسجيل الدخول ====================
app.post('/api/login', [
    body('name').trim().isLength({ min: 3, max: 30 }),
    body('pass').isLength({ min: 4, max: 100 })
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'بيانات غير صالحة' });
    
    const { name, pass, location } = req.body;
    console.log(`📝 محاولة دخول: ${name}`);
    
    const user = await User.findOne({ name: String(name).trim() });
    
    if (!user) {
        console.log(`❌ المستخدم ${name} غير موجود`);
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    if (!user.enabled) {
        console.log(`❌ المستخدم ${name} معطل`);
        return res.status(401).json({ error: 'هذا الحساب معطل' });
    }
    
    const isValid = await bcrypt.compare(pass, user.pass);
    if (!isValid) {
        console.log(`❌ كلمة مرور غير صحيحة لـ ${name}`);
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    await new Promise((resolve, reject) => {
        req.session.regenerate(err => { if (err) reject(err); else resolve(); });
    });
    
    req.session.userId = user._id.toString();
    req.session.userName = user.name;
    req.session.userRole = user.role;
    
    let lat = 36.8065, lon = 10.1815;
    if (location?.lat && typeof location.lat === 'number') lat = Math.min(Math.max(location.lat, -90), 90);
    if (location?.lon && typeof location.lon === 'number') lon = Math.min(Math.max(location.lon, -180), 180);
    
    await UserSession.create({
        username: user.name, role: user.role, ip: getClientIp(req), lat, lon,
        userAgent: req.headers['user-agent'], sessionId: req.sessionID
    });
    
    console.log(`✅ دخول ناجح: ${user.name} (${user.role})`);
    res.json({ success: true, name: user.name, role: user.role, location: { lat, lon } });
}));

app.post('/api/logout', requireAuth, (req, res) => {
    req.session.destroy(() => { res.clearCookie('connect.sid'); res.json({ success: true }); });
});

// ==================== المراكب ====================
app.get('/api/vessels', requireAuth, asyncHandler(async (req, res) => {
    const vessels = await Vessel.find().sort({ createdAt: -1 });
    res.json(vessels);
}));

app.post('/api/vessels', requireEditor, [
    body('name').trim().isLength({ min: 2, max: 100 }),
    body('num').trim().isLength({ min: 1, max: 50 })
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'بيانات غير صالحة' });
    
    const vessel = await Vessel.create({
        name: String(req.body.name || '').substring(0, 100),
        num: String(req.body.num || '').substring(0, 50),
        len: Math.min(Math.max(parseFloat(req.body.len) || 0, 0), 100),
        reg: String(req.body.reg || '').substring(0, 50),
        zone: String(req.body.zone || '').substring(0, 50),
        port: String(req.body.port || '').substring(0, 50),
        supp: String(req.body.supp || '').substring(0, 100),
        stat: req.body.stat === 'معطب' || req.body.stat === 'صيانة' ? req.body.stat : 'صالح',
        break: String(req.body.break || '').substring(0, 200),
        fDate: req.body.fDate || '',
        eDate: req.body.eDate || '',
        ref: String(req.body.ref || '').substring(0, 50),
        cat: String(req.body.cat || 'زوارق مزدوجة').substring(0, 50)
    });
    res.json({ success: true, vessel });
}));

app.put('/api/vessels/:id', requireEditor, asyncHandler(async (req, res) => {
    await Vessel.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true });
}));

app.delete('/api/vessels/:id', requireAdmin, asyncHandler(async (req, res) => {
    await Vessel.findByIdAndDelete(req.params.id);
    res.json({ success: true });
}));

// ==================== جلسات المستخدمين ====================
app.get('/api/sessions', requireAuth, asyncHandler(async (req, res) => {
    const sessions = await UserSession.find({ username: req.session.userName }).sort({ loginTime: -1 });
    res.json(sessions);
}));

app.get('/api/sessions/map', requireAdmin, asyncHandler(async (req, res) => {
    const sessions = await UserSession.find().sort({ loginTime: -1 });
    res.json(sessions);
}));

// ==================== التذاكر ====================
app.get('/api/tickets', requireAuth, asyncHandler(async (req, res) => {
    const tickets = await Ticket.find().sort({ createdAt: -1 });
    res.json(tickets);
}));

app.post('/api/tickets', requireAuth, [
    body('subject').trim().isLength({ min: 3, max: 200 }),
    body('message').trim().isLength({ min: 5, max: 2000 })
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'بيانات غير صالحة' });
    
    const ticket = await Ticket.create({
        userName: req.session.userName, userRole: req.session.userRole,
        subject: String(req.body.subject).substring(0, 200),
        message: String(req.body.message).substring(0, 2000),
        date: new Date().toLocaleDateString('ar-TN'),
        time: new Date().toLocaleTimeString('ar-TN'),
        status: 'قيد المعالجة', replies: []
    });
    res.json({ success: true, ticket });
}));

app.put('/api/tickets/:id/reply', requireAdmin, asyncHandler(async (req, res) => {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'غير موجود' });
    if (!ticket.replies) ticket.replies = [];
    ticket.replies.push({
        adminName: req.session.userName,
        reply: String(req.body.reply || '').substring(0, 1000),
        date: new Date().toLocaleDateString('ar-TN'),
        time: new Date().toLocaleTimeString('ar-TN')
    });
    ticket.status = 'تم الرد';
    await ticket.save();
    res.json({ success: true });
}));

app.put('/api/tickets/:id/close', requireAdmin, asyncHandler(async (req, res) => {
    await Ticket.findByIdAndUpdate(req.params.id, { status: 'مغلقة' });
    res.json({ success: true });
}));

// ==================== المستخدمين ====================
app.get('/api/users', requireAdmin, asyncHandler(async (req, res) => {
    const users = await User.find().select('-pass');
    res.json(users);
}));

app.post('/api/users', requireAdmin, [
    body('name').trim().isLength({ min: 3, max: 30 }),
    body('pass').isLength({ min: 4, max: 100 })
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'بيانات غير صالحة' });
    
    const { name, pass, role, enabled } = req.body;
    if (await User.findOne({ name })) return res.status(400).json({ error: 'الاسم موجود' });
    
    const user = await User.create({
        name: String(name).trim().substring(0, 30),
        pass: await bcrypt.hash(pass, 10),
        role: role || 'مشاهد', enabled: enabled !== false
    });
    res.json({ success: true, user: { id: user._id, name: user.name, role: user.role, enabled: user.enabled } });
}));

app.put('/api/users/:id', requireAdmin, asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'غير موجود' });
    if (user.isMainAdmin && req.body.name && req.body.name !== 'admin') {
        return res.status(403).json({ error: 'لا يمكن تغيير اسم المسؤول الرئيسي' });
    }
    if (req.body.pass) req.body.pass = await bcrypt.hash(req.body.pass, 10);
    await User.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true });
}));

app.delete('/api/users/:id', requireAdmin, asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'غير موجود' });
    if (user.isMainAdmin) return res.status(403).json({ error: 'لا يمكن حذف المسؤول الرئيسي' });
    if (req.session.userId === req.params.id) return res.status(403).json({ error: 'لا يمكن حذف حسابك الحالي' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
}));

// ==================== سجل النشاطات ====================
app.get('/api/logs', requireAdmin, asyncHandler(async (req, res) => {
    res.json([]);
}));

app.post('/api/logs', requireAuth, (req, res) => res.json({ success: true }));

// ==================== تصدير واستيراد ====================
app.get('/api/export-all', requireAdmin, asyncHandler(async (req, res) => {
    const vessels = await Vessel.find();
    const tickets = await Ticket.find();
    const sessions = await UserSession.find().limit(500);
    res.json({ vessels, tickets, sessions });
}));

app.post('/api/import-all', requireAdmin, asyncHandler(async (req, res) => {
    if (req.body.vessels && Array.isArray(req.body.vessels)) {
        await Vessel.deleteMany({});
        await Vessel.insertMany(req.body.vessels);
    }
    if (req.body.tickets && Array.isArray(req.body.tickets)) {
        await Ticket.deleteMany({});
        await Ticket.insertMany(req.body.tickets);
    }
    res.json({ success: true });
}));

app.get('/api/test', (req, res) => res.json({ status: 'OK' }));

// ==================== معالج الأخطاء ====================
app.use((err, req, res, next) => {
    console.error('❌ خطأ:', err.message);
    res.status(500).json({ error: 'خطأ داخلي في السيرفر' });
});

// ==================== تشغيل السيرفر ====================
initializeUsers().then(() => {
    app.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════════════╗
║     🚀 السيرفر يعمل بنجاح! 🚀                              ║
╚════════════════════════════════════════════════════════════╝

📡 http://localhost:${PORT}

🔐 بيانات الدخول:
   👑 admin / 1234 (مسؤول)
   ✏️ editor / 1234 (محرر)
   👁️ viewer / 1234 (مشاهد)

✅ النظام جاهز للاستخدام!
`);
    });
});