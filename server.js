// server.js - خادم التطبيق بالكامل (نسخة مصححة مع صلاحيات المستخدمين)
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ملفات ثابتة
app.use(express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/pages', express.static(path.join(__dirname, 'public/pages')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// ============================================================
// 📁 قاعدة البيانات (JSON)
// ============================================================

const DB_PATH = path.join(__dirname, 'data');
const USERS_FILE = path.join(DB_PATH, 'users.json');
const VESSELS_FILE = path.join(DB_PATH, 'vessels.json');
const MAINTENANCE_FILE = path.join(DB_PATH, 'maintenance.json');
const TICKETS_FILE = path.join(DB_PATH, 'tickets.json');
const NOTES_FILE = path.join(DB_PATH, 'notes.json');

if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(DB_PATH, { recursive: true });
}

function readData(filePath, defaultData = []) {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return defaultData;
    }
}

function writeData(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch {
        return false;
    }
}

// ============================================================
// 👤 دوال المستخدمين
// ============================================================

function getUsers() {
    return readData(USERS_FILE);
}

function getUserByEmail(email) {
    return getUsers().find(u => u.email === email);
}

function getUserById(id) {
    return getUsers().find(u => u.id === id);
}

function createUser(userData) {
    const users = getUsers();
    const newUser = {
        id: uuidv4(),
        ...userData,
        createdAt: new Date().toISOString(),
        isActive: true
    };
    users.push(newUser);
    writeData(USERS_FILE, users);
    return newUser;
}

function updateUser(id, updates) {
    const users = getUsers();
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return null;
    users[index] = { ...users[index], ...updates };
    writeData(USERS_FILE, users);
    return users[index];
}

function deleteUser(id) {
    const users = getUsers();
    const filtered = users.filter(u => u.id !== id);
    if (filtered.length === users.length) return false;
    writeData(USERS_FILE, filtered);
    return true;
}

// ============================================================
// 🚢 دوال المراكب
// ============================================================

function getVessels() {
    return readData(VESSELS_FILE);
}

function getVesselById(id) {
    const vessels = getVessels();
    return vessels.find(v => v.id === id);
}

function createVessel(vesselData) {
    const vessels = getVessels();
    const newVessel = {
        id: vessels.length > 0 ? Math.max(...vessels.map(v => v.id)) + 1 : 1,
        ...vesselData,
        createdAt: new Date().toISOString()
    };
    vessels.push(newVessel);
    writeData(VESSELS_FILE, vessels);
    return newVessel;
}

function updateVessel(id, updates) {
    const vessels = getVessels();
    const index = vessels.findIndex(v => v.id === id);
    if (index === -1) return null;
    vessels[index] = { ...vessels[index], ...updates };
    writeData(VESSELS_FILE, vessels);
    return vessels[index];
}

function deleteVessel(id) {
    const vessels = getVessels();
    const filtered = vessels.filter(v => v.id !== id);
    if (filtered.length === vessels.length) return false;
    writeData(VESSELS_FILE, filtered);
    return true;
}

// ============================================================
// 🔧 دوال الصيانة
// ============================================================

function getMaintenance() {
    return readData(MAINTENANCE_FILE);
}

function getMaintenanceById(id) {
    const records = getMaintenance();
    return records.find(r => r.id === id);
}

function createMaintenance(data) {
    const records = getMaintenance();
    const newRecord = {
        id: records.length > 0 ? Math.max(...records.map(r => r.id)) + 1 : 1,
        ...data,
        createdAt: new Date().toISOString()
    };
    records.push(newRecord);
    writeData(MAINTENANCE_FILE, records);
    return newRecord;
}

function updateMaintenance(id, updates) {
    const records = getMaintenance();
    const index = records.findIndex(r => r.id === id);
    if (index === -1) return null;
    records[index] = { ...records[index], ...updates };
    writeData(MAINTENANCE_FILE, records);
    return records[index];
}

function deleteMaintenance(id) {
    const records = getMaintenance();
    const filtered = records.filter(r => r.id !== id);
    if (filtered.length === records.length) return false;
    writeData(MAINTENANCE_FILE, filtered);
    return true;
}

// ============================================================
// 🎫 دوال التذاكر
// ============================================================

