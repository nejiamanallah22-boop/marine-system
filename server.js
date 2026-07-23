const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

dotenv.config();

const app = express();
const server = http.createServer(app);

// ============================================================
// ✅ استخدام قيم افتراضية
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-key-change-this';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vessel_db';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@system.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';
const PORT = process.env.PORT || 3000;

console.log('========================================');
console.log('🚀 Starting server...');
console.log(`📧 Admin: ${ADMIN_EMAIL}`);
console.log('========================================');

// ============================================================
// ✅ CORS
// ============================================================
app.use(cors({
  origin: '*',
  credentials: true
}));

// ============================================================
// ✅ Helmet مع CSP مفتوح (للسماح بكل المصادر)
// ============================================================
app.use(helmet({
  contentSecurityPolicy: false, // ✅ تعطيل CSP تماماً
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false
}));

// ============================================================
// ✅ Compression
// ============================================================
app.use(compression());

// ============================================================
// ✅ Logging
// ============================================================
app.use(morgan('dev'));

// ============================================================
// ✅ Body Parser
// ============================================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================================
// ✅ حل مشكلة MIME types - الأهم!!!
// ============================================================
app.use((req, res, next) => {
  const url = req.url;
  if (url.endsWith('.css')) {
    res.setHeader('Content-Type', 'text/css');
  } else if (url.endsWith('.js')) {
    res.setHeader('Content-Type', 'application/javascript');
  } else if (url.endsWith('.json')) {
    res.setHeader('Content-Type', 'application/json');
  } else if (url.endsWith('.png')) {
    res.setHeader('Content-Type', 'image/png');
  } else if (url.endsWith('.jpg') || url.endsWith('.jpeg')) {
    res.setHeader('Content-Type', 'image/jpeg');
  } else if (url.endsWith('.svg')) {
    res.setHeader('Content-Type', 'image/svg+xml');
  } else if (url.endsWith('.ico')) {
    res.setHeader('Content-Type', 'image/x-icon');
  } else if (url.endsWith('.map')) {
    res.setHeader('Content-Type', 'application/json');
  }
  next();
});

// ============================================================
// ✅ Static Files
// ============================================================
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (filePath.endsWith('.map')) {
      res.setHeader('Content-Type', 'application/json');
    }
  }
}));

// ============================================================
// ✅ Rate Limiting
// ============================================================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: '⚠️ تجاوزت الحد المسموح للطلبات' }
});
app.use('/api', limiter);

// ============================================================
// 🗄️ MongoDB
// ============================================================
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.log('❌ MongoDB Error:', err.message));

// ============================================================
// 📊 النماذج
// ============================================================
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  pass: { type: String, required: true, select: false },
  role: { type: String, enum: ['مسؤول', 'محرر', 'مستخدم'], default: 'مستخدم' },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date }
}, { timestamps: true });

const VesselSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  num: { type: String, trim: true },
  len: { type: Number, default: 0 },
  cat: { type: String, default: 'زوارق مزدوجة' },
  reg: { type: String, trim: true },
  zone: { type: String, trim: true },
  port: { type: String, trim: true },
  supp: { type: String, trim: true },
  stat: { type: String, enum: ['صالح', 'معطب', 'صيانة'], default: 'صالح' },
  break: { type: String, trim: true },
  fDate: { type: String },
  eDate: { type: String },
  ref: { type: String, trim: true }
}, { timestamps: true });

const TicketSchema = new mongoose.Schema({
  userName: { type: String, required: true },
  userRole: { type: String, required: true },
  subject: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  status: { type: String, enum: ['قيد المعالجة', 'تم الرد', 'مغلقة'], default: 'قيد المعالجة' },
  replies: [{
    adminName: String,
    reply: String,
    date: String,
    time: String
  }]
}, { timestamps: true });

const LogSchema = new mongoose.Schema({
  userName: { type: String, required: true },
  userRole: { type: String, required: true },
  action: { type: String, required: true },
  details: { type: String, required: true },
  date: { type: String, required: true },
  time: { type: String, required: true }
}, { timestamps: true });

const LocationSchema = new mongoose.Schema({
  userName: { type: String, required: true },
  userRole: { type: String, required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
  action: { type: String, default: 'تحديث موقع' },
  device: { type: String },
  browser: { type: String },
  ip: { type: String }
}, { timestamps: true });

const NoteVerbaleSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  week: { type: String, required: true },
  createdBy: { type: String, required: true },
  userRole: { type: String, required: true },
  type: { type: String, default: 'text' },
  imageData: { type: String, default: '' },
  attachments: [{
    name: String,
    type: String,
    data: String
  }]
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Vessel = mongoose.model('Vessel', VesselSchema);
const Ticket = mongoose.model('Ticket', TicketSchema);
const Log = mongoose.model('Log', LogSchema);
const Location = mongoose.model('Location', LocationSchema);
const NoteVerbale = mongoose.model('NoteVerbale', NoteVerbaleSchema);

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

function extractDevice(userAgent) {
  if (!userAgent) return 'غير معروف';
  const ua = userAgent.toLowerCase();
  if (ua.includes('android')) return 'Android';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('macintosh')) return 'Mac';
  if (ua.includes('linux')) return 'Linux';
  return 'غير معروف';
}

