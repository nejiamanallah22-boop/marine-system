// ============================================================
// 📦 app.js - التطبيق الرئيسي
// ============================================================

console.log('✅ App loaded');

let currentUser = null;
let allVessels = [];
let allTickets = [];
let allNotes = [];
let allUsers = [];
let allLocations = [];
let allLogs = [];

// ============================================================
// 🔐 دوال المصادقة
// ============================================================

function doLogin() {
    const username = document.getElementById('username')?.value.trim();
    const password = document.getElementById('password')?.value.trim();
    
    if (!username || !password) {
        const errorEl = document.getElementById('loginError');
        if (errorEl) {
            errorEl.textContent = '⚠️ الرجاء إدخال اسم المستخدم وكلمة المرور';
            errorEl.style.display = 'block';
        }
        return;
    }
    
    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: username, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            
            const roleDisplay = document.getElementById('userRoleDisplay');
            if (roleDisplay) {
                roleDisplay.innerHTML = `<i class="fas fa-user"></i> ${data.user.name} (${data.user.role})`;
            }
            
            currentUser = data.user;
            loadAllData();
            initSocket();
        } else {
            const errorEl = document.getElementById('loginError');
            if (errorEl) {
                errorEl.textContent = '❌ ' + (data.error || 'بيانات غير صحيحة');
                errorEl.style.display = 'block';
            }
        }
    })
    .catch(err => {
        console.error('Login error:', err);
        const errorEl = document.getElementById('loginError');
        if (errorEl) {
            errorEl.textContent = '❌ خطأ في الاتصال بالخادم';
            errorEl.style.display = 'block';
        }
    });
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
    currentUser = null;
}

function getToken() {
    return localStorage.getItem('token');
}

function getUser() {
    try {
        return JSON.parse(localStorage.getItem('user'));
    } catch {
        return null;
    }
}

function isAuthenticated() {
    return !!getToken();
}

// ============================================================
// 📡 Socket.IO
// ============================================================

function initSocket() {
    try {
        const socket = io();
        socket.on('connect', () => {
            console.log('✅ Socket connected');
        });
    } catch (error) {
        console.error('Socket init error:', error);
    }
}

// ============================================================
// 📊 تحميل البيانات
// ============================================================

function loadAllData() {
    loadVessels();
    loadTickets();
    loadNotes();
    loadUsers();
    loadLocations();
    loadLogs();
}

function loadVessels() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/vessels', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (Array.isArray(data)) {
            allVessels = data;
            renderMain();
            renderMaint();
            renderEff();
        }
    })
    .catch(err => console.error('Load vessels error:', err));
}

function loadTickets() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/tickets', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (Array.isArray(data)) {
            allTickets = data;
            renderTickets();
        }
    })
    .catch(err => console.error('Load tickets error:', err));
}

function loadNotes() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/notes', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (Array.isArray(data)) {
            allNotes = data;
            loadNotesData();
            loadLatestNote();
        }
    })
    .catch(err => console.error('Load notes error:', err));
}

function loadUsers() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/users', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (Array.isArray(data)) {
            allUsers = data;
            renderUsers();
        }
    })
    .catch(err => console.error('Load users error:', err));
}

function loadLocations() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/locations', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (Array.isArray(data)) {
            allLocations = data;
            renderLocations();
        }
    })
    .catch(err => console.error('Load locations error:', err));
}

function loadLogs() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/logs', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (Array.isArray(data)) {
            allLogs = data;
            renderLogs();
        }
    })
    .catch(err => console.error('Load logs error:', err));
}

// ============================================================
// 🖥️ عرض الصفحات
// ============================================================

function showPage(page) {
    document.querySelectorAll('[id^="page"]').forEach(el => {
        el.classList.add('hidden');
    });
    
    const pageMap = {
        'main': 'pageMain',
        'maint': 'pageMaint',
        'eff': 'pageEff',
        'support': 'pageSupport',
        'track': 'pageTrack',
        'map': 'pageMap',
        'users': 'pageUsers',
        'note': 'pageNote'
    };
    
    const target = document.getElementById(pageMap[page]);
    if (target) {
        target.classList.remove('hidden');
    }
    
    switch(page) {
        case 'main': renderMain(); break;
        case 'maint': renderMaint(); break;
        case 'eff': renderEff(); break;
        case 'support': renderTickets(); break;
        case 'track': break;
        case 'map': break;
        case 'users': renderUsers(); break;
        case 'note': loadNotesData(); break;
    }
}

