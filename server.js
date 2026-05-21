const express = require('express');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== بيانات محلية ====================
const users = [
    { id: 1, name: 'admin', pass: '1234', role: 'مسؤول', enabled: true, isMainAdmin: true },
    { id: 2, name: 'editor', pass: '1234', role: 'محرر', enabled: true },
    { id: 3, name: 'viewer', pass: '1234', role: 'مشاهد', enabled: true }
];

let vessels = [
    { id: 1, name: 'البروق 1', num: 'B001', len: 11, reg: 'الشمال', zone: 'تونس', port: 'تونس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'البروق' },
    { id: 2, name: 'خافرة معطوبة', num: 'K002', len: 20, reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: '', stat: 'معطب', break: 'محرك محترق', fDate: '2024-05-01', eDate: '2024-06-15', ref: 'REF001', cat: 'خوافر' },
    { id: 3, name: 'زورق صيانة', num: 'Z003', len: 15, reg: 'الجنوب', zone: 'جربة', port: 'جربة', supp: '', stat: 'صيانة', break: 'عطل كهربائي', fDate: '2024-05-10', eDate: '2024-05-30', ref: 'REF002', cat: 'زوارق مزدوجة' },
    { id: 4, name: 'صقر الشمال', num: 'S004', len: 10, reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'صقور' },
    { id: 5, name: 'وحدة صيانة تونس', num: 'M001', len: 0, reg: 'وحدة الصيانة والإسناد البحري تونس', zone: 'تونس', port: 'تونس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'وحدة صيانة' },
    { id: 6, name: 'وحدة صيانة المنستير', num: 'M002', len: 0, reg: 'وحدة الصيانة والإسناد البحري المنستير', zone: 'المنستير', port: 'المنستير', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'وحدة صيانة' },
    { id: 7, name: 'وحدة صيانة صفاقس', num: 'M003', len: 0, reg: 'وحدة الصيانة والإسناد البحري صفاقس', zone: 'صفاقس', port: 'صفاقس', supp: '', stat: 'صيانة', break: 'تجهيزات', fDate: '2024-05-20', eDate: '2024-06-10', ref: 'REF003', cat: 'وحدة صيانة' },
    { id: 8, name: 'وحدة صيانة جرجيس', num: 'M004', len: 0, reg: 'وحدة الصيانة والإسناد البحري جرجيس', zone: 'جرجيس', port: 'جرجيس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'وحدة صيانة' },
    { id: 9, name: 'المجمع الأمني بقبيبة', num: 'A001', len: 0, reg: 'المجمع الأمني بقبيبة', zone: 'قبيبة', port: 'قبيبة', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'مركز أمني' }
];

let tickets = [];
let userSessions = [];
let nextId = 10;

// Middleware
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use(cookieParser());

const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use('/api/', apiLimiter);

app.use(session({
    secret: 'marine_secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000, httpOnly: true, secure: false, sameSite: 'lax' }
}));

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1';
}

function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    next();
}

function requireEditor(req, res, next) {
    const allowed = ['مسؤول', 'محرر'];
    if (!req.session.userId || !allowed.includes(req.session.userRole)) return res.status(403).json({ error: 'غير مصرح' });
    next();
}

// ==================== تسجيل الدخول ====================
app.post('/api/login', (req, res) => {
    const { name, pass, location } = req.body;
    console.log(`📝 محاولة دخول: ${name}`);
    
    const user = users.find(u => u.name === name && u.pass === pass);
    
    if (!user || !user.enabled) {
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    req.session.regenerate(() => {
        req.session.userId = user.id;
        req.session.userName = user.name;
        req.session.userRole = user.role;
        
        let lat = 36.8065, lon = 10.1815;
        if (location?.lat && typeof location.lat === 'number') lat = location.lat;
        if (location?.lon && typeof location.lon === 'number') lon = location.lon;
        
        userSessions.unshift({
            id: Date.now(),
            username: user.name,
            role: user.role,
            ip: getClientIp(req),
            lat, lon,
            city: location?.city || 'تونس',
            country: location?.country || 'تونس',
            loginTime: new Date().toISOString()
        });
        
        console.log(`✅ دخول ناجح: ${user.name} (${user.role})`);
        res.json({ success: true, name: user.name, role: user.role, location: { lat, lon } });
    });
});

app.post('/api/logout', requireAuth, (req, res) => {
    req.session.destroy(() => { res.clearCookie('connect.sid'); res.json({ success: true }); });
});

// ==================== المراكب ====================
app.get('/api/vessels', requireAuth, (req, res) => {
    res.json(vessels);
});

app.post('/api/vessels', requireEditor, (req, res) => {
    vessels.push({ id: nextId++, ...req.body });
    res.json({ success: true });
});

app.put('/api/vessels/:id', requireEditor, (req, res) => {
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    if (index !== -1) {
        vessels[index] = { ...vessels[index], ...req.body };
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'المركب غير موجود' });
    }
});

