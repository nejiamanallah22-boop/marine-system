// ============================================================
// 📦 api.js - Marine System API Client
// الإصدار: Production / Stable v2.0
// ============================================================

'use strict';

console.log('🚀 تحميل api.js...');

// ============================================================
// ⚙️ الإعدادات
// ============================================================

const API_CONFIG = {
    // ✅ تم الإصلاح: إزالة /api من baseURL لأن المسارات في server.js تبدأ بـ /api
    baseURL: window.location.origin,
    tokenKey: 'authToken',
    userKey: 'userData',
    timeout: 30000
};

// ============================================================
// 🔐 إدارة التوكن
// ============================================================

function getToken() {
    return localStorage.getItem(API_CONFIG.tokenKey);
}

function setToken(token) {
    if (token) {
        localStorage.setItem(API_CONFIG.tokenKey, token);
    }
}

function clearAuth() {
    localStorage.removeItem(API_CONFIG.tokenKey);
    localStorage.removeItem(API_CONFIG.userKey);
}

// ============================================================
// 🚪 تسجيل الخروج الآمن
// ============================================================

function forceLogout() {
    clearAuth();

    const overlay = document.getElementById('loginOverlay');
    const mainApp = document.getElementById('mainApp');

    if (overlay) {
        overlay.style.display = 'flex';
    }

    if (mainApp) {
        mainApp.style.display = 'none';
    }
}

// ============================================================
// ⏱️ Fetch مع Timeout
// ============================================================

async function fetchWithTimeout(url, options = {}) {

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, API_CONFIG.timeout);

    try {

        return await fetch(url, {
            ...options,
            signal: controller.signal
        });

    } finally {

        clearTimeout(timeout);

    }
}

// ============================================================
// 📡 API Request
// ============================================================

async function apiRequest(endpoint, options = {}) {

    const token = getToken();

    const method =
        options.method ||
        'GET';

    const headers = {
        'Accept': 'application/json',
        ...(options.headers || {})
    };

    // Content-Type فقط عند وجود body
    if (options.body !== undefined && options.body !== null) {
        headers['Content-Type'] = 'application/json';
    }

    // Authorization
    if (token) {
        headers['Authorization'] =
            `Bearer ${token}`;
    }

    let body = options.body;

    // تحويل object إلى JSON
    if (
        body !== undefined &&
        body !== null &&
        typeof body === 'object' &&
        !(body instanceof FormData)
    ) {
        body = JSON.stringify(body);
    }

    // ✅ إصلاح المسار: إضافة /api إذا كان المسار لا يبدأ به
    let fullEndpoint = endpoint;
    if (!endpoint.startsWith('/api') && !endpoint.startsWith('http')) {
        fullEndpoint = `/api${endpoint}`;
    }

    const requestURL =
        `${API_CONFIG.baseURL}${fullEndpoint}`;

    console.log(
        `📡 API ${method} ${fullEndpoint}`
    );

    try {

        const response =
            await fetchWithTimeout(
                requestURL,
                {
                    ...options,
                    method,
                    headers,
                    body
                }
            );

        // ====================================================
        // قراءة الاستجابة بأمان
        // ====================================================

        const contentType =
            response.headers.get('content-type') || '';

        let data;

        if (contentType.includes('application/json')) {

            data = await response.json();

        } else {

            const text =
                await response.text();

            data = text
                ? { success: response.ok, message: text }
                : { success: response.ok };

        }

        // ====================================================
        // 401 Unauthorized
        // ====================================================

        if (response.status === 401) {

            console.warn(
                '⚠️ Unauthorized - session expired'
            );

            forceLogout();

            throw new Error(
                data.error ||
                data.message ||
                'انتهت الجلسة، يرجى تسجيل الدخول من جديد'
            );
        }

        // ====================================================
        // أخطاء HTTP
        // ====================================================

        if (!response.ok) {

            const message =
                data?.error ||
                data?.message ||
                `خطأ HTTP ${response.status}`;

            throw new Error(message);
        }

        return data;

    } catch (error) {

        if (error.name === 'AbortError') {

            console.error(
                '⏱️ API Timeout:',
                endpoint
            );

            throw new Error(
                'انتهت مهلة الاتصال بالخادم'
            );
        }

        console.error(
            `❌ API Error [${method} ${endpoint}]:`,
            error
        );

        throw error;
    }
}

// ============================================================
// 🔐 AUTH
// ============================================================

async function authLogin(username, password) {

    if (!username || !password) {

        throw new Error(
            'يرجى إدخال اسم المستخدم وكلمة المرور'
        );
    }

    const response =
        await apiRequest(
            '/auth/login',
            {
                method: 'POST',
                body: {
                    username:
                        String(username).trim(),
                    password:
                        String(password)
                }
            }
        );

    // ========================================================
    // حفظ التوكن
    // ========================================================

    if (response.token) {
        setToken(response.token);
    }

    if (response.user) {

        localStorage.setItem(
            API_CONFIG.userKey,
            JSON.stringify(response.user)
        );
    }

    return response;
}

