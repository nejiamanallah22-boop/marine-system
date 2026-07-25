// ============================================================
// 📦 app.js - الملف الكامل مع جميع الإصلاحات
// ============================================================

console.log('✅ App loaded');

let allVessels = [];
let allUsers = [];
let allTickets = [];
let allNotes = [];
let allMaintenance = [];
let editingId = null;
let editingUserId = null;
let editingMaintenanceId = null;
let currentUser = null;
let isLoading = false;
let noteAttachments = [];
let filteredMaintenance = [];

// ============================================================
// 🔐 المصادقة
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
            localStorage.setItem('user', JSON.stringify({
                ...data.user,
                loginTime: new Date().toISOString()
            }));
            
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

function logout() {
    if (confirm('⚠️ هل أنت متأكد من تسجيل الخروج؟')) {
        localStorage.clear();
        location.reload();
    }
}

function getToken() {
    const token = localStorage.getItem('token');
    if (!token) {
        redirectToLogin();
        return null;
    }
    return token;
}

function redirectToLogin() {
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
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

// إضافة CSS للتنبيهات
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(styleSheet);

// ============================================================
// 📊 تحميل البيانات
// ============================================================

function loadAllData() {
    if (isLoading) return;
    isLoading = true;
    
    const promises = [
        loadVessels(),
        loadMaintenance(),
        loadTickets(),
        loadNotes(),
        loadUsers()
    ];
    
    Promise.all(promises)
        .catch(err => console.error('Load all data error:', err))
        .finally(() => {
            isLoading = false;
        });
}

function loadVessels(filter = '') {
    const token = getToken();
    if (!token) return Promise.reject('No token');
    
    const searchInput = document.getElementById('searchMain') || document.getElementById('searchMaint');
    const searchTerm = filter || searchInput?.value?.toLowerCase() || '';
    
    return fetch('/api/vessels', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => {
        if (!res.ok) throw new Error('Failed to load vessels');
        return res.json();
    })
    .then(data => {
        let filtered = data || [];
        if (searchTerm) {
            filtered = filtered.filter(v => 
                v.name?.toLowerCase().includes(searchTerm) ||
                v.num?.toString().includes(searchTerm) ||
                v.reg?.toLowerCase().includes(searchTerm) ||
                v.zone?.toLowerCase().includes(searchTerm)
            );
        }
        allVessels = filtered;
        renderMainTable();
        renderMaintTable();
        renderEfficiency();
        updateMaintenanceFormVessels();
        renderMaintenanceTable();
        updateMaintenanceStats();
        renderMaintenanceUnits();
        return allVessels;
    })
    .catch(err => {
        console.error('Load vessels error:', err);
        return [];
    });
}

function loadMaintenance() {
    const token = getToken();
    if (!token) return Promise.reject('No token');
    
    return fetch('/api/maintenance', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => {
        if (!res.ok) throw new Error('Failed to load maintenance');
        return res.json();
    })
    .then(data => {
        allMaintenance = data || [];
        filteredMaintenance = [...allMaintenance];
        renderMaintenanceTable();
        updateMaintenanceStats();
        renderMaintenanceUnits();
        renderMaintenanceFilters();
        return allMaintenance;
    })
    .catch(err => {
        console.error('Load maintenance error:', err);
        return [];
    });
}

function loadUsers() {
    const token = getToken();
    if (!token) return Promise.reject('No token');
    
    return fetch('/api/users', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => {
        if (!res.ok) throw new Error('Failed to load users');
        return res.json();
    })
    .then(data => {
        allUsers = data || [];
        renderUsersTable();
        return allUsers;
    })
    .catch(err => {
        console.error('Load users error:', err);
        return [];
    });
}

function loadTickets() {
    const token = getToken();
    if (!token) return Promise.reject('No token');
    
    return fetch('/api/tickets', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => {
        if (!res.ok) throw new Error('Failed to load tickets');
        return res.json();
    })
    .then(data => {
        allTickets = data || [];
        renderTickets();
        return allTickets;
    })
    .catch(err => {
        console.error('Load tickets error:', err);
        return [];
    });
}

function loadNotes() {
    const token = getToken();
    if (!token) return Promise.reject('No token');
    
    return fetch('/api/notes', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => {
        if (!res.ok) throw new Error('Failed to load notes');
        return res.json();
    })
    .then(data => {
        allNotes = data || [];
        renderNotes();
        return allNotes;
    })
    .catch(err => {
        console.error('Load notes error:', err);
        return [];
    });
}

// ============================================================
// 🔧 نظام الصيانة
// ============================================================

function toggleMaintenanceForm() {
    const form = document.getElementById('maintenanceForm');
    if (!form) return;
    
    if (!form.classList.contains('active')) {
        form.classList.add('active');
        if (editingMaintenanceId) {
            const record = allMaintenance.find(r => r.id === editingMaintenanceId);
            if (record) {
                fillMaintenanceForm(record);
                document.querySelector('#maintenanceForm .btn-success').textContent = '✏️ تحديث';
                document.querySelector('#maintenanceForm h4').innerHTML = '<i class="fas fa-edit"></i> تعديل سجل صيانة';
            }
        } else {
            resetMaintenanceForm();
            document.querySelector('#maintenanceForm .btn-success').textContent = '💾 حفظ';
            document.querySelector('#maintenanceForm h4').innerHTML = '<i class="fas fa-clipboard-list"></i> إدخال سجل صيانة جديد';
        }
        updateMaintenanceFormVessels();
    } else {
        form.classList.remove('active');
        editingMaintenanceId = null;
        resetMaintenanceForm();
    }
}

function resetMaintenanceForm() {
    document.getElementById('mVesselId').value = '';
    document.getElementById('mType').value = 'عادية';
    document.getElementById('mUnit').value = '';
    document.getElementById('mTechnician').value = '';
    document.getElementById('mDescription').value = '';
    document.getElementById('mCost').value = '';
    document.getElementById('mNotes').value = '';
    document.getElementById('partsContainer').innerHTML = `
        <div class="part-item">
            <input type="text" placeholder="اسم القطعة" class="part-name">
            <input type="number" placeholder="الكمية" class="part-qty" style="width:80px;">
            <input type="number" placeholder="السعر (د.ت)" class="part-price" style="width:80px;">
            <button class="remove-part" onclick="removePart(this)">✕</button>
        </div>
    `;
    editingMaintenanceId = null;
}

function fillMaintenanceForm(record) {
    document.getElementById('mVesselId').value = record.vesselId || '';
    document.getElementById('mType').value = record.type || 'عادية';
    document.getElementById('mUnit').value = record.unit || '';
    document.getElementById('mTechnician').value = record.technician || '';
    document.getElementById('mDescription').value = record.description || '';
    document.getElementById('mCost').value = record.cost || '';
    document.getElementById('mNotes').value = record.notes || '';
    
    const container = document.getElementById('partsContainer');
    container.innerHTML = '';
    if (record.parts && record.parts.length > 0) {
        record.parts.forEach(p => {
            const div = document.createElement('div');
            div.className = 'part-item';
            div.innerHTML = `
                <input type="text" placeholder="اسم القطعة" class="part-name" value="${p.name || ''}">
                <input type="number" placeholder="الكمية" class="part-qty" style="width:80px;" value="${p.quantity || 0}">
                <input type="number" placeholder="السعر (د.ت)" class="part-price" style="width:80px;" value="${p.price || 0}">
                <button class="remove-part" onclick="removePart(this)">✕</button>
            `;
            container.appendChild(div);
        });
    } else {
        const div = document.createElement('div');
        div.className = 'part-item';
        div.innerHTML = `
            <input type="text" placeholder="اسم القطعة" class="part-name">
            <input type="number" placeholder="الكمية" class="part-qty" style="width:80px;">
            <input type="number" placeholder="السعر (د.ت)" class="part-price" style="width:80px;">
            <button class="remove-part" onclick="removePart(this)">✕</button>
        `;
        container.appendChild(div);
    }
}

function updateMaintenanceFormVessels() {
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

function addPart() {
    const container = document.getElementById('partsContainer');
    const div = document.createElement('div');
    div.className = 'part-item';
    div.innerHTML = `
        <input type="text" placeholder="اسم القطعة" class="part-name">
        <input type="number" placeholder="الكمية" class="part-qty" style="width:80px;">
        <input type="number" placeholder="السعر (د.ت)" class="part-price" style="width:80px;">
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
            showAlert(editingMaintenanceId ? '✅ تم تحديث سجل الصيانة بنجاح' : '✅ تم إضافة سجل الصيانة بنجاح', 'success');
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

function editMaintenance(id) {
    const record = allMaintenance.find(r => r.id === id);
    if (!record) {
        showAlert('⚠️ سجل الصيانة غير موجود', 'warning');
        return;
    }
    editingMaintenanceId = id;
    toggleMaintenanceForm();
}

function completeMaintenance(id) {
    if (!confirm('⚠️ هل أنت متأكد من إكمال هذه الصيانة؟ سيتم تغيير حالة المركب إلى "صالح"')) return;
    
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    const cost = prompt('💰 التكلفة الإجمالية للصيانة (بالدينار):');
    const notes = prompt('📝 ملاحظات إضافية (اختياري):');
    
    const data = {};
    if (cost) data.cost = parseFloat(cost);
    if (notes) data.notes = notes;
    
    fetch('/api/maintenance/' + id + '/complete', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert('✅ تم إكمال الصيانة بنجاح', 'success');
            loadAllData();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في الإكمال'), 'danger');
        }
    })
    .catch(err => {
        console.error('Complete maintenance error:', err);
        showAlert('❌ خطأ في إكمال الصيانة', 'danger');
    });
}

function cancelMaintenance(id) {
    if (!confirm('⚠️ هل أنت متأكد من إلغاء هذه الصيانة؟')) return;
    
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    fetch('/api/maintenance/' + id + '/cancel', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert('✅ تم إلغاء سجل الصيانة', 'success');
            loadAllData();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في الإلغاء'), 'danger');
        }
    })
    .catch(err => {
        console.error('Cancel maintenance error:', err);
        showAlert('❌ خطأ في إلغاء الصيانة', 'danger');
    });
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

// ============================================================
// 🔍 فلترة الصيانة
// ============================================================

function renderMaintenanceFilters() {
    const container = document.getElementById('maintenanceFilters');
    if (!container) {
        // إنشاء حاوية الفلترة إذا لم تكن موجودة
        const tableContainer = document.getElementById('maintenanceTableContainer');
        if (tableContainer) {
            const filterDiv = document.createElement('div');
            filterDiv.id = 'maintenanceFilters';
            filterDiv.className = 'filter-bar';
            filterDiv.innerHTML = `
                <label style="font-weight:600; font-size:13px; color:#6c757d;">
                    <i class="fas fa-filter"></i> فلترة:
                </label>
                <select id="mFilterUnit" onchange="applyMaintenanceFilters()">
                    <option value="">جميع الوحدات</option>
                    ${MAINTENANCE_UNITS.map(u => `<option value="${u}">${u}</option>`).join('')}
                </select>
                <input type="date" id="mFilterDateFrom" onchange="applyMaintenanceFilters()" placeholder="من تاريخ">
                <input type="date" id="mFilterDateTo" onchange="applyMaintenanceFilters()" placeholder="إلى تاريخ">
                <select id="mFilterStatus" onchange="applyMaintenanceFilters()">
                    <option value="">جميع الحالات</option>
                    <option value="قيد الإنجاز">قيد الإنجاز</option>
                    <option value="مكتملة">مكتملة</option>
                    <option value="ملغية">ملغية</option>
                </select>
                <button class="btn btn-sm btn-danger" onclick="resetMaintenanceFilters()">
                    <i class="fas fa-times"></i> إلغاء الفلترة
                </button>
            `;
            tableContainer.parentNode.insertBefore(filterDiv, tableContainer);
        }
    }
}

function applyMaintenanceFilters() {
    const unit = document.getElementById('mFilterUnit')?.value || '';
    const dateFrom = document.getElementById('mFilterDateFrom')?.value || '';
    const dateTo = document.getElementById('mFilterDateTo')?.value || '';
    const status = document.getElementById('mFilterStatus')?.value || '';
    
    filteredMaintenance = allMaintenance.filter(r => {
        let match = true;
        if (unit && r.unit !== unit) match = false;
        if (status && r.status !== status) match = false;
        if (dateFrom && r.date < dateFrom) match = false;
        if (dateTo && r.date > dateTo + 'T23:59:59') match = false;
        return match;
    });
    
    renderMaintenanceTable(filteredMaintenance);
}

function resetMaintenanceFilters() {
    document.getElementById('mFilterUnit').value = '';
    document.getElementById('mFilterDateFrom').value = '';
    document.getElementById('mFilterDateTo').value = '';
    document.getElementById('mFilterStatus').value = '';
    filteredMaintenance = [...allMaintenance];
    renderMaintenanceTable(filteredMaintenance);
}

// ============================================================
// 🖨️ عرض جداول الصيانة
// ============================================================

function renderMaintenanceTable(data = null) {
    const container = document.getElementById('maintenanceTableContainer');
    if (!container) return;
    
    const records = data || filteredMaintenance || allMaintenance || [];
    
    if (!records || records.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px; color:#6c757d;">
                🚫 لا توجد سجلات صيانة
                <br>
                <button class="btn btn-primary" onclick="toggleMaintenanceForm()" style="margin-top:10px;">
                    <i class="fas fa-plus"></i> إضافة سجل صيانة
                </button>
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="scrollable-table">
            <table>
                <thead>
                    <tr>
                        <th>المركب</th>
                        <th>الرقم</th>
                        <th>🏭 الوحدة</th>
                        <th>📝 العطل</th>
                        <th>👨‍🔧 الفني</th>
                        <th>💰 التكلفة</th>
                        <th>🔩 القطع</th>
                        <th>📊 الحالة</th>
                        <th>📅 التاريخ</th>
                        <th>إجراءات</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    records.slice().reverse().forEach(r => {
        const vesselName = r.vesselName || 
            allVessels.find(v => v.id === r.vesselId)?.name || '-';
        const vesselNum = r.vesselNum || 
            allVessels.find(v => v.id === r.vesselId)?.num || '-';
            
        const statusColors = {
            'قيد الإنجاز': '#ffc107',
            'مكتملة': '#28a745',
            'ملغية': '#dc3545'
        };
        const partsText = r.parts && r.parts.length ? 
            r.parts.map(p => p.name).join(', ') : '-';
        
        html += `
            <tr>
                <td>${vesselName}</td>
                <td>${vesselNum}</td>
                <td>${r.unit || '-'}</td>
                <td>${r.description || '-'}</td>
                <td>${r.technician || '-'}</td>
                <td>${r.cost ? r.cost + ' د.ت' : '-'}</td>
                <td style="font-size:11px;">${partsText}</td>
                <td><span style="color:${statusColors[r.status] || '#6c757d'}; font-weight:600;">${r.status || '-'}</span></td>
                <td>${new Date(r.date).toLocaleDateString()}</td>
                <td>
                    <div class="maintenance-actions">
                        ${r.status === 'قيد الإنجاز' ? `
                            <button class="btn btn-sm btn-warning" onclick="editMaintenance(${r.id})" title="تعديل">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-success" onclick="completeMaintenance(${r.id})" title="إكمال">
                                <i class="fas fa-check"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="cancelMaintenance(${r.id})" title="إلغاء">
                                <i class="fas fa-times"></i>
                            </button>
                        ` : `
                            <button class="btn btn-sm btn-warning" onclick="editMaintenance(${r.id})" title="تعديل">
                                <i class="fas fa-edit"></i>
                            </button>
                        `}
                        <button class="btn btn-sm btn-danger" onclick="deleteMaintenance(${r.id})" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
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

function renderMaintenanceUnits() {
    const container = document.getElementById('maintenanceUnitsContainer');
    if (!container) return;
    
    const units = MAINTENANCE_UNITS || [
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
                                <th>📝 العطل</th>
                                <th>👨‍🔧 الفني</th>
                                <th>📊 الحالة</th>
                                <th>📅 التاريخ</th>
                                <th>إجراءات</th>
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
                                return `
                                    <tr>
                                        <td>${r.vesselName || '-'}</td>
                                        <td>${r.description || '-'}</td>
                                        <td>${r.technician || '-'}</td>
                                        <td><span style="color:${statusColors[r.status] || '#6c757d'}; font-weight:600;">${r.status || '-'}</span></td>
                                        <td>${new Date(r.date).toLocaleDateString()}</td>
                                        <td>
                                            <div class="maintenance-actions">
                                                <button class="btn btn-sm btn-warning" onclick="editMaintenance(${r.id})" title="تعديل">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                ${r.status === 'قيد الإنجاز' ? `
                                                    <button class="btn btn-sm btn-success" onclick="completeMaintenance(${r.id})" title="إكمال">
                                                        <i class="fas fa-check"></i>
                                                    </button>
                                                ` : ''}
                                                <button class="btn btn-sm btn-danger" onclick="deleteMaintenance(${r.id})" title="حذف">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        </td>
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

// ============================================================
// ✅ دوال المراكب
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
    
    const url = editingId ? '/api/vessels/' + editingId : '/api/vessels';
    const method = editingId ? 'PUT' : 'POST';
    
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
            showAlert(editingId ? '✅ تم تحديث المركب بنجاح' : '✅ تم إضافة المركب بنجاح', 'success');
            editingId = null;
            clearInputs();
            loadAllData();
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
    
    editingId = vessel.id;
    
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
    
    document.querySelector('#inputArea .btn-success').textContent = '✏️ تحديث';
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
            loadAllData();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في الحذف'), 'danger');
        }
    })
    .catch(err => {
        console.error('Delete error:', err);
        showAlert('❌ خطأ في الحذف', 'danger');
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
    document.getElementById('iRepairer').value = '';
    editingId = null;
    document.querySelector('#inputArea .btn-success').textContent = '💾 حفظ';
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
    
    // عرض في نافذة منبثقة
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
// ✅ عرض الجداول
// ============================================================

function renderMainTable() {
    const tbody = document.getElementById('mainBody');
    if (!tbody) return;
    
    if (!allVessels || allVessels.length === 0) {
        tbody.innerHTML = `<tr><td colspan="15" style="text-align:center; padding:30px;">🚫 لا توجد بيانات</td></tr>`;
        return;
    }
    
    tbody.innerHTML = allVessels.map(v => {
        const hasMaintenance = allMaintenance.some(r => r.vesselId === v.id && r.status === 'قيد الإنجاز');
        return `
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
            <td>${v.ref || '-'}</td>
            <td>${v.repairer || '-'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-warning" onclick="editVessel(${v.id})" title="تعديل">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteVessel(${v.id})" title="حذف">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="btn btn-sm btn-info" onclick="viewVesselMaintenance(${v.id})" title="سجل الصيانة">
                        <i class="fas fa-clipboard-list"></i>
                    </button>
                    ${hasMaintenance ? `<span style="background:#ffc107; padding:2px 8px; border-radius:10px; font-size:10px;">🔧</span>` : ''}
                </div>
            </td>
        </tr>
    `}).join('');
}

function renderMaintTable() {
    const tbody = document.getElementById('maintBody');
    if (!tbody) return;
    
    const vessels = (allVessels || []).filter(v => v.stat !== 'صالح');
    
    if (vessels.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:30px;">🚫 لا توجد بيانات صيانة</td></tr>`;
        return;
    }
    
    tbody.innerHTML = vessels.map(v => {
        const maintenanceRecord = allMaintenance.find(r => r.vesselId === v.id && r.status === 'قيد الإنجاز');
        return `
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
            <td>${v.repairer || '-'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-warning" onclick="editVessel(${v.id})" title="تعديل">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${maintenanceRecord ? `
                        <button class="btn btn-sm btn-warning" onclick="editMaintenance(${maintenanceRecord.id})" title="تعديل الصيانة">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-success" onclick="completeMaintenance(${maintenanceRecord.id})" title="إكمال الصيانة">
                            <i class="fas fa-check"></i>
                        </button>
                    ` : `
                        <button class="btn btn-sm btn-primary" onclick="toggleMaintenanceForm()" title="إنشاء سجل صيانة">
                            <i class="fas fa-plus"></i>
                        </button>
                    `}
                    <button class="btn btn-sm btn-info" onclick="viewVesselMaintenance(${v.id})" title="سجل الصيانة">
                        <i class="fas fa-clipboard-list"></i>
                    </button>
                </div>
            </td>
        </tr>
    `}).join('');
}

// ============================================================
// ✅ عرض النجاعة
// ============================================================

function renderEfficiency() {
    const vessels = allVessels || [];
    
    const statsContainer = document.getElementById('statsCards');
    if (statsContainer) {
        const total = vessels.length;
        const good = vessels.filter(v => v.stat === 'صالح').length;
        const bad = vessels.filter(v => v.stat === 'معطب').length;
        const maint = vessels.filter(v => v.stat === 'صيانة').length;
        const eff = total > 0 ? Math.round((good / total) * 100) : 0;
        
        statsContainer.innerHTML = `
            <div class="stat-card" style="background:#28a745;"><h3>${good}</h3><p>✅ صالح</p></div>
            <div class="stat-card" style="background:#dc3545;"><h3>${bad}</h3><p>❌ معطب</p></div>
            <div class="stat-card" style="background:#ffc107;"><h3>${maint}</h3><p>🔧 صيانة</p></div>
            <div class="stat-card" style="background:#17a2b8;"><h3>${eff}%</h3><p>📊 الجاهزية</p></div>
        `;
    }
    
    function createEfficiencyTable(data, title, icon = '📊') {
        const categories = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
        let rows = '';
        let totalAll = 0, goodAll = 0, badAll = 0, maintAll = 0;
        
        categories.forEach(cat => {
            const catVessels = data.filter(v => v.cat === cat);
            const t = catVessels.length;
            const g = catVessels.filter(v => v.stat === 'صالح').length;
            const b = catVessels.filter(v => v.stat === 'معطب').length;
            const m = catVessels.filter(v => v.stat === 'صيانة').length;
            const e = t > 0 ? Math.round((g / t) * 100) : 0;
            
            totalAll += t; goodAll += g; badAll += b; maintAll += m;
            const color = e >= 80 ? '#28a745' : e >= 50 ? '#ffc107' : '#dc3545';
            
            rows += `
                <tr style="border-bottom:1px solid #e9ecef;">
                    <td style="padding:8px; text-align:right; font-weight:bold;">${cat}</td>
                    <td style="padding:8px; text-align:center;">${t}</td>
                    <td style="padding:8px; text-align:center; color:#28a745;">${g}</td>
                    <td style="padding:8px; text-align:center; color:#dc3545;">${b}</td>
                    <td style="padding:8px; text-align:center; color:#ffc107;">${m}</td>
                    <td style="padding:8px; text-align:center; font-weight:bold; color:${color};">${e}%</td>
                </tr>
            `;
        });
        
        const totalEff = totalAll > 0 ? Math.round((goodAll / totalAll) * 100) : 0;
        const totalColor = totalEff >= 80 ? '#28a745' : totalEff >= 50 ? '#ffc107' : '#dc3545';
        
        return `
            <div class="efficiency-table-wrapper">
                <div class="table-title"><i class="fas ${icon}"></i> ${title}</div>
                <table>
                    <thead>
                        <tr>
                            <th style="text-align:right;">الفئة</th>
                            <th style="text-align:center;">الإجمالي</th>
                            <th style="text-align:center; background:#28a745;">✅ صالح</th>
                            <th style="text-align:center; background:#dc3545;">❌ معطب</th>
                            <th style="text-align:center; background:#ffc107;">🔧 صيانة</th>
                            <th style="text-align:center;">نسبة النجاعة</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                        <tr class="total-row">
                            <td style="text-align:right;">📊 المجموع الكلي</td>
                            <td style="text-align:center;">${totalAll}</td>
                            <td style="text-align:center; color:#28a745;">${goodAll}</td>
                            <td style="text-align:center; color:#dc3545;">${badAll}</td>
                            <td style="text-align:center; color:#ffc107;">${maintAll}</td>
                            <td style="text-align:center; color:${totalColor};">${totalEff}%</td>
                        </tr>
                    </tbody>
                </table>
                <div class="progress-section">
                    <div class="progress-label">
                        <span>📈 نسبة النجاعة: <strong>${totalEff}%</strong></span>
                        <span class="status" style="color:${totalColor};">${totalEff >= 80 ? '✅ ممتاز' : totalEff >= 50 ? '⚠️ متوسط' : '❌ منخفض'}</span>
                    </div>
                    <div class="progress-track">
                        <div class="progress-fill" style="width:${totalEff}%; background:${totalColor};"></div>
                    </div>
                </div>
            </div>
        `;
    }
    
    const generalContainer = document.getElementById('generalEffTableContainer');
    if (generalContainer) {
        generalContainer.innerHTML = createEfficiencyTable(vessels, 'النجاعة العامة حسب الفئات', 'fa-ship');
    }
    
    const regionsContainer = document.getElementById('regionsEffContainer');
    if (regionsContainer) {
        const regions = [
            { name: '🗺️ الحرس البحري بالشمال', key: 'الشمال', icon: 'fa-map-marker-alt' },
            { name: '🗺️ الحرس البحري بالساحل', key: 'الساحل', icon: 'fa-map-marker-alt' },
            { name: '🗺️ الحرس البحري بالوسط', key: 'الوسط', icon: 'fa-map-marker-alt' },
            { name: '🗺️ الحرس البحري بالجنوب', key: 'الجنوب', icon: 'fa-map-marker-alt' }
        ];
        
        let html = '';
        regions.forEach(region => {
            const regionVessels = vessels.filter(v => v.reg === region.key);
            html += createEfficiencyTable(regionVessels, region.name, region.icon);
        });
        
        regionsContainer.innerHTML = html;
    }
}

// ============================================================
// 🎫 التذاكر
// ============================================================

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

function refreshTickets() {
    loadTickets();
    showAlert('✅ تم تحديث التذاكر', 'success');
}

// ============================================================
// 📝 المذكرات مع المرفقات
// ============================================================

function renderNotes() {
    const container = document.getElementById('notesListContainer');
    if (!container) return;
    
    if (!allNotes || allNotes.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#6c757d;">🚫 لا توجد مذكرات</p>';
        return;
    }
    
    container.innerHTML = allNotes.map(n => `
        <div style="background:#f8f9fa; padding:15px; margin:10px 0; border-radius:8px; border-right:4px solid #0d6efd;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
                <h4 style="color:#0d6efd; margin:0;">${n.title}</h4>
                <small style="color:#6c757d;">${n.date || ''} ${n.time || ''} | ${n.createdBy || 'مجهول'}</small>
            </div>
            <p style="margin:8px 0;">${n.content}</p>
            
            ${n.attachments && n.attachments.length ? `
                <div class="note-attachments">
                    ${n.attachments.map(a => `
                        <a href="${a.url}" target="_blank" class="note-attachment" download>
                            <span class="file-icon">${getFileIcon(a.type)}</span>
                            ${a.name}
                            <span class="file-size">(${formatFileSize(a.size)})</span>
                        </a>
                    `).join('')}
                </div>
            ` : ''}
            
            <div style="margin-top:8px;">
                <button class="btn btn-sm btn-danger" onclick="deleteNote(${n.id})">
                    <i class="fas fa-trash"></i> حذف
                </button>
            </div>
        </div>
    `).join('');
}

function getFileIcon(type) {
    const icons = {
        'application/pdf': '📄',
        'image/jpeg': '🖼️',
        'image/png': '🖼️',
        'image/gif': '🖼️',
        'image/webp': '🖼️',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
        'application/vnd.ms-excel': '📊',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
        'application/msword': '📝'
    };
    return icons[type] || '📎';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function clearFileInput(id) {
    const input = document.getElementById(id);
    if (input) {
        input.value = '';
        updateFilePreview(id);
    }
}

function clearAllFiles() {
    const ids = ['notePdf', 'noteImage', 'noteExcel', 'noteWord'];
    ids.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
        updateFilePreview(id);
    });
    document.getElementById('noteImageThumbnail').innerHTML = '';
    noteAttachments = [];
    updateFileCount();
}

function updateFilePreview(inputId) {
    const input = document.getElementById(inputId);
    const previewId = inputId + 'Preview';
    const preview = document.getElementById(previewId);
    if (!preview) return;
    
    if (input && input.files && input.files.length > 0) {
        const file = input.files[0];
        preview.textContent = `✅ ${file.name}`;
        preview.style.color = '#28a745';
        
        if (inputId === 'noteImage' && file.type.startsWith('image/')) {
            const thumbnail = document.getElementById('noteImageThumbnail');
            if (thumbnail) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    thumbnail.innerHTML = `<img src="${e.target.result}" alt="معاينة الصورة" style="max-width:100%; max-height:100px; border-radius:4px; border:1px solid #e9ecef;">`;
                };
                reader.readAsDataURL(file);
            }
        }
    } else {
        preview.textContent = '';
        if (inputId === 'noteImage') {
            document.getElementById('noteImageThumbnail').innerHTML = '';
        }
    }
}

function updateFileCount() {
    const count = document.getElementById('fileCount');
    if (!count) return;
    const total = noteAttachments.length;
    count.textContent = `📎 ${total} ملف مرفق`;
}

async function attachAllFiles() {
    const fileInputs = ['notePdf', 'noteImage', 'noteExcel', 'noteWord'];
    const files = [];
    
    fileInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input && input.files && input.files.length > 0) {
            files.push(input.files[0]);
        }
    });
    
    if (files.length === 0) {
        showAlert('⚠️ الرجاء اختيار ملفات للإرفاق', 'warning');
        return;
    }
    
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    
    try {
        const response = await fetch('/api/notes/upload', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: formData
        });
        
        const data = await response.json();
        if (data.success) {
            noteAttachments = [...noteAttachments, ...data.files];
            updateFileCount();
            showAlert(`✅ تم رفع ${data.files.length} ملف بنجاح`, 'success');
            
            // عرض الملفات المرفوعة
            const container = document.getElementById('uploadedFilesList') || 
                (() => {
                    const div = document.createElement('div');
                    div.id = 'uploadedFilesList';
                    div.style.cssText = 'margin-top:10px; padding:10px; background:#e7f3ff; border-radius:6px;';
                    document.querySelector('.note-files-section').appendChild(div);
                    return div;
                })();
            
            container.innerHTML = `
                <h5 style="margin-bottom:8px; color:#0d6efd;">
                    <i class="fas fa-check-circle"></i> الملفات المرفوعة (${noteAttachments.length})
                </h5>
                ${noteAttachments.map(a => `
                    <div style="display:inline-flex; align-items:center; gap:5px; padding:4px 12px; 
                                background:white; border-radius:20px; margin:3px; border:1px solid #0d6efd;">
                        <span>${getFileIcon(a.type)}</span>
                        <span style="font-size:12px;">${a.name}</span>
                        <span style="font-size:10px; color:#6c757d;">(${formatFileSize(a.size)})</span>
                        <button onclick="removeAttachment('${a.filename}')" 
                                style="background:transparent; border:none; color:#dc3545; cursor:pointer; font-weight:bold;">✕</button>
                    </div>
                `).join('')}
            `;
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في رفع الملفات'), 'danger');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showAlert('❌ خطأ في رفع الملفات', 'danger');
    }
}

