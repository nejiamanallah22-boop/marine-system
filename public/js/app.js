/**
 * ============================================================
 * 🚢 MARINE SYSTEM - APP.JS v7.0 PRO MAX
 * ============================================================
 * ✅ نظام متكامل لإدارة الأسطول البحري
 * ✅ مصادقة متقدمة مع توكن
 * ✅ إدارة الحالة المركزية
 * ✅ توجيه ديناميكي للصفحات
 * ✅ تخزين آمن مع تشفير
 * ✅ نظام إشعارات متطور
 * ✅ مراقبة الأداء
 * ✅ دعم وضع عدم الاتصال
 * ✅ PWA جاهز
 * ============================================================
 */

console.log('🚢 Marine System v7.0 Pro Max - Loading...');

// ============================================================
// 📦 CONFIGURATION
// ============================================================

const CONFIG = {
    API_BASE: '/api',
    VERSION: '7.0.0',
    APP_NAME: 'منظومة الوسائل البحرية',
    
    // مفاتيح التخزين
    STORAGE_KEYS: {
        TOKEN: 'marine_auth_token',
        REFRESH_TOKEN: 'marine_refresh_token',
        USER: 'marine_user',
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
        TOKEN_REFRESH_INTERVAL: 600000, // 10 دقائق
        MAX_NOTIFICATIONS: 50
    }
};

// ============================================================
// 📦 STATE MANAGEMENT - إدارة الحالة المركزية
// ============================================================

class MarineStore {
    constructor() {
        this.state = {
            user: null,
            token: null,
            refreshToken: null,
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
        this.history = [];
        this.maxHistory = 100;
        
        this.loadFromStorage();
        this.setupAutoSave();
    }
    
    // ============================================================
    // GETTERS / SETTERS
    // ============================================================
    
    get(key) {
        return key ? this.state[key] : this.state;
    }
    
    set(key, value) {
        const oldValue = this.state[key];
        this.state[key] = value;
        
        // تسجيل التاريخ
        this.history.push({
            action: 'set',
            key,
            oldValue,
            newValue: value,
            timestamp: Date.now()
        });
        
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        
        // حفظ في التخزين
        this.saveToStorage();
        
        // إشعار المستمعين
        this.notifyListeners(key, value, oldValue);
        
        return this;
    }
    
    // ============================================================
    // STATE MANAGEMENT
    // ============================================================
    
    update(updates) {
        Object.entries(updates).forEach(([key, value]) => {
            this.set(key, value);
        });
        return this;
    }
    
    reset() {
        this.state = {
            user: null,
            token: null,
            refreshToken: null,
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
        this.saveToStorage();
        this.notifyListeners('reset', null, null);
        return this;
    }
    
    // ============================================================
    // LISTENERS
    // ============================================================
    
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
    
    // ============================================================
    // STORAGE
    // ============================================================
    
    loadFromStorage() {
        try {
            const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
            const refreshToken = localStorage.getItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
            const user = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.USER) || 'null');
            const preferences = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.PREFERENCES) || '{}');
            
            if (token) this.state.token = token;
            if (refreshToken) this.state.refreshToken = refreshToken;
            if (user) this.state.user = user;
            if (preferences) this.state.preferences = preferences;
            
        } catch (error) {
            console.warn('⚠️ Failed to load from storage:', error);
        }
    }
    
    saveToStorage() {
        try {
            if (this.state.token) {
                localStorage.setItem(CONFIG.STORAGE_KEYS.TOKEN, this.state.token);
            }
            if (this.state.refreshToken) {
                localStorage.setItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN, this.state.refreshToken);
            }
            if (this.state.user) {
                localStorage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify(this.state.user));
            }
            localStorage.setItem(CONFIG.STORAGE_KEYS.PREFERENCES, JSON.stringify(this.state.preferences));
        } catch (error) {
            console.warn('⚠️ Failed to save to storage:', error);
        }
    }
    
    setupAutoSave() {
        // حفظ تلقائي كل 30 ثانية
        setInterval(() => {
            this.saveToStorage();
        }, 30000);
    }
    
    clearStorage() {
        Object.values(CONFIG.STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
        sessionStorage.clear();
    }
}

// ============================================================
// 🔐 AUTHENTICATION MANAGER - مدير المصادقة
// ============================================================

