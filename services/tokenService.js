// services/tokenService.js
// ============================================================
// JWT Access + Refresh Token مع Rotation
// ============================================================

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const security = require('../config/security');
const db = require('../config/db');

// ✅ توليد Access Token قصير العمر
function generateAccessToken(user) {
    return jwt.sign(
        {
            sub: user.id,
            username: user.username,
            role: user.role,
            ver: user.token_version || 1
        },
        security.jwt.accessSecret,
        {
            expiresIn: security.jwt.accessExpiry,
            issuer: security.jwt.issuer,
            audience: security.jwt.audience,
            algorithm: 'HS256'
        }
    );
}

// ✅ توليد Refresh Token (عشوائي، ليس JWT — أكثر أمانًا)
function generateRefreshToken() {
    return crypto.randomBytes(48).toString('base64url');
}

// ✅ تخزين الـ Refresh Token مُشفَّرًا في قاعدة البيانات
async function storeRefreshToken(userId, token, ip, userAgent) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.execute(
        `INSERT INTO refresh_tokens
         (user_id, token_hash, ip_address, user_agent, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [userId, tokenHash, ip, userAgent?.substring(0, 500), expiresAt]
    );
}

// ✅ التحقق من Refresh Token
async function verifyRefreshToken(token, ip) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const [rows] = await db.execute(
        `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at,
                u.username, u.name, u.role, u.token_version, u.is_active
         FROM refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
         WHERE rt.token_hash = ?`,
        [tokenHash]
    );

    if (!rows.length) return null;

    const rt = rows[0];

    // ✅ التحقق من الإلغاء والانتهاء
    if (rt.revoked_at) return null;
    if (new Date(rt.expires_at) < new Date()) return null;
    if (!rt.is_active) return null;

    return {
        tokenId: rt.id,
        user: {
            id: rt.user_id,
            username: rt.username,
            name: rt.name,
            role: rt.role,
            token_version: rt.token_version
        }
    };
}

// ✅ إلغاء Refresh Token (عند الاستخدام = Rotation)
async function revokeRefreshToken(tokenId) {
    await db.execute(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?`,
        [tokenId]
    );
}

// ✅ إلغاء كل جلسات المستخدم (عند تغيير كلمة المرور أو تسريب)
async function revokeAllUserTokens(userId) {
    await db.execute(
        `UPDATE refresh_tokens SET revoked_at = NOW()
         WHERE user_id = ? AND revoked_at IS NULL`,
        [userId]
    );
    // ✅ زيادة token_version → إبطال كل Access Tokens
    await db.execute(
        `UPDATE users SET token_version = token_version + 1 WHERE id = ?`,
        [userId]
    );
}

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    storeRefreshToken,
    verifyRefreshToken,
    revokeRefreshToken,
    revokeAllUserTokens
};
