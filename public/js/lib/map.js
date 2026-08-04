// ============================================================
// الخريطة - map.js
// ============================================================

function initUserMap() {
    console.log('🗺️ Initializing map...');
    
    const mapContainer = document.getElementById('userMap');
    if (!mapContainer) {
        console.warn('⚠️ Map container not found, retrying...');
        if (mapRetryCount < 10) {
            mapRetryCount++;
            setTimeout(initUserMap, 500);
        }
        return;
    }

    if (userMap) {
        console.log('🔄 Map already exists, refreshing...');
        try {
            userMap.invalidateSize();
            loadUserLocations();
        } catch(e) {
            console.warn('⚠️ Error refreshing map:', e);
            userMap = null;
            mapInitialized = false;
            setTimeout(initUserMap, 300);
        }
        return;
    }

    if (typeof L === 'undefined') {
        console.warn('⚠️ Leaflet not loaded, retrying...');
        if (mapRetryCount < 5) {
            mapRetryCount++;
            setTimeout(initUserMap, 1000);
        }
        return;
    }

    const tunisiaCenter = [33.8869, 9.5375];

    try {
        userMap = L.map('userMap', {
            center: tunisiaCenter,
            zoom: 7,
            zoomControl: true,
            fadeAnimation: true,
            attributionControl: true
        });

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a> | Satellite',
            maxZoom: 19,
            minZoom: 3
        }).addTo(userMap);

        const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19
        });

        const googleSatellite = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
            attribution: '&copy; Google',
            maxZoom: 20,
            subdomains: ['mt1', 'mt2', 'mt3']
        });

        const baseLayers = {
            "🛰️ ساتلايت (Esri)": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: '&copy; Esri',
                maxZoom: 19
            }),
            "🛰️ ساتلايت (Google)": googleSatellite,
            "🗺️ خريطة عادية": streetLayer
        };

        L.control.layers(baseLayers).addTo(userMap);
        L.control.scale({ position: 'bottomright', metric: true, imperial: false }).addTo(userMap);
        L.control.zoom({ position: 'topright' }).addTo(userMap);

        mapInitialized = true;
        mapRetryCount = 0;
        
        loadUserLocations();

        setTimeout(() => {
            if (userMap) {
                userMap.invalidateSize();
                console.log('✅ Map size updated');
            }
        }, 500);

        if (!window._mapResizeHandler) {
            window._mapResizeHandler = function() {
                if (userMap) {
                    setTimeout(() => {
                        try {
                            userMap.invalidateSize();
                        } catch(e) {}
                    }, 300);
                }
            };
            window.addEventListener('resize', window._mapResizeHandler);
        }

        console.log('✅ Map initialized successfully');

    } catch (error) {
        console.error('❌ Error initializing map:', error);
        if (mapRetryCount < 3) {
            mapRetryCount++;
            setTimeout(initUserMap, 1000);
        }
    }
}

