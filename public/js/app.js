// ============================================================
// 📊 صفحة الجاهزية - الكود الكامل
// ============================================================

function renderEfficiency() {
    console.log('📊 Rendering efficiency, vessels:', allVessels.length);
    const vessels = allVessels || [];
    
    const countEl = document.getElementById('effCount');
    if (countEl) countEl.textContent = `📊 ${vessels.length} مركب`;
    
    updateEfficiencyStats(vessels);
    renderGeneralEfficiencyTable(vessels);
    renderCategoryEfficiencyTable(vessels);
    renderRegionEfficiencyTables(vessels);
}

function updateEfficiencyStats(vessels) {
    const statsContainer = document.getElementById('statsCards');
    if (!statsContainer) return;
    
    const total = vessels.length;
    const good = vessels.filter(v => v.stat === 'صالح').length;
    const bad = vessels.filter(v => v.stat === 'معطب').length;
    const maint = vessels.filter(v => v.stat === 'صيانة').length;
    const eff = total > 0 ? Math.round((good / total) * 100) : 0;
    
    statsContainer.innerHTML = `
        <div class="stat-card" style="background:#28a745;"><h3>${good}</h3><p>✅ صالح</p></div>
        <div class="stat-card" style="background:#dc3545;"><h3>${bad}</h3><p>❌ معطب</p></div>
        <div class="stat-card" style="background:#ffc107; color:#1a3a5c;"><h3>${maint}</h3><p>🔧 صيانة</p></div>
        <div class="stat-card" style="background:#17a2b8;"><h3>${eff}%</h3><p>📊 الجاهزية</p></div>
    `;
}

// ============================================================
// 1. الجدول العام للمراكب
// ============================================================

