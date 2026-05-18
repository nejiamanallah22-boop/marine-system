const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = 3000;

// ==================== المستخدمين ====================
const users = [
    { id: 1, username: 'admin', password: '1234', role: 'admin' }
];

// ==================== المراكب (فيها معطوبة وصيانة) ====================
let vessels = [
    { 
        id: 1, 
        name: 'خافرة معطوبة', 
        num: 'K001', 
        len: 20, 
        reg: 'الوسط', 
        zone: 'صفاقس', 
        port: 'صفاقس',
        supp: '',
        stat: 'معطب', 
        break: 'محرك محترق - يحتاج تبديل', 
        fDate: '2024-05-01', 
        eDate: '2024-06-15', 
        ref: 'REF001', 
        cat: 'خوافر' 
    },
    { 
        id: 2, 
        name: 'زورق صيانة', 
        num: 'Z002', 
        len: 15, 
        reg: 'الجنوب', 
        zone: 'جربة', 
        port: 'جربة',
        supp: '',
        stat: 'صيانة', 
        break: 'عطل في نظام الملاحة', 
        fDate: '2024-05-10', 
        eDate: '2024-05-30', 
        ref: 'REF002', 
        cat: 'زوارق مزدوجة' 
    },
    { 
        id: 3, 
        name: 'البروق 1', 
        num: 'B003', 
        len: 11, 
        reg: 'الشمال', 
        zone: 'تونس', 
        port: 'تونس',
        supp: '',
        stat: 'صالح', 
        break: '', 
        fDate: '', 
        eDate: '', 
        ref: '', 
        cat: 'البروق' 
    },
    { 
        id: 4, 
        name: 'صقر الشمال', 
        num: 'S004', 
        len: 10, 
        reg: 'الشمال', 
        zone: 'بنزرت', 
        port: 'بنزرت',
        supp: '',
        stat: 'صالح', 
        break: '', 
        fDate: '', 
        eDate: '', 
        ref: '', 
        cat: 'صقور' 
    }
];

// ==================== التذاكر ====================
let tickets = [];

// ==================== سجل النشاطات ====================
let logs = [];

let nextId = 5;

// ==================== Middleware ====================
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'my_secret_key_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ==================== دوال مساعدة ====================
function isAuthenticated(req) {
    return req.session && req.session.userId;
}

function isAdmin(req) {
    return req.session && req.session.userRole === 'admin';
}

// ==================== مسارات المصادقة ====================
app.post('/api/login', (req, res) => {
    const { name, pass } = req.body;
    console.log('📝 محاولة دخول:', name);
    
    const user = users.find(u => u.username === name && u.password === pass);
    
    if (user) {
        req.session.userId = user.id;
        req.session.userName = user.username;
        req.session.userRole = user.role;
        console.log('✅ دخول ناجح:', name);
        res.json({ name: user.username, role: user.role });
    } else {
        console.log('❌ دخول فاشل:', name);
        res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/check-session', (req, res) => {
    if (isAuthenticated(req)) {
        res.json({ loggedIn: true, user: { name: req.session.userName, role: req.session.userRole } });
    } else {
        res.json({ loggedIn: false });
    }
});

// ==================== مسارات المراكب ====================
app.get('/api/vessels', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    console.log('📋 جاري إرسال المراكب:', vessels.length);
    res.json(vessels);
});

app.post('/api/vessels', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    
    const newVessel = {
        id: nextId++,
        ...req.body,
        cat: getCategory(req.body.len)
    };
    
    vessels.push(newVessel);
    console.log('➕ تم إضافة مركب:', newVessel.name);
    res.json({ success: true, message: 'تم حفظ المركب بنجاح', vessel: newVessel });
});

app.put('/api/vessels/:id', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    
    if (index !== -1) {
        vessels[index] = { ...vessels[index], ...req.body };
        console.log('✏️ تم تعديل مركب:', vessels[index].name);
        res.json({ success: true, message: 'تم التعديل بنجاح' });
    } else {
        res.status(404).json({ error: 'المركب غير موجود' });
    }
});

app.delete('/api/vessels/:id', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    
    const id = parseInt(req.params.id);
    const vessel = vessels.find(v => v.id === id);
    vessels = vessels.filter(v => v.id !== id);
    console.log('🗑️ تم حذف مركب:', vessel?.name);
    res.json({ success: true });
});

