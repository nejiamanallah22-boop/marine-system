// ============================================================
// 🚀 منظومة الوسائل البحرية - الخادم المتكامل
// ✅ متوافق مع الـ HTML الذي أرسلته
// ============================================================

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const xss = require('xss');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// ============================================================
// ✅ التحقق من المتغيرات البيئية
// ============================================================

if (!process.env.JWT_SECRET) {
    console.warn('⚠️ تحذير: JWT_SECRET غير معين - سيتم استخدام مفتاح افتراضي');
    process.env.JWT_SECRET = crypto.randomBytes(64).toString('hex');
}

if (!process.env.JWT_REFRESH_SECRET) {
    console.warn('⚠️ تحذير: JWT_REFRESH_SECRET غير معين - سيتم استخدام مفتاح افتراضي');
    process.env.JWT_REFRESH_SECRET = crypto.randomBytes(64).toString('hex');
}

// ============================================================
// 📋 الإعدادات
// ============================================================

const CONFIG = {
    port: parseInt(process.env.PORT) || 3000,
    environment: process.env.NODE_ENV || 'development',
    appName: 'MarineSecuritySystem',
    version: '9.0.0',

    security: {
        jwtSecret: process.env.JWT_SECRET,
        jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
        saltRounds: parseInt(process.env.SALT_ROUNDS) || 12,
        sessionTimeout: 24 * 60 * 60, // 24 ساعة
        maxLoginAttempts: 5,
        lockoutDuration: 30 * 60
    },

    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3443'],

    performance: {
        maxRequestSize: '10mb',
        maxLocations: 10000
    }
};

// ============================================================
// 📝 نظام التسجيل البسيط
// ============================================================

const logger = {
    info: (msg, data = {}) => console.log(`ℹ️ ${msg}`, data),
    error: (msg, data = {}) => console.error(`❌ ${msg}`, data),
    warn: (msg, data = {}) => console.warn(`⚠️ ${msg}`, data),
    debug: (msg, data = {}) => console.debug(`🔍 ${msg}`, data)
};

// ============================================================
// 🚀 تهيئة التطبيق
// ============================================================

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: CONFIG.allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// ============================================================
// 🛡️ وسائط الأمان
// ============================================================

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "unpkg.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "unpkg.com"],
            imgSrc: ["'self'", "data:", "https:", "cdn-icons-png.flaticon.com"],
            connectSrc: ["'self'", "wss:", "https:"]
        }
    }
}));

