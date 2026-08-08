// ============================================================
// 🚀 app.js - الملف الرئيسي للتطبيق (معدل)
// ============================================================

console.log('🚀 App.js loaded successfully');

// ============================================================
// 📦 المتغيرات العامة
// ============================================================

let currentPage = 'dashboard';
let pageCache = {};
let isAppInitialized = false;

// ============================================================
// 🖥️ تهيئة التطبيق
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM loaded - Initializing app');
    
    const loginOverlay = document.getElementById('loginOverlay');
    const mainApp = document.getElementById('mainApp');
    
    // التحقق من المصادقة
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('userData') || 'null');
    
    if (token && user) {
        // ✅ مستخدم مسجل - إظهار التطبيق
        if (loginOverlay) loginOverlay.style.display = 'none';
        if (mainApp) mainApp.style.display = 'block';
        
        // تحديث معلومات المستخدم في الهيدر
        updateUserHeader(user);
        
        // عرض الصفحة الافتراضية
        setTimeout(() => {
            showPage('dashboard');
        }, 200);
        
        isAppInitialized = true;
    } else {
        // ❌ مستخدم غير مسجل - إظهار شاشة الدخول
        if (loginOverlay) loginOverlay.style.display = 'flex';
        if (mainApp) mainApp.style.display = 'none';
        
        // تنظيف localStorage
        localStorage.clear();
        
        // إعداد حقول الدخول
        const username = document.getElementById('username');
        const password = document.getElementById('password');
        if (username) username.value = '';
        if (password) password.value = '';
        
        // أحداث Enter
        if (password) {
            password.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') doLogin();
            });
        }
        if (username) {
            username.addEventListener('keypress', function(e) {
                if (e.key === 'Enter' && password) password.focus();
            });
        }
    }
});

// ============================================================
// 👤 تحديث معلومات المستخدم في الهيدر
// ============================================================

function updateUserHeader(user) {
    const roleDisplay = document.getElementById('userRoleDisplay');
    if (roleDisplay && user) {
        const roleNames = {
            'مسؤول': '👑 مسؤول',
            'مشرف': '⭐ مشرف',
            'محرر': '✏️ محرر',
            'مشاهد': '👀 مشاهد'
        };
        roleDisplay.textContent = roleNames[user.role] || '👤 ' + user.role;
    }
}

// ============================================================
// 📄 عرض الصفحات (معدل)
// ============================================================

function showPage(pageName) {
    console.log(`📄 Showing page: ${pageName}`);
    currentPage = pageName;
    
    const container = document.getElementById('pageContainer');
    if (!container) {
        console.error('❌ pageContainer not found');
        return;
    }
    
    // ✅ تحديث الأزرار النشطة
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        const onclickAttr = btn.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(`'${pageName}'`)) {
            btn.classList.add('active');
        }
    });
    
    // ✅ إغلاق الـ Sidebar في الشاشات الصغيرة
    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth <= 992) {
        sidebar.classList.remove('open');
    }
    
    // ✅ تحميل الصفحة
    loadPage(pageName);
}

// ============================================================
// 📥 تحميل الصفحات (معدل)
// ============================================================

