// ============================================================
// 🎫 tickets.js - إدارة التذاكر (بدون require)
// ============================================================

// ============================================================
// 🎫 دوال التذاكر
// ============================================================

function sendTicket() {
  const subject = document.getElementById('ticketSubject')?.value.trim();
  const message = document.getElementById('ticketMessage')?.value.trim();
  
  if (!subject || !message) {
    showNotification('⚠️ الرجاء إدخال العنوان والرسالة', 'warning');
    return;
  }
  
  const token = getToken();
  if (!token) {
    showNotification('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
    return;
  }
  
  const data = {
    subject,
    message,
    date: getCurrentDate(),
    time: getCurrentTime()
  };
  
  fetch('/api/tickets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify(data)
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      showNotification('❌ ' + data.error, 'error');
    } else {
      showNotification('✅ تم إرسال التذكرة بنجاح', 'success');
      document.getElementById('ticketSubject').value = '';
      document.getElementById('ticketMessage').value = '';
      loadTickets();
    }
  })
  .catch(err => {
    console.error('Send ticket error:', err);
    showNotification('❌ خطأ في إرسال التذكرة', 'error');
  });
}

function refreshTickets() {
  loadTickets();
  showNotification('✅ تم تحديث التذاكر', 'success');
}

// ============================================================
// 🔄 تصدير للاستخدام العالمي
// ============================================================

window.sendTicket = sendTicket;
window.refreshTickets = refreshTickets;
