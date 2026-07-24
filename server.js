// ============================================================
// 📦 app.js - نفس الملف الذي كان يعمل
// ============================================================

console.log('✅ App loaded');

let allVessels = [];
let allUsers = [];
let allTickets = [];
let allNotes = [];
let editingId = null;
let editingUserId = null;
let currentUser = null;

// ============================================================
// 🔐 المصادقة
// ============================================================

function doLogin() {
    const username = document.getElementById('username')?.value.trim();
    const password = document.getElementById('password')?.value.trim();
    
    if (!username || !password) {
        alert('⚠️ الرجاء إدخال اسم المستخدم وكلمة المرور');
        return;
    }
    
    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: username, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            document.getElementById('userRoleDisplay').innerHTML = 
                `<i class="fas fa-user"></i> ${data.user.name} (${data.user.role})`;
            currentUser = data.user;
            loadAllData();
        } else {
            alert('❌ ' + (data.error || 'بيانات غير صحيحة'));
        }
    })
    .catch(err => {
        console.error('Login error:', err);
        alert('❌ خطأ في الاتصال بالخادم');
    });
}

function logout() {
    localStorage.clear();
    location.reload();
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
// 📊 تحميل البيانات
// ============================================================

function loadAllData() {
    loadVessels();
    loadTickets();
    loadNotes();
    loadUsers();
}

function loadVessels() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/vessels', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allVessels = data || [];
        renderMainTable();
        renderMaintTable();
        renderEfficiency();
    })
    .catch(err => console.error('Load vessels error:', err));
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

// ============================================================
// ✅ دوال المراكب
// ============================================================

function addItem() {
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    const name = document.getElementById('iName')?.value;
    if (!name) {
        alert('⚠️ الرجاء إدخال اسم المركب');
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
    
    const url = editingId ? '/api/vessels/' + editingId : '/api/vessels';
    const method = editingId ? 'PUT' : 'POST';
    
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
            alert(editingId ? '✅ تم تحديث المركب بنجاح' : '✅ تم إضافة المركب بنجاح');
            editingId = null;
            document.querySelector('#inputArea .btn-success').textContent = '💾 حفظ';
            clearInputs();
            loadVessels();
        } else {
            alert('❌ ' + (data.error || 'خطأ في العملية'));
        }
    })
    .catch(err => {
        console.error('Error:', err);
        alert('❌ خطأ في العملية');
    });
}

function editVessel(id) {
    const vessel = allVessels.find(v => v._id === id || v.id === id);
    if (!vessel) {
        alert('⚠️ المركب غير موجود');
        return;
    }
    
    editingId = vessel._id || vessel.id;
    
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
    
    document.querySelector('#inputArea .btn-success').textContent = '✏️ تحديث';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteVessel(id) {
    if (!confirm('⚠️ هل أنت متأكد من الحذف؟')) return;
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    fetch('/api/vessels/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم الحذف');
            loadVessels();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الحذف'));
        }
    })
    .catch(err => {
        console.error('Delete error:', err);
        alert('❌ خطأ في الحذف');
    });
}

function clearInputs() {
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
        'الشمال': ['بنزرت', 'طبرقة', 'المرسى'],
        'الساحل': ['سوسة', 'المنستير', 'المهدية'],
        'الوسط': ['صفاقس', 'قابس', 'جربة'],
        'الجنوب': ['جرجيس', 'بن قردان']
    };
    
    const options = zones[reg] || [];
    zoneSelect.innerHTML = '<option value="">📍 المنطقة</option>';
    options.forEach(z => {
        zoneSelect.innerHTML += `<option value="${z}">📍 ${z}</option>`;
    });
}

// ============================================================
// ✅ عرض جدول الأسطول (الصفحة الأولى - كل الأعمدة)
// ============================================================

