/**
 * 🔐 وسائط المصادقة والتحقق من الصلاحيات
 * @module middleware/auth
 * @version 9.11.0
 * @description متوافق 100% مع server.js v9.11
 *
 * ✨ v9.11 Features:
 * - RBAC v3 (admin/manager/maintenance_unit/viewer)
 * - normalizeRole للتوافق مع الأدوار القديمة
 * - JWT verification with issuer + audience
 * - Token type validation (access only)
 * - Revoked token (jti) checking
 * - Token version checking
 * - Account lockout checking
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ============================================================
// 🔧 LOGGER
// ============================================================

let logger;
try {
    logger = require('../utils/logger');
} catch (e) {
    logger = {
        info: (msg, meta) => console.log(`ℹ️  ${msg}`, meta || ''),
        warn: (msg, meta) => console.warn(`⚠️  ${msg}`, meta || ''),
        error: (msg, meta) => console.error(`❌ ${msg}`, meta || ''),
        debug: (msg, meta) => console.debug(`🐛 ${msg}`, meta || '')
    };
}

// ============================================================
// 🗂️ USER STORE HELPERS
// ============================================================

function getUserStore() {
    if (global.__marineUsers && Array.isArray(global.__marineUsers)) {
        return global.__marineUsers;
    }
    if (typeof global.__getMarineUsers === 'function') {
        return global.__getMarineUsers();
    }
    return null;
}

function findUserById(userId) {
    const store = getUserStore();
    if (!store) return null;
    return store.find(u => u.id === userId) || null;
}

// ============================================================
// 🚫 REVOKED TOKENS
// ============================================================

function isTokenRevoked(jti) {
    if (!jti) return false;
    if (typeof global.__isAccessTokenRevoked === 'function') {
        return global.__isAccessTokenRevoked(jti);
    }
    if (global.__marineRevokedTokens instanceof Map) {
        const expiry = global.__marineRevokedTokens.get(jti);
        if (!expiry) return false;
        if (Date.now() > expiry) {
            global.__marineRevokedTokens.delete(jti);
            return false;
        }
        return true;
    }
    return false;
}

// ============================================================
// 👑 RBAC v3 — نظام صلاحيات احترافي
// ============================================================
//
// 📋 التصميم:
//    - admin              : كل شيء
//    - manager            : مراكب CRUD + صيانة CRUD + سجلات
//    - maintenance_unit   : مراكب (إنشاء/تعديل) + صيانة (إنشاء/تعديل)
//    - viewer             : قراءة فقط
// ============================================================

const ROLE_PERMISSIONS = {
    // 👑 admin — كل شيء
    admin: ['*'],
    super_admin: ['*'],
    'مسؤول': ['*'],
    
    // 📋 manager — مراكب + صيانة كاملة + سجلات
    manager: [
        'vessels:read', 'vessels:create', 'vessels:update',
        'maintenance:read', 'maintenance:create', 'maintenance:update', 'maintenance:delete',
        'logs:read',
        'dashboard:view'
    ],
    'مدير': [
        'vessels:read', 'vessels:create', 'vessels:update',
        'maintenance:read', 'maintenance:create', 'maintenance:update', 'maintenance:delete',
        'logs:read',
        'dashboard:view'
    ],
    
    // 🔧 maintenance_unit — مراكب (إنشاء/تعديل) + صيانة (إنشاء/تعديل)
    maintenance_unit: [
        'vessels:read', 'vessels:create', 'vessels:update',
        'maintenance:read', 'maintenance:create', 'maintenance:update',
        'dashboard:view'
    ],
    'مشغل': [
        'vessels:read', 'vessels:create', 'vessels:update',
        'maintenance:read', 'maintenance:create', 'maintenance:update',
        'dashboard:view'
    ],
    operator: [
        'vessels:read', 'vessels:create', 'vessels:update',
        'maintenance:read', 'maintenance:create', 'maintenance:update',
        'dashboard:view'
    ],
    
    // 👁️ viewer — قراءة فقط
    viewer: ['vessels:read', 'maintenance:read', 'dashboard:view'],
    'مشاهد': ['vessels:read', 'maintenance:read', 'dashboard:view']
};

// 🗺️ الصلاحيات الحساسة (admin فقط)
const SENSITIVE_PERMISSIONS = {
    'users:manage':    ['admin'],
    'monitoring:view': ['admin'],
    'settings:manage': ['admin'],
    'sensitive:view':  ['admin'],
    'ready:view':      ['admin']
};

// 🗺️ توافق مع الأدوار القديمة
const LEGACY_ROLE_MAP = {
    'مسؤول': 'admin',
    'مدير': 'manager',
    'مشغل': 'maintenance_unit',
    'مشاهد': 'viewer',
    'operator': 'maintenance_unit',
    'super_admin': 'admin'
};

function normalizeRole(role) {
    if (!role) return 'viewer';
    const trimmed = String(role).trim();
    if (ROLE_PERMISSIONS[trimmed]) return trimmed;
    return LEGACY_ROLE_MAP[trimmed] || 'viewer';
}

function hasPermission(user, permission) {
    if (!user) return false;
    
    const role = normalizeRole(user.role);
    
    // ✅ الصلاحيات الحساسة (admin فقط)
    if (SENSITIVE_PERMISSIONS[permission]) {
        return SENSITIVE_PERMISSIONS[permission].includes(role);
    }
    
    // ✅ الصلاحيات العادية
    const permissions = ROLE_PERMISSIONS[role] || [];
    if (permissions.includes('*')) return true;
    if (permissions.includes(permission)) return true;
    
    const [resource] = permission.split(':');
    if (permissions.includes(`${resource}:*`)) return true;
    
    return false;
}

// ============================================================
// 🔐 AUTHENTICATE
// ============================================================

async function authenticate(req, res, next) {
    try {
        // 1) استخراج التوكن
        let token = null;
        const authHeader = req.headers?.authorization;
        if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
            token = authHeader.slice(7).trim();
        }
        if (!token && req.cookies) {
            token = req.cookies['marine_access'] ||
                    req.cookies['__Host-marine.access'] ||
                    req.cookies['session_token'] ||
                    null;
        }

        if (!token) {
            logger.warn('⚠️ محاولة وصول بدون توكن', { ip: req.ip, path: req.path });
            return res.status(401).json({ success: false, error: 'غير مسجل الدخول' });
        }

        // 2) التحقق من JWT
        let decoded;
        try {
            const jwtSecret = process.env.JWT_SECRET;
            if (!jwtSecret) {
                logger.error('❌ JWT_SECRET غير محدد');
                return res.status(500).json({ success: false, error: 'خطأ في إعدادات الخادم' });
            }

            decoded = jwt.verify(token, jwtSecret, {
                issuer: 'marine-system',
                audience: 'marine-system-client',
                algorithms: ['HS256']
            });
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                logger.warn('⚠️ توكن منتهي الصلاحية', { ip: req.ip });
                return res.status(401).json({ success: false, error: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً' });
            }
            logger.warn('⚠️ توكن غير صالح', { ip: req.ip, error: error.message });
            return res.status(401).json({ success: false, error: 'جلسة غير صالحة' });
        }

        // 3) نوع التوكن
        if (decoded.type && decoded.type !== 'access') {
            return res.status(401).json({ success: false, error: 'نوع التوكن غير صالح' });
        }

        // 4) الإلغاء
        if (isTokenRevoked(decoded.jti)) {
            return res.status(401).json({ success: false, error: 'التوكن ملغى' });
        }

        // 5) البحث عن المستخدم
        const userId = decoded.sub || decoded.id || decoded.userId;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'جلسة غير صالحة' });
        }

        let user = findUserById(userId);
        if (!user) {
            try {
                const User = require('../models/User');
                user = await User.findOne({ id: userId, isActive: true });
            } catch (e) {}
        }

        if (!user) {
            return res.status(401).json({ success: false, error: 'مستخدم غير موجود' });
        }

        // 6) نشاط الحساب
        if (user.active === false || user.isActive === false) {
            return res.status(401).json({ success: false, error: 'الحساب غير نشط' });
        }

        // 7) القفل
        if (user.lockedUntil && Date.now() < new Date(user.lockedUntil).getTime()) {
            const remainingMinutes = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
            return res.status(423).json({ success: false, error: `الحساب مقفل مؤقتاً. حاول بعد ${remainingMinutes} دقيقة` });
        }

        // 8) tokenVersion
        if (decoded.ver !== undefined && user.tokenVersion !== undefined && decoded.ver !== user.tokenVersion) {
            return res.status(401).json({ success: false, error: 'الجلسة ملغاة، يرجى تسجيل الدخول مجدداً' });
        }

        // 9) إضافة المستخدم للطلب
        req.user = user;
        req.userId = user.id;
        req.username = user.username;
        req.userRole = user.role;
        req.auth = decoded;
        req.token = token;

        next();
    } catch (error) {
        logger.error('❌ خطأ في المصادقة:', error);
        return res.status(500).json({ success: false, error: 'حدث خطأ في المصادقة' });
    }
}

// ============================================================
// 👑 AUTHORIZE (RBAC)
// ============================================================

function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'غير مصدق' });
        }
        if (roles.length === 0) return next();

        const userRole = normalizeRole(req.user.role);

        // ✅ admin يمر دائمًا
        if (userRole === 'admin') return next();

        const normalizedRequired = roles.map(r => normalizeRole(r));
        if (!normalizedRequired.includes(userRole)) {
            logger.warn('⚠️ محاولة وصول غير مصرح بها', {
                username: req.user.username,
                role: req.user.role,
                normalizedRole: userRole,
                requiredRoles: roles,
                path: req.path
            });
            return res.status(403).json({ success: false, error: 'ليس لديك صلاحية للوصول إلى هذه الصفحة' });
        }
        next();
    };
}

// ============================================================
// 👑 REQUIRE ADMIN
// ============================================================

function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ success: false, error: 'غير مصدق' });
    }
    const role = normalizeRole(req.user.role);
    if (role !== 'admin') {
        logger.warn('⚠️ محاولة وصول غير مصرح بها (admin required)', {
            username: req.user.username,
            role: req.user.role,
            path: req.path
        });
        return res.status(403).json({ success: false, error: 'هذه العملية متاحة للمسؤول فقط' });
    }
    next();
}

// ============================================================
// 👑 REQUIRE PERMISSION
// ============================================================

function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.user || !hasPermission(req.user, permission)) {
            logger.warn('⚠️ صلاحية مرفوضة', {
                username: req.user?.username,
                role: req.user?.role,
                normalizedRole: req.user ? normalizeRole(req.user.role) : null,
                requiredPermission: permission,
                path: req.path
            });
            return res.status(403).json({ success: false, error: 'ليس لديك الصلاحية الكافية' });
        }
        next();
    };
}

function requireOneOf(...permissions) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'غير مصدق' });
        }
        const hasAny = permissions.some(p => hasPermission(req.user, p));
        if (!hasAny) {
            return res.status(403).json({ success: false, error: 'ليس لديك الصلاحية الكافية' });
        }
        next();
    };
}

// ============================================================
// 📤 EXPORTS
// ============================================================

module.exports = {
    authenticate,
    authorize,
    requireAdmin,
    requirePermission,
    requireOneOf,
    hasPermission,
    normalizeRole,
    findUserById,
    isTokenRevoked,
    ROLE_PERMISSIONS,
    SENSITIVE_PERMISSIONS
};
