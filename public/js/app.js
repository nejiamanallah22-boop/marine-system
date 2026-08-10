// public/js/app.js
// ============================================================
// 🏆 MARINE SYSTEM - APP.JS v10.0
// ============================================================
// نظام إدارة الأسطول البحري
// Frontend Core
//
// أهم التحسينات:
// ✅ Central API Client
// ✅ JWT/Session Management
// ✅ Auto Refresh
// ✅ 401/403/429 Handling
// ✅ XSS Protection
// ✅ Event Delegation
// ✅ RBAC UI Protection
// ✅ Request Timeout
// ✅ Request Deduplication
// ✅ Abort Controllers
// ✅ Safe DOM Helpers
// ✅ AI Assistant
// ✅ Voice Input / Speech Output
// ============================================================

'use strict';

console.log('🚀 Marine System v10.0 - Starting...');

// ============================================================
// ⚙️ CONFIGURATION
// ============================================================

const CONFIG = Object.freeze({
    version: '10.0.0',

    apiBase: '/api',

    requestTimeout: 15000,

    authTimeout: 8000,

    refreshBeforeExpiry: 5 * 60 * 1000,

    refreshInterval: 60 * 1000,

    maxRefreshAttempts: 2,

    pageTransition: 250,

    toastDuration: 3000,

    maxAIMessageLength: 5000,

    maxInputLength: 10000,

    roles: Object.freeze({
        viewer: 1,
        editor: 2,
        manager: 3,
        admin: 4
    })
});

// ============================================================
// 🛡️ SAFE DOM / XSS PROTECTION
// ============================================================

function escapeHtml(value) {
    if (value === null || value === undefined) return '';

    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
        '/': '&#x2F;',
        '`': '&#x60;',
        '=': '&#x3D;'
    };

    return String(value).replace(/[&<>"'/`=]/g, char => map[char]);
}

function setText(element, value) {
    if (!element) return;

    element.textContent =
        value === null || value === undefined
            ? ''
            : String(value);
}

function clearElement(element) {
    if (!element) return;

    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

function createElement(tag, options = {}) {
    const element = document.createElement(tag);

    if (options.className) {
        element.className = options.className;
    }

    if (options.id) {
        element.id = options.id;
    }

    if (options.text !== undefined) {
        element.textContent = options.text;
    }

    if (options.attributes) {
        Object.entries(options.attributes).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                element.setAttribute(key, String(value));
            }
        });
    }

    return element;
}

// Trusted static HTML only.
// NEVER pass raw API/user content directly.
function setTrustedHTML(element, html) {
    if (!element) return;

    element.innerHTML = html || '';
}

// ============================================================
// 🔔 TOAST SYSTEM
// ============================================================

let toastTimer = null;

function showToast(message, type = 'info') {
    const validTypes = ['success', 'danger', 'warning', 'info'];

    if (!validTypes.includes(type)) {
        type = 'info';
    }

    const oldToast = document.querySelector('.marine-toast');

    if (oldToast) {
        oldToast.remove();
    }

    const icons = {
        success: '✅',
        danger: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    const colors = {
        success: '#4ade80',
        danger: '#f87171',
        warning: '#fbbf24',
        info: '#60a5fa'
    };

    const toast = createElement('div', {
        className: `marine-toast ${type}`
    });

    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    toast.style.cssText = `
        position:fixed;
        bottom:30px;
        left:50%;
        transform:translateX(-50%);
        z-index:999999;
        max-width:min(92vw,650px);
        padding:13px 20px;
        border-radius:14px;
        color:#fff;
        background:rgba(10,14,23,.96);
        border:1px solid ${colors[type]}55;
        border-right:4px solid ${colors[type]};
        box-shadow:0 12px 40px rgba(0,0,0,.45);
        backdrop-filter:blur(14px);
        font-family:Cairo,sans-serif;
        text-align:center;
        opacity:0;
        transition:opacity .25s ease;
    `;

    const icon = createElement('span', {
        text: icons[type]
    });

    const text = createElement('span', {
        text: ` ${message || ''}`
    });

    toast.appendChild(icon);
    toast.appendChild(text);

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
    });

    if (toastTimer) {
        clearTimeout(toastTimer);
    }

    toastTimer = setTimeout(() => {
        toast.style.opacity = '0';

        setTimeout(() => {
            if (toast.isConnected) {
                toast.remove();
            }
        }, 250);
    }, CONFIG.toastDuration);
}

// ============================================================
// 🔐 AUTH MANAGER
// ============================================================

class AuthManager {

    constructor() {
        this.user = null;

        // يتم الاحتفاظ بالتوكن في الذاكرة فقط.
        // لا يتم وضع access token في localStorage.
        this.accessToken = null;

        this.refreshInProgress = null;

        this.tokenExpiresAt = null;

        this.refreshTimer = null;

        this.isLoggingOut = false;

        this.loadSafeUserState();

        this.startTokenMonitor();
    }

    // --------------------------------------------------------
    // User state
    // --------------------------------------------------------

    loadSafeUserState() {
        try {
            const storedUser = sessionStorage.getItem('marine_user');

            if (!storedUser) {
                return;
            }

            const parsed = JSON.parse(storedUser);

            if (
                parsed &&
                typeof parsed === 'object' &&
                typeof parsed.role === 'string'
            ) {
                this.user = parsed;
            }
        } catch (error) {
            console.warn('⚠️ Could not load user state');
            sessionStorage.removeItem('marine_user');
        }
    }

    saveUser(user) {
        this.user = user || null;

        try {
            if (this.user) {
                sessionStorage.setItem(
                    'marine_user',
                    JSON.stringify(this.user)
                );
            } else {
                sessionStorage.removeItem('marine_user');
            }
        } catch (error) {
            console.warn('⚠️ Could not save user state');
        }
    }

    clearUser() {
        this.user = null;

        try {
            sessionStorage.removeItem('marine_user');
        } catch (error) {
            // Ignore storage errors.
        }
    }

    // --------------------------------------------------------
    // Access token
    // --------------------------------------------------------

    setAccessToken(token) {
        this.accessToken =
            typeof token === 'string' && token.length > 0
                ? token
                : null;

        this.tokenExpiresAt = this.extractTokenExpiry(
            this.accessToken
        );
    }

    getToken() {
        return this.accessToken;
    }

    getUser() {
        return this.user;
    }

    // --------------------------------------------------------
    // JWT expiry
    // --------------------------------------------------------

