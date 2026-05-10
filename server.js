const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path'); // ✅ فقط مرة واحدة في البداية
require('dotenv').config();

const app = express();

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ================= CHECK ENVIRONMENT =================
if (!process.env.MONGO_URI) {
    console.error('❌ FATAL: MONGO_URI is not defined in environment variables');
    console.error('💡 Please set MONGO_URI in Render Environment Variables');
    process.exit(1);
}

if (!process.env.JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET is not defined in environment variables');
    console.error('💡 Please set JWT_SECRET in Render Environment Variables');
    process.exit(1);
}

console.log('✅ Environment variables loaded successfully');

// ================= MODELS =================

// Vessel Schema with indexes for better performance
const vesselSchema = new mongoose.Schema({
    name: { type: String, required: true, index: true },
    num: String,
    len: Number,
    reg: { type: String, index: true },
    zone: String,
    port: String,
    supp: String,
    stat: { type: String, default: "صالح", index: true },
    break: String,
    fDate: String,
    eDate: String,
    ref: String,
    cat: { type: String, index: true }
}, { timestamps: true });

// Create indexes for better query performance
vesselSchema.index({ reg: 1, stat: 1 });
vesselSchema.index({ cat: 1, stat: 1 });

const Vessel = mongoose.model('Vessel', vesselSchema);

// User Schema
const userSchema = new mongoose.Schema({
    name: { type: String, unique: true, required: true, index: true },
    pass: { type: String, required: true },
    role: { type: String, default: "مشاهد", index: true },
    enabled: { type: Boolean, default: true }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// Ticket Schema with TTL index for auto-cleanup after 30 days
const ticketSchema = new mongoose.Schema({
    userName: { type: String, index: true },
    subject: String,
    message: String,
    status: { type: String, default: "قيد المعالجة", index: true },
    date: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

// Auto-delete tickets older than 30 days
ticketSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const Ticket = mongoose.model('Ticket', ticketSchema);

// Log Schema with TTL index for auto-cleanup after 14 days
const logSchema = new mongoose.Schema({
    userName: { type: String, index: true },
    action: { type: String, index: true },
    details: String,
    date: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

// Auto-delete logs older than 14 days
logSchema.index({ createdAt: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });

const Log = mongoose.model('Log', logSchema);

// ================= HELPERS =================
function getCategory(len) {
    const n = parseFloat(len);
    if (n === 11) return "البروق";
    if (n >= 8 && n <= 12) return "صقور";
    if (n > 12 && n <= 25) return "خوافر";
    if (n >= 30) return "طوافات";
    return "زوارق مزدوجة";
}

// ================= INITIALIZE DEFAULT DATA =================
async function initDefaultData() {
    try {
        // Check if users exist
        const userCount = await User.countDocuments();
        if (userCount === 0) {
            console.log('📝 Creating default users...');
            await User.create([
                { name: "admin", pass: bcrypt.hashSync("1234", 10), role: "مسؤول", enabled: true },
                { name: "editor", pass: bcrypt.hashSync("1234", 10), role: "محرر", enabled: true },
                { name: "viewer", pass: bcrypt.hashSync("1234", 10), role: "مشاهد", enabled: true }
            ]);
            console.log("✅ Default users created: admin/1234, editor/1234, viewer/1234");
        }

        // Check if vessels exist
        const vesselCount = await Vessel.countDocuments();
        if (vesselCount === 0) {
            console.log('📝 Creating default vessels...');
            const defaultVessels = [
                { name: "البروق 1", num: "B001", len: 11, reg: "الشمال", zone: "تونس", port: "تونس", supp: "قاعدة الشمال", stat: "صالح", cat: getCategory(11) },
                { name: "صقر 1", num: "S001", len: 10, reg: "الساحل", zone: "سوسة", port: "سوسة", supp: "قاعدة الساحل", stat: "صالح", cat: getCategory(10) },
                { name: "خافرة 1", num: "K001", len: 20, reg: "الوسط", zone: "صفاقس", port: "صفاقس", supp: "قاعدة الوسط", stat: "معطب", break: "عطل في المحرك", fDate: "2025-03-10", eDate: "2025-04-10", cat: getCategory(20) },
                { name: "زورق 1", num: "Z001", len: 15, reg: "الجنوب", zone: "جربة", port: "جربة", supp: "قاعدة الجنوب", stat: "صيانة", break: "صيانة دورية", fDate: "2025-03-15", eDate: "2025-04-05", cat: getCategory(15) },
                { name: "طوافة 1", num: "T001", len: 35, reg: "الشمال", zone: "بنزرت", port: "بنزرت", supp: "قاعدة الشمال", stat: "صالح", cat: getCategory(35) }
            ];
            await Vessel.insertMany(defaultVessels);
            console.log(`✅ Default vessels created: ${defaultVessels.length} vessels`);
        }
        
        console.log('✅ System initialization completed successfully');
    } catch (error) {
        console.error("⚠️ Init data error:", error.message);
        // Don't throw - allow server to still run
    }
}

// ================= AUTH MIDDLEWARE =================
function auth(req, res, next) {
    const token = req.headers.authorization;
    
    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    
    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Session expired. Please login again.' });
        }
        res.status(401).json({ error: 'Invalid token' });
    }
}

function checkRole(roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'You don\'t have permission to perform this action' });
        }
        next();
    };
}

