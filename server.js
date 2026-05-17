const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const requestIp = require('request-ip');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const UAParser = require('ua-parser-js');
const { v4: uuidv4 } = require('uuid');
const xss = require('xss');
const winston = require('winston');
require('dotenv').config();

const app = express();
const isProd = process.env.NODE_ENV === 'production';
const isDev = !isProd;
const PORT = process.env.PORT || 5000;
const DUMMY_HASH = bcrypt.hashSync('dummy', 10);
const SEARCH_MAX_LENGTH = 50;

// ================= LOGGER =================
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.Console({ format: winston.format.simple() }),
        new winston.transports.File({ filename: 'error.log', level: 'error' })
    ]
});

// ================= CONFIG =================
const config = {
    jwt: { secret: process.env.JWT_SECRET, refreshSecret: process.env.JWT_REFRESH_SECRET, expiresIn: '24h', refreshExpiresIn: '7d', algorithm: 'HS256', issuer: 'marine', audience: 'users' },
    mongodb: { uri: process.env.MONGO_URI, options: { maxPoolSize: 10, serverSelectionTimeoutMS: 5000 } },
    cors: { allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean) },
    rateLimit: { windowMs: 15 * 60 * 1000, max: 100, loginMax: 10, ipMax: 30 },
    bruteForce: { maxAttempts: 10, blockTime: 3600000 }
};

if (!config.jwt.secret || !config.jwt.refreshSecret || !config.mongodb.uri) {
    logger.error('Missing required env vars');
    process.exit(1);
}

// ================= SECURITY =================
app.disable('x-powered-by');
app.set('trust proxy', isDev ? false : 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(requestIp.mw());

// Request ID
app.use((req, res, next) => {
    req.requestId = uuidv4();
    res.setHeader('X-Request-Id', req.requestId);
    next();
});

// XSS Sanitizer (آمن)
const sanitize = (obj, depth = 0) => {
    if (depth > 10 || !obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(v => typeof v === 'string' ? xss(v) : sanitize(v, depth + 1));
    if (obj instanceof Date || obj instanceof mongoose.Types.ObjectId) return obj;
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
        clean[k] = typeof v === 'string' ? xss(v) : (v && typeof v === 'object') ? sanitize(v, depth + 1) : v;
    }
    return clean;
};
app.use((req, _, next) => { req.body = sanitize(req.body); req.query = sanitize(req.query); next(); });

// CORS
app.use(cors({ origin: isDev ? '*' : config.cors.allowedOrigins, credentials: true }));

// Rate limiting (بدون Redis اختياري)
const limiter = rateLimit({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max, keyGenerator: req => requestIp.getClientIp(req) || req.ip });
const loginLimiter = rateLimit({ windowMs: 15*60*1000, max: config.rateLimit.loginMax, skipSuccessfulRequests: true });
app.use('/api/', limiter);

// ================= MODELS =================
const userSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true, minlength: 3 },
    pass: { type: String, required: true },
    role: { type: String, default: 'مشاهد', enum: ['مسؤول', 'محرر', 'مشاهد'] },
    enabled: { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0 },
    lastLogin: Date, lastLoginIP: String
}, { timestamps: true });
userSchema.pre('save', async function(next) { if (this.isModified('pass')) this.pass = await bcrypt.hash(this.pass, 12); next(); });
userSchema.methods.comparePassword = function(candidate) { return bcrypt.compare(candidate, this.pass); };
const User = mongoose.model('User', userSchema);

const vesselSchema = new mongoose.Schema({
    name: { type: String, required: true }, num: { type: String, unique: true, sparse: true }, len: Number, reg: String, zone: String, port: String, stat: { type: String, default: 'صالح' }, cat: String
}, { timestamps: true });
vesselSchema.index({ name: 1 });
const Vessel = mongoose.model('Vessel', vesselSchema);

const ticketSchema = new mongoose.Schema({
    userName: String, userRole: String, subject: String, message: String,
    status: { type: String, default: 'قيد المعالجة' }, replies: Array,
    date: String, time: String
}, { timestamps: true });
const Ticket = mongoose.model('Ticket', ticketSchema);

const logSchema = new mongoose.Schema({
    requestId: String, userName: String, action: String, details: String, ip: String, device: String
}, { timestamps: true });
const Log = mongoose.model('Log', logSchema);

