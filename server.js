const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------- الاتصال بقاعدة البيانات --------------------
const MONGO_URI = 'mongodb+srv://hamza:hamza123@cluster0.ajb5w1z.mongodb.net/marine_fleet?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ متصل بـ MongoDB Atlas'))
    .catch(err => console.log('❌ فشل الاتصال:', err.message));

// -------------------- نموذج المركب --------------------
const vesselSchema = new mongoose.Schema({
    name: String,
    number: String,
    length: Number,
    category: String,
    region: String,
    zone: String,
    port: String,
    status: String
});
const Vessel = mongoose.model('Vessel', vesselSchema);

// -------------------- نموذج طلب الدعم --------------------
const ticketSchema = new mongoose.Schema({
    name: String,
    region: String,
    zone: String,
    damage: String,
    damageDate: Date,
    reference: String
});
const Ticket = mongoose.model('Ticket', ticketSchema);

// -------------------- Middleware --------------------
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'simple_secret',
    resave: false,
    saveUninitialized: true
}));

// -------------------- مسارات المصادقة --------------------
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

// -------------------- مسارات المراكب --------------------
app.get('/api/vessels', async (req, res) => {
    if (!req.session.loggedIn) return res.status(401).json([]);
    const vessels = await Vessel.find();
    res.json(vessels);
});

app.post('/api/vessels', async (req, res) => {
    if (!req.session.loggedIn) return res.status(401).json({ error: 'غير مصرح' });
    try {
        const newVessel = new Vessel(req.body);
        await newVessel.save();
        res.status(201).json(newVessel);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/vessels/:number', async (req, res) => {
    if (!req.session.loggedIn) return res.status(401).json({ error: 'غير مصرح' });
    await Vessel.findOneAndDelete({ number: req.params.number });
    res.json({ success: true });
});

// -------------------- مسارات الدعم --------------------
app.post('/api/support', async (req, res) => {
    try {
        const ticket = new Ticket(req.body);
        await ticket.save();
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.get('/api/support', async (req, res) => {
    if (!req.session.loggedIn) return res.status(401).json([]);
    const tickets = await Ticket.find();
    res.json(tickets);
});

// -------------------- تشغيل الخادم --------------------
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`);
    console.log(`🔐 admin / 1234`);
});
