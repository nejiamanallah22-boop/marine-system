// تعريف الصلاحيات
const PERMISSIONS = {
    // إدارة المستخدمين
    USER_READ: 'user:read',
    USER_WRITE: 'user:write',
    USER_DELETE: 'user:delete',
    
    // إدارة المراكب
    VESSEL_READ: 'vessel:read',
    VESSEL_WRITE: 'vessel:write',
    VESSEL_DELETE: 'vessel:delete',
    
    // إدارة الصيانة
    MAINTENANCE_READ: 'maintenance:read',
    MAINTENANCE_WRITE: 'maintenance:write',
    MAINTENANCE_DELETE: 'maintenance:delete',
    
    // التقارير والتحليلات
    REPORT_READ: 'report:read',
    REPORT_GENERATE: 'report:generate',
    
    // AI والتنبؤات
    AI_QUERY: 'ai:query',
    AI_PREDICT: 'ai:predict',
    AI_TRAIN: 'ai:train',
    
    // الإدارة
    ADMIN_ACCESS: 'admin:access',
    AUDIT_READ: 'audit:read'
};

// تعريف الأدوار
const ROLES = {
    admin: {
        name: 'مدير النظام',
        permissions: Object.values(PERMISSIONS)
    },
    manager: {
        name: 'مدير الأسطول',
        permissions: [
            PERMISSIONS.USER_READ,
            PERMISSIONS.VESSEL_READ,
            PERMISSIONS.VESSEL_WRITE,
            PERMISSIONS.MAINTENANCE_READ,
            PERMISSIONS.MAINTENANCE_WRITE,
            PERMISSIONS.REPORT_READ,
            PERMISSIONS.REPORT_GENERATE,
            PERMISSIONS.AI_QUERY,
            PERMISSIONS.AI_PREDICT
        ]
    },
    operator: {
        name: 'مشغل',
        permissions: [
            PERMISSIONS.VESSEL_READ,
            PERMISSIONS.MAINTENANCE_READ,
            PERMISSIONS.MAINTENANCE_WRITE,
            PERMISSIONS.REPORT_READ,
            PERMISSIONS.AI_QUERY
        ]
    },
    viewer: {
        name: 'مستخدم',
        permissions: [
            PERMISSIONS.VESSEL_READ,
            PERMISSIONS.MAINTENANCE_READ,
            PERMISSIONS.REPORT_READ
        ]
    }
};

// Middleware للتحقق من الدور
function requireRole(allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            logger.warn(`Role access denied: ${req.user.role} -> ${allowedRoles.join(', ')}`);
            return res.status(403).json({
                error: 'Forbidden',
                message: 'Role does not have access'
            });
        }

        next();
    };
}

module.exports = {
    PERMISSIONS,
    ROLES,
    requireRole
};
