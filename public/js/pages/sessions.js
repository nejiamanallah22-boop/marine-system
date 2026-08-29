/**
 * ============================================================
 * 📡 SESSIONS.JS v8.0 - المراقبة الشاملة (نسخة محسنة)
 * ============================================================
 * ✅ مراقبة الجلسات النشطة
 * ✅ سجل النشاطات في الوقت الفعلي
 * ✅ إحصائيات تفاعلية
 * ✅ خريطة مواقع المستخدمين
 * ✅ تحديث تلقائي
 * ✅ فلترة وبحث متقدم
 * ============================================================
 */

'use strict';

console.log('📡 [Sessions] تحميل وحدة المراقبة...');

// ============================================================
// 📦 STATE - الحالة
// ============================================================

let sessionsState = {
    activityLog: [],
    sessions: [],
    trackingInterval: null,
    filter: {
        search: '',
        action: '',
        user: '',
        date: ''
    },
    stats: {
        online: 0,
        total: 0,
        todayActivity: 0,
        activeUsers: 0
    }
};

// ============================================================
// 🔧 HELPERS - دوال مساعدة
// ============================================================

/**
 * تنسيق الوقت
 * @param {Date} date - التاريخ
 * @returns {string}
 */
function formatTime(date) {
    if (!date) return '-';
    try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleString('ar-TN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return '-';
    }
}

/**
 * الحصول على الوقت المنقضي
 * @param {Date} date - التاريخ
 * @returns {string}
 */
