const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const { DateTime } = require('luxon');

dotenv.config();

const app = express();
const server = http.createServer(app);

// ============================================================
// ✅ Logger احترافي
// ============================================================
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
    winston.format.prettyPrint()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// ============================================================
// ✅ التحقق من المتغيرات البيئية
// ============================================================
const REQUIRED_ENV = ['JWT_SECRET', 'MONGODB_URI', 'ADMIN_PASSWORD', 'ADMIN_EMAIL'];
const missingEnv = REQUIRED_ENV.filter(key => !process.env[key]);

if (missingEnv.length > 0) {
  logger.error(`❌ المتغيرات التالية مفقودة في .env: ${missingEnv.join(', ')}`);
  process.exit(1);
}

// ============================================================
// ✅ الثوابت
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_SECRET + '_refresh';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000;
const MAX_REFRESH_TOKENS = 5;
const LOCATION_SAVE_INTERVAL = 60000;
const MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024;
const MAX_ATTACHMENT_COUNT = 5;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const LOCATION_TTL = 60 * 60 * 24 * 30;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];
const REQUEST_TIMEOUT = 30000;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;
const TIMEZONE = 'Africa/Tunis';

// ============================================================
// ✅ Trust Proxy
// ============================================================
app.set('trust proxy', 1);

// ============================================================
// ✅ إزالة X-Powered-By
// ============================================================
app.disable('x-powered-by');

// ============================================================
// ✅ Request Timeout
// ============================================================
server.timeout = REQUEST_TIMEOUT;

// ============================================================
// ✅ CORS مقيد
// ============================================================
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('❌ غير مصرح به بواسطة CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ============================================================
// ✅ Helmet متقدم مع CSP محسّن
// ============================================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "https://cdn.jsdelivr.net",
        "https://unpkg.com",
        "https://cdnjs.cloudflare.com"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://unpkg.com",
        "https://fonts.googleapis.com"
      ],
      imgSrc: ["'self'", "data:", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'", "https://api.ipify.org"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  referrerPolicy: { policy: 'no-referrer' },
  permissionsPolicy: {
    features: {
      geolocation: ["'self'"],
      camera: ["'none'"],
      microphone: ["'none'"]
    }
  },
  hidePoweredBy: true
}));

// ============================================================
// ✅ Compression مع Threshold
// ============================================================
app.use(compression({
  threshold: 1024,
  level: 6,
  filter: (req, res) => {
    // ✅ ضغط فقط للـ API وليس للملفات الثابتة
    if (req.path.startsWith('/api/')) {
      return true;
    }
    return false;
  }
}));

// ============================================================
// ✅ Logging (Morgan + Winston)
// ============================================================
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// ============================================================
// ✅ Sanitization
// ============================================================
app.use(mongoSanitize());
app.use(xss());

// ============================================================
// ✅ Body Parser مع حد للحجم
// ============================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================
// ✅ MIME Types
// ============================================================
app.use((req, res, next) => {
  const url = req.url;
  if (url.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
  else if (url.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
  else if (url.endsWith('.json')) res.setHeader('Content-Type', 'application/json');
  else if (url.endsWith('.png')) res.setHeader('Content-Type', 'image/png');
  else if (url.endsWith('.jpg') || url.endsWith('.jpeg')) res.setHeader('Content-Type', 'image/jpeg');
  else if (url.endsWith('.svg')) res.setHeader('Content-Type', 'image/svg+xml');
  else if (url.endsWith('.ico')) res.setHeader('Content-Type', 'image/x-icon');
  next();
});

// ============================================================
// ✅ Static Files
// ============================================================
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
    else if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
  }
}));

// ============================================================
// ✅ Rate Limiting متقدم
// ============================================================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: '⚠️ تجاوزت الحد المسموح للطلبات' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', limiter);

const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 50,
  delayMs: (hits) => hits * 100
});
app.use('/api', speedLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: '⚠️ الكثير من المحاولات، حاول بعد 15 دقيقة' }
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: '⚠️ الكثير من محاولات التحديث' }
});

const notesLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: '⚠️ الكثير من محاولات إنشاء المذكرات' }
});

const locationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: '⚠️ الكثير من محاولات تحديث الموقع' }
});

const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: '⚠️ الكثير من محاولات الاستيراد، حاول بعد ساعة' }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/refresh', refreshLimiter);
app.use('/api/notes', notesLimiter);
app.use('/api/locations', locationLimiter);
app.use('/api/import-all', importLimiter);

// ============================================================
// 🗄️ MongoDB Connection
// ============================================================
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000
})
.then(() => logger.info('✅ MongoDB Connected'))
.catch(err => {
  logger.error('❌ MongoDB Error:', err.message);
  process.exit(1);
});

// ============================================================
// 📊 النماذج مع Indexes
// ============================================================

// ----- User Model -----
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  pass: { type: String, required: true, select: false },
  role: { type: String, enum: ['مسؤول', 'محرر', 'مستخدم'], default: 'مستخدم' },
  permissions: [{ type: String }],
  isActive: { type: Boolean, default: true },
  loginAttempts: { type: Number, default: 0, select: false },
  lockedUntil: { type: Date, default: null, select: false },
  lastLogin: { type: Date },
  refreshTokens: [{
    token: { type: String },
    jti: { type: String },
    ip: { type: String },
    userAgent: { type: String },
    device: { type: String },
    createdAt: { type: Date, default: Date.now }
  }],
  passwordChangedAt: { type: Date, default: Date.now }
}, { timestamps: true });

UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });

// ----- Vessel Model -----
const VesselSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  num: { type: String, trim: true },
  len: { type: Number, default: 0, min: 0 },
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

VesselSchema.index({ name: 1 });
VesselSchema.index({ stat: 1 });
VesselSchema.index({ reg: 1 });

// ----- Ticket Model -----
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

TicketSchema.index({ status: 1 });
TicketSchema.index({ userName: 1 });

// ----- Log Model -----
const LogSchema = new mongoose.Schema({
  userName: { type: String, required: true },
  userRole: { type: String, required: true },
  action: { type: String, required: true },
  details: { type: String, required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  ip: { type: String },
  userAgent: { type: String },
  requestId: { type: String }
}, { timestamps: true });

LogSchema.index({ createdAt: -1 });
LogSchema.index({ userName: 1 });
LogSchema.index({ action: 1 });

// ----- Location Model -----
const LocationSchema = new mongoose.Schema({
  userName: { type: String, required: true },
  userRole: { type: String, required: true },
  lat: { type: Number, required: true, min: -90, max: 90 },
  lng: { type: Number, required: true, min: -180, max: 180 },
  timestamp: { type: Date, default: Date.now, index: true },
  action: { type: String, default: 'تحديث موقع' },
  device: { type: String },
  browser: { type: String },
  ip: { type: String }
}, { timestamps: true });

LocationSchema.index({ timestamp: 1 }, { expireAfterSeconds: LOCATION_TTL });
LocationSchema.index({ userName: 1 });

// ----- Note Verbale Model -----
const NoteVerbaleSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  week: { type: String, required: true },
  createdBy: { type: String, required: true },
  userRole: { type: String, required: true },
  type: { type: String, default: 'text' },
  imageUrl: { type: String, default: '' },
  attachments: [{
    name: String,
    type: String,
    url: String,
    size: Number
  }]
}, { timestamps: true });

NoteVerbaleSchema.index({ week: 1 });
NoteVerbaleSchema.index({ createdAt: -1 });

const User = mongoose.model('User', UserSchema);
const Vessel = mongoose.model('Vessel', VesselSchema);
const Ticket = mongoose.model('Ticket', TicketSchema);
const Log = mongoose.model('Log', LogSchema);
const Location = mongoose.model('Location', LocationSchema);
const NoteVerbale = mongoose.model('NoteVerbale', NoteVerbaleSchema);

// ============================================================
// 🛠️ دوال مساعدة مع Timezone
// ============================================================
function getCurrentTime() {
  return DateTime.now().setZone(TIMEZONE).toFormat('HH:mm');
}

function getCurrentDate() {
  return DateTime.now().setZone(TIMEZONE).toFormat('yyyy-MM-dd');
}

function getWeekNumber(date) {
  const dt = DateTime.fromISO(date, { zone: TIMEZONE });
  return dt.weekNumber.toString();
}

function getCurrentDateTime() {
  return DateTime.now().setZone(TIMEZONE).toISO();
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

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateRequestId() {
  return uuidv4();
}

function isValidCoordinate(value) {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

function isValidMimeType(mimeType) {
  return ALLOWED_MIME_TYPES.includes(mimeType);
}

function getClientInfo(req) {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    device: extractDevice(req.headers['user-agent']),
    browser: extractBrowser(req.headers['user-agent'])
  };
}

// ============================================================
// ✅ دوال المصادقة
// ============================================================
function generateAccessToken(user) {
  return jwt.sign(
    { 
      id: user._id, 
      name: user.name, 
      role: user.role, 
      email: user.email, 
      permissions: user.permissions || [],
      jti: uuidv4() 
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function generateRefreshToken(user, clientInfo) {
  const jti = uuidv4();
  return {
    token: jwt.sign(
      { 
        id: user._id, 
        version: user.passwordChangedAt.getTime(), 
        jti 
      },
      JWT_REFRESH_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRY }
    ),
    jti,
    ...clientInfo
  };
}

function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
}

// ============================================================
// ✅ وظيفة تسجيل العمليات
// ============================================================
async function logAction(user, action, details, req = null) {
  try {
    const clientInfo = req ? getClientInfo(req) : {};
    await Log.create({
      userName: user.name,
      userRole: user.role,
      action,
      details,
      date: getCurrentDate(),
      time: getCurrentTime(),
      ip: clientInfo.ip || null,
      userAgent: clientInfo.userAgent || null,
      requestId: req?.requestId || null
    });
  } catch (error) {
    logger.error('Log error:', error);
  }
}

// ============================================================
// ✅ Pagination Helper
// ============================================================
function getPaginationParams(req) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, parseInt(req.query.limit) || DEFAULT_PAGE_LIMIT));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