    extractTokenExpiry(token) {
        if (!token) return null;

        try {
            const parts = token.split('.');

            if (parts.length !== 3) {
                return null;
            }

            const payload = JSON.parse(
                this.base64UrlDecode(parts[1])
            );

            if (!payload.exp) {
                return null;
            }

            return Number(payload.exp) * 1000;
        } catch (error) {
            return null;
        }
    }

    base64UrlDecode(value) {
        const normalized = value
            .replace(/-/g, '+')
            .replace(/_/g, '/');

        const padded =
            normalized +
            '='.repeat((4 - normalized.length % 4) % 4);

        const binary = atob(padded);

        const bytes = Uint8Array.from(
            binary,
            char => char.charCodeAt(0)
        );

        return new TextDecoder().decode(bytes);
    }

    // --------------------------------------------------------
    // Authentication
    // --------------------------------------------------------

    async login(username, password) {
        if (!username || !password) {
            return {
                success: false,
                error: 'الرجاء إدخال بيانات الدخول'
            };
        }

        try {
            const response = await fetchWithTimeout(
                `${CONFIG.apiBase}/auth/login`,
                {
                    method: 'POST',

                    credentials: 'include',

                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },

                    body: JSON.stringify({
                        email: username,
                        username,
                        password
                    })
                },

                CONFIG.authTimeout
            );

            const data = await parseJsonSafely(response);

            if (!response.ok) {
                return {
                    success: false,
                    error: data?.error ||
                           data?.message ||
                           'فشل تسجيل الدخول'
                };
            }

            if (!data?.success) {
                return {
                    success: false,
                    error: data?.error ||
                           data?.message ||
                           'بيانات الدخول غير صحيحة'
                };
            }

            /*
             * دعم السيرفر الحالي إذا كان يعيد token.
             *
             * إذا تم تحويل المصادقة بالكامل إلى HttpOnly Cookie
             * يمكن للسيرفر عدم إعادة token هنا.
             */
            if (data.token) {
                this.setAccessToken(data.token);
            }

            if (data.user) {
                this.saveUser(data.user);
            }

            this.isLoggingOut = false;

            return {
                success: true,
                user: this.user,
                data
            };

        } catch (error) {
            console.error('❌ Login error:', error);

            return {
                success: false,
                error: getNetworkErrorMessage(error)
            };
        }
    }

    async verify() {
        try {
            const response = await this.request(
                `${CONFIG.apiBase}/auth/verify`,
                {
                    method: 'GET',
                    timeout: CONFIG.authTimeout,
                    skipRefresh: true
                }
            );

            if (!response.ok) {
                return false;
            }

            const data = await parseJsonSafely(response);

            if (!data?.success) {
                return false;
            }

            if (data.user) {
                this.saveUser(data.user);
            }

            return true;

        } catch (error) {
            console.warn('⚠️ Authentication verification failed');

            return false;
        }
    }

    // --------------------------------------------------------
    // Refresh
    // --------------------------------------------------------

    async refreshAccessToken() {

        if (this.refreshInProgress) {
            return this.refreshInProgress;
        }

        this.refreshInProgress = (async () => {

            try {
                const response = await fetchWithTimeout(
                    `${CONFIG.apiBase}/auth/refresh`,
                    {
                        method: 'POST',

                        credentials: 'include',

                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        }
                    },

                    CONFIG.authTimeout
                );

                const data = await parseJsonSafely(response);

                if (!response.ok || !data?.success) {

                    if (
                        response.status === 401 ||
                        response.status === 403
                    ) {
                        this.handleSessionExpired();
                    }

                    return false;
                }

                if (data.token) {
                    this.setAccessToken(data.token);
                }

                if (data.user) {
                    this.saveUser(data.user);
                }

                return true;

            } catch (error) {

                console.warn(
                    '⚠️ Refresh request failed'
                );

                return false;

            } finally {

                this.refreshInProgress = null;
            }

        })();

        return this.refreshInProgress;
    }

    // --------------------------------------------------------
    // Token monitor
    // --------------------------------------------------------

    startTokenMonitor() {

        this.stopTokenMonitor();

        this.refreshTimer = setInterval(
            async () => {

                if (!this.accessToken) {
                    return;
                }

                if (!this.tokenExpiresAt) {
                    return;
                }

                const timeLeft =
                    this.tokenExpiresAt - Date.now();

                if (
                    timeLeft > 0 &&
                    timeLeft <= CONFIG.refreshBeforeExpiry
                ) {
                    await this.refreshAccessToken();
                }

            },
            CONFIG.refreshInterval
        );
    }

    stopTokenMonitor() {

        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    // --------------------------------------------------------
    // Session expired
    // --------------------------------------------------------

    handleSessionExpired() {

        if (this.isLoggingOut) {
            return;
        }

        this.accessToken = null;
        this.tokenExpiresAt = null;

        this.clearUser();

        showToast(
            '⚠️ انتهت الجلسة، يرجى تسجيل الدخول من جديد',
            'warning'
        );

        setTimeout(() => {
            location.reload();
        }, 800);
    }

    // --------------------------------------------------------
    // Logout
    // --------------------------------------------------------

    async logout() {

        if (this.isLoggingOut) {
            return;
        }

        this.isLoggingOut = true;

        try {

            if (this.accessToken) {

                await fetchWithTimeout(
                    `${CONFIG.apiBase}/auth/logout`,
                    {
                        method: 'POST',

                        credentials: 'include',

                        headers: {
                            'Authorization':
                                `Bearer ${this.accessToken}`,
                            'Content-Type':
                                'application/json'
                        }
                    },

                    CONFIG.authTimeout
                );
            }

        } catch (error) {

            console.warn(
                '⚠️ Logout request failed'
            );

        } finally {

            this.accessToken = null;
            this.tokenExpiresAt = null;

            this.clearUser();

            this.stopTokenMonitor();
        }
    }

    // --------------------------------------------------------
    // Roles
    // --------------------------------------------------------

    hasRole(role) {

        if (!this.user) {
            return false;
        }

        return this.user.role === role;
    }

    hasAnyRole(roles) {

        if (!this.user || !Array.isArray(roles)) {
            return false;
        }

        return roles.includes(this.user.role);
    }

    hasMinimumRole(role) {

        if (!this.user) {
            return false;
        }

        const userLevel =
            CONFIG.roles[this.user.role] || 0;

        const requiredLevel =
            CONFIG.roles[role] || 999;

        return userLevel >= requiredLevel;
    }

    hasPermission(permission) {

        if (!this.user) {
            return false;
        }

        if (this.user.role === 'admin') {
            return true;
        }

        const permissions =
            Array.isArray(this.user.permissions)
                ? this.user.permissions
                : [];

        return permissions.includes(permission);
    }

    // --------------------------------------------------------
    // Generic authenticated request
    // --------------------------------------------------------

    async request(url, options = {}) {

        const {
            skipRefresh = false,
            timeout = CONFIG.requestTimeout,
            ...fetchOptions
        } = options;

        fetchOptions.credentials =
            fetchOptions.credentials || 'include';

        fetchOptions.headers = {
            Accept: 'application/json',
            ...(fetchOptions.headers || {})
        };

        if (this.accessToken) {
            fetchOptions.headers.Authorization =
                `Bearer ${this.accessToken}`;
        }

        let response = await fetchWithTimeout(
            url,
            fetchOptions,
            timeout
        );

        // ----------------------------------------------------
        // 401 → محاولة تجديد واحدة
        // ----------------------------------------------------

        if (
            response.status === 401 &&
            !skipRefresh
        ) {

            const refreshed =
                await this.refreshAccessToken();

            if (refreshed) {

                fetchOptions.headers = {
                    ...(fetchOptions.headers || {})
                };

                if (this.accessToken) {
                    fetchOptions.headers.Authorization =
                        `Bearer ${this.accessToken}`;
                }

                response = await fetchWithTimeout(
                    url,
                    fetchOptions,
                    timeout
                );
            }
        }

        // ----------------------------------------------------
        // Final authentication failure
        // ----------------------------------------------------

        if (
            response.status === 401 &&
            !skipRefresh
        ) {
            this.handleSessionExpired();
        }

        return response;
    }
}

