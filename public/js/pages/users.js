// ============================================================
// المستخدمين - users.js
// ============================================================

function loadUsers() {
    allUsers = [
        { id: '1', name: 'مدير النظام', email: 'admin@example.com', role: 'مسؤول', isActive: true, createdAt: new Date().toISOString() },
        { id: '2', name: 'مدير العمليات', email: 'manager@example.com', role: 'مشرف', isActive: true, createdAt: new Date().toISOString() },
        { id: '3', name: 'محرر', email: 'editor@example.com', role: 'محرر', isActive: true, createdAt: new Date().toISOString() },
        { id: '4', name: 'مشاهد', email: 'viewer@example.com', role: 'مشاهد', isActive: true, createdAt: new Date().toISOString() }
    ];
    renderUsersTable();
}

function renderUsersTable() {
    const tbody = document.getElementById('usersBody');
    if (!tbody) return;
    if (!allUsers || allUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:rgba(255,255,255,0.2);">🚫 لا توجد مستخدمين</td></tr>`;
        return;
    }
    tbody.innerHTML = allUsers.map(u => `
        <tr>
            <td><strong>${u.name || '-'}</strong></td>
            <td>${u.email || '-'}</td>
            <td><span style="color:${u.role === 'مسؤول' ? '#fbbf24' : u.role === 'مشرف' ? '#60a5fa' : '#4ade80'}">${u.role || 'مشاهد'}</span></td>
            <td>${u.isActive ? '✅ نشط' : '❌ معطل'}</td>
            <td style="font-size:12px; color:rgba(255,255,255,0.3);">${u.createdAt ? new Date(u.createdAt).toLocaleDateString('ar-TN') : '-'}</td>
            <td>
                <button class="btn-sm btn-warning" onclick="editUser('${u.id}')">✏️</button>
                <button class="btn-sm btn-danger" onclick="deleteUser('${u.id}')">🗑️</button>
            </td>
        </tr>
    `).join('');
}

function addUser() {
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    const name = document.getElementById('uName')?.value.trim();
    const email = document.getElementById('uEmail')?.value.trim();
    const password = document.getElementById('uPassword')?.value.trim();
    const role = document.getElementById('uRole')?.value;
    
    if (!name) {
        showAlert('⚠️ الرجاء إدخال اسم المستخدم', 'warning');
        document.getElementById('uName')?.focus();
        return;
    }
    if (!email) {
        showAlert('⚠️ الرجاء إدخال البريد الإلكتروني', 'warning');
        document.getElementById('uEmail')?.focus();
        return;
    }
    if (!password || password.length < 4) {
        showAlert('⚠️ كلمة المرور يجب أن تكون 4 أحرف على الأقل', 'warning');
        document.getElementById('uPassword')?.focus();
        return;
    }
    
    const addBtn = document.querySelector('[onclick="addUser()"]');
    if (addBtn) {
        addBtn.disabled = true;
        addBtn.textContent = '⏳ جاري الإضافة...';
    }
    
    if (token.startsWith('demo-token')) {
        const newUser = {
            id: 'user-' + Date.now(),
            name: name,
            email: email,
            role: role || 'مشاهد',
            isActive: true,
            createdAt: new Date().toISOString()
        };
        allUsers.push(newUser);
        renderUsersTable();
        clearUserInputs();
        showAlert('✅ تم إضافة المستخدم (وضع تجريبي)', 'success');
        
        if (addBtn) {
            addBtn.disabled = false;
            addBtn.textContent = '💾 إضافة مستخدم';
        }
        return;
    }
    
    fetch('/api/users', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ name, email, password, role: role || 'مشاهد' })
    })
    .then(async res => {
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'فشل إضافة المستخدم');
        }
        return data;
    })
    .then(data => {
        if (data.success) {
            showAlert('✅ تم إضافة المستخدم بنجاح', 'success');
            clearUserInputs();
            loadUsers();
            
            const modal = document.getElementById('addUserModal');
            if (modal) modal.style.display = 'none';
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في الإضافة'), 'danger');
        }
    })
    .catch(err => {
        console.error('Add user error:', err);
        showAlert('❌ ' + err.message, 'danger');
    })
    .finally(() => {
        if (addBtn) {
            addBtn.disabled = false;
            addBtn.textContent = '💾 إضافة مستخدم';
        }
    });
}