function getTimeAgo(date) {
    if (!date) return '-';
    try {
        const now = new Date();
        const diff = now - new Date(date);
        
        if (diff < 0) return 'الآن';
        
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'الآن';
        if (minutes < 60) return `${minutes} دقيقة`;
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} ساعة`;
        
        const days = Math.floor(hours / 24);
        return `${days} يوم`;
    } catch {
        return '-';
    }
}

/**
 * تنقية النص من HTML
 */
function escapeHTML(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * عرض إشعار
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(30px)';
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 300);
    }, 3000);
}

// ============================================================
// 📊 DATA INITIALIZATION - تهيئة البيانات
// ============================================================

/**
 * تهيئة بيانات النشاطات
 */
function initActivityData() {
    console.log('📊 [Sessions] تهيئة البيانات...');
    
    const users = [
        { name: 'مدير النظام', role: 'مسؤول' },
        { name: 'مدير العمليات', role: 'مدير' },
        { name: 'محرر', role: 'محرر' },
        { name: 'مشاهد', role: 'مشاهد' },
        { name: 'فني صيانة', role: 'محرر' },
        { name: 'قائد الأسطول', role: 'مدير' },
        { name: 'محلل بيانات', role: 'مشاهد' }
    ];

    const actions = ['تسجيل دخول', 'تسجيل خروج', 'عرض', 'تعديل', 'إضافة', 'حذف', 'تصدير', 'طباعة'];
    const pages = ['لوحة التحكم', 'الأسطول', 'الصيانة', 'الجاهزية', 'الدعم', 'المستخدمين', 'المذكرات', 'المساعد الذكي', 'الإعدادات'];
    const devices = ['Chrome / Windows', 'Firefox / Mac', 'Safari / iPhone', 'Edge / Windows', 'Chrome / Android', 'Safari / Mac', 'Firefox / Linux'];
    const ips = ['192.168.1.1', '192.168.1.2', '192.168.1.3', '192.168.1.4', '192.168.1.5', '10.0.0.1', '10.0.0.2'];

    // إنشاء 100 نشاط عشوائي
    for (let i = 0; i < 100; i++) {
        const user = users[Math.floor(Math.random() * users.length)];
        const action = actions[Math.floor(Math.random() * actions.length)];
        const page = pages[Math.floor(Math.random() * pages.length)];
        const device = devices[Math.floor(Math.random() * devices.length)];
        const ip = ips[Math.floor(Math.random() * ips.length)];
        
        const date = new Date();
        date.setHours(date.getHours() - Math.floor(Math.random() * 168)); // آخر 7 أيام
        date.setMinutes(date.getMinutes() - Math.floor(Math.random() * 60));
        
        sessionsState.activityLog.push({
            id: i + 1,
            user: user.name,
            role: user.role,
            action: action,
            page: page,
            device: device,
            ip: ip,
            time: date,
            duration: Math.floor(Math.random() * 1800) // 0-30 دقيقة
        });
    }

    // ترتيب حسب التاريخ (الأحدث أولاً)
    sessionsState.activityLog.sort((a, b) => b.time - a.time);

    // بيانات الجلسات النشطة
    sessionsState.sessions = [
        {
            id: 1,
            name: 'مدير النظام',
            role: 'مسؤول',
            ip: '192.168.1.1',
            device: 'Chrome / Windows',
            lastActive: new Date(),
            status: 'online',
            location: 'تونس'
        },
        {
            id: 2,
            name: 'مدير العمليات',
            role: 'مدير',
            ip: '192.168.1.2',
            device: 'Firefox / Mac',
            lastActive: new Date(Date.now() - 300000),
            status: 'online',
            location: 'صفاقس'
        },
        {
            id: 3,
            name: 'محرر',
            role: 'محرر',
            ip: '192.168.1.3',
            device: 'Safari / iPhone',
            lastActive: new Date(Date.now() - 900000),
            status: 'idle',
            location: 'سوسة'
        },
        {
            id: 4,
            name: 'مشاهد',
            role: 'مشاهد',
            ip: '192.168.1.4',
            device: 'Edge / Windows',
            lastActive: new Date(Date.now() - 3600000),
            status: 'offline',
            location: 'بنزرت'
        },
        {
            id: 5,
            name: 'فني صيانة',
            role: 'محرر',
            ip: '192.168.1.5',
            device: 'Chrome / Android',
            lastActive: new Date(Date.now() - 600000),
            status: 'online',
            location: 'قابس'
        }
    ];

    console.log(`✅ [Sessions] تم تهيئة ${sessionsState.activityLog.length} نشاط و ${sessionsState.sessions.length} جلسة`);
}

// ============================================================
// 📊 LOAD SESSIONS - تحميل المراقبة
// ============================================================

/**
 * تحميل صفحة المراقبة
 */
function loadSessions() {
    console.log('🔄 [Sessions] تحميل المراقبة...');
    
    if (sessionsState.activityLog.length === 0) {
        initActivityData();
    }

    updateStats();
    renderSessions();
    renderActivityLog();
    populateFilters();
    
    // تهيئة الخريطة
    setTimeout(initUserMap, 500);
    setTimeout(startMapAutoRefresh, 1000);
    
    // بدء التحديث التلقائي
    startTrackingAutoUpdate();
    
    console.log('✅ [Sessions] تم تحميل المراقبة');
}

// ============================================================
// 📊 UPDATE STATS - تحديث الإحصائيات
// ============================================================

function updateStats() {
    const online = sessionsState.sessions.filter(s => s.status === 'online').length;
    const total = sessionsState.sessions.length;
    
    const today = new Date();
    const todayActivity = sessionsState.activityLog.filter(a => {
        const d = new Date(a.time);
        return d.getDate() === today.getDate() &&
               d.getMonth() === today.getMonth() &&
               d.getFullYear() === today.getFullYear();
    }).length;

    const activeUsers = [...new Set(
        sessionsState.activityLog
            .filter(a => new Date(a.time).getDate() === today.getDate())
            .map(a => a.user)
    )].length;

    sessionsState.stats = { online, total, todayActivity, activeUsers };

    setElementText('onlineCount', online);
    setElementText('totalUsers', total);
    setElementText('todayActivity', todayActivity);
    setElementText('activeUsers', activeUsers);
}

function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// ============================================================
// 👥 RENDER SESSIONS - عرض الجلسات
// ============================================================

function renderSessions() {
    const container = document.getElementById('sessionsGrid');
    if (!container) return;

    if (sessionsState.sessions.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:40px;color:var(--text-dim);">
                <i class="fas fa-users" style="font-size:32px;display:block;margin-bottom:12px;opacity:0.3;"></i>
                لا توجد جلسات نشطة
            </div>
        `;
        return;
    }

    const statusLabels = {
        'online': '🟢 نشط',
        'idle': '🟡 غير نشط',
        'offline': '🔴 غير متصل'
    };

    const statusClass = {
        'online': 'status-online',
        'idle': 'status-idle',
        'offline': 'status-offline'
    };

    container.innerHTML = sessionsState.sessions.map(s => `
        <div class="session-card" style="
            background:rgba(255,255,255,0.03);
            border-radius:12px;
            padding:16px;
            border:1px solid var(--border);
            transition:all 0.3s;
            ${s.status === 'online' ? 'border-right:3px solid #22c55e;' : ''}
            ${s.status === 'idle' ? 'border-right:3px solid #eab308;' : ''}
            ${s.status === 'offline' ? 'border-right:3px solid #ef4444;' : ''}
        ">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;">
                <div>
                    <div style="font-size:16px;font-weight:600;color:#fff;">${escapeHTML(s.name)}</div>
                    <div style="font-size:12px;color:var(--text-muted);">${escapeHTML(s.role)}</div>
                </div>
                <span class="status-badge ${statusClass[s.status]}">${statusLabels[s.status]}</span>
            </div>
            <div style="font-size:13px;color:var(--text-muted);space-y:4px;">
                <div><i class="fas fa-laptop" style="width:18px;"></i> ${escapeHTML(s.device)}</div>
                <div><i class="fas fa-network-wired" style="width:18px;"></i> ${escapeHTML(s.ip)}</div>
                ${s.location ? `<div><i class="fas fa-map-marker-alt" style="width:18px;"></i> ${escapeHTML(s.location)}</div>` : ''}
                <div><i class="fas fa-clock" style="width:18px;"></i> آخر نشاط: ${getTimeAgo(s.lastActive)}</div>
            </div>
        </div>
    `).join('');
}