// ============================================================
// ✅ Permission System
// ============================================================
const PERMISSIONS = {
  VESSEL_CREATE: 'vessel.create',
  VESSEL_UPDATE: 'vessel.update',
  VESSEL_DELETE: 'vessel.delete',
  VESSEL_VIEW: 'vessel.view',
  TICKET_REPLY: 'ticket.reply',
  TICKET_CLOSE: 'ticket.close',
  USER_MANAGE: 'user.manage',
  LOG_VIEW: 'log.view',
  NOTE_CREATE: 'note.create',
  NOTE_DELETE: 'note.delete',
  LOCATION_VIEW: 'location.view',
  EXPORT_DATA: 'export.data',
  IMPORT_DATA: 'import.data'
};

const ROLE_PERMISSIONS = {
  'مسؤول': Object.values(PERMISSIONS),
  'محرر': [
    PERMISSIONS.VESSEL_CREATE,
    PERMISSIONS.VESSEL_UPDATE,
    PERMISSIONS.VESSEL_VIEW,
    PERMISSIONS.TICKET_REPLY,
    PERMISSIONS.TICKET_CLOSE,
    PERMISSIONS.NOTE_CREATE,
    PERMISSIONS.LOCATION_VIEW,
    PERMISSIONS.EXPORT_DATA
  ],
  'مستخدم': [
    PERMISSIONS.VESSEL_VIEW,
    PERMISSIONS.LOCATION_VIEW,
    PERMISSIONS.NOTE_CREATE
  ]
};

const hasPermission = (user, permission) => {
  if (user.role === 'مسؤول') return true;
  return user.permissions?.includes(permission) || ROLE_PERMISSIONS[user.role]?.includes(permission) || false;
};

const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'يرجى تسجيل الدخول' });
    }
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ success: false, error: 'غير مصرح لك بهذه العملية' });
    }
    next();
  };
};

// ============================================================
// ✅ Validation Middleware
// ============================================================
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'بيانات غير صالحة',
      details: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
};

// ============================================================
// ✅ Request ID Middleware
// ============================================================
app.use((req, res, next) => {
  req.requestId = generateRequestId();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

// ============================================================
// ✅ Error Middleware
// ============================================================
const errorHandler = (err, req, res, next) => {
  logger.error('❌ Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId: req.requestId,
    ip: req.ip
  });
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, error: err.message });
  }
  
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, error: 'معرف غير صالح' });
  }
  
  if (err.code === 11000) {
    return res.status(400).json({ success: false, error: 'قيمة مكررة' });
  }
  
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'حدث خطأ ما',
    requestId: req.requestId,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// ============================================================
// 🔐 Middleware المصادقة
// ============================================================
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'يرجى تسجيل الدخول' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-pass -loginAttempts -lockedUntil');
    
    if (!user) {
      return res.status(401).json({ success: false, error: 'المستخدم غير موجود' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, error: 'الحساب غير مفعل' });
    }

    if (user.passwordChangedAt) {
      const changedTimestamp = parseInt(user.passwordChangedAt.getTime() / 1000, 10);
      if (decoded.iat < changedTimestamp) {
        return res.status(401).json({ success: false, error: 'تم تغيير كلمة المرور، يرجى تسجيل الدخول مجدداً' });
      }
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'انتهت صلاحية الجلسة', code: 'TOKEN_EXPIRED' });
    }
    res.status(401).json({ success: false, error: 'توكن غير صالح' });
  }
};

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'يرجى تسجيل الدخول' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'غير مصرح لك بهذه العملية' });
    }
    next();
  };
};

// ============================================================
// 📡 Socket.IO
// ============================================================
const io = socketIO(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  allowRequest: (req, fn) => {
    const origin = req.headers.origin;
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return fn(new Error('Origin not allowed'), false);
    }
    fn(null, true);
  }
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) return next(new Error('User not found'));

    socket.userId = user._id;
    socket.userName = user.name;
    socket.userRole = user.role;
    socket.user = user;
    socket.lastLocationSave = 0;
    socket.lastUpdateTime = 0;
    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
});

const connectedUsers = {};

