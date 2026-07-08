const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const users = await User.find().select('-pass');
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const { name, pass, role } = req.body;
        const existing = await User.findOne({ name });
        if (existing) return res.status(400).json({ error: 'اسم المستخدم موجود' });
        const user = new User({ name, pass, role, enabled: true });
        await user.save();
        res.status(201).json({ message: 'تم إضافة المستخدم' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/:id', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        const { pass, ...updateData } = req.body;
        if (pass) updateData.pass = pass;
        const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
        res.json({ message: 'تم تحديث المستخدم' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/:id', authenticate, authorize('مسؤول'), async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'تم حذف المستخدم' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
