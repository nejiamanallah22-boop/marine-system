// ============================================================
// 🤖 AI ASSISTANT + 📥 SMART IMPORT — v1.0
// ملف مستقل يُدمج في server.js
// ============================================================
//
// 📋 الاستخدام في server.js:
//   1. في الأعلى: const aiAndImportRoutes = require('./routes/ai-and-import');
//   2. قبل STATIC FILES: aiAndImportRoutes(app, { User, Vessel, Maintenance, Notification, ... });
//
// 📦 المكتبات المطلوبة:
//   npm install multer pdf-parse mammoth
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
    MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    MAX_TOKENS: 2048,
    TEMPERATURE: 0.7,
    TIMEOUT_MS: 30000,
    MAX_PROMPT_LENGTH: 4000,
    DAILY_LIMIT: 100
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

// تنظيف دوري
setInterval(() => {
    const now = Date.now();
    for (const [userId, record] of aiUsageByUser) {
        if (now > record.resetAt + 24 * 60 * 60 * 1000) {
            aiUsageByUser.delete(userId);
        }
    }
}, 60 * 60 * 1000).unref();

// ============================================================
// 📤 Multer — إعداد رفع الملفات
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
- كن دقيقاً ومفصلاً.
- إذا لم تكن تعرف الإجابة، قل ذلك بصراحة.`;

// ============================================================
// 📄 استخراج النص من الملفات
// ============================================================

async function extractTextFromFile(buffer, mimetype, originalname) {
    const ext = (originalname.split('.').pop() || '').toLowerCase();

    // PDF
    if (mimetype === 'application/pdf' || ext === 'pdf') {
        const data = await pdfParse(buffer);
        return data.text;
    }

    // Word
    if (mimetype.includes('wordprocessingml') || ext === 'docx') {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
    }

    // Excel
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

    // CSV / TXT
    if (mimetype === 'text/csv' || mimetype === 'text/plain' ||
        ['csv', 'txt'].includes(ext)) {
        return buffer.toString('utf-8');
    }

    // صور → Gemini Vision
    if (mimetype.startsWith('image/')) {
        return null;
    }

    throw new Error('صيغة الملف غير مدعومة للاستخراج');
}

// ============================================================
// 🤖 استدعاء Gemini لتحليل النص
// ============================================================

async function analyzeWithGemini(text, isImage, imageBuffer, imageMime) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY غير مُعد في متغيرات البيئة');
    }

    const url = `${AI_CONFIG.API_URL}${AI_CONFIG.MODEL}:generateContent?key=${apiKey}`;

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents,
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 8192,
                    responseMimeType: 'application/json'
                }
            }),
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        const err = await response.text();
        console.error('❌ Gemini API error:', response.status, err.slice(0, 300));
        throw new Error(`Gemini error (${response.status}): ${err.slice(0, 150)}`);
    }

    const data = await response.json();
    let reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
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

    // التحقق من المتطلبات
    if (!authenticateAccessToken || !csrfProtection) {
        throw new Error('registerAIAndImport: missing required middleware');
    }

    console.log('✅ Registering AI + Import routes...');

    // ========================================================
    // 🤖 AI ENDPOINTS
    // ========================================================

    // حالة المساعد
    app.get('/api/ai/status',
        authenticateAccessToken,
        (req, res) => {
            const hasKey = !!process.env.GEMINI_API_KEY;
            const quota = checkAIQuota(req.user.id);
            return res.json({
                success: true,
                configured: hasKey,
                model: AI_CONFIG.MODEL,
                dailyLimit: AI_CONFIG.DAILY_LIMIT,
                remaining: quota.remaining
            });
        }
    );

    // محادثة المساعد
    app.post('/api/ai/chat',
        authenticateAccessToken,
        csrfProtection,
        async (req, res) => {
            try {
                const { message, history } = req.body || {};

                // 1. التحقق من الرسالة
                if (typeof message !== 'string' || !message.trim()) {
                    return res.status(400).json({ success: false, error: 'الرسالة مطلوبة' });
                }
                if (message.length > AI_CONFIG.MAX_PROMPT_LENGTH) {
                    return res.status(400).json({
                        success: false,
                        error: `الرسالة طويلة جداً (حد أقصى ${AI_CONFIG.MAX_PROMPT_LENGTH} حرف)`
                    });
                }

                // 2. التحقق من المفتاح
                const apiKey = process.env.GEMINI_API_KEY;
                if (!apiKey) {
                    return res.status(503).json({
                        success: false,
                        error: 'المساعد الذكي غير مُهيَّأ (المفتاح مفقود)',
                        code: 'AI_NOT_CONFIGURED'
                    });
                }

                // 3. حد الاستخدام
                const quota = checkAIQuota(req.user.id);
                if (!quota.allowed) {
                    const hoursLeft = Math.ceil((quota.resetAt - Date.now()) / (60 * 60 * 1000));
                    return res.status(429).json({
                        success: false,
                        error: `تم تجاوز الحد اليومي (${AI_CONFIG.DAILY_LIMIT} رسالة). إعادة التصفير بعد ${hoursLeft} ساعة.`,
                        code: 'AI_QUOTA_EXCEEDED'
                    });
                }

                // 4. سياق الأسطول
                let contextText = '';
                try {
                    const vessels = await Vessel.find().limit(100).lean();
                    const total = vessels.length;
                    const active = vessels.filter(v => v.status === 'صالح').length;
                    const maintenance = vessels.filter(v => v.status === 'صيانة').length;
                    const broken = vessels.filter(v => v.status === 'معطب').length;
                    const efficiency = total ? ((active / total) * 100).toFixed(1) : 0;

                    contextText = `\n📊 بيانات الأسطول الحالية:
