// public/js/app.js
console.log('✅ Marine System loaded');

let allVessels = [];
let allUsers = [];
let allTickets = [];
let allNotes = [];
let allMaintenance = [];
let currentUser = null;
let editingVesselId = null;
let editingMaintenanceId = null;

// ============================================================
// دوال مساعدة
// ============================================================

function showAlert(message, type = 'info') {
    const colors = {
        success: '#28a745',
        danger: '#dc3545',
        warning: '#ffc107',
        info: '#0d6efd'
    };
    const alertDiv = document.createElement('div');
    alertDiv.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 99999;
        padding: 15px 25px; border-radius: 8px; color: white;
        background: ${colors[type] || colors.info};
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        font-family: 'Cairo', sans-serif;
        max-width: 400px;
        animation: slideIn 0.3s ease;
    `;
    alertDiv.textContent = message;
    document.body.appendChild(alertDiv);
    setTimeout(() => {
        alertDiv.style.opacity = '0';
        alertDiv.style.transition = 'opacity 0.3s';
        setTimeout(() => alertDiv.remove(), 300);
    }, 4000);
}

function getToken() {
    return localStorage.getItem('token');
}

function getUser() {
    try {
        return JSON.parse(localStorage.getItem('user'));
    } catch {
        return null;
    }
}

// ============================================================
// المصادقة - تسجيل الدخول
// ============================================================

function doLogin() {
    const username = document.getElementById('username')?.value.trim();
    const password = document.getElementById('password')?.value.trim();
    
    if (!username || !password) {
        showAlert('⚠️ الرجاء إدخال اسم المستخدم وكلمة المرور', 'warning');
        return;
    }
    
    const loginBtn = document.querySelector('#loginOverlay .login-btn');
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.textContent = '⏳ جاري الدخول...';
    }
    
    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: username, password })
    })
    .then(res => {
        if (!res.ok) throw new Error('فشل الاتصال');
        return res.json();
    })
    .then(data => {
        if (data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            
            currentUser = data.user;
            updateUserDisplay();
            loadAllData();
            
            showAlert('✅ تم تسجيل الدخول بنجاح', 'success');
        } else {
            showAlert('❌ ' + (data.error || 'بيانات غير صحيحة'), 'danger');
        }
    })
    .catch(err => {
        console.error('Login error:', err);
        showAlert('❌ خطأ في الاتصال بالخادم', 'danger');
    })
    .finally(() => {
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = '🚀 دخول';
        }
    });
}

function doLogout() {
    if (confirm('⚠️ هل أنت متأكد من تسجيل الخروج؟')) {
        localStorage.clear();
        location.reload();
    }
}

function updateUserDisplay() {
    const display = document.getElementById('userRoleDisplay');
    if (display && currentUser) {
        const roleEmojis = {
            'مسؤول': '👑',
            'مشرف': '⭐',
            'محرر': '✏️',
            'مشاهد': '👀'
        };
        display.innerHTML = `
            <i class="fas fa-user-circle"></i> 
            ${currentUser.name} 
            <span style="font-size:12px; background:#e9ecef; padding:2px 10px; border-radius:10px;">
                ${roleEmojis[currentUser.role] || '👤'} ${currentUser.role}
            </span>
        `;
    }
}

// ============================================================
// تحميل البيانات
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
        renderMainTable();
        renderGeneralMaintenance();
        renderHistoryMaintenance();
        if (typeof renderEfficiency === 'function') renderEfficiency();
        updateMaintenanceVessels();
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
        renderGeneralMaintenance();
        renderHistoryMaintenance();
        updateMaintenanceStats();
        renderMaintenanceUnits();
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
        renderTickets();
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
        renderUsersTable();
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
        renderNotes();
    })
    .catch(err => console.error('Load notes error:', err));
}

// ============================================================
// عرض الجداول الأساسية
// ============================================================

function renderMainTable() {
    const tbody = document.getElementById('mainBody');
    if (!tbody) return;
    
    if (!allVessels || allVessels.length === 0) {
        tbody.innerHTML = `<tr><td colspan="15" style="text-align:center; padding:30px;">🚫 لا توجد بيانات</td></tr>`;
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
            <td style="color:${v.stat === 'صالح' ? '#28a745' : v.stat === 'معطب' ? '#dc3545' : '#ffc107'}">${v.stat || 'صالح'}</td>
            <td>${v.break || '-'}</td>
            <td>${v.fDate || '-'}</td>
            <td>${v.eDate || '-'}</td>
            <td>${v.ref || '-'}</td>
            <td>${v.repairer || '-'}</td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="editVessel(${v.id})">✏️</button>
                <button class="btn btn-sm btn-danger" onclick="deleteVessel(${v.id})">🗑️</button>
            </td>
        </tr>
    `).join('');
}

function renderTickets() {
    const container = document.getElementById('ticketsList');
    if (!container) return;
    
    if (!allTickets || allTickets.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#6c757d;">🚫 لا توجد تذاكر</p>';
        return;
    }
    
    container.innerHTML = allTickets.map(t => `
        <div style="background:#f8f9fa; padding:15px; margin:10px 0; border-radius:8px; border-right:4px solid ${t.status === 'مغلقة' ? '#28a745' : '#ffc107'}">
            <h4>${t.subject}</h4>
            <p>${t.message}</p>
            <small>${t.date || ''} ${t.time || ''} | ${t.userName || 'مجهول'}</small>
            <span style="background:#ffc107; padding:2px 10px; border-radius:10px; font-size:12px; margin-right:10px;">${t.status || 'قيد المعالجة'}</span>
        </div>
    `).join('');
}

function renderUsersTable() {
    const tbody = document.getElementById('usersBody');
    if (!tbody) return;
    
    if (!allUsers || allUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px;">🚫 لا توجد مستخدمين</td></tr>`;
        return;
    }
    
    tbody.innerHTML = allUsers.map(u => `
        <tr>
            <td>${u.name || '-'}</td>
            <td>${u.role || 'مشاهد'}</td>
            <td>${u.isActive ? '✅ نشط' : '❌ معطل'}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})">🗑️</button>
            </td>
        </tr>
    `).join('');
}

function renderNotes() {
    const container = document.getElementById('notesListContainer');
    if (!container) return;
    
    if (!allNotes || allNotes.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#6c757d;">🚫 لا توجد مذكرات</p>';
        return;
    }
    
    container.innerHTML = allNotes.map(n => `
        <div style="background:#f8f9fa; padding:15px; margin:10px 0; border-radius:8px; border-right:4px solid #0d6efd;">
            <h4>${n.title}</h4>
            <p>${n.content}</p>
            <small>${n.date || ''} | ${n.createdBy || 'مجهول'}</small>
        </div>
    `).join('');
}

// ============================================================
// دوال الصفحات
// ============================================================

