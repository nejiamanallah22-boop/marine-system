// ============================================================
// ⚙️ SETTINGS.JS - الإعدادات
// ============================================================

console.log('⚙️ settings.js loaded');

// ============================================================
// 1. المتغيرات
// ============================================================

let settings = {
    theme: 'dark',
    language: 'ar',
    notifications: true
};

// ============================================================
// 2. تحميل الإعدادات
// ============================================================

function loadSettings() {
    console.log('⚙️ تحميل الإعدادات...');
    
    var saved = localStorage.getItem('marine_settings');
    if (saved) {
        try {
            settings = JSON.parse(saved);
        } catch { /* ignore */ }
    }
    
    applySettings();
}

// ============================================================
// 3. تطبيق الإعدادات
// ============================================================

function applySettings() {
    // تطبيق السمة
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
    
    // تحديث واجهة الإعدادات
    var themeSelect = document.getElementById('settingsTheme');
    if (themeSelect) themeSelect.value = settings.theme || 'dark';
    
    var notifCheck = document.getElementById('settingsNotifications');
    if (notifCheck) notifCheck.checked = settings.notifications !== false;
}

// ============================================================
// 4. حفظ الإعدادات
// ============================================================

function saveSettings() {
    console.log('⚙️ حفظ الإعدادات...');
    
    var themeSelect = document.getElementById('settingsTheme');
    var notifCheck = document.getElementById('settingsNotifications');
    
    if (themeSelect) settings.theme = themeSelect.value;
    if (notifCheck) settings.notifications = notifCheck.checked;
    
    localStorage.setItem('marine_settings', JSON.stringify(settings));
    applySettings();
    
    showToast('✅ تم حفظ الإعدادات', 'success');
}

// ============================================================
// 5. تهيئة الصفحة
// ============================================================

function initSettings() {
    console.log('⚙️ تهيئة صفحة الإعدادات...');
    loadSettings();
    
    var saveBtn = document.getElementById('saveSettingsBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveSettings);
}

// ============================================================
// 6. تشغيل
// ============================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettings);
} else {
    initSettings();
}

console.log('✅ settings.js loaded');
