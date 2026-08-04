// ============================================================
// الرسوم البيانية - charts.js
// ============================================================

function renderCategoryChart(vessels) {
    const canvas = document.getElementById('chartCategory');
    if (!canvas) return;
    canvas.style.height = '110px';
    canvas.style.width = '100%';
    
    const categories = {};
    vessels.forEach(v => {
        const cat = v.cat || 'غير مصنف';
        if (!categories[cat]) categories[cat] = { ready: 0, broken: 0, maintenance: 0 };
        if (v.stat === 'صالح') categories[cat].ready++;
        else if (v.stat === 'معطب') categories[cat].broken++;
        else if (v.stat === 'صيانة') categories[cat].maintenance++;
    });
    
    const labels = Object.keys(categories);
    if (chartCategory) chartCategory.destroy();
    
    chartCategory = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'صالح', data: labels.map(cat => categories[cat].ready), backgroundColor: 'rgba(74,222,128,0.7)', borderColor: '#4ade80', borderWidth: 1, barThickness: 12 },
                { label: 'معطب', data: labels.map(cat => categories[cat].broken), backgroundColor: 'rgba(248,113,113,0.7)', borderColor: '#f87171', borderWidth: 1, barThickness: 12 },
                { label: 'صيانة', data: labels.map(cat => categories[cat].maintenance), backgroundColor: 'rgba(251,191,36,0.7)', borderColor: '#fbbf24', borderWidth: 1, barThickness: 12 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 7 }, color: 'rgba(255,255,255,0.4)' } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 7 }, color: 'rgba(255,255,255,0.4)' } },
                y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 6 }, color: 'rgba(255,255,255,0.4)' } }
            }
        }
    });
}

function renderDoughnutChart(vessels) {
    const canvas = document.getElementById('chartDoughnut');
    if (!canvas) return;
    canvas.style.height = '110px';
    canvas.style.width = '100%';
    
    const ready = vessels.filter(v => v.stat === 'صالح').length;
    const broken = vessels.filter(v => v.stat === 'معطب').length;
    const maintenance = vessels.filter(v => v.stat === 'صيانة').length;
    
    if (chartDoughnut) chartDoughnut.destroy();
    
    chartDoughnut = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: ['صالح', 'معطب', 'صيانة'],
            datasets: [{
                data: [ready, broken, maintenance],
                backgroundColor: ['rgba(74,222,128,0.8)', 'rgba(248,113,113,0.8)', 'rgba(251,191,36,0.8)'],
                borderColor: ['#4ade80', '#f87171', '#fbbf24'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '50%',
            animation: { duration: 0 },
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 7 }, color: 'rgba(255,255,255,0.4)' } }
            }
        }
    });
}

function renderDashboardCharts() {
    try {
        const dashCanvas = document.getElementById('dashChart');
        if (dashCanvas) {
            dashCanvas.style.height = '200px';
            dashCanvas.style.width = '100%';
            if (dashChart) dashChart.destroy();
            
            const ready = allVessels.filter(v => v.stat === 'صالح').length || 0;
            const broken = allVessels.filter(v => v.stat === 'معطب').length || 0;
            const maintenance = allVessels.filter(v => v.stat === 'صيانة' || v.stat === 'خارج الخدمة').length || 0;
            
            dashChart = new Chart(dashCanvas, {
                type: 'doughnut',
                data: {
                    labels: ['✅ صالح', '❌ معطب', '🔧 صيانة'],
                    datasets: [{
                        data: [ready, broken, maintenance],
                        backgroundColor: ['rgba(74,222,128,0.8)', 'rgba(248,113,113,0.8)', 'rgba(251,191,36,0.8)'],
                        borderColor: ['#4ade80', '#f87171', '#fbbf24'],
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '60%',
                    plugins: {
                        legend: { 
                            position: 'bottom', 
                            labels: { 
                                color: 'rgba(255,255,255,0.6)', 
                                font: { size: 11 } 
                            } 
                        }
                    }
                }
            });
        }
    } catch(e) {
        console.log('⚠️ Dashboard chart error:', e);
    }
    
    try {
        const lineCanvas = document.getElementById('dashLineChart');
        if (lineCanvas) {
            lineCanvas.style.height = '200px';
            lineCanvas.style.width = '100%';
            if (dashLineChart) dashLineChart.destroy();
            
            const months = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان'];
            const readyData = [12, 14, 13, 16, 18, 20];
            const brokenData = [5, 4, 6, 3, 4, 2];
            
            dashLineChart = new Chart(lineCanvas, {
                type: 'line',
                data: {
                    labels: months,
                    datasets: [
                        { 
                            label: 'صالح', 
                            data: readyData, 
                            borderColor: '#4ade80', 
                            backgroundColor: 'rgba(74,222,128,0.1)', 
                            fill: true, 
                            tension: 0.4, 
                            pointBackgroundColor: '#4ade80' 
                        },
                        { 
                            label: 'معطب', 
                            data: brokenData, 
                            borderColor: '#f87171', 
                            backgroundColor: 'rgba(248,113,113,0.1)', 
                            fill: true, 
                            tension: 0.4, 
                            pointBackgroundColor: '#f87171' 
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { 
                        legend: { 
                            position: 'bottom', 
                            labels: { 
                                color: 'rgba(255,255,255,0.6)', 
                                font: { size: 11 } 
                            } 
                        } 
                    },
                    scales: { 
                        x: { 
                            ticks: { color: 'rgba(255,255,255,0.3)' } 
                        }, 
                        y: { 
                            ticks: { color: 'rgba(255,255,255,0.3)' }, 
                            beginAtZero: true 
                        } 
                    }
                }
            });
        }
    } catch(e) {
        console.log('⚠️ Dashboard line chart error:', e);
    }
}

console.log('✅ charts.js loaded');
