const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ================= CHECK ENVIRONMENT =================
if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI is not defined in environment variables');
    process.exit(1);
}
if (!process.env.JWT_SECRET) {
    console.error('❌ JWT_SECRET is not defined in environment variables');
    process.exit(1);
}

// ================= MODELS =================

// Vessel Schema
const vesselSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, index: true },
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

const Vessel = mongoose.model('Vessel', vesselSchema);

// User Schema
const userSchema = new mongoose.Schema({
    name: { type: String, unique: true, required: true, index: true },
    pass: { type: String, required: true },
    role: { type: String, default: "مشاهد", index: true },
    enabled: { type: Boolean, default: true }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('pass')) return next();
    this.pass = await bcrypt.hash(this.pass, 10);
    next();
});

const User = mongoose.model('User', userSchema);

// Log Schema
const logSchema = new mongoose.Schema({
    userName: String,
    action: String,
    details: String,
    date: { type: Date, default: Date.now }
}, { timestamps: true });

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

async function logActivity(userName, action, details) {
    try {
        await Log.create({ userName, action, details });
    } catch (err) {
        console.error('Log error:', err.message);
    }
}

// ================= INIT DEFAULT DATA =================
async function initDefaultData() {
    // Create default users if none exist
    const userCount = await User.countDocuments();
    if (userCount === 0) {
        console.log('📝 Creating default users...');
        await User.create([
            { name: "admin", pass: "1234", role: "مسؤول", enabled: true },
            { name: "editor", pass: "1234", role: "محرر", enabled: true },
            { name: "viewer", pass: "1234", role: "مشاهد", enabled: true }
        ]);
        console.log('✅ Default users created: admin/1234, editor/1234, viewer/1234');
    }

    // Create default vessels if none exist
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
        console.log(`✅ Created ${defaultVessels.length} default vessels`);
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
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Session expired. Please login again.' });
        }
        return res.status(401).json({ error: 'Invalid token.' });
    }
}

function checkRole(roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Permission denied. You need higher privileges.' });
        }
        next();
    };
}

