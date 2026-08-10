// ============================================================
// 🔐 auth.js - نظام المصادقة والجلسات
// Marine System - Production Ready
// ============================================================

'use strict';

console.log('🔐 تحميل auth.js...');

// ============================================================
// ⚙️ إعدادات المصادقة
// ============================================================

const AUTH_CONFIG = Object.freeze({
    tokenKey: 'authToken',
    userKey: 'userData',

    // التطبيق SPA وليس صفحات /login و /dashboard
    loginUrl: '/',
    dashboardUrl: '/',

    loginEndpoint: '/auth/login',
    meEndpoint: '/auth/me'
});

// ============================================================
// 🧹 أدوات آمنة
// ============================================================

function safeJSONParse(value, fallback = null) {
    if (!value) return fallback;

    try {
        return JSON.parse(value);
    } catch (error) {
        console.warn('⚠️ بيانات المستخدم في localStorage غير صالحة');
        return fallback;
    }
}

function clearAuthStorage() {
    try {
        localStorage.removeItem(AUTH_CONFIG.tokenKey);
        localStorage.removeItem(AUTH_CONFIG.userKey);

        // توافق مع الإصدارات القديمة
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    } catch (error) {
        console.error('❌ خطأ في تنظيف بيانات المصادقة:', error);
    }
}

// ============================================================
// 🔐 AuthManager
// ============================================================

class AuthManager {

    constructor() {

        this.token =
            localStorage.getItem(AUTH_CONFIG.tokenKey) ||
            localStorage.getItem('token') ||
            null;

        this.user =
            safeJSONParse(
                localStorage.getItem(AUTH_CONFIG.userKey)
            ) ||
            safeJSONParse(
                localStorage.getItem('user')
            ) ||
            null;

        this.isAuthenticated =
            Boolean(this.token && this.user);

        this.isLoggingIn = false;
        this.isLoggingOut = false;

        this.setupInterceptor();

        console.log(
            `🔐 Auth State: ${
                this.isAuthenticated
                    ? '✅ متصل'
                    : '❌ غير متصل'
            }`
        );
    }

    // ========================================================
    // 📡 Fetch Interceptor
    // ========================================================

    setupInterceptor() {

        if (window.__MARINE_AUTH_FETCH_INSTALLED__) {
            console.log('ℹ️ Fetch interceptor موجود مسبقاً');
            return;
        }

        const originalFetch = window.fetch.bind(window);

        window.fetch = async (...args) => {

            let [url, config = {}] = args;

            config = {
                ...config,
                headers: {
                    ...(config.headers || {})
                }
            };

            const requestUrl =
                typeof url === 'string'
                    ? url
                    : url?.url || '';

            // ------------------------------------------------
            // إضافة JWT فقط إلى API
            // ------------------------------------------------

            if (
                requestUrl.includes('/api/') &&
                this.token
            ) {
                config.headers.Authorization =
                    `Bearer ${this.token}`;
            }

            try {

                const response =
                    await originalFetch(url, config);

                // ------------------------------------------------
                // Token غير صالح
                // ------------------------------------------------

                if (
                    response.status === 401 &&
                    requestUrl.includes('/api/') &&
                    !requestUrl.includes('/auth/login')
                ) {

                    console.warn(
                        '⚠️ الجلسة منتهية أو التوكن غير صالح'
                    );

                    this.handleUnauthorized();
                }

                return response;

            } catch (error) {

                console.error(
                    '❌ Fetch Error:',
                    error
                );

                throw error;
            }
        };

        window.__MARINE_AUTH_FETCH_INSTALLED__ = true;
    }

    // ========================================================
    // 🔴 التعامل مع 401
    // ========================================================

    handleUnauthorized() {

        if (this.isLoggingOut) {
            return;
        }

        this.clearSession();

        const loginOverlay =
            document.getElementById('loginOverlay');

        const mainApp =
            document.getElementById('mainApp');

        if (loginOverlay) {
            loginOverlay.style.display = 'flex';
        }

        if (mainApp) {
            mainApp.style.display = 'none';
        }

        const errorElement =
            document.getElementById('loginError');

        if (errorElement) {
            errorElement.textContent =
                'انتهت الجلسة، يرجى تسجيل الدخول من جديد';
        }
    }

