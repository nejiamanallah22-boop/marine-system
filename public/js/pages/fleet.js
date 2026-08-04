// ============================================================
// الأسطول - fleet.js
// ============================================================

function loadVessels() {
    const token = getToken();
    if (token && token.startsWith('demo-token')) {
        allVessels = getDemoVessels();
        renderAllTables();
        return;
    }
    
    if (!token) {
        allVessels = getDemoVessels();
        renderAllTables();
        return;
    }
    
    fetch('/api/vessels', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => {
        if (!res.ok) throw new Error('فشل تحميل المراكب');
        return res.json();
    })
    .then(data => {
        allVessels = data || [];
        console.log('✅ Vessels loaded:', allVessels.length);
        renderAllTables();
    })
    .catch(err => {
        console.error('Load vessels error:', err);
        allVessels = getDemoVessels();
        renderAllTables();
    });
}

function renderMainTable() {
    const tbody = document.getElementById('mainBody');
    if (!tbody) return;
    if (!allVessels || allVessels.length === 0) {
        tbody.innerHTML = `<tr><td colspan="15" style="text-align:center; padding:30px; color:rgba(255,255,255,0.2);">🚫 لا توجد بيانات</td></tr>`;
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
            <td style="color:${v.stat === 'صالح' ? '#4ade80' : v.stat === 'معطب' ? '#f87171' : '#fbbf24'}">${v.stat || 'صالح'}</td>
            <td>${v.break || '-'}</td>
            <td>${v.fDate || '-'}</td>
            <td>${v.eDate || '-'}</td>
            <td>${v.ref || '-'}</td>
            <td>${v.repairer || '-'}</td>
            <td>
                <button class="btn-sm btn-warning" onclick="editVessel('${v.id}')">✏️</button>
                <button class="btn-sm btn-danger" onclick="deleteVessel('${v.id}')">🗑️</button>
            </td>
        </tr>
    `).join('');
}

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
    console.log('✏️ Editing vessel with ID:', id);
    const vessel = allVessels.find(v => v.id === id);
    if (!vessel) {
        showAlert('⚠️ المركب غير موجود', 'warning');
        return;
    }
    
    const elements = {
        iName: document.getElementById('iName'),
        iNum: document.getElementById('iNum'),
        iLen: document.getElementById('iLen'),
        iReg: document.getElementById('iReg'),
        iZone: document.getElementById('iZone'),
        iPort: document.getElementById('iPort'),
        iSupp: document.getElementById('iSupp'),
        iStat: document.getElementById('iStat'),
        iBreak: document.getElementById('iBreak'),
        iDate: document.getElementById('iDate'),
        iEnd: document.getElementById('iEnd'),
        iRef: document.getElementById('iRef'),
        iRepairer: document.getElementById('iRepairer')
    };
    
    let missingElements = [];
    Object.keys(elements).forEach(key => {
        if (!elements[key]) missingElements.push(key);
    });
    
    if (missingElements.length > 0) {
        console.error('❌ عناصر مفقودة:', missingElements);
        showAlert('⚠️ تأكد من وجود جميع حقول المركب', 'warning');
        return;
    }
    
    editingVesselId = vessel.id;
    elements.iName.value = vessel.name || '';
    elements.iNum.value = vessel.num || '';
    elements.iLen.value = vessel.len || 0;
    elements.iReg.value = vessel.reg || '';
    elements.iZone.value = vessel.zone || '';
    elements.iPort.value = vessel.port || '';
    elements.iSupp.value = vessel.supp || '';
    elements.iStat.value = vessel.stat || 'صالح';
    elements.iBreak.value = vessel.break || '';
    elements.iDate.value = vessel.fDate || '';
    elements.iEnd.value = vessel.eDate || '';
    elements.iRef.value = vessel.ref || '';
    elements.iRepairer.value = vessel.repairer || '';
    
    const form = document.querySelector('.fleet-form');
    if (form) {
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        form.style.border = '2px solid #fbbf24';
        form.style.boxShadow = '0 0 20px rgba(251,191,36,0.3)';
        setTimeout(() => {
            form.style.border = '1px solid rgba(255,255,255,0.1)';
            form.style.boxShadow = 'none';
        }, 3000);
    }
    
    showAlert('✏️ جارٍ تعديل المركب: ' + vessel.name, 'info');
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
    editingVesselId = null;
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

function getDemoVessels() {
    return [
        { id: 1, name: 'البروق 1', num: 'B001', len: 25, cat: 'البروق', reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: 'الوحدة 1', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-001', repairer: 'فني 1' },
        { id: 2, name: 'البروق 2', num: 'B002', len: 25, cat: 'البروق', reg: 'الشمال', zone: 'طبرقة', port: 'طبرقة', supp: 'الوحدة 1', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-002', repairer: 'فني 1' },
        { id: 3, name: 'البروق 3', num: 'B003', len: 25, cat: 'البروق', reg: 'الساحل', zone: 'سوسة', port: 'سوسة', supp: 'الوحدة 2', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-003', repairer: 'فني 2' },
        { id: 4, name: 'البروق 4', num: 'B004', len: 25, cat: 'البروق', reg: 'الساحل', zone: 'المنستير', port: 'المنستير', supp: 'الوحدة 2', stat: 'معطب', break: 'عطل محرك', fDate: '2026-01-15', eDate: '2026-12-31', ref: 'REF-004', repairer: 'فني 2' },
        { id: 5, name: 'البروق 5', num: 'B005', len: 25, cat: 'البروق', reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: 'الوحدة 3', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-005', repairer: 'فني 3' }
    ];
}

console.log('✅ fleet.js loaded');
