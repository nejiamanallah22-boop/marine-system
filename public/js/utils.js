// ============================================================
// ===== دوال مساعدة =====
// ============================================================

function scrollToTop() { 
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
}

function scrollToBottom() { 
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); 
}

// ===== الإشعارات (Toast) =====
function showToast(message, isError = false) {
    const oldToast = document.querySelector('.toast');
    if (oldToast) oldToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        background: ${isError ? '#dc3545' : '#28a745'};
        color: white;
        padding: 14px 30px;
        border-radius: 10px;
        z-index: 10001;
        font-family: 'Cairo', 'Segoe UI', sans-serif;
        font-size: 15px;
        font-weight: 600;
        box-shadow: 0 8px 30px rgba(0,0,0,0.2);
        max-width: 90%;
        text-align: center;
        animation: slideUp 0.5s ease;
        direction: rtl;
    `;
    toast.innerHTML = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.transition = 'opacity 0.5s, transform 0.5s';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(30px)';
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 500);
    }, 4000);
}

// ===== تنسيق التاريخ =====
function formatDate(d) { 
    if(!d) return '-'; 
    try { 
        let date = new Date(d); 
        if(isNaN(date.getTime())) return d; 
        return `${date.getDate().toString().padStart(2,'0')}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getFullYear()}`; 
    } catch(e) { return d; } 
}

// ===== تصنيف المركب =====
function getCat(len) { 
    let n = parseFloat(len); 
    if(n === 11) return "البروق"; 
    if(n >= 8 && n <= 12) return "صقور"; 
    if(n > 12 && n <= 25) return "خوافر"; 
    if(n > 30) return "طوافات"; 
    return "زوارق مزدوجة"; 
}

// ===== صلاحيات =====
function canEdit() { return currentUser && (currentUser.role === "مسؤول" || currentUser.role === "محرر"); }
function canDelete() { return currentUser && currentUser.role === "مسؤول"; }
function canManageUsers() { return currentUser && currentUser.role === "مسؤول"; }

// ===== التاريخ والوقت =====
function getCurrentDate() {
    const now = new Date();
    return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
}
function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

// ===== البيانات الثابتة =====
const ZONES_DATA = {
    "الشمال": ["تونس", "بنزرت", "طبرقة"],
    "الساحل": ["سوسة", "المنستير", "نابل"],
    "الوسط": ["صفاقس", "المهدية", "قرقنة"],
    "الجنوب": ["جرجيس", "جربة", "قابس"],
    "وحدة الصيانة والإسناد البحري تونس": ["تونس"],
    "وحدة الصيانة والإسناد البحري المنستير": ["المنستير"],
    "وحدة الصيانة والإسناد البحري صفاقس": ["صفاقس"],
    "وحدة الصيانة والإسناد البحري جرجيس": ["جرجيس"],
    "المجمع الأمني بقبيبة": ["قبيبة"]
};
const CATS_LIST = ["البروق", "صقور", "خوافر", "زوارق مزدوجة", "طوافات"];
const REGION_NAMES = {
    "الشمال": "🗺️ الحرس البحري بالشمال",
    "الساحل": "🗺️ الحرس البحري بالساحل",
    "الوسط": "🗺️ الحرس البحري بالوسط",
    "الجنوب": "🗺️ الحرس البحري بالجنوب",
    "وحدة الصيانة والإسناد البحري تونس": "🛠️ وحدة الصيانة تونس",
    "وحدة الصيانة والإسناد البحري المنستير": "🛠️ وحدة الصيانة المنستير",
    "وحدة الصيانة والإسناد البحري صفاقس": "🛠️ وحدة الصيانة صفاقس",
    "وحدة الصيانة والإسناد البحري جرجيس": "🛠️ وحدة الصيانة جرجيس",
    "المجمع الأمني بقبيبة": "🏛️ المجمع الأمني بقبيبة"
};

// ============================================================
// ===== Note Verbale (الكامل المصحح) =====
// ============================================================

// ===== حساب رقم الأسبوع =====
function getWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

// ===== تحميل مكتبة خارجية =====
function loadScript(url, callback) {
    const script = document.createElement('script');
    script.src = url;
    script.onload = callback;
    script.onerror = function() {
        showToast('❌ فشل تحميل المكتبة، تأكد من الاتصال بالإنترنت', true);
    };
    document.head.appendChild(script);
}

// ===== استيراد ملف =====
function importNoteFile() {
    const input = document.getElementById('noteFileInput');
    if (!input || !input.files || !input.files[0]) {
        showToast('⚠️ يرجى اختيار ملف أولاً', true);
        return;
    }
    
    const file = input.files[0];
    const fileName = file.name;
    const fileType = file.name.split('.').pop().toLowerCase();
    const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'];
    
    const reader = new FileReader();
    
    // ===== الصور =====
    if (imageTypes.includes(fileType)) {
        reader.readAsDataURL(file);
        reader.onload = function(e) {
            try {
                const imageData = e.target.result;
                const imgHtml = `<img src="${imageData}" style="max-width:100%; max-height:400px; border-radius:8px; margin:10px 0;" alt="${fileName}">`;
                
                const contentEl = document.getElementById('noteContent');
                const titleEl = document.getElementById('noteTitle');
                const typeEl = document.getElementById('noteType');
                const attachmentEl = document.getElementById('noteAttachment');
                
                if (contentEl) contentEl.value = imgHtml;
                if (titleEl) titleEl.value = fileName.replace(/\.[^/.]+$/, '');
                if (typeEl) typeEl.value = 'image';
                if (attachmentEl) {
                    attachmentEl.value = JSON.stringify({
                        name: fileName,
                        type: 'image',
                        data: imageData
                    });
                }
                
                showToast('✅ تم استيراد الصورة بنجاح!');
            } catch(err) {
                showToast('❌ خطأ في قراءة الصورة: ' + err.message, true);
            }
        };
        return;
    }
    
    // ===== ملفات PDF =====
    if (fileType === 'pdf') {
        reader.readAsDataURL(file);
        reader.onload = function(e) {
            try {
                const pdfData = e.target.result;
                const pdfHtml = `<div style="border:1px solid #dee2e6; border-radius:8px; padding:15px; margin:10px 0; background:#f8f9fa;">
                    <i class="fas fa-file-pdf" style="color:#dc3545; font-size:24px;"></i>
                    <a href="${pdfData}" target="_blank" style="margin-right:10px; color:#0d6efd;">📄 ${fileName}</a>
                    <small style="color:#6c757d;">(اضغط للتحميل)</small>
                </div>`;
                
                const contentEl = document.getElementById('noteContent');
                const titleEl = document.getElementById('noteTitle');
                const typeEl = document.getElementById('noteType');
                const attachmentEl = document.getElementById('noteAttachment');
                
                if (contentEl) contentEl.value = pdfHtml;
                if (titleEl) titleEl.value = fileName.replace(/\.[^/.]+$/, '');
                if (typeEl) typeEl.value = 'document';
                if (attachmentEl) {
                    attachmentEl.value = JSON.stringify({
                        name: fileName,
                        type: 'pdf',
                        data: pdfData
                    });
                }
                
                showToast('✅ تم استيراد PDF بنجاح!');
            } catch(err) {
                showToast('❌ خطأ في قراءة PDF: ' + err.message, true);
            }
        };
        return;
    }
    
    // ===== ملفات DOCX =====
    if (fileType === 'docx') {
        if (typeof mammoth === 'undefined') {
            showToast('⏳ جاري تحميل مكتبة DOCX...', false);
            loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js', function() {
                setTimeout(() => importNoteFile(), 500);
            });
            return;
        }
        
        reader.readAsArrayBuffer(file);
        reader.onload = function(e) {
            try {
                const arrayBuffer = e.target.result;
                mammoth.extractRawText({ arrayBuffer: arrayBuffer })
                    .then(function(result) {
                        const text = result.value;
                        const contentEl = document.getElementById('noteContent');
                        const titleEl = document.getElementById('noteTitle');
                        const typeEl = document.getElementById('noteType');
                        
                        if (contentEl) contentEl.value = text;
                        if (titleEl) titleEl.value = fileName.replace(/\.[^/.]+$/, '');
                        if (typeEl) typeEl.value = 'text';
                        
                        showToast('✅ تم استيراد DOCX بنجاح!');
                    })
                    .catch(function(err) {
                        showToast('❌ خطأ في قراءة DOCX: ' + err.message, true);
                    });
            } catch(err) {
                showToast('❌ خطأ في قراءة الملف: ' + err.message, true);
            }
        };
        return;
    }
    
    // ===== ملفات TXT =====
    if (fileType === 'txt') {
        reader.readAsText(file, 'UTF-8');
        reader.onload = function(e) {
            try {
                const text = e.target.result;
                const contentEl = document.getElementById('noteContent');
                const titleEl = document.getElementById('noteTitle');
                const typeEl = document.getElementById('noteType');
                
                if (contentEl) contentEl.value = text;
                if (titleEl) titleEl.value = fileName.replace(/\.[^/.]+$/, '');
                if (typeEl) typeEl.value = 'text';
                
                showToast('✅ تم استيراد الملف بنجاح!');
            } catch(err) {
                showToast('❌ خطأ في قراءة الملف: ' + err.message, true);
            }
        };
        return;
    }
    
    showToast('⚠️ صيغة ملف غير مدعومة: ' + fileType, true);
}

// ===== حفظ المذكرة في MongoDB =====
async function saveNote() {
    const titleEl = document.getElementById('noteTitle');
    const contentEl = document.getElementById('noteContent');
    const dateEl = document.getElementById('noteDate');
    const typeEl = document.getElementById('noteType');
    const attachmentEl = document.getElementById('noteAttachment');
    
    if (!titleEl || !contentEl || !dateEl) {
        showToast('⚠️ خطأ في تحميل نموذج المذكرة', true);
        return;
    }
    
    const title = titleEl.value.trim();
    const content = contentEl.value;
    const date = dateEl.value;
    const type = typeEl ? typeEl.value : 'text';
    const attachmentData = attachmentEl ? attachmentEl.value : '';
    
    if (!title || !content) {
        showToast('⚠️ يرجى إدخال عنوان ونص المذكرة', true);
        return;
    }
    
    if (!date) {
        showToast('⚠️ يرجى اختيار تاريخ المذكرة', true);
        return;
    }
    
    // ✅ حساب الأسبوع تلقائياً من التاريخ
    const selectedDate = new Date(date);
    const week = getWeekNumber(selectedDate);
    const time = getCurrentTime();
    
    let attachments = [];
    if (attachmentData) {
        try {
            const att = JSON.parse(attachmentData);
            attachments.push(att);
        } catch(e) {}
    }
    
    const noteData = {
        title: title,
        content: content,
        date: date,
        time: time,
        week: week.toString(),
        type: type,
        attachments: attachments
    };
    
    try {
        const response = await fetch('/api/notes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify(noteData)
        });
        
        if (!response.ok) {
            throw new Error(await response.text());
        }
        
        const savedNote = await response.json();
        showToast('✅ تم حفظ المذكرة في قاعدة البيانات!');
        
        // ✅ عرض النتيجة في نفس الصفحة
        const resultTitle = document.getElementById('noteResultTitle');
        const resultContent = document.getElementById('noteResultContent');
        const resultDate = document.getElementById('noteResultDate');
        const resultContainer = document.getElementById('noteResult');
        
        if (resultTitle) resultTitle.textContent = title;
        if (resultContent) resultContent.innerHTML = content;
        if (resultDate) resultDate.textContent = `📅 ${date} - 🕐 ${time} | الأسبوع: ${week}`;
        if (resultContainer) resultContainer.style.display = 'block';
        
        // ✅ تحديث صفحة النجاعة (آخر Note Verbale)
        await loadLatestNote();
        await loadNotesByWeek();
        
        if (attachmentEl) attachmentEl.value = '';
        const fileInput = document.getElementById('noteFileInput');
        if (fileInput) fileInput.value = '';
        
    } catch(error) {
        showToast('❌ خطأ في الحفظ: ' + error.message, true);
    }
}

// ===== تحميل آخر مذكرة (لصفحة النجاعة) =====
async function loadLatestNote() {
    if (!currentUser) return;
    
    try {
        const response = await fetch('/api/notes/latest', {
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(await response.text());
        }
        
        const note = await response.json();
        const container = document.getElementById('latestNoteContainer');
        if (!container) return;
        
        if (note && note._id) {
            const titleEl = document.getElementById('latestNoteTitle');
            const contentEl = document.getElementById('latestNoteContent');
            const dateEl = document.getElementById('latestNoteDate');
            const attachmentsEl = document.getElementById('latestNoteAttachments');
            
            if (titleEl) titleEl.textContent = note.title;
            if (contentEl) contentEl.innerHTML = note.content;
            if (dateEl) dateEl.textContent = `📅 ${note.date} | الأسبوع: ${note.week} | 👤 ${note.createdBy}`;
            container.style.display = 'block';
            
            if (attachmentsEl && note.attachments && note.attachments.length > 0) {
                let attHtml = '<div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">';
                note.attachments.forEach(att => {
                    if (att.type === 'image') {
                        attHtml += `<img src="${att.data}" style="max-width:80px; max-height:80px; border-radius:8px; border:1px solid #dee2e6;">`;
                    } else if (att.type === 'pdf') {
                        attHtml += `<a href="${att.data}" target="_blank" style="border:1px solid #dee2e6; border-radius:8px; padding:8px 12px; text-decoration:none; color:#0d6efd; font-size:12px;">
                            <i class="fas fa-file-pdf" style="color:#dc3545;"></i> ${att.name}
                        </a>`;
                    }
                });
                attHtml += '</div>';
                attachmentsEl.innerHTML = attHtml;
                attachmentsEl.style.display = 'block';
            } else if (attachmentsEl) {
                attachmentsEl.style.display = 'none';
            }
        } else {
            container.style.display = 'none';
        }
    } catch(error) {
        console.error('❌ خطأ في تحميل آخر مذكرة:', error);
    }
}

// ===== تحميل المذكرات حسب الفلتر =====
async function loadNotesByWeek() {
    const week = document.getElementById('filterWeek').value;
    const limit = document.getElementById('filterLimit').value || 10;
    
    if (!week) {
        showToast('⚠️ يرجى تحديد الأسبوع للبحث', true);
        return;
    }
    
    try {
        const response = await fetch(`/api/notes?week=${week}&limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(await response.text());
        }
        
        const notes = await response.json();
        renderNotesList(notes);
        
    } catch(error) {
        showToast('❌ خطأ في تحميل المذكرات: ' + error.message, true);
    }
}

