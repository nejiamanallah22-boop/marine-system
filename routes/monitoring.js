// routes/monitoring.js
'use strict';

// ============================================================
// 🚨 DEBUG LOG — لرؤية هذا السطر في Render Logs
// ============================================================
console.log('🚨 [MONITORING] v2.0 LOADED — routes: /users /sessions /location /session/end /stats /health');

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const User = require('../models/User');
const Session = require('../models/Session');
const auth = require('../middleware/auth');

// ============================================================
// 🛡️ Middleware للمصادقة من query (لـ sendBeacon)
// ============================================================
function authFromQueryOrHeader(req, res, next) {
    try {
        let token = null;

        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }
        if (!token && req.query.token) {
            token = req.query.token;
        }
        if (!token && req.cookies && req.cookies.token) {
            token = req.cookies.token;
        }

        if (!token) {
            return res.status(401).json({ error: 'غير مصادق' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = {
            id: decoded.id || decoded.userId || decoded.sub || decoded._id,
            role: decoded.role
        };

        if (!req.user.id) {
            return res.status(401).json({ error: 'توكن غير صالح' });
        }

        next();
    } catch (err) {
        return res.status(401).json({ error: 'توكن منتهي أو غير صالح' });
    }
}

// ============================================================
// 🔍 Helper: إيجاد المستخدم بواسطة UUID أو _id
// ============================================================
async function findUserByAnyId(userId) {
    if (!userId) return null;

    // أولاً: جرّب حقل id (UUID)
    let user = await User.findOne({ id: userId });
    if (user) return user;

    // ثانياً: إذا كان ObjectId صالح، جرّب _id
    if (/^[0-9a-fA-F]{24}$/.test(String(userId))) {
        user = await User.findById(userId);
        if (user) return user;
    }

    return null;
}

// ============================================================
// 📥 GET /api/monitoring/users
// ============================================================
router.get('/users', auth, async (req, res) => {
    try {
        const users = await User.find({})
            .select('id username email name role region isActive lat lng accuracy location lastLogin lastActive userAgent')
            .lean()
            .limit(500);

        const normalized = users.map(u => ({
            id: u.id || String(u._id),
            name: u.name || u.username || 'مستخدم',
            username: u.username || '',
            email: u.email || '',
            role: u.role || 'viewer',
            region: u.region || '',
            active: u.isActive !== false,
            lat: (typeof u.lat === 'number' && u.lat >= -90 && u.lat <= 90) ? u.lat : null,
            lng: (typeof u.lng === 'number' && u.lng >= -180 && u.lng <= 180) ? u.lng : null,
            accuracy: (typeof u.accuracy === 'number') ? u.accuracy : null,
            location: u.location || null,
            lastLogin: u.lastLogin || null,
            lastActive: u.lastActive || u.lastLogin || null,
            userAgent: u.userAgent || null
        }));

        res.json({ users: normalized, count: normalized.length });
    } catch (err) {
        console.error('[MONITORING] GET /users error:', err);
        res.status(500).json({ error: 'فشل تحميل المستخدمين' });
    }
});

// ============================================================
// 📥 GET /api/monitoring/sessions
// ============================================================
router.get('/sessions', auth, async (req, res) => {
    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        const sessions = await Session.find({
            status: 'active',
            lastActivity: { $gte: oneHourAgo }
        })
            .populate('userId', 'id name username email role')
            .sort({ lastActivity: -1 })
            .lean()
            .limit(200);

        const normalized = sessions.map(s => {
            const u = s.userId || {};
            return {
                id: s.sessionId || String(s._id),
                sessionId: s.sessionId || String(s._id),
                userId: u.id || String(u._id || s.userId || ''),
                name: u.name || u.username || 'مستخدم',
                username: u.username || '',
                email: u.email || '',
                role: u.role || 'viewer',
                createdAt: s.createdAt,
                lastActivity: s.lastActivity,
                status: s.status,
                userAgent: s.userAgent || null,
                lat: s.lat || null,
                lng: s.lng || null
            };
        });

        res.json({ sessions: normalized, count: normalized.length });
    } catch (err) {
        console.error('[MONITORING] GET /sessions error:', err);
        res.status(500).json({ error: 'فشل تحميل الجلسات' });
    }
});

// ============================================================
// 📍 POST /api/monitoring/location
// ============================================================
router.post('/location', auth, async (req, res) => {
    try {
        const { lat, lng, accuracy, userAgent } = req.body || {};

        // ✅ التحقق من الإحداثيات
        if (typeof lat !== 'number' || typeof lng !== 'number' ||
            !isFinite(lat) || !isFinite(lng) ||
            lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return res.status(400).json({ error: 'إحداثيات غير صالحة' });
        }

        const userId = req.user.id;
        const now = new Date();
        const ua = (userAgent || req.headers['user-agent'] || '').substring(0, 500);

        console.log('[MONITORING] POST /location — userId:', userId);

        // ✅ إيجاد المستخدم بـ id (UUID) أو _id
        const user = await findUserByAnyId(userId);

        if (!user) {
            console.warn('[MONITORING] User not found:', userId);
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        console.log('[MONITORING] User found:', user.username, '_id:', user._id);

        // ✅ تحديث المستخدم
        user.lat = Number(lat.toFixed(6));
        user.lng = Number(lng.toFixed(6));
        user.accuracy = (typeof accuracy === 'number') ? Math.round(accuracy) : null;
        user.userAgent = ua;
        user.lastActive = now;
        user.lastLatLngUpdate = now;
        await user.save();

        // ✅ تحديث/إنشاء الجلسة
        await Session.findOneAndUpdate(
            { userId: user._id, status: 'active' },
            {
                $set: {
                    lastActivity: now,
                    userAgent: ua,
                    lat: user.lat,
                    lng: user.lng
                },
                $setOnInsert: {
                    userId: user._id,
                    createdAt: now,
                    status: 'active',
                    sessionId: crypto.randomUUID()
                }
            },
            { upsert: true, new: true }
        );

        res.json({
            ok: true,
            ts: now.toISOString(),
            user: { id: user.id, name: user.name }
        });
    } catch (err) {
        console.error('[MONITORING] POST /location error:', err);
        res.status(500).json({ error: 'فشل تحديث الموقع', details: err.message });
    }
});

// ============================================================
// 🚪 POST /api/monitoring/session/end
// ============================================================
router.post('/session/end', authFromQueryOrHeader, async (req, res) => {
    try {
        const userId = req.user.id;
        const now = new Date();

        console.log('[MONITORING] POST /session/end — userId:', userId);

        const user = await findUserByAnyId(userId);
        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        const result = await Session.updateMany(
            { userId: user._id, status: 'active' },
            { $set: { status: 'ended', endedAt: now } }
        );

        console.log('[MONITORING] Session ended — count:', result.modifiedCount);
        res.json({ ok: true, ended: result.modifiedCount });
    } catch (err) {
        console.error('[MONITORING] POST /session/end error:', err);
        res.status(500).json({ error: 'فشل إغلاق الجلسة' });
    }
});

// ============================================================
// 📊 GET /api/monitoring/stats
// ============================================================
router.get('/stats', auth, async (req, res) => {
    try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

        const [totalUsers, activeUsers, admins, sessionsCount] = await Promise.all([
            User.countDocuments({}),
            User.countDocuments({ isActive: true, lastActive: { $gte: fiveMinAgo } }),
            User.countDocuments({ role: { $in: ['admin', 'manager'] }, isActive: true }),
            Session.countDocuments({
                status: 'active',
                lastActivity: { $gte: new Date(Date.now() - 3600000) }
            })
        ]);

        res.json({
            totalUsers,
            activeUsers,
            admins,
            sessionsCount,
            ts: new Date().toISOString()
        });
    } catch (err) {
        console.error('[MONITORING] GET /stats error:', err);
        res.status(500).json({ error: 'فشل تحميل الإحصائيات' });
    }
});

// ============================================================
// 🏥 GET /api/monitoring/health — للتشخيص
// ============================================================
router.get('/health', (req, res) => {
    res.json({
        ok: true,
        version: '2.0',
        routes: [
            'GET  /api/monitoring/users',
            'GET  /api/monitoring/sessions',
            'POST /api/monitoring/location',
            'POST /api/monitoring/session/end',
            'GET  /api/monitoring/stats',
            'GET  /api/monitoring/health'
        ],
        ts: new Date().toISOString()
    });
});

module.exports = router;
