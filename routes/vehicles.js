// ============================================================
// 🚛 routes/vehicles.js — v9.0
// + 🆕 الصور (Cloudinary) + 🆕 الطرح
// ✅ إصلاح: التحقق من المنطقة (zones validation)
// ✅ إصلاح: تحميل VEHICLE_ZONES_ALL
// ✨ جودة صور عالية (thumbUrl, mediumUrl, largeUrl)
// ============================================================

'use strict';

const path = require('path');

module.exports = function registerVehicleRoutes(app, deps) {
    const {
        Vehicle,
        authenticateAccessToken,
        csrfProtection,
        requirePermission,
        randomId,
        addSystemLog,
        notify,
        buildIdQuery
    } = deps || {};

    if (!Vehicle) {
        console.warn('⚠️ [VEHICLES] Vehicle model not loaded');
        return;
    }

    // 🆕 Multer (Memory Storage)
    let upload = null;
    try {
        upload = require('../middleware/uploadVehicleImages');
    } catch (e) {
        console.warn('⚠️ [VEHICLES] Upload middleware not found, images disabled');
    }

    // ☁️ Cloudinary Setup
    let cloudinary = null;
    try {
        cloudinary = require('cloudinary').v2;
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key:    process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
            secure: true
        });
        if (process.env.CLOUDINARY_CLOUD_NAME) {
            console.log('☁️ [VEHICLES] Cloudinary configured');
        } else {
            console.warn('⚠️ [VEHICLES] Cloudinary env vars missing');
        }
    } catch (e) {
        console.warn('⚠️ [VEHICLES] Cloudinary not installed:', e.message);
    }

    console.log('✅ [VEHICLES] Registering vehicles routes...');

    // ═══════════════════════════════════════════════════════════
    // 📋 تحميل قوائم المناطق من Model
    // ═══════════════════════════════════════════════════════════
    let VEHICLE_ZONES = {};
    let VEHICLE_ZONES_ALL = [];
    try {
        const vmod = require('../models/Vehicle');
        VEHICLE_ZONES = vmod.VEHICLE_ZONES || {};
        VEHICLE_ZONES_ALL = Array.isArray(vmod.VEHICLE_ZONES_ALL)
            ? vmod.VEHICLE_ZONES_ALL
            : [];
        console.log(
            '✅ [VEHICLES] Loaded zones for',
            Object.keys(VEHICLE_ZONES).length,
            'regions |',
            VEHICLE_ZONES_ALL.length,
            'total zones'
        );
    } catch (e) {
        console.error('⚠️ [VEHICLES] Could not load VEHICLE_ZONES:', e.message);
    }

    const MAX_IMAGES = 10;

    // ═══════════════════════════════════════════════════════════
    // ✅ دالة التحقق من المنطقة (مرنة وآمنة)
    // ═══════════════════════════════════════════════════════════
    /**
     * تتحقق من صحة المنطقة حسب الإقليم
     * @param {string} region - الإقليم / الإدارة
     * @param {string} zone - المنطقة
     * @returns {{ valid: boolean, reason?: string }}
     */
    function validateZone(region, zone) {
        // 1️⃣ إذا كانت المنطقة فارغة → مقبول (للإدارات المركزية)
        if (!zone || !String(zone).trim()) {
            return { valid: true };
        }

        const zoneTrimmed = String(zone).trim();
        const allowedZones = VEHICLE_ZONES[region] || [];

        // 2️⃣ إذا كان الإقليم غير معروف → اسمح (مرونة)
        if (allowedZones.length === 0) {
            return { valid: true };
        }

        // 3️⃣ المنطقة موجودة في قائمة الإقليم → ✅
        if (allowedZones.indexOf(zoneTrimmed) !== -1) {
            return { valid: true };
        }

        // 4️⃣ المنطقة موجودة في القائمة العامة → ✅ (مرونة)
        if (VEHICLE_ZONES_ALL.indexOf(zoneTrimmed) !== -1) {
            return { valid: true };
        }

        // ❌ مرفوض
        return {
            valid: false,
            reason: `المنطقة "${zoneTrimmed}" لا تتبع "${region}"`
        };
    }

    // ═══════════════════════════════════════════════════════════
    // 🎨 formatVehicle — مع روابط صور بجودات متعددة
    // ═══════════════════════════════════════════════════════════
    function formatVehicle(v) {
        if (!v) return null;
        
        const images = Array.isArray(v.images) ? v.images.map(img => {
            const baseUrl = img.url || '';
            
            // ✅ إنشاء روابط بأحجام مختلفة
            let thumbUrl = baseUrl;
            let mediumUrl = baseUrl;
            let largeUrl = baseUrl;
            
            if (baseUrl.includes('cloudinary.com') && baseUrl.includes('/upload/')) {
                // ✅ Thumbnail عالي الجودة (240×240 = 2x من 120)
                thumbUrl = baseUrl.replace(
                    '/upload/',
                    '/upload/w_240,h_240,c_fill,g_auto,q_90,f_auto,dpr_auto,fl_progressive/'
                );
                
                // ✅ Medium للعرض المتوسط (800×800)
                mediumUrl = baseUrl.replace(
                    '/upload/',
                    '/upload/w_800,h_800,c_limit,q_85,f_auto,dpr_auto,fl_progressive/'
                );
                
                // ✅ Large للعرض الكامل (1920×1920)
                largeUrl = baseUrl.replace(
                    '/upload/',
                    '/upload/w_1920,h_1920,c_limit,q_auto:best,f_auto,fl_progressive/'
                );
            }
            
            return {
                _id: img._id ? img._id.toString() : null,
                filename: img.filename || '',
                originalName: img.originalName || '',
                url: baseUrl,
                thumbUrl: thumbUrl,        // ✅ جديد
                mediumUrl: mediumUrl,      // ✅ جديد
                largeUrl: largeUrl,        // ✅ جديد
                cloudinaryId: img.cloudinaryId || '',
                size: img.size || 0,
                mimetype: img.mimetype || '',
                caption: img.caption || '',
                isPrimary: !!img.isPrimary,
                source: img.source || 'upload',
                uploadedAt: img.uploadedAt || null,
                uploadedBy: img.uploadedBy || 'system'
            };
        }) : [];

        const primary = images.find(i => i.isPrimary) || images[0] || null;

        return {
            id: v.id,
            _id: v._id ? v._id.toString() : null,
            name: v.name || '',
            plateNumber: v.plateNumber || '',
            type: v.type || 'سيارة',
            brand: v.brand || '',
            model: v.model || '',
            year: v.year || null,
            color: v.color || '',
            region: v.region || '',
            zone: v.zone || '',
            status: v.status || 'صالحة',
            workCondition: v.workCondition || 'جديدة',
            appointmentDate: v.appointmentDate || null,
            faultDate: v.faultDate || null,
            notes: v.notes || '',

            // 🆕 الطرح
            disposalDate:     v.disposalDate || null,
            disposalReason:   v.disposalReason || '',
            disposalDecision: v.disposalDecision || '',
            disposedBy:       v.disposedBy || '',
            disposalNotes:    v.disposalNotes || '',
            disposedAt:       v.disposedAt || null,

            // 🆕 الصور
            images,
            primaryImage: primary,
            imagesCount: images.length,

            createdAt: v.createdAt,
            updatedAt: v.updatedAt
        };
    }

    // ============================================================
    // 🔍 GET /api/vehicles
    // ============================================================
    app.get('/api/vehicles',
        authenticateAccessToken,
        requirePermission('vessels:read'),
        async (req, res) => {
            try {
                const includeDisposed = req.query.includeDisposed === 'true';
                const query = includeDisposed ? {} : { status: { $ne: 'طرح' } };

                const vehicles = await Vehicle.find(query)
                    .sort({ createdAt: -1 })
                    .limit(2000)
                    .lean();

                res.json(vehicles.map(formatVehicle));
            } catch (e) {
                console.error('❌ [VEHICLES] GET error:', e.message);
                res.status(500).json({ success: false, error: 'فشل تحميل الوسائل' });
            }
        }
    );

    // ============================================================
    // 🔍 GET /api/vehicles/disposed
    // ============================================================
    app.get('/api/vehicles/disposed',
        authenticateAccessToken,
        requirePermission('vessels:read'),
        async (req, res) => {
            try {
                const { q, region, zone, type, brand, decision, from, to } = req.query;
                const query = { status: 'طرح' };
                if (region)   query.region = region;
                if (zone)     query.zone = zone;
                if (type)     query.type = type;
                if (brand)    query.brand = brand;
                if (decision) query.disposalDecision = new RegExp(decision, 'i');
                if (from || to) {
                    query.disposedAt = {};
                    if (from) query.disposedAt.$gte = new Date(from);
                    if (to)   query.disposedAt.$lte = new Date(to);
                }
                if (q) {
                    query.$or = [
                        { plateNumber: new RegExp(q, 'i') },
                        { name:        new RegExp(q, 'i') },
                        { brand:       new RegExp(q, 'i') },
                        { model:       new RegExp(q, 'i') },
                        { disposalReason: new RegExp(q, 'i') },
                        { disposalDecision: new RegExp(q, 'i') }
                    ];
                }

                const vehicles = await Vehicle.find(query)
                    .sort({ disposedAt: -1, createdAt: -1 })
                    .limit(1000)
                    .lean();

                res.json(vehicles.map(formatVehicle));
            } catch (e) {
                console.error('❌ [VEHICLES] GET /disposed error:', e.message);
                res.status(500).json({ success: false, error: 'فشل تحميل المطروحة' });
            }
        }
    );

    // ============================================================
    // 📊 GET /api/vehicles/disposal-stats
    // ============================================================
    app.get('/api/vehicles/disposal-stats',
        authenticateAccessToken,
        requirePermission('vessels:read'),
        async (req, res) => {
            try {
                const [total, disposed, byRegion, byType] = await Promise.all([
                    Vehicle.countDocuments(),
                    Vehicle.countDocuments({ status: 'طرح' }),
                    Vehicle.aggregate([
                        { $match: { status: 'طرح' } },
                        { $group: { _id: '$region', count: { $sum: 1 } } },
                        { $sort: { count: -1 } }
                    ]),
                    Vehicle.aggregate([
                        { $match: { status: 'طرح' } },
                        { $group: { _id: '$type', count: { $sum: 1 } } },
                        { $sort: { count: -1 } }
                    ])
                ]);

                res.json({
                    success: true,
                    total, disposed,
                    active: total - disposed,
                    disposedPercent: total > 0 ? Math.round((disposed / total) * 1000) / 10 : 0,
                    byRegion: byRegion.map(x => ({ region: x._id, count: x.count })),
                    byType:   byType.map(x => ({ type: x._id, count: x.count }))
                });
            } catch (e) {
                console.error('❌ [VEHICLES] stats error:', e.message);
                res.status(500).json({ success: false, error: 'فشل الإحصائيات' });
            }
        }
    );

    // ============================================================
    // 🔍 GET /api/vehicles/config
    // ============================================================
    app.get('/api/vehicles/config',
        authenticateAccessToken,
        (req, res) => {
            try {
                const vmod = require('../models/Vehicle');
                res.json({
                    success: true,
                    types: vmod.VEHICLE_TYPES || [],
                    brands: vmod.VEHICLE_BRANDS || [],
                    colors: vmod.VEHICLE_COLORS || [],
                    regions: vmod.VEHICLE_REGIONS || [],
                    zones: vmod.VEHICLE_ZONES || {},
                    zonesAll: vmod.VEHICLE_ZONES_ALL || [],
                    statuses: vmod.VEHICLE_STATUS || [],
                    conditions: vmod.VEHICLE_CONDITIONS || []
                });
            } catch (e) {
                res.status(500).json({ success: false, error: 'فشل تحميل القوائم' });
            }
        }
    );

    // ============================================================
    // 🔍 GET /api/vehicles/:id
    // ============================================================
    app.get('/api/vehicles/:id',
        authenticateAccessToken,
        requirePermission('vessels:read'),
        async (req, res) => {
            try {
                const q = buildIdQuery(req.params.id);
                if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

                const v = await Vehicle.findOne(q).lean();
                if (!v) return res.status(404).json({ success: false, error: 'الوسيلة غير موجودة' });

                res.json({ success: true, vehicle: formatVehicle(v) });
            } catch (e) {
                console.error('❌ [VEHICLES] GET /:id error:', e.message);
                res.status(500).json({ success: false, error: 'فشل التحميل' });
            }
        }
    );

    // ============================================================
    // ➕ POST /api/vehicles
    // ============================================================
    app.post('/api/vehicles',
        authenticateAccessToken,
        requirePermission('vessels:create'),
        csrfProtection,
        async (req, res) => {
            try {
                const {
                    name, plateNumber, type,
                    brand, model, year, color,
                    region, zone,
                    status, workCondition,
                    appointmentDate, faultDate, notes
                } = req.body;

                // ✅ التحقق الأساسي
                if (typeof plateNumber !== 'string' || !plateNumber.trim())
                    return res.status(400).json({ success: false, error: 'رقم الوسيلة مطلوب' });

                if (typeof region !== 'string' || !region.trim())
                    return res.status(400).json({ success: false, error: 'الإدارة / الإقليم مطلوب' });

                // ⚠️ المنطقة: قد تكون فارغة (للإدارات المركزية)
                const zoneStr = (typeof zone === 'string') ? zone.trim() : '';

                // ✅ التحقق المرن من المنطقة
                const zoneCheck = validateZone(region.trim(), zoneStr);
                if (!zoneCheck.valid) {
                    console.warn('⚠️ [VEHICLES] Zone rejected on POST:',
                        { region, zone, reason: zoneCheck.reason });
                    return res.status(400).json({
                        success: false,
                        error: zoneCheck.reason
                    });
                }

                // ✅ تاريخ العطب
                if (status === 'معطبة' && (!faultDate || !String(faultDate).trim())) {
                    return res.status(400).json({
                        success: false,
                        error: 'تاريخ العطب مطلوب عند الحالة "معطبة"'
                    });
                }

                // ✅ رقم الوسيلة فريد
                const existing = await Vehicle.findOne({ plateNumber: plateNumber.trim() });
                if (existing) {
                    return res.status(400).json({ success: false, error: 'رقم الوسيلة موجود مسبقاً' });
                }

                // ✅ الإنشاء
                const newVehicle = await Vehicle.create({
                    id: randomId(8),
                    name: typeof name === 'string' ? name.trim() : '',
                    plateNumber: plateNumber.trim(),
                    type: type || 'سيارة',
                    brand: typeof brand === 'string' ? brand.trim() : '',
                    model: typeof model === 'string' ? model.trim() : '',
                    year: Number(year) || null,
                    color: typeof color === 'string' ? color.trim() : '',
                    region: region.trim(),
                    zone: zoneStr,               // ← قد تكون فارغة
                    status: status || 'صالحة',
                    workCondition: workCondition || 'جديدة',
                    appointmentDate: appointmentDate || null,
                    faultDate: faultDate || null,
                    notes: typeof notes === 'string' ? notes.trim() : '',
                    images: [],
                    createdBy: req.user.id
                });

                await addSystemLog({
                    userId: req.user.id, userName: req.user.name,
                    action: 'create', resource: 'vehicle',
                    resourceId: newVehicle.id, resourceName: newVehicle.plateNumber,
                    status: 'success', ip: req.ip, requestId: req.requestId
                });

                await notify({
                    type: 'success', category: 'vehicle',
                    title: '🚛 وسيلة برية جديدة',
                    message: 'تم إضافة "' + newVehicle.plateNumber + '" (' + (newVehicle.brand || newVehicle.type) + ')',
                    link: '/pages/vehicles.html', icon: 'truck',
                    actorName: req.user.name || req.user.username
                });

                res.status(201).json({
                    success: true,
                    message: 'تم إضافة الوسيلة بنجاح',
                    vehicle: formatVehicle(newVehicle)
                });
            } catch (e) {
                console.error('❌ [VEHICLES] POST error:', e.message);
                if (e.name === 'ValidationError')
                    return res.status(400).json({ success: false, error: e.message });
                if (e.code === 11000)
                    return res.status(400).json({ success: false, error: 'رقم الوسيلة موجود مسبقاً' });
                res.status(500).json({ success: false, error: 'خطأ في إضافة الوسيلة' });
            }
        }
    );

    // ============================================================
    // ✏️ PUT /api/vehicles/:id
    // ============================================================
    app.put('/api/vehicles/:id',
        authenticateAccessToken,
        requirePermission('vessels:update'),
        csrfProtection,
        async (req, res) => {
            try {
                const q = buildIdQuery(req.params.id);
                if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

                const v = await Vehicle.findOne(q);
                if (!v) return res.status(404).json({ success: false, error: 'الوسيلة غير موجودة' });

                const {
                    name, plateNumber, type,
                    brand, model, year, color,
                    region, zone,
                    status, workCondition,
                    appointmentDate, faultDate, notes
                } = req.body;

                const wasDisposed = v.status === 'طرح';
                if (wasDisposed && status !== undefined && status !== 'طرح') {
                    return res.status(400).json({
                        success: false,
                        error: 'لا يمكن تغيير حالة وسيلة مطروحة عبر التعديل. استخدم "إلغاء الطرح"'
                    });
                }

                // ✅ تحديث الاسم
                if (typeof name === 'string') v.name = name.trim();

                // ✅ تحديث رقم الوسيلة (مع فحص التكرار)
                if (typeof plateNumber === 'string' && plateNumber.trim() && plateNumber.trim() !== v.plateNumber) {
                    const dup = await Vehicle.findOne({
                        plateNumber: plateNumber.trim(),
                        _id: { $ne: v._id }
                    });
                    if (dup) return res.status(400).json({ success: false, error: 'رقم الوسيلة موجود مسبقاً' });
                    v.plateNumber = plateNumber.trim();
                }

                // ✅ حقول بسيطة
                if (type !== undefined) v.type = type;
                if (typeof brand === 'string') v.brand = brand.trim();
                if (typeof model === 'string') v.model = model.trim();
                if (year !== undefined) v.year = Number(year) || null;
                if (typeof color === 'string') v.color = color.trim();

                // ✅ الإقليم والمنطقة (مع التحقق المرن)
                const newRegion = (typeof region === 'string' && region.trim()) ? region.trim() : v.region;
                const newZone = (typeof zone === 'string') ? zone.trim() : v.zone;

                if (region !== undefined || zone !== undefined) {
                    const zoneCheck = validateZone(newRegion, newZone);
                    if (!zoneCheck.valid) {
                        console.warn('⚠️ [VEHICLES] Zone rejected on PUT:',
                            { region: newRegion, zone: newZone, reason: zoneCheck.reason });
                        return res.status(400).json({
                            success: false,
                            error: zoneCheck.reason
                        });
                    }
                }

                if (region !== undefined) v.region = newRegion;
                if (zone !== undefined) v.zone = newZone;
                if (status !== undefined && status !== 'طرح') v.status = status;
                if (workCondition !== undefined) v.workCondition = workCondition;
                if (appointmentDate !== undefined) v.appointmentDate = appointmentDate || null;
                if (faultDate !== undefined) v.faultDate = faultDate || null;

                // ✅ تاريخ العطب
                if (v.status === 'معطبة' && (!v.faultDate || !String(v.faultDate).trim())) {
                    return res.status(400).json({
                        success: false,
                        error: 'تاريخ العطب مطلوب عند الحالة "معطبة"'
                    });
                }

                if (typeof notes === 'string') v.notes = notes.trim();

                v.updatedAt = new Date();
                await v.save();

                await addSystemLog({
                    userId: req.user.id, userName: req.user.name,
                    action: 'update', resource: 'vehicle',
                    resourceId: v.id, resourceName: v.plateNumber,
                    status: 'success', ip: req.ip, requestId: req.requestId
                });

                res.json({
                    success: true,
                    message: 'تم تحديث الوسيلة',
                    vehicle: formatVehicle(v)
                });
            } catch (e) {
                console.error('❌ [VEHICLES] PUT error:', e.message);
                if (e.name === 'ValidationError')
                    return res.status(400).json({ success: false, error: e.message });
                if (e.code === 11000)
                    return res.status(400).json({ success: false, error: 'رقم الوسيلة موجود مسبقاً' });
                res.status(500).json({ success: false, error: 'خطأ في التحديث' });
            }
        }
    );

    // ============================================================
    // 🗑️ DELETE /api/vehicles/:id — يحذف الصور من Cloudinary
    // ============================================================
    app.delete('/api/vehicles/:id',
        authenticateAccessToken,
        requirePermission('vessels:delete'),
        csrfProtection,
        async (req, res) => {
            try {
                const q = buildIdQuery(req.params.id);
                if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

                const v = await Vehicle.findOne(q);
                if (!v) return res.status(404).json({ success: false, error: 'الوسيلة غير موجودة' });

                const plate = v.plateNumber;
                const vid = v.id;

                // ☁️ حذف الصور من Cloudinary
                if (cloudinary && v.images && v.images.length > 0) {
                    for (const img of v.images) {
                        if (img.cloudinaryId) {
                            try {
                                await cloudinary.uploader.destroy(img.cloudinaryId);
                            } catch (err) {
                                console.warn('⚠️ Cloudinary delete:', err.message);
                            }
                        }
                    }
                }

                await Vehicle.deleteOne({ _id: v._id });

                await addSystemLog({
                    userId: req.user.id, userName: req.user.name,
                    action: 'delete', resource: 'vehicle',
                    resourceId: vid, resourceName: plate,
                    status: 'success', ip: req.ip, requestId: req.requestId
                });

                res.json({ success: true, message: 'تم حذف الوسيلة' });
            } catch (e) {
                console.error('❌ [VEHICLES] DELETE error:', e.message);
                res.status(500).json({ success: false, error: 'خطأ في الحذف' });
            }
        }
    );

    // ============================================================
    // ⚫ POST /api/vehicles/:id/dispose
    // ============================================================
    app.post('/api/vehicles/:id/dispose',
        authenticateAccessToken,
        requirePermission('vessels:update'),
        csrfProtection,
        async (req, res) => {
            try {
                const q = buildIdQuery(req.params.id);
                if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

                const v = await Vehicle.findOne(q);
                if (!v) return res.status(404).json({ success: false, error: 'الوسيلة غير موجودة' });

                if (v.status === 'طرح')
                    return res.status(400).json({ success: false, error: 'الوسيلة مطروحة مسبقاً' });

                const { reason, decision, disposedBy, notes, date } = req.body || {};

                if (!reason || !String(reason).trim())
                    return res.status(400).json({ success: false, error: 'سبب الطرح مطلوب' });

                v.dispose({
                    reason: String(reason).trim(),
                    decision: decision ? String(decision).trim() : '',
                    disposedBy: disposedBy ? String(disposedBy).trim() : (req.user.name || req.user.username || ''),
                    notes: notes ? String(notes).trim() : '',
                    date
                });

                await v.save();

                await addSystemLog({
                    userId: req.user.id, userName: req.user.name,
                    action: 'dispose', resource: 'vehicle',
                    resourceId: v.id, resourceName: v.plateNumber,
                    status: 'success', ip: req.ip, requestId: req.requestId,
                    details: { reason, decision }
                });

                await notify({
                    type: 'warning', category: 'vehicle',
                    title: '⚫ طرح وسيلة برية',
                    message: 'تم طرح "' + v.plateNumber + '" — السبب: ' + reason,
                    link: '/pages/disposals-vehicles.html', icon: 'truck',
                    actorName: req.user.name || req.user.username
                });

                res.json({
                    success: true,
                    message: 'تم طرح الوسيلة بنجاح',
                    vehicle: formatVehicle(v)
                });
            } catch (e) {
                console.error('❌ [VEHICLES] dispose error:', e.message);
                res.status(500).json({ success: false, error: 'خطأ في الطرح' });
            }
        }
    );

    // ============================================================
    // ♻️ POST /api/vehicles/:id/restore
    // ============================================================
    app.post('/api/vehicles/:id/restore',
        authenticateAccessToken,
        requirePermission('vessels:update'),
        csrfProtection,
        async (req, res) => {
            try {
                const q = buildIdQuery(req.params.id);
                if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

                const v = await Vehicle.findOne(q);
                if (!v) return res.status(404).json({ success: false, error: 'الوسيلة غير موجودة' });

                if (v.status !== 'طرح')
                    return res.status(400).json({ success: false, error: 'الوسيلة غير مطروحة' });

                const { newStatus } = req.body || {};
                const allowed = ['صالحة', 'صيانة', 'معطبة'];
                const target = allowed.includes(newStatus) ? newStatus : 'صيانة';

                v.restore({ newStatus: target });
                await v.save();

                await addSystemLog({
                    userId: req.user.id, userName: req.user.name,
                    action: 'restore', resource: 'vehicle',
                    resourceId: v.id, resourceName: v.plateNumber,
                    status: 'success', ip: req.ip, requestId: req.requestId
                });

                await notify({
                    type: 'success', category: 'vehicle',
                    title: '♻️ إلغاء طرح وسيلة',
                    message: 'تم إلغاء طرح "' + v.plateNumber + '" وإعادتها بحالة "' + target + '"',
                    link: '/pages/vehicles.html', icon: 'truck',
                    actorName: req.user.name || req.user.username
                });

                res.json({
                    success: true,
                    message: 'تم إلغاء الطرح بنجاح',
                    vehicle: formatVehicle(v)
                });
            } catch (e) {
                console.error('❌ [VEHICLES] restore error:', e.message);
                res.status(500).json({ success: false, error: 'خطأ في إلغاء الطرح' });
            }
        }
    );

    // ============================================================
    // 📸 POST /api/vehicles/:id/images — رفع صور إلى Cloudinary
    // ✅ جودة عالية + eager transformations
    // ============================================================
    if (upload && cloudinary) {
        app.post('/api/vehicles/:id/images',
            authenticateAccessToken,
            requirePermission('vessels:update'),
            csrfProtection,
            upload.array('images', 5),
            async (req, res) => {
                try {
                    const q = buildIdQuery(req.params.id);
                    if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

                    const v = await Vehicle.findOne(q);
                    if (!v) return res.status(404).json({ success: false, error: 'الوسيلة غير موجودة' });

                    if (!req.files || req.files.length === 0)
                        return res.status(400).json({ success: false, error: 'لم يتم رفع أي صورة' });

                    const remaining = MAX_IMAGES - v.images.length;
                    if (remaining <= 0)
                        return res.status(400).json({
                            success: false,
                            error: `الحد الأقصى ${MAX_IMAGES} صور`
                        });

                    const filesToAdd = req.files.slice(0, remaining);
                    const source  = req.body.source === 'camera' ? 'camera' : 'upload';
                    const caption = typeof req.body.caption === 'string' ? req.body.caption.trim() : '';

                    const uploaded = [];

                    for (let idx = 0; idx < filesToAdd.length; idx++) {
                        const file = filesToAdd[idx];
                        try {
                            const result = await new Promise((resolve, reject) => {
                                const stream = cloudinary.uploader.upload_stream({
                                    folder: `marine-system/vehicles/${v.plateNumber || v.id}`,
                                    resource_type: 'image',
                                    // ✅ جودة عالية للصورة الأصلية
                                    transformation: [
                                        { width: 1920, height: 1920, crop: 'limit' },
                                        { quality: 92 },
                                        { fetch_format: 'auto' },
                                        { flags: 'progressive' }
                                    ],
                                    // ✅ إنشاء نسخ إضافية تلقائياً
                                    eager: [
                                        // Thumbnail عالي الجودة (240×240 = 2x من 120)
                                        { 
                                            width: 240, height: 240, 
                                            crop: 'fill', gravity: 'auto',
                                            quality: 90, 
                                            fetch_format: 'auto',
                                            flags: 'progressive',
                                            dpr: 'auto'
                                        },
                                        // Medium للعرض المتوسط
                                        { 
                                            width: 800, height: 800, 
                                            crop: 'limit',
                                            quality: 85,
                                            fetch_format: 'auto',
                                            flags: 'progressive'
                                        }
                                    ],
                                    eager_async: false
                                }, (err, r) => err ? reject(err) : resolve(r));
                                stream.end(file.buffer);
                            });

                            // ✅ استخراج روابط النسخ الإضافية
                            const baseUrl = result.secure_url;
                            const thumbUrl = (result.eager && result.eager[0]) 
                                ? result.eager[0].secure_url 
                                : baseUrl;
                            const mediumUrl = (result.eager && result.eager[1]) 
                                ? result.eager[1].secure_url 
                                : baseUrl;

                            uploaded.push({
                                filename:     result.public_id.split('/').pop(),
                                originalName: file.originalname,
                                url:          baseUrl,
                                thumbUrl:     thumbUrl,        // ✅ جديد
                                mediumUrl:    mediumUrl,       // ✅ جديد
                                largeUrl:     baseUrl,         // ✅ الأصلي
                                cloudinaryId: result.public_id,
                                size:         result.bytes,
                                mimetype:     file.mimetype,
                                caption:      caption,
                                isPrimary:    v.images.length === 0 && idx === 0,
                                source:       source,
                                uploadedAt:   new Date(),
                                uploadedBy:   req.user.name || req.user.username || 'system'
                            });
                        } catch (err) {
                            console.error('❌ Cloudinary upload error:', err.message);
                        }
                    }

                    if (uploaded.length === 0)
                        return res.status(500).json({ success: false, error: 'فشل رفع الصور' });

                    v.images.push(...uploaded);
                    await v.save();

                    await addSystemLog({
                        userId: req.user.id, userName: req.user.name,
                        action: 'upload_images', resource: 'vehicle',
                        resourceId: v.id, resourceName: v.plateNumber,
                        status: 'success', ip: req.ip, requestId: req.requestId,
                        details: { count: uploaded.length, source }
                    });

                    res.json({
                        success: true,
                        message: `تم رفع ${uploaded.length} صورة`,
                        images: v.images,
                        vehicle: formatVehicle(v)
                    });
                } catch (e) {
                    console.error('❌ [VEHICLES] upload error:', e.message);
                    res.status(500).json({ success: false, error: 'خطأ في رفع الصور' });
                }
            }
        );

        // ============================================================
        // 🗑️ DELETE /api/vehicles/:id/images/:imageId
        // ============================================================
        app.delete('/api/vehicles/:id/images/:imageId',
            authenticateAccessToken,
            requirePermission('vessels:update'),
            csrfProtection,
            async (req, res) => {
                try {
                    const q = buildIdQuery(req.params.id);
                    if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

                    const v = await Vehicle.findOne(q);
                    if (!v) return res.status(404).json({ success: false, error: 'الوسيلة غير موجودة' });

                    const img = v.images.id(req.params.imageId);
                    if (!img) return res.status(404).json({ success: false, error: 'الصورة غير موجودة' });

                    if (img.cloudinaryId) {
                        try {
                            await cloudinary.uploader.destroy(img.cloudinaryId);
                        } catch (err) {
                            console.warn('⚠️ Cloudinary delete:', err.message);
                        }
                    }

                    v.removeImage(req.params.imageId);
                    await v.save();

                    await addSystemLog({
                        userId: req.user.id, userName: req.user.name,
                        action: 'delete_image', resource: 'vehicle',
                        resourceId: v.id, resourceName: v.plateNumber,
                        status: 'success', ip: req.ip, requestId: req.requestId
                    });

                    res.json({
                        success: true,
                        message: 'تم حذف الصورة',
                        images: v.images
                    });
                } catch (e) {
                    console.error('❌ [VEHICLES] delete image error:', e.message);
                    res.status(500).json({ success: false, error: 'خطأ في حذف الصورة' });
                }
            }
        );

        // ============================================================
        // ⭐ PATCH /api/vehicles/:id/images/:imageId/primary
        // ============================================================
        app.patch('/api/vehicles/:id/images/:imageId/primary',
            authenticateAccessToken,
            requirePermission('vessels:update'),
            csrfProtection,
            async (req, res) => {
                try {
                    const q = buildIdQuery(req.params.id);
                    if (!q) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

                    const v = await Vehicle.findOne(q);
                    if (!v) return res.status(404).json({ success: false, error: 'الوسيلة غير موجودة' });

                    const img = v.images.id(req.params.imageId);
                    if (!img) return res.status(404).json({ success: false, error: 'الصورة غير موجودة' });

                    v.setPrimaryImage(req.params.imageId);
                    await v.save();

                    res.json({
                        success: true,
                        message: 'تم تعيين الصورة الرئيسية',
                        images: v.images
                    });
                } catch (e) {
                    console.error('❌ [VEHICLES] primary error:', e.message);
                    res.status(500).json({ success: false, error: 'خطأ في التحديث' });
                }
            }
        );
    } else if (upload && !cloudinary) {
        console.warn('⚠️ [VEHICLES] Image endpoints disabled (Cloudinary not configured)');
    }

    // ============================================================
    // ✅ سجل
    // ============================================================
    console.log('✅ [VEHICLES] Routes registered successfully');
    console.log('   📌 GET    /api/vehicles');
    console.log('   📌 GET    /api/vehicles/disposed');
    console.log('   📌 GET    /api/vehicles/disposal-stats');
    console.log('   📌 GET    /api/vehicles/config');
    console.log('   📌 GET    /api/vehicles/:id');
    console.log('   📌 POST   /api/vehicles');
    console.log('   📌 PUT    /api/vehicles/:id');
    console.log('   📌 DELETE /api/vehicles/:id');
    console.log('   📌 POST   /api/vehicles/:id/dispose');
    console.log('   📌 POST   /api/vehicles/:id/restore');
    if (upload && cloudinary) {
        console.log('   📌 POST   /api/vehicles/:id/images (Cloudinary)');
        console.log('   📌 DELETE /api/vehicles/:id/images/:imageId');
        console.log('   📌 PATCH  /api/vehicles/:id/images/:imageId/primary');
    }
};
