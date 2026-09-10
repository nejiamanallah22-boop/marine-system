/**
 * 🔐 وسائط المصادقة والتحقق من الصلاحيات
 * @module middleware/auth
 * @version 9.1.0
 * @description متوافق 100% مع server.js v9.1
 *
 * ✨ v9.1 Features:
 * - JWT verification with issuer + audience
 * - Token type validation (access only)
 * - Revoked token (jti) checking
 * - Token version checking
 * - Account lockout checking
 * - In-memory user store (no Mongoose dependency)
 * - Built-in logger fallback
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ============================================================
// 🔧 HELPERS
// ============================================================

/**
 * Logger fallback — يستخدم winston إن وُجد، وإلا console
 * ✅ لا يكسر التطبيق إن لم يكن utils/logger موجوداً
 */
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
// 🗂️ IN-MEMORY USER REFERENCE
// ============================================================

/**
 * ✅ نحاول الوصول لمصفوفة users من server.js
 *    إن لم نتمكن، نستخدم آلية fallback عبر إعادة التوجيه
 *
 * ملاحظة: في Express، لا يمكن استيراد متغير من ملف التنفيذ الرئيسي
 * مباشرة. لذلك نستخدم `global.__marineUsers` الذي يُضبط من server.js
 */
function getUserStore() {
    // ✅ الطريقة 1: عبر global (يُضبط من server.js)
    if (global.__marineUsers && Array.isArray(global.__marineUsers)) {
        return global.__marineUsers;
    }

    // ✅ الطريقة 2: عبر global مع دالة جلب
    if (typeof global.__getMarineUsers === 'function') {
        return global.__getMarineUsers();
    }

    // ✅ الطريقة 3: fallback — مصفوفة فارغة (لن يجد أحداً)
    return null;
}

/**
 * ✅ البحث عن مستخدم بالمعرّف
 */
function findUserById(userId) {
    const store = getUserStore();
    if (!store) return null;
    return store.find(u => u.id === userId) || null;
}

// ============================================================
// 🚫 REVOKED TOKENS STORE
// ============================================================

/**
 * ✅ نفس مخزن server.js — نصل إليه عبر global
 *    لتفادي الاعتماد على الملف الرئيسي
 */
function isTokenRevoked(jti) {
    if (!jti) return false;

    // ✅ أولاً: تحقق من global
    if (typeof global.__isAccessTokenRevoked === 'function') {
        return global.__isAccessTokenRevoked(jti);
    }

    // ✅ ثانياً: تحقق من مخزننا الداخلي
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
// 🔐 AUTHENTICATE
// ============================================================

/**
 * التحقق من الجلسة (Authentication)
 * @param {Object} req - طلب Express
 * @param {Object} res - رد Express
 * @param {Function} next - الدالة التالية
 */
async function authenticate(req, res, next) {
    try {
        // ============================================================
        // 1) استخراج التوكن
        // ============================================================
        // ✅ من Authorization header (الطريقة الأساسية)
        let token = null;

        const authHeader = req.headers?.authorization;
        if (authHeader && typeof authHeader === 'string' &&
            authHeader.startsWith('Bearer ')) {
            token = authHeader.slice(7).trim();
        }

        // ✅ fallback: من الكوكي (توافق رجعي)
        if (!token && req.cookies) {
            token =
                req.cookies['marine_access'] ||
                req.cookies['__Host-marine.access'] ||
                req.cookies['session_token'] ||
                null;
        }

        if (!token) {
            logger.warn('⚠️ محاولة وصول بدون توكن', {
                ip: req.ip,
                path: req.path
            });
            return res.status(401).json({
                success: false,
                error: 'غير مسجل الدخول'
            });
        }

        // ============================================================
        // 2) التحقق من JWT
        // ============================================================
        let decoded;
        try {
            const jwtSecret = process.env.JWT_SECRET;
            if (!jwtSecret) {
                logger.error('❌ JWT_SECRET غير محدد');
                return res.status(500).json({
                    success: false,
                    error: 'خطأ في إعدادات الخادم'
                });
            }

            // ✅ نفس خيارات server.js v9.1
            decoded = jwt.verify(token, jwtSecret, {
                issuer: 'marine-system',
                audience: 'marine-system-client',
                algorithms: ['HS256']
            });
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                logger.warn('⚠️ توكن منتهي الصلاحية', { ip: req.ip });
                return res.status(401).json({
                    success: false,
                    error: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً'
                });
            }
            logger.warn('⚠️ توكن غير صالح', {
                ip: req.ip,
                error: error.message
            });
            return res.status(401).json({
                success: false,
                error: 'جلسة غير صالحة'
            });
        }

        // ============================================================
        // 3) التحقق من نوع التوكن (access فقط)
        // ============================================================
        if (decoded.type && decoded.type !== 'access') {
            logger.warn('⚠️ نوع توكن غير صالح', {
                ip: req.ip,
                type: decoded.type
            });
            return res.status(401).json({
                success: false,
                error: 'نوع التوكن غير صالح'
            });
        }

        // ============================================================
        // 4) التحقق من الإلغاء (jti)
        // ============================================================
        if (isTokenRevoked(decoded.jti)) {
            logger.warn('⚠️ توكن ملغى', {
                ip: req.ip,
                jti: decoded.jti
            });
            return res.status(401).json({
                success: false,
                error: 'التوكن ملغى'
            });
        }

        // ============================================================
        // 5) البحث عن المستخدم
        // ============================================================
        const userId = decoded.sub || decoded.id || decoded.userId;

        if (!userId) {
            logger.warn('⚠️ توكن بدون معرّف مستخدم', { ip: req.ip });
            return res.status(401).json({
                success: false,
                error: 'جلسة غير صالحة'
            });
        }

        let user = findUserById(userId);

        // ✅ fallback: البحث عبر Mongoose إن كان متوفراً
        if (!user) {
            try {
                const User = require('../models/User');
                user = await User.findOne({
                    id: userId,
                    isActive: true
                });
            } catch (e) {
                // Mongoose غير متوفر — نتجاهل
            }
        }

        if (!user) {
            logger.warn('⚠️ مستخدم غير موجود', {
                userId,
                ip: req.ip
            });
            return res.status(401).json({
                success: false,
                error: 'مستخدم غير موجود'
            });
        }

        // ============================================================
        // 6) التحقق من نشاط الحساب
        // ============================================================
        if (user.active === false || user.isActive === false) {
            logger.warn('⚠️ حساب غير نشط', {
                username: user.username,
                ip: req.ip
            });
            return res.status(401).json({
                success: false,
                error: 'الحساب غير نشط'
            });
        }

        // ============================================================
        // 7) التحقق من قفل الحساب
        // ============================================================
        if (user.locked && user.lockedUntil && Date.now() < user.lockedUntil) {
            const remainingMinutes = Math.ceil(
                (user.lockedUntil - Date.now()) / 60000
            );
            logger.warn('🔒 محاولة وصول من حساب مقفل', {
                username: user.username,
                ip: req.ip,
                remainingMinutes
            });
            return res.status(423).json({
                success: false,
                error: `الحساب مقفل مؤقتاً. حاول بعد ${remainingMinutes} دقيقة`
            });
        }

        // ============================================================
        // 8) التحقق من tokenVersion (v9.1)
        // ============================================================
        if (
            decoded.ver !== undefined &&
            user.tokenVersion !== undefined &&
            decoded.ver !== user.tokenVersion
        ) {
            logger.warn('⚠️ tokenVersion غير مطابق', {
                username: user.username,
                ip: req.ip,
                tokenVer: decoded.ver,
                userVer: user.tokenVersion
            });
            return res.status(401).json({
                success: false,
                error: 'الجلسة ملغاة، يرجى تسجيل الدخول مجدداً'
            });
        }

        // ============================================================
        // 9) إضافة المستخدم إلى الطلب
        // ============================================================
        req.user = user;
        req.userId = user.id;
        req.username = user.username;
        req.userRole = user.role;
        req.auth = decoded; // ✅ معلومات JWT الأصلية

        // ✅ دعم التوافق مع server.js v9.1
        req.token = token;

        next();

    } catch (error) {
        logger.error('❌ خطأ في المصادقة:', error);
        return res.status(500).json({
            success: false,
            error: 'حدث خطأ في المصادقة'
        });
    }
}

