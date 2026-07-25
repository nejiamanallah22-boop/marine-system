// ============================================================
// 📦 app.js - الملف الرئيسي الكامل (نسخة 2024)
// ============================================================

console.log('✅ App loaded');

let allVessels = [];
let allUsers = [];
let allTickets = [];
let allNotes = [];
let allMaintenance = [];
let editingId = null;
let editingUserId = null;
let currentUser = null;

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
            currentUser = data.user;
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

function getUser() {
    try {
        return JSON.parse(localStorage.getItem('user'));
    } catch {
        return null;
    }
}

// ============================================================
// 📊 تحميل البيانات
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
        renderMaintTable();
        renderEfficiency();
        updateMaintenanceFormVessels();
        renderMaintenanceTable();
        updateMaintenanceStats();
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
        renderMaintenanceTable();
        updateMaintenanceStats();
    })
    .catch(err => console.error('Load maintenance error:', err));
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

// ============================================================
// 🔧 نظام الصيانة
// ============================================================

function toggleMaintenanceForm() {
    const form = document.getElementById('maintenanceForm');
    if (form) {
        form.classList.toggle('active');
        if (form.classList.contains('active')) {
            updateMaintenanceFormVessels();
            document.getElementById('mVesselId').value = '';
            document.getElementById('mType').value = 'عادية';
            document.getElementById('mTechnician').value = '';
            document.getElementById('mDescription').value = '';
            document.getElementById('mCost').value = '';
            document.getElementById('mNotes').value = '';
            document.getElementById('partsContainer').innerHTML = `
                <div class="part-item">
                    <input type="text" placeholder="اسم القطعة" class="part-name">
                    <input type="number" placeholder="الكمية" class="part-qty" style="width:80px;">
                    <input type="number" placeholder="السعر" class="part-price" style="width:80px;">
                    <button class="remove-part" onclick="removePart(this)">✕</button>
                </div>
            `;
        }
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
        alert('⚠️ يجب أن يكون هناك قطعة واحدة على الأقل');
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
        alert('⚠️ يرجى تسجيل الدخول أولاً');
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
        alert('⚠️ الرجاء اختيار المركب');
        return;
    }
    if (!description) {
        alert('⚠️ الرجاء إدخال وصف العطل');
        return;
    }
    if (!technician) {
        alert('⚠️ الرجاء إدخال اسم الفني المسؤول');
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
    
    fetch('/api/maintenance', {
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
            alert('✅ تم إضافة سجل الصيانة بنجاح');
            toggleMaintenanceForm();
            loadAllData();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الإضافة'));
        }
    })
    .catch(err => {
        console.error('Save maintenance error:', err);
        alert('❌ خطأ في إضافة سجل الصيانة');
    });
}

function completeMaintenance(id) {
    if (!confirm('⚠️ هل أنت متأكد من إكمال هذه الصيانة؟ سيتم تغيير حالة المركب إلى "صالح"')) return;
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
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
            alert('✅ تم إكمال الصيانة بنجاح');
            loadAllData();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الإكمال'));
        }
    })
    .catch(err => {
        console.error('Complete maintenance error:', err);
        alert('❌ خطأ في إكمال الصيانة');
    });
}

function cancelMaintenance(id) {
    if (!confirm('⚠️ هل أنت متأكد من إلغاء هذه الصيانة؟')) return;
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    fetch('/api/maintenance/' + id + '/cancel', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم إلغاء سجل الصيانة');
            loadAllData();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الإلغاء'));
        }
    })
    .catch(err => {
        console.error('Cancel maintenance error:', err);
        alert('❌ خطأ في إلغاء الصيانة');
    });
}

function deleteMaintenance(id) {
    if (!confirm('⚠️ هل أنت متأكد من حذف سجل الصيانة هذا؟')) return;
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    fetch('/api/maintenance/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم حذف سجل الصيانة');
            loadAllData();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الحذف'));
        }
    })
    .catch(err => {
        console.error('Delete maintenance error:', err);
        alert('❌ خطأ في حذف سجل الصيانة');
    });
}

function viewVesselMaintenance(vesselId) {
    const vessel = allVessels.find(v => v.id == vesselId);
    if (!vessel) {
        alert('❌ المركب غير موجود');
        return;
    }
    
    const records = allMaintenance.filter(r => r.vesselId == vesselId);
    
    if (records.length === 0) {
        alert(`🚫 لا توجد سجلات صيانة للمركب: ${vessel.name}`);
        return;
    }
    
    let message = `📋 سجل صيانة ${vessel.name}:\n\n`;
    records.slice().reverse().forEach((r, i) => {
        message += `${i+1}. 📅 ${new Date(r.date).toLocaleDateString()}\n`;
        message += `   🔧 ${r.description}\n`;
        message += `   🏭 ${r.unit || 'غير محدد'}\n`;
        message += `   👨‍🔧 ${r.technician || 'غير محدد'}\n`;
        message += `   📊 ${r.status}\n`;
        if (r.cost) message += `   💰 ${r.cost} د.ت\n`;
        if (r.parts && r.parts.length) {
            message += `   🔩 قطع الغيار: ${r.parts.map(p => `${p.name}(${p.quantity})`).join(', ')}\n`;
        }
        message += `   ────────────────\n`;
    });
    
    alert(message);
}

