// ============================================================
// 🚢 MARINE SYSTEM - SERVER v8.0 (FIXED CSRF)
// ============================================================

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// 📦 CONFIGURATION
// ============================================================

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production';
const SESSION_SECRET = process.env.SESSION_SECRET || 'session-secret-change-in-production';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_NAME = process.env.ADMIN_NAME || 'أمان الله ناجي';

console.log('🔐 Admin username:', ADMIN_USERNAME);

// ============================================================
// 🔧 MIDDLEWARE
// ============================================================

// ✅ CORS - مهم جداً لنجاح CSRF
app.use(cors({
    origin: [
        'http://localhost:5000',
        'http://localhost:3000',
        'https://marine-system-71eo.onrender.com',
        'https://*.onrender.com'
    ],
    credentials: true,
    exposedHeaders: ['X-CSRF-Token', 'X-Session-Expiry']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ✅ Session Management
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'marine.sid',
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    },
    rolling: true
}));

// ============================================================
// 🔒 CSRF PROTECTION - مبسطة ومعدلة
// ============================================================

// ✅ توليد توكن بسيط
function generateToken() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

// ✅ Middleware CSRF - مبسط
app.use((req, res, next) => {
    // ✅ إنشاء توكن إذا لم يكن موجوداً
    if (!req.session.csrfToken) {
        req.session.csrfToken = generateToken();
        req.session.csrfExpiry = Date.now() + (24 * 60 * 60 * 1000);
        console.log('🔄 New CSRF token generated');
    }

    // ✅ التحقق من انتهاء الصلاحية
    if (req.session.csrfExpiry && Date.now() > req.session.csrfExpiry) {
        req.session.csrfToken = generateToken();
        req.session.csrfExpiry = Date.now() + (24 * 60 * 60 * 1000);
        console.log('🔄 CSRF token refreshed');
    }

    // ✅ إرسال التوكن في الـ Response Headers
    res.setHeader('X-CSRF-Token', req.session.csrfToken);
    next();
});

// ✅ التحقق من CSRF - مع سجلات
const csrfProtection = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    const token = req.headers['x-csrf-token'] || req.body.csrf_token;
    const sessionToken = req.session.csrfToken;

    console.log('🔍 CSRF Check:', {
        hasToken: !!token,
        hasSessionToken: !!sessionToken,
        sessionId: req.sessionID
    });

    if (!token) {
        return res.status(403).json({
            success: false,
            error: 'CSRF token مفقود'
        });
    }

    if (!sessionToken) {
        return res.status(403).json({
            success: false,
            error: 'جلسة غير صالحة'
        });
    }

    if (token !== sessionToken) {
        console.log('❌ Token mismatch:', { received: token, expected: sessionToken });
        return res.status(403).json({
            success: false,
            error: 'CSRF token غير صالح'
        });
    }

    console.log('✅ CSRF check passed');
    next();
};

// ============================================================
// 🖥️ STATIC FILES
// ============================================================

const basePath = __dirname;
app.use(express.static(basePath));
app.use('/pages', express.static(path.join(basePath, 'pages')));
app.use('/public', express.static(path.join(basePath, 'public')));

app.get('/', (req, res) => {
    const paths = [
        path.join(basePath, 'index.html'),
        path.join(basePath, 'public', 'index.html'),
        path.join(basePath, 'src', 'index.html')
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) {
            return res.sendFile(p);
        }
    }
    res.send('<h1>❌ index.html not found</h1>');
});

app.get('/pages/:page', (req, res) => {
    const filePath = path.join(basePath, 'pages', req.params.page + '.html');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('<h1>❌ Page not found</h1>');
    }
});

app.get('*', (req, res) => {
    if (req.path.includes('.')) {
        return res.status(404).send('❌ File not found');
    }
    const indexPath = path.join(basePath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.redirect('/');
    }
});

// ============================================================
// 📊 DATA
// ============================================================

const users = [
    {
        id: '1',
        username: ADMIN_USERNAME,
        password: bcrypt.hashSync(ADMIN_PASSWORD, 10),
        name: ADMIN_NAME,
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString()
    },
    {
        id: '2',
        username: 'manager',
        password: bcrypt.hashSync('manager123', 10),
        name: 'مدير النظام',
        role: 'manager',
        active: true,
        createdAt: new Date().toISOString()
    }
];