function renderMainTable() {
    const tbody = document.getElementById('mainBody');
    if (!tbody) return;
    
    const search = document.getElementById('searchMain')?.value.toLowerCase() || '';
    let vessels = allVessels;
    if (search) {
        vessels = vessels.filter(v => 
            (v.name || '').toLowerCase().includes(search) ||
            (v.num || '').toLowerCase().includes(search)
        );
    }
    
    if (!vessels || vessels.length === 0) {
        tbody.innerHTML = `<tr><td colspan="15" style="text-align:center; padding:30px;">🚫 لا توجد بيانات</td></tr>`;
        return;
    }
    
    tbody.innerHTML = vessels.map(v => {
        const id = v._id || v.id;
        return `
        <tr>
            <td>${v.name || '-'}</td>
            <td>${v.num || '-'}</td>
            <td>${v.len || 0}</td>
            <td>${v.cat || '-'}</td>
            <td>${v.reg || '-'}</td>
            <td>${v.zone || '-'}</td>
            <td>${v.port || '-'}</td>
            <td>${v.supp || '-'}</td>
            <td><span style="color:${v.stat === 'صالح' ? '#28a745' : v.stat === 'معطب' ? '#dc3545' : '#ffc107'}">${v.stat || 'صالح'}</span></td>
            <td>${v.break || '-'}</td>
            <td>${v.fDate || '-'}</td>
            <td>${v.eDate || '-'}</td>
            <td>${v.ref || '-'}</td>
            <td>${v.repairer || '-'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-warning" onclick="editVessel('${id}')" title="تعديل">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteVessel('${id}')" title="حذف">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `}).join('');
}

// ============================================================
// ✅ عرض جدول الصيانة (الصفحة الثانية - كل الأعمدة)
// ============================================================

function renderMaintTable() {
    const tbody = document.getElementById('maintBody');
    if (!tbody) return;
    
    const search = document.getElementById('searchMaint')?.value.toLowerCase() || '';
    let vessels = (allVessels || []).filter(v => v.stat !== 'صالح');
    
    if (search) {
        vessels = vessels.filter(v => 
            (v.name || '').toLowerCase().includes(search) ||
            (v.num || '').toLowerCase().includes(search) ||
            (v.break || '').toLowerCase().includes(search)
        );
    }
    
    if (vessels.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:30px;">🚫 لا توجد بيانات صيانة</td></tr>`;
        return;
    }
    
    tbody.innerHTML = vessels.map(v => {
        const id = v._id || v.id;
        return `
        <tr>
            <td>${v.name || '-'}</td>
            <td>${v.num || '-'}</td>
            <td>${v.reg || '-'}</td>
            <td>${v.zone || '-'}</td>
            <td><span style="color:${v.stat === 'معطب' ? '#dc3545' : '#ffc107'}">${v.stat}</span></td>
            <td>${v.break || '-'}</td>
            <td>${v.fDate || '-'}</td>
            <td>${v.eDate || '-'}</td>
            <td>${v.ref || '-'}</td>
            <td>${v.repairer || '-'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-warning" onclick="editVessel('${id}')" title="تعديل">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteVessel('${id}')" title="حذف">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `}).join('');
}

// ============================================================
// ✅ عرض النجاعة (جداول بنفس شكل الجدول العام)
// ============================================================

