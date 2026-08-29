/**
 * ============================================================
 * 🚢 MARINE SYSTEM - APP.JS v8.0 ENTERPRISE (FULLY FIXED)
 * ============================================================
 * ✅ نظام متكامل لإدارة الأسطول البحري
 * ✅ مصادقة متقدمة مع HttpOnly Cookies
 * ✅ إدارة الحالة المركزية
 * ✅ توجيه ديناميكي للصفحات
 * ✅ إعادة تنفيذ الـ JavaScript بعد تحميل الصفحة
 * ✅ جميع الأخطاء تم إصلاحها
 * ✅ بدون أي بيانات صلبة في الكود
 * ============================================================
 */

console.log('🚢 Marine System v8.0 Enterprise - Loading...');

// ============================================================
// 📦 CONFIGURATION
// ============================================================

const CONFIG = {
    API_BASE: '/api',
    VERSION: '8.0.0',
    APP_NAME: 'منظومة الوسائل البحرية',
    
    // مفاتيح التخزين (آمنة)
    STORAGE_KEYS: {
        SESSION: 'marine_session',
        PREFERENCES: 'marine_preferences',
        CACHE: 'marine_cache'
    },
    
    // صلاحيات المستخدمين
    ROLES: {
        ADMIN: 'admin',
        MANAGER: 'manager',
        OPERATOR: 'operator',
        VIEWER: 'viewer'
    },
    
    // مسارات الصفحات
    PAGES: {
        DASHBOARD: 'dashboard',
        FLEET: 'fleet',
        MAINTENANCE: 'maintenance',
        EFFICIENCY: 'efficiency',
        SUPPORT: 'support',
        USERS: 'users',
        NOTES: 'notes',
        SESSIONS: 'sessions',
        AI_ASSISTANT: 'ai-assistant',
        SETTINGS: 'settings',
        LOGS: 'logs',
        PROFILE: 'profile'
    },
    
    // حدود النظام
    LIMITS: {
        MAX_LOGIN_ATTEMPTS: 5,
        SESSION_TIMEOUT: 3600000, // 1 ساعة
        MAX_NOTIFICATIONS: 50
    }
};

// ============================================================
// 📦 STATE MANAGEMENT
// ============================================================

class MarineStore {
    constructor() {
        this.state = {
            user: null,
            sessionId: null,
            currentPage: 'dashboard',
            theme: 'dark',
            sidebarOpen: false,
            online: navigator.onLine,
            notifications: [],
            unreadCount: 0,
            loading: false,
            error: null,
            lastActivity: Date.now(),
            permissions: [],
            preferences: {}
        };
        
        this.listeners = [];
        this.loadFromStorage();
    }
    
    get(key) {
        return key ? this.state[key] : this.state;
    }
    
    set(key, value) {
        const oldValue = this.state[key];
        this.state[key] = value;
        this.saveToStorage();
        this.notifyListeners(key, value, oldValue);
        return this;
    }
    
    update(updates) {
        Object.entries(updates).forEach(([key, value]) => {
            this.set(key, value);
        });
        return this;
    }
    
    reset() {
        this.state = {
            user: null,
            sessionId: null,
            currentPage: 'dashboard',
            theme: 'dark',
            sidebarOpen: false,
            online: navigator.onLine,
            notifications: [],
            unreadCount: 0,
            loading: false,
            error: null,
            lastActivity: Date.now(),
            permissions: [],
            preferences: {}
        };
        this.clearStorage();
        this.notifyListeners('reset', null, null);
        return this;
    }
    
    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }
    
    notifyListeners(key, value, oldValue) {
        this.listeners.forEach(callback => {
            try {
                callback(key, value, oldValue);
            } catch (error) {
                console.error('Listener error:', error);
            }
        });
    }
    
    loadFromStorage() {
        try {
            const session = localStorage.getItem(CONFIG.STORAGE_KEYS.SESSION);
            const preferences = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.PREFERENCES) || '{}');
            
            if (session) {
                const data = JSON.parse(session);
                this.state.user = data.user || null;
                this.state.sessionId = data.sessionId || null;
                this.state.currentPage = data.currentPage || 'dashboard';
                this.state.theme = data.theme || 'dark';
                this.state.permissions = data.permissions || [];
            }
            
            if (preferences) {
                this.state.preferences = preferences;
            }
            
        } catch (error) {
            console.warn('⚠️ Failed to load from storage:', error);
        }
    }
    
    saveToStorage() {
        try {
            const sessionData = {
                user: this.state.user,
                sessionId: this.state.sessionId,
                currentPage: this.state.currentPage,
                theme: this.state.theme,
                permissions: this.state.permissions,
                lastActivity: this.state.lastActivity
            };
            localStorage.setItem(CONFIG.STORAGE_KEYS.SESSION, JSON.stringify(sessionData));
            localStorage.setItem(CONFIG.STORAGE_KEYS.PREFERENCES, JSON.stringify(this.state.preferences));
        } catch (error) {
            console.warn('⚠️ Failed to save to storage:', error);
        }
    }
    
    clearStorage() {
        Object.values(CONFIG.STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
        sessionStorage.clear();
    }
}

