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
    console.error('❌ MONGO_URI is required in environment variables');
    process.exit(1);
}
if (!process.env.JWT_SECRET) {
    console.error('❌ JWT_SECRET is required in environment variables');
    process.exit(1);
}

// ================= MODELS =================
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
    cat: String
}, { timestamps: true });

const Vessel = mongoose.model('Vessel', vesselSchema);

const userSchema = new mongoose.Schema({
    name: { type: String, unique: true, required: true, index: true },
    pass: { type: String, required: true },
    role: { type: String, default: "مشاهد", index: true },
    enabled: { type: Boolean, default: true }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
    if (!this.isModified('pass')) return next();
    this.pass = await bcrypt.hash(this.pass, 10);
    next();
});

const User = mongoose.model('User', userSchema);

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
    } catch (err) { console.error('Log error:', err.message); }
}

// ================= INIT DEFAULT DATA =================
async function initDefaultData() {
    // Create default users if none exist
    const userCount = await User.countDocuments();
    if (userCount === 0) {
        console.log('📝 Creating default users...');
        // Using plain passwords; they will be hashed by pre-save hook
        await User.create([
            { name: "admin", pass: "1234", role: "مسؤول", enabled: true },
            { name: "editor", pass: "1234", role: "محرر", enabled: true },
            { name: "viewer", pass: "1234", role: "مشاهد", enabled: true }
        ]);
        console.log('✅ Default users created: admin/1234, editor/1234, viewer/1234');
    } else {
        // Ensure admin has correct password (in case of old bad data)
        const admin = await User.findOne({ name: "admin" });
        if (admin && !admin.pass.startsWith('$2a$')) {
            admin.pass = "1234";
            await admin.save();
            console.log('⚠️ Fixed admin password hash.');
        }
    }

    // Create default vessels
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
    if (!token) return res.status(401).json({ error: 'No token provided.' });
    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
}

function checkRole(roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role))
            return res.status(403).json({ error: 'Permission denied.' });
        next();
    };
}

// ================= LOGIN ROUTE (مطابق للواجهة) =================
app.post('/api/login', async (req, res) => {
    const { name, pass } = req.body;
    if (!name || !pass) {
        return res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبان" });
    }
    try {
        const user = await User.findOne({ name });
        if (!user) return res.status(401).json({ error: "اسم المستخدم غير صحيح" });
        if (!user.enabled) return res.status(401).json({ error: "الحساب معطل" });
        
        const valid = await bcrypt.compare(pass, user.pass);
        if (!valid) return res.status(401).json({ error: "كلمة المرور غير صحيحة" });
        
        const token = jwt.sign(
            { id: user._id, name: user.name, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        await logActivity(user.name, "تسجيل دخول", "قام بتسجيل الدخول");
        res.json({ success: true, token, user: { id: user._id, name: user.name, role: user.role } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "خطأ في الخادم" });
    }
});

// ================= PROTECTED ROUTES =================
app.get('/api/me', auth, async (req, res) => {
    const user = await User.findById(req.user.id).select('-pass');
    res.json(user);
});

// Vessels
app.get('/api/vessels', auth, async (req, res) => {
    const vessels = await Vessel.find().sort({ createdAt: -1 });
    res.json(vessels);
});

app.post('/api/vessels', auth, checkRole(['مسؤول', 'محرر']), async (req, res) => {
    const vessel = req.body;
    if (!vessel.name) return res.status(400).json({ error: "الاسم مطلوب" });
    const existing = await Vessel.findOne({ name: vessel.name });
    if (existing) return res.status(400).json({ error: "مركب موجود" });
    const newVessel = await Vessel.create({ ...vessel, cat: getCategory(vessel.len) });
    await logActivity(req.user.name, "إضافة مركب", `أضاف ${vessel.name}`);
    res.status(201).json({ success: true, vessel: newVessel });
});

app.put('/api/vessels/:id', auth, checkRole(['مسؤول', 'محرر']), async (req, res) => {
    const updated = await Vessel.findByIdAndUpdate(req.params.id, { ...req.body, cat: getCategory(req.body.len) }, { new: true });
    await logActivity(req.user.name, "تعديل مركب", `عدل ${updated.name}`);
    res.json({ success: true, vessel: updated });
});

app.delete('/api/vessels/:id', auth, checkRole(['مسؤول']), async (req, res) => {
    const vessel = await Vessel.findById(req.params.id);
    if (!vessel) return res.status(404).json({ error: "غير موجود" });
    await Vessel.findByIdAndDelete(req.params.id);
    await logActivity(req.user.name, "حذف مركب", `حذف ${vessel.name}`);
    res.json({ success: true });
});

// Users (admin only)
app.get('/api/users', auth, checkRole(['مسؤول']), async (req, res) => {
    const users = await User.find().select('-pass');
    res.json(users);
});

app.post('/api/users', auth, checkRole(['مسؤول']), async (req, res) => {
    const { name, pass, role } = req.body;
    if (!name || !pass) return res.status(400).json({ error: "الاسم وكلمة المرور مطلوبان" });
    const existing = await User.findOne({ name });
    if (existing) return res.status(400).json({ error: "المستخدم موجود" });
    const newUser = await User.create({ name, pass, role: role || "مشاهد", enabled: true });
    await logActivity(req.user.name, "إضافة مستخدم", `أضاف ${name}`);
    res.status(201).json({ success: true, user: { id: newUser._id, name: newUser.name, role: newUser.role, enabled: newUser.enabled } });
});

app.patch('/api/users/:id/toggle', auth, checkRole(['مسؤول']), async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "غير موجود" });
    if (user.name === 'admin') return res.status(400).json({ error: "لا يمكن تعطيل admin" });
    user.enabled = !user.enabled;
    await user.save();
    await logActivity(req.user.name, user.enabled ? "تفعيل" : "تعطيل", `${user.enabled ? 'فعّل' : 'عطّل'} ${user.name}`);
    res.json({ success: true, enabled: user.enabled });
});

