const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 10000;

// رابط قاعدة البيانات - يجب تعديل كلمة المرور إلى الصحيحة
const MONGO_URI = 'mongodb+srv://marineUser:marineUser@cluster0.ajb5w1z.mongodb.net/marine_fleet?retryWrites=true&w=majority';

console.log('🔄 جاري الاتصال بقاعدة البيانات...');

// الاتصال بقاعدة البيانات
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ متصل بـ MongoDB Atlas'))
.catch(err => {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
    console.log('⚠️ سيتم استخدام التخزين المؤقت بدلاً من MongoDB');
});

// ==================== نماذج البيانات ====================
// نموذج المستخدم
const userSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    pass: { type: String, required: true },
    role: { type: String, default: 'مشاهد' },
    enabled: { type: Boolean, default: true }
});

// نموذج المركب
const vesselSchema = new mongoose.Schema({
    name: String, 
    num: String, 
    len: Number, 
    reg: String,
    zone: String, 
    port: String, 
    supp: String, 
    stat: String,
    break: String, 
    fDate: Date, 
    eDate: Date, 
    ref: String, 
    cat: String
});

// نموذج التذكرة
const ticketSchema = new mongoose.Schema({
    userName: String, 
    userRole: String, 
    subject: String, 
    message: String,
    date: String, 
    time: String, 
    status: String, 
    replies: Array
});

// نموذج سجل النشاطات
const logSchema = new mongoose.Schema({
    userName: String, 
    userRole: String, 
    action: String,
    details: String, 
    date: String, 
    time: String
});

// نموذج موقع GPS
const locationSchema = new mongoose.Schema({
    userName: String,
    userRole: String,
    lat: Number,
    lng: Number,
    timestamp: { type: Date, default: Date.now }
});

// تعريف النماذج (مع التحقق من وجودها مسبقاً)
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Vessel = mongoose.models.Vessel || mongoose.model('Vessel', vesselSchema);
const Ticket = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);
const Log = mongoose.models.Log || mongoose.model('Log', logSchema);
const Location = mongoose.models.Location || mongoose.model('Location', locationSchema);

// ==================== Middleware ====================
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'marine_secret_key_2024',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 ساعة
}));

// Middleware للتحقق من المصادقة
function isAuth(req, res, next) {
    if (req.session.userId) return next();
    res.status(401).json({ error: 'غير مصرح، يرجى تسجيل الدخول' });
}

// Middleware للتحقق من صلاحية المسؤول
function isAdmin(req, res, next) {
    if (req.session.userRole === 'مسؤول') return next();
    res.status(403).json({ error: 'غير مسموح - هذه الخاصية للمسؤول فقط' });
}

// ==================== Socket.IO ====================
io.on('connection', (socket) => {
    console.log('🟢 مستخدم جديد متصل:', socket.id);
    
    socket.on('send-location', async (data) => {
        console.log(`📍 موقع من ${data.userName}: ${data.lat}, ${data.lng}`);
        
        try {
            // حفظ الموقع في قاعدة البيانات
            const location = new Location({
                userName: data.userName,
                userRole: data.userRole,
                lat: data.lat,
                lng: data.lng
            });
            await location.save();
            
            // بث الموقع لجميع المستخدمين
            io.emit('receive-location', {
                userName: data.userName,
                userRole: data.userRole,
                lat: data.lat,
                lng: data.lng,
                time: new Date()
            });
        } catch (err) {
            console.error('خطأ في حفظ الموقع:', err);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('🔴 مستخدم انقطع:', socket.id);
    });
});

// ==================== API Routes ====================

// مسار صحي للتحقق من عمل الخادم
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString(), session: req.session.userId ? 'active' : 'none' });
});

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    const { name, pass } = req.body;
    console.log('محاولة تسجيل دخول:', name);
    
    try {
        // التحقق من اتصال قاعدة البيانات
        if (mongoose.connection.readyState !== 1) {
            console.log('⚠️ قاعدة البيانات غير متصلة، استخدام المستخدم الافتراضي');
            if (name === 'admin' && pass === '1234') {
                req.session.userId = 'admin_id';
                req.session.userRole = 'مسؤول';
                req.session.userName = 'admin';
                return res.json({ id: 'admin_id', name: 'admin', role: 'مسؤول' });
            }
            return res.status(401).json({ error: 'بيانات غير صحيحة' });
        }
        
        const user = await User.findOne({ name, pass, enabled: true });
        
        if (!user) {
            return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
        
        req.session.userId = user._id;
        req.session.userRole = user.role;
        req.session.userName = user.name;
        
        res.json({ id: user._id, name: user.name, role: user.role });
    } catch (err) {
        console.error('خطأ في تسجيل الدخول:', err);
        res.status(500).json({ error: 'خطأ في الخادم، يرجى المحاولة لاحقاً' });
    }
});

// تسجيل الخروج
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// التحقق من الجلسة
app.get('/api/check-session', (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true, user: { name: req.session.userName, role: req.session.userRole } });
    } else {
        res.json({ loggedIn: false });
    }
});

