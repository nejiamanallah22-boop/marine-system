 // ============================================================
// 📦 api.js - دوال API المتكاملة مع المنظومة البحرية
// ============================================================

console.log('✅ api.js تم تحميله بنجاح');

// ============================================================
// ⚙️ الإعدادات
// ============================================================

const API_URL = window.location.origin + '/api';

// ============================================================
// 🔧 دوال API العامة
// ============================================================

function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    
    // إعدادات الطلب
    const config = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...(options.headers || {})
        }
    };

    // تحويل body إذا كان كائن
    if (options.body && typeof options.body === 'object') {
        config.body = JSON.stringify(options.body);
    }

    console.log(`📡 ${options.method || 'GET'} ${endpoint}`);

    return fetch(API_URL + endpoint, config)
        .then(async res => {
            const data = await res.json();
            
            if (!res.ok) {
                // معالجة أخطاء المصادقة
                if (res.status === 401) {
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('userData');
                    if (window.location.pathname !== '/login') {
                        window.location.href = '/login';
                    }
                }
                throw new Error(data.error || data.message || 'خطأ في الطلب');
            }
            
            return data;
        })
        .catch(err => {
            console.error('❌ API Error:', err);
            // عرض إشعار للمستخدم
            if (window.showNotification) {
                window.showNotification(err.message, 'error');
            }
            throw err;
        });
}

// ============================================================
// 🔐 المصادقة (Auth)
// ============================================================

function authLogin(username, password) {
    return apiRequest('/auth/login', {
        method: 'POST',
        body: { username, password }
    });
}

function authRegister(userData) {
    return apiRequest('/auth/register', {
        method: 'POST',
        body: userData
    });
}

function authMe() {
    return apiRequest('/auth/me');
}

function authLogout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    window.location.href = '/login';
}

// ============================================================
// 🚢 الأسطول (Fleet/Vessels)
// ============================================================

function getFleet(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return apiRequest(`/fleet${query ? '?' + query : ''}`);
}

function getVessel(id) {
    return apiRequest(`/fleet/${id}`);
}

function createVessel(data) {
    return apiRequest('/fleet', {
        method: 'POST',
        body: data
    });
}

function updateVessel(id, data) {
    return apiRequest(`/fleet/${id}`, {
        method: 'PUT',
        body: data
    });
}

function deleteVessel(id) {
    return apiRequest(`/fleet/${id}`, {
        method: 'DELETE'
    });
}

function getFleetStats() {
    return apiRequest('/fleet/stats');
}

// ============================================================
// 🔧 الصيانة (Maintenance)
// ============================================================

function getMaintenance(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return apiRequest(`/maintenance${query ? '?' + query : ''}`);
}

function getMaintenanceById(id) {
    return apiRequest(`/maintenance/${id}`);
}

function createMaintenance(data) {
    return apiRequest('/maintenance', {
        method: 'POST',
        body: data
    });
}

function updateMaintenance(id, data) {
    return apiRequest(`/maintenance/${id}`, {
        method: 'PUT',
        body: data
    });
}

function deleteMaintenance(id) {
    return apiRequest(`/maintenance/${id}`, {
        method: 'DELETE'
    });
}

function getMaintenanceStats() {
    return apiRequest('/maintenance/stats');
}

// ============================================================
// 📊 الكفاءة والجاهزية (Efficiency)
// ============================================================

function getEfficiency(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return apiRequest(`/efficiency${query ? '?' + query : ''}`);
}

function getEfficiencyById(id) {
    return apiRequest(`/efficiency/${id}`);
}

function createEfficiency(data) {
    return apiRequest('/efficiency', {
        method: 'POST',
        body: data
    });
}

function updateEfficiency(id, data) {
    return apiRequest(`/efficiency/${id}`, {
        method: 'PUT',
        body: data
    });
}

function getEfficiencyStats() {
    return apiRequest('/efficiency/stats');
}

// ============================================================
// 📝 Note Verbale
// ============================================================

function getNotes(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return apiRequest(`/notes${query ? '?' + query : ''}`);
}

function getNoteById(id) {
    return apiRequest(`/notes/${id}`);
}

function createNote(data) {
    return apiRequest('/notes', {
        method: 'POST',
        body: data
    });
}

function updateNote(id, data) {
    return apiRequest(`/notes/${id}`, {
        method: 'PUT',
        body: data
    });
}

function deleteNote(id) {
    return apiRequest(`/notes/${id}`, {
        method: 'DELETE'
    });
}

function getNotesByWeek(week) {
    return apiRequest(`/notes/week/${week}`);
}

