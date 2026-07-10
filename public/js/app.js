// ==================== تشغيل التطبيق ====================

// ===== دوال التحديث =====
async function refreshMain() { await renderMain(); showToast("✅ تم تحديث الأسطول البحري"); }
async function refreshMaint() { await renderMaint(); showToast("✅ تم تحديث سجل الصيانة"); }
async function refreshEff() { await renderEff(); showToast("✅ تم تحديث جاهزية الأسطول"); }
async function refreshTickets() { await renderTickets(); showToast("✅ تم تحديث قائمة التذاكر"); }
async function refreshTrack() { if(canManageUsers()) { await renderTrack(); showToast("✅ تم تحديث سجل التتبع"); } }
async function refreshUsers() { if(canManageUsers()) { await renderUsers(); showToast("✅ تم تحديث قائمة المستخدمين"); } }

async function refreshAllPages() { 
    await renderMain(); 
    await renderMaint(); 
    await renderEff(); 
    await renderTickets(); 
    if(canManageUsers()) { 
        await renderUsers(); 
        await renderTrack(); 
    }
    showToast("✅ تم تحديث جميع الصفحات");
}

// ===== دوال التصدير والاستيراد =====
async function exportAllData() {
    if(!canManageUsers()) { showToast("غير مسموح - هذه الخاصية للمسؤول فقط", true); return; }
    try {
        const exportData = await exportAllDataAPI();
        const dataStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([dataStr], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `marine_data_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        await logActivity("تصدير بيانات", "قام بتصدير جميع البيانات إلى ملف JSON");
        showToast("✅ تم تصدير البيانات بنجاح!");
    } catch(error) {
        showToast("خطأ في التصدير: " + error.message, true);
    }
}

async function importAllData(input) {
    if(!canManageUsers()) { showToast("غير مسموح - هذه الخاصية للمسؤول فقط", true); return; }
    if(!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            await importAllDataAPI(importedData);
            await refreshAllPages();
            await logActivity("استيراد بيانات", "قام باستيراد البيانات من ملف JSON");
            showToast("✅ تم استيراد البيانات بنجاح!");
        } catch(err) {
            showToast("❌ خطأ في قراءة الملف: " + err.message, true);
        }
    };
    reader.readAsText(file);
    input.value = "";
}

// ===== دوال التتبع =====
async function renderTrack() {
    if(!canManageUsers()) return;
    try {
        let logs = await loadLogs();
        const start = document.getElementById('trackDateStart').value;
        const end = document.getElementById('trackDateEnd').value;
        let filtered = [...logs];
        
        if(start) {
            const s = new Date(start);
            filtered = filtered.filter(l => {
                if(!l.date) return false;
                const [d,m,y] = l.date.split('/');
                return new Date(`${y}-${m}-${d}`) >= s;
            });
        }
        if(end) {
            const e = new Date(end);
            filtered = filtered.filter(l => {
                if(!l.date) return false;
                const [d,m,y] = l.date.split('/');
                return new Date(`${y}-${m}-${d}`) <= e;
            });
        }
        
        const totalActivities = filtered.length;
        const uniqueUsers = [...new Set(filtered.map(l => l.userName))];
        
        let html = `
            <div class="stats-cards" style="margin-bottom: 20px;">
                <div class="stat-card"><div class="number">${totalActivities}</div><div class="label">📊 إجمالي النشاطات</div></div>
                <div class="stat-card"><div class="number">${uniqueUsers.length}</div><div class="label">👥 عدد المستخدمين</div></div>
            </div>
            <div class="scrollable-table">
            <table class="region-table">
                <thead>
                    <tr><th>#</th><th>التاريخ</th><th>الوقت</th><th>المستخدم</th><th>الصلاحية</th><th>الإجراء</th><th style="min-width: 350px;">التفاصيل</th></tr>
                </thead>
                <tbody>
        `;
        
        if(filtered.length === 0) {
            html += '<tr><td colspan="7" style="text-align:center;">لا توجد نشاطات مسجلة</td></tr>';
        } else {
            filtered.forEach((l, index) => {
                let actionIcon = '';
                if (l.action === 'إضافة مركب') actionIcon = '➕';
                else if (l.action === 'تعديل مركب') actionIcon = '✏️';
                else if (l.action === 'حذف مركب') actionIcon = '🗑️';
                else if (l.action === 'تسجيل دخول') actionIcon = '🔐';
                else if (l.action === 'تسجيل خروج') actionIcon = '🚪';
                else actionIcon = '📝';
                
                html += `<tr>
                    <td>${index + 1}</td>
                    <td>${l.date}</td>
                    <td>${l.time || '-'}</td>
                    <td><b>${l.userName}</b></td>
                    <td><span class="role-badge" style="background:#e9ecef;">${l.userRole}</span></td>
                    <td><span style="color:var(--primary); font-weight:bold;">${actionIcon} ${l.action}</span></td>
                    <td style="text-align:right;">${l.details}</td>
                </tr>`;
            });
        }
        
        html += `</tbody></table></div>`;
        document.getElementById('trackContent').innerHTML = html;
    } catch(error) {
        console.error('خطأ في renderTrack:', error);
        document.getElementById('trackContent').innerHTML = '<div class="region-table-card"><div class="region-table-header">❌ خطأ في تحميل سجل التتبع</div></div>';
    }
}

function resetTrackFilters() {
    document.getElementById('trackDateStart').value = "";
    document.getElementById('trackDateEnd').value = "";
    renderTrack();
    showToast("✅ تم إعادة ضبط فلاتر التتبع");
}

// ============================================================
// ===== تتبع المستخدمين المتكامل =====
// ============================================================

let trackUsersInterval = null;

async function loadTrackUsers() {
    if (!currentUser || currentUser.role !== 'مسؤول') {
        return;
    }
    
    try {
        const response = await fetch('/api/online-users', {
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(await response.text());
        }
        
        const data = await response.json();
        renderTrackUsers(data);
        updateTrackMap(data);
        
    } catch (error) {
        console.error('❌ خطأ في جلب المستخدمين:', error);
    }
}

function renderTrackUsers(data) {
    const tbody = document.getElementById('trackUsersBody');
    const count = document.getElementById('trackUsersCount');
    
    if (!tbody) return;
    if (count) count.textContent = `${data.total || 0} متصل`;
    
    if (!data.online || data.online.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px;">لا يوجد مستخدمين متصلين</td></tr>`;
        return;
    }
    
    tbody.innerHTML = data.online.map((user, index) => `
        <tr>
            <td>${index + 1}</td>
            <td><b>${user.userName}</b></td>
            <td>${user.userRole}</td>
            <td><code style="background:#f8f9fa;padding:2px 6px;border-radius:4px;font-size:11px;">${(user.id || '').substring(0, 8)}</code></td>
            <td>${user.device || 'غير معروف'}</td>
            <td>${user.browser || 'غير معروف'}</td>
            <td><code style="background:#f8f9fa;padding:2px 6px;border-radius:4px;font-size:12px;">${user.ip || 'غير معروف'}</code></td>
            <td>${user.lat && user.lng ? `${user.lat.toFixed(4)}, ${user.lng.toFixed(4)}` : '⚠️ غير متاح'}</td>
            <td>${user.lastUpdate ? new Date(user.lastUpdate).toLocaleString('ar-EG') : 'غير معروف'}</td>
        </tr>
    `).join('');
}

function updateTrackMap(data) {
    if (!trackingMap) {
        initTrackingMap();
        if (!trackingMap) return;
    }
    
    Object.keys(trackingMarkers).forEach(key => {
        if (key !== 'default') {
            trackingMarkers[key].remove();
            delete trackingMarkers[key];
        }
    });
    
    if (!data.online || data.online.length === 0) {
        setDefaultLocation();
        return;
    }
    
    let hasLocation = false;
    data.online.forEach(user => {
        if (user.lat && user.lng) {
            hasLocation = true;
            
            let iconColor = '#2e7d32';
            if (user.userRole === 'مسؤول') iconColor = '#dc3545';
            else if (user.userRole === 'محرر') iconColor = '#ffc107';
            else iconColor = '#17a2b8';
            
            const icon = L.divIcon({
                html: `<div style="background:${iconColor}; color:white; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 10px rgba(0,0,0,0.3); font-size:14px; font-weight:bold;">${user.userName.charAt(0).toUpperCase()}</div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });
            
            const marker = L.marker([user.lat, user.lng], { icon: icon })
                .addTo(trackingMap)
                .bindPopup(`
                    <div style="text-align:center; font-family:Cairo;">
                        <b>👤 ${user.userName}</b><br>
                        🔑 ${user.userRole}<br>
                        📍 ${user.lat.toFixed(4)}, ${user.lng.toFixed(4)}<br>
                        🕐 ${new Date(user.lastUpdate || user.connectedAt).toLocaleString('ar-EG')}<br>
                        💻 ${user.device || 'غير معروف'}<br>
                        🌐 ${user.browser || 'غير معروف'}<br>
                        📡 ${user.ip || 'غير معروف'}
                    </div>
                `);
            
            trackingMarkers[user.userName] = marker;
        }
    });
    
    if (hasLocation) {
        const firstUser = data.online.find(u => u.lat && u.lng);
        if (firstUser && isFirstLocation) {
            trackingMap.setView([firstUser.lat, firstUser.lng], 12);
            isFirstLocation = false;
        }
        document.getElementById('mapStatus').innerHTML = `📍 ${data.online.filter(u => u.lat && u.lng).length} مستخدم نشط على الخريطة`;
    } else {
        setDefaultLocation();
        document.getElementById('mapStatus').innerHTML = '⚠️ لا توجد مواقع للمستخدمين';
    }
}

function startTrackUsers() {
    if (trackUsersInterval) {
        clearInterval(trackUsersInterval);
    }
    
    loadTrackUsers();
    trackUsersInterval = setInterval(() => {
        loadTrackUsers();
    }, 5000);
    
    console.log('✅ بدء تتبع المستخدمين (كل 5 ثواني)');
}

function stopTrackUsers() {
    if (trackUsersInterval) {
        clearInterval(trackUsersInterval);
        trackUsersInterval = null;
        console.log('⏹️ إيقاف تتبع المستخدمين');
    }
}

async function refreshTrackUsers() {
    await loadTrackUsers();
    showToast('✅ تم تحديث بيانات المستخدمين');
}

function clearTrackUsers() {
    if (!confirm('هل أنت متأكد من مسح جميع المستخدمين من الخريطة؟')) return;
    
    Object.keys(trackingMarkers).forEach(key => {
        if (key !== 'default') {
            trackingMarkers[key].remove();
            delete trackingMarkers[key];
        }
    });
    
    setDefaultLocation();
    document.getElementById('mapStatus').innerHTML = '🗑️ تم مسح الخريطة';
    showToast('🗑️ تم مسح جميع المستخدمين من الخريطة');
}

// ===== دوال التنقل =====
async function showPage(page) {
    const pages = ['pageMain', 'pageMaint', 'pageEff', 'pageSupport', 'pageTrack', 'pageMap', 'pageUsers'];
    pages.forEach(p => document.getElementById(p).classList.add('hidden'));
    
    const isAdmin = currentUser && currentUser.role === "مسؤول";
    
    if(page === 'main') { 
        document.getElementById('pageMain').classList.remove('hidden');
        await renderMain();
    }
    else if(page === 'maint') { 
        document.getElementById('pageMaint').classList.remove('hidden'); 
        await renderMaint();
    }
    else if(page === 'eff') { 
        document.getElementById('pageEff').classList.remove('hidden'); 
        await renderEff();
    }
    else if(page === 'support') { 
        document.getElementById('pageSupport').classList.remove('hidden'); 
        await renderTickets();
    }
    else if(page === 'track') { 
        if(isAdmin) { 
            document.getElementById('pageTrack').classList.remove('hidden'); 
            await loadTrackUsers();
            startTrackUsers();
        } else { 
            showToast("غير مسموح - هذه الصفحة للمسؤول فقط", true); 
        }
    }
    else if(page === 'map') { 
        if(isAdmin) {
            document.getElementById('pageMap').classList.remove('hidden');
            setTimeout(() => {
                if (typeof L !== 'undefined') {
                    if (!trackingMap) {
                        initTrackingMap();
                    }
                    setTimeout(() => {
                        if (trackingMap) {
                            trackingMap.invalidateSize();
                            loadLocations();
                            if (watchId === null && currentUser?.lat && currentUser?.lng) {
                                startTracking();
                            }
                        }
                    }, 300);
                } else {
                    showToast("❌ خطأ في تحميل مكتبة الخريطة", true);
                }
            }, 100);
        } else {
            showToast("غير مسموح - هذه الصفحة للمسؤول فقط", true);
        }
    }
    else if(page === 'users') { 
        if(isAdmin) { 
            document.getElementById('pageUsers').classList.remove('hidden'); 
            await renderUsers();
        } else { 
            showToast("غير مسموح - هذه الصفحة للمسؤول فقط", true); 
        }
    }
}

// ===== إعادة تهيئة الخريطة =====
function reinitMap() {
    if (typeof L === 'undefined') {
        console.error('❌ Leaflet غير محمل');
        showToast("❌ خطأ في تحميل مكتبة الخريطة", true);
        return;
    }
    
    if (trackingMap) {
        setTimeout(() => {
            trackingMap.invalidateSize();
            console.log('✅ تم إعادة تهيئة الخريطة');
        }, 500);
    } else {
        initTrackingMap();
        setTimeout(() => {
            if (trackingMap) trackingMap.invalidateSize();
        }, 500);
    }
}

async function refreshData() {
    await renderMain();
    await renderMaint();
    await renderEff();
    await renderTickets();
    if(canManageUsers()) { await renderUsers(); await renderTrack(); }
    showToast('✅ تم تحديث البيانات');
}

async function initAppAfterLogin() {
    const isAdmin = currentUser && currentUser.role === "مسؤول";
    
    await renderMain();
    await renderMaint();
    await renderEff();
    await renderTickets();
    if(isAdmin) { 
        await renderUsers(); 
        await renderTrack(); 
    }
    await logActivity("تسجيل دخول", `قام بتسجيل الدخول إلى النظام في ${getCurrentTime()}`);
    showToast(`مرحباً ${currentUser.name}`);
    
    initSocket();
}

function initTrackingMapWithLocation(lat, lng) {
    setTimeout(() => {
        if (trackingMap) {
            trackingMap.setView([lat, lng], 15);
            if (currentUser) {
                updateMapMarker(currentUser.name, lat, lng, new Date().toISOString());
            }
            trackingMap.invalidateSize();
            console.log('✅ تم تهيئة الخريطة مع موقع المستخدم');
        } else {
            initTrackingMap();
            setTimeout(() => {
                if (trackingMap) {
                    trackingMap.setView([lat, lng], 15);
                    if (currentUser) {
                        updateMapMarker(currentUser.name, lat, lng, new Date().toISOString());
                    }
                    trackingMap.invalidateSize();
                    console.log('✅ تم تهيئة الخريطة مع موقع المستخدم (بعد التأخير)');
                }
            }, 500);
        }
    }, 300);
}

async function addUserLocation(userName) {
    if (!userName) return;
    
    if (!currentUser?.lat || !currentUser?.lng) {
        console.log('⚠️ لا يوجد موقع GPS حقيقي للمستخدم:', userName);
        return;
    }
    
    const lat = currentUser.lat;
    const lng = currentUser.lng;
    
    try {
        await fetch('/api/locations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify({
                lat: lat,
                lng: lng,
                action: 'تسجيل دخول'
            })
        });
        console.log(`📍 تم حفظ موقع المستخدم: ${userName}`);
    } catch(e) {
        console.error('خطأ في حفظ موقع المستخدم:', e);
    }
    
    if (trackingMap) {
        updateMapMarker(userName, lat, lng, new Date().toISOString());
    }
}

async function saveUserLocation(userName, lat, lng) {
    try {
        await fetch('/api/locations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify({
                lat: lat,
                lng: lng,
                action: 'تحديث موقع'
            })
        });
        console.log(`📍 تم حفظ موقع ${userName}: ${lat}, ${lng}`);
        return true;
    } catch(e) {
        console.error('خطأ في حفظ الموقع:', e);
        return false;
    }
}

async function initAppAfterLoginWithLocation(lat, lng) {
    const isAdmin = currentUser && currentUser.role === "مسؤول";
    
    await renderMain();
    await renderMaint();
    await renderEff();
    await renderTickets();
    if(isAdmin) { 
        await renderUsers(); 
        await renderTrack(); 
    }
    await logActivity("تسجيل دخول", `قام بتسجيل الدخول من الموقع: ${lat}, ${lng}`);
    showToast(`مرحباً ${currentUser.name} ✅`, false);
    console.log('✅ تم تحميل البيانات بنجاح');
    
    initSocket();
}

// ============================================================
// ✅ تصدير الدوال
// ============================================================

window.showPage = showPage;
window.refreshMain = refreshMain;
window.refreshMaint = refreshMaint;
window.refreshEff = refreshEff;
window.refreshTickets = refreshTickets;
window.refreshTrack = refreshTrack;
window.refreshUsers = refreshUsers;
window.refreshAllPages = refreshAllPages;
window.exportAllData = exportAllData;
window.importAllData = importAllData;
window.reinitMap = reinitMap;
window.refreshData = refreshData;
window.initAppAfterLogin = initAppAfterLogin;
window.initAppAfterLoginWithLocation = initAppAfterLoginWithLocation;
window.initTrackingMapWithLocation = initTrackingMapWithLocation;
window.addUserLocation = addUserLocation;
window.saveUserLocation = saveUserLocation;
window.resetTrackFilters = resetTrackFilters;
window.loadTrackUsers = loadTrackUsers;
window.renderTrackUsers = renderTrackUsers;
window.updateTrackMap = updateTrackMap;
window.startTrackUsers = startTrackUsers;
window.stopTrackUsers = stopTrackUsers;
window.refreshTrackUsers = refreshTrackUsers;
window.clearTrackUsers = clearTrackUsers;

console.log('✅ app.js تم تحميله بنجاح');
