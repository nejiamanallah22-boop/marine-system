const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// قاعدة بيانات بسيطة في الذاكرة
let vessels = [];
let nextId = 1;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === '1234') {
        res.json({ success: true, user: { id: 1, username: 'admin', role: 'مسؤول' } });
    } else {
        res.status(401).json({ error: 'بيانات غير صحيحة' });
    }
});

// جلب جميع المراكب
app.get('/api/vessels', (req, res) => {
    res.json(vessels);
});

// إضافة مركب جديد
app.post('/api/vessels', (req, res) => {
    const newVessel = { id: nextId++, ...req.body };
    vessels.push(newVessel);
    console.log('Vessel added:', newVessel);
    res.json({ success: true, vessel: newVessel });
});

// تحديث مركب
app.put('/api/vessels/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    if (index !== -1) {
        vessels[index] = { ...vessels[index], ...req.body, id: id };
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

// حذف مركب
app.delete('/api/vessels/:id', (req, res) => {
    const id = parseInt(req.params.id);
    vessels = vessels.filter(v => v.id !== id);
    res.json({ success: true });
});

// المستخدمين
app.get('/api/users', (req, res) => {
    res.json([{ id: 1, username: 'admin', role: 'مسؤول', enabled: true }]);
});

// إحصائيات
app.get('/api/stats', (req, res) => {
    const total = vessels.length;
    const salih = vessels.filter(v => v.status === 'صالح').length;
    const mo3atab = vessels.filter(v => v.status === 'معطب').length;
    const siyana = vessels.filter(v => v.status === 'صيانة').length;
    const efficiency = total > 0 ? ((salih / total) * 100).toFixed(1) : 0;
    res.json({ total, salih, mo3atab, siyana, efficiency });
});

// تذاكر
app.get('/api/tickets', (req, res) => { res.json([]); });
app.post('/api/tickets', (req, res) => { res.json({ success: true }); });

// سجلات
app.get('/api/logs', (req, res) => { res.json([]); });

// تصدير
app.get('/api/export', (req, res) => { res.json({ vessels }); });

// استيراد
app.post('/api/import', (req, res) => {
    if (req.body.vessels) {
        vessels = req.body.vessels;
        nextId = (vessels.reduce((max, v) => Math.max(max, v.id), 0) + 1);
        res.json({ success: true, imported: vessels.length });
    } else {
        res.status(400).json({ error: 'بيانات غير صالحة' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🔐 admin / 1234`);
});
