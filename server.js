// ============================================================
// 🚀 نظام إدارة الأسطول البحري - server.js
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

// ============================================================
// الملفات الثابتة
// ============================================================

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
// نماذج البيانات
// ============================================================

// ✅ نموذج المستخدم
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

// ✅ نموذج المركب
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

// ✅ نموذج الصيانة
const MaintenanceSchema = new mongoose.Schema({
  vesselName: { type: String },
  type: { type: String, enum: ['كبرى', 'دورية', 'عادية', 'طارئة'], default: 'عادية' },
  technician: { type: String, required: true },
  description: { type: String, required: true },
  cost: { type: Number, default: 0 },
  status: { type: String, enum: ['قيد الإنجاز', 'مكتملة', 'ملغية'], default: 'قيد الإنجاز' },
  createdAt: { type: Date, default: Date.now }
});

// ✅ نموذج المحادثة
const ConversationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  title: { type: String, default: 'محادثة جديدة' },
  messages: [{
    role: { type: String, enum: ['user', 'assistant'] },
    content: { type: String },
    timestamp: { type: Date, default: Date.now }
  }],
  messageCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ✅ إنشاء النماذج
const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Vessel = mongoose.models.Vessel || mongoose.model('Vessel', VesselSchema);
const Maintenance = mongoose.models.Maintenance || mongoose.model('Maintenance', MaintenanceSchema);
const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);

// ============================================================
// دوال المصادقة
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

// ============================================================
// API Routes
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

// ✅ جلب المراكب
app.get('/api/vessels', authenticate, async (req, res) => {
  try {
    const vessels = await Vessel.find().sort({ createdAt: -1 });
    res.json(vessels);
  } catch (error) {
    res.status(500).json([]);
  }
});

// ✅ جلب الصيانة
app.get('/api/maintenance', authenticate, async (req, res) => {
  try {
    const records = await Maintenance.find().sort({ createdAt: -1 });
    res.json(records);
  } catch (error) {
    res.status(500).json([]);
  }
});

// ✅ إحصائيات المراكب
app.get('/api/vessels/stats', authenticate, async (req, res) => {
  try {
    const total = await Vessel.countDocuments();
    const ready = await Vessel.countDocuments({ stat: 'صالح' });
    const broken = await Vessel.countDocuments({ stat: 'معطب' });
    const maintenance = await Vessel.countDocuments({ stat: 'صيانة' });
    res.json({ total, ready, broken, maintenance });
  } catch (error) {
    res.status(500).json({ total: 0, ready: 0, broken: 0, maintenance: 0 });
  }
});

