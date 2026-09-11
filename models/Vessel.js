// ============================================================
// 🚢 vessels.js - إدارة المراكب (v2.0 — متوافق مع server v9.11)
// ============================================================

// ============================================================
// ➕ إضافة مركب جديد
// ============================================================

function addItem() {
    const data = {
        name: document.getElementById('iName')?.value,
        num: document.getElementById('iNum')?.value,
        len: parseFloat(document.getElementById('iLen')?.value) || 0,
        region: document.getElementById('iReg')?.value,        // ✅ region
        zone: document.getElementById('iZone')?.value,
        port: document.getElementById('iPort')?.value,
        supp: document.getElementById('iSupp')?.value,
        status: document.getElementById('iStat')?.value,        // ✅ status
        break: document.getElementById('iBreak')?.value,
        fDate: document.getElementById('iDate')?.value,
        eDate: document.getElementById('iEnd')?.value,
        ref: document.getElementById('iRef')?.value,
        cat: document.getElementById('iCat')?.value,            // ✅ cat (إن وُجد)
        repairUnit: document.getElementById('iRepairUnit')?.value  // ✅ repairUnit (إن وُجد)
    };
    
    if (!data.name) {
        showNotification('⚠️ الرجاء إدخال اسم المركب', 'warning');
        return;
    }
    
    const token = getToken();
    const csrf = getCsrfToken();
    if (!token) {
        showNotification('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    fetch('/api/vessels', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'X-CSRF-Token': csrf                        // ✅ CSRF
        },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showNotification('❌ ' + data.error, 'error');
        } else {
            showNotification('✅ تم إضافة المركب بنجاح', 'success');
            clearInputs();
            loadVessels();
        }
    })
    .catch(err => {
        console.error('Add vessel error:', err);
        showNotification('❌ خطأ في إضافة المركب', 'error');
    });
}

// ============================================================
// 🗑️ حذف مركب
// ============================================================

function deleteVessel(id) {
    if (!confirm('⚠️ هل أنت متأكد من حذف هذا المركب؟')) return;
    
    const token = getToken();
    const csrf = getCsrfToken();
    if (!token) {
        showNotification('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    fetch('/api/vessels/' + id, {
        method: 'DELETE',
        headers: {
            'Authorization': 'Bearer ' + token,
            'X-CSRF-Token': csrf
        }
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showNotification('❌ ' + data.error, 'error');
        } else {
            showNotification('✅ تم حذف المركب بنجاح', 'success');
            loadVessels();
        }
    })
    .catch(err => {
        console.error('Delete vessel error:', err);
        showNotification('❌ خطأ في حذف المركب', 'error');
    });
}

// ============================================================
// ✏️ تعديل مركب
// ============================================================

function editVessel(id) {
    const vessel = allVessels.find(v => v._id === id || v.id === id);
    if (!vessel) {
        showNotification('⚠️ المركب غير موجود', 'warning');
        return;
    }
    
    // ✅ استخدم أسماء السيرفر
    document.getElementById('iName').value = vessel.name || '';
    document.getElementById('iNum').value = vessel.num || '';
    document.getElementById('iLen').value = vessel.len || 0;
    document.getElementById('iReg').value = vessel.region || '';     // ✅
    document.getElementById('iZone').value = vessel.zone || '';
    document.getElementById('iPort').value = vessel.port || '';
    document.getElementById('iSupp').value = vessel.supp || '';
    document.getElementById('iStat').value = vessel.status || 'صالح'; // ✅
    document.getElementById('iBreak').value = vessel.break || '';
    document.getElementById('iDate').value = vessel.fDate || '';
    document.getElementById('iEnd').value = vessel.eDate || '';
    document.getElementById('iRef').value = vessel.ref || '';
    
    // إن وُجدت حقول إضافية
    const catEl = document.getElementById('iCat');
    if (catEl) catEl.value = vessel.cat || '';
    
    const repairUnitEl = document.getElementById('iRepairUnit');
    if (repairUnitEl) repairUnitEl.value = vessel.repairUnit || '';
    
    const saveBtn = document.querySelector('#inputArea .btn-success');
    if (saveBtn) {
        saveBtn.textContent = '✏️ تحديث';
        saveBtn.onclick = function() {
            updateVessel(vessel.id);   // ✅ استخدم id وليس _id
        };
    }
    
    showNotification('✏️ قم بتعديل البيانات ثم اضغط تحديث', 'info');
}

