// ============================================================
// 🚀 public/js/app.js
// MARINE SYSTEM - Frontend Application
// Browser Version - Production
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
// 🧰 أدوات مساعدة
// ============================================================

function getElement(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {

    if (value === null || value === undefined) {
        return '';
    }

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

        const data =
            localStorage.getItem('userData');

        return data
            ? JSON.parse(data)
            : null;

    } catch (error) {

        console.error(
            '❌ خطأ في قراءة userData:',
            error
        );

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

    const user =
        getStoredUser();

    const roleElement =
        getElement('userRoleDisplay');

    if (!roleElement) {
        return;
    }

    if (!user) {

        roleElement.textContent = '👤';

        return;
    }

    const name =
        user.name ||
        user.username ||
        'المستخدم';

    const role =
        user.role ||
        user.roleName ||
        'مستخدم';

    roleElement.textContent =
        `👤 ${name} - ${role}`;
}

// ============================================================
// 🔐 عرض التطبيق / تسجيل الدخول
// ============================================================

function showApplication() {

    const loginOverlay =
        getElement(APP_CONFIG.loginOverlay);

    const mainApp =
        getElement(APP_CONFIG.mainApp);

    if (loginOverlay) {
        loginOverlay.style.display = 'none';
    }

    if (mainApp) {
        mainApp.style.display = 'block';
    }

    updateUserDisplay();

    isApplicationReady = true;
}

function showLogin() {

    const loginOverlay =
        getElement(APP_CONFIG.loginOverlay);

    const mainApp =
        getElement(APP_CONFIG.mainApp);

    if (loginOverlay) {
        loginOverlay.style.display = 'flex';
    }

    if (mainApp) {
        mainApp.style.display = 'none';
    }

    isApplicationReady = false;
}

// ============================================================
// 🔑 تسجيل الدخول
// ============================================================

async function doLogin() {

    const usernameInput =
        getElement('username');

    const passwordInput =
        getElement('password');

    const loginButton =
        getElement('loginButton');

    const loginButtonText =
        getElement('loginButtonText');

    const loginButtonIcon =
        getElement('loginButtonIcon');

    const loginError =
        getElement('loginError');

    const username =
        usernameInput
            ? usernameInput.value.trim()
            : '';

    const password =
        passwordInput
            ? passwordInput.value
            : '';

    if (loginError) {
        loginError.textContent = '';
    }

    if (!username || !password) {

        if (loginError) {
            loginError.textContent =
                '❌ يرجى إدخال اسم المستخدم وكلمة المرور';
        }

        return;
    }

    try {

        if (loginButton) {
            loginButton.disabled = true;
        }

        if (loginButtonText) {
            loginButtonText.textContent =
                'جاري تسجيل الدخول...';
        }

        if (loginButtonIcon) {
            loginButtonIcon.textContent = '⏳';
        }

        // ====================================================
        // التأكد من وجود API
        // ====================================================

        if (
            !window.API ||
            typeof window.API.authLogin !== 'function'
        ) {

            throw new Error(
                'واجهة API غير محملة. تأكد من تحميل /js/lib/api.js'
            );
        }

        // ====================================================
        // إرسال تسجيل الدخول
        // ====================================================

        const response =
            await window.API.authLogin(
                username,
                password
            );

        if (!response) {
            throw new Error(
                'لم تصل استجابة من الخادم'
            );
        }

        // ====================================================
        // التحقق من نجاح تسجيل الدخول
        // ====================================================

        if (
            response.success === false
        ) {

            throw new Error(
                response.error ||
                response.message ||
                'فشل تسجيل الدخول'
            );
        }

        // ====================================================
        // حفظ البيانات
        // ====================================================

        if (response.token) {

            localStorage.setItem(
                'authToken',
                response.token
            );
        }

        if (response.user) {

            localStorage.setItem(
                'userData',
                JSON.stringify(response.user)
            );
        }

        // ====================================================
        // فتح التطبيق
        // ====================================================

        showApplication();

        await showPage(
            APP_CONFIG.defaultPage
        );

    } catch (error) {

        console.error(
            '❌ Login Error:',
            error
        );

        if (loginError) {

            loginError.textContent =
                `❌ ${
                    error.message ||
                    'فشل تسجيل الدخول'
                }`;
        }

    } finally {

        if (loginButton) {
            loginButton.disabled = false;
        }

        if (loginButtonText) {
            loginButtonText.textContent =
                'دخول';
        }

        if (loginButtonIcon) {
            loginButtonIcon.textContent = '🚀';
        }
    }
}

// ============================================================
// 🔗 دعم Enter في تسجيل الدخول
// ============================================================

function setupLoginEvents() {

    const username =
        getElement('username');

    const password =
        getElement('password');

    if (username) {

        username.addEventListener(
            'keydown',
            event => {

                if (event.key === 'Enter') {
                    doLogin();
                }

            }
        );
    }

    if (password) {

        password.addEventListener(
            'keydown',
            event => {

                if (event.key === 'Enter') {
                    doLogin();
                }

            }
        );
    }
}

// ============================================================
// 🚪 تسجيل الخروج
// ============================================================

async function doLogout() {

    try {

        if (
            window.API &&
            typeof window.API.authLogout === 'function'
        ) {

            await window.API.authLogout();

        } else {

            localStorage.removeItem(
                'authToken'
            );

            localStorage.removeItem(
                'userData'
            );

            showLogin();
        }

    } catch (error) {

        console.warn(
            '⚠️ Logout:',
            error
        );

        localStorage.removeItem(
            'authToken'
        );

        localStorage.removeItem(
            'userData'
        );

        showLogin();
    }
}

// ============================================================
// 📄 تحميل الصفحات
// ============================================================

async function showPage(page) {

    if (!page) {
        page = APP_CONFIG.defaultPage;
    }

    const container =
        getElement(
            APP_CONFIG.pageContainer
        );

    if (!container) {

        console.error(
            '❌ pageContainer غير موجود'
        );

        return;
    }

    // حماية اسم الصفحة
    if (
        !/^[a-zA-Z0-9_-]+$/.test(page)
    ) {

        console.error(
            '❌ اسم صفحة غير صالح:',
            page
        );

        return;
    }

    currentPage = page;

    // ========================================================
    // تحديث أزرار Sidebar
    // ========================================================

    document
        .querySelectorAll('.nav-btn')
        .forEach(button => {

            button.classList.remove(
                'active'
            );

        });

    const activeButton =
        Array.from(
            document.querySelectorAll(
                '.nav-btn'
            )
        ).find(button => {

            const onclick =
                button.getAttribute(
                    'onclick'
                ) || '';

            return onclick.includes(
                `'${page}'`
            ) ||
            onclick.includes(
                `"${page}"`
            );

        });

    if (activeButton) {

        activeButton.classList.add(
            'active'
        );
    }

    // ========================================================
    // Loading
    // ========================================================

    container.innerHTML = `
        <div class="page-loading"
             style="
                padding:50px;
                text-align:center;
                font-size:20px;
             ">
            <div style="font-size:42px;">
                ⚓
            </div>

            <div>
                جاري تحميل الصفحة...
            </div>
        </div>
    `;

    try {

        const url =
            `${APP_CONFIG.pageBasePath}` +
            `${encodeURIComponent(page)}` +
            `${APP_CONFIG.pageExtension}`;

        const response =
            await fetch(
                url,
                {
                    method: 'GET',
                    headers: {
                        'Accept': 'text/html'
                    },
                    cache: 'no-cache'
                }
            );

        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const html =
            await response.text();

        if (!html.trim()) {

            throw new Error(
                'الصفحة فارغة'
            );
        }

        container.innerHTML =
            html;

        // ====================================================
        // تهيئة الصفحة
        // ====================================================

        await initializePage(
            page
        );

        // ====================================================
        // إغلاق Sidebar على الهاتف
        // ====================================================

        if (
            window.innerWidth <= 900
        ) {

            const sidebar =
                getElement('sidebar');

            if (sidebar) {
                sidebar.classList.remove(
                    'open'
                );
            }
        }

    } catch (error) {

        console.error(
            `❌ فشل تحميل الصفحة ${page}:`,
            error
        );

        container.innerHTML = `

            <div
                style="
                    padding:50px;
                    text-align:center;
                "
            >

                <div
                    style="
                        font-size:55px;
                        margin-bottom:15px;
                    "
                >
                    ⚠️
                </div>

                <h2>
                    تعذر تحميل الصفحة
                </h2>

                <p>
                    الصفحة:
                    <strong>
                        ${escapeHtml(page)}
                    </strong>
                </p>

                <p>
                    الخطأ:
                    ${escapeHtml(error.message)}
                </p>

                <button
                    onclick="showPage('${escapeHtml(page)}')"
                    style="
                        padding:12px 25px;
                        border:0;
                        border-radius:10px;
                        cursor:pointer;
                    "
                >
                    🔄 إعادة المحاولة
                </button>

            </div>
        `;
    }
}

// ============================================================
// 🧠 تهيئة الصفحة بعد تحميل HTML
// ============================================================

async function initializePage(page) {

    try {

        switch (page) {

            case 'dashboard':

                if (
                    typeof window.initDashboard ===
                    'function'
                ) {

                    await window.initDashboard();
                }

                break;


            case 'fleet':

                if (
                    typeof window.initFleetPage ===
                    'function'
                ) {

                    await window.initFleetPage();
                }

                break;


            case 'maintenance':

                if (
                    typeof window.initMaintenancePage ===
                    'function'
                ) {

                    await window.initMaintenancePage();
                }

                break;


            case 'efficiency':

                if (
                    typeof window.initEfficiencyPage ===
                    'function'
                ) {

                    await window.initEfficiencyPage();
                }

                break;


            case 'support':

                if (
                    typeof window.initSupportPage ===
                    'function'
                ) {

                    await window.initSupportPage();
                }

                break;


            case 'users':

                if (
                    typeof window.initUsersPage ===
                    'function'
                ) {

                    await window.initUsersPage();
                }

                break;


            case 'notes':

                if (
                    typeof window.initNotesPage ===
                    'function'
                ) {

                    await window.initNotesPage();
                }

                break;


            case 'sessions':

                if (
                    typeof window.initSessionsPage ===
                    'function'
                ) {

                    await window.initSessionsPage();
                }

                break;


            case 'ai-assistant':

                if (
                    typeof window.initAIAssistant ===
                    'function'
                ) {

                    await window.initAIAssistant();
                }

                break;


            default:

                console.log(
                    `ℹ️ لا توجد تهيئة خاصة للصفحة: ${page}`
                );
        }

    } catch (error) {

        console.error(
            `❌ خطأ في تهيئة ${page}:`,
            error
        );
    }
}

// ============================================================
// 📱 Sidebar
// ============================================================

function toggleSidebar() {

    const sidebar =
        getElement('sidebar');

    if (!sidebar) {
        return;
    }

    sidebar.classList.toggle(
        'open'
    );
}

// ============================================================
// 🔔 Notifications
// ============================================================

function toggleNotifications() {

    const modal =
        getElement(
            'notificationModal'
        );

    if (!modal) {
        return;
    }

    modal.classList.toggle(
        'active'
    );

    // توافق مع CSS المختلفة
    if (
        modal.style.display === 'flex'
    ) {

        modal.style.display = 'none';

    } else {

        modal.style.display = 'flex';
    }
}

function closeNotificationModal() {

    const modal =
        getElement(
            'notificationModal'
        );

    if (!modal) {
        return;
    }

    modal.style.display = 'none';

    modal.classList.remove(
        'active'
    );
}

// ============================================================
// 🔑 Password Modal
// ============================================================

function closePasswordModal() {

    const modal =
        getElement(
            'passwordModal'
        );

    if (!modal) {
        return;
    }

    modal.style.display = 'none';

    modal.classList.remove(
        'active'
    );
}

function openPasswordModal(
    userId,
    userName = ''
) {

    const modal =
        getElement(
            'passwordModal'
        );

    const nameElement =
        getElement(
            'modalUserName'
        );

    if (!modal) {
        return;
    }

    modal.dataset.userId =
        String(userId || '');

    if (nameElement) {
        nameElement.textContent =
            userName || 'المستخدم';
    }

    modal.style.display = 'flex';

    modal.classList.add(
        'active'
    );
}

async function saveNewPassword() {

    const modal =
        getElement(
            'passwordModal'
        );

    const newPassword =
        getElement(
            'newPassword'
        );

    const confirmPassword =
        getElement(
            'confirmPassword'
        );

    if (!modal) {
        return;
    }

    const userId =
        modal.dataset.userId;

    const password =
        newPassword
            ? newPassword.value
            : '';

    const confirmation =
        confirmPassword
            ? confirmPassword.value
            : '';

    if (!userId) {

        alert(
            '❌ لم يتم تحديد المستخدم'
        );

        return;
    }

    if (
        !password ||
        password.length < 8
    ) {

        alert(
            '❌ كلمة المرور يجب أن تحتوي على 8 أحرف على الأقل'
        );

        return;
    }

    if (
        password !== confirmation
    ) {

        alert(
            '❌ كلمتا المرور غير متطابقتين'
        );

        return;
    }

    try {

        const user =
            getStoredUser();

        const currentPassword =
            prompt(
                'أدخل كلمة المرور الحالية:'
            );

        if (!currentPassword) {
            return;
        }

        if (
            !window.API ||
            typeof window.API.changePassword !==
            'function'
        ) {

            throw new Error(
                'API.changePassword غير متوفر'
            );
        }

        await window.API.changePassword(
            userId,
            currentPassword,
            password
        );

        alert(
            '✅ تم تغيير كلمة المرور بنجاح'
        );

        if (newPassword) {
            newPassword.value = '';
        }

        if (confirmPassword) {
            confirmPassword.value = '';
        }

        closePasswordModal();

    } catch (error) {

        console.error(
            '❌ Password change error:',
            error
        );

        alert(
            `❌ ${
                error.message ||
                'فشل تغيير كلمة المرور'
            }`
        );
    }
}

// ============================================================
// 🔄 تحديث التطبيق
// ============================================================

async function refreshAllPages() {

    try {

        await showPage(
            currentPage
        );

    } catch (error) {

        console.error(
            '❌ Refresh error:',
            error
        );
    }
}

// ============================================================
// ⬆️ Scroll
// ============================================================

function scrollToTop() {

    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

function scrollToBottom() {

    window.scrollTo({
        top:
            document.documentElement
                .scrollHeight,

        behavior: 'smooth'
    });
}

// ============================================================
// 🖥️ فحص الجلسة
// ============================================================

async function checkSession() {

    const token =
        getStoredToken();

    if (!token) {

        showLogin();

        return false;
    }

    try {

        // إذا كان API موجوداً نفحص الجلسة
        if (
            window.API &&
            typeof window.API.authMe ===
            'function'
        ) {

            const response =
                await window.API.authMe();

            if (
                response &&
                response.user
            ) {

                localStorage.setItem(
                    'userData',
                    JSON.stringify(
                        response.user
                    )
                );
            }
        }

        showApplication();

        return true;

    } catch (error) {

        console.warn(
            '⚠️ Session invalid:',
            error
        );

        localStorage.removeItem(
            'authToken'
        );

        localStorage.removeItem(
            'userData'
        );

        showLogin();

        return false;
    }
}

// ============================================================
// 🛡️ منع أخطاء JavaScript غير المعالجة
// ============================================================

window.addEventListener(
    'error',
    event => {

        console.error(
            '❌ Frontend Error:',
            event.error ||
            event.message
        );
    }
);

window.addEventListener(
    'unhandledrejection',
    event => {

        console.error(
            '❌ Unhandled Promise:',
            event.reason
        );
    }
);

// ============================================================
// 🚀 تشغيل التطبيق
// ============================================================

async function initializeApplication() {

    console.log(
        '🚀 تشغيل Marine System...'
    );

    setupLoginEvents();

    const loggedIn =
        await checkSession();

    if (loggedIn) {

        await showPage(
            APP_CONFIG.defaultPage
        );

    } else {

        // لا نعرض Dashboard قبل تسجيل الدخول
        showLogin();
    }

    console.log(
        '✅ Marine System Frontend جاهز'
    );
}

// ============================================================
// 🌐 Expose Global Functions
// ============================================================

window.showPage =
    showPage;

window.doLogin =
    doLogin;

window.handleLogin =
    doLogin;

window.doLogout =
    doLogout;

window.toggleSidebar =
    toggleSidebar;

window.toggleNotifications =
    toggleNotifications;

window.closeNotificationModal =
    closeNotificationModal;

window.openPasswordModal =
    openPasswordModal;

window.closePasswordModal =
    closePasswordModal;

window.saveNewPassword =
    saveNewPassword;

window.refreshAllPages =
    refreshAllPages;

window.scrollToTop =
    scrollToTop;

window.scrollToBottom =
    scrollToBottom;

// ============================================================
// DOM READY
// ============================================================

if (
    document.readyState === 'loading'
) {

    document.addEventListener(
        'DOMContentLoaded',
        initializeApplication
    );

} else {

    initializeApplication();
}
