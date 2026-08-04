// ============================================================
// المصادقة
// ============================================================

function doLogin() {
    console.log('🔄 محاولة تسجيل الدخول...');
    
    const username = document.getElementById('username')?.value?.trim();
    const password = document.getElementById('password')?.value?.trim();
    
    if (!username || !password) {
        showAlert('⚠️ الرجاء إدخال اسم المستخدم وكلمة المرور', 'warning');
        return;
    }
    
    const loginBtn = document.querySelector('#loginOverlay .login-btn');
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.textContent = '⏳ جاري الدخول...';
    }
    
    // ===== حسابات تجريبية =====
    const demoUsers = {
        'admin': { password: '123456', user: { id: '1', name: 'مدير النظام', role: 'مسؤول', email: 'admin@example.com' } },
        'manager': { password: '123456', user: { id: '2', name: 'مدير العمليات', role: 'مشرف', email: 'manager@example.com' } },
        'editor': { password: '123456', user: { id: '3', name: 'محرر', role: 'محرر', email: 'editor@example.com' } },
        'viewer': { password: '123456', user: { id: '4', name: 'مشاهد', role: 'مشاهد', email: 'viewer@example.com' } }
    };
    
    if (demoUsers[username] && demoUsers[username].password === password) {
        console.log('✅ دخول تجريبي ناجح للمستخدم:', username);
        const userData = demoUsers[username].user;
        localStorage.setItem('token', 'demo-token-' + Date.now());
        localStorage.setItem('user', JSON.stringify(userData));
        currentUser = userData;
        sessionId = 'demo-session-' + Date.now();
        
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        
        updateUserDisplay();
        loadAllData();
        loadPage('dashboard');
        startActivityTracking();
        showAlert('✅ مرحباً ' + userData.name + '!', 'success');
        
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = '🚀 دخول';
        }
        return;
    }
    
    // ===== الاتصال بالخادم =====
    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email: username, password: password })
    })
    .then(res => {
        if (!res.ok) throw new Error('فشل الاتصال بالخادم');
        return res.json();
    })
    .then(data => {
        if (data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            currentUser = data.user;
            sessionId = data.session?.sessionId || null;
            
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            
            updateUserDisplay();
            loadAllData();
            loadPage('dashboard');
            startActivityTracking();
            showAlert('✅ تم تسجيل الدخول بنجاح', 'success');
        } else {
            showAlert('❌ ' + (data.error || 'بيانات غير صحيحة'), 'danger');
        }
    })
    .catch(err => {
        console.error('Login error:', err);
        showAlert('❌ خطأ في الاتصال بالخادم: ' + err.message, 'danger');
    })
    .finally(() => {
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = '🚀 دخول';
        }
    });
}

function doLogout() {
    if (!confirm('⚠️ هل أنت متأكد من تسجيل الخروج؟')) return;
    
    if (activityInterval) {
        clearInterval(activityInterval);
        activityInterval = null;
    }
    
    if (mapRefreshInterval) {
        clearInterval(mapRefreshInterval);
        mapRefreshInterval = null;
    }
    
    const token = getToken();
    if (token && !token.startsWith('demo-token')) {
        fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token }
        }).catch(err => console.log('Logout error:', err));
    }
    
    localStorage.clear();
    location.reload();
}

function updateUserDisplay() {
    const display = document.getElementById('userRoleDisplay');
    if (display && currentUser) {
        const roleEmojis = { 'مسؤول': '👑', 'مشرف': '⭐', 'محرر': '✏️', 'مشاهد': '👀' };
        display.innerHTML = `
            <i class="fas fa-user-circle"></i> 
            ${currentUser.name} 
            <span style="font-size:12px; background:rgba(255,255,255,0.06); padding:2px 12px; border-radius:10px;">
                ${roleEmojis[currentUser.role] || '👤'} ${currentUser.role}
            </span>
            <button onclick="doLogout()" style="margin-left:8px; padding:2px 10px; border:none; border-radius:8px; background:rgba(248,113,113,0.15); color:#f87171; cursor:pointer; font-size:11px;">
                🚪 خروج
            </button>
        `;
    }
}
