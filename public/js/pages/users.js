// ============================================================
// 👥 MARINE SYSTEM - USERS PAGE
// public/js/pages/users.js
// متوافق مع server.js
// ============================================================

'use strict';

console.log('🚀 تحميل users.js...');

// ============================================================
// 📦 GLOBAL
// ============================================================

if (typeof window.allUsers === 'undefined') {
    window.allUsers = [];
}

// ============================================================
// 🔐 TOKEN
// ============================================================

function usersGetToken() {
    try {
        if (typeof getToken === 'function') {
            return getToken();
        }

        return (
            localStorage.getItem('accessToken') ||
            localStorage.getItem('token') ||
            sessionStorage.getItem('accessToken') ||
            sessionStorage.getItem('token') ||
            null
        );
    } catch (error) {
        console.error('Token error:', error);
        return null;
    }
}

// ============================================================
// 🌐 API HELPER
// ============================================================

async function usersApi(url, options = {}) {

    const token = usersGetToken();

    if (!token) {
        throw new Error('انتهت جلسة الدخول. يرجى تسجيل الدخول من جديد.');
    }

    const headers = {
        'Accept': 'application/json',
        ...(options.headers || {}),
        'Authorization': `Bearer ${token}`
    };

    if (
        options.body &&
        typeof options.body !== 'string'
    ) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, {
        ...options,
        headers
    });

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error(
            `الخادم أعاد استجابة غير صالحة (${response.status})`
        );
    }

    if (response.status === 401) {

        // محاولة تحديث Access Token
        const refreshToken =
            localStorage.getItem('refreshToken');

        if (
            refreshToken &&
            !url.includes('/auth/refresh')
        ) {
            try {

                const refreshResponse =
                    await fetch('/api/auth/refresh', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            refreshToken
                        })
                    });

                const refreshData =
                    await refreshResponse.json();

                if (
                    refreshResponse.ok &&
                    refreshData.success &&
                    refreshData.accessToken
                ) {

                    localStorage.setItem(
                        'accessToken',
                        refreshData.accessToken
                    );

                    localStorage.setItem(
                        'token',
                        refreshData.accessToken
                    );

                    if (refreshData.refreshToken) {
                        localStorage.setItem(
                            'refreshToken',
                            refreshData.refreshToken
                        );
                    }

                    headers.Authorization =
                        `Bearer ${refreshData.accessToken}`;

                    const retryResponse =
                        await fetch(url, {
                            ...options,
                            headers
                        });

                    const retryData =
                        await retryResponse.json();

                    if (!retryResponse.ok) {
                        throw new Error(
                            retryData.error ||
                            'فشل الطلب بعد تحديث الجلسة.'
                        );
                    }

                    return retryData;
                }

            } catch (refreshError) {
                console.error(
                    'Refresh token error:',
                    refreshError
                );
            }
        }

        // الجلسة منتهية
        try {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
        } catch {}

        if (typeof showAlert === 'function') {
            showAlert(
                '🔐 انتهت جلسة الدخول. يرجى تسجيل الدخول من جديد.',
                'warning'
            );
        }

        throw new Error(
            'انتهت جلسة الدخول. يرجى تسجيل الدخول من جديد.'
        );
    }

    if (!response.ok) {
        throw new Error(
            data?.error ||
            `فشل الطلب (${response.status})`
        );
    }

    return data;
}

// ============================================================
// 👥 LOAD USERS
// ============================================================

