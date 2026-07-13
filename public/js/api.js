// ============================================================
// ===== التحكم الرئيسي =====
// ============================================================

function showPage(page) {
    document.querySelectorAll('.page-content').forEach(el => {
        el.classList.remove('active');
        el.classList.add('hidden');
    });
    
    const map = {
        'main': 'pageMain',
        'maint': 'pageMaint',
        'eff': 'pageEff',
        'support': 'pageSupport',
        'track': 'pageTrack',
        'map': 'pageMap',
        'users': 'pageUsers',
        'note': 'pageNote'
    };
    
    const target = document.getElementById(map[page]);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
    }
    
    document.querySelectorAll('.nav .btn').forEach(btn => {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
    });
    
    const navMap = {
        'main': 0,
        'maint': 1,
        'eff': 2,
        'support': 3,
        'track': 4,
        'map': 5,
        'users': 6,
        'note': 8
    };
    
    const index = navMap[page];
    const navBtns = document.querySelectorAll('.nav .btn');
    if (navBtns[index]) {
        navBtns[index].classList.remove('btn-secondary');
        navBtns[index].classList.add('btn-primary');
    }
    
    if (page === 'eff') renderEff();
    if (page === 'map') setTimeout(initGPSMap, 300);
    if (page === 'track') setTimeout(initTrackMap, 300);
    if (page === 'users') loadUsers();
    if (page === 'support') loadTickets();
    if (page === 'note') loadNotes();
}

async function renderAll() {
    try {
        await Promise.all([
            loadVessels(),
            loadUsers().catch(() => {}),
            loadTickets().catch(() => {}),
            loadNotes().catch(() => {})
        ]);
        renderEff();
        showToast('✅ تم تحميل البيانات بنجاح', 'success');
    } catch (error) {
        console.error('❌ خطأ في تحميل البيانات:', error);
    }
}

async function refreshAllPages() {
    try {
        await Promise.all([
            loadVessels(),
            loadUsers().catch(() => {}),
            loadTickets().catch(() => {}),
            loadNotes().catch(() => {})
        ]);
        renderEff();
        showToast('🔄 تم تحديث جميع الصفحات', 'info');
    } catch (error) {
        showToast('❌ خطأ في التحديث: ' + error.message, 'error');
    }
}

