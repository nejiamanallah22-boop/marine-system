<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>⚓ منظومة الوسائل البحرية</title>
    
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Cairo', 'Segoe UI', sans-serif;
            background: #0a0e17;
            color: #e2e8f0;
            min-height: 100vh;
        }
        
        #loginOverlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 999999;
            display: flex !important;
            justify-content: center;
            align-items: center;
            background: rgba(10,14,23,0.98);
            backdrop-filter: blur(10px);
        }
        
        .login-box {
            background: linear-gradient(145deg, #141b2d, #0f1625);
            padding: 50px 40px;
            border-radius: 24px;
            box-shadow: 0 25px 80px rgba(0,0,0,0.8);
            max-width: 420px;
            width: 100%;
            text-align: center;
            border: 1px solid rgba(96,165,250,0.15);
        }
        
        .login-logo { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 8px; }
        .logo-icon { font-size: 40px; color: #60a5fa; }
        .logo-text {
            font-size: 22px;
            font-weight: 800;
            background: linear-gradient(135deg, #60a5fa, #34d399);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .subtitle { color: rgba(255,255,255,0.4); font-size: 14px; margin-bottom: 20px; }
        
        .developer {
            background: rgba(96,165,250,0.08);
            border-radius: 12px;
            padding: 8px 16px;
            margin-bottom: 24px;
            display: inline-block;
            border: 1px solid rgba(96,165,250,0.1);
        }
        .dev-name { color: #60a5fa; font-weight: 700; font-size: 14px; }
        .dev-label { color: rgba(255,255,255,0.3); font-size: 11px; margin-left: 6px; }
        
        .input-group { position: relative; margin-bottom: 16px; }
        .input-icon {
            position: absolute;
            right: 16px;
            top: 50%;
            transform: translateY(-50%);
            color: rgba(255,255,255,0.2);
        }
        .input-group input {
            width: 100%;
            padding: 14px 48px 14px 16px;
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px;
            color: #fff;
            font-size: 16px;
            font-family: 'Cairo', sans-serif;
            transition: all 0.3s ease;
        }
        .input-group input:focus {
            outline: none;
            border-color: #60a5fa;
            background: rgba(255,255,255,0.06);
            box-shadow: 0 0 0 4px rgba(96,165,250,0.08);
        }
        .input-group input::placeholder { color: rgba(255,255,255,0.25); }
        
        .login-btn {
            width: 100%;
            padding: 16px;
            background: linear-gradient(135deg, #2563eb, #3b82f6);
            border: none;
            border-radius: 12px;
            color: #fff;
            font-size: 18px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s ease;
            font-family: 'Cairo', sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        .login-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(37,99,235,0.3); }
        .login-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        
        .login-btn .spinner {
            display: none;
            width: 20px;
            height: 20px;
            border: 2px solid rgba(255,255,255,0.2);
            border-top: 2px solid #fff;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        .login-btn.loading .spinner { display: inline-block; }
        .login-btn.loading .btn-text { display: none; }
        
        .error-msg {
            display: none;
            padding: 12px;
            border-radius: 10px;
            margin-top: 14px;
            font-size: 14px;
        }
        .error-msg.show { display: block; }
        .error-msg.error { color: #f87171; background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.15); }
        .error-msg.success { color: #4ade80; background: rgba(74,222,128,0.08); border: 1px solid rgba(74,222,128,0.15); }
        
        .login-footer {
            margin-top: 20px;
            display: flex;
            justify-content: space-between;
            color: rgba(255,255,255,0.2);
            font-size: 11px;
        }
        .version { background: rgba(255,255,255,0.04); padding: 2px 10px; border-radius: 20px; }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        #mainApp { display: none; min-height: 100vh; }
        
        header {
            background: #0f1625;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            padding: 12px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: sticky;
            top: 0;
            z-index: 100;
        }
        .header-left { display: flex; align-items: center; gap: 16px; }
        .menu-toggle {
            font-size: 24px;
            cursor: pointer;
            color: rgba(255,255,255,0.4);
            transition: all 0.3s ease;
        }
        .menu-toggle:hover { color: #60a5fa; }
        .header-left h1 { font-size: 18px; font-weight: 700; color: #fff; }
        .header-left h1 span { color: #60a5fa; }
        .developer-tag {
            font-size: 11px;
            color: rgba(255,255,255,0.3);
            font-weight: 400;
            margin-right: 8px;
        }
        .header-right { display: flex; align-items: center; gap: 12px; }
        .role-badge {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            background: rgba(96,165,250,0.12);
            color: #60a5fa;
            border: 1px solid rgba(96,165,250,0.15);
        }
        .btn-outline-white {
            background: transparent;
            border: 1px solid rgba(255,255,255,0.1);
            color: rgba(255,255,255,0.6);
            padding: 6px 12px;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
            font-size: 14px;
        }
        .btn-outline-white:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.2); color: #fff; }
        .btn-logout:hover { border-color: #ef4444; color: #ef4444; }
        
        .sidebar {
            position: fixed;
            top: 65px;
            right: 0;
            width: 240px;
            height: calc(100% - 65px);
            background: #0f1625;
            border-left: 1px solid rgba(255,255,255,0.06);
            padding: 16px 12px;
            overflow-y: auto;
            z-index: 50;
            transition: transform 0.3s ease;
        }
        .sidebar-brand {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 12px;
            margin-bottom: 16px;
            color: rgba(255,255,255,0.3);
            font-size: 13px;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            padding-bottom: 12px;
        }
        .sidebar-brand span:first-child { font-size: 20px; }
        
        .nav-btn {
            display: flex;
            align-items: center;
            gap: 12px;
            width: 100%;
            padding: 10px 14px;
            background: transparent;
            border: none;
            border-radius: 10px;
            color: rgba(255,255,255,0.5);
            font-size: 14px;
            font-family: 'Cairo', sans-serif;
            cursor: pointer;
            transition: all 0.3s ease;
            text-align: right;
        }
        .nav-btn:hover { background: rgba(255,255,255,0.04); color: #fff; }
        .nav-btn.active {
            background: rgba(96,165,250,0.12);
            color: #60a5fa;
            border-left: 3px solid #60a5fa;
        }
        .nav-btn i { width: 20px; text-align: center; }
        
        .sidebar-footer {
            padding: 12px;
            margin-top: 20px;
            border-top: 1px solid rgba(255,255,255,0.04);
            color: rgba(255,255,255,0.15);
            font-size: 11px;
            text-align: center;
        }
        
        .main-content {
            margin-right: 240px;
            padding: 20px;
            min-height: calc(100vh - 65px);
        }
        
        @media (max-width: 768px) {
            .sidebar { transform: translateX(100%); width: 280px; }
            .sidebar.open { transform: translateX(0); }
            .main-content { margin-right: 0; padding: 12px; }
            .login-box { padding: 30px 20px; margin: 16px; }
            .header-left h1 { font-size: 14px; }
            .developer-tag { display: none; }
        }
    </style>
</head>
<body>

<!-- ===== LOGIN ===== -->
<div id="loginOverlay">
    <div class="login-box">
        <div class="login-logo">
            <span class="logo-icon">⚓</span>
            <span class="logo-text">منظومة الوسائل البحرية</span>
        </div>
        <p class="subtitle">نظام متابعة وإدارة الأسطول البحري</p>
        <div class="developer">
            <span class="dev-label">الوكيل</span>
            <span class="dev-name">أمان الله ناجي</span>
        </div>
        <div class="input-group">
            <i class="fas fa-user input-icon"></i>
            <input type="text" id="username" placeholder="اسم المستخدم" autocomplete="username" required>
        </div>
        <div class="input-group">
            <i class="fas fa-lock input-icon"></i>
            <input type="password" id="password" placeholder="كلمة المرور" autocomplete="current-password" required>
        </div>
        <button type="button" class="login-btn" id="loginButton">
            <span class="spinner"></span>
            <span class="btn-text">🚀 دخول</span>
        </button>
        <div id="loginError" class="error-msg"></div>
        <div class="login-footer">
            <span>نظام إدارة وإسناد الوحدات البحرية</span>
            <span class="version">v13.0</span>
        </div>
    </div>
</div>

<!-- ===== MAIN APP ===== -->
<div id="mainApp" style="display:none;">
    <header>
        <div class="header-left">
            <span class="menu-toggle" onclick="toggleSidebar()">☰</span>
            <h1>
                <span>⚓</span>
                منظومة الوسائل البحرية
                <span class="developer-tag">الوكيل أمان الله ناجي</span>
            </h1>
        </div>
        <div class="header-right">
            <span class="role-badge" id="userRoleDisplay">👤</span>
            <button class="btn-outline-white btn-logout" type="button" onclick="doLogout()">
                <i class="fas fa-sign-out-alt"></i>
            </button>
        </div>
    </header>

    <nav class="sidebar" id="sidebar">
        <div class="sidebar-brand">
            <span>⚓</span>
            <span>الأسطول البحري</span>
        </div>
        <button class="nav-btn active" onclick="showPage('dashboard')">
            <i class="fas fa-chart-pie"></i> لوحة التحكم
        </button>
        <button class="nav-btn" onclick="showPage('fleet')">
            <i class="fas fa-ship"></i> الأسطول
        </button>
        <button class="nav-btn" onclick="showPage('maintenance')">
            <i class="fas fa-wrench"></i> الصيانة
        </button>
        <button class="nav-btn" onclick="showPage('users')">
            <i class="fas fa-users"></i> المستخدمين
        </button>
        <div class="sidebar-footer">
            <span>الوكيل أمان الله ناجي</span>
        </div>
    </nav>

    <div class="main-content">
        <div id="pageContainer">
            <div style="text-align:center;padding:60px 20px;color:rgba(255,255,255,0.2);">
                <div style="font-size:48px;margin-bottom:16px;">🚀</div>
                <p>مرحباً بك في منظومة الوسائل البحرية</p>
            </div>
        </div>
    </div>
</div>

<!-- ============================================================
     📦 JAVASCRIPT - VERSION 13.0 - NO LOCALSTORAGE
     ============================================================ -->

<script>
/**
 * ============================================================
 * 🚀 MARINE SYSTEM v13.0 - NO LOCALSTORAGE
 * ============================================================
 * ✅ يستخدم SessionStorage فقط (ينتهي عند إغلاق التبويب)
 * ✅ لا يحفظ أي شيء بعد إغلاق المتصفح
 * ============================================================
 */

console.log('🚀 Marine System v13.0 - Loading...');
console.log('🔐 No LocalStorage - Session only');

// ============================================================
// ⚙️ CONFIGURATION
// ============================================================

const API_BASE_URL = 'https://marine-system-71eo.onrender.com';
console.log('📡 API Base URL:', API_BASE_URL);

// ============================================================
// 🔐 SESSION MANAGEMENT (بدون LocalStorage)
// ============================================================

function saveSession(user, token) {
    try {
        sessionStorage.setItem('auth_user', JSON.stringify(user));
        sessionStorage.setItem('auth_token', token);
        console.log('💾 Session saved (SessionStorage)');
    } catch (e) {
        console.warn('Session storage error:', e);
    }
}

function getSession() {
    try {
        const userData = sessionStorage.getItem('auth_user');
        const token = sessionStorage.getItem('auth_token');
        if (userData && token) {
            return { user: JSON.parse(userData), token: token };
        }
    } catch (e) {
        console.warn('Session load error:', e);
    }
    return null;
}

function clearSession() {
    try {
        sessionStorage.removeItem('auth_user');
        sessionStorage.removeItem('auth_token');
        console.log('🗑️ Session cleared');
    } catch (e) {
        console.warn('Session clear error:', e);
    }
}

// ============================================================
// 🔐 LOGIN FUNCTION
// ============================================================

window.doLogin = function() {
    console.log('🔐 [doLogin] CALLED');
    
    const usernameEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');
    const errorEl = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginButton');
    
    if (!usernameEl || !passwordEl) {
        console.error('❌ Login elements not found!');
        return;
    }
    
    const user = usernameEl.value.trim();
    const pass = passwordEl.value.trim();
    
    console.log('🔐 Username:', user || '(empty)');
    console.log('🔐 Password length:', pass.length || 0);
    
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.className = 'error-msg';
    }
    
    if (!user || !pass) {
        console.log('❌ Empty credentials');
        if (errorEl) {
            errorEl.textContent = '⚠️ الرجاء إدخال اسم المستخدم وكلمة المرور';
            errorEl.className = 'error-msg show error';
        }
        return;
    }
    
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.classList.add('loading');
        console.log('⏳ Loading...');
    }
    
    const loginUrl = API_BASE_URL + '/api/auth/login';
    console.log('📡 Sending to:', loginUrl);
    
    fetch(loginUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ username: user, password: pass })
    })
    .then(function(response) {
        console.log('📡 Status:', response.status);
        return response.text().then(function(text) {
            let data;
            try { data = JSON.parse(text); } catch (e) { data = { error: 'Invalid JSON' }; }
            return { status: response.status, ok: response.ok, data: data };
        });
    })
    .then(function(result) {
        console.log('📡 Response:', result.data);
        
        if (result.ok && result.data && result.data.success) {
            console.log('✅ Login SUCCESS!');
            
            const userData = result.data.user || result.data.data?.user || result.data;
            
            // ✅ استخدام SessionStorage بدلاً من LocalStorage
            saveSession(userData, result.data.token || result.data.data?.token || 'token-' + Date.now());
            
            // إخفاء شاشة الدخول
            const overlay = document.getElementById('loginOverlay');
            const mainApp = document.getElementById('mainApp');
            
            if (overlay) {
                overlay.style.display = 'none';
                overlay.style.visibility = 'hidden';
                overlay.style.opacity = '0';
            }
            if (mainApp) {
                mainApp.style.display = 'block';
                mainApp.style.visibility = 'visible';
                mainApp.style.opacity = '1';
            }
            
            updateUserDisplay();
            loadDashboard();
            
            if (errorEl) {
                errorEl.textContent = '✅ مرحباً ' + (userData.name || userData.username || user);
                errorEl.className = 'error-msg show success';
                setTimeout(function() { errorEl.className = 'error-msg'; }, 3000);
            }
            
        } else {
            console.log('❌ Login FAILED');
            const errorMsg = result.data?.error || result.data?.message || 'بيانات الدخول غير صحيحة';
            
            if (errorEl) {
                errorEl.textContent = '❌ ' + errorMsg;
                errorEl.className = 'error-msg show error';
            }
        }
    })
    .catch(function(error) {
        console.error('❌ Network error:', error);
        if (errorEl) {
            errorEl.textContent = '❌ لا يمكن الاتصال بالسيرفر: ' + error.message;
            errorEl.className = 'error-msg show error';
        }
    })
    .finally(function() {
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.classList.remove('loading');
        }
    });
};

// ============================================================
// 🚪 LOGOUT
// ============================================================

window.doLogout = function() {
    console.log('🚪 [doLogout] CALLED');
    
    if (!confirm('⚠️ هل أنت متأكد من تسجيل الخروج؟')) return;
    
    // ✅ مسح SessionStorage فقط
    clearSession();
    
    const overlay = document.getElementById('loginOverlay');
    const mainApp = document.getElementById('mainApp');
    
    if (overlay) {
        overlay.style.display = 'flex';
        overlay.style.visibility = 'visible';
        overlay.style.opacity = '1';
    }
    if (mainApp) {
        mainApp.style.display = 'none';
        mainApp.style.visibility = 'hidden';
        mainApp.style.opacity = '0';
    }
    
    const username = document.getElementById('username');
    const password = document.getElementById('password');
    const errorEl = document.getElementById('loginError');
    
    if (username) username.value = '';
    if (password) password.value = '';
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.className = 'error-msg';
    }
    
    console.log('👋 Logged out - Session cleared');
};

// ============================================================
// 👤 USER DISPLAY
// ============================================================

window.updateUserDisplay = function() {
    console.log('👤 [updateUserDisplay] CALLED');
    
    const display = document.getElementById('userRoleDisplay');
    if (!display) return;
    
    const session = getSession();
    if (session && session.user) {
        const user = session.user;
        const emojis = { 'admin': '👑', 'manager': '⭐', 'operator': '🔧', 'viewer': '👀' };
        const emoji = emojis[user.role] || '👤';
        display.textContent = `${emoji} ${user.name || user.username || 'مستخدم'}`;
    } else {
        display.textContent = '👤';
    }
};

// ============================================================
// 📄 PAGE FUNCTIONS
// ============================================================

window.loadDashboard = function() {
    console.log('📊 [loadDashboard] CALLED');
    
    const container = document.getElementById('pageContainer');
    if (container) {
        container.innerHTML = `
            <div style="text-align:center;padding:60px 20px;">
                <h2 style="color:#60a5fa;font-size:28px;">📊 لوحة التحكم</h2>
                <p style="color:rgba(255,255,255,0.3);margin-top:8px;">مرحباً بك في منظومة الوسائل البحرية</p>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-top:30px;max-width:800px;margin-left:auto;margin-right:auto;">
                    <div style="background:rgba(255,255,255,0.04);padding:20px;border-radius:12px;border:1px solid rgba(255,255,255,0.06);">
                        <div style="font-size:32px;">🚢</div>
                        <div style="font-size:24px;font-weight:700;color:#60a5fa;" id="dashTotal">0</div>
                        <div style="color:rgba(255,255,255,0.3);font-size:13px;">السفن</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.04);padding:20px;border-radius:12px;border:1px solid rgba(255,255,255,0.06);">
                        <div style="font-size:32px;">🔧</div>
                        <div style="font-size:24px;font-weight:700;color:#4ade80;" id="dashMaintenance">0</div>
                        <div style="color:rgba(255,255,255,0.3);font-size:13px;">مهام الصيانة</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.04);padding:20px;border-radius:12px;border:1px solid rgba(255,255,255,0.06);">
                        <div style="font-size:32px;">👥</div>
                        <div style="font-size:24px;font-weight:700;color:#fbbf24;" id="dashUsers">0</div>
                        <div style="color:rgba(255,255,255,0.3);font-size:13px;">المستخدمين</div>
                    </div>
                </div>
                <div style="margin-top:30px;padding:20px;background:rgba(96,165,250,0.05);border-radius:12px;border:1px solid rgba(96,165,250,0.1);">
                    <p style="color:rgba(255,255,255,0.3);font-size:13px;">
                        ✅ متصل بالسيرفر: ${API_BASE_URL}
                    </p>
                    <p style="color:rgba(255,255,255,0.2);font-size:11px;margin-top:8px;">
                        🔐 الجلسة تنتهي عند إغلاق المتصفح
                    </p>
                </div>
            </div>
        `;
    }
};

window.showPage = function(pageName) {
    console.log('📄 [showPage]', pageName);
    const container = document.getElementById('pageContainer');
    if (container) {
        container.innerHTML = `
            <div style="text-align:center;padding:60px 20px;">
                <h2 style="color:#60a5fa;">📄 ${pageName}</h2>
                <p style="color:rgba(255,255,255,0.3);">جاري تحميل الصفحة...</p>
            </div>
        `;
    }
    document.querySelectorAll('.nav-btn').forEach(function(btn) {
        btn.classList.remove('active');
    });
};

window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('open');
};

// ============================================================
// 🚀 INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM ready - initializing...');
    console.log('📡 Server URL:', API_BASE_URL);
    console.log('🔐 Credentials: admin / MarineDB2026Secure');
    console.log('💡 SessionStorage only - no persistence after browser close');
    
    // ربط زر الدخول
    const loginBtn = document.getElementById('loginButton');
    if (loginBtn) {
        loginBtn.onclick = function() {
            console.log('🖱️ Login button clicked!');
            window.doLogin();
        };
        console.log('✅ Login button bound');
    }
    
    // ربط Enter
    const passwordField = document.getElementById('password');
    const usernameField = document.getElementById('username');
    
    if (passwordField) {
        passwordField.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                console.log('⌨️ Enter pressed');
                window.doLogin();
            }
        });
    }
    
    if (usernameField) {
        usernameField.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (passwordField) passwordField.focus();
            }
        });
    }
    
    // ✅ التحقق من SessionStorage (بدون LocalStorage)
    const session = getSession();
    
    if (session && session.user && session.token) {
        console.log('🔄 Session found - auto-login');
        const overlay = document.getElementById('loginOverlay');
        const mainApp = document.getElementById('mainApp');
        
        if (overlay) {
            overlay.style.display = 'none';
            overlay.style.visibility = 'hidden';
            overlay.style.opacity = '0';
        }
        if (mainApp) {
            mainApp.style.display = 'block';
            mainApp.style.visibility = 'visible';
            mainApp.style.opacity = '1';
        }
        
        updateUserDisplay();
        loadDashboard();
        console.log('✅ Auto-login from session');
    } else {
        console.log('🔐 No session - showing login');
        const overlay = document.getElementById('loginOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            overlay.style.visibility = 'visible';
            overlay.style.opacity = '1';
        }
    }
    
    console.log('🚀 Marine System v13.0 - Ready!');
    console.log('🔐 SessionStorage only - no LocalStorage');
});

// التأكد من أن جميع الدوال معروفة
console.log('✅ Functions: doLogin, doLogout, showPage, toggleSidebar');
</script>

</body>
</html>