io.on('connection', (socket) => {
  logger.info(`📡 متصل: ${socket.id} - ${socket.userName}`);

  socket.on('user-connected', async (data) => {
    const lat = parseFloat(data?.lat);
    const lng = parseFloat(data?.lng);
    
    if (data && isValidCoordinate(lat) && isValidCoordinate(lng)) {
      connectedUsers[socket.id] = {
        id: socket.id,
        userId: socket.userId,
        userName: socket.userName,
        userRole: socket.userRole,
        lat,
        lng,
        connectedAt: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
        device: extractDevice(socket.handshake.headers['user-agent']),
        browser: extractBrowser(socket.handshake.headers['user-agent']),
        ip: socket.handshake.address
      };
      
      const now = Date.now();
      if (now - socket.lastLocationSave > LOCATION_SAVE_INTERVAL) {
        try {
          await Location.create({
            userName: socket.userName,
            userRole: socket.userRole,
            lat,
            lng,
            action: 'اتصال مباشر',
            device: extractDevice(socket.handshake.headers['user-agent']),
            browser: extractBrowser(socket.handshake.headers['user-agent']),
            ip: socket.handshake.address
          });
          socket.lastLocationSave = now;
        } catch (err) {
          logger.error('Save location error:', err);
        }
      }
      
      io.emit('user-list', Object.values(connectedUsers));
    }
  });

  socket.on('update-location', async (data) => {
    const now = Date.now();
    if (now - socket.lastUpdateTime < 5000) {
      return socket.emit('error', { message: 'تحديث سريع جداً، يرجى الانتظار' });
    }
    socket.lastUpdateTime = now;
    
    const lat = parseFloat(data?.lat);
    const lng = parseFloat(data?.lng);
    
    if (!isValidCoordinate(lat) || !isValidCoordinate(lng)) {
      return socket.emit('error', { message: 'إحداثيات غير صالحة' });
    }
    
    if (connectedUsers[socket.id]) {
      connectedUsers[socket.id].lat = lat;
      connectedUsers[socket.id].lng = lng;
      connectedUsers[socket.id].lastUpdate = new Date().toISOString();
      
      if (now - socket.lastLocationSave > LOCATION_SAVE_INTERVAL) {
        try {
          await Location.create({
            userName: socket.userName,
            userRole: socket.userRole,
            lat,
            lng,
            action: data.action || 'تحديث موقع',
            device: extractDevice(socket.handshake.headers['user-agent']),
            browser: extractBrowser(socket.handshake.headers['user-agent']),
            ip: socket.handshake.address
          });
          socket.lastLocationSave = now;
        } catch (err) {
          logger.error('Save location error:', err);
        }
      }
      
      socket.broadcast.emit('receive-location', {
        userId: socket.userId,
        userName: socket.userName,
        lat,
        lng,
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
// 🚪 ROUTES API
// ============================================================

// ----- Login -----
app.post('/api/auth/login', [
  body('email').notEmpty().withMessage('البريد الإلكتروني مطلوب')
    .isEmail().withMessage('بريد إلكتروني غير صالح'),
  body('password').notEmpty().withMessage('كلمة المرور مطلوبة')
], validate, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+pass +loginAttempts +lockedUntil');
    
    if (!user) {
      return res.status(401).json({ success: false, error: 'بيانات غير صحيحة' });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remaining = Math.ceil((user.lockedUntil - new Date()) / 60000);
      return res.status(403).json({
        success: false,
        error: `الحساب مقفل لمدة ${remaining} دقائق`,
        code: 'ACCOUNT_LOCKED'
      });
    }

    const isMatch = await bcrypt.compare(password, user.pass);
    if (!isMatch) {
      user.loginAttempts += 1;
      if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LOCK_TIME);
        await user.save();
        return res.status(403).json({
          success: false,
          error: `الحساب مقفل لمدة 15 دقيقة`,
          code: 'ACCOUNT_LOCKED'
        });
      }
      await user.save();
      return res.status(401).json({ success: false, error: 'بيانات غير صحيحة' });
    }

    user.loginAttempts = 0;
    user.lockedUntil = null;
    user.lastLogin = new Date();
    await user.save();

    const accessToken = generateAccessToken(user);
    const clientInfo = getClientInfo(req);
    const { token: refreshToken, jti, ...refreshData } = generateRefreshToken(user, clientInfo);
    const hashedRefreshToken = hashToken(refreshToken);

    user.refreshTokens = [
      { 
        token: hashedRefreshToken, 
        jti,
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        device: clientInfo.device,
        createdAt: new Date()
      },
      ...user.refreshTokens.slice(0, MAX_REFRESH_TOKENS - 1)
    ];
    await user.save();

    await logAction(user, 'تسجيل دخول', `تسجيل دخول: ${user.email}`, req);

    res.json({
      success: true,
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRY,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || ROLE_PERMISSIONS[user.role] || []
      }
    });
  } catch (error) {
    next(error);
  }
});

// ----- Refresh Token -----
app.post('/api/auth/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'Refresh token مطلوب' });
    }

    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ success: false, error: 'مستخدم غير موجود' });
    }

    const hashedToken = hashToken(refreshToken);
    const tokenData = user.refreshTokens.find(t => t.token === hashedToken && t.jti === decoded.jti);
    if (!tokenData) {
      return res.status(401).json({ success: false, error: 'Refresh token غير صالح' });
    }

    // ✅ التحقق من الجهاز
    const clientInfo = getClientInfo(req);
    if (tokenData.ip !== clientInfo.ip) {
      logger.warn(`⚠️ Refresh token used from different IP: ${tokenData.ip} -> ${clientInfo.ip}`);
      // يمكن إبطال جميع التوكنات هنا
    }

    user.refreshTokens = user.refreshTokens.filter(t => t.token !== hashedToken);
    
    const newAccessToken = generateAccessToken(user);
    const { token: newRefreshToken, jti: newJti, ...newRefreshData } = generateRefreshToken(user, clientInfo);
    const newHashedToken = hashToken(newRefreshToken);
    
    user.refreshTokens.push({
      token: newHashedToken,
      jti: newJti,
      ip: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      device: clientInfo.device,
      createdAt: new Date()
    });
    await user.save();

    res.json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRY
    });
  } catch (error) {
    next(error);
  }
});

