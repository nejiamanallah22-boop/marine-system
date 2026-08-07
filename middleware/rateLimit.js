const rateLimit = require('express-rate-limit');
const Redis = require('ioredis');
const { logger } = require('../utils/logger');

// تخزين مؤقت في Redis لتحديد المعدل
const redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: 1
});

// Rate Limiter متقدم
class AdvancedRateLimiter {
    constructor() {
        this.limiters = new Map();
        this.initLimiters();
    }

    initLimiters() {
        // 1. عام - للمستخدمين العاديين
        this.limiters.set('default', rateLimit({
            windowMs: 15 * 60 * 1000, // 15 دقيقة
            max: 100,
            message: '⚠️ تجاوزت الحد الأقصى للطلبات (100 طلب / 15 دقيقة)',
            standardHeaders: true,
            legacyHeaders: false,
            handler: (req, res) => {
                logger.warn(`Rate limit exceeded: ${req.ip}`);
                res.status(429).json({
                    error: 'Too Many Requests',
                    message: '⚠️ تجاوزت الحد الأقصى للطلبات، حاول لاحقاً'
                });
            }
        }));

        // 2. مكثف - للمستخدمين المميزين
        this.limiters.set('premium', rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 500,
            message: '⚠️ تجاوزت الحد الأقصى للطلبات المميزة',
            standardHeaders: true,
            legacyHeaders: false
        }));

        // 3. للواجهة البرمجية (API) - حسب المفتاح
        this.limiters.set('api', rateLimit({
            windowMs: 60 * 1000, // 1 دقيقة
            max: 30,
            message: '⚠️ تجاوزت الحد الأقصى لطلبات API',
            keyGenerator: (req) => {
                return req.headers['x-api-key'] || req.ip;
            },
            standardHeaders: true,
            legacyHeaders: false
        }));
    }

    getLimiter(type = 'default') {
        return this.limiters.get(type) || this.limiters.get('default');
    }

    // تحديد المعدل حسب نوع المستخدم
    async checkRateLimit(userId, action) {
        const key = `rate:${userId}:${action}`;
        const limit = await redisClient.get(key);
        
        if (limit) {
            const count = parseInt(limit);
            if (count >= this.getMaxLimit(action)) {
                return { allowed: false, remaining: 0 };
            }
            await redisClient.incr(key);
            return { allowed: true, remaining: this.getMaxLimit(action) - count - 1 };
        }

        await redisClient.setex(key, 60, '1');
        return { allowed: true, remaining: this.getMaxLimit(action) - 1 };
    }

    getMaxLimit(action) {
        const limits = {
            'chat': 30,        // 30 محادثة في الدقيقة
            'predict': 10,     // 10 توقعات في الدقيقة
            'report': 5,       // 5 تقارير في الدقيقة
            'admin': 50        // 50 طلب إداري في الدقيقة
        };
        return limits[action] || 30;
    }
}

module.exports = new AdvancedRateLimiter();
