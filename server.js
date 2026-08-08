// ============================================================
// 🚀 server.js - خادم التطبيق المتكامل مع MongoDB
// ============================================================

console.log('🚀 بدء تشغيل الخادم...');

// ============================================================
// 📦 استيراد المكتبات
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
require('dotenv').config();

// ============================================================
// ⚙️ إعدادات البيئة
// ============================================================

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/naval_fleet';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================================
// 🚀 إنشاء تطبيق Express
// ============================================================

const app = express();

// ============================================================
// 🔧 Middleware
// ============================================================

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5500',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// تسجيل الطلبات
app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.path}`);
    next();
});

// ============================================================
// 📁 ملفات ثابتة
// ============================================================

app.use(express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/pages', express.static(path.join(__dirname, 'public/pages')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// ============================================================
// 🗄️ اتصال MongoDB
// ============================================================

// نماذج MongoDB
const User = require('./models/User');
const Vessel = require('./models/Vessel');
const Maintenance = require('./models/Maintenance');
const Ticket = require('./models/Ticket');
const Note = require('./models/Note');
const Log = require('./models/Log');

// الاتصال بقاعدة البيانات
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000
})
.then(() => {
    console.log('✅ MongoDB Connected Successfully');
    initDefaultUsers();
})
.catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
    console.log('⚠️ تشغيل في وضع JSON Fallback');
    initJsonFallback();
});

// مراقبة الاتصال
mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB Error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB Disconnected');
});

// ============================================================
// 📁 قاعدة البيانات (JSON Fallback)
// ============================================================

const DB_PATH = path.join(__dirname, 'data');
const USERS_FILE = path.join(DB_PATH, 'users.json');

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
// 🔐 دوال المصادقة
// ============================================================

function generateToken(user) {
    return jwt.sign(
        { 
            id: user._id || user.id, 
            email: user.email, 
            role: user.role,
            name: user.name
        },
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
        return res.status(401).json({ success: false, error: 'Unauthorized - No token provided' });
    }
    
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ success: false, error: 'Unauthorized - Invalid token' });
    }
    
    req.user = decoded;
    next();
}

// ============================================================
// 👤 تهيئة المستخدمين الافتراضيين
// ============================================================

async function initDefaultUsers() {
    try {
        const count = await User.countDocuments();
        if (count === 0) {
            const salt = bcrypt.genSaltSync(10);
            const hashedPassword = bcrypt.hashSync('123456', salt);
            
            const defaultUsers = [
                {
                    name: 'مدير النظام',
                    email: 'admin',
                    password: hashedPassword,
                    role: 'مسؤول',
                    isActive: true
                },
                {
                    name: 'مدير العمليات',
                    email: 'manager',
                    password: hashedPassword,
                    role: 'مشرف',
                    isActive: true
                },
                {
                    name: 'محرر',
                    email: 'editor',
                    password: hashedPassword,
                    role: 'محرر',
                    isActive: true
                },
                {
                    name: 'مشاهد',
                    email: 'viewer',
                    password: hashedPassword,
                    role: 'مشاهد',
                    isActive: true
                }
            ];
            
            await User.insertMany(defaultUsers);
            console.log('✅ تم إنشاء المستخدمين الافتراضيين في MongoDB:');
            console.log('   👑 admin   / 123456 (مسؤول)');
            console.log('   ⭐ manager / 123456 (مشرف)');
            console.log('   ✏️ editor  / 123456 (محرر)');
            console.log('   👀 viewer  / 123456 (مشاهد)');
        }
    } catch (error) {
        console.error('❌ Error initializing default users:', error);
    }
}

function initJsonFallback() {
    const users = readData(USERS_FILE);
    if (users.length === 0) {
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync('123456', salt);
        
        const defaultUsers = [
            { id: uuidv4(), name: 'مدير النظام', email: 'admin', password: hashedPassword, role: 'مسؤول', isActive: true, createdAt: new Date().toISOString() },
            { id: uuidv4(), name: 'مدير العمليات', email: 'manager', password: hashedPassword, role: 'مشرف', isActive: true, createdAt: new Date().toISOString() },
            { id: uuidv4(), name: 'محرر', email: 'editor', password: hashedPassword, role: 'محرر', isActive: true, createdAt: new Date().toISOString() },
            { id: uuidv4(), name: 'مشاهد', email: 'viewer', password: hashedPassword, role: 'مشاهد', isActive: true, createdAt: new Date().toISOString() }
        ];
        writeData(USERS_FILE, defaultUsers);
        console.log('✅ تم إنشاء المستخدمين الافتراضيين (JSON Fallback)');
    }
}

// ============================================================
// 🚢 دوال المراكب (MongoDB)
// ============================================================

const getVessels = async () => {
    try {
        return await Vessel.find().sort({ createdAt: -1 });
    } catch {
        return [];
    }
};

const getVesselById = async (id) => {
    try {
        return await Vessel.findById(id);
    } catch {
        return null;
    }
};

const createVessel = async (data) => {
    const vessel = new Vessel(data);
    return await vessel.save();
};

const updateVessel = async (id, data) => {
    return await Vessel.findByIdAndUpdate(id, data, { new: true });
};

const deleteVessel = async (id) => {
    return await Vessel.findByIdAndDelete(id);
};

// ============================================================
// 🔧 دوال الصيانة (MongoDB)
// ============================================================

const getMaintenance = async () => {
    try {
        return await Maintenance.find().sort({ createdAt: -1 });
    } catch {
        return [];
    }
};

const createMaintenance = async (data) => {
    const record = new Maintenance(data);
    return await record.save();
};

const updateMaintenance = async (id, data) => {
    return await Maintenance.findByIdAndUpdate(id, data, { new: true });
};

const deleteMaintenance = async (id) => {
    return await Maintenance.findByIdAndDelete(id);
};

// ============================================================
// 🎫 دوال التذاكر (MongoDB)
// ============================================================

const getTickets = async () => {
    try {
        return await Ticket.find().sort({ createdAt: -1 });
    } catch {
        return [];
    }
};

const createTicket = async (data) => {
    const ticket = new Ticket(data);
    return await ticket.save();
};

const updateTicket = async (id, data) => {
    return await Ticket.findByIdAndUpdate(id, data, { new: true });
};

// ============================================================
// 📝 دوال المذكرات (MongoDB)
// ============================================================

const getNotes = async () => {
    try {
        return await Note.find().sort({ createdAt: -1 });
    } catch {
        return [];
    }
};

const createNote = async (data) => {
    const note = new Note(data);
    return await note.save();
};

const updateNote = async (id, data) => {
    return await Note.findByIdAndUpdate(id, data, { new: true });
};

const deleteNote = async (id) => {
    return await Note.findByIdAndDelete(id);
};

// ============================================================
// 🚀 API Routes
// ============================================================

// ---------- المصادقة ----------
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }
        
        // البحث عن المستخدم
        let user = await User.findOne({ email });
        
        // إذا لم يوجد في MongoDB، جرب JSON
        if (!user) {
            const users = readData(USERS_FILE);
            user = users.find(u => u.email === email);
            if (user) {
                // تحويل إلى كائن شبيه بـ MongoDB
                user = {
                    ...user,
                    _id: user.id,
                    comparePassword: (pwd) => bcrypt.compareSync(pwd, user.password)
                };
            }
        }
        
        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
        
        // التحقق من كلمة المرور
        let passwordMatch;
        if (user.comparePassword) {
            passwordMatch = user.comparePassword(password);
        } else {
            passwordMatch = bcrypt.compareSync(password, user.password);
        }
        
        if (!passwordMatch) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
        
        if (!user.isActive) {
            return res.status(401).json({ success: false, error: 'Account is disabled' });
        }
        
        // تحديث آخر تسجيل دخول
        if (user._id && user.updateOne) {
            await User.updateOne({ _id: user._id }, { lastLogin: new Date() });
        }
        
        const token = generateToken(user);
        
        // إزالة كلمة المرور من الاستجابة
        const userData = {
            id: user._id || user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            isActive: user.isActive
        };
        
        res.json({
            success: true,
            token: token,
            user: userData
        });
    } catch (error) {
        console.error('❌ Login Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/auth/me', authenticate, async (req, res) => {
    try {
        let user = await User.findById(req.user.id);
        if (!user) {
            const users = readData(USERS_FILE);
            user = users.find(u => u.id === req.user.id);
        }
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        const userData = {
            id: user._id || user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            isActive: user.isActive
        };
        
        res.json({ success: true, user: userData });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---------- المستخدمين ----------
app.get('/api/users', authenticate, async (req, res) => {
    try {
        let users = await User.find().select('-password');
        if (users.length === 0) {
            // Fallback to JSON
            const jsonUsers = readData(USERS_FILE);
            users = jsonUsers.map(({ password, ...user }) => user);
        }
        res.json(users);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/users', authenticate, async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({ success: false, error: 'Name, email and password required' });
        }
        
        // التحقق من وجود المستخدم
        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(400).json({ success: false, error: 'Email already exists' });
        }
        
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync(password, salt);
        
        const user = new User({
            name,
            email,
            password: hashedPassword,
            role: role || 'مشاهد'
        });
        
        await user.save();
        
        const { password: _, ...userWithoutPassword } = user.toObject();
        res.json({ success: true, user: userWithoutPassword });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/users/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        if (updates.password) {
            const salt = bcrypt.genSaltSync(10);
            updates.password = bcrypt.hashSync(updates.password, salt);
        }
        
        const user = await User.findByIdAndUpdate(id, updates, { new: true }).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/users/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        
        if (id === req.user.id) {
            return res.status(400).json({ success: false, error: 'Cannot delete yourself' });
        }
        
        const user = await User.findByIdAndDelete(id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---------- المراكب ----------
app.get('/api/vessels', async (req, res) => {
    try {
        const vessels = await getVessels();
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/vessels/:id', async (req, res) => {
    try {
        const vessel = await getVesselById(req.params.id);
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'Vessel not found' });
        }
        res.json(vessel);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/vessels', authenticate, async (req, res) => {
    try {
        const vessel = await createVessel(req.body);
        res.json({ success: true, vessel });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/vessels/:id', authenticate, async (req, res) => {
    try {
        const vessel = await updateVessel(req.params.id, req.body);
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'Vessel not found' });
        }
        res.json({ success: true, vessel });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/vessels/:id', authenticate, async (req, res) => {
    try {
        const vessel = await deleteVessel(req.params.id);
        if (!vessel) {
            return res.status(404).json({ success: false, error: 'Vessel not found' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---------- الصيانة ----------
app.get('/api/maintenance', async (req, res) => {
    try {
        const records = await getMaintenance();
        res.json(records);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/maintenance', authenticate, async (req, res) => {
    try {
        const record = await createMaintenance(req.body);
        res.json({ success: true, record });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/maintenance/:id', authenticate, async (req, res) => {
    try {
        const record = await updateMaintenance(req.params.id, req.body);
        if (!record) {
            return res.status(404).json({ success: false, error: 'Record not found' });
        }
        res.json({ success: true, record });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/maintenance/:id', authenticate, async (req, res) => {
    try {
        const record = await deleteMaintenance(req.params.id);
        if (!record) {
            return res.status(404).json({ success: false, error: 'Record not found' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---------- التذاكر ----------
app.get('/api/tickets', async (req, res) => {
    try {
        const tickets = await getTickets();
        res.json(tickets);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/tickets', authenticate, async (req, res) => {
    try {
        const ticket = await createTicket(req.body);
        res.json({ success: true, ticket });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/tickets/:id', authenticate, async (req, res) => {
    try {
        const ticket = await updateTicket(req.params.id, req.body);
        if (!ticket) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }
        res.json({ success: true, ticket });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---------- المذكرات ----------
app.get('/api/notes', async (req, res) => {
    try {
        const notes = await getNotes();
        res.json(notes);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/notes', authenticate, async (req, res) => {
    try {
        const note = await createNote(req.body);
        res.json({ success: true, note });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/notes/:id', authenticate, async (req, res) => {
    try {
        const note = await updateNote(req.params.id, req.body);
        if (!note) {
            return res.status(404).json({ success: false, error: 'Note not found' });
        }
        res.json({ success: true, note });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/notes/:id', authenticate, async (req, res) => {
    try {
        const note = await deleteNote(req.params.id);
        if (!note) {
            return res.status(404).json({ success: false, error: 'Note not found' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
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

app.listen(PORT, () => {
    console.log('========================================');
    console.log('🚀 نظام إدارة الأسطول البحري');
    console.log('========================================');
    console.log(`✅ الخادم يعمل على: http://localhost:${PORT}`);
    console.log(`📡 البيئة: ${NODE_ENV}`);
    console.log('========================================');
    console.log('📝 حسابات الدخول التجريبية:');
    console.log('   👑 admin   / 123456 (مسؤول كامل)');
    console.log('   ⭐ manager / 123456 (مشرف)');
    console.log('   ✏️ editor  / 123456 (محرر)');
    console.log('   👀 viewer  / 123456 (مشاهد)');
    console.log('========================================');
    if (mongoose.connection.readyState === 1) {
        console.log('🗄️ قاعدة البيانات: MongoDB ✅');
    } else {
        console.log('🗄️ قاعدة البيانات: JSON (Fallback)');
    }
    console.log('========================================');
});

// ============================================================
// 🛑 إغلاق الخادم بشكل آمن
// ============================================================

process.on('SIGINT', async () => {
    console.log('🛑 إغلاق الخادم...');
    await mongoose.disconnect();
    console.log('✅ تم إغلاق الاتصال بقاعدة البيانات');
    process.exit(0);
});
