// ============================================================
// 🔐 auth.js - نظام المصادقة والجلسات
// Marine System v5.0
// Production Ready - Render + MongoDB
// ============================================================

'use strict';

console.log('🔐 تحميل auth.js...');

// ============================================================
// ⚙️ إعدادات المصادقة
// ============================================================

const AUTH_CONFIG = Object.freeze({
    tokenKey: 'authToken',
    userKey: 'userData',

    // التطبيق يستخدم index.html كشاشة دخول
    loginUrl: '/',

    // لا نستخدم /dashboard لأن التطبيق يعمل داخل index.html
    dashboardUrl: '/',

    // مدة تقريبية للجلسة في الواجهة
    sessionCheckInterval: 5 * 60 * 1000
});

// ============================================================
// 🛡️ أدوات مساعدة
// ============================================================

function safeJSONParse(value, fallback = null) {
    if (!value) return fallback;

    try {
        return JSON.parse(value);
    } catch (error) {
        console.warn('⚠️ تعذر قراءة بيانات المستخدم:', error);
        return fallback;
    }
}

function getStoredToken() {
    return (
        localStorage.getItem(AUTH_CONFIG.tokenKey) ||
        localStorage.getItem('token') ||
        null
    );
}

function getStoredUser() {
    return safeJSONParse(
        localStorage.getItem(AUTH_CONFIG.userKey),
        null
    );
}

// ============================================================
// 🔐 AuthManager
// ============================================================

class AuthManager {

    constructor() {

        this.token = getStoredToken();
        this.user = getStoredUser();

        this.isAuthenticated =
            Boolean(this.token && this.user);

        this.interceptorInstalled = false;
        this.loggingOut = false;

        this.setupInterceptor();

        console.log(
            `🔐 Auth State: ${
                this.isAuthenticated
                    ? '✅ متصل'
                    : '❌ غير متصل'
            }`
        );

        // إذا توجد جلسة محفوظة، نعرض التطبيق
        if (this.isAuthenticated) {
            this.showApplication();
        } else {
            this.showLogin();
        }
    }

    // ========================================================
    // 📡 Fetch Interceptor
    // ========================================================