function showPage(page) {
    document.querySelectorAll('[id^="page"]').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1));
    if (target) target.classList.remove('hidden');
    
    switch(page) {
        case 'main':
            loadVessels();
            break;
        case 'maintenance':
            loadMaintenance();
            break;
        case 'eff':
            loadVessels();
            break;
        case 'support':
            loadTickets();
            break;
        case 'track':
            setTimeout(initMap, 100);
            break;
        case 'map':
            setTimeout(initMap, 100);
            break;
        case 'users':
            loadUsers();
            break;
        case 'note':
            loadNotes();
            break;
    }
}

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
// دوال المراكب
// ============================================================

function addItem() {
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    const name = document.getElementById('iName')?.value;
    if (!name) {
        showAlert('⚠️ الرجاء إدخال اسم المركب', 'warning');
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
        ref: document.getElementById('iRef')?.value || '',
        repairer: document.getElementById('iRepairer')?.value || ''
    };
    
    const url = editingVesselId ? '/api/vessels/' + editingVesselId : '/api/vessels';
    const method = editingVesselId ? 'PUT' : 'POST';
    
    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert(editingVesselId ? '✅ تم تحديث المركب' : '✅ تم إضافة المركب', 'success');
            editingVesselId = null;
            clearVesselInputs();
            loadVessels();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في العملية'), 'danger');
        }
    })
    .catch(err => {
        console.error('Error:', err);
        showAlert('❌ خطأ في العملية', 'danger');
    });
}

function editVessel(id) {
    const vessel = allVessels.find(v => v.id === id);
    if (!vessel) {
        showAlert('⚠️ المركب غير موجود', 'warning');
        return;
    }
    
    editingVesselId = vessel.id;
    document.getElementById('iName').value = vessel.name || '';
    document.getElementById('iNum').value = vessel.num || '';
    document.getElementById('iLen').value = vessel.len || 0;
    document.getElementById('iReg').value = vessel.reg || '';
    document.getElementById('iZone').value = vessel.zone || '';
    document.getElementById('iPort').value = vessel.port || '';
    document.getElementById('iSupp').value = vessel.supp || '';
    document.getElementById('iStat').value = vessel.stat || 'صالح';
    document.getElementById('iBreak').value = vessel.break || '';
    document.getElementById('iDate').value = vessel.fDate || '';
    document.getElementById('iEnd').value = vessel.eDate || '';
    document.getElementById('iRef').value = vessel.ref || '';
    document.getElementById('iRepairer').value = vessel.repairer || '';
}

function deleteVessel(id) {
    if (!confirm('⚠️ هل أنت متأكد من الحذف؟')) return;
    
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    fetch('/api/vessels/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert('✅ تم الحذف', 'success');
            loadVessels();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في الحذف'), 'danger');
        }
    })
    .catch(err => {
        console.error('Delete error:', err);
        showAlert('❌ خطأ في الحذف', 'danger');
    });
}

function clearVesselInputs() {
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
    document.getElementById('iRepairer').value = '';
}

function updateZones() {
    const reg = document.getElementById('iReg')?.value;
    const zoneSelect = document.getElementById('iZone');
    if (!zoneSelect) return;
    
    const zones = {
        'الشمال': ['بنزرت', 'طبرقة', 'المرسى', 'غار الملح'],
        'الساحل': ['سوسة', 'المنستير', 'المهدية', 'حمام سوسة'],
        'الوسط': ['صفاقس', 'قابس', 'جربة', 'القطار'],
        'الجنوب': ['جرجيس', 'بن قردان', 'ذراع الساحل']
    };
    
    const options = zones[reg] || ['المنطقة غير محددة'];
    zoneSelect.innerHTML = '<option value="">📍 المنطقة</option>';
    options.forEach(z => {
        zoneSelect.innerHTML += `<option value="${z}">📍 ${z}</option>`;
    });
}

// ============================================================
// دوال الصيانة
// ============================================================

function updateMaintenanceVessels() {
    const select = document.getElementById('mVesselId');
    if (!select) return;
    
    const currentValue = select.value;
    select.innerHTML = '<option value="">اختر المركب</option>';
    allVessels.forEach(v => {
        const option = document.createElement('option');
        option.value = v.id;
        option.textContent = `${v.name} (${v.num || 'بدون رقم'})`;
        if (v.id == currentValue) option.selected = true;
        select.appendChild(option);
    });
}

function toggleMaintenanceForm() {
    const form = document.getElementById('maintenanceForm');
    if (!form) return;
    form.classList.toggle('active');
}

function addPart() {
    const container = document.getElementById('partsContainer');
    const div = document.createElement('div');
    div.className = 'part-item';
    div.innerHTML = `
        <input type="text" placeholder="اسم القطعة" class="part-name">
        <input type="number" placeholder="الكمية" class="part-qty" style="width:80px;">
        <input type="number" placeholder="السعر" class="part-price" style="width:80px;">
        <button class="remove-part" onclick="removePart(this)">✕</button>
    `;
    container.appendChild(div);
}

function removePart(btn) {
    const container = document.getElementById('partsContainer');
    if (container.children.length > 1) {
        btn.parentElement.remove();
    } else {
        showAlert('⚠️ يجب أن يكون هناك قطعة واحدة على الأقل', 'warning');
    }
}

function getPartsData() {
    const parts = [];
    document.querySelectorAll('.part-item').forEach(item => {
        const name = item.querySelector('.part-name')?.value;
        const qty = parseFloat(item.querySelector('.part-qty')?.value) || 0;
        const price = parseFloat(item.querySelector('.part-price')?.value) || 0;
        if (name) {
            parts.push({ name, quantity: qty, price });
        }
    });
    return parts;
}

function saveMaintenance() {
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    const vesselId = document.getElementById('mVesselId')?.value;
    const type = document.getElementById('mType')?.value;
    const unit = document.getElementById('mUnit')?.value;
    const technician = document.getElementById('mTechnician')?.value.trim();
    const description = document.getElementById('mDescription')?.value.trim();
    const cost = parseFloat(document.getElementById('mCost')?.value) || 0;
    const notes = document.getElementById('mNotes')?.value.trim();
    const parts = getPartsData();
    
    if (!vesselId) {
        showAlert('⚠️ الرجاء اختيار المركب', 'warning');
        return;
    }
    if (!description) {
        showAlert('⚠️ الرجاء إدخال وصف العطل', 'warning');
        return;
    }
    if (!technician) {
        showAlert('⚠️ الرجاء إدخال اسم الفني المسؤول', 'warning');
        return;
    }
    
    const data = {
        vesselId: parseFloat(vesselId),
        type: type || 'عادية',
        unit: unit || 'غير محدد',
        technician: technician,
        description: description,
        cost: cost,
        notes: notes || '',
        parts: parts,
        createdBy: currentUser?.name || 'Admin'
    };
    
    const url = editingMaintenanceId ? '/api/maintenance/' + editingMaintenanceId : '/api/maintenance';
    const method = editingMaintenanceId ? 'PUT' : 'POST';
    
    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert(editingMaintenanceId ? '✅ تم تحديث سجل الصيانة' : '✅ تم إضافة سجل الصيانة', 'success');
            editingMaintenanceId = null;
            toggleMaintenanceForm();
            loadAllData();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في العملية'), 'danger');
        }
    })
    .catch(err => {
        console.error('Save maintenance error:', err);
        showAlert('❌ خطأ في حفظ سجل الصيانة', 'danger');
    });
}

