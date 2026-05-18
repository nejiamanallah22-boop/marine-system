const express = require('express');
const session = require('express-session');

const app = express();
const PORT = 3000;

// ==================== المستخدمين (مع صلاحيات صحيحة) ====================
const users = [
    { id: 1, username: 'admin', password: '1234', role: 'مسؤول' },
    { id: 2, username: 'editor', password: '1234', role: 'محرر' },
    { id: 3, username: 'viewer', password: '1234', role: 'مشاهد' }
];

// ==================== المراكب (فيها معطوبة وصيانة) ====================
let vessels = [
    { id: 1, name: 'البروق 1', num: 'B001', len: 11, reg: 'الشمال', zone: 'تونس', port: 'تونس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'البروق' },
    { id: 2, name: 'خافرة معطوبة', num: 'K002', len: 20, reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: '', stat: 'معطب', break: 'محرك محترق - يحتاج تبديل', fDate: '2024-05-01', eDate: '2024-06-15', ref: 'REF001', cat: 'خوافر' },
    { id: 3, name: 'زورق صيانة', num: 'Z003', len: 15, reg: 'الجنوب', zone: 'جربة', port: 'جربة', supp: '', stat: 'صيانة', break: 'عطل في نظام الملاحة', fDate: '2024-05-10', eDate: '2024-05-30', ref: 'REF002', cat: 'زوارق مزدوجة' },
    { id: 4, name: 'صقر الشمال', num: 'S004', len: 10, reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'صقور' }
];

let tickets = [];
let logs = [];
let nextId = 5;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'my_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ==================== دوال مساعدة ====================
function isAuthenticated(req) {
    return req.session && req.session.userId;
}

function isAdmin(req) {
    return req.session && req.session.userRole === 'مسؤول';
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
        console.log('✅ دخول ناجح:', name, 'الصلاحية:', user.role);
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
        name: req.body.name,
        num: req.body.num,
        len: req.body.len,
        reg: req.body.reg,
        zone: req.body.zone,
        port: req.body.port,
        supp: req.body.supp || '',
        stat: req.body.stat,
        break: req.body.break || '',
        fDate: req.body.fDate || '',
        eDate: req.body.eDate || '',
        ref: req.body.ref || '',
        cat: req.body.cat || getCategory(req.body.len)
    };
    
    vessels.push(newVessel);
    console.log('➕ تم إضافة مركب:', newVessel.name);
    res.json({ success: true, message: 'تم حفظ المركب بنجاح' });
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
        return res.status(403).json({ error: 'غير مصرح - هذه الصفحة للمسؤول فقط' });
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
    
    const now = new Date();
    const newTicket = {
        id: Date.now(),
        userName: req.body.userName,
        userRole: req.body.userRole,
        subject: req.body.subject,
        message: req.body.message,
        date: `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`,
        time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
        status: 'قيد المعالجة',
        replies: []
    };
    
    tickets.unshift(newTicket);
    console.log('📧 تم إرسال تذكرة جديدة:', newTicket.subject);
    res.json({ success: true });
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
    
    const now = new Date();
    if (!ticket.replies) ticket.replies = [];
    ticket.replies.push({
        adminName: req.session.userName,
        reply: req.body.reply,
        date: `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`,
        time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    });
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
        userName: req.body.userName,
        userRole: req.body.userRole,
        action: req.body.action,
        details: req.body.details,
        date: req.body.date,
        time: req.body.time
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
    
    if (req.body.vessels) vessels = req.body.vessels;
    if (req.body.tickets) tickets = req.body.tickets;
    if (req.body.logs) logs = req.body.logs;
    
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
    console.log('   ┌─────────────────────────────────────┐');
    console.log('   │  👑 admin  │  كلمة السر: 1234  │ مسؤول │');
    console.log('   │  ✏️ editor │  كلمة السر: 1234  │ محرر  │');
    console.log('   │  👁️ viewer │  كلمة السر: 1234  │ مشاهد │');
    console.log('   └─────────────────────────────────────┘\n');
    console.log('📊 إحصائيات المراكب:');
    console.log(`   🚢 الإجمالي: ${vessels.length}`);
    console.log(`   🛠️ معطوبة: ${vessels.filter(v => v.stat === 'معطب').length}`);
    console.log(`   🔧 صيانة: ${vessels.filter(v => v.stat === 'صيانة').length}`);
    console.log(`   ✅ صالحة: ${vessels.filter(v => v.stat === 'صالح').length}`);
    console.log('\n🛠️ سجل الصيانة (مراكب معطوبة/صيانة):');
    vessels.filter(v => v.stat === 'معطب' || v.stat === 'صيانة').forEach(v => {
        console.log(`   - ${v.name} (${v.stat}): ${v.break}`);
    });
    console.log('\n✅ النظام جاهز للاستخدام!\n');
});
