// ==================== دوال المصادقة ====================

async function doLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorDiv = document.getElementById('loginError');
    
    if(!username || !password) {
        errorDiv.innerHTML = "يرجى إدخال اسم المستخدم وكلمة المرور";
        errorDiv.style.display = "block";
        return;
    }
    
    try {
        const user = await loginAPI(username, password);
        if(user.error) {
            errorDiv.innerHTML = user.error;
            errorDiv.style.display = "block";
            return;
        }
        
        currentUser = user;
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        document.getElementById('userRoleDisplay').innerHTML = `👤 ${currentUser.name} | 🔑 ${currentUser.role}`;
        
        const isAdmin = currentUser.role === "مسؤول";
        const isViewer = currentUser.role === "مشاهد";
        
        document.getElementById('trackBtn').classList.toggle('hidden', !isAdmin);
        document.getElementById('admBtn').classList.toggle('hidden', !isAdmin);
        document.getElementById('mapNavBtn').style.display = isAdmin ? "inline-block" : "none";
        document.getElementById('printBtn').style.display = isAdmin ? "inline-block" : "none";
        document.getElementById('exportBtn').style.display = isAdmin ? "inline-flex" : "none";
        document.getElementById('importLabelBtn').style.display = isAdmin ? "inline-flex" : "none";
        document.getElementById('inputArea').classList.toggle('hidden', isViewer);
        
        const fill = (id, list) => {
            const sel = document.getElementById(id);
            if(sel) {
                sel.innerHTML = '<option value="الكل">الكل</option>';
                list.forEach(item => sel.innerHTML += `<option value="${item}">${item}</option>`);
            }
        };
        fill('fCatMain', CATS_LIST);
        fill('fRegMain', Object.keys(ZONES_DATA));
        fill('fRegMaint', Object.keys(ZONES_DATA));
        
        await initAppAfterLogin();
        
        // ✅ إضافة موقع المستخدم على الخريطة
        setTimeout(() => {
            if (typeof addUserLocation === 'function') {
                addUserLocation(currentUser.name);
            }
        }, 1000);
        
        if(isAdmin) {
            logUserLocation();
        }
        
    } catch(error) {
        errorDiv.innerHTML = "خطأ في الاتصال بالسيرفر!";
        errorDiv.style.display = "block";
    }
}

async function logout() {
    if (trackingInterval) stopTracking();
    if(currentUser) await logActivity("تسجيل خروج", `قام بتسجيل الخروج في ${getCurrentTime()}`);
    currentUser = null;
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('loginError').style.display = 'none';
}

// ==================== دوال المستخدمين ====================

async function renderUsers() {
    if(!canManageUsers()) return;
    try {
        let users = await loadUsers();
        document.getElementById('usersBody').innerHTML = users.map(u => `
            <tr>
                <td>${u.name}</td>
                <td>${u.role}</td>
                <td class="${u.enabled ? 'status-صالح' : 'status-معطب'}">${u.enabled ? 'مفعل' : 'معطل'}</td>
                <td><button class="btn-sm btn-warning" onclick="openPasswordModal('${u._id || u.id}', '${u.name}')">تغيير</button></td>
                <td>${u.enabled ? `<button class="btn-sm btn-orange" onclick="toggleUser('${u._id || u.id}', false)">تعطيل</button>` : `<button class="btn-sm btn-green" onclick="toggleUser('${u._id || u.id}', true)">تفعيل</button>`}</td>
                <td><button class="btn-sm btn-red" onclick="deleteUser('${u._id || u.id}')">حذف</button></td>
            </tr>
        `).join('');
    } catch(error) {
        console.error('خطأ:', error);
    }
}

async function addUser() {
    if(!canManageUsers()) { showToast("ليس لديك صلاحية!", true); return; }
    let u = document.getElementById('un').value.trim();
    let p = document.getElementById('up').value.trim();
    let r = document.getElementById('ur').value;
    if(!u || !p) return showToast("يرجى إدخال اسم المستخدم وكلمة المرور", true);
    
    try {
        let users = await loadUsers();
        if(users.find(x => x.name === u)) { showToast("اسم المستخدم موجود!", true); return; }
        await saveUser({ name: u, pass: p, role: r, enabled: true });
        document.getElementById('un').value = "";
        document.getElementById('up').value = "";
        await renderUsers();
        await logActivity("إضافة مستخدم", `قام بإضافة مستخدم جديد: ${u} (${r})`);
        showToast("✅ تم إضافة المستخدم");
    } catch(error) {
        showToast("خطأ في الإضافة: " + error.message, true);
    }
}

function openPasswordModal(userId, userName) {
    selectedUserId = userId;
    document.getElementById('modalUserName').innerHTML = `تغيير كلمة المرور للمستخدم: <strong>${userName}</strong>`;
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    document.getElementById('passwordModal').style.display = 'flex';
}

function closePasswordModal() {
    document.getElementById('passwordModal').style.display = 'none';
    selectedUserId = null;
}

async function saveNewPassword() {
    if(!canManageUsers()) return;
    const np = document.getElementById('newPassword').value.trim();
    const cp = document.getElementById('confirmPassword').value.trim();
    if(!np) { showToast("كلمة المرور الجديدة مطلوبة", true); return; }
    if(np !== cp) { showToast("كلمة المرور غير متطابقة", true); return; }
    
    try {
        let users = await loadUsers();
        let user = users.find(u => (u._id || u.id).toString() === selectedUserId.toString());
        if(user) {
            user.pass = np;
            await updateUser(selectedUserId, user);
            closePasswordModal();
            await renderUsers();
            await logActivity("تغيير كلمة مرور", `قام بتغيير كلمة مرور المستخدم: ${user.name}`);
            showToast("✅ تم تغيير كلمة المرور");
        }
    } catch(error) {
        showToast("خطأ في تغيير كلمة المرور: " + error.message, true);
    }
}

async function toggleUser(userId, enable) {
    try {
        let users = await loadUsers();
        let user = users.find(u => (u._id || u.id).toString() === userId.toString());
        if(user) {
            user.enabled = enable;
            await updateUser(userId, user);
            await renderUsers();
            await logActivity(enable ? "تفعيل مستخدم" : "تعطيل مستخدم", `قام ${enable ? 'بتفعيل' : 'بتعطيل'} المستخدم: ${user.name}`);
            showToast(enable ? "✅ تم تفعيل المستخدم" : "⚠️ تم تعطيل المستخدم");
        }
    } catch(error) {
        showToast("خطأ: " + error.message, true);
    }
}

async function deleteUser(userId) {
    if(confirm("هل أنت متأكد من حذف هذا المستخدم؟")) {
        try {
            let users = await loadUsers();
            let user = users.find(u => (u._id || u.id).toString() === userId.toString());
            await deleteUserAPI(userId);
            await renderUsers();
            await logActivity("حذف مستخدم", `قام بحذف المستخدم: ${user?.name}`);
            showToast("✅ تم حذف المستخدم");
        } catch(error) {
            showToast("خطأ في الحذف: " + error.message, true);
        }
    }
}
