// server.js - نسخة متصلة بـ MongoDB
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// تحميل المتغيرات البيئية
dotenv.config();

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
// 📁 الاتصال بقاعدة البيانات MongoDB
// ============================================================

let useMongoDB = false;

mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log('✅ MongoDB connected successfully');
    useMongoDB = true;
    initDefaultUsers();
})
.catch(err => {
    console.error('❌ MongoDB connection error:', err);
    console.log('⚠️ Using JSON files as fallback...');
    useMongoDB = false;
    initDefaultUsersJSON();
});

// ============================================================
// 📦 نماذج MongoDB (Schemas)
// ============================================================

// ----- نموذج المستخدم -----
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['مسؤول', 'مشرف', 'محرر', 'مشاهد'], default: 'مشاهد' },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date }
});

UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

UserSchema.methods.comparePassword = async function(password) {
    return await bcrypt.compare(password, this.password);
};

const User = mongoose.model('User', UserSchema);

// ----- نموذج المركب -----
const VesselSchema = new mongoose.Schema({
    name: { type: String, required: true },
    num: { type: String },
    len: { type: Number, default: 0 },
    cat: { type: String, default: 'البروق' },
    reg: { type: String, default: 'الشمال' },
    zone: { type: String },
    port: { type: String },
    supp: { type: String },
    stat: { type: String, enum: ['صالح', 'معطب', 'صيانة'], default: 'صالح' },
    break: { type: String, default: '' },
    fDate: { type: String },
    eDate: { type: String },
    ref: { type: String },
    repairer: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const Vessel = mongoose.model('Vessel', VesselSchema);

// ----- نموذج الصيانة -----
const MaintenanceSchema = new mongoose.Schema({
    vesselId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel', required: true },
    vesselName: { type: String },
    type: { type: String, enum: ['كبرى', 'دورية', 'عادية', 'طارئة'], default: 'عادية' },
    unit: { type: String },
    technician: { type: String, required: true },
    description: { type: String, required: true },
    repair: { type: String, default: '' },
    faultType: { type: String, default: 'أخرى' },
    cost: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    parts: [{ name: String, quantity: Number, price: Number }],
    status: { type: String, enum: ['قيد الإنجاز', 'مكتملة', 'ملغية'], default: 'قيد الإنجاز' },
    date: { type: String },
    startDate: { type: String },
    endDate: { type: String },
    createdBy: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const Maintenance = mongoose.model('Maintenance', MaintenanceSchema);

// ----- نموذج التذكرة -----
const TicketSchema = new mongoose.Schema({
    subject: { type: String, required: true },
    message: { type: String, required: true },
    priority: { type: String, enum: ['منخفضة', 'متوسطة', 'عالية', 'عاجلة'], default: 'متوسطة' },
    status: { type: String, enum: ['مفتوحة', 'قيد المعالجة', 'مغلقة'], default: 'مفتوحة' },
    userName: { type: String },
    date: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const Ticket = mongoose.model('Ticket', TicketSchema);

// ----- نموذج المذكرة -----
const NoteSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    createdBy: { type: String },
    date: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const Note = mongoose.model('Note', NoteSchema);

// ============================================================
// 📁 دوال JSON (للاحتياط)
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
// 🔐 دوال المصادقة
// ============================================================

function generateToken(user) {
    return jwt.sign(
        { id: user._id || user.id, email: user.email, role: user.role },
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
    
    // دعم التوكن التجريبي
    if (token.startsWith('demo-token-')) {
        req.user = { id: 'demo-user-id', email: 'admin@example.com', role: 'مسؤول' };
        return next();
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ success: false, error: '❌ توكن غير صالح' });
    }
    
    req.user = decoded;
    next();
}

// ============================================================
// 🚀 دوال API
// ============================================================

// ---------- المستخدمين ----------
app.get('/api/users', authenticate, async (req, res) => {
    try {
        if (useMongoDB) {
            const users = await User.find().select('-password');
            res.json(users);
        } else {
            const users = readData(USERS_FILE).map(({ password, ...user }) => user);
            res.json(users);
        }
    } catch (error) {
        res.status(500).json({ error: '❌ خطأ في تحميل المستخدمين' });
    }
});

app.post('/api/users', authenticate, async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({ success: false, error: '❌ جميع الحقول مطلوبة' });
        }
        
        if (useMongoDB) {
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.status(400).json({ success: false, error: '❌ البريد الإلكتروني مستخدم' });
            }
            
            const user = new User({ name, email, password, role: role || 'مشاهد' });
            await user.save();
            
            const { password: _, ...userWithoutPassword } = user.toObject();
            res.json({ success: true, user: userWithoutPassword });
        } else {
            const users = readData(USERS_FILE);
            if (users.find(u => u.email === email)) {
                return res.status(400).json({ success: false, error: '❌ البريد الإلكتروني مستخدم' });
            }
            
            const salt = bcrypt.genSaltSync(10);
            const hashedPassword = bcrypt.hashSync(password, salt);
            
            const newUser = {
                id: Date.now().toString(),
                name,
                email,
                password: hashedPassword,
                role: role || 'مشاهد',
                isActive: true,
                createdAt: new Date().toISOString()
            };
            users.push(newUser);
            writeData(USERS_FILE, users);
            
            const { password: _, ...userWithoutPassword } = newUser;
            res.json({ success: true, user: userWithoutPassword });
        }
    } catch (error) {
        console.error('Add user error:', error);
        res.status(500).json({ success: false, error: '❌ خطأ في إضافة المستخدم' });
    }
});

app.put('/api/users/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        if (useMongoDB) {
            if (updates.password) {
                updates.password = await bcrypt.hash(updates.password, 10);
            }
            const user = await User.findByIdAndUpdate(id, updates, { new: true }).select('-password');
            if (!user) {
                return res.status(404).json({ success: false, error: '❌ المستخدم غير موجود' });
            }
            res.json({ success: true, user });
        } else {
            const users = readData(USERS_FILE);
            const index = users.findIndex(u => u.id === id);
            if (index === -1) {
                return res.status(404).json({ success: false, error: '❌ المستخدم غير موجود' });
            }
            if (updates.password) {
                const salt = bcrypt.genSaltSync(10);
                updates.password = bcrypt.hashSync(updates.password, salt);
            }
            users[index] = { ...users[index], ...updates };
            writeData(USERS_FILE, users);
            const { password, ...userWithoutPassword } = users[index];
            res.json({ success: true, user: userWithoutPassword });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في تحديث المستخدم' });
    }
});

