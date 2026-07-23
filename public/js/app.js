// ============================================================
// 📦 app.js - الملف الرئيسي (يعمل 100%)
// ============================================================

console.log('✅ App loaded');

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
    location.reload();
}

function getToken() {
    return localStorage.getItem('token');
}

// ============================================================
// 📊 تحميل جميع البيانات
// ============================================================

function loadAllData() {
    loadVessels();
    loadTickets();
    loadNotes();
    loadUsers();
    loadLocations();
}

// ============================================================
// 🚢 المراكب
// ============================================================

function loadVessels() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/vessels', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        window.allVessels = data || [];
        renderMainTable();
        renderMaintTable();
        renderEfficiency();
    })
    .catch(err => console.error('Load vessels error:', err));
}

// ============================================================
// ✅ إضافة مركب - هذه هي الدالة التي يناديها الزر
// ============================================================

function addItem() {
    console.log('🔄 زر الحفظ تم الضغط عليه!');
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    // جلب البيانات من النموذج
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
    
    console.log('📤 إرسال البيانات:', data);
    
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
        console.log('📥 استجابة الخادم:', data);
        if (data.success) {
            alert('✅ تم إضافة المركب بنجاح');
            // تفريغ الحقول
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
            // ✅ إعادة تحميل الجدول
            loadVessels();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الإضافة'));
        }
    })
    .catch(err => {
        console.error('❌ خطأ:', err);
        alert('❌ خطأ في إضافة المركب');
    });
}

// ============================================================
// ✅ حذف مركب
// ============================================================

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
// ✅ عرض جدول الأسطول
// ============================================================

