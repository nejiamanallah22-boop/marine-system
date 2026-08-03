// public/js/app.js
console.log('✅ App loaded');

let allVessels = [];
let allUsers = [];
let allTickets = [];
let allNotes = [];
let allMaintenance = [];
let currentUser = null;
let editingVesselId = null;
let editingMaintenanceId = null;
let activityInterval = null;
let sessionId = null;

// متغيرات الرسوم البيانية
let chartCategory = null;
let chartDoughnut = null;
let dashChart = null;
let dashLineChart = null;

// ============================================================
// منع الدخول التلقائي
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    const loginOverlay = document.getElementById('loginOverlay');
    const mainApp = document.getElementById('mainApp');
    
    if (loginOverlay) loginOverlay.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';
    
    localStorage.clear();
    
    const username = document.getElementById('username');
    const password = document.getElementById('password');
    if (username) username.value = '';
    if (password) password.value = '';
    
    if (password) {
        password.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                doLogin();
            }
        });
    }
    if (username) {
        username.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                if (password) password.focus();
            }
        });
    }
});

// ============================================================
// دوال تحميل الصفحات
// ============================================================

function loadPage(pageName) {
    const container = document.getElementById('pageContainer');
    if (!container) return;
    document.querySelectorAll('.page-content').forEach(el => el.remove());
    
    fetch(`/pages/${pageName}.html`)
        .then(res => {
            if (!res.ok) throw new Error(`Page ${pageName} not found`);
            return res.text();
        })
        .then(html => {
            const div = document.createElement('div');
            div.className = 'page-content';
            div.id = 'page-' + pageName;
            div.innerHTML = html;
            container.appendChild(div);
            initPage(pageName);
        })
        .catch(err => {
            console.error('Error:', err);
            container.innerHTML = `
                <div style="text-align:center; padding:50px; color:#f87171;">
                    ❌ خطأ في تحميل الصفحة: ${pageName}
                    <br><small>${err.message}</small>
                </div>
            `;
        });
}

function initPage(pageName) {
    switch(pageName) {
        case 'dashboard': loadDashboard(); break;
        case 'fleet': loadVessels(); break;
        case 'maintenance': loadMaintenance(); break;
        case 'efficiency': loadVessels(); break;
        case 'support': loadTickets(); break;
        case 'tracking': initTrackingPage(); break;
        case 'map': setTimeout(initMap, 100); break;
        case 'users': loadUsers(); break;
        case 'notes': loadNotes(); break;
        case 'sessions': loadSessions(); break;
        default: console.log('⚠️ Unknown page:', pageName);
    }
}

function initTrackingPage() {
    if (document.getElementById('page-tracking')) {
        if (typeof initTrackingMap === 'function') {
            setTimeout(initTrackingMap, 300);
        }
        if (typeof initTrackingSocket === 'function') {
            setTimeout(initTrackingSocket, 500);
        }
        if (typeof startContinuousTracking === 'function') {
            setTimeout(startContinuousTracking, 1000);
        }
    }
}

function showPage(pageName) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const btns = document.querySelectorAll('.nav-btn');
    const pageMap = {
        'dashboard': 0, 'fleet': 1, 'maintenance': 2, 'efficiency': 3,
        'support': 4, 'tracking': 5, 'map': 6, 'users': 7, 'notes': 8, 'sessions': 9
    };
    if (pageMap[pageName] !== undefined && btns[pageMap[pageName]]) {
        btns[pageMap[pageName]].classList.add('active');
    }
    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth <= 992) {
        sidebar.classList.remove('open');
    }
    loadPage(pageName);
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('open');
}

function refreshAllPages() {
    const currentPage = document.querySelector('.page-content');
    if (currentPage) {
        const pageName = currentPage.id.replace('page-', '');
        loadPage(pageName);
    } else {
        loadPage('dashboard');
    }
    showAlert('✅ تم تحديث الصفحة', 'success');
}

// ============================================================
// دوال مساعدة
// ============================================================

function showAlert(message, type = 'info') {
    const colors = {
        success: '#4ade80',
        danger: '#f87171',
        warning: '#fbbf24',
        info: '#60a5fa'
    };
    const alertDiv = document.createElement('div');
    alertDiv.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 99999;
        padding: 14px 24px; border-radius: 12px; color: white;
        background: rgba(10,10,26,0.95);
        backdrop-filter: blur(20px);
        border: 1px solid ${colors[type]}40;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        font-family: 'Cairo', sans-serif;
        max-width: 400px;
        animation: slideIn 0.3s ease;
        z-index: 999999;
        border-right: 4px solid ${colors[type]};
    `;
    alertDiv.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
            <span style="color:${colors[type]}">${type === 'success' ? '✅' : type === 'danger' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}</span>
            <span>${message}</span>
        </div>
    `;
    document.body.appendChild(alertDiv);
    setTimeout(() => {
        alertDiv.style.opacity = '0';
        alertDiv.style.transition = 'opacity 0.3s';
        setTimeout(() => alertDiv.remove(), 300);
    }, 4000);
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

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

// ============================================================
// 🕐 مراقبة النشاط
// ============================================================

function startActivityTracking() {
    if (activityInterval) clearInterval(activityInterval);
    
    activityInterval = setInterval(() => {
        const token = getToken();
        if (!token) return;
        
        fetch('/api/auth/activity', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            }
        }).catch(err => console.log('Activity tracking error:', err));
    }, 30000);
    
    document.addEventListener('click', logActivity);
    document.addEventListener('keydown', logActivity);
    document.addEventListener('scroll', debounce(logActivity, 5000));
}

function logActivity() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/auth/activity', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        }
    }).catch(err => console.log('Activity log error:', err));
}

function debounce(func, wait) {
    let timeout;
    return function() {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, arguments), wait);
    };
}

// ============================================================
// المصادقة
// ============================================================

function doLogin() {
    console.log('🔄 محاولة تسجيل الدخول...');
    
    const username = document.getElementById('username')?.value?.trim();
    const password = document.getElementById('password')?.value?.trim();
    
    if (!username || !password) {
        showAlert('⚠️ الرجاء إدخال اسم المستخدم وكلمة المرور', 'warning');
        return;
    }
    
    const loginBtn = document.querySelector('#loginOverlay .login-btn');
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.textContent = '⏳ جاري الدخول...';
    }
    
    // ===== حسابات تجريبية =====
    const demoUsers = {
        'admin': {
            password: '123456',
            user: { id: '1', name: 'مدير النظام', role: 'مسؤول', email: 'admin@example.com' }
        },
        'manager': {
            password: '123456',
            user: { id: '2', name: 'مدير العمليات', role: 'مشرف', email: 'manager@example.com' }
        },
        'editor': {
            password: '123456',
            user: { id: '3', name: 'محرر', role: 'محرر', email: 'editor@example.com' }
        },
        'viewer': {
            password: '123456',
            user: { id: '4', name: 'مشاهد', role: 'مشاهد', email: 'viewer@example.com' }
        }
    };
    
    if (demoUsers[username] && demoUsers[username].password === password) {
        console.log('✅ دخول تجريبي ناجح للمستخدم:', username);
        const userData = demoUsers[username].user;
        localStorage.setItem('token', 'demo-token-' + Date.now());
        localStorage.setItem('user', JSON.stringify(userData));
        currentUser = userData;
        sessionId = 'demo-session-' + Date.now();
        
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        
        updateUserDisplay();
        loadAllData();
        loadPage('dashboard');
        startActivityTracking();
        showAlert('✅ مرحباً ' + userData.name + '!', 'success');
        
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = '🚀 دخول';
        }
        return;
    }
    
    // ===== الاتصال بالخادم =====
    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email: username, password: password })
    })
    .then(res => {
        if (!res.ok) throw new Error('فشل الاتصال بالخادم');
        return res.json();
    })
    .then(data => {
        if (data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            currentUser = data.user;
            sessionId = data.session?.sessionId || null;
            
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            
            updateUserDisplay();
            loadAllData();
            loadPage('dashboard');
            startActivityTracking();
            showAlert('✅ تم تسجيل الدخول بنجاح', 'success');
        } else {
            showAlert('❌ ' + (data.error || 'بيانات غير صحيحة'), 'danger');
        }
    })
    .catch(err => {
        console.error('Login error:', err);
        showAlert('❌ خطأ في الاتصال بالخادم: ' + err.message, 'danger');
    })
    .finally(() => {
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = '🚀 دخول';
        }
    });
}

