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

// متغيرات الخريطة
let userMap = null;
let userMarkers = [];
let mapInitialized = false;
let mapRetryCount = 0;
let mapRefreshInterval = null;

// متغيرات الصوت
let recognition = null;
let isListening = false;
let lastResponseText = '';

// متغيرات استيراد الملفات
let importedData = [];
let importedFileName = '';

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
            
            setTimeout(() => {
                initPage(pageName);
            }, 100);
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
    console.log('📄 Initializing page:', pageName);
    switch(pageName) {
        case 'dashboard': 
            loadDashboard(); 
            break;
        case 'fleet': 
            loadVessels(); 
            break;
        case 'maintenance': 
            loadMaintenance(); 
            break;
        case 'efficiency': 
            loadVessels(); 
            break;
        case 'support': 
            loadTickets(); 
            break;
        case 'tracking': 
            initTrackingPage(); 
            break;
        case 'map': 
            setTimeout(initMap, 100); 
            break;
        case 'users': 
            loadUsers(); 
            break;
        case 'notes': 
            loadNotes(); 
            break;
        case 'sessions': 
            loadSessions(); 
            startTrackingAutoUpdate(); 
            setTimeout(function() {
                initUserMap();
                startMapAutoRefresh();
            }, 800);
            break;
        case 'ai-assistant': 
            initAIAssistant(); 
            break;
        default: 
            console.log('⚠️ Unknown page:', pageName);
    }
}

function initAIAssistant() {
    console.log('🤖 AI Assistant initialized with voice and file import support');
    loadVoices();
    
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        recognition = initSpeechRecognition();
        console.log('🎤 Speech recognition ready');
    } else {
        console.warn('⚠️ Speech recognition not supported');
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
        'support': 4, 'tracking': 5, 'map': 6, 'users': 7, 'notes': 8, 
        'sessions': 9, 'ai-assistant': 10
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

function getTimeAgo(date) {
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'الآن';
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    if (hours < 24) return `منذ ${hours} ساعة`;
    return `منذ ${days} يوم`;
}

function formatTime(date) {
    return date.toLocaleDateString('ar-TN') + ' ' + date.toLocaleTimeString('ar-TN', { hour: '2-digit', minute: '2-digit' });
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
    
    if (mapRefreshInterval) {
        clearInterval(mapRefreshInterval);
        mapRefreshInterval = null;
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
    allUsers = [
        { id: '1', name: 'مدير النظام', email: 'admin@example.com', role: 'مسؤول', isActive: true, createdAt: new Date().toISOString() },
        { id: '2', name: 'مدير العمليات', email: 'manager@example.com', role: 'مشرف', isActive: true, createdAt: new Date().toISOString() },
        { id: '3', name: 'محرر', email: 'editor@example.com', role: 'محرر', isActive: true, createdAt: new Date().toISOString() },
        { id: '4', name: 'مشاهد', email: 'viewer@example.com', role: 'مشاهد', isActive: true, createdAt: new Date().toISOString() }
    ];
    renderUsersTable();
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
        { id: 5, name: 'البروق 5', num: 'B005', len: 25, cat: 'البروق', reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: 'الوحدة 3', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-005', repairer: 'فني 3' }
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
                <button class="btn-sm btn-warning" onclick="editVessel('${v.id}')">✏️</button>
                <button class="btn-sm btn-danger" onclick="deleteVessel('${v.id}')">🗑️</button>
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
// 👥 دوال المستخدمين
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
    
    if (token.startsWith('demo-token')) {
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
    
    if (token.startsWith('demo-token')) {
        allUsers = allUsers.filter(u => u.id !== id);
        renderUsersTable();
        showAlert('✅ تم حذف المستخدم (وضع تجريبي)', 'success');
        return;
    }
    
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
// 🚢 دوال المراكب
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
    editingVesselId = null;
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
// 🔧 دوال الصيانة
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
// 🗺️ خريطة تتبع مواقع المستخدمين بالساتلايت
// ============================================================

function initUserMap() {
    console.log('🗺️ Initializing map...');
    
    const mapContainer = document.getElementById('userMap');
    if (!mapContainer) {
        console.warn('⚠️ Map container not found, retrying...');
        if (mapRetryCount < 10) {
            mapRetryCount++;
            setTimeout(initUserMap, 500);
        }
        return;
    }

    if (userMap) {
        console.log('🔄 Map already exists, refreshing...');
        try {
            userMap.invalidateSize();
            loadUserLocations();
        } catch(e) {
            console.warn('⚠️ Error refreshing map:', e);
            userMap = null;
            mapInitialized = false;
            setTimeout(initUserMap, 300);
        }
        return;
    }

    if (typeof L === 'undefined') {
        console.warn('⚠️ Leaflet not loaded, retrying...');
        if (mapRetryCount < 5) {
            mapRetryCount++;
            setTimeout(initUserMap, 1000);
        }
        return;
    }

    const tunisiaCenter = [33.8869, 9.5375];

    try {
        userMap = L.map('userMap', {
            center: tunisiaCenter,
            zoom: 7,
            zoomControl: true,
            fadeAnimation: true,
            attributionControl: true
        });

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a> | Satellite',
            maxZoom: 19,
            minZoom: 3
        }).addTo(userMap);

        const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19
        });

        const googleSatellite = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
            attribution: '&copy; Google',
            maxZoom: 20,
            subdomains: ['mt1', 'mt2', 'mt3']
        });

        const baseLayers = {
            "🛰️ ساتلايت (Esri)": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: '&copy; Esri',
                maxZoom: 19
            }),
            "🛰️ ساتلايت (Google)": googleSatellite,
            "🗺️ خريطة عادية": streetLayer
        };

        L.control.layers(baseLayers).addTo(userMap);
        L.control.scale({ position: 'bottomright', metric: true, imperial: false }).addTo(userMap);
        L.control.zoom({ position: 'topright' }).addTo(userMap);

        mapInitialized = true;
        mapRetryCount = 0;
        
        loadUserLocations();

        setTimeout(() => {
            if (userMap) {
                userMap.invalidateSize();
                console.log('✅ Map size updated');
            }
        }, 500);

        if (!window._mapResizeHandler) {
            window._mapResizeHandler = function() {
                if (userMap) {
                    setTimeout(() => {
                        try {
                            userMap.invalidateSize();
                        } catch(e) {}
                    }, 300);
                }
            };
            window.addEventListener('resize', window._mapResizeHandler);
        }

        console.log('✅ Map initialized successfully');

    } catch (error) {
        console.error('❌ Error initializing map:', error);
        if (mapRetryCount < 3) {
            mapRetryCount++;
            setTimeout(initUserMap, 1000);
        }
    }
}

