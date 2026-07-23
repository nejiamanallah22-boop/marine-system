const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// ✅ حل مشكلة CSS
// ============================================================
app.use((req, res, next) => {
    const url = req.url;
    if (url.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
    } else if (url.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
    } else if (url.endsWith('.json')) {
        res.setHeader('Content-Type', 'application/json');
    } else if (url.endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
    } else if (url.endsWith('.jpg') || url.endsWith('.jpeg')) {
        res.setHeader('Content-Type', 'image/jpeg');
    } else if (url.endsWith('.svg')) {
        res.setHeader('Content-Type', 'image/svg+xml');
    } else if (url.endsWith('.ico')) {
        res.setHeader('Content-Type', 'image/x-icon');
    }
    next();
});

// ============================================================
// ✅ Middlewares
// ============================================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// ✅ خدمة الملفات الثابتة
// ============================================================
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// ============================================================
// ✅ البيانات
// ============================================================
let vessels = [];
let tickets = [];
let notes = [];
let users = [
    { _id: '1', name: 'Admin', email: 'admin', role: 'مسؤول', isActive: true }
];
let locations = [];
let logs = [];

// ============================================================
// ✅ دوال مساعدة
// ============================================================
function getCurrentDate() {
    return new Date().toISOString().split('T')[0];
}

function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

function determineCategory(len) {
    const n = parseFloat(len);
    if (isNaN(n)) return 'زوارق مزدوجة';
    if (n === 11) return 'البروق';
    if (n >= 8 && n <= 12) return 'صقور';
    if (n > 12 && n <= 25) return 'خوافر';
    if (n > 30) return 'طوافات';
    return 'زوارق مزدوجة';
}

// ============================================================
// ✅ API Routes
// ============================================================

// --- Login ---
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    if (email === 'admin' && password === '123456') {
        res.json({
            success: true,
            token: 'fake-jwt-token-123456',
            user: {
                id: '1',
                name: 'Admin',
                email: 'admin',
                role: 'مسؤول'
            }
        });
    } else {
        res.status(401).json({
            success: false,
            error: 'بيانات غير صحيحة'
        });
    }
});

// --- Me ---
app.get('/api/auth/me', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token === 'fake-jwt-token-123456') {
        res.json({
            success: true,
            user: {
                id: '1',
                name: 'Admin',
                email: 'admin',
                role: 'مسؤول'
            }
        });
    } else {
        res.status(401).json({ success: false, error: 'غير مصرح' });
    }
});

// --- Vessels ---
app.get('/api/vessels', (req, res) => {
    res.json(vessels);
});

app.post('/api/vessels', (req, res) => {
    try {
        const data = req.body;
        const newVessel = {
            _id: Date.now().toString(),
            name: data.name || 'مركب جديد',
            num: data.num || '',
            len: parseFloat(data.len) || 0,
            cat: determineCategory(data.len),
            reg: data.reg || '',
            zone: data.zone || '',
            port: data.port || '',
            supp: data.supp || '',
            stat: data.stat || 'صالح',
            break: data.break || '',
            fDate: data.fDate || '',
            eDate: data.eDate || '',
            ref: data.ref || '',
            createdAt: new Date().toISOString()
        };
        vessels.push(newVessel);
        res.status(201).json({ success: true, data: newVessel });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.put('/api/vessels/:id', (req, res) => {
    const index = vessels.findIndex(v => v._id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'المركب غير موجود' });
    }
    const data = req.body;
    vessels[index] = {
        ...vessels[index],
        name: data.name || vessels[index].name,
        num: data.num || vessels[index].num,
        len: parseFloat(data.len) || vessels[index].len,
        cat: determineCategory(data.len) || vessels[index].cat,
        reg: data.reg || vessels[index].reg,
        zone: data.zone || vessels[index].zone,
        port: data.port || vessels[index].port,
        supp: data.supp || vessels[index].supp,
        stat: data.stat || vessels[index].stat,
        break: data.break || vessels[index].break,
        fDate: data.fDate || vessels[index].fDate,
        eDate: data.eDate || vessels[index].eDate,
        ref: data.ref || vessels[index].ref
    };
    res.json({ success: true, data: vessels[index] });
});

app.delete('/api/vessels/:id', (req, res) => {
    const index = vessels.findIndex(v => v._id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'المركب غير موجود' });
    }
    vessels.splice(index, 1);
    res.json({ success: true, message: 'تم الحذف' });
});

// --- Tickets ---
app.get('/api/tickets', (req, res) => {
    res.json(tickets);
});

