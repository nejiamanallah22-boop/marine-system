// ============================================================
// الإشعارات - notifications.js
// ============================================================

let notifications = [];
let notificationInterval = null;

function loadNotifications() {
    notifications = [];
    
    const openTickets = allTickets.filter(t => t.status === 'مفتوحة' || t.status === 'قيد المعالجة');
    if (openTickets.length > 0) {
        notifications.push({
            icon: '🎫',
            title: 'تذاكر مفتوحة',
            message: `لديك ${openTickets.length} تذكرة تحتاج إلى معالجة`,
            time: new Date(),
            type: 'warning'
        });
    }

    const brokenVessels = allVessels.filter(v => v.stat === 'معطب');
    if (brokenVessels.length > 0) {
        notifications.push({
            icon: '⚠️',
            title: 'مراكب معطبة',
            message: `يوجد ${brokenVessels.length} مركب معطب يحتاج إلى صيانة`,
            time: new Date(),
            type: 'danger'
        });
    }

    const maintenanceVessels = allVessels.filter(v => v.stat === 'صيانة');
    if (maintenanceVessels.length > 0) {
        notifications.push({
            icon: '🔧',
            title: 'مراكب في الصيانة',
            message: `${maintenanceVessels.length} مركب قيد الصيانة حالياً`,
            time: new Date(),
            type: 'info'
        });
    }

    const activeUsers = allUsers.filter(u => u.isActive !== false);
    if (activeUsers.length > 0) {
        notifications.push({
            icon: '👤',
            title: 'مستخدمين نشطين',
            message: `${activeUsers.length} مستخدم نشط في النظام`,
            time: new Date(),
            type: 'success'
        });
    }

    if (notifications.length === 0) {
        notifications.push({
            icon: '✅',
            title: 'كل شيء على ما يرام',
            message: 'لا توجد إشعارات جديدة',
            time: new Date(),
            type: 'success'
        });
    }

    updateNotificationBadge();
}

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    
    const count = notifications.length;
    badge.textContent = count;
    
    if (count > 0) {
        badge.style.display = 'inline-block';
        badge.style.backgroundColor = '#f87171';
        badge.style.color = 'white';
        badge.style.borderRadius = '50%';
        badge.style.padding = '2px 6px';
        badge.style.fontSize = '10px';
        badge.style.marginRight = '4px';
    } else {
        badge.style.display = 'none';
    }
}

function toggleNotifications() {
    const existingPanel = document.getElementById('notificationPanel');
    if (existingPanel) {
        existingPanel.remove();
        return;
    }

    const panel = document.createElement('div');
    panel.id = 'notificationPanel';
    panel.style.cssText = `
        position: fixed;
        top: 70px;
        right: 20px;
        width: 350px;
        max-height: 450px;
        overflow-y: auto;
        background: rgba(20,20,40,0.95);
        backdrop-filter: blur(20px);
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        z-index: 99999;
        padding: 16px;
        animation: slideDown 0.3s ease;
    `;

    panel.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px;">
            <span style="font-weight:bold; color:rgba(255,255,255,0.8);">🔔 الإشعارات</span>
            <span style="font-size:11px; color:rgba(255,255,255,0.3);">${notifications.length} إشعار</span>
            <button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:rgba(255,255,255,0.3); cursor:pointer; font-size:16px;">✕</button>
        </div>
        ${notifications.map(n => `
            <div style="
                padding: 10px 12px;
                margin-bottom: 8px;
                border-radius: 10px;
                background: rgba(255,255,255,0.03);
                border-right: 3px solid ${n.type === 'danger' ? '#f87171' : n.type === 'warning' ? '#fbbf24' : n.type === 'success' ? '#4ade80' : '#60a5fa'};
                transition: all 0.3s;
            ">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:18px;">${n.icon}</span>
                    <div style="flex:1;">
                        <div style="font-weight:bold; font-size:13px; color:rgba(255,255,255,0.8);">${n.title}</div>
                        <div style="font-size:12px; color:rgba(255,255,255,0.4);">${n.message}</div>
                        <div style="font-size:10px; color:rgba(255,255,255,0.15); margin-top:2px;">${formatTime(n.time)}</div>
                    </div>
                </div>
            </div>
        `).join('')}
        <div style="text-align:center; margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.05);">
            <button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:rgba(255,255,255,0.2); cursor:pointer; font-size:11px;">إغلاق</button>
        </div>
    `;

    document.body.appendChild(panel);

    setTimeout(() => {
        document.addEventListener('click', function closePanel(e) {
            if (!panel.contains(e.target) && e.target.id !== 'notificationBadge') {
                panel.remove();
                document.removeEventListener('click', closePanel);
            }
        });
    }, 100);
}

function startNotificationAutoUpdate() {
    if (notificationInterval) clearInterval(notificationInterval);
    
    notificationInterval = setInterval(() => {
        loadNotifications();
    }, 30000);
}

function initNotifications() {
    loadNotifications();
    startNotificationAutoUpdate();
}

// إضافة CSS للحركة
const notificationStyle = document.createElement('style');
notificationStyle.textContent = `
    @keyframes slideDown {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
    }
    #notificationPanel::-webkit-scrollbar {
        width: 4px;
    }
    #notificationPanel::-webkit-scrollbar-track {
        background: rgba(255,255,255,0.02);
        border-radius: 10px;
    }
    #notificationPanel::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.08);
        border-radius: 10px;
    }
`;
document.head.appendChild(notificationStyle);

console.log('✅ notifications.js loaded');
