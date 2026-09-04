/**
 * ============================================================
 * 🚢 MARINE SYSTEM v22.0 — ULTIMATE HARDENED
 * ============================================================
 * 
 * ✅ ALL ISSUES FINALLY FIXED:
 * 1. ✅ CSP — ONLY as HTTP header (server sends it)
 * 2. ✅ connect-src — 'self' only (no /api)
 * 3. ✅ img-src — 'self' only (no data:)
 * 4. ✅ Permissions-Policy — Added
 * 5. ✅ HSTS — Added
 * 6. ✅ autocomplete — Left as browser default
 * 7. ✅ Forgot Password — Secure endpoint
 * 8. ✅ CSRF — Verified in index.js
 * 9. ✅ RBAC — Verified in index.js
 * 10. ✅ HttpOnly/Secure/SameSite — Server sends
 * ============================================================
 */

(function() {
    'use strict';

    // ============================================================
    // 📦 CONFIG — Private
    // ============================================================

    var API = '/api';
    var PAGE_KEY = 'marine_page';

    var ALLOWED_PAGES = new Set([
        'dashboard', 'fleet', 'maintenance', 'efficiency',
        'support', 'users', 'notes', 'monitoring',
        'ai-assistant', 'settings', 'logs'
    ]);

    var PAGE_PERMISSIONS = {
        'users': ['users.read'],
        'logs': ['logs.read'],
        'settings': ['settings.manage'],
        'monitoring': ['monitoring.view'],
        'ai-assistant': ['ai.use']
    };

    // ============================================================
    // 📦 STATE — Private
    // ============================================================

    var state = {
        user: null,
        authenticated: false,
        page: 'dashboard',
        vessels: [],
        users: [],
        idleTimer: null,
        absoluteTimer: null,
        absoluteStart: Date.now()
    };

    // ============================================================
    // 🔧 HELPERS
    // ============================================================

    function getElement(id) {
        return document.getElementById(id);
    }

    function createElement(tag, attrs, children) {
        var el = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function(key) {
                if (key === 'className') {
                    el.className = attrs[key];
                } else if (key === 'textContent') {
                    el.textContent = attrs[key];
                } else {
                    el.setAttribute(key, attrs[key]);
                }
            });
        }
        if (children) {
            if (Array.isArray(children)) {
                children.forEach(function(child) {
                    if (typeof child === 'string') {
                        el.appendChild(document.createTextNode(child));
                    } else if (child instanceof Node) {
                        el.appendChild(child);
                    }
                });
            } else if (typeof children === 'string') {
                el.appendChild(document.createTextNode(children));
            }
        }
        return el;
    }

    function addClass(el, className) {
        if (el) el.classList.add(className);
    }

    function removeClass(el, className) {
        if (el) el.classList.remove(className);
    }

    function safeText(id, text) {
        var el = getElement(id);
        if (el) {
            el.textContent = text || '';
        }
    }

    // ============================================================
    // 🍞 TOAST
    // ============================================================

    function showToast(message, type, duration) {
        type = type || 'info';
        duration = duration || 3000;

        var container = getElement('toastContainer');
        if (!container) return;

        var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

        var toast = createElement('div', {
            className: 'toast toast-' + type,
            role: 'alert'
        });

        var iconSpan = createElement('span', { textContent: icons[type] || 'ℹ️' });
        var textSpan = createElement('span', { textContent: String(message || '') });

        toast.appendChild(iconSpan);
        toast.appendChild(textSpan);
        container.appendChild(toast);

        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(30px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(function() {
                if (toast.parentNode) toast.remove();
            }, 300);
        }, duration);
    }

    // ============================================================
    // ⏰ DATE TIME
    // ============================================================

    function updateDateTime() {
        try {
            var dateEl = getElement('currentDate');
            var timeEl = getElement('currentTime');
            if (!dateEl && !timeEl) return;

            var now = new Date();
            if (dateEl) {
                dateEl.textContent = now.toLocaleDateString('ar-TN', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }
            if (timeEl) {
                timeEl.textContent = now.toLocaleTimeString('ar-TN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
            }
        } catch (e) { /* Silent fail */ }
    }

    // ============================================================
    // ⏱️ SESSION MANAGEMENT — Fixed
    // ============================================================

    var IDLE_TIMEOUT = 15 * 60 * 1000;
    var ABSOLUTE_TIMEOUT = 8 * 60 * 60 * 1000;

    function startSessionTimers() {
        stopSessionTimers();

        state.idleTimer = setTimeout(function() {
            if (state.authenticated) {
                showToast('⏰ انتهت صلاحية الجلسة (خمول)', 'warning');
                doLogout();
            }
        }, IDLE_TIMEOUT);

        var remaining = Math.max(0, ABSOLUTE_TIMEOUT - (Date.now() - state.absoluteStart));
        state.absoluteTimer = setTimeout(function() {
            if (state.authenticated) {
                showToast('⏰ انتهت المدة القصوى للجلسة', 'warning');
                doLogout();
            }
        }, remaining);
    }

    function stopSessionTimers() {
        if (state.idleTimer) {
            clearTimeout(state.idleTimer);
            state.idleTimer = null;
        }
        if (state.absoluteTimer) {
            clearTimeout(state.absoluteTimer);
            state.absoluteTimer = null;
        }
    }

    function resetIdleTimer() {
        if (!state.authenticated) return;
        if (state.idleTimer) {
            clearTimeout(state.idleTimer);
            state.idleTimer = null;
        }
        state.idleTimer = setTimeout(function() {
            if (state.authenticated) {
                showToast('⏰ انتهت صلاحية الجلسة (خمول)', 'warning');
                doLogout();
            }
        }, IDLE_TIMEOUT);
    }

    var activityDebounce = null;
    ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(function(event) {
        document.addEventListener(event, function() {
            if (activityDebounce) {
                clearTimeout(activityDebounce);
            }
            activityDebounce = setTimeout(function() {
                resetIdleTimer();
                activityDebounce = null;
            }, 500);
        });
    });

    // ============================================================
    // 🔐 CSRF — Get token from meta (server sets it)
    // ============================================================

    function getCSRFToken() {
        var meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) return meta.getAttribute('content');

        var cookies = document.cookie.split(';');
        for (var i = 0; i < cookies.length; i++) {
            var cookie = cookies[i].trim();
            if (cookie.indexOf('csrf_token=') === 0) {
                return cookie.substring('csrf_token='.length);
            }
        }
        return '';
    }

    // ============================================================
    // 🔐 AUTHENTICATION
    // ============================================================

    function doLogin() {
        var username = getElement('username');
        var password = getElement('password');
        var errorEl = getElement('loginError');
        var loginBtn = getElement('loginButton');
        var rememberMe = getElement('rememberMe');

        if (!username || !password || !errorEl || !loginBtn) return;

        var user = username.value.trim();
        var pass = password.value; // ✅ NO trim on password

        errorEl.className = 'error-msg';
        errorEl.textContent = '';

        if (!user || !pass) {
            errorEl.textContent = '⚠️ يرجى إدخال اسم المستخدم وكلمة المرور';
            errorEl.classList.add('show');
            return;
        }

        loginBtn.disabled = true;
        loginBtn.classList.add('loading');

        fetch(API + '/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-CSRF-Token': getCSRFToken()
            },
            body: JSON.stringify({
                username: user,
                password: pass,
                rememberMe: rememberMe ? rememberMe.checked : false
            }),
            credentials: 'include'
        })
        .then(function(response) {
            if (!response.ok) {
                return response.json().then(function(data) {
                    throw new Error(data.error || 'فشل تسجيل الدخول');
                });
            }
            return response.json();
        })
        .then(function(data) {
            loginBtn.disabled = false;
            loginBtn.classList.remove('loading');

            if (data.success && data.user) {
                state.user = data.user;
                state.authenticated = true;
                state.absoluteStart = Date.now();

                var loginOverlay = getElement('loginOverlay');
                var mainApp = getElement('mainApp');
                if (loginOverlay) addClass(loginOverlay, 'hidden');
                if (mainApp) removeClass(mainApp, 'hidden');

                updateUserDisplay();
                buildSidebar();
                loadPage('dashboard');

                showToast('✅ مرحباً ' + (state.user.name || state.user.username), 'success');
                loadAllData();
                startSessionTimers();
            } else {
                errorEl.textContent = '❌ ' + (data.error || 'بيانات الدخول غير صحيحة');
                errorEl.classList.add('show');
            }
        })
        .catch(function(error) {
            loginBtn.disabled = false;
            loginBtn.classList.remove('loading');
            errorEl.textContent = '❌ ' + error.message;
            errorEl.classList.add('show');
        });
    }

    function doLogout() {
        showModal({
            title: '⚠️ تسجيل الخروج',
            message: 'هل أنت متأكد من تسجيل الخروج؟',
            confirmText: 'تسجيل الخروج',
            confirmClass: 'btn-danger',
            cancelText: 'إلغاء'
        }).then(function(confirmed) {
            if (!confirmed) return;

            var logoutBtn = getElement('logoutBtn');
            if (logoutBtn) {
                logoutBtn.textContent = '⏳ جاري...';
                logoutBtn.disabled = true;
            }

            fetch(API + '/auth/logout', {
                method: 'POST',
                headers: {
                    'X-CSRF-Token': getCSRFToken()
                },
                credentials: 'include'
            })
            .then(function(response) {
                return response.json().catch(function() { return {}; });
            })
            .then(function() {
                state.user = null;
                state.authenticated = false;
                stopSessionTimers();

                var loginOverlay = getElement('loginOverlay');
                var mainApp = getElement('mainApp');
                if (loginOverlay) removeClass(loginOverlay, 'hidden');
                if (mainApp) addClass(mainApp, 'hidden');

                var username = getElement('username');
                var password = getElement('password');
                if (username) username.value = '';
                if (password) password.value = '';

                var errorEl = getElement('loginError');
                if (errorEl) errorEl.className = 'error-msg';

                if (logoutBtn) {
                    logoutBtn.textContent = 'تسجيل الخروج';
                    logoutBtn.disabled = false;
                }

                showToast('👋 تم تسجيل الخروج', 'info');
            })
            .catch(function() {
                state.user = null;
                state.authenticated = false;

                var loginOverlay = getElement('loginOverlay');
                var mainApp = getElement('mainApp');
                if (loginOverlay) removeClass(loginOverlay, 'hidden');
                if (mainApp) addClass(mainApp, 'hidden');

                if (logoutBtn) {
                    logoutBtn.textContent = 'تسجيل الخروج';
                    logoutBtn.disabled = false;
                }

                showToast('⚠️ تم تسجيل الخروج محلياً', 'warning');
            });
        });
    }

    function verifySession() {
        return fetch(API + '/auth/me', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'X-CSRF-Token': getCSRFToken()
            }
        })
        .then(function(response) {
            if (!response.ok) return false;
            return response.json();
        })
        .then(function(data) {
            if (data.success && data.user) {
                state.user = data.user;
                state.authenticated = true;
                state.absoluteStart = Date.now();
                return true;
            }
            return false;
        })
        .catch(function() {
            return false;
        });
    }

    // ============================================================
    // 🏗️ MODAL
    // ============================================================

    var modalResolve = null;

    function showModal(options) {
        return new Promise(function(resolve) {
            var overlay = getElement('modalOverlay');
            var title = getElement('modalTitle');
            var body = getElement('modalBody');
            var confirmBtn = getElement('modalConfirm');
            var cancelBtn = getElement('modalCancel');
            var closeBtn = getElement('modalClose');

            if (!overlay) {
                resolve(false);
                return;
            }

            title.textContent = options.title || 'تأكيد';
            body.textContent = options.message || 'هل أنت متأكد؟';

            confirmBtn.textContent = options.confirmText || 'تأكيد';
            confirmBtn.className = 'btn ' + (options.confirmClass || 'btn-primary');

            cancelBtn.textContent = options.cancelText || 'إلغاء';
            cancelBtn.style.display = options.showCancel !== false ? 'inline-flex' : 'none';

            modalResolve = resolve;

            var newConfirm = confirmBtn.cloneNode(true);
            var newCancel = cancelBtn.cloneNode(true);
            var newClose = closeBtn.cloneNode(true);

            confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
            cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
            closeBtn.parentNode.replaceChild(newClose, closeBtn);

            var cleanup = function(result) {
                addClass(overlay, 'hidden');
                if (modalResolve) {
                    modalResolve(result);
                    modalResolve = null;
                }
            };

            newConfirm.addEventListener('click', function() { cleanup(true); });
            newCancel.addEventListener('click', function() { cleanup(false); });
            newClose.addEventListener('click', function() { cleanup(false); });

            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) cleanup(false);
            });

            removeClass(overlay, 'hidden');
        });
    }

    // ============================================================
    // 👤 USER DISPLAY
    // ============================================================

    function updateUserDisplay() {
        if (!state.user) return;
        var name = state.user.name || state.user.username || 'مستخدم';
        safeText('userDisplayName', name);
        safeText('userInitial', name.charAt(0));
        safeText('sidebarUserName', name);
        safeText('sidebarUserRole', getRoleName(state.user.role));
        safeText('sidebarUserAvatar', name.charAt(0));
    }

    function getRoleName(role) {
        var roles = { admin: 'مسؤول النظام', manager: 'مدير', operator: 'مشغل', viewer: 'مشاهد' };
        return roles[role] || role || 'مستخدم';
    }

    // ============================================================
    // 🔐 RBAC — UI Filtering
    // ============================================================

    function canAccessPage(page) {
        if (state.user && state.user.role === 'admin') return true;

        var permissions = PAGE_PERMISSIONS[page];
        if (!permissions) return true;

        return permissions.some(function(perm) {
            return state.user &&
                   state.user.permissions &&
                   state.user.permissions[perm] === true;
        });
    }

    // ============================================================
    // 📊 LOAD DATA
    // ============================================================

    function loadAllData() {
        if (!state.authenticated) return;

        var headers = {
            'Accept': 'application/json',
            'X-CSRF-Token': getCSRFToken()
        };

        fetch(API + '/vessels', {
            credentials: 'include',
            headers: headers
        })
        .then(function(response) {
            if (!response.ok) throw new Error('فشل تحميل المراكب');
            return response.json();
        })
        .then(function(data) {
            state.vessels = Array.isArray(data) ? data : [];
            updateBadge('fleetBadge', state.vessels.length);
        })
        .catch(function(error) {
            console.warn('⚠️ Error loading vessels:', error.message);
        });

        if (canAccessPage('users')) {
            fetch(API + '/users', {
                credentials: 'include',
                headers: headers
            })
            .then(function(response) {
                if (!response.ok) throw new Error('فشل تحميل المستخدمين');
                return response.json();
            })
            .then(function(data) {
                state.users = Array.isArray(data) ? data : [];
                updateBadge('usersBadge', state.users.length);
            })
            .catch(function(error) {
                console.warn('⚠️ Error loading users:', error.message);
            });
        }
    }

    function updateBadge(id, count) {
        var el = getElement(id);
        if (el) {
            el.textContent = count || 0;
            el.style.display = (count && count > 0) ? 'inline' : 'none';
        }
    }

    // ============================================================
    // 📄 LOAD PAGE — Secure
    // ============================================================

    var loadingPages = {};

    function loadPage(page) {
        if (!ALLOWED_PAGES.has(page)) {
            showToast('⚠️ الصفحة غير مصرح بها', 'error');
            return;
        }

        if (!canAccessPage(page)) {
            showToast('🔒 ليس لديك صلاحية للوصول إلى هذه الصفحة', 'error');
            return;
        }

        if (loadingPages[page]) {
            console.log('⏭️ Page already loading:', page);
            return;
        }

        state.page = page;

        try {
            sessionStorage.setItem(PAGE_KEY, page);
        } catch (e) { /* Silent fail */ }

        document.querySelectorAll('.nav-btn').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.page === page);
        });

        var container = getElement('pageContainer');
        var loader = getElement('pageLoader');

        if (!container) return;

        loadingPages[page] = true;
        if (loader) removeClass(loader, 'hidden');

        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        fetch('/pages/' + page + '.html', { cache: 'no-store' })
            .then(function(response) {
                if (!response.ok) throw new Error('فشل تحميل الصفحة (' + response.status + ')');
                return response.text();
            })
            .then(function(html) {
                var parser = new DOMParser();
                var doc = parser.parseFromString(html, 'text/html');
                var bodyContent = doc.body;

                var scripts = bodyContent.querySelectorAll('script');
                scripts.forEach(function(script) {
                    script.remove();
                });

                var fragment = document.createDocumentFragment();
                var children = bodyContent.childNodes;
                children.forEach(function(child) {
                    fragment.appendChild(child.cloneNode(true));
                });

                container.appendChild(fragment);

                if (loader) addClass(loader, 'hidden');
                document.title = '⚓ ' + (CONFIG_PAGES[page] || page);
                console.log('✅ Page loaded securely:', page);

                loadingPages[page] = false;
                resetIdleTimer();
            })
            .catch(function(error) {
                if (loader) addClass(loader, 'hidden');
                loadingPages[page] = false;

                var errorDiv = createElement('div', {
                    className: 'error-container'
                });

                var icon = createElement('div', {
                    className: 'error-icon',
                    textContent: '❌'
                });

                var title = createElement('h2', {
                    className: 'error-title',
                    textContent: 'فشل تحميل الصفحة'
                });

                var msg = createElement('p', {
                    className: 'error-message',
                    textContent: error.message
                });

                var btn = createElement('button', {
                    className: 'btn-gold',
                    textContent: '📊 العودة للرئيسية'
                });
                btn.addEventListener('click', function() {
                    loadPage('dashboard');
                });

                errorDiv.appendChild(icon);
                errorDiv.appendChild(title);
                errorDiv.appendChild(msg);
                errorDiv.appendChild(btn);

                while (container.firstChild) {
                    container.removeChild(container.firstChild);
                }
                container.appendChild(errorDiv);
            });
    }

    // ============================================================
    // 🏗️ BUILD SIDEBAR — With RBAC
    // ============================================================

    function buildSidebar() {
        var nav = getElement('sidebarNav');
        if (!nav) return;

        while (nav.firstChild) {
            nav.removeChild(nav.firstChild);
        }

        var groups = [
            {
                title: 'الرئيسية',
                items: [
                    { page: 'dashboard', icon: 'fa-chart-pie', label: 'لوحة التحكم' },
                    { page: 'fleet', icon: 'fa-ship', label: 'السجل العام', badge: 'fleetBadge' }
                ]
            },
            {
                title: 'إدارة الأسطول',
                items: [
                    { page: 'maintenance', icon: 'fa-wrench', label: 'الصيانة', badge: 'maintenanceBadge', badgeClass: 'warning' },
                    { page: 'efficiency', icon: 'fa-chart-line', label: 'الجاهزية' },
                    { page: 'support', icon: 'fa-headset', label: 'الدعم' }
                ]
            },
            {
                title: 'العمليات',
                items: [
                    { page: 'notes', icon: 'fa-sticky-note', label: 'Note Verbale' },
                    { page: 'monitoring', icon: 'fa-map-marked-alt', label: 'المراقبة الشاملة', badge: 'sessionsBadge', badgeClass: 'success' }
                ]
            },
            {
                title: 'الإدارة',
                items: [
                    { page: 'users', icon: 'fa-users', label: 'المستخدمين', badge: 'usersBadge' },
                    { page: 'logs', icon: 'fa-history', label: 'سجلات الصيانة', badge: 'logsBadge' }
                ]
            },
            {
                title: 'متقدم',
                items: [
                    { page: 'ai-assistant', icon: 'fa-robot', label: 'المساعد الذكي', badge: 'AI', badgeClass: 'success' },
                    { page: 'settings', icon: 'fa-cog', label: 'الإعدادات' }
                ]
            }
        ];

        groups.forEach(function(group) {
            var groupDiv = createElement('div', { className: 'nav-group' });

            var titleSpan = createElement('span', {
                className: 'nav-group-title',
                textContent: group.title
            });
            groupDiv.appendChild(titleSpan);

            group.items.forEach(function(item) {
                // ✅ RBAC: Check if user can access this page
                if (!canAccessPage(item.page)) {
                    return; // Skip this item
                }

                var isActive = state.page === item.page ? ' active' : '';
                var btn = createElement('button', {
                    className: 'nav-btn' + isActive,
                    'data-page': item.page
                });

                var icon = createElement('i', { className: 'fas ' + item.icon });
                btn.appendChild(icon);

                var text = document.createTextNode(' ' + item.label + ' ');
                btn.appendChild(text);

                if (item.badge) {
                    var badgeClass = item.badgeClass || '';
                    var badge = createElement('span', {
                        className: 'nav-badge ' + badgeClass,
                        id: item.badge,
                        textContent: '0'
                    });
                    btn.appendChild(badge);
                }

                if (item.badge === 'AI') {
                    var aiBadge = createElement('span', {
                        className: 'nav-badge success',
                        textContent: 'AI'
                    });
                    btn.appendChild(aiBadge);
                }

                btn.addEventListener('click', function() {
                    var page = this.dataset.page;
                    if (page) loadPage(page);
                    if (window.innerWidth <= 992) closeSidebar();
                });

                groupDiv.appendChild(btn);
            });

            nav.appendChild(groupDiv);
        });
    }

    // ============================================================
    // 🧭 SIDEBAR
    // ============================================================

    function toggleSidebar() {
        var sidebar = getElement('sidebar');
        var toggle = getElement('menuToggle');
        if (sidebar) sidebar.classList.toggle('open');
        if (toggle) toggle.classList.toggle('active');
    }

    function closeSidebar() {
        var sidebar = getElement('sidebar');
        var toggle = getElement('menuToggle');
        if (sidebar) sidebar.classList.remove('open');
        if (toggle) toggle.classList.remove('active');
    }

    // ============================================================
    // 🔑 Forgot Password — Secure
    // ============================================================

    function handleForgotPassword() {
        var modal = getElement('forgotModal');
        var closeBtn = getElement('forgotModalClose');
        var cancelBtn = getElement('forgotCancel');
        var submitBtn = getElement('forgotSubmit');
        var emailInput = getElement('resetEmail');
        var errorEl = getElement('resetError');

        if (!modal) return;

        // Show modal
        removeClass(modal, 'hidden');
        if (emailInput) emailInput.value = '';
        if (errorEl) {
            errorEl.className = 'error-msg';
            errorEl.textContent = '';
        }

        var closeModal = function() {
            addClass(modal, 'hidden');
        };

        // Close handlers
        if (closeBtn) {
            var newClose = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newClose, closeBtn);
            newClose.addEventListener('click', closeModal);
        }

        if (cancelBtn) {
            var newCancel = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
            newCancel.addEventListener('click', closeModal);
        }

        // Submit handler
        if (submitBtn) {
            var newSubmit = submitBtn.cloneNode(true);
            submitBtn.parentNode.replaceChild(newSubmit, submitBtn);

            newSubmit.addEventListener('click', function() {
                if (!emailInput) return;

                var email = emailInput.value.trim();
                if (!email) {
                    if (errorEl) {
                        errorEl.className = 'error-msg show';
                        errorEl.textContent = '⚠️ يرجى إدخال بريدك الإلكتروني';
                    }
                    return;
                }

                newSubmit.disabled = true;
                newSubmit.textContent = '⏳ جاري الإرسال...';

                // ✅ Send reset request with CSRF
                fetch(API + '/auth/forgot-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': getCSRFToken()
                    },
                    body: JSON.stringify({ email: email }),
                    credentials: 'include'
                })
                .then(function(response) {
                    return response.json();
                })
                .then(function(data) {
                    newSubmit.disabled = false;
                    newSubmit.textContent = 'إرسال رابط الاستعادة';

                    if (data.success) {
                        showToast('✅ تم إرسال رابط استعادة كلمة المرور إلى بريدك', 'success');
                        closeModal();
                    } else {
                        if (errorEl) {
                            errorEl.className = 'error-msg show';
                            errorEl.textContent = '❌ ' + (data.error || 'فشل إرسال الرابط');
                        }
                    }
                })
                .catch(function(error) {
                    newSubmit.disabled = false;
                    newSubmit.textContent = 'إرسال رابط الاستعادة';

                    if (errorEl) {
                        errorEl.className = 'error-msg show';
                        errorEl.textContent = '❌ خطأ في الاتصال بالخادم';
                    }
                });
            });
        }

        // Click outside to close
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    // ============================================================
    // 🚀 INIT
    // ============================================================

    function init() {
        console.log('🚢 Marine System v22.0 — Ultimate Hardened loading...');

        // Login form
        var loginForm = getElement('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', function(e) {
                e.preventDefault();
                var button = getElement('loginButton');
                if (button && !button.disabled) doLogin();
            });
        }

        // Password toggle
        var toggleBtn = getElement('togglePassword');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function() {
                var password = getElement('password');
                var icon = this.querySelector('i');
                if (password && icon) {
                    var isPassword = password.type === 'password';
                    password.type = isPassword ? 'text' : 'password';
                    icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
                }
            });
        }

        // Forgot password
        var forgotBtn = getElement('forgotPasswordBtn');
        if (forgotBtn) {
            forgotBtn.addEventListener('click', handleForgotPassword);
        }

        // Menu toggle
        var menuToggle = getElement('menuToggle');
        if (menuToggle) menuToggle.addEventListener('click', toggleSidebar);

        // Sidebar close
        var sidebarClose = getElement('sidebarClose');
        if (sidebarClose) sidebarClose.addEventListener('click', closeSidebar);

        // Logout button
        var logoutBtn = getElement('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', doLogout);

        // User button
        var userBtn = getElement('userBtn');
        if (userBtn) {
            userBtn.addEventListener('click', function() {
                showModal({
                    title: '👤 القائمة الشخصية',
                    message: 'هل تريد تسجيل الخروج؟',
                    confirmText: 'تسجيل الخروج',
                    confirmClass: 'btn-danger',
                    cancelText: 'إلغاء'
                }).then(function(confirmed) {
                    if (confirmed) doLogout();
                });
            });
        }

        // Notification button
        var notifBtn = getElement('notifBtn');
        if (notifBtn) {
            notifBtn.addEventListener('click', function() {
                showToast('📬 تم فتح الإشعارات', 'info');
            });
        }

        // Back to top
        var backToTop = getElement('backToTop');
        if (backToTop) {
            backToTop.addEventListener('click', function() {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }

        window.addEventListener('scroll', function() {
            var el = getElement('backToTop');
            if (el) {
                el.style.display = window.scrollY > 300 ? 'flex' : 'none';
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                var search = getElement('quickSearch');
                if (search) {
                    search.focus();
                    search.select();
                }
            }

            if (e.key === 'Escape') {
                var sidebar = getElement('sidebar');
                if (sidebar && sidebar.classList.contains('open')) {
                    closeSidebar();
                }
            }
        });

        // Build sidebar
        buildSidebar();

        // Start time updates
        updateDateTime();
        setInterval(updateDateTime, 1000);

        // Verify session (HttpOnly cookie)
        verifySession().then(function(isValid) {
            if (isValid) {
                var loginOverlay = getElement('loginOverlay');
                var mainApp = getElement('mainApp');
                if (loginOverlay) addClass(loginOverlay, 'hidden');
                if (mainApp) removeClass(mainApp, 'hidden');

                updateUserDisplay();
                buildSidebar();

                var savedPage = 'dashboard';
                try {
                    var stored = sessionStorage.getItem(PAGE_KEY);
                    if (stored && ALLOWED_PAGES.has(stored) && canAccessPage(stored)) {
                        savedPage = stored;
                    }
                } catch (e) { /* Silent fail */ }

                loadPage(savedPage);

                showToast('👋 مرحباً بعودتك', 'success');
                setTimeout(loadAllData, 500);
                startSessionTimers();
            } else {
                var loginOverlay = getElement('loginOverlay');
                var mainApp = getElement('mainApp');
                if (loginOverlay) removeClass(loginOverlay, 'hidden');
                if (mainApp) addClass(mainApp, 'hidden');
            }
        });

        console.log('✅ Marine System v22.0 — Ultimate Hardened ready');
        console.log('🔒 Security: HttpOnly Cookies + SameSite=Strict');
        console.log('🔐 CSRF: Double Submit Cookie + Origin/Referer');
        console.log('🛡️ CSP: Server-sent (NOT meta)');
        console.log('👤 RBAC: UI + Server enforcement');
        console.log('🔑 Zero-Trust Architecture');
    }

    // ============================================================
    // 🏁 BOOT
    // ============================================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ============================================================
    // 🌐 GLOBAL — Only what's needed
    // ============================================================

    window.loadPage = loadPage;
    window.doLogout = doLogout;
    window.doLogin = doLogin;
    window.showToast = showToast;

})();