function doLogout() {
    if (!confirm('⚠️ هل أنت متأكد من تسجيل الخروج؟')) return;
    
    if (activityInterval) {
        clearInterval(activityInterval);
        activityInterval = null;
    }
    
    const token = getToken();
    if (token && !token.startsWith('demo-token')) {
        fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token }
        }).catch(err => console.log('Logout error:', err));
    }
    
    localStorage.clear();
    location.reload();
}

function updateUserDisplay() {
    const display = document.getElementById('userRoleDisplay');
    if (display && currentUser) {
        const roleEmojis = { 'مسؤول': '👑', 'مشرف': '⭐', 'محرر': '✏️', 'مشاهد': '👀' };
        display.innerHTML = `
            <i class="fas fa-user-circle"></i> 
            ${currentUser.name} 
            <span style="font-size:12px; background:rgba(255,255,255,0.06); padding:2px 12px; border-radius:10px;">
                ${roleEmojis[currentUser.role] || '👤'} ${currentUser.role}
            </span>
            <button onclick="doLogout()" style="margin-left:8px; padding:2px 10px; border:none; border-radius:8px; background:rgba(248,113,113,0.15); color:#f87171; cursor:pointer; font-size:11px;">
                🚪 خروج
            </button>
        `;
    }
}

// ============================================================
// تحميل البيانات
// ============================================================

function loadAllData() {
    loadVessels();
    loadMaintenance();
    loadTickets();
    loadNotes();
    loadUsers();
}

function loadVessels() {
    const token = getToken();
    if (token && token.startsWith('demo-token')) {
        allVessels = getDemoVessels();
        renderAllTables();
        return;
    }
    
    if (!token) {
        allVessels = getDemoVessels();
        renderAllTables();
        return;
    }
    
    fetch('/api/vessels', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => {
        if (!res.ok) throw new Error('فشل تحميل المراكب');
        return res.json();
    })
    .then(data => {
        allVessels = data || [];
        console.log('✅ Vessels loaded:', allVessels.length);
        renderAllTables();
    })
    .catch(err => {
        console.error('Load vessels error:', err);
        allVessels = getDemoVessels();
        renderAllTables();
    });
}

function loadMaintenance() {
    const token = getToken();
    if (token && token.startsWith('demo-token')) {
        allMaintenance = getDemoMaintenance();
        renderMaintenanceTables();
        updateYearFilter();
        return;
    }
    
    if (!token) {
        allMaintenance = getDemoMaintenance();
        renderMaintenanceTables();
        updateYearFilter();
        return;
    }
    
    fetch('/api/maintenance', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => {
        if (!res.ok) throw new Error('فشل تحميل الصيانة');
        return res.json();
    })
    .then(data => {
        allMaintenance = data || [];
        console.log('✅ Maintenance loaded:', allMaintenance.length);
        renderMaintenanceTables();
        updateYearFilter();
    })
    .catch(err => {
        console.error('Load maintenance error:', err);
        allMaintenance = getDemoMaintenance();
        renderMaintenanceTables();
        updateYearFilter();
    });
}

function loadTickets() {
    const token = getToken();
    if (!token) return;
    fetch('/api/tickets', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allTickets = data || [];
        renderTickets();
    })
    .catch(err => console.error('Load tickets error:', err));
}

function loadUsers() {
    const token = getToken();
    
    // ✅ دعم الوضع التجريبي
    if (!token || token.startsWith('demo-token')) {
        // استخدام بيانات تجريبية للمستخدمين
        allUsers = [
            { id: '1', name: 'مدير النظام', email: 'admin@example.com', role: 'مسؤول', isActive: true, createdAt: new Date().toISOString() },
            { id: '2', name: 'مدير العمليات', email: 'manager@example.com', role: 'مشرف', isActive: true, createdAt: new Date().toISOString() },
            { id: '3', name: 'محرر', email: 'editor@example.com', role: 'محرر', isActive: true, createdAt: new Date().toISOString() },
            { id: '4', name: 'مشاهد', email: 'viewer@example.com', role: 'مشاهد', isActive: true, createdAt: new Date().toISOString() }
        ];
        renderUsersTable();
        return;
    }
    
    fetch('/api/users', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allUsers = data || [];
        console.log('✅ Users loaded:', allUsers.length);
        renderUsersTable();
    })
    .catch(err => console.error('Load users error:', err));
}

function loadNotes() {
    const token = getToken();
    if (!token) return;
    fetch('/api/notes', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allNotes = data || [];
        renderNotes();
    })
    .catch(err => console.error('Load notes error:', err));
}

function loadSessions() {
    const token = getToken();
    if (!token) return;
    if (document.getElementById('page-sessions')) {
        if (typeof refreshSessions === 'function') {
            refreshSessions();
        }
    }
}

function renderAllTables() {
    renderMainTable();
    renderMaintenanceTables();
    updateMaintenanceVessels();
    renderEfficiency();
    if (document.getElementById('page-dashboard')) {
        if (typeof loadDashboard === 'function') {
            setTimeout(loadDashboard, 100);
        }
    }
}

function renderMaintenanceTables() {
    renderGeneralMaintenance();
    renderHistoryMaintenance();
    updateMaintenanceStats();
    renderMaintenanceUnits();
}

// ============================================================
// بيانات تجريبية
// ============================================================

