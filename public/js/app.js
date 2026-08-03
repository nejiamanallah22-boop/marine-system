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
        case 'users': loadUsers(); break;
        case 'notes': loadNotes(); break;
        case 'sessions': 
            loadSessions(); 
            startTrackingAutoUpdate(); 
            setTimeout(initUserMap, 500); 
            break;
        case 'ai-assistant': initAIAssistant(); break;
        default: console.log('⚠️ Unknown page:', pageName);
    }
}

function initAIAssistant() {
    console.log('🤖 AI Assistant initialized with voice support');
    loadVoices();
    
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        recognition = initSpeechRecognition();
        console.log('🎤 Speech recognition ready');
    } else {
        console.warn('⚠️ Speech recognition not supported');
    }
}

function showPage(pageName) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const btns = document.querySelectorAll('.nav-btn');
    const pageMap = {
        'dashboard': 0, 'fleet': 1, 'maintenance': 2, 'efficiency': 3,
        'support': 4, 'users': 5, 'notes': 6, 'sessions': 7, 'ai-assistant': 8
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
    
    // ===== الاتصال بالخادم الحقيقي =====
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
            showAlert('✅ مرحباً ' + data.user.name + '!', 'success');
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
    if (token) {
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
// تحميل البيانات من الخادم
// ============================================================

function loadAllData() {
    loadVessels();
    loadMaintenance();
    loadTickets();
    loadNotes();
    loadUsers();
}

// ===== تحميل المراكب =====
function loadVessels() {
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
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
        console.log('✅ Vessels loaded from DB:', allVessels.length);
        renderAllTables();
    })
    .catch(err => {
        console.error('Load vessels error:', err);
        showAlert('❌ خطأ في تحميل المراكب', 'danger');
        allVessels = getDemoVessels();
        renderAllTables();
    });
}

// ===== تحميل سجلات الصيانة =====
function loadMaintenance() {
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
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
        console.log('✅ Maintenance loaded from DB:', allMaintenance.length);
        renderMaintenanceTables();
        updateYearFilter();
    })
    .catch(err => {
        console.error('Load maintenance error:', err);
        showAlert('❌ خطأ في تحميل سجلات الصيانة', 'danger');
        allMaintenance = getDemoMaintenance();
        renderMaintenanceTables();
        updateYearFilter();
    });
}

// ===== تحميل التذاكر =====
function loadTickets() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/tickets', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => {
        if (!res.ok) throw new Error('فشل تحميل التذاكر');
        return res.json();
    })
    .then(data => {
        allTickets = data || [];
        console.log('✅ Tickets loaded from DB:', allTickets.length);
        renderTickets();
    })
    .catch(err => {
        console.error('Load tickets error:', err);
        showAlert('❌ خطأ في تحميل التذاكر', 'danger');
    });
}

// ===== تحميل المستخدمين =====
function loadUsers() {
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    fetch('/api/users', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => {
        if (!res.ok) throw new Error('فشل تحميل المستخدمين');
        return res.json();
    })
    .then(data => {
        allUsers = data || [];
        console.log('✅ Users loaded from DB:', allUsers.length);
        renderUsersTable();
    })
    .catch(err => {
        console.error('Load users error:', err);
        showAlert('❌ خطأ في تحميل المستخدمين', 'danger');
        allUsers = getDemoUsers();
        renderUsersTable();
    });
}

// ===== تحميل المذكرات =====
function loadNotes() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/notes', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => {
        if (!res.ok) throw new Error('فشل تحميل المذكرات');
        return res.json();
    })
    .then(data => {
        allNotes = data || [];
        console.log('✅ Notes loaded from DB:', allNotes.length);
        renderNotes();
    })
    .catch(err => {
        console.error('Load notes error:', err);
        showAlert('❌ خطأ في تحميل المذكرات', 'danger');
    });
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
// بيانات تجريبية (للاحتياط)
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

