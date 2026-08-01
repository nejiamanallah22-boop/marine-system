// public/js/app.js
console.log('✅ App loaded');

let allVessels = [];
let allUsers = [];
let allTickets = [];
let allNotes = [];
let allMaintenance = [];
let currentUser = null;
let editingVesselId = null;
let editingMaintenanceId = null;

// ============================================================
// منع الدخول التلقائي - تم التصحيح
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    // تأكد من وجود العناصر
    const loginOverlay = document.getElementById('loginOverlay');
    const mainApp = document.getElementById('mainApp');
    
    if (loginOverlay) loginOverlay.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';
    
    // تنظيف localStorage
    localStorage.clear();
    
    // تنظيف الحقول
    const username = document.getElementById('username');
    const password = document.getElementById('password');
    if (username) username.value = '';
    if (password) password.value = '';
    
    // إضافة حدث Enter
    if (password) {
        password.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                doLogin();
            }
        });
    }
    if (username) {
        username.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                password?.focus();
            }
        });
    }
});

// منع تكرار الحدث
window.addEventListener('load', function() {
    // لا تفعل شيء هنا لتجنب التعارض
});

// ============================================================
// دوال تحميل الصفحات
// ============================================================

function loadPage(pageName) {
    const container = document.getElementById('pageContainer');
    if (!container) return;
    document.querySelectorAll('.page-content').forEach(el => el.remove());
    
    fetch(`/pages/${pageName}.html`)
        .then(res => {
            if (!res.ok) throw new Error(`Page ${pageName} not found`);
            return res.text();
        })
        .then(html => {
            const div = document.createElement('div');
            div.className = 'page-content';
            div.id = 'page-' + pageName;
            div.innerHTML = html;
            container.appendChild(div);
            initPage(pageName);
        })
        .catch(err => {
            console.error('Error:', err);
            container.innerHTML = `
                <div style="text-align:center; padding:50px; color:#dc3545;">
                    ❌ خطأ في تحميل الصفحة: ${pageName}
                    <br><small>${err.message}</small>
                </div>
            `;
        });
}

function initPage(pageName) {
    switch(pageName) {
        case 'fleet': loadVessels(); break;
        case 'maintenance': loadMaintenance(); break;
        case 'efficiency': loadVessels(); break;
        case 'support': loadTickets(); break;
        case 'tracking': setTimeout(initMap, 100); break;
        case 'map': setTimeout(initMap, 100); break;
        case 'users': loadUsers(); break;
        case 'notes': loadNotes(); break;
    }
}

function showPage(pageName) {
    loadPage(pageName);
}

// ============================================================
// دوال مساعدة
// ============================================================