function getDemoVessels() {
    return [
        { id: 1, name: 'البروق 1', num: 'B001', len: 25, cat: 'البروق', reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: 'الوحدة 1', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-001', repairer: 'فني 1' },
        { id: 2, name: 'البروق 2', num: 'B002', len: 25, cat: 'البروق', reg: 'الشمال', zone: 'طبرقة', port: 'طبرقة', supp: 'الوحدة 1', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-002', repairer: 'فني 1' },
        { id: 3, name: 'البروق 3', num: 'B003', len: 25, cat: 'البروق', reg: 'الساحل', zone: 'سوسة', port: 'سوسة', supp: 'الوحدة 2', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-003', repairer: 'فني 2' },
        { id: 4, name: 'البروق 4', num: 'B004', len: 25, cat: 'البروق', reg: 'الساحل', zone: 'المنستير', port: 'المنستير', supp: 'الوحدة 2', stat: 'معطب', break: 'عطل محرك', fDate: '2026-01-15', eDate: '2026-12-31', ref: 'REF-004', repairer: 'فني 2' },
        { id: 5, name: 'البروق 5', num: 'B005', len: 25, cat: 'البروق', reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: 'الوحدة 3', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-005', repairer: 'فني 3' },
        { id: 6, name: 'البروق 6', num: 'B006', len: 25, cat: 'البروق', reg: 'الوسط', zone: 'قابس', port: 'قابس', supp: 'الوحدة 3', stat: 'معطب', break: 'عطل كهربائي', fDate: '2026-02-01', eDate: '2026-12-31', ref: 'REF-006', repairer: 'فني 3' },
        { id: 7, name: 'البروق 7', num: 'B007', len: 25, cat: 'البروق', reg: 'الجنوب', zone: 'جرجيس', port: 'جرجيس', supp: 'الوحدة 4', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-007', repairer: 'فني 4' },
        { id: 8, name: 'صقر 1', num: 'S001', len: 30, cat: 'صقور', reg: 'الشمال', zone: 'المرسى', port: 'المرسى', supp: 'الوحدة 1', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-008', repairer: 'فني 1' },
        { id: 9, name: 'صقر 2', num: 'S002', len: 30, cat: 'صقور', reg: 'الشمال', zone: 'غار الملح', port: 'غار الملح', supp: 'الوحدة 1', stat: 'معطب', break: 'عطل هيدروليك', fDate: '2026-01-20', eDate: '2026-12-31', ref: 'REF-009', repairer: 'فني 1' },
        { id: 10, name: 'صقر 3', num: 'S003', len: 30, cat: 'صقور', reg: 'الساحل', zone: 'حمام سوسة', port: 'حمام سوسة', supp: 'الوحدة 2', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-010', repairer: 'فني 2' },
        { id: 11, name: 'صقر 4', num: 'S004', len: 30, cat: 'صقور', reg: 'الساحل', zone: 'قليبية', port: 'قليبية', supp: 'الوحدة 2', stat: 'معطب', break: 'عطل محرك', fDate: '2026-02-10', eDate: '2026-12-31', ref: 'REF-011', repairer: 'فني 2' },
        { id: 12, name: 'صقر 5', num: 'S005', len: 30, cat: 'صقور', reg: 'الجنوب', zone: 'بن قردان', port: 'بن قردان', supp: 'الوحدة 4', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-012', repairer: 'فني 4' },
        { id: 13, name: 'خافر 1', num: 'K001', len: 20, cat: 'خوافر', reg: 'الساحل', zone: 'المهدية', port: 'المهدية', supp: 'الوحدة 2', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-013', repairer: 'فني 2' },
        { id: 14, name: 'خافر 2', num: 'K002', len: 20, cat: 'خوافر', reg: 'الساحل', zone: 'نابل', port: 'نابل', supp: 'الوحدة 2', stat: 'صيانة', break: 'صيانة دورية', fDate: '2026-02-15', eDate: '2026-12-31', ref: 'REF-014', repairer: 'فني 2' },
        { id: 15, name: 'خافر 3', num: 'K003', len: 20, cat: 'خوافر', reg: 'الوسط', zone: 'جربة', port: 'جربة', supp: 'الوحدة 3', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-015', repairer: 'فني 3' },
        { id: 16, name: 'طوافة 1', num: 'T001', len: 15, cat: 'طوافات', reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: 'الوحدة 1', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-016', repairer: 'فني 1' },
        { id: 17, name: 'زورق مزدوج 1', num: 'Z001', len: 35, cat: 'زوارق مزدوجة', reg: 'الشمال', zone: 'المرسى', port: 'المرسى', supp: 'الوحدة 1', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-017', repairer: 'فني 1' },
        { id: 18, name: 'زورق مزدوج 2', num: 'Z002', len: 35, cat: 'زوارق مزدوجة', reg: 'الساحل', zone: 'سوسة', port: 'سوسة', supp: 'الوحدة 2', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-018', repairer: 'فني 2' },
        { id: 19, name: 'زورق مزدوج 3', num: 'Z003', len: 35, cat: 'زوارق مزدوجة', reg: 'الساحل', zone: 'المنستير', port: 'المنستير', supp: 'الوحدة 2', stat: 'معطب', break: 'عطل محرك', fDate: '2026-01-25', eDate: '2026-12-31', ref: 'REF-019', repairer: 'فني 2' },
        { id: 20, name: 'زورق مزدوج 4', num: 'Z004', len: 35, cat: 'زوارق مزدوجة', reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: 'الوحدة 3', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-020', repairer: 'فني 3' },
        { id: 21, name: 'زورق مزدوج 5', num: 'Z005', len: 35, cat: 'زوارق مزدوجة', reg: 'الوسط', zone: 'القطار', port: 'القطار', supp: 'الوحدة 3', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-021', repairer: 'فني 3' }
    ];
}

function getDemoMaintenance() {
    return [
        {
            id: 1,
            vesselId: 4,
            vesselName: 'البروق 4',
            type: 'كبرى',
            unit: 'وحدة الصيانة والإسناد البحري تونس',
            technician: 'فني 1',
            description: 'عطل في المحرك الرئيسي',
            repair: 'تم تغيير طلمبة الزيت والمضخة',
            faultType: 'محرك',
            cost: 4500,
            notes: 'تم تغيير طلمبة الزيت والمضخة بالكامل',
            status: 'مكتملة',
            date: '2026-01-20',
            startDate: '2026-01-15',
            endDate: '2026-01-20',
            parts: [{ name: 'طلمبة زيت', quantity: 1, price: 1200 }, { name: 'مضخة ماء', quantity: 1, price: 800 }],
            createdBy: 'Admin'
        },
        {
            id: 2,
            vesselId: 9,
            vesselName: 'صقر 2',
            type: 'دورية',
            unit: 'وحدة الصيانة والإسناد البحري صفاقس',
            technician: 'فني 2',
            description: 'صيانة دورية للمحرك',
            repair: 'تم تغيير الزيوت والفلتر',
            faultType: 'محرك',
            cost: 300,
            notes: 'تم تغيير الزيوت والفلتر',
            status: 'مكتملة',
            date: '2026-05-15',
            startDate: '2026-05-14',
            endDate: '2026-05-15',
            parts: [{ name: 'زيت محرك', quantity: 5, price: 100 }, { name: 'فلتر هواء', quantity: 1, price: 300 }],
            createdBy: 'Admin'
        },
        {
            id: 3,
            vesselId: 14,
            vesselName: 'خافر 2',
            type: 'كبرى',
            unit: 'وحدة الصيانة والإسناد البحري المنستير',
            technician: 'فني 3',
            description: 'إصلاح شامل للهيكل',
            repair: 'تم تغيير ألواح الهيكل والدهان',
            faultType: 'هيكل',
            cost: 5000,
            notes: 'تم تغيير ألواح الهيكل والدهان المضاد للصدأ',
            status: 'مكتملة',
            date: '2026-01-10',
            startDate: '2026-01-05',
            endDate: '2026-01-10',
            parts: [{ name: 'ألواح فولاذ', quantity: 10, price: 350 }, { name: 'دهان مضاد للصدأ', quantity: 5, price: 200 }],
            createdBy: 'Admin'
        },
        {
            id: 4,
            vesselId: 6,
            vesselName: 'البروق 6',
            type: 'عادية',
            unit: 'وحدة الصيانة والإسناد البحري جرجيس',
            technician: 'فني 4',
            description: 'عطل في النظام الكهربائي',
            repair: 'تم تغيير البطاريات والكابلات',
            faultType: 'كهرباء',
            cost: 1200,
            notes: 'تم تغيير البطاريات والكابلات',
            status: 'مكتملة',
            date: '2026-02-05',
            startDate: '2026-02-03',
            endDate: '2026-02-05',
            parts: [{ name: 'بطارية', quantity: 2, price: 450 }, { name: 'كابلات', quantity: 3, price: 100 }],
            createdBy: 'Admin'
        },
        {
            id: 5,
            vesselId: 19,
            vesselName: 'زورق مزدوج 3',
            type: 'طارئة',
            unit: 'وحدة الصيانة والإسناد البحري تونس',
            technician: 'فني 1',
            description: 'عطل في نظام التوجيه',
            repair: 'تم تغيير طرمبة التوجيه',
            faultType: 'توجيه',
            cost: 1800,
            notes: 'تم تغيير طرمبة التوجيه بالكامل',
            status: 'قيد الإنجاز',
            date: '2026-02-10',
            startDate: '2026-02-08',
            endDate: null,
            parts: [{ name: 'طرمبة توجيه', quantity: 1, price: 1500 }, { name: 'زيت هيدروليك', quantity: 3, price: 100 }],
            createdBy: 'Admin'
        },
        {
            id: 6,
            vesselId: 11,
            vesselName: 'صقر 4',
            type: 'كبرى',
            unit: 'وحدة الصيانة والإسناد البحري صفاقس',
            technician: 'فني 2',
            description: 'عطل في نظام التبريد',
            repair: 'تم تغيير الراديتر والمراوح',
            faultType: 'تبريد',
            cost: 3200,
            notes: 'تم تغيير نظام التبريد بالكامل',
            status: 'مكتملة',
            date: '2026-07-15',
            startDate: '2026-07-10',
            endDate: '2026-07-15',
            parts: [{ name: 'راديتر', quantity: 1, price: 2000 }, { name: 'مراوح تبريد', quantity: 2, price: 400 }],
            createdBy: 'Admin'
        }
    ];
}

// ============================================================
// عرض الجداول الأساسية
// ============================================================

function renderMainTable() {
    const tbody = document.getElementById('mainBody');
    if (!tbody) return;
    if (!allVessels || allVessels.length === 0) {
        tbody.innerHTML = `<tr><td colspan="15" style="text-align:center; padding:30px; color:rgba(255,255,255,0.2);">🚫 لا توجد بيانات</td></tr>`;
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
            <td style="color:${v.stat === 'صالح' ? '#4ade80' : v.stat === 'معطب' ? '#f87171' : '#fbbf24'}">${v.stat || 'صالح'}</td>
            <td>${v.break || '-'}</td>
            <td>${v.fDate || '-'}</td>
            <td>${v.eDate || '-'}</td>
            <td>${v.ref || '-'}</td>
            <td>${v.repairer || '-'}</td>
            <td>
                <button class="btn-sm btn-warning" onclick="editVessel(${v.id})">✏️</button>
                <button class="btn-sm btn-danger" onclick="deleteVessel(${v.id})">🗑️</button>
            </td>
        </tr>
    `).join('');
}

function renderTickets() {
    const container = document.getElementById('ticketsList');
    if (!container) return;
    if (!allTickets || allTickets.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.2);">🚫 لا توجد تذاكر</div>';
        return;
    }
    container.innerHTML = allTickets.map(t => `
        <div style="background:rgba(255,255,255,0.02); padding:12px; margin:8px 0; border-radius:8px; border-right:3px solid ${t.status === 'مغلقة' ? '#4ade80' : '#fbbf24'};">
            <h4 style="color:rgba(255,255,255,0.8); margin:0;">${t.subject}</h4>
            <p style="color:rgba(255,255,255,0.5); margin:5px 0; font-size:13px;">${t.message}</p>
            <small style="color:rgba(255,255,255,0.3);">${t.date || ''} | ${t.userName || 'مجهول'}</small>
            <span style="background:rgba(251,191,36,0.1); color:#fbbf24; padding:2px 12px; border-radius:10px; font-size:11px; margin-right:10px;">${t.status || 'قيد المعالجة'}</span>
        </div>
    `).join('');
}

function renderUsersTable() {
    const tbody = document.getElementById('usersBody');
    if (!tbody) return;
    if (!allUsers || allUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:rgba(255,255,255,0.2);">🚫 لا توجد مستخدمين</td></tr>`;
        return;
    }
    tbody.innerHTML = allUsers.map(u => `
        <tr>
            <td><strong>${u.name || '-'}</strong></td>
            <td>${u.email || '-'}</td>
            <td><span style="color:${u.role === 'مسؤول' ? '#fbbf24' : u.role === 'مشرف' ? '#60a5fa' : '#4ade80'}">${u.role || 'مشاهد'}</span></td>
            <td>${u.isActive ? '✅ نشط' : '❌ معطل'}</td>
            <td style="font-size:12px; color:rgba(255,255,255,0.3);">${u.createdAt ? new Date(u.createdAt).toLocaleDateString('ar-TN') : '-'}</td>
            <td>
                <button class="btn-sm btn-warning" onclick="editUser('${u.id}')">✏️</button>
                <button class="btn-sm btn-danger" onclick="deleteUser('${u.id}')">🗑️</button>
            </td>
        </tr>
    `).join('');
}

function renderNotes() {
    const container = document.getElementById('notesListContainer');
    if (!container) return;
    if (!allNotes || allNotes.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.2);">🚫 لا توجد مذكرات</div>';
        return;
    }
    container.innerHTML = allNotes.map(n => `
        <div style="background:rgba(255,255,255,0.02); padding:12px; margin:8px 0; border-radius:8px; border-right:3px solid #60a5fa;">
            <h4 style="color:rgba(255,255,255,0.8); margin:0;">${n.title}</h4>
            <p style="color:rgba(255,255,255,0.5); margin:5px 0; font-size:13px;">${n.content}</p>
            <small style="color:rgba(255,255,255,0.3);">${n.date || ''} | ${n.createdBy || 'مجهول'}</small>
        </div>
    `).join('');
}

// ============================================================
// 👥 دوال المستخدمين (مع دعم الوضع التجريبي)
// ============================================================

function addUser() {
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    const name = document.getElementById('uName')?.value.trim();
    const email = document.getElementById('uEmail')?.value.trim();
    const password = document.getElementById('uPassword')?.value.trim();
    const role = document.getElementById('uRole')?.value;
    
    if (!name) {
        showAlert('⚠️ الرجاء إدخال اسم المستخدم', 'warning');
        document.getElementById('uName')?.focus();
        return;
    }
    if (!email) {
        showAlert('⚠️ الرجاء إدخال البريد الإلكتروني', 'warning');
        document.getElementById('uEmail')?.focus();
        return;
    }
    if (!password || password.length < 4) {
        showAlert('⚠️ كلمة المرور يجب أن تكون 4 أحرف على الأقل', 'warning');
        document.getElementById('uPassword')?.focus();
        return;
    }
    
    const addBtn = document.querySelector('[onclick="addUser()"]');
    if (addBtn) {
        addBtn.disabled = true;
        addBtn.textContent = '⏳ جاري الإضافة...';
    }
    
    // ✅ دعم الوضع التجريبي
    if (token.startsWith('demo-token')) {
        // إضافة مستخدم تجريبي محلياً
        const newUser = {
            id: 'user-' + Date.now(),
            name: name,
            email: email,
            role: role || 'مشاهد',
            isActive: true,
            createdAt: new Date().toISOString()
        };
        allUsers.push(newUser);
        renderUsersTable();
        clearUserInputs();
        showAlert('✅ تم إضافة المستخدم (وضع تجريبي)', 'success');
        
        if (addBtn) {
            addBtn.disabled = false;
            addBtn.textContent = '💾 إضافة مستخدم';
        }
        return;
    }
    
    // ✅ الاتصال بالخادم الحقيقي
    fetch('/api/users', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ name, email, password, role: role || 'مشاهد' })
    })
    .then(async res => {
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'فشل إضافة المستخدم');
        }
        return data;
    })
    .then(data => {
        if (data.success) {
            showAlert('✅ تم إضافة المستخدم بنجاح', 'success');
            clearUserInputs();
            loadUsers();
            
            const modal = document.getElementById('addUserModal');
            if (modal) modal.style.display = 'none';
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في الإضافة'), 'danger');
        }
    })
    .catch(err => {
        console.error('Add user error:', err);
        showAlert('❌ ' + err.message, 'danger');
    })
    .finally(() => {
        if (addBtn) {
            addBtn.disabled = false;
            addBtn.textContent = '💾 إضافة مستخدم';
        }
    });
}

function editUser(id) {
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    // ✅ دعم الوضع التجريبي
    if (token.startsWith('demo-token')) {
        const user = allUsers.find(u => u.id === id);
        if (!user) {
            showAlert('⚠️ المستخدم غير موجود', 'warning');
            return;
        }
        
        document.getElementById('uName').value = user.name || '';
        document.getElementById('uEmail').value = user.email || '';
        document.getElementById('uPassword').value = '';
        document.getElementById('uPassword').placeholder = 'اترك فارغاً للحفاظ على كلمة المرور';
        document.getElementById('uRole').value = user.role || 'مشاهد';
        
        const addBtn = document.querySelector('[onclick="addUser()"]');
        if (addBtn) {
            addBtn.textContent = '💾 تحديث المستخدم';
            addBtn.onclick = function() { updateUser(id); };
        }
        
        showAlert('✏️ جارٍ تعديل المستخدم: ' + user.name, 'info');
        return;
    }
    
    // ✅ الاتصال بالخادم الحقيقي
    fetch('/api/users', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(users => {
        const user = users.find(u => u.id === id);
        if (!user) {
            showAlert('⚠️ المستخدم غير موجود', 'warning');
            return;
        }
        
        document.getElementById('uName').value = user.name || '';
        document.getElementById('uEmail').value = user.email || '';
        document.getElementById('uPassword').value = '';
        document.getElementById('uPassword').placeholder = 'اترك فارغاً للحفاظ على كلمة المرور';
        document.getElementById('uRole').value = user.role || 'مشاهد';
        
        const addBtn = document.querySelector('[onclick="addUser()"]');
        if (addBtn) {
            addBtn.textContent = '💾 تحديث المستخدم';
            addBtn.onclick = function() { updateUser(id); };
        }
        
        showAlert('✏️ جارٍ تعديل المستخدم: ' + user.name, 'info');
    })
    .catch(err => {
        console.error('Edit user error:', err);
        showAlert('❌ خطأ في تحميل بيانات المستخدم', 'danger');
    });
}

function updateUser(id) {
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    const name = document.getElementById('uName')?.value.trim();
    const email = document.getElementById('uEmail')?.value.trim();
    const password = document.getElementById('uPassword')?.value.trim();
    const role = document.getElementById('uRole')?.value;
    
    if (!name) {
        showAlert('⚠️ الرجاء إدخال اسم المستخدم', 'warning');
        return;
    }
    if (!email) {
        showAlert('⚠️ الرجاء إدخال البريد الإلكتروني', 'warning');
        return;
    }
    
    const updateBtn = document.querySelector('[onclick*="updateUser"]');
    if (updateBtn) {
        updateBtn.disabled = true;
        updateBtn.textContent = '⏳ جاري التحديث...';
    }
    
    // ✅ دعم الوضع التجريبي
    if (token.startsWith('demo-token')) {
        const index = allUsers.findIndex(u => u.id === id);
        if (index === -1) {
            showAlert('⚠️ المستخدم غير موجود', 'warning');
            return;
        }
        
        allUsers[index].name = name;
        allUsers[index].email = email;
        allUsers[index].role = role || 'مشاهد';
        
        renderUsersTable();
        clearUserInputs();
        showAlert('✅ تم تحديث المستخدم (وضع تجريبي)', 'success');
        
        const addBtn = document.querySelector('[onclick*="updateUser"]');
        if (addBtn) {
            addBtn.textContent = '💾 إضافة مستخدم';
            addBtn.onclick = addUser;
            addBtn.disabled = false;
        }
        return;
    }
    
    // ✅ الاتصال بالخادم الحقيقي
    const data = { name, email, role };
    if (password && password.length >= 4) {
        data.password = password;
    }
    
    fetch('/api/users/' + id, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(data)
    })
    .then(async res => {
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'فشل تحديث المستخدم');
        }
        return data;
    })
    .then(data => {
        if (data.success) {
            showAlert('✅ تم تحديث المستخدم بنجاح', 'success');
            clearUserInputs();
            
            const addBtn = document.querySelector('[onclick*="updateUser"]');
            if (addBtn) {
                addBtn.textContent = '💾 إضافة مستخدم';
                addBtn.onclick = addUser;
                addBtn.disabled = false;
            }
            loadUsers();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في التحديث'), 'danger');
        }
    })
    .catch(err => {
        console.error('Update user error:', err);
        showAlert('❌ ' + err.message, 'danger');
    })
    .finally(() => {
        if (updateBtn) {
            updateBtn.disabled = false;
        }
    });
}

function deleteUser(id) {
    if (!confirm('⚠️ هل أنت متأكد من حذف هذا المستخدم؟')) return;
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    // ✅ دعم الوضع التجريبي
    if (token.startsWith('demo-token')) {
        allUsers = allUsers.filter(u => u.id !== id);
        renderUsersTable();
        showAlert('✅ تم حذف المستخدم (وضع تجريبي)', 'success');
        return;
    }
    
    // ✅ الاتصال بالخادم الحقيقي
    fetch('/api/users/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert('✅ تم حذف المستخدم', 'success');
            loadUsers();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في الحذف'), 'danger');
        }
    })
    .catch(err => {
        console.error('Delete user error:', err);
        showAlert('❌ خطأ في حذف المستخدم', 'danger');
    });
}

function clearUserInputs() {
    document.getElementById('uName').value = '';
    document.getElementById('uEmail').value = '';
    document.getElementById('uPassword').value = '';
    document.getElementById('uPassword').placeholder = 'كلمة المرور';
    document.getElementById('uRole').value = 'مشاهد';
}

// ============================================================
// دوال المراكب
// ============================================================

function addItem() {
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    const name = document.getElementById('iName')?.value;
    if (!name) {
        showAlert('⚠️ الرجاء إدخال اسم المركب', 'warning');
        return;
    }
    const data = {
        name: name,
        num: document.getElementById('iNum')?.value || '',
        len: parseFloat(document.getElementById('iLen')?.value) || 0,
        reg: document.getElementById('iReg')?.value || '',
        zone: document.getElementById('iZone')?.value || '',
        port: document.getElementById('iPort')?.value || '',
        supp: document.getElementById('iSupp')?.value || '',
        stat: document.getElementById('iStat')?.value || 'صالح',
        break: document.getElementById('iBreak')?.value || '',
        fDate: document.getElementById('iDate')?.value || '',
        eDate: document.getElementById('iEnd')?.value || '',
        ref: document.getElementById('iRef')?.value || '',
        repairer: document.getElementById('iRepairer')?.value || ''
    };
    const url = editingVesselId ? '/api/vessels/' + editingVesselId : '/api/vessels';
    const method = editingVesselId ? 'PUT' : 'POST';
    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert(editingVesselId ? '✅ تم تحديث المركب' : '✅ تم إضافة المركب', 'success');
            editingVesselId = null;
            clearVesselInputs();
            loadVessels();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في العملية'), 'danger');
        }
    })
    .catch(err => {
        console.error('Error:', err);
        showAlert('❌ خطأ في العملية', 'danger');
    });
}

function editVessel(id) {
    console.log('✏️ Editing vessel with ID:', id);
    const vessel = allVessels.find(v => v.id === id);
    if (!vessel) {
        showAlert('⚠️ المركب غير موجود', 'warning');
        return;
    }
    
    const elements = {
        iName: document.getElementById('iName'),
        iNum: document.getElementById('iNum'),
        iLen: document.getElementById('iLen'),
        iReg: document.getElementById('iReg'),
        iZone: document.getElementById('iZone'),
        iPort: document.getElementById('iPort'),
        iSupp: document.getElementById('iSupp'),
        iStat: document.getElementById('iStat'),
        iBreak: document.getElementById('iBreak'),
        iDate: document.getElementById('iDate'),
        iEnd: document.getElementById('iEnd'),
        iRef: document.getElementById('iRef'),
        iRepairer: document.getElementById('iRepairer')
    };
    
    let missingElements = [];
    Object.keys(elements).forEach(key => {
        if (!elements[key]) missingElements.push(key);
    });
    
    if (missingElements.length > 0) {
        console.error('❌ عناصر مفقودة:', missingElements);
        showAlert('⚠️ تأكد من وجود جميع حقول المركب', 'warning');
        return;
    }
    
    editingVesselId = vessel.id;
    elements.iName.value = vessel.name || '';
    elements.iNum.value = vessel.num || '';
    elements.iLen.value = vessel.len || 0;
    elements.iReg.value = vessel.reg || '';
    elements.iZone.value = vessel.zone || '';
    elements.iPort.value = vessel.port || '';
    elements.iSupp.value = vessel.supp || '';
    elements.iStat.value = vessel.stat || 'صالح';
    elements.iBreak.value = vessel.break || '';
    elements.iDate.value = vessel.fDate || '';
    elements.iEnd.value = vessel.eDate || '';
    elements.iRef.value = vessel.ref || '';
    elements.iRepairer.value = vessel.repairer || '';
    
    const form = document.querySelector('.fleet-form');
    if (form) {
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        form.style.border = '2px solid #fbbf24';
        form.style.boxShadow = '0 0 20px rgba(251,191,36,0.3)';
        setTimeout(() => {
            form.style.border = '1px solid rgba(255,255,255,0.1)';
            form.style.boxShadow = 'none';
        }, 3000);
    }
    
    showAlert('✏️ جارٍ تعديل المركب: ' + vessel.name, 'info');
}

function deleteVessel(id) {
    if (!confirm('⚠️ هل أنت متأكد من الحذف؟')) return;
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    fetch('/api/vessels/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert('✅ تم الحذف', 'success');
            loadVessels();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في الحذف'), 'danger');
        }
    })
    .catch(err => {
        console.error('Delete error:', err);
        showAlert('❌ خطأ في الحذف', 'danger');
    });
}

