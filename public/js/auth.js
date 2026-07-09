// ==================== دوال الخريطة والتتبع ====================

let trackingInterval = null;
let trackingMap = null;
let trackingMarkers = {};
let socket = null;

// ===== موقع افتراضي =====
function setDefaultLocation() {
    if (!trackingMap) {
        initTrackingMap();
    }
    
    const defaultLat = 36.8065;
    const defaultLng = 10.1815;
    
    if (trackingMap) {
        trackingMap.setView([defaultLat, defaultLng], 14);
        
        if (trackingMarkers['default']) {
            trackingMarkers['default'].remove();
        }
        
        const icon = L.divIcon({
            html: `<div style="background:#d9534f; color:white; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 10px rgba(0,0,0,0.3); font-size:16px;">📍</div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });
        
        const marker = L.marker([defaultLat, defaultLng], { icon: icon })
            .addTo(trackingMap)
            .bindPopup('📍 تونس العاصمة<br>الموقع الافتراضي');
        
        trackingMarkers['default'] = marker;
        document.getElementById('mapStatus').innerHTML = '📍 الموقع الافتراضي: تونس العاصمة';
        console.log('📍 تم تعيين الموقع الافتراضي: تونس العاصمة');
    }
}

function initSocket() {
    if (socket) return;
    try {
        socket = io();
        socket.on('connect', () => {
            console.log('✅ متصل بـ Socket.IO');
            if (currentUser) {
                socket.emit('user-connected', { 
                    userName: currentUser.name,
                    userRole: currentUser.role,
                    lat: 36.8065,
                    lng: 10.1815
                });
            }
        });
        socket.on('receive-location', (data) => {
            console.log('📍 موقع مستلم:', data);
            updateMapMarker(data.userName, data.lat, data.lng, data.time);
            showToast(`📍 تم تحديث موقع: ${data.userName}`);
        });
        socket.on('user-list', (users) => {
            console.log('👥 قائمة المستخدمين:', users);
            users.forEach(user => {
                updateMapMarker(user.userName, user.lat, user.lng, new Date().toISOString());
            });
        });
        socket.on('disconnect', () => {
            console.log('❌ غير متصل بـ Socket.IO');
        });
    } catch(e) {
        console.error('خطأ في Socket:', e);
    }
}

function initTrackingMap() {
    if (trackingMap) return;
    
    const mapElement = document.getElementById('trackMap');
    if (!mapElement) {
        console.error('❌ عنصر trackMap غير موجود');
        return;
    }
    
    try {
        trackingMap = L.map('trackMap').setView([36.8065, 10.1815], 7);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
        }).addTo(trackingMap);
        console.log('✅ تم تهيئة الخريطة');
        
        setTimeout(() => {
            setDefaultLocation();
        }, 300);
        
    } catch(e) {
        console.error('خطأ في الخريطة:', e);
    }
}

function updateMapMarker(userName, lat, lng, time) {
    if (!trackingMap) initTrackingMap();
    const key = userName;
    const timeFormatted = time ? new Date(time).toLocaleString('ar-EG') : new Date().toLocaleString('ar-EG');
    if (trackingMarkers[key]) {
        trackingMarkers[key].setLatLng([lat, lng]);
        trackingMarkers[key].setPopupContent(`<b>👤 ${userName}</b><br>📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}<br>🕐 ${timeFormatted}`);
    } else {
        const icon = L.divIcon({
            html: `<div style="background:#2e7d32; color:white; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 10px rgba(0,0,0,0.3); font-size:16px;">📍</div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });
        const marker = L.marker([lat, lng], { icon: icon }).addTo(trackingMap);
        marker.bindPopup(`<b>👤 ${userName}</b><br>📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}<br>🕐 ${timeFormatted}`);
        trackingMarkers[key] = marker;
    }
    if (userName === currentUser?.name) {
        trackingMap.setView([lat, lng], 13);
    }
}

function updateGpsStatus(active, text) {
    const dot = document.getElementById('gpsDot');
    const statusText = document.getElementById('gpsStatusText');
    if (dot && statusText) {
        if (active) {
            dot.className = 'gps-status gps-active';
            statusText.textContent = text || 'نشط';
            statusText.style.color = '#28a745';
        } else {
            dot.className = 'gps-status gps-inactive';
            statusText.textContent = text || 'غير نشط';
            statusText.style.color = '#dc3545';
        }
    }
}

