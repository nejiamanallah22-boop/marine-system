// ============================================================
// 🛠️ utils.js - دوال مساعدة (بدون require)
// ============================================================

// ============================================================
// 📅 دوال التاريخ والوقت
// ============================================================

function getCurrentTime() {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

function getCurrentDate() {
  return new Date().toISOString().split('T')[0];
}

function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function formatDate(date, format = 'ar') {
  if (!date) return '-';
  const d = new Date(date);
  if (format === 'ar') {
    return d.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
  return d.toISOString().split('T')[0];
}

function timeAgo(date) {
  if (!date) return '-';
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
}

// ============================================================
// 📱 دوال الجهاز والمتصفح
// ============================================================

function extractDevice(userAgent) {
  if (!userAgent) return 'غير معروف';
  const ua = userAgent.toLowerCase();
  if (ua.includes('android')) return 'Android';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('macintosh')) return 'Mac';
  if (ua.includes('linux')) return 'Linux';
  return 'غير معروف';
}

function extractBrowser(userAgent) {
  if (!userAgent) return 'غير معروف';
  const ua = userAgent.toLowerCase();
  if (ua.includes('edg') || ua.includes('edge')) return 'Edge';
  if (ua.includes('opera') || ua.includes('opr')) return 'Opera';
  if (ua.includes('chrome')) return 'Chrome';
  if (ua.includes('firefox')) return 'Firefox';
  if (ua.includes('safari')) return 'Safari';
  return 'غير معروف';
}

// ============================================================
// 🚢 دوال المراكب
// ============================================================

function determineCategory(length) {
  const n = parseFloat(length);
  if (n === 11) return 'البروق';
  if (n >= 8 && n <= 12) return 'صقور';
  if (n > 12 && n <= 25) return 'خوافر';
  if (n > 30) return 'طوافات';
  return 'زوارق مزدوجة';
}

function getStatusClass(status) {
  const map = {
    'صالح': 'status-good',
    'معطب': 'status-bad',
    'صيانة': 'status-maintenance'
  };
  return map[status] || 'status-good';
}

function getStatusIcon(status) {
  const map = {
    'صالح': '✅',
    'معطب': '❌',
    'صيانة': '🔧'
  };
  return map[status] || '✅';
}

// ============================================================
// 🎨 دوال التنسيق
// ============================================================

function truncateText(text, length = 50) {
  if (!text) return '';
  if (text.length <= length) return text;
  return text.substring(0, length) + '...';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function debounce(func, wait = 300) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function getStatusColor(status) {
  const map = {
    'صالح': '#28a745',
    'معطب': '#dc3545',
    'صيانة': '#ffc107',
    'قيد المعالجة': '#ffc107',
    'تم الرد': '#17a2b8',
    'مغلقة': '#28a745'
  };
  return map[status] || '#6c757d';
}

// ============================================================
// 🔄 تصدير للاستخدام العالمي
// ============================================================

window.getCurrentTime = getCurrentTime;
window.getCurrentDate = getCurrentDate;
window.getWeekNumber = getWeekNumber;
window.formatDate = formatDate;
window.timeAgo = timeAgo;
window.extractDevice = extractDevice;
window.extractBrowser = extractBrowser;
window.determineCategory = determineCategory;
window.getStatusClass = getStatusClass;
window.getStatusIcon = getStatusIcon;
window.truncateText = truncateText;
window.escapeHtml = escapeHtml;
window.generateId = generateId;
window.debounce = debounce;
window.getStatusColor = getStatusColor;
