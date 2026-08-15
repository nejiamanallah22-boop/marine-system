// ============================================================
// 🚀 MARINE SYSTEM - APP.JS v15.0
// ============================================================
// 🔐 SECURE - No localStorage for tokens
// ============================================================

console.log('🚀 Marine System v15.0 - Secure Frontend');

// ============================================================
// 📋 CONFIGURATION
// ============================================================

const API_BASE = '/api';
const USER_KEY = 'auth_user';

// ============================================================
// 🔐 AUTH FUNCTIONS
// ============================================================

function getUser() {
    try {
        return JSON.parse(localStorage.getItem(USER_KEY));
    } catch {
        return null;
    }
}

function setUser(user) {
    if (user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
        localStorage.removeItem(USER_KEY);
    }
}

// ============================================================
// 🔐 LOGIN
// ============================================================

async function doLogin() {
    const username = document.getElementById('username')?.value?.trim();
    const password = document.getElementById('password')?.value?.trim();
    const errorEl = document.getElementById('loginError');

    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }

    if (!username || !password) {
        if (errorEl) {
            errorEl.textContent = '⚠️ الرجاء إدخال اسم المستخدم وكلمة المرور';
            errorEl.style.display = 'block';
        }
        return;
    }

    const loginBtn = document.querySelector('.login-btn');
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.textContent = '⏳ جاري الدخول...';
    }

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                username: username,
                password: password
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            setUser(data.user);

            const overlay = document.getElementById('loginOverlay');
            const mainApp = document.getElementById('mainApp');
            if (overlay) overlay.style.display = 'none';
            if (mainApp) mainApp.style.display = 'block';

            updateUserDisplay();
            loadPage('dashboard');

            showToast('✅ مرحباً ' + (data.user?.name || 'مدير النظام') + '!', 'success');
        } else {
            if (errorEl) {
                errorEl.textContent = '❌ ' + (data.error || 'بيانات الدخول غير صحيحة');
                errorEl.style.display = 'block';
            }
        }
    } catch (error) {
        console.error('❌ Login error:', error);
        if (errorEl) {
            errorEl.textContent = '❌ خطأ في الاتصال بالخادم';
            errorEl.style.display = 'block';
        }
    } finally {
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = '🚀 دخول';
        }
    }
}

function handleLogin() {
    doLogin();
}

// ============================================================
// 🚪 LOGOUT
// ============================================================

async function doLogout() {
    if (!confirm('⚠️ هل أنت متأكد من تسجيل الخروج؟')) return;

    try {
        await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.error('Logout error:', error);
    }

    setUser(null);

    const overlay = document.getElementById('loginOverlay');
    const mainApp = document.getElementById('mainApp');
    if (overlay) overlay.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';

    showToast('👋 تم تسجيل الخروج', 'info');
}

// ============================================================
// 👤 USER DISPLAY
// ============================================================

function updateUserDisplay() {
    const display = document.getElementById('userRoleDisplay');
    if (!display) return;

    const user = getUser();
    if (user) {
        const roleEmojis = {
            'مسؤول': '👑',
            'محرر': '✏️',
            'مستخدم': '👤',
            'مشاهد': '👀'
        };
        display.innerHTML = `
            <i class="fas fa-user-circle"></i>
            ${user.name || 'مستخدم'}
            <span class="role-badge">${roleEmojis[user.role] || '👤'} ${user.role || 'مستخدم'}</span>
            <button onclick="doLogout()" class="logout-btn-small">🚪 خروج</button>
        `;
    } else {
        display.textContent = '👤';
    }
}

// ============================================================
// 📄 PAGE MANAGEMENT
// ============================================================

function loadPage(pageName) {
    const container = document.getElementById('pageContainer');
    if (!container) return;

    const oldContent = container.querySelector('.page-content');
    if (oldContent) oldContent.remove();

    const loading = document.createElement('div');
    loading.className = 'page-loading';
    loading.innerHTML = `
        <div style="text-align:center; padding:50px;">
            <div class="spinner"></div>
            <p style="color:rgba(255,255,255,0.3); margin-top:15px;">⏳ جاري التحميل...</p>
        </div>
    `;
    container.appendChild(loading);

    fetch(`/pages/${pageName}.html`)
        .then(res => {
            if (!res.ok) throw new Error(`Page ${pageName} not found`);
            return res.text();
        })
        .then(html => {
            loading.remove();
            const page = document.createElement('div');
            page.className = 'page-content';
            page.id = `page-${pageName}`;
            page.innerHTML = html;
            page.style.opacity = '0';
            page.style.transition = 'opacity 0.3s';
            container.appendChild(page);

            requestAnimationFrame(() => {
                page.style.opacity = '1';
            });

            setTimeout(() => initPage(pageName), 100);
        })
        .catch(err => {
            console.error('❌ Page load error:', err);
            loading.remove();
            container.innerHTML = `
                <div style="text-align:center; padding:50px; color:#f87171;">
                    <h2>❌ خطأ في تحميل الصفحة</h2>
                    <p>${err.message}</p>
                    <button onclick="loadPage('dashboard')" class="btn-primary">🏠 العودة</button>
                </div>
            `;
        });
}