app.delete('/api/users/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        
        if (id === req.user.id) {
            return res.status(400).json({ success: false, error: '❌ لا يمكنك حذف حسابك' });
        }
        
        if (useMongoDB) {
            const user = await User.findByIdAndDelete(id);
            if (!user) {
                return res.status(404).json({ success: false, error: '❌ المستخدم غير موجود' });
            }
            res.json({ success: true });
        } else {
            const users = readData(USERS_FILE);
            const filtered = users.filter(u => u.id !== id);
            if (filtered.length === users.length) {
                return res.status(404).json({ success: false, error: '❌ المستخدم غير موجود' });
            }
            writeData(USERS_FILE, filtered);
            res.json({ success: true });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في حذف المستخدم' });
    }
});

// ---------- المراكب ----------
app.get('/api/vessels', async (req, res) => {
    try {
        if (useMongoDB) {
            const vessels = await Vessel.find().sort({ createdAt: -1 });
            res.json(vessels);
        } else {
            res.json(readData(VESSELS_FILE));
        }
    } catch (error) {
        res.status(500).json([]);
    }
});

app.post('/api/vessels', authenticate, async (req, res) => {
    try {
        if (useMongoDB) {
            const vessel = new Vessel(req.body);
            await vessel.save();
            res.json({ success: true, vessel });
        } else {
            const vessels = readData(VESSELS_FILE);
            const newVessel = {
                id: vessels.length > 0 ? Math.max(...vessels.map(v => v.id)) + 1 : 1,
                ...req.body,
                createdAt: new Date().toISOString()
            };
            vessels.push(newVessel);
            writeData(VESSELS_FILE, vessels);
            res.json({ success: true, vessel: newVessel });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في إضافة المركب' });
    }
});

app.put('/api/vessels/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        if (useMongoDB) {
            const vessel = await Vessel.findByIdAndUpdate(id, req.body, { new: true });
            if (!vessel) {
                return res.status(404).json({ success: false, error: '❌ المركب غير موجود' });
            }
            res.json({ success: true, vessel });
        } else {
            const vessels = readData(VESSELS_FILE);
            const index = vessels.findIndex(v => v.id === parseInt(id));
            if (index === -1) {
                return res.status(404).json({ success: false, error: '❌ المركب غير موجود' });
            }
            vessels[index] = { ...vessels[index], ...req.body };
            writeData(VESSELS_FILE, vessels);
            res.json({ success: true, vessel: vessels[index] });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في تحديث المركب' });
    }
});

