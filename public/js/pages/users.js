/**
 * ============================================================
 * 👥 USERS.JS v8.0 - إدارة المستخدمين (نسخة محسنة)
 * ============================================================
 * ✅ إدارة كاملة للمستخدمين (CRUD)
 * ✅ صلاحيات متقدمة
 * ✅ توثيق JSDoc
 * ✅ معالجة الأخطاء
 * ✅ واجهة تفاعلية
 * ============================================================
 */

'use strict';

console.log('👥 [Users] تحميل وحدة إدارة المستخدمين...');

// ============================================================
// 📦 STATE - الحالة
// ============================================================

let usersState = {
    users: [],
    editingId: null,
    currentPage: 1,
    pageSize: 10,
    filters: {
        search: '',
        role: 'الكل',
        status: 'الكل'
    }
};

// ============================================================
// 🔧 HELPERS - دوال مساعدة
// ============================================================

/**
 * الحصول على التوكن من التخزين
 * @returns {string|null}
 */
function getToken() {
    try {
        return localStorage.getItem('accessToken') ||
               localStorage.getItem('token') ||
               sessionStorage.getItem('accessToken') ||
               sessionStorage.getItem('token') ||
               null;
    } catch (error) {
        console.error('❌ [Users] خطأ في التوكن:', error);
        return null;
    }
}

/**
 * الحصول على المستخدم الحالي
 * @returns {Object|null}
 */
function getCurrentUser() {
    try {
        if (typeof window.currentUser !== 'undefined' && window.currentUser) {
            return window.currentUser;
        }
        const raw = localStorage.getItem('user');
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn('⚠️ [Users] خطأ في جلب المستخدم الحالي:', error);
        return null;
    }
}

/**
 * تنقية النص من HTML
 * @param {string} text - النص المراد تنقيته
 * @returns {string}
 */
function escapeHTML(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * تنقية النص لاستخدامه في JavaScript
 * @param {string} text - النص المراد تنقيته
 * @returns {string}
 */
function escapeJS(text) {
    return String(text ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * التحقق من صحة البريد الإلكتروني
 * @param {string} email - البريد الإلكتروني
 * @returns {boolean}
 */
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * الحصول على اسم الدور بالعربية
 * @param {string} role - اسم الدور
 * @returns {string}
 */
function getRoleName(role) {
    const roles = {
        'admin': 'مسؤول',
        'manager': 'مدير',
        'editor': 'محرر',
        'operator': 'مشغل',
        'viewer': 'مشاهد',
        'مستخدم': 'مستخدم',
        'محرر': 'محرر',
        'مسؤول': 'مسؤول'
    };
    return roles[role] || role || 'مستخدم';
}

/**
 * الحصول على لون الدور
 * @param {string} role - اسم الدور
 * @returns {string}
 */
function getRoleColor(role) {
    const colors = {
        'مسؤول': '#fbbf24',
        'مدير': '#60a5fa',
        'محرر': '#4ade80',
        'مشغل': '#a78bfa',
        'مشاهد': '#94a3b8',
        'مستخدم': '#94a3b8'
    };
    return colors[getRoleName(role)] || '#94a3b8';
}

/**
 * عرض إشعار
 * @param {string} message - نص الإشعار
 * @param {string} type - نوع الإشعار (success, error, warning, info)
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(30px)';
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 300);
    }, 3000);
}

// ============================================================
// 🌐 API - الاتصال بالخادم
// ============================================================

/**
 * إجراء طلب إلى واجهة API
 * @param {string} url - المسار
 * @param {Object} options - خيارات الطلب
 * @returns {Promise<Object>}
 */
async function apiRequest(url, options = {}) {
    const token = getToken();
    
    if (!token) {
        throw new Error('انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً');
    }

    const headers = {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers || {})
    };

    if (options.body && typeof options.body !== 'string') {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include'
    });

    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error(`الخادم أعاد استجابة غير صالحة (${response.status})`);
    }

    // معالجة انتهاء الجلسة
    if (response.status === 401) {
        // محاولة تجديد التوكن
        const refreshToken = localStorage.getItem('refreshToken');
        
        if (refreshToken && !url.includes('/auth/refresh')) {
            try {
                const refreshResponse = await fetch('/api/auth/refresh', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken }),
                    credentials: 'include'
                });

                const refreshData = await refreshResponse.json();

                if (refreshResponse.ok && refreshData.success && refreshData.accessToken) {
                    localStorage.setItem('accessToken', refreshData.accessToken);
                    localStorage.setItem('token', refreshData.accessToken);
                    
                    if (refreshData.refreshToken) {
                        localStorage.setItem('refreshToken', refreshData.refreshToken);
                    }

                    // إعادة الطلب بالتوكن الجديد
                    headers.Authorization = `Bearer ${refreshData.accessToken}`;
                    const retryResponse = await fetch(url, { ...options, headers });
                    const retryData = await retryResponse.json();
                    
                    if (!retryResponse.ok) {
                        throw new Error(retryData.error || 'فشل الطلب بعد تحديث الجلسة');
                    }
                    
                    return retryData;
                }
            } catch (refreshError) {
                console.error('❌ [Users] خطأ في تجديد التوكن:', refreshError);
            }
        }

        // تنظيف التخزين
        ['accessToken', 'token', 'refreshToken', 'user'].forEach(key => {
            try { localStorage.removeItem(key); } catch {}
        });

        throw new Error('انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً');
    }

    if (!response.ok) {
        throw new Error(data?.error || `فشل الطلب (${response.status})`);
    }

    return data;
}

