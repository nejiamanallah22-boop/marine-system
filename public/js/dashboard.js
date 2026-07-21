// ============================================================
// 📊 dashboard.js - لوحة التحكم
// ============================================================

// ============================================================
// 📊 دوال الجاهزية
// ============================================================

function renderEfficiency() {
  const container = document.getElementById('statsCards');
  if (!container) return;
  
  const total = allVessels.length;
  const good = allVessels.filter(v => v.stat === 'صالح').length;
  const bad = allVessels.filter(v => v.stat === 'معطب').length;
  const maintenance = allVessels.filter(v => v.stat === 'صيانة').length;
  
  const efficiency = total > 0 ? Math.round((good / total) * 100) : 0;
  
  container.innerHTML = `
    <div class="stat-card" style="background:#28a745;">
      <h3>${good}</h3>
      <p>✅ صالح</p>
    </div>
    <div class="stat-card" style="background:#dc3545;">
      <h3>${bad}</h3>
      <p>❌ معطب</p>
    </div>
    <div class="stat-card" style="background:#ffc107;">
      <h3>${maintenance}</h3>
      <p>🔧 صيانة</p>
    </div>
    <div class="stat-card" style="background:#17a2b8;">
      <h3>${efficiency}%</h3>
      <p>📊 الجاهزية</p>
    </div>
  `;
}

function refreshEff() {
  loadVessels();
  loadNotes();
  showNotification('✅ تم تحديث بيانات الجاهزية', 'success');
}

// ============================================================
// 📝 دوال Note Verbale
// ============================================================

function loadLatestNoteData() {
  const container = document.getElementById('latestNoteContainer');
  if (!container) return;
  
  const token = getToken();
  if (!token) return;
  
  fetch('/api/notes/latest', {
    headers: { 'Authorization': 'Bearer ' + token }
  })
  .then(res => res.json())
  .then(note => {
    if (note && note._id) {
      container.style.display = 'block';
      document.getElementById('latestNoteDate').textContent = note.date || '';
      document.getElementById('latestNoteTitle').textContent = note.title || '';
      document.getElementById('latestNoteContent').textContent = note.content || '';
    } else {
      container.style.display = 'none';
    }
  })
  .catch(err => console.error('Load latest note error:', err));
}

function loadNotesData() {
  const container = document.getElementById('notesListContainer');
  if (!container) return;
  
  const week = document.getElementById('filterWeek')?.value || '';
  const limit = parseInt(document.getElementById('filterLimit')?.value) || 10;
  
  const token = getToken();
  if (!token) {
    container.innerHTML = '<p style="color:#6c757d;">⚠️ يرجى تسجيل الدخول</p>';
    return;
  }
  
  let url = '/api/notes?limit=' + limit;
  if (week) url += '&week=' + week;
  
  fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token }
  })
  .then(res => res.json())
  .then(notes => {
    if (!Array.isArray(notes) || notes.length === 0) {
      container.innerHTML = '<p style="color:#6c757d;">🚫 لا توجد مذكرات</p>';
      return;
    }
    
    container.innerHTML = notes.map(n => `
      <div style="background:#f8f9fa; padding:15px; margin:10px 0; border-radius:8px; border-right:4px solid #0d6efd;">
        <h4 style="color:#0d6efd;">${n.title || 'بدون عنوان'}</h4>
        <p style="color:#495057;">${n.content || ''}</p>
        <small style="color:#6c757d;">${n.date || ''} ${n.time || ''} | ${n.createdBy || 'مجهول'}</small>
        <button class="btn btn-sm btn-danger" onclick="deleteNote('${n._id}')" style="float:left;">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `).join('');
  })
  .catch(err => {
    console.error('Load notes error:', err);
    container.innerHTML = '<p style="color:#dc3545;">❌ خطأ في تحميل المذكرات</p>';
  });
}

function deleteNote(id) {
  if (!confirm('⚠️ هل أنت متأكد من حذف هذه المذكرة؟')) return;
  
  const token = getToken();
  if (!token) {
    showNotification('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
    return;
  }
  
  fetch('/api/notes/' + id, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token }
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      showNotification('❌ ' + data.error, 'error');
    } else {
      showNotification('✅ تم حذف المذكرة', 'success');
      loadNotesData();
      loadLatestNoteData();
    }
  })
  .catch(err => {
    console.error('Delete note error:', err);
    showNotification('❌ خطأ في حذف المذكرة', 'error');
  });
}

function saveNote() {
  const title = document.getElementById('noteTitle')?.value.trim();
  const content = document.getElementById('noteContent')?.value.trim();
  const date = document.getElementById('noteDate')?.value;
  
  if (!title || !content || !date) {
    showNotification('⚠️ الرجاء إدخال العنوان والمحتوى والتاريخ', 'warning');
    return;
  }
  
  const token = getToken();
  if (!token) {
    showNotification('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
    return;
  }
  
  const data = {
    title,
    content,
    date,
    time: getCurrentTime(),
    week: getWeekNumber(date).toString()
  };
  
  fetch('/api/notes', {
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
      showNotification('✅ تم حفظ المذكرة', 'success');
      document.getElementById('noteTitle').value = '';
      document.getElementById('noteContent').value = '';
      document.getElementById('noteDate').value = '';
      loadNotesData();
      loadLatestNoteData();
    }
  })
  .catch(err => {
    console.error('Save note error:', err);
    showNotification('❌ خطأ في حفظ المذكرة', 'error');
  });
}