function loadPage(pageName) {
    const container = document.getElementById('pageContainer');
    if (!container) return;
    
    // ✅ إزالة الصفحات القديمة
    document.querySelectorAll('.page-content').forEach(el => el.remove());
    
    // ✅ إظهار مؤشر التحميل
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'page-content';
    loadingDiv.id = 'page-loading';
    loadingDiv.innerHTML = `
        <div style="text-align:center; padding:60px 20px; color:rgba(255,255,255,0.5);">
            <div style="font-size:40px; margin-bottom:15px;">⏳</div>
            <div style="font-size:16px;">جاري التحميل...</div>
        </div>
    `;
    container.appendChild(loadingDiv);
    
    // ✅ تحميل الصفحة من HTML
    fetch(`/pages/${pageName}.html`)
        .then(res => {
            if (!res.ok) {
                // ✅ إذا لم توجد الصفحة، استخدم الصفحة المضمنة
                return getPageHTML(pageName);
            }
            return res.text();
        })
        .then(html => {
            // ✅ إزالة مؤشر التحميل
            const loading = document.getElementById('page-loading');
            if (loading) loading.remove();
            
            // ✅ إضافة الصفحة الجديدة
            const div = document.createElement('div');
            div.className = 'page-content';
            div.id = 'page-' + pageName;
            div.innerHTML = html;
            container.appendChild(div);
            
            // ✅ تهيئة الصفحة بعد التحميل
            setTimeout(() => {
                initPage(pageName);
            }, 150);
        })
        .catch(err => {
            console.error('❌ Error loading page:', err);
            const loading = document.getElementById('page-loading');
            if (loading) loading.remove();
            
            // ✅ عرض صفحة احتياطية
            container.innerHTML = `
                <div style="text-align:center; padding:60px 20px; color:#f87171;">
                    <div style="font-size:48px; margin-bottom:15px;">⚠️</div>
                    <h2 style="margin-bottom:10px;">خطأ في تحميل الصفحة</h2>
                    <p style="color:rgba(255,255,255,0.4);">${err.message}</p>
                    <button onclick="showPage('dashboard')" style="margin-top:20px; padding:10px 30px; background:#60a5fa; border:none; border-radius:10px; color:white; cursor:pointer; font-size:16px;">
                        🏠 العودة للرئيسية
                    </button>
                </div>
            `;
        });
}

// ============================================================
// 📄 محتوى الصفحات المضمنة (بدون ملفات HTML)
// ============================================================

function getPageHTML(pageName) {
    const pages = {
        'dashboard': `
            <div style="padding:20px;">
                <h2 style="color:#60a5fa; margin-bottom:20px;">📊 لوحة التحكم</h2>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px,1fr)); gap:15px; margin-bottom:20px;">
                    <div style="background:rgba(255,255,255,0.02); border-radius:14px; padding:16px; border:1px solid rgba(255,255,255,0.05);">
                        <div style="font-size:28px; font-weight:800; color:#60a5fa;" id="dashTotal">0</div>
                        <div style="font-size:12px; color:rgba(255,255,255,0.4);">🚢 إجمالي المراكب</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.02); border-radius:14px; padding:16px; border:1px solid rgba(255,255,255,0.05);">
                        <div style="font-size:28px; font-weight:800; color:#4ade80;" id="dashReady">0</div>
                        <div style="font-size:12px; color:rgba(255,255,255,0.4);">✅ صالح</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.02); border-radius:14px; padding:16px; border:1px solid rgba(255,255,255,0.05);">
                        <div style="font-size:28px; font-weight:800; color:#fbbf24;" id="dashMaintenance">0</div>
                        <div style="font-size:12px; color:rgba(255,255,255,0.4);">🔧 صيانة</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.02); border-radius:14px; padding:16px; border:1px solid rgba(255,255,255,0.05);">
                        <div style="font-size:28px; font-weight:800; color:#f87171;" id="dashBroken">0</div>
                        <div style="font-size:12px; color:rgba(255,255,255,0.4);">❌ معطب</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.02); border-radius:14px; padding:16px; border:1px solid rgba(255,255,255,0.05);">
                        <div style="font-size:28px; font-weight:800; color:#34d399;" id="dashReadyPercent">0%</div>
                        <div style="font-size:12px; color:rgba(255,255,255,0.4);">📊 نسبة الجاهزية</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.02); border-radius:14px; padding:16px; border:1px solid rgba(255,255,255,0.05);">
                        <div style="font-size:28px; font-weight:800; color:#f5d76e;" id="dashTotalCost">0 د.ت</div>
                        <div style="font-size:12px; color:rgba(255,255,255,0.4);">💰 تكاليف الصيانة</div>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px,1fr)); gap:20px;">
                    <div style="background:rgba(255,255,255,0.02); border-radius:14px; padding:18px; border:1px solid rgba(255,255,255,0.05);">
                        <h4 style="color:rgba(255,255,255,0.6); margin-bottom:12px;">📊 توزيع الحالات</h4>
                        <canvas id="dashChart" style="width:100%; height:200px;"></canvas>
                    </div>
                    <div style="background:rgba(255,255,255,0.02); border-radius:14px; padding:18px; border:1px solid rgba(255,255,255,0.05);">
                        <h4 style="color:rgba(255,255,255,0.6); margin-bottom:12px;">📈 تطور الجاهزية</h4>
                        <canvas id="dashLineChart" style="width:100%; height:200px;"></canvas>
                    </div>
                </div>
            </div>
        `,
        'fleet': `<div style="padding:20px;"><h2 style="color:#60a5fa;">🚢 الأسطول</h2><p style="color:rgba(255,255,255,0.4);">جاري تحميل البيانات...</p></div>`,
        'maintenance': `<div style="padding:20px;"><h2 style="color:#60a5fa;">🔧 الصيانة</h2><p style="color:rgba(255,255,255,0.4);">جاري تحميل البيانات...</p></div>`,
        'users': `<div style="padding:20px;"><h2 style="color:#60a5fa;">👥 المستخدمين</h2><p style="color:rgba(255,255,255,0.4);">جاري تحميل البيانات...</p></div>`,
        'notes': `<div style="padding:20px;"><h2 style="color:#60a5fa;">📝 Note Verbale</h2><p style="color:rgba(255,255,255,0.4);">جاري تحميل البيانات...</p></div>`
    };
    
    return pages[pageName] || `<div style="padding:20px;"><h2 style="color:#f87171;">⚠️ الصفحة غير موجودة</h2></div>`;
}