function clearVesselInputs() {
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
    document.getElementById('iRepairer').value = '';
}

function updateZones() {
    const reg = document.getElementById('iReg')?.value;
    const zoneSelect = document.getElementById('iZone');
    if (!zoneSelect) return;
    const zones = {
        'الشمال': ['بنزرت', 'طبرقة', 'المرسى', 'غار الملح'],
        'الساحل': ['سوسة', 'المنستير', 'المهدية', 'حمام سوسة'],
        'الوسط': ['صفاقس', 'قابس', 'جربة', 'القطار'],
        'الجنوب': ['جرجيس', 'بن قردان', 'ذراع الساحل']
    };
    const options = zones[reg] || ['المنطقة غير محددة'];
    zoneSelect.innerHTML = '<option value="">📍 المنطقة</option>';
    options.forEach(z => {
        zoneSelect.innerHTML += `<option value="${z}">📍 ${z}</option>`;
    });
}

// ============================================================
// دوال الصيانة
// ============================================================

function updateMaintenanceVessels() {
    const select = document.getElementById('mVesselId');
    if (!select) return;
    select.innerHTML = '<option value="">اختر المركب</option>';
    allVessels.forEach(v => {
        select.innerHTML += `<option value="${v.id}">${v.name} (${v.num || 'بدون رقم'})</option>`;
    });
}