function removeAttachment(filename) {
    noteAttachments = noteAttachments.filter(a => a.filename !== filename);
    updateFileCount();
    const container = document.getElementById('uploadedFilesList');
    if (container) {
        container.innerHTML = `
            <h5 style="margin-bottom:8px; color:#0d6efd;">
                <i class="fas fa-check-circle"></i> الملفات المرفوعة (${noteAttachments.length})
            </h5>
            ${noteAttachments.map(a => `
                <div style="display:inline-flex; align-items:center; gap:5px; padding:4px 12px; 
                            background:white; border-radius:20px; margin:3px; border:1px solid #0d6efd;">
                    <span>${getFileIcon(a.type)}</span>
                    <span style="font-size:12px;">${a.name}</span>
                    <span style="font-size:10px; color:#6c757d;">(${formatFileSize(a.size)})</span>
                    <button onclick="removeAttachment('${a.filename}')" 
                            style="background:transparent; border:none; color:#dc3545; cursor:pointer; font-weight:bold;">✕</button>
                </div>
            `).join('')}
        `;
    }
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
    
    const data = {
        title: title,
        content: content,
        date: date,
        attachments: noteAttachments
    };
    
    fetch('/api/notes', {
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
            showAlert('✅ تم حفظ المذكرة مع المرفقات', 'success');
            document.getElementById('noteTitle').value = '';
            document.getElementById('noteContent').value = '';
            document.getElementById('noteDate').value = '';
            noteAttachments = [];
            document.getElementById('uploadedFilesList')?.remove();
            clearAllFiles();
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

function deleteNote(id) {
    if (!confirm('⚠️ هل أنت متأكد من حذف هذه المذكرة؟')) return;
    
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    fetch('/api/notes/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert('✅ تم حذف المذكرة', 'success');
            loadNotes();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في الحذف'), 'danger');
        }
    })
    .catch(err => {
        console.error('Delete note error:', err);
        showAlert('❌ خطأ في حذف المذكرة', 'danger');
    });
}

function clearNote() {
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').value = '';
    document.getElementById('noteDate').value = '';
    noteAttachments = [];
    document.getElementById('uploadedFilesList')?.remove();
    clearAllFiles();
}

function loadNotesByWeek() {
    loadNotes();
}

// ============================================================
// 👥 المستخدمين
// ============================================================

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
            showAlert('✅ تم إضافة المستخدم بنجاح', 'success');
            document.getElementById('un').value = '';
            document.getElementById('up').value = '';
            document.getElementById('ur').value = 'مشاهد';
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

function toggleUserStatus(id) {
    const user = allUsers.find(u => u.id === id);
    if (!user) return;
    
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    fetch('/api/users/' + id, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ isActive: !user.isActive })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert('✅ تم تحديث حالة المستخدم', 'success');
            loadUsers();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في التحديث'), 'danger');
        }
    })
    .catch(err => {
        console.error('Toggle user status error:', err);
        showAlert('❌ خطأ في تحديث حالة المستخدم', 'danger');
    });
}

