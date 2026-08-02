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

// متغيرات الرسوم البيانية
let chartCategory = null;
let chartDoughnut = null;

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
                <div style="text-align:center; padding:50px; color:#dc3545;">
                    ❌ خطأ في تحميل الصفحة: ${pageName}
                    <br><small>${err.message}</small>
                </div>
            `;
        });
}

function initPage(pageName) {
    switch(pageName) {
        case 'fleet': loadVessels(); break;
        case 'maintenance': loadMaintenance(); break;
        case 'efficiency': loadVessels(); break;
        case 'support': loadTickets(); break;
        case 'tracking': setTimeout(initMap, 100); break;
        case 'map': setTimeout(initMap, 100); break;
        case 'users': loadUsers(); break;
        case 'notes': loadNotes(); break;
    }
}

function showPage(pageName) {
    loadPage(pageName);
}

function refreshAllPages() {
    const currentPage = document.querySelector('.page-content');
    if (currentPage) {
        const pageName = currentPage.id.replace('page-', '');
        loadPage(pageName);
    } else {
        loadPage('fleet');
    }
    showAlert('✅ تم تحديث الصفحة', 'success');
}

// ============================================================
// دوال مساعدة
// ============================================================

function showAlert(message, type = 'info') {
    const colors = {
        success: '#28a745',
        danger: '#dc3545',
        warning: '#ffc107',
        info: '#0d6efd'
    };
    const alertDiv = document.createElement('div');
    alertDiv.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 99999;
        padding: 15px 25px; border-radius: 8px; color: white;
        background: ${colors[type] || colors.info};
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        font-family: 'Cairo', sans-serif;
        max-width: 400px;
        animation: slideIn 0.3s ease;
        z-index: 999999;
    `;
    alertDiv.textContent = message;
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

function toggleNotifications() {
    showAlert('🔔 لا توجد إشعارات جديدة', 'info');
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
            user: {
                id: 1,
                name: 'مدير النظام',
                role: 'مسؤول',
                email: 'admin@example.com'
            }
        },
        'user': {
            password: '123456',
            user: {
                id: 2,
                name: 'مستخدم عادي',
                role: 'مشاهد',
                email: 'user@example.com'
            }
        },
        'manager': {
            password: '123456',
            user: {
                id: 3,
                name: 'مدير العمليات',
                role: 'مشرف',
                email: 'manager@example.com'
            }
        }
    };
    
    if (demoUsers[username] && demoUsers[username].password === password) {
        console.log('✅ دخول تجريبي ناجح للمستخدم:', username);
        const userData = demoUsers[username].user;
        localStorage.setItem('token', 'demo-token-' + Date.now());
        localStorage.setItem('user', JSON.stringify(userData));
        currentUser = userData;
        
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        
        updateUserDisplay();
        loadAllData();
        loadPage('fleet');
        showAlert('✅ مرحباً ' + userData.name + '! تم تسجيل الدخول بنجاح', 'success');
        
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = '🚀 دخول';
        }
        return;
    }
    
    // ===== الاتصال بالخادم =====
    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
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
            
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            
            updateUserDisplay();
            loadAllData();
            loadPage('fleet');
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
    if (confirm('⚠️ هل أنت متأكد من تسجيل الخروج؟')) {
        localStorage.clear();
        location.reload();
    }
}

function updateUserDisplay() {
    const display = document.getElementById('userRoleDisplay');
    if (display && currentUser) {
        const roleEmojis = {
            'مسؤول': '👑',
            'مشرف': '⭐',
            'محرر': '✏️',
            'مشاهد': '👀'
        };
        display.innerHTML = `
            <i class="fas fa-user-circle"></i> 
            ${currentUser.name} 
            <span style="font-size:12px; background:#e9ecef; padding:2px 10px; border-radius:10px;">
                ${roleEmojis[currentUser.role] || '👤'} ${currentUser.role}
            </span>
            <button onclick="doLogout()" style="margin-left:10px; padding:2px 10px; border:none; border-radius:5px; background:#dc3545; color:white; cursor:pointer; font-size:12px;">
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
    if (!token) {
        allVessels = getDemoVessels();
        renderAllTables();
        return;
    }
    fetch('/api/vessels', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
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
    if (!token) {
        allMaintenance = getDemoMaintenance();
        renderMaintenanceTables();
        updateYearFilter();
        return;
    }
    fetch('/api/maintenance', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
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
    if (!token) return;
    fetch('/api/users', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allUsers = data || [];
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

function renderAllTables() {
    renderMainTable();
    renderMaintenanceTables();
    updateMaintenanceVessels();
    renderEfficiency();
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
            status: 'مغلقة',
            date: '2026-01-20',
            startDate: '2026-01-15',
            endDate: '2026-01-20',
            parts: [
                { name: 'طلمبة زيت', quantity: 1, price: 1200 },
                { name: 'مضخة ماء', quantity: 1, price: 800 },
                { name: 'فلتر زيت', quantity: 2, price: 150 }
            ],
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
            status: 'مغلقة',
            date: '2026-05-15',
            startDate: '2026-05-14',
            endDate: '2026-05-15',
            parts: [
                { name: 'زيت محرك', quantity: 5, price: 100 },
                { name: 'فلتر هواء', quantity: 1, price: 300 }
            ],
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
            status: 'مغلقة',
            date: '2026-01-10',
            startDate: '2026-01-05',
            endDate: '2026-01-10',
            parts: [
                { name: 'ألواح فولاذ', quantity: 10, price: 350 },
                { name: 'دهان مضاد للصدأ', quantity: 5, price: 200 }
            ],
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
            status: 'مغلقة',
            date: '2026-02-05',
            startDate: '2026-02-03',
            endDate: '2026-02-05',
            parts: [
                { name: 'بطارية', quantity: 2, price: 450 },
                { name: 'كابلات', quantity: 3, price: 100 }
            ],
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
            parts: [
                { name: 'طرمبة توجيه', quantity: 1, price: 1500 },
                { name: 'زيت هيدروليك', quantity: 3, price: 100 }
            ],
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
            status: 'مغلقة',
            date: '2026-07-15',
            startDate: '2026-07-10',
            endDate: '2026-07-15',
            parts: [
                { name: 'راديتر', quantity: 1, price: 2000 },
                { name: 'مراوح تبريد', quantity: 2, price: 400 },
                { name: 'ماء مقطر', quantity: 10, price: 40 }
            ],
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
        tbody.innerHTML = `<tr><td colspan="15" style="text-align:center; padding:30px;">🚫 لا توجد بيانات</td></tr>`;
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
            <td style="color:${v.stat === 'صالح' ? '#28a745' : v.stat === 'معطب' ? '#dc3545' : '#ffc107'}">${v.stat || 'صالح'}</td>
            <td>${v.break || '-'}</td>
            <td>${v.fDate || '-'}</td>
            <td>${v.eDate || '-'}</td>
            <td>${v.ref || '-'}</td>
            <td>${v.repairer || '-'}</td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="editVessel(${v.id})">✏️</button>
                <button class="btn btn-sm btn-danger" onclick="deleteVessel(${v.id})">🗑️</button>
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
        <div style="background:#f8f9fa; padding:15px; margin:10px 0; border-radius:8px; border-right:4px solid ${t.status === 'مغلقة' ? '#28a745' : '#ffc107'}">
            <h4>${t.subject}</h4>
            <p>${t.message}</p>
            <small>${t.date || ''} ${t.time || ''} | ${t.userName || 'مجهول'}</small>
            <span style="background:#ffc107; padding:2px 10px; border-radius:10px; font-size:12px; margin-right:10px;">${t.status || 'قيد المعالجة'}</span>
        </div>
    `).join('');
}