function getTickets() {
    return readData(TICKETS_FILE);
}

function createTicket(data) {
    const tickets = getTickets();
    const newTicket = {
        id: tickets.length > 0 ? Math.max(...tickets.map(t => t.id)) + 1 : 1,
        ...data,
        status: data.status || 'مفتوحة',
        createdAt: new Date().toISOString()
    };
    tickets.push(newTicket);
    writeData(TICKETS_FILE, tickets);
    return newTicket;
}

function updateTicket(id, updates) {
    const tickets = getTickets();
    const index = tickets.findIndex(t => t.id === id);
    if (index === -1) return null;
    tickets[index] = { ...tickets[index], ...updates };
    writeData(TICKETS_FILE, tickets);
    return tickets[index];
}

function deleteTicket(id) {
    const tickets = getTickets();
    const filtered = tickets.filter(t => t.id !== id);
    if (filtered.length === tickets.length) return false;
    writeData(TICKETS_FILE, filtered);
    return true;
}

// ============================================================
// 📝 دوال المذكرات
// ============================================================

function getNotes() {
    return readData(NOTES_FILE);
}

function createNote(data) {
    const notes = getNotes();
    const newNote = {
        id: notes.length > 0 ? Math.max(...notes.map(n => n.id)) + 1 : 1,
        ...data,
        createdAt: new Date().toISOString()
    };
    notes.push(newNote);
    writeData(NOTES_FILE, notes);
    return newNote;
}

function updateNote(id, updates) {
    const notes = getNotes();
    const index = notes.findIndex(n => n.id === id);
    if (index === -1) return null;
    notes[index] = { ...notes[index], ...updates };
    writeData(NOTES_FILE, notes);
    return notes[index];
}

function deleteNote(id) {
    const notes = getNotes();
    const filtered = notes.filter(n => n.id !== id);
    if (filtered.length === notes.length) return false;
    writeData(NOTES_FILE, filtered);
    return true;
}

// ============================================================
// 🔐 دوال المصادقة
// ============================================================

function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: '❌ الرجاء تسجيل الدخول' });
    }
    
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ success: false, error: '❌ توكن غير صالح' });
    }
    
    req.user = decoded;
    next();
}

// تهيئة المستخدمين الافتراضيين
function initDefaultUsers() {
    const users = getUsers();
    if (users.length === 0) {
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync('123456', salt);
        
        const defaultUsers = [
            {
                id: uuidv4(),
                name: 'مدير النظام',
                email: 'admin',
                password: hashedPassword,
                role: 'مسؤول',
                isActive: true,
                createdAt: new Date().toISOString()
            },
            {
                id: uuidv4(),
                name: 'مدير العمليات',
                email: 'manager',
                password: hashedPassword,
                role: 'مشرف',
                isActive: true,
                createdAt: new Date().toISOString()
            },
            {
                id: uuidv4(),
                name: 'محرر',
                email: 'editor',
                password: hashedPassword,
                role: 'محرر',
                isActive: true,
                createdAt: new Date().toISOString()
            },
            {
                id: uuidv4(),
                name: 'مشاهد',
                email: 'viewer',
                password: hashedPassword,
                role: 'مشاهد',
                isActive: true,
                createdAt: new Date().toISOString()
            }
        ];
        writeData(USERS_FILE, defaultUsers);
        console.log('✅ تم إنشاء المستخدمين الافتراضيين:');
        console.log('   admin / 123456 (مسؤول)');
        console.log('   manager / 123456 (مشرف)');
        console.log('   editor / 123456 (محرر)');
        console.log('   viewer / 123456 (مشاهد)');
    }
}

// ============================================================
// 🚀 API Routes
// ============================================================

