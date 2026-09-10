// middleware/audit.js
// ============================================================
// Audit Logging - تسجيل كل حدث أمني
// ============================================================

const db = require('../config/db');

async function logAuditEvent({
    userId = null,
    action,
    resource = null,
    resourceId = null,
    ip = null,
    userAgent = null,
    success = true,
    details = null
}) {
    try {
        await db.execute(
            `INSERT INTO audit_logs
            (user_id, action, resource, resource_id, ip_address, user_agent, success, details, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                userId,
                action,
                resource,
                resourceId,
                ip,
                userAgent ? userAgent.substring(0, 500) : null,
                success ? 1 : 0,
                details ? JSON.stringify(details).substring(0, 2000) : null
            ]
        );
    } catch (err) {
        // لا نكسر التطبيق لو فشل التسجيل
        console.error('⚠️ Audit log failed:', err.message);
    }
}

// ✅ Middleware يسجل كل طلب
function auditMiddleware(action, resource = null) {
    return async (req, res, next) => {
        // ننتظر انتهاء الرد لمعرفة النتيجة
        const originalJson = res.json.bind(res);
        res.json = function(data) {
            const success = res.statusCode >= 200 && res.statusCode < 300;
            logAuditEvent({
                userId: req.user?.id || null,
                action,
                resource,
                resourceId: req.params?.id || null,
                ip: req.ip,
                userAgent: req.get('user-agent'),
                success,
                details: success ? null : { error: data?.error }
            });
            return originalJson(data);
        };
        next();
    };
}

module.exports = { logAuditEvent, auditMiddleware };