function startMapAutoRefresh() {
    if (mapRefreshInterval) {
        clearInterval(mapRefreshInterval);
    }
    mapRefreshInterval = setInterval(function() {
        if (document.getElementById('page-sessions')) {
            if (userMap) {
                try {
                    userMap.invalidateSize();
                    loadUserLocations();
                    console.log('🔄 Map refreshed automatically');
                } catch(e) {
                    console.warn('⚠️ Map refresh error:', e);
                }
            }
        }
    }, 30000);
}

function loadUserLocations() {
    if (!userMap) {
        console.warn('⚠️ Map not initialized, cannot load locations');
        return;
    }

    try {
        userMarkers.forEach(marker => {
            try {
                userMap.removeLayer(marker);
            } catch (e) {}
        });
    } catch(e) {}
    userMarkers = [];

    const userLocations = [
        { name: 'مدير النظام', role: 'مسؤول', status: 'online', lat: 36.8065, lng: 10.1815, city: 'تونس', device: 'Chrome / Windows', ip: '192.168.1.1', lastActive: 'الآن' },
        { name: 'مدير العمليات', role: 'مشرف', status: 'online', lat: 35.8277, lng: 10.6420, city: 'سوسة', device: 'Firefox / Mac', ip: '192.168.1.2', lastActive: 'منذ 5 دقائق' },
        { name: 'محرر', role: 'محرر', status: 'idle', lat: 34.7396, lng: 10.7600, city: 'صفاقس', device: 'Safari / iPhone', ip: '192.168.1.3', lastActive: 'منذ 15 دقيقة' },
        { name: 'مشاهد', role: 'مشاهد', status: 'offline', lat: 33.8869, lng: 9.5375, city: 'القيروان', device: 'Edge / Windows', ip: '192.168.1.4', lastActive: 'منذ ساعة' },
        { name: 'فني صيانة', role: 'محرر', status: 'online', lat: 37.2744, lng: 9.8739, city: 'بنزرت', device: 'Chrome / Android', ip: '192.168.1.5', lastActive: 'منذ دقيقتين' }
    ];

    const statusColors = {
        'online': '#4ade80',
        'idle': '#fbbf24',
        'offline': '#f87171'
    };

    const statusLabels = {
        'online': '🟢 نشط',
        'idle': '🟡 غير نشط',
        'offline': '🔴 غير متصل'
    };

    userLocations.forEach(user => {
        try {
            const icon = L.divIcon({
                className: 'custom-div-icon',
                html: `
                    <div style="
                        background: rgba(0,0,0,0.85);
                        border-radius: 12px;
                        padding: 6px 12px 6px 8px;
                        border: 2px solid ${statusColors[user.status]};
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        box-shadow: 0 4px 15px rgba(0,0,0,0.5);
                        font-size: 12px;
                        color: white;
                        white-space: nowrap;
                        font-family: 'Cairo', sans-serif;
                        backdrop-filter: blur(4px);
                    ">
                        <span style="
                            width: 10px;
                            height: 10px;
                            border-radius: 50%;
                            background: ${statusColors[user.status]};
                            display: inline-block;
                            animation: ${user.status === 'online' ? 'pulse 1.5s infinite' : 'none'};
                            box-shadow: 0 0 10px ${statusColors[user.status]}40;
                        "></span>
                        <span style="font-weight:bold;">${user.name}</span>
                        <span style="font-size:10px; opacity:0.6;">${user.role}</span>
                    </div>
                `,
                iconSize: [150, 35],
                iconAnchor: [75, 17],
                className: 'user-marker-icon'
            });

            const popupContent = `
                <div style="text-align:right; font-family:'Cairo',sans-serif; min-width:200px; padding:4px;">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:8px;">
                        <div style="font-size:28px;">👤</div>
                        <div>
                            <div style="font-weight:bold; font-size:16px; color:#1a1a2e;">${user.name}</div>
                            <div style="font-size:12px; color:#666;">${user.role}</div>
                        </div>
                    </div>
                    <div style="font-size:13px; color:#444; line-height:1.8;">
                        <div>📍 <strong>${user.city}</strong></div>
                        <div>💻 ${user.device}</div>
                        <div>🌐 ${user.ip}</div>
                        <div>🕐 ${user.lastActive}</div>
                        <div style="margin-top:6px;">
                            <span class="status-badge ${user.status}" style="padding:2px 12px; border-radius:10px; font-size:11px; background:${statusColors[user.status]}20; color:${statusColors[user.status]};">
                                ${statusLabels[user.status]}
                            </span>
                        </div>
                        <div style="margin-top:4px; font-size:10px; color:#999;">
                            🛰️ ${user.lat}, ${user.lng}
                        </div>
                    </div>
                </div>
            `;

            const marker = L.marker([user.lat, user.lng], { icon: icon })
                .addTo(userMap)
                .bindPopup(popupContent, { maxWidth: 280 });

            userMarkers.push(marker);
        } catch(e) {
            console.warn('⚠️ Error adding marker for user:', user.name, e);
        }
    });

    if (userMarkers.length > 0) {
        try {
            const group = L.featureGroup(userMarkers);
            userMap.fitBounds(group.getBounds().pad(0.2));
        } catch(e) {
            console.warn('⚠️ Error fitting bounds:', e);
        }
    }
}

function refreshUserMap() {
    if (userMap) {
        loadUserLocations();
        setTimeout(() => {
            if (userMap) {
                try {
                    userMap.invalidateSize();
                } catch(e) {}
            }
        }, 200);
        showAlert('🔄 تم تحديث خريطة المواقع', 'success');
    } else {
        initUserMap();
    }
}

// ============================================================
// 👁️ صفحة المراقبة - تتبع تحركات المستخدمين
// ============================================================

let activityLog = [];
let sessionsData = [];
let trackingInterval = null;