// ---------- المصادقة ----------
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ success: false, error: '❌ البريد الإلكتروني وكلمة المرور مطلوبة' });
    }
    
    const user = getUserByEmail(email);
    if (!user) {
        return res.status(401).json({ success: false, error: '❌ البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }
    
    if (!bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ success: false, error: '❌ البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }
    
    if (!user.isActive) {
        return res.status(401).json({ success: false, error: '❌ الحساب معطل' });
    }
    
    const token = generateToken(user);
    const { password: _, ...userWithoutPassword } = user;
    
    res.json({
        success: true,
        token: token,
        user: userWithoutPassword
    });
});

app.post('/api/auth/change-password', authenticate, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const user = getUserById(req.user.id);
    
    if (!user) {
        return res.status(404).json({ success: false, error: '❌ المستخدم غير موجود' });
    }
    
    if (!bcrypt.compareSync(currentPassword, user.password)) {
        return res.status(401).json({ success: false, error: '❌ كلمة المرور الحالية غير صحيحة' });
    }
    
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword, salt);
    updateUser(user.id, { password: hashedPassword });
    
    res.json({ success: true, message: '✅ تم تغيير كلمة المرور بنجاح' });
});

// ---------- المستخدمين (مع صلاحيات) ----------
app.get('/api/users', authenticate, (req, res) => {
    const users = getUsers().map(({ password, ...user }) => user);
    res.json(users);
});

app.post('/api/users', authenticate, (req, res) => {
    // ✅ التحقق من الصلاحية: فقط المسؤول يمكنه إضافة مستخدمين
    const currentUser = getUserById(req.user.id);
    if (!currentUser || currentUser.role !== 'مسؤول') {
        return res.status(403).json({ 
            success: false, 
            error: '❌ فقط المسؤول يمكنه إضافة مستخدمين' 
        });
    }

    const { name, email, password, role } = req.body;
    
    if (!name || !email || !password) {
        return res.status(400).json({ success: false, error: '❌ الاسم والبريد وكلمة المرور مطلوبة' });
    }
    
    if (getUserByEmail(email)) {
        return res.status(400).json({ success: false, error: '❌ البريد الإلكتروني مستخدم بالفعل' });
    }
    
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);
    
    const user = createUser({
        name,
        email,
        password: hashedPassword,
        role: role || 'مشاهد'
    });
    
    const { password: _, ...userWithoutPassword } = user;
    res.json({ success: true, user: userWithoutPassword });
});

app.put('/api/users/:id', authenticate, (req, res) => {
    // ✅ التحقق من الصلاحية: مسؤول أو مشرف يمكنه التعديل
    const currentUser = getUserById(req.user.id);
    if (!currentUser || (currentUser.role !== 'مسؤول' && currentUser.role !== 'مشرف')) {
        return res.status(403).json({ 
            success: false, 
            error: '❌ ليس لديك صلاحية لتعديل المستخدمين' 
        });
    }

    const { id } = req.params;
    const updates = req.body;
    
    if (updates.password) {
        const salt = bcrypt.genSaltSync(10);
        updates.password = bcrypt.hashSync(updates.password, salt);
    }
    
    const user = updateUser(id, updates);
    if (!user) {
        return res.status(404).json({ success: false, error: '❌ المستخدم غير موجود' });
    }
    
    const { password: _, ...userWithoutPassword } = user;
    res.json({ success: true, user: userWithoutPassword });
});

app.delete('/api/users/:id', authenticate, (req, res) => {
    // ✅ فقط المسؤول يمكنه الحذف
    const currentUser = getUserById(req.user.id);
    if (!currentUser || currentUser.role !== 'مسؤول') {
        return res.status(403).json({ 
            success: false, 
            error: '❌ فقط المسؤول يمكنه حذف المستخدمين' 
        });
    }

    const { id } = req.params;
    
    if (id === req.user.id) {
        return res.status(400).json({ success: false, error: '❌ لا يمكنك حذف حسابك بنفسك' });
    }
    
    const deleted = deleteUser(id);
    if (!deleted) {
        return res.status(404).json({ success: false, error: '❌ المستخدم غير موجود' });
    }
    
    res.json({ success: true });
});

// ---------- المراكب ----------
app.get('/api/vessels', (req, res) => {
    res.json(getVessels());
});

app.get('/api/vessels/:id', (req, res) => {
    const vessel = getVesselById(parseInt(req.params.id));
    if (!vessel) {
        return res.status(404).json({ success: false, error: '❌ المركب غير موجود' });
    }
    res.json(vessel);
});

app.post('/api/vessels', authenticate, (req, res) => {
    const vessel = createVessel(req.body);
    res.json({ success: true, vessel });
});

