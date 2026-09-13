    /**
     * ============================================================
     * 🚢 MARINE SYSTEM SETTINGS v10.0
     * ============================================================
     */

    (function() {
        'use strict';

        // ============================================================
        // 🛡️ CLEANUP STATE
        // ============================================================
        var _isDestroyed = false;
        var _pageIntervals = [];
        var _pageTimeouts = [];
        var _eventListeners = [];

        function _settingsCleanup() {
            if (_isDestroyed) return;
            _isDestroyed = true;

            _pageIntervals.forEach(function(id) {
                try { clearInterval(id); } catch (e) {}
            });
            _pageIntervals = [];

            _pageTimeouts.forEach(function(id) {
                try { clearTimeout(id); } catch (e) {}
            });
            _pageTimeouts = [];

            _eventListeners.forEach(function(item) {
                try {
                    if (item.el && item.fn) {
                        item.el.removeEventListener(item.type, item.fn);
                    }
                } catch (e) {}
            });
            _eventListeners = [];

            try {
                delete window.loadSettings;
                delete window.getToken;
                delete window.showToast;
                delete window._deleteLogo;
            } catch (e) {}

            console.log('🧹 Settings v10.0 cleanup done');
        }

        window._pageCleanup = window._pageCleanup || [];
        window._pageCleanup.push(_settingsCleanup);

        window.addEventListener('beforeunload', _settingsCleanup);
        window.addEventListener('pagehide', _settingsCleanup);

        // ============================================================
        // 🔐 RBAC
        // ============================================================
        var LEGACY_ROLE_MAP = {
            'super_admin': 'admin',
            'مسؤول': 'admin',
            'مدير': 'manager',
            'محرر': 'editor',
            'مشغل': 'maintenance_unit',
            'operator': 'maintenance_unit',
            'user': 'viewer',
            'مشاهد': 'viewer'
        };

        var ALLOWED_ROLES = ['admin', 'manager', 'editor', 'maintenance_unit', 'viewer'];

        function normalizeRole(role) {
            if (!role) return 'viewer';
            var r = String(role).trim();
            if (ALLOWED_ROLES.indexOf(r) !== -1) return r;
            return LEGACY_ROLE_MAP[r] || 'viewer';
        }

        function isAdmin() {
            var u = window.currentUser;
            if (!u) return false;
            return normalizeRole(u.role) === 'admin';
        }

        // ============================================================
        // 🔧 HELPERS
        // ============================================================
        function $(id) { return document.getElementById(id); }

        function getToken() {
            return localStorage.getItem('marine_token') ||
                   localStorage.getItem('token') ||
                   localStorage.getItem('authToken') ||
                   null;
        }

        function fetcher(url, options) {
            if (typeof window.apiFetch === 'function') {
                return window.apiFetch(url, options || {});
            }
            var token = getToken();
            var headers = Object.assign({
                'Accept': 'application/json'
            }, (options && options.headers) || {});
            if (token) headers['Authorization'] = 'Bearer ' + token;
            return fetch(url, Object.assign({}, options || {}, {
                headers: headers,
                credentials: 'include'
            }));
        }

        function addSafeListener(el, type, fn) {
            if (!el) return;
            el.addEventListener(type, fn);
            _eventListeners.push({ el: el, type: type, fn: fn });
        }

        // ============================================================
        // 🍞 TOAST
        // ============================================================
        function showToast(message, type, duration) {
            if (_isDestroyed) return;
            type = type || 'info';
            duration = duration || 3500;

            var existing = document.querySelector('.settings-toast');
            if (existing) existing.remove();

            var toast = document.createElement('div');
            toast.className = 'settings-toast ' + type;

            var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

            var icon = document.createElement('span');
            icon.textContent = icons[type] || icons.info;

            var text = document.createElement('span');
            text.textContent = String(message || '');

            toast.appendChild(icon);
            toast.appendChild(text);
            document.body.appendChild(toast);

            var id = setTimeout(function() {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(10px)';
                toast.style.transition = 'all .25s ease';
                var id2 = setTimeout(function() {
                    if (toast.parentNode) toast.remove();
                }, 250);
                _pageTimeouts.push(id2);
            }, duration);
            _pageTimeouts.push(id);
        }

        // ============================================================
        // 🎛️ APPLY CARD VISIBILITY
        // ============================================================
        function applyCardVisibility() {
            if (_isDestroyed) return;

            if (!isAdmin()) {
                document.querySelectorAll('.settings-card').forEach(function(card) {
                    card.classList.add('hidden');
                });

                var aboutCard = $('aboutCard');
                if (aboutCard) aboutCard.classList.remove('hidden');

                var saveAllBtn = $('saveAllBtn');
                var resetBtn = $('resetDefaultsBtn');
                if (saveAllBtn) {
                    saveAllBtn.disabled = true;
                    saveAllBtn.title = 'متاح للمسؤول فقط';
                }
                if (resetBtn) {
                    resetBtn.disabled = true;
                    resetBtn.title = 'متاح للمسؤول فقط';
                }

                console.log('🔐 Non-admin: cards hidden');
                return;
            }

            console.log('👑 Admin: all cards visible');
        }

        // ============================================================
        // 🎨 APPLY THEME GLOBALLY (يفعّل الألوان في كل الصفحات)
        // ============================================================
        function applyThemeGlobally(theme) {
            if (!theme) return;

            try {
                localStorage.setItem('marine_theme', JSON.stringify({
                    primary: theme.primary,
                    secondary: theme.secondary,
                    gold: theme.gold
                }));
            } catch (e) {}

            if (theme.primary) {
                document.documentElement.style.setProperty('--primary-dark', theme.primary);
            }
            if (theme.secondary) {
                document.documentElement.style.setProperty('--secondary', theme.secondary);
            }
            if (theme.gold) {
                document.documentElement.style.setProperty('--gold', theme.gold);
                document.documentElement.style.setProperty('--gold-light', theme.gold);
            }
        }

        // ============================================================
        // 🖼️ LOGO FUNCTIONS
        // ============================================================
        function setLogoPreview(dataUrl, fileName) {
            var placeholder = $('logoPlaceholder');
            var preview = $('logoPreview');
            var img = $('logoPreviewImg');
            var nameEl = $('logoName');
            var appImg = $('appLogoImg');
            var appFallback = $('appLogoFallback');

            if (dataUrl) {
                if (placeholder) placeholder.style.display = 'none';
                if (preview) preview.style.display = 'flex';
                if (img) img.src = dataUrl;
                if (nameEl && fileName) nameEl.textContent = fileName;

                if (appImg) { appImg.src = dataUrl; appImg.style.display = 'block'; }
                if (appFallback) appFallback.style.display = 'none';

                try { localStorage.setItem('marine_logo', dataUrl); } catch (e) {}
            } else {
                if (placeholder) placeholder.style.display = 'flex';
                if (preview) preview.style.display = 'none';
                if (img) img.src = '';

                if (appImg) { appImg.src = ''; appImg.style.display = 'none'; }
                if (appFallback) appFallback.style.display = 'inline';

                try { localStorage.removeItem('marine_logo'); } catch (e) {}
            }
        }

        async function loadLogo() {
            try {
                var response = await fetcher('/api/logo', { method: 'GET' });
                if (!response.ok) return;

                var data = await response.json();
                if (data.success && data.logo && data.logo.dataUrl) {
                    setLogoPreview(data.logo.dataUrl, '');
                } else {
                    try {
                        var cached = localStorage.getItem('marine_logo');
                        if (cached) setLogoPreview(cached, '');
                    } catch (e) {}
                }
            } catch (e) {
                console.warn('⚠️ Load logo error:', e.message);
                try {
                    var cached2 = localStorage.getItem('marine_logo');
                    if (cached2) setLogoPreview(cached2, '');
                } catch (e2) {}
            }
        }

        async function uploadLogo(file) {
            if (!file) return;

            if (file.size > 2 * 1024 * 1024) {
                showToast('❌ الصورة أكبر من 2 MB', 'error');
                return;
            }

            var allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
            if (allowed.indexOf(file.type) === -1) {
                showToast('❌ نوع الصورة غير مدعوم. استخدم PNG, JPG, SVG, أو WebP.', 'error');
                return;
            }

            showToast('⏳ جاري رفع الشعار...', 'info');

            try {
                var formData = new FormData();
                formData.append('logo', file);

                var token = getToken();
                var headers = {};
                if (token) headers['Authorization'] = 'Bearer ' + token;

                var csrfMatch = document.cookie.match(/marine_csrf=([^;]+)/);
                if (csrfMatch) headers['X-CSRF-Token'] = csrfMatch[1];

                var response = await fetch('/api/logo/upload', {
                    method: 'POST',
                    headers: headers,
                    credentials: 'include',
                    body: formData
                });

                var data = await response.json().catch(function() { return {}; });

                if (!response.ok || !data.success) {
                    throw new Error(data.error || ('خطأ ' + response.status));
                }

                setLogoPreview(data.logo.dataUrl, file.name);
                showToast('✅ تم رفع الشعار بنجاح', 'success');

            } catch (error) {
                console.error('❌ Upload logo error:', error);
                showToast('❌ ' + error.message, 'error');
            }
        }

        async function deleteLogo(event) {
            if (event) { event.preventDefault(); event.stopPropagation(); }

            if (!confirm('هل تريد حذف الشعار الحالي؟')) return;

            try {
                var response = await fetcher('/api/logo', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!response.ok) {
                    var err = await response.json().catch(function() { return {}; });
                    throw new Error(err.error || 'فشل الحذف');
                }

                setLogoPreview(null, null);
                showToast('✅ تم حذف الشعار', 'success');

            } catch (error) {
                console.error('❌ Delete logo error:', error);
                showToast('❌ ' + error.message, 'error');
            }
        }

        window._deleteLogo = deleteLogo;

        // ============================================================
        // 📊 LOAD SETTINGS
        // ============================================================
        async function loadSettings() {
            if (_isDestroyed) return;

            var token = getToken();
            if (!token) {
                console.warn('⚠️ No token');
                showToast('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
                return;
            }

            if (!isAdmin()) {
                console.log('ℹ️ Non-admin: skip settings load');
                return;
            }

            console.log('📡 Loading settings...');

            try {
                var response = await fetcher('/api/settings', { method: 'GET' });

                if (!response.ok) {
                    if (response.status === 403) {
                        throw new Error('ليس لديك صلاحية الوصول للإعدادات');
                    }
                    throw new Error('فشل تحميل الإعدادات: ' + response.status);
                }

                var data = await response.json();

                if (data && data.settings) {
                    applySettings(data.settings);
                }

            } catch (error) {
                console.error('❌ Load settings error:', error);
                if (_isDestroyed) return;
                showToast('❌ ' + error.message, 'error');
            }
        }

        // ============================================================
        // 🎨 APPLY SETTINGS TO UI
        // ============================================================
        function applySettings(settings) {
            if (_isDestroyed) return;
            if (!settings) return;

            if (settings.theme) {
                var t = settings.theme;
                if (t.primary) document.documentElement.style.setProperty('--primary-dark', t.primary);
                if (t.secondary) document.documentElement.style.setProperty('--secondary', t.secondary);
                if (t.gold) {
                    document.documentElement.style.setProperty('--gold', t.gold);
                    document.documentElement.style.setProperty('--gold-light', t.gold);
                }
                applyThemeGlobally(t);
            }

            if (settings.layout) {
                var el;
                el = $('darkMode'); if (el) el.checked = settings.layout.darkMode !== false;
                el = $('fontSize'); if (el) el.value = settings.layout.fontSize || 'medium';
                el = $('sidebarPosition'); if (el) el.value = settings.layout.sidebarPosition || 'right';
                el = $('showStats'); if (el) el.checked = settings.layout.showStats !== false;
            }

            if (settings.security) {
                var el2;
                el2 = $('emailNotifications'); if (el2) el2.checked = settings.security.emailNotifications !== false;
                el2 = $('smsNotifications'); if (el2) el2.checked = settings.security.smsNotifications === true;
                el2 = $('sessionTimeout');
                if (el2) {
                    var t2 = settings.security.sessionTimeout || 60;
                    el2.value = Math.min(Math.max(t2, 5), 480);
                }
            }

            if (settings.notifications) {
                var el3;
                el3 = $('emergencyAlerts'); if (el3) el3.checked = settings.notifications.emergencyAlerts !== false;
                el3 = $('maintenanceAlerts'); if (el3) el3.checked = settings.notifications.maintenanceAlerts !== false;
                el3 = $('performanceReports'); if (el3) el3.value = settings.notifications.performanceReports || 'weekly';
            }

            if (settings.branding) {
                var el4 = $('logoSize');
                if (el4) el4.value = settings.branding.logoSize || 'medium';
            }
        }

        // ============================================================
        // 💾 COLLECT SETTINGS
        // ============================================================
        function collectSettings() {
            var settings = {};

            var activeTheme = document.querySelector('#colorPicker .color-option.active');
            var activeGold = document.querySelector('#goldColorPicker .color-option.active');

            settings.theme = {
                primary: activeTheme ? activeTheme.dataset.primary : '#0a1628',
                secondary: activeTheme ? activeTheme.dataset.secondary : '#1a2a4a',
                gold: activeGold ? activeGold.dataset.gold : '#e6b31e'
            };

            settings.layout = {
                darkMode: $('darkMode') ? $('darkMode').checked : true,
                fontSize: $('fontSize') ? $('fontSize').value : 'medium',
                sidebarPosition: $('sidebarPosition') ? $('sidebarPosition').value : 'right',
                showStats: $('showStats') ? $('showStats').checked : true
            };

            settings.security = {
                emailNotifications: $('emailNotifications') ? $('emailNotifications').checked : true,
                smsNotifications: $('smsNotifications') ? $('smsNotifications').checked : false,
                sessionTimeout: $('sessionTimeout') ? Math.min(Math.max(parseInt($('sessionTimeout').value) || 60, 5), 480) : 60
            };

            settings.notifications = {
                emergencyAlerts: $('emergencyAlerts') ? $('emergencyAlerts').checked : true,
                maintenanceAlerts: $('maintenanceAlerts') ? $('maintenanceAlerts').checked : true,
                performanceReports: $('performanceReports') ? $('performanceReports').value : 'weekly'
            };

            settings.branding = {
                logoSize: $('logoSize') ? $('logoSize').value : 'medium'
            };

            return settings;
        }

        // ============================================================
        // 💾 SAVE SETTINGS
        // ============================================================
        async function saveSettings() {
            if (_isDestroyed) return;

            if (!isAdmin()) {
                showToast('⚠️ ليس لديك صلاحية الحفظ', 'error');
                return;
            }

            var settings = collectSettings();

            try {
                var response = await fetcher('/api/settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(settings)
                });

                if (!response.ok) {
                    var errData = null;
                    try { errData = await response.json(); } catch (_) {}
                    throw new Error(
                        (errData && (errData.error || errData.message)) ||
                        'فشل الحفظ'
                    );
                }

                showToast('✅ تم حفظ الإعدادات', 'success');

                applySettings(settings);
                applyThemeGlobally(settings.theme);

            } catch (error) {
                console.error('❌ Save error:', error);
                showToast('❌ ' + error.message, 'error');
            }
        }

        // ============================================================
        // 🖼️ PREVIEW THEME
        // ============================================================
        function updatePreview() {
            var activeTheme = document.querySelector('#colorPicker .color-option.active');
            var activeGold = document.querySelector('#goldColorPicker .color-option.active');

            var pv = $('previewPrimary');
            var sv = $('previewSecondary');
            var gv = $('previewGold');
            var cv = $('previewColors');

            if (activeTheme && pv) pv.style.background = activeTheme.dataset.primary;
            if (activeTheme && sv) sv.style.background = activeTheme.dataset.secondary;
            if (activeGold && gv) gv.style.background = activeGold.dataset.gold;
            if (activeTheme && activeGold && cv) {
                cv.textContent = (activeTheme.dataset.primary || '') + ' • ' +
                                 (activeTheme.dataset.secondary || '') + ' • ' +
                                 (activeGold.dataset.gold || '');
            }
        }

        // ============================================================
        // 🚀 INIT
        // ============================================================
        function init() {
            if (_isDestroyed) return;

            console.log('🚀 Settings v10.0 initializing...');
            console.log('👤 Role:', window.currentUser ? normalizeRole(window.currentUser.role) : 'unknown');
            console.log('👑 isAdmin:', isAdmin());

            applyCardVisibility();

            if (isAdmin()) {
                loadSettings();
            }

            // ✅ Color pickers
            document.querySelectorAll('#colorPicker .color-option').forEach(function(btn) {
                addSafeListener(btn, 'click', function() {
                    document.querySelectorAll('#colorPicker .color-option').forEach(function(b) {
                        b.classList.remove('active');
                        b.setAttribute('aria-pressed', 'false');
                    });
                    this.classList.add('active');
                    this.setAttribute('aria-pressed', 'true');
                    updatePreview();
                });
            });

            document.querySelectorAll('#goldColorPicker .color-option').forEach(function(btn) {
                addSafeListener(btn, 'click', function() {
                    document.querySelectorAll('#goldColorPicker .color-option').forEach(function(b) {
                        b.classList.remove('active');
                        b.setAttribute('aria-pressed', 'false');
                    });
                    this.classList.add('active');
                    this.setAttribute('aria-pressed', 'true');
                    updatePreview();
                });
            });

            updatePreview();

            // ✅ Save buttons
            addSafeListener($('saveAllBtn'), 'click', function() {
                if (!isAdmin()) { showToast('⚠️ متاح للمسؤول فقط', 'error'); return; }
                saveSettings();
            });

            addSafeListener($('saveThemeBtn'), 'click', function() {
                if (!isAdmin()) { showToast('⚠️ متاح للمسؤول فقط', 'error'); return; }
                saveSettings();
            });

            addSafeListener($('saveLayoutBtn'), 'click', function() {
                if (!isAdmin()) { showToast('⚠️ متاح للمسؤول فقط', 'error'); return; }
                saveSettings();
            });

            addSafeListener($('saveSecurityBtn'), 'click', function() {
                if (!isAdmin()) { showToast('⚠️ متاح للمسؤول فقط', 'error'); return; }
                saveSettings();
            });

            addSafeListener($('saveNotificationsBtn'), 'click', function() {
                if (!isAdmin()) { showToast('⚠️ متاح للمسؤول فقط', 'error'); return; }
                saveSettings();
            });

            addSafeListener($('saveLogoBtn'), 'click', function() {
                if (!isAdmin()) { showToast('⚠️ متاح للمسؤول فقط', 'error'); return; }
                saveSettings();
            });

            // ✅ Refresh
            addSafeListener($('refreshBtn'), 'click', function() {
                if (!isAdmin()) { showToast('⚠️ متاح للمسؤول فقط', 'error'); return; }
                showToast('🔄 جاري التحديث...', 'info');
                loadSettings();
                loadLogo();
            });

            // ✅ Reset
            addSafeListener($('resetDefaultsBtn'), 'click', function() {
                if (!isAdmin()) { showToast('⚠️ متاح للمسؤول فقط', 'error'); return; }
                if (!confirm('⚠️ هل أنت متأكد من استعادة الإعدادات الافتراضية؟')) return;

                fetcher('/api/settings/reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                })
                .then(function(r) {
                    if (!r.ok) throw new Error('فشل الاستعادة');
                    return r.json();
                })
                .then(function() {
                    showToast('✅ تم استعادة الإعدادات الافتراضية', 'success');
                    setTimeout(function() { loadSettings(); }, 500);
                })
                .catch(function(err) {
                    showToast('❌ ' + err.message, 'error');
                });
            });

            // ========================================================
            // 🖼️ LOGO INIT — ربط رفع الشعار
            // ========================================================
            var logoFileInput = $('logoFileInput');
            var logoDropZone = $('logoDropZone');

            if (logoFileInput) {
                addSafeListener(logoFileInput, 'change', function() {
                    if (this.files && this.files[0]) {
                        uploadLogo(this.files[0]);
                        this.value = '';
                    }
                });
            }

            if (logoDropZone) {
                addSafeListener(logoDropZone, 'click', function(e) {
                    if (e.target.closest('.logo-actions')) return;
                    if (logoFileInput) logoFileInput.click();
                });

                ['dragenter', 'dragover'].forEach(function(evt) {
                    addSafeListener(logoDropZone, evt, function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        logoDropZone.classList.add('dragover');
                    });
                });

                ['dragleave', 'drop'].forEach(function(evt) {
                    addSafeListener(logoDropZone, evt, function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        logoDropZone.classList.remove('dragover');
                    });
                });

                addSafeListener(logoDropZone, 'drop', function(e) {
                    var files = e.dataTransfer && e.dataTransfer.files;
                    if (files && files[0]) {
                        uploadLogo(files[0]);
                    }
                });
            }

            // ✅ تحميل الشعار عند البدء
            loadLogo();

            console.log('✅ Settings v10.0 ready');
        }

        // ============================================================
        // 🏁 BOOT
        // ============================================================
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                var id = setTimeout(function() {
                    if (!_isDestroyed) init();
                }, 50);
                _pageTimeouts.push(id);
            }, { once: true });
        } else {
            var id0 = setTimeout(function() {
                if (!_isDestroyed) init();
            }, 50);
            _pageTimeouts.push(id0);
        }

        // ============================================================
        // 🌐 EXPOSE
        // ============================================================
        window.loadSettings = loadSettings;
        window.getToken = getToken;
        window.showToast = showToast;

    })();
    </script>
</div>
