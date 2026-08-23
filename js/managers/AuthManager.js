/**
 * ============================================================
 * 🚢 منظومة الوسائل البحرية - AuthManager.js v7.0
 * ============================================================
 * مدير المصادقة المتقدم مع توكن وجلسات
 * ============================================================
 */

class AuthManager {
    constructor(config = {}) {
        this.config = {
            apiBase: '/api',
            tokenKey: 'marine_auth_token',
            refreshTokenKey: 'marine_refresh_token',
            userKey: 'marine_user',
            maxLoginAttempts: 5,
            lockDuration: 300000, // 5 دقائق
            tokenRefreshInterval: 600000, // 10 دقائق
            ...config
        };
        
        this.state = {
            user: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
            loginAttempts: 0,
            isLocked: false,
            lockTimer: null
        };
        
        this.eventListeners = new Map();
        this.tokenRefreshTimer = null;
        
        // تهيئة
        this.loadFromStorage();
        this.setupTokenRefresh();
        this.setupActivityMonitor();
        
        console.log('🔐 AuthManager initialized');
    }
    
    // ============================================================
    // 📦 STORAGE MANAGEMENT
    // ============================================================
    
    loadFromStorage() {
        try {
            const token = localStorage.getItem(this.config.tokenKey);
            const refreshToken = localStorage.getItem(this.config.refreshTokenKey);
            const user = JSON.parse(localStorage.getItem(this.config.userKey) || 'null');
            
            if (token && user) {
                this.state.token = token;
                this.state.refreshToken = refreshToken;
                this.state.user = user;
                this.state.isAuthenticated = true;
            }
        } catch (error) {
            console.warn('⚠️ Failed to load auth from storage:', error);
        }
    }
    
    saveToStorage() {
        try {
            if (this.state.token) {
                localStorage.setItem(this.config.tokenKey, this.state.token);
            }
            if (this.state.refreshToken) {
                localStorage.setItem(this.config.refreshTokenKey, this.state.refreshToken);
            }
            if (this.state.user) {
                localStorage.setItem(this.config.userKey, JSON.stringify(this.state.user));
            }
        } catch (error) {
            console.warn('⚠️ Failed to save auth to storage:', error);
        }
    }
    
    clearStorage() {
        localStorage.removeItem(this.config.tokenKey);
        localStorage.removeItem(this.config.refreshTokenKey);
        localStorage.removeItem(this.config.userKey);
    }
    
    // ============================================================
    // 🔐 AUTHENTICATION
    // ============================================================
    
    async login(username, password) {
        console.log('🔐 Login attempt:', username);
        
        // التحقق من القفل
        if (this.state.isLocked) {
            throw new Error('الحساب مقفل. يرجى المحاولة لاحقاً');
        }
        
        this.state.isLoading = true;
        this.state.error = null;
        this.emit('loading', true);
        
        try {
            const response = await fetch(`${this.config.apiBase}/auth/login`, {
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
            
            // نجاح
            this.handleSuccessfulLogin(data);
            this.emit('login', data);
            return data;
            
        } catch (error) {
            this.state.error = error.message;
            this.emit('error', error);
            throw error;
        } finally {
            this.state.isLoading = false;
            this.emit('loading', false);
        }
    }
    
    handleSuccessfulLogin(data) {
        const { user, token, refreshToken } = data;
        
        // إعادة تعيين المحاولات
        this.state.loginAttempts = 0;
        this.state.isLocked = false;
        
        // تحديث الحالة
        this.state.user = user;
        this.state.token = token;
        this.state.refreshToken = refreshToken || null;
        this.state.isAuthenticated = true;
        this.state.error = null;
        
        // حفظ في التخزين
        this.saveToStorage();
        
        console.log('✅ Login successful:', user.username);
    }
    
    handleFailedLogin(error) {
        this.state.loginAttempts++;
        this.state.error = error;
        
        // قفل الحساب بعد المحاولات الفاشلة
        if (this.state.loginAttempts >= this.config.maxLoginAttempts) {
            this.state.isLocked = true;
            
            // إلغاء القفل تلقائياً
            if (this.state.lockTimer) {
                clearTimeout(this.state.lockTimer);
            }
            this.state.lockTimer = setTimeout(() => {
                this.state.isLocked = false;
                this.state.loginAttempts = 0;
                console.log('🔓 Account unlocked');
                this.emit('unlocked');
            }, this.config.lockDuration);
            
            this.emit('locked');
        }
        
        console.log('❌ Login failed:', error);
    }
    
    // ============================================================
    // 🚪 LOGOUT
    // ============================================================
    
    async logout() {
        console.log('🚪 Logout');
        
        try {
            // إعلام الخادم
            if (this.state.token) {
                await fetch(`${this.config.apiBase}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.state.token}`,
                        'Content-Type': 'application/json'
                    }
                });
            }
        } catch (error) {
            console.warn('⚠️ Logout API error:', error);
        }
        
        // مسح البيانات
        this.clearStorage();
        this.state.user = null;
        this.state.token = null;
        this.state.refreshToken = null;
        this.state.isAuthenticated = false;
        
        // إيقاف التحديث التلقائي
        if (this.tokenRefreshTimer) {
            clearInterval(this.tokenRefreshTimer);
            this.tokenRefreshTimer = null;
        }
        
        this.emit('logout');
        console.log('✅ Logout successful');
    }
    
