const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { logger, logSecurity } = require('../services/logger');
const { config } = require('../config/env');

/**
 * ✅ Middleware للمصادقة
 */
const authenticate = async (req, res, next) => {
  try {
    // الحصول على التوكن من الهيدر
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logSecurity('Missing auth token', { ip: req.ip, path: req.path });
      return res.status(401).json({
        success: false,
        error: 'يرجى تسجيل الدخول أولاً',
        code: 'AUTH_REQUIRED'
      });
    }

    const token = authHeader.split(' ')[1];
    
    // التحقق من التوكن
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (error) {
      logSecurity('Invalid token', { 
        ip: req.ip, 
        error: error.message,
        path: req.path 
      });
      
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      return res.status(401).json({
        success: false,
        error: 'توكن غير صالح',
        code: 'INVALID_TOKEN'
      });
    }

    // الحصول على المستخدم
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      logSecurity('User not found', { userId: decoded.id, ip: req.ip });
      return res.status(401).json({
        success: false,
        error: 'المستخدم غير موجود',
        code: 'USER_NOT_FOUND'
      });
    }

    // التحقق من حالة المستخدم
    if (!user.isActive) {
      logSecurity('Inactive user login attempt', { userId: user._id, ip: req.ip });
      return res.status(403).json({
        success: false,
        error: 'الحساب غير مفعل',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    // التحقق من تغيير كلمة المرور بعد إصدار التوكن
    if (user.changedPasswordAfter(decoded.iat)) {
      logSecurity('Password changed after token issued', { userId: user._id, ip: req.ip });
      return res.status(401).json({
        success: false,
        error: 'تم تغيير كلمة المرور، يرجى تسجيل الدخول مجدداً',
        code: 'PASSWORD_CHANGED'
      });
    }

    // إضافة المستخدم للـ Request
    req.user = user;
    req.token = token;
    
    // تسجيل النشاط
    logger.info('User authenticated', {
      userId: user._id,
      name: user.name,
      role: user.role,
      path: req.path,
      method: req.method
    });

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'خطأ في المصادقة',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * ✅ Middleware للصلاحيات
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'يرجى تسجيل الدخول أولاً',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logSecurity('Unauthorized access attempt', {
        userId: req.user._id,
        role: req.user.role,
        requiredRoles: allowedRoles,
        path: req.path,
        method: req.method,
        ip: req.ip
      });

      return res.status(403).json({
        success: false,
        error: 'غير مصرح لك بهذه العملية',
        code: 'FORBIDDEN'
      });
    }

    // تسجيل الوصول المصرح به
    logger.info('Authorized access', {
      userId: req.user._id,
      role: req.user.role,
      path: req.path,
      method: req.method
    });

    next();
  };
};

/**
 * ✅ Middleware للتحقق من صلاحيات الموارد
 */
const checkResourceOwnership = (modelName, paramId = 'id') => {
  return async (req, res, next) => {
    try {
      const Model = require(`../models/${modelName}`);
      const resource = await Model.findById(req.params[paramId]);
      
      if (!resource) {
        return res.status(404).json({
          success: false,
          error: 'المورد غير موجود',
          code: 'RESOURCE_NOT_FOUND'
        });
      }

      // مسؤول أو محرر يمكنهم الوصول لكل الموارد
      if (['مسؤول', 'محرر'].includes(req.user.role)) {
        req.resource = resource;
        return next();
      }

      // التحقق من ملكية المورد
      if (resource.userId && resource.userId.toString() !== req.user._id.toString()) {
        logSecurity('Resource ownership violation', {
          userId: req.user._id,
          resourceId: resource._id,
          model: modelName,
          path: req.path
        });

        return res.status(403).json({
          success: false,
          error: 'غير مصرح لك بالوصول إلى هذا المورد',
          code: 'RESOURCE_FORBIDDEN'
        });
      }

      req.resource = resource;
      next();
    } catch (error) {
      logger.error('Resource ownership check error:', error);
      res.status(500).json({
        success: false,
        error: 'خطأ في التحقق من صلاحيات المورد'
      });
    }
  };
};

/**
 * ✅ Middleware لتحديث آخر نشاط
 */
const updateLastActivity = async (req, res, next) => {
  if (req.user) {
    try {
      await User.findByIdAndUpdate(req.user._id, {
        lastActivity: new Date()
      });
    } catch (error) {
      // لا نقطع العملية إذا فشل التحديث
      logger.warn('Failed to update last activity:', error);
    }
  }
  next();
};

/**
 * ✅ Middleware لتسجيل الخروج
 */
const logout = async (req, res) => {
  try {
    if (req.user) {
      // إلغاء التوكن (في حالة استخدام Blacklist)
      // يمكن إضافة التوكن إلى قائمة سوداء في Redis
      logger.info('User logged out', {
        userId: req.user._id,
        name: req.user.name
      });
    }

    res.json({
      success: true,
      message: 'تم تسجيل الخروج بنجاح'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'خطأ في تسجيل الخروج'
    });
  }
};

module.exports = {
  authenticate,
  authorize,
  checkResourceOwnership,
  updateLastActivity,
  logout
};
