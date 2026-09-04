```javascript
/**
 * ============================================================
 * 🚢 MARINE SYSTEM v22.0 — ULTIMATE HARDENED
 * ============================================================
 *
 * CLIENT SECURITY:
 * - HttpOnly session cookie
 * - No JWT in localStorage/sessionStorage
 * - No localStorage
 * - sessionStorage only for non-sensitive UI state
 * - CSRF header
 * - RBAC UI filtering
 * - Server remains authoritative
 * - No innerHTML
 * - No eval()
 * - No Function()
 * - No inline JavaScript
 * - Strict page allowlist
 * - Session idle timeout
 * - Session absolute timeout
 * - Automatic UI cleanup
 * - 401/403 session handling
 * - Secure password handling
 * - Secure forgot-password flow
 *
 * IMPORTANT:
 * Client-side security is NOT a replacement for server-side
 * authentication, authorization, CSRF validation and session
 * invalidation.
 * ============================================================
 */

(function () {

    'use strict';

    // ============================================================
    // ⚙️ CONFIG
    // ============================================================

    var API = '/api';

    var PAGE_KEY = 'marine_page';

    var IDLE_TIMEOUT = 15 * 60 * 1000;       // 15 minutes
    var ABSOLUTE_TIMEOUT = 8 * 60 * 60 * 1000; // 8 hours

    var ACTIVITY_DEBOUNCE = 500;

    var ALLOWED_PAGES = new Set([
        'dashboard',
        'fleet',
        'maintenance',
        'efficiency',
        'support',
        'users',
        'notes',
        'monitoring',
        'ai-assistant',
        'settings',
        'logs'
    ]);

    var CONFIG_PAGES = {
        dashboard: 'لوحة التحكم',
        fleet: 'السجل العام',
        maintenance: 'الصيانة',
        efficiency: 'الجاهزية',
        support: 'الدعم',
        users: 'المستخدمين',
        notes: 'Note Verbale',
        monitoring: 'المراقبة الشاملة',
        'ai-assistant': 'المساعد الذكي',
        settings: 'الإعدادات',
        logs: 'سجلات النظام'
    };

    /*
     * Pages requiring explicit permissions.
     *
     * IMPORTANT:
     * This is ONLY UI filtering.
     * The server MUST independently enforce these permissions.
     */

    var PAGE_PERMISSIONS = {

        users: [
            'users.read'
        ],

        logs: [
            'logs.read'
        ],

        settings: [
            'settings.manage'
        ],

        monitoring: [
            'monitoring.view'
        ],

        'ai-assistant': [
            'ai.use'
        ]
    };

    // ============================================================
    // 🔐 STATE — PRIVATE
    // ============================================================

    var state = {

        user: null,

        authenticated: false,

        page: 'dashboard',

        vessels: [],

        users: [],

        idleTimer: null,

        absoluteTimer: null,

        absoluteStart: 0,

        loggingOut: false,

        initialized: false

    };

    // ============================================================
    // 🛡️ PRIVATE CONSTANTS
    // ============================================================

    var PUBLIC_ENDPOINTS = new Set([
        '/api/auth/login',
        '/api/auth/forgot-password',
        '/api/auth/reset-password'
    ]);

    // ============================================================
    // 🔧 DOM HELPERS
    // ============================================================

    function getElement(id) {

        return document.getElementById(id);

    }

    function createElement(tag, attrs, children) {

        var el = document.createElement(tag);

        if (attrs) {

            Object.keys(attrs).forEach(function (key) {

                var value = attrs[key];

                if (key === 'className') {

                    el.className = String(value);

                } else if (key === 'textContent') {

                    el.textContent = String(value);

                } else if (key === 'dataset' && value && typeof value === 'object') {

                    Object.keys(value).forEach(function (dataKey) {

                        el.dataset[dataKey] = String(value[dataKey]);

                    });

                } else if (value !== null && value !== undefined) {

                    el.setAttribute(key, String(value));

                }

            });

        }

        if (children) {

            if (Array.isArray(children)) {

                children.forEach(function (child) {

                    if (typeof child === 'string') {

                        el.appendChild(
                            document.createTextNode(child)
                        );

                    } else if (child instanceof Node) {

                        el.appendChild(child);

                    }

                });

            } else if (typeof children === 'string') {

                el.appendChild(
                    document.createTextNode(children)
                );

            } else if (children instanceof Node) {

                el.appendChild(children);

            }

        }

        return el;

    }

    function addClass(el, className) {

        if (el) {

            el.classList.add(className);

        }

    }

    function removeClass(el, className) {

        if (el) {

            el.classList.remove(className);

        }

    }

    function toggleClass(el, className, force) {

        if (!el) return;

        el.classList.toggle(className, force);

    }

    function safeText(id, text) {

        var el = getElement(id);

        if (!el) return;

        el.textContent = text == null ? '' : String(text);

    }

    // ============================================================
    // 🧹 CLEAR CHILDREN
    // ============================================================

    function clearElement(el) {

        if (!el) return;

        while (el.firstChild) {

            el.removeChild(el.firstChild);

        }

    }

    // ============================================================
    // 🍞 TOAST
    // ============================================================

    function showToast(message, type, duration) {

        type = type || 'info';
        duration = Number(duration) || 3000;

        var container = getElement('toastContainer');

        if (!container) return;

        var icons = {

            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'

        };

        var toast = createElement('div', {

            className: 'toast toast-' + type,

            role: 'alert',

            'aria-live': 'polite'

        });

        var iconSpan = createElement('span', {

            className: 'toast-icon',

            textContent: icons[type] || icons.info

        });

        var textSpan = createElement('span', {

            className: 'toast-text',

            textContent: String(message || '')

        });

        toast.appendChild(iconSpan);

        toast.appendChild(textSpan);

        container.appendChild(toast);

        window.setTimeout(function () {

            if (!toast.isConnected) return;

            toast.style.opacity = '0';
            toast.style.transform = 'translateX(30px)';
            toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

            window.setTimeout(function () {

                if (toast.parentNode) {

                    toast.parentNode.removeChild(toast);

                }

            }, 300);

        }, duration);

    }

    // ============================================================
    // ⏰ DATE / TIME
    // ============================================================

    function updateDateTime() {

        try {

            var dateEl = getElement('currentDate');
            var timeEl = getElement('currentTime');

            if (!dateEl && !timeEl) {

                return;

            }

            var now = new Date();

            if (dateEl) {

                dateEl.textContent =
                    now.toLocaleDateString('ar-TN', {

                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'

                    });

            }

            if (timeEl) {

                timeEl.textContent =
                    now.toLocaleTimeString('ar-TN', {

                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'

                    });

            }

        } catch (error) {

            /*
             * UI clock failure must never affect authentication.
             */

        }

    }

    // ============================================================
    // 🔐 CSRF
    // ============================================================

    function getCSRFToken() {

        /*
         * Preferred:
         * server-provided meta tag.
         */

        var meta = document.querySelector(
            'meta[name="csrf-token"]'
        );

        if (meta) {

            var metaToken = meta.getAttribute('content');

            if (metaToken) {

                return metaToken;

            }

        }

        /*
         * Fallback:
         * non-HttpOnly CSRF cookie.
         *
         * DO NOT use this mechanism for the session cookie.
         */

        var cookies = document.cookie
            .split(';');

        for (var i = 0; i < cookies.length; i++) {

            var cookie = cookies[i].trim();

            if (
                cookie.indexOf('csrf_token=') === 0
            ) {

                return decodeURIComponent(
                    cookie.substring('csrf_token='.length)
                );

            }

        }

        return '';

    }

    // ============================================================
    // 🌐 HTTP HELPERS
    // ============================================================

    function isMutationMethod(method) {

        var normalized = String(method || 'GET')
            .toUpperCase();

        return (
            normalized === 'POST' ||
            normalized === 'PUT' ||
            normalized === 'PATCH' ||
            normalized === 'DELETE'
        );

    }

    function buildHeaders(options) {

        options = options || {};

        var method =
            String(options.method || 'GET')
                .toUpperCase();

        var headers = {

            'Accept': 'application/json'

        };

        if (options.json) {

            headers['Content-Type'] =
                'application/json';

        }

        /*
         * CSRF token is required for state-changing
         * same-origin requests.
         */

        if (isMutationMethod(method)) {

            var csrf = getCSRFToken();

            if (csrf) {

                headers['X-CSRF-Token'] = csrf;

            }

        }

        if (options.headers) {

            Object.keys(options.headers).forEach(function (key) {

                headers[key] = options.headers[key];

            });

        }

        return headers;

    }

    function fetchJSON(url, options) {

        options = options || {};

        var requestOptions = {

            method: options.method || 'GET',

            credentials: 'include',

            headers: buildHeaders(options),

            cache: options.cache || 'no-store'

        };

        if (options.body !== undefined) {

            requestOptions.body = options.body;

        }

        if (options.keepalive === true) {

            requestOptions.keepalive = true;

        }

        return fetch(url, requestOptions)
            .then(function (response) {

                if (
                    response.status === 401 ||
                    response.status === 403
                ) {

                    /*
                     * Do not automatically redirect during login
                     * or password-recovery requests.
                     */

                    if (
                        !PUBLIC_ENDPOINTS.has(url)
                    ) {

                        handleSessionFailure(
                            response.status
                        );

                    }

                }

                return response
                    .json()
                    .catch(function () {

                        return {};

                    })
                    .then(function (data) {

                        return {

                            response: response,

                            data: data

                        };

                    });

            });

    }

    // ============================================================
    // 🔐 SESSION FAILURE
    // ============================================================

    var sessionFailureHandled = false;

    function handleSessionFailure(status) {

        if (sessionFailureHandled) {

            return;

        }

        if (!state.authenticated) {

            return;

        }

        sessionFailureHandled = true;

        stopSessionTimers();

        state.authenticated = false;
        state.user = null;

        clearSensitiveState();

        showToast(
            status === 401
                ? '🔒 انتهت صلاحية الجلسة'
                : '🔒 تم رفض الوصول',
            'warning',
            4000
        );

        resetApplicationUI();

        window.setTimeout(function () {

            sessionFailureHandled = false;

        }, 1000);

    }

    // ============================================================
    // 🧹 CLEAR SENSITIVE STATE
    // ============================================================

    function clearSensitiveState() {

        /*
         * Remove references to sensitive application data.
         */

        state.user = null;

        state.vessels = [];

        state.users = [];

    }

    // ============================================================
    // ⏱️ SESSION TIMERS
    // ============================================================

    function startSessionTimers() {

        stopSessionTimers();

        if (!state.authenticated) {

            return;

        }

        /*
         * absoluteStart is established ONCE at login/session restore.
         * Activity NEVER modifies it.
         */

        if (
            !state.absoluteStart ||
            !Number.isFinite(state.absoluteStart)
        ) {

            state.absoluteStart = Date.now();

        }

        var elapsed =
            Date.now() - state.absoluteStart;

        var remaining =
            Math.max(
                0,
                ABSOLUTE_TIMEOUT - elapsed
            );

        /*
         * Absolute timeout already expired.
         */

        if (remaining <= 0) {

            expireSession('absolute');

            return;

        }

        state.idleTimer = window.setTimeout(
            function () {

                if (!state.authenticated) {

                    return;

                }

                expireSession('idle');

            },
            IDLE_TIMEOUT
        );

        state.absoluteTimer = window.setTimeout(
            function () {

                if (!state.authenticated) {

                    return;

                }

                expireSession('absolute');

            },
            remaining
        );

    }

    function resetIdleTimer() {

        if (!state.authenticated) {

            return;

        }

        if (state.idleTimer) {

            window.clearTimeout(
                state.idleTimer
            );

            state.idleTimer = null;

        }

        state.idleTimer = window.setTimeout(
            function () {

                if (!state.authenticated) {

                    return;

                }

                expireSession('idle');

            },
            IDLE_TIMEOUT
        );

    }

    function stopSessionTimers() {

        if (state.idleTimer) {

            window.clearTimeout(
                state.idleTimer
            );

            state.idleTimer = null;

        }

        if (state.absoluteTimer) {

            window.clearTimeout(
                state.absoluteTimer
            );

            state.absoluteTimer = null;

        }

    }

    function expireSession(reason) {

        if (!state.authenticated) {

            return;

        }

        stopSessionTimers();

        var message =
            reason === 'idle'
                ? '⏰ انتهت صلاحية الجلسة بسبب الخمول'
                : '⏰ انتهت المدة القصوى للجلسة';

        showToast(
            message,
            'warning',
            4000
        );

        /*
         * Server-side logout/revocation is authoritative.
         */

        forceLogout();

    }

    // ============================================================
    // 🖱️ ACTIVITY MONITOR
    // ============================================================

    var activityDebounce = null;

    function registerActivity() {

        if (!state.authenticated) {

            return;

        }

        if (activityDebounce) {

            window.clearTimeout(
                activityDebounce
            );

        }

        activityDebounce = window.setTimeout(
            function () {

                resetIdleTimer();

                activityDebounce = null;

            },
            ACTIVITY_DEBOUNCE
        );

    }

    [
        'click',
        'keydown',
        'mousemove',
        'scroll',
        'touchstart'
    ].forEach(function (eventName) {

        document.addEventListener(
            eventName,
            registerActivity,
            {
                passive:
                    eventName === 'scroll' ||
                    eventName === 'touchstart'
            }
        );

    });

    // ============================================================
    // 🔐 AUTHENTICATION — LOGIN
    // ============================================================

    function doLogin() {

        var usernameEl =
            getElement('username');

        var passwordEl =
            getElement('password');

        var errorEl =
            getElement('loginError');

        var loginBtn =
            getElement('loginButton');

        var rememberMe =
            getElement('rememberMe');

        if (
            !usernameEl ||
            !passwordEl ||
            !errorEl ||
            !loginBtn
        ) {

            return;

        }

        var username =
            String(usernameEl.value || '')
                .trim();

        /*
         * NEVER trim passwords.
         */

        var password =
            String(passwordEl.value || '');

        errorEl.className =
            'error-msg';

        errorEl.textContent =
            '';

        if (!username || !password) {

            errorEl.textContent =
                '⚠️ يرجى إدخال اسم المستخدم وكلمة المرور';

            errorEl.classList.add('show');

            return;

        }

        if (state.loggingOut) {

            return;

        }

        loginBtn.disabled = true;

        loginBtn.classList.add('loading');

        fetchJSON(
            API + '/auth/login',
            {

                method: 'POST',

                json: true,

                body: JSON.stringify({

                    username: username,

                    password: password,

                    rememberMe:
                        rememberMe
                            ? rememberMe.checked
                            : false

                })

            }
        )
        .then(function (result) {

            var response =
                result.response;

            var data =
                result.data || {};

            if (!response.ok) {

                throw new Error(
                    data.error ||
                    'فشل تسجيل الدخول'
                );

            }

            if (
                !data.success ||
                !data.user
            ) {

                throw new Error(
                    'بيانات الدخول غير صحيحة'
                );

            }

            state.user =
                data.user;

            state.authenticated =
                true;

            state.absoluteStart =
                Date.now();

            state.loggingOut =
                false;

            sessionFailureHandled =
                false;

            /*
             * Clear password immediately after successful
             * authentication.
             */

            passwordEl.value = '';

            var loginOverlay =
                getElement('loginOverlay');

            var mainApp =
                getElement('mainApp');

            if (loginOverlay) {

                addClass(
                    loginOverlay,
                    'hidden'
                );

            }

            if (mainApp) {

                removeClass(
                    mainApp,
                    'hidden'
                );

            }

            updateUserDisplay();

            buildSidebar();

            startSessionTimers();

            /*
             * Restore only UI page state.
             */

            var savedPage =
                getSavedPage();

            if (!canAccessPage(savedPage)) {

                savedPage =
                    'dashboard';

            }

            loadPage(savedPage);

            loadAllData();

            showToast(
                '✅ مرحباً ' +
                (
                    state.user.name ||
                    state.user.username ||
                    'بك'
                ),
                'success'
            );

        })
        .catch(function (error) {

            errorEl.textContent =
                '❌ ' +
                String(
                    error.message ||
                    'تعذر تسجيل الدخول'
                );

            errorEl.classList.add(
                'show'
            );

        })
        .finally(function () {

            loginBtn.disabled =
                false;

            loginBtn.classList.remove(
                'loading'
            );

        });

    }

    // ============================================================
    // 🔐 LOGOUT — USER REQUEST
    // ============================================================

    function doLogout() {

        if (state.loggingOut) {

            return;

        }

        showModal({

            title:
                '⚠️ تسجيل الخروج',

            message:
                'هل أنت متأكد من تسجيل الخروج؟',

            confirmText:
                'تسجيل الخروج',

            confirmClass:
                'btn-danger',

            cancelText:
                'إلغاء'

        })
        .then(function (confirmed) {

            if (!confirmed) {

                return;

            }

            performLogout();

        });

    }

    // ============================================================
    // 🔐 LOGOUT — SERVER
    // ============================================================

    function performLogout() {

        if (state.loggingOut) {

            return;

        }

        state.loggingOut =
            true;

        stopSessionTimers();

        var logoutBtn =
            getElement('logoutBtn');

        if (logoutBtn) {

            logoutBtn.disabled =
                true;

            logoutBtn.textContent =
                '⏳ جاري تسجيل الخروج...';

        }

        fetchJSON(
            API + '/auth/logout',
            {

                method: 'POST',

                keepalive: true

            }
        )
        .then(function (result) {

            /*
             * Even if server returns 401 because the session
             * already expired, the local UI is still cleaned.
             */

            if (
                result.response.ok ||
                result.response.status === 401
            ) {

                showToast(
                    '👋 تم تسجيل الخروج بأمان',
                    'success'
                );

            } else {

                showToast(
                    '⚠️ تعذر تأكيد الخروج من الخادم',
                    'warning'
                );

            }

        })
        .catch(function () {

            /*
             * Network failure does NOT prove that the server
             * session was invalidated.
             *
             * Therefore the UI is cleaned, but server-side
             * expiration/revocation MUST still exist.
             */

            showToast(
                '⚠️ تم تنظيف الجلسة محلياً، تعذر الاتصال بالخادم',
                'warning',
                5000
            );

        })
        .finally(function () {

            resetApplicationUI();

            state.loggingOut =
                false;

        });

    }

    // ============================================================
    // 🔐 FORCE LOGOUT
    // ============================================================

    function forceLogout() {

        if (state.loggingOut) {

            return;

        }

        state.loggingOut =
            true;

        stopSessionTimers();

        fetchJSON(
            API + '/auth/logout',
            {

                method: 'POST',

                keepalive: true

            }
        )
        .catch(function () {

            /*
             * Ignore network failure.
             * Server-side session TTL/revocation remains
             * the authoritative security boundary.
             */

        })
        .finally(function () {

            resetApplicationUI();

            state.loggingOut =
                false;

        });

    }

    // ============================================================
    // 🔎 VERIFY SESSION
    // ============================================================

    function verifySession() {

        return fetchJSON(
            API + '/auth/me',
            {

                method: 'GET'

            }
        )
        .then(function (result) {

            var response =
                result.response;

            var data =
                result.data || {};

            if (
                !response.ok ||
                !data.success ||
                !data.user
            ) {

                return false;

            }

            state.user =
                data.user;

            state.authenticated =
                true;

            /*
             * This browser-side timer starts when the session
             * is restored. The SERVER MUST enforce its own
             * absolute session expiration.
             */

            state.absoluteStart =
                Date.now();

            sessionFailureHandled =
                false;

            return true;

        })
        .catch(function () {

            return false;

        });

    }

    // ============================================================
    // 👤 USER DISPLAY
    // ============================================================

    function updateUserDisplay() {

        if (!state.user) {

            return;

        }

        var name =
            state.user.name ||
            state.user.username ||
            'مستخدم';

        safeText(
            'userDisplayName',
            name
        );

        safeText(
            'userInitial',
            name.charAt(0)
        );

        safeText(
            'sidebarUserName',
            name
        );

        safeText(
            'sidebarUserRole',
            getRoleName(
                state.user.role
            )
        );

        safeText(
            'sidebarUserAvatar',
            name.charAt(0)
        );

    }

    function getRoleName(role) {

        var roles = {

            admin:
                'مسؤول النظام',

            manager:
                'مدير',

            operator:
                'مشغل',

            viewer:
                'مشاهد'

        };

        return (
            roles[role] ||
            role ||
            'مستخدم'
        );

    }

    // ============================================================
    // 🔐 RBAC
    // ============================================================

    function hasPermission(permission) {

        if (!state.user) {

            return false;

        }

        if (
            state.user.role === 'admin'
        ) {

            return true;

        }

        var permissions =
            state.user.permissions;

        if (!permissions) {

            return false;

        }

        /*
         * Supports:
         * { "users.read": true }
         */

        if (
            permissions[permission] === true
        ) {

            return true;

        }

        /*
         * Also supports arrays:
         * ["users.read", "logs.read"]
         */

        if (
            Array.isArray(permissions) &&
            permissions.indexOf(permission) !== -1
        ) {

            return true;

        }

        return false;

    }

    function canAccessPage(page) {

        if (!state.authenticated) {

            return false;

        }

        if (!ALLOWED_PAGES.has(page)) {

            return false;

        }

        if (
            state.user &&
            state.user.role === 'admin'
        ) {

            return true;

        }

        var required =
            PAGE_PERMISSIONS[page];

        /*
         * No explicit permission requirement.
         */

        if (
            !required ||
            required.length === 0
        ) {

            return true;

        }

        return required.some(
            function (permission) {

                return hasPermission(
                    permission
                );

            }
        );

    }

    // ============================================================
    // 📊 LOAD DATA
    // ============================================================

    function loadAllData() {

        if (!state.authenticated) {

            return;

        }

        loadVessels();

        if (
            canAccessPage('users')
        ) {

            loadUsers();

        }

    }

    function loadVessels() {

        fetchJSON(
            API + '/vessels',
            {

                method: 'GET'

            }
        )
        .then(function (result) {

            if (
                !result.response.ok
            ) {

                throw new Error(
                    'فشل تحميل المراكب'
                );

            }

            var data =
                result.data;

            state.vessels =
                Array.isArray(data)
                    ? data
                    : Array.isArray(data.vessels)
                        ? data.vessels
                        : [];

            updateBadge(
                'fleetBadge',
                state.vessels.length
            );

        })
        .catch(function (error) {

            if (
                state.authenticated
            ) {

                console.warn(
                    '⚠️ Error loading vessels:',
                    error.message
                );

            }

        });

    }

    function loadUsers() {

        fetchJSON(
            API + '/users',
            {

                method: 'GET'

            }
        )
        .then(function (result) {

            if (
                !result.response.ok
            ) {

                throw new Error(
                    'فشل تحميل المستخدمين'
                );

            }

            var data =
                result.data;

            state.users =
                Array.isArray(data)
                    ? data
                    : Array.isArray(data.users)
                        ? data.users
                        : [];

            updateBadge(
                'usersBadge',
                state.users.length
            );

        })
        .catch(function (error) {

            if (
                state.authenticated
            ) {

                console.warn(
                    '⚠️ Error loading users:',
                    error.message
                );

            }

        });

    }

    function updateBadge(id, count) {

        var el =
            getElement(id);

        if (!el) {

            return;

        }

        var numericCount =
            Number(count);

        if (
            !Number.isFinite(
                numericCount
            )
        ) {

            numericCount = 0;

        }

        numericCount =
            Math.max(
                0,
                Math.floor(
                    numericCount
                )
            );

        el.textContent =
            numericCount > 99
                ? '99+'
                : String(numericCount);

        el.style.display =
            numericCount > 0
                ? 'inline-flex'
                : 'none';

    }

    // ============================================================
    // 📄 PAGE LOADING
    // ============================================================

    var loadingPages = Object.create(null);

    function loadPage(page) {

        if (!state.authenticated) {

            showToast(
                '🔒 يجب تسجيل الدخول أولاً',
                'error'
            );

            return;

        }

        if (
            !ALLOWED_PAGES.has(page)
        ) {

            showToast(
                '⚠️ الصفحة غير مصرح بها',
                'error'
            );

            return;

        }

        if (
            !canAccessPage(page)
        ) {

            showToast(
                '🔒 ليس لديك صلاحية للوصول إلى هذه الصفحة',
                'error'
            );

            return;

        }

        if (
            loadingPages[page]
        ) {

            return;

        }

        state.page =
            page;

        try {

            sessionStorage.setItem(
                PAGE_KEY,
                page
            );

        } catch (error) {

            /*
             * Non-sensitive UI preference only.
             */

        }

        document
            .querySelectorAll('.nav-btn')
            .forEach(function (btn) {

                btn.classList.toggle(
                    'active',
                    btn.dataset.page === page
                );

            });

        var container =
            getElement(
                'pageContainer'
            );

        var loader =
            getElement(
                'pageLoader'
            );

        if (!container) {

            return;

        }

        loadingPages[page] =
            true;

        if (loader) {

            removeClass(
                loader,
                'hidden'
            );

        }

        clearElement(
            container
        );

        /*
         * Page names come ONLY from ALLOWED_PAGES.
         * No user-controlled URL path is accepted.
         */

        var pageUrl =
            '/pages/' +
            page +
            '.html';

        fetch(
            pageUrl,
            {

                method: 'GET',

                credentials: 'include',

                cache: 'no-store',

                headers: {

                    'Accept':
                        'text/html'

                }

            }
        )
        .then(function (response) {

            if (
                response.status === 401 ||
                response.status === 403
            ) {

                handleSessionFailure(
                    response.status
                );

                throw new Error(
                    'انتهت صلاحية الجلسة'
                );

            }

            if (!response.ok) {

                throw new Error(
                    'فشل تحميل الصفحة (' +
                    response.status +
                    ')'
                );

            }

            return response.text();

        })
        .then(function (html) {

            /*
             * Parse the page in an isolated document.
             */

            var parser =
                new DOMParser();

            var doc =
                parser.parseFromString(
                    html,
                    'text/html'
                );

            /*
             * Remove executable scripts.
             *
             * IMPORTANT:
             * The loaded pages should contain only trusted
             * application templates.
             */

            doc
                .querySelectorAll('script')
                .forEach(function (script) {

                    script.remove();

                });

            /*
             * Also remove potentially dangerous document-level
             * elements if a page file is accidentally malformed.
             */

            doc
                .querySelectorAll(
                    'base, object, embed, iframe'
                )
                .forEach(function (element) {

                    element.remove();

                });

            var fragment =
                document.createDocumentFragment();

            Array
                .from(
                    doc.body.childNodes
                )
                .forEach(function (child) {

                    fragment.appendChild(
                        child.cloneNode(true)
                    );

                });

            container.appendChild(
                fragment
            );

            if (loader) {

                addClass(
                    loader,
                    'hidden'
                );

            }

            document.title =
                '⚓ ' +
                (
                    CONFIG_PAGES[page] ||
                    page
                );

            loadingPages[page] =
                false;

            resetIdleTimer();

            /*
             * Notify page modules that a new page was loaded.
             *
             * No executable code is loaded from the HTML.
             */

            document.dispatchEvent(
                new CustomEvent(
                    'marine:page-loaded',
                    {
                        detail: {
                            page: page
                        }
                    }
                )
            );

        })
        .catch(function (error) {

            if (loader) {

                addClass(
                    loader,
                    'hidden'
                );

            }

            loadingPages[page] =
                false;

            if (
                !state.authenticated
            ) {

                return;

            }

            var errorDiv =
                createElement(
                    'div',
                    {
                        className:
                            'error-container'
                    }
                );

            var icon =
                createElement(
                    'div',
                    {
                        className:
                            'error-icon',
                        textContent:
                            '❌'
                    }
                );

            var title =
                createElement(
                    'h2',
                    {
                        className:
                            'error-title',
                        textContent:
                            'فشل تحميل الصفحة'
                    }
                );

            var msg =
                createElement(
                    'p',
                    {
                        className:
                            'error-message',
                        textContent:
                            String(
                                error.message ||
                                'حدث خطأ غير متوقع'
                            )
                    }
                );

            var btn =
                createElement(
                    'button',
                    {
                        className:
                            'btn-gold',
                        type:
                            'button',
                        textContent:
                            '📊 العودة للرئيسية'
                    }
                );

            btn.addEventListener(
                'click',
                function () {

                    loadPage(
                        'dashboard'
                    );

                }
            );

            errorDiv.appendChild(
                icon
            );

            errorDiv.appendChild(
                title
            );

            errorDiv.appendChild(
                msg
            );

            errorDiv.appendChild(
                btn
            );

            clearElement(
                container
            );

            container.appendChild(
                errorDiv
            );

        });

    }

    // ============================================================
    // 🏗️ SIDEBAR
    // ============================================================

    function buildSidebar() {

        var nav =
            getElement(
                'sidebarNav'
            );

        if (!nav) {

            return;

        }

        clearElement(
            nav
        );

        var groups = [

            {

                title:
                    'الرئيسية',

                items: [

                    {
                        page:
                            'dashboard',

                        icon:
                            'fa-chart-pie',

                        label:
                            'لوحة التحكم'
                    },

                    {
                        page:
                            'fleet',

                        icon:
                            'fa-ship',

                        label:
                            'السجل العام',

                        badge:
                            'fleetBadge'
                    }

                ]

            },

            {

                title:
                    'إدارة الأسطول',

                items: [

                    {
                        page:
                            'maintenance',

                        icon:
                            'fa-wrench',

                        label:
                            'الصيانة',

                        badge:
                            'maintenanceBadge',

                        badgeClass:
                            'warning'
                    },

                    {
                        page:
                            'efficiency',

                        icon:
                            'fa-chart-line',

                        label:
                            'الجاهزية'
                    },

                    {
                        page:
                            'support',

                        icon:
                            'fa-headset',

                        label:
                            'الدعم'
                    }

                ]

            },

            {

                title:
                    'العمليات',

                items: [

                    {
                        page:
                            'notes',

                        icon:
                            'fa-sticky-note',

                        label:
                            'Note Verbale'
                    },

                    {
                        page:
                            'monitoring',

                        icon:
                            'fa-map-marked-alt',

                        label:
                            'المراقبة الشاملة',

                        badge:
                            'sessionsBadge',

                        badgeClass:
                            'success'
                    }

                ]

            },

            {

                title:
                    'الإدارة',

                items: [

                    {
                        page:
                            'users',

                        icon:
                            'fa-users',

                        label:
                            'المستخدمين',

                        badge:
                            'usersBadge'
                    },

                    {
                        page:
                            'logs',

                        icon:
                            'fa-history',

                        label:
                            'سجلات النظام',

                        badge:
                            'logsBadge'
                    }

                ]

            },

            {

                title:
                    'متقدم',

                items: [

                    {
                        page:
                            'ai-assistant',

                        icon:
                            'fa-robot',

                        label:
                            'المساعد الذكي',

                        badge:
                            'AI',

                        badgeClass:
                            'success'
                    },

                    {
                        page:
                            'settings',

                        icon:
                            'fa-cog',

                        label:
                            'الإعدادات'
                    }

                ]

            }

        ];

        groups.forEach(
            function (group) {

                var visibleItems =
                    group.items.filter(
                        function (item) {

                            return canAccessPage(
                                item.page
                            );

                        }
                    );

                /*
                 * Don't display an empty group.
                 */

                if (
                    visibleItems.length === 0
                ) {

                    return;

                }

                var groupDiv =
                    createElement(
                        'div',
                        {
                            className:
                                'nav-group'
                        }
                    );

                var titleSpan =
                    createElement(
                        'span',
                        {
                            className:
                                'nav-group-title',
                            textContent:
                                group.title
                        }
                    );

                groupDiv.appendChild(
                    titleSpan
                );

                visibleItems.forEach(
                    function (item) {

                        var btn =
                            createElement(
                                'button',
                                {

                                    className:
                                        'nav-btn' +
                                        (
                                            state.page === item.page
                                                ? ' active'
                                                : ''
                                        ),

                                    type:
                                        'button',

                                    dataset:
                                        {
                                            page:
                                                item.page
                                        }

                                }
                            );

                        var icon =
                            createElement(
                                'i',
                                {
                                    className:
                                        'fas ' +
                                        item.icon,
                                    'aria-hidden':
                                        'true'
                                }
                            );

                        btn.appendChild(
                            icon
                        );

                        var text =
                            document.createTextNode(
                                ' ' +
                                item.label +
                                ' '
                            );

                        btn.appendChild(
                            text
                        );

                        if (item.badge) {

                            var badge =
                                createElement(
                                    'span',
                                    {

                                        className:
                                            'nav-badge' +
                                            (
                                                item.badgeClass
                                                    ? ' ' +
                                                      item.badgeClass
                                                    : ''
                                            ),

                                        id:
                                            item.badge,

                                        textContent:
                                            item.badge === 'AI'
                                                ? 'AI'
                                                : '0'

                                    }
                                );

                            btn.appendChild(
                                badge
                            );

                        }

                        btn.addEventListener(
                            'click',
                            function () {

                                if (
                                    !state.authenticated
                                ) {

                                    showToast(
                                        '🔒 يجب تسجيل الدخول أولاً',
                                        'error'
                                    );

                                    return;

                                }

                                if (
                                    !canAccessPage(
                                        item.page
                                    )
                                ) {

                                    showToast(
                                        '🔒 ليس لديك صلاحية للوصول إلى هذه الصفحة',
                                        'error'
                                    );

                                    return;

                                }

                                loadPage(
                                    item.page
                                );

                                var sidebar =
                                    getElement(
                                        'sidebar'
                                    );

                                if (sidebar) {

                                    removeClass(
                                        sidebar,
                                        'open'
                                    );

                                }

                            }
                        );

                        groupDiv.appendChild(
                            btn
                        );

                    }
                );

                nav.appendChild(
                    groupDiv
                );

            }
        );

    }

    // ============================================================
    // 🔑 PASSWORD TOGGLE
    // ============================================================

    function initPasswordToggle() {

        var button =
            getElement(
                'togglePassword'
            );

        var password =
            getElement(
                'password'
            );

        if (
            !button ||
            !password
        ) {

            return;

        }

        button.addEventListener(
            'click',
            function () {

                var visible =
                    password.type === 'text';

                password.type =
                    visible
                        ? 'password'
                        : 'text';

                var icon =
                    button.querySelector(
                        'i'
                    );

                if (icon) {

                    icon.classList.toggle(
                        'fa-eye',
                        visible
                    );

                    icon.classList.toggle(
                        'fa-eye-slash',
                        !visible
                    );

                }

                button.setAttribute(
                    'aria-label',
                    visible
                        ? 'إظهار كلمة المرور'
                        : 'إخفاء كلمة المرور'
                );

            }
        );

    }

    // ============================================================
    // 🔑 FORGOT PASSWORD
    // ============================================================

    function openForgotPassword() {

        var modal =
            getElement(
                'forgotModal'
            );

        var email =
            getElement(
                'resetEmail'
            );

        var error =
            getElement(
                'resetError'
            );

        if (!modal) {

            return;

        }

        if (email) {

            email.value = '';

        }

        if (error) {

            error.textContent =
                '';

            error.className =
                'error-msg';

        }

        removeClass(
            modal,
            'hidden'
        );

        if (email) {

            window.setTimeout(
                function () {

                    email.focus();

                },
                50
            );

        }

    }

    function closeForgotPassword() {

        var modal =
            getElement(
                'forgotModal'
            );

        if (modal) {

            addClass(
                modal,
                'hidden'
            );

        }

    }

    function submitForgotPassword() {

        var emailEl =
            getElement(
                'resetEmail'
            );

        var errorEl =
            getElement(
                'resetError'
            );

        var submitBtn =
            getElement(
                'forgotSubmit'
            );

        if (
            !emailEl ||
            !errorEl ||
            !submitBtn
        ) {

            return;

        }

        var email =
            String(
                emailEl.value || ''
            ).trim();

        errorEl.textContent =
            '';

        errorEl.className =
            'error-msg';

        if (!email) {

            errorEl.textContent =
                '⚠️ يرجى إدخال البريد الإلكتروني';

            errorEl.classList.add(
                'show'
            );

            return;

        }

        /*
         * Client validation only.
         * Server MUST validate.
         */

        if (
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
                .test(email)
        ) {

            errorEl.textContent =
                '⚠️ البريد الإلكتروني غير صالح';

            errorEl.classList.add(
                'show'
            );

            return;

        }

        submitBtn.disabled =
            true;

        submitBtn.textContent =
            '⏳ جاري الإرسال...';

        fetchJSON(
            API + '/auth/forgot-password',
            {

                method:
                    'POST',

                json:
                    true,

                body:
                    JSON.stringify({

                        email:
                            email

                    })

            }
        )
        .then(function (result) {

            var response =
                result.response;

            var data =
                result.data || {};

            /*
             * Generic server response is preferred.
             */

            if (!response.ok) {

                throw new Error(
                    data.error ||
                    'تعذر معالجة الطلب'
                );

            }

            closeForgotPassword();

            showToast(
                '📧 إذا كان البريد مسجلاً، فسيتم إرسال رابط الاستعادة.',
                'success',
                5000
            );

        })
        .catch(function (error) {

            errorEl.textContent =
                '❌ ' +
                String(
                    error.message ||
                    'حدث خطأ'
                );

            errorEl.classList.add(
                'show'
            );

        })
        .finally(function () {

            submitBtn.disabled =
                false;

            submitBtn.textContent =
                'إرسال رابط الاستعادة';

        });

    }

    // ============================================================
    // 🏗️ MODAL
    // ============================================================

    var modalResolve = null;

    function showModal(options) {

        options =
            options || {};

        return new Promise(
            function (resolve) {

                var overlay =
                    getElement(
                        'modalOverlay'
                    );

                var title =
                    getElement(
                        'modalTitle'
                    );

                var body =
                    getElement(
                        'modalBody'
                    );

                var confirmBtn =
                    getElement(
                        'modalConfirm'
                    );

                var cancelBtn =
                    getElement(
                        'modalCancel'
                    );

                var closeBtn =
                    getElement(
                        'modalClose'
                    );

                if (
                    !overlay ||
                    !title ||
                    !body ||
                    !confirmBtn ||
                    !cancelBtn ||
                    !closeBtn
                ) {

                    resolve(false);

                    return;

                }

                /*
                 * Prevent unresolved modal promises.
                 */

                if (modalResolve) {

                    modalResolve(false);

                    modalResolve =
                        null;

                }

                title.textContent =
                    options.title ||
                    'تأكيد';

                body.textContent =
                    options.message ||
                    'هل أنت متأكد؟';

                confirmBtn.textContent =
                    options.confirmText ||
                    'تأكيد';

                confirmBtn.className =
                    'btn ' +
                    (
                        options.confirmClass ||
                        'btn-primary'
                    );

                cancelBtn.textContent =
                    options.cancelText ||
                    'إلغاء';

                cancelBtn.style.display =
                    options.showCancel === false
                        ? 'none'
                        : 'inline-flex';

                /*
                 * Clone buttons so old listeners disappear.
                 */

                var newConfirm =
                    confirmBtn.cloneNode(
                        true
                    );

                var newCancel =
                    cancelBtn.cloneNode(
                        true
                    );

                var newClose =
                    closeBtn.cloneNode(
                        true
                    );

                confirmBtn.parentNode.replaceChild(
                    newConfirm,
                    confirmBtn
                );

                cancelBtn.parentNode.replaceChild(
                    newCancel,
                    cancelBtn
                );

                closeBtn.parentNode.replaceChild(
                    newClose,
                    closeBtn
                );

                var finished =
                    false;

                var cleanup =
                    function (result) {

                        if (finished) {

                            return;

                        }

                        finished =
                            true;

                        addClass(
                            overlay,
                            'hidden'
                        );

                        if (
                            modalResolve
                        ) {

                            var resolver =
                                modalResolve;

                            modalResolve =
                                null;

                            resolver(
                                Boolean(result)
                            );

                        }

                    };

                modalResolve =
                    resolve;

                newConfirm.addEventListener(
                    'click',
                    function () {

                        cleanup(true);

                    }
                );

                newCancel.addEventListener(
                    'click',
                    function () {

                        cleanup(false);

                    }
                );

                newClose.addEventListener(
                    'click',
                    function () {

                        cleanup(false);

                    }
                );

                overlay.onclick =
                    function (event) {

                        if (
                            event.target ===
                            overlay
                        ) {

                            cleanup(false);

                        }

                    };

                removeClass(
                    overlay,
                    'hidden'
                );

            }
        );

    }

    // ============================================================
    // 📱 SIDEBAR CONTROLS
    // ============================================================

    function initSidebarControls() {

        var menuToggle =
            getElement(
                'menuToggle'
            );

        var sidebar =
            getElement(
                'sidebar'
            );

        var sidebarClose =
            getElement(
                'sidebarClose'
            );

        if (
            menuToggle &&
            sidebar
        ) {

            menuToggle.addEventListener(
                'click',
                function () {

                    sidebar.classList.toggle(
                        'open'
                    );

                }
            );

        }

        if (
            sidebarClose &&
            sidebar
        ) {

            sidebarClose.addEventListener(
                'click',
                function () {

                    removeClass(
                        sidebar,
                        'open'
                    );

                }
            );

        }

    }

    // ============================================================
    // 🔔 NOTIFICATIONS
    // ============================================================

    function updateNotificationBadge(
        count
    ) {

        var badge =
            getElement(
                'notifBadge'
            );

        if (!badge) {

            return;

        }

        var numeric =
            Number(count);

        if (
            !Number.isFinite(
                numeric
            )
        ) {

            numeric = 0;

        }

        numeric =
            Math.max(
                0,
                Math.floor(
                    numeric
                )
            );

        badge.textContent =
            numeric > 99
                ? '99+'
                : String(numeric);

        badge.style.display =
            numeric > 0
                ? 'inline-flex'
                : 'none';

    }

    function showNotifications() {

        if (!state.authenticated) {

            showToast(
                '🔒 يجب تسجيل الدخول أولاً',
                'error'
            );

            return;

        }

        /*
         * Replace this with the authenticated notifications
         * API when implemented.
         */

        showToast(
            '🔔 لا توجد إشعارات جديدة',
            'info'
        );

        updateNotificationBadge(
            0
        );

    }

    // ============================================================
    // 👤 USER MENU
    // ============================================================

    function showUserMenu() {

        if (
            !state.authenticated ||
            !state.user
        ) {

            return;

        }

        var name =
            state.user.name ||
            state.user.username ||
            'المستخدم';

        var role =
            getRoleName(
                state.user.role
            );

        showModal({

            title:
                '👤 معلومات المستخدم',

            message:
                'المستخدم: ' +
                name +
                '\nالصلاحية: ' +
                role,

            confirmText:
                'إغلاق',

            showCancel:
                false

        });

    }

    // ============================================================
    // 🔍 QUICK SEARCH
    // ============================================================

    function handleQuickSearch() {

        var search =
            getElement(
                'quickSearch'
            );

        if (!search) {

            return;

        }

        var query =
            String(
                search.value || ''
            ).trim();

        if (!query) {

            showToast(
                '🔎 أدخل كلمة للبحث',
                'info'
            );

            return;

        }

        if (!state.authenticated) {

            showToast(
                '🔒 يجب تسجيل الدخول أولاً',
                'error'
            );

            return;

        }

        /*
         * Do NOT construct HTML from search results.
         * Real search should use an authenticated server endpoint.
         */

        showToast(
            '🔎 جاري البحث عن: ' +
            query,
            'info'
        );

    }

    // ============================================================
    // 🔝 BACK TO TOP
    // ============================================================

    function initBackToTop() {

        var button =
            getElement(
                'backToTop'
            );

        if (!button) {

            return;

        }

        window.addEventListener(
            'scroll',
            function () {

                if (
                    window.scrollY > 400
                ) {

                    removeClass(
                        button,
                        'hidden'
                    );

                } else {

                    addClass(
                        button,
                        'hidden'
                    );

                }

            },
            {
                passive:
                    true
            }
        );

        button.addEventListener(
            'click',
            function () {

                window.scrollTo({

                    top:
                        0,

                    behavior:
                        'smooth'

                });

            }
        );

    }

    // ============================================================
    // 🌐 CONNECTION STATUS
    // ============================================================

    function updateConnectionStatus(
        online
    ) {

        var status =
            getElement(
                'connectionStatus'
            );

        if (!status) {

            return;

        }

        var icon =
            status.querySelector(
                'i'
            );

        var text =
            status.querySelector(
                'span'
            );

        if (online) {

            removeClass(
                status,
                'offline'
            );

            addClass(
                status,
                'online'
            );

            if (icon) {

                icon.className =
                    'fas fa-wifi';

            }

            if (text) {

                text.textContent =
                    'متصل';

            }

            window.setTimeout(
                function () {

                    addClass(
                        status,
                        'hidden'
                    );

                },
                2000
            );

        } else {

            removeClass(
                status,
                'hidden'
            );

            removeClass(
                status,
                'online'
            );

            addClass(
                status,
                'offline'
            );

            if (icon) {

                icon.className =
                    'fas fa-wifi-slash';

            }

            if (text) {

                text.textContent =
                    'غير متصل';

            }

        }

    }

    window.addEventListener(
        'online',
        function () {

            updateConnectionStatus(
                true
            );

        }
    );

    window.addEventListener(
        'offline',
        function () {

            updateConnectionStatus(
                false
            );

        }
    );

    // ============================================================
    // 🧭 RESTORE PAGE
    // ============================================================

    function getSavedPage() {

        try {

            var saved =
                sessionStorage.getItem(
                    PAGE_KEY
                );

            if (
                saved &&
                ALLOWED_PAGES.has(
                    saved
                )
            ) {

                return saved;

            }

        } catch (error) {

            /*
             * Storage may be disabled.
             */

        }

        return 'dashboard';

    }

    // ============================================================
    // 🧹 APPLICATION UI RESET
    // ============================================================

    function resetApplicationUI() {

        stopSessionTimers();

        if (activityDebounce) {

            window.clearTimeout(
                activityDebounce
            );

            activityDebounce =
                null;

        }

        state.user =
            null;

        state.authenticated =
            false;

        state.page =
            'dashboard';

        state.vessels =
            [];

        state.users =
            [];

        state.absoluteStart =
            0;

        state.loggingOut =
            false;

        var mainApp =
            getElement(
                'mainApp'
            );

        var loginOverlay =
            getElement(
                'loginOverlay'
            );

        var pageContainer =
            getElement(
                'pageContainer'
            );

        if (mainApp) {

            addClass(
                mainApp,
                'hidden'
            );

        }

        if (loginOverlay) {

            removeClass(
                loginOverlay,
                'hidden'
            );

        }

        if (pageContainer) {

            clearElement(
                pageContainer
            );

        }

        var username =
            getElement(
                'username'
            );

        var password =
            getElement(
                'password'
            );

        if (username) {

            username.value =
                '';

        }

        if (password) {

            password.value =
                '';

        }

        var errorEl =
            getElement(
                'loginError'
            );

        if (errorEl) {

            errorEl.textContent =
                '';

            errorEl.className =
                'error-msg';

        }

        var sidebar =
            getElement(
                'sidebar'
            );

        if (sidebar) {

            removeClass(
                sidebar,
                'open'
            );

        }

        /*
         * Page preference is not sensitive.
         * It may remain in sessionStorage.
         */

    }

    // ============================================================
    // ⌨️ LOGIN FORM
    // ============================================================

    function initLoginForm() {

        var form =
            getElement(
                'loginForm'
            );

        if (!form) {

            return;

        }

        form.addEventListener(
            'submit',
            function (event) {

                event.preventDefault();

                if (
                    state.authenticated ||
                    state.loggingOut
                ) {

                    return;

                }

                doLogin();

            }
        );

    }

    // ============================================================
    // 🔑 FORGOT PASSWORD CONTROLS
    // ============================================================

    function initForgotPassword() {

        var openBtn =
            getElement(
                'forgotPasswordBtn'
            );

        var closeBtn =
            getElement(
                'forgotModalClose'
            );

        var cancelBtn =
            getElement(
                'forgotCancel'
            );

        var submitBtn =
            getElement(
                'forgotSubmit'
            );

        var email =
            getElement(
                'resetEmail'
            );

        if (openBtn) {

            openBtn.addEventListener(
                'click',
                openForgotPassword
            );

        }

        if (closeBtn) {

            closeBtn.addEventListener(
                'click',
                closeForgotPassword
            );

        }

        if (cancelBtn) {

            cancelBtn.addEventListener(
                'click',
                closeForgotPassword
            );

        }

        if (submitBtn) {

            submitBtn.addEventListener(
                'click',
                submitForgotPassword
            );

        }

        if (email) {

            email.addEventListener(
                'keydown',
                function (event) {

                    if (
                        event.key ===
                        'Enter'
                    ) {

                        event.preventDefault();

                        submitForgotPassword();

                    }

                }
            );

        }

        var modal =
            getElement(
                'forgotModal'
            );

        if (modal) {

            modal.addEventListener(
                'click',
                function (event) {

                    if (
                        event.target ===
                        modal
                    ) {

                        closeForgotPassword();

                    }

                }
            );

        }

    }

    // ============================================================
    // 🔔 HEADER CONTROLS
    // ============================================================

    function initHeaderControls() {

        var notifBtn =
            getElement(
                'notifBtn'
            );

        var userBtn =
            getElement(
                'userBtn'
            );

        var logoutBtn =
            getElement(
                'logoutBtn'
            );

        var search =
            getElement(
                'quickSearch'
            );

        if (notifBtn) {

            notifBtn.addEventListener(
                'click',
                showNotifications
            );

        }

        if (userBtn) {

            userBtn.addEventListener(
                'click',
                showUserMenu
            );

        }

        if (logoutBtn) {

            logoutBtn.addEventListener(
                'click',
                doLogout
            );

        }

        if (search) {

            search.addEventListener(
                'keydown',
                function (event) {

                    if (
                        event.key ===
                        'Enter'
                    ) {

                        event.preventDefault();

                        handleQuickSearch();

                    }

                }
            );

        }

    }

    // ============================================================
    // ⌨️ KEYBOARD SHORTCUTS
    // ============================================================

    function initKeyboardShortcuts() {

        document.addEventListener(
            'keydown',
            function (event) {

                /*
                 * Ctrl+K / Cmd+K
                 */

                if (
                    (event.ctrlKey ||
                        event.metaKey) &&
                    event.key.toLowerCase() === 'k'
                ) {

                    event.preventDefault();

                    var search =
                        getElement(
                            'quickSearch'
                        );

                    if (
                        search &&
                        state.authenticated
                    ) {

                        search.focus();

                    }

                    return;

                }

                /*
                 * Escape closes menus/modals.
                 */

                if (
                    event.key ===
                    'Escape'
                ) {

                    var forgot =
                        getElement(
                            'forgotModal'
                        );

                    if (
                        forgot &&
                        !forgot.classList.contains(
                            'hidden'
                        )
                    ) {

                        closeForgotPassword();

                        return;

                    }

                    var modal =
                        getElement(
                            'modalOverlay'
                        );

                    if (
                        modal &&
                        !modal.classList.contains(
                            'hidden'
                        )
                    ) {

                        if (
                            modalResolve
                        ) {

                            modalResolve(
                                false
                            );

                            modalResolve =
                                null;

                        }

                        addClass(
                            modal,
                            'hidden'
                        );

                    }

                }

            }
        );

    }

    // ============================================================
    // 🕒 CLOCK
    // ============================================================

    function initClock() {

        updateDateTime();

        window.setInterval(
            updateDateTime,
            1000
        );

    }

    // ============================================================
    // 🔐 INITIAL SESSION BOOTSTRAP
    // ============================================================

    function initializeSession() {

        /*
         * Start hidden.
         * verifySession decides whether the application
         * should be displayed.
         */

        var mainApp =
            getElement(
                'mainApp'
            );

        var loginOverlay =
            getElement(
                'loginOverlay'
            );

        if (mainApp) {

            addClass(
                mainApp,
                'hidden'
            );

        }

        if (loginOverlay) {

            removeClass(
                loginOverlay,
                'hidden'
            );

        }

        return verifySession()
            .then(function (authenticated) {

                if (!authenticated) {

                    resetApplicationUI();

                    return;

                }

                state.absoluteStart =
                    Date.now();

                var main =
                    getElement(
                        'mainApp'
                    );

                var login =
                    getElement(
                        'loginOverlay'
                    );

                if (login) {

                    addClass(
                        login,
                        'hidden'
                    );

                }

                if (main) {

                    removeClass(
                        main,
                        'hidden'
                    );

                }

                updateUserDisplay();

                buildSidebar();

                startSessionTimers();

                var page =
                    getSavedPage();

                if (
                    !canAccessPage(
                        page
                    )
                ) {

                    page =
                        'dashboard';

                }

                loadPage(
                    page
                );

                loadAllData();

            });

    }

    // ============================================================
    // 🚀 APPLICATION INIT
    // ============================================================

    function init() {

        if (state.initialized) {

            return;

        }

        state.initialized =
            true;

        initLoginForm();

        initPasswordToggle();

        initForgotPassword();

        initSidebarControls();

        initHeaderControls();

        initKeyboardShortcuts();

        initBackToTop();

        initClock();

        updateConnectionStatus(
            navigator.onLine
        );

        initializeSession();

    }

    // ============================================================
    // 🚀 DOM READY
    // ============================================================

    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            init,
            {
                once:
                    true
            }
        );

    } else {

        init();

    }

})();
```
