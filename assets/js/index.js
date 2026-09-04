/**
 * ============================================================
 * 🚢 MARINE SYSTEM v22.0
 * ULTIMATE HARDENED FRONTEND
 * ============================================================
 *
 * SECURITY MODEL
 * ------------------------------------------------------------
 * • HttpOnly Session Cookie
 * • Secure Cookie (SERVER SIDE)
 * • SameSite=Strict (SERVER SIDE)
 * • CSRF Protection
 * • Server-side RBAC
 * • Client-side RBAC for UX
 * • No JWT in localStorage/sessionStorage
 * • No innerHTML
 * • No eval()
 * • No unsafe-inline
 * • No unsafe-eval
 * • Same-origin API
 * • Idle timeout: 15 minutes
 * • Absolute timeout: 8 hours
 * • Page allowlist
 * • DOMParser + script removal
 * • No global state exposure
 * ============================================================
 */

(function () {
    'use strict';

    /* =========================================================
       CONFIG
       ========================================================= */

    var API = '/api';

    var PAGE_KEY = 'marine_page';

    var IDLE_TIMEOUT = 15 * 60 * 1000;       // 15 minutes
    var ABSOLUTE_TIMEOUT = 8 * 60 * 60 * 1000; // 8 hours

    var REQUEST_TIMEOUT = 15000;

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
        logs: 'سجلات الصيانة'
    };

    /*
     * Client-side permission mapping.
     *
     * IMPORTANT:
     * This is ONLY UI protection.
     * Real authorization MUST remain on the backend.
     */
    var PAGE_PERMISSIONS = {
        users: ['users.read'],
        logs: ['logs.read'],
        settings: ['settings.manage'],
        monitoring: ['monitoring.view'],
        'ai-assistant': ['ai.use']
    };


    /* =========================================================
       PRIVATE STATE
       ========================================================= */

    var state = {
        user: null,
        authenticated: false,

        page: 'dashboard',

        vessels: [],
        users: [],

        idleTimer: null,
        absoluteTimer: null,

        absoluteStart: 0,

        loadingPages: Object.create(null),

        activityDebounce: null,

        logoutInProgress: false,

        initialized: false,

        connectionOnline: navigator.onLine
    };


    /* =========================================================
       DOM HELPERS
       ========================================================= */

    function getElement(id) {
        return document.getElementById(id);
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


    function safeText(id, value) {
        var el = getElement(id);

        if (el) {
            el.textContent = value == null ? '' : String(value);
        }
    }


    function createElement(tag, attrs, children) {
        var el = document.createElement(tag);

        if (attrs) {
            Object.keys(attrs).forEach(function (key) {
                var value = attrs[key];

                if (key === 'className') {
                    el.className = value;
                } else if (key === 'textContent') {
                    el.textContent = value;
                } else if (key === 'dataset' && value) {
                    Object.keys(value).forEach(function (dataKey) {
                        el.dataset[dataKey] = value[dataKey];
                    });
                } else if (key === 'disabled') {
                    el.disabled = Boolean(value);
                } else {
                    el.setAttribute(key, value);
                }
            });
        }

        if (children) {
            if (!Array.isArray(children)) {
                children = [children];
            }

            children.forEach(function (child) {
                if (typeof child === 'string') {
                    el.appendChild(
                        document.createTextNode(child)
                    );
                } else if (
                    child &&
                    child.nodeType === Node.ELEMENT_NODE
                ) {
                    el.appendChild(child);
                }
            });
        }

        return el;
    }


    /* =========================================================
       NETWORK HELPERS
       ========================================================= */

    function fetchWithTimeout(url, options, timeout) {
        timeout = timeout || REQUEST_TIMEOUT;

        options = options || {};

        var controller = null;
        var timer = null;

        if (typeof AbortController !== 'undefined') {
            controller = new AbortController();
            options.signal = controller.signal;
        }

        var request = fetch(url, options);

        if (!controller) {
            return request;
        }

        var timeoutPromise = new Promise(function (_, reject) {
            timer = setTimeout(function () {
                controller.abort();

                reject(
                    new Error('انتهت مهلة الاتصال بالخادم')
                );
            }, timeout);
        });

        return Promise.race([
            request,
            timeoutPromise
        ]).finally(function () {
            if (timer) {
                clearTimeout(timer);
            }
        });
    }


    function parseJSONResponse(response) {
        return response.text().then(function (text) {
            if (!text) {
                return {};
            }

            try {
                return JSON.parse(text);
            } catch (error) {
                throw new Error(
                    'استجابة غير صالحة من الخادم'
                );
            }
        });
    }


    function getResponseError(data, fallback) {
        if (!data) {
            return fallback;
        }

        return (
            data.error ||
            data.message ||
            fallback
        );
    }


    /* =========================================================
       CSRF
       ========================================================= */

    function getCSRFToken() {

        /*
         * Preferred:
         * server-generated meta tag.
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
         * readable CSRF cookie.
         *
         * IMPORTANT:
         * csrf_token MUST NOT be HttpOnly.
         * The session cookie MUST remain HttpOnly.
         */
        var cookies = document.cookie
            ? document.cookie.split(';')
            : [];

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


    function buildHeaders(options) {

        options = options || {};

        var headers = {
            'Accept': 'application/json'
        };

        if (options.json) {
            headers['Content-Type'] =
                'application/json';
        }

        /*
         * Send CSRF only when available.
         */
        var csrf = getCSRFToken();

        if (csrf) {
            headers['X-CSRF-Token'] = csrf;
        }

        return headers;
    }


    /* =========================================================
       TOAST
       ========================================================= */

    function showToast(message, type, duration) {

        type = type || 'info';
        duration = duration || 3000;

        var container =
            getElement('toastContainer');

        if (!container) {
            return;
        }

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

        var icon = createElement('span', {
            className: 'toast-icon',
            textContent:
                icons[type] || icons.info
        });

        var text = createElement('span', {
            className: 'toast-message',
            textContent: String(message || '')
        });

        toast.appendChild(icon);
        toast.appendChild(text);

        container.appendChild(toast);

        setTimeout(function () {

            if (!toast.parentNode) {
                return;
            }

            toast.style.opacity = '0';
            toast.style.transform =
                'translateX(30px)';
            toast.style.transition =
                'opacity .3s ease, transform .3s ease';

            setTimeout(function () {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);

        }, duration);
    }


    /* =========================================================
       DATE / TIME
       ========================================================= */

    function updateDateTime() {

        try {

            var dateEl =
                getElement('currentDate');

            var timeEl =
                getElement('currentTime');

            if (!dateEl && !timeEl) {
                return;
            }

            var now = new Date();

            if (dateEl) {
                dateEl.textContent =
                    now.toLocaleDateString(
                        'ar-TN',
                        {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        }
                    );
            }

            if (timeEl) {
                timeEl.textContent =
                    now.toLocaleTimeString(
                        'ar-TN',
                        {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                        }
                    );
            }

        } catch (error) {
            /*
             * Never allow clock failure to break application.
             */
        }
    }


    /* =========================================================
       SESSION TIMER
       ========================================================= */

    function stopSessionTimers() {

        if (state.idleTimer !== null) {
            clearTimeout(state.idleTimer);
            state.idleTimer = null;
        }

        if (state.absoluteTimer !== null) {
            clearTimeout(state.absoluteTimer);
            state.absoluteTimer = null;
        }
    }


    function performLocalLogoutUI() {

        state.user = null;
        state.authenticated = false;

        state.vessels = [];
        state.users = [];

        stopSessionTimers();

        var loginOverlay =
            getElement('loginOverlay');

        var mainApp =
            getElement('mainApp');

        if (loginOverlay) {
            removeClass(
                loginOverlay,
                'hidden'
            );
        }

        if (mainApp) {
            addClass(
                mainApp,
                'hidden'
            );
        }

        safeText(
            'userDisplayName',
            'المستخدم'
        );

        safeText(
            'userInitial',
            'م'
        );

        safeText(
            'sidebarUserName',
            'المستخدم'
        );

        safeText(
            'sidebarUserRole',
            'مستخدم'
        );

        safeText(
            'sidebarUserAvatar',
            'م'
        );

        var username =
            getElement('username');

        var password =
            getElement('password');

        if (username) {
            username.value = '';
        }

        if (password) {
            password.value = '';
        }

        var error =
            getElement('loginError');

        if (error) {
            error.textContent = '';
            error.className =
                'error-msg';
        }

        /*
         * Page preference is not security-sensitive,
         * but remove it during logout.
         */
        try {
            sessionStorage.removeItem(
                PAGE_KEY
            );
        } catch (e) {}

        state.page = 'dashboard';
    }


    function expireSession(reason) {

        if (!state.authenticated) {
            return;
        }

        if (state.logoutInProgress) {
            return;
        }

        showToast(
            reason ||
            '⏰ انتهت صلاحية الجلسة',
            'warning'
        );

        /*
         * Automatic expiration must not require
         * another confirmation modal.
         */
        performServerLogout(true);
    }


    function startSessionTimers() {

        stopSessionTimers();

        if (!state.authenticated) {
            return;
        }

        /*
         * Idle timer.
         */
        state.idleTimer = setTimeout(
            function () {

                expireSession(
                    '⏰ انتهت صلاحية الجلسة بسبب الخمول'
                );

            },
            IDLE_TIMEOUT
        );


        /*
         * Absolute timer.
         *
         * IMPORTANT:
         * This timer is based on absoluteStart
         * and MUST NOT be reset by activity.
         */
        var elapsed =
            Date.now() -
            state.absoluteStart;

        var remaining =
            Math.max(
                0,
                ABSOLUTE_TIMEOUT - elapsed
            );

        state.absoluteTimer = setTimeout(
            function () {

                expireSession(
                    '⏰ انتهت المدة القصوى للجلسة'
                );

            },
            remaining
        );
    }


    function resetIdleTimer() {

        if (!state.authenticated) {
            return;
        }

        if (state.idleTimer !== null) {
            clearTimeout(
                state.idleTimer
            );
        }

        state.idleTimer = setTimeout(
            function () {

                expireSession(
                    '⏰ انتهت صلاحية الجلسة بسبب الخمول'
                );

            },
            IDLE_TIMEOUT
        );
    }


    function setupActivityMonitoring() {

        var events = [
            'click',
            'keydown',
            'mousemove',
            'scroll',
            'touchstart'
        ];

        events.forEach(function (eventName) {

            document.addEventListener(
                eventName,
                function () {

                    if (!state.authenticated) {
                        return;
                    }

                    if (state.activityDebounce) {
                        clearTimeout(
                            state.activityDebounce
                        );
                    }

                    state.activityDebounce =
                        setTimeout(
                            function () {

                                state.activityDebounce =
                                    null;

                                resetIdleTimer();

                            },
                            500
                        );
                },
                {
                    passive:
                        eventName === 'scroll' ||
                        eventName === 'touchstart'
                }
            );
        });
    }


    /* =========================================================
       AUTHENTICATION
       ========================================================= */

    function setLoginLoading(loading) {

        var button =
            getElement('loginButton');

        if (!button) {
            return;
        }

        button.disabled = loading;

        if (loading) {
            addClass(button, 'loading');
        } else {
            removeClass(button, 'loading');
        }
    }


    function doLogin(event) {

        if (event) {
            event.preventDefault();
        }

        var username =
            getElement('username');

        var password =
            getElement('password');

        var errorEl =
            getElement('loginError');

        var rememberMe =
            getElement('rememberMe');

        if (
            !username ||
            !password ||
            !errorEl
        ) {
            return;
        }

        var user =
            username.value.trim();

        /*
         * NEVER trim password.
         */
        var pass =
            password.value;

        errorEl.textContent = '';
        errorEl.className =
            'error-msg';

        if (!user || !pass) {

            errorEl.textContent =
                '⚠️ يرجى إدخال اسم المستخدم وكلمة المرور';

            errorEl.classList.add('show');

            return;
        }

        setLoginLoading(true);

        fetchWithTimeout(
            API + '/auth/login',
            {
                method: 'POST',

                headers:
                    buildHeaders({
                        json: true
                    }),

                credentials: 'include',

                body: JSON.stringify({
                    username: user,
                    password: pass,
                    rememberMe:
                        rememberMe
                            ? Boolean(
                                rememberMe.checked
                            )
                            : false
                })
            }
        )
        .then(function (response) {

            return parseJSONResponse(
                response
            ).then(function (data) {

                if (!response.ok) {

                    throw new Error(
                        getResponseError(
                            data,
                            'فشل تسجيل الدخول'
                        )
                    );
                }

                return data;
            });
        })
        .then(function (data) {

            if (
                !data ||
                !data.success ||
                !data.user
            ) {

                throw new Error(
                    getResponseError(
                        data,
                        'بيانات الدخول غير صحيحة'
                    )
                );
            }

            state.user =
                data.user;

            state.authenticated =
                true;

            /*
             * Absolute lifetime starts here.
             */
            state.absoluteStart =
                Date.now();

            updateUserDisplay();

            buildSidebar();

            var loginOverlay =
                getElement(
                    'loginOverlay'
                );

            var mainApp =
                getElement(
                    'mainApp'
                );

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

            startSessionTimers();

            var savedPage =
                getSavedPage();

            if (
                !savedPage ||
                !canAccessPage(savedPage)
            ) {
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
                    'مستخدم'
                ),
                'success'
            );

        })
        .catch(function (error) {

            errorEl.textContent =
                '❌ ' +
                (
                    error.message ||
                    'تعذر تسجيل الدخول'
                );

            errorEl.classList.add('show');

        })
        .finally(function () {

            setLoginLoading(false);

        });
    }


    /* =========================================================
       LOGOUT
       ========================================================= */

    function requestLogoutFromUser() {

        if (!state.authenticated) {
            return;
        }

        showModal({
            title: '⚠️ تسجيل الخروج',
            message:
                'هل أنت متأكد من تسجيل الخروج؟',
            confirmText:
                'تسجيل الخروج',
            confirmClass:
                'btn-danger',
            cancelText:
                'إلغاء'
        }).then(function (confirmed) {

            if (!confirmed) {
                return;
            }

            performServerLogout(false);
        });
    }


    function performServerLogout(silent) {

        if (state.logoutInProgress) {
            return;
        }

        state.logoutInProgress = true;

        var logoutBtn =
            getElement('logoutBtn');

        if (logoutBtn) {
            logoutBtn.disabled = true;
            logoutBtn.textContent =
                '⏳ جاري تسجيل الخروج...';
        }

        fetchWithTimeout(
            API + '/auth/logout',
            {
                method: 'POST',

                headers:
                    buildHeaders(),

                credentials: 'include'
            }
        )
        .then(function (response) {

            return parseJSONResponse(
                response
            ).then(function (data) {

                if (!response.ok) {

                    throw new Error(
                        getResponseError(
                            data,
                            'فشل تسجيل الخروج من الخادم'
                        )
                    );
                }

                return data;
            });
        })
        .then(function () {

            /*
             * Server confirmed logout.
             */
            performLocalLogoutUI();

            if (!silent) {
                showToast(
                    '👋 تم تسجيل الخروج بنجاح',
                    'success'
                );
            }

        })
        .catch(function (error) {

            /*
             * SECURITY IMPORTANT:
             *
             * Do NOT claim the server session was
             * destroyed if the request failed.
             *
             * We keep the authenticated state and
             * tell the user to retry.
             */
            if (silent) {

                /*
                 * Automatic expiration:
                 * Even if logout request failed,
                 * local UI must not remain usable.
                 */
                performLocalLogoutUI();

                showToast(
                    '⚠️ انتهت الجلسة محلياً. يرجى تسجيل الدخول مجدداً.',
                    'warning',
                    5000
                );

            } else {

                showToast(
                    '❌ تعذر تسجيل الخروج من الخادم: ' +
                    (
                        error.message ||
                        'خطأ غير معروف'
                    ),
                    'error',
                    5000
                );
            }

        })
        .finally(function () {

            state.logoutInProgress = false;

            if (logoutBtn) {
                logoutBtn.disabled = false;
                logoutBtn.textContent =
                    'تسجيل الخروج';
            }
        });
    }


    /* =========================================================
       SESSION VERIFICATION
       ========================================================= */

    function verifySession() {

        return fetchWithTimeout(
            API + '/auth/me',
            {
                method: 'GET',

                credentials: 'include',

                headers: {
                    'Accept':
                        'application/json'
                }
            }
        )
        .then(function (response) {

            if (!response.ok) {
                return false;
            }

            return parseJSONResponse(
                response
            );

        })
        .then(function (data) {

            if (
                data &&
                data.success &&
                data.user
            ) {

                state.user =
                    data.user;

                state.authenticated =
                    true;

                /*
                 * Browser reload cannot know the
                 * original absolute login time unless
                 * server provides it.
                 *
                 * Therefore the server must enforce
                 * the real absolute session expiration.
                 *
                 * Client timer is only UX protection.
                 */
                state.absoluteStart =
                    Date.now();

                updateUserDisplay();

                buildSidebar();

                startSessionTimers();

                return true;
            }

            return false;

        })
        .catch(function () {

            return false;
        });
    }


    /* =========================================================
       USER DISPLAY
       ========================================================= */

    function getRoleName(role) {

        var roles = {
            admin: 'مسؤول النظام',
            manager: 'مدير',
            operator: 'مشغل',
            viewer: 'مشاهد'
        };

        return (
            roles[role] ||
            role ||
            'مستخدم'
        );
    }


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


    /* =========================================================
       RBAC
       ========================================================= */

    function hasPermission(permission) {

        if (!state.user) {
            return false;
        }

        /*
         * Admin bypass.
         * Backend MUST enforce the same rule.
         */
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
         * Support both:
         * {
         *   "users.read": true
         * }
         *
         * and
         *
         * ["users.read"]
         */
        if (Array.isArray(permissions)) {
            return permissions.indexOf(
                permission
            ) !== -1;
        }

        return permissions[permission] === true;
    }


    function canAccessPage(page) {

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
         * No special permission required.
         */
        if (!required) {
            return true;
        }

        return required.some(function (permission) {
            return hasPermission(
                permission
            );
        });
    }


    /* =========================================================
       DATA
       ========================================================= */

    function loadAllData() {

        if (!state.authenticated) {
            return;
        }

        var headers =
            buildHeaders();

        fetchWithTimeout(
            API + '/vessels',
            {
                method: 'GET',
                credentials: 'include',
                headers: headers
            }
        )
        .then(function (response) {

            return parseJSONResponse(
                response
            ).then(function (data) {

                if (!response.ok) {
                    throw new Error(
                        getResponseError(
                            data,
                            'فشل تحميل المراكب'
                        )
                    );
                }

                return data;
            });
        })
        .then(function (data) {

            /*
             * Support:
             * []
             *
             * and:
             * { vessels: [] }
             */
            if (Array.isArray(data)) {
                state.vessels = data;
            } else if (
                data &&
                Array.isArray(data.vessels)
            ) {
                state.vessels =
                    data.vessels;
            } else {
                state.vessels = [];
            }

            updateBadge(
                'fleetBadge',
                state.vessels.length
            );

        })
        .catch(function (error) {

            console.warn(
                '⚠️ Vessels:',
                error.message
            );
        });


        /*
         * Users are requested ONLY if
         * current user can access them.
         */
        if (canAccessPage('users')) {

            fetchWithTimeout(
                API + '/users',
                {
                    method: 'GET',
                    credentials: 'include',
                    headers: headers
                }
            )
            .then(function (response) {

                return parseJSONResponse(
                    response
                ).then(function (data) {

                    if (!response.ok) {
                        throw new Error(
                            getResponseError(
                                data,
                                'فشل تحميل المستخدمين'
                            )
                        );
                    }

                    return data;
                });
            })
            .then(function (data) {

                if (Array.isArray(data)) {
                    state.users = data;
                } else if (
                    data &&
                    Array.isArray(data.users)
                ) {
                    state.users =
                        data.users;
                } else {
                    state.users = [];
                }

                updateBadge(
                    'usersBadge',
                    state.users.length
                );

            })
            .catch(function (error) {

                console.warn(
                    '⚠️ Users:',
                    error.message
                );
            });
        }
    }


    function updateBadge(id, count) {

        var el = getElement(id);

        if (!el) {
            return;
        }

        var value =
            Number(count) || 0;

        el.textContent =
            String(value);

        el.style.display =
            value > 0
                ? 'inline'
                : 'none';
    }


    /* =========================================================
       PAGE STORAGE
       ========================================================= */

    function getSavedPage() {

        try {

            var page =
                sessionStorage.getItem(
                    PAGE_KEY
                );

            if (
                page &&
                ALLOWED_PAGES.has(page)
            ) {
                return page;
            }

        } catch (e) {}

        return 'dashboard';
    }


    /* =========================================================
       PAGE LOADER
       ========================================================= */

    function clearElement(el) {

        if (!el) {
            return;
        }

        while (el.firstChild) {
            el.removeChild(
                el.firstChild
            );
        }
    }


    function loadPage(page) {

        if (!state.authenticated) {
            return;
        }

        if (!ALLOWED_PAGES.has(page)) {

            showToast(
                '⚠️ الصفحة غير مصرح بها',
                'error'
            );

            return;
        }

        if (!canAccessPage(page)) {

            showToast(
                '🔒 ليس لديك صلاحية للوصول إلى هذه الصفحة',
                'error'
            );

            return;
        }

        if (state.loadingPages[page]) {
            return;
        }

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

        state.page = page;

        try {
            sessionStorage.setItem(
                PAGE_KEY,
                page
            );
        } catch (e) {}

        document
            .querySelectorAll('.nav-btn')
            .forEach(function (button) {

                button.classList.toggle(
                    'active',
                    button.dataset.page === page
                );
            });

        state.loadingPages[page] =
            true;

        if (loader) {
            removeClass(
                loader,
                'hidden'
            );
        }

        clearElement(container);

        fetchWithTimeout(
            '/pages/' +
            encodeURIComponent(page) +
            '.html',
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
             * The HTML pages are TRUSTED application
             * resources.
             *
             * Remove scripts before inserting them.
             */
            var parser =
                new DOMParser();

            var doc =
                parser.parseFromString(
                    html,
                    'text/html'
                );

            /*
             * Remove executable content.
             */
            doc
                .querySelectorAll(
                    'script, iframe, object, embed'
                )
                .forEach(function (node) {
                    node.remove();
                });

            /*
             * Remove event-handler attributes.
             *
             * This is defense-in-depth against
             * accidental inline event handlers.
             */
            doc
                .querySelectorAll('*')
                .forEach(function (node) {

                    Array
                        .from(node.attributes)
                        .forEach(function (attr) {

                            if (
                                attr.name
                                    .toLowerCase()
                                    .indexOf('on') === 0
                            ) {
                                node.removeAttribute(
                                    attr.name
                                );
                            }
                        });
                });

            var fragment =
                document.createDocumentFragment();

            Array
                .from(doc.body.childNodes)
                .forEach(function (node) {

                    fragment.appendChild(
                        node.cloneNode(true)
                    );
                });

            clearElement(container);

            container.appendChild(
                fragment
            );

            document.title =
                '⚓ ' +
                (
                    CONFIG_PAGES[page] ||
                    page
                );

            if (loader) {
                addClass(
                    loader,
                    'hidden'
                );
            }

            state.loadingPages[page] =
                false;

            /*
             * Reset only idle timeout.
             */
            resetIdleTimer();

            /*
             * Allow loaded page to initialize
             * through a controlled custom event.
             */
            var event =
                new CustomEvent(
                    'marine:page-loaded',
                    {
                        detail: {
                            page: page
                        }
                    }
                );

            document.dispatchEvent(
                event
            );

        })
        .catch(function (error) {

            state.loadingPages[page] =
                false;

            if (loader) {
                addClass(
                    loader,
                    'hidden'
                );
            }

            clearElement(container);

            var errorDiv =
                createElement('div', {
                    className:
                        'error-container'
                });

            var icon =
                createElement('div', {
                    className:
                        'error-icon',
                    textContent: '❌'
                });

            var title =
                createElement('h2', {
                    className:
                        'error-title',
                    textContent:
                        'فشل تحميل الصفحة'
                });

            var message =
                createElement('p', {
                    className:
                        'error-message',
                    textContent:
                        error.message ||
                        'حدث خطأ غير متوقع'
                });

            var retry =
                createElement('button', {
                    className:
                        'btn-gold',
                    type: 'button',
                    textContent:
                        '🔄 إعادة المحاولة'
                });

            retry.addEventListener(
                'click',
                function () {
                    loadPage(page);
                }
            );

            var home =
                createElement('button', {
                    className:
                        'btn-secondary',
                    type: 'button',
                    textContent:
                        '📊 العودة للرئيسية'
                });

            home.addEventListener(
                'click',
                function () {
                    loadPage(
                        'dashboard'
                    );
                }
            );

            errorDiv.appendChild(icon);
            errorDiv.appendChild(title);
            errorDiv.appendChild(message);
            errorDiv.appendChild(retry);
            errorDiv.appendChild(home);

            container.appendChild(
                errorDiv
            );
        });
    }


    /* =========================================================
       SIDEBAR
       ========================================================= */

    function buildSidebar() {

        var nav =
            getElement(
                'sidebarNav'
            );

        if (!nav) {
            return;
        }

        clearElement(nav);

        var groups = [

            {
                title: 'الرئيسية',
                items: [
                    {
                        page: 'dashboard',
                        icon: 'fa-chart-pie',
                        label: 'لوحة التحكم'
                    },
                    {
                        page: 'fleet',
                        icon: 'fa-ship',
                        label: 'السجل العام',
                        badge: 'fleetBadge'
                    }
                ]
            },

            {
                title: 'إدارة الأسطول',
                items: [
                    {
                        page: 'maintenance',
                        icon: 'fa-wrench',
                        label: 'الصيانة',
                        badge:
                            'maintenanceBadge',
                        badgeClass:
                            'warning'
                    },
                    {
                        page: 'efficiency',
                        icon: 'fa-chart-line',
                        label: 'الجاهزية'
                    },
                    {
                        page: 'support',
                        icon: 'fa-headset',
                        label: 'الدعم'
                    }
                ]
            },

            {
                title: 'العمليات',
                items: [
                    {
                        page: 'notes',
                        icon: 'fa-sticky-note',
                        label: 'Note Verbale'
                    },
                    {
                        page: 'monitoring',
                        icon: 'fa-map-marked-alt',
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
                title: 'الإدارة',
                items: [
                    {
                        page: 'users',
                        icon: 'fa-users',
                        label: 'المستخدمين',
                        badge:
                            'usersBadge'
                    },
                    {
                        page: 'logs',
                        icon: 'fa-history',
                        label:
                            'سجلات الصيانة',
                        badge:
                            'logsBadge'
                    }
                ]
            },

            {
                title: 'متقدم',
                items: [
                    {
                        page: 'ai-assistant',
                        icon: 'fa-robot',
                        label:
                            'المساعد الذكي',
                        badge: 'AI',
                        badgeClass:
                            'success'
                    },
                    {
                        page: 'settings',
                        icon: 'fa-cog',
                        label:
                            'الإعدادات'
                    }
                ]
            }
        ];


        groups.forEach(function (group) {

            var visibleItems =
                group.items.filter(
                    function (item) {
                        return canAccessPage(
                            item.page
                        );
                    }
                );

            /*
             * Don't render empty groups.
             */
            if (
                visibleItems.length === 0
            ) {
                return;
            }

            var groupDiv =
                createElement('div', {
                    className:
                        'nav-group'
                });

            var title =
                createElement('span', {
                    className:
                        'nav-group-title',
                    textContent:
                        group.title
                });

            groupDiv.appendChild(
                title
            );


            visibleItems.forEach(
                function (item) {

                    var button =
                        createElement(
                            'button',
                            {
                                className:
                                    'nav-btn' +
                                    (
                                        state.page ===
                                        item.page
                                            ? ' active'
                                            : ''
                                    ),
                                type: 'button',
                                dataset: {
                                    page:
                                        item.page
                                }
                            }
                        );

                    var icon =
                        createElement('i', {
                            className:
                                'fas ' +
                                item.icon,
                            'aria-hidden':
                                'true'
                        });

                    var text =
                        document.createTextNode(
                            ' ' +
                            item.label +
                            ' '
                        );

                    button.appendChild(
                        icon
                    );

                    button.appendChild(
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
                                        item.badge ===
                                        'AI'
                                            ? 'AI'
                                            : '0'
                                }
                            );

                        button.appendChild(
                            badge
                        );
                    }


                    button.addEventListener(
                        'click',
                        function () {

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

                            closeSidebarMobile();
                        }
                    );


                    groupDiv.appendChild(
                        button
                    );
                }
            );


            nav.appendChild(
                groupDiv
            );
        });
    }


    /* =========================================================
       MOBILE SIDEBAR
       ========================================================= */

    function closeSidebarMobile() {

        var sidebar =
            getElement('sidebar');

        if (!sidebar) {
            return;
        }

        sidebar.classList.remove(
            'open'
        );

        document.body.classList.remove(
            'sidebar-open'
        );
    }


    function toggleSidebarMobile() {

        var sidebar =
            getElement('sidebar');

        if (!sidebar) {
            return;
        }

        sidebar.classList.toggle(
            'open'
        );

        document.body.classList.toggle(
            'sidebar-open'
        );
    }


    /* =========================================================
       MODAL SYSTEM
       ========================================================= */

    var modalResolve = null;

    var modalHandlers = {
        confirm: null,
        cancel: null,
        close: null,
        overlay: null
    };


    function closeModal(result) {

        var overlay =
            getElement(
                'modalOverlay'
            );

        if (overlay) {
            addClass(
                overlay,
                'hidden'
            );
        }

        var resolve =
            modalResolve;

        modalResolve = null;

        if (resolve) {
            resolve(
                Boolean(result)
            );
        }
    }


    function removeModalHandlers() {

        var overlay =
            getElement(
                'modalOverlay'
            );

        var confirm =
            getElement(
                'modalConfirm'
            );

        var cancel =
            getElement(
                'modalCancel'
            );

        var close =
            getElement(
                'modalClose'
            );

        if (
            confirm &&
            modalHandlers.confirm
        ) {
            confirm.removeEventListener(
                'click',
                modalHandlers.confirm
            );
        }

        if (
            cancel &&
            modalHandlers.cancel
        ) {
            cancel.removeEventListener(
                'click',
                modalHandlers.cancel
            );
        }

        if (
            close &&
            modalHandlers.close
        ) {
            close.removeEventListener(
                'click',
                modalHandlers.close
            );
        }

        if (
            overlay &&
            modalHandlers.overlay
        ) {
            overlay.removeEventListener(
                'click',
                modalHandlers.overlay
            );
        }

        modalHandlers.confirm = null;
        modalHandlers.cancel = null;
        modalHandlers.close = null;
        modalHandlers.overlay = null;
    }


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

                var confirm =
                    getElement(
                        'modalConfirm'
                    );

                var cancel =
                    getElement(
                        'modalCancel'
                    );

                var close =
                    getElement(
                        'modalClose'
                    );

                if (
                    !overlay ||
                    !title ||
                    !body ||
                    !confirm ||
                    !cancel ||
                    !close
                ) {
                    resolve(false);
                    return;
                }

                /*
                 * Prevent stale listeners.
                 */
                removeModalHandlers();

                /*
                 * Prevent previous unresolved promise.
                 */
                if (modalResolve) {
                    modalResolve(false);
                }

                modalResolve =
                    resolve;

                title.textContent =
                    options.title ||
                    'تأكيد';

                body.textContent =
                    options.message ||
                    'هل أنت متأكد؟';

                confirm.textContent =
                    options.confirmText ||
                    'تأكيد';

                confirm.className =
                    options.confirmClass ||
                    'btn-primary';

                cancel.textContent =
                    options.cancelText ||
                    'إلغاء';

                cancel.style.display =
                    options.showCancel === false
                        ? 'none'
                        : 'inline-flex';


                modalHandlers.confirm =
                    function () {
                        closeModal(true);
                    };

                modalHandlers.cancel =
                    function () {
                        closeModal(false);
                    };

                modalHandlers.close =
                    function () {
                        closeModal(false);
                    };

                modalHandlers.overlay =
                    function (event) {

                        if (
                            event.target ===
                            overlay
                        ) {
                            closeModal(false);
                        }
                    };


                confirm.addEventListener(
                    'click',
                    modalHandlers.confirm
                );

                cancel.addEventListener(
                    'click',
                    modalHandlers.cancel
                );

                close.addEventListener(
                    'click',
                    modalHandlers.close
                );

                overlay.addEventListener(
                    'click',
                    modalHandlers.overlay
                );

                removeClass(
                    overlay,
                    'hidden'
                );
            }
        );
    }


    /* =========================================================
       FORGOT PASSWORD
       ========================================================= */

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

        if (error) {
            error.textContent = '';
            error.className =
                'error-msg';
        }

        if (email) {
            email.value = '';
        }

        removeClass(
            modal,
            'hidden'
        );

        if (email) {
            setTimeout(
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

        var email =
            getElement(
                'resetEmail'
            );

        var error =
            getElement(
                'resetError'
            );

        var submit =
            getElement(
                'forgotSubmit'
            );

        if (
            !email ||
            !error ||
            !submit
        ) {
            return;
        }

        var value =
            email.value.trim();

        error.textContent = '';
        error.className =
            'error-msg';

        if (!value) {

            error.textContent =
                '⚠️ يرجى إدخال البريد الإلكتروني';

            error.classList.add(
                'show'
            );

            return;
        }

        /*
         * Basic client-side format check.
         * Server MUST perform authoritative validation.
         */
        if (
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
                .test(value)
        ) {

            error.textContent =
                '⚠️ البريد الإلكتروني غير صالح';

            error.classList.add(
                'show'
            );

            return;
        }

        submit.disabled = true;

        var originalText =
            submit.textContent;

        submit.textContent =
            '⏳ جاري الإرسال...';


        fetchWithTimeout(
            API + '/auth/forgot-password',
            {
                method: 'POST',

                headers:
                    buildHeaders({
                        json: true
                    }),

                credentials: 'include',

                body: JSON.stringify({
                    email: value
                })
            }
        )
        .then(function (response) {

            return parseJSONResponse(
                response
            ).then(function (data) {

                /*
                 * Even errors should be handled
                 * without revealing whether an
                 * account exists.
                 */
                if (!response.ok) {

                    throw new Error(
                        getResponseError(
                            data,
                            'تعذر تنفيذ الطلب'
                        )
                    );
                }

                return data;
            });
        })
        .then(function () {

            /*
             * Generic response.
             */
            showToast(
                '📧 إذا كان البريد مسجلاً، فسيتم إرسال تعليمات الاستعادة.',
                'success',
                6000
            );

            closeForgotPassword();

        })
        .catch(function (err) {

            error.textContent =
                '❌ ' +
                (
                    err.message ||
                    'تعذر إرسال الطلب'
                );

            error.classList.add(
                'show'
            );

        })
        .finally(function () {

            submit.disabled = false;
            submit.textContent =
                originalText;
        });
    }


    /* =========================================================
       QUICK SEARCH
       ========================================================= */

    function performQuickSearch() {

        var input =
            getElement(
                'quickSearch'
            );

        if (!input) {
            return;
        }

        var query =
            input.value
                .trim()
                .toLowerCase();

        if (!query) {
            return;
        }

        /*
         * Current implementation searches
         * known loaded vessel data.
         *
         * For sensitive environments, a backend
         * search endpoint is preferable for large
         * datasets.
         */
        var matches =
            state.vessels.filter(
                function (vessel) {

                    var text = [
                        vessel.name,
                        vessel.code,
                        vessel.registrationNumber,
                        vessel.unit,
                        vessel.region
                    ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();

                    return text.indexOf(
                        query
                    ) !== -1;
                }
            );

        if (matches.length > 0) {

            loadPage('fleet');

            showToast(
                '🔎 تم العثور على ' +
                matches.length +
                ' نتيجة',
                'success'
            );

        } else {

            showToast(
                '🔎 لم يتم العثور على نتائج',
                'info'
            );
        }
    }


    /* =========================================================
       NOTIFICATIONS
       ========================================================= */

    function updateNotificationBadge(count) {

        updateBadge(
            'notifBadge',
            count
        );
    }


    function showNotifications() {

        /*
         * Placeholder until backend notification
         * endpoint is connected.
         */
        showToast(
            '🔔 لا توجد إشعارات جديدة',
            'info'
        );
    }


    /* =========================================================
       CONNECTION STATUS
       ========================================================= */

    function updateConnectionStatus(isOnline) {

        state.connectionOnline =
            Boolean(isOnline);

        var status =
            getElement(
                'connectionStatus'
            );

        if (!status) {
            return;
        }

        var span =
            status.querySelector(
                'span'
            );

        if (state.connectionOnline) {

            addClass(
                status,
                'hidden'
            );

        } else {

            removeClass(
                status,
                'hidden'
            );

            if (span) {
                span.textContent =
                    'غير متصل';
            }
        }
    }


    function setupConnectionMonitoring() {

        window.addEventListener(
            'online',
            function () {

                updateConnectionStatus(
                    true
                );

                showToast(
                    '🌐 عاد الاتصال بالشبكة',
                    'success'
                );
            }
        );


        window.addEventListener(
            'offline',
            function () {

                updateConnectionStatus(
                    false
                );

                showToast(
                    '⚠️ انقطع الاتصال بالشبكة',
                    'warning'
                );
            }
        );


        updateConnectionStatus(
            navigator.onLine
        );
    }


    /* =========================================================
       BACK TO TOP
       ========================================================= */

    function setupBackToTop() {

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
                    window.scrollY >
                    400
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
                passive: true
            }
        );


        button.addEventListener(
            'click',
            function () {

                window.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }
        );
    }


    /* =========================================================
       PASSWORD TOGGLE
       ========================================================= */

    function setupPasswordToggle() {

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
                    password.type ===
                    'text';

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


    /* =========================================================
       KEYBOARD SHORTCUTS
       ========================================================= */

    function setupKeyboardShortcuts() {

        document.addEventListener(
            'keydown',
            function (event) {

                /*
                 * Ctrl+K / Cmd+K
                 */
                if (
                    (event.ctrlKey ||
                     event.metaKey) &&
                    event.key.toLowerCase() ===
                    'k'
                ) {

                    event.preventDefault();

                    var search =
                        getElement(
                            'quickSearch'
                        );

                    if (search) {
                        search.focus();
                    }

                    return;
                }


                /*
                 * Escape.
                 */
                if (
                    event.key ===
                    'Escape'
                ) {

                    closeForgotPassword();
                    closeSidebarMobile();

                    var modal =
                        getElement(
                            'modalOverlay'
                        );

                    if (modal) {
                        closeModal(false);
                    }
                }
            }
        );
    }


    /* =========================================================
       GLOBAL CLICK HANDLER
       ========================================================= */

    function setupGlobalUI() {

        var menuToggle =
            getElement(
                'menuToggle'
            );

        var sidebarClose =
            getElement(
                'sidebarClose'
            );

        var logout =
            getElement(
                'logoutBtn'
            );

        var notification =
            getElement(
                'notifBtn'
            );

        var forgot =
            getElement(
                'forgotPasswordBtn'
            );

        var forgotClose =
            getElement(
                'forgotModalClose'
            );

        var forgotCancel =
            getElement(
                'forgotCancel'
            );

        var forgotSubmit =
            getElement(
                'forgotSubmit'
            );

        var search =
            getElement(
                'quickSearch'
            );


        if (menuToggle) {
            menuToggle.addEventListener(
                'click',
                toggleSidebarMobile
            );
        }


        if (sidebarClose) {
            sidebarClose.addEventListener(
                'click',
                closeSidebarMobile
            );
        }


        if (logout) {
            logout.addEventListener(
                'click',
                requestLogoutFromUser
            );
        }


        if (notification) {
            notification.addEventListener(
                'click',
                showNotifications
            );
        }


        if (forgot) {
            forgot.addEventListener(
                'click',
                openForgotPassword
            );
        }


        if (forgotClose) {
            forgotClose.addEventListener(
                'click',
                closeForgotPassword
            );
        }


        if (forgotCancel) {
            forgotCancel.addEventListener(
                'click',
                closeForgotPassword
            );
        }


        if (forgotSubmit) {
            forgotSubmit.addEventListener(
                'click',
                submitForgotPassword
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

                        performQuickSearch();
                    }
                }
            );
        }


        /*
         * Close forgot modal by clicking
         * outside its box.
         */
        var forgotModal =
            getElement(
                'forgotModal'
            );

        if (forgotModal) {

            forgotModal.addEventListener(
                'click',
                function (event) {

                    if (
                        event.target ===
                        forgotModal
                    ) {
                        closeForgotPassword();
                    }
                }
            );
        }
    }


    /* =========================================================
       LOGIN FORM
       ========================================================= */

    function setupLoginForm() {

        var form =
            getElement(
                'loginForm'
            );

        if (!form) {
            return;
        }

        form.addEventListener(
            'submit',
            doLogin
        );
    }


    /* =========================================================
       APPLICATION BOOT
       ========================================================= */

    function showApplication() {

        var loginOverlay =
            getElement(
                'loginOverlay'
            );

        var mainApp =
            getElement(
                'mainApp'
            );

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
    }


    function showLogin() {

        var loginOverlay =
            getElement(
                'loginOverlay'
            );

        var mainApp =
            getElement(
                'mainApp'
            );

        if (loginOverlay) {
            removeClass(
                loginOverlay,
                'hidden'
            );
        }

        if (mainApp) {
            addClass(
                mainApp,
                'hidden'
            );
        }
    }


    function init() {

        if (state.initialized) {
            return;
        }

        state.initialized =
            true;

        setupLoginForm();

        setupPasswordToggle();

        setupGlobalUI();

        setupActivityMonitoring();

        setupConnectionMonitoring();

        setupBackToTop();

        setupKeyboardShortcuts();

        updateDateTime();

        setInterval(
            updateDateTime,
            1000
        );

        /*
         * Default state.
         */
        showLogin();


        /*
         * Verify server-side session.
         *
         * IMPORTANT:
         * The server remains authoritative.
         */
        verifySession()
            .then(function (authenticated) {

                if (!authenticated) {

                    showLogin();

                    return;
                }

                showApplication();

                updateUserDisplay();

                buildSidebar();

                var savedPage =
                    getSavedPage();

                if (
                    !savedPage ||
                    !canAccessPage(
                        savedPage
                    )
                ) {
                    savedPage =
                        'dashboard';
                }

                loadPage(
                    savedPage
                );

                loadAllData();
            });
    }


    /* =========================================================
       CONTROLLED PUBLIC API
       =========================================================
       
       We intentionally DO NOT expose:
       
       window.state
       window.CONFIG
       tokens
       user credentials
       
       Only a tiny controlled API is exposed
       for trusted page modules.
       ========================================================= */

    window.MarineSystem = Object.freeze({

        getCurrentPage:
            function () {
                return state.page;
            },

        getCurrentUser:
            function () {
                /*
                 * Return a shallow copy,
                 * not internal object.
                 */
                if (!state.user) {
                    return null;
                }

                return Object.assign(
                    {},
                    state.user
                );
            },

        hasPermission:
            function (permission) {
                return hasPermission(
                    permission
                );
            },

        canAccessPage:
            function (page) {
                return canAccessPage(
                    page
                );
            },

        navigate:
            function (page) {
                loadPage(page);
            },

        toast:
            function (
                message,
                type,
                duration
            ) {
                showToast(
                    message,
                    type,
                    duration
                );
            },

        refreshData:
            function () {
                loadAllData();
            }
    });


    /* =========================================================
       PAGE MODULE EVENT
       ========================================================= */

    document.addEventListener(
        'marine:page-loaded',
        function (event) {

            if (
                !event ||
                !event.detail
            ) {
                return;
            }

            /*
             * Page-specific JS can listen to:
             *
             * document.addEventListener(
             *   'marine:page-loaded',
             *   function(e) {
             *      if (e.detail.page === 'fleet') {
             *          ...
             *      }
             *   }
             * );
             */
        }
    );


    /* =========================================================
       START
       ========================================================= */

    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            init,
            {
                once: true
            }
        );

    } else {

        init();
    }

})();
