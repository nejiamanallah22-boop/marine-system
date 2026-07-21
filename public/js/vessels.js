// ============================================================
// 🚢 vessels.js - إدارة المراكب
// ============================================================

// ============================================================
// 🚢 دوال المراكب
// ============================================================

function addItem() {
  const data = {
    name: document.getElementById('iName')?.value,
    num: document.getElementById('iNum')?.value,
    len: parseFloat(document.getElementById('iLen')?.value) || 0,
    reg: document.getElementById('iReg')?.value,
    zone: document.getElementById('iZone')?.value,
    port: document.getElementById('iPort')?.value,
    supp: document.getElementById('iSupp')?.value,
    stat: document.getElementById('iStat')?.value,
    break: document.getElementById('iBreak')?.value,
    fDate: document.getElementById('iDate')?.value,
    eDate: document.getElementById('iEnd')?.value,
    ref: document.getElementById('iRef')?.value
  };
  
  if (!data.name) {
    showNotification('⚠️ الرجاء إدخال اسم المركب', 'warning');
    return;
  }
  
  const token = getToken();
  if (!token) {
    showNotification('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
    return;
  }
  
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

function deleteVessel(id) {
  if (!confirm('⚠️ هل أنت متأكد من حذف هذا المركب؟')) return;
  
  const token = getToken();
  if (!token) {
    showNotification('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
    return;
  }
  
  fetch('/api/vessels/' + id, {
    method: 'DELETE',
    headers: {
      'Authorization': 'Bearer ' + token
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

function editVessel(id) {
  const vessel = allVessels.find(v => v._id === id);
  if (!vessel) {
    showNotification('⚠️ المركب غير موجود', 'warning');
    return;
  }
  
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
  
  const saveBtn = document.querySelector('#inputArea .btn-success');
  if (saveBtn) {
    saveBtn.textContent = '✏️ تحديث';
    saveBtn.onclick = function() {
      updateVessel(id);
    };
  }
  
  showNotification('✏️ قم بتعديل البيانات ثم اضغط تحديث', 'info');
}

function updateVessel(id) {
  const data = {
    name: document.getElementById('iName')?.value,
    num: document.getElementById('iNum')?.value,
    len: parseFloat(document.getElementById('iLen')?.value) || 0,
    reg: document.getElementById('iReg')?.value,
    zone: document.getElementById('iZone')?.value,
    port: document.getElementById('iPort')?.value,
    supp: document.getElementById('iSupp')?.value,
    stat: document.getElementById('iStat')?.value,
    break: document.getElementById('iBreak')?.value,
    fDate: document.getElementById('iDate')?.value,
    eDate: document.getElementById('iEnd')?.value,
    ref: document.getElementById('iRef')?.value
  };
  
  const token = getToken();
  if (!token) {
    showNotification('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
    return;
  }
  
  fetch('/api/vessels/' + id, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
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
      const saveBtn = document.querySelector('#inputArea .btn-success');
      if (saveBtn) {
        saveBtn.textContent = '💾 حفظ';
        saveBtn.onclick = addItem;
      }
    }
  })
  .catch(err => {
    console.error('Update vessel error:', err);
    showNotification('❌ خطأ في تحديث المركب', 'error');
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
  
  const saveBtn = document.querySelector('#inputArea .btn-success');
  if (saveBtn) {
    saveBtn.textContent = '💾 حفظ';
    saveBtn.onclick = addItem;
  }
}

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
// 🔄 تصدير للاستخدام العالمي
// ============================================================

window.addItem = addItem;
window.deleteVessel = deleteVessel;
window.editVessel = editVessel;
window.updateVessel = updateVessel;
window.clearInputs = clearInputs;
window.updateZones = updateZones;
