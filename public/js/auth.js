// ============================================================
// 🔐 auth.js - نظام المصادقة والجلسات
// ============================================================

console.log('✅ auth.js تم تحميله بنجاح');

// ============================================================
// 📦 إعدادات المصادقة
// ============================================================

const AUTH_CONFIG = {
    tokenKey: 'authToken',
    userKey: 'userData',
    loginUrl: '/login',
    dashboardUrl: '/dashboard'
};

// ============================================================
// 🔐 كلاس AuthManager - إدارة المصادقة
// ============================================================

class AuthManager {
    constructor() {
        this.token = localStorage.getItem(AUTH_CONFIG.tokenKey);
        this.user = JSON.parse(localStorage.getItem(AUTH_CONFIG.userKey) || 'null');
        this.isAuthenticated = !!this.token && !!this.user;
        
        // إعداد interceptor للـ API
        this.setupInterceptor();
        
        console.log(`🔐 Auth State: ${this.isAuthenticated ? '✅ متصل' : '❌ غير متصل'}`);
    }

    // ============================================================
    // 📡 إعداد Interceptor للـ API
    // ============================================================

    setupInterceptor() {
        // حفظ المرجع إلى fetch الأصلي
        const originalFetch = window.fetch;
        
        // اعتراض جميع طلبات fetch
        window.fetch = async (...args) => {
            const [url, config = {}] = args;
            
            // إضافة التوكن للطلبات إلى API
            if (url.includes('/api') && this.token) {
                config.headers = {
                    ...config.headers,
                    'Authorization': `Bearer ${this.token}`
                };
            }
            
            const response = await originalFetch(url, config);
            
            // معالجة 401 Unauthorized
            if (response.status === 401 && url.includes('/api')) {
                console.warn('⚠️ Token expired or invalid');
                this.logout();
                window.location.href = AUTH_CONFIG.loginUrl;
            }
            
            return response;
        };
    }

    // ============================================================
    // 🔑 تسجيل الدخول
    // ============================================================

    async login(username, password) {
        try {
            // استخدام API من ملف api.js
            const response = await window.API.authLogin(username, password);
            
            if (response.token && response.user) {
                // حفظ التوكن والمستخدم
                this.token = response.token;
                this.user = response.user;
                this.isAuthenticated = true;
                
                localStorage.setItem(AUTH_CONFIG.tokenKey, response.token);
                localStorage.setItem(AUTH_CONFIG.userKey, JSON.stringify(response.user));
                
                // تسجيل نشاط
                console.log(`✅ تم تسجيل الدخول: ${response.user.username || response.user.email}`);
                
                // إشعار نجاح
                if (window.showNotification) {
                    window.showNotification(`مرحباً ${response.user.name || 'مستخدم'}`, 'success');
                }
                
                return response;
            } else {
                throw new Error('بيانات غير صالحة');
            }
        } catch (error) {
            console.error('❌ Login Error:', error);
            throw error;
        }
    }

    // ============================================================
    // 📝 تسجيل مستخدم جديد
    // ============================================================

    async register(userData) {
        try {
            const response = await window.API.authRegister(userData);
            
            if (response.success) {
                console.log('✅ تم التسجيل بنجاح');
                if (window.showNotification) {
                    window.showNotification('تم إنشاء الحساب بنجاح', 'success');
                }
                return response;
            }
        } catch (error) {
            console.error('❌ Register Error:', error);
            throw error;
        }
    }

    // ============================================================
    // 🚪 تسجيل الخروج
    // ============================================================

    logout() {
        // تنظيف البيانات
        this.token = null;
        this.user = null;
        this.isAuthenticated = false;
        
        localStorage.removeItem(AUTH_CONFIG.tokenKey);
        localStorage.removeItem(AUTH_CONFIG.userKey);
        
        console.log('🚪 تم تسجيل الخروج');
        
        // إشعار
        if (window.showNotification) {
            window.showNotification('تم تسجيل الخروج', 'info');
        }
        
        // التوجيه إلى صفحة الدخول
        window.location.href = AUTH_CONFIG.loginUrl;
    }

    // ============================================================
    // 👤 جلب بيانات المستخدم الحالي
    // ============================================================

    getCurrentUser() {
        return this.user;
    }

    // ============================================================
    // 🎯 التحقق من الصلاحيات
    // ============================================================

    hasRole(role) {
        if (!this.user) return false;
        
        // إذا كان المستخدم Admin لديه كل الصلاحيات
        if (this.user.role === 'admin') return true;
        
        // التحقق من الدور المطلوب
        if (Array.isArray(role)) {
            return role.includes(this.user.role);
        }
        
        return this.user.role === role;
    }

