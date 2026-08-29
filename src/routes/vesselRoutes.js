/**
 * 🚢 مسارات الوسائل البحرية
 * @module routes/vesselRoutes
 */

const express = require('express');
const { body, param } = require('express-validator');
const {
    getVessels,
    getVessel,
    createVessel,
    updateVessel,
    deleteVessel
} = require('../controllers/vesselController');
const { authorize } = require('../middleware/auth');
const router = express.Router();

/**
 * التحقق من صحة معرف الوسيلة
 */
const validateVesselId = [
    param('id').isString().notEmpty().withMessage('معرف الوسيلة مطلوب')
];

/**
 * التحقق من صحة بيانات الوسيلة
 */
const validateVessel = [
    body('name').trim().isLength({ min: 2, max: 100 })
        .withMessage('اسم الوسيلة يجب أن يكون بين 2 و 100 حرف'),
    body('type').trim().notEmpty()
        .withMessage('نوع الوسيلة مطلوب'),
    body('status').optional().isIn(['active', 'inactive', 'maintenance', 'reserve'])
        .withMessage('حالة غير صالحة'),
    body('location').trim().notEmpty()
        .withMessage('الموقع مطلوب'),
    body('specifications').optional().isObject()
        .withMessage('المواصفات يجب أن تكون كائناً')
];

/**
 * @route GET /api/vessels
 * @desc الحصول على جميع الوسائل
 * @access Private
 */
router.get('/', getVessels);

/**
 * @route GET /api/vessels/:id
 * @desc الحصول على وسيلة واحدة
 * @access Private
 */
router.get('/:id', validateVesselId, getVessel);

/**
 * @route POST /api/vessels
 * @desc إنشاء وسيلة جديدة
 * @access Private (Admin, Manager)
 */
router.post('/', authorize('admin', 'manager'), validateVessel, createVessel);

/**
 * @route PUT /api/vessels/:id
 * @desc تحديث وسيلة
 * @access Private (Admin, Manager)
 */
router.put('/:id', authorize('admin', 'manager'), validateVesselId, validateVessel, updateVessel);

/**
 * @route DELETE /api/vessels/:id
 * @desc حذف وسيلة
 * @access Private (Admin فقط)
 */
router.delete('/:id', authorize('admin'), validateVesselId, deleteVessel);

module.exports = router;
