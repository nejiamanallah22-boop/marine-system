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
    
    // حساب تجريبي للاختبار
    if (username === 'admin' && password === 'admin123') {
        console.log('✅ دخول تجريبي ناجح');
        const user = {
            id: 1,
            name: 'مدير النظام',
            role: 'مسؤول',
            email: 'admin@example.com'
        };
        localStorage.setItem('token', 'demo-token-12345');
        localStorage.setItem('user', JSON.stringify(user));
        currentUser = user;
        
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        
        updateUserDisplay();
        loadAllData();
        loadPage('fleet');
        showAlert('✅ تم تسجيل الدخول بنجاح', 'success');
        
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = '🚀 دخول';
        }
        return;
    }
    
    // الاتصال بالخادم
    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ email: username, password })
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
    })
    .catch(err => {
        console.error('Load maintenance error:', err);
        allMaintenance = getDemoMaintenance();
        renderMaintenanceTables();
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
            type: 'طارئة',
            unit: 'وحدة الصيانة والإسناد البحري تونس',
            technician: 'فني 1',
            description: 'عطل في المحرك الرئيسي',
            cost: 2500,
            notes: 'تم تغيير طلمبة الزيت',
            status: 'مكتملة',
            date: '2026-01-20',
            parts: [
                { name: 'طلمبة زيت', quantity: 1, price: 1200 },
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
            cost: 800,
            notes: 'تم تغيير الزيوت والفلتر',
            status: 'قيد الإنجاز',
            date: '2026-02-01',
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
            type: 'كبيرة',
            unit: 'وحدة الصيانة والإسناد البحري المنستير',
            technician: 'فني 3',
            description: 'إصلاح شامل للهيكل',
            cost: 5000,
            notes: 'تم تغيير ألواح الهيكل',
            status: 'مكتملة',
            date: '2026-01-10',
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
            cost: 1200,
            notes: 'تم تغيير البطاريات',
            status: 'ملغية',
            date: '2026-02-05',
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
            cost: 1800,
            notes: 'تم تغيير طرمبة التوجيه',
            status: 'قيد الإنجاز',
            date: '2026-02-10',
            parts: [
                { name: 'طرمبة توجيه', quantity: 1, price: 1500 },
                { name: 'زيت هيدروليك', quantity: 3, price: 100 }
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
    
    const data = {
        vesselId: parseFloat(vesselId),
        type: type || 'عادية',
        unit: unit || 'غير محدد',
        technician: technician,
        description: description,
        cost: cost,
        notes: notes || '',
        parts: parts,
        status: 'قيد الإنجاز',
        date: new Date().toISOString().split('T')[0],
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
        container.innerHTML = `
            <div style="text-align:center; padding:20px; background:#f8f9fa; border-radius:8px; color:#28a745;">
                ✅ لا توجد مراكب معطبة حالياً
            </div>
        `;
        return;
    }
    let html = `
        <div class="scrollable-table">
            <table>
                <thead>
                    <tr>
                        <th>#</th><th>المركب</th><th>الرقم</th>
                        <th>الفئة</th><th>الوحدة</th><th>العطل</th>
                        <th>📅 تاريخ العطب</th><th>الحالة</th><th>إجراءات</th>
                    </tr>
                </thead>
                <tbody>
    `;
    vessels.forEach((v, index) => {
        const maintenanceRecord = allMaintenance.find(r => r.vesselId === v.id && r.status === 'قيد الإنجاز');
        html += `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${v.name || '-'}</strong></td>
                <td>${v.num || '-'}</td>
                <td>${v.cat || '-'}</td>
                <td>${v.repairer || v.supp || '-'}</td>
                <td>${v.break || maintenanceRecord?.description || '-'}</td>
                <td>${v.fDate || '-'}</td>
                <td style="color:${v.stat === 'معطب' ? '#dc3545' : '#ffc107'}; font-weight:600;">
                    ${v.stat === 'معطب' ? '❌ معطب' : '🔧 صيانة'}
                </td>
                <td>
                    <button class="btn btn-sm btn-success" onclick="fixVessel(${v.id})" title="إصلاح المركب">
                        <i class="fas fa-check"></i> إصلاح
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

function renderHistoryMaintenance() {
    const container = document.getElementById('historyMaintenanceContainer');
    if (!container) return;
    let records = allMaintenance.filter(r => r.status === 'مكتملة' || r.status === 'ملغية');
    const vesselFilter = document.getElementById('filterVessel')?.value?.toLowerCase() || '';
    const dateFrom = document.getElementById('filterDateFrom')?.value || '';
    const dateTo = document.getElementById('filterDateTo')?.value || '';
    const statusFilter = document.getElementById('filterStatus')?.value || '';
    
    if (vesselFilter) {
        records = records.filter(r => {
            const name = r.vesselName || allVessels.find(v => v.id === r.vesselId)?.name || '';
            const num = r.vesselNum || allVessels.find(v => v.id === r.vesselId)?.num || '';
            return name.toLowerCase().includes(vesselFilter) || num.toString().includes(vesselFilter);
        });
    }
    if (dateFrom) records = records.filter(r => r.date >= dateFrom);
    if (dateTo) records = records.filter(r => r.date <= dateTo + 'T23:59:59');
    if (statusFilter) records = records.filter(r => r.status === statusFilter);
    
    const countEl = document.getElementById('historyCount');
    if (countEl) countEl.textContent = `📊 ${records.length} سجل`;
    
    if (records.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px; color:#6c757d; background:#f8f9fa; border-radius:8px;">
                🚫 لا توجد سجلات صيانة مكتملة
            </div>
        `;
        return;
    }
    let html = `
        <div class="scrollable-table">
            <table>
                <thead>
                    <tr>
                        <th>#</th><th>المركب</th><th>الرقم</th>
                        <th>👨‍🔧 الفني</th>
                        <th>🔩 القطع</th>
                        <th>💰 التكلفة</th>
                        <th>📊 الحالة</th>
                        <th>📅 التاريخ</th>
                    </tr>
                </thead>
                <tbody>
    `;
    records.slice().reverse().forEach((r, index) => {
        const vesselName = r.vesselName || allVessels.find(v => v.id === r.vesselId)?.name || '-';
        const vesselNum = r.vesselNum || allVessels.find(v => v.id === r.vesselId)?.num || '-';
        const partsText = r.parts?.length ? r.parts.map(p => `${p.name}(${p.quantity})`).join(', ') : '-';
        html += `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${vesselName}</strong></td>
                <td>${vesselNum}</td>
                <td>${r.technician || '-'}</td>
                <td style="font-size:11px;">${partsText}</td>
                <td>${r.cost ? r.cost + ' د.ت' : '-'}</td>
                <td style="color:${r.status === 'مكتملة' ? '#28a745' : '#dc3545'}; font-weight:600;">${r.status || '-'}</td>
                <td>${r.date ? new Date(r.date).toLocaleDateString('ar-TN') : '-'}</td>
            </tr>
        `;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function applyHistoryFilters() {
    renderHistoryMaintenance();
}

function resetHistoryFilters() {
    document.getElementById('filterVessel').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    document.getElementById('filterStatus').value = '';
    renderHistoryMaintenance();
    showAlert('✅ تم إلغاء الفلترة', 'success');
}

function updateMaintenanceStats() {
    const container = document.getElementById('maintenanceStats');
    if (!container) return;
    const total = allMaintenance.length;
    const inProgress = allMaintenance.filter(r => r.status === 'قيد الإنجاز').length;
    const completed = allMaintenance.filter(r => r.status === 'مكتملة').length;
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
                            ✅ ${records.filter(r => r.status === 'مكتملة').length} مكتملة | 
                            🔄 ${records.filter(r => r.status === 'قيد الإنجاز').length} قيد الإنجاز | 
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
}

function renderEfficiencyTables(vessels) {
    const container = document.getElementById('efficiencyTablesContainer');
    if (!container) return;
    
    let html = '';
    
    // 1. النجاعة العامة حسب الفئات
    html += renderGeneralEfficiency(vessels);
    
    // 2. أقاليم الحرس البحري
    const regions = {
        'الشمال': ['بنزرت', 'طبرقة', 'المرسى', 'غار الملح', 'رأس الجبل'],
        'الساحل': ['سوسة', 'المنستير', 'المهدية', 'حمام سوسة', 'قليبية', 'نابل'],
        'الوسط': ['صفاقس', 'قابس', 'جربة', 'القطار', 'المحرس'],
        'الجنوب': ['جرجيس', 'بن قردان', 'ذراع الساحل', 'الطينة']
    };
    
    Object.keys(regions).forEach(regionName => {
        const regionVessels = vessels.filter(v => {
            const zone = v.zone || '';
            const port = v.port || '';
            return regions[regionName].some(city => 
                zone.includes(city) || port.includes(city)
            );
        });
        html += renderRegionEfficiency(regionVessels, regionName);
    });
    
    container.innerHTML = html;
}

function renderGeneralEfficiency(vessels) {
    const categories = getCategoriesData(vessels);
    
    let html = `
        <div style="background:white; border-radius:10px; padding:20px; margin:20px 0; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
            <h3 style="color:#0d6efd; margin-bottom:15px;">📋 1. النجاعة العامة حسب الفئات</h3>
            <div class="scrollable-table">
                <table>
                    <thead>
                        <tr style="background:#f8f9fa; border-bottom:2px solid #dee2e6;">
                            <th style="padding:10px;">الفئة</th>
                            <th style="padding:10px; color:#28a745;">✅ الصالحة</th>
                            <th style="padding:10px; color:#dc3545;">❌ المعطبة</th>
                            <th style="padding:10px; color:#ffc107;">🔧 الصيانة</th>
                            <th style="padding:10px; color:#0d6efd;">📊 الإجمالي</th>
                            <th style="padding:10px; color:#6c757d;">📈 النسبة</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    let totalReady = 0, totalBroken = 0, totalMaintenance = 0, totalAll = 0;
    
    const categoryOrder = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
    
    categoryOrder.forEach(cat => {
        if (categories[cat]) {
            const data = categories[cat];
            const readyPercent = data.total > 0 ? Math.round((data.ready / data.total) * 100) : 0;
            totalReady += data.ready;
            totalBroken += data.broken;
            totalMaintenance += data.maintenance;
            totalAll += data.total;
            
            html += `
                <tr style="border-bottom:1px solid #dee2e6;">
                    <td style="padding:10px; font-weight:bold;">${cat}</td>
                    <td style="padding:10px; color:#28a745; font-weight:bold;">${data.ready}</td>
                    <td style="padding:10px; color:#dc3545; font-weight:bold;">${data.broken}</td>
                    <td style="padding:10px; color:#ffc107; font-weight:bold;">${data.maintenance}</td>
                    <td style="padding:10px; font-weight:bold;">${data.total}</td>
                    <td style="padding:10px;">
                        <div style="display:flex; align-items:center; gap:8px; justify-content:center;">
                            <div style="width:80px; height:8px; background:#e9ecef; border-radius:4px; overflow:hidden;">
                                <div style="width:${readyPercent}%; height:100%; background:${readyPercent >= 70 ? '#28a745' : readyPercent >= 40 ? '#ffc107' : '#dc3545'}; border-radius:4px;"></div>
                            </div>
                            <span style="font-weight:bold; min-width:40px;">${readyPercent}%</span>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            html += `
                <tr style="border-bottom:1px solid #dee2e6; color:#6c757d;">
                    <td style="padding:10px; font-weight:bold;">${cat}</td>
                    <td style="padding:10px;">0</td>
                    <td style="padding:10px;">0</td>
                    <td style="padding:10px;">0</td>
                    <td style="padding:10px;">0</td>
                    <td style="padding:10px;">
                        <div style="display:flex; align-items:center; gap:8px; justify-content:center;">
                            <div style="width:80px; height:8px; background:#e9ecef; border-radius:4px; overflow:hidden;">
                                <div style="width:0%; height:100%; background:#6c757d; border-radius:4px;"></div>
                            </div>
                            <span style="font-weight:bold; min-width:40px;">0%</span>
                        </div>
                    </td>
                </tr>
            `;
        }
    });
    
    const totalPercent = totalAll > 0 ? Math.round((totalReady / totalAll) * 100) : 0;
    html += `
        <tr style="background:#e7f3ff; border-top:2px solid #0d6efd; font-weight:bold;">
            <td style="padding:12px;">📊 المجموع الكلي</td>
            <td style="padding:12px; color:#28a745;">${totalReady}</td>
            <td style="padding:12px; color:#dc3545;">${totalBroken}</td>
            <td style="padding:12px; color:#ffc107;">${totalMaintenance}</td>
            <td style="padding:12px;">${totalAll}</td>
            <td style="padding:12px;">
                <div style="display:flex; align-items:center; gap:8px; justify-content:center;">
                    <div style="width:80px; height:8px; background:#e9ecef; border-radius:4px; overflow:hidden;">
                        <div style="width:${totalPercent}%; height:100%; background:${totalPercent >= 70 ? '#28a745' : totalPercent >= 40 ? '#ffc107' : '#dc3545'}; border-radius:4px;"></div>
                    </div>
                    <span style="min-width:40px;">${totalPercent}%</span>
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
        <div style="background:white; border-radius:10px; padding:20px; margin:20px 0; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
            <h3 style="color:#0d6efd; margin-bottom:15px;">📋 إقليم الحرس البحري بال${regionName}</h3>
            <div class="scrollable-table">
                <table>
                    <thead>
                        <tr style="background:#f8f9fa; border-bottom:2px solid #dee2e6;">
                            <th style="padding:10px;">الفئة</th>
                            <th style="padding:10px; color:#28a745;">✅ الصالحة</th>
                            <th style="padding:10px; color:#dc3545;">❌ المعطبة</th>
                            <th style="padding:10px; color:#ffc107;">🔧 الصيانة</th>
                            <th style="padding:10px; color:#0d6efd;">📊 الإجمالي</th>
                            <th style="padding:10px; color:#6c757d;">📈 النسبة</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    let totalReady = 0, totalBroken = 0, totalMaintenance = 0, totalAll = 0;
    
    const categoryOrder = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
    
    categoryOrder.forEach(cat => {
        if (categories[cat]) {
            const data = categories[cat];
            const readyPercent = data.total > 0 ? Math.round((data.ready / data.total) * 100) : 0;
            totalReady += data.ready;
            totalBroken += data.broken;
            totalMaintenance += data.maintenance;
            totalAll += data.total;
            
            html += `
                <tr style="border-bottom:1px solid #dee2e6;">
                    <td style="padding:10px; font-weight:bold;">${cat}</td>
                    <td style="padding:10px; color:#28a745; font-weight:bold;">${data.ready}</td>
                    <td style="padding:10px; color:#dc3545; font-weight:bold;">${data.broken}</td>
                    <td style="padding:10px; color:#ffc107; font-weight:bold;">${data.maintenance}</td>
                    <td style="padding:10px; font-weight:bold;">${data.total}</td>
                    <td style="padding:10px;">
                        <div style="display:flex; align-items:center; gap:8px; justify-content:center;">
                            <div style="width:80px; height:8px; background:#e9ecef; border-radius:4px; overflow:hidden;">
                                <div style="width:${readyPercent}%; height:100%; background:${readyPercent >= 70 ? '#28a745' : readyPercent >= 40 ? '#ffc107' : '#dc3545'}; border-radius:4px;"></div>
                            </div>
                            <span style="font-weight:bold; min-width:40px;">${readyPercent}%</span>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            html += `
                <tr style="border-bottom:1px solid #dee2e6; color:#6c757d;">
                    <td style="padding:10px; font-weight:bold;">${cat}</td>
                    <td style="padding:10px;">0</td>
                    <td style="padding:10px;">0</td>
                    <td style="padding:10px;">0</td>
                    <td style="padding:10px;">0</td>
                    <td style="padding:10px;">
                        <div style="display:flex; align-items:center; gap:8px; justify-content:center;">
                            <div style="width:80px; height:8px; background:#e9ecef; border-radius:4px; overflow:hidden;">
                                <div style="width:0%; height:100%; background:#6c757d; border-radius:4px;"></div>
                            </div>
                            <span style="font-weight:bold; min-width:40px;">0%</span>
                        </div>
                    </td>
                </tr>
            `;
        }
    });
    
    const totalPercent = totalAll > 0 ? Math.round((totalReady / totalAll) * 100) : 0;
    html += `
        <tr style="background:#e7f3ff; border-top:2px solid #0d6efd; font-weight:bold;">
            <td style="padding:12px;">📊 المجموع الكلي</td>
            <td style="padding:12px; color:#28a745;">${totalReady}</td>
            <td style="padding:12px; color:#dc3545;">${totalBroken}</td>
            <td style="padding:12px; color:#ffc107;">${totalMaintenance}</td>
            <td style="padding:12px;">${totalAll}</td>
            <td style="padding:12px;">
                <div style="display:flex; align-items:center; gap:8px; justify-content:center;">
                    <div style="width:80px; height:8px; background:#e9ecef; border-radius:4px; overflow:hidden;">
                        <div style="width:${totalPercent}%; height:100%; background:${totalPercent >= 70 ? '#28a745' : totalPercent >= 40 ? '#ffc107' : '#dc3545'}; border-radius:4px;"></div>
                    </div>
                    <span style="min-width:40px;">${totalPercent}%</span>
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
// دالة تصدير البيانات
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
    
    showAlert('✅ تم تصدير البيانات بنجاح', 'success');
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
console.log('📝 استخدم admin / admin123 للدخول التجريبي');
