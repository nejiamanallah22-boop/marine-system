// ============================================================
// 🚢 MARINE SYSTEM - FULL SERVER WITH COMPLETE CRUD
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
// ⚙️ CONFIG
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
// 📁 STATIC FILES
// ============================================================

const pagesDir = path.join(__dirname, 'pages');
const publicPagesDir = path.join(__dirname, 'public', 'pages');
const publicDir = path.join(__dirname, 'public');

if (!fs.existsSync(pagesDir)) fs.mkdirSync(pagesDir, { recursive: true });
if (!fs.existsSync(publicPagesDir)) fs.mkdirSync(publicPagesDir, { recursive: true });

app.use(express.static(__dirname));
app.use('/pages', express.static(pagesDir));
app.use('/pages', express.static(publicPagesDir));
app.use('/public', express.static(publicDir));
app.use('/public/pages', express.static(publicPagesDir));

// ============================================================
// 📊 DATA
// ============================================================

const users = [
    {
        id: '1',
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10),
        name: 'Administrator',
        email: 'admin@marine.com',
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString(),
        lastLogin: null
    },
    {
        id: '2',
        username: 'manager',
        password: bcrypt.hashSync('manager123', 10),
        name: 'مدير النظام',
        email: 'manager@marine.com',
        role: 'manager',
        active: true,
        createdAt: new Date().toISOString(),
        lastLogin: null
    }
];

// ============================================================
// 🔐 AUTH
// ============================================================

app.get('/api/csrf-token', (req, res) => {
    const token = crypto.randomBytes(32).toString('hex');
    req.session.csrfToken = token;
    res.json({ success: true, token: token });
});

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
            email: user.email,
            role: user.role,
            active: user.active
        }
    });
});

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
                email: user.email,
                role: user.role,
                active: user.active
            }
        });
    } catch (error) {
        res.status(401).json({ success: false, error: 'توكن غير صالح' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true, message: 'تم تسجيل الخروج' });
    });
});

// ============================================================
// 📊 VESSELS
// ============================================================

app.get('/api/vessels', (req, res) => {
    res.json([
        { id: '1', name: 'الوحدة 101', type: 'زورق دورية', status: 'ready', location: 'الميناء الرئيسي' },
        { id: '2', name: 'الوحدة 205', type: 'قاطرة بحرية', status: 'maintenance', location: 'حوض السفن' },
        { id: '3', name: 'الوحدة 312', type: 'سفينة إسناد', status: 'offline', location: 'الميناء الغربي' }
    ]);
});

// ============================================================
// 👥 USERS CRUD - كامل
// ============================================================

// ✅ جلب جميع المستخدمين
app.get('/api/users', (req, res) => {
    const safeUsers = users.map(u => ({
        id: u.id,
        username: u.username,
        name: u.name,
        email: u.email || '',
        role: u.role,
        active: u.active,
        createdAt: u.createdAt,
        lastLogin: u.lastLogin
    }));
    res.json(safeUsers);
});

