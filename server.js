// ============================================================
// 🚢 MARINE SYSTEM - SERVER v8.0 (FULL WITH CSRF)
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
    origin: ['http://localhost:5000', 'http://localhost:3000', 'https://marine-system-71eo.onrender.com'],
    credentials: true,
    exposedHeaders: ['X-CSRF-Token']
}));

// ✅ JSON & URL Encoding
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ✅ Session Management (for production, use Redis or PostgreSQL)
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// ✅ CSRF Protection (comment out if issues persist)
let csrfProtection = (req, res, next) => {
    // Simple CSRF token generation for demo
    const token = req.headers['x-csrf-token'] || req.body.csrf_token;
    const sessionToken = req.session.csrfToken;
    
    // Skip CSRF check for GET requests
    if (req.method === 'GET') {
        return next();
    }
    
    // For POST/PUT/DELETE, check token
    if (!token || token !== sessionToken) {
        return res.status(403).json({
            success: false,
            error: 'CSRF token غير صالح'
        });
    }
    next();
};

// Generate CSRF token for each session
app.use((req, res, next) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = Math.random().toString(36).substring(2, 15) + 
                                Math.random().toString(36).substring(2, 15);
    }
    // Set CSRF token in response headers
    res.setHeader('X-CSRF-Token', req.session.csrfToken);
    next();
});

// ============================================================
// 🖥️ STATIC FILES & ROUTING
// ============================================================

// ✅ Serve static files from root directory
app.use(express.static(path.join(__dirname)));

// ✅ Serve pages directory
app.use('/pages', express.static(path.join(__dirname, 'pages')));

// ✅ Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ✅ Serve login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ✅ Serve specific pages
app.get('/pages/:page', (req, res) => {
    const page = req.params.page;
    const filePath = path.join(__dirname, 'pages', page + '.html');
    
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send(`
            <h1 style="color:#ef4444;text-align:center;margin-top:50px;font-family:sans-serif;">
                ❌ الصفحة "${page}" غير موجودة
            </h1>
        `);
    }
});