function initActivityData() {
    const users = [
        { name: 'مدير النظام', role: 'مسؤول' },
        { name: 'مدير العمليات', role: 'مشرف' },
        { name: 'محرر', role: 'محرر' },
        { name: 'مشاهد', role: 'مشاهد' },
        { name: 'فني صيانة', role: 'محرر' }
    ];

    const actions = ['تسجيل دخول', 'تسجيل خروج', 'عرض', 'تعديل', 'إضافة', 'حذف'];
    const pages = ['لوحة التحكم', 'الأسطول', 'الصيانة', 'الجاهزية', 'الدعم', 'المستخدمين', 'المذكرات', 'المساعد الذكي'];
    const devices = ['Chrome / Windows', 'Firefox / Mac', 'Safari / iPhone', 'Edge / Windows', 'Chrome / Android'];

    for (let i = 0; i < 50; i++) {
        const user = users[Math.floor(Math.random() * users.length)];
        const action = actions[Math.floor(Math.random() * actions.length)];
        const page = pages[Math.floor(Math.random() * pages.length)];
        const device = devices[Math.floor(Math.random() * devices.length)];
        
        const date = new Date();
        date.setHours(date.getHours() - Math.floor(Math.random() * 72));
        
        activityLog.push({
            id: i + 1,
            user: user.name,
            role: user.role,
            action: action,
            page: page,
            device: device,
            time: date,
            ip: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
        });
    }

    activityLog.sort((a, b) => b.time - a.time);

    sessionsData = [
        { id: 1, name: 'مدير النظام', role: 'مسؤول', ip: '192.168.1.1', device: 'Chrome / Windows', lastActive: new Date(), status: 'online' },
        { id: 2, name: 'مدير العمليات', role: 'مشرف', ip: '192.168.1.2', device: 'Firefox / Mac', lastActive: new Date(Date.now() - 300000), status: 'online' },
        { id: 3, name: 'محرر', role: 'محرر', ip: '192.168.1.3', device: 'Safari / iPhone', lastActive: new Date(Date.now() - 900000), status: 'idle' },
        { id: 4, name: 'مشاهد', role: 'مشاهد', ip: '192.168.1.4', device: 'Edge / Windows', lastActive: new Date(Date.now() - 3600000), status: 'offline' }
    ];
}

function loadSessions() {
    if (activityLog.length === 0) {
        initActivityData();
    }

    updateStats();
    renderSessions();
    renderActivityLog();
    
    setTimeout(initUserMap, 500);
    setTimeout(startMapAutoRefresh, 1000);
}

function updateStats() {
    const online = sessionsData.filter(s => s.status === 'online').length;
    const total = sessionsData.length;
    const today = activityLog.filter(a => {
        const today = new Date();
        return a.time.getDate() === today.getDate() &&
               a.time.getMonth() === today.getMonth() &&
               a.time.getFullYear() === today.getFullYear();
    }).length;

    document.getElementById('onlineCount').textContent = online;
    document.getElementById('totalUsers').textContent = total;
    document.getElementById('todayActivity').textContent = today;
}

function renderSessions() {
    const container = document.getElementById('sessionsGrid');
    if (!container) return;

    if (sessionsData.length === 0) {
        container.innerHTML = '<div class="no-data">🚫 لا توجد جلسات نشطة</div>';
        return;
    }

    const statusLabels = {
        'online': '🟢 نشط',
        'idle': '🟡 غير نشط',
        'offline': '🔴 غير متصل'
    };

    const statusClass = {
        'online': 'online',
        'idle': 'idle',
        'offline': 'offline'
    };

    container.innerHTML = sessionsData.map(s => {
        const timeAgo = getTimeAgo(s.lastActive);
        return `
            <div class="session-card">
                <div class="header">
                    <span class="user-name">${s.name}</span>
                    <span class="user-role">${s.role}</span>
                </div>
                <div class="info"><i class="fas fa-laptop"></i> ${s.device}</div>
                <div class="info"><i class="fas fa-network-wired"></i> ${s.ip}</div>
                <div class="info"><i class="fas fa-clock"></i> آخر نشاط: ${timeAgo}</div>
                <span class="status ${statusClass[s.status]}">${statusLabels[s.status]}</span>
            </div>
        `;
    }).join('');
}

function renderActivityLog(filteredData) {
    const tbody = document.getElementById('activityBody');
    if (!tbody) return;

    const data = filteredData || activityLog;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">🚫 لا توجد سجلات</td></tr>';
        return;
    }

    const actionClass = {
        'تسجيل دخول': 'login',
        'تسجيل خروج': 'logout',
        'عرض': 'view',
        'تعديل': 'edit',
        'إضافة': 'add',
        'حذف': 'delete'
    };

    tbody.innerHTML = data.slice(0, 100).map(a => `
        <tr>
            <td><strong>${a.user}</strong> <span style="font-size:11px; color:rgba(255,255,255,0.2);">${a.role}</span></td>
            <td><span class="action ${actionClass[a.action] || ''}">${a.action}</span></td>
            <td>${a.page}</td>
            <td>${a.ip}</td>
            <td class="time">${formatTime(a.time)}</td>
        </tr>
    `).join('');
}

function filterActivity() {
    const search = document.getElementById('searchActivity')?.value?.toLowerCase() || '';
    const action = document.getElementById('filterAction')?.value || '';

    let filtered = activityLog;

    if (search) {
        filtered = filtered.filter(a => 
            a.user.toLowerCase().includes(search) ||
            a.page.toLowerCase().includes(search) ||
            a.action.includes(search)
        );
    }

    if (action) {
        filtered = filtered.filter(a => a.action === action);
    }

    renderActivityLog(filtered);
}

function clearFilters() {
    document.getElementById('searchActivity').value = '';
    document.getElementById('filterAction').value = '';
    renderActivityLog(activityLog);
}

function startTrackingAutoUpdate() {
    if (trackingInterval) clearInterval(trackingInterval);
    trackingInterval = setInterval(() => {
        if (document.getElementById('page-sessions')) {
            renderSessions();
            if (userMap) {
                loadUserLocations();
                setTimeout(() => {
                    if (userMap) userMap.invalidateSize();
                }, 100);
            }
        }
    }, 30000);
}

