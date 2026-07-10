// ==================== دوال الخريطة والتتبع ====================

let trackingMap = null;
let trackingMarkers = {};
let socket = null;
let watchId = null;
let lastSaved = 0;
const SAVE_INTERVAL = 30000;
const MIN_ACCURACY = 100;
let isFirstLocation = true;

function setDefaultLocation() {
    if (!trackingMap) {
        initTrackingMap();
        return;
    }
    document.getElementById('mapStatus').innerHTML = '⚠️ لا يوجد موقع GPS - يرجى تفعيل الموقع';
    console.log('⚠️ لا يوجد موقع GPS حقيقي');
    
    if (trackingMarkers['default']) {
        trackingMarkers['default'].remove();
        delete trackingMarkers['default'];
    }
}

function initSocket() {
    if (socket) return;
    try {
        socket = io();
        socket.on('connect', () => {
            console.log('✅ متصل بـ Socket.IO');
            if (currentUser && currentUser.lat && currentUser.lng) {
                socket.emit('user-connected', { 
                    userName: currentUser.name,
                    userRole: currentUser.role,
                    lat: currentUser.lat,
                    lng: currentUser.lng
                });
            }
        });
        socket.on('receive-location', (data) => {
            console.log('📍 موقع مستلم:', data);
            if (data.lat && data.lng) {
                updateMapMarker(data.userName, data.lat, data.lng, data.time);
                showToast(`📍 تم تحديث موقع: ${data.userName}`);
            }
        });
        socket.on('user-list', (users) => {
            console.log('👥 قائمة المستخدمين:', users);
            users.forEach(user => {
                if (user.lat && user.lng) {
                    updateMapMarker(user.userName, user.lat, user.lng, new Date().toISOString());
                }
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
        trackingMap = L.map('trackMap', {
            center: [36.8065, 10.1815],
            zoom: 7
        });
        
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
        }).addTo(trackingMap);
        
        console.log('✅ تم تهيئة الخريطة');
        
        setTimeout(() => {
            setDefaultLocation();
            if (trackingMap) trackingMap.invalidateSize();
        }, 500);
        
    } catch(e) {
        console.error('خطأ في الخريطة:', e);
        showToast('❌ خطأ في تحميل الخريطة', true);
    }
}

function updateMapMarker(userName, lat, lng, time) {
    if (!trackingMap) {
        initTrackingMap();
        if (!trackingMap) return;
    }
    
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
        console.warn('⚠️ إحداثيات غير صالحة لـ:', userName);
        return;
    }
    
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
    
    if (userName === currentUser?.name && isFirstLocation) {
        trackingMap.setView([lat, lng], 15);
        isFirstLocation = false;
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

function startTracking() {
    if (!currentUser) {
        showToast("الرجاء تسجيل الدخول أولاً", true);
        return;
    }

    if (!navigator.geolocation) {
        showToast("GPS غير مدعوم في هذا المتصفح", true);
        return;
    }

    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }

    isFirstLocation = true;
    showToast("⏳ بدء التتبع المباشر...", false);
    document.getElementById('mapStatus').innerHTML = "⏳ جاري التتبع...";

    watchId = navigator.geolocation.watchPosition(
        async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;

            if (accuracy > MIN_ACCURACY) {
                console.log(`⚠️ موقع غير دقيق (${accuracy}m)، تم تجاهله`);
                return;
            }

            console.log(`📍 تحديث موقع ${currentUser.name}: ${lat}, ${lng} (دقة: ${accuracy}m)`);

            currentUser.lat = lat;
            currentUser.lng = lng;

            updateMapMarker(currentUser.name, lat, lng, new Date().toISOString());

            if (socket) {
                socket.emit('update-location', {
                    userName: currentUser.name,
                    userRole: currentUser.role,
                    lat: lat,
                    lng: lng,
                    accuracy: accuracy
                });
            }

            const now = Date.now();
            if (now - lastSaved > SAVE_INTERVAL) {
                await saveUserLocationSecure(currentUser.name, lat, lng);
                lastSaved = now;
            }

            updateGpsStatus(true, `مباشر (دقة ${accuracy}m)`);
            document.getElementById('mapStatus').innerHTML = `📍 ${lat.toFixed(6)}, ${lng.toFixed(6)} (دقة ${accuracy}m)`;

        },
        (error) => {
            console.error('❌ خطأ في GPS:', error.message);
            showToast(`❌ خطأ في التتبع: ${error.message}`, true);
            
            if (error.code === 1) {
                showToast("⚠️ يرجى السماح بالوصول إلى الموقع في إعدادات المتصفح", true);
            }
            
            updateGpsStatus(false, 'خطأ');
            document.getElementById('mapStatus').innerHTML = `❌ خطأ: ${error.message}`;
        },
        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 30000
        }
    );

    document.getElementById('startTrackingBtn').style.display = 'none';
    document.getElementById('stopTrackingBtn').style.display = 'inline-block';
}

