// server.js
// ============================================================
// 🚀 MARINE SYSTEM - ENTERPRISE EDITION
// ============================================================

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const helmet = require('helmet');
const compression = require('compression');

// ============================================================
// 🚀 EXPRESS APP
// ============================================================

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// ============================================================
// 🔐 MIDDLEWARE
// ============================================================

app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://yourdomain.com', 'http://localhost:3000', 'http://localhost:3001'] 
        : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
    credentials: true
}));

app.use(helmet({
    contentSecurityPolicy: false // تعطيل CSP للتطوير
}));

app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================================
// 📁 STATIC FILES
// ============================================================

app.use(express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/pages', express.static(path.join(__dirname, 'public/pages')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// ============================================================
// 📁 DATABASE CONNECTION
// ============================================================

console.log('🔄 جاري الاتصال بـ MongoDB...');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/marine_system', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
})
.then(() => {
    console.log('✅ MongoDB connected successfully');
    initDefaultUsers();
})
.catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('⚠️ يرجى التحقق من:');
    console.log('   1. الرابط في ملف .env');
    console.log('   2. اسم المستخدم وكلمة المرور');
    console.log('   3. عنوان IP مسموح به في MongoDB Atlas');
});

// ============================================================
// 📦 MODELS
// ============================================================

// ----- User Model -----
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { 
        type: String, 
        enum: ['مسؤول', 'محرر إقليمي', 'فني صيانة', 'مشاهد'], 
        default: 'مشاهد' 
    },
    region: { 
        type: String, 
        enum: ['الشمال', 'الساحل', 'الوسط', 'الجنوب', ''],
        default: '' 
    },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date }
});

UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

UserSchema.methods.comparePassword = async function(password) {
    return await bcrypt.compare(password, this.password);
};

const User = mongoose.model('User', UserSchema);

// ----- Vessel Model -----
const VesselSchema = new mongoose.Schema({
    name: { type: String, required: true },
    num: { type: String },
    len: { type: Number, default: 0 },
    cat: { type: String, default: 'البروق' },
    reg: { type: String, enum: ['الشمال', 'الساحل', 'الوسط', 'الجنوب'], default: 'الشمال' },
    zone: { type: String },
    port: { type: String },
    supp: { type: String },
    stat: { type: String, enum: ['صالح', 'معطب', 'صيانة'], default: 'صالح' },
    break: { type: String, default: '' },
    fDate: { type: String },
    eDate: { type: String },
    ref: { type: String },
    repairer: { type: String },
    region: { type: String, enum: ['الشمال', 'الساحل', 'الوسط', 'الجنوب'], default: 'الشمال' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

const Vessel = mongoose.model('Vessel', VesselSchema);

// ----- Maintenance Model -----
const MaintenanceSchema = new mongoose.Schema({
    vesselId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel', required: true },
    vesselName: { type: String },
    type: { type: String, enum: ['كبرى', 'دورية', 'عادية', 'طارئة'], default: 'عادية' },
    unit: { type: String },
    technician: { type: String, required: true },
    description: { type: String, required: true },
    repair: { type: String, default: '' },
    faultType: { type: String, default: 'أخرى' },
    cost: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    parts: [{ name: String, quantity: Number, price: Number }],
    status: { type: String, enum: ['قيد الإنجاز', 'مكتملة', 'ملغية'], default: 'قيد الإنجاز' },
    date: { type: String },
    startDate: { type: String },
    endDate: { type: String },
    createdBy: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const Maintenance = mongoose.model('Maintenance', MaintenanceSchema);

// ----- Conversation Model (لـ AI) -----
const ConversationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    title: { type: String, default: 'محادثة جديدة' },
    messageCount: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now }
}, {
    timestamps: { createdAt: 'createdAt' }
});

const Conversation = mongoose.model('Conversation', ConversationSchema);

// ----- Message Model -----
const MessageSchema = new mongoose.Schema({
    conversationId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Conversation' },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', MessageSchema);

// ============================================================
// 🔐 AUTH MIDDLEWARE
// ============================================================

function generateToken(user) {
    return jwt.sign(
        { id: user._id, email: user.email, role: user.role, region: user.region || '' },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // للاختبار: نسمح بالطلب بدون توكن
        req.user = { id: 'demo-user-id', email: 'admin@example.com', role: 'مسؤول', region: '' };
        return next();
    }
    
    const token = authHeader.substring(7);
    
    if (token.startsWith('demo-token-')) {
        req.user = { id: 'demo-user-id', email: 'admin@example.com', role: 'مسؤول', region: '' };
        return next();
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        req.user = { id: 'demo-user-id', email: 'admin@example.com', role: 'مسؤول', region: '' };
        return next();
    }
    
    req.user = decoded;
    next();
}

// ============================================================
// 🔐 PERMISSIONS
// ============================================================

const PERMISSIONS = {
    "مسؤول": { level: 100, viewAll: true, maxMessages: 200 },
    "محرر إقليمي": { level: 80, viewAll: false, maxMessages: 100 },
    "فني صيانة": { level: 50, viewAll: false, maxMessages: 50 },
    "مشاهد": { level: 20, viewAll: false, maxMessages: 20 }
};

function getPermissions(role) {
    return PERMISSIONS[role] || PERMISSIONS["مشاهد"];
}

function hasPermission(req, permission) {
    const perms = getPermissions(req.user?.role);
    return perms[permission] === true;
}

function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: '❌ الرجاء تسجيل الدخول' });
        }
        if (hasPermission(req, permission)) {
            return next();
        }
        return res.status(403).json({ success: false, error: '❌ ليس لديك صلاحية لهذه العملية' });
    };
}

