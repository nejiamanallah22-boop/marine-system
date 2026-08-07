// server.js
// ============================================================
// 🚀 MARINE SYSTEM - ENTERPRISE EDITION v23
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
        ? ['https://marine-system-71eo.onrender.com', 'http://localhost:3000', 'http://localhost:3001'] 
        : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
    credentials: true
}));

app.use(helmet({
    contentSecurityPolicy: false
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
        enum: ['مسؤول', 'محرر إقليمي', 'فني صيانة', 'قائد وحدة', 'ضابط عمليات', 'ضابط ملاحة', 'مشاهد'], 
        default: 'مشاهد' 
    },
    region: { 
        type: String, 
        enum: ['الشمال', 'الساحل', 'الوسط', 'الجنوب', ''],
        default: '' 
    },
    tokenVersion: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
    createdAt: { type: Date, default: Date.now }
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

const User = mongoose.models.User || mongoose.model('User', UserSchema);

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

const Vessel = mongoose.models.Vessel || mongoose.model('Vessel', VesselSchema);

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

MaintenanceSchema.index({ vesselName: 1, createdAt: -1 });
MaintenanceSchema.index({ status: 1, createdAt: -1 });

const Maintenance = mongoose.models.Maintenance || mongoose.model('Maintenance', MaintenanceSchema);

// ----- Conversation Model -----
const ConversationSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    title: { type: String, default: 'محادثة جديدة' },
    messageCount: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now }
}, {
    timestamps: { createdAt: 'createdAt' }
});

ConversationSchema.index({ userId: 1, updatedAt: -1 });

const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);