// ============================================================
// 📋 RENDER ACTIVITY LOG - عرض سجل النشاطات
// ============================================================

function renderActivityLog(filteredData) {
    const tbody = document.getElementById('activityBody');
    if (!tbody) return;

    const data = filteredData || sessionsState.activityLog;

    if (data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center;padding:40px;color:var(--text-dim);">
                    <i class="fas fa-history" style="font-size:32px;display:block;margin-bottom:12px;opacity:0.3;"></i>
                    لا توجد سجلات
                </td>
            </tr>
        `;
        return;
    }

    const actionClass = {
        'تسجيل دخول': 'action-login',
        'تسجيل خروج': 'action-logout',
        'عرض': 'action-view',
        'تعديل': 'action-edit',
        'إضافة': 'action-add',
        'حذف': 'action-delete',
        'تصدير': 'action-export',
        'طباعة': 'action-print'
    };

    const actionColors = {
        'تسجيل دخول': '#22c55e',
        'تسجيل خروج': '#ef4444',
        'عرض': '#60a5fa',
        'تعديل': '#eab308',
        'إضافة': '#a78bfa',
        'حذف': '#ef4444',
        'تصدير': '#22c55e',
        'طباعة': '#60a5fa'
    };

    tbody.innerHTML = data.slice(0, 100).map(a => `
        <tr style="border-bottom:1px solid var(--border);">
            <td>
                <div style="font-weight:500;">${escapeHTML(a.user)}</div>
                <div style="font-size:11px;color:var(--text-dim);">${escapeHTML(a.role)}</div>
            </td>
            <td>
                <span style="
                    display:inline-block;
                    padding:2px 10px;
                    border-radius:12px;
                    font-size:12px;
                    font-weight:500;
                    background:${actionColors[a.action] || 'var(--text-dim)'}22;
                    color:${actionColors[a.action] || 'var(--text-dim)'};
                ">
                    ${escapeHTML(a.action)}
                </span>
            </td>
            <td style="color:var(--text-muted);">${escapeHTML(a.page)}</td>
            <td style="color:var(--text-muted);font-size:13px;">${escapeHTML(a.ip)}</td>
            <td style="color:var(--text-muted);font-size:13px;">${escapeHTML(a.device)}</td>
            <td style="color:var(--text-muted);font-size:13px;">${formatTime(a.time)}</td>
        </tr>
    `).join('');
}

// ============================================================
// 🔍 FILTERS - الفلاتر والبحث
// ============================================================

function filterActivity() {
    const search = document.getElementById('searchActivity')?.value?.toLowerCase()?.trim() || '';
    const action = document.getElementById('filterAction')?.value || '';
    const user = document.getElementById('filterUser')?.value || '';
    const dateFilter = document.getElementById('filterDate')?.value || '';

    let filtered = sessionsState.activityLog;

    if (search) {
        filtered = filtered.filter(a => 
            a.user.toLowerCase().includes(search) ||
            a.page.toLowerCase().includes(search) ||
            a.action.includes(search) ||
            a.ip.includes(search)
        );
    }

    if (action) {
        filtered = filtered.filter(a => a.action === action);
    }

    if (user) {
        filtered = filtered.filter(a => a.user === user);
    }

    if (dateFilter) {
        const targetDate = new Date(dateFilter);
        filtered = filtered.filter(a => {
            const d = new Date(a.time);
            return d.getDate() === targetDate.getDate() &&
                   d.getMonth() === targetDate.getMonth() &&
                   d.getFullYear() === targetDate.getFullYear();
        });
    }

    renderActivityLog(filtered);
}

function clearActivityFilters() {
    const search = document.getElementById('searchActivity');
    const action = document.getElementById('filterAction');
    const user = document.getElementById('filterUser');
    const date = document.getElementById('filterDate');

    if (search) search.value = '';
    if (action) action.value = '';
    if (user) user.value = '';
    if (date) date.value = '';

    renderActivityLog(sessionsState.activityLog);
    showToast('🔄 تم مسح الفلاتر', 'info');
}

function populateFilters() {
    // ملء خيارات المستخدمين
    const users = [...new Set(sessionsState.activityLog.map(a => a.user))];
    const userSelect = document.getElementById('filterUser');
    if (userSelect) {
        const currentValue = userSelect.value;
        userSelect.innerHTML = '<option value="">جميع المستخدمين</option>';
        users.sort().forEach(u => {
            userSelect.innerHTML += `<option value="${escapeHTML(u)}">${escapeHTML(u)}</option>`;
        });
        userSelect.value = currentValue;
    }

    // ملء خيارات الإجراءات
    const actions = [...new Set(sessionsState.activityLog.map(a => a.action))];
    const actionSelect = document.getElementById('filterAction');
    if (actionSelect) {
        const currentValue = actionSelect.value;
        actionSelect.innerHTML = '<option value="">جميع الإجراءات</option>';
        actions.sort().forEach(a => {
            actionSelect.innerHTML += `<option value="${escapeHTML(a)}">${escapeHTML(a)}</option>`;
        });
        actionSelect.value = currentValue;
    }
}

// ============================================================
// 🗺️ USER MAP - خريطة المستخدمين
// ============================================================

let userMap = null;
let mapMarkers = [];
let mapRefreshInterval = null;

/**
 * تهيئة خريطة المستخدمين
 */
function initUserMap() {
    const container = document.getElementById('userMap');
    if (!container) return;

    // التحقق من وجود Leaflet
    if (typeof L === 'undefined') {
        console.warn('⚠️ [Sessions] Leaflet غير محمل');
        container.innerHTML = `
            <div style="text-align:center;padding:40px;color:var(--text-dim);">
                <i class="fas fa-map-marked-alt" style="font-size:32px;display:block;margin-bottom:12px;opacity:0.3;"></i>
                جاري تحميل الخريطة...
                <div class="loader-spinner" style="margin:12px auto;"></div>
            </div>
        `;
        return;
    }

    try {
        // إنشاء الخريطة
        userMap = L.map(container).setView([34.0, 9.0], 6);

        // إضافة طبقة الخريطة
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(userMap);

        // تحميل مواقع المستخدمين
        loadUserLocations();

        console.log('✅ [Sessions] تم تهيئة الخريطة');

    } catch (error) {
        console.error('❌ [Sessions] خطأ في تهيئة الخريطة:', error);
        container.innerHTML = `
            <div style="text-align:center;padding:40px;color:var(--danger);">
                <i class="fas fa-exclamation-triangle" style="font-size:32px;display:block;margin-bottom:12px;"></i>
                حدث خطأ في تحميل الخريطة
            </div>
        `;
    }
}

/**
 * تحميل مواقع المستخدمين على الخريطة
 */
function loadUserLocations() {
    if (!userMap) return;

    // تنظيف العلامات القديمة
    mapMarkers.forEach(marker => {
        if (userMap) userMap.removeLayer(marker);
    });
    mapMarkers = [];

    // مواقع المستخدمين (محاكاة)
    const locations = [
        { lat: 36.8065, lng: 10.1815, name: 'مدير النظام', status: 'online' }, // تونس
        { lat: 34.739, lng: 10.760, name: 'مدير العمليات', status: 'online' }, // صفاقس
        { lat: 35.825, lng: 10.641, name: 'محرر', status: 'idle' }, // سوسة
        { lat: 37.274, lng: 9.874, name: 'مشاهد', status: 'offline' }, // بنزرت
        { lat: 33.881, lng: 10.098, name: 'فني صيانة', status: 'online' } // قابس
    ];

    // إنشاء علامات جديدة
    locations.forEach(loc => {
        const color = loc.status === 'online' ? '#22c55e' : 
                     loc.status === 'idle' ? '#eab308' : '#ef4444';
        
        // إنشاء أيقونة مخصصة
        const icon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="
                width:12px;
                height:12px;
                border-radius:50%;
                background:${color};
                border:2px solid #fff;
                box-shadow:0 2px 8px rgba(0,0,0,0.3);
            "></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });

        const marker = L.marker([loc.lat, loc.lng], { icon })
            .addTo(userMap)
            .bindPopup(`
                <div style="text-align:right;font-family:'Cairo',sans-serif;">
                    <strong>${escapeHTML(loc.name)}</strong><br>
                    الحالة: ${loc.status === 'online' ? '🟢 نشط' : loc.status === 'idle' ? '🟡 غير نشط' : '🔴 غير متصل'}
                </div>
            `);

        mapMarkers.push(marker);
    });

    // تكبير الخريطة لتناسب العلامات
    if (mapMarkers.length > 0) {
        const group = L.featureGroup(mapMarkers);
        userMap.fitBounds(group.getBounds(), { padding: [50, 50] });
    }
}

/**
 * بدء التحديث التلقائي للخريطة
 */
function startMapAutoRefresh() {
    if (mapRefreshInterval) clearInterval(mapRefreshInterval);
    mapRefreshInterval = setInterval(() => {
        if (userMap && document.getElementById('page-sessions')) {
            loadUserLocations();
            userMap.invalidateSize();
        }
    }, 30000);
}

// ============================================================
// 🔄 AUTO REFRESH - تحديث تلقائي
// ============================================================

function startTrackingAutoUpdate() {
    if (sessionsState.trackingInterval) {
        clearInterval(sessionsState.trackingInterval);
    }

    sessionsState.trackingInterval = setInterval(() => {
        // تحديث الإحصائيات
        updateStats();
        
        // تحديث الجلسات
        renderSessions();
        
        // تحديث الخريطة
        if (userMap) {
            loadUserLocations();
            userMap.invalidateSize();
        }
        
        console.log('🔄 [Sessions] تحديث تلقائي');
    }, 30000);
}

function stopTrackingAutoUpdate() {
    if (sessionsState.trackingInterval) {
        clearInterval(sessionsState.trackingInterval);
        sessionsState.trackingInterval = null;
    }
    if (mapRefreshInterval) {
        clearInterval(mapRefreshInterval);
        mapRefreshInterval = null;
    }
}

// ============================================================
// 📊 EXPORT - تصدير البيانات
// ============================================================

function exportActivityLog() {
    const data = sessionsState.activityLog;
    
    if (!data || data.length === 0) {
        showToast('⚠️ لا توجد بيانات للتصدير', 'warning');
        return;
    }

    const headers = ['المستخدم', 'الدور', 'الإجراء', 'الصفحة', 'الجهاز', 'IP', 'التاريخ'];
    let csv = headers.join(',') + '\n';
    
    data.forEach(a => {
        const row = [
            a.user || '-',
            a.role || '-',
            a.action || '-',
            a.page || '-',
            a.device || '-',
            a.ip || '-',
            formatTime(a.time)
        ];
        csv += row.join(',') + '\n';
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `activity_log_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    
    showToast(`📥 تم تصدير ${data.length} سجل`, 'success');
}

// ============================================================
// 🔗 INIT - تهيئة الصفحة
// ============================================================

function initSessionsPage() {
    console.log('📡 [Sessions] تهيئة صفحة المراقبة...');
    
    // أزرار الصفحة الرئيسية
    document.getElementById('refreshSessions')?.addEventListener('click', () => {
        loadSessions();
        showToast('🔄 تم تحديث المراقبة', 'info');
    });
    
    document.getElementById('clearSessionsFilters')?.addEventListener('click', clearActivityFilters);
    document.getElementById('exportActivity')?.addEventListener('click', exportActivityLog);
    
    // الفلاتر
    document.getElementById('searchActivity')?.addEventListener('input', filterActivity);
    document.getElementById('filterAction')?.addEventListener('change', filterActivity);
    document.getElementById('filterUser')?.addEventListener('change', filterActivity);
    document.getElementById('filterDate')?.addEventListener('change', filterActivity);
    
    // تحميل البيانات
    setTimeout(loadSessions, 200);
    
    console.log('✅ [Sessions] جاهز');
}

// ============================================================
// 🚀 START - بدء التشغيل
// ============================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSessionsPage);
} else {
    initSessionsPage();
}

// ============================================================
// 🌐 EXPOSE - تصدير الدوال للاستخدام العالمي
// ============================================================

window.loadSessions = loadSessions;
window.renderSessions = renderSessions;
window.renderActivityLog = renderActivityLog;
window.filterActivity = filterActivity;
window.clearActivityFilters = clearActivityFilters;
window.exportActivityLog = exportActivityLog;
window.initUserMap = initUserMap;
window.loadUserLocations = loadUserLocations;
window.startTrackingAutoUpdate = startTrackingAutoUpdate;
window.stopTrackingAutoUpdate = stopTrackingAutoUpdate;
window.initSessionsPage = initSessionsPage;

console.log('✅ [Sessions] تم تحميل وحدة المراقبة');
