// routes/crewDelete.js
const express = require('express');
const router = express.Router();
const Crew = require('../models/Crew');

// ═══════════════════════════════════════════════════════════
// DELETE /api/crew/:id — حذف فرد
// ═══════════════════════════════════════════════════════════
router.delete('/:id', async (req, res) => {
    try {
        const result = await Crew.deleteOne({ id: req.params.id });
        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, error: 'الفرد غير موجود' });
        }
        console.log(`✅ [CREW] حذف فرد ${req.params.id}`);
        res.json({ success: true });
    } catch (e) {
        console.error('❌ DELETE /:id error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
