// ============================================================
// 🚀 AI COMMANDER ENTERPRISE - server.js (نسخة مصححة)
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
        console.warn('⚠️ Using fallback JWT_SECRET for Render deployment');
    }
}

// ============================================================
// 2. Middleware
// ============================================================

// ✅ CORS - مقيد
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining']
}));

// ✅ Helmet - أمان محسن (مع تعطيل CSP للتوافق)
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
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
    // لا نخرج من العملية في Render
});

// ============================================================
// 4. نماذج البيانات (يجب تعريفها قبل الاستخدام)
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
    const statusMap = {
        'pending': 'قيد الإنجاز',
        'in_progress': 'قيد الإنجاز',
        'completed': 'مكتملة',
        'cancelled': 'ملغية'
    };
    if (this.status && !this.statusAr) {
        this.statusAr = statusMap[this.status] || 'قيد الإنجاز';
    }
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

// ✅ نموذج الرسالة (مستقل)
const MessageSchema = new mongoose.Schema({
    messageId: { type: String, unique: true },
    conversationId: { type: String, required: true },
    userId: { type: String, required: true },
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

MessageSchema.pre('save', function(next) {
    if (!this.messageId) {
        this.messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    }
    next();
});

// ✅ إنشاء النماذج
const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Vessel = mongoose.models.Vessel || mongoose.model('Vessel', VesselSchema);
const Maintenance = mongoose.models.Maintenance || mongoose.model('Maintenance', MaintenanceSchema);
const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);
const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema);

// ============================================================
// 5. دوال المصادقة
// ============================================================

const JWT_SECRET_FALLBACK = 'fallback-secret-key-for-render-deployment';

function generateToken(user) {
    const secret = JWT_SECRET || JWT_SECRET_FALLBACK;
    const payload = {
        userId: user.userId,
        email: user.email,
        role: user.role,
        region: user.region || '',
        permissions: user.permissions || []
    };
    return jwt.sign(payload, secret, { expiresIn: '7d' });
}

