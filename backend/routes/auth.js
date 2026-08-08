const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// تسجيل الدخول
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findByCredentials(email, password);
        
        const token = user.generateAuthToken();
        const refreshToken = user.generateRefreshToken();
        
        user.refreshToken = refreshToken;
        await user.save();
        await user.updateLastLogin();
        
        res.json({
            success: true,
            token,
            refreshToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        res.status(401).json({ success: false, error: error.message });
    }
});

// التسجيل
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'البريد الإلكتروني مستخدم' });
        }
        
        const user = new User({ name, email, password, role });
        await user.save();
        
        res.json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// تجديد التوكن
router.post('/refresh-token', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        
        const user = await User.findById(decoded.id);
        if (!user || user.refreshToken !== refreshToken) {
            throw new Error('Invalid refresh token');
        }
        
        const token = user.generateAuthToken();
        res.json({ success: true, token });
    } catch (error) {
        res.status(401).json({ success: false, error: error.message });
    }
});

module.exports = router;
