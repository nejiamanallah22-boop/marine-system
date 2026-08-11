require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

// ============================================================
// ==================== التكوين ====================
// ============================================================

const CONFIG = {
    version: '8.0.0',
    jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
    refreshSecret: process.env.REFRESH_SECRET || crypto.randomBytes(64).toString('hex'),
    tokenExpiry: '7d',
    refreshExpiry: '30d',
    sessionTimeout: 3600000, // 1 ساعة
    maxRefreshAttempts: 3
};

// ============================================================
// ==================== Middleware ====================
// ============================================================

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'",
                "https://cdn.jsdelivr.net", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net",
                "https://unpkg.com", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https://unpkg.com", "https://cdn.jsdelivr.net",
                "https://*.tile.openstreetmap.org", "https://*.basemaps.cartocdn.com"],
            connectSrc: ["'self'", "https://*.tile.openstreetmap.org",
                "https://*.basemaps.cartocdn.com", "https://cdn.jsdelivr.net",
                "https://unpkg.com", "https://cdnjs.cloudflare.com"]
        }
    }
}));

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: '⚠️ تجاوزت الحد المسموح'
}));

// ============================================================
// ==================== قاعدة البيانات ====================
// ============================================================

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/marine_db';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
});

mongoose.connection.on('connected', () => {
    console.log('✅ متصل بقاعدة البيانات MongoDB بنجاح!');
    initializeDefaultUsers();
});

mongoose.connection.on('error', (err) => {
    console.error('❌ خطأ في MongoDB:', err.message);
});

mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ تم فقدان الاتصال بقاعدة البيانات');
});

// ============================================================
// ==================== نماذج البيانات ====================
// ============================================================

// ===== نموذج المستخدمين =====
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    email: { type: String, unique: true, sparse: true, trim: true },
    pass: { type: String, required: true },
    role: { type: String, enum: ['admin', 'manager', 'editor', 'viewer'], default: 'viewer' },
    isActive: { type: Boolean, default: true },
    refreshToken: { type: String },
    lastLogin: { type: Date },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

// ===== نموذج المراكب =====
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

const Vessel = mongoose.model('Vessel', VesselSchema);

// ===== نموذج الصيانة =====
const MaintenanceSchema = new mongoose.Schema({
    vesselName: { type: String, required: true },
    vesselId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel' },
    type: { type: String, required: true },
    description: { type: String },
    technician: { type: String },
    cost: { type: Number, default: 0 },
    status: { type: String, enum: ['قيد الإنجاز', 'مكتملة', 'ملغاة'], default: 'قيد الإنجاز' },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    notes: { type: String }
}, { timestamps: true });

const Maintenance = mongoose.model('Maintenance', MaintenanceSchema);

// ===== نموذج التذاكر =====
const TicketSchema = new mongoose.Schema({
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    status: { type: String, enum: ['قيد المعالجة', 'تم الرد', 'مغلقة'], default: 'قيد المعالجة' },
    replies: [{
        adminName: { type: String, required: true },
        reply: { type: String, required: true },
        date: { type: String, required: true },
        time: { type: String, required: true }
    }]
}, { timestamps: true });

const Ticket = mongoose.model('Ticket', TicketSchema);

// ===== نموذج المواقع =====
const LocationSchema = new mongoose.Schema({
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
    action: { type: String, default: 'تحديث موقع' },
    ip: { type: String },
    userAgent: { type: String },
    device: { type: String },
    browser: { type: String }
}, { timestamps: true });

const Location = mongoose.model('Location', LocationSchema);

// ===== نموذج Note Verbale =====
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

const NoteVerbale = mongoose.model('NoteVerbale', NoteVerbaleSchema);