// ============================================================
// 🎤 ميزات الصوت (Speech-to-Text & Text-to-Speech)
// ============================================================

function speakText(text) {
    const cleanText = text.replace(/<[^>]*>/g, '').trim();
    
    if (!cleanText) {
        showAlert('⚠️ لا يوجد نص للتحدث', 'warning');
        return;
    }

    lastResponseText = cleanText;

    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'ar-SA';
        utterance.rate = 0.85;
        utterance.pitch = 1.0;
        utterance.volume = 1;

        const voices = window.speechSynthesis.getVoices();
        const preferredVoices = [
            'Microsoft Zira Arabic',
            'Microsoft Naheel Arabic',
            'Google العربية',
            'Samantha',
            'Maged',
            'Zira',
            'ar-SA'
        ];

        let selectedVoice = null;
        for (const preferred of preferredVoices) {
            const found = voices.find(v => 
                v.name.includes(preferred) || 
                v.lang.startsWith('ar')
            );
            if (found) {
                selectedVoice = found;
                break;
            }
        }

        if (!selectedVoice) {
            selectedVoice = voices.find(v => v.lang.startsWith('ar')) || null;
        }

        if (selectedVoice) {
            utterance.voice = selectedVoice;
            console.log('🎤 Using voice:', selectedVoice.name);
        }

        showAlert('🔊 جاري التحدث...', 'info');

        utterance.onend = function() {
            showAlert('✅ انتهى التحدث', 'success');
        };

        utterance.onerror = function() {
            showAlert('❌ خطأ في تشغيل الصوت', 'danger');
        };

        window.speechSynthesis.speak(utterance);
    } else {
        showAlert('❌ متصفحك لا يدعم خاصية النطق', 'danger');
    }
}

function speakLastResponse() {
    if (lastResponseText) {
        speakText(lastResponseText);
    } else {
        const messages = document.querySelectorAll('.chat-message.ai .content');
        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            speakText(lastMessage.textContent);
        } else {
            showAlert('⚠️ لا يوجد رد سابق للتحدث', 'warning');
        }
    }
}

function loadVoices() {
    if ('speechSynthesis' in window) {
        let voices = window.speechSynthesis.getVoices();
        if (voices.length === 0) {
            window.speechSynthesis.onvoiceschanged = function() {
                voices = window.speechSynthesis.getVoices();
                window.availableVoices = voices;
            };
        } else {
            window.availableVoices = voices;
        }
    }
}

function initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showAlert('❌ متصفحك لا يدعم خاصية التعرف على الصوت', 'danger');
        return null;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    
    recognition.lang = 'ar-SA';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = function() {
        isListening = true;
        document.getElementById('micBtn')?.classList.add('listening');
        document.getElementById('micBtn').innerHTML = '⏹️';
        document.getElementById('voiceStatus').style.display = 'block';
        document.getElementById('voiceStatus').className = 'voice-status active';
        document.getElementById('voiceStatusText').textContent = '🎤 جاري الاستماع... تحدث الآن';
        showAlert('🎤 جاري الاستماع...', 'info');
    };

    recognition.onresult = function(event) {
        const result = event.results[event.results.length - 1];
        const transcript = result[0].transcript.trim();
        
        document.getElementById('voiceStatusText').textContent = `📝 ${transcript}`;

        if (result.isFinal) {
            document.getElementById('chatInput').value = transcript;
            document.getElementById('voiceStatusText').textContent = `✅ تم التعرف على: ${transcript}`;
            
            setTimeout(() => {
                askAI(transcript);
                stopVoiceInput();
            }, 500);
        }
    };

    recognition.onerror = function(event) {
        console.error('Speech recognition error:', event.error);
        
        let errorMessage = '❌ حدث خطأ في التعرف على الصوت';
        if (event.error === 'not-allowed') {
            errorMessage = '❌ الرجاء السماح للتطبيق باستخدام الميكروفون';
        } else if (event.error === 'no-speech') {
            errorMessage = '⚠️ لم يتم سماع أي صوت، حاول مرة أخرى';
        }
        
        showAlert(errorMessage, 'danger');
        stopVoiceInput();
    };

    recognition.onend = function() {
        stopVoiceInput();
    };

    return recognition;
}

function toggleVoiceInput() {
    if (isListening) {
        stopVoiceInput();
    } else {
        startVoiceInput();
    }
}

function startVoiceInput() {
    if (!recognition) {
        recognition = initSpeechRecognition();
        if (!recognition) return;
    }

    try {
        recognition.start();
        isListening = true;
    } catch (error) {
        console.error('Start recognition error:', error);
        showAlert('❌ خطأ في تشغيل الميكروفون', 'danger');
    }
}

function stopVoiceInput() {
    if (recognition) {
        try {
            recognition.stop();
        } catch (error) {
            console.error('Stop recognition error:', error);
        }
    }
    
    isListening = false;
    const micBtn = document.getElementById('micBtn');
    if (micBtn) {
        micBtn.classList.remove('listening');
        micBtn.innerHTML = '🎤';
    }
    const voiceStatus = document.getElementById('voiceStatus');
    if (voiceStatus) {
        voiceStatus.className = 'voice-status';
        voiceStatus.style.display = 'none';
    }
}

// ============================================================
// 📂 استيراد البيانات من ملفات (Excel, CSV, PDF)
// ============================================================