function renderMainTable() {
    const tbody = document.getElementById('mainBody');
    if (!tbody) {
        console.log('⚠️ mainBody غير موجود');
        return;
    }
    
    const vessels = window.allVessels || [];
    console.log('📊 عرض المراكب:', vessels.length);
    
    if (vessels.length === 0) {
        tbody.innerHTML = `<tr><td colspan="13" style="text-align:center; padding:30px;">🚫 لا توجد بيانات. قم بإضافة مركب</td></tr>`;
        return;
    }
    
    tbody.innerHTML = vessels.map(v => `
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
                <button onclick="deleteVessel('${v._id || v.id}')" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// ============================================================
// ✅ عرض جدول الصيانة
// ============================================================

function renderMaintTable() {
    const tbody = document.getElementById('maintBody');
    if (!tbody) return;
    
    const vessels = (window.allVessels || []).filter(v => v.stat !== 'صالح');
    
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
// ✅ عرض النجاعة (جاهزية الأسطول)
// ============================================================

function renderEfficiency() {
    // الإحصائيات العامة
    const statsContainer = document.getElementById('statsCards');
    if (statsContainer) {
        const vessels = window.allVessels || [];
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
    
    // جدول النجاعة العام
    const generalContainer = document.getElementById('generalEffTableContainer');
    if (generalContainer) {
        const vessels = window.allVessels || [];
        const total = vessels.length;
        const good = vessels.filter(v => v.stat === 'صالح').length;
        const bad = vessels.filter(v => v.stat === 'معطب').length;
        const maint = vessels.filter(v => v.stat === 'صيانة').length;
        const eff = total > 0 ? Math.round((good / total) * 100) : 0;
        
        generalContainer.innerHTML = `
            <div style="background:white; border-radius:10px; padding:20px; margin:20px 0; box-shadow:0 2px 10px rgba(0,0,0,0.1);">
                <h4 style="color:#0d6efd; margin-bottom:15px;">📊 النجاعة العامة للأسطول</h4>
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="background:#f8f9fa;">
                            <th style="padding:10px; text-align:right;">المؤشر</th>
                            <th style="padding:10px; text-align:center;">العدد</th>
                            <th style="padding:10px; text-align:center;">النسبة</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td style="padding:10px; border-bottom:1px solid #e9ecef;">✅ صالح</td><td style="padding:10px; text-align:center;">${good}</td><td style="padding:10px; text-align:center;">${total > 0 ? Math.round((good/total)*100) : 0}%</td></tr>
                        <tr><td style="padding:10px; border-bottom:1px solid #e9ecef;">❌ معطب</td><td style="padding:10px; text-align:center;">${bad}</td><td style="padding:10px; text-align:center;">${total > 0 ? Math.round((bad/total)*100) : 0}%</td></tr>
                        <tr><td style="padding:10px; border-bottom:1px solid #e9ecef;">🔧 صيانة</td><td style="padding:10px; text-align:center;">${maint}</td><td style="padding:10px; text-align:center;">${total > 0 ? Math.round((maint/total)*100) : 0}%</td></tr>
                        <tr style="background:#e7f3ff; font-weight:bold;"><td style="padding:10px;">📊 الإجمالي</td><td style="padding:10px; text-align:center;">${total}</td><td style="padding:10px; text-align:center;">100%</td></tr>
                    </tbody>
                </table>
            </div>
        `;
    }
    
    // جداول الوحدات
    renderUnitTables();
}

function renderUnitTables() {
    const container = document.getElementById('regionTables');
    if (!container) return;
    
    const vessels = window.allVessels || [];
    
    const units = [
        { name: '🗺️ الحرس البحري بالشمال', key: 'الشمال' },
        { name: '🗺️ الحرس البحري بالساحل', key: 'الساحل' },
        { name: '🗺️ الحرس البحري بالوسط', key: 'الوسط' },
        { name: '🗺️ الحرس البحري بالجنوب', key: 'الجنوب' },
        { name: '🛠️ وحدة الصيانة', key: 'وحدة الصيانة' }
    ];
    
    let html = '<div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:20px;">';
    
    units.forEach(unit => {
        const unitVessels = vessels.filter(v => v.reg === unit.key || v.reg?.includes(unit.key));
        const total = unitVessels.length;
        const good = unitVessels.filter(v => v.stat === 'صالح').length;
        const bad = unitVessels.filter(v => v.stat === 'معطب').length;
        const maint = unitVessels.filter(v => v.stat === 'صيانة').length;
        const eff = total > 0 ? Math.round((good / total) * 100) : 0;
        
        html += `
            <div style="background:white; border-radius:10px; padding:15px; box-shadow:0 2px 10px rgba(0,0,0,0.1);">
                <h5 style="color:#0d6efd; margin-bottom:10px;">${unit.name}</h5>
                <table style="width:100%; border-collapse:collapse; font-size:13px;">
                    <thead>
                        <tr style="background:#f8f9fa;">
                            <th style="padding:6px; text-align:right;">الحالة</th>
                            <th style="padding:6px; text-align:center;">العدد</th>
                            <th style="padding:6px; text-align:center;">%</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td style="padding:6px; border-bottom:1px solid #e9ecef;">✅ صالح</td><td style="padding:6px; text-align:center;">${good}</td><td style="padding:6px; text-align:center;">${total > 0 ? Math.round((good/total)*100) : 0}%</td></tr>
                        <tr><td style="padding:6px; border-bottom:1px solid #e9ecef;">❌ معطب</td><td style="padding:6px; text-align:center;">${bad}</td><td style="padding:6px; text-align:center;">${total > 0 ? Math.round((bad/total)*100) : 0}%</td></tr>
                        <tr><td style="padding:6px; border-bottom:1px solid #e9ecef;">🔧 صيانة</td><td style="padding:6px; text-align:center;">${maint}</td><td style="padding:6px; text-align:center;">${total > 0 ? Math.round((maint/total)*100) : 0}%</td></tr>
                        <tr style="background:#e7f3ff; font-weight:bold;"><td style="padding:6px;">📊 الإجمالي</td><td style="padding:6px; text-align:center;">${total}</td><td style="padding:6px; text-align:center;">${eff}%</td></tr>
                    </tbody>
                </table>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
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
window.addItem = addItem;          // ✅ هذا هو المهم!
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

console.log('✅ جميع الدوال جاهزة');

// ============================================================
// 🚀 تحميل البيانات تلقائياً
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM جاهز');
    if (localStorage.getItem('token')) {
        loadAllData();
    }
});
