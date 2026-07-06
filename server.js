const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== البيانات ====================
const DEFAULT_USERS = [
    { name: 'admin', pass: '1234', role: 'مسؤول', enabled: true },
    { name: 'user', pass: '1234', role: 'محرر', enabled: true },
    { name: 'viewer', pass: '1234', role: 'مشاهد', enabled: true }
];

let memoryVessels = [
    { _id: '1', name: 'المركب 1', num: 'M001', len: 12, reg: 'الشمال', zone: 'تونس', port: 'تونس', supp: 'قاعدة الشمال', stat: 'صالح', break: '', fDate: '2024-01-01', eDate: '2024-12-31', ref: 'REF001', cat: 'صقور' },
    { _id: '2', name: 'المركب 2', num: 'M002', len: 8, reg: 'الساحل', zone: 'سوسة', port: 'سوسة', supp: 'قاعدة الساحل', stat: 'صيانة', break: 'محرك', fDate: '2024-01-15', eDate: '2024-02-15', ref: 'REF002', cat: 'البروق' },
    { _id: '3', name: 'المركب 3', num: 'M003', len: 15, reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: 'قاعدة الوسط', stat: 'معطب', break: 'هيكل', fDate: '2024-01-20', eDate: '', ref: 'REF003', cat: 'خوافر' },
    { _id: '4', name: 'المركب 4', num: 'M004', len: 11, reg: 'الجنوب', zone: 'جرجيس', port: 'جرجيس', supp: 'قاعدة الجنوب', stat: 'صالح', break: '', fDate: '2024-02-01', eDate: '2024-12-31', ref: 'REF004', cat: 'البروق' },
    { _id: '5', name: 'المركب 5', num: 'M005', len: 25, reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: 'قاعدة الشمال', stat: 'صالح', break: '', fDate: '2024-02-01', eDate: '2024-12-31', ref: 'REF005', cat: 'خوافر' }
];

let memoryTickets = [];
let memoryLogs = [];
let memoryLocations = [];
let onlineUsers = new Set();

// ==================== دوال مساعدة ====================
function getCurrentDate() {
    const now = new Date();
    return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
}

function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

// ==================== مسارات API ====================
app.post('/api/login', (req, res) => {
    const { name, pass } = req.body;
    if (!name || !pass) return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    const user = DEFAULT_USERS.find(u => u.name === name && u.pass === pass && u.enabled === true);
    if (!user) return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    res.json({ id: user.name, name: user.name, role: user.role });
});

app.post('/api/logout', (req, res) => { res.json({ success: true }); });

app.get('/api/vessels', (req, res) => { res.json(memoryVessels); });
app.post('/api/vessels', (req, res) => {
    const vessel = { ...req.body, _id: Date.now().toString() };
    memoryVessels.push(vessel);
    res.status(201).json(vessel);
});
app.put('/api/vessels/:id', (req, res) => {
    const index = memoryVessels.findIndex(v => v._id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'المركب غير موجود' });
    memoryVessels[index] = { ...memoryVessels[index], ...req.body };
    res.json(memoryVessels[index]);
});
app.delete('/api/vessels/:id', (req, res) => {
    const index = memoryVessels.findIndex(v => v._id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'المركب غير موجود' });
    memoryVessels.splice(index, 1);
    res.json({ success: true });
});

app.get('/api/users', (req, res) => {
    const users = DEFAULT_USERS.map(u => {
        const { pass, ...rest } = u;
        return { ...rest, _id: u.name };
    });
    res.json(users);
});
app.post('/api/users', (req, res) => {
    const { name, pass, role } = req.body;
    if (DEFAULT_USERS.find(u => u.name === name)) return res.status(400).json({ error: 'اسم المستخدم موجود' });
    const user
