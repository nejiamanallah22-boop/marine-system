// ============================================================
// ===== نظام الإشعارات =====
// ============================================================

let notifications = [];
let unreadCount = 0;

// ===== تحميل الإشعارات =====
async function loadNotifications() {
    if (!currentUser) return;
    
    try {
        const response = await fetch('/api/notifications', {
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });
        
        if (!response.ok) throw new Error(await response.text());
        
        const data = await response.json();
        notifications = data.notifications || [];
        unreadCount = data.unreadCount || 0;
        
        updateNotificationBadge();
        renderNotifications();
        
    } catch (error) {
        console.error('❌ خطأ في تحميل الإشعارات:', error);
    }
}

// ===== تحديث شارة الإشعارات =====
function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        if (unreadCount > 0) {
            badge.style.display = 'inline';
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        } else {
            badge.style.display = 'none';
        }
    }
}

// ===== عرض الإشعارات =====
function renderNotifications() {
    const container = document.getElementById('notificationsList');
    const count = document.getElementById('notifCount');
    
    if (!container) return;
    
    if (count) count.textContent = notifications.length;
    
    if (notifications.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#8a8aaa; padding:20px;">📭 لا توجد إشعارات</p>';
        return;
    }
    
    container.innerHTML = notifications.map(n => {
        const isRead = n.read ? '' : 'style="border-right: 4px solid #1a5fb4;"';
        const typeIcon = n.type === 'success' ? '✅' :
                         n.type === 'error' ? '❌' :
                         n.type === 'warning' ? '⚠️' : 'ℹ️';
        
        return `
            <div class="notification-item" ${isRead} style="padding:12px 16px; margin-bottom:8px; background:${n.read ? 'transparent' : 'rgba(26,95,180,0.04)'}; border-radius:8px; transition:0.3s; cursor:pointer;" onclick="markNotificationRead('${n._id}')">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong>${typeIcon} ${n.title}</strong>
                        <p style="margin:4px 0 0 0; font-size:13px; color:#4a4a6a;">${n.message}</p>
                        ${n.link ? `<a href="${n.link}" style="font-size:12px; color:#1a5fb4;">🔗 عرض التفاصيل</a>` : ''}
                    </div>
                    <span style="font-size:11px; color:#8a8aaa;">${new Date(n.createdAt).toLocaleString('ar-EG')}</span>
                </div>
            </div>
        `;
    }).join('');
}

// ===== فتح/إغلاق الإشعارات =====
function toggleNotifications() {
    const modal = document.getElementById('notificationsModal');
    if (modal.style.display === 'flex') {
        modal.style.display = 'none';
    } else {
        modal.style.display = 'flex';
        loadNotifications();
    }
}

function closeNotificationsModal() {
    document.getElementById('notificationsModal').style.display = 'none';
}

// ===== تحديد الإشعار كمقروء =====
async function markNotificationRead(id) {
    try {
        const response = await fetch(`/api/notifications/${id}/read`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });
        
        if (response.ok) {
            loadNotifications();
        }
    } catch (error) {
        console.error('❌ خطأ:', error);
    }
}

// ===== حذف جميع الإشعارات =====
async function clearAllNotifications() {
    if (!confirm('هل أنت متأكد من حذف جميع الإشعارات؟')) return;
    
    try {
        const response = await fetch('/api/notifications/clear', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });
        
        if (response.ok) {
            notifications = [];
            unreadCount = 0;
            updateNotificationBadge();
            renderNotifications();
            showToast('🗑️ تم حذف جميع الإشعارات');
        }
    } catch (error) {
        console.error('❌ خطأ:', error);
    }
}

// ===== Note Verbale =====
function showNoteVerbaleModal() {
    const modal = document.getElementById('noteVerbaleModal');
    const select = document.getElementById('nvVesselSelect');
    
    // تعبئة قائمة المراكب
    loadVessels().then(vessels => {
        select.innerHTML = '<option value="">-- اختر مركب --</option>';
        vessels.forEach(v => {
            select.innerHTML += `<option value="${v._id || v.id}">${v.name} (${v.num || 'بدون رقم'})</option>`;
        });
    }).catch(err => {
        console.error('خطأ في تحميل المراكب:', err);
    });
    
    document.getElementById('nvUnit').value = '';
    document.getElementById('nvRef').value = `م/${new Date().getFullYear()}/${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
    document.getElementById('nvNotes').value = '';
    
    modal.style.display = 'flex';
}

function closeNoteVerbaleModal() {
    document.getElementById('noteVerbaleModal').style.display = 'none';
}

async function generateNoteVerbale() {
    const vesselId = document.getElementById('nvVesselSelect').value;
    const unit = document.getElementById('nvUnit').value.trim() || 'غير محدد';
    const ref = document.getElementById('nvRef').value.trim() || 'غير محدد';
    const notes = document.getElementById('nvNotes').value.trim();
    
    if (!vesselId) {
        showToast('⚠️ يرجى اختيار مركب', true);
        return;
    }
    
    try {
        showToast('⏳ جاري إنشاء المذكرة...', false);
        
        const response = await fetch(`/api/reports/note-verbale/${vesselId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify({ unit, ref, notes })
        });
        
        if (!response.ok) {
            throw new Error(await response.text());
        }
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Note_Verbale_${Date.now()}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        closeNoteVerbaleModal();
        showToast('✅ تم إنشاء المذكرة بنجاح!');
        await logActivity('إنشاء Note Verbale', `تم إنشاء مذكرة رسمية للمركب`);
        
    } catch (error) {
        showToast('❌ خطأ: ' + error.message, true);
    }
}
