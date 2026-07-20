const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const { logger, logSecurity } = require('../services/logger');
const cacheService = require('../services/cacheService');

// قائمة سوداء للتوكنات (في Redis)
const TOKEN_BLACKLIST_PREFIX = 'blacklist:';

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'يرجى تسجيل الدخول أولاً',
        code: 'AUTH_REQUIRED'
      });
    }

    const token = authHeader.split(' ')[1];
    
    // التحقق من القائمة السوداء
    const isBlacklisted = await cacheService.get(`${TOKEN_BLACKLIST_PREFIX}${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        error: 'تم تسجيل الخروج، يرجى تسجيل الدخول مجدداً',
        code: 'TOKEN_REVOKED'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'انتهت صلاحية الجلسة',
          code: 'TOKEN_EXPIRED'
        });
      }
      return res.status(401).json({
        success: false,
        error: 'توكن غير صالح',
        code: 'INVALID_TOKEN'
      });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'المستخدم غير موجود',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'الحساب غير مفعل',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    if (user.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({
        success: false,
        error: 'تم تغيير كلمة المرور',
        code: 'PASSWORD_CHANGED'
      });
    }

    req.user = user;
    req.token = token;
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

    next();
  };
};

const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token مطلوب'
      });
    }

    const decoded = jwt.verify(refreshToken, config.jwt.secret + '_refresh');
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'مستخدم غير موجود'
      });
    }

    const newToken = user.generateAuthToken();
    const newRefreshToken = user.generateRefreshToken();

    res.json({
      success: true,
      token: newToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Refresh token غير صالح'
    });
  }
};

const logout = async (req, res) => {
  try {
    const token = req.token;
    if (token) {
      // إضافة التوكن إلى القائمة السوداء
      const decoded = jwt.decode(token);
      if (decoded && decoded.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await cacheService.set(
            `${TOKEN_BLACKLIST_PREFIX}${token}`,
            true,
            ttl
          );
        }
      }
    }

    logger.info('User logged out', {
      userId: req.user?._id,
      name: req.user?.name
    });

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
  refreshToken,
  logout
};