function showAlert(message, type = 'info') {
    const colors = {
        success: '#28a745',
        danger: '#dc3545',
        warning: '#ffc107',
        info: '#0d6efd'
    };
    const alertDiv = document.createElement('div');
    alertDiv.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 99999;
        padding: 15px 25px; border-radius: 8px; color: white;
        background: ${colors[type] || colors.info};
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        font-family: 'Cairo', sans-serif;
        max-width: 400px;
        animation: slideIn 0.3s ease;
        z-index: 999999;
    `;
    alertDiv.textContent = message;
    document.body.appendChild(alertDiv);
    setTimeout(() => {
        alertDiv.style.opacity = '0';
        alertDiv.style.transition = 'opacity 0.3s';
        setTimeout(() => alertDiv.remove(), 300);
    }, 4000);
}

function getToken() {
    return localStorage.getItem('token');
}

function getUser() {
    try {
        return JSON.parse(localStorage.getItem('user'));
    } catch {
        return null;
    }
}

// ============================================================
// المصادقة - تم التصحيح بالكامل
// ============================================================

function doLogin() {
    console.log('🔄 محاولة تسجيل الدخول...');
    
    const username = document.getElementById('username')?.value?.trim();
    const password = document.getElementById('password')?.value?.trim();
    
    if (!username || !password) {
        showAlert('⚠️ الرجاء إدخال اسم المستخدم وكلمة المرور', 'warning');
        return;
    }
    
    // تعطيل الزر
    const loginBtn = document.querySelector('#loginOverlay .login-btn, #loginOverlay button[onclick="doLogin()"]');
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.textContent = '⏳ جاري الدخول...';
    }
    
    // ===== حساب تجريبي للاختبار =====
    // استخدم admin / admin123 للدخول المباشر
    if (username === 'admin' && password === 'admin123') {
        console.log('✅ دخول تجريبي ناجح');
        const user = {
            id: 1,
            name: 'مدير النظام',
            role: 'مسؤول',
            email: 'admin@example.com'
        };
        localStorage.setItem('token', 'demo-token-12345');
        localStorage.setItem('user', JSON.stringify(user));
        currentUser = user;
        
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        
        updateUserDisplay();
        loadAllData();
        loadPage('fleet');
        showAlert('✅ تم تسجيل الدخول بنجاح', 'success');
        
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = '🚀 دخول';
        }
        return;
    }
    // ===== نهاية الحساب التجريبي =====
    
    // الاتصال بالخادم
    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ email: username, password })
    })
    .then(res => {
        if (!res.ok) throw new Error('فشل الاتصال بالخادم');
        return res.json();
    })
    .then(data => {
        if (data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            currentUser = data.user;
            
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            
            updateUserDisplay();
            loadAllData();
            loadPage('fleet');
            showAlert('✅ تم تسجيل الدخول بنجاح', 'success');
        } else {
            showAlert('❌ ' + (data.error || 'بيانات غير صحيحة'), 'danger');
        }
    })
    .catch(err => {
        console.error('Login error:', err);
        showAlert('❌ خطأ في الاتصال بالخادم: ' + err.message, 'danger');
    })
    .finally(() => {
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = '🚀 دخول';
        }
    });
}

function doLogout() {
    if (confirm('⚠️ هل أنت متأكد من تسجيل الخروج؟')) {
        localStorage.clear();
        location.reload();
    }
}

function updateUserDisplay() {
    const display = document.getElementById('userRoleDisplay');
    if (display && currentUser) {
        const roleEmojis = {
            'مسؤول': '👑',
            'مشرف': '⭐',
            'محرر': '✏️',
            'مشاهد': '👀'
        };
        display.innerHTML = `
            <i class="fas fa-user-circle"></i> 
            ${currentUser.name} 
            <span style="font-size:12px; background:#e9ecef; padding:2px 10px; border-radius:10px;">
                ${roleEmojis[currentUser.role] || '👤'} ${currentUser.role}
            </span>
            <button onclick="doLogout()" style="margin-left:10px; padding:2px 10px; border:none; border-radius:5px; background:#dc3545; color:white; cursor:pointer; font-size:12px;">
                🚪 خروج
            </button>
        `;
    }
}

// ============================================================
// تحميل البيانات
// ============================================================

function loadAllData() {
    loadVessels();
    loadMaintenance();
    loadTickets();
    loadNotes();
    loadUsers();
}

function loadVessels() {
    const token = getToken();
    if (!token) {
        // بيانات تجريبية
        allVessels = getDemoData();
        renderMainTable();
        renderGeneralMaintenance();
        renderHistoryMaintenance();
        updateMaintenanceVessels();
        renderEfficiency();
        return;
    }
    fetch('/api/vessels', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allVessels = data || [];
        console.log('✅ Vessels loaded:', allVessels.length);
        renderMainTable();
        renderGeneralMaintenance();
        renderHistoryMaintenance();
        updateMaintenanceVessels();
        renderEfficiency();
    })
    .catch(err => {
        console.error('Load vessels error:', err);
        allVessels = getDemoData();
        renderMainTable();
        renderGeneralMaintenance();
        renderHistoryMaintenance();
        updateMaintenanceVessels();
        renderEfficiency();
    });
}

function loadMaintenance() {
    const token = getToken();
    if (!token) return;
    fetch('/api/maintenance', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allMaintenance = data || [];
        renderGeneralMaintenance();
        renderHistoryMaintenance();
        updateMaintenanceStats();
        renderMaintenanceUnits();
    })
    .catch(err => console.error('Load maintenance error:', err));
}

function loadTickets() {
    const token = getToken();
    if (!token) return;
    fetch('/api/tickets', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allTickets = data || [];
        renderTickets();
    })
    .catch(err => console.error('Load tickets error:', err));
}

function loadUsers() {
    const token = getToken();
    if (!token) return;
    fetch('/api/users', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allUsers = data || [];
        renderUsersTable();
    })
    .catch(err => console.error('Load users error:', err));
}

function loadNotes() {
    const token = getToken();
    if (!token) return;
    fetch('/api/notes', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allNotes = data || [];
        renderNotes();
    })
    .catch(err => console.error('Load notes error:', err));
}

// ============================================================
// بيانات تجريبية
// ============================================================

function getDemoData() {
    return [
        { id: 1, name: 'المركب 1', num: '001', len: 25, cat: 'صيد', reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: 'الوحدة 1', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-001', repairer: 'فني 1' },
        { id: 2, name: 'المركب 2', num: '002', len: 30, cat: 'نقل', reg: 'الساحل', zone: 'سوسة', port: 'سوسة', supp: 'الوحدة 2', stat: 'معطب', break: 'عطل في المحرك', fDate: '2026-01-15', eDate: '2026-12-31', ref: 'REF-002', repairer: 'فني 2' },
        { id: 3, name: 'المركب 3', num: '003', len: 20, cat: 'صيد', reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: 'الوحدة 3', stat: 'صيانة', break: 'صيانة دورية', fDate: '2026-02-01', eDate: '2026-12-31', ref: 'REF-003', repairer: 'فني 3' }
    ];
}

// ============================================================
// عرض الجداول الأساسية
// ============================================================

function renderMainTable() {
    const tbody = document.getElementById('mainBody');
    if (!tbody) return;
    if (!allVessels || allVessels.length === 0) {
        tbody.innerHTML = `<tr><td colspan="15" style="text-align:center; padding:30px;">🚫 لا توجد بيانات</td></tr>`;
        return;
    }
    tbody.innerHTML = allVessels.map(v => `
        <tr>
            <td>${v.name || '-'}</td>
            <td>${v.num || '-'}</td>
            <td>${v.len || 0}</td>
            <td>${v.cat || '-'}</td>
            <td>${v.reg || '-'}</td>
            <td>${v.zone || '-'}</td>
            <td>${v.port || '-'}</td>
            <td>${v.supp || '-'}</td>
            <td style="color:${v.stat === 'صالح' ? '#28a745' : v.stat === 'معطب' ? '#dc3545' : '#ffc107'}">${v.stat || 'صالح'}</td>
            <td>${v.break || '-'}</td>
            <td>${v.fDate || '-'}</td>
            <td>${v.eDate || '-'}</td>
            <td>${v.ref || '-'}</td>
            <td>${v.repairer || '-'}</td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="editVessel(${v.id})">✏️</button>
                <button class="btn btn-sm btn-danger" onclick="deleteVessel(${v.id})">🗑️</button>
            </td>
        </tr>
    `).join('');
}

function renderTickets() {
    const container = document.getElementById('ticketsList');
    if (!container) return;
    if (!allTickets || allTickets.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#6c757d;">🚫 لا توجد تذاكر</p>';
        return;
    }
    container.innerHTML = allTickets.map(t => `
        <div style="background:#f8f9fa; padding:15px; margin:10px 0; border-radius:8px; border-right:4px solid ${t.status === 'مغلقة' ? '#28a745' : '#ffc107'}">
            <h4>${t.subject}</h4>
            <p>${t.message}</p>
            <small>${t.date || ''} ${t.time || ''} | ${t.userName || 'مجهول'}</small>
            <span style="background:#ffc107; padding:2px 10px; border-radius:10px; font-size:12px; margin-right:10px;">${t.status || 'قيد المعالجة'}</span>
        </div>
    `).join('');
}

function renderUsersTable() {
    const tbody = document.getElementById('usersBody');
    if (!tbody) return;
    if (!allUsers || allUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px;">🚫 لا توجد مستخدمين</td></tr>`;
        return;
    }
    tbody.innerHTML = allUsers.map(u => `
        <tr>
            <td>${u.name || '-'}</td>
            <td>${u.role || 'مشاهد'}</td>
            <td>${u.isActive ? '✅ نشط' : '❌ معطل'}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})">🗑️</button>
            </td>
        </tr>
    `).join('');
}