function changeUserPassword(id, name) {
    const newPassword = prompt(`🔑 تغيير كلمة المرور لـ: ${name}\nأدخل كلمة المرور الجديدة (6 أحرف على الأقل):`);
    if (!newPassword || newPassword.length < 6) {
        showAlert('⚠️ كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'warning');
        return;
    }
    
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    fetch('/api/users/' + id, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ password: newPassword })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert('✅ تم تغيير كلمة المرور بنجاح', 'success');
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في التغيير'), 'danger');
        }
    })
    .catch(err => {
        console.error('Change password error:', err);
        showAlert('❌ خطأ في تغيير كلمة المرور', 'danger');
    });
}

function renderUsersTable() {
    const tbody = document.getElementById('usersBody');
    if (!tbody) return;
    
    if (!allUsers || allUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px;">🚫 لا توجد مستخدمين</td></tr>`;
        return;
    }
    
    tbody.innerHTML = allUsers.map(u => `
        <tr>
            <td>${u.name || '-'}</td>
            <td>${u.role || 'مشاهد'}</td>
            <td>${u.isActive ? '✅ نشط' : '❌ معطل'}</td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="changeUserPassword(${u.id}, '${u.name}')">
                    <i class="fas fa-key"></i>
                </button>
            </td>
            <td>
                <button class="btn btn-sm ${u.isActive ? 'btn-danger' : 'btn-success'}" onclick="toggleUserStatus(${u.id})">
                    <i class="fas ${u.isActive ? 'fa-ban' : 'fa-check'}"></i>
                </button>
            </td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// ============================================================
// 🗺️ الخريطة
// ============================================================

let map = null;
let trackingInterval = null;
let userMarker = null;

function initMap() {
    try {
        if (typeof L !== 'undefined') {
            const mapContainer = document.getElementById('gpsMap');
            if (mapContainer) {
                map = L.map('gpsMap').setView([36.8, 10.18], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap'
                }).addTo(map);
                console.log('🗺️ Map initialized');
            }
            
            // تتبع المستخدمين
            const trackContainer = document.getElementById('trackMap');
            if (trackContainer) {
                const trackMap = L.map('trackMap').setView([36.8, 10.18], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap'
                }).addTo(trackMap);
                window.trackMap = trackMap;
                console.log('🗺️ Track map initialized');
            }
        }
    } catch (e) {
        console.warn('Map initialization error:', e);
    }
}

function startTracking() {
    if (navigator.geolocation) {
        const statusText = document.getElementById('gpsStatusText');
        const statusDot = document.getElementById('gpsDot');
        const statusText2 = document.getElementById('gpsStatusText2');
        const startBtn = document.getElementById('startTrackingBtn');
        const stopBtn = document.getElementById('stopTrackingBtn');
        const mapStatus = document.getElementById('mapStatus');
        
        if (statusText) statusText.textContent = 'جاري التتبع...';
        if (statusDot) { statusDot.className = 'gps-status gps-active'; }
        if (mapStatus) mapStatus.textContent = '📍 جاري الحصول على الموقع...';
        
        navigator.geolocation.watchPosition((position) => {
            const { latitude, longitude, accuracy } = position.coords;
            
            document.getElementById('gpsLat').textContent = latitude.toFixed(6);
            document.getElementById('gpsLng').textContent = longitude.toFixed(6);
            document.getElementById('gpsAccuracy').textContent = accuracy + ' م';
            if (statusText2) statusText2.textContent = '✅ نشط';
            if (mapStatus) mapStatus.textContent = '✅ الموقع محدث';
            
            if (map) {
                map.setView([latitude, longitude], 16);
                if (userMarker) {
                    userMarker.setLatLng([latitude, longitude]);
                } else {
                    userMarker = L.marker([latitude, longitude], {
                        icon: L.divIcon({
                            className: 'custom-marker',
                            html: '<div style="background:#0d6efd; width:20px; height:20px; border-radius:50%; border:3px solid white; box-shadow:0 0 20px rgba(13,110,253,0.5);"></div>',
                            iconSize: [20, 20],
                            iconAnchor: [10, 10]
                        })
                    }).addTo(map);
                }
            }
            
            // إرسال الموقع للخادم
            const token = getToken();
            if (token) {
                fetch('/api/locations', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ lat: latitude, lng: longitude })
                }).catch(console.error);
            }
            
            if (startBtn) startBtn.style.display = 'none';
            if (stopBtn) stopBtn.style.display = 'inline-block';
            
        }, (error) => {
            console.warn('Geolocation error:', error);
            if (statusText) statusText.textContent = '❌ خطأ';
            if (mapStatus) mapStatus.textContent = '❌ تعذر الحصول على الموقع';
        }, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        });
        
        showAlert('📍 بدء التتبع المباشر', 'info');
    } else {
        showAlert('❌ المتصفح لا يدعم التتبع', 'danger');
    }
}

function stopTracking() {
    const statusText = document.getElementById('gpsStatusText');
    const statusDot = document.getElementById('gpsDot');
    const statusText2 = document.getElementById('gpsStatusText2');
    const startBtn = document.getElementById('startTrackingBtn');
    const stopBtn = document.getElementById('stopTrackingBtn');
    const mapStatus = document.getElementById('mapStatus');
    
    if (statusText) statusText.textContent = 'متوقف';
    if (statusDot) { statusDot.className = 'gps-status gps-inactive'; }
    if (statusText2) statusText2.textContent = '⏹️ متوقف';
    if (startBtn) startBtn.style.display = 'inline-block';
    if (stopBtn) stopBtn.style.display = 'none';
    if (mapStatus) mapStatus.textContent = '⏹️ تم إيقاف التتبع';
    
    showAlert('⏹️ تم إيقاف التتبع', 'info');
}

function loadLocations() {
    fetch('/api/locations')
        .then(res => res.json())
        .then(data => {
            if (data.length > 0 && map) {
                const last = data[data.length - 1];
                map.setView([last.lat, last.lng], 15);
                if (userMarker) {
                    userMarker.setLatLng([last.lat, last.lng]);
                } else {
                    userMarker = L.marker([last.lat, last.lng]).addTo(map);
                }
                showAlert('📍 تم تحديث الخريطة', 'success');
            }
        })
        .catch(err => console.error('Load locations error:', err));
}

function centerMapOnUser() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            const { latitude, longitude } = position.coords;
            if (map) {
                map.setView([latitude, longitude], 16);
                if (userMarker) {
                    userMarker.setLatLng([latitude, longitude]);
                } else {
                    userMarker = L.marker([latitude, longitude]).addTo(map);
                }
                showAlert('🎯 تم التمركز على موقعك', 'success');
            }
        }, () => {
            showAlert('❌ تعذر الحصول على الموقع', 'danger');
        });
    } else {
        showAlert('❌ المتصفح لا يدعم التتبع', 'danger');
    }
}

function toggleNotifications() {
    showAlert('🔔 لا توجد إشعارات جديدة', 'info');
}

function refreshTrackUsers() {
    loadLocations();
    showAlert('✅ تم تحديث المستخدمين المتصلين', 'success');
}

function clearTrackUsers() {
    if (confirm('⚠️ هل أنت متأكد من مسح جميع مواقع المستخدمين؟')) {
        fetch('/api/locations', { method: 'DELETE' })
            .then(() => {
                showAlert('✅ تم مسح جميع المواقع', 'success');
            })
            .catch(err => console.error('Clear locations error:', err));
    }
}

// ============================================================
// 🖥️ دوال الصفحات
// ============================================================

function showPage(page) {
    document.querySelectorAll('[id^="page"]').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1));
    if (target) target.classList.remove('hidden');
    
    switch(page) {
        case 'main':
            loadVessels();
            break;
        case 'maint':
            loadVessels();
            break;
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
        case 'maintenance':
            loadMaintenance();
            renderMaintenanceFilters();
            break;
        case 'map':
            setTimeout(initMap, 100);
            break;
        case 'track':
            setTimeout(initMap, 100);
            loadLocations();
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
// 🔄 تصدير الدوال للاستخدام العالمي
// ============================================================

window.doLogin = doLogin;
window.logout = logout;
window.showPage = showPage;
window.addItem = addItem;
window.editVessel = editVessel;
window.deleteVessel = deleteVessel;
window.updateZones = updateZones;
window.refreshAllPages = refreshAllPages;
window.scrollToTop = scrollToTop;
window.scrollToBottom = scrollToBottom;
window.sendTicket = sendTicket;
window.refreshTickets = refreshTickets;
window.saveNote = saveNote;
window.clearNote = clearNote;
window.loadNotesByWeek = loadNotesByWeek;
window.toggleNotifications = toggleNotifications;
window.initMap = initMap;
window.startTracking = startTracking;
window.stopTracking = stopTracking;
window.loadLocations = loadLocations;
window.centerMapOnUser = centerMapOnUser;
window.addUser = addUser;
window.deleteUser = deleteUser;
window.toggleUserStatus = toggleUserStatus;
window.changeUserPassword = changeUserPassword;
window.toggleMaintenanceForm = toggleMaintenanceForm;
window.saveMaintenance = saveMaintenance;
window.editMaintenance = editMaintenance;
window.completeMaintenance = completeMaintenance;
window.cancelMaintenance = cancelMaintenance;
window.deleteMaintenance = deleteMaintenance;
window.viewVesselMaintenance = viewVesselMaintenance;
window.loadMaintenance = loadMaintenance;
window.addPart = addPart;
window.removePart = removePart;
window.renderMaintenanceUnits = renderMaintenanceUnits;
window.renderMaintenanceTable = renderMaintenanceTable;
window.updateMaintenanceStats = updateMaintenanceStats;
window.loadVessels = loadVessels;
window.loadUsers = loadUsers;
window.loadTickets = loadTickets;
window.loadNotes = loadNotes;
window.applyMaintenanceFilters = applyMaintenanceFilters;
window.resetMaintenanceFilters = resetMaintenanceFilters;
window.clearFileInput = clearFileInput;
window.clearAllFiles = clearAllFiles;
window.attachAllFiles = attachAllFiles;
window.removeAttachment = removeAttachment;
window.deleteNote = deleteNote;
window.refreshTrackUsers = refreshTrackUsers;
window.clearTrackUsers = clearTrackUsers;

console.log('✅ جميع الدوال جاهزة');

// ============================================================
// 🚀 تهيئة التطبيق
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
                setTimeout(initMap, 500);
            }
        } catch (e) {
            localStorage.clear();
        }
    }
});

// إضافة MAINTENANCE_UNITS للاستخدام العالمي
const MAINTENANCE_UNITS = [
    'وحدة الصيانة والإسناد البحري تونس',
    'وحدة الصيانة والإسناد البحري صفاقس',
    'وحدة الصيانة والإسناد البحري المنستير',
    'وحدة الصيانة والإسناد البحري جرجيس',
    'شركة خاصة'
];
window.MAINTENANCE_UNITS = MAINTENANCE_UNITS;
