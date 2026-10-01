// ============================================================
// 🚛 routes/vehicles.js — v6.1
// + 🆕 الصور + 🆕 الطرح
// ============================================================

'use strict';

const path = require('path');
const fs   = require('fs');

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

    // 🆕 استيراد Multer
    let upload;
    try {
        upload = require('../middleware/uploadVehicleImages');
    } catch (e) {
        console.warn('⚠️ [VEHICLES] Upload middleware not found, images disabled');
    }

    console.log('✅ [VEHICLES] Registering vehicles routes...');

    let VEHICLE_ZONES = {};
    try {
        const vmod = require('../models/Vehicle');
        VEHICLE_ZONES = vmod.VEHICLE_ZONES || {};
    } catch (e) {}

    const MAX_IMAGES = 10;

    // ============================================================
    // 🎨 formatVehicle — 🆕 يضم الصور وحقول الطرح
    // ============================================================
    function formatVehicle(v) {
        if (!v) return null;
        const images = Array.isArray(v.images) ? v.images.map(img => ({
            _id: img._id ? img._id.toString() : null,
            filename: img.filename || '',
            originalName: img.originalName || '',
            url: img.url || '',
            size: img.size || 0,
            mimetype: img.mimetype || '',
            caption: img.caption || '',
            isPrimary: !!img.isPrimary,
            source: img.source || 'upload',
            uploadedAt: img.uploadedAt || null,
            uploadedBy: img.uploadedBy || 'system'
        })) : [];

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
    // 🔍 GET /api/vehicles — استثناء المطروحة افتراضياً
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
    // 🔍 GET /api/vehicles/disposed — المطروحة
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
                    total,
                    disposed,
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
    // 🔍 GET /api/vehicles/:id — تفاصيل وسيلة واحدة
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
                console.error('❌ [VEHICLES] GET/:id error:', e.message);
                res.status(500).json({ success: false, error: 'فشل التحميل' });
            }
        }
    );

    // ============================================================
    // ➕ POST /api/vehicles — إضافة
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

                if (typeof plateNumber !== 'string' || !plateNumber.trim()) {
                    return res.status(400).json({ success: false, error: 'رقم الوسيلة مطلوب' });
                }
                if (typeof region !== 'string' || !region.trim()) {
                    return res.status(400).json({ success: false, error: 'الإدارة / الإقليم مطلوب' });
                }
                if (typeof zone !== 'string' || !zone.trim()) {
                    return res.status(400).json({ success: false, error: 'المنطقة مطلوبة' });
                }

                const allowedZones = VEHICLE_ZONES[region] || [];
                if (allowedZones.length > 0 && allowedZones.indexOf(zone) === -1) {
                    return res.status(400).json({
                        success: false,
                        error: 'المنطقة "' + zone + '" لا تتبع "' + region + '"'
                    });
                }

                if (status === 'معطبة' && (!faultDate || !String(faultDate).trim())) {
                    return res.status(400).json({
                        success: false,
                        error: 'تاريخ العطب مطلوب عند الحالة "معطبة"'
                    });
                }

                const existing = await Vehicle.findOne({ plateNumber: plateNumber.trim() });
                if (existing) {
                    return res.status(400).json({ success: false, error: 'رقم الوسيلة موجود مسبقاً' });
                }

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
                    zone: zone.trim(),
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
                if (e.name === 'ValidationError') {
                    return res.status(400).json({ success: false, error: e.message });
                }
                if (e.code === 11000) {
                    return res.status(400).json({ success: false, error: 'رقم الوسيلة موجود مسبقاً' });
                }
                res.status(500).json({ success: false, error: 'خطأ في إضافة الوسيلة' });
            }
        }
    );

    // ============================================================
    // ✏️ PUT /api/vehicles/:id — تعديل
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

                // منع تغيير حالة "طرح" عبر PUT العادي
                const wasDisposed = v.status === 'طرح';
                if (wasDisposed && status !== undefined && status !== 'طرح') {
                    return res.status(400).json({
                        success: false,
                        error: 'لا يمكن تغيير حالة وسيلة مطروحة عبر التعديل. استخدم "إلغاء الطرح"'
                    });
                }

                if (typeof name === 'string') v.name = name.trim();

                if (typeof plateNumber === 'string' && plateNumber.trim() && plateNumber.trim() !== v.plateNumber) {
                    const dup = await Vehicle.findOne({ plateNumber: plateNumber.trim(), _id: { $ne: v._id } });
                    if (dup) return res.status(400).json({ success: false, error: 'رقم الوسيلة موجود مسبقاً' });
                    v.plateNumber = plateNumber.trim();
                }

                if (type !== undefined) v.type = type;
                if (typeof brand === 'string') v.brand = brand.trim();
                if (typeof model === 'string') v.model = model.trim();
                if (year !== undefined) v.year = Number(year) || null;
                if (typeof color === 'string') v.color = color.trim();

                const newRegion = (typeof region === 'string' && region.trim()) ? region.trim() : v.region;
                const newZone = (typeof zone === 'string' && zone.trim()) ? zone.trim() : v.zone;

                if (region !== undefined || zone !== undefined) {
                    const allowedZones = VEHICLE_ZONES[newRegion] || [];
                    if (allowedZones.length > 0 && allowedZones.indexOf(newZone) === -1) {
                        return res.status(400).json({
                            success: false,
                            error: 'المنطقة "' + newZone + '" لا تتبع "' + newRegion + '"'
                        });
                    }
                }

                if (region !== undefined) v.region = newRegion;
                if (zone !== undefined) v.zone = newZone;

                // منع تعيين "طرح" من هنا (استخدم endpoint الطرح)
                if (status !== undefined && status !== 'طرح') v.status = status;
                if (workCondition !== undefined) v.workCondition = workCondition;
                if (appointmentDate !== undefined) v.appointmentDate = appointmentDate || null;
                if (faultDate !== undefined) v.faultDate = faultDate || null;

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
                if (e.name === 'ValidationError') {
                    return res.status(400).json({ success: false, error: e.message });
                }
                if (e.code === 11000) {
                    return res.status(400).json({ success: false, error: 'رقم الوسيلة موجود مسبقاً' });
                }
                res.status(500).json({ success: false, error: 'خطأ في التحديث' });
            }
        }
    );

    // ============================================================
    // 🗑️ DELETE /api/vehicles/:id
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

                // 🆕 حذف ملفات الصور
                if (v.images && v.images.length > 0) {
                    v.images.forEach(img => {
                        if (img.url) {
                            const fp = path.join(__dirname, '..', img.url);
                            fs.unlink(fp, () => {});
                        }
                    });
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
    // ⚫ POST /api/vehicles/:id/dispose — طرح وسيلة
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

                if (v.status === 'طرح') {
                    return res.status(400).json({ success: false, error: 'الوسيلة مطروحة مسبقاً' });
                }

                const { reason, decision, disposedBy, notes, date } = req.body || {};

                if (!reason || !String(reason).trim()) {
                    return res.status(400).json({ success: false, error: 'سبب الطرح مطلوب' });
                }

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
    // ♻️ POST /api/vehicles/:id/restore — إلغاء الطرح
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

                if (v.status !== 'طرح') {
                    return res.status(400).json({ success: false, error: 'الوسيلة غير مطروحة' });
                }

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
    // 📸 POST /api/vehicles/:id/images — رفع صور
    // ============================================================
    if (upload) {
        app.post('/api/vehicles/:id/images',
            authenticateAccessToken,
            requirePermission('vessels:update'),
            csrfProtection,
            upload.array('images', 5),
            async (req, res) => {
                try {
                    const q = buildIdQuery(req.params.id);
                    if (!q) {
                        req.files?.forEach(f => fs.unlink(f.path, () => {}));
                        return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
                    }

                    const v = await Vehicle.findOne(q);
                    if (!v) {
                        req.files?.forEach(f => fs.unlink(f.path, () => {}));
                        return res.status(404).json({ success: false, error: 'الوسيلة غير موجودة' });
                    }

                    if (!req.files || req.files.length === 0) {
                        return res.status(400).json({ success: false, error: 'لم يتم رفع أي صورة' });
                    }

                    const remaining = MAX_IMAGES - v.images.length;
                    if (remaining <= 0) {
                        req.files.forEach(f => fs.unlink(f.path, () => {}));
                        return res.status(400).json({
                            success: false,
                            error: `الحد الأقصى ${MAX_IMAGES} صور`
                        });
                    }

                    const filesToAdd  = req.files.slice(0, remaining);
                    const filesToDrop = req.files.slice(remaining);
                    filesToDrop.forEach(f => fs.unlink(f.path, () => {}));

                    const source  = req.body.source === 'camera' ? 'camera' : 'upload';
                    const caption = typeof req.body.caption === 'string' ? req.body.caption.trim() : '';

                    const newImages = filesToAdd.map((file, idx) => ({
                        filename:     file.filename,
                        originalName: file.originalname,
                        url:          `/uploads/vehicles/${file.filename}`,
                        size:         file.size,
                        mimetype:     file.mimetype,
                        caption,
                        isPrimary:    v.images.length === 0 && idx === 0,
                        source,
                        uploadedAt:   new Date(),
                        uploadedBy:   req.user.name || req.user.username || 'system'
                    }));

                    v.images.push(...newImages);
                    await v.save();

                    await addSystemLog({
                        userId: req.user.id, userName: req.user.name,
                        action: 'upload_images', resource: 'vehicle',
                        resourceId: v.id, resourceName: v.plateNumber,
                        status: 'success', ip: req.ip, requestId: req.requestId,
                        details: { count: newImages.length, source }
                    });

                    res.json({
                        success: true,
                        message: `تم رفع ${newImages.length} صورة`,
                        images: v.images,
                        vehicle: formatVehicle(v)
                    });
                } catch (e) {
                    console.error('❌ [VEHICLES] upload error:', e.message);
                    req.files?.forEach(f => fs.unlink(f.path, () => {}));
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

                    // حذف الملف الفعلي
                    if (img.url) {
                        const fp = path.join(__dirname, '..', img.url);
                        fs.unlink(fp, () => {});
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
    if (upload) {
        console.log('   📌 POST   /api/vehicles/:id/images');
        console.log('   📌 DELETE /api/vehicles/:id/images/:imageId');
        console.log('   📌 PATCH  /api/vehicles/:id/images/:imageId/primary');
    }
};
