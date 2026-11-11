// routes/crew.js
const crypto = require('crypto');
const Crew = require('../models/Crew');

module.exports = function(app, deps) {
    const { authenticateAccessToken, csrfProtection } = deps || {};

    // ═══════════════════════════════════════════════════════════
    // GET /api/vessels/:id/crew
    // ═══════════════════════════════════════════════════════════
    app.get('/api/vessels/:id/crew', authenticateAccessToken, async (req, res) => {
        try {
            const crew = await Crew.find({ vesselId: req.params.id }).sort({ createdAt: 1 });
            res.json({ success: true, crew: crew.map(c => c.toObject()) });
        } catch (e) {
            console.error('❌ [CREW] GET:', e.message);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ═══════════════════════════════════════════════════════════
    // POST /api/vessels/:id/crew
    // ═══════════════════════════════════════════════════════════
    app.post('/api/vessels/:id/crew', authenticateAccessToken, csrfProtection, async (req, res) => {
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

            console.log(`✅ [CREW] Added "${firstName} ${lastName}" to vessel ${req.params.id}`);
            res.status(201).json({ success: true, crew: crew.toObject() });
        } catch (e) {
            console.error('❌ [CREW] POST:', e.message);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ═══════════════════════════════════════════════════════════
    // PUT /api/vessels/:id/crew/:crewId
    // ═══════════════════════════════════════════════════════════
    app.put('/api/vessels/:id/crew/:crewId', authenticateAccessToken, csrfProtection, async (req, res) => {
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
            console.error('❌ [CREW] PUT:', e.message);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ═══════════════════════════════════════════════════════════
    // DELETE /api/crew/:id
    // ═══════════════════════════════════════════════════════════
    app.delete('/api/crew/:id', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            const result = await Crew.deleteOne({ id: req.params.id });
            if (result.deletedCount === 0) {
                return res.status(404).json({ success: false, error: 'الفرد غير موجود' });
            }
            console.log(`✅ [CREW] Deleted ${req.params.id}`);
            res.json({ success: true });
        } catch (e) {
            console.error('❌ [CREW] DELETE:', e.message);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    console.log('✅ [CREW] Routes registered:');
    console.log('   📥 GET    /api/vessels/:id/crew');
    console.log('   📤 POST   /api/vessels/:id/crew');
    console.log('   ✏️  PUT    /api/vessels/:id/crew/:crewId');
    console.log('   🗑️  DELETE /api/crew/:id');
};
