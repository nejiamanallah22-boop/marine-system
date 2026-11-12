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
        console.error('❌ [DRIVERS] Driver model is not loaded!');
        return;
    }
    if (!Vehicle) {
        console.error('❌ [DRIVERS] Vehicle model is not loaded!');
        return;
    }

    // ═══════════════════════════════════════════════════════
    // 🛠️ Helper: البحث عن الوسيلة بـ _id أو id المخصص
    // ═══════════════════════════════════════════════════════
    async function findVehicle(vehicleId) {
        if (!vehicleId || typeof vehicleId !== 'string') return null;
        const clean = vehicleId.trim();
        if (!clean || clean.length > 100) return null;
        
        // إذا كان ObjectId صالح (24 hex) → ابحث بـ _id
        if (/^[a-f0-9]{24}$/i.test(clean) && mongoose.Types.ObjectId.isValid(clean)) {
            return await Vehicle.findById(clean);
        }
        // وإلا → ابحث بالـ id المخصص (string)
        return await Vehicle.findOne({ id: clean });
    }

    // ═══════════════════════════════════════════════════════
    // 🔍 GET /api/vehicles/:vehicleId/drivers
    // ═══════════════════════════════════════════════════════
    app.get(
        '/api/vehicles/:vehicleId/drivers',
        authenticateAccessToken,
        requirePermission('vessels:read'),
        async (req, res) => {
            try {
                const { vehicleId } = req.params;

                const vehicle = await findVehicle(vehicleId);
                if (!vehicle) {
                    return res.status(404).json({ success: false, error: 'الوسيلة غير موجودة' });
                }

                // البحث عن السائقين بـ _id الفعلي
                const drivers = await Driver
                    .find({ vehicleId: vehicle._id })
                    .sort({ createdAt: -1 })
                    .lean();

                res.json({
                    success: true,
                    vehicle: {
                        id: vehicle.id,
                        _id: vehicle._id.toString(),
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

    // ═══════════════════════════════════════════════════════
    // ➕ POST /api/vehicles/:vehicleId/drivers
    // ═══════════════════════════════════════════════════════
    app.post(
        '/api/vehicles/:vehicleId/drivers',
        authenticateAccessToken,
        requirePermission('vessels:update'),
        csrfProtection,
        async (req, res) => {
            try {
                const { vehicleId } = req.params;
                const { firstName, lastName, cin, license, licenseDate, licenseCat, assignment } = req.body;

                if (!firstName || !String(firstName).trim()) {
                    return res.status(400).json({ success: false, error: 'اسم السائق مطلوب' });
                }
                if (!lastName || !String(lastName).trim()) {
                    return res.status(400).json({ success: false, error: 'لقب السائق مطلوب' });
                }

                const vehicle = await findVehicle(vehicleId);
                if (!vehicle) {
                    return res.status(404).json({ success: false, error: 'الوسيلة غير موجودة' });
                }

                const driver = new Driver({
                    vehicleId: vehicle._id,  // ← _id الفعلي دائماً
                    firstName: String(firstName).trim().substring(0, 100),
                    lastName: String(lastName).trim().substring(0, 100),
                    cin: String(cin || '').trim().substring(0, 20),
                    license: String(license || '').trim().substring(0, 50),
                    licenseDate: licenseDate || null,
                    licenseCat: String(licenseCat || '').trim().substring(0, 20),
                    assignment: String(assignment || '').trim().substring(0, 200),
                    createdBy: req.user._id || null,
                    createdByName: req.user.name || req.user.username || ''
                });

                await driver.save();

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
                        createdAt: driver.createdAt
                    }
                });
            } catch (err) {
                console.error('❌ [DRIVERS] POST error:', err.message);
                res.status(500).json({ success: false, error: 'فشل إضافة السائق: ' + err.message });
            }
        }
    );

    // ═══════════════════════════════════════════════════════
    // ✏️ PUT /api/vehicles/:vehicleId/drivers/:driverId
    // ═══════════════════════════════════════════════════════
    app.put(
        '/api/vehicles/:vehicleId/drivers/:driverId',
        authenticateAccessToken,
        requirePermission('vessels:update'),
        csrfProtection,
        async (req, res) => {
            try {
                const { vehicleId, driverId } = req.params;
                const { firstName, lastName, cin, license, licenseDate, licenseCat, assignment } = req.body;

                if (!mongoose.Types.ObjectId.isValid(driverId)) {
                    return res.status(400).json({ success: false, error: 'معرف السائق غير صالح' });
                }

                const vehicle = await findVehicle(vehicleId);
                if (!vehicle) {
                    return res.status(404).json({ success: false, error: 'الوسيلة غير موجودة' });
                }

                const driver = await Driver.findOne({ _id: driverId, vehicleId: vehicle._id });
                if (!driver) {
                    return res.status(404).json({ success: false, error: 'السائق غير موجود' });
                }

                if (firstName !== undefined && String(firstName).trim()) driver.firstName = String(firstName).trim();
                if (lastName !== undefined && String(lastName).trim()) driver.lastName = String(lastName).trim();
                if (cin !== undefined) driver.cin = String(cin).trim();
                if (license !== undefined) driver.license = String(license).trim();
                if (licenseDate !== undefined) driver.licenseDate = licenseDate || null;
                if (licenseCat !== undefined) driver.licenseCat = String(licenseCat).trim();
                if (assignment !== undefined) driver.assignment = String(assignment).trim();

                await driver.save();

                res.json({ success: true, message: 'تم تحديث السائق بنجاح', driver });
            } catch (err) {
                console.error('❌ [DRIVERS] PUT error:', err.message);
                res.status(500).json({ success: false, error: 'فشل تحديث السائق: ' + err.message });
            }
        }
    );

    // ═══════════════════════════════════════════════════════
    // 🗑️ DELETE /api/vehicles/:vehicleId/drivers/:driverId
    // ═══════════════════════════════════════════════════════
    app.delete(
        '/api/vehicles/:vehicleId/drivers/:driverId',
        authenticateAccessToken,
        requirePermission('vessels:update'),
        csrfProtection,
        async (req, res) => {
            try {
                const { vehicleId, driverId } = req.params;

                if (!mongoose.Types.ObjectId.isValid(driverId)) {
                    return res.status(400).json({ success: false, error: 'معرف السائق غير صالح' });
                }

                const vehicle = await findVehicle(vehicleId);
                if (!vehicle) {
                    return res.status(404).json({ success: false, error: 'الوسيلة غير موجودة' });
                }

                const driver = await Driver.findOneAndDelete({ _id: driverId, vehicleId: vehicle._id });
                if (!driver) {
                    return res.status(404).json({ success: false, error: 'السائق غير موجود' });
                }

                res.json({ success: true, message: 'تم حذف السائق بنجاح' });
            } catch (err) {
                console.error('❌ [DRIVERS] DELETE error:', err.message);
                res.status(500).json({ success: false, error: 'فشل حذف السائق: ' + err.message });
            }
        }
    );

    console.log('✅ [DRIVERS] All routes registered successfully');
};
