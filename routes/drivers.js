// routes/drivers.js
const mongoose = require('mongoose');

module.exports = function(app, deps) {
    const {
        Driver,
        Vehicle,
        authenticateAccessToken,
        csrfProtection,
        requirePermission,
        randomId,
        addSystemLog,
        buildIdQuery
    } = deps;

    console.log('🚗 [DRIVERS] Registering routes...');

    if (!Driver) {
        console.error('❌ [DRIVERS] Driver model missing! Routes will not work.');
        return;
    }
    if (!Vehicle) {
        console.error('❌ [DRIVERS] Vehicle model missing! Routes will not work.');
        return;
    }

    /* ═══════════════════════════════════════════════════════════
       🔍 GET /api/vehicles/:vehicleId/drivers
       ═══════════════════════════════════════════════════════════ */
    app.get(
        '/api/vehicles/:vehicleId/drivers',
        authenticateAccessToken,
        requirePermission('vessels:read'),
        async (req, res) => {
            try {
                const { vehicleId } = req.params;

                if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
                    return res.status(400).json({ success: false, error: 'معرف الوسيلة غير صالح' });
                }

                const vehicle = await Vehicle.findById(vehicleId).select('plateNumber name').lean();
                if (!vehicle) {
                    return res.status(404).json({ success: false, error: 'الوسيلة غير موجودة' });
                }

                const drivers = await Driver.find({ vehicleId }).sort({ createdAt: -1 }).lean();

                res.json({
                    success: true,
                    vehicle: {
                        id: vehicle._id.toString(),
                        name: vehicle.plateNumber || vehicle.name || '—'
                    },
                    count: drivers.length,
                    drivers: drivers.map(d => ({
                        id: d._id.toString(),
                        firstName: d.firstName,
                        lastName: d.lastName,
                        cin: d.cin,
                        license: d.license,
                        licenseDate: d.licenseDate,
                        licenseCat: d.licenseCat,
                        assignment: d.assignment,
                        notes: d.notes,
                        createdByName: d.createdByName,
                        createdAt: d.createdAt
                    }))
                });
            } catch (err) {
                console.error('❌ [DRIVERS] GET error:', err.message);
                res.status(500).json({ success: false, error: 'فشل تحميل السائقين: ' + err.message });
            }
        }
    );

    /* ═══════════════════════════════════════════════════════════
       ➕ POST /api/vehicles/:vehicleId/drivers
       ═══════════════════════════════════════════════════════════ */
    app.post(
        '/api/vehicles/:vehicleId/drivers',
        authenticateAccessToken,
        requirePermission('vessels:update'),
        csrfProtection,
        async (req, res) => {
            try {
                const { vehicleId } = req.params;
                const { firstName, lastName, cin, license, licenseDate, licenseCat, assignment, notes } = req.body;

                if (!firstName || !String(firstName).trim()) {
                    return res.status(400).json({ success: false, error: 'اسم السائق مطلوب' });
                }
                if (!lastName || !String(lastName).trim()) {
                    return res.status(400).json({ success: false, error: 'لقب السائق مطلوب' });
                }
                if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
                    return res.status(400).json({ success: false, error: 'معرف الوسيلة غير صالح' });
                }

                const vehicle = await Vehicle.findById(vehicleId);
                if (!vehicle) {
                    return res.status(404).json({ success: false, error: 'الوسيلة غير موجودة' });
                }

                const driver = new Driver({
                    vehicleId,
                    firstName: String(firstName).trim().substring(0, 100),
                    lastName: String(lastName).trim().substring(0, 100),
                    cin: String(cin || '').trim().substring(0, 20),
                    license: String(license || '').trim().substring(0, 50),
                    licenseDate: licenseDate || null,
                    licenseCat: String(licenseCat || '').trim().substring(0, 20),
                    assignment: String(assignment || '').trim().substring(0, 200),
                    notes: String(notes || '').trim().substring(0, 1000),
                    createdBy: req.user ? (req.user._id || null) : null,
                    createdByName: req.user ? (req.user.name || req.user.username || '') : ''
                });

                await driver.save();

                try {
                    await addSystemLog({
                        userId: req.user.id,
                        userName: req.user.name,
                        action: 'create',
                        resource: 'driver',
                        resourceId: driver._id.toString(),
                        resourceName: `${driver.firstName} ${driver.lastName}`,
                        status: 'success',
                        ip: req.ip,
                        requestId: req.requestId
                    });
                } catch(e) {}

                res.status(201).json({
                    success: true,
                    message: 'تمت إضافة السائق بنجاح',
                    driver: {
                        id: driver._id.toString(),
                        firstName: driver.firstName,
                        lastName: driver.lastName,
                        cin: driver.cin,
                        license: driver.license,
                        licenseDate: driver.licenseDate,
                        licenseCat: driver.licenseCat,
                        assignment: driver.assignment,
                        notes: driver.notes,
                        createdAt: driver.createdAt
                    }
                });
            } catch (err) {
                console.error('❌ [DRIVERS] POST error:', err.message);
                res.status(500).json({ success: false, error: 'فشل إضافة السائق: ' + err.message });
            }
        }
    );

    /* ═══════════════════════════════════════════════════════════
       ✏️ PUT /api/vehicles/:vehicleId/drivers/:driverId
       ═══════════════════════════════════════════════════════════ */
    app.put(
        '/api/vehicles/:vehicleId/drivers/:driverId',
        authenticateAccessToken,
        requirePermission('vessels:update'),
        csrfProtection,
        async (req, res) => {
            try {
                const { vehicleId, driverId } = req.params;
                const { firstName, lastName, cin, license, licenseDate, licenseCat, assignment, notes } = req.body;

                if (!mongoose.Types.ObjectId.isValid(vehicleId) || !mongoose.Types.ObjectId.isValid(driverId)) {
                    return res.status(400).json({ success: false, error: 'معرف غير صالح' });
                }

                const driver = await Driver.findOne({ _id: driverId, vehicleId });
                if (!driver) {
                    return res.status(404).json({ success: false, error: 'السائق غير موجود أو لا ينتمي لهذه الوسيلة' });
                }

                if (firstName !== undefined && String(firstName).trim()) driver.firstName = String(firstName).trim();
                if (lastName !== undefined && String(lastName).trim()) driver.lastName = String(lastName).trim();
                if (cin !== undefined) driver.cin = String(cin).trim();
                if (license !== undefined) driver.license = String(license).trim();
                if (licenseDate !== undefined) driver.licenseDate = licenseDate || null;
                if (licenseCat !== undefined) driver.licenseCat = String(licenseCat).trim();
                if (assignment !== undefined) driver.assignment = String(assignment).trim();
                if (notes !== undefined) driver.notes = String(notes).trim();

                await driver.save();

                try {
                    await addSystemLog({
                        userId: req.user.id,
                        userName: req.user.name,
                        action: 'update',
                        resource: 'driver',
                        resourceId: driver._id.toString(),
                        resourceName: `${driver.firstName} ${driver.lastName}`,
                        status: 'success',
                        ip: req.ip,
                        requestId: req.requestId
                    });
                } catch(e) {}

                res.json({ success: true, message: 'تم تحديث السائق بنجاح', driver });
            } catch (err) {
                console.error('❌ [DRIVERS] PUT error:', err.message);
                res.status(500).json({ success: false, error: 'فشل تحديث السائق: ' + err.message });
            }
        }
    );

    /* ═══════════════════════════════════════════════════════════
       🗑️ DELETE /api/vehicles/:vehicleId/drivers/:driverId
       ═══════════════════════════════════════════════════════════ */
    app.delete(
        '/api/vehicles/:vehicleId/drivers/:driverId',
        authenticateAccessToken,
        requirePermission('vessels:update'),
        csrfProtection,
        async (req, res) => {
            try {
                const { vehicleId, driverId } = req.params;

                if (!mongoose.Types.ObjectId.isValid(vehicleId) || !mongoose.Types.ObjectId.isValid(driverId)) {
                    return res.status(400).json({ success: false, error: 'معرف غير صالح' });
                }

                const driver = await Driver.findOneAndDelete({ _id: driverId, vehicleId });
                if (!driver) {
                    return res.status(404).json({ success: false, error: 'السائق غير موجود أو لا ينتمي لهذه الوسيلة' });
                }

                try {
                    await addSystemLog({
                        userId: req.user.id,
                        userName: req.user.name,
                        action: 'delete',
                        resource: 'driver',
                        resourceId: driver._id.toString(),
                        resourceName: `${driver.firstName} ${driver.lastName}`,
                        status: 'success',
                        ip: req.ip,
                        requestId: req.requestId
                    });
                } catch(e) {}

                res.json({ success: true, message: 'تم حذف السائق بنجاح' });
            } catch (err) {
                console.error('❌ [DRIVERS] DELETE error:', err.message);
                res.status(500).json({ success: false, error: 'فشل حذف السائق: ' + err.message });
            }
        }
    );

    console.log('✅ [DRIVERS] All routes registered:');
    console.log('   GET    /api/vehicles/:vehicleId/drivers');
    console.log('   POST   /api/vehicles/:vehicleId/drivers');
    console.log('   PUT    /api/vehicles/:vehicleId/drivers/:driverId');
    console.log('   DELETE /api/vehicles/:vehicleId/drivers/:driverId');
};