// ✅ إضافة مركب
app.post('/api/vessels', authenticate, async (req, res) => {
  try {
    const vessel = new Vessel(req.body);
    await vessel.save();
    res.status(201).json(vessel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ تحديث مركب
app.put('/api/vessels/:id', authenticate, async (req, res) => {
  try {
    const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
    res.json(vessel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ حذف مركب
app.delete('/api/vessels/:id', authenticate, async (req, res) => {
  try {
    const vessel = await Vessel.findByIdAndDelete(req.params.id);
    if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ إضافة سجل صيانة
app.post('/api/maintenance', authenticate, async (req, res) => {
  try {
    const record = new Maintenance(req.body);
    await record.save();
    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// 🤖 AI Routes
// ============================================================

console.log('🔄 جاري تحميل مسارات الذكاء الاصطناعي...');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
console.log(`🔑 Gemini API Key: ${GEMINI_API_KEY ? '✅ موجود' : '❌ غير موجود'}`);

const conversationMemory = {};

const aiRouter = express.Router();

aiRouter.post('/ask', async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: 'الرسالة مطلوبة' });
    }
    
    console.log(`📤 سؤال: ${message.substring(0, 50)}...`);
    
    let response = null;
    
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
    
    // ✅ إذا فشل Gemini، استخدم الردود المحلية
    if (!response) {
      const msg = message.toLowerCase();
      
      if (msg.includes('تونس') || msg.includes('اين تونس')) {
        response = `🇹🇳 **تونس**\n\nتقع تونس في شمال أفريقيا، على البحر المتوسط.\n\n• العاصمة: مدينة تونس\n• اللغة: العربية\n• العملة: الدينار التونسي\n• عدد السكان: ~12 مليون\n• الرئيس: قيس سعيد\n\n📍 مدن رئيسية: صفاقس، سوسة، المنستير، بنزرت`;
      } else if (msg.includes('الذكاء') || msg.includes('AI') || msg.includes('ذكاء')) {
        response = `🧠 **الذكاء الاصطناعي**\n\nهو محاكاة الذكاء البشري في الآلات.\n\n📌 **أنواعه:**\n• الذكاء الاصطناعي الضيق (مثل Siri، Alexa)\n• الذكاء الاصطناعي العام (مثل البشر)\n• الذكاء الاصطناعي الفائق (يتفوق على البشر)\n\n💡 **أمثلة:** ChatGPT، Gemini، DeepSeek`;
      } else if (msg.includes('مرحبا') || msg.includes('السلام') || msg.includes('اهلاً')) {
        response = "👋 مرحباً بك! أنا **نظامي**، المساعد الذكي. كيف يمكنني مساعدتك اليوم؟";
      } else if (msg.includes('مساعدة') || msg.includes('help')) {
        response = `📚 **ماذا يمكنني أن أفعل؟**\n\n🌍 **المعرفة العامة:**\n• معلومات عن الدول\n• الذكاء الاصطناعي والتكنولوجيا\n• البرمجة\n• التاريخ والجغرافيا\n\n🌊 **الشؤون البحرية:**\n• إحصائيات الأسطول\n• تقارير الصيانة`;
      } else if (msg.includes('برمجة') || msg.includes('كود')) {
        response = `💻 **البرمجة**\n\nأشهر لغات البرمجة:\n• JavaScript - تطوير الويب\n• Python - الذكاء الاصطناعي\n• Java - تطبيقات الأندرويد\n• C++ - الألعاب\n\n💡 ابدأ بتعلم JavaScript أو Python!`;
      } else if (msg.includes('تاريخ') || msg.includes('تاريخ تونس')) {
        response = `📜 **التاريخ**\n\nتونس لها تاريخ عريق:\n• قرطاج: تأسست عام 814 ق.م\n• الحضارة البونيقية\n• الفتح الإسلامي عام 647م\n• الدولة الحفصية\n• الحماية الفرنسية 1881-1956\n• الاستقلال 1956`;
      } else if (msg.includes('بحر') || msg.includes('بحري') || msg.includes('أسطول')) {
        const vessels = await Vessel.find().countDocuments();
        const maintenance = await Maintenance.find().countDocuments();
        response = `🌊 **الشؤون البحرية**\n\n• البحر المتوسط: 1600 كم من السواحل\n• أهم الموانئ: حلق الوادي، صفاقس، سوسة\n• الصيد البحري: قطاع حيوي\n• الأسطول: ${vessels || 0} مركب\n• الصيانة: ${maintenance || 0} سجل`;
      } else {
        response = `🤔 **سؤال ممتاز!**\n\nللحصول على إجابة دقيقة، أحتاج إلى مفتاح Gemini صالح.\n\n📌 **كيف تحصل على مفتاح Gemini مجاني:**\n1. اذهب إلى https://ai.google.dev/\n2. سجل الدخول بحساب Google\n3. اضغط على "Get API Key"\n4. انسخ المفتاح الجديد\n5. ضعه في ملف .env: GEMINI_API_KEY=المفتاح\n6. أعد تشغيل السيرفر\n\n💡 **يمكنني مساعدتك في:**\n• معلومات عن الدول\n• الذكاء الاصطناعي\n• البرمجة\n• وأي شيء آخر!`;
      }
    }
    
    const newConversationId = conversationId || 'conv_' + Date.now().toString(36);
    
    res.json({
      success: true,
      response: response,
      conversationId: newConversationId,
      provider: response ? 'gemini' : 'local',
      version: "5.0.0"
    });
  } catch (error) {
    console.error('❌ AI Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      response: "❌ حدث خطأ. يرجى المحاولة مرة أخرى."
    });
  }
});

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

app.use('/api/ai', aiRouter);
console.log('✅ تم تحميل مسارات AI بنجاح');

// ============================================================
// 📄 Page Routes - الصفحات الرئيسية
// ============================================================

// ✅ الصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ جميع الصفحات في مجلد pages
app.get('/pages/:page', (req, res) => {
  const pageName = req.params.page;
  const filePath = path.join(__dirname, 'public', 'pages', `${pageName}.html`);
  
  console.log(`📄 Loading page: ${pageName}`);
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    // ✅ إذا لم توجد الصفحة، أنشئها تلقائياً
    const defaultPage = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageName}</title>
    <link rel="stylesheet" href="/css/style.css">
    <style>
        body { 
            background: #0a0a12; 
            color: white; 
            font-family: 'Tajawal', sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
        }
        .page-container {
            max-width: 600px;
            width: 100%;
            background: rgba(255,255,255,0.02);
            border-radius: 20px;
            padding: 40px;
            border: 1px solid rgba(255,255,255,0.05);
            text-align: center;
        }
        h1 { color: #60a5fa; font-size: 28px; margin-bottom: 10px; }
        p { color: rgba(255,255,255,0.5); }
        .icon { font-size: 64px; display: block; margin: 20px 0; }
        .btn {
            display: inline-block;
            padding: 12px 30px;
            background: rgba(14,165,233,0.15);
            border: 1px solid rgba(14,165,233,0.3);
            border-radius: 12px;
            color: #60a5fa;
            text-decoration: none;
            margin-top: 20px;
        }
        .btn:hover { background: rgba(14,165,233,0.25); }
    </style>
</head>
<body>
    <div class="page-container">
        <span class="icon">📄</span>
        <h1>${pageName}</h1>
        <p>هذه الصفحة قيد الإنشاء</p>
        <p style="font-size:12px; color:rgba(255,255,255,0.2);">public/pages/${pageName}.html</p>
        <a href="/" class="btn">🏠 العودة للرئيسية</a>
    </div>
</body>
</html>
    `;
    fs.writeFileSync(filePath, defaultPage);
    res.send(defaultPage);
  }
});

// ✅ روابط مختصرة للصفحات الرئيسية
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'dashboard.html'));
});

app.get('/fleet', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'fleet.html'));
});

app.get('/maintenance', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'maintenance.html'));
});

app.get('/readiness', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'readiness.html'));
});

app.get('/users', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'users.html'));
});

app.get('/ai-assistant', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'ai-assistant.html'));
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
  console.log('📄 الصفحات المتاحة:');
  console.log('   /dashboard    - لوحة التحكم');
  console.log('   /fleet        - الأسطول');
  console.log('   /maintenance  - الصيانة');
  console.log('   /readiness    - الجاهزية');
  console.log('   /users        - المستخدمين');
  console.log('   /ai-assistant - المساعد الذكي');
  console.log('========================================');
});

module.exports = app;
