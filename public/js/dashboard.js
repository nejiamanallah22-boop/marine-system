
// ==================== دوال الجاهزية والإحصائيات ====================

let fleetChart = null, categoriesChart = null, comparisonChart = null;
let currentChartType = 'doughnut';

async function renderGeneralEfficiencyTable() {
    try {
        let data = await loadVessels();
        let totalOk = data.filter(x => x.stat === 'صالح').length;
        let totalAll = data.length;
        let generalEff = totalAll ? ((totalOk / totalAll) * 100).toFixed(1) : 0;
        
        let html = `<div class="region-table-card">
            <div class="region-table-header">📊 النجاعة العامة للأسطول <span style="background:#ffd966; color:#2e7d32; padding:4px 12px; border-radius:20px;">الجاهزية: ${generalEff}% (${totalOk}/${totalAll})</span></div>
            <div class="scrollable-table">
            <table class="region-table">
                <thead><tr><th>الفئة</th><th>عدد الصالح</th><th>عدد المعطوب</th><th>نسبة النجاعة</th></tr></thead>
                <tbody>`;
        
        CATS_LIST.forEach(cat => {
            let catData = data.filter(x => x.cat === cat);
            let ok = catData.filter(x => x.stat === 'صالح').length;
            let broken = catData.filter(x => x.stat !== 'صالح').length;
            let percent = catData.length ? ((ok / catData.length) * 100).toFixed(1) : 0;
            let rowClass = percent >= 80 ? 'high-eff' : (percent >= 50 ? 'mid-eff' : 'low-eff');
            html += `<tr class="${rowClass}">
                <td>${cat}</td>
                <td style="color:green; font-weight:bold;">${ok}</td>
                <td style="color:red; font-weight:bold;">${broken}</td>
                <td><strong>${percent}%</strong></td>
            </tr>`;
        });
        
        html += `</tbody>
            </table>
            </div>
            </div>`;
        document.getElementById('generalEffTableContainer').innerHTML = html;
    } catch(error) {
        console.error('خطأ:', error);
        document.getElementById('generalEffTableContainer').innerHTML = '<div class="region-table-card"><div class="region-table-header">❌ خطأ في تحميل البيانات</div></div>';
    }
}

async function renderStatsCards() {
    try {
        let data = await loadVessels();
        let total = data.length;
        let ok = data.filter(x => x.stat === 'صالح').length;
        let maint = data.filter(x => x.stat === 'صيانة').length;
        let broken = data.filter(x => x.stat === 'معطب').length;
        let eff = total ? ((ok / total) * 100).toFixed(1) : 0;
        document.getElementById('statsCards').innerHTML = `
            <div class="stat-card"><div class="number">${total}</div><div class="label">🚢 إجمالي المراكب</div></div>
            <div class="stat-card"><div class="number">${ok}</div><div class="label">✅ الصالح</div></div>
            <div class="stat-card"><div class="number">${maint}</div><div class="label">🔧 تحت الصيانة</div></div>
            <div class="stat-card"><div class="number">${broken}</div><div class="label">⚠️ المعطوب</div></div>
            <div class="stat-card"><div class="number">${eff}%</div><div class="label">📈 نسبة النجاعة</div></div>
        `;
    } catch(error) {
        console.error('خطأ:', error);
        document.getElementById('statsCards').innerHTML = '<div class="stat-card"><div class="number">0</div><div>خطأ</div></div>';
    }
}

async function renderCharts() {
    try {
        let data = await loadVessels();
        let ok = data.filter(x => x.stat === 'صالح').length;
        let maint = data.filter(x => x.stat === 'صيانة').length;
        let broken = data.filter(x => x.stat === 'معطب').length;
        
        let catCount = {};
        CATS_LIST.forEach(cat => { catCount[cat] = data.filter(x => x.cat === cat).length; });
        
        let regions = [], regionsEff = [];
        Object.keys(ZONES_DATA).forEach(reg => {
            let regData = data.filter(x => x.reg === reg);
            let regOk = regData.filter(x => x.stat === 'صالح').length;
            regions.push(REGION_NAMES[reg] || reg);
            regionsEff.push(regData.length ? (regOk / regData.length * 100) : 0);
        });
        
        document.getElementById('chartsArea').innerHTML = `
            <div class="charts-container">
                <div class="chart-box"><h4>📊 حالة الأسطول</h4><canvas id="fleetChartCanvas"></canvas></div>
                <div class="chart-box"><h4>📦 توزيع المراكب حسب الفئة</h4><canvas id="categoriesChartCanvas"></canvas></div>
                <div class="chart-box"><h4>🏆 مقارنة النجاعة بين الأقاليم</h4><canvas id="comparisonChartCanvas"></canvas></div>
            </div>
        `;
        
        if(fleetChart) fleetChart.destroy();
        if(categoriesChart) categoriesChart.destroy();
        if(comparisonChart) comparisonChart.destroy();
        
        const fleetCtx = document.getElementById('fleetChartCanvas').getContext('2d');
        if(currentChartType === 'doughnut') {
            fleetChart = new Chart(fleetCtx, { type: 'doughnut', data: { labels: ['صالح', 'صيانة', 'معطب'], datasets: [{ data: [ok, maint, broken], backgroundColor: ['#28a745', '#ffc107', '#dc3545'] }] }, options: { responsive: true } });
        } else if(currentChartType === 'bar') {
            fleetChart = new Chart(fleetCtx, { type: 'bar', data: { labels: ['صالح', 'صيانة', 'معطب'], datasets: [{ label: 'عدد المراكب', data: [ok, maint, broken], backgroundColor: ['#28a745', '#ffc107', '#dc3545'] }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } } });
        } else {
            fleetChart = new Chart(fleetCtx, { type: 'line', data: { labels: ['صالح', 'صيانة', 'معطب'], datasets: [{ label: 'عدد المراكب', data: [ok, maint, broken], borderColor: '#2e7d32', fill: true }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } } });
        }
        
        categoriesChart = new Chart(document.getElementById('categoriesChartCanvas').getContext('2d'), { type: 'bar', data: { labels: CATS_LIST, datasets: [{ label: 'عدد المراكب', data: CATS_LIST.map(c => catCount[c] || 0), backgroundColor: '#2e7d32' }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } } });
        
        comparisonChart = new Chart(document.getElementById('comparisonChartCanvas').getContext('2d'), { type: 'line', data: { labels: regions, datasets: [{ label: 'نسبة النجاعة (%)', data: regionsEff, borderColor: '#f39c12', fill: true }] }, options: { responsive: true, scales: { y: { beginAtZero: true, max: 100 } } } });
    } catch(error) {
        console.error('خطأ في renderCharts:', error);
    }
}

