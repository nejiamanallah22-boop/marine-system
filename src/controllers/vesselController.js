/**
 * 🚢 وحدة التحكم في الوسائل البحرية
 * @module controllers/vesselController
 */

const { validationResult } = require('express-validator');
const Vessel = require('../models/Vessel');
const logger = require('../utils/logger');

/**
 * الحصول على جميع الوسائل
 * @async
 * @param {Object} req - طلب Express
 * @param {Object} res - رد Express
 */
async function getVessels(req, res) {
    try {
        const { status, type, limit = 100, offset = 0 } = req.query;

        // بناء استعلام البحث
        const query = {};
        if (status) query.status = status;
        if (type) query.type = type;

        const vessels = await Vessel.find(query)
            .skip(parseInt(offset))
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        const total = await Vessel.countDocuments(query);

        logger.info('📊 جلب الوسائل', {
            userId: req.userId,
            count: vessels.length,
            total: total
        });

        return res.json({
            success: true,
            vessels,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (error) {
        logger.error('❌ خطأ في جلب الوسائل:', error);
        return res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب البيانات'
        });
    }
}

/**
 * الحصول على وسيلة واحدة
 * @async
 * @param {Object} req - طلب Express
 * @param {Object} res - رد Express
 */
async function getVessel(req, res) {
    try {
        const { id } = req.params;

        const vessel = await Vessel.findOne({ id });

        if (!vessel) {
            return res.status(404).json({
                success: false,
                error: 'الوسيلة غير موجودة'
            });
        }

        return res.json({
            success: true,
            vessel
        });

    } catch (error) {
        logger.error('❌ خطأ في جلب الوسيلة:', error);
        return res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب البيانات'
        });
    }
}

/**
 * إنشاء وسيلة جديدة
 * @async
 * @param {Object} req - طلب Express
 * @param {Object} res - رد Express
 */
async function createVessel(req, res) {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: errors.array()[0].msg
            });
        }

        const { name, type, status, location, specifications } = req.body;

        // التحقق من عدم وجود وسيلة بنفس الاسم
        const existing = await Vessel.findOne({ name: name.trim() });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'يوجد وسيلة بنفس الاسم'
            });
        }

        const vessel = new Vessel({
            name: name.trim(),
            type: type.trim(),
            status: status || 'active',
            location: location.trim(),
            specifications: specifications || {},
            createdBy: req.userId
        });

        await vessel.save();

        logger.info('✅ تم إنشاء وسيلة جديدة', {
            userId: req.userId,
            vesselId: vessel.id,
            name: vessel.name
        });

        return res.status(201).json({
            success: true,
            message: 'تم إنشاء الوسيلة بنجاح',
            vessel
        });

    } catch (error) {
        logger.error('❌ خطأ في إنشاء الوسيلة:', error);
        return res.status(500).json({
            success: false,
            error: 'حدث خطأ في إنشاء الوسيلة'
        });
    }
}

/**
 * تحديث وسيلة
 * @async
 * @param {Object} req - طلب Express
 * @param {Object} res - رد Express
 */
async function updateVessel(req, res) {
    try {
        const { id } = req.params;
        const { name, type, status, location, specifications } = req.body;

        const vessel = await Vessel.findOne({ id });

        if (!vessel) {
            return res.status(404).json({
                success: false,
                error: 'الوسيلة غير موجودة'
            });
        }

        // تحديث الحقول
        if (name) vessel.name = name.trim();
        if (type) vessel.type = type.trim();
        if (status) vessel.status = status;
        if (location) vessel.location = location.trim();
        if (specifications) vessel.specifications = { ...vessel.specifications, ...specifications };

        await vessel.save();

        logger.info('✅ تم تحديث الوسيلة', {
            userId: req.userId,
            vesselId: vessel.id,
            name: vessel.name
        });

        return res.json({
            success: true,
            message: 'تم تحديث الوسيلة بنجاح',
            vessel
        });

    } catch (error) {
        logger.error('❌ خطأ في تحديث الوسيلة:', error);
        return res.status(500).json({
            success: false,
            error: 'حدث خطأ في تحديث الوسيلة'
        });
    }
}

/**
 * حذف وسيلة
 * @async
 * @param {Object} req - طلب Express
 * @param {Object} res - رد Express
 */
async function deleteVessel(req, res) {
    try {
        const { id } = req.params;

        const vessel = await Vessel.findOne({ id });

        if (!vessel) {
            return res.status(404).json({
                success: false,
                error: 'الوسيلة غير موجودة'
            });
        }

        await vessel.deleteOne();

        logger.info('🗑️ تم حذف الوسيلة', {
            userId: req.userId,
            vesselId: vessel.id,
            name: vessel.name
        });

        return res.json({
            success: true,
            message: 'تم حذف الوسيلة بنجاح'
        });

    } catch (error) {
        logger.error('❌ خطأ في حذف الوسيلة:', error);
        return res.status(500).json({
            success: false,
            error: 'حدث خطأ في حذف الوسيلة'
        });
    }
}

module.exports = {
    getVessels,
    getVessel,
    createVessel,
    updateVessel,
    deleteVessel
};
