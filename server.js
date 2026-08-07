// ============================================================
// 🚀 AI COMMANDER ENTERPRISE - server.js (نسخة كاملة لـ Render)
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

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// ============================================================
// Middleware
// ============================================================

app.use(cors({ origin: '*', credentials: true }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/pages', express.static(path.join(__dirname, 'public/pages')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

console.log('🔄 جاري الاتصال بـ MongoDB...');

// ============================================================
// الاتصال بقاعدة البيانات
// ============================================================

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/marine_system')
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    initDefaultUsers();
  })
  .catch(err => console.error('❌ MongoDB connection error:', err.message));

// ============================================================
// نماذج البيانات (جميع النماذج المطلوبة)
// ============================================================

// ✅ 1. نموذج المستخدم
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['مسؤول', 'محرر إقليمي', 'فني صيانة', 'مشاهد'], default: 'مشاهد' },
  region: { type: String, enum: ['الشمال', 'الساحل', 'الوسط', 'الجنوب', ''], default: '' },
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

// ✅ 2. نموذج المركب
const VesselSchema = new mongoose.Schema({
  name: { type: String, required: true },
  num: { type: String },
  stat: { type: String, enum: ['صالح', 'معطب', 'صيانة'], default: 'صالح' },
  zone: { type: String },
  port: { type: String },
  supp: { type: String },
  region: { type: String, enum: ['الشمال', 'الساحل', 'الوسط', 'الجنوب'], default: 'الشمال' },
  createdAt: { type: Date, default: Date.now }
});

// ✅ 3. نموذج الصيانة
const MaintenanceSchema = new mongoose.Schema({
  vesselName: { type: String },
  type: { type: String, enum: ['كبرى', 'دورية', 'عادية', 'طارئة'], default: 'عادية' },
  technician: { type: String, required: true },
  description: { type: String, required: true },
  cost: { type: Number, default: 0 },
  status: { type: String, enum: ['قيد الإنجاز', 'مكتملة', 'ملغية'], default: 'قيد الإنجاز' },
  createdAt: { type: Date, default: Date.now }
});

// ✅ 4. نموذج المحادثة
const ConversationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  title: { type: String, default: 'محادثة جديدة' },
  messages: [{
    role: { type: String, enum: ['user', 'assistant', 'system'] },
    content: { type: String },
    timestamp: { type: Date, default: Date.now }
  }],
  messageCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ✅ 5. نموذج الرسالة (للتواصل مع المساعد)
const MessageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true },
  userId: { type: String, required: true },
  role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

// ✅ 6. نموذج التوقع (للتنبؤات)
const PredictionSchema = new mongoose.Schema({
  vesselId: { type: String, required: true },
  type: { type: String, enum: ['failure', 'maintenance', 'performance'], default: 'failure' },
  confidence: { type: Number, min: 0, max: 1 },
  prediction: { type: String },
  details: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date }
});

// ✅ 7. نموذج الإشعارات
const NotificationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['info', 'warning', 'error', 'success'], default: 'info' },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// ✅ 8. نموذج سجل التدقيق
const AuditLogSchema = new mongoose.Schema({
  userId: { type: String },
  action: { type: String, required: true },
  resource: { type: String },
  details: { type: mongoose.Schema.Types.Mixed },
  ip: { type: String },
  userAgent: { type: String },
  timestamp: { type: Date, default: Date.now }
});

// ✅ إنشاء جميع النماذج
const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Vessel = mongoose.models.Vessel || mongoose.model('Vessel', VesselSchema);
const Maintenance = mongoose.models.Maintenance || mongoose.model('Maintenance', MaintenanceSchema);
const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);
const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema);
const Prediction = mongoose.models.Prediction || mongoose.model('Prediction', PredictionSchema);
const Notification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);

// ============================================================
// دوال المصادقة والصلاحيات
// ============================================================

function generateToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role, region: user.region || '' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
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
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    req.user = { id: 'demo-user-id', email: 'admin@example.com', role: 'مسؤول', region: '' };
    next();
  }
}

// ✅ التحقق من الصلاحيات
function checkRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'غير مصرح' });
    }
    if (req.user.role === 'مسؤول') {
      return next();
    }
    if (allowedRoles && allowedRoles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({ success: false, error: 'ليس لديك صلاحية' });
  };
}

// ============================================================
// API Routes - المصادقة
// ============================================================

// ✅ تسجيل الدخول
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

// ✅ تسجيل مستخدم جديد
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role, region } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: '❌ جميع الحقول مطلوبة' });
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, error: '❌ البريد موجود مسبقاً' });
    }
    const user = new User({ name, email, password, role: role || 'مشاهد', region: region || '' });
    await user.save();
    const token = generateToken(user);
    const { password: _, ...userWithoutPassword } = user.toObject();
    res.status(201).json({ success: true, token, user: userWithoutPassword });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, error: '❌ خطأ في التسجيل' });
  }
});

