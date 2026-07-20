const { logger } = require('../services/logger');
const { env } = require('../config/env');

/**
 * ✅ معالج الأخطاء المتقدم
 */
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

/**
 * ✅ معالجة أخطاء Mongoose
 */
const handleMongooseError = (err) => {
  // خطأ التكرار (Duplicate Key)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    const message = `${field} موجود بالفعل`;
    return new AppError(message, 409, 'DUPLICATE_ENTRY', { field });
  }

  // خطأ التحقق (Validation Error)
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return new AppError(errors.join(', '), 400, 'VALIDATION_ERROR', errors);
  }

  // خطأ في المعرف (Cast Error)
  if (err.name === 'CastError') {
    return new AppError('معرف غير صالح', 400, 'INVALID_ID');
  }

  return err;
};

/**
 * ✅ معالجة أخطاء JWT
 */
const handleJWTError = (err) => {
  if (err.name === 'JsonWebTokenError') {
    return new AppError('توكن غير صالح', 401, 'INVALID_TOKEN');
  }
  if (err.name === 'TokenExpiredError') {
    return new AppError('انتهت صلاحية التوكن', 401, 'TOKEN_EXPIRED');
  }
  return err;
};

/**
 * ✅ Middleware معالجة الأخطاء الرئيسي
 */
const errorHandler = (err, req, res, next) => {
  // تحويل الأخطاء إلى AppError
  let error = err;
  
  if (err.name === 'ValidationError' || err.code === 11000) {
    error = handleMongooseError(err);
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    error = handleJWTError(err);
  } else if (!(err instanceof AppError)) {
    error = new AppError(
      err.message || 'حدث خطأ ما',
      err.statusCode || 500,
      err.code || 'INTERNAL_ERROR'
    );
  }

  // تسجيل الخطأ
  if (error.statusCode >= 500) {
    logger.error('Server Error:', {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userId: req.user?._id
    });
  } else {
    logger.warn('Client Error:', {
      error: error.message,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userId: req.user?._id,
      details: error.details
    });
  }

  // الرد على العميل
  const response = {
    success: false,
    error: error.message || 'حدث خطأ ما',
    code: error.code || 'INTERNAL_ERROR'
  };

  // إضافة التفاصيل في بيئة التطوير
  if (env === 'development' || env === 'test') {
    response.stack = error.stack;
    response.details = error.details;
  }

  // إضافة التفاصيل في حالة أخطاء التحقق
  if (error.details && error.statusCode === 400) {
    response.details = error.details;
  }

  res.status(error.statusCode || 500).json(response);
};

/**
 * ✅ Middleware للمسارات غير الموجودة
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: 'المسار غير موجود',
    code: 'NOT_FOUND',
    path: req.path
  });
};

/**
 * ✅ Middleware لتسجيل الأخطاء غير المتوقعة
 */
const unhandledRejectionHandler = (error) => {
  logger.error('Unhandled Rejection:', {
    error: error.message,
    stack: error.stack
  });
  // إغلاق التطبيق بأمان في الإنتاج
  if (env === 'production') {
    process.exit(1);
  }
};

const uncaughtExceptionHandler = (error) => {
  logger.error('Uncaught Exception:', {
    error: error.message,
    stack: error.stack
  });
  // إغلاق التطبيق بأمان
  process.exit(1);
};

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
  unhandledRejectionHandler,
  uncaughtExceptionHandler
};
