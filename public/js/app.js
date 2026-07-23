// ============================================================
// 📦 app.js - مع الإشعارات وجداول النجاعة
// ============================================================

console.log('✅ App loaded');

let allVessels = [];
let socket = null;
let notifications = [];
let unreadCount = 0;

// ============================================================
// 🔐 المصادقة
// ============================================================

function doLogin() {
    const username = document.getElementById('username')?.value.trim();
    const password = document.getElementById('password')?.value.trim();
    
    if (!username || !password) {
        alert('⚠️ الرجاء إدخال اسم المستخدم وكلمة المرور');
        return;
    }
    
    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: username, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            document.getElementById('userRoleDisplay').innerHTML = 
                `<i class="fas fa-user"></i> ${data.user.name} (${data.user.role})`;
            loadAllData();
            initSocket();
        } else {
            alert('❌ ' + (data.error || 'بيانات غير صحيحة'));
        }
    })
    .catch(err => {
        console.error('Login error:', err);
        alert('❌ خطأ في الاتصال بالخادم');
    });
}

function logout() {
    localStorage.clear();
    if (socket) socket.disconnect();
    location.reload();
}

function getToken() {
    return localStorage.getItem('token');
}

// ============================================================
// 📡 Socket.IO - الإشعارات الفورية
// ============================================================

function initSocket() {
    if (socket) return;
    
    socket = io();
    
    socket.on('connect', () => {
        console.log('✅ Socket متصل');
        // طلب الإشعارات السابقة
        socket.emit('get-notifications');
    });
    
    // استقبال إشعار جديد
    socket.on('new-notification', (data) => {
        console.log('🔔 إشعار جديد:', data);
        // إضافة الإشعار للقائمة
        notifications.unshift({
            message: data.message,
            type: data.type || 'info',
            icon: data.icon || '🔔',
            createdAt: data.time || new Date().toISOString(),
            read: false
        });
        unreadCount++;
        updateNotificationBadge();
        showToastNotification(data.message, data.type);
    });
    
    // استقبال قائمة الإشعارات السابقة
    socket.on('notifications-list', (data) => {
        notifications = data || [];
        unreadCount = notifications.filter(n => !n.read).length;
        updateNotificationBadge();
        renderNotifications();
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Socket غير متصل');
    });
}

// ============================================================
// 🔔 نظام الإشعارات
// ============================================================

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        if (unreadCount > 0) {
            badge.style.display = 'inline-block';
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        } else {
            badge.style.display = 'none';
        }
    }
}

function showToastNotification(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const colors = {
        success: '#28a745',
        danger: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };
    
    const toast = document.createElement('div');
    toast.style.cssText = `
        background: ${colors[type] || '#17a2b8'};
        color: ${type === 'warning' ? '#333' : 'white'};
        padding: 12px 20px;
        margin: 8px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        animation: slideIn 0.3s ease;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 250px;
        max-width: 400px;
    `;
    toast.innerHTML = `<span style="font-size:20px;">🔔</span> ${message}`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s';
        setTimeout(() => toast.remove(), 500);
    }, 5000);
}

function toggleNotifications() {
    const panel = document.getElementById('notificationPanel');
    if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        if (panel.style.display === 'block') {
            markAllAsRead();
        }
    }
}

function renderNotifications() {
    const container = document.getElementById('notificationList');
    if (!container) return;
    
    if (notifications.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#6c757d; padding:20px;">🚫 لا توجد إشعارات</p>';
        return;
    }
    
    container.innerHTML = notifications.slice(0, 20).map(n => `
        <div style="padding:10px 15px; border-bottom:1px solid #e9ecef; ${!n.read ? 'background:#e7f3ff; border-right:3px solid #0d6efd;' : ''}">
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="font-size:18px;">${n.icon || '🔔'}</span>
                <span style="flex:1; font-size:13px;">${n.message}</span>
                <small style="color:#6c757d; font-size:11px;">${n.createdAt ? new Date(n.createdAt).toLocaleTimeString() : ''}</small>
            </div>
        </div>
    `).join('');
}

function markAllAsRead() {
    fetch('/api/notifications/read-all', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + getToken() }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            notifications.forEach(n => n.read = true);
            unreadCount = 0;
            updateNotificationBadge();
            renderNotifications();
        }
    })
    .catch(err => console.error('Mark all read error:', err));
}

// ============================================================
// 🚢 المراكب
// ============================================================

