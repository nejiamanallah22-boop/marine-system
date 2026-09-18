/**
 * ============================================================
 * 🚢 FLEET.JS v8.0 - السجل العام للوسائل البحرية (نسخة محسنة)
 * ============================================================
 * ✅ إدارة كاملة للوسائل (CRUD)
 * ✅ فلترة وبحث متقدم
 * ✅ ترقيم صفحات
 * ✅ تصدير البيانات
 * ✅ صلاحيات مستخدمين
 * ✅ واجهة تفاعلية
 * ============================================================
 */

console.log('🚢 [Fleet] تحميل وحدة السجل العام...');

// ============================================================
// 📦 STATE - الحالة
// ============================================================

let fleetState = {
    vessels: [],
    filtered: [],
    currentPage: 1,
    pageSize: 10,
    editingId: null,
    filters: {
        search: '',
        category: 'الكل',
        region: 'الكل',
        status: 'الكل'
    }
};

// ============================================================
// 🔧 HELPERS - دوال مساعدة
// ============================================================

/**
 * الحصول على التوكن من التخزين
 */
function getToken() {
    return localStorage.getItem('marine_auth_token') || 
           localStorage.getItem('token') || 
           localStorage.getItem('marine_token');
}

/**
 * الحصول على فئة المركب حسب الطول
 */
function getCategory(length) {
    const n = parseFloat(length);
    if (isNaN(n)) return 'زوارق مزدوجة';
    if (n === 11) return 'البروق';
    if (n >= 8 && n <= 12) return 'صقور';
    if (n > 12 && n <= 25) return 'خوافر';
    if (n >= 30) return 'طوافات';
    return 'زوارق مزدوجة';
}

/**
 * تنسيق التاريخ
 */
function formatDate(date) {
    if (!date) return '-';
    try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('ar-TN');
    } catch {
        return '-';
    }
}

/**
 * تنقية النص من HTML
 */
function escapeHTML(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * عرض إشعار
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(30px)';
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 300);
    }, 3000);
}

/**
 * الحصول على المستخدم الحالي
 */
function getCurrentUser() {
    try {
        const data = localStorage.getItem('marine_user') || 
                     localStorage.getItem('currentUser') ||
                     sessionStorage.getItem('currentUser');
        return data ? JSON.parse(data) : null;
    } catch {
        return null;
    }
}

/**
 * التحقق من صلاحية التعديل
 */
function canEdit() {
    const user = getCurrentUser();
    return user && (user.role === 'مسؤول' || user.role === 'محرر' || user.role === 'admin');
}

/**
 * التحقق من صلاحية الحذف
 */
function canDelete() {
    const user = getCurrentUser();
    return user && (user.role === 'مسؤول' || user.role === 'admin');
}

// ============================================================
// 📊 LOAD DATA - تحميل البيانات
// ============================================================

