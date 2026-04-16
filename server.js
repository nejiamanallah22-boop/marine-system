const express = require('express');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// قاعدة بيانات بسيطة (ملف JSON)
const DB_FILE = './data.json';

// التأكد من وجود ملف البيانات
if (!fs.existsSync(DB_FILE)) {
    const defaultData = {
        users: [
            { id: 1, username: 'admin', password: '1234', role: 'مسؤول', enabled: true }
        ],
        vessels: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2));
}

// قراءة البيانات
function readDB() {
    return JSON.parse(fs.readFileSync(DB_FILE));
}

// كتابة البيانات
function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.username === username && u.password === password && u.enabled);
    
    if (user) {
        res.json({ 
            success: true, 
            user: { id: user.id, username: user.username, role: user.role } 
        });
    } else {
        res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
});

// جلب المراكب
app.get('/api/vessels', (req, res) => {
    const db = readDB();
    res.json(db.vessels || []);
});

// إضافة مركب
app.post('/api/vessels', (req, res) => {
    const db = readDB();
    const newVessel = { id: Date.now(), ...req.body };
    db.vessels.push(newVessel);
    writeDB(db);
    res.json({ success: true, vessel: newVessel });
});

// حذف مركب
app.delete('/api/vessels/:id', (req, res) => {
    const db = readDB();
    db.vessels = db.vessels.filter(v => v.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📁 Database: ${DB_FILE}`);
    console.log(`🔐 admin / 1234`);
});