function getDemoUsers() {
    return [
        { id: '1', name: 'مدير النظام', email: 'admin@example.com', role: 'مسؤول', isActive: true, createdAt: '2026-01-01' },
        { id: '2', name: 'مدير العمليات', email: 'manager@example.com', role: 'مشرف', isActive: true, createdAt: '2026-01-01' }
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
                <button class="btn-sm btn-warning" onclick="editVessel('${v._id || v.id}')">✏️</button>
                <button class="btn-sm btn-danger" onclick="deleteVessel('${v._id || v.id}')">🗑️</button>
            </td>
        </tr>
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
                <button class="btn-sm btn-warning" onclick="editUser('${u._id || u.id}')">✏️</button>
                <button class="btn-sm btn-danger" onclick="deleteUser('${u._id || u.id}')">🗑️</button>
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
    
    if (!name || !email || !password || password.length < 4) {
        showAlert('⚠️ الرجاء ملء جميع الحقول بشكل صحيح', 'warning');
        return;
    }
    
    const addBtn = document.querySelector('[onclick="addUser()"]');
    if (addBtn) {
        addBtn.disabled = true;
        addBtn.textContent = '⏳ جاري الإضافة...';
    }
    
    fetch('/api/users', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ name, email, password, role: role || 'مشاهد' })
    })
    .then(res => res.json())
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
    
    fetch('/api/users', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(users => {
        const user = users.find(u => (u._id || u.id) === id);
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
    
    if (!name || !email) {
        showAlert('⚠️ الرجاء إدخال الاسم والبريد الإلكتروني', 'warning');
        return;
    }
    
    const data = { name, email, role };
    if (password && password.length >= 4) {
        data.password = password;
    }
    
    const updateBtn = document.querySelector('[onclick*="updateUser"]');
    if (updateBtn) {
        updateBtn.disabled = true;
        updateBtn.textContent = '⏳ جاري التحديث...';
    }
    
    fetch('/api/users/' + id, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
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
    
    const name = document.getElementById('iName')?.value?.trim();
    if (!name) {
        showAlert('⚠️ الرجاء إدخال اسم المركب', 'warning');
        document.getElementById('iName')?.focus();
        return;
    }
    
    const data = {
        name: name,
        num: document.getElementById('iNum')?.value?.trim() || '',
        len: parseFloat(document.getElementById('iLen')?.value) || 0,
        cat: document.getElementById('iCat')?.value || 'البروق',
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
    
    const addBtn = document.querySelector('[onclick="addItem()"]');
    if (addBtn) {
        addBtn.disabled = true;
        addBtn.textContent = '⏳ جاري الحفظ...';
    }
    
    showAlert('⏳ جاري حفظ المركب...', 'info');
    
    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(data)
    })
    .then(async res => {
        const responseData = await res.json();
        if (!res.ok) {
            throw new Error(responseData.error || 'فشل حفظ المركب');
        }
        return responseData;
    })
    .then(data => {
        if (data.success) {
            showAlert(editingVesselId ? '✅ تم تحديث المركب بنجاح' : '✅ تم إضافة المركب بنجاح', 'success');
            editingVesselId = null;
            clearVesselInputs();
            loadVessels();
            
            const btn = document.querySelector('[onclick="addItem()"]');
            if (btn) {
                btn.disabled = false;
                btn.textContent = '💾 إضافة مركب';
            }
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في حفظ المركب'), 'danger');
        }
    })
    .catch(err => {
        console.error('Error saving vessel:', err);
        showAlert('❌ ' + err.message, 'danger');
    })
    .finally(() => {
        const btn = document.querySelector('[onclick="addItem()"]');
        if (btn) {
            btn.disabled = false;
            btn.textContent = editingVesselId ? '💾 تحديث مركب' : '💾 إضافة مركب';
        }
    });
}

function editVessel(id) {
    const vessel = allVessels.find(v => (v._id || v.id) === id);
    if (!vessel) {
        showAlert('⚠️ المركب غير موجود', 'warning');
        return;
    }
    
    editingVesselId = id;
    
    document.getElementById('iName').value = vessel.name || '';
    document.getElementById('iNum').value = vessel.num || '';
    document.getElementById('iLen').value = vessel.len || 0;
    document.getElementById('iCat').value = vessel.cat || 'البروق';
    document.getElementById('iReg').value = vessel.reg || '';
    
    updateZones();
    document.getElementById('iZone').value = vessel.zone || '';
    
    document.getElementById('iPort').value = vessel.port || '';
    document.getElementById('iSupp').value = vessel.supp || '';
    document.getElementById('iStat').value = vessel.stat || 'صالح';
    document.getElementById('iBreak').value = vessel.break || '';
    document.getElementById('iDate').value = vessel.fDate || '';
    document.getElementById('iEnd').value = vessel.eDate || '';
    document.getElementById('iRef').value = vessel.ref || '';
    document.getElementById('iRepairer').value = vessel.repairer || '';
    
    const btn = document.querySelector('[onclick="addItem()"]');
    if (btn) {
        btn.textContent = '💾 تحديث مركب';
    }
    
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
    if (!confirm('⚠️ هل أنت متأكد من حذف هذا المركب؟')) return;
    
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    showAlert('⏳ جاري الحذف...', 'info');
    
    fetch('/api/vessels/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(async res => {
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'فشل حذف المركب');
        }
        return data;
    })
    .then(data => {
        if (data.success) {
            showAlert('✅ تم حذف المركب بنجاح', 'success');
            loadVessels();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في الحذف'), 'danger');
        }
    })
    .catch(err => {
        console.error('Delete error:', err);
        showAlert('❌ ' + err.message, 'danger');
    });
}

