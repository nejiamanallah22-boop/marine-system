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
    }
    next();
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// ✅ البيانات (Mock Data)
// ============================================================
let vessels = [
    { id: 1, name: 'المركب الأول', num: '001', len: 10, cat: 'صقور', reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: 'تونس', stat: 'صالح', break: '-', fDate: '2024-01-01', eDate: '2024-12-31', ref: 'REF001' },
    { id: 2, name: 'المركب الثاني', num: '002', len: 15, cat: 'خوافر', reg: 'الوسط', zone: 'سوسة', port: 'سوسة', supp: 'تونس', stat: 'معطب', break: 'محرك', fDate: '2024-01-15', eDate: '2024-06-30', ref: 'REF002' }
];

let tickets = [
    { id: 1, subject: 'مشكلة في المحرك', message: 'المحرك لا يعمل', status: 'قيد المعالجة', userName: 'Admin', date: '2024-01-01', time: '10:00' }
];

let notes = [
    { id: 1, title: 'مذكرة مهمة', content: 'هذه مذكرة تجريبية', date: '2024-01-01', time: '10:00', week: '1', createdBy: 'Admin' }
];

let users = [
    { id: 1, name: 'Admin', email: 'admin', role: 'مسؤول', isActive: true }
];

let locations = [];
let logs = [];

// ============================================================
// ✅ API Routes
// ============================================================

// --- Login ---
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (email === 'admin' && password === '123456') {
        res.json({
            success: true,
            token: 'fake-token',
            user: { id: 1, name: 'Admin', email: 'admin', role: 'مسؤول' }
        });
    } else {
        res.status(401).json({ success: false, error: 'بيانات غير صحيحة' });
    }
});

// --- Auth Me ---
app.get('/api/auth/me', (req, res) => {
    res.json({ success: true, user: { id: 1, name: 'Admin', email: 'admin', role: 'مسؤول' } });
});

// --- Vessels ---
app.get('/api/vessels', (req, res) => res.json(vessels));

app.post('/api/vessels', (req, res) => {
    const data = req.body;
    const newVessel = {
        id: Date.now(),
        name: data.name || 'مركب جديد',
        num: data.num || '',
        len: parseFloat(data.len) || 0,
        cat: data.cat || 'زوارق مزدوجة',
        reg: data.reg || '',
        zone: data.zone || '',
        port: data.port || '',
        supp: data.supp || '',
        stat: data.stat || 'صالح',
        break: data.break || '',
        fDate: data.fDate || '',
        eDate: data.eDate || '',
        ref: data.ref || ''
    };
    vessels.push(newVessel);
    res.status(201).json({ success: true, data: newVessel });
});

app.put('/api/vessels/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    if (index === -1) return res.status(404).json({ success: false, error: 'غير موجود' });
    vessels[index] = { ...vessels[index], ...req.body };
    res.json({ success: true, data: vessels[index] });
});

app.delete('/api/vessels/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    if (index === -1) return res.status(404).json({ success: false, error: 'غير موجود' });
    vessels.splice(index, 1);
    res.json({ success: true, message: 'تم الحذف' });
});

// --- Tickets ---
app.get('/api/tickets', (req, res) => res.json(tickets));

app.post('/api/tickets', (req, res) => {
    const data = req.body;
    const newTicket = {
        id: Date.now(),
        subject: data.subject || 'موضوع جديد',
        message: data.message || '',
        status: 'قيد المعالجة',
        userName: 'Admin',
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    };
    tickets.push(newTicket);
    res.status(201).json({ success: true, data: newTicket });
});

// --- Notes ---
app.get('/api/notes', (req, res) => res.json(notes));

app.post('/api/notes', (req, res) => {
    const data = req.body;
    const newNote = {
        id: Date.now(),
        title: data.title || 'مذكرة جديدة',
        content: data.content || '',
        date: data.date || new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        week: '1',
        createdBy: 'Admin'
    };
    notes.push(newNote);
    res.status(201).json({ success: true, data: newNote });
});

app.delete('/api/notes/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = notes.findIndex(n => n.id === id);
    if (index === -1) return res.status(404).json({ success: false, error: 'غير موجود' });
    notes.splice(index, 1);
    res.json({ success: true, message: 'تم الحذف' });
});

app.get('/api/notes/latest', (req, res) => {
    res.json(notes.length > 0 ? notes[notes.length - 1] : null);
});

// --- Users ---
app.get('/api/users', (req, res) => res.json(users));

app.post('/api/users', (req, res) => {
    const data = req.body;
    const newUser = {
        id: Date.now(),
        name: data.name || 'مستخدم جديد',
        email: data.email || 'user@test.com',
        role: data.role || 'مستخدم',
        isActive: true
    };
    users.push(newUser);
    res.status(201).json({ success: true, data: newUser });
});

app.put('/api/users/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const user = users.find(u => u.id === id);
    if (!user) return res.status(404).json({ success: false, error: 'غير موجود' });
    Object.assign(user, req.body);
    res.json({ success: true, data: user });
});

app.delete('/api/users/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return res.status(404).json({ success: false, error: 'غير موجود' });
    users.splice(index, 1);
    res.json({ success: true, message: 'تم الحذف' });
});

// --- Locations ---
app.get('/api/locations', (req, res) => res.json(locations));

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
app.get('/api/logs', (req, res) => res.json(logs));

app.post('/api/logs', (req, res) => {
    const data = req.body;
    const newLog = {
        id: Date.now(),
        userName: 'Admin',
        action: data.action || 'إجراء',
        details: data.details || '',
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    };
    logs.push(newLog);
    res.status(201).json({ success: true, data: newLog });
});

// --- Export ---
app.get('/api/export-all', (req, res) => {
    res.json({ vessels, users, tickets, logs, locations, notes });
});

app.post('/api/import-all', (req, res) => {
    const { vessels: v, users: u, tickets: t, logs: l, locations: loc, notes: n } = req.body;
    if (v) vessels = v;
    if (u) users = u;
    if (t) tickets = t;
    if (l) logs = l;
    if (loc) locations = loc;
    if (n) notes = n;
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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server: http://localhost:${PORT}`);
    console.log('📧 admin / 🔑 123456');
});
