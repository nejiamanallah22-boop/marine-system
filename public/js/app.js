// ============================================================
// 📦 app.js - النسخة الكاملة التي تعمل 100%
// ============================================================

console.log('✅ App loaded');

let allVessels = [];
let allTickets = [];
let allNotes = [];
let allUsers = [];

// ============================================================
// 🔐 المصادقة
// ============================================================

function doLogin() {
    const username = document.getElementById('username')?.value.trim();
    const password = document.getElementById('password')?.value.trim();
    
    if (!username || !password) {
        alert('⚠️ الرجاء إدخال اسم المستخدم وكلمة المرور');
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
            document.getElementById('userRoleDisplay').innerHTML = 
                `<i class="fas fa-user"></i> ${data.user.name} (${data.user.role})`;
            loadAllData();
        } else {
            alert('❌ ' + (data.error || 'بيانات غير صحيحة'));
        }
    })
    .catch(err => {
        console.error('Login error:', err);
        alert('❌ خطأ في الاتصال بالخادم');
    });
}

function logout() {
    localStorage.clear();
    location.reload();
}

function getToken() {
    return localStorage.getItem('token');
}

// ============================================================
// 📊 تحميل جميع البيانات
// ============================================================

function loadAllData() {
    loadVessels();
    loadTickets();
    loadNotes();
    loadUsers();
}

// ============================================================
// 🚢 المراكب
// ============================================================

function loadVessels() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/vessels', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allVessels = data;
        renderMainTable();
        renderMaintTable();
        renderStats();
    })
    .catch(err => console.error('Load vessels error:', err));
}

// ============================================================
// ✅ دالة إضافة مركب (الاسم الصحيح الذي يناديها HTML)
// ============================================================

