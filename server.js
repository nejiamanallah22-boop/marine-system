const express = require('express');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const DB_FILE = './data.json';

// ==================== البيانات الافتراضية ====================
if (!fs.existsSync(DB_FILE)) {
    const defaultData = {
        users: [
            { id: 1, username: 'admin', password: '1234', role: 'مسؤول', enabled: true },
            { id: 2, username: 'editor', password: '1234', role: 'محرر', enabled: true },
            { id: 3, username: 'viewer', password: '1234', role: 'مشاهد', enabled: true }
        ],
        vessels: [
            { id: 1, name: 'البروق 1', number: 'B001', length: 11, region: 'الشمال', zone: 'تونس', port: 'تونس', support_location: 'قاعدة الشمال', status: 'صالح', breakdown_type: '', breakdown_date: '', end_date: '', reference: '', category: 'البروق' },
            { id: 2, name: 'صقر 1', number: 'S001', length: 10, region: 'الساحل', zone: 'سوسة', port: 'سوسة', support_location: 'قاعدة الساحل', status: 'صالح', breakdown_type: '', breakdown_date: '', end_date: '', reference: '', category: 'صقور' },
            { id: 3, name: 'خافرة 1', number: 'K001', length: 20, region: 'الوسط', zone: 'صفاقس', port: 'صفاقس', support_location: 'قاعدة الوسط', status: 'معطب', breakdown_type: 'عطل في المحرك', breakdown_date: '2025-03-10', end_date: '2025-04-10', reference: 'REF001', category: 'خوافر' },
            { id: 4, name: 'زورق 1', number: 'Z001', length: 15, region: 'الجنوب', zone: 'جربة', port: 'جربة', support_location: 'قاعدة الجنوب', status: 'صيانة', breakdown_type: 'صيانة دورية', breakdown_date: '2025-03-15', end_date: '2025-04-05', reference: 'REF002', category: 'زوارق مزدوجة' },
            { id: 5, name: 'طوافة 1', number: 'T001', length: 35, region: 'الشمال', zone: 'بنزرت', port: 'بنزرت', support_location: 'قاعدة الشمال', status: 'صالح', breakdown_type: '', breakdown_date: '', end_date: '', reference: '', category: 'طوافات' }
        ],
        logs: [],
        tickets: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2));
}

// ==================== دوال قاعدة البيانات ====================
function readDB() {
    return JSON.parse(fs.readFileSync(DB_FILE));
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ==================== Middleware ====================
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==================== LOGIN ====================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.username === username && u.password === password && u.enabled);
    
    if (user) {
        res.json({ 
            success: true, 
            user: { id: user.id, username: user.username, role: user.role } 
        });
    } else {
        res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
});

// ==================== VESSELS ====================
app.get('/api/vessels', (req, res) => {
    const db = readDB();
    res.json(db.vessels || []);
});

app.post('/api/vessels', (req, res) => {
    const db = readDB();
    const newVessel = { id: Date.now(), ...req.body };
    db.vessels.push(newVessel);
    writeDB(db);
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
    const db = readDB();
    const id = parseInt(req.params.id);
    db.vessels = db.vessels.filter(v => v.id !== id);
    writeDB(db);
    res.json({ success: true });
});

// ==================== USERS ====================
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

// ==================== STATS ====================
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

// ==================== TICKETS ====================
app.get('/api/tickets', (req, res) => {
    const db = readDB();
    res.json(db.tickets || []);
});

app.post('/api/tickets', (req, res) => {
    const db = readDB();
    const newTicket = { 
        id: Date.now(), 
        ...req.body, 
        date: new Date().toLocaleDateString('ar-EG'), 
        status: 'قيد المعالجة' 
    };
    db.tickets.push(newTicket);
    writeDB(db);
    res.json({ success: true });
});

// ==================== LOGS ====================
app.get('/api/logs', (req, res) => {
    const db = readDB();
    res.json(db.logs || []);
});

// ==================== EXPORT / IMPORT ====================
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

// ==================== تشغيل الخادم ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ═══════════════════════════════════════════════════════════════
    🌊 منظومة الوسائل البحرية - الخادم يعمل بنجاح!
    📍 http://localhost:${PORT}
    ───────────────────────────────────────────────────────────────
    👤 حسابات الدخول:
       🔐 مسؤول (admin): admin / 1234
       ✏️ محرر (editor): editor / 1234
       👁️ مشاهد (viewer): viewer / 1234
    ───────────────────────────────────────────────────────────────
    💾 قاعدة البيانات: JSON (data.json)
    ═══════════════════════════════════════════════════════════════
    `);
});
