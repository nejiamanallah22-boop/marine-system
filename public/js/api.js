// ============================================================
// 📦 api.js - دوال API (بدون require)
// ============================================================

const API_URL = window.location.origin + '/api';

// ============================================================
// 🔧 دوال API العامة
// ============================================================

function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  
  return fetch(API_URL + endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
      ...(options.headers || {})
    }
  })
  .then(res => {
    if (!res.ok) {
      return res.json().then(err => { throw new Error(err.error || 'API Error'); });
    }
    return res.json();
  })
  .catch(err => {
    console.error('API Error:', err);
    throw err;
  });
}

// ============================================================
// 🔐 المصادقة
// ============================================================

function authLogin(email, password) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

function authRegister(name, email, password, role) {
  return apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, role })
  });
}

function authMe() {
  return apiRequest('/auth/me');
}

// ============================================================
// 🚢 المراكب
// ============================================================

function getVessels() {
  return apiRequest('/vessels');
}

function createVessel(data) {
  return apiRequest('/vessels', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

function updateVessel(id, data) {
  return apiRequest('/vessels/' + id, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

function deleteVessel(id) {
  return apiRequest('/vessels/' + id, {
    method: 'DELETE'
  });
}

// ============================================================
// 🎫 التذاكر
// ============================================================

function getTickets() {
  return apiRequest('/tickets');
}

function createTicket(data) {
  return apiRequest('/tickets', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

function replyTicket(id, reply) {
  return apiRequest('/tickets/' + id + '/reply', {
    method: 'PUT',
    body: JSON.stringify({ reply })
  });
}

function closeTicket(id) {
  return apiRequest('/tickets/' + id + '/close', {
    method: 'PUT'
  });
}

// ============================================================
// 📜 السجلات
// ============================================================

function getLogs() {
  return apiRequest('/logs');
}

function createLog(data) {
  return apiRequest('/logs', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

// ============================================================
// 📍 المواقع
// ============================================================

function getLocations() {
  return apiRequest('/locations');
}

function createLocation(lat, lng, action) {
  return apiRequest('/locations', {
    method: 'POST',
    body: JSON.stringify({ lat, lng, action })
  });
}

// ============================================================
// 📝 Note Verbale
// ============================================================

function getNotes() {
  return apiRequest('/notes');
}

function createNote(data) {
  return apiRequest('/notes', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

function getNotesByWeek(week, limit) {
  const query = new URLSearchParams();
  if (week) query.append('week', week);
  if (limit) query.append('limit', limit);
  return apiRequest('/notes?' + query.toString());
}

function getLatestNote() {
  return apiRequest('/notes/latest');
}

function deleteNote(id) {
  return apiRequest('/notes/' + id, {
    method: 'DELETE'
  });
}

// ============================================================
// 👥 المستخدمين
// ============================================================

function getUsers() {
  return apiRequest('/users');
}

function createUser(data) {
  return apiRequest('/users', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

function updateUser(id, data) {
  return apiRequest('/users/' + id, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

function deleteUser(id) {
  return apiRequest('/users/' + id, {
    method: 'DELETE'
  });
}

// ============================================================
// 💾 تصدير واستيراد
// ============================================================

function exportAll() {
  return apiRequest('/export-all');
}

function importAll(data) {
  return apiRequest('/import-all', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

// ============================================================
// 🔄 تصدير الدوال للاستخدام العالمي
// ============================================================

window.api = {
  authLogin,
  authRegister,
  authMe,
  getVessels,
  createVessel,
  updateVessel,
  deleteVessel,
  getTickets,
  createTicket,
  replyTicket,
  closeTicket,
  getLogs,
  createLog,
  getLocations,
  createLocation,
  getNotes,
  createNote,
  getNotesByWeek,
  getLatestNote,
  deleteNote,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  exportAll,
  importAll
};