function clearVesselInputs() {
    document.getElementById('iName').value = '';
    document.getElementById('iNum').value = '';
    document.getElementById('iLen').value = '';
    document.getElementById('iCat').value = 'البروق';
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
    
    const btn = document.querySelector('[onclick="addItem()"]');
    if (btn) {
        btn.textContent = '💾 إضافة مركب';
        btn.disabled = false;
    }
    
    editingVesselId = null;
}

function updateZones() {
    const reg = document.getElementById('iReg')?.value;
    const zoneSelect = document.getElementById('iZone');
    if (!zoneSelect) return;
    
    const zones = {
        'الشمال': ['بنزرت', 'طبرقة', 'المرسى', 'غار الملح'],
        'الساحل': ['سوسة', 'المنستير', 'المهدية', 'حمام سوسة', 'نابل', 'قليبية'],
        'الوسط': ['صفاقس', 'قابس', 'جربة', 'القطار'],
        'الجنوب': ['جرجيس', 'بن قردان', 'ذراع الساحل']
    };
    
    const options = zones[reg] || ['المنطقة غير محددة'];
    zoneSelect.innerHTML = '<option value="">📍 اختر المنطقة</option>';
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
        select.innerHTML += `<option value="${v._id || v.id}">${v.name} (${v.num || 'بدون رقم'})</option>`;
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
    
    if (!vesselId || !description || !technician) {
        showAlert('⚠️ الرجاء ملء جميع الحقول المطلوبة', 'warning');
        return;
    }
    
    const vessel = allVessels.find(v => (v._id || v.id) == vesselId);
    const data = {
        vesselId: vesselId,
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
        const vid = v._id || v.id;
        html += `<tr>
            <td><strong>${v.name}</strong></td>
            <td>${v.cat || '-'}</td>
            <td><span class="status-badge status-broken">${v.stat}</span></td>
            <td>${v.break || '-'}</td>
            <td>${v.repairer || '-'}</td>
            <td>
                <button class="btn-sm btn-primary" onclick="openMaintenanceFile('${vid}')">📂 فتح</button>
                <button class="btn-sm btn-success" onclick="fixVessel('${vid}')">✅ إصلاح</button>
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
    const vessel = allVessels.find(v => (v._id || v.id) === vesselId);
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
        const vesselName = r.vesselName || allVessels.find(v => (v._id || v.id) === r.vesselId)?.name || '-';
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
    
    const regions = {
        'الشمال': ['بنزرت', 'طبرقة', 'المرسى', 'غار الملح'],
        'الساحل': ['سوسة', 'المنستير', 'المهدية', 'حمام سوسة', 'نابل', 'قليبية'],
        'الوسط': ['صفاقس', 'قابس', 'جربة', 'القطار'],
        'الجنوب': ['جرجيس', 'بن قردان', 'ذراع الساحل']
    };
    
    Object.keys(regions).forEach(region => {
        const regionVessels = vessels.filter(v => 
            regions[region].some(city => v.zone?.includes(city))
        );
        if (regionVessels.length > 0) {
            html += renderRegionEfficiencyTable(regionVessels, region);
        }
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

let userMap = null;
let userMarkers = [];
let mapInitialized = false;

function initUserMap() {
    const mapContainer = document.getElementById('userMap');
    if (!mapContainer) return;

    if (userMap) {
        userMap.invalidateSize();
        return;
    }

    const tunisiaCenter = [33.8869, 9.5375];

    userMap = L.map('userMap', {
        center: tunisiaCenter,
        zoom: 7,
        zoomControl: true,
        fadeAnimation: true,
        attributionControl: true
    });

    // طبقة الساتلايت من Esri
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a> | Satellite',
        maxZoom: 19,
        minZoom: 3
    }).addTo(userMap);

    // طبقة الشوارع
    const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
    });

    // طبقة الساتلايت من Google
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
    loadUserLocations();

    setTimeout(() => {
        if (userMap) userMap.invalidateSize();
    }, 500);
}

function loadUserLocations() {
    if (!userMap) return;

    userMarkers.forEach(marker => userMap.removeLayer(marker));
    userMarkers = [];

    // مواقع المستخدمين (سيتم استبدالها ببيانات حقيقية من الخادم لاحقاً)
    const userLocations = [
        { name: 'مدير النظام', role: 'مسؤول', status: 'online', lat: 36.8065, lng: 10.1815, city: 'تونس', device: 'Chrome/Windows' },
        { name: 'مدير العمليات', role: 'مشرف', status: 'online', lat: 35.8277, lng: 10.6420, city: 'سوسة', device: 'Firefox/Mac' },
        { name: 'محرر', role: 'محرر', status: 'idle', lat: 34.7396, lng: 10.7600, city: 'صفاقس', device: 'Safari/iPhone' },
        { name: 'مشاهد', role: 'مشاهد', status: 'offline', lat: 33.8869, lng: 9.5375, city: 'القيروان', device: 'Edge/Windows' },
        { name: 'فني صيانة', role: 'محرر', status: 'online', lat: 37.2744, lng: 9.8739, city: 'بنزرت', device: 'Chrome/Android' }
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
        const icon = L.divIcon({
            className: 'custom-div-icon',
            html: `
                <div style="
                    background: rgba(0,0,0,0.8);
                    border-radius: 12px;
                    padding: 4px 10px 4px 6px;
                    border: 2px solid ${statusColors[user.status]};
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                    font-size: 11px;
                    color: white;
                    white-space: nowrap;
                    font-family: 'Cairo', sans-serif;
                ">
                    <span style="
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        background: ${statusColors[user.status]};
                        display: inline-block;
                        animation: ${user.status === 'online' ? 'pulse 1.5s infinite' : 'none'};
                    "></span>
                    ${user.name}
                    <span style="font-size:9px; opacity:0.5;">${user.role}</span>
                </div>
            `,
            iconSize: [120, 30],
            iconAnchor: [60, 15],
            className: 'user-marker-icon'
        });

        const marker = L.marker([user.lat, user.lng], { icon: icon })
            .addTo(userMap)
            .bindPopup(`
                <div class="popup-content">
                    <div class="name">👤 ${user.name}</div>
                    <div class="detail">📌 ${user.role}</div>
                    <div class="detail">📍 ${user.city}</div>
                    <div class="detail">💻 ${user.device}</div>
                    <div class="detail">🕐 آخر نشاط: ${getTimeAgo(new Date())}</div>
                    <span class="status-badge ${user.status}">${statusLabels[user.status]}</span>
                    <div style="margin-top:4px; font-size:10px; color:#999;">
                        🛰️ ${user.lat}, ${user.lng}
                    </div>
                </div>
            `, { maxWidth: 250 });

        userMarkers.push(marker);
    });

    if (userMarkers.length > 0) {
        const group = L.featureGroup(userMarkers);
        userMap.fitBounds(group.getBounds().pad(0.2));
    }

    // إضافة تأثير النبض
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.5); }
        }
        .user-marker-icon {
            background: transparent !important;
            border: none !important;
        }
        .leaflet-popup-content-wrapper {
            border-radius: 12px !important;
            background: white !important;
            color: #1a1a2e !important;
        }
        .leaflet-popup-tip {
            background: white !important;
        }
        .leaflet-control-layers {
            background: rgba(0,0,0,0.8) !important;
            border-radius: 8px !important;
            border: 1px solid rgba(255,255,255,0.1) !important;
        }
        .leaflet-control-layers label {
            color: rgba(255,255,255,0.8) !important;
        }
    `;
    document.head.appendChild(style);
}

function refreshUserMap() {
    if (userMap) {
        loadUserLocations();
        showAlert('🔄 تم تحديث خريطة المواقع', 'success');
    } else {
        initUserMap();
    }
}

window.addEventListener('resize', function() {
    if (userMap) {
        setTimeout(() => userMap.invalidateSize(), 200);
    }
});

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

function startTrackingAutoUpdate() {
    if (trackingInterval) clearInterval(trackingInterval);
    trackingInterval = setInterval(() => {
        if (document.getElementById('page-sessions')) {
            renderSessions();
        }
    }, 30000);
}

// ============================================================
// 🎤 ميزات الصوت (Speech-to-Text & Text-to-Speech)
// ============================================================

let recognition = null;
let isListening = false;
let lastResponseText = '';

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
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;

        const voices = window.speechSynthesis.getVoices();
        const arabicVoice = voices.find(v => v.lang.startsWith('ar'));
        if (arabicVoice) {
            utterance.voice = arabicVoice;
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

function loadVoices() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = function() {
            window.speechSynthesis.getVoices();
        };
    }
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
        return `👋 وعليكم السلام ورحمة الله وبركاته!<br><br>
        أنا المساعد الذكي لمنظومة الوسائل البحرية.<br><br>
        تم تطوير هذا النظام بواسطة:<br>
        🌟 <strong>${developerInfo}</strong><br><br>
        كيف يمكنني مساعدتك اليوم؟<br>
        يمكنك أن تسألني عن:<br>
        • 📊 حالة المراكب والجاهزية<br>
        • 🔧 إحصائيات الصيانة والتكاليف<br>
        • 🔮 توقع الأعطال<br>
        • 💡 نصائح لتحسين الأداء<br>
        • 🏭 الوحدات البحرية<br>
        • 👨‍💻 من صنع هذا التطبيق`;
    }

    if (msg.includes('صالحة') || msg.includes('صالح') || msg.includes('جاهزة')) {
        return `🚢 عدد المراكب الصالحة: <strong>${readyVessels}</strong> من أصل ${totalVessels}<br>
        نسبة الجاهزية: <strong>${readyPercent}%</strong><br><br>
        ${readyPercent >= 70 ? '✅ الأداء جيد جداً' : '⚠️ هناك مجال للتحسين'}<br><br>
        📌 هذا النظام من تطوير <strong>${developerInfo}</strong>`;
    }

    if (msg.includes('معطبة') || msg.includes('معطب') || msg.includes('عطل')) {
        const brokenList = allVessels.filter(v => v.stat === 'معطب').map(v => v.name).join('، ');
        return `⚠️ عدد المراكب المعطبة: <strong>${brokenVessels}</strong><br>
        ${brokenVessels > 0 ? `المراكب المعطبة: ${brokenList}` : '✅ لا توجد مراكب معطبة حالياً'}<br><br>
        🔹 نظام متابعة الأسطول من تطوير <strong>${developerInfo}</strong>`;
    }

    if (msg.includes('صيانة') || msg.includes('تكاليف') || msg.includes('تكلفة')) {
        const completed = allMaintenance.filter(r => r.status === 'مكتملة').length;
        const inProgress = allMaintenance.filter(r => r.status === 'قيد الإنجاز').length;
        return `🔧 إحصائيات الصيانة:<br>
        • 📊 إجمالي السجلات: <strong>${totalMaintenance}</strong><br>
        • ✅ مكتملة: <strong>${completed}</strong><br>
        • 🔄 قيد الإنجاز: <strong>${inProgress}</strong><br>
        • 💰 التكلفة الإجمالية: <strong>${totalCost.toLocaleString()} د.ت</strong><br><br>
        🔹 هذا النظام من تطوير <strong>${developerInfo}</strong>`;
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
        • ${recommendations}<br><br>
        📌 نظام متابعة وتوقع الأعطال من تطوير <strong>${developerInfo}</strong>`;
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
        ${brokenVessels > 0 ? '• ⚠️ يجب إصلاح المراكب المعطبة' : '• ✅ لا توجد مراكب معطبة'}<br><br>
        🔹 هذا التقرير من تطوير <strong>${developerInfo}</strong>`;
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
        ${unitText || 'لا توجد وحدات مسجلة'}<br><br>
        🔹 نظام متابعة الوحدات من تطوير <strong>${developerInfo}</strong>`;
    }

    if (msg.includes('نصائح') || msg.includes('تحسين') || msg.includes('تطوير')) {
        const tips = [];
        if (readyPercent < 70) tips.push('• ⚠️ زيادة الصيانة الدورية لتحسين الجاهزية');
        if (brokenVessels > 3) tips.push('• 🔧 تخصيص فرق لإصلاح المراكب المعطبة');
        if (totalCost > 10000) tips.push('• 💰 مراجعة عقود الصيانة لتقليل التكاليف');
        if (tips.length === 0) tips.push('• ✅ الأداء ممتاز، استمر في الصيانة الدورية');
        tips.push('• 📊 استخدام الذكاء الاصطناعي لتحليل الأعطال المتكررة');
        tips.push(`• 👨‍💻 الاستعانة بخبرات ${developerInfo} لتطوير النظام`);
        
        return `💡 <strong>نصائح لتحسين الأداء</strong><br><br>
        ${tips.join('<br>')}<br><br>
        🔹 تم إعداد هذه النصائح بواسطة <strong>${developerInfo}</strong>`;
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
        • 🏭 "الوحدات البحرية"<br>
        • 👨‍💻 "من صنع هذا التطبيق"<br><br>
        🔹 هذا النظام من تطوير <strong>${developerInfo}</strong>`;
    }

    return `🤔 لم أفهم سؤالك بالكامل.<br><br>
    يمكنك أن تسألني عن:<br>
    • 📊 حالة المراكب والجاهزية<br>
    • 🔧 إحصائيات الصيانة والتكاليف<br>
    • 🔮 توقع الأعطال<br>
    • 💡 نصائح لتحسين الأداء<br>
    • 🏭 معلومات عن الوحدات البحرية<br>
    • 👨‍💻 من صنع هذا التطبيق<br><br>
    أو اكتب "مساعدة" لعرض جميع الخيارات.<br><br>
    🔹 هذا النظام من تطوير <strong>${developerInfo}</strong>`;
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
console.log('📝 استخدم admin@example.com / 123456 للدخول');
console.log('🤖 المساعد الذكي جاهز للتحدث معك!');
console.log('🎤 ميزات الصوت: تحدث مع المساعد واستمع للردود');
console.log('👨‍💻 تم تطوير هذا النظام بواسطة: المبدع والمحترف الوكيل بالحرس الوطني التونسي أمان الله ناجي');
console.log('🗺️ خريطة تتبع المستخدمين بالساتلايت جاهزة!');