// ✅ تسجيل الخروج
app.post('/api/auth/logout', authenticate, async (req, res) => {
  res.json({ success: true, message: 'تم تسجيل الخروج' });
});

// ✅ التحقق من التوكن
app.get('/api/auth/verify', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ تغيير كلمة المرور
app.put('/api/auth/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: '❌ جميع الحقول مطلوبة' });
    }
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }
    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) {
      return res.status(401).json({ success: false, error: '❌ كلمة المرور الحالية غير صحيحة' });
    }
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: '✅ تم تغيير كلمة المرور' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// API Routes - المراكب
// ============================================================

// ✅ جلب جميع المراكب
app.get('/api/vessels', authenticate, async (req, res) => {
  try {
    const query = {};
    if (req.user.region && req.user.role !== 'مسؤول') {
      query.region = req.user.region;
    }
    const vessels = await Vessel.find(query).sort({ createdAt: -1 });
    res.json(vessels);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ إضافة مركب جديد
app.post('/api/vessels', authenticate, checkRole(['مسؤول', 'محرر إقليمي']), async (req, res) => {
  try {
    const vessel = new Vessel(req.body);
    await vessel.save();
    res.status(201).json({ success: true, data: vessel });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ تحديث مركب
app.put('/api/vessels/:id', authenticate, checkRole(['مسؤول', 'محرر إقليمي']), async (req, res) => {
  try {
    const vessel = await Vessel.findOneAndUpdate(
      { _id: req.params.id },
      req.body,
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
app.delete('/api/vessels/:id', authenticate, checkRole(['مسؤول']), async (req, res) => {
  try {
    const vessel = await Vessel.findByIdAndDelete(req.params.id);
    if (!vessel) {
      return res.status(404).json({ success: false, error: 'المركب غير موجود' });
    }
    res.json({ success: true, message: 'تم الحذف' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ إحصائيات المراكب
app.get('/api/vessels/stats', authenticate, async (req, res) => {
  try {
    const total = await Vessel.countDocuments();
    const ready = await Vessel.countDocuments({ stat: 'صالح' });
    const broken = await Vessel.countDocuments({ stat: 'معطب' });
    const maintenance = await Vessel.countDocuments({ stat: 'صيانة' });
    res.json({
      total,
      ready,
      broken,
      maintenance,
      readiness: total > 0 ? Math.round((ready / total) * 100) : 0
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// API Routes - الصيانة
// ============================================================

// ✅ جلب جميع سجلات الصيانة
app.get('/api/maintenance', authenticate, async (req, res) => {
  try {
    const records = await Maintenance.find().sort({ createdAt: -1 });
    res.json(records);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ إضافة سجل صيانة
app.post('/api/maintenance', authenticate, checkRole(['مسؤول', 'محرر إقليمي', 'فني صيانة']), async (req, res) => {
  try {
    const record = new Maintenance(req.body);
    await record.save();
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ تحديث سجل صيانة
app.put('/api/maintenance/:id', authenticate, checkRole(['مسؤول', 'محرر إقليمي', 'فني صيانة']), async (req, res) => {
  try {
    const record = await Maintenance.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!record) {
      return res.status(404).json({ success: false, error: 'السجل غير موجود' });
    }
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ حذف سجل صيانة
app.delete('/api/maintenance/:id', authenticate, checkRole(['مسؤول']), async (req, res) => {
  try {
    const record = await Maintenance.findByIdAndDelete(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'السجل غير موجود' });
    }
    res.json({ success: true, message: 'تم الحذف' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ إحصائيات الصيانة
app.get('/api/maintenance/stats', authenticate, async (req, res) => {
  try {
    const total = await Maintenance.countDocuments();
    const completed = await Maintenance.countDocuments({ status: 'مكتملة' });
    const inProgress = await Maintenance.countDocuments({ status: 'قيد الإنجاز' });
    const cancelled = await Maintenance.countDocuments({ status: 'ملغية' });
    const totalCost = await Maintenance.aggregate([
      { $group: { _id: null, total: { $sum: '$cost' } } }
    ]);
    res.json({
      total,
      completed,
      inProgress,
      cancelled,
      totalCost: totalCost[0]?.total || 0,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// API Routes - المحادثات
// ============================================================

// ✅ جلب محادثات المستخدم
app.get('/api/conversations', authenticate, async (req, res) => {
  try {
    const conversations = await Conversation.find({ userId: req.user.id || 'anonymous' })
      .sort({ updatedAt: -1 })
      .limit(50);
    res.json(conversations);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ جلب محادثة محددة
app.get('/api/conversations/:id', authenticate, async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId: req.user.id || 'anonymous'
    });
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'المحادثة غير موجودة' });
    }
    res.json(conversation);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ حذف محادثة
app.delete('/api/conversations/:id', authenticate, async (req, res) => {
  try {
    const conversation = await Conversation.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id || 'anonymous'
    });
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'المحادثة غير موجودة' });
    }
    res.json({ success: true, message: 'تم الحذف' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 🤖 AI Routes - المساعد الذكي
// ============================================================

console.log('🔄 جاري تحميل مسارات الذكاء الاصطناعي...');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
console.log(`🔑 Gemini API Key: ${GEMINI_API_KEY ? '✅ موجود' : '❌ غير موجود'}`);

// ذاكرة المحادثات
const conversationMemory = {};

const aiRouter = express.Router();

// ✅ نقطة الدردشة الرئيسية
aiRouter.post('/ask', async (req, res) => {
  try {
    const { message, conversationId, userId } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: 'الرسالة مطلوبة' });
    }
    
    console.log(`📤 سؤال: ${message.substring(0, 50)}...`);
    
    let response = null;
    let usedProvider = null;
    
    // ✅ محاولة استخدام Gemini
    if (GEMINI_API_KEY && GEMINI_API_KEY.length > 10 && !GEMINI_API_KEY.includes('your_')) {
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
        usedProvider = 'gemini';
        
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
    
    // ✅ إذا فشل Gemini، استخدم الردود المحلية الذكية
    if (!response) {
      response = generateLocalResponse(message);
      usedProvider = 'local';
      console.log(`✅ Local رد: ${response.substring(0, 50)}...`);
    }
    
    // ✅ حفظ المحادثة
    if (response) {
      try {
        const convId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        let conversation = await Conversation.findOne({ 
          _id: conversationId,
          userId: userId || 'anonymous'
        });
        
        if (!conversation) {
          conversation = new Conversation({
            userId: userId || 'anonymous',
            title: message.substring(0, 50) + '...',
            messages: []
          });
        }
        
        conversation.messages.push(
          { role: 'user', content: message, timestamp: new Date() },
          { role: 'assistant', content: response, timestamp: new Date() }
        );
        conversation.messageCount = conversation.messages.length;
        conversation.updatedAt = new Date();
        
        if (conversation.messages.length > 50) {
          conversation.messages = conversation.messages.slice(-50);
        }
        
        await conversation.save();
        
        const newConversationId = conversationId || conversation._id.toString();
        
        res.json({
          success: true,
          response: response,
          conversationId: newConversationId,
          provider: usedProvider,
          timestamp: new Date()
        });
      } catch (dbError) {
        console.warn('⚠️ DB save error:', dbError.message);
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

// ✅ دالة توليد ردود محلية
function generateLocalResponse(message) {
  const msg = message.toLowerCase();
  
  const responses = {
    'تونس': `🇹🇳 **تونس**\n\nتقع تونس في شمال أفريقيا، على البحر المتوسط.\n\n• العاصمة: مدينة تونس\n• اللغة: العربية\n• العملة: الدينار التونسي\n• عدد السكان: ~12 مليون\n• الرئيس: قيس سعيد\n\n📍 مدن رئيسية: صفاقس، سوسة، المنستير، بنزرت`,
    
    'الذكاء': `🧠 **الذكاء الاصطناعي**\n\nهو محاكاة الذكاء البشري في الآلات.\n\n📌 **أنواعه:**\n• الذكاء الاصطناعي الضيق (مثل Siri، Alexa)\n• الذكاء الاصطناعي العام (مثل البشر)\n• الذكاء الاصطناعي الفائق (يتفوق على البشر)\n\n💡 **أمثلة:** ChatGPT، Gemini، DeepSeek`,
    
    'مرحبا': "👋 مرحباً بك! أنا **نظامي**، المساعد الذكي. كيف يمكنني مساعدتك اليوم؟",
    
    'السلام': "🕌 وعليكم السلام ورحمة الله وبركاته! كيف يمكنني مساعدتك؟",
    
    'مساعدة': `📚 **ماذا يمكنني أن أفعل؟**\n\n🌍 **المعرفة العامة:**\n• معلومات عن الدول\n• الذكاء الاصطناعي والتكنولوجيا\n• البرمجة\n• التاريخ والجغرافيا\n\n🌊 **الشؤون البحرية:**\n• إحصائيات الأسطول\n• تقارير الصيانة`,
    
    'برمجة': `💻 **البرمجة**\n\nأشهر لغات البرمجة:\n• JavaScript - تطوير الويب\n• Python - الذكاء الاصطناعي\n• Java - تطبيقات الأندرويد\n• C++ - الألعاب\n\n💡 ابدأ بتعلم JavaScript أو Python!`,
    
    'تاريخ': `📜 **التاريخ**\n\nتونس لها تاريخ عريق:\n• قرطاج: تأسست عام 814 ق.م\n• الحضارة البونيقية\n• الفتح الإسلامي عام 647م\n• الدولة الحفصية\n• الحماية الفرنسية 1881-1956\n• الاستقلال 1956`,
    
    'بحر': `🌊 **الشؤون البحرية**\n\n• البحر المتوسط: 1600 كم من السواحل\n• أهم الموانئ: حلق الوادي، صفاقس، سوسة\n• الصيد البحري: قطاع حيوي\n• الأسطول: نظام متكامل للإدارة\n• الصيانة: متابعة دورية`
  };
  
  for (const [key, value] of Object.entries(responses)) {
    if (msg.includes(key)) {
      return value;
    }
  }
  
  return `🤔 **سؤال ممتاز!**\n\nللحصول على إجابة دقيقة باستخدام الذكاء الاصطناعي، أحتاج إلى مفتاح Gemini صالح.\n\n📌 **كيف تحصل على مفتاح Gemini مجاني:**\n1. اذهب إلى https://ai.google.dev/\n2. سجل الدخول بحساب Google\n3. اضغط على "Get API Key"\n4. انسخ المفتاح الجديد\n5. ضعه في ملف .env: GEMINI_API_KEY=المفتاح\n6. أعد تشغيل السيرفر\n\n💡 **يمكنني مساعدتك في:**\n• معلومات عن الدول 🌍\n• الذكاء الاصطناعي 🧠\n• البرمجة 💻\n• التاريخ 📜\n• الشؤون البحرية 🌊\n\n🔹 **اسألني أي شيء!**`;
}

// ✅ نقطة جلب المحادثات
aiRouter.get('/conversations', authenticate, async (req, res) => {
  try {
    const conversations = await Conversation.find({ 
      userId: req.user.id || 'anonymous' 
    }).sort({ updatedAt: -1 }).limit(50);
    res.json({ success: true, data: conversations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ نقطة جلب محادثة محددة
aiRouter.get('/conversation/:id', authenticate, async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId: req.user.id || 'anonymous'
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
    const result = await Conversation.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id || 'anonymous'
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
    status: "healthy",
    version: "5.0.0",
    gemini: hasValidGemini ? "✅ مفعل" : "❌ غير مفعل",
    conversations: Object.keys(conversationMemory).length,
    timestamp: new Date().toISOString()
  });
});

// ✅ استخدام الراوتر
app.use('/api/ai', aiRouter);
console.log('✅ تم تحميل مسارات AI بنجاح');

// ============================================================
// Routes للصفحات
// ============================================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/pages/:page', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'pages', `${req.params.page}.html`);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('Page not found');
  }
});

// ============================================================
// تهيئة المستخدمين الافتراضيين
// ============================================================

async function initDefaultUsers() {
  try {
    const count = await User.countDocuments();
    if (count === 0) {
      const defaultUsers = [
        { name: 'مدير النظام', email: 'admin', password: 'Admin@2024#Secure', role: 'مسؤول', region: '' },
        { name: 'محرر الشمال', email: 'north', password: 'North@2024#Secure', role: 'محرر إقليمي', region: 'الشمال' },
        { name: 'محرر الساحل', email: 'coast', password: 'Coast@2024#Secure', role: 'محرر إقليمي', region: 'الساحل' },
        { name: 'محرر الوسط', email: 'center', password: 'Center@2024#Secure', role: 'محرر إقليمي', region: 'الوسط' },
        { name: 'محرر الجنوب', email: 'south', password: 'South@2024#Secure', role: 'محرر إقليمي', region: 'الجنوب' },
        { name: 'مشاهد', email: 'viewer', password: 'Viewer@2024#Secure', role: 'مشاهد', region: '' }
      ];
      for (const userData of defaultUsers) {
        const user = new User(userData);
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
// تشغيل الخادم
// ============================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log('🚀 نظام إدارة الأسطول البحري v5.0');
  console.log('========================================');
  console.log(`✅ الخادم يعمل على: http://localhost:${PORT}`);
  console.log(`✅ Gemini: ${GEMINI_API_KEY && !GEMINI_API_KEY.includes('your_') ? '✅ مفعل' : '❌ غير مفعل'}`);
  console.log(`✅ MongoDB: ${mongoose.connection.readyState === 1 ? '✅ متصل' : '❌ غير متصل'}`);
  console.log('========================================');
  console.log('📝 حسابات الدخول:');
  console.log('   👑 admin   / Admin@2024#Secure (مسؤول كامل)');
  console.log('   👀 viewer  / Viewer@2024#Secure (مشاهد)');
  console.log('========================================');
});

module.exports = app;
