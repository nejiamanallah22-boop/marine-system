const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose'); // <-- أضف mongoose

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------- الاتصال بقاعدة البيانات --------------------
// استبدل الرابط أدناه برابط MongoDB Atlas الذي حصلت عليه
const MONGO_URI = 'mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/marine_fleet?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ متصل بـ MongoDB Atlas'))
    .catch(err => console.log('❌ فشل الاتصال بـ MongoDB:', err.message));

// -------------------- نموذج المركب (Schema) --------------------
const vesselSchema = new mongoose.Schema({
    name: String, num: String, len: Number, reg: String, zone: String,
    port: String, supp: String, stat: String, break: String,
    fDate: String, eDate: String, ref: String, cat: String
});
const Vessel = mongoose.model('Vessel', vesselSchema);

// -------------------- نموذج المستخدم --------------------
const userSchema = new mongoose.Schema({
    username: String, password: String, role: String, enabled: Boolean
});
const User = mongoose.model('User', userSchema);

// -------------------- نموذج التذكرة --------------------
const ticketSchema = new mongoose.Schema({
    userName: String, userRole: String, subject: String, message: String,
    date: String, time: String, status: String, replies: Array
});
const Ticket = mongoose.model('Ticket', ticketSchema);

// -------------------- نموذج جلسة المستخدم --------------------
const sessionSchema = new mongoose.Schema({
    username: String, role: String, ip: String, country: String, city: String,
    lat: Number, lon: Number, loginTime: String
});
const UserSession = mongoose.model('UserSession', sessionSchema);

// ==================== Middleware ====================
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'secret_' + Date.now(),
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ==================== مسارات API (تعمل مع MongoDB) ====================
app.post('/api/login', async (req, res) => {
    const { username, password, location } = req.body;
    const user = await User.findOne({ username, password });
    if (!user || !user.enabled) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    let lat = 36.8065, lon = 10.1815, city = 'تونس', country = 'تونس';
    if (location && location.lat && location.lon) {
        lat = location.lat; lon = location.lon;
        city = location.city || 'الموقع الحقيقي';
        country = location.country || 'المستخدم';
    }

    const sessionData = new UserSession({
        username: user.username, role: user.role, ip: req.ip, country, city, lat, lon,
        loginTime: new Date().toISOString()
    });
    await sessionData.save();

    req.session.userId = user.id;
    req.session.userName = user.username;
    req.session.userRole = user.role;

    res.json({ success: true, name: user.username, role: user.role, location: { lat, lon, city, country } });
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

app.get('/api/vessels', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    const vessels = await Vessel.find();
    res.json(vessels);
});

app.post('/api/vessels', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    const newVessel = new Vessel(req.body);
    await newVessel.save();
    res.json({ success: true });
});

app.put('/api/vessels/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    await Vessel.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true });
});

app.delete('/api/vessels/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    await Vessel.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.get('/api/users', async (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    const users = await User.find().select('-password');
    res.json(users);
});

app.post('/api/users', async (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    const newUser = new User(req.body);
    await newUser.save();
    res.json({ success: true });
});

app.get('/api/tickets', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    const tickets = await Ticket.find();
    res.json(tickets);
});

app.post('/api/tickets', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مصرح' });
    const newTicket = new Ticket(req.body);
    await newTicket.save();
    res.json({ success: true });
});

app.get('/api/sessions/map', async (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'مسؤول') return res.status(403).json({ error: 'غير مصرح' });
    const sessions = await UserSession.find();
    res.json(sessions);
});

app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`);
    console.log(`🔐 admin / 1234`);
});