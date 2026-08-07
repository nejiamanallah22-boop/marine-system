// ============================================================
// 🔐 AUTH MIDDLEWARE - مع دعم كامل للأمان
// ============================================================

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { logger } = require('../utils/logger');

class AuthMiddleware {
    constructor() {
        // ✅ القراءة من متغيرات البيئة فقط
        this.secret = process.env.JWT_SECRET;
        this.expiry = process.env.JWT_EXPIRY || '7d';
        this.refreshExpiry = process.env.JWT_REFRESH_EXPIRY || '30d';
        this.bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        
        // ✅ التحقق من وجود المفتاح (دون عرضه)
        if (!this.secret || this.secret === 'your_super_secret_jwt_key_change_this_in_production') {
            if (process.env.NODE_ENV === 'production') {
                throw new Error('❌ JWT_SECRET must be set in production');
            }
            logger.warn('⚠️ Using default JWT secret - NOT SECURE FOR PRODUCTION');
            // ✅ في التطوير، نولد مفتاح مؤقت
            if (process.env.NODE_ENV !== 'production') {
                this.secret = crypto.randomBytes(32).toString('hex');
                logger.info('🔑 Generated temporary JWT secret for development');
            }
        }
    }

    // ============================================================
    // 1. توليد التوكنات
    // ============================================================

    generateToken(userId, role, permissions = []) {
        try {
            const payload = {
                userId,
                role,
                permissions,
                iat: Math.floor(Date.now() / 1000)
            };

            const token = jwt.sign(payload, this.secret, {
                expiresIn: this.expiry,
                algorithm: 'HS256'
            });

            const refreshToken = jwt.sign(
                { userId, type: 'refresh' },
                this.secret,
                { expiresIn: this.refreshExpiry }
            );

            return {
                token,
                refreshToken,
                expiresIn: this.expiry,
                refreshExpiresIn: this.refreshExpiry
            };

        } catch (error) {
            logger.error('❌ Token generation failed:', error.message);
            throw new Error('Failed to generate tokens');
        }
    }

    // ============================================================
    // 2. التحقق من التوكن
    // ============================================================

