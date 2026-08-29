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
