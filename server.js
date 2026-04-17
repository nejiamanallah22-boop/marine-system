const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-production';

// ==================== Middleware ====================
app.use(helmet());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'https://yourdomain.com'],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use('/api/', limiter);

// ==================== مجلد البيانات ====================
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// ==================== دوال مساعدة آمنة ====================
function readData(filename) {
    try {
        const filePath = path.join(DATA_DIR, filename);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify([]));
            return [];
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        console.error('❌ خطأ قراءة الملف:', filename, error);
        return [];
    }
}

function writeData(filename, data) {
    try {
        fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('❌ خطأ كتابة الملف:', filename, error);
        return false;
    }
}

function addLog(username, role, action, details, req = null) {
    const logs = readData('logs.json');
    const now = new Date();
    const log = {
        id: uuidv4(),
        date: now.toLocaleDateString('ar-TN'),
        time: now.toLocaleTimeString('ar-TN'),
        username: username,
        user_role: role,
        action: action,
        details: details,
        ip_address: req ? req.ip || req.socket.remoteAddress : 'unknown',
        user_agent: req ? req.headers['user-agent'] : 'system'
    };
    logs.unshift(log);
    if (logs.length > 1000) logs.pop();
    writeData('logs.json', logs);
}

// ==================== Middleware التوثيق ====================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'غير مصرح به - يرجى تسجيل الدخول' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'انتهت الجلسة - يرجى تسجيل الدخول مرة أخرى' });
    }
}

function authorizeRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'غير مصرح به' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'ليس لديك صلاحية لهذه العملية' });
        }
        next();
    };
}

// ==================== تهيئة البيانات الأولية ====================
function initData() {
    let users = readData('users.json');
    if (users.length === 0) {
        const salt = bcrypt.genSaltSync(10);
        writeData('users.json', [
            { id: uuidv4(), username: "admin", password: bcrypt.hashSync("admin123", salt), role: "مسؤول", enabled: true, createdAt: new Date().toISOString() },
            { id: uuidv4(), username: "editor", password: bcrypt.hashSync("editor123", salt), role: "محرر", enabled: true, createdAt: new Date().toISOString() },
            { id: uuidv4(), username: "viewer", password: bcrypt.hashSync("viewer123", salt), role: "مشاهد", enabled: true, createdAt: new Date().toISOString() }
        ]);
        console.log('✅ تم إنشاء المستخدمين الافتراضيين مع تشفير كلمات المرور');
    }

    let vessels = readData('vessels.json');
    if (vessels.length === 0) {
        writeData('vessels.json', [
            { id: uuidv4(), name: "البروق-1", number: "B001", length: 11, category: "البروق", region: "الشمال", zone: "تونس", port: "تونس", support_location: "حلق الوادي", status: "صالح", breakdown_type: "", breakdown_date: "", end_date: "", reference: "", createdAt: new Date().toISOString() },
            { id: uuidv4(), name: "صقر-1", number: "S001", length: 10, category: "صقور", region: "الساحل", zone: "سوسة", port: "سوسة", support_location: "المنستير", status: "صالح", breakdown_type: "", breakdown_date: "", end_date: "", reference: "", createdAt: new Date().toISOString() },
            { id: uuidv4(), name: "خوفة-1", number: "K001", length: 20, category: "خوافر", region: "الوسط", zone: "صفاقس", port: "صفاقس", support_location: "المهدية", status: "معطب", breakdown_type: "محرك", breakdown_date: "2024-01-15", end_date: "2024-02-15", reference: "REF001", createdAt: new Date().toISOString() },
            { id: uuidv4(), name: "زورق-1", number: "Z001", length: 15, category: "زوارق مزدوجة", region: "الجنوب", zone: "جربة", port: "جربة", support_location: "قابس", status: "صيانة", breakdown_type: "كهرباء", breakdown_date: "2024-01-20", end_date: "2024-02-20", reference: "REF002", createdAt: new Date().toISOString() }
        ]);
    }

    if (readData('logs.json').length === 0) writeData('logs.json', []);
    if (readData('tickets.json').length === 0) writeData('tickets.json', []);
}

// ==================== API Routes ====================

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }
    
    const users = readData('users.json');
    const user = users.find(u => u.username === username && u.enabled === true);
    
    if (!user) {
        addLog(username, 'غير معروف', 'محاولة دخول فاشلة', 'اسم مستخدم غير موجود', req);
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
        addLog(username, 'غير معروف', 'محاولة دخول فاشلة', 'كلمة مرور خاطئة', req);
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
    
    addLog(user.username, user.role, 'تسجيل دخول', 'قام المستخدم بتسجيل الدخول', req);
    res.json({ success: true, token, user: { id: user.id, username: user.username, role: user.role } });
});