// ===== نموذج المحادثات (AI Assistant) =====
const ConversationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String },
    messages: [{
        role: { type: String, enum: ['user', 'ai'], required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const Conversation = mongoose.model('Conversation', ConversationSchema);

// ============================================================
// ==================== دوال مساعدة ====================
// ============================================================

function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

function getWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function extractDevice(userAgent) {
    if (!userAgent) return 'غير معروف';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Macintosh')) return 'Mac';
    if (userAgent.includes('Linux')) return 'Linux';
    return 'غير معروف';
}

function extractBrowser(userAgent) {
    if (!userAgent) return 'غير معروف';
    if (userAgent.includes('Edg') || userAgent.includes('Edge')) return 'Edge';
    if (userAgent.includes('Opera') || userAgent.includes('OPR')) return 'Opera';
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    return 'غير معروف';
}

function generateTokens(user) {
    const accessToken = jwt.sign(
        { id: user._id, name: user.name, email: user.email, role: user.role },
        CONFIG.jwtSecret,
        { expiresIn: CONFIG.tokenExpiry }
    );
    
    const refreshToken = jwt.sign(
        { id: user._id },
        CONFIG.refreshSecret,
        { expiresIn: CONFIG.refreshExpiry }
    );
    
    return { accessToken, refreshToken };
}

function verifyRefreshToken(token) {
    try {
        return jwt.verify(token, CONFIG.refreshSecret);
    } catch (e) {
        return null;
    }
}

// ============================================================
// ==================== المصادقة ====================
// ============================================================

const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, error: 'غير مصرح به - الرجاء تسجيل الدخول' });
        }
        
        const decoded = jwt.verify(token, CONFIG.jwtSecret);
        const user = await User.findById(decoded.id);
        
        if (!user || !user.isActive) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود أو معطل' });
        }
        
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'رمز مصادقة غير صالح' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'غير مصرح به - صلاحية غير كافية' });
        }
        next();
    };
};

// ============================================================
// ==================== API Routes ====================
// ============================================================

// ===== المصادقة =====
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
        }

        const user = await User.findOne({ $or: [{ email }, { name: email }] });
        if (!user || !user.isActive) {
            return res.status(401).json({ success: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
        }

        const isMatch = await bcrypt.compare(password, user.pass);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
        }

        const { accessToken, refreshToken } = generateTokens(user);
        
        user.refreshToken = refreshToken;
        user.lastLogin = new Date();
        await user.save();

        res.json({
            success: true,
            token: accessToken,
            refreshToken: refreshToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isActive: user.isActive
            }
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ success: false, error: 'خطأ في السيرفر' });
    }
});

app.post('/api/auth/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ success: false, error: 'Refresh token مطلوب' });
        }

        const decoded = verifyRefreshToken(refreshToken);
        if (!decoded) {
            return res.status(401).json({ success: false, error: 'Refresh token غير صالح' });
        }

        const user = await User.findById(decoded.id);
        if (!user || !user.isActive || user.refreshToken !== refreshToken) {
            return res.status(401).json({ success: false, error: 'Refresh token غير صالح' });
        }

        const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
        
        user.refreshToken = newRefreshToken;
        await user.save();

        res.json({
            success: true,
            token: accessToken,
            refreshToken: newRefreshToken
        });
    } catch (error) {
        console.error('❌ Refresh error:', error);
        res.status(500).json({ success: false, error: 'خطأ في تجديد التوكن' });
    }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (user) {
            user.refreshToken = null;
            await user.save();
        }
        res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/auth/verify', authenticate, async (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            isActive: req.user.isActive
        }
    });
});

