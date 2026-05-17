const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.SECRET || 'marine_secret_key';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ================= MongoDB Connection =================
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is required in environment variables');
    process.exit(1);
}

let db;
let usersCollection;
let vesselsCollection;
let logsCollection;
let ticketsCollection;

async function connectDB() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        console.log('✅ Connected to MongoDB Atlas');
        
        db = client.db('marine_fleet');
        usersCollection = db.collection('users');
        vesselsCollection = db.collection('vessels');
        logsCollection = db.collection('logs');
        ticketsCollection = db.collection('tickets');
        
        // Create indexes
        await usersCollection.createIndex({ name: 1 }, { unique: true });
        await vesselsCollection.createIndex({ id: 1 });
        
        // Initialize default data if empty
        await initDefaultData();
        
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        return false;
    }
}

async function initDefaultData() {
    // Check if users exist
    const userCount = await usersCollection.countDocuments();
    if (userCount === 0) {
        const adminPass = await bcrypt.hash('1234', 10);
        const editorPass = await bcrypt.hash('1234', 10);
        const viewerPass = await bcrypt.hash('1234', 10);
        
        await usersCollection.insertMany([
            { id: 1, name: "admin", pass: adminPass, role: "مسؤول", enabled: 1 },
            { id: 2, name: "editor", pass: editorPass, role: "محرر", enabled: 1 },
            { id: 3, name: "viewer", pass: viewerPass, role: "مشاهد", enabled: 1 }
        ]);
        console.log('✅ Default users created');
    }
    
    // Check if vessels exist
    const vesselCount = await vesselsCollection.countDocuments();
    if (vesselCount === 0) {
        const defaultVessels = [
            { id: 101, name: "البروق 1", num: "B001", len: 11, reg: "الشمال", zone: "تونس", port: "تونس", supp: "قاعدة الشمال", stat: "صالح", breakType: "", fDate: null, eDate: null, ref: "", cat: "البروق" },
            { id: 102, name: "صقر 1", num: "S001", len: 10, reg: "الساحل", zone: "سوسة", port: "سوسة", supp: "قاعدة الساحل", stat: "صالح", breakType: "", fDate: null, eDate: null, ref: "", cat: "صقور" },
            { id: 103, name: "خافرة 1", num: "K001", len: 20, reg: "الوسط", zone: "صفاقس", port: "صفاقس", supp: "قاعدة الوسط", stat: "معطب", breakType: "عطل في المحرك", fDate: "2025-03-10", eDate: "2025-04-10", ref: "REF001", cat: "خوافر" },
            { id: 104, name: "زورق 1", num: "Z001", len: 15, reg: "الجنوب", zone: "جربة", port: "جربة", supp: "قاعدة الجنوب", stat: "صيانة", breakType: "صيانة دورية", fDate: "2025-03-15", eDate: "2025-04-05", ref: "REF002", cat: "زوارق مزدوجة" },
            { id: 105, name: "طوافة 1", num: "T001", len: 35, reg: "الشمال", zone: "بنزرت", port: "بنزرت", supp: "قاعدة الشمال", stat: "صالح", breakType: "", fDate: null, eDate: null, ref: "", cat: "طوافات" }
        ];
        await vesselsCollection.insertMany(defaultVessels);
        console.log('✅ Default vessels created');
    }
}

// Helper to get next ID
async function getNextVesselId() {
    const lastVessel = await vesselsCollection.find().sort({ id: -1 }).limit(1).toArray();
    return lastVessel.length > 0 ? lastVessel[0].id + 1 : 101;
}

