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
// ✅ البيانات (مخزنة في الذاكرة)
// ============================================================
let vessels = [];
let tickets = [];
let notes = [];
let users = [
    { id: 1, name: 'Admin', email: 'admin', role: 'مسؤول', isActive: true }
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

// ============================================================
// 🔐 Routes المصادقة
// ============================================================

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    console.log('📧 محاولة تسجيل دخول:', email);
    
    if (email === 'admin' && password === '123456') {
        res.json({
            success: true,
            token: 'fake-jwt-token-123456',
            user: {
                id: 1,
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

app.get('/api/auth/me', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token === 'fake-jwt-token-123456') {
        res.json({
            success: true,
            user: {
                id: 1,
                name: 'Admin',
                email: 'admin',
                role: 'مسؤول'
            }
        });
    } else {
        res.status(401).json({ success: false, error: 'غير مصرح' });
    }
});

// ============================================================
// 🚢 Routes المراكب
// ============================================================

app.get('/api/vessels', (req, res) => {
    console.log('📊 طلب عرض المراكب - العدد:', vessels.length);
    res.json(vessels);
});

app.post('/api/vessels', (req, res) => {
    try {
        const data = req.body;
        console.log('📥 استلام بيانات مركب:', data);
        
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
        console.log('✅ تم إضافة مركب:', newVessel.name);
        console.log('📊 عدد المراكب:', vessels.length);
        
        res.status(201).json({ 
            success: true, 
            message: 'تم إضافة المركب بنجاح',
            data: newVessel 
        });
    } catch (error) {
        console.error('❌ خطأ في الإضافة:', error);
        res.status(400).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.delete('/api/vessels/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    
    if (index === -1) {
        return res.status(404).json({ 
            success: false, 
            error: 'المركب غير موجود' 
        });
    }
    
    vessels.splice(index, 1);
    res.json({ 
        success: true, 
        message: 'تم حذف المركب بنجاح' 
    });
});

// ============================================================
// 🎫 Routes التذاكر
// ============================================================

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
    res.status(201).json({ 
        success: true, 
        data: newTicket 
    });
});

// ============================================================
// 📝 Routes المذكرات
// ============================================================

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
    res.status(201).json({ 
        success: true, 
        data: newNote 
    });
});

app.delete('/api/notes/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = notes.findIndex(n => n.id === id);
    
    if (index === -1) {
        return res.status(404).json({ 
            success: false, 
            error: 'المذكرة غير موجودة' 
        });
    }
    
    notes.splice(index, 1);
    res.json({ 
        success: true, 
        message: 'تم حذف المذكرة' 
    });
});

app.get('/api/notes/latest', (req, res) => {
    res.json(notes.length > 0 ? notes[notes.length - 1] : null);
});

// ============================================================
// 👥 Routes المستخدمين
// ============================================================

app.get('/api/users', (req, res) => {
    res.json(users);
});

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
    res.status(201).json({ 
        success: true, 
        data: newUser 
    });
});

app.put('/api/users/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const user = users.find(u => u.id === id);
    
    if (!user) {
        return res.status(404).json({ 
            success: false, 
            error: 'المستخدم غير موجود' 
        });
    }
    
    Object.assign(user, req.body);
    res.json({ 
        success: true, 
        data: user 
    });
});

app.delete('/api/users/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = users.findIndex(u => u.id === id);
    
    if (index === -1) {
        return res.status(404).json({ 
            success: false, 
            error: 'المستخدم غير موجود' 
        });
    }
    
    users.splice(index, 1);
    res.json({ 
        success: true, 
        message: 'تم حذف المستخدم' 
    });
});

// ============================================================
// 📍 Routes المواقع
// ============================================================

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
    res.status(201).json({ 
        success: true, 
        data: newLocation 
    });
});

// ============================================================
// 📜 Routes السجلات
// ============================================================

app.get('/api/logs', (req, res) => {
    res.json(logs);
});

app.post('/api/logs', (req, res) => {
    const data = req.body;
    const newLog = {
        id: Date.now(),
        userName: 'Admin',
        action: data.action || 'إجراء',
        details: data.details || '',
        date: getCurrentDate(),
        time: getCurrentTime()
    };
    logs.push(newLog);
    res.status(201).json({ 
        success: true, 
        data: newLog 
    });
});

// ============================================================
// 💾 Routes التصدير والاستيراد
// ============================================================

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
    res.json({ 
        success: true, 
        message: '✅ تم استيراد البيانات بنجاح' 
    });
});

// ============================================================
// ❤️ Health Check
// ============================================================

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString() 
    });
});

// ============================================================
// 🏠 الصفحة الرئيسية
// ============================================================

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
