const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const JWT_SECRET = 'my_test_secret';
const PORT = 5000;

// مستخدم ثابت في الكود
const FIXED_USER = {
    name: 'admin',
    pass: 'admin123',
    role: 'مسؤول'
};

app.post('/api/login', (req, res) => {
    const { name, pass } = req.body;
    console.log('Received login:', name, pass); // للتتبع
    
    if (name === FIXED_USER.name && pass === FIXED_USER.pass) {
        const token = jwt.sign(
            { id: '123', name: FIXED_USER.name, role: FIXED_USER.role },
            JWT_SECRET,
            { expiresIn: '1d' }
        );
        res.json({ token, name: FIXED_USER.name, role: FIXED_USER.role });
    } else {
        res.status(401).json({ error: 'بيانات غير صحيحة' });
    }
});

app.get('/api/verify', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ valid: true, name: decoded.name, role: decoded.role });
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// باقي المسارات الأساسية (لمنع أخطاء الواجهة)
app.get('/api/vessels', (req, res) => res.json([]));
app.get('/api/tickets', (req, res) => res.json([]));
app.get('/api/users', (req, res) => res.json([]));
app.get('/api/logs', (req, res) => res.json([]));
app.get('/api/stats', (req, res) => res.json({ vessels: 0, tickets: 0, users: 1 }));
app.post('/api/logout', (req, res) => res.json({ success: true }));
app.get('/api/export-all', (req, res) => res.json({}));
app.post('/api/import-all', (req, res) => res.json({ success: true }));

app.get('/api/health', (req, res) => res.json({ status: 'OK' }));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`👤 Login: admin / admin123`);
});
