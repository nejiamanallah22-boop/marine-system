const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        res.json(tickets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/', authenticate, async (req, res) => {
    try {
        const ticket = new Ticket(req.body);
        await ticket.save();
        res.status(201).json(ticket);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/:id/reply', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
        ticket.replies.push(req.body.reply);
        ticket.status = 'تم الرد';
        await ticket.save();
        res.json(ticket);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/:id/close', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
        ticket.status = 'مغلقة';
        await ticket.save();
        res.json(ticket);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
