// ============================================================
// ===== دوال مساعدة =====
// ============================================================

function showToast(message, type = 'info') {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    
    const colors = {
        success: '#22c55e',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#2563eb'
    };
    
    toast.style.borderRight = `4px solid ${colors[type] || colors.info}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function getDeviceInfo() {
    const ua = navigator.userAgent;
    let device = 'غير معروف';
    let browser = 'غير معروف';
    
    if (ua.includes('Android')) device = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) device = 'iOS';
    else if (ua.includes('Windows')) device = 'Windows';
    else if (ua.includes('Macintosh')) device = 'Mac';
    else if (ua.includes('Linux')) device = 'Linux';
    
    if (ua.includes('Edg') || ua.includes('Edge')) browser = 'Edge';
    else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';
    else if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari')) browser = 'Safari';
    
    return { device, browser };
}

function getIpAddress() {
    return new Promise((resolve) => {
        fetch('https://api.ipify.org?format=json')
            .then(res => res.json())
            .then(data => resolve(data.ip))
            .catch(() => resolve('غير معروف'));
    });
}

function getLocationFromCoords(lat, lng) {
    return new Promise((resolve) => {
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&accept-language=ar`)
            .then(res => res.json())
            .then(data => resolve(data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`))
            .catch(() => resolve(`${lat.toFixed(4)}, ${lng.toFixed(4)}`));
    });
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('ar-TN');
}

function formatTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('ar-TN');
}

function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

function getWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}