// ============================================================
// 🚀 API ROUTES
// ============================================================

// ----- Auth -----
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ success: false, error: '❌ البريد وكلمة المرور مطلوبة' });
        }
        
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ success: false, error: '❌ بيانات غير صحيحة' });
        }
        
        const isValid = await user.comparePassword(password);
        if (!isValid) {
            return res.status(401).json({ success: false, error: '❌ بيانات غير صحيحة' });
        }
        
        if (!user.isActive) {
            return res.status(401).json({ success: false, error: '❌ الحساب معطل' });
        }
        
        user.lastLogin = new Date();
        await user.save();
        
        const token = generateToken(user);
        const { password: _, ...userWithoutPassword } = user.toObject();
        res.json({ success: true, token, user: userWithoutPassword });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: '❌ خطأ في تسجيل الدخول' });
    }
});

// ----- Users (Admin only) -----
app.get('/api/users', authenticate, requirePermission('manageUsers'), async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: '❌ خطأ في تحميل المستخدمين' });
    }
});

app.post('/api/users', authenticate, requirePermission('manageUsers'), async (req, res) => {
    try {
        const { name, email, password, role, region } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({ success: false, error: '❌ جميع الحقول مطلوبة' });
        }
        
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, error: '❌ البريد الإلكتروني مستخدم' });
        }
        
        const user = new User({ 
            name, 
            email, 
            password, 
            role: role || 'مشاهد',
            region: region || ''
        });
        await user.save();
        
        const { password: _, ...userWithoutPassword } = user.toObject();
        res.json({ success: true, user: userWithoutPassword });
        
    } catch (error) {
        console.error('Add user error:', error);
        res.status(500).json({ success: false, error: '❌ خطأ في إضافة المستخدم' });
    }
});

app.put('/api/users/:id', authenticate, requirePermission('manageUsers'), async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        if (updates.password) {
            const salt = await bcrypt.genSalt(10);
            updates.password = await bcrypt.hash(updates.password, salt);
        }
        
        const user = await User.findByIdAndUpdate(id, updates, { new: true }).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, error: '❌ المستخدم غير موجود' });
        }
        res.json({ success: true, user });
        
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في تحديث المستخدم' });
    }
});

app.delete('/api/users/:id', authenticate, requirePermission('manageUsers'), async (req, res) => {
    try {
        const { id } = req.params;
        
        if (id === req.user.id) {
            return res.status(400).json({ success: false, error: '❌ لا يمكنك حذف حسابك' });
        }
        
        const user = await User.findByIdAndDelete(id);
        if (!user) {
            return res.status(404).json({ success: false, error: '❌ المستخدم غير موجود' });
        }
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في حذف المستخدم' });
    }
});

// ----- Vessels -----
app.get('/api/vessels', authenticate, async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json(vessels);
    } catch (error) {
        console.error('Get vessels error:', error);
        res.status(500).json([]);
    }
});

app.post('/api/vessels', authenticate, requirePermission('editVessels'), async (req, res) => {
    try {
        const vessel = new Vessel(req.body);
        await vessel.save();
        res.json({ success: true, vessel });
    } catch (error) {
        console.error('Add vessel error:', error);
        res.status(500).json({ success: false, error: '❌ خطأ في إضافة المركب' });
    }
});

app.put('/api/vessels/:id', authenticate, requirePermission('editVessels'), async (req, res) => {
    try {
        const { id } = req.params;
        const vessel = await Vessel.findByIdAndUpdate(id, req.body, { new: true });
        if (!vessel) {
            return res.status(404).json({ success: false, error: '❌ المركب غير موجود' });
        }
        res.json({ success: true, vessel });
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في تحديث المركب' });
    }
});