function loadVessels() {
    console.log('🔄 [Fleet] تحميل البيانات...');
    
    const token = getToken();
    const tbody = document.getElementById('fleetBody');
    
    if (!token) {
        tbody.innerHTML = `
            <tr>
                <td colspan="14" style="text-align:center;padding:40px;color:var(--warning);">
                    <i class="fas fa-lock" style="font-size:32px;display:block;margin-bottom:12px;"></i>
                    يرجى تسجيل الدخول لعرض البيانات
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = `
        <tr>
            <td colspan="14" style="text-align:center;padding:40px;color:var(--text-dim);">
                <div class="loader-spinner" style="margin:0 auto 12px;"></div>
                جاري التحميل...
            </td>
        </tr>
    `;

    const apiBase = window.API_BASE || 'https://marine-system-71eo.onrender.com/api';

    fetch(`${apiBase}/vessels`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            if (response.status === 401) throw new Error('انتهت صلاحية الجلسة');
            if (response.status === 404) throw new Error('الخادم غير متاح');
            throw new Error(`خطأ ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        fleetState.vessels = Array.isArray(data.vessels) ? data.vessels :
                            Array.isArray(data.data) ? data.data :
                            Array.isArray(data) ? data : [];
        
        fleetState.filtered = [...fleetState.vessels];
        fleetState.currentPage = 1;
        
        updateStats();
        renderTable();
        populateFilters();
        
        showToast(`✅ تم تحميل ${fleetState.vessels.length} مركب`, 'success');
        console.log('✅ [Fleet] تم تحميل:', fleetState.vessels.length, 'مركب');
    })
    .catch(error => {
        console.error('❌ [Fleet] خطأ:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="14" style="text-align:center;padding:40px;color:var(--danger);">
                    <i class="fas fa-exclamation-circle" style="font-size:32px;display:block;margin-bottom:12px;"></i>
                    ${escapeHTML(error.message)}
                    <br>
                    <button onclick="loadVessels()" style="margin-top:12px;padding:6px 16px;background:var(--accent);border:none;border-radius:6px;color:#fff;cursor:pointer;">
                        <i class="fas fa-sync-alt"></i> إعادة المحاولة
                    </button>
                </td>
            </tr>
        `;
        showToast(`❌ ${error.message}`, 'error');
    });
}

// ============================================================
// 📊 RENDER TABLE - عرض الجدول
// ============================================================

function renderTable() {
    const tbody = document.getElementById('fleetBody');
    if (!tbody) return;

    const total = fleetState.filtered.length;
    const totalPages = Math.ceil(total / fleetState.pageSize);
    const start = (fleetState.currentPage - 1) * fleetState.pageSize;
    const end = Math.min(start + fleetState.pageSize, total);
    const pageData = fleetState.filtered.slice(start, end);

    // تحديث معلومات الصفحة
    document.getElementById('fleetCount').textContent = `${total} مركب`;
    document.getElementById('fleetPageInfo').textContent = `الصفحة ${fleetState.currentPage} من ${totalPages || 1}`;

    if (total === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="14" style="text-align:center;padding:40px;color:var(--text-dim);">
                    <i class="fas fa-ship" style="font-size:32px;display:block;margin-bottom:12px;opacity:0.3;"></i>
                    ${fleetState.filters.search ? 'لا توجد نتائج مطابقة للبحث' : 'لا توجد مراكب مسجلة'}
                </td>
            </tr>
        `;
        return;
    }

    const canEditFlag = canEdit();
    const canDeleteFlag = canDelete();

    let html = '';
    pageData.forEach((vessel, index) => {
        const id = vessel._id || vessel.id || index;
        const name = vessel.name || '-';
        const num = vessel.num || '-';
        const length = vessel.length || vessel.len || '-';
        const category = vessel.category || getCategory(length);
        const region = vessel.region || vessel.reg || '-';
        const zone = vessel.zone || '-';
        const port = vessel.port || '-';
        const supp = vessel.support_location || vessel.supp || '-';
        const status = vessel.status || vessel.stat || '-';
        const breakType = vessel.break_type || vessel.break || '-';
        const fDate = vessel.fault_date || vessel.fDate;
        const eDate = vessel.end_date || vessel.eDate;

        const statusClass = {
            'صالح': 'status-active',
            'معطب': 'status-inactive',
            'صيانة': 'status-maintenance',
            'خارج الخدمة': 'status-maintenance'
        }[status] || '';

        html += `
            <tr>
                <td>${start + index + 1}</td>
                <td><strong>${escapeHTML(name)}</strong></td>
                <td>${escapeHTML(num)}</td>
                <td>${escapeHTML(length)}</td>
                <td>${escapeHTML(category)}</td>
                <td>${escapeHTML(region)}</td>
                <td>${escapeHTML(zone)}</td>
                <td>${escapeHTML(port)}</td>
                <td>${escapeHTML(supp)}</td>
                <td><span class="status-badge ${statusClass}">${escapeHTML(status)}</span></td>
                <td>${escapeHTML(breakType)}</td>
                <td>${formatDate(fDate)}</td>
                <td>${formatDate(eDate)}</td>
                <td style="white-space:nowrap;">
                    ${canEditFlag ? `<button class="btn-icon btn-edit" onclick="editVessel('${id}')" title="تعديل"><i class="fas fa-edit"></i></button>` : ''}
                    ${canDeleteFlag ? `<button class="btn-icon btn-delete" onclick="deleteVessel('${id}','${escapeHTML(name)}')" title="حذف"><i class="fas fa-trash"></i></button>` : ''}
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// ============================================================
// 📊 UPDATE STATS - تحديث الإحصائيات
// ============================================================

function updateStats() {
    const total = fleetState.vessels.length;
    const ready = fleetState.vessels.filter(v => v.status === 'صالح' || v.stat === 'صالح').length;
    const maintenance = fleetState.vessels.filter(v => v.status === 'صيانة' || v.stat === 'صيانة').length;
    const broken = fleetState.vessels.filter(v => v.status === 'معطب' || v.stat === 'معطب').length;

    setElementText('totalVessels', total);
    setElementText('readyVessels', ready);
    setElementText('maintenanceVessels', maintenance);
    setElementText('brokenVessels', broken);
}

function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// ============================================================
// 🔍 FILTERS - الفلاتر والبحث
// ============================================================

function filterVessels() {
    const search = document.getElementById('searchFleet')?.value?.toLowerCase()?.trim() || '';
    const catFilter = document.getElementById('filterCategory')?.value || 'الكل';
    const regFilter = document.getElementById('filterRegion')?.value || 'الكل';
    const statFilter = document.getElementById('filterStatus')?.value || 'الكل';

    fleetState.filters = { search, category: catFilter, region: regFilter, status: statFilter };

    fleetState.filtered = fleetState.vessels.filter(vessel => {
        let match = true;

        // البحث النصي
        if (search) {
            const text = [
                vessel.name, vessel.num, vessel.region || vessel.reg,
                vessel.zone, vessel.port, vessel.status || vessel.stat,
                vessel.category, vessel.support_location || vessel.supp
            ].filter(Boolean).join(' ').toLowerCase();
            match = text.includes(search);
        }

        // فلتر الفئة
        if (match && catFilter !== 'الكل') {
            const cat = vessel.category || getCategory(vessel.length || vessel.len);
            match = cat === catFilter;
        }

        // فلتر الإقليم
        if (match && regFilter !== 'الكل') {
            match = (vessel.region || vessel.reg || '') === regFilter;
        }

        // فلتر الحالة
        if (match && statFilter !== 'الكل') {
            match = (vessel.status || vessel.stat || '') === statFilter;
        }

        return match;
    });

    fleetState.currentPage = 1;
    renderTable();
}

function clearFilters() {
    const search = document.getElementById('searchFleet');
    const catFilter = document.getElementById('filterCategory');
    const regFilter = document.getElementById('filterRegion');
    const statFilter = document.getElementById('filterStatus');

    if (search) search.value = '';
    if (catFilter) catFilter.value = 'الكل';
    if (regFilter) regFilter.value = 'الكل';
    if (statFilter) statFilter.value = 'الكل';

    filterVessels();
    showToast('🔄 تم مسح الفلاتر', 'info');
}

function populateFilters() {
    // ملء خيارات الإقليم
    const regions = [...new Set(fleetState.vessels.map(v => v.region || v.reg || '').filter(Boolean))];
    const regSelect = document.getElementById('filterRegion');
    if (regSelect) {
        const currentValue = regSelect.value;
        regSelect.innerHTML = '<option value="الكل">جميع الأقاليم</option>';
        regions.sort().forEach(r => {
            regSelect.innerHTML += `<option value="${escapeHTML(r)}">${escapeHTML(r)}</option>`;
        });
        regSelect.value = currentValue;
    }

    // ملء خيارات الفئة
    const categories = [...new Set(fleetState.vessels.map(v => v.category || getCategory(v.length || v.len)).filter(Boolean))];
    const catSelect = document.getElementById('filterCategory');
    if (catSelect) {
        const currentValue = catSelect.value;
        catSelect.innerHTML = '<option value="الكل">جميع الفئات</option>';
        categories.sort().forEach(c => {
            catSelect.innerHTML += `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`;
        });
        catSelect.value = currentValue;
    }
}

// ============================================================
// 📄 PAGINATION - ترقيم الصفحات
// ============================================================

function prevPage() {
    if (fleetState.currentPage > 1) {
        fleetState.currentPage--;
        renderTable();
    }
}

function nextPage() {
    const totalPages = Math.ceil(fleetState.filtered.length / fleetState.pageSize);
    if (fleetState.currentPage < totalPages) {
        fleetState.currentPage++;
        renderTable();
    }
}

// ============================================================
// ➕ ADD/EDIT VESSEL - إضافة وتعديل المراكب
// ============================================================

function openAddModal() {
    if (!canEdit()) {
        showToast('⚠️ لا تملك صلاحية الإضافة', 'warning');
        return;
    }
    
    fleetState.editingId = null;
    document.getElementById('vesselModalTitle').textContent = '➕ إضافة مركب جديد';
    document.getElementById('vesselModal').style.display = 'flex';
    clearForm();
    document.getElementById('vName')?.focus();
}

function editVessel(id) {
    if (!canEdit()) {
        showToast('⚠️ لا تملك صلاحية التعديل', 'warning');
        return;
    }

    const vessel = fleetState.vessels.find(v => (v._id || v.id) == id);
    if (!vessel) {
        showToast('❌ المركب غير موجود', 'error');
        return;
    }

    fleetState.editingId = id;
    document.getElementById('vesselModalTitle').textContent = `✏️ تعديل: ${vessel.name}`;
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

    document.getElementById('vName')?.focus();
}

function deleteVessel(id, name) {
    if (!canDelete()) {
        showToast('⚠️ لا تملك صلاحية الحذف', 'warning');
        return;
    }

    if (!confirm(`⚠️ هل أنت متأكد من حذف "${name}"؟\nهذا الإجراء لا يمكن التراجع عنه.`)) {
        return;
    }

    const token = getToken();
    if (!token) {
        showToast('⚠️ يرجى تسجيل الدخول', 'warning');
        return;
    }

    const apiBase = window.API_BASE || 'https://marine-system-71eo.onrender.com/api';

    fetch(`${apiBase}/vessels/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('✅ تم حذف المركب بنجاح', 'success');
            loadVessels();
        } else {
            showToast(`❌ ${data.error || 'فشل الحذف'}`, 'error');
        }
    })
    .catch(error => {
        showToast(`❌ ${error.message}`, 'error');
    });
}