function loadUserLocations() {
    if (!userMap) {
        console.warn('⚠️ Map not initialized, cannot load locations');
        return;
    }

    try {
        userMarkers.forEach(marker => {
            try {
                userMap.removeLayer(marker);
            } catch (e) {}
        });
    } catch(e) {}
    userMarkers = [];

    const userLocations = [
        { name: 'مدير النظام', role: 'مسؤول', status: 'online', lat: 36.8065, lng: 10.1815, city: 'تونس', device: 'Chrome / Windows', ip: '192.168.1.1', lastActive: 'الآن' },
        { name: 'مدير العمليات', role: 'مشرف', status: 'online', lat: 35.8277, lng: 10.6420, city: 'سوسة', device: 'Firefox / Mac', ip: '192.168.1.2', lastActive: 'منذ 5 دقائق' },
        { name: 'محرر', role: 'محرر', status: 'idle', lat: 34.7396, lng: 10.7600, city: 'صفاقس', device: 'Safari / iPhone', ip: '192.168.1.3', lastActive: 'منذ 15 دقيقة' },
        { name: 'مشاهد', role: 'مشاهد', status: 'offline', lat: 33.8869, lng: 9.5375, city: 'القيروان', device: 'Edge / Windows', ip: '192.168.1.4', lastActive: 'منذ ساعة' },
        { name: 'فني صيانة', role: 'محرر', status: 'online', lat: 37.2744, lng: 9.8739, city: 'بنزرت', device: 'Chrome / Android', ip: '192.168.1.5', lastActive: 'منذ دقيقتين' }
    ];

    const statusColors = {
        'online': '#4ade80',
        'idle': '#fbbf24',
        'offline': '#f87171'
    };

    const statusLabels = {
        'online': '🟢 نشط',
        'idle': '🟡 غير نشط',
        'offline': '🔴 غير متصل'
    };

    userLocations.forEach(user => {
        try {
            const icon = L.divIcon({
                className: 'custom-div-icon',
                html: `
                    <div style="
                        background: rgba(0,0,0,0.85);
                        border-radius: 12px;
                        padding: 6px 12px 6px 8px;
                        border: 2px solid ${statusColors[user.status]};
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        box-shadow: 0 4px 15px rgba(0,0,0,0.5);
                        font-size: 12px;
                        color: white;
                        white-space: nowrap;
                        font-family: 'Cairo', sans-serif;
                        backdrop-filter: blur(4px);
                    ">
                        <span style="
                            width: 10px;
                            height: 10px;
                            border-radius: 50%;
                            background: ${statusColors[user.status]};
                            display: inline-block;
                            animation: ${user.status === 'online' ? 'pulse 1.5s infinite' : 'none'};
                            box-shadow: 0 0 10px ${statusColors[user.status]}40;
                        "></span>
                        <span style="font-weight:bold;">${user.name}</span>
                        <span style="font-size:10px; opacity:0.6;">${user.role}</span>
                    </div>
                `,
                iconSize: [150, 35],
                iconAnchor: [75, 17],
                className: 'user-marker-icon'
            });

            const popupContent = `
                <div style="text-align:right; font-family:'Cairo',sans-serif; min-width:200px; padding:4px;">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:8px;">
                        <div style="font-size:28px;">👤</div>
                        <div>
                            <div style="font-weight:bold; font-size:16px; color:#1a1a2e;">${user.name}</div>
                            <div style="font-size:12px; color:#666;">${user.role}</div>
                        </div>
                    </div>
                    <div style="font-size:13px; color:#444; line-height:1.8;">
                        <div>📍 <strong>${user.city}</strong></div>
                        <div>💻 ${user.device}</div>
                        <div>🌐 ${user.ip}</div>
                        <div>🕐 ${user.lastActive}</div>
                        <div style="margin-top:6px;">
                            <span class="status-badge ${user.status}" style="padding:2px 12px; border-radius:10px; font-size:11px; background:${statusColors[user.status]}20; color:${statusColors[user.status]};">
                                ${statusLabels[user.status]}
                            </span>
                        </div>
                        <div style="margin-top:4px; font-size:10px; color:#999;">
                            🛰️ ${user.lat}, ${user.lng}
                        </div>
                    </div>
                </div>
            `;

            const marker = L.marker([user.lat, user.lng], { icon: icon })
                .addTo(userMap)
                .bindPopup(popupContent, { maxWidth: 280 });

            userMarkers.push(marker);
        } catch(e) {
            console.warn('⚠️ Error adding marker for user:', user.name, e);
        }
    });

    if (userMarkers.length > 0) {
        try {
            const group = L.featureGroup(userMarkers);
            userMap.fitBounds(group.getBounds().pad(0.2));
        } catch(e) {
            console.warn('⚠️ Error fitting bounds:', e);
        }
    }
}

function refreshUserMap() {
    if (userMap) {
        loadUserLocations();
        setTimeout(() => {
            if (userMap) {
                try {
                    userMap.invalidateSize();
                } catch(e) {}
            }
        }, 200);
        showAlert('🔄 تم تحديث خريطة المواقع', 'success');
    } else {
        initUserMap();
    }
}

function startMapAutoRefresh() {
    if (mapRefreshInterval) {
        clearInterval(mapRefreshInterval);
    }
    mapRefreshInterval = setInterval(function() {
        if (document.getElementById('page-sessions')) {
            if (userMap) {
                try {
                    userMap.invalidateSize();
                    loadUserLocations();
                    console.log('🔄 Map refreshed automatically');
                } catch(e) {
                    console.warn('⚠️ Map refresh error:', e);
                }
            }
        }
    }, 30000);
}

console.log('✅ map.js loaded');