app.put('/api/vessels/:id', authenticate, (req, res) => {
    const vessel = updateVessel(parseInt(req.params.id), req.body);
    if (!vessel) {
        return res.status(404).json({ success: false, error: '❌ المركب غير موجود' });
    }
    res.json({ success: true, vessel });
});

app.delete('/api/vessels/:id', authenticate, (req, res) => {
    const deleted = deleteVessel(parseInt(req.params.id));
    if (!deleted) {
        return res.status(404).json({ success: false, error: '❌ المركب غير موجود' });
    }
    res.json({ success: true });
});

// ---------- الصيانة ----------
app.get('/api/maintenance', (req, res) => {
    res.json(getMaintenance());
});

app.get('/api/maintenance/:id', (req, res) => {
    const record = getMaintenanceById(parseInt(req.params.id));
    if (!record) {
        return res.status(404).json({ success: false, error: '❌ السجل غير موجود' });
    }
    res.json(record);
});

app.post('/api/maintenance', authenticate, (req, res) => {
    const record = createMaintenance(req.body);
    res.json({ success: true, record });
});

app.put('/api/maintenance/:id', authenticate, (req, res) => {
    const record = updateMaintenance(parseInt(req.params.id), req.body);
    if (!record) {
        return res.status(404).json({ success: false, error: '❌ السجل غير موجود' });
    }
    res.json({ success: true, record });
});

app.delete('/api/maintenance/:id', authenticate, (req, res) => {
    const deleted = deleteMaintenance(parseInt(req.params.id));
    if (!deleted) {
        return res.status(404).json({ success: false, error: '❌ السجل غير موجود' });
    }
    res.json({ success: true });
});

// ---------- التذاكر ----------
app.get('/api/tickets', (req, res) => {
    res.json(getTickets());
});

app.post('/api/tickets', authenticate, (req, res) => {
    const ticket = createTicket(req.body);
    res.json({ success: true, ticket });
});

app.put('/api/tickets/:id', authenticate, (req, res) => {
    const ticket = updateTicket(parseInt(req.params.id), req.body);
    if (!ticket) {
        return res.status(404).json({ success: false, error: '❌ التذكرة غير موجودة' });
    }
    res.json({ success: true, ticket });
});

app.delete('/api/tickets/:id', authenticate, (req, res) => {
    const deleted = deleteTicket(parseInt(req.params.id));
    if (!deleted) {
        return res.status(404).json({ success: false, error: '❌ التذكرة غير موجودة' });
    }
    res.json({ success: true });
});

// ---------- المذكرات ----------
app.get('/api/notes', (req, res) => {
    res.json(getNotes());
});

app.post('/api/notes', authenticate, (req, res) => {
    const note = createNote(req.body);
    res.json({ success: true, note });
});

app.put('/api/notes/:id', authenticate, (req, res) => {
    const note = updateNote(parseInt(req.params.id), req.body);
    if (!note) {
        return res.status(404).json({ success: false, error: '❌ المذكرة غير موجودة' });
    }
    res.json({ success: true, note });
});

app.delete('/api/notes/:id', authenticate, (req, res) => {
    const deleted = deleteNote(parseInt(req.params.id));
    if (!deleted) {
        return res.status(404).json({ success: false, error: '❌ المذكرة غير موجودة' });
    }
    res.json({ success: true });
});

// ============================================================
// 📄 تقديم الصفحات
// ============================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/pages/:page', (req, res) => {
    const page = req.params.page;
    const filePath = path.join(__dirname, 'public', 'pages', `${page}.html`);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Page not found');
    }
});

// ============================================================
// 🚀 تشغيل الخادم
// ============================================================

initDefaultUsers();

app.listen(PORT, () => {
    console.log('========================================');
    console.log('🚀 نظام إدارة الأسطول البحري');
    console.log('========================================');
    console.log(`✅ الخادم يعمل على: http://localhost:${PORT}`);
    console.log('========================================');
    console.log('📝 حسابات الدخول التجريبية:');
    console.log('   👑 admin   / 123456 (مسؤول كامل)');
    console.log('   ⭐ manager / 123456 (مشرف)');
    console.log('   ✏️ editor  / 123456 (محرر)');
    console.log('   👀 viewer  / 123456 (مشاهد)');
    console.log('========================================');
    console.log('📁 قاعدة البيانات: data/');
    console.log('========================================');
});
