// ==================== GPS Tracking ====================
let trackingInterval = null;
let trackingMap = null;
let trackingMarkers = {};
let socket = null;

function initSocket() {
    socket = io();
    
    socket.on('receive-location', (data) => {
        console.log('موقع مستلم:', data);
        updateMapMarker(data.userName, data.lat, data.lng, data.time);
        showToast(`📍 تم تحديث موقع المستخدم: ${data.userName}`);
    });
}

function initTrackingMap() {
    if (trackingMap) return;
    trackingMap = L.map('trackMap').setView([34.5, 9.5], 7);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
    }).addTo(trackingMap);
}

function updateMapMarker(userName, lat, lng, time) {
    if (!trackingMap) initTrackingMap();
    const key = userName;
    if (trackingMarkers[key]) {
        trackingMarkers[key].setLatLng([lat, lng]);
        trackingMarkers[key].bindPopup(`<b>${userName}</b><br>📍 ${lat}, ${lng}<br>🕐 ${new Date(time).toLocaleString('ar-EG')}`);
    } else {
        const marker = L.marker([lat, lng]).addTo(trackingMap);
        marker.bindPopup(`<b>${userName}</b><br>📍 ${lat}, ${lng}<br>🕐 ${new Date(time).toLocaleString('ar-EG')}`);
        trackingMarkers[key] = marker;
    }
    trackingMap.setView([lat, lng], 12);
}

function startTracking() {
    if (!navigator.geolocation) {
        showToast("المتصفح لا يدعم تحديد الموقع", true);
        return;
    }
    
    if (!socket) initSocket();
    
    trackingInterval = setInterval(() => {
        navigator.geolocation.getCurrentPosition((position) => {
            const { latitude, longitude } = position.coords;
            if (socket && currentUser) {
                socket.emit('send-location', {
                    userName: currentUser.name,
                    userRole: currentUser.role,
                    lat: latitude,
                    lng: longitude
                });
                document.getElementById('mapStatus').innerHTML = `📍 يتم مشاركة موقعك... ${latitude}, ${longitude}`;
            }
        }, (error) => {
            console.error('خطأ في GPS:', error);
            document.getElementById('mapStatus').innerHTML = '❌ تعذر الحصول على الموقع';
        }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
    }, 5000); // كل 5 ثوان
    
    document.getElementById('startTrackingBtn').style.display = 'none';
    document.getElementById('stopTrackingBtn').style.display = 'inline-block';
    showToast("✅ بدأ مشاركة الموقع لحظة بلحظة");
}

function stopTracking() {
    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
    }
    document.getElementById('startTrackingBtn').style.display = 'inline-block';
    document.getElementById('stopTrackingBtn').style.display = 'none';
    document.getElementById('mapStatus').innerHTML = '⏹️ توقفت مشاركة الموقع';
    showToast("⏹️ تم إيقاف مشاركة الموقع");
}

async function loadLocations() {
    try {
        const response = await fetch('/api/locations');
        const locations = await response.json();
        if (!trackingMap) initTrackingMap();
        
        // مسح العلامات القديمة
        Object.values(trackingMarkers).forEach(marker => marker.remove());
        trackingMarkers = {};
        
        locations.forEach(loc => {
            updateMapMarker(loc.userName, loc.lat, loc.lng, loc.timestamp);
        });
        showToast(`✅ تم تحميل ${locations.length} موقع محفوظ`);
    } catch (err) {
        console.error(err);
    }
}

// تعديل دالة doLogin لبدء Socket
const originalDoLogin = window.doLogin;
window.doLogin = async function() {
    await originalDoLogin();
    if (currentUser) {
        initSocket();
        initTrackingMap();
    }
};

// تعديل دالة showPage
const originalShowPage = window.showPage;
window.showPage = function(page) {
    originalShowPage(page);
    if (page === 'map') {
        initTrackingMap();
        loadLocations();
    }
};
