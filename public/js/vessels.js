// ============================================================
// ===== الأسطول والصيانة =====
// ============================================================

let fleetData = [];
let maintData = [];

async function loadVessels() {
    try {
        fleetData = await getVessels();
        maintData = fleetData.filter(f => f.stat === 'صيانة' || f.stat === 'معطب');
        renderMain();
        renderMaint();
        renderEff();
        updateStats(fleetData);
    } catch (error) {
        showToast('❌ خطأ في تحميل الأسطول: ' + error.message, 'error');
    }
}

function updateZones() {
    const reg = document.getElementById('iReg').value;
    const zoneSelect = document.getElementById('iZone');
    zoneSelect.innerHTML = '<option value="">📍 المنطقة</option>';
    
    const zones = {
        'تونس': ['تونس', 'بنزرت', 'نابل'],
        'المنستير': ['المنستير', 'المهدية'],
        'صفاقس': ['صفاقس', 'قابس'],
        'جرجيس': ['جرجيس', 'مدنين'],
        'المجمع الأمني بقبيبة': ['قبيبة', 'تونس']
    };
    
    if (zones[reg]) {
        zones[reg].forEach(z => {
            const opt = document.createElement('option');
            opt.value = z;
            opt.textContent = z;
            zoneSelect.appendChild(opt);
        });
    }
}

async function addItem() {
    const name = document.getElementById('iName').value.trim();
    const num = document.getElementById('iNum').value.trim();
    
    if (!name || !num) {
        showToast('❌ الرجاء إدخال اسم المركب والرقم', 'warning');
        return;
    }
    
    const len = parseFloat(document.getElementById('iLen').value) || 0;
    let cat = 'زوارق مزدوجة';
    if (len === 11) cat = 'البروق';
    else if (len >= 8 && len <= 12) cat = 'صقور';
    else if (len > 12 && len <= 25) cat = 'خوافر';
    else if (len > 30) cat = 'طوافات';
    
    const data = {
        name,
        num,
        len,
        cat,
        reg: document.getElementById('iReg').value || 'غير محدد',
        zone: document.getElementById('iZone').value || 'غير محدد',
        port: document.getElementById('iPort').value.trim() || 'غير محدد',
        supp: document.getElementById('iSupp').value.trim() || '-',
        stat: document.getElementById('iStat').value,
        break: document.getElementById('iBreak').value.trim() || '-',
        fDate: document.getElementById('iDate').value || new Date().toISOString().split('T')[0],
        eDate: document.getElementById('iEnd').value || '-',
        ref: document.getElementById('iRef').value.trim() || '-'
    };
    
    try {
        await addVessel(data);
        await loadVessels();
        clearForm();
        showToast('✅ تم إضافة ' + name, 'success');
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
    }
}