// ============================================================
// 🌐 FETCH HELPERS
// ============================================================

async function fetchWithTimeout(
    url,
    options = {},
    timeout = CONFIG.requestTimeout
) {

    const controller = new AbortController();

    const externalSignal = options.signal;

    let timer = null;

    const signalListener = () => {
        controller.abort();
    };

    if (externalSignal) {

        if (externalSignal.aborted) {
            controller.abort();
        } else {
            externalSignal.addEventListener(
                'abort',
                signalListener,
                { once: true }
            );
        }
    }

    timer = setTimeout(() => {
        controller.abort();
    }, timeout);

    try {

        return await fetch(url, {
            ...options,
            signal: controller.signal
        });

    } finally {

        clearTimeout(timer);

        if (externalSignal) {
            externalSignal.removeEventListener(
                'abort',
                signalListener
            );
        }
    }
}

async function parseJsonSafely(response) {

    const contentType =
        response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
        return null;
    }

    try {
        return await response.json();
    } catch (error) {
        return null;
    }
}

function getNetworkErrorMessage(error) {

    if (error?.name === 'AbortError') {
        return 'انتهت مهلة الاتصال بالخادم';
    }

    if (!navigator.onLine) {
        return 'لا يوجد اتصال بالإنترنت';
    }

    return 'حدث خطأ في الاتصال بالخادم';
}

// ============================================================
// 📄 PAGE MANAGER
// ============================================================

class PageManager {

    constructor(auth) {

        this.auth = auth;

        this.currentPage = null;

        this.pageContainer =
            document.getElementById('pageContainer');

        this.conversationId = null;

        this.lastResponse = null;

        this.recognition = null;

        this.isListening = false;

        this.activeRequests = new Map();

        this.pageHandlers = {

            dashboard:
                this.loadDashboard.bind(this),

            fleet:
                this.loadFleet.bind(this),

            maintenance:
                this.loadMaintenance.bind(this),

            efficiency:
                this.loadEfficiency.bind(this),

            support:
                this.loadSupport.bind(this),

            users:
                this.loadUsers.bind(this),

            notes:
                this.loadNotes.bind(this),

            sessions:
                this.loadSessions.bind(this),

            'ai-assistant':
                this.loadAIAssistant.bind(this)
        };

        this.pagePermissions = {

            users: ['admin', 'manager'],

            sessions: ['admin']
        };

        this.setupEventDelegation();
    }

    // ========================================================
    // EVENT DELEGATION
    // ========================================================

    setupEventDelegation() {

        document.addEventListener(
            'click',
            event => {

                const target =
                    event.target.closest(
                        '[data-action]'
                    );

                if (!target) {
                    return;
                }

                const action =
                    target.dataset.action;

                const id =
                    target.dataset.id;

                switch (action) {

                    case 'edit-vessel':
                        this.editVessel(id);
                        break;

                    case 'delete-vessel':
                        this.deleteVessel(id);
                        break;

                    case 'edit-user':
                        this.editUser(id);
                        break;

                    case 'delete-user':
                        this.deleteUser(id);
                        break;

                    case 'refresh':
                        this.refreshPage();
                        break;

                    case 'logout':
                        doLogout();
                        break;

                    case 'copy-ai-message':
                        this.copyChatMessage(target);
                        break;

                    case 'speak-ai-message':
                        this.speakTextFromMessage(target);
                        break;

                    default:
                        break;
                }
            }
        );
    }

    // ========================================================
    // LOAD PAGE
    // ========================================================

    async loadPage(pageName) {

        if (!this.pageHandlers[pageName]) {

            showToast(
                '❌ الصفحة غير موجودة',
                'danger'
            );

            return;
        }

        const requiredRoles =
            this.pagePermissions[pageName];

        if (
            requiredRoles &&
            !this.auth.hasAnyRole(requiredRoles)
        ) {

            showToast(
                '⛔ ليس لديك صلاحية للوصول إلى هذه الصفحة',
                'danger'
            );

            return this.loadPage('dashboard');
        }

        if (!this.pageContainer) {
            return;
        }

        this.cancelActiveRequests();

        this.showLoading();

        try {

            const response =
                await fetchWithTimeout(
                    `/pages/${encodeURIComponent(pageName)}.html`,
                    {
                        method: 'GET',
                        credentials: 'same-origin',
                        headers: {
                            Accept: 'text/html'
                        }
                    },
                    CONFIG.requestTimeout
                );

            if (!response.ok) {
                throw new Error(
                    `Page HTTP ${response.status}`
                );
            }

            const html =
                await response.text();

            this.renderPage(
                pageName,
                html
            );

            this.currentPage = pageName;

            setTimeout(() => {
                this.initPage(pageName);
            }, 0);

        } catch (error) {

            console.error(
                '❌ Page load error:',
                error
            );

            this.showPageError(error);
        }
    }

