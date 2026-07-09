// ==================== دوال المراكب ====================

async function addItem() {
    if(!canEdit()) { showToast("ليس لديك صلاحية للإضافة!", true); return; }
    const name = document.getElementById('iName').value.trim();
    if(!name) return showToast("الاسم مطلوب", true);
    
    const stat = document.getElementById('iStat').value;
    const fDate = document.getElementById('iDate').value;
    
    if((stat === 'معطب' || stat === 'صيانة') && !fDate) {
        showToast("تاريخ العطب إلزامي للمراكب المعطوبة أو التي تحت الصيانة!", true);
        return;
    }
    
    const newItem = {
        name: name,
        num: document.getElementById('iNum').value,
        len: parseFloat(document.getElementById('iLen').value) || 0,
        reg: document.getElementById('iReg').value,
        zone: document.getElementById('iZone').value,
        port: document.getElementById('iPort').value,
        supp: document.getElementById('iSupp').value,
        stat: stat,
        break: document.getElementById('iBreak').value,
        fDate: fDate,
        eDate: document.getElementById('iEnd').value,
        ref: document.getElementById('iRef').value,
        cat: getCat(document.getElementById('iLen').value)
    };
    
    try {
        await saveVessel(newItem);
        await logActivity("إضافة مركب", `قام بإضافة مركب "${name}" رقم ${newItem.num || 'غير محدد'} في ${getCurrentTime()}`);
        
        ['iName','iNum','iLen','iPort','iSupp','iBreak','iDate','iEnd','iRef'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = "";
        });
        document.getElementById('iReg').value = "";
        document.getElementById('iZone').innerHTML = '<option value="">المنطقة</option>';
        
        await renderMain();
        await renderMaint();
        await renderEff();
        showToast(`✅ تم حفظ المركب بنجاح`);
    } catch(error) {
        showToast("خطأ في حفظ المركب: " + error.message, true);
    }
}

async function editItem(id, name) {
    if(!canEdit()) { showToast("ليس لديك صلاحية للتعديل!", true); return; }
    let data = await loadVessels();
    let item = data.find(x => (x._id || x.id).toString() === id.toString());
    if(item) {
        document.getElementById('iName').value = item.name;
        document.getElementById('iNum').value = item.num || '';
        document.getElementById('iLen').value = item.len || '';
        document.getElementById('iReg').value = item.reg || '';
        updateZones();
        setTimeout(() => { document.getElementById('iZone').value = item.zone; }, 50);
        document.getElementById('iPort').value = item.port || '';
        document.getElementById('iSupp').value = item.supp || '';
        document.getElementById('iStat').value = item.stat;
        document.getElementById('iBreak').value = item.break || '';
        document.getElementById('iDate').value = item.fDate || '';
        document.getElementById('iEnd').value = item.eDate || '';
        document.getElementById('iRef').value = item.ref || '';
        window.scrollTo(0,0);
        
        const oldName = item.name;
        const saveBtn = document.querySelector('#inputArea .btn-green');
        const originalClick = saveBtn.onclick;
        saveBtn.onclick = async () => {
            const updatedItem = {
                name: document.getElementById('iName').value.trim(),
                num: document.getElementById('iNum').value,
                len: parseFloat(document.getElementById('iLen').value) || 0,
                reg: document.getElementById('iReg').value,
                zone: document.getElementById('iZone').value,
                port: document.getElementById('iPort').value,
                supp: document.getElementById('iSupp').value,
                stat: document.getElementById('iStat').value,
                break: document.getElementById('iBreak').value,
                fDate: document.getElementById('iDate').value,
                eDate: document.getElementById('iEnd').value,
                ref: document.getElementById('iRef').value,
                cat: getCat(document.getElementById('iLen').value)
            };
            try {
                await updateVessel(item._id || item.id, updatedItem);
                await logActivity("تعديل مركب", `قام بتعديل مركب "${oldName}" إلى "${updatedItem.name}"`);
                await renderMain();
                await renderMaint();
                await renderEff();
                showToast("✅ تم تحديث المركب بنجاح");
                saveBtn.onclick = originalClick;
                ['iName','iNum','iLen','iPort','iSupp','iBreak','iDate','iEnd','iRef'].forEach(id => {
                    const el = document.getElementById(id);
                    if(el) el.value = "";
                });
                document.getElementById('iReg').value = "";
                document.getElementById('iZone').innerHTML = '<option value="">المنطقة</option>';
            } catch(error) {
                showToast("خطأ في التحديث: " + error.message, true);
            }
        };
        showToast("✏️ قم بتعديل البيانات ثم اضغط حفظ");
    }
}

