// routes/drivers.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Driver = require('../models/Driver');
const Vehicle = require('../models/Vehicle');
const { verifyToken } = require('../middleware/auth'); // أو استخدم ما لديك

/* ═══════════════════════════════════════════════════════════
   🛡️ Middleware: التحقق من التوكن
   ═══════════════════════════════════════════════════════════ */
router.use(verifyToken);

/* ═══════════════════════════════════════════════════════════
   🔍 GET /api/vehicles/:vehicleId/drivers
   جلب كل سائقي وسيلة معينة
   ═══════════════════════════════════════════════════════════ */
router.get('/:vehicleId/drivers', async (req, res) => {
    try {
        const { vehicleId } = req.params;

        // التحقق من صحة معرف الوسيلة
        if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
            return res.status(400).json({ 
                success: false, 
                error: 'معرف الوسيلة غير صالح' 
            });
        }

        // التحقق من وجود الوسيلة
        const vehicle = await Vehicle.findById(vehicleId).select('plateNumber name');
        if (!vehicle) {
            return res.status(404).json({ 
                success: false, 
                error: 'الوسيلة غير موجودة' 
            });
        }

        // جلب السائقين مرتبين من الأحدث
        const drivers = await Driver
            .find({ vehicleId })
            .sort({ createdAt: -1 })
            .lean();

        res.json({
            success: true,
            vehicle: {
                id: vehicle._id,
                name: vehicle.plateNumber || vehicle.name
            },
            count: drivers.length,
            drivers: drivers.map(d => ({
                id: d._id,
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
        console.error('❌ GET /drivers error:', err);
        res.status(500).json({ 
            success: false, 
            error: 'فشل تحميل السائقين: ' + err.message 
        });
    }
});

/* ═══════════════════════════════════════════════════════════
   ➕ POST /api/vehicles/:vehicleId/drivers
   إضافة سائق جديد لوسيلة
   ═══════════════════════════════════════════════════════════ */
router.post('/:vehicleId/drivers', async (req, res) => {
    try {
        const { vehicleId } = req.params;
        const { firstName, lastName, cin, license, licenseDate, licenseCat, assignment, notes } = req.body;

        // ✅ التحقق من الحقول المطلوبة
        if (!firstName || !firstName.trim()) {
            return res.status(400).json({ 
                success: false, 
                error: 'اسم السائق مطلوب' 
            });
        }
        if (!lastName || !lastName.trim()) {
            return res.status(400).json({ 
                success: false, 
                error: 'لقب السائق مطلوب' 
            });
        }

        // ✅ التحقق من صحة معرف الوسيلة
        if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
            return res.status(400).json({ 
                success: false, 
                error: 'معرف الوسيلة غير صالح' 
            });
        }

        // ✅ التحقق من وجود الوسيلة
        const vehicle = await Vehicle.findById(vehicleId);
        if (!vehicle) {
            return res.status(404).json({ 
                success: false, 
                error: 'الوسيلة غير موجودة' 
            });
        }

        // ✅ إنشاء السائق
        const driver = new Driver({
            vehicleId,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            cin: (cin || '').trim(),
            license: (license || '').trim(),
            licenseDate: licenseDate || null,
            licenseCat: (licenseCat || '').trim(),
            assignment: (assignment || '').trim(),
            notes: (notes || '').trim(),
            createdBy: req.user ? req.user._id : null,
            createdByName: req.user ? (req.user.name || req.user.username || '') : ''
        });

        await driver.save();

        res.status(201).json({
            success: true,
            message: 'تمت إضافة السائق بنجاح',
            driver: {
                id: driver._id,
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
        console.error('❌ POST /drivers error:', err);
        res.status(500).json({ 
            success: false, 
            error: 'فشل إضافة السائق: ' + err.message 
        });
    }
});

/* ═══════════════════════════════════════════════════════════
   ✏️ PUT /api/vehicles/:vehicleId/drivers/:driverId
   تعديل بيانات سائق
   ═══════════════════════════════════════════════════════════ */
router.put('/:vehicleId/drivers/:driverId', async (req, res) => {
    try {
        const { vehicleId, driverId } = req.params;
        const { firstName, lastName, cin, license, licenseDate, licenseCat, assignment, notes } = req.body;

        if (!mongoose.Types.ObjectId.isValid(vehicleId) || !mongoose.Types.ObjectId.isValid(driverId)) {
            return res.status(400).json({ success: false, error: 'معرف غير صالح' });
        }

        // البحث عن السائق والتحقق من انتمائه للوسيلة
        const driver = await Driver.findOne({ 
            _id: driverId, 
            vehicleId 
        });

        if (!driver) {
            return res.status(404).json({ 
                success: false, 
                error: 'السائق غير موجود أو لا ينتمي لهذه الوسيلة' 
            });
        }

        // تحديث الحقول (فقط الحقول المرسلة)
        if (firstName !== undefined && firstName.trim()) driver.firstName = firstName.trim();
        if (lastName !== undefined && lastName.trim()) driver.lastName = lastName.trim();
        if (cin !== undefined) driver.cin = cin.trim();
        if (license !== undefined) driver.license = license.trim();
        if (licenseDate !== undefined) driver.licenseDate = licenseDate || null;
        if (licenseCat !== undefined) driver.licenseCat = licenseCat.trim();
        if (assignment !== undefined) driver.assignment = assignment.trim();
        if (notes !== undefined) driver.notes = notes.trim();

        await driver.save();

        res.json({
            success: true,
            message: 'تم تحديث السائق بنجاح',
            driver: {
                id: driver._id,
                firstName: driver.firstName,
                lastName: driver.lastName,
                cin: driver.cin,
                license: driver.license,
                licenseDate: driver.licenseDate,
                licenseCat: driver.licenseCat,
                assignment: driver.assignment,
                notes: driver.notes,
                updatedAt: driver.updatedAt
            }
        });
    } catch (err) {
        console.error('❌ PUT /drivers error:', err);
        res.status(500).json({ 
            success: false, 
            error: 'فشل تحديث السائق: ' + err.message 
        });
    }
});

/* ═══════════════════════════════════════════════════════════
   🗑️ DELETE /api/vehicles/:vehicleId/drivers/:driverId
   حذف سائق
   ═══════════════════════════════════════════════════════════ */
router.delete('/:vehicleId/drivers/:driverId', async (req, res) => {
    try {
        const { vehicleId, driverId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(vehicleId) || !mongoose.Types.ObjectId.isValid(driverId)) {
            return res.status(400).json({ success: false, error: 'معرف غير صالح' });
        }

        const driver = await Driver.findOneAndDelete({ 
            _id: driverId, 
            vehicleId 
        });

        if (!driver) {
            return res.status(404).json({ 
                success: false, 
                error: 'السائق غير موجود أو لا ينتمي لهذه الوسيلة' 
            });
        }

        res.json({
            success: true,
            message: 'تم حذف السائق بنجاح'
        });
    } catch (err) {
        console.error('❌ DELETE /drivers error:', err);
        res.status(500).json({ 
            success: false, 
            error: 'فشل حذف السائق: ' + err.message 
        });
    }
});

module.exports = router;