app.delete('/api/vessels/:id', authenticate, requirePermission('deleteVessels'), async (req, res) => {
    try {
        const { id } = req.params;
        const vessel = await Vessel.findByIdAndDelete(id);
        if (!vessel) {
            return res.status(404).json({ success: false, error: '❌ المركب غير موجود' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في حذف المركب' });
    }
});

// ----- Maintenance -----
app.get('/api/maintenance', authenticate, async (req, res) => {
    try {
        const records = await Maintenance.find().sort({ createdAt: -1 });
        res.json(records);
    } catch (error) {
        res.status(500).json([]);
    }
});

app.post('/api/maintenance', authenticate, requirePermission('editMaintenance'), async (req, res) => {
    try {
        const record = new Maintenance(req.body);
        await record.save();
        res.json({ success: true, record });
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في إضافة سجل الصيانة' });
    }
});

app.put('/api/maintenance/:id', authenticate, requirePermission('editMaintenance'), async (req, res) => {
    try {
        const { id } = req.params;
        const record = await Maintenance.findByIdAndUpdate(id, req.body, { new: true });
        if (!record) {
            return res.status(404).json({ success: false, error: '❌ السجل غير موجود' });
        }
        res.json({ success: true, record });
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في تحديث سجل الصيانة' });
    }
});

app.delete('/api/maintenance/:id', authenticate, requirePermission('deleteMaintenance'), async (req, res) => {
    try {
        const { id } = req.params;
        const record = await Maintenance.findByIdAndDelete(id);
        if (!record) {
            return res.status(404).json({ success: false, error: '❌ السجل غير موجود' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في حذف سجل الصيانة' });
    }
});

// ============================================================
// 📄 AI ROUTES - مع التحقق من وجود الملف
// ============================================================

console.log('🔄 جاري تحميل مسارات الذكاء الاصطناعي...');

try {
    // محاولة تحميل الملف من عدة مسارات
    let aiRoutes = null;
    const possiblePaths = [
        './routes/ai',
        './server/routes/ai',
        path.join(__dirname, 'routes', 'ai'),
        path.join(__dirname, 'server', 'routes', 'ai')
    ];
    
    for (const p of possiblePaths) {
        try {
            aiRoutes = require(p);
            console.log(`✅ تم تحميل مسارات AI من: ${p}`);
            break;
        } catch (e) {
            // الملف غير موجود في هذا المسار
        }
    }
    
    if (aiRoutes) {
        app.use('/api/ai', aiRoutes);
        console.log('✅ مسارات AI مفعلة');
    } else {
        console.warn('⚠️ لم يتم العثور على ملف routes/ai.js');
        console.warn('📌 سيتم استخدام مسار بديل للذكاء الاصطناعي');
        
        // مسار بديل بسيط للذكاء الاصطناعي
        const simpleAIRoutes = require('./simple-ai-routes');
        app.use('/api/ai', simpleAIRoutes);
    }
} catch (error) {
    console.warn('⚠️ فشل تحميل مسارات AI:', error.message);
    console.log('📌 سيتم تشغيل السيرفر بدون مسارات AI');
}

// ============================================================
// 📄 PAGE ROUTES
// ============================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/pages/:page', (req, res) => {
    const page = req.params.page;
    const filePath = path.join(__dirname, 'public', 'pages', `${page}.html`);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Page not found');
    }
});

// ============================================================
// 🔧 INIT DEFAULT USERS
// ============================================================

async function initDefaultUsers() {
    try {
        const count = await User.countDocuments();
        if (count === 0) {
            const defaultUsers = [
                { name: 'مدير النظام', email: 'admin', password: '123456', role: 'مسؤول', region: '' },
                { name: 'محرر الشمال', email: 'north', password: '123456', role: 'محرر إقليمي', region: 'الشمال' },
                { name: 'محرر الساحل', email: 'coast', password: '123456', role: 'محرر إقليمي', region: 'الساحل' },
                { name: 'محرر الوسط', email: 'center', password: '123456', role: 'محرر إقليمي', region: 'الوسط' },
                { name: 'محرر الجنوب', email: 'south', password: '123456', role: 'محرر إقليمي', region: 'الجنوب' },
                { name: 'فني تونس', email: 'tech.tunis', password: '123456', role: 'فني صيانة', region: '' },
                { name: 'فني المنستير', email: 'tech.monastir', password: '123456', role: 'فني صيانة', region: '' },
                { name: 'مشاهد', email: 'viewer', password: '123456', role: 'مشاهد', region: '' }
            ];
            
            for (const userData of defaultUsers) {
                const user = new User(userData);
                await user.save();
            }
            console.log('✅ تم إنشاء المستخدمين الافتراضيين');
            console.log('========================================');
            console.log('👑 مسؤول: admin / 123456');
            console.log('📍 محرر الشمال: north / 123456');
            console.log('📍 محرر الساحل: coast / 123456');
            console.log('📍 محرر الوسط: center / 123456');
            console.log('📍 محرر الجنوب: south / 123456');
            console.log('🔧 فني تونس: tech.tunis / 123456');
            console.log('👀 مشاهد: viewer / 123456');
            console.log('========================================');
        }
    } catch (error) {
        console.error('❌ Error creating default users:', error);
    }
}

// ============================================================
// 🚀 START SERVER
// ============================================================

app.listen(PORT, () => {
    console.log('========================================');
    console.log('🚀 نظام إدارة الأسطول البحري');
    console.log('========================================');
    console.log(`✅ الخادم يعمل على: http://localhost:${PORT}`);
    console.log(`✅ البيئة: ${process.env.NODE_ENV || 'development'}`);
    console.log('========================================');
    console.log('📝 حسابات الدخول:');
    console.log('   👑 admin   / 123456 (مسؤول كامل)');
    console.log('========================================');
});

module.exports = app;
