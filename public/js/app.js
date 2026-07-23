// ============================================================
// 📦 app.js - الملف الرئيسي الكامل (مع التتبع)
// ============================================================

console.log('✅ App loaded');

let allVessels = [];
let editingId = null;
let socket = null;
let trackMap = null;
let gpsMap = null;
let userMarker = null;
let trackingInterval = null;
let connectedUsers = {};

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
            loadAllData();
            initSocket();
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
    if (socket) socket.disconnect();
    location.reload();
}

function getToken() {
    return localStorage.getItem('token');
}

// ============================================================
// 📡 Socket.IO
// ============================================================

function initSocket() {
    if (socket) return;
    
    socket = io();
    
    socket.on('connect', () => {
        console.log('✅ Socket متصل');
        const user = getUser();
        if (user && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    socket.emit('user-connected', {
                        userName: user.name,
                        userRole: user.role,
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    });
                },
                () => {}
            );
        }
    });
    
    socket.on('user-list', (users) => {
        connectedUsers = {};
        users.forEach(u => { connectedUsers[u.id] = u; });
        updateTrackUsers(users);
        updateTrackMap(users);
    });
    
    socket.on('receive-location', (data) => {
        console.log('📍 موقع جديد:', data);
        if (data && data.lat && data.lng) {
            addMarkerToTrackMap(data);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Socket غير متصل');
    });
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

// ============================================================
// ✅ إضافة/تعديل مركب
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
        ref: document.getElementById('iRef')?.value || ''
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
// ✅ عرض جدول الأسطول
// ============================================================

function renderMainTable() {
    const tbody = document.getElementById('mainBody');
    if (!tbody) return;
    
    if (!allVessels || allVessels.length === 0) {
        tbody.innerHTML = `<tr><td colspan="14" style="text-align:center; padding:30px;">🚫 لا توجد بيانات</td></tr>`;
        return;
    }
    
    tbody.innerHTML = allVessels.map(v => {
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
            <td>
                <button onclick="editVessel('${id}')" style="background:#ffc107; color:#1a3a5c; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; margin:2px;">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteVessel('${id}')" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; margin:2px;">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `}).join('');
}

// ============================================================
// ✅ عرض جدول الصيانة
// ============================================================

function renderMaintTable() {
    const tbody = document.getElementById('maintBody');
    if (!tbody) return;
    
    const vessels = (allVessels || []).filter(v => v.stat !== 'صالح');
    
    if (vessels.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px;">🚫 لا توجد بيانات صيانة</td></tr>`;
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
            <td>
                <button onclick="editVessel('${id}')" style="background:#ffc107; color:#1a3a5c; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        </tr>
    `}).join('');
}

// ============================================================
// ✅ عرض النجاعة
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
    
    // جدول النجاعة العام
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
    
    // جداول الوحدات
    const regionContainer = document.getElementById('regionTables');
    if (regionContainer) {
        const units = [
            { name: '🗺️ الحرس البحري بالشمال', key: 'الشمال' },
            { name: '🗺️ الحرس البحري بالساحل', key: 'الساحل' },
            { name: '🗺️ الحرس البحري بالوسط', key: 'الوسط' },
            { name: '🗺️ الحرس البحري بالجنوب', key: 'الجنوب' }
        ];
        
        let html = '<h4 style="color:#0d6efd; margin:20px 0 15px;">📊 نجاعة الوحدات البحرية</h4>';
        html += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">';
        
        units.forEach(unit => {
            const unitVessels = vessels.filter(v => v.reg === unit.key);
            const total = unitVessels.length;
            const good = unitVessels.filter(v => v.stat === 'صالح').length;
            const bad = unitVessels.filter(v => v.stat === 'معطب').length;
            const maint = unitVessels.filter(v => v.stat === 'صيانة').length;
            const eff = total > 0 ? Math.round((good / total) * 100) : 0;
            const color = eff >= 80 ? '#28a745' : eff >= 50 ? '#ffc107' : '#dc3545';
            
            html += `
                <div style="background:white; border-radius:10px; padding:15px; box-shadow:0 2px 10px rgba(0,0,0,0.1);">
                    <h5 style="color:#0d6efd; margin-bottom:10px;">${unit.name}</h5>
                    <table style="width:100%; border-collapse:collapse; font-size:13px;">
                        <thead>
                            <tr style="background:#f8f9fa;">
                                <th style="padding:6px; text-align:right;">الحالة</th>
                                <th style="padding:6px; text-align:center;">العدد</th>
                                <th style="padding:6px; text-align:center;">%</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td style="padding:6px; border-bottom:1px solid #e9ecef;">✅ صالح</td><td style="padding:6px; text-align:center;">${good}</td><td style="padding:6px; text-align:center;">${total > 0 ? Math.round((good/total)*100) : 0}%</td></tr>
                            <tr><td style="padding:6px; border-bottom:1px solid #e9ecef;">❌ معطب</td><td style="padding:6px; text-align:center;">${bad}</td><td style="padding:6px; text-align:center;">${total > 0 ? Math.round((bad/total)*100) : 0}%</td></tr>
                            <tr><td style="padding:6px; border-bottom:1px solid #e9ecef;">🔧 صيانة</td><td style="padding:6px; text-align:center;">${maint}</td><td style="padding:6px; text-align:center;">${total > 0 ? Math.round((maint/total)*100) : 0}%</td></tr>
                            <tr style="background:#e7f3ff; font-weight:bold;">
                                <td style="padding:6px;">📊 النجاعة</td>
                                <td style="padding:6px; text-align:center;">${total}</td>
                                <td style="padding:6px; text-align:center; color:${color};">${eff}%</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
        });
        
        html += '</div>';
        regionContainer.innerHTML = html;
    }
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
        const container = document.getElementById('ticketsList');
        if (!container) return;
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:20px; color:#6c757d;">🚫 لا توجد تذاكر</p>';
            return;
        }
        
        container.innerHTML = data.map(t => `
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
        const container = document.getElementById('notesListContainer');
        if (!container) return;
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p style="color:#6c757d;">🚫 لا توجد مذكرات</p>';
            return;
        }
        
        container.innerHTML = data.map(n => `
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
// 👥 المستخدمين
// ============================================================

function loadUsers() {
    const token = getToken();
    if (!token) return;
    
    fetch('/api/users', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        const tbody = document.getElementById('usersBody');
        if (!tbody) return;
        
        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px;">🚫 لا توجد مستخدمين</td></tr>`;
            return;
        }
        
        tbody.innerHTML = data.map(u => `
            <tr>
                <td>${u.name}</td>
                <td>${u.role}</td>
                <td>${u.isActive ? '✅ نشط' : '❌ معطل'}</td>
                <td>
                    <button class="btn btn-sm btn-warning" onclick="alert('تغيير كلمة المرور')"><i class="fas fa-key"></i></button>
                </td>
            </tr>
        `).join('');
    })
    .catch(err => console.error('Load users error:', err));
}