async function delItem(id, name) {
    if(!canDelete()) { showToast("ليس لديك صلاحية للحذف!", true); return; }
    if(confirm(`هل أنت متأكد من حذف المركب "${name}"؟`)) {
        try {
            await deleteVessel(id);
            await logActivity("حذف مركب", `قام بحذف مركب "${name}"`);
            await renderMain();
            await renderMaint();
            await renderEff();
            showToast("✅ تم حذف المركب بنجاح");
        } catch(error) {
            showToast("خطأ في الحذف: " + error.message, true);
        }
    }
}

function updateZones() {
    const reg = document.getElementById('iReg').value;
    const zoneSel = document.getElementById('iZone');
    zoneSel.innerHTML = '<option value="">المنطقة</option>';
    if(ZONES_DATA[reg]) {
        ZONES_DATA[reg].forEach(z => zoneSel.innerHTML += `<option value="${z}">${z}</option>`);
    }
}

// ===== دالة renderMain المعدلة =====
async function renderMain() {
    try {
        console.log('🔄 جاري تحميل بيانات المراكب...');
        let data = await loadVessels();
        console.log(`✅ تم تحميل ${data.length} مركب`);
        
        const fCat = document.getElementById('fCatMain').value;
        const fReg = document.getElementById('fRegMain').value;
        const searchText = document.getElementById('searchMain').value.toLowerCase();
        
        let filtered = data.filter(x => {
            let matchCat = (fCat === "الكل" || (x.cat && x.cat === fCat));
            let matchReg = (fReg === "الكل" || (x.reg && x.reg === fReg));
            let matchSearch = !searchText || 
                (x.name && x.name.toLowerCase().includes(searchText)) ||
                (x.num && x.num.toLowerCase().includes(searchText)) ||
                (x.reg && x.reg.toLowerCase().includes(searchText)) ||
                (x.zone && x.zone.toLowerCase().includes(searchText)) ||
                (x.port && x.port.toLowerCase().includes(searchText));
            return matchCat && matchReg && matchSearch;
        });
        
        let html = "";
        const isAdmin = currentUser?.role === "مسؤول";
        
        if(filtered.length === 0) {
            html = '<tr><td colspan="13" style="text-align:center;">⚠️ لا توجد مراكب مسجلة</td></tr>';
        } else {
            filtered.forEach(x => {
                let regionDisplay = REGION_NAMES[x.reg] || x.reg || '-';
                html += `<tr>
                    <td><b>${x.name}</b></td>
                    <td>${x.num || '-'}</td>
                    <td>${x.len || '-'}</td>
                    <td>${x.cat || '-'}</td>
                    <td>${regionDisplay}</td>
                    <td>${x.zone || '-'}</td>
                    <td>${x.port || '-'}</td>
                    <td>${x.supp || '-'}</td>
                    <td class="status-${x.stat}">${x.stat}</td>
                    <td>${x.break || '-'}</td>
                    <td>${formatDate(x.fDate)}</td>
                    <td>${formatDate(x.eDate)}</td>
                    <td>
                        ${canEdit() ? `<button class="btn-sm btn-orange" onclick="editItem('${x._id || x.id}', '${x.name}')">تعديل</button>` : ''}
                        ${isAdmin ? `<button class="btn-sm btn-red" onclick="delItem('${x._id || x.id}', '${x.name}')">حذف</button>` : ''}
                    </td>
                </tr>`;
            });
        }
        document.getElementById('mainBody').innerHTML = html;
        console.log('✅ تم عرض البيانات في الجدول');
    } catch(error) {
        console.error('خطأ في renderMain:', error);
        document.getElementById('mainBody').innerHTML = '<tr><td colspan="13">❌ خطأ في تحميل البيانات</td></tr>';
    }
}