function renderNotes() {
    const container = document.getElementById('notesListContainer');
    if (!container) return;
    if (!allNotes || allNotes.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#6c757d;">🚫 لا توجد مذكرات</p>';
        return;
    }
    container.innerHTML = allNotes.map(n => `
        <div style="background:#f8f9fa; padding:15px; margin:10px 0; border-radius:8px; border-right:4px solid #0d6efd;">
            <h4>${n.title}</h4>
            <p>${n.content}</p>
            <small>${n.date || ''} | ${n.createdBy || 'مجهول'}</small>
        </div>
    `).join('');
}

// ============================================================
// دوال المراكب
// ============================================================

function addItem() {
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    const name = document.getElementById('iName')?.value;
    if (!name) {
        showAlert('⚠️ الرجاء إدخال اسم المركب', 'warning');
        return;
    }
    const data = {
        name: name,
        num: document.getElementById('iNum')?.value || '',
        len: parseFloat(document.getElementById('iLen')?.value) || 0,
        reg: document.getElementById('iReg')?.value || '',
        zone: document.getElementById('iZone')?.value || '',
        port: document.getElementById('iPort')?.value || '',
        supp: document.getElementById('iSupp')?.value || '',
        stat: document.getElementById('iStat')?.value || 'صالح',
        break: document.getElementById('iBreak')?.value || '',
        fDate: document.getElementById('iDate')?.value || '',
        eDate: document.getElementById('iEnd')?.value || '',
        ref: document.getElementById('iRef')?.value || '',
        repairer: document.getElementById('iRepairer')?.value || ''
    };
    const url = editingVesselId ? '/api/vessels/' + editingVesselId : '/api/vessels';
    const method = editingVesselId ? 'PUT' : 'POST';
    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert(editingVesselId ? '✅ تم تحديث المركب' : '✅ تم إضافة المركب', 'success');
            editingVesselId = null;
            clearVesselInputs();
            loadVessels();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في العملية'), 'danger');
        }
    })
    .catch(err => {
        console.error('Error:', err);
        showAlert('❌ خطأ في العملية', 'danger');
    });
}

