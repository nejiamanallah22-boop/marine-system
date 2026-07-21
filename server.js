const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = socketIO(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

app.use(cors());
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// ✅ حل مشكلة MIME types - الأهم!
// ============================================================

// تعيين MIME types الصحيحة للملفات
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
  } else if (url.endsWith('.html')) {
    res.setHeader('Content-Type', 'text/html');
  }
  next();
});

// خدمة الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// ============================================================
// 🗄️ قاعدة البيانات
// ============================================================

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vessel_db';
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('❌ MongoDB Error:', err.message));

// ============================================================
// 📊 النماذج
// ============================================================

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  pass: String,
  role: { type: String, default: 'مستخدم' }
});

const VesselSchema = new mongoose.Schema({
  name: String,
  num: String,
  len: Number,
  cat: String,
  stat: { type: String, default: 'صالح' }
}, { timestamps: true });

const TicketSchema = new mongoose.Schema({
  userName: String,
  subject: String,
  message: String,
  date: String,
  time: String,
  status: { type: String, default: 'قيد المعالجة' },
  replies: Array
}, { timestamps: true });

const LogSchema = new mongoose.Schema({
  userName: String,
  action: String,
  details: String,
  date: String,
  time: String
}, { timestamps: true });

const LocationSchema = new mongoose.Schema({
  userName: String,
  lat: Number,
  lng: Number,
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const NoteVerbaleSchema = new mongoose.Schema({
  title: String,
  content: String,
  date: String,
  time: String,
  week: String,
  createdBy: String
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Vessel = mongoose.model('Vessel', VesselSchema);
const Ticket = mongoose.model('Ticket', TicketSchema);
const Log = mongoose.model('Log', LogSchema);
const Location = mongoose.model('Location', LocationSchema);
const NoteVerbale = mongoose.model('NoteVerbale', NoteVerbaleSchema);

// ============================================================
// 🛠️ دوال
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

function determineCategory(len) {
  const n = parseFloat(len);
  if (n === 11) return 'البروق';
  if (n >= 8 && n <= 12) return 'صقور';
  if (n > 12 && n <= 25) return 'خوافر';
  if (n > 30) return 'طوافات';
  return 'زوارق مزدوجة';
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

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'توكن غير صالح' });
  }
};

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'غير مصرح' });
    }
    next();
  };
};

// ============================================================
// 🚪 Routes
// ============================================================

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
    if (!vessel) return res.status(404).json({ error: 'غير موجود' });
    res.json(vessel);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/vessels/:id', authenticate, authorize('مسؤول'), async (req, res) => {
  try {
    const vessel = await Vessel.findByIdAndDelete(req.params.id);
    if (!vessel) return res.status(404).json({ error: 'غير موجود' });
    res.json({ message: 'تم الحذف' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
    if (!ticket) return res.status(404).json({ error: 'غير موجودة' });
    
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
    if (!ticket) return res.status(404).json({ error: 'غير موجودة' });
    ticket.status = 'مغلقة';
    await ticket.save();
    res.json(ticket);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

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
      date: getCurrentDate(),
      time: getCurrentTime()
    });
    await log.save();
    res.status(201).json(log);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

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
    const { lat, lng } = req.body;
    if (lat == null || lng == null) {
      return res.status(400).json({ error: 'إحداثيات غير صالحة' });
    }
    const location = new Location({
      userName: req.user.name,
      lat: parseFloat(lat),
      lng: parseFloat(lng)
    });
    await location.save();
    res.status(201).json(location);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/notes', authenticate, async (req, res) => {
  try {
    const { title, content, date } = req.body;
    if (!title || !content || !date) {
      return res.status(400).json({ error: 'العنوان والمحتوى والتاريخ مطلوبة' });
    }
    const note = new NoteVerbale({
      title,
      content,
      date,
      time: getCurrentTime(),
      week: getWeekNumber(date).toString(),
      createdBy: req.user.name
    });
    await note.save();
    res.status(201).json(note);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/notes', authenticate, async (req, res) => {
  try {
    const notes = await NoteVerbale.find().sort({ createdAt: -1 });
    res.json(notes);
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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ✅ صفحة البداية - يجب أن تكون في النهاية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// 📡 Socket.IO
// ============================================================

const connectedUsers = {};

io.on('connection', (socket) => {
  console.log('📡 متصل:', socket.id);
  
  socket.on('user-connected', (data) => {
    if (data && data.lat != null && data.lng != null) {
      connectedUsers[socket.id] = {
        id: socket.id,
        userName: data.userName || 'مجهول',
        lat: parseFloat(data.lat),
        lng: parseFloat(data.lng)
      };
      io.emit('user-list', Object.values(connectedUsers));
    }
  });
  
  socket.on('disconnect', () => {
    delete connectedUsers[socket.id];
    io.emit('user-list', Object.values(connectedUsers));
  });
});

// ============================================================
// 🔑 إنشاء Admin
// ============================================================

async function createAdmin() {
  try {
    const adminExists = await User.findOne({ role: 'مسؤول' });
    if (!adminExists) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('123456', salt);
      
      const admin = new User({
        name: 'Admin',
        email: 'admin',
        pass: hashedPassword,
        role: 'مسؤول'
      });
      
      await admin.save();
      console.log('✅ Admin: admin / 123456');
    }
  } catch (error) {
    console.log('⚠️ Admin error:', error.message);
  }
}

// ============================================================
// 🚀 تشغيل السيرفر
// ============================================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Server: http://localhost:${PORT}`);
  await createAdmin();
  console.log('📧 admin / 🔑 123456');
});
