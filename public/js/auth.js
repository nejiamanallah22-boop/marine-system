// ============================================================
// 🔐 auth.js - المصادقة (بدون require)
// ============================================================

// ============================================================
// 🚀 تهيئة
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  console.log('✅ auth.js تم تحميله بنجاح');
});

// ============================================================
// 🔐 دوال المصادقة
// ============================================================

function getToken() {
  return localStorage.getItem('token');
}

function getUser() {
  try {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
}

function isAuthenticated() {
  return !!getToken();
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.reload();
}

function getAuthHeaders() {
  const token = getToken();
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}

// ============================================================
// 🔄 تصدير للاستخدام العالمي
// ============================================================

window.getToken = getToken;
window.getUser = getUser;
window.isAuthenticated = isAuthenticated;
window.logout = logout;
window.getAuthHeaders = getAuthHeaders;