function initPage(pageName) {
    console.log(`📄 Initializing page: ${pageName}`);

    switch(pageName) {
        case 'dashboard':
            if (typeof loadDashboard === 'function') loadDashboard();
            break;
        case 'fleet':
            if (typeof loadVessels === 'function') loadVessels();
            break;
        case 'maintenance':
            if (typeof loadMaintenance === 'function') loadMaintenance();
            break;
        case 'efficiency':
            if (typeof loadVessels === 'function') loadVessels();
            break;
        case 'users':
            if (typeof loadUsers === 'function') loadUsers();
            break;
        case 'ai-assistant':
            if (typeof initAIAssistant === 'function') initAIAssistant();
            break;
        default:
            console.log(`⚠️ Unknown page: ${pageName}`);
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
    showToast('✅ تم تحديث الصفحة', 'success');
}

// ============================================================
// 🔔 TOAST
// ============================================================

function showToast(message, type = 'info') {
    const colors = {
        success: '#4ade80',
        danger: '#f87171',
        warning: '#fbbf24',
        info: '#60a5fa'
    };

    const icons = {
        success: '✅',
        danger: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    const oldToast = document.querySelector('.marine-toast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.className = 'marine-toast';
    toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 999999;
        padding: 12px 24px;
        border-radius: 12px;
        color: white;
        background: rgba(10,14,23,0.95);
        border: 1px solid ${colors[type]}55;
        border-right: 4px solid ${colors[type]};
        backdrop-filter: blur(10px);
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        font-family: 'Cairo', sans-serif;
        max-width: 90%;
        text-align: center;
        animation: fadeIn 0.3s ease;
        opacity: 0;
        transition: opacity 0.25s ease;
    `;
    toast.innerHTML = `
        <span style="color:${colors[type]}">${icons[type]}</span>
        <span style="margin-left:8px;">${message}</span>
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toast.isConnected) toast.remove();
        }, 300);
    }, 3000);
}

// ============================================================
// 📊 DATA FETCHING
// ============================================================

async function fetchData(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...(options.headers || {})
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                setUser(null);
                showToast('⚠️ انتهت الجلسة، يرجى تسجيل الدخول', 'warning');
                setTimeout(() => location.reload(), 1000);
                return null;
            }
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('❌ Fetch error:', error);
        showToast('❌ خطأ في تحميل البيانات', 'danger');
        return null;
    }
}

// ============================================================
// 📊 DASHBOARD
// ============================================================

function loadDashboard() {
    console.log('📊 Loading dashboard...');

    fetchData('/api/dashboard')
        .then(data => {
            if (!data?.success) return;
            const stats = data.data || {};

            const vessels = stats.vessels || {};
            const el = (id) => document.getElementById(id);
            if (el('dashTotal')) el('dashTotal').textContent = vessels.total || 0;
            if (el('dashReady')) el('dashReady').textContent = vessels.valid || 0;
            if (el('dashBroken')) el('dashBroken').textContent = vessels.damaged || 0;
            if (el('dashMaintenance')) el('dashMaintenance').textContent = vessels.maintenance || 0;

            const percent = vessels.total > 0 ? Math.round((vessels.valid / vessels.total) * 100) : 0;
            if (el('dashReadyPercent')) el('dashReadyPercent').textContent = percent + '%';

            fetchData('/api/maintenance')
                .then(maintenanceData => {
                    if (maintenanceData?.success) {
                        const records = maintenanceData.maintenance || [];
                        const totalCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);
                        if (el('dashTotalCost')) el('dashTotalCost').textContent = totalCost.toLocaleString() + ' د.ت';
                        if (el('dashMaintenanceCount')) el('dashMaintenanceCount').textContent = records.length;
                    }
                });
        });
}

