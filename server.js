// ==================== دوال تغيير كلمة المرور ====================

// فتح نافذة تغيير كلمة المرور (للمستخدم نفسه)
function openPasswordModal() {
    document.getElementById('passwordModal').style.display = 'flex';
    document.getElementById('oldPassword').value = '';
    document.getElementById('newPassword1').value = '';
    document.getElementById('newPassword2').value = '';
}

// إغلاق نافذة تغيير كلمة المرور
function closePasswordModal() {
    document.getElementById('passwordModal').style.display = 'none';
}

// تغيير كلمة المرور (للمستخدم نفسه)
async function changeMyPassword() {
    const oldPassword = document.getElementById('oldPassword').value;
    const newPassword1 = document.getElementById('newPassword1').value;
    const newPassword2 = document.getElementById('newPassword2').value;
    
    if (!oldPassword || !newPassword1) {
        showToast('جميع الحقول مطلوبة', true);
        return;
    }
    
    if (newPassword1 !== newPassword2) {
        showToast('كلمة المرور الجديدة غير متطابقة', true);
        return;
    }
    
    if (newPassword1.length < 4) {
        showToast('كلمة المرور يجب أن تكون 4 أحرف على الأقل', true);
        return;
    }
    
    try {
        const response = await fetch('/api/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                oldPassword: oldPassword,
                newPassword: newPassword1
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ تم تغيير كلمة المرور بنجاح');
            closePasswordModal();
            // اختياري: تسجيل الخروج بعد 3 ثواني
            setTimeout(() => {
                if (confirm('تم تغيير كلمة المرور. هل تريد تسجيل الدخول مرة أخرى؟')) {
                    logout();
                }
            }, 2000);
        } else {
            showToast(data.error || 'خطأ في تغيير كلمة المرور', true);
        }
    } catch (err) {
        showToast('خطأ في الاتصال بالخادم', true);
    }
}

// ==================== دوال إدارة المستخدمين (للمسؤول) ====================

// تغيير كلمة مرور مستخدم آخر (للمسؤول فقط)
async function changeUserPassword(userId) {
    const newPassword = prompt('أدخل كلمة المرور الجديدة للمستخدم:');
    
    if (!newPassword) {
        showToast('لم يتم إدخال كلمة المرور', true);
        return;
    }
    
    if (newPassword.length < 4) {
        showToast('كلمة المرور يجب أن تكون 4 أحرف على الأقل', true);
        return;
    }
    
    try {
        const response = await fetch(`/api/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                password: newPassword, 
                adminId: currentUser.id 
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ تم تغيير كلمة المرور بنجاح');
            await loadUsers(); // تحديث قائمة المستخدمين
        } else {
            showToast(data.error || 'خطأ في تغيير كلمة المرور', true);
        }
    } catch (err) {
        showToast('خطأ في الاتصال بالخادم', true);
    }
}

// تفعيل/تعطيل مستخدم
async function toggleUser(userId, enabled) {
    try {
        const response = await fetch(`/api/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                enabled: enabled, 
                adminId: currentUser.id 
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(enabled ? '✅ تم تفعيل المستخدم' : '⚠️ تم تعطيل المستخدم');
            await loadUsers();
        } else {
            showToast(data.error || 'خطأ', true);
        }
    } catch (err) {
        showToast('خطأ في الاتصال', true);
    }
}