// ===== إدارة المستخدمين =====
app.get('/api/users', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const users = await User.find().select('-pass -refreshToken');
        res.json(users);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/users', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        
        if (!name || !password) {
            return res.status(400).json({ success: false, error: 'يرجى إدخال الاسم وكلمة المرور' });
        }
        
        if (password.length < 4) {
            return res.status(400).json({ success: false, error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
        }
        
        const existing = await User.findOne({ $or: [{ name }, { email }] });
        if (existing) {
            return res.status(400).json({ success: false, error: 'اسم المستخدم أو البريد الإلكتروني موجود بالفعل' });
        }
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const user = new User({
            name,
            email,
            pass: hashedPassword,
            role: role || 'viewer',
            isActive: true
        });
        
        await user.save();
        
        const userData = user.toObject();
        delete userData.pass;
        delete userData.refreshToken;
        
        res.status(201).json({ success: true, message: '✅ تم إضافة المستخدم بنجاح', user: userData });
    } catch (error) {
        console.error('❌ خطأ في إضافة المستخدم:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/users/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { pass, ...updateData } = req.body;
        if (pass) {
            const salt = await bcrypt.genSalt(10);
            updateData.pass = await bcrypt.hash(pass, salt);
        }
        const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-pass -refreshToken');
        if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        res.json({ success: true, message: 'تم تحديث المستخدم', user });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.delete('/api/users/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        if (user.name === 'admin') {
            return res.status(400).json({ success: false, error: 'لا يمكن حذف المستخدم admin' });
        }
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'تم حذف المستخدم' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== المراكب =====
app.get('/api/vessels', authenticate, async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/vessels', authenticate, authorize('admin', 'manager', 'editor'), async (req, res) => {
    try {
        const data = req.body;
        const n = parseFloat(data.len);
        if (n === 11) data.cat = 'البروق';
        else if (n >= 8 && n <= 12) data.cat = 'صقور';
        else if (n > 12 && n <= 25) data.cat = 'خوافر';
        else if (n > 30) data.cat = 'طوافات';
        else data.cat = 'زوارق مزدوجة';
        
        const vessel = new Vessel(data);
        await vessel.save();
        res.status(201).json({ success: true, vessel });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.put('/api/vessels/:id', authenticate, authorize('admin', 'manager', 'editor'), async (req, res) => {
    try {
        const data = req.body;
        const n = parseFloat(data.len);
        if (n === 11) data.cat = 'البروق';
        else if (n >= 8 && n <= 12) data.cat = 'صقور';
        else if (n > 12 && n <= 25) data.cat = 'خوافر';
        else if (n > 30) data.cat = 'طوافات';
        else data.cat = 'زوارق مزدوجة';
        
        const vessel = await Vessel.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
        if (!vessel) return res.status(404).json({ success: false, error: 'المركب غير موجود' });
        res.json({ success: true, vessel });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.delete('/api/vessels/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const vessel = await Vessel.findByIdAndDelete(req.params.id);
        if (!vessel) return res.status(404).json({ success: false, error: 'المركب غير موجود' });
        res.json({ success: true, message: 'تم حذف المركب بنجاح' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== الصيانة =====
app.get('/api/maintenance', authenticate, async (req, res) => {
    try {
        const records = await Maintenance.find().sort({ createdAt: -1 });
        res.json(records);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/maintenance', authenticate, authorize('admin', 'manager', 'editor'), async (req, res) => {
    try {
        const record = new Maintenance(req.body);
        await record.save();
        res.status(201).json({ success: true, record });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.put('/api/maintenance/:id', authenticate, authorize('admin', 'manager', 'editor'), async (req, res) => {
    try {
        const record = await Maintenance.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!record) return res.status(404).json({ success: false, error: 'السجل غير موجود' });
        res.json({ success: true, record });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.delete('/api/maintenance/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const record = await Maintenance.findByIdAndDelete(req.params.id);
        if (!record) return res.status(404).json({ success: false, error: 'السجل غير موجود' });
        res.json({ success: true, message: 'تم حذف السجل' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== التذاكر =====
app.get('/api/tickets', authenticate, async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        res.json(tickets);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/tickets', authenticate, async (req, res) => {
    try {
        const ticket = new Ticket({
            ...req.body,
            userName: req.user.name,
            userRole: req.user.role
        });
        await ticket.save();
        res.status(201).json({ success: true, ticket });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.put('/api/tickets/:id/reply', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ success: false, error: 'التذكرة غير موجودة' });
        
        ticket.replies.push({
            adminName: req.user.name,
            reply: req.body.reply,
            date: new Date().toISOString().split('T')[0],
            time: getCurrentTime()
        });
        ticket.status = 'تم الرد';
        await ticket.save();
        res.json({ success: true, ticket });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.put('/api/tickets/:id/close', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ success: false, error: 'التذكرة غير موجودة' });
        ticket.status = 'مغلقة';
        await ticket.save();
        res.json({ success: true, ticket });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ===== المواقع =====
app.get('/api/locations', authenticate, async (req, res) => {
    try {
        const locations = await Location.find().sort({ timestamp: -1 });
        res.json(locations);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/locations', authenticate, async (req, res) => {
    try {
        const { lat, lng, action } = req.body;
        if (lat == null || lng == null || isNaN(Number(lat)) || isNaN(Number(lng))) {
            return res.status(400).json({ success: false, error: 'إحداثيات غير صالحة' });
        }
        
        const userAgent = req.headers['user-agent'] || 'غير معروف';
        const location = new Location({
            userName: req.user.name,
            userRole: req.user.role,
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            action: action || 'تحديث موقع',
            ip: req.ip || req.connection.remoteAddress,
            userAgent: userAgent,
            device: extractDevice(userAgent),
            browser: extractBrowser(userAgent)
        });
        await location.save();
        res.status(201).json({ success: true, location });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ===== Note Verbale =====
app.post('/api/notes', authenticate, async (req, res) => {
    try {
        const { title, content, date, time, week, type, imageData, attachments } = req.body;
        if (!title || !content || !date) {
            return res.status(400).json({ success: false, error: 'العنوان والمحتوى والتاريخ مطلوبة' });
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
        res.status(201).json({ success: true, note });
    } catch (error) {
        console.error('❌ خطأ في حفظ المذكرة:', error);
        res.status(400).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/notes/latest', authenticate, async (req, res) => {
    try {
        const note = await NoteVerbale.findOne().sort({ createdAt: -1 });
        res.json(note || null);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/notes/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        await NoteVerbale.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'تم حذف المذكرة' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== المساعد الذكي (AI Assistant) =====
app.post('/api/ai/ask', authenticate, async (req, res) => {
    try {
        const { message, conversationId } = req.body;
        
        if (!message) {
            return res.status(400).json({ success: false, error: 'الرسالة مطلوبة' });
        }
        
        // البحث عن المحادثة أو إنشاء جديدة
        let conversation = null;
        if (conversationId) {
            conversation = await Conversation.findById(conversationId);
        }
        
        if (!conversation) {
            conversation = new Conversation({
                userId: req.user._id,
                userName: req.user.name,
                messages: []
            });
        }
        
        // إضافة رسالة المستخدم
        conversation.messages.push({
            role: 'user',
            content: message
        });
        
        // إنشاء رد ذكي (محاكاة)
        const aiResponse = generateAIResponse(message, req.user);
        
        // إضافة رد المساعد
        conversation.messages.push({
            role: 'ai',
            content: aiResponse
        });
        
        conversation.updatedAt = new Date();
        await conversation.save();
        
        res.json({
            success: true,
            response: aiResponse,
            conversationId: conversation._id
        });
        
    } catch (error) {
        console.error('❌ AI error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== توليد ردود المساعد الذكي =====
function generateAIResponse(message, user) {
    const msg = message.toLowerCase();
    
    // ردود مخصصة
    if (msg.includes('مرحب') || msg.includes('السلام') || msg.includes('hello')) {
        return `👋 مرحباً ${user.name}! كيف يمكنني مساعدتك اليوم؟\n\nأنا المساعد الذكي لمنظومة الوسائل البحرية. يمكنني مساعدتك في:\n• 📊 عرض إحصائيات الأسطول\n• 🚢 البحث عن مراكب معينة\n• 🔧 تتبع الصيانة\n• 📝 إنشاء تقارير\n• 💡 تقديم نصائح لإدارة الأسطول`;
    }
    
    if (msg.includes('الأسطول') || msg.includes('المراكب') || msg.includes('السفن')) {
        return `🚢 **الأسطول البحري**\n\n📊 الإحصائيات الحالية:\n• ✅ صالح للخدمة: 12 مركب\n• 🔧 تحت الصيانة: 3 مراكب\n• ❌ معطوب: 2 مراكب\n\n💡 نصيحة: يوصى بجدولة صيانة دورية للمراكب التي تجاوزت 6 أشهر من آخر صيانة.`;
    }
    
    if (msg.includes('صيانة') || msg.includes('تعطل') || msg.includes('عطل')) {
        return `🔧 **الصيانة**\n\n📋 سجل الصيانة الحالي:\n• عدد الأعطال المسجلة: 5\n• تحت الإنجاز: 3\n• مكتملة: 2\n\n💡 يوصى بتسجيل كل عطل بشكل مفصل لتسهيل تتبعه وحله بسرعة.`;
    }
    
    if (msg.includes('تقرير') || msg.includes('إحصاء') || msg.includes('stats')) {
        return `📊 **التقارير والإحصائيات**\n\nيمكنني تزويدك بالتقارير التالية:\n1. 📈 تقرير النجاعة العامة\n2. 🚢 تقرير حالة الأسطول\n3. 🔧 تقرير الصيانة الدوري\n4. 👥 تقرير أداء المستخدمين\n5. 📝 تقرير المذكرات (Note Verbale)\n\nيرجى تحديد التقرير الذي ترغب في الحصول عليه.`;
    }
    
    if (msg.includes('مساعدة') || msg.includes('help')) {
        return `📚 **قائمة المساعدة**\n\nالأوامر المتاحة:\n• 📊 "إحصائيات" - عرض إحصائيات الأسطول\n• 🚢 "الأسطول" - معلومات عن المراكب\n• 🔧 "الصيانة" - سجل الصيانة\n• 📝 "مذكرة" - إنشاء مذكرة جديدة\n• 👥 "المستخدمين" - إدارة المستخدمين\n• 📈 "تقرير" - تقارير وإحصائيات\n• 💬 "مساعدة" - عرض هذه القائمة`;
    }
    
    // ردود عامة
    const responses = [
        `📌 **${user.name}**، شكراً لسؤالك.\n\nسأقوم بتحليل طلبك وسأعود إليك بأفضل إجابة. هل يمكنك توضيح سؤالك أكثر؟`,
        `🤔 **فهمت طلبك**، لكني أحتاج إلى بعض التفاصيل الإضافية لتقديم إجابة دقيقة. الرجاء تحديد المعلومات التي تبحث عنها.`,
        `✅ **تم استلام طلبك**، سأقوم بمعالجته الآن. انتظر لحظة وسأقدم لك الإجابة الكاملة.`,
        `💡 **فكرة جيدة!** سأقدم لك أفضل الحلول بناءً على خبرتي في إدارة الأسطول البحري.`
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
}

// ===== تصدير واستيراد =====
app.get('/api/export-all', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        const vessels = await Vessel.find();
        const users = await User.find().select('-pass -refreshToken');
        const tickets = await Ticket.find();
        const locations = await Location.find();
        const notes = await NoteVerbale.find();
        const maintenance = await Maintenance.find();
        
        res.json({
            success: true,
            data: { vessels, users, tickets, locations, notes, maintenance }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/import-all', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { vessels, users, tickets, locations, notes, maintenance } = req.body;
        
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
        
        if (locations && Array.isArray(locations)) {
            await Location.deleteMany({});
            await Location.insertMany(locations);
        }
        
        if (notes && Array.isArray(notes)) {
            await NoteVerbale.deleteMany({});
            await NoteVerbale.insertMany(notes);
        }
        
        if (maintenance && Array.isArray(maintenance)) {
            await Maintenance.deleteMany({});
            await Maintenance.insertMany(maintenance);
        }
        
        res.json({ success: true, message: '✅ تم استيراد البيانات بنجاح' });
    } catch (error) {
        console.error('❌ خطأ في استيراد البيانات:', error);
        res.status(500).json({ success: false, error: 'خطأ في استيراد البيانات: ' + error.message });
    }
});

// ===== مسار الصحة =====
app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: CONFIG.version, timestamp: new Date().toISOString() });
});

// ============================================================
// ==================== تقديم الملفات الثابتة ====================
// ============================================================

app.use(express.static(path.join(__dirname, 'public')));

// ===== صفحات التطبيق (للتحميل الديناميكي) =====
app.get('/pages/:page.html', (req, res) => {
    const page = req.params.page;
    const pagePath = path.join(__dirname, 'public', 'pages', `${page}.html`);
    res.sendFile(pagePath, (err) => {
        if (err) {
            res.status(404).send(`<h1>❌ الصفحة ${page} غير موجودة</h1>`);
        }
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// ==================== Socket.IO ====================
// ============================================================

const connectedUsers = {};

io.on('connection', (socket) => {
    console.log('📡 مستخدم متصل:', socket.id);
    
    socket.on('user-connected', (data) => {
        if (data.lat != null && data.lng != null && !isNaN(data.lat) && !isNaN(data.lng)) {
            const ua = socket.handshake.headers['user-agent'] || '';
            
            connectedUsers[socket.id] = {
                id: socket.id,
                userName: data.userName,
                userRole: data.userRole,
                lat: data.lat,
                lng: data.lng,
                connectedAt: new Date().toISOString(),
                lastUpdate: new Date().toISOString(),
                ip: socket.handshake.address || 'غير معروف',
                device: extractDevice(ua),
                browser: extractBrowser(ua)
            };
            console.log('👥 مستخدم متصل:', data.userName);
            io.emit('user-list', Object.values(connectedUsers));
        }
    });
    
    socket.on('update-location', (data) => {
        if (connectedUsers[socket.id] && data.lat != null && data.lng != null && !isNaN(data.lat) && !isNaN(data.lng)) {
            connectedUsers[socket.id].lat = data.lat;
            connectedUsers[socket.id].lng = data.lng;
            connectedUsers[socket.id].lastUpdate = new Date().toISOString();
            socket.broadcast.emit('receive-location', {
                userName: data.userName,
                userRole: data.userRole,
                lat: data.lat,
                lng: data.lng,
                time: new Date().toISOString()
            });
        }
    });
    
    socket.on('disconnect', () => {
        const user = connectedUsers[socket.id];
        if (user) {
            console.log('📡 مستخدم غير متصل:', user.userName);
            delete connectedUsers[socket.id];
            io.emit('user-list', Object.values(connectedUsers));
        }
    });
});

// ============================================================
// ==================== إنشاء المستخدم الافتراضي ====================
// ============================================================

const initializeDefaultUsers = async () => {
    try {
        const adminExists = await User.findOne({ name: 'admin' });
        if (!adminExists) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('123456', salt);
            
            await User.create({
                name: 'admin',
                email: 'admin@marine.gov.tn',
                pass: hashedPassword,
                role: 'admin',
                isActive: true
            });
            console.log('✅ تم إنشاء المستخدم الافتراضي: admin / 123456');
        } else {
            console.log('✅ المستخدم admin موجود بالفعل');
        }
    } catch (error) {
        console.error('❌ خطأ في إنشاء المستخدم الافتراضي:', error.message);
    }
};

// ============================================================
// ==================== تشغيل السيرفر ====================
// ============================================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`);
    console.log('========================================');
    console.log(`📦 الإصدار: ${CONFIG.version}`);
    console.log('🔐 بيانات تسجيل الدخول:');
    console.log('   📧 admin@marine.gov.tn أو admin');
    console.log('   🔑 123456');
    console.log('========================================');
});

process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('🔌 تم إغلاق الاتصال بقاعدة البيانات');
    process.exit(0);
});