function submitVessel() {
    const token = getToken();
    if (!token) {
        showFormMessage('⚠️ يرجى تسجيل الدخول', 'warning');
        return;
    }

    const name = document.getElementById('vName')?.value?.trim() || '';
    const num = document.getElementById('vNum')?.value?.trim() || '';
    const len = document.getElementById('vLen')?.value || '';
    const region = document.getElementById('vRegion')?.value || '';
    const zone = document.getElementById('vZone')?.value || '';
    const port = document.getElementById('vPort')?.value?.trim() || '';
    const supp = document.getElementById('vSupp')?.value?.trim() || '';
    const status = document.getElementById('vStatus')?.value || 'صالح';
    const breakType = document.getElementById('vBreak')?.value?.trim() || '';
    const fDate = document.getElementById('vDate')?.value || '';
    const eDate = document.getElementById('vEnd')?.value || '';
    const ref = document.getElementById('vRef')?.value?.trim() || '';

    // التحقق من الحقول المطلوبة
    if (!name) { showFormMessage('⚠️ اسم المركب مطلوب', 'warning'); return; }
    if (!num) { showFormMessage('⚠️ الرقم مطلوب', 'warning'); return; }
    if (!len) { showFormMessage('⚠️ الطول مطلوب', 'warning'); return; }
    if (!region) { showFormMessage('⚠️ الإقليم مطلوب', 'warning'); return; }
    if (!zone) { showFormMessage('⚠️ المنطقة مطلوبة', 'warning'); return; }

    if ((status === 'معطب' || status === 'صيانة') && !fDate) {
        showFormMessage('⚠️ تاريخ العطب مطلوب', 'warning');
        return;
    }

    const data = {
        name, num, len: parseFloat(len),
        reg: region, zone, port, supp,
        stat: status, break: breakType,
        fDate, eDate, ref,
        category: getCategory(len)
    };

    showFormMessage('⏳ جاري المعالجة...', 'info');

    const apiBase = window.API_BASE || 'https://marine-system-71eo.onrender.com/api';
    const url = fleetState.editingId ? `${apiBase}/vessels/${fleetState.editingId}` : `${apiBase}/vessels`;
    const method = fleetState.editingId ? 'PUT' : 'POST';

    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            const action = fleetState.editingId ? 'تحديث' : 'إضافة';
            showToast(`✅ تم ${action} المركب بنجاح`, 'success');
            closeModal();
            loadVessels();
        } else {
            showFormMessage(`❌ ${result.error || 'حدث خطأ'}`, 'error');
        }
    })
    .catch(error => {
        showFormMessage(`❌ ${error.message}`, 'error');
    });
}

