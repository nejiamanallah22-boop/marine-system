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
    const { region, status, search } = req.query;
    let filtered = [...vessels];
    
    if (region && region !== 'الكل') {
        filtered = filtered.filter(v => v.reg === region);
    }
    if (status && status !== 'الكل') {
        filtered = filtered.filter(v => v.stat === status);
    }
    if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(v => 
            v.name.toLowerCase().includes(s) || 
            (v.num && v.num.toLowerCase().includes(s)) ||
            (v.reg && v.reg.toLowerCase().includes(s))
        );
    }
    
    res.json({ success: true, data: filtered });
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

// ==================== Serve HTML مباشرة ====================
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>منظومة الوسائل البحرية</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); min-height: 100vh; direction: rtl; }
        .login-container { display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
        .login-card { background: rgba(255,255,255,0.95); border-radius: 20px; padding: 40px; width: 100%; max-width: 400px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); backdrop-filter: blur(10px); }
        .login-card h2 { color: #2d3748; margin-bottom: 30px; text-align: center; font-size: 24px; }
        .login-card input { width: 100%; padding: 12px 15px; margin-bottom: 15px; border: 2px solid #e2e8f0; border-radius: 10px; font-size: 16px; transition: border-color 0.3s; }
        .login-card input:focus { outline: none; border-color: #667eea; }
        .login-card button { width: 100%; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 10px; font-size: 18px; cursor: pointer; transition: transform 0.2s; }
        .login-card button:hover { transform: translateY(-2px); }
        .app-container { display: none; max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { background: rgba(255,255,255,0.95); border-radius: 15px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 20px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; }
        .nav { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
        .nav button { padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: all 0.3s; }
        .nav button:hover { transform: translateY(-2px); box-shadow: 0 4px 15px rgba(0,0,0,0.2); }
        .page { display: none; background: rgba(255,255,255,0.95); border-radius: 15px; padding: 20px; box-shadow: 0 2px 20px rgba(0,0,0,0.1); }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: center; font-size: 14px; }
        th { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
        tr:hover { background: #f8f9fa; }
        .status-good { color: #27ae60; font-weight: bold; }
        .status-broken { color: #e74c3c; font-weight: bold; }
        .status-maintenance { color: #f39c12; font-weight: bold; }
        .btn { padding: 5px 12px; margin: 2px; border: none; border-radius: 5px; cursor: pointer; font-size: 13px; transition: all 0.2s; }
        .btn-edit { background: #f39c12; color: white; }
        .btn-delete { background: #e74c3c; color: white; }
        .btn-save { background: #27ae60; color: white; padding: 10px 20px; }
        .btn:hover { opacity: 0.8; transform: scale(0.95); }
        .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 20px; background: #f8f9fa; padding: 15px; border-radius: 10px; }
        .form-grid input, .form-grid select { padding: 8px 12px; border: 1px solid #ddd; border-radius: 5px; font-size: 14px; }
        .form-grid input:focus, .form-grid select:focus { outline: none; border-color: #667eea; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .stat-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; border-radius: 10px; text-align: center; }
        .stat-card .number { font-size: 32px; font-weight: bold; }
        .search-box { width: 100%; padding: 10px 15px; margin-bottom: 15px; border: 2px solid #e2e8f0; border-radius: 10px; font-size: 16px; }
        .search-box:focus { outline: none; border-color: #667eea; }
        .hidden { display: none; }
        .role-badge { background: #ffd700; color: #2d3748; padding: 4px 12px; border-radius: 20px; font-weight: bold; }
        @media (max-width: 768px) { 
            .form-grid { grid-template-columns: 1fr; }
            .nav button { flex: 1; font-size: 12px; padding: 8px; }
            th, td { font-size: 12px; padding: 5px; }
            .header { flex-direction: column; gap: 10px; }
        }
        @media print { .nav, .form-grid, .btn, .search-box { display: none; } }
    </style>
</head>
<body>
    <div class="login-container" id="loginContainer">
        <div class="login-card">
            <h2>⚓ منظومة الوسائل البحرية</h2>
            <input type="text" id="username" placeholder="اسم المستخدم">
            <input type="password" id="password" placeholder="كلمة المرور">
            <button onclick="login()">🚀 دخول</button>
            <div id="loginError" style="color: #e74c3c; margin-top: 10px; text-align: center;"></div>
            <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 10px; text-align: center; font-size: 13px; color: #666;">
                <p><strong style="color:#2d3748;">admin</strong> / 1234 <span class="role-badge">مسؤول</span></p>
                <p><strong style="color:#2d3748;">editor</strong> / 1234 <span class="role-badge">محرر</span></p>
                <p><strong style="color:#2d3748;">viewer</strong> / 1234 <span class="role-badge">مشاهد</span></p>
            </div>
        </div>
    </div>

    <div class="app-container" id="appContainer">
        <div class="header">
            <h1 style="color:#2d3748;">⚓ منظومة متابعة الوسائل البحرية</h1>
            <div>
                <span id="userInfo" style="margin-left: 15px;"></span>
                <button onclick="logout()" class="btn" style="background: #e74c3c; color: white; padding: 8px 20px;">🚪 خروج</button>
            </div>
        </div>

        <div class="nav" id="navButtons">
            <button onclick="showPage('main')" style="background: #667eea; color: white;">🏠 السجل العام</button>
            <button onclick="showPage('maint')" style="background: #f39c12; color: white;">🛠️ سجل الصيانة</button>
            <button onclick="showPage('eff')" style="background: #27ae60; color: white;">📈 جاهزية الأسطول</button>
            <button onclick="showPage('support')" style="background: #3498db; color: white;">📞 الدعم الفني</button>
            <button id="trackBtn" onclick="showPage('track')" style="background: #9b59b6; color: white; display: none;">📊 التتبع</button>
            <button id="usersBtn" onclick="showPage('users')" style="background: #e74c3c; color: white; display: none;">👥 المستخدمين</button>
            <button onclick="window.print()" style="background: #1abc9c; color: white;">🖨️ طباعة</button>
        </div>

        <!-- السجل العام -->
        <div id="pageMain" class="page">
            <div class="form-grid" id="vesselForm">
                <input type="text" id="vesselName" placeholder="اسم المركب *">
                <input type="text" id="vesselNum" placeholder="الرقم">
                <input type="number" id="vesselLen" placeholder="الطول (م)">
                <select id="vesselReg">
                    <option value="">الإقليم</option>
                    <option value="الشمال">الشمال</option>
                    <option value="الساحل">الساحل</option>
                    <option value="الوسط">الوسط</option>
                    <option value="الجنوب">الجنوب</option>
                </select>
                <input type="text" id="vesselZone" placeholder="المنطقة">
                <input type="text" id="vesselPort" placeholder="الميناء">
                <input type="text" id="vesselSupp" placeholder="مكان التعزيز">
                <select id="vesselStatus">
                    <option value="صالح">صالح</option>
                    <option value="معطب">معطب</option>
                    <option value="صيانة">صيانة</option>
                </select>
                <input type="text" id="vesselBreak" placeholder="نوع العطب">
                <input type="date" id="vesselDate" placeholder="تاريخ العطب">
                <input type="date" id="vesselEnd" placeholder="تاريخ الانتهاء">
                <input type="text" id="vesselRef" placeholder="المرجع">
                <button class="btn-save" onclick="saveVessel()">✅ حفظ</button>
            </div>
            <input type="text" id="searchInput" class="search-box" placeholder="🔍 بحث باسم المركب أو الإقليم..." onkeyup="filterVessels()">
            <div id="vesselsTable"></div>
        </div>

        <!-- سجل الصيانة -->
        <div id="pageMaint" class="page">
            <div id="maintenanceTable"></div>
        </div>

        <!-- الجاهزية -->
        <div id="pageEff" class="page">
            <div class="stats" id="statsContainer"></div>
            <canvas id="chartCanvas" style="max-height: 400px; max-width: 100%;"></canvas>
        </div>

        <!-- الدعم -->
        <div id="pageSupport" class="page">
            <h3 style="color:#2d3748;">📞 مركز الدعم الفني</h3>
            <input type="text" id="ticketSubject" placeholder="عنوان التذكرة" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #e2e8f0; border-radius: 10px;">
            <textarea id="ticketMessage" rows="5" placeholder="تفاصيل المشكلة..." style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 10px;"></textarea>
            <button onclick="sendTicket()" style="background: #27ae60; color: white; padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer;">📨 إرسال</button>
            <div id="ticketsList" style="margin-top: 20px;"></div>
        </div>

        <!-- التتبع -->
        <div id="pageTrack" class="page">
            <div id="logsTable"></div>
        </div>

        <!-- المستخدمين -->
        <div id="pageUsers" class="page">
            <div class="form-grid">
                <input type="text" id="newUsername" placeholder="اسم المستخدم">
                <input type="password" id="newPassword" placeholder="كلمة المرور">
                <select id="newRole">
                    <option value="مشاهد">مشاهد</option>
                    <option value="محرر">محرر</option>
                    <option value="مسؤول">مسؤول</option>
                </select>
                <button class="btn-save" onclick="addUser()">➕ إضافة مستخدم</button>
            </div>
            <div id="usersTable"></div>
        </div>
    </div>

    <script>
        let currentUser = null;
        let allVessels = [];
        let chart = null;

        async function login() {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                
                if (data.success) {
                    currentUser = data.user;
                    document.getElementById('loginContainer').style.display = 'none';
                    document.getElementById('appContainer').style.display = 'block';
                    
                    const roleText = currentUser.role === 'مسؤول' ? 'مسؤول' : (currentUser.role === 'محرر' ? 'محرر' : 'مشاهد');
                    document.getElementById('userInfo').innerHTML = \`👤 \${currentUser.username} <span class="role-badge">\${roleText}</span>\`;
                    
                    const isAdmin = currentUser.role === 'مسؤول';
                    const isViewer = currentUser.role === 'مشاهد';
                    
                    document.getElementById('trackBtn').style.display = isAdmin ? 'inline-block' : 'none';
                    document.getElementById('usersBtn').style.display = isAdmin ? 'inline-block' : 'none';
                    document.getElementById('vesselForm').style.display = isViewer ? 'none' : 'grid';
                    
                    showPage('main');
                    loadVessels();
                    loadStatistics();
                } else {
                    document.getElementById('loginError').innerText = data.message;
                }
            } catch(err) {
                document.getElementById('loginError').innerText = '❌ خطأ في الاتصال بالخادم';
            }
        }

        function logout() {
            currentUser = null;
            document.getElementById('loginContainer').style.display = 'flex';
            document.getElementById('appContainer').style.display = 'none';
            document.getElementById('username').value = '';
            document.getElementById('password').value = '';
        }

        async function loadVessels() {
            try {
                const res = await fetch('/api/vessels');
                const data = await res.json();
                if (data.success) {
                    allVessels = data.data;
                    filterVessels();
                    loadMaintenanceTable();
                }
            } catch(err) {
                console.error(err);
            }
        }

        function filterVessels() {
            const search = document.getElementById('searchInput').value.toLowerCase();
            const filtered = allVessels.filter(v => 
                v.name.toLowerCase().includes(search) || 
                (v.reg && v.reg.toLowerCase().includes(search)) ||
                (v.num && v.num.toLowerCase().includes(search))
            );
            renderVesselsTable(filtered);
        }

        function renderVesselsTable(vessels) {
            let html = \`
                <table>
                    <thead>
                        <tr>
                            <th>الاسم</th><th>الرقم</th><th>الطول</th><th>الفئة</th>
                            <th>الإقليم</th><th>المنطقة</th><th>الميناء</th><th>الحالة</th>
                            <th>العطب</th><th>تاريخ العطب</th><th>الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
            \`;
            
            if (vessels.length === 0) {
                html += '<tr><td colspan="11">لا توجد بيانات</td></tr>';
            } else {
                vessels.forEach(v => {
                    const statusClass = v.stat === 'صالح' ? 'status-good' : (v.stat === 'معطب' ? 'status-broken' : 'status-maintenance');
                    html += \`
                        <tr>
                            <td><strong>\${v.name}</strong></td>
                            <td>\${v.num || '-'}</td>
                            <td>\${v.len || '-'}</td>
                            <td>\${v.cat || '-'}</td>
                            <td>\${v.reg || '-'}</td>
                            <td>\${v.zone || '-'}</td>
                            <td>\${v.port || '-'}</td>
                            <td class="\${statusClass}">\${v.stat}</td>
                            <td>\${v.break || '-'}</td>
                            <td>\${v.fDate || '-'}</td>
                            <td>
                                \${currentUser?.role !== 'مشاهد' ? \`<button class="btn btn-edit" onclick="editVessel(\${v.id})">✏️</button>\` : ''}
                                \${currentUser?.role === 'مسؤول' ? \`<button class="btn btn-delete" onclick="deleteVessel(\${v.id})">🗑️</button>\` : ''}
                            </td>
                        </tr>
                    \`;
                });
            }
            
            html += '</tbody></table>';
            document.getElementById('vesselsTable').innerHTML = html;
        }

        function loadMaintenanceTable() {
            const maintVessels = allVessels.filter(v => v.stat === 'معطب' || v.stat === 'صيانة');
            let html = \`
                <table>
                    <thead><tr><th>الاسم</th><th>الإقليم</th><th>المنطقة</th><th>الحالة</th><th>العطب</th><th>تاريخ العطب</th><th>تاريخ الانتهاء</th><th>المرجع</th></tr></thead>
                    <tbody>
            \`;
            
            if (maintVessels.length === 0) {
                html += '<tr><td colspan="8">⚠️ لا توجد مراكب معطوبة أو تحت الصيانة</td></tr>';
            } else {
                maintVessels.forEach(v => {
                    const statusClass = v.stat === 'معطب' ? 'status-broken' : 'status-maintenance';
                    html += \`
                        <tr>
                            <td><strong>\${v.name}</strong></td>
                            <td>\${v.reg || '-'}</td>
                            <td>\${v.zone || '-'}</td>
                            <td class="\${statusClass}">\${v.stat}</td>
                            <td>\${v.break || '-'}</td>
                            <td>\${v.fDate || '-'}</td>
                            <td>\${v.eDate || '-'}</td>
                            <td>\${v.ref || '-'}</td>
                        </tr>
                    \`;
                });
            }
            
            html += '</tbody></table>';
            document.getElementById('maintenanceTable').innerHTML = html;
        }

        async function saveVessel() {
            if (currentUser?.role === 'مشاهد') {
                alert('❌ ليس لديك صلاحية للإضافة');
                return;
            }
            
            const vessel = {
                name: document.getElementById('vesselName').value,
                num: document.getElementById('vesselNum').value,
                len: document.getElementById('vesselLen').value,
                reg: document.getElementById('vesselReg').value,
                zone: document.getElementById('vesselZone').value,
                port: document.getElementById('vesselPort').value,
                supp: document.getElementById('vesselSupp').value,
                stat: document.getElementById('vesselStatus').value,
                break: document.getElementById('vesselBreak').value,
                fDate: document.getElementById('vesselDate').value,
                eDate: document.getElementById('vesselEnd').value,
                ref: document.getElementById('vesselRef').value
            };
            
            if (!vessel.name) {
                alert('⚠️ اسم المركب مطلوب');
                return;
            }
            
            try {
                const res = await fetch('/api/vessels', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(vessel)
                });
                const data = await res.json();
                if (data.success) {
                    alert('✅ تم الحفظ بنجاح');
                    clearForm();
                    loadVessels();
                    loadStatistics();
                }
            } catch(err) {
                alert('❌ حدث خطأ في الحفظ');
            }
        }

        function clearForm() {
            ['vesselName', 'vesselNum', 'vesselLen', 'vesselReg', 'vesselZone', 'vesselPort', 'vesselSupp', 'vesselBreak', 'vesselDate', 'vesselEnd', 'vesselRef'].forEach(id => {
                document.getElementById(id).value = '';
            });
        }

        async function editVessel(id) {
            alert('✏️ جاري تطوير وظيفة التعديل...');
        }

        async function deleteVessel(id) {
            if (!confirm('⚠️ هل أنت متأكد من حذف هذا المركب؟')) return;
            try {
                const res = await fetch(\`/api/vessels/\${id}\`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    alert('✅ تم الحذف بنجاح');
                    loadVessels();
                    loadStatistics();
                }
            } catch(err) {
                alert('❌ حدث خطأ في الحذف');
            }
        }

        async function loadStatistics() {
            try {
                const res = await fetch('/api/statistics');
                const data = await res.json();
                if (data.success) {
                    const s = data.data;
                    document.getElementById('statsContainer').innerHTML = \`
                        <div class="stat-card"><div class="number">\${s.total}</div>🚢 إجمالي المراكب</div>
                        <div class="stat-card"><div class="number">\${s.operational}</div>✅ الصالح</div>
                        <div class="stat-card"><div class="number">\${s.maintenance}</div>🔧 تحت الصيانة</div>
                        <div class="stat-card"><div class="number">\${s.broken}</div>⚠️ المعطوب</div>
                        <div class="stat-card"><div class="number">\${s.readinessRate}%</div>📈 نسبة الجاهزية</div>
                    \`;
                    
                    if (chart) chart.destroy();
                    const ctx = document.getElementById('chartCanvas').getContext('2d');
                    chart = new Chart(ctx, {
                        type: 'doughnut',
                        data: {
                            labels: ['صالح', 'صيانة', 'معطب'],
                            datasets: [{
                                data: [s.operational, s.maintenance, s.broken],
                                backgroundColor: ['#27ae60', '#f39c12', '#e74c3c']
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: { legend: { position: 'bottom', labels: { font: { size: 14 } } } }
                        }
                    });
                }
            } catch(err) {
                console.error(err);
            }
        }

        async function sendTicket() {
            const subject = document.getElementById('ticketSubject').value;
            const message = document.getElementById('ticketMessage').value;
            if (!subject || !message) {
                alert('⚠️ يرجى إدخال عنوان وتفاصيل المشكلة');
                return;
            }
            
            try {
                const res = await fetch('/api/tickets', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userName: currentUser.username, subject, message })
                });
                const data = await res.json();
                if (data.success) {
                    alert('✅ تم إرسال التذكرة بنجاح');
                    document.getElementById('ticketSubject').value = '';
                    document.getElementById('ticketMessage').value = '';
                    loadTickets();
                }
            } catch(err) {
                alert('❌ حدث خطأ في الإرسال');
            }
        }

        async function loadTickets() {
            try {
                const res = await fetch('/api/tickets');
                const data = await res.json();
                if (data.success) {
                    let html = \`
                        <h4 style="color:#2d3748; margin-top:20px;">📋 التذاكر السابقة</h4>
                        <table>
                            <thead><tr><th>التاريخ</th><th>المستخدم</th><th>العنوان</th><th>الحالة</th></tr></thead>
                            <tbody>
                    \`;
                    
                    if (data.data.length === 0) {
                        html += '<tr><td colspan="4">لا توجد تذاكر</td></tr>';
                    } else {
                        data.data.forEach(t => {
                            html += \`
                                <tr>
                                    <td>\${new Date(t.date).toLocaleDateString('ar')}</td>
                                    <td>\${t.userName}</td>
                                    <td>\${t.subject}</td>
                                    <td style="color:#f39c12;">\${t.status}</td>
                                </tr>
                            \`;
                        });
                    }
                    
                    html += '</tbody></table>';
                    document.getElementById('ticketsList').innerHTML = html;
                }
            } catch(err) {
                console.error(err);
            }
        }

        async function loadLogs() {
            try {
                const res = await fetch('/api/logs');
                const data = await res.json();
                if (data.success) {
                    let html = \`
                        <table>
                            <thead><tr><th>التاريخ</th><th>المستخدم</th><th>الصلاحية</th><th>الإجراء</th><th>التفاصيل</th></tr></thead>
                            <tbody>
                    \`;
                    
                    if (data.data.length === 0) {
                        html += '<tr><td colspan="5">لا توجد نشاطات</td></tr>';
                    } else {
                        data.data.forEach(log => {
                            html += \`
                                <tr>
                                    <td>\${new Date(log.date).toLocaleString('ar')}</td>
                                    <td>\${log.user}</td>
                                    <td>\${log.role || '-'}</td>
                                    <td>\${log.action}</td>
                                    <td>\${log.details || '-'}</td>
                                </tr>
                            \`;
                        });
                    }
                    
                    html += '</tbody></table>';
                    document.getElementById('logsTable').innerHTML = html;
                }
            } catch(err) {
                console.error(err);
            }
        }

        async function loadUsers() {
            if (currentUser?.role !== 'مسؤول') return;
            try {
                const res = await fetch('/api/users');
                const data = await res.json();
                if (data.success) {
                    let html = \`
                        <table>
                            <thead><tr><th>المستخدم</th><th>الصلاحية</th><th>الحالة</th><th>الإجراءات</th></tr></thead>
                            <tbody>
                    \`;
                    
                    data.data.forEach(u => {
                        const roleText = u.role === 'مسؤول' ? 'مسؤول' : (u.role === 'محرر' ? 'محرر' : 'مشاهد');
                        html += \`
                            <tr>
                                <td><strong>\${u.username}</strong></td>
                                <td>\${roleText}</td>
                                <td>\${u.enabled ? '✅ مفعل' : '❌ معطل'}</td>
                                <td>
                                    <button class="btn btn-edit" onclick="toggleUser(\${u.id}, \${!u.enabled})">\${u.enabled ? 'تعطيل' : 'تفعيل'}</button>
                                    \${u.username !== 'admin' ? \`<button class="btn btn-delete" onclick="deleteUser(\${u.id})">حذف</button>\` : ''}
                                </td>
                            </tr>
                        \`;
                    });
                    
                    html += '</tbody></table>';
                    document.getElementById('usersTable').innerHTML = html;
                }
            } catch(err) {
                console.error(err);
            }
        }

        async function addUser() {
            const username = document.getElementById('newUsername').value;
            const password = document.getElementById('newPassword').value;
            const role = document.getElementById('newRole').value;
            
            if (!username || !password) {
                alert('⚠️ يرجى إدخال اسم المستخدم وكلمة المرور');
                return;
            }
            
            try {
                const res = await fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, role })
                });
                const data = await res.json();
                if (data.success) {
                    alert('✅ تم إضافة المستخدم بنجاح');
                    document.getElementById('newUsername').value = '';
                    document.getElementById('newPassword').value = '';
                    loadUsers();
                } else {
                    alert('❌ ' + data.message);
                }
            } catch(err) {
                alert('❌ حدث خطأ');
            }
        }

        async function toggleUser(id, enabled) {
            try {
                await fetch(\`/api/users/\${id}\`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled })
                });
                loadUsers();
            } catch(err) {
                alert('❌ حدث خطأ');
            }
        }

        async function deleteUser(id) {
            if (!confirm('⚠️ هل أنت متأكد من حذف هذا المستخدم؟')) return;
            try {
                const res = await fetch(\`/api/users/\${id}\`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    alert('✅ تم حذف المستخدم');
                    loadUsers();
                } else {
                    alert('❌ ' + data.message);
                }
            } catch(err) {
                alert('❌ حدث خطأ');
            }
        }

        function showPage(page) {
            document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
            document.getElementById(\`page\${page.charAt(0).toUpperCase() + page.slice(1)}\`).style.display = 'block';
            
            if (page === 'main') loadVessels();
            if (page === 'eff') loadStatistics();
            if (page === 'support') loadTickets();
            if (page === 'track') loadLogs();
            if (page === 'users') loadUsers();
        }

        // Make functions global
        window.login = login;
        window.logout = logout;
        window.saveVessel = saveVessel;
        window.editVessel = editVessel;
        window.deleteVessel = deleteVessel;
        window.sendTicket = sendTicket;
        window.addUser = addUser;
        window.toggleUser = toggleUser;
        window.deleteUser = deleteUser;
        window.showPage = showPage;
        window.filterVessels = filterVessels;
        window.loadVessels = loadVessels;
        window.loadStatistics = loadStatistics;
    </script>
</body>
</html>
    `);
});

// ==================== Start Server ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`👤 admin / 1234 (مسؤول)`);
    console.log(`👤 editor / 1234 (محرر)`);
    console.log(`👤 viewer / 1234 (مشاهد)`);
});
