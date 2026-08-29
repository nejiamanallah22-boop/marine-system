/**
 * 👤 وحدة التحكم في المستخدمين
 * @module controllers/userController
 */

const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const Session = require('../models/Session');
const logger = require('../utils/logger');

/**
 * الحصول على جميع المستخدمين
 */
async function getUsers(req, res) {
    try {
        const { role, isActive, limit = 100, offset = 0 } = req.query;
        
        const query = {};
        if (role) query.role = role;
        if (isActive !== undefined) query.isActive = isActive === 'true';
        
        const users = await User.find(query)
            .skip(parseInt(offset))
            .limit(parseInt(limit))
            .sort({ createdAt: -1 })
            .select('-password -twoFactorSecret');
        
        const total = await User.countDocuments(query);
        
        logger.info('📊 جلب المستخدمين', {
            userId: req.userId,
            count: users.length,
            total: total
        });
        
        res.json({
            success: true,
            users,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
        
    } catch (error) {
        logger.error('❌ خطأ في جلب المستخدمين:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب البيانات'
        });
    }
}

/**
 * الحصول على مستخدم واحد
 */
async function getUser(req, res) {
    try {
        const { id } = req.params;
        
        const user = await User.findOne({ id }).select('-password -twoFactorSecret');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'المستخدم غير موجود'
            });
        }
        
        res.json({
            success: true,
            user
        });
        
    } catch (error) {
        logger.error('❌ خطأ في جلب المستخدم:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب البيانات'
        });
    }
}

/**
 * إنشاء مستخدم جديد
 */
async function createUser(req, res) {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: errors.array()[0].msg
            });
        }
        
        const { username, email, name, role = 'viewer', password } = req.body;
        
        // التحقق من عدم وجود مستخدم بنفس الاسم أو البريد
        const existing = await User.findOne({
            $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }]
        });
        
        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل'
            });
        }
        
        // إذا لم يتم توفير كلمة مرور، إنشاء كلمة مرور عشوائية
        const finalPassword = password || Math.random().toString(36).slice(-12);
        
        const user = new User({
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            name: name.trim(),
            role: role,
            password: finalPassword
        });
        
        await user.save();
        
        logger.info('✅ تم إنشاء مستخدم جديد', {
            userId: req.userId,
            newUserId: user.id,
            username: user.username
        });
        
        res.status(201).json({
            success: true,
            message: 'تم إنشاء المستخدم بنجاح',
            user: user.toSafeObject(),
            temporaryPassword: password ? undefined : finalPassword
        });
        
    } catch (error) {
        logger.error('❌ خطأ في إنشاء المستخدم:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في إنشاء المستخدم'
        });
    }
}

/**
 * تحديث مستخدم
 */
async function updateUser(req, res) {
    try {
        const { id } = req.params;
        const { username, email, name, role, isActive } = req.body;
        
        const user = await User.findOne({ id });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'المستخدم غير موجود'
            });
        }
        
        // منع تغيير دور المستخدم نفسه
        if (id === req.userId && role && role !== user.role) {
            return res.status(403).json({
                success: false,
                error: 'لا يمكنك تغيير دورك بنفسك'
            });
        }
        
        // تحديث الحقول
        if (username) user.username = username.toLowerCase();
        if (email) user.email = email.toLowerCase();
        if (name) user.name = name.trim();
        if (role) user.role = role;
        if (isActive !== undefined) user.isActive = isActive;
        
        await user.save();
        
        logger.info('✅ تم تحديث المستخدم', {
            userId: req.userId,
            updatedUserId: user.id,
            username: user.username
        });
        
        res.json({
            success: true,
            message: 'تم تحديث المستخدم بنجاح',
            user: user.toSafeObject()
        });
        
    } catch (error) {
        logger.error('❌ خطأ في تحديث المستخدم:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في تحديث المستخدم'
        });
    }
}

/**
 * حذف مستخدم
 */
async function deleteUser(req, res) {
    try {
        const { id } = req.params;
        
        // منع حذف المستخدم نفسه
        if (id === req.userId) {
            return res.status(403).json({
                success: false,
                error: 'لا يمكنك حذف حسابك بنفسك'
            });
        }
        
        const user = await User.findOne({ id });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'المستخدم غير موجود'
            });
        }
        
        // إنهاء جميع جلسات المستخدم
        await Session.invalidateAllForUser(id);
        
        await user.deleteOne();
        
        logger.info('🗑️ تم حذف المستخدم', {
            userId: req.userId,
            deletedUserId: user.id,
            username: user.username
        });
        
        res.json({
            success: true,
            message: 'تم حذف المستخدم بنجاح'
        });
        
    } catch (error) {
        logger.error('❌ خطأ في حذف المستخدم:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في حذف المستخدم'
        });
    }
}

/**
 * تغيير كلمة المرور
 */
async function changePassword(req, res) {
    try {
        const { id } = req.params;
        const { password } = req.body;
        
        const user = await User.findOne({ id });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'المستخدم غير موجود'
            });
        }
        
        // تشفير كلمة المرور الجديدة
        const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 12);
        user.password = await bcrypt.hash(password, salt);
        await user.save();
        
        // إنهاء جميع جلسات المستخدم (إجباره على تسجيل الدخول مجدداً)
        await Session.invalidateAllForUser(id);
        
        logger.info('🔑 تم تغيير كلمة المرور', {
            userId: req.userId,
            targetUserId: user.id,
            username: user.username
        });
        
        res.json({
            success: true,
            message: 'تم تغيير كلمة المرور بنجاح'
        });
        
    } catch (error) {
        logger.error('❌ خطأ في تغيير كلمة المرور:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في تغيير كلمة المرور'
        });
    }
}

/**
 * تحديث صلاحيات المستخدم
 */
async function updatePermissions(req, res) {
    try {
        const { id } = req.params;
        const { permissions } = req.body;
        
        const user = await User.findOne({ id });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'المستخدم غير موجود'
            });
        }
        
        user.permissions = permissions;
        await user.save();
        
        logger.info('✅ تم تحديث صلاحيات المستخدم', {
            userId: req.userId,
            targetUserId: user.id,
            username: user.username,
            permissions: permissions
        });
        
        res.json({
            success: true,
            message: 'تم تحديث الصلاحيات بنجاح',
            permissions: user.permissions
        });
        
    } catch (error) {
        logger.error('❌ خطأ في تحديث الصلاحيات:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في تحديث الصلاحيات'
        });
    }
}

module.exports = {
    getUsers,
    getUser,
    createUser,
    updateUser,
    deleteUser,
    changePassword,
    updatePermissions
};