function renderGeneralMaintenance() {
    const container = document.getElementById('generalMaintenanceContainer');
    if (!container) return;
    
    const vessels = allVessels.filter(v => v.stat === 'معطب' || v.stat === 'صيانة');
    
    if (vessels.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:20px; background:#f8f9fa; border-radius:8px; color:#28a745;">
                ✅ لا توجد مراكب معطبة حالياً
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="scrollable-table">
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>المركب</th>
                        <th>الرقم</th>
                        <th>الفئة</th>
                        <th>الوحدة</th>
                        <th>العطل</th>
                        <th>📅 تاريخ العطب</th>
                        <th>الحالة</th>
                        <th>إجراءات</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    vessels.forEach((v, index) => {
        const maintenanceRecord = allMaintenance.find(r => r.vesselId === v.id && r.status === 'قيد الإنجاز');
        
        html += `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${v.name || '-'}</strong></td>
                <td>${v.num || '-'}</td>
                <td>${v.cat || '-'}</td>
                <td>${v.repairer || v.supp || '-'}</td>
                <td>${v.break || maintenanceRecord?.description || '-'}</td>
                <td>${v.fDate || '-'}</td>
                <td style="color:${v.stat === 'معطب' ? '#dc3545' : '#ffc107'}; font-weight:600;">
                    ${v.stat === 'معطب' ? '❌ معطب' : '🔧 صيانة'}
                </td>
                <td>
                    <button class="btn btn-sm btn-success" onclick="fixVessel(${v.id})" title="إصلاح المركب">
                        <i class="fas fa-check"></i> إصلاح
                    </button>
                    <button class="btn btn-sm btn-info" onclick="viewVesselMaintenance(${v.id})" title="سجل الصيانة">
                        <i class="fas fa-clipboard-list"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = html;
}

function fixVessel(vesselId) {
    if (!confirm('⚠️ هل أنت متأكد من إصلاح هذا المركب؟')) return;
    
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    fetch('/api/vessels/' + vesselId, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ stat: 'صالح' })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert('✅ تم إصلاح المركب', 'success');
            loadAllData();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في الإصلاح'), 'danger');
        }
    })
    .catch(err => {
        console.error('Fix vessel error:', err);
        showAlert('❌ خطأ في إصلاح المركب', 'danger');
    });
}

function renderHistoryMaintenance() {
    const container = document.getElementById('historyMaintenanceContainer');
    if (!container) return;
    
    let records = allMaintenance.filter(r => r.status === 'مكتملة' || r.status === 'ملغية');
    
    const vesselFilter = document.getElementById('filterVessel')?.value?.toLowerCase() || '';
    const dateFrom = document.getElementById('filterDateFrom')?.value || '';
    const dateTo = document.getElementById('filterDateTo')?.value || '';
    const statusFilter = document.getElementById('filterStatus')?.value || '';
    
    if (vesselFilter) {
        records = records.filter(r => {
            const name = r.vesselName || allVessels.find(v => v.id === r.vesselId)?.name || '';
            const num = r.vesselNum || allVessels.find(v => v.id === r.vesselId)?.num || '';
            return name.toLowerCase().includes(vesselFilter) || num.toString().includes(vesselFilter);
        });
    }
    
    if (dateFrom) records = records.filter(r => r.date >= dateFrom);
    if (dateTo) records = records.filter(r => r.date <= dateTo + 'T23:59:59');
    if (statusFilter) records = records.filter(r => r.status === statusFilter);
    
    document.getElementById('historyCount').textContent = `📊 ${records.length} سجل`;
    
    if (records.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px; color:#6c757d; background:#f8f9fa; border-radius:8px;">
                🚫 لا توجد سجلات صيانة مكتملة
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="scrollable-table">
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>المركب</th>
                        <th>الرقم</th>
                        <th>👨‍🔧 الفني</th>
                        <th>🔩 القطع</th>
                        <th>💰 التكلفة</th>
                        <th>📊 الحالة</th>
                        <th>📅 التاريخ</th>
                        <th>إجراءات</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    records.slice().reverse().forEach((r, index) => {
        const vesselName = r.vesselName || allVessels.find(v => v.id === r.vesselId)?.name || '-';
        const vesselNum = r.vesselNum || allVessels.find(v => v.id === r.vesselId)?.num || '-';
        const partsText = r.parts?.length ? r.parts.map(p => `${p.name}(${p.quantity})`).join(', ') : '-';
        
        html += `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${vesselName}</strong></td>
                <td>${vesselNum}</td>
                <td>${r.technician || '-'}</td>
                <td style="font-size:11px;">${partsText}</td>
                <td>${r.cost ? r.cost + ' د.ت' : '-'}</td>
                <td style="color:${r.status === 'مكتملة' ? '#28a745' : '#dc3545'}; font-weight:600;">${r.status || '-'}</td>
                <td>${new Date(r.date).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="viewMaintenanceDetails(${r.id})" title="تفاصيل">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteMaintenance(${r.id})" title="حذف">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = html;
}

function viewMaintenanceDetails(id) {
    const record = allMaintenance.find(r => r.id === id);
    if (!record) {
        showAlert('⚠️ السجل غير موجود', 'warning');
        return;
    }
    
    const vesselName = record.vesselName || allVessels.find(v => v.id === record.vesselId)?.name || 'غير محدد';
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.7); display: flex; justify-content: center;
        align-items: center; z-index: 99999;
    `;
    
    let html = `
        <div style="background:white; padding:25px; border-radius:12px; 
                    max-width:500px; width:95%; max-height:80vh; overflow-y:auto; direction:rtl;">
            <h3 style="color:#0d6efd; margin-bottom:15px;">
                📋 تفاصيل الصيانة
                <button onclick="this.closest('div[style]').parentElement.remove()" 
                        style="float:left; background:#dc3545; color:white; border:none; 
                               padding:5px 15px; border-radius:5px; cursor:pointer;">✕</button>
            </h3>
            <div style="margin:10px 0;"><strong>🚢 المركب:</strong> ${vesselName}</div>
            <div style="margin:10px 0;"><strong>👨‍🔧 الفني:</strong> ${record.technician || 'غير محدد'}</div>
            <div style="margin:10px 0;"><strong>🔧 نوع الصيانة:</strong> ${record.type || 'عادية'}</div>
            <div style="margin:10px 0;"><strong>🏭 الوحدة:</strong> ${record.unit || 'غير محدد'}</div>
            <div style="margin:10px 0;"><strong>📝 وصف العطل:</strong> ${record.description || '-'}</div>
            <div style="margin:10px 0;">
                <strong>🔩 قطع الغيار:</strong>
                ${record.parts && record.parts.length ? 
                    record.parts.map(p => `• ${p.name} (${p.quantity}) - ${p.price} د.ت`).join('<br>') : 
                    'لا توجد قطع غيار'}
            </div>
            <div style="margin:10px 0;"><strong>💰 التكلفة الإجمالية:</strong> ${record.cost || 0} د.ت</div>
            <div style="margin:10px 0;">
                <strong>📊 الحالة:</strong> 
                <span style="color:${record.status === 'مكتملة' ? '#28a745' : '#dc3545'}; font-weight:600;">
                    ${record.status || '-'}
                </span>
            </div>
            <div style="margin:10px 0;"><strong>📅 التاريخ:</strong> ${new Date(record.date).toLocaleString()}</div>
            ${record.notes ? `<div style="margin:10px 0;"><strong>📝 ملاحظات:</strong> ${record.notes}</div>` : ''}
        </div>
    `;
    
    modal.innerHTML = html;
    document.body.appendChild(modal);
}

function deleteMaintenance(id) {
    if (!confirm('⚠️ هل أنت متأكد من حذف سجل الصيانة هذا؟')) return;
    
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    fetch('/api/maintenance/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert('✅ تم حذف سجل الصيانة', 'success');
            loadAllData();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في الحذف'), 'danger');
        }
    })
    .catch(err => {
        console.error('Delete maintenance error:', err);
        showAlert('❌ خطأ في حذف سجل الصيانة', 'danger');
    });
}

function applyHistoryFilters() {
    renderHistoryMaintenance();
}

function resetHistoryFilters() {
    document.getElementById('filterVessel').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    document.getElementById('filterStatus').value = '';
    renderHistoryMaintenance();
    showAlert('✅ تم إلغاء الفلترة', 'success');
}

function updateMaintenanceStats() {
    const container = document.getElementById('maintenanceStats');
    if (!container) return;
    
    const total = allMaintenance.length;
    const inProgress = allMaintenance.filter(r => r.status === 'قيد الإنجاز').length;
    const completed = allMaintenance.filter(r => r.status === 'مكتملة').length;
    const cancelled = allMaintenance.filter(r => r.status === 'ملغية').length;
    
    container.innerHTML = `
        <div class="maintenance-stats">
            <div class="stat-box stat-total"><h4>${total}</h4><p>📊 المجموع</p></div>
            <div class="stat-box stat-progress"><h4>${inProgress}</h4><p>🔄 قيد الإنجاز</p></div>
            <div class="stat-box stat-completed"><h4>${completed}</h4><p>✅ مكتملة</p></div>
            <div class="stat-box stat-cancelled"><h4>${cancelled}</h4><p>❌ ملغية</p></div>
        </div>
    `;
}

function renderMaintenanceUnits() {
    const container = document.getElementById('maintenanceUnitsContainer');
    if (!container) return;
    
    const units = [
        'وحدة الصيانة والإسناد البحري تونس',
        'وحدة الصيانة والإسناد البحري صفاقس',
        'وحدة الصيانة والإسناد البحري المنستير',
        'وحدة الصيانة والإسناد البحري جرجيس',
        'شركة خاصة'
    ];
    
    let html = '';
    
    units.forEach(unit => {
        const records = allMaintenance.filter(r => r.unit === unit);
        const total = records.length;
        const completed = records.filter(r => r.status === 'مكتملة').length;
        const inProgress = records.filter(r => r.status === 'قيد الإنجاز').length;
        const cancelled = records.filter(r => r.status === 'ملغية').length;
        
        html += `
            <div class="region-table-card">
                <div class="region-table-header">
                    🏭 ${unit}
                    <span style="font-size:12px; font-weight:400; color:#6c757d; margin-right:10px;">
                        📊 ${total} سجل
                    </span>
                    <span style="font-size:11px; font-weight:400; margin-right:5px;">
                        ✅ ${completed} | 🔄 ${inProgress} | ❌ ${cancelled}
                    </span>
                </div>
                <div class="scrollable-table">
                    <table>
                        <thead>
                            <tr>
                                <th>المركب</th>
                                <th>👨‍🔧 الفني</th>
                                <th>🔩 القطع</th>
                                <th>💰 التكلفة</th>
                                <th>📊 الحالة</th>
                                <th>📅 التاريخ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${records.length === 0 ? `
                                <tr><td colspan="6" style="text-align:center; padding:15px; color:#6c757d;">🚫 لا توجد سجلات</td></tr>
                            ` : records.slice().reverse().map(r => {
                                const statusColors = {
                                    'قيد الإنجاز': '#ffc107',
                                    'مكتملة': '#28a745',
                                    'ملغية': '#dc3545'
                                };
                                const partsText = r.parts && r.parts.length ? 
                                    r.parts.map(p => `${p.name}(${p.quantity})`).join(', ') : '-';
                                return `
                                    <tr>
                                        <td>${r.vesselName || '-'}</td>
                                        <td>${r.technician || '-'}</td>
                                        <td style="font-size:11px;">${partsText}</td>
                                        <td>${r.cost ? r.cost + ' د.ت' : '-'}</td>
                                        <td><span style="color:${statusColors[r.status] || '#6c757d'}; font-weight:600;">${r.status || '-'}</span></td>
                                        <td>${new Date(r.date).toLocaleDateString()}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ============================================================
// 📊 صفحة الجاهزية
// ============================================================

function renderEfficiency() {
    console.log('📊 Rendering efficiency, vessels:', allVessels.length);
    const vessels = allVessels || [];
    
    const countEl = document.getElementById('effCount');
    if (countEl) countEl.textContent = `📊 ${vessels.length} مركب`;
    
    updateEfficiencyStats(vessels);
    renderGeneralEfficiencyTable(vessels);
    renderCategoryEfficiencyTable(vessels);
    renderAllRegionsTables(vessels);
    
    // ✅ إضافة الرسوم البيانية بعد تحميل البيانات
    setTimeout(() => {
        renderCharts(vessels);
    }, 100);
}

function updateEfficiencyStats(vessels) {
    const statsContainer = document.getElementById('statsCards');
    if (!statsContainer) return;
    
    const total = vessels.length;
    const good = vessels.filter(v => v.stat === 'صالح').length;
    const bad = vessels.filter(v => v.stat === 'معطب').length;
    const maint = vessels.filter(v => v.stat === 'صيانة').length;
    const eff = total > 0 ? Math.round((good / total) * 100) : 0;
    
    statsContainer.innerHTML = `
        <div class="stat-card" style="background:#28a745;"><h3>${good}</h3><p>✅ صالح</p></div>
        <div class="stat-card" style="background:#dc3545;"><h3>${bad}</h3><p>❌ معطب</p></div>
        <div class="stat-card" style="background:#ffc107; color:#1a3a5c;"><h3>${maint}</h3><p>🔧 صيانة</p></div>
        <div class="stat-card" style="background:#17a2b8;"><h3>${eff}%</h3><p>📊 الجاهزية</p></div>
    `;
}

// ============================================================
// 1. الجدول العام (بنفس شكل جدول الفئات)
// ============================================================

function renderGeneralEfficiencyTable(vessels) {
    const container = document.getElementById('generalEffTableContainer');
    if (!container) return;
    
    const categories = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
    
    let totalAll = 0, goodAll = 0, badAll = 0, maintAll = 0;
    
    let html = `
        <div class="efficiency-table-wrapper">
            <div class="table-title">
                <i class="fas fa-ship"></i> 
                الجدول العام للمراكب
            </div>
            <div class="scrollable-table">
                <table>
                    <thead>
                        <tr>
                            <th style="text-align:right; background:#0d6efd; color:white; min-width:120px;">الفئة</th>
                            <th style="text-align:center; background:#28a745; color:white; min-width:100px;">✅ الصالحة</th>
                            <th style="text-align:center; background:#dc3545; color:white; min-width:100px;">❌ المعطبة</th>
                            <th style="text-align:center; background:#ffc107; color:#1a3a5c; min-width:100px;">🔧 الصيانة</th>
                            <th style="text-align:center; background:#0d6efd; color:white; min-width:80px;">📊 الإجمالي</th>
                            <th style="text-align:center; background:#17a2b8; color:white; min-width:100px;">📈 النسبة</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    categories.forEach(cat => {
        const catVessels = vessels.filter(v => v.cat === cat);
        const total = catVessels.length;
        const good = catVessels.filter(v => v.stat === 'صالح').length;
        const bad = catVessels.filter(v => v.stat === 'معطب').length;
        const maint = catVessels.filter(v => v.stat === 'صيانة').length;
        const eff = total > 0 ? Math.round((good / total) * 100) : 0;
        
        totalAll += total; goodAll += good; badAll += bad; maintAll += maint;
        const color = eff >= 80 ? '#28a745' : eff >= 50 ? '#ffc107' : '#dc3545';
        
        html += `
            <tr style="border-bottom:1px solid #e9ecef;">
                <td style="padding:8px; text-align:right; font-weight:bold;">${cat}</td>
                <td style="padding:8px; text-align:center; font-weight:bold; color:#28a745;">${good}</td>
                <td style="padding:8px; text-align:center; font-weight:bold; color:#dc3545;">${bad}</td>
                <td style="padding:8px; text-align:center; font-weight:bold; color:#ffc107;">${maint}</td>
                <td style="padding:8px; text-align:center; font-weight:bold;">${total}</td>
                <td style="padding:8px; text-align:center; font-weight:bold; color:${color};">
                    ${eff}%
                </td>
            </tr>
        `;
    });
    
    const totalEff = totalAll > 0 ? Math.round((goodAll / totalAll) * 100) : 0;
    const totalColor = totalEff >= 80 ? '#28a745' : totalEff >= 50 ? '#ffc107' : '#dc3545';
    
    html += `
                    <tr style="background:#e3f2fd; border-top:2px solid #0d6efd; font-weight:bold;">
                        <td style="padding:8px; text-align:right; font-size:14px;">📊 المجموع الكلي</td>
                        <td style="padding:8px; text-align:center; color:#28a745; font-size:14px;">${goodAll}</td>
                        <td style="padding:8px; text-align:center; color:#dc3545; font-size:14px;">${badAll}</td>
                        <td style="padding:8px; text-align:center; color:#ffc107; font-size:14px;">${maintAll}</td>
                        <td style="padding:8px; text-align:center; font-size:14px;">${totalAll}</td>
                        <td style="padding:8px; text-align:center; color:${totalColor}; font-size:16px;">
                            ${totalEff}%
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="progress-section">
            <div class="progress-label">
                <span>📈 نسبة الجاهزية العامة: <strong style="color:${totalColor};">${totalEff}%</strong></span>
                <span class="status" style="color:${totalColor};">
                    ${totalEff >= 80 ? '✅ ممتاز' : totalEff >= 50 ? '⚠️ متوسط' : '❌ منخفض'}
                </span>
            </div>
            <div class="progress-track">
                <div class="progress-fill" style="width:${totalEff}%; background:${totalColor};"></div>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

// ============================================================
// 2. النجاعة العامة حسب الفئات
// ============================================================

function renderCategoryEfficiencyTable(vessels) {
    const container = document.getElementById('categoryEffContainer');
    if (!container) return;
    
    const categories = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
    
    let totalAll = 0, goodAll = 0, badAll = 0, maintAll = 0;
    
    let html = `
        <div class="efficiency-table-wrapper">
            <div class="table-title">
                <i class="fas fa-chart-pie"></i> 
                النجاعة العامة حسب الفئات
            </div>
            <div class="scrollable-table">
                <table>
                    <thead>
                        <tr>
                            <th style="text-align:right; background:#0d6efd; color:white; min-width:120px;">الفئة</th>
                            <th style="text-align:center; background:#28a745; color:white; min-width:100px;">✅ الصالحة</th>
                            <th style="text-align:center; background:#dc3545; color:white; min-width:100px;">❌ المعطبة</th>
                            <th style="text-align:center; background:#ffc107; color:#1a3a5c; min-width:100px;">🔧 الصيانة</th>
                            <th style="text-align:center; background:#0d6efd; color:white; min-width:80px;">📊 الإجمالي</th>
                            <th style="text-align:center; background:#17a2b8; color:white; min-width:100px;">📈 النسبة</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    categories.forEach(cat => {
        const catVessels = vessels.filter(v => v.cat === cat);
        const total = catVessels.length;
        const good = catVessels.filter(v => v.stat === 'صالح').length;
        const bad = catVessels.filter(v => v.stat === 'معطب').length;
        const maint = catVessels.filter(v => v.stat === 'صيانة').length;
        const eff = total > 0 ? Math.round((good / total) * 100) : 0;
        
        totalAll += total; goodAll += good; badAll += bad; maintAll += maint;
        const color = eff >= 80 ? '#28a745' : eff >= 50 ? '#ffc107' : '#dc3545';
        
        html += `
            <tr style="border-bottom:1px solid #e9ecef;">
                <td style="padding:8px; text-align:right; font-weight:bold;">${cat}</td>
                <td style="padding:8px; text-align:center; font-weight:bold; color:#28a745;">${good}</td>
                <td style="padding:8px; text-align:center; font-weight:bold; color:#dc3545;">${bad}</td>
                <td style="padding:8px; text-align:center; font-weight:bold; color:#ffc107;">${maint}</td>
                <td style="padding:8px; text-align:center; font-weight:bold;">${total}</td>
                <td style="padding:8px; text-align:center; font-weight:bold; color:${color};">
                    ${eff}%
                </td>
            </tr>
        `;
    });
    
    const totalEff = totalAll > 0 ? Math.round((goodAll / totalAll) * 100) : 0;
    const totalColor = totalEff >= 80 ? '#28a745' : totalEff >= 50 ? '#ffc107' : '#dc3545';
    
    html += `
                    <tr style="background:#e3f2fd; border-top:2px solid #0d6efd; font-weight:bold;">
                        <td style="padding:8px; text-align:right; font-size:14px;">📊 المجموع الكلي</td>
                        <td style="padding:8px; text-align:center; color:#28a745; font-size:14px;">${goodAll}</td>
                        <td style="padding:8px; text-align:center; color:#dc3545; font-size:14px;">${badAll}</td>
                        <td style="padding:8px; text-align:center; color:#ffc107; font-size:14px;">${maintAll}</td>
                        <td style="padding:8px; text-align:center; font-size:14px;">${totalAll}</td>
                        <td style="padding:8px; text-align:center; color:${totalColor}; font-size:16px;">
                            ${totalEff}%
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="progress-section">
            <div class="progress-label">
                <span>📈 نسبة الجاهزية العامة: <strong style="color:${totalColor};">${totalEff}%</strong></span>
                <span class="status" style="color:${totalColor};">
                    ${totalEff >= 80 ? '✅ ممتاز' : totalEff >= 50 ? '⚠️ متوسط' : '❌ منخفض'}
                </span>
            </div>
            <div class="progress-track">
                <div class="progress-fill" style="width:${totalEff}%; background:${totalColor};"></div>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

// ============================================================
// 3. جداول الأقاليم (بنفس شكل جدول الفئات)
// ============================================================

function renderAllRegionsTables(vessels) {
    renderRegionTable('regionNorthContainer', vessels, 'الشمال', '🗺️ الحرس البحري بالشمال');
    renderRegionTable('regionEastContainer', vessels, 'الساحل', '🗺️ الحرس البحري بالساحل');
    renderRegionTable('regionCenterContainer', vessels, 'الوسط', '🗺️ الحرس البحري بالوسط');
    renderRegionTable('regionSouthContainer', vessels, 'الجنوب', '🗺️ الحرس البحري بالجنوب');
}

function renderRegionTable(containerId, vessels, regionKey, regionName) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const categories = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
    const regionVessels = vessels.filter(v => v.reg === regionKey);
    
    let totalAll = 0, goodAll = 0, badAll = 0, maintAll = 0;
    
    let html = `
        <div class="efficiency-table-wrapper">
            <div class="table-title">
                <i class="fas fa-map-marked-alt"></i> 
                ${regionName}
            </div>
            <div class="scrollable-table">
                <table>
                    <thead>
                        <tr>
                            <th style="text-align:right; background:#0d6efd; color:white; min-width:120px;">الفئة</th>
                            <th style="text-align:center; background:#28a745; color:white; min-width:100px;">✅ الصالحة</th>
                            <th style="text-align:center; background:#dc3545; color:white; min-width:100px;">❌ المعطبة</th>
                            <th style="text-align:center; background:#ffc107; color:#1a3a5c; min-width:100px;">🔧 الصيانة</th>
                            <th style="text-align:center; background:#0d6efd; color:white; min-width:80px;">📊 الإجمالي</th>
                            <th style="text-align:center; background:#17a2b8; color:white; min-width:100px;">📈 النسبة</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    if (regionVessels.length === 0) {
        html += `
            <tr>
                <td colspan="6" style="text-align:center; padding:20px; color:#6c757d;">
                    🚫 لا توجد مراكب في هذا الإقليم
                </td>
            </tr>
        `;
    } else {
        categories.forEach(cat => {
            const catVessels = regionVessels.filter(v => v.cat === cat);
            const total = catVessels.length;
            const good = catVessels.filter(v => v.stat === 'صالح').length;
            const bad = catVessels.filter(v => v.stat === 'معطب').length;
            const maint = catVessels.filter(v => v.stat === 'صيانة').length;
            const eff = total > 0 ? Math.round((good / total) * 100) : 0;
            
            totalAll += total; goodAll += good; badAll += bad; maintAll += maint;
            const color = eff >= 80 ? '#28a745' : eff >= 50 ? '#ffc107' : '#dc3545';
            
            html += `
                <tr style="border-bottom:1px solid #e9ecef;">
                    <td style="padding:8px; text-align:right; font-weight:bold;">${cat}</td>
                    <td style="padding:8px; text-align:center; font-weight:bold; color:#28a745;">${good}</td>
                    <td style="padding:8px; text-align:center; font-weight:bold; color:#dc3545;">${bad}</td>
                    <td style="padding:8px; text-align:center; font-weight:bold; color:#ffc107;">${maint}</td>
                    <td style="padding:8px; text-align:center; font-weight:bold;">${total}</td>
                    <td style="padding:8px; text-align:center; font-weight:bold; color:${color};">
                        ${eff}%
                    </td>
                </tr>
            `;
        });
        
        const totalEff = totalAll > 0 ? Math.round((goodAll / totalAll) * 100) : 0;
        const totalColor = totalEff >= 80 ? '#28a745' : totalEff >= 50 ? '#ffc107' : '#dc3545';
        
        html += `
            <tr style="background:#e3f2fd; border-top:2px solid #0d6efd; font-weight:bold;">
                <td style="padding:8px; text-align:right; font-size:14px;">📊 المجموع الكلي</td>
                <td style="padding:8px; text-align:center; color:#28a745; font-size:14px;">${goodAll}</td>
                <td style="padding:8px; text-align:center; color:#dc3545; font-size:14px;">${badAll}</td>
                <td style="padding:8px; text-align:center; color:#ffc107; font-size:14px;">${maintAll}</td>
                <td style="padding:8px; text-align:center; font-size:14px;">${totalAll}</td>
                <td style="padding:8px; text-align:center; color:${totalColor}; font-size:16px;">
                    ${totalEff}%
                </td>
            </tr>
        `;
    }
    
    html += `
                </tbody>
            </table>
        </div>
        <div class="progress-section">
            <div class="progress-label">
                <span>📈 نسبة الجاهزية: <strong style="color:${totalColor};">${totalEff}%</strong></span>
            </div>
            <div class="progress-track">
                <div class="progress-fill" style="width:${totalEff}%; background:${totalColor};"></div>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

// ============================================================
// 📊 الرسوم البيانية 3D
// ============================================================

function renderCharts(vessels) {
    const categories = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
    
    const goodData = categories.map(cat => vessels.filter(v => v.cat === cat && v.stat === 'صالح').length);
    const badData = categories.map(cat => vessels.filter(v => v.cat === cat && v.stat === 'معطب').length);
    const maintData = categories.map(cat => vessels.filter(v => v.cat === cat && v.stat === 'صيانة').length);
    
    const effData = categories.map(cat => {
        const total = vessels.filter(v => v.cat === cat).length;
        const good = vessels.filter(v => v.cat === cat && v.stat === 'صالح').length;
        return total > 0 ? Math.round((good / total) * 100) : 0;
    });
    
    const totalGood = vessels.filter(v => v.stat === 'صالح').length;
    const totalBad = vessels.filter(v => v.stat === 'معطب').length;
    const totalMaint = vessels.filter(v => v.stat === 'صيانة').length;
    
    const regions = ['الشمال', 'الساحل', 'الوسط', 'الجنوب'];
    const regionEff = regions.map(reg => {
        const regVessels = vessels.filter(v => v.reg === reg);
        const total = regVessels.length;
        const good = regVessels.filter(v => v.stat === 'صالح').length;
        return total > 0 ? Math.round((good / total) * 100) : 0;
    });

    // الرسم الشريطي 3D
    const ctx1 = document.getElementById('barChart3D');
    if (ctx1) {
        new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: categories,
                datasets: [
                    { label: '✅ صالح', data: goodData, backgroundColor: '#28a745', borderRadius: 5 },
                    { label: '❌ معطب', data: badData, backgroundColor: '#dc3545', borderRadius: 5 },
                    { label: '🔧 صيانة', data: maintData, backgroundColor: '#ffc107', borderRadius: 5 }
                ]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'top', labels: { font: { size: 10 } } } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    // الرسم الخطي 3D
    const ctx2 = document.getElementById('lineChart3D');
    if (ctx2) {
        new Chart(ctx2, {
            type: 'line',
            data: {
                labels: categories,
                datasets: [{
                    label: '📈 نسبة الجاهزية %',
                    data: effData,
                    borderColor: '#0d6efd',
                    backgroundColor: 'rgba(13, 110, 253, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#0d6efd',
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'top', labels: { font: { size: 10 } } } },
                scales: { y: { beginAtZero: true, max: 100 } }
            }
        });
    }

    // الرسم الدائري 3D
    const ctx3 = document.getElementById('pieChart3D');
    if (ctx3) {
        new Chart(ctx3, {
            type: 'doughnut',
            data: {
                labels: ['✅ صالح', '❌ معطب', '🔧 صيانة'],
                datasets: [{
                    data: [totalGood, totalBad, totalMaint],
                    backgroundColor: ['#28a745', '#dc3545', '#ffc107'],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 10 } } }
                },
                cutout: '60%'
            }
        });
    }

    // الرسم الشريطي الأفقي 3D
    const ctx4 = document.getElementById('horizontalBarChart3D');
    if (ctx4) {
        new Chart(ctx4, {
            type: 'bar',
            data: {
                labels: ['🗺️ الشمال', '🗺️ الساحل', '🗺️ الوسط', '🗺️ الجنوب'],
                datasets: [{
                    label: '📈 نسبة الجاهزية %',
                    data: regionEff,
                    backgroundColor: ['#0d6efd', '#17a2b8', '#28a745', '#ffc107'],
                    borderRadius: 5
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, max: 100 } }
            }
        });
    }
}

// ============================================================
// دوال الفلترة والجاهزية العامة
// ============================================================

function showAllEfficiency() {
    renderEfficiency();
    showAlert('✅ تم عرض جميع الجداول', 'success');
}

function filterEfficiencyByUnit() {
    const select = document.getElementById('effUnitFilter');
    if (!select) return;
    const value = select.value;
    
    const vessels = allVessels || [];
    
    if (value) {
        const filtered = vessels.filter(v => v.reg === value);
        showAlert(`🔍 عرض إقليم: ${value}`, 'info');
        updateEfficiencyStats(filtered);
        renderGeneralEfficiencyTable(filtered);
        renderCategoryEfficiencyTable(filtered);
        renderAllRegionsTables(filtered);
        
        setTimeout(() => {
            renderCharts(filtered);
        }, 100);
    } else {
        showAlert('✅ عرض جميع الأقاليم', 'success');
        renderEfficiency();
    }
}

function viewVesselMaintenance(vesselId) {
    const vessel = allVessels.find(v => v.id == vesselId);
    if (!vessel) {
        showAlert('❌ المركب غير موجود', 'danger');
        return;
    }
    
    const records = allMaintenance.filter(r => r.vesselId == vesselId);
    
    if (records.length === 0) {
        showAlert(`🚫 لا توجد سجلات صيانة للمركب: ${vessel.name}`, 'info');
        return;
    }
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.7); display: flex; justify-content: center;
        align-items: center; z-index: 99999;
    `;
    
    let html = `
        <div style="background:white; padding:25px; border-radius:12px; 
                    max-width:600px; width:95%; max-height:80vh; overflow-y:auto; direction:rtl;">
            <h3 style="color:#0d6efd; margin-bottom:15px;">
                📋 سجل صيانة ${vessel.name}
                <button onclick="this.closest('div[style]').parentElement.remove()" 
                        style="float:left; background:#dc3545; color:white; border:none; 
                               padding:5px 15px; border-radius:5px; cursor:pointer;">✕</button>
            </h3>
    `;
    
    records.slice().reverse().forEach((r, i) => {
        html += `
            <div style="border:1px solid #e9ecef; border-radius:8px; padding:12px; margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; flex-wrap:wrap;">
                    <span style="font-weight:600;">#${i+1}</span>
                    <span style="color:#6c757d; font-size:12px;">${new Date(r.date).toLocaleString()}</span>
                </div>
                <div style="margin:8px 0;">
                    <strong>🔧 ${r.description}</strong>
                    <span style="color:${r.status === 'مكتملة' ? '#28a745' : r.status === 'قيد الإنجاز' ? '#ffc107' : '#dc3545'}; 
                           font-weight:600; margin-right:10px;">${r.status}</span>
                </div>
                <div style="font-size:13px; color:#495057;">
                    <div>🏭 ${r.unit || 'غير محدد'}</div>
                    <div>👨‍🔧 ${r.technician || 'غير محدد'}</div>
                    ${r.cost ? `<div>💰 ${r.cost} د.ت</div>` : ''}
                    ${r.parts && r.parts.length ? `
                        <div style="margin-top:5px;">
                            🔩 قطع الغيار: ${r.parts.map(p => `${p.name}(${p.quantity})`).join(', ')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    modal.innerHTML = html;
    document.body.appendChild(modal);
}

// ============================================================
// دوال أخرى
// ============================================================

function sendTicket() {
    const subject = document.getElementById('ticketSubject')?.value.trim();
    const message = document.getElementById('ticketMessage')?.value.trim();
    
    if (!subject || !message) {
        showAlert('⚠️ الرجاء إدخال العنوان والرسالة', 'warning');
        return;
    }
    
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
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
            showAlert('✅ تم إرسال التذكرة', 'success');
            document.getElementById('ticketSubject').value = '';
            document.getElementById('ticketMessage').value = '';
            loadTickets();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في الإرسال'), 'danger');
        }
    })
    .catch(err => {
        console.error('Send ticket error:', err);
        showAlert('❌ خطأ في إرسال التذكرة', 'danger');
    });
}

function saveNote() {
    const title = document.getElementById('noteTitle')?.value.trim();
    const content = document.getElementById('noteContent')?.value.trim();
    const date = document.getElementById('noteDate')?.value;
    
    if (!title || !content || !date) {
        showAlert('⚠️ الرجاء إدخال العنوان والمحتوى والتاريخ', 'warning');
        return;
    }
    
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
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
            showAlert('✅ تم حفظ المذكرة', 'success');
            document.getElementById('noteTitle').value = '';
            document.getElementById('noteContent').value = '';
            document.getElementById('noteDate').value = '';
            loadNotes();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في الحفظ'), 'danger');
        }
    })
    .catch(err => {
        console.error('Save note error:', err);
        showAlert('❌ خطأ في حفظ المذكرة', 'danger');
    });
}

function addUser() {
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    const name = document.getElementById('un')?.value.trim();
    const password = document.getElementById('up')?.value.trim();
    const role = document.getElementById('ur')?.value;
    
    if (!name || !password) {
        showAlert('⚠️ الرجاء إدخال اسم المستخدم وكلمة المرور', 'warning');
        return;
    }
    
    const data = {
        name: name,
        email: name.toLowerCase().replace(/\s/g, '') + '@test.com',
        password: password,
        role: role || 'مشاهد'
    };
    
    fetch('/api/users', {
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
            showAlert('✅ تم إضافة المستخدم', 'success');
            document.getElementById('un').value = '';
            document.getElementById('up').value = '';
            loadUsers();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في الإضافة'), 'danger');
        }
    })
    .catch(err => {
        console.error('Add user error:', err);
        showAlert('❌ خطأ في إضافة المستخدم', 'danger');
    });
}

function deleteUser(id) {
    if (!confirm('⚠️ هل أنت متأكد من حذف هذا المستخدم؟')) return;
    
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    fetch('/api/users/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert('✅ تم حذف المستخدم', 'success');
            loadUsers();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في الحذف'), 'danger');
        }
    })
    .catch(err => {
        console.error('Delete user error:', err);
        showAlert('❌ خطأ في حذف المستخدم', 'danger');
    });
}