// ============================================================
// 👑 AUTHORIZE (RBAC)
// ============================================================

/**
 * التحقق من الصلاحيات (Authorization)
 * @param {...string} roles - الأدوار المسموحة
 * @returns {Function} - وسيط التحقق من الصلاحيات
 */
function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'غير مصدق'
            });
        }

        // ✅ إن لم تُحدد أدوار → نسمح بالمرور
        if (roles.length === 0) {
            return next();
        }

        // ✅ التوافق مع كل أشكال الأدوار
        const adminRoles = ['admin', 'super_admin', 'مسؤول', 'مدير'];
        const userRole = req.user.role;

        // ✅ الأدمن يمر دائماً
        if (adminRoles.includes(userRole)) {
            return next();
        }

        // ✅ التحقق من الأدوار المطلوبة
        if (!roles.includes(userRole)) {
            logger.warn('⚠️ محاولة وصول غير مصرح بها', {
                username: req.user.username,
                role: userRole,
                requiredRoles: roles,
                path: req.path
            });
            return res.status(403).json({
                success: false,
                error: 'ليس لديك صلاحية للوصول إلى هذه الصفحة'
            });
        }

        next();
    };
}

// ============================================================
// 👑 REQUIRE ADMIN (مكافئ لـ authorize('admin'))
// ============================================================

function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'غير مصدق'
        });
    }

    const adminRoles = ['admin', 'super_admin', 'مسؤول', 'مدير'];
    if (!adminRoles.includes(req.user.role)) {
        logger.warn('⚠️ محاولة وصول غير مصرح بها (admin required)', {
            username: req.user.username,
            role: req.user.role,
            path: req.path
        });
        return res.status(403).json({
            success: false,
            error: 'هذه العملية متاحة للمسؤول فقط'
        });
    }

    next();
}

// ============================================================
// 👑 REQUIRE PERMISSION (RBAC متقدم)
// ============================================================

const ROLE_PERMISSIONS = {
    admin: ['*'],
    super_admin: ['*'],
    manager: [
        'vessels:read',
        'vessels:create',
        'vessels:update',
        'maintenance:read',
        'maintenance:create',
        'maintenance:update',
        'logs:read'
    ],
    operator: [
        'vessels:read',
        'maintenance:read',
        'maintenance:create'
    ],
    viewer: ['vessels:read', 'maintenance:read'],
    مسؤول: ['*'],
    مدير: ['*']
};

function hasPermission(user, permission) {
    if (!user) return false;
    const permissions = ROLE_PERMISSIONS[user.role] || [];
    return permissions.includes('*') || permissions.includes(permission);
}

function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.user || !hasPermission(req.user, permission)) {
            logger.warn('⚠️ صلاحية مرفوضة', {
                username: req.user?.username,
                role: req.user?.role,
                requiredPermission: permission,
                path: req.path
            });
            return res.status(403).json({
                success: false,
                error: 'ليس لديك الصلاحية الكافية'
            });
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
    hasPermission,
    // ✅ أدوات مساعدة
    findUserById,
    isTokenRevoked
};