// ============================================================
// 🖥️ تهيئة الصفحات (معدل)
// ============================================================

function initPage(pageName) {
    console.log('📄 Initializing page:', pageName);
    
    switch(pageName) {
        case 'dashboard': 
            loadDashboardData();
            break;
        case 'fleet': 
            if (typeof loadVessels === 'function') loadVessels();
            break;
        case 'maintenance': 
            if (typeof loadMaintenance === 'function') loadMaintenance();
            break;
        case 'users': 
            if (typeof loadUsers === 'function') loadUsers();
            break;
        case 'notes': 
            if (typeof loadNotes === 'function') loadNotes();
            break;
        default: 
            console.log('ℹ️ No init function for:', pageName);
    }
}

// ============================================================
// 📊 تحميل بيانات Dashboard (مع بيانات افتراضية)
// ============================================================

function loadDashboardData() {
    console.log('📊 Loading dashboard data...');
    
    // ✅ البيانات الافتراضية (تظهر فوراً)
    const vessels = [
        { name: 'البروق 1', stat: 'صالح' },
        { name: 'البروق 2', stat: 'صالح' },
        { name: 'البروق 3', stat: 'صالح' },
        { name: 'البروق 4', stat: 'صالح' },
        { name: 'البروق 5', stat: 'معطب' },
        { name: 'البروق 6', stat: 'صيانة' },
        { name: 'البروق 7', stat: 'صالح' },
        { name: 'البروق 8', stat: 'صالح' },
    ];
    
    const maintenance = [
        { vesselName: 'البروق 3', cost: 1200 },
        { vesselName: 'البروق 6', cost: 500 },
        { vesselName: 'البروق 5', cost: 2300 },
    ];
    
    // ✅ تحديث الإحصائيات
    updateDashboardStats(vessels, maintenance);
    
    // ✅ تحديث الرسوم البيانية
    renderDashboardCharts(vessels);
}

// ============================================================
// 📊 تحديث إحصائيات Dashboard
// ============================================================