function extractBrowser(userAgent) {
  if (!userAgent) return 'غير معروف';
  const ua = userAgent.toLowerCase();
  if (ua.includes('edg') || ua.includes('edge')) return 'Edge';
  if (ua.includes('opera') || ua.includes('opr')) return 'Opera';
  if (ua.includes('chrome')) return 'Chrome';
  if (ua.includes('firefox')) return 'Firefox';
  if (ua.includes('safari')) return 'Safari';
  return 'غير معروف';
}

// ============================================================
// 🔐 Middleware
// ============================================================
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-pass');
    
    if (!user) {
      return res.status(401).json({ error: 'المستخدم غير موجود' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'الحساب غير مفعل' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'انتهت صلاحية الجلسة' });
    }
    res.status(401).json({ error: 'توكن غير صالح' });
  }
};

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'غير مصرح لك بهذه العملية' });
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
// 🚪 Routes
// ============================================================

// ----- Login -----
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email: email.toLowerCase() }).select('+pass');
    if (!user) {
      return res.status(401).json({ error: 'بيانات غير صحيحة' });
    }

    const isMatch = await bcrypt.compare(password, user.pass);
    if (!isMatch) {
      return res.status(401).json({ error: 'بيانات غير صحيحة' });
    }

    user.lastLogin = new Date();
    await user.save();

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
    res.status(500).json({ error: error.message });
  }
});

// ----- Register -----
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'البريد الإلكتروني موجود' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      name,
      email: email.toLowerCase(),
      pass: hashedPassword,
      role: role || 'مستخدم'
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الحساب',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----- Get Current User -----
app.get('/api/auth/me', authenticate, async (req, res) => {
  res.json({ success: true, user: req.user });
});