function toggleNotifications() {
    showAlert('🔔 لا توجد إشعارات جديدة', 'info');
}

function initMap() {
    console.log('🗺️ Map initialized');
}

function startTracking() {
    showAlert('📍 بدء التتبع المباشر', 'info');
}

function stopTracking() {
    showAlert('⏹️ تم إيقاف التتبع', 'info');
}

function loadLocations() {
    showAlert('📍 تم تحديث المواقع', 'success');
}

function centerMapOnUser() {
    showAlert('🎯 تم التمركز على موقعك', 'success');
}

function refreshTrackUsers() {
    showAlert('✅ تم تحديث المستخدمين', 'success');
}

function clearTrackUsers() {
    if (confirm('⚠️ هل أنت متأكد من مسح جميع مواقع المستخدمين؟')) {
        showAlert('✅ تم مسح جميع المواقع', 'success');
    }
}

// ============================================================
// ✅ تهيئة التطبيق
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🔄 جاري تهيئة التطبيق...');
    
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (token && user) {
        try {
            currentUser = JSON.parse(user);
            if (currentUser) {
                document.getElementById('loginOverlay').style.display = 'none';
                document.getElementById('mainApp').style.display = 'block';
                updateUserDisplay();
                loadAllData();
            } else {
                document.getElementById('loginOverlay').style.display = 'flex';
                document.getElementById('mainApp').style.display = 'none';
            }
        } catch (e) {
            localStorage.clear();
            document.getElementById('loginOverlay').style.display = 'flex';
            document.getElementById('mainApp').style.display = 'none';
        }
    } else {
        document.getElementById('loginOverlay').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
    }
});

