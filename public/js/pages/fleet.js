// public/js/pages/fleet.js
// دوال صفحة الأسطول

let editingVesselId = null;

function initFleet() {
    loadVessels();
}

function renderFleet() {
    const tbody = document.getElementById('fleetBody');
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

function addVessel() {
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
            clearFleetInputs();
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

function clearFleetInputs() {
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

function filterFleet() {
    const search = document.getElementById('searchFleet')?.value?.toLowerCase() || '';
    const rows = document.querySelectorAll('#fleetBody tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(search) ? '' : 'none';
    });
}

// تصدير الدوال
window.addVessel = addVessel;
window.editVessel = editVessel;
window.deleteVessel = deleteVessel;
window.updateZones = updateZones;
window.filterFleet = filterFleet;
window.initFleet = initFleet;
window.renderFleet = renderFleet;
