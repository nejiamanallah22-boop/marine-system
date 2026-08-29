/**
 * ============================================================
 * 📊 DASHBOARD.JS - لوحة التحكم المتقدمة v8.0
 * ============================================================
 * ✅ إحصائيات فورية
 * ✅ رسوم بيانية تفاعلية
 * ✅ نشاطات حديثة
 * ✅ تحديث تلقائي
 * ============================================================
 */

console.log('📊 [Dashboard] تحميل لوحة التحكم...');

// ============================================================
// 📦 STATE
// ============================================================

let dashboardData = {
    vessels: [],
    maintenance: [],
    updates: []
};

let dashboardInterval = null;

// ============================================================
// 📊 LOAD DASHBOARD - تحميل لوحة التحكم
// ============================================================

function loadDashboard() {
    console.log('📊 [Dashboard] جاري تحميل البيانات...');
    
    // التحقق من وجود العناصر
    const dashTotal = document.getElementById('dashTotal');
    if (!dashTotal) {
        console.warn('⚠️ [Dashboard] عناصر لوحة التحكم غير موجودة');
        return;
    }
    
    // جلب البيانات من التخزين العام
    const vessels = window.allVessels || [];
    const maintenance = window.allMaintenance || [];
    
    dashboardData.vessels = vessels;
    dashboardData.maintenance = maintenance;
    
    // تحديث الإحصائيات
    updateStats(vessels, maintenance);
    
    // تحديث النشاطات
    updateActivity(vessels, maintenance);
    
    // عرض الرسوم البيانية
    setTimeout(() => {
        renderCharts(vessels, maintenance);
    }, 300);
    
    // بدء التحديث التلقائي
    startAutoRefresh();
    
    console.log('✅ [Dashboard] تم التحميل بنجاح');
}

// ============================================================
// 📊 UPDATE STATS - تحديث الإحصائيات
// ============================================================

function updateStats(vessels, maintenance) {
    const total = vessels.length;
    const ready = vessels.filter(v => v.stat === 'صالح' || v.status === 'active').length;
    const broken = vessels.filter(v => v.stat === 'معطب' || v.status === 'inactive').length;
    const maintenanceCount = vessels.filter(v => v.stat === 'صيانة' || v.status === 'maintenance' || v.stat === 'خارج الخدمة').length;
    const readyPercent = total > 0 ? Math.round((ready / total) * 100) : 0;
    const totalCost = maintenance.reduce((sum, r) => sum + (r.cost || 0), 0);
    const maintenanceRecords = maintenance.length;
    
    // تحديث العناصر
    setElementText('dashTotal', total);
    setElementText('dashReady', ready);
    setElementText('dashBroken', broken);
    setElementText('dashMaintenance', maintenanceCount);
    setElementText('dashReadyPercent', readyPercent + '%');
    setElementText('dashTotalCost', totalCost.toLocaleString() + ' د.ت');
    setElementText('dashMaintenanceCount', maintenanceRecords);
    
    // تحديث وقت آخر تحديث
    const now = new Date();
    setElementText('lastUpdate', now.toLocaleTimeString('ar-TN') + ' - ' + now.toLocaleDateString('ar-TN'));
    
    // تحديث مؤشر الجاهزية
    updateReadinessIndicator(readyPercent);
}

// ============================================================
// 📊 UPDATE READINESS INDICATOR - مؤشر الجاهزية
// ============================================================

