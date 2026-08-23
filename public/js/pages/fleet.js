// ============================================================
// 🚢 FLEET.JS - السجل العام للوسائل البحرية
// ============================================================

console.log('🚢 fleet.js loaded');

// ============================================================
// 1. المتغيرات العامة
// ============================================================

let allVessels = [];
let filteredVessels = [];
let currentPage = 1;
const pageSize = 10;
let editingId = null;

// ============================================================
// 2. دوال مساعدة
// ============================================================

function getToken() {
    return localStorage.getItem('marine_auth_token') || 
           localStorage.getItem('token') || 
           localStorage.getItem('marine_token');
}

function getCategory(len) {
    const n = parseFloat(len);
    if (isNaN(n)) return 'زوارق مزدوجة';
    if (n === 11) return 'البروق';
    if (n >= 8 && n <= 12) return 'صقور';
    if (n > 12 && n <= 25) return 'خوافر';
    if (n >= 30) return 'طوافات';
    return 'زوارق مزدوجة';
}

function formatDate(d) {
    if (!d) return '-';
    try { 
        var date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('ar-TN'); 
    } catch { return '-'; }
}

function escapeHTML(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}

function showToast(msg, type) {
    type = type || 'info';
    var container = document.getElementById('toastContainer');
    if (!container) return;
    var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    var t = document.createElement('div');
    t.className = 'toast toast-' + type;
    t.innerHTML = '<span>' + (icons[type] || 'ℹ️') + '</span> ' + msg;
    container.appendChild(t);
    setTimeout(function() {
        t.style.opacity = '0';
        t.style.transform = 'translateX(30px)';
        setTimeout(function() { if (t.parentNode) t.remove(); }, 300);
    }, 3000);
}

function getCurrentUser() {
    try {
        var data = localStorage.getItem('marine_user') || localStorage.getItem('currentUser');
        return data ? JSON.parse(data) : null;
    } catch { return null; }
}

function canEdit() {
    var u = getCurrentUser();
    return u && (u.role === 'مسؤول' || u.role === 'محرر' || u.role === 'admin');
}

function canDelete() {
    var u = getCurrentUser();
    return u && (u.role === 'مسؤول' || u.role === 'admin');
}

// ============================================================
// 3. تحميل البيانات
// ============================================================

function loadVessels() {
    console.log('🔄 loadVessels() called');
    
    var token = getToken();
    var tbody = document.getElementById('fleetBody');
    
    if (!token) {
        tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;padding:30px;color:#fbbf24;">⚠️ يرجى تسجيل الدخول أولاً</td></tr>';
        return;
    }

    tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;padding:30px;color:rgba(255,255,255,0.3);"><div style="font-size:24px;margin-bottom:8px;">⏳</div>جاري التحميل...</td></tr>';

    var apiBase = 'https://marine-system-71eo.onrender.com/api';
    
    console.log('📡 جلب من:', apiBase + '/vessels');

    fetch(apiBase + '/vessels', {
        headers: {
            'Authorization': 'Bearer ' + token,
            'Accept': 'application/json'
        }
    })
    .then(function(response) {
        console.log('📡 الحالة:', response.status);
        if (!response.ok) {
            if (response.status === 401) throw new Error('انتهت الجلسة');
            if (response.status === 404) throw new Error('API غير موجودة (404)');
            throw new Error('خطأ ' + response.status);
        }
        return response.json();
    })
    .then(function(data) {
        console.log('📡 البيانات:', data);
        
        allVessels = Array.isArray(data.vessels) ? data.vessels :
                     Array.isArray(data.data) ? data.data :
                     Array.isArray(data) ? data : [];
        
        console.log('✅ تم تحميل:', allVessels.length, 'مركب');
        
        filteredVessels = allVessels.slice();
        currentPage = 1;
        
        updateStats();
        renderTable();
        
        if (window.updateBadges) window.updateBadges();
        
        showToast('✅ تم تحميل ' + allVessels.length + ' مركب', 'success');
    })
    .catch(function(error) {
        console.error('❌ خطأ:', error);
        tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;padding:30px;color:#f87171;">❌ ' + escapeHTML(error.message) + '</td></tr>';
        showToast('❌ ' + error.message, 'error');
    });
}

