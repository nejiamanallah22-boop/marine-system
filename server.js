const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'your-secret-key-change-this-in-production';

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// ==================== إدارة الملفات ====================
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// قراءة البيانات من الملفات
function readData(filename) {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify([]));
        return [];
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
}

function writeData(filename, data) {
    const filePath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ==================== البيانات الأولية ====================
function initData() {
    // المستخدمين مع تشفير كلمات المرور
    let users = readData('users.json');
    if (users.length === 0) {
        const defaultUsers = [
            { id: 1, username: 'admin', password: bcrypt.hashSync('admin123', 10), role: 'مسؤول', enabled: true, createdAt: new Date().toISOString() },
            { id: 2, username: 'editor', password: bcrypt.hashSync('editor123', 10), role: 'محرر', enabled: true, createdAt: new Date().toISOString() },
            { id: 3, username: 'viewer', password: bcrypt.hashSync('viewer123', 10), role: 'مشاهد', enabled: true, createdAt: new Date().toISOString() }
        ];
        writeData('users.json', defaultUsers);
        users = defaultUsers;
    }
    
    // المراكب
    let vessels = readData('vessels.json');
    if (vessels.length === 0) {
        const defaultVessels = [
            { id: 1, name: "البروق-1", number: "B001", length: 11, category: "البروق", region: "الشمال", zone: "تونس", port: "تونس", support_location: "حلق الوادي", status: "صالح", breakdown_type: "", breakdown_date: "", end_date: "", reference: "", createdAt: new Date().toISOString() },
            { id: 2, name: "صقر-1", number: "S001", length: 10, category: "صقور", region: "الساحل", zone: "سوسة", port: "سوسة", support_location: "المنستير", status: "صالح", breakdown_type: "", breakdown_date: "", end_date: "", reference: "", createdAt: new Date().toISOString() },
            { id: 3, name: "خوفة-1", number: "K001", length: 20, category: "خوافر", region: "الوسط", zone: "صفاقس", port: "صفاقس", support_location: "المهدية", status: "معطب", breakdown_type: "محرك", breakdown_date: "2024-01-15", end_date: "2024-02-15", reference: "REF001", createdAt: new Date().toISOString() },
            { id: 4, name: "زورق-1", number: "Z001", length: 15, category: "زوارق مزدوجة", region: "الجنوب", zone: "جربة", port: "جربة", support_location: "قابس", status: "صيانة", breakdown_type: "كهرباء", breakdown_date: "2024-01-20", end_date: "2024-02-20", reference: "REF002", createdAt: new Date().toISOString() }
        ];
        writeData('vessels.json', defaultVessels);
    }
    
    // السجلات
    let logs = readData('logs.json');
    if (logs.length === 0) {
        writeData('logs.json', []);
    }
    
    // التذاكر
    let tickets = readData('tickets.json');
    if (tickets.length === 0) {
        writeData('tickets.json', []);
    }
}

// ==================== Middleware التوثيق ====================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid or expired token.' });
    }
}

function authorizeRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
        }
        next();
    };
}

// ==================== API Routes ====================

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    const users = readData('users.json');
    const user = users.find(u => u.username === username && u.enabled === true);
    
    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        SECRET_KEY,
        { expiresIn: '24h' }
    );
    
    res.json({
        success: true,
        token: token,
        user: {
            id: user.id,
            username: user.username,
            role: user.role
        }
    });
});

// الحصول على جميع المراكب
app.get('/api/vessels', authenticateToken, (req, res) => {
    const vessels = readData('vessels.json');
    res.json(vessels);
});

// إضافة مركب جديد
app.post('/api/vessels', authenticateToken, authorizeRole('مسؤول', 'محرر'), (req, res) => {
    const vessels = readData('vessels.json');
    const newVessel = {
        ...req.body,
        id: Date.now(),
        createdAt: new Date().toISOString()
    };
    vessels.push(newVessel);
    writeData('vessels.json', vessels);
    
    // تسجيل النشاط
    addLog(req.user.username, req.user.role, 'إضافة مركب', `تم إضافة المركب "${newVessel.name}"`);
    
    res.json({ success: true, vessel: newVessel });
});

// تحديث مركب
app.put('/api/vessels/:id', authenticateToken, authorizeRole('مسؤول', 'محرر'), (req, res) => {
    const vessels = readData('vessels.json');
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    
    if (index === -1) {
        return res.status(404).json({ error: 'Vessel not found' });
    }
    
    vessels[index] = { ...req.body, id: id, updatedAt: new Date().toISOString() };
    writeData('vessels.json', vessels);
    
    addLog(req.user.username, req.user.role, 'تحديث مركب', `تم تحديث المركب "${vessels[index].name}"`);
    
    res.json({ success: true, vessel: vessels[index] });
});

// حذف مركب
app.delete('/api/vessels/:id', authenticateToken, authorizeRole('مسؤول'), (req, res) => {
    const vessels = readData('vessels.json');
    const id = parseInt(req.params.id);
    const vessel = vessels.find(v => v.id === id);
    
    if (!vessel) {
        return res.status(404).json({ error: 'Vessel not found' });
    }
    
    const filtered = vessels.filter(v => v.id !== id);
    writeData('vessels.json', filtered);
    
    addLog(req.user.username, req.user.role, 'حذف مركب', `تم حذف المركب "${vessel.name}"`);
    
    res.json({ success: true });
});

// الحصول على جميع المستخدمين (للمسؤول فقط)
app.get('/api/users', authenticateToken, authorizeRole('مسؤول'), (req, res) => {
    const users = readData('users.json');
    // لا نرسل كلمات المرور
    const safeUsers = users.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
        enabled: u.enabled,
        createdAt: u.createdAt
    }));
    res.json(safeUsers);
});

