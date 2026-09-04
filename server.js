// ============================================================
// 🚢 MARINE SYSTEM - SERVER WITH CSRF PROTECTION
// ============================================================

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const csurf = require('csurf');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// 📦 CONFIGURATION
// ============================================================

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production';
const SESSION_SECRET = process.env.SESSION_SECRET || 'session-secret-change-in-production';

// ============================================================
// 🔧 MIDDLEWARE
// ============================================================

app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:5500'],
    credentials: true,
    exposedHeaders: ['X-CSRF-Token']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ✅ Session management
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

// ✅ CSRF Protection
const csrfProtection = csurf({
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    }
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
    }
];

// ============================================================
// 🛡️ CSRF TOKEN ENDPOINT
// ============================================================

app.get('/api/csrf-token', csrfProtection, (req, res) => {
    const csrfToken = req.csrfToken();
    res.setHeader('X-CSRF-Token', csrfToken);
    res.json({
        success: true,
        token: csrfToken
    });
});

// ============================================================
// 🔐 AUTH ENDPOINTS
// ============================================================

// ✅ Login with CSRF protection
app.post('/api/auth/login', csrfProtection, async (req, res) => {
    try {
        const { username, password, csrf_token } = req.body;

        // ✅ Validate CSRF token
        if (!csrf_token || csrf_token !== req.csrfToken()) {
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
        const newCsrfToken = req.csrfToken();
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
app.get('/api/auth/me', csrfProtection, async (req, res) => {
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
        const newCsrfToken = req.csrfToken();
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
app.post('/api/auth/logout', csrfProtection, (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.clearCookie('connect.sid');
        res.json({ success: true, message: 'تم تسجيل الخروج' });
    });
});

// ============================================================
// 📊 DATA ENDPOINTS (with CSRF protection)
// ============================================================

// ✅ Get all vessels
app.get('/api/vessels', csrfProtection, (req, res) => {
    try {
        const newCsrfToken = req.csrfToken();
        res.setHeader('X-CSRF-Token', newCsrfToken);
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ✅ Add vessel (requires CSRF)
app.post('/api/vessels', csrfProtection, (req, res) => {
    try {
        // Validate CSRF
        const csrfToken = req.headers['x-csrf-token'] || req.body.csrf_token;
        if (!csrfToken || csrfToken !== req.csrfToken()) {
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
            name,
            type: type || 'غير محدد',
            status: status || 'جاهز',
            location: location || '—',
            lastMaintenance: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };

        vessels.push(newVessel);

        const newCsrfToken = req.csrfToken();
        res.setHeader('X-CSRF-Token', newCsrfToken);
        res.json({ success: true, vessel: newVessel });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ✅ Delete vessel
app.delete('/api/vessels/:id', csrfProtection, (req, res) => {
    try {
        const csrfToken = req.headers['x-csrf-token'];
        if (!csrfToken || csrfToken !== req.csrfToken()) {
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

        const newCsrfToken = req.csrfToken();
        res.setHeader('X-CSRF-Token', newCsrfToken);
        res.json({ success: true, message: 'تم حذف الوحدة' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ✅ Get all users
app.get('/api/users', csrfProtection, (req, res) => {
    try {
        const newCsrfToken = req.csrfToken();
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
app.post('/api/users', csrfProtection, (req, res) => {
    try {
        const csrfToken = req.headers['x-csrf-token'] || req.body.csrf_token;
        if (!csrfToken || csrfToken !== req.csrfToken()) {
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

        const newCsrfToken = req.csrfToken();
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
app.get('/api/logs', csrfProtection, (req, res) => {
    try {
        const newCsrfToken = req.csrfToken();
        res.setHeader('X-CSRF-Token', newCsrfToken);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ✅ Add log (requires CSRF)
app.post('/api/logs', csrfProtection, (req, res) => {
    try {
        const csrfToken = req.headers['x-csrf-token'] || req.body.csrf_token;
        if (!csrfToken || csrfToken !== req.csrfToken()) {
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

        const newCsrfToken = req.csrfToken();
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
});

// ============================================================
// 📦 EXPORT FOR TESTING
// ============================================================

module.exports = app;
