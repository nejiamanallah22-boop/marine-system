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
// دوال تسجيل الدخول
// ============================================================

function doLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const loginError = document.getElementById('loginError');
    
    if (!username || !password) {
        if (loginError) {
            loginError.textContent = '❌ الرجاء إدخال اسم المستخدم وكلمة المرور';
            loginError.style.display = 'block';
        }
        return;
    }
    
    // حسابات تجريبية
    const validUsers = {
        'admin': { password: '123456', role: 'مسؤول', name: 'مدير النظام' },
        'north': { password: '123456', role: 'محرر إقليمي', name: 'محرر الشمال' },
        'coast': { password: '123456', role: 'محرر إقليمي', name: 'محرر الساحل' },
        'center': { password: '123456', role: 'محرر إقليمي', name: 'محرر الوسط' },
        'south': { password: '123456', role: 'محرر إقليمي', name: 'محرر الجنوب' },
        'viewer': { password: '123456', role: 'مشاهد', name: 'مشاهد' }
    };
    
    if (validUsers[username] && validUsers[username].password === password) {
        const user = validUsers[username];
        localStorage.setItem('authToken', 'demo-token-' + username);
        localStorage.setItem('user', JSON.stringify({ 
            username: username, 
            role: user.role, 
            name: user.name 
        }));
        
        const loginOverlay = document.getElementById('loginOverlay');
        const mainApp = document.getElementById('mainApp');
        if (loginOverlay) loginOverlay.style.display = 'none';
        if (mainApp) mainApp.style.display = 'block';
        
        // تحميل الصفحة الرئيسية
        loadPage('dashboard');
        
        // تحديث اسم المستخدم في الواجهة
        const userNameDisplay = document.getElementById('userNameDisplay');
        if (userNameDisplay) userNameDisplay.textContent = user.name + ' (' + user.role + ')';
        
        // إظهار أزرار حسب الصلاحيات
        updatePermissions(user.role);
        
        if (loginError) loginError.style.display = 'none';
    } else {
        if (loginError) {
            loginError.textContent = '❌ اسم المستخدم أو كلمة المرور غير صحيحة';
            loginError.style.display = 'block';
        }
    }
}

function updatePermissions(role) {
    const adminButtons = document.querySelectorAll('.admin-only');
    const editorButtons = document.querySelectorAll('.editor-only');
    const techButtons = document.querySelectorAll('.tech-only');
    
    if (role === 'مسؤول') {
        adminButtons.forEach(el => el.style.display = '');
        editorButtons.forEach(el => el.style.display = '');
        techButtons.forEach(el => el.style.display = '');
    } else if (role === 'محرر إقليمي') {
        adminButtons.forEach(el => el.style.display = 'none');
        editorButtons.forEach(el => el.style.display = '');
        techButtons.forEach(el => el.style.display = '');
    } else if (role === 'فني صيانة') {
        adminButtons.forEach(el => el.style.display = 'none');
        editorButtons.forEach(el => el.style.display = 'none');
        techButtons.forEach(el => el.style.display = '');
    } else {
        adminButtons.forEach(el => el.style.display = 'none');
        editorButtons.forEach(el => el.style.display = 'none');
        techButtons.forEach(el => el.style.display = 'none');
    }
}

function logout() {
    if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
        localStorage.clear();
        location.reload();
    }
}

// ============================================================
// دوال عرض التنبيهات
// ============================================================

function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    alertDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 9999;
        font-family: 'Cairo', sans-serif;
        font-size: 14px;
        background: ${type === 'success' ? 'rgba(74,222,128,0.15)' : 'rgba(96,165,250,0.15)'};
        border: 1px solid ${type === 'success' ? 'rgba(74,222,128,0.2)' : 'rgba(96,165,250,0.2)'};
        color: ${type === 'success' ? '#4ade80' : '#60a5fa'};
        backdrop-filter: blur(10px);
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.style.opacity = '0';
        alertDiv.style.transition = 'opacity 0.3s';
        setTimeout(() => alertDiv.remove(), 300);
    }, 3000);
}

// ============================================================
// دوال المساعد الذكي (AI Assistant)
// ============================================================

function initAIAssistant() {
    console.log('🤖 Initializing AI Assistant...');
    
    // إضافة مستمع لأزرار المساعد
    const sendBtn = document.getElementById('sendBtn');
    const chatInput = document.getElementById('chatInput');
    
    if (sendBtn) {
        sendBtn.addEventListener('click', function() {
            askAI();
        });
    }
    
    if (chatInput) {
        chatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                askAI();
            }
        });
    }
    
    // تحميل رسالة الترحيب
    const chatBox = document.getElementById('chatBox');
    if (chatBox && chatBox.children.length === 0) {
        addAIMessage('ai', '👋 مرحباً! أنا المساعد الذكي. كيف يمكنني مساعدتك؟');
    }
    
    console.log('✅ AI Assistant ready!');
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
console.log('🤖 ميزة المساعد الذكي (AI) جاهزة!');