async function exportAllData() {
    try {
        const data = await exportAllData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `marine_data_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('✅ تم تصدير البيانات بنجاح', 'success');
    } catch (error) {
        showToast('❌ خطأ في التصدير: ' + error.message, 'error');
    }
}

async function importAllData(input) {
    const file = input.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            await importAllData(data);
            await renderAll();
            showToast('✅ تم استيراد البيانات بنجاح', 'success');
        } catch (error) {
            showToast('❌ خطأ في استيراد البيانات: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
    input.value = '';
}

// ===== المستخدمين =====
async function loadUsers() {
    try {
        const users = await getUsers();
        userData = users;
        renderUsers();
    } catch (error) {
        showToast('❌ خطأ في تحميل المستخدمين: ' + error.message, 'error');
    }
}

function renderUsers() {
    const tbody = document.getElementById('usersBody');
    
    if (!userData || userData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--gray-500);">لا يوجد مستخدمين</td></tr>`;
        return;
    }
    
    let html = '';
    userData.forEach(u => {
        const cls = u.enabled !== false ? 'status-صالح' : 'status-معطب';
        const statusText = u.enabled !== false ? 'نشط' : 'غير نشط';
        html += `
            <tr>
                <td><strong>${u.name}</strong></td>
                <td>${u.role}</td>
                <td><span class="${cls}">${statusText}</span></td>
                <td><button class="btn btn-sm btn-warning" onclick="openPasswordModal('${u.name}')"><i class="fas fa-key"></i></button></td>
                <td><button class="btn btn-sm ${u.enabled !== false ? 'btn-danger' : 'btn-success'}" onclick="toggleUser('${u.name}')">
                    <i class="fas ${u.enabled !== false ? 'fa-pause' : 'fa-play'}"></i>
                </button></td>
                <td><button class="btn btn-sm btn-danger" onclick="deleteUserHandler('${u.name}')"><i class="fas fa-trash"></i></button></td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

async function addUser() {
    const name = document.getElementById('un').value.trim();
    const password = document.getElementById('up').value.trim();
    const role = document.getElementById('ur').value;
    
    if (!name) { showToast('❌ الرجاء إدخال اسم المستخدم', 'warning'); return; }
    if (!password) { showToast('❌ الرجاء إدخال كلمة المرور', 'warning'); return; }
    if (password.length < 4) { showToast('❌ كلمة المرور يجب أن تكون 4 أحرف على الأقل', 'warning'); return; }
    
    try {
        await addUser(name, password, role);
        await loadUsers();
        document.getElementById('un').value = '';
        document.getElementById('up').value = '';
        document.getElementById('ur').value = 'مشاهد';
        showToast('✅ تم إضافة المستخدم "' + name + '" بنجاح', 'success');
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
    }
}

async function toggleUser(name) {
    const user = userData.find(u => u.name === name);
    if (!user) return;
    
    try {
        const newStatus = user.enabled === false ? true : false;
        await updateUser(user.id, { enabled: newStatus });
        await loadUsers();
        showToast(`✅ تم ${newStatus ? 'تفعيل' : 'تعطيل'} المستخدم ${name}`, 'success');
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
    }
}

async function deleteUserHandler(name) {
    if (name === 'admin') {
        showToast('❌ لا يمكن حذف المستخدم admin', 'warning');
        return;
    }
    
    const result = await Swal.fire({
        title: '⚠️ تأكيد الحذف',
        text: `هل أنت متأكد من حذف المستخدم "${name}"؟`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#ef4444'
    });
    
    if (result.isConfirmed) {
        try {
            const user = userData.find(u => u.name === name);
            if (user) {
                await deleteUser(user.id);
                await loadUsers();
                showToast(`🗑️ تم حذف المستخدم ${name}`, 'success');
            }
        } catch (error) {
            showToast('❌ ' + error.message, 'error');
        }
    }
}

function refreshUsers() {
    loadUsers();
    showToast('🔄 تم تحديث قائمة المستخدمين', 'info');
}

let currentPasswordUser = null;

function openPasswordModal(name) {
    currentPasswordUser = name;
    document.getElementById('modalUserName').textContent = `تغيير كلمة المرور للمستخدم: ${name}`;
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    document.getElementById('passwordModal').style.display = 'flex';
}

function closePasswordModal() {
    document.getElementById('passwordModal').style.display = 'none';
    currentPasswordUser = null;
}

async function saveNewPassword() {
    const newPass = document.getElementById('newPassword').value.trim();
    const confirmPass = document.getElementById('confirmPassword').value.trim();
    
    if (!newPass || !confirmPass) {
        showToast('❌ الرجاء إدخال كلمة المرور والتأكيد', 'warning');
        return;
    }
    
    if (newPass !== confirmPass) {
        showToast('❌ كلمة المرور غير متطابقة', 'warning');
        return;
    }
    
    if (newPass.length < 4) {
        showToast('❌ كلمة المرور يجب أن تكون 4 أحرف على الأقل', 'warning');
        return;
    }
    
    try {
        const user = userData.find(u => u.name === currentPasswordUser);
        if (user) {
            await updateUser(user.id, { pass: newPass });
            closePasswordModal();
            showToast('✅ تم تغيير كلمة المرور بنجاح', 'success');
        }
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
    }
}

// ===== Note Verbale =====
async function deleteNote(id) {
    try {
        await deleteNote(id);
        await loadNotes();
        showToast('🗑️ تم حذف المذكرة بنجاح', 'success');
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
    }
}

// ===== تشغيل عند التحميل =====
document.addEventListener('DOMContentLoaded', function() {
    renderAll();
});
