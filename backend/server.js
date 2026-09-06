// ============================================================
// 🚢 MARINE SYSTEM - SIMPLE WORKING SERVER
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// ⚙️ SIMPLE CONFIG
// ============================================================

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// ============================================================
// 🔧 MIDDLEWARE
// ============================================================

app.use(cors({
    origin: ['http://localhost:5000', 'http://localhost:3000', 'https://marine-system-71eo.onrender.com'],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000
    }
}));

// ============================================================
// 📊 DATA
// ============================================================

const users = [{
    id: '1',
    username: ADMIN_USERNAME,
    password: bcrypt.hashSync(ADMIN_PASSWORD, 10),
    name: 'Administrator',
    role: 'admin',
    active: true,
    createdAt: new Date().toISOString(),
    lastLogin: null
}];

// ============================================================
// 🔐 AUTH
// ============================================================

// ✅ CSRF Token
app.get('/api/csrf-token', (req, res) => {
    const token = crypto.randomBytes(32).toString('hex');
    req.session.csrfToken = token;
    res.json({ success: true, token: token });
});

// ✅ Login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    console.log('🔐 Login attempt:', username);

    const user = users.find(u => u.username === username);
    if (!user) {
        return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) {
        return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
    );

    res.json({
        success: true,
        token: token,
        user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role
        }
    });
});

// ✅ Verify Token
app.get('/api/auth/me', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.id);
        if (!user) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود' });
        }
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role
            }
        });
    } catch (error) {
        res.status(401).json({ success: false, error: 'توكن غير صالح' });
    }
});

// ✅ Logout
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true, message: 'تم تسجيل الخروج' });
    });
});

// ============================================================
// 📊 DATA ENDPOINTS
// ============================================================

app.get('/api/vessels', (req, res) => {
    res.json([
        { id: '1', name: 'الوحدة 101', type: 'زورق دورية', status: 'ready', location: 'الميناء الرئيسي' },
        { id: '2', name: 'الوحدة 205', type: 'قاطرة بحرية', status: 'maintenance', location: 'حوض السفن' },
        { id: '3', name: 'الوحدة 312', type: 'سفينة إسناد', status: 'offline', location: 'الميناء الغربي' }
    ]);
});

app.get('/api/users', (req, res) => {
    const safeUsers = users.map(u => ({
        id: u.id,
        username: u.username,
        name: u.name,
        role: u.role,
        active: u.active
    }));
    res.json(safeUsers);
});

// ============================================================
// 🌐 SERVE PAGES - الحل السحري
// ============================================================

// ✅ خدمة جميع الملفات من جميع المجلدات
app.use(express.static(__dirname));
app.use('/pages', express.static(path.join(__dirname, 'pages')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/public/pages', express.static(path.join(__dirname, 'public', 'pages')));

// ✅ الصفحة الرئيسية - تبحث عن index.html في كل مكان
app.get('/', (req, res) => {
    const paths = [
        path.join(__dirname, 'index.html'),
        path.join(__dirname, 'public', 'index.html'),
        path.join(__dirname, 'pages', 'index.html'),
        path.join(__dirname, 'public', 'pages', 'index.html')
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) {
            return res.sendFile(p);
        }
    }
    // إذا لم يوجد index.html
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>🚢 Marine System</title></head>
        <body style="font-family:Arial;background:#0a0e1a;color:#fff;text-align:center;padding:50px;">
            <h1>🚢 MARINE SYSTEM</h1>
            <p>✅ Server is running!</p>
            <p>👤 Admin: ${ADMIN_USERNAME}</p>
            <p>🔑 Password: ${ADMIN_PASSWORD}</p>
            <p><a href="/pages/dashboard" style="color:#00d4ff;">📊 Go to Dashboard</a></p>
        </body>
        </html>
    `);
});

// ✅ مسار الصفحات - يعرض أي صفحة
app.get('/pages/:page', (req, res) => {
    const pageName = req.params.page;
    
    // البحث في جميع المجلدات الممكنة
    const possiblePaths = [
        path.join(__dirname, 'pages', pageName + '.html'),
        path.join(__dirname, 'public', 'pages', pageName + '.html'),
        path.join(__dirname, 'public', pageName + '.html'),
        path.join(__dirname, pageName + '.html')
    ];
    
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            console.log(`✅ Serving: ${pageName} from ${p}`);
            return res.sendFile(p);
        }
    }
    
    // إذا لم توجد الصفحة
    res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>404</title></head>
        <body style="font-family:Arial;background:#0a0e1a;color:#fff;text-align:center;padding:50px;">
            <h1>❌ 404</h1>
            <p>الصفحة <strong>${pageName}</strong> غير موجودة</p>
            <a href="/" style="color:#00d4ff;">⬅️ العودة للرئيسية</a>
        </body>
        </html>
    `);
});

// ✅ مسار مختصر - /dashboard (بدون pages)
app.get('/:page', (req, res, next) => {
    const pageName = req.params.page;
    const skip = ['api', 'pages', 'public', 'css', 'js', 'assets', 'favicon.ico'];
    if (skip.includes(pageName)) return next();
    
    const possiblePaths = [
        path.join(__dirname, 'pages', pageName + '.html'),
        path.join(__dirname, 'public', 'pages', pageName + '.html'),
        path.join(__dirname, 'public', pageName + '.html')
    ];
    
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            console.log(`✅ Short URL: /${pageName} -> ${p}`);
            return res.sendFile(p);
        }
    }
    next();
});

// ✅ أي مسار آخر - ارجع الرئيسية
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ success: false, error: 'API not found' });
    }
    res.redirect('/');
});

// ============================================================
// 🚀 START
// ============================================================

app.listen(PORT, () => {
    console.log('=========================================');
    console.log('🚢 MARINE SYSTEM - WORKING SERVER');
    console.log('=========================================');
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`👤 Admin: ${ADMIN_USERNAME}`);
    console.log(`🔑 Password: ${ADMIN_PASSWORD}`);
    console.log('=========================================');
});