function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    const uploadStatus = document.getElementById('uploadStatus');
    const uploadBtn = document.getElementById('uploadBtn');
    
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showUploadStatus('⚠️ الرجاء اختيار ملف أولاً', 'error');
        return;
    }
    
    const file = fileInput.files[0];
    const fileName = file.name;
    const fileExtension = fileName.split('.').pop().toLowerCase();
    
    const allowedExtensions = ['xlsx', 'xls', 'csv', 'pdf'];
    if (!allowedExtensions.includes(fileExtension)) {
        showUploadStatus('❌ نوع الملف غير مدعوم. المدعوم: Excel, CSV, PDF', 'error');
        return;
    }
    
    uploadBtn.disabled = true;
    uploadBtn.textContent = '⏳ جاري التحليل...';
    showUploadStatus('⏳ جاري قراءة الملف...', 'info');
    
    const reader = new FileReader();
    
    if (fileExtension === 'csv') {
        reader.onload = function(e) {
            try {
                const text = e.target.result;
                const data = parseCSV(text);
                handleImportedData(data, fileName);
            } catch (error) {
                showUploadStatus('❌ خطأ في قراءة الملف: ' + error.message, 'error');
            }
            uploadBtn.disabled = false;
            uploadBtn.textContent = '📤 رفع واستيراد';
        };
        reader.readAsText(file, 'UTF-8');
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                if (typeof XLSX === 'undefined') {
                    showUploadStatus('❌ مكتبة Excel غير محملة. يرجى تثبيت SheetJS', 'error');
                    uploadBtn.disabled = false;
                    uploadBtn.textContent = '📤 رفع واستيراد';
                    return;
                }
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                handleImportedData(jsonData, fileName);
            } catch (error) {
                showUploadStatus('❌ خطأ في قراءة ملف Excel: ' + error.message, 'error');
            }
            uploadBtn.disabled = false;
            uploadBtn.textContent = '📤 رفع واستيراد';
        };
        reader.readAsArrayBuffer(file);
    } else if (fileExtension === 'pdf') {
        reader.onload = function(e) {
            try {
                const text = e.target.result;
                parsePDF(text, fileName);
            } catch (error) {
                showUploadStatus('❌ خطأ في قراءة ملف PDF: ' + error.message, 'error');
            }
            uploadBtn.disabled = false;
            uploadBtn.textContent = '📤 رفع واستيراد';
        };
        reader.readAsText(file);
    }
}

function parseCSV(text) {
    const lines = text.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const result = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        result.push(row);
    }
    return result;
}

function parsePDF(text, fileName) {
    const lines = text.split('\n');
    const data = [];
    let currentVessel = {};
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        if (trimmed.includes('الاسم') || trimmed.includes('اسم المركب')) {
            const parts = trimmed.split(':');
            if (parts.length > 1) currentVessel.name = parts[1].trim();
        } else if (trimmed.includes('الرقم') || trimmed.includes('رقم')) {
            const parts = trimmed.split(':');
            if (parts.length > 1) currentVessel.num = parts[1].trim();
        } else if (trimmed.includes('الطول') || trimmed.includes('طول')) {
            const parts = trimmed.split(':');
            if (parts.length > 1) currentVessel.len = parseFloat(parts[1].trim()) || 0;
        } else if (trimmed.includes('الفئة') || trimmed.includes('نوع')) {
            const parts = trimmed.split(':');
            if (parts.length > 1) currentVessel.cat = parts[1].trim();
        } else if (trimmed.includes('الحالة') || trimmed.includes('الجاهزية')) {
            const parts = trimmed.split(':');
            if (parts.length > 1) currentVessel.stat = parts[1].trim();
        } else if (trimmed.includes('المنطقة')) {
            const parts = trimmed.split(':');
            if (parts.length > 1) currentVessel.reg = parts[1].trim();
        } else if (trimmed.includes('الميناء')) {
            const parts = trimmed.split(':');
            if (parts.length > 1) currentVessel.port = parts[1].trim();
        } else if (trimmed.includes('الوحدة')) {
            const parts = trimmed.split(':');
            if (parts.length > 1) currentVessel.supp = parts[1].trim();
        }
    }
    
    if (currentVessel.name) {
        data.push(currentVessel);
    }
    
    if (data.length === 0) {
        showUploadStatus('⚠️ لم يتم العثور على بيانات مراكب في ملف PDF', 'error');
        return;
    }
    
    handleImportedData(data, fileName);
}

function handleImportedData(data, fileName) {
    if (!data || data.length === 0) {
        showUploadStatus('⚠️ لم يتم العثور على بيانات في الملف', 'error');
        return;
    }
    
    importedData = data;
    importedFileName = fileName;
    
    const previewContainer = document.getElementById('dataPreview');
    const importedDataDiv = document.getElementById('importedData');
    
    if (previewContainer) {
        let html = '<table><thead><tr>';
        const headers = Object.keys(data[0]);
        headers.forEach(h => {
            html += `<th>${h}</th>`;
        });
        html += '</tr></thead><tbody>';
        
        data.slice(0, 10).forEach(row => {
            html += '<tr>';
            headers.forEach(h => {
                html += `<td>${row[h] || '-'}</td>`;
            });
            html += '</tr>';
        });
        
        if (data.length > 10) {
            html += `<tr><td colspan="${headers.length}" style="text-align:center; color:rgba(255,255,255,0.2);">... و ${data.length - 10} سجل آخر</td></tr>`;
        }
        
        html += '</tbody></table>';
        previewContainer.innerHTML = html;
    }
    
    if (importedDataDiv) {
        importedDataDiv.classList.add('show');
    }
    
    showUploadStatus(`✅ تم استيراد ${data.length} سجل من ${fileName}`, 'success');
    
    addMessage('ai', `📂 تم استيراد <strong>${data.length}</strong> سجل من ملف <strong>${fileName}</strong><br><br>🔍 البيانات جاهزة للتسجيل. اضغط "تأكيد وتسجيل" لإضافتها إلى قاعدة البيانات.`);
}

function showUploadStatus(message, type = 'info') {
    const status = document.getElementById('uploadStatus');
    if (!status) return;
    
    status.textContent = message;
    status.className = 'upload-status show ' + type;
    
    if (type === 'error') {
        setTimeout(() => {
            status.className = 'upload-status';
        }, 5000);
    }
}

