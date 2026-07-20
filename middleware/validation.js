const { validationResult, body, param, query } = require('express-validator');
const { logger } = require('../services/logger');

/**
 * ✅ التحقق من نتائج الـ Validation
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

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

/**
 * ✅ قواعد التحقق من المستخدم
 */
const userValidation = {
  register: [
    body('name')
      .trim()
      .notEmpty().withMessage('الاسم مطلوب')
      .isLength({ min: 2, max: 50 }).withMessage('الاسم يجب أن يكون بين 2 و 50 حرف')
      .matches(/^[\u0600-\u06FFa-zA-Z\s]+$/).withMessage('الاسم يحتوي على أحرف غير صالحة'),
    
    body('email')
      .trim()
      .notEmpty().withMessage('البريد الإلكتروني مطلوب')
      .isEmail().withMessage('بريد إلكتروني غير صالح')
      .normalizeEmail(),
    
    body('password')
      .notEmpty().withMessage('كلمة المرور مطلوبة')
      .isLength({ min: 6 }).withMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('كلمة المرور يجب أن تحتوي على حرف كبير وصغير ورقم'),
    
    body('role')
      .optional()
      .isIn(['مسؤول', 'محرر', 'مستخدم']).withMessage('دور غير صالح')
  ],
  
  login: [
    body('email')
      .trim()
      .notEmpty().withMessage('البريد الإلكتروني مطلوب')
      .isEmail().withMessage('بريد إلكتروني غير صالح'),
    
    body('password')
      .notEmpty().withMessage('كلمة المرور مطلوبة')
  ],
  
  update: [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 }).withMessage('الاسم يجب أن يكون بين 2 و 50 حرف'),
    
    body('email')
      .optional()
      .trim()
      .isEmail().withMessage('بريد إلكتروني غير صالح')
      .normalizeEmail(),
    
    body('role')
      .optional()
      .isIn(['مسؤول', 'محرر', 'مستخدم']).withMessage('دور غير صالح')
  ],
  
  changePassword: [
    body('currentPassword')
      .notEmpty().withMessage('كلمة المرور الحالية مطلوبة'),
    
    body('newPassword')
      .notEmpty().withMessage('كلمة المرور الجديدة مطلوبة')
      .isLength({ min: 6 }).withMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('كلمة المرور يجب أن تحتوي على حرف كبير وصغير ورقم'),
    
    body('confirmPassword')
      .notEmpty().withMessage('تأكيد كلمة المرور مطلوب')
      .custom((value, { req }) => value === req.body.newPassword).withMessage('كلمة المرور غير متطابقة')
  ]
};

/**
 * ✅ قواعد التحقق من المراكب
 */
const vesselValidation = {
  create: [
    body('name')
      .trim()
      .notEmpty().withMessage('اسم المركب مطلوب')
      .isLength({ max: 100 }).withMessage('الاسم طويل جداً'),
    
    body('num')
      .optional()
      .trim()
      .isLength({ max: 50 }).withMessage('الرقم طويل جداً'),
    
    body('len')
      .optional()
      .isFloat({ min: 0, max: 100 }).withMessage('الطول يجب أن يكون بين 0 و 100 متر'),
    
    body('cat')
      .optional()
      .isIn(['زوارق مزدوجة', 'البروق', 'صقور', 'خوافر', 'طوافات']).withMessage('فئة غير صالحة'),
    
    body('stat')
      .optional()
      .isIn(['صالح', 'معطب', 'صيانة']).withMessage('حالة غير صالحة')
  ],
  
  update: [
    param('id')
      .isMongoId().withMessage('معرف غير صالح'),
    
    body('name')
      .optional()
      .trim()
      .isLength({ max: 100 }).withMessage('الاسم طويل جداً'),
    
    body('len')
      .optional()
      .isFloat({ min: 0, max: 100 }).withMessage('الطول يجب أن يكون بين 0 و 100 متر'),
    
    body('stat')
      .optional()
      .isIn(['صالح', 'معطب', 'صيانة']).withMessage('حالة غير صالحة')
  ]
};

/**
 * ✅ قواعد التحقق من التذاكر
 */
const ticketValidation = {
  create: [
    body('subject')
      .trim()
      .notEmpty().withMessage('الموضوع مطلوب')
      .isLength({ min: 3, max: 100 }).withMessage('الموضوع يجب أن يكون بين 3 و 100 حرف'),
    
    body('message')
      .trim()
      .notEmpty().withMessage('الرسالة مطلوبة')
      .isLength({ min: 10 }).withMessage('الرسالة يجب أن تكون 10 أحرف على الأقل')
  ],
  
  reply: [
    param('id')
      .isMongoId().withMessage('معرف غير صالح'),
    
    body('reply')
      .trim()
      .notEmpty().withMessage('الرد مطلوب')
      .isLength({ min: 3 }).withMessage('الرد يجب أن يكون 3 أحرف على الأقل')
  ]
};

/**
 * ✅ قواعد التحقق من المواقع
 */
const locationValidation = {
  create: [
    body('lat')
      .notEmpty().withMessage('خط العرض مطلوب')
      .isFloat({ min: -90, max: 90 }).withMessage('خط العرض غير صالح'),
    
    body('lng')
      .notEmpty().withMessage('خط الطول مطلوب')
      .isFloat({ min: -180, max: 180 }).withMessage('خط الطول غير صالح'),
    
    body('action')
      .optional()
      .trim()
      .isLength({ max: 50 }).withMessage('الإجراء طويل جداً')
  ]
};

/**
 * ✅ قواعد التحقق من المذكرات
 */
const noteValidation = {
  create: [
    body('title')
      .trim()
      .notEmpty().withMessage('العنوان مطلوب')
      .isLength({ min: 3, max: 100 }).withMessage('العنوان يجب أن يكون بين 3 و 100 حرف'),
    
    body('content')
      .trim()
      .notEmpty().withMessage('المحتوى مطلوب')
      .isLength({ min: 10 }).withMessage('المحتوى يجب أن يكون 10 أحرف على الأقل'),
    
    body('date')
      .notEmpty().withMessage('التاريخ مطلوب')
      .isISO8601().withMessage('تاريخ غير صالح')
  ]
};

module.exports = {
  validate,
  userValidation,
  vesselValidation,
  ticketValidation,
  locationValidation,
  noteValidation
};