// ============================================================
// 🎨 دوال العرض
// ============================================================

function renderMain() {
    const body = document.getElementById('mainBody');
    if (!body) return;
    
    if (!allVessels || allVessels.length === 0) {
        body.innerHTML = `<tr><td colspan="13" style="text-align:center; padding:30px;">🚫 لا توجد بيانات. قم بإضافة مركب جديد</td></tr>`;
        return;
    }
    
    body.innerHTML = allVessels.map(v => `
        <tr>
            <td>${v.name || '-'}</td>
            <td>${v.num || '-'}</td>
            <td>${v.len || 0}</td>
            <td>${v.cat || '-'}</td>
            <td>${v.reg || '-'}</td>
            <td>${v.zone || '-'}</td>
            <td>${v.port || '-'}</td>
            <td>${v.supp || '-'}</td>
            <td><span class="status-${v.stat || 'صالح'}">${v.stat || 'صالح'}</span></td>
            <td>${v.break || '-'}</td>
            <td>${v.fDate || '-'}</td>
            <td>${v.eDate || '-'}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteVessel('${v._id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderMaint() {
    const body = document.getElementById('maintBody');
    if (!body) return;
    
    const maintVessels = allVessels.filter(v => v.stat !== 'صالح');
    
    if (maintVessels.length === 0) {
        body.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px;">🚫 لا توجد بيانات صيانة</td></tr>`;
        return;
    }
    
    body.innerHTML = maintVessels.map(v => `
        <tr>
            <td>${v.name || '-'}</td>
            <td>${v.num || '-'}</td>
            <td>${v.reg || '-'}</td>
            <td>${v.zone || '-'}</td>
            <td><span class="status-${v.stat}">${v.stat}</span></td>
            <td class="damage-column">${v.break || '-'}</td>
            <td>${v.fDate || '-'}</td>
            <td>${v.eDate || '-'}</td>
            <td>${v.ref || '-'}</td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="editVessel('${v._id}')">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderTickets() {
    const container = document.getElementById('ticketsList');
    if (!container) return;
    
    if (!allTickets || allTickets.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#6c757d;">🚫 لا توجد تذاكر</p>';
        return;
    }
    
    container.innerHTML = allTickets.map(t => `
        <div style="background:#f8f9fa; padding:15px; margin:10px 0; border-radius:8px; border-right:4px solid ${t.status === 'مغلقة' ? '#28a745' : t.status === 'تم الرد' ? '#17a2b8' : '#ffc107'}">
            <h4>${t.subject || 'بدون عنوان'}</h4>
            <p>${t.message || ''}</p>
            <small>من: ${t.userName || 'مجهول'} | ${t.date || ''} ${t.time || ''}</small>
            <span style="background:${t.status === 'مغلقة' ? '#28a745' : t.status === 'تم الرد' ? '#17a2b8' : '#ffc107'}; color:white; padding:2px 10px; border-radius:10px; font-size:12px; margin-right:10px;">${t.status || 'قيد المعالجة'}</span>
        </div>
    `).join('');
}

function renderUsers() {
    const body = document.getElementById('usersBody');
    if (!body) return;
    
    if (!allUsers || allUsers.length === 0) {
        body.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px;">🚫 لا توجد مستخدمين</td></tr>`;
        return;
    }
    
    body.innerHTML = allUsers.map(u => `
        <tr>
            <td>${u.name || '-'}</td>
            <td>${u.role || '-'}</td>
            <td>${u.isActive ? '✅ نشط' : '❌ معطل'}</td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="changeUserPassword('${u._id}', '${u.name}')">
                    <i class="fas fa-key"></i>
                </button>
            </td>
            <td>
                <button class="btn btn-sm ${u.isActive ? 'btn-danger' : 'btn-success'}" onclick="toggleUserStatus('${u._id}')">
                    <i class="fas ${u.isActive ? 'fa-ban' : 'fa-check'}"></i>
                </button>
            </td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteUser('${u._id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderEff() {
    const container = document.getElementById('statsCards');
    if (!container) return;
    
    const total = allVessels.length;
    const good = allVessels.filter(v => v.stat === 'صالح').length;
    const bad = allVessels.filter(v => v.stat === 'معطب').length;
    const maintenance = allVessels.filter(v => v.stat === 'صيانة').length;
    const efficiency = total > 0 ? Math.round((good / total) * 100) : 0;
    
    container.innerHTML = `
        <div class="stat-card" style="background:#28a745;">
            <h3>${good}</h3>
            <p>✅ صالح</p>
        </div>
        <div class="stat-card" style="background:#dc3545;">
            <h3>${bad}</h3>
            <p>❌ معطب</p>
        </div>
        <div class="stat-card" style="background:#ffc107;">
            <h3>${maintenance}</h3>
            <p>🔧 صيانة</p>
        </div>
        <div class="stat-card" style="background:#17a2b8;">
            <h3>${efficiency}%</h3>
            <p>📊 الجاهزية</p>
        </div>
    `;
}

function renderLocations() {
    const container = document.getElementById('locationsContainer');
    if (!container) return;
    
    if (!allLocations || allLocations.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#6c757d;">🚫 لا توجد مواقع</p>';
        return;
    }
    
    container.innerHTML = allLocations.slice(0, 50).map(l => `
        <div style="background:#f8f9fa; padding:15px; margin:10px 0; border-radius:8px; border-right:4px solid #0d6efd;">
            <h4>📍 ${l.userName || 'مجهول'}</h4>
            <p>${l.lat?.toFixed(6) || 0}, ${l.lng?.toFixed(6) || 0}</p>
            <small>${new Date(l.timestamp).toLocaleString()}</small>
        </div>
    `).join('');
}

function renderLogs() {
    const container = document.getElementById('logsContainer');
    if (!container) return;
    
    if (!allLogs || allLogs.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#6c757d;">🚫 لا توجد سجلات</p>';
        return;
    }
    
    container.innerHTML = allLogs.slice(0, 100).map(l => `
        <div style="background:#f8f9fa; padding:15px; margin:10px 0; border-radius:8px; border-right:4px solid #6c757d;">
            <h4>${l.action || 'إجراء'}</h4>
            <p>${l.details || ''}</p>
            <small>${l.date || ''} ${l.time || ''} | ${l.userName || 'مجهول'}</small>
        </div>
    `).join('');
}

function loadNotesData() {
    const container = document.getElementById('notesListContainer');
    if (!container) return;
    
    if (!allNotes || allNotes.length === 0) {
        container.innerHTML = '<p style="color:#6c757d;">🚫 لا توجد مذكرات</p>';
        return;
    }
    
    container.innerHTML = allNotes.map(n => `
        <div style="background:#f8f9fa; padding:15px; margin:10px 0; border-radius:8px; border-right:4px solid #0d6efd;">
            <h4 style="color:#0d6efd;">${n.title || 'بدون عنوان'}</h4>
            <p style="color:#495057;">${n.content || ''}</p>
            <small style="color:#6c757d;">${n.date || ''} ${n.time || ''} | ${n.createdBy || 'مجهول'}</small>
        </div>
    `).join('');
}

function loadLatestNote() {
    const container = document.getElementById('latestNoteContainer');
    if (!container) return;
    
    if (!allNotes || allNotes.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    const latest = allNotes[allNotes.length - 1];
    if (latest) {
        container.style.display = 'block';
        document.getElementById('latestNoteDate').textContent = latest.date || '';
        document.getElementById('latestNoteTitle').textContent = latest.title || '';
        document.getElementById('latestNoteContent').textContent = latest.content || '';
    }
}

// ============================================================
// 🚢 دوال المراكب
// ============================================================

function addItem() {
    const data = {
        name: document.getElementById('iName')?.value,
        num: document.getElementById('iNum')?.value,
        len: parseFloat(document.getElementById('iLen')?.value) || 0,
        reg: document.getElementById('iReg')?.value,
        zone: document.getElementById('iZone')?.value,
        port: document.getElementById('iPort')?.value,
        supp: document.getElementById('iSupp')?.value,
        stat: document.getElementById('iStat')?.value,
        break: document.getElementById('iBreak')?.value,
        fDate: document.getElementById('iDate')?.value,
        eDate: document.getElementById('iEnd')?.value,
        ref: document.getElementById('iRef')?.value
    };
    
    if (!data.name) {
        alert('⚠️ الرجاء إدخال اسم المركب');
        return;
    }
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    fetch('/api/vessels', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم إضافة المركب بنجاح');
            clearInputs();
            loadVessels();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الإضافة'));
        }
    })
    .catch(err => {
        console.error('Add vessel error:', err);
        alert('❌ خطأ في إضافة المركب');
    });
}

function deleteVessel(id) {
    if (!confirm('⚠️ هل أنت متأكد من حذف هذا المركب؟')) return;
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    fetch('/api/vessels/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم حذف المركب بنجاح');
            loadVessels();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الحذف'));
        }
    })
    .catch(err => {
        console.error('Delete vessel error:', err);
        alert('❌ خطأ في حذف المركب');
    });
}

function clearInputs() {
    document.getElementById('iName').value = '';
    document.getElementById('iNum').value = '';
    document.getElementById('iLen').value = '';
    document.getElementById('iReg').value = '';
    document.getElementById('iZone').value = '';
    document.getElementById('iPort').value = '';
    document.getElementById('iSupp').value = '';
    document.getElementById('iStat').value = 'صالح';
    document.getElementById('iBreak').value = '';
    document.getElementById('iDate').value = '';
    document.getElementById('iEnd').value = '';
    document.getElementById('iRef').value = '';
}

function updateZones() {
    const reg = document.getElementById('iReg')?.value;
    const zoneSelect = document.getElementById('iZone');
    
    if (!zoneSelect) return;
    
    const zones = {
        'الشمال': ['بنزرت', 'طبرقة', 'المرسى', 'لا جاليت'],
        'الساحل': ['سوسة', 'المنستير', 'المهدية'],
        'الوسط': ['صفاقس', 'قابس', 'جربة'],
        'الجنوب': ['جرجيس', 'بن قردان', 'ذهيبة'],
        'وحدة الصيانة والإسناد البحري تونس': ['تونس', 'قرطاج'],
        'وحدة الصيانة والإسناد البحري المنستير': ['المنستير', 'المهدية'],
        'وحدة الصيانة والإسناد البحري صفاقس': ['صفاقس', 'قابس'],
        'وحدة الصيانة والإسناد البحري جرجيس': ['جرجيس', 'بن قردان'],
        'المجمع الأمني بقبيبة': ['قبيبة', 'المرسى']
    };
    
    const options = zones[reg] || [];
    zoneSelect.innerHTML = '<option value="">📍 المنطقة</option>';
    options.forEach(zone => {
        zoneSelect.innerHTML += `<option value="${zone}">📍 ${zone}</option>`;
    });
}

// ============================================================
// 🎫 دوال التذاكر
// ============================================================

function sendTicket() {
    const subject = document.getElementById('ticketSubject')?.value.trim();
    const message = document.getElementById('ticketMessage')?.value.trim();
    
    if (!subject || !message) {
        alert('⚠️ الرجاء إدخال العنوان والرسالة');
        return;
    }
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    fetch('/api/tickets', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ subject, message })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم إرسال التذكرة بنجاح');
            document.getElementById('ticketSubject').value = '';
            document.getElementById('ticketMessage').value = '';
            loadTickets();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الإرسال'));
        }
    })
    .catch(err => {
        console.error('Send ticket error:', err);
        alert('❌ خطأ في إرسال التذكرة');
    });
}

function refreshTickets() {
    loadTickets();
    alert('✅ تم تحديث التذاكر');
}

// ============================================================
// 👥 دوال المستخدمين
// ============================================================

function addUser() {
    const name = document.getElementById('un')?.value.trim();
    const password = document.getElementById('up')?.value.trim();
    const role = document.getElementById('ur')?.value;
    
    if (!name || !password) {
        alert('⚠️ الرجاء إدخال الاسم وكلمة المرور');
        return;
    }
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    fetch('/api/users', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ name, email: name.toLowerCase() + '@test.com', password, role })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم إضافة المستخدم');
            document.getElementById('un').value = '';
            document.getElementById('up').value = '';
            loadUsers();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الإضافة'));
        }
    })
    .catch(err => {
        console.error('Add user error:', err);
        alert('❌ خطأ في إضافة المستخدم');
    });
}

function refreshUsers() {
    loadUsers();
    alert('✅ تم تحديث المستخدمين');
}

function changeUserPassword(id, name) {
    const newPassword = prompt(`تغيير كلمة المرور لـ ${name}:`);
    if (!newPassword || newPassword.length < 6) {
        alert('⚠️ كلمة المرور يجب أن تكون 6 أحرف على الأقل');
        return;
    }
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    fetch('/api/users/' + id, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ password: newPassword })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم تغيير كلمة المرور');
        } else {
            alert('❌ ' + (data.error || 'خطأ في التغيير'));
        }
    })
    .catch(err => {
        console.error('Change password error:', err);
        alert('❌ خطأ في تغيير كلمة المرور');
    });
}

function toggleUserStatus(id) {
    const user = allUsers.find(u => u._id === id);
    if (!user) return;
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    fetch('/api/users/' + id, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ isActive: !user.isActive })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم تحديث حالة المستخدم');
            loadUsers();
        } else {
            alert('❌ ' + (data.error || 'خطأ في التحديث'));
        }
    })
    .catch(err => {
        console.error('Toggle user status error:', err);
        alert('❌ خطأ في تحديث حالة المستخدم');
    });
}

function deleteUser(id) {
    if (!confirm('⚠️ هل أنت متأكد من حذف هذا المستخدم؟')) return;
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    fetch('/api/users/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم حذف المستخدم');
            loadUsers();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الحذف'));
        }
    })
    .catch(err => {
        console.error('Delete user error:', err);
        alert('❌ خطأ في حذف المستخدم');
    });
}

// ============================================================
// 🗺️ دوال الخريطة
// ============================================================

function initMap() {
    console.log('🗺️ Map initialized');
}

function initTrackMap() {
    console.log('🗺️ Track map initialized');
}

function startTracking() {
    alert('📍 بدء التتبع المباشر');
}

function stopTracking() {
    alert('⏹️ إيقاف التتبع');
}

function loadLocations() {
    loadLocations();
    alert('📍 تم تحديث الخريطة');
}

function centerMapOnUser() {
    alert('📍 التمركز على موقعك');
}

function requestLocationPermission() {
    alert('📍 طلب إذن الموقع');
}

function refreshTrackUsers() {
    alert('🔄 تحديث المستخدمين');
}

function clearTrackUsers() {
    alert('🗑️ مسح المستخدمين');
}

// ============================================================
// 🔧 دوال مساعدة
// ============================================================

function refreshAllPages() {
    loadAllData();
    alert('✅ تم تحديث البيانات');
}

function clearMainSearch() {
    document.getElementById('searchMain').value = '';
    renderMain();
}

function resetMaintFilters() {
    document.getElementById('searchMaint').value = '';
    document.getElementById('fRegMaint').value = 'الكل';
    document.getElementById('fDateStart').value = '';
    document.getElementById('fDateEnd').value = '';
    renderMaint();
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

// ============================================================
// 🔄 تصدير الدوال للاستخدام العالمي
// ============================================================

window.doLogin = doLogin;
window.logout = logout;
window.showPage = showPage;
window.loadAllData = loadAllData;
window.loadVessels = loadVessels;
window.loadTickets = loadTickets;
window.loadNotes = loadNotes;
window.loadUsers = loadUsers;
window.loadLocations = loadLocations;
window.loadLogs = loadLogs;
window.renderMain = renderMain;
window.renderMaint = renderMaint;
window.renderTickets = renderTickets;
window.renderUsers = renderUsers;
window.renderEff = renderEff;
window.renderLocations = renderLocations;
window.renderLogs = renderLogs;
window.loadNotesData = loadNotesData;
window.loadLatestNote = loadLatestNote;
window.clearMainSearch = clearMainSearch;
window.resetMaintFilters = resetMaintFilters;
window.scrollToTop = scrollToTop;
window.scrollToBottom = scrollToBottom;
window.refreshAllPages = refreshAllPages;
window.getToken = getToken;
window.getUser = getUser;
window.isAuthenticated = isAuthenticated;
window.initSocket = initSocket;
window.initMap = initMap;
window.initTrackMap = initTrackMap;
window.startTracking = startTracking;
window.stopTracking = stopTracking;
window.loadLocations = loadLocations;
window.centerMapOnUser = centerMapOnUser;
window.requestLocationPermission = requestLocationPermission;
window.refreshTrackUsers = refreshTrackUsers;
window.clearTrackUsers = clearTrackUsers;
window.addItem = addItem;
window.deleteVessel = deleteVessel;
window.clearInputs = clearInputs;
window.updateZones = updateZones;
window.sendTicket = sendTicket;
window.refreshTickets = refreshTickets;
window.addUser = addUser;
window.refreshUsers = refreshUsers;
window.changeUserPassword = changeUserPassword;
window.toggleUserStatus = toggleUserStatus;
window.deleteUser = deleteUser;