// ============================================================
// 📍 التتبع والخريطة
// ============================================================

function initTrackMap() {
    if (trackMap) return;
    
    const container = document.getElementById('trackMap');
    if (!container) return;
    
    if (typeof L === 'undefined') {
        console.warn('⚠️ Leaflet not loaded');
        return;
    }
    
    trackMap = L.map('trackMap').setView([36.8, 10.18], 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(trackMap);
}

function initGpsMap() {
    if (gpsMap) return;
    
    const container = document.getElementById('gpsMap');
    if (!container) return;
    
    if (typeof L === 'undefined') {
        console.warn('⚠️ Leaflet not loaded');
        return;
    }
    
    gpsMap = L.map('gpsMap').setView([36.8, 10.18], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(gpsMap);
}

function updateTrackUsers(users) {
    const body = document.getElementById('trackUsersBody');
    const count = document.getElementById('trackUsersCount');
    
    if (count) {
        count.textContent = `${users.length} متصل`;
    }
    
    if (!body) return;
    
    if (!users || users.length === 0) {
        body.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px;">🚫 لا يوجد مستخدمين متصلين</td></tr>`;
        return;
    }
    
    body.innerHTML = users.map((u, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${u.userName || 'مجهول'}</td>
            <td>${u.userRole || 'مستخدم'}</td>
            <td>${u.lat && u.lng ? `${u.lat.toFixed(6)}, ${u.lng.toFixed(6)}` : '-'}</td>
            <td>${u.lastUpdate ? new Date(u.lastUpdate).toLocaleTimeString() : '-'}</td>
        </tr>
    `).join('');
}

function updateTrackMap(users) {
    if (!trackMap) initTrackMap();
    if (!trackMap) return;
    
    // حذف العلامات القديمة
    trackMap.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
            trackMap.removeLayer(layer);
        }
    });
    
    users.forEach(u => {
        if (u.lat && u.lng) {
            const marker = L.marker([u.lat, u.lng])
                .addTo(trackMap)
                .bindPopup(`
                    <b>${u.userName || 'مجهول'}</b><br>
                    ${u.userRole || 'مستخدم'}<br>
                    📍 ${u.lat.toFixed(6)}, ${u.lng.toFixed(6)}
                `);
        }
    });
}

function addMarkerToTrackMap(data) {
    if (!trackMap) initTrackMap();
    if (!trackMap) return;
    
    if (data.lat && data.lng) {
        L.marker([data.lat, data.lng])
            .addTo(trackMap)
            .bindPopup(`
                <b>${data.userName || 'مجهول'}</b><br>
                📍 ${data.lat.toFixed(6)}, ${data.lng.toFixed(6)}
            `);
    }
}

function refreshTrackUsers() {
    if (socket) {
        socket.emit('get-users');
    }
    alert('✅ تم تحديث المستخدمين');
}

function clearTrackUsers() {
    const body = document.getElementById('trackUsersBody');
    if (body) {
        body.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px;">🚫 تم مسح القائمة</td></tr>`;
    }
}

// ============================================================
// 📍 GPS المباشر
// ============================================================

function startTracking() {
    if (!navigator.geolocation) {
        alert('⚠️ المتصفح لا يدعم تحديد الموقع');
        return;
    }
    
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    const user = getUser();
    if (!user) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    document.getElementById('startTrackingBtn').style.display = 'none';
    document.getElementById('stopTrackingBtn').style.display = 'inline-block';
    document.getElementById('gpsStatusText').textContent = 'جاري التتبع...';
    document.getElementById('gpsDot').className = 'gps-status gps-active';
    
    if (!gpsMap) initGpsMap();
    if (!gpsMap) return;
    
    // مركز الخريطة على موقع المستخدم
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            gpsMap.setView([lat, lng], 15);
            
            if (!userMarker) {
                userMarker = L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: 'custom-marker',
                        html: '<div style="background:#dc3545; width:20px; height:20px; border-radius:50%; border:3px solid white; box-shadow:0 0 10px rgba(220,53,69,0.5);"></div>',
                        iconSize: [20, 20]
                    })
                }).addTo(gpsMap).bindPopup('📍 موقعك الحالي');
            } else {
                userMarker.setLatLng([lat, lng]);
            }
        },
        () => {},
        { enableHighAccuracy: true }
    );
    
    // بدء التتبع الدوري
    trackingInterval = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                
                if (userMarker) {
                    userMarker.setLatLng([lat, lng]);
                }
                
                // إرسال الموقع إلى الخادم
                if (socket) {
                    socket.emit('update-location', {
                        userName: user.name,
                        userRole: user.role,
                        lat: lat,
                        lng: lng
                    });
                }
                
                // حفظ الموقع في قاعدة البيانات
                const token = getToken();
                if (token) {
                    fetch('/api/locations', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + token
                        },
                        body: JSON.stringify({ lat, lng, action: 'تتبع مباشر' })
                    }).catch(err => console.error('Save location error:', err));
                }
                
                document.getElementById('gpsStatusText').textContent = '✅ تتبع نشط';
                document.getElementById('mapStatus').textContent = `📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            },
            (error) => {
                console.error('GPS error:', error);
                document.getElementById('gpsStatusText').textContent = '❌ خطأ في GPS';
            },
            { enableHighAccuracy: true, maximumAge: 5000 }
        );
    }, 5000);
    
    alert('✅ بدء التتبع المباشر');
}

function stopTracking() {
    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
    }
    
    document.getElementById('startTrackingBtn').style.display = 'inline-block';
    document.getElementById('stopTrackingBtn').style.display = 'none';
    document.getElementById('gpsStatusText').textContent = 'غير نشط';
    document.getElementById('gpsDot').className = 'gps-status gps-inactive';
    document.getElementById('mapStatus').textContent = '⏹️ تم إيقاف التتبع';
    
    alert('⏹️ تم إيقاف التتبع');
}

function loadLocations() {
    const token = getToken();
    if (!token) {
        alert('⚠️ يرجى تسجيل الدخول أولاً');
        return;
    }
    
    if (!gpsMap) initGpsMap();
    if (!gpsMap) return;
    
    fetch('/api/locations', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        if (!data || data.length === 0) {
            alert('🚫 لا توجد مواقع');
            return;
        }
        
        // حذف العلامات القديمة
        gpsMap.eachLayer((layer) => {
            if (layer instanceof L.Marker && layer !== userMarker) {
                gpsMap.removeLayer(layer);
            }
        });
        
        data.forEach(loc => {
            if (loc.lat && loc.lng) {
                L.marker([loc.lat, loc.lng])
                    .addTo(gpsMap)
                    .bindPopup(`
                        <b>${loc.userName || 'مجهول'}</b><br>
                        📍 ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}<br>
                        <small>${new Date(loc.timestamp).toLocaleString()}</small>
                    `);
            }
        });
        
        alert(`✅ تم تحميل ${data.length} موقع`);
    })
    .catch(err => {
        console.error('Load locations error:', err);
        alert('❌ خطأ في تحميل المواقع');
    });
}

function centerMapOnUser() {
    if (!navigator.geolocation) {
        alert('⚠️ المتصفح لا يدعم تحديد الموقع');
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            
            if (gpsMap) {
                gpsMap.setView([lat, lng], 15);
            }
            
            alert('📍 تم التمركز على موقعك');
        },
        (error) => {
            console.error('GPS error:', error);
            alert('❌ خطأ في تحديد الموقع');
        },
        { enableHighAccuracy: true }
    );
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
        case 'track':
            setTimeout(() => {
                initTrackMap();
                if (socket) socket.emit('get-users');
            }, 300);
            break;
        case 'map':
            setTimeout(() => {
                initGpsMap();
            }, 300);
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
window.startTracking = startTracking;
window.stopTracking = stopTracking;
window.loadLocations = loadLocations;
window.centerMapOnUser = centerMapOnUser;
window.refreshTrackUsers = refreshTrackUsers;
window.clearTrackUsers = clearTrackUsers;
window.initTrackMap = initTrackMap;
window.initGpsMap = initGpsMap;

console.log('✅ جميع الدوال جاهزة');

// تحميل البيانات تلقائياً
document.addEventListener('DOMContentLoaded', function() {
    if (localStorage.getItem('token')) {
        loadAllData();
    }
});