    showLoading() {

        if (!this.pageContainer) {
            return;
        }

        const old =
            this.pageContainer.querySelector(
                '.page-content'
            );

        if (old) {
            old.remove();
        }

        const loading =
            createElement('div', {
                className: 'page-loading'
            });

        setTrustedHTML(
            loading,
            `
            <div style="
                text-align:center;
                padding:60px 20px;
            ">
                <div class="spinner"></div>

                <p style="
                    color:rgba(255,255,255,.45);
                    margin-top:15px;
                ">
                    ⏳ جاري تحميل الصفحة...
                </p>
            </div>
            `
        );

        this.pageContainer.appendChild(
            loading
        );
    }

    renderPage(pageName, html) {

        clearElement(
            this.pageContainer
        );

        const page =
            createElement('div', {
                className: 'page-content',
                id: `page-${pageName}`
            });

        // HTML الصفحة تأتي من ملفات المشروع الموثوقة.
        setTrustedHTML(page, html);

        page.style.opacity = '0';
        page.style.transition =
            `opacity ${CONFIG.pageTransition}ms ease`;

        this.pageContainer.appendChild(page);

        requestAnimationFrame(() => {
            page.style.opacity = '1';
        });
    }

    showPageError(error) {

        clearElement(
            this.pageContainer
        );

        const page =
            createElement('div', {
                className: 'page-content'
            });

        setTrustedHTML(
            page,
            `
            <div style="
                text-align:center;
                padding:60px 20px;
                color:#f87171;
            ">

                <h2>❌ تعذر تحميل الصفحة</h2>

                <p style="
                    color:rgba(255,255,255,.55);
                    margin:15px 0;
                ">
                    ${escapeHtml(error?.message || 'خطأ غير معروف')}
                </p>

                <button
                    type="button"
                    class="btn-primary"
                    data-action="refresh"
                >
                    🔄 إعادة المحاولة
                </button>

            </div>
            `
        );

        this.pageContainer.appendChild(page);
    }

    initPage(pageName) {

        const handler =
            this.pageHandlers[pageName];

        if (!handler) {
            return;
        }

        try {
            handler();
        } catch (error) {
            console.error(
                `❌ ${pageName} initialization error:`,
                error
            );
        }
    }

    // ========================================================
    // API
    // ========================================================

    async fetchData(url, options = {}) {

        const requestKey =
            `${options.method || 'GET'}:${url}`;

        if (this.activeRequests.has(requestKey)) {
            return this.activeRequests.get(requestKey);
        }

        const promise =
            (async () => {

                try {

                    const response =
                        await this.auth.request(
                            url,
                            options
                        );

                    if (!response.ok) {

                        await this.handleApiError(
                            response
                        );

                        return null;
                    }

                    return await parseJsonSafely(
                        response
                    );

                } catch (error) {

                    console.error(
                        '❌ API request error:',
                        error
                    );

                    showToast(
                        getNetworkErrorMessage(error),
                        'danger'
                    );

                    return null;

                } finally {

                    this.activeRequests.delete(
                        requestKey
                    );
                }
            })();

        this.activeRequests.set(
            requestKey,
            promise
        );

        return promise;
    }

    async handleApiError(response) {

        if (response.status === 401) {
            return;
        }

        if (response.status === 403) {

            showToast(
                '⛔ ليس لديك صلاحية لتنفيذ هذه العملية',
                'danger'
            );

            return;
        }

        if (response.status === 404) {

            showToast(
                '❌ المورد المطلوب غير موجود',
                'danger'
            );

            return;
        }

        if (response.status === 429) {

            showToast(
                '⏳ تم تجاوز عدد الطلبات، حاول بعد قليل',
                'warning'
            );

            return;
        }

        if (response.status >= 500) {

            showToast(
                '❌ خطأ داخلي في الخادم',
                'danger'
            );

            return;
        }

        showToast(
            `❌ فشل الطلب (${response.status})`,
            'danger'
        );
    }

    cancelActiveRequests() {
        this.activeRequests.clear();
    }

    // ========================================================
    // DASHBOARD
    // ========================================================

    async loadDashboard() {

        const data =
            await this.fetchData(
                `${CONFIG.apiBase}/vessels/stats`
            );

        if (!data) {
            return;
        }

        const values = {

            dashTotal:
                data.total ?? 0,

            dashReady:
                data.ready ?? 0,

            dashBroken:
                data.broken ?? 0,

            dashMaintenance:
                data.maintenance ?? 0
        };

        Object.entries(values).forEach(
            ([id, value]) => {

                setText(
                    document.getElementById(id),
                    value
                );
            }
        );

        const percent =
            Number(data.total) > 0
                ? Math.round(
                    (Number(data.ready || 0) /
                    Number(data.total)) * 100
                )
                : 0;

        setText(
            document.getElementById(
                'dashReadyPercent'
            ),
            `${percent}%`
        );

        const maintenance =
            await this.fetchData(
                `${CONFIG.apiBase}/maintenance`
            );

        if (!Array.isArray(maintenance)) {
            return;
        }

        const totalCost =
            maintenance.reduce(
                (sum, record) =>
                    sum +
                    Number(record?.cost || 0),
                0
            );

        setText(
            document.getElementById(
                'dashTotalCost'
            ),
            `${totalCost.toLocaleString('ar-TN')} د.ت`
        );

        setText(
            document.getElementById(
                'dashMaintenanceCount'
            ),
            maintenance.length
        );
    }

    // ========================================================
    // FLEET
    // ========================================================

    async loadFleet() {

        const data =
            await this.fetchData(
                `${CONFIG.apiBase}/vessels`
            );

        const tbody =
            document.getElementById(
                'vesselsBody'
            );

        if (!tbody) {
            return;
        }

        if (!Array.isArray(data) || data.length === 0) {

            setTrustedHTML(
                tbody,
                `
                <tr>
                    <td colspan="6"
                        style="
                        text-align:center;
                        padding:30px;
                        color:rgba(255,255,255,.3);
                        ">
                        📭 لا توجد مراكب
                    </td>
                </tr>
                `
            );

            return;
        }

        const fragment =
            document.createDocumentFragment();

        data.forEach((vessel, index) => {

            const row =
                createElement('tr');

            const status =
                vessel.stat || 'صالح';

            const statusClass =
                status === 'صالح'
                    ? 'success'
                    : status === 'معطب'
                        ? 'danger'
                        : 'warning';

            const cells = [

                String(index + 1),

                vessel.name || '-',

                status,

                vessel.region || '-',

                vessel.supp || '-'
            ];

            cells.forEach(value => {

                const td =
                    createElement('td', {
                        text: value
                    });

                row.appendChild(td);
            });

            const actions =
                createElement('td');

            const editButton =
                createElement('button', {
                    className: 'btn-sm btn-edit',
                    text: '✏️',
                    attributes: {
                        type: 'button',
                        'data-action': 'edit-vessel',
                        'data-id':
                            vessel._id || vessel.id || ''
                    }
                });

            const deleteButton =
                createElement('button', {
                    className: 'btn-sm btn-delete',
                    text: '🗑️',
                    attributes: {
                        type: 'button',
                        'data-action': 'delete-vessel',
                        'data-id':
                            vessel._id || vessel.id || ''
                    }
                });

            // إضافة class للحالة بشكل آمن.
            const statusCell =
                row.children[2];

            if (statusCell) {

                const statusElement =
                    createElement('span', {
                        className:
                            `status ${statusClass}`,
                        text: status
                    });

                clearElement(statusCell);

                statusCell.appendChild(
                    statusElement
                );
            }

            actions.appendChild(editButton);
            actions.appendChild(deleteButton);

            row.appendChild(actions);

            fragment.appendChild(row);
        });

        clearElement(tbody);
        tbody.appendChild(fragment);
    }