    // ========================================================
    // 🔑 تسجيل الدخول
    // ========================================================

    async login(username, password) {

        if (this.isLoggingIn) {
            throw new Error(
                'جاري تسجيل الدخول، يرجى الانتظار...'
            );
        }

        username =
            String(username || '').trim();

        password =
            String(password || '');

        if (!username) {
            throw new Error(
                'يرجى إدخال اسم المستخدم'
            );
        }

        if (!password) {
            throw new Error(
                'يرجى إدخال كلمة المرور'
            );
        }

        this.isLoggingIn = true;

        try {

            // ------------------------------------------------
            // التأكد من وجود API
            // ------------------------------------------------

            if (
                !window.API ||
                typeof window.API.authLogin !== 'function'
            ) {
                throw new Error(
                    'نظام API غير محمل. تأكد من تحميل api.js قبل auth.js'
                );
            }

            console.log(
                `🔐 محاولة تسجيل الدخول للمستخدم: ${username}`
            );

            const response =
                await window.API.authLogin(
                    username,
                    password
                );

            console.log(
                '📥 Login Response:',
                response
            );

            // ------------------------------------------------
            // التحقق من الرد
            // ------------------------------------------------

            if (!response) {
                throw new Error(
                    'الخادم لم يرجع بيانات'
                );
            }

            if (!response.token) {

                throw new Error(
                    response.error ||
                    response.message ||
                    'لم يتم استلام رمز الدخول من الخادم'
                );
            }

            if (!response.user) {

                throw new Error(
                    'تم تسجيل الدخول لكن بيانات المستخدم غير موجودة'
                );
            }

            // ------------------------------------------------
            // حفظ الجلسة
            // ------------------------------------------------

            this.token =
                response.token;

            this.user =
                response.user;

            this.isAuthenticated = true;

            localStorage.setItem(
                AUTH_CONFIG.tokenKey,
                this.token
            );

            localStorage.setItem(
                AUTH_CONFIG.userKey,
                JSON.stringify(this.user)
            );

            console.log(
                '✅ تم تسجيل الدخول بنجاح'
            );

            console.log(
                '👤 المستخدم:',
                this.user.username ||
                this.user.email ||
                this.user.name
            );

            console.log(
                '🛡️ الدور:',
                this.user.role
            );

            return response;

        } catch (error) {

            console.error(
                '❌ Login Error:',
                error
            );

            throw error;

        } finally {

            this.isLoggingIn = false;
        }
    }

    // ========================================================
    // 📝 تسجيل مستخدم جديد
    // ========================================================

    async register(userData) {

        if (
            !window.API ||
            typeof window.API.authRegister !== 'function'
        ) {
            throw new Error(
                'API التسجيل غير متاح'
            );
        }

        try {

            const response =
                await window.API.authRegister(
                    userData
                );

            if (!response) {
                throw new Error(
                    'الخادم لم يرجع بيانات'
                );
            }

            console.log(
                '✅ تم إنشاء المستخدم'
            );

            if (window.showNotification) {
                window.showNotification(
                    'تم إنشاء الحساب بنجاح',
                    'success'
                );
            }

            return response;

        } catch (error) {

            console.error(
                '❌ Register Error:',
                error
            );

            throw error;
        }
    }

    // ========================================================
    // 🚪 تسجيل الخروج
    // ========================================================

    logout() {

        if (this.isLoggingOut) {
            return;
        }

        this.isLoggingOut = true;

        console.log(
            '🚪 تسجيل الخروج...'
        );

        this.clearSession();

        // ----------------------------------------------------
        // إظهار شاشة الدخول داخل نفس الصفحة
        // ----------------------------------------------------

        const loginOverlay =
            document.getElementById('loginOverlay');

        const mainApp =
            document.getElementById('mainApp');

        if (loginOverlay) {
            loginOverlay.style.display = 'flex';
        }

        if (mainApp) {
            mainApp.style.display = 'none';
        }

        // مسح حقول الدخول
        const username =
            document.getElementById('username');

        const password =
            document.getElementById('password');

        if (username) {
            username.value = '';
        }

        if (password) {
            password.value = '';
        }

        const errorElement =
            document.getElementById('loginError');

        if (errorElement) {
            errorElement.textContent = '';
        }

        if (window.showNotification) {
            window.showNotification(
                'تم تسجيل الخروج',
                'info'
            );
        }

        this.isLoggingOut = false;
    }

