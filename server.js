const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== قاعدة بيانات في الذاكرة ====================
let users = [
    { id: 1, username: "admin", password: "1234", role: "مسؤول", enabled: true },
    { id: 2, username: "editor", password: "1234", role: "محرر", enabled: true },
    { id: 3, username: "viewer", password: "1234", role: "مشاهد", enabled: true }
];

let vessels = [
    { id: 1, name: "البروق 1", num: "B001", len: 11, cat: "البروق", reg: "الشمال", zone: "تونس", port: "تونس", supp: "قاعدة الشمال", stat: "صالح", break: "", fDate: "", eDate: "", ref: "" },
    { id: 2, name: "صقر 1", num: "S001", len: 10, cat: "صقور", reg: "الساحل", zone: "سوسة", port: "سوسة", supp: "قاعدة الساحل", stat: "صالح", break: "", fDate: "", eDate: "", ref: "" },
    { id: 3, name: "خافرة 1", num: "K001", len: 20, cat: "خوافر", reg: "الوسط", zone: "صفاقس", port: "صفاقس", supp: "قاعدة الوسط", stat: "معطب", break: "عطل في المحرك", fDate: "2025-03-10", eDate: "2025-04-10", ref: "REF001" },
    { id: 4, name: "زورق 1", num: "Z001", len: 15, cat: "زوارق مزدوجة", reg: "الجنوب", zone: "جربة", port: "جربة", supp: "قاعدة الجنوب", stat: "صيانة", break: "صيانة دورية", fDate: "2025-03-15", eDate: "2025-04-05", ref: "REF002" },
    { id: 5, name: "طوافة 1", num: "T001", len: 35, cat: "طوافات", reg: "الشمال", zone: "بنزرت", port: "بنزرت", supp: "قاعدة الشمال", stat: "صالح", break: "", fDate: "", eDate: "", ref: "" }
];

let logs = [];
let tickets = [];
let nextId = 6;

// ==================== API Routes ====================

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password && u.enabled);
    
    if (user) {
        logs.unshift({
            id: Date.now(),
            user: user.username,
            role: user.role,
            action: "تسجيل دخول",
            details: "قام بتسجيل الدخول",
            date: new Date().toISOString()
        });
        res.json({ 
            success: true, 
            user: { id: user.id, username: user.username, role: user.role } 
        });
    } else {
        res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة" });
    }
});

// Get all vessels
app.get('/api/vessels', (req, res) => {
    res.json({ success: true, data: vessels });
});

// Add vessel
app.post('/api/vessels', (req, res) => {
    const vessel = req.body;
    if (!vessel.name) {
        return res.status(400).json({ success: false, message: "اسم المركب مطلوب" });
    }
    
    const newVessel = {
        id: nextId++,
        name: vessel.name,
        num: vessel.num || "",
        len: vessel.len || 0,
        cat: vessel.cat || "",
        reg: vessel.reg || "",
        zone: vessel.zone || "",
        port: vessel.port || "",
        supp: vessel.supp || "",
        stat: vessel.stat || "صالح",
        break: vessel.break || "",
        fDate: vessel.fDate || "",
        eDate: vessel.eDate || "",
        ref: vessel.ref || ""
    };
    
    vessels.push(newVessel);
    res.json({ success: true, message: "تم إضافة المركب بنجاح", data: newVessel });
});

// Update vessel
app.put('/api/vessels/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    
    if (index === -1) {
        return res.status(404).json({ success: false, message: "المركب غير موجود" });
    }
    
    vessels[index] = { ...vessels[index], ...req.body };
    res.json({ success: true, message: "تم تحديث المركب بنجاح" });
});

// Delete vessel
app.delete('/api/vessels/:id', (req, res) => {
    const id = parseInt(req.params.id);
    vessels = vessels.filter(v => v.id !== id);
    res.json({ success: true, message: "تم حذف المركب بنجاح" });
});

