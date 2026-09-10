// middleware/csrf.js
// ============================================================
// CSRF Protection - من جهة الخادم، ليس من المتصفح
// ============================================================

const crypto = require('crypto');
const security = require('../config/security');

// ✅ توليد توكن CSRF حقيقي عشوائي (لا Math.random)
function generateCsrfToken() {
    return crypto.randomBytes(32).toString('hex');
}

// ✅ تخزين التوكنات مؤقتًا (في Redis في الإنتاج)
// هنا نستخدم Map في الذاكرة للبساطة
const csrfStore = new Map();

// ✅ إصدار توكن CSRF جديد وربطه بالجلسة
function issueCsrfToken(sessionId, res) {
    const token = generateCsrfToken();
    csrfStore.set(sessionId, {
        token,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 ساعة
    });

    // ✅ نرسله في كوكي غير HttpOnly ليتمكن الـ JS من قراءته
    res.cookie(security.cookie.csrfName, token, security.cookie.csrfOptions);
    return token;
}

// ✅ التحقق من توكن CSRF
function verifyCsrfToken(req, res, next) {
    // لا نتحقق من CSRF في الطلبات الآمنة
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    // ✅ نستخرج التوكن من الهيدر أو الجسم
    const clientToken =
        req.headers['x-csrf-token'] ||
        req.body?.csrf_token ||
        req.cookies?.[security.cookie.csrfName];

    if (!clientToken) {
        return res.status(403).json({ error: 'توكن CSRF مفقود' });
    }

    // ✅ نبحث في الخادم عن التوكن المرتبط بالجلسة
    const sessionId = req.cookies?.[security.cookie.refreshName]
        ? 'session:' + req.cookies[security.cookie.refreshName].substring(0, 32)
        : 'ip:' + req.ip;

    const stored = csrfStore.get(sessionId);

    if (!stored) {
        return res.status(403).json({ error: 'جلسة CSRF غير صالحة' });
    }

    if (Date.now() > stored.expiresAt) {
        csrfStore.delete(sessionId);
        return res.status(403).json({ error: 'توكن CSRF منتهي' });
    }

    // ✅ مقارنة زمن ثابت (منع timing attacks)
    if (!crypto.timingSafeEqual(
        Buffer.from(clientToken, 'hex'),
        Buffer.from(stored.token, 'hex')
    )) {
        return res.status(403).json({ error: 'توكن CSRF غير صالح' });
    }

    // ✅ تجديد التوكن بعد كل استخدام (Rotation)
    issueCsrfToken(sessionId, res);
    next();
}

// ✅ تنظيف دوري للتوكنات المنتهية
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of csrfStore.entries()) {
        if (now > value.expiresAt) csrfStore.delete(key);
    }
}, 60 * 60 * 1000);

module.exports = { issueCsrfToken, verifyCsrfToken, generateCsrfToken };
