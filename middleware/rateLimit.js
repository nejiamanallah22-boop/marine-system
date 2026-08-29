/**
 * ⏱️ تحديد معدل الطلبات - حماية من الهجمات
 * @module middleware/rateLimiter
 */

const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * معدل الطلبات لتسجيل الدخول
 */
const loginLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) * 60 * 1000 || 15 * 60 * 1000, // 15 دقيقة
    max: parseInt(process.env.RATE_LIMIT_MAX) || 5, // 5 محاولات
    message: {
        success: false,
        error: 'محاولات كثيرة جداً، يرجى الانتظار 15 دقيقة'
    },
    keyGenerator: (req) => {
        // استخدام IP + اسم المستخدم إذا وجد
        const username = req.body?.username || 'anonymous';
        return `${req.ip}:${username}`;
    },
    handler: (req, res) => {
        logger.warn('⚠️ تجاوز معدل الطلبات المسموح', {
            ip: req.ip,
            username: req.body?.username || 'unknown'
        });
        res.status(429).json({
            success: false,
            error: 'محاولات كثيرة جداً، يرجى الانتظار 15 دقيقة'
        });
    },
    skipSuccessfulRequests: true, // لا تحسب الطلبات الناجحة
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * معدل الطلبات العامة
 */
const generalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 دقيقة
    max: 100, // 100 طلب في الدقيقة
    message: {
        success: false,
        error: 'طلبات كثيرة جداً، يرجى الانتظار قليلاً'
    },
    handler: (req, res) => {
        logger.warn('⚠️ تجاوز معدل الطلبات العامة', { ip: req.ip });
        res.status(429).json({
            success: false,
            error: 'طلبات كثيرة جداً، يرجى الانتظار قليلاً'
        });
    },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = {
    loginLimiter,
    generalLimiter
};
