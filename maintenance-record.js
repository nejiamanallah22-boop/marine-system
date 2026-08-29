/**
 * ============================================================
 * 📋 MAINTENANCE-RECORD.JS - سجل الصيانة
 * ============================================================
 * ✅ عرض المراكب المعطبة فقط
 * ✅ تحديث حالة المراكب
 * ✅ إحصائيات المعطبين
 * ✅ إضافة سجلات صيانة للمركب المعطب
 * ============================================================
 */

'use strict';

console.log('📋 [Maintenance Record] تحميل سجل الصيانة...');

// ============================================================
// 📦 STATE - الحالة
// ============================================================

let recordState = {
    brokenVessels: [],
    allVessels: [],
    maintenanceRecords: [],
    currentPage: 1,
    pageSize: 10,
    filters: {
        search: '',
        status: 'الكل',
        type: 'الكل'
    },
    stats: {
        total: 0,
        inMaintenance: 0,
        waiting: 0,
        totalCost: 0
    },
    editingId: null
};

// ============================================================
// 🔧 HELPERS - دوال مساعدة
// ============================================================

function getToken() {
    return localStorage.getItem('accessToken') || 
           localStorage.getItem('token') || 
           null;
}

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

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
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

// ============================================================
// 📊 LOAD DATA - تحميل البيانات
// ============================================================