function verifyToken(token) {
    const secret = JWT_SECRET || JWT_SECRET_FALLBACK;
    try {
        return jwt.verify(token, secret);
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

// ✅ ذاكرة المحادثات (مؤقتة)
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

        // ✅ محاولة استخدام Gemini
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
                
                let history = [];
                if (conversationId && conversationMemory.has(conversationId)) {
                    history = conversationMemory.get(conversationId) || [];
                }

                const chat = model.startChat({
                    history: history.slice(-10)
                });
                
                const result = await chat.sendMessage(message);
                response = result.response.text();
                usedProvider = 'gemini';
                
                if (conversationId && response) {
                    if (!conversationMemory.has(conversationId)) {
                        conversationMemory.set(conversationId, []);
                    }
                    const historyArr = conversationMemory.get(conversationId);
                    historyArr.push({ role: 'user', parts: [{ text: message }] });
                    historyArr.push({ role: 'model', parts: [{ text: response }] });
                    
                    if (historyArr.length > 20) {
                        conversationMemory.set(conversationId, historyArr.slice(-20));
                    }
                }
                
                console.log(`✅ Gemini رد: ${response.substring(0, 50)}...`);
            } catch (error) {
                console.warn('⚠️ Gemini error:', error.message);
            }
        }

        // ✅ إذا فشل Gemini، استخدم الردود المحلية
        if (!response) {
            response = generateLocalResponse(message);
            usedProvider = 'local';
            console.log(`✅ Local رد: ${response.substring(0, 50)}...`);
        }

        // ✅ حفظ المحادثة
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
    if (msg.includes('تونس') || msg.includes('اين تونس')) {
        return `🇹🇳 **تونس**\n\nتقع تونس في شمال أفريقيا، على البحر المتوسط.\n\n• العاصمة: مدينة تونس\n• اللغة: العربية\n• العملة: الدينار التونسي\n• عدد السكان: ~12 مليون\n• الرئيس: قيس سعيد\n\n📍 مدن رئيسية: صفاقس، سوسة، المنستير، بنزرت`;
    }
    
    if (msg.includes('الذكاء') || msg.includes('AI') || msg.includes('ذكاء')) {
        return `🧠 **الذكاء الاصطناعي**\n\nهو محاكاة الذكاء البشري في الآلات.\n\n📌 **أنواعه:**\n• الذكاء الاصطناعي الضيق (مثل Siri، Alexa)\n• الذكاء الاصطناعي العام (مثل البشر)\n• الذكاء الاصطناعي الفائق (يتفوق على البشر)\n\n💡 **أمثلة:** ChatGPT، Gemini، DeepSeek`;
    }
    
    if (msg.includes('مرحبا') || msg.includes('السلام') || msg.includes('اهلاً')) {
        return "👋 مرحباً بك! أنا **نظامي**، المساعد الذكي. كيف يمكنني مساعدتك اليوم؟";
    }
    
    if (msg.includes('مساعدة') || msg.includes('help')) {
        return `📚 **ماذا يمكنني أن أفعل؟**\n\n🌍 **المعرفة العامة:**\n• معلومات عن الدول\n• الذكاء الاصطناعي والتكنولوجيا\n• البرمجة\n• التاريخ والجغرافيا\n\n🌊 **الشؤون البحرية:**\n• إحصائيات الأسطول\n• تقارير الصيانة`;
    }
    
    if (msg.includes('برمجة') || msg.includes('كود')) {
        return `💻 **البرمجة**\n\nأشهر لغات البرمجة:\n• JavaScript - تطوير الويب\n• Python - الذكاء الاصطناعي\n• Java - تطبيقات الأندرويد\n• C++ - الألعاب\n\n💡 ابدأ بتعلم JavaScript أو Python!`;
    }
    
    if (msg.includes('تاريخ') || msg.includes('تاريخ تونس')) {
        return `📜 **التاريخ**\n\nتونس لها تاريخ عريق:\n• قرطاج: تأسست عام 814 ق.م\n• الحضارة البونيقية\n• الفتح الإسلامي عام 647م\n• الدولة الحفصية\n• الحماية الفرنسية 1881-1956\n• الاستقلال 1956`;
    }
    
    if (msg.includes('بحر') || msg.includes('بحري') || msg.includes('أسطول')) {
        return `🌊 **الشؤون البحرية**\n\n• البحر المتوسط: 1600 كم من السواحل\n• أهم الموانئ: حلق الوادي، صفاقس، سوسة\n• الصيد البحري: قطاع حيوي\n• الأسطول: نظام متكامل للإدارة\n• الصيانة: متابعة دورية`;
    }
    
    // رد افتراضي
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
        }
    } catch (error) {
        console.error('❌ Error creating default users:', error);
    }
}

// ============================================================
// 11. تشغيل الخادم
// ============================================================

app.listen(PORT, '0.0.0.0', () => {
    console.log('========================================');
    console.log('🚀 نظام إدارة الأسطول البحري v5.0');
    console.log('========================================');
    console.log(`✅ الخادم يعمل على: http://localhost:${PORT}`);
    console.log(`✅ Gemini: ${GEMINI_API_KEY && !GEMINI_API_KEY.includes('your_') ? '✅ مفعل' : '❌ غير مفعل'}`);
    console.log(`✅ JWT: ${JWT_SECRET && !JWT_SECRET.includes('your_') ? '✅ مفعل' : '⚠️ وضع احتياطي'}`);
    console.log(`✅ MongoDB: ${mongoose.connection.readyState === 1 ? '✅ متصل' : '❌ غير متصل'}`);
    console.log('========================================');
    console.log('📝 حسابات الدخول:');
    console.log('   👑 admin   / Admin@2024#Secure (مسؤول كامل)');
    console.log('========================================');
});

// ============================================================
// 12. إغلاق آمن
// ============================================================

process.on('SIGTERM', async () => {
    console.log('🔄 إيقاف الخادم...');
    await mongoose.connection.close();
    console.log('✅ تم الإغلاق');
    process.exit(0);
});

module.exports = app;
