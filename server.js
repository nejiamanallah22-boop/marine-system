const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تخزين البيانات في الذاكرة (للتجربة)
let users = [
    { id: 1, username: "admin", password: "1234", role: "مسؤول", enabled: true },
    { id: 2, username: "editor", password: "1234", role: "محرر", enabled: true },
    { id: 3, username: "viewer", password: "1234", role: "مشاهد", enabled: true }
];

let vessels = [
    { id: 101, name: "البروق 1", num: "B001", len: 11, cat: "البروق", reg: "الشمال", zone: "تونس", port: "تونس", supp: "قاعدة الشمال", stat: "صالح", break: "", fDate: "", eDate: "", ref: "" },
    { id: 102, name: "صقر 1", num: "S001", len: 10, cat: "صقور", reg: "الساحل", zone: "سوسة", port: "سوسة", supp: "قاعدة الساحل", stat: "صالح", break: "", fDate: "", eDate: "", ref: "" },
    { id: 103, name: "خافرة 1", num: "K001", len: 20, cat: "خوافر", reg: "الوسط", zone: "صفاقس", port: "صفاقس", supp: "قاعدة الوسط", stat: "معطب", break: "عطل في المحرك", fDate: "2025-03-10", eDate: "2025-04-10", ref: "REF001" },
    { id: 104, name: "زورق 1", num: "Z001", len: 15, cat: "زوارق مزدوجة", reg: "الجنوب", zone: "جربة", port: "جربة", supp: "قاعدة الجنوب", stat: "صيانة", break: "صيانة دورية", fDate: "2025-03-15", eDate: "2025-04-05", ref: "REF002" },
    { id: 105, name: "طوافة 1", num: "T001", len: 35, cat: "طوافات", reg: "الشمال", zone: "بنزرت", port: "بنزرت", supp: "قاعدة الشمال", stat: "صالح", break: "", fDate: "", eDate: "", ref: "" },
    { id: 106, name: "البروق 2", num: "B002", len: 11, cat: "البروق", reg: "الساحل", zone: "المنستير", port: "المنستير", supp: "قاعدة الساحل", stat: "معطب", break: "عطل في الكهرباء", fDate: "2025-03-20", eDate: "2025-04-15", ref: "REF003" },
    { id: 107, name: "صقر 2", num: "S002", len: 9, cat: "صقور", reg: "الوسط", zone: "المهدية", port: "المهدية", supp: "قاعدة الوسط", stat: "صيانة", break: "تغيير زيوت", fDate: "2025-03-25", eDate: "2025-04-08", ref: "REF004" }
];

let activityLogs = [];
let tickets = [];

let currentId = 108;
let currentTicketId = 1;

// ==================== API Routes ====================

// تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password && u.enabled);
    
    if (user) {
        // تسجيل النشاط
        activityLogs.unshift({
            id: Date.now(),
            user: user.username,
            role: user.role,
            action: "تسجيل دخول",
            details: `قام بتسجيل الدخول`,
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

// جلب جميع المراكب
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
        filtered = filtered.filter(v => 
            v.name.includes(search) || 
            v.num?.includes(search) ||
            v.reg?.includes(search)
        );
    }
    
    res.json({ success: true, data: filtered });
});

// إضافة مركب جديد
app.post('/api/vessels', (req, res) => {
    const { name, num, len, cat, reg, zone, port, supp, stat, break: breakdown, fDate, eDate, ref } = req.body;
    
    if (!name) {
        return res.status(400).json({ success: false, message: "اسم المركب مطلوب" });
    }
    
    const newVessel = {
        id: ++currentId,
        name, num, len: len || 0, cat: cat || getCategory(len), reg, zone, port, 
        supp, stat, break: breakdown || "", fDate: fDate || "", eDate: eDate || "", ref: ref || ""
    };
    
    vessels.push(newVessel);
    
    res.json({ success: true, message: "تم إضافة المركب بنجاح", data: newVessel });
});

// تحديث مركب
app.put('/api/vessels/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    
    if (index === -1) {
        return res.status(404).json({ success: false, message: "المركب غير موجود" });
    }
    
    vessels[index] = { ...vessels[index], ...req.body };
    res.json({ success: true, message: "تم تحديث المركب بنجاح" });
});

