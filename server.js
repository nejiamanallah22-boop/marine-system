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

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

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
// ==================== تقديم الملفات الثابتة (المهم) ====================
// ============================================================

// ✅ خدمة ملفات CSS و JS و صفحات HTML
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// ==================== الصفحات الديناميكية ====================
// ============================================================

// ✅ صفحات التطبيق (للتحميل الديناميكي)
app.get('/pages/:page.html', (req, res) => {
    const page = req.params.page;
    const pagePath = path.join(__dirname, 'public', 'pages', `${page}.html`);
    res.sendFile(pagePath, (err) => {
        if (err) {
            res.status(404).json({ error: `الصفحة ${page} غير موجودة` });
        }
    });
});

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
    refreshToken: { type: String }
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
    imageData: { type: String, default: '' }
}, { timestamps: true });

const NoteVerbale = mongoose.model('NoteVerbale', NoteVerbaleSchema);

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

// ============================================================
// ==================== المصادقة ====================
// ============================================================

const JWT_SECRET = process.env.JWT_SECRET || 'my_super_secret_key_change_this';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'my_refresh_secret_change_this';

const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, error: 'غير مصرح به' });
        }
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user || !user.isActive) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود' });
        }
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'رمز غير صالح' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'غير مصرح به' });
        }
        next();
    };
};

function generateTokens(user) {
    const accessToken = jwt.sign(
        { id: user._id, name: user.name, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
    const refreshToken = jwt.sign(
        { id: user._id },
        REFRESH_SECRET,
        { expiresIn: '30d' }
    );
    return { accessToken, refreshToken };
}

// ============================================================
// ==================== API Routes ====================
// ============================================================

// ===== المصادقة =====
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await User.findOne({ $or: [{ email }, { name: email }] });
        if (!user || !user.isActive) {
            return res.status(401).json({ success: false, error: 'بيانات غير صحيحة' });
        }

        const isMatch = await bcrypt.compare(password, user.pass);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'بيانات غير صحيحة' });
        }

        const { accessToken, refreshToken } = generateTokens(user);
        user.refreshToken = refreshToken;
        await user.save();

        res.json({
            success: true,
            token: accessToken,
            refreshToken: refreshToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/auth/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ success: false, error: 'Refresh token مطلوب' });
        }

        const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
        const user = await User.findById(decoded.id);
        if (!user || user.refreshToken !== refreshToken) {
            return res.status(401).json({ success: false, error: 'Refresh token غير صالح' });
        }

        const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
        user.refreshToken = newRefreshToken;
        await user.save();

        res.json({ success: true, token: accessToken, refreshToken: newRefreshToken });
    } catch (error) {
        res.status(401).json({ success: false, error: 'Refresh token غير صالح' });
    }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (user) {
            user.refreshToken = null;
            await user.save();
        }
        res.json({ success: true });
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
            role: req.user.role
        }
    });
});

// ===== المستخدمين =====
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
            return res.status(400).json({ success: false, error: 'الاسم وكلمة المرور مطلوبة' });
        }
        const existing = await User.findOne({ $or: [{ name }, { email }] });
        if (existing) {
            return res.status(400).json({ success: false, error: 'المستخدم موجود بالفعل' });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const user = new User({ name, email, pass: hashedPassword, role: role || 'viewer' });
        await user.save();
        const userData = user.toObject();
        delete userData.pass;
        delete userData.refreshToken;
        res.status(201).json({ success: true, user: userData });
    } catch (error) {
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
        res.json({ success: true, user });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.delete('/api/users/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        if (user.name === 'admin') {
            return res.status(400).json({ success: false, error: 'لا يمكن حذف admin' });
        }
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true });
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
        const vessel = await Vessel.findByIdAndUpdate(req.params.id, data, { new: true });
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
        res.json({ success: true });
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

// ===== Note Verbale =====
app.post('/api/notes', authenticate, async (req, res) => {
    try {
        const { title, content, date, type, imageData } = req.body;
        if (!title || !content || !date) {
            return res.status(400).json({ success: false, error: 'العنوان والمحتوى والتاريخ مطلوبة' });
        }
        const note = new NoteVerbale({
            title,
            content,
            date,
            time: getCurrentTime(),
            week: getWeekNumber(date).toString(),
            createdBy: req.user.name,
            userRole: req.user.role,
            type: type || 'text',
            imageData: imageData || ''
        });
        await note.save();
        res.status(201).json({ success: true, note });
    } catch (error) {
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
        res.json(await notesQuery.exec());
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/notes/:id', authenticate, authorize('admin', 'manager'), async (req, res) => {
    try {
        await NoteVerbale.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// ==================== تشغيل السيرفر ====================
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
        }
    } catch (error) {
        console.error('❌ خطأ في إنشاء المستخدم:', error.message);
    }
};

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`);
    console.log('========================================');
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