function loadAllData() {
    loadVessels();
    loadTickets();
    loadNotes();
    loadUsers();
    loadLocations();
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
        renderMainTable();
        renderMaintTable();
        renderEfficiency();
    })
    .catch(err => console.error('Load vessels error:', err));
}

// ============================================================
// ✅ إضافة مركب
// ============================================================

function addItem() {
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    const name = document.getElementById('iName')?.value;
    if (!name) {
        alert('⚠️ الرجاء إدخال اسم المركب');
        return;
    }
    
    const data = {
        name: name,
        num: document.getElementById('iNum')?.value || '',
        len: parseFloat(document.getElementById('iLen')?.value) || 0,
        reg: document.getElementById('iReg')?.value || '',
        zone: document.getElementById('iZone')?.value || '',
        port: document.getElementById('iPort')?.value || '',
        supp: document.getElementById('iSupp')?.value || '',
        stat: document.getElementById('iStat')?.value || 'صالح',
        break: document.getElementById('iBreak')?.value || '',
        fDate: document.getElementById('iDate')?.value || '',
        eDate: document.getElementById('iEnd')?.value || '',
        ref: document.getElementById('iRef')?.value || ''
    };
    
    fetch('/api/vessels', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم إضافة المركب بنجاح');
            clearInputs();
            loadVessels();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الإضافة'));
        }
    })
    .catch(err => {
        console.error('Add error:', err);
        alert('❌ خطأ في إضافة المركب');
    });
}

function clearInputs() {
    document.getElementById('iName').value = '';
    document.getElementById('iNum').value = '';
    document.getElementById('iLen').value = '';
    document.getElementById('iReg').value = '';
    document.getElementById('iZone').value = '';
    document.getElementById('iPort').value = '';
    document.getElementById('iSupp').value = '';
    document.getElementById('iStat').value = 'صالح';
    document.getElementById('iBreak').value = '';
    document.getElementById('iDate').value = '';
    document.getElementById('iEnd').value = '';
    document.getElementById('iRef').value = '';
}

function deleteVessel(id) {
    if (!confirm('⚠️ هل أنت متأكد من الحذف؟')) return;
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    fetch('/api/vessels/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم الحذف');
            loadVessels();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الحذف'));
        }
    })
    .catch(err => {
        console.error('Delete error:', err);
        alert('❌ خطأ في الحذف');
    });
}

// ============================================================
// 📊 عرض جداول النجاعة حسب الفئات
// ============================================================