async function renderRegionTables() {
    try {
        let data = await loadVessels();
        let selectedRegion = document.getElementById('fRegEff').value;
        let html = "";
        
        const allRegions = ["الشمال", "الساحل", "الوسط", "الجنوب", 
                            "وحدة الصيانة والإسناد البحري تونس", 
                            "وحدة الصيانة والإسناد البحري المنستير",
                            "وحدة الصيانة والإسناد البحري صفاقس",
                            "وحدة الصيانة والإسناد البحري جرجيس",
                            "المجمع الأمني بقبيبة"];
        
        if(selectedRegion === "نجاعة عامة") {
            document.getElementById('regionTables').innerHTML = "";
            return;
        }
        
        if(selectedRegion === "الكل") {
            for(const region of allRegions) {
                let regData = data.filter(x => x.reg === region);
                let totalReg = regData.length;
                let okReg = regData.filter(x => x.stat === 'صالح').length;
                let regEff = totalReg ? ((okReg / totalReg) * 100).toFixed(1) : 0;
                let regionDisplay = REGION_NAMES[region] || region;
                
                html += `<div class="region-table-card">
                    <div class="region-table-header">📍 ${regionDisplay} <span style="background:#ffd966; color:#2e7d32; padding:4px 12px; border-radius:20px;">الجاهزية: ${regEff}% (${okReg}/${totalReg})</span></div>
                    <div class="scrollable-table">
                    <table class="region-table">
                        <thead><tr><th>الفئة</th><th>عدد الصالح</th><th>عدد المعطوب</th><th>نسبة النجاعة</th></tr></thead>
                        <tbody>`;
                
                for(const cat of CATS_LIST) {
                    let catData = regData.filter(x => x.cat === cat);
                    let ok = catData.filter(x => x.stat === 'صالح').length;
                    let broken = catData.filter(x => x.stat !== 'صالح').length;
                    let percent = catData.length ? ((ok / catData.length) * 100).toFixed(1) : 0;
                    let rowClass = percent >= 80 ? 'high-eff' : (percent >= 50 ? 'mid-eff' : 'low-eff');
                    html += `<tr class="${rowClass}">
                        <td>${cat}</td>
                        <td style="color:green;">${ok}</td>
                        <td style="color:red;">${broken}</td>
                        <td><strong>${percent}%</strong></td>
                    </tr>`;
                }
                
                html += `</tbody>
                    </table>
                    </div>
                    </div>`;
            }
        } else {
            let regData = data.filter(x => x.reg === selectedRegion);
            let totalReg = regData.length;
            let okReg = regData.filter(x => x.stat === 'صالح').length;
            let regEff = totalReg ? ((okReg / totalReg) * 100).toFixed(1) : 0;
            let regionDisplay = REGION_NAMES[selectedRegion] || selectedRegion;
            
            html += `<div class="region-table-card">
                <div class="region-table-header">📍 ${regionDisplay} <span style="background:#ffd966; color:#2e7d32; padding:4px 12px; border-radius:20px;">الجاهزية: ${regEff}% (${okReg}/${totalReg})</span></div>
                <div class="scrollable-table">
                <table class="region-table">
                    <thead><tr><th>الفئة</th><th>عدد الصالح</th><th>عدد المعطوب</th><th>نسبة النجاعة</th></tr></thead>
                    <tbody>`;
            
            for(const cat of CATS_LIST) {
                let catData = regData.filter(x => x.cat === cat);
                let ok = catData.filter(x => x.stat === 'صالح').length;
                let broken = catData.filter(x => x.stat !== 'صالح').length;
                let percent = catData.length ? ((ok / catData.length) * 100).toFixed(1) : 0;
                let rowClass = percent >= 80 ? 'high-eff' : (percent >= 50 ? 'mid-eff' : 'low-eff');
                html += `<tr class="${rowClass}">
                    <td>${cat}</td>
                    <td style="color:green;">${ok}</td>
                    <td style="color:red;">${broken}</td>
                    <td><strong>${percent}%</strong></td>
                </tr>`;
            }
            
            html += `</tbody>
                </table>
                </div>
                </div>`;
        }
        
        document.getElementById('regionTables').innerHTML = html;
    } catch(error) {
        console.error('خطأ في renderRegionTables:', error);
        document.getElementById('regionTables').innerHTML = '<div class="region-table-card"><div class="region-table-header">❌ خطأ في تحميل البيانات</div></div>';
    }
}

async function renderEff() {
    await renderStatsCards();
    await renderGeneralEfficiencyTable();
    await renderRegionTables();
    await renderCharts();
}

function switchChartType(type, btn) {
    currentChartType = type;
    document.querySelectorAll('.chart-switch button').forEach(button => button.classList.remove('active'));
    if(btn) btn.classList.add('active');
    renderCharts();
}
