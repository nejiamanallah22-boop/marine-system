// ==================== دوال الخريطة والتتبع ====================

let trackingInterval = null;
let trackingMap = null;
let trackingMarkers = {};
let socket = null;

// ===== موقع افتراضي دقيق (تونس العاصمة) =====
function setDefaultLocation() {
    if (!trackingMap) {
        initTrackingMap();
    }
    
    // ✅ موقع دقيق: تونس العاصمة - شارع الحبيب بورقيبة
    const defaultLat = 36.8065;
    const defaultLng = 10.1815;
    
    trackingMap.setView([defaultLat, defaultLng], 14);
    
    // إضافة علامة دائمة
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
        .bindPopup('📍 تونس العاصمة<br>شارع الحبيب بورقيبة');
    
    trackingMarkers['default'] = marker;
    
    console.log('📍 تم تعيين الموقع الافتراضي: تونس العاصمة');
}

function initSocket() {
    if (socket) return;
    try {
        socket = io();
        socket.on('connect', () => {
            console.log('✅ متصل بـ Socket.IO');
            if (currentUser) {
                socket.emit('user-connected', { userName: currentUser.name });
            }
        });
        socket.on('receive-location', (data) => {
            console.log('📍 موقع مستلم:', data);
            updateMapMarker(data.userName, data.lat, data.lng, data.time);
            showToast(`📍 تم تحديث موقع: ${data.userName}`);
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
        trackingMap = L.map('trackMap').setView([34.5, 9.5], 7);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
        }).addTo(trackingMap);
        console.log('✅ تم تهيئة الخريطة');
        
        // ✅ تعيين الموقع الافتراضي فوراً
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

function requestLocationPermission() {
    if (!currentUser) {
        showToast("الرجاء تسجيل الدخول أولاً", true);
        return;
    }
    
    if (currentUser.role !== "مسؤول") {
        showToast("غير مسموح - هذه الخاصية للمسؤول فقط", true);
        return;
    }
    
    if (!navigator.geolocation) {
        showToast("المتصفح لا يدعم تحديد الموقع", true);
        setDefaultLocation();
        return;
    }
    
    showToast("⏳ جاري طلب إذن الموقع...");
    document.getElementById('mapStatus').innerHTML = "⏳ جاري طلب إذن الموقع...";
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            showToast(`✅ تم منح إذن الموقع! ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
            document.getElementById('mapStatus').innerHTML = `✅ تم منح إذن الموقع: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            updateGpsStatus(true, 'مصرح');
            
            // تحديث الخريطة إلى الموقع الحقيقي
            if (trackingMap) {
                trackingMap.setView([latitude, longitude], 15);
                updateMapMarker(currentUser.name, latitude, longitude, new Date().toISOString());
            }
            startTracking();
        },
        (error) => {
            console.error('خطأ:', error);
            document.getElementById('mapStatus').innerHTML = `❌ تعذر الحصول على الإذن: ${error.message}`;
            
            if (error.code === 1) {
                showToast("❌ تم رفض الإذن. سيتم استخدام الموقع الافتراضي", true);
                setDefaultLocation();
                document.getElementById('mapStatus').innerHTML = "📍 تم تعيين الموقع الافتراضي: تونس";
            } else {
                showToast(`❌ خطأ: ${error.message}`, true);
                setDefaultLocation();
            }
            updateGpsStatus(false, 'مرفوض');
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
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
    
    if (!navigator.geolocation) {
        showToast("المتصفح لا يدعم تحديد الموقع", true);
        setDefaultLocation();
        return;
    }
    
    if (!socket) initSocket();
    if (!trackingMap) initTrackingMap();
    
    showToast("⏳ جاري الحصول على موقعك...");
    document.getElementById('mapStatus').innerHTML = "⏳ جاري الحصول على موقعك...";
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            
            if (socket && currentUser) {
                socket.emit('send-location', {
                    userName: currentUser.name,
                    userRole: currentUser.role,
                    lat: latitude,
                    lng: longitude
                });
                updateMapMarker(currentUser.name, latitude, longitude, new Date().toISOString());
                document.getElementById('mapStatus').innerHTML = `📍 موقعك الحقيقي: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
                showToast(`✅ تم تحديد موقعك بدقة`);
                updateGpsStatus(true, 'مباشر');
            }
            
            fetch('/api/locations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userName: currentUser.name,
                    userRole: currentUser.role,
                    lat: latitude,
                    lng: longitude
                })
            }).catch(err => console.error('خطأ في حفظ الموقع:', err));
            
            if (trackingInterval) {
                clearInterval(trackingInterval);
            }
            
            trackingInterval = setInterval(() => {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const newLat = pos.coords.latitude;
                        const newLng = pos.coords.longitude;
                        
                        if (socket && currentUser) {
                            socket.emit('send-location', {
                                userName: currentUser.name,
                                userRole: currentUser.role,
                                lat: newLat,
                                lng: newLng
                            });
                            updateMapMarker(currentUser.name, newLat, newLng, new Date().toISOString());
                            document.getElementById('mapStatus').innerHTML = `📍 تحديث الموقع: ${newLat.toFixed(6)}, ${newLng.toFixed(6)}`;
                        }
                        
                        fetch('/api/locations', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                userName: currentUser.name,
                                userRole: currentUser.role,
                                lat: newLat,
                                lng: newLng
                            })
                        }).catch(err => console.error('خطأ في حفظ الموقع:', err));
                    },
                    (error) => {
                        console.error('خطأ في تحديث الموقع:', error);
                        document.getElementById('mapStatus').innerHTML = `❌ خطأ في تحديث الموقع: ${error.message}`;
                    },
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                );
            }, 10000);
        },
        (error) => {
            console.error('خطأ في الحصول على الموقع:', error);
            document.getElementById('mapStatus').innerHTML = `❌ تعذر الحصول على الموقع: ${error.message}`;
            showToast(`❌ خطأ في GPS: ${error.message}`, true);
            updateGpsStatus(false, 'خطأ');
            
            if (error.code === 1) {
                showToast("⚠️ سيتم استخدام الموقع الافتراضي", true);
                setDefaultLocation();
            }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    
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
        const locations = await response.json();
        if (!trackingMap) initTrackingMap();
        
        Object.values(trackingMarkers).forEach(marker => marker.remove());
        trackingMarkers = {};
        
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
        showToast("📍 تم تعيين الموقع الافتراضي", true);
    }
}

function centerMapOnUser() {
    if (!trackingMap) initTrackingMap();
    if (currentUser?.role !== "مسؤول") {
        showToast("غير مسموح - هذه الخاصية للمسؤول فقط", true);
        return;
    }
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                trackingMap.setView([pos.coords.latitude, pos.coords.longitude], 15);
                showToast("🎯 تم التمركز على موقعك");
            },
            () => {
                showToast("لا يمكن الحصول على موقعك، استخدم الموقع الافتراضي", true);
                setDefaultLocation();
            },
            { enableHighAccuracy: true }
        );
    } else {
        showToast("المتصفح لا يدعم تحديد الموقع", true);
        setDefaultLocation();
    }
}

function logUserLocation() {
    if (!currentUser) return;
    if (currentUser.role !== "مسؤول") return;
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                await logActivity("دخول من موقع", `قام بتسجيل الدخول من: ${latitude}, ${longitude}`);
                try {
                    await fetch('/api/locations', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userName: currentUser.name,
                            userRole: currentUser.role,
                            lat: latitude,
                            lng: longitude,
                            action: 'تسجيل دخول'
                        })
                    });
                } catch(e) {
                    console.error('خطأ في حفظ موقع الدخول:', e);
                }
            },
            (error) => {
                console.log('لا يمكن تحديد موقع الدخول:', error.message);
            },
            { enableHighAccuracy: true, timeout: 5000 }
        );
    }
}