// إضافة مستخدم جديد
app.post('/api/users', authenticateToken, authorizeRole('مسؤول'), (req, res) => {
    const { username, password, role } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    const users = readData('users.json');
    
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Username already exists' });
    }
    
    const newUser = {
        id: Date.now(),
        username: username,
        password: bcrypt.hashSync(password, 10),
        role: role || 'مشاهد',
        enabled: true,
        createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    writeData('users.json', users);
    
    addLog(req.user.username, req.user.role, 'إضافة مستخدم', `تم إضافة المستخدم "${username}"`);
    
    res.json({ success: true, user: { id: newUser.id, username: newUser.username, role: newUser.role } });
});

// تغيير كلمة المرور
app.put('/api/users/:id/password', authenticateToken, authorizeRole('مسؤول'), (req, res) => {
    const { password } = req.body;
    const userId = parseInt(req.params.id);
    
    if (!password) {
        return res.status(400).json({ error: 'Password required' });
    }
    
    const users = readData('users.json');
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    users[userIndex].password = bcrypt.hashSync(password, 10);
    writeData('users.json', users);
    
    addLog(req.user.username, req.user.role, 'تغيير كلمة مرور', `تم تغيير كلمة مرور المستخدم "${users[userIndex].username}"`);
    
    res.json({ success: true });
});

// تبديل حالة المستخدم (تفعيل/تعطيل)
app.put('/api/users/:id/toggle', authenticateToken, authorizeRole('مسؤول'), (req, res) => {
    const { enabled } = req.body;
    const userId = parseInt(req.params.id);
    
    const users = readData('users.json');
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    users[userIndex].enabled = enabled;
    writeData('users.json', users);
    
    addLog(req.user.username, req.user.role, enabled ? 'تفعيل مستخدم' : 'تعطيل مستخدم', `تم ${enabled ? 'تفعيل' : 'تعطيل'} المستخدم "${users[userIndex].username}"`);
    
    res.json({ success: true });
});

// حذف مستخدم
app.delete('/api/users/:id', authenticateToken, authorizeRole('مسؤول'), (req, res) => {
    const userId = parseInt(req.params.id);
    
    const users = readData('users.json');
    const user = users.find(u => u.id === userId);
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    const filtered = users.filter(u => u.id !== userId);
    writeData('users.json', filtered);
    
    addLog(req.user.username, req.user.role, 'حذف مستخدم', `تم حذف المستخدم "${user.username}"`);
    
    res.json({ success: true });
});

// الحصول على السجلات
app.get('/api/logs', authenticateToken, authorizeRole('مسؤول'), (req, res) => {
    const logs = readData('logs.json');
    res.json(logs);
});

// الحصول على التذاكر
app.get('/api/tickets', authenticateToken, (req, res) => {
    const tickets = readData('tickets.json');
    // المستخدم العادي يرى تذاكره فقط
    if (req.user.role !== 'مسؤول') {
        const userTickets = tickets.filter(t => t.username === req.user.username);
        return res.json(userTickets);
    }
    res.json(tickets);
});

// إضافة تذكرة جديدة
app.post('/api/tickets', authenticateToken, (req, res) => {
    const { subject, message } = req.body;
    
    if (!subject || !message) {
        return res.status(400).json({ error: 'Subject and message required' });
    }
    
    const tickets = readData('tickets.json');
    const newTicket = {
        id: Date.now(),
        date: new Date().toLocaleDateString('ar-TN'),
        username: req.user.username,
        subject: subject,
        message: message,
        status: 'قيد المعالجة',
        createdAt: new Date().toISOString()
    };
    
    tickets.push(newTicket);
    writeData('tickets.json', tickets);
    
    addLog(req.user.username, req.user.role, 'إرسال تذكرة', `تم إرسال تذكرة دعم: ${subject}`);
    
    res.json({ success: true, ticket: newTicket });
});

// تصدير جميع البيانات
app.get('/api/export', authenticateToken, authorizeRole('مسؤول'), (req, res) => {
    const vessels = readData('vessels.json');
    const users = readData('users.json');
    const logs = readData('logs.json');
    const tickets = readData('tickets.json');
    
    const exportData = {
        vessels,
        users: users.map(u => ({ ...u, password: undefined })), // إخفاء كلمات المرور
        logs,
        tickets,
        exportDate: new Date().toISOString()
    };
    
    res.json(exportData);
});

// استيراد البيانات
app.post('/api/import', authenticateToken, authorizeRole('مسؤول'), (req, res) => {
    const { vessels } = req.body;
    
    if (vessels && Array.isArray(vessels)) {
        writeData('vessels.json', vessels);
        addLog(req.user.username, req.user.role, 'استيراد بيانات', 'تم استيراد بيانات المراكب');
    }
    
    res.json({ success: true });
});

// ==================== دالة تسجيل النشاطات ====================
function addLog(username, userRole, action, details) {
    const logs = readData('logs.json');
    const now = new Date();
    
    const log = {
        id: Date.now(),
        date: now.toLocaleDateString('ar-TN'),
        time: now.toLocaleTimeString('ar-TN'),
        username: username,
        user_role: userRole,
        action: action,
        details: details,
        ip_address: 'server',
        user_agent: 'system',
        timestamp: now.toISOString()
    };
    
    logs.unshift(log);
    // الاحتفاظ فقط بآخر 1000 سجل
    if (logs.length > 1000) logs.pop();
    writeData('logs.json', logs);
}

// ==================== تشغيل الخادم ====================
initData();

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 Data directory: ${DATA_DIR}`);
    console.log(`🔐 Default users:`);
    console.log(`   Admin: admin / admin123`);
    console.log(`   Editor: editor / editor123`);
    console.log(`   Viewer: viewer / viewer123`);
});
