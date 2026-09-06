// ============================================================
// 🚢 MARINE SYSTEM - WITH MAINTENANCE LOGS
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

console.log('=========================================');
console.log('🚢 MARINE SYSTEM - WITH MAINTENANCE LOGS');
console.log('=========================================');
console.log(`👤 Admin: ${ADMIN_USERNAME}`);
console.log(`🔑 Password: ${ADMIN_PASSWORD}`);
console.log('=========================================');

// ============================================================
// 🔧 MIDDLEWARE
// ============================================================

app.use(cors({
    origin: ['http://localhost:5000', 'http://localhost:3000', 'https://marine-system-71eo.onrender.com'],
    credentials: true
}));

app.use('/api/*', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    next();
});

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

const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 10);

const users = [
    {
        id: '1',
        username: 'admin',
        password: hashedPassword,
        name: 'Administrator',
        email: 'admin@marine.com',
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString(),
        loginAttempts: 0,
        locked: false,
        lockedUntil: null
    }
];

// ✅ المراكب
const vessels = [];

// ✅ سجلات الصيانة
const maintenanceLogs = [];

// ✅ بيانات أولية
const initialVessels = [
    { 
        id: '1', 
        name: 'الوحدة 101', 
        num: '101', 
        len: 11, 
        region: 'الشمال', 
        zone: 'تونس', 
        port: 'الميناء الرئيسي', 
        supp: '—', 
        status: 'صالح', 
        break: '—', 
        fDate: null, 
        eDate: null, 
        ref: '', 
        repairUnit: '—' 
    },
    { 
        id: '2', 
        name: 'الوحدة 205', 
        num: '205', 
        len: 15, 
        region: 'الساحل', 
        zone: 'سوسة', 
        port: 'ميناء سوسة', 
        supp: '—', 
        status: 'صيانة', 
        break: 'محرك', 
        fDate: new Date().toISOString(), 
        eDate: null, 
        ref: 'M-2024-001', 
        repairUnit: 'وحدة الصيانة تونس' 
    },
    { 
        id: '3', 
        name: 'الوحدة 312', 
        num: '312', 
        len: 8, 
        region: 'الجنوب', 
        zone: 'جرجيس', 
        port: 'ميناء جرجيس', 
        supp: '—', 
        status: 'معطب', 
        break: 'هيكل', 
        fDate: new Date().toISOString(), 
        eDate: null, 
        ref: 'M-2024-002', 
        repairUnit: 'وحدة الصيانة جرجيس' 
    }
];

// ✅ إضافة البيانات الأولية
initialVessels.forEach(v => vessels.push(v));

// ✅ إضافة سجلات صيانة أولية للمركبات المعطوبة
vessels.forEach(v => {
    if (v.status === 'معطب' || v.status === 'صيانة') {
        maintenanceLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            vesselId: v.id,
            vesselName: v.name,
            vesselNum: v.num || '',
            type: v.break || 'صيانة دورية',
            status: v.status === 'معطب' ? 'عاجل' : 'قيد التنفيذ',
            date: v.fDate || new Date().toISOString(),
            repairUnit: v.repairUnit || '—',
            cost: 0,
            notes: v.break ? `عطب: ${v.break}` : 'صيانة دورية',
            createdAt: v.fDate || new Date().toISOString()
        });
        console.log(`📝 Added to maintenance log: ${v.name}`);
    }
});

console.log(`✅ Initialized ${vessels.length} vessels, ${maintenanceLogs.length} maintenance logs`);

// ============================================================
// 🔐 AUTH
// ============================================================

app.get('/api/csrf-token', (req, res) => {
    const token = crypto.randomBytes(32).toString('hex');
    req.session.csrfToken = token;
    res.json({ success: true, token: token });
});

