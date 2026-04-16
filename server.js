const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// البيانات الافتراضية
const defaultData = {
    users: [
        { id: 1, username: 'admin', password: '1234', role: 'مسؤول', enabled: true },
        { id: 2, username: 'editor', password: '1234', role: 'محرر', enabled: true },
        { id: 3, username: 'viewer', password: '1234', role: 'مشاهد', enabled: true }
    ],
    vessels: [
        { id: 1, name: 'البروق 1', number: 'B001', length: 11, region: 'الشمال', zone: 'تونس', port: 'تونس', support_location: 'قاعدة الشمال', status: 'صالح', breakdown_type: '', breakdown_date: '', end_date: '', reference: '', category: 'البروق' },
        { id: 2, name: 'صقر 1', number: 'S001', length: 10, region: 'الساحل', zone: 'سوسة', port: 'سوسة', support_location: 'قاعدة الساحل', status: 'صالح', breakdown_type: '', breakdown_date: '', end_date: '', reference: '', category: 'صقور' },
        { id: 3, name: 'خافرة 1', number: 'K001', length: 20, region: 'الوسط', zone: 'صفاقس', port: 'صفاقس', support_location: 'قاعدة الوسط', status: 'معطب', breakdown_type: 'عطل في المحرك', breakdown_date: '2025-03-10', end_date: '2025-04-10', reference: 'REF001', category: 'خوافر' }
    ],
    logs: [],
    tickets: []
};

// قراءة البيانات
function readData() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
        return defaultData;
    }
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch(e) {
        return defaultData;
    }
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==================== تسجيل الدخول ====================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const db = readData();
    const user = db.users.find(u => u.username === username && u.password === password && u.enabled);
    if (user) {
        res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
    } else {
        res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
});

// ==================== المراكب ====================
app.get('/api/vessels', (req, res) => {
    const db = readData();
    res.json(db.vessels);
});

app.post('/api/vessels', (req, res) => {
    const db = readData();
    const newId = db.vessels.length > 0 ? Math.max(...db.vessels.map(v => v.id)) + 1 : 1;
    const newVessel = { id: newId, ...req.body };
    db.vessels.push(newVessel);
    writeData(db);
    console.log('✅ تم إضافة مركب:', newVessel.name);
    res.json({ success: true, vessel: newVessel });
});

app.put('/api/vessels/:id', (req, res) => {
    const db = readData();
    const id = parseInt(req.params.id);
    const index = db.vessels.findIndex(v => v.id === id);
    if (index !== -1) {
        db.vessels[index] = { ...db.vessels[index], ...req.body, id: id };
        writeData(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'المركب غير موجود' });
    }
});

app.delete('/api/vessels/:id', (req, res) => {
    const db = readData();
    const id = parseInt(req.params.id);
    db.vessels = db.vessels.filter(v => v.id !== id);
    writeData(db);
    res.json({ success: true });
});

// ==================== المستخدمين ====================
app.get('/api/users', (req, res) => {
    const db = readData();
    const safeUsers = db.users.map(u => ({ id: u.id, username: u.username, role: u.role, enabled: u.enabled }));
    res.json(safeUsers);
});

app.post('/api/users', (req, res) => {
    const db = readData();
    const { username, password, role } = req.body;
    const newId = db.users.length > 0 ? Math.max(...db.users.map(u => u.id)) + 1 : 4;
    const newUser = { id: newId, username, password, role: role || 'مشاهد', enabled: true };
    db.users.push(newUser);
    writeData(db);
    res.json({ success: true, user: newUser });
});

app.put('/api/users/:id/password', (req, res) => {
    const db = readData();
    const id = parseInt(req.params.id);
    const user = db.users.find(u => u.id === id);
    if (user) {
        user.password = req.body.password;
        writeData(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'المستخدم غير موجود' });
    }
});

app.put('/api/users/:id/toggle', (req, res) => {
    const db = readData();
    const id = parseInt(req.params.id);
    const user = db.users.find(u => u.id === id);
    if (user) {
        user.enabled = req.body.enabled;
        writeData(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'المستخدم غير موجود' });
    }
});

app.delete('/api/users/:id', (req, res) => {
    const db = readData();
    const id = parseInt(req.params.id);
    db.users = db.users.filter(u => u.id !== id);
    writeData(db);
    res.json({ success: true });
});

// ==================== الإحصائيات ====================
app.get('/api/stats', (req, res) => {
    const db = readData();
    const vessels = db.vessels;
    const total = vessels.length;
    const salih = vessels.filter(v => v.status === 'صالح').length;
    const mo3atab = vessels.filter(v => v.status === 'معطب').length;
    const siyana = vessels.filter(v => v.status === 'صيانة').length;
    const efficiency = total > 0 ? ((salih / total) * 100).toFixed(1) : 0;
    res.json({ total, salih, mo3atab, siyana, efficiency });
});

// ==================== تذاكر الدعم ====================
app.get('/api/tickets', (req, res) => {
    const db = readData();
    res.json(db.tickets || []);
});

app.post('/api/tickets', (req, res) => {
    const db = readData();
    const newTicket = { id: Date.now(), ...req.body, date: new Date().toLocaleDateString('ar-EG'), status: 'قيد المعالجة' };
    db.tickets.unshift(newTicket);
    writeData(db);
    res.json({ success: true });
});

// ==================== سجل النشاطات ====================
app.get('/api/logs', (req, res) => {
    const db = readData();
    res.json(db.logs || []);
});

app.post('/api/logs', (req, res) => {
    const db = readData();
    const newLog = { id: Date.now(), ...req.body, date: new Date().toLocaleDateString('ar-EG'), time: new Date().toLocaleTimeString() };
    db.logs.unshift(newLog);
    writeData(db);
    res.json({ success: true });
});

// ==================== تصدير واستيراد ====================
app.get('/api/export', (req, res) => {
    const db = readData();
    res.json({ vessels: db.vessels });
});

app.post('/api/import', (req, res) => {
    const db = readData();
    const { vessels } = req.body;
    if (vessels && Array.isArray(vessels)) {
        db.vessels = vessels;
        writeData(db);
        res.json({ success: true, imported: vessels.length });
    } else {
        res.status(400).json({ error: 'بيانات غير صالحة' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📁 Data file: ${DATA_FILE}`);
    console.log(`🔐 admin / 1234`);
});