function stopTracking() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        console.log('⏹️ تم إيقاف التتبع');
    }
    
    document.getElementById('startTrackingBtn').style.display = 'inline-block';
    document.getElementById('stopTrackingBtn').style.display = 'none';
    document.getElementById('mapStatus').innerHTML = '⏹️ توقف التتبع';
    updateGpsStatus(false, 'متوقف');
    showToast("⏹️ تم إيقاف التتبع");
}

async function saveUserLocationSecure(userName, lat, lng) {
    if (!currentUser || !currentUser.token) {
        console.warn('⚠️ لا يوجد توكن لحفظ الموقع');
        return;
    }
    
    try {
        const response = await fetch('/api/locations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify({
                lat: lat,
                lng: lng,
                action: 'تحديث موقع'
            })
        });
        
        if (!response.ok) {
            throw new Error(await response.text());
        }
        
        console.log(`📍 تم حفظ موقع ${userName}: ${lat}, ${lng}`);
    } catch(e) {
        console.error('❌ خطأ في حفظ الموقع:', e);
    }
}

function requestLocationPermission() {
    if (!currentUser) {
        showToast("الرجاء تسجيل الدخول أولاً", true);
        return;
    }
    
    if (!navigator.geolocation) {
        showToast("المتصفح لا يدعم تحديد الموقع", true);
        return;
    }
    
    showToast("⏳ جاري طلب إذن الموقع...", false);
    document.getElementById('mapStatus').innerHTML = "⏳ جاري طلب الإذن...";
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            
            currentUser.lat = lat;
            currentUser.lng = lng;
            
            showToast(`✅ تم منح الإذن! دقة: ${accuracy}m`, false);
            document.getElementById('mapStatus').innerHTML = `✅ موقعك: ${lat.toFixed(6)}, ${lng.toFixed(6)} (دقة ${accuracy}m)`;
            
            updateMapMarker(currentUser.name, lat, lng, new Date().toISOString());
            updateGpsStatus(true, 'مصرح');
            
            startTracking();
        },
        (error) => {
            console.error('❌ خطأ:', error);
            document.getElementById('mapStatus').innerHTML = `❌ تعذر الحصول على الإذن: ${error.message}`;
            
            if (error.code === 1) {
                showToast("❌ تم رفض الإذن. يرجى السماح يدوياً في إعدادات المتصفح", true);
                showToast("💡 اضغط على 🔒 القفل → إعدادات الموقع → سماح", true);
            } else {
                showToast(`❌ خطأ: ${error.message}`, true);
            }
            updateGpsStatus(false, 'مرفوض');
        },
        { 
            enableHighAccuracy: true, 
            timeout: 30000, 
            maximumAge: 0 
        }
    );
}

async function loadLocations() {
    if (!currentUser || !currentUser.token) {
        console.warn('⚠️ لا يوجد توكن لتحميل المواقع');
        setDefaultLocation();
        return;
    }
    
    try {
        const response = await fetch('/api/locations', {
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });
        
        if (response.status === 429) {
            console.warn('⚠️ تجاوزت الحد المسموح');
            showToast('⚠️ كثرة الطلبات، انتظر دقيقة', true);
            setDefaultLocation();
            return;
        }
        
        if (!response.ok) {
            throw new Error(await response.text());
        }
        
        const locations = await response.json();
        if (!trackingMap) initTrackingMap();
        
        Object.keys(trackingMarkers).forEach(key => {
            if (key !== 'default') {
                trackingMarkers[key].remove();
                delete trackingMarkers[key];
            }
        });
        
        if (locations.length === 0) {
            setDefaultLocation();
            showToast('📍 لا توجد مواقع محفوظة', false);
        } else {
            locations.forEach(loc => {
                if (loc.lat && loc.lng) {
                    updateMapMarker(loc.userName, loc.lat, loc.lng, loc.timestamp);
                }
            });
            showToast(`✅ تم تحميل ${locations.length} موقع محفوظ`);
        }
    } catch (err) {
        console.error('❌ خطأ في تحميل المواقع:', err);
        setDefaultLocation();
    }
}

function centerMapOnUser() {
    if (!trackingMap) initTrackingMap();
    if (currentUser?.role !== "مسؤول") {
        showToast("غير مسموح - هذه الخاصية للمسؤول فقط", true);
        return;
    }
    
    if (currentUser?.lat && currentUser?.lng) {
        trackingMap.setView([currentUser.lat, currentUser.lng], 15);
        showToast("🎯 تم التمركز على موقعك الحقيقي", false);
    } else {
        showToast("⚠️ لا يوجد موقع حقيقي، استخدم 'طلب إذن الموقع' أولاً", true);
        setDefaultLocation();
    }
}

// ============================================================
// ✅ تصدير الدوال
// ============================================================

window.initTrackingMap = initTrackingMap;
window.setDefaultLocation = setDefaultLocation;
window.loadLocations = loadLocations;
window.startTracking = startTracking;
window.stopTracking = stopTracking;
window.centerMapOnUser = centerMapOnUser;
window.requestLocationPermission = requestLocationPermission;
window.saveUserLocationSecure = saveUserLocationSecure;
window.updateMapMarker = updateMapMarker;

console.log('✅ map.js تم تحميله بنجاح');
