// ============================================================
// الصيانة - maintenance.js
// ============================================================

function loadMaintenance() {
    const token = getToken();
    if (token && token.startsWith('demo-token')) {
        allMaintenance = getDemoMaintenance();
        renderMaintenanceTables();
        updateYearFilter();
        return;
    }
    
    if (!token) {
        allMaintenance = getDemoMaintenance();
        renderMaintenanceTables();
        updateYearFilter();
        return;
    }
    
    fetch('/api/maintenance', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => {
        if (!res.ok) throw new Error('فشل تحميل الصيانة');
        return res.json();
    })
    .then(data => {
        allMaintenance = data || [];
        console.log('✅ Maintenance loaded:', allMaintenance.length);
        renderMaintenanceTables();
        updateYearFilter();
    })
    .catch(err => {
        console.error('Load maintenance error:', err);
        allMaintenance = getDemoMaintenance();
        renderMaintenanceTables();
        updateYearFilter();
    });
}

function renderMaintenanceTables() {
    renderGeneralMaintenance();
    renderHistoryMaintenance();
    updateMaintenanceStats();
    renderMaintenanceUnits();
}

function updateMaintenanceVessels() {
    const select = document.getElementById('mVesselId');
    if (!select) return;
    select.innerHTML = '<option value="">اختر المركب</option>';
    allVessels.forEach(v => {
        select.innerHTML += `<option value="${v.id}">${v.name} (${v.num || 'بدون رقم'})</option>`;
    });
}

