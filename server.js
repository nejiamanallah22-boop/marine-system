const express = require('express');
const session = require('express-session');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== إعداد البريد الإلكتروني ====================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'negiamanallah22@gmail.com',
        pass: process.env.EMAIL_PASS || 'your-app-password'
    }
});

// ==================== المستخدمين ====================
const users = [
    { id: 1, username: 'admin', password: '1234', role: 'مسؤول', enabled: true, email: 'negiamanallah22@gmail.com' },
    { id: 2, username: 'editor', password: '1234', role: 'محرر', enabled: true, email: 'negiamanallah22@gmail.com' },
    { id: 3, username: 'viewer', password: '1234', role: 'مشاهد', enabled: true, email: 'negiamanallah22@gmail.com' }
];

// ==================== المراكب ====================
let vessels = [
    { id: 1, name: 'البروق 1', num: 'B001', len: 11, reg: 'الشمال', zone: 'تونس', port: 'تونس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'البروق' },
    { id: 2, name: 'خافرة معطوبة', num: 'K002', len: 20, reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: '', stat: 'معطب', break: 'محرك محترق', fDate: '2024-05-01', eDate: '2024-06-15', ref: 'REF001', cat: 'خوافر' },
    { id: 3, name: 'زورق صيانة', num: 'Z003', len: 15, reg: 'الجنوب', zone: 'جربة', port: 'جربة', supp: '', stat: 'صيانة', break: 'عطل كهربائي', fDate: '2024-05-10', eDate: '2024-05-30', ref: 'REF002', cat: 'زوارق مزدوجة' },
    { id: 4, name: 'صقر الشمال', num: 'S004', len: 10, reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'صقور' },
    { id: 5, name: 'وحدة صيانة تونس', num: 'M001', len: 0, reg: 'وحدة الصيانة والإسناد البحري تونس', zone: 'تونس', port: 'تونس', supp: 'المجمع الأمني', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'وحدة صيانة' },
    { id: 6, name: 'وحدة صيانة المنستير', num: 'M002', len: 0, reg: 'وحدة الصيانة والإسناد البحري المنستير', zone: 'المنستير', port: 'المنستير', supp: 'المجمع الأمني', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'وحدة صيانة' },
    { id: 7, name: 'وحدة صيانة صفاقس', num: 'M003', len: 0, reg: 'وحدة الصيانة والإسناد البحري صفاقس', zone: 'صفاقس', port: 'صفاقس', supp: 'المجمع الأمني', stat: 'تحت الصيانة', break: 'تجهيزات', fDate: '2024-05-20', eDate: '2024-06-10', ref: 'REF003', cat: 'وحدة صيانة' },
    { id: 8, name: 'وحدة صيانة جرجيس', num: 'M004', len: 0, reg: 'وحدة الصيانة والإسناد البحري جرجيس', zone: 'جرجيس', port: 'جرجيس', supp: 'المجمع الأمني', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'وحدة صيانة' },
    { id: 9, name: 'المجمع الأمني بقبيبة', num: 'S001', len: 0, reg: 'المجمع الأمني بقبيبة', zone: 'قبيبة', port: 'قبيبة', supp: 'المركز الرئيسي', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'مركز أمني' }
];

let tickets = [];
let userSessions = [];
let nextId = 10;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'marine_fleet_secret_key_' + Date.now(),
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ==================== دوال مساعدة ====================
function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1';
}

async function getGeoLocation(ip) {
    try {
        if (ip === '::1' || ip === '127.0.0.1') {
            return { country: 'تونس', city: 'تونس', lat: 36.8065, lon: 10.1815, isp: 'محلي' };
        }
        const response = await fetch(`http://ip-api.com/json/${ip}?lang=ar`);
        const data = await response.json();
        return {
            country: data.country || 'تونس',
            city: data.city || 'تونس',
            lat: data.lat || 36.8065,
            lon: data.lon || 10.1815,
            isp: data.isp || 'غير معروف'
        };
    } catch (error) {
        return { country: 'تونس', city: 'تونس', lat: 36.8065, lon: 10.1815, isp: 'غير معروف' };
    }
}