// حذف مركب
app.delete('/api/vessels/:id', (req, res) => {
    const id = parseInt(req.params.id);
    vessels = vessels.filter(v => v.id !== id);
    res.json({ success: true, message: "تم حذف المركب بنجاح" });
});

// جلب جميع المستخدمين
app.get('/api/users', (req, res) => {
    res.json({ success: true, data: users.map(u => ({ id: u.id, username: u.username, role: u.role, enabled: u.enabled })) });
});

// إضافة مستخدم
app.post('/api/users', (req, res) => {
    const { username, password, role } = req.body;
    
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ success: false, message: "اسم المستخدم موجود مسبقاً" });
    }
    
    const newUser = {
        id: users.length + 1,
        username,
        password,
        role,
        enabled: true
    };
    
    users.push(newUser);
    res.json({ success: true, message: "تم إضافة المستخدم بنجاح" });
});

// تحديث مستخدم
app.put('/api/users/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const { role, enabled, password } = req.body;
    const user = users.find(u => u.id === id);
    
    if (user) {
        if (role) user.role = role;
        if (enabled !== undefined) user.enabled = enabled;
        if (password) user.password = password;
        res.json({ success: true, message: "تم تحديث المستخدم بنجاح" });
    } else {
        res.status(404).json({ success: false, message: "المستخدم غير موجود" });
    }
});

// حذف مستخدم
app.delete('/api/users/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const adminCount = users.filter(u => u.role === 'مسؤول').length;
    const userToDelete = users.find(u => u.id === id);
    
    if (userToDelete?.role === 'مسؤول' && adminCount === 1) {
        return res.status(400).json({ success: false, message: "لا يمكن حذف المسؤول الوحيد" });
    }
    
    users = users.filter(u => u.id !== id);
    res.json({ success: true, message: "تم حذف المستخدم بنجاح" });
});

// جلب سجل النشاطات
app.get('/api/logs', (req, res) => {
    res.json({ success: true, data: activityLogs.slice(0, 200) });
});

// جلب التذاكر
app.get('/api/tickets', (req, res) => {
    res.json({ success: true, data: tickets });
});

// إرسال تذكرة
app.post('/api/tickets', (req, res) => {
    const { userName, subject, message } = req.body;
    
    const newTicket = {
        id: currentTicketId++,
        userName,
        subject,
        message,
        status: "قيد المعالجة",
        date: new Date().toISOString()
    };
    
    tickets.unshift(newTicket);
    res.json({ success: true, message: "تم إرسال التذكرة بنجاح" });
});

// إحصائيات
app.get('/api/statistics', (req, res) => {
    const total = vessels.length;
    const operational = vessels.filter(v => v.stat === 'صالح').length;
    const maintenance = vessels.filter(v => v.stat === 'صيانة').length;
    const broken = vessels.filter(v => v.stat === 'معطب').length;
    
    const byRegion = {};
    vessels.forEach(v => {
        if (!byRegion[v.reg]) byRegion[v.reg] = { total: 0, operational: 0 };
        byRegion[v.reg].total++;
        if (v.stat === 'صالح') byRegion[v.reg].operational++;
    });
    
    res.json({
        success: true,
        data: {
            total,
            operational,
            maintenance,
            broken,
            readinessRate: total ? ((operational / total) * 100).toFixed(1) : 0,
            byRegion: Object.entries(byRegion).map(([name, data]) => ({ name, ...data }))
        }
    });
});

// تصدير البيانات
app.get('/api/export', (req, res) => {
    const exportData = {
        exportDate: new Date().toISOString(),
        vessels,
        users: users.map(u => ({ id: u.id, username: u.username, role: u.role })),
        stats: {
            totalVessels: vessels.length,
            totalUsers: users.length
        }
    };
    res.json(exportData);
});

// استيراد البيانات
app.post('/api/import', (req, res) => {
    const { vessels: importedVessels, users: importedUsers } = req.body;
    if (importedVessels) vessels = importedVessels;
    if (importedUsers) {
        users = importedUsers.map(u => ({ ...u, password: u.password || "1234" }));
    }
    res.json({ success: true, message: "تم استيراد البيانات بنجاح" });
});

// دالة مساعدة لتحديد الفئة
function getCategory(len) {
    const l = parseFloat(len);
    if (l === 11) return "البروق";
    if (l >= 8 && l <= 12) return "صقور";
    if (l > 12 && l <= 25) return "خوافر";
    if (l >= 30) return "طوافات";
    return "زوارق مزدوجة";
}