async function loadRecordData() {
    console.log('🔄 [Record] تحميل سجل الصيانة...');
    
    const token = getToken();
    if (!token) {
        showToast('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }

    try {
        // تحميل جميع المراكب
        const vesselsRes = await fetch('/api/vessels', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const vesselsData = await vesselsRes.json();
        recordState.allVessels = Array.isArray(vesselsData.vessels) ? 
                                 vesselsData.vessels : [];

        // تحميل سجلات الصيانة
        const recordsRes = await fetch('/api/maintenance', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const recordsData = await recordsRes.json();
        recordState.maintenanceRecords = Array.isArray(recordsData.records) ?
                                         recordsData.records : [];

        // تصفية المراكب المعطبة فقط
        recordState.brokenVessels = recordState.allVessels.filter(v => {
            const status = v.status || v.stat || '';
            return status === 'معطب' || 
                   status === 'صيانة' || 
                   status === 'خارج الخدمة' ||
                   status === 'inactive' ||
                   status === 'maintenance';
        });

        // إضافة بيانات الصيانة لكل مركب معطب
        recordState.brokenVessels.forEach(v => {
            const id = v._id || v.id || '';
            v.maintenanceHistory = recordState.maintenanceRecords
                .filter(r => (r.vesselId || r.vessel_id || '') === id)
                .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
            
            // حساب آخر تكلفة صيانة
            const lastRecord = v.maintenanceHistory[0];
            v.lastCost = lastRecord?.cost || 0;
            v.lastMaintenanceDate = lastRecord?.date || lastRecord?.createdAt || v.fDate || v.fault_date;
        });

        updateRecordStats();
        renderBrokenVessels();
        
        console.log(`✅ [Record] ${recordState.brokenVessels.length} مركب معطب`);
        showToast(`✅ تم تحميل ${recordState.brokenVessels.length} مركب معطب`, 'success');

    } catch (error) {
        console.error('❌ [Record] خطأ:', error);
        showToast(`❌ ${error.message}`, 'error');
    }
}

// ============================================================
// 📊 UPDATE STATS - تحديث الإحصائيات
// ============================================================

function updateRecordStats() {
    const vessels = recordState.brokenVessels;
    
    const total = vessels.length;
    const inMaintenance = vessels.filter(v => 
        (v.status || v.stat || '') === 'صيانة' || 
        (v.status || v.stat || '') === 'maintenance'
    ).length;
    const waiting = vessels.filter(v => 
        (v.status || v.stat || '') === 'معطب' || 
        (v.status || v.stat || '') === 'inactive'
    ).length;
    
    const totalCost = vessels.reduce((sum, v) => sum + (v.lastCost || 0), 0);

    recordState.stats = { total, inMaintenance, waiting, totalCost };

    setElementText('recordTotal', total);
    setElementText('recordInMaintenance', inMaintenance);
    setElementText('recordWaiting', waiting);
    setElementText('recordTotalCost', totalCost.toLocaleString() + ' د.ت');
}

function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// ============================================================
// 🚢 RENDER BROKEN VESSELS - عرض المراكب المعطبة
// ============================================================

function renderBrokenVessels() {
    const container = document.getElementById('brokenVesselsTable');
    if (!container) return;

    const vessels = recordState.brokenVessels;

    if (vessels.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:60px 20px;color:var(--text-dim);">
                <i class="fas fa-check-circle" style="font-size:48px;display:block;margin-bottom:16px;color:var(--success);"></i>
                <h3 style="color:var(--text-muted);">✅ لا توجد مراكب معطبة</h3>
                <p style="font-size:14px;margin-top:8px;">جميع المراكب في حالة جيدة</p>
            </div>
        `;
        return;
    }

    const statusColors = {
        'معطب': '#ef4444',
        'صيانة': '#eab308',
        'خارج الخدمة': '#ef4444',
        'inactive': '#ef4444',
        'maintenance': '#eab308'
    };

    const statusLabels = {
        'معطب': '🔴 معطب',
        'صيانة': '🟡 قيد الصيانة',
        'خارج الخدمة': '🔴 خارج الخدمة',
        'inactive': '🔴 معطب',
        'maintenance': '🟡 صيانة'
    };

    container.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead>
                <tr style="border-bottom:2px solid var(--border);">
                    <th style="padding:12px;text-align:right;">#</th>
                    <th style="padding:12px;text-align:right;">الاسم</th>
                    <th style="padding:12px;text-align:right;">النوع</th>
                    <th style="padding:12px;text-align:right;">الحالة</th>
                    <th style="padding:12px;text-align:right;">تاريخ العطب</th>
                    <th style="padding:12px;text-align:right;">آخر صيانة</th>
                    <th style="padding:12px;text-align:right;">التكلفة</th>
                    <th style="padding:12px;text-align:right;">الإجراءات</th>
                </tr>
            </thead>
            <tbody>
                ${vessels.map((v, i) => {
                    const id = v._id || v.id || '';
                    const name = v.name || 'غير معروف';
                    const type = v.type || v.category || '-';
                    const status = v.status || v.stat || 'معطب';
                    const faultDate = v.fDate || v.fault_date || v.createdAt;
                    const lastMaintenance = v.lastMaintenanceDate || '-';
                    const cost = v.lastCost || 0;
                    const maintenanceCount = v.maintenanceHistory?.length || 0;

                    return `
                        <tr style="border-bottom:1px solid var(--border);">
                            <td style="padding:10px 12px;">${i + 1}</td>
                            <td style="padding:10px 12px;font-weight:500;">${escapeHTML(name)}</td>
                            <td style="padding:10px 12px;color:var(--text-muted);">${escapeHTML(type)}</td>
                            <td style="padding:10px 12px;">
                                <span style="
                                    display:inline-block;
                                    padding:2px 12px;
                                    border-radius:12px;
                                    font-size:12px;
                                    font-weight:500;
                                    background:${statusColors[status] || '#ef4444'}22;
                                    color:${statusColors[status] || '#ef4444'};
                                ">
                                    ${statusLabels[status] || status}
                                </span>
                            </td>
                            <td style="padding:10px 12px;color:var(--text-muted);font-size:13px;">
                                ${formatDate(faultDate)}
                            </td>
                            <td style="padding:10px 12px;color:var(--text-muted);font-size:13px;">
                                ${formatDate(lastMaintenance)}
                                ${maintenanceCount > 0 ? `<span style="font-size:10px;color:var(--text-dim);display:block;">(${maintenanceCount} صيانة)</span>` : ''}
                            </td>
                            <td style="padding:10px 12px;color:var(--text-muted);font-size:13px;">
                                ${cost > 0 ? cost.toLocaleString() + ' د.ت' : '-'}
                            </td>
                            <td style="padding:10px 12px;">
                                <button class="btn-icon btn-edit" onclick="editBrokenVessel('${escapeHTML(id)}')" title="تعديل">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn-icon btn-success" onclick="addMaintenanceRecord('${escapeHTML(id)}')" title="إضافة صيانة">
                                    <i class="fas fa-wrench"></i>
                                </button>
                                <button class="btn-icon btn-success" onclick="fixVessel('${escapeHTML(id)}')" title="إصلاح">
                                    <i class="fas fa-check"></i>
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
        <div style="margin-top:16px;display:flex;justify-content:space-between;color:var(--text-dim);font-size:13px;">
            <span>إجمالي المعطبين: ${vessels.length}</span>
            <span>آخر تحديث: ${new Date().toLocaleString('ar-TN')}</span>
        </div>
    `;
}

// ============================================================
// 🔧 EDIT BROKEN VESSEL - تعديل مركب معطب
// ============================================================

function editBrokenVessel(id) {
    const vessel = recordState.brokenVessels.find(v => (v._id || v.id || '') === id);
    if (!vessel) {
        showToast('⚠️ المركب غير موجود', 'warning');
        return;
    }

    recordState.editingId = id;
    
    // فتح مودال التعديل
    const modal = document.getElementById('editBrokenModal');
    if (!modal) return;

    document.getElementById('editVesselName').value = vessel.name || '';
    document.getElementById('editVesselStatus').value = vessel.status || vessel.stat || 'معطب';
    document.getElementById('editVesselFaultDate').value = vessel.fDate || vessel.fault_date || '';
    document.getElementById('editVesselNote').value = vessel.note || '';

    modal.style.display = 'flex';
}

async function saveBrokenVessel() {
    const id = recordState.editingId;
    if (!id) {
        showToast('⚠️ لا يوجد مركب للتعديل', 'warning');
        return;
    }

    const token = getToken();
    if (!token) {
        showToast('⚠️ يرجى تسجيل الدخول', 'warning');
        return;
    }

    const status = document.getElementById('editVesselStatus').value;
    const faultDate = document.getElementById('editVesselFaultDate').value;
    const note = document.getElementById('editVesselNote').value;

    try {
        const response = await fetch(`/api/vessels/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status, faultDate: faultDate, note })
        });

        const data = await response.json();
        
        if (data.success) {
            showToast('✅ تم تحديث المركب', 'success');
            closeEditModal();
            loadRecordData();
        } else {
            showToast(`❌ ${data.error || 'فشل التحديث'}`, 'error');
        }
    } catch (error) {
        showToast(`❌ ${error.message}`, 'error');
    }
}

