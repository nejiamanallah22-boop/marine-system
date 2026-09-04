// ============================================================
// 🚢 MARINE SYSTEM - SERVER v8.0 (FULL WITH ADVANCED SESSION MANAGEMENT)
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

// ============================================================
// 🔧 MIDDLEWARE
// ============================================================

// ✅ CORS
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

// ✅ JSON & URL Encoding
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ============================================================
// 🕐 SESSION MANAGEMENT - متقدم مع وقت طويل
// ============================================================

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'marine.sid', // اسم مختلف للـ cookie
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 يوم
        sameSite: 'lax'
    },
    rolling: true, // تجديد الجلسة مع كل طلب
    unset: 'destroy'
}));

// ============================================================
// 🔒 CSRF PROTECTION - متقدم مع إدارة انتهاء الصلاحية
// ============================================================

// ✅ إعدادات CSRF
const CSRF_CONFIG = {
    TOKEN_LENGTH: 32,
    EXPIRY_HOURS: 24, // 24 ساعة بدلاً من ساعتين
    MAX_RETRY: 3
};

// ✅ توليد توكن CSRF
function generateCSRFToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < CSRF_CONFIG.TOKEN_LENGTH; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

// ✅ Middleware CSRF
app.use((req, res, next) => {
    // ✅ إنشاء توكن جديد إذا لم يكن موجوداً
    if (!req.session.csrfToken) {
        req.session.csrfToken = generateCSRFToken();
        req.session.csrfExpiry = Date.now() + (CSRF_CONFIG.EXPIRY_HOURS * 60 * 60 * 1000);
        req.session.csrfCreated = Date.now();
    }

    // ✅ التحقق من انتهاء صلاحية التوكن
    if (req.session.csrfExpiry && Date.now() > req.session.csrfExpiry) {
        console.log('🔄 CSRF token expired, generating new one...');
        req.session.csrfToken = generateCSRFToken();
        req.session.csrfExpiry = Date.now() + (CSRF_CONFIG.EXPIRY_HOURS * 60 * 60 * 1000);
        req.session.csrfCreated = Date.now();
    }

    // ✅ إرسال التوكن في الـ Response Headers
    res.setHeader('X-CSRF-Token', req.session.csrfToken);
    res.setHeader('X-Session-Expiry', req.session.csrfExpiry);

    next();
});

// ✅ التحقق من CSRF للطلبات الآمنة
const csrfProtection = (req, res, next) => {
    // ✅ تخطي التحقق للطلبات GET, HEAD, OPTIONS
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    const token = req.headers['x-csrf-token'] || req.body.csrf_token;
    const sessionToken = req.session.csrfToken;

    // ✅ التحقق من وجود التوكن
    if (!token) {
        return res.status(403).json({
            success: false,
            error: 'CSRF token مفقود',
            code: 'CSRF_MISSING'
        });
    }

    // ✅ التحقق من تطابق التوكن
    if (token !== sessionToken) {
        return res.status(403).json({
            success: false,
            error: 'CSRF token غير صالح',
            code: 'CSRF_INVALID'
        });
    }

    // ✅ التحقق من انتهاء الصلاحية
    if (req.session.csrfExpiry && Date.now() > req.session.csrfExpiry) {
        return res.status(403).json({
            success: false,
            error: 'CSRF token منتهي الصلاحية',
            code: 'CSRF_EXPIRED'
        });
    }

    next();
};

// ============================================================
// 🖥️ STATIC FILES & ROUTING
// ============================================================

// ✅ تحديد المسار الأساسي
const basePath = __dirname;
console.log(`📁 Base directory: ${basePath}`);

