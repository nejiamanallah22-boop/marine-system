// ============================================================
// 🚀 public/js/app.js
// MARINE SYSTEM - Frontend Application (معدل)
// ============================================================

'use strict';

console.log('🚀 تحميل Marine System Frontend...');

// ============================================================
// 🌐 حالة التطبيق
// ============================================================

const APP_CONFIG = {
    defaultPage: 'dashboard',
    pageBasePath: '/pages/',
    pageExtension: '.html',
    loginOverlay: 'loginOverlay',
    mainApp: 'mainApp',
    pageContainer: 'pageContainer'
};

let currentPage = APP_CONFIG.defaultPage;
let isApplicationReady = false;

// ============================================================
// 📦 بيانات تجريبية (Fallback)
// ============================================================

const DEMO_DATA = {
    vessels: [
        { name: 'البروق 1', stat: 'صالح' },
        { name: 'البروق 2', stat: 'صالح' },
        { name: 'البروق 3', stat: 'صالح' },
        { name: 'البروق 4', stat: 'صالح' },
        { name: 'البروق 5', stat: 'معطب' },
        { name: 'البروق 6', stat: 'صيانة' },
        { name: 'البروق 7', stat: 'صالح' },
        { name: 'البروق 8', stat: 'صالح' },
    ],
    maintenance: [
        { vesselName: 'البروق 3', cost: 1200 },
        { vesselName: 'البروق 6', cost: 500 },
        { vesselName: 'البروق 5', cost: 2300 },
    ]
};

// ============================================================
// 🧰 أدوات مساعدة
// ============================================================

function getElement(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================================
// 🔐 التحقق من تسجيل الدخول
// ============================================================

function getStoredUser() {
    try {
        const data = localStorage.getItem('userData');
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error('❌ خطأ في قراءة userData:', error);
        return null;
    }
}

function getStoredToken() {
    return localStorage.getItem('authToken');
}

// ============================================================
// 👤 عرض معلومات المستخدم
// ============================================================

function updateUserDisplay() {
    const user = getStoredUser();
    const roleElement = getElement('userRoleDisplay');
    if (!roleElement) return;
    if (!user) {
        roleElement.textContent = '👤';
        return;
    }
    const name = user.name || user.username || 'المستخدم';
    const role = user.role || user.roleName || 'مستخدم';
    roleElement.textContent = `👤 ${name} - ${role}`;
}

// ============================================================
// 🔐 عرض التطبيق / تسجيل الدخول
// ============================================================

function showApplication() {
    const loginOverlay = getElement(APP_CONFIG.loginOverlay);
    const mainApp = getElement(APP_CONFIG.mainApp);
    if (loginOverlay) loginOverlay.style.display = 'none';
    if (mainApp) mainApp.style.display = 'block';
    updateUserDisplay();
    isApplicationReady = true;
}

function showLogin() {
    const loginOverlay = getElement(APP_CONFIG.loginOverlay);
    const mainApp = getElement(APP_CONFIG.mainApp);
    if (loginOverlay) loginOverlay.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';
    isApplicationReady = false;
}

// ============================================================
// 🔑 تسجيل الدخول (مع Fallback تجريبي)
// ============================================================

async function doLogin() {
    const usernameInput = getElement('username');
    const passwordInput = getElement('password');
    const loginButton = getElement('loginButton');
    const loginButtonText = getElement('loginButtonText');
    const loginButtonIcon = getElement('loginButtonIcon');
    const loginError = getElement('loginError');

    const username = usernameInput ? usernameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (loginError) loginError.textContent = '';

    if (!username || !password) {
        if (loginError) loginError.textContent = '❌ يرجى إدخال اسم المستخدم وكلمة المرور';
        return;
    }

    try {
        if (loginButton) loginButton.disabled = true;
        if (loginButtonText) loginButtonText.textContent = 'جاري تسجيل الدخول...';
        if (loginButtonIcon) loginButtonIcon.textContent = '⏳';

        // 🔥 FALLBACK: إذا لم يكن API موجوداً، استخدم حساب تجريبي
        if (!window.API || typeof window.API.authLogin !== 'function') {
            console.warn('⚠️ API غير متوفر، استخدام حساب تجريبي');
            
            // ✅ حساب تجريبي
            if (username === 'admin' && password === '123456') {
                const fakeUser = { name: 'مدير النظام', email: 'admin', role: 'مسؤول' };
                localStorage.setItem('authToken', 'demo-token');
                localStorage.setItem('userData', JSON.stringify(fakeUser));
                showApplication();
                await showPage(APP_CONFIG.defaultPage);
                return;
            } else {
                throw new Error('بيانات الدخول غير صحيحة (admin / 123456)');
            }
        }

        // ✅ استخدام API الحقيقي
        const response = await window.API.authLogin(username, password);

        if (!response) throw new Error('لم تصل استجابة من الخادم');

        if (response.success === false) {
            throw new Error(response.error || response.message || 'فشل تسجيل الدخول');
        }

        if (response.token) {
            localStorage.setItem('authToken', response.token);
        }

        if (response.user) {
            localStorage.setItem('userData', JSON.stringify(response.user));
        }

        showApplication();
        await showPage(APP_CONFIG.defaultPage);

    } catch (error) {
        console.error('❌ Login Error:', error);
        if (loginError) {
            loginError.textContent = `❌ ${error.message || 'فشل تسجيل الدخول'}`;
        }
    } finally {
        if (loginButton) loginButton.disabled = false;
        if (loginButtonText) loginButtonText.textContent = 'دخول';
        if (loginButtonIcon) loginButtonIcon.textContent = '🚀';
    }
}

// ============================================================
// 🔗 دعم Enter في تسجيل الدخول
// ============================================================

function setupLoginEvents() {
    const username = getElement('username');
    const password = getElement('password');

    if (username) {
        username.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                doLogin();
            }
        });
    }

    if (password) {
        password.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                doLogin();
            }
        });
    }
}