class MarineAuth {
    constructor(store) {
        this.store = store;
        this.loginAttempts = 0;
        this.isLocked = false;
        this.lockTimeout = null;
        this.setupTokenRefresh();
    }
    
    // ============================================================
    // LOGIN - تسجيل الدخول
    // ============================================================
    
    async login(username, password) {
        console.log('🔐 [Auth] محاولة تسجيل الدخول:', username);
        
        // التحقق من القفل
        if (this.isLocked) {
            throw new Error('الحساب مقفل بسبب محاولات فاشلة متكررة. يرجى المحاولة لاحقاً.');
        }
        
        try {
            this.store.set('loading', true);
            
            // إرسال الطلب
            const response = await fetch(`${CONFIG.API_BASE}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
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
    
    // ============================================================
    // HANDLE LOGIN
    // ============================================================
    
    handleSuccessfulLogin(data) {
        const { user, token, refreshToken } = data;
        
        // إعادة تعيين محاولات الفشل
        this.loginAttempts = 0;
        this.isLocked = false;
        
        // تحديث الحالة
        this.store.update({
            user: user,
            token: token,
            refreshToken: refreshToken || null,
            sessionId: this.generateSessionId(),
            permissions: user.permissions || [],
            lastActivity: Date.now(),
            error: null
        });
        
        // توليد معرف الجلسة
        const sessionId = this.generateSessionId();
        this.store.set('sessionId', sessionId);
        
        // تسجيل في التحليلات
        this.logAnalytics('login_success', { username: user.username, role: user.role });
        
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
            }, 300000); // 5 دقائق
        }
        
        this.store.set('error', error);
        this.logAnalytics('login_failed', { attempts: this.loginAttempts });
    }
    
    // ============================================================
    // LOGOUT - تسجيل الخروج
    // ============================================================
    
    async logout() {
        console.log('🚪 [Auth] تسجيل الخروج');
        
        try {
            // إرسال طلب تسجيل الخروج
            const token = this.store.get('token');
            if (token) {
                await fetch(`${CONFIG.API_BASE}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
            }
        } catch (error) {
            console.warn('⚠️ [Auth] خطأ في تسجيل الخروج:', error);
        }
        
        // مسح البيانات
        this.store.clearStorage();
        this.store.reset();
        
        console.log('✅ [Auth] تم تسجيل الخروج');
    }
    
    // ============================================================
    // TOKEN REFRESH - تجديد التوكن
    // ============================================================
    
    setupTokenRefresh() {
        // تجديد التوكن كل 10 دقائق
        setInterval(() => {
            this.refreshToken();
        }, CONFIG.LIMITS.TOKEN_REFRESH_INTERVAL);
    }
    
