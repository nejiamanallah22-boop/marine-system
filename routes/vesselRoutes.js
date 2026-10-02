/**
 * 🚢 مسارات الوسائل البحرية
 * @module routes/vesselRoutes
 * @version 12.0.0
 *
 * ✨ v12.0 Features:
 * - دعم Cloudinary لرفع الصور
 * - memoryStorage → Cloudinary مباشر
 * - حدود 10 صور
 * - كامل مع الطرح
 * - disposed قبل /:id لتجنّب التعارض
 * - express-validator
 * - RBAC + CSRF
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
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

// ═══════════════════════════════════════════════════════════
// 🔐 CSRF Protection — استيراد مباشر (بدون Circular Dependency)
// ═══════════════════════════════════════════════════════════
let csrfProtection = (req, res, next) => next();
try {
    const csrfMiddleware = require('../middleware/csrfProtection');
    if (csrfMiddleware && typeof csrfMiddleware.csrfProtection === 'function') {
        csrfProtection = csrfMiddleware.csrfProtection;
    } else if (typeof csrfMiddleware === 'function') {
        csrfProtection = csrfMiddleware;
    }
} catch (e1) {
    try {
        const csrfMiddleware = require('../middleware/csrf');
        if (csrfMiddleware && typeof csrfMiddleware.csrfProtection === 'function') {
            csrfProtection = csrfMiddleware.csrfProtection;
        } else if (typeof csrfMiddleware === 'function') {
            csrfProtection = csrfMiddleware;
        }
    } catch (e2) {
        // CSRF غير متوفر — يُطبَّق على مستوى server.js إن وجد
    }
}

// ═══════════════════════════════════════════════════════════
// 📸 Multer — رفع الصور (memoryStorage)
// ═══════════════════════════════════════════════════════════
let upload = null;
try {
    upload = require('../middleware/uploadVesselImages');
    console.log('✅ [VESSELS] Multer middleware loaded');
} catch (e) {
    console.error('❌ [VESSELS] Multer middleware FAILED:', e.message);
    upload = null;
}

// ═══════════════════════════════════════════════════════════
// ☁️ Cloudinary
// ═══════════════════════════════════════════════════════════
let cloudinary = null;
try {
    cloudinary = require('cloudinary').v2;
    // تأكد من التهيئة (عادة عبر CLOUDINARY_URL env أو cloudinary.config())
    if (process.env.CLOUDINARY_URL) {
        console.log('✅ [VESSELS] Cloudinary configured (from env)');
    } else {
        console.log('ℹ️ [VESSELS] Cloudinary SDK loaded (using default config)');
    }
} catch (e) {
    console.error('❌ [VESSELS] Cloudinary FAILED:', e.message);
    cloudinary = null;
}

const Vessel = require('../models/Vessel');

const router = express.Router();

const MAX_IMAGES = 10;

// ============================================================
// 🔧 HELPERS
// ============================================================
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

function formatVessel(v) {
    if (!v) return null;
    const obj = v.toObject ? v.toObject() : v;
    const images = Array.isArray(obj.images) ? obj.images.map(img => ({
        _id: img._id ? img._id.toString() : null,
        filename: img.filename || '',
        originalName: img.originalName || '',
        url: img.url || '',
        size: img.size || 0,
        mimetype: img.mimetype || '',
        caption: img.caption || '',
        isPrimary: !!img.isPrimary,
        source: img.source || 'upload',
        uploadedAt: img.uploadedAt || null,
        uploadedBy: img.uploadedBy || 'system'
    })) : [];
    const primary = images.find(i => i.isPrimary) || images[0] || null;
    obj.id = obj.id || (obj._id ? obj._id.toString() : null);
    obj.images = images;
    obj.primaryImage = primary;
    obj.imagesCount = images.length;
    return obj;
}

function buildIdQuery(id) {
    if (!id || typeof id !== 'string') return null;
    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(id)) {
        return { $or: [{ id }, { _id: id }] };
    }
    return { id };
}

// ═══════════════════════════════════════════════════════════
// ☁️ رفع صورة واحدة إلى Cloudinary
// ═══════════════════════════════════════════════════════════
async function uploadToCloudinary(file) {
    if (!cloudinary) {
        throw new Error('Cloudinary غير مُفعَّل على الخادم');
    }
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: 'marine/vessels',
                resource_type: 'image',
                transformation: [
                    { width: 1600, height: 1600, crop: 'limit' },
                    { quality: 'auto:good' },
                    { fetch_format: 'auto' }
                ]
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        uploadStream.end(file.buffer);
    });
}

// ═══════════════════════════════════════════════════════════
// ☁️ حذف صورة من Cloudinary
// ═══════════════════════════════════════════════════════════
async function deleteFromCloudinary(publicId) {
    if (!cloudinary || !publicId) return;
    try {
        await cloudinary.uploader.destroy(publicId);
        console.log('🗑️ [VESSELS] Deleted from Cloudinary:', publicId);
    } catch (e) {
        console.warn('⚠️ [VESSELS] Cloudinary delete failed:', e.message);
    }
}

// ============================================================
// ✅ VALIDATORS
// ============================================================
const validateVesselId = [
    param('id')
        .isString().trim()
        .isLength({ min: 1, max: 64 })
        .withMessage('معرف الوسيلة غير صالح')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('معرف الوسيلة يحتوي على رموز غير مسموحة')
];

const validateVessel = [
    body('name').trim()
        .notEmpty().withMessage('اسم الوسيلة مطلوب')
        .isLength({ min: 2, max: 100 }).withMessage('اسم الوسيلة بين 2 و 100 حرف'),
    body('num').optional({ checkFalsy: true }).trim().isLength({ max: 20 }),
    body('len').optional({ checkFalsy: true }).isFloat({ min: 0, max: 1000 }).toFloat(),
    body('region').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
    body('zone').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
    body('port').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
    body('supp').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
    body('status').optional({ checkFalsy: true }).trim()
        .isIn(['صالح', 'صيانة', 'معطب', 'احتياط', 'طرح',
               'active', 'inactive', 'maintenance', 'reserve'])
        .withMessage('حالة غير صالحة'),
    body('break').optional({ checkFalsy: true }).trim().isLength({ max: 200 }),
    body('fDate').optional({ checkFalsy: true }).isISO8601(),
    body('eDate').optional({ checkFalsy: true }).isISO8601(),
    body('ref').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
    body('repairUnit').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
    body('cat').optional({ checkFalsy: true }).trim().isLength({ max: 50 })
];

// ============================================================
// 🛡️ MIDDLEWARE
// ============================================================
router.use(authenticate);

// ============================================================
// 📋 ROUTES — ⚠️ الترتيب مهم!
// ============================================================

/* ============================================================
   📌 ROUTES متقدمة أولاً (قبل /:id)
   ============================================================ */