    // ========================================================
    // MAINTENANCE
    // ========================================================

    async loadMaintenance() {

        const data =
            await this.fetchData(
                `${CONFIG.apiBase}/maintenance`
            );

        const tbody =
            document.getElementById(
                'maintenanceBody'
            );

        if (!tbody) {
            return;
        }

        if (!Array.isArray(data) || data.length === 0) {

            setTrustedHTML(
                tbody,
                `
                <tr>
                    <td colspan="6"
                        style="
                        text-align:center;
                        padding:30px;
                        color:rgba(255,255,255,.3);
                        ">
                        📭 لا توجد سجلات
                    </td>
                </tr>
                `
            );

            return;
        }

        const fragment =
            document.createDocumentFragment();

        data.forEach((record, index) => {

            const row =
                createElement('tr');

            const values = [

                index + 1,

                record.vesselName || '-',

                record.type || '-',

                record.technician || '-',

                `${Number(record.cost || 0).toLocaleString('ar-TN')} د.ت`
            ];

            values.forEach(value => {

                row.appendChild(
                    createElement('td', {
                        text: value
                    })
                );
            });

            const statusCell =
                createElement('td');

            const status =
                record.status ||
                'قيد الإنجاز';

            const statusClass =
                status === 'مكتملة'
                    ? 'success'
                    : status === 'قيد الإنجاز'
                        ? 'warning'
                        : 'danger';

            statusCell.appendChild(
                createElement('span', {
                    className:
                        `status ${statusClass}`,
                    text: status
                })
            );

            row.appendChild(statusCell);

            fragment.appendChild(row);
        });

        clearElement(tbody);

        tbody.appendChild(fragment);
    }

    // ========================================================
    // EFFICIENCY
    // ========================================================

    loadEfficiency() {
        console.log('📈 Efficiency page');
    }

    // ========================================================
    // SUPPORT
    // ========================================================

    loadSupport() {
        console.log('🎫 Support page');
    }

    // ========================================================
    // NOTES
    // ========================================================

    loadNotes() {
        console.log('📝 Notes page');
    }

    // ========================================================
    // USERS
    // ========================================================

    async loadUsers() {

        if (
            !this.auth.hasAnyRole(
                ['admin', 'manager']
            )
        ) {

            showToast(
                '⛔ غير مصرح',
                'danger'
            );

            return;
        }

        const data =
            await this.fetchData(
                `${CONFIG.apiBase}/users`
            );

        const tbody =
            document.getElementById(
                'usersBody'
            );

        if (!tbody) {
            return;
        }

        if (!Array.isArray(data) || data.length === 0) {

            setTrustedHTML(
                tbody,
                `
                <tr>
                    <td colspan="5"
                        style="
                        text-align:center;
                        padding:30px;
                        color:rgba(255,255,255,.3);
                        ">
                        📭 لا يوجد مستخدمون
                    </td>
                </tr>
                `
            );

            return;
        }

        const fragment =
            document.createDocumentFragment();

        data.forEach(user => {

            const row =
                createElement('tr');

            row.appendChild(
                createElement('td', {
                    text: user.name || '-'
                })
            );

            row.appendChild(
                createElement('td', {
                    text: user.email || '-'
                })
            );

            row.appendChild(
                createElement('td', {
                    text: user.role || 'viewer'
                })
            );

            row.appendChild(
                createElement('td', {
                    text: user.isActive
                        ? '✅ نشط'
                        : '❌ معطل'
                })
            );

            const actions =
                createElement('td');

            actions.appendChild(
                createElement('button', {
                    className: 'btn-sm btn-edit',
                    text: '✏️',
                    attributes: {
                        type: 'button',
                        'data-action':
                            'edit-user',
                        'data-id':
                            user._id || user.id || ''
                    }
                })
            );

            actions.appendChild(
                createElement('button', {
                    className: 'btn-sm btn-delete',
                    text: '🗑️',
                    attributes: {
                        type: 'button',
                        'data-action':
                            'delete-user',
                        'data-id':
                            user._id || user.id || ''
                    }
                })
            );

            row.appendChild(actions);

            fragment.appendChild(row);
        });

        clearElement(tbody);

        tbody.appendChild(fragment);
    }

    // ========================================================
    // SESSIONS
    // ========================================================

    loadSessions() {

        if (!this.auth.hasRole('admin')) {

            showToast(
                '⛔ هذه الصفحة للمسؤول فقط',
                'danger'
            );

            return;
        }

        console.log('🔐 Sessions page');
    }

    // ========================================================
    // AI
    // ========================================================

    loadAIAssistant() {

        console.log(
            '🤖 AI Assistant initialized'
        );

        this.initAIAssistant();
    }

    initAIAssistant() {

        const send =
            document.getElementById(
                'sendBtn'
            );

        const input =
            document.getElementById(
                'chatInput'
            );

        const mic =
            document.getElementById(
                'micBtn'
            );

        const speaker =
            document.getElementById(
                'speakerBtn'
            );

        const clear =
            document.getElementById(
                'clearBtn'
            );

        if (send) {
            send.addEventListener(
                'click',
                () => this.askAI()
            );
        }

        if (input) {

            input.addEventListener(
                'keydown',
                event => {

                    if (
                        event.key === 'Enter' &&
                        !event.shiftKey
                    ) {

                        event.preventDefault();

                        this.askAI();
                    }
                }
            );
        }

        if (mic) {
            mic.addEventListener(
                'click',
                () => this.toggleVoice()
            );
        }

        if (speaker) {
            speaker.addEventListener(
                'click',
                () => this.speakLast()
            );
        }

        if (clear) {
            clear.addEventListener(
                'click',
                () => this.clearChat()
            );
        }
    }