function editVessel(id) {
    const vessel = allVessels.find(v => v.id === id);
    if (!vessel) {
        showAlert('⚠️ المركب غير موجود', 'warning');
        return;
    }
    editingVesselId = vessel.id;
    document.getElementById('iName').value = vessel.name || '';
    document.getElementById('iNum').value = vessel.num || '';
    document.getElementById('iLen').value = vessel.len || 0;
    document.getElementById('iReg').value = vessel.reg || '';
    document.getElementById('iZone').value = vessel.zone || '';
    document.getElementById('iPort').value = vessel.port || '';
    document.getElementById('iSupp').value = vessel.supp || '';
    document.getElementById('iStat').value = vessel.stat || 'صالح';
    document.getElementById('iBreak').value = vessel.break || '';
    document.getElementById('iDate').value = vessel.fDate || '';
    document.getElementById('iEnd').value = vessel.eDate || '';
    document.getElementById('iRef').value = vessel.ref || '';
    document.getElementById('iRepairer').value = vessel.repairer || '';
}

function deleteVessel(id) {
    if (!confirm('⚠️ هل أنت متأكد من الحذف؟')) return;
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    fetch('/api/vessels/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert('✅ تم الحذف', 'success');
            loadVessels();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في الحذف'), 'danger');
        }
    })
    .catch(err => {
        console.error('Delete error:', err);
        showAlert('❌ خطأ في الحذف', 'danger');
    });
}

function clearVesselInputs() {
    document.getElementById('iName').value = '';
    document.getElementById('iNum').value = '';
    document.getElementById('iLen').value = '';
    document.getElementById('iReg').value = '';
    document.getElementById('iZone').value = '';
    document.getElementById('iPort').value = '';
    document.getElementById('iSupp').value = '';
    document.getElementById('iStat').value = 'صالح';
    document.getElementById('iBreak').value = '';
    document.getElementById('iDate').value = '';
    document.getElementById('iEnd').value = '';
    document.getElementById('iRef').value = '';
    document.getElementById('iRepairer').value = '';
}

