/**
 * 🔧 مسارات الصيانة
 * @module routes/maintenanceRoutes
 * @version 2.0.0 — متوافق مع models/Maintenance.js v2.1
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const Maintenance = require('../models/Maintenance');

// ============================================================
// 📋 GET ALL
// ============================================================
router.get('/', authenticate, async (req, res) => {
    try {
        const { status, vesselId, limit = 500, offset = 0 } = req.query;
        const query = {};
        if (status) query.status = status;
        if (vesselId) query.vesselId = vesselId;

        const records = await Maintenance.find(query)
            .sort({ createdAt: -1 })
            .skip(parseInt(offset))
            .limit(parseInt(limit))
            .lean();

        const total = await Maintenance.countDocuments(query);

        return res.json({
            success: true,
            records,
            data: records,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset)
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
// 📋 GET ONE
// ============================================================
router.get('/:id', authenticate, async (req, res) => {
    try {
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
// ➕ POST CREATE
// ============================================================
router.post(
    '/',
    authenticate,
    authorize('admin', 'manager', 'editor', 'maintenance_unit'),
    async (req, res) => {
        try {
            const body = req.body || {};

            // توليد id تلقائي إن لم يوجد
            if (!body.id) {
                body.id = 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
            }

            // ضمان أن startDate تاريخ صالح
            if (body.startDate && typeof body.startDate === 'string') {
                body.startDate = new Date(body.startDate);
            }
            if (body.endDate && typeof body.endDate === 'string') {
                body.endDate = new Date(body.endDate);
            }

            body.createdBy = req.userId || req.user?.id || 'system';

            const record = new Maintenance(body);
            await record.save();

            console.log('✅ [POST /maintenance] تم إنشاء السجل:', record.id);

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
                error: err.message || 'خطأ في إنشاء السجل',
                details: err.errors ? Object.keys(err.errors).map(k => err.errors[k].message) : undefined
            });
        }
    }
);

// ============================================================
// ✏️ PUT UPDATE
// ============================================================
router.put(
    '/:id',
    authenticate,
    authorize('admin', 'manager', 'editor', 'maintenance_unit'),
    async (req, res) => {
        try {
            const { id } = req.params;
            const updates = { ...req.body };

            // تنظيف
            delete updates._id;
            delete updates.id;
            delete updates.createdAt;

            // تحويل التواريخ
            if (updates.startDate && typeof updates.startDate === 'string') {
                updates.startDate = new Date(updates.startDate);
            }
            if (updates.endDate && typeof updates.endDate === 'string') {
                updates.endDate = new Date(updates.endDate);
            }

            updates.updatedBy = req.userId || req.user?.id || 'system';

            const record = await Maintenance.findOne({
                $or: [
                    { id: id },
                    { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }
                ]
            });

            if (!record) {
                return res.status(404).json({ success: false, error: 'السجل غير موجود' });
            }

            Object.keys(updates).forEach(key => {
                record[key] = updates[key];
            });

            await record.save();

            console.log('✅ [PUT /maintenance] تم تحديث السجل:', id);

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
                error: err.message || 'خطأ في تحديث السجل'
            });
        }
    }
);

// ============================================================
// ✅ POST COMPLETE (اختصار + تحديث المركب)
// ============================================================
router.post(
    '/:id/complete',
    authenticate,
    authorize('admin', 'manager', 'editor', 'maintenance_unit'),
    async (req, res) => {
        try {
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

            await record.complete();

            // تحديث المركب في السجل العام
            try {
                const Vessel = require('../models/Vessel');
                await Vessel.updateOne(
                    { $or: [{ id: record.vesselId }, { _id: record.vesselId }] },
                    { $set: { status: 'صالح', stat: 'صالح', break: '', fDate: null, eDate: new Date().toISOString().split('T')[0] } }
                );
                console.log('✅ تم تحديث حالة المركب إلى "صالح"');
            } catch (vErr) {
                console.warn('⚠️ لم يتم تحديث السجل العام:', vErr.message);
            }

            return res.json({
                success: true,
                message: 'تم إكمال الصيانة وتحديث حالة المركب',
                record,
                data: record
            });
        } catch (err) {
            console.error('❌ POST /maintenance/:id/complete:', err);
            return res.status(500).json({ success: false, error: err.message });
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

            return res.json({
                success: true,
                message: 'تم حذف السجل بنجاح',
                deleted: result.deletedCount
            });
        } catch (err) {
            console.error('❌ DELETE /maintenance/:id:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
    }
);

module.exports = router;
