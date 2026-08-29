/**
 * 🔐 وسائط المصادقة والتحقق من الصلاحيات
 * @module middleware/auth
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * التحقق من الجلسة (Authentication)
 * @param {Object} req - طلب Express
 * @param {Object} res - رد Express
 * @param {Function} next - الدالة التالية
 */
async function authenticate(req, res, next) {
    try {
        // الحصول على التوكن من الـ Cookie أو الـ Header
        const token = req.cookies?.session_token || 
                      req.headers?.authorization?.replace('Bearer ', '');

        if (!token) {
            logger.warn('⚠️ محاولة وصول بدون توكن', { ip: req.ip, path: req.path });
            return res.status(401).json({
                success: false,
                error: 'غير مسجل الدخول'
            });
        }

        // التحقق من التوكن
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                logger.warn('⚠️ توكن منتهي الصلاحية', { ip: req.ip });
                return res.status(401).json({
                    success: false,
                    error: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً'
                });
            }
            logger.warn('⚠️ توكن غير صالح', { ip: req.ip, error: error.message });
            return res.status(401).json({
                success: false,
                error: 'جلسة غير صالحة'
            });
        }

        // البحث عن المستخدم
        const user = await User.findOne({ id: decoded.userId, isActive: true });

        if (!user) {
            logger.warn('⚠️ مستخدم غير موجود', { userId: decoded.userId, ip: req.ip });
            return res.status(401).json({
                success: false,
                error: 'مستخدم غير موجود'
            });
        }

        // التحقق من قفل الحساب
        if (user.isLocked()) {
            logger.warn('🔒 محاولة وصول من حساب مقفل', { 
                username: user.username, 
                ip: req.ip 
            });
            return res.status(423).json({
                success: false,
                error: 'الحساب مقفل مؤقتاً، حاول لاحقاً'
            });
        }

        // إضافة المستخدم إلى الطلب
        req.user = user;
        req.userId = user.id;
        req.username = user.username;
        req.userRole = user.role;

        next();

    } catch (error) {
        logger.error('❌ خطأ في المصادقة:', error);
        return res.status(500).json({
            success: false,
            error: 'حدث خطأ في المصادقة'
        });
    }
}

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

        if (roles.length === 0) {
            return next();
        }

        if (!roles.includes(req.user.role)) {
            logger.warn('⚠️ محاولة وصول غير مصرح بها', {
                username: req.user.username,
                role: req.user.role,
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

module.exports = {
    authenticate,
    authorize
};
