const express = require('express');
const router = express.Router();

// استيراد جميع الـ Routes
const authRoutes = require('./authRoutes');
const vesselRoutes = require('./vesselRoutes');
const ticketRoutes = require('./ticketRoutes');
const logRoutes = require('./logRoutes');
const locationRoutes = require('./locationRoutes');
const noteRoutes = require('./noteRoutes');

// استخدام الـ Routes
router.use('/auth', authRoutes);
router.use('/vessels', vesselRoutes);
router.use('/tickets', ticketRoutes);
router.use('/logs', logRoutes);
router.use('/locations', locationRoutes);
router.use('/notes', noteRoutes);

// Route الصحة
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;
