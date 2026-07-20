const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

/**
 * ✅ الحصول على الوقت الحالي بتنسيق HH:MM
 */
const getCurrentTime = () => {
  const now = new Date();
  return now.toLocaleTimeString('ar-EG', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
};

/**
 * ✅ الحصول على التاريخ الحالي بتنسيق YYYY-MM-DD
 */
const getCurrentDate = () => {
  return new Date().toISOString().split('T')[0];
};

/**
 * ✅ حساب رقم الأسبوع
 */
const getWeekNumber = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
};

/**
 * ✅ استخراج نوع الجهاز من User Agent
 */
const extractDevice = (userAgent) => {
  if (!userAgent) return 'غير معروف';
  
  const ua = userAgent.toLowerCase();
  if (ua.includes('android')) return 'Android';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('macintosh')) return 'Mac';
  if (ua.includes('linux')) return 'Linux';
  return 'غير معروف';
};

/**
 * ✅ استخراج نوع المتصفح من User Agent
 */
const extractBrowser = (userAgent) => {
  if (!userAgent) return 'غير معروف';
  
  const ua = userAgent.toLowerCase();
  if (ua.includes('edg') || ua.includes('edge')) return 'Edge';
  if (ua.includes('opera') || ua.includes('opr')) return 'Opera';
  if (ua.includes('chrome')) return 'Chrome';
  if (ua.includes('firefox')) return 'Firefox';
  if (ua.includes('safari')) return 'Safari';
  return 'غير معروف';
};

/**
 * ✅ استخراج معلومات IP
 */
const getClientIP = (req) => {
  return req.ip || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress || 
         req.connection?.socket?.remoteAddress ||
         'غير معروف';
};

/**
 * ✅ توليد معرف فريد
 */
const generateId = () => {
  return uuidv4();
};

/**
 * ✅ توليد رمز عشوائي آمن
 */
const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * ✅ تشفير نص
 */
const encryptText = (text, secret) => {
  const cipher = crypto.createCipher('aes-256-cbc', secret);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
};

/**
 * ✅ فك تشفير نص
 */
const decryptText = (encrypted, secret) => {
  const decipher = crypto.createDecipher('aes-256-cbc', secret);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

/**
 * ✅ التحقق من صحة البريد الإلكتروني
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * ✅ التحقق من قوة كلمة المرور
 */
const isStrongPassword = (password) => {
  // على الأقل: 8 أحرف، حرف كبير، حرف صغير، رقم، رمز خاص
  const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return strongRegex.test(password);
};

/**
 * ✅ تنسيق التاريخ
 */
const formatDate = (date, format = 'ar') => {
  if (!date) return '';
  
  const d = new Date(date);
  if (format === 'ar') {
    return d.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
  
  return d.toISOString().split('T')[0];
};

/**
 * ✅ حساب فارق الوقت
 */
const timeAgo = (date) => {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  
  const intervals = {
    سنة: 31536000,
    شهر: 2592000,
    أسبوع: 604800,
    يوم: 86400,
    ساعة: 3600,
    دقيقة: 60
  };
  
  for (const [unit, value] of Object.entries(intervals)) {
    const count = Math.floor(seconds / value);
    if (count >= 1) {
      return `منذ ${count} ${unit}${count > 1 ? 'ات' : ''}`;
    }
  }
  
  return 'الآن';
};

/**
 * ✅ تنظيف النص من الـ XSS
 */
const sanitizeText = (text) => {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

module.exports = {
  getCurrentTime,
  getCurrentDate,
  getWeekNumber,
  extractDevice,
  extractBrowser,
  getClientIP,
  generateId,
  generateSecureToken,
  encryptText,
  decryptText,
  isValidEmail,
  isStrongPassword,
  formatDate,
  timeAgo,
  sanitizeText
};