const vessels = [
    { id: '1', name: 'الوحدة 101', type: 'زورق دورية', status: 'جاهز', location: 'الميناء الرئيسي', lastMaintenance: '2026-08-15T10:00:00Z', createdAt: '2026-01-10T08:00:00Z' },
    { id: '2', name: 'الوحدة 205', type: 'قاطرة بحرية', status: 'صيانة', location: 'حوض السفن', lastMaintenance: '2026-09-01T14:30:00Z', createdAt: '2026-02-20T09:00:00Z' },
    { id: '3', name: 'الوحدة 312', type: 'سفينة إسناد', status: 'خارج الخدمة', location: 'الميناء الغربي', lastMaintenance: '2026-07-20T11:00:00Z', createdAt: '2026-03-15T10:00:00Z' }
];

const logs = [
    { id: '1', vessel: 'الوحدة 205', type: 'تغيير محرك', date: '2026-09-01T14:30:00Z', cost: 2500, status: 'مكتملة' },
    { id: '2', vessel: 'الوحدة 101', type: 'فحص دوري', date: '2026-08-15T10:00:00Z', cost: 500, status: 'مكتملة' }
];

// ============================================================
// 🔐 AUTH ENDPOINTS
// ============================================================

// ✅ جلب CSRF token
app.get('/api/csrf-token', (req, res) => {
    const token = req.session.csrfToken;
    res.json({
        success: true,
        token: token,
        expiresIn: req.session.csrfExpiry ? req.session.csrfExpiry - Date.now() : 86400000
    });
});

// ✅ تسجيل الدخول
app.post('/api/auth/login', csrfProtection, (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('🔐 Login attempt:', username);

        const user = users.find(u => u.username === username);
        if (!user) {
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        const validPassword = bcrypt.compareSync(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        // ✅ توليد JWT
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        // ✅ تجديد CSRF token
        const newToken = generateToken();
        req.session.csrfToken = newToken;
        req.session.csrfExpiry = Date.now() + (24 * 60 * 60 * 1000);
        req.session.userId = user.id;

        res.setHeader('X-CSRF-Token', newToken);
        res.json({
            success: true,
            token: token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                active: user.active
            },
            csrfToken: newToken
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ✅ التحقق من التوكن
app.get('/api/auth/me', csrfProtection, (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'غير مصرح' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.id);

        if (!user) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود' });
        }

        const newToken = generateToken();
        req.session.csrfToken = newToken;
        req.session.csrfExpiry = Date.now() + (24 * 60 * 60 * 1000);
        res.setHeader('X-CSRF-Token', newToken);

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                active: user.active
            }
        });
    } catch (error) {
        res.status(401).json({ success: false, error: 'توكن غير صالح' });
    }
});

// ✅ تسجيل الخروج
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('marine.sid');
        res.json({ success: true, message: 'تم تسجيل الخروج' });
    });
});

// ============================================================
// 📊 DATA ENDPOINTS
// ============================================================

app.get('/api/vessels', csrfProtection, (req, res) => {
    const newToken = generateToken();
    req.session.csrfToken = newToken;
    req.session.csrfExpiry = Date.now() + (24 * 60 * 60 * 1000);
    res.setHeader('X-CSRF-Token', newToken);
    res.json(vessels);
});

app.post('/api/vessels', csrfProtection, (req, res) => {
    const { name, type, status, location } = req.body;
    if (!name) {
        return res.status(400).json({ success: false, error: 'اسم الوحدة مطلوب' });
    }
    const newVessel = {
        id: Date.now().toString(),
        name,
        type: type || 'غير محدد',
        status: status || 'جاهز',
        location: location || '—',
        lastMaintenance: new Date().toISOString(),
        createdAt: new Date().toISOString()
    };
    vessels.push(newVessel);
    res.json({ success: true, vessel: newVessel });
});

app.get('/api/users', csrfProtection, (req, res) => {
    const safeUsers = users.map(u => ({
        id: u.id,
        username: u.username,
        name: u.name,
        role: u.role,
        active: u.active,
        createdAt: u.createdAt
    }));
    res.json(safeUsers);
});

app.get('/api/logs', csrfProtection, (req, res) => {
    res.json(logs);
});

// ============================================================
// 🚀 START
// ============================================================

app.listen(PORT, () => {
    console.log(`🚢 Marine System running on port ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`🌐 https://marine-system-71eo.onrender.com`);
    console.log(`👤 Admin: ${ADMIN_USERNAME}`);
});

module.exports = app;
