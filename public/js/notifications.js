// public/js/notifications.js
// نظام الإشعارات

// ============================================================
// إشعارات المتصفح
// ============================================================

let notificationPermission = false;

// طلب إذن الإشعارات
export function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('⚠️ هذا المتصفح لا يدعم الإشعارات');
        return;
    }
    
    if (Notification.permission === 'granted') {
        notificationPermission = true;
        console.log('✅ إذن الإشعارات موجود');
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            notificationPermission = permission === 'granted';
            if (notificationPermission) {
                console.log('✅ تم منح إذن الإشعارات');
            } else {
                console.log('❌ تم رفض إذن الإشعارات');
            }
        });
    }
}

// إرسال إشعار
export function sendNotification(title, body, icon = '🔔') {
    if (!notificationPermission && Notification.permission === 'granted') {
        notificationPermission = true;
    }
    
    if (!notificationPermission) {
        console.log('⚠️ لا يوجد إذن لإرسال الإشعارات');
        return;
    }
    
    try {
        const notification = new Notification(`⚓ ${title}`, {
            body: body,
            icon: icon,
            silent: false
        });
        
        // إغلاق الإشعار بعد 5 ثواني
        setTimeout(() => {
            notification.close();
        }, 5000);
        
        // عند النقر على الإشعار
        notification.onclick = function() {
            window.focus();
            notification.close();
        };
        
        return notification;
    } catch (error) {
        console.error('Error sending notification:', error);
    }
}

// ============================================================
// إشعارات التطبيق (داخل الصفحة)
// ============================================================

// عرض إشعار في التطبيق
export function showAppNotification(message, type = 'info') {
    const colors = {
        success: '#28a745',
        danger: '#dc3545',
        warning: '#ffc107',
        info: '#0d6efd'
    };
    
    const container = document.getElementById('notificationContainer') || createNotificationContainer();
    
    const notification = document.createElement('div');
    notification.style.cssText = `
        padding: 12px 20px;
        margin-bottom: 8px;
        border-radius: 8px;
        color: white;
        background: ${colors[type] || colors.info};
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        animation: slideIn 0.3s ease;
        font-family: 'Cairo', sans-serif;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()" 
                style="background:transparent; border:none; color:white; cursor:pointer; font-size:16px;">
            ✕
        </button>
    `;
    
    container.appendChild(notification);
    
    // إزالة الإشعار بعد 5 ثواني
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, 300);
        }
    }, 5000);
}

// إنشاء حاوية الإشعارات
function createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notificationContainer';
    container.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        z-index: 99999;
        max-width: 400px;
        width: 100%;
    `;
    document.body.appendChild(container);
    return container;
}

// ============================================================
// إشعارات المهام
// ============================================================

// إشعار عند إضافة مركب جديد
export function notifyVesselAdded(vesselName) {
    sendNotification('🚢 مركب جديد', `تم إضافة المركب: ${vesselName}`, '🚢');
    showAppNotification(`✅ تم إضافة المركب: ${vesselName}`, 'success');
}

// إشعار عند إكمال صيانة
export function notifyMaintenanceComplete(vesselName) {
    sendNotification('🔧 صيانة مكتملة', `تم إكمال صيانة المركب: ${vesselName}`, '🔧');
    showAppNotification(`✅ تم إكمال صيانة: ${vesselName}`, 'success');
}

// إشعار عند تذكرة جديدة
export function notifyNewTicket(subject) {
    sendNotification('🎫 تذكرة جديدة', `تذكرة: ${subject}`, '🎫');
    showAppNotification(`📨 تم إرسال التذكرة: ${subject}`, 'info');
}

// إشعار عند مستخدم جديد
export function notifyNewUser(userName) {
    sendNotification('👤 مستخدم جديد', `تم إضافة المستخدم: ${userName}`, '👤');
    showAppNotification(`✅ تم إضافة المستخدم: ${userName}`, 'success');
}

// ============================================================
// إشعارات الأخطاء
// ============================================================

// إشعار خطأ
export function notifyError(message) {
    sendNotification('❌ خطأ', message, '❌');
    showAppNotification(`❌ ${message}`, 'danger');
}

// ============================================================
// تحديث عداد الإشعارات
// ============================================================

export function updateNotificationBadge(count) {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    
    if (count > 0) {
        badge.style.display = 'inline';
        badge.textContent = count > 9 ? '9+' : count;
    } else {
        badge.style.display = 'none';
    }
}

// ============================================================
// دوال عامة
// ============================================================

// تبديل الإشعارات (زر الجرس)
export function toggleNotifications() {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        badge.style.display = 'none';
    }
    showAppNotification('🔔 لا توجد إشعارات جديدة', 'info');
}

// تهيئة الإشعارات عند تحميل الصفحة
export function initNotifications() {
    requestNotificationPermission();
    updateNotificationBadge(0);
    
    // تحديث الإشعارات كل دقيقة (اختياري)
    setInterval(() => {
        // هنا يمكن جلب الإشعارات من السيرفر
    }, 60000);
}

// ============================================================
// تصدير الدوال
// ============================================================

window.toggleNotifications = toggleNotifications;
window.sendNotification = sendNotification;
window.showAppNotification = showAppNotification;
window.notifyVesselAdded = notifyVesselAdded;
window.notifyMaintenanceComplete = notifyMaintenanceComplete;
window.notifyNewTicket = notifyNewTicket;
window.notifyNewUser = notifyNewUser;
window.notifyError = notifyError;

console.log('✅ Notification system loaded');