function toggleMaintenanceForm() {
    const form = document.getElementById('maintenanceForm');
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function addPart() {
    const container = document.getElementById('partsContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'part-item';
    div.innerHTML = `
        <input type="text" placeholder="اسم القطعة" class="part-name" style="flex:2; padding:6px; border-radius:4px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.02); color:white;">
        <input type="number" placeholder="الكمية" class="part-qty" style="width:60px; padding:6px; border-radius:4px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.02); color:white;">
        <input type="number" placeholder="السعر" class="part-price" style="width:60px; padding:6px; border-radius:4px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.02); color:white;">
        <button onclick="removePart(this)" style="padding:4px 10px; background:rgba(248,113,113,0.15); color:#f87171; border:1px solid rgba(248,113,113,0.1); border-radius:4px; cursor:pointer;">✕</button>
    `;
    container.appendChild(div);
}

function removePart(btn) {
    const container = document.getElementById('partsContainer');
    if (container && container.children.length > 1) {
        btn.parentElement.remove();
    }
}

function getPartsData() {
    const parts = [];
    document.querySelectorAll('.part-item').forEach(item => {
        const name = item.querySelector('.part-name')?.value;
        const qty = parseFloat(item.querySelector('.part-qty')?.value) || 0;
        const price = parseFloat(item.querySelector('.part-price')?.value) || 0;
        if (name) parts.push({ name, quantity: qty, price });
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
    const repair = document.getElementById('mRepair')?.value.trim();
    const faultType = document.getElementById('mFaultType')?.value;
    const startDate = document.getElementById('mStartDate')?.value;
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
    
    const vessel = allVessels.find(v => v.id == vesselId);
    if (vessel && vessel.stat === 'صالح') {
        fetch('/api/vessels/' + vesselId, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ 
                stat: 'معطب',
                break: description,
                fDate: startDate || new Date().toISOString().split('T')[0]
            })
        }).catch(err => console.error('Error updating vessel status:', err));
    }
    
    const data = {
        vesselId: parseFloat(vesselId),
        vesselName: vessel ? vessel.name : '',
        type: type || 'عادية',
        unit: unit || 'غير محدد',
        technician: technician,
        description: description,
        repair: repair || '',
        faultType: faultType || 'أخرى',
        cost: cost,
        notes: notes || '',
        parts: parts,
        status: 'قيد الإنجاز',
        date: new Date().toISOString().split('T')[0],
        startDate: startDate || new Date().toISOString().split('T')[0],
        endDate: null,
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
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#4ade80;">✅ لا توجد مراكب معطبة</div>';
        return;
    }
    let html = '<div class="scrollable-table"><table><thead><tr><th>المركب</th><th>الفئة</th><th>الحالة</th><th>العطل</th><th>المسؤول</th><th>إجراءات</th></tr></thead><tbody>';
    vessels.forEach(v => {
        html += `<tr>
            <td><strong>${v.name}</strong></td>
            <td>${v.cat || '-'}</td>
            <td><span class="status-badge status-broken">${v.stat}</span></td>
            <td>${v.break || '-'}</td>
            <td>${v.repairer || '-'}</td>
            <td>
                <button class="btn-sm btn-primary" onclick="openMaintenanceFile(${v.id})">📂 فتح</button>
                <button class="btn-sm btn-success" onclick="fixVessel(${v.id})">✅ إصلاح</button>
            </td>
        </tr>`;
    });
    html += '</tbody></table></div>';
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

function openMaintenanceFile(vesselId) {
    const vessel = allVessels.find(v => v.id === vesselId);
    if (!vessel) return;
    showAlert(`📂 فتح ملف المركب: ${vessel.name}`, 'info');
}

function renderHistoryMaintenance() {
    const container = document.getElementById('historyMaintenanceContainer');
    if (!container) return;
    const records = allMaintenance.filter(r => r.status === 'مكتملة' || r.status === 'ملغية');
    if (records.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.2);">🚫 لا توجد سجلات</div>';
        return;
    }
    let html = '<div class="scrollable-table"><table><thead><tr><th>التاريخ</th><th>المركب</th><th>نوع الصيانة</th><th>العطل</th><th>التكلفة</th><th>الحالة</th></tr></thead><tbody>';
    records.slice().reverse().forEach(r => {
        const vesselName = r.vesselName || allVessels.find(v => v.id === r.vesselId)?.name || '-';
        html += `<tr>
            <td>${r.date || '-'}</td>
            <td><strong>${vesselName}</strong></td>
            <td>${r.type || '-'}</td>
            <td>${r.description || '-'}</td>
            <td>${r.cost ? r.cost + ' د.ت' : '-'}</td>
            <td><span class="status-badge status-closed">✅ ${r.status}</span></td>
        </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function updateYearFilter() {
    const select = document.getElementById('filterYear');
    if (!select) return;
    const years = new Set();
    allMaintenance.forEach(r => { if (r.date) years.add(r.date.split('-')[0]); });
    select.innerHTML = '<option value="">الكل</option>';
    Array.from(years).sort().reverse().forEach(year => {
        select.innerHTML += `<option value="${year}">${year}</option>`;
    });
}

function applyHistoryFilters() { renderHistoryMaintenance(); }
function resetHistoryFilters() { renderHistoryMaintenance(); showAlert('✅ تم إلغاء الفلترة', 'success'); }

function updateMaintenanceStats() {
    const container = document.getElementById('maintenanceStats');
    if (!container) return;
    container.innerHTML = `
        <div class="maintenance-stats">
            <div class="stat-box stat-total"><h4>${allMaintenance.length}</h4><p>📊 المجموع</p></div>
            <div class="stat-box stat-progress"><h4>${allMaintenance.filter(r => r.status === 'قيد الإنجاز').length}</h4><p>🔄 قيد الإنجاز</p></div>
            <div class="stat-box stat-completed"><h4>${allMaintenance.filter(r => r.status === 'مكتملة').length}</h4><p>✅ مكتملة</p></div>
            <div class="stat-box stat-cancelled"><h4>${allMaintenance.filter(r => r.status === 'ملغية').length}</h4><p>❌ ملغية</p></div>
        </div>
    `;
}

function renderMaintenanceUnits() {
    const container = document.getElementById('maintenanceUnitsContainer');
    if (!container) return;
    const units = ['وحدة الصيانة والإسناد البحري تونس', 'وحدة الصيانة والإسناد البحري صفاقس', 'وحدة الصيانة والإسناد البحري المنستير', 'وحدة الصيانة والإسناد البحري جرجيس', 'شركة خاصة'];
    let html = '';
    units.forEach(unit => {
        const records = allMaintenance.filter(r => r.unit === unit);
        html += `
            <div class="region-table-card">
                <div class="region-table-header">🏭 ${unit} <span style="font-size:12px; color:rgba(255,255,255,0.3);">📊 ${records.length} سجل</span></div>
                ${records.length === 0 ? '<div style="text-align:center; padding:10px; color:rgba(255,255,255,0.2);">🚫 لا توجد سجلات</div>' :
                `<div class="scrollable-table"><table><thead><tr><th>المركب</th><th>الفني</th><th>التكلفة</th><th>الحالة</th></tr></thead><tbody>
                ${records.slice().reverse().map(r => `
                    <tr><td>${r.vesselName || '-'}</td><td>${r.technician || '-'}</td><td>${r.cost ? r.cost + ' د.ت' : '-'}</td><td>${r.status || '-'}</td></tr>
                `).join('')}</tbody></table></div>`}
            </div>
        `;
    });
    container.innerHTML = html;
}

function getDemoMaintenance() {
    return [
        {
            id: 1,
            vesselId: 4,
            vesselName: 'البروق 4',
            type: 'كبرى',
            unit: 'وحدة الصيانة والإسناد البحري تونس',
            technician: 'فني 1',
            description: 'عطل في المحرك الرئيسي',
            repair: 'تم تغيير طلمبة الزيت والمضخة',
            faultType: 'محرك',
            cost: 4500,
            notes: 'تم تغيير طلمبة الزيت والمضخة بالكامل',
            status: 'مكتملة',
            date: '2026-01-20',
            startDate: '2026-01-15',
            endDate: '2026-01-20',
            parts: [{ name: 'طلمبة زيت', quantity: 1, price: 1200 }, { name: 'مضخة ماء', quantity: 1, price: 800 }],
            createdBy: 'Admin'
        }
    ];
}

console.log('✅ maintenance.js loaded');