// ----- Logout -----
app.post('/api/auth/logout', authenticate, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const hashedToken = hashToken(refreshToken);
      const user = await User.findById(req.user._id);
      user.refreshTokens = user.refreshTokens.filter(t => t.token !== hashedToken);
      await user.save();
    }
    await logAction(req.user, 'تسجيل خروج', 'تم تسجيل الخروج', req);
    res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
  } catch (error) {
    next(error);
  }
});

// ----- Logout All -----
app.post('/api/auth/logout-all', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    user.refreshTokens = [];
    await user.save();
    await logAction(req.user, 'تسجيل خروج جميع الأجهزة', 'تم تسجيل الخروج من جميع الأجهزة', req);
    res.json({ success: true, message: 'تم تسجيل الخروج من جميع الأجهزة' });
  } catch (error) {
    next(error);
  }
});

// ----- Register (Admin only) -----
app.post('/api/auth/register', authenticate, authorize('مسؤول'), [
  body('name').notEmpty().withMessage('الاسم مطلوب')
    .isLength({ min: 2, max: 50 }).withMessage('الاسم بين 2-50 حرف'),
  body('email').notEmpty().withMessage('البريد الإلكتروني مطلوب')
    .isEmail().withMessage('بريد إلكتروني غير صالح'),
  body('password').notEmpty().withMessage('كلمة المرور مطلوبة')
    .isLength({ min: 8 }).withMessage('كلمة المرور 8 أحرف على الأقل'),
  body('role').optional().isIn(['مسؤول', 'محرر', 'مستخدم']).withMessage('دور غير صالح')
], validate, async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'البريد الإلكتروني موجود بالفعل' });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      name,
      email: email.toLowerCase(),
      pass: hashedPassword,
      role: role || 'مستخدم',
      permissions: ROLE_PERMISSIONS[role || 'مستخدم'] || [],
      isActive: true
    });

    await user.save();
    await logAction(req.user, 'إنشاء مستخدم', `تم إنشاء حساب جديد: ${email}`, req);

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الحساب بنجاح',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions
      }
    });
  } catch (error) {
    next(error);
  }
});

// ----- Change Password -----
app.put('/api/auth/change-password', authenticate, [
  body('oldPassword').notEmpty().withMessage('كلمة المرور الحالية مطلوبة'),
  body('newPassword').notEmpty().withMessage('كلمة المرور الجديدة مطلوبة')
    .isLength({ min: 8 }).withMessage('كلمة المرور 8 أحرف على الأقل')
], validate, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+pass');
    const isMatch = await bcrypt.compare(oldPassword, user.pass);
    
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'كلمة المرور الحالية غير صحيحة' });
    }

    const salt = await bcrypt.genSalt(12);
    user.pass = await bcrypt.hash(newPassword, salt);
    user.passwordChangedAt = new Date();
    user.refreshTokens = [];
    await user.save();

    await logAction(req.user, 'تغيير كلمة المرور', 'تم تغيير كلمة المرور', req);

    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (error) {
    next(error);
  }
});

// ----- Get Current User -----
app.get('/api/auth/me', authenticate, async (req, res) => {
  res.json({ 
    success: true, 
    user: {
      ...req.user.toObject(),
      permissions: req.user.permissions || ROLE_PERMISSIONS[req.user.role] || []
    }
  });
});

// ============================================================
// 🚢 Vessels Routes with Pagination
// ============================================================
app.get('/api/vessels', authenticate, requirePermission(PERMISSIONS.VESSEL_VIEW), async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req);
    const { stat, reg, search } = req.query;
    
    const query = {};
    if (stat) query.stat = stat;
    if (reg) query.reg = reg;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { num: { $regex: search, $options: 'i' } }
      ];
    }
    
    const [vessels, total] = await Promise.all([
      Vessel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Vessel.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: vessels,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/vessels', authenticate, requirePermission(PERMISSIONS.VESSEL_CREATE), [
  body('name').notEmpty().withMessage('اسم المركب مطلوب')
], validate, async (req, res, next) => {
  try {
    const data = req.body;
    data.cat = determineCategory(data.len);
    const vessel = new Vessel(data);
    await vessel.save();
    await logAction(req.user, 'إضافة مركب', `تم إضافة مركب: ${data.name}`, req);
    res.status(201).json({ success: true, data: vessel });
  } catch (error) {
    next(error);
  }
});

