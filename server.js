const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// ✅ حل مشكلة CSS
// ============================================================
app.use((req, res, next) => {
    if (req.url.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
    } else if (req.url.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
    }
    next();
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// 🗄️ الاتصال بقاعدة البيانات
// ============================================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/marine_db';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err.message));

// ============================================================
// 📊 نموذج المراكب
// ============================================================
const VesselSchema = new mongoose.Schema({
    name: { type: String, required: true },
    num: { type: String, default: '' },
    len: { type: Number, default: 0 },
    cat: { type: String, default: 'زوارق مزدوجة' },
    reg: { type: String, default: '' },
    zone: { type: String, default: '' },
    port: { type: String, default: '' },
    supp: { type: String, default: '' },
    stat: { type: String, default: 'صالح' },
    break: { type: String, default: '' },
    fDate: { type: String, default: '' },
    eDate: { type: String, default: '' },
    ref: { type: String, default: '' }
}, { timestamps: true });

const Vessel = mongoose.model('Vessel', VesselSchema);

// ============================================================
// 🔐 Routes المصادقة
// ============================================================
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (email === 'admin' && password === '123456') {
        res.json({
            success: true,
            token: 'fake-jwt-token-123456',
            user: {
                id: 1,
                name: 'Admin',
                email: 'admin',
                role: 'مسؤول'
            }
        });
    } else {
        res.status(401).json({
            success: false,
            error: 'بيانات غير صحيحة'
        });
    }
});

app.get('/api/auth/me', (req, res) => {
    res.json({
        success: true,
        user: {
            id: 1,
            name: 'Admin',
            email: 'admin',
            role: 'مسؤول'
        }
    });
});

// ============================================================
// 🚢 Routes المراكب (مع MongoDB)
// ============================================================