// ===== عرض المذكرات =====
function renderNotesList(notes) {
    const container = document.getElementById('notesListContainer');
    if (!container) return;
    
    if (notes.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#6c757d; padding:20px;">لا توجد مذكرات في هذا الأسبوع</p>';
        return;
    }
    
    let html = '<div style="max-height:500px; overflow-y:auto;">';
    notes.forEach((note, index) => {
        html += `
            <div style="border:1px solid #e9ecef; border-radius:8px; padding:15px; margin-bottom:10px; background:white;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
                    <h4 style="color:#0d6efd; margin:0;">${index + 1}. ${note.title}</h4>
                    <small style="color:#6c757d;">📅 ${note.date} | 🕐 ${note.time}</small>
                </div>
                <div style="margin-top:10px; color:#495057; font-size:14px; line-height:1.8; max-height:100px; overflow:hidden;">
                    ${note.content.substring(0, 200)}${note.content.length > 200 ? '...' : ''}
                </div>
                <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap; align-items:center;">
                    <small style="color:#6c757d;">👤 ${note.createdBy} | ${note.userRole}</small>
                    <button class="btn btn-sm btn-danger" onclick="deleteNote('${note._id}')">🗑️ حذف</button>
                    <button class="btn btn-sm btn-info" onclick="viewNote('${note._id}')">👁️ عرض</button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

// ===== عرض مذكرة كاملة =====
async function viewNote(noteId) {
    try {
        const response = await fetch(`/api/notes?limit=100`, {
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(await response.text());
        }
        
        const notes = await response.json();
        const note = notes.find(n => n._id === noteId);
        
        if (note) {
            const titleEl = document.getElementById('noteTitle');
            const contentEl = document.getElementById('noteContent');
            const dateEl = document.getElementById('noteDate');
            const resultTitle = document.getElementById('noteResultTitle');
            const resultContent = document.getElementById('noteResultContent');
            const resultDate = document.getElementById('noteResultDate');
            const resultContainer = document.getElementById('noteResult');
            
            if (titleEl) titleEl.value = note.title;
            if (contentEl) contentEl.value = note.content;
            if (dateEl) dateEl.value = note.date;
            if (resultTitle) resultTitle.textContent = note.title;
            if (resultContent) resultContent.innerHTML = note.content;
            if (resultDate) resultDate.textContent = `📅 ${note.date} - 🕐 ${note.time} | الأسبوع: ${note.week}`;
            if (resultContainer) resultContainer.style.display = 'block';
            
            showToast('📄 تم تحميل المذكرة');
        }
    } catch(error) {
        showToast('❌ خطأ في تحميل المذكرة: ' + error.message, true);
    }
}

// ===== حذف مذكرة =====
async function deleteNote(noteId) {
    if (!confirm('هل أنت متأكد من حذف هذه المذكرة؟')) return;
    
    try {
        const response = await fetch(`/api/notes/${noteId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(await response.text());
        }
        
        showToast('✅ تم حذف المذكرة');
        await loadNotesByWeek();
        await loadLatestNote();
        
    } catch(error) {
        showToast('❌ خطأ في الحذف: ' + error.message, true);
    }
}

// ===== تصدير PDF =====
function exportNotePDF() {
    const titleEl = document.getElementById('noteResultTitle');
    const contentEl = document.getElementById('noteResultContent');
    const dateEl = document.getElementById('noteDate');
    
    const title = titleEl ? titleEl.textContent : document.getElementById('noteTitle').value.trim();
    const content = contentEl ? contentEl.innerHTML : document.getElementById('noteContent').value;
    const date = dateEl ? dateEl.value : getCurrentDate();
    const time = getCurrentTime();
    
    if (!title || !content) {
        showToast('⚠️ لا توجد مذكرة للتصدير', true);
        return;
    }
    
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
        showToast('⚠️ يرجى السماح بالنوافذ المنبثقة', true);
        return;
    }
    
    const user = currentUser?.name || 'مسؤول';
    const role = currentUser?.role || '';
    
    win.document.write(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head><meta charset="UTF-8"><title>Note Verbale</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Cairo', 'Segoe UI', Arial, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 40px 20px; direction: rtl; }
            .document { background: white; width: 210mm; min-height: 297mm; padding: 25mm 20mm; box-shadow: 0 4px 20px rgba(0,0,0,0.15); border-radius: 4px; position: relative; }
            .header { text-align: center; border-bottom: 3px solid #1a3a5c; padding-bottom: 12px; margin-bottom: 25px; }
            .header .logo { font-size: 28px; color: #1a3a5c; font-weight: 800; }
            .header .sub { font-size: 14px; color: #6c757d; margin-top: 2px; }
            .header .ref { font-size: 12px; color: #6c757d; margin-top: 5px; }
            .note-title { font-size: 20px; font-weight: 700; color: #0d6efd; border-right: 5px solid #0d6efd; padding-right: 15px; margin: 20px 0 15px 0; }
            .note-content { font-size: 15px; line-height: 2.2; padding: 15px 5px; background: #fafbfc; border-radius: 6px; min-height: 200px; word-wrap: break-word; margin-bottom: 20px; }
            .note-content img { max-width: 100%; max-height: 400px; border-radius: 8px; margin: 10px 0; }
            .footer { margin-top: 30px; padding-top: 15px; border-top: 2px solid #dee2e6; display: flex; justify-content: space-between; font-size: 12px; color: #6c757d; flex-wrap: wrap; gap: 10px; }
            .footer .signature { text-align: left; font-weight: 600; }
            .footer .signature span { display: block; margin-top: 5px; font-weight: 400; font-size: 11px; color: #6c757d; }
            .footer .date-info { text-align: right; }
            .print-actions { text-align: center; margin-top: 25px; padding-top: 15px; border-top: 1px solid #dee2e6; }
            .print-actions button { padding: 10px 30px; margin: 0 8px; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; }
            .print-actions .btn-print { background: #0d6efd; color: white; }
            .print-actions .btn-close { background: #dc3545; color: white; }
            @media print { body { background: white; padding: 0; } .document { width: 100%; min-height: auto; padding: 20mm 15mm; box-shadow: none; border-radius: 0; } .print-actions { display: none; } .no-print { display: none !important; } }
        </style>
        </head>
        <body>
            <div class="document">
                <div class="header">
                    <div class="logo">⚓ منظومة الوسائل البحرية</div>
                    <div class="sub">الجمهورية التونسية - وزارة الدفاع الوطني</div>
                    <div class="ref">Note Verbale | 📅 ${date} - 🕐 ${time}</div>
                </div>
                <div class="note-title">📄 ${title}</div>
                <div class="note-content">${content}</div>
                <div class="footer">
                    <div class="date-info"><div>📅 ${date}</div><div>🕐 ${time}</div></div>
                    <div class="signature">${user}<span>${role}</span></div>
                </div>
                <div class="print-actions no-print">
                    <button class="btn-print" onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
                    <button class="btn-close" onclick="window.close()">✖ إغلاق</button>
                </div>
            </div>
            <script>setTimeout(() => { window.print(); }, 800);<\/script>
        </body>
        </html>
    `);
    win.document.close();
    showToast('📄 جاري فتح المذكرة للطباعة...');
}

// ===== تصدير Word =====
function exportNoteWord() {
    const titleEl = document.getElementById('noteResultTitle');
    const contentEl = document.getElementById('noteResultContent');
    const dateEl = document.getElementById('noteDate');
    
    const title = titleEl ? titleEl.textContent : document.getElementById('noteTitle').value.trim();
    const content = contentEl ? contentEl.innerHTML : document.getElementById('noteContent').value;
    const date = dateEl ? dateEl.value : getCurrentDate();
    const time = getCurrentTime();
    
    if (!title || !content) {
        showToast('⚠️ لا توجد مذكرة للتصدير', true);
        return;
    }
    
    const user = currentUser?.name || 'مسؤول';
    const role = currentUser?.role || '';
    
    const html = `
        <html dir="rtl" xmlns:o="urn:schemas-microsoft-com:office:office" 
              xmlns:w="urn:schemas-microsoft-com:office:word" 
              xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="UTF-8"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><title>Note Verbale</title>
        <style>
            @page { size: A4; margin: 2.5cm 2cm; }
            body { font-family: 'Cairo', 'Segoe UI', Arial, sans-serif; direction: rtl; font-size: 14px; line-height: 1.8; padding: 0; }
            .header { text-align: center; border-bottom: 3px solid #1a3a5c; padding-bottom: 12px; margin-bottom: 25px; }
            .header h1 { font-size: 22px; color: #1a3a5c; margin: 0; }
            .header .sub { font-size: 13px; color: #6c757d; margin-top: 2px; }
            .header .ref { font-size: 12px; color: #6c757d; margin-top: 5px; }
            .note-title { font-size: 18px; font-weight: 700; color: #0d6efd; border-right: 4px solid #0d6efd; padding-right: 12px; margin: 20px 0 15px 0; }
            .note-content { font-size: 14px; line-height: 2; padding: 15px 5px; background: #f8f9fa; border-radius: 4px; word-wrap: break-word; margin-bottom: 20px; }
            .note-content img { max-width: 100%; max-height: 400px; border-radius: 8px; margin: 10px 0; }
            .footer { margin-top: 30px; padding-top: 15px; border-top: 2px solid #dee2e6; display: flex; justify-content: space-between; font-size: 12px; color: #6c757d; }
            .footer .signature { text-align: left; font-weight: 600; }
            .footer .signature span { display: block; font-weight: 400; font-size: 11px; }
            .footer .date-info { text-align: right; }
        </style>
        </head>
        <body>
            <div class="header"><h1>⚓ منظومة الوسائل البحرية</h1><div class="sub">الجمهورية التونسية - وزارة الدفاع الوطني</div><div class="ref">Note Verbale | 📅 ${date} - 🕐 ${time}</div></div>
            <div class="note-title">📄 ${title}</div>
            <div class="note-content">${content}</div>
            <div class="footer"><div class="date-info">📅 ${date} | 🕐 ${time}</div><div class="signature">${user}<span>${role}</span></div></div>
        </body>
        </html>
    `;
    
    const blob = new Blob([html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Note_Verbale_${date.replace(/\//g, '-')}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('📄 تم تصدير المذكرة كـ Word بنجاح!');
}

// ===== مسح المذكرة =====
function clearNote() {
    const titleEl = document.getElementById('noteTitle');
    const contentEl = document.getElementById('noteContent');
    const dateEl = document.getElementById('noteDate');
    const resultEl = document.getElementById('noteResult');
    const fileInput = document.getElementById('noteFileInput');
    const typeEl = document.getElementById('noteType');
    const attachmentEl = document.getElementById('noteAttachment');
    
    if (titleEl) titleEl.value = '';
    if (contentEl) contentEl.value = '';
    if (dateEl) dateEl.value = '';
    if (resultEl) resultEl.style.display = 'none';
    if (fileInput) fileInput.value = '';
    if (typeEl) typeEl.value = 'text';
    if (attachmentEl) attachmentEl.value = '';
    
    showToast('🗑️ تم مسح المذكرة');
}

// ============================================================
// ===== تصدير تقرير النجاعة =====
// ============================================================

function exportEfficiencyReport() {
    const statsCards = document.getElementById('statsCards');
    const generalTable = document.getElementById('generalEffTableContainer');
    const regionTables = document.getElementById('regionTables');
    
    if (!statsCards || !generalTable) {
        showToast('⚠️ لا توجد بيانات للتصدير', true);
        return;
    }
    
    const win = window.open('', '_blank', 'width=1000,height=800');
    if (!win) {
        showToast('⚠️ يرجى السماح بالنوافذ المنبثقة', true);
        return;
    }
    
    const user = currentUser?.name || 'مسؤول';
    const date = new Date().toLocaleString('ar-EG');
    
    win.document.write(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head><meta charset="UTF-8"><title>تقرير جاهزية الأسطول</title>
        <style>
            body { font-family: 'Cairo', 'Segoe UI', Arial, sans-serif; padding: 30px; max-width: 1100px; margin: auto; direction: rtl; background: white; }
            .header { text-align: center; border-bottom: 3px solid #1a3a5c; padding-bottom: 15px; margin-bottom: 25px; }
            .header h1 { color: #1a3a5c; font-size: 26px; margin: 0; }
            .header .sub { color: #6c757d; font-size: 14px; }
            .header .user { font-size: 13px; color: #0d6efd; margin-top: 5px; }
            .stats { display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; margin: 20px 0; }
            .stat-box { background: #f8f9fa; padding: 15px 30px; border-radius: 10px; text-align: center; border: 1px solid #dee2e6; }
            .stat-box .num { font-size: 28px; font-weight: bold; color: #0d6efd; }
            .stat-box .label { font-size: 14px; color: #6c757d; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px; min-width: 900px; }
            th { background: #1a3a5c; color: white; padding: 10px; text-align: center; }
            td { padding: 8px 12px; text-align: center; border-bottom: 1px solid #dee2e6; }
            tr:nth-child(even) { background: #f8f9fa; }
            .region-title { background: #e9ecef; padding: 10px; font-weight: bold; margin-top: 20px; border-right: 4px solid #1a3a5c; }
            .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #dee2e6; text-align: center; color: #6c757d; font-size: 12px; }
            .status-صالح { color: #28a745; font-weight: bold; }
            .status-معطب { color: #dc3545; font-weight: bold; }
            .status-صيانة { color: #ffc107; font-weight: bold; }
            .high-eff { background: #d1e7dd !important; }
            .mid-eff { background: #fff3cd !important; }
            .low-eff { background: #f8d7da !important; }
            .btn-print { background: #0d6efd; color: white; border: none; padding: 12px 30px; border-radius: 8px; cursor: pointer; font-size: 16px; margin: 10px; }
            .btn-close { background: #dc3545; color: white; border: none; padding: 12px 30px; border-radius: 8px; cursor: pointer; font-size: 16px; margin: 10px; }
            .scrollable-table { overflow-x: auto; }
            @media print { .no-print { display: none; } body { padding: 15px; } }
        </style>
        </head>
        <body>
            <div class="header"><h1>⚓ منظومة الوسائل البحرية</h1><div class="sub">تقرير جاهزية الأسطول</div><div class="user">👤 ${user} | 📅 ${date}</div></div>
            <div class="stats">${statsCards.innerHTML}</div>
            <div class="scrollable-table">${generalTable.innerHTML}${regionTables?.innerHTML || ''}</div>
            <div class="footer">📅 ${date} | 👤 ${user}</div>
            <div class="no-print" style="text-align:center; margin-top:20px;">
                <button class="btn-print" onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
                <button class="btn-close" onclick="window.close()">✖ إغلاق</button>
            </div>
            <script>setTimeout(() => { window.print(); }, 1000);<\/script>
        </body>
        </html>
    `);
    win.document.close();
    showToast('📄 جاري فتح تقرير النجاعة...');
}

// ============================================================
// ✅ تصدير الدوال
// ============================================================

window.showToast = showToast;
window.scrollToTop = scrollToTop;
window.scrollToBottom = scrollToBottom;
window.formatDate = formatDate;
window.getCat = getCat;
window.canEdit = canEdit;
window.canDelete = canDelete;
window.canManageUsers = canManageUsers;
window.getCurrentDate = getCurrentDate;
window.getCurrentTime = getCurrentTime;
window.importNoteFile = importNoteFile;
window.saveNote = saveNote;
window.exportNotePDF = exportNotePDF;
window.exportNoteWord = exportNoteWord;
window.clearNote = clearNote;
window.loadLatestNote = loadLatestNote;
window.loadNotesByWeek = loadNotesByWeek;
window.deleteNote = deleteNote;
window.viewNote = viewNote;
window.exportEfficiencyReport = exportEfficiencyReport;

console.log('✅ utils.js تم تحميله بنجاح');