function updateCategory() {
    const len = document.getElementById('vLen')?.value || '';
    const catSelect = document.getElementById('vCategory');
    if (catSelect) {
        catSelect.value = getCategory(len);
    }
}

function showFormMessage(message, type = 'info') {
    const el = document.getElementById('vesselFormMessage');
    if (!el) return;
    el.textContent = message;
    el.className = `form-message show ${type}`;
}

function clearForm() {
    const fields = ['vName', 'vNum', 'vLen', 'vCategory', 'vRegion', 
                    'vZone', 'vPort', 'vSupp', 'vBreak', 'vDate', 'vEnd', 'vRef'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const statusSelect = document.getElementById('vStatus');
    if (statusSelect) statusSelect.value = 'صالح';
    
    const msg = document.getElementById('vesselFormMessage');
    if (msg) {
        msg.className = 'form-message';
        msg.textContent = '';
    }
}

function closeModal() {
    document.getElementById('vesselModal').style.display = 'none';
    clearForm();
}

// ============================================================
// 📥 EXPORT - تصدير البيانات
// ============================================================

function exportFleet() {
    const data = fleetState.filtered.length > 0 ? fleetState.filtered : fleetState.vessels;
    
    if (!data || data.length === 0) {
        showToast('⚠️ لا توجد بيانات للتصدير', 'warning');
        return;
    }

    // إنشاء CSV
    const headers = ['الاسم', 'الرقم', 'الطول', 'الفئة', 'الإقليم', 'المنطقة', 
                     'الميناء', 'التعزيز', 'الحالة', 'العطب', 'تاريخ العطب', 'تاريخ الانتهاء'];
    
    let csv = headers.join(',') + '\n';
    
    data.forEach(v => {
        const row = [
            v.name || '-',
            v.num || '-',
            v.length || v.len || '-',
            v.category || getCategory(v.length || v.len),
            v.region || v.reg || '-',
            v.zone || '-',
            v.port || '-',
            v.support_location || v.supp || '-',
            v.status || v.stat || '-',
            v.break_type || v.break || '-',
            formatDate(v.fault_date || v.fDate),
            formatDate(v.end_date || v.eDate)
        ];
        csv += row.join(',') + '\n';
    });

    // تحميل الملف
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `fleet_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    
    showToast(`📥 تم تصدير ${data.length} مركب`, 'success');
}

// ============================================================
// 🔗 INIT - تهيئة الصفحة
// ============================================================

function initFleet() {
    console.log('🔗 [Fleet] ربط الأحداث...');
    
    // أزرار الصفحة الرئيسية
    document.getElementById('addVesselBtn')?.addEventListener('click', openAddModal);
    document.getElementById('refreshFleetBtn')?.addEventListener('click', loadVessels);
    document.getElementById('exportFleetBtn')?.addEventListener('click', exportFleet);
    document.getElementById('clearFiltersBtn')?.addEventListener('click', clearFilters);
    document.getElementById('prevPageBtn')?.addEventListener('click', prevPage);
    document.getElementById('nextPageBtn')?.addEventListener('click', nextPage);
    
    // أزرار المودال
    document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
    document.getElementById('cancelModalBtn')?.addEventListener('click', closeModal);
    document.getElementById('submitVesselBtn')?.addEventListener('click', submitVessel);
    
    // الفلاتر
    document.getElementById('searchFleet')?.addEventListener('input', filterVessels);
    document.getElementById('filterCategory')?.addEventListener('change', filterVessels);
    document.getElementById('filterRegion')?.addEventListener('change', filterVessels);
    document.getElementById('filterStatus')?.addEventListener('change', filterVessels);
    
    // تحديث الفئة تلقائياً عند تغيير الطول
    document.getElementById('vLen')?.addEventListener('input', updateCategory);
    
    // إغلاق المودال عند الضغط خارجها
    const modal = document.getElementById('vesselModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) closeModal();
        });
    }
    
    // تحميل البيانات
    setTimeout(loadVessels, 200);
    
    console.log('✅ [Fleet] جاهز');
}

// ============================================================
// 🚀 START - بدء التشغيل
// ============================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFleet);
} else {
    initFleet();
}

// ============================================================
// 🌐 EXPOSE - تصدير الدوال للاستخدام العالمي
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
window.updateCategory = updateCategory;

console.log('✅ [Fleet] تم تحميل وحدة السجل العام');
