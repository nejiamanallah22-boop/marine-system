// ============================================================
// المصادقة - النسخة المصححة
// ============================================================

// تأكد من أن الأزرار تعمل
document.addEventListener('DOMContentLoaded', function() {
    // إظهار شاشة الدخول
    const loginOverlay = document.getElementById('loginOverlay');
    const mainApp = document.getElementById('mainApp');
    
    if (loginOverlay) loginOverlay.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';
    
    // تنظيف localStorage
    localStorage.clear();
    
    // تنظيف الحقول
    const usernameField = document.getElementById('username');
    const passwordField = document.getElementById('password');
    if (usernameField) usernameField.value = '';
    if (passwordField) passwordField.value = '';
    
    // إضافة مستمع للضغط على Enter
    if (usernameField) {
        usernameField.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('password')?.focus();
            }
        });
    }
    if (passwordField) {
        passwordField.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                doLogin();
            }
        });
    }
    
    // محاولة الدخول التلقائي للاختبار (يمكنك إزالة هذا لاحقاً)
    console.log('✅ التطبيق جاهز، يرجى تسجيل الدخول');
});

// دالة الدخول المصححة
function doLogin() {
    console.log('🔄 محاولة تسجيل الدخول...');
    
    const username = document.getElementById('username')?.value?.trim();
    const password = document.getElementById('password')?.value?.trim();
    
    // التحقق من الحقول
    if (!username || !password) {
        showAlert('⚠️ الرجاء إدخال اسم المستخدم وكلمة المرور', 'warning');
        return;
    }
    
    // تعطيل الزر لمنع الضغط المتكرر
    const loginBtn = document.querySelector('#loginOverlay .login-btn');
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.textContent = '⏳ جاري الدخول...';
    }
    
    // بيانات الدخول الافتراضية للاختبار (إذا كان الخادم لا يعمل)
    // يمكنك إزالة هذا الجزء عند توصيل الخادم الحقيقي
    if (username === 'admin' && password === 'admin123') {
        console.log('✅ دخول تجريبي ناجح');
        const user = {
            id: 1,
            name: 'مدير النظام',
            role: 'مسؤول',
            email: 'admin@example.com'
        };
        localStorage.setItem('token', 'demo-token-12345');
        localStorage.setItem('user', JSON.stringify(user));
        currentUser = user;
        
        // إخفاء شاشة الدخول وإظهار التطبيق
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        
        updateUserDisplay();
        loadAllData();
        loadPage('fleet');
        showAlert('✅ تم تسجيل الدخول بنجاح (وضع التجربة)', 'success');
        
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = '🚀 دخول';
        }
        return;
    }
    
    // الاتصال بالخادم الحقيقي
    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ email: username, password: password })
    })
    .then(res => {
        console.log('📡 استجابة الخادم:', res.status);
        if (!res.ok) {
            throw new Error(`خطأ في الخادم: ${res.status}`);
        }
        return res.json();
    })
    .then(data => {
        console.log('📦 بيانات الاستجابة:', data);
        if (data.success) {
            // حفظ البيانات
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            currentUser = data.user;
            
            // إخفاء شاشة الدخول
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            
            // تحديث الواجهة
            updateUserDisplay();
            loadAllData();
            loadPage('fleet');
            showAlert('✅ تم تسجيل الدخول بنجاح', 'success');
        } else {
            showAlert('❌ ' + (data.error || 'بيانات الدخول غير صحيحة'), 'danger');
        }
    })
    .catch(err => {
        console.error('❌ خطأ في الدخول:', err);
        showAlert('❌ خطأ في الاتصال بالخادم: ' + err.message, 'danger');
    })
    .finally(() => {
        // إعادة تفعيل الزر
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = '🚀 دخول';
        }
    });
}

// دالة الخروج المصححة
function doLogout() {
    if (confirm('⚠️ هل أنت متأكد من تسجيل الخروج؟')) {
        localStorage.clear();
        // إعادة تحميل الصفحة
        location.reload();
    }
}

// ============================================================
// تحميل البيانات - النسخة المصححة (مع fallback)
// ============================================================

function loadAllData() {
    console.log('🔄 تحميل جميع البيانات...');
    loadVessels();
    loadMaintenance();
    loadTickets();
    loadNotes();
    loadUsers();
}