// ============================================================
// 4. عرض الجدول
// ============================================================

function renderTable() {
    var tbody = document.getElementById('fleetBody');
    if (!tbody) return;

    var total = filteredVessels.length;
    document.getElementById('fleetCount').textContent = total + ' مركب';

    if (total === 0) {
        tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;padding:40px;color:rgba(255,255,255,0.2);">🚫 لا توجد مراكب</td></tr>';
        return;
    }

    var totalPages = Math.ceil(total / pageSize);
    var start = (currentPage - 1) * pageSize;
    var end = Math.min(start + pageSize, total);
    var pageData = filteredVessels.slice(start, end);

    document.getElementById('fleetPageInfo').textContent = 'الصفحة ' + currentPage + ' من ' + (totalPages || 1);

    var html = '';
    var edit = canEdit();
    var del = canDelete();

    pageData.forEach(function(v, i) {
        var id = v._id || v.id || i;
        var name = v.name || '-';
        var num = v.num || '-';
        var length = v.length || v.len || '-';
        var category = v.category || getCategory(length);
        var region = v.region || v.reg || '-';
        var zone = v.zone || '-';
        var port = v.port || '-';
        var supp = v.support_location || v.supp || '-';
        var status = v.status || v.stat || '-';
        var breakType = v.break_type || v.break || '-';
        var fDate = v.fault_date || v.fDate;
        var eDate = v.end_date || v.eDate;

        html += '<tr>';
        html += '<td>' + (start + i + 1) + '</td>';
        html += '<td><strong>' + escapeHTML(name) + '</strong></td>';
        html += '<td>' + escapeHTML(num) + '</td>';
        html += '<td>' + escapeHTML(length) + '</td>';
        html += '<td>' + escapeHTML(category) + '</td>';
        html += '<td>' + escapeHTML(region) + '</td>';
        html += '<td>' + escapeHTML(zone) + '</td>';
        html += '<td>' + escapeHTML(port) + '</td>';
        html += '<td>' + escapeHTML(supp) + '</td>';
        html += '<td class="status-' + escapeHTML(status) + '">' + escapeHTML(status) + '</td>';
        html += '<td>' + escapeHTML(breakType) + '</td>';
        html += '<td>' + formatDate(fDate) + '</td>';
        html += '<td>' + formatDate(eDate) + '</td>';
        html += '<td>';
        if (edit) html += '<button class="btn-icon btn-edit" onclick="editVessel(\'' + id + '\')" title="تعديل"><i class="fas fa-edit"></i></button>';
        if (del) html += '<button class="btn-icon btn-delete" onclick="deleteVessel(\'' + id + '\',\'' + escapeHTML(name) + '\')" title="حذف"><i class="fas fa-trash"></i></button>';
        html += '</td>';
        html += '</tr>';
    });

    tbody.innerHTML = html;
}

// ============================================================
// 5. الإحصائيات
// ============================================================

function updateStats() {
    var total = allVessels.length;
    var ready = allVessels.filter(function(v) { return v.status === 'صالح' || v.stat === 'صالح'; }).length;
    var maintenance = allVessels.filter(function(v) { return v.status === 'صيانة' || v.stat === 'صيانة'; }).length;
    var broken = allVessels.filter(function(v) { return v.status === 'معطب' || v.stat === 'معطب'; }).length;

    document.getElementById('totalVessels').textContent = total;
    document.getElementById('readyVessels').textContent = ready;
    document.getElementById('maintenanceVessels').textContent = maintenance;
    document.getElementById('brokenVessels').textContent = broken;
}

// ============================================================
// 6. الفلاتر
// ============================================================