function renderEfficiency() {
    const vessels = allVessels || [];
    
    // بطاقات الإحصائيات
    const statsContainer = document.getElementById('statsCards');
    if (statsContainer) {
        const total = vessels.length;
        const good = vessels.filter(v => v.stat === 'صالح').length;
        const bad = vessels.filter(v => v.stat === 'معطب').length;
        const maint = vessels.filter(v => v.stat === 'صيانة').length;
        const eff = total > 0 ? Math.round((good / total) * 100) : 0;
        
        statsContainer.innerHTML = `
            <div class="stat-card" style="background:#28a745;"><h3>${good}</h3><p>✅ صالح</p></div>
            <div class="stat-card" style="background:#dc3545;"><h3>${bad}</h3><p>❌ معطب</p></div>
            <div class="stat-card" style="background:#ffc107;"><h3>${maint}</h3><p>🔧 صيانة</p></div>
            <div class="stat-card" style="background:#17a2b8;"><h3>${eff}%</h3><p>📊 الجاهزية</p></div>
        `;
    }
    
    // الجدول العام
    const generalContainer = document.getElementById('generalEffTableContainer');
    if (generalContainer) {
        const categories = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
        let rows = '';
        let totalAll = 0, goodAll = 0, badAll = 0, maintAll = 0;
        
        categories.forEach(cat => {
            const catVessels = vessels.filter(v => v.cat === cat);
            const t = catVessels.length;
            const g = catVessels.filter(v => v.stat === 'صالح').length;
            const b = catVessels.filter(v => v.stat === 'معطب').length;
            const m = catVessels.filter(v => v.stat === 'صيانة').length;
            const e = t > 0 ? Math.round((g / t) * 100) : 0;
            
            totalAll += t; goodAll += g; badAll += b; maintAll += m;
            const color = e >= 80 ? '#28a745' : e >= 50 ? '#ffc107' : '#dc3545';
            
            rows += `
                <tr style="border-bottom:1px solid #e9ecef;">
                    <td style="padding:10px; text-align:right; font-weight:bold;">${cat}</td>
                    <td style="padding:10px; text-align:center;">${t}</td>
                    <td style="padding:10px; text-align:center; color:#28a745;">${g}</td>
                    <td style="padding:10px; text-align:center; color:#dc3545;">${b}</td>
                    <td style="padding:10px; text-align:center; color:#ffc107;">${m}</td>
                    <td style="padding:10px; text-align:center; font-weight:bold; color:${color};">${e}%</td>
                </tr>
            `;
        });
        
        const totalEff = totalAll > 0 ? Math.round((goodAll / totalAll) * 100) : 0;
        const totalColor = totalEff >= 80 ? '#28a745' : totalEff >= 50 ? '#ffc107' : '#dc3545';
        
        generalContainer.innerHTML = `
            <div style="background:white; border-radius:10px; padding:20px; margin:20px 0; box-shadow:0 2px 10px rgba(0,0,0,0.1); overflow-x:auto;">
                <h4 style="color:#0d6efd; margin-bottom:15px;">📊 النجاعة العامة حسب الفئات</h4>
                <table style="width:100%; border-collapse:collapse; font-size:14px;">
                    <thead>
                        <tr style="background:#0d6efd; color:white;">
                            <th style="padding:12px; text-align:right;">الفئة</th>
                            <th style="padding:12px; text-align:center;">الإجمالي</th>
                            <th style="padding:12px; text-align:center; background:#28a745;">✅ صالح</th>
                            <th style="padding:12px; text-align:center; background:#dc3545;">❌ معطب</th>
                            <th style="padding:12px; text-align:center; background:#ffc107;">🔧 صيانة</th>
                            <th style="padding:12px; text-align:center;">نسبة النجاعة</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                        <tr style="background:#e7f3ff; font-weight:bold; border-top:2px solid #0d6efd;">
                            <td style="padding:12px; text-align:right;">📊 المجموع الكلي</td>
                            <td style="padding:12px; text-align:center;">${totalAll}</td>
                            <td style="padding:12px; text-align:center; color:#28a745;">${goodAll}</td>
                            <td style="padding:12px; text-align:center; color:#dc3545;">${badAll}</td>
                            <td style="padding:12px; text-align:center; color:#ffc107;">${maintAll}</td>
                            <td style="padding:12px; text-align:center; color:${totalColor};">${totalEff}%</td>
                        </tr>
                    </tbody>
                </table>
                <div style="margin-top:15px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:13px;">
                        <span>📈 نسبة النجاعة العامة: <strong>${totalEff}%</strong></span>
                        <span style="color:${totalColor};">${totalEff >= 80 ? '✅ ممتاز' : totalEff >= 50 ? '⚠️ متوسط' : '❌ منخفض'}</span>
                    </div>
                    <div style="background:#e9ecef; border-radius:10px; height:10px; overflow:hidden;">
                        <div style="background:${totalColor}; height:100%; width:${totalEff}%; transition:width 0.5s;"></div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // جداول الوحدات (بنفس شكل الجدول العام)
    const unitsContainer = document.getElementById('effUnitsContainer');
    if (unitsContainer) {
        const units = [
            { name: '🗺️ الحرس البحري بالشمال', key: 'الشمال' },
            { name: '🗺️ الحرس البحري بالساحل', key: 'الساحل' },
            { name: '🗺️ الحرس البحري بالوسط', key: 'الوسط' },
            { name: '🗺️ الحرس البحري بالجنوب', key: 'الجنوب' },
            { name: '🛠️ وحدة الصيانة تونس', key: 'تونس' },
            { name: '🛠️ وحدة الصيانة صفاقس', key: 'صفاقس' },
            { name: '🛠️ وحدة الصيانة المنستير', key: 'المنستير' },
            { name: '🛠️ وحدة الصيانة جرجيس', key: 'جرجيس' }
        ];
        
        let html = '';
        
        units.forEach(unit => {
            const unitVessels = vessels.filter(v => v.reg === unit.key || v.repairer === unit.key || v.zone === unit.key);
            const total = unitVessels.length;
            const good = unitVessels.filter(v => v.stat === 'صالح').length;
            const bad = unitVessels.filter(v => v.stat === 'معطب').length;
            const maint = unitVessels.filter(v => v.stat === 'صيانة').length;
            const eff = total > 0 ? Math.round((good / total) * 100) : 0;
            const color = eff >= 80 ? '#28a745' : eff >= 50 ? '#ffc107' : '#dc3545';
            
            // الفئات داخل كل وحدة
            const categories = ['البروق', 'صقور', 'خوافر', 'طوافات', 'زوارق مزدوجة'];
            let catRows = '';
            let catTotal = 0, catGood = 0, catBad = 0, catMaint = 0;
            
            categories.forEach(cat => {
                const catVessels = unitVessels.filter(v => v.cat === cat);
                const t = catVessels.length;
                const g = catVessels.filter(v => v.stat === 'صالح').length;
                const b = catVessels.filter(v => v.stat === 'معطب').length;
                const m = catVessels.filter(v => v.stat === 'صيانة').length;
                const e = t > 0 ? Math.round((g / t) * 100) : 0;
                
                catTotal += t; catGood += g; catBad += b; catMaint += m;
                const catColor = e >= 80 ? '#28a745' : e >= 50 ? '#ffc107' : '#dc3545';
                
                if (t > 0) {
                    catRows += `
                        <tr style="border-bottom:1px solid #e9ecef;">
                            <td style="padding:8px; text-align:right; font-weight:bold;">${cat}</td>
                            <td style="padding:8px; text-align:center;">${t}</td>
                            <td style="padding:8px; text-align:center; color:#28a745;">${g}</td>
                            <td style="padding:8px; text-align:center; color:#dc3545;">${b}</td>
                            <td style="padding:8px; text-align:center; color:#ffc107;">${m}</td>
                            <td style="padding:8px; text-align:center; font-weight:bold; color:${catColor};">${e}%</td>
                        </tr>
                    `;
                }
            });
            
            const catEff = catTotal > 0 ? Math.round((catGood / catTotal) * 100) : 0;
            const catColor = catEff >= 80 ? '#28a745' : catEff >= 50 ? '#ffc107' : '#dc3545';
            
            html += `
                <div class="region-table-card">
                    <div class="region-table-header">${unit.name}</div>
                    <div class="scrollable-table">
                        <table style="width:100%; border-collapse:collapse; font-size:13px;">
                            <thead>
                                <tr style="background:#0d6efd; color:white;">
                                    <th style="padding:8px; text-align:right;">الفئة</th>
                                    <th style="padding:8px; text-align:center;">الإجمالي</th>
                                    <th style="padding:8px; text-align:center; background:#28a745;">✅ صالح</th>
                                    <th style="padding:8px; text-align:center; background:#dc3545;">❌ معطب</th>
                                    <th style="padding:8px; text-align:center; background:#ffc107;">🔧 صيانة</th>
                                    <th style="padding:8px; text-align:center;">نسبة النجاعة</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${catRows || `<tr><td colspan="6" style="text-align:center; padding:15px; color:#6c757d;">🚫 لا توجد مراكب في هذه الوحدة</td></tr>`}
                                ${catRows ? `
                                <tr style="background:#e7f3ff; font-weight:bold; border-top:2px solid #0d6efd;">
                                    <td style="padding:8px; text-align:right;">📊 المجموع</td>
                                    <td style="padding:8px; text-align:center;">${catTotal}</td>
                                    <td style="padding:8px; text-align:center; color:#28a745;">${catGood}</td>
                                    <td style="padding:8px; text-align:center; color:#dc3545;">${catBad}</td>
                                    <td style="padding:8px; text-align:center; color:#ffc107;">${catMaint}</td>
                                    <td style="padding:8px; text-align:center; color:${catColor};">${catEff}%</td>
                                </tr>
                                ` : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        });
        
        unitsContainer.innerHTML = html;
    }
}