    setupInterceptor() {

        if (this.interceptorInstalled) {
            return;
        }

        const originalFetch = window.fetch;

        if (!originalFetch) {
            console.error('❌ window.fetch غير متوفر');
            return;
        }

        const self = this;

        window.fetch = async function (...args) {

            let [url, config = {}] = args;

            // ضمان أن config كائن
            config = config || {};

            // تحويل URL إلى نص آمن
            const requestUrl =
                typeof url === 'string'
                    ? url
                    : url?.url || '';

            // نسخ headers
            config.headers = {
                ...(config.headers || {})
            };

            // إضافة Authorization فقط لطلبات API
            if (
                requestUrl.includes('/api/') &&
                self.token
            ) {
                config.headers.Authorization =
                    `Bearer ${self.token}`;
            }

            try {

                const response =
                    await originalFetch.call(
                        window,
                        url,
                        config
                    );

                // جلسة منتهية
                if (
                    response.status === 401 &&
                    requestUrl.includes('/api/')
                ) {

                    console.warn(
                        '⚠️ 401 Unauthorized - الجلسة غير صالحة'
                    );

                    // لا نسجل الخروج أثناء login نفسه
                    if (
                        !requestUrl.includes('/api/auth/login')
                    ) {
                        self.handleUnauthorized();
                    }
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

        this.interceptorInstalled = true;

        console.log(
            '✅ API Fetch Interceptor جاهز'
        );
    }

    // ========================================================
    // 🔑 تسجيل الدخول
    // ========================================================

    async login(username, password) {

        username =
            typeof username === 'string'
                ? username.trim()
                : '';

        password =
            typeof password === 'string'
                ? password
                : '';

        // التحقق من البيانات
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

        // التأكد من وجود API
        if (
            !window.API ||
            typeof window.API.authLogin !== 'function'
        ) {

            throw new Error(
                'ملف API غير محمل. تأكد من تحميل api.js قبل auth.js'
            );
        }

        console.log(
            `🔐 محاولة تسجيل الدخول للمستخدم: ${username}`
        );

        try {

            const response =
                await window.API.authLogin(
                    username,
                    password
                );

            console.log(
                '📥 Login Response:',
                response
            );

            // ==================================================
            // التحقق من نجاح الاستجابة
            // ==================================================

            if (!response) {
                throw new Error(
                    'الخادم لم يرجع استجابة'
                );
            }

            if (
                response.success === false
            ) {
                throw new Error(
                    response.error ||
                    response.message ||
                    'اسم المستخدم أو كلمة المرور غير صحيحة'
                );
            }

            // ==================================================
            // استخراج Token
            // ==================================================

            const token =
                response.token ||
                response.accessToken ||
                response.data?.token ||
                response.data?.accessToken;

            // ==================================================
            // استخراج المستخدم
            // ==================================================

            const user =
                response.user ||
                response.data?.user ||
                response.account ||
                null;

            if (!token) {

                console.error(
                    '❌ لم يتم العثور على Token:',
                    response
                );

                throw new Error(
                    'تم الاتصال بالخادم ولكن لم يتم استلام رمز الدخول'
                );
            }

            // إذا كان السيرفر لا يرجع user
            // ننشئ بيانات مؤقتة
            const finalUser =
                user || {
                    username,
                    role: 'viewer'
                };

            // ==================================================
            // حفظ الجلسة
            // ==================================================

            this.token = token;
            this.user = finalUser;
            this.isAuthenticated = true;

            localStorage.setItem(
                AUTH_CONFIG.tokenKey,
                token
            );

            localStorage.setItem(
                AUTH_CONFIG.userKey,
                JSON.stringify(finalUser)
            );

            // إزالة token القديم إن وجد
            localStorage.removeItem('token');

            console.log(
                '✅ تسجيل الدخول ناجح'
            );

            console.log(
                '👤 المستخدم:',
                finalUser
            );

            // ==================================================
            // فتح التطبيق
            // ==================================================

            this.showApplication();

            // تحديث معلومات المستخدم
            this.displayUserInfo();

            // إشعار
            this.notify(
                `مرحباً ${finalUser.name || finalUser.username || username}`,
                'success'
            );

            return {
                success: true,
                token,
                user: finalUser
            };

        } catch (error) {

            console.error(
                '❌ Login Error:',
                error
            );

            // تنظيف فقط إذا كانت بيانات الجلسة غير صالحة
            if (
                error?.status === 401 ||
                error?.statusCode === 401
            ) {
                this.clearSession();
            }

            throw error;
        }
    }

    // ========================================================
    // 📝 تسجيل مستخدم
    // ========================================================

    async register(userData) {

        if (
            !window.API ||
            typeof window.API.authRegister !== 'function'
        ) {
            throw new Error(
                'API التسجيل غير متوفر'
            );
        }

        try {

            const response =
                await window.API.authRegister(
                    userData
                );

            if (
                response &&
                response.success === false
            ) {
                throw new Error(
                    response.error ||
                    response.message ||
                    'فشل إنشاء المستخدم'
                );
            }

            this.notify(
                'تم إنشاء الحساب بنجاح',
                'success'
            );

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

    logout(showMessage = true) {

        if (this.loggingOut) {
            return;
        }

        this.loggingOut = true;

        console.log(
            '🚪 تسجيل الخروج...'
        );

        this.clearSession();

        this.showLogin();

        if (showMessage) {
            this.notify(
                'تم تسجيل الخروج',
                'info'
            );
        }

        this.loggingOut = false;
    }

    // ========================================================
    // 🧹 تنظيف الجلسة
    // ========================================================

    clearSession() {

        this.token = null;
        this.user = null;
        this.isAuthenticated = false;

        localStorage.removeItem(
            AUTH_CONFIG.tokenKey
        );

        localStorage.removeItem(
            AUTH_CONFIG.userKey
        );

        localStorage.removeItem('token');

        console.log(
            '🧹 تم تنظيف بيانات الجلسة'
        );
    }

    // ========================================================
    // ⚠️ 401 Unauthorized
    // ========================================================

    handleUnauthorized() {

        if (this.loggingOut) {
            return;
        }

        console.warn(
            '⚠️ الجلسة غير صالحة أو منتهية'
        );

        this.clearSession();

        this.showLogin();

        this.notify(
            'انتهت جلسة الدخول، يرجى تسجيل الدخول مرة أخرى',
            'warning'
        );
    }

    // ========================================================
    // 👤 المستخدم الحالي
    // ========================================================

    getCurrentUser() {
        return this.user;
    }

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

        const userRole =
            String(
                this.user.role ||
                ''
            ).toLowerCase();

        if (userRole === 'admin') {
            return true;
        }

        if (Array.isArray(role)) {

            return role
                .map(r =>
                    String(r).toLowerCase()
                )
                .includes(userRole);
        }

        return (
            userRole ===
            String(role).toLowerCase()
        );
    }

    // ========================================================
    // 🔐 الصلاحيات
    // ========================================================

    hasPermission(permission) {

        if (!this.user) {
            return false;
        }

        const role =
            String(
                this.user.role ||
                ''
            ).toLowerCase();

        if (role === 'admin') {
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
            permissions[role] || [];

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
            return null;
        }

        if (
            !window.API ||
            typeof window.API.authMe !== 'function'
        ) {
            console.warn(
                '⚠️ authMe غير متوفر'
            );

            return this.user;
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

                localStorage.setItem(
                    AUTH_CONFIG.userKey,
                    JSON.stringify(
                        this.user
                    )
                );

                this.isAuthenticated = true;

                this.displayUserInfo();

                return this.user;
            }

            return this.user;

        } catch (error) {

            console.error(
                '❌ Refresh User Error:',
                error
            );

            // لا نسجل الخروج من مجرد خطأ شبكة
            if (
                error?.status === 401 ||
                error?.statusCode === 401
            ) {
                this.handleUnauthorized();
            }

            return null;
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
            this.user._id ||
            this.user.id;

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

        if (
            !window.API ||
            typeof window.API.changePassword !== 'function'
        ) {
            throw new Error(
                'واجهة تغيير كلمة المرور غير متوفرة'
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
                response.success === false
            ) {
                throw new Error(
                    response.error ||
                    response.message ||
                    'فشل تغيير كلمة المرور'
                );
            }

            this.notify(
                'تم تغيير كلمة المرور بنجاح',
                'success'
            );

            return response;

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

            this.showLogin();

            return false;
        }

        if (
            requiredRole &&
            !this.hasRole(requiredRole)
        ) {

            this.notify(
                'ليس لديك صلاحية للوصول إلى هذه الصفحة',
                'error'
            );

            return false;
        }

        return true;
    }

    // ========================================================
    // 🎨 إظهار التطبيق
    // ========================================================

    showApplication() {

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

        // تحديث المستخدم
        this.displayUserInfo();

        console.log(
            '🏠 التطبيق الرئيسي مفتوح'
        );
    }

    // ========================================================
    // 🔑 إظهار شاشة الدخول
    // ========================================================

    showLogin() {

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

        // تنظيف كلمة المرور
        const password =
            document.getElementById(
                'password'
            );

        if (password) {
            password.value = '';
        }

        console.log(
            '🔑 شاشة الدخول مفتوحة'
        );
    }

    // ========================================================
    // 👤 عرض معلومات المستخدم
    // ========================================================

    displayUserInfo() {

        if (!this.user) {
            return;
        }

        const displayName =
            this.user.name ||
            this.user.username ||
            'مستخدم';

        const role =
            String(
                this.user.role ||
                'viewer'
            ).toLowerCase();

        const roleNames = {

            admin:
                'مدير النظام',

            manager:
                'مدير',

            viewer:
                'مشاهد',

            مسؤول:
                'مسؤول',

            محرر:
                'محرر',

            مشاهد:
                'مشاهد'
        };

        // اسم المستخدم
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

        // الدور
        const roleElements =
            document.querySelectorAll(
                '.user-role'
            );

        roleElements.forEach(
            element => {
                element.textContent =
                    roleNames[role] ||
                    role;
            }
        );

        // العنصر الموجود في index.html
        const roleDisplay =
            document.getElementById(
                'userRoleDisplay'
            );

        if (roleDisplay) {

            roleDisplay.textContent =
                `👤 ${
                    roleNames[role] ||
                    role
                }`;
        }

        // تحديث اسم المطور/المستخدم إن وجد
        const currentUserElements =
            document.querySelectorAll(
                '[data-current-user]'
            );

        currentUserElements.forEach(
            element => {
                element.textContent =
                    displayName;
            }
        );
    }

    // ========================================================
    // 🔔 الإشعارات
    // ========================================================

    notify(message, type = 'info') {

        if (
            typeof window.showNotification ===
            'function'
        ) {

            try {

                window.showNotification(
                    message,
                    type
                );

                return;

            } catch (error) {

                console.warn(
                    '⚠️ فشل نظام الإشعارات:',
                    error
                );
            }
        }

        console.log(
            `[${type}] ${message}`
        );
    }

    // ========================================================
    // 🔄 التحقق الدوري من الجلسة
    // ========================================================

    startSessionMonitor() {

        if (
            this.sessionMonitor
        ) {
            clearInterval(
                this.sessionMonitor
            );
        }

        if (!this.isAuthenticated) {
            return;
        }

        this.sessionMonitor =
            setInterval(
                async () => {

                    if (
                        !this.isAuthenticated ||
                        !this.token
                    ) {
                        return;
                    }

                    try {
                        await this.refreshUser();
                    } catch (error) {
                        console.warn(
                            '⚠️ Session check failed'
                        );
                    }

                },
                AUTH_CONFIG.sessionCheckInterval
            );
    }
}

// ============================================================
// 🌐 إنشاء مدير المصادقة
// ============================================================

const auth =
    new AuthManager();

// ============================================================
// 🔑 دالة تسجيل الدخول العامة
// ============================================================
// متوافقة مع:
// <button onclick="doLogin()">

async function doLogin(
    username,
    password
) {

    // إذا لم يتم تمرير البيانات
    // نقرأها مباشرة من index.html

    if (
        username === undefined
    ) {

        const usernameElement =
            document.getElementById(
                'username'
            );

        username =
            usernameElement
                ? usernameElement.value
                : '';
    }

    if (
        password === undefined
    ) {

        const passwordElement =
            document.getElementById(
                'password'
            );

        password =
            passwordElement
                ? passwordElement.value
                : '';
    }

    const errorElement =
        document.getElementById(
            'loginError'
        );

    // تنظيف الخطأ القديم
    if (errorElement) {
        errorElement.textContent =
            '';
    }

    // منع الضغط المتكرر
    const loginButton =
        document.querySelector(
            '.login-btn'
        );

    const originalButtonText =
        loginButton
            ? loginButton.innerHTML
            : '';

    try {

        if (loginButton) {

            loginButton.disabled =
                true;

            loginButton.innerHTML =
                '<span>⏳</span> جاري تسجيل الدخول...';
        }

        const result =
            await auth.login(
                username,
                password
            );

        console.log(
            '✅ Login completed:',
            result
        );

        // بعد النجاح، فتح التطبيق
        auth.showApplication();

        // محاولة تشغيل الصفحة الرئيسية
        if (
            typeof window.showPage ===
            'function'
        ) {

            try {
                window.showPage(
                    'dashboard'
                );
            } catch (error) {
                console.warn(
                    '⚠️ تعذر فتح Dashboard تلقائياً:',
                    error
                );
            }
        }

        auth.startSessionMonitor();

        return result;

    } catch (error) {

        console.error(
            '❌ Login Failed:',
            error
        );

        let message =
            error?.message ||
            'اسم المستخدم أو كلمة المرور غير صحيحة';

        // رسائل أكثر وضوحاً
        if (
            message.includes(
                'Failed to fetch'
            )
        ) {

            message =
                'تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت والخادم.';
        }

        if (
            message.includes(
                'CORS'
            )
        ) {

            message =
                'خطأ في إعدادات الاتصال بالخادم (CORS).';
        }

        if (errorElement) {

            errorElement.textContent =
                message;

            errorElement.style.display =
                'block';
        }

        // إخفاء كلمة المرور
        const passwordElement =
            document.getElementById(
                'password'
            );

        if (passwordElement) {
            passwordElement.value =
                '';
        }

        throw error;

    } finally {

        if (loginButton) {

            loginButton.disabled =
                false;

            loginButton.innerHTML =
                originalButtonText ||
                '<span>🚀</span> دخول';
        }
    }
}

// ============================================================
// 🚪 تسجيل الخروج العام
// ============================================================

function doLogout() {

    auth.logout(true);
}

// ============================================================
// 🔎 حالة المصادقة
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
// 🔐 الصلاحية
// ============================================================

function hasPermission(permission) {

    return auth.hasPermission(
        permission
    );
}

// ============================================================
// 🔄 تشغيل عند تحميل الصفحة
// ============================================================

function initializeAuth() {

    console.log(
        '🚀 تهيئة نظام المصادقة...'
    );

    if (auth.isAuthenticated) {

        console.log(
            '🔓 توجد جلسة محفوظة'
        );

        auth.showApplication();

        auth.displayUserInfo();

        // تحديث البيانات من الخادم
        auth.refreshUser()
            .then(() => {
                auth.startSessionMonitor();
            })
            .catch(error => {
                console.warn(
                    '⚠️ تعذر تحديث بيانات المستخدم:',
                    error
                );

                // لا نسجل الخروج تلقائياً
                // بسبب خطأ شبكة مؤقت.
            });

    } else {

        console.log(
            '🔒 لا توجد جلسة محفوظة'
        );

        auth.showLogin();
    }
}

// ============================================================
// ⌨️ Enter لتسجيل الدخول
// ============================================================

document.addEventListener(
    'DOMContentLoaded',
    () => {

        initializeAuth();

        const username =
            document.getElementById(
                'username'
            );

        const password =
            document.getElementById(
                'password'
            );

        [username, password]
            .filter(Boolean)
            .forEach(
                element => {

                    element.addEventListener(
                        'keydown',
                        event => {

                            if (
                                event.key ===
                                'Enter'
                            ) {

                                event.preventDefault();

                                doLogin()
                                    .catch(
                                        () => {}
                                    );
                            }
                        }
                    );
                }
            );
    }
);

// ============================================================
// 🌐 تصدير عالمي
// ============================================================

window.auth =
    auth;

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

window.AuthManager =
    AuthManager;

// ============================================================
// ✅ جاهز
// ============================================================

console.log(
    '✅ Auth System Ready - نظام المصادقة جاهز 10/10'
);
