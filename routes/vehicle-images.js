// routes/vehicle-images.js
'use strict';

const express = require('express');
const router  = express.Router({ mergeParams: true });
const path    = require('path');
const fs      = require('fs');
const Vehicle = require('../models/Vehicle');
const upload  = require('../middleware/uploadVehicleImages');

const MAX_IMAGES = 10;

/* ============================================================
   POST /api/vehicles/:id/images
   ============================================================ */
router.post('/', upload.array('images', 5), async (req, res) => {
    try {
        const vehicle = await Vehicle.findOne({
            $or: [{ _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null },
                  { id: req.params.id }]
        });

        if (!vehicle) {
            req.files?.forEach(f => fs.unlink(f.path, () => {}));
            return res.status(404).json({ error: 'الوسيلة غير موجودة' });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'لم يتم رفع أي صورة' });
        }

        const remaining = MAX_IMAGES - vehicle.images.length;
        if (remaining <= 0) {
            req.files.forEach(f => fs.unlink(f.path, () => {}));
            return res.status(400).json({ error: `الحد الأقصى ${MAX_IMAGES} صور` });
        }

        const filesToAdd  = req.files.slice(0, remaining);
        const filesToDrop = req.files.slice(remaining);
        filesToDrop.forEach(f => fs.unlink(f.path, () => {}));

        const source  = req.body.source === 'camera' ? 'camera' : 'upload';
        const caption = req.body.caption || '';

        const newImages = filesToAdd.map((file, idx) => ({
            filename:     file.filename,
            originalName: file.originalname,
            url:          `/uploads/vehicles/${file.filename}`,
            size:         file.size,
            mimetype:     file.mimetype,
            caption,
            isPrimary:    vehicle.images.length === 0 && idx === 0,
            source,
            uploadedAt:   new Date(),
            uploadedBy:   req.user?.username || 'system'
        }));

        vehicle.images.push(...newImages);
        await vehicle.save();

        res.json({
            success: true,
            message: `تم رفع ${newImages.length} صورة`,
            images:  vehicle.images
        });
    } catch (err) {
        console.error('Upload error:', err);
        req.files?.forEach(f => fs.unlink(f.path, () => {}));
        res.status(500).json({ error: err.message });
    }
});

/* ============================================================
   GET /api/vehicles/:id/images
   ============================================================ */
router.get('/', async (req, res) => {
    try {
        const vehicle = await Vehicle.findOne({
            $or: [{ _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null },
                  { id: req.params.id }]
        }).select('images');

        if (!vehicle) return res.status(404).json({ error: 'الوسيلة غير موجودة' });

        res.json({ success: true, images: vehicle.images });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ============================================================
   DELETE /api/vehicles/:id/images/:imageId
   ============================================================ */
router.delete('/:imageId', async (req, res) => {
    try {
        const vehicle = await Vehicle.findOne({
            $or: [{ _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null },
                  { id: req.params.id }]
        });

        if (!vehicle) return res.status(404).json({ error: 'الوسيلة غير موجودة' });

        const image = vehicle.images.id(req.params.imageId);
        if (!image) return res.status(404).json({ error: 'الصورة غير موجودة' });

        // حذف الملف الفعلي
        const filePath = path.join(__dirname, '..', image.url);
        fs.unlink(filePath, () => {});

        image.deleteOne();

        if (vehicle.images.length > 0 && !vehicle.images.some(i => i.isPrimary)) {
            vehicle.images[0].isPrimary = true;
        }

        await vehicle.save();
        res.json({ success: true, images: vehicle.images });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ============================================================
   PATCH /api/vehicles/:id/images/:imageId/primary
   ============================================================ */
router.patch('/:imageId/primary', async (req, res) => {
    try {
        const vehicle = await Vehicle.findOne({
            $or: [{ _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null },
                  { id: req.params.id }]
        });

        if (!vehicle) return res.status(404).json({ error: 'الوسيلة غير موجودة' });

        vehicle.setPrimaryImage(req.params.imageId);
        await vehicle.save();

        res.json({ success: true, images: vehicle.images });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