    async askAI() {

        const input =
            document.getElementById(
                'chatInput'
            );

        const chatBox =
            document.getElementById(
                'chatBox'
            );

        const sendBtn =
            document.getElementById(
                'sendBtn'
            );

        if (!input || !chatBox) {
            return;
        }

        const question =
            input.value.trim();

        if (!question) {

            showToast(
                '❌ الرجاء كتابة سؤال',
                'warning'
            );

            return;
        }

        if (
            question.length >
            CONFIG.maxAIMessageLength
        ) {

            showToast(
                '⚠️ السؤال طويل جدًا',
                'warning'
            );

            return;
        }

        this.addChatMessage(
            'user',
            question
        );

        input.value = '';
        input.disabled = true;

        if (sendBtn) {
            sendBtn.disabled = true;
        }

        const typing =
            this.showTypingIndicator(
                chatBox
            );

        try {

            const response =
                await this.auth.request(
                    `${CONFIG.apiBase}/ai/ask`,
                    {
                        method: 'POST',

                        timeout: 60000,

                        headers: {
                            'Content-Type':
                                'application/json'
                        },

                        body: JSON.stringify({
                            message: question,
                            conversationId:
                                this.conversationId
                                || null
                        })
                    }
                );

            typing.remove();

            const data =
                await parseJsonSafely(
                    response
                );

            if (!response.ok) {

                this.addChatMessage(
                    'ai',
                    data?.error ||
                    data?.message ||
                    '❌ حدث خطأ في المساعد الذكي'
                );

                return;
            }

            if (!data?.success) {

                this.addChatMessage(
                    'ai',
                    data?.error ||
                    '⚠️ لم يتم الحصول على رد'
                );

                return;
            }

            this.conversationId =
                data.conversationId ||
                this.conversationId;

            this.lastResponse =
                data.response || '';

            this.addChatMessage(
                'ai',
                this.lastResponse
            );

        } catch (error) {

            typing.remove();

            console.error(
                '❌ AI error:',
                error
            );

            this.addChatMessage(
                'ai',
                getNetworkErrorMessage(error)
            );

        } finally {

            input.disabled = false;

            if (sendBtn) {
                sendBtn.disabled = false;
            }

            input.focus();
        }
    }

    addChatMessage(role, content) {

        const chatBox =
            document.getElementById(
                'chatBox'
            );

        if (!chatBox) {
            return;
        }

        const message =
            createElement('div', {
                className:
                    `message ${role}`
            });

        const sender =
            role === 'user'
                ? '👤 أنت'
                : '🤖 المساعد الذكي';

        const senderElement =
            createElement('div', {
                className: 'sender',
                text: sender
            });

        const contentElement =
            createElement('div', {
                className: 'content',
                text: content || ''
            });

        const timeElement =
            createElement('div', {
                className: 'time',
                text: new Date()
                    .toLocaleTimeString(
                        'ar-TN',
                        {
                            hour: '2-digit',
                            minute: '2-digit'
                        }
                    )
            });

        message.appendChild(
            senderElement
        );

        message.appendChild(
            contentElement
        );

        message.appendChild(
            timeElement
        );

        if (role === 'ai') {

            const actions =
                createElement('div', {
                    className: 'actions'
                });

            actions.appendChild(
                createElement('button', {
                    text: '📋 نسخ',
                    attributes: {
                        type: 'button',
                        'data-action':
                            'copy-ai-message'
                    }
                })
            );

            actions.appendChild(
                createElement('button', {
                    text: '🔊 استماع',
                    attributes: {
                        type: 'button',
                        'data-action':
                            'speak-ai-message'
                    }
                })
            );

            message.appendChild(actions);
        }

        chatBox.appendChild(message);

        chatBox.scrollTop =
            chatBox.scrollHeight;
    }

    showTypingIndicator(chatBox) {

        const typing =
            createElement('div', {
                className:
                    'typing active'
            });

        setTrustedHTML(
            typing,
            `
            <span></span>
            <span></span>
            <span></span>
            `
        );

        chatBox.appendChild(typing);

        chatBox.scrollTop =
            chatBox.scrollHeight;

        return typing;
    }

    copyChatMessage(button) {

        const message =
            button.closest('.message');

        const content =
            message?.querySelector(
                '.content'
            )?.textContent || '';

        if (!content) {
            return;
        }

        if (
            !navigator.clipboard ||
            !navigator.clipboard.writeText
        ) {

            showToast(
                '❌ النسخ غير مدعوم',
                'warning'
            );

            return;
        }

        navigator.clipboard
            .writeText(content)
            .then(() => {

                const oldText =
                    button.textContent;

                button.textContent =
                    '✅ تم النسخ';

                setTimeout(() => {

                    if (
                        button.isConnected
                    ) {
                        button.textContent =
                            oldText;
                    }

                }, 1500);
            })
            .catch(() => {

                showToast(
                    '❌ تعذر نسخ النص',
                    'danger'
                );
            });
    }

    speakTextFromMessage(button) {

        const message =
            button.closest('.message');

        const content =
            message?.querySelector(
                '.content'
            )?.textContent || '';

        this.speakText(content);
    }

    speakText(text) {

        if (
            !('speechSynthesis' in window)
        ) {

            showToast(
                '❌ المتصفح لا يدعم النطق',
                'warning'
            );

            return;
        }

        const value =
            String(text || '').trim();

        if (!value) {
            return;
        }

        window.speechSynthesis.cancel();

        const utterance =
            new SpeechSynthesisUtterance(
                value
            );

        utterance.lang = 'ar-SA';
        utterance.rate = 0.9;
        utterance.pitch = 1;

        const voices =
            window.speechSynthesis
                .getVoices();

        const arabicVoice =
            voices.find(
                voice =>
                    voice.lang &&
                    voice.lang
                        .toLowerCase()
                        .startsWith('ar')
            );

        if (arabicVoice) {
            utterance.voice =
                arabicVoice;
        }

        window.speechSynthesis.speak(
            utterance
        );
    }

    speakLast() {

        if (!this.lastResponse) {

            showToast(
                'لا يوجد رد للاستماع',
                'warning'
            );

            return;
        }

        this.speakText(
            this.lastResponse
        );
    }

    clearChat() {

        const chatBox =
            document.getElementById(
                'chatBox'
            );

        if (!chatBox) {
            return;
        }

        if (
            !chatBox.querySelector(
                '.message'
            )
        ) {
            return;
        }

        if (
            !window.confirm(
                'هل أنت متأكد من مسح المحادثة؟'
            )
        ) {
            return;
        }

        clearElement(chatBox);

        this.conversationId = null;
        this.lastResponse = null;

        this.addChatMessage(
            'ai',
            '👋 تم مسح المحادثة. اكتب سؤالك الجديد!'
        );
    }

