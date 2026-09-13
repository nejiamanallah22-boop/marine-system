// ============================================================
// ⚙️ SETTINGS + 🖼️ LOGO + 🎨 BACKGROUND + AUTO-INJECT — v3.0
// ملف مستقل يُدمج في server.js
// ⚠️ ملف JavaScript فقط — لا يحتوي على HTML
// ============================================================

'use strict';

const multer = require('multer');
const fs = require('fs');
const path = require('path');

// ============================================================
// 📋 DEFAULT SETTINGS
// ============================================================

const DEFAULT_SETTINGS = {
    theme: {
        primary: '#0a1628',
        secondary: '#1a2a4a',
        gold: '#e6b31e'
    },
    layout: {
        darkMode: true,
        fontSize: 'medium',
        sidebarPosition: 'right',
        showStats: true
    },
    security: {
        emailNotifications: true,
        smsNotifications: false,
        sessionTimeout: 60
    },
    notifications: {
        emergencyAlerts: true,
        maintenanceAlerts: true,
        performanceReports: 'weekly'
    },
    branding: {
        logoSize: 'medium'
    }
};

// ============================================================
// 🔧 HELPERS
// ============================================================

function deepMerge(defaults, saved) {
    const result = JSON.parse(JSON.stringify(defaults));
    if (!saved || typeof saved !== 'object') return result;

    for (const key of Object.keys(saved)) {
        if (
            saved[key] &&
            typeof saved[key] === 'object' &&
            !Array.isArray(saved[key]) &&
            defaults[key] &&
            typeof defaults[key] === 'object'
        ) {
            result[key] = { ...defaults[key], ...saved[key] };
        } else if (saved[key] !== undefined && saved[key] !== null) {
            result[key] = saved[key];
        }
    }
    return result;
}

function sanitizeSettings(input) {
    const out = {};

    if (input.theme) {
        out.theme = {};
        const hexRegex = /^#[0-9a-fA-F]{3,8}$/;
        if (typeof input.theme.primary === 'string' && hexRegex.test(input.theme.primary)) {
            out.theme.primary = input.theme.primary;
        }
        if (typeof input.theme.secondary === 'string' && hexRegex.test(input.theme.secondary)) {
            out.theme.secondary = input.theme.secondary;
        }
        if (typeof input.theme.gold === 'string' && hexRegex.test(input.theme.gold)) {
            out.theme.gold = input.theme.gold;
        }
    }

    if (input.layout) {
        out.layout = {};
        if (typeof input.layout.darkMode === 'boolean') {
            out.layout.darkMode = input.layout.darkMode;
        }
        if (['small', 'medium', 'large'].includes(input.layout.fontSize)) {
            out.layout.fontSize = input.layout.fontSize;
        }
        if (['right', 'left'].includes(input.layout.sidebarPosition)) {
            out.layout.sidebarPosition = input.layout.sidebarPosition;
        }
        if (typeof input.layout.showStats === 'boolean') {
            out.layout.showStats = input.layout.showStats;
        }
    }

    if (input.security) {
        out.security = {};
        if (typeof input.security.emailNotifications === 'boolean') {
            out.security.emailNotifications = input.security.emailNotifications;
        }
        if (typeof input.security.smsNotifications === 'boolean') {
            out.security.smsNotifications = input.security.smsNotifications;
        }
        if (input.security.sessionTimeout !== undefined) {
            const t = Number(input.security.sessionTimeout);
            out.security.sessionTimeout = (!Number.isFinite(t) || t < 5 || t > 480) ? 60 : t;
        }
    }

    if (input.notifications) {
        out.notifications = {};
        if (typeof input.notifications.emergencyAlerts === 'boolean') {
            out.notifications.emergencyAlerts = input.notifications.emergencyAlerts;
        }
        if (typeof input.notifications.maintenanceAlerts === 'boolean') {
            out.notifications.maintenanceAlerts = input.notifications.maintenanceAlerts;
        }
        if (['daily', 'weekly', 'monthly', 'never'].includes(input.notifications.performanceReports)) {
            out.notifications.performanceReports = input.notifications.performanceReports;
        }
    }

    if (input.branding) {
        out.branding = {};
        if (['small', 'medium', 'large'].includes(input.branding.logoSize)) {
            out.branding.logoSize = input.branding.logoSize;
        }
    }

    return out;
}

// ============================================================
// 🎨 DYNAMIC INJECT SCRIPT (Logo + Background)
// ============================================================