function filterVessels() {
    var search = document.getElementById('searchFleet').value.toLowerCase().trim();
    var catFilter = document.getElementById('filterCategory').value;
    var regFilter = document.getElementById('filterRegion').value;
    var statFilter = document.getElementById('filterStatus').value;

    filteredVessels = allVessels.filter(function(v) {
        var match = true;
        if (search) {
            var text = [v.name, v.num, v.region || v.reg, v.zone, v.port, v.status || v.stat, v.category].filter(Boolean).join(' ').toLowerCase();
            match = text.indexOf(search) !== -1;
        }
        if (match && catFilter !== 'الكل') {
            var cat = v.category || getCategory(v.length || v.len);
            match = cat === catFilter;
        }
        if (match && regFilter !== 'الكل') {
            match = (v.region || v.reg || '') === regFilter;
        }
        if (match && statFilter !== 'الكل') {
            match = (v.status || v.stat || '') === statFilter;
        }
        return match;
    });

    currentPage = 1;
    renderTable();
}

function clearFilters() {
    document.getElementById('searchFleet').value = '';
    document.getElementById('filterCategory').value = 'الكل';
    document.getElementById('filterRegion').value = 'الكل';
    document.getElementById('filterStatus').value = 'الكل';
    filterVessels();
    showToast('🔄 تم مسح الفلاتر', 'info');
}

// ============================================================
// 7. ترقيم الصفحات
// ============================================================

function prevPage() {
    if (currentPage > 1) { currentPage--; renderTable(); }
}

function nextPage() {
    var total = Math.ceil(filteredVessels.length / pageSize);
    if (currentPage < total) { currentPage++; renderTable(); }
}

// ============================================================
// 8. فتح/إغلاق المودال
// ============================================================

function openAddModal() {
    editingId = null;
    document.getElementById('vesselModalTitle').textContent = '➕ إضافة مركب جديد';
    document.getElementById('vesselModal').style.display = 'flex';
    clearForm();
    document.getElementById('vName').focus();
}

function closeModal() {
    document.getElementById('vesselModal').style.display = 'none';
    clearForm();
    var el = document.getElementById('vesselFormMessage');
    el.className = 'form-message';
    el.textContent = '';
}

// ============================================================
// 9. تعديل مركب
// ============================================================

function editVessel(id) {
    if (!canEdit()) { showToast('⚠️ لا صلاحية', 'warning'); return; }
    var vessel = allVessels.find(function(v) { return (v._id || v.id) == id; });
    if (!vessel) { showToast('❌ غير موجود', 'error'); return; }

    editingId = id;
    document.getElementById('vesselModalTitle').textContent = '✏️ تعديل: ' + vessel.name;
    document.getElementById('vesselModal').style.display = 'flex';

    document.getElementById('vName').value = vessel.name || '';
    document.getElementById('vNum').value = vessel.num || '';
    document.getElementById('vLen').value = vessel.length || vessel.len || '';
    document.getElementById('vCategory').value = vessel.category || getCategory(vessel.length || vessel.len);
    document.getElementById('vRegion').value = vessel.region || vessel.reg || '';
    document.getElementById('vZone').value = vessel.zone || '';
    document.getElementById('vPort').value = vessel.port || '';
    document.getElementById('vSupp').value = vessel.support_location || vessel.supp || '';
    document.getElementById('vStatus').value = vessel.status || vessel.stat || 'صالح';
    document.getElementById('vBreak').value = vessel.break_type || vessel.break || '';
    document.getElementById('vDate').value = vessel.fault_date || vessel.fDate || '';
    document.getElementById('vEnd').value = vessel.end_date || vessel.eDate || '';
    document.getElementById('vRef').value = vessel.ref || '';

    document.getElementById('vName').focus();
}

// ============================================================
// 10. حذف مركب
// ============================================================

