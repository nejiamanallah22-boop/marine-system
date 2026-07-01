// server.js
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// ==================== الاتصال بقاعدة البيانات ====================
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://marineUser:marineUser@cluster0.ajb5w1z.mongodb.net/marine_fleet?retryWrites=true&w=majority';

console.log('📡 محاولة الاتصال بقاعدة البيانات...');
console.log('🔗 الرابط:', MONGO_URI.replace(/\/\/.*@/, '//****:****@')); // إخفاء كلمة المرور

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
})
.then(() => {
    console.log('✅ متصل بـ MongoDB بنجاح');
    console.log('📊 قاعدة البيانات:', mongoose.connection.db.databaseName);
})
.catch(err => {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
    console.log('💡 تأكد من:');
    console.log('   1. صحة اسم المستخدم وكلمة المرور');
    console.log('   2. إضافة 0.0.0.0/0 في Network Access في MongoDB Atlas');
    console.log('   3. أن الرابط صحيح');
});

// ==================== Middleware ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// إدارة الجلسات
app.use(session({
    secret: process.env.SESSION_SECRET || 'marine_system_secret_key_2025',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 3600000,
        secure: process.env.NODE_ENV === 'production'
    }
}));

// ==================== نماذج قاعدة البيانات ====================

// نموذج المستخدم
const userSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: [true, 'اسم المستخدم مطلوب'],
        unique: true,
        trim: true
    },
    pass: { 
        type: String, 
        required: [true, 'كلمة المرور مطلوبة']
    },
    role: { 
        type: String, 
        enum: ['مسؤول', 'محرر', 'مشاهد'], 
        default: 'مشاهد' 
    },
    enabled: { 
        type: Boolean, 
        default: true 
    }
}, { timestamps: true });

// نموذج المركب
const vesselSchema = new mongoose.Schema({
    name: { type: String, required: true },
    num: String,
    len: Number,
    reg: String,
    zone: String,
    port: String,
    supp: String,
    stat: { type: String, default: 'صالح' },
    break: String,
    fDate: Date,
    eDate: Date,
    ref: String,
    cat: String
}, { timestamps: true });

// نموذج تذكرة الدعم
const ticketSchema = new mongoose.Schema({
    userName: String,
    userRole: String,
    subject: String,
    message: String,
    date: String,
    time: String,
    status: { type: String, default: 'قيد المعالجة' },
    replies: [{
        adminName: String,
        reply: String,
        date: String,
        time: String
    }]
}, { timestamps: true });

// نموذج سجل النشاطات
const logSchema = new mongoose.Schema({
    userName: String,
    userRole: String,
    action: String,
    details: String,
    date: String,
    time: String
}, { timestamps: true });

// نموذج مواقع GPS
const locationSchema = new mongoose.Schema({
    userName: { type: String, required: true },
    userRole: String,
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

// ==================== إنشاء النماذج ====================
let User, Vessel, Ticket, Log, Location;

try {
    User = mongoose.model('User');
} catch (error) {
    User = mongoose.model('User', userSchema);
}

try {
    Vessel = mongoose.model('Vessel');
} catch (error) {
    Vessel = mongoose.model('Vessel', vesselSchema);
}

try {
    Ticket = mongoose.model('Ticket');
} catch (error) {
    Ticket = mongoose.model('Ticket', ticketSchema);
}

try {
    Log = mongoose.model('Log');
} catch (error) {
    Log = mongoose.model('Log', logSchema);
}

try {
    Location = mongoose.model('Location');
} catch (error) {
    Location = mongoose.model('Location', locationSchema);
}

// ==================== دوال المساعدة ====================
function isAuthenticated(req, res, next) {
    if (req.session.userId) return next();
    res.status(401).json({ error: 'غير مصرح، يرجى تسجيل الدخول' });
}

function hasRole(roles) {
    return (req, res, next) => {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'غير مصرح، يرجى تسجيل الدخول' });
        }
        if (roles.includes(req.session.userRole)) return next();
        res.status(403).json({ error: 'ليس لديك صلاحية لهذه العملية' });
    };
}

function getCurrentDate() {
    const now = new Date();
    return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
}

function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

// ==================== مسارات API ====================