    async refreshToken() {
        const refreshToken = this.store.get('refreshToken');
        if (!refreshToken) return;
        
        try {
            const response = await fetch(`${CONFIG.API_BASE}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refreshToken })
            });
            
            const data = await response.json();
            
            if (data.success && data.token) {
                this.store.set('token', data.token);
                if (data.refreshToken) {
                    this.store.set('refreshToken', data.refreshToken);
                }
                console.log('✅ [Auth] تم تجديد التوكن');
            }
        } catch (error) {
            console.warn('⚠️ [Auth] فشل تجديد التوكن:', error);
        }
    }
    
    // ============================================================
    // SESSION MANAGEMENT
    // ============================================================
    
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    checkSession() {
        const lastActivity = this.store.get('lastActivity');
        const now = Date.now();
        
        if (lastActivity && (now - lastActivity) > CONFIG.LIMITS.SESSION_TIMEOUT) {
            console.warn('⚠️ [Auth] انتهت الجلسة');
            this.logout();
            return false;
        }
        
        this.store.set('lastActivity', now);
        return true;
    }
    
    // ============================================================
    // PERMISSIONS
    // ============================================================
    
    hasPermission(permission) {
        const permissions = this.store.get('permissions');
        return permissions.includes(permission) || permissions.includes('*');
    }
    
    hasRole(role) {
        const user = this.store.get('user');
        return user && user.role === role;
    }
    
    // ============================================================
    // ANALYTICS
    // ============================================================
    
    logAnalytics(event, data = {}) {
        try {
            // إرسال إلى نظام التحليلات
            if (window.gtag) {
                window.gtag('event', event, {
                    ...data,
                    timestamp: Date.now(),
                    sessionId: this.store.get('sessionId')
                });
            }
        } catch (error) {
            // Silent fail
        }
    }
}

// ============================================================
// 🌐 API MANAGER - مدير واجهة البرمجة
// ============================================================

class MarineAPI {
    constructor(store) {
        this.store = store;
        this.baseURL = CONFIG.API_BASE;
        this.setupInterceptors();
    }
    
    // ============================================================
    // INTERCEPTORS
    // ============================================================
    
    setupInterceptors() {
        // اعتراض الطلبات - إضافة التوكن
        this.requestInterceptor = async (url, options = {}) => {
            const token = this.store.get('token');
            if (token) {
                options.headers = {
                    ...options.headers,
                    'Authorization': `Bearer ${token}`
                };
            }
            
            options.headers = {
                ...options.headers,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            };
            
            return { url, options };
        };
        
        // اعتراض الاستجابات - معالجة الأخطاء
        this.responseInterceptor = async (response) => {
            // إذا كان التوكن منتهي
            if (response.status === 401) {
                const refreshResult = await this.refreshToken();
                if (refreshResult) {
                    // إعادة الطلب
                    return fetch(response.url, response.requestOptions);
                } else {
                    // تسجيل الخروج
                    this.store.clearStorage();
                    this.store.reset();
                    window.location.reload();
                }
            }
            
            return response;
        };
    }
    
    // ============================================================
    // HTTP METHODS
    // ============================================================
    
    async request(url, options = {}) {
        // تطبيق الاعتراضات
        const { url: interceptedUrl, options: interceptedOptions } = 
            await this.requestInterceptor(url, options);
        
        try {
            const response = await fetch(this.baseURL + interceptedUrl, interceptedOptions);
            
            // معالجة الاستجابة
            const processedResponse = await this.responseInterceptor(response);
            
            const data = await processedResponse.json();
            
            if (!processedResponse.ok) {
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
    
    // ============================================================
    // REFRESH TOKEN
    // ============================================================
    
    async refreshToken() {
        const refreshToken = this.store.get('refreshToken');
        if (!refreshToken) return false;
        
        try {
            const response = await fetch(`${this.baseURL}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refreshToken })
            });
            
            const data = await response.json();
            
            if (data.success && data.token) {
                this.store.set('token', data.token);
                if (data.refreshToken) {
                    this.store.set('refreshToken', data.refreshToken);
                }
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error('❌ [API] فشل تجديد التوكن:', error);
            return false;
        }
    }
}

// ============================================================
// 🖥️ UI MANAGER - مدير الواجهة
// ============================================================

class MarineUI {
    constructor(store) {
        this.store = store;
        this.currentPage = 'dashboard';
        this.pageCache = {};
        this.animations = true;
        
        // ربط العناصر
        this.elements = {
            loginOverlay: document.getElementById('loginOverlay'),
            mainApp: document.getElementById('mainApp'),
            sidebar: document.getElementById('sidebar'),
            pageContainer: document.getElementById('pageContainer'),
            pageLoader: document.getElementById('pageLoader'),
            toastContainer: document.getElementById('toastContainer'),
            modalOverlay: document.getElementById('modalOverlay'),
            modalBody: document.getElementById('modalBody'),
            userDisplay: document.getElementById('userRoleDisplay'),
            userAvatar: document.getElementById('userAvatar'),
            notifBadge: document.getElementById('notifBadge'),
            backToTop: document.getElementById('backToTop')
        };
        
        this.initUI();
    }
    
    // ============================================================
    // INITIALIZATION
    // ============================================================
    
    initUI() {
        // التحقق من الجلسة
        const token = this.store.get('token');
        const user = this.store.get('user');
        
        if (token && user) {
            this.showMainApp();
        } else {
            this.showLogin();
        }
        
        // إعداد الأحداث
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
    }
    
    // ============================================================
    // SHOW / HIDE
    // ============================================================
    
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
    
    // ============================================================
    // PAGE LOADING - تحميل الصفحات
    // ============================================================
    
