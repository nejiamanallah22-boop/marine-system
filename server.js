const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ملفات البيانات
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// دوال قراءة وكتابة البيانات
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

// الحصول على جميع المراكب
app.get('/api/vessels', (req, res) => {
    const vessels = readData('vessels.json');
    res.json(vessels);
});

// إضافة مركب جديد
app.post('/api/vessels', (req, res) => {
    const vessels = readData('vessels.json');
    const newVessel = { ...req.body, id: Date.now() };
    vessels.push(newVessel);
    writeData('vessels.json', vessels);
    res.json({ success: true, vessel: newVessel });
});

// تحديث مركب
app.put('/api/vessels/:id', (req, res) => {
    const vessels = readData('vessels.json');
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    if (index !== -1) {
        vessels[index] = { ...req.body, id };
        writeData('vessels.json', vessels);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

// حذف مركب
app.delete('/api/vessels/:id', (req, res) => {
    const vessels = readData('vessels.json');
    const id = parseInt(req.params.id);
    const filtered = vessels.filter(v => v.id !== id);
    writeData('vessels.json', filtered);
    res.json({ success: true });
});

// الحصول على المستخدمين
app.get('/api/users', (req, res) => {
    const users = readData('users.json');
    const safeUsers = users.map(u => ({ id: u.id, username: u.username, role: u.role, enabled: u.enabled }));
    res.json(safeUsers);
});

// إضافة مستخدم
app.post('/api/users', (req, res) => {
    const users = readData('users.json');
    const { username, password, role } = req.body;
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'المستخدم موجود' });
    }
    const newUser = { id: Date.now(), username, password, role, enabled: true };
    users.push(newUser);
    writeData('users.json', users);
    res.json({ success: true });
});

// تغيير كلمة المرور
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

// تبديل حالة المستخدم
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

// حذف مستخدم
app.delete('/api/users/:id', (req, res) => {
    const users = readData('users.json');
    const id = parseInt(req.params.id);
    const filtered = users.filter(u => u.id !== id);
    writeData('users.json', filtered);
    res.json({ success: true });
});

// الحصول على السجلات
app.get('/api/logs', (req, res) => {
    const logs = readData('logs.json');
    res.json(logs);
});

// إضافة سجل
app.post('/api/logs', (req, res) => {
    const logs = readData('logs.json');
    logs.unshift(req.body);
    if (logs.length > 500) logs.pop();
    writeData('logs.json', logs);
    res.json({ success: true });
});

// الحصول على التذاكر
app.get('/api/tickets', (req, res) => {
    const tickets = readData('tickets.json');
    res.json(tickets);
});

// إضافة تذكرة
app.post('/api/tickets', (req, res) => {
    const tickets = readData('tickets.json');
    const newTicket = { ...req.body, id: Date.now(), date: new Date().toLocaleDateString('ar-TN'), status: 'قيد المعالجة' };
    tickets.push(newTicket);
    writeData('tickets.json', tickets);
    res.json({ success: true });
});

// تصدير البيانات
app.get('/api/export', (req, res) => {
    const data = {
        vessels: readData('vessels.json'),
        users: readData('users.json'),
        logs: readData('logs.json'),
        tickets: readData('tickets.json')
    };
    res.json(data);
});

// استيراد البيانات
app.post('/api/import', (req, res) => {
    const { vessels } = req.body;
    if (vessels) writeData('vessels.json', vessels);
    res.json({ success: true });
});

// ==================== البيانات الأولية ====================
function initData() {
    let users = readData('users.json');
    if (users.length === 0) {
        writeData('users.json', [
            { id: 1, username: 'admin', password: 'admin123', role: 'مسؤول', enabled: true },
            { id: 2, username: 'editor', password: 'editor123', role: 'محرر', enabled: true },
            { id: 3, username: 'viewer', password: 'viewer123', role: 'مشاهد', enabled: true }
        ]);
    }

    let vessels = readData('vessels.json');
    if (vessels.length === 0) {
        writeData('vessels.json', [
            { id: 1, name: 'البروق-1', number: 'B001', length: 11, category: 'البروق', region: 'الشمال', zone: 'تونس', port: 'تونس', status: 'صالح', breakdown: '', breakdownDate: '', endDate: '' },
            { id: 2, name: 'صقر-1', number: 'S001', length: 10, category: 'صقور', region: 'الساحل', zone: 'سوسة', port: 'سوسة', status: 'صالح', breakdown: '', breakdownDate: '', endDate: '' },
            { id: 3, name: 'خوفة-1', number: 'K001', length: 20, category: 'خوافر', region: 'الوسط', zone: 'صفاقس', port: 'صفاقس', status: 'معطب', breakdown: 'محرك', breakdownDate: '2024-01-15', endDate: '2024-02-15' }
        ]);
    }

    if (readData('logs.json').length === 0) writeData('logs.json', []);
    if (readData('tickets.json').length === 0) writeData('tickets.json', []);
}

initData();

app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`);
    console.log(`📁 البيانات محفوظة في مجلد: ${DATA_DIR}`);
    console.log(`🔑 المستخدمين: admin/admin123, editor/editor123, viewer/viewer123`);
});
