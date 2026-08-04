// ============================================================
// المراقبة - sessions.js
// ============================================================

let activityLog = [];
let sessionsData = [];
let trackingInterval = null;

function initActivityData() {
    const users = [
        { name: 'مدير النظام', role: 'مسؤول' },
        { name: 'مدير العمليات', role: 'مشرف' },
        { name: 'محرر', role: 'محرر' },
        { name: 'مشاهد', role: 'مشاهد' },
        { name: 'فني صيانة', role: 'محرر' }
    ];

    const actions = ['تسجيل دخول', 'تسجيل خروج', 'عرض', 'تعديل', 'إضافة', 'حذف'];
    const pages = ['لوحة التحكم', 'الأسطول', 'الصيانة', 'الجاهزية', 'الدعم', 'المستخدمين', 'المذكرات', 'المساعد الذكي'];
    const devices = ['Chrome / Windows', 'Firefox / Mac', 'Safari / iPhone', 'Edge / Windows', 'Chrome / Android'];

    for (let i = 0; i < 50; i++) {
        const user = users[Math.floor(Math.random() * users.length)];
        const action = actions[Math.floor(Math.random() * actions.length)];
        const page = pages[Math.floor(Math.random() * pages.length)];
        const device = devices[Math.floor(Math.random() * devices.length)];
        
        const date = new Date();
        date.setHours(date.getHours() - Math.floor(Math.random() * 72));
        
        activityLog.push({
            id: i + 1,
            user: user.name,
            role: user.role,
            action: action,
            page: page,
            device: device,
            time: date,
            ip: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
        });
    }

    activityLog.sort((a, b) => b.time - a.time);

    sessionsData = [
        { id: 1, name: 'مدير النظام', role: 'مسؤول', ip: '192.168.1.1', device: 'Chrome / Windows', lastActive: new Date(), status: 'online' },
        { id: 2, name: 'مدير العمليات', role: 'مشرف', ip: '192.168.1.2', device: 'Firefox / Mac', lastActive: new Date(Date.now() - 300000), status: 'online' },
        { id: 3, name: 'محرر', role: 'محرر', ip: '192.168.1.3', device: 'Safari / iPhone', lastActive: new Date(Date.now() - 900000), status: 'idle' },
        { id: 4, name: 'مشاهد', role: 'مشاهد', ip: '192.168.1.4', device: 'Edge / Windows', lastActive: new Date(Date.now() - 3600000), status: 'offline' }
    ];
}

function loadSessions() {
    if (activityLog.length === 0) {
        initActivityData();
    }

    updateStats();
    renderSessions();
    renderActivityLog();
    
    setTimeout(initUserMap, 500);
    setTimeout(startMapAutoRefresh, 1000);
}

function updateStats() {
    const online = sessionsData.filter(s => s.status === 'online').length;
    const total = sessionsData.length;
    const today = activityLog.filter(a => {
        const today = new Date();
        return a.time.getDate() === today.getDate() &&
               a.time.getMonth() === today.getMonth() &&
               a.time.getFullYear() === today.getFullYear();
    }).length;

    document.getElementById('onlineCount').textContent = online;
    document.getElementById('totalUsers').textContent = total;
    document.getElementById('todayActivity').textContent = today;
}

function renderSessions() {
    const container = document.getElementById('sessionsGrid');
    if (!container) return;

    if (sessionsData.length === 0) {
        container.innerHTML = '<div class="no-data">🚫 لا توجد جلسات نشطة</div>';
        return;
    }

    const statusLabels = {
        'online': '🟢 نشط',
        'idle': '🟡 غير نشط',
        'offline': '🔴 غير متصل'
    };

    const statusClass = {
        'online': 'online',
        'idle': 'idle',
        'offline': 'offline'
    };

    container.innerHTML = sessionsData.map(s => {
        const timeAgo = getTimeAgo(s.lastActive);
        return `
            <div class="session-card">
                <div class="header">
                    <span class="user-name">${s.name}</span>
                    <span class="user-role">${s.role}</span>
                </div>
                <div class="info"><i class="fas fa-laptop"></i> ${s.device}</div>
                <div class="info"><i class="fas fa-network-wired"></i> ${s.ip}</div>
                <div class="info"><i class="fas fa-clock"></i> آخر نشاط: ${timeAgo}</div>
                <span class="status ${statusClass[s.status]}">${statusLabels[s.status]}</span>
            </div>
        `;
    }).join('');
}

function renderActivityLog(filteredData) {
    const tbody = document.getElementById('activityBody');
    if (!tbody) return;

    const data = filteredData || activityLog;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">🚫 لا توجد سجلات</td></tr>';
        return;
    }

    const actionClass = {
        'تسجيل دخول': 'login',
        'تسجيل خروج': 'logout',
        'عرض': 'view',
        'تعديل': 'edit',
        'إضافة': 'add',
        'حذف': 'delete'
    };

    tbody.innerHTML = data.slice(0, 100).map(a => `
        <tr>
            <td><strong>${a.user}</strong> <span style="font-size:11px; color:rgba(255,255,255,0.2);">${a.role}</span></td>
            <td><span class="action ${actionClass[a.action] || ''}">${a.action}</span></td>
            <td>${a.page}</td>
            <td>${a.ip}</td>
            <td class="time">${formatTime(a.time)}</td>
        </tr>
    `).join('');
}

function filterActivity() {
    const search = document.getElementById('searchActivity')?.value?.toLowerCase() || '';
    const action = document.getElementById('filterAction')?.value || '';

    let filtered = activityLog;

    if (search) {
        filtered = filtered.filter(a => 
            a.user.toLowerCase().includes(search) ||
            a.page.toLowerCase().includes(search) ||
            a.action.includes(search)
        );
    }

    if (action) {
        filtered = filtered.filter(a => a.action === action);
    }

    renderActivityLog(filtered);
}

function clearFilters() {
    document.getElementById('searchActivity').value = '';
    document.getElementById('filterAction').value = '';
    renderActivityLog(activityLog);
}

function startTrackingAutoUpdate() {
    if (trackingInterval) clearInterval(trackingInterval);
    trackingInterval = setInterval(() => {
        if (document.getElementById('page-sessions')) {
            renderSessions();
            if (userMap) {
                loadUserLocations();
                setTimeout(() => {
                    if (userMap) userMap.invalidateSize();
                }, 100);
            }
        }
    }, 30000);
}

console.log('✅ sessions.js loaded');