function updateZones() {
    const reg = document.getElementById('iReg')?.value;
    const zoneSelect = document.getElementById('iZone');
    if (!zoneSelect) return;
    const zones = {
        'الشمال': ['بنزرت', 'طبرقة', 'المرسى', 'غار الملح'],
        'الساحل': ['سوسة', 'المنستير', 'المهدية', 'حمام سوسة'],
        'الوسط': ['صفاقس', 'قابس', 'جربة', 'القطار'],
        'الجنوب': ['جرجيس', 'بن قردان', 'ذراع الساحل']
    };
    const options = zones[reg] || ['المنطقة غير محددة'];
    zoneSelect.innerHTML = '<option value="">📍 المنطقة</option>';
    options.forEach(z => {
        zoneSelect.innerHTML += `<option value="${z}">📍 ${z}</option>`;
    });
}

// ============================================================
// دوال الصيانة
// ============================================================

function updateMaintenanceVessels() {
    const select = document.getElementById('mVesselId');
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = '<option value="">اختر المركب</option>';
    allVessels.forEach(v => {
        const option = document.createElement('option');
        option.value = v.id;
        option.textContent = `${v.name} (${v.num || 'بدون رقم'})`;
        if (v.id == currentValue) option.selected = true;
        select.appendChild(option);
    });
}

function toggleMaintenanceForm() {
    const form = document.getElementById('maintenanceForm');
    if (!form) return;
    form.classList.toggle('active');
}

function addPart() {
    const container = document.getElementById('partsContainer');
    const div = document.createElement('div');
    div.className = 'part-item';
    div.innerHTML = `
        <input type="text" placeholder="اسم القطعة" class="part-name">
        <input type="number" placeholder="الكمية" class="part-qty" style="width:80px;">
        <input type="number" placeholder="السعر" class="part-price" style="width:80px;">
        <button class="remove-part" onclick="removePart(this)">✕</button>
    `;
    container.appendChild(div);
}

function removePart(btn) {
    const container = document.getElementById('partsContainer');
    if (container.children.length > 1) {
        btn.parentElement.remove();
    } else {
        showAlert('⚠️ يجب أن يكون هناك قطعة واحدة على الأقل', 'warning');
    }
}

function getPartsData() {
    const parts = [];
    document.querySelectorAll('.part-item').forEach(item => {
        const name = item.querySelector('.part-name')?.value;
        const qty = parseFloat(item.querySelector('.part-qty')?.value) || 0;
        const price = parseFloat(item.querySelector('.part-price')?.value) || 0;
        if (name) {
            parts.push({ name, quantity: qty, price });
        }
    });
    return parts;
}

function saveMaintenance() {
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    const vesselId = document.getElementById('mVesselId')?.value;
    const type = document.getElementById('mType')?.value;
    const unit = document.getElementById('mUnit')?.value;
    const technician = document.getElementById('mTechnician')?.value.trim();
    const description = document.getElementById('mDescription')?.value.trim();
    const cost = parseFloat(document.getElementById('mCost')?.value) || 0;
    const notes = document.getElementById('mNotes')?.value.trim();
    const parts = getPartsData();
    
    if (!vesselId) {
        showAlert('⚠️ الرجاء اختيار المركب', 'warning');
        return;
    }
    if (!description) {
        showAlert('⚠️ الرجاء إدخال وصف العطل', 'warning');
        return;
    }
    if (!technician) {
        showAlert('⚠️ الرجاء إدخال اسم الفني المسؤول', 'warning');
        return;
    }
    
    const data = {
        vesselId: parseFloat(vesselId),
        type: type || 'عادية',
        unit: unit || 'غير محدد',
        technician: technician,
        description: description,
        cost: cost,
        notes: notes || '',
        parts: parts,
        createdBy: currentUser?.name || 'Admin'
    };
    
    const url = editingMaintenanceId ? '/api/maintenance/' + editingMaintenanceId : '/api/maintenance';
    const method = editingMaintenanceId ? 'PUT' : 'POST';
    
    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert(editingMaintenanceId ? '✅ تم تحديث سجل الصيانة' : '✅ تم إضافة سجل الصيانة', 'success');
            editingMaintenanceId = null;
            toggleMaintenanceForm();
            loadAllData();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في العملية'), 'danger');
        }
    })
    .catch(err => {
        console.error('Save maintenance error:', err);
        showAlert('❌ خطأ في حفظ سجل الصيانة', 'danger');
    });
}