// ============================================================
// 👥 دوال المستخدمين
// ============================================================

function addUser() {
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    const name = document.getElementById('un')?.value.trim();
    const password = document.getElementById('up')?.value.trim();
    const role = document.getElementById('ur')?.value;
    
    if (!name || !password) {
        alert('⚠️ الرجاء إدخال اسم المستخدم وكلمة المرور');
        return;
    }
    
    const data = {
        name: name,
        email: name.toLowerCase().replace(/\s/g, '') + '@test.com',
        password: password,
        role: role || 'مشاهد'
    };
    
    fetch('/api/users', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم إضافة المستخدم بنجاح');
            document.getElementById('un').value = '';
            document.getElementById('up').value = '';
            document.getElementById('ur').value = 'مشاهد';
            loadUsers();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الإضافة'));
        }
    })
    .catch(err => {
        console.error('Add user error:', err);
        alert('❌ خطأ في إضافة المستخدم');
    });
}

function deleteUser(id) {
    if (!confirm('⚠️ هل أنت متأكد من حذف هذا المستخدم؟')) return;
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    fetch('/api/users/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم حذف المستخدم');
            loadUsers();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الحذف'));
        }
    })
    .catch(err => {
        console.error('Delete user error:', err);
        alert('❌ خطأ في حذف المستخدم');
    });
}