/* ✅ GET /api/vessels/disposed */
router.get(
    '/disposed',
    requirePermission('vessels:read'),
    async (req, res) => {
        try {
            const { q, region, zone, type, decision, from, to } = req.query;
            const query = { status: 'طرح' };
            if (region) query.region = region;
            if (zone) query.zone = zone;
            if (type) query.type = type;
            if (decision) query.disposalDecision = new RegExp(decision, 'i');
            if (from || to) {
                query.disposalDate = {};
                if (from) query.disposalDate.$gte = new Date(from);
                if (to) query.disposalDate.$lte = new Date(to);
            }
            if (q) {
                query.$or = [
                    { name: new RegExp(q, 'i') },
                    { num: new RegExp(q, 'i') },
                    { ref: new RegExp(q, 'i') },
                    { disposalReason: new RegExp(q, 'i') },
                    { disposalDecision: new RegExp(q, 'i') }
                ];
            }
            const vessels = await Vessel.find(query)
                .sort({ disposalDate: -1, createdAt: -1 })
                .limit(1000)
                .lean();
            res.json(vessels.map(formatVessel));
        } catch (e) {
            console.error('❌ [VESSELS] GET /disposed:', e.message);
            res.status(500).json({ success: false, error: 'فشل تحميل المطروحة' });
        }
    }
);

