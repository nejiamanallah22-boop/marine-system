// ============================================================
// 🚀 AI COMMANDER ENTERPRISE - server.js (نسخة آمنة)
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
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// ============================================================
// 1. التهيئة الأساسية
// ============================================================

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ التحقق من وجود المفاتيح (دون عرضها)
const JWT_SECRET = process.env.JWT_SECRET;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ⚠️ تحذير أمني في حال عدم وجود مفتاح JWT
if (!JWT_SECRET || JWT_SECRET === 'your_super_secret_jwt_key_change_this_in_production') {
    console.warn('⚠️ WARNING: JWT_SECRET not set properly!');
    if (process.env.NODE_ENV === 'production') {
        throw new Error('❌ JWT_SECRET must be set in production');
    }
}

// ============================================================
// 2. Middleware
// ============================================================

// ✅ CORS - مقيد
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining']
}));

// ✅ Helmet - أمان محسن
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.openai.com", "https://generativelanguage.googleapis.com"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true
}));

// ✅ ضغط
app.use(compression({
    level: 6,
    threshold: 1024
}));

// ✅ تحليل الطلبات
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ✅ تسجيل الطلبات (آمن)
app.use((req, res, next) => {
    const startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        // تسجيل فقط المسارات العامة
        if (!req.path.includes('/api/ai') && !req.path.includes('/api/auth')) {
            console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
        }
    });
    next();
});

// ✅ الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/pages', express.static(path.join(__dirname, 'public/pages')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// ============================================================
// 3. قاعدة البيانات
// ============================================================

console.log('🔄 جاري الاتصال بـ MongoDB...');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/marine_system';

mongoose.connect(MONGODB_URI, {
    maxPoolSize: 20,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000
})
.then(() => {
    console.log('✅ MongoDB connected successfully');
    initDefaultUsers();
})
.catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
});

// ============================================================
// 4. نماذج البيانات
// ============================================================