// ✅ جلب مستخدم واحد
app.get('/api/users/:id', (req, res) => {
    const user = users.find(u => u.id === req.params.id);
    if (!user) {
        return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
});

// ✅ إضافة مستخدم جديد
app.post('/api/users', (req, res) => {
    try {
        const { username, password, email, role, active } = req.body;
        
        if (!username) {
            return res.status(400).json({ success: false, error: 'اسم المستخدم مطلوب' });
        }
        if (!password) {
            return res.status(400).json({ success: false, error: 'كلمة المرور مطلوبة' });
        }
        
        const existingUser = users.find(u => u.username === username);
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'اسم المستخدم موجود بالفعل' });
        }
        
        const newUser = {
            id: crypto.randomBytes(8).toString('hex'),
            username: username,
            password: bcrypt.hashSync(password, 10),
            email: email || '',
            name: username,
            role: role || 'viewer',
            active: active !== undefined ? active : true,
            createdAt: new Date().toISOString(),
            lastLogin: null
        };
        
        users.push(newUser);
        console.log('✅ User created:', username);
        
        const { password: _, ...userWithoutPassword } = newUser;
        res.status(201).json({
            success: true,
            message: 'تم إضافة المستخدم بنجاح',
            user: userWithoutPassword
        });
        
    } catch (error) {
        console.error('❌ Error creating user:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ✅ تحديث مستخدم
app.put('/api/users/:id', (req, res) => {
    try {
        const userId = req.params.id;
        const { username, email, role, active, password } = req.body;
        
        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex === -1) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }
        
        const user = users[userIndex];
        if (username) user.username = username;
        if (email) user.email = email;
        if (role) user.role = role;
        if (active !== undefined) user.active = active;
        if (password) {
            user.password = bcrypt.hashSync(password, 10);
        }
        
        console.log('✅ User updated:', user.username);
        
        const { password: _, ...userWithoutPassword } = user;
        res.json({
            success: true,
            message: 'تم تحديث المستخدم بنجاح',
            user: userWithoutPassword
        });
        
    } catch (error) {
        console.error('❌ Error updating user:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ✅ حذف مستخدم
app.delete('/api/users/:id', (req, res) => {
    try {
        const userId = req.params.id;
        
        const userToDelete = users.find(u => u.id === userId);
        if (!userToDelete) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }
        
        if (userToDelete.username === 'admin') {
            return res.status(403).json({ success: false, error: 'لا يمكن حذف المستخدم الرئيسي' });
        }
        
        const userIndex = users.findIndex(u => u.id === userId);
        users.splice(userIndex, 1);
        
        console.log('✅ User deleted:', userToDelete.username);
        res.json({
            success: true,
            message: 'تم حذف المستخدم بنجاح'
        });
        
    } catch (error) {
        console.error('❌ Error deleting user:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// ============================================================
// 📋 LOGS
// ============================================================

const logs = [];

app.get('/api/logs', (req, res) => {
    res.json(logs.slice(-100));
});

// ============================================================
// 🌐 PAGE ROUTES
// ============================================================

app.get('/', (req, res) => {
    const paths = [
        path.join(__dirname, 'index.html'),
        path.join(publicDir, 'index.html'),
        path.join(pagesDir, 'index.html'),
        path.join(publicPagesDir, 'index.html')
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) {
            return res.sendFile(p);
        }
    }
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>🚢 Marine System</title></head>
        <body style="font-family:Arial;background:#0a0e1a;color:#fff;text-align:center;padding:50px;">
            <h1>🚢 MARINE SYSTEM</h1>
            <p>✅ Server is running!</p>
            <p>👤 Admin: ${ADMIN_USERNAME}</p>
            <p>🔑 Password: ${ADMIN_PASSWORD}</p>
            <p><a href="/pages/dashboard" style="color:#00d4ff;">📊 Dashboard</a></p>
            <p><a href="/pages/users" style="color:#00d4ff;">👥 Users</a></p>
        </body>
        </html>
    `);
});

app.get('/pages/:page', (req, res) => {
    const pageName = req.params.page;
    console.log(`📄 Looking for: ${pageName}`);
    
    const possiblePaths = [
        path.join(publicPagesDir, pageName + '.html'),
        path.join(pagesDir, pageName + '.html'),
        path.join(publicDir, pageName + '.html'),
        path.join(__dirname, pageName + '.html')
    ];
    
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            console.log(`✅ Found: ${pageName} at ${p}`);
            return res.sendFile(p);
        }
    }
    
    console.log(`❌ Not found: ${pageName}`);
    res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>404</title></head>
        <body style="font-family:Arial;background:#0a0e1a;color:#fff;text-align:center;padding:50px;">
            <h1>❌ 404</h1>
            <p>الصفحة <strong>${pageName}</strong> غير موجودة</p>
            <a href="/" style="color:#00d4ff;">⬅️ العودة</a>
        </body>
        </html>
    `);
});

app.get('/:page', (req, res, next) => {
    const pageName = req.params.page;
    const skip = ['api', 'pages', 'public', 'css', 'js', 'assets', 'favicon.ico'];
    if (skip.includes(pageName)) return next();
    
    const possiblePaths = [
        path.join(publicPagesDir, pageName + '.html'),
        path.join(pagesDir, pageName + '.html'),
        path.join(publicDir, pageName + '.html')
    ];
    
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            console.log(`✅ Short URL: /${pageName} -> ${p}`);
            return res.sendFile(p);
        }
    }
    next();
});

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
    console.log('🚢 MARINE SYSTEM - FULL CRUD');
    console.log('=========================================');
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`👤 Admin: ${ADMIN_USERNAME}`);
    console.log(`🔑 Password: ${ADMIN_PASSWORD}`);
    console.log('=========================================');
});