function requestLocationPermission() {
    if (!currentUser) {
        showToast("الرجاء تسجيل الدخول أولاً", true);
        return;
    }
    
    if (currentUser.role !== "مسؤول") {
        showToast("غير مسموح - هذه الخاصية للمسؤول فقط", true);
        return;
    }
    
    showToast("📍 الموقع الافتراضي مفعل: تونس العاصمة", false);
    document.getElementById('mapStatus').innerHTML = "📍 الموقع الافتراضي: تونس العاصمة";
    setDefaultLocation();
    updateGpsStatus(false, 'افتراضي');
}

function startTracking() {
    if (!currentUser) {
        showToast("الرجاء تسجيل الدخول أولاً", true);
        return;
    }
    
    if (currentUser.role !== "مسؤول") {
        showToast("غير مسموح - هذه الخاصية للمسؤول فقط", true);
        return;
    }
    
    setDefaultLocation();
    showToast("📍 تم تعيين الموقع الافتراضي: تونس", false);
    document.getElementById('mapStatus').innerHTML = "📍 الموقع الافتراضي: تونس العاصمة";
    updateGpsStatus(false, 'افتراضي');
    
    document.getElementById('startTrackingBtn').style.display = 'none';
    document.getElementById('stopTrackingBtn').style.display = 'inline-block';
}

function stopTracking() {
    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
    }
    document.getElementById('startTrackingBtn').style.display = 'inline-block';
    document.getElementById('stopTrackingBtn').style.display = 'none';
    document.getElementById('mapStatus').innerHTML = '⏹️ توقف التتبع';
    updateGpsStatus(false, 'متوقف');
    showToast("⏹️ تم إيقاف التتبع");
}

async function loadLocations() {
    try {
        const response = await fetch('/api/locations');
        
        // ✅ التحقق من حالة 429 (تجاوز الحد)
        if (response.status === 429) {
            console.warn('⚠️ تجاوزت الحد المسموح، انتظر قليلاً');
            showToast('⚠️ كثرة الطلبات، انتظر دقيقة', true);
            setDefaultLocation();
            return;
        }
        
        if (!response.ok) {
            throw new Error(await response.text());
        }
        
        const locations = await response.json();
        if (!trackingMap) initTrackingMap();
        
        // إزالة العلامات القديمة (مع الاحتفاظ بالعلامة الافتراضية)
        Object.keys(trackingMarkers).forEach(key => {
            if (key !== 'default') {
                trackingMarkers[key].remove();
                delete trackingMarkers[key];
            }
        });
        
        if (locations.length === 0) {
            setDefaultLocation();
        } else {
            locations.forEach(loc => {
                updateMapMarker(loc.userName, loc.lat, loc.lng, loc.timestamp);
            });
            showToast(`✅ تم تحميل ${locations.length} موقع محفوظ`);
        }
    } catch (err) {
        console.error(err);
        setDefaultLocation();
    }
}

function centerMapOnUser() {
    if (!trackingMap) initTrackingMap();
    if (currentUser?.role !== "مسؤول") {
        showToast("غير مسموح - هذه الخاصية للمسؤول فقط", true);
        return;
    }
    showToast("🎯 تم التمركز على الموقع الافتراضي: تونس", false);
    setDefaultLocation();
}

function logUserLocation() {
    if (!currentUser) return;
    if (currentUser.role !== "مسؤول") return;
    
    const defaultLat = 36.8065;
    const defaultLng = 10.1815;
    
    (async () => {
        await logActivity("دخول من موقع", `قام بتسجيل الدخول من الموقع الافتراضي: ${defaultLat}, ${defaultLng}`);
        try {
            await fetch('/api/locations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userName: currentUser.name,
                    userRole: currentUser.role,
                    lat: defaultLat,
                    lng: defaultLng,
                    action: 'تسجيل دخول (افتراضي)'
                })
            });
        } catch(e) {
            console.error('خطأ في حفظ موقع الدخول:', e);
        }
    })();
}
