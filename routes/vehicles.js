// ============================================================
// 🚛 routes/vehicles.js — Routes الوسائل البرية v1.0
// ✅ لا ينشئ نموذج — يستقبله من server.js
// ============================================================

'use strict';

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
        console.warn('⚠️ [VEHICLES] Vehicle model not loaded — routes disabled');
        return;
    }

    console.log('✅ [VEHICLES] Registering vehicles routes...');

    // ============================================================
    // 📝 FORMATTER
    // ============================================================
    function formatVehicle(v) {
        if (!v) return null;
        return {
            id: v.id,
            _id: v._id ? v._id.toString() : null,
            name: v.name || '',
            plateNumber: v.plateNumber || '',
            type: v.type || 'سيارة',
            region: v.region || '',
            status: v.status || 'صالحة',
            workCondition: v.workCondition || 'جديدة',
            appointmentDate: v.appointmentDate || null,
            notes: v.notes || '',
            createdAt: v.createdAt,
            updatedAt: v.updatedAt
        };
    }

    // ============================================================
    // ✅ GET — كل الوسائل
    // ============================================================
    app.get('/api/vehicles',
        authenticateAccessToken,
        requirePermission('vessels:read'),
        async (req, res) => {
            try {
                const vehicles = await Vehicle.find()
                    .sort({ createdAt: -1 })
                    .limit(1000)
                    .lean();

                res.json(vehicles.map(formatVehicle));
            } catch (e) {
                console.error('❌ [VEHICLES] GET error:', e.message);
                res.status(500).json({ success: false, error: 'فشل تحميل الوسائل البرية' });
            }
        }
    );

    // ============================================================
    // ✅ POST — إضافة وسيلة
    // ============================================================
    app.post('/api/vehicles',
        authenticateAccessToken,
        requirePermission('vessels:create'),
        csrfProtection,
        async (req, res) => {
            try {
                const {
                    name, plateNumber, type, region,
                    status, workCondition, appointmentDate, notes
                } = req.body;

                if (typeof plateNumber !== 'string' || !plateNumber.trim()) {
                    return res.status(400).json({
                        success: false,
                        error: 'رقم الوسيلة مطلوب'
                    });
                }

                if (typeof region !== 'string' || !region.trim()) {
                    return res.status(400).json({
                        success: false,
                        error: 'الإقليم / الإدارة مطلوب'
                    });
                }

                const existing = await Vehicle.findOne({
                    plateNumber: plateNumber.trim()
                });

                if (existing) {
                    return res.status(400).json({
                        success: false,
                        error: 'رقم الوسيلة موجود مسبقاً'
                    });
                }

                const newVehicle = await Vehicle.create({
                    id: randomId(8),
                    name: typeof name === 'string' ? name.trim() : '',
                    plateNumber: plateNumber.trim(),
                    type: type || 'سيارة',
                    region: region.trim(),
                    status: status || 'صالحة',
                    workCondition: workCondition || 'جديدة',
                    appointmentDate: appointmentDate || null,
                    notes: typeof notes === 'string' ? notes.trim() : '',
                    createdBy: req.user.id
                });

                await addSystemLog({
                    userId: req.user.id,
                    userName: req.user.name,
                    action: 'create',
                    resource: 'vehicle',
                    resourceId: newVehicle.id,
                    resourceName: newVehicle.plateNumber,
                    status: 'success',
                    ip: req.ip,
                    requestId: req.requestId
                });

                await notify({
                    type: 'success',
                    category: 'vehicle',
                    title: '🚛 وسيلة برية جديدة',
                    message: 'تم إضافة "' + newVehicle.plateNumber + '" (' + newVehicle.type + ')',
                    link: '/pages/vehicles.html',
                    icon: 'truck',
                    actorName: req.user.name || req.user.username
                });

                res.status(201).json({
                    success: true,
                    message: 'تم إضافة الوسيلة البرية بنجاح',
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
    // ✅ PUT — تعديل وسيلة
    // ============================================================
    app.put('/api/vehicles/:id',
        authenticateAccessToken,
        requirePermission('vessels:update'),
        csrfProtection,
        async (req, res) => {
            try {
                const q = buildIdQuery(req.params.id);
                if (!q) {
                    return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
                }

                const v = await Vehicle.findOne(q);
                if (!v) {
                    return res.status(404).json({ success: false, error: 'الوسيلة غير موجودة' });
                }

                const {
                    name, plateNumber, type, region,
                    status, workCondition, appointmentDate, notes
                } = req.body;

                if (typeof name === 'string') v.name = name.trim();

                if (typeof plateNumber === 'string' && plateNumber.trim() && plateNumber.trim() !== v.plateNumber) {
                    const dup = await Vehicle.findOne({
                        plateNumber: plateNumber.trim(),
                        _id: { $ne: v._id }
                    });
                    if (dup) {
                        return res.status(400).json({ success: false, error: 'رقم الوسيلة موجود مسبقاً' });
                    }
                    v.plateNumber = plateNumber.trim();
                }

                if (type !== undefined) v.type = type;
                if (typeof region === 'string') v.region = region.trim();
                if (status !== undefined) v.status = status;
                if (workCondition !== undefined) v.workCondition = workCondition;
                if (appointmentDate !== undefined) v.appointmentDate = appointmentDate || null;
                if (typeof notes === 'string') v.notes = notes.trim();

                v.updatedAt = new Date();
                await v.save();

                await addSystemLog({
                    userId: req.user.id,
                    userName: req.user.name,
                    action: 'update',
                    resource: 'vehicle',
                    resourceId: v.id,
                    resourceName: v.plateNumber,
                    status: 'success',
                    ip: req.ip,
                    requestId: req.requestId
                });

                await notify({
                    type: 'info',
                    category: 'vehicle',
                    title: 'تعديل وسيلة برية',
                    message: 'تم تعديل "' + v.plateNumber + '"',
                    link: '/pages/vehicles.html',
                    icon: 'edit',
                    actorName: req.user.name || req.user.username
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
    // ✅ DELETE — حذف وسيلة
    // ============================================================
    app.delete('/api/vehicles/:id',
        authenticateAccessToken,
        requirePermission('vessels:delete'),
        csrfProtection,
        async (req, res) => {
            try {
                const q = buildIdQuery(req.params.id);
                if (!q) {
                    return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
                }

                const v = await Vehicle.findOne(q);
                if (!v) {
                    return res.status(404).json({ success: false, error: 'الوسيلة غير موجودة' });
                }

                const plate = v.plateNumber;
                const vid = v.id;
                await Vehicle.deleteOne({ _id: v._id });

                await addSystemLog({
                    userId: req.user.id,
                    userName: req.user.name,
                    action: 'delete',
                    resource: 'vehicle',
                    resourceId: vid,
                    resourceName: plate,
                    status: 'success',
                    ip: req.ip,
                    requestId: req.requestId
                });

                await notify({
                    type: 'warning',
                    category: 'vehicle',
                    title: 'حذف وسيلة برية',
                    message: 'تم حذف "' + plate + '"',
                    link: '/pages/vehicles.html',
                    icon: 'trash',
                    actorName: req.user.name || req.user.username
                });

                res.json({ success: true, message: 'تم حذف الوسيلة' });
            } catch (e) {
                console.error('❌ [VEHICLES] DELETE error:', e.message);
                res.status(500).json({ success: false, error: 'خطأ في الحذف' });
            }
        }
    );

    console.log('✅ [VEHICLES] Routes registered successfully');
    console.log('   📌 GET    /api/vehicles');
    console.log('   📌 POST   /api/vehicles');
    console.log('   📌 PUT    /api/vehicles/:id');
    console.log('   📌 DELETE /api/vehicles/:id');
};