function clearNote() {
  document.getElementById('noteTitle').value = '';
  document.getElementById('noteContent').value = '';
  document.getElementById('noteDate').value = '';
  document.getElementById('noteResult').style.display = 'none';
}

function exportNotePDF() {
  showNotification('📄 جاري تصدير PDF...', 'info');
}

function exportNoteWord() {
  showNotification('📄 جاري تصدير Word...', 'info');
}

function importNoteFile() {
  showNotification('📂 جاري استيراد الملف...', 'info');
}

function loadNotesByWeek() {
  loadNotesData();
}

// ============================================================
// 👥 دوال المستخدمين
// ============================================================

function addUser() {
  const name = document.getElementById('un')?.value.trim();
  const password = document.getElementById('up')?.value.trim();
  const role = document.getElementById('ur')?.value;
  
  if (!name || !password) {
    showNotification('⚠️ الرجاء إدخال الاسم وكلمة المرور', 'warning');
    return;
  }
  
  const token = getToken();
  if (!token) {
    showNotification('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
    return;
  }
  
  const email = name.toLowerCase() + '@marine.gov.tn';
  
  fetch('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ name, email, password, role })
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      showNotification('❌ ' + data.error, 'error');
    } else {
      showNotification('✅ تم إضافة المستخدم', 'success');
      document.getElementById('un').value = '';
      document.getElementById('up').value = '';
      loadUsers();
    }
  })
  .catch(err => {
    console.error('Add user error:', err);
    showNotification('❌ خطأ في إضافة المستخدم', 'error');
  });
}

function refreshUsers() {
  loadUsers();
  showNotification('✅ تم تحديث المستخدمين', 'success');
}

function changeUserPassword(id, name) {
  document.getElementById('modalUserName').textContent = 'تغيير كلمة المرور لـ: ' + name;
  document.getElementById('passwordModal').style.display = 'flex';
  document.getElementById('newPassword').value = '';
  document.getElementById('confirmPassword').value = '';
  document.getElementById('passwordModal').dataset.userId = id;
}

function saveNewPassword() {
  const password = document.getElementById('newPassword')?.value.trim();
  const confirm = document.getElementById('confirmPassword')?.value.trim();
  const userId = document.getElementById('passwordModal')?.dataset.userId;
  
  if (!password || password.length < 6) {
    showNotification('⚠️ كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'warning');
    return;
  }
  
  if (password !== confirm) {
    showNotification('⚠️ كلمة المرور غير متطابقة', 'warning');
    return;
  }
  
  const token = getToken();
  if (!token) {
    showNotification('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
    return;
  }
  
  fetch('/api/users/' + userId, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ password })
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      showNotification('❌ ' + data.error, 'error');
    } else {
      showNotification('✅ تم تغيير كلمة المرور', 'success');
      closePasswordModal();
    }
  })
  .catch(err => {
    console.error('Change password error:', err);
    showNotification('❌ خطأ في تغيير كلمة المرور', 'error');
  });
}

function closePasswordModal() {
  document.getElementById('passwordModal').style.display = 'none';
}

function toggleUserStatus(id) {
  const user = allUsers.find(u => u._id === id);
  if (!user) return;
  
  const token = getToken();
  if (!token) {
    showNotification('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
    return;
  }
  
  fetch('/api/users/' + id, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ isActive: !user.isActive })
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      showNotification('❌ ' + data.error, 'error');
    } else {
      showNotification('✅ تم تحديث حالة المستخدم', 'success');
      loadUsers();
    }
  })
  .catch(err => {
    console.error('Toggle user status error:', err);
    showNotification('❌ خطأ في تحديث حالة المستخدم', 'error');
  });
}

function deleteUser(id) {
  if (!confirm('⚠️ هل أنت متأكد من حذف هذا المستخدم؟')) return;
  
  const token = getToken();
  if (!token) {
    showNotification('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
    return;
  }
  
  fetch('/api/users/' + id, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token }
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      showNotification('❌ ' + data.error, 'error');
    } else {
      showNotification('✅ تم حذف المستخدم', 'success');
      loadUsers();
    }
  })
  .catch(err => {
    console.error('Delete user error:', err);
    showNotification('❌ خطأ في حذف المستخدم', 'error');
  });
}

// ============================================================
// 🔄 تصدير للاستخدام العالمي
// ============================================================

window.renderEfficiency = renderEfficiency;
window.refreshEff = refreshEff;
window.loadLatestNoteData = loadLatestNoteData;
window.loadNotesData = loadNotesData;
window.saveNote = saveNote;
window.clearNote = clearNote;
window.exportNotePDF = exportNotePDF;
window.exportNoteWord = exportNoteWord;
window.importNoteFile = importNoteFile;
window.loadNotesByWeek = loadNotesByWeek;
window.deleteNote = deleteNote;
window.addUser = addUser;
window.refreshUsers = refreshUsers;
window.changeUserPassword = changeUserPassword;
window.saveNewPassword = saveNewPassword;
window.closePasswordModal = closePasswordModal;
window.toggleUserStatus = toggleUserStatus;
window.deleteUser = deleteUser;
