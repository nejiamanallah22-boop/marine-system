/**
 * 📋 نظام تسجيل الأحداث (Audit Log)
 * @module utils/logger
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// إنشاء مجلد السجلات إذا لم يكن موجوداً
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

/**
 * تنسيق السجل
 */
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let log = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        if (Object.keys(meta).length > 0) {
            log += ` ${JSON.stringify(meta)}`;
        }
        return log;
    })
);

/**
 * إنشاء logger
 */
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
        // سجل الأخطاء
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 10485760, // 10MB
            maxFiles: 5
        }),
        // سجل جميع الأحداث
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            maxsize: 10485760, // 10MB
            maxFiles: 5
        }),
        // سجل التدقيق (Audit)
        new winston.transports.File({
            filename: path.join(logDir, 'audit.log'),
            level: 'info',
            maxsize: 10485760,
            maxFiles: 10
        })
    ]
});

// إضافة console في بيئة التطوير
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

/**
 * تسجيل حدث تدقيق
 * @param {string} action - نوع الحدث
 * @param {Object} data - بيانات الحدث
 */
function auditLog(action, data = {}) {
    logger.info(`[AUDIT] ${action}`, {
        action,
        ...data,
        timestamp: new Date().toISOString()
    });
}

module.exports = {
    logger,
    auditLog
};