// ============================================================
// تصدير الدوال
// ============================================================

window.doLogin = doLogin;
window.doLogout = doLogout;
window.showPage = showPage;
window.loadVessels = loadVessels;
window.loadMaintenance = loadMaintenance;
window.loadTickets = loadTickets;
window.loadUsers = loadUsers;
window.loadNotes = loadNotes;
window.refreshAllPages = refreshAllPages;
window.scrollToTop = scrollToTop;
window.scrollToBottom = scrollToBottom;
window.showAlert = showAlert;
window.sendTicket = sendTicket;
window.saveNote = saveNote;
window.addUser = addUser;
window.deleteUser = deleteUser;
window.addItem = addItem;
window.editVessel = editVessel;
window.deleteVessel = deleteVessel;
window.updateZones = updateZones;
window.toggleNotifications = toggleNotifications;
window.initMap = initMap;
window.startTracking = startTracking;
window.stopTracking = stopTracking;
window.loadLocations = loadLocations;
window.centerMapOnUser = centerMapOnUser;
window.refreshTrackUsers = refreshTrackUsers;
window.clearTrackUsers = clearTrackUsers;
window.toggleMaintenanceForm = toggleMaintenanceForm;
window.saveMaintenance = saveMaintenance;
window.addPart = addPart;
window.removePart = removePart;
window.fixVessel = fixVessel;
window.applyHistoryFilters = applyHistoryFilters;
window.resetHistoryFilters = resetHistoryFilters;
window.renderGeneralMaintenance = renderGeneralMaintenance;
window.renderHistoryMaintenance = renderHistoryMaintenance;
window.updateMaintenanceStats = updateMaintenanceStats;
window.renderMaintenanceUnits = renderMaintenanceUnits;
window.renderEfficiency = renderEfficiency;
window.showAllEfficiency = showAllEfficiency;
window.filterEfficiencyByUnit = filterEfficiencyByUnit;
window.viewVesselMaintenance = viewVesselMaintenance;
window.deleteMaintenance = deleteMaintenance;
window.viewMaintenanceDetails = viewMaintenanceDetails;
window.renderAllRegionsTables = renderAllRegionsTables;
window.renderRegionTable = renderRegionTable;
window.renderCharts = renderCharts;

console.log('✅ جميع الدوال جاهزة');
