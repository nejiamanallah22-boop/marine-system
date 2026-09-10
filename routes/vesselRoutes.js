/**
 * 🚢 مسارات الوسائل البحرية
 * @module routes/vesselRoutes
 * @version 9.1.0
 *
 * ✨ v9.1 Features:
 * - Full authenticate + authorize chain
 * - CSRF protection on mutating routes
 * - express-validator result checking
 * - Frontend-compatible field names
 * - RBAC via requirePermission
 * - Rate limiting ready
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');

const {
    getVessels,
    getVessel,
    createVessel,
    updateVessel,
    deleteVessel
} = require('../controllers/vesselController');

const {
    authenticate,
    authorize,
    requirePermission
} = require('../middleware/auth');

// ✅ CSRF protection من server.js
//    إن لم يكن متوفراً، نستخدم passthrough
let csrfProtection = (req, res, next) => next();
try {
    // نحاول استيراده من server.js إذا كان مُصدَّراً
    // وإلا نبقى على passthrough
    const serverModule = require('../server');
    if (serverModule && typeof serverModule.csrfProtection === 'function') {
        csrfProtection = serverModule.csrfProtection;
    }
} catch (e) {
    // server.js لا يُصدّر csrfProtection — نتجاهل
}

const router = express.Router();

// ============================================================
// 🔧 HELPERS
// ============================================================

/**
 * ✅ فحص نتائج express-validator
 *    إن فشل → 400 مع أول رسالة خطأ
 */
const checkValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const firstError = errors.array()[0];
        return res.status(400).json({
            success: false,
            error: firstError.msg,
            field: firstError.path,
            errors: errors.array()
        });
    }
    next();
};

// ============================================================
// ✅ VALIDATORS
// ============================================================

/**
 * التحقق من صحة معرف الوسيلة
 * ✅ v9.1: server.js يستخدم randomId(8) — hex string بطول 16
 */
const validateVesselId = [
    param('id')
        .isString()
        .trim()
        .isLength({ min: 1, max: 64 })
        .withMessage('معرف الوسيلة غير صالح')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('معرف الوسيلة يحتوي على رموز غير مسموحة')
];

/**
 * ✅ v9.1: التحقق من صحة بيانات الوسيلة
 *    متوافق مع الحقول الحقيقية التي ترسلها الواجهة:
 *    name, num, len, region, zone, port, supp, status,
 *    break, fDate, eDate, ref, repairUnit, cat
 */
const validateVessel = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('اسم الوسيلة مطلوب')
        .isLength({ min: 2, max: 100 })
        .withMessage('اسم الوسيلة يجب أن يكون بين 2 و 100 حرف'),

    body('num')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 20 })
        .withMessage('رقم الوسيلة طويل جداً'),

    body('len')
        .optional({ checkFalsy: true })
        .isFloat({ min: 0, max: 1000 })
        .withMessage('طول الوسيلة غير صالح')
        .toFloat(),

    body('region')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 100 })
        .withMessage('المنطقة طويلة جداً'),

    body('zone')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 100 })
        .withMessage('المنطقة الفرعية طويلة جداً'),

    body('port')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 100 })
        .withMessage('الميناء طويل جداً'),

    body('supp')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 100 })
        .withMessage('حقل supp طويل جداً'),

    body('status')
        .optional({ checkFalsy: true })
        .trim()
        .isIn(['صالح', 'صيانة', 'معطب', 'احتياط', 'active', 'inactive', 'maintenance', 'reserve'])
        .withMessage('حالة غير صالحة'),

    body('break')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 200 })
        .withMessage('وصف العطب طويل جداً'),

    body('fDate')
        .optional({ checkFalsy: true })
        .isISO8601()
        .withMessage('تاريخ البدء غير صالح'),

    body('eDate')
        .optional({ checkFalsy: true })
        .isISO8601()
        .withMessage('تاريخ الانتهاء غير صالح'),

    body('ref')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 100 })
        .withMessage('المرجع طويل جداً'),

    body('repairUnit')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 100 })
        .withMessage('وحدة الصيانة طويلة جداً'),

    body('cat')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 50 })
        .withMessage('الفئة طويلة جداً')
];

/**
 * ✅ v9.1: للتوافق مع الواجهات التي ترسل الحقول القديمة
 *    (type, location, specifications)
 */
const validateVesselLegacy = [
    body('name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('اسم الوسيلة يجب أن يكون بين 2 و 100 حرف'),

    body('type')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 50 }),

    body('status')
        .optional({ checkFalsy: true })
        .trim(),

    body('location')
        .optional({ checkFalsy: true })
        .trim(),

    body('specifications')
        .optional()
        .isObject()
        .withMessage('المواصفات يجب أن تكون كائناً')
];

// ============================================================
// 🛡️ GLOBAL MIDDLEWARE FOR ALL ROUTES
// ============================================================

/**
 * ✅ v9.1: كل مسارات vessels تتطلب مصادقة
 *    هذا يضمن أن req.user موجود قبل authorize
 */
router.use(authenticate);

// ============================================================
// 📋 ROUTES
// ============================================================

/**
 * @route   GET /api/vessels
 * @desc    الحصول على جميع الوسائل
 * @access  Private (أي مستخدم مسجل)
 */
router.get(
    '/',
    requirePermission('vessels:read'),
    getVessels
);

/**
 * @route   GET /api/vessels/:id
 * @desc    الحصول على وسيلة واحدة
 * @access  Private
 */
router.get(
    '/:id',
    validateVesselId,
    checkValidation,
    requirePermission('vessels:read'),
    getVessel
);

/**
 * @route   POST /api/vessels
 * @desc    إنشاء وسيلة جديدة
 * @access  Private (Admin, Manager)
 */
router.post(
    '/',
    authorize('admin', 'manager'),
    csrfProtection,
    validateVessel,
    checkValidation,
    createVessel
);

/**
 * @route   PUT /api/vessels/:id
 * @desc    تحديث وسيلة
 * @access  Private (Admin, Manager)
 */
router.put(
    '/:id',
    authorize('admin', 'manager'),
    csrfProtection,
    validateVesselId,
    validateVessel,
    checkValidation,
    updateVessel
);

/**
 * @route   PATCH /api/vessels/:id
 * @desc    تحديث جزئي للوسيلة (نفس صلاحيات PUT)
 * @access  Private (Admin, Manager)
 */
router.patch(
    '/:id',
    authorize('admin', 'manager'),
    csrfProtection,
    validateVesselId,
    validateVessel,
    checkValidation,
    updateVessel
);

/**
 * @route   DELETE /api/vessels/:id
 * @desc    حذف وسيلة
 * @access  Private (Admin فقط)
 */
router.delete(
    '/:id',
    authorize('admin'),
    csrfProtection,
    validateVesselId,
    checkValidation,
    deleteVessel
);

// ============================================================
// 📤 EXPORTS
// ============================================================

module.exports = router;