app.delete('/api/vessels/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    vessels = vessels.filter(v => v.id !== id);
    res.json({ success: true });
});

// ==================== جلسات المستخدمين ====================
app.get('/api/sessions', requireAuth, (req, res) => {
    res.json(userSessions.filter(s => s.username === req.session.userName));
});

app.get('/api/sessions/map', requireAdmin, (req, res) => {
    res.json(userSessions);
});

// ==================== التذاكر (تم إصلاح المسارات) ====================
app.get('/api/tickets', requireAuth, (req, res) => {
    res.json(tickets);
});

app.post('/api/tickets', requireAuth, (req, res) => {
    const newTicket = {
        id: Date.now(),
        userName: req.session.userName,
        userRole: req.session.userRole,
        subject: req.body.subject,
        message: req.body.message,
        date: new Date().toLocaleDateString('ar-TN'),
        time: new Date().toLocaleTimeString('ar-TN'),
        status: 'قيد المعالجة',
        replies: []
    };
    tickets.unshift(newTicket);
    res.json({ success: true, ticket: newTicket });
});

app.put('/api/tickets/:id/reply', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const ticket = tickets.find(t => t.id === id);
    if (!ticket) {
        return res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
    if (!ticket.replies) ticket.replies = [];
    ticket.replies.push({
        adminName: req.session.userName,
        reply: req.body.reply,
        date: new Date().toLocaleDateString('ar-TN'),
        time: new Date().toLocaleTimeString('ar-TN')
    });
    ticket.status = 'تم الرد';
    res.json({ success: true });
});

app.put('/api/tickets/:id/close', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const ticket = tickets.find(t => t.id === id);
    if (!ticket) {
        return res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
    ticket.status = 'مغلقة';
    res.json({ success: true });
});

// ==================== المستخدمين ====================
app.get('/api/users', requireAdmin, (req, res) => {
    res.json(users.map(u => ({ id: u.id, name: u.name, role: u.role, enabled: u.enabled })));
});

app.post('/api/users', requireAdmin, (req, res) => {
    const { name, pass, role, enabled } = req.body;
    if (users.find(u => u.name === name)) {
        return res.status(400).json({ error: 'الاسم موجود' });
    }
    users.push({ id: nextId++, name, pass, role: role || 'مشاهد', enabled: enabled !== false });
    res.json({ success: true });
});

app.put('/api/users/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return res.status(404).json({ error: 'غير موجود' });
    if (users[index].isMainAdmin && req.body.name && req.body.name !== 'admin') {
        return res.status(403).json({ error: 'لا يمكن تغيير اسم المسؤول الرئيسي' });
    }
    users[index] = { ...users[index], ...req.body };
    res.json({ success: true });
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return res.status(404).json({ error: 'غير موجود' });
    if (users[index].isMainAdmin) return res.status(403).json({ error: 'لا يمكن حذف المسؤول الرئيسي' });
    if (req.session.userId === id) return res.status(403).json({ error: 'لا يمكن حذف حسابك الحالي' });
    users.splice(index, 1);
    res.json({ success: true });
});

// ==================== سجل النشاطات ====================
app.get('/api/logs', requireAdmin, (req, res) => {
    res.json(userSessions);
});

app.post('/api/logs', requireAuth, (req, res) => {
    res.json({ success: true });
});

// ==================== تصدير واستيراد ====================
app.get('/api/export-all', requireAdmin, (req, res) => {
    res.json({ vessels, users: users.map(u => ({ id: u.id, name: u.name, role: u.role, enabled: u.enabled })), tickets, sessions: userSessions });
});

app.post('/api/import-all', requireAdmin, (req, res) => {
    if (req.body.vessels && Array.isArray(req.body.vessels)) vessels = req.body.vessels;
    if (req.body.tickets && Array.isArray(req.body.tickets)) tickets = req.body.tickets;
    res.json({ success: true });
});

app.get('/api/test', (req, res) => res.json({ status: 'OK' }));

// معالج الأخطاء
app.use((err, req, res, next) => {
    console.error('❌ خطأ:', err.message);
    res.status(500).json({ error: 'خطأ داخلي في السيرفر' });
});

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║     🚀 السيرفر يعمل بنجاح! 🚀                              ║
╚════════════════════════════════════════════════════════════╝

📡 http://localhost:${PORT}

🔐 بيانات الدخول:
   👑 admin / 1234 (مسؤول)
   ✏️ editor / 1234 (محرر)
   👁️ viewer / 1234 (مشاهد)

📊 إحصائيات المراكب: ${vessels.length} مركب
✅ النظام جاهز للاستخدام!
`);
});
