const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// حل مشكلة CSS
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

// خدمة الملفات الثابتة
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
// ✅ البيانات (Mock Data - بدون قاعدة بيانات)
// ============================================================
let vessels = [];
let users = [
    { id: 1, name: 'Admin', email: 'admin', role: 'مسؤول', isActive: true }
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
    console.log('📧 محاولة تسجيل دخول:', email);
    
    // ✅ قبول أي بريد وكلمة سر 123456
    if (password === '123456') {
        // البحث عن المستخدم أو إنشائه
        let user = users.find(u => u.email === email);
        if (!user) {
            user = {
                id: Date.now(),
                name: email.split('@')[0] || 'مستخدم',
                email: email,
                role: 'مشاهد',
                isActive: true
            };
            users.push(user);
            console.log('👤 تم إنشاء مستخدم جديد:', user.name);
        }
        
        res.json({
            success: true,
            token: 'fake-token-' + Date.now(),
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } else {
        res.status(401).json({ 
            success: false, 
            error: '❌ كلمة المرور غير صحيحة (استخدم: 123456)' 
        });
    }
});

// --- Me ---
app.get('/api/auth/me', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token && token.startsWith('fake-token-')) {
        const user = users[0] || { id: 1, name: 'Admin', email: 'admin', role: 'مسؤول' };
        res.json({ success: true, user });
    } else {
        res.status(401).json({ success: false, error: 'غير مصرح' });
    }
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
        email: data.email || data.name?.toLowerCase().replace(/\s/g, '') + '@test.com',
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
    console.log('📧 يمكنك استخدام أي بريد إلكتروني');
    console.log('🔑 كلمة المرور: 123456');
    console.log('✅ جاهز للعمل!');
});