const DYNAMIC_INJECT_SCRIPT = `
<script>
(function() {
    'use strict';
    function applyCachedBackground() {
        try {
            var bgConfig = localStorage.getItem('marine_background_config');
            if (!bgConfig) return;
            var cfg = JSON.parse(bgConfig);
            if (!cfg.dataUrl) return;
            var existing = document.getElementById('marine-dynamic-bg');
            if (existing) existing.remove();
            var bg = document.createElement('div');
            bg.id = 'marine-dynamic-bg';
            bg.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
                'background-image:url(' + cfg.dataUrl + ');' +
                'background-size:cover;background-position:center;' +
                'background-repeat:no-repeat;' +
                'opacity:' + (cfg.opacity || 0.15) + ';' +
                'filter:' + (cfg.blur > 0 ? 'blur(' + cfg.blur + 'px)' : 'none') + ';' +
                'pointer-events:none;z-index:-1;';
            document.body.appendChild(bg);
        } catch (e) {}
    }
    function updateLogoImages(dataUrl) {
        var selectors = ['.app-logo img','.navbar-logo img','#globalLogo','.sidebar-logo img','.brand-logo img','[data-marine-logo]','header .logo img','.logo img'];
        selectors.forEach(function(sel) {
            try {
                document.querySelectorAll(sel).forEach(function(img) {
                    if (img.tagName === 'IMG') img.src = dataUrl;
                });
            } catch (e) {}
        });
    }
    function applyCachedLogo() {
        try {
            var cachedLogo = localStorage.getItem('marine_logo');
            if (cachedLogo) updateLogoImages(cachedLogo);
        } catch (e) {}
    }
    function syncFromServer() {
        var token = localStorage.getItem('marine_token') || localStorage.getItem('token') || localStorage.getItem('authToken') || null;
        var headers = { 'Accept': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        fetch('/api/logo', { headers: headers, credentials: 'include' })
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(data) {
                if (data && data.success && data.logo && data.logo.dataUrl) {
                    try { localStorage.setItem('marine_logo', data.logo.dataUrl); } catch (e) {}
                    updateLogoImages(data.logo.dataUrl);
                }
            }).catch(function() {});
        fetch('/api/background', { headers: headers, credentials: 'include' })
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(data) {
                if (data && data.success && data.background && data.background.dataUrl) {
                    var cfg = {
                        dataUrl: data.background.dataUrl,
                        opacity: data.background.opacity || 0.15,
                        blur: data.background.blur || 0
                    };
                    try { localStorage.setItem('marine_background_config', JSON.stringify(cfg)); } catch (e) {}
                    applyCachedBackground();
                }
            }).catch(function() {});
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            applyCachedBackground();
            applyCachedLogo();
            syncFromServer();
        });
    } else {
        applyCachedBackground();
        applyCachedLogo();
        syncFromServer();
    }
    window.addEventListener('storage', function(e) {
        if (e.key === 'marine_background_config') applyCachedBackground();
        if (e.key === 'marine_logo' && e.newValue) updateLogoImages(e.newValue);
    });
})();
</script>
`;

// ============================================================
// 🚀 MAIN EXPORT
// ============================================================

