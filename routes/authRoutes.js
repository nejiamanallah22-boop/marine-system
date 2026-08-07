// ============================================================
// 🔐 AUTH ROUTES - مع دعم كامل للأمان
// ============================================================

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { logger } = require('../utils/logger');
const AuthMiddleware = require('../middleware/auth');
const DatabaseManager = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// ============================================================
// 1. تسجيل مستخدم جديد
// ============================================================

router.post('/register', [
    body('username').isLength({ min: 3 }).trim().escape(),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('role').optional().isIn(['admin', 'manager', 'operator', 'viewer'])
], async (req, res) => {
    try {
        // التحقق من صحة المدخلات
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                errors: errors.array()
            });
        }

        const { username, email, password, role = 'viewer' } = req.body;

        // ✅ التحقق من قوة كلمة المرور
        const passwordCheck = AuthMiddleware.validatePasswordStrength(password);
        if (!passwordCheck.valid) {
            return res.status(400).json({
                error: 'Password too weak',
                suggestions: passwordCheck.errors
            });
        }

        // ✅ التحقق من عدم وجود المستخدم
        const existingUser = await DatabaseManager.findOne('User', {
            $or: [{ username }, { email }]
        });

        if (existingUser) {
            return res.status(409).json({
                error: 'User already exists',
                message: 'Username or email already registered'
            });
        }

        // ✅ إنشاء المستخدم
        const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const passwordHash = await AuthMiddleware.hashPassword(password);
        
        const user = await DatabaseManager.create('User', {
            userId,
            username,
            email,
            passwordHash,
            salt: '', // يمكن إضافة salt منفصل
            role,
            permissions: [],
            preferences: {
                language: 'ar',
                theme: 'dark'
            },
            createdAt: new Date()
        });

        // ✅ تسجيل الحدث
        logger.security('USER_REGISTER', userId, { 
            email, 
            role,
            ip: req.ip 
        });

        // ✅ توليد التوكن
        const tokens = AuthMiddleware.generateToken(userId, role, user.permissions || []);

        // ✅ إزالة البيانات الحساسة
        delete user.passwordHash;
        delete user.salt;

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            user,
            tokens
        });

    } catch (error) {
        logger.error('❌ Registration error:', error);
        res.status(500).json({
            error: 'Registration failed',
            message: error.message
        });
    }
});

// ============================================================
// 2. تسجيل الدخول
// ============================================================

router.post('/login', [
    body('username').trim().escape(),
    body('password').notEmpty()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                errors: errors.array()
            });
        }

        const { username, password } = req.body;

        // ✅ البحث عن المستخدم
        const user = await DatabaseManager.findOne('User', { username });
        if (!user) {
            logger.warn(`⚠️ Failed login attempt: ${username}`);
            return res.status(401).json({
                error: 'Invalid credentials',
                message: 'Username or password incorrect'
            });
        }

        // ✅ التحقق من القفل
        const isLocked = await AuthMiddleware.isLocked(user.userId);
        if (isLocked) {
            return res.status(423).json({
                error: 'Account locked',
                message: 'Too many failed attempts. Please try again later.'
            });
        }

        // ✅ مقارنة كلمة المرور
        const isMatch = await AuthMiddleware.comparePassword(password, user.passwordHash);
        if (!isMatch) {
            // ✅ تسجيل المحاولة الفاشلة
            const attempt = await AuthMiddleware.recordFailedAttempt(user.userId);
            logger.warn(`⚠️ Failed password attempt for ${username} (${attempt.attempts}/5)`);
            
            if (attempt.locked) {
                return res.status(423).json({
                    error: 'Account locked',
                    message: 'Too many failed attempts. Account locked for 15 minutes.'
                });
            }

            return res.status(401).json({
                error: 'Invalid credentials',
                message: 'Username or password incorrect',
                remainingAttempts: 5 - attempt.attempts
            });
        }

        // ✅ إعادة تعيين محاولات الفشل
        await AuthMiddleware.resetFailedAttempts(user.userId);

        // ✅ تحديث آخر تسجيل دخول
        await DatabaseManager.update('User', { userId: user.userId }, {
            lastLogin: new Date(),
            lastIP: req.ip
        });

        // ✅ توليد التوكن
        const tokens = AuthMiddleware.generateToken(user.userId, user.role, user.permissions || []);

        // ✅ تسجيل الحدث
        logger.security('USER_LOGIN', user.userId, {
            username,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        // ✅ إزالة البيانات الحساسة
        delete user.passwordHash;
        delete user.salt;

        res.json({
            success: true,
            message: 'Login successful',
            user,
            tokens
        });

    } catch (error) {
        logger.error('❌ Login error:', error);
        res.status(500).json({
            error: 'Login failed',
            message: error.message
        });
    }
});

