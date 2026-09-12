// ============================================================
// 🤖 AI ASSISTANT + 📥 SMART IMPORT — v1.2
// ملف مستقل يُدمج في server.js
// ============================================================
//
// 📋 التعديلات v1.2:
//   - ✅ MODEL: gemini-3.6-flash (بدل gemini-2.0-flash الملغى)
//   - ✅ إزالة temperature/topP/topK (ملغاة في Gemini 3.x)
//   - ✅ كشف تلقائي لأسماء موديلات fallback
//   - ✅ 🆕 سياق شامل من كل بيانات التطبيق (أسطول + صيانة + مستخدمين + إحصائيات)
//   - ✅ 🆕 كشف تلقائي لأسئلة المطوّر والحرس الوطني (رد فوري بدون Gemini)
//   - ✅ 🆕 معلومات المطوّر: أمان الله ناجي — المفكر والمطوّر البرمجي
//   - ✅ 🆕 إحصائيات تفصيلية: توزيع المناطق، الفئات، الأعطال، التكاليف
// ============================================================

'use strict';

const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');

// ============================================================
// ⚙️ الإعدادات
// ============================================================

const AI_CONFIG = {
    API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/',
    MODEL: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    FALLBACK_MODELS: ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    MAX_TOKENS: 2048,
    TIMEOUT_MS: 30000,
    MAX_PROMPT_LENGTH: 4000,
    DAILY_LIMIT: 100
};

// 🆕 معلومات المطوّر (قابلة للتعديل من متغيرات البيئة)
const DEVELOPER_INFO = {
    name: process.env.DEVELOPER_NAME || 'أمان الله ناجي',
    title: process.env.DEVELOPER_TITLE || 'المفكر والمطوّر البرمجي',
    affiliation: process.env.DEVELOPER_AFFILIATION || 'الحرس الوطني التونسي',
    systemName: 'منظومة الوسائل البحرية (Marine System)',
    version: 'v9.17.1'
};

// استخدام يومي لكل مستخدم
const aiUsageByUser = new Map();

function checkAIQuota(userId) {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    let record = aiUsageByUser.get(userId);
    if (!record || now > record.resetAt) {
        record = { count: 0, resetAt: now + dayMs };
        aiUsageByUser.set(userId, record);
    }
    if (record.count >= AI_CONFIG.DAILY_LIMIT) {
        return { allowed: false, remaining: 0, resetAt: record.resetAt };
    }
    record.count++;
    return { allowed: true, remaining: AI_CONFIG.DAILY_LIMIT - record.count, resetAt: record.resetAt };
}

setInterval(() => {
    const now = Date.now();
    for (const [userId, record] of aiUsageByUser) {
        if (now > record.resetAt + 24 * 60 * 60 * 1000) {
            aiUsageByUser.delete(userId);
        }
    }
}, 60 * 60 * 1000).unref();

// ============================================================
// 📤 Multer
// ============================================================

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        const allowed = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
            'text/plain',
            'image/png', 'image/jpeg', 'image/webp'
        ];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('نوع الملف غير مدعوم. استخدم PDF, Word, Excel, CSV, نص, أو صورة.'));
        }
    }
});

// ============================================================
// 🎯 Prompts
// ============================================================

const IMPORT_PROMPT = `أنت محلل بيانات متخصص في الأسطول البحري.

مهمتك: استخرج قائمة المراكب/الوسائل البحرية من النص التالي وأرجعها بصيغة JSON صارمة.

الصيغة المطلوبة (JSON فقط بدون شرح):
{
  "vessels": [
    {
      "name": "اسم المركب",
      "num": "الرقم",
      "len": 12,
      "region": "المنطقة",
      "zone": "المنطقة الفرعية",
      "port": "الميناء",
      "supp": "الوحدة التابعة",
      "status": "صالح | صيانة | معطب",
      "break": "نوع العطل",
      "fdate": "تاريخ العطل",
      "ref": "المرجع",
      "repairUnit": "وحدة الإصلاح",
      "cat": "الفئة"
    }
  ],
  "warnings": ["ملاحظات"]
}

قواعد:
1. أرجع JSON فقط بدون أي شرح أو علامات markdown.
2. الحقل غير الموجود = "" (نص فارغ).
3. status يجب أن يكون: "صالح" أو "صيانة" أو "معطب".
4. حوّل الأرقام لنوع number.
5. حافظ على الأسماء العربية.

النص:
`;