    // ========================================================
    // 🧹 مسح الجلسة
    // ========================================================

    clearSession() {

        this.token = null;
        this.user = null;
        this.isAuthenticated = false;

        clearAuthStorage();

        console.log(
            '🧹 تم تنظيف جلسة المصادقة'
        );
    }

    // ========================================================
    // 👤 المستخدم الحالي
    // ========================================================

    getCurrentUser() {
        return this.user;
    }

    // ========================================================
    // 🔑 التوكن
    // ========================================================

    getToken() {
        return this.token;
    }

    // ========================================================
    // 🛡️ التحقق من الدور
    // ========================================================

    hasRole(role) {

        if (!this.user) {
            return false;
        }

        if (this.user.role === 'admin') {
            return true;
        }

        if (Array.isArray(role)) {
            return role.includes(
                this.user.role
            );
        }

        return this.user.role === role;
    }

    // ========================================================
    // 🛡️ الصلاحيات
    // ========================================================

    hasPermission(permission) {

        if (!this.user) {
            return false;
        }

        if (this.user.role === 'admin') {
            return true;
        }

        const permissions = {

            admin: ['*'],

            manager: [
                'view',
                'create',
                'update',
                'delete'
            ],

            viewer: [
                'view'
            ]
        };

        const userPermissions =
            permissions[this.user.role] || [];

        return (
            userPermissions.includes('*') ||
            userPermissions.includes(permission)
        );
    }

    // ========================================================
    // 🔄 تحديث بيانات المستخدم
    // ========================================================

    async refreshUser() {

        if (!this.token) {
            throw new Error(
                'لا يوجد Token'
            );
        }

        if (
            !window.API ||
            typeof window.API.authMe !== 'function'
        ) {
            throw new Error(
                'API المصادقة غير متاح'
            );
        }

        try {

            const response =
                await window.API.authMe();

            if (
                response &&
                response.user
            ) {

                this.user =
                    response.user;

                this.isAuthenticated = true;

                localStorage.setItem(
                    AUTH_CONFIG.userKey,
                    JSON.stringify(
                        this.user
                    )
                );

                this.displayUserInfo();

                return this.user;
            }

            throw new Error(
                'بيانات المستخدم غير موجودة'
            );

        } catch (error) {

            console.error(
                '❌ Refresh User Error:',
                error
            );

            throw error;
        }
    }

    // ========================================================
    // 🔐 تغيير كلمة المرور
    // ========================================================

    async changePassword(
        oldPassword,
        newPassword
    ) {

        if (!this.user) {
            throw new Error(
                'المستخدم غير مسجل الدخول'
            );
        }

        const userId =
            this.user.id ||
            this.user._id;

        if (!userId) {
            throw new Error(
                'معرف المستخدم غير موجود'
            );
        }

        if (!newPassword) {
            throw new Error(
                'أدخل كلمة المرور الجديدة'
            );
        }

        try {

            const response =
                await window.API.changePassword(
                    userId,
                    oldPassword,
                    newPassword
                );

            if (
                response &&
                response.success
            ) {

                if (window.showNotification) {
                    window.showNotification(
                        'تم تغيير كلمة المرور بنجاح',
                        'success'
                    );
                }

                return response;
            }

            throw new Error(
                response?.error ||
                'فشل تغيير كلمة المرور'
            );

        } catch (error) {

            console.error(
                '❌ Change Password Error:',
                error
            );

            throw error;
        }
    }

    // ========================================================
    // 🛡️ حماية الصفحة
    // ========================================================

    protectPage(requiredRole = null) {

        if (!this.isAuthenticated) {

            const loginOverlay =
                document.getElementById(
                    'loginOverlay'
                );

            const mainApp =
                document.getElementById(
                    'mainApp'
                );

            if (loginOverlay) {
                loginOverlay.style.display =
                    'flex';
            }

            if (mainApp) {
                mainApp.style.display =
                    'none';
            }

            return false;
        }

        if (
            requiredRole &&
            !this.hasRole(requiredRole)
        ) {

            if (window.showNotification) {
                window.showNotification(
                    'ليس لديك صلاحية للوصول',
                    'error'
                );
            }

            return false;
        }

        return true;
    }