// Get users
app.get('/api/users', (req, res) => {
    res.json({ 
        success: true, 
        data: users.map(u => ({ 
            id: u.id, 
            username: u.username, 
            role: u.role, 
            enabled: u.enabled 
        })) 
    });
});

// Add user
app.post('/api/users', (req, res) => {
    const { username, password, role } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, message: "اسم المستخدم وكلمة المرور مطلوبان" });
    }
    
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ success: false, message: "اسم المستخدم موجود مسبقاً" });
    }
    
    const newUser = {
        id: users.length + 1,
        username: username,
        password: password,
        role: role || "مشاهد",
        enabled: true
    };
    
    users.push(newUser);
    res.json({ success: true, message: "تم إضافة المستخدم بنجاح" });
});

// Update user
app.put('/api/users/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const user = users.find(u => u.id === id);
    
    if (!user) {
        return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
    }
    
    if (req.body.role) user.role = req.body.role;
    if (req.body.enabled !== undefined) user.enabled = req.body.enabled;
    if (req.body.password) user.password = req.body.password;
    
    res.json({ success: true, message: "تم تحديث المستخدم بنجاح" });
});

// Delete user
app.delete('/api/users/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const adminCount = users.filter(u => u.role === 'مسؤول').length;
    const userToDelete = users.find(u => u.id === id);
    
    if (!userToDelete) {
        return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
    }
    
    if (userToDelete.role === 'مسؤول' && adminCount === 1) {
        return res.status(400).json({ success: false, message: "لا يمكن حذف المسؤول الوحيد" });
    }
    
    users = users.filter(u => u.id !== id);
    res.json({ success: true, message: "تم حذف المستخدم بنجاح" });
});

// Get logs
app.get('/api/logs', (req, res) => {
    res.json({ success: true, data: logs.slice(0, 200) });
});

// Get tickets
app.get('/api/tickets', (req, res) => {
    res.json({ success: true, data: tickets });
});

// Add ticket
app.post('/api/tickets', (req, res) => {
    const { userName, subject, message } = req.body;
    
    if (!subject || !message) {
        return res.status(400).json({ success: false, message: "العنوان والرسالة مطلوبان" });
    }
    
    const newTicket = {
        id: Date.now(),
        userName: userName || "مجهول",
        subject: subject,
        message: message,
        status: "قيد المعالجة",
        date: new Date().toISOString()
    };
    
    tickets.unshift(newTicket);
    res.json({ success: true, message: "تم إرسال التذكرة بنجاح" });
});

// Statistics
app.get('/api/statistics', (req, res) => {
    const total = vessels.length;
    const operational = vessels.filter(v => v.stat === 'صالح').length;
    const maintenance = vessels.filter(v => v.stat === 'صيانة').length;
    const broken = vessels.filter(v => v.stat === 'معطب').length;
    
    res.json({
        success: true,
        data: {
            total: total,
            operational: operational,
            maintenance: maintenance,
            broken: broken,
            readinessRate: total ? ((operational / total) * 100).toFixed(1) : 0
        }
    });
});

// Export
app.get('/api/export', (req, res) => {
    res.json({
        exportDate: new Date().toISOString(),
        vessels: vessels,
        users: users.map(u => ({ id: u.id, username: u.username, role: u.role }))
    });
});

// Import
app.post('/api/import', (req, res) => {
    const { vessels: importedVessels, users: importedUsers } = req.body;
    if (importedVessels) {
        vessels = importedVessels;
        nextId = Math.max(...vessels.map(v => v.id), 0) + 1;
    }
    if (importedUsers) {
        users = importedUsers.map(u => ({ ...u, password: u.password || "1234" }));
    }
    res.json({ success: true, message: "تم استيراد البيانات بنجاح" });
});

// ==================== Serve frontend ====================
app.use(express.static('.'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// ==================== Start Server ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`👤 admin / 1234`);
    console.log(`👤 editor / 1234`);
    console.log(`👤 viewer / 1234`);
});