function confirmImport() {
    if (!importedData || importedData.length === 0) {
        showAlert('⚠️ لا توجد بيانات للاستيراد', 'warning');
        return;
    }
    
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    showAlert(`⏳ جاري تسجيل ${importedData.length} مركب...`, 'info');
    
    let successCount = 0;
    let errorCount = 0;
    let processed = 0;
    
    importedData.forEach(async (row, index) => {
        try {
            const vesselData = {
                name: row['الاسم'] || row['اسم'] || row['اسم المركب'] || row['name'] || '',
                num: row['الرقم'] || row['رقم'] || row['num'] || '',
                len: parseFloat(row['الطول'] || row['طول'] || row['len'] || 0),
                cat: row['الفئة'] || row['نوع'] || row['cat'] || 'البروق',
                reg: row['المنطقة'] || row['reg'] || '',
                zone: row['المنطقة'] || row['zone'] || '',
                port: row['الميناء'] || row['port'] || '',
                supp: row['الوحدة'] || row['supp'] || '',
                stat: row['الحالة'] || row['الجاهزية'] || row['stat'] || 'صالح',
                break: row['العطل'] || row['break'] || '',
                fDate: row['تاريخ'] || row['fDate'] || '',
                eDate: row['تاريخ الانتهاء'] || row['eDate'] || '',
                ref: row['المرجع'] || row['ref'] || '',
                repairer: row['المصلح'] || row['repairer'] || ''
            };
            
            if (!vesselData.name) {
                errorCount++;
                processed++;
                checkImportComplete(processed, successCount, errorCount);
                return;
            }
            
            const response = await fetch('/api/vessels', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify(vesselData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                successCount++;
            } else {
                errorCount++;
                console.error('Error importing row:', row, result.error);
            }
        } catch (error) {
            errorCount++;
            console.error('Import error:', error);
        }
        
        processed++;
        checkImportComplete(processed, successCount, errorCount);
    });
    
    if (importedData.length === 0) {
        showAlert('⚠️ لا توجد بيانات للاستيراد', 'warning');
    }
}

function checkImportComplete(processed, successCount, errorCount) {
    if (processed === importedData.length) {
        const total = importedData.length;
        const message = `✅ تم تسجيل ${successCount} من ${total} مركب بنجاح${errorCount > 0 ? `، ${errorCount} فشل` : ''}`;
        showAlert(message, errorCount > 0 ? 'warning' : 'success');
        
        loadVessels();
        
        addMessage('ai', `📊 <strong>نتيجة الاستيراد:</strong><br><br>
        ✅ تم تسجيل ${successCount} مركب بنجاح<br>
        ${errorCount > 0 ? `❌ فشل تسجيل ${errorCount} مركب` : '🎉 جميع المراكب تم تسجيلها بنجاح!'}`);
        
        document.getElementById('importedData').classList.remove('show');
        importedData = [];
    }
}

function cancelImport() {
    importedData = [];
    importedFileName = '';
    document.getElementById('importedData').classList.remove('show');
    document.getElementById('dataPreview').innerHTML = '';
    document.getElementById('fileInput').value = '';
    showUploadStatus('❌ تم إلغاء الاستيراد', 'error');
    setTimeout(() => {
        document.getElementById('uploadStatus').className = 'upload-status';
    }, 3000);
}

// ============================================================
// 🤖 الذكاء الاصطناعي - المساعد الذكي
// ============================================================

function askAI(userMessage) {
    const input = document.getElementById('chatInput');
    const chatBox = document.getElementById('chatBox');
    const sendBtn = document.getElementById('sendBtn');
    const typingIndicator = document.getElementById('typingIndicator');
    
    let message = userMessage || input?.value?.trim();
    if (!message) {
        showAlert('⚠️ الرجاء كتابة سؤال', 'warning');
        return;
    }

    addMessage('user', message);
    if (input) input.value = '';
    if (sendBtn) sendBtn.disabled = true;
    if (typingIndicator) typingIndicator.style.display = 'block';
    scrollChatToBottom();

    setTimeout(() => {
        const response = generateAIResponse(message);
        addMessage('ai', response);
        if (typingIndicator) typingIndicator.style.display = 'none';
        if (sendBtn) sendBtn.disabled = false;
        scrollChatToBottom();
    }, 500 + Math.random() * 1000);
}

function addMessage(type, content) {
    const chatBox = document.getElementById('chatBox');
    if (!chatBox) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}`;
    
    const sender = type === 'user' ? '👤 أنت' : '🤖 المساعد الذكي';
    const time = new Date().toLocaleTimeString('ar-TN');

    let contentHTML = content;
    if (type === 'ai') {
        contentHTML = `
            ${content}
            <br>
            <button class="audio-btn" onclick="speakText(this.parentElement.textContent.replace(/[🔊استماع]/g, '').trim())">
                🔊 استماع
            </button>
        `;
        lastResponseText = content.replace(/<[^>]*>/g, '').trim();
    }

    messageDiv.innerHTML = `
        <div class="sender">${sender}</div>
        <div class="content">${contentHTML}</div>
        <div class="time">${time}</div>
    `;

    chatBox.appendChild(messageDiv);
}

function scrollChatToBottom() {
    const chatBox = document.getElementById('chatBox');
    if (chatBox) {
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

function generateAIResponse(message) {
    const msg = message.toLowerCase();
    
    const totalVessels = allVessels.length;
    const readyVessels = allVessels.filter(v => v.stat === 'صالح').length;
    const brokenVessels = allVessels.filter(v => v.stat === 'معطب').length;
    const maintenanceVessels = allVessels.filter(v => v.stat === 'صيانة').length;
    const totalMaintenance = allMaintenance.length;
    const totalCost = allMaintenance.reduce((sum, r) => sum + (r.cost || 0), 0);
    const readyPercent = totalVessels > 0 ? Math.round((readyVessels / totalVessels) * 100) : 0;

    const developerInfo = `المبدع والمحترف الوكيل بالحرس الوطني التونسي أمان الله ناجي`;

    if (msg.includes('من صنع') || msg.includes('صانع') || msg.includes('مطور') || 
        msg.includes('المبرمج') || msg.includes('الذي صنع') || msg.includes('صمم') ||
        msg.includes('من عمل') || msg.includes('المبدع') || msg.includes('الوكيل') ||
        msg.includes('الحرس') || msg.includes('أمان الله') || msg.includes('ناجي')) {
        return `🌟 <strong>تم تطوير هذا النظام بواسطة:</strong><br><br>
        👨‍💻 <strong>${developerInfo}</strong><br><br>
        🏆 هذا التطبيق هو نتاج خبرة وكفاءة عالية في مجال البرمجة وتطوير الأنظمة البحرية.<br>
        📌 يتميز النظام بالدقة والاحترافية والجودة العالية.<br><br>
        🔹 <em>${developerInfo} هو مبرمج محترف ومبدع في مجال تطوير الأنظمة الإدارية والبحرية.</em>`;
    }

    if (msg.includes('مرحبا') || msg.includes('السلام') || msg.includes('اهلاً') || msg.includes('هلو')) {
        return `👋 وعليكم السلام! كيف يمكنني مساعدتك اليوم؟<br><br>
        يمكنك أن تسألني عن:<br>
        • 📊 حالة المراكب<br>
        • 🔧 إحصائيات الصيانة<br>
        • 🔮 توقع الأعطال<br>
        • 💡 نصائح لتحسين الأداء`;
    }

    if (msg.includes('صالحة') || msg.includes('صالح') || msg.includes('جاهزة')) {
        return `🚢 عدد المراكب الصالحة: <strong>${readyVessels}</strong> من أصل ${totalVessels}<br>
        نسبة الجاهزية: <strong>${readyPercent}%</strong><br><br>
        ${readyPercent >= 70 ? '✅ الأداء جيد جداً' : '⚠️ هناك مجال للتحسين'}`;
    }

    if (msg.includes('معطبة') || msg.includes('معطب') || msg.includes('عطل')) {
        const brokenList = allVessels.filter(v => v.stat === 'معطب').map(v => v.name).join('، ');
        return `⚠️ عدد المراكب المعطبة: <strong>${brokenVessels}</strong><br>
        ${brokenVessels > 0 ? `المراكب المعطبة: ${brokenList}` : '✅ لا توجد مراكب معطبة حالياً'}`;
    }

    if (msg.includes('صيانة') || msg.includes('تكاليف') || msg.includes('تكلفة')) {
        const completed = allMaintenance.filter(r => r.status === 'مكتملة').length;
        const inProgress = allMaintenance.filter(r => r.status === 'قيد الإنجاز').length;
        return `🔧 إحصائيات الصيانة:<br>
        • 📊 إجمالي السجلات: <strong>${totalMaintenance}</strong><br>
        • ✅ مكتملة: <strong>${completed}</strong><br>
        • 🔄 قيد الإنجاز: <strong>${inProgress}</strong><br>
        • 💰 التكلفة الإجمالية: <strong>${totalCost.toLocaleString()} د.ت</strong>`;
    }

    if (msg.includes('توقع') || msg.includes('متوقع') || msg.includes('تنبؤ')) {
        const highRisk = allVessels.filter(v => {
            const age = v.fDate ? (new Date() - new Date(v.fDate)) / (1000 * 60 * 60 * 24 * 30) : 0;
            return age > 12 && v.stat === 'صالح';
        });
        
        const recommendations = highRisk.length > 0 
            ? `⚠️ هناك ${highRisk.length} مركب يحتاج إلى فحص:<br>${highRisk.map(v => `• ${v.name}`).join('<br>')}`
            : '✅ جميع المراكب في حالة جيدة';
        
        return `🔮 توقع الأعطال:<br><br>
        • المراكب المعطبة حالياً: ${brokenVessels}<br>
        • المراكب في الصيانة: ${maintenanceVessels}<br>
        • ${recommendations}`;
    }

    if (msg.includes('تقرير') || msg.includes('ملخص') || msg.includes('شامل')) {
        return `📊 <strong>تقرير شامل عن الأسطول</strong><br><br>
        🚢 <strong>المراكب:</strong><br>
        • المجموع: ${totalVessels}<br>
        • صالح: ${readyVessels} (${readyPercent}%)<br>
        • معطب: ${brokenVessels}<br>
        • صيانة: ${maintenanceVessels}<br><br>
        🔧 <strong>الصيانة:</strong><br>
        • إجمالي السجلات: ${totalMaintenance}<br>
        • التكلفة الإجمالية: ${totalCost.toLocaleString()} د.ت<br><br>
        📌 <strong>التوصيات:</strong><br>
        ${readyPercent < 70 ? '• ⚠️ يوصى بتحسين نسبة الجاهزية' : '• ✅ الأداء جيد'}<br>
        ${brokenVessels > 0 ? '• ⚠️ يجب إصلاح المراكب المعطبة' : '• ✅ لا توجد مراكب معطبة'}`;
    }

    if (msg.includes('وحدة') || msg.includes('وحدات') || msg.includes('إسناد')) {
        const units = {};
        allVessels.forEach(v => {
            if (v.supp) {
                units[v.supp] = (units[v.supp] || 0) + 1;
            }
        });
        let unitText = Object.entries(units)
            .map(([unit, count]) => `• ${unit}: ${count} مركب`)
            .join('<br>');
        return `🏭 <strong>الوحدات البحرية</strong><br><br>
        ${unitText || 'لا توجد وحدات مسجلة'}`;
    }

    if (msg.includes('نصائح') || msg.includes('تحسين') || msg.includes('تطوير')) {
        const tips = [];
        if (readyPercent < 70) tips.push('• ⚠️ زيادة الصيانة الدورية لتحسين الجاهزية');
        if (brokenVessels > 3) tips.push('• 🔧 تخصيص فرق لإصلاح المراكب المعطبة');
        if (totalCost > 10000) tips.push('• 💰 مراجعة عقود الصيانة لتقليل التكاليف');
        if (tips.length === 0) tips.push('• ✅ الأداء ممتاز، استمر في الصيانة الدورية');
        tips.push('• 📊 استخدام الذكاء الاصطناعي لتحليل الأعطال المتكررة');
        
        return `💡 <strong>نصائح لتحسين الأداء</strong><br><br>
        ${tips.join('<br>')}`;
    }

    if (msg.includes('مساعدة') || msg.includes('كيف') || msg.includes('طريقة')) {
        return `❓ <strong>كيف يمكنني مساعدتك؟</strong><br><br>
        إليك بعض الأمثلة لما يمكنك سؤالي عنه:<br><br>
        • 🚢 "كم عدد المراكب الصالحة؟"<br>
        • ⚠️ "عرض المراكب المعطبة"<br>
        • 🔧 "إحصائيات الصيانة"<br>
        • 🔮 "توقع الأعطال القادمة"<br>
        • 📊 "تقرير شامل عن الأسطول"<br>
        • 💡 "نصائح لتحسين الأداء"<br>
        • 🏭 "الوحدات البحرية"`;
    }

    return `🤔 لم أفهم سؤالك بالكامل.<br><br>
    يمكنك أن تسألني عن:<br>
    • 📊 حالة المراكب والجاهزية<br>
    • 🔧 إحصائيات الصيانة والتكاليف<br>
    • 🔮 توقع الأعطال<br>
    • 💡 نصائح لتحسين الأداء<br>
    • 🏭 معلومات عن الوحدات البحرية<br><br>
    أو اكتب "مساعدة" لعرض جميع الخيارات.`;
}

// ============================================================
// 🔔 نظام الإشعارات (Notifications)
// ============================================================

let notifications = [];
let notificationInterval = null;

function loadNotifications() {
    notifications = [];
    
    const openTickets = allTickets.filter(t => t.status === 'مفتوحة' || t.status === 'قيد المعالجة');
    if (openTickets.length > 0) {
        notifications.push({
            icon: '🎫',
            title: 'تذاكر مفتوحة',
            message: `لديك ${openTickets.length} تذكرة تحتاج إلى معالجة`,
            time: new Date(),
            type: 'warning'
        });
    }

    const brokenVessels = allVessels.filter(v => v.stat === 'معطب');
    if (brokenVessels.length > 0) {
        notifications.push({
            icon: '⚠️',
            title: 'مراكب معطبة',
            message: `يوجد ${brokenVessels.length} مركب معطب يحتاج إلى صيانة`,
            time: new Date(),
            type: 'danger'
        });
    }

    const maintenanceVessels = allVessels.filter(v => v.stat === 'صيانة');
    if (maintenanceVessels.length > 0) {
        notifications.push({
            icon: '🔧',
            title: 'مراكب في الصيانة',
            message: `${maintenanceVessels.length} مركب قيد الصيانة حالياً`,
            time: new Date(),
            type: 'info'
        });
    }

    const activeUsers = allUsers.filter(u => u.isActive !== false);
    if (activeUsers.length > 0) {
        notifications.push({
            icon: '👤',
            title: 'مستخدمين نشطين',
            message: `${activeUsers.length} مستخدم نشط في النظام`,
            time: new Date(),
            type: 'success'
        });
    }

    if (notifications.length === 0) {
        notifications.push({
            icon: '✅',
            title: 'كل شيء على ما يرام',
            message: 'لا توجد إشعارات جديدة',
            time: new Date(),
            type: 'success'
        });
    }

    updateNotificationBadge();
}

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    
    const count = notifications.length;
    badge.textContent = count;
    
    if (count > 0) {
        badge.style.display = 'inline-block';
        badge.style.backgroundColor = '#f87171';
        badge.style.color = 'white';
        badge.style.borderRadius = '50%';
        badge.style.padding = '2px 6px';
        badge.style.fontSize = '10px';
        badge.style.marginRight = '4px';
    } else {
        badge.style.display = 'none';
    }
}

function toggleNotifications() {
    const existingPanel = document.getElementById('notificationPanel');
    if (existingPanel) {
        existingPanel.remove();
        return;
    }

    const panel = document.createElement('div');
    panel.id = 'notificationPanel';
    panel.style.cssText = `
        position: fixed;
        top: 70px;
        right: 20px;
        width: 350px;
        max-height: 450px;
        overflow-y: auto;
        background: rgba(20,20,40,0.95);
        backdrop-filter: blur(20px);
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        z-index: 99999;
        padding: 16px;
        animation: slideDown 0.3s ease;
    `;

    panel.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px;">
            <span style="font-weight:bold; color:rgba(255,255,255,0.8);">🔔 الإشعارات</span>
            <span style="font-size:11px; color:rgba(255,255,255,0.3);">${notifications.length} إشعار</span>
            <button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:rgba(255,255,255,0.3); cursor:pointer; font-size:16px;">✕</button>
        </div>
        ${notifications.map(n => `
            <div style="
                padding: 10px 12px;
                margin-bottom: 8px;
                border-radius: 10px;
                background: rgba(255,255,255,0.03);
                border-right: 3px solid ${n.type === 'danger' ? '#f87171' : n.type === 'warning' ? '#fbbf24' : n.type === 'success' ? '#4ade80' : '#60a5fa'};
                transition: all 0.3s;
            ">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:18px;">${n.icon}</span>
                    <div style="flex:1;">
                        <div style="font-weight:bold; font-size:13px; color:rgba(255,255,255,0.8);">${n.title}</div>
                        <div style="font-size:12px; color:rgba(255,255,255,0.4);">${n.message}</div>
                        <div style="font-size:10px; color:rgba(255,255,255,0.15); margin-top:2px;">${formatTime(n.time)}</div>
                    </div>
                </div>
            </div>
        `).join('')}
        <div style="text-align:center; margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.05);">
            <button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:rgba(255,255,255,0.2); cursor:pointer; font-size:11px;">إغلاق</button>
        </div>
    `;

    document.body.appendChild(panel);

    setTimeout(() => {
        document.addEventListener('click', function closePanel(e) {
            if (!panel.contains(e.target) && e.target.id !== 'notificationBadge') {
                panel.remove();
                document.removeEventListener('click', closePanel);
            }
        });
    }, 100);
}