// حذف مستخدم
async function deleteUser(userId) {
    if (!confirm('⚠️ هل أنت متأكد من حذف هذا المستخدم؟')) return;
    
    try {
        const response = await fetch(`/api/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminId: currentUser.id })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ تم حذف المستخدم');
            await loadUsers();
        } else {
            showToast(data.error || 'خطأ في الحذف', true);
        }
    } catch (err) {
        showToast('خطأ في الاتصال', true);
    }
}

// إضافة مستخدم جديد
async function addUser() {
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newRole').value;
    
    if (!username || !password) {
        showToast('اسم المستخدم وكلمة المرور مطلوبة', true);
        return;
    }
    
    if (password.length < 4) {
        showToast('كلمة المرور يجب أن تكون 4 أحرف على الأقل', true);
        return;
    }
    
    try {
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username, 
                password, 
                role, 
                adminId: currentUser.id 
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('✅ تم إضافة المستخدم');
            document.getElementById('newUsername').value = '';
            document.getElementById('newPassword').value = '';
            await loadUsers();
        } else {
            showToast(data.error || 'خطأ في الإضافة', true);
        }
    } catch (err) {
        showToast('خطأ في الاتصال', true);
    }
}

// عرض قائمة المستخدمين
async function loadUsers() {
    if (currentUser?.role !== 'مسؤول') return;
    
    try {
        const response = await fetch('/api/users');
        const users = await response.json();
        
        let html = `<table>
            <thead>
                <tr><th>اسم المستخدم</th><th>الصلاحية</th><th>الحالة</th><th>الإجراءات</th></tr>
            </thead>
            <tbody>`;
        
        for (const u of users) {
            html += `<tr>
                <td><i class="fas fa-user"></i> ${u.username}</td>
                <td>${u.role === 'مسؤول' ? '👑 مسؤول' : (u.role === 'محرر' ? '✏️ محرر' : '👁️ مشاهد')}</td>
                <td class="${u.enabled ? 'status-صالح' : 'status-معطب'}">${u.enabled ? '✅ مفعل' : '❌ معطل'}</td>
                <td>
                    <button class="btn btn-warning" style="padding: 5px 10px; font-size: 12px; margin: 2px;" onclick="changeUserPassword(${u.id})">
                        🔑 تغيير كلمة المرور
                    </button>
                    ${u.enabled ? 
                        `<button class="btn btn-warning" style="padding: 5px 10px; font-size: 12px; margin: 2px;" onclick="toggleUser(${u.id}, false)">
                            🔒 تعطيل
                        </button>` : 
                        `<button class="btn btn-primary" style="padding: 5px 10px; font-size: 12px; margin: 2px;" onclick="toggleUser(${u.id}, true)">
                            🔓 تفعيل
                        </button>`
                    }
                    ${u.username !== 'admin' ? 
                        `<button class="btn btn-danger" style="padding: 5px 10px; font-size: 12px; margin: 2px;" onclick="deleteUser(${u.id})">
                            🗑️ حذف
                        </button>` : 
                        `<button class="btn btn-secondary" style="padding: 5px 10px; font-size: 12px; margin: 2px; background: #6c757d;" disabled>
                            🚫 لا يمكن الحذف
                        </button>`
                    }
                 </td>
            </table>`;
        }
        
        html += `</tbody></table>`;
        document.getElementById('usersTable').innerHTML = html;
    } catch (err) {
        console.error('خطأ في تحميل المستخدمين:', err);
        showToast('خطأ في تحميل المستخدمين', true);
    }
}

// إضافة زر تغيير كلمة المرور في لوحة التحكم
function addPasswordChangeButton() {
    const userInfo = document.getElementById('userInfo');
    if (userInfo && currentUser) {
        const changePassBtn = document.createElement('button');
        changePassBtn.innerHTML = '🔐 تغيير كلمة المرور';
        changePassBtn.className = 'btn btn-warning';
        changePassBtn.style.marginRight = '10px';
        changePassBtn.style.padding = '5px 10px';
        changePassBtn.style.fontSize = '12px';
        changePassBtn.onclick = openPasswordModal;
        
        const userInfoDiv = document.getElementById('userInfo');
        userInfoDiv.appendChild(changePassBtn);
    }
}

// تعديل دالة showPage لإضافة زر تغيير كلمة المرور عند عرض صفحة المستخدمين
const originalShowPage = window.showPage;
window.showPage = function(page) {
    if (originalShowPage) originalShowPage(page);
    if (page === 'users' && currentUser?.role === 'مسؤول') {
        loadUsers();
    }
};
