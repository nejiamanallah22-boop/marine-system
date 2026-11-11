// routes/crew.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Crew = require('../models/Crew');

// ═══════════════════════════════════════════════════════════
// GET /api/vessels/:id/crew — جلب كل أفراد الطاقم
// ═══════════════════════════════════════════════════════════
router.get('/:id/crew', async (req, res) => {
    try {
        const crew = await Crew.find({ vesselId: req.params.id }).sort({ createdAt: 1 });
        res.json({
            success: true,
            crew: crew.map(c => c.toObject())
        });
    } catch (e) {
        console.error('❌ GET /:id/crew error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════
// POST /api/vessels/:id/crew — إضافة فرد جديد
// ═══════════════════════════════════════════════════════════
router.post('/:id/crew', async (req, res) => {
    try {
        const firstName = (req.body.firstName || '').trim();
        const lastName  = (req.body.lastName  || '').trim();

        if (!firstName) return res.status(400).json({ success: false, error: 'الاسم مطلوب' });
        if (!lastName)  return res.status(400).json({ success: false, error: 'اللقب مطلوب' });

        const crew = await Crew.create({
            id: crypto.randomBytes(12).toString('hex'),
            vesselId: req.params.id,
            firstName,
            lastName,
            rank:           req.body.rank           || '',
            jobTitle:       req.body.jobTitle       || '',
            phone:          req.body.phone          || '',
            cin:            req.body.cin            || '',
            birthPlace:     req.body.birthPlace     || '',
            hireDate:       req.body.hireDate       || null,
            qualifications: req.body.qualifications || '',
            familyStatus:   req.body.familyStatus   || '',
            notes:          req.body.notes          || ''
        });

        console.log(`✅ [CREW] إضافة فرد "${firstName} ${lastName}" للمركب ${req.params.id}`);
        res.status(201).json({ success: true, crew: crew.toObject() });
    } catch (e) {
        console.error('❌ POST /:id/crew error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/vessels/:id/crew/:crewId — تعديل فرد (اختياري)
// ═══════════════════════════════════════════════════════════
router.put('/:id/crew/:crewId', async (req, res) => {
    try {
        const update = {
            firstName:      (req.body.firstName || '').trim(),
            lastName:       (req.body.lastName  || '').trim(),
            rank:           req.body.rank           || '',
            jobTitle:       req.body.jobTitle       || '',
            phone:          req.body.phone          || '',
            cin:            req.body.cin            || '',
            birthPlace:     req.body.birthPlace     || '',
            hireDate:       req.body.hireDate       || null,
            qualifications: req.body.qualifications || '',
            familyStatus:   req.body.familyStatus   || '',
            notes:          req.body.notes          || ''
        };

        const crew = await Crew.findOneAndUpdate(
            { id: req.params.crewId, vesselId: req.params.id },
            update,
            { new: true }
        );

        if (!crew) return res.status(404).json({ success: false, error: 'الفرد غير موجود' });
        res.json({ success: true, crew: crew.toObject() });
    } catch (e) {
        console.error('❌ PUT /:id/crew/:crewId error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
