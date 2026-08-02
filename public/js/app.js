// ============================================================
// دوال الصيانة - النظام الذكي
// ============================================================

function renderGeneralMaintenance() {
    const container = document.getElementById('generalMaintenanceContainer');
    if (!container) return;
    
    // المراكب المعطبة - فقط التي حالتها معطبة أو صيانة
    const vessels = allVessels.filter(v => v.stat === 'معطب' || v.stat === 'صيانة' || v.stat === 'خارج الخدمة');
    
    if (vessels.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px; background:#d4edda; border-radius:8px; border:2px solid #28a745;">
                <h3 style="color:#28a745; margin:0;">✅ لا توجد مراكب معطبة حالياً</h3>
                <p style="color:#6c757d;">جميع المراكب في حالة جاهزة</p>
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="scrollable-table">
            <table>
                <thead>
                    <tr style="background:#f8f9fa; border-bottom:2px solid #dc3545;">
                        <th>🚢 المركب</th>
                        <th>الفئة</th>
                        <th>الحالة الحالية</th>
                        <th>⚠️ العطل</th>
                        <th>📅 بداية العطل</th>
                        <th>⏱️ مدة التوقف</th>
                        <th>🔧 آخر إجراء</th>
                        <th>🏭 المسؤول</th>
                        <th>الإجراء</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    vessels.forEach(v => {
        // البحث عن سجل الصيانة المفتوح
        const maintenanceRecord = allMaintenance.find(r => 
            r.vesselId === v.id && 
            (r.status === 'مفتوحة' || r.status === 'قيد الإنجاز' || r.status === 'قيد الإصلاح')
        );
        
        // حساب مدة التوقف
        let downtime = '-';
        let startDate = v.fDate || '-';
        if (v.fDate) {
            const start = new Date(v.fDate);
            const now = new Date();
            const days = Math.floor((now - start) / (1000 * 60 * 60 * 24));
            if (days > 0) downtime = `${days} يوم${days > 1 ? 'اً' : ''}`;
            else downtime = 'اليوم';
        }
        
        const statusColors = {
            'معطب': '🔴 معطبة',
            'صيانة': '🟠 صيانة',
            'خارج الخدمة': '⚫ خارج الخدمة'
        };
        
        const statusClass = {
            'معطب': 'status-broken',
            'صيانة': 'status-maintenance',
            'خارج الخدمة': 'status-broken'
        };
        
        html += `
            <tr style="border-bottom:1px solid #dee2e6;">
                <td><strong>${v.name || '-'}</strong></td>
                <td>${v.cat || '-'}</td>
                <td><span class="status-badge ${statusClass[v.stat] || 'status-broken'}">${statusColors[v.stat] || v.stat}</span></td>
                <td>${v.break || maintenanceRecord?.description || '-'}</td>
                <td>${startDate}</td>
                <td>${downtime}</td>
                <td>${maintenanceRecord?.repair || maintenanceRecord?.notes || '-'}</td>
                <td>${v.repairer || v.supp || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="openMaintenanceFile(${v.id})" title="فتح ملف المركب">
                        📂 فتح الملف
                    </button>
                    <button class="btn btn-sm btn-success" onclick="fixVessel(${v.id})" title="إصلاح المركب">
                        ✅ إصلاح
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

// ============================================================
// فتح ملف المركب - عرض تاريخ الصيانة الكامل
// ============================================================

function openMaintenanceFile(vesselId) {
    const vessel = allVessels.find(v => v.id === vesselId);
    if (!vessel) {
        showAlert('⚠️ المركب غير موجود', 'warning');
        return;
    }
    
    // فلترة سجلات الصيانة لهذا المركب
    const records = allMaintenance.filter(r => r.vesselId === vesselId);
    const totalMaintenance = records.length;
    const totalCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);
    const lastMaintenance = records.length > 0 ? records[records.length - 1] : null;
    
    // حساب الأعطال المتكررة
    const faultCount = {};
    records.forEach(r => {
        const fault = r.faultType || r.description || 'غير محدد';
        faultCount[fault] = (faultCount[fault] || 0) + 1;
    });
    const sortedFaults = Object.keys(faultCount).sort((a, b) => faultCount[b] - faultCount[a]);
    const topFaults = sortedFaults.slice(0, 3);
    
    // إنشاء نافذة منبثقة
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); z-index: 999999;
        display: flex; justify-content: center; align-items: center;
        padding: 20px;
    `;
    
    modal.innerHTML = `
        <div style="background:white; border-radius:12px; padding:30px; max-width:800px; width:100%; max-height:90vh; overflow-y:auto; position:relative;">
            <button onclick="this.closest('div[style]').remove()" style="position:absolute; top:10px; right:20px; font-size:24px; border:none; background:none; cursor:pointer;">✕</button>
            
            <h2 style="color:#0d6efd; margin-top:0;">🚢 ${vessel.name}</h2>
            
            <div style="display:flex; gap:15px; flex-wrap:wrap; margin-bottom:20px;">
                <span class="status-badge ${vessel.stat === 'صالح' ? 'status-ready' : 'status-broken'}">
                    ${vessel.stat === 'صالح' ? '🟢 جاهز' : '🔴 معطب'}
                </span>
                <span style="background:#e9ecef; padding:4px 12px; border-radius:20px;">${vessel.cat || 'بدون فئة'}</span>
                <span style="background:#e9ecef; padding:4px 12px; border-radius:20px;">${vessel.num || 'بدون رقم'}</span>
            </div>
            
            <hr style="margin:15px 0;">
            
            <h4 style="color:#0d6efd;">📚 تاريخ الصيانة</h4>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; margin:10px 0;">
                <div style="background:#e7f3ff; padding:10px; border-radius:8px; text-align:center;">
                    <div style="font-size:24px; font-weight:bold; color:#0d6efd;">${totalMaintenance}</div>
                    <div style="font-size:12px; color:#6c757d;">عدد الصيانات</div>
                </div>
                <div style="background:#d4edda; padding:10px; border-radius:8px; text-align:center;">
                    <div style="font-size:24px; font-weight:bold; color:#28a745;">${totalCost.toLocaleString()} د.ت</div>
                    <div style="font-size:12px; color:#6c757d;">إجمالي التكلفة</div>
                </div>
                <div style="background:#fff3cd; padding:10px; border-radius:8px; text-align:center;">
                    <div style="font-size:16px; font-weight:bold; color:#ffc107;">${lastMaintenance ? new Date(lastMaintenance.date).toLocaleDateString('ar-TN') : '-'}</div>
                    <div style="font-size:12px; color:#6c757d;">آخر صيانة</div>
                </div>
            </div>
            
            ${topFaults.length > 0 ? `
                <div style="background:#f8f9fa; padding:10px; border-radius:8px; margin:10px 0;">
                    <h5 style="margin:0; color:#dc3545;">⚠️ الأعطال المتكررة</h5>
                    <ul style="margin:5px 0; padding-right:20px;">
                        ${topFaults.map(f => `<li>${f} (${faultCount[f]} مرات)</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            
            <hr style="margin:15px 0;">
            
            ${records.length > 0 ? `
                <div style="max-height:300px; overflow-y:auto;">
                    <table style="width:100%; border-collapse:collapse; font-size:13px;">
                        <thead style="background:#f8f9fa;">
                            <tr>
                                <th style="padding:8px; text-align:center;">التاريخ</th>
                                <th style="padding:8px; text-align:center;">نوع الصيانة</th>
                                <th style="padding:8px; text-align:center;">العطل</th>
                                <th style="padding:8px; text-align:center;">الإصلاح</th>
                                <th style="padding:8px; text-align:center;">التكلفة</th>
                                <th style="padding:8px; text-align:center;">الحالة</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${records.slice().reverse().map(r => `
                                <tr style="border-bottom:1px solid #dee2e6;">
                                    <td style="padding:6px; text-align:center;">${r.date ? new Date(r.date).toLocaleDateString('ar-TN') : '-'}</td>
                                    <td style="padding:6px; text-align:center;">${r.type || '-'}</td>
                                    <td style="padding:6px; text-align:center;">${r.description || '-'}</td>
                                    <td style="padding:6px; text-align:center;">${r.repair || '-'}</td>
                                    <td style="padding:6px; text-align:center;">${r.cost ? r.cost + ' د.ت' : '-'}</td>
                                    <td style="padding:6px; text-align:center;">
                                        <span class="status-badge ${r.status === 'مغلقة' || r.status === 'مكتملة' ? 'status-closed' : 'status-maintenance'}">
                                            ${r.status === 'مغلقة' || r.status === 'مكتملة' ? '✅ مغلقة' : '🔄 قيد الإنجاز'}
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : `
                <div style="text-align:center; padding:20px; color:#6c757d;">
                    🚫 لا توجد سجلات صيانة لهذا المركب
                </div>
            `}
            
            <div style="margin-top:20px; display:flex; gap:10px; justify-content:center;">
                <button onclick="this.closest('div[style]').closest('div[style]').remove()" style="padding:8px 30px; background:#0d6efd; color:white; border:none; border-radius:5px; cursor:pointer;">
                    📥 تصدير التقرير
                </button>
                <button onclick="this.closest('div[style]').closest('div[style]').remove()" style="padding:8px 30px; background:#6c757d; color:white; border:none; border-radius:5px; cursor:pointer;">
                    ❌ إغلاق
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    // إغلاق عند النقر خارج النافذة
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            this.remove();
        }
    });
}

// ============================================================
// إصلاح المركب - تحديث الحالة في الأسطول
// ============================================================

function fixVessel(vesselId) {
    if (!confirm('⚠️ هل أنت متأكد من إصلاح هذا المركب؟')) return;
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    // تغيير حالة المركب إلى صالح
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
            showAlert('✅ تم إصلاح المركب وعودته للخدمة', 'success');
            
            // إغلاق سجلات الصيانة المفتوحة
            const openRecords = allMaintenance.filter(r => 
                r.vesselId === vesselId && 
                (r.status === 'مفتوحة' || r.status === 'قيد الإنجاز' || r.status === 'قيد الإصلاح')
            );
            
            openRecords.forEach(r => {
                fetch('/api/maintenance/' + r.id, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ 
                        ...r, 
                        status: 'مغلقة',
                        endDate: new Date().toISOString().split('T')[0]
                    })
                }).catch(err => console.error('Error closing maintenance:', err));
            });
            
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

// ============================================================
// Historique de Maintenance - مع فلترة متقدمة
// ============================================================

function renderHistoryMaintenance() {
    const container = document.getElementById('historyMaintenanceContainer');
    if (!container) return;
    
    // فلترة السجلات
    let records = allMaintenance.filter(r => 
        r.status === 'مغلقة' || r.status === 'مكتملة' || r.status === 'ملغية'
    );
    
    // تطبيق الفلترة
    const vesselFilter = document.getElementById('filterVessel')?.value?.toLowerCase() || '';
    const yearFilter = document.getElementById('filterYear')?.value || '';
    const typeFilter = document.getElementById('filterType')?.value || '';
    const unitFilter = document.getElementById('filterUnit')?.value || '';
    const costFilter = document.getElementById('filterCost')?.value || '';
    const faultFilter = document.getElementById('filterFaultType')?.value || '';
    
    if (vesselFilter) {
        records = records.filter(r => {
            const name = r.vesselName || allVessels.find(v => v.id === r.vesselId)?.name || '';
            return name.toLowerCase().includes(vesselFilter);
        });
    }
    
    if (yearFilter) {
        records = records.filter(r => r.date && r.date.startsWith(yearFilter));
    }
    
    if (typeFilter) {
        records = records.filter(r => r.type === typeFilter);
    }
    
    if (unitFilter) {
        records = records.filter(r => r.unit === unitFilter);
    }
    
    if (faultFilter) {
        records = records.filter(r => r.faultType === faultFilter || r.description?.includes(faultFilter));
    }
    
    if (costFilter) {
        records = records.filter(r => {
            const cost = r.cost || 0;
            switch(costFilter) {
                case '0-1000': return cost < 1000;
                case '1000-5000': return cost >= 1000 && cost <= 5000;
                case '5000-10000': return cost > 5000 && cost <= 10000;
                case '10000+': return cost > 10000;
                default: return true;
            }
        });
    }
    
    const countEl = document.getElementById('historyCount');
    if (countEl) countEl.textContent = `📊 ${records.length} سجل`;
    
    if (records.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px; color:#6c757d; background:#f8f9fa; border-radius:8px;">
                🚫 لا توجد سجلات صيانة مطابقة للفلترة
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="scrollable-table">
            <table>
                <thead>
                    <tr style="background:#f8f9fa; border-bottom:2px solid #0d6efd;">
                        <th>📅 التاريخ</th>
                        <th>🚢 المركب</th>
                        <th>🔧 نوع الصيانة</th>
                        <th>⚠️ العطل</th>
                        <th>🔩 الإصلاح</th>
                        <th>قطع الغيار</th>
                        <th>💰 التكلفة</th>
                        <th>⏱️ مدة التوقف</th>
                        <th>📊 الحالة</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    records.slice().reverse().forEach((r, index) => {
        const vesselName = r.vesselName || allVessels.find(v => v.id === r.vesselId)?.name || '-';
        const partsText = r.parts?.length ? r.parts.map(p => `${p.name}(${p.quantity})`).join(', ') : '-';
        
        // حساب مدة التوقف
        let downtime = '-';
        if (r.startDate && r.endDate) {
            const start = new Date(r.startDate);
            const end = new Date(r.endDate);
            const days = Math.floor((end - start) / (1000 * 60 * 60 * 24));
            if (days > 0) downtime = `${days} يوم${days > 1 ? 'اً' : ''}`;
            else if (days === 0) downtime = 'أقل من يوم';
        }
        
        html += `
            <tr style="border-bottom:1px solid #dee2e6;">
                <td style="padding:8px;">${r.date ? new Date(r.date).toLocaleDateString('ar-TN') : '-'}</td>
                <td style="padding:8px;"><strong>${vesselName}</strong></td>
                <td style="padding:8px;">${r.type || '-'}</td>
                <td style="padding:8px;">${r.description || '-'}</td>
                <td style="padding:8px;">${r.repair || '-'}</td>
                <td style="padding:8px; font-size:11px;">${partsText}</td>
                <td style="padding:8px; font-weight:bold; color:#28a745;">${r.cost ? r.cost.toLocaleString() + ' د.ت' : '-'}</td>
                <td style="padding:8px;">${downtime}</td>
                <td style="padding:8px;">
                    <span class="status-badge status-closed">✅ ${r.status === 'مغلقة' ? 'مغلقة' : r.status === 'مكتملة' ? 'مكتملة' : 'ملغية'}</span>
                </td>
            </tr>
        `;
    });
    
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

// ============================================================
// تحديث فلتر السنوات
// ============================================================

function updateYearFilter() {
    const select = document.getElementById('filterYear');
    if (!select) return;
    
    const years = new Set();
    allMaintenance.forEach(r => {
        if (r.date) {
            const year = r.date.split('-')[0];
            if (year) years.add(year);
        }
    });
    
    select.innerHTML = '<option value="">الكل</option>';
    Array.from(years).sort().reverse().forEach(year => {
        select.innerHTML += `<option value="${year}">${year}</option>`;
    });
}

// ============================================================
// تحديث دوال الفلترة
// ============================================================

function applyHistoryFilters() {
    renderHistoryMaintenance();
}

function resetHistoryFilters() {
    document.getElementById('filterVessel').value = '';
    document.getElementById('filterYear').value = '';
    document.getElementById('filterType').value = '';
    document.getElementById('filterUnit').value = '';
    document.getElementById('filterCost').value = '';
    document.getElementById('filterFaultType').value = '';
    renderHistoryMaintenance();
    showAlert('✅ تم إلغاء الفلترة', 'success');
}

// ============================================================
// تحديث دوال loadMaintenance
// ============================================================

function loadMaintenance() {
    const token = getToken();
    if (!token) {
        allMaintenance = getDemoMaintenance();
        renderMaintenanceTables();
        updateYearFilter();
        return;
    }
    fetch('/api/maintenance', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
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

// ============================================================
// بيانات تجريبية للصيانة - مع الحالة الجديدة
// ============================================================

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
            status: 'مغلقة',
            date: '2026-01-20',
            startDate: '2026-01-15',
            endDate: '2026-01-20',
            parts: [
                { name: 'طلمبة زيت', quantity: 1, price: 1200 },
                { name: 'مضخة ماء', quantity: 1, price: 800 },
                { name: 'فلتر زيت', quantity: 2, price: 150 }
            ],
            createdBy: 'Admin'
        },
        {
            id: 2,
            vesselId: 9,
            vesselName: 'صقر 2',
            type: 'دورية',
            unit: 'وحدة الصيانة والإسناد البحري صفاقس',
            technician: 'فني 2',
            description: 'صيانة دورية للمحرك',
            repair: 'تم تغيير الزيوت والفلتر',
            faultType: 'محرك',
            cost: 300,
            notes: 'تم تغيير الزيوت والفلتر',
            status: 'مغلقة',
            date: '2026-05-15',
            startDate: '2026-05-14',
            endDate: '2026-05-15',
            parts: [
                { name: 'زيت محرك', quantity: 5, price: 100 },
                { name: 'فلتر هواء', quantity: 1, price: 300 }
            ],
            createdBy: 'Admin'
        },
        {
            id: 3,
            vesselId: 14,
            vesselName: 'خافر 2',
            type: 'كبرى',
            unit: 'وحدة الصيانة والإسناد البحري المنستير',
            technician: 'فني 3',
            description: 'إصلاح شامل للهيكل',
            repair: 'تم تغيير ألواح الهيكل والدهان',
            faultType: 'هيكل',
            cost: 5000,
            notes: 'تم تغيير ألواح الهيكل والدهان المضاد للصدأ',
            status: 'مغلقة',
            date: '2026-01-10',
            startDate: '2026-01-05',
            endDate: '2026-01-10',
            parts: [
                { name: 'ألواح فولاذ', quantity: 10, price: 350 },
                { name: 'دهان مضاد للصدأ', quantity: 5, price: 200 }
            ],
            createdBy: 'Admin'
        },
        {
            id: 4,
            vesselId: 6,
            vesselName: 'البروق 6',
            type: 'عادية',
            unit: 'وحدة الصيانة والإسناد البحري جرجيس',
            technician: 'فني 4',
            description: 'عطل في النظام الكهربائي',
            repair: 'تم تغيير البطاريات والكابلات',
            faultType: 'كهرباء',
            cost: 1200,
            notes: 'تم تغيير البطاريات والكابلات',
            status: 'مغلقة',
            date: '2026-02-05',
            startDate: '2026-02-03',
            endDate: '2026-02-05',
            parts: [
                { name: 'بطارية', quantity: 2, price: 450 },
                { name: 'كابلات', quantity: 3, price: 100 }
            ],
            createdBy: 'Admin'
        },
        {
            id: 5,
            vesselId: 19,
            vesselName: 'زورق مزدوج 3',
            type: 'طارئة',
            unit: 'وحدة الصيانة والإسناد البحري تونس',
            technician: 'فني 1',
            description: 'عطل في نظام التوجيه',
            repair: 'تم تغيير طرمبة التوجيه',
            faultType: 'توجيه',
            cost: 1800,
            notes: 'تم تغيير طرمبة التوجيه بالكامل',
            status: 'قيد الإنجاز',
            date: '2026-02-10',
            startDate: '2026-02-08',
            endDate: null,
            parts: [
                { name: 'طرمبة توجيه', quantity: 1, price: 1500 },
                { name: 'زيت هيدروليك', quantity: 3, price: 100 }
            ],
            createdBy: 'Admin'
        },
        {
            id: 6,
            vesselId: 11,
            vesselName: 'صقر 4',
            type: 'كبرى',
            unit: 'وحدة الصيانة والإسناد البحري صفاقس',
            technician: 'فني 2',
            description: 'عطل في نظام التبريد',
            repair: 'تم تغيير الراديتر والمراوح',
            faultType: 'تبريد',
            cost: 3200,
            notes: 'تم تغيير نظام التبريد بالكامل',
            status: 'مغلقة',
            date: '2026-07-15',
            startDate: '2026-07-10',
            endDate: '2026-07-15',
            parts: [
                { name: 'راديتر', quantity: 1, price: 2000 },
                { name: 'مراوح تبريد', quantity: 2, price: 400 },
                { name: 'ماء مقطر', quantity: 10, price: 40 }
            ],
            createdBy: 'Admin'
        }
    ];
}