// ================= JWT Middleware =================
function auth(req, res, next) {
    const token = req.headers.authorization;
    
    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }
    
    try {
        const verified = jwt.verify(token, SECRET);
        req.user = verified;
        next();
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// ================= LOGIN =================
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const user = await usersCollection.findOne({ name: username });
        
        if (!user) {
            return res.status(400).json({ error: 'Utilisateur invalide' });
        }
        
        if (!user.enabled) {
            return res.status(403).json({ error: 'Compte désactivé' });
        }
        
        const valid = await bcrypt.compare(password, user.pass);
        
        if (!valid) {
            return res.status(400).json({ error: 'Mot de passe incorrect' });
        }
        
        const token = jwt.sign({
            id: user.id,
            name: user.name,
            role: user.role
        }, SECRET, { expiresIn: '7d' });
        
        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= GET VESSELS =================
app.get('/api/vessels', auth, async (req, res) => {
    try {
        const vessels = await vesselsCollection.find().sort({ id: -1 }).toArray();
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= ADD VESSEL =================
app.get('/api/vessels/getNextId', auth, async (req, res) => {
    try {
        const nextId = await getNextVesselId();
        res.json({ nextId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/vessels', auth, async (req, res) => {
    try {
        const vessel = req.body;
        const newId = await getNextVesselId();
        
        const newVessel = {
            id: newId,
            ...vessel
        };
        
        await vesselsCollection.insertOne(newVessel);
        res.json({ success: true, id: newId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= UPDATE VESSEL =================
app.put('/api/vessels/:id', auth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const vessel = req.body;
        
        await vesselsCollection.updateOne(
            { id: id },
            { $set: vessel }
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= DELETE VESSEL =================
app.delete('/api/vessels/:id', auth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await vesselsCollection.deleteOne({ id: id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= USERS =================
app.get('/api/users', auth, async (req, res) => {
    try {
        if (req.user.role !== 'مسؤول') {
            return res.status(403).json({ error: 'Not allowed' });
        }
        
        const users = await usersCollection.find(
            {},
            { projection: { id: 1, name: 1, role: 1, enabled: 1 } }
        ).toArray();
        
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users', auth, async (req, res) => {
    try {
        if (req.user.role !== 'مسؤول') {
            return res.status(403).json({ error: 'Not allowed' });
        }
        
        const { name, pass, role } = req.body;
        const hash = await bcrypt.hash(pass, 10);
        
        const lastUser = await usersCollection.find().sort({ id: -1 }).limit(1).toArray();
        const newId = lastUser.length > 0 ? lastUser[0].id + 1 : 4;
        
        await usersCollection.insertOne({
            id: newId,
            name: name,
            pass: hash,
            role: role,
            enabled: 1
        });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/users/:id/toggle', auth, async (req, res) => {
    try {
        if (req.user.role !== 'مسؤول') {
            return res.status(403).json({ error: 'Not allowed' });
        }
        
        const id = parseInt(req.params.id);
        const user = await usersCollection.findOne({ id: id });
        
        if (user) {
            await usersCollection.updateOne(
                { id: id },
                { $set: { enabled: user.enabled ? 0 : 1 } }
            );
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/users/:id/password', auth, async (req, res) => {
    try {
        if (req.user.role !== 'مسؤول') {
            return res.status(403).json({ error: 'Not allowed' });
        }
        
        const id = parseInt(req.params.id);
        const { newPassword } = req.body;
        const hash = await bcrypt.hash(newPassword, 10);
        
        await usersCollection.updateOne(
            { id: id },
            { $set: { pass: hash } }
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/users/:id', auth, async (req, res) => {
    try {
        if (req.user.role !== 'مسؤول') {
            return res.status(403).json({ error: 'Not allowed' });
        }
        
        const id = parseInt(req.params.id);
        await usersCollection.deleteOne({ id: id });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= STATISTICS =================
app.get('/api/statistics', auth, async (req, res) => {
    try {
        const total = await vesselsCollection.countDocuments();
        const ok = await vesselsCollection.countDocuments({ stat: 'صالح' });
        const maint = await vesselsCollection.countDocuments({ stat: 'صيانة' });
        const broken = await vesselsCollection.countDocuments({ stat: 'معطب' });
        
        res.json({ total, ok, maint, broken });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= ZONES =================
app.get('/api/zones', auth, (req, res) => {
    const zones = {
        "الشمال": ["تونس", "بنزرت", "طبرقة"],
        "الساحل": ["سوسة", "المنستير", "نابل"],
        "الوسط": ["صفاقس", "المهدية", "قرقنة"],
        "الجنوب": ["جرجيس", "جربة", "قابس"]
    };
    res.json(zones);
});

// ================= CATEGORIES =================
app.get('/api/categories', auth, (req, res) => {
    const categories = ["البروق", "صقور", "خوافر", "زوارق مزدوجة", "طوافات"];
    res.json(categories);
});

// ================= SUPPORT TICKETS =================
app.post('/api/tickets', auth, async (req, res) => {
    try {
        const { subject, message } = req.body;
        
        const lastTicket = await ticketsCollection.find().sort({ id: -1 }).limit(1).toArray();
        const newId = lastTicket.length > 0 ? lastTicket[0].id + 1 : 1;
        
        await ticketsCollection.insertOne({
            id: newId,
            userName: req.user.name,
            subject: subject,
            message: message,
            status: 'قيد المعالجة',
            date: new Date().toISOString()
        });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/tickets', auth, async (req, res) => {
    try {
        const tickets = await ticketsCollection.find().sort({ id: -1 }).toArray();
        res.json(tickets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= LOGS =================
app.post('/api/logs', auth, async (req, res) => {
    try {
        const { action, details } = req.body;
        
        await logsCollection.insertOne({
            userName: req.user.name,
            action: action,
            details: details,
            date: new Date().toISOString()
        });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/logs', auth, async (req, res) => {
    try {
        if (req.user.role !== 'مسؤول') {
            return res.status(403).json({ error: 'Not allowed' });
        }
        
        const logs = await logsCollection.find().sort({ date: -1 }).limit(100).toArray();
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= FRONTEND =================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================= START SERVER =================
app.listen(PORT, async () => {
    const connected = await connectDB();
    if (connected) {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`✅ Database: MongoDB Atlas`);
        console.log(`👥 Users: admin/1234, editor/1234, viewer/1234`);
    } else {
        console.log(`❌ Server running but database connection failed`);
        console.log(`📌 Make sure MONGODB_URI environment variable is set correctly`);
    }
});