// ============================================================
// 👤 التسجيل
// ============================================================

async function authRegister(userData) {

    return apiRequest(
        '/auth/register',
        {
            method: 'POST',
            body: userData
        }
    );
}

// ============================================================
// 👤 المستخدم الحالي
// ============================================================

async function authMe() {

    return apiRequest(
        '/auth/me'
    );
}

// ============================================================
// 🚪 Logout
// ============================================================

async function authLogout() {

    try {

        await apiRequest(
            '/auth/logout',
            {
                method: 'POST'
            }
        );

    } catch (error) {

        console.warn(
            '⚠️ Logout endpoint unavailable'
        );

    } finally {

        forceLogout();

    }
}

// ============================================================
// 🚢 FLEET (VESSELS)
// ============================================================

function getFleet(filters = {}) {

    const query =
        new URLSearchParams(filters).toString();

    return apiRequest(
        `/vessels${query ? `?${query}` : ''}`
    );
}

function getVessel(id) {

    return apiRequest(
        `/vessels/${encodeURIComponent(id)}`
    );
}

function createVessel(data) {

    return apiRequest(
        '/vessels',
        {
            method: 'POST',
            body: data
        }
    );
}

function updateVessel(id, data) {

    return apiRequest(
        `/vessels/${encodeURIComponent(id)}`,
        {
            method: 'PUT',
            body: data
        }
    );
}

function deleteVessel(id) {

    return apiRequest(
        `/vessels/${encodeURIComponent(id)}`,
        {
            method: 'DELETE'
        }
    );
}

function getFleetStats() {

    return apiRequest(
        '/vessels/stats'
    );
}

// ============================================================
// 🔧 MAINTENANCE
// ============================================================

function getMaintenance(filters = {}) {

    const query =
        new URLSearchParams(filters).toString();

    return apiRequest(
        `/maintenance${query ? `?${query}` : ''}`
    );
}

function getMaintenanceById(id) {

    return apiRequest(
        `/maintenance/${encodeURIComponent(id)}`
    );
}

function createMaintenance(data) {

    return apiRequest(
        '/maintenance',
        {
            method: 'POST',
            body: data
        }
    );
}

function updateMaintenance(id, data) {

    return apiRequest(
        `/maintenance/${encodeURIComponent(id)}`,
        {
            method: 'PUT',
            body: data
        }
    );
}

function deleteMaintenance(id) {

    return apiRequest(
        `/maintenance/${encodeURIComponent(id)}`,
        {
            method: 'DELETE'
        }
    );
}

function getMaintenanceStats() {

    return apiRequest(
        '/maintenance/stats'
    );
}

// ============================================================
// 📊 EFFICIENCY
// ============================================================

function getEfficiency(filters = {}) {

    const query =
        new URLSearchParams(filters).toString();

    return apiRequest(
        `/efficiency${query ? `?${query}` : ''}`
    );
}

function getEfficiencyById(id) {

    return apiRequest(
        `/efficiency/${encodeURIComponent(id)}`
    );
}

function createEfficiency(data) {

    return apiRequest(
        '/efficiency',
        {
            method: 'POST',
            body: data
        }
    );
}

function updateEfficiency(id, data) {

    return apiRequest(
        `/efficiency/${encodeURIComponent(id)}`,
        {
            method: 'PUT',
            body: data
        }
    );
}

function getEfficiencyStats() {

    return apiRequest(
        '/efficiency/stats'
    );
}

// ============================================================
// 📝 NOTES
// ============================================================

function getNotes(filters = {}) {

    const query =
        new URLSearchParams(filters).toString();

    return apiRequest(
        `/notes${query ? `?${query}` : ''}`
    );
}

function getNoteById(id) {

    return apiRequest(
        `/notes/${encodeURIComponent(id)}`
    );
}

function createNote(data) {

    return apiRequest(
        '/notes',
        {
            method: 'POST',
            body: data
        }
    );
}

function updateNote(id, data) {

    return apiRequest(
        `/notes/${encodeURIComponent(id)}`,
        {
            method: 'PUT',
            body: data
        }
    );
}

function deleteNote(id) {

    return apiRequest(
        `/notes/${encodeURIComponent(id)}`,
        {
            method: 'DELETE'
        }
    );
}

function getNotesByWeek(week) {

    return apiRequest(
        `/notes/week/${encodeURIComponent(week)}`
    );
}

function getLatestNote() {

    return apiRequest(
        '/notes/latest'
    );
}

// ============================================================
// 👥 USERS
// ============================================================

function getUsers(filters = {}) {

    const query =
        new URLSearchParams(filters).toString();

    return apiRequest(
        `/users${query ? `?${query}` : ''}`
    );
}