function renderEfficiency() {
    const vessels = allVessels || [];
    
    // ✅ البطاقات العلوية
    const statsContainer = document.getElementById('statsCards');
    if (statsContainer) {
        const total = vessels.length;
        const good = vessels.filter(v => v.stat === 'صالح').length;
        const bad = vessels.filter(v => v.stat === 'معطب').length;
        const maint = vessels.filter(v => v.stat === 'صيانة').length;
        const eff = total > 0 ? Math.round((good / total) * 100) : 0;
        
        statsContainer.innerHTML = `
            <div style="background:#28a745; padding:15px; border-radius:10px; text-align:center; color:white;">
                <h3 style="font-size:28px; margin:0;">${good}</h3>
                <p style="margin:0;">✅ صالح</p>
            </div>
            <div style="background:#dc3545; padding:15px; border-radius:10px; text-align:center; color:white;">
                <h3 style="font-size:28px; margin:0;">${bad}</h3>
                <p style="margin:0;">❌ معطب</p>
            </div>
            <div style="background:#ffc107; padding:15px; border-radius:10px; text-align:center; color:#333;">
                <h3 style="font-size:28px; margin:0;">${maint}</h3>
                <p style="margin:0;">🔧 صيانة</p>
            </div>
            <div style="background:#17a2b8; padding:15px; border-radius:10px; text-align:center; color:white;">
                <h3 style="font-size:28px; margin:0;">${eff}%</h3>
                <p style="margin:0;">📊 الجاهزية</p>
            </div>
        `;
    }
    
    // ✅ جدول النجاعة حسب الفئات
    const container = document.getElementById('generalEffTableContainer');
    if (!container) return;
    
    // الفئات المطلوبة
    const categories = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
    
    let html = `
        <div style="background:white; border-radius:10px; padding:20px; margin:20px 0; box-shadow:0 2px 10px rgba(0,0,0,0.1); overflow-x:auto;">
            <h4 style="color:#0d6efd; margin-bottom:15px;">📊 نجاعة الأسطول حسب الفئات</h4>
            <table style="width:100%; border-collapse:collapse; font-size:14px;">
                <thead>
                    <tr style="background:#0d6efd; color:white;">
                        <th style="padding:12px; text-align:right; border-radius:8px 0 0 0;">الفئة</th>
                        <th style="padding:12px; text-align:center;">الإجمالي</th>
                        <th style="padding:12px; text-align:center; background:#28a745;">✅ صالح</th>
                        <th style="padding:12px; text-align:center; background:#dc3545;">❌ معطب</th>
                        <th style="padding:12px; text-align:center; background:#ffc107;">🔧 صيانة</th>
                        <th style="padding:12px; text-align:center; border-radius:0 8px 0 0;">نسبة النجاعة</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    let totalAll = 0, goodAll = 0, badAll = 0, maintAll = 0;
    
    categories.forEach(cat => {
        const catVessels = vessels.filter(v => v.cat === cat);
        const total = catVessels.length;
        const good = catVessels.filter(v => v.stat === 'صالح').length;
        const bad = catVessels.filter(v => v.stat === 'معطب').length;
        const maint = catVessels.filter(v => v.stat === 'صيانة').length;
        const eff = total > 0 ? Math.round((good / total) * 100) : 0;
        
        totalAll += total;
        goodAll += good;
        badAll += bad;
        maintAll += maint;
        
        const color = eff >= 80 ? '#28a745' : eff >= 50 ? '#ffc107' : '#dc3545';
        
        html += `
            <tr style="border-bottom:1px solid #e9ecef;">
                <td style="padding:10px; text-align:right; font-weight:bold;">${cat}</td>
                <td style="padding:10px; text-align:center;">${total}</td>
                <td style="padding:10px; text-align:center; color:#28a745;">${good}</td>
                <td style="padding:10px; text-align:center; color:#dc3545;">${bad}</td>
                <td style="padding:10px; text-align:center; color:#ffc107;">${maint}</td>
                <td style="padding:10px; text-align:center; font-weight:bold; color:${color};">${eff}%</td>
            </tr>
        `;
    });
    
    const totalEff = totalAll > 0 ? Math.round((goodAll / totalAll) * 100) : 0;
    const totalColor = totalEff >= 80 ? '#28a745' : totalEff >= 50 ? '#ffc107' : '#dc3545';
    
    html += `
            <tr style="background:#e7f3ff; font-weight:bold; border-top:2px solid #0d6efd;">
                <td style="padding:12px; text-align:right;">📊 المجموع الكلي</td>
                <td style="padding:12px; text-align:center;">${totalAll}</td>
                <td style="padding:12px; text-align:center; color:#28a745;">${goodAll}</td>
                <td style="padding:12px; text-align:center; color:#dc3545;">${badAll}</td>
                <td style="padding:12px; text-align:center; color:#ffc107;">${maintAll}</td>
                <td style="padding:12px; text-align:center; color:${totalColor};">${totalEff}%</td>
            </tr>
        </tbody>
    </table>
    `;
    
    // ✅ شريط التقدم
    html += `
        <div style="margin-top:15px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:13px;">
                <span>📈 نسبة النجاعة العامة: <strong>${totalEff}%</strong></span>
                <span style="color:${totalColor};">${totalEff >= 80 ? '✅ ممتاز' : totalEff >= 50 ? '⚠️ متوسط' : '❌ منخفض'}</span>
            </div>
            <div style="background:#e9ecef; border-radius:10px; height:10px; overflow:hidden;">
                <div style="background:${totalColor}; height:100%; width:${totalEff}%; transition:width 0.5s;"></div>
            </div>
        </div>
    </div>
    `;
    
    container.innerHTML = html;
}

// ============================================================
// ✅ عرض جدول الأسطول
// ============================================================

function renderMainTable() {
    const tbody = document.getElementById('mainBody');
    if (!tbody) return;
    
    if (!allVessels || allVessels.length === 0) {
        tbody.innerHTML = `<tr><td colspan="13" style="text-align:center; padding:30px;">🚫 لا توجد بيانات</td></tr>`;
        return;
    }
    
    tbody.innerHTML = allVessels.map(v => `
        <tr>
            <td>${v.name || '-'}</td>
            <td>${v.num || '-'}</td>
            <td>${v.len || 0}</td>
            <td>${v.cat || '-'}</td>
            <td>${v.reg || '-'}</td>
            <td>${v.zone || '-'}</td>
            <td>${v.port || '-'}</td>
            <td>${v.supp || '-'}</td>
            <td><span style="color:${v.stat === 'صالح' ? '#28a745' : v.stat === 'معطب' ? '#dc3545' : '#ffc107'}">${v.stat || 'صالح'}</span></td>
            <td>${v.break || '-'}</td>
            <td>${v.fDate || '-'}</td>
            <td>${v.eDate || '-'}</td>
            <td>
                <button onclick="deleteVessel('${v._id}')" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderMaintTable() {
    const tbody = document.getElementById('maintBody');
    if (!tbody) return;
    
    const vessels = (allVessels || []).filter(v => v.stat !== 'صالح');
    
    if (vessels.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px;">🚫 لا توجد بيانات صيانة</td></tr>`;
        return;
    }
    
    tbody.innerHTML = vessels.map(v => `
        <tr>
            <td>${v.name || '-'}</td>
            <td>${v.num || '-'}</td>
            <td>${v.reg || '-'}</td>
            <td>${v.zone || '-'}</td>
            <td><span style="color:${v.stat === 'معطب' ? '#dc3545' : '#ffc107'}">${v.stat}</span></td>
            <td>${v.break || '-'}</td>
            <td>${v.fDate || '-'}</td>
            <td>${v.eDate || '-'}</td>
            <td>${v.ref || '-'}</td>
            <td>
                <button onclick="alert('تعديل: ${v.name}')" style="background:#ffc107; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// ============================================================
// 🎫 التذاكر
// ============================================================

function loadTickets() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/tickets', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        const container = document.getElementById('ticketsList');
        if (!container) return;
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:20px; color:#6c757d;">🚫 لا توجد تذاكر</p>';
            return;
        }
        
        container.innerHTML = data.map(t => `
            <div style="background:#f8f9fa; padding:15px; margin:10px 0; border-radius:8px; border-right:4px solid ${t.status === 'مغلقة' ? '#28a745' : '#ffc107'}">
                <h4>${t.subject}</h4>
                <p>${t.message}</p>
                <small>${t.date || ''} ${t.time || ''} | ${t.userName || 'مجهول'}</small>
                <span style="background:#ffc107; padding:2px 10px; border-radius:10px; font-size:12px; margin-right:10px;">${t.status || 'قيد المعالجة'}</span>
            </div>
        `).join('');
    })
    .catch(err => console.error('Load tickets error:', err));
}

function sendTicket() {
    const subject = document.getElementById('ticketSubject')?.value.trim();
    const message = document.getElementById('ticketMessage')?.value.trim();
    
    if (!subject || !message) {
        alert('⚠️ الرجاء إدخال العنوان والرسالة');
        return;
    }
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    fetch('/api/tickets', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ subject, message })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم إرسال التذكرة');
            document.getElementById('ticketSubject').value = '';
            document.getElementById('ticketMessage').value = '';
            loadTickets();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الإرسال'));
        }
    })
    .catch(err => {
        console.error('Send ticket error:', err);
        alert('❌ خطأ في إرسال التذكرة');
    });
}

function refreshTickets() {
    loadTickets();
    alert('✅ تم تحديث التذاكر');
}

// ============================================================
// 📝 المذكرات
// ============================================================

function loadNotes() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/notes', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        const container = document.getElementById('notesListContainer');
        if (!container) return;
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p style="color:#6c757d;">🚫 لا توجد مذكرات</p>';
            return;
        }
        
        container.innerHTML = data.map(n => `
            <div style="background:#f8f9fa; padding:15px; margin:10px 0; border-radius:8px; border-right:4px solid #0d6efd;">
                <h4 style="color:#0d6efd;">${n.title}</h4>
                <p>${n.content}</p>
                <small>${n.date || ''} ${n.time || ''} | ${n.createdBy || 'مجهول'}</small>
            </div>
        `).join('');
    })
    .catch(err => console.error('Load notes error:', err));
}

function saveNote() {
    const title = document.getElementById('noteTitle')?.value.trim();
    const content = document.getElementById('noteContent')?.value.trim();
    const date = document.getElementById('noteDate')?.value;
    
    if (!title || !content || !date) {
        alert('⚠️ الرجاء إدخال العنوان والمحتوى والتاريخ');
        return;
    }
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    fetch('/api/notes', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ title, content, date })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم حفظ المذكرة');
            document.getElementById('noteTitle').value = '';
            document.getElementById('noteContent').value = '';
            document.getElementById('noteDate').value = '';
            loadNotes();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الحفظ'));
        }
    })
    .catch(err => {
        console.error('Save note error:', err);
        alert('❌ خطأ في حفظ المذكرة');
    });
}

function clearNote() {
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').value = '';
    document.getElementById('noteDate').value = '';
}

function loadNotesByWeek() {
    loadNotes();
}

// ============================================================
// 👥 المستخدمين
// ============================================================

function loadUsers() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/users', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        const tbody = document.getElementById('usersBody');
        if (!tbody) return;
        
        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px;">🚫 لا توجد مستخدمين</td></tr>`;
            return;
        }
        
        tbody.innerHTML = data.map(u => `
            <tr>
                <td>${u.name}</td>
                <td>${u.role}</td>
                <td>${u.isActive ? '✅ نشط' : '❌ معطل'}</td>
                <td><button class="btn btn-sm btn-warning" onclick="alert('تغيير كلمة المرور')"><i class="fas fa-key"></i></button></td>
                <td><button class="btn btn-sm ${u.isActive ? 'btn-danger' : 'btn-success'}" onclick="alert('تغيير الحالة')"><i class="fas ${u.isActive ? 'fa-ban' : 'fa-check'}"></i></button></td>
                <td><button class="btn btn-sm btn-danger" onclick="alert('حذف المستخدم')"><i class="fas fa-trash"></i></button></td>
            </tr>
        `).join('');
    })
    .catch(err => console.error('Load users error:', err));
}