// ==================== المراكب ====================
app.get('/api/vessels', authenticateToken, (req, res) => {
    res.json(readData('vessels.json'));
});

app.post('/api/vessels', authenticateToken, authorizeRole('مسؤول', 'محرر'), (req, res) => {
    const { name, number, length, category, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference } = req.body;
    
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'اسم المركب مطلوب' });
    }
    
    const vessels = readData('vessels.json');
    const newVessel = {
        id: uuidv4(),
        name: name.trim(),
        number: number || '',
        length: parseFloat(length) || 0,
        category: category || '',
        region: region || '',
        zone: zone || '',
        port: port || '',
        support_location: support_location || '',
        status: status || 'صالح',
        breakdown_type: breakdown_type || '',
        breakdown_date: breakdown_date || '',
        end_date: end_date || '',
        reference: reference || '',
        createdAt: new Date().toISOString()
    };
    
    vessels.push(newVessel);
    writeData('vessels.json', vessels);
    addLog(req.user.username, req.user.role, 'إضافة مركب', `تم إضافة المركب "${name}"`, req);
    res.json({ success: true, vessel: newVessel });
});

app.put('/api/vessels/:id', authenticateToken, authorizeRole('مسؤول', 'محرر'), (req, res) => {
    const vessels = readData('vessels.json');
    const id = req.params.id;
    const index = vessels.findIndex(v => v.id === id);
    
    if (index === -1) {
        return res.status(404).json({ error: 'المركب غير موجود' });
    }
    
    vessels[index] = { ...req.body, id, updatedAt: new Date().toISOString() };
    writeData('vessels.json', vessels);
    addLog(req.user.username, req.user.role, 'تعديل مركب', `تم تعديل المركب "${vessels[index].name}"`, req);
    res.json({ success: true });
});

app.delete('/api/vessels/:id', authenticateToken, authorizeRole('مسؤول'), (req, res) => {
    const vessels = readData('vessels.json');
    const id = req.params.id;
    const vessel = vessels.find(v => v.id === id);
    
    if (!vessel) {
        return res.status(404).json({ error: 'المركب غير موجود' });
    }
    
    const filtered = vessels.filter(v => v.id !== id);
    writeData('vessels.json', filtered);
    addLog(req.user.username, req.user.role, 'حذف مركب', `تم حذف المركب "${vessel.name}"`, req);
    res.json({ success: true });
});

// ==================== المستخدمين ====================
app.get('/api/users', authenticateToken, authorizeRole('مسؤول'), (req, res) => {
    const users = readData('users.json');
    const safeUsers = users.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
        enabled: u.enabled,
        createdAt: u.createdAt
    }));
    res.json(safeUsers);
});

app.post('/api/users', authenticateToken, authorizeRole('مسؤول'), (req, res) => {
    const { username, password, role } = req.body;
    
    if (!username || !username.trim()) {
        return res.status(400).json({ error: 'اسم المستخدم مطلوب' });
    }
    if (!password || password.length < 4) {
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
    }
    
    const users = readData('users.json');
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
    }
    
    const salt = bcrypt.genSaltSync(10);
    const newUser = {
        id: uuidv4(),
        username: username.trim(),
        password: bcrypt.hashSync(password, salt),
        role: role || 'مشاهد',
        enabled: true,
        createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    writeData('users.json', users);
    addLog(req.user.username, req.user.role, 'إضافة مستخدم', `تم إضافة المستخدم "${username}" برتبة ${role}`, req);
    res.json({ success: true });
});

app.put('/api/users/:id/password', authenticateToken, authorizeRole('مسؤول'), (req, res) => {
    const { password } = req.body;
    const userId = req.params.id;
    
    if (!password || password.length < 4) {
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
    }
    
    const users = readData('users.json');
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    const salt = bcrypt.genSaltSync(10);
    users[userIndex].password = bcrypt.hashSync(password, salt);
    writeData('users.json', users);
    addLog(req.user.username, req.user.role, 'تغيير كلمة مرور', `تم تغيير كلمة مرور المستخدم "${users[userIndex].username}"`, req);
    res.json({ success: true });
});