    // ============================================================
    // 🔄 TOKEN REFRESH
    // ============================================================
    
    setupTokenRefresh() {
        if (this.tokenRefreshTimer) {
            clearInterval(this.tokenRefreshTimer);
        }
        
        this.tokenRefreshTimer = setInterval(() => {
            if (this.state.isAuthenticated && this.state.refreshToken) {
                this.refreshToken();
            }
        }, this.config.tokenRefreshInterval);
    }
    
    async refreshToken() {
        if (!this.state.refreshToken) return false;
        
        try {
            const response = await fetch(`${this.config.apiBase}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refreshToken: this.state.refreshToken })
            });
            
            const data = await response.json();
            
            if (data.success && data.token) {
                this.state.token = data.token;
                if (data.refreshToken) {
                    this.state.refreshToken = data.refreshToken;
                }
                this.saveToStorage();
                this.emit('token_refreshed', data);
                console.log('✅ Token refreshed');
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.warn('⚠️ Token refresh failed:', error);
            return false;
        }
    }
    
    // ============================================================
    // ⏱️ SESSION MANAGEMENT
    // ============================================================
    
    setupActivityMonitor() {
        let activityTimer = null;
        const SESSION_TIMEOUT = 3600000; // 1 ساعة
        
        const resetTimer = () => {
            clearTimeout(activityTimer);
            activityTimer = setTimeout(() => {
                this.checkSession();
            }, SESSION_TIMEOUT);
        };
        
        // مراقبة نشاط المستخدم
        ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event => {
            document.addEventListener(event, resetTimer);
        });
        
        resetTimer();
    }
    
    checkSession() {
        if (this.state.isAuthenticated) {
            console.warn('⚠️ Session timeout');
            this.logout();
            this.emit('session_timeout');
        }
    }
    
    // ============================================================
    // 👤 USER MANAGEMENT
    // ============================================================
    
    getUser() {
        return this.state.user;
    }
    
    getToken() {
        return this.state.token;
    }
    
    isAuthenticated() {
        return this.state.isAuthenticated;
    }
    
    hasPermission(permission) {
        if (!this.state.user || !this.state.user.permissions) return false;
        return this.state.user.permissions.includes(permission) || 
               this.state.user.permissions.includes('*');
    }
    
    hasRole(role) {
        if (!this.state.user) return false;
        return this.state.user.role === role;
    }
    
    // ============================================================
    // 📡 EVENT SYSTEM
    // ============================================================
    
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
        return () => this.off(event, callback);
    }
    
    off(event, callback) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }
    
    emit(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Event listener error:', error);
                }
            });
        }
    }
    
    // ============================================================
    // 🎯 UTILITY
    // ============================================================
    
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    getState() {
        return { ...this.state };
    }
}

// تصدير للاستخدام
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthManager;
}