function addUser() {
    alert('⚠️ هذه الميزة قيد التطوير');
}

function refreshUsers() {
    loadUsers();
    alert('✅ تم تحديث المستخدمين');
}

// ============================================================
// 📍 المواقع
// ============================================================

function loadLocations() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/locations', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        const container = document.getElementById('locationsContainer');
        if (!container) return;
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#6c757d;">🚫 لا توجد مواقع</p>';
            return;
        }
        
        container.innerHTML = data.slice(0, 50).map(l => `
            <div style="background:#f8f9fa; padding:15px; margin:10px 0; border-radius:8px; border-right:4px solid #0d6efd;">
                <h4>📍 ${l.userName || 'مجهول'}</h4>
                <p>${l.lat?.toFixed(6) || 0}, ${l.lng?.toFixed(6) || 0}</p>
                <small>${new Date(l.timestamp).toLocaleString()}</small>
            </div>
        `).join('');
    })
    .catch(err => console.error('Load locations error:', err));
}

// ============================================================
// 🗺️ الخريطة
// ============================================================

function initMap() { console.log('🗺️ Map'); }
function initTrackMap() { console.log('🗺️ Track'); }
function startTracking() { alert('📍 بدء التتبع'); }
function stopTracking() { alert('⏹️ إيقاف التتبع'); }
function loadLocationsMap() { loadLocations(); alert('📍 تم تحديث الخريطة'); }
function centerMapOnUser() { alert('📍 تمركز'); }
function requestLocationPermission() { alert('📍 إذن الموقع'); }
function refreshTrackUsers() { alert('🔄 تحديث المستخدمين'); }
function clearTrackUsers() { alert('🗑️ مسح'); }