function closeEditModal() {
    document.getElementById('editBrokenModal').style.display = 'none';
    recordState.editingId = null;
}

// ============================================================
// 🔧 ADD MAINTENANCE RECORD - إضافة سجل صيانة للمركب المعطب
// ============================================================

function addMaintenanceRecord(id) {
    const vessel = recordState.brokenVessels.find(v => (v._id || v.id || '') === id);
    if (!vessel) {
        showToast('⚠️ المركب غير موجود', 'warning');
        return;
    }

    // فتح مودال إضافة صيانة
    const modal = document.getElementById('addRecordModal');
    if (!modal) return;

    document.getElementById('recordVesselId').value = id;
    document.getElementById('recordVesselName').textContent = vessel.name || 'غير معروف';
    document.getElementById('recordType').value = 'routine';
    document.getElementById('recordCost').value = '';
    document.getElementById('recordDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('recordDescription').value = '';

    modal.style.display = 'flex';
}

async function saveMaintenanceRecord() {
    const vesselId = document.getElementById('recordVesselId').value;
    const type = document.getElementById('recordType').value;
    const cost = parseFloat(document.getElementById('recordCost').value) || 0;
    const date = document.getElementById('recordDate').value;
    const description = document.getElementById('recordDescription').value;

    if (!vesselId) {
        showToast('⚠️ لا يوجد مركب', 'warning');
        return;
    }

    const token = getToken();
    if (!token) {
        showToast('⚠️ يرجى تسجيل الدخول', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/maintenance', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                vesselId,
                type,
                cost,
                date,
                description,
                status: 'completed'
            })
        });

        const data = await response.json();
        
        if (data.success) {
            showToast('✅ تم إضافة سجل الصيانة', 'success');
            closeRecordModal();
            loadRecordData();
        } else {
            showToast(`❌ ${data.error || 'فشل الإضافة'}`, 'error');
        }
    } catch (error) {
        showToast(`❌ ${error.message}`, 'error');
    }
}