- إجمالي المراكب: ${total}
- الصالح: ${active} (${efficiency}%)
- تحت الصيانة: ${maintenance}
- المعطوب: ${broken}\n`;
                } catch (e) {
                    console.warn('⚠️ Failed to load vessel context:', e.message);
                }

                // 5. بناء Prompt
                let fullPrompt = CHAT_SYSTEM_PROMPT + '\n\n';
                fullPrompt += `بيانات الأسطول (استخدمها فقط إذا سُئلت):\n${contextText}\n\n`;

                if (Array.isArray(history) && history.length > 0) {
                    fullPrompt += 'المحادثة السابقة:\n';
                    history.slice(-10).forEach(msg => {
                        if (msg && typeof msg.content === 'string') {
                            const role = msg.role === 'user' ? 'المستخدم' : 'المساعد';
                            fullPrompt += `${role}: ${String(msg.content).slice(0, 500)}\n`;
                        }
                    });
                    fullPrompt += '\n';
                }
                fullPrompt += `المستخدم: ${message}`;

                // 6. استدعاء Gemini
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), AI_CONFIG.TIMEOUT_MS);

                let geminiResponse;
                try {
                    geminiResponse = await fetch(
                        `${AI_CONFIG.API_URL}${AI_CONFIG.MODEL}:generateContent?key=${apiKey}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{ parts: [{ text: fullPrompt }] }],
                                generationConfig: {
                                    temperature: AI_CONFIG.TEMPERATURE,
                                    maxOutputTokens: AI_CONFIG.MAX_TOKENS,
                                    topP: 0.95,
                                    topK: 40
                                }
                            }),
                            signal: controller.signal
                        }
                    );
                } finally {
                    clearTimeout(timeoutId);
                }

                // 7. معالجة الأخطاء
                if (!geminiResponse.ok) {
                    const errorText = await geminiResponse.text();
                    console.error('❌ Gemini error:', geminiResponse.status, errorText.slice(0, 200));

                    const errorMap = {
                        400: 'طلب غير صالح',
                        401: 'مفتاح غير مصرح',
                        403: 'المفتاح غير صالح',
                        429: 'تم تجاوز الحد اليومي لـ Gemini',
                        500: 'خطأ داخلي في Gemini',
                        503: 'خدمة Gemini غير متاحة'
                    };

                    return res.status(geminiResponse.status === 429 ? 429 : 502).json({
                        success: false,
                        error: errorMap[geminiResponse.status] || `خطأ ${geminiResponse.status}`,
                        code: 'AI_UPSTREAM_ERROR'
                    });
                }

                const data = await geminiResponse.json();
                const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

                if (!reply) {
                    return res.status(502).json({
                        success: false,
                        error: 'لم يُرجع Gemini أي رد',
                        code: 'AI_EMPTY_RESPONSE'
                    });
                }

                // 8. تسجيل
                if (addSystemLog) {
                    addSystemLog({
                        userId: req.user.id,
                        userName: req.user.name || req.user.username,
                        action: 'ai_chat',
                        resource: 'ai',
                        status: 'success',
                        ip: req.ip,
                        requestId: req.requestId,
                        details: { messageLength: message.length, replyLength: reply.length }
                    }).catch(() => {});
                }

                return res.json({
                    success: true,
                    reply,
                    remaining: quota.remaining,
                    model: AI_CONFIG.MODEL
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

    // تحليل (بدون حفظ)
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

                // تنظيف البيانات
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

    // تأكيد الاستيراد
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
                const createdVessels = [];

                for (const v of vessels) {
                    try {
                        if (!v.name || typeof v.name !== 'string' || !v.name.trim()) {
                            results.skipped++;
                            continue;
                        }

                        // كشف التكرار
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

                        // سجل صيانة تلقائي
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
                        createdVessels.push(newVessel);

                    } catch (err) {
                        results.errors.push({ vessel: v.name, error: err.message });
                    }
                }

                // إشعار
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

                // سجل
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