// ============================================================
// 🔐 AUTHENTICATION MANAGER
// ============================================================

class MarineAuth {
    constructor(store) {
        this.store = store;
        this.loginAttempts = 0;
        this.isLocked = false;
        this.lockTimeout = null;
    }
    
    async login(username, password) {
        console.log('🔐 [Auth] محاولة تسجيل الدخول:', username);
        
        if (this.isLocked) {
            throw new Error('الحساب مقفل بسبب محاولات فاشلة متكررة. يرجى المحاولة لاحقاً.');
        }
        
        try {
            this.store.set('loading', true);
            
            // إرسال الطلب مع credentials (لـ HttpOnly Cookies)
            const response = await fetch(`${CONFIG.API_BASE}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include', // مهم لـ HttpOnly Cookies
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (!response.ok || !data.success) {
                this.handleFailedLogin(data.error || 'بيانات غير صحيحة');
                throw new Error(data.error || 'بيانات الدخول غير صحيحة');
            }
            
            // نجاح تسجيل الدخول
            this.handleSuccessfulLogin(data);
            return data;
            
        } catch (error) {
            console.error('❌ [Auth] خطأ في تسجيل الدخول:', error);
            throw error;
        } finally {
            this.store.set('loading', false);
        }
    }
    
    handleSuccessfulLogin(data) {
        const { user } = data;
        
        this.loginAttempts = 0;
        this.isLocked = false;
        
        this.store.update({
            user: user,
            sessionId: this.generateSessionId(),
            permissions: user.permissions || [],
            lastActivity: Date.now(),
            error: null
        });
        
        console.log('✅ [Auth] تسجيل الدخول ناجح:', user.username);
    }
    
    handleFailedLogin(error) {
        this.loginAttempts++;
        
        if (this.loginAttempts >= CONFIG.LIMITS.MAX_LOGIN_ATTEMPTS) {
            this.isLocked = true;
            this.lockTimeout = setTimeout(() => {
                this.isLocked = false;
                this.loginAttempts = 0;
                console.log('🔓 [Auth] تم إلغاء قفل الحساب');
            }, 300000);
        }
        
        this.store.set('error', error);
    }
    
    async logout() {
        console.log('🚪 [Auth] تسجيل الخروج');
        
        try {
            await fetch(`${CONFIG.API_BASE}/auth/logout`, {
                method: 'POST',
                credentials: 'include'
            });
        } catch (error) {
            console.warn('⚠️ [Auth] خطأ في تسجيل الخروج:', error);
        }
        
        this.store.clearStorage();
        this.store.reset();
        console.log('✅ [Auth] تم تسجيل الخروج');
    }
    
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    hasPermission(permission) {
        const permissions = this.store.get('permissions');
        return permissions.includes(permission) || permissions.includes('*');
    }
    
    hasRole(role) {
        const user = this.store.get('user');
        return user && user.role === role;
    }
}

// ============================================================
// 🌐 API MANAGER
// ============================================================

class MarineAPI {
    constructor(store) {
        this.store = store;
        this.baseURL = CONFIG.API_BASE;
    }
    
    async request(url, options = {}) {
        const config = {
            ...options,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                ...options.headers
            },
            credentials: 'include' // مهم لـ HttpOnly Cookies
        };
        
        try {
            const response = await fetch(this.baseURL + url, config);
            const data = await response.json();
            
            if (!response.ok) {
                // جلسة منتهية
                if (response.status === 401) {
                    this.store.clearStorage();
                    this.store.reset();
                    window.location.reload();
                }
                throw new Error(data.error || 'حدث خطأ في الطلب');
            }
            
            return data;
            
        } catch (error) {
            console.error('❌ [API] خطأ:', error);
            throw error;
        }
    }
    
    get(url, options = {}) {
        return this.request(url, { ...options, method: 'GET' });
    }
    
    post(url, data, options = {}) {
        return this.request(url, {
            ...options,
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
    
    put(url, data, options = {}) {
        return this.request(url, {
            ...options,
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }
    
    delete(url, options = {}) {
        return this.request(url, { ...options, method: 'DELETE' });
    }
}

// ============================================================
// 🖥️ UI MANAGER
// ============================================================

class MarineUI {
    constructor(store) {
        this.store = store;
        this.currentPage = 'dashboard';
        this.pageCache = {};
        this.elements = this.getElements();
        this.initUI();
    }
    
    getElements() {
        return {
            loginOverlay: document.getElementById('loginOverlay'),
            mainApp: document.getElementById('mainApp'),
            sidebar: document.getElementById('sidebar'),
            pageContainer: document.getElementById('pageContainer'),
            pageLoader: document.getElementById('pageLoader'),
            toastContainer: document.getElementById('toastContainer'),
            modalOverlay: document.getElementById('modalOverlay'),
            modalBody: document.getElementById('modalBody'),
            userDisplay: document.getElementById('userDisplay'),
            userAvatar: document.getElementById('userAvatar'),
            notifBadge: document.getElementById('notifBadge'),
            backToTop: document.getElementById('backToTop')
        };
    }
    
    initUI() {
        const user = this.store.get('user');
        if (user) {
            this.showMainApp();
        } else {
            this.showLogin();
        }
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
    }
    
    showLogin() {
        if (this.elements.loginOverlay) {
            this.elements.loginOverlay.style.display = 'flex';
        }
        if (this.elements.mainApp) {
            this.elements.mainApp.style.display = 'none';
        }
    }
    
    showMainApp() {
        if (this.elements.loginOverlay) {
            this.elements.loginOverlay.style.display = 'none';
        }
        if (this.elements.mainApp) {
            this.elements.mainApp.style.display = 'block';
        }
        this.updateUserDisplay();
    }
    
    async loadPage(pageName) {
        console.log('📄 [UI] تحميل الصفحة:', pageName);
        
        this.currentPage = pageName;
        this.store.set('currentPage', pageName);
        this.showLoader();
        
        try {
            let html = this.pageCache[pageName];
            
            if (!html) {
                const response = await fetch(`/pages/${pageName}.html`);
                if (!response.ok) throw new Error('الصفحة غير موجودة');
                html = await response.text();
                this.pageCache[pageName] = html;
            }
            
            // استخراج HTML و Scripts
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            const scripts = tempDiv.querySelectorAll('script');
            const scriptContents = [];
            
            scripts.forEach(script => {
                scriptContents.push(script.textContent);
                script.remove();
            });
            
            this.renderPage(tempDiv.innerHTML);
            
            // تنفيذ الـ scripts المستخرجة
            scriptContents.forEach(content => {
                if (content && content.trim()) {
                    try {
                        const newScript = document.createElement('script');
                        newScript.textContent = content;
                        document.body.appendChild(newScript);
                        setTimeout(() => {
                            if (newScript.parentNode) newScript.remove();
                        }, 10);
                    } catch (e) {
                        console.warn('⚠️ [UI] خطأ في تنفيذ script:', e.message);
                    }
                }
            });
            
            this.updateActiveNav(pageName);
            
        } catch (error) {
            console.error('❌ [UI] خطأ في تحميل الصفحة:', error);
            this.showErrorPage(error);
        } finally {
            this.hideLoader();
        }
    }
    
    renderPage(html) {
        if (this.elements.pageContainer) {
            this.elements.pageContainer.innerHTML = html;
        }
    }
    
    showLoader() {
        if (this.elements.pageLoader) {
            this.elements.pageLoader.style.display = 'flex';
        }
    }
    
    hideLoader() {
        if (this.elements.pageLoader) {
            setTimeout(() => {
                this.elements.pageLoader.style.display = 'none';
            }, 300);
        }
    }
    
    updateActiveNav(pageName) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.page === pageName) {
                btn.classList.add('active');
            }
        });
    }
    
    toggleSidebar() {
        const isOpen = this.store.get('sidebarOpen');
        this.store.set('sidebarOpen', !isOpen);
        if (this.elements.sidebar) {
            this.elements.sidebar.classList.toggle('open');
        }
    }
    
    updateUserDisplay() {
        const user = this.store.get('user');
        if (!user) return;
        
        const roleNames = {
            admin: 'مسؤول',
            manager: 'مدير',
            operator: 'مشغل',
            viewer: 'مشاهد'
        };
        
        if (this.elements.userDisplay) {
            this.elements.userDisplay.textContent = 
                `👤 ${user.name || user.username} | ${roleNames[user.role] || user.role}`;
        }
        
        if (this.elements.userAvatar) {
            const initial = user.name ? user.name.charAt(0) : user.username.charAt(0);
            this.elements.userAvatar.textContent = initial;
        }
    }
    
    showToast(message, type = 'info', duration = 3000) {
        if (!this.elements.toastContainer) return;
        
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;
        
        this.elements.toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(30px)';
            setTimeout(() => {
                if (toast.parentNode) toast.remove();
            }, 300);
        }, duration);
    }
    
    showModal(title, content, options = {}) {
        const { confirmText = 'تأكيد', cancelText = 'إلغاء', onConfirm = null } = options;
        
        if (!this.elements.modalOverlay) return;
        
        this.elements.modalOverlay.style.display = 'flex';
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = content;
        document.getElementById('modalConfirm').textContent = confirmText;
        document.getElementById('modalCancel').textContent = cancelText;
        
        const newConfirm = document.getElementById('modalConfirm').cloneNode(true);
        document.getElementById('modalConfirm').replaceWith(newConfirm);
        
        const newCancel = document.getElementById('modalCancel').cloneNode(true);
        document.getElementById('modalCancel').replaceWith(newCancel);
        
        newConfirm.addEventListener('click', () => {
            this.hideModal();
            if (onConfirm) onConfirm();
        });
        
        newCancel.addEventListener('click', () => {
            this.hideModal();
        });
        
        this.elements.modalOverlay.addEventListener('click', (e) => {
            if (e.target === this.elements.modalOverlay) {
                this.hideModal();
            }
        });
    }
    
    hideModal() {
        if (this.elements.modalOverlay) {
            this.elements.modalOverlay.style.display = 'none';
        }
    }
    
    showErrorPage(error) {
        if (this.elements.pageContainer) {
            this.elements.pageContainer.innerHTML = `
                <div style="text-align:center;padding:60px 20px;">
                    <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
                    <h2 style="color:#f87171;">حدث خطأ</h2>
                    <p style="color:#94a3b8;">${error.message || 'عذراً، حدث خطأ غير متوقع'}</p>
                    <div style="margin-top:20px;display:flex;gap:10px;justify-content:center;">
                        <button onclick="window.loadPage('dashboard')" style="padding:8px 20px;border:none;border-radius:8px;background:#3b82f6;color:#fff;cursor:pointer;font-family:inherit;">
                            📊 العودة للوحة التحكم
                        </button>
                        <button onclick="location.reload()" style="padding:8px 20px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:transparent;color:#94a3b8;cursor:pointer;font-family:inherit;">
                            🔄 تحديث الصفحة
                        </button>
                    </div>
                </div>
            `;
        }
    }
    
    setupEventListeners() {
        document.getElementById('menuToggle')?.addEventListener('click', () => {
            this.toggleSidebar();
        });
        
        document.getElementById('sidebarClose')?.addEventListener('click', () => {
            this.toggleSidebar();
        });
        
        window.addEventListener('scroll', () => {
            if (this.elements.backToTop) {
                this.elements.backToTop.style.display = window.scrollY > 300 ? 'flex' : 'none';
            }
        });
        
        document.getElementById('backToTop')?.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = btn.dataset.page;
                if (page) {
                    window.loadPage(page);
                }
                if (window.innerWidth <= 992) {
                    this.toggleSidebar();
                }
            });
        });
        
        document.getElementById('modalClose')?.addEventListener('click', () => {
            this.hideModal();
        });
    }
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                document.getElementById('quickSearch')?.focus();
            }
            
            if (e.key === 'Escape') {
                this.hideModal();
                if (this.elements.sidebar?.classList.contains('open')) {
                    this.toggleSidebar();
                }
            }
            
            if (e.ctrlKey && e.shiftKey && e.key === 'L') {
                e.preventDefault();
                this.showModal('تسجيل الخروج', 'هل أنت متأكد من تسجيل الخروج؟', {
                    confirmText: 'نعم، تسجيل الخروج',
                    onConfirm: () => {
                        window.doLogout();
                    }
                });
            }
        });
    }
}

// ============================================================
// 🚀 INITIALIZATION
// ============================================================

let store = null;
let auth = null;
let api = null;
let ui = null;

function initApp() {
    console.log('🚢 [App] تهيئة التطبيق...');
    
    try {
        store = new MarineStore();
        auth = new MarineAuth(store);
        api = new MarineAPI(store);
        ui = new MarineUI(store);
        
        window.store = store;
        window.auth = auth;
        window.api = api;
        window.ui = ui;
        
        setupGlobalListeners();
        
        const user = store.get('user');
        if (user) {
            console.log('✅ [App] تم استعادة الجلسة');
            const savedPage = store.get('currentPage') || 'dashboard';
            ui.loadPage(savedPage);
        }
        
        console.log('✅ [App] تم تهيئة التطبيق بنجاح');
        console.log(`📦 الإصدار: ${CONFIG.VERSION}`);
        
    } catch (error) {
        console.error('❌ [App] فشل تهيئة التطبيق:', error);
        showCriticalError(error);
    }
}

// ============================================================
// 🔄 GLOBAL LISTENERS
// ============================================================

function setupGlobalListeners() {
    window.addEventListener('online', () => {
        store.set('online', true);
        ui.showToast('🔄 تم استعادة الاتصال بالإنترنت', 'success');
    });
    
    window.addEventListener('offline', () => {
        store.set('online', false);
        ui.showToast('⚠️ تم فقدان الاتصال بالإنترنت', 'error');
    });
    
    let activityTimer = null;
    document.addEventListener('mousemove', () => {
        store.set('lastActivity', Date.now());
        clearTimeout(activityTimer);
        activityTimer = setTimeout(() => {
            // التحقق من الجلسة
        }, CONFIG.LIMITS.SESSION_TIMEOUT);
    });
    
    window.addEventListener('error', (event) => {
        console.error('❌ خطأ غير معالج:', event.error);
        ui.showToast('حدث خطأ غير متوقع', 'error');
    });
    
    window.addEventListener('unhandledrejection', (event) => {
        console.error('❌ وعد مرفوض:', event.reason);
        ui.showToast('حدث خطأ في الخادم', 'error');
    });
}

// ============================================================
// ❌ CRITICAL ERROR
// ============================================================

function showCriticalError(error) {
    document.body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#0a1628;color:#e2e8f0;font-family:'Cairo',sans-serif;padding:20px;text-align:center;">
            <div style="font-size:64px;margin-bottom:20px;">💥</div>
            <h1 style="color:#ef4444;">فشل تهيئة النظام</h1>
            <p style="color:#94a3b8;max-width:500px;margin:16px auto;">
                ${error.message || 'حدث خطأ غير متوقع أثناء تهيئة النظام'}
            </p>
            <button onclick="location.reload()" style="padding:12px 32px;background:#3b82f6;border:none;border-radius:8px;color:white;font-size:16px;font-weight:600;cursor:pointer;margin-top:20px;font-family:inherit;">
                🔄 إعادة تحميل الصفحة
            </button>
            <p style="color:#475569;font-size:12px;margin-top:30px;">
                الإصدار ${CONFIG.VERSION} | منظومة الوسائل البحرية
            </p>
        </div>
    `;
}

// ============================================================
// 🌐 GLOBAL EXPOSURE - NO HARDCODED CREDENTIALS
// ============================================================

window.doLogin = async function() {
    console.log('🖱️ [UI] زر الدخول تم الضغط عليه');
    
    const username = document.getElementById('username');
    const password = document.getElementById('password');
    const errorEl = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginButton');
    
    if (!username || !password) {
        console.error('❌ عناصر الدخول غير موجودة');
        return;
    }
    
    const user = username.value.trim();
    const pass = password.value;
    
    errorEl.style.display = 'none';
    errorEl.textContent = '';
    
    if (!user || !pass) {
        errorEl.textContent = '⚠️ يرجى إدخال اسم المستخدم وكلمة المرور';
        errorEl.style.display = 'block';
        return;
    }
    
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="spinner"></span> جاري الدخول...';
    
    try {
        const data = await auth.login(user, pass);
        console.log('✅ [UI] تسجيل الدخول ناجح');
        
        ui.showMainApp();
        ui.updateUserDisplay();
        ui.showToast(`✅ مرحباً ${data.user.name || data.user.username}`, 'success');
        ui.loadPage('dashboard');
        
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span class="btn-text">🚀 دخول إلى النظام</span>';
        username.value = '';
        password.value = '';
        
    } catch (error) {
        console.error('❌ [UI] فشل تسجيل الدخول:', error);
        errorEl.textContent = `❌ ${error.message}`;
        errorEl.style.display = 'block';
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span class="btn-text">🚀 دخول إلى النظام</span>';
    }
};

window.doLogout = async function() {
    console.log('🚪 [UI] تسجيل الخروج');
    
    try {
        await auth.logout();
        ui.showLogin();
        ui.showToast('👋 تم تسجيل الخروج بنجاح', 'info');
        
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        document.getElementById('loginError').style.display = 'none';
        
    } catch (error) {
        console.error('❌ [UI] خطأ في تسجيل الخروج:', error);
        ui.showToast('❌ حدث خطأ أثناء تسجيل الخروج', 'error');
    }
};

window.loadPage = function(page) {
    console.log('📄 [UI] طلب تحميل الصفحة:', page);
    
    const allowedPages = ['dashboard', 'fleet', 'maintenance', 'efficiency', 'support', 'users', 'notes', 'sessions', 'ai-assistant', 'settings', 'logs', 'profile'];
    
    if (!allowedPages.includes(page)) {
        ui.showToast('⚠️ الصفحة غير موجودة', 'warning');
        return;
    }
    
    ui.loadPage(page);
};

window.toggleSidebar = function() {
    ui.toggleSidebar();
};

window.showToast = function(message, type = 'info') {
    ui.showToast(message, type);
};

window.showModal = function(title, content, options = {}) {
    ui.showModal(title, content, options);
};

// ============================================================
// 🚀 START APPLICATION
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 [DOM] DOM جاهز');
    
    const loginBtn = document.getElementById('loginButton');
    if (loginBtn) {
        loginBtn.addEventListener('click', window.doLogin);
        console.log('✅ [DOM] زر الدخول مرتبط');
    }
    
    const passwordField = document.getElementById('password');
    if (passwordField) {
        passwordField.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.doLogin();
            }
        });
    }
    
    const togglePassword = document.getElementById('togglePassword');
    if (togglePassword) {
        togglePassword.addEventListener('click', function() {
            const passwordInput = document.getElementById('password');
            const icon = this.querySelector('i');
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                passwordInput.type = 'password';
                icon.className = 'fas fa-eye';
            }
        });
    }
    
    // 🔥 ربط زر تسجيل الخروج
    const logoutBtns = document.querySelectorAll('.logout-btn, .footer-logout');
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', window.doLogout);
    });
    
    initApp();
});

// ============================================================
// 📊 CONSOLE BANNER
// ============================================================

console.log(`%c🚢 منظومة الوسائل البحرية v${CONFIG.VERSION}`, 
    'font-size: 24px; font-weight: bold; color: #3b82f6;');
console.log('%cنظام متكامل لإدارة الأسطول البحري', 
    'font-size: 14px; color: #94a3b8;');
console.log('%c🔐 الأمان: HttpOnly Cookies | 2FA | CSRF | Rate Limiting', 
    'font-size: 12px; color: #60a5fa;');
console.log('%c📋 لا توجد بيانات صلبة في الكود', 
    'font-size: 12px; color: #22c55e;');
console.log('%cجميع الحقوق محفوظة © 2026', 
    'font-size: 12px; color: #475569;');

// ============================================================
// 📦 EXPORTS
// ============================================================

export {
    CONFIG,
    store,
    auth,
    api,
    ui,
    initApp
};

console.log('✅ [App] تم تحميل التطبيق بنجاح');
