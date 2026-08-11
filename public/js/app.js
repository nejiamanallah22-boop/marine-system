// ============================================================
// ===== تطبيق منظومة الوسائل البحرية - النسخة المبسطة =====
// ============================================================

console.log('🚀 Marine System v1.0 - Running');

// ============================================================
// ===== البيانات =====
// ============================================================

let fleetData = [];
let maintData = [];
let userData = [];
let ticketData = [];
let noteData = [];

// ============================================================
// ===== تحميل البيانات من localStorage =====
// ============================================================

function loadAllData() {
    fleetData = JSON.parse(localStorage.getItem('marine_fleet') || '[]');
    maintData = JSON.parse(localStorage.getItem('marine_maint') || '[]');
    userData = JSON.parse(localStorage.getItem('marine_users') || '[]');
    ticketData = JSON.parse(localStorage.getItem('marine_tickets') || '[]');
    noteData = JSON.parse(localStorage.getItem('marine_notes') || '[]');

    // بيانات افتراضية
    if (fleetData.length === 0) {
        fleetData = [
            { id: 1, name: 'المركب 1', num: 'M-001', len: 11, cat: 'البروق', reg: 'تونس', zone: 'تونس', port: 'حلق الوادي',
                supp: 'تعزيز 1', stat: 'صالح', break: '-', fDate: '2024-01-15', eDate: '2025-01-15', ref: 'REF-001' },
            { id: 2, name: 'المركب 2', num: 'M-002', len: 15, cat: 'خوافر', reg: 'تونس', zone: 'تونس', port: 'حلق الوادي',
                supp: 'تعزيز 2', stat: 'صيانة', break: 'محرك', fDate: '2024-02-01', eDate: '2024-03-01', ref: 'REF-002' }
        ];
        localStorage.setItem('marine_fleet', JSON.stringify(fleetData));
    }

    if (userData.length === 0) {
        userData = [
            { id: 1, name: 'admin', role: 'مسؤول', status: 'نشط', password: '123456' }
        ];
        localStorage.setItem('marine_users', JSON.stringify(userData));
    }

    if (noteData.length === 0) {
        noteData = [
            { id: 1, title: 'مذكرة اجتماع مجلس الإدارة', content: 'دعوة لحضور اجتماع مجلس الإدارة',
                date: '2026-01-15' },
            { id: 2, title: 'تقرير الأداء السنوي', content: 'تقرير الأداء السنوي للأسطول البحري للعام 2026',
                date: '2026-01-14' }
        ];
        localStorage.setItem('marine_notes', JSON.stringify(noteData));
    }

    if (ticketData.length === 0) {
        ticketData = [
            { id: 1, subject: 'عطل في نظام الملاحة', message: 'تعطل نظام GPS في المركب 2', status: 'مفتوحة',
                date: '2026-01-10' }
        ];
        localStorage.setItem('marine_tickets', JSON.stringify(ticketData));
    }

    maintData = fleetData.filter(f => f.stat === 'صيانة' || f.stat === 'معطب');
}

// ============================================================
// ===== دوال عامة =====
// ============================================================