function closeRecordModal() {
    document.getElementById('addRecordModal').style.display = 'none';
}

// ============================================================
// ✅ FIX VESSEL - إصلاح المركب (تغيير الحالة إلى صالح)
// ============================================================

async function fixVessel(id) {
    const vessel = recordState.brokenVessels.find(v => (v._id || v.id || '') === id);
    if (!vessel) {
        showToast('⚠️ المركب غير موجود', 'warning');
        return;
    }

    if (!confirm(`✅ هل أنت متأكد من إصلاح المركب:\n\n${vessel.name}\n\nسيتم تغيير الحالة إلى "صالح"`)) {
        return;
    }

    const token = getToken();
    if (!token) {
        showToast('⚠️ يرجى تسجيل الدخول', 'warning');
        return;
    }

    try {
        const response = await fetch(`/api/vessels/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                status: 'صالح',
                stat: 'صالح',
                fixedDate: new Date().toISOString()
            })
        });

        const data = await response.json();
        
        if (data.success) {
            showToast(`✅ تم إصلاح المركب ${vessel.name}`, 'success');
            loadRecordData();
        } else {
            showToast(`❌ ${data.error || 'فشل الإصلاح'}`, 'error');
        }
    } catch (error) {
        showToast(`❌ ${error.message}`, 'error');
    }
}

// ============================================================
// 🔍 FILTERS - الفلاتر والبحث
// ============================================================

function filterRecords() {
    const search = document.getElementById('searchBroken')?.value?.toLowerCase()?.trim() || '';
    const statusFilter = document.getElementById('filterBrokenStatus')?.value || 'الكل';
    const typeFilter = document.getElementById('filterBrokenType')?.value || 'الكل';

    let filtered = recordState.brokenVessels;

    if (search) {
        filtered = filtered.filter(v => 
            (v.name || '').toLowerCase().includes(search) ||
            (v.type || v.category || '').toLowerCase().includes(search)
        );
    }

    if (statusFilter !== 'الكل') {
        filtered = filtered.filter(v => {
            const status = v.status || v.stat || '';
            return status === statusFilter;
        });
    }

    if (typeFilter !== 'الكل') {
        filtered = filtered.filter(v => {
            const type = v.type || v.category || '';
            return type === typeFilter;
        });
    }

    // تحديث العرض
    const container = document.getElementById('brokenVesselsTable');
    if (container) {
        const oldVessels = recordState.brokenVessels;
        recordState.brokenVessels = filtered;
        renderBrokenVessels();
        recordState.brokenVessels = oldVessels;
    }
}

function clearFilters() {
    document.getElementById('searchBroken').value = '';
    document.getElementById('filterBrokenStatus').value = 'الكل';
    document.getElementById('filterBrokenType').value = 'الكل';
    filterRecords();
    showToast('🔄 تم مسح الفلاتر', 'info');
}

function populateFilters() {
    // ملء خيارات الحالة
    const statuses = ['معطب', 'صيانة', 'خارج الخدمة'];
    const statusSelect = document.getElementById('filterBrokenStatus');
    if (statusSelect) {
        const currentValue = statusSelect.value;
        statusSelect.innerHTML = '<option value="الكل">جميع الحالات</option>';
        statuses.forEach(s => {
            statusSelect.innerHTML += `<option value="${s}">${s}</option>`;
        });
        statusSelect.value = currentValue;
    }

    // ملء خيارات النوع
    const types = [...new Set(recordState.brokenVessels.map(v => v.type || v.category || '').filter(Boolean))];
    const typeSelect = document.getElementById('filterBrokenType');
    if (typeSelect) {
        const currentValue = typeSelect.value;
        typeSelect.innerHTML = '<option value="الكل">جميع الأنواع</option>';
        types.sort().forEach(t => {
            typeSelect.innerHTML += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`;
        });
        typeSelect.value = currentValue;
    }
}

