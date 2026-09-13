// ============================================================
// ⚙️ SETTINGS + 🖼️ LOGO ROUTES — v1.0
// ملف مستقل يُدمج في server.js
// ============================================================
//
// 📋 الاستخدام في server.js:
//   1. const settingsRoutes = require('./routes/settings');
//   2. settingsRoutes(app, { UserSettings, SystemLogo, ... });
// ============================================================

'use strict';

const multer = require('multer');

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

    // === Theme ===
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

    // === Layout ===
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

    // === Security ===
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

    // === Notifications ===
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

    // === Branding ===
    if (input.branding) {
        out.branding = {};
        if (['small', 'medium', 'large'].includes(input.branding.logoSize)) {
            out.branding.logoSize = input.branding.logoSize;
        }
    }

    return out;
}

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

    console.log('✅ Registering Settings + Logo routes...');

    // ========================================================
    // 🖼️ MULTER — خاص بالشعار
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

    // ========================================================
    // ⚙️ GET /api/settings
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

    // ========================================================
    // ⚙️ PUT /api/settings
    // ========================================================
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

    // ========================================================
    // ⚙️ POST /api/settings/reset
    // ========================================================
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
    // 🖼️ GET /api/logo  — public
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

    // ========================================================
    // 🖼️ POST /api/logo/upload
    // ========================================================
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

                if (typeof notify === 'function') {
                    notify({
                        type: 'success',
                        category: 'system',
                        title: 'تحديث الشعار',
                        message: `تم رفع شعار جديد بواسطة ${req.user.name || req.user.username}`,
                        link: '/pages/settings.html',
                        icon: 'image',
                        actorName: req.user.name || req.user.username
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

    // ========================================================
    // 🖼️ DELETE /api/logo
    // ========================================================
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

    console.log('✅ Settings + Logo routes registered');
    console.log('   ⚙️  /api/settings  (GET, PUT, POST reset)');
    console.log('   🖼️  /api/logo      (GET, POST upload, DELETE)');
};
