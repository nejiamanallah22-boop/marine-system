<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>🗺️ المراقبة الحية — منظومة الوسائل البحرية</title>

<!-- ✅ Leaflet — نسخة واحدة فقط -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
        font-family: 'Cairo', 'Segoe UI', sans-serif;
        background: #0a0e1a;
        color: #e8edf5;
        min-height: 100vh;
        overflow-x: hidden;
    }

    /* ===== HEADER ===== */
    .mon-header {
        background: linear-gradient(135deg, rgba(96,165,250,0.1), rgba(74,222,128,0.05));
        border-bottom: 1px solid rgba(255,255,255,0.06);
        padding: 16px 24px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        position: sticky;
        top: 0;
        z-index: 1000;
        backdrop-filter: blur(12px);
    }

    .mon-header .title {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 18px;
        font-weight: 900;
        color: #f7d774;
    }

    .mon-header .title i {
        font-size: 24px;
        color: #60a5fa;
    }

    .mon-header .status {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        color: rgba(255,255,255,0.5);
        flex-wrap: wrap;
    }

    .mon-header .status .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #4ade80;
        box-shadow: 0 0 10px #4ade80;
        animation: pulse 2s infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
    }

    .mon-header .badge {
        background: rgba(96,165,250,0.15);
        color: #60a5fa;
        padding: 4px 12px;
        border-radius: 20px;
        font-weight: 700;
        font-size: 11px;
    }

    /* ===== MAIN LAYOUT ===== */
    .mon-container {
        display: grid;
        grid-template-columns: 1fr 340px;
        gap: 0;
        height: calc(100vh - 68px);
    }

    /* ===== MAP ===== */
    #map {
        width: 100%;
        height: 100%;
        background: #0a0e1a;
    }

    .leaflet-container {
        background: #0a0e1a !important;
    }

    /* ===== SIDEBAR ===== */
    .mon-sidebar {
        background: #0f1420;
        border-left: 1px solid rgba(255,255,255,0.06);
        overflow-y: auto;
        padding: 16px;
    }

    .mon-sidebar::-webkit-scrollbar { width: 6px; }
    .mon-sidebar::-webkit-scrollbar-thumb {
        background: rgba(96,165,250,0.3);
        border-radius: 10px;
    }

    .sidebar-section {
        margin-bottom: 20px;
    }

    .sidebar-section h3 {
        font-size: 13px;
        color: #60a5fa;
        margin-bottom: 10px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .sidebar-section h3 .count {
        background: rgba(96,165,250,0.15);
        color: #60a5fa;
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 10px;
        margin-right: auto;
    }

    .user-item {
        background: rgba(255,255,255,0.02);
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 10px;
        padding: 10px 12px;
        margin-bottom: 8px;
        transition: all 0.2s;
        cursor: pointer;
    }

    .user-item:hover {
        background: rgba(255,255,255,0.05);
        border-color: rgba(96,165,250,0.3);
        transform: translateX(-3px);
    }

    .user-item.me {
        border-right: 3px solid #fbbf24;
    }

    .user-item.has-location {
        border-right: 3px solid #4ade80;
    }

    .user-item .name {
        font-weight: 700;
        font-size: 13px;
        color: rgba(255,255,255,0.9);
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .user-item .meta {
        font-size: 10.5px;
        color: rgba(255,255,255,0.4);
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }

    .user-item .meta .tag {
        background: rgba(96,165,250,0.1);
        color: #60a5fa;
        padding: 1px 7px;
        border-radius: 8px;
        font-weight: 600;
    }

    .user-item .meta .tag.online {
        background: rgba(74,222,128,0.15);
        color: #4ade80;
    }

    .user-item .meta .tag.offline {
        background: rgba(148,163,184,0.15);
        color: #94a3b8;
    }

    .user-item .coords {
        font-size: 9.5px;
        color: rgba(255,255,255,0.25);
        font-family: monospace;
        margin-top: 4px;
    }

    .no-data {
        text-align: center;
        padding: 20px 10px;
        color: rgba(255,255,255,0.2);
        font-size: 12px;
    }

    .no-data i {
        font-size: 24px;
        display: block;
        margin-bottom: 8px;
        opacity: 0.4;
    }

    /* ===== LOADING ===== */
    .mon-loading {
        position: fixed;
        inset: 0;
        background: rgba(10,14,26,0.95);
        z-index: 9999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        transition: opacity 0.4s;
    }

    .mon-loading.hidden {
        opacity: 0;
        pointer-events: none;
    }

    .mon-loading .spinner {
        width: 50px;
        height: 50px;
        border: 3px solid rgba(96,165,250,0.2);
        border-top-color: #60a5fa;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .mon-loading .text {
        color: #60a5fa;
        font-size: 14px;
        font-weight: 700;
    }

    /* ===== RESPONSIVE ===== */
    @media (max-width: 900px) {
        .mon-container {
            grid-template-columns: 1fr;
            grid-template-rows: 1fr 280px;
            height: calc(100vh - 68px);
        }
        .mon-sidebar {
            border-left: none;
            border-top: 1px solid rgba(255,255,255,0.06);
        }
    }

    @media (max-width: 600px) {
        .mon-header { padding: 12px 16px; }
        .mon-header .title { font-size: 15px; }
        .mon-header .title i { font-size: 20px; }
    }
</style>
</head>
<body>

<!-- ===== HEADER ===== -->
<header class="mon-header">
    <div class="title">
        <i class="fas fa-satellite-dish"></i>
        <span>المراقبة الحية</span>
        <span class="badge">v12.2</span>
    </div>
    <div class="status">
        <span class="dot"></span>
        <span id="statusText">جاري التحميل...</span>
        <span>|</span>
        <span id="lastUpdate">—</span>
    </div>
</header>

<!-- ===== CONTAINER ===== -->
<div class="mon-container">
    <div id="map"></div>
    <aside class="mon-sidebar">
        <div class="sidebar-section">
            <h3>
                <i class="fas fa-users"></i>
                <span>المستخدمون النشطون</span>
                <span class="count" id="usersCount">0</span>
            </h3>
            <div id="usersList">
                <div class="no-data">
                    <i class="fas fa-spinner fa-spin"></i>
                    جاري التحميل...
                </div>
            </div>
        </div>

        <div class="sidebar-section">
            <h3>
                <i class="fas fa-key"></i>
                <span>الجلسات النشطة</span>
                <span class="count" id="sessionsCount">0</span>
            </h3>
            <div id="sessionsList">
                <div class="no-data">
                    <i class="fas fa-spinner fa-spin"></i>
                    جاري التحميل...
                </div>
            </div>
        </div>
    </aside>
</div>

<!-- ===== LOADING ===== -->
<div class="mon-loading" id="monLoading">
    <div class="spinner"></div>
    <div class="text">جاري تهيئة الخريطة...</div>
</div>

<script>
(function() {
    'use strict';

    console.log('🔄 monitoring.html v12.2 - loading...');

    // ============================================================
    // CLEANUP
    // ============================================================
    var _isDestroyed = false;
    var _intervals = [];
    var _timeouts = [];
    var _listeners = [];

    function _cleanup() {
        if (_isDestroyed) return;
        _isDestroyed = true;

        _intervals.forEach(function(id) { try { clearInterval(id); } catch(e){} });
        _timeouts.forEach(function(id) { try { clearTimeout(id); } catch(e){} });
        _listeners.forEach(function(l) {
            try { if (l.el && l.fn) l.el.removeEventListener(l.type, l.fn); } catch(e){}
        });
        _intervals = []; _timeouts = []; _listeners = [];

        try {
            if (window._geoWatchId != null && navigator.geolocation) {
                navigator.geolocation.clearWatch(window._geoWatchId);
                console.log('📍 Geolocation tracking stopped');
            }
        } catch(e){}

        try {
            if (window.map && typeof window.map.remove === 'function') {
                window.map.remove();
                window.map = null;
            }
        } catch(e){}

        console.log('🧹 Monitoring v12.2 cleanup done');
    }

    window._pageCleanup = window._pageCleanup || [];
    window._pageCleanup.push(_cleanup);
    window.addEventListener('beforeunload', _cleanup);
    window.addEventListener('pagehide', _cleanup);

    // ============================================================
    // STATE
    // ============================================================
    var map = null;
    var myMarker = null;
    var userMarkers = new Map();   // userId -> marker
    var myLocation = null;
    var myId = null;
    var users = [];
    var sessions = [];
    var locations = [];
    var mapInitialized = false;

    // ============================================================
    // HELPERS
    // ============================================================
    function getToken() {
        try {
            return localStorage.getItem('marine_auth_token')
                || localStorage.getItem('marine_token')
                || localStorage.getItem('token')
                || sessionStorage.getItem('token')
                || '';
        } catch(e) { return ''; }
    }

    function getCsrf() {
        try {
            var m = document.cookie.match(/marine_csrf=([^;]+)/);
            return m ? decodeURIComponent(m[1]) : '';
        } catch(e) { return ''; }
    }

    function authHeaders() {
        var h = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
        var t = getToken();
        if (t) h['Authorization'] = 'Bearer ' + t;
        var c = getCsrf();
        if (c) h['X-CSRF-Token'] = c;
        return h;
    }

    function fetchJSON(url, opts) {
        opts = opts || {};
        opts.headers = Object.assign({}, authHeaders(), opts.headers || {});
        opts.credentials = 'include';
        return fetch(url, opts).then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        });
    }

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s).replace(/[&<>"']/g, function(m) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m];
        });
    }

    function formatTimeAgo(iso) {
        try {
            var d = new Date(iso);
            var diff = Date.now() - d.getTime();
            var s = Math.floor(diff / 1000);
            if (s < 60) return 'الآن';
            if (s < 3600) return Math.floor(s / 60) + ' د';
            if (s < 86400) return Math.floor(s / 3600) + ' س';
            return Math.floor(s / 86400) + ' ي';
        } catch(e) { return '—'; }
    }

    function readMyUser() {
        try {
            var keys = ['marine_user', 'currentUser', 'user'];
            for (var i = 0; i < keys.length; i++) {
                var raw = localStorage.getItem(keys[i]) || sessionStorage.getItem(keys[i]);
                if (raw) {
                    var p = JSON.parse(raw);
                    if (p && (p.id || p._id)) {
                        return p;
                    }
                }
            }
        } catch(e) {}
        return null;
    }

    // ============================================================
    // INIT MAP
    // ============================================================
    function initMap() {
        if (mapInitialized || _isDestroyed) return;
        var el = document.getElementById('map');
        if (!el) return;

        try {
            map = L.map('map', {
                center: [36.8, 10.18],
                zoom: 8,
                zoomControl: true,
                attributionControl: false
            });

            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 19,
                subdomains: 'abcd'
            }).addTo(map);

            mapInitialized = true;
            console.log('✅ Map initialized');
        } catch(e) {
            console.warn('❌ Map init error:', e.message);
        }
    }

    // ============================================================
    // SEND MY LOCATION
    // ============================================================
    function sendLocationToServer(coords) {
        if (_isDestroyed) return;
        var payload = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy || null
        };

        fetchJSON('/api/locations', {
            method: 'POST',
            body: JSON.stringify(payload)
        })
        .then(function() {
            console.log('📍 Location sent:', coords.latitude.toFixed(4), coords.longitude.toFixed(4));
        })
        .catch(function(err) {
            console.warn('[GEO] send error:', err.message);
        });
    }

    function startGeolocation() {
        if (!navigator.geolocation || _isDestroyed) return;

        window._geoWatchId = navigator.geolocation.watchPosition(
            function(pos) {
                myLocation = pos.coords;
                sendLocationToServer(pos.coords);
                updateMyMarker(pos.coords);
            },
            function(err) {
                console.warn('[GEO] watch error:', err.message);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
        );

        console.log('📍 Geolocation tracking started, watchId:', window._geoWatchId);
    }

    // ============================================================
    // UPDATE MY MARKER (golden)
    // ============================================================
    function updateMyMarker(coords) {
        if (!map || !mapInitialized || _isDestroyed) return;
        try {
            var ll = [coords.latitude, coords.longitude];
            if (!myMarker) {
                myMarker = L.circleMarker(ll, {
                    radius: 11,
                    fillColor: '#fbbf24',
                    color: '#fff',
                    weight: 3,
                    opacity: 1,
                    fillOpacity: 0.95
                }).addTo(map);
                myMarker.bindPopup('<b>🟡 أنت</b><br>موقعك الحالي');
            } else {
                myMarker.setLatLng(ll);
            }
        } catch(e) {
            console.warn('[MAP] my marker error:', e.message);
        }
    }

    // ============================================================
    // ✅ ADD MARKERS — كل المواقع (بما فيها موقعك)
    // ============================================================
    function addMarkers(locs, allUsers) {
        if (!map || !mapInitialized || _isDestroyed) return;

        console.log('🗺️ addMarkers: rendering', locs.length, 'of', allUsers.length, 'users');

        // إزالة markers القديمة (لكن ليس myMarker)
        userMarkers.forEach(function(m) {
            try { map.removeLayer(m); } catch(e){}
        });
        userMarkers.clear();

        var rendered = 0;

        locs.forEach(function(loc) {
            // ✅ مقارنة مرنة
            var isMe = false;
            try {
                var myIdStr = String(myId || '').trim();
                var locIdStr = String(loc.userId || loc.id || '').trim();
                isMe = myIdStr && locIdStr && (myIdStr === locIdStr);
            } catch(e) { isMe = false; }

            // ✅ تحقق من صحة الإحداثيات
            var lat = Number(loc.latitude);
            var lng = Number(loc.longitude);
            if (!isFinite(lat) || !isFinite(lng)) {
                console.warn('⚠️ Skipping invalid coords for:', loc.name);
                return;
            }

            // ✅ لا نُكرر موقعنا (myMarker موجود مسبقاً)
            if (isMe) return;

            try {
                var marker = L.circleMarker([lat, lng], {
                    radius: 9,
                    fillColor: '#60a5fa',
                    color: '#fff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.9
                });

                marker.bindPopup(
                    '<div style="font-family:Cairo,sans-serif;direction:rtl;text-align:right;min-width:180px">' +
                    '<b style="color:#60a5fa;font-size:14px">👤 ' + escapeHtml(loc.name || loc.username || 'مستخدم') + '</b><br>' +
                    '<span style="color:#94a3b8;font-size:12px">' + escapeHtml(loc.roleLabel || loc.role || '') + '</span>' +
                    (loc.region ? '<br><span style="color:#60a5fa;font-size:11px">📍 ' + escapeHtml(loc.region) + '</span>' : '') +
                    '<br><small style="color:#64748b">' + new Date(loc.timestamp).toLocaleString('ar-EG') + '</small>' +
                    '</div>'
                );

                marker.addTo(map);
                userMarkers.set(loc.userId || loc.id, marker);
                rendered++;
            } catch(e) {
                console.warn('⚠️ marker error:', e.message);
            }
        });

        if (rendered === 0) {
            console.log('ℹ️ No other users with location to display');
        } else {
            console.log('✅ Rendering', rendered, 'markers on map');
        }

        // ✅ fit bounds إذا كان هناك أكثر من موقع
        try {
            var allPoints = [];
            if (myLocation) allPoints.push([myLocation.latitude, myLocation.longitude]);
            locs.forEach(function(l) {
                var lat = Number(l.latitude), lng = Number(l.longitude);
                if (isFinite(lat) && isFinite(lng)) allPoints.push([lat, lng]);
            });
            if (allPoints.length > 1) {
                map.fitBounds(allPoints, { padding: [40, 40], maxZoom: 12 });
            }
        } catch(e) {}
    }

    // ============================================================
    // LOAD USERS + LOCATIONS
    // ============================================================
    function loadUsers() {
        if (_isDestroyed) return;
        Promise.all([
            fetchJSON('/api/monitoring/users').catch(function() { return { users: [] }; }),
            fetchJSON('/api/locations').catch(function() { return { locations: [] }; })
        ])
        .then(function(results) {
            if (_isDestroyed) return;
            var usersData = results[0] || {};
            var locsData = results[1] || {};

            users = Array.isArray(usersData) ? usersData : (usersData.users || []);
            locations = locsData.locations || [];

            console.log('📍 Locations available:', locations.length);
            console.log('✅ Loaded', users.length, 'users |', locations.length, 'with location | me:', (readMyUser() || {}).name || 'unknown');

            renderUsersList();
            addMarkers(locations, users);

            document.getElementById('usersCount').textContent = users.length;
        })
        .catch(function(err) {
            console.warn('[MONITORING] users/locations error:', err.message);
        });
    }

    // ============================================================
    // LOAD SESSIONS
    // ============================================================
    function loadSessions() {
        if (_isDestroyed) return;
        fetchJSON('/api/monitoring/sessions')
            .then(function(data) {
                if (_isDestroyed) return;
                sessions = (data && data.sessions) || [];
                console.log('✅ Loaded', sessions.length, 'sessions');
                renderSessionsList();
                document.getElementById('sessionsCount').textContent = sessions.length;
            })
            .catch(function(err) {
                console.warn('[MONITORING] sessions error:', err.message);
            });
    }

    // ============================================================
    // RENDER USERS LIST
    // ============================================================
    function renderUsersList() {
        var el = document.getElementById('usersList');
        if (!el) return;

        if (!users.length) {
            el.innerHTML = '<div class="no-data"><i class="fas fa-users-slash"></i>لا يوجد مستخدمون</div>';
            return;
        }

        var locationsByUser = {};
        locations.forEach(function(l) {
            locationsByUser[String(l.userId)] = l;
        });

        var html = '';
        users.forEach(function(u) {
            var uid = String(u.id || u._id || '');
            var loc = locationsByUser[uid];
            var isMe = String(myId) === uid;
            var hasLoc = !!loc;

            var classes = 'user-item';
            if (isMe) classes += ' me';
            else if (hasLoc) classes += ' has-location';

            html +=
                '<div class="' + classes + '" data-user-id="' + escapeHtml(uid) + '">' +
                    '<div class="name">' +
                        (isMe ? '🟡 ' : (hasLoc ? '🟢 ' : '⚪ ')) +
                        escapeHtml(u.name || u.username || 'مستخدم') +
                        (isMe ? ' <span style="color:#fbbf24;font-size:10px">(أنت)</span>' : '') +
                    '</div>' +
                    '<div class="meta">' +
                        '<span class="tag">' + escapeHtml(u.roleLabel || u.role || '') + '</span>' +
                        (u.region ? '<span class="tag">📍 ' + escapeHtml(u.region) + '</span>' : '') +
                        '<span class="tag ' + (hasLoc ? 'online' : 'offline') + '">' +
                            (hasLoc ? '🟢 موقع' : '⚪ لا موقع') +
                        '</span>' +
                    '</div>' +
                    (hasLoc ? '<div class="coords">' +
                        Number(loc.latitude).toFixed(4) + ', ' + Number(loc.longitude).toFixed(4) +
                        ' • ' + formatTimeAgo(loc.timestamp) +
                    '</div>' : '') +
                '</div>';
        });

        el.innerHTML = html;

        // Click → focus marker
        el.querySelectorAll('.user-item').forEach(function(item) {
            var handler = function() {
                var uid = this.getAttribute('data-user-id');
                if (String(uid) === String(myId) && myLocation && map) {
                    map.setView([myLocation.latitude, myLocation.longitude], 15);
                    if (myMarker) myMarker.openPopup();
                } else if (userMarkers.has(uid) && map) {
                    var m = userMarkers.get(uid);
                    var ll = m.getLatLng();
                    map.setView(ll, 15);
                    m.openPopup();
                }
            };
            item.addEventListener('click', handler);
            _listeners.push({ el: item, type: 'click', fn: handler });
        });
    }

    // ============================================================
    // RENDER SESSIONS LIST
    // ============================================================
    function renderSessionsList() {
        var el = document.getElementById('sessionsList');
        if (!el) return;

        if (!sessions.length) {
            el.innerHTML = '<div class="no-data"><i class="fas fa-key"></i>لا توجد جلسات</div>';
            return;
        }

        var html = '';
        sessions.forEach(function(s) {
            var active = s.expiresAt && s.expiresAt > Date.now();
            html +=
                '<div class="user-item">' +
                    '<div class="name">🔑 ' + escapeHtml(s.name || s.username || 'مستخدم') + '</div>' +
                    '<div class="meta">' +
                        '<span class="tag">' + escapeHtml(s.role || '') + '</span>' +
                        '<span class="tag ' + (active ? 'online' : 'offline') + '">' +
                            (active ? '🟢 نشطة' : '⚪ منتهية') +
                        '</span>' +
                    '</div>' +
                    '<div class="coords">بدأت: ' + formatTimeAgo(s.createdAt) + '</div>' +
                '</div>';
        });
        el.innerHTML = html;
    }

    // ============================================================
    // REFRESH ALL
    // ============================================================
    function refreshAll() {
        if (_isDestroyed) return;
        loadUsers();
        loadSessions();

        try {
            var el = document.getElementById('lastUpdate');
            if (el) el.textContent = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        } catch(e) {}
    }

    // ============================================================
    // INIT
    // ============================================================
    function init() {
        if (_isDestroyed) return;
        console.log('🚀 Initializing monitoring v12.2...');

        // My ID
        var me = readMyUser();
        myId = me ? String(me.id || me._id || '') : null;
        console.log('👤 My ID:', myId);

        // Update status
        var st = document.getElementById('statusText');
        if (st) st.textContent = 'متصل';

        // Init map
        initMap();

        // Start geolocation
        startGeolocation();

        // Hide loading
        var ld = document.getElementById('monLoading');
        if (ld) ld.classList.add('hidden');

        // First load
        refreshAll();

        // Auto refresh every 15s
        _intervals.push(setInterval(refreshAll, 15000));

        console.log('✅ Monitoring v12.2 ready');
    }

    // ============================================================
    // BOOT
    // ============================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            _timeouts.push(setTimeout(init, 100));
        });
    } else {
        _timeouts.push(setTimeout(init, 100));
    }

    // Expose for debugging
    window.monitoringDebug = {
        refresh: refreshAll,
        getUsers: function() { return users; },
        getLocations: function() { return locations; },
        getSessions: function() { return sessions; },
        getMyId: function() { return myId; }
    };

    console.log('✅ monitoring.html v12.2 ready');

})();
</script>

</body>
</html>
