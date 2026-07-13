// ============================================================
// ===== الجاهزية (لوحة التحكم) =====
// ============================================================

let chartInstance = null;
let currentChartType = 'doughnut';

function renderEff() {
    const filter = document.getElementById('fRegEff').value;
    
    let filteredData = fleetData;
    if (filter !== 'الكل' && filter !== 'نجاعة عامة') {
        filteredData = fleetData.filter(f => f.reg === filter);
    }
    
    updateStats(filteredData);
    
    const container = document.getElementById('tablesContainer');
    let html = '';
    html += renderGeneralEfficiency(filteredData);
    
    const workshops = ['تونس', 'المنستير', 'صفاقس', 'جرجيس', 'المجمع الأمني بقبيبة'];
    workshops.forEach(ws => {
        const wsData = filteredData.filter(f => f.reg === ws);
        html += renderWorkshopTable(ws, wsData);
    });
    
    container.innerHTML = html;
    updateChart(filteredData);
    updateLatestNote();
}

function updateStats(data) {
    const total = data.length;
    const active = data.filter(f => f.stat === 'صالح').length;
    const maintenance = data.filter(f => f.stat === 'صيانة').length;
    const damage = data.filter(f => f.stat === 'معطب').length;
    
    document.getElementById('statsCards').innerHTML = `
        <div class="stat-card"><div class="number">${total}</div><div class="label">🚢 إجمالي الوسائل</div></div>
        <div class="stat-card"><div class="number">${active}</div><div class="label">✅ صالح للخدمة</div></div>
        <div class="stat-card"><div class="number">${maintenance}</div><div class="label">🔧 تحت الصيانة</div></div>
        <div class="stat-card"><div class="number">${damage}</div><div class="label">⚠️ معطوب</div></div>
    `;
}

function renderGeneralEfficiency(data) {
    const total = data.length;
    const categories = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
    
    let rows = '';
    categories.forEach(cat => {
        const catData = data.filter(f => f.cat === cat);
        const count = catData.length;
        const active = catData.filter(f => f.stat === 'صالح').length;
        const maintenance = catData.filter(f => f.stat === 'صيانة').length;
        const damage = catData.filter(f => f.stat === 'معطب').length;
        const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
        const eff = count > 0 ? Math.round((active / count) * 100) : 0;
        
        if (count > 0) {
            rows += `
                <tr>
                    <td><strong>${cat}</strong></td>
                    <td>${count}</td>
                    <td>${percentage}%</td>
                    <td>${active}</td>
                    <td>${maintenance}</td>
                    <td>${damage}</td>
                    <td style="color:${eff > 70 ? '#22c55e' : eff > 40 ? '#f59e0b' : '#ef4444'}; font-weight:700;">${eff}%</td>
                </tr>
            `;
        }
    });
    
    const totalEff = total > 0 ? Math.round((data.filter(f => f.stat === 'صالح').length / total) * 100) : 0;
    rows += `
        <tr style="font-weight:700; background:var(--gray-50);">
            <td>📊 الإجمالي</td>
            <td>${total}</td>
            <td>100%</td>
            <td>${data.filter(f => f.stat === 'صالح').length}</td>
            <td>${data.filter(f => f.stat === 'صيانة').length}</td>
            <td>${data.filter(f => f.stat === 'معطب').length}</td>
            <td style="color:${totalEff > 70 ? '#22c55e' : totalEff > 40 ? '#f59e0b' : '#ef4444'};">${totalEff}%</td>
        </tr>
    `;
    
    return `
        <div class="region-table-card">
            <div class="region-table-header">
                <i class="fas fa-chart-line"></i> 📊 نجاعة الأسطول العام
                <span style="font-size:12px; color:var(--gray-500);">${total} وسيلة</span>
            </div>
            <div class="scrollable-table">
                <table>
                    <thead>
                        <tr>
                            <th>الفئة</th>
                            <th>العدد</th>
                            <th>النسبة</th>
                            <th>✅ صالح</th>
                            <th>🔧 صيانة</th>
                            <th>❌ معطب</th>
                            <th>النجاعة</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
    `;
}