module.exports = function registerSettingsRoutes(app, deps) {
    const {
        UserSettings,
        SystemLogo,
        authenticateAccessToken,
        requireAdmin,
        requirePermission,
        csrfProtection,
        addSystemLog,
        notify
    } = deps;

    if (!authenticateAccessToken || !requireAdmin || !UserSettings || !SystemLogo) {
        throw new Error('registerSettingsRoutes: missing required dependencies');
    }

    console.log('✅ Registering Settings + Logo + Background routes...');

    // ========================================================
    // 🎨 AUTO-INJECT MIDDLEWARE
    // ========================================================

    app.use((req, res, next) => {
        // تجاهل API
        if (req.path.startsWith('/api')) return next();
        // تجاهل الملفات الثابتة
        if (req.path.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|json|map|xml|txt|webp|pdf)$/i)) {
            return next();
        }

        const originalSend = res.send.bind(res);

        res.send = function(body) {
            try {
                const contentType = res.getHeader('Content-Type') || '';
                const isHtml = typeof body === 'string' &&
                    (String(contentType).indexOf('text/html') !== -1 || body.trim().startsWith('<!') || body.trim().startsWith('<html') || body.trim().startsWith('<div'));

                if (!isHtml) return originalSend(body);
                if (body.indexOf('marine-dynamic-bg') !== -1) return originalSend(body);

                if (body.indexOf('</body>') !== -1) {
                    body = body.replace('</body>', DYNAMIC_INJECT_SCRIPT + '</body>');
                } else if (body.indexOf('</html>') !== -1) {
                    body = body.replace('</html>', DYNAMIC_INJECT_SCRIPT + '</html>');
                } else {
                    body += DYNAMIC_INJECT_SCRIPT;
                }
            } catch (e) {
                console.error('⚠️ Inject error:', e.message);
            }
            return originalSend(body);
        };

        next();
    });

    console.log('✅ Dynamic injection middleware registered');

    // ========================================================
    // 📤 MULTER
    // ========================================================

    const logoUpload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 2 * 1024 * 1024, files: 1 },
        fileFilter: (req, file, cb) => {
            const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
            if (allowed.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('نوع الصورة غير مدعوم. استخدم PNG, JPG, SVG, أو WebP.'));
            }
        }
    });

    const bgUpload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 5 * 1024 * 1024, files: 1 },
        fileFilter: (req, file, cb) => {
            const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
            if (allowed.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('نوع الصورة غير مدعوم. استخدم PNG, JPG, أو WebP.'));
            }
        }
    });

    // ========================================================
    // ⚙️ SETTINGS
    // ========================================================

    app.get('/api/settings',
        authenticateAccessToken,
        requirePermission('settings:manage'),
        async (req, res) => {
            try {
                const doc = await UserSettings.findOne({ userId: req.user.id }).lean();
                const settings = deepMerge(DEFAULT_SETTINGS, doc?.settings || {});

                return res.json({
                    success: true,
                    settings,
                    updatedAt: doc?.updatedAt || null
                });
            } catch (error) {
                console.error('❌ GET /api/settings error:', error.message);
                return res.status(500).json({
                    success: false,
                    error: 'فشل تحميل الإعدادات'
                });
            }
        }
    );

    app.put('/api/settings',
        authenticateAccessToken,
        requirePermission('settings:manage'),
        csrfProtection,
        async (req, res) => {
            try {
                const incoming = sanitizeSettings(req.body || {});

                const existing = await UserSettings.findOne({ userId: req.user.id }).lean();
                const base = deepMerge(DEFAULT_SETTINGS, existing?.settings || {});
                const merged = deepMerge(base, incoming);

                const doc = await UserSettings.findOneAndUpdate(
                    { userId: req.user.id },
                    {
                        userId: req.user.id,
                        settings: merged,
                        updatedAt: new Date()
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );

                if (typeof addSystemLog === 'function') {
                    addSystemLog({
                        userId: req.user.id,
                        userName: req.user.name,
                        action: 'update',
                        resource: 'settings',
                        status: 'success',
                        ip: req.ip,
                        requestId: req.requestId
                    }).catch(() => {});
                }

                return res.json({
                    success: true,
                    message: 'تم حفظ الإعدادات',
                    settings: doc.settings,
                    updatedAt: doc.updatedAt
                });
            } catch (error) {
                console.error('❌ PUT /api/settings error:', error.message);
                return res.status(500).json({
                    success: false,
                    error: 'فشل حفظ الإعدادات'
                });
            }
        }
    );

    app.post('/api/settings/reset',
        authenticateAccessToken,
        requirePermission('settings:manage'),
        csrfProtection,
        async (req, res) => {
            try {
                await UserSettings.deleteOne({ userId: req.user.id });

                if (typeof addSystemLog === 'function') {
                    addSystemLog({
                        userId: req.user.id,
                        userName: req.user.name,
                        action: 'reset',
                        resource: 'settings',
                        status: 'success',
                        ip: req.ip,
                        requestId: req.requestId
                    }).catch(() => {});
                }

                return res.json({
                    success: true,
                    message: 'تم استعادة الإعدادات الافتراضية',
                    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
                });
            } catch (error) {
                console.error('❌ POST /api/settings/reset error:', error.message);
                return res.status(500).json({
                    success: false,
                    error: 'فشل استعادة الإعدادات'
                });
            }
        }
    );

    // ========================================================
    // 🖼️ LOGO
    // ========================================================

    app.get('/api/logo', async (req, res) => {
        try {
            const logo = await SystemLogo.findOne({ key: 'system_logo' }).lean();
            if (!logo) {
                return res.json({ success: true, logo: null });
            }
            return res.json({
                success: true,
                logo: {
                    dataUrl: logo.dataUrl,
                    mimetype: logo.mimetype,
                    size: logo.size,
                    uploadedAt: logo.uploadedAt
                }
            });
        } catch (error) {
            console.error('❌ GET /api/logo error:', error.message);
            return res.status(500).json({
                success: false,
                error: 'فشل تحميل الشعار'
            });
        }
    });

    app.post('/api/logo/upload',
        authenticateAccessToken,
        requireAdmin,
        csrfProtection,
        logoUpload.single('logo'),
        async (req, res) => {
            try {
                if (!req.file) {
                    return res.status(400).json({
                        success: false,
                        error: 'لم يتم رفع أي صورة'
                    });
                }

                const base64 = req.file.buffer.toString('base64');
                const dataUrl = `data:${req.file.mimetype};base64,${base64}`;

                if (dataUrl.length > 2.8 * 1024 * 1024) {
                    return res.status(413).json({
                        success: false,
                        error: 'الصورة كبيرة جدًا. الحد الأقصى 2 MB.'
                    });
                }

                const logo = await SystemLogo.findOneAndUpdate(
                    { key: 'system_logo' },
                    {
                        key: 'system_logo',
                        dataUrl,
                        mimetype: req.file.mimetype,
                        size: req.file.size,
                        originalName: req.file.originalname,
                        uploadedBy: req.user.username,
                        uploadedAt: new Date()
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );

                if (typeof addSystemLog === 'function') {
                    addSystemLog({
                        userId: req.user.id,
                        userName: req.user.name,
                        action: 'upload',
                        resource: 'logo',
                        resourceName: req.file.originalname,
                        status: 'success',
                        ip: req.ip,
                        requestId: req.requestId,
                        details: { size: req.file.size, mimetype: req.file.mimetype }
                    }).catch(() => {});
                }

                console.log('✅ Logo uploaded:', req.file.originalname, `(${req.file.size} bytes)`);

                return res.json({
                    success: true,
                    message: 'تم رفع الشعار بنجاح',
                    logo: {
                        dataUrl,
                        mimetype: req.file.mimetype,
                        size: req.file.size,
                        uploadedAt: logo.uploadedAt
                    }
                });

            } catch (error) {
                console.error('❌ POST /api/logo/upload error:', error.message);
                if (error.message && error.message.includes('نوع الصورة')) {
                    return res.status(400).json({ success: false, error: error.message });
                }
                return res.status(500).json({
                    success: false,
                    error: 'فشل رفع الشعار'
                });
            }
        }
    );

    app.delete('/api/logo',
        authenticateAccessToken,
        requireAdmin,
        csrfProtection,
        async (req, res) => {
            try {
                const result = await SystemLogo.deleteOne({ key: 'system_logo' });

                if (typeof addSystemLog === 'function') {
                    addSystemLog({
                        userId: req.user.id,
                        userName: req.user.name,
                        action: 'delete',
                        resource: 'logo',
                        status: 'success',
                        ip: req.ip,
                        requestId: req.requestId
                    }).catch(() => {});
                }

                return res.json({
                    success: true,
                    message: 'تم حذف الشعار',
                    deleted: result.deletedCount
                });
            } catch (error) {
                console.error('❌ DELETE /api/logo error:', error.message);
                return res.status(500).json({
                    success: false,
                    error: 'فشل حذف الشعار'
                });
            }
        }
    );

    // ========================================================
    // 🎨 BACKGROUND
    // ========================================================

    app.get('/api/background', async (req, res) => {
        try {
            const bg = await SystemLogo.findOne({ key: 'system_background' }).lean();
            if (!bg) {
                return res.json({ success: true, background: null });
            }
            return res.json({
                success: true,
                background: {
                    dataUrl: bg.dataUrl,
                    mimetype: bg.mimetype,
                    size: bg.size,
                    opacity: typeof bg.opacity === 'number' ? bg.opacity : 0.15,
                    blur: typeof bg.blur === 'number' ? bg.blur : 0,
                    uploadedAt: bg.uploadedAt
                }
            });
        } catch (error) {
            console.error('❌ GET /api/background error:', error.message);
            return res.status(500).json({
                success: false,
                error: 'فشل تحميل الخلفية'
            });
        }
    });

    app.post('/api/background/upload',
        authenticateAccessToken,
        requireAdmin,
        csrfProtection,
        bgUpload.single('background'),
        async (req, res) => {
            try {
                if (!req.file) {
                    return res.status(400).json({
                        success: false,
                        error: 'لم يتم رفع أي صورة'
                    });
                }

                const base64 = req.file.buffer.toString('base64');
                const dataUrl = `data:${req.file.mimetype};base64,${base64}`;

                if (dataUrl.length > 6.5 * 1024 * 1024) {
                    return res.status(413).json({
                        success: false,
                        error: 'الصورة كبيرة جدًا. الحد الأقصى 5 MB.'
                    });
                }

                const opacityInput = Number(req.body.opacity);
                const blurInput = Number(req.body.blur);

                const opacity = Number.isFinite(opacityInput)
                    ? Math.min(Math.max(opacityInput, 0.05), 0.8)
                    : 0.15;
                const blur = Number.isFinite(blurInput)
                    ? Math.min(Math.max(blurInput, 0), 20)
                    : 0;

                const bg = await SystemLogo.findOneAndUpdate(
                    { key: 'system_background' },
                    {
                        key: 'system_background',
                        dataUrl,
                        mimetype: req.file.mimetype,
                        size: req.file.size,
                        originalName: req.file.originalname,
                        opacity,
                        blur,
                        uploadedBy: req.user.username,
                        uploadedAt: new Date()
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );

                if (typeof addSystemLog === 'function') {
                    addSystemLog({
                        userId: req.user.id,
                        userName: req.user.name,
                        action: 'upload',
                        resource: 'background',
                        resourceName: req.file.originalname,
                        status: 'success',
                        ip: req.ip,
                        requestId: req.requestId,
                        details: { size: req.file.size, opacity, blur }
                    }).catch(() => {});
                }

                console.log('✅ Background uploaded:', req.file.originalname, `(${req.file.size} bytes)`);

                return res.json({
                    success: true,
                    message: 'تم رفع صورة الخلفية بنجاح',
                    background: {
                        dataUrl,
                        mimetype: req.file.mimetype,
                        size: req.file.size,
                        opacity: bg.opacity,
                        blur: bg.blur,
                        uploadedAt: bg.uploadedAt
                    }
                });

            } catch (error) {
                console.error('❌ POST /api/background/upload error:', error.message);
                if (error.message && error.message.includes('نوع الصورة')) {
                    return res.status(400).json({ success: false, error: error.message });
                }
                return res.status(500).json({
                    success: false,
                    error: 'فشل رفع الخلفية'
                });
            }
        }
    );

    app.put('/api/background/settings',
        authenticateAccessToken,
        requireAdmin,
        csrfProtection,
        async (req, res) => {
            try {
                const { opacity, blur } = req.body || {};

                const op = Number.isFinite(Number(opacity))
                    ? Math.min(Math.max(Number(opacity), 0.05), 0.8)
                    : 0.15;
                const bl = Number.isFinite(Number(blur))
                    ? Math.min(Math.max(Number(blur), 0), 20)
                    : 0;

                const bg = await SystemLogo.findOneAndUpdate(
                    { key: 'system_background' },
                    { $set: { opacity: op, blur: bl } },
                    { new: true }
                );

                if (!bg) {
                    return res.status(404).json({
                        success: false,
                        error: 'لا توجد صورة خلفية محفوظة'
                    });
                }

                return res.json({
                    success: true,
                    message: 'تم تحديث إعدادات الخلفية',
                    background: {
                        opacity: bg.opacity,
                        blur: bg.blur
                    }
                });
            } catch (error) {
                console.error('❌ PUT /api/background/settings error:', error.message);
                return res.status(500).json({
                    success: false,
                    error: 'فشل تحديث الإعدادات'
                });
            }
        }
    );

    app.delete('/api/background',
        authenticateAccessToken,
        requireAdmin,
        csrfProtection,
        async (req, res) => {
            try {
                const result = await SystemLogo.deleteOne({ key: 'system_background' });

                if (typeof addSystemLog === 'function') {
                    addSystemLog({
                        userId: req.user.id,
                        userName: req.user.name,
                        action: 'delete',
                        resource: 'background',
                        status: 'success',
                        ip: req.ip,
                        requestId: req.requestId
                    }).catch(() => {});
                }

                return res.json({
                    success: true,
                    message: 'تم حذف صورة الخلفية',
                    deleted: result.deletedCount
                });
            } catch (error) {
                console.error('❌ DELETE /api/background error:', error.message);
                return res.status(500).json({
                    success: false,
                    error: 'فشل حذف الخلفية'
                });
            }
        }
    );

    console.log('✅ Settings + Logo + Background routes registered');
    console.log('   ⚙️  /api/settings   (GET, PUT, POST reset)');
    console.log('   🖼️  /api/logo       (GET, POST upload, DELETE)');
    console.log('   🎨  /api/background (GET, POST upload, PUT settings, DELETE)');
    console.log('   🎨  Auto-inject middleware active');
};