app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;
        console.log(`🔐 Login attempt: ${username}`);

        const user = users.find(u => u.username === username);
        if (!user) {
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        if (user.locked && user.lockedUntil && Date.now() < user.lockedUntil) {
            const remaining = Math.ceil((user.lockedUntil - Date.now()) / 60000);
            return res.status(403).json({ 
                success: false, 
                error: `⚠️ الحساب مقفل. حاول مرة أخرى بعد ${remaining} دقيقة` 
            });
        }

        const isValid = bcrypt.compareSync(password, user.password);
        if (!isValid) {
            user.loginAttempts = (user.loginAttempts || 0) + 1;
            if (user.loginAttempts >= 5) {
                user.locked = true;
                user.lockedUntil = Date.now() + (30 * 60 * 1000);
                return res.status(403).json({ 
                    success: false, 
                    error: '⚠️ الحساب مقفل لمدة 30 دقيقة' 
                });
            }
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        user.loginAttempts = 0;
        user.locked = false;
        user.lockedUntil = null;

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
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

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
// 📊 VESSELS API
// ============================================================

// ✅ جلب جميع المراكب
app.get('/api/vessels', (req, res) => {
    try {
        res.json(vessels);
    } catch (error) {
        console.error('❌ Error fetching vessels:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في جلب البيانات' 
        });
    }
});

// ✅ إضافة مركب جديد + إضافة إلى سجل الصيانة تلقائياً
app.post('/api/vessels', (req, res) => {
    try {
        console.log('📦 Received vessel data:', req.body);
        
        const { name, num, len, region, zone, port, supp, status, break: breakType, fDate, eDate, ref, repairUnit } = req.body;
        
        if (!name) {
            return res.status(400).json({ 
                success: false, 
                error: 'اسم المركب مطلوب' 
            });
        }

        const newVessel = {
            id: crypto.randomBytes(8).toString('hex'),
            name: name,
            num: num || '',
            len: len || 0,
            region: region || '',
            zone: zone || '',
            port: port || '',
            supp: supp || '',
            status: status || 'صالح',
            break: breakType || '',
            fDate: fDate || null,
            eDate: eDate || null,
            ref: ref || '',
            repairUnit: repairUnit || '',
            createdAt: new Date().toISOString()
        };
        
        vessels.push(newVessel);
        console.log('✅ Vessel added:', newVessel.name);

        // ✅ إضافة إلى سجل الصيانة إذا كان معطباً أو تحت الصيانة
        if (status === 'معطب' || status === 'صيانة') {
            const logEntry = {
                id: crypto.randomBytes(8).toString('hex'),
                vesselId: newVessel.id,
                vesselName: newVessel.name,
                vesselNum: newVessel.num,
                type: breakType || 'صيانة دورية',
                status: status === 'معطب' ? 'عاجل' : 'قيد التنفيذ',
                date: fDate || new Date().toISOString(),
                repairUnit: repairUnit || '—',
                cost: 0,
                notes: breakType ? `عطب: ${breakType}` : 'صيانة دورية',
                createdAt: new Date().toISOString()
            };
            maintenanceLogs.push(logEntry);
            console.log(`📝 Added to maintenance log: ${newVessel.name}`);
        }
        
        res.status(201).json({
            success: true,
            message: 'تم إضافة المركب بنجاح',
            vessel: newVessel
        });
    } catch (error) {
        console.error('❌ Error adding vessel:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في إضافة المركب: ' + error.message 
        });
    }
});

// ✅ تحديث مركب
app.put('/api/vessels/:id', (req, res) => {
    try {
        const vesselId = req.params.id;
        const { name, num, len, region, zone, port, supp, status, break: breakType, fDate, eDate, ref, repairUnit } = req.body;
        
        const vessel = vessels.find(v => v.id === vesselId);
        if (!vessel) {
            return res.status(404).json({ 
                success: false, 
                error: 'المركب غير موجود' 
            });
        }
        
        const oldStatus = vessel.status;
        
        if (name) vessel.name = name;
        if (num !== undefined) vessel.num = num;
        if (len !== undefined) vessel.len = len;
        if (region !== undefined) vessel.region = region;
        if (zone !== undefined) vessel.zone = zone;
        if (port !== undefined) vessel.port = port;
        if (supp !== undefined) vessel.supp = supp;
        if (status) vessel.status = status;
        if (breakType !== undefined) vessel.break = breakType;
        if (fDate !== undefined) vessel.fDate = fDate;
        if (eDate !== undefined) vessel.eDate = eDate;
        if (ref !== undefined) vessel.ref = ref;
        if (repairUnit !== undefined) vessel.repairUnit = repairUnit;
        vessel.updatedAt = new Date().toISOString();
        
        console.log('✅ Vessel updated:', vessel.name);

        // ✅ إذا تغيرت الحالة إلى معطب أو صيانة، أضف إلى سجل الصيانة
        if (status && (status === 'معطب' || status === 'صيانة') && oldStatus !== status) {
            const logEntry = {
                id: crypto.randomBytes(8).toString('hex'),
                vesselId: vessel.id,
                vesselName: vessel.name,
                vesselNum: vessel.num,
                type: breakType || 'صيانة دورية',
                status: status === 'معطب' ? 'عاجل' : 'قيد التنفيذ',
                date: fDate || new Date().toISOString(),
                repairUnit: repairUnit || '—',
                cost: 0,
                notes: breakType ? `عطب: ${breakType}` : 'صيانة دورية',
                createdAt: new Date().toISOString()
            };
            maintenanceLogs.push(logEntry);
            console.log(`📝 Added to maintenance log: ${vessel.name}`);
        }
        
        res.json({
            success: true,
            message: 'تم تحديث المركب بنجاح',
            vessel: vessel
        });
    } catch (error) {
        console.error('❌ Error updating vessel:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في تحديث المركب' 
        });
    }
});