// ============================================================
// 👥 LOAD USERS - تحميل المستخدمين
// ============================================================

/**
 * تحميل قائمة المستخدمين من الخادم
 */
async function loadUsers() {
    console.log('🔄 [Users] تحميل المستخدمين...');
    
    const token = getToken();
    if (!token) {
        console.warn('⚠️ [Users] لا يوجد توكن');
        showToast('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }

    const tbody = document.getElementById('usersBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center;padding:40px;color:var(--text-dim);">
                    <div class="loader-spinner" style="margin:0 auto 12px;"></div>
                    جاري تحميل المستخدمين...
                </td>
            </tr>
        `;
    }

    try {
        const data = await apiRequest('/api/users');
        
        if (!data.success) {
            throw new Error(data.error || 'فشل تحميل المستخدمين');
        }

        usersState.users = Array.isArray(data.users) ? data.users : [];
        usersState.filtered = [...usersState.users];
        usersState.currentPage = 1;
        
        renderUsersTable();
        updateUsersStats();
        populateUsersFilters();
        
        console.log(`✅ [Users] تم تحميل ${usersState.users.length} مستخدم`);
        showToast(`✅ تم تحميل ${usersState.users.length} مستخدم`, 'success');

    } catch (error) {
        console.error('❌ [Users] خطأ في تحميل المستخدمين:', error);
        
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center;padding:40px;color:var(--danger);">
                        <i class="fas fa-exclamation-circle" style="font-size:32px;display:block;margin-bottom:12px;"></i>
                        ${escapeHTML(error.message)}
                        <br>
                        <button onclick="loadUsers()" style="margin-top:12px;padding:6px 16px;background:var(--accent);border:none;border-radius:6px;color:#fff;cursor:pointer;">
                            <i class="fas fa-sync-alt"></i> إعادة المحاولة
                        </button>
                    </td>
                </tr>
            `;
        }
        
        showToast(`❌ ${error.message}`, 'error');
    }
}

// ============================================================
// 📋 RENDER TABLE - عرض الجدول
// ============================================================

/**
 * عرض جدول المستخدمين
 */
function renderUsersTable() {
    const tbody = document.getElementById('usersBody');
    if (!tbody) {
        console.warn('⚠️ [Users] usersBody غير موجود');
        return;
    }

    const users = usersState.filtered || usersState.users || [];
    const total = users.length;
    const totalPages = Math.ceil(total / usersState.pageSize);
    const start = (usersState.currentPage - 1) * usersState.pageSize;
    const end = Math.min(start + usersState.pageSize, total);
    const pageData = users.slice(start, end);

    // تحديث معلومات الصفحة
    document.getElementById('usersCount')?.textContent = `${total} مستخدم`;
    document.getElementById('usersPageInfo')?.textContent = `الصفحة ${usersState.currentPage} من ${totalPages || 1}`;

    if (total === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center;padding:40px;color:var(--text-dim);">
                    <i class="fas fa-users" style="font-size:32px;display:block;margin-bottom:12px;opacity:0.3;"></i>
                    ${usersState.filters.search ? 'لا توجد نتائج مطابقة للبحث' : 'لا يوجد مستخدمين مسجلين'}
                </td>
            </tr>
        `;
        return;
    }

    const currentUser = getCurrentUser();

    tbody.innerHTML = pageData.map(user => {
        const id = user.id || user._id || '';
        const name = user.name || '-';
        const email = user.email || '-';
        const role = getRoleName(user.role);
        const roleColor = getRoleColor(role);
        const isActive = user.isActive !== false;
        const createdAt = user.createdAt ? new Date(user.createdAt).toLocaleDateString('ar-TN') : '-';
        const isCurrentUser = currentUser && String(currentUser.id || currentUser._id) === String(id);

        return `
            <tr>
                <td>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div class="user-avatar-small" style="
                            width:32px;
                            height:32px;
                            border-radius:50%;
                            background:linear-gradient(135deg, ${roleColor}, #8b5cf6);
                            display:flex;
                            align-items:center;
                            justify-content:center;
                            color:#fff;
                            font-weight:700;
                            font-size:13px;
                        ">
                            ${name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <strong>${escapeHTML(name)}</strong>
                            ${isCurrentUser ? '<span style="font-size:10px;color:var(--accent);margin-right:6px;">(أنت)</span>' : ''}
                        </div>
                    </div>
                </td>
                <td style="color:var(--text-muted);">${escapeHTML(email)}</td>
                <td>
                    <span style="color:${roleColor};font-weight:600;">
                        ${escapeHTML(role)}
                    </span>
                </td>
                <td>
                    ${isActive 
                        ? '<span class="status-badge status-active">✅ نشط</span>'
                        : '<span class="status-badge status-inactive">❌ معطل</span>'
                    }
                </td>
                <td style="font-size:12px;color:var(--text-dim);">${createdAt}</td>
                <td>
                    <button class="btn-icon btn-edit" onclick="editUser('${escapeJS(id)}')" title="تعديل">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${!isCurrentUser ? `
                        <button class="btn-icon btn-delete" onclick="deleteUser('${escapeJS(id)}')" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================================
// 📊 UPDATE STATS - تحديث الإحصائيات
// ============================================================

function updateUsersStats() {
    const users = usersState.users || [];
    const total = users.length;
    const active = users.filter(u => u.isActive !== false).length;
    const inactive = users.filter(u => u.isActive === false).length;
    const admins = users.filter(u => u.role === 'admin' || u.role === 'مسؤول').length;

    document.getElementById('usersTotal')?.textContent = total;
    document.getElementById('usersActive')?.textContent = active;
    document.getElementById('usersInactive')?.textContent = inactive;
    document.getElementById('usersAdmins')?.textContent = admins;
}

// ============================================================
// 🔍 FILTERS - الفلاتر والبحث
// ============================================================

function filterUsers() {
    const search = document.getElementById('searchUsers')?.value?.toLowerCase()?.trim() || '';
    const roleFilter = document.getElementById('filterUserRole')?.value || 'الكل';
    const statusFilter = document.getElementById('filterUserStatus')?.value || 'الكل';

    usersState.filters = { search, role: roleFilter, status: statusFilter };

    usersState.filtered = usersState.users.filter(user => {
        let match = true;

        if (search) {
            const text = [
                user.name, user.email, user.username,
                getRoleName(user.role)
            ].filter(Boolean).join(' ').toLowerCase();
            match = text.includes(search);
        }

        if (match && roleFilter !== 'الكل') {
            match = getRoleName(user.role) === roleFilter;
        }

        if (match && statusFilter !== 'الكل') {
            const isActive = user.isActive !== false;
            match = statusFilter === 'نشط' ? isActive : !isActive;
        }

        return match;
    });

    usersState.currentPage = 1;
    renderUsersTable();
}

function clearUsersFilters() {
    const search = document.getElementById('searchUsers');
    const roleFilter = document.getElementById('filterUserRole');
    const statusFilter = document.getElementById('filterUserStatus');

    if (search) search.value = '';
    if (roleFilter) roleFilter.value = 'الكل';
    if (statusFilter) statusFilter.value = 'الكل';

    filterUsers();
    showToast('🔄 تم مسح الفلاتر', 'info');
}

function populateUsersFilters() {
    // ملء خيارات الأدوار
    const roles = [...new Set(usersState.users.map(u => getRoleName(u.role)))];
    const roleSelect = document.getElementById('filterUserRole');
    if (roleSelect) {
        const currentValue = roleSelect.value;
        roleSelect.innerHTML = '<option value="الكل">جميع الأدوار</option>';
        roles.sort().forEach(r => {
            roleSelect.innerHTML += `<option value="${escapeHTML(r)}">${escapeHTML(r)}</option>`;
        });
        roleSelect.value = currentValue;
    }
}

// ============================================================
// 📄 PAGINATION - ترقيم الصفحات
// ============================================================

function prevUsersPage() {
    if (usersState.currentPage > 1) {
        usersState.currentPage--;
        renderUsersTable();
    }
}

function nextUsersPage() {
    const totalPages = Math.ceil((usersState.filtered || usersState.users).length / usersState.pageSize);
    if (usersState.currentPage < totalPages) {
        usersState.currentPage++;
        renderUsersTable();
    }
}

// ============================================================
// ➕ ADD USER - إضافة مستخدم
// ============================================================

/**
 * فتح نافذة إضافة مستخدم
 */
function openAddUserModal() {
    usersState.editingId = null;
    document.getElementById('addUserModalTitle').textContent = '➕ إضافة مستخدم جديد';
    document.getElementById('addUserModal').style.display = 'flex';
    clearUserForm();
    
    const nameInput = document.getElementById('uName');
    if (nameInput) nameInput.focus();
    
    resetUserActionButton();
}

/**
 * إضافة مستخدم جديد
 */
async function addUser() {
    const token = getToken();
    if (!token) {
        showToast('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }

    const name = document.getElementById('uName')?.value?.trim() || '';
    const email = document.getElementById('uEmail')?.value?.trim()?.toLowerCase() || '';
    const password = document.getElementById('uPassword')?.value || '';
    const role = document.getElementById('uRole')?.value || 'مستخدم';
    const isActive = document.getElementById('uActive')?.checked !== false;

    // التحقق من الحقول
    if (!name) {
        showToast('⚠️ الرجاء إدخال اسم المستخدم', 'warning');
        document.getElementById('uName')?.focus();
        return;
    }

    if (!email) {
        showToast('⚠️ الرجاء إدخال البريد الإلكتروني', 'warning');
        document.getElementById('uEmail')?.focus();
        return;
    }

    if (!isValidEmail(email)) {
        showToast('⚠️ البريد الإلكتروني غير صالح', 'warning');
        document.getElementById('uEmail')?.focus();
        return;
    }

    if (!password || password.length < 6) {
        showToast('⚠️ كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'warning');
        document.getElementById('uPassword')?.focus();
        return;
    }

    const button = document.querySelector('#addUserModal .btn-save') || 
                   document.querySelector('#addUserModal [onclick="addUser()"]');
    
    if (button) {
        button.disabled = true;
        button.textContent = '⏳ جاري الإضافة...';
    }

    try {
        const data = await apiRequest('/api/users', {
            method: 'POST',
            body: {
                name,
                email,
                password,
                role,
                isActive
            }
        });

        if (!data.success) {
            throw new Error(data.error || 'فشل إضافة المستخدم');
        }

        showToast('✅ تم إضافة المستخدم بنجاح', 'success');
        closeAddUserModal();
        await loadUsers();

    } catch (error) {
        console.error('❌ [Users] خطأ في إضافة المستخدم:', error);
        showToast(`❌ ${error.message}`, 'error');
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = '💾 إضافة مستخدم';
        }
    }
}

// ============================================================
// ✏️ EDIT USER - تعديل مستخدم
// ============================================================

/**
 * فتح نافذة تعديل مستخدم
 * @param {string} id - معرف المستخدم
 */
async function editUser(id) {
    const token = getToken();
    if (!token) {
        showToast('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }

    if (!id) {
        showToast('⚠️ معرف المستخدم غير صالح', 'warning');
        return;
    }

    try {
        // البحث عن المستخدم في البيانات المحملة
        let user = usersState.users.find(u => String(u.id || u._id) === String(id));

        // إذا لم يوجد، إعادة التحميل
        if (!user) {
            await loadUsers();
            user = usersState.users.find(u => String(u.id || u._id) === String(id));
        }

        if (!user) {
            throw new Error('المستخدم غير موجود');
        }

        // ملء النموذج
        usersState.editingId = String(id);
        document.getElementById('addUserModalTitle').textContent = `✏️ تعديل: ${user.name}`;
        document.getElementById('addUserModal').style.display = 'flex';

        document.getElementById('uName').value = user.name || '';
        document.getElementById('uEmail').value = user.email || '';
        document.getElementById('uPassword').value = '';
        document.getElementById('uPassword').placeholder = 'اترك فارغاً للحفاظ على كلمة المرور';
        document.getElementById('uRole').value = getRoleName(user.role) || 'مستخدم';
        document.getElementById('uActive').checked = user.isActive !== false;

        // تغيير زر الإضافة إلى زر تحديث
        const button = document.querySelector('#addUserModal .btn-save') || 
                       document.querySelector('#addUserModal [onclick="addUser()"]');
        if (button) {
            button.textContent = '💾 تحديث المستخدم';
            button.onclick = () => updateUser(id);
        }

        showToast('✏️ يمكنك تعديل بيانات المستخدم', 'info');

    } catch (error) {
        console.error('❌ [Users] خطأ في تعديل المستخدم:', error);
        showToast(`❌ ${error.message}`, 'error');
    }
}

// ============================================================
// 🔄 UPDATE USER - تحديث مستخدم
// ============================================================

/**
 * تحديث بيانات مستخدم
 * @param {string} id - معرف المستخدم
 */
async function updateUser(id) {
    const token = getToken();
    if (!token) {
        showToast('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }

    const name = document.getElementById('uName')?.value?.trim() || '';
    const email = document.getElementById('uEmail')?.value?.trim()?.toLowerCase() || '';
    const password = document.getElementById('uPassword')?.value || '';
    const role = document.getElementById('uRole')?.value || 'مستخدم';
    const isActive = document.getElementById('uActive')?.checked !== false;

    if (!name) {
        showToast('⚠️ الرجاء إدخال اسم المستخدم', 'warning');
        return;
    }

    if (!email) {
        showToast('⚠️ الرجاء إدخال البريد الإلكتروني', 'warning');
        return;
    }

    if (!isValidEmail(email)) {
        showToast('⚠️ البريد الإلكتروني غير صالح', 'warning');
        return;
    }

    if (password && password.length < 6) {
        showToast('⚠️ كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'warning');
        return;
    }

    const button = document.querySelector('#addUserModal .btn-save');
    if (button) {
        button.disabled = true;
        button.textContent = '⏳ جاري التحديث...';
    }

    try {
        const body = { name, email, role, isActive };
        if (password) body.password = password;

        const data = await apiRequest(`/api/users/${encodeURIComponent(id)}`, {
            method: 'PUT',
            body
        });

        if (!data.success) {
            throw new Error(data.error || 'فشل تحديث المستخدم');
        }

        showToast('✅ تم تحديث المستخدم بنجاح', 'success');
        usersState.editingId = null;
        closeAddUserModal();
        resetUserActionButton();
        await loadUsers();

    } catch (error) {
        console.error('❌ [Users] خطأ في تحديث المستخدم:', error);
        showToast(`❌ ${error.message}`, 'error');
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = '💾 تحديث المستخدم';
        }
    }
}

// ============================================================
// 🗑️ DELETE USER - حذف مستخدم
// ============================================================

/**
 * حذف مستخدم
 * @param {string} id - معرف المستخدم
 */
async function deleteUser(id) {
    const token = getToken();
    if (!token) {
        showToast('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }

    const currentUser = getCurrentUser();
    if (currentUser && String(currentUser.id || currentUser._id) === String(id)) {
        showToast('⚠️ لا يمكنك حذف حسابك بنفسك', 'warning');
        return;
    }

    const user = usersState.users.find(u => String(u.id || u._id) === String(id));
    const userName = user?.name || 'هذا المستخدم';

    if (!confirm(`⚠️ هل أنت متأكد من حذف المستخدم:\n\n${userName}\n\nلا يمكن التراجع عن هذا الإجراء.`)) {
        return;
    }

    try {
        const data = await apiRequest(`/api/users/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        });

        if (!data.success) {
            throw new Error(data.error || 'فشل حذف المستخدم');
        }

        showToast('✅ تم حذف المستخدم بنجاح', 'success');
        await loadUsers();

    } catch (error) {
        console.error('❌ [Users] خطأ في حذف المستخدم:', error);
        showToast(`❌ ${error.message}`, 'error');
    }
}

// ============================================================
// 🧹 FORM HELPERS - دوال مساعدة للنموذج
// ============================================================

/**
 * تنظيف حقول النموذج
 */
function clearUserForm() {
    const fields = ['uName', 'uEmail', 'uPassword'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.value = '';
            if (id === 'uPassword') el.placeholder = 'كلمة المرور';
        }
    });
    
    const role = document.getElementById('uRole');
    if (role) role.value = 'مستخدم';
    
    const active = document.getElementById('uActive');
    if (active) active.checked = true;
    
    usersState.editingId = null;
}

