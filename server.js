const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

dotenv.config();

const app = express();
const server = http.createServer(app);

// ============================================================
// ✅ حل مشكلة CSS
// ============================================================
app.use((req, res, next) => {
    if (req.url.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
    } else if (req.url.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
    } else if (req.url.endsWith('.json')) {
        res.setHeader('Content-Type', 'application/json');
    } else if (req.url.endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
    } else if (req.url.endsWith('.jpg') || req.url.endsWith('.jpeg')) {
        res.setHeader('Content-Type', 'image/jpeg');
    } else if (req.url.endsWith('.svg')) {
        res.setHeader('Content-Type', 'image/svg+xml');
    } else if (req.url.endsWith('.ico')) {
        res.setHeader('Content-Type', 'image/x-icon');
    } else if (req.url.endsWith('.map')) {
        res.setHeader('Content-Type', 'application/json');
    }
    next();
});

app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ✅ خدمة الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (filePath.endsWith('.map')) {
            res.setHeader('Content-Type', 'application/json');
        }
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
}));

// ============================================================
// 🗄️ قاعدة البيانات
// ============================================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vessel_db';
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-key';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.log('❌ MongoDB Error:', err.message));

// ============================================================
// 📊 النماذج
// ============================================================

// ✅ نموذج المستخدم
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['مسؤول', 'محرر', 'مشاهد'], default: 'مشاهد' },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

// ✅ تشفير كلمة المرور قبل الحفظ
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// ✅ نموذج المراكب
const VesselSchema = new mongoose.Schema({
    name: { type: String, required: true },
    num: { type: String },
    len: { type: Number, default: 0 },
    cat: { type: String, default: 'زوارق مزدوجة' },
    reg: { type: String },
    zone: { type: String },
    port: { type: String },
    supp: { type: String },
    stat: { type: String, enum: ['صالح', 'معطب', 'صيانة'], default: 'صالح' },
    break: { type: String },
    fDate: { type: String },
    eDate: { type: String },
    ref: { type: String },
    repairer: { type: String, default: '' }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Vessel = mongoose.model('Vessel', VesselSchema);

// ============================================================
// 🛠️ دوال مساعدة
// ============================================================
function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

function getCurrentDate() {
    return new Date().toISOString().split('T')[0];
}

function getWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function determineCategory(length) {
    const n = parseFloat(length);
    if (isNaN(n)) return 'زوارق مزدوجة';
    if (n === 11) return 'البروق';
    if (n >= 8 && n <= 12) return 'صقور';
    if (n > 12 && n <= 25) return 'خوافر';
    if (n > 30) return 'طوافات';
    return 'زوارق مزدوجة';
}

// ============================================================
// 🔐 Middleware المصادقة
// ============================================================
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'يرجى تسجيل الدخول' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود' });
        }

        if (!user.isActive) {
            return res.status(403).json({ success: false, error: 'الحساب غير مفعل' });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, error: 'انتهت صلاحية الجلسة' });
        }
        res.status(401).json({ success: false, error: 'توكن غير صالح' });
    }
};

const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'يرجى تسجيل الدخول' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'غير مصرح لك بهذه العملية' });
        }
        next();
    };
};

// ============================================================
// 📡 Socket.IO
// ============================================================
const io = socketIO(server, {
    cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

const connectedUsers = {};

io.on('connection', (socket) => {
    console.log('📡 متصل:', socket.id);
    
    socket.on('user-connected', (data) => {
        if (data && data.lat != null && data.lng != null) {
            connectedUsers[socket.id] = {
                id: socket.id,
                userName: data.userName || 'مجهول',
                userRole: data.userRole || 'مستخدم',
                lat: parseFloat(data.lat),
                lng: parseFloat(data.lng),
                connectedAt: new Date().toISOString()
            };
            io.emit('user-list', Object.values(connectedUsers));
        }
    });
    
    socket.on('update-location', (data) => {
        if (connectedUsers[socket.id] && data && data.lat != null && data.lng != null) {
            connectedUsers[socket.id].lat = parseFloat(data.lat);
            connectedUsers[socket.id].lng = parseFloat(data.lng);
            socket.broadcast.emit('receive-location', {
                userName: data.userName,
                lat: parseFloat(data.lat),
                lng: parseFloat(data.lng),
                time: new Date().toISOString()
            });
        }
    });
    
    socket.on('disconnect', () => {
        const user = connectedUsers[socket.id];
        if (user) {
            delete connectedUsers[socket.id];
            io.emit('user-list', Object.values(connectedUsers));
        }
    });
});

// ============================================================
// 🚪 Routes API
// ============================================================

// ----- المصادقة -----
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
        }

        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
        if (!user) {
            return res.status(401).json({ success: false, error: 'بيانات غير صحيحة' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'بيانات غير صحيحة' });
        }

        const token = jwt.sign(
            { id: user._id, name: user.name, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'خطأ في تسجيل الدخول' });
    }
});

