// ============================================================
// الجاهزية - efficiency.js
// ============================================================

function renderEfficiency() {
    const vessels = allVessels || [];
    const countEl = document.getElementById('effCount');
    if (countEl) countEl.textContent = vessels.length;
    renderEfficiencyTables(vessels);
    updateEfficiencyStats(vessels);
    setTimeout(() => {
        renderCategoryChart(vessels);
        renderDoughnutChart(vessels);
    }, 200);
}

function updateEfficiencyStats(vessels) {
    const container = document.getElementById('efficiencyStats');
    if (!container) return;
    const total = vessels.length;
    const ready = vessels.filter(v => v.stat === 'صالح').length;
    const broken = vessels.filter(v => v.stat === 'معطب').length;
    const maintenance = vessels.filter(v => v.stat === 'صيانة').length;
    container.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(100px, 1fr)); gap:8px; margin:8px 0;">
            <div class="stat-card" style="padding:8px 12px;"><div style="font-size:18px; font-weight:bold; color:#60a5fa;">${total}</div><div style="color:rgba(255,255,255,0.3); font-size:10px;">🚢 المجموع</div></div>
            <div class="stat-card" style="padding:8px 12px; border-color:rgba(74,222,128,0.1);"><div style="font-size:18px; font-weight:bold; color:#4ade80;">${ready}</div><div style="color:rgba(255,255,255,0.3); font-size:10px;">✅ صالح</div></div>
            <div class="stat-card" style="padding:8px 12px; border-color:rgba(251,191,36,0.1);"><div style="font-size:18px; font-weight:bold; color:#fbbf24;">${maintenance}</div><div style="color:rgba(255,255,255,0.3); font-size:10px;">🔧 صيانة</div></div>
            <div class="stat-card" style="padding:8px 12px; border-color:rgba(248,113,113,0.1);"><div style="font-size:18px; font-weight:bold; color:#f87171;">${broken}</div><div style="color:rgba(255,255,255,0.3); font-size:10px;">❌ معطب</div></div>
        </div>
    `;
}

function renderEfficiencyTables(vessels) {
    const container = document.getElementById('efficiencyTablesContainer');
    if (!container) return;
    let html = renderGeneralEfficiencyTable(vessels);
    const regions = { 'الشمال': ['بنزرت', 'طبرقة', 'المرسى', 'غار الملح'], 'الساحل': ['سوسة', 'المنستير', 'المهدية'], 'الوسط': ['صفاقس', 'قابس', 'جربة'], 'الجنوب': ['جرجيس', 'بن قردان'] };
    Object.keys(regions).forEach(region => {
        const regionVessels = vessels.filter(v => regions[region].some(city => v.zone?.includes(city)));
        if (regionVessels.length > 0) html += renderRegionEfficiencyTable(regionVessels, region);
    });
    container.innerHTML = html;
}

function renderGeneralEfficiencyTable(vessels) {
    const categories = getCategoriesData(vessels);
    let html = `<div class="stat-card" style="padding:12px; margin:10px 0;"><h4 style="color:rgba(255,255,255,0.6); font-size:13px;">📋 النجاعة العامة حسب الفئات</h4><div class="scrollable-table"><table><thead><tr><th>الفئة</th><th style="color:#4ade80;">صالح</th><th style="color:#f87171;">معطب</th><th style="color:#fbbf24;">صيانة</th><th>الإجمالي</th><th>النسبة</th></tr></thead><tbody>`;
    let totalReady = 0, totalBroken = 0, totalMaintenance = 0, totalAll = 0;
    const order = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
    order.forEach(cat => {
        const data = categories[cat] || { ready: 0, broken: 0, maintenance: 0, total: 0 };
        const pct = data.total > 0 ? Math.round((data.ready / data.total) * 100) : 0;
        totalReady += data.ready; totalBroken += data.broken; totalMaintenance += data.maintenance; totalAll += data.total;
        html += `<tr><td><strong>${cat}</strong></td><td style="color:#4ade80;">${data.ready}</td><td style="color:#f87171;">${data.broken}</td><td style="color:#fbbf24;">${data.maintenance}</td><td>${data.total}</td><td>${pct}%</td></tr>`;
    });
    const totalPct = totalAll > 0 ? Math.round((totalReady / totalAll) * 100) : 0;
    html += `<tr style="border-top:2px solid rgba(255,255,255,0.1);"><td><strong>المجموع</strong></td><td style="color:#4ade80;">${totalReady}</td><td style="color:#f87171;">${totalBroken}</td><td style="color:#fbbf24;">${totalMaintenance}</td><td>${totalAll}</td><td>${totalPct}%</td></tr>`;
    html += '</tbody></table></div></div>';
    return html;
}

function renderRegionEfficiencyTable(vessels, regionName) {
    const categories = getCategoriesData(vessels);
    let html = `<div class="stat-card" style="padding:12px; margin:10px 0;"><h4 style="color:rgba(255,255,255,0.6); font-size:13px;">📋 إقليم الحرس البحري بال${regionName}</h4><div class="scrollable-table"><table><thead><tr><th>الفئة</th><th style="color:#4ade80;">صالح</th><th style="color:#f87171;">معطب</th><th style="color:#fbbf24;">صيانة</th><th>الإجمالي</th><th>النسبة</th></tr></thead><tbody>`;
    let totalReady = 0, totalBroken = 0, totalMaintenance = 0, totalAll = 0;
    const order = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
    order.forEach(cat => {
        const data = categories[cat] || { ready: 0, broken: 0, maintenance: 0, total: 0 };
        const pct = data.total > 0 ? Math.round((data.ready / data.total) * 100) : 0;
        totalReady += data.ready; totalBroken += data.broken; totalMaintenance += data.maintenance; totalAll += data.total;
        html += `<tr><td><strong>${cat}</strong></td><td style="color:#4ade80;">${data.ready}</td><td style="color:#f87171;">${data.broken}</td><td style="color:#fbbf24;">${data.maintenance}</td><td>${data.total}</td><td>${pct}%</td></tr>`;
    });
    const totalPct = totalAll > 0 ? Math.round((totalReady / totalAll) * 100) : 0;
    html += `<tr style="border-top:2px solid rgba(255,255,255,0.1);"><td><strong>المجموع</strong></td><td style="color:#4ade80;">${totalReady}</td><td style="color:#f87171;">${totalBroken}</td><td style="color:#fbbf24;">${totalMaintenance}</td><td>${totalAll}</td><td>${totalPct}%</td></tr>`;
    html += '</tbody></table></div></div>';
    return html;
}

function getCategoriesData(vessels) {
    const categories = {};
    vessels.forEach(v => {
        const cat = v.cat || 'غير مصنف';
        if (!categories[cat]) categories[cat] = { ready: 0, broken: 0, maintenance: 0, total: 0 };
        categories[cat].total++;
        if (v.stat === 'صالح') categories[cat].ready++;
        else if (v.stat === 'معطب') categories[cat].broken++;
        else if (v.stat === 'صيانة') categories[cat].maintenance++;
    });
    return categories;
}

console.log('✅ efficiency.js loaded');
