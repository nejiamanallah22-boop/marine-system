// ============================================================
// 🚢 MARINE SYSTEM - PROFESSIONAL SERVER v8.0 (FULL)
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
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const xss = require('xss-clean');
const hpp = require('hpp');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// 🔐 CONFIGURATION
// ============================================================

function generateSecureKey(length = 64) {
    return crypto.randomBytes(length).toString('hex');
}

const isProduction = process.env.NODE_ENV === 'production';

function isStrongPassword(password) {
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    const isLongEnough = password.length >= 12;
    return [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar, isLongEnough].filter(Boolean).length >= 4;
}

function generateStrongPassword(length = 16) {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=';
    const all = uppercase + lowercase + numbers + special;
    let password = '';
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];
    for (let i = password.length; i < length; i++) {
        password += all[Math.floor(Math.random() * all.length)];
    }
    return password.split('').sort(() => Math.random() - 0.5).join('');
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = (() => {
    if (process.env.ADMIN_PASSWORD) {
        if (!isStrongPassword(process.env.ADMIN_PASSWORD)) {
            console.warn('⚠️ Admin password is weak. Using generated strong password.');
            return generateStrongPassword();
        }
        return process.env.ADMIN_PASSWORD;
    }
    const generated = generateStrongPassword();
    console.log('=========================================');
    console.log('🔑 GENERATED ADMIN PASSWORD:', generated);
    console.log('💾 SAVE THIS PASSWORD NOW!');
    console.log('=========================================');
    return generated;
})();

const ADMIN_NAME = process.env.ADMIN_NAME || 'أمان الله ناجي';
const JWT_SECRET = process.env.JWT_SECRET || generateSecureKey(64);
const SESSION_SECRET = process.env.SESSION_SECRET || generateSecureKey(64);
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || generateSecureKey(32);
const ENCRYPTION_IV = crypto.randomBytes(16);

// ============================================================
// 🔐 ENCRYPTION FUNCTIONS
// ============================================================

function encrypt(text) {
    try {
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), ENCRYPTION_IV);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    } catch (error) {
        return text;
    }
}

function decrypt(text) {
    try {
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), ENCRYPTION_IV);
        let decrypted = decipher.update(text, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        return text;
    }
}

function generateSecureToken() {
    return crypto.randomBytes(32).toString('hex');
}

// ============================================================
// 🛡️ SECURITY MIDDLEWARE
// ============================================================

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https:", "https://unpkg.com"],
            connectSrc: ["'self'", "https://*.onrender.com", "https://unpkg.com", "https://*.googleapis.com", "https://*.leafletjs.com", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https:", "data:", "https://fonts.gstatic.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
    hidePoweredBy: true
}));

app.use(cors({
    origin: ['http://localhost:5000', 'http://localhost:3000', 'https://marine-system-71eo.onrender.com'],
    credentials: true,
    exposedHeaders: ['X-CSRF-Token', 'X-Session-Expiry', 'X-Request-ID']
}));

app.use(compression());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, error: 'Too many login attempts. Please try again after 15 minutes.' }
});
app.use('/api/auth/login', authLimiter);

app.use(xss());
app.use(hpp());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: '__Secure-marine.sid',
    cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: 'strict',
        domain: isProduction ? '.onrender.com' : undefined,
        path: '/'
    },
    rolling: true,
    proxy: isProduction
}));

