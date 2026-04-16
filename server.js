const express = require('express');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = './data.json';

if (!fs.existsSync(DB_FILE)) {
    const defaultData = {
        users: [
            { id: 1, username: 'admin', password: '1234', role: 'مسؤول', enabled: true },
            { id: 2, username: 'editor', password: '1234', role: 'محرر', enabled: true },
            { id: 3, username: 'viewer', password: '1234', role: 'مشاهد', enabled: true }
        ],
        vessels: [],
        logs: [],
        tickets: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2));
}

function readDB() {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.username === username && u.password === password && u.enabled);
    if (user) {
        res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
    } else {
        res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
});

app.get('/api/vessels', (req, res) => {
    const db = readDB();
    console.log('GET vessels:', db.vessels.length);
    res.json(db.vessels || []);
});

app.post('/api/vessels', (req, res) => {
    console.log('POST vessels - body:', req.body);
    const db = readDB();
    const newVessel = { id: Date.now(), ...req.body };
    db.vessels.push(newVessel);
    writeDB(db);
    console.log('Vessel added, total:', db.vessels.length);
    res.json({ success: true, vessel: newVessel });
});

app.put('/api/vessels/:id', (req, res) => {
    const db = readDB();
    const id = parseInt(req.params.id);
    const index = db.vessels.findIndex(v => v.id === id);
    if (index !== -1) {
        db.vessels[index] = { ...db.vessels[index], ...req.body, id: id };
        writeDB(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'المركب غير موجود' });
    }
});

app.delete('/api/vessels/:id', (req, res) => {
    console.log('DELETE vessel:', req.params.id);
    const db = readDB();
    const id = parseInt(req.params.id);
    db.vessels = db.vessels.filter(v => v.id !== id);
    writeDB(db);
    console.log('Vessel deleted, remaining:', db.vessels.length);
    res.json({ success: true });
});

app.get('/api/users', (req, res) => {
    const db = readDB();
    const safeUsers = db.users.map(u => ({ id: u.id, username: u.username, role: u.role, enabled: u.enabled }));
    res.json(safeUsers);
});

app.post('/api/users', (req, res) => {
    const db = readDB();
    const { username, password, role } = req.body;
    const newUser = { id: Date.now(), username, password, role: role || 'مشاهد', enabled: true };
    db.users.push(newUser);
    writeDB(db);
    res.json({ success: true, user: newUser });
});

app.put('/api/users/:id/password', (req, res) => {
    const db = readDB();
    const id = parseInt(req.params.id);
    const user = db.users.find(u => u.id === id);
    if (user) {
        user.password = req.body.password;
        writeDB(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'المستخدم غير موجود' });
    }
});

app.put('/api/users/:id/toggle', (req, res) => {
    const db = readDB();
    const id = parseInt(req.params.id);
    const user = db.users.find(u => u.id === id);
    if (user) {
        user.enabled = req.body.enabled;
        writeDB(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'المستخدم غير موجود' });
    }
});

app.delete('/api/users/:id', (req, res) => {
    const db = readDB();
    const id = parseInt(req.params.id);
    db.users = db.users.filter(u => u.id !== id);
    writeDB(db);
    res.json({ success: true });
});

app.get('/api/stats', (req, res) => {
    const db = readDB();
    const vessels = db.vessels;
    const total = vessels.length;
    const salih = vessels.filter(v => v.status === 'صالح').length;
    const mo3atab = vessels.filter(v => v.status === 'معطب').length;
    const siyana = vessels.filter(v => v.status === 'صيانة').length;
    const efficiency = total > 0 ? ((salih / total) * 100).toFixed(1) : 0;
    res.json({ total, salih, mo3atab, siyana, efficiency });
});

app.get('/api/tickets', (req, res) => {
    const db = readDB();
    res.json(db.tickets || []);
});

app.post('/api/tickets', (req, res) => {
    const db = readDB();
    const newTicket = { id: Date.now(), ...req.body, date: new Date().toLocaleDateString('ar-EG'), status: 'قيد المعالجة' };
    db.tickets.push(newTicket);
    writeDB(db);
    res.json({ success: true });
});

app.get('/api/logs', (req, res) => {
    const db = readDB();
    res.json(db.logs || []);
});

app.get('/api/export', (req, res) => {
    const db = readDB();
    res.json({ vessels: db.vessels });
});

app.post('/api/import', (req, res) => {
    const db = readDB();
    const { vessels } = req.body;
    if (vessels && Array.isArray(vessels)) {
        db.vessels = vessels;
        writeDB(db);
        res.json({ success: true, imported: vessels.length });
    } else {
        res.status(400).json({ error: 'بيانات غير صالحة' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📁 Database: ${DB_FILE}`);
    console.log(`🔐 admin / 1234`);
});
