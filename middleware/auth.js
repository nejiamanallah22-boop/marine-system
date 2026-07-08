const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'غير مصرح به - الرجاء تسجيل الدخول' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user || !user.enabled) {
            return res.status(401).json({ error: 'المستخدم غير موجود أو معطل' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'رمز مصادقة غير صالح' });
    }
};

exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'غير مصرح به - صلاحية غير كافية' });
        }
        next();
    };
};

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
        }

        const user = await User.findOne({ name: username });
        if (!user || !user.enabled) {
            return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        const token = jwt.sign(
            { id: user._id, name: user.name, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );

        res.json({
            token,
            id: user._id,
            name: user.name,
            role: user.role
        });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في السيرفر: ' + error.message });
    }
};
