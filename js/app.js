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

// ===== دوال التنقل =====
function showPage(page) {
    const pages = ['pageMain', 'pageMaint', 'pageEff', 'pageSupport', 'pageTrack', 'pageMap', 'pageUsers'];
    pages.forEach(p => document.getElementById(p).classList.add('hidden'));
    
    const isAdmin = currentUser && currentUser.role === "مسؤول";
    
    if(page === 'main') { 
        document.getElementById('pageMain').classList.remove('hidden');
    }
    else if(page === 'maint') { 
        document.getElementById('pageMaint').classList.remove('hidden'); 
        renderMaint();
    }
    else if(page === 'eff') { 
        document.getElementById('pageEff').classList.remove('hidden'); 
        renderEff(); 
    }
    else if(page === 'support') { 
        document.getElementById('pageSupport').classList.remove('hidden'); 
        renderTickets(); 
    }
    else if(page === 'track') { 
        if(isAdmin) { 
            document.getElementById('pageTrack').classList.remove('hidden'); 
            renderTrack(); 
        } else { 
            showToast("غير مسموح - هذه الصفحة للمسؤول فقط", true); 
        }
    }
    else if(page === 'map') { 
        if(isAdmin) {
            document.getElementById('pageMap').classList.remove('hidden');
            setTimeout(() => {
                if (trackingMap) trackingMap.invalidateSize();
                loadLocations();
            }, 100);
        } else {
            showToast("غير مسموح - هذه الصفحة للمسؤول فقط", true);
        }
    }
    else if(page === 'users') { 
        if(isAdmin) { 
            document.getElementById('pageUsers').classList.remove('hidden'); 
            renderUsers(); 
        } else { 
            showToast("غير مسموح - هذه الصفحة للمسؤول فقط", true); 
        }
    }
}
