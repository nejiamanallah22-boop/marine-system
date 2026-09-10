// routes/session.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// ✅ الواجهة تطلب هذا حتى بدون توكن → نرجع 401 بهدوء
router.get('/session-status', requireAuth, (req, res) => {
    res.json({
        success: true,
        user: req.user,
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
