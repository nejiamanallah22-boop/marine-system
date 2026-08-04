// ============================================================
// لوحة التحكم - dashboard.js
// ============================================================

function loadDashboard() {
    console.log('📊 Loading dashboard...');
    
    const dashTotal = document.getElementById('dashTotal');
    if (!dashTotal) {
        console.log('⚠️ Dashboard elements not found, skipping...');
        return;
    }
    
    const total = allVessels.length;
    const ready = allVessels.filter(v => v.stat === 'صالح').length;
    const broken = allVessels.filter(v => v.stat === 'معطب').length;
    const maintenance = allVessels.filter(v => v.stat === 'صيانة' || v.stat === 'خارج الخدمة').length;
    const readyPercent = total > 0 ? Math.round((ready / total) * 100) : 0;
    const totalCost = allMaintenance.reduce((sum, r) => sum + (r.cost || 0), 0);
    const maintenanceCount = allMaintenance.length;
    
    document.getElementById('dashTotal').textContent = total;
    document.getElementById('dashReady').textContent = ready;
    document.getElementById('dashBroken').textContent = broken;
    document.getElementById('dashMaintenance').textContent = maintenance;
    document.getElementById('dashReadyPercent').textContent = readyPercent + '%';
    document.getElementById('dashTotalCost').textContent = totalCost.toLocaleString() + ' د.ت';
    document.getElementById('dashMaintenanceCount').textContent = maintenanceCount;
    
    const now = new Date();
    document.getElementById('lastUpdate').textContent = now.toLocaleTimeString('ar-TN');
    
    setTimeout(() => {
        renderDashboardCharts();
    }, 200);
    
    updateDashboardActivity();
}

function updateDashboardActivity() {
    const container = document.getElementById('dashActivity');
    if (!container) return;
    
    const activities = [];
    allMaintenance.slice(0, 5).forEach(r => {
        activities.push({ icon: '🔧', text: `صيانة ${r.vesselName || 'مركب'} - ${r.type || 'عادية'}`, time: r.date || 'اليوم' });
    });
    allVessels.filter(v => v.stat === 'معطب').slice(0, 3).forEach(v => {
        activities.push({ icon: '⚠️', text: `المركب ${v.name} أصبح معطباً`, time: v.fDate || 'اليوم' });
    });
    
    if (activities.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.2);">لا توجد نشاطات حديثة</div>';
        return;
    }
    
    container.innerHTML = activities.map(a => `
        <div class="activity-item">
            <span class="activity-icon">${a.icon}</span>
            <span>${a.text}</span>
            <span class="activity-time">${a.time}</span>
        </div>
    `).join('');
}

console.log('✅ dashboard.js loaded');
