/**
 * 👤 مسارات المستخدمين
 * @module routes/userRoutes
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

const validateUserId = [
    param('id').isString().notEmpty().withMessage('معرف المستخدم مطلوب')
];

const validateUser = [
    body('username').trim().isLength({ min: 3, max: 50 })
        .withMessage('اسم المستخدم يجب أن يكون بين 3 و 50 حرفاً')
        .matches(/^[a-zA-Z0-9_\u0600-\u06FF]+$/)
        .withMessage('اسم المستخدم يحتوي على أحرف غير مسموحة'),
    body('email').isEmail().withMessage('البريد الإلكتروني غير صالح'),
    body('name').trim().isLength({ min: 2, max: 100 })
        .withMessage('الاسم يجب أن يكون بين 2 و 100 حرف'),
    body('role').optional().isIn(['admin', 'manager', 'operator', 'viewer'])
        .withMessage('دور غير صالح')
];

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
    body('password').isLength({ min: 8 })
        .withMessage('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
], changePassword);

/**
 * @route PUT /api/users/:id/permissions
 * @desc تحديث صلاحيات المستخدم
 * @access Private (Admin)
 */
router.put('/:id/permissions', validateUserId, [
    body('permissions').isArray().withMessage('الصلاحيات يجب أن تكون مصفوفة')
], updatePermissions);

module.exports = router;