    // ========================================================
    // VOICE
    // ========================================================

    toggleVoice() {

        const SpeechRecognition =
            window.SpeechRecognition ||
            window.webkitSpeechRecognition;

        if (!SpeechRecognition) {

            showToast(
                '❌ المتصفح لا يدعم التعرف على الصوت',
                'warning'
            );

            return;
        }

        if (this.isListening) {
            this.stopVoice();
            return;
        }

        this.recognition =
            new SpeechRecognition();

        this.recognition.lang =
            'ar-SA';

        this.recognition.continuous =
            false;

        this.recognition.interimResults =
            true;

        this.recognition.onstart =
            () => {

                this.isListening = true;

                const mic =
                    document.getElementById(
                        'micBtn'
                    );

                if (mic) {
                    mic.textContent = '⏹️';
                }

                showToast(
                    '🎤 جاري الاستماع...',
                    'info'
                );
            };

        this.recognition.onresult =
            event => {

                let transcript = '';

                for (
                    let i = event.resultIndex;
                    i < event.results.length;
                    i++
                ) {

                    transcript +=
                        event.results[i][0]
                            .transcript;
                }

                const input =
                    document.getElementById(
                        'chatInput'
                    );

                if (input) {
                    input.value =
                        transcript;
                }

                const lastResult =
                    event.results[
                        event.results.length - 1
                    ];

                if (
                    lastResult &&
                    lastResult.isFinal
                ) {

                    setTimeout(() => {

                        if (input) {
                            this.askAI();
                        }

                    }, 200);
                }
            };

        this.recognition.onerror =
            event => {

                if (
                    event.error ===
                    'not-allowed'
                ) {

                    showToast(
                        '❌ يجب السماح باستخدام الميكروفون',
                        'danger'
                    );

                } else if (
                    event.error !==
                    'aborted'
                ) {

                    showToast(
                        '⚠️ تعذر استخدام الميكروفون',
                        'warning'
                    );
                }

                this.stopVoice();
            };

        this.recognition.onend =
            () => {
                this.stopVoice();
            };

        try {
            this.recognition.start();
        } catch (error) {
            this.stopVoice();
        }
    }

    stopVoice() {

        this.isListening = false;

        const mic =
            document.getElementById(
                'micBtn'
            );

        if (mic) {
            mic.textContent = '🎤';
        }

        if (this.recognition) {

            try {
                this.recognition.stop();
            } catch (error) {
                // Ignore.
            }
        }
    }

    // ========================================================
    // CRUD
    // ========================================================

    async editVessel(id) {

        if (!id) {
            return;
        }

        if (
            !this.auth.hasMinimumRole(
                'editor'
            )
        ) {

            showToast(
                '⛔ ليس لديك صلاحية تعديل المراكب',
                'danger'
            );

            return;
        }

        console.log(
            '✏️ Edit vessel:',
            id
        );

        /*
         * سيتم ربط PUT/PATCH الحقيقي
         * بعد معرفة API الموجود في server.js.
         */
    }

    async deleteVessel(id) {

        if (!id) {
            return;
        }

        if (
            !this.auth.hasMinimumRole(
                'manager'
            )
        ) {

            showToast(
                '⛔ ليس لديك صلاحية حذف المراكب',
                'danger'
            );

            return;
        }

        if (
            !window.confirm(
                '⚠️ هل أنت متأكد من حذف هذا المركب؟'
            )
        ) {
            return;
        }

        /*
         * لا ننفذ DELETE قبل معرفة endpoint
         * الحقيقي في server.js.
         */

        console.log(
            '🗑️ Delete vessel:',
            id
        );
    }

    async editUser(id) {

        if (!id) {
            return;
        }

        if (
            !this.auth.hasAnyRole(
                ['admin', 'manager']
            )
        ) {

            showToast(
                '⛔ غير مصرح',
                'danger'
            );

            return;
        }

        console.log(
            '✏️ Edit user:',
            id
        );
    }

    async deleteUser(id) {

        if (!id) {
            return;
        }

        if (
            !this.auth.hasRole(
                'admin'
            )
        ) {

            showToast(
                '⛔ حذف المستخدمين للمسؤول فقط',
                'danger'
            );

            return;
        }

        if (
            !window.confirm(
                '⚠️ هل أنت متأكد من حذف المستخدم؟'
            )
        ) {
            return;
        }

        console.log(
            '🗑️ Delete user:',
            id
        );
    }

    refreshPage() {

        if (this.currentPage) {
            this.loadPage(
                this.currentPage
            );
        }
    }
}

// ============================================================
// 🚀 GLOBAL INSTANCES
// ============================================================

const authManager =
    new AuthManager();

const pageManager =
    new PageManager(
        authManager
    );

window.authManager =
    authManager;

window.pageManager =
    pageManager;

// ============================================================
// 👤 USER DISPLAY
// ============================================================

function updateUserDisplay() {

    const display =
        document.getElementById(
            'userRoleDisplay'
        );

    if (!display) {
        return;
    }

    const user =
        authManager.getUser();

    if (!user) {
        clearElement(display);
        return;
    }

    const emojis = {
        admin: '👑',
        manager: '⭐',
        editor: '✏️',
        viewer: '👀'
    };

    clearElement(display);

    const icon =
        createElement('i', {
            className:
                'fas fa-user-circle'
        });

    const name =
        createElement('span', {
            id: 'userNameDisplay',
            text: user.name || 'مستخدم'
        });

    const role =
        createElement('span', {
            className: 'role-badge',
            text:
                `${emojis[user.role] || '👤'} ${user.role || 'viewer'}`
        });

    const logout =
        createElement('button', {
            className:
                'logout-btn-small',
            text: '🚪 خروج',
            attributes: {
                type: 'button',
                'data-action': 'logout'
            }
        });

    display.appendChild(icon);
    display.appendChild(name);
    display.appendChild(role);
    display.appendChild(logout);
}

// ============================================================
// 🧭 NAVIGATION
// ============================================================

