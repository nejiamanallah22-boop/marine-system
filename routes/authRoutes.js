// routes/auth.js
// ============================================================
// /api/auth/* - نفس أسماء الواجهة الحالية
// ============================================================

const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

const db = require('../config/db');
const security = require('../config/security');
const tokenService = require('../services/tokenService');
const { issueCsrfToken } = require('../middleware/csrf');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter, forgotPasswordLimiter,
        checkAccountLockout, recordFailedAttempt,
        resetFailedAttempts } = require('../middleware/rateLimit');
const { logAuditEvent } = require('../middleware/audit');
const { body, validationResult } = require('express-validator');

// ============================================================
// POST /api/auth/login
// ============================================================
router.post('/login',
    loginLimiter,
    body('username').isString().trim().isLength({ min: 3, max: 50 }),
    body('password').isString().isLength({ min: 6, max: 200 }),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ error: 'بيانات غير صالحة' });
            }

            const { username, password } = req.body;

            // ✅ التحقق من قفل الحساب
            const lockStatus = await checkAccountLockout(username);
            if (lockStatus.locked) {
                await logAuditEvent({
                    action: 'login_locked',
                    resource: 'auth',
                    ip: req.ip,
                    userAgent: req.get('user-agent'),
                    success: false,
                    details: { username }
                });
                return res.status(423).json({
                    error: `الحساب مقفل. حاول بعد ${lockStatus.remainingMinutes} دقيقة`
                });
            }

            // ✅ البحث عن المستخدم
            const [rows] = await db.execute(
                `SELECT id, username, name, role, password_hash,
                        token_version, is_active
                 FROM users WHERE username = ?`,
                [username]
            );

            // ✅ رسالة خطأ موحدة (منع user enumeration)
            const genericError = 'اسم المستخدم أو كلمة المرور غير صحيحة';

            if (!rows.length) {
                await recordFailedAttempt(username);
                await logAuditEvent({
                    action: 'login_failed',
                    resource: 'auth',
                    ip: req.ip,
                    userAgent: req.get('user-agent'),
                    success: false,
                    details: { username, reason: 'user_not_found' }
                });
                return res.status(401).json({ error: genericError });
            }

            const user = rows[0];

            if (!user.is_active) {
                return res.status(401).json({ error: genericError });
            }

            // ✅ مقارنة كلمة المرور
            const passwordOk = await bcrypt.compare(password, user.password_hash);

            if (!passwordOk) {
                await recordFailedAttempt(username);
                await logAuditEvent({
                    userId: user.id,
                    action: 'login_failed',
                    resource: 'auth',
                    ip: req.ip,
                    userAgent: req.get('user-agent'),
                    success: false,
                    details: { reason: 'wrong_password' }
                });
                return res.status(401).json({ error: genericError });
            }

            // ✅ نجح الدخول
            await resetFailedAttempts(username);

            // ✅ توليد التوكنات
            const accessToken = tokenService.generateAccessToken(user);
            const refreshToken = tokenService.generateRefreshToken();
            await tokenService.storeRefreshToken(
                user.id, refreshToken, req.ip, req.get('user-agent')
            );

            // ✅ إصدار CSRF من الخادم
            const sessionId = 'session:' + refreshToken.substring(0, 32);
            issueCsrfToken(sessionId, res);

            // ✅ ضبط الكوكيز HttpOnly
            res.cookie(
                security.cookie.accessName,
                accessToken,
                security.cookie.accessOptions
            );
            res.cookie(
                security.cookie.refreshName,
                refreshToken,
                security.cookie.refreshOptions
            );

            await logAuditEvent({
                userId: user.id,
                action: 'login_success',
                resource: 'auth',
                ip: req.ip,
                userAgent: req.get('user-agent'),
                success: true
            });

            // ✅ نفس شكل الاستجابة الذي تتوقعه الواجهة
            return res.json({
                success: true,
                token: accessToken,
                user: {
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    role: user.role
                }
            });

        } catch (err) {
            console.error('❌ Login error:', err);
            return res.status(500).json({ error: 'خطأ داخلي' });
        }
    }
);

// ============================================================
// GET /api/auth/me
// ============================================================
router.get('/me', requireAuth, async (req, res) => {
    return res.json({
        success: true,
        user: {
            id: req.user.id,
            username: req.user.username,
            name: req.user.name,
            role: req.user.role
        }
    });
});

// ============================================================
// POST /api/auth/logout
// ============================================================
router.post('/logout', async (req, res) => {
    try {
        const refreshToken = req.cookies?.[security.cookie.refreshName];
        if (refreshToken) {
            const crypto = require('crypto');
            const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
            await db.execute(
                `UPDATE refresh_tokens SET revoked_at = NOW()
                 WHERE token_hash = ? AND revoked_at IS NULL`,
                [tokenHash]
            );
        }

        // ✅ مسح الكوكيز
        res.clearCookie(security.cookie.accessName, { path: '/' });
        res.clearCookie(security.cookie.refreshName, { path: '/api/auth/refresh' });
        res.clearCookie(security.cookie.csrfName, { path: '/' });

        return res.json({ success: true });
    } catch (err) {
        console.error('❌ Logout error:', err);
        return res.json({ success: true }); // لا نكسر الواجهة
    }
});

// ===========================================================
