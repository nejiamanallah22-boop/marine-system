
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

async function renderMain() {
    try {
        let data = await loadVessels();
        const fCat = document.getElementById('fCatMain').value;
        const fReg = document.getElementById('fRegMain').value;
        const searchText = document.getElementById('searchMain').value.toLowerCase();
        
        let filtered = data.filter(x => {
            let matchCat = (fCat === "الكل" || (x.cat && x.cat === fCat));
            let matchReg = (fReg === "الكل" || (x.reg && x.reg === fReg));
            let matchSearch = !searchText ||
