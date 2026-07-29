// public/js/app.js
// الملف الرئيسي - يتحكم في التنقل بين الصفحات

console.log('✅ Marine System loaded');

let currentPage = 'fleet';
let allVessels = [];
let allUsers = [];
let allTickets = [];
let allNotes = [];
let allMaintenance = [];
let currentUser = null;

// ============================================================
// تحميل الصفحات
// ============================================================

function loadPage(pageName) {
    const container = document.getElementById('pageContainer');
    if (!container) return;
    
    // إخفاء جميع الصفحات
    document.querySelectorAll('.page-content').forEach(el => el.remove());
    
    // تحميل الصفحة المطلوبة
    fetch(`/pages/${pageName}.html`)
        .then(res => {
            if (!res.ok) throw new Error('Page not found');
            return res.text();
        })
        .then(html => {
            const div = document.createElement('div');
            div.className = 'page-content';
            div.id = `page-${pageName}`;
            div.innerHTML = html;
            container.appendChild(div);
            currentPage = pageName;
            
            // تهيئة الصفحة بعد تحميلها
            initPage(pageName);
        })
        .catch(err => {
            console.error('Error loading page:', err);
            container.innerHTML = `
                <div style="text-align:center; padding:50px; color:#dc3545;">
                    ❌ خطأ في تحميل الصفحة: ${pageName}
                </div>
            `;
        });
}

function initPage(pageName) {
    switch(pageName) {
        case 'fleet':
            if (typeof initFleet === 'function') initFleet();
            break;
        case 'maintenance':
            if (typeof initMaintenance === 'function') initMaintenance();
            break;
        case 'efficiency':
            if (typeof initEfficiency === 'function') initEfficiency();
            break;
        case 'support':
            if (typeof initSupport === 'function') initSupport();
            break;
        case 'tracking':
            if (typeof initTracking === 'function') initTracking();
            break;
        case 'map':
            if (typeof initMapPage === 'function') initMapPage();
            break;
        case 'users':
            if (typeof initUsers === 'function') initUsers();
            break;
        case 'notes':
            if (typeof initNotes === 'function') initNotes();
            break;
    }
}

function showPage(pageName) {
    loadPage(pageName);
}

// ============================================================
// تحميل البيانات العامة
// ============================================================

function loadAllData() {
    loadVessels();
    loadMaintenance();
    loadTickets();
    loadNotes();
    loadUsers();
}

function loadVessels() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/vessels', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allVessels = data || [];
        // تحديث الصفحات التي تعتمد على المراكب
        if (currentPage === 'fleet' && typeof renderFleet === 'function') renderFleet();
        if (currentPage === 'efficiency' && typeof renderEfficiency === 'function') renderEfficiency();
        if (currentPage === 'maintenance' && typeof updateMaintenanceVessels === 'function') updateMaintenanceVessels();
    })
    .catch(err => console.error('Load vessels error:', err));
}

function loadMaintenance() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/maintenance', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allMaintenance = data || [];
        if (currentPage === 'maintenance' && typeof renderMaintenance === 'function') renderMaintenance();
    })
    .catch(err => console.error('Load maintenance error:', err));
}

function loadTickets() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/tickets', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allTickets = data || [];
        if (currentPage === 'support' && typeof renderTickets === 'function') renderTickets();
    })
    .catch(err => console.error('Load tickets error:', err));
}

function loadUsers() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/users', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allUsers = data || [];
        if (currentPage === 'users' && typeof renderUsers === 'function') renderUsers();
    })
    .catch(err => console.error('Load users error:', err));
}

function loadNotes() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/notes', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allNotes = data || [];
        if (currentPage === 'notes' && typeof renderNotes === 'function') renderNotes();
    })
    .catch(err => console.error('Load notes error:', err));
}

// ============================================================
// دوال عامة
// ============================================================

function refreshAllPages() {
    loadAllData();
    showAlert('✅ تم تحديث جميع البيانات', 'success');
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

// ============================================================
// تصدير الدوال العامة
// ============================================================

window.showPage = showPage;
window.loadVessels = loadVessels;
window.loadMaintenance = loadMaintenance;
window.loadTickets = loadTickets;
window.loadUsers = loadUsers;
window.loadNotes = loadNotes;
window.refreshAllPages = refreshAllPages;
window.scrollToTop = scrollToTop;
window.scrollToBottom = scrollToBottom;
window.loadAllData = loadAllData;

// ============================================================
// تهيئة التطبيق
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    if (localStorage.getItem('token')) {
        try {
            currentUser = JSON.parse(localStorage.getItem('user'));
            if (currentUser) {
                document.getElementById('loginOverlay').style.display = 'none';
                document.getElementById('mainApp').style.display = 'block';
                updateUserDisplay();
                loadAllData();
                loadPage('fleet');
            }
        } catch (e) {
            localStorage.clear();
        }
    }
});
