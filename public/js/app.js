// ============================================================
// 📦 app.js - التطبيق الرئيسي
// ============================================================

// ===== متغيرات عامة =====
let currentUser = null;
let allVessels = [];
let allTickets = [];
let allNotes = [];
let allUsers = [];
let allLogs = [];
let allLocations = [];
let socket = null;

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
    if (socket) return;
    
    try {
        socket = io();
        
        socket.on('connect', () => {
            console.log('✅ Socket connected');
            const user = getUser();
            if (user && navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        socket.emit('user-connected', {
                            userName: user.name,
                            userRole: user.role,
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude
                        });
                    },
                    () => {}
                );
            }
        });
        
        socket.on('user-list', (users) => {
            updateTrackUsers(users);
        });
        
        socket.on('receive-location', (data) => {
            console.log('📍 New location:', data);
        });
        
        socket.on('disconnect', () => {
            console.log('❌ Socket disconnected');
        });
    } catch (error) {
        console.error('Socket init error:', error);
    }
}

function updateTrackUsers(users) {
    const body = document.getElementById('trackUsersBody');
    const count = document.getElementById('trackUsersCount');
    
    if (count) {
        count.textContent = `${users.length} متصل`;
    }
    
    if (!body) return;
    
    if (!users || users.length === 0) {
        body.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px;">🚫 لا يوجد مستخدمين متصلين</td></tr>`;
        return;
    }
    
    body.innerHTML = users.map((u, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${u.userName || 'مجهول'}</td>
            <td>${u.userRole || 'مستخدم'}</td>
            <td>${u.id || '-'}</td>
            <td>${u.device || '-'}</td>
            <td>${u.browser || '-'}</td>
            <td>${u.ip || '-'}</td>
            <td>${u.lat && u.lng ? `${u.lat.toFixed(6)}, ${u.lng.toFixed(6)}` : '-'}</td>
            <td>${u.lastUpdate ? new Date(u.lastUpdate).toLocaleTimeString() : '-'}</td>
        </tr>
    `).join('');
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
            loadLatestNoteData();
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
        }
    })
    .catch(err => console.error('Load locations error:', err));
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
        case 'track': initTrackMap(); break;
        case 'map': initMap(); break;
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
    
    const search = document.getElementById('searchMain')?.value.toLowerCase() || '';
    const catFilter = document.getElementById('fCatMain')?.value || 'الكل';
    const regFilter = document.getElementById('fRegMain')?.value || 'الكل';
    
    let vessels = allVessels;
    
    if (search) {
        vessels = vessels.filter(v => 
            (v.name || '').toLowerCase().includes(search) ||
            (v.num || '').toLowerCase().includes(search) ||
            (v.reg || '').toLowerCase().includes(search)
        );
    }
    
    if (catFilter !== 'الكل') {
        vessels = vessels.filter(v => v.cat === catFilter);
    }
    
    if (regFilter !== 'الكل') {
        vessels = vessels.filter(v => v.reg === regFilter);
    }
    
    if (vessels.length === 0) {
        body.innerHTML = `<tr><td colspan="13" style="text-align:center; padding:30px;">🚫 لا توجد بيانات</td></tr>`;
        return;
    }
    
    body.innerHTML = vessels.map(v => `
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
    
    const search = document.getElementById('searchMaint')?.value.toLowerCase() || '';
    const regFilter = document.getElementById('fRegMaint')?.value || 'الكل';
    const dateStart = document.getElementById('fDateStart')?.value;
    const dateEnd = document.getElementById('fDateEnd')?.value;
    
    let vessels = allVessels.filter(v => v.stat !== 'صالح');
    
    if (search) {
        vessels = vessels.filter(v => 
            (v.name || '').toLowerCase().includes(search) ||
            (v.num || '').toLowerCase().includes(search) ||
            (v.break || '').toLowerCase().includes(search)
        );
    }
    
    if (regFilter !== 'الكل') {
        vessels = vessels.filter(v => v.reg === regFilter);
    }
    
    if (dateStart) {
        vessels = vessels.filter(v => v.fDate >= dateStart);
    }
    
    if (dateEnd) {
        vessels = vessels.filter(v => v.fDate <= dateEnd);
    }
    
    if (vessels.length === 0) {
        body.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px;">🚫 لا توجد بيانات صيانة</td></tr>`;
        return;
    }
    
    body.innerHTML = vessels.map(v => `
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
    if (typeof renderEfficiency === 'function') {
        renderEfficiency();
    }
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

// ============================================================
// 📝 دوال Note Verbale (مؤقتة)
// ============================================================

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

function loadLatestNoteData() {
    const container = document.getElementById('latestNoteContainer');
    if (!container) return;
    
    if (!allNotes || allNotes.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    const latest = allNotes[0];
    if (latest) {
        container.style.display = 'block';
        document.getElementById('latestNoteDate').textContent = latest.date || '';
        document.getElementById('latestNoteTitle').textContent = latest.title || '';
        document.getElementById('latestNoteContent').textContent = latest.content || '';
    }
}

// ============================================================
// 🔧 دوال مساعدة
// ============================================================

function showNotification(message, type = 'info') {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            text: message,
            icon: type,
            timer: 3000,
            showConfirmButton: false
        });
    } else {
        alert(message);
    }
}

function refreshAllPages() {
    loadAllData();
    showNotification('✅ تم تحديث البيانات', 'success');
}

function clearMainSearch() {
    document.getElementById('searchMain').value = '';
    document.getElementById('fCatMain').value = 'الكل';
    document.getElementById('fRegMain').value = 'الكل';
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
window.renderMain = renderMain;
window.renderMaint = renderMaint;
window.renderTickets = renderTickets;
window.renderUsers = renderUsers;
window.renderEff = renderEff;
window.clearMainSearch = clearMainSearch;
window.resetMaintFilters = resetMaintFilters;
window.scrollToTop = scrollToTop;
window.scrollToBottom = scrollToBottom;
window.refreshAllPages = refreshAllPages;
window.showNotification = showNotification;
window.getToken = getToken;
window.getUser = getUser;
window.isAuthenticated = isAuthenticated;
window.initSocket = initSocket;
window.updateTrackUsers = updateTrackUsers;
window.initMap = initMap;
window.initTrackMap = initTrackMap;
window.loadNotesData = loadNotesData;
window.loadLatestNoteData = loadLatestNoteData;

console.log('✅ App loaded');
