require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');

// استيراد الملفات
const connectDB = require('./config/database');
const { authenticate, authorize } = require('./middleware/auth');
const authRoutes = require('./routes/authRoutes');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

// ============================================================
// ==================== التحقق من البيئة ====================
// ============================================================

if (!process.env.JWT_SECRET) {
    console.warn('⚠️ JWT_SECRET غير موجود في .env، استخدم المفتاح الافتراضي (غير آمن للإنتاج)');
}

// ============================================================
// ==================== Middleware ====================
// ============================================================

// ✅ CORS محدود
const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',') 
    : ['http://localhost:3000', 'https://yourdomain.com'];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('❌ غير مصرح به بواسطة CORS'));
        }
    },
    credentials: true
}));

// ✅ Helmet مع CSP متوافق
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                "'unsafe-eval'",
                "https://cdn.jsdelivr.net",
                "https://unpkg.com",
                "https://cdnjs.cloudflare.com",
                "https://*.tile.openstreetmap.org"
            ],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://cdn.jsdelivr.net",
                "https://unpkg.com",
                "https://fonts.googleapis.com",
                "https://cdnjs.cloudflare.com",
                "https://*.tile.openstreetmap.org"
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",
                "https://cdnjs.cloudflare.com"
            ],
            imgSrc: [
                "'self'",
                "data:",
                "https://unpkg.com",
                "https://cdn.jsdelivr.net",
                "https://*.tile.openstreetmap.org",
                "https://*.basemaps.cartocdn.com"
            ],
            connectSrc: [
                "'self'",
                "https://*.tile.openstreetmap.org",
                "https://*.basemaps.cartocdn.com",
                "https://cdn.jsdelivr.net",
                "https://unpkg.com",
                "https://cdnjs.cloudflare.com",
                "wss://*.onrender.com",
                "https://api.ipify.org",
                "https://nominatim.openstreetmap.org"
            ]
        }
    }
}));

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

connectDB();

// ============================================================
// ==================== نماذج البيانات ====================
// ============================================================

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
const ReplySchema = new mongoose.Schema({
    adminName: { type: String, required: true },
    reply: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true }
});

const TicketSchema = new mongoose.Schema({
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    status: { type: String, enum: ['قيد المعالجة', 'تم الرد', 'مغلقة'], default: 'قيد المعالجة' },
    replies: [ReplySchema]
}, { timestamps: true });

const Ticket = mongoose.model('Ticket', TicketSchema);

// ===== نموذج السجلات =====
const LogSchema = new mongoose.Schema({
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    action: { type: String, required: true },
    details: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true }
}, { timestamps: true });

const Log = mongoose.model('Log', LogSchema);

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
// ==================== Routes API ====================
// ============================================================

// ===== Routes المصادقة =====
app.use('/api/auth', authRoutes);

// ===== Routes المراكب =====
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
        const n = parseFloat(data.len);
        if (n === 11) data.cat = 'البروق';
        else if (n >= 8 && n <= 12) data.cat = 'صقور';
        else if (n > 12 && n <= 25) data.cat = 'خوافر';
        else if (n > 30) data.cat = 'طوافات';
        else data.cat = 'زوارق مزدوجة';
        
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
        const n = parseFloat(data.len);
        if (n === 11) data.cat = 'البروق';
        else if (n >= 8 && n <= 12) data.cat = 'صقور';
        else if (n > 12 && n <= 25) data.cat = 'خوافر';
        else if (n > 30) data.cat = 'طوافات';
        else data.cat = 'زوارق مزدوجة';
        
        const vessel = await Vessel.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
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
        res.json({ message: 'تم حذف المركب بنجاح' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== Routes التذاكر =====
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
            userRole: req.user.role
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
            date: new Date().toISOString().split('T')[0],
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

// ===== Routes السجلات =====
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
            date: new Date().toISOString().split('T')[0],
            time: getCurrentTime()
        });
        await log.save();
        res.status(201).json(log);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ===== Routes المواقع =====
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
        
        // ✅ التحقق من الإحداثيات بشكل صحيح
        if (
            lat == null ||
            lng == null ||
            isNaN(Number(lat)) ||
            isNaN(Number(lng))
        ) {
            return res.status(400).json({ error: 'إحداثيات غير صالحة' });
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
        res.status(201).json(location);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ===== Routes Note Verbale =====
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
        console.error('❌ خطأ في حفظ المذكرة:', error);
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
        res.json({ message: 'تم حذف المذكرة' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== Routes تصدير واستيراد =====
app.get('/api/export-all', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const vessels = await Vessel.find();
        const users = require('./models/User').find().select('-pass');
        const tickets = await Ticket.find();
        const logs = await Log.find();
        const locations = await Location.find();
        const notes = await NoteVerbale.find();
        res.json({ vessels, users, tickets, logs, locations, notes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/import-all', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const { vessels, users, tickets, logs, locations, notes } = req.body;
        const bcrypt = require('bcryptjs');
        const User = require('./models/User');
        
        // ✅ الإصلاح: إعادة إدخال البيانات بعد الحذف
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
        
        res.json({ message: '✅ تم استيراد البيانات بنجاح' });
    } catch (error) {
        console.error('❌ خطأ في استيراد البيانات:', error);
        res.status(500).json({ error: 'خطأ في استيراد البيانات: ' + error.message });
    }
});

// ===== مسار الصحة =====
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// ==================== تقديم الملفات الثابتة ====================
// ============================================================

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ جميع Routes الأخرى قبل هذا السطر
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
        // ✅ التحقق من الإحداثيات بشكل صحيح
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
        // ✅ التحقق من الإحداثيات بشكل صحيح
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
// ==================== تشغيل السيرفر ====================
// ============================================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`);
    console.log('========================================');
    console.log('🔐 بيانات تسجيل الدخول:');
    console.log('   📧 admin');
    console.log('   🔑 123456');
    console.log('========================================');
});

process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('🔌 تم إغلاق الاتصال بقاعدة البيانات');
    process.exit(0);
});