// ============================================================
// 3. تجديد التوكن (Refresh Token)
// ============================================================

router.post('/refresh', [
    body('refreshToken').notEmpty()
], async (req, res) => {
    try {
        const { refreshToken } = req.body;

        // ✅ تجديد التوكن
        const newTokens = AuthMiddleware.refreshToken(refreshToken);

        // ✅ تسجيل الحدث
        logger.security('TOKEN_REFRESH', 'unknown', {
            ip: req.ip
        });

        res.json({
            success: true,
            tokens: newTokens
        });

    } catch (error) {
        logger.error('❌ Token refresh error:', error);
        res.status(401).json({
            error: 'Refresh failed',
            message: 'Invalid or expired refresh token'
        });
    }
});

// ============================================================
// 4. تسجيل الخروج
// ============================================================

router.post('/logout', AuthMiddleware.authenticate, async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        
        // ✅ إبطال التوكن
        await AuthMiddleware.logout(req.userId, token);

        // ✅ تسجيل الحدث
        logger.security('USER_LOGOUT', req.userId, {
            ip: req.ip
        });

        res.json({
            success: true,
            message: 'Logged out successfully'
        });

    } catch (error) {
        logger.error('❌ Logout error:', error);
        res.status(500).json({
            error: 'Logout failed',
            message: error.message
        });
    }
});

// ============================================================
// 5. تغيير كلمة المرور
// ============================================================

router.put('/change-password', AuthMiddleware.authenticate, [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                errors: errors.array()
            });
        }

        const { currentPassword, newPassword } = req.body;
        const userId = req.userId;

        // ✅ جلب المستخدم
        const user = await DatabaseManager.findOne('User', { userId });
        if (!user) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        // ✅ التحقق من كلمة المرور الحالية
        const isMatch = await AuthMiddleware.comparePassword(currentPassword, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({
                error: 'Invalid password',
                message: 'Current password is incorrect'
            });
        }

        // ✅ التحقق من قوة كلمة المرور الجديدة
        const passwordCheck = AuthMiddleware.validatePasswordStrength(newPassword);
        if (!passwordCheck.valid) {
            return res.status(400).json({
                error: 'Password too weak',
                suggestions: passwordCheck.errors
            });
        }

        // ✅ تحديث كلمة المرور
        const newHash = await AuthMiddleware.hashPassword(newPassword);
        await DatabaseManager.update('User', { userId }, {
            passwordHash: newHash,
            updatedAt: new Date()
        });

        // ✅ تسجيل الحدث
        logger.security('PASSWORD_CHANGE', userId, {
            ip: req.ip
        });

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        logger.error('❌ Password change error:', error);
        res.status(500).json({
            error: 'Password change failed',
            message: error.message
        });
    }
});

// ============================================================
// 6. الحصول على معلومات المستخدم
// ============================================================

router.get('/me', AuthMiddleware.authenticate, async (req, res) => {
    try {
        const user = await DatabaseManager.findOne('User', { userId: req.userId });
        if (!user) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        // ✅ إزالة البيانات الحساسة
        delete user.passwordHash;
        delete user.salt;

        res.json({
            success: true,
            user
        });

    } catch (error) {
        logger.error('❌ Get user error:', error);
        res.status(500).json({
            error: 'Failed to get user info',
            message: error.message
        });
    }
});

// ============================================================
// 7. تحديث تفضيلات المستخدم
// ============================================================