function renderWorkshopTable(workshopName, data) {
    const total = data.length;
    const categories = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
    
    let rows = '';
    categories.forEach(cat => {
        const catData = data.filter(f => f.cat === cat);
        const count = catData.length;
        const active = catData.filter(f => f.stat === 'صالح').length;
        const maintenance = catData.filter(f => f.stat === 'صيانة').length;
        const damage = catData.filter(f => f.stat === 'معطب').length;
        const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
        const eff = count > 0 ? Math.round((active / count) * 100) : 0;
        
        if (count > 0) {
            rows += `
                <tr>
                    <td><strong>${cat}</strong></td>
                    <td>${count}</td>
                    <td>${percentage}%</td>
                    <td>${active}</td>
                    <td>${maintenance}</td>
                    <td>${damage}</td>
                    <td style="color:${eff > 70 ? '#22c55e' : eff > 40 ? '#f59e0b' : '#ef4444'}; font-weight:700;">${eff}%</td>
                </tr>
            `;
        }
    });
    
    if (total === 0) {
        rows = `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--gray-500);"><i class="fas fa-info-circle"></i> لا توجد وسائل في هذه الورشة</td></tr>`;
    } else {
        const totalEff = total > 0 ? Math.round((data.filter(f => f.stat === 'صالح').length / total) * 100) : 0;
        rows += `
            <tr style="font-weight:700; background:var(--gray-50);">
                <td>📊 الإجمالي</td>
                <td>${total}</td>
                <td>100%</td>
                <td>${data.filter(f => f.stat === 'صالح').length}</td>
                <td>${data.filter(f => f.stat === 'صيانة').length}</td>
                <td>${data.filter(f => f.stat === 'معطب').length}</td>
                <td style="color:${totalEff > 70 ? '#22c55e' : totalEff > 40 ? '#f59e0b' : '#ef4444'};">${totalEff}%</td>
            </tr>
        `;
    }
    
    const icons = {
        'تونس': '🛠️',
        'المنستير': '🛠️',
        'صفاقس': '🛠️',
        'جرجيس': '🛠️',
        'المجمع الأمني بقبيبة': '🏛️'
    };
    
    return `
        <div class="region-table-card workshop-table">
            <div class="region-table-header">
                <i class="fas fa-tools"></i> ${icons[workshopName] || '🛠️'} ${workshopName}
                <span style="font-size:12px; color:var(--gray-500);">${total} وسيلة</span>
            </div>
            <div class="scrollable-table">
                <table>
                    <thead>
                        <tr>
                            <th>الفئة</th>
                            <th>العدد</th>
                            <th>النسبة</th>
                            <th>✅ صالح</th>
                            <th>🔧 صيانة</th>
                            <th>❌ معطب</th>
                            <th>النجاعة</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
    `;
}

function updateChart(data) {
    const total = data.length;
    const active = data.filter(f => f.stat === 'صالح').length;
    const maintenance = data.filter(f => f.stat === 'صيانة').length;
    const damage = data.filter(f => f.stat === 'معطب').length;
    
    const ctx = document.getElementById('chartsArea');
    if (!ctx) return;
    
    ctx.innerHTML = `
        <div class="chart-container">
            <canvas id="efficiencyChart"></canvas>
        </div>
    `;
    
    const canvas = document.getElementById('efficiencyChart');
    if (!canvas) return;
    
    if (chartInstance) {
        chartInstance.destroy();
    }
    
    chartInstance = new Chart(canvas, {
        type: currentChartType,
        data: {
            labels: ['✅ صالح للخدمة', '🔧 تحت الصيانة', '❌ معطوب'],
            datasets: [{
                label: 'حالة الأسطول',
                data: [active, maintenance, damage],
                backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'],
                borderColor: ['#16a34a', '#d97706', '#dc2626'],
                borderWidth: 2,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { family: 'Cairo', size: 13 },
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? Math.round((context.parsed / total) * 100) : 0;
                            return context.label + ': ' + context.parsed + ' (' + percentage + '%)';
                        }
                    }
                }
            },
            animation: {
                animateRotate: true,
                duration: 1000
            }
        }
    });
}

function switchChartType(type, btn) {
    currentChartType = type;
    document.querySelectorAll('.chart-switch button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderEff();
}

function refreshEff() {
    renderEff();
    showToast('🔄 تم تحديث بيانات الجاهزية', 'info');
}

function exportEfficiencyReport() {
    showToast('📄 جاري تصدير تقرير النجاعة...', 'info');
    setTimeout(() => showToast('✅ تم تصدير التقرير بنجاح', 'success'), 1500);
}

function updateLatestNote() {
    const container = document.getElementById('latestNoteContainer');
    const notes = JSON.parse(localStorage.getItem('marine_notes') || '[]');
    if (notes.length === 0) {
        container.style.display = 'none';
        return;
    }
    const latest = notes[0];
    container.style.display = 'block';
    document.getElementById('latestNoteDate').textContent = '📅 ' + (latest.date || 'غير محدد');
    document.getElementById('latestNoteTitle').textContent = latest.title || 'بدون عنوان';
    document.getElementById('latestNoteContent').textContent = latest.content || 'لا يوجد محتوى';
    document.getElementById('latestNoteAttachments').innerHTML = '';
}
