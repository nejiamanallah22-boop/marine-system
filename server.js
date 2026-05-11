// ======================== الإعدادات الأساسية ========================
// ⚠️ قم بتغيير هذا الرابط إلى رابط التطبيق على Render أو السيرفر الخاص بك
const API_URL = window.location.origin; // لو كان الملف يخدم من نفس السيرفر
// أو استخدم الرابط المباشر: const API_URL = 'https://marine-system.onrender.com';

// ======================== دوال مساعدة آمنة ========================
function getToken() {
    return localStorage.getItem('token');
}

function setToken(token) {
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
}

function getUser() {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
}

function setUser(user) {
    if (user) localStorage.setItem('user', JSON.stringify(user));
    else localStorage.removeItem('user');
}

// دالة الطلب الأساسية مع معالجة الأخطاء وإعادة المحاولة
async function apiRequest(endpoint, options = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
        credentials: 'same-origin'  // لا نستخدم cookies مع CORS واسع
    });

    if (response.status === 401) {
        // توكن منتهي أو غير صالح
        setToken(null);
        setUser(null);
        if (window.location.pathname !== '/login.html') {
            window.location.reload(); // إعادة تحميل الصفحة لإظهار شاشة الدخول
        }
        throw new Error('انتهت الجلسة، يرجى تسجيل الدخول مجدداً');
    }

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'حدث خطأ في الطلب');
    }
    return data;
}

// ======================== دوال المصادقة ========================
async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('login-error');
    errorDiv.innerText = '';

    if (!username || !password) {
        errorDiv.innerText = 'يرجى إدخال اسم المستخدم وكلمة المرور';
        return;
    }

    try {
        const data = await apiRequest('/api/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        setToken(data.token);
        setUser(data.user);
        showApp();
    } catch (err) {
        errorDiv.innerText = err.message;
    }
}

function logout() {
    setToken(null);
    setUser(null);
    showLogin();
}

function showApp() {
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
    loadVessels();
}

function showLogin() {
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('app-content').style.display = 'none';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('login-error').innerText = '';
}

// ======================== إدارة المراكب ========================
async function loadVessels() {
    const tbody = document.getElementById('vessels-list');
    const statusDiv = document.getElementById('vessel-status');
    tbody.innerHTML = '<tr><td colspan="4">جاري التحميل...</td></tr>';
    try {
        const vessels = await apiRequest('/api/vessels');
        tbody.innerHTML = '';
        if (vessels.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4">لا توجد سفن مسجلة</td></tr>';
        } else {
            vessels.forEach(v => {
                const row = tbody.insertRow();
                row.insertCell(0).innerText = v.name;
                row.insertCell(1).innerText = v.len;
                row.insertCell(2).innerText = v.cat;
                const actionsCell = row.insertCell(3);
                const delBtn = document.createElement('button');
                delBtn.innerText = '🗑️ حذف';
                delBtn.style.backgroundColor = '#d32f2f';
                delBtn.onclick = () => deleteVessel(v._id);
                actionsCell.appendChild(delBtn);
            });
        }
        statusDiv.innerText = 'تم التحديث بنجاح';
        setTimeout(() => statusDiv.innerText = '', 3000);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4">خطأ: ${err.message}</td></tr>`;
        statusDiv.innerText = 'فشل التحميل';
    }
}

async function addVessel() {
    const name = document.getElementById('vessel-name').value.trim();
    const len = parseFloat(document.getElementById('vessel-len').value);
    if (!name || isNaN(len)) {
        alert('الاسم والطول مطلوبان');
        return;
    }
    try {
        await apiRequest('/api/vessels', {
            method: 'POST',
            body: JSON.stringify({ name, len })
        });
        document.getElementById('vessel-name').value = '';
        document.getElementById('vessel-len').value = '';
        loadVessels(); // إعادة تحميل القائمة
    } catch (err) {
        alert('فشل الإضافة: ' + err.message);
    }
}

async function deleteVessel(id) {
    if (!confirm('هل أنت متأكد من حذف هذه السفينة؟')) return;
    try {
        await apiRequest(`/api/vessels/${id}`, { method: 'DELETE' });
        loadVessels();
    } catch (err) {
        alert('فشل الحذف: ' + err.message);
    }
}

// ======================== بدء التطبيق و Ping ========================
if (getToken() && getUser()) {
    showApp();
} else {
    showLogin();
}

// إرسال ping كل 4 دقائق لمنع النوم على Render (اختياري)
setInterval(() => {
    fetch(`${API_URL}/api/ping`).catch(() => {});
}, 240000);