function toggleUserStatus(id) {
    const user = allUsers.find(u => u._id === id || u.id === id);
    if (!user) return;
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    fetch('/api/users/' + id, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ isActive: !user.isActive })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم تحديث حالة المستخدم');
            loadUsers();
        } else {
            alert('❌ ' + (data.error || 'خطأ في التحديث'));
        }
    })
    .catch(err => {
        console.error('Toggle user status error:', err);
        alert('❌ خطأ في تحديث حالة المستخدم');
    });
}

function changeUserPassword(id, name) {
    document.getElementById('modalUserName').textContent = `تغيير كلمة المرور لـ: ${name}`;
    document.getElementById('passwordModal').dataset.userId = id;
    document.getElementById('passwordModal').style.display = 'flex';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
}

function saveNewPassword() {
    const password = document.getElementById('newPassword')?.value.trim();
    const confirm = document.getElementById('confirmPassword')?.value.trim();
    const userId = document.getElementById('passwordModal')?.dataset.userId;
    
    if (!password || password.length < 6) {
        alert('⚠️ كلمة المرور يجب أن تكون 6 أحرف على الأقل');
        return;
    }
    
    if (password !== confirm) {
        alert('⚠️ كلمة المرور غير متطابقة');
        return;
    }
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    fetch('/api/users/' + userId, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ password: password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم تغيير كلمة المرور بنجاح');
            closePasswordModal();
        } else {
            alert('❌ ' + (data.error || 'خطأ في التغيير'));
        }
    })
    .catch(err => {
        console.error('Change password error:', err);
        alert('❌ خطأ في تغيير كلمة المرور');
    });
}

function closePasswordModal() {
    document.getElementById('passwordModal').style.display = 'none';
}

function renderUsersTable() {
    const tbody = document.getElementById('usersBody');
    if (!tbody) return;
    
    if (!allUsers || allUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px;">🚫 لا توجد مستخدمين</td></tr>`;
        return;
    }
    
    tbody.innerHTML = allUsers.map(u => {
        const id = u._id || u.id;
        return `
        <tr>
            <td>${u.name || '-'}</td>
            <td>${u.role || 'مشاهد'}</td>
            <td>${u.isActive ? '✅ نشط' : '❌ معطل'}</td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="changeUserPassword('${id}', '${u.name}')">
                    <i class="fas fa-key"></i>
                </button>
            </td>
            <td>
                <button class="btn btn-sm ${u.isActive ? 'btn-danger' : 'btn-success'}" onclick="toggleUserStatus('${id}')">
                    <i class="fas ${u.isActive ? 'fa-ban' : 'fa-check'}"></i>
                </button>
            </td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteUser('${id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `}).join('');
}

// ============================================================
// 🎫 التذاكر
// ============================================================

function loadTickets() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/tickets', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allTickets = data || [];
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
    })
    .catch(err => console.error('Load tickets error:', err));
}

function sendTicket() {
    const subject = document.getElementById('ticketSubject')?.value.trim();
    const message = document.getElementById('ticketMessage')?.value.trim();
    
    if (!subject || !message) {
        alert('⚠️ الرجاء إدخال العنوان والرسالة');
        return;
    }
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    fetch('/api/tickets', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ subject, message })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم إرسال التذكرة');
            document.getElementById('ticketSubject').value = '';
            document.getElementById('ticketMessage').value = '';
            loadTickets();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الإرسال'));
        }
    })
    .catch(err => {
        console.error('Send ticket error:', err);
        alert('❌ خطأ في إرسال التذكرة');
    });
}

function refreshTickets() {
    loadTickets();
    alert('✅ تم تحديث التذاكر');
}

