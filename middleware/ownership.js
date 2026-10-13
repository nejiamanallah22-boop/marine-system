// ═══════════════════════════════════════════════════════════
// 🎯 OWNERSHIP CHECK MIDDLEWARE — ضد IDOR
// 📌 يتحقق أن العنصر في إقليم المستخدم
// ═══════════════════════════════════════════════════════════

'use strict';

/**
 * ينشئ middleware يتحقق من إقليم العنصر
 * 
 * @param {Model} Model - نموذج Mongoose (Vessel, Note, ...)
 * @param {Object} options - الخيارات
 * @param {String} options.regionField - اسم حقل الإقليم (افتراضي: 'region')
 * @param {Boolean} options.allowAdmin - admin يتجاوز الفحص (افتراضي: true)
 * @param {String} options.paramName - اسم البارامتر في URL (افتراضي: 'id')
 * @param {String} options.itemKey - المفتاح الذي يُحفظ فيه العنصر في req (افتراضي: 'item')
 * @param {String} options.modelName - اسم النموذج للتسجيل
 * @param {Function} options.getRegion - دالة مخصصة لاستخراج الإقليم
 * 
 * @returns {Function} Express middleware
 */
function createOwnershipCheck(Model, options = {}) {
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
}

/**
 * 🎯 MAINTENANCE OWNERSHIP FACTORY
 * 📌 يتحقق من إقليم الصيانة عبر vesselId → vessel.region
 * 
 * @param {Model} VesselModel - نموذج المركب
 * @returns {Function} Express middleware
 */
function createMaintenanceOwnershipCheck(VesselModel) {
    return async function maintenanceOwnershipCheck(req, res, next) {
        try {
            // 1️⃣ التحقق من المستخدم
            if (!req.user) {
                return res.status(401).json({ success: false, error: 'غير مصرح' });
            }

            const user = req.user;
            const role = (typeof global.normalizeRole === 'function')
                ? global.normalizeRole(user.role)
                : (user.role || 'viewer');

            // 2️⃣ بناء الاستعلام
            const q = (typeof global.buildIdQuery === 'function')
                ? global.buildIdQuery(req.params.id)
                : (req.params.id ? { _id: req.params.id } : null);

            if (!q) {
                return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
            }

            // 3️⃣ جلب نموذج Maintenance
            const MaintenanceModel = req.app.locals.Maintenance;
            if (!MaintenanceModel) {
                console.error('❌ Maintenance model not exposed in app.locals');
                return res.status(500).json({ success: false, error: 'خطأ في الخادم' });
            }

            // 4️⃣ جلب الصيانة
            const item = await MaintenanceModel.findOne(q);
            if (!item) {
                return res.status(404).json({ success: false, error: 'غير موجود' });
            }

            // 5️⃣ admin يتجاوز الفحص
            if (role === 'admin') {
                req.item = item;
                return next();
            }

            // 6️⃣ التحقق من وجود vesselId
            if (!item.vesselId) {
                if (typeof global.addSystemLog === 'function') {
                    try {
                        await global.addSystemLog({
                            userId: user.id,
                            userName: user.name,
                            action: 'security',
                            resource: 'maintenance_no_vessel',
                            status: 'warning',
                            ip: req.ip,
                            details: { maintId: item._id.toString() }
                        });
                    } catch (e) {}
                }
                return res.status(403).json({
                    success: false,
                    error: 'لا يمكن التحقق من الإقليم',
                    code: 'NO_VESSEL_LINK'
                });
            }

            // 7️⃣ جلب المركب المرتبط
            const vq = (typeof global.buildIdQuery === 'function')
                ? global.buildIdQuery(item.vesselId)
                : { _id: item.vesselId };

            if (!vq) {
                return res.status(500).json({ success: false, error: 'خطأ في ربط المركب' });
            }

            const vessel = await VesselModel.findOne(vq);
            if (!vessel) {
                return res.status(404).json({
                    success: false,
                    error: 'المركب المرتبط غير موجود',
                    code: 'VESSEL_NOT_FOUND'
                });
            }

            // 8️⃣ فحص الإقليم
            if (user.region && vessel.region && vessel.region !== user.region) {
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
                                model: 'Maintenance',
                                maintId: item._id.toString(),
                                vesselId: vessel.id,
                                vesselName: vessel.name,
                                userRegion: user.region,
                                vesselRegion: vessel.region,
                                path: req.path,
                                method: req.method
                            }
                        });
                    } catch (e) {}
                }

                return res.status(403).json({
                    success: false,
                    error: 'غير مصرح بالوصول لهذا العنصر',
                    code: 'IDOR_BLOCKED'
                });
            }

            // 9️⃣ ✅ نجح الفحص
            req.item = item;
            next();

        } catch (e) {
            console.error('❌ maintenanceOwnershipCheck error:', e.message);
            res.status(500).json({ success: false, error: 'خطأ في السيرفر' });
        }
    };
}

// ═══════════════════════════════════════════════════════════
// 📤 التصدير
// ═══════════════════════════════════════════════════════════

module.exports = createOwnershipCheck;
module.exports.createMaintenanceOwnershipCheck = createMaintenanceOwnershipCheck;