function clearMainSearch() {
    document.getElementById('searchMain').value = '';
    renderMain();
}

// ===== دالة renderMaint المعدلة =====
async function renderMaint() {
    try {
        console.log('🔄 جاري تحميل بيانات الصيانة...');
        let data = await loadVessels();
        const fReg = document.getElementById('fRegMaint').value;
        const dStart = document.getElementById('fDateStart').value;
        const dEnd = document.getElementById('fDateEnd').value;
        const searchText = document.getElementById('searchMaint').value.toLowerCase();
        
        let filtered = data.filter(x => x.stat === 'معطب' || x.stat === 'صيانة');
        
        if(fReg !== "الكل") filtered = filtered.filter(x => x.reg === fReg);
        
        if(dStart || dEnd) {
            const start = dStart ? new Date(dStart) : null;
            const end = dEnd ? new Date(dEnd) : null;
            filtered = filtered.filter(x => {
                if(!x.fDate) return false;
                const itemDate = new Date(x.fDate);
                if(start && itemDate < start) return false;
                if(end && itemDate > end) return false;
                return true;
            });
        }
        
        if(searchText) {
            filtered = filtered.filter(x => 
                (x.name && x.name.toLowerCase().includes(searchText)) ||
                (x.break && x.break.toLowerCase().includes(searchText)) ||
                (x.ref && x.ref.toLowerCase().includes(searchText)) ||
                (x.num && x.num.toLowerCase().includes(searchText))
            );
        }
        
        filtered.sort((a, b) => {
            if(!a.fDate) return 1;
            if(!b.fDate) return -1;
            return new Date(b.fDate) - new Date(a.fDate);
        });
        
        let html = "";
        const isAdmin = currentUser?.role === "مسؤول";
        
        if(filtered.length === 0) {
            html = '<tr><td colspan="10" style="text-align:center;">⚠️ لا توجد مراكب معطوبة أو تحت الصيانة</td></tr>';
        } else {
            filtered.forEach(x => {
                let regionDisplay = REGION_NAMES[x.reg] || x.reg || '-';
                html += `<tr>
                    <td><b>${x.name}</b></td>
                    <td>${x.num || '-'}</td>
                    <td>${regionDisplay}</td>
                    <td>${x.zone || '-'}</td>
                    <td class="status-${x.stat}">${x.stat}</td>
                    <td class="damage-column" style="text-align:right;">${x.break || '-'}</td>
                    <td>${formatDate(x.fDate)}</td>
                    <td>${formatDate(x.eDate)}</td>
                    <td>${x.ref || '-'}</td>
                    <td>
                        ${isAdmin ? `<button class="btn-sm btn-orange" onclick="editItem('${x._id || x.id}', '${x.name}')">تعديل</button>` : ''}
                        ${isAdmin ? `<button class="btn-sm btn-red" onclick="delItem('${x._id || x.id}', '${x.name}')">حذف</button>` : ''}
                    </td>
                </tr>`;
            });
        }
        document.getElementById('maintBody').innerHTML = html;
        console.log('✅ تم عرض بيانات الصيانة');
    } catch(error) {
        console.error('خطأ في renderMaint:', error);
        document.getElementById('maintBody').innerHTML = '<tr><td colspan="10">❌ خطأ في تحميل البيانات</td></tr>';
    }
}

function resetMaintFilters() {
    document.getElementById('fRegMaint').value = "الكل";
    document.getElementById('fDateStart').value = "";
    document.getElementById('fDateEnd').value = "";
    document.getElementById('searchMaint').value = "";
    renderMaint();
    showToast("✅ تم إعادة ضبط الفلاتر");
}