async function sendEmailNotification(user, location, ip) {
    const mailOptions = {
        from: 'negiamanallah22@gmail.com',
        to: 'negiamanallah22@gmail.com',
        subject: `🔐 تنبيه: دخول جديد إلى النظام - ${user.username}`,
        html: `
            <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px;">
                <h2 style="color: #2e7d32;">⚓ تنبيه دخول جديد إلى منظومة الوسائل البحرية</h2>
                <hr>
                <p><strong>👤 اسم المستخدم:</strong> ${user.username}</p>
                <p><strong>🔑 الصلاحية:</strong> ${user.role}</p>
                <p><strong>🕐 وقت الدخول:</strong> ${new Date().toLocaleString('ar-TN')}</p>
                <p><strong>📍 الموقع:</strong> ${location.city}, ${location.country}</p>
                <p><strong>🌐 عنوان IP:</strong> ${ip}</p>
                <p><strong>🗺️ الإحداثيات:</strong> ${location.lat}, ${location.lon}</p>
                <hr>
                <p style="color: #666; font-size: 12px;">تم إرسال هذا التنبيه تلقائياً من نظام الوسائل البحرية.</p>
            </div>
        `
    };
    
    try {
        await transporter.sendMail(mailOptions);
        console.log(`📧 تم إرسال إشعار بريد إلكتروني لدخول ${user.username}`);
    } catch (error) {
        console.error('❌ فشل إرسال البريد:', error.message);
    }
}

// ==================== مسارات المصادقة ====================
app.post('/api/login', async (req, res) => {
    const { username, password, location } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    
    if (!user || !user.enabled) {
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    const ip = getClientIp(req);
    let geo = await getGeoLocation(ip);
    
    if (location && location.lat && location.lon) {
        geo = {
            ...geo,
            lat: location.lat,
            lon: location.lon,
            city: "الموقع الحقيقي",
            country: "المستخدم"
        };
    }
    
    const sessionData = {
        id: Date.now(),
        username: user.username,
        role: user.role,
        ip: ip,
        country: geo.country,
        city: geo.city,
        lat: geo.lat,
        lon: geo.lon,
        isp: geo.isp,
        userAgent: req.headers['user-agent'],
        loginTime: new Date().toISOString()
    };
    
    userSessions.unshift(sessionData);
    if (userSessions.length > 500) userSessions = userSessions.slice(0, 500);
    
    req.session.userId = user.id;
    req.session.userName = user.username;
    req.session.userRole = user.role;
    req.session.sessionId = sessionData.id;
    
    await sendEmailNotification(user, geo, ip);
    
    res.json({
        success: true,
        name: user.username,
        role: user.role,
        location: { country: geo.country, city: geo.city, lat: geo.lat, lon: geo.lon }
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

app.get('/api/test', (req, res) => {
    res.json({ status: 'OK', message: 'السيرفر يعمل بشكل صحيح' });
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

📧 الإشعارات:
   ✅ سيتم إرسال إشعار بريد إلكتروني عند كل دخول

📊 إحصائيات المراكب:
   🚢 الإجمالي: ${vessels.length}
   🛠️ معطوبة: ${vessels.filter(v => v.stat === 'معطب').length}
   🔧 صيانة: ${vessels.filter(v => v.stat === 'صيانة').length}
   ✅ صالحة: ${vessels.filter(v => v.stat === 'صالح').length}
   🏢 وحدات صيانة: ${vessels.filter(v => v.cat === 'وحدة صيانة').length}
   🏛️ المجمع الأمني: ${vessels.filter(v => v.cat === 'مركز أمني').length}

✅ النظام جاهز للاستخدام!
`);
});