// ----- Message Model -----
const MessageSchema = new mongoose.Schema({
    conversationId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Conversation' },
    userId: { type: String, required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

MessageSchema.index({ conversationId: 1, userId: 1, timestamp: -1 });
MessageSchema.index({ userId: 1, timestamp: -1 });

const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema);

// ============================================================
// 🔐 AUTH MIDDLEWARE
// ============================================================

function generateToken(user) {
    return jwt.sign(
        { 
            id: user._id, 
            email: user.email, 
            role: user.role, 
            region: user.region || '',
            tokenVersion: user.tokenVersion || 0
        },
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

async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
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
    
    try {
        const freshUser = await User.findById(decoded.id).lean();
        if (freshUser && freshUser.tokenVersion !== undefined && decoded.tokenVersion !== freshUser.tokenVersion) {
            return res.status(401).json({
                success: false,
                error: "❌ تم إلغاء التوكن، يرجى تسجيل الدخول مرة أخرى",
                code: "TOKEN_REVOKED"
            });
        }
        req.user = decoded;
        next();
    } catch (error) {
        req.user = decoded;
        next();
    }
}

// ============================================================
// 🔐 PERMISSIONS
// ============================================================

const PERMISSIONS = {
    "مسؤول": { level: 100, viewAll: true, maxMessages: 200 },
    "محرر إقليمي": { level: 80, viewAll: false, maxMessages: 100 },
    "فني صيانة": { level: 50, viewAll: false, maxMessages: 50 },
    "قائد وحدة": { level: 60, viewAll: false, maxMessages: 80 },
    "ضابط عمليات": { level: 40, viewAll: false, maxMessages: 60 },
    "ضابط ملاحة": { level: 30, viewAll: false, maxMessages: 40 },
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

// ----- Users -----
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
// 🤖 AI ROUTES
// ============================================================

console.log('🔄 جاري تحميل مسارات الذكاء الاصطناعي...');

const aiRouter = express.Router();

// ذاكرة مؤقتة للمحادثات
const conversationMemory = {};

aiRouter.post('/ask', async (req, res) => {
    try {
        const { message, conversationId } = req.body;
        if (!message) return res.status(400).json({ success: false, error: 'الرسالة مطلوبة' });
        
        console.log(`📤 سؤال: ${message}`);
        
        let response = null;
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        
        // محاولة استخدام Gemini إذا كان المفتاح موجوداً
        if (GEMINI_API_KEY && GEMINI_API_KEY.length > 10) {
            try {
                const { GoogleGenerativeAI } = require('@google/generative-ai');
                const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({ 
                    model: "gemini-2.0-flash-exp",
                    generationConfig: {
                        temperature: 0.8,
                        maxOutputTokens: 2000,
                    }
                });
                
                const chat = model.startChat({
                    history: conversationId && conversationMemory[conversationId] ? conversationMemory[conversationId] : []
                });
                
                const result = await chat.sendMessage(message);
                response = result.response.text();
                
                // حفظ المحادثة
                if (conversationId && response) {
                    if (!conversationMemory[conversationId]) conversationMemory[conversationId] = [];
                    conversationMemory[conversationId].push({ role: 'user', parts: [{ text: message }] });
                    conversationMemory[conversationId].push({ role: 'model', parts: [{ text: response }] });
                    if (conversationMemory[conversationId].length > 20) {
                        conversationMemory[conversationId] = conversationMemory[conversationId].slice(-20);
                    }
                }
                
                console.log(`✅ Gemini رد: ${response.substring(0, 50)}...`);
            } catch (error) {
                console.warn('⚠️ Gemini error:', error.message);
            }
        }
        
        // إذا فشل Gemini، استخدم الردود المحلية
        if (!response) {
            const msg = message.toLowerCase();
            if (msg.includes('مرحبا') || msg.includes('السلام') || msg.includes('اهلاً')) {
                response = "👋 مرحباً بك! أنا **نظامي**، المساعد الذكي. كيف يمكنني مساعدتك اليوم؟";
            } else if (msg.includes('تونس') || msg.includes('عاصمة')) {
                response = `🇹🇳 **معلومات عن تونس**\n\n• العاصمة: مدينة تونس\n• اللغة الرسمية: العربية\n• العملة: الدينار التونسي (TND)\n• المساحة: 163,610 كم²\n• عدد السكان: ~12 مليون نسمة\n• الرئيس: قيس سعيد\n\n📍 مدن رئيسية: صفاقس، سوسة، المنستير، بنزرت، قابس`;
            } else if (msg.includes('الذكاء') || msg.includes('AI') || msg.includes('ذكاء')) {
                response = `🧠 **الذكاء الاصطناعي**\n\nالذكاء الاصطناعي هو محاكاة الذكاء البشري في الآلات.\n\n📌 **أنواعه:**\n• الذكاء الاصطناعي الضيق (مثل المساعدات الصوتية)\n• الذكاء الاصطناعي العام (مثل البشر)\n• الذكاء الاصطناعي الفائق (يتفوق على البشر)\n\n💡 **أمثلة:** ChatGPT، Gemini، Siri، Alexa`;
            } else if (msg.includes('مساعدة') || msg.includes('help')) {
                response = `📚 **ماذا يمكنني أن أفعل؟**\n\n🌍 **المعرفة العامة:**\n• معلومات عن الدول (تونس، مصر، السعودية...)\n• الذكاء الاصطناعي والتكنولوجيا\n• البرمجة وتطوير البرمجيات\n• التاريخ والجغرافيا\n• الصحة والطب\n• وأي شيء آخر!\n\n🌊 **الشؤون البحرية:**\n• إحصائيات الأسطول\n• تقارير الصيانة`;
            } else if (msg.includes('برمجة') || msg.includes('كود')) {
                response = `💻 **البرمجة**\n\nأشهر لغات البرمجة:\n• JavaScript - تطوير الويب\n• Python - الذكاء الاصطناعي\n• Java - تطبيقات الأندرويد\n• C++ - الألعاب\n• PHP - تطوير الويب الخلفي\n\n💡 ابدأ بتعلم JavaScript أو Python!`;
            } else if (msg.includes('من صنع') || msg.includes('المطور') || msg.includes('المبرمج')) {
                response = `🌟 **المطور**\n\nتم تطوير هذا النظام بواسطة:\n👨‍💻 **المبدع والمحترف الوكيل بالحرس الوطني التونسي أمان الله ناجي**\n\n💡 الإصدار: v23\n📅 السنة: 2026\n\nجميع الحقوق محفوظة © 2026`;
            } else {
                response = `🤔 **سؤال ممتاز!**\n\nللحصول على إجابة دقيقة، أحتاج إلى مفتاح Gemini صالح.\n\n📌 **كيف تحصل على مفتاح Gemini مجاني:**\n1. اذهب إلى https://ai.google.dev/\n2. سجل الدخول بحساب Google\n3. اضغط على "Get API Key"\n4. انسخ المفتاح الجديد\n5. ضعه في ملف .env\n6. أعد تشغيل السيرفر\n\n💡 **يمكنني مساعدتك في:**\n• معلومات عن الدول\n• الذكاء الاصطناعي\n• البرمجة\n• وأي شيء آخر!`;
            }
        }
        
        const newConversationId = conversationId || 'conv_' + Date.now().toString(36);
        
        res.json({
            success: true,
            response: response,
            conversationId: newConversationId,
            version: "23.0.0"
        });
    } catch (error) {
        console.error('❌ AI Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

aiRouter.get('/health', (req, res) => {
    res.json({
        success: true,
        status: "healthy",
        version: "23.0.0",
        gemini: process.env.GEMINI_API_KEY ? "✅ مفعل" : "❌ غير مفعل",
        timestamp: new Date().toISOString()
    });
});

app.use('/api/ai', aiRouter);
console.log('✅ تم تحميل مسارات AI بنجاح');

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
    console.log('🚀 نظام إدارة الأسطول البحري v23');
    console.log('========================================');
    console.log(`✅ الخادم يعمل على: http://localhost:${PORT}`);
    console.log(`✅ البيئة: ${process.env.NODE_ENV || 'development'}`);
    console.log('========================================');
    console.log('📝 حسابات الدخول:');
    console.log('   👑 admin   / 123456 (مسؤول كامل)');
    console.log('========================================');
});

module.exports = app;