function loadVessels() {
    const token = getToken();
    if (!token) {
        console.warn('⚠️ لا يوجد رمز دخول');
        // استخدام بيانات تجريبية إذا لم يكن هناك خادم
        allVessels = getDemoVessels();
        renderMainTable();
        renderGeneralMaintenance();
        renderHistoryMaintenance();
        updateMaintenanceVessels();
        renderEfficiency();
        return;
    }
    
    fetch('/api/vessels', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => {
        if (!res.ok) throw new Error('فشل تحميل المراكب');
        return res.json();
    })
    .then(data => {
        allVessels = data || [];
        console.log('✅ تم تحميل المراكب:', allVessels.length);
        renderMainTable();
        renderGeneralMaintenance();
        renderHistoryMaintenance();
        updateMaintenanceVessels();
        renderEfficiency();
    })
    .catch(err => {
        console.error('❌ خطأ في تحميل المراكب:', err);
        // استخدام بيانات تجريبية في حالة الخطأ
        allVessels = getDemoVessels();
        renderMainTable();
        renderGeneralMaintenance();
        renderHistoryMaintenance();
        updateMaintenanceVessels();
        renderEfficiency();
    });
}

// ============================================================
// بيانات تجريبية للاختبار
// ============================================================

function getDemoVessels() {
    return [
        { id: 1, name: 'المركب 1', num: '001', len: 25, cat: 'صيد', reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: 'الوحدة 1', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-001', repairer: 'فني 1' },
        { id: 2, name: 'المركب 2', num: '002', len: 30, cat: 'نقل', reg: 'الساحل', zone: 'سوسة', port: 'سوسة', supp: 'الوحدة 2', stat: 'معطب', break: 'عطل في المحرك', fDate: '2026-01-15', eDate: '2026-12-31', ref: 'REF-002', repairer: 'فني 2' },
        { id: 3, name: 'المركب 3', num: '003', len: 20, cat: 'صيد', reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: 'الوحدة 3', stat: 'صيانة', break: 'صيانة دورية', fDate: '2026-02-01', eDate: '2026-12-31', ref: 'REF-003', repairer: 'فني 3' }
    ];
}

// ============================================================
// دوال إضافية مفقودة
// ============================================================

// دالة لتحديث عرض المستخدم
function updateUserDisplay() {
    const display = document.getElementById('userRoleDisplay');
    if (display && currentUser) {
        const roleEmojis = {
            'مسؤول': '👑',
            'مشرف': '⭐',
            'محرر': '✏️',
            'مشاهد': '👀'
        };
        display.innerHTML = `
            <i class="fas fa-user-circle"></i> 
            ${currentUser.name} 
            <span style="font-size:12px; background:#e9ecef; padding:2px 10px; border-radius:10px;">
                ${roleEmojis[currentUser.role] || '👤'} ${currentUser.role}
            </span>
            <button onclick="doLogout()" style="margin-left:10px; padding:2px 10px; border:none; border-radius:5px; background:#dc3545; color:white; cursor:pointer;">
                🚪 خروج
            </button>
        `;
    }
}

// دالة لعرض التنبيهات
function showAlert(message, type = 'info') {
    const colors = {
        success: '#28a745',
        danger: '#dc3545',
        warning: '#ffc107',
        info: '#0d6efd'
    };
    const alertDiv = document.createElement('div');
    alertDiv.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 99999;
        padding: 15px 25px; border-radius: 8px; color: white;
        background: ${colors[type] || colors.info};
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        font-family: 'Cairo', sans-serif;
        max-width: 400px;
        animation: slideIn 0.3s ease;
    `;
    alertDiv.textContent = message;
    document.body.appendChild(alertDiv);
    setTimeout(() => {
        alertDiv.style.opacity = '0';
        alertDiv.style.transition = 'opacity 0.3s';
        setTimeout(() => alertDiv.remove(), 300);
    }, 4000);
}

// دالة للحصول على التوكن
function getToken() {
    return localStorage.getItem('token');
}

// ============================================================
// عند تحميل الصفحة - تأكد من وجود مستمعي الأحداث
// ============================================================

// هذا السطر مهم للتأكد من أن كل شيء يعمل
console.log('✅ تطبيق إدارة الأسطول البحري جاهز');
console.log('📝 استخدم admin / admin123 للدخول التجريبي');