// ✅ حذف مركب
app.delete('/api/vessels/:id', (req, res) => {
    try {
        const vesselId = req.params.id;
        const index = vessels.findIndex(v => v.id === vesselId);
        
        if (index === -1) {
            return res.status(404).json({ 
                success: false, 
                error: 'المركب غير موجود' 
            });
        }
        
        const deleted = vessels.splice(index, 1)[0];
        console.log('✅ Vessel deleted:', deleted.name);
        
        res.json({
            success: true,
            message: 'تم حذف المركب بنجاح'
        });
    } catch (error) {
        console.error('❌ Error deleting vessel:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في حذف المركب' 
        });
    }
});

// ============================================================
// 📊 MAINTENANCE LOGS API
// ============================================================

// ✅ جلب سجلات الصيانة
app.get('/api/maintenance-logs', (req, res) => {
    try {
        res.json(maintenanceLogs.slice(-100));
    } catch (error) {
        console.error('❌ Error fetching maintenance logs:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في جلب سجلات الصيانة' 
        });
    }
});

// ✅ إضافة سجل صيانة يدوياً
app.post('/api/maintenance-logs', (req, res) => {
    try {
        const { vesselId, vesselName, vesselNum, type, status, date, repairUnit, cost, notes } = req.body;
        
        if (!vesselName) {
            return res.status(400).json({ 
                success: false, 
                error: 'اسم المركب مطلوب' 
            });
        }

        const logEntry = {
            id: crypto.randomBytes(8).toString('hex'),
            vesselId: vesselId || '',
            vesselName: vesselName,
            vesselNum: vesselNum || '',
            type: type || 'صيانة دورية',
            status: status || 'قيد التنفيذ',
            date: date || new Date().toISOString(),
            repairUnit: repairUnit || '—',
            cost: cost || 0,
            notes: notes || '',
            createdAt: new Date().toISOString()
        };
        
        maintenanceLogs.push(logEntry);
        console.log('✅ Maintenance log added:', logEntry.vesselName);
        
        res.status(201).json({
            success: true,
            message: 'تم إضافة سجل الصيانة',
            log: logEntry
        });
    } catch (error) {
        console.error('❌ Error adding maintenance log:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في إضافة سجل الصيانة' 
        });
    }
});

// ✅ تحديث سجل صيانة
app.put('/api/maintenance-logs/:id', (req, res) => {
    try {
        const logId = req.params.id;
        const { status, cost, notes } = req.body;
        
        const log = maintenanceLogs.find(l => l.id === logId);
        if (!log) {
            return res.status(404).json({ 
                success: false, 
                error: 'سجل الصيانة غير موجود' 
            });
        }
        
        if (status) log.status = status;
        if (cost !== undefined) log.cost = cost;
        if (notes) log.notes = notes;
        log.updatedAt = new Date().toISOString();
        
        console.log('✅ Maintenance log updated:', log.vesselName);
        
        res.json({
            success: true,
            message: 'تم تحديث سجل الصيانة',
            log: log
        });
    } catch (error) {
        console.error('❌ Error updating maintenance log:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في تحديث سجل الصيانة' 
        });
    }
});

// ✅ حذف سجل صيانة
app.delete('/api/maintenance-logs/:id', (req, res) => {
    try {
        const logId = req.params.id;
        const index = maintenanceLogs.findIndex(l => l.id === logId);
        
        if (index === -1) {
            return res.status(404).json({ 
                success: false, 
                error: 'سجل الصيانة غير موجود' 
            });
        }
        
        maintenanceLogs.splice(index, 1);
        console.log('✅ Maintenance log deleted:', logId);
        
        res.json({
            success: true,
            message: 'تم حذف سجل الصيانة'
        });
    } catch (error) {
        console.error('❌ Error deleting maintenance log:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في حذف سجل الصيانة' 
        });
    }
});

// ============================================================
// 📊 USERS API
// ============================================================

app.get('/api/users', (req, res) => {
    try {
        const safeUsers = users.map(u => ({
            id: u.id,
            username: u.username,
            name: u.name,
            email: u.email,
            role: u.role,
            active: u.active
        }));
        res.json(safeUsers);
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في الخادم' 
        });
    }
});