function renderUsersTable() {
    const tbody = document.getElementById('usersBody');
    if (!tbody) return;
    if (!allUsers || allUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px;">🚫 لا توجد مستخدمين</td></tr>`;
        return;
    }
    tbody.innerHTML = allUsers.map(u => `
        <tr>
            <td>${u.name || '-'}</td>
            <td>${u.role || 'مشاهد'}</td>
            <td>${u.isActive ? '✅ نشط' : '❌ معطل'}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})">🗑️</button>
            </td>
        </tr>
    `).join('');
}

function renderNotes() {
    const container = document.getElementById('notesListContainer');
    if (!container) return;
    if (!allNotes || allNotes.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#6c757d;">🚫 لا توجد مذكرات</p>';
        return;
    }
    container.innerHTML = allNotes.map(n => `
        <div style="background:#f8f9fa; padding:15px; margin:10px 0; border-radius:8px; border-right:4px solid #0d6efd;">
            <h4>${n.title}</h4>
            <p>${n.content}</p>
            <small>${n.date || ''} | ${n.createdBy || 'مجهول'}</small>
        </div>
    `).join('');
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
        form.style.border = '2px solid #ffc107';
        form.style.boxShadow = '0 0 20px rgba(255,193,7,0.3)';
        setTimeout(() => {
            form.style.border = '1px solid #dee2e6';
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
    if (!select) {
        console.warn('⚠️ mVesselId غير موجود');
        return;
    }
    const currentValue = select.value;
    select.innerHTML = '<option value="">اختر المركب</option>';
    if (!allVessels || allVessels.length === 0) {
        select.innerHTML = '<option value="">🚫 لا توجد مراكب</option>';
        return;
    }
    allVessels.forEach(v => {
        const option = document.createElement('option');
        option.value = v.id;
        option.textContent = `${v.name} (${v.num || 'بدون رقم'}) - ${v.cat || 'بدون فئة'}`;
        if (v.id == currentValue) option.selected = true;
        select.appendChild(option);
    });
    console.log('✅ تم تحديث قائمة المراكب:', allVessels.length);
}

function toggleMaintenanceForm() {
    const form = document.getElementById('maintenanceForm');
    if (!form) return;
    if (form.style.display === 'none' || form.style.display === '') {
        form.style.display = 'block';
        updateMaintenanceVessels();
        const startDate = document.getElementById('mStartDate');
        if (startDate) {
            startDate.value = new Date().toISOString().split('T')[0];
        }
    } else {
        form.style.display = 'none';
    }
}

function addPart() {
    const container = document.getElementById('partsContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'part-item';
    div.style.cssText = 'display:flex; gap:10px; margin-bottom:5px; flex-wrap:wrap; align-items:center;';
    div.innerHTML = `
        <input type="text" placeholder="اسم القطعة" class="part-name" style="flex:2; min-width:150px; padding:8px; border:1px solid #ced4da; border-radius:5px;">
        <input type="number" placeholder="الكمية" class="part-qty" style="width:80px; padding:8px; border:1px solid #ced4da; border-radius:5px;">
        <input type="number" placeholder="السعر" class="part-price" style="width:80px; padding:8px; border:1px solid #ced4da; border-radius:5px;">
        <button class="remove-part" onclick="removePart(this)" style="padding:8px 15px; background:#dc3545; color:white; border:none; border-radius:5px; cursor:pointer;">✕</button>
    `;
    container.appendChild(div);
}

function removePart(btn) {
    const container = document.getElementById('partsContainer');
    if (!container) return;
    if (container.children.length > 1) {
        btn.parentElement.remove();
    } else {
        showAlert('⚠️ يجب أن يكون هناك قطعة واحدة على الأقل', 'warning');
    }
}

function getPartsData() {
    const parts = [];
    document.querySelectorAll('.part-item').forEach(item => {
        const name = item.querySelector('.part-name')?.value;
        const qty = parseFloat(item.querySelector('.part-qty')?.value) || 0;
        const price = parseFloat(item.querySelector('.part-price')?.value) || 0;
        if (name) {
            parts.push({ name, quantity: qty, price });
        }
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
    
    const vessels = allVessels.filter(v => v.stat === 'معطب' || v.stat === 'صيانة' || v.stat === 'خارج الخدمة');
    
    if (vessels.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px; background:#d4edda; border-radius:8px; border:2px solid #28a745;">
                <h3 style="color:#28a745; margin:0;">✅ لا توجد مراكب معطبة حالياً</h3>
                <p style="color:#6c757d;">جميع المراكب في حالة جاهزة</p>
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="scrollable-table">
            <table>
                <thead>
                    <tr style="background:#f8f9fa; border-bottom:2px solid #dc3545;">
                        <th>🚢 المركب</th>
                        <th>الفئة</th>
                        <th>الحالة الحالية</th>
                        <th>⚠️ العطل</th>
                        <th>📅 بداية العطل</th>
                        <th>⏱️ مدة التوقف</th>
                        <th>🔧 آخر إجراء</th>
                        <th>🏭 المسؤول</th>
                        <th>الإجراء</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    vessels.forEach(v => {
        const maintenanceRecord = allMaintenance.find(r => 
            r.vesselId === v.id && 
            (r.status === 'مفتوحة' || r.status === 'قيد الإنجاز' || r.status === 'قيد الإصلاح')
        );
        
        let downtime = '-';
        if (v.fDate) {
            const start = new Date(v.fDate);
            const now = new Date();
            const days = Math.floor((now - start) / (1000 * 60 * 60 * 24));
            if (days > 0) downtime = `${days} يوم${days > 1 ? 'اً' : ''}`;
            else downtime = 'اليوم';
        }
        
        const statusColors = {
            'معطب': '🔴 معطبة',
            'صيانة': '🟠 صيانة',
            'خارج الخدمة': '⚫ خارج الخدمة'
        };
        
        const statusClass = {
            'معطب': 'status-broken',
            'صيانة': 'status-maintenance',
            'خارج الخدمة': 'status-broken'
        };
        
        html += `
            <tr style="border-bottom:1px solid #dee2e6;">
                <td><strong>${v.name || '-'}</strong></td>
                <td>${v.cat || '-'}</td>
                <td><span class="status-badge ${statusClass[v.stat] || 'status-broken'}">${statusColors[v.stat] || v.stat}</span></td>
                <td>${v.break || maintenanceRecord?.description || '-'}</td>
                <td>${v.fDate || '-'}</td>
                <td>${downtime}</td>
                <td>${maintenanceRecord?.repair || maintenanceRecord?.notes || '-'}</td>
                <td>${v.repairer || v.supp || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="openMaintenanceFile(${v.id})" title="فتح ملف المركب">
                        📂 فتح الملف
                    </button>
                    <button class="btn btn-sm btn-success" onclick="fixVessel(${v.id})" title="إصلاح المركب">
                        ✅ إصلاح
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += `</tbody></table></div>`;
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
            showAlert('✅ تم إصلاح المركب وعودته للخدمة', 'success');
            
            const openRecords = allMaintenance.filter(r => 
                r.vesselId === vesselId && 
                (r.status === 'مفتوحة' || r.status === 'قيد الإنجاز' || r.status === 'قيد الإصلاح')
            );
            
            openRecords.forEach(r => {
                fetch('/api/maintenance/' + r.id, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ 
                        ...r, 
                        status: 'مغلقة',
                        endDate: new Date().toISOString().split('T')[0]
                    })
                }).catch(err => console.error('Error closing maintenance:', err));
            });
            
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
    if (!vessel) {
        showAlert('⚠️ المركب غير موجود', 'warning');
        return;
    }
    
    const records = allMaintenance.filter(r => r.vesselId === vesselId);
    const totalMaintenance = records.length;
    const totalCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);
    const lastMaintenance = records.length > 0 ? records[records.length - 1] : null;
    
    const faultCount = {};
    records.forEach(r => {
        const fault = r.faultType || r.description || 'غير محدد';
        faultCount[fault] = (faultCount[fault] || 0) + 1;
    });
    const sortedFaults = Object.keys(faultCount).sort((a, b) => faultCount[b] - faultCount[a]);
    const topFaults = sortedFaults.slice(0, 3);
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); z-index: 999999;
        display: flex; justify-content: center; align-items: center;
        padding: 20px;
    `;
    
    modal.innerHTML = `
        <div style="background:white; border-radius:12px; padding:30px; max-width:900px; width:100%; max-height:90vh; overflow-y:auto; position:relative;">
            <button onclick="this.closest('div[style]').remove()" style="position:absolute; top:10px; right:20px; font-size:24px; border:none; background:none; cursor:pointer;">✕</button>
            
            <h2 style="color:#0d6efd; margin-top:0;">🚢 ${vessel.name}</h2>
            
            <div style="display:flex; gap:15px; flex-wrap:wrap; margin-bottom:20px;">
                <span class="status-badge ${vessel.stat === 'صالح' ? 'status-ready' : 'status-broken'}">
                    ${vessel.stat === 'صالح' ? '🟢 جاهز' : '🔴 معطب'}
                </span>
                <span style="background:#e9ecef; padding:4px 12px; border-radius:20px;">${vessel.cat || 'بدون فئة'}</span>
                <span style="background:#e9ecef; padding:4px 12px; border-radius:20px;">${vessel.num || 'بدون رقم'}</span>
            </div>
            
            <hr style="margin:15px 0;">
            
            <h4 style="color:#0d6efd;">📚 تاريخ الصيانة</h4>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; margin:10px 0;">
                <div style="background:#e7f3ff; padding:10px; border-radius:8px; text-align:center;">
                    <div style="font-size:24px; font-weight:bold; color:#0d6efd;">${totalMaintenance}</div>
                    <div style="font-size:12px; color:#6c757d;">عدد الصيانات</div>
                </div>
                <div style="background:#d4edda; padding:10px; border-radius:8px; text-align:center;">
                    <div style="font-size:24px; font-weight:bold; color:#28a745;">${totalCost.toLocaleString()} د.ت</div>
                    <div style="font-size:12px; color:#6c757d;">إجمالي التكلفة</div>
                </div>
                <div style="background:#fff3cd; padding:10px; border-radius:8px; text-align:center;">
                    <div style="font-size:16px; font-weight:bold; color:#ffc107;">${lastMaintenance ? new Date(lastMaintenance.date).toLocaleDateString('ar-TN') : '-'}</div>
                    <div style="font-size:12px; color:#6c757d;">آخر صيانة</div>
                </div>
            </div>
            
            ${topFaults.length > 0 ? `
                <div style="background:#f8f9fa; padding:10px; border-radius:8px; margin:10px 0;">
                    <h5 style="margin:0; color:#dc3545;">⚠️ الأعطال المتكررة</h5>
                    <ul style="margin:5px 0; padding-right:20px;">
                        ${topFaults.map(f => `<li>${f} (${faultCount[f]} مرات)</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            
            <hr style="margin:15px 0;">
            
            ${records.length > 0 ? `
                <div style="max-height:300px; overflow-y:auto;">
                    <table style="width:100%; border-collapse:collapse; font-size:13px;">
                        <thead style="background:#f8f9fa;">
                            <tr>
                                <th style="padding:8px; text-align:center;">التاريخ</th>
                                <th style="padding:8px; text-align:center;">نوع الصيانة</th>
                                <th style="padding:8px; text-align:center;">العطل</th>
                                <th style="padding:8px; text-align:center;">الإصلاح</th>
                                <th style="padding:8px; text-align:center;">التكلفة</th>
                                <th style="padding:8px; text-align:center;">الحالة</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${records.slice().reverse().map(r => `
                                <tr style="border-bottom:1px solid #dee2e6;">
                                    <td style="padding:6px; text-align:center;">${r.date ? new Date(r.date).toLocaleDateString('ar-TN') : '-'}</td>
                                    <td style="padding:6px; text-align:center;">${r.type || '-'}</td>
                                    <td style="padding:6px; text-align:center;">${r.description || '-'}</td>
                                    <td style="padding:6px; text-align:center;">${r.repair || '-'}</td>
                                    <td style="padding:6px; text-align:center;">${r.cost ? r.cost + ' د.ت' : '-'}</td>
                                    <td style="padding:6px; text-align:center;">
                                        <span class="status-badge ${r.status === 'مغلقة' || r.status === 'مكتملة' ? 'status-closed' : 'status-maintenance'}">
                                            ${r.status === 'مغلقة' || r.status === 'مكتملة' ? '✅ مغلقة' : '🔄 قيد الإنجاز'}
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : `
                <div style="text-align:center; padding:20px; color:#6c757d;">
                    🚫 لا توجد سجلات صيانة لهذا المركب
                </div>
            `}
            
            <div style="margin-top:20px; display:flex; gap:10px; justify-content:center;">
                <button onclick="exportVesselReport(${vesselId})" style="padding:8px 30px; background:#0d6efd; color:white; border:none; border-radius:5px; cursor:pointer;">
                    📥 تصدير التقرير
                </button>
                <button onclick="this.closest('div[style]').remove()" style="padding:8px 30px; background:#6c757d; color:white; border:none; border-radius:5px; cursor:pointer;">
                    ❌ إغلاق
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            this.remove();
        }
    });
}

function exportVesselReport(vesselId) {
    const vessel = allVessels.find(v => v.id === vesselId);
    if (!vessel) {
        showAlert('⚠️ المركب غير موجود', 'warning');
        return;
    }
    
    const records = allMaintenance.filter(r => r.vesselId === vesselId);
    let csv = `تقرير المركب: ${vessel.name}\n`;
    csv += `الرقم: ${vessel.num || '-'}\n`;
    csv += `الفئة: ${vessel.cat || '-'}\n`;
    csv += `الحالة: ${vessel.stat || '-'}\n`;
    csv += `إجمالي الصيانات: ${records.length}\n`;
    csv += `إجمالي التكلفة: ${records.reduce((sum, r) => sum + (r.cost || 0), 0)} د.ت\n\n`;
    csv += 'التاريخ,نوع الصيانة,العطل,الإصلاح,التكلفة,الحالة\n';
    records.forEach(r => {
        csv += `${r.date || '-'},${r.type || '-'},${r.description || '-'},${r.repair || '-'},${r.cost || 0},${r.status || '-'}\n`;
    });
    
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `تقرير_${vessel.name}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showAlert('✅ تم تصدير التقرير بنجاح', 'success');
}

function renderHistoryMaintenance() {
    const container = document.getElementById('historyMaintenanceContainer');
    if (!container) return;
    
    let records = allMaintenance.filter(r => 
        r.status === 'مغلقة' || r.status === 'مكتملة' || r.status === 'ملغية'
    );
    
    const vesselFilter = document.getElementById('filterVessel')?.value?.toLowerCase() || '';
    const yearFilter = document.getElementById('filterYear')?.value || '';
    const typeFilter = document.getElementById('filterType')?.value || '';
    const unitFilter = document.getElementById('filterUnit')?.value || '';
    const costFilter = document.getElementById('filterCost')?.value || '';
    const faultFilter = document.getElementById('filterFaultType')?.value || '';
    
    if (vesselFilter) {
        records = records.filter(r => {
            const name = r.vesselName || allVessels.find(v => v.id === r.vesselId)?.name || '';
            return name.toLowerCase().includes(vesselFilter);
        });
    }
    if (yearFilter) {
        records = records.filter(r => r.date && r.date.startsWith(yearFilter));
    }
    if (typeFilter) {
        records = records.filter(r => r.type === typeFilter);
    }
    if (unitFilter) {
        records = records.filter(r => r.unit === unitFilter);
    }
    if (faultFilter) {
        records = records.filter(r => r.faultType === faultFilter || r.description?.includes(faultFilter));
    }
    if (costFilter) {
        records = records.filter(r => {
            const cost = r.cost || 0;
            switch(costFilter) {
                case '0-1000': return cost < 1000;
                case '1000-5000': return cost >= 1000 && cost <= 5000;
                case '5000-10000': return cost > 5000 && cost <= 10000;
                case '10000+': return cost > 10000;
                default: return true;
            }
        });
    }
    
    const countEl = document.getElementById('historyCount');
    if (countEl) countEl.textContent = `📊 ${records.length} سجل`;
    
    if (records.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px; color:#6c757d; background:#f8f9fa; border-radius:8px;">
                🚫 لا توجد سجلات صيانة مطابقة للفلترة
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="scrollable-table">
            <table>
                <thead>
                    <tr style="background:#f8f9fa; border-bottom:2px solid #0d6efd;">
                        <th>📅 التاريخ</th>
                        <th>🚢 المركب</th>
                        <th>🔧 نوع الصيانة</th>
                        <th>⚠️ العطل</th>
                        <th>🔩 الإصلاح</th>
                        <th>قطع الغيار</th>
                        <th>💰 التكلفة</th>
                        <th>⏱️ مدة التوقف</th>
                        <th>📊 الحالة</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    records.slice().reverse().forEach((r, index) => {
        const vesselName = r.vesselName || allVessels.find(v => v.id === r.vesselId)?.name || '-';
        const partsText = r.parts?.length ? r.parts.map(p => `${p.name}(${p.quantity})`).join(', ') : '-';
        
        let downtime = '-';
        if (r.startDate && r.endDate) {
            const start = new Date(r.startDate);
            const end = new Date(r.endDate);
            const days = Math.floor((end - start) / (1000 * 60 * 60 * 24));
            if (days > 0) downtime = `${days} يوم${days > 1 ? 'اً' : ''}`;
            else if (days === 0) downtime = 'أقل من يوم';
        }
        
        html += `
            <tr style="border-bottom:1px solid #dee2e6;">
                <td style="padding:8px;">${r.date ? new Date(r.date).toLocaleDateString('ar-TN') : '-'}</td>
                <td style="padding:8px;"><strong>${vesselName}</strong></td>
                <td style="padding:8px;">${r.type || '-'}</td>
                <td style="padding:8px;">${r.description || '-'}</td>
                <td style="padding:8px;">${r.repair || '-'}</td>
                <td style="padding:8px; font-size:11px;">${partsText}</td>
                <td style="padding:8px; font-weight:bold; color:#28a745;">${r.cost ? r.cost.toLocaleString() + ' د.ت' : '-'}</td>
                <td style="padding:8px;">${downtime}</td>
                <td style="padding:8px;">
                    <span class="status-badge status-closed">✅ ${r.status === 'مغلقة' ? 'مغلقة' : r.status === 'مكتملة' ? 'مكتملة' : 'ملغية'}</span>
                </td>
            </tr>
        `;
    });
    
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function updateYearFilter() {
    const select = document.getElementById('filterYear');
    if (!select) return;
    
    const years = new Set();
    allMaintenance.forEach(r => {
        if (r.date) {
            const year = r.date.split('-')[0];
            if (year) years.add(year);
        }
    });
    
    select.innerHTML = '<option value="">الكل</option>';
    Array.from(years).sort().reverse().forEach(year => {
        select.innerHTML += `<option value="${year}">${year}</option>`;
    });
}

function applyHistoryFilters() {
    renderHistoryMaintenance();
}

function resetHistoryFilters() {
    document.getElementById('filterVessel').value = '';
    document.getElementById('filterYear').value = '';
    document.getElementById('filterType').value = '';
    document.getElementById('filterUnit').value = '';
    document.getElementById('filterCost').value = '';
    document.getElementById('filterFaultType').value = '';
    renderHistoryMaintenance();
    showAlert('✅ تم إلغاء الفلترة', 'success');
}

function updateMaintenanceStats() {
    const container = document.getElementById('maintenanceStats');
    if (!container) return;
    const total = allMaintenance.length;
    const inProgress = allMaintenance.filter(r => r.status === 'قيد الإنجاز' || r.status === 'مفتوحة').length;
    const completed = allMaintenance.filter(r => r.status === 'مغلقة' || r.status === 'مكتملة').length;
    const cancelled = allMaintenance.filter(r => r.status === 'ملغية').length;
    container.innerHTML = `
        <div class="maintenance-stats">
            <div class="stat-box stat-total"><h4>${total}</h4><p>📊 المجموع</p></div>
            <div class="stat-box stat-progress"><h4>${inProgress}</h4><p>🔄 قيد الإنجاز</p></div>
            <div class="stat-box stat-completed"><h4>${completed}</h4><p>✅ مكتملة</p></div>
            <div class="stat-box stat-cancelled"><h4>${cancelled}</h4><p>❌ ملغية</p></div>
        </div>
    `;
}

function renderMaintenanceUnits() {
    const container = document.getElementById('maintenanceUnitsContainer');
    if (!container) {
        console.warn('⚠️ maintenanceUnitsContainer غير موجود');
        return;
    }
    
    if (!allMaintenance || allMaintenance.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px; color:#6c757d; background:#f8f9fa; border-radius:8px;">
                🚫 لا توجد سجلات صيانة لعرضها
            </div>
        `;
        return;
    }
    
    const units = [
        'وحدة الصيانة والإسناد البحري تونس',
        'وحدة الصيانة والإسناد البحري صفاقس',
        'وحدة الصيانة والإسناد البحري المنستير',
        'وحدة الصيانة والإسناد البحري جرجيس',
        'شركة خاصة'
    ];
    
    let html = '';
    
    units.forEach(unit => {
        const records = allMaintenance.filter(r => r.unit === unit);
        const total = records.length;
        
        html += `
            <div class="region-table-card" style="border-right:4px solid ${total > 0 ? '#0d6efd' : '#6c757d'};">
                <div class="region-table-header" style="background:${total > 0 ? '#e7f3ff' : '#f8f9fa'};">
                    🏭 ${unit}
                    <span style="font-size:12px; font-weight:400; color:#6c757d; margin-right:10px;">
                        📊 ${total} سجل
                    </span>
                    ${total > 0 ? `
                        <span style="font-size:11px; font-weight:400; margin-right:5px;">
                            ✅ ${records.filter(r => r.status === 'مغلقة' || r.status === 'مكتملة').length} مكتملة | 
                            🔄 ${records.filter(r => r.status === 'قيد الإنجاز' || r.status === 'مفتوحة').length} قيد الإنجاز | 
                            ❌ ${records.filter(r => r.status === 'ملغية').length} ملغية
                        </span>
                    ` : ''}
                </div>
                ${total === 0 ? `
                    <div style="text-align:center; padding:15px; color:#6c757d;">
                        🚫 لا توجد سجلات في هذه الوحدة
                    </div>
                ` : `
                    <div class="scrollable-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>المركب</th>
                                    <th>👨‍🔧 الفني</th>
                                    <th>🔩 القطع</th>
                                    <th>💰 التكلفة</th>
                                    <th>📊 الحالة</th>
                                    <th>📅 التاريخ</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${records.slice().reverse().map((r, index) => {
                                    const statusColors = {
                                        'قيد الإنجاز': '#ffc107',
                                        'مفتوحة': '#ffc107',
                                        'مغلقة': '#28a745',
                                        'مكتملة': '#28a745',
                                        'ملغية': '#dc3545'
                                    };
                                    const vesselName = r.vesselName || allVessels.find(v => v.id === r.vesselId)?.name || 'غير معروف';
                                    const partsText = r.parts && r.parts.length ? 
                                        r.parts.map(p => `${p.name}(${p.quantity})`).join(', ') : '-';
                                    return `
                                        <tr>
                                            <td>${index + 1}</td>
                                            <td><strong>${vesselName}</strong></td>
                                            <td>${r.technician || '-'}</td>
                                            <td style="font-size:11px;">${partsText}</td>
                                            <td>${r.cost ? r.cost + ' د.ت' : '-'}</td>
                                            <td><span style="color:${statusColors[r.status] || '#6c757d'}; font-weight:600;">${r.status || 'غير محدد'}</span></td>
                                            <td>${r.date ? new Date(r.date).toLocaleDateString('ar-TN') : '-'}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ============================================================
// 📊 صفحة الجاهزية
// ============================================================

function renderEfficiency() {
    console.log('📊 Rendering efficiency, vessels:', allVessels.length);
    const vessels = allVessels || [];
    
    const countEl = document.getElementById('effCount');
    if (countEl) countEl.textContent = `📊 ${vessels.length} مركب`;
    
    renderEfficiencyTables(vessels);
    updateEfficiencyStats(vessels);
    
    setTimeout(function() {
        renderCharts(vessels);
    }, 200);
}

function updateEfficiencyStats(vessels) {
    const container = document.getElementById('efficiencyStats');
    if (!container) return;
    
    const total = vessels.length;
    const ready = vessels.filter(v => v.stat === 'صالح').length;
    const broken = vessels.filter(v => v.stat === 'معطب').length;
    const maintenance = vessels.filter(v => v.stat === 'صيانة').length;
    const readyPercent = total > 0 ? Math.round((ready / total) * 100) : 0;
    
    container.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px; margin:10px 0;">
            <div class="stat-box" style="background:#e7f3ff; padding:15px; border-radius:10px; text-align:center; border:1px solid #b6d4fe;">
                <div style="font-size:26px; font-weight:bold; color:#0d6efd;">${total}</div>
                <div style="color:#6c757d; font-size:13px;">🚢 المجموع</div>
            </div>
            <div class="stat-box" style="background:#d4edda; padding:15px; border-radius:10px; text-align:center; border:1px solid #b7eb8f;">
                <div style="font-size:26px; font-weight:bold; color:#28a745;">${ready}</div>
                <div style="color:#6c757d; font-size:13px;">✅ صالح (${readyPercent}%)</div>
            </div>
            <div class="stat-box" style="background:#fff3cd; padding:15px; border-radius:10px; text-align:center; border:1px solid #ffecb5;">
                <div style="font-size:26px; font-weight:bold; color:#ffc107;">${maintenance}</div>
                <div style="color:#6c757d; font-size:13px;">🔧 صيانة</div>
            </div>
            <div class="stat-box" style="background:#f8d7da; padding:15px; border-radius:10px; text-align:center; border:1px solid #f5c2c7;">
                <div style="font-size:26px; font-weight:bold; color:#dc3545;">${broken}</div>
                <div style="color:#6c757d; font-size:13px;">❌ معطب</div>
            </div>
        </div>
    `;
}

function renderEfficiencyTables(vessels) {
    const container = document.getElementById('efficiencyTablesContainer');
    if (!container) return;
    
    let html = '';
    html += renderGeneralEfficiency(vessels);
    
    const regions = {
        'الشمال': ['بنزرت', 'طبرقة', 'المرسى', 'غار الملح'],
        'الساحل': ['سوسة', 'المنستير', 'المهدية', 'حمام سوسة'],
        'الوسط': ['صفاقس', 'قابس', 'جربة', 'القطار'],
        'الجنوب': ['جرجيس', 'بن قردان', 'ذراع الساحل']
    };
    
    Object.keys(regions).forEach(regionName => {
        const regionVessels = vessels.filter(v => {
            const zone = v.zone || '';
            return regions[regionName].some(city => zone.includes(city));
        });
        if (regionVessels.length > 0) {
            html += renderRegionEfficiency(regionVessels, regionName);
        }
    });
    
    container.innerHTML = html;
}

function renderGeneralEfficiency(vessels) {
    const categories = getCategoriesData(vessels);
    
    let html = `
        <div style="background:white; border-radius:10px; padding:15px; margin:15px 0; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
            <h4 style="color:#0d6efd; margin:0 0 10px 0;">📋 النجاعة العامة حسب الفئات</h4>
            <div class="scrollable-table">
                <table>
                    <thead>
                        <tr>
                            <th>الفئة</th>
                            <th style="color:#28a745;">✅ صالح</th>
                            <th style="color:#dc3545;">❌ معطب</th>
                            <th style="color:#ffc107;">🔧 صيانة</th>
                            <th>📊 الإجمالي</th>
                            <th>📈 النسبة</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    let totalReady = 0, totalBroken = 0, totalMaintenance = 0, totalAll = 0;
    const categoryOrder = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
    
    categoryOrder.forEach(cat => {
        const data = categories[cat] || { ready: 0, broken: 0, maintenance: 0, total: 0 };
        const readyPercent = data.total > 0 ? Math.round((data.ready / data.total) * 100) : 0;
        totalReady += data.ready;
        totalBroken += data.broken;
        totalMaintenance += data.maintenance;
        totalAll += data.total;
        
        html += `
            <tr>
                <td><strong>${cat}</strong></td>
                <td style="color:#28a745;">${data.ready}</td>
                <td style="color:#dc3545;">${data.broken}</td>
                <td style="color:#ffc107;">${data.maintenance}</td>
                <td>${data.total}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:6px; justify-content:center;">
                        <div style="width:60px; height:6px; background:#e9ecef; border-radius:3px; overflow:hidden;">
                            <div style="width:${readyPercent}%; height:100%; background:${readyPercent >= 70 ? '#28a745' : readyPercent >= 40 ? '#ffc107' : '#dc3545'};"></div>
                        </div>
                        <span style="font-weight:bold; font-size:12px;">${readyPercent}%</span>
                    </div>
                </td>
            </tr>
        `;
    });
    
    const totalPercent = totalAll > 0 ? Math.round((totalReady / totalAll) * 100) : 0;
    html += `
        <tr style="background:#e7f3ff; font-weight:bold;">
            <td>📊 المجموع الكلي</td>
            <td style="color:#28a745;">${totalReady}</td>
            <td style="color:#dc3545;">${totalBroken}</td>
            <td style="color:#ffc107;">${totalMaintenance}</td>
            <td>${totalAll}</td>
            <td>
                <div style="display:flex; align-items:center; gap:6px; justify-content:center;">
                    <div style="width:60px; height:6px; background:#e9ecef; border-radius:3px; overflow:hidden;">
                        <div style="width:${totalPercent}%; height:100%; background:${totalPercent >= 70 ? '#28a745' : totalPercent >= 40 ? '#ffc107' : '#dc3545'};"></div>
                    </div>
                    <span style="font-size:12px;">${totalPercent}%</span>
                </div>
            </td>
        </tr>
    `;
    
    html += `</tbody></table></div></div>`;
    return html;
}

function renderRegionEfficiency(vessels, regionName) {
    const categories = getCategoriesData(vessels);
    
    let html = `
        <div style="background:white; border-radius:10px; padding:15px; margin:15px 0; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
            <h4 style="color:#0d6efd; margin:0 0 10px 0;">📋 إقليم الحرس البحري بال${regionName}</h4>
            <div class="scrollable-table">
                <table>
                    <thead>
                        <tr>
                            <th>الفئة</th>
                            <th style="color:#28a745;">✅ صالح</th>
                            <th style="color:#dc3545;">❌ معطب</th>
                            <th style="color:#ffc107;">🔧 صيانة</th>
                            <th>📊 الإجمالي</th>
                            <th>📈 النسبة</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    let totalReady = 0, totalBroken = 0, totalMaintenance = 0, totalAll = 0;
    const categoryOrder = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
    
    categoryOrder.forEach(cat => {
        const data = categories[cat] || { ready: 0, broken: 0, maintenance: 0, total: 0 };
        const readyPercent = data.total > 0 ? Math.round((data.ready / data.total) * 100) : 0;
        totalReady += data.ready;
        totalBroken += data.broken;
        totalMaintenance += data.maintenance;
        totalAll += data.total;
        
        html += `
            <tr>
                <td><strong>${cat}</strong></td>
                <td style="color:#28a745;">${data.ready}</td>
                <td style="color:#dc3545;">${data.broken}</td>
                <td style="color:#ffc107;">${data.maintenance}</td>
                <td>${data.total}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:6px; justify-content:center;">
                        <div style="width:60px; height:6px; background:#e9ecef; border-radius:3px; overflow:hidden;">
                            <div style="width:${readyPercent}%; height:100%; background:${readyPercent >= 70 ? '#28a745' : readyPercent >= 40 ? '#ffc107' : '#dc3545'};"></div>
                        </div>
                        <span style="font-weight:bold; font-size:12px;">${readyPercent}%</span>
                    </div>
                </td>
            </tr>
        `;
    });
    
    const totalPercent = totalAll > 0 ? Math.round((totalReady / totalAll) * 100) : 0;
    html += `
        <tr style="background:#e7f3ff; font-weight:bold;">
            <td>📊 المجموع الكلي</td>
            <td style="color:#28a745;">${totalReady}</td>
            <td style="color:#dc3545;">${totalBroken}</td>
            <td style="color:#ffc107;">${totalMaintenance}</td>
            <td>${totalAll}</td>
            <td>
                <div style="display:flex; align-items:center; gap:6px; justify-content:center;">
                    <div style="width:60px; height:6px; background:#e9ecef; border-radius:3px; overflow:hidden;">
                        <div style="width:${totalPercent}%; height:100%; background:${totalPercent >= 70 ? '#28a745' : totalPercent >= 40 ? '#ffc107' : '#dc3545'};"></div>
                    </div>
                    <span style="font-size:12px;">${totalPercent}%</span>
                </div>
            </td>
        </tr>
    `;
    
    html += `</tbody></table></div></div>`;
    return html;
}

function getCategoriesData(vessels) {
    const categories = {};
    vessels.forEach(v => {
        const cat = v.cat || 'غير مصنف';
        if (!categories[cat]) {
            categories[cat] = { ready: 0, broken: 0, maintenance: 0, total: 0 };
        }
        categories[cat].total++;
        if (v.stat === 'صالح') categories[cat].ready++;
        else if (v.stat === 'معطب') categories[cat].broken++;
        else if (v.stat === 'صيانة') categories[cat].maintenance++;
    });
    return categories;
}

// ============================================================
// 📊 الرسوم البيانية
// ============================================================

function renderCharts(vessels) {
    renderCategoryChart(vessels);
    renderDoughnutChart(vessels);
}

function renderCategoryChart(vessels) {
    const canvas = document.getElementById('chartCategory');
    if (!canvas) return;
    
    const categories = {};
    vessels.forEach(v => {
        const cat = v.cat || 'غير مصنف';
        if (!categories[cat]) {
            categories[cat] = { ready: 0, broken: 0, maintenance: 0 };
        }
        if (v.stat === 'صالح') categories[cat].ready++;
        else if (v.stat === 'معطب') categories[cat].broken++;
        else if (v.stat === 'صيانة') categories[cat].maintenance++;
    });
    
    const labels = Object.keys(categories);
    const readyData = labels.map(cat => categories[cat].ready);
    const brokenData = labels.map(cat => categories[cat].broken);
    const maintenanceData = labels.map(cat => categories[cat].maintenance);
    
    if (chartCategory) {
        chartCategory.destroy();
    }
    
    chartCategory = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '✅ صالح',
                    data: readyData,
                    backgroundColor: 'rgba(40, 167, 69, 0.8)',
                    borderColor: '#28a745',
                    borderWidth: 2,
                    borderRadius: 4
                },
                {
                    label: '❌ معطب',
                    data: brokenData,
                    backgroundColor: 'rgba(220, 53, 69, 0.8)',
                    borderColor: '#dc3545',
                    borderWidth: 2,
                    borderRadius: 4
                },
                {
                    label: '🔧 صيانة',
                    data: maintenanceData,
                    backgroundColor: 'rgba(255, 193, 7, 0.8)',
                    borderColor: '#ffc107',
                    borderWidth: 2,
                    borderRadius: 4
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
                        font: { family: 'Cairo', size: 11 },
                        boxWidth: 12,
                        padding: 10
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { family: 'Cairo', size: 10 } }
                },
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1, font: { family: 'Cairo', size: 10 } }
                }
            }
        }
    });
}

function renderDoughnutChart(vessels) {
    const canvas = document.getElementById('chartDoughnut');
    if (!canvas) return;
    
    const ready = vessels.filter(v => v.stat === 'صالح').length;
    const broken = vessels.filter(v => v.stat === 'معطب').length;
    const maintenance = vessels.filter(v => v.stat === 'صيانة').length;
    
    if (chartDoughnut) {
        chartDoughnut.destroy();
    }
    
    chartDoughnut = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: ['✅ صالح', '❌ معطب', '🔧 صيانة'],
            datasets: [{
                data: [ready, broken, maintenance],
                backgroundColor: [
                    'rgba(40, 167, 69, 0.85)',
                    'rgba(220, 53, 69, 0.85)',
                    'rgba(255, 193, 7, 0.85)'
                ],
                borderColor: ['#28a745', '#dc3545', '#ffc107'],
                borderWidth: 2,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '55%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { family: 'Cairo', size: 11 },
                        padding: 10,
                        usePointStyle: true,
                        pointStyleWidth: 12
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? Math.round((context.parsed / total) * 100) : 0;
                            return context.label + ': ' + context.parsed + ' (' + pct + '%)';
                        }
                    }
                }
            }
        },
        plugins: [{
            id: 'centerText',
            beforeDraw: function(chart) {
                const { width, height, ctx } = chart;
                ctx.save();
                const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = 'bold 22px Cairo, sans-serif';
                ctx.fillStyle = '#0d6efd';
                ctx.fillText(total, width / 2, height / 2 - 5);
                ctx.font = '12px Cairo, sans-serif';
                ctx.fillStyle = '#6c757d';
                ctx.fillText('مركب', width / 2, height / 2 + 22);
                ctx.restore();
            }
        }]
    });
}

// ============================================================
// تصدير البيانات
// ============================================================

function exportEfficiencyData() {
    const vessels = allVessels || [];
    if (vessels.length === 0) {
        showAlert('⚠️ لا توجد بيانات للتصدير', 'warning');
        return;
    }
    
    let csv = 'الفئة,المركب,الرقم,الحالة,المنطقة,الميناء\n';
    vessels.forEach(v => {
        csv += `${v.cat || ''},${v.name || ''},${v.num || ''},${v.stat || ''},${v.zone || ''},${v.port || ''}\n`;
    });
    
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `الجاهزية_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showAlert('✅ تم التصدير بنجاح', 'success');
}

// ============================================================
// دوال الخريطة
// ============================================================

function initMap() {
    console.log('🗺️ Initializing map...');
}

// ============================================================
// دوال إضافية
// ============================================================

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

console.log('✅ تم تحميل التطبيق بالكامل');
console.log('📝 استخدم admin / 123456 للدخول');