// ✅ مسار تسجيل الدخول - مع تصحيح الأخطاء
app.post('/api/login', async (req, res) => {
    console.log('📝 محاولة تسجيل دخول');
    console.log('📦 البيانات المستلمة:', req.body);
    
    try {
        const { name, pass } = req.body;
        
        // تحقق من وجود البيانات
        if (!name || !pass) {
            console.log('❌ البيانات ناقصة');
            return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
        }
        
        // تحقق من الاتصال بقاعدة البيانات
        if (mongoose.connection.readyState !== 1) {
            console.log('❌ قاعدة البيانات غير متصلة');
            console.log('📊 حالة الاتصال:', mongoose.connection.readyState);
            return res.status(500).json({ error: 'قاعدة البيانات غير متصلة' });
        }
        
        console.log('🔍 البحث عن المستخدم:', name);
        
        // البحث عن المستخدم
        const user = await User.findOne({ name, pass, enabled: true });
        
        if (!user) {
            console.log('❌ مستخدم غير موجود أو كلمة مرور خاطئة');
            return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
        
        // حفظ الجلسة
        req.session.userId = user._id;
        req.session.userRole = user.role;
        req.session.userName = user.name;
        
        console.log('✅ تسجيل دخول ناجح:', name);
        console.log('👤 الدور:', user.role);
        console.log('🆔 المعرف:', user._id);
        
        res.json({ 
            id: user._id, 
            name: user.name, 
            role: user.role 
        });
        
    } catch (error) {
        console.error('❌ خطأ في تسجيل الدخول:', error);
        console.error('📝 تفاصيل الخطأ:', error.message);
        console.error('📚 Stack Trace:', error.stack);
        
        res.status(500).json({ 
            error: 'خطأ داخلي في السيرفر',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// مسار تسجيل الخروج
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// مسار التحقق من الجلسة
app.get('/api/check-session', (req, res) => {
    if (req.session.userId) {
        res.json({ 
            loggedIn: true, 
            user: { 
                name: req.session.userName, 
                role: req.session.userRole 
            } 
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// ==================== مسارات المراكب ====================

app.get('/api/vessels', isAuthenticated, async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json(vessels);
    } catch (err) {
        console.error('❌ خطأ في جلب المراكب:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/vessels', isAuthenticated, hasRole(['مسؤول', 'محرر']), async (req, res) => {
    try {
        const vessel = new Vessel(req.body);
        await vessel.save();
        console.log('✅ تم إضافة مركب جديد:', vessel.name);
        res.status(201).json(vessel);
    } catch (err) {
        console.error('❌ خطأ في إضافة مركب:', err);
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/vessels/:id', isAuthenticated, hasRole(['مسؤول', 'محرر']), async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
        res.json(vessel);
    } catch (err) {
        console.error('❌ خطأ في تحديث مركب:', err);
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/vessels/:id', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndDelete(req.params.id);
        if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
        res.json({ success: true });
    } catch (err) {
        console.error('❌ خطأ في حذف مركب:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== مسارات المستخدمين ====================

app.get('/api/users', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const users = await User.find().select('-pass');
        res.json(users);
    } catch (err) {
        console.error('❌ خطأ في جلب المستخدمين:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const { name, pass, role } = req.body;
        const existing = await User.findOne({ name });
        if (existing) return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
        
        const user = new User({ name, pass, role, enabled: true });
        await user.save();
        res.status(201).json({ id: user._id, name, role });
    } catch (err) {
        console.error('❌ خطأ في إضافة مستخدم:', err);
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/users/:id', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-pass');
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
        res.json(user);
    } catch (err) {
        console.error('❌ خطأ في تحديث مستخدم:', err);
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/users/:id', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
        res.json({ success: true });
    } catch (err) {
        console.error('❌ خطأ في حذف مستخدم:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== مسارات التذاكر ====================

app.get('/api/tickets', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        res.json(tickets);
    } catch (err) {
        console.error('❌ خطأ في جلب التذاكر:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tickets', isAuthenticated, async (req, res) => {
    try {
        const ticket = new Ticket(req.body);
        await ticket.save();
        res.status(201).json(ticket);
    } catch (err) {
        console.error('❌ خطأ في إضافة تذكرة:', err);
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/tickets/:id/reply', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
        
        ticket.replies.push(req.body.reply);
        ticket.status = 'تم الرد';
        await ticket.save();
        res.json(ticket);
    } catch (err) {
        console.error('❌ خطأ في الرد على تذكرة:', err);
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/tickets/:id/close', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
        
        ticket.status = 'مغلقة';
        await ticket.save();
        res.json(ticket);
    } catch (err) {
        console.error('❌ خطأ في إغلاق تذكرة:', err);
        res.status(400).json({ error: err.message });
    }
});

// ==================== مسارات سجل النشاطات ====================

app.get('/api/logs', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const logs = await Log.find().sort({ createdAt: -1 });
        res.json(logs);
    } catch (err) {
        console.error('❌ خطأ في جلب السجلات:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/logs', isAuthenticated, async (req, res) => {
    try {
        const log = new Log(req.body);
        await log.save();
        res.status(201).json(log);
    } catch (err) {
        console.error('❌ خطأ في إضافة سجل:', err);
        res.status(400).json({ error: err.message });
    }
});

// ==================== مسارات GPS ====================

app.post('/api/locations', isAuthenticated, async (req, res) => {
    try {
        const { lat, lng } = req.body;
        const location = new Location({
            userName: req.session.userName,
            userRole: req.session.userRole,
            lat: lat,
            lng: lng,
            timestamp: new Date()
        });
        await location.save();
        res.status(201).json(location);
    } catch (err) {
        console.error('❌ خطأ في حفظ موقع:', err);
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/locations', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const locations = await Location.find().sort({ timestamp: -1 });
        res.json(locations);
    } catch (err) {
        console.error('❌ خطأ في جلب المواقع:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== مسارات التصدير والاستيراد ====================

app.get('/api/export-all', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const vessels = await Vessel.find();
        const users = await User.find().select('-pass');
        const tickets = await Ticket.find();
        const logs = await Log.find();
        const locations = await Location.find();
        res.json({ vessels, users, tickets, logs, locations });
    } catch (err) {
        console.error('❌ خطأ في التصدير:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/import-all', isAuthenticated, hasRole(['مسؤول']), async (req, res) => {
    try {
        const { vessels, users, tickets, logs, locations } = req.body;
        if (vessels && vessels.length > 0) await Vessel.insertMany(vessels);
        if (users && users.length > 0) await User.insertMany(users);
        if (tickets && tickets.length > 0) await Ticket.insertMany(tickets);
        if (logs && logs.length > 0) await Log.insertMany(logs);
        if (locations && locations.length > 0) await Location.insertMany(locations);
        res.json({ success: true, message: 'تم استيراد البيانات بنجاح' });
    } catch (err) {
        console.error('❌ خطأ في الاستيراد:', err);
        res.status(400).json({ error: err.message });
    }
});

// ==================== Socket.IO ====================

io.on('connection', (socket) => {
    console.log('📡 مستخدم متصل:', socket.id);
    
    socket.on('send-location', async (data) => {
        console.log('📍 موقع مستلم من:', data.userName);
        
        try {
            const location = new Location({
                userName: data.userName,
                userRole: data.userRole || 'مستخدم',
                lat: data.lat,
                lng: data.lng,
                timestamp: new Date()
            });
            await location.save();
        } catch (err) {
            console.error('❌ خطأ في حفظ الموقع:', err);
        }
        
        socket.broadcast.emit('receive-location', {
            userName: data.userName,
            lat: data.lat,
            lng: data.lng,
            time: new Date().toISOString()
        });
    });
    
    socket.on('disconnect', () => {
        console.log('📡 مستخدم غير متصل:', socket.id);
    });
});

// ==================== الملفات الثابتة ====================

// خدمة الملفات الثابتة من مجلد public
app.use(express.static(path.join(__dirname, 'public')));

// مسار الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== إنشاء مستخدم admin ====================
(async () => {
    try {
        // انتظر حتى يتصل mongoose
        const maxAttempts = 10;
        let attempts = 0;
        
        while (mongoose.connection.readyState !== 1 && attempts < maxAttempts) {
            console.log(`⏳ انتظار الاتصال بقاعدة البيانات... (${attempts + 1}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }
        
        if (mongoose.connection.readyState === 1) {
            console.log('✅ قاعدة البيانات جاهزة، جاري إنشاء المستخدم admin...');
            
            const adminExists = await User.findOne({ name: 'admin' });
            if (!adminExists) {
                await User.create({
                    name: 'admin',
                    pass: '1234',
                    role: 'مسؤول',
                    enabled: true
                });
                console.log('✅ تم إنشاء مستخدم admin افتراضي (admin / 1234)');
            } else {
                console.log('✅ مستخدم admin موجود بالفعل');
            }
        } else {
            console.log('⚠️ لم يتم إنشاء المستخدم admin بسبب عدم الاتصال بقاعدة البيانات');
        }
    } catch (err) {
        console.error('❌ خطأ في إنشاء المستخدم:', err.message);
    }
})();

// ==================== تشغيل الخادم ====================
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 ========================================`);
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`🚀 ========================================`);
    console.log(`🔐 تسجيل الدخول:`);
    console.log(`   📧 admin`);
    console.log(`   🔑 1234`);
    console.log(`========================================\n`);
});

// ==================== التعامل مع الأخطاء غير المتوقعة ====================
process.on('uncaughtException', (err) => {
    console.error('❌ خطأ غير متوقع:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('❌ وعد مرفوض غير معالج:', err);
});
