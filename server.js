const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== قاعدة البيانات مع بيانات افتراضية ====================
let users = [
    { id: 1, name: 'admin', pass: '1234', role: 'مسؤول', enabled: true },
    { id: 2, name: 'editor', pass: '1234', role: 'محرر', enabled: true },
    { id: 3, name: 'viewer', pass: '1234', role: 'مشاهد', enabled: true }
];

// ==================== مراكب (مع بيانات معطوبة لسجل الصيانة) ====================
let vessels = [
    { 
        id: 1, 
        name: "البروق الساحل", 
        num: "B001", 
        len: 11, 
        reg: "الساحل", 
        zone: "سوسة", 
        port: "سوسة", 
        supp: "الميناء التجاري", 
        stat: "صالح", 
        break: "", 
        fDate: "", 
        eDate: "", 
        ref: "", 
        cat: "البروق" 
    },
    { 
        id: 2, 
        name: "صقر الشمال", 
        num: "S002", 
        len: 10, 
        reg: "الشمال", 
        zone: "بنزرت", 
        port: "بنزرت", 
        supp: "قاعدة بنزرت", 
        stat: "صالح", 
        break: "", 
        fDate: "", 
        eDate: "", 
        ref: "", 
        cat: "صقور" 
    },
    { 
        id: 3, 
        name: "خافرة معطوبة", 
        num: "K003", 
        len: 20, 
        reg: "الوسط", 
        zone: "صفاقس", 
        port: "صفاقس", 
        supp: "الميناء", 
        stat: "معطب", 
        break: "محرك محترق - يحتاج تبديل كامل", 
        fDate: "2024-05-01", 
        eDate: "2024-06-15", 
        ref: "REF/2024/001", 
        cat: "خوافر" 
    },
    { 
        id: 4, 
        name: "زورق صيانة", 
        num: "Z004", 
        len: 15, 
        reg: "الجنوب", 
        zone: "جربة", 
        port: "جربة", 
        supp: "ميناء جربة", 
        stat: "صيانة", 
        break: "عطل في نظام الملاحة البحرية", 
        fDate: "2024-05-10", 
        eDate: "2024-05-30", 
        ref: "REF/2024/002", 
        cat: "زوارق مزدوجة" 
    },
    { 
        id: 5, 
        name: "طوافة الشمال", 
        num: "T005", 
        len: 35, 
        reg: "الشمال", 
        zone: "طبرقة", 
        port: "طبرقة", 
        supp: "الميناء", 
        stat: "صالح", 
        break: "", 
        fDate: "", 
        eDate: "", 
        ref: "", 
        cat: "طوافات" 
    },
    { 
        id: 6, 
        name: "البروق المعطب", 
        num: "B006", 
        len: 11, 
        reg: "الساحل", 
        zone: "المنستير", 
        port: "المنستير", 
        supp: "قاعدة المنستير", 
        stat: "معطب", 
        break: "انهيار في المحرك - عطل ميكانيكي", 
        fDate: "2024-05-15", 
        eDate: "2024-06-20", 
        ref: "REF/2024/003", 
        cat: "البروق" 
    },
    { 
        id: 7, 
        name: "صقر الصيانة", 
        num: "S007", 
        len: 10, 
        reg: "الوسط", 
        zone: "المهدية", 
        port: "المهدية", 
        supp: "الميناء", 
        stat: "صيانة", 
        break: "صيانة دورية للمحركات", 
        fDate: "2024-05-20", 
        eDate: "2024-06-05", 
        ref: "REF/2024/004", 
        cat: "صقور" 
    }
];

// ==================== سجل النشاطات ====================
let logs = [];

// ==================== تذاكر الدعم (مع بيانات تجريبية) ====================
let tickets = [
    {
        id: 1,
        userName: "admin",
        userRole: "مسؤول",
        subject: "تذكرة تجريبية للاختبار",
        message: "هذه تذكرة تجريبية للتأكد من عمل نظام الرد بشكل صحيح",
        date: "18/05/2024",
        time: "14:30",
        status: "قيد المعالجة",
        replies: []
    }
];

let nextId = 8;

// ==================== Middleware ====================
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'secret_key_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ==================== Routes ====================

// تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { name, pass } = req.body;
    const user = users.find(u => u.name === name);
    
    if (!user) return res.status(401).json({ error: 'اسم المستخدم غير صحيح' });
    if (!user.enabled) return res.status(401).json({ error: 'هذا المستخدم معطل' });
    if (user.pass !== pass) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
    
    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userRole = user.role;
    
    res.json({ name: user.name, role: user.role, id: user.id });
});

// تسجيل الخروج
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// التحقق من الجلسة
app.get('/api/check-session', (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true, user: { name: req.session.userName, role: req.session.userRole } });
    } else {
        res.json({ loggedIn: false });
    }
});

// مصادقة للمسارات المحمية
function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    next();
}

// ==================== مسارات المراكب ====================
app.get('/api/vessels', requireAuth, (req, res) => {
    res.json(vessels);
});