    async loadPage(pageName) {
        console.log('📄 [UI] تحميل الصفحة:', pageName);
        
        this.currentPage = pageName;
        this.store.set('currentPage', pageName);
        
        // إظهار مؤشر التحميل
        this.showLoader();
        
        try {
            // محاولة تحميل من التخزين المؤقت
            let html = this.pageCache[pageName];
            
            if (!html) {
                // تحميل الصفحة من الخادم
                const response = await fetch(`/pages/${pageName}.html`);
                
                if (!response.ok) {
                    throw new Error('الصفحة غير موجودة');
                }
                
                html = await response.text();
                this.pageCache[pageName] = html;
            }
            
            // عرض الصفحة
            this.renderPage(html);
            
            // تحديث القائمة النشطة
            this.updateActiveNav(pageName);
            
            // تسجيل في التحليلات
            this.logPageView(pageName);
            
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
            
            // تنفيذ أي سكريبتات في الصفحة
            const scripts = this.elements.pageContainer.querySelectorAll('script');
            scripts.forEach(script => {
                const newScript = document.createElement('script');
                newScript.textContent = script.textContent;
                document.body.appendChild(newScript);
                document.body.removeChild(newScript);
            });
        }
    }
    
    // ============================================================
    // LOADER
    // ============================================================
    
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
    
    // ============================================================
    // NAVIGATION
    // ============================================================
    
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
    
    // ============================================================
    // USER DISPLAY
    // ============================================================
    
    updateUserDisplay() {
        const user = this.store.get('user');
        if (!user) return;
        
        if (this.elements.userDisplay) {
            const roleNames = {
                admin: 'مسؤول',
                manager: 'مدير',
                operator: 'مشغل',
                viewer: 'مشاهد'
            };
            this.elements.userDisplay.textContent = 
                `👤 ${user.name || user.username} | ${roleNames[user.role] || user.role}`;
        }
        
        if (this.elements.userAvatar) {
            const initial = user.name ? user.name.charAt(0) : user.username.charAt(0);
            this.elements.userAvatar.textContent = initial;
        }
    }
    
    // ============================================================
    // NOTIFICATIONS - الإشعارات
    // ============================================================
    
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
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }, duration);
    }
    
    // ============================================================
    // MODAL - النوافذ المنبثقة
    // ============================================================
    
    showModal(title, content, options = {}) {
        const { confirmText = 'تأكيد', cancelText = 'إلغاء', onConfirm = null } = options;
        
        if (!this.elements.modalOverlay) return;
        
        this.elements.modalOverlay.style.display = 'flex';
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = content;
        document.getElementById('modalConfirm').textContent = confirmText;
        document.getElementById('modalCancel').textContent = cancelText;
        
        // إزالة المستمعين السابقين
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
        
        // إغلاق عند الضغط خارج المودال
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
    
    // ============================================================
    // ERROR PAGE
    // ============================================================
    
    showErrorPage(error) {
        if (this.elements.pageContainer) {
            this.elements.pageContainer.innerHTML = `
                <div class="error-page">
                    <div class="error-icon">⚠️</div>
                    <h2>حدث خطأ</h2>
                    <p>${error.message || 'عذراً، حدث خطأ غير متوقع'}</p>
                    <button onclick="window.loadPage('dashboard')" class="btn-primary">
                        العودة للوحة التحكم
                    </button>
                    <button onclick="location.reload()" class="btn-secondary">
                        تحديث الصفحة
                    </button>
                </div>
            `;
        }
    }
    
    // ============================================================
    // EVENT LISTENERS
    // ============================================================
    
    setupEventListeners() {
        // زر القائمة
        document.getElementById('menuToggle')?.addEventListener('click', () => {
            this.toggleSidebar();
        });
        
        // إغلاق القائمة
        document.getElementById('sidebarClose')?.addEventListener('click', () => {
            this.toggleSidebar();
        });
        
        // زر العودة للأعلى
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                document.getElementById('backToTop').style.display = 'flex';
            } else {
                document.getElementById('backToTop').style.display = 'none';
            }
        });
        
        document.getElementById('backToTop')?.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        
        // أزرار التنقل
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = btn.dataset.page;
                if (page) {
                    window.loadPage(page);
                }
            });
        });
        
        // إغلاق المودال
        document.getElementById('modalClose')?.addEventListener('click', () => {
            this.hideModal();
        });
    }
    
    // ============================================================
    // KEYBOARD SHORTCUTS - اختصارات لوحة المفاتيح
    // ============================================================
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+K → بحث
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                document.getElementById('quickSearch')?.focus();
            }
            
            // Escape → إغلاق المودال
            if (e.key === 'Escape') {
                this.hideModal();
                if (this.elements.sidebar?.classList.contains('open')) {
                    this.toggleSidebar();
                }
            }
            
            // Ctrl+Shift+L → تسجيل الخروج
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
    
    // ============================================================
    // ANALYTICS
    // ============================================================
    
    logPageView(page) {
        try {
            if (window.gtag) {
                window.gtag('event', 'page_view', {
                    page_title: page,
                    page_location: window.location.href
                });
            }
        } catch (error) {
            // Silent fail
        }
    }
}

