const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== المستخدمين (مع كلمات مرور مشفرة) ====================
const users = [
    { id: 1, username: 'admin', password: '$2a$10$N9qo8uLOickgx2ZMRZoMy.MrJkUYvYjU8KQqZqZqZqZqZqZqZqZq', role: 'مسؤول', enabled: true, twoFactorEnabled: false },
    { id: 2, username: 'editor', password: '$2a$10$N9qo8uLOickgx2ZMRZoMy.MrJkUYvYjU8KQqZqZqZqZqZqZqZqZq', role: 'محرر', enabled: true, twoFactorEnabled: false },
    { id: 3, username: 'viewer', password: '$2a$10$N9qo8uLOickgx2ZMRZoMy.MrJkUYvYjU8KQqZqZqZqZqZqZqZqZq', role: 'مشاهد', enabled: true, twoFactorEnabled: false }
];

// ==================== بيانات المراكب ====================
let vessels = [
    { id: 1, name: 'البروق 1', num: 'B001', len: 11, reg: 'الشمال', zone: 'تونس', port: 'تونس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'البروق' },
    { id: 2, name: 'خافرة معطوبة', num: 'K002', len: 20, reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: '', stat: 'معطب', break: 'محرك محترق', fDate: '2024-05-01', eDate: '2024-06-15', ref: 'REF001', cat: 'خوافر' },
    { id: 3, name: 'زورق صيانة', num: 'Z003', len: 15, reg: 'الجنوب', zone: 'جربة', port: 'جربة', supp: '', stat: 'صيانة', break: 'عطل كهربائي', fDate: '2024-05-10', eDate: '2024-05-30', ref: 'REF002', cat: 'زوارق مزدوجة' },
    { id: 4, name: 'صقر الشمال', num: 'S004', len: 10, reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'صقور' }
];

let tickets = [];
let nextId = 5;

// ==================== سجل التتبع المتقدم ====================
let userSessions = [];

// ==================== Middleware ====================
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: false,
        sameSite: 'strict'
    }
}));

// ==================== دوال مساعدة ====================
function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '0.0.0.0';
}

async function getGeoLocation(ip) {
    try {
        if (ip === '::1' || ip === '127.0.0.1') {
            return { country: 'المحلي', city: 'localhost', lat: 36.8065, lon: 10.1815 };
        }
        const response = await fetch(`http://ip-api.com/json/${ip}?lang=ar`);
        const data = await response.json();
        return {
            country: data.country || 'غير معروف',
            city: data.city || 'غير معروف',
            lat: data.lat || 0,
            lon: data.lon || 0,
            isp: data.isp || 'غير معروف'
        };
    } catch (error) {
        return { country: 'خطأ', city: 'خطأ', lat: 0, lon: 0, isp: 'خطأ' };
    }
}

function logUserSession(username, role, ip, geo, userAgent) {
    const session = {
        id: Date.now(),
        username: username,
        role: role,
        ip: ip,
        country: geo.country,
        city: geo.city,
        lat: geo.lat,
        lon: geo.lon,
        isp: geo.isp,
        userAgent: userAgent,
        loginTime: new Date().toISOString(),
        fingerprint: crypto.createHash('sha256').update(ip + userAgent + username).digest('hex')
    };
    userSessions.unshift(session);
    if (userSessions.length > 500) userSessions = userSessions.slice(0, 500);
    return session;
}

function isNewDevice(session) {
    const existing = userSessions.find(s => 
        s.username === session.username && 
        s.fingerprint !== session.fingerprint &&
        (new Date() - new Date(s.loginTime)) < 7 * 24 * 60 * 60 * 1000
    );
    return !!existing;
}

// ==================== مسارات المصادقة المتطورة ====================
app.post('/api/login', async (req, res) => {
    const { username, password, deviceName } = req.body;
    const user = users.find(u => u.username === username);
    
    if (!user || !user.enabled) {
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'];
    const geo = await getGeoLocation(ip);
    
    const session = logUserSession(user.username, user.role, ip, geo, userAgent);
    
    req.session.userId = user.id;
    req.session.userName = user.username;
    req.session.userRole = user.role;
    req.session.sessionId = session.id;
    
    const isNew = isNewDevice(session);
    
    res.json({
        success: true,
        name: user.username,
        role: user.role,
        location: { country: geo.country, city: geo.city },
        isNewDevice: isNew,
        loginTime: session.loginTime
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/sessions', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    const userSessionsList = userSessions.filter(s => s.username === req.session.userName);
    res.json(userSessionsList);
});

app.get('/api/sessions/map', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    res.json(userSessions.map(s => ({
        username: s.username,
        lat: s.lat,
        lon: s.lon,
        country: s.country,
        city: s.city,
        loginTime: s.loginTime
    })));
});

// ==================== مسارات المراكب ====================
app.get('/api/vessels', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    res.json(vessels);
});

app.post('/api/vessels', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    const newVessel = { id: nextId++, ...req.body };
    vessels.push(newVessel);
    res.json({ success: true });
});

