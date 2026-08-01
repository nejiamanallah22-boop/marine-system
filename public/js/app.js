// ============================================================
// 📊 صفحة الجاهزية - الجداول الكاملة
// ============================================================

function renderEfficiency() {
    console.log('📊 Rendering efficiency, vessels:', allVessels.length);
    const vessels = allVessels || [];
    
    // تحديث العداد
    const countEl = document.getElementById('effCount');
    if (countEl) countEl.textContent = `📊 ${vessels.length} مركب`;
    
    // عرض جميع الجداول
    renderEfficiencyTables(vessels);
}

// ============================================================
// الجدول الرئيسي: النجاعة العامة حسب الفئات
// ============================================================

function renderEfficiencyTables(vessels) {
    const container = document.getElementById('efficiencyTablesContainer');
    if (!container) return;
    
    let html = '';
    
    // 1. النجاعة العامة حسب الفئات
    html += renderGeneralEfficiency(vessels);
    
    // 2. أقاليم الحرس البحري
    const regions = {
        'الشمال': ['بنزرت', 'طبرقة', 'المرسى', 'غار الملح', 'رأس الجبل'],
        'الساحل': ['سوسة', 'المنستير', 'المهدية', 'حمام سوسة', 'قليبية', 'نابل'],
        'الوسط': ['صفاقس', 'قابس', 'جربة', 'القطار', 'المحرس'],
        'الجنوب': ['جرجيس', 'بن قردان', 'ذراع الساحل', 'الطينة']
    };
    
    Object.keys(regions).forEach(regionName => {
        const regionVessels = vessels.filter(v => {
            const zone = v.zone || '';
            const port = v.port || '';
            return regions[regionName].some(city => 
                zone.includes(city) || port.includes(city)
            );
        });
        html += renderRegionEfficiency(regionVessels, regionName);
    });
    
    container.innerHTML = html;
}

// ============================================================
// دالة عرض جدول الفئات
// ============================================================

