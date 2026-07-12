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
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'",
                "https://cdn.jsdelivr.net", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net",
                "https://unpkg.com", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https://unpkg.com", "https://cdn.jsdelivr.net",
                "https://*.tile.openstreetmap.org", "https://*.basemaps.cartocdn.com"],
            connectSrc: ["'self'", "https://*.tile.openstreetmap.org",
                "https://*.basemaps.cartocdn.com", "https://cdn.jsdelivr.net",
                "https://unpkg.com", "https://cdnjs.cloudflare.com"]
        }
    }
}));

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
.then(() => { console.log('✅ متصل بقاعدة البيانات MongoDB بنجاح!'); initializeDefaultUsers(); })
.catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message));

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

// ==================== المصادقة ====================
const JWT_SECRET = process.env.JWT_SECRET || 'my_super_secret_key_change_this';

const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'غير مصرح به - الرجاء تسجيل الدخول' });
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user || !user.enabled) return res.status(401).json({ error: 'المستخدم غير موجود أو معطل' });
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

// ==================== Routes ====================

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

        res.json({ token, id: user._id, name: user.name, role: user.role });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في السيرفر' });
    }
});

// ===== ✅ إضافة مستخدم جديد (مُصلحة) =====
app.post('/api/users', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const { name, pass, role } = req.body;
        
        // التحقق من الحقول
        if (!name || !pass) {
            return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
        }
        
        if (pass.length < 4) {
            return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
        }
        
        // التحقق من وجود المستخدم
        const existing = await User.findOne({ name });
        if (existing) {
            return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
        }
        
        // تشفير كلمة المرور
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(pass, salt);
        
        // إنشاء المستخدم
        const user = new User({
            name: name,
            pass: hashedPassword,
            role: role || 'مشاهد',
            enabled: true
        });
        
        await user.save();
        
        // إرجاع المستخدم (بدون كلمة المرور)
        const userData = user.toObject();
        delete userData.pass;
        
        res.status(201).json({ 
            message: '✅ تم إضافة المستخدم بنجاح', 
            user: userData 
        });
        
    } catch (error) {
        console.error('❌ خطأ في إضافة المستخدم:', error);
        res.status(500).json({ error: 'خطأ في السيرفر: ' + error.message });
    }
});

// ===== جلب جميع المستخدمين =====
app.get('/api/users', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const users = await User.find().select('-pass');
        res.json(users);
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

// ===== تقديم الملفات الثابتة =====
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== إنشاء المستخدم الافتراضي ====================
const initializeDefaultUsers = async () => {
    try {
        const adminExists = await User.findOne({ name: 'admin' });
        if (!adminExists) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('123456', salt);
            await User.create({
                name: 'admin',
                pass: hashedPassword,
                role: 'مسؤول',
                enabled: true
            });
            console.log('✅ تم إنشاء المستخدم الافتراضي: admin / 123456');
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
    console.log('   🔑 123456');
    console.log('========================================');
});

process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('🔌 تم إغلاق الاتصال بقاعدة البيانات');
    process.exit(0);
});
