// server.js - النسخة الكاملة مع نظام الصلاحيات
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// استيراد نظام الصلاحيات
const { 
    PERMISSIONS,
    hasPermission, 
    getPermissionsByRole,
    isAdmin,
    isRegionalEditor,
    isMaintenanceTech,
    isViewer 
} = require('./server/config/permissions');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ملفات ثابتة
app.use(express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/pages', express.static(path.join(__dirname, 'public/pages')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// ============================================================
// 📁 الاتصال بقاعدة البيانات MongoDB
// ============================================================

console.log('🔄 جاري الاتصال بـ MongoDB...');

mongoose.connect(process.env.MONGODB_URI, {
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
    process.exit(1);
});

// ============================================================
// 📦 نماذج MongoDB (Schemas)
// ============================================================

// ----- نموذج المستخدم مع إضافة region -----
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

// ----- نموذج المركب مع إضافة region -----
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

// ----- نموذج الصيانة -----
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

// ----- نموذج التذكرة -----
const TicketSchema = new mongoose.Schema({
    subject: { type: String, required: true },
    message: { type: String, required: true },
    priority: { type: String, enum: ['منخفضة', 'متوسطة', 'عالية', 'عاجلة'], default: 'متوسطة' },
    status: { type: String, enum: ['مفتوحة', 'قيد المعالجة', 'مغلقة'], default: 'مفتوحة' },
    userName: { type: String },
    date: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

const Ticket = mongoose.model('Ticket', TicketSchema);

// ----- نموذج المذكرة -----
const NoteSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    createdBy: { type: String },
    date: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const Note = mongoose.model('Note', NoteSchema);

// ============================================================
// 🔐 دوال المصادقة والصلاحيات (Middleware)
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
        return res.status(401).json({ success: false, error: '❌ الرجاء تسجيل الدخول' });
    }
    
    const token = authHeader.substring(7);
    
    // دعم التوكن التجريبي
    if (token.startsWith('demo-token-')) {
        req.user = { id: 'demo-user-id', email: 'admin@example.com', role: 'مسؤول', region: '' };
        return next();
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ success: false, error: '❌ توكن غير صالح' });
    }
    
    req.user = decoded;
    next();
}

// ===== دوال التحقق من الصلاحيات =====

function checkPermission(permission) {
    return (req, res, next) => {
        const userRole = req.user?.role;
        if (!userRole) {
            return res.status(401).json({ success: false, error: '❌ الرجاء تسجيل الدخول' });
        }
        if (hasPermission(permission, userRole)) {
            next();
        } else {
            res.status(403).json({ success: false, error: '❌ ليس لديك صلاحية لهذه العملية' });
        }
    };
}

function requireAdmin(req, res, next) {
    const userRole = req.user?.role;
    if (!userRole) {
        return res.status(401).json({ success: false, error: '❌ الرجاء تسجيل الدخول' });
    }
    if (isAdmin(userRole)) {
        next();
    } else {
        res.status(403).json({ success: false, error: '❌ هذه العملية تتطلب صلاحية مسؤول' });
    }
}

function requireAdminOrRegionalEditor(req, res, next) {
    const userRole = req.user?.role;
    if (!userRole) {
        return res.status(401).json({ success: false, error: '❌ الرجاء تسجيل الدخول' });
    }
    if (isAdmin(userRole) || isRegionalEditor(userRole)) {
        next();
    } else {
        res.status(403).json({ success: false, error: '❌ هذه العملية تتطلب صلاحية محرر إقليمي' });
    }
}

function requireMaintenanceTech(req, res, next) {
    const userRole = req.user?.role;
    if (!userRole) {
        return res.status(401).json({ success: false, error: '❌ الرجاء تسجيل الدخول' });
    }
    if (isMaintenanceTech(userRole) || isAdmin(userRole)) {
        next();
    } else {
        res.status(403).json({ success: false, error: '❌ هذه العملية تتطلب صلاحية فني صيانة' });
    }
}