function clearForm() {
    ['iName', 'iNum', 'iLen', 'iPort', 'iSupp', 'iBreak', 'iRef'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('iReg').value = '';
    document.getElementById('iZone').innerHTML = '<option value="">📍 المنطقة</option>';
    document.getElementById('iStat').value = 'صالح';
    document.getElementById('iDate').value = '';
    document.getElementById('iEnd').value = '';
}

function renderMain() {
    const tbody = document.getElementById('mainBody');
    const search = document.getElementById('searchMain').value.toLowerCase();
    const catFilter = document.getElementById('fCatMain').value;
    const regFilter = document.getElementById('fRegMain').value;
    
    let filtered = fleetData;
    if (search) filtered = filtered.filter(f => f.name?.toLowerCase().includes(search) || f.num?.toLowerCase().includes(search));
    if (catFilter !== 'الكل') filtered = filtered.filter(f => f.cat === catFilter);
    if (regFilter !== 'الكل') filtered = filtered.filter(f => f.reg === regFilter);
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="13" style="text-align:center; padding:30px; color:var(--gray-500);">لا توجد وسائل بحرية</td></tr>`;
        return;
    }
    
    let html = '';
    filtered.forEach(item => {
        const cls = item.stat === 'صالح' ? 'status-صالح' : item.stat === 'معطب' ? 'status-معطب' : 'status-صيانة';
        html += `
            <tr>
                <td><strong>${item.name || '-'}</strong></td>
                <td>${item.num || '-'}</td>
                <td>${item.len || 0} م</td>
                <td>${item.cat || '-'}</td>
                <td>${item.reg || '-'}</td>
                <td>${item.zone || '-'}</td>
                <td>${item.port || '-'}</td>
                <td>${item.supp || '-'}</td>
                <td><span class="${cls}">${item.stat || '-'}</span></td>
                <td>${item.break || '-'}</td>
                <td>${item.fDate || '-'}</td>
                <td>${item.eDate || '-'}</td>
                <td>
                    <div class="table-actions-group">
                        <button class="btn btn-sm btn-primary" onclick="editItem('${item._id}')"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="deleteItem('${item._id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

async function editItem(id) {
    const item = fleetData.find(f => f._id === id);
    if (!item) return;
    
    document.getElementById('iName').value = item.name || '';
    document.getElementById('iNum').value = item.num || '';
    document.getElementById('iLen').value = item.len || 0;
    document.getElementById('iReg').value = item.reg || '';
    updateZones();
    setTimeout(() => document.getElementById('iZone').value = item.zone || '', 100);
    document.getElementById('iPort').value = item.port || '';
    document.getElementById('iSupp').value = item.supp || '';
    document.getElementById('iStat').value = item.stat || 'صالح';
    document.getElementById('iBreak').value = item.break || '';
    document.getElementById('iDate').value = item.fDate || '';
    document.getElementById('iEnd').value = item.eDate || '';
    document.getElementById('iRef').value = item.ref || '';
    
    try {
        await deleteVessel(id);
        await loadVessels();
        showToast('✏️ جارٍ تعديل: ' + item.name, 'info');
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
    }
}

async function deleteItem(id) {
    const result = await Swal.fire({
        title: '⚠️ تأكيد الحذف',
        text: 'هل أنت متأكد من حذف هذه الوسيلة؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#ef4444'
    });
    
    if (result.isConfirmed) {
        try {
            await deleteVessel(id);
            await loadVessels();
            showToast('🗑️ تم الحذف بنجاح', 'success');
        } catch (error) {
            showToast('❌ ' + error.message, 'error');
        }
    }
}

function clearMainSearch() {
    document.getElementById('searchMain').value = '';
    document.getElementById('fCatMain').value = 'الكل';
    document.getElementById('fRegMain').value = 'الكل';
    renderMain();
}

function renderMaint() {
    const tbody = document.getElementById('maintBody');
    const search = document.getElementById('searchMaint').value.toLowerCase();
    const regFilter = document.getElementById('fRegMaint').value;
    const dateStart = document.getElementById('fDateStart').value;
    const dateEnd = document.getElementById('fDateEnd').value;
    
    let filtered = maintData;
    if (search) filtered = filtered.filter(m => m.name?.toLowerCase().includes(search) || m.num?.toLowerCase().includes(search));
    if (regFilter !== 'الكل') filtered = filtered.filter(m => m.reg === regFilter);
    if (dateStart) filtered = filtered.filter(m => m.fDate >= dateStart);
    if (dateEnd) filtered = filtered.filter(m => m.fDate <= dateEnd);
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:var(--gray-500);">لا توجد سجلات صيانة</td></tr>`;
        return;
    }
    
    let html = '';
    filtered.forEach(item => {
        const cls = item.stat === 'صالح' ? 'status-صالح' : item.stat === 'معطب' ? 'status-معطب' : 'status-صيانة';
        html += `
            <tr>
                <td><strong>${item.name || '-'}</strong></td>
                <td>${item.num || '-'}</td>
                <td>${item.reg || '-'}</td>
                <td>${item.zone || '-'}</td>
                <td><span class="${cls}">${item.stat || '-'}</span></td>
                <td>${item.break || '-'}</td>
                <td>${item.fDate || '-'}</td>
                <td>${item.eDate || '-'}</td>
                <td>${item.ref || '-'}</td>
                <td>
                    <div class="table-actions-group">
                        <button class="btn btn-sm btn-success" onclick="completeMaint('${item._id}')"><i class="fas fa-check"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="deleteMaint('${item._id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

async function completeMaint(id) {
    const item = maintData.find(m => m._id === id);
    if (!item) return;
    
    const result = await Swal.fire({
        title: '✅ إنهاء الصيانة',
        text: `هل تريد إنهاء صيانة "${item.name}"؟`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'نعم، إنهاء',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#22c55e'
    });
    
    if (result.isConfirmed) {
        try {
            const fleetItem = fleetData.find(f => f.num === item.num);
            if (fleetItem) {
                fleetItem.stat = 'صالح';
                fleetItem.break = '-';
                await updateVessel(fleetItem._id, fleetItem);
            }
            await loadVessels();
            showToast(`✅ تم إنهاء صيانة ${item.name}`, 'success');
        } catch (error) {
            showToast('❌ ' + error.message, 'error');
        }
    }
}

async function deleteMaint(id) {
    const result = await Swal.fire({
        title: '⚠️ تأكيد الحذف',
        text: 'هل أنت متأكد من حذف سجل الصيانة؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#ef4444'
    });
    
    if (result.isConfirmed) {
        maintData = maintData.filter(m => m._id !== id);
        renderMaint();
        showToast('🗑️ تم الحذف بنجاح', 'success');
    }
}

function resetMaintFilters() {
    document.getElementById('searchMaint').value = '';
    document.getElementById('fRegMaint').value = 'الكل';
    document.getElementById('fDateStart').value = '';
    document.getElementById('fDateEnd').value = '';
    renderMaint();
}
