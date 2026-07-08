const express = require('express');
const router = express.Router();
const Log = require('../models/Log');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const logs = await Log.find().sort({ createdAt: -1 });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/', authenticate, async (req, res) => {
    try {
        const log = new Log(req.body);
        await log.save();
        res.status(201).json(log);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