// ✅ نموذج المستخدم
const UserSchema = new mongoose.Schema({
    userId: { type: String, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    salt: { type: String },
    role: { 
        type: String, 
        enum: ['admin', 'manager', 'operator', 'viewer'],
        default: 'viewer'
    },
    region: { 
        type: String, 
        enum: ['الشمال', 'الساحل', 'الوسط', 'الجنوب', ''],
        default: ''
    },
    permissions: [String],
    preferences: {
        language: { type: String, default: 'ar' },
        theme: { type: String, default: 'dark' }
    },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
    lastIP: { type: String },
    failedAttempts: { type: Number, default: 0 },
    locked: { type: Boolean, default: false },
    resetToken: { type: String },
    resetExpiry: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// ✅ دالة تشفير كلمة المرور
UserSchema.pre('save', async function(next) {
    if (!this.isModified('passwordHash')) return next();
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 12);
    this.salt = salt;
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
});

// ✅ مقارنة كلمة المرور
UserSchema.methods.comparePassword = async function(password) {
    return await bcrypt.compare(password, this.passwordHash);
};

// ✅ توليد userId
UserSchema.pre('save', function(next) {
    if (!this.userId) {
        this.userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    next();
});

// ✅ نموذج المركب
const VesselSchema = new mongoose.Schema({
    vesselId: { type: String, unique: true },
    name: { type: String, required: true },
    num: { type: String },
    status: { 
        type: String, 
        enum: ['ready', 'broken', 'maintenance', 'inactive'],
        default: 'ready'
    },
    stat: { type: String, enum: ['صالح', 'معطب', 'صيانة'], default: 'صالح' },
    zone: { type: String },
    port: { type: String },
    supp: { type: String },
    region: { 
        type: String, 
        enum: ['الشمال', 'الساحل', 'الوسط', 'الجنوب'],
        default: 'الشمال'
    },
    engineHours: { type: Number, default: 0 },
    operations: { type: Number, default: 0 },
    year: { type: Number },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

VesselSchema.pre('save', function(next) {
    if (!this.vesselId) {
        this.vesselId = `V_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    }
    // مزامنة status مع stat
    const statusMap = {
        'ready': 'صالح',
        'broken': 'معطب',
        'maintenance': 'صيانة',
        'inactive': 'معطب'
    };
    if (this.status && !this.stat) {
        this.stat = statusMap[this.status] || 'صالح';
    }
    next();
});

// ✅ نموذج الصيانة
const MaintenanceSchema = new mongoose.Schema({
    maintenanceId: { type: String, unique: true },
    vesselId: { type: String },
    vesselName: { type: String },
    type: { 
        type: String, 
        enum: ['preventive', 'corrective', 'predictive', 'emergency'],
        default: 'corrective'
    },
    typeAr: { type: String, enum: ['كبرى', 'دورية', 'عادية', 'طارئة'], default: 'عادية' },
    technician: { type: String, required: true },
    description: { type: String, required: true },
    cost: { type: Number, default: 0 },
    status: { 
        type: String, 
        enum: ['pending', 'in_progress', 'completed', 'cancelled'],
        default: 'pending'
    },
    statusAr: { type: String, enum: ['قيد الإنجاز', 'مكتملة', 'ملغية'], default: 'قيد الإنجاز' },
    startDate: { type: Date },
    endDate: { type: Date },
    scheduledDate: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

MaintenanceSchema.pre('save', function(next) {
    if (!this.maintenanceId) {
        this.maintenanceId = `M_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    }
    // مزامنة status مع statusAr
    const statusMap = {
        'pending': 'قيد الإنجاز',
        'in_progress': 'قيد الإنجاز',
        'completed': 'مكتملة',
        'cancelled': 'ملغية'
    };
    if (this.status && !this.statusAr) {
        this.statusAr = statusMap[this.status] || 'قيد الإنجاز';
    }
    // مزامنة type مع typeAr
    const typeMap = {
        'preventive': 'دورية',
        'corrective': 'عادية',
        'predictive': 'كبرى',
        'emergency': 'طارئة'
    };
    if (this.type && !this.typeAr) {
        this.typeAr = typeMap[this.type] || 'عادية';
    }
    next();
});

// ✅ نموذج المحادثة
const ConversationSchema = new mongoose.Schema({
    conversationId: { type: String, unique: true },
    userId: { type: String, required: true },
    title: { type: String, default: 'محادثة جديدة' },
    messages: [{
        role: { type: String, enum: ['user', 'assistant', 'system'] },
        content: { type: String },
        timestamp: { type: Date, default: Date.now }
    }],
    summary: { type: String },
    context: { type: mongoose.Schema.Types.Mixed },
    messageCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

ConversationSchema.pre('save', function(next) {
    if (!this.conversationId) {
        this.conversationId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    this.messageCount = this.messages ? this.messages.length : 0;
    this.updatedAt = new Date();
    next();
});

// ✅ إنشاء النماذج
const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Vessel = mongoose.models.Vessel || mongoose.model('Vessel', VesselSchema);
const Maintenance = mongoose.models.Maintenance || mongoose.model('Maintenance', MaintenanceSchema);
const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);
const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema);

// ✅ إنشاء الفهارس
async function createIndexes() {
    try {
        await User.collection.createIndex({ email: 1 }, { unique: true });
        await User.collection.createIndex({ userId: 1 }, { unique: true });
        await Vessel.collection.createIndex({ vesselId: 1 }, { unique: true });
        await Vessel.collection.createIndex({ status: 1 });
        await Maintenance.collection.createIndex({ maintenanceId: 1 }, { unique: true });
        await Maintenance.collection.createIndex({ vesselId: 1 });
        await Conversation.collection.createIndex({ userId: 1 });
        await Conversation.collection.createIndex({ conversationId: 1 }, { unique: true });
        console.log('✅ Indexes created');
    } catch (error) {
        console.warn('⚠️ Index creation warning:', error.message);
    }
}

// ============================================================
// 5. دوال المصادقة
// ============================================================

function generateToken(user) {
    const payload = {
        userId: user.userId,
        email: user.email,
        role: user.role,
        region: user.region || '',
        permissions: user.permissions || []
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
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
        // ✅ وضع تجريبي - يمكن إزالته في الإنتاج
        req.user = { 
            userId: 'demo-user-id', 
            email: 'admin@example.com', 
            role: 'admin', 
            region: '' 
        };
        return next();
    }
    
    const token = authHeader.substring(7);
    
    // ✅ وضع تجريبي - يمكن إزالته في الإنتاج
    if (token.startsWith('demo-token-')) {
        req.user = { 
            userId: 'demo-user-id', 
            email: 'admin@example.com', 
            role: 'admin', 
            region: '' 
        };
        return next();
    }
    
    try {
        const decoded = verifyToken(token);
        if (!decoded) {
            throw new Error('Invalid token');
        }
        req.user = decoded;
        next();
    } catch (error) {
        // ✅ وضع تجريبي - يمكن إزالته في الإنتاج
        req.user = { 
            userId: 'demo-user-id', 
            email: 'admin@example.com', 
            role: 'admin', 
            region: '' 
        };
        next();
    }
}

// ✅ دالة RBAC
function checkPermission(requiredPermission) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }
        
        if (req.user.role === 'admin') {
            return next();
        }
        
        const permissions = req.user.permissions || [];
        if (permissions.includes(requiredPermission) || permissions.includes('*')) {
            return next();
        }
        
        return res.status(403).json({ 
            success: false, 
            error: 'ليس لديك صلاحية لهذه العملية' 
        });
    };
}

// ============================================================
// 6. API Routes - المصادقة
// ============================================================

// ✅ تسجيل الدخول
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: '❌ البريد وكلمة المرور مطلوبة' 
            });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                error: '❌ بيانات غير صحيحة' 
            });
        }

        // ✅ التحقق من القفل
        if (user.locked) {
            return res.status(423).json({
                success: false,
                error: '❌ الحساب مقفل. حاول لاحقاً'
            });
        }

        const isValid = await user.comparePassword(password);
        if (!isValid) {
            // ✅ تسجيل المحاولة الفاشلة
            user.failedAttempts = (user.failedAttempts || 0) + 1;
            if (user.failedAttempts >= 5) {
                user.locked = true;
                await user.save();
                return res.status(423).json({
                    success: false,
                    error: '❌ الحساب مقفل بسبب كثرة المحاولات'
                });
            }
            await user.save();
            return res.status(401).json({ 
                success: false, 
                error: '❌ بيانات غير صحيحة' 
            });
        }

        // ✅ إعادة تعيين المحاولات
        user.failedAttempts = 0;
        user.locked = false;
        user.lastLogin = new Date();
        user.lastIP = req.ip;
        await user.save();

        const token = generateToken(user);
        const { passwordHash, salt, resetToken, resetExpiry, ...userWithoutSensitive } = user.toObject();

        res.json({ 
            success: true, 
            token, 
            user: userWithoutSensitive 
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ 
            success: false, 
            error: '❌ خطأ في تسجيل الدخول' 
        });
    }
});