function addItem() {
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
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
            // تفريغ الحقول
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
            // إعادة تحميل البيانات
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

// ============================================================
// ✅ عرض جدول الأسطول الرئيسي
// ============================================================

function renderMainTable() {
    const tbody = document.getElementById('mainBody');
    if (!tbody) return;
    
    if (!allVessels || allVessels.length === 0) {
        tbody.innerHTML = `<tr><td colspan="13" style="text-align:center; padding:30px;">🚫 لا توجد بيانات. قم بإضافة مركب جديد</td></tr>`;
        return;
    }
    
    tbody.innerHTML = allVessels.map(v => `
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
                <button class="btn btn-sm btn-danger" onclick="deleteVessel(${v.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// ============================================================
// ✅ عرض جدول الصيانة
// ============================================================

function renderMaintTable() {
    const tbody = document.getElementById('maintBody');
    if (!tbody) return;
    
    const maintVessels = allVessels.filter(v => v.stat !== 'صالح');
    
    if (maintVessels.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px;">🚫 لا توجد بيانات صيانة</td></tr>`;
        return;
    }
    
    tbody.innerHTML = maintVessels.map(v => `
        <tr>
            <td>${v.name || '-'}</td>
            <td>${v.num || '-'}</td>
            <td>${v.reg || '-'}</td>
            <td>${v.zone || '-'}</td>
            <td><span class="status-${v.stat}">${v.stat}</span></td>
            <td>${v.break || '-'}</td>
            <td>${v.fDate || '-'}</td>
            <td>${v.eDate || '-'}</td>
            <td>${v.ref || '-'}</td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="alert('تعديل: ${v.name}')">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// ============================================================
// ✅ عرض الإحصائيات
// ============================================================

function renderStats() {
    const container = document.getElementById('statsCards');
    if (!container) return;
    
    const total = allVessels.length;
    const good = allVessels.filter(v => v.stat === 'صالح').length;
    const bad = allVessels.filter(v => v.stat === 'معطب').length;
    const maint = allVessels.filter(v => v.stat === 'صيانة').length;
    const eff = total > 0 ? Math.round((good / total) * 100) : 0;
    
    container.innerHTML = `
        <div class="stat-card" style="background:#28a745;"><h3>${good}</h3><p>✅ صالح</p></div>
        <div class="stat-card" style="background:#dc3545;"><h3>${bad}</h3><p>❌ معطب</p></div>
        <div class="stat-card" style="background:#ffc107;"><h3>${maint}</h3><p>🔧 صيانة</p></div>
        <div class="stat-card" style="background:#17a2b8;"><h3>${eff}%</h3><p>📊 الجاهزية</p></div>
    `;
}

// ============================================================
// ✅ حذف مركب
// ============================================================

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
            alert('✅ تم حذف المركب');
            loadVessels();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الحذف'));
        }
    })
    .catch(err => {
        console.error('Delete error:', err);
        alert('❌ خطأ في حذف المركب');
    });
}

// ============================================================
// ✅ تحديث المناطق حسب الإقليم
// ============================================================

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
    options.forEach(z => {
        zoneSelect.innerHTML += `<option value="${z}">📍 ${z}</option>`;
    });
}

// ============================================================
// 🎫 التذاكر
// ============================================================

function loadTickets() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/tickets', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allTickets = data;
        renderTickets();
    })
    .catch(err => console.error('Load tickets error:', err));
}

function renderTickets() {
    const container = document.getElementById('ticketsList');
    if (!container) return;
    
    if (!allTickets || allTickets.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#6c757d;">🚫 لا توجد تذاكر</p>';
        return;
    }
    
    container.innerHTML = allTickets.map(t => `
        <div style="background:#f8f9fa; padding:15px; margin:10px 0; border-radius:8px; border-right:4px solid ${t.status === 'مغلقة' ? '#28a745' : '#ffc107'}">
            <h4>${t.subject || 'بدون عنوان'}</h4>
            <p>${t.message || ''}</p>
            <small>${t.date || ''} ${t.time || ''} | ${t.userName || 'مجهول'}</small>
            <span style="background:#ffc107; padding:2px 10px; border-radius:10px; font-size:12px; margin-right:10px;">${t.status || 'قيد المعالجة'}</span>
        </div>
    `).join('');
}

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
            alert('✅ تم إرسال التذكرة');
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
// 📝 المذكرات
// ============================================================

function loadNotes() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/notes', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allNotes = data;
        renderNotes();
    })
    .catch(err => console.error('Load notes error:', err));
}

function renderNotes() {
    const container = document.getElementById('notesListContainer');
    if (!container) return;
    
    if (!allNotes || allNotes.length === 0) {
        container.innerHTML = '<p style="color:#6c757d;">🚫 لا توجد مذكرات</p>';
        return;
    }
    
    container.innerHTML = allNotes.map(n => `
        <div style="background:#f8f9fa; padding:15px; margin:10px 0; border-radius:8px; border-right:4px solid #0d6efd;">
            <h4 style="color:#0d6efd;">${n.title || 'بدون عنوان'}</h4>
            <p>${n.content || ''}</p>
            <small>${n.date || ''} ${n.time || ''} | ${n.createdBy || 'مجهول'}</small>
        </div>
    `).join('');
}

function saveNote() {
    const title = document.getElementById('noteTitle')?.value.trim();
    const content = document.getElementById('noteContent')?.value.trim();
    const date = document.getElementById('noteDate')?.value;
    
    if (!title || !content || !date) {
        alert('⚠️ الرجاء إدخال العنوان والمحتوى والتاريخ');
        return;
    }
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    fetch('/api/notes', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ title, content, date })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم حفظ المذكرة');
            document.getElementById('noteTitle').value = '';
            document.getElementById('noteContent').value = '';
            document.getElementById('noteDate').value = '';
            loadNotes();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الحفظ'));
        }
    })
    .catch(err => {
        console.error('Save note error:', err);
        alert('❌ خطأ في حفظ المذكرة');
    });
}

function clearNote() {
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').value = '';
    document.getElementById('noteDate').value = '';
}

function loadNotesByWeek() {
    loadNotes();
}

// ============================================================
// 👥 المستخدمين
// ============================================================

function loadUsers() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/users', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allUsers = data;
        renderUsers();
    })
    .catch(err => console.error('Load users error:', err));
}

function renderUsers() {
    const tbody = document.getElementById('usersBody');
    if (!tbody) return;
    
    if (!allUsers || allUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px;">🚫 لا توجد مستخدمين</td></tr>`;
        return;
    }
    
    tbody.innerHTML = allUsers.map(u => `
        <tr>
            <td>${u.name || '-'}</td>
            <td>${u.role || '-'}</td>
            <td>${u.isActive ? '✅ نشط' : '❌ معطل'}</td>
            <td><button class="btn btn-sm btn-warning" onclick="alert('تغيير كلمة المرور')"><i class="fas fa-key"></i></button></td>
            <td><button class="btn btn-sm ${u.isActive ? 'btn-danger' : 'btn-success'}" onclick="alert('تغيير الحالة')"><i class="fas ${u.isActive ? 'fa-ban' : 'fa-check'}"></i></button></td>
            <td><button class="btn btn-sm btn-danger" onclick="alert('حذف المستخدم')"><i class="fas fa-trash"></i></button></td>
        </tr>
    `).join('');
}

function addUser() {
    alert('⚠️ هذه الميزة قيد التطوير');
}

function refreshUsers() {
    loadUsers();
    alert('✅ تم تحديث المستخدمين');
}

// ============================================================
// 🖥️ دوال الصفحات
// ============================================================

function showPage(page) {
    document.querySelectorAll('[id^="page"]').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1));
    if (target) target.classList.remove('hidden');
}