/* ✅ GET /api/vessels/disposal-stats */
router.get(
    '/disposal-stats',
    requirePermission('vessels:read'),
    async (req, res) => {
        try {
            const [total, disposed, byRegion, byType] = await Promise.all([
                Vessel.countDocuments(),
                Vessel.countDocuments({ status: 'طرح' }),
                Vessel.aggregate([
                    { $match: { status: 'طرح' } },
                    { $group: { _id: '$region', count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ]),
                Vessel.aggregate([
                    { $match: { status: 'طرح' } },
                    { $group: { _id: '$type', count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ])
            ]);
            res.json({
                success: true,
                total,
                disposed,
                active: total - disposed,
                disposedPercent: total > 0 ? Math.round((disposed / total) * 1000) / 10 : 0,
                byRegion: byRegion.map(x => ({ region: x._id, count: x.count })),
                byType: byType.map(x => ({ type: x._id, count: x.count }))
            });
        } catch (e) {
            console.error('❌ [VESSELS] stats:', e.message);
            res.status(500).json({ success: false, error: 'فشل الإحصائيات' });
        }
    }
);

/* ============================================================
   📌 CRUD الأساسي
   ============================================================ */

/* GET /api/vessels */
router.get(
    '/',
    requirePermission('vessels:read'),
    getVessels
);

/* POST /api/vessels */
router.post(
    '/',
    authorize('admin', 'manager'),
    csrfProtection,
    validateVessel,
    checkValidation,
    createVessel
);

/* ============================================================
   📌 ROUTES خاصة بـ :id — بعد /disposed
   ============================================================ */

/* GET /api/vessels/:id */
router.get(
    '/:id',
    validateVesselId,
    checkValidation,
    requirePermission('vessels:read'),
    getVessel
);

/* PUT /api/vessels/:id */
router.put(
    '/:id',
    authorize('admin', 'manager'),
    csrfProtection,
    validateVesselId,
    validateVessel,
    checkValidation,
    updateVessel
);

/* PATCH /api/vessels/:id */
router.patch(
    '/:id',
    authorize('admin', 'manager'),
    csrfProtection,
    validateVesselId,
    validateVessel,
    checkValidation,
    updateVessel
);

/* DELETE /api/vessels/:id */
router.delete(
    '/:id',
    authorize('admin'),
    csrfProtection,
    validateVesselId,
    checkValidation,
    deleteVessel
);

/* ============================================================
   ⚫ ROUTES الطرح
   ============================================================ */

/* POST /api/vessels/:id/dispose */
router.post(
    '/:id/dispose',
    authorize('admin', 'manager'),
    csrfProtection,
    validateVesselId,
    checkValidation,
    async (req, res) => {
        try {
            const q = buildIdQuery(req.params.id);
            if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

            const v = await Vessel.findOne(q);
            if (!v) return res.status(404).json({ success: false, error: 'المركب غير موجود' });

            if (v.status === 'طرح') {
                return res.status(400).json({ success: false, error: 'المركب مطروح مسبقاً' });
            }

            const { reason, decision, disposedBy, notes, date } = req.body || {};
            if (!reason || !String(reason).trim()) {
                return res.status(400).json({ success: false, error: 'سبب الطرح مطلوب' });
            }

            await v.dispose({
                reason: String(reason).trim(),
                decision: decision ? String(decision).trim() : '',
                disposedBy: disposedBy ? String(disposedBy).trim() : (req.user.name || req.user.username || ''),
                notes: notes ? String(notes).trim() : '',
                date
            });

            res.json({
                success: true,
                message: 'تم طرح الوسيلة بنجاح',
                vessel: formatVessel(v)
            });
        } catch (e) {
            console.error('❌ [VESSELS] dispose:', e.message);
            res.status(500).json({ success: false, error: e.message || 'خطأ في الطرح' });
        }
    }
);

/* POST /api/vessels/:id/restore */
router.post(
    '/:id/restore',
    authorize('admin', 'manager'),
    csrfProtection,
    validateVesselId,
    checkValidation,
    async (req, res) => {
        try {
            const q = buildIdQuery(req.params.id);
            if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

            const v = await Vessel.findOne(q);
            if (!v) return res.status(404).json({ success: false, error: 'المركب غير موجود' });

            if (v.status !== 'طرح') {
                return res.status(400).json({ success: false, error: 'المركب غير مطروح' });
            }

            const { newStatus } = req.body || {};
            const allowed = ['صالح', 'صيانة', 'معطب', 'احتياط'];
            const target = allowed.includes(newStatus) ? newStatus : 'صيانة';

            await v.restore({ newStatus: target });

            res.json({
                success: true,
                message: 'تم إلغاء الطرح بنجاح',
                vessel: formatVessel(v)
            });
        } catch (e) {
            console.error('❌ [VESSELS] restore:', e.message);
            res.status(500).json({ success: false, error: 'خطأ في إلغاء الطرح' });
        }
    }
);

/* ============================================================
   📸 ROUTES الصور — Cloudinary
   ============================================================ */
if (upload && cloudinary) {

    console.log('📸 [VESSELS] Image routes ENABLED (Cloudinary)');

    // ─── POST /api/vessels/:id/images ───
    router.post(
        '/:id/images',
        authorize('admin', 'manager', 'editor', 'maintenance_unit'),
        csrfProtection,
        validateVesselId,
        checkValidation,
        upload.array('images', MAX_IMAGES),
        async (req, res) => {
            try {
                const q = buildIdQuery(req.params.id);
                if (!q) {
                    return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
                }

                const v = await Vessel.findOne(q);
                if (!v) {
                    return res.status(404).json({ success: false, error: 'المركب غير موجود' });
                }

                if (!req.files || req.files.length === 0) {
                    return res.status(400).json({ success: false, error: 'لم يتم رفع أي صورة' });
                }

                const remaining = MAX_IMAGES - (v.images ? v.images.length : 0);
                if (remaining <= 0) {
                    return res.status(400).json({
                        success: false,
                        error: `الحد الأقصى ${MAX_IMAGES} صور`
                    });
                }

                const filesToAdd = req.files.slice(0, remaining);
                const source = req.body.source === 'camera' ? 'camera' : 'upload';
                const caption = typeof req.body.caption === 'string' ? req.body.caption.trim() : '';

                // رفع الصور إلى Cloudinary
                const uploadedImages = [];
                for (let i = 0; i < filesToAdd.length; i++) {
                    const file = filesToAdd[i];
                    try {
                        const result = await uploadToCloudinary(file);
                        uploadedImages.push({
                            filename: result.public_id,
                            originalName: file.originalname,
                            url: result.secure_url,
                            size: result.bytes || file.size,
                            mimetype: file.mimetype,
                            caption: caption,
                            isPrimary: (!v.images || v.images.length === 0) && i === 0,
                            source: source,
                            uploadedAt: new Date(),
                            uploadedBy: req.user.name || req.user.username || 'system'
                        });
                    } catch (uploadErr) {
                        console.error('❌ [VESSELS] Cloudinary upload failed:', uploadErr.message);
                        return res.status(500).json({
                            success: false,
                            error: 'فشل رفع الصورة إلى Cloudinary: ' + uploadErr.message
                        });
                    }
                }

                v.images.push(...uploadedImages);
                await v.save();

                console.log(`✅ [VESSELS] Uploaded ${uploadedImages.length} images for vessel "${v.name}"`);

                res.json({
                    success: true,
                    message: `تم رفع ${uploadedImages.length} صورة`,
                    images: v.images,
                    vessel: formatVessel(v)
                });
            } catch (e) {
                console.error('❌ [VESSELS] upload error:', e.message);
                res.status(500).json({
                    success: false,
                    error: 'خطأ في رفع الصور: ' + e.message
                });
            }
        }
    );

    // ─── DELETE /api/vessels/:id/images/:imageId ───
    router.delete(
        '/:id/images/:imageId',
        authorize('admin', 'manager', 'editor'),
        csrfProtection,
        validateVesselId,
        checkValidation,
        async (req, res) => {
            try {
                const q = buildIdQuery(req.params.id);
                if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

                const v = await Vessel.findOne(q);
                if (!v) return res.status(404).json({ success: false, error: 'المركب غير موجود' });

                const img = v.images.id(req.params.imageId);
                if (!img) return res.status(404).json({ success: false, error: 'الصورة غير موجودة' });

                // حذف من Cloudinary
                if (img.filename) {
                    await deleteFromCloudinary(img.filename);
                }

                v.removeImage(req.params.imageId);
                await v.save();

                res.json({
                    success: true,
                    message: 'تم حذف الصورة',
                    images: v.images
                });
            } catch (e) {
                console.error('❌ [VESSELS] delete image:', e.message);
                res.status(500).json({ success: false, error: 'خطأ في حذف الصورة' });
            }
        }
    );

    // ─── PATCH /api/vessels/:id/images/:imageId/primary ───
    router.patch(
        '/:id/images/:imageId/primary',
        authorize('admin', 'manager', 'editor'),
        csrfProtection,
        validateVesselId,
        checkValidation,
        async (req, res) => {
            try {
                const q = buildIdQuery(req.params.id);
                if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

                const v = await Vessel.findOne(q);
                if (!v) return res.status(404).json({ success: false, error: 'المركب غير موجود' });

                const img = v.images.id(req.params.imageId);
                if (!img) return res.status(404).json({ success: false, error: 'الصورة غير موجودة' });

                v.setPrimaryImage(req.params.imageId);
                await v.save();

                res.json({
                    success: true,
                    message: 'تم تعيين الصورة الرئيسية',
                    images: v.images
                });
            } catch (e) {
                console.error('❌ [VESSELS] primary:', e.message);
                res.status(500).json({ success: false, error: 'خطأ في التحديث' });
            }
        }
    );

} else {
    console.error('❌ [VESSELS] Image routes DISABLED');
    console.error('   upload:', upload ? '✅' : '❌');
    console.error('   cloudinary:', cloudinary ? '✅' : '❌');
}

// ============================================================
// 📤 EXPORT
// ============================================================
module.exports = router;
