/**
 * 👤 مسارات المستخدمين
 * @module routes/userRoutes
 *
 * ✨ v2.1: توحيد قواعد التحقق مع models/User.js و public/user.js
 * - السماح بـ . - _ والمسافة في اسم المستخدم
 * - توحيد الحد الأدنى لكلمة المرور (12)
 * - إضافة تحقق password عند الإنشاء (كان مفقوداً)
 */

const express = require('express');
const { body, param } = require('express-validator');
const {
    getUsers,
    getUser,
    createUser,
    updateUser,
    deleteUser,
    changePassword,
    updatePermissions
} = require('../controllers/userController');
const router = express.Router();

// ============================================
// 🔧 ثوابت مشتركة (تطابق User.js و public/user.js)
// ============================================

const USERNAME_MIN = 3;
const USERNAME_MAX = 50;
const PASSWORD_MIN = 12;

// نفس النمط المستخدم في User.js و public/user.js
// يسمح: أحرف عربية/إنجليزية، أرقام، . _ - ومسافة
const USERNAME_PATTERN = /^[a-zA-Z0-9_.\-\u0600-\u06FF ]+$/;

// ============================================
// 🛡️ قواعد التحقق
// ============================================

const validateUserId = [
    param('id').isString().notEmpty().withMessage('معرف المستخدم مطلوب')
];

const validateUser = [
    body('username')
        .trim()
        .isLength({ min: USERNAME_MIN, max: USERNAME_MAX })
        .withMessage(`اسم المستخدم يجب أن يكون بين ${USERNAME_MIN} و ${USERNAME_MAX} حرفاً`)
        // ✅ التعديل: النمط يسمح بـ . - والمسافة (متوافق مع User.js)
        .matches(USERNAME_PATTERN)
        .withMessage('يُسمح فقط بالأحرف العربية/الإنجليزية، الأرقام، والرموز . _ - والمسافة')
        // منع تكرار الرموز أو المسافات
        .not().matches(/[_.\- ]{2}/)
        .withMessage('لا يمكن تكرار الرموز أو المسافات (.. __ -- أو مسافتين)')
        // منع البدء/الانتهاء برمز أو مسافة
        .not().matches(/^[_.\- ]|[_.\- ]$/)
        .withMessage('اسم المستخدم لا يبدأ أو ينتهي برمز أو مسافة'),

    body('email')
        .isEmail()
        .withMessage('البريد الإلكتروني غير صالح')
        .normalizeEmail(),

    body('name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('الاسم يجب أن يكون بين 2 و 100 حرف'),

    body('role')
        .optional()
        .isIn(['admin', 'manager', 'operator', 'viewer'])
        .withMessage('دور غير صالح'),

    // ✅ إضافة تحقق كلمة المرور عند الإنشاء (كان مفقوداً!)
    body('password')
        .if((value, { req }) => req.method === 'POST')
        .isLength({ min: PASSWORD_MIN })
        .withMessage(`كلمة المرور يجب أن تكون ${PASSWORD_MIN} حرفاً على الأقل`)
];

// ============================================
// 🛣️ المسارات (كما هي دون تغيير)
// ============================================

/**
 * @route GET /api/users
 * @desc الحصول على جميع المستخدمين
 * @access Private (Admin)
 */
router.get('/', getUsers);

/**
 * @route GET /api/users/:id
 * @desc الحصول على مستخدم واحد
 * @access Private (Admin)
 */
router.get('/:id', validateUserId, getUser);

/**
 * @route POST /api/users
 * @desc إنشاء مستخدم جديد
 * @access Private (Admin)
 */
router.post('/', validateUser, createUser);

/**
 * @route PUT /api/users/:id
 * @desc تحديث مستخدم
 * @access Private (Admin)
 */
router.put('/:id', validateUserId, validateUser, updateUser);

/**
 * @route DELETE /api/users/:id
 * @desc حذف مستخدم
 * @access Private (Admin)
 */
router.delete('/:id', validateUserId, deleteUser);

/**
 * @route POST /api/users/:id/change-password
 * @desc تغيير كلمة المرور
 * @access Private (Admin)
 */
router.post('/:id/change-password', validateUserId, [
    body('password')
        .isLength({ min: PASSWORD_MIN })
        .withMessage(`كلمة المرور يجب أن تكون ${PASSWORD_MIN} حرفاً على الأقل`)
], changePassword);

/**
 * @route PUT /api/users/:id/permissions
 * @desc تحديث صلاحيات المستخدم
 * @access Private (Admin)
 */
router.put('/:id/permissions', validateUserId, [
    body('permissions')
        .isArray()
        .withMessage('الصلاحيات يجب أن تكون مصفوفة')
], updatePermissions);

module.exports = router;