function renderGeneralEfficiencyTable(vessels) {
    const container = document.getElementById('generalEffTableContainer');
    if (!container) return;
    
    if (!vessels || vessels.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px; color:#6c757d; background:white; border-radius:10px;">
                🚫 لا توجد مراكب مسجلة
            </div>
        `;
        return;
    }
    
    const sorted = [...vessels].sort((a, b) => {
        const order = { 'صالح': 0, 'صيانة': 1, 'معطب': 2 };
        return (order[a.stat] || 3) - (order[b.stat] || 3);
    });
    
    let html = `
        <div class="efficiency-table-wrapper">
            <div class="table-title">
                <i class="fas fa-ship"></i> 
                الجدول العام للمراكب
                <span style="font-size:12px; font-weight:400; color:#6c757d; margin-right:10px;">
                    (${vessels.length} مركب)
                </span>
            </div>
            <div class="scrollable-table">
                <table>
                    <thead>
                        <tr>
                            <th style="text-align:right;">#</th>
                            <th style="text-align:right;">المركب</th>
                            <th style="text-align:center;">الرقم</th>
                            <th style="text-align:center;">الفئة</th>
                            <th style="text-align:center;">الإقليم</th>
                            <th style="text-align:center;">المنطقة</th>
                            <th style="text-align:center;">الحالة</th>
                            <th style="text-align:center;">آخر صيانة</th>
                            <th style="text-align:center;">الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    sorted.forEach((v, index) => {
        const statusColor = v.stat === 'صالح' ? '#28a745' : v.stat === 'معطب' ? '#dc3545' : '#ffc107';
        const statusIcon = v.stat === 'صالح' ? '✅' : v.stat === 'معطب' ? '❌' : '🔧';
        
        const lastMaintenance = allMaintenance
            .filter(r => r.vesselId === v.id)
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        
        const lastMaintDate = lastMaintenance ? new Date(lastMaintenance.date).toLocaleDateString() : '-';
        
        html += `
            <tr>
                <td style="text-align:center;">${index + 1}</td>
                <td style="text-align:right; font-weight:600;">${v.name || '-'}</td>
                <td style="text-align:center;">${v.num || '-'}</td>
                <td style="text-align:center;">${v.cat || '-'}</td>
                <td style="text-align:center;">${v.reg || '-'}</td>
                <td style="text-align:center;">${v.zone || '-'}</td>
                <td style="text-align:center;">
                    <span style="color:${statusColor}; font-weight:600; font-size:13px;">
                        ${statusIcon} ${v.stat}
                    </span>
                </td>
                <td style="text-align:center; font-size:11px;">${lastMaintDate}</td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-info" onclick="viewVesselMaintenance(${v.id})" title="سجل الصيانة">
                        <i class="fas fa-clipboard-list"></i>
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="editVessel(${v.id})" title="تعديل">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

// ============================================================
// 2. النجاعة العامة حسب الفئات
// ============================================================

function renderCategoryEfficiencyTable(vessels) {
    const container = document.getElementById('categoryEffContainer');
    if (!container) return;
    
    const categories = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
    
    let totalAll = 0, goodAll = 0, badAll = 0, maintAll = 0;
    
    let html = `
        <div class="efficiency-table-wrapper">
            <div class="table-title">
                <i class="fas fa-chart-pie"></i> 
                النجاعة العامة حسب الفئات
            </div>
            <div class="scrollable-table">
                <table>
                    <thead>
                        <tr>
                            <th style="text-align:right; background:#0d6efd; color:white; min-width:120px;">الفئة</th>
                            <th style="text-align:center; background:#28a745; color:white; min-width:100px;">✅ الصالحة</th>
                            <th style="text-align:center; background:#dc3545; color:white; min-width:100px;">❌ المعطبة</th>
                            <th style="text-align:center; background:#ffc107; color:#1a3a5c; min-width:100px;">🔧 الصيانة</th>
                            <th style="text-align:center; background:#0d6efd; color:white; min-width:80px;">📊 الإجمالي</th>
                            <th style="text-align:center; background:#17a2b8; color:white; min-width:100px;">📈 النسبة</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    categories.forEach(cat => {
        const catVessels = vessels.filter(v => v.cat === cat);
        const total = catVessels.length;
        const good = catVessels.filter(v => v.stat === 'صالح').length;
        const bad = catVessels.filter(v => v.stat === 'معطب').length;
        const maint = catVessels.filter(v => v.stat === 'صيانة').length;
        const eff = total > 0 ? Math.round((good / total) * 100) : 0;
        
        totalAll += total; goodAll += good; badAll += bad; maintAll += maint;
        const color = eff >= 80 ? '#28a745' : eff >= 50 ? '#ffc107' : '#dc3545';
        
        html += `
            <tr style="border-bottom:1px solid #e9ecef;">
                <td style="padding:8px; text-align:right; font-weight:bold;">${cat}</td>
                <td style="padding:8px; text-align:center; font-weight:bold; color:#28a745;">${good}</td>
                <td style="padding:8px; text-align:center; font-weight:bold; color:#dc3545;">${bad}</td>
                <td style="padding:8px; text-align:center; font-weight:bold; color:#ffc107;">${maint}</td>
                <td style="padding:8px; text-align:center; font-weight:bold;">${total}</td>
                <td style="padding:8px; text-align:center; font-weight:bold; color:${color};">
                    ${eff}%
                </td>
            </tr>
        `;
    });
    
    const totalEff = totalAll > 0 ? Math.round((goodAll / totalAll) * 100) : 0;
    const totalColor = totalEff >= 80 ? '#28a745' : totalEff >= 50 ? '#ffc107' : '#dc3545';
    
    html += `
                    <tr style="background:#e3f2fd; border-top:2px solid #0d6efd; font-weight:bold;">
                        <td style="padding:8px; text-align:right; font-size:14px;">📊 المجموع الكلي</td>
                        <td style="padding:8px; text-align:center; color:#28a745; font-size:14px;">${goodAll}</td>
                        <td style="padding:8px; text-align:center; color:#dc3545; font-size:14px;">${badAll}</td>
                        <td style="padding:8px; text-align:center; color:#ffc107; font-size:14px;">${maintAll}</td>
                        <td style="padding:8px; text-align:center; font-size:14px;">${totalAll}</td>
                        <td style="padding:8px; text-align:center; color:${totalColor}; font-size:16px;">
                            ${totalEff}%
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="progress-section">
            <div class="progress-label">
                <span>📈 نسبة الجاهزية العامة: <strong style="color:${totalColor};">${totalEff}%</strong></span>
                <span class="status" style="color:${totalColor};">
                    ${totalEff >= 80 ? '✅ ممتاز' : totalEff >= 50 ? '⚠️ متوسط' : '❌ منخفض'}
                </span>
            </div>
            <div class="progress-track">
                <div class="progress-fill" style="width:${totalEff}%; background:${totalColor};"></div>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

// ============================================================
// 3. جداول الأقاليم (نفس شكل النجاعة العامة)
// ============================================================

function renderRegionEfficiencyTables(vessels) {
    const container = document.getElementById('regionsEffContainer');
    if (!container) return;
    
    const regions = [
        { name: '🗺️ الحرس البحري بالشمال', key: 'الشمال' },
        { name: '🗺️ الحرس البحري بالساحل', key: 'الساحل' },
        { name: '🗺️ الحرس البحري بالوسط', key: 'الوسط' },
        { name: '🗺️ الحرس البحري بالجنوب', key: 'الجنوب' }
    ];
    
    const categories = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
    let html = '';
    
    regions.forEach(region => {
        const regionVessels = vessels.filter(v => v.reg === region.key);
        const totalRegion = regionVessels.length;
        
        let totalAll = 0, goodAll = 0, badAll = 0, maintAll = 0;
        let tableRows = '';
        
        categories.forEach(cat => {
            const catVessels = regionVessels.filter(v => v.cat === cat);
            const total = catVessels.length;
            const good = catVessels.filter(v => v.stat === 'صالح').length;
            const bad = catVessels.filter(v => v.stat === 'معطب').length;
            const maint = catVessels.filter(v => v.stat === 'صيانة').length;
            const eff = total > 0 ? Math.round((good / total) * 100) : 0;
            
            totalAll += total; goodAll += good; badAll += bad; maintAll += maint;
            const color = eff >= 80 ? '#28a745' : eff >= 50 ? '#ffc107' : '#dc3545';
            
            tableRows += `
                <tr style="border-bottom:1px solid #e9ecef;">
                    <td style="padding:6px; text-align:right; font-weight:bold;">${cat}</td>
                    <td style="padding:6px; text-align:center; font-weight:bold; color:#28a745;">${good}</td>
                    <td style="padding:6px; text-align:center; font-weight:bold; color:#dc3545;">${bad}</td>
                    <td style="padding:6px; text-align:center; font-weight:bold; color:#ffc107;">${maint}</td>
                    <td style="padding:6px; text-align:center; font-weight:bold;">${total}</td>
                    <td style="padding:6px; text-align:center; font-weight:bold; color:${color};">
                        ${eff}%
                    </td>
                </tr>
            `;
        });
        
        const totalEff = totalAll > 0 ? Math.round((goodAll / totalAll) * 100) : 0;
        const totalColor = totalEff >= 80 ? '#28a745' : totalEff >= 50 ? '#ffc107' : '#dc3545';
        
        html += `
            <div class="region-table-card">
                <div class="region-table-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
                    <span>
                        ${region.name}
                        <span style="font-size:12px; font-weight:400; color:#6c757d; margin-right:10px;">
                            📊 ${totalRegion} مركب
                        </span>
                    </span>
                    <span style="font-size:12px; font-weight:400;">
                        ✅ ${goodAll} | 🔧 ${maintAll} | ❌ ${badAll}
                        <span style="color:${totalColor}; font-weight:700; margin-right:10px;">
                            ${totalEff}% جاهزية
                        </span>
                    </span>
                </div>
                <div class="scrollable-table">
                    <table>
                        <thead>
                            <tr>
                                <th style="text-align:right; background:#0d6efd; color:white; min-width:100px;">الفئة</th>
                                <th style="text-align:center; background:#28a745; color:white; min-width:80px;">✅ الصالحة</th>
                                <th style="text-align:center; background:#dc3545; color:white; min-width:80px;">❌ المعطبة</th>
                                <th style="text-align:center; background:#ffc107; color:#1a3a5c; min-width:80px;">🔧 الصيانة</th>
                                <th style="text-align:center; background:#0d6efd; color:white; min-width:70px;">📊 الإجمالي</th>
                                <th style="text-align:center; background:#17a2b8; color:white; min-width:80px;">📈 النسبة</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${totalAll === 0 ? `
                                <tr>
                                    <td colspan="6" style="text-align:center; padding:20px; color:#6c757d;">
                                        🚫 لا توجد مراكب في هذا الإقليم
                                    </td>
                                </tr>
                            ` : tableRows}
                            ${totalAll > 0 ? `
                                <tr style="background:#e3f2fd; border-top:2px solid #0d6efd; font-weight:bold;">
                                    <td style="padding:6px; text-align:right; font-size:13px;">📊 المجموع</td>
                                    <td style="padding:6px; text-align:center; color:#28a745; font-size:13px;">${goodAll}</td>
                                    <td style="padding:6px; text-align:center; color:#dc3545; font-size:13px;">${badAll}</td>
                                    <td style="padding:6px; text-align:center; color:#ffc107; font-size:13px;">${maintAll}</td>
                                    <td style="padding:6px; text-align:center; font-size:13px;">${totalAll}</td>
                                    <td style="padding:6px; text-align:center; color:${totalColor}; font-size:14px;">
                                        ${totalEff}%
                                    </td>
                                </tr>
                            ` : ''}
                        </tbody>
                    </table>
                </div>
                ${totalAll > 0 ? `
                    <div style="padding:8px 15px; background:#f8f9fa; border-top:1px solid #e9ecef;">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
                            <span style="font-size:12px; color:#6c757d;">
                                📊 نسبة الجاهزية: <strong style="color:${totalColor};">${totalEff}%</strong>
                            </span>
                            <div style="flex:1; max-width:200px; margin:0 10px;">
                                <div style="background:#e9ecef; border-radius:10px; height:6px; overflow:hidden;">
                                    <div style="width:${totalEff}%; height:100%; background:${totalColor}; border-radius:10px; transition:width 0.5s;"></div>
                                </div>
                            </div>
                            <span style="font-size:11px; color:#6c757d;">
                                ✅ ${goodAll} صالح | 🔧 ${maintAll} صيانة | ❌ ${badAll} معطب
                            </span>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    });
    
    container.innerHTML = html;
}