// ----- معلومات المستخدم الحالي -----
app.get('/api/auth/me', authenticate, async (req, res) => {
    res.json({ success: true, user: req.user });
});

// ----- تسجيل مستخدم جديد (من التطبيق) -----
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, error: 'الاسم والبريد الإلكتروني وكلمة المرور مطلوبة' });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'البريد الإلكتروني موجود بالفعل' });
        }

        const user = new User({
            name,
            email: email.toLowerCase(),
            password: password,
            role: role || 'مشاهد'
        });

        await user.save();

        res.status(201).json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ success: false, error: 'خطأ في إنشاء الحساب' });
    }
});

// ============================================================
// 👥 Routes المستخدمين (لوحة التحكم)
// ============================================================

// ✅ جلب جميع المستخدمين
app.get('/api/users', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ إضافة مستخدم جديد (من لوحة التحكم)
app.post('/api/users', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        
        if (!name || !password) {
            return res.status(400).json({ success: false, error: 'الاسم وكلمة المرور مطلوبان' });
        }
        
        // التحقق من وجود المستخدم
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'البريد الإلكتروني موجود بالفعل' });
        }
        
        const user = new User({
            name,
            email: email || name.toLowerCase().replace(/\s/g, '') + '@test.com',
            password: password, // سيتم تشفيرها تلقائياً
            role: role || 'مشاهد',
            isActive: true
        });
        
        await user.save();
        
        res.status(201).json({
            success: true,
            message: 'تم إضافة المستخدم بنجاح',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isActive: user.isActive
            }
        });
    } catch (error) {
        console.error('Add user error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ✅ تحديث مستخدم
app.put('/api/users/:id', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const { name, role, isActive, password } = req.body;
        const userId = req.params.id;
        
        const updateData = {};
        if (name) updateData.name = name;
        if (role) updateData.role = role;
        if (isActive !== undefined) updateData.isActive = isActive;
        
        if (password && password.length >= 6) {
            updateData.password = password; // سيتم تشفيرها تلقائياً
        }
        
        const user = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true, runValidators: true }
        ).select('-password');
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }
        
        res.json({
            success: true,
            message: 'تم تحديث المستخدم بنجاح',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isActive: user.isActive
            }
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ✅ حذف مستخدم
app.delete('/api/users/:id', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const userId = req.params.id;
        
        // منع حذف نفسه
        if (userId === req.user._id.toString()) {
            return res.status(400).json({ success: false, error: 'لا يمكنك حذف حسابك الخاص' });
        }
        
        const user = await User.findByIdAndDelete(userId);
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }
        
        res.json({
            success: true,
            message: 'تم حذف المستخدم بنجاح'
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🚢 المراكب
// ============================================================
app.get('/api/vessels', authenticate, async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/vessels', authenticate, authorize('مسؤول', 'محرر'), async (req, res) => {
    try {
        const data = req.body;
        data.cat = determineCategory(data.len);
        const vessel = new Vessel(data);
        await vessel.save();
        res.status(201).json({ success: true, data: vessel });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.put('/api/vessels/:id', authenticate, authorize('مسؤول', 'محرر'), async (req, res) => {
    try {
        const data = req.body;
        data.cat = determineCategory(data.len);
        const vessel = await Vessel.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
        if (!vessel) return res.status(404).json({ success: false, error: 'المركب غير موجود' });
        res.json({ success: true, data: vessel });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.delete('/api/vessels/:id', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndDelete(req.params.id);
        if (!vessel) return res.status(404).json({ success: false, error: 'المركب غير موجود' });
        res.json({ success: true, message: 'تم حذف المركب بنجاح' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// ❤️ Health Check
// ============================================================
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// ============================================================
// 🏠 الصفحة الرئيسية
// ============================================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// 🔑 إنشاء Admin
// ============================================================
async function createAdmin() {
    try {
        const adminExists = await User.findOne({ role: 'مسؤول' });
        if (!adminExists) {
            const admin = new User({
                name: 'Admin',
                email: 'admin',
                password: '123456',
                role: 'مسؤول',
                isActive: true
            });
            
            await admin.save();
            console.log('✅ تم إنشاء حساب المسؤول');
            console.log('📧 admin');
            console.log('🔑 123456');
        }
    } catch (error) {
        console.log('⚠️ Admin error:', error.message);
    }
}

// ============================================================
// 🚀 تشغيل السيرفر
// ============================================================
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Server: http://localhost:${PORT}`);
    await createAdmin();
    console.log('========================================');
    console.log('📧 admin');
    console.log('🔑 123456');
    console.log('========================================');
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    await mongoose.connection.close();
    process.exit(0);
});