// ✅ تقديم الملفات الثابتة
app.use(express.static(basePath, {
    maxAge: '1d',
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// ✅ تقديم مجلد الصفحات
app.use('/pages', express.static(path.join(basePath, 'pages'), {
    maxAge: '1d'
}));

// ✅ تقديم مجلد public إذا وجد
app.use('/public', express.static(path.join(basePath, 'public')));

// ✅ الصفحة الرئيسية - مع البحث في عدة مسارات
app.get('/', (req, res) => {
    const possiblePaths = [
        path.join(basePath, 'index.html'),
        path.join(basePath, 'public', 'index.html'),
        path.join(basePath, 'src', 'index.html')
    ];
    
    for (const indexPath of possiblePaths) {
        if (fs.existsSync(indexPath)) {
            console.log(`✅ Found index.html at: ${indexPath}`);
            return res.sendFile(indexPath);
        }
    }
    
    res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>⚠️ ملف مفقود</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #0a1628; color: #e2e8f0; }
                h1 { color: #ef4444; }
                .info { background: rgba(255,255,255,0.04); padding: 20px; border-radius: 12px; margin: 20px auto; max-width: 600px; }
                code { background: rgba(255,255,255,0.08); padding: 2px 8px; border-radius: 4px; }
            </style>
        </head>
        <body>
            <h1>❌ ملف index.html غير موجود</h1>
            <div class="info">
                <p>المجلد الحالي: <code>${basePath}</code></p>
                <p>تم البحث في المسارات التالية:</p>
                <ul style="text-align:right;direction:rtl;list-style:none;padding:0;">
                    ${possiblePaths.map(p => `<li>📁 <code>${p}</code></li>`).join('')}
                </ul>
            </div>
        </body>
        </html>
    `);
});

// ✅ صفحة تسجيل الدخول
app.get('/login', (req, res) => {
    const indexPath = path.join(basePath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.redirect('/');
    }
});

// ✅ تحميل الصفحات من مجلد pages
app.get('/pages/:page', (req, res) => {
    const page = req.params.page;
    const possiblePaths = [
        path.join(basePath, 'pages', page + '.html'),
        path.join(basePath, 'public', 'pages', page + '.html'),
        path.join(basePath, 'src', 'pages', page + '.html')
    ];
    
    for (const filePath of possiblePaths) {
        if (fs.existsSync(filePath)) {
            console.log(`✅ Serving page: ${page}`);
            return res.sendFile(filePath);
        }
    }
    
    res.status(404).send(`
        <h1 style="color:#ef4444;text-align:center;margin-top:50px;font-family:sans-serif;">
            ❌ الصفحة "${page}" غير موجودة
        </h1>
        <p style="text-align:center;color:#94a3b8;">
            تم البحث في: ${possiblePaths.join(', ')}
        </p>
    `);
});

// ✅ معالجة جميع المسارات الأخرى (SPA mode)
app.get('*', (req, res) => {
    if (req.path.includes('.')) {
        return res.status(404).send('❌ الملف غير موجود');
    }
    const indexPath = path.join(basePath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.redirect('/');
    }
});

// ============================================================
// 📊 DATA STORE
// ============================================================

const users = [
    {
        id: '1',
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10),
        name: 'أمان الله ناجي',
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
    },
    {
        id: '3',
        username: 'user',
        password: bcrypt.hashSync('user123', 10),
        name: 'مستخدم عادي',
        role: 'viewer',
        active: true,
        createdAt: new Date().toISOString()
    }
];

const vessels = [
    {
        id: '1',
        name: 'الوحدة 101',
        type: 'زورق دورية',
        status: 'جاهز',
        location: 'الميناء الرئيسي',
        lastMaintenance: '2026-08-15T10:00:00Z',
        createdAt: '2026-01-10T08:00:00Z'
    },
    {
        id: '2',
        name: 'الوحدة 205',
        type: 'قاطرة بحرية',
        status: 'صيانة',
        location: 'حوض السفن',
        lastMaintenance: '2026-09-01T14:30:00Z',
        createdAt: '2026-02-20T09:00:00Z'
    },
    {
        id: '3',
        name: 'الوحدة 312',
        type: 'سفينة إسناد',
        status: 'خارج الخدمة',
        location: 'الميناء الغربي',
        lastMaintenance: '2026-07-20T11:00:00Z',
        createdAt: '2026-03-15T10:00:00Z'
    },
    {
        id: '4',
        name: 'الوحدة 408',
        type: 'زورق إنقاذ',
        status: 'جاهز',
        location: 'الميناء الشرقي',
        lastMaintenance: '2026-08-28T09:00:00Z',
        createdAt: '2026-04-01T14:00:00Z'
    }
];

const logs = [
    {
        id: '1',
        vessel: 'الوحدة 205',
        type: 'تغيير محرك',
        date: '2026-09-01T14:30:00Z',
        cost: 2500,
        status: 'مكتملة'
    },
    {
        id: '2',
        vessel: 'الوحدة 101',
        type: 'فحص دوري',
        date: '2026-08-15T10:00:00Z',
        cost: 500,
        status: 'مكتملة'
    },
    {
        id: '3',
        vessel: 'الوحدة 312',
        type: 'إصلاح هيكل',
        date: '2026-07-20T11:00:00Z',
        cost: 3500,
        status: 'قيد التنفيذ'
    }
];

// ============================================================
// 🔐 AUTH ENDPOINTS
// ============================================================

// ✅ Get CSRF token مع معلومات الجلسة
app.get('/api/csrf-token', (req, res) => {
    const token = req.session.csrfToken;
    const expiry = req.session.csrfExpiry;
    const remaining = expiry ? Math.max(0, expiry - Date.now()) : 0;
    
    res.setHeader('X-CSRF-Token', token);
    res.setHeader('X-Session-Expiry', expiry);
    res.json({
        success: true,
        token: token,
        expiresIn: remaining,
        expiryDate: expiry
    });
});

// ✅ Refresh CSRF token
app.post('/api/csrf-refresh', (req, res) => {
    try {
        const newToken = generateCSRFToken();
        req.session.csrfToken = newToken;
        req.session.csrfExpiry = Date.now() + (CSRF_CONFIG.EXPIRY_HOURS * 60 * 60 * 1000);
        req.session.csrfCreated = Date.now();
        
        res.setHeader('X-CSRF-Token', newToken);
        res.setHeader('X-Session-Expiry', req.session.csrfExpiry);
        res.json({
            success: true,
            token: newToken,
            expiresIn: CSRF_CONFIG.EXPIRY_HOURS * 60 * 60 * 1000,
            expiryDate: req.session.csrfExpiry
        });
    } catch (error) {
        console.error('Refresh error:', error);
        res.status(500).json({
            success: false,
            error: 'فشل تجديد التوكن'
        });
    }
});

// ✅ Check session status
app.get('/api/session-status', (req, res) => {
    res.json({
        success: true,
        hasSession: !!req.session,
        hasCsrf: !!req.session.csrfToken,
        csrfExpiry: req.session.csrfExpiry,
        sessionId: req.sessionID
    });
});

// ✅ Login
app.post('/api/auth/login', csrfProtection, (req, res) => {
    try {
        const { username, password } = req.body;

        const user = users.find(u => u.username === username);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'اسم المستخدم أو كلمة المرور غير صحيحة'
            });
        }

        const validPassword = bcrypt.compareSync(password, user.password);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                error: 'اسم المستخدم أو كلمة المرور غير صحيحة'
            });
        }

        // ✅ Generate JWT
        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                role: user.role,
                sessionId: req.sessionID
            },
            JWT_SECRET,
            { expiresIn: '30d' } // 30 يوم
        );

        // ✅ تجديد CSRF token بعد تسجيل الدخول
        const newCsrfToken = generateCSRFToken();
        req.session.csrfToken = newCsrfToken;
        req.session.csrfExpiry = Date.now() + (CSRF_CONFIG.EXPIRY_HOURS * 60 * 60 * 1000);
        req.session.csrfCreated = Date.now();
        req.session.userId = user.id;
        
        res.setHeader('X-CSRF-Token', newCsrfToken);
        res.setHeader('X-Session-Expiry', req.session.csrfExpiry);

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
            session: {
                csrfToken: newCsrfToken,
                csrfExpiry: req.session.csrfExpiry,
                sessionId: req.sessionID
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'خطأ في الخادم'
        });
    }
});

// ✅ Verify token
app.get('/api/auth/me', csrfProtection, (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'غير مصرح'
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        const user = users.find(u => u.id === decoded.id);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'المستخدم غير موجود'
            });
        }

        // ✅ تجديد CSRF token
        const newCsrfToken = generateCSRFToken();
        req.session.csrfToken = newCsrfToken;
        req.session.csrfExpiry = Date.now() + (CSRF_CONFIG.EXPIRY_HOURS * 60 * 60 * 1000);
        req.session.csrfCreated = Date.now();
        
        res.setHeader('X-CSRF-Token', newCsrfToken);
        res.setHeader('X-Session-Expiry', req.session.csrfExpiry);

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                active: user.active
            },
            session: {
                csrfToken: newCsrfToken,
                csrfExpiry: req.session.csrfExpiry
            }
        });
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(401).json({
            success: false,
            error: 'توكن غير صالح'
        });
    }
});

// ✅ Logout
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.clearCookie('marine.sid');
        res.json({ success: true, message: 'تم تسجيل الخروج' });
    });
});

// ============================================================
// 📊 DATA ENDPOINTS (مع CSRF Protection)
// ============================================================

// ✅ Get all vessels
app.get('/api/vessels', csrfProtection, (req, res) => {
    try {
        const newCsrfToken = generateCSRFToken();
        req.session.csrfToken = newCsrfToken;
        req.session.csrfExpiry = Date.now() + (CSRF_CONFIG.EXPIRY_HOURS * 60 * 60 * 1000);
        res.setHeader('X-CSRF-Token', newCsrfToken);
        res.setHeader('X-Session-Expiry', req.session.csrfExpiry);
        res.json(vessels);
    } catch (error) {
        console.error('Error fetching vessels:', error);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ✅ Add vessel
app.post('/api/vessels', csrfProtection, (req, res) => {
    try {
        const { name, type, status, location } = req.body;
        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'اسم الوحدة مطلوب'
            });
        }

        const newVessel = {
            id: Date.now().toString(),
            name: name,
            type: type || 'غير محدد',
            status: status || 'جاهز',
            location: location || '—',
            lastMaintenance: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };

        vessels.push(newVessel);

        const newCsrfToken = generateCSRFToken();
        req.session.csrfToken = newCsrfToken;
        req.session.csrfExpiry = Date.now() + (CSRF_CONFIG.EXPIRY_HOURS * 60 * 60 * 1000);
        res.setHeader('X-CSRF-Token', newCsrfToken);
        res.setHeader('X-Session-Expiry', req.session.csrfExpiry);
        res.json({ success: true, vessel: newVessel });
    } catch (error) {
        console.error('Error adding vessel:', error);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ✅ Delete vessel
app.delete('/api/vessels/:id', csrfProtection, (req, res) => {
    try {
        const { id } = req.params;
        const index = vessels.findIndex(v => v.id === id);
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'الوحدة غير موجودة' });
        }

        vessels.splice(index, 1);

        const newCsrfToken = generateCSRFToken();
        req.session.csrfToken = newCsrfToken;
        req.session.csrfExpiry = Date.now() + (CSRF_CONFIG.EXPIRY_HOURS * 60 * 60 * 1000);
        res.setHeader('X-CSRF-Token', newCsrfToken);
        res.setHeader('X-Session-Expiry', req.session.csrfExpiry);
        res.json({ success: true, message: 'تم حذف الوحدة' });
    } catch (error) {
        console.error('Error deleting vessel:', error);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ✅ Get all users
app.get('/api/users', csrfProtection, (req, res) => {
    try {
        const newCsrfToken = generateCSRFToken();
        req.session.csrfToken = newCsrfToken;
        req.session.csrfExpiry = Date.now() + (CSRF_CONFIG.EXPIRY_HOURS * 60 * 60 * 1000);
        res.setHeader('X-CSRF-Token', newCsrfToken);
        res.setHeader('X-Session-Expiry', req.session.csrfExpiry);
        const safeUsers = users.map(u => ({
            id: u.id,
            username: u.username,
            name: u.name,
            role: u.role,
            active: u.active,
            createdAt: u.createdAt
        }));
        res.json(safeUsers);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ✅ Add user
app.post('/api/users', csrfProtection, (req, res) => {
    try {
        const { username, password, name, role } = req.body;
        if (!username || !password || !name) {
            return res.status(400).json({
                success: false,
                error: 'جميع الحقول مطلوبة'
            });
        }

        if (users.find(u => u.username === username)) {
            return res.status(400).json({
                success: false,
                error: 'اسم المستخدم موجود بالفعل'
            });
        }

        const newUser = {
            id: Date.now().toString(),
            username,
            password: bcrypt.hashSync(password, 10),
            name,
            role: role || 'viewer',
            active: true,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);

        const newCsrfToken = generateCSRFToken();
        req.session.csrfToken = newCsrfToken;
        req.session.csrfExpiry = Date.now() + (CSRF_CONFIG.EXPIRY_HOURS * 60 * 60 * 1000);
        res.setHeader('X-CSRF-Token', newCsrfToken);
        res.setHeader('X-Session-Expiry', req.session.csrfExpiry);
        res.json({
            success: true,
            user: {
                id: newUser.id,
                username: newUser.username,
                name: newUser.name,
                role: newUser.role,
                active: newUser.active
            }
        });
    } catch (error) {
        console.error('Error adding user:', error);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ✅ Get all logs
app.get('/api/logs', csrfProtection, (req, res) => {
    try {
        const newCsrfToken = generateCSRFToken();
        req.session.csrfToken = newCsrfToken;
        req.session.csrfExpiry = Date.now() + (CSRF_CONFIG.EXPIRY_HOURS * 60 * 60 * 1000);
        res.setHeader('X-CSRF-Token', newCsrfToken);
        res.setHeader('X-Session-Expiry', req.session.csrfExpiry);
        res.json(logs);
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ✅ Add log
app.post('/api/logs', csrfProtection, (req, res) => {
    try {
        const { vessel, type, date, cost, status } = req.body;
        if (!vessel || !type) {
            return res.status(400).json({
                success: false,
                error: 'الوحدة ونوع الصيانة مطلوبان'
            });
        }

        const newLog = {
            id: Date.now().toString(),
            vessel,
            type,
            date: date || new Date().toISOString(),
            cost: cost || 0,
            status: status || 'مكتملة'
        };

        logs.push(newLog);

        const newCsrfToken = generateCSRFToken();
        req.session.csrfToken = newCsrfToken;
        req.session.csrfExpiry = Date.now() + (CSRF_CONFIG.EXPIRY_HOURS * 60 * 60 * 1000);
        res.setHeader('X-CSRF-Token', newCsrfToken);
        res.setHeader('X-Session-Expiry', req.session.csrfExpiry);
        res.json({ success: true, log: newLog });
    } catch (error) {
        console.error('Error adding log:', error);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ============================================================
// 🛡️ ERROR HANDLING
// ============================================================

// ✅ 404 Not Found
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'المسار غير موجود'
    });
});

// ✅ Error Handler
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    
    // ✅ معالجة أخطاء CSRF
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({
            success: false,
            error: 'CSRF token غير صالح',
            code: 'CSRF_INVALID'
        });
    }
    
    res.status(500).json({
        success: false,
        error: 'خطأ في الخادم',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ============================================================
// 🚀 START SERVER
// ============================================================

app.listen(PORT, () => {
    console.log(`🚢 Marine System Server running on port ${PORT}`);
    console.log(`🔒 CSRF Protection enabled (${CSRF_CONFIG.EXPIRY_HOURS} hours expiry)`);
    console.log(`🕐 Session maxAge: 30 days`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`📁 Static files from: ${basePath}`);
    console.log(`🌐 https://marine-system-71eo.onrender.com`);
});

// ============================================================
// 📦 EXPORT FOR TESTING
// ============================================================

module.exports = app;
