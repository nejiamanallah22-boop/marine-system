const { logger, logError } = require('../services/logger');
const config = require('../config');

// خطأ مخصص
class AppError extends Error {
  constructor(message, statusCode, code = 'APP_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// معالج أخطاء Mongoose
const handleMongooseError = (err) => {
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return new AppError(`${field} موجود بالفعل`, 409, 'DUPLICATE_ENTRY', { field });
  }
  
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return new AppError('بيانات غير صالحة', 400, 'VALIDATION_ERROR', errors);
  }
  
  if (err.name === 'CastError') {
    return new AppError('معرف غير صالح', 400, 'INVALID_ID');
  }
  
  return err;
};

// معالج أخطاء JWT
const handleJWTError = (err) => {
  if (err.name === 'JsonWebTokenError') {
    return new AppError('توكن غير صالح', 401, 'INVALID_TOKEN');
  }
  if (err.name === 'TokenExpiredError') {
    return new AppError('انتهت صلاحية التوكن', 401, 'TOKEN_EXPIRED');
  }
  return err;
};

// Middleware معالجة الأخطاء الرئيسي
const errorHandler = (err, req, res, next) => {
  let error = err;
  
  // تحويل الأخطاء
  if (err.name === 'ValidationError' || err.code === 11000) {
    error = handleMongooseError(err);
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    error = handleJWTError(err);
  } else if (!(err instanceof AppError)) {
    error = new AppError(
      err.message || 'حدث خطأ ما',
      err.statusCode || 500,
      'INTERNAL_ERROR'
    );
  }

  // تسجيل الخطأ
  if (error.statusCode >= 500) {
    logError(error, {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userId: req.user?._id
    });
  } else {
    logger.warn('Client error', {
      error: error.message,
      code: error.code,
      path: req.path,
      method: req.method,
      userId: req.user?._id
    });
  }

  // الرد
  const response = {
    success: false,
    error: error.message,
    code: error.code
  };

  if (config.env === 'development') {
    response.stack = error.stack;
    response.details = error.details;
  }

  if (error.details && error.statusCode === 400) {
    response.details = error.details;
  }

  res.status(error.statusCode || 500).json(response);
};

// Middleware للمسارات غير الموجودة
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: 'المسار غير موجود',
    code: 'NOT_FOUND',
    path: req.path
  });
};

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler
};