// ================= AUTH ROUTES =================

// 🔐 LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبان" });
        }
        
        const user = await User.findOne({ name: username });
        
        if (!user) {
            return res.status(401).json({ error: "اسم المستخدم غير صحيح" });
        }
        
        if (!user.enabled) {
            return res.status(401).json({ error: "هذا الحساب معطل. يرجى الاتصال بالمسؤول" });
        }
        
        const valid = bcrypt.compareSync(password, user.pass);
        
        if (!valid) {
            return res.status(401).json({ error: "كلمة المرور غير صحيحة" });
        }
        
        const token = jwt.sign(
            { id: user._id, name: user.name, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // Log login (non-blocking)
        Log.create({
            userName: user.name,
            action: "تسجيل دخول",
            details: "قام بتسجيل الدخول إلى النظام"
        }).catch(err => console.error('Log error:', err));
        
        res.json({
            success: true,
            token,
            user: { id: user._id, name: user.name, role: user.role }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
});

// 🔐 GET CURRENT USER
app.get('/api/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-pass');
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= VESSEL ROUTES =================

// 🟢 GET ALL VESSELS (with pagination support)
app.get('/api/vessels', auth, async (req, res) => {
    try {
        const { page = 1, limit = 100, reg, stat, cat } = req.query;
        const query = {};
        
        if (reg && reg !== 'الكل') query.reg = reg;
        if (stat && stat !== 'الكل') query.stat = stat;
        if (cat && cat !== 'الكل') query.cat = cat;
        
        const vessels = await Vessel.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));
        
        const total = await Vessel.countDocuments(query);
        
        res.json({
            vessels,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get vessels error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 🟢 GET SINGLE VESSEL
app.get('/api/vessels/:id', auth, async (req, res) => {
    try {
        const vessel = await Vessel.findById(req.params.id);
        if (!vessel) {
            return res.status(404).json({ error: "المركب غير موجود" });
        }
        res.json(vessel);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🟢 ADD VESSEL
app.post('/api/vessels', auth, checkRole(['مسؤول', 'محرر']), async (req, res) => {
    try {
        const vessel = req.body;
        
        if (!vessel.name) {
            return res.status(400).json({ error: "اسم المركب مطلوب" });
        }
        
        const newVessel = await Vessel.create({
            ...vessel,
            cat: getCategory(vessel.len)
        });
        
        // Log activity (non-blocking)
        Log.create({
            userName: req.user.name,
            action: "إضافة مركب",
            details: `قام بإضافة مركب جديد: ${vessel.name}`
        }).catch(err => console.error('Log error:', err));
        
        res.status(201).json({ success: true, vessel: newVessel });
    } catch (error) {
        console.error('Add vessel error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 🟡 UPDATE VESSEL
app.put('/api/vessels/:id', auth, checkRole(['مسؤول', 'محرر']), async (req, res) => {
    try {
        const vessel = await Vessel.findById(req.params.id);
        if (!vessel) {
            return res.status(404).json({ error: "المركب غير موجود" });
        }
        
        const updated = await Vessel.findByIdAndUpdate(
            req.params.id,
            { ...req.body, cat: getCategory(req.body.len) },
            { new: true, runValidators: true }
        );
        
        Log.create({
            userName: req.user.name,
            action: "تعديل مركب",
            details: `قام بتعديل المركب: ${updated.name}`
        }).catch(err => console.error('Log error:', err));
        
        res.json({ success: true, vessel: updated });
    } catch (error) {
        console.error('Update vessel error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 🔴 DELETE VESSEL
app.delete('/api/vessels/:id', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const vessel = await Vessel.findById(req.params.id);
        if (!vessel) {
            return res.status(404).json({ error: "المركب غير موجود" });
        }
        
        await Vessel.findByIdAndDelete(req.params.id);
        
        Log.create({
            userName: req.user.name,
            action: "حذف مركب",
            details: `قام بحذف المركب: ${vessel.name}`
        }).catch(err => console.error('Log error:', err));
        
        res.json({ success: true });
    } catch (error) {
        console.error('Delete vessel error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ================= USER MANAGEMENT ROUTES =================

// 📋 GET ALL USERS (Admin only)
app.get('/api/users', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const users = await User.find().select('-pass').sort({ createdAt: 1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ➕ ADD USER (Admin only)
app.post('/api/users', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const { name, pass, role } = req.body;
        
        if (!name || !pass) {
            return res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبان" });
        }
        
        const existingUser = await User.findOne({ name });
        if (existingUser) {
            return res.status(400).json({ error: "اسم المستخدم موجود بالفعل" });
        }
        
        const newUser = await User.create({
            name,
            pass: bcrypt.hashSync(pass, 10),
            role: role || "مشاهد",
            enabled: true
        });
        
        Log.create({
            userName: req.user.name,
            action: "إضافة مستخدم",
            details: `قام بإضافة مستخدم جديد: ${name}`
        }).catch(err => console.error('Log error:', err));
        
        res.status(201).json({ success: true, user: { id: newUser._id, name: newUser.name, role: newUser.role } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔄 TOGGLE USER (Admin only)
app.patch('/api/users/:id/toggle', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: "المستخدم غير موجود" });
        }
        
        if (user.name === 'admin') {
            return res.status(400).json({ error: "لا يمكن تعطيل المستخدم admin" });
        }
        
        user.enabled = !user.enabled;
        await user.save();
        
        Log.create({
            userName: req.user.name,
            action: user.enabled ? "تفعيل مستخدم" : "تعطيل مستخدم",
            details: `قام ${user.enabled ? 'بتفعيل' : 'بتعطيل'} المستخدم: ${user.name}`
        }).catch(err => console.error('Log error:', err));
        
        res.json({ success: true, enabled: user.enabled });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔑 CHANGE PASSWORD (Admin only)
app.put('/api/users/:id/password', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const { newPassword } = req.body;
        
        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({ error: "كلمة المرور يجب أن تكون 4 أحرف على الأقل" });
        }
        
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: "المستخدم غير موجود" });
        }
        
        user.pass = bcrypt.hashSync(newPassword, 10);
        await user.save();
        
        Log.create({
            userName: req.user.name,
            action: "تغيير كلمة مرور",
            details: `قام بتغيير كلمة مرور المستخدم: ${user.name}`
        }).catch(err => console.error('Log error:', err));
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🗑️ DELETE USER (Admin only)
app.delete('/api/users/:id', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: "المستخدم غير موجود" });
        }
        
        if (user.name === 'admin') {
            return res.status(400).json({ error: "لا يمكن حذف المستخدم admin" });
        }
        
        await User.findByIdAndDelete(req.params.id);
        
        Log.create({
            userName: req.user.name,
            action: "حذف مستخدم",
            details: `قام بحذف المستخدم: ${user.name}`
        }).catch(err => console.error('Log error:', err));
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= STATISTICS =================

// 📊 GET STATISTICS
app.get('/api/statistics', auth, async (req, res) => {
    try {
        const [total, ok, maint, broken] = await Promise.all([
            Vessel.countDocuments(),
            Vessel.countDocuments({ stat: 'صالح' }),
            Vessel.countDocuments({ stat: 'صيانة' }),
            Vessel.countDocuments({ stat: 'معطب' })
        ]);
        
        const byRegion = {};
        const regions = ['الشمال', 'الساحل', 'الوسط', 'الجنوب'];
        
        for (const region of regions) {
            const regionVessels = await Vessel.find({ reg: region });
            const regionOk = regionVessels.filter(v => v.stat === 'صالح').length;
            byRegion[region] = {
                total: regionVessels.length,
                ok: regionOk,
                broken: regionVessels.length - regionOk,
                efficiency: regionVessels.length ? ((regionOk / regionVessels.length) * 100).toFixed(1) : 0
            };
        }
        
        res.json({ 
            total, 
            ok, 
            maint, 
            broken,
            efficiency: total ? ((ok / total) * 100).toFixed(1) : 0,
            byRegion 
        });
    } catch (error) {
        console.error('Statistics error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ================= ZONES & CATEGORIES =================

// 🗺️ GET ZONES
const ZONES = {
    "الشمال": ["تونس", "بنزرت", "طبرقة"],
    "الساحل": ["سوسة", "المنستير", "نابل"],
    "الوسط": ["صفاقس", "المهدية", "قرقنة"],
    "الجنوب": ["جرجيس", "جربة", "قابس"]
};

app.get('/api/zones', auth, (req, res) => {
    res.json(ZONES);
});

// 📋 GET CATEGORIES
const CATEGORIES = ["البروق", "صقور", "خوافر", "زوارق مزدوجة", "طوافات"];

app.get('/api/categories', auth, (req, res) => {
    res.json(CATEGORIES);
});

// ================= TICKETS ROUTES =================

// 📝 CREATE TICKET
app.post('/api/tickets', auth, async (req, res) => {
    try {
        const { subject, message } = req.body;
        
        if (!subject || !message) {
            return res.status(400).json({ error: "العنوان والرسالة مطلوبان" });
        }
        
        const ticket = await Ticket.create({
            userName: req.user.name,
            subject,
            message,
            status: "قيد المعالجة"
        });
        
        Log.create({
            userName: req.user.name,
            action: "إرسال تذكرة دعم",
            details: `قام بإرسال تذكرة: ${subject}`
        }).catch(err => console.error('Log error:', err));
        
        res.status(201).json({ success: true, ticket });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📋 GET TICKETS
app.get('/api/tickets', auth, async (req, res) => {
    try {
        let tickets;
        if (req.user.role === 'مسؤول') {
            tickets = await Ticket.find().sort({ createdAt: -1 }).limit(50);
        } else {
            tickets = await Ticket.find({ userName: req.user.name }).sort({ createdAt: -1 }).limit(50);
        }
        res.json(tickets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= LOGS ROUTES =================

// 📋 GET LOGS (Admin only)
app.get('/api/logs', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const { limit = 100, action } = req.query;
        const query = {};
        
        if (action && action !== 'الكل') query.action = action;
        
        const logs = await Log.find(query)
            .sort({ date: -1 })
            .limit(parseInt(limit));
        
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📊 GET DASHBOARD STATS (Admin only)
app.get('/api/dashboard/stats', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const [totalUsers, totalTickets, pendingTickets, recentLogs] = await Promise.all([
            User.countDocuments(),
            Ticket.countDocuments(),
            Ticket.countDocuments({ status: 'قيد المعالجة' }),
            Log.find().sort({ date: -1 }).limit(10)
        ]);
        
        res.json({
            totalUsers,
            totalTickets,
            pendingTickets,
            recentLogs
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= HEALTH CHECK =================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// ================= FRONTEND =================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================= CONNECT DATABASE & START SERVER =================
const PORT = process.env.PORT || 3000;

// Connect to MongoDB first, then start server
const startServer = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });
        
        console.log("✅ MongoDB connected successfully");
        
        // Initialize default data
        await initDefaultData();
        
        // Start server only after DB is ready
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`🔗 http://localhost:${PORT}`);
            console.log(`📊 Database: ${mongoose.connection.name}`);
            console.log(`👥 Default users: admin/1234, editor/1234, viewer/1234`);
            console.log(`✅ System is ready for production!`);
        });
        
    } catch (error) {
        console.error("❌ Failed to start server:", error.message);
        console.error("💡 Please check:");
        console.error("   1. MONGO_URI is correct in environment variables");
        console.error("   2. Network Access allows 0.0.0.0/0 in MongoDB Atlas");
        console.error("   3. Database user credentials are correct");
        process.exit(1);
    }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('🛑 Shutting down gracefully...');
    await mongoose.disconnect();
    console.log('✅ MongoDB disconnected');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down gracefully...');
    await mongoose.disconnect();
    console.log('✅ MongoDB disconnected');
    process.exit(0);
});

// Start the application
startServer();