// ============================================================
// 🖥️ دوال الصفحات
// ============================================================

function showPage(page) {
    document.querySelectorAll('[id^="page"]').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1));
    if (target) target.classList.remove('hidden');
    
    switch(page) {
        case 'main':
        case 'maint':
        case 'eff':
            loadVessels();
            break;
        case 'support':
            loadTickets();
            break;
        case 'note':
            loadNotes();
            break;
        case 'users':
            loadUsers();
            break;
        case 'track':
        case 'map':
            loadLocations();
            break;
    }
}

function refreshAllPages() {
    loadAllData();
    alert('✅ تم تحديث جميع البيانات');
}

function clearMainSearch() {
    document.getElementById('searchMain').value = '';
    loadVessels();
}

function resetMaintFilters() {
    document.getElementById('searchMaint').value = '';
    document.getElementById('fRegMaint').value = 'الكل';
    document.getElementById('fDateStart').value = '';
    document.getElementById('fDateEnd').value = '';
    loadVessels();
}

function updateZones() {
    const reg = document.getElementById('iReg')?.value;
    const zoneSelect = document.getElementById('iZone');
    if (!zoneSelect) return;
    
    const zones = {
        'الشمال': ['بنزرت', 'طبرقة', 'المرسى'],
        'الساحل': ['سوسة', 'المنستير', 'المهدية'],
        'الوسط': ['صفاقس', 'قابس', 'جربة'],
        'الجنوب': ['جرجيس', 'بن قردان'],
        'وحدة الصيانة والإسناد البحري تونس': ['تونس', 'قرطاج'],
        'وحدة الصيانة والإسناد البحري المنستير': ['المنستير', 'المهدية'],
        'وحدة الصيانة والإسناد البحري صفاقس': ['صفاقس', 'قابس'],
        'وحدة الصيانة والإسناد البحري جرجيس': ['جرجيس', 'بن قردان'],
        'المجمع الأمني بقبيبة': ['قبيبة', 'المرسى']
    };
    
    const options = zones[reg] || [];
    zoneSelect.innerHTML = '<option value="">📍 المنطقة</option>';
    options.forEach(z => {
        zoneSelect.innerHTML += `<option value="${z}">📍 ${z}</option>`;
    });
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

// ============================================================
// 🔄 تصدير الدوال
// ============================================================

window.doLogin = doLogin;
window.logout = logout;
window.showPage = showPage;
window.addItem = addItem;
window.deleteVessel = deleteVessel;
window.updateZones = updateZones;
window.refreshAllPages = refreshAllPages;
window.clearMainSearch = clearMainSearch;
window.resetMaintFilters = resetMaintFilters;
window.scrollToTop = scrollToTop;
window.scrollToBottom = scrollToBottom;
window.sendTicket = sendTicket;
window.refreshTickets = refreshTickets;
window.saveNote = saveNote;
window.clearNote = clearNote;
window.loadNotesByWeek = loadNotesByWeek;
window.addUser = addUser;
window.refreshUsers = refreshUsers;
window.initMap = initMap;
window.initTrackMap = initTrackMap;
window.startTracking = startTracking;
window.stopTracking = stopTracking;
window.loadLocations = loadLocations;
window.loadLocationsMap = loadLocationsMap;
window.centerMapOnUser = centerMapOnUser;
window.requestLocationPermission = requestLocationPermission;
window.refreshTrackUsers = refreshTrackUsers;
window.clearTrackUsers = clearTrackUsers;
window.toggleNotifications = toggleNotifications;
window.markAllAsRead = markAllAsRead;

console.log('✅ جميع الدوال جاهزة');

// تحميل البيانات تلقائياً
document.addEventListener('DOMContentLoaded', function() {
    if (localStorage.getItem('token')) {
        loadAllData();
        initSocket();
    }
});

// إضافة ستايل للـ Toast
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    #toastContainer {
        position: fixed;
        top: 20px;
        left: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    #notificationPanel {
        position: fixed;
        top: 60px;
        left: 20px;
        width: 350px;
        max-height: 400px;
        background: white;
        border-radius: 10px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 9998;
        overflow: hidden;
        display: none;
    }
    #notificationPanel .header {
        padding: 10px 15px;
        background: #0d6efd;
        color: white;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    #notificationPanel .header button {
        background: transparent;
        border: none;
        color: white;
        cursor: pointer;
    }
    #notificationList {
        max-height: 350px;
        overflow-y: auto;
    }
    .notification-icon {
        position: relative;
        cursor: pointer;
        font-size: 20px;
    }
    .notification-badge {
        position: absolute;
        top: -8px;
        right: -8px;
        background: #dc3545;
        color: white;
        border-radius: 50%;
        padding: 2px 6px;
        font-size: 10px;
        min-width: 18px;
        text-align: center;
        display: none;
    }
`;
document.head.appendChild(style);

// إضافة عناصر الإشعارات إلى الصفحة
document.addEventListener('DOMContentLoaded', function() {
    // Toast container
    if (!document.getElementById('toastContainer')) {
        const toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        document.body.appendChild(toastContainer);
    }
    
    // Notification panel
    if (!document.getElementById('notificationPanel')) {
        const panel = document.createElement('div');
        panel.id = 'notificationPanel';
        panel.innerHTML = `
            <div class="header">
                <span>🔔 الإشعارات</span>
                <button onclick="markAllAsRead()">تحديد الكل كمقروء</button>
                <button onclick="document.getElementById('notificationPanel').style.display='none'">✕</button>
            </div>
            <div id="notificationList"></div>
        `;
        document.body.appendChild(panel);
    }
    
    // Notification icon in header
    const headerActions = document.querySelector('.header-actions');
    if (headerActions) {
        const notificationIcon = document.createElement('span');
        notificationIcon.className = 'notification-icon';
        notificationIcon.innerHTML = `
            🔔
            <span class="notification-badge" id="notificationBadge">0</span>
        `;
        notificationIcon.onclick = toggleNotifications;
        headerActions.prepend(notificationIcon);
    }
});