// ----- Vessels -----
app.get('/api/vessels', authenticate, async (req, res) => {
  try {
    const vessels = await Vessel.find().sort({ createdAt: -1 });
    res.json(vessels);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vessels', authenticate, authorize('مسؤول', 'محرر'), async (req, res) => {
  try {
    const data = req.body;
    data.cat = determineCategory(data.len);
    const vessel = new Vessel(data);
    await vessel.save();
    res.status(201).json(vessel);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/vessels/:id', authenticate, authorize('مسؤول', 'محرر'), async (req, res) => {
  try {
    const data = req.body;
    data.cat = determineCategory(data.len);
    const vessel = await Vessel.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
    res.json(vessel);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/vessels/:id', authenticate, authorize('مسؤول'), async (req, res) => {
  try {
    const vessel = await Vessel.findByIdAndDelete(req.params.id);
    if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
    res.json({ message: 'تم الحذف' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----- Tickets -----
app.get('/api/tickets', authenticate, async (req, res) => {
  try {
    const tickets = await Ticket.find().sort({ createdAt: -1 });
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tickets', authenticate, async (req, res) => {
  try {
    const ticket = new Ticket({
      ...req.body,
      userName: req.user.name,
      userRole: req.user.role,
      date: getCurrentDate(),
      time: getCurrentTime()
    });
    await ticket.save();
    res.status(201).json(ticket);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/tickets/:id/reply', authenticate, authorize('مسؤول'), async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
    
    ticket.replies.push({
      adminName: req.user.name,
      reply: req.body.reply,
      date: getCurrentDate(),
      time: getCurrentTime()
    });
    ticket.status = 'تم الرد';
    await ticket.save();
    res.json(ticket);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/tickets/:id/close', authenticate, authorize('مسؤول'), async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
    ticket.status = 'مغلقة';
    await ticket.save();
    res.json(ticket);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ----- Logs -----
app.get('/api/logs', authenticate, authorize('مسؤول'), async (req, res) => {
  try {
    const logs = await Log.find().sort({ createdAt: -1 });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/logs', authenticate, async (req, res) => {
  try {
    const log = new Log({
      ...req.body,
      userName: req.user.name,
      userRole: req.user.role,
      date: getCurrentDate(),
      time: getCurrentTime()
    });
    await log.save();
    res.status(201).json(log);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ----- Locations -----
app.get('/api/locations', authenticate, async (req, res) => {
  try {
    const locations = await Location.find().sort({ timestamp: -1 });
    res.json(locations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/locations', authenticate, async (req, res) => {
  try {
    const { lat, lng, action } = req.body;
    
    if (lat == null || lng == null || isNaN(Number(lat)) || isNaN(Number(lng))) {
      return res.status(400).json({ error: 'إحداثيات غير صالحة' });
    }
    
    const location = new Location({
      userName: req.user.name,
      userRole: req.user.role,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      action: action || 'تحديث موقع',
      device: extractDevice(req.headers['user-agent']),
      browser: extractBrowser(req.headers['user-agent']),
      ip: req.ip
    });
    await location.save();
    res.status(201).json(location);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ----- Notes -----
app.post('/api/notes', authenticate, async (req, res) => {
  try {
    const { title, content, date, time, week, type, imageData, attachments } = req.body;
    
    if (!title || !content || !date) {
      return res.status(400).json({ error: 'العنوان والمحتوى والتاريخ مطلوبة' });
    }
    
    const note = new NoteVerbale({
      title,
      content,
      date,
      time: time || getCurrentTime(),
      week: week || getWeekNumber(date).toString(),
      createdBy: req.user.name,
      userRole: req.user.role,
      type: type || 'text',
      imageData: imageData || '',
      attachments: attachments || []
    });
    
    await note.save();
    res.status(201).json(note);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/notes', authenticate, async (req, res) => {
  try {
    const { week, limit } = req.query;
    let query = {};
    if (week) query.week = week;
    
    let notesQuery = NoteVerbale.find(query).sort({ createdAt: -1 });
    if (limit) notesQuery = notesQuery.limit(parseInt(limit));
    
    const notes = await notesQuery.exec();
    res.json(notes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/notes/latest', authenticate, async (req, res) => {
  try {
    const note = await NoteVerbale.findOne().sort({ createdAt: -1 });
    res.json(note || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/notes/:id', authenticate, authorize('مسؤول'), async (req, res) => {
  try {
    await NoteVerbale.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم الحذف' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----- Users -----
app.get('/api/users', authenticate, authorize('مسؤول'), async (req, res) => {
  try {
    const users = await User.find().select('-pass');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id', authenticate, authorize('مسؤول'), async (req, res) => {
  try {
    const { name, role, isActive, password } = req.body;
    const updateData = {};
    
    if (name) updateData.name = name;
    if (role) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.pass = await bcrypt.hash(password, salt);
    }
    
    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-pass');
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/users/:id', authenticate, authorize('مسؤول'), async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json({ message: 'تم الحذف' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----- Export/Import -----
app.get('/api/export-all', authenticate, authorize('مسؤول'), async (req, res) => {
  try {
    const [vessels, users, tickets, logs, locations, notes] = await Promise.all([
      Vessel.find(),
      User.find().select('-pass'),
      Ticket.find(),
      Log.find(),
      Location.find(),
      NoteVerbale.find()
    ]);
    res.json({ vessels, users, tickets, logs, locations, notes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/import-all', authenticate, authorize('مسؤول'), async (req, res) => {
  try {
    const { vessels, users, tickets, logs, locations, notes } = req.body;
    
    if (vessels && Array.isArray(vessels)) {
      await Vessel.deleteMany({});
      await Vessel.insertMany(vessels);
    }
    
    if (users && Array.isArray(users)) {
      for (const user of users) {
        if (user.pass && !user.pass.startsWith('$2')) {
          const salt = await bcrypt.genSalt(10);
          user.pass = await bcrypt.hash(user.pass, salt);
        }
      }
      await User.deleteMany({});
      await User.insertMany(users);
    }
    
    if (tickets && Array.isArray(tickets)) {
      await Ticket.deleteMany({});
      await Ticket.insertMany(tickets);
    }
    
    if (logs && Array.isArray(logs)) {
      await Log.deleteMany({});
      await Log.insertMany(logs);
    }
    
    if (locations && Array.isArray(locations)) {
      await Location.deleteMany({});
      await Location.insertMany(locations);
    }
    
    if (notes && Array.isArray(notes)) {
      await NoteVerbale.deleteMany({});
      await NoteVerbale.insertMany(notes);
    }
    
    res.json({ message: '✅ تم استيراد البيانات' });
  } catch (error) {
    res.status(500).json({ error: 'خطأ في الاستيراد: ' + error.message });
  }
});

// ----- Health -----
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(), 
    uptime: process.uptime()
  });
});

// ----- Home -----
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// 🔑 إنشاء ADMIN
// ============================================================
async function createAdmin() {
  try {
    const adminExists = await User.findOne({ role: 'مسؤول' });
    if (!adminExists) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);
      
      const admin = new User({
        name: 'Admin',
        email: ADMIN_EMAIL,
        pass: hashedPassword,
        role: 'مسؤول',
        isActive: true
      });
      
      await admin.save();
      console.log('✅ تم إنشاء حساب المسؤول');
      console.log(`📧 البريد: ${ADMIN_EMAIL}`);
      console.log(`🔑 كلمة المرور: ${ADMIN_PASSWORD}`);
    }
  } catch (error) {
    console.log('⚠️ Admin error:', error.message);
  }
}

// ============================================================
// 🚀 تشغيل السيرفر
// ============================================================
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Server: http://localhost:${PORT}`);
  await createAdmin();
  console.log('========================================');
  console.log('📧 البريد: ' + ADMIN_EMAIL);
  console.log('🔑 كلمة المرور: ' + ADMIN_PASSWORD);
  console.log('========================================');
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await mongoose.connection.close();
  process.exit(0);
});