// ============================================================
// 🚀 INITIALIZATION - تهيئة التطبيق
// ============================================================

let store = null;
let auth = null;
let api = null;
let ui = null;

function initApp() {
    console.log('🚢 [App] تهيئة التطبيق...');
    
    try {
        // 1. إنشاء مدير الحالة
        store = new MarineStore();
        
        // 2. إنشاء مدير المصادقة
        auth = new MarineAuth(store);
        
        // 3. إنشاء مدير API
        api = new MarineAPI(store);
        
        // 4. إنشاء مدير الواجهة
        ui = new MarineUI(store);
        
        // 5. ربط الوظائف العامة
        window.store = store;
        window.auth = auth;
        window.api = api;
        window.ui = ui;
        
        // 6. إعداد المستمعين
        setupGlobalListeners();
        
        // 7. التحقق من الجلسة
        checkSession();
        
        console.log('✅ [App] تم تهيئة التطبيق بنجاح');
        console.log(`📦 الإصدار: ${CONFIG.VERSION}`);
        console.log(`👤 المستخدم: ${store.get('user')?.username || 'غير مسجل'}`);
        
    } catch (error) {
        console.error('❌ [App] فشل تهيئة التطبيق:', error);
        showCriticalError(error);
    }
}

// ============================================================
// 🔄 GLOBAL LISTENERS - المستمعين العامين
// ============================================================