// ✅ جلب جميع المراكب
app.get('/api/vessels', async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        console.log(`📊 عدد المراكب: ${vessels.length}`);
        res.json(vessels);
    } catch (error) {
        console.error('❌ خطأ في جلب المراكب:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ إضافة مركب جديد
app.post('/api/vessels', async (req, res) => {
    try {
        console.log('📥 استلام بيانات:', req.body);
        
        const vessel = new Vessel({
            name: req.body.name,
            num: req.body.num || '',
            len: parseFloat(req.body.len) || 0,
            cat: req.body.cat || 'زوارق مزدوجة',
            reg: req.body.reg || '',
            zone: req.body.zone || '',
            port: req.body.port || '',
            supp: req.body.supp || '',
            stat: req.body.stat || 'صالح',
            break: req.body.break || '',
            fDate: req.body.fDate || '',
            eDate: req.body.eDate || '',
            ref: req.body.ref || ''
        });
        
        const savedVessel = await vessel.save();
        console.log('✅ تم إضافة مركب:', savedVessel.name);
        
        res.status(201).json({
            success: true,
            message: 'تم إضافة المركب بنجاح',
            data: savedVessel
        });
    } catch (error) {
        console.error('❌ خطأ في الإضافة:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// ✅ تحديث مركب
app.put('/api/vessels/:id', async (req, res) => {
    try {
        const id = req.params.id;
        console.log('✏️ تحديث مركب:', id);
        
        const vessel = await Vessel.findByIdAndUpdate(
            id,
            {
                name: req.body.name,
                num: req.body.num || '',
                len: parseFloat(req.body.len) || 0,
                cat: req.body.cat || 'زوارق مزدوجة',
                reg: req.body.reg || '',
                zone: req.body.zone || '',
                port: req.body.port || '',
                supp: req.body.supp || '',
                stat: req.body.stat || 'صالح',
                break: req.body.break || '',
                fDate: req.body.fDate || '',
                eDate: req.body.eDate || '',
                ref: req.body.ref || ''
            },
            { new: true, runValidators: true }
        );
        
        if (!vessel) {
            return res.status(404).json({
                success: false,
                error: 'المركب غير موجود'
            });
        }
        
        console.log('✅ تم تحديث مركب:', vessel.name);
        res.json({
            success: true,
            message: 'تم تحديث المركب بنجاح',
            data: vessel
        });
    } catch (error) {
        console.error('❌ خطأ في التحديث:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// ✅ حذف مركب
app.delete('/api/vessels/:id', async (req, res) => {
    try {
        const id = req.params.id;
        console.log('🗑️ حذف مركب:', id);
        
        const vessel = await Vessel.findByIdAndDelete(id);
        
        if (!vessel) {
            return res.status(404).json({
                success: false,
                error: 'المركب غير موجود'
            });
        }
        
        console.log('✅ تم حذف مركب:', vessel.name);
        res.json({
            success: true,
            message: 'تم حذف المركب بنجاح'
        });
    } catch (error) {
        console.error('❌ خطأ في الحذف:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// ✅ بحث في المراكب
app.get('/api/vessels/search', async (req, res) => {
    try {
        const { q } = req.query;
        const vessels = await Vessel.find({
            $or: [
                { name: { $regex: q, $options: 'i' } },
                { num: { $regex: q, $options: 'i' } }
            ]
        });
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🎫 Routes التذاكر (مع MongoDB)
// ============================================================
const TicketSchema = new mongoose.Schema({
    subject: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, default: 'قيد المعالجة' },
    userName: { type: String, default: 'Admin' },
    date: { type: String },
    time: { type: String },
    replies: { type: Array, default: [] }
}, { timestamps: true });

const Ticket = mongoose.model('Ticket', TicketSchema);

app.get('/api/tickets', async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        res.json(tickets);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/tickets', async (req, res) => {
    try {
        const ticket = new Ticket({
            subject: req.body.subject,
            message: req.body.message,
            date: new Date().toISOString().split('T')[0],
            time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
        });
        const saved = await ticket.save();
        res.status(201).json({ success: true, data: saved });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📝 Routes المذكرات (مع MongoDB)
// ============================================================
const NoteSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    date: { type: String },
    time: { type: String },
    week: { type: String },
    createdBy: { type: String, default: 'Admin' }
}, { timestamps: true });

const Note = mongoose.model('Note', NoteSchema);

app.get('/api/notes', async (req, res) => {
    try {
        const notes = await Note.find().sort({ createdAt: -1 });
        res.json(notes);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/notes', async (req, res) => {
    try {
        const note = new Note({
            title: req.body.title,
            content: req.body.content,
            date: req.body.date || new Date().toISOString().split('T')[0],
            time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
            week: '1'
        });
        const saved = await note.save();
        res.status(201).json({ success: true, data: saved });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.delete('/api/notes/:id', async (req, res) => {
    try {
        await Note.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'تم الحذف' });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.get('/api/notes/latest', async (req, res) => {
    try {
        const note = await Note.findOne().sort({ createdAt: -1 });
        res.json(note);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 👥 Routes المستخدمين
// ============================================================
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'مستخدم' },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📍 Routes المواقع
// ============================================================
const LocationSchema = new mongoose.Schema({
    userName: { type: String },
    lat: { type: Number },
    lng: { type: Number },
    timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const Location = mongoose.model('Location', LocationSchema);

app.get('/api/locations', async (req, res) => {
    try {
        const locations = await Location.find().sort({ timestamp: -1 });
        res.json(locations);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/locations', async (req, res) => {
    try {
        const location = new Location({
            userName: 'Admin',
            lat: req.body.lat,
            lng: req.body.lng
        });
        const saved = await location.save();
        res.status(201).json({ success: true, data: saved });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📜 Routes السجلات
// ============================================================
const LogSchema = new mongoose.Schema({
    userName: { type: String },
    action: { type: String },
    details: { type: String },
    date: { type: String },
    time: { type: String }
}, { timestamps: true });

const Log = mongoose.model('Log', LogSchema);

app.get('/api/logs', async (req, res) => {
    try {
        const logs = await Log.find().sort({ createdAt: -1 });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 💾 Export / Import
// ============================================================
app.get('/api/export-all', async (req, res) => {
    try {
        const [vessels, users, tickets, logs, locations, notes] = await Promise.all([
            Vessel.find(),
            User.find().select('-password'),
            Ticket.find(),
            Log.find(),
            Location.find(),
            Note.find()
        ]);
        res.json({ vessels, users, tickets, logs, locations, notes });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/import-all', async (req, res) => {
    try {
        const { vessels, users, tickets, logs, locations, notes } = req.body;
        
        if (vessels) {
            await Vessel.deleteMany({});
            await Vessel.insertMany(vessels);
        }
        if (tickets) {
            await Ticket.deleteMany({});
            await Ticket.insertMany(tickets);
        }
        if (notes) {
            await Note.deleteMany({});
            await Note.insertMany(notes);
        }
        if (locations) {
            await Location.deleteMany({});
            await Location.insertMany(locations);
        }
        
        res.json({ success: true, message: '✅ تم استيراد البيانات بنجاح' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// ❤️ Health Check
// ============================================================
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// ============================================================
// 🏠 الصفحة الرئيسية
// ============================================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// 🚀 تشغيل السيرفر
// ============================================================
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Server: http://localhost:${PORT}`);
    console.log('📧 admin / 🔑 123456');
    console.log('✅ قاعدة البيانات: ' + (mongoose.connection.readyState === 1 ? 'متصلة' : 'غير متصلة'));
});
