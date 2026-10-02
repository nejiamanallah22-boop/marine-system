/**
 * 🚢 مسارات الوسائل البحرية
 * @module routes/vesselRoutes
 * @version 11.0.0
 *
 * ✨ v11.0 Features:
 * - إصلاح Circular Dependency مع server.js
 * - CSRF middleware مستقل
 * - رفع حتى 10 صور (بدل 5)
 * - كامل مع الطرح والصور
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
    // محاولة 1: middleware مستقل
    const csrfMiddleware = require('../middleware/csrfProtection');
    if (csrfMiddleware && typeof csrfMiddleware.csrfProtection === 'function') {
        csrfProtection = csrfMiddleware.csrfProtection;
    } else if (typeof csrfMiddleware === 'function') {
        csrfProtection = csrfMiddleware;
    }
} catch (e1) {
    try {
        // محاولة 2: middleware/csrf
        const csrfMiddleware = require('../middleware/csrf');
        if (csrfMiddleware && typeof csrfMiddleware.csrfProtection === 'function') {
            csrfProtection = csrfMiddleware.csrfProtection;
        } else if (typeof csrfMiddleware === 'function') {
            csrfProtection = csrfMiddleware;
        }
    } catch (e2) {
        // لا CSRF → نستمر بدونه (سيُطبَّق على مستوى server.js إن وجد)
    }
}

// ═══════════════════════════════════════════════════════════
// 📸 Multer للصور
// ═══════════════════════════════════════════════════════════
let upload;
try {
    upload = require('../middleware/uploadVesselImages');
    console.log('✅ [VESSELS] Multer loaded');
} catch (e) {
    console.warn('⚠️ [VESSELS] uploadVesselImages middleware not found — images disabled');
    console.warn('   ', e.message);
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

/* ✅ GET /api/vessels/disposed — قائمة المطروحة */
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
   📸 ROUTES الصور
   ============================================================ */
if (upload) {
    console.log('📸 [VESSELS] Image routes enabled');

    /* POST /api/vessels/:id/images */
    router.post(
        '/:id/images',
        authorize('admin', 'manager'),
        csrfProtection,
        validateVesselId,
        checkValidation,
        upload.array('images', MAX_IMAGES),   // ← رُفع من 5 إلى 10
        async (req, res) => {
            try {
                const q = buildIdQuery(req.params.id);
                if (!q) {
                    if (req.files) {
                        req.files.forEach(f => {
                            if (f.path) fs.unlink(f.path, () => {});
                        });
                    }
                    return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
                }

                const v = await Vessel.findOne(q);
                if (!v) {
                    if (req.files) {
                        req.files.forEach(f => {
                            if (f.path) fs.unlink(f.path, () => {});
                        });
                    }
                    return res.status(404).json({ success: false, error: 'المركب غير موجود' });
                }

                if (!req.files || req.files.length === 0) {
                    return res.status(400).json({ success: false, error: 'لم يتم رفع أي صورة' });
                }

                const remaining = MAX_IMAGES - (v.images ? v.images.length : 0);
                if (remaining <= 0) {
                    req.files.forEach(f => {
                        if (f.path) fs.unlink(f.path, () => {});
                    });
                    return res.status(400).json({ success: false, error: `الحد الأقصى ${MAX_IMAGES} صور` });
                }

                const filesToAdd = req.files.slice(0, remaining);
                const filesToDrop = req.files.slice(remaining);
                filesToDrop.forEach(f => {
                    if (f.path) fs.unlink(f.path, () => {});
                });

                const source = req.body.source === 'camera' ? 'camera' : 'upload';
                const caption = typeof req.body.caption === 'string' ? req.body.caption.trim() : '';

                // ⚠️ مهم: نحن نستخدم memoryStorage في multer
                // إذا كان الخادم يخزّن في Cloudinary أو local، عدّل هنا
                const newImages = filesToAdd.map((file, idx) => {
                    // إذا كان multer memoryStorage → file.buffer
                    // إذا كان diskStorage → file.path, file.filename
                    const isMemoryStorage = !!file.buffer;
                    
                    if (isMemoryStorage) {
                        // ⚠️ هنا يجب رفع إلى Cloudinary أو حفظ محلياً
                        // هذا مثال افتراضي — عدّله حسب إعداداتك
                        const uniqueName = 'vessel-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + 
                                         path.extname(file.originalname || '.jpg');
                        const uploadDir = path.join(__dirname, '..', 'uploads', 'vessels');
                        
                        // إنشاء المجلد إن لم يكن موجوداً
                        if (!fs.existsSync(uploadDir)) {
                            fs.mkdirSync(uploadDir, { recursive: true });
                        }
                        
                        const savePath = path.join(uploadDir, uniqueName);
                        fs.writeFileSync(savePath, file.buffer);
                        
                        return {
                            filename: uniqueName,
                            originalName: file.originalname,
                            url: `/uploads/vessels/${uniqueName}`,
                            size: file.size,
                            mimetype: file.mimetype,
                            caption,
                            isPrimary: (!v.images || v.images.length === 0) && idx === 0,
                            source,
                            uploadedAt: new Date(),
                            uploadedBy: req.user.name || req.user.username || 'system'
                        };
                    }
                    
                    // diskStorage
                    return {
                        filename: file.filename,
                        originalName: file.originalname,
                        url: `/uploads/vessels/${file.filename}`,
                        size: file.size,
                        mimetype: file.mimetype,
                        caption,
                        isPrimary: (!v.images || v.images.length === 0) && idx === 0,
                        source,
                        uploadedAt: new Date(),
                        uploadedBy: req.user.name || req.user.username || 'system'
                    };
                });

                v.images.push(...newImages);
                await v.save();

                res.json({
                    success: true,
                    message: `تم رفع ${newImages.length} صورة`,
                    images: v.images,
                    vessel: formatVessel(v)
                });
            } catch (e) {
                console.error('❌ [VESSELS] upload:', e.message);
                if (req.files) {
                    req.files.forEach(f => {
                        if (f.path) fs.unlink(f.path, () => {});
                    });
                }
                res.status(500).json({ success: false, error: 'خطأ في رفع الصور: ' + e.message });
            }
        }
    );

    /* DELETE /api/vessels/:id/images/:imageId */
    router.delete(
        '/:id/images/:imageId',
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

                const img = v.images.id(req.params.imageId);
                if (!img) return res.status(404).json({ success: false, error: 'الصورة غير موجودة' });

                if (img.url) {
                    const fp = path.join(__dirname, '..', img.url);
                    fs.unlink(fp, () => {});
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

    /* PATCH /api/vessels/:id/images/:imageId/primary */
    router.patch(
        '/:id/images/:imageId/primary',
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
    console.warn('⚠️ [VESSELS] Image routes DISABLED (upload middleware missing)');
    console.warn('   تأكد من وجود: server/middleware/uploadVesselImages.js');
}

// ============================================================
// 📤 EXPORT
// ============================================================
module.exports = router;