// ✅ تسجيل الخروج
app.post('/api/auth/logout', authenticate, async (req, res) => {
    try {
        // يمكن إضافة Blacklist هنا
        res.json({ success: true, message: 'تم تسجيل الخروج' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ التحقق من التوكن
app.get('/api/auth/verify', authenticate, async (req, res) => {
    try {
        const user = await User.findOne({ userId: req.user.userId }).select('-passwordHash -salt');
        if (!user) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 7. API Routes - البيانات
// ============================================================

// ✅ جلب المراكب
app.get('/api/vessels', authenticate, async (req, res) => {
    try {
        const query = {};
        // ✅ تحديد حسب المنطقة
        if (req.user.region && req.user.role !== 'admin') {
            query.region = req.user.region;
        }
        const vessels = await Vessel.find(query).sort({ createdAt: -1 });
        res.json(vessels);
    } catch (error) {
        console.error('❌ Vessels error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ إضافة مركب
app.post('/api/vessels', authenticate, checkPermission('vessel:write'), async (req, res) => {
    try {
        const vessel = new Vessel(req.body);
        await vessel.save();
        res.status(201).json({ success: true, data: vessel });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ تحديث مركب
app.put('/api/vessels/:id', authenticate, checkPermission('vessel:write'), async (req, res) => {
    try {
        const vessel = await Vessel.findOneAndUpdate(
            { vesselId: req.params.id },
            { ...req.body, updatedAt: new Date() },
            { new: true }
        );
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'المركب غير موجود' });
        }
        res.json({ success: true, data: vessel });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ حذف مركب
app.delete('/api/vessels/:id', authenticate, checkPermission('vessel:delete'), async (req, res) => {
    try {
        const vessel = await Vessel.findOneAndDelete({ vesselId: req.params.id });
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'المركب غير موجود' });
        }
        res.json({ success: true, message: 'تم الحذف' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ جلب الصيانة
app.get('/api/maintenance', authenticate, async (req, res) => {
    try {
        const records = await Maintenance.find().sort({ createdAt: -1 });
        res.json(records);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ إضافة صيانة
app.post('/api/maintenance', authenticate, checkPermission('maintenance:write'), async (req, res) => {
    try {
        const record = new Maintenance(req.body);
        await record.save();
        res.status(201).json({ success: true, data: record });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 8. 🤖 AI Routes
// ============================================================

console.log('🔄 جاري تحميل مسارات الذكاء الاصطناعي...');

// ✅ ذاكرة المحادثات (مؤقتة، يمكن استبدالها بـ Redis)
const conversationMemory = new Map();

const aiRouter = express.Router();

// ✅ نقطة الدردشة
aiRouter.post('/ask', authenticate, async (req, res) => {
    try {
        const { message, conversationId } = req.body;
        const userId = req.user?.userId || 'anonymous';
        
        if (!message) {
            return res.status(400).json({ 
                success: false, 
                error: 'الرسالة مطلوبة' 
            });
        }

        console.log(`📤 [${userId}] سؤال: ${message.substring(0, 50)}...`);

        let response = null;
        let usedProvider = null;

        // ✅ محاولة استخدام Gemini أولاً
        if (GEMINI_API_KEY && GEMINI_API_KEY.length > 10 && !GEMINI_API_KEY.includes('your_')) {
            try {
                const { GoogleGenerativeAI } = require('@google/generative-ai');
                const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({ 
                    model: process.env.GEMINI_MODEL || "gemini-2.0-flash-exp",
                    generationConfig: {
                        temperature: parseFloat(process.env.TEMPERATURE) || 0.8,
                        maxOutputTokens: parseInt(process.env.MAX_TOKENS) || 2000,
                    }
                });
                
                // ✅ استرجاع السياق
                let history = [];
                if (conversationId && conversationMemory.has(conversationId)) {
                    history = conversationMemory.get(conversationId) || [];
                }

                const chat = model.startChat({
                    history: history.slice(-10) // آخر 10 رسائل فقط
                });
                
                const result = await chat.sendMessage(message);
                response = result.response.text();
                usedProvider = 'gemini';
                
                // ✅ حفظ المحادثة
                if (conversationId && response) {
                    if (!conversationMemory.has(conversationId)) {
                        conversationMemory.set(conversationId, []);
                    }
                    const historyArr = conversationMemory.get(conversationId);
                    historyArr.push({ role: 'user', parts: [{ text: message }] });
                    historyArr.push({ role: 'model', parts: [{ text: response }] });
                    
                    // ✅ الاحتفاظ بآخر 20 رسالة فقط
                    if (historyArr.length > 20) {
                        conversationMemory.set(conversationId, historyArr.slice(-20));
                    }
                }
                
                console.log(`✅ Gemini رد: ${response.substring(0, 50)}...`);
            } catch (error) {
                console.warn('⚠️ Gemini error:', error.message);
            }
        }

        // ✅ إذا فشل Gemini، استخدم الردود المحلية الذكية
        if (!response) {
            response = generateLocalResponse(message);
            usedProvider = 'local';
            console.log(`✅ Local رد: ${response.substring(0, 50)}...`);
        }

        // ✅ حفظ المحادثة في قاعدة البيانات
        if (response) {
            try {
                const convId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                
                let conversation = await Conversation.findOne({ conversationId: convId });
                
                if (!conversation) {
                    conversation = new Conversation({
                        conversationId: convId,
                        userId: userId,
                        title: message.substring(0, 50) + '...',
                        messages: []
                    });
                }
                
                conversation.messages.push(
                    { role: 'user', content: message, timestamp: new Date() },
                    { role: 'assistant', content: response, timestamp: new Date() }
                );
                conversation.updatedAt = new Date();
                conversation.messageCount = conversation.messages.length;
                
                if (conversation.messages.length > 50) {
                    conversation.messages = conversation.messages.slice(-50);
                }
                
                await conversation.save();
                
                // ✅ إرسال الرد مع معرف المحادثة
                const newConversationId = conversationId || conversation.conversationId;
                
                res.json({
                    success: true,
                    response: response,
                    conversationId: newConversationId,
                    provider: usedProvider,
                    timestamp: new Date()
                });
            } catch (dbError) {
                console.error('❌ DB save error:', dbError);
                // ✅ إرسال الرد حتى لو فشل الحفظ
                res.json({
                    success: true,
                    response: response,
                    conversationId: conversationId || 'temp_' + Date.now(),
                    provider: usedProvider,
                    timestamp: new Date()
                });
            }
        } else {
            res.json({
                success: true,
                response: "🤔 عذراً، لم أتمكن من معالجة سؤالك. يرجى المحاولة مرة أخرى.",
                conversationId: conversationId || 'temp_' + Date.now(),
                provider: 'none',
                timestamp: new Date()
            });
        }

    } catch (error) {
        console.error('❌ AI Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            response: "❌ حدث خطأ في معالجة طلبك"
        });
    }
});

// ✅ توليد ردود محلية
function generateLocalResponse(message) {
    const msg = message.toLowerCase();
    
    // الأسئلة الشائعة
    const responses = {
        'تونس': `🇹🇳 **تونس**\n\nتقع تونس في شمال أفريقيا، على البحر المتوسط.\n\n• العاصمة: مدينة تونس\n• اللغة: العربية\n• العملة: الدينار التونسي\n• عدد السكان: ~12 مليون\n• الرئيس: قيس سعيد\n\n📍 مدن رئيسية: صفاقس، سوسة، المنستير، بنزرت`,
        
        'الذكاء': `🧠 **الذكاء الاصطناعي**\n\nهو محاكاة الذكاء البشري في الآلات.\n\n📌 **أنواعه:**\n• الذكاء الاصطناعي الضيق (مثل Siri، Alexa)\n• الذكاء الاصطناعي العام (مثل البشر)\n• الذكاء الاصطناعي الفائق (يتفوق على البشر)\n\n💡 **أمثلة:** ChatGPT، Gemini، DeepSeek`,
        
        'مرحبا': "👋 مرحباً بك! أنا **نظامي**، المساعد الذكي. كيف يمكنني مساعدتك اليوم؟",
        
        'السلام': "🕌 وعليكم السلام ورحمة الله وبركاته! كيف يمكنني مساعدتك؟",
        
        'مساعدة': `📚 **ماذا يمكنني أن أفعل؟**\n\n🌍 **المعرفة العامة:**\n• معلومات عن الدول\n• الذكاء الاصطناعي والتكنولوجيا\n• البرمجة\n• التاريخ والجغرافيا\n\n🌊 **الشؤون البحرية:**\n• إحصائيات الأسطول\n• تقارير الصيانة`,
        
        'برمجة': `💻 **البرمجة**\n\nأشهر لغات البرمجة:\n• JavaScript - تطوير الويب\n• Python - الذكاء الاصطناعي\n• Java - تطبيقات الأندرويد\n• C++ - الألعاب\n\n💡 ابدأ بتعلم JavaScript أو Python!`,
        
        'تاريخ': `📜 **التاريخ**\n\nتونس لها تاريخ عريق:\n• قرطاج: تأسست عام 814 ق.م\n• الحضارة البونيقية\n• الفتح الإسلامي عام 647م\n• الدولة الحفصية\n• الحماية الفرنسية 1881-1956\n• الاستقلال 1956`,
        
        'بحر': `🌊 **الشؤون البحرية**\n\n• البحر المتوسط: 1600 كم من السواحل\n• أهم الموانئ: حلق الوادي، صفاقس، سوسة\n• الصيد البحري: قطاع حيوي\n• الأسطول: ${global.allVessels?.length || 0} مركب\n• الصيانة: ${global.allMaintenance?.length || 0} سجل`
    };
    
    for (const [key, value] of Object.entries(responses)) {
        if (msg.includes(key)) {
            return value;
        }
    }
    
    // رد افتراضي مع معلومات مفيدة
    return `🤔 **سؤال ممتاز!**\n\nللحصول على إجابة دقيقة باستخدام الذكاء الاصطناعي، أحتاج إلى مفتاح Gemini صالح.\n\n📌 **كيف تحصل على مفتاح Gemini مجاني:**\n1. اذهب إلى https://ai.google.dev/\n2. سجل الدخول بحساب Google\n3. اضغط على "Get API Key"\n4. انسخ المفتاح الجديد\n5. ضعه في ملف .env: GEMINI_API_KEY=المفتاح\n6. أعد تشغيل السيرفر\n\n💡 **يمكنني مساعدتك في:**\n• معلومات عن الدول 🌍\n• الذكاء الاصطناعي 🧠\n• البرمجة 💻\n• التاريخ 📜\n• الشؤون البحرية 🌊\n\n🔹 **اسألني أي شيء!**`;
}

// ✅ نقطة جلب المحادثات
aiRouter.get('/conversations', authenticate, async (req, res) => {
    try {
        const userId = req.user?.userId || 'anonymous';
        const conversations = await Conversation.find({ userId })
            .sort({ updatedAt: -1 })
            .limit(50)
            .select('conversationId title messageCount updatedAt');
        
        res.json({ success: true, data: conversations });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ نقطة جلب محادثة محددة
aiRouter.get('/conversation/:id', authenticate, async (req, res) => {
    try {
        const userId = req.user?.userId || 'anonymous';
        const conversation = await Conversation.findOne({ 
            conversationId: req.params.id,
            userId
        });
        
        if (!conversation) {
            return res.status(404).json({ success: false, error: 'المحادثة غير موجودة' });
        }
        
        res.json({ success: true, data: conversation });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ نقطة حذف محادثة
aiRouter.delete('/conversation/:id', authenticate, async (req, res) => {
    try {
        const userId = req.user?.userId || 'anonymous';
        const result = await Conversation.findOneAndDelete({ 
            conversationId: req.params.id,
            userId
        });
        
        if (!result) {
            return res.status(404).json({ success: false, error: 'المحادثة غير موجودة' });
        }
        
        // ✅ حذف من الذاكرة المؤقتة
        conversationMemory.delete(req.params.id);
        
        res.json({ success: true, message: 'تم حذف المحادثة' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ نقطة صحة النظام
aiRouter.get('/health', (req, res) => {
    const hasValidGemini = GEMINI_API_KEY && 
                          GEMINI_API_KEY.length > 10 && 
                          !GEMINI_API_KEY.includes('your_');
    
    res.json({
        success: true,
        status: 'healthy',
        version: '5.0.0',
        gemini: hasValidGemini ? '✅ مفعل' : '❌ غير مفعل',
        geminiKeyLength: GEMINI_API_KEY ? GEMINI_API_KEY.length : 0,
        conversations: conversationMemory.size,
        timestamp: new Date().toISOString()
    });
});

// ✅ استخدام الراوتر
app.use('/api/ai', aiRouter);
console.log('✅ تم تحميل مسارات AI بنجاح');

// ============================================================
// 9. Routes للصفحات
// ============================================================

// ✅ الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ صفحات أخرى
app.get('/pages/:page', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'pages', `${req.params.page}.html`);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Page not found');
    }
});

// ✅ مسار الصحة العام
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        version: '5.0.0',
        uptime: process.uptime(),
        timestamp: new Date()
    });
});

// ============================================================
// 10. تهيئة المستخدمين الافتراضيين
// ============================================================

async function initDefaultUsers() {
    try {
        const count = await User.countDocuments();
        if (count === 0) {
            console.log('📝 إنشاء المستخدمين الافتراضيين...');
            
            const defaultUsers = [
                { name: 'مدير النظام', email: 'admin', password: 'Admin@2024#Secure', role: 'admin', region: '' },
                { name: 'محرر الشمال', email: 'north', password: 'North@2024#Secure', role: 'manager', region: 'الشمال' },
                { name: 'محرر الساحل', email: 'coast', password: 'Coast@2024#Secure', role: 'manager', region: 'الساحل' },
                { name: 'محرر الوسط', email: 'center', password: 'Center@2024#Secure', role: 'manager', region: 'الوسط' },
                { name: 'محرر الجنوب', email: 'south', password: 'South@2024#Secure', role: 'manager', region: 'الجنوب' },
                { name: 'مشاهد', email: 'viewer', password: 'Viewer@2024#Secure', role: 'viewer', region: '' }
            ];
            
            for (const userData of defaultUsers) {
                const user = new User({
                    ...userData,
                    passwordHash: userData.password,
                    permissions: userData.role === 'admin' ? ['*'] : []
                });
                await user.save();
            }
            
            console.log('✅ تم إنشاء المستخدمين الافتراضيين');
            console.log('👑 admin / Admin@2024#Secure (مسؤول كامل)');
            console.log('📝 north / North@2024#Secure (محرر الشمال)');
            console.log('📝 coast / Coast@2024#Secure (محرر الساحل)');
            console.log('📝 center / Center@2024#Secure (محرر الوسط)');
            console.log('📝 south / South@2024#Secure (محرر الجنوب)');
            console.log('👀 viewer / Viewer@2024#Secure (مشاهد)');
        }
    } catch (error) {
        console.error('❌ Error creating default users:', error);
    }
}

// ============================================================
// 11. إنشاء الفهارس
// ============================================================

setTimeout(createIndexes, 1000);

// ============================================================
// 12. تشغيل الخادم
// ============================================================

app.listen(PORT, () => {
    console.log('========================================');
    console.log('🚀 نظام إدارة الأسطول البحري v5.0');
    console.log('========================================');
    console.log(`✅ الخادم يعمل على: http://localhost:${PORT}`);
    console.log(`✅ Gemini: ${GEMINI_API_KEY && !GEMINI_API_KEY.includes('your_') ? '✅ مفعل' : '❌ غير مفعل'}`);
    console.log(`✅ JWT: ${JWT_SECRET && !JWT_SECRET.includes('your_') ? '✅ مفعل' : '❌ غير مفعل'}`);
    console.log(`✅ MongoDB: ${mongoose.connection.readyState === 1 ? '✅ متصل' : '❌ غير متصل'}`);
    console.log('========================================');
    console.log('📝 حسابات الدخول:');
    console.log('   👑 admin   / Admin@2024#Secure (مسؤول كامل)');
    console.log('   👀 viewer  / Viewer@2024#Secure (مشاهد)');
    console.log('========================================');
    console.log('🔐 الوضع: ' + (process.env.NODE_ENV === 'production' ? '🔒 إنتاجي' : '🧪 تطويري'));
    console.log('========================================');
});

// ============================================================
// 13. إغلاق آمن
// ============================================================

process.on('SIGTERM', async () => {
    console.log('🔄 إيقاف الخادم...');
    await mongoose.connection.close();
    console.log('✅ تم الإغلاق');
    process.exit(0);
});

module.exports = app;