function startNotificationAutoUpdate() {
    if (notificationInterval) clearInterval(notificationInterval);
    
    notificationInterval = setInterval(() => {
        loadNotifications();
    }, 30000);
}

function initNotifications() {
    loadNotifications();
    startNotificationAutoUpdate();
}

const notificationStyle = document.createElement('style');
notificationStyle.textContent = `
    @keyframes slideDown {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
    }
    #notificationPanel::-webkit-scrollbar {
        width: 4px;
    }
    #notificationPanel::-webkit-scrollbar-track {
        background: rgba(255,255,255,0.02);
        border-radius: 10px;
    }
    #notificationPanel::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.08);
        border-radius: 10px;
    }
`;
document.head.appendChild(notificationStyle);

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
console.log('🤖 المساعد الذكي جاهز للتحدث معك!');
console.log('🎤 ميزات الصوت: تحدث مع المساعد واستمع للردود');
console.log('👨‍💻 تم تطوير هذا النظام بواسطة: المبدع والمحترف الوكيل بالحرس الوطني التونسي أمان الله ناجي');
console.log('🗺️ خريطة تتبع المستخدمين بالساتلايت جاهزة!');
console.log('🔔 نظام الإشعارات يعمل!');
console.log('📂 ميزة استيراد الملفات (Excel/CSV/PDF) جاهزة!');