function showPage(pageName) {

    pageManager.loadPage(
        pageName
    );

    document
        .querySelectorAll('.nav-btn')
        .forEach(button => {
            button.classList.remove(
                'active'
            );
        });

    const pageMap = {

        dashboard: 0,
        fleet: 1,
        maintenance: 2,
        efficiency: 3,
        support: 4,
        users: 5,
        notes: 6,
        sessions: 7,
        'ai-assistant': 8
    };

    const index =
        pageMap[pageName];

    const buttons =
        document.querySelectorAll(
            '.nav-btn'
        );

    if (
        index !== undefined &&
        buttons[index]
    ) {

        buttons[index]
            .classList.add('active');
    }
}

function toggleSidebar() {

    const sidebar =
        document.getElementById(
            'sidebar'
        );

    if (sidebar) {
        sidebar.classList.toggle(
            'open'
        );
    }
}

function refreshAllPages() {

    showToast(
        '🔄 جاري تحديث الصفحة...',
        'info'
    );

    pageManager.refreshPage();
}

// ============================================================
// 🔑 LOGIN
// ============================================================

async function doLogin() {

    const username =
        document.getElementById(
            'username'
        )?.value?.trim();

    const password =
        document.getElementById(
            'password'
        )?.value || '';

    if (!username || !password) {

        showToast(
            '⚠️ الرجاء إدخال اسم المستخدم وكلمة المرور',
            'warning'
        );

        return;
    }

    if (
        username.length >
        CONFIG.maxInputLength ||
        password.length >
        CONFIG.maxInputLength
    ) {

        showToast(
            '❌ بيانات الدخول غير صالحة',
            'danger'
        );

        return;
    }

    const loginButton =
        document.querySelector(
            '#loginOverlay .login-btn'
        );

    if (loginButton) {

        loginButton.disabled = true;

        loginButton.dataset.originalText =
            loginButton.textContent;

        loginButton.textContent =
            '⏳ جاري الدخول...';
    }

    try {

        const result =
            await authManager.login(
                username,
                password
            );

        if (!result.success) {

            showToast(
                result.error ||
                '❌ فشل تسجيل الدخول',
                'danger'
            );

            return;
        }

        const overlay =
            document.getElementById(
                'loginOverlay'
            );

        const app =
            document.getElementById(
                'mainApp'
            );

        if (overlay) {
            overlay.style.display =
                'none';
        }

        if (app) {
            app.style.display =
                'block';
        }

        updateUserDisplay();

        pageManager.loadPage(
            'dashboard'
        );

        showToast(
            `✅ مرحباً ${result.user?.name || ''}`,
            'success'
        );

    } finally {

        if (loginButton) {

            loginButton.disabled =
                false;

            loginButton.textContent =
                loginButton.dataset.originalText ||
                '🚀 دخول';
        }
    }
}

// ============================================================
// 🚪 LOGOUT
// ============================================================

async function doLogout() {

    if (
        !window.confirm(
            '⚠️ هل أنت متأكد من تسجيل الخروج؟'
        )
    ) {
        return;
    }

    await authManager.logout();

    location.reload();
}

// ============================================================
// 🧹 APPLICATION CLEANUP
// ============================================================

function cleanupApplication() {

    pageManager.stopVoice();

    authManager.stopTokenMonitor();

    if (
        'speechSynthesis' in window
    ) {
        window.speechSynthesis.cancel();
    }
}

// ============================================================
// 🌐 DOM READY
// ============================================================

document.addEventListener(
    'DOMContentLoaded',
    async () => {

        console.log(
            `🚀 Marine System v${CONFIG.version}`
        );

        const loginOverlay =
            document.getElementById(
                'loginOverlay'
            );

        const mainApp =
            document.getElementById(
                'mainApp'
            );

        /*
         * محاولة التحقق من جلسة موجودة.
         *
         * إذا كان السيرفر يستخدم HttpOnly Cookie
         * فسيتم الاعتماد على Cookie هنا.
         */

        const authenticated =
            await authManager.verify();

        if (authenticated) {

            if (loginOverlay) {
                loginOverlay.style.display =
                    'none';
            }

            if (mainApp) {
                mainApp.style.display =
                    'block';
            }

            updateUserDisplay();

            pageManager.loadPage(
                'dashboard'
            );

        } else {

            if (loginOverlay) {
                loginOverlay.style.display =
                    'flex';
            }

            if (mainApp) {
                mainApp.style.display =
                    'none';
            }
        }

        // ----------------------------------------------------
        // Login Enter
        // ----------------------------------------------------

        const username =
            document.getElementById(
                'username'
            );

        const password =
            document.getElementById(
                'password'
            );

        if (password) {

            password.addEventListener(
                'keydown',
                event => {

                    if (
                        event.key ===
                        'Enter'
                    ) {
                        doLogin();
                    }
                }
            );
        }

        if (username) {

            username.addEventListener(
                'keydown',
                event => {

                    if (
                        event.key ===
                        'Enter'
                    ) {

                        if (password) {
                            password.focus();
                        }
                    }
                }
            );
        }

        // ----------------------------------------------------
        // Speech voices
        // ----------------------------------------------------

        if (
            'speechSynthesis' in window
        ) {

            window.speechSynthesis
                .getVoices();

            window.speechSynthesis
                .addEventListener(
                    'voiceschanged',
                    () => {
                        window.speechSynthesis
                            .getVoices();
                    }
                );
        }

        console.log(
            '✅ Marine System application ready'
        );
    }
);

// ============================================================
// 🧹 BEFORE UNLOAD
// ============================================================

window.addEventListener(
    'beforeunload',
    cleanupApplication
);

// ============================================================
// 🌐 ONLINE / OFFLINE
// ============================================================

window.addEventListener(
    'offline',
    () => {

        showToast(
            '📡 انقطع الاتصال بالإنترنت',
            'warning'
        );
    }
);

window.addEventListener(
    'online',
    () => {

        showToast(
            '📡 عاد الاتصال بالإنترنت',
            'success'
        );
    }
);

// ============================================================
// 🛡️ GLOBAL ERROR HANDLERS
// ============================================================

window.addEventListener(
    'unhandledrejection',
    event => {

        console.error(
            '❌ Unhandled Promise:',
            event.reason
        );

        /*
         * لا نعرض تفاصيل الخطأ للمستخدم
         * لأنها قد تكشف معلومات داخلية.
         */
    }
);

window.addEventListener(
    'error',
    event => {

        console.error(
            '❌ Global error:',
            event.error || event.message
        );
    }
);

// ============================================================
// 🏁 END
// ============================================================

console.log(
    '🛡️ Security layer: ACTIVE'
);

console.log(
    '🔐 Authentication manager: ACTIVE'
);

console.log(
    '📡 API manager: ACTIVE'
);

console.log(
    '🤖 AI assistant: READY'
);

console.log(
    '🏆 Marine System app.js v10.0 loaded'
);
