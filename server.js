const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

// ==================== قاعدة بيانات في الذاكرة ====================
const users = [
    { id: 1, username: "admin", password: "1234", role: "admin", enabled: true },
    { id: 2, username: "editor", password: "1234", role: "editor", enabled: true },
    { id: 3, username: "viewer", password: "1234", role: "viewer", enabled: true }
];

let vessels = [
    { id: 1, name: "البروق 1", number: "B001", length: 11, category: "البروق", region: "الشمال", zone: "تونس", port: "تونس", supply: "قاعدة الشمال", status: "صالح", breakdown: "", failureDate: "", endDate: "", reference: "" },
    { id: 2, name: "صقر 1", number: "S001", length: 10, category: "صقور", region: "الساحل", zone: "سوسة", port: "سوسة", supply: "قاعدة الساحل", status: "صالح", breakdown: "", failureDate: "", endDate: "", reference: "" },
    { id: 3, name: "خافرة 1", number: "K001", length: 20, category: "خوافر", region: "الوسط", zone: "صفاقس", port: "صفاقس", supply: "قاعدة الوسط", status: "معطب", breakdown: "عطل في المحرك", failureDate: "2025-03-10", endDate: "2025-04-10", reference: "REF001" }
];

let logs = [];
let tickets = [];
let nextId = 4;

// ==================== API Routes ====================

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password && u.enabled);
    
    if (user) {
        logs.unshift({
            id: Date.now(),
            user: user.username,
            action: "تسجيل دخول",
            date: new Date().toISOString()
        });
        res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
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
    const vessel = { id: nextId++, ...req.body };
    vessels.push(vessel);
    res.json({ success: true, message: "تم الإضافة بنجاح", data: vessel });
});

// Update vessel
app.put('/api/vessels/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    if (index !== -1) {
        vessels[index] = { ...vessels[index], ...req.body };
        res.json({ success: true, message: "تم التحديث بنجاح" });
    } else {
        res.status(404).json({ success: false, message: "المركب غير موجود" });
    }
});

// Delete vessel
app.delete('/api/vessels/:id', (req, res) => {
    const id = parseInt(req.params.id);
    vessels = vessels.filter(v => v.id !== id);
    res.json({ success: true, message: "تم الحذف بنجاح" });
});

// Get statistics
app.get('/api/statistics', (req, res) => {
    const total = vessels.length;
    const operational = vessels.filter(v => v.status === 'صالح').length;
    const maintenance = vessels.filter(v => v.status === 'صيانة').length;
    const broken = vessels.filter(v => v.status === 'معطب').length;
    
    res.json({
        success: true,
        data: {
            total,
            operational,
            maintenance,
            broken,
            readiness: total ? ((operational / total) * 100).toFixed(1) : 0
        }
    });
});

// Get logs
app.get('/api/logs', (req, res) => {
    res.json({ success: true, data: logs.slice(0, 100) });
});

// Get tickets
app.get('/api/tickets', (req, res) => {
    res.json({ success: true, data: tickets });
});

// Add ticket
app.post('/api/tickets', (req, res) => {
    const ticket = { id: Date.now(), ...req.body, date: new Date().toISOString(), status: "قيد المعالجة" };
    tickets.unshift(ticket);
    res.json({ success: true, message: "تم الإرسال بنجاح" });
});

// Get users
app.get('/api/users', (req, res) => {
    res.json({ success: true, data: users.map(u => ({ id: u.id, username: u.username, role: u.role, enabled: u.enabled })) });
});

// Add user
app.post('/api/users', (req, res) => {
    const { username, password, role } = req.body;
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ success: false, message: "المستخدم موجود مسبقاً" });
    }
    const newUser = { id: users.length + 1, username, password, role, enabled: true };
    users.push(newUser);
    res.json({ success: true, message: "تم الإضافة بنجاح" });
});

// Update user
app.put('/api/users/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const user = users.find(u => u.id === id);
    if (user) {
        if (req.body.enabled !== undefined) user.enabled = req.body.enabled;
        if (req.body.role) user.role = req.body.role;
        if (req.body.password) user.password = req.body.password;
        res.json({ success: true, message: "تم التحديث بنجاح" });
    } else {
        res.status(404).json({ success: false, message: "المستخدم غير موجود" });
    }
});

