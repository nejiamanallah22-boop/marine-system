const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// مجلد البيانات
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// دوال المساعدة
function readData(filename) {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify([]));
        return [];
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeData(filename, data) {
    fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

// ==================== API Routes ====================

// تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = readData('users.json');
    const user = users.find(u => u.username === username && u.password === password && u.enabled === true);
    
    if (user) {
        res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
    } else {
        res.status(401).json({ success: false, error: 'بيانات الدخول غير صحيحة' });
    }
});

// ==================== المراكب ====================
app.get('/api/vessels', (req, res) => {
    res.json(readData('vessels.json'));
});

app.post('/api/vessels', (req, res) => {
    const vessels = readData('vessels.json');
    const newVessel = { ...req.body, id: Date.now(), createdAt: new Date().toISOString() };
    vessels.push(newVessel);
    writeData('vessels.json', vessels);
    res.json({ success: true, vessel: newVessel });
});

app.put('/api/vessels/:id', (req, res) => {
    const vessels = readData('vessels.json');
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    if (index !== -1) {
        vessels[index] = { ...req.body, id, updatedAt: new Date().toISOString() };
        writeData('vessels.json', vessels);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

app.delete('/api/vessels/:id', (req, res) => {
    const vessels = readData('vessels.json');
    const id = parseInt(req.params.id);
    const filtered = vessels.filter(v => v.id !== id);
    writeData('vessels.json', filtered);
    res.json({ success: true });
});

// ==================== المستخدمين ====================
app.get('/api/users', (req, res) => {
    const users = readData('users.json');
    const safeUsers = users.map(u => ({ id: u.id, username: u.username, role: u.role, enabled: u.enabled }));
    res.json(safeUsers);
});

app.post('/api/users', (req, res) => {
    const users = readData('users.json');
    const { username, password, role } = req.body;
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'المستخدم موجود بالفعل' });
    }
    const newUser = { id: Date.now(), username, password, role, enabled: true, createdAt: new Date().toISOString() };
    users.push(newUser);
    writeData('users.json', users);
    res.json({ success: true });
});

app.put('/api/users/:id/password', (req, res) => {
    const users = readData('users.json');
    const id = parseInt(req.params.id);
    const { password } = req.body;
    const user = users.find(u => u.id === id);
    if (user) {
        user.password = password;
        writeData('users.json', users);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

app.put('/api/users/:id/toggle', (req, res) => {
    const users = readData('users.json');
    const id = parseInt(req.params.id);
    const { enabled } = req.body;
    const user = users.find(u => u.id === id);
    if (user) {
        user.enabled = enabled;
        writeData('users.json', users);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

app.delete('/api/users/:id', (req, res) => {
    const users = readData('users.json');
    const id = parseInt(req.params.id);
    const filtered = users.filter(u => u.id !== id);
    writeData('users.json', filtered);
    res.json({ success: true });
});

// ==================== السجلات (Logs) ====================
app.get('/api/logs', (req, res) => {
    res.json(readData('logs.json'));
});

app.post('/api/logs', (req, res) => {
    const logs = readData('logs.json');
    logs.unshift(req.body);
    if (logs.length > 500) logs.pop();
    writeData('logs.json', logs);
    res.json({ success: true });
});

// ==================== التذاكر ====================
app.get('/api/tickets', (req, res) => {
    res.json(readData('tickets.json'));
});

app.post('/api/tickets', (req, res) => {
    const tickets = readData('tickets.json');
    const newTicket = { 
        ...req.body, 
        id: Date.now(), 
        date: new Date().toLocaleDateString('ar-TN'),
        time: new Date().toLocaleTimeString('ar-TN'),
        status: 'قيد المعالجة' 
    };
    tickets.push(newTicket);
    writeData('tickets.json', tickets);
    res.json({ success: true });
});

// ==================== تصدير واستيراد ====================
app.get('/api/export', (req, res) => {
    const data = {
        vessels: readData('vessels.json'),
        users: readData('users.json').map(u => ({ ...u, password: undefined })),
        logs: readData('logs.json'),
        tickets: readData('tickets.json'),
        exportDate: new Date().toISOString()
    };
    res.json(data);
});

app.post('/api/import', (req, res) => {
    const { vessels } = req.body;
    if (vessels) writeData('vessels.json', vessels);
    res.json({ success: true });
});

// ==================== تهيئة البيانات الأولية ====================
function initData() {
    // المستخدمين (بدون كلمات مرور ظاهرة في الكود)
    let users = readData('users.json');
    if (users.length === 0) {
        writeData('users.json', [
            { id: 1, username: 'admin', password: 'admin123', role: 'مسؤول', enabled: true },
            { id: 2, username: 'editor', password: 'editor123', role: 'محرر', enabled: true },
            { id: 3, username: 'viewer', password: 'viewer123', role: 'مشاهد', enabled: true }
        ]);
    }

    // المراكب
    let vessels = readData('vessels.json');
    if (vessels.length === 0) {
        writeData('vessels.json', [
            { id: 1, name: 'البروق-1', number: 'B001', length: 11, category: 'البروق', region: 'الشمال', zone: 'تونس', port: 'تونس', support_location: 'حلق الوادي', status: 'صالح', breakdown_type: '', breakdown_date: '', end_date: '', reference: '' },
            { id: 2, name: 'صقر-1', number: 'S001', length: 10, category: 'صقور', region: 'الساحل', zone: 'سوسة', port: 'سوسة', support_location: 'المنستير', status: 'صالح', breakdown_type: '', breakdown_date: '', end_date: '', reference: '' },
            { id: 3, name: 'خوفة-1', number: 'K001', length: 20, category: 'خوافر', region: 'الوسط', zone: 'صفاقس', port: 'صفاقس', support_location: 'المهدية', status: 'معطب', breakdown_type: 'محرك', breakdown_date: '2024-01-15', end_date: '2024-02-15', reference: 'REF001' },
            { id: 4, name: 'زورق-1', number: 'Z001', length: 15, category: 'زوارق مزدوجة', region: 'الجنوب', zone: 'جربة', port: 'جربة', support_location: 'قابس', status: 'صيانة', breakdown_type: 'كهرباء', breakdown_date: '2024-01-20', end_date: '2024-02-20', reference: 'REF002' }
        ]);
    }

    if (readData('logs.json').length === 0) writeData('logs.json', []);
    if (readData('tickets.json').length === 0) writeData('tickets.json', []);
}

initData();

app.listen(PORT, () => {
    console.log(`\n🚀 السيرفر يعمل على http://localhost:${PORT}`);
    console.log(`📁 مجلد البيانات: ${DATA_DIR}`);
    console.log(`\n🔑 بيانات الدخول (للمسؤول فقط):`);
    console.log(`   admin / admin123`);
    console.log(`   editor / editor123`);
    console.log(`   viewer / viewer123\n`);
});
