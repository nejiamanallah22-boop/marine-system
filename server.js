const express = require('express');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== المستخدمين ====================
const users = [
    { id: 1, username: 'admin', password: '1234', role: 'مسؤول', enabled: true },
    { id: 2, username: 'editor', password: '1234', role: 'محرر', enabled: true },
    { id: 3, username: 'viewer', password: '1234', role: 'مشاهد', enabled: true }
];

// ==================== المراكب (مع وحدات الصيانة والمجمع الأمني) ====================
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
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'marine_fleet_secret_' + Date.now(),
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ==================== دوال مساعدة ====================
function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1';
}

// ==================== مسارات المصادقة ====================
app.post('/api/login', async (req, res) => {
    const { username, password, location } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    
    if (!user || !user.enabled) {
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    const ip = getClientIp(req);
    
    // استخدام الموقع الحقيقي من المتصفح أو موقع افتراضي
    let lat = 36.8065;
    let lon = 10.1815;
    let city = 'تونس';
    let country = 'تونس';
    
    if (location && location.lat && location.lon) {
        lat = location.lat;
        lon = location.lon;
        city = "الموقع الحقيقي";
        country = "المستخدم";
    }
    
    const sessionData = {
        id: Date.now(),
        username: user.username,
        role: user.role,
        ip: ip,
        country: country,
        city: city,
        lat: lat,
        lon: lon,
        loginTime: new Date().toISOString()
    };
    
    userSessions.unshift(sessionData);
    if (userSessions.length > 500) userSessions = userSessions.slice(0, 500);
    
    req.session.userId = user.id;
    req.session.userName = user.username;
    req.session.userRole = user.role;
    
    res.json({
        success: true,
        name: user.username,
        role: user.role,
        location: { lat: lat, lon: lon, city: city, country: country }
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// ==================== مسارات التتبع ====================
app.get('/api/sessions', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    const userSessionsList = userSessions.filter(s => s.username === req.session.userName);
    res.json(userSessionsList);
});

app.get('/api/sessions/map', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    res.json(userSessions);
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
    res.json({ success: true, message: 'تم حفظ المركب بنجاح' });
});

app.put('/api/vessels/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    if (index !== -1) {
        vessels[index] = { ...vessels[index], ...req.body };
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'المركب غير موجود' });
    }
});

app.delete('/api/vessels/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    const id = parseInt(req.params.id);
    vessels = vessels.filter(v => v.id !== id);
    res.json({ success: true });
});

// ==================== مسارات المستخدمين ====================
app.get('/api/users', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    res.json(users.map(u => ({ id: u.id, name: u.username, role: u.role, enabled: u.enabled })));
});

app.post('/api/users', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    const { name, pass, role, enabled } = req.body;
    const newUser = { id: nextId++, username: name, password: pass, role, enabled };
    users.push(newUser);
    res.json({ success: true });
});

app.put('/api/users/:id', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    const id = parseInt(req.params.id);
    const index = users.findIndex(u => u.id === id);
    if (index !== -1) {
        users[index] = { ...users[index], ...req.body };
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'المستخدم غير موجود' });
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
        res.status(404).json({ error: 'المستخدم غير موجود' });
    }
});

// ==================== مسارات التذاكر (تم إصلاح الرد) ====================
app.get('/api/tickets', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    res.json(tickets);
});

app.post('/api/tickets', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    const newTicket = { id: Date.now(), ...req.body, replies: [] };
    tickets.unshift(newTicket);
    res.json({ success: true, ticket: newTicket });
});

app.put('/api/tickets/:id/reply', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح - فقط للمسؤول' });
    }
    const id = parseInt(req.params.id);
    const ticket = tickets.find(t => t.id === id);
    if (!ticket) {
        return res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
    if (!ticket.replies) ticket.replies = [];
    ticket.replies.push(req.body.reply);
    ticket.status = 'تم الرد';
    res.json({ success: true, message: 'تم الرد بنجاح' });
});

app.put('/api/tickets/:id/close', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح - فقط للمسؤول' });
    }
    const id = parseInt(req.params.id);
    const ticket = tickets.find(t => t.id === id);
    if (!ticket) {
        return res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
    ticket.status = 'مغلقة';
    res.json({ success: true });
});

// ==================== مسارات سجل النشاطات ====================
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

// ==================== مسار اختبار ====================
app.get('/api/test', (req, res) => {
    res.json({ status: 'OK', message: 'السيرفر يعمل بشكل صحيح' });
});

// ==================== تشغيل السيرفر ====================
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║     🚀 السيرفر يعمل بنجاح! 🚀                             ║
╚══════════════════════════════════════════════════════════╝

📡 الرابط: http://localhost:${PORT}

🔐 بيانات الدخول: admin / 1234

📊 إحصائيات المراكب:
   🚢 الإجمالي: ${vessels.length}
   🛠️ معطوبة: ${vessels.filter(v => v.stat === 'معطب').length}
   🔧 صيانة: ${vessels.filter(v => v.stat === 'صيانة').length}
   🏢 وحدات صيانة: ${vessels.filter(v => v.cat === 'وحدة صيانة').length}
   🏛️ المجمع الأمني: ${vessels.filter(v => v.cat === 'مركز أمني').length}

🛠️ سجل الصيانة (مراكب معطوبة/صيانة):
${vessels.filter(v => v.stat === 'معطب' || v.stat === 'صيانة').map(v => `   - ${v.name} (${v.stat})`).join('\n')}

✅ النظام جاهز للاستخدام!
`);
});