// ============================================================
// 🚢 FLEET
// ============================================================

function loadVessels() {
    console.log('🚢 Loading vessels...');

    fetchData('/api/vessels')
        .then(data => {
            const tbody = document.getElementById('vesselsBody');
            if (!tbody) return;

            if (!data?.success || !data.vessels?.length) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:rgba(255,255,255,0.2);">📭 لا توجد مراكب</td></tr>`;
                return;
            }

            let html = '';
            data.vessels.forEach((v, i) => {
                html += `
                    <tr>
                        <td>${i + 1}</td>
                        <td><strong>${v.name || '-'}</strong></td>
                        <td><span class="status ${v.stat === 'صالح' ? 'success' : v.stat === 'معطب' ? 'danger' : 'warning'}">${v.stat || 'صالح'}</span></td>
                        <td>${v.region || '-'}</td>
                        <td>${v.supp || '-'}</td>
                        <td>
                            <button class="btn-sm btn-edit" onclick="editVessel('${v._id}')">✏️</button>
                            <button class="btn-sm btn-delete" onclick="deleteVessel('${v._id}')">🗑️</button>
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        });
}

// ============================================================
// 🔧 MAINTENANCE
// ============================================================

function loadMaintenance() {
    console.log('🔧 Loading maintenance...');

    fetchData('/api/maintenance')
        .then(data => {
            const tbody = document.getElementById('maintenanceBody');
            if (!tbody) return;

            if (!data?.success || !data.maintenance?.length) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:rgba(255,255,255,0.2);">📭 لا توجد سجلات</td></tr>`;
                return;
            }

            let html = '';
            data.maintenance.forEach((r, i) => {
                html += `
                    <tr>
                        <td>${i + 1}</td>
                        <td><strong>${r.vesselName || '-'}</strong></td>
                        <td>${r.type || '-'}</td>
                        <td>${r.technician || '-'}</td>
                        <td>${r.cost || 0} د.ت</td>
                        <td><span class="status ${r.status === 'مكتملة' ? 'success' : r.status === 'قيد الإنجاز' ? 'warning' : 'danger'}">${r.status || 'قيد الإنجاز'}</span></td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        });
}

// ============================================================
// 👥 USERS
// ============================================================

function loadUsers() {
    console.log('👤 Loading users...');

    fetchData('/api/users')
        .then(data => {
            const tbody = document.getElementById('usersBody');
            if (!tbody) return;

            if (!data?.success || !data.users?.length) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:rgba(255,255,255,0.2);">📭 لا توجد مستخدمين</td></tr>`;
                return;
            }

            let html = '';
            data.users.forEach(u => {
                html += `
                    <tr>
                        <td><strong>${u.name || '-'}</strong></td>
                        <td>${u.email || '-'}</td>
                        <td><span class="role">${u.role || 'مشاهد'}</span></td>
                        <td>${u.isActive ? '✅ نشط' : '❌ معطل'}</td>
                        <td>
                            <button class="btn-sm btn-edit" onclick="editUser('${u._id}')">✏️</button>
                            <button class="btn-sm btn-delete" onclick="deleteUser('${u._id}')">🗑️</button>
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        });
}

// ============================================================
// 🤖 AI ASSISTANT
// ============================================================

function initAIAssistant() {
    console.log('🤖 AI Assistant initialized');
}

async function askAI() {
    // AI logic here
}

// ============================================================
// 🚀 INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Application initializing...');

    const user = getUser();

    if (user) {
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        updateUserDisplay();
        loadPage('dashboard');
        console.log('✅ Session restored for:', user.name);
    } else {
        document.getElementById('loginOverlay').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
        setUser(null);
    }

    const username = document.getElementById('username');
    const password = document.getElementById('password');

    if (password) {
        password.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                doLogin();
            }
        });
    }

    if (username) {
        username.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && password) {
                password.focus();
            }
        });
    }

    console.log('✅ Marine System ready');
    console.log('🔐 Tokens stored in HttpOnly Cookies (secure)');
});

// ============================================================
// 🌐 GLOBAL EXPOSURE
// ============================================================

window.doLogin = doLogin;
window.handleLogin = handleLogin;
window.doLogout = doLogout;
window.showPage = showPage;
window.toggleSidebar = toggleSidebar;
window.refreshAllPages = refreshAllPages;
window.loadPage = loadPage;

console.log('✅ app.js v15.0 - Secure Edition loaded');
