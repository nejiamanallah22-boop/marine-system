
// ==================== دوال الاتصال بالسيرفر ====================

let currentUser = null;
let selectedUserId = null;
let isEditing = false;

async function apiCall(url, method = 'GET', body = null) {
    const options = { 
        method, 
        headers: { 'Content-Type': 'application/json' } 
    };
    if (body) options.body = JSON.stringify(body);
    
    if (currentUser && currentUser.token) {
        options.headers['Authorization'] = `Bearer ${currentUser.token}`;
    }
    
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(await response.text());
    return response.json();
}

async function loadVessels() { return apiCall('/api/vessels'); }
async function saveVessel(vessel) { return apiCall('/api/vessels', 'POST', vessel); }
async function updateVessel(id, vessel) { return apiCall(`/api/vessels/${id}`, 'PUT', vessel); }
async function deleteVessel(id) { return apiCall(`/api/vessels/${id}`, 'DELETE'); }

async function loadUsers() { return apiCall('/api/users'); }
async function saveUser(user) { return apiCall('/api/users', 'POST', user); }
async function updateUser(id, user) { return apiCall(`/api/users/${id}`, 'PUT', user); }
async function deleteUserAPI(id) { return apiCall(`/api/users/${id}`, 'DELETE'); }

async function loadTickets() { return apiCall('/api/tickets'); }
async function saveTicket(ticket) { return apiCall('/api/tickets', 'POST', ticket); }

async function loadLogs() { return apiCall('/api/logs'); }
async function saveLog(log) { return apiCall('/api/logs', 'POST', log); }

async function loginAPI(username, password) { 
    return apiCall('/api/login', 'POST', { username, password }); 
}

async function exportAllDataAPI() { return apiCall('/api/export-all'); }
async function importAllDataAPI(data) { return apiCall('/api/import-all', 'POST', data); }

async function logActivity(action, details) { 
    if(!currentUser || !currentUser.name) return; 
    try {
        await saveLog({
            userName: currentUser.name,
            userRole: currentUser.role,
            action: action,
            details: details,
            date: getCurrentDate(),
            time: getCurrentTime()
        });
    } catch(e) { console.error('Log error:', e); }
}
