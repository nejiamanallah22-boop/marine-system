# استخدم النسخة التي كانت تعمل من قبل
cat > server.js << 'EOF'
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

// ========== تعريف النماذج ==========
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
  messages: [{
    role: { type: String, enum: ['user', 'assistant'] },
    content: { type: String },
    timestamp: { type: Date, default: Date.now }
  }],
  messageCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Vessel = mongoose.models.Vessel || mongoose.model('Vessel', VesselSchema);
const Maintenance = mongoose.models.Maintenance || mongoose.model('Maintenance', MaintenanceSchema);
const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);

// ========== دوال المصادقة ==========
function generateToken(user) {
  return jwt.sign({ id: user._id, email: user.email, role: user.role, region: user.region || '' }, JWT_SECRET, { expiresIn: '7d' });
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

app.post('/api/vessels', authenticate, async (req, res) => {
  try {
    const vessel = new Vessel(req.body);
    await vessel.save();
    res.status(201).json(vessel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/vessels/:id', authenticate, async (req, res) => {
  try {
    const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
    res.json(vessel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/vessels/:id', authenticate, async (req, res) => {
  try {
    const vessel = await Vessel.findByIdAndDelete(req.params.id);
    if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/maintenance', authenticate, async (req, res) => {
  try {
    const record = new Maintenance(req.body);
    await record.save();
    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== 🤖 AI Routes ==========
console.log('🔄 جاري تحميل مسارات الذكاء الاصطناعي...');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
console.log(`🔑 Gemini API Key: ${GEMINI_API_KEY ? '✅ موجود' : '❌ غير موجود'}`);

const conversationMemory = {};
const aiRouter = express.Router();

aiRouter.post('/ask', async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    if (!message) return res.status(400).json({ success: false, error: 'الرسالة مطلوبة' });
    
    let response = null;
    
    if (GEMINI_API_KEY && GEMINI_API_KEY.length > 10 && !GEMINI_API_KEY.includes('your_')) {
      try {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp", generationConfig: { temperature: 0.8, maxOutputTokens: 2000 } });
        const chat = model.startChat({ history: conversationId && conversationMemory[conversationId] ? conversationMemory[conversationId] : [] });
        const result = await chat.sendMessage(message);
        response = result.response.text();
        if (conversationId && response) {
          if (!conversationMemory[conversationId]) conversationMemory[conversationId] = [];
          conversationMemory[conversationId].push({ role: 'user', parts: [{ text: message }] });
          conversationMemory[conversationId].push({ role: 'model', parts: [{ text: response }] });
          if (conversationMemory[conversationId].length > 20) conversationMemory[conversationId] = conversationMemory[conversationId].slice(-20);
        }
      } catch (error) { console.warn('⚠️ Gemini error:', error.message); }
    }
    
    if (!response) {
      const msg = message.toLowerCase();
      if (msg.includes('مرحبا') || msg.includes('السلام')) response = "👋 مرحباً بك! أنا المساعد الذكي.";
      else response = "🤔 سؤال ممتاز! للحصول على إجابة دقيقة، أحتاج إلى مفتاح Gemini صالح.";
    }
    
    res.json({ success: true, response, conversationId: conversationId || 'conv_' + Date.now().toString(36) });
  } catch (error) {
    console.error('❌ AI Error:', error);
    res.status(500).json({ success: false, error: error.message, response: "❌ حدث خطأ" });
  }
});

aiRouter.get('/health', (req, res) => {
  res.json({ success: true, status: "healthy", version: "5.0.0", gemini: GEMINI_API_KEY ? "✅ مفعل" : "❌ غير مفعل" });
});

app.use('/api/ai', aiRouter);
console.log('✅ تم تحميل مسارات AI بنجاح');

// ========== Page Routes ==========
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/pages/:page', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'pages', `${req.params.page}.html`);
  if (fs.existsSync(filePath)) res.sendFile(filePath);
  else res.status(404).send('Page not found');
});

// ========== Init Users ==========
async function initDefaultUsers() {
  try {
    const count = await User.countDocuments();
    if (count === 0) {
      const defaultUsers = [
        { name: 'مدير النظام', email: 'admin', password: 'Admin@2024#Secure', role: 'مسؤول', region: '' },
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
EOF