function deleteVessel(id, name) {
    if (!canDelete()) { showToast('⚠️ لا صلاحية للحذف', 'warning'); return; }
    if (!confirm('⚠️ هل أنت متأكد من حذف "' + name + '"؟')) return;

    var token = getToken();
    if (!token) { showToast('⚠️ يرجى تسجيل الدخول', 'warning'); return; }

    var apiBase = 'https://marine-system-71eo.onrender.com/api';

    fetch(apiBase + '/vessels/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.success) {
            showToast('✅ تم الحذف', 'success');
            loadVessels();
        } else {
            showToast('❌ ' + (data.error || 'فشل'), 'error');
        }
    })
    .catch(function(err) {
        showToast('❌ ' + err.message, 'error');
    });
}

// ============================================================
// 11. إضافة/تحديث مركب
// ============================================================

function updateCategory() {
    var len = document.getElementById('vLen').value;
    document.getElementById('vCategory').value = getCategory(len);
}

function submitVessel() {
    var token = getToken();
    if (!token) { showFormMessage('⚠️ يرجى تسجيل الدخول', 'warning'); return; }

    var name = document.getElementById('vName').value.trim();
    var num = document.getElementById('vNum').value.trim();
    var len = document.getElementById('vLen').value;
    var region = document.getElementById('vRegion').value;
    var zone = document.getElementById('vZone').value;
    var port = document.getElementById('vPort').value.trim();
    var supp = document.getElementById('vSupp').value.trim();
    var status = document.getElementById('vStatus').value;
    var breakType = document.getElementById('vBreak').value.trim();
    var fDate = document.getElementById('vDate').value;
    var eDate = document.getElementById('vEnd').value;
    var ref = document.getElementById('vRef').value.trim();

    if (!name) { showFormMessage('⚠️ اسم المركب مطلوب', 'warning'); return; }
    if (!num) { showFormMessage('⚠️ الرقم مطلوب', 'warning'); return; }
    if (!len) { showFormMessage('⚠️ الطول مطلوب', 'warning'); return; }
    if (!region) { showFormMessage('⚠️ الإقليم مطلوب', 'warning'); return; }
    if (!zone) { showFormMessage('⚠️ المنطقة مطلوبة', 'warning'); return; }

    if ((status === 'معطب' || status === 'صيانة') && !fDate) {
        showFormMessage('⚠️ تاريخ العطب مطلوب', 'warning');
        return;
    }

    var data = {
        name: name, num: num, len: parseFloat(len),
        reg: region, zone: zone, port: port, supp: supp,
        stat: status, break: breakType,
        fDate: fDate, eDate: eDate, ref: ref,
        category: getCategory(len)
    };

    showFormMessage('⏳ جاري المعالجة...', 'info');

    var apiBase = 'https://marine-system-71eo.onrender.com/api';
    var url = editingId ? apiBase + '/vessels/' + editingId : apiBase + '/vessels';
    var method = editingId ? 'PUT' : 'POST';

    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(data)
    })
    .then(function(res) { return res.json(); })
    .then(function(result) {
        if (result.success) {
            var action = editingId ? 'تحديث' : 'إضافة';
            showToast('✅ تم ' + action + ' المركب', 'success');
            closeModal();
            loadVessels();
        } else {
            showFormMessage('❌ ' + (result.error || 'حدث خطأ'), 'error');
        }
    })
    .catch(function(err) {
        showFormMessage('❌ ' + err.message, 'error');
    });
}

function showFormMessage(msg, type) {
    var el = document.getElementById('vesselFormMessage');
    el.textContent = msg;
    el.className = 'form-message show ' + (type || 'info');
}

function clearForm() {
    document.getElementById('vName').value = '';
    document.getElementById('vNum').value = '';
    document.getElementById('vLen').value = '';
    document.getElementById('vCategory').value = '';
    document.getElementById('vRegion').value = '';
    document.getElementById('vZone').value = '';
    document.getElementById('vPort').value = '';
    document.getElementById('vSupp').value = '';
    document.getElementById('vStatus').value = 'صالح';
    document.getElementById('vBreak').value = '';
    document.getElementById('vDate').value = '';
    document.getElementById('vEnd').value = '';
    document.getElementById('vRef').value = '';
}