app.put('/api/users/:id/toggle', authenticateToken, authorizeRole('مسؤول'), (req, res) => {
    const { enabled } = req.body;
    const userId = req.params.id;
    
    const users = readData('users.json');
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    if (users[userIndex].username === 'admin' && enabled === false) {
        return res.status(403).json({ error: 'لا يمكن تعطيل المستخدم الرئيسي' });
    }
    
    users[userIndex].enabled = enabled;
    writeData('users.json', users);
    addLog(req.user.username, req.user.role, enabled ? 'تفعيل مستخدم' : 'تعطيل مستخدم', `تم ${enabled ? 'تفعيل' : 'تعطيل'} المستخدم "${users[userIndex].username}"`, req);
    res.json({ success: true });
});

app.delete('/api/users/:id', authenticateToken, authorizeRole('مسؤول'), (req, res) => {
    const userId = req.params.id;
    const users = readData('users.json');
    const user = users.find(u => u.id === userId);
    
    if (!user) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    if (user.username === 'admin') {
        return res.status(403).json({ error: 'لا يمكن حذف المستخدم الرئيسي' });
    }
    
    if (user.id === req.user.id) {
        return res.status(403).json({ error: 'لا يمكن حذف حسابك الحالي' });
    }
    
    const filtered = users.filter(u => u.id !== userId);
    writeData('users.json', filtered);
    addLog(req.user.username, req.user.role, 'حذف مستخدم', `تم حذف المستخدم "${user.username}"`, req);
    res.json({ success: true });
});

// ==================== السجلات ====================
app.get('/api/logs', authenticateToken, authorizeRole('مسؤول'), (req, res) => {
    res.json(readData('logs.json'));
});

app.post('/api/logs', (req, res) => {
    const logs = readData('logs.json');
    logs.unshift(req.body);
    if (logs.length > 1000) logs.pop();
    writeData('logs.json', logs);
    res.json({ success: true });
});

// ==================== التذاكر ====================
app.get('/api/tickets', authenticateToken, (req, res) => {
    const tickets = readData('tickets.json');
    if (req.user.role !== 'مسؤول') {
        const userTickets = tickets.filter(t => t.username === req.user.username);
        return res.json(userTickets);
    }
    res.json(tickets);
});

app.post('/api/tickets', authenticateToken, (req, res) => {
    const { subject, message } = req.body;
    
    if (!subject || !subject.trim()) {
        return res.status(400).json({ error: 'عنوان التذكرة مطلوب' });
    }
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'الرسالة مطلوبة' });
    }
    
    const tickets = readData('tickets.json');
    const newTicket = {
        id: uuidv4(),
        date: new Date().toLocaleDateString('ar-TN'),
        time: new Date().toLocaleTimeString('ar-TN'),
        username: req.user.username,
        subject: subject.trim(),
        message: message.trim(),
        status: 'قيد المعالجة',
        createdAt: new Date().toISOString()
    };
    
    tickets.push(newTicket);
    writeData('tickets.json', tickets);
    addLog(req.user.username, req.user.role, 'إرسال تذكرة', `تم إرسال تذكرة: "${subject}"`, req);
    res.json({ success: true });
});

// ==================== تصدير واستيراد ====================
app.get('/api/export', authenticateToken, authorizeRole('مسؤول'), (req, res) => {
    const data = {
        vessels: readData('vessels.json'),
        exportDate: new Date().toISOString(),
        exportedBy: req.user.username
    };
    res.json(data);
});

app.post('/api/import', authenticateToken, authorizeRole('مسؤول'), (req, res) => {
    const { vessels } = req.body;
    if (vessels && Array.isArray(vessels)) {
        writeData('vessels.json', vessels);
        addLog(req.user.username, req.user.role, 'استيراد بيانات', `تم استيراد ${vessels.length} مركب`, req);
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'بيانات غير صالحة' });
    }
});

// ==================== تشغيل السيرفر ====================
initData();

app.listen(PORT, () => {
    console.log(`\n🚀 السيرفر الآمن يعمل على http://localhost:${PORT}`);
    console.log(`📁 مجلد البيانات: ${DATA_DIR}`);
    console.log(`\n🔑 بيانات الدخول (مشفرة):`);
    console.log(`   admin / admin123 (مسؤول كامل الصلاحيات)`);
    console.log(`   editor / editor123 (محرر)`);
    console.log(`   viewer / viewer123 (مشاهد)`);
    console.log(`\n✅ JWT مفعل | ✅ تشفير كلمات المرور | ✅ حماية المسؤول | ✅ Rate Limiting\n`);
});
