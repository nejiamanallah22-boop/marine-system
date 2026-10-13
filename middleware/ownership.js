// ═══════════════════════════════════════════════════════════
// 🎯 OWNERSHIP CHECK MIDDLEWARE — ضد IDOR
// 📌 يتحقق أن العنصر في إقليم المستخدم
// ═══════════════════════════════════════════════════════════

'use strict';

/**
 * ينشئ middleware يتحقق من إقليم العنصر
 * 
 * @param {Model} Model - نموذج Mongoose (Vessel, Maintenance, Note...)
 * @param {Object} options - الخيارات
 * @param {String} options.regionField - اسم حقل الإقليم (افتراضي: 'region')
 * @param {Boolean} options.allowAdmin - admin يتجاوز الفحص (افتراضي: true)
 * @param {String} options.paramName - اسم البارامتر في URL (افتراضي: 'id')
 * @param {String} options.itemKey - المفتاح الذي يُحفظ فيه العنصر في req (افتراضي: 'item')
 * @param {String} options.modelName - اسم النموذج للتسجيل
 * @param {Function} options.getRegion - دالة مخصصة لاستخراج الإقليم (للـ Maintenance)
 * 
 * @returns {Function} Express middleware
 */
module.exports = function createOwnershipCheck(Model, options = {}) {
    const {
        regionField = 'region',
        allowAdmin = true,
        paramName = 'id',
        itemKey = 'item',
        modelName = null,
        getRegion = null
    } = options;
    
    const ModelName = modelName || (Model && Model.modelName) || 'Unknown';
    
    return async function ownershipCheck(req, res, next) {
        try {
            // ═══════════════════════════════════════════════════════
            // 1️⃣ التحقق من وجود المستخدم
            // ═══════════════════════════════════════════════════════
            if (!req.user) {
                return res.status(401).json({ 
                    success: false, 
                    error: 'غير مصرح',
                    code: 'NO_USER'
                });
            }
            
            const user = req.user;
            
            // ═══════════════════════════════════════════════════════
            // 2️⃣ الحصول على الدور
            // ═══════════════════════════════════════════════════════
            const role = (typeof global.normalizeRole === 'function') 
                ? global.normalizeRole(user.role) 
                : (user.role || 'viewer');
            
            // ═══════════════════════════════════════════════════════
            // 3️⃣ بناء الاستعلام
            // ═══════════════════════════════════════════════════════
            const q = (typeof global.buildIdQuery === 'function') 
                ? global.buildIdQuery(req.params[paramName])
                : (req.params[paramName] ? { _id: req.params[paramName] } : null);
            
            if (!q) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'معرّف غير صالح',
                    code: 'INVALID_ID'
                });
            }
            
            // ═══════════════════════════════════════════════════════
            // 4️⃣ جلب العنصر
            // ═══════════════════════════════════════════════════════
            const item = await Model.findOne(q);
            if (!item) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'غير موجود',
                    code: 'NOT_FOUND'
                });
            }
            
            // ═══════════════════════════════════════════════════════
            // 5️⃣ admin يتجاوز الفحص
            // ═══════════════════════════════════════════════════════
            if (allowAdmin && role === 'admin') {
                req[itemKey] = item;
                return next();
            }
            
            // ═══════════════════════════════════════════════════════
            // 6️⃣ استخراج إقليم العنصر
            // ═══════════════════════════════════════════════════════
            let itemRegion = null;
            
            if (typeof getRegion === 'function') {
                try {
                    itemRegion = await getRegion(item, req);
                } catch (e) {
                    console.warn('⚠️ getRegion failed:', e.message);
                }
            } else if (regionField) {
                itemRegion = item[regionField];
            }
            
            // ═══════════════════════════════════════════════════════
            // 7️⃣ فحص الإقليم
            // ═══════════════════════════════════════════════════════
            if (user.region && itemRegion && itemRegion !== user.region) {
                // 🚨 محاولة IDOR!
                if (typeof global.addSystemLog === 'function') {
                    try {
                        await global.addSystemLog({
                            userId: user.id,
                            userName: user.name,
                            action: 'security',
                            resource: 'idor_attempt',
                            status: 'critical',
                            ip: req.ip,
                            requestId: req.requestId,
                            details: {
                                model: ModelName,
                                itemId: item._id?.toString() || item.id,
                                itemName: item.name || item.vesselName || '—',
                                userRegion: user.region,
                                itemRegion: itemRegion,
                                path: req.path,
                                method: req.method
                            }
                        });
                    } catch (e) {
                        console.warn('⚠️ addSystemLog failed:', e.message);
                    }
                }
                
                return res.status(403).json({
                    success: false,
                    error: 'غير مصرح بالوصول لهذا العنصر',
                    code: 'IDOR_BLOCKED'
                });
            }
            
            // ═══════════════════════════════════════════════════════
            // 8️⃣ ✅ نجح الفحص
            // ═══════════════════════════════════════════════════════
            req[itemKey] = item;
            next();
            
        } catch (e) {
            console.error('❌ ownershipCheck error:', e.message);
            res.status(500).json({ 
                success: false, 
                error: 'خطأ في السيرفر' 
            });
        }
    };
};