app.post('/api/tickets', (req, res) => {
    const data = req.body;
    const newTicket = {
        _id: Date.now().toString(),
        subject: data.subject || 'موضوع جديد',
        message: data.message || '',
        status: 'قيد المعالجة',
        userName: 'Admin',
        date: getCurrentDate(),
        time: getCurrentTime(),
        replies: []
    };
    tickets.push(newTicket);
    res.status(201).json({ success: true, data: newTicket });
});

app.put('/api/tickets/:id/reply', (req, res) => {
    const ticket = tickets.find(t => t._id === req.params.id);
    if (!ticket) {
        return res.status(404).json({ success: false, error: 'التذكرة غير موجودة' });
    }
    ticket.replies.push({
        adminName: 'Admin',
        reply: req.body.reply,
        date: getCurrentDate(),
        time: getCurrentTime()
    });
    ticket.status = 'تم الرد';
    res.json({ success: true, data: ticket });
});

app.put('/api/tickets/:id/close', (req, res) => {
    const ticket = tickets.find(t => t._id === req.params.id);
    if (!ticket) {
        return res.status(404).json({ success: false, error: 'التذكرة غير موجودة' });
    }
    ticket.status = 'مغلقة';
    res.json({ success: true, data: ticket });
});

// --- Notes ---
app.get('/api/notes', (req, res) => {
    res.json(notes);
});

app.post('/api/notes', (req, res) => {
    const data = req.body;
    const newNote = {
        _id: Date.now().toString(),
        title: data.title || 'مذكرة جديدة',
        content: data.content || '',
        date: data.date || getCurrentDate(),
        time: getCurrentTime(),
        week: '1',
        createdBy: 'Admin'
    };
    notes.push(newNote);
    res.status(201).json({ success: true, data: newNote });
});

app.delete('/api/notes/:id', (req, res) => {
    const index = notes.findIndex(n => n._id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'المذكرة غير موجودة' });
    }
    notes.splice(index, 1);
    res.json({ success: true, message: 'تم الحذف' });
});

app.get('/api/notes/latest', (req, res) => {
    const latest = notes.length > 0 ? notes[notes.length - 1] : null;
    res.json(latest);
});

// --- Users ---
app.get('/api/users', (req, res) => {
    res.json(users);
});

app.post('/api/users', (req, res) => {
    const data = req.body;
    const newUser = {
        _id: Date.now().toString(),
        name: data.name || 'مستخدم جديد',
        email: data.email || 'user@test.com',
        role: data.role || 'مستخدم',
        isActive: true
    };
    users.push(newUser);
    res.status(201).json({ success: true, data: newUser });
});

app.put('/api/users/:id', (req, res) => {
    const user = users.find(u => u._id === req.params.id);
    if (!user) {
        return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }
    Object.assign(user, req.body);
    res.json({ success: true, data: user });
});

app.delete('/api/users/:id', (req, res) => {
    const index = users.findIndex(u => u._id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }
    users.splice(index, 1);
    res.json({ success: true, message: 'تم الحذف' });
});

// --- Locations ---
app.get('/api/locations', (req, res) => {
    res.json(locations);
});

app.post('/api/locations', (req, res) => {
    const { lat, lng } = req.body;
    const newLocation = {
        _id: Date.now().toString(),
        userName: 'Admin',
        lat: parseFloat(lat) || 0,
        lng: parseFloat(lng) || 0,
        timestamp: new Date()
    };
    locations.push(newLocation);
    res.status(201).json({ success: true, data: newLocation });
});

// --- Logs ---
app.get('/api/logs', (req, res) => {
    res.json(logs);
});

app.post('/api/logs', (req, res) => {
    const data = req.body;
    const newLog = {
        _id: Date.now().toString(),
        userName: 'Admin',
        action: data.action || 'إجراء',
        details: data.details || '',
        date: getCurrentDate(),
        time: getCurrentTime()
    };
    logs.push(newLog);
    res.status(201).json({ success: true, data: newLog });
});

// --- Export/Import ---
app.get('/api/export-all', (req, res) => {
    res.json({
        vessels,
        users,
        tickets,
        logs,
        locations,
        notes
    });
});

app.post('/api/import-all', (req, res) => {
    const { vessels: v, users: u, tickets: t, logs: l, locations: loc, notes: n } = req.body;
    if (v) vessels = v;
    if (u) users = u;
    if (t) tickets = t;
    if (l) logs = l;
    if (loc) locations = loc;
    if (n) notes = n;
    res.json({ success: true, message: '✅ تم استيراد البيانات بنجاح' });
});

// --- Health ---
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Home ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// 🚀 تشغيل السيرفر
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log('========================================');
    console.log('📧 admin');
    console.log('🔑 123456');
    console.log('========================================');
});