function showToast(message, type = 'info') {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const toast = document.createElement('div');
    toast.className = 'toast';
    const colors = {
        success: '#22c55e',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#2563eb'
    };
    toast.style.borderRight = `4px solid ${colors[type] || colors.info}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function saveAll() {
    localStorage.setItem('marine_fleet', JSON.stringify(fleetData));
    localStorage.setItem('marine_maint', JSON.stringify(maintData));
    localStorage.setItem('marine_users', JSON.stringify(userData));
    localStorage.setItem('marine_tickets', JSON.stringify(ticketData));
    localStorage.setItem('marine_notes', JSON.stringify(noteData));
}

function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }
function scrollToBottom() { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }

// ============================================================
// ===== شاشة الدخول =====
// ============================================================

function doLogin() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const user = userData.find(u => u.name === username && u.password === password);
    
    if (user) {
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        document.getElementById('userRoleDisplay').innerHTML = '<i class="fas fa-user"></i> 👤 ' + username;
        renderAll();
        showToast('✅ مرحباً بك في النظام', 'success');
    } else {
        const error = document.getElementById('loginError');
        error.textContent = '❌ اسم المستخدم أو كلمة المرور غير صحيحة';
        error.style.display = 'block';
        setTimeout(() => error.style.display = 'none', 3000);
    }
}

function logout() {
    if (confirm('هل أنت متأكد من الخروج؟')) {
        document.getElementById('loginOverlay').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
        showToast('👋 تم تسجيل الخروج', 'info');
    }
}

// ============================================================
// ===== التنقل بين الصفحات =====
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

    const navMap = { 'main': 0, 'maint': 1, 'eff': 2, 'support': 3, 'track': 4, 'map': 5, 'users': 6, 'note': 8 };
    const index = navMap[page];
    const navBtns = document.querySelectorAll('.nav .btn');
    if (navBtns[index]) {
        navBtns[index].classList.remove('btn-secondary');
        navBtns[index].classList.add('btn-primary');
    }

    if (page === 'eff') renderEff();
}

function renderAll() {
    renderMain();
    renderMaint();
    renderEff();
    renderUsers();
    renderTickets();
    renderNotes();
}

// ============================================================
// ===== الأسطول =====
// ============================================================

function updateZones() {
    const reg = document.getElementById('iReg').value;
    const zoneSelect = document.getElementById('iZone');
    zoneSelect.innerHTML = '<option value="">📍 المنطقة</option>';
    
    const zones = {
        'الشمال': ['تونس', 'بنزرت', 'نابل'],
        'الساحل': ['سوسة', 'المنستير', 'المهدية'],
        'الوسط': ['صفاقس', 'القيروان', 'سيدي بوزيد'],
        'الجنوب': ['جرجيس', 'قابس', 'مدنين'],
        'وحدة الصيانة والإسناد البحري تونس': ['تونس', 'حلق الوادي'],
        'وحدة الصيانة والإسناد البحري المنستير': ['المنستير', 'المهدية'],
        'وحدة الصيانة والإسناد البحري صفاقس': ['صفاقس', 'قابس'],
        'وحدة الصيانة والإسناد البحري جرجيس': ['جرجيس', 'مدنين'],
        'المجمع الأمني بقبيبة': ['قبيبة', 'تونس']
    };
    
    if (zones[reg]) {
        zones[reg].forEach(z => {
            const opt = document.createElement('option');
            opt.value = z;
            opt.textContent = z;
            zoneSelect.appendChild(opt);
        });
    }
}

function addItem() {
    const name = document.getElementById('iName').value.trim();
    const num = document.getElementById('iNum').value.trim();
    
    if (!name || !num) {
        showToast('❌ الرجاء إدخال اسم المركب والرقم', 'warning');
        return;
    }

    const len = parseFloat(document.getElementById('iLen').value) || 0;
    let cat = 'زوارق مزدوجة';
    if (len === 11) cat = 'البروق';
    else if (len >= 8 && len <= 12) cat = 'صقور';
    else if (len > 12 && len <= 25) cat = 'خوافر';
    else if (len > 30) cat = 'طوافات';

    const item = {
        id: Date.now(),
        name,
        num,
        len,
        cat,
        reg: document.getElementById('iReg').value || 'غير محدد',
        zone: document.getElementById('iZone').value || 'غير محدد',
        port: document.getElementById('iPort').value.trim() || 'غير محدد',
        supp: document.getElementById('iSupp').value.trim() || '-',
        stat: document.getElementById('iStat').value,
        break: document.getElementById('iBreak').value.trim() || '-',
        fDate: document.getElementById('iDate').value || new Date().toISOString().split('T')[0],
        eDate: document.getElementById('iEnd').value || '-',
        ref: document.getElementById('iRef').value.trim() || '-'
    };

    fleetData.push(item);
    if (item.stat === 'صيانة' || item.stat === 'معطب') {
        maintData.push(item);
    }
    
    saveAll();
    renderAll();
    showToast('✅ تم إضافة ' + name, 'success');
    clearForm();
}

function clearForm() {
    ['iName', 'iNum', 'iLen', 'iPort', 'iSupp', 'iBreak', 'iRef'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('iReg').value = '';
    document.getElementById('iZone').innerHTML = '<option value="">📍 المنطقة</option>';
    document.getElementById('iStat').value = 'صالح';
    document.getElementById('iDate').value = '';
    document.getElementById('iEnd').value = '';
}

function renderMain() {
    const tbody = document.getElementById('mainBody');
    const search = document.getElementById('searchMain').value.toLowerCase();
    const catFilter = document.getElementById('fCatMain').value;
    const regFilter = document.getElementById('fRegMain').value;

    let filtered = fleetData;
    if (search) {
        filtered = filtered.filter(f => f.name.toLowerCase().includes(search) || f.num.toLowerCase().includes(search));
    }
    if (catFilter !== 'الكل') {
        filtered = filtered.filter(f => f.cat === catFilter);
    }
    if (regFilter !== 'الكل') {
        filtered = filtered.filter(f => f.reg === regFilter);
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="13" style="text-align:center; padding:30px; color:var(--gray-500);">لا توجد وسائل بحرية</td></tr>`;
        return;
    }

    let html = '';
    filtered.forEach(item => {
        const cls = item.stat === 'صالح' ? 'status-صالح' : item.stat === 'معطب' ? 'status-معطب' : 'status-صيانة';
        html += `
            <tr>
                <td><strong>${item.name}</strong></td>
                <td>${item.num}</td>
                <td>${item.len} م</td>
                <td>${item.cat}</td>
                <td>${item.reg}</td>
                <td>${item.zone}</td>
                <td>${item.port}</td>
                <td>${item.supp}</td>
                <td><span class="${cls}">${item.stat}</span></td>
                <td>${item.break}</td>
                <td>${item.fDate}</td>
                <td>${item.eDate}</td>
                <td>
                    <div class="table-actions-group">
                        <button class="btn btn-sm btn-primary" onclick="editItem(${item.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="deleteItem(${item.id})"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function editItem(id) {
    const item = fleetData.find(f => f.id === id);
    if (!item) return;

    document.getElementById('iName').value = item.name;
    document.getElementById('iNum').value = item.num;
    document.getElementById('iLen').value = item.len;
    document.getElementById('iReg').value = item.reg;
    updateZones();
    setTimeout(() => document.getElementById('iZone').value = item.zone, 100);
    document.getElementById('iPort').value = item.port;
    document.getElementById('iSupp').value = item.supp;
    document.getElementById('iStat').value = item.stat;
    document.getElementById('iBreak').value = item.break;
    document.getElementById('iDate').value = item.fDate;
    document.getElementById('iEnd').value = item.eDate;
    document.getElementById('iRef').value = item.ref;

    fleetData = fleetData.filter(f => f.id !== id);
    saveAll();
    renderMain();
    showToast('✏️ جارٍ تعديل: ' + item.name, 'info');
}

function deleteItem(id) {
    Swal.fire({
        title: '⚠️ تأكيد الحذف',
        text: 'هل أنت متأكد من حذف هذه الوسيلة؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#ef4444'
    }).then(result => {
        if (result.isConfirmed) {
            fleetData = fleetData.filter(f => f.id !== id);
            maintData = maintData.filter(m => m.id !== id);
            saveAll();
            renderAll();
            showToast('🗑️ تم الحذف بنجاح', 'success');
        }
    });
}

function clearMainSearch() {
    document.getElementById('searchMain').value = '';
    document.getElementById('fCatMain').value = 'الكل';
    document.getElementById('fRegMain').value = 'الكل';
    renderMain();
}

// ============================================================
// ===== الصيانة =====
// ============================================================

function renderMaint() {
    const tbody = document.getElementById('maintBody');
    const search = document.getElementById('searchMaint').value.toLowerCase();
    const regFilter = document.getElementById('fRegMaint').value;
    const dateStart = document.getElementById('fDateStart').value;
    const dateEnd = document.getElementById('fDateEnd').value;

    let filtered = maintData;
    if (search) {
        filtered = filtered.filter(m => m.name.toLowerCase().includes(search) || m.num.toLowerCase().includes(search));
    }
    if (regFilter !== 'الكل') {
        filtered = filtered.filter(m => m.reg === regFilter);
    }
    if (dateStart) {
        filtered = filtered.filter(m => m.fDate >= dateStart);
    }
    if (dateEnd) {
        filtered = filtered.filter(m => m.fDate <= dateEnd);
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:var(--gray-500);">لا توجد سجلات صيانة</td></tr>`;
        return;
    }

    let html = '';
    filtered.forEach(item => {
        const cls = item.stat === 'صالح' ? 'status-صالح' : item.stat === 'معطب' ? 'status-معطب' : 'status-صيانة';
        html += `
            <tr>
                <td><strong>${item.name}</strong></td>
                <td>${item.num}</td>
                <td>${item.reg}</td>
                <td>${item.zone}</td>
                <td><span class="${cls}">${item.stat}</span></td>
                <td>${item.break}</td>
                <td>${item.fDate}</td>
                <td>${item.eDate}</td>
                <td>${item.ref}</td>
                <td>
                    <div class="table-actions-group">
                        <button class="btn btn-sm btn-success" onclick="completeMaint(${item.id})"><i class="fas fa-check"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="deleteMaint(${item.id})"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function completeMaint(id) {
    const item = maintData.find(m => m.id === id);
    if (!item) return;

    Swal.fire({
        title: '✅ إنهاء الصيانة',
        text: 'هل تريد إنهاء صيانة ' + item.name + '؟',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'نعم، إنهاء',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#22c55e'
    }).then(result => {
        if (result.isConfirmed) {
            const fleetItem = fleetData.find(f => f.num === item.num);
            if (fleetItem) {
                fleetItem.stat = 'صالح';
                fleetItem.break = '-';
            }
            maintData = maintData.filter(m => m.id !== id);
            saveAll();
            renderAll();
            showToast('✅ تم إنهاء صيانة ' + item.name, 'success');
        }
    });
}

function deleteMaint(id) {
    Swal.fire({
        title: '⚠️ تأكيد الحذف',
        text: 'هل أنت متأكد من حذف سجل الصيانة؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#ef4444'
    }).then(result => {
        if (result.isConfirmed) {
            maintData = maintData.filter(m => m.id !== id);
            saveAll();
            renderMaint();
            showToast('🗑️ تم الحذف بنجاح', 'success');
        }
    });
}

function resetMaintFilters() {
    document.getElementById('searchMaint').value = '';
    document.getElementById('fRegMaint').value = 'الكل';
    document.getElementById('fDateStart').value = '';
    document.getElementById('fDateEnd').value = '';
    renderMaint();
}

// ============================================================
// ===== الجاهزية =====
// ============================================================

function renderEff() {
    const filter = document.getElementById('fRegEff').value;
    let filteredData = fleetData;
    if (filter !== 'الكل' && filter !== 'نجاعة عامة') {
        filteredData = fleetData.filter(f => f.reg === filter);
    }

    updateStats(filteredData);

    const container = document.getElementById('tablesContainer');
    let html = '';
    html += renderGeneralEfficiency(filteredData);

    const workshops = ['تونس', 'المنستير', 'صفاقس', 'جرجيس', 'المجمع الأمني بقبيبة'];
    workshops.forEach(ws => {
        const wsData = filteredData.filter(f => f.reg === ws);
        html += renderWorkshopTable(ws, wsData);
    });

    container.innerHTML = html;
}

function updateStats(data) {
    const total = data.length;
    const active = data.filter(f => f.stat === 'صالح').length;
    const maintenance = data.filter(f => f.stat === 'صيانة').length;
    const damage = data.filter(f => f.stat === 'معطب').length;

    document.getElementById('statsCards').innerHTML = `
        <div class="stat-card"><div class="number">${total}</div><div class="label">🚢 إجمالي الوسائل</div></div>
        <div class="stat-card"><div class="number">${active}</div><div class="label">✅ صالح للخدمة</div></div>
        <div class="stat-card"><div class="number">${maintenance}</div><div class="label">🔧 تحت الصيانة</div></div>
        <div class="stat-card"><div class="number">${damage}</div><div class="label">⚠️ معطوب</div></div>
    `;
}

function renderGeneralEfficiency(data) {
    const total = data.length;
    const categories = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];

    let rows = '';
    categories.forEach(cat => {
        const catData = data.filter(f => f.cat === cat);
        const count = catData.length;
        const active = catData.filter(f => f.stat === 'صالح').length;
        const maintenance = catData.filter(f => f.stat === 'صيانة').length;
        const damage = catData.filter(f => f.stat === 'معطب').length;
        const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
        const eff = count > 0 ? Math.round((active / count) * 100) : 0;

        if (count > 0) {
            rows += `
                <tr>
                    <td><strong>${cat}</strong></td>
                    <td>${count}</td>
                    <td>${percentage}%</td>
                    <td>${active}</td>
                    <td>${maintenance}</td>
                    <td>${damage}</td>
                    <td style="color:${eff > 70 ? '#22c55e' : eff > 40 ? '#f59e0b' : '#ef4444'}; font-weight:700;">${eff}%</td>
                </tr>
            `;
        }
    });

    const totalEff = total > 0 ? Math.round((data.filter(f => f.stat === 'صالح').length / total) * 100) : 0;
    rows += `
        <tr style="font-weight:700; background:var(--gray-50);">
            <td>📊 الإجمالي</td>
            <td>${total}</td>
            <td>100%</td>
            <td>${data.filter(f => f.stat === 'صالح').length}</td>
            <td>${data.filter(f => f.stat === 'صيانة').length}</td>
            <td>${data.filter(f => f.stat === 'معطب').length}</td>
            <td style="color:${totalEff > 70 ? '#22c55e' : totalEff > 40 ? '#f59e0b' : '#ef4444'};">${totalEff}%</td>
        </tr>
    `;

    return `
        <div class="region-table-card">
            <div class="region-table-header">
                <i class="fas fa-chart-line"></i> 📊 نجاعة الأسطول العام
                <span style="font-size:12px; color:var(--gray-500);">${total} وسيلة</span>
            </div>
            <div class="scrollable-table">
                <table>
                    <thead>
                        <tr>
                            <th>الفئة</th>
                            <th>العدد</th>
                            <th>النسبة</th>
                            <th>✅ صالح</th>
                            <th>🔧 صيانة</th>
                            <th>❌ معطب</th>
                            <th>النجاعة</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
    `;
}

function renderWorkshopTable(workshopName, data) {
    const total = data.length;
    const categories = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];

    let rows = '';
    categories.forEach(cat => {
        const catData = data.filter(f => f.cat === cat);
        const count = catData.length;
        const active = catData.filter(f => f.stat === 'صالح').length;
        const maintenance = catData.filter(f => f.stat === 'صيانة').length;
        const damage = catData.filter(f => f.stat === 'معطب').length;
        const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
        const eff = count > 0 ? Math.round((active / count) * 100) : 0;

        if (count > 0) {
            rows += `
                <tr>
                    <td><strong>${cat}</strong></td>
                    <td>${count}</td>
                    <td>${percentage}%</td>
                    <td>${active}</td>
                    <td>${maintenance}</td>
                    <td>${damage}</td>
                    <td style="color:${eff > 70 ? '#22c55e' : eff > 40 ? '#f59e0b' : '#ef4444'}; font-weight:700;">${eff}%</td>
                </tr>
            `;
        }
    });

    if (total === 0) {
        rows = `
            <tr>
                <td colspan="7" style="text-align:center; padding:20px; color:var(--gray-500);">
                    <i class="fas fa-info-circle"></i> لا توجد وسائل في هذه الورشة
                </td>
            </tr>
        `;
    } else {
        const totalEff = total > 0 ? Math.round((data.filter(f => f.stat === 'صالح').length / total) * 100) : 0;
        rows += `
            <tr style="font-weight:700; background:var(--gray-50);">
                <td>📊 الإجمالي</td>
                <td>${total}</td>
                <td>100%</td>
                <td>${data.filter(f => f.stat === 'صالح').length}</td>
                <td>${data.filter(f => f.stat === 'صيانة').length}</td>
                <td>${data.filter(f => f.stat === 'معطب').length}</td>
                <td style="color:${totalEff > 70 ? '#22c55e' : totalEff > 40 ? '#f59e0b' : '#ef4444'};">${totalEff}%</td>
            </tr>
        `;
    }

    const icons = {
        'تونس': '🛠️',
        'المنستير': '🛠️',
        'صفاقس': '🛠️',
        'جرجيس': '🛠️',
        'المجمع الأمني بقبيبة': '🏛️'
    };

    return `
        <div class="region-table-card workshop-table">
            <div class="region-table-header">
                <i class="fas fa-tools"></i> ${icons[workshopName] || '🛠️'} ${workshopName}
                <span style="font-size:12px; color:var(--gray-500);">${total} وسيلة</span>
            </div>
            <div class="scrollable-table">
                <table>
                    <thead>
                        <tr>
                            <th>الفئة</th>
                            <th>العدد</th>
                            <th>النسبة</th>
                            <th>✅ صالح</th>
                            <th>🔧 صيانة</th>
                            <th>❌ معطب</th>
                            <th>النجاعة</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
    `;
}

function refreshEff() {
    renderEff();
    showToast('🔄 تم تحديث بيانات الجاهزية', 'info');
}

function exportEfficiencyReport() {
    showToast('📄 جاري تصدير تقرير النجاعة...', 'info');
    setTimeout(() => showToast('✅ تم تصدير التقرير بنجاح', 'success'), 1500);
}

// ============================================================
// ===== الدعم (تذاكر) =====
// ============================================================

function sendTicket() {
    const subject = document.getElementById('ticketSubject').value.trim();
    const message = document.getElementById('ticketMessage').value.trim();
    
    if (!subject || !message) {
        showToast('❌ الرجاء ملء جميع الحقول', 'warning');
        return;
    }

    ticketData.push({
        id: Date.now(),
        subject,
        message,
        status: 'مفتوحة',
        date: new Date().toISOString().split('T')[0]
    });

    saveAll();
    renderTickets();
    document.getElementById('ticketSubject').value = '';
    document.getElementById('ticketMessage').value = '';
    document.getElementById('ticketResponse').textContent = '✅ تم إرسال طلب الدعم بنجاح';
    showToast('📨 تم إرسال طلب الدعم', 'success');
}

function renderTickets() {
    const container = document.getElementById('ticketsList');
    
    if (ticketData.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--gray-500);">لا توجد تذاكر</div>`;
        return;
    }

    let html = '';
    ticketData.forEach(t => {
        const color = t.status === 'مفتوحة' ? '#22c55e' : t.status === 'قيد المعالجة' ? '#f59e0b' : '#64748b';
        html += `
            <div style="background:white; border:1px solid var(--gray-200); border-radius:8px; padding:15px; margin-bottom:10px; border-right:4px solid ${color};">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <strong>${t.subject}</strong>
                    <span style="color:${color}; font-size:12px; font-weight:600;">${t.status}</span>
                </div>
                <p style="font-size:13px; color:var(--gray-600); margin:8px 0;">${t.message}</p>
                <small style="color:var(--gray-500);">📅 ${t.date}</small>
            </div>
        `;
    });
    container.innerHTML = html;
}

function refreshTickets() {
    renderTickets();
    showToast('🔄 تم تحديث قائمة التذاكر', 'info');
}

// ============================================================
// ===== التتبع =====
// ============================================================

function refreshTrackUsers() {
    showToast('🔄 تم تحديث تتبع المستخدمين', 'info');
}

function clearTrackUsers() {
    showToast('🗑️ تم مسح قائمة التتبع', 'info');
}

function startTracking() {
    showToast('📍 بدء التتبع المباشر', 'info');
}

// ============================================================
// ===== المستخدمين =====
// ============================================================

function renderUsers() {
    const tbody = document.getElementById('usersBody');
    
    if (userData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--gray-500);">لا يوجد مستخدمين</td></tr>`;
        return;
    }

    let html = '';
    userData.forEach(u => {
        const cls = u.status === 'نشط' ? 'status-صالح' : 'status-معطب';
        html += `
            <tr>
                <td><strong>${u.name}</strong></td>
                <td>${u.role}</td>
                <td><span class="${cls}">${u.status}</span></td>
                <td><button class="btn btn-sm btn-warning" onclick="openPasswordModal('${u.name}')"><i class="fas fa-key"></i></button></td>
                <td><button class="btn btn-sm ${u.status === 'نشط' ? 'btn-danger' : 'btn-success'}" onclick="toggleUser('${u.name}')">
                    <i class="fas ${u.status === 'نشط' ? 'fa-pause' : 'fa-play'}"></i>
                </button></td>
                <td><button class="btn btn-sm btn-danger" onclick="deleteUserHandler('${u.name}')"><i class="fas fa-trash"></i></button></td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function addUser() {
    const name = document.getElementById('un').value.trim();
    const password = document.getElementById('up').value.trim();
    const role = document.getElementById('ur').value;

    if (!name) {
        showToast('❌ الرجاء إدخال اسم المستخدم', 'warning');
        return;
    }
    if (!password) {
        showToast('❌ الرجاء إدخال كلمة المرور', 'warning');
        return;
    }
    if (password.length < 4) {
        showToast('❌ كلمة المرور يجب أن تكون 4 أحرف على الأقل', 'warning');
        return;
    }
    if (userData.find(u => u.name === name)) {
        showToast('❌ المستخدم "' + name + '" موجود بالفعل', 'warning');
        return;
    }

    userData.push({
        id: Date.now(),
        name,
        password,
        role,
        status: 'نشط'
    });

    localStorage.setItem('marine_users', JSON.stringify(userData));
    renderUsers();
    document.getElementById('un').value = '';
    document.getElementById('up').value = '';
    document.getElementById('ur').value = 'مشاهد';
    showToast('✅ تم إضافة المستخدم "' + name + '" بنجاح', 'success');
}

function toggleUser(name) {
    const user = userData.find(u => u.name === name);
    if (!user) return;
    user.status = user.status === 'نشط' ? 'غير نشط' : 'نشط';
    localStorage.setItem('marine_users', JSON.stringify(userData));
    renderUsers();
    showToast('✅ تم تغيير حالة ' + name, 'success');
}

function deleteUserHandler(name) {
    if (name === 'admin') {
        showToast('❌ لا يمكن حذف المستخدم admin', 'warning');
        return;
    }

    Swal.fire({
        title: '⚠️ تأكيد الحذف',
        text: 'هل أنت متأكد من حذف المستخدم ' + name + '؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#ef4444'
    }).then(result => {
        if (result.isConfirmed) {
            userData = userData.filter(u => u.name !== name);
            localStorage.setItem('marine_users', JSON.stringify(userData));
            renderUsers();
            showToast('🗑️ تم حذف المستخدم ' + name, 'success');
        }
    });
}

function refreshUsers() {
    renderUsers();
    showToast('🔄 تم تحديث قائمة المستخدمين', 'info');
}

let currentPasswordUser = '';

function openPasswordModal(name) {
    currentPasswordUser = name;
    document.getElementById('modalUserName').textContent = 'تغيير كلمة المرور للمستخدم: ' + name;
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    document.getElementById('passwordModal').style.display = 'flex';
}

function closePasswordModal() {
    document.getElementById('passwordModal').style.display = 'none';
    currentPasswordUser = null;
}

function saveNewPassword() {
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

    const user = userData.find(u => u.name === currentPasswordUser);
    if (user) {
        user.password = newPass;
        localStorage.setItem('marine_users', JSON.stringify(userData));
        closePasswordModal();
        showToast('✅ تم تغيير كلمة المرور بنجاح', 'success');
    }
}

// ============================================================
// ===== Note Verbale =====
// ============================================================

function renderNotes() {
    const container = document.getElementById('notesListContainer');
    noteData = JSON.parse(localStorage.getItem('marine_notes') || '[]');
    
    if (noteData.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px; color:var(--gray-500);">
                <i class="fas fa-file-alt" style="font-size:40px; display:block; margin-bottom:10px;"></i>
                لا توجد مذكرات
            </div>
        `;
        return;
    }

    let html = '';
    noteData.forEach(note => {
        html += `
            <div class="note-item">
                <div class="note-title">${note.title}</div>
                <div class="note-meta">
                    <span><i class="far fa-calendar-alt"></i> ${note.date}</span>
                </div>
                <div class="note-content">${note.content}</div>
                <div class="note-actions">
                    <button class="btn btn-sm btn-danger" onclick="deleteNote(${note.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function saveNote() {
    const title = document.getElementById('noteTitle').value.trim();
    const content = document.getElementById('noteContent').value.trim();
    const date = document.getElementById('noteDate').value;

    if (!title || !content) {
        showToast('❌ الرجاء إدخال عنوان ونص المذكرة', 'warning');
        return;
    }

    noteData.unshift({
        id: Date.now(),
        title,
        content,
        date: date || new Date().toISOString().split('T')[0]
    });

    localStorage.setItem('marine_notes', JSON.stringify(noteData));
    clearNote();
    renderNotes();
    showToast('✅ تم حفظ المذكرة بنجاح', 'success');
}

function clearNote() {
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').value = '';
    document.getElementById('noteDate').value = '';
    showToast('🗑️ تم مسح النموذج', 'info');
}

function deleteNote(id) {
    Swal.fire({
        title: '⚠️ تأكيد الحذف',
        text: 'هل أنت متأكد من حذف هذه المذكرة؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#ef4444'
    }).then(result => {
        if (result.isConfirmed) {
            noteData = noteData.filter(n => n.id !== id);
            localStorage.setItem('marine_notes', JSON.stringify(noteData));
            renderNotes();
            showToast('🗑️ تم حذف المذكرة بنجاح', 'success');
        }
    });
}

// ============================================================
// ===== دوال أخرى =====
// ============================================================

function exportAllData() {
    const data = {
        fleet: fleetData,
        maint: maintData,
        users: userData,
        tickets: ticketData,
        notes: noteData
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'marine_data_' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('✅ تم تصدير البيانات بنجاح', 'success');
}

function importAllData(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.fleet) fleetData = data.fleet;
            if (data.maint) maintData = data.maint;
            if (data.users) userData = data.users;
            if (data.tickets) ticketData = data.tickets;
            if (data.notes) noteData = data.notes;
            localStorage.setItem('marine_users', JSON.stringify(userData));
            saveAll();
            renderAll();
            showToast('✅ تم استيراد البيانات بنجاح', 'success');
        } catch (err) {
            showToast('❌ خطأ في قراءة الملف', 'error');
        }
    };
    reader.readAsText(file);
    input.value = '';
}

function refreshAllPages() {
    renderAll();
    showToast('🔄 تم تحديث جميع الصفحات', 'info');
}

// ============================================================
// ===== تشغيل عند التحميل =====
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    loadAllData();
    renderAll();
    console.log('✅ Marine System loaded successfully');
});

// تصدير الدوال للاستخدام العالمي
window.doLogin = doLogin;
window.logout = logout;
window.showPage = showPage;
window.updateZones = updateZones;
window.addItem = addItem;
window.editItem = editItem;
window.deleteItem = deleteItem;
window.clearMainSearch = clearMainSearch;
window.renderMain = renderMain;
window.renderMaint = renderMaint;
window.completeMaint = completeMaint;
window.deleteMaint = deleteMaint;
window.resetMaintFilters = resetMaintFilters;
window.renderEff = renderEff;
window.refreshEff = refreshEff;
window.exportEfficiencyReport = exportEfficiencyReport;
window.sendTicket = sendTicket;
window.refreshTickets = refreshTickets;
window.renderTickets = renderTickets;
window.refreshTrackUsers = refreshTrackUsers;
window.clearTrackUsers = clearTrackUsers;
window.startTracking = startTracking;
window.addUser = addUser;
window.toggleUser = toggleUser;
window.deleteUserHandler = deleteUserHandler;
window.refreshUsers = refreshUsers;
window.openPasswordModal = openPasswordModal;
window.closePasswordModal = closePasswordModal;
window.saveNewPassword = saveNewPassword;
window.renderUsers = renderUsers;
window.renderNotes = renderNotes;
window.saveNote = saveNote;
window.clearNote = clearNote;
window.deleteNote = deleteNote;
window.exportAllData = exportAllData;
window.importAllData = importAllData;
window.refreshAllPages = refreshAllPages;
window.scrollToTop = scrollToTop;
window.scrollToBottom = scrollToBottom;
window.showToast = showToast;

console.log('✅ app.js loaded successfully');