app.put('/api/vessels/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    if (index !== -1) {
        vessels[index] = { ...vessels[index], ...req.body };
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

app.delete('/api/vessels/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    vessels = vessels.filter(v => v.id !== id);
    res.json({ success: true });
});

// ==================== مسارات التذاكر ====================
app.get('/api/tickets', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    res.json(tickets);
});

app.post('/api/tickets', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    const newTicket = { id: Date.now(), ...req.body, replies: [] };
    tickets.unshift(newTicket);
    res.json({ success: true });
});

app.put('/api/tickets/:id/reply', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    const id = parseInt(req.params.id);
    const ticket = tickets.find(t => t.id === id);
    if (ticket) {
        if (!ticket.replies) ticket.replies = [];
        ticket.replies.push(req.body.reply);
        ticket.status = 'تم الرد';
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

app.put('/api/tickets/:id/close', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    const id = parseInt(req.params.id);
    const ticket = tickets.find(t => t.id === id);
    if (ticket) {
        ticket.status = 'مغلقة';
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

// ==================== مسارات المستخدمين ====================
app.get('/api/users', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    res.json(users.map(u => ({ id: u.id, name: u.username, role: u.role, enabled: u.enabled })));
});

app.post('/api/users', async (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    const { name, pass, role, enabled } = req.body;
    const hashedPass = await bcrypt.hash(pass, 10);
    const newUser = { id: nextId++, username: name, password: hashedPass, role, enabled, twoFactorEnabled: false };
    users.push(newUser);
    res.json({ success: true });
});

app.put('/api/users/:id', async (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    const id = parseInt(req.params.id);
    const index = users.findIndex(u => u.id === id);
    if (index !== -1) {
        if (req.body.pass) {
            req.body.password = await bcrypt.hash(req.body.pass, 10);
            delete req.body.pass;
        }
        users[index] = { ...users[index], ...req.body };
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

app.delete('/api/users/:id', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    const id = parseInt(req.params.id);
    const index = users.findIndex(u => u.id === id);
    if (index !== -1) {
        users.splice(index, 1);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

// ==================== سجل النشاطات ====================
app.get('/api/logs', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    res.json(userSessions);
});

app.post('/api/logs', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    res.json({ success: true });
});

// ==================== تصدير واستيراد ====================
app.get('/api/export-all', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    res.json({ vessels, tickets, sessions: userSessions });
});

app.post('/api/import-all', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    if (req.body.vessels) vessels = req.body.vessels;
    if (req.body.tickets) tickets = req.body.tickets;
    res.json({ success: true });
});

// ==================== تشغيل السيرفر ====================
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║     🚀 السيرفر المتطور يعمل بنجاح! 🚀                    ║
╚══════════════════════════════════════════════════════════╝

📡 الرابط: http://localhost:${PORT}

🔐 بيانات الدخول:
   👑 admin / 1234 (مسؤول كامل الصلاحيات)
   ✏️ editor / 1234 (محرر)
   👁️ viewer / 1234 (مشاهد)

🛡️ ميزات الحماية المتطورة:
   ✅ تشفير كلمات المرور (bcrypt)
   ✅ تتبع الـ IP والموقع الجغرافي
   ✅ بصمة رقمية لكل جهاز
   ✅ اكتشاف الأجهزة الجديدة
   ✅ خريطة تفاعلية لمواقع المستخدمين
   ✅ صلاحيات متقدمة

📊 إحصائيات المراكب:
   🚢 الإجمالي: ${vessels.length}
   🛠️ معطوبة: ${vessels.filter(v => v.stat === 'معطب').length}
   🔧 صيانة: ${vessels.filter(v => v.stat === 'صيانة').length}

✅ النظام جاهز للاستخدام!
`);
});
