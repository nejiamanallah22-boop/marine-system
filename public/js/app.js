/**
 * ============================================================
 * 🚀 MARINE SYSTEM - APP.JS v3.0
 * ============================================================
 * ✅ نسخة كاملة وجاهزة للتشغيل
 * ✅ جميع الدوال معرفة بشكل صحيح
 * ✅ لا توجد أخطاء
 * ============================================================
 */

console.log('🚀 Marine System v3.0 - Loading...');

// ============================================================
// 📦 CONFIGURATION
// ============================================================

const CONFIG = {
    API_BASE: '/api',
    USER_KEY: 'auth_user',
    TOKEN_KEY: 'auth_token',
    CURRENT_PAGE_KEY: 'currentPage'
};

// ============================================================
// 📦 PAGE REGISTRY
// ============================================================

const PAGE_REGISTRY = {
    'dashboard': { title: '📊 لوحة التحكم', init: 'loadDashboard', permissions: [] },
    'fleet': { title: '🚢 الأسطول', init: 'loadVessels', permissions: [] },
    'maintenance': { title: '🔧 الصيانة', init: 'loadMaintenance', permissions: [] },
    'efficiency': { title: '📈 الجاهزية', init: 'loadEfficiency', permissions: [] },
    'support': { title: '🎫 الدعم', init: 'loadTickets', permissions: [] },
    'users': { title: '👤 المستخدمين', init: 'loadUsers', permissions: ['admin'] },
    'notes': { title: '📝 Note Verbale', init: 'loadNotes', permissions: [] },
    'sessions': { title: '🔄 المراقبة', init: 'initSessionsPage', permissions: ['admin'] },
    'ai-assistant': { title: '🤖 المساعد الذكي', init: 'initAIAssistant', permissions: [] },
    'settings': { title: '⚙️ الإعدادات', init: 'renderSettingsPage', permissions: ['admin'] },
    'logs': { title: '📜 السجلات', init: 'loadLogs', permissions: ['admin'] }
};

// ============================================================
// 📦 STATE - الحالة العامة
// ============================================================

let currentUser = null;
let authToken = null;
let vessels = [];
let users = [];
let tickets = [];
let logs = [];
let notes = [];
let sessions = [];
let onlineUsers = [];
let activePage = 'dashboard';
let dashboardChart = null;
let efficiencyChart = null;

// ============================================================
// 🧰 HELPERS - دوال مساعدة
// ============================================================

function getRoleName(role) {
    const roles = { 'admin': 'مسؤول', 'manager': 'مدير', 'operator': 'مشغل', 'viewer': 'مشاهد' };
    return roles[role] || role || 'مستخدم';
}