router.put('/preferences', AuthMiddleware.authenticate, [
    body('preferences').isObject()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                errors: errors.array()
            });
        }

        const { preferences } = req.body;
        const userId = req.userId;

        // ✅ تحديث التفضيلات
        await DatabaseManager.update('User', { userId }, {
            preferences,
            updatedAt: new Date()
        });

        // ✅ تسجيل الحدث
        logger.security('PREFERENCES_UPDATE', userId, {
            ip: req.ip
        });

        res.json({
            success: true,
            message: 'Preferences updated successfully'
        });

    } catch (error) {
        logger.error('❌ Update preferences error:', error);
        res.status(500).json({
            error: 'Update failed',
            message: error.message
        });
    }
});

// ============================================================
// 8. طلب إعادة تعيين كلمة المرور
// ============================================================

router.post('/forgot-password', [
    body('email').isEmail().normalizeEmail()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                errors: errors.array()
            });
        }

        const { email } = req.body;

        // ✅ البحث عن المستخدم
        const user = await DatabaseManager.findOne('User', { email });
        if (!user) {
            // ✅ لا نكشف إذا كان المستخدم موجوداً للأمان
            return res.json({
                success: true,
                message: 'If an account exists, a reset link has been sent'
            });
        }

        // ✅ توليد رمز إعادة التعيين
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = AuthMiddleware.hashApiKey(resetToken);
        const resetExpiry = new Date(Date.now() + 3600000); // ساعة واحدة

        // ✅ حفظ رمز إعادة التعيين
        await DatabaseManager.update('User', { userId: user.userId }, {
            resetToken: resetTokenHash,
            resetExpiry: resetExpiry,
            updatedAt: new Date()
        });

        // ✅ إرسال إيميل إعادة التعيين
        const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;
        
        // ✅ تسجيل الحدث (دون عرض الرمز)
        logger.security('PASSWORD_RESET_REQUEST', user.userId, {
            email,
            ip: req.ip
        });

        // ✅ إرسال الإيميل
        await EmailService.sendPasswordResetEmail(email, resetToken);

        res.json({
            success: true,
            message: 'If an account exists, a reset link has been sent'
        });

    } catch (error) {
        logger.error('❌ Forgot password error:', error);
        res.status(500).json({
            error: 'Request failed',
            message: 'Unable to process request'
        });
    }
});

// ============================================================
// 9. إعادة تعيين كلمة المرور
// ============================================================

router.post('/reset-password', [
    body('token').notEmpty(),
    body('newPassword').isLength({ min: 8 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                errors: errors.array()
            });
        }

        const { token, newPassword } = req.body;

        // ✅ التحقق من قوة كلمة المرور
        const passwordCheck = AuthMiddleware.validatePasswordStrength(newPassword);
        if (!passwordCheck.valid) {
            return res.status(400).json({
                error: 'Password too weak',
                suggestions: passwordCheck.errors
            });
        }

        // ✅ البحث عن المستخدم بالرمز
        const tokenHash = AuthMiddleware.hashApiKey(token);
        const user = await DatabaseManager.findOne('User', {
            resetToken: tokenHash,
            resetExpiry: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({
                error: 'Invalid token',
                message: 'Reset token is invalid or expired'
            });
        }

        // ✅ تحديث كلمة المرور
        const newHash = await AuthMiddleware.hashPassword(newPassword);
        await DatabaseManager.update('User', { userId: user.userId }, {
            passwordHash: newHash,
            resetToken: null,
            resetExpiry: null,
            updatedAt: new Date()
        });

        // ✅ تسجيل الحدث
        logger.security('PASSWORD_RESET_COMPLETE', user.userId, {
            ip: req.ip
        });

        res.json({
            success: true,
            message: 'Password reset successfully'
        });

    } catch (error) {
        logger.error('❌ Reset password error:', error);
        res.status(500).json({
            error: 'Reset failed',
            message: 'Unable to reset password'
        });
    }
});

// ============================================================
// 10. التحقق من صلاحية التوكن
// ============================================================

router.get('/verify', AuthMiddleware.authenticate, async (req, res) => {
    res.json({
        success: true,
        message: 'Token is valid',
        user: {
            userId: req.userId,
            role: req.user.role,
            permissions: req.user.permissions || []
        }
    });
});

// ============================================================
// تصدير الراوتر
// ============================================================

module.exports = router;