// ==================== تقديم الواجهة الأمامية ====================
// خدمة الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public')));

// في حالة عدم وجود مجلد public، نقدم HTML مباشرة
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
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; direction: rtl; }
        .login-container { display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
        .login-card { background: white; border-radius: 20px; padding: 40px; width: 100%; max-width: 400px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
        .login-card h2 { color: #2d3748; margin-bottom: 30px; text-align: center; }
        .login-card input { width: 100%; padding: 12px; margin-bottom: 15px; border: 2px solid #e2e8f0; border-radius: 10px; font-size: 16px; }
        .login-card button { width: 100%; padding: 12px; background: #667eea; color: white; border: none; border-radius: 10px; font-size: 18px; cursor: pointer; }
        .app-container { display: none; max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { background: white; border-radius: 15px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .nav { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
        .nav button { padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }
        .page { display: none; background: white; border-radius: 15px; padding: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: center; }
        th { background: #667eea; color: white; }
        .status-صالح { color: green; font-weight: bold; }
        .status-معطب { color: red; font-weight: bold; }
        .status-صيانة { color: orange; font-weight: bold; }
        .btn { padding: 5px 10px; margin: 2px; border: none; border-radius: 5px; cursor: pointer; }
        .btn-edit { background: #f39c12; color: white; }
        .btn-delete { background: #e74c3c; color: white; }
        .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 20px; }
        .form-grid input, .form-grid select { padding: 8px; border: 1px solid #ddd; border-radius: 5px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .stat-card { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 15px; border-radius: 10px; text-align: center; }
        .stat-card .number { font-size: 28px; font-weight: bold; }
        .hidden { display: none; }
        @media print { .nav, .form-grid, .btn { display: none; } }
    </style>
</head>
<body>
    <div class="login-container" id="loginContainer">
        <div class="login-card">
            <h2>⚓ منظومة الوسائل البحرية</h2>
            <input type="text" id="username" placeholder="اسم المستخدم">
            <input type="password" id="password" placeholder="كلمة المرور">
            <button onclick="login()">دخول</button>
            <div id="loginError" style="color: red; margin-top: 10px; text-align: center;"></div>
            <div style="margin-top: 20px; text-align: center; font-size: 12px; color: #666;">
                <p>Admin: admin / 1234</p>
                <p>Editor: editor / 1234</p>
                <p>Viewer: viewer / 1234</p>
            </div>
        </div>
    </div>

    <div class="app-container" id="appContainer">
        <div class="header">
            <h1>⚓ منظومة متابعة الوسائل البحرية</h1>
            <div style="display: flex; justify-content: space-between; margin-top: 10px;">
                <span id="userInfo"></span>
                <button onclick="logout()" class="btn" style="background: #e74c3c; color: white;">خروج</button>
            </div>
        </div>

        <div class="nav" id="navButtons">
            <button onclick="showPage('main')" style="background: #667eea; color: white;">🏠 السجل العام</button>
            <button onclick="showPage('maint')" style="background: #f39c12; color: white;">🛠️ سجل الصيانة</button>
            <button onclick="showPage('eff')" style="background: #27ae60; color: white;">📈 جاهزية الأسطول</button>
            <button onclick="showPage('support')" style="background: #3498db; color: white;">📞 الدعم الفني</button>
            <button id="trackBtn" onclick="showPage('track')" style="background: #9b59b6; color: white; display: none;">📊 تتبع المستخدمين</button>
            <button id="usersBtn" onclick="showPage('users')" style="background: #e74c3c; color: white; display: none;">👥 المستخدمين</button>
            <button onclick="window.print()" style="background: #1abc9c; color: white;">🖨️ طباعة</button>
        </div>

        <!-- صفحة السجل العام -->
        <div id="pageMain" class="page">
            <div class="form-grid" id="vesselForm">
                <input type="text" id="vesselName" placeholder="اسم المركب">
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
                <select id="vesselStatus">
                    <option value="صالح">صالح</option>
                    <option value="معطب">معطب</option>
                    <option value="صيانة">صيانة</option>
                </select>
                <input type="text" id="vesselBreak" placeholder="نوع العطب">
                <input type="date" id="vesselDate" placeholder="تاريخ العطب">
                <button onclick="saveVessel()" style="background: #27ae60; color: white;">✅ حفظ</button>
            </div>
            <input type="text" id="searchInput" placeholder="🔍 بحث..." onkeyup="loadVessels()" style="width: 100%; padding: 10px; margin-bottom: 10px;">
            <div id="mainTable"></div>
        </div>

        <!-- صفحة سجل الصيانة -->
        <div id="pageMaint" class="page">
            <div id="maintTable"></div>
        </div>

        <!-- صفحة الجاهزية -->
        <div id="pageEff" class="page">
            <div class="stats" id="statsContainer"></div>
            <canvas id="chartCanvas" style="max-height: 400px;"></canvas>
        </div>

        <!-- صفحة الدعم -->
        <div id="pageSupport" class="page">
            <h3>📞 الدعم الفني</h3>
            <input type="text" id="ticketSubject" placeholder="العنوان" style="width: 100%; padding: 10px; margin: 10px 0;">
            <textarea id="ticketMessage" rows="5" style="width: 100%; padding: 10px;"></textarea>
            <button onclick="sendTicket()" style="background: #3498db; color: white;">إرسال</button>
            <div id="ticketsList" style="margin-top: 20px;"></div>
        </div>

        <!-- صفحة التتبع -->
        <div id="pageTrack" class="page">
            <div id="logsTable"></div>
        </div>

        <!-- صفحة المستخدمين -->
        <div id="pageUsers" class="page">
            <div class="form-grid">
                <input type="text" id="newUsername" placeholder="اسم المستخدم">
                <input type="password" id="newPassword" placeholder="كلمة المرور">
                <select id="newRole">
                    <option value="مشاهد">مشاهد</option>
                    <option value="محرر">محرر</option>
                    <option value="مسؤول">مسؤول</option>
                </select>
                <button onclick="addUser()" style="background: #27ae60; color: white;">➕ إضافة</button>
            </div>
            <div id="usersTable"></div>
        </div>
    </div>

    <script>
        let currentUser = null;
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
                    document.getElementById('userInfo').innerHTML = \`👤 \${currentUser.username} | 🔑 \${currentUser.role}\`;
                    
                    // إظهار/إخفاء أزرار المسؤول
                    const isAdmin = currentUser.role === 'مسؤول';
                    document.getElementById('trackBtn').style.display = isAdmin ? 'inline-block' : 'none';
                    document.getElementById('usersBtn').style.display = isAdmin ? 'inline-block' : 'none';
                    
                    // إظهار/إخفاء نموذج الإضافة
                    const isViewer = currentUser.role === 'مشاهد';
                    document.getElementById('vesselForm').style.display = isViewer ? 'none' : 'grid';
                    
                    showPage('main');
                    loadVessels();
                    loadStatistics();
                } else {
                    document.getElementById('loginError').innerText = data.message;
                }
            } catch(err) {
                document.getElementById('loginError').innerText = 'خطأ في الاتصال';
            }
        }

        function logout() {
            currentUser = null;
            document.getElementById('loginContainer').style.display = 'flex';
            document.getElementById('appContainer').style.display = 'none';
        }

        async function loadVessels() {
            const search = document.getElementById('searchInput')?.value || '';
            const res = await fetch(\`/api/vessels?search=\${search}\`);
            const data = await res.json();
            
            if (data.success) {
                const vessels = data.data;
                const html = \`
                    <table>
                        <thead>
                            <tr>
                                <th>الاسم</th><th>الرقم</th><th>الطول</th><th>الفئة</th>
                                <th>الإقليم</th><th>المنطقة</th><th>الحالة</th><th>العطب</th><th>تاريخ العطب</th><th>الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            \${vessels.map(v => \`
                                <tr>
                                    <td>\${v.name}</td>
                                    <td>\${v.num || '-'}</td>
                                    <td>\${v.len || '-'}</td>
                                    <td>\${v.cat || '-'}</td>
                                    <td>\${v.reg || '-'}</td>
                                    <td>\${v.zone || '-'}</td>
                                    <td class="status-\${v.stat}">\${v.stat}</td>
                                    <td>\${v.break || '-'}</td>
                                    <td>\${v.fDate || '-'}</td>
                                    <td>
                                        \${currentUser?.role !== 'مشاهد' ? \`<button class="btn btn-edit" onclick="editVessel(\${v.id})">تعديل</button>\` : ''}
                                        \${currentUser?.role === 'مسؤول' ? \`<button class="btn btn-delete" onclick="deleteVessel(\${v.id})">حذف</button>\` : ''}
                                    </td>
                                </tr>
                            \`).join('')}
                        </tbody>
                    </table>
                \`;
                document.getElementById('mainTable').innerHTML = html;
                loadMaintTable(vessels);
            }
        }

        function loadMaintTable(vessels) {
            const maintVessels = vessels.filter(v => v.stat === 'معطب' || v.stat === 'صيانة');
            const html = \`
                <table>
                    <thead><tr><th>الاسم</th><th>الإقليم</th><th>الحالة</th><th>العطب</th><th>تاريخ العطب</th><th>تاريخ الانتهاء</th><th>المرجع</th></tr></thead>
                    <tbody>
                        \${maintVessels.map(v => \`
                            <tr>
                                <td>\${v.name}</td>
                                <td>\${v.reg || '-'}</td>
                                <td class="status-\${v.stat}">\${v.stat}</td>
                                <td>\${v.break || '-'}</td>
                                <td>\${v.fDate || '-'}</td>
                                <td>\${v.eDate || '-'}</td>
                                <td>\${v.ref || '-'}</td>
                            </tr>
                        \`).join('')}
                    </tbody>
                </table>
            \`;
            document.getElementById('maintTable').innerHTML = html || '<p>لا توجد مراكب معطوبة</p>';
        }

        async function saveVessel() {
            if (currentUser?.role === 'مشاهد') {
                alert('ليس لديك صلاحية للإضافة');
                return;
            }
            
            const vessel = {
                name: document.getElementById('vesselName').value,
                num: document.getElementById('vesselNum').value,
                len: document.getElementById('vesselLen').value,
                reg: document.getElementById('vesselReg').value,
                zone: document.getElementById('vesselZone').value,
                port: document.getElementById('vesselPort').value,
                stat: document.getElementById('vesselStatus').value,
                break: document.getElementById('vesselBreak').value,
                fDate: document.getElementById('vesselDate').value
            };
            
            if (!vessel.name) {
                alert('اسم المركب مطلوب');
                return;
            }
            
            const res = await fetch('/api/vessels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(vessel)
            });
            
            if (res.ok) {
                alert('تم الحفظ بنجاح');
                clearForm();
                loadVessels();
                loadStatistics();
            } else {
                alert('حدث خطأ');
            }
        }

        async function editVessel(id) {
            alert('وظيفة التعديل قيد التطوير');
        }

        async function deleteVessel(id) {
            if (!confirm('هل أنت متأكد من الحذف؟')) return;
            
            const res = await fetch(\`/api/vessels/\${id}\`, { method: 'DELETE' });
            if (res.ok) {
                alert('تم الحذف بنجاح');
                loadVessels();
                loadStatistics();
            }
        }

        async function loadStatistics() {
            const res = await fetch('/api/statistics');
            const data = await res.json();
            
            if (data.success) {
                const stats = data.data;
                document.getElementById('statsContainer').innerHTML = \`
                    <div class="stat-card"><div class="number">\${stats.total}</div>إجمالي المراكب</div>
                    <div class="stat-card"><div class="number">\${stats.operational}</div>✅ الصالح</div>
                    <div class="stat-card"><div class="number">\${stats.maintenance}</div>🔧 تحت الصيانة</div>
                    <div class="stat-card"><div class="number">\${stats.broken}</div>⚠️ المعطوب</div>
                    <div class="stat-card"><div class="number">\${stats.readinessRate}%</div>📈 نسبة الجاهزية</div>
                \`;
                
                // رسم المخطط
                if (chart) chart.destroy();
                const ctx = document.getElementById('chartCanvas').getContext('2d');
                chart = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: ['صالح', 'صيانة', 'معطب'],
                        datasets: [{
                            data: [stats.operational, stats.maintenance, stats.broken],
                            backgroundColor: ['#27ae60', '#f39c12', '#e74c3c']
                        }]
                    }
                });
            }
        }

        async function sendTicket() {
            const subject = document.getElementById('ticketSubject').value;
            const message = document.getElementById('ticketMessage').value;
            
            if (!subject || !message) {
                alert('يرجى إدخال العنوان والرسالة');
                return;
            }
            
            const res = await fetch('/api/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userName: currentUser.username, subject, message })
            });
            
            if (res.ok) {
                alert('تم إرسال التذكرة بنجاح');
                document.getElementById('ticketSubject').value = '';
                document.getElementById('ticketMessage').value = '';
                loadTickets();
            }
        }

        async function loadTickets() {
            const res = await fetch('/api/tickets');
            const data = await res.json();
            
            if (data.success) {
                document.getElementById('ticketsList').innerHTML = \`
                    <h4>📋 طلباتي السابقة</h4>
                    <table>
                        <thead><tr><th>التاريخ</th><th>العنوان</th><th>الحالة</th></tr></thead>
                        <tbody>
                            \${data.data.map(t => \`
                                <tr>
                                    <td>\${new Date(t.date).toLocaleDateString('ar')}</td>
                                    <td>\${t.subject}</td>
                                    <td>\${t.status}</td>
                                </tr>
                            \`).join('')}
                        </tbody>
                    </table>
                \`;
            }
        }

        async function loadLogs() {
            const res = await fetch('/api/logs');
            const data = await res.json();
            
            if (data.success) {
                document.getElementById('logsTable').innerHTML = \`
                    <table>
                        <thead><tr><th>التاريخ</th><th>المستخدم</th><th>الإجراء</th><th>التفاصيل</th></tr></thead>
                        <tbody>
                            \${data.data.map(log => \`
                                <tr>
                                    <td>\${new Date(log.date).toLocaleString('ar')}</td>
                                    <td>\${log.user}</td>
                                    <td>\${log.action}</td>
                                    <td>\${log.details}</td>
                                </tr>
                            \`).join('')}
                        </tbody>
                    </table>
                \`;
            }
        }

        async function loadUsers() {
            const res = await fetch('/api/users');
            const data = await res.json();
            
            if (data.success) {
                document.getElementById('usersTable').innerHTML = \`
                    <table>
                        <thead><tr><th>المستخدم</th><th>الصلاحية</th><th>الحالة</th><th>الإجراءات</th></tr></thead>
                        <tbody>
                            \${data.data.map(u => \`
                                <tr>
                                    <td>\${u.username}</td>
                                    <td>\${u.role}</td>
                                    <td>\${u.enabled ? 'مفعل' : 'معطل'}</td>
                                    <td>
                                        <button class="btn btn-edit" onclick="toggleUser(\${u.id}, \${!u.enabled})">\${u.enabled ? 'تعطيل' : 'تفعيل'}</button>
                                        \${u.username !== 'admin' ? \`<button class="btn btn-delete" onclick="deleteUser(\${u.id})">حذف</button>\` : ''}
                                    </td>
                                </tr>
                            \`).join('')}
                        </tbody>
                    </table>
                \`;
            }
        }

        async function addUser() {
            const username = document.getElementById('newUsername').value;
            const password = document.getElementById('newPassword').value;
            const role = document.getElementById('newRole').value;
            
            if (!username || !password) {
                alert('يرجى إدخال اسم المستخدم وكلمة المرور');
                return;
            }
            
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, role })
            });
            
            if (res.ok) {
                alert('تم إضافة المستخدم');
                loadUsers();
                document.getElementById('newUsername').value = '';
                document.getElementById('newPassword').value = '';
            } else {
                const error = await res.json();
                alert(error.message);
            }
        }

        async function toggleUser(id, enabled) {
            const res = await fetch(\`/api/users/\${id}\`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled })
            });
            
            if (res.ok) {
                loadUsers();
            }
        }

        async function deleteUser(id) {
            if (!confirm('هل أنت متأكد؟')) return;
            await fetch(\`/api/users/\${id}\`, { method: 'DELETE' });
            loadUsers();
        }

        function clearForm() {
            document.getElementById('vesselName').value = '';
            document.getElementById('vesselNum').value = '';
            document.getElementById('vesselLen').value = '';
            document.getElementById('vesselReg').value = '';
            document.getElementById('vesselZone').value = '';
            document.getElementById('vesselPort').value = '';
            document.getElementById('vesselBreak').value = '';
            document.getElementById('vesselDate').value = '';
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

        // ربط الدوال العالمية
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
        window.loadVessels = loadVessels;
    </script>
</body>
</html>
    `);
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