app.put('/api/vessels/:id', authenticate, requirePermission(PERMISSIONS.VESSEL_UPDATE), [
  body('name').optional().notEmpty().withMessage('اسم المركب مطلوب')
], validate, async (req, res, next) => {
  try {
    const data = req.body;
    data.cat = determineCategory(data.len);
    const vessel = await Vessel.findByIdAndUpdate(
      req.params.id, 
      data, 
      { new: true, runValidators: true }
    );
    if (!vessel) return res.status(404).json({ success: false, error: 'المركب غير موجود' });
    await logAction(req.user, 'تعديل مركب', `تم تعديل مركب: ${vessel.name}`, req);
    res.json({ success: true, data: vessel });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/vessels/:id', authenticate, requirePermission(PERMISSIONS.VESSEL_DELETE), async (req, res, next) => {
  try {
    const vessel = await Vessel.findByIdAndDelete(req.params.id);
    if (!vessel) return res.status(404).json({ success: false, error: 'المركب غير موجود' });
    await logAction(req.user, 'حذف مركب', `تم حذف مركب: ${vessel.name}`, req);
    res.json({ success: true, message: 'تم حذف المركب بنجاح' });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// 🎫 Tickets Routes
// ============================================================
app.get('/api/tickets', authenticate, async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req);
    const { status } = req.query;
    
    const query = {};
    if (status) query.status = status;
    
    const [tickets, total] = await Promise.all([
      Ticket.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Ticket.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: tickets,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/tickets', authenticate, [
  body('subject').notEmpty().withMessage('الموضوع مطلوب'),
  body('message').notEmpty().withMessage('الرسالة مطلوبة')
], validate, async (req, res, next) => {
  try {
    const ticket = new Ticket({
      ...req.body,
      userName: req.user.name,
      userRole: req.user.role,
      date: getCurrentDate(),
      time: getCurrentTime()
    });
    await ticket.save();
    res.status(201).json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
});

app.put('/api/tickets/:id/reply', authenticate, requirePermission(PERMISSIONS.TICKET_REPLY), [
  body('reply').notEmpty().withMessage('الرد مطلوب')
], validate, async (req, res, next) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, error: 'التذكرة غير موجودة' });
    
    ticket.replies.push({
      adminName: req.user.name,
      reply: req.body.reply,
      date: getCurrentDate(),
      time: getCurrentTime()
    });
    ticket.status = 'تم الرد';
    await ticket.save({ runValidators: true });
    await logAction(req.user, 'الرد على تذكرة', `تم الرد على تذكرة: ${ticket.subject}`, req);
    res.json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
});

app.put('/api/tickets/:id/close', authenticate, requirePermission(PERMISSIONS.TICKET_CLOSE), async (req, res, next) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, error: 'التذكرة غير موجودة' });
    ticket.status = 'مغلقة';
    await ticket.save({ runValidators: true });
    await logAction(req.user, 'إغلاق تذكرة', `تم إغلاق تذكرة: ${ticket.subject}`, req);
    res.json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// 📜 Logs Routes
// ============================================================
app.get('/api/logs', authenticate, requirePermission(PERMISSIONS.LOG_VIEW), async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req);
    const { action, userName } = req.query;
    
    const query = {};
    if (action) query.action = action;
    if (userName) query.userName = { $regex: userName, $options: 'i' };
    
    const [logs, total] = await Promise.all([
      Log.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Log.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: logs,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// 📍 Locations Routes
// ============================================================
app.get('/api/locations', authenticate, requirePermission(PERMISSIONS.LOCATION_VIEW), async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req);
    const { userName } = req.query;
    
    const query = {};
    if (userName) query.userName = { $regex: userName, $options: 'i' };
    
    const [locations, total] = await Promise.all([
      Location.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit),
      Location.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: locations,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/locations', authenticate, [
  body('lat').notEmpty().withMessage('خط العرض مطلوب')
    .isFloat({ min: -90, max: 90 }).withMessage('خط العرض غير صالح'),
  body('lng').notEmpty().withMessage('خط الطول مطلوب')
    .isFloat({ min: -180, max: 180 }).withMessage('خط الطول غير صالح')
], validate, async (req, res, next) => {
  try {
    const { lat, lng, action } = req.body;
    
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
    res.status(201).json({ success: true, data: location });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// 📝 Note Verbale Routes
// ============================================================
app.post('/api/notes', authenticate, requirePermission(PERMISSIONS.NOTE_CREATE), [
  body('title').notEmpty().withMessage('العنوان مطلوب'),
  body('content').notEmpty().withMessage('المحتوى مطلوب'),
  body('date').notEmpty().withMessage('التاريخ مطلوب'),
  body('attachments').optional().custom((attachments) => {
    if (!attachments || !Array.isArray(attachments)) return true;
    if (attachments.length > MAX_ATTACHMENT_COUNT) {
      throw new Error(`الحد الأقصى للمرفقات هو ${MAX_ATTACHMENT_COUNT}`);
    }
    for (const attachment of attachments) {
      if (attachment.data && Buffer.byteLength(attachment.data, 'base64') > MAX_ATTACHMENT_SIZE) {
        throw new Error(`حجم المرفق ${attachment.name || 'غير معروف'} يتجاوز الحد المسموح (2MB)`);
      }
      if (attachment.type && !isValidMimeType(attachment.type)) {
        throw new Error(`نوع الملف ${attachment.type} غير مسموح`);
      }
    }
    return true;
  })
], validate, async (req, res, next) => {
  try {
    const { title, content, date, time, week, type, imageData, attachments } = req.body;
    
    if (imageData && Buffer.byteLength(imageData, 'base64') > MAX_ATTACHMENT_SIZE) {
      return res.status(400).json({ success: false, error: 'حجم الصورة يتجاوز الحد المسموح (2MB)' });
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
    await logAction(req.user, 'إنشاء مذكرة', `تم إنشاء مذكرة: ${title}`, req);
    res.status(201).json({ success: true, data: note });
  } catch (error) {
    next(error);
  }
});

app.get('/api/notes', authenticate, async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req);
    const { week } = req.query;
    
    const query = {};
    if (week) query.week = week;
    
    const [notes, total] = await Promise.all([
      NoteVerbale.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      NoteVerbale.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: notes,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/notes/latest', authenticate, async (req, res, next) => {
  try {
    const note = await NoteVerbale.findOne().sort({ createdAt: -1 });
    res.json(note || null);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/notes/:id', authenticate, requirePermission(PERMISSIONS.NOTE_DELETE), async (req, res, next) => {
  try {
    const note = await NoteVerbale.findByIdAndDelete(req.params.id);
    if (!note) return res.status(404).json({ success: false, error: 'المذكرة غير موجودة' });
    await logAction(req.user, 'حذف مذكرة', `تم حذف مذكرة: ${note.title}`, req);
    res.json({ success: true, message: 'تم حذف المذكرة' });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// 👥 Users Routes
// ============================================================
app.get('/api/users', authenticate, requirePermission(PERMISSIONS.USER_MANAGE), async (req, res, next) => {
  try {
    const { page, limit, skip } = getPaginationParams(req);
    const { role, search } = req.query;
    
    const query = {};
    if (role) query.role = role;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const [users, total] = await Promise.all([
      User.find(query).select('-pass -refreshTokens').skip(skip).limit(limit),
      User.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: users,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/users/:id', authenticate, requirePermission(PERMISSIONS.USER_MANAGE), [
  body('name').optional().isLength({ min: 2, max: 50 }).withMessage('الاسم بين 2-50 حرف'),
  body('role').optional().isIn(['مسؤول', 'محرر', 'مستخدم']).withMessage('دور غير صالح'),
  body('password').optional().isLength({ min: 8 }).withMessage('كلمة المرور 8 أحرف على الأقل'),
  body('permissions').optional().isArray().withMessage('الصلاحيات يجب أن تكون مصفوفة')
], validate, async (req, res, next) => {
  try {
    const { name, role, isActive, password, permissions } = req.body;
    const updateData = {};
    
    if (name) updateData.name = name;
    if (role) {
      updateData.role = role;
      updateData.permissions = ROLE_PERMISSIONS[role] || [];
    }
    if (permissions) updateData.permissions = permissions;
    if (isActive !== undefined) updateData.isActive = isActive;
    
    if (password) {
      const salt = await bcrypt.genSalt(12);
      updateData.pass = await bcrypt.hash(password, salt);
      updateData.passwordChangedAt = new Date();
      updateData.refreshTokens = [];
    }
    
    const user = await User.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    ).select('-pass -refreshTokens');
    
    if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    
    await logAction(req.user, 'تعديل مستخدم', `تم تعديل بيانات المستخدم: ${user.email}`, req);
    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/users/:id', authenticate, requirePermission(PERMISSIONS.USER_MANAGE), async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, error: 'لا يمكنك حذف حسابك الخاص' });
    }
    
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    
    await logAction(req.user, 'حذف مستخدم', `تم حذف المستخدم: ${user.email}`, req);
    res.json({ success: true, message: 'تم حذف المستخدم' });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// 💾 Export / Import
// ============================================================
app.get('/api/export-all', authenticate, requirePermission(PERMISSIONS.EXPORT_DATA), async (req, res, next) => {
  try {
    const { page = 1, limit = 1000 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [vessels, users, tickets, logs, locations, notes] = await Promise.all([
      Vessel.find().skip(skip).limit(parseInt(limit)),
      User.find().select('-pass -refreshTokens').skip(skip).limit(parseInt(limit)),
      Ticket.find().skip(skip).limit(parseInt(limit)),
      Log.find().skip(skip).limit(parseInt(limit)),
      Location.find().skip(skip).limit(parseInt(limit)),
      NoteVerbale.find().skip(skip).limit(parseInt(limit))
    ]);
    
    await logAction(req.user, 'تصدير بيانات', 'تم تصدير البيانات', req);
    
    res.json({
      success: true,
      exportedAt: getCurrentDateTime(),
      version: '2.0',
      pagination: { page: parseInt(page), limit: parseInt(limit) },
      data: {
        vessels,
        users,
        tickets,
        logs,
        locations,
        notes
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/import-all', authenticate, requirePermission(PERMISSIONS.IMPORT_DATA), async (req, res, next) => {
  try {
    const { data, confirm } = req.body;
    const { vessels, users, tickets, logs, locations, notes } = data || {};
    
    // ✅ طلب تأكيد إضافي
    if (!confirm || confirm !== 'IMPORT_CONFIRM') {
      return res.status(400).json({
        success: false,
        error: 'يرجى تأكيد الاستيراد بإرسال confirm: "IMPORT_CONFIRM"',
        warning: '⚠️ سيتم استبدال جميع البيانات الحالية'
      });
    }
    
    if (!vessels && !users && !tickets && !logs && !locations && !notes) {
      return res.status(400).json({ success: false, error: 'لا توجد بيانات للاستيراد' });
    }

    // ✅ التحقق من صحة البيانات
    if (users && Array.isArray(users)) {
      const adminUsers = users.filter(u => u.role === 'مسؤول' && u.email !== ADMIN_EMAIL);
      if (adminUsers.length > 0) {
        throw new Error('لا يمكن استيراد مستخدمين بدور مسؤول غير موثوقين');
      }
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // ✅ إنشاء نسخة احتياطية في قاعدة البيانات (بدلاً من الذاكرة)
      const backupCollection = mongoose.connection.collection('import_backups');
      await backupCollection.insertOne({
        timestamp: new Date(),
        importedBy: req.user.email,
        data: {
          vessels: await Vessel.find().session(session),
          users: await User.find().session(session),
          tickets: await Ticket.find().session(session),
          logs: await Log.find().session(session),
          locations: await Location.find().session(session),
          notes: await NoteVerbale.find().session(session)
        }
      });

      // ✅ استيراد البيانات
      if (vessels && Array.isArray(vessels)) {
        await Vessel.deleteMany({}, { session });
        if (vessels.length > 0) {
          await Vessel.insertMany(vessels.map(v => {
            const clean = { ...v };
            delete clean._id;
            delete clean.__v;
            return clean;
          }), { session });
        }
      }
      
      if (users && Array.isArray(users)) {
        await User.deleteMany({ email: { $ne: ADMIN_EMAIL } }, { session });
        const nonAdminUsers = users.filter(u => u.email !== ADMIN_EMAIL);
        if (nonAdminUsers.length > 0) {
          const cleanedUsers = nonAdminUsers.map(u => {
            const clean = { ...u };
            delete clean._id;
            delete clean.__v;
            delete clean.refreshTokens;
            return clean;
          });
          await User.insertMany(cleanedUsers, { session });
        }
      }
      
      if (tickets && Array.isArray(tickets)) {
        await Ticket.deleteMany({}, { session });
        if (tickets.length > 0) {
          await Ticket.insertMany(tickets.map(t => {
            const clean = { ...t };
            delete clean._id;
            delete clean.__v;
            return clean;
          }), { session });
        }
      }
      
      if (logs && Array.isArray(logs)) {
        await Log.deleteMany({}, { session });
        if (logs.length > 0) {
          await Log.insertMany(logs.map(l => {
            const clean = { ...l };
            delete clean._id;
            delete clean.__v;
            return clean;
          }), { session });
        }
      }
      
      if (locations && Array.isArray(locations)) {
        await Location.deleteMany({}, { session });
        if (locations.length > 0) {
          await Location.insertMany(locations.map(l => {
            const clean = { ...l };
            delete clean._id;
            delete clean.__v;
            return clean;
          }), { session });
        }
      }
      
      if (notes && Array.isArray(notes)) {
        await NoteVerbale.deleteMany({}, { session });
        if (notes.length > 0) {
          await NoteVerbale.insertMany(notes.map(n => {
            const clean = { ...n };
            delete clean._id;
            delete clean.__v;
            return clean;
          }), { session });
        }
      }
      
      await session.commitTransaction();
      await logAction(req.user, 'استيراد بيانات', 'تم استيراد جميع البيانات بنجاح', req);
      
      res.json({ 
        success: true, 
        message: '✅ تم استيراد البيانات بنجاح',
        backupId: Date.now().toString()
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    logger.error('Import error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطأ في استيراد البيانات: ' + error.message
    });
  }
});

// ============================================================
// ❤️ Health
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: getCurrentDateTime(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// ============================================================
// 🏠 Home
// ============================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// 🔑 Create Admin (بدون طباعة كلمة المرور)
// ============================================================
async function createAdmin() {
  try {
    const adminExists = await User.findOne({ email: ADMIN_EMAIL });
    if (!adminExists) {
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);
      
      const admin = new User({
        name: 'Admin',
        email: ADMIN_EMAIL,
        pass: hashedPassword,
        role: 'مسؤول',
        permissions: Object.values(PERMISSIONS),
        isActive: true
      });
      
      await admin.save();
      logger.info('✅ تم إنشاء حساب المسؤول');
      logger.info(`📧 البريد: ${ADMIN_EMAIL}`);
      // ✅ لا نطبع كلمة المرور أبداً
    }
  } catch (error) {
    logger.warn('⚠️ Admin error:', error.message);
  }
}

// ============================================================
// ✅ Error Handler
// ============================================================
app.use(errorHandler);

// ============================================================
// 🚀 Start Server
// ============================================================
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', async () => {
  logger.info(`🚀 Server: http://localhost:${PORT}`);
  logger.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🕐 Timezone: ${TIMEZONE}`);
  await createAdmin();
  logger.info('========================================');
  logger.info('🔒 الوضع: آمن - احترافي - 10/10');
  logger.info(`📧 ${ADMIN_EMAIL}`);
  logger.info('========================================');
});

// ============================================================
// 🔌 Graceful Shutdown
// ============================================================
const gracefulShutdown = async (signal) => {
  logger.info(`\n🛑 ${signal} received, shutting down...`);
  
  try {
    server.close(async () => {
      logger.info('✅ HTTP server closed');
      await mongoose.connection.close();
      logger.info('✅ MongoDB disconnected');
      process.exit(0);
    });
  } catch (error) {
    logger.error('❌ Shutdown error:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