    hasPermission(permission) {
        if (!this.user) return false;
        if (this.user.role === 'admin') return true;
        
        // قائمة الصلاحيات لكل دور
        const permissions = {
            'admin': ['*'],
            'manager': ['view', 'create', 'update', 'delete'],
            'viewer': ['view']
        };
        
        const userPermissions = permissions[this.user.role] || [];
        return userPermissions.includes('*') || userPermissions.includes(permission);
    }

    // ============================================================
    // 🔄 تحديث بيانات المستخدم
    // ============================================================

    async refreshUser() {
        try {
            const response = await window.API.authMe();
            if (response.user) {
                this.user = response.user;
                localStorage.setItem(AUTH_CONFIG.userKey, JSON.stringify(response.user));
                return this.user;
            }
        } catch (error) {
            console.error('❌ Refresh User Error:', error);
            throw error;
        }
    }

    // ============================================================
    // 🔐 تغيير كلمة المرور
    // ============================================================

    async changePassword(oldPassword, newPassword) {
        try {
            if (!this.user || !this.user.id) {
                throw new Error('المستخدم غير مسجل');
            }
            
            const response = await window.API.changePassword(
                this.user.id,
                oldPassword,
                newPassword
            );
            
            if (response.success) {
                console.log('✅ تم تغيير كلمة المرور');
                if (window.showNotification) {
                    window.showNotification('تم تغيير كلمة المرور بنجاح', 'success');
                }
                return response;
            }
        } catch (error) {
            console.error('❌ Change Password Error:', error);
            throw error;
        }
    }

    // ============================================================
    // 🛡️ حماية الصفحات
    // ============================================================

    protectPage(requiredRole = null) {
        if (!this.isAuthenticated) {
            window.location.href = AUTH_CONFIG.loginUrl;
            return false;
        }

        if (requiredRole && !this.hasRole(requiredRole)) {
            // إذا لم يكن لديه الصلاحية
            if (window.showNotification) {
                window.showNotification('ليس لديك صلاحية للوصول', 'error');
            }
            // توجيه إلى الصفحة الرئيسية
            window.location.href = AUTH_CONFIG.dashboardUrl;
            return false;
        }

        return true;
    }

    // ============================================================
    // 🎨 عرض معلومات المستخدم في الواجهة
    // ============================================================

    displayUserInfo() {
        if (!this.user) return;
        
        // تحديث اسم المستخدم في الهيدر
        const nameElement = document.querySelector('.user-name');
        if (nameElement) {
            nameElement.textContent = this.user.name || this.user.username || 'مستخدم';
        }
        
        // تحديث الدور
        const roleElement = document.querySelector('.user-role');
        if (roleElement) {
            const roleNames = {
                'admin': 'مدير النظام',
                'manager': 'مدير',
                'viewer': 'مشاهد'
            };
            roleElement.textContent = roleNames[this.user.role] || this.user.role;
        }
        
        // تحديث الصورة الشخصية
        const avatarElement = document.querySelector('.user-avatar');
        if (avatarElement && this.user.avatar) {
            avatarElement.src = this.user.avatar;
        }
    }
}

// ============================================================
// 🌐 إنشاء نسخة عالمية من AuthManager
// ============================================================

const auth = new AuthManager();

// ============================================================
// 🔧 دوال مساعدة للاستخدام العام
// ============================================================

// تسجيل الدخول من أي مكان
async function doLogin(username, password) {
    try {
        await auth.login(username, password);
        window.location.href = AUTH_CONFIG.dashboardUrl;
    } catch (error) {
        const errorElement = document.getElementById('loginError');
        if (errorElement) {
            errorElement.textContent = error.message || 'خطأ في تسجيل الدخول';
        }
        throw error;
    }
}

// تسجيل الخروج من أي مكان
function doLogout() {
    auth.logout();
}

// التحقق من المصادقة
function isAuthenticated() {
    return auth.isAuthenticated;
}

// جلب المستخدم الحالي
function getCurrentUser() {
    return auth.getCurrentUser();
}

// التحقق من الصلاحية
function hasRole(role) {
    return auth.hasRole(role);
}

// ============================================================
// 🔄 تصدير الدوال للاستخدام العالمي
// ============================================================

window.auth = auth;
window.doLogin = doLogin;
window.doLogout = doLogout;
window.isAuthenticated = isAuthenticated;
window.getCurrentUser = getCurrentUser;
window.hasRole = hasRole;

console.log('✅ Auth ready - نظام المصادقة جاهز');

// ============================================================
// 🚀 تشغيل تلقائي: التحقق من الجلسة عند التحميل
// ============================================================

// إذا كان المستخدم مسجل، تحديث بياناته
if (auth.isAuthenticated) {
    auth.refreshUser().catch(() => {
        // إذا فشل التحديث، تسجيل الخروج
        auth.logout();
    });
}