function updateReadinessIndicator(percent) {
    const indicator = document.getElementById('readinessIndicator');
    if (!indicator) return;
    
    const color = percent >= 70 ? '#22c55e' : percent >= 40 ? '#eab308' : '#ef4444';
    const label = percent >= 70 ? '🟢 جاهزية عالية' : percent >= 40 ? '🟡 جاهزية متوسطة' : '🔴 جاهزية منخفضة';
    
    indicator.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span style="color:var(--text-muted);">مستوى الجاهزية</span>
            <span style="color:${color};font-weight:700;">${percent}%</span>
        </div>
        <div style="width:100%;height:8px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden;">
            <div style="width:${percent}%;height:100%;background:${color};border-radius:4px;transition:width 1s ease;"></div>
        </div>
        <div style="margin-top:8px;font-size:12px;color:var(--text-dim);">
            ${label}
        </div>
    `;
}

// ============================================================
// 📋 UPDATE ACTIVITY - تحديث النشاطات
// ============================================================

function updateActivity(vessels, maintenance) {
    const container = document.getElementById('dashActivity');
    if (!container) return;
    
    const activities = [];
    
    // نشاطات الصيانة
    maintenance.slice(0, 5).forEach(r => {
        const vesselName = r.vesselName || r.vessel || 'مركب';
        const type = r.type || 'عادية';
        const date = r.date ? new Date(r.date).toLocaleDateString('ar-TN') : 'اليوم';
        activities.push({
            icon: '🔧',
            text: `صيانة ${vesselName} - ${type}`,
            time: date,
            priority: r.priority || 'normal'
        });
    });
    
    // وسائل معطوبة
    vessels.filter(v => v.stat === 'معطب' || v.status === 'inactive').slice(0, 3).forEach(v => {
        const date = v.fDate ? new Date(v.fDate).toLocaleDateString('ar-TN') : 'اليوم';
        activities.push({
            icon: '⚠️',
            text: `المركب ${v.name} أصبح معطباً`,
            time: date,
            priority: 'high'
        });
    });
    
    // وسائل جديدة
    vessels.filter(v => {
        const created = v.createdAt || v.created;
        return created && (new Date() - new Date(created)) < 7 * 24 * 60 * 60 * 1000;
    }).slice(0, 3).forEach(v => {
        const date = v.createdAt ? new Date(v.createdAt).toLocaleDateString('ar-TN') : 'هذا الأسبوع';
        activities.push({
            icon: '🆕',
            text: `إضافة وسيلة جديدة: ${v.name}`,
            time: date,
            priority: 'normal'
        });
    });
    
    // ترتيب حسب الأولوية
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    activities.sort((a, b) => (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1));
    
    if (activities.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:30px 20px;color:var(--text-dim);">
                <i class="fas fa-check-circle" style="font-size:32px;display:block;margin-bottom:12px;color:var(--success);"></i>
                <p>لا توجد نشاطات حديثة</p>
                <p style="font-size:12px;margin-top:4px;">النظام يعمل بكفاءة</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = activities.slice(0, 10).map(a => `
        <div class="activity-item" style="
            display:flex;
            align-items:center;
            gap:12px;
            padding:10px 12px;
            border-bottom:1px solid rgba(255,255,255,0.03);
            transition:background 0.2s;
            ${a.priority === 'high' ? 'border-right:3px solid var(--danger);' : ''}
        ">
            <span style="font-size:20px;">${a.icon}</span>
            <span style="flex:1;font-size:13px;">${a.text}</span>
            <span style="font-size:11px;color:var(--text-dim);white-space:nowrap;">${a.time}</span>
        </div>
    `).join('');
}

// ============================================================
// 📊 RENDER CHARTS - عرض الرسوم البيانية
// ============================================================

function renderCharts(vessels, maintenance) {
    // رسم بياني لحالة الأسطول (دائري)
    renderPieChart(vessels);
    
    // رسم بياني للصيانة (شريطي)
    renderBarChart(maintenance);
}

// ============================================================
// 🥧 PIE CHART - رسم بياني دائري
// ============================================================

function renderPieChart(vessels) {
    const container = document.getElementById('dashPieChart');
    if (!container) return;
    
    const total = vessels.length;
    const ready = vessels.filter(v => v.stat === 'صالح' || v.status === 'active').length;
    const broken = vessels.filter(v => v.stat === 'معطب' || v.status === 'inactive').length;
    const maintenance = vessels.filter(v => v.stat === 'صيانة' || v.status === 'maintenance' || v.stat === 'خارج الخدمة').length;
    
    if (total === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:20px;color:var(--text-dim);">
                <i class="fas fa-chart-pie" style="font-size:32px;display:block;margin-bottom:8px;opacity:0.3;"></i>
                لا توجد بيانات كافية
            </div>
        `;
        return;
    }
    
    const data = [
        { label: 'صالح', value: ready, color: '#22c55e' },
        { label: 'معطب', value: broken, color: '#ef4444' },
        { label: 'صيانة', value: maintenance, color: '#eab308' }
    ];
    
    // إنشاء SVG دائري
    const size = 180;
    const radius = 80;
    const cx = size / 2;
    const cy = size / 2;
    
    let totalAngle = 0;
    let paths = '';
    let legendHTML = '';
    
    data.forEach(item => {
        if (item.value === 0) return;
        const angle = (item.value / total) * 360;
        const startAngle = totalAngle;
        const endAngle = totalAngle + angle;
        totalAngle = endAngle;
        
        const startRad = (startAngle - 90) * Math.PI / 180;
        const endRad = (endAngle - 90) * Math.PI / 180;
        
        const x1 = cx + radius * Math.cos(startRad);
        const y1 = cy + radius * Math.sin(startRad);
        const x2 = cx + radius * Math.cos(endRad);
        const y2 = cy + radius * Math.sin(endRad);
        
        const largeArc = angle > 180 ? 1 : 0;
        
        paths += `
            <path d="M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z"
                  fill="${item.color}" stroke="var(--primary)" stroke-width="2">
            </path>
        `;
        
        const percent = Math.round((item.value / total) * 100);
        legendHTML += `
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;">
                <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${item.color};"></span>
                <span>${item.label}</span>
                <span style="color:var(--text-dim);margin-right:auto;">${percent}%</span>
            </div>
        `;
    });
    
    container.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:20px;align-items:center;justify-content:center;">
            <div>
                <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                    ${paths}
                    <circle cx="${cx}" cy="${cy}" r="${radius * 0.5}" fill="var(--primary)" stroke="var(--border)" stroke-width="2"/>
                    <text x="${cx}" y="${cy + 6}" text-anchor="middle" fill="var(--text)" font-size="16" font-weight="700">
                        ${total}
                    </text>
                    <text x="${cx}" y="${cy + 28}" text-anchor="middle" fill="var(--text-dim)" font-size="10">
                        إجمالي
                    </text>
                </svg>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;">
                ${legendHTML}
            </div>
        </div>
    `;
}

// ============================================================
// 📊 BAR CHART - رسم بياني شريطي
// ============================================================

function renderBarChart(maintenance) {
    const container = document.getElementById('dashBarChart');
    if (!container) return;
    
    if (maintenance.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:20px;color:var(--text-dim);">
                <i class="fas fa-chart-bar" style="font-size:32px;display:block;margin-bottom:8px;opacity:0.3;"></i>
                لا توجد سجلات صيانة
            </div>
        `;
        return;
    }
    
    // تجميع حسب النوع
    const types = {};
    maintenance.forEach(r => {
        const type = r.type || 'عادية';
        types[type] = (types[type] || 0) + 1;
    });
    
    const labels = Object.keys(types);
    const values = Object.values(types);
    const maxValue = Math.max(...values);
    
    const colors = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6'];
    
    let barsHTML = '';
    let legendHTML = '';
    
    labels.forEach((label, i) => {
        const percent = (values[i] / maxValue) * 100;
        const barHeight = Math.max(20, (values[i] / maxValue) * 120);
        const color = colors[i % colors.length];
        
        barsHTML += `
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;">
                <div style="width:100%;height:${barHeight}px;background:${color};border-radius:4px;min-height:4px;transition:height 0.5s ease;"></div>
                <span style="font-size:11px;color:var(--text-muted);">${values[i]}</span>
                <span style="font-size:10px;color:var(--text-dim);">${label}</span>
            </div>
        `;
        
        legendHTML += `
            <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;">
                <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${color};"></span>
                ${label}
            </span>
        `;
    });
    
    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;">
            <div style="display:flex;justify-content:space-around;align-items:flex-end;height:160px;padding:8px 0;">
                ${barsHTML}
            </div>
            <div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:12px;">
                ${legendHTML}
            </div>
        </div>
    `;
}

// ============================================================
// 🔧 HELPERS - وظائف مساعدة
// ============================================================

function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
    }
}

// ============================================================
// ⏰ AUTO REFRESH - تحديث تلقائي
// ============================================================

function startAutoRefresh() {
    // إيقاف التحديث السابق
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
    }
    
    // تحديث كل 30 ثانية
    dashboardInterval = setInterval(() => {
        // تحديث الوقت فقط (البيانات يتم تحديثها من المصدر)
        const now = new Date();
        setElementText('lastUpdate', now.toLocaleTimeString('ar-TN') + ' - ' + now.toLocaleDateString('ar-TN'));
    }, 30000);
}

function stopAutoRefresh() {
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
    }
}

// ============================================================
// 🔄 REFRESH - تحديث يدوي
// ============================================================

function refreshDashboard() {
    console.log('🔄 [Dashboard] تحديث يدوي...');
    
    // جلب البيانات من المصدر
    const vessels = window.allVessels || [];
    const maintenance = window.allMaintenance || [];
    
    dashboardData.vessels = vessels;
    dashboardData.maintenance = maintenance;
    
    updateStats(vessels, maintenance);
    updateActivity(vessels, maintenance);
    
    setTimeout(() => {
        renderCharts(vessels, maintenance);
    }, 200);
    
    showToast('🔄 تم تحديث لوحة التحكم', 'info');
}

// ============================================================
// 🌐 EXPOSE GLOBALLY - تصدير الدوال
// ============================================================

window.loadDashboard = loadDashboard;
window.refreshDashboard = refreshDashboard;
window.stopAutoRefresh = stopAutoRefresh;

// ============================================================
// 📊 INIT - تهيئة تلقائية عند تحميل الصفحة
// ============================================================

// إذا تم تحميل الصفحة مباشرة
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // تأخير بسيط للتأكد من تحميل جميع العناصر
    setTimeout(loadDashboard, 100);
} else {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(loadDashboard, 100);
    });
}

console.log('✅ [Dashboard] تم تحميل وحدة لوحة التحكم');