    verifyToken(token) {
        try {
            const decoded = jwt.verify(token, this.secret);
            return { valid: true, data: decoded };
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                logger.warn('⚠️ Token expired');
                return { valid: false, error: 'Token expired' };
            }
            if (error.name === 'JsonWebTokenError') {
                logger.warn('⚠️ Invalid token');
                return { valid: false, error: 'Invalid token' };
            }
            logger.error('❌ Token verification error:', error.message);
            return { valid: false, error: 'Token verification failed' };
        }
    }

    // ============================================================
    // 3. تجديد التوكن (Refresh)
    // ============================================================

    refreshToken(refreshToken) {
        try {
            const decoded = jwt.verify(refreshToken, this.secret);
            
            if (decoded.type !== 'refresh') {
                throw new Error('Invalid refresh token type');
            }

            // توليد توكن جديد
            return this.generateToken(decoded.userId, decoded.role, decoded.permissions);
            
        } catch (error) {
            logger.error('❌ Refresh token failed:', error.message);
            throw new Error('Invalid refresh token');
        }
    }

    // ============================================================
    // 4. Middleware - المصادقة
    // ============================================================

    authenticate(req, res, next) {
        // ✅ قراءة التوكن من Header
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'No authorization header provided'
            });
        }

        if (!authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid authorization header format'
            });
        }

        const token = authHeader.split(' ')[1];
        const result = this.verifyToken(token);

        if (!result.valid) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: result.error || 'Invalid token'
            });
        }

        // ✅ حفظ بيانات المستخدم في الطلب
        req.user = result.data;
        req.userId = result.data.userId;
        
        // ✅ تسجيل الوصول (بدون بيانات حساسة)
        logger.debug(`🔐 User ${req.userId} authenticated`);

        next();
    }

    // ============================================================
    // 5. Middleware - الصلاحيات (RBAC)
    // ============================================================

    checkPermission(requiredPermission) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'User not authenticated'
                });
            }

            // ✅ Admin لديه جميع الصلاحيات
            if (req.user.role === 'admin') {
                return next();
            }

            const userPermissions = req.user.permissions || [];
            
            // ✅ التحقق من الصلاحية
            if (!userPermissions.includes(requiredPermission) && 
                !userPermissions.includes('*')) {
                
                logger.warn(`⛔ Permission denied: ${req.user.userId} -> ${requiredPermission}`);
                
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Insufficient permissions',
                    required: requiredPermission,
                    userRole: req.user.role
                });
            }

            next();
        };
    }

    // ============================================================
    // 6. Middleware - التحقق من الدور
    // ============================================================

    requireRole(allowedRoles) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'User not authenticated'
                });
            }

            if (!allowedRoles.includes(req.user.role)) {
                logger.warn(`⛔ Role denied: ${req.user.role} -> ${allowedRoles.join(', ')}`);
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Role does not have access',
                    requiredRoles: allowedRoles,
                    userRole: req.user.role
                });
            }

            next();
        };
    }

    // ============================================================
    // 7. دوال مساعدة للتشفير
    // ============================================================

    // ✅ تشفير كلمة المرور
    async hashPassword(password) {
        try {
            const salt = await bcrypt.genSalt(this.bcryptRounds);
            return await bcrypt.hash(password, salt);
        } catch (error) {
            logger.error('❌ Password hashing failed:', error.message);
            throw new Error('Failed to hash password');
        }
    }

    // ✅ مقارنة كلمة المرور
    async comparePassword(password, hash) {
        try {
            return await bcrypt.compare(password, hash);
        } catch (error) {
            logger.error('❌ Password comparison failed:', error.message);
            return false;
        }
    }

    // ✅ توليد مفتاح API آمن
    generateApiKey() {
        const key = crypto.randomBytes(32).toString('hex');
        const hashed = this.hashApiKey(key);
        return { key, hashed };
    }

    hashApiKey(apiKey) {
        return crypto.createHash('sha256').update(apiKey).digest('hex');
    }

    // ✅ التحقق من قوة كلمة المرور
    validatePasswordStrength(password) {
        const errors = [];
        
        if (password.length < 8) {
            errors.push('كلمة المرور قصيرة جداً (أقل من 8 أحرف)');
        }
        if (!/[A-Z]/.test(password)) {
            errors.push('يجب أن تحتوي على حرف كبير واحد على الأقل');
        }
        if (!/[a-z]/.test(password)) {
            errors.push('يجب أن تحتوي على حرف صغير واحد على الأقل');
        }
        if (!/[0-9]/.test(password)) {
            errors.push('يجب أن تحتوي على رقم واحد على الأقل');
        }
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            errors.push('يجب أن تحتوي على رمز خاص واحد على الأقل');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    // ============================================================
    // 8. حماية ضد هجمات Brute Force
    // ============================================================

    // ✅ تسجيل محاولة فاشلة
    async recordFailedAttempt(userId) {
        // يمكن تخزين في Redis
        const key = `failed_attempts:${userId}`;
        const attempts = await redis.get(key) || 0;
        const newAttempts = parseInt(attempts) + 1;
        
        await redis.setex(key, 3600, newAttempts); // ساعة واحدة
        
        if (newAttempts >= 5) {
            await redis.setex(`locked:${userId}`, 900, 'true'); // 15 دقيقة
            logger.warn(`🔒 User ${userId} locked due to failed attempts`);
            return { locked: true, attempts: newAttempts };
        }
        
        return { locked: false, attempts: newAttempts };
    }

    // ✅ التحقق من القفل
    async isLocked(userId) {
        const locked = await redis.get(`locked:${userId}`);
        return locked === 'true';
    }

    // ✅ إعادة تعيين المحاولات الفاشلة
    async resetFailedAttempts(userId) {
        await redis.del(`failed_attempts:${userId}`);
        await redis.del(`locked:${userId}`);
    }

    // ============================================================
    // 9. تسجيل الخروج
    // ============================================================

    // ✅ إبطال التوكن (Blacklist)
    async invalidateToken(token) {
        // تخزين التوكن في القائمة السوداء حتى انتهاء صلاحيته
        const decoded = this.verifyToken(token);
        if (decoded.valid) {
            const expiry = decoded.data.exp - Math.floor(Date.now() / 1000);
            if (expiry > 0) {
                await redis.setex(`blacklist:${token}`, expiry, 'true');
                logger.info(`🔒 Token invalidated`);
                return true;
            }
        }
        return false;
    }

    // ✅ التحقق من التوكن في القائمة السوداء
    async isTokenBlacklisted(token) {
        const blacklisted = await redis.get(`blacklist:${token}`);
        return blacklisted === 'true';
    }

    // ✅ تسجيل الخروج الكامل
    async logout(userId, token) {
        await this.invalidateToken(token);
        await this.resetFailedAttempts(userId);
        logger.info(`👋 User ${userId} logged out`);
        return true;
    }
}

// ============================================================
// 10. تصدير الموديول
// ============================================================

module.exports = new AuthMiddleware();