app.post('/api/vessels', requireAuth, (req, res) => {
    try {
        const newVessel = { id: nextId++, ...req.body };
        vessels.push(newVessel);
        res.status(201).json({ success: true, message: 'تم حفظ المركب بنجاح', vessel: newVessel });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put('/api/vessels/:id', requireAuth, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const index = vessels.findIndex(v => v.id === id);
        if (index !== -1) {
            vessels[index] = { ...vessels[index], ...req.body };
            res.json({ success: true, vessel: vessels[index] });
        } else {
            res.status(404).json({ error: 'المركب غير موجود' });
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/vessels/:id', requireAuth, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        vessels = vessels.filter(v => v.id !== id);
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ==================== مسارات المستخدمين ====================
app.get('/api/users', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    const usersWithoutPass = users.map(u => ({ id: u.id, name: u.name, role: u.role, enabled: u.enabled }));
    res.json(usersWithoutPass);
});

app.post('/api/users', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    try {
        const { name, pass, role, enabled } = req.body;
        const newUser = { id: nextId++, name, pass, role, enabled };
        users.push(newUser);
        res.status(201).json({ success: true, user: { id: newUser.id, name: newUser.name, role: newUser.role, enabled: newUser.enabled } });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put('/api/users/:id', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    try {
        const id = parseInt(req.params.id);
        const index = users.findIndex(u => u.id === id);
        if (index !== -1) {
            users[index] = { ...users[index], ...req.body };
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'المستخدم غير موجود' });
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/users/:id', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    try {
        const id = parseInt(req.params.id);
        users = users.filter(u => u.id !== id);
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ==================== مسارات سجل النشاطات ====================
app.get('/api/logs', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    res.json(logs);
});

app.post('/api/logs', requireAuth, (req, res) => {
    try {
        const log = { id: Date.now(), ...req.body };
        logs.unshift(log);
        if (logs.length > 500) logs = logs.slice(0, 500);
        res.status(201).json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ==================== مسارات التذاكر ====================
app.get('/api/tickets', requireAuth, (req, res) => {
    res.json(tickets);
});

app.post('/api/tickets', requireAuth, (req, res) => {
    try {
        const newTicket = { id: Date.now(), ...req.body, replies: [] };
        tickets.unshift(newTicket);
        res.status(201).json({ success: true, ticket: newTicket });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// الرد على التذكرة
app.put('/api/tickets/:id/reply', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح - فقط للمسؤول' });
    }
    try {
        const id = parseInt(req.params.id);
        const ticket = tickets.find(t => t.id === id);
        
        if (!ticket) {
            return res.status(404).json({ error: 'التذكرة غير موجودة' });
        }
        
        if (!ticket.replies) ticket.replies = [];
        ticket.replies.push(req.body.reply);
        ticket.status = 'تم الرد';
        
        res.json({ success: true, message: 'تم الرد بنجاح', ticket: ticket });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// إغلاق التذكرة
app.put('/api/tickets/:id/close', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') {
        return res.status(403).json({ error: 'غير مصرح - فقط للمسؤول' });
    }
    try {
        const id = parseInt(req.params.id);
        const ticket = tickets.find(t => t.id === id);
        
        if (!ticket) {
            return res.status(404).json({ error: 'التذكرة غير موجودة' });
        }
        
        ticket.status = 'مغلقة';
        res.json({ success: true, ticket: ticket });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ==================== تصدير واستيراد ====================
app.get('/api/export-all', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    res.json({ 
        vessels, 
        users: users.map(u => ({ id: u.id, name: u.name, role: u.role, enabled: u.enabled })), 
        logs, 
        tickets 
    });
});

app.post('/api/import-all', requireAuth, (req, res) => {
    if (req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    try {
        const { vessels: newVessels, tickets: newTickets, logs: newLogs } = req.body;
        if (newVessels && Array.isArray(newVessels)) vessels = newVessels;
        if (newTickets && Array.isArray(newTickets)) tickets = newTickets;
        if (newLogs && Array.isArray(newLogs)) logs = newLogs;
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ==================== تشغيل السيرفر ====================
app.listen(PORT, () => {
    console.log(`\n🚀 ======================================`);
    console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`);
    console.log(`🚀 ======================================\n`);
    console.log(`🔐 بيانات الدخول:`);
    console.log(`   👑 admin / 1234 (مسؤول كامل الصلاحيات)`);
    console.log(`   ✏️ editor / 1234 (محرر)`);
    console.log(`   👁️ viewer / 1234 (مشاهد فقط)`);
    console.log(`\n📊 عدد المراكب: ${vessels.length}`);
    console.log(`🛠️  مراكب معطوبة/صيانة: ${vessels.filter(v => v.stat === 'معطب' || v.stat === 'صيانة').length}`);
    console.log(`\n📋 المراكب المعطوبة والتي تحت الصيانة:`);
    vessels.filter(v => v.stat === 'معطب' || v.stat === 'صيانة').forEach(v => {
        console.log(`   - ${v.name} (${v.stat}): ${v.break}`);
    });
    console.log(`\n🎫 عدد التذاكر: ${tickets.length}`);
    console.log(`\n========================================\n`);
});