app.delete('/api/vessels/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        if (useMongoDB) {
            const vessel = await Vessel.findByIdAndDelete(id);
            if (!vessel) {
                return res.status(404).json({ success: false, error: '❌ المركب غير موجود' });
            }
            res.json({ success: true });
        } else {
            const vessels = readData(VESSELS_FILE);
            const filtered = vessels.filter(v => v.id !== parseInt(id));
            if (filtered.length === vessels.length) {
                return res.status(404).json({ success: false, error: '❌ المركب غير موجود' });
            }
            writeData(VESSELS_FILE, filtered);
            res.json({ success: true });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في حذف المركب' });
    }
});

// ---------- الصيانة ----------
app.get('/api/maintenance', async (req, res) => {
    try {
        if (useMongoDB) {
            const records = await Maintenance.find().sort({ createdAt: -1 });
            res.json(records);
        } else {
            res.json(readData(MAINTENANCE_FILE));
        }
    } catch (error) {
        res.status(500).json([]);
    }
});

app.post('/api/maintenance', authenticate, async (req, res) => {
    try {
        if (useMongoDB) {
            const record = new Maintenance(req.body);
            await record.save();
            res.json({ success: true, record });
        } else {
            const records = readData(MAINTENANCE_FILE);
            const newRecord = {
                id: records.length > 0 ? Math.max(...records.map(r => r.id)) + 1 : 1,
                ...req.body,
                createdAt: new Date().toISOString()
            };
            records.push(newRecord);
            writeData(MAINTENANCE_FILE, records);
            res.json({ success: true, record: newRecord });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في إضافة سجل الصيانة' });
    }
});

app.put('/api/maintenance/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        if (useMongoDB) {
            const record = await Maintenance.findByIdAndUpdate(id, req.body, { new: true });
            if (!record) {
                return res.status(404).json({ success: false, error: '❌ السجل غير موجود' });
            }
            res.json({ success: true, record });
        } else {
            const records = readData(MAINTENANCE_FILE);
            const index = records.findIndex(r => r.id === parseInt(id));
            if (index === -1) {
                return res.status(404).json({ success: false, error: '❌ السجل غير موجود' });
            }
            records[index] = { ...records[index], ...req.body };
            writeData(MAINTENANCE_FILE, records);
            res.json({ success: true, record: records[index] });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في تحديث سجل الصيانة' });
    }
});

app.delete('/api/maintenance/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        if (useMongoDB) {
            const record = await Maintenance.findByIdAndDelete(id);
            if (!record) {
                return res.status(404).json({ success: false, error: '❌ السجل غير موجود' });
            }
            res.json({ success: true });
        } else {
            const records = readData(MAINTENANCE_FILE);
            const filtered = records.filter(r => r.id !== parseInt(id));
            if (filtered.length === records.length) {
                return res.status(404).json({ success: false, error: '❌ السجل غير موجود' });
            }
            writeData(MAINTENANCE_FILE, filtered);
            res.json({ success: true });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في حذف سجل الصيانة' });
    }
});

// ---------- التذاكر ----------
app.get('/api/tickets', async (req, res) => {
    try {
        if (useMongoDB) {
            const tickets = await Ticket.find().sort({ createdAt: -1 });
            res.json(tickets);
        } else {
            res.json(readData(TICKETS_FILE));
        }
    } catch (error) {
        res.status(500).json([]);
    }
});

app.post('/api/tickets', authenticate, async (req, res) => {
    try {
        if (useMongoDB) {
            const ticket = new Ticket(req.body);
            await ticket.save();
            res.json({ success: true, ticket });
        } else {
            const tickets = readData(TICKETS_FILE);
            const newTicket = {
                id: tickets.length > 0 ? Math.max(...tickets.map(t => t.id)) + 1 : 1,
                ...req.body,
                createdAt: new Date().toISOString()
            };
            tickets.push(newTicket);
            writeData(TICKETS_FILE, tickets);
            res.json({ success: true, ticket: newTicket });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في إضافة التذكرة' });
    }
});

// ---------- المذكرات ----------
app.get('/api/notes', async (req, res) => {
    try {
        if (useMongoDB) {
            const notes = await Note.find().sort({ createdAt: -1 });
            res.json(notes);
        } else {
            res.json(readData(NOTES_FILE));
        }
    } catch (error) {
        res.status(500).json([]);
    }
});

app.post('/api/notes', authenticate, async (req, res) => {
    try {
        if (useMongoDB) {
            const note = new Note(req.body);
            await note.save();
            res.json({ success: true, note });
        } else {
            const notes = readData(NOTES_FILE);
            const newNote = {
                id: notes.length > 0 ? Math.max(...notes.map(n => n.id)) + 1 : 1,
                ...req.body,
                createdAt: new Date().toISOString()
            };
            notes.push(newNote);
            writeData(NOTES_FILE, notes);
            res.json({ success: true, note: newNote });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '❌ خطأ في إضافة المذكرة' });
    }
});