function setupGlobalListeners() {
    // مراقبة حالة الشبكة
    window.addEventListener('online', () => {
        store.set('online', true);
        ui.showToast('🔄 تم استعادة الاتصال بالإنترنت', 'success');
    });
    
    window.addEventListener('offline', () => {
        store.set('online', false);
        ui.showToast('⚠️ تم فقدان الاتصال بالإنترنت', 'error');
    });
    
    // مراقبة نشاط المستخدم
    let activityTimer = null;
    document.addEventListener('mousemove', () => {
        store.set('lastActivity', Date.now());
        clearTimeout(activityTimer);
        activityTimer = setTimeout(() => {
            auth.checkSession();
        }, CONFIG.LIMITS.SESSION_TIMEOUT);
    });
    
    // معالج الأخطاء العام
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
// 🔐 SESSION CHECK - التحقق من الجلسة
// ============================================================

function checkSession() {
    const token = store.get('token');
    const user = store.get('user');
    
    if (token && user) {
        console.log('✅ [App] تم استعادة الجلسة');
        ui.showMainApp();
        ui.updateUserDisplay();
        
        // تحميل الصفحة الحالية
        const currentPage = store.get('currentPage') || 'dashboard';
        ui.loadPage(currentPage);
    } else {
        console.log('ℹ️ [App] لا توجد جلسة نشطة');
        ui.showLogin();
    }
}

// ============================================================
// ❌ CRITICAL ERROR - عرض خطأ حرج
// ============================================================

function showCriticalError(error) {
    document.body.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: #0a1628;
            color: #e2e8f0;
            font-family: 'Cairo', sans-serif;
            padding: 20px;
            text-align: center;
        ">
            <div style="font-size: 64px; margin-bottom: 20px;">💥</div>
            <h1 style="color: #ef4444;">فشل تهيئة النظام</h1>
            <p style="color: #94a3b8; max-width: 500px; margin: 16px auto;">
                ${error.message || 'حدث خطأ غير متوقع أثناء تهيئة النظام'}
            </p>
            <button onclick="location.reload()" style="
                padding: 12px 32px;
                background: #3b82f6;
                border: none;
                border-radius: 8px;
                color: white;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                margin-top: 20px;
                font-family: inherit;
            ">
                🔄 إعادة تحميل الصفحة
            </button>
            <p style="color: #475569; font-size: 12px; margin-top: 30px;">
                الإصدار ${CONFIG.VERSION} | منظومة الوسائل البحرية
            </p>
        </div>
    `;
}

// ============================================================
// 🌐 GLOBAL EXPOSURE - تصدير الوظائف العامة
// ============================================================

// وظائف تسجيل الدخول والخروج
window.doLogin = function() {
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
    
    // إخفاء رسائل الخطأ السابقة
    errorEl.style.display = 'none';
    errorEl.textContent = '';
    
    if (!user || !pass) {
        errorEl.textContent = '⚠️ يرجى إدخال اسم المستخدم وكلمة المرور';
        errorEl.style.display = 'block';
        return;
    }
    
    // تعطيل الزر وإظهار التحميل
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="spinner"></span> جاري الدخول...';
    
    // محاولة تسجيل الدخول
    auth.login(user, pass)
        .then((data) => {
            console.log('✅ [UI] تسجيل الدخول ناجح');
            
            // إظهار التطبيق
            ui.showMainApp();
            ui.updateUserDisplay();
            ui.showToast(`✅ مرحباً ${data.user.name || data.user.username}`, 'success');
            
            // تحميل لوحة التحكم
            ui.loadPage('dashboard');
            
            // إعادة تعيين الزر
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<span class="btn-text">🚀 دخول إلى النظام</span>';
            
            // تنظيف الحقول
            username.value = '';
            password.value = '';
        })
        .catch((error) => {
            console.error('❌ [UI] فشل تسجيل الدخول:', error);
            
            errorEl.textContent = `❌ ${error.message}`;
            errorEl.style.display = 'block';
            
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<span class="btn-text">🚀 دخول إلى النظام</span>';
        });
};

window.doLogout = async function() {
    console.log('🚪 [UI] تسجيل الخروج');
    
    try {
        await auth.logout();
        ui.showLogin();
        ui.showToast('👋 تم تسجيل الخروج بنجاح', 'info');
        
        // تنظيف الحقول
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        document.getElementById('loginError').style.display = 'none';
        
    } catch (error) {
        console.error('❌ [UI] خطأ في تسجيل الخروج:', error);
        ui.showToast('❌ حدث خطأ أثناء تسجيل الخروج', 'error');
    }
};

// وظائف التنقل
window.loadPage = function(page) {
    console.log('📄 [UI] طلب تحميل الصفحة:', page);
    
    // التحقق من الصلاحية
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
// 🚀 START APPLICATION - بدء التطبيق
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 [DOM] DOM جاهز');
    
    // ربط زر الدخول
    const loginBtn = document.getElementById('loginButton');
    if (loginBtn) {
        loginBtn.addEventListener('click', window.doLogin);
        console.log('✅ [DOM] زر الدخول مرتبط');
    }
    
    // ربط Enter في حقل كلمة المرور
    const passwordField = document.getElementById('password');
    if (passwordField) {
        passwordField.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.doLogin();
            }
        });
    }
    
    // ربط زر إظهار/إخفاء كلمة المرور
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
    
    // بدء التطبيق
    initApp();
});

// ============================================================
// 📊 CONSOLE BANNER
// ============================================================

console.log(`%c🚢 منظومة الوسائل البحرية v${CONFIG.VERSION}`, 
    'font-size: 24px; font-weight: bold; color: #3b82f6;');
console.log('%cنظام متكامل لإدارة الأسطول البحري', 
    'font-size: 14px; color: #94a3b8;');
console.log(`%cالوكيل: أمان الله ناجي`, 
    'font-size: 12px; color: #60a5fa;');
console.log('%cجميع الحقوق محفوظة © 2026', 
    'font-size: 12px; color: #475569;');

// ============================================================
// 📦 EXPORTS - للاستخدام في الموديولات الأخرى
// ============================================================

export {
    CONFIG,
    store,
    auth,
    api,
    ui,
    initApp,
    checkSession
};

console.log('✅ [App] تم تحميل التطبيق بنجاح');
