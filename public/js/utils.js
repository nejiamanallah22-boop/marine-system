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
// ===== Note Verbale (نسخة احترافية) =====
// ============================================================

// ===== استيراد ملف =====
function importNoteFile() {
    const input = document.getElementById('noteFileInput');
    if (!input || !input.files || !input.files[0]) {
        showToast('⚠️ يرجى اختيار ملف أولاً', true);
        return;
    }
    
    const file = input.files[0];
    const reader = new FileReader();
    reader.readAsText(file, 'UTF-8');
    
    reader.onload = function(e) {
        try {
            let text = e.target.result;
            text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
            
            const lines = text.split('\n').filter(line => line.trim());
            let title = '';
            let content = '';
            
            if (lines.length > 0) {
                title = lines[0].trim();
                content = lines.slice(1).join('\n').trim();
            }
            
            if (title) document.getElementById('noteTitle').value = title;
            if (content) document.getElementById('noteContent').value = content;
            
            showToast('✅ تم استيراد الملف بنجاح!');
            setTimeout(() => saveNote(), 500);
            
        } catch(err) {
            showToast('❌ خطأ في قراءة الملف: ' + err.message, true);
        }
    };
    
    reader.onerror = function() {
        showToast('❌ خطأ في تحميل الملف', true);
    };
}

// ===== حفظ المذكرة =====
function saveNote() {
    const title = document.getElementById('noteTitle').value.trim();
    const content = document.getElementById('noteContent').value.trim();
    
    if (!title || !content) {
        showToast('⚠️ يرجى إدخال عنوان ونص المذكرة', true);
        return;
    }
    
    const noteData = {
        title: title,
        content: content,
        date: getCurrentDate(),
        time: getCurrentTime()
    };
    
    localStorage.setItem('marineNote', JSON.stringify(noteData));
    
    document.getElementById('noteResultTitle').textContent = title;
    document.getElementById('noteResultContent').textContent = content;
    document.getElementById('noteResultDate').textContent = `📅 ${noteData.date} - 🕐 ${noteData.time}`;
    document.getElementById('noteResult').style.display = 'block';
    
    showToast('✅ تم حفظ المذكرة بنجاح!');
}