// ============================================================
// 💾 تحديث مركب
// ============================================================

function updateVessel(id) {
    const data = {
        name: document.getElementById('iName')?.value,
        num: document.getElementById('iNum')?.value,
        len: parseFloat(document.getElementById('iLen')?.value) || 0,
        region: document.getElementById('iReg')?.value,           // ✅
        zone: document.getElementById('iZone')?.value,
        port: document.getElementById('iPort')?.value,
        supp: document.getElementById('iSupp')?.value,
        status: document.getElementById('iStat')?.value,           // ✅
        break: document.getElementById('iBreak')?.value,
        fDate: document.getElementById('iDate')?.value,
        eDate: document.getElementById('iEnd')?.value,
        ref: document.getElementById('iRef')?.value,
        cat: document.getElementById('iCat')?.value,
        repairUnit: document.getElementById('iRepairUnit')?.value
    };
    
    const token = getToken();
    const csrf = getCsrfToken();
    if (!token) {
        showNotification('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    fetch('/api/vessels/' + id, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'X-CSRF-Token': csrf
        },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showNotification('❌ ' + data.error, 'error');
        } else {
            showNotification('✅ تم تحديث المركب بنجاح', 'success');
            clearInputs();
            loadVessels();
        }
    })
    .catch(err => {
        console.error('Update vessel error:', err);
        showNotification('❌ خطأ في تحديث المركب', 'error');
    });
}

// ============================================================
// 🧹 تفريغ الحقول
// ============================================================

function clearInputs() {
    ['iName', 'iNum', 'iLen', 'iReg', 'iZone', 'iPort', 'iSupp', 'iBreak', 'iDate', 'iEnd', 'iRef', 'iCat', 'iRepairUnit']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    
    const statEl = document.getElementById('iStat');
    if (statEl) statEl.value = 'صالح';
    
    const saveBtn = document.querySelector('#inputArea .btn-success');
    if (saveBtn) {
        saveBtn.textContent = '💾 حفظ';
        saveBtn.onclick = addItem;
    }
}

// ============================================================
// 🌍 تحديث المناطق
// ============================================================

function updateZones() {
    const reg = document.getElementById('iReg')?.value;
    const zoneSelect = document.getElementById('iZone');
    if (!zoneSelect) return;
    
    const zones = {
        'الشمال': ['بنزرت', 'طبرقة', 'المرسى', 'لا جاليت'],
        'الساحل': ['سوسة', 'المنستير', 'المهدية'],
        'الوسط': ['صفاقس', 'قابس', 'جربة'],
        'الجنوب': ['جرجيس', 'بن قردان', 'ذهيبة'],
        'وحدة الصيانة والإسناد البحري تونس': ['تونس', 'قرطاج'],
        'وحدة الصيانة والإسناد البحري المنستير': ['المنستير', 'المهدية'],
        'وحدة الصيانة والإسناد البحري صفاقس': ['صفاقس', 'قابس'],
        'وحدة الصيانة والإسناد البحري جرجيس': ['جرجيس', 'بن قردان'],
        'المجمع الأمني بقبيبة': ['قبيبة', 'المرسى']
    };
    
    const options = zones[reg] || [];
    zoneSelect.innerHTML = '<option value="">📍 المنطقة</option>';
    options.forEach(zone => {
        zoneSelect.innerHTML += `<option value="${zone}">📍 ${zone}</option>`;
    });
}

// ============================================================
// 🔐 دوال مساعدة
// ============================================================

function getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
}

function getCsrfToken() {
    // من الكوكي
    const cookies = document.cookie.split('; ');
    const csrfCookie = cookies.find(c => c.startsWith('marine_csrf='));
    if (csrfCookie) return decodeURIComponent(csrfCookie.split('=')[1]);
    
    // أو من localStorage
    return localStorage.getItem('csrfToken') || '';
}

// ============================================================
// 🌐 تصدير عالمي
// ============================================================

window.addItem = addItem;
window.deleteVessel = deleteVessel;
window.editVessel = editVessel;
window.updateVessel = updateVessel;
window.clearInputs = clearInputs;
window.updateZones = updateZones;