const CHAT_SYSTEM_PROMPT = `أنت مساعد ذكي متخصص في الأسطول البحري التونسي، ولديك معرفة عامة واسعة.
- تجيب بالعربية الفصحى أو التونسية حسب سؤال المستخدم.
- كن دقيقاً ومفصلاً ومنظماً.
- إذا لم تكن تعرف الإجابة، قل ذلك بصراحة.
- عند ذكر أرقام أو إحصائيات، استخدم البيانات الحية المرفقة في السياق فقط.
- يمكنك استخدام التنسيق (قوائم، عناوين) لتسهيل القراءة.`;

// ============================================================
// 📄 استخراج النص من الملفات
// ============================================================

async function extractTextFromFile(buffer, mimetype, originalname) {
    const ext = (originalname.split('.').pop() || '').toLowerCase();

    if (mimetype === 'application/pdf' || ext === 'pdf') {
        const data = await pdfParse(buffer);
        return data.text;
    }

    if (mimetype.includes('wordprocessingml') || ext === 'docx') {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
    }

    if (mimetype.includes('spreadsheetml') || mimetype.includes('ms-excel') ||
        ['xlsx', 'xls'].includes(ext)) {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        let text = '';
        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(sheet);
            text += `\n=== ورقة: ${sheetName} ===\n${csv}\n`;
        });
        return text;
    }

    if (mimetype === 'text/csv' || mimetype === 'text/plain' ||
        ['csv', 'txt'].includes(ext)) {
        return buffer.toString('utf-8');
    }

    if (mimetype.startsWith('image/')) {
        return null;
    }

    throw new Error('صيغة الملف غير مدعومة للاستخراج');
}

// ============================================================
// 🤖 استدعاء Gemini
// ============================================================

function buildGeminiBody(contents, options) {
    options = options || {};
    const generationConfig = {
        maxOutputTokens: options.maxOutputTokens || 8192
    };
    if (options.responseMimeType) {
        generationConfig.responseMimeType = options.responseMimeType;
    }
    return { contents, generationConfig };
}

