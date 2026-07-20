const User = require('../models/User');
const { logger, logSecurity } = require('../services/logger');
const { AppError } = require('../middleware/errorHandler');

class AuthController {
  // تسجيل الدخول
  static async login(req, res, next) {
    try {
      const { email, password } = req.body;

      const user = await User.findByCredentials(email, password);
      await user.updateLastLogin();

      const token = user.generateAuthToken();
      const refreshToken = user.generateRefreshToken();

      logger.info('User logged in', {
        userId: user._id,
        email: user.email,
        ip: req.ip
      });

      res.json({
        success: true,
        token,
        refreshToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          preferences: user.preferences
        }
      });
    } catch (error) {
      logSecurity('Login failed', {
        email: req.body.email,
        ip: req.ip,
        error: error.message
      });
      
      if (error.message === 'Account locked') {
        return res.status(403).json({
          success: false,
          error: 'الحساب مقفل بسبب محاولات فاشلة',
          code: 'ACCOUNT_LOCKED'
        });
      }
      
      next(error);
    }
  }

  // تسجيل مستخدم جديد
  static async register(req, res, next) {
    try {
      const { name, email, password, role } = req.body;

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new AppError('البريد الإلكتروني موجود بالفعل', 400, 'DUPLICATE_EMAIL');
      }

      const user = new User({
        name,
        email,
        password,
        role: role || 'مستخدم'
      });

      await user.save();

      logger.info('New user registered', {
        userId: user._id,
        email: user.email,
        ip: req.ip
      });

      res.status(201).json({
        success: true,
        message: 'تم إنشاء الحساب بنجاح',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // الحصول على معلومات المستخدم الحالي
  static async me(req, res, next) {
    try {
      res.json({
        success: true,
        user: req.user
      });
    } catch (error) {
      next(error);
    }
  }

  // تحديث معلومات المستخدم
  static async updateProfile(req, res, next) {
    try {
      const updates = req.body;
      const allowedUpdates = ['name', 'preferences'];
      
      Object.keys(updates).forEach(key => {
        if (allowedUpdates.includes(key)) {
          req.user[key] = updates[key];
        }
      });

      await req.user.save();

      res.json({
        success: true,
        message: 'تم تحديث الملف الشخصي',
        user: req.user
      });
    } catch (error) {
      next(error);
    }
  }

  // تغيير كلمة المرور
  static async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;

      const user = await User.findById(req.user._id).select('+password');
      const isMatch = await user.comparePassword(currentPassword);
      
      if (!isMatch) {
        throw new AppError('كلمة المرور الحالية غير صحيحة', 400, 'INVALID_PASSWORD');
      }

      user.password = newPassword;
      user.passwordChangedAt = new Date();
      await user.save();

      logger.info('Password changed', {
        userId: user._id,
        ip: req.ip
      });

      res.json({
        success: true,
        message: 'تم تغيير كلمة المرور بنجاح'
      });
    } catch (error) {
      next(error);
    }
  }

  // حذف المستخدم
  static async deleteAccount(req, res, next) {
    try {
      await User.findByIdAndDelete(req.user._id);
      
      logger.info('Account deleted', {
        userId: req.user._id,
        email: req.user.email,
        ip: req.ip
      });

      res.json({
        success: true,
        message: 'تم حذف الحساب بنجاح'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AuthController;
