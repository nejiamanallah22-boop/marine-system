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
app.use(express.static(path.join(__dirname, 'public')));

// البيانات
let vessels = [];

// Login
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

app.get('/api/auth/me', (req, res) => {
    res.json({ success: true, user: { id: 1, name: 'Admin', email: 'admin', role: 'مسؤول' } });
});

// Vessels
app.get('/api/vessels', (req, res) => {
    console.log('📊 طلب عرض المراكب - العدد:', vessels.length);
    res.json(vessels);
});

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
    console.log('✅ تم إضافة مركب:', newVessel.name);
    console.log('📊 عدد المراكب:', vessels.length);
    res.status(201).json({ success: true, data: newVessel });
});

app.delete('/api/vessels/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'غير موجود' });
    }
    vessels.splice(index, 1);
    res.json({ success: true, message: 'تم الحذف' });
});

// باقي Routes...
app.get('/api/tickets', (req, res) => res.json([]));
app.post('/api/tickets', (req, res) => res.status(201).json({ success: true }));
app.get('/api/notes', (req, res) => res.json([]));
app.post('/api/notes', (req, res) => res.status(201).json({ success: true }));
app.get('/api/notes/latest', (req, res) => res.json(null));
app.get('/api/users', (req, res) => res.json([{ id: 1, name: 'Admin', email: 'admin', role: 'مسؤول', isActive: true }]));
app.get('/api/locations', (req, res) => res.json([]));
app.post('/api/locations', (req, res) => res.status(201).json({ success: true }));
app.get('/api/logs', (req, res) => res.json([]));
app.post('/api/logs', (req, res) => res.status(201).json({ success: true }));
app.get('/api/export-all', (req, res) => res.json({ vessels }));
app.post('/api/import-all', (req, res) => {
    if (req.body.vessels) vessels = req.body.vessels;
    res.json({ success: true });
});
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server: http://localhost:${PORT}`);
    console.log('📧 admin / 🔑 123456');
});