// ================= LOGIN ROUTE (مطابق لطلب الواجهة) =================
app.post('/api/login', async (req, res) => {
    const { name, pass } = req.body;
    if (!name || !pass) {
        return res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبان" });
    }
    try {
        const user = await User.findOne({ name });
        if (!user) {
            return res.status(401).json({ error: "اسم المستخدم غير صحيح" });
        }
        if (!user.enabled) {
            return res.status(401).json({ error: "الحساب معطل، يرجى الاتصال بالمسؤول" });
        }
        const isValid = await bcrypt.compare(pass, user.pass);
        if (!isValid) {
            return res.status(401).json({ error: "كلمة المرور غير صحيحة" });
        }
        const token = jwt.sign(
            { id: user._id, name: user.name, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        await logActivity(user.name, "تسجيل دخول", "قام بتسجيل الدخول بنجاح");
        res.json({
            success: true,
            token,
            user: { id: user._id, name: user.name, role: user.role }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: "خطأ داخلي في الخادم" });
    }
});

// ================= GET CURRENT USER (باستخدام التوكن) =================
app.get('/api/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-pass');
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= VESSEL ROUTES =================

// GET all vessels (مع دعم التصفية والترقيم)
app.get('/api/vessels', auth, async (req, res) => {
    try {
        const { page = 1, limit = 100, reg, stat, cat } = req.query;
        const filter = {};
        if (reg && reg !== 'الكل') filter.reg = reg;
        if (stat && stat !== 'الكل') filter.stat = stat;
        if (cat && cat !== 'الكل') filter.cat = cat;
        
        const vessels = await Vessel.find(filter)
            .sort({ createdAt: -1 })
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit));
        const total = await Vessel.countDocuments(filter);
        res.json({
            vessels,
            pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET single vessel
app.get('/api/vessels/:id', auth, async (req, res) => {
    try {
        const vessel = await Vessel.findById(req.params.id);
        if (!vessel) return res.status(404).json({ error: "المركب غير موجود" });
        res.json(vessel);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ADD vessel (admin or editor only)
app.post('/api/vessels', auth, checkRole(['مسؤول', 'محرر']), async (req, res) => {
    try {
        const vessel = req.body;
        if (!vessel.name) return res.status(400).json({ error: "اسم المركب مطلوب" });
        const existing = await Vessel.findOne({ name: vessel.name });
        if (existing) return res.status(400).json({ error: "مركب بهذا الاسم موجود بالفعل" });
        const newVessel = await Vessel.create({
            ...vessel,
            cat: getCategory(vessel.len)
        });
        await logActivity(req.user.name, "إضافة مركب", `أضاف المركب: ${vessel.name}`);
        res.status(201).json({ success: true, vessel: newVessel });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPDATE vessel
app.put('/api/vessels/:id', auth, checkRole(['مسؤول', 'محرر']), async (req, res) => {
    try {
        const vessel = await Vessel.findById(req.params.id);
        if (!vessel) return res.status(404).json({ error: "المركب غير موجود" });
        const updated = await Vessel.findByIdAndUpdate(
            req.params.id,
            { ...req.body, cat: getCategory(req.body.len) },
            { new: true, runValidators: true }
        );
        await logActivity(req.user.name, "تعديل مركب", `عدل المركب: ${updated.name}`);
        res.json({ success: true, vessel: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE vessel (admin only)
app.delete('/api/vessels/:id', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const vessel = await Vessel.findById(req.params.id);
        if (!vessel) return res.status(404).json({ error: "المركب غير موجود" });
        await Vessel.findByIdAndDelete(req.params.id);
        await logActivity(req.user.name, "حذف مركب", `حذف المركب: ${vessel.name}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= USER MANAGEMENT (Admin only) =================

app.get('/api/users', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const users = await User.find().select('-pass').sort({ createdAt: 1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const { name, pass, role } = req.body;
        if (!name || !pass) return res.status(400).json({ error: "الاسم وكلمة المرور مطلوبان" });
        const existing = await User.findOne({ name });
        if (existing) return res.status(400).json({ error: "المستخدم موجود بالفعل" });
        const newUser = await User.create({ name, pass, role: role || "مشاهد", enabled: true });
        await logActivity(req.user.name, "إضافة مستخدم", `أضاف المستخدم: ${name}`);
        res.status(201).json({ success: true, user: { id: newUser._id, name: newUser.name, role: newUser.role, enabled: newUser.enabled } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/users/:id/toggle', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
        if (user.name === 'admin') return res.status(400).json({ error: "لا يمكن تعطيل المستخدم admin" });
        user.enabled = !user.enabled;
        await user.save();
        await logActivity(req.user.name, user.enabled ? "تفعيل مستخدم" : "تعطيل مستخدم", `${user.enabled ? 'فعّل' : 'عطّل'} المستخدم: ${user.name}`);
        res.json({ success: true, enabled: user.enabled });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id/password', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: "كلمة المرور يجب أن تكون 4 أحرف على الأقل" });
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
        user.pass = newPassword; // يتم تشفيرها تلقائياً في pre-save
        await user.save();
        await logActivity(req.user.name, "تغيير كلمة مرور", `غيّر كلمة مرور المستخدم: ${user.name}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
        if (user.name === 'admin') return res.status(400).json({ error: "لا يمكن حذف المستخدم admin" });
        await User.findByIdAndDelete(req.params.id);
        await logActivity(req.user.name, "حذف مستخدم", `حذف المستخدم: ${user.name}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= STATISTICS =================
app.get('/api/statistics', auth, async (req, res) => {
    try {
        const total = await Vessel.countDocuments();
        const ok = await Vessel.countDocuments({ stat: 'صالح' });
        const maint = await Vessel.countDocuments({ stat: 'صيانة' });
        const broken = await Vessel.countDocuments({ stat: 'معطب' });
        const efficiency = total ? ((ok / total) * 100).toFixed(1) : 0;
        // إحصائيات حسب الأقاليم
        const regions = ['الشمال', 'الساحل', 'الوسط', 'الجنوب'];
        const byRegion = {};
        for (const reg of regions) {
            const count = await Vessel.countDocuments({ reg });
            const okCount = await Vessel.countDocuments({ reg, stat: 'صالح' });
            byRegion[reg] = {
                total: count,
                ok: okCount,
                broken: count - okCount,
                efficiency: count ? ((okCount / count) * 100).toFixed(1) : 0
            };
        }
        res.json({ total, ok, maint, broken, efficiency, byRegion });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= ZONES & CATEGORIES =================
const zonesMap = {
    "الشمال": ["تونس", "بنزرت", "طبرقة"],
    "الساحل": ["سوسة", "المنستير", "نابل"],
    "الوسط": ["صفاقس", "المهدية", "قرقنة"],
    "الجنوب": ["جرجيس", "جربة", "قابس"]
};

app.get('/api/zones', auth, (req, res) => {
    res.json(zonesMap);
});

app.get('/api/categories', auth, (req, res) => {
    res.json(["البروق", "صقور", "خوافر", "زوارق مزدوجة", "طوافات"]);
});

// ================= LOGS (Admin only) =================
app.get('/api/logs', auth, checkRole(['مسؤول']), async (req, res) => {
    try {
        const logs = await Log.find().sort({ date: -1 }).limit(200);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= HEALTH CHECK =================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// ================= FRONTEND =================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
})
.then(async () => {
    console.log('✅ MongoDB connected successfully');
    await initDefaultData();
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`🔗 http://localhost:${PORT}`);
        console.log(`📊 Database: ${mongoose.connection.name}`);
        console.log(`👥 Default users: admin/1234, editor/1234, viewer/1234`);
        console.log(`✅ System is ready for production!`);
    });
})
.catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
});
