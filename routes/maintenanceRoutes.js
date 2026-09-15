/**
 * 🔧 مسارات الصيانة
 * @module routes/maintenanceRoutes
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');

// استيراد نموذج الصيانة (إن لم يكن موجودًا، استخدم ذاكرة مؤقتة)
let Maintenance;
try {
    Maintenance = require('../models/Maintenance');
    console.log('✅ [maintenanceRoutes] Maintenance model loaded');
} catch (e) {
    console.warn('⚠️ [maintenanceRoutes] models/Maintenance.js غير موجود');
    console.warn('   → أنشئ ملف models/Maintenance.js لتفعيل حفظ السجلات');
    Maintenance = null;
}

// ============================================================
// 📋 GET all maintenance records
// ============================================================
router.get('/', authenticate, async (req, res) => {
    try {
        if (!Maintenance) {
            return res.json({
                success: true,
                records: [],
                data: [],
                total: 0,
                message: 'نموذج الصيانة غير مفعّل — أنشئ models/Maintenance.js'
            });
        }

        const records = await Maintenance.find({})
            .sort({ createdAt: -1 })
            .lean();

        return res.json({
            success: true,
            records: records,
            data: records,
            total: records.length
        });

    } catch (err) {
        console.error('❌ GET /maintenance:', err);
        return res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب سجلات الصيانة: ' + err.message
        });
    }
});

// ============================================================
// 📋 GET one maintenance record
// ============================================================
router.get('/:id', authenticate, async (req, res) => {
    try {
        if (!Maintenance) {
            return res.status(404).json({ success: false, error: 'السجل غير موجود' });
        }
        const { id } = req.params;
        const record = await Maintenance.findOne({
            $or: [
                { id: id },
                { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }
            ]
        });

        if (!record) {
            return res.status(404).json({ success: false, error: 'السجل غير موجود' });
        }

        return res.json({ success: true, record, data: record });

    } catch (err) {
        console.error('❌ GET /maintenance/:id:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// ➕ POST create maintenance record
// ============================================================
router.post(
    '/',
    authenticate,
    authorize('admin', 'manager', 'editor', 'maintenance_unit'),
    async (req, res) => {
        try {
            if (!Maintenance) {
                return res.status(503).json({
                    success: false,
                    error: 'نموذج الصيانة غير مفعّل. تواصل مع المدير لإنشاء models/Maintenance.js'
                });
            }

            // توليد id
            const recordId = req.body.id || ('m_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));

            const record = new Maintenance({
                ...req.body,
                id: recordId,
                createdBy: req.userId || req.user?.id || 'system',
                createdAt: new Date(),
                updatedAt: new Date()
            });

            await record.save();

            console.log('✅ [maintenanceRoutes] تم إنشاء سجل صيانة:', recordId);

            return res.status(201).json({
                success: true,
                message: 'تم إنشاء سجل الصيانة بنجاح',
                record,
                data: record
            });

        } catch (err) {
            console.error('❌ POST /maintenance:', err);
            return res.status(500).json({
                success: false,
                error: 'حدث خطأ في إنشاء السجل: ' + err.message
            });
        }
    }
);

// ============================================================
// ✏️ PUT update maintenance record
// ============================================================
router.put(
    '/:id',
    authenticate,
    authorize('admin', 'manager', 'editor', 'maintenance_unit'),
    async (req, res) => {
        try {
            if (!Maintenance) {
                return res.status(503).json({ success: false, error: 'نموذج الصيانة غير مفعّل' });
            }

            const { id } = req.params;
            const record = await Maintenance.findOne({
                $or: [
                    { id: id },
                    { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }
                ]
            });

            if (!record) {
                return res.status(404).json({ success: false, error: 'السجل غير موجود' });
            }

            // تحديث الحقول (ما عدا createdBy)
            Object.keys(req.body).forEach(key => {
                if (key !== 'createdBy' && key !== '_id' && req.body[key] !== undefined) {
                    record[key] = req.body[key];
                }
            });

            record.updatedAt = new Date();
            await record.save();

            console.log('✅ [maintenanceRoutes] تم تحديث السجل:', id);

            return res.json({
                success: true,
                message: 'تم تحديث السجل بنجاح',
                record,
                data: record
            });

        } catch (err) {
            console.error('❌ PUT /maintenance/:id:', err);
            return res.status(500).json({
                success: false,
                error: 'حدث خطأ في تحديث السجل: ' + err.message
            });
        }
    }
);

// ============================================================
// 🗑️ DELETE
// ============================================================
router.delete(
    '/:id',
    authenticate,
    authorize('admin', 'manager'),
    async (req, res) => {
        try {
            if (!Maintenance) {
                return res.status(503).json({ success: false, error: 'نموذج الصيانة غير مفعّل' });
            }

            const { id } = req.params;
            const result = await Maintenance.deleteOne({
                $or: [
                    { id: id },
                    { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }
                ]
            });

            if (result.deletedCount === 0) {
                return res.status(404).json({ success: false, error: 'السجل غير موجود' });
            }

            console.log('✅ [maintenanceRoutes] تم حذف السجل:', id);

            return res.json({
                success: true,
                message: 'تم حذف السجل بنجاح',
                deleted: result.deletedCount
            });

        } catch (err) {
            console.error('❌ DELETE /maintenance/:id:', err);
            return res.status(500).json({
                success: false,
                error: 'حدث خطأ في حذف السجل: ' + err.message
            });
        }
    }
);

module.exports = router;