function renderGeneralEfficiency(vessels) {
    const categories = getCategoriesData(vessels);
    
    let html = `
        <div style="background:white; border-radius:10px; padding:20px; margin:20px 0; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
            <h3 style="color:#0d6efd; margin-bottom:15px;">📋 1. النجاعة العامة حسب الفئات</h3>
            <div style="overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse; text-align:center; font-size:14px;">
                    <thead>
                        <tr style="background:#f8f9fa; border-bottom:2px solid #dee2e6;">
                            <th style="padding:10px;">الفئة</th>
                            <th style="padding:10px; color:#28a745;">✅ الصالحة</th>
                            <th style="padding:10px; color:#dc3545;">❌ المعطبة</th>
                            <th style="padding:10px; color:#ffc107;">🔧 الصيانة</th>
                            <th style="padding:10px; color:#0d6efd;">📊 الإجمالي</th>
                            <th style="padding:10px; color:#6c757d;">📈 النسبة</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    let totalReady = 0, totalBroken = 0, totalMaintenance = 0, totalAll = 0;
    
    Object.keys(categories).sort().forEach(cat => {
        const data = categories[cat];
        const readyPercent = data.total > 0 ? Math.round((data.ready / data.total) * 100) : 0;
        totalReady += data.ready;
        totalBroken += data.broken;
        totalMaintenance += data.maintenance;
        totalAll += data.total;
        
        html += `
            <tr style="border-bottom:1px solid #dee2e6;">
                <td style="padding:10px; font-weight:bold;">${cat}</td>
                <td style="padding:10px; color:#28a745; font-weight:bold;">${data.ready}</td>
                <td style="padding:10px; color:#dc3545; font-weight:bold;">${data.broken}</td>
                <td style="padding:10px; color:#ffc107; font-weight:bold;">${data.maintenance}</td>
                <td style="padding:10px; font-weight:bold;">${data.total}</td>
                <td style="padding:10px;">
                    <div style="display:flex; align-items:center; gap:8px; justify-content:center;">
                        <div style="width:80px; height:8px; background:#e9ecef; border-radius:4px; overflow:hidden;">
                            <div style="width:${readyPercent}%; height:100%; background:${readyPercent >= 70 ? '#28a745' : readyPercent >= 40 ? '#ffc107' : '#dc3545'}; border-radius:4px;"></div>
                        </div>
                        <span style="font-weight:bold; min-width:40px;">${readyPercent}%</span>
                    </div>
                </td>
            </tr>
        `;
    });
    
    const totalPercent = totalAll > 0 ? Math.round((totalReady / totalAll) * 100) : 0;
    html += `
        <tr style="background:#e7f3ff; border-top:2px solid #0d6efd; font-weight:bold;">
            <td style="padding:12px;">📊 المجموع الكلي</td>
            <td style="padding:12px; color:#28a745;">${totalReady}</td>
            <td style="padding:12px; color:#dc3545;">${totalBroken}</td>
            <td style="padding:12px; color:#ffc107;">${totalMaintenance}</td>
            <td style="padding:12px;">${totalAll}</td>
            <td style="padding:12px;">
                <div style="display:flex; align-items:center; gap:8px; justify-content:center;">
                    <div style="width:80px; height:8px; background:#e9ecef; border-radius:4px; overflow:hidden;">
                        <div style="width:${totalPercent}%; height:100%; background:${totalPercent >= 70 ? '#28a745' : totalPercent >= 40 ? '#ffc107' : '#dc3545'}; border-radius:4px;"></div>
                    </div>
                    <span style="min-width:40px;">${totalPercent}%</span>
                </div>
            </td>
        </tr>
    `;
    
    html += `</tbody></table></div></div>`;
    return html;
}

// ============================================================
// دالة عرض جدول الإقليم
// ============================================================

function renderRegionEfficiency(vessels, regionName) {
    const categories = getCategoriesData(vessels);
    
    if (Object.keys(categories).length === 0 || vessels.length === 0) {
        return `
            <div style="background:white; border-radius:10px; padding:20px; margin:20px 0; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
                <h3 style="color:#0d6efd; margin-bottom:15px;">📋 إقليم الحرس البحري بال${regionName}</h3>
                <p style="text-align:center; padding:20px; color:#6c757d;">🚫 لا توجد مراكب في هذا الإقليم</p>
            </div>
        `;
    }
    
    let html = `
        <div style="background:white; border-radius:10px; padding:20px; margin:20px 0; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
            <h3 style="color:#0d6efd; margin-bottom:15px;">📋 إقليم الحرس البحري بال${regionName}</h3>
            <div style="overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse; text-align:center; font-size:14px;">
                    <thead>
                        <tr style="background:#f8f9fa; border-bottom:2px solid #dee2e6;">
                            <th style="padding:10px;">الفئة</th>
                            <th style="padding:10px; color:#28a745;">✅ الصالحة</th>
                            <th style="padding:10px; color:#dc3545;">❌ المعطبة</th>
                            <th style="padding:10px; color:#ffc107;">🔧 الصيانة</th>
                            <th style="padding:10px; color:#0d6efd;">📊 الإجمالي</th>
                            <th style="padding:10px; color:#6c757d;">📈 النسبة</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    let totalReady = 0, totalBroken = 0, totalMaintenance = 0, totalAll = 0;
    
    // ترتيب الفئات المحددة
    const categoryOrder = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
    
    categoryOrder.forEach(cat => {
        if (categories[cat]) {
            const data = categories[cat];
            const readyPercent = data.total > 0 ? Math.round((data.ready / data.total) * 100) : 0;
            totalReady += data.ready;
            totalBroken += data.broken;
            totalMaintenance += data.maintenance;
            totalAll += data.total;
            
            html += `
                <tr style="border-bottom:1px solid #dee2e6;">
                    <td style="padding:10px; font-weight:bold;">${cat}</td>
                    <td style="padding:10px; color:#28a745; font-weight:bold;">${data.ready}</td>
                    <td style="padding:10px; color:#dc3545; font-weight:bold;">${data.broken}</td>
                    <td style="padding:10px; color:#ffc107; font-weight:bold;">${data.maintenance}</td>
                    <td style="padding:10px; font-weight:bold;">${data.total}</td>
                    <td style="padding:10px;">
                        <div style="display:flex; align-items:center; gap:8px; justify-content:center;">
                            <div style="width:80px; height:8px; background:#e9ecef; border-radius:4px; overflow:hidden;">
                                <div style="width:${readyPercent}%; height:100%; background:${readyPercent >= 70 ? '#28a745' : readyPercent >= 40 ? '#ffc107' : '#dc3545'}; border-radius:4px;"></div>
                            </div>
                            <span style="font-weight:bold; min-width:40px;">${readyPercent}%</span>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            // عرض الفئة بصفر
            html += `
                <tr style="border-bottom:1px solid #dee2e6; color:#6c757d;">
                    <td style="padding:10px; font-weight:bold;">${cat}</td>
                    <td style="padding:10px;">0</td>
                    <td style="padding:10px;">0</td>
                    <td style="padding:10px;">0</td>
                    <td style="padding:10px;">0</td>
                    <td style="padding:10px;">
                        <div style="display:flex; align-items:center; gap:8px; justify-content:center;">
                            <div style="width:80px; height:8px; background:#e9ecef; border-radius:4px; overflow:hidden;">
                                <div style="width:0%; height:100%; background:#6c757d; border-radius:4px;"></div>
                            </div>
                            <span style="font-weight:bold; min-width:40px;">0%</span>
                        </div>
                    </td>
                </tr>
            `;
        }
    });
    
    const totalPercent = totalAll > 0 ? Math.round((totalReady / totalAll) * 100) : 0;
    html += `
        <tr style="background:#e7f3ff; border-top:2px solid #0d6efd; font-weight:bold;">
            <td style="padding:12px;">📊 المجموع الكلي</td>
            <td style="padding:12px; color:#28a745;">${totalReady}</td>
            <td style="padding:12px; color:#dc3545;">${totalBroken}</td>
            <td style="padding:12px; color:#ffc107;">${totalMaintenance}</td>
            <td style="padding:12px;">${totalAll}</td>
            <td style="padding:12px;">
                <div style="display:flex; align-items:center; gap:8px; justify-content:center;">
                    <div style="width:80px; height:8px; background:#e9ecef; border-radius:4px; overflow:hidden;">
                        <div style="width:${totalPercent}%; height:100%; background:${totalPercent >= 70 ? '#28a745' : totalPercent >= 40 ? '#ffc107' : '#dc3545'}; border-radius:4px;"></div>
                    </div>
                    <span style="min-width:40px;">${totalPercent}%</span>
                </div>
            </td>
        </tr>
    `;
    
    html += `</tbody></table></div></div>`;
    return html;
}

// ============================================================
// دالة تجميع البيانات حسب الفئة
// ============================================================

function getCategoriesData(vessels) {
    const categories = {};
    
    vessels.forEach(v => {
        const cat = v.cat || 'غير مصنف';
        if (!categories[cat]) {
            categories[cat] = { ready: 0, broken: 0, maintenance: 0, total: 0 };
        }
        categories[cat].total++;
        if (v.stat === 'صالح') categories[cat].ready++;
        else if (v.stat === 'معطب') categories[cat].broken++;
        else if (v.stat === 'صيانة') categories[cat].maintenance++;
    });
    
    return categories;
}

// ============================================================
// دالة تصدير البيانات (اختياري)
// ============================================================

function exportEfficiencyData() {
    const vessels = allVessels || [];
    if (vessels.length === 0) {
        showAlert('⚠️ لا توجد بيانات للتصدير', 'warning');
        return;
    }
    
    // إنشاء ملف CSV
    let csv = 'الفئة,المركب,الرقم,الحالة,المنطقة,الميناء\n';
    vessels.forEach(v => {
        csv += `${v.cat || ''},${v.name || ''},${v.num || ''},${v.stat || ''},${v.zone || ''},${v.port || ''}\n`;
    });
    
    // تحميل الملف
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `الجاهزية_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showAlert('✅ تم تصدير البيانات بنجاح', 'success');
}
