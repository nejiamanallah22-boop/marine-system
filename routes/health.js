const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// ✅ Health Check
router.get('/', async (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0',
        database: dbStatus,
        environment: process.env.NODE_ENV,
        requestId: req.requestId
    });
});

// ✅ Detailed Health
router.get('/detailed', async (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1;
    
    // تحقق من Redis إذا كنت تستخدمه
    const redisStatus = true; // placeholder
    
    res.json({
        status: dbStatus && redisStatus ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
            database: { status: dbStatus ? 'up' : 'down' },
            redis: { status: redisStatus ? 'up' : 'down' }
        }
    });
});

module.exports = router;