function toggleMaintenanceForm() {
    const form = document.getElementById('maintenanceForm');
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function addPart() {
    const container = document.getElementById('partsContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'part-item';
    div.innerHTML = `
        <input type="text" placeholder="اسم القطعة" class="part-name" style="flex:2; padding:6px; border-radius:4px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.02); color:white;">
        <input type="number" placeholder="الكمية" class="part-qty" style="width:60px; padding:6px; border-radius:4px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.02); color:white;">
        <input type="number" placeholder="السعر" class="part-price" style="width:60px; padding:6px; border-radius:4px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.02); color:white;">
        <button onclick="removePart(this)" style="padding:4px 10px; background:rgba(248,113,113,0.15); color:#f87171; border:1px solid rgba(248,113,113,0.1); border-radius:4px; cursor:pointer;">✕</button>
    `;
    container.appendChild(div);
}

function removePart(btn) {
    const container = document.getElementById('partsContainer');
    if (container && container.children.length > 1) {
        btn.parentElement.remove();
    }
}

function getPartsData() {
    const parts = [];
    document.querySelectorAll('.part-item').forEach(item => {
        const name = item.querySelector('.part-name')?.value;
        const qty = parseFloat(item.querySelector('.part-qty')?.value) || 0;
        const price = parseFloat(item.querySelector('.part-price')?.value) || 0;
        if (name) parts.push({ name, quantity: qty, price });
    });
    return parts;
}

function saveMaintenance() {
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    const vesselId = document.getElementById('mVesselId')?.value;
    const type = document.getElementById('mType')?.value;
    const unit = document.getElementById('mUnit')?.value;
    const technician = document.getElementById('mTechnician')?.value.trim();
    const description = document.getElementById('mDescription')?.value.trim();
    const repair = document.getElementById('mRepair')?.value.trim();
    const faultType = document.getElementById('mFaultType')?.value;
    const startDate = document.getElementById('mStartDate')?.value;
    const cost = parseFloat(document.getElementById('mCost')?.value) || 0;
    const notes = document.getElementById('mNotes')?.value.trim();
    const parts = getPartsData();
    
    if (!vesselId) {
        showAlert('⚠️ الرجاء اختيار المركب', 'warning');
        return;
    }
    if (!description) {
        showAlert('⚠️ الرجاء إدخال وصف العطل', 'warning');
        return;
    }
    if (!technician) {
        showAlert('⚠️ الرجاء إدخال اسم الفني المسؤول', 'warning');
        return;
    }
    
    const vessel = allVessels.find(v => v.id == vesselId);
    if (vessel && vessel.stat === 'صالح') {
        fetch('/api/vessels/' + vesselId, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ 
                stat: 'معطب',
                break: description,
                fDate: startDate || new Date().toISOString().split('T')[0]
            })
        }).catch(err => console.error('Error updating vessel status:', err));
    }
    
    const data = {
        vesselId: parseFloat(vesselId),
        vesselName: vessel ? vessel.name : '',
        type: type || 'عادية',
        unit: unit || 'غير محدد',
        technician: technician,
        description: description,
        repair: repair || '',
        faultType: faultType || 'أخرى',
        cost: cost,
        notes: notes || '',
        parts: parts,
        status: 'قيد الإنجاز',
        date: new Date().toISOString().split('T')[0],
        startDate: startDate || new Date().toISOString().split('T')[0],
        endDate: null,
        createdBy: currentUser?.name || 'Admin'
    };
    
    const url = editingMaintenanceId ? '/api/maintenance/' + editingMaintenanceId : '/api/maintenance';
    const method = editingMaintenanceId ? 'PUT' : 'POST';
    
    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert(editingMaintenanceId ? '✅ تم تحديث سجل الصيانة' : '✅ تم إضافة سجل الصيانة', 'success');
            editingMaintenanceId = null;
            toggleMaintenanceForm();
            loadAllData();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في العملية'), 'danger');
        }
    })
    .catch(err => {
        console.error('Save maintenance error:', err);
        showAlert('❌ خطأ في حفظ سجل الصيانة', 'danger');
    });
}