async function loadUsers() {

    const token = usersGetToken();

    if (!token) {
        console.warn('⚠️ لا يوجد Token.');
        return;
    }

    const tbody =
        document.getElementById('usersBody');

    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6"
                    style="
                        text-align:center;
                        padding:30px;
                        color:rgba(255,255,255,.6);
                    ">
                    ⏳ جاري تحميل المستخدمين...
                </td>
            </tr>
        `;
    }

    try {

        const data =
            await usersApi('/api/users');

        /*
         * server.js يرجع:
         *
         * {
         *   success: true,
         *   users: [...]
         * }
         */

        if (!data.success) {
            throw new Error(
                data.error ||
                'فشل تحميل المستخدمين.'
            );
        }

        window.allUsers =
            Array.isArray(data.users)
                ? data.users
                : [];

        renderUsersTable();

        console.log(
            `✅ تم تحميل ${allUsers.length} مستخدم`
        );

    } catch (error) {

        console.error(
            '❌ Load users error:',
            error
        );

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6"
                        style="
                            text-align:center;
                            padding:30px;
                            color:#f87171;
                        ">
                        ❌ ${escapeUsersHtml(error.message)}
                    </td>
                </tr>
            `;
        }

        if (typeof showAlert === 'function') {
            showAlert(
                '❌ ' + error.message,
                'danger'
            );
        }
    }
}

// ============================================================
// 📋 RENDER TABLE
// ============================================================

