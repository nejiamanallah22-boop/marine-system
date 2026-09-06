// ============================================================
// 🚢 MARINE SYSTEM - SERVER v8.0 (FULLY FIXED)
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
// 🔒 CSRF PROTECTION - SIMPLIFIED
// ============================================================

function generateToken() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

// ✅ Initialize CSRF token for all sessions
app.use((req, res, next) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = generateToken();
        req.session.csrfExpiry = Date.now() + (24 * 60 * 60 * 1000);
        console.log('🔄 New CSRF token generated');
    }

    if (req.session.csrfExpiry && Date.now() > req.session.csrfExpiry) {
        req.session.csrfToken = generateToken();
        req.session.csrfExpiry = Date.now() + (24 * 60 * 60 * 1000);
        console.log('🔄 CSRF token refreshed');
    }

    res.setHeader('X-CSRF-Token', req.session.csrfToken);
    next();
});

// ✅ CSRF Protection Middleware
const csrfProtection = (req, res, next) => {
    // Skip CSRF for GET, HEAD, OPTIONS
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    // Skip CSRF for specific paths
    if (req.path === '/api/auth/login' || 
        req.path === '/api/csrf-token' || 
        req.path === '/api/csrf-refresh') {
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
    
    // Generate new token after successful validation
    const newToken = generateToken();
    req.session.csrfToken = newToken;
    req.session.csrfExpiry = Date.now() + (24 * 60 * 60 * 1000);
    res.setHeader('X-CSRF-Token', newToken);
    
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
    res.send(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🚢 Marine System</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 40px; background: #0a0e1a; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                .container { background: #1a1f35; padding: 40px; border-radius: 20px; max-width: 800px; width: 100%; box-shadow: 0 10px 40px rgba(0,0,0,0.5); border: 1px solid #2a3a5a; }
                h1 { color: #00d4ff; text-align: center; margin-bottom: 20px; font-size: 2.5em; }
                .status { background: #0d1528; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #00d4ff; }
                .status.success { border-left-color: #00ff88; }
                .status.error { border-left-color: #ff4444; }
                .info { color: #aabbcc; line-height: 1.8; }
                .info strong { color: #00d4ff; }
                .btn { background: #00d4ff; color: #0a0e1a; border: none; padding: 12px 30px; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; transition: all 0.3s; }
                .btn:hover { background: #00bbee; transform: translateY(-2px); box-shadow: 0 5px 20px rgba(0, 212, 255, 0.3); }
                .login-form { margin-top: 30px; }
                .login-form input { width: 100%; padding: 12px; margin: 10px 0; border-radius: 8px; border: 1px solid #2a3a5a; background: #0d1528; color: #fff; font-size: 16px; }
                .login-form input:focus { outline: none; border-color: #00d4ff; }
                .error { color: #ff4444; margin: 10px 0; }
                .success-msg { color: #00ff88; margin: 10px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚢 MARINE SYSTEM</h1>
                <div class="status success">
                    <h3 style="margin:0;color:#00ff88;">✅ Server Running</h3>
                    <p class="info">🌐 <strong>URL:</strong> http://localhost:${PORT}</p>
                    <p class="info">👤 <strong>Admin:</strong> ${ADMIN_USERNAME}</p>
                    <p class="info">🔑 <strong>Password:</strong> ${ADMIN_PASSWORD}</p>
                </div>
                <div id="loginSection">
                    <div class="login-form">
                        <h3>🔐 تسجيل الدخول</h3>
                        <div id="message"></div>
                        <input type="text" id="username" placeholder="اسم المستخدم" value="${ADMIN_USERNAME}">
                        <input type="password" id="password" placeholder="كلمة المرور" value="${ADMIN_PASSWORD}">
                        <button class="btn" onclick="handleLogin()" style="width:100%;margin-top:10px;">🚀 تسجيل الدخول</button>
                    </div>
                </div>
                <div id="userInfo" style="display:none;margin-top:20px;padding:20px;background:#0d1528;border-radius:10px;">
                    <p>👤 <strong>مرحباً بك، <span id="userName"></span></strong></p>
                    <p>📋 الدور: <span id="userRole"></span></p>
                    <button class="btn" onclick="handleLogout()" style="background:#ff4444;">🚪 تسجيل الخروج</button>
                </div>
            </div>
            <script>
                let csrfToken = '';

                // ✅ Get CSRF Token
                async function getCsrfToken() {
                    try {
                        const response = await fetch('/api/csrf-token', {
                            method: 'GET',
                            credentials: 'include'
                        });
                        const data = await response.json();
                        if (data.success) {
                            csrfToken = data.token;
                            console.log('✅ CSRF Token loaded:', csrfToken);
                            return data.token;
                        }
                        return null;
                    } catch (error) {
                        console.error('❌ Error fetching CSRF token:', error);
                        return null;
                    }
                }

                // ✅ Handle Login
                async function handleLogin() {
                    const username = document.getElementById('username').value;
                    const password = document.getElementById('password').value;
                    const messageEl = document.getElementById('message');

                    if (!username || !password) {
                        messageEl.innerHTML = '<div class="error">⚠️ الرجاء إدخال اسم المستخدم وكلمة المرور</div>';
                        return;
                    }

                    try {
                        // Get CSRF token first
                        const token = await getCsrfToken();
                        if (!token) {
                            messageEl.innerHTML = '<div class="error">❌ فشل في الحصول على CSRF token</div>';
                            return;
                        }

                        messageEl.innerHTML = '<div style="color:#00d4ff;">⏳ جاري تسجيل الدخول...</div>';

                        const response = await fetch('/api/auth/login', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-CSRF-Token': token
                            },
                            credentials: 'include',
                            body: JSON.stringify({ username, password })
                        });

                        const data = await response.json();

                        if (response.ok && data.success) {
                            // Save user data
                            localStorage.setItem('authToken', data.token);
                            localStorage.setItem('userData', JSON.stringify(data.user));
                            localStorage.setItem('csrfToken', data.csrfToken || token);
                            
                            messageEl.innerHTML = '<div class="success-msg">✅ تم تسجيل الدخول بنجاح</div>';
                            showUserInfo(data.user);
                        } else {
                            messageEl.innerHTML = `<div class="error">❌ ${data.error || 'فشل تسجيل الدخول'}</div>`;
                        }
                    } catch (error) {
                        console.error('Login error:', error);
                        messageEl.innerHTML = '<div class="error">❌ حدث خطأ أثناء محاولة تسجيل الدخول</div>';
                    }
                }

                // ✅ Show User Info
                function showUserInfo(user) {
                    document.getElementById('loginSection').style.display = 'none';
                    document.getElementById('userInfo').style.display = 'block';
                    document.getElementById('userName').textContent = user.name || user.username;
                    document.getElementById('userRole').textContent = user.role || 'مستخدم';
                }

                // ✅ Handle Logout
                async function handleLogout() {
                    try {
                        await fetch('/api/auth/logout', {
                            method: 'POST',
                            credentials: 'include'
                        });
                        localStorage.removeItem('authToken');
                        localStorage.removeItem('userData');
                        localStorage.removeItem('csrfToken');
                        document.getElementById('loginSection').style.display = 'block';
                        document.getElementById('userInfo').style.display = 'none';
                        document.getElementById('message').innerHTML = '<div class="success-msg">✅ تم تسجيل الخروج بنجاح</div>';
                    } catch (error) {
                        console.error('Logout error:', error);
                    }
                }

                // ✅ Check if user is already logged in
                async function checkAuth() {
                    const token = localStorage.getItem('authToken');
                    if (token) {
                        try {
                            const response = await fetch('/api/auth/me', {
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'X-CSRF-Token': await getCsrfToken()
                                },
                                credentials: 'include'
                            });
                            const data = await response.json();
                            if (data.success) {
                                showUserInfo(data.user);
                                return;
                            }
                        } catch (error) {
                            console.error('Auth check failed:', error);
                        }
                    }
                    document.getElementById('loginSection').style.display = 'block';
                    document.getElementById('userInfo').style.display = 'none';
                }

                // ✅ Enter key support
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const loginSection = document.getElementById('loginSection');
                        if (loginSection && loginSection.style.display !== 'none') {
                            handleLogin();
                        }
                    }
                });

                // ✅ Initialize
                getCsrfToken().then(() => checkAuth());
            </script>
        </body>
        </html>
    `);
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

// ✅ Get CSRF Token
app.get('/api/csrf-token', (req, res) => {
    const token = req.session.csrfToken || generateToken();
    if (!req.session.csrfToken) {
        req.session.csrfToken = token;
        req.session.csrfExpiry = Date.now() + (24 * 60 * 60 * 1000);
    }
    res.json({
        success: true,
        token: token,
        expiresIn: req.session.csrfExpiry ? req.session.csrfExpiry - Date.now() : 86400000
    });
});

// ✅ Get CSRF Token (Alias for compatibility)
app.get('/api/csrf-refresh', (req, res) => {
    const token = req.session.csrfToken || generateToken();
    if (!req.session.csrfToken) {
        req.session.csrfToken = token;
        req.session.csrfExpiry = Date.now() + (24 * 60 * 60 * 1000);
    }
    res.json({
        success: true,
        csrfToken: token,
        expiresIn: req.session.csrfExpiry ? req.session.csrfExpiry - Date.now() : 86400000
    });
});

// ✅ Login
app.post('/api/auth/login', (req, res) => {
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

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

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

// ✅ Verify Token
app.get('/api/auth/me', (req, res) => {
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

// ✅ Logout
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
    console.log(`👤 Admin: ${ADMIN_USERNAME}`);
    console.log(`🔑 Password: ${ADMIN_PASSWORD}`);
});

module.exports = app;
