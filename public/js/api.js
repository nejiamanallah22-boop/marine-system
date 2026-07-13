// ============================================================
// ===== دوال API =====
// ============================================================

const API_BASE = '/api';

let authToken = localStorage.getItem('authToken');

function setAuthToken(token) {
    authToken = token;
    if (token) {
        localStorage.setItem('authToken', token);
    } else {
        localStorage.removeItem('authToken');
    }
}

function getHeaders() {
    const headers = {
        'Content-Type': 'application/json'
    };
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    return headers;
}

async function apiRequest(endpoint, method = 'GET', data = null) {
    const url = `${API_BASE}${endpoint}`;
    const options = {
        method,
        headers: getHeaders()
    };
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(url, options);
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'حدث خطأ في الطلب');
        }
        
        return result;
    } catch (error) {
        console.error('❌ خطأ في API:', error);
        throw error;
    }
}

// ===== المصادقة =====
async function login(username, password) {
    const result = await apiRequest('/auth/login', 'POST', { username, password });
    if (result.token) {
        setAuthToken(result.token);
    }
    return result;
}

function logout() {
    setAuthToken(null);
}

// ===== المستخدمين =====
async function getUsers() {
    return apiRequest('/auth/users');
}

async function addUser(name, pass, role) {
    return apiRequest('/auth/users', 'POST', { name, pass, role });
}

async function updateUser(id, data) {
    return apiRequest(`/auth/users/${id}`, 'PUT', data);
}

async function deleteUser(id) {
    return apiRequest(`/auth/users/${id}`, 'DELETE');
}

// ===== المراكب =====
async function getVessels() {
    return apiRequest('/vessels');
}

async function addVessel(data) {
    return apiRequest('/vessels', 'POST', data);
}

async function updateVessel(id, data) {
    return apiRequest(`/vessels/${id}`, 'PUT', data);
}

async function deleteVessel(id) {
    return apiRequest(`/vessels/${id}`, 'DELETE');
}

// ===== التذاكر =====
async function getTickets() {
    return apiRequest('/tickets');
}

async function addTicket(data) {
    return apiRequest('/tickets', 'POST', data);
}

async function replyTicket(id, reply) {
    return apiRequest(`/tickets/${id}/reply`, 'PUT', { reply });
}

async function closeTicket(id) {
    return apiRequest(`/tickets/${id}/close`, 'PUT');
}

// ===== المذكرات =====
async function getNotes(params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/notes?${query}`);
}

async function addNote(data) {
    return apiRequest('/notes', 'POST', data);
}

async function deleteNote(id) {
    return apiRequest(`/notes/${id}`, 'DELETE');
}

// ===== المواقع =====
async function getLocations() {
    return apiRequest('/locations');
}

async function addLocation(lat, lng, action = 'تحديث موقع') {
    return apiRequest('/locations', 'POST', { lat, lng, action });
}

// ===== تصدير واستيراد =====
async function exportAllData() {
    return apiRequest('/export-all');
}

async function importAllData(data) {
    return apiRequest('/import-all', 'POST', data);
}