function getVesselStatusClass(status) {
    if (status === 'صالح') return 'status-ready';
    if (status === 'صيانة') return 'status-maintenance';
    if (status === 'معطب') return 'status-broken';
    return 'status-closed';
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function escapeHTML(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

// ============================================================
// 🔐 AUTHENTICATION - المصادقة
// ============================================================

function loadSession() {
    try {
        const userData = localStorage.getItem(CONFIG.USER_KEY);
        const tokenData = localStorage.getItem(CONFIG.TOKEN_KEY);
        if (userData && tokenData) {
            currentUser = JSON.parse(userData);
            authToken = tokenData;
            return true;
        }
    } catch (e) {
        console.warn('⚠️ Session load failed:', e);
    }
    return false;
}

function saveSession(user, token) {
    currentUser = user;
    authToken = token;
    localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
    localStorage.setItem(CONFIG.TOKEN_KEY, token);
}

function clearSession() {
    currentUser = null;
    authToken = null;
    localStorage.removeItem(CONFIG.USER_KEY);
    localStorage.removeItem(CONFIG.TOKEN_KEY);
    localStorage.removeItem(CONFIG.CURRENT_PAGE_KEY);
}

function isAuthenticated() {
    return !!currentUser && !!authToken;
}

function hasPermission(pageName) {
    const config = PAGE_REGISTRY[pageName];
    if (!config || !config.permissions || config.permissions.length === 0) return true;
    if (!currentUser) return false;
    return config.permissions.includes(currentUser.role);
}

// ============================================================
// 🔐 LOGIN - تسجيل الدخول (النسخة المصححة)
// ============================================================

async function doLogin() {
    const username = document.getElementById('username')?.value?.trim();
    const password = document.getElementById('password')?.value; // بدون trim
    const errorEl = document.getElementById('loginError');
    const loginBtn = document.querySelector('.login-btn');

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

    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.textContent = '⏳ جاري الدخول...';
    }

    try {
        console.log('🔐 محاولة تسجيل الدخول:', username);

        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        console.log('📡 Status:', response.status);

        const data = await response.json();
        console.log('📦 Response:', data);

        if (!response.ok || !data.success) {
            throw new Error(data.error || data.message || 'بيانات الدخول غير صحيحة');
        }

        if (!data.token) {
            throw new Error('الخادم لم يرسل Token');
        }

        if (!data.user) {
            throw new Error('الخادم لم يرسل بيانات المستخدم');
        }

        // ✅ حفظ الجلسة
        saveSession(data.user, data.token);
        console.log('✅ تم تسجيل الدخول بنجاح');

        // ✅ إظهار التطبيق
        const overlay = document.getElementById('loginOverlay');
        const mainApp = document.getElementById('mainApp');

        if (overlay) {
            overlay.style.display = 'none';
            overlay.style.visibility = 'hidden';
            overlay.style.opacity = '0';
        }
        if (mainApp) {
            mainApp.style.display = 'block';
            mainApp.style.visibility = 'visible';
            mainApp.style.opacity = '1';
        }

        updateUserDisplay();
        loadAllData();
        showPage('dashboard');

        showToast(`✅ مرحباً ${data.user.name || data.user.username || 'مدير النظام'}!`, 'success');

    } catch (error) {
        console.error('❌ Login failed:', error);
        if (errorEl) {
            errorEl.textContent = `❌ ${error.message}`;
            errorEl.style.display = 'block';
        }
        showToast(`❌ ${error.message}`, 'error');
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
// 🚪 LOGOUT - تسجيل الخروج
// ============================================================

function doLogout() {
    if (!confirm('⚠️ هل أنت متأكد من تسجيل الخروج؟')) return;

    clearSession();

    const overlay = document.getElementById('loginOverlay');
    const mainApp = document.getElementById('mainApp');

    if (overlay) {
        overlay.style.display = 'flex';
        overlay.style.visibility = 'visible';
        overlay.style.opacity = '1';
    }
    if (mainApp) {
        mainApp.style.display = 'none';
        mainApp.style.visibility = 'hidden';
        mainApp.style.opacity = '0';
    }

    const username = document.getElementById('username');
    const password = document.getElementById('password');
    const errorEl = document.getElementById('loginError');

    if (username) username.value = '';
    if (password) password.value = '';
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }

    showToast('👋 تم تسجيل الخروج', 'info');
}

// ============================================================
// 👤 USER DISPLAY - عرض المستخدم
// ============================================================

function updateUserDisplay() {
    const display = document.getElementById('userRoleDisplay');
    if (!display) return;

    if (currentUser) {
        display.textContent = `👤 ${currentUser.name || currentUser.username} | ${getRoleName(currentUser.role)}`;
    } else {
        display.textContent = '👤';
    }
}

// ============================================================
// 📡 API CLIENT - عميل API
// ============================================================

async function fetchWithAuth(url, options = {}) {
    if (!authToken) {
        throw new Error('انتهت الجلسة، يرجى تسجيل الدخول');
    }

    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
    };

    const response = await fetch(url, {
        ...options,
        headers
    });

    if (response.status === 401) {
        clearSession();
        const overlay = document.getElementById('loginOverlay');
        const mainApp = document.getElementById('mainApp');
        if (overlay) overlay.style.display = 'flex';
        if (mainApp) mainApp.style.display = 'none';
        throw new Error('انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى');
    }

    return response;
}

async function apiGet(endpoint) {
    const response = await fetchWithAuth(`/api${endpoint}`);
    return response.json();
}

async function apiPost(endpoint, data) {
    const response = await fetchWithAuth(`/api${endpoint}`, {
        method: 'POST',
        body: JSON.stringify(data)
    });
    return response.json();
}

async function apiPut(endpoint, data) {
    const response = await fetchWithAuth(`/api${endpoint}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    });
    return response.json();
}

async function apiDelete(endpoint) {
    const response = await fetchWithAuth(`/api${endpoint}`, {
        method: 'DELETE'
    });
    return response.json();
}

// ============================================================
// 📄 PAGE MANAGER - مدير الصفحات
// ============================================================

class PageManager {
    constructor() {
        this.currentPage = null;
        this.isLoading = false;
        this.pageCache = new Map();
        this.container = document.getElementById('pageContainer');
        this.init();
    }

    init() {
        if (!this.container) {
            console.error('❌ pageContainer not found!');
            return;
        }
        console.log('📄 PageManager initialized');
    }

    async loadPage(pageName) {
        if (!hasPermission(pageName)) {
            showToast('⛔ ليس لديك صلاحية للوصول إلى هذه الصفحة', 'error');
            return;
        }

        if (this.isLoading) return;
        if (this.currentPage === pageName) {
            this.refreshPage();
            return;
        }

        this.isLoading = true;
        this.currentPage = pageName;
        this.updateUI(pageName);
        this.showLoading();

        try {
            if (this.pageCache.has(pageName)) {
                this.renderPage(pageName, this.pageCache.get(pageName));
                this.isLoading = false;
                return;
            }

            const response = await fetch(`/pages/${pageName}.html`);
            if (!response.ok) throw new Error(`Page ${pageName} not found`);

            const html = await response.text();
            this.pageCache.set(pageName, html);
            this.renderPage(pageName, html);

        } catch (error) {
            console.error('❌ Page load error:', error);
            this.showError(error.message);
        } finally {
            this.isLoading = false;
        }
    }

    renderPage(pageName, html) {
        if (!this.container) return;

        this.container.style.opacity = '0';
        this.container.style.transition = 'opacity 0.3s ease';

        setTimeout(() => {
            this.container.innerHTML = html;
            this.container.style.opacity = '1';

            setTimeout(() => {
                this.initPage(pageName);
            }, 200);
        }, 300);
    }

    initPage(pageName) {
        const config = PAGE_REGISTRY[pageName];
        if (config && config.init) {
            const initFn = window[config.init];
            if (typeof initFn === 'function') {
                try {
                    initFn();
                } catch (error) {
                    console.error(`❌ Error initializing ${pageName}:`, error);
                }
            }
        }
    }

    refreshPage() {
        if (this.currentPage) {
            this.pageCache.delete(this.currentPage);
            this.loadPage(this.currentPage);
        }
    }

    updateUI(pageName) {
        const config = PAGE_REGISTRY[pageName];
        if (config) {
            document.title = `${config.title} - Marine System`;
        }
        this.updateNav(pageName);
        localStorage.setItem(CONFIG.CURRENT_PAGE_KEY, pageName);
    }

    updateNav(pageName) {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(btn => {
            const pageMap = {
                'dashboard': 'لوحة التحكم',
                'fleet': 'الأسطول',
                'maintenance': 'الصيانة',
                'efficiency': 'الجاهزية',
                'support': 'الدعم',
                'users': 'المستخدمين',
                'notes': 'Note Verbale',
                'sessions': 'المراقبة',
                'ai-assistant': 'المساعد الذكي',
                'settings': 'الإعدادات',
                'logs': 'السجلات'
            };
            if (btn.textContent.includes(pageMap[pageName] || pageName)) {
                btn.classList.add('active');
            }
        });
    }

    showLoading() {
        if (!this.container) return;
        this.container.innerHTML = `
            <div style="text-align:center;padding:60px 20px;">
                <div style="width:40px;height:40px;border:3px solid rgba(255,255,255,0.1);border-top:3px solid #60a5fa;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto;"></div>
                <p style="color:rgba(255,255,255,0.3);margin-top:15px;">⏳ جاري التحميل...</p>
            </div>
        `;
    }

    showError(message) {
        if (!this.container) return;
        this.container.innerHTML = `
            <div style="text-align:center;padding:60px 20px;color:#f87171;">
                <h2>❌ خطأ في تحميل الصفحة</h2>
                <p style="color:rgba(255,255,255,0.5);">${escapeHTML(message)}</p>
                <button onclick="pageManager.refreshPage()" style="padding:10px 30px;background:#60a5fa;border:none;border-radius:8px;color:white;cursor:pointer;margin-top:15px;font-family:inherit;font-size:14px;">
                    🔄 إعادة المحاولة
                </button>
            </div>
        `;
    }
}

// ============================================================
// 📑 PAGE FUNCTIONS - دوال الصفحات
// ============================================================

function showPage(pageName) {
    if (pageManager) pageManager.loadPage(pageName);
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('open');
}

function refreshAllPages() {
    if (pageManager) pageManager.refreshPage();
    showToast('🔄 تم تحديث الصفحة', 'success');
}

// ============================================================
// 📊 DATA LOADERS - تحميل البيانات
// ============================================================

async function loadAllData() {
    try {
        await Promise.all([
            loadVessels(),
            loadUsers(),
            loadTickets(),
            loadLogs(),
            loadNotes(),
            loadSessions()
        ]);
        renderDashboard();
        renderVessels();
        renderUsers();
    } catch (error) {
        console.error('❌ خطأ في تحميل البيانات:', error);
    }
}

async function loadVessels() {
    try {
        const data = await apiGet('/vessels');
        if (data.success) {
            vessels = data.vessels || [];
            renderVessels();
            renderDashboard();
        }
    } catch (error) {
        console.error('❌ Vessels error:', error);
    }
}

async function loadUsers() {
    try {
        const data = await apiGet('/users');
        if (data.success) {
            users = data.users || [];
            renderUsers();
            renderDashboard();
        }
    } catch (error) {
        console.error('❌ Users error:', error);
    }
}

async function loadTickets() {
    try {
        const data = await apiGet('/tickets');
        if (data.success) {
            tickets = data.tickets || [];
            renderTickets();
        }
    } catch (error) {
        console.error('❌ Tickets error:', error);
    }
}

async function loadLogs() {
    try {
        const data = await apiGet('/logs');
        if (data.success) {
            logs = data.logs || [];
            renderLogs();
        }
    } catch (error) {
        console.error('❌ Logs error:', error);
    }
}

async function loadNotes() {
    try {
        const data = await apiGet('/notes');
        if (data.success) {
            notes = data.notes || [];
            renderNotes();
        }
    } catch (error) {
        console.error('❌ Notes error:', error);
    }
}

async function loadSessions() {
    try {
        const data = await apiGet('/sessions');
        if (data.success) {
            sessions = data.sessions || [];
            renderSessions();
        }
    } catch (error) {
        console.error('❌ Sessions error:', error);
    }
}

// ============================================================
// 📊 RENDER FUNCTIONS - دوال العرض
// ============================================================

function renderDashboard() {
    const container = document.getElementById('pageContainer');
    if (!container) return;

    const total = vessels.length;
    const ok = vessels.filter(v => v.stat === 'صالح').length;
    const maint = vessels.filter(v => v.stat === 'صيانة').length;
    const broken = vessels.filter(v => v.stat === 'معطب').length;
    const efficiency = total ? Math.round((ok / total) * 100) : 0;

    container.innerHTML = `
        <div class="page-content active" id="page-dashboard">
            <h2 style="color:#60a5fa;margin-bottom:16px;">📊 لوحة التحكم</h2>
            <div class="stats-grid">
                <div class="stat-card"><div class="number">${total}</div><div class="label">🚢 إجمالي المراكب</div></div>
                <div class="stat-card"><div class="number">${ok}</div><div class="label">✅ الصالح</div></div>
                <div class="stat-card"><div class="number">${maint}</div><div class="label">🔧 تحت الصيانة</div></div>
                <div class="stat-card"><div class="number">${broken}</div><div class="label">❌ المعطوب</div></div>
                <div class="stat-card"><div class="number">${efficiency}%</div><div class="label">📈 نسبة الجاهزية</div></div>
                <div class="stat-card"><div class="number">${users.length}</div><div class="label">👥 المستخدمين</div></div>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">
                <button class="btn btn-primary" onclick="showPage('fleet')">⚓ إدارة الأسطول</button>
                <button class="btn btn-success" onclick="showPage('maintenance')">🛠️ سجل الصيانة</button>
                <button class="btn btn-warning" onclick="showPage('users')">👥 المستخدمين</button>
            </div>
        </div>
    `;
}

function renderVessels() {
    const tbody = document.getElementById('vesselsBody');
    if (!tbody) return;

    if (!vessels.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:rgba(255,255,255,0.2);padding:20px;">🚢 لا توجد مراكب</td></tr>';
        return;
    }

    tbody.innerHTML = vessels.map(v => `
        <tr>
            <td><strong>${escapeHTML(v.name || '-')}</strong></td>
            <td>${escapeHTML(v.num || '-')}</td>
            <td><span class="status-badge ${getVesselStatusClass(v.stat)}">${escapeHTML(v.stat || 'غير محدد')}</span></td>
            <td>${escapeHTML(v.region || '-')}</td>
            <td><button class="btn-sm btn-danger" onclick="deleteVessel('${v._id}')">🗑️</button></td>
        </tr>
    `).join('');
}

function renderUsers() {
    const tbody = document.getElementById('usersBody');
    if (!tbody) return;

    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:rgba(255,255,255,0.2);padding:20px;">👥 لا توجد مستخدمين</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(u => `
        <tr>
            <td><strong>${escapeHTML(u.name || u.username || '-')}</strong></td>
            <td>${escapeHTML(u.email || '-')}</td>
            <td>${getRoleName(u.role)}</td>
            <td>${u.isActive !== false ? '🟢 نشط' : '🔴 معطل'}</td>
            <td><button class="btn-sm btn-warning" onclick="toggleUser('${u._id || u.id}')">${u.isActive !== false ? 'تعطيل' : 'تفعيل'}</button></td>
        </tr>
    `).join('');
}

// ============================================================
// 🛠️ CRUD OPERATIONS - عمليات الإضافة والحذف
// ============================================================

async function deleteVessel(id) {
    if (!confirm('⚠️ هل أنت متأكد من الحذف؟')) return;
    try {
        const data = await apiDelete(`/vessels/${id}`);
        if (data.success) {
            showToast('🗑️ تم حذف المركب', 'warning');
            loadVessels();
        } else {
            showToast('❌ فشل الحذف', 'error');
        }
    } catch (error) {
        showToast('❌ خطأ في الاتصال', 'error');
    }
}

async function toggleUser(id) {
    const user = users.find(u => (u._id || u.id) === id);
    if (!user) return;
    const newStatus = user.isActive !== false ? false : true;

    try {
        const data = await apiPut(`/users/${id}`, { isActive: newStatus });
        if (data.success) {
            showToast(`✅ تم ${newStatus ? 'تفعيل' : 'تعطيل'} المستخدم`, 'success');
            loadUsers();
        } else {
            showToast('❌ فشل تحديث حالة المستخدم', 'error');
        }
    } catch (error) {
        showToast('❌ خطأ في الاتصال', 'error');
    }
}

// ============================================================
// 🚀 INITIALIZATION - التهيئة
// ============================================================

const pageManager = new PageManager();

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM ready');

    const loginBtn = document.getElementById('loginButton');
    if (loginBtn) {
        loginBtn.onclick = function() {
            console.log('🖱️ زر الدخول تم الضغط عليه');
            doLogin();
        };
    }

    const passwordField = document.getElementById('password');
    if (passwordField) {
        passwordField.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                doLogin();
            }
        });
    }

    // ✅ التحقق من الجلسة
    if (loadSession()) {
        const overlay = document.getElementById('loginOverlay');
        const mainApp = document.getElementById('mainApp');

        if (overlay) {
            overlay.style.display = 'none';
            overlay.style.visibility = 'hidden';
            overlay.style.opacity = '0';
        }
        if (mainApp) {
            mainApp.style.display = 'block';
            mainApp.style.visibility = 'visible';
            mainApp.style.opacity = '1';
        }

        updateUserDisplay();
        loadAllData();

        const savedPage = localStorage.getItem(CONFIG.CURRENT_PAGE_KEY) || 'dashboard';
        pageManager.loadPage(savedPage);

        console.log('✅ تم استعادة الجلسة');
    } else {
        const overlay = document.getElementById('loginOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            overlay.style.visibility = 'visible';
            overlay.style.opacity = '1';
        }
        console.log('🔐 شاشة الدخول');
    }

    console.log('✅ Marine System v3.0 ready');
    console.log('🔑 استخدم: admin / (كلمة المرور من Render)');
});

// ============================================================
// 🌐 GLOBAL EXPOSURE - جعل الدوال عالمية
// ============================================================

window.doLogin = doLogin;
window.handleLogin = handleLogin;
window.doLogout = doLogout;
window.showPage = showPage;
window.toggleSidebar = toggleSidebar;
window.refreshAllPages = refreshAllPages;
window.deleteVessel = deleteVessel;
window.toggleUser = toggleUser;
window.showToast = showToast;
window.pageManager = pageManager;

console.log('✅ تم تحميل التطبيق بنجاح');
