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
// ===== Note Verbale (مع MongoDB) =====
// ============================================================

// ===== استيراد ملف =====
function importNoteFile() {
    const input = document.getElementById('noteFileInput');
    if (!input || !input.files || !input.files[0]) {
        showToast('⚠️ يرجى اختيار ملف أولاً', true);
        return;
    }
    
    const file = input.files[0];
    const fileName = file.name.toLowerCase();
    const fileType = fileName.split('.').pop();
    const imageTypes = ['jpg', 'jpeg', 'png',