// ============================================================
// 🔘 إعداد زر تسجيل الدخول (بديل عن onclick)
// ============================================================

function setupLoginButton() {
    const loginBtn = document.getElementById('loginButton');
    if (!loginBtn) {
        console.warn('⚠️ Login button not found');
        return;
    }
    // إزالة أي onclick قديم
    loginBtn.removeAttribute('onclick');
    // إضافة مستمع حدث
    loginBtn.addEventListener('click', function(event) {
        event.preventDefault();
        doLogin();
    });
    console.log('✅ Login button listener attached');
}

// ============================================================
// 🚪 تسجيل الخروج
// ============================================================

async function doLogout() {
    try {
        if (window.API && typeof window.API.authLogout === 'function') {
            await window.API.authLogout();
        }
    } catch (error) {
        console.warn('⚠️ Logout error:', error);
    } finally {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        showLogin();
    }
}

// ============================================================
// 📄 تحميل الصفحات (مع Fallback)
// ============================================================

async function showPage(page) {
    if (!page) page = APP_CONFIG.defaultPage;

    const container = getElement(APP_CONFIG.pageContainer);
    if (!container) {
        console.error('❌ pageContainer غير موجود');
        return;
    }

    // حماية اسم الصفحة
    if (!/^[a-zA-Z0-9_-]+$/.test(page)) {
        console.error('❌ اسم صفحة غير صالح:', page);
        return;
    }

    currentPage = page;

    // تحديث أزرار Sidebar
    document.querySelectorAll('.nav-btn').forEach(button => {
        button.classList.remove('active');
    });

    const activeButton = Array.from(document.querySelectorAll('.nav-btn')).find(button => {
        const onclick = button.getAttribute('onclick') || '';
        return onclick.includes(`'${page}'`) || onclick.includes(`"${page}"`);
    });

    if (activeButton) {
        activeButton.classList.add('active');
    }

    // عرض مؤشر التحميل
    container.innerHTML = `
        <div class="page-loading" style="padding:50px; text-align:center; font-size:20px;">
            <div style="font-size:42px;">⚓</div>
            <div>جاري تحميل الصفحة...</div>
        </div>
    `;

    try {
        // ✅ محاولة تحميل HTML من الملف
        const url = `${APP_CONFIG.pageBasePath}${encodeURIComponent(page)}${APP_CONFIG.pageExtension}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'text/html' },
            cache: 'no-cache'
        });

        let html = '';
        let useFallback = false;

        if (response.ok) {
            html = await response.text();
            if (!html.trim()) useFallback = true;
        } else {
            useFallback = true;
        }

        // ✅ إذا فشل التحميل، استخدم المحتوى المضمن
        if (useFallback) {
            console.warn(`⚠️ استخدام محتوى مضمن للصفحة: ${page}`);
            html = getFallbackPageHTML(page);
        }

        container.innerHTML = html;

        // ✅ تهيئة الصفحة
        await initializePage(page);

        // ✅ إغلاق Sidebar على الهاتف
        if (window.innerWidth <= 900) {
            const sidebar = getElement('sidebar');
            if (sidebar) sidebar.classList.remove('open');
        }

    } catch (error) {
        console.error(`❌ فشل تحميل الصفحة ${page}:`, error);
        
        // ✅ عرض صفحة خطأ مع إمكانية إعادة المحاولة
        container.innerHTML = `
            <div style="padding:50px; text-align:center;">
                <div style="font-size:55px; margin-bottom:15px;">⚠️</div>
                <h2>تعذر تحميل الصفحة</h2>
                <p>الصفحة: <strong>${escapeHtml(page)}</strong></p>
                <p>الخطأ: ${escapeHtml(error.message)}</p>
                <button onclick="showPage('${escapeHtml(page)}')" 
                        style="padding:12px 25px; border:0; border-radius:10px; cursor:pointer; margin-top:15px;">
                    🔄 إعادة المحاولة
                </button>
                <button onclick="showPage('dashboard')" 
                        style="padding:12px 25px; border:0; border-radius:10px; cursor:pointer; margin-top:15px; margin-right:10px;">
                    🏠 الرئيسية
                </button>
            </div>
        `;
    }
}

// ============================================================
// 📄 محتوى الصفحات المضمن (Fallback)
// ============================================================

function getFallbackPageHTML(page) {
    const fallbackPages = {
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
        'efficiency': `<div style="padding:20px;"><h2 style="color:#60a5fa;">📊 الجاهزية</h2><p style="color:rgba(255,255,255,0.4);">جاري تحميل البيانات...</p></div>`,
        'support': `<div style="padding:20px;"><h2 style="color:#60a5fa;">🎫 الدعم</h2><p style="color:rgba(255,255,255,0.4);">جاري تحميل البيانات...</p></div>`,
        'users': `<div style="padding:20px;"><h2 style="color:#60a5fa;">👥 المستخدمين</h2><p style="color:rgba(255,255,255,0.4);">جاري تحميل البيانات...</p></div>`,
        'notes': `<div style="padding:20px;"><h2 style="color:#60a5fa;">📝 Note Verbale</h2><p style="color:rgba(255,255,255,0.4);">جاري تحميل البيانات...</p></div>`,
        'sessions': `<div style="padding:20px;"><h2 style="color:#60a5fa;">👥 المراقبة</h2><p style="color:rgba(255,255,255,0.4);">جاري تحميل البيانات...</p></div>`,
        'ai-assistant': `<div style="padding:20px;"><h2 style="color:#60a5fa;">🤖 المساعد الذكي</h2><p style="color:rgba(255,255,255,0.4);">جاري تحميل البيانات...</p></div>`
    };

    return fallbackPages[page] || `
        <div style="padding:20px; text-align:center;">
            <h2 style="color:#f87171;">⚠️ الصفحة غير موجودة</h2>
            <p style="color:rgba(255,255,255,0.4);">${escapeHtml(page)}</p>
            <button onclick="showPage('dashboard')" style="padding:10px 30px; background:#60a5fa; border:none; border-radius:10px; color:white; cursor:pointer; margin-top:15px;">
                🏠 العودة للرئيسية
            </button>
        </div>
    `;
}

// ============================================================
// 🧠 تهيئة الصفحة بعد تحميل HTML
// ============================================================

async function initializePage(page) {
    try {
        // ✅ تهيئة خاصة لكل صفحة
        const initFunctions = {
            'dashboard': window.initDashboard,
            'fleet': window.initFleetPage,
            'maintenance': window.initMaintenancePage,
            'efficiency': window.initEfficiencyPage,
            'support': window.initSupportPage,
            'users': window.initUsersPage,
            'notes': window.initNotesPage,
            'sessions': window.initSessionsPage,
            'ai-assistant': window.initAIAssistant
        };

        const initFn = initFunctions[page];

        if (typeof initFn === 'function') {
            await initFn();
            console.log(`✅ ${page} initialized via function`);
        } else {
            // ✅ تهيئة افتراضية لـ Dashboard
            if (page === 'dashboard') {
                console.log('📊 استخدام تهيئة Dashboard الافتراضية');
                initDefaultDashboard();
            } else {
                console.log(`ℹ️ لا توجد تهيئة خاصة للصفحة: ${page}`);
            }
        }

    } catch (error) {
        console.error(`❌ خطأ في تهيئة ${page}:`, error);
    }
}

// ============================================================
// 📊 تهيئة Dashboard الافتراضية (بدون API)
// ============================================================

function initDefaultDashboard() {
    console.log('📊 تهيئة Dashboard بالبيانات الافتراضية...');
    
    // ✅ تحديث الإحصائيات
    const vessels = DEMO_DATA.vessels;
    const maintenance = DEMO_DATA.maintenance;
    
    const total = vessels.length;
    const ready = vessels.filter(v => v.stat === 'صالح').length;
    const broken = vessels.filter(v => v.stat === 'معطب').length;
    const maintenanceCount = vessels.filter(v => v.stat === 'صيانة').length;
    const readyPercent = total > 0 ? Math.round((ready / total) * 100) : 0;
    const totalCost = maintenance.reduce((sum, r) => sum + (r.cost || 0), 0);
    
    // تحديث العناصر
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
    
    // ✅ رسم الرسوم البيانية
    renderDashboardCharts(vessels);
}

// ============================================================
// 📈 رسم الرسوم البيانية
// ============================================================

function renderDashboardCharts(vessels) {
    const ready = vessels.filter(v => v.stat === 'صالح').length;
    const broken = vessels.filter(v => v.stat === 'معطب').length;
    const maintenance = vessels.filter(v => v.stat === 'صيانة').length;
    
    // الرسم البياني الدائري
    try {
        const canvas = document.getElementById('dashChart');
        if (canvas && typeof Chart !== 'undefined') {
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
        console.warn('⚠️ Chart error (doughnut):', e);
    }
    
    // الرسم البياني الخطي
    try {
        const lineCanvas = document.getElementById('dashLineChart');
        if (lineCanvas && typeof Chart !== 'undefined') {
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
        console.warn('⚠️ Chart error (line):', e);
    }
}

// ============================================================
// 🔔 Notifications
// ============================================================

function toggleNotifications() {
    const modal = getElement('notificationModal');
    if (!modal) return;
    modal.classList.toggle('active');
    if (modal.style.display === 'flex') {
        modal.style.display = 'none';
    } else {
        modal.style.display = 'flex';
    }
}

function closeNotificationModal() {
    const modal = getElement('notificationModal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.classList.remove('active');
}

// ============================================================
// 🔑 Password Modal
// ============================================================

function closePasswordModal() {
    const modal = getElement('passwordModal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.classList.remove('active');
}

function openPasswordModal(userId, userName = '') {
    const modal = getElement('passwordModal');
    const nameElement = getElement('modalUserName');
    if (!modal) return;
    modal.dataset.userId = String(userId || '');
    if (nameElement) nameElement.textContent = userName || 'المستخدم';
    modal.style.display = 'flex';
    modal.classList.add('active');
}

async function saveNewPassword() {
    const modal = getElement('passwordModal');
    const newPassword = getElement('newPassword');
    const confirmPassword = getElement('confirmPassword');
    if (!modal) return;

    const userId = modal.dataset.userId;
    const password = newPassword ? newPassword.value : '';
    const confirmation = confirmPassword ? confirmPassword.value : '';

    if (!userId) {
        alert('❌ لم يتم تحديد المستخدم');
        return;
    }
    if (!password || password.length < 8) {
        alert('❌ كلمة المرور يجب أن تحتوي على 8 أحرف على الأقل');
        return;
    }
    if (password !== confirmation) {
        alert('❌ كلمتا المرور غير متطابقتين');
        return;
    }

    try {
        const currentPassword = prompt('أدخل كلمة المرور الحالية:');
        if (!currentPassword) return;

        if (!window.API || typeof window.API.changePassword !== 'function') {
            throw new Error('API.changePassword غير متوفر');
        }

        await window.API.changePassword(userId, currentPassword, password);
        alert('✅ تم تغيير كلمة المرور بنجاح');
        if (newPassword) newPassword.value = '';
        if (confirmPassword) confirmPassword.value = '';
        closePasswordModal();
    } catch (error) {
        console.error('❌ Password change error:', error);
        alert(`❌ ${error.message || 'فشل تغيير كلمة المرور'}`);
    }
}

// ============================================================
// 🔄 تحديث التطبيق
// ============================================================

async function refreshAllPages() {
    try {
        await showPage(currentPage);
    } catch (error) {
        console.error('❌ Refresh error:', error);
    }
}

// ============================================================
// ⬆️ Scroll
// ============================================================

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToBottom() {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
}

// ============================================================
// 🖥️ فحص الجلسة
// ============================================================

async function checkSession() {
    const token = getStoredToken();
    if (!token) {
        showLogin();
        return false;
    }

    try {
        if (window.API && typeof window.API.authMe === 'function') {
            const response = await window.API.authMe();
            if (response && response.user) {
                localStorage.setItem('userData', JSON.stringify(response.user));
            }
        }
        showApplication();
        return true;
    } catch (error) {
        console.warn('⚠️ Session invalid:', error);
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        showLogin();
        return false;
    }
}

// ============================================================
// 🛡️ منع أخطاء JavaScript غير المعالجة
// ============================================================

window.addEventListener('error', event => {
    console.error('❌ Frontend Error:', event.error || event.message);
});

window.addEventListener('unhandledrejection', event => {
    console.error('❌ Unhandled Promise:', event.reason);
});

// ============================================================
// 🚀 تشغيل التطبيق
// ============================================================

async function initializeApplication() {
    console.log('🚀 تشغيل Marine System...');

    setupLoginEvents();
    setupLoginButton();  // ✅ ربط الزر

    const loggedIn = await checkSession();

    if (loggedIn) {
        await showPage(APP_CONFIG.defaultPage);
    } else {
        showLogin();
    }

    console.log('✅ Marine System Frontend جاهز');
}

// ============================================================
// 🌐 تصدير الدوال العامة
// ============================================================

window.showPage = showPage;
window.doLogin = doLogin;
window.handleLogin = doLogin;        // ✅ تعريف احتياطي
window.doLogout = doLogout;
window.toggleSidebar = function() {
    const sidebar = getElement('sidebar');
    if (sidebar) sidebar.classList.toggle('open');
};
window.toggleNotifications = toggleNotifications;
window.closeNotificationModal = closeNotificationModal;
window.openPasswordModal = openPasswordModal;
window.closePasswordModal = closePasswordModal;
window.saveNewPassword = saveNewPassword;
window.refreshAllPages = refreshAllPages;
window.scrollToTop = scrollToTop;
window.scrollToBottom = scrollToBottom;

// ============================================================
// DOM READY
// ============================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApplication);
} else {
    initializeApplication();
}