// ============================================================
// 12. تصدير
// ============================================================

function exportFleet() {
    if (!allVessels || allVessels.length === 0) {
        showToast('⚠️ لا توجد بيانات للتصدير', 'warning');
        return;
    }
    var csv = 'الاسم,الرقم,الطول,الفئة,الإقليم,المنطقة,الميناء,التعزيز,الحالة,العطب,التاريخ,الانتهاء\n';
    allVessels.forEach(function(v) {
        csv += [
            v.name || '-', v.num || '-', v.length || v.len || '-',
            v.category || getCategory(v.length || v.len),
            v.region || v.reg || '-', v.zone || '-', v.port || '-',
            v.support_location || v.supp || '-', v.status || v.stat || '-',
            v.break_type || v.break || '-',
            formatDate(v.fault_date || v.fDate),
            formatDate(v.end_date || v.eDate)
        ].join(',') + '\n';
    });
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'fleet_' + new Date().toISOString().slice(0,10) + '.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('📥 تم التصدير', 'success');
}

// ============================================================
// 13. ربط الأحداث
// ============================================================

function initFleet() {
    console.log('🔗 ربط الأحداث في fleet.js...');
    
    // أزرار الصفحة الرئيسية
    var addBtn = document.getElementById('addVesselBtn');
    var refreshBtn = document.getElementById('refreshFleetBtn');
    var exportBtn = document.getElementById('exportFleetBtn');
    var clearBtn = document.getElementById('clearFiltersBtn');
    var prevBtn = document.getElementById('prevPageBtn');
    var nextBtn = document.getElementById('nextPageBtn');
    
    if (addBtn) addBtn.addEventListener('click', openAddModal);
    if (refreshBtn) refreshBtn.addEventListener('click', loadVessels);
    if (exportBtn) exportBtn.addEventListener('click', exportFleet);
    if (clearBtn) clearBtn.addEventListener('click', clearFilters);
    if (prevBtn) prevBtn.addEventListener('click', prevPage);
    if (nextBtn) nextBtn.addEventListener('click', nextPage);
    
    // أزرار المودال
    var closeBtn = document.getElementById('closeModalBtn');
    var cancelBtn = document.getElementById('cancelModalBtn');
    var submitBtn = document.getElementById('submitVesselBtn');
    
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (submitBtn) submitBtn.addEventListener('click', submitVessel);
    
    // الفلاتر
    var search = document.getElementById('searchFleet');
    var catFilter = document.getElementById('filterCategory');
    var regFilter = document.getElementById('filterRegion');
    var statFilter = document.getElementById('filterStatus');
    
    if (search) search.addEventListener('input', filterVessels);
    if (catFilter) catFilter.addEventListener('change', filterVessels);
    if (regFilter) regFilter.addEventListener('change', filterVessels);
    if (statFilter) statFilter.addEventListener('change', filterVessels);
    
    // تحديث الفئة تلقائياً
    var lenInput = document.getElementById('vLen');
    if (lenInput) lenInput.addEventListener('input', updateCategory);
    
    // إغلاق المودال عند الضغط خارجها
    var modal = document.getElementById('vesselModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) closeModal();
        });
    }
    
    // تحميل البيانات
    setTimeout(loadVessels, 500);
    setTimeout(loadVessels, 1500);
    
    console.log('✅ fleet.js ready');
}

// ============================================================
// 14. تشغيل
// ============================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFleet);
} else {
    initFleet();
}

// ============================================================
// 15. تصدير عالمي (للاستخدام مع onclick)
// ============================================================

window.loadVessels = loadVessels;
window.filterVessels = filterVessels;
window.clearFilters = clearFilters;
window.exportFleet = exportFleet;
window.openAddModal = openAddModal;
window.editVessel = editVessel;
window.deleteVessel = deleteVessel;
window.submitVessel = submitVessel;
window.closeModal = closeModal;
window.prevPage = prevPage;
window.nextPage = nextPage;

console.log('✅ fleet.js loaded successfully');
