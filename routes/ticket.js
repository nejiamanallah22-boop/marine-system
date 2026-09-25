// ============================================================
// 🎫 routes/ticket.js — v2.0
// ============================================================
// Professional Support Ticket Routes
// ✅ JWT Auth + CSRF + Rate Limiting
// ✅ RBAC (Admin / Owner)
// ✅ Screen Share Sessions
// ✅ Replies + Close + Delete
// ✅ Statistics
// ============================================================

'use strict';

const mongoose = require('mongoose');

// ============================================================
// 📤 MAIN EXPORT — Function-based router
// ============================================================
module.exports = function ticketRoutes(app, deps) {

    // ============================================================
    // 📦 DEPENDENCIES VALIDATION
    // ============================================================
    const {
        Ticket,
        User,
        authenticateAccessToken,
        csrfProtection,
        randomId,
        addSystemLog,
        notify,
        isAdminUser,
        validateString,
        normalizeRole,
        buildIdQuery
    } = deps || {};

    // ✅ Required
    if (!Ticket) {
        console.error('❌ routes/ticket.js: Ticket model is required');
        return;
    }
    if (typeof authenticateAccessToken !== 'function') {
        console.error('❌ routes/ticket.js: authenticateAccessToken is required');
        return;
    }

    // ✅ Optional fallbacks
    const safeCsrf = typeof csrfProtection === 'function'
        ? csrfProtection
        : (req, res, next) => next();

    const safeRandomId = typeof randomId === 'function'
        ? randomId
        : (len) => require('crypto').randomBytes(len || 16).toString('hex');

    const safeValidateString = typeof validateString === 'function'
        ? validateString
        : (v, opts) => {
            if (v === undefined || v === null) return opts && opts.required ? null : '';
            if (typeof v !== 'string') return null;
            const s = v.trim();
            if (opts && opts.max && s.length > opts.max) return null;
            if (opts && opts.min && s.length < opts.min) return null;
            if (opts && opts.required && !s) return null;
            return s;
        };

    const safeNormalizeRole = typeof normalizeRole === 'function'
        ? normalizeRole
        : (r) => {
            const map = {
                'مسؤول': 'admin', 'مدير': 'manager', 'محرر': 'editor',
                'مشغل': 'maintenance_unit', 'مشاهد': 'viewer',
                'admin': 'admin', 'manager': 'manager', 'editor': 'editor',
                'maintenance_unit': 'maintenance_unit', 'viewer': 'viewer'
            };
            return map[String(r || '').trim()] || 'viewer';
        };

    const safeIsAdmin = typeof isAdminUser === 'function'
        ? isAdminUser
        : (u) => {
            if (!u) return false;
            const r = safeNormalizeRole(u.role);
            return r === 'admin';
        };

    const safeBuildIdQuery = typeof buildIdQuery === 'function'
        ? buildIdQuery
        : (idParam) => {
            if (!idParam || typeof idParam !== 'string') return null;
            const t = idParam.trim();
            if (!t || t.length > 100) return null;
            if (/^[a-f0-9]{24}$/i.test(t) && mongoose.Types.ObjectId.isValid(t)) {
                return { _id: t };
            }
            return null;
        };

    const safeLog = typeof addSystemLog === 'function'
        ? addSystemLog
        : async () => {};

    const safeNotify = typeof notify === 'function'
        ? notify
        : async () => {};

    // ============================================================
    // 🛠️ CONSTANTS & HELPERS
    // ============================================================
    const VALID_PRIORITIES = [
        'منخفضة', 'متوسطة', 'عالية', 'عاجلة',
        'منخفض', 'متوسط', 'عالي', 'حرج'
    ];

    const VALID_CATEGORIES = [
        'فني', 'لوجستي', 'إداري', 'تشغيلي', 'أمني', 'أخرى'
    ];

    const VALID_STATUSES = [
        'مفتوحة', 'مفتوح',
        'قيد المعالجة', 'قيد التنفيذ',
        'مغلقة', 'مغلق', 'محلول'
    ];

    // ✅ توحيد الأولوية
    function normalizePriority(p) {
        if (!p) return 'متوسطة';
        const s = String(p).trim();
        if (s === 'منخفض') return 'منخفضة';
        if (s === 'متوسط') return 'متوسطة';
        if (s === 'عالي') return 'عالية';
        if (s === 'حرج') return 'عاجلة';
        return VALID_PRIORITIES.includes(s) ? s : 'متوسطة';
    }

    // ✅ توحيد الحالة
    function normalizeStatus(s) {
        if (!s) return 'مفتوحة';
        const t = String(s).trim();
        if (t === 'مفتوح') return 'مفتوحة';
        if (t === 'قيد التنفيذ') return 'قيد المعالجة';
        if (t === 'مغلق') return 'مغلقة';
        if (t === 'محلول') return 'مغلقة';
        return VALID_STATUSES.includes(t) ? t : 'مفتوحة';
    }

    // ✅ تنسيق التذكرة للإخراج
    function formatTicket(t) {
        if (!t) return null;
        return {
            id: t._id.toString(),
            title: t.title,
            subject: t.title,
            description: t.description,
            message: t.description,
            category: t.category || 'فني',
            priority: t.priority || 'متوسطة',
            status: t.status || 'مفتوحة',
            sender: t.sender || t.createdByName || 'مستخدم',
            user: t.createdByName || t.sender || 'مستخدم',
            username: t.createdByUsername || '',
            userId: t.createdBy ? t.createdBy.toString() : null,
            createdByName: t.createdByName || '',
            createdByUsername: t.createdByUsername || '',
            createdByRole: t.createdByRole || '',
            createdByRegion: t.createdByRegion || '',
            assignedTo: t.assignedTo ? t.assignedTo.toString() : null,
            assignedToName: t.assignedToName || null,
            assignedAt: t.assignedAt || null,
            replies: (t.replies || []).map(r => ({
                message: r.message,
                authorName: r.authorName,
                authorId: r.authorId ? r.authorId.toString() : null,
                authorUsername: r.authorUsername,
                createdAt: r.createdAt
            })),
            repliesCount: t.repliesCount || 0,
            screenShareSessions: (t.screenShareSessions || []).map(s => ({
                sessionId: s.sessionId,
                requestedByName: s.requestedByName,
                requestedByUsername: s.requestedByUsername,
                reason: s.reason,
                status: s.status,
                requestedAt: s.requestedAt,
                respondedAt: s.respondedAt,
                startedAt: s.startedAt,
                endedAt: s.endedAt,
                duration: s.duration || 0,
                rejectionReason: s.rejectionReason || ''
            })),
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            lastActivityAt: t.lastActivityAt,
            closedAt: t.closedAt,
            closedByName: t.closedByName || '',
            resolution: t.resolution || '',
            viewsCount: t.viewsCount || 0
        };
    }

    // ✅ التحقق من الملكية أو المسؤولية
    function canAccessTicket(ticket, user) {
        if (!ticket || !user) return false;
        if (safeIsAdmin(user)) return true;
        const userId = (user._id || user.id || '').toString();
        if (ticket.createdBy && ticket.createdBy.toString() === userId) return true;
        if (ticket.createdByUsername && ticket.createdByUsername === user.username) return true;
        if (ticket.createdByName && ticket.createdByName === user.name) return true;
        if (ticket.sender && (ticket.sender === user.username || ticket.sender === user.name)) return true;
        return false;
    }

    // ✅ شرط الاستعلام للمستخدم العادي
    function buildUserQuery(user) {
        const or = [];
        if (user._id) or.push({ createdBy: user._id });
        if (user.username) {
            or.push({ createdByUsername: user.username });
            or.push({ sender: user.username });
        }
        if (user.name) {
            or.push({ createdByName: user.name });
            or.push({ sender: user.name });
        }
        return or.length ? { $or: or } : { _id: null };
    }

    // ============================================================
    // 🚦 SIMPLE RATE LIMITER (in-memory)
    // ============================================================
    const rateLimitMap = new Map();

    function rateLimit(maxPerMinute) {
        return (req, res, next) => {
            const key = req.user
                ? (req.user.id || req.user._id || req.ip)
                : (req.ip || 'unknown');
            const now = Date.now();
            const rec = rateLimitMap.get(key);

            if (!rec || now > rec.resetAt) {
                rateLimitMap.set(key, { count: 1, resetAt: now + 60000 });
                return next();
            }
            if (rec.count >= maxPerMinute) {
                return res.status(429).json({
                    success: false,
                    error: 'طلبات كثيرة — يرجى الانتظار دقيقة'
                });
            }
            rec.count++;
            next();
        };
    }

    // تنظيف دوري للـ Map
    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [k, v] of rateLimitMap) {
            if (now > v.resetAt) rateLimitMap.delete(k);
        }
    }, 60000);
    if (cleanupInterval.unref) cleanupInterval.unref();

    // ============================================================
    // 📥 GET /api/support/tickets — قائمة التذاكر
    // ============================================================
    app.get('/api/support/tickets',
        authenticateAccessToken,
        async (req, res) => {
            try {
                let tickets;
                const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
                const status = req.query.status;

                const filter = safeIsAdmin(req.user)
                    ? {}
                    : buildUserQuery(req.user);

                if (status && VALID_STATUSES.includes(status)) {
                    filter.status = status;
                }

                tickets = await Ticket.find(filter)
                    .sort({ createdAt: -1 })
                    .limit(limit)
                    .lean();

                const formatted = tickets.map(t => formatTicket(t));

                res.json({
                    success: true,
                    count: formatted.length,
                    tickets: formatted
                });

            } catch (e) {
                console.error('❌ GET /api/support/tickets:', e.message);
                res.status(500).json({
                    success: false,
                    error: 'فشل تحميل التذاكر'
                });
            }
        }
    );

    // ============================================================
    // 📥 GET /api/support/tickets/:id — تذكرة واحدة
    // ============================================================
    app.get('/api/support/tickets/:id',
        authenticateAccessToken,
        async (req, res) => {
            try {
                const q = safeBuildIdQuery(req.params.id);
                if (!q) {
                    return res.status(400).json({
                        success: false,
                        error: 'معرّف غير صالح'
                    });
                }

                const ticket = await Ticket.findOne(q);
                if (!ticket) {
                    return res.status(404).json({
                        success: false,
                        error: 'التذكرة غير موجودة'
                    });
                }

                if (!canAccessTicket(ticket, req.user)) {
                    return res.status(403).json({
                        success: false,
                        error: 'غير مصرح لك بعرض هذه التذكرة'
                    });
                }

                // زيادة المشاهدات
                ticket.viewsCount = (ticket.viewsCount || 0) + 1;
                await ticket.save();

                res.json({
                    success: true,
                    ticket: formatTicket(ticket)
                });

            } catch (e) {
                console.error('❌ GET /api/support/tickets/:id:', e.message);
                res.status(500).json({
                    success: false,
                    error: 'فشل تحميل التذكرة'
                });
            }
        }
    );

    // ============================================================
    // 📤 POST /api/support/tickets — إنشاء تذكرة
    // ============================================================
    app.post('/api/support/tickets',
        authenticateAccessToken,
        safeCsrf,
        rateLimit(15),
        async (req, res) => {
            try {
                // ✅ التحقق
                const subject = safeValidateString(
                    req.body.subject || req.body.title,
                    { required: true, max: 200 }
                );
                const message = safeValidateString(
                    req.body.message || req.body.description,
                    { required: true, max: 5000 }
                );

                if (!subject) {
                    return res.status(400).json({
                        success: false,
                        error: 'الموضوع مطلوب (حد أقصى 200 حرف)'
                    });
                }
                if (!message) {
                    return res.status(400).json({
                        success: false,
                        error: 'الوصف مطلوب (حد أقصى 5000 حرف)'
                    });
                }

                // ✅ الأولوية
                const priority = normalizePriority(req.body.priority);

                // ✅ الفئة
                const category = VALID_CATEGORIES.includes(req.body.category)
                    ? req.body.category
                    : 'فني';

                // ✅ المرسل
                const sender = safeValidateString(
                    req.body.sender || req.user.name || req.user.username,
                    { max: 200 }
                ) || req.user.name || req.user.username || 'مستخدم';

                // ✅ ObjectId آمن
                let cid;
                try {
                    cid = mongoose.Types.ObjectId.isValid(req.user._id)
                        ? req.user._id
                        : new mongoose.Types.ObjectId();
                } catch (e) {
                    cid = new mongoose.Types.ObjectId();
                }

                // ✅ بناء التذكرة يدوياً (لا نثق بـ req.body)
                const ticket = new Ticket({
                    title: subject,
                    description: message,
                    category: category,
                    priority: priority,
                    status: 'مفتوحة',
                    sender: sender,
                    createdBy: cid,
                    createdByName: req.user.name || req.user.username || '',
                    createdByUsername: req.user.username || '',
                    createdByRole: safeNormalizeRole(req.user.role),
                    createdByRegion: req.user.region || '',
                    replies: [],
                    screenShareSessions: [],
                    viewsCount: 0,
                    repliesCount: 0
                });

                await ticket.save();

                console.log(`✅ Ticket created: ${ticket._id} | sender: ${sender} | by: ${req.user.username}`);

                // ✅ تسجيل في السجلات
                await safeLog({
                    userId: req.user.id,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'create',
                    resource: 'ticket',
                    resourceId: ticket._id.toString(),
                    resourceName: ticket.title,
                    status: 'success',
                    ip: req.ip,
                    requestId: req.requestId
                });

                // ✅ إشعار
                await safeNotify({
                    userId: null,
                    type: 'info',
                    category: 'support',
                    title: 'تذكرة دعم جديدة',
                    message: `"${ticket.title}" من ${sender}`,
                    link: '/pages/support.html',
                    icon: 'ticket',
                    actorName: sender
                });

                res.status(201).json({
                    success: true,
                    message: 'تم إرسال التذكرة بنجاح',
                    ticket: formatTicket(ticket)
                });

            } catch (e) {
                console.error('❌ POST /api/support/tickets:', e.message);

                if (e.name === 'ValidationError') {
                    const firstError = Object.values(e.errors || {})[0];
                    return res.status(400).json({
                        success: false,
                        error: firstError ? firstError.message : 'بيانات غير صالحة'
                    });
                }

                res.status(500).json({
                    success: false,
                    error: 'فشل إرسال التذكرة'
                });
            }
        }
    );

    // ============================================================
    // 💬 POST /api/support/tickets/:id/reply — إضافة رد
    // ============================================================
    app.post('/api/support/tickets/:id/reply',
        authenticateAccessToken,
        safeCsrf,
        rateLimit(30),
        async (req, res) => {
            try {
                const q = safeBuildIdQuery(req.params.id);
                if (!q) {
                    return res.status(400).json({
                        success: false,
                        error: 'معرّف غير صالح'
                    });
                }

                const ticket = await Ticket.findOne(q);
                if (!ticket) {
                    return res.status(404).json({
                        success: false,
                        error: 'التذكرة غير موجودة'
                    });
                }

                if (!canAccessTicket(ticket, req.user)) {
                    return res.status(403).json({
                        success: false,
                        error: 'غير مصرح'
                    });
                }

                const messageText = safeValidateString(
                    req.body.message || req.body.reply,
                    { required: true, max: 5000 }
                );

                if (!messageText) {
                    return res.status(400).json({
                        success: false,
                        error: 'نص الرد مطلوب (حد أقصى 5000 حرف)'
                    });
                }

                ticket.replies = ticket.replies || [];
                ticket.replies.push({
                    message: messageText,
                    authorName: req.user.name || req.user.username || 'مستخدم',
                    authorId: mongoose.Types.ObjectId.isValid(req.user._id)
                        ? req.user._id
                        : null,
                    authorUsername: req.user.username || ''
                });
                ticket.repliesCount = ticket.replies.length;

                // ✅ تغيير الحالة إذا رد المسؤول
                if (safeIsAdmin(req.user) && ticket.status === 'مفتوحة') {
                    ticket.status = 'قيد المعالجة';
                }

                ticket.lastActivityAt = new Date();
                await ticket.save();

                await safeLog({
                    userId: req.user.id,
                    userName: req.user.name,
                    action: 'reply',
                    resource: 'ticket',
                    resourceId: ticket._id.toString(),
                    resourceName: ticket.title,
                    status: 'success',
                    ip: req.ip,
                    requestId: req.requestId
                });

                res.json({
                    success: true,
                    message: 'تم إضافة الرد بنجاح',
                    ticket: formatTicket(ticket)
                });

            } catch (e) {
                console.error('❌ POST /api/support/tickets/:id/reply:', e.message);
                res.status(500).json({
                    success: false,
                    error: 'فشل إضافة الرد'
                });
            }
        }
    );

    // ============================================================
    // ✅ PUT /api/support/tickets/:id/close — إغلاق تذكرة
    // ============================================================
    app.put('/api/support/tickets/:id/close',
        authenticateAccessToken,
        safeCsrf,
        async (req, res) => {
            try {
                const q = safeBuildIdQuery(req.params.id);
                if (!q) {
                    return res.status(400).json({
                        success: false,
                        error: 'معرّف غير صالح'
                    });
                }

                const ticket = await Ticket.findOne(q);
                if (!ticket) {
                    return res.status(404).json({
                        success: false,
                        error: 'التذكرة غير موجودة'
                    });
                }

                if (!canAccessTicket(ticket, req.user)) {
                    return res.status(403).json({
                        success: false,
                        error: 'غير مصرح'
                    });
                }

                if (ticket.status === 'مغلقة' || ticket.status === 'مغلق') {
                    return res.status(400).json({
                        success: false,
                        error: 'التذكرة مغلقة بالفعل'
                    });
                }

                ticket.status = 'مغلقة';
                ticket.closedAt = new Date();
                ticket.closedBy = mongoose.Types.ObjectId.isValid(req.user._id)
                    ? req.user._id
                    : null;
                ticket.closedByName = req.user.name || req.user.username || '';
                ticket.resolution = safeValidateString(req.body.resolution, { max: 3000 }) || '';
                ticket.lastActivityAt = new Date();

                await ticket.save();

                await safeLog({
                    userId: req.user.id,
                    userName: req.user.name,
                    action: 'close',
                    resource: 'ticket',
                    resourceId: ticket._id.toString(),
                    resourceName: ticket.title,
                    status: 'success',
                    ip: req.ip,
                    requestId: req.requestId
                });

                await safeNotify({
                    type: 'success',
                    category: 'support',
                    title: 'إغلاق تذكرة',
                    message: `تم إغلاق "${ticket.title}"`,
                    link: '/pages/support.html',
                    icon: 'check',
                    actorName: req.user.name || req.user.username
                });

                res.json({
                    success: true,
                    message: 'تم إغلاق التذكرة',
                    ticket: formatTicket(ticket)
                });

            } catch (e) {
                console.error('❌ PUT /api/support/tickets/:id/close:', e.message);
                res.status(500).json({
                    success: false,
                    error: 'فشل إغلاق التذكرة'
                });
            }
        }
    );

    // ============================================================
    // 🔓 PUT /api/support/tickets/:id/reopen — إعادة فتح
    // ============================================================
    app.put('/api/support/tickets/:id/reopen',
        authenticateAccessToken,
        safeCsrf,
        async (req, res) => {
            try {
                const q = safeBuildIdQuery(req.params.id);
                if (!q) {
                    return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
                }

                const ticket = await Ticket.findOne(q);
                if (!ticket) {
                    return res.status(404).json({ success: false, error: 'التذكرة غير موجودة' });
                }

                if (!canAccessTicket(ticket, req.user)) {
                    return res.status(403).json({ success: false, error: 'غير مصرح' });
                }

                ticket.status = 'مفتوحة';
                ticket.closedAt = null;
                ticket.closedBy = null;
                ticket.closedByName = '';
                ticket.lastActivityAt = new Date();
                await ticket.save();

                await safeLog({
                    userId: req.user.id,
                    userName: req.user.name,
                    action: 'reopen',
                    resource: 'ticket',
                    resourceId: ticket._id.toString(),
                    resourceName: ticket.title,
                    status: 'success',
                    ip: req.ip,
                    requestId: req.requestId
                });

                res.json({
                    success: true,
                    message: 'تم إعادة فتح التذكرة',
                    ticket: formatTicket(ticket)
                });

            } catch (e) {
                console.error('❌ PUT reopen:', e.message);
                res.status(500).json({ success: false, error: 'فشل' });
            }
        }
    );

    // ============================================================
    // 📺 GET /api/support/tickets/:id/screen-sessions
    // ============================================================
    app.get('/api/support/tickets/:id/screen-sessions',
        authenticateAccessToken,
        async (req, res) => {
            try {
                const q = safeBuildIdQuery(req.params.id);
                if (!q) {
                    return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
                }

                const ticket = await Ticket.findOne(q).select('createdBy createdByUsername createdByName screenShareSessions');
                if (!ticket) {
                    return res.status(404).json({ success: false, error: 'التذكرة غير موجودة' });
                }

                if (!canAccessTicket(ticket, req.user)) {
                    return res.status(403).json({ success: false, error: 'غير مصرح' });
                }

                res.json({
                    success: true,
                    sessions: (ticket.screenShareSessions || []).map(s => ({
                        sessionId: s.sessionId,
                        requestedByName: s.requestedByName,
                        requestedByUsername: s.requestedByUsername,
                        reason: s.reason,
                        status: s.status,
                        requestedAt: s.requestedAt,
                        respondedAt: s.respondedAt,
                        startedAt: s.startedAt,
                        endedAt: s.endedAt,
                        duration: s.duration || 0,
                        rejectionReason: s.rejectionReason || ''
                    }))
                });

            } catch (e) {
                console.error('❌ GET screen-sessions:', e.message);
                res.status(500).json({ success: false, error: 'فشل' });
            }
        }
    );

    // ============================================================
    // 📊 GET /api/support/stats — الإحصائيات
    // ============================================================
    app.get('/api/support/stats',
        authenticateAccessToken,
        async (req, res) => {
            try {
                let filter = {};
                if (!safeIsAdmin(req.user)) {
                    filter = buildUserQuery(req.user);
                }

                const [total, open, inProgress, closed] = await Promise.all([
                    Ticket.countDocuments(filter),
                    Ticket.countDocuments({
                        ...filter,
                        status: { $in: ['مفتوحة', 'مفتوح'] }
                    }),
                    Ticket.countDocuments({
                        ...filter,
                        status: { $in: ['قيد المعالجة', 'قيد التنفيذ'] }
                    }),
                    Ticket.countDocuments({
                        ...filter,
                        status: { $in: ['مغلقة', 'مغلق', 'محلول'] }
                    })
                ]);

                res.json({
                    success: true,
                    stats: { total, open, inProgress, closed }
                });

            } catch (e) {
                console.error('❌ GET stats:', e.message);
                res.status(500).json({ success: false, error: 'فشل' });
            }
        }
    );

    // ============================================================
    // 🗑️ DELETE /api/support/tickets/:id — حذف (للمسؤول)
    // ============================================================
    app.delete('/api/support/tickets/:id',
        authenticateAccessToken,
        safeCsrf,
        async (req, res) => {
            try {
                if (!safeIsAdmin(req.user)) {
                    return res.status(403).json({
                        success: false,
                        error: 'هذه العملية للمسؤول فقط'
                    });
                }

                const q = safeBuildIdQuery(req.params.id);
                if (!q) {
                    return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
                }

                const ticket = await Ticket.findOne(q);
                if (!ticket) {
                    return res.status(404).json({ success: false, error: 'التذكرة غير موجودة' });
                }

                const title = ticket.title;
                const tid = ticket._id.toString();

                await Ticket.deleteOne({ _id: ticket._id });

                await safeLog({
                    userId: req.user.id,
                    userName: req.user.name,
                    action: 'delete',
                    resource: 'ticket',
                    resourceId: tid,
                    resourceName: title,
                    status: 'success',
                    ip: req.ip,
                    requestId: req.requestId
                });

                await safeNotify({
                    type: 'warning',
                    category: 'support',
                    title: 'حذف تذكرة',
                    message: `تم حذف "${title}"`,
                    link: '/pages/support.html',
                    icon: 'trash',
                    actorName: req.user.name || req.user.username
                });

                res.json({ success: true, message: 'تم حذف التذكرة بنجاح' });

            } catch (e) {
                console.error('❌ DELETE ticket:', e.message);
                res.status(500).json({ success: false, error: 'فشل حذف التذكرة' });
            }
        }
    );

    // ============================================================
    // ✅ LOG — تم التحميل بنجاح
    // ============================================================
    console.log('✅ routes/ticket.js loaded — 8 endpoints registered');
    console.log('   📥 GET    /api/support/tickets');
    console.log('   📥 GET    /api/support/tickets/:id');
    console.log('   📤 POST   /api/support/tickets');
    console.log('   💬 POST   /api/support/tickets/:id/reply');
    console.log('   ✅ PUT    /api/support/tickets/:id/close');
    console.log('   🔓 PUT    /api/support/tickets/:id/reopen');
    console.log('   📺 GET    /api/support/tickets/:id/screen-sessions');
    console.log('   📊 GET    /api/support/stats');
    console.log('   🗑️ DELETE /api/support/tickets/:id');
};

// ============================================================
// 📤 EXPORT END
// ============================================================