// ✅ Handle all other routes (SPA mode)
app.get('*', (req, res) => {
    // If request is for a file with extension, return 404
    if (req.path.includes('.')) {
        return res.status(404).send('❌ الملف غير موجود');
    }
    // Otherwise, serve index.html
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================================
// 📊 DATA STORE (In-memory for demo)
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

// ✅ Get CSRF token
app.get('/api/csrf-token', (req, res) => {
    const token = req.session.csrfToken;
    res.setHeader('X-CSRF-Token', token);
    res.json({
        success: true,
        token: token
    });
});

// ✅ Login
app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password, csrf_token } = req.body;

        // ✅ Validate CSRF token
        if (!csrf_token || csrf_token !== req.session.csrfToken) {
            return res.status(403).json({
                success: false,
                error: 'CSRF token غير صالح'
            });
        }

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
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // ✅ Send new CSRF token
        const newCsrfToken = Math.random().toString(36).substring(2, 15) + 
                            Math.random().toString(36).substring(2, 15);
        req.session.csrfToken = newCsrfToken;
        res.setHeader('X-CSRF-Token', newCsrfToken);

        res.json({
            success: true,
            token: token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                active: user.active
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
app.get('/api/auth/me', (req, res) => {
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

        // ✅ Send new CSRF token
        const newCsrfToken = Math.random().toString(36).substring(2, 15) + 
                            Math.random().toString(36).substring(2, 15);
        req.session.csrfToken = newCsrfToken;
        res.setHeader('X-CSRF-Token', newCsrfToken);

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
        res.clearCookie('connect.sid');
        res.json({ success: true, message: 'تم تسجيل الخروج' });
    });
});

// ============================================================
// 📊 DATA ENDPOINTS
// ============================================================

// ✅ Get all vessels
app.get('/api/vessels', (req, res) => {
    try {
        const newCsrfToken = Math.random().toString(36).substring(2, 15) + 
                            Math.random().toString(36).substring(2, 15);
        req.session.csrfToken = newCsrfToken;
        res.setHeader('X-CSRF-Token', newCsrfToken);
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ✅ Add vessel (requires CSRF)
app.post('/api/vessels', (req, res) => {
    try {
        // Validate CSRF
        const csrfToken = req.headers['x-csrf-token'] || req.body.csrf_token;
        if (!csrfToken || csrfToken !== req.session.csrfToken) {
            return res.status(403).json({
                success: false,
                error: 'CSRF token غير صالح'
            });
        }

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

        const newCsrfToken = Math.random().toString(36).substring(2, 15) + 
                            Math.random().toString(36).substring(2, 15);
        req.session.csrfToken = newCsrfToken;
        res.setHeader('X-CSRF-Token', newCsrfToken);
        res.json({ success: true, vessel: newVessel });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ✅ Delete vessel
app.delete('/api/vessels/:id', (req, res) => {
    try {
        const csrfToken = req.headers['x-csrf-token'];
        if (!csrfToken || csrfToken !== req.session.csrfToken) {
            return res.status(403).json({
                success: false,
                error: 'CSRF token غير صالح'
            });
        }

        const { id } = req.params;
        const index = vessels.findIndex(v => v.id === id);
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'الوحدة غير موجودة' });
        }

        vessels.splice(index, 1);

        const newCsrfToken = Math.random().toString(36).substring(2, 15) + 
                            Math.random().toString(36).substring(2, 15);
        req.session.csrfToken = newCsrfToken;
        res.setHeader('X-CSRF-Token', newCsrfToken);
        res.json({ success: true, message: 'تم حذف الوحدة' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ✅ Get all users
app.get('/api/users', (req, res) => {
    try {
        const newCsrfToken = Math.random().toString(36).substring(2, 15) + 
                            Math.random().toString(36).substring(2, 15);
        req.session.csrfToken = newCsrfToken;
        res.setHeader('X-CSRF-Token', newCsrfToken);
        // Don't send passwords
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
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ✅ Add user (requires CSRF)
app.post('/api/users', (req, res) => {
    try {
        const csrfToken = req.headers['x-csrf-token'] || req.body.csrf_token;
        if (!csrfToken || csrfToken !== req.session.csrfToken) {
            return res.status(403).json({
                success: false,
                error: 'CSRF token غير صالح'
            });
        }

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

        const newCsrfToken = Math.random().toString(36).substring(2, 15) + 
                            Math.random().toString(36).substring(2, 15);
        req.session.csrfToken = newCsrfToken;
        res.setHeader('X-CSRF-Token', newCsrfToken);
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
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ✅ Get all logs
app.get('/api/logs', (req, res) => {
    try {
        const newCsrfToken = Math.random().toString(36).substring(2, 15) + 
                            Math.random().toString(36).substring(2, 15);
        req.session.csrfToken = newCsrfToken;
        res.setHeader('X-CSRF-Token', newCsrfToken);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ✅ Add log (requires CSRF)
app.post('/api/logs', (req, res) => {
    try {
        const csrfToken = req.headers['x-csrf-token'] || req.body.csrf_token;
        if (!csrfToken || csrfToken !== req.session.csrfToken) {
            return res.status(403).json({
                success: false,
                error: 'CSRF token غير صالح'
            });
        }

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

        const newCsrfToken = Math.random().toString(36).substring(2, 15) + 
                            Math.random().toString(36).substring(2, 15);
        req.session.csrfToken = newCsrfToken;
        res.setHeader('X-CSRF-Token', newCsrfToken);
        res.json({ success: true, log: newLog });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ============================================================
// 🚀 START SERVER
// ============================================================

app.listen(PORT, () => {
    console.log(`🚢 Marine System Server running on port ${PORT}`);
    console.log(`🔒 CSRF Protection enabled`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`🌐 https://marine-system-71eo.onrender.com`);
});

// ============================================================
// 📦 EXPORT FOR TESTING
// ============================================================

module.exports = app;