function getLatestNote() {
    return apiRequest('/notes/latest');
}

// ============================================================
// 👥 المستخدمين (Users)
// ============================================================

function getUsers(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return apiRequest(`/users${query ? '?' + query : ''}`);
}

function getUserById(id) {
    return apiRequest(`/users/${id}`);
}

function createUser(data) {
    return apiRequest('/users', {
        method: 'POST',
        body: data
    });
}

function updateUser(id, data) {
    return apiRequest(`/users/${id}`, {
        method: 'PUT',
        body: data
    });
}

function deleteUser(id) {
    return apiRequest(`/users/${id}`, {
        method: 'DELETE'
    });
}

function changePassword(id, oldPassword, newPassword) {
    return apiRequest(`/users/${id}/password`, {
        method: 'PUT',
        body: { oldPassword, newPassword }
    });
}

// ============================================================
// 🎫 الدعم (Support/Tickets)
// ============================================================

function getTickets(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return apiRequest(`/tickets${query ? '?' + query : ''}`);
}

function createTicket(data) {
    return apiRequest('/tickets', {
        method: 'POST',
        body: data
    });
}

function replyTicket(id, reply) {
    return apiRequest(`/tickets/${id}/reply`, {
        method: 'PUT',
        body: { reply }
    });
}

function closeTicket(id) {
    return apiRequest(`/tickets/${id}/close`, {
        method: 'PUT'
    });
}

// ============================================================
// 📍 المواقع (Locations) - للخرائط
// ============================================================

function getLocations(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return apiRequest(`/locations${query ? '?' + query : ''}`);
}

function createLocation(data) {
    return apiRequest('/locations', {
        method: 'POST',
        body: data
    });
}

function updateLocation(id, data) {
    return apiRequest(`/locations/${id}`, {
        method: 'PUT',
        body: data
    });
}

function deleteLocation(id) {
    return apiRequest(`/locations/${id}`, {
        method: 'DELETE'
    });
}

// ============================================================
// 📜 السجلات (Logs)
// ============================================================

function getLogs(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return apiRequest(`/logs${query ? '?' + query : ''}`);
}

function createLog(data) {
    return apiRequest('/logs', {
        method: 'POST',
        body: data
    });
}

function getLogsByDate(date) {
    return apiRequest(`/logs/date/${date}`);
}

// ============================================================
// 💾 تصدير واستيراد البيانات
// ============================================================

function exportAll() {
    return apiRequest('/export/all');
}

function exportVessels() {
    return apiRequest('/export/vessels');
}

function exportMaintenance() {
    return apiRequest('/export/maintenance');
}

function importAll(data) {
    return apiRequest('/import/all', {
        method: 'POST',
        body: data
    });
}

function importVessels(data) {
    return apiRequest('/import/vessels', {
        method: 'POST',
        body: data
    });
}

// ============================================================
// 📊 لوحة التحكم (Dashboard)
// ============================================================

function getDashboardStats() {
    return apiRequest('/dashboard/stats');
}

function getDashboardCharts() {
    return apiRequest('/dashboard/charts');
}

function getRecentActivity() {
    return apiRequest('/dashboard/activity');
}

// ============================================================
// 🔄 تصدير الدوال للاستخدام العالمي
// ============================================================

window.API = {
    // Auth
    authLogin,
    authRegister,
    authMe,
    authLogout,
    
    // Fleet
    getFleet,
    getVessel,
    createVessel,
    updateVessel,
    deleteVessel,
    getFleetStats,
    
    // Maintenance
    getMaintenance,
    getMaintenanceById,
    createMaintenance,
    updateMaintenance,
    deleteMaintenance,
    getMaintenanceStats,
    
    // Efficiency
    getEfficiency,
    getEfficiencyById,
    createEfficiency,
    updateEfficiency,
    getEfficiencyStats,
    
    // Notes
    getNotes,
    getNoteById,
    createNote,
    updateNote,
    deleteNote,
    getNotesByWeek,
    getLatestNote,
    
    // Users
    getUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    changePassword,
    
    // Support
    getTickets,
    createTicket,
    replyTicket,
    closeTicket,
    
    // Locations
    getLocations,
    createLocation,
    updateLocation,
    deleteLocation,
    
    // Logs
    getLogs,
    createLog,
    getLogsByDate,
    
    // Export/Import
    exportAll,
    exportVessels,
    exportMaintenance,
    importAll,
    importVessels,
    
    // Dashboard
    getDashboardStats,
    getDashboardCharts,
    getRecentActivity
};

console.log('✅ API ready - جميع الدوال جاهزة للاستخدام');
