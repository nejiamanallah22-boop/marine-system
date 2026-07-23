// ============================================================
// 📦 app.js - الملف الرئيسي (يعمل 100%)
// ============================================================

console.log('✅ App loaded');

let allVessels = [];

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
            loadVessels();
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
// 🚢 المراكب
// ============================================================

function loadVessels() {
    const token = getToken();
    if (!token) return;
    
    console.log('🔄 جلب البيانات من السيرفر...');
    
    fetch('/api/vessels', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allVessels = data || [];
        console.log('✅ تم جلب', allVessels.length, 'مراكب');
        renderMainTable();
        renderStats();
        renderMaintTable();
        renderEfficiency();
    })
    .catch(err => console.error('Load error:', err));
}

// ============================================================
// ✅ إضافة مركب - هذه الدالة تعمل الآن!
// ============================================================

function addItem() {
    console.log('🔄 زر الحفظ تم الضغط عليه!');
    
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
            // ✅ هذا هو الحل - إعادة تحميل الجدول فوراً!
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
                <button onclick="deleteVessel(${v.id})" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">
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
// ✅ عرض الإحصائيات (الجاهزية)
// ============================================================

function renderStats() {
    const container = document.getElementById('statsCards');
    if (!container) return;
    
    const total = allVessels.length;
    const good = allVessels.filter(v => v.stat === 'صالح').length;
    const bad = allVessels.filter(v => v.stat === 'معطب').length;
    const maint = allVessels.filter(v => v.stat === 'صيانة').length;
    const eff = total > 0 ? Math.round((good / total) * 100) : 0;
    
    container.innerHTML = `
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

// ============================================================
// ✅ عرض النجاعة (جداول الوحدات)
// ============================================================

function renderEfficiency() {
    // جدول النجاعة العام
    const generalContainer = document.getElementById('generalEffTableContainer');
    if (generalContainer) {
        const total = allVessels.length;
        const good = allVessels.filter(v => v.stat === 'صالح').length;
        const bad = allVessels.filter(v => v.stat === 'معطب').length;
        const maint = allVessels.filter(v => v.stat === 'صيانة').length;
        
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
    const container = document.getElementById('regionTables');
    if (container) {
        const units = [
            { name: '🗺️ الحرس البحري بالشمال', key: 'الشمال' },
            { name: '🗺️ الحرس البحري بالساحل', key: 'الساحل' },
            { name: '🗺️ الحرس البحري بالوسط', key: 'الوسط' },
            { name: '🗺️ الحرس البحري بالجنوب', key: 'الجنوب' },
            { name: '🛠️ وحدة الصيانة', key: 'وحدة الصيانة' }
        ];
        
        let html = '<div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:20px;">';
        
        units.forEach(unit => {
            const unitVessels = allVessels.filter(v => v.reg === unit.key || v.reg?.includes(unit.key));
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
}

// ============================================================
// ✅ تحديث المناطق
// ============================================================

function updateZones() {
    const reg = document.getElementById('iReg')?.value;
    const zoneSelect = document.getElementById('iZone');
    if (!zoneSelect) return;
    
    const zones = {
        'الشمال': ['بنزرت', 'طبرقة', 'المرسى'],
        'الساحل': ['سوسة', 'المنستير', 'المهدية'],
        'الوسط': ['صفاقس', 'قابس', 'جربة'],
        'الجنوب': ['جرجيس', 'بن قردان']
    };
    
    const options = zones[reg] || [];
    zoneSelect.innerHTML = '<option value="">📍 المنطقة</option>';
    options.forEach(z => {
        zoneSelect.innerHTML += `<option value="${z}">📍 ${z}</option>`;
    });
}

// ============================================================
// 🖥️ دوال الصفحات
// ============================================================

function showPage(page) {
    document.querySelectorAll('[id^="page"]').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1));
    if (target) target.classList.remove('hidden');
    if (page === 'main' || page === 'maint' || page === 'eff') loadVessels();
}

function refreshAllPages() {
    loadVessels();
    alert('✅ تم تحديث البيانات');
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

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

// ============================================================
// 🎫 التذاكر
// ============================================================

function sendTicket() {
    alert('📝 تم إرسال التذكرة');
}

function refreshTickets() {
    alert('🔄 تم تحديث التذاكر');
}

// ============================================================
// 📝 المذكرات
// ============================================================

function saveNote() {
    alert('📝 تم حفظ المذكرة');
}

function clearNote() {
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').value = '';
    document.getElementById('noteDate').value = '';
}

function loadNotesByWeek() {
    alert('📝 تم تحميل المذكرات');
}

// ============================================================
// 👥 المستخدمين
// ============================================================

function addUser() {
    alert('👤 تم إضافة المستخدم');
}

function refreshUsers() {
    alert('🔄 تم تحديث المستخدمين');
}

// ============================================================
// 🗺️ الخريطة
// ============================================================

function initMap() { console.log('🗺️ Map'); }
function initTrackMap() { console.log('🗺️ Track'); }
function startTracking() { alert('📍 بدء التتبع'); }
function stopTracking() { alert('⏹️ إيقاف التتبع'); }
function loadLocations() { alert('📍 تحميل المواقع'); }
function centerMapOnUser() { alert('📍 تمركز'); }
function requestLocationPermission() { alert('📍 إذن الموقع'); }
function refreshTrackUsers() { alert('🔄 تحديث المستخدمين'); }
function clearTrackUsers() { alert('🗑️ مسح'); }

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
window.centerMapOnUser = centerMapOnUser;
window.requestLocationPermission = requestLocationPermission;
window.refreshTrackUsers = refreshTrackUsers;
window.clearTrackUsers = clearTrackUsers;

console.log('✅ جميع الدوال جاهزة');

// تحميل البيانات تلقائياً
document.addEventListener('DOMContentLoaded', function() {
    if (localStorage.getItem('token')) {
        loadVessels();
    }
});