app.put('/api/users/:id/password', auth, checkRole(['مسؤول']), async (req, res) => {
    const { newPassword } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "غير موجود" });
    user.pass = newPassword;
    await user.save();
    await logActivity(req.user.name, "تغيير كلمة مرور", `غيّر كلمة مرور ${user.name}`);
    res.json({ success: true });
});

app.delete('/api/users/:id', auth, checkRole(['مسؤول']), async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "غير موجود" });
    if (user.name === 'admin') return res.status(400).json({ error: "لا يمكن حذف admin" });
    await User.findByIdAndDelete(req.params.id);
    await logActivity(req.user.name, "حذف مستخدم", `حذف ${user.name}`);
    res.json({ success: true });
});

// Statistics
app.get('/api/statistics', auth, async (req, res) => {
    const total = await Vessel.countDocuments();
    const ok = await Vessel.countDocuments({ stat: 'صالح' });
    const maint = await Vessel.countDocuments({ stat: 'صيانة' });
    const broken = await Vessel.countDocuments({ stat: 'معطب' });
    res.json({ total, ok, maint, broken });
});

// Zones & Categories
app.get('/api/zones', auth, (req, res) => {
    res.json({ "الشمال": ["تونس", "بنزرت", "طبرقة"], "الساحل": ["سوسة", "المنستير", "نابل"], "الوسط": ["صفاقس", "المهدية", "قرقنة"], "الجنوب": ["جرجيس", "جربة", "قابس"] });
});
app.get('/api/categories', auth, (req, res) => {
    res.json(["البروق", "صقور", "خوافر", "زوارق مزدوجة", "طوافات"]);
});

// Logs (admin only)
app.get('/api/logs', auth, checkRole(['مسؤول']), async (req, res) => {
    const logs = await Log.find().sort({ date: -1 }).limit(200);
    res.json(logs);
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('✅ MongoDB connected');
        await initDefaultData();
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`👥 Default users: admin / 1234`);
        });
    })
    .catch(err => {
        console.error('❌ DB connection error:', err.message);
        process.exit(1);
    });