    // ========================================================
    // 🎨 عرض معلومات المستخدم
    // ========================================================

    displayUserInfo() {

        if (!this.user) {
            return;
        }

        const displayName =
            this.user.name ||
            this.user.username ||
            this.user.email ||
            'مستخدم';

        // -----------------------------------------------
        // الاسم
        // -----------------------------------------------

        const nameElements =
            document.querySelectorAll(
                '.user-name'
            );

        nameElements.forEach(
            element => {
                element.textContent =
                    displayName;
            }
        );

        // -----------------------------------------------
        // الدور
        // -----------------------------------------------

        const roleNames = {

            admin:
                'مدير النظام',

            manager:
                'مدير',

            viewer:
                'مشاهد',

            مسؤول:
                'مدير النظام',

            محرر:
                'مدير',

            مشاهد:
                'مشاهد'
        };

        const role =
            this.user.role || '';

        const roleText =
            roleNames[role] || role;

        const roleElements =
            document.querySelectorAll(
                '.user-role'
            );

        roleElements.forEach(
            element => {
                element.textContent =
                    roleText;
            }
        );

        // -----------------------------------------------
        // العنصر الموجود فعلياً في index.html
        // -----------------------------------------------

        const roleBadge =
            document.getElementById(
                'userRoleDisplay'
            );

        if (roleBadge) {

            roleBadge.textContent =
                `👤 ${displayName}`;

            if (roleText) {
                roleBadge.title =
                    roleText;
            }
        }
    }
}

// ============================================================
// 🌐 إنشاء Auth Manager
// ============================================================

const auth = new AuthManager();

// ============================================================
// 🚀 doLogin
// متوافق مع:
// <button onclick="doLogin()">
// ============================================================

async function doLogin() {

    const usernameElement =
        document.getElementById(
            'username'
        );

    const passwordElement =
        document.getElementById(
            'password'
        );

    const errorElement =
        document.getElementById(
            'loginError'
        );

    const loginButton =
        document.querySelector(
            '.login-btn'
        );

    // --------------------------------------------------------
    // التأكد من وجود العناصر
    // --------------------------------------------------------

    if (
        !usernameElement ||
        !passwordElement
    ) {

        console.error(
            '❌ عناصر تسجيل الدخول غير موجودة'
        );

        return;
    }

    const username =
        usernameElement.value.trim();

    const password =
        passwordElement.value;

    if (errorElement) {
        errorElement.textContent = '';
    }

    // --------------------------------------------------------
    // Validation
    // --------------------------------------------------------

    if (!username) {

        if (errorElement) {
            errorElement.textContent =
                '⚠️ أدخل اسم المستخدم';
        }

        usernameElement.focus();

        return;
    }

    if (!password) {

        if (errorElement) {
            errorElement.textContent =
                '⚠️ أدخل كلمة المرور';
        }

        passwordElement.focus();

        return;
    }

    // --------------------------------------------------------
    // تعطيل الزر أثناء الدخول
    // --------------------------------------------------------

    if (loginButton) {
        loginButton.disabled = true;
        loginButton.dataset.originalText =
            loginButton.innerHTML;

        loginButton.innerHTML =
            '⏳ جاري تسجيل الدخول...';
    }

    try {

        await auth.login(
            username,
            password
        );

        // ----------------------------------------------------
        // إخفاء شاشة الدخول
        // ----------------------------------------------------

        const loginOverlay =
            document.getElementById(
                'loginOverlay'
            );

        const mainApp =
            document.getElementById(
                'mainApp'
            );

        if (loginOverlay) {
            loginOverlay.style.display =
                'none';
        }

        if (mainApp) {
            mainApp.style.display =
                'block';
        }

        // ----------------------------------------------------
        // عرض بيانات المستخدم
        // ----------------------------------------------------

        auth.displayUserInfo();

        // ----------------------------------------------------
        // فتح Dashboard
        // بدون تغيير URL
        // ----------------------------------------------------

        if (
            typeof window.showPage ===
            'function'
        ) {

            window.showPage(
                'dashboard'
            );
        }

        // ----------------------------------------------------
        // إشعار
        // ----------------------------------------------------

        if (window.showNotification) {

            const name =
                auth.user?.name ||
                auth.user?.username ||
                'مستخدم';

            window.showNotification(
                `مرحباً ${name}`,
                'success'
            );
        }

        console.log(
            '🎉 تم الدخول إلى Marine System'
        );

    } catch (error) {

        console.error(
            '❌ فشل تسجيل الدخول:',
            error
        );

        if (errorElement) {

            errorElement.textContent =
                error.message ||
                'اسم المستخدم أو كلمة المرور غير صحيحة';
        }

    } finally {

        if (loginButton) {

            loginButton.disabled = false;

            if (
                loginButton.dataset.originalText
            ) {

                loginButton.innerHTML =
                    loginButton.dataset.originalText;
            }
        }
    }
}

