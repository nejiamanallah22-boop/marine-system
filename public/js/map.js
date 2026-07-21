// ============================================================
// 🗺️ map.js - الخريطة والتتبع (كامل)
// ============================================================

let map = null;
let trackMap = null;
let userMarker = null;
let trackingInterval = null;
let locationMarkers = [];

// ============================================================
// 🗺️ تهيئة الخريطة
// ============================================================

function initMap() {
  console.log('🗺️ map.js تم تحميله بنجاح');
  
  const container = document.getElementById('trackMap');
  if (!container) return;
  
  if (typeof L === 'undefined') {
    console.warn('⚠️ Leaflet not loaded');
    return;
  }
  
  try {
    map = L.map('trackMap').setView([36.8, 10.18], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);
    
    console.log('✅ Map initialized');
  } catch (error) {
    console.error('Map init error:', error);
  }
}

function initTrackMap() {
  if (trackMap) return;
  
  const container = document.getElementById('trackMap');
  if (!container) return;
  
  if (typeof L === 'undefined') {
    console.warn('⚠️ Leaflet not loaded');
    return;
  }
  
  try {
    trackMap = L.map('trackMap').setView([36.8, 10.18], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(trackMap);
    
    console.log('✅ Track map initialized');
  } catch (error) {
    console.error('Track map init error:', error);
  }
}

// ============================================================
// 📍 تتبع GPS
// ============================================================

function startTracking() {
  if (!navigator.geolocation) {
    showNotification('⚠️ المتصفح لا يدعم تحديد الموقع', 'warning');
    return;
  }
  
  const token = getToken();
  if (!token) {
    showNotification('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
    return;
  }
  
  const user = getUser();
  if (!user) {
    showNotification('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
    return;
  }
  
  document.getElementById('startTrackingBtn').style.display = 'none';
  document.getElementById('stopTrackingBtn').style.display = 'inline-block';
  document.getElementById('gpsStatusText').textContent = 'جاري التتبع...';
  document.getElementById('gpsDot').className = 'gps-status gps-active';
  
  trackingInterval = setInterval(() => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        if (map) {
          if (!userMarker) {
            userMarker = L.marker([lat, lng]).addTo(map);
          } else {
            userMarker.setLatLng([lat, lng]);
          }
          map.setView([lat, lng], 15);
        }
        
        const socket = window.socket || io();
        socket.emit('update-location', {
          userName: user.name,
          userRole: user.role,
          lat: lat,
          lng: lng
        });
        
        const token = getToken();
        if (token) {
          fetch('/api/locations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ lat, lng, action: 'تتبع مباشر' })
          })
          .catch(err => console.error('Save location error:', err));
        }
        
        document.getElementById('gpsStatusText').textContent = '✅ تتبع نشط';
        document.getElementById('mapStatus').textContent = '📍 موقعك الحالي: ' + lat.toFixed(6) + ', ' + lng.toFixed(6);
      },
      (error) => {
        console.error('GPS error:', error);
        document.getElementById('gpsStatusText').textContent = '❌ خطأ في GPS';
        document.getElementById('gpsDot').className = 'gps-status gps-inactive';
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }, 5000);
  
  showNotification('✅ بدء التتبع المباشر', 'success');
}

function stopTracking() {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }
  
  document.getElementById('startTrackingBtn').style.display = 'inline-block';
  document.getElementById('stopTrackingBtn').style.display = 'none';
  document.getElementById('gpsStatusText').textContent = 'غير نشط';
  document.getElementById('gpsDot').className = 'gps-status gps-inactive';
  document.getElementById('mapStatus').textContent = '⏹️ تم إيقاف التتبع';
  
  showNotification('⏹️ تم إيقاف التتبع', 'info');
}

function loadLocations() {
  const token = getToken();
  if (!token) {
    showNotification('⚠️ يرجى تسجيل الدخول أولاً', 'warning');
    return;
  }
  
  fetch('/api/locations', {
    headers: { 'Authorization': 'Bearer ' + token }
  })
  .then(res => res.json())
  .then(data => {
    if (!Array.isArray(data)) return;
    
    locationMarkers.forEach(marker => {
      if (map && marker) map.removeLayer(marker);
    });
    locationMarkers = [];
    
    data.forEach(loc => {
      if (loc.lat && loc.lng && map) {
        const marker = L.marker([loc.lat, loc.lng])
          .addTo(map)
          .bindPopup(`
            <b>${loc.userName || 'مجهول'}</b><br>
            ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}<br>
            ${loc.action || 'تحديث موقع'}<br>
            <small>${new Date(loc.timestamp).toLocaleString()}</small>
          `);
        locationMarkers.push(marker);
      }
    });
    
    showNotification(`✅ تم تحميل ${data.length} موقع`, 'success');
  })
  .catch(err => {
    console.error('Load locations error:', err);
    showNotification('❌ خطأ في تحميل المواقع', 'error');
  });
}

function centerMapOnUser() {
  if (!navigator.geolocation) {
    showNotification('⚠️ المتصفح لا يدعم تحديد الموقع', 'warning');
    return;
  }
  
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      
      if (map) {
        map.setView([lat, lng], 15);
        if (!userMarker) {
          userMarker = L.marker([lat, lng]).addTo(map);
        } else {
          userMarker.setLatLng([lat, lng]);
        }
      }
      
      if (trackMap) {
        trackMap.setView([lat, lng], 15);
      }
      
      showNotification('📍 تم التمركز على موقعك', 'success');
    },
    (error) => {
      console.error('GPS error:', error);
      showNotification('❌ خطأ في تحديد الموقع', 'error');
    },
    { enableHighAccuracy: true }
  );
}

function requestLocationPermission() {
  if (!navigator.geolocation) {
    showNotification('⚠️ المتصفح لا يدعم تحديد الموقع', 'warning');
    return;
  }
  
  navigator.geolocation.getCurrentPosition(
    (position) => {
      showNotification('✅ تم منح إذن الموقع', 'success');
      centerMapOnUser();
    },
    (error) => {
      console.error('Permission error:', error);
      showNotification('❌ تم رفض إذن الموقع', 'error');
    },
    { enableHighAccuracy: true }
  );
}

function refreshTrackUsers() {
  if (window.socket) {
    window.socket.emit('get-users');
  }
  showNotification('✅ تم تحديث قائمة المستخدمين', 'success');
}

function clearTrackUsers() {
  const body = document.getElementById('trackUsersBody');
  if (body) {
    body.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px;">🚫 تم مسح القائمة</td></tr>`;
  }
}

// ============================================================
// 🔄 تصدير للاستخدام العالمي
// ============================================================

window.initMap = initMap;
window.initTrackMap = initTrackMap;
window.startTracking = startTracking;
window.stopTracking = stopTracking;
window.loadLocations = loadLocations;
window.centerMapOnUser = centerMapOnUser;
window.requestLocationPermission = requestLocationPermission;
window.refreshTrackUsers = refreshTrackUsers;
window.clearTrackUsers = clearTrackUsers;