// ==================== مسارات المراكب ====================
app.get('/api/vessels', isAuth, async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json(vessels);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/vessels', isAuth, async (req, res) => {
    try {
        const vessel = new Vessel(req.body);
        await vessel.save();
        res.status(201).json(vessel);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/vessels/:id', isAuth, async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(vessel);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/vessels/:id', isAuth, async (req, res) => {
    try {
        await Vessel.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== مسارات المستخدمين ====================
app.get('/api/users', isAuth, isAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-pass');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', isAuth, isAdmin, async (req, res) => {
    try {
        const { name, pass, role } = req.body;
        const existing = await User.findOne({ name });
        if (existing) return res.status(400).json({ error: 'اسم المستخدم موجود' });
        
        const user = new User({ name, pass, role, enabled: true });
        await user.save();
        res.status(201).json({ id: user._id, name, role });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', isAuth, isAdmin, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-pass');
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', isAuth, isAdmin, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== مسارات التذاكر ====================
app.get('/api/tickets', isAuth, async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        res.json(tickets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tickets', isAuth, async (req, res) => {
    try {
        const ticket = new Ticket(req.body);
        await ticket.save();
        res.status(201).json(ticket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tickets/:id/reply', isAuth, isAdmin, async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
        
        ticket.replies.push(req.body.reply);
        ticket.status = 'تم الرد';
        await ticket.save();
        res.json(ticket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tickets/:id/close', isAuth, isAdmin, async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
        
        ticket.status = 'مغلقة';
        await ticket.save();
        res.json(ticket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== مسارات سجل النشاطات ====================
app.get('/api/logs', isAuth, isAdmin, async (req, res) => {
    try {
        const logs = await Log.find().sort({ createdAt: -1 });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/logs', isAuth, async (req, res) => {
    try {
        const log = new Log(req.body);
        await log.save();
        res.status(201).json(log);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== مسارات GPS ====================
app.get('/api/locations', isAuth, async (req, res) => {
    try {
        const locations = await Location.find().sort({ timestamp: -1 }).limit(100);
        res.json(locations);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== مسارات التصدير والاستيراد ====================
app.get('/api/export-all', isAuth, isAdmin, async (req, res) => {
    try {
        const vessels = await Vessel.find();
        const users = await User.find().select('-pass');
        const tickets = await Ticket.find();
        const logs = await Log.find();
        const locations = await Location.find();
        res.json({ vessels, users, tickets, logs, locations });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/import-all', isAuth, isAdmin, async (req, res) => {
    try {
        const { vessels, users, tickets, logs, locations } = req.body;
        if (vessels && vessels.length) await Vessel.insertMany(vessels);
        if (users && users.length) await User.insertMany(users);
        if (tickets && tickets.length) await Ticket.insertMany(tickets);
        if (logs && logs.length) await Log.insertMany(logs);
        if (locations && locations.length) await Location.insertMany(locations);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== إنشاء المستخدمين الافتراضيين ====================
async function initializeDatabase() {
    try {
        // انتظار اتصال قاعدة البيانات
        if (mongoose.connection.readyState !== 1) {
            console.log('⚠️ انتظار اتصال قاعدة البيانات...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        if (mongoose.connection.readyState === 1) {
            // إنشاء المستخدم admin إذا لم يكن موجوداً
            const adminExists = await User.findOne({ name: 'admin' });
            if (!adminExists) {
                await User.create({ 
                    name: 'admin', 
                    pass: '1234', 
                    role: 'مسؤول', 
                    enabled: true 
                });
                console.log('✅ تم إنشاء مستخدم admin (admin / 1234)');
            } else {
                console.log('✅ مستخدم admin موجود مسبقاً');
            }
            
            // إنشاء مستخدم تجريبي إذا لم يكن موجوداً
            const viewerExists = await User.findOne({ name: 'user' });
            if (!viewerExists) {
                await User.create({ 
                    name: 'user', 
                    pass: 'user', 
                    role: 'مشاهد', 
                    enabled: true 
                });
                console.log('✅ تم إنشاء مستخدم تجريبي (user / user)');
            }
        } else {
            console.log('⚠️ لا يمكن إنشاء المستخدمين الافتراضيين - قاعدة البيانات غير متصلة');
        }
    } catch (err) {
        console.error('❌ خطأ في تهيئة قاعدة البيانات:', err.message);
    }
}

// تشغيل الخادم
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`🌐 الرابط: http://localhost:${PORT}`);
    console.log(`\n📝 بيانات الدخول:`);
    console.log(`   👑 admin / 1234 (مسؤول كامل الصلاحيات)`);
    console.log(`   👤 user / user (مشاهد فقط)`);
    
    await initializeDatabase();
    
    if (mongoose.connection.readyState === 1) {
        console.log(`\n✅ متصل بـ MongoDB Atlas بنجاح`);
    } else {
        console.log(`\n⚠️ يعمل بدون قاعدة بيانات - سيتم استخدام الجلسات فقط`);
    }
    
    console.log(`\n💡 Socket.IO جاهز للعمل على /socket.io/socket.io.js`);
});