app.use(cors({
    origin: CONFIG.allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(compression());
app.use(express.json({ limit: CONFIG.performance.maxRequestSize }));
app.use(express.urlencoded({ extended: true, limit: CONFIG.performance.maxRequestSize }));

// ============================================================
// 💾 بيانات الذاكرة (بدلاً من قاعدة البيانات)
// ============================================================

// ===== بيانات المستخدمين =====
let users = [
    { 
        _id: '1', 
        name: 'admin', 
        pass: '$2b$12$KIXQxVqJ5X5X5X5X5X5X5u', // "SecurePass123!" مشفرة
        role: 'مسؤول', 
        enabled: true 
    },
    { 
        _id: '2', 
        name: 'user', 
        pass: '$2b$12$KIXQxVqJ5X5X5X5X5X5X5u', 
        role: 'محرر', 
        enabled: true 
    }
];

// ===== بيانات المراكب =====
let vessels = [
    { _id: '1', name: 'المركب 1', num: 'M001', len: 12, reg: 'الشمال', zone: 'تونس', port: 'تونس', supp: 'قاعدة الشمال', stat: 'صالح', break: '', fDate: '2024-01-01', eDate: '2024-12-31', ref: 'REF001', cat: 'صقور' },
    { _id: '2', name: 'المركب 2', num: 'M002', len: 8, reg: 'الساحل', zone: 'سوسة', port: 'سوسة', supp: 'قاعدة الساحل', stat: 'صيانة', break: 'محرك', fDate: '2024-01-15', eDate: '2024-02-15', ref: 'REF002', cat: 'البروق' },
    { _id: '3', name: 'المركب 3', num: 'M003', len: 15, reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: 'قاعدة الوسط', stat: 'معطب', break: 'هيكل', fDate: '2024-01-20', eDate: '', ref: 'REF003', cat: 'خوافر' }
];

// ===== بيانات التذاكر =====
let tickets = [];

// ===== بيانات السجلات =====
let logs = [];

// ===== بيانات المواقع (GPS) =====
let locations = [];

// ===== المستخدمون المتصلون =====
let onlineUsers = new Set();

// ===== معرف متزايد =====
let nextId = 10;

function generateId() {
    return (nextId++).toString();
}

// ============================================================
// 🔐 دوال مساعدة
// ============================================================

function getCurrentDate() {
    const now = new Date();
    return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
}

function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

function getCat(len) {
    const n = parseFloat(len);
    if (n === 11) return "البروق";
    if (n >= 8 && n <= 12) return "صقور";
    if (n > 12 && n <= 25) return "خوافر";
    if (n >= 30) return "طوافات";
    return "زوارق مزدوجة";
}

// ============================================================
// 🔐 المصادقة
// ============================================================

// توليد كلمة مرور مشفرة للتجربة
async function hashPassword(password) {
    return await bcrypt.hash(password, CONFIG.security.saltRounds);
}

// تحديث كلمة مرور admin مؤقتاً
(async function setupDefaultPassword() {
    try {
        const hashed = await bcrypt.hash('SecurePass123!', CONFIG.security.saltRounds);
        const admin = users.find(u => u.name === 'admin');
        if (admin) admin.pass = hashed;
        const user = users.find(u => u.name === 'user');
        if (user) user.pass = hashed;
    } catch (e) {
        console.error('خطأ في إعداد كلمة المرور:', e);
    }
})();

// ============================================================
// 📡 نقاط النهاية API
// ============================================================

// ===== تسجيل الدخول =====
app.post('/api/login', async (req, res) => {
    try {
        const { name, pass } = req.body;
        
        if (!name || !pass) {
            return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
        }

        const user = users.find(u => u.name === name && u.enabled === true);
        
        if (!user) {
            return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        // التحقق من كلمة المرور
        const validPassword = await bcrypt.compare(pass, user.pass);
        if (!validPassword) {
            return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        // إنشاء توكن JWT
        const token = jwt.sign(
            { id: user._id, name: user.name, role: user.role },
            CONFIG.security.jwtSecret,
            { expiresIn: '24h' }
        );

        // تسجيل الدخول
        await addLog({
            userName: user.name,
            userRole: user.role,
            action: 'تسجيل دخول',
            details: `قام بتسجيل الدخول في ${getCurrentTime()}`,
            date: getCurrentDate(),
            time: getCurrentTime()
        });

        res.json({
            id: user._id,
            name: user.name,
            role: user.role,
            token: token
        });

    } catch (error) {
        console.error('خطأ في تسجيل الدخول:', error);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ===== جلب المراكب =====
app.get('/api/vessels', (req, res) => {
    res.json(vessels);
});

// ===== إضافة مركب =====
app.post('/api/vessels', async (req, res) => {
    try {
        const vessel = {
            _id: generateId(),
            ...req.body,
            cat: req.body.cat || getCat(req.body.len),
            createdAt: new Date().toISOString()
        };
        vessels.push(vessel);
        io.emit('vessel-added', vessel);
        res.status(201).json(vessel);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إضافة المركب' });
    }
});

// ===== تحديث مركب =====
app.put('/api/vessels/:id', async (req, res) => {
    try {
        const index = vessels.findIndex(v => v._id === req.params.id);
        if (index === -1) {
            return res.status(404).json({ error: 'المركب غير موجود' });
        }
        vessels[index] = { ...vessels[index], ...req.body };
        io.emit('vessel-updated', vessels[index]);
        res.json(vessels[index]);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تحديث المركب' });
    }
});

// ===== حذف مركب =====
app.delete('/api/vessels/:id', async (req, res) => {
    try {
        const index = vessels.findIndex(v => v._id === req.params.id);
        if (index === -1) {
            return res.status(404).json({ error: 'المركب غير موجود' });
        }
        vessels.splice(index, 1);
        io.emit('vessel-deleted', { id: req.params.id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حذف المركب' });
    }
});

// ===== جلب المستخدمين =====
app.get('/api/users', (req, res) => {
    const safeUsers = users.map(u => ({
        _id: u._id,
        name: u.name,
        role: u.role,
        enabled: u.enabled
    }));
    res.json(safeUsers);
});

// ===== إضافة مستخدم =====
app.post('/api/users', async (req, res) => {
    try {
        const { name, pass, role } = req.body;
        
        if (users.find(u => u.name === name)) {
            return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
        }

        const hashedPassword = await bcrypt.hash(pass, CONFIG.security.saltRounds);
        const user = {
            _id: generateId(),
            name,
            pass: hashedPassword,
            role: role || 'مشاهد',
            enabled: true
        };
        users.push(user);
        res.status(201).json({ _id: user._id, name: user.name, role: user.role, enabled: user.enabled });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إضافة المستخدم' });
    }
});

// ===== تحديث مستخدم =====
app.put('/api/users/:id', async (req, res) => {
    try {
        const index = users.findIndex(u => u._id === req.params.id);
        if (index === -1) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }
        
        const updateData = { ...req.body };
        if (updateData.pass) {
            updateData.pass = await bcrypt.hash(updateData.pass, CONFIG.security.saltRounds);
        }
        
        users[index] = { ...users[index], ...updateData };
        const safeUser = {
            _id: users[index]._id,
            name: users[index].name,
            role: users[index].role,
            enabled: users[index].enabled
        };
        res.json(safeUser);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تحديث المستخدم' });
    }
});

// ===== حذف مستخدم =====
app.delete('/api/users/:id', (req, res) => {
    try {
        const index = users.findIndex(u => u._id === req.params.id);
        if (index === -1) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }
        users.splice(index, 1);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حذف المستخدم' });
    }
});

// ===== جلب التذاكر =====
app.get('/api/tickets', (req, res) => {
    res.json(tickets);
});

// ===== إضافة تذكرة =====
app.post('/api/tickets', async (req, res) => {
    try {
        const ticket = {
            _id: generateId(),
            ...req.body,
            createdAt: new Date().toISOString(),
            replies: req.body.replies || []
        };
        tickets.push(ticket);
        res.status(201).json(ticket);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إضافة التذكرة' });
    }
});

// ===== الرد على تذكرة =====
app.put('/api/tickets/:id/reply', async (req, res) => {
    try {
        const ticket = tickets.find(t => t._id === req.params.id);
        if (!ticket) {
            return res.status(404).json({ error: 'التذكرة غير موجودة' });
        }
        if (!ticket.replies) ticket.replies = [];
        ticket.replies.push(req.body.reply);
        ticket.status = 'تم الرد';
        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في الرد على التذكرة' });
    }
});

// ===== إغلاق تذكرة =====
app.put('/api/tickets/:id/close', async (req, res) => {
    try {
        const ticket = tickets.find(t => t._id === req.params.id);
        if (!ticket) {
            return res.status(404).json({ error: 'التذكرة غير موجودة' });
        }
        ticket.status = 'مغلقة';
        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إغلاق التذكرة' });
    }
});

// ===== جلب السجلات =====
app.get('/api/logs', (req, res) => {
    res.json(logs);
});

// ===== إضافة سجل =====
app.post('/api/logs', async (req, res) => {
    try {
        const log = {
            _id: generateId(),
            ...req.body,
            timestamp: new Date().toISOString()
        };
        logs.push(log);
        if (logs.length > 1000) {
            logs = logs.slice(-1000);
        }
        res.status(201).json(log);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إضافة السجل' });
    }
});

// ===== جلب المواقع (GPS) =====
app.get('/api/locations', (req, res) => {
    res.json(locations);
});

// ===== إضافة موقع (GPS) =====
app.post('/api/locations', async (req, res) => {
    try {
        const location = {
            _id: generateId(),
            ...req.body,
            timestamp: new Date().toISOString()
        };
        locations.push(location);
        if (locations.length > CONFIG.performance.maxLocations) {
            locations = locations.slice(-CONFIG.performance.maxLocations);
        }
        res.status(201).json(location);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إضافة الموقع' });
    }
});

// ===== تصدير جميع البيانات =====
app.get('/api/export-all', (req, res) => {
    const safeUsers = users.map(u => ({
        _id: u._id,
        name: u.name,
        role: u.role,
        enabled: u.enabled
    }));
    res.json({
        vessels,
        users: safeUsers,
        tickets,
        logs,
        locations,
        exportedAt: new Date().toISOString()
    });
});

// ===== استيراد جميع البيانات =====
app.post('/api/import-all', async (req, res) => {
    try {
        const { vessels: newVessels, users: newUsers, tickets: newTickets, logs: newLogs, locations: newLocations } = req.body;
        
        if (newVessels) vessels = newVessels;
        if (newUsers) {
            // تحويل المستخدمين المستوردين إلى صيغة آمنة
            users = newUsers.map(u => ({
                _id: u._id || generateId(),
                name: u.name,
                pass: u.pass || 'default',
                role: u.role || 'مشاهد',
                enabled: u.enabled !== undefined ? u.enabled : true
            }));
        }
        if (newTickets) tickets = newTickets;
        if (newLogs) logs = newLogs;
        if (newLocations) locations = newLocations;
        
        res.json({ success: true, message: 'تم استيراد البيانات بنجاح' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في استيراد البيانات' });
    }
});

// ============================================================
// 🔌 Socket.IO
// ============================================================

io.on('connection', (socket) => {
    console.log('📡 مستخدم متصل:', socket.id);

    socket.on('user-connected', (data) => {
        if (data && data.userName) {
            onlineUsers.add(data.userName);
            io.emit('online-users', Array.from(onlineUsers));
            console.log('👤', data.userName, 'متصل');
        }
    });

    socket.on('send-location', (data) => {
        if (data && data.userName && data.lat && data.lng) {
            const locationData = {
                userName: data.userName,
                userRole: data.userRole || 'مستخدم',
                lat: data.lat,
                lng: data.lng,
                timestamp: new Date().toISOString()
            };
            locations.push(locationData);
            if (locations.length > CONFIG.performance.maxLocations) {
                locations = locations.slice(-CONFIG.performance.maxLocations);
            }
            
            socket.broadcast.emit('receive-location', {
                userName: data.userName,
                lat: data.lat,
                lng: data.lng,
                time: new Date().toISOString()
            });
            
            console.log('📍 موقع من', data.userName, ':', data.lat, ',', data.lng);
        }
    });

    socket.on('get-online-users', () => {
        socket.emit('online-users', Array.from(onlineUsers));
    });

    socket.on('user-disconnected', (data) => {
        if (data && data.userName) {
            onlineUsers.delete(data.userName);
            io.emit('online-users', Array.from(onlineUsers));
            console.log('👤', data.userName, 'غير متصل');
        }
    });

    socket.on('disconnect', () => {
        console.log('📡 مستخدم غير متصل:', socket.id);
    });
});

// ============================================================
// 📂 الملفات الثابتة
// ============================================================

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// 🚀 تشغيل الخادم
// ============================================================

async function startServer() {
    try {
        // إنشاء مجلدات إذا لزم الأمر
        await fs.mkdir('logs', { recursive: true }).catch(() => {});
        await fs.mkdir('public', { recursive: true }).catch(() => {});

        server.listen(CONFIG.port, '0.0.0.0', () => {
            console.log('========================================');
            console.log(`🚀 ${CONFIG.appName} v${CONFIG.version}`);
            console.log(`🌐 http://localhost:${CONFIG.port}`);
            console.log('========================================');
            console.log('🔐 بيانات تسجيل الدخول:');
            console.log('   📧 admin');
            console.log('   🔑 SecurePass123!');
            console.log('   📧 user');
            console.log('   🔑 SecurePass123!');
            console.log('========================================');
            console.log(`📊 عدد المراكب: ${vessels.length}`);
            console.log(`👥 عدد المستخدمين: ${users.length}`);
            console.log(`📋 عدد التذاكر: ${tickets.length}`);
            console.log(`📍 عدد المواقع: ${locations.length}`);
            console.log('========================================');
            console.log('📍 نظام تتبع GPS نشط');
            console.log('========================================');
        });

        // حفظ البيانات كل 5 دقائق (اختياري)
        setInterval(() => {
            // يمكن إضافة حفظ للبيانات في ملف هنا
        }, 5 * 60 * 1000);

    } catch (error) {
        console.error('❌ فشل بدء الخادم:', error);
        process.exit(1);
    }
}

// ============================================================
// 🛑 معالجة الإيقاف
// ============================================================

process.on('SIGINT', async () => {
    console.log('\n🛑 إيقاف الخادم...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 إيقاف الخادم...');
    process.exit(0);
});

// ============================================================
// ▶️ بدء التشغيل
// ============================================================

startServer();

// ============================================================
// ✅ نهاية الخادم
// ============================================================
