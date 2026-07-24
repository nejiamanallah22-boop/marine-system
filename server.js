const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// ✅ حل مشكلة CSS
// ============================================================
app.use((req, res, next) => {
    if (req.url.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
    } else if (req.url.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
    }
    next();
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ خدمة الملفات الثابتة
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
// ✅ البيانات (Mock Data)
// ============================================================
let vessels = [
    { id: 1, name: 'المركب الأول', num: '001', len: 10, cat: 'صقور', reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: 'تونس', stat: 'صالح', break: '-', fDate: '2024-01-01', eDate: '2024-12-31', ref: 'REF001', repairer: '' },
    { id: 2, name: 'المركب الثاني', num: '002', len: 15, cat: 'خوافر', reg: 'الوسط', zone: 'سوسة', port: 'سوسة', supp: 'تونس', stat: 'معطب', break: 'محرك', fDate: '2024-01-15', eDate: '2024-06-30', ref: 'REF002', repairer: 'وحدة الصيانة والإسناد البحري تونس' }
];

let users = [
    { id: 1, name: 'Admin', email: 'admin', role: 'مسؤول', isActive: true },
    { id: 2, name: 'مستخدم', email: 'user', role: 'مشاهد', isActive: true }
];

let tickets = [];
let notes = [];
let locations = [];

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
// ✅ API Routes (بدون مصادقة)
// ============================================================

// --- Login ---
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (email === 'admin' && password === '123456') {
        res.json({
            success: true,
            token: 'fake-token-123',
            user: { id: 1, name: 'Admin', email: 'admin', role: 'مسؤول' }
        });
    } else {
        res.status(401).json({ success: false, error: 'بيانات غير صحيحة' });
    }
});

// --- Me ---
app.get('/api/auth/me', (req, res) => {
    res.json({ success: true, user: { id: 1, name: 'Admin', email: 'admin', role: 'مسؤول' } });
});

// --- Vessels ---
app.get('/api/vessels', (req, res) => {
    res.json(vessels);
});

app.post('/api/vessels', (req, res) => {
    const data = req.body;
    const newVessel = {
        id: Date.now(),
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
        repairer: data.repairer || ''
    };
    vessels.push(newVessel);
    res.status(201).json({ success: true, data: newVessel });
});

app.put('/api/vessels/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'المركب غير موجود' });
    }
    vessels[index] = { ...vessels[index], ...req.body };
    res.json({ success: true, data: vessels[index] });
});

app.delete('/api/vessels/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'المركب غير موجود' });
    }
    vessels.splice(index, 1);
    res.json({ success: true, message: 'تم الحذف' });
});

// --- Users ---
app.get('/api/users', (req, res) => {
    res.json(users);
});

app.post('/api/users', (req, res) => {
    const data = req.body;
    const newUser = {
        id: Date.now(),
        name: data.name || 'مستخدم جديد',
        email: data.email || 'user@test.com',
        role: data.role || 'مشاهد',
        isActive: true
    };
    users.push(newUser);
    res.status(201).json({ success: true, data: newUser });
});

app.put('/api/users/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const user = users.find(u => u.id === id);
    if (!user) {
        return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }
    Object.assign(user, req.body);
    res.json({ success: true, data: user });
});

app.delete('/api/users/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = users.findIndex(u => u.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }
    users.splice(index, 1);
    res.json({ success: true, message: 'تم الحذف' });
});

// --- Tickets ---
app.get('/api/tickets', (req, res) => {
    res.json(tickets);
});

app.post('/api/tickets', (req, res) => {
    const data = req.body;
    const newTicket = {
        id: Date.now(),
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
    const id = parseInt(req.params.id);
    const ticket = tickets.find(t => t.id === id);
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
    const id = parseInt(req.params.id);
    const ticket = tickets.find(t => t.id === id);
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
        id: Date.now(),
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
    const id = parseInt(req.params.id);
    const index = notes.findIndex(n => n.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'المذكرة غير موجودة' });
    }
    notes.splice(index, 1);
    res.json({ success: true, message: 'تم الحذف' });
});

app.get('/api/notes/latest', (req, res) => {
    res.json(notes.length > 0 ? notes[notes.length - 1] : null);
});

// --- Locations ---
app.get('/api/locations', (req, res) => {
    res.json(locations);
});

app.post('/api/locations', (req, res) => {
    const { lat, lng } = req.body;
    const newLocation = {
        id: Date.now(),
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
    res.json([]);
});

app.post('/api/logs', (req, res) => {
    res.status(201).json({ success: true });
});

// --- Export/Import ---
app.get('/api/export-all', (req, res) => {
    res.json({ vessels, users, tickets, notes, locations });
});

app.post('/api/import-all', (req, res) => {
    const { vessels: v, users: u, tickets: t, notes: n, locations: l } = req.body;
    if (v) vessels = v;
    if (u) users = u;
    if (t) tickets = t;
    if (n) notes = n;
    if (l) locations = l;
    res.json({ success: true, message: '✅ تم الاستيراد' });
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
    console.log(`🚀 Server: http://localhost:${PORT}`);
    console.log('📧 admin / 🔑 123456');
});
