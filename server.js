const express = require('express');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = './data.json';

function readVessels() {
    if (!fs.existsSync(DB_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch(e) { return []; }
}

function writeVessels(vessels) {
    fs.writeFileSync(DB_FILE, JSON.stringify(vessels, null, 2));
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === '1234') {
        res.json({ success: true, user: { id: 1, username: 'admin', role: 'مسؤول' } });
    } else {
        res.status(401).json({ error: 'بيانات غير صحيحة' });
    }
});

app.get('/api/vessels', (req, res) => {
    res.json(readVessels());
});

app.post('/api/vessels', (req, res) => {
    const vessels = readVessels();
    const newVessel = { id: Date.now(), ...req.body };
    vessels.push(newVessel);
    writeVessels(vessels);
    res.json({ success: true, vessel: newVessel });
});

app.put('/api/vessels/:id', (req, res) => {
    const vessels = readVessels();
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    if (index !== -1) {
        vessels[index] = { ...vessels[index], ...req.body, id: id };
        writeVessels(vessels);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

app.delete('/api/vessels/:id', (req, res) => {
    let vessels = readVessels();
    const id = parseInt(req.params.id);
    vessels = vessels.filter(v => v.id !== id);
    writeVessels(vessels);
    res.json({ success: true });
});

app.get('/api/users', (req, res) => {
    res.json([{ id: 1, username: 'admin', role: 'مسؤول', enabled: true }]);
});

app.get('/api/stats', (req, res) => {
    const vessels = readVessels();
    const total = vessels.length;
    const salih = vessels.filter(v => v.status === 'صالح').length;
    const mo3atab = vessels.filter(v => v.status === 'معطب').length;
    const siyana = vessels.filter(v => v.status === 'صيانة').length;
    const efficiency = total > 0 ? ((salih / total) * 100).toFixed(1) : 0;
    res.json({ total, salih, mo3atab, siyana, efficiency });
});

app.get('/api/tickets', (req, res) => { res.json([]); });
app.post('/api/tickets', (req, res) => { res.json({ success: true }); });
app.get('/api/logs', (req, res) => { res.json([]); });
app.get('/api/export', (req, res) => { res.json({ vessels: readVessels() }); });

app.post('/api/import', (req, res) => {
    if (req.body.vessels) {
        writeVessels(req.body.vessels);
        res.json({ success: true, imported: req.body.vessels.length });
    } else {
        res.status(400).json({ error: 'بيانات غير صالحة' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
});
