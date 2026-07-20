const { body, param, query, validationResult } = require('express-validator');
const { logger } = require('../services/logger');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const extractedErrors = errors.array().map(err => ({
    field: err.path,
    message: err.msg,
    value: err.value
  }));

  logger.warn('Validation failed', {
    path: req.path,
    method: req.method,
    errors: extractedErrors,
    ip: req.ip
  });

  return res.status(400).json({
    success: false,
    error: 'بيانات غير صالحة',
    code: 'VALIDATION_ERROR',
    details: extractedErrors
  });
};

// قواعد التحقق
const authValidation = {
  login: [
    body('email')
      .trim()
      .notEmpty().withMessage('البريد الإلكتروني مطلوب')
      .isEmail().withMessage('بريد إلكتروني غير صالح')
      .normalizeEmail(),
    
    body('password')
      .notEmpty().withMessage('كلمة المرور مطلوبة')
      .isLength({ min: 6 }).withMessage('كلمة المرور 6 أحرف على الأقل')
  ],
  
  register: [
    body('name')
      .trim()
      .notEmpty().withMessage('الاسم مطلوب')
      .isLength({ min: 2, max: 50 }).withMessage('الاسم بين 2-50 حرف')
      .matches(/^[\u0600-\u06FFa-zA-Z\s]+$/).withMessage('أحرف غير صالحة'),
    
    body('email')
      .trim()
      .notEmpty().withMessage('البريد الإلكتروني مطلوب')
      .isEmail().withMessage('بريد إلكتروني غير صالح')
      .normalizeEmail(),
    
    body('password')
      .notEmpty().withMessage('كلمة المرور مطلوبة')
      .isLength({ min: 8 }).withMessage('كلمة المرور 8 أحرف على الأقل')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
      .withMessage('كلمة المرور تحتوي على حرف كبير وصغير ورقم ورمز خاص')
  ]
};

const vesselValidation = {
  create: [
    body('name')
      .trim()
      .notEmpty().withMessage('اسم المركب مطلوب')
      .isLength({ max: 100 }).withMessage('الاسم طويل جداً'),
    
    body('len')
      .optional()
      .isFloat({ min: 0, max: 100 }).withMessage('الطول بين 0-100 متر'),
    
    body('stat')
      .optional()
      .isIn(['صالح', 'معطب', 'صيانة']).withMessage('حالة غير صالحة')
  ],
  
  update: [
    param('id').isMongoId().withMessage('معرف غير صالح'),
    body('name')
      .optional()
      .trim()
      .isLength({ max: 100 }).withMessage('الاسم طويل جداً')
  ]
};

const ticketValidation = {
  create: [
    body('subject')
      .trim()
      .notEmpty().withMessage('الموضوع مطلوب')
      .isLength({ min: 3, max: 100 }).withMessage('الموضوع بين 3-100 حرف'),
    
    body('message')
      .trim()
      .notEmpty().withMessage('الرسالة مطلوبة')
      .isLength({ min: 10 }).withMessage('الرسالة 10 أحرف على الأقل')
  ],
  
  reply: [
    param('id').isMongoId().withMessage('معرف غير صالح'),
    body('reply')
      .trim()
      .notEmpty().withMessage('الرد مطلوب')
      .isLength({ min: 3 }).withMessage('الرد 3 أحرف على الأقل')
  ]
};

const noteValidation = {
  create: [
    body('title')
      .trim()
      .notEmpty().withMessage('العنوان مطلوب')
      .isLength({ min: 3, max: 100 }).withMessage('العنوان بين 3-100 حرف'),
    
    body('content')
      .trim()
      .notEmpty().withMessage('المحتوى مطلوب')
      .isLength({ min: 10 }).withMessage('المحتوى 10 أحرف على الأقل'),
    
    body('date')
      .notEmpty().withMessage('التاريخ مطلوب')
      .isISO8601().withMessage('تاريخ غير صالح')
  ]
};

const locationValidation = {
  create: [
    body('lat')
      .notEmpty().withMessage('خط العرض مطلوب')
      .isFloat({ min: -90, max: 90 }).withMessage('خط العرض غير صالح'),
    
    body('lng')
      .notEmpty().withMessage('خط الطول مطلوب')
      .isFloat({ min: -180, max: 180 }).withMessage('خط الطول غير صالح')
  ]
};

module.exports = {
  validate,
  authValidation,
  vesselValidation,
  ticketValidation,
  noteValidation,
  locationValidation
};
