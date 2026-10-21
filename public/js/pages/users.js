/**
 * 👥 إدارة المستخدمين - الواجهة الأمامية
 * @module public/user.js
 * 
 * ✨ متوافق مع models/User.js v2.1
 * ✨ تحقق فوري أثناء الكتابة + إرسال احترافي
 */

(function () {
    'use strict';

    // ============================================
    // 🔧 الإعدادات والثوابت
    // ============================================

    const API_BASE = '/api/users';
    const USERNAME_PATTERN = /^[a-zA-Z0-9_.\-\u0600-\u06FF ]+$/;
    const USERNAME_MIN = 3;
    const USERNAME_MAX = 50;
    const PASSWORD_MIN = 12;

    // ============================================
    // 🛠️ أدوات مساعدة
    // ============================================

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    function showError(el, msg) {
        if (!el) return;
        el.textContent = msg;
        el.style.display = msg ? 'block' : 'none';
    }

    function clearFormErrors(form) {
        form.querySelectorAll('.error').forEach((e) => {
            e.textContent = '';
            e.style.display = 'none';
        });
    }

    async function apiRequest(url, options = {}) {
        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            ...options
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
    }

    // ============================================
    // 🔍 التحقق من اسم المستخدم (متوافق مع Mongoose)
    // ============================================

    function validateUsername(value) {
        const v = (value || '').trim();

        if (!v) return 'اسم المستخدم مطلوب';
        if (v.length < USERNAME_MIN) return `اسم المستخدم يجب أن يكون ${USERNAME_MIN} أحرف على الأقل`;
        if (v.length > USERNAME_MAX) return `اسم المستخدم يجب أن يكون ${USERNAME_MAX} حرفاً كحد أقصى`;
        if (!USERNAME_PATTERN.test(v)) {
            return 'يُسمح فقط بالأحرف العربية/الإنجليزية، الأرقام، والرموز . _ - والمسافة';
        }
        if (/[_.\- ]{2}/.test(v)) return 'لا يمكن تكرار الرموز أو المسافات (.. __ -- أو مسافتين)';
        if (/^[_.\- ]|[_.\- ]$/.test(v)) return 'لا يبدأ أو ينتهي برمز أو مسافة';

        return ''; // صالح
    }

    function validatePassword(value) {
        const v = value || '';
        if (!v) return 'كلمة المرور مطلوبة';
        if (v.length < PASSWORD_MIN) return `كلمة المرور يجب أن تكون ${PASSWORD_MIN} حرفاً على الأقل`;
        return '';
    }

    function validateEmail(value) {
        const v = (value || '').trim();
        if (!v) return 'البريد الإلكتروني مطلوب';
        if (!/^\S+@\S+\.\S+$/.test(v)) return 'البريد الإلكتروني غير صالح';
        return '';
    }

    function validateName(value) {
        const v = (value || '').trim();
        if (!v) return 'الاسم مطلوب';
        if (v.length < 2) return 'الاسم يجب أن يكون حرفين على الأقل';
        return '';
    }

    // ============================================
    // 🎯 ربط التحقق الفوري بالحقول
    // ============================================

    function bindLiveValidation(form) {
        const map = {
            username: validateUsername,
            password: validatePassword,
            email: validateEmail,
            name: validateName
        };

        Object.entries(map).forEach(([field, validator]) => {
            const input = form.querySelector(`[name="${field}"]`);
            const errorEl = form.querySelector(`[data-error="${field}"]`);
            if (!input) return;

            input.addEventListener('input', () => {
                const msg = validator(input.value);
                showError(errorEl, msg);
                input.classList.toggle('invalid', Boolean(msg));
            });

            input.addEventListener('blur', () => {
                const msg = validator(input.value);
                showError(errorEl, msg);
                input.classList.toggle('invalid', Boolean(msg));
            });
        });
    }

    // ============================================
    // 📝 إنشاء مستخدم
    // ============================================

    async function createUser(form) {
        clearFormErrors(form);

        const fd = new FormData(form);
        const payload = {
            username: (fd.get('username') || '').trim(),
            password: fd.get('password') || '',
            name: (fd.get('name') || '').trim(),
            email: (fd.get('email') || '').trim(),
            role: fd.get('role') || 'viewer'
        };

        // تحقق نهائي قبل الإرسال
        const validators = {
            username: validateUsername(payload.username),
            password: validatePassword(payload.password),
            name: validateName(payload.name),
            email: validateEmail(payload.email)
        };

        const firstError = Object.entries(validators).find(([, msg]) => msg);
        if (firstError) {
            const [field, msg] = firstError;
            showError(form.querySelector(`[data-error="${field}"]`), msg);
            form.querySelector(`[name="${field}"]`)?.focus();
            return;
        }

        const submitBtn = form.querySelector('[type="submit"]');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'جارٍ الحفظ...'; }

        try {
            const { ok, status, data } = await apiRequest(API_BASE, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (!ok) {
                // رسالة من الخادم
                const msg = data.error || 'فشل إنشاء المستخدم';
                if (data.field) {
                    showError(form.querySelector(`[data-error="${data.field}"]`), msg);
                } else {
                    alert(msg);
                }
                return;
            }

            alert('✅ تم إنشاء المستخدم بنجاح');
            form.reset();
            form.querySelectorAll('.invalid').forEach((e) => e.classList.remove('invalid'));
            await loadUsers();

        } catch (e) {
            console.error('Create user error:', e);
            alert('❌ خطأ في الاتصال بالخادم');
        } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'حفظ'; }
        }
    }

    // ============================================
    // 📋 تحميل وعرض المستخدمين
    // ============================================

    async function loadUsers() {
        const container = $('#usersList');
        if (!container) return;

        container.innerHTML = '<p>جارٍ التحميل...</p>';

        try {
            const { ok, data } = await apiRequest(API_BASE, { method: 'GET' });
            if (!ok || !Array.isArray(data.users)) {
                container.innerHTML = '<p class="error">تعذّر تحميل المستخدمين</p>';
                return;
            }

            if (data.users.length === 0) {
                container.innerHTML = '<p>لا يوجد مستخدمون بعد</p>';
                return;
            }

            container.innerHTML = data.users.map((u) => `
                <div class="user-card" data-id="${u.id}">
                    <strong>${escapeHtml(u.username)}</strong>
                    <span>${escapeHtml(u.name || '')}</span>
                    <small>${escapeHtml(u.email || '')}</small>
                    <span class="role">${escapeHtml(u.role || 'viewer')}</span>
                    <button class="btn-delete" data-id="${u.id}">حذف</button>
                </div>
            `).join('');

            container.querySelectorAll('.btn-delete').forEach((btn) => {
                btn.addEventListener('click', () => deleteUser(btn.dataset.id));
            });
        } catch (e) {
            console.error('Load users error:', e);
            container.innerHTML = '<p class="error">خطأ في الاتصال</p>';
        }
    }

    // ============================================
    // 🗑️ حذف مستخدم
    // ============================================

    async function deleteUser(id) {
        if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;
        try {
            const { ok, data } = await apiRequest(`${API_BASE}/${id}`, { method: 'DELETE' });
            if (!ok) {
                alert(data.error || 'فشل الحذف');
                return;
            }
            await loadUsers();
        } catch (e) {
            console.error('Delete user error:', e);
            alert('خطأ في الاتصال');
        }
    }

    // ============================================
    // 🛡️ حماية من XSS عند العرض
    // ============================================

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ============================================
    // 🚀 التهيئة
    // ============================================

    document.addEventListener('DOMContentLoaded', () => {
        const form = $('#userForm');
        if (form) {
            bindLiveValidation(form);
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                createUser(form);
            });
        }
        loadUsers();
    });

})();