// ============================================================
// 📥 EXPORT - تصدير سجل الصيانة
// ============================================================

function exportRecord() {
    const data = recordState.brokenVessels;
    
    if (!data || data.length === 0) {
        showToast('⚠️ لا توجد بيانات للتصدير', 'warning');
        return;
    }

    const headers = ['الاسم', 'النوع', 'الحالة', 'تاريخ العطب', 'آخر صيانة', 'التكلفة'];
    let csv = headers.join(',') + '\n';
    
    data.forEach(v => {
        const row = [
            v.name || '-',
            v.type || v.category || '-',
            v.status || v.stat || '-',
            formatDate(v.fDate || v.fault_date),
            formatDate(v.lastMaintenanceDate),
            v.lastCost || 0
        ];
        csv += row.join(',') + '\n';
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `maintenance_record_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    
    showToast(`📥 تم تصدير ${data.length} مركب معطب`, 'success');
}

// ============================================================
// 🔄 REFRESH - تحديث يدوي
// ============================================================

function refreshRecord() {
    showToast('🔄 جاري تحديث سجل الصيانة...', 'info');
    loadRecordData();
}

// ============================================================
// 🚀 INIT - تهيئة الصفحة
// ============================================================

function initRecordPage() {
    console.log('📋 [Record] تهيئة سجل الصيانة...');
    
    // أزرار الصفحة
    document.getElementById('refreshRecord')?.addEventListener('click', refreshRecord);
    document.getElementById('clearRecordFilters')?.addEventListener('click', clearFilters);
    document.getElementById('exportRecord')?.addEventListener('click', exportRecord);
    
    // الفلاتر
    document.getElementById('searchBroken')?.addEventListener('input', filterRecords);
    document.getElementById('filterBrokenStatus')?.addEventListener('change', filterRecords);
    document.getElementById('filterBrokenType')?.addEventListener('change', filterRecords);
    
    // أزرار المودال
    document.getElementById('closeEditModal')?.addEventListener('click', closeEditModal);
    document.getElementById('cancelEditModal')?.addEventListener('click', closeEditModal);
    document.getElementById('saveEditVessel')?.addEventListener('click', saveBrokenVessel);
    
    document.getElementById('closeRecordModal')?.addEventListener('click', closeRecordModal);
    document.getElementById('cancelRecordModal')?.addEventListener('click', closeRecordModal);
    document.getElementById('saveMaintenanceRecord')?.addEventListener('click', saveMaintenanceRecord);
    
    // تحميل البيانات
    setTimeout(loadRecordData, 200);
    
    console.log('✅ [Record] جاهز');
}

// ============================================================
// 🚀 START - بدء التشغيل
// ============================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRecordPage);
} else {
    initRecordPage();
}

// ============================================================
// 🌐 EXPOSE - تصدير الدوال
// ============================================================

window.loadRecordData = loadRecordData;
window.renderBrokenVessels = renderBrokenVessels;
window.editBrokenVessel = editBrokenVessel;
window.saveBrokenVessel = saveBrokenVessel;
window.closeEditModal = closeEditModal;
window.addMaintenanceRecord = addMaintenanceRecord;
window.saveMaintenanceRecord = saveMaintenanceRecord;
window.closeRecordModal = closeRecordModal;
window.fixVessel = fixVessel;
window.filterRecords = filterRecords;
window.clearFilters = clearFilters;
window.exportRecord = exportRecord;
window.refreshRecord = refreshRecord;
window.initRecordPage = initRecordPage;

console.log('✅ [Record] تم تحميل وحدة سجل الصيانة');
