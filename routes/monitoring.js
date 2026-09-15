// routes/monitoring.js
'use strict';

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// استيراد الـ models — عدّل المسارات حسب مشروعك
const User = require('../models/User');
const Session = require('../models/Session');

// استيراد middleware المصادقة
const auth = require('../middleware/auth');

// ============================================================
// 🛡️ Middleware مصادقة اختياري (يقرأ التوكن من query)
// يُستخدم مع sendBeacon التي لا تدعم headers
// ============================================================
function authFromQueryOrHeader(req, res, next) {
    try {
        let token = null;

        // 1) من Authorization header
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }

        // 2) من query (لـ sendBeacon)
        if (!token && req.query.token) {
            token = req.query.token;
        }

        // 3) من cookie
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
// 📥 GET /api/monitoring/users
// قائمة المستخدمين مع مواقعهم — للخريطة
// ============================================================
router.get('/users', auth, async (req, res) => {
    try {
        const users = await User.find({})
            .select('name username email role active isActive lat lng accuracy location lastLogin lastActive userAgent')
            .lean()
            .limit(500);

        const normalized = users.map(u => ({
            id: String(u._id),
            name: u.name || u.username || 'مستخدم',
            username: u.username || '',
            email: u.email || '',
            role: u.role || 'viewer',
            active: u.active !== false && u.isActive !== false,
            // ✅ التحقق من صحة الإحداثيات
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
// الجلسات النشطة
// ============================================================
router.get('/sessions', auth, async (req, res) => {
    try {
        // آخر ساعة فقط = نشطة
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        const sessions = await Session.find({
            status: 'active',
            lastActivity: { $gte: oneHourAgo }
        })
            .populate('userId', 'name username email role')
            .sort({ lastActivity: -1 })
            .lean()
            .limit(200);

        const normalized = sessions.map(s => {
            const u = s.userId || {};
            return {
                id: String(s._id),
                sessionId: s.sessionId || String(s._id),
                userId: String(u._id || s.userId || ''),
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
// استقبال موقع المستخدم الحالي + heartbeat
// ============================================================
router.post('/location', auth, async (req, res) => {
    try {
        const { lat, lng, accuracy, userAgent } = req.body || {};

        // ✅ التحقق من صحة الإحداثيات
        if (typeof lat !== 'number' || typeof lng !== 'number' ||
            !isFinite(lat) || !isFinite(lng) ||
            lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return res.status(400).json({ error: 'إحداثيات غير صالحة' });
        }

        const userId = req.user.id;
        const now = new Date();
        const ua = (userAgent || req.headers['user-agent'] || '').substring(0, 500);

        // ✅ تحديث بيانات المستخدم
        const updateResult = await User.findByIdAndUpdate(
            userId,
            {
                $set: {
                    lat: Number(lat.toFixed(6)),
                    lng: Number(lng.toFixed(6)),
                    accuracy: (typeof accuracy === 'number') ? Math.round(accuracy) : null,
                    userAgent: ua,
                    lastActive: now,
                    lastLatLngUpdate: now
                }
            },
            { new: false }
        );

        if (!updateResult) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        // ✅ تحديث/إنشاء الجلسة النشطة
        await Session.findOneAndUpdate(
            { userId, status: 'active' },
            {
                $set: {
                    lastActivity: now,
                    userAgent: ua,
                    lat: Number(lat.toFixed(6)),
                    lng: Number(lng.toFixed(6))
                },
                $setOnInsert: {
                    userId,
                    createdAt: now,
                    status: 'active',
                    sessionId: require('crypto').randomUUID()
                }
            },
            { upsert: true, new: true }
        );

        res.json({ ok: true, ts: now.toISOString() });
    } catch (err) {
        console.error('[MONITORING] POST /location error:', err);
        res.status(500).json({ error: 'فشل تحديث الموقع' });
    }
});

// ============================================================
// 🚪 POST /api/monitoring/session/end
// إغلاق الجلسة — يُستدعى من sendBeacon عند مغادرة الصفحة
// ============================================================
router.post('/session/end', authFromQueryOrHeader, async (req, res) => {
    try {
        const userId = req.user.id;
        const now = new Date();

        const result = await Session.updateMany(
            { userId, status: 'active' },
            { $set: { status: 'ended', endedAt: now } }
        );

        console.log('[MONITORING] Session ended for user:', userId, 'count:', result.modifiedCount);
        res.json({ ok: true, ended: result.modifiedCount });
    } catch (err) {
        console.error('[MONITORING] POST /session/end error:', err);
        res.status(500).json({ error: 'فشل إغلاق الجلسة' });
    }
});

// ============================================================
// 📊 GET /api/monitoring/stats — إحصائيات سريعة (اختياري)
// ============================================================
router.get('/stats', auth, async (req, res) => {
    try {
        const [totalUsers, activeUsers, admins, sessionsCount] = await Promise.all([
            User.countDocuments({}),
            User.countDocuments({ active: { $ne: false }, isActive: { $ne: false } }),
            User.countDocuments({ role: { $in: ['admin', 'manager'] } }),
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

module.exports = router;