function editUser(id) {
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    if (token.startsWith('demo-token')) {
        const user = allUsers.find(u => u.id === id);
        if (!user) {
            showAlert('⚠️ المستخدم غير موجود', 'warning');
            return;
        }
        
        document.getElementById('uName').value = user.name || '';
        document.getElementById('uEmail').value = user.email || '';
        document.getElementById('uPassword').value = '';
        document.getElementById('uPassword').placeholder = 'اترك فارغاً للحفاظ على كلمة المرور';
        document.getElementById('uRole').value = user.role || 'مشاهد';
        
        const addBtn = document.querySelector('[onclick="addUser()"]');
        if (addBtn) {
            addBtn.textContent = '💾 تحديث المستخدم';
            addBtn.onclick = function() { updateUser(id); };
        }
        
        showAlert('✏️ جارٍ تعديل المستخدم: ' + user.name, 'info');
        return;
    }
    
    fetch('/api/users', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(users => {
        const user = users.find(u => u.id === id);
        if (!user) {
            showAlert('⚠️ المستخدم غير موجود', 'warning');
            return;
        }
        
        document.getElementById('uName').value = user.name || '';
        document.getElementById('uEmail').value = user.email || '';
        document.getElementById('uPassword').value = '';
        document.getElementById('uPassword').placeholder = 'اترك فارغاً للحفاظ على كلمة المرور';
        document.getElementById('uRole').value = user.role || 'مشاهد';
        
        const addBtn = document.querySelector('[onclick="addUser()"]');
        if (addBtn) {
            addBtn.textContent = '💾 تحديث المستخدم';
            addBtn.onclick = function() { updateUser(id); };
        }
        
        showAlert('✏️ جارٍ تعديل المستخدم: ' + user.name, 'info');
    })
    .catch(err => {
        console.error('Edit user error:', err);
        showAlert('❌ خطأ في تحميل بيانات المستخدم', 'danger');
    });
}

function updateUser(id) {
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    const name = document.getElementById('uName')?.value.trim();
    const email = document.getElementById('uEmail')?.value.trim();
    const password = document.getElementById('uPassword')?.value.trim();
    const role = document.getElementById('uRole')?.value;
    
    if (!name) {
        showAlert('⚠️ الرجاء إدخال اسم المستخدم', 'warning');
        return;
    }
    if (!email) {
        showAlert('⚠️ الرجاء إدخال البريد الإلكتروني', 'warning');
        return;
    }
    
    const updateBtn = document.querySelector('[onclick*="updateUser"]');
    if (updateBtn) {
        updateBtn.disabled = true;
        updateBtn.textContent = '⏳ جاري التحديث...';
    }
    
    if (token.startsWith('demo-token')) {
        const index = allUsers.findIndex(u => u.id === id);
        if (index === -1) {
            showAlert('⚠️ المستخدم غير موجود', 'warning');
            return;
        }
        
        allUsers[index].name = name;
        allUsers[index].email = email;
        allUsers[index].role = role || 'مشاهد';
        
        renderUsersTable();
        clearUserInputs();
        showAlert('✅ تم تحديث المستخدم (وضع تجريبي)', 'success');
        
        const addBtn = document.querySelector('[onclick*="updateUser"]');
        if (addBtn) {
            addBtn.textContent = '💾 إضافة مستخدم';
            addBtn.onclick = addUser;
            addBtn.disabled = false;
        }
        return;
    }
    
    const data = { name, email, role };
    if (password && password.length >= 4) {
        data.password = password;
    }
    
    fetch('/api/users/' + id, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(data)
    })
    .then(async res => {
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'فشل تحديث المستخدم');
        }
        return data;
    })
    .then(data => {
        if (data.success) {
            showAlert('✅ تم تحديث المستخدم بنجاح', 'success');
            clearUserInputs();
            
            const addBtn = document.querySelector('[onclick*="updateUser"]');
            if (addBtn) {
                addBtn.textContent = '💾 إضافة مستخدم';
                addBtn.onclick = addUser;
                addBtn.disabled = false;
            }
            loadUsers();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في التحديث'), 'danger');
        }
    })
    .catch(err => {
        console.error('Update user error:', err);
        showAlert('❌ ' + err.message, 'danger');
    })
    .finally(() => {
        if (updateBtn) {
            updateBtn.disabled = false;
        }
    });
}

function deleteUser(id) {
    if (!confirm('⚠️ هل أنت متأكد من حذف هذا المستخدم؟')) return;
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    if (token.startsWith('demo-token')) {
        allUsers = allUsers.filter(u => u.id !== id);
        renderUsersTable();
        showAlert('✅ تم حذف المستخدم (وضع تجريبي)', 'success');
        return;
    }
    
    fetch('/api/users/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert('✅ تم حذف المستخدم', 'success');
            loadUsers();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في الحذف'), 'danger');
        }
    })
    .catch(err => {
        console.error('Delete user error:', err);
        showAlert('❌ خطأ في حذف المستخدم', 'danger');
    });
}

function clearUserInputs() {
    document.getElementById('uName').value = '';
    document.getElementById('uEmail').value = '';
    document.getElementById('uPassword').value = '';
    document.getElementById('uPassword').placeholder = 'كلمة المرور';
    document.getElementById('uRole').value = 'مشاهد';
}

console.log('✅ users.js loaded');
