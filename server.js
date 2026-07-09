require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// ==================== إعدادات Express ====================
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

// ==================== Middleware ====================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                "'unsafe-eval'",
                "https://cdn.jsdelivr.net",
                "https://unpkg.com",
                "https://cdnjs.cloudflare.com"
            ],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://cdn.jsdelivr.net",
                "https://unpkg.com",
                "https://fonts.googleapis.com",
                "https://cdnjs.cloudflare.com"
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",
                "https://cdnjs.cloudflare.com"
            ],
            imgSrc: [
                "'self'",
                "data:",
                "https://unpkg.com",
                "https://cdn.jsdelivr.net",
                "https://*.tile.openstreetmap.org",
                "https://*.basemaps.cartocdn.com"
            ],
            connectSrc: [
                "'self'",
                "https://*.tile.openstreetmap.org",
                "https://*.basemaps.cartocdn.com",
                "https://cdn.jsdelivr.net",
                "https://unpkg.com",
                "https://cdnjs.cloudflare.com"
            ]
        }
    }
}));

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==================== Rate Limiting ====================
app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: '⚠️ تجاوزت الحد المسموح'
}));

// ==================== قاعدة البيانات ====================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/marine_db';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
})
.then(() => {
    console.log('✅ متصل بقاعدة البيانات MongoDB بنجاح!');
    initializeDefaultUsers();
})
.catch(err => {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
});

// ==================== نماذج البيانات ====================
const VesselSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    num: { type: String, trim: true },
    len: { type: Number, default: 0 },
    cat: { type: String, default: 'زوارق مزدوجة' },
    reg: { type: String, trim: true },
    zone: { type: String, trim: true },
    port: { type: String, trim: true },
    supp: { type: String, trim: true },
    stat: { type: String, enum: ['صالح', 'معطب', 'صيانة'], default: 'صالح' },
    break: { type: String, trim: true },
    fDate: { type: String },
    eDate: { type: String },
    ref: { type: String, trim: true }
}, { timestamps: true });

const Vessel = mongoose.model('Vessel', VesselSchema);

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    pass: { type: String, required: true },
    role: { type: String, enum: ['مسؤول', 'محرر', 'مشاهد'], default: 'مشاهد' },
    enabled: { type: Boolean, default: true }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

const ReplySchema = new mongoose.Schema({
    adminName: { type: String, required: true },
    reply: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true }
});

const TicketSchema = new mongoose.Schema({
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    status: { type: String, enum: ['قيد المعالجة', 'تم الرد', 'مغلقة'], default: 'قيد المعالجة' },
    replies: [ReplySchema]
}, { timestamps: true });

const Ticket = mongoose.model('Ticket', TicketSchema);

const LogSchema = new mongoose.Schema({
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    action: { type: String, required: true },
    details: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true }
}, { timestamps: true });

const Log = mongoose.model('Log', LogSchema);

const LocationSchema = new mongoose.Schema({
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
    action: { type: String, default: 'تحديث موقع' }
});

const Location = mongoose.model('Location', LocationSchema);

// ==================== المصادقة ====================
const JWT_SECRET = process.env.JWT_SECRET || 'my_super_secret_key_change_this';

const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'غير مصرح به - الرجاء تسجيل الدخول' });
        }
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user || !user.enabled) {
            return res.status(401).json({ error: 'المستخدم غير موجود أو معطل' });
        }
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'رمز مصادقة غير صالح' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'غير مصرح به - صلاحية غير كافية' });
        }
        next();
    };
};

// ==================== API Routes ====================

// ===== تسجيل الدخول =====
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
        }

        const user = await User.findOne({ name: username });
        
        if (!user || !user.enabled) {
            return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        const isMatch = await bcrypt.compare(password, user.pass);
        
        if (!isMatch) {
            return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        const token = jwt.sign(
            { id: user._id, name: user.name, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            id: user._id,
            name: user.name,
            role: user.role
        });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في السيرفر' });
    }
});