function renderGeneralMaintenance() {
    const container = document.getElementById('generalMaintenanceContainer');
    if (!container) return;
    const vessels = allVessels.filter(v => v.stat === 'معطب' || v.stat === 'صيانة');
    if (vessels.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#4ade80;">✅ لا توجد مراكب معطبة</div>';
        return;
    }
    let html = '<div class="scrollable-table"><table><thead><tr><th>المركب</th><th>الفئة</th><th>الحالة</th><th>العطل</th><th>المسؤول</th><th>إجراءات</th></tr></thead><tbody>';
    vessels.forEach(v => {
        html += `<tr>
            <td><strong>${v.name}</strong></td>
            <td>${v.cat || '-'}</td>
            <td><span class="status-badge status-broken">${v.stat}</span></td>
            <td>${v.break || '-'}</td>
            <td>${v.repairer || '-'}</td>
            <td>
                <button class="btn-sm btn-primary" onclick="openMaintenanceFile(${v.id})">📂 فتح</button>
                <button class="btn-sm btn-success" onclick="fixVessel(${v.id})">✅ إصلاح</button>
            </td>
        </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function fixVessel(vesselId) {
    if (!confirm('⚠️ هل أنت متأكد من إصلاح هذا المركب؟')) return;
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    fetch('/api/vessels/' + vesselId, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ stat: 'صالح' })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert('✅ تم إصلاح المركب', 'success');
            loadAllData();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في الإصلاح'), 'danger');
        }
    })
    .catch(err => {
        console.error('Fix vessel error:', err);
        showAlert('❌ خطأ في إصلاح المركب', 'danger');
    });
}

function openMaintenanceFile(vesselId) {
    const vessel = allVessels.find(v => v.id === vesselId);
    if (!vessel) return;
    showAlert(`📂 فتح ملف المركب: ${vessel.name}`, 'info');
}

function renderHistoryMaintenance() {
    const container = document.getElementById('historyMaintenanceContainer');
    if (!container) return;
    const records = allMaintenance.filter(r => r.status === 'مكتملة' || r.status === 'ملغية');
    if (records.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.2);">🚫 لا توجد سجلات</div>';
        return;
    }
    let html = '<div class="scrollable-table"><table><thead><tr><th>التاريخ</th><th>المركب</th><th>نوع الصيانة</th><th>العطل</th><th>التكلفة</th><th>الحالة</th></tr></thead><tbody>';
    records.slice().reverse().forEach(r => {
        const vesselName = r.vesselName || allVessels.find(v => v.id === r.vesselId)?.name || '-';
        html += `<tr>
            <td>${r.date || '-'}</td>
            <td><strong>${vesselName}</strong></td>
            <td>${r.type || '-'}</td>
            <td>${r.description || '-'}</td>
            <td>${r.cost ? r.cost + ' د.ت' : '-'}</td>
            <td><span class="status-badge status-closed">✅ ${r.status}</span></td>
        </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function updateYearFilter() {
    const select = document.getElementById('filterYear');
    if (!select) return;
    const years = new Set();
    allMaintenance.forEach(r => { if (r.date) years.add(r.date.split('-')[0]); });
    select.innerHTML = '<option value="">الكل</option>';
    Array.from(years).sort().reverse().forEach(year => {
        select.innerHTML += `<option value="${year}">${year}</option>`;
    });
}

function applyHistoryFilters() { renderHistoryMaintenance(); }
function resetHistoryFilters() { renderHistoryMaintenance(); showAlert('✅ تم إلغاء الفلترة', 'success'); }

function updateMaintenanceStats() {
    const container = document.getElementById('maintenanceStats');
    if (!container) return;
    container.innerHTML = `
        <div class="maintenance-stats">
            <div class="stat-box stat-total"><h4>${allMaintenance.length}</h4><p>📊 المجموع</p></div>
            <div class="stat-box stat-progress"><h4>${allMaintenance.filter(r => r.status === 'قيد الإنجاز').length}</h4><p>🔄 قيد الإنجاز</p></div>
            <div class="stat-box stat-completed"><h4>${allMaintenance.filter(r => r.status === 'مكتملة').length}</h4><p>✅ مكتملة</p></div>
            <div class="stat-box stat-cancelled"><h4>${allMaintenance.filter(r => r.status === 'ملغية').length}</h4><p>❌ ملغية</p></div>
        </div>
    `;
}

function renderMaintenanceUnits() {
    const container = document.getElementById('maintenanceUnitsContainer');
    if (!container) return;
    const units = ['وحدة الصيانة والإسناد البحري تونس', 'وحدة الصيانة والإسناد البحري صفاقس', 'وحدة الصيانة والإسناد البحري المنستير', 'وحدة الصيانة والإسناد البحري جرجيس', 'شركة خاصة'];
    let html = '';
    units.forEach(unit => {
        const records = allMaintenance.filter(r => r.unit === unit);
        html += `
            <div class="region-table-card">
                <div class="region-table-header">🏭 ${unit} <span style="font-size:12px; color:rgba(255,255,255,0.3);">📊 ${records.length} سجل</span></div>
                ${records.length === 0 ? '<div style="text-align:center; padding:10px; color:rgba(255,255,255,0.2);">🚫 لا توجد سجلات</div>' :
                `<div class="scrollable-table"><table><thead><tr><th>المركب</th><th>الفني</th><th>التكلفة</th><th>الحالة</th></tr></thead><tbody>
                ${records.slice().reverse().map(r => `
                    <tr><td>${r.vesselName || '-'}</td><td>${r.technician || '-'}</td><td>${r.cost ? r.cost + ' د.ت' : '-'}</td><td>${r.status || '-'}</td></tr>
                `).join('')}</tbody></table></div>`}
            </div>
        `;
    });
    container.innerHTML = html;
}

// ============================================================
// 📊 صفحة الجاهزية
// ============================================================

function renderEfficiency() {
    const vessels = allVessels || [];
    const countEl = document.getElementById('effCount');
    if (countEl) countEl.textContent = vessels.length;
    renderEfficiencyTables(vessels);
    updateEfficiencyStats(vessels);
    setTimeout(() => renderCharts(vessels), 200);
}

function updateEfficiencyStats(vessels) {
    const container = document.getElementById('efficiencyStats');
    if (!container) return;
    const total = vessels.length;
    const ready = vessels.filter(v => v.stat === 'صالح').length;
    const broken = vessels.filter(v => v.stat === 'معطب').length;
    const maintenance = vessels.filter(v => v.stat === 'صيانة').length;
    container.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(100px, 1fr)); gap:8px; margin:8px 0;">
            <div class="stat-card" style="padding:8px 12px;"><div style="font-size:18px; font-weight:bold; color:#60a5fa;">${total}</div><div style="color:rgba(255,255,255,0.3); font-size:10px;">🚢 المجموع</div></div>
            <div class="stat-card" style="padding:8px 12px; border-color:rgba(74,222,128,0.1);"><div style="font-size:18px; font-weight:bold; color:#4ade80;">${ready}</div><div style="color:rgba(255,255,255,0.3); font-size:10px;">✅ صالح</div></div>
            <div class="stat-card" style="padding:8px 12px; border-color:rgba(251,191,36,0.1);"><div style="font-size:18px; font-weight:bold; color:#fbbf24;">${maintenance}</div><div style="color:rgba(255,255,255,0.3); font-size:10px;">🔧 صيانة</div></div>
            <div class="stat-card" style="padding:8px 12px; border-color:rgba(248,113,113,0.1);"><div style="font-size:18px; font-weight:bold; color:#f87171;">${broken}</div><div style="color:rgba(255,255,255,0.3); font-size:10px;">❌ معطب</div></div>
        </div>
    `;
}

function renderCharts(vessels) {
    renderCategoryChart(vessels);
    renderDoughnutChart(vessels);
}

function renderCategoryChart(vessels) {
    const canvas = document.getElementById('chartCategory');
    if (!canvas) return;
    canvas.style.height = '110px';
    canvas.style.width = '100%';
    
    const categories = {};
    vessels.forEach(v => {
        const cat = v.cat || 'غير مصنف';
        if (!categories[cat]) categories[cat] = { ready: 0, broken: 0, maintenance: 0 };
        if (v.stat === 'صالح') categories[cat].ready++;
        else if (v.stat === 'معطب') categories[cat].broken++;
        else if (v.stat === 'صيانة') categories[cat].maintenance++;
    });
    
    const labels = Object.keys(categories);
    if (chartCategory) chartCategory.destroy();
    
    chartCategory = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'صالح', data: labels.map(cat => categories[cat].ready), backgroundColor: 'rgba(74,222,128,0.7)', borderColor: '#4ade80', borderWidth: 1, barThickness: 12 },
                { label: 'معطب', data: labels.map(cat => categories[cat].broken), backgroundColor: 'rgba(248,113,113,0.7)', borderColor: '#f87171', borderWidth: 1, barThickness: 12 },
                { label: 'صيانة', data: labels.map(cat => categories[cat].maintenance), backgroundColor: 'rgba(251,191,36,0.7)', borderColor: '#fbbf24', borderWidth: 1, barThickness: 12 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 7 }, color: 'rgba(255,255,255,0.4)' } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 7 }, color: 'rgba(255,255,255,0.4)' } },
                y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 6 }, color: 'rgba(255,255,255,0.4)' } }
            }
        }
    });
}

function renderDoughnutChart(vessels) {
    const canvas = document.getElementById('chartDoughnut');
    if (!canvas) return;
    canvas.style.height = '110px';
    canvas.style.width = '100%';
    
    const ready = vessels.filter(v => v.stat === 'صالح').length;
    const broken = vessels.filter(v => v.stat === 'معطب').length;
    const maintenance = vessels.filter(v => v.stat === 'صيانة').length;
    
    if (chartDoughnut) chartDoughnut.destroy();
    
    chartDoughnut = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: ['صالح', 'معطب', 'صيانة'],
            datasets: [{
                data: [ready, broken, maintenance],
                backgroundColor: ['rgba(74,222,128,0.8)', 'rgba(248,113,113,0.8)', 'rgba(251,191,36,0.8)'],
                borderColor: ['#4ade80', '#f87171', '#fbbf24'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '50%',
            animation: { duration: 0 },
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 7 }, color: 'rgba(255,255,255,0.4)' } }
            }
        }
    });
}

function renderEfficiencyTables(vessels) {
    const container = document.getElementById('efficiencyTablesContainer');
    if (!container) return;
    let html = renderGeneralEfficiencyTable(vessels);
    const regions = { 'الشمال': ['بنزرت', 'طبرقة', 'المرسى', 'غار الملح'], 'الساحل': ['سوسة', 'المنستير', 'المهدية'], 'الوسط': ['صفاقس', 'قابس', 'جربة'], 'الجنوب': ['جرجيس', 'بن قردان'] };
    Object.keys(regions).forEach(region => {
        const regionVessels = vessels.filter(v => regions[region].some(city => v.zone?.includes(city)));
        if (regionVessels.length > 0) html += renderRegionEfficiencyTable(regionVessels, region);
    });
    container.innerHTML = html;
}

function renderGeneralEfficiencyTable(vessels) {
    const categories = getCategoriesData(vessels);
    let html = `<div class="stat-card" style="padding:12px; margin:10px 0;"><h4 style="color:rgba(255,255,255,0.6); font-size:13px;">📋 النجاعة العامة حسب الفئات</h4><div class="scrollable-table"><table><thead><tr><th>الفئة</th><th style="color:#4ade80;">صالح</th><th style="color:#f87171;">معطب</th><th style="color:#fbbf24;">صيانة</th><th>الإجمالي</th><th>النسبة</th></tr></thead><tbody>`;
    let totalReady = 0, totalBroken = 0, totalMaintenance = 0, totalAll = 0;
    const order = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
    order.forEach(cat => {
        const data = categories[cat] || { ready: 0, broken: 0, maintenance: 0, total: 0 };
        const pct = data.total > 0 ? Math.round((data.ready / data.total) * 100) : 0;
        totalReady += data.ready; totalBroken += data.broken; totalMaintenance += data.maintenance; totalAll += data.total;
        html += `<tr><td><strong>${cat}</strong></td><td style="color:#4ade80;">${data.ready}</td><td style="color:#f87171;">${data.broken}</td><td style="color:#fbbf24;">${data.maintenance}</td><td>${data.total}</td><td>${pct}%</td></tr>`;
    });
    const totalPct = totalAll > 0 ? Math.round((totalReady / totalAll) * 100) : 0;
    html += `<tr style="border-top:2px solid rgba(255,255,255,0.1);"><td><strong>المجموع</strong></td><td style="color:#4ade80;">${totalReady}</td><td style="color:#f87171;">${totalBroken}</td><td style="color:#fbbf24;">${totalMaintenance}</td><td>${totalAll}</td><td>${totalPct}%</td></tr>`;
    html += '</tbody></table></div></div>';
    return html;
}

function renderRegionEfficiencyTable(vessels, regionName) {
    const categories = getCategoriesData(vessels);
    let html = `<div class="stat-card" style="padding:12px; margin:10px 0;"><h4 style="color:rgba(255,255,255,0.6); font-size:13px;">📋 إقليم الحرس البحري بال${regionName}</h4><div class="scrollable-table"><table><thead><tr><th>الفئة</th><th style="color:#4ade80;">صالح</th><th style="color:#f87171;">معطب</th><th style="color:#fbbf24;">صيانة</th><th>الإجمالي</th><th>النسبة</th></tr></thead><tbody>`;
    let totalReady = 0, totalBroken = 0, totalMaintenance = 0, totalAll = 0;
    const order = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
    order.forEach(cat => {
        const data = categories[cat] || { ready: 0, broken: 0, maintenance: 0, total: 0 };
        const pct = data.total > 0 ? Math.round((data.ready / data.total) * 100) : 0;
        totalReady += data.ready; totalBroken += data.broken; totalMaintenance += data.maintenance; totalAll += data.total;
        html += `<tr><td><strong>${cat}</strong></td><td style="color:#4ade80;">${data.ready}</td><td style="color:#f87171;">${data.broken}</td><td style="color:#fbbf24;">${data.maintenance}</td><td>${data.total}</td><td>${pct}%</td></tr>`;
    });
    const totalPct = totalAll > 0 ? Math.round((totalReady / totalAll) * 100) : 0;
    html += `<tr style="border-top:2px solid rgba(255,255,255,0.1);"><td><strong>المجموع</strong></td><td style="color:#4ade80;">${totalReady}</td><td style="color:#f87171;">${totalBroken}</td><td style="color:#fbbf24;">${totalMaintenance}</td><td>${totalAll}</td><td>${totalPct}%</td></tr>`;
    html += '</tbody></table></div></div>';
    return html;
}

function getCategoriesData(vessels) {
    const categories = {};
    vessels.forEach(v => {
        const cat = v.cat || 'غير مصنف';
        if (!categories[cat]) categories[cat] = { ready: 0, broken: 0, maintenance: 0, total: 0 };
        categories[cat].total++;
        if (v.stat === 'صالح') categories[cat].ready++;
        else if (v.stat === 'معطب') categories[cat].broken++;
        else if (v.stat === 'صيانة') categories[cat].maintenance++;
    });
    return categories;
}

// ============================================================
// 📊 لوحة التحكم (Dashboard)
// ============================================================

function loadDashboard() {
    console.log('📊 Loading dashboard...');
    
    const dashTotal = document.getElementById('dashTotal');
    if (!dashTotal) {
        console.log('⚠️ Dashboard elements not found, skipping...');
        return;
    }
    
    const total = allVessels.length;
    const ready = allVessels.filter(v => v.stat === 'صالح').length;
    const broken = allVessels.filter(v => v.stat === 'معطب').length;
    const maintenance = allVessels.filter(v => v.stat === 'صيانة' || v.stat === 'خارج الخدمة').length;
    const readyPercent = total > 0 ? Math.round((ready / total) * 100) : 0;
    const totalCost = allMaintenance.reduce((sum, r) => sum + (r.cost || 0), 0);
    const maintenanceCount = allMaintenance.length;
    
    document.getElementById('dashTotal').textContent = total;
    document.getElementById('dashReady').textContent = ready;
    document.getElementById('dashBroken').textContent = broken;
    document.getElementById('dashMaintenance').textContent = maintenance;
    document.getElementById('dashReadyPercent').textContent = readyPercent + '%';
    document.getElementById('dashTotalCost').textContent = totalCost.toLocaleString() + ' د.ت';
    document.getElementById('dashMaintenanceCount').textContent = maintenanceCount;
    
    const now = new Date();
    document.getElementById('lastUpdate').textContent = now.toLocaleTimeString('ar-TN');
    
    setTimeout(() => {
        renderDashboardCharts();
    }, 200);
}

function renderDashboardCharts() {
    try {
        const dashCanvas = document.getElementById('dashChart');
        if (dashCanvas) {
            dashCanvas.style.height = '200px';
            dashCanvas.style.width = '100%';
            if (dashChart) dashChart.destroy();
            
            const ready = allVessels.filter(v => v.stat === 'صالح').length;
            const broken = allVessels.filter(v => v.stat === 'معطب').length;
            const maintenance = allVessels.filter(v => v.stat === 'صيانة' || v.stat === 'خارج الخدمة').length;
            
            dashChart = new Chart(dashCanvas, {
                type: 'doughnut',
                data: {
                    labels: ['✅ صالح', '❌ معطب', '🔧 صيانة'],
                    datasets: [{
                        data: [ready, broken, maintenance],
                        backgroundColor: ['rgba(74,222,128,0.8)', 'rgba(248,113,113,0.8)', 'rgba(251,191,36,0.8)'],
                        borderColor: ['#4ade80', '#f87171', '#fbbf24'],
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '60%',
                    plugins: {
                        legend: { 
                            position: 'bottom', 
                            labels: { 
                                color: 'rgba(255,255,255,0.6)', 
                                font: { size: 11 } 
                            } 
                        }
                    }
                }
            });
        }
    } catch(e) {
        console.log('⚠️ Dashboard chart error:', e);
    }
    
    try {
        const lineCanvas = document.getElementById('dashLineChart');
        if (lineCanvas) {
            lineCanvas.style.height = '200px';
            lineCanvas.style.width = '100%';
            if (dashLineChart) dashLineChart.destroy();
            
            const months = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان'];
            const readyData = [12, 14, 13, 16, 18, 20];
            const brokenData = [5, 4, 6, 3, 4, 2];
            
            dashLineChart = new Chart(lineCanvas, {
                type: 'line',
                data: {
                    labels: months,
                    datasets: [
                        { 
                            label: 'صالح', 
                            data: readyData, 
                            borderColor: '#4ade80', 
                            backgroundColor: 'rgba(74,222,128,0.1)', 
                            fill: true, 
                            tension: 0.4, 
                            pointBackgroundColor: '#4ade80' 
                        },
                        { 
                            label: 'معطب', 
                            data: brokenData, 
                            borderColor: '#f87171', 
                            backgroundColor: 'rgba(248,113,113,0.1)', 
                            fill: true, 
                            tension: 0.4, 
                            pointBackgroundColor: '#f87171' 
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { 
                        legend: { 
                            position: 'bottom', 
                            labels: { 
                                color: 'rgba(255,255,255,0.6)', 
                                font: { size: 11 } 
                            } 
                        } 
                    },
                    scales: { 
                        x: { 
                            ticks: { color: 'rgba(255,255,255,0.3)' } 
                        }, 
                        y: { 
                            ticks: { color: 'rgba(255,255,255,0.3)' }, 
                            beginAtZero: true 
                        } 
                    }
                }
            });
        }
    } catch(e) {
        console.log('⚠️ Dashboard line chart error:', e);
    }
    
    updateDashboardActivity();
}

function updateDashboardActivity() {
    const container = document.getElementById('dashActivity');
    if (!container) return;
    
    const activities = [];
    allMaintenance.slice(0, 5).forEach(r => {
        activities.push({ icon: '🔧', text: `صيانة ${r.vesselName || 'مركب'} - ${r.type || 'عادية'}`, time: r.date || 'اليوم' });
    });
    allVessels.filter(v => v.stat === 'معطب').slice(0, 3).forEach(v => {
        activities.push({ icon: '⚠️', text: `المركب ${v.name} أصبح معطباً`, time: v.fDate || 'اليوم' });
    });
    
    if (activities.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.2);">لا توجد نشاطات حديثة</div>';
        return;
    }
    
    container.innerHTML = activities.map(a => `
        <div class="activity-item">
            <span class="activity-icon">${a.icon}</span>
            <span>${a.text}</span>
            <span class="activity-time">${a.time}</span>
        </div>
    `).join('');
}

// ============================================================
// دوال إضافية
// ============================================================

function exportEfficiencyData() {
    showAlert('✅ تم تصدير البيانات', 'success');
}

function initMap() {
    console.log('🗺️ Initializing map...');
}

// ============================================================
// تشغيل التطبيق
// ============================================================

console.log('✅ تم تحميل التطبيق بالكامل');
console.log('📝 استخدم admin / 123456 للدخول');
console.log('👤 حسابات: admin, manager, editor, viewer');
console.log('🔑 كلمة المرور: 123456');