// ===== تصدير PDF =====
function exportNotePDF() {
    const title = document.getElementById('noteTitle').value.trim();
    const content = document.getElementById('noteContent').value.trim();
    
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
    const date = getCurrentDate();
    const time = getCurrentTime();
    
    win.document.write(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>Note Verbale</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Cairo', 'Segoe UI', 'Arial', sans-serif;
                    background: #f5f5f5;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    padding: 40px 20px;
                    direction: rtl;
                }
                .document {
                    background: white;
                    width: 210mm;
                    min-height: 297mm;
                    padding: 25mm 20mm;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                    border-radius: 4px;
                    position: relative;
                }
                .header {
                    text-align: center;
                    border-bottom: 3px solid #1a3a5c;
                    padding-bottom: 12px;
                    margin-bottom: 25px;
                }
                .header .logo {
                    font-size: 28px;
                    color: #1a3a5c;
                    font-weight: 800;
                }
                .header .sub {
                    font-size: 14px;
                    color: #6c757d;
                    margin-top: 2px;
                }
                .header .ref {
                    font-size: 12px;
                    color: #6c757d;
                    margin-top: 5px;
                }
                .note-title {
                    font-size: 20px;
                    font-weight: 700;
                    color: #0d6efd;
                    border-right: 5px solid #0d6efd;
                    padding-right: 15px;
                    margin: 20px 0 15px 0;
                    line-height: 1.4;
                }
                .note-content {
                    font-size: 15px;
                    line-height: 2.2;
                    padding: 15px 5px;
                    background: #fafbfc;
                    border-radius: 6px;
                    min-height: 200px;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    margin-bottom: 20px;
                }
                .footer {
                    margin-top: 30px;
                    padding-top: 15px;
                    border-top: 2px solid #dee2e6;
                    display: flex;
                    justify-content: space-between;
                    font-size: 12px;
                    color: #6c757d;
                    flex-wrap: wrap;
                    gap: 10px;
                }
                .footer .signature {
                    text-align: left;
                    font-weight: 600;
                }
                .footer .signature span {
                    display: block;
                    margin-top: 5px;
                    font-weight: 400;
                    font-size: 11px;
                    color: #6c757d;
                }
                .footer .date-info {
                    text-align: right;
                }
                .print-actions {
                    text-align: center;
                    margin-top: 25px;
                    padding-top: 15px;
                    border-top: 1px solid #dee2e6;
                }
                .print-actions button {
                    padding: 10px 30px;
                    margin: 0 8px;
                    border: none;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .print-actions .btn-print {
                    background: #0d6efd;
                    color: white;
                }
                .print-actions .btn-print:hover {
                    background: #0a58ca;
                }
                .print-actions .btn-close {
                    background: #dc3545;
                    color: white;
                }
                .print-actions .btn-close:hover {
                    background: #b02a37;
                }
                @media print {
                    body { background: white; padding: 0; }
                    .document {
                        width: 100%;
                        min-height: auto;
                        padding: 20mm 15mm;
                        box-shadow: none;
                        border-radius: 0;
                    }
                    .print-actions { display: none; }
                    .no-print { display: none !important; }
                }
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
                    <div class="date-info">
                        <div>📅 ${date}</div>
                        <div>🕐 ${time}</div>
                    </div>
                    <div class="signature">
                        ${user}
                        <span>${role}</span>
                    </div>
                </div>
                <div class="print-actions no-print">
                    <button class="btn-print" onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
                    <button class="btn-close" onclick="window.close()">✖ إغلاق</button>
                </div>
            </div>
            <script>
                setTimeout(() => { window.print(); }, 800);
            <\/script>
        </body>
        </html>
    `);
    win.document.close();
    showToast('📄 جاري فتح المذكرة للطباعة...');
}

// ===== تصدير Word =====
function exportNoteWord() {
    const title = document.getElementById('noteTitle').value.trim();
    const content = document.getElementById('noteContent').value.trim();
    
    if (!title || !content) {
        showToast('⚠️ لا توجد مذكرة للتصدير', true);
        return;
    }
    
    const user = currentUser?.name || 'مسؤول';
    const role = currentUser?.role || '';
    const date = getCurrentDate();
    const time = getCurrentTime();
    
    const html = `
        <html dir="rtl" xmlns:o="urn:schemas-microsoft-com:office:office" 
              xmlns:w="urn:schemas-microsoft-com:office:word" 
              xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
            <title>Note Verbale</title>
            <style>
                @page {
                    size: A4;
                    margin: 2.5cm 2cm;
                }
                body {
                    font-family: 'Cairo', 'Segoe UI', 'Arial', sans-serif;
                    direction: rtl;
                    font-size: 14px;
                    line-height: 1.8;
                    padding: 0;
                }
                .header {
                    text-align: center;
                    border-bottom: 3px solid #1a3a5c;
                    padding-bottom: 12px;
                    margin-bottom: 25px;
                }
                .header h1 {
                    font-size: 22px;
                    color: #1a3a5c;
                    margin: 0;
                }
                .header .sub {
                    font-size: 13px;
                    color: #6c757d;
                    margin-top: 2px;
                }
                .header .ref {
                    font-size: 12px;
                    color: #6c757d;
                    margin-top: 5px;
                }
                .note-title {
                    font-size: 18px;
                    font-weight: 700;
                    color: #0d6efd;
                    border-right: 4px solid #0d6efd;
                    padding-right: 12px;
                    margin: 20px 0 15px 0;
                }
                .note-content {
                    font-size: 14px;
                    line-height: 2;
                    padding: 15px 5px;
                    background: #f8f9fa;
                    border-radius: 4px;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    margin-bottom: 20px;
                }
                .footer {
                    margin-top: 30px;
                    padding-top: 15px;
                    border-top: 2px solid #dee2e6;
                    display: flex;
                    justify-content: space-between;
                    font-size: 12px;
                    color: #6c757d;
                }
                .footer .signature {
                    text-align: left;
                    font-weight: 600;
                }
                .footer .signature span {
                    display: block;
                    font-weight: 400;
                    font-size: 11px;
                }
                .footer .date-info {
                    text-align: right;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>⚓ منظومة الوسائل البحرية</h1>
                <div class="sub">الجمهورية التونسية - وزارة الدفاع الوطني</div>
                <div class="ref">Note Verbale | 📅 ${date} - 🕐 ${time}</div>
            </div>
            <div class="note-title">📄 ${title}</div>
            <div class="note-content">${content}</div>
            <div class="footer">
                <div class="date-info">📅 ${date} | 🕐 ${time}</div>
                <div class="signature">${user}<span>${role}</span></div>
            </div>
        </body>
        </html>
    `;
    
    const blob = new Blob([html], { 
        type: 'application/msword;charset=utf-8' 
    });
    
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
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').value = '';
    document.getElementById('noteResult').style.display = 'none';
    localStorage.removeItem('marineNote');
    document.getElementById('noteFileInput').value = '';
    showToast('🗑️ تم مسح المذكرة');
}

// ===== تحميل المذكرة المحفوظة =====
function loadSavedNote() {
    try {
        const saved = localStorage.getItem('marineNote');
        if (saved) {
            const note = JSON.parse(saved);
            document.getElementById('noteTitle').value = note.title || '';
            document.getElementById('noteContent').value = note.content || '';
            if (note.title && note.content) {
                document.getElementById('noteResultTitle').textContent = note.title;
                document.getElementById('noteResultContent').textContent = note.content;
                document.getElementById('noteResultDate').textContent = `📅 ${note.date || ''} - 🕐 ${note.time || ''}`;
                document.getElementById('noteResult').style.display = 'block';
            }
        }
    } catch(e) {
        console.log('لا توجد مذكرة محفوظة');
    }
}

// ===== تحميل عند فتح الصفحة =====
document.addEventListener('DOMContentLoaded', loadSavedNote);

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
        <head>
            <meta charset="UTF-8">
            <title>تقرير جاهزية الأسطول</title>
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
            <div class="header">
                <h1>⚓ منظومة الوسائل البحرية</h1>
                <div class="sub">تقرير جاهزية الأسطول</div>
                <div class="user">👤 ${user} | 📅 ${date}</div>
            </div>
            <div class="stats">
                ${statsCards.innerHTML}
            </div>
            <div class="scrollable-table">
                ${generalTable.innerHTML}
                ${regionTables?.innerHTML || ''}
            </div>
            <div class="footer">
                📅 ${date} | 👤 ${user}
            </div>
            <div class="no-print" style="text-align:center; margin-top:20px;">
                <button class="btn-print" onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
                <button class="btn-close" onclick="window.close()">✖ إغلاق</button>
            </div>
            <script>
                setTimeout(() => { window.print(); }, 1000);
            <\/script>
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
window.loadSavedNote = loadSavedNote;
window.exportEfficiencyReport = exportEfficiencyReport;

console.log('✅ utils.js تم تحميله بنجاح');
