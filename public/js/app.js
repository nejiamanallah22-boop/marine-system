// ============================================================
// 🔐 دوال المصادقة
// ============================================================

function doLogin() {
    const username = document.getElementById('username')?.value.trim();
    const password = document.getElementById('password')?.value.trim();
    
    if (!username || !password) {
        const errorEl = document.getElementById('loginError');
        if (errorEl) {
            errorEl.textContent = '⚠️ الرجاء إدخال اسم المستخدم وكلمة المرور';
            errorEl.style.display = 'block';
        }
        return;
    }
    
    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: username, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            
            const roleDisplay = document.getElementById('userRoleDisplay');
            if (roleDisplay) {
                roleDisplay.innerHTML = `<i class="fas fa-user"></i> ${data.user.name} (${data.user.role})`;
            }
            
            currentUser = data.user;
            loadAllData();
            initSocket();
        } else {
            const errorEl = document.getElementById('loginError');
            if (errorEl) {
                errorEl.textContent = '❌ ' + (data.error || 'بيانات غير صحيحة');
                errorEl.style.display = 'block';
            }
        }
    })
    .catch(err => {
        console.error('Login error:', err);
        const errorEl = document.getElementById('loginError');
        if (errorEl) {
            errorEl.textContent = '❌ خطأ في الاتصال بالخادم';
            errorEl.style.display = 'block';
        }
    });
}
