// public/js/app.js
console.log('✅ App loaded');

// ============================================================
// تهيئة التطبيق
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

function initMap() {
    console.log('🗺️ Initializing map...');
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

// ============================================================
// تشغيل التطبيق
// ============================================================

console.log('✅ تم تحميل التطبيق بالكامل');
console.log('📝 استخدم admin / 123456 للدخول');
console.log('👨‍💻 تم تطوير هذا النظام بواسطة: المبدع والمحترف الوكيل بالحرس الوطني التونسي أمان الله ناجي');
console.log('🗺️ خريطة تتبع المستخدمين بالساتلايت جاهزة!');
console.log('🔔 نظام الإشعارات يعمل!');
console.log('📂 ميزة استيراد الملفات (Excel/CSV/PDF) جاهزة!');
