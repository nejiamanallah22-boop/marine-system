
// ==================== دوال مساعدة ====================

function scrollToTop() { 
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
}

function scrollToBottom() { 
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); 
}

function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.background = isError ? '#d9534f' : '#2e7d32';
    toast.innerHTML = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

function formatDate(d) { 
    if(!d) return '-'; 
    try { 
        let date = new Date(d); 
        if(isNaN(date.getTime())) return d; 
        return `${date.getDate().toString().padStart(2,'0')}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getFullYear()}`; 
    } catch(e) { return d; } 
}

function getCat(len) { 
    let n = parseFloat(len); 
    if(n === 11) return "البروق"; 
    if(n >= 8 && n <= 12) return "صقور"; 
    if(n > 12 && n <= 25) return "خوافر"; 
    if(n > 30) return "طوافات"; 
    return "زوارق مزدوجة"; 
}

function canEdit() { 
    return currentUser && (currentUser.role === "مسؤول" || currentUser.role === "محرر"); 
}

function canDelete() { 
    return currentUser && currentUser.role === "مسؤول"; 
}

function canManageUsers() { 
    return currentUser && currentUser.role === "مسؤول"; 
}

function getCurrentDate() {
    const now = new Date();
    return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
}

function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

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
