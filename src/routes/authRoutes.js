/**
 * 🔐 مسارات المصادقة
 * @module routes/authRoutes
 */

const express = require('express');
const { body } = require('express-validator');
const { login, verifyOTP, logout, getMe } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');
const router = express.Router();

/**
 * @route POST /api/auth/login
 * @desc تسجيل الدخول
 * @access Public
 */
router.post('/login', loginLimiter, [
    body('username').trim().isLength({ min: 3, max: 50 })
        .withMessage('اسم المستخدم يجب أن يكون بين 3 و 50 حرفاً')
        .matches(/^[a-zA-Z0-9_\u0600-\u06FF]+$/)
        .withMessage('اسم المستخدم يحتوي على أحرف غير مسموحة'),
    body('password').isLength({ min: 8 })
        .withMessage('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
], login);

/**
 * @route POST /api/auth/verify-otp
 * @desc التحقق من 2FA
 * @access Public
 */
router.post('/verify-otp', [
    body('transactionId').notEmpty().withMessage('معاملة غير صالحة'),
    body('otp').isLength({ min: 6, max: 6 })
        .withMessage('رمز التحقق يجب أن يكون 6 أرقام')
        .isNumeric()
        .withMessage('رمز التحقق يجب أن يكون أرقاماً فقط')
], verifyOTP);

/**
 * @route POST /api/auth/logout
 * @desc تسجيل الخروج
 * @access Private
 */
router.post('/logout', authenticate, logout);

/**
 * @route GET /api/auth/me
 * @desc الحصول على معلومات المستخدم الحالي
 * @access Private
 */
router.get('/me', authenticate, getMe);

/**
 * @route POST /api/auth/refresh
 * @desc تجديد التوكن
 * @access Public (مع Refresh Token)
 */
router.post('/refresh', [
    body('refreshToken').notEmpty().withMessage('Refresh Token مطلوب')
], async (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        // التحقق من Refresh Token
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        
        // البحث عن الجلسة
        const session = await Session.findOne({ refreshToken, isActive: true });
        if (!session || !session.isValid()) {
            return res.status(401).json({
                success: false,
                error: 'جلسة غير صالحة'
            });
        }
        
        // إنشاء توكن جديد
        const user = await User.findOne({ id: decoded.userId });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'مستخدم غير موجود'
            });
        }
        
        const newToken = jwt.sign(
            { userId: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRY || '15m' }
        );
        
        // تحديث الجلسة
        session.token = newToken;
        session.lastActivity = new Date();
        await session.save();
        
        // تحديث الكوكي
        res.cookie('session_token', newToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000
        });
        
        res.json({
            success: true,
            token: newToken
        });
        
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Refresh Token منتهي، يرجى تسجيل الدخول مجدداً'
            });
        }
        console.error('❌ خطأ في تجديد التوكن:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في تجديد التوكن'
        });
    }
});

module.exports = router;