// ---------- المصادقة ----------
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ success: false, error: '❌ البريد وكلمة المرور مطلوبة' });
        }
        
        let user;
        if (useMongoDB) {
            user = await User.findOne({ email });
            if (!user) {
                return res.status(401).json({ success: false, error: '❌ بيانات غير صحيحة' });
            }
            const isValid = await user.comparePassword(password);
            if (!isValid) {
                return res.status(401).json({ success: false, error: '❌ بيانات غير صحيحة' });
            }
            if (!user.isActive) {
                return res.status(401).json({ success: false, error: '❌ الحساب معطل' });
            }
            user.lastLogin = new Date();
            await user.save();
            
            const token = generateToken(user);
            const { password: _, ...userWithoutPassword } = user.toObject();
            res.json({ success: true, token, user: userWithoutPassword });
        } else {
            const users = readData(USERS_FILE);
            user = users.find(u => u.email === email);
            if (!user) {
                return res.status(401).json({ success: false, error: '❌ بيانات غير صحيحة' });
            }
            if (!bcrypt.compareSync(password, user.password)) {
                return res.status(401).json({ success: false, error: '❌ بيانات غير صحيحة' });
            }
            if (!user.isActive) {
                return res.status(401).json({ success: false, error: '❌ الحساب معطل' });
            }
            
            const token = generateToken(user);
            const { password: _, ...userWithoutPassword } = user;
            res.json({ success: true, token, user: userWithoutPassword });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: '❌ خطأ في تسجيل الدخول' });
    }
});

// ============================================================
// 📄 تهيئة المستخدمين الافتراضيين
// ============================================================

async function initDefaultUsers() {
    try {
        if (!useMongoDB) {
            initDefaultUsersJSON();
            return;
        }
        
        const count = await User.countDocuments();
        if (count === 0) {
            const defaultUsers = [
                { name: 'مدير النظام', email: 'admin', password: '123456', role: 'مسؤول' },
                { name: 'مدير العمليات', email: 'manager', password: '123456', role: 'مشرف' },
                { name: 'محرر', email: 'editor', password: '123456', role: 'محرر' },
                { name: 'مشاهد', email: 'viewer', password: '123456', role: 'مشاهد' }
            ];
            
            for (const userData of defaultUsers) {
                const user = new User(userData);
                await user.save();
            }
            console.log('✅ تم إنشاء المستخدمين الافتراضيين في MongoDB');
            console.log('   admin / 123456 (مسؤول)');
            console.log('   manager / 123456 (مشرف)');
            console.log('   editor / 123456 (محرر)');
            console.log('   viewer / 123456 (مشاهد)');
        }
    } catch (error) {
        console.error('Error creating default users:', error);
    }
}

function initDefaultUsersJSON() {
    const users = readData(USERS_FILE);
    if (users.length === 0) {
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync('123456', salt);
        
        const defaultUsers = [
            { id: '1', name: 'مدير النظام', email: 'admin', password: hashedPassword, role: 'مسؤول', isActive: true, createdAt: new Date().toISOString() },
            { id: '2', name: 'مدير العمليات', email: 'manager', password: hashedPassword, role: 'مشرف', isActive: true, createdAt: new Date().toISOString() },
            { id: '3', name: 'محرر', email: 'editor', password: hashedPassword, role: 'محرر', isActive: true, createdAt: new Date().toISOString() },
            { id: '4', name: 'مشاهد', email: 'viewer', password: hashedPassword, role: 'مشاهد', isActive: true, createdAt: new Date().toISOString() }
        ];
        writeData(USERS_FILE, defaultUsers);
        console.log('✅ تم إنشاء المستخدمين الافتراضيين (JSON)');
        console.log('   admin / 123456 (مسؤول)');
        console.log('   manager / 123456 (مشرف)');
        console.log('   editor / 123456 (محرر)');
        console.log('   viewer / 123456 (مشاهد)');
    }
}

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
    console.log('========================================');
    console.log('📝 حسابات الدخول:');
    console.log('   👑 admin   / 123456 (مسؤول كامل)');
    console.log('   ⭐ manager / 123456 (مشرف)');
    console.log('   ✏️ editor  / 123456 (محرر)');
    console.log('   👀 viewer  / 123456 (مشاهد)');
    console.log('========================================');
    console.log(`📊 قاعدة البيانات: ${useMongoDB ? 'MongoDB ✅' : 'JSON Files ⚠️'}`);
    console.log('========================================');
});