// Delete user
app.delete('/api/users/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = users.findIndex(u => u.id === id);
    if (index !== -1 && users[index].username !== 'admin') {
        users.splice(index, 1);
        res.json({ success: true, message: "تم الحذف بنجاح" });
    } else {
        res.status(400).json({ success: false, message: "لا يمكن حذف هذا المستخدم" });
    }
});

// ==================== Serve HTML ====================
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
        .header { background: white; border-radius: 15px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; }
        .nav { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
        .nav button { padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: transform 0.2s; }
        .nav button:hover { transform: translateY(-2px); }
        .page { display: none; background: white; border-radius: 15px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: center; }
        th { background: #667eea; color: white; }
        .status-good { color: green; font-weight: bold; }
        .status-broken { color: red; font-weight: bold; }
        .status-maintenance { color: orange; font-weight: bold; }
        .btn { padding: 5px 10px; margin: 2px; border: none; border-radius: 5px; cursor: pointer; }
        .btn-edit { background: #f39c12; color: white; }
        .btn-delete { background: #e74c3c; color: white; }
        .btn-save { background: #27ae60; color: white; padding: 10px 20px; }
        .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 20px; background: #f8f9fa; padding: 15px; border-radius: 10px; }
        .form-grid input, .form-grid select { padding: 8px; border: 1px solid #ddd; border-radius: 5px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .stat-card { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 15px; border-radius: 10px; text-align: center; }
        .stat-card .number { font-size: 32px; font-weight: bold; }
        .search-box { width: 100%; padding: 10px; margin-bottom: 15px; border: 2px solid #e2e8f0; border-radius: 10px; font-size: 16px; }
        .hidden { display: none; }
        @media (max-width: 768px) { .form-grid { grid-template-columns: 1fr; } .nav button { flex: 1; } }
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
                <p><strong>admin</strong> / 1234 (صلاحية كاملة)</p>
                <p><strong>editor</strong> / 1234 (تعديل)</p>
                <p><strong>viewer</strong> / 1234 (مشاهدة فقط)</p>
            </div>
        </div>
    </div>

    <div class="app-container" id="appContainer">
        <div class="header">
            <h1>⚓ منظومة متابعة الوسائل البحرية</h1>
            <div><span id="userInfo"></span> <button onclick="logout()" class="btn" style="background: #e74c3c; color: white;">🚪 خروج</button></div>
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
                <input type="text" id="name" placeholder="اسم المركب *">
                <input type="text" id="number" placeholder="الرقم">
                <input type="number" id="length" placeholder="الطول (م)">
                <select id="region">
                    <option value="">الإقليم</option>
                    <option value="الشمال">الشمال</option>
                    <option value="الساحل">الساحل</option>
                    <option value="الوسط">الوسط</option>
                    <option value="الجنوب">الجنوب</option>
                </select>
                <input type="text" id="zone" placeholder="المنطقة">
                <input type="text" id="port" placeholder="الميناء">
                <select id="status">
                    <option value="صالح">صالح</option>
                    <option value="معطب">معطب</option>
                    <option value="صيانة">صيانة</option>
                </select>
                <input type="text" id="breakdown" placeholder="نوع العطب">
                <input type="date" id="failureDate">
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
            <canvas id="chartCanvas" style="max-height: 400px;"></canvas>
        </div>

        <!-- الدعم -->
        <div id="pageSupport" class="page">
            <h3>📞 مركز الدعم الفني</h3>
            <input type="text" id="ticketSubject" placeholder="عنوان التذكرة" style="width: 100%; padding: 10px; margin: 10px 0;">
            <textarea id="ticketMessage" rows="5" placeholder="تفاصيل المشكلة..." style="width: 100%; padding: 10px;"></textarea>
            <button onclick="sendTicket()" style="background: #27ae60; color: white; padding: 10px 20px;">📨 إرسال</button>
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
                    <option value="viewer">مشاهد</option>
                    <option value="editor">محرر</option>
                    <option value="admin">مسؤول</option>
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
                    document.getElementById('userInfo').innerHTML = \`👤 \${currentUser.username} | 🔑 \${currentUser.role === 'admin' ? 'مسؤول' : (currentUser.role === 'editor' ? 'محرر' : 'مشاهد')}\`;
                    
                    const isAdmin = currentUser.role === 'admin';
                    const isViewer = currentUser.role === 'viewer';
                    
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
                document.getElementById('loginError').innerText = 'خطأ في الاتصال بالخادم';
            }
        }

        function logout() {
            currentUser = null;
            document.getElementById('loginContainer').style.display = 'flex';
            document.getElementById('appContainer').style.display = 'none';
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
                (v.region && v.region.toLowerCase().includes(search))
            );
            renderVesselsTable(filtered);
        }

        function renderVesselsTable(vessels) {
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
                                <td>\${v.number || '-'}</td>
                                <td>\${v.length || '-'}</td>
                                <td>\${v.category || getCategory(v.length)}</td>
                                <td>\${v.region || '-'}</td>
                                <td>\${v.zone || '-'}</td>
                                <td class="status-\${v.status === 'صالح' ? 'good' : (v.status === 'معطب' ? 'broken' : 'maintenance')}">\${v.status}</td>
                                <td>\${v.breakdown || '-'}</td>
                                <td>\${v.failureDate || '-'}</td>
                                <td>
                                    \${currentUser?.role !== 'viewer' ? \`<button class="btn btn-edit" onclick="editVessel(\${v.id})">✏️ تعديل</button>\` : ''}
                                    \${currentUser?.role === 'admin' ? \`<button class="btn btn-delete" onclick="deleteVessel(\${v.id})">🗑️ حذف</button>\` : ''}
                                 </td>
                            </tr>
                        \`).join('')}
                        \${vessels.length === 0 ? '<tr><td colspan="10">لا توجد بيانات</td></tr>' : ''}
                    </tbody>
                </table>
            \`;
            document.getElementById('vesselsTable').innerHTML = html;
        }

        function getCategory(length) {
            const l = parseFloat(length);
            if (l === 11) return "البروق";
            if (l >= 8 && l <= 12) return "صقور";
            if (l > 12 && l <= 25) return "خوافر";
            if (l >= 30) return "طوافات";
            return "زوارق مزدوجة";
        }

        function loadMaintenanceTable() {
            const maintVessels = allVessels.filter(v => v.status === 'معطب' || v.status === 'صيانة');
            const html = \`
                <table>
                    <thead><tr><th>الاسم</th><th>الإقليم</th><th>الحالة</th><th>العطب</th><th>تاريخ العطب</th><th>تاريخ الانتهاء</th><th>المرجع</th></tr></thead>
                    <tbody>
                        \${maintVessels.map(v => \`
                            <tr>
                                <td>\${v.name}</td><td>\${v.region || '-'}</td>
                                <td class="status-\${v.status === 'معطب' ? 'broken' : 'maintenance'}">\${v.status}</td>
                                <td>\${v.breakdown || '-'}</td><td>\${v.failureDate || '-'}</td>
                                <td>\${v.endDate || '-'}</td><td>\${v.reference || '-'}</td>
                            </tr>
                        \`).join('')}
                        \${maintVessels.length === 0 ? '<tr><td colspan="7">لا توجد مراكب معطوبة أو تحت الصيانة</td></tr>' : ''}
                    </tbody>
                </table>
            \`;
            document.getElementById('maintenanceTable').innerHTML = html;
        }

        async function saveVessel() {
            if (currentUser?.role === 'viewer') {
                alert('ليس لديك صلاحية للإضافة');
                return;
            }
            
            const vessel = {
                name: document.getElementById('name').value,
                number: document.getElementById('number').value,
                length: document.getElementById('length').value,
                region: document.getElementById('region').value,
                zone: document.getElementById('zone').value,
                port: document.getElementById('port').value,
                status: document.getElementById('status').value,
                breakdown: document.getElementById('breakdown').value,
                failureDate: document.getElementById('failureDate').value,
                category: getCategory(document.getElementById('length').value)
            };
            
            if (!vessel.name) {
                alert('اسم المركب مطلوب');
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
                    alert('تم الحفظ بنجاح');
                    clearForm();
                    loadVessels();
                    loadStatistics();
                }
            } catch(err) {
                alert('حدث خطأ في الحفظ');
            }
        }

        function clearForm() {
            document.getElementById('name').value = '';
            document.getElementById('number').value = '';
            document.getElementById('length').value = '';
            document.getElementById('region').value = '';
            document.getElementById('zone').value = '';
            document.getElementById('port').value = '';
            document.getElementById('breakdown').value = '';
            document.getElementById('failureDate').value = '';
        }

        async function editVessel(id) {
            alert('جاري تطوير وظيفة التعديل...');
        }

        async function deleteVessel(id) {
            if (!confirm('هل أنت متأكد من حذف هذا المركب؟')) return;
            try {
                const res = await fetch(\`/api/vessels/\${id}\`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    alert('تم الحذف بنجاح');
                    loadVessels();
                    loadStatistics();
                }
            } catch(err) {
                alert('حدث خطأ في الحذف');
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
                        <div class="stat-card"><div class="number">\${s.readiness}%</div>📈 نسبة الجاهزية</div>
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
                        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
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
                alert('يرجى إدخال عنوان وتفاصيل المشكلة');
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
                    alert('تم إرسال التذكرة بنجاح');
                    document.getElementById('ticketSubject').value = '';
                    document.getElementById('ticketMessage').value = '';
                    loadTickets();
                }
            } catch(err) {
                alert('حدث خطأ في الإرسال');
            }
        }

        async function loadTickets() {
            try {
                const res = await fetch('/api/tickets');
                const data = await res.json();
                if (data.success) {
                    document.getElementById('ticketsList').innerHTML = \`
                        <h4>📋 التذاكر السابقة</h4>
                        <table>
                            <thead><tr><th>التاريخ</th><th>العنوان</th><th>الحالة</th></tr></thead>
                            <tbody>
                                \${data.data.map(t => \`
                                    <tr><td>\${new Date(t.date).toLocaleDateString('ar')}</td><td>\${t.subject}</td><td>\${t.status}</td></tr>
                                \`).join('')}
                                \${data.data.length === 0 ? '<tr><td colspan="3">لا توجد تذاكر</td></tr>' : ''}
                            </tbody>
                        </table>
                    \`;
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
                    document.getElementById('logsTable').innerHTML = \`
                        <table>
                            <thead><tr><th>التاريخ</th><th>المستخدم</th><th>الإجراء</th></tr></thead>
                            <tbody>
                                \${data.data.map(log => \`
                                    <tr><td>\${new Date(log.date).toLocaleString('ar')}</td><td>\${log.user}</td><td>\${log.action}</td></tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    \`;
                }
            } catch(err) {
                console.error(err);
            }
        }

        async function loadUsers() {
            if (currentUser?.role !== 'admin') return;
            try {
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
                                        <td>\${u.role === 'admin' ? 'مسؤول' : (u.role === 'editor' ? 'محرر' : 'مشاهد')}</td>
                                        <td>\${u.enabled ? '✅ مفعل' : '❌ معطل'}</td>
                                        <td>
                                            <button class="btn btn-edit" onclick="toggleUser(\${u.id}, \${!u.enabled})">\${u.enabled ? 'تعطيل' : 'تفعيل'}</button>
                                            \${u.username !== 'admin' ? '<button class="btn btn-delete" onclick="deleteUser(' + u.id + ')">حذف</button>' : ''}
                                        </td>
                                    </tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    \`;
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
                alert('يرجى إدخال اسم المستخدم وكلمة المرور');
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
                    alert('تم إضافة المستخدم بنجاح');
                    document.getElementById('newUsername').value = '';
                    document.getElementById('newPassword').value = '';
                    loadUsers();
                } else {
                    alert(data.message);
                }
            } catch(err) {
                alert('حدث خطأ');
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
                alert('حدث خطأ');
            }
        }

        async function deleteUser(id) {
            if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;
            try {
                await fetch(\`/api/users/\${id}\`, { method: 'DELETE' });
                loadUsers();
            } catch(err) {
                alert('حدث خطأ');
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
    </script>
</body>
</html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
});