function updateDashboardStats(vessels, maintenance) {
    const total = vessels.length;
    const ready = vessels.filter(v => v.stat === 'صالح').length;
    const broken = vessels.filter(v => v.stat === 'معطب').length;
    const maintenanceCount = vessels.filter(v => v.stat === 'صيانة').length;
    const readyPercent = total > 0 ? Math.round((ready / total) * 100) : 0;
    const totalCost = maintenance.reduce((sum, r) => sum + (r.cost || 0), 0);
    
    // ✅ تحديث العناصر
    const elements = {
        'dashTotal': total,
        'dashReady': ready,
        'dashBroken': broken,
        'dashMaintenance': maintenanceCount,
        'dashReadyPercent': readyPercent + '%',
        'dashTotalCost': totalCost.toLocaleString() + ' د.ت'
    };
    
    Object.keys(elements).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = elements[id];
    });
    
    console.log('📊 Dashboard updated:', elements);
}

// ============================================================
// 📈 رسم الرسوم البيانية
// ============================================================

function renderDashboardCharts(vessels) {
    const ready = vessels.filter(v => v.stat === 'صالح').length;
    const broken = vessels.filter(v => v.stat === 'معطب').length;
    const maintenance = vessels.filter(v => v.stat === 'صيانة').length;
    
    // ✅ الرسم البياني الدائري
    try {
        const canvas = document.getElementById('dashChart');
        if (canvas) {
            if (window.dashChart) window.dashChart.destroy();
            
            window.dashChart = new Chart(canvas, {
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
                            labels: { color: 'rgba(255,255,255,0.6)', font: { size: 11 } }
                        }
                    }
                }
            });
        }
    } catch(e) {
        console.warn('⚠️ Chart error:', e);
    }
    
    // ✅ الرسم البياني الخطي
    try {
        const lineCanvas = document.getElementById('dashLineChart');
        if (lineCanvas) {
            if (window.dashLineChart) window.dashLineChart.destroy();
            
            const months = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان'];
            const values = [72, 75, 78, 82, 85, 88];
            
            window.dashLineChart = new Chart(lineCanvas, {
                type: 'line',
                data: {
                    labels: months,
                    datasets: [{
                        label: '📈 نسبة الجاهزية %',
                        data: values,
                        borderColor: '#34d399',
                        backgroundColor: 'rgba(52,211,153,0.15)',
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#34d399',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: 'rgba(255,255,255,0.6)', font: { size: 11 } }
                        }
                    },
                    scales: {
                        x: { ticks: { color: 'rgba(255,255,255,0.3)' }, grid: { color: 'rgba(255,255,255,0.03)' } },
                        y: { ticks: { color: 'rgba(255,255,255,0.3)' }, beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.03)' } }
                    }
                }
            });
        }
    } catch(e) {
        console.warn('⚠️ Line chart error:', e);
    }
}

// ============================================================
// 🔄 دوال مساعدة أخرى (محفوظة من الكود الأصلي)
// ============================================================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('open');
}

function refreshAllPages() {
    const currentPage = document.querySelector('.page-content');
    if (currentPage) {
        const pageName = currentPage.id.replace('page-', '');
        showPage(pageName);
    } else {
        showPage('dashboard');
    }
    if (typeof showAlert === 'function') {
        showAlert('✅ تم تحديث الصفحة', 'success');
    }
}

function doLogin() {
    const username = document.getElementById('username')?.value;
    const password = document.getElementById('password')?.value;
    
    if (!username || !password) {
        const error = document.getElementById('loginError');
        if (error) error.textContent = '⚠️ الرجاء إدخال اسم المستخدم وكلمة المرور';
        return;
    }
    
    // ✅ بيانات الدخول التجريبية
    if (username === 'admin' && password === '123456') {
        const user = { name: 'مدير النظام', email: 'admin', role: 'مسؤول' };
        localStorage.setItem('authToken', 'demo-token');
        localStorage.setItem('userData', JSON.stringify(user));
        localStorage.setItem('token', 'demo-token');
        
        location.reload();
    } else {
        const error = document.getElementById('loginError');
        if (error) error.textContent = '❌ اسم المستخدم أو كلمة المرور غير صحيحة';
    }
}

function doLogout() {
    localStorage.clear();
    location.reload();
}

// ============================================================
// 🚀 تشغيل التطبيق
// ============================================================

console.log('✅ App initialized successfully');
console.log('📝 استخدم admin / 123456 للدخول');