async function callGemini(contents, options) {
    options = options || {};
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY غير مُعد في متغيرات البيئة');

    const preferred = AI_CONFIG.MODEL;
    const modelsToTry = [preferred, ...AI_CONFIG.FALLBACK_MODELS.filter(m => m !== preferred)];

    const body = buildGeminiBody(contents, options);
    let lastError = null;

    for (const model of modelsToTry) {
        const url = `${AI_CONFIG.API_URL}${model}:generateContent?key=${apiKey}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 60000);

        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal
            });
        } catch (e) {
            clearTimeout(timeoutId);
            lastError = e;
            continue;
        }
        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            return { ok: true, data, modelUsed: model };
        }

        const errText = await response.text();

        if (response.status === 404) {
            console.warn(`⚠️ Model "${model}" not available (404), trying next...`);
            lastError = { status: 404, text: errText };
            continue;
        }

        return { ok: false, status: response.status, errorText: errText, modelUsed: model };
    }

    return {
        ok: false,
        status: (lastError && lastError.status) || 502,
        errorText: (lastError && lastError.text) || 'كل الموديلات فشلت',
        modelUsed: null
    };
}

// ============================================================
// 🤖 تحليل ملفات الاستيراد
// ============================================================

async function analyzeWithGemini(text, isImage, imageBuffer, imageMime) {
    let contents;
    if (isImage && imageBuffer) {
        const base64 = imageBuffer.toString('base64');
        contents = [{
            parts: [
                { text: IMPORT_PROMPT },
                { inlineData: { mimeType: imageMime, data: base64 } }
            ]
        }];
    } else {
        const truncated = String(text || '').slice(0, 50000);
        contents = [{
            parts: [{ text: IMPORT_PROMPT + '\n\n' + truncated }]
        }];
    }

    const result = await callGemini(contents, {
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        timeoutMs: 60000
    });

    if (!result.ok) {
        console.error('❌ Gemini API error:', result.status, String(result.errorText).slice(0, 300));
        throw new Error(`Gemini error (${result.status}): ${String(result.errorText).slice(0, 150)}`);
    }

    console.log(`✅ Import analyzed via model: ${result.modelUsed}`);

    let reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) throw new Error('لم يُرجع Gemini أي نتيجة');

    reply = reply.trim();
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (jsonMatch) reply = jsonMatch[0];

    try {
        return JSON.parse(reply);
    } catch (e) {
        console.error('❌ Invalid JSON from Gemini:', reply.slice(0, 300));
        throw new Error('استجابة Gemini غير صالحة (JSON مكسور)');
    }
}

// ============================================================
// 🧹 تطبيع حالة المركب
// ============================================================

function normalizeStatus(raw) {
    if (!raw) return 'صالح';
    const s = String(raw).toLowerCase().trim();
    if (/معطب|تالف|خربان|عطل|broken|out|فاسد/i.test(s)) return 'معطب';
    if (/صيانة|تحت الإصلاح|maintenance|repair|إصلاح/i.test(s)) return 'صيانة';
    return 'صالح';
}

// ============================================================
// 🆕 كشف أسئلة المطوّر / الحرس الوطني
// ============================================================

const DEVELOPER_KEYWORDS = [
    'المطور', 'المطوّر', 'من طور', 'من طَوَّر', 'من صمم', 'من برمج',
    'صاحب التطبيق', 'صاحب المنظومة', 'من صنع', 'من أنشأ', 'من ابتكر',
    'developer', 'who made', 'who developed', 'who created', 'who built'
];

const GUARD_KEYWORDS = [
    'الحرس الوطني', 'حرس وطني', 'الحرس', 'حرس',
    'national guard', 'garde nationale', 'garde national'
];

function detectDeveloperOrGuardQuestion(message) {
    const lower = message.toLowerCase();
    const isDev = DEVELOPER_KEYWORDS.some(k => message.includes(k) || lower.includes(k.toLowerCase()));
    const isGuard = GUARD_KEYWORDS.some(k => message.includes(k) || lower.includes(k.toLowerCase()));

    if (!isDev && !isGuard) return null;

    const dev = DEVELOPER_INFO;

    if (isDev && isGuard) {
        return `👨‍💻 **المطوّر**: ${dev.name} — ${dev.title} لـ${dev.systemName}.\n\n` +
               `🛡️ **الانتماء**: ينتمي إلى **${dev.affiliation}**، وهذه المنظومة طُوّرت لخدمة الأسطول البحري التابع للحرس الوطني التونسي.\n\n` +
               `📌 **اسم المنظومة**: ${dev.systemName}\n` +
               `📌 **الإصدار**: ${dev.version}`;
    }

    if (isDev) {
        return `👨‍💻 **المطوّر**: ${dev.name} — ${dev.title} لـ${dev.systemName}.\n\n` +
               `🛡️ ينتمي إلى **${dev.affiliation}**.\n\n` +
               `📌 **الإصدار الحالي**: ${dev.version}`;
    }

    return `🛡️ **${dev.affiliation}** هو المؤسسة الأمنية التي ينتمي إليها مطوّر هذه المنظومة (${dev.name} — ${dev.title}).\n\n` +
           `🎯 **الهدف**: تسهيل إدارة الأسطول البحري التابع للحرس الوطني.\n\n` +
           `📌 **اسم المنظومة**: ${dev.systemName}`;
}

// ============================================================
// 🆕 بناء سياق شامل من بيانات التطبيق
// ============================================================

async function buildFullContext({ Vessel, Maintenance, User, Notification }) {
    let ctx = '';

    try {
        const [
            vessels,
            maintenanceLogs,
            totalUsers,
            activeUsers,
            totalNotes,
            unreadNotifications
        ] = await Promise.all([
            Vessel.find().limit(500).lean(),
            Maintenance.find().limit(500).lean(),
            User.countDocuments(),
            User.countDocuments({ isActive: true }),
            Notification ? Notification.countDocuments().catch(() => 0) : Promise.resolve(0),
            Notification ? Notification.countDocuments({ isRead: false }).catch(() => 0) : Promise.resolve(0)
        ]);

        // === إحصائيات الأسطول ===
        const total = vessels.length;
        const active = vessels.filter(v => v.status === 'صالح').length;
        const maintenance = vessels.filter(v => v.status === 'صيانة').length;
        const broken = vessels.filter(v => v.status === 'معطب').length;
        const efficiency = total ? ((active / total) * 100).toFixed(1) : '0.0';

        // === التوزيعات ===
        const byRegion = {};
        const byCategory = {};
        const byBreakType = {};

        vessels.forEach(v => {
            const r = v.region || 'غير محدد';
            byRegion[r] = (byRegion[r] || 0) + 1;

            const c = v.cat || 'غير محدد';
            byCategory[c] = (byCategory[c] || 0) + 1;

            if (v.break && v.break.trim()) {
                const b = v.break.trim();
                byBreakType[b] = (byBreakType[b] || 0) + 1;
            }
        });

        // === إحصائيات الصيانة ===
        const maintTotal = maintenanceLogs.length;
        const maintCompleted = maintenanceLogs.filter(m => m.status === 'مكتملة').length;
        const maintInProgress = maintenanceLogs.filter(m => m.status === 'قيد التنفيذ').length;
        const maintOverdue = maintenanceLogs.filter(m => m.status === 'متأخرة').length;
        const maintPending = maintenanceLogs.filter(m =>
            m.status === 'معلقة' || m.status === 'قيد الانتظار'
        ).length;
        const totalCost = maintenanceLogs.reduce((s, m) => s + (Number(m.cost) || 0), 0);

        // === أعلى 5 تكلفة ===
        const topCostly = [...vessels]
            .map(v => {
                const logs = maintenanceLogs.filter(m =>
                    m.vesselId === v.id || m.vesselName === v.name
                );
                const cost = logs.reduce((s, m) => s + (Number(m.cost) || 0), 0);
                return { name: v.name, num: v.num, cost, count: logs.length };
            })
            .filter(x => x.cost > 0)
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 5);

        // === قوائم مفصّلة ===
        const brokenList = vessels
            .filter(v => v.status === 'معطب')
            .slice(0, 20)
            .map(v => `  • ${v.name} (${v.num || '—'}) | عطل: ${v.break || 'غير محدد'} | منطقة: ${v.region || '—'} | وحدة الإصلاح: ${v.repairUnit || '—'}`)
            .join('\n');

        const maintList = vessels
            .filter(v => v.status === 'صيانة')
            .slice(0, 20)
            .map(v => `  • ${v.name} (${v.num || '—'}) | نوع: ${v.break || 'صيانة دورية'} | وحدة الإصلاح: ${v.repairUnit || '—'}`)
            .join('\n');

        // === آخر 5 سجلات صيانة ===
        const recentLogs = [...maintenanceLogs]
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
            .slice(0, 5)
            .map(m => `  • ${m.vesselName || '—'} | ${m.type || '—'} | ${m.status || '—'} | ${Number(m.cost) || 0} د.ت`)
            .join('\n');

        // === بناء السياق ===
        ctx = `
📊 ==== إحصائيات الأسطول البحري الحية ====
• إجمالي المراكب: ${total}
• الصالح: ${active} (نسبة الجاهزية: ${efficiency}%)
• تحت الصيانة: ${maintenance}
• المعطوب: ${broken}

📍 التوزيع حسب المنطقة:
${Object.entries(byRegion).map(([r, c]) => `  • ${r}: ${c}`).join('\n') || '  لا توجد بيانات'}

🚢 التوزيع حسب الفئة:
${Object.entries(byCategory).map(([c, n]) => `  • ${c}: ${n}`).join('\n') || '  لا توجد بيانات'}

⚠️ أنواع الأعطال:
${Object.entries(byBreakType).map(([b, n]) => `  • ${b}: ${n}`).join('\n') || '  لا توجد أعطال مسجّلة'}

🔧 ==== إحصائيات الصيانة ====
• إجمالي سجلات الصيانة: ${maintTotal}
• مكتملة: ${maintCompleted}
• قيد التنفيذ: ${maintInProgress}
• متأخرة: ${maintOverdue}
• معلقة/قيد الانتظار: ${maintPending}
• التكلفة الإجمالية: ${totalCost.toLocaleString('ar-TN')} دينار تونسي

🕒 آخر 5 سجلات صيانة:
${recentLogs || '  لا توجد سجلات'}

💰 أعلى 5 مراكب من حيث التكلفة:
${topCostly.map((v, i) => `  ${i + 1}. ${v.name} (${v.num || '—'}): ${v.cost.toLocaleString('ar-TN')} د.ت — ${v.count} عملية`).join('\n') || '  لا توجد بيانات'}

🚨 قائمة المراكب المعطوبة (تفصيلية):
${brokenList || '  ✅ لا يوجد أي مركب معطب حالياً'}

🛠️ قائمة المراكب في الصيانة (تفصيلية):
${maintList || '  ✅ لا يوجد أي مركب في الصيانة حالياً'}

👥 ==== إحصائيات المستخدمين ====
• إجمالي المستخدمين: ${totalUsers}
• النشطون: ${activeUsers}
• غير النشطين: ${totalUsers - activeUsers}

📝 ==== إحصائيات أخرى ====
• إجمالي الملاحظات (Note Verbale): ${totalNotes}
• الإشعارات غير المقروءة: ${unreadNotifications}

👨‍💻 ==== معلومات المطوّر ====
• المطوّر: ${DEVELOPER_INFO.name} — ${DEVELOPER_INFO.title}
• الانتماء: ${DEVELOPER_INFO.affiliation}
• اسم المنظومة: ${DEVELOPER_INFO.systemName}
• الإصدار: ${DEVELOPER_INFO.version}
`;

    } catch (e) {
        console.warn('⚠️ Failed to build full context:', e.message);
        ctx = '\n(تعذّر تحميل الإحصائيات الحية حالياً)\n';
    }

    return ctx;
}

// ============================================================
// 🚀 الدالة الرئيسية للتصدير
// ============================================================

module.exports = function registerAIAndImport(app, deps) {
    const {
        User,
        Vessel,
        Maintenance,
        Notification,
        authenticateAccessToken,
        csrfProtection,
        requirePermission,
        hasPermission,
        randomId,
        addSystemLog,
        notify
    } = deps;

    if (!authenticateAccessToken || !csrfProtection) {
        throw new Error('registerAIAndImport: missing required middleware');
    }

    console.log('✅ Registering AI + Import routes...');
    console.log('   🤖 Model:', AI_CONFIG.MODEL);
    console.log('   🔄 Fallbacks:', AI_CONFIG.FALLBACK_MODELS.join(', '));
    console.log('   👨‍💻 Developer:', DEVELOPER_INFO.name, '—', DEVELOPER_INFO.affiliation);

    // ========================================================
    // 🤖 AI ENDPOINTS
    // ========================================================

    app.get('/api/ai/status',
        authenticateAccessToken,
        (req, res) => {
            const hasKey = !!process.env.GEMINI_API_KEY;
            const quota = checkAIQuota(req.user.id);
            return res.json({
                success: true,
                configured: hasKey,
                model: AI_CONFIG.MODEL,
                fallbacks: AI_CONFIG.FALLBACK_MODELS,
                dailyLimit: AI_CONFIG.DAILY_LIMIT,
                remaining: quota.remaining,
                developer: {
                    name: DEVELOPER_INFO.name,
                    title: DEVELOPER_INFO.title,
                    affiliation: DEVELOPER_INFO.affiliation
                }
            });
        }
    );

    app.post('/api/ai/chat',
        authenticateAccessToken,
        csrfProtection,
        async (req, res) => {
            try {
                const { message, history } = req.body || {};

                if (typeof message !== 'string' || !message.trim()) {
                    return res.status(400).json({ success: false, error: 'الرسالة مطلوبة' });
                }
                if (message.length > AI_CONFIG.MAX_PROMPT_LENGTH) {
                    return res.status(400).json({
                        success: false,
                        error: `الرسالة طويلة جداً (حد أقصى ${AI_CONFIG.MAX_PROMPT_LENGTH} حرف)`
                    });
                }

                const apiKey = process.env.GEMINI_API_KEY;
                if (!apiKey) {
                    return res.status(503).json({
                        success: false,
                        error: 'المساعد الذكي غير مُهيَّأ (المفتاح مفقود)',
                        code: 'AI_NOT_CONFIGURED'
                    });
                }

                const quota = checkAIQuota(req.user.id);
                if (!quota.allowed) {
                    const hoursLeft = Math.ceil((quota.resetAt - Date.now()) / (60 * 60 * 1000));
                    return res.status(429).json({
                        success: false,
                        error: `تم تجاوز الحد اليومي (${AI_CONFIG.DAILY_LIMIT} رسالة). إعادة التصفير بعد ${hoursLeft} ساعة.`,
                        code: 'AI_QUOTA_EXCEEDED'
                    });
                }

                // 🆕 1. كشف أسئلة المطوّر / الحرس الوطني (رد فوري بدون Gemini)
                const directReply = detectDeveloperOrGuardQuestion(message);
                if (directReply) {
                    console.log('👨‍💻 Direct answer (developer/guard question)');

                    if (addSystemLog) {
                        addSystemLog({
                            userId: req.user.id,
                            userName: req.user.name || req.user.username,
                            action: 'ai_chat_direct',
                            resource: 'ai',
                            status: 'success',
                            ip: req.ip,
                            requestId: req.requestId,
                            details: { messageLength: message.length, type: 'developer-info' }
                        }).catch(() => {});
                    }

                    return res.json({
                        success: true,
                        reply: directReply,
                        remaining: quota.remaining,
                        model: 'direct-answer',
                        source: 'developer-info'
                    });
                }

                // 🆕 2. بناء سياق شامل من كل بيانات التطبيق
                const contextText = await buildFullContext({ Vessel, Maintenance, User, Notification });

                // 🆕 3. بناء Prompt النهائي
                let fullPrompt = CHAT_SYSTEM_PROMPT + '\n\n';
                fullPrompt += `📌 معلومات أساسية يجب أن تعرفها دائماً:
- مطوّر هذه المنظومة هو: ${DEVELOPER_INFO.name} (${DEVELOPER_INFO.title}).
- ينتمي إلى: ${DEVELOPER_INFO.affiliation}.
- اسم المنظومة: ${DEVELOPER_INFO.systemName} — الإصدار ${DEVELOPER_INFO.version}.
- إذا سُئلت عن المطوّر أو الحرس الوطني، أجب بهذه المعلومات بوضوح.

${contextText}

⚠️ تعليمات مهمة:
- استخدم الأرقام والبيانات أعلاه حصرياً عند الإجابة عن أسئلة تتعلق بالأسطول أو الصيانة أو المستخدمين.
- إذا كان السؤال عاماً (جغرافيا، تاريخ، ثقافة، رياضيات...) أجب من معرفتك العامة دون خلط مع بيانات الأسطول.
- كن دقيقاً، وإن لم تجد المعلومة في السياق، اعترف بذلك بصراحة.
- نسّق إجاباتك بقوائم وعناوين لتسهيل القراءة.
`;

                if (Array.isArray(history) && history.length > 0) {
                    fullPrompt += '\nالمحادثة السابقة:\n';
                    history.slice(-10).forEach(msg => {
                        if (msg && typeof msg.content === 'string') {
                            const role = msg.role === 'user' ? 'المستخدم' : 'المساعد';
                            fullPrompt += `${role}: ${String(msg.content).slice(0, 500)}\n`;
                        }
                    });
                    fullPrompt += '\n';
                }
                fullPrompt += `المستخدم: ${message}`;

                // 4. استدعاء Gemini
                const result = await callGemini(
                    [{ parts: [{ text: fullPrompt }] }],
                    { maxOutputTokens: AI_CONFIG.MAX_TOKENS, timeoutMs: AI_CONFIG.TIMEOUT_MS }
                );

                if (!result.ok) {
                    console.error('❌ Gemini error:', result.status, String(result.errorText).slice(0, 200));

                    const errorMap = {
                        400: 'طلب غير صالح',
                        401: 'مفتاح غير مصرح',
                        403: 'المفتاح غير صالح',
                        404: 'الموديل غير متوفر — تحقق من GEMINI_MODEL',
                        429: 'تم تجاوز الحد اليومي لـ Gemini',
                        500: 'خطأ داخلي في Gemini',
                        503: 'خدمة Gemini غير متاحة'
                    };

                    return res.status(result.status === 429 ? 429 : 502).json({
                        success: false,
                        error: errorMap[result.status] || `خطأ ${result.status}`,
                        code: 'AI_UPSTREAM_ERROR',
                        model: result.modelUsed
                    });
                }

                const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text;

                if (!reply) {
                    return res.status(502).json({
                        success: false,
                        error: 'لم يُرجع Gemini أي رد',
                        code: 'AI_EMPTY_RESPONSE',
                        model: result.modelUsed
                    });
                }

                if (addSystemLog) {
                    addSystemLog({
                        userId: req.user.id,
                        userName: req.user.name || req.user.username,
                        action: 'ai_chat',
                        resource: 'ai',
                        status: 'success',
                        ip: req.ip,
                        requestId: req.requestId,
                        details: {
                            messageLength: message.length,
                            replyLength: reply.length,
                            model: result.modelUsed
                        }
                    }).catch(() => {});
                }

                return res.json({
                    success: true,
                    reply,
                    remaining: quota.remaining,
                    model: result.modelUsed || AI_CONFIG.MODEL
                });

            } catch (error) {
                if (error.name === 'AbortError') {
                    return res.status(504).json({ success: false, error: 'انتهت مهلة الرد' });
                }
                console.error('❌ /api/ai/chat error:', error.message);
                return res.status(500).json({ success: false, error: 'خطأ في الخادم' });
            }
        }
    );

    // ========================================================
    // 📥 IMPORT ENDPOINTS
    // ========================================================

    app.post('/api/import/analyze',
        authenticateAccessToken,
        requirePermission('vessels:create'),
        upload.single('file'),
        async (req, res) => {
            try {
                if (!req.file) {
                    return res.status(400).json({ success: false, error: 'لم يتم رفع أي ملف' });
                }

                console.log(`📥 Analyzing: ${req.file.originalname} (${req.file.size} bytes)`);

                const isImage = req.file.mimetype.startsWith('image/');
                let extracted;

                if (isImage) {
                    extracted = await analyzeWithGemini(null, true, req.file.buffer, req.file.mimetype);
                } else {
                    const text = await extractTextFromFile(
                        req.file.buffer,
                        req.file.mimetype,
                        req.file.originalname
                    );

                    if (!text || !text.trim()) {
                        return res.status(400).json({
                            success: false,
                            error: 'لم يتم استخراج أي نص من الملف'
                        });
                    }

                    extracted = await analyzeWithGemini(text);
                }

                if (!extracted.vessels || !Array.isArray(extracted.vessels)) {
                    return res.status(400).json({
                        success: false,
                        error: 'لم يتم التعرف على أي مراكب في الملف'
                    });
                }

                const vessels = extracted.vessels
                    .filter(v => v && typeof v === 'object' && v.name)
                    .map(v => ({
                        name: String(v.name || '').trim().slice(0, 200),
                        num: String(v.num || '').trim().slice(0, 50),
                        len: Number(v.len) || 0,
                        region: String(v.region || '').trim().slice(0, 100),
                        zone: String(v.zone || '').trim().slice(0, 100),
                        port: String(v.port || '').trim().slice(0, 100),
                        supp: String(v.supp || '').trim().slice(0, 100),
                        status: normalizeStatus(v.status),
                        break: String(v.break || '').trim().slice(0, 200),
                        fDate: v.fdate || null,
                        ref: String(v.ref || '').trim().slice(0, 100),
                        repairUnit: String(v.repairUnit || '').trim().slice(0, 200),
                        cat: String(v.cat || '').trim().slice(0, 100)
                    }));

                console.log(`✅ Extracted ${vessels.length} vessels`);

                return res.json({
                    success: true,
                    fileName: req.file.originalname,
                    fileType: req.file.mimetype,
                    vesselsCount: vessels.length,
                    vessels,
                    warnings: Array.isArray(extracted.warnings) ? extracted.warnings : []
                });

            } catch (error) {
                console.error('❌ /api/import/analyze error:', error.message);
                return res.status(500).json({
                    success: false,
                    error: error.message || 'فشل تحليل الملف'
                });
            }
        }
    );

    app.post('/api/import/confirm',
        authenticateAccessToken,
        requirePermission('vessels:create'),
        csrfProtection,
        async (req, res) => {
            try {
                const { vessels } = req.body;

                if (!Array.isArray(vessels) || vessels.length === 0) {
                    return res.status(400).json({ success: false, error: 'لا توجد مراكب للاستيراد' });
                }
                if (vessels.length > 500) {
                    return res.status(400).json({ success: false, error: 'حد أقصى 500 مركب في المرة' });
                }

                const results = { created: 0, skipped: 0, errors: [] };

                for (const v of vessels) {
                    try {
                        if (!v.name || typeof v.name !== 'string' || !v.name.trim()) {
                            results.skipped++;
                            continue;
                        }

                        const existing = await Vessel.findOne({
                            $or: [
                                { name: v.name.trim() },
                                ...(v.num ? [{ num: v.num.trim() }] : [])
                            ]
                        });

                        if (existing) {
                            results.skipped++;
                            continue;
                        }

                        const newVessel = await Vessel.create({
                            id: randomId(8),
                            name: v.name.trim(),
                            num: v.num || '',
                            len: Number(v.len) || 0,
                            region: v.region || '',
                            zone: v.zone || '',
                            port: v.port || '',
                            supp: v.supp || '',
                            status: ['صالح', 'صيانة', 'معطب'].includes(v.status) ? v.status : 'صالح',
                            break: v.break || '',
                            fDate: v.fDate || null,
                            ref: v.ref || '',
                            repairUnit: v.repairUnit || '',
                            cat: v.cat || '',
                            createdBy: req.user.id,
                            importedFrom: 'ai-import'
                        });

                        if (newVessel.status === 'معطب' || newVessel.status === 'صيانة') {
                            await Maintenance.create({
                                id: randomId(8),
                                vesselId: newVessel.id,
                                vesselName: newVessel.name,
                                vesselNum: newVessel.num,
                                type: newVessel.break || 'صيانة دورية',
                                status: newVessel.status === 'معطب' ? 'متأخرة' : 'قيد التنفيذ',
                                date: newVessel.fDate || new Date().toISOString(),
                                repairUnit: newVessel.repairUnit || '—',
                                cost: 0,
                                notes: 'استيراد تلقائي من ملف',
                                createdBy: req.user.id
                            });
                        }

                        results.created++;

                    } catch (err) {
                        results.errors.push({ vessel: v.name, error: err.message });
                    }
                }

                if (results.created > 0 && typeof notify === 'function') {
                    await notify({
                        type: 'success',
                        category: 'vessel',
                        title: 'استيراد من ملف',
                        message: `تم استيراد ${results.created} مركب بواسطة ${req.user.name || req.user.username}`,
                        link: '/pages/fleet.html',
                        icon: 'file-import',
                        actorName: req.user.name || req.user.username
                    });
                }

                if (typeof addSystemLog === 'function') {
                    addSystemLog({
                        userId: req.user.id,
                        userName: req.user.name,
                        action: 'import',
                        resource: 'vessel',
                        status: 'success',
                        ip: req.ip,
                        requestId: req.requestId,
                        details: {
                            total: vessels.length,
                            created: results.created,
                            skipped: results.skipped
                        }
                    }).catch(() => {});
                }

                return res.json({
                    success: true,
                    message: `تم استيراد ${results.created} مركب، تم تخطي ${results.skipped}`,
                    results
                });

            } catch (error) {
                console.error('❌ /api/import/confirm error:', error.message);
                return res.status(500).json({
                    success: false,
                    error: 'فشل الاستيراد'
                });
            }
        }
    );

    console.log('✅ AI + Import routes registered');
};
