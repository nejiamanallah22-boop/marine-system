// ============================================================
// 📦 app.js - إصلاح مشكلة API_URL
// ============================================================

// ✅ التحقق من وجود API_URL قبل تعريفه
if (typeof API_URL === 'undefined') {
  var API_URL = window.location.origin + '/api';
}

console.log('✅ App loaded');

document.addEventListener('DOMContentLoaded', function() {
  console.log('✅ DOM ready');
  
  // تسجيل الدخول
  const loginBtn = document.querySelector('.login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', function(e) {
      e.preventDefault();
      const username = document.getElementById('username')?.value || '';
      const password = document.getElementById('password')?.value || '';
      
      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: username, password })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          document.getElementById('loginOverlay').style.display = 'none';
          document.getElementById('mainApp').style.display = 'block';
          alert('✅ تم تسجيل الدخول بنجاح');
          loadData();
        } else {
          alert('❌ ' + (data.error || 'بيانات غير صحيحة'));
        }
      })
      .catch(err => {
        alert('❌ خطأ في الاتصال بالخادم');
        console.error(err);
      });
    });
  }
  
  // التحقق من التوكن
  const token = localStorage.getItem('token');
  if (token) {
    fetch('/api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        loadData();
      }
    })
    .catch(() => {});
  }
});

// دوال عامة
function showPage(page) {
  document.querySelectorAll('[id^="page"]').forEach(p => {
    p.classList.add('hidden');
  });
  const target = document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1));
  if (target) target.classList.remove('hidden');
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('mainApp').style.display = 'none';
  alert('✅ تم تسجيل الخروج');
}

function refreshAllPages() {
  alert('🔄 تم تحديث الصفحة');
}

function loadData() {
  // تحميل البيانات
  console.log('📊 تحميل البيانات...');
}

window.showPage = showPage;
window.logout = logout;
window.refreshAllPages = refreshAllPages;