// ===== إنشاء مستخدم admin =====
app.get('/api/create-admin', async (req, res) => {
    try {
        const adminExists = await User.findOne({ name: 'admin' });
        if (adminExists) {
            return res.json({ message: 'المستخدم admin موجود بالفعل', user: adminExists });
        }
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('1234', salt);
        
        const newAdmin = new User({
            name: 'admin',
            pass: hashedPassword,
            role: 'مسؤول',
            enabled: true
        });
        await newAdmin.save();
        res.json({ message: '✅ تم إنشاء المستخدم admin بنجاح!', user: newAdmin });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== المراكب =====
app.get('/api/vessels', authenticate, async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/vessels', authenticate, authorize('مسؤول', 'محرر'), async (req, res) => {
    try {
        const data = req.body;
        const n = parseFloat(data.len);
        if (n === 11) data.cat = 'البروق';
        else if (n >= 8 && n <= 12) data.cat = 'صقور';
        else if (n > 12 && n <= 25) data.cat = 'خوافر';
        else if (n > 30) data.cat = 'طوافات';
        else data.cat = 'زوارق مزدوجة';
        
        const vessel = new Vessel(data);
        await vessel.save();
        res.status(201).json(vessel);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put('/api/vessels/:id', authenticate, authorize('مسؤول', 'محرر'), async (req, res) => {
    try {
        const data = req.body;
        const n = parseFloat(data.len);
        if (n === 11) data.cat = 'البروق';
        else if (n >= 8 && n <= 12) data.cat = 'صقور';
        else if (n > 12 && n <= 25) data.cat = 'خوافر';
        else if (n > 30) data.cat = 'طوافات';
        else data.cat = 'زوارق مزدوجة';
        
        const vessel = await Vessel.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
        if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
        res.json(vessel);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/vessels/:id', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndDelete(req.params.id);
        if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
        res.json({ message: 'تم حذف المركب بنجاح' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== المستخدمين =====
app.get('/api/users', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const users = await User.find().select('-pass');
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const { name, pass, role } = req.body;
        const existing = await User.findOne({ name });
        if (existing) return res.status(400).json({ error: 'اسم المستخدم موجود' });
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(pass, salt);
        
        const user = new User({ name, pass: hashedPassword, role, enabled: true });
        await user.save();
        res.status(201).json({ message: 'تم إضافة المستخدم' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put('/api/users/:id', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const { pass, ...updateData } = req.body;
        if (pass) {
            const salt = await bcrypt.genSalt(10);
            updateData.pass = await bcrypt.hash(pass, salt);
        }
        const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
        res.json({ message: 'تم تحديث المستخدم' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/users/:id', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'تم حذف المستخدم' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== التذاكر =====
app.get('/api/tickets', authenticate, async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        res.json(tickets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/tickets', authenticate, async (req, res) => {
    try {
        const ticket = new Ticket(req.body);
        await ticket.save();
        res.status(201).json(ticket);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put('/api/tickets/:id/reply', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
        ticket.replies.push(req.body.reply);
        ticket.status = 'تم الرد';
        await ticket.save();
        res.json(ticket);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put('/api/tickets/:id/close', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
        ticket.status = 'مغلقة';
        await ticket.save();
        res.json(ticket);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ===== السجلات =====
app.get('/api/logs', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const logs = await Log.find().sort({ createdAt: -1 });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/logs', authenticate, async (req, res) => {
    try {
        const log = new Log(req.body);
        await log.save();
        res.status(201).json(log);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ===== المواقع =====
app.get('/api/locations', async (req, res) => {
    try {
        const locations = await Location.find().sort({ timestamp: -1 });
        res.json(locations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/locations', async (req, res) => {
    try {
        const location = new Location(req.body);
        await location.save();
        res.status(201).json(location);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ===== تصدير واستيراد =====
app.get('/api/export-all', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const vessels = await Vessel.find();
        const users = await User.find().select('-pass');
        const tickets = await Ticket.find();
        const logs = await Log.find();
        const locations = await Location.find();
        res.json({ vessels, users, tickets, logs, locations });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/import-all', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const { vessels, users, tickets, logs, locations } = req.body;
        
        if (vessels) await Vessel.deleteMany({});
        if (users) {
            for (const user of users) {
                if (user.pass && !user.pass.startsWith('$2')) {
                    const salt = await bcrypt.genSalt(10);
                    user.pass = await bcrypt.hash(user.pass, salt);
                }
            }
            await User.deleteMany({});
            await User.insertMany(users);
        }
        if (tickets) { await Ticket.deleteMany({}); await Ticket.insertMany(tickets); }
        if (logs) { await Log.deleteMany({}); await Log.insertMany(logs); }
        if (locations) { await Location.deleteMany({}); await Location.insertMany(locations); }
        
        res.json({ message: 'تم استيراد البيانات بنجاح' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== مسار الصحة =====
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// ✅ تقديم الملفات الثابتة - النسخة المُبسطة
// ============================================================
app.use(express.static(path.join(__dirname, 'public')));

// مسار index.html الرئيسي
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// أي مسار آخر يعيد index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== Socket.IO ====================
const connectedUsers = {};

io.on('connection', (socket) => {
    console.log('📡 مستخدم متصل:', socket.id);
    
    socket.on('user-connected', (data) => {
        connectedUsers[socket.id] = {
            userName: data.userName,
            userRole: data.userRole,
            lat: data.lat || 36.8065,
            lng: data.lng || 10.1815,
            socketId: socket.id
        };
        console.log('👥 مستخدم متصل:', data.userName);
        io.emit('user-list', Object.values(connectedUsers));
    });
    
    socket.on('send-location', (data) => {
        if (connectedUsers[socket.id]) {
            connectedUsers[socket.id].lat = data.lat;
            connectedUsers[socket.id].lng = data.lng;
        }
        socket.broadcast.emit('receive-location', data);
    });
    
    socket.on('disconnect', () => {
        const user = connectedUsers[socket.id];
        if (user) {
            console.log('📡 مستخدم غير متصل:', user.userName);
            delete connectedUsers[socket.id];
            io.emit('user-list', Object.values(connectedUsers));
        } else {
            console.log('📡 مستخدم غير متصل:', socket.id);
        }
    });
});

// ==================== إنشاء المستخدم الافتراضي ====================
const initializeDefaultUsers = async () => {
    try {
        const adminExists = await User.findOne({ name: 'admin' });
        if (!adminExists) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('1234', salt);
            await User.create({
                name: 'admin',
                pass: hashedPassword,
                role: 'مسؤول',
                enabled: true
            });
            console.log('✅ تم إنشاء المستخدم الافتراضي: admin / 1234');
        } else {
            console.log('✅ المستخدم admin موجود بالفعل');
        }
    } catch (error) {
        console.error('❌ خطأ في إنشاء المستخدم الافتراضي:', error.message);
    }
};

// ==================== تشغيل السيرفر ====================
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`);
    console.log('========================================');
    console.log('🔐 بيانات تسجيل الدخول:');
    console.log('   📧 admin');
    console.log('   🔑 1234');
    console.log('========================================');
});

process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('🔌 تم إغلاق الاتصال بقاعدة البيانات');
    process.exit(0);
});