// ==================== مسارات المستخدمين ====================
app.get('/api/users', (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    res.json(users.map(u => ({ id: u.id, name: u.username, role: u.role, enabled: true })));
});

app.post('/api/users', (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    res.json({ success: true });
});

app.put('/api/users/:id', (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    res.json({ success: true });
});

app.delete('/api/users/:id', (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    res.json({ success: true });
});

// ==================== مسارات التذاكر ====================
app.get('/api/tickets', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    res.json(tickets);
});

app.post('/api/tickets', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    
    const newTicket = {
        id: Date.now(),
        ...req.body,
        replies: [],
        status: 'قيد المعالجة'
    };
    
    tickets.unshift(newTicket);
    console.log('📧 تم إرسال تذكرة جديدة:', newTicket.subject);
    res.json({ success: true, ticket: newTicket });
});

app.put('/api/tickets/:id/reply', (req, res) => {
    if (!isAdmin(req)) {
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
    
    console.log('💬 تم الرد على تذكرة:', ticket.subject);
    res.json({ success: true, message: 'تم الرد بنجاح' });
});

app.put('/api/tickets/:id/close', (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ error: 'غير مصرح - فقط للمسؤول' });
    }
    
    const id = parseInt(req.params.id);
    const ticket = tickets.find(t => t.id === id);
    
    if (!ticket) {
        return res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
    
    ticket.status = 'مغلقة';
    console.log('🔒 تم إغلاق تذكرة:', ticket.subject);
    res.json({ success: true });
});

// ==================== مسارات سجل النشاطات ====================
app.get('/api/logs', (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    res.json(logs);
});

app.post('/api/logs', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    
    const log = {
        id: Date.now(),
        ...req.body,
        timestamp: new Date().toISOString()
    };
    
    logs.unshift(log);
    if (logs.length > 500) logs = logs.slice(0, 500);
    res.json({ success: true });
});

// ==================== تصدير واستيراد ====================
app.get('/api/export-all', (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    res.json({ vessels, tickets, logs });
});

app.post('/api/import-all', (req, res) => {
    if (!isAdmin(req)) {
        return res.status(403).json({ error: 'غير مصرح' });
    }
    
    const { vessels: newVessels, tickets: newTickets, logs: newLogs } = req.body;
    if (newVessels) vessels = newVessels;
    if (newTickets) tickets = newTickets;
    if (newLogs) logs = newLogs;
    
    console.log('📥 تم استيراد البيانات');
    res.json({ success: true });
});

// ==================== دوال مساعدة ====================
function getCategory(len) {
    const length = parseFloat(len);
    if (length === 11) return 'البروق';
    if (length >= 8 && length <= 12) return 'صقور';
    if (length > 12 && length <= 25) return 'خوافر';
    if (length >= 30) return 'طوافات';
    return 'زوارق مزدوجة';
}

// ==================== تشغيل السيرفر ====================
app.listen(PORT, () => {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║     🚀 السيرفر يعمل بنجاح! 🚀                 ║');
    console.log('╚════════════════════════════════════════════════╝\n');
    console.log(`📡 الرابط: http://localhost:${PORT}`);
    console.log('\n🔐 بيانات الدخول:');
    console.log('   ┌─────────────────────────────┐');
    console.log('   │  👑 admin  │  كلمة السر: 1234  │');
    console.log('   └─────────────────────────────┘\n');
    console.log('📊 إحصائيات:');
    console.log(`   🚢 إجمالي المراكب: ${vessels.length}`);
    console.log(`   🛠️ مراكب معطوبة: ${vessels.filter(v => v.stat === 'معطب').length}`);
    console.log(`   🔧 مراكب تحت صيانة: ${vessels.filter(v => v.stat === 'صيانة').length}`);
    console.log(`   ✅ مراكب صالحة: ${vessels.filter(v => v.stat === 'صالح').length}`);
    console.log('\n🛠️ قائمة المراكب المعطوبة والتي تحت الصيانة:');
    vessels.filter(v => v.stat === 'معطب' || v.stat === 'صيانة').forEach(v => {
        console.log(`   - ${v.name} (${v.stat}): ${v.break}`);
    });
    console.log('\n✅ النظام جاهز للاستخدام!\n');
});
