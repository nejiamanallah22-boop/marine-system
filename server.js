const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== الاتصال بـ MongoDB Atlas ====================
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://hamza:hamza123@cluster0.ajb5w1z.mongodb.net/marine_fleet?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ متصل بـ MongoDB Atlas'))
    .catch(err => console.error('❌ خطأ في الاتصال:', err.message));

// ==================== نماذج قاعدة البيانات ====================
// نموذج المركب
const vesselSchema = new mongoose.Schema({
    name: { type: String, required: true },
    number: { type: String, required: true, unique: true },
    length: { type: Number, default: 0 },
    category: { type: String, default: '' },
    region: { type: String, default: '' },
    zone: { type: String, default: '' },
    port: { type: String, default: '' },
    reinforcement: { type: String, default: '' },
    status: { type: String, default: 'نشط' },
    damage: { type: String, default: '' },
    damageDate: { type: Date },
    endDate: { type: Date },
    reference: { type: String, default: '' }
}, { timestamps: true });

const Vessel = mongoose.model('Vessel', vesselSchema);

// نموذج تذكرة الدعم
const ticketSchema = new mongoose.Schema({
    name: { type: String, required: true },
    region: { type: String, required: true },
    zone: { type: String, required: true },
    status: { type: String, default: 'جديد' },
    damage: { type: String, default: '' },
    damageDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    reference: { type: String, unique: true, sparse: true },
    userId: { type: String, default: 'anonymous' },
    createdAt: { type: Date, default: Date.now }
});

const Ticket = mongoose.model('Ticket', ticketSchema);

// ==================== Middleware ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'marine_secret_key_2025',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));

// ==================== مسارات المصادقة ====================
app.get('/api/check-session', (req, res) => {
    res.json({ loggedIn: !!req.session.loggedIn });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === '1234') {
        req.session.loggedIn = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// ==================== مسارات المراكب ====================
app.get('/api/vessels', async (req, res) => {
    if (!req.session.loggedIn) return res.status(401).json([]);
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json(vessels);
    } catch (err) {
        res.status(500).json([]);
    }
});

app.post('/api/vessels', async (req, res) => {
    if (!req.session.loggedIn) return res.status(401).json({ error: 'غير مصرح' });
    try {
        const existing = await Vessel.findOne({ number: req.body.number });
        if (existing) return res.status(400).json({ error: 'رقم المركب موجود مسبقاً' });
        const vessel = new Vessel(req.body);
        await vessel.save();
        res.status(201).json(vessel);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/vessels/:number', async (req, res) => {
    if (!req.session.loggedIn) return res.status(401).json({ error: 'غير مصرح' });
    try {
        await Vessel.findOneAndDelete({ number: req.params.number });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== مسارات الدعم ====================
app.post('/api/support', async (req, res) => {
    try {
        const ticket = new Ticket(req.body);
        await ticket.save();
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.get('/api/support', async (req, res) => {
    if (!req.session.loggedIn) return res.status(401).json([]);
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        res.json(tickets);
    } catch (err) {
        res.status(500).json([]);
    }
});

// ==================== تشغيل الخادم ====================
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`);
    console.log(`🔐 admin / 1234`);
});
