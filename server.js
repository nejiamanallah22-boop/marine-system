const express = require('express');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = './data.json';

if (!fs.existsSync(DB_FILE)) {
    const defaultData = {
        users: [
            { id: 1, username: 'admin', password: '1234', role: 'مسؤول', enabled: true }
        ],
        vessels: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2));
}

function readDB() {
    return JSON.parse(fs.readFileSync(DB_FILE));
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.username === username && u.password === password);
    if (user) {
        res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
    } else {
        res.status(401).json({ error: 'بيانات غير صحيحة' });
    }
});

app.get('/api/vessels', (req, res) => {
    const db = readDB();
    res.json(db.vessels);
});

app.post('/api/vessels', (req, res) => {
    const db = readDB();
    const newVessel = { id: Date.now(), ...req.body };
    db.vessels.push(newVessel);
    writeDB(db);
    res.json({ success: true, vessel: newVessel });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