function renderMaintenanceTable() {
    const container = document.getElementById('maintenanceTableContainer');
    if (!container) return;
    
    if (!allMaintenance || allMaintenance.length === 0) {
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
    
    allMaintenance.slice().reverse().forEach(r => {
        const statusColors = {
            'قيد الإنجاز': '#ffc107',
            'مكتملة': '#28a745',
            'ملغية': '#dc3545'
        };
        const partsText = r.parts && r.parts.length ? r.parts.map(p => p.name).join(', ') : '-';
        
        html += `
            <tr>
                <td>${r.vesselName || '-'}</td>
                <td>${r.vesselNum || '-'}</td>
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
                            <button class="btn btn-sm btn-success" onclick="completeMaintenance(${r.id})" title="إكمال">
                                <i class="fas fa-check"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="cancelMaintenance(${r.id})" title="إلغاء">
                                <i class="fas fa-times"></i>
                            </button>
                        ` : ''}
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
            alert(editingId ? '✅ تم تحديث المركب بنجاح' : '✅ تم إضافة المركب بنجاح');
            editingId = null;
            document.querySelector('#inputArea .btn-success').textContent = '💾 حفظ';
            clearInputs();
            loadAllData();
        } else {
            alert('❌ ' + (data.error || 'خطأ في العملية'));
        }
    })
    .catch(err => {
        console.error('Error:', err);
        alert('❌ خطأ في العملية');
    });
}

function editVessel(id) {
    const vessel = allVessels.find(v => v.id === id);
    if (!vessel) {
        alert('⚠️ المركب غير موجود');
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
            loadAllData();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الحذف'));
        }
    })
    .catch(err => {
        console.error('Delete error:', err);
        alert('❌ خطأ في الحذف');
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
}

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
    
    // ===== بطاقات الإحصائيات =====
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
    
    // ===== دالة لإنشاء جدول نجاعة =====
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
    
    // ===== الجدول العام =====
    const generalContainer = document.getElementById('generalEffTableContainer');
    if (generalContainer) {
        generalContainer.innerHTML = createEfficiencyTable(vessels, 'النجاعة العامة حسب الفئات', 'fa-ship');
    }
    
    // ===== جداول الأقاليم =====
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

function loadTickets() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/tickets', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allTickets = data || [];
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
        allNotes = data || [];
        const container = document.getElementById('notesListContainer');
        if (!container) return;
        
        if (!allNotes || allNotes.length === 0) {
            container.innerHTML = '<p style="color:#6c757d;">🚫 لا توجد مذكرات</p>';
            return;
        }
        
        container.innerHTML = allNotes.map(n => `
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

function addUser() {
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    const name = document.getElementById('un')?.value.trim();
    const password = document.getElementById('up')?.value.trim();
    const role = document.getElementById('ur')?.value;
    
    if (!name || !password) {
        alert('⚠️ الرجاء إدخال اسم المستخدم وكلمة المرور');
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
            alert('✅ تم إضافة المستخدم بنجاح');
            document.getElementById('un').value = '';
            document.getElementById('up').value = '';
            document.getElementById('ur').value = 'مشاهد';
            loadUsers();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الإضافة'));
        }
    })
    .catch(err => {
        console.error('Add user error:', err);
        alert('❌ خطأ في إضافة المستخدم');
    });
}

function deleteUser(id) {
    if (!confirm('⚠️ هل أنت متأكد من حذف هذا المستخدم؟')) return;
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    fetch('/api/users/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم حذف المستخدم');
            loadUsers();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الحذف'));
        }
    })
    .catch(err => {
        console.error('Delete user error:', err);
        alert('❌ خطأ في حذف المستخدم');
    });
}

function toggleUserStatus(id) {
    const user = allUsers.find(u => u.id === id);
    if (!user) return;
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
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
            alert('✅ تم تحديث حالة المستخدم');
            loadUsers();
        } else {
            alert('❌ ' + (data.error || 'خطأ في التحديث'));
        }
    })
    .catch(err => {
        console.error('Toggle user status error:', err);
        alert('❌ خطأ في تحديث حالة المستخدم');
    });
}

function changeUserPassword(id, name) {
    const newPassword = prompt(`🔑 تغيير كلمة المرور لـ: ${name}\nأدخل كلمة المرور الجديدة (6 أحرف على الأقل):`);
    if (!newPassword || newPassword.length < 6) {
        alert('⚠️ كلمة المرور يجب أن تكون 6 أحرف على الأقل');
        return;
    }
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
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
            alert('✅ تم تغيير كلمة المرور بنجاح');
        } else {
            alert('❌ ' + (data.error || 'خطأ في التغيير'));
        }
    })
    .catch(err => {
        console.error('Change password error:', err);
        alert('❌ خطأ في تغيير كلمة المرور');
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

function initMap() {
    console.log('🗺️ Map initialized');
}

function startTracking() {
    alert('📍 بدء التتبع المباشر');
}

function stopTracking() {
    alert('⏹️ إيقاف التتبع');
}

function loadLocations() {
    alert('📍 تحميل المواقع');
}

function centerMapOnUser() {
    alert('📍 التمركز على موقعك');
}

function toggleNotifications() {
    alert('🔔 الإشعارات: لا توجد إشعارات جديدة');
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
            break;
    }
}

function refreshAllPages() {
    loadAllData();
    alert('✅ تم تحديث جميع البيانات');
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
window.completeMaintenance = completeMaintenance;
window.cancelMaintenance = cancelMaintenance;
window.deleteMaintenance = deleteMaintenance;
window.viewVesselMaintenance = viewVesselMaintenance;
window.loadMaintenance = loadMaintenance;
window.addPart = addPart;
window.removePart = removePart;

console.log('✅ جميع الدوال جاهزة');

document.addEventListener('DOMContentLoaded', function() {
    if (localStorage.getItem('token')) {
        loadAllData();
    }
});