function renderUsersTable() {

    const tbody =
        document.getElementById('usersBody');

    if (!tbody) {
        console.warn(
            '⚠️ usersBody غير موجود في الصفحة.'
        );
        return;
    }

    const users =
        Array.isArray(window.allUsers)
            ? window.allUsers
            : [];

    if (users.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td colspan="6"
                    style="
                        text-align:center;
                        padding:30px;
                        color:rgba(255,255,255,.5);
                    ">
                    🚫 لا توجد مستخدمين
                </td>
            </tr>
        `;

        return;
    }

    tbody.innerHTML =
        users.map(user => {

            const id =
                user.id ||
                user._id ||
                '';

            const name =
                user.name ||
                '-';

            const email =
                user.email ||
                '-';

            const role =
                user.role ||
                'مستخدم';

            const active =
                user.isActive !== false;

            const createdAt =
                user.createdAt
                    ? new Date(
                        user.createdAt
                    ).toLocaleDateString('ar-TN')
                    : '-';

            let roleColor =
                '#60a5fa';

            if (role === 'مسؤول') {
                roleColor = '#fbbf24';
            } else if (role === 'محرر') {
                roleColor = '#4ade80';
            }

            return `
                <tr>

                    <td>
                        <strong>
                            ${escapeUsersHtml(name)}
                        </strong>
                    </td>

                    <td>
                        ${escapeUsersHtml(email)}
                    </td>

                    <td>
                        <span
                            style="
                                color:${roleColor};
                                font-weight:700;
                            ">
                            ${escapeUsersHtml(role)}
                        </span>
                    </td>

                    <td>
                        ${
                            active
                                ? '✅ نشط'
                                : '❌ معطل'
                        }
                    </td>

                    <td
                        style="
                            font-size:12px;
                            color:rgba(255,255,255,.4);
                        ">
                        ${createdAt}
                    </td>

                    <td>

                        <button
                            class="btn-sm btn-warning"
                            onclick="editUser('${escapeJs(id)}')"
                            title="تعديل">
                            ✏️
                        </button>

                        <button
                            class="btn-sm btn-danger"
                            onclick="deleteUser('${escapeJs(id)}')"
                            title="حذف">
                            🗑️
                        </button>

                    </td>

                </tr>
            `;

        }).join('');
}

// ============================================================
// ➕ ADD USER
// ============================================================

async function addUser() {

    const token =
        usersGetToken();

    if (!token) {
        showUsersAlert(
            '⚠️ يرجى تسجيل الدخول أولاً',
            'warning'
        );
        return;
    }

    const name =
        document.getElementById('uName')
            ?.value
            .trim();

    const email =
        document.getElementById('uEmail')
            ?.value
            .trim()
            .toLowerCase();

    const password =
        document.getElementById('uPassword')
            ?.value || '';

    const role =
        document.getElementById('uRole')
            ?.value || 'مستخدم';

    if (!name) {
        showUsersAlert(
            '⚠️ الرجاء إدخال اسم المستخدم',
            'warning'
        );
        return;
    }

    if (!email) {
        showUsersAlert(
            '⚠️ الرجاء إدخال البريد الإلكتروني',
            'warning'
        );
        return;
    }

    if (!isValidUsersEmail(email)) {
        showUsersAlert(
            '⚠️ البريد الإلكتروني غير صالح',
            'warning'
        );
        return;
    }

    if (!password || password.length < 4) {
        showUsersAlert(
            '⚠️ كلمة المرور يجب أن تكون 4 أحرف على الأقل',
            'warning'
        );
        return;
    }

    if (
        ![
            'مسؤول',
            'محرر',
            'مستخدم'
        ].includes(role)
    ) {
        showUsersAlert(
            '⚠️ الدور المحدد غير صالح',
            'warning'
        );
        return;
    }

    const button =
        getUserActionButton();

    setUsersButtonLoading(
        button,
        '⏳ جاري الإضافة...'
    );

    try {

        const data =
            await usersApi('/api/users', {
                method: 'POST',
                body: {
                    name,
                    email,
                    password,
                    role,
                    isActive: true
                }
            });

        if (!data.success) {
            throw new Error(
                data.error ||
                'فشل إضافة المستخدم'
            );
        }

        showUsersAlert(
            '✅ تم إضافة المستخدم بنجاح',
            'success'
        );

        clearUserInputs();

        closeAddUserModal();

        await loadUsers();

    } catch (error) {

        console.error(
            '❌ Add user error:',
            error
        );

        showUsersAlert(
            '❌ ' + error.message,
            'danger'
        );

    } finally {

        restoreUsersButton(button);
    }
}

// ============================================================
// ✏️ EDIT USER
// ============================================================

async function editUser(id) {

    const token =
        usersGetToken();

    if (!token) {
        showUsersAlert(
            '⚠️ يرجى تسجيل الدخول أولاً',
            'warning'
        );
        return;
    }

    if (!id) {
        showUsersAlert(
            '⚠️ معرف المستخدم غير صالح',
            'warning'
        );
        return;
    }

    try {

        /*
         * لا يوجد endpoint:
         * GET /api/users/:id
         *
         * لذلك نستخدم البيانات التي سبق تحميلها.
         */

        const user =
            window.allUsers.find(
                item =>
                    String(
                        item.id ||
                        item._id
                    ) === String(id)
            );

        if (!user) {

            await loadUsers();

            const reloadedUser =
                window.allUsers.find(
                    item =>
                        String(
                            item.id ||
                            item._id
                        ) === String(id)
                );

            if (!reloadedUser) {
                throw new Error(
                    'المستخدم غير موجود.'
                );
            }

            fillUserForm(
                reloadedUser
            );

        } else {

            fillUserForm(user);

        }

        window.editingUserId =
            String(id);

        const button =
            getUserActionButton();

        if (button) {
            button.textContent =
                '💾 تحديث المستخدم';

            button.onclick =
                function () {
                    updateUser(id);
                };
        }

        const modal =
            document.getElementById(
                'addUserModal'
            );

        if (modal) {
            modal.style.display =
                'flex';
        }

        showUsersAlert(
            '✏️ يمكنك الآن تعديل بيانات المستخدم',
            'info'
        );

    } catch (error) {

        console.error(
            '❌ Edit user error:',
            error
        );

        showUsersAlert(
            '❌ ' + error.message,
            'danger'
        );
    }
}

// ============================================================
// 🔄 UPDATE USER
// ============================================================

async function updateUser(id) {

    const token =
        usersGetToken();

    if (!token) {
        showUsersAlert(
            '⚠️ يرجى تسجيل الدخول أولاً',
            'warning'
        );
        return;
    }

    const name =
        document.getElementById('uName')
            ?.value
            .trim();

    const email =
        document.getElementById('uEmail')
            ?.value
            .trim()
            .toLowerCase();

    const password =
        document.getElementById('uPassword')
            ?.value || '';

    const role =
        document.getElementById('uRole')
            ?.value || 'مستخدم';

    if (!name) {
        showUsersAlert(
            '⚠️ الرجاء إدخال اسم المستخدم',
            'warning'
        );
        return;
    }

    if (!email) {
        showUsersAlert(
            '⚠️ الرجاء إدخال البريد الإلكتروني',
            'warning'
        );
        return;
    }

    if (!isValidUsersEmail(email)) {
        showUsersAlert(
            '⚠️ البريد الإلكتروني غير صالح',
            'warning'
        );
        return;
    }

    if (
        ![
            'مسؤول',
            'محرر',
            'مستخدم'
        ].includes(role)
    ) {
        showUsersAlert(
            '⚠️ الدور غير صالح',
            'warning'
        );
        return;
    }

    if (
        password &&
        password.length < 4
    ) {
        showUsersAlert(
            '⚠️ كلمة المرور يجب أن تكون 4 أحرف على الأقل',
            'warning'
        );
        return;
    }

    const button =
        getUserActionButton();

    setUsersButtonLoading(
        button,
        '⏳ جاري التحديث...'
    );

    try {

        const body = {
            name,
            email,
            role
        };

        if (password) {
            body.password =
                password;
        }

        const data =
            await usersApi(
                `/api/users/${encodeURIComponent(id)}`,
                {
                    method: 'PUT',
                    body
                }
            );

        if (!data.success) {
            throw new Error(
                data.error ||
                'فشل تحديث المستخدم'
            );
        }

        showUsersAlert(
            '✅ تم تحديث المستخدم بنجاح',
            'success'
        );

        clearUserInputs();

        window.editingUserId =
            null;

        resetUserActionButton();

        closeAddUserModal();

        await loadUsers();

    } catch (error) {

        console.error(
            '❌ Update user error:',
            error
        );

        showUsersAlert(
            '❌ ' + error.message,
            'danger'
        );

    } finally {

        restoreUsersButton(button);
    }
}

// ============================================================
// 🗑️ DELETE USER
// ============================================================

async function deleteUser(id) {

    const token =
        usersGetToken();

    if (!token) {
        showUsersAlert(
            '⚠️ يرجى تسجيل الدخول أولاً',
            'warning'
        );
        return;
    }

    const currentUser =
        getCurrentUsersUser();

    if (
        currentUser &&
        String(
            currentUser.id ||
            currentUser._id
        ) === String(id)
    ) {
        showUsersAlert(
            '⚠️ لا يمكنك حذف حسابك بنفسك.',
            'warning'
        );
        return;
    }

    const user =
        window.allUsers.find(
            item =>
                String(
                    item.id ||
                    item._id
                ) === String(id)
        );

    const userName =
        user?.name || 'هذا المستخدم';

    if (
        !confirm(
            `⚠️ هل أنت متأكد من حذف المستخدم:\n\n${userName}\n\nلا يمكن التراجع عن هذا الإجراء.`
        )
    ) {
        return;
    }

    try {

        const data =
            await usersApi(
                `/api/users/${encodeURIComponent(id)}`,
                {
                    method: 'DELETE'
                }
            );

        if (!data.success) {
            throw new Error(
                data.error ||
                'فشل حذف المستخدم'
            );
        }

        showUsersAlert(
            '✅ تم حذف المستخدم بنجاح',
            'success'
        );

        await loadUsers();

    } catch (error) {

        console.error(
            '❌ Delete user error:',
            error
        );

        showUsersAlert(
            '❌ ' + error.message,
            'danger'
        );
    }
}

// ============================================================
// 🧹 CLEAR FORM
// ============================================================

function clearUserInputs() {

    const name =
        document.getElementById('uName');

    const email =
        document.getElementById('uEmail');

    const password =
        document.getElementById('uPassword');

    const role =
        document.getElementById('uRole');

    if (name)
        name.value = '';

    if (email)
        email.value = '';

    if (password) {
        password.value = '';
        password.placeholder =
            'كلمة المرور';
    }

    if (role)
        role.value = 'مستخدم';

    window.editingUserId = null;

    resetUserActionButton();
}

// ============================================================
// 📝 FILL FORM
// ============================================================

function fillUserForm(user) {

    const name =
        document.getElementById('uName');

    const email =
        document.getElementById('uEmail');

    const password =
        document.getElementById('uPassword');

    const role =
        document.getElementById('uRole');

    if (name)
        name.value =
            user.name || '';

    if (email)
        email.value =
            user.email || '';

    if (password) {
        password.value = '';
        password.placeholder =
            'اترك فارغاً للحفاظ على كلمة المرور';
    }

    if (role) {

        role.value =
            [
                'مسؤول',
                'محرر',
                'مستخدم'
            ].includes(user.role)
                ? user.role
                : 'مستخدم';
    }
}

// ============================================================
// 🔄 RESET BUTTON
// ============================================================

function resetUserActionButton() {

    const button =
        getUserActionButton();

    if (!button) return;

    button.textContent =
        '💾 إضافة مستخدم';

    button.onclick =
        addUser;

    button.disabled =
        false;
}

// ============================================================
// 🔘 GET ACTION BUTTON
// ============================================================

function getUserActionButton() {

    const exact =
        document.querySelector(
            '[onclick="addUser()"]'
        );

    if (exact)
        return exact;

    return document.querySelector(
        '#addUserModal button.btn-save'
    );
}

// ============================================================
// ⏳ BUTTON LOADING
// ============================================================

function setUsersButtonLoading(
    button,
    text
) {

    if (!button) return;

    button.disabled =
        true;

    button.dataset.oldText =
        button.textContent;

    button.textContent =
        text;
}

// ============================================================
// 🔙 RESTORE BUTTON
// ============================================================

function restoreUsersButton(button) {

    if (!button) return;

    button.disabled =
        false;

    if (
        button.dataset.oldText &&
        !window.editingUserId
    ) {
        button.textContent =
            button.dataset.oldText;
    }
}

// ============================================================
// ❌ CLOSE MODAL
// ============================================================

function closeAddUserModal() {

    const modal =
        document.getElementById(
            'addUserModal'
        );

    if (modal) {
        modal.style.display =
            'none';
    }
}

// ============================================================
// 👤 CURRENT USER
// ============================================================

function getCurrentUsersUser() {

    try {

        if (
            typeof currentUser !==
            'undefined' &&
            currentUser
        ) {
            return currentUser;
        }

        const raw =
            localStorage.getItem(
                'user'
            );

        if (raw) {
            return JSON.parse(raw);
        }

    } catch (error) {
        console.warn(
            'Current user error:',
            error
        );
    }

    return null;
}

// ============================================================
// 📧 EMAIL VALIDATION
// ============================================================

function isValidUsersEmail(email) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(email);
}

// ============================================================
// 🛡️ HTML ESCAPE
// ============================================================

function escapeUsersHtml(value) {

    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================================
// 🛡️ JS ESCAPE
// ============================================================

function escapeJs(value) {

    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
}

// ============================================================
// 🔔 ALERT
// ============================================================

function showUsersAlert(
    message,
    type = 'info'
) {

    if (
        typeof showAlert ===
        'function'
    ) {
        showAlert(
            message,
            type
        );
        return;
    }

    alert(message);
}

// ============================================================
// 🚀 INITIALIZE
// ============================================================

function initUsersPage() {

    console.log(
        '👥 تهيئة صفحة المستخدمين...'
    );

    loadUsers();
}

// ============================================================
// 🌐 GLOBAL EXPORTS
// ============================================================

window.loadUsers =
    loadUsers;

window.renderUsersTable =
    renderUsersTable;

window.addUser =
    addUser;

window.editUser =
    editUser;

window.updateUser =
    updateUser;

window.deleteUser =
    deleteUser;

window.clearUserInputs =
    clearUserInputs;

window.closeAddUserModal =
    closeAddUserModal;

window.initUsersPage =
    initUsersPage;

// ============================================================
// ✅ READY
// ============================================================

console.log(
    '✅ users.js loaded successfully'
);
