const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// ✅ حل مشكلة CSS - الأهم
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
// ✅ بيانات وهمية (Mock Data)
// ============================================================
const mockVessels = [
    { _id: '1', name: 'المركب الأول', num: '001', len: 10, cat: 'صقور', reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: 'تونس', stat: 'صالح', break: '-', fDate: '2024-01-01', eDate: '2024-12-31', ref: 'REF001' },
    { _id: '2', name: 'المركب الثاني', num: '002', len: 15, cat: 'خوافر', reg: 'الوسط', zone: 'سوسة', port: 'سوسة', supp: 'تونس', stat: 'معطب', break: 'محرك', fDate: '2024-01-15', eDate: '2024-06-30', ref: 'REF002' },
    { _id: '3', name: 'المركب الثالث', num: '003', len: 12, cat: 'صقور', reg: 'الجنوب', zone: 'جرجيس', port: 'جرجيس', supp: 'تونس', stat: 'صيانة', break: 'كهرباء', fDate: '2024-02-01', eDate: '2024-03-15', ref: 'REF003' }
];

const mockTickets = [
    { _id: '1', subject: 'مشكلة في المحرك', message: 'المحرك لا يعمل بشكل صحيح', status: 'قيد المعالجة', userName: 'Admin', date: '2024-01-01', time: '10:00', replies: [] },
    { _id: '2', subject: 'عطل في نظام الملاحة', message: 'نظام GPS لا يعمل', status: 'تم الرد', userName: 'Admin', date: '2024-01-02', time: '11:00', replies: [{ adminName: 'Admin', reply: 'سيتم الصيانة قريباً', date: '2024-01-03', time: '09:00' }] }
];

const mockNotes = [
    { _id: '1', title: 'مذكرة مهمة', content: 'هذه مذكرة تجريبية', date: '2024-01-01', time: '10:00', week: '1', createdBy: 'Admin' }
];

const mockUsers = [
    { _id: '1', name: 'Admin', email: 'admin', role: 'مسؤول', isActive: true },
    { _id: '2', name: 'مستخدم', email: 'user', role: 'مستخدم', isActive: true }
];

const mockLocations = [
    { _id: '1', userName: 'Admin', lat: 36.8, lng: 10.18, timestamp: new Date() }
];

const mockLogs = [];

// ============================================================
// ✅ API Routes
// ============================================================

// --- Login ---
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    console.log(`📧 محاولة تسجيل دخول: ${email}`);
    
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
    res.json(mockVessels);
});

app.post('/api/vessels', (req, res) => {
    const data = req.body;
    const newVessel = {
        _id: Date.now().toString(),
        ...data,
        stat: data.stat || 'صالح'
    };
    mockVessels.push(newVessel);
    res.status(201).json(newVessel);
});

app.put('/api/vessels/:id', (req, res) => {
    const index = mockVessels.findIndex(v => v._id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'المركب غير موجود' });
    }
    mockVessels[index] = { ...mockVessels[index], ...req.body };
    res.json(mockVessels[index]);
});

app.delete('/api/vessels/:id', (req, res) => {
    const index = mockVessels.findIndex(v => v._id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'المركب غير موجود' });
    }
    mockVessels.splice(index, 1);
    res.json({ success: true, message: 'تم الحذف' });
});

// --- Tickets ---
app.get('/api/tickets', (req, res) => {
    res.json(mockTickets);
});

app.post('/api/tickets', (req, res) => {
    const data = req.body;
    const newTicket = {
        _id: Date.now().toString(),
        ...data,
        status: 'قيد المعالجة',
        replies: []
    };
    mockTickets.push(newTicket);
    res.status(201).json(newTicket);
});

app.put('/api/tickets/:id/reply', (req, res) => {
    const ticket = mockTickets.find(t => t._id === req.params.id);
    if (!ticket) {
        return res.status(404).json({ success: false, error: 'التذكرة غير موجودة' });
    }
    ticket.replies.push({
        adminName: 'Admin',
        reply: req.body.reply,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    });
    ticket.status = 'تم الرد';
    res.json(ticket);
});

app.put('/api/tickets/:id/close', (req, res) => {
    const ticket = mockTickets.find(t => t._id === req.params.id);
    if (!ticket) {
        return res.status(404).json({ success: false, error: 'التذكرة غير موجودة' });
    }
    ticket.status = 'مغلقة';
    res.json(ticket);
});

// --- Notes ---
app.get('/api/notes', (req, res) => {
    res.json(mockNotes);
});

app.post('/api/notes', (req, res) => {
    const data = req.body;
    const newNote = {
        _id: Date.now().toString(),
        ...data,
        createdBy: 'Admin'
    };
    mockNotes.push(newNote);
    res.status(201).json(newNote);
});

app.delete('/api/notes/:id', (req, res) => {
    const index = mockNotes.findIndex(n => n._id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'المذكرة غير موجودة' });
    }
    mockNotes.splice(index, 1);
    res.json({ success: true, message: 'تم الحذف' });
});

// --- Users ---
app.get('/api/users', (req, res) => {
    res.json(mockUsers);
});

app.post('/api/users', (req, res) => {
    const data = req.body;
    const newUser = {
        _id: Date.now().toString(),
        ...data,
        isActive: true
    };
    mockUsers.push(newUser);
    res.status(201).json(newUser);
});

app.put('/api/users/:id', (req, res) => {
    const user = mockUsers.find(u => u._id === req.params.id);
    if (!user) {
        return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }
    Object.assign(user, req.body);
    res.json(user);
});

app.delete('/api/users/:id', (req, res) => {
    const index = mockUsers.findIndex(u => u._id === req.params.id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }
    mockUsers.splice(index, 1);
    res.json({ success: true, message: 'تم الحذف' });
});

// --- Locations ---
app.get('/api/locations', (req, res) => {
    res.json(mockLocations);
});

app.post('/api/locations', (req, res) => {
    const { lat, lng } = req.body;
    const newLocation = {
        _id: Date.now().toString(),
        userName: 'Admin',
        lat,
        lng,
        timestamp: new Date()
    };
    mockLocations.push(newLocation);
    res.status(201).json(newLocation);
});

// --- Logs ---
app.get('/api/logs', (req, res) => {
    res.json(mockLogs);
});

app.post('/api/logs', (req, res) => {
    const data = req.body;
    const newLog = {
        _id: Date.now().toString(),
        ...data,
        userName: 'Admin'
    };
    mockLogs.push(newLog);
    res.status(201).json(newLog);
});

// --- Notes (Latest) ---
app.get('/api/notes/latest', (req, res) => {
    const latest = mockNotes.length > 0 ? mockNotes[mockNotes.length - 1] : null;
    res.json(latest);
});

// --- Export/Import ---
app.get('/api/export-all', (req, res) => {
    res.json({
        vessels: mockVessels,
        users: mockUsers,
        tickets: mockTickets,
        logs: mockLogs,
        locations: mockLocations,
        notes: mockNotes
    });
});

app.post('/api/import-all', (req, res) => {
    const { vessels, users, tickets, logs, locations, notes } = req.body;
    if (vessels) { mockVessels.length = 0; mockVessels.push(...vessels); }
    if (users) { mockUsers.length = 0; mockUsers.push(...users); }
    if (tickets) { mockTickets.length = 0; mockTickets.push(...tickets); }
    if (logs) { mockLogs.length = 0; mockLogs.push(...logs); }
    if (locations) { mockLocations.length = 0; mockLocations.push(...locations); }
    if (notes) { mockNotes.length = 0; mockNotes.push(...notes); }
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