function getUserById(id) {

    return apiRequest(
        `/users/${encodeURIComponent(id)}`
    );
}

function createUser(data) {

    return apiRequest(
        '/users',
        {
            method: 'POST',
            body: data
        }
    );
}

function updateUser(id, data) {

    return apiRequest(
        `/users/${encodeURIComponent(id)}`,
        {
            method: 'PUT',
            body: data
        }
    );
}

function deleteUser(id) {

    return apiRequest(
        `/users/${encodeURIComponent(id)}`,
        {
            method: 'DELETE'
        }
    );
}

function changePassword(
    id,
    oldPassword,
    newPassword
) {

    return apiRequest(
        `/users/${encodeURIComponent(id)}/password`,
        {
            method: 'PUT',
            body: {
                oldPassword,
                newPassword
            }
        }
    );
}

// ============================================================
// 🎫 SUPPORT / TICKETS
// ============================================================

function getTickets(filters = {}) {

    const query =
        new URLSearchParams(filters).toString();

    return apiRequest(
        `/tickets${query ? `?${query}` : ''}`
    );
}

function createTicket(data) {

    return apiRequest(
        '/tickets',
        {
            method: 'POST',
            body: data
        }
    );
}

function replyTicket(id, reply) {

    return apiRequest(
        `/tickets/${encodeURIComponent(id)}/reply`,
        {
            method: 'PUT',
            body: { reply }
        }
    );
}

function closeTicket(id) {

    return apiRequest(
        `/tickets/${encodeURIComponent(id)}/close`,
        {
            method: 'PUT'
        }
    );
}

// ============================================================
// 📍 LOCATIONS
// ============================================================

function getLocations(filters = {}) {

    const query =
        new URLSearchParams(filters).toString();

    return apiRequest(
        `/locations${query ? `?${query}` : ''}`
    );
}

function createLocation(data) {

    return apiRequest(
        '/locations',
        {
            method: 'POST',
            body: data
        }
    );
}

function updateLocation(id, data) {

    return apiRequest(
        `/locations/${encodeURIComponent(id)}`,
        {
            method: 'PUT',
            body: data
        }
    );
}

function deleteLocation(id) {

    return apiRequest(
        `/locations/${encodeURIComponent(id)}`,
        {
            method: 'DELETE'
        }
    );
}

// ============================================================
// 📜 LOGS
// ============================================================

function getLogs(filters = {}) {

    const query =
        new URLSearchParams(filters).toString();

    return apiRequest(
        `/logs${query ? `?${query}` : ''}`
    );
}

function createLog(data) {

    return apiRequest(
        '/logs',
        {
            method: 'POST',
            body: data
        }
    );
}

function getLogsByDate(date) {

    return apiRequest(
        `/logs/date/${encodeURIComponent(date)}`
    );
}

// ============================================================
// 💾 EXPORT / IMPORT
// ============================================================

function exportAll() {

    return apiRequest(
        '/export/all'
    );
}

function exportVessels() {

    return apiRequest(
        '/export/vessels'
    );
}

function exportMaintenance() {

    return apiRequest(
        '/export/maintenance'
    );
}

function importAll(data) {

    return apiRequest(
        '/import/all',
        {
            method: 'POST',
            body: data
        }
    );
}

function importVessels(data) {

    return apiRequest(
        '/import/vessels',
        {
            method: 'POST',
            body: data
        }
    );
}

// ============================================================
// 📊 DASHBOARD
// ============================================================

function getDashboardStats() {

    return apiRequest(
        '/dashboard/stats'
    );
}

function getDashboardCharts() {

    return apiRequest(
        '/dashboard/charts'
    );
}

function getRecentActivity() {

    return apiRequest(
        '/dashboard/activity'
    );
}

// ============================================================
// 🤖 AI
// ============================================================

function aiChat(message, history = []) {

    return apiRequest(
        '/ai/chat',
        {
            method: 'POST',
            body: {
                message,
                history
            }
        }
    );
}

function getAIStatus() {

    return apiRequest(
        '/ai/status'
    );
}

// ============================================================
// 🩺 HEALTH
// ============================================================

function getHealth() {

    return fetch(
        `${window.location.origin}/health`,
        {
            headers: {
                'Accept': 'application/json'
            }
        }
    ).then(async response => {

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data.error ||
                'Health check failed'
            );
        }

        return data;

    });
}

// ============================================================
// 🌐 API GLOBAL
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

    // Tickets
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

    // Import / Export
    exportAll,
    exportVessels,
    exportMaintenance,
    importAll,
    importVessels,

    // Dashboard
    getDashboardStats,
    getDashboardCharts,
    getRecentActivity,

    // AI
    aiChat,
    getAIStatus,

    // Health
    getHealth,

    // Utilities
    apiRequest,
    getToken,
    clearAuth
};

console.log('✅ API جاهز - Marine System v2.0');