// ============================================================
// 🚀 دوال API مع الصلاحيات
// ============================================================

// ---------- المصادقة ----------
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

// ---------- المستخدمين (مسؤول فقط) ----------
app.get('/api/users', authenticate, requireAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: '❌ خطأ في تحميل المستخدمين' });
    }
});

app.post('/api/users', authenticate, requireAdmin, async (req, res) => {
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

app.put('/api/users/:id', authenticate, requireAdmin, async (req, res) => {
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

app.delete('/api/users/:id', authenticate, requireAdmin, async (req, res) => {
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

// ---------- المراكب (مع صلاحيات) ----------
app.get('/api/vessels', authenticate, async (req, res) => {
    try {
        const userRole = req.user?.role;
        const userRegion = req.user?.region;
        let query = {};
        
        // محرر إقليمي يرى مراكب إقليمه فقط
        if (isRegionalEditor(userRole) && !isAdmin(userRole)) {
            query.region = userRegion;
        }
        
        const vessels = await Vessel.find(query).sort({ createdAt: -1 });
        res.json(vessels);
    } catch (error) {
        console.error('Get vessels error:', error);
        res.status(500).json([]);
    }
});

app.post('/api/vessels', authenticate, requireAdminOrRegionalEditor, async (req, res) => {
    try {
        // التأكد من أن المركب يضاف في إقليم المستخدم
        if (isRegionalEditor(req.user?.role)) {
            req.body.region = req.user.region;
        }
        
        const vessel = new Vessel(req.body);
        await vessel.save();
        res.json({ success: true, vessel });
    } catch (error) {
        console.error('Add vessel error:', error);
        res.status(500).json({ success: false, error: '❌ خطأ في إضافة المركب' });
    }
});

app.put('/api/vessels/:id', authenticate, requireAdminOrRegionalEditor, async (req, res) => {
    try {
        const { id } = req.params;
        const vessel = await Vessel.findById(id);
        
        if (!vessel) {
            return res.status(404).json({ success: false, error: '❌ المركب غير موجود' });
        }
        
        // التحقق من أن المحرر الإقليمي يعدل مراكب إقليمه فقط
        if (isRegionalEditor(req.user?.role) && vessel.region !== req.user.region) {
            return res.status(403).json({ success: false, error: '❌ ليس لديك صلاحية لتعديل مراكب هذا الإقليم' });
        }
        
        const updatedVessel = await Vessel.findByIdAndUpdate(id, req.body, { new: true });
        res.json({ success: true, vessel: updatedVessel });
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في تحديث المركب' });
    }
});

app.delete('/api/vessels/:id', authenticate, requireAdmin, async (req, res) => {
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

// ---------- الصيانة ----------
app.get('/api/maintenance', authenticate, checkPermission('maintenance:read'), async (req, res) => {
    try {
        const records = await Maintenance.find().sort({ createdAt: -1 });
        res.json(records);
    } catch (error) {
        res.status(500).json([]);
    }
});

app.post('/api/maintenance', authenticate, requireMaintenanceTech, async (req, res) => {
    try {
        const record = new Maintenance(req.body);
        await record.save();
        res.json({ success: true, record });
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في إضافة سجل الصيانة' });
    }
});

app.put('/api/maintenance/:id', authenticate, requireMaintenanceTech, async (req, res) => {
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

app.delete('/api/maintenance/:id', authenticate, requireAdmin, async (req, res) => {
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

// ---------- التذاكر ----------
app.get('/api/tickets', authenticate, checkPermission('tickets:read'), async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        res.json(tickets);
    } catch (error) {
        res.status(500).json([]);
    }
});

app.post('/api/tickets', authenticate, checkPermission('tickets:create'), async (req, res) => {
    try {
        const ticket = new Ticket({
            ...req.body,
            createdBy: req.user.id
        });
        await ticket.save();
        res.json({ success: true, ticket });
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في إضافة التذكرة' });
    }
});

app.put('/api/tickets/:id', authenticate, checkPermission('tickets:update'), async (req, res) => {
    try {
        const { id } = req.params;
        const ticket = await Ticket.findByIdAndUpdate(id, req.body, { new: true });
        if (!ticket) {
            return res.status(404).json({ success: false, error: '❌ التذكرة غير موجودة' });
        }
        res.json({ success: true, ticket });
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في تحديث التذكرة' });
    }
});

// ---------- المذكرات ----------
app.get('/api/notes', authenticate, checkPermission('notes:read'), async (req, res) => {
    try {
        const notes = await Note.find().sort({ createdAt: -1 });
        res.json(notes);
    } catch (error) {
        res.status(500).json([]);
    }
});

app.post('/api/notes', authenticate, checkPermission('notes:create'), async (req, res) => {
    try {
        const note = new Note(req.body);
        await note.save();
        res.json({ success: true, note });
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في إضافة المذكرة' });
    }
});

app.put('/api/notes/:id', authenticate, checkPermission('notes:update'), async (req, res) => {
    try {
        const { id } = req.params;
        const note = await Note.findByIdAndUpdate(id, req.body, { new: true });
        if (!note) {
            return res.status(404).json({ success: false, error: '❌ المذكرة غير موجودة' });
        }
        res.json({ success: true, note });
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في تحديث المذكرة' });
    }
});

app.delete('/api/notes/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const note = await Note.findByIdAndDelete(id);
        if (!note) {
            return res.status(404).json({ success: false, error: '❌ المذكرة غير موجودة' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في حذف المذكرة' });
    }
});

// ---------- المراقبة (مسؤول فقط) ----------
app.get('/api/sessions', authenticate, requireAdmin, async (req, res) => {
    try {
        // منطق عرض الجلسات
        res.json({ success: true, message: 'جلسات المستخدمين' });
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ' });
    }
});

// ============================================================
// 📄 تهيئة المستخدمين الافتراضيين
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
                { name: 'فني صفاقس', email: 'tech.sfax', password: '123456', role: 'فني صيانة', region: '' },
                { name: 'فني جرجيس', email: 'tech.zarzis', password: '123456', role: 'فني صيانة', region: '' },
                { name: 'مشاهد', email: 'viewer', password: '123456', role: 'مشاهد', region: '' }
            ];
            
            for (const userData of defaultUsers) {
                const user = new User(userData);
                await user.save();
            }
            console.log('✅ تم إنشاء المستخدمين الافتراضيين في MongoDB');
            console.log('========================================');
            console.log('👑 مسؤول: admin / 123456');
            console.log('📍 محرر الشمال: north / 123456');
            console.log('📍 محرر الساحل: coast / 123456');
            console.log('📍 محرر الوسط: center / 123456');
            console.log('📍 محرر الجنوب: south / 123456');
            console.log('🔧 فني تونس: tech.tunis / 123456');
            console.log('🔧 فني المنستير: tech.monastir / 123456');
            console.log('🔧 فني صفاقس: tech.sfax / 123456');
            console.log('🔧 فني جرجيس: tech.zarzis / 123456');
            console.log('👀 مشاهد: viewer / 123456');
            console.log('========================================');
        } else {
            console.log(`✅ يوجد ${count} مستخدمين في قاعدة البيانات`);
        }
    } catch (error) {
        console.error('❌ Error creating default users:', error);
    }
}

// ============================================================
// 📄 تقديم الصفحات
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
// 🚀 تشغيل الخادم
// ============================================================

app.listen(PORT, () => {
    console.log('========================================');
    console.log('🚀 نظام إدارة الأسطول البحري');
    console.log('========================================');
    console.log(`✅ الخادم يعمل على: http://localhost:${PORT}`);
    console.log('========================================');
    console.log('📝 حسابات الدخول:');
    console.log('   👑 admin   / 123456 (مسؤول كامل)');
    console.log('========================================');
    console.log('📊 قاعدة البيانات: MongoDB ✅');
    console.log('🔐 نظام الصلاحيات: مفعل ✅');
    console.log('========================================');
});