function renderGeneralMaintenance() {
    const container = document.getElementById('generalMaintenanceContainer');
    if (!container) return;
    const vessels = allVessels.filter(v => v.stat === 'معطب' || v.stat === 'صيانة');
    if (vessels.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:20px; background:#f8f9fa; border-radius:8px; color:#28a745;">
                ✅ لا توجد مراكب معطبة حالياً
            </div>
        `;
        return;
    }
    let html = `
        <div class="scrollable-table">
            <table>
                <thead>
                    <tr>
                        <th>#</th><th>المركب</th><th>الرقم</th>
                        <th>الفئة</th><th>الوحدة</th><th>العطل</th>
                        <th>📅 تاريخ العطب</th><th>الحالة</th><th>إجراءات</th>
                    </tr>
                </thead>
                <tbody>
    `;
    vessels.forEach((v, index) => {
        const maintenanceRecord = allMaintenance.find(r => r.vesselId === v.id && r.status === 'قيد الإنجاز');
        html += `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${v.name || '-'}</strong></td>
                <td>${v.num || '-'}</td>
                <td>${v.cat || '-'}</td>
                <td>${v.repairer || v.supp || '-'}</td>
                <td>${v.break || maintenanceRecord?.description || '-'}</td>
                <td>${v.fDate || '-'}</td>
                <td style="color:${v.stat === 'معطب' ? '#dc3545' : '#ffc107'}; font-weight:600;">
                    ${v.stat === 'معطب' ? '❌ معطب' : '🔧 صيانة'}
                </td>
                <td>
                    <button class="btn btn-sm btn-success" onclick="fixVessel(${v.id})" title="إصلاح المركب">
                        <i class="fas fa-check"></i> إصلاح
                    </button>
                </td>
            </tr>
        `;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function fixVessel(vesselId) {
    if (!confirm('⚠️ هل أنت متأكد من إصلاح هذا المركب؟')) return;
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
        return;
    }
    fetch('/api/vessels/' + vesselId, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ stat: 'صالح' })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showAlert('✅ تم إصلاح المركب', 'success');
            loadAllData();
        } else {
            showAlert('❌ ' + (data.error || 'خطأ في الإصلاح'), 'danger');
        }
    })
    .catch(err => {
        console.error('Fix vessel error:', err);
        showAlert('❌ خطأ في إصلاح المركب', 'danger');
    });
}

function renderHistoryMaintenance() {
    const container = document.getElementById('historyMaintenanceContainer');
    if (!container) return;
    let records = allMaintenance.filter(r => r.status === 'مكتملة' || r.status === 'ملغية');
    const vesselFilter = document.getElementById('filterVessel')?.value?.toLowerCase() || '';
    const dateFrom = document.getElementById('filterDateFrom')?.value || '';
    const dateTo = document.getElementById('filterDateTo')?.value || '';
    const statusFilter = document.getElementById('filterStatus')?.value || '';
    
    if (vesselFilter) {
        records = records.filter(r => {
            const name = r.vesselName || allVessels.find(v => v.id === r.vesselId)?.name || '';
            const num = r.vesselNum || allVessels.find(v => v.id === r.vesselId)?.num || '';
            return name.toLowerCase().includes(vesselFilter) || num.toString().includes(vesselFilter);
        });
    }
    if (dateFrom) records = records.filter(r => r.date >= dateFrom);
    if (dateTo) records = records.filter(r => r.date <= dateTo + 'T23:59:59');
    if (statusFilter) records = records.filter(r => r.status === statusFilter);
    
    document.getElementById('historyCount').textContent = `📊 ${records.length} سجل`;
    if (records.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px; color:#6c757d; background:#f8f9fa; border-radius:8px;">
                🚫 لا توجد سجلات صيانة مكتملة
            </div>
        `;
        return;
    }
    let html = `
        <div class="scrollable-table">
            <table>
                <thead>
                    <tr>
                        <th>#</th><th>المركب</th><th>الرقم</th>
                        <th>👨‍🔧 الفني</th>
                        <th>🔩 القطع</th>
                        <th>💰 التكلفة</th>
                        <th>📊 الحالة</th>
                        <th>📅 التاريخ</th>
                    </tr>
                </thead>
                <tbody>
    `;
    records.slice().reverse().forEach((r, index) => {
        const vesselName = r.vesselName || allVessels.find(v => v.id === r.vesselId)?.name || '-';
        const vesselNum = r.vesselNum || allVessels.find(v => v.id === r.vesselId)?.num || '-';
        const partsText = r.parts?.length ? r.parts.map(p => `${p.name}(${p.quantity})`).join(', ') : '-';
        html += `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${vesselName}</strong></td>
                <td>${vesselNum}</td>
                <td>${r.technician || '-'}</td>
                <td style="font-size:11px;">${partsText}</td>
                <td>${r.cost ? r.cost + ' د.ت' : '-'}</td>
                <td style="color:${r.status === 'مكتملة' ? '#28a745' : '#dc3545'}; font-weight:600;">${r.status || '-'}</td>
                <td>${new Date(r.date).toLocaleDateString()}</td>
            </tr>
        `;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function applyHistoryFilters() {
    renderHistoryMaintenance();
}

function resetHistoryFilters() {
    document.getElementById('filterVessel').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    document.getElementById('filterStatus').value = '';
    renderHistoryMaintenance();
    showAlert('✅ تم إلغاء الفلترة', 'success');
}

function updateMaintenanceStats() {
    const container = document.getElementById('maintenanceStats');
    if (!container) return;
    const total = allMaintenance.length;
    const inProgress = allMaintenance.filter(r => r.status === 'قيد الإنجاز').length;
    const completed = allMaintenance.filter(r => r.status === 'مكتملة').length;
    const cancelled = allMaintenance.filter(r => r.status === 'ملغية').length;
    container.innerHTML = `
        <div class="maintenance-stats">
            <div class="stat-box stat-total"><h4>${total}</h4><p>📊 المجموع</p></div>
            <div class="stat-box stat-progress"><h4>${inProgress}</h4><p>🔄 قيد الإنجاز</p></div>
            <div class="stat-box stat-completed"><h4>${completed}</h4><p>✅ مكتملة</p></div>
            <div class="stat-box stat-cancelled"><h4>${cancelled}</h4><p>❌ ملغية</p></div>
        </div>
    `;
}

function renderMaintenanceUnits() {
    const container = document.getElementById('maintenanceUnitsContainer');
    if (!container) return;
    const units = [
        'وحدة الصيانة والإسناد البحري تونس',
        'وحدة الصيانة والإسناد البحري صفاقس',
        'وحدة الصيانة والإسناد البحري المنستير',
        'وحدة الصيانة والإسناد البحري جرجيس',
        'شركة خاصة'
    ];
    let html = '';
    units.forEach(unit => {
        const records = allMaintenance.filter(r => r.unit === unit);
        const total = records.length;
        const completed = records.filter(r => r.status === 'مكتملة').length;
        const inProgress = records.filter(r => r.status === 'قيد الإنجاز').length;
        const cancelled = records.filter(r => r.status === 'ملغية').length;
        html += `
            <div class="region-table-card">
                <div class="region-table-header">
                    🏭 ${unit}
                    <span style="font-size:12px; font-weight:400; color:#6c757d; margin-right:10px;">
                        📊 ${total} سجل
                    </span>
                    <span style="font-size:11px; font-weight:400; margin-right:5px;">
                        ✅ ${completed} | 🔄 ${inProgress} | ❌ ${cancelled}
                    </span>
                </div>
                <div class="scrollable-table">
                    <table>
                        <thead>
                            <tr>
                                <th>المركب</th><th>👨‍🔧 الفني</th>
                                <th>🔩 القطع</th>
                                <th>💰 التكلفة</th>
                                <th>📊 الحالة</th>
                                <th>📅 التاريخ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${records.length === 0 ? `
                                <tr><td colspan="6" style="text-align:center; padding:15px; color:#6c757d;">🚫 لا توجد سجلات</td></tr>
                            ` : records.slice().reverse().map(r => {
                                const statusColors = {
                                    'قيد الإنجاز': '#ffc107',
                                    'مكتملة': '#28a745',
                                    'ملغية': '#dc3545'
                                };
                                const partsText = r.parts && r.parts.length ? 
                                    r.parts.map(p => `${p.name}(${p.quantity})`).join(', ') : '-';
                                return `
                                    <tr>
                                        <td>${r.vesselName || '-'}</td>
                                        <td>${r.technician || '-'}</td>
                                        <td style="font-size:11px;">${partsText}</td>
                                        <td>${r.cost ? r.cost + ' د.ت' : '-'}</td>
                                        <td><span style="color:${statusColors[r.status] || '#6c757d'}; font-weight:600;">${r.status || '-'}</span></td>
                                        <td>${new Date(r.date).toLocaleDateString()}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// ============================================================
// 📊 صفحة الجاهزية
// ============================================================

function renderEfficiency() {
    console.log('📊 Rendering efficiency, vessels:', allVessels.length);
    const vessels = allVessels || [];
    
    const countEl = document.getElementById('effCount');
    if (countEl) countEl.textContent = `📊 ${vessels.length} مركب`;
    
    updateEfficiencyStats(vessels);
    renderCategoryEfficiencyTable(vessels);
}

function updateEfficiencyStats(vessels) {
    const container = document.getElementById('efficiencyStats');
    if (!container) return;
    
    const total = vessels.length;
    const ready = vessels.filter(v => v.stat === 'صالح').length;
    const broken = vessels.filter(v => v.stat === 'معطب').length;
    const maintenance = vessels.filter(v => v.stat === 'صيانة').length;
    const readyPercent = total > 0 ? Math.round((ready / total) * 100) : 0;
    
    container.innerHTML = `
        <div class="efficiency-stats">
            <div class="stat-box stat-total"><h4>${total}</h4><p>🚢 المجموع</p></div>
            <div class="stat-box stat-ready"><h4>${ready}</h4><p>✅ صالح (${readyPercent}%)</p></div>
            <div class="stat-box stat-maintenance"><h4>${maintenance}</h4><p>🔧 صيانة</p></div>
            <div class="stat-box stat-broken"><h4>${broken}</h4><p>❌ معطب</p></div>
        </div>
    `;
}

function renderCategoryEfficiencyTable(vessels) {
    const container = document.getElementById('categoryEfficiencyTable');
    if (!container) return;
    
    const categories = {};
    vessels.forEach(v => {
        const cat = v.cat || 'غير مصنف';
        if (!categories[cat]) {
            categories[cat] = { total: 0, ready: 0, broken: 0, maintenance: 0 };
        }
        categories[cat].total++;
        if (v.stat === 'صالح') categories[cat].ready++;
        else if (v.stat === 'معطب') categories[cat].broken++;
        else if (v.stat === 'صيانة') categories[cat].maintenance++;
    });
    
    if (Object.keys(categories).length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:20px; color:#6c757d;">
                🚫 لا توجد مراكب لعرض الجاهزية
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="scrollable-table">
            <table>
                <thead>
                    <tr>
                        <th>الفئة</th>
                        <th>المجموع</th>
                        <th>✅ صالح</th>
                        <th>🔧 صيانة</th>
                        <th>❌ معطب</th>
                        <th>نسبة الجاهزية</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    Object.keys(categories).sort().forEach(cat => {
        const data = categories[cat];
        const readyPercent = data.total > 0 ? Math.round((data.ready / data.total) * 100) : 0;
        const barColor = readyPercent >= 70 ? '#28a745' : readyPercent >= 40 ? '#ffc107' : '#dc3545';
        html += `
            <tr>
                <td><strong>${cat}</strong></td>
                <td>${data.total}</td>
                <td style="color:#28a745;">${data.ready}</td>
                <td style="color:#ffc107;">${data.maintenance}</td>
                <td style="color:#dc3545;">${data.broken}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="flex:1; height:8px; background:#e9ecef; border-radius:4px; overflow:hidden;">
                            <div style="width:${readyPercent}%; height:100%; background:${barColor}; border-radius:4px;"></div>
                        </div>
                        <span style="font-weight:600; min-width:40px;">${readyPercent}%</span>
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

// ============================================================
// دوال الخريطة
// ============================================================

function initMap() {
    console.log('🗺️ Initializing map...');
    // يمكن إضافة كود الخريطة هنا
}

// ============================================================
// دوال إضافية
// ============================================================

function deleteUser(id) {
    if (!confirm('⚠️ هل أنت متأكد من حذف هذا المستخدم؟')) return;
    const token = getToken();
    if (!token) {
        showAlert('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
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

console.log('✅ تم تحميل التطبيق بالكامل');
console.log('📝 استخدم admin / admin123 للدخول التجريبي');