// ============================================================
// 🌐 PAGE ROUTES
// ============================================================

function findPageFile(pageName) {
    const paths = [
        path.join(publicPagesDir, pageName + '.html'),
        path.join(pagesDir, pageName + '.html'),
        path.join(publicDir, pageName + '.html'),
        path.join(__dirname, pageName + '.html')
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

app.get('/', (req, res) => {
    const paths = [
        path.join(__dirname, 'index.html'),
        path.join(publicDir, 'index.html'),
        path.join(pagesDir, 'index.html'),
        path.join(publicPagesDir, 'index.html')
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) return res.sendFile(p);
    }
    res.send(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>🚢 Marine System</title>
        <style>
            *{margin:0;padding:0;box-sizing:border-box}
            body{font-family:'Segoe UI',sans-serif;background:#0a0e1a;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}
            .container{background:linear-gradient(145deg,#1a1f35,#0d1528);padding:50px;border-radius:30px;max-width:600px;width:100%;border:1px solid #2a3a5a;text-align:center}
            h1{color:#00d4ff;font-size:2.5em}
            .status{background:#0d1528;padding:20px;border-radius:15px;margin:20px 0;border-right:5px solid #00ff88}
            .info{color:#aabbcc;line-height:2}
            .info strong{color:#00d4ff}
            .btn{background:linear-gradient(135deg,#00d4ff,#0099cc);color:#0a0e1a;border:none;padding:15px 40px;border-radius:10px;font-size:18px;font-weight:bold;cursor:pointer;transition:all 0.3s;width:100%;margin-top:15px}
            .btn:hover{transform:translateY(-3px);box-shadow:0 10px 30px rgba(0,212,255,0.3)}
            .btn-logout{background:linear-gradient(135deg,#ff4444,#cc0000)}
            .error{color:#ff4444;margin:10px 0}
            .success-msg{color:#00ff88;margin:10px 0}
            .login-section,.user-section{margin-top:30px;text-align:right}
            .user-section{display:none}
            .badge{display:inline-block;padding:5px 15px;border-radius:20px;font-size:14px;margin:5px 0;background:#ff4444;color:#fff}
            .login-form input{width:100%;padding:15px;margin:10px 0;border-radius:10px;border:1px solid #2a3a5a;background:#0d1528;color:#fff;font-size:16px}
            .login-form input:focus{outline:none;border-color:#00d4ff}
            .footer{margin-top:30px;padding-top:20px;border-top:1px solid #2a3a5a;color:#667788;font-size:12px}
            .links{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:20px}
            .links a{display:inline-block;padding:10px 20px;background:#2a3a5a;color:#fff;text-decoration:none;border-radius:8px;font-size:14px}
            .links a:hover{background:#3a4a6a}
        </style>
        </head>
        <body>
            <div class="container">
                <h1>🚢 MARINE SYSTEM</h1>
                <p style="color:#8899aa;">نظام إدارة الأسطول البحري</p>
                <div class="status">
                    <h3 style="color:#00ff88;">✅ النظام يعمل</h3>
                    <p class="info">👤 <strong>المستخدم:</strong> admin</p>
                    <p class="info">🔑 <strong>كلمة المرور:</strong> ${ADMIN_PASSWORD}</p>
                </div>
                <div id="loginSection" class="login-section">
                    <h3 style="color:#00d4ff;">🔐 تسجيل الدخول</h3>
                    <div id="message"></div>
                    <div class="login-form">
                        <input type="text" id="username" placeholder="اسم المستخدم" value="admin">
                        <input type="password" id="password" placeholder="كلمة المرور">
                        <button class="btn" onclick="handleLogin()">🚀 دخول</button>
                    </div>
                </div>
                <div id="userSection" class="user-section">
                    <p style="font-size:18px;">👋 <strong>مرحباً بك، <span id="userName"></span></strong></p>
                    <p>📋 <strong>الدور:</strong> <span id="userRole" class="badge">admin</span></p>
                    <div class="links">
                        <a href="/dashboard">📊 لوحة التحكم</a>
                        <a href="/fleet">🚢 الأسطول</a>
                        <a href="/maintenance">🔧 سجلات الصيانة</a>
                        <a href="/users">👥 المستخدمين</a>
                    </div>
                    <button class="btn btn-logout" onclick="handleLogout()">🚪 تسجيل الخروج</button>
                </div>
                <div class="footer">🔒 جميع البيانات مشفرة | v8.0</div>
            </div>
            <script>
                let csrfToken = '';

                async function getCsrfToken() {
                    try {
                        const r = await fetch('/api/csrf-token', { credentials: 'include', headers: { 'Accept': 'application/json' } });
                        const d = await r.json();
                        if (d.success) { csrfToken = d.token; return d.token; }
                        return null;
                    } catch(e) { return null; }
                }

                async function handleLogin() {
                    const username = document.getElementById('username').value.trim();
                    const password = document.getElementById('password').value;
                    const msg = document.getElementById('message');
                    if (!username || !password) { msg.innerHTML = '<div class="error">⚠️ الرجاء إدخال جميع البيانات</div>'; return; }
                    try {
                        const t = await getCsrfToken();
                        if (!t) { msg.innerHTML = '<div class="error">❌ فشل الحصول على CSRF token</div>'; return; }
                        msg.innerHTML = '<div style="color:#00d4ff;">⏳ جاري تسجيل الدخول...</div>';
                        const r = await fetch('/api/auth/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': t },
                            credentials: 'include',
                            body: JSON.stringify({ username, password })
                        });
                        const d = await r.json();
                        if (r.ok && d.success) {
                            localStorage.setItem('authToken', d.token);
                            localStorage.setItem('userData', JSON.stringify(d.user));
                            document.getElementById('loginSection').style.display = 'none';
                            document.getElementById('userSection').style.display = 'block';
                            document.getElementById('userName').textContent = d.user.name || d.user.username;
                            document.getElementById('userRole').textContent = d.user.role || 'مستخدم';
                            msg.innerHTML = '<div class="success-msg">✅ تم تسجيل الدخول بنجاح</div>';
                        } else {
                            msg.innerHTML = '<div class="error">❌ ' + (d.error || 'فشل تسجيل الدخول') + '</div>';
                        }
                    } catch(e) {
                        msg.innerHTML = '<div class="error">❌ خطأ في الاتصال بالخادم</div>';
                    }
                }

                async function handleLogout() {
                    try {
                        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
                        localStorage.clear();
                        document.getElementById('loginSection').style.display = 'block';
                        document.getElementById('userSection').style.display = 'none';
                        document.getElementById('message').innerHTML = '<div class="success-msg">✅ تم تسجيل الخروج</div>';
                    } catch(e) {}
                }

                document.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        const loginSection = document.getElementById('loginSection');
                        if (loginSection.style.display !== 'none') handleLogin();
                    }
                });

                async function checkAuth() {
                    const token = localStorage.getItem('authToken');
                    if (!token) return;
                    try {
                        const csrf = await getCsrfToken();
                        const r = await fetch('/api/auth/me', {
                            headers: { 'Authorization': 'Bearer ' + token, 'X-CSRF-Token': csrf || '', 'Accept': 'application/json' },
                            credentials: 'include'
                        });
                        const d = await r.json();
                        if (d.success && d.user) {
                            document.getElementById('loginSection').style.display = 'none';
                            document.getElementById('userSection').style.display = 'block';
                            document.getElementById('userName').textContent = d.user.name || d.user.username;
                            document.getElementById('userRole').textContent = d.user.role || 'مستخدم';
                        } else {
                            localStorage.removeItem('authToken');
                        }
                    } catch(e) { localStorage.removeItem('authToken'); }
                }

                getCsrfToken().then(checkAuth);
            </script>
        </body>
        </html>
    `);
});

app.get('/pages/:page', (req, res) => {
    const filePath = findPageFile(req.params.page);
    if (filePath) return res.sendFile(filePath);
    res.status(404).send('<h1>❌ 404</h1><p>Page not found</p>');
});

app.get('/:page', (req, res, next) => {
    const skip = ['api', 'pages', 'public', 'css', 'js', 'assets', 'favicon.ico'];
    if (skip.includes(req.params.page)) return next();
    const filePath = findPageFile(req.params.page);
    if (filePath) return res.sendFile(filePath);
    next();
});

// ✅ API 404
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'API endpoint not found'
    });
});

// ✅ معالج الأخطاء
app.use((err, req, res, next) => {
    console.error('❌ Global error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'حدث خطأ في الخادم'
    });
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
    console.log('🚢 MARINE SYSTEM - WITH MAINTENANCE LOGS');
    console.log('=========================================');
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`👤 Username: admin`);
    console.log(`🔑 Password: ${ADMIN_PASSWORD}`);
    console.log(`📊 Vessels: ${vessels.length}`);
    console.log(`📝 Maintenance Logs: ${maintenanceLogs.length}`);
    console.log('=========================================');
});

module.exports = app;