/**
 * إغلاق نافذة إضافة/تعديل المستخدم
 */
function closeAddUserModal() {
    const modal = document.getElementById('addUserModal');
    if (modal) modal.style.display = 'none';
    clearUserForm();
    resetUserActionButton();
}

/**
 * إعادة تعيين زر الإجراء
 */
function resetUserActionButton() {
    const button = document.querySelector('#addUserModal .btn-save') || 
                   document.querySelector('#addUserModal [onclick="addUser()"]');
    if (button) {
        button.textContent = '💾 إضافة مستخدم';
        button.onclick = addUser;
        button.disabled = false;
    }
}

// ============================================================
// 🔄 TOGGLE USER STATUS - تبديل حالة المستخدم
// ============================================================

/**
 * تبديل حالة المستخدم (نشط/معطل)
 * @param {string} id - معرف المستخدم
 */
async function toggleUserStatus(id) {
    const token = getToken();
    if (!token) {
        showToast('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }

    const user = usersState.users.find(u => String(u.id || u._id) === String(id));
    if (!user) {
        showToast('⚠️ المستخدم غير موجود', 'warning');
        return;
    }

    const currentUser = getCurrentUser();
    if (currentUser && String(currentUser.id || currentUser._id) === String(id)) {
        showToast('⚠️ لا يمكنك تغيير حالة حسابك بنفسك', 'warning');
        return;
    }

    const newStatus = user.isActive !== false ? false : true;
    const statusText = newStatus ? 'تفعيل' : 'تعطيل';

    if (!confirm(`⚠️ هل أنت متأكد من ${statusText} المستخدم:\n\n${user.name}`)) {
        return;
    }

    try {
        const data = await apiRequest(`/api/users/${encodeURIComponent(id)}`, {
            method: 'PUT',
            body: {
                name: user.name,
                email: user.email,
                role: user.role,
                isActive: newStatus
            }
        });

        if (!data.success) {
            throw new Error(data.error || `فشل ${statusText} المستخدم`);
        }

        showToast(`✅ تم ${statusText} المستخدم بنجاح`, 'success');
        await loadUsers();

    } catch (error) {
        console.error(`❌ [Users] خطأ في ${statusText} المستخدم:`, error);
        showToast(`❌ ${error.message}`, 'error');
    }
}

// ============================================================
// 🚀 INIT - تهيئة الصفحة
// ============================================================

/**
 * تهيئة صفحة المستخدمين
 */
function initUsersPage() {
    console.log('👥 [Users] تهيئة صفحة المستخدمين...');
    
    // أزرار الصفحة الرئيسية
    document.getElementById('addUserBtn')?.addEventListener('click', openAddUserModal);
    document.getElementById('refreshUsersBtn')?.addEventListener('click', loadUsers);
    document.getElementById('clearUsersFilters')?.addEventListener('click', clearUsersFilters);
    document.getElementById('prevUsersPage')?.addEventListener('click', prevUsersPage);
    document.getElementById('nextUsersPage')?.addEventListener('click', nextUsersPage);
    
    // الفلاتر
    document.getElementById('searchUsers')?.addEventListener('input', filterUsers);
    document.getElementById('filterUserRole')?.addEventListener('change', filterUsers);
    document.getElementById('filterUserStatus')?.addEventListener('change', filterUsers);
    
    // أزرار المودال
    document.getElementById('closeUserModal')?.addEventListener('click', closeAddUserModal);
    document.getElementById('cancelUserModal')?.addEventListener('click', closeAddUserModal);
    
    // إغلاق المودال عند الضغط خارجها
    const modal = document.getElementById('addUserModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) closeAddUserModal();
        });
    }
    
    // تحميل البيانات
    setTimeout(loadUsers, 200);
    
    console.log('✅ [Users] جاهز');
}

// ============================================================
// 🚀 START - بدء التشغيل
// ============================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUsersPage);
} else {
    initUsersPage();
}

// ============================================================
// 🌐 EXPOSE - تصدير الدوال للاستخدام العالمي
// ============================================================

window.loadUsers = loadUsers;
window.renderUsersTable = renderUsersTable;
window.filterUsers = filterUsers;
window.clearUsersFilters = clearUsersFilters;
window.openAddUserModal = openAddUserModal;
window.addUser = addUser;
window.editUser = editUser;
window.updateUser = updateUser;
window.deleteUser = deleteUser;
window.toggleUserStatus = toggleUserStatus;
window.closeAddUserModal = closeAddUserModal;
window.prevUsersPage = prevUsersPage;
window.nextUsersPage = nextUsersPage;
window.initUsersPage = initUsersPage;

console.log('✅ [Users] تم تحميل وحدة إدارة المستخدمين');