// ============================================================
// 📝 المذكرات
// ============================================================

function loadNotes() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/notes', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        allNotes = data || [];
        const container = document.getElementById('notesListContainer');
        if (!container) return;
        
        if (!allNotes || allNotes.length === 0) {
            container.innerHTML = '<p style="color:#6c757d;">🚫 لا توجد مذكرات</p>';
            return;
        }
        
        container.innerHTML = allNotes.map(n => `
            <div style="background:#f8f9fa; padding:15px; margin:10px 0; border-radius:8px; border-right:4px solid #0d6efd;">
                <h4 style="color:#0d6efd;">${n.title}</h4>
                <p>${n.content}</p>
                <small>${n.date || ''} ${n.time || ''} | ${n.createdBy || 'مجهول'}</small>
            </div>
        `).join('');
    })
    .catch(err => console.error('Load notes error:', err));
}

function saveNote() {
    const title = document.getElementById('noteTitle')?.value.trim();
    const content = document.getElementById('noteContent')?.value.trim();
    const date = document.getElementById('noteDate')?.value;
    
    if (!title || !content || !date) {
        alert('⚠️ الرجاء إدخال العنوان والمحتوى والتاريخ');
        return;
    }
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    fetch('/api/notes', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ title, content, date })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('✅ تم حفظ المذكرة');
            document.getElementById('noteTitle').value = '';
            document.getElementById('noteContent').value = '';
            document.getElementById('noteDate').value = '';
            loadNotes();
        } else {
            alert('❌ ' + (data.error || 'خطأ في الحفظ'));
        }
    })
    .catch(err => {
        console.error('Save note error:', err);
        alert('❌ خطأ في حفظ المذكرة');
    });
}

function clearNote() {
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').value = '';
    document.getElementById('noteDate').value = '';
}

function loadNotesByWeek() {
    loadNotes();
}

// ============================================================
// 🖥️ دوال الصفحات
// ============================================================

function showPage(page) {
    document.querySelectorAll('[id^="page"]').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1));
    if (target) target.classList.remove('hidden');
    
    switch(page) {
        case 'main':
            loadVessels();
            break;
        case 'maint':
            loadVessels();
            break;
        case 'eff':
            loadVessels();
            break;
        case 'support':
            loadTickets();
            break;
        case 'note':
            loadNotes();
            break;
        case 'users':
            loadUsers();
            break;
    }
}

function refreshAllPages() {
    loadAllData();
    alert('✅ تم تحديث جميع البيانات');
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

// ============================================================
// 🔔 الإشعارات
// ============================================================

function toggleNotifications() {
    alert('🔔 الإشعارات: لا توجد إشعارات جديدة');
}

// ============================================================
// 🗺️ الخريطة
// ============================================================

function initMap() {
    console.log('🗺️ Map initialized');
}

function startTracking() {
    alert('📍 بدء التتبع المباشر');
}

function stopTracking() {
    alert('⏹️ إيقاف التتبع');
}

function loadLocations() {
    alert('📍 تحميل المواقع');
}

function centerMapOnUser() {
    alert('📍 التمركز على موقعك');
}

// ============================================================
// 🔄 تصدير الدوال
// ============================================================

window.doLogin = doLogin;
window.logout = logout;
window.showPage = showPage;
window.addItem = addItem;
window.editVessel = editVessel;
window.deleteVessel = deleteVessel;
window.updateZones = updateZones;
window.refreshAllPages = refreshAllPages;
window.scrollToTop = scrollToTop;
window.scrollToBottom = scrollToBottom;
window.sendTicket = sendTicket;
window.refreshTickets = refreshTickets;
window.saveNote = saveNote;
window.clearNote = clearNote;
window.loadNotesByWeek = loadNotesByWeek;
window.toggleNotifications = toggleNotifications;
window.initMap = initMap;
window.startTracking = startTracking;
window.stopTracking = stopTracking;
window.loadLocations = loadLocations;
window.centerMapOnUser = centerMapOnUser;
window.addUser = addUser;
window.deleteUser = deleteUser;
window.toggleUserStatus = toggleUserStatus;
window.changeUserPassword = changeUserPassword;
window.saveNewPassword = saveNewPassword;
window.closePasswordModal = closePasswordModal;

console.log('✅ جميع الدوال جاهزة');

document.addEventListener('DOMContentLoaded', function() {
    if (localStorage.getItem('token')) {
        loadAllData();
    }
});