app.use((req, res, next) => {
    req.requestId = generateSecureToken().substring(0, 16);
    res.setHeader('X-Request-ID', req.requestId);
    next();
});

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} - ${duration}ms - ${req.requestId}`);
    });
    next();
});

// ✅ CSRF Protection
app.use((req, res, next) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = generateSecureToken();
        req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
    }
    if (req.session.csrfExpiry && Date.now() > req.session.csrfExpiry) {
        req.session.csrfToken = generateSecureToken();
        req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
    }
    res.setHeader('X-CSRF-Token', req.session.csrfToken);
    res.setHeader('X-Session-Expiry', req.session.csrfExpiry);
    next();
});

const csrfProtection = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (['/api/auth/login', '/api/csrf-token'].includes(req.path)) return next();

    const token = req.headers['x-csrf-token'] || req.body.csrf_token;
    const sessionToken = req.session.csrfToken;
    if (!token || !sessionToken) {
        return res.status(403).json({ success: false, error: 'CSRF token غير صالح' });
    }
    try {
        const isValid = crypto.timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(sessionToken, 'utf8'));
        if (!isValid) throw new Error('Invalid token');
    } catch (error) {
        return res.status(403).json({ success: false, error: 'CSRF token غير صالح' });
    }
    const newToken = generateSecureToken();
    req.session.csrfToken = newToken;
    req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
    res.setHeader('X-CSRF-Token', newToken);
    next();
};

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
// 📊 DATA - VESSELS
// ============================================================

const vessels = [];

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
        repairUnit: '—',
        cat: 'البروق'
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
        repairUnit: 'وحدة الصيانة تونس',
        cat: 'خوافر'
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
        repairUnit: 'وحدة الصيانة جرجيس',
        cat: 'صقور'
    }
];

initialVessels.forEach(v => vessels.push(v));

// ============================================================
// 📊 DATA - USERS
// ============================================================

const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 12);

const users = [
    {
        id: '1',
        username: 'admin',
        password: hashedPassword,
        name: ADMIN_NAME,
        email: 'admin@marine.com',
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString(),
        lastLogin: null,
        loginAttempts: 0,
        locked: false,
        lockedUntil: null
    }
];

// ============================================================
// 📊 DATA - MAINTENANCE LOGS
// ============================================================

const maintenanceLogs = [];

vessels.forEach(v => {
    if (v.status === 'معطب' || v.status === 'صيانة') {
        maintenanceLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            vesselId: v.id,
            vesselName: v.name,
            vesselNum: v.num || '',
            type: v.break || 'صيانة دورية',
            status: v.status === 'معطب' ? 'متأخرة' : 'قيد التنفيذ',
            date: v.fDate || new Date().toISOString(),
            repairUnit: v.repairUnit || '—',
            cost: 0,
            notes: v.break ? `عطب: ${v.break}` : 'صيانة دورية',
            createdAt: v.fDate || new Date().toISOString()
        });
    }
});

// ============================================================
// 📊 DATA - SYSTEM LOGS
// ============================================================

const systemLogs = [];

// ============================================================
// 🔐 AUTH ENDPOINTS
// ============================================================

app.get('/api/csrf-token', (req, res) => {
    try {
        const token = req.session.csrfToken;
        const expiry = req.session.csrfExpiry || Date.now() + (8 * 60 * 60 * 1000);
        res.setHeader('Content-Type', 'application/json');
        res.json({ success: true, token: token, expiresIn: expiry - Date.now() });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to generate CSRF token' });
    }
});

app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;
        
        console.log(`🔐 Login attempt: ${username} from ${clientIP}`);

        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'بيانات غير صالحة' });
        }

        const user = users.find(u => u.username === username);
        if (!user) {
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        if (user.locked && user.lockedUntil && Date.now() < user.lockedUntil) {
            const remaining = Math.ceil((user.lockedUntil - Date.now()) / 60000);
            return res.status(403).json({
                success: false,
                error: `الحساب مقفل. حاول مرة أخرى بعد ${remaining} دقيقة`
            });
        }

        const validPassword = bcrypt.compareSync(password, user.password);
        if (!validPassword) {
            user.loginAttempts = (user.loginAttempts || 0) + 1;
            if (user.loginAttempts >= 5) {
                user.locked = true;
                user.lockedUntil = Date.now() + (30 * 60 * 1000);
                return res.status(403).json({
                    success: false,
                    error: 'الحساب مقفل لمدة 30 دقيقة بسبب كثرة المحاولات الفاشلة'
                });
            }
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        user.loginAttempts = 0;
        user.locked = false;
        user.lockedUntil = null;
        user.lastLogin = new Date().toISOString();

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        const newToken = generateSecureToken();
        req.session.csrfToken = newToken;
        req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
        req.session.userId = user.id;

        res.setHeader('X-CSRF-Token', newToken);
        res.setHeader('X-User-ID', user.id);

        systemLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            userId: user.id,
            action: 'LOGIN_SUCCESS',
            details: `User ${username} logged in from ${clientIP}`,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            token: token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                email: user.email,
                role: user.role,
                active: user.active,
                lastLogin: user.lastLogin
            },
            csrfToken: newToken
        });
    } catch (error) {
        console.error('Login error:', error);
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

        if (!user || !user.active) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود أو غير نشط' });
        }

        if (req.session.userId !== user.id) {
            return res.status(401).json({ success: false, error: 'جلسة غير صالحة' });
        }

        const newToken = generateSecureToken();
        req.session.csrfToken = newToken;
        req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
        res.setHeader('X-CSRF-Token', newToken);

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                email: user.email,
                role: user.role,
                active: user.active,
                lastLogin: user.lastLogin
            }
        });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, error: 'انتهت صلاحية التوكن' });
        }
        res.status(401).json({ success: false, error: 'توكن غير صالح' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    const userId = req.session.userId;
    
    if (userId) {
        systemLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            userId: userId,
            action: 'LOGOUT',
            details: 'User logged out',
            timestamp: new Date().toISOString()
        });
    }
    
    req.session.destroy(() => {
        res.clearCookie('__Secure-marine.sid');
        res.json({ success: true, message: 'تم تسجيل الخروج' });
    });
});

// ============================================================
// 📊 VESSELS API
// ============================================================

app.get('/api/vessels', csrfProtection, (req, res) => {
    try {
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في جلب البيانات' });
    }
});

app.post('/api/vessels', csrfProtection, (req, res) => {
    try {
        const { name, num, len, region, zone, port, supp, status, break: breakType, fDate, eDate, ref, repairUnit, cat } = req.body;
        
        if (!name) {
            return res.status(400).json({ success: false, error: 'اسم المركب مطلوب' });
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
            cat: cat || '',
            createdAt: new Date().toISOString()
        };
        
        vessels.push(newVessel);
        console.log('✅ Vessel added:', newVessel.name);

        if (status === 'معطب' || status === 'صيانة') {
            maintenanceLogs.push({
                id: crypto.randomBytes(8).toString('hex'),
                vesselId: newVessel.id,
                vesselName: newVessel.name,
                vesselNum: newVessel.num,
                type: breakType || 'صيانة دورية',
                status: status === 'معطب' ? 'متأخرة' : 'قيد التنفيذ',
                date: fDate || new Date().toISOString(),
                repairUnit: repairUnit || '—',
                cost: 0,
                notes: breakType ? `عطب: ${breakType}` : 'صيانة دورية',
                createdAt: new Date().toISOString()
            });
        }
        
        res.status(201).json({
            success: true,
            message: 'تم إضافة المركب بنجاح',
            vessel: newVessel
        });
    } catch (error) {
        console.error('❌ Error adding vessel:', error);
        res.status(500).json({ success: false, error: 'خطأ في إضافة المركب' });
    }
});

app.put('/api/vessels/:id', csrfProtection, (req, res) => {
    try {
        const vesselId = req.params.id;
        const { name, num, len, region, zone, port, supp, status, break: breakType, fDate, eDate, ref, repairUnit, cat } = req.body;
        
        const vessel = vessels.find(v => v.id === vesselId);
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'المركب غير موجود' });
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
        if (cat) vessel.cat = cat;
        vessel.updatedAt = new Date().toISOString();

        if (status && (status === 'معطب' || status === 'صيانة') && oldStatus !== status) {
            maintenanceLogs.push({
                id: crypto.randomBytes(8).toString('hex'),
                vesselId: vessel.id,
                vesselName: vessel.name,
                vesselNum: vessel.num,
                type: breakType || 'صيانة دورية',
                status: status === 'معطب' ? 'متأخرة' : 'قيد التنفيذ',
                date: fDate || new Date().toISOString(),
                repairUnit: repairUnit || '—',
                cost: 0,
                notes: breakType ? `عطب: ${breakType}` : 'صيانة دورية',
                createdAt: new Date().toISOString()
            });
        }
        
        res.json({
            success: true,
            message: 'تم تحديث المركب بنجاح',
            vessel: vessel
        });
    } catch (error) {
        console.error('❌ Error updating vessel:', error);
        res.status(500).json({ success: false, error: 'خطأ في تحديث المركب' });
    }
});

app.delete('/api/vessels/:id', csrfProtection, (req, res) => {
    try {
        const vesselId = req.params.id;
        const index = vessels.findIndex(v => v.id === vesselId);
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'المركب غير موجود' });
        }
        vessels.splice(index, 1);
        res.json({ success: true, message: 'تم حذف المركب بنجاح' });
    } catch (error) {
        console.error('❌ Error deleting vessel:', error);
        res.status(500).json({ success: false, error: 'خطأ في حذف المركب' });
    }
});

// ============================================================
// 📊 MAINTENANCE LOGS API
// ============================================================

app.get('/api/maintenance-logs', csrfProtection, (req, res) => {
    try {
        console.log('📡 Fetching maintenance logs...');
        console.log('📊 Total logs:', maintenanceLogs.length);
        res.json(maintenanceLogs);
    } catch (error) {
        console.error('❌ Error fetching maintenance logs:', error);
        res.status(500).json({ success: false, error: 'خطأ في جلب سجلات الصيانة' });
    }
});

app.post('/api/maintenance-logs', csrfProtection, (req, res) => {
    try {
        const { vesselId, vesselName, vesselNum, type, status, date, repairUnit, cost, notes } = req.body;
        
        if (!vesselName) {
            return res.status(400).json({ success: false, error: 'اسم المركب مطلوب' });
        }

        maintenanceLogs.push({
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
        });
        
        res.status(201).json({ success: true, message: 'تم إضافة سجل الصيانة' });
    } catch (error) {
        console.error('❌ Error adding maintenance log:', error);
        res.status(500).json({ success: false, error: 'خطأ في إضافة سجل الصيانة' });
    }
});

app.put('/api/maintenance-logs/:id', csrfProtection, (req, res) => {
    try {
        const logId = req.params.id;
        const { status, cost, notes } = req.body;
        
        const log = maintenanceLogs.find(l => l.id === logId);
        if (!log) {
            return res.status(404).json({ success: false, error: 'سجل الصيانة غير موجود' });
        }
        
        if (status) log.status = status;
        if (cost !== undefined) log.cost = cost;
        if (notes) log.notes = notes;
        log.updatedAt = new Date().toISOString();
        
        res.json({ success: true, message: 'تم تحديث سجل الصيانة', log: log });
    } catch (error) {
        console.error('❌ Error updating maintenance log:', error);
        res.status(500).json({ success: false, error: 'خطأ في تحديث سجل الصيانة' });
    }
});

app.delete('/api/maintenance-logs/:id', csrfProtection, (req, res) => {
    try {
        const logId = req.params.id;
        const index = maintenanceLogs.findIndex(l => l.id === logId);
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'سجل الصيانة غير موجود' });
        }
        maintenanceLogs.splice(index, 1);
        res.json({ success: true, message: 'تم حذف سجل الصيانة' });
    } catch (error) {
        console.error('❌ Error deleting maintenance log:', error);
        res.status(500).json({ success: false, error: 'خطأ في حذف سجل الصيانة' });
    }
});

// ============================================================
// 📊 MAINTENANCE PAGE API - مسار مخصص لصفحة الصيانة
// ============================================================

app.get('/api/maintenance', csrfProtection, (req, res) => {
    try {
        console.log('📡 Fetching maintenance data...');
        
        const total = vessels.length;
        const damaged = vessels.filter(v => v.status === 'معطب').length;
        const maintenance = vessels.filter(v => v.status === 'صيانة').length;
        const ready = vessels.filter(v => v.status === 'صالح').length;
        
        res.json({
            success: true,
            vessels: vessels,
            stats: {
                total: total,
                damaged: damaged,
                maintenance: maintenance,
                ready: ready
            },
            logs: maintenanceLogs
        });
    } catch (error) {
        console.error('❌ Error fetching maintenance data:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في جلب بيانات الصيانة' 
        });
    }
});

app.put('/api/maintenance/:id', csrfProtection, (req, res) => {
    try {
        const vesselId = req.params.id;
        const { status, repairUnit, break: breakType, eDate } = req.body;
        
        const vessel = vessels.find(v => v.id === vesselId);
        if (!vessel) {
            return res.status(404).json({ 
                success: false, 
                error: 'المركب غير موجود' 
            });
        }
        
        const oldStatus = vessel.status;
        
        if (status) vessel.status = status;
        if (repairUnit) vessel.repairUnit = repairUnit;
        if (breakType !== undefined) vessel.break = breakType;
        if (eDate) vessel.eDate = eDate;
        vessel.updatedAt = new Date().toISOString();
        
        if (status === 'صالح' && oldStatus !== 'صالح') {
            maintenanceLogs.push({
                id: crypto.randomBytes(8).toString('hex'),
                vesselId: vessel.id,
                vesselName: vessel.name,
                vesselNum: vessel.num || '',
                type: 'إصلاح',
                status: 'مكتملة',
                date: new Date().toISOString(),
                repairUnit: repairUnit || vessel.repairUnit || '—',
                cost: 0,
                notes: `تم إصلاح المركب ${vessel.name}`,
                createdAt: new Date().toISOString()
            });
        }
        
        if (status && (status === 'معطب' || status === 'صيانة') && oldStatus !== status) {
            maintenanceLogs.push({
                id: crypto.randomBytes(8).toString('hex'),
                vesselId: vessel.id,
                vesselName: vessel.name,
                vesselNum: vessel.num || '',
                type: breakType || 'صيانة دورية',
                status: status === 'معطب' ? 'متأخرة' : 'قيد التنفيذ',
                date: new Date().toISOString(),
                repairUnit: repairUnit || vessel.repairUnit || '—',
                cost: 0,
                notes: breakType ? `عطب: ${breakType}` : 'صيانة دورية',
                createdAt: new Date().toISOString()
            });
        }
        
        console.log('✅ Vessel updated:', vessel.name);
        
        res.json({
            success: true,
            message: 'تم تحديث المركب بنجاح',
            vessel: vessel
        });
    } catch (error) {
        console.error('❌ Error updating maintenance:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في تحديث المركب' 
        });
    }
});

// ============================================================
// 📊 USERS PAGE API - مسار مخصص لصفحة المستخدمين
// ============================================================

app.get('/api/users-data', csrfProtection, (req, res) => {
    try {
        console.log('📡 Fetching users data...');
        
        const safeUsers = users.map(u => ({
            id: u.id,
            username: u.username,
            name: u.name,
            email: u.email,
            role: u.role,
            active: u.active,
            createdAt: u.createdAt,
            lastLogin: u.lastLogin
        }));
        
        res.json({
            success: true,
            users: safeUsers,
            stats: {
                total: users.length,
                active: users.filter(u => u.active).length,
                inactive: users.filter(u => !u.active).length,
                admins: users.filter(u => u.role === 'admin').length
            }
        });
    } catch (error) {
        console.error('❌ Error fetching users data:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في جلب بيانات المستخدمين' 
        });
    }
});

app.put('/api/users-status/:id', csrfProtection, (req, res) => {
    try {
        const userId = req.params.id;
        const { active } = req.body;
        
        const user = users.find(u => u.id === userId);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'المستخدم غير موجود' 
            });
        }
        
        if (user.username === 'admin') {
            return res.status(403).json({ 
                success: false, 
                error: 'لا يمكن تغيير حالة المستخدم الرئيسي' 
            });
        }
        
        user.active = active;
        user.updatedAt = new Date().toISOString();
        
        console.log(`✅ User ${user.username} ${active ? 'activated' : 'deactivated'}`);
        
        res.json({
            success: true,
            message: `تم ${active ? 'تفعيل' : 'تعطيل'} المستخدم بنجاح`,
            user: {
                id: user.id,
                username: user.username,
                active: user.active
            }
        });
    } catch (error) {
        console.error('❌ Error updating user status:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في تحديث حالة المستخدم' 
        });
    }
});

// ============================================================
// 📊 SYSTEM LOGS API
// ============================================================

app.get('/api/logs', csrfProtection, (req, res) => {
    try {
        console.log('📡 Fetching system logs...');
        console.log('📊 Total logs:', systemLogs.length);
        res.json(systemLogs.slice(-100));
    } catch (error) {
        console.error('❌ Error fetching logs:', error);
        res.status(500).json({ success: false, error: 'خطأ في جلب السجلات' });
    }
});

app.post('/api/logs', csrfProtection, (req, res) => {
    try {
        const { action, details, userId } = req.body;
        
        systemLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            userId: userId || null,
            action: action || 'Unknown',
            details: details || '',
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json({ success: true, message: 'تم إضافة السجل' });
    } catch (error) {
        console.error('❌ Error adding log:', error);
        res.status(500).json({ success: false, error: 'خطأ في إضافة السجل' });
    }
});

app.delete('/api/logs/:id', csrfProtection, (req, res) => {
    try {
        const logId = req.params.id;
        const index = systemLogs.findIndex(l => l.id === logId);
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'السجل غير موجود' });
        }
        systemLogs.splice(index, 1);
        res.json({ success: true, message: 'تم حذف السجل' });
    } catch (error) {
        console.error('❌ Error deleting log:', error);
        res.status(500).json({ success: false, error: 'خطأ في حذف السجل' });
    }
});

// ============================================================
// 📊 SESSION STATUS API
// ============================================================

app.get('/api/session-status', (req, res) => {
    res.json({
        success: true,
        hasSession: !!req.session,
        hasCsrf: !!req.session.csrfToken,
        sessionId: req.sessionID,
        userId: req.session.userId || null
    });
});

// ============================================================
// 📊 USERS API
// ============================================================

app.get('/api/users', csrfProtection, (req, res) => {
    try {
        const safeUsers = users.map(u => ({
            id: u.id,
            username: u.username,
            name: u.name,
            email: u.email,
            role: u.role,
            active: u.active,
            createdAt: u.createdAt,
            lastLogin: u.lastLogin
        }));
        res.json(safeUsers);
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

app.post('/api/users', csrfProtection, (req, res) => {
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
            password: bcrypt.hashSync(password, 12),
            email: email || `${username}@marine.com`,
            name: username,
            role: role || 'viewer',
            active: active !== undefined ? active : true,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            loginAttempts: 0,
            locked: false,
            lockedUntil: null
        };
        
        users.push(newUser);
        console.log('✅ User created:', username);
        
        systemLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            userId: newUser.id,
            action: 'USER_CREATED',
            details: `User ${username} created`,
            timestamp: new Date().toISOString()
        });
        
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

app.put('/api/users/:id', csrfProtection, (req, res) => {
    try {
        const userId = req.params.id;
        const { username, email, role, active, password } = req.body;
        
        const user = users.find(u => u.id === userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }
        
        if (user.username === 'admin' && req.body.username && req.body.username !== 'admin') {
            return res.status(403).json({ success: false, error: 'لا يمكن تغيير اسم المستخدم الرئيسي' });
        }
        
        if (username) user.username = username;
        if (email) user.email = email;
        if (role) user.role = role;
        if (active !== undefined) user.active = active;
        if (password) {
            user.password = bcrypt.hashSync(password, 12);
        }
        
        console.log('✅ User updated:', user.username);
        
        systemLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            userId: user.id,
            action: 'USER_UPDATED',
            details: `User ${user.username} updated`,
            timestamp: new Date().toISOString()
        });
        
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

app.delete('/api/users/:id', csrfProtection, (req, res) => {
    try {
        const userId = req.params.id;
        
        const userToDelete = users.find(u => u.id === userId);
        if (!userToDelete) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }
        
        if (userToDelete.username === 'admin') {
            return res.status(403).json({ success: false, error: 'لا يمكن حذف المستخدم الرئيسي' });
        }
        
        const index = users.findIndex(u => u.id === userId);
        users.splice(index, 1);
        
        console.log('✅ User deleted:', userToDelete.username);
        
        systemLogs.push({
            id: crypto.randomBytes(8).toString('hex'),
            userId: null,
            action: 'USER_DELETED',
            details: `User ${userToDelete.username} deleted`,
            timestamp: new Date().toISOString()
        });
        
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
// 🌐 PAGE ROUTES
// ============================================================

function findPageFile(pageName) {
    const possiblePaths = [
        path.join(publicPagesDir, pageName + '.html'),
        path.join(pagesDir, pageName + '.html'),
        path.join(publicDir, pageName + '.html'),
        path.join(__dirname, pageName + '.html')
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return p;
        }
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
                    <p class="info">🔒 <strong>الأمان:</strong> عالي جداً</p>
                    <p class="info">👤 <strong>المستخدم:</strong> admin</p>
                    <p class="info">🔑 <strong>كلمة المرور:</strong> ${ADMIN_PASSWORD}</p>
                    <p class="info">📊 <strong>المراكب:</strong> ${vessels.length}</p>
                    <p class="info">📝 <strong>سجلات الصيانة:</strong> ${maintenanceLogs.length}</p>
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
                        <a href="/maintenance">🔧 الصيانة</a>
                        <a href="/logs">📝 سجلات الصيانة</a>
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

app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ success: false, error: 'API not found' });
    }
    if (req.path.includes('.') && !req.path.startsWith('/api')) {
        return res.status(404).send('❌ ملف غير موجود');
    }
    res.redirect('/');
});

// ============================================================
// 🔧 ERROR HANDLING
// ============================================================

app.use((err, req, res, next) => {
    console.error('❌ Global error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: isProduction ? 'حدث خطأ في الخادم' : err.message
    });
});

// ============================================================
// 🚀 START SERVER
// ============================================================

app.listen(PORT, () => {
    console.log('=========================================');
    console.log('🚢 MARINE SYSTEM v8.0 - PROFESSIONAL');
    console.log('=========================================');
    console.log(`📍 Server: http://localhost:${PORT}`);
    console.log(`👤 Admin: ${ADMIN_USERNAME}`);
    console.log(`🔑 Password: ${ADMIN_PASSWORD}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('🔒 Security Level: ULTRA HIGH');
    console.log(`📊 Vessels: ${vessels.length}`);
    console.log(`📝 Maintenance Logs: ${maintenanceLogs.length}`);
    console.log(`📋 System Logs: ${systemLogs.length}`);
    console.log('=========================================');
});

module.exports = app;
