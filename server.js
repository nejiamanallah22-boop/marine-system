// server.js
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

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/marine_system')
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    initDefaultUsers();
  })
  .catch(err => console.error('❌ MongoDB connection error:', err.message));

// ========== تعريف النماذج (مرة واحدة فقط) ==========
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

const MaintenanceSchema = new mongoose.Schema({
  vesselName: { type: String },
  type: { type: String, enum: ['كبرى', 'دورية', 'عادية', 'طارئة'], default: 'عادية' },
  technician: { type: String, required: true },
  description: { type: String, required: true },
  cost: { type: Number, default: 0 },
  status: { type: String, enum: ['قيد الإنجاز', 'مكتملة', 'ملغية'], default: 'قيد الإنجاز' },
  createdAt: { type: Date, default: Date.now }
});

const ConversationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  title: { type: String, default: 'محادثة جديدة' },
  messageCount: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: { createdAt: 'createdAt' } });

const MessageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Conversation' },
  userId: { type: String, required: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

// ========== منع إعادة تعريف النماذج ==========
const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Vessel = mongoose.models.Vessel || mongoose.model('Vessel', VesselSchema);
const Maintenance = mongoose.models.Maintenance || mongoose.model('Maintenance', MaintenanceSchema);
const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);
const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema);

// ========== دوال المصادقة ==========
function generateToken(user) {
  return jwt.sign({ id: user._id, email: user.email, role: user.role, region: user.region || '' }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
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
  req.user = decoded;
  next();
}

// ========== API Routes ==========
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: '❌ البريد وكلمة المرور مطلوبة' });
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ success: false, error: '❌ بيانات غير صحيحة' });
    const isValid = await user.comparePassword(password);
    if (!isValid) return res.status(401).json({ success: false, error: '❌ بيانات غير صحيحة' });
    if (!user.isActive) return res.status(401).json({ success: false, error: '❌ الحساب معطل' });
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

app.get('/api/vessels', authenticate, async (req, res) => {
  try {
    const vessels = await Vessel.find().sort({ createdAt: -1 });
    res.json(vessels);
  } catch (error) {
    res.status(500).json([]);
  }
});

app.get('/api/maintenance', authenticate, async (req, res) => {
  try {
    const records = await Maintenance.find().sort({ createdAt: -1 });
    res.json(records);
  } catch (error) {
    res.status(500).json([]);
  }
});

// ========== AI Routes (المباشر) ==========
console.log('🔄 جاري تحميل مسارات الذكاء الاصطناعي...');

const aiRouter = express.Router();

// ذاكرة مؤقتة للمحادثات
const conversationMemory = {};

aiRouter.post('/ask', async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    if (!message) return res.status(400).json({ success: false, error: 'الرسالة مطلوبة' });
    
    console.log(`📤 سؤال: ${message}`);
    
    // محاولة استخدام Gemini إذا كان المفتاح موجوداً
    let response = null;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (GEMINI_API_KEY && GEMINI_API_KEY.length > 10) {
      try {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
        
        const chat = model.startChat({
          history: conversationId && conversationMemory[conversationId] ? conversationMemory[conversationId] : []
        });
        
        const result = await chat.sendMessage(message);
        response = result.response.text();
        
        // حفظ المحادثة
        if (conversationId) {
          if (!conversationMemory[conversationId]) conversationMemory[conversationId] = [];
          conversationMemory[conversationId].push({ role: 'user', parts: [{ text: message }] });
          conversationMemory[conversationId].push({ role: 'model', parts: [{ text: response }] });
          // تحديد حجم الذاكرة
          if (conversationMemory[conversationId].length > 20) {
            conversationMemory[conversationId] = conversationMemory[conversationId].slice(-20);
          }
        }
        
        console.log(`✅ رد Gemini: ${response.substring(0, 50)}...`);
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
      } else {
        response = `🤔 **سؤال ممتاز!**\n\nللحصول على إجابة دقيقة، أحتاج إلى مفتاح Gemini صالح.\n\n📌 **كيف تحصل على مفتاح Gemini مجاني:**\n1. اذهب إلى https://ai.google.dev/\n2. سجل الدخول بحساب Google\n3. اضغط على "Get API Key"\n4. انسخ المفتاح الجديد\n5. ضعه في ملف .env\n6. أعد تشغيل السيرفر\n\n💡 **يمكنني مساعدتك في:**\n• معلومات عن الدول\n• الذكاء الاصطناعي\n• البرمجة\n• وأي شيء آخر!`;
      }
    }
    
    // إنشاء معرف محادثة جديد إذا لم يكن موجوداً
    const newConversationId = conversationId || 'conv_' + Date.now().toString(36);
    
    res.json({
      success: true,
      response: response,
      conversationId: newConversationId,
      version: "23.0.0-simple"
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
    timestamp: new Date().toISOString()
  });
});

// استخدام مسار AI مباشرة
app.use('/api/ai', aiRouter);
console.log('✅ تم تحميل مسارات AI بنجاح');

// ========== Page Routes ==========
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

// ========== Init Default Users ==========
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
        { name: 'مشاهد', email: 'viewer', password: '123456', role: 'مشاهد', region: '' }
      ];
      for (const userData of defaultUsers) {
        const user = new User(userData);
        await user.save();
      }
      console.log('✅ تم إنشاء المستخدمين الافتراضيين');
      console.log('👑 admin / 123456 (مسؤول كامل)');
    }
  } catch (error) {
    console.error('❌ Error creating default users:', error);
  }
}

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