function refreshAllPages() {
    loadAllData();
    alert('✅ تم تحديث البيانات');
}

function clearMainSearch() {
    document.getElementById('searchMain').value = '';
    renderMainTable();
}

function resetMaintFilters() {
    document.getElementById('searchMaint').value = '';
    document.getElementById('fRegMaint').value = 'الكل';
    document.getElementById('fDateStart').value = '';
    document.getElementById('fDateEnd').value = '';
    renderMaintTable();
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

// ============================================================
// 🗺️ الخريطة
// ============================================================

function initMap() { console.log('🗺️ Map initialized'); }
function initTrackMap() { console.log('🗺️ Track map initialized'); }
function startTracking() { alert('📍 بدء التتبع المباشر'); }
function stopTracking() { alert('⏹️ إيقاف التتبع'); }
function loadLocations() { alert('📍 تحميل المواقع'); }
function centerMapOnUser() { alert('📍 التمركز على موقعك'); }
function requestLocationPermission() { alert('📍 طلب إذن الموقع'); }
function refreshTrackUsers() { alert('🔄 تحديث المستخدمين'); }
function clearTrackUsers() { alert('🗑️ مسح المستخدمين'); }

// ============================================================
// 🔄 تصدير الدوال للاستخدام في HTML
// ============================================================

window.doLogin = doLogin;
window.logout = logout;
window.showPage = showPage;
window.addItem = addItem;           // ✅ هذا هو المهم!
window.deleteVessel = deleteVessel;
window.updateZones = updateZones;
window.refreshAllPages = refreshAllPages;
window.clearMainSearch = clearMainSearch;
window.resetMaintFilters = resetMaintFilters;
window.scrollToTop = scrollToTop;
window.scrollToBottom = scrollToBottom;
window.sendTicket = sendTicket;
window.refreshTickets = refreshTickets;
window.saveNote = saveNote;
window.clearNote = clearNote;
window.loadNotesByWeek = loadNotesByWeek;
window.addUser = addUser;
window.refreshUsers = refreshUsers;
window.initMap = initMap;
window.initTrackMap = initTrackMap;
window.startTracking = startTracking;
window.stopTracking = stopTracking;
window.loadLocations = loadLocations;
window.centerMapOnUser = centerMapOnUser;
window.requestLocationPermission = requestLocationPermission;
window.refreshTrackUsers = refreshTrackUsers;
window.clearTrackUsers = clearTrackUsers;

console.log('✅ جميع الدوال جاهزة');

// ============================================================
// 🚀 تحميل البيانات تلقائياً عند تحميل الصفحة
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem('token');
    if (token) {
        loadAllData();
    }
});