// ================= HELPERS =================
function getDate() { const d = new Date(); return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`; }
function getTime() { const d = new Date(); return `${d.getHours()}:${d.getMinutes()}`; }
function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function formatDoc(doc) { if (!doc) return null; const obj = doc.toObject(); const { _id, __v, pass, ...rest } = obj; return { ...rest, id: _id.toString() }; }
function formatArray(arr) { return arr.map(formatDoc); }
async function logAction(userName, role, action, detail, req) {
    const entry = { requestId: req?.requestId, userName, role, action, detail, ip: requestIp.getClientIp(req), device: req?.headers['user-agent'] };
    Log.create(entry).catch(e => logger.error(e));
}

// ================= AUTH MIDDLEWARE =================
const auth = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, config.jwt.secret);
        const user = await User.findById(decoded.userId);
        if (!user || !user.enabled || decoded.tokenVersion !== user.tokenVersion) return res.status(401).json({ error: 'Invalid token' });
        req.user = user;
        req.userId = user._id;
        req.userRole = user.role;
        req.userName = user.name;
        next();
    } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
};
const admin = (req, res, next) => { if (req.userRole !== 'مسؤول') return res.status(403).json({ error: 'Forbidden' }); next(); };
const editor = (req, res, next) => { if (!['مسؤول', 'محرر'].includes(req.userRole)) return res.status(403).json({ error: 'Forbidden' }); next(); };

// ================= AUTH ROUTES =================
app.post('/api/login', loginLimiter, async (req, res) => {
    const { name, pass } = req.body;
    const user = await User.findOne({ name });
    let ok = false;
    if (user) ok = await user.comparePassword(pass);
    else await bcrypt.compare(pass, DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: user._id, role: user.role, name: user.name, tokenVersion: user.tokenVersion }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
    user.lastLogin = new Date();
    user.lastLoginIP = requestIp.getClientIp(req);
    await user.save();
    await logAction(user.name, user.role, 'تسجيل دخول', 'ناجح', req);
    res.json({ token, name: user.name, role: user.role });
});

app.post('/api/logout', auth, async (req, res) => {
    await logAction(req.userName, req.userRole, 'تسجيل خروج', '', req);
    res.json({ success: true });
});

app.get('/api/verify', auth, (req, res) => {
    res.json({ valid: true, name: req.userName, role: req.userRole, user: formatDoc(req.user) });
});

// ================= VESSEL ROUTES (مصفوفة مباشرة) =================
app.get('/api/vessels', async (req, res) => {
    let query = {};
    if (req.query.search) {
        const escaped = escapeRegex(req.query.search.substring(0, SEARCH_MAX_LENGTH));
        if (escaped) query = { $or: [{ name: { $regex: escaped, $options: 'i' } }, { num: { $regex: escaped, $options: 'i' } }] };
    }
    const vessels = await Vessel.find(query).sort({ createdAt: -1 });
    res.json(formatArray(vessels));
});

app.get('/api/vessels/all', async (req, res) => {
    const vessels = await Vessel.find().sort({ name: 1 });
    res.json(formatArray(vessels));
});

app.get('/api/vessels/:id', async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
    const vessel = await Vessel.findById(req.params.id);
    if (!vessel) return res.status(404).json({ error: 'غير موجود' });
    res.json(formatDoc(vessel));
});

app.post('/api/vessels', auth, editor, async (req, res) => {
    const vessel = await Vessel.create(req.body);
    await logAction(req.userName, req.userRole, 'إضافة مركب', vessel.name, req);
    res.status(201).json(formatDoc(vessel));
});

app.put('/api/vessels/:id', auth, editor, async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
    const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!vessel) return res.status(404).json({ error: 'غير موجود' });
    await logAction(req.userName, req.userRole, 'تعديل مركب', vessel.name, req);
    res.json(formatDoc(vessel));
});

app.delete('/api/vessels/:id', auth, admin, async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
    const vessel = await Vessel.findByIdAndDelete(req.params.id);
    if (!vessel) return res.status(404).json({ error: 'غير موجود' });
    await logAction(req.userName, req.userRole, 'حذف مركب', vessel.name, req);
    res.json({ success: true });
});

// ================= TICKET ROUTES =================
app.get('/api/tickets', auth, async (req, res) => {
    let query = {};
    if (req.userRole === 'مشاهد') query.userName = req.userName;
    const tickets = await Ticket.find(query).sort({ createdAt: -1 });
    res.json(formatArray(tickets));
});

app.get('/api/tickets/:id', auth, async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'غير موجود' });
    if (req.userRole === 'مشاهد' && ticket.userName !== req.userName) return res.status(403).json({ error: 'Forbidden' });
    res.json(formatDoc(ticket));
});

app.post('/api/tickets', auth, async (req, res) => {
    const { subject, message } = req.body;
    if (!subject || subject.length < 3 || !message || message.length < 5) return res.status(400).json({ error: 'بيانات ناقصة' });
    const ticket = await Ticket.create({
        userName: req.userName, userRole: req.userRole, subject, message,
        date: getDate(), time: getTime(), status: 'قيد المعالجة', replies: []
    });
    await logAction(req.userName, req.userRole, 'إنشاء تذكرة', subject, req);
    res.status(201).json(formatDoc(ticket));
});

app.post('/api/tickets/:id/reply', auth, async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'غير موجود' });
    if (req.userRole === 'مشاهد' && ticket.userName !== req.userName) return res.status(403).json({ error: 'Forbidden' });
    const { message } = req.body;
    if (!message || message.length < 2) return res.status(400).json({ error: 'الرد قصير' });
    ticket.replies.push({ message, date: getDate(), time: getTime(), by: req.userName, role: req.userRole });
    ticket.status = 'تم الرد';
    await ticket.save();
    await logAction(req.userName, req.userRole, 'رد على تذكرة', ticket.subject, req);
    res.json(formatDoc(ticket));
});

app.put('/api/tickets/:id/close', auth, async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'غير موجود' });
    if (req.userRole === 'مشاهد' && ticket.userName !== req.userName) return res.status(403).json({ error: 'Forbidden' });
    ticket.status = 'مغلقة';
    await ticket.save();
    await logAction(req.userName, req.userRole, 'إغلاق تذكرة', ticket.subject, req);
    res.json({ success: true });
});

// ================= USER MANAGEMENT (مصفوفة مباشرة) =================
app.get('/api/users', auth, admin, async (req, res) => {
    const users = await User.find().select('-pass').sort({ createdAt: -1 });
    res.json(formatArray(users));
});

app.post('/api/users', auth, admin, async (req, res) => {
    const { name, pass, role } = req.body;
    if (!name || name.length < 3 || !pass || pass.length < 8) return res.status(400).json({ error: 'بيانات غير صالحة' });
    const exists = await User.findOne({ name });
    if (exists) return res.status(400).json({ error: 'اسم مستخدم موجود' });
    const user = await User.create({ name, pass, role: role || 'مشاهد', enabled: true });
    await logAction(req.userName, req.userRole, 'إنشاء مستخدم', name, req);
    res.status(201).json(formatDoc(user));
});

app.put('/api/users/:id', auth, admin, async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'غير موجود' });
    if (req.body.name && req.body.name !== user.name) {
        const dup = await User.findOne({ name: req.body.name });
        if (dup) return res.status(400).json({ error: 'اسم مستخدم موجود' });
        user.name = req.body.name;
    }
    if (req.body.pass) { user.pass = req.body.pass; user.tokenVersion++; }
    if (req.body.role) user.role = req.body.role;
    if (req.body.enabled !== undefined && user.enabled !== req.body.enabled) {
        user.enabled = req.body.enabled;
        if (!user.enabled) user.tokenVersion++;
    }
    await user.save();
    await logAction(req.userName, req.userRole, 'تعديل مستخدم', user.name, req);
    res.json(formatDoc(user));
});

app.delete('/api/users/:id', auth, admin, async (req, res) => {
    if (req.userId === req.params.id) return res.status(400).json({ error: 'لا يمكن حذف نفسك' });
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'غير موجود' });
    await logAction(req.userName, req.userRole, 'حذف مستخدم', user.name, req);
    res.json({ success: true });
});

// ================= LOGS =================
app.get('/api/logs', auth, admin, async (req, res) => {
    const logs = await Log.find().sort({ createdAt: -1 }).limit(200);
    res.json(formatArray(logs));
});

// ================= STATS =================
app.get('/api/stats', auth, admin, async (req, res) => {
    const vessels = await Vessel.countDocuments();
    const tickets = await Ticket.countDocuments();
    const users = await User.countDocuments();
    res.json({ vessels, tickets, users });
});

// ================= HEALTH =================
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', mongo: mongoose.connection.readyState === 1, timestamp: new Date() });
});

// ================= ERROR HANDLING =================
app.use((err, req, res, next) => {
    logger.error(err.stack);
    res.status(500).json({ error: 'خطأ داخلي' });
});

// ================= START SERVER =================
mongoose.connect(config.mongodb.uri, config.mongodb.options)
    .then(async () => {
        logger.info('MongoDB connected');
        if (process.env.CREATE_DEFAULT_USERS === 'true') {
            const admin = await User.findOne({ name: 'admin' });
            if (!admin) {
                await User.create({ name: 'admin', pass: 'Admin@123456', role: 'مسؤول', enabled: true });
                await User.create({ name: 'editor', pass: 'Editor@123456', role: 'محرر', enabled: true });
                await User.create({ name: 'viewer', pass: 'Viewer@123456', role: 'مشاهد', enabled: true });
                logger.info('Default users created');
            }
        }
        if (process.env.CREATE_DEFAULT_VESSELS === 'true') {
            const count = await Vessel.countDocuments();
            if (count === 0) {
                await Vessel.insertMany([
                    { name: "البروق 1", num: "B001", len: 11, reg: "الشمال", stat: "صالح", cat: "البروق" },
                    { name: "صقر 1", num: "S001", len: 10, reg: "الساحل", stat: "صالح", cat: "صقور" },
                    { name: "خافرة 1", num: "K001", len: 20, reg: "الوسط", stat: "معطب", cat: "خوافر" }
                ]);
                logger.info('Default vessels created');
            }
        }
        app.listen(PORT, '0.0.0.0', () => {
            logger.info(`🚀 Server running on http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        logger.error('MongoDB connection error:', err.message);
        process.exit(1);
    });
