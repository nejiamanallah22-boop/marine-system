// ==================== دوال مساعدة ====================

// ===== التمرير =====
function scrollToTop() { 
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
}

function scrollToBottom() { 
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); 
}

// ===== الإشعارات (Toast) =====
function showToast(message, isError = false) {
    // ✅ إزالة أي إشعار قديم
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
    
    // ✅ إزالة بعد 4 ثواني
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

// ===== تصنيف المركب حسب الطول =====
function getCat(len) { 
    let n = parseFloat(len); 
    if(n === 11) return "البروق"; 
    if(n >= 8 && n <= 12) return "صقور"; 
    if(n > 12 && n <= 25) return "خوافر"; 
    if(n > 30) return "طوافات"; 
    return "زوارق مزدوجة"; 
}

// ===== صلاحيات المستخدم =====
function canEdit() { 
    return currentUser && (currentUser.role === "مسؤول" || currentUser.role === "محرر"); 
}

function canDelete() { 
    return currentUser && currentUser.role === "مسؤول"; 
}

function canManageUsers() { 
    return currentUser && currentUser.role === "مسؤول"; 
}

// ===== الحصول على التاريخ والوقت الحالي =====
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
// ===== دوال Note Verbale =====
// ============================================================

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
    
    // حفظ في localStorage
    localStorage.setItem('marineNote', JSON.stringify(noteData));
    
    // عرض النتيجة
    document.getElementById('noteResultTitle').textContent = `📄 ${title}`;
    document.getElementById('noteResultContent').textContent = content;
    document.getElementById('noteResultDate').textContent = `🕐 تم الحفظ: ${getCurrentDate()} - ${getCurrentTime()}`;
    document.getElementById('noteResult').style.display = 'block';
    
    showToast('✅ تم حفظ المذكرة بنجاح!');
}

// ===== تصدير PDF (بدون مكتبة خارجية) =====
function exportNotePDF() {
    const title = document.getElementById('noteTitle').value.trim();
    const content = document.getElementById('noteContent').value.trim();
    
    if (!title || !content) {
        showToast('⚠️ لا توجد مذكرة لتصديرها', true);
        return;
    }
    
    // ✅ استخدام window.print() مع تنسيق خاص
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
        showToast('⚠️ يرجى السماح بالنوافذ المنبثقة', true);
        return;
    }
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>Note Verbale</title>
            <style>
                body {
                    font-family: 'Cairo', 'Segoe UI', Arial, sans-serif;
                    padding: 40px;
                    max-width: 800px;
                    margin: auto;
                    direction: rtl;
                    background: white;
                }
                .header {
                    border-bottom: 3px solid #1a3a5c;
                    padding-bottom: 15px;
                    margin-bottom: 20px;
                    text-align: center;
                }
                .header h1 {
                    color: #1a3a5c;
                    font-size: 24px;
                    margin: 0;
                }
                .header .sub {
                    color: #6c757d;
                    font-size: 14px;
                }
                .title {
                    font-size: 22px;
                    font-weight: bold;
                    margin: 20px 0;
                    color: #0d6efd;
                    border-right: 4px solid #0d6efd;
                    padding-right: 15px;
                }
                .content {
                    font-size: 16px;
                    line-height: 2;
                    margin: 20px 0;
                    padding: 20px;
                    background: #f8f9fa;
                    border-radius: 8px;
                }
                .footer {
                    margin-top: 30px;
                    padding-top: 15px;
                    border-top: 1px solid #dee2e6;
                    font-size: 12px;
                    color: #6c757d;
                    text-align: center;
                }
                @media print {
                    body { padding: 20px; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>⚓ منظومة الوسائل البحرية</h1>
                <div class="sub">Note Verbale</div>
            </div>
            <div class="title">${title}</div>
            <div class="content">${content.replace(/\n/g, '<br>')}</div>
            <div class="footer">
                📅 ${getCurrentDate()} | 🕐 ${getCurrentTime()}<br>
                ${document.getElementById('userRoleDisplay')?.textContent || 'مسؤول'}
            </div>
            <div class="no-print" style="text-align:center; margin-top:20px;">
                <button onclick="window.print()" style="padding:12px 30px; background:#0d6efd; color:white; border:none; border-radius:8px; cursor:pointer; font-size:16px;">
                    🖨️ طباعة / حفظ PDF
                </button>
                <button onclick="window.close()" style="padding:12px 30px; background:#dc3545; color:white; border:none; border-radius:8px; cursor:pointer; font-size:16px; margin-right:10px;">
                    ✖ إغلاق
                </button>
            </div>
            <script>
                // طباعة تلقائية بعد 1 ثانية
                setTimeout(() => {
                    window.print();
                }, 1000);
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
    
    showToast('📄 جاري فتح المذكرة للطباعة...');
}

// ===== مسح المذكرة =====
function clearNote() {
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').value = '';
    document.getElementById('noteResult').style.display = 'none';
    localStorage.removeItem('marineNote');
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
                document.getElementById('noteResultTitle').textContent = `📄 ${note.title}`;
                document.getElementById('noteResultContent').textContent = note.content;
                document.getElementById('noteResultDate').textContent = `🕐 تم الحفظ: ${note.date || ''} - ${note.time || ''}`;
                document.getElementById('noteResult').style.display = 'block';
            }
        }
    } catch(e) {
        console.log('لا توجد مذكرة محفوظة');
    }
}

// ===== تحميل المذكرة عند فتح الصفحة =====
document.addEventListener('DOMContentLoaded', function() {
    loadSavedNote();
});

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
window.saveNote = saveNote;
window.exportNotePDF = exportNotePDF;
window.clearNote = clearNote;
window.loadSavedNote = loadSavedNote;

console.log('✅ utils.js تم تحميله بنجاح');