// ============================================================
// 🚪 تسجيل الخروج
// ============================================================

function doLogout() {
    auth.logout();
}

// ============================================================
// 🔎 التحقق من المصادقة
// ============================================================

function isAuthenticated() {
    return auth.isAuthenticated;
}

// ============================================================
// 👤 المستخدم الحالي
// ============================================================

function getCurrentUser() {
    return auth.getCurrentUser();
}

// ============================================================
// 🛡️ الدور
// ============================================================

function hasRole(role) {
    return auth.hasRole(role);
}

// ============================================================
// 🛡️ الصلاحية
// ============================================================

function hasPermission(permission) {
    return auth.hasPermission(permission);
}

// ============================================================
// 🔑 التوكن
// ============================================================

function getAuthToken() {
    return auth.getToken();
}

// ============================================================
// 🌐 Export Global
// ============================================================

window.auth = auth;

window.doLogin =
    doLogin;

window.doLogout =
    doLogout;

window.isAuthenticated =
    isAuthenticated;

window.getCurrentUser =
    getCurrentUser;

window.hasRole =
    hasRole;

window.hasPermission =
    hasPermission;

window.getAuthToken =
    getAuthToken;

// ============================================================
// ⌨️ Enter لتسجيل الدخول
// ============================================================

document.addEventListener(
    'DOMContentLoaded',
    () => {

        const password =
            document.getElementById(
                'password'
            );

        if (password) {

            password.addEventListener(
                'keydown',
                event => {

                    if (
                        event.key === 'Enter'
                    ) {

                        event.preventDefault();

                        doLogin();
                    }
                }
            );
        }

        // ----------------------------------------------------
        // إذا كانت هناك جلسة محفوظة
        // ----------------------------------------------------

        if (
            auth.isAuthenticated
        ) {

            console.log(
                '🔄 جلسة محفوظة موجودة'
            );

            const loginOverlay =
                document.getElementById(
                    'loginOverlay'
                );

            const mainApp =
                document.getElementById(
                    'mainApp'
                );

            if (loginOverlay) {
                loginOverlay.style.display =
                    'none';
            }

            if (mainApp) {
                mainApp.style.display =
                    'block';
            }

            auth.displayUserInfo();

            // تحديث بيانات المستخدم
            auth.refreshUser()
                .then(() => {

                    console.log(
                        '✅ تم تحديث جلسة المستخدم'
                    );

                })
                .catch(error => {

                    console.warn(
                        '⚠️ الجلسة المحفوظة غير صالحة:',
                        error.message
                    );

                    auth.clearSession();

                    if (loginOverlay) {
                        loginOverlay.style.display =
                            'flex';
                    }

                    if (mainApp) {
                        mainApp.style.display =
                            'none';
                    }
                });

        } else {

            const loginOverlay =
                document.getElementById(
                    'loginOverlay'
                );

            const mainApp =
                document.getElementById(
                    'mainApp'
                );

            if (loginOverlay) {
                loginOverlay.style.display =
                    'flex';
            }

            if (mainApp) {
                mainApp.style.display =
                    'none';
            }
        }
    }
);

// ============================================================
// 🛡️ منع إرسال نموذج الدخول إذا أضيف مستقبلاً
// ============================================================

document.addEventListener(
    'submit',
    event => {

        const form =
            event.target;

        if (
            form &&
            (
                form.id === 'loginForm' ||
                form.closest('#loginOverlay')
            )
        ) {

            event.preventDefault();

            doLogin();
        }
    }
);

console.log(
    '✅ Auth ready - نظام المصادقة جاهز 10/10'
);
