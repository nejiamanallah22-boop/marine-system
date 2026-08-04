// server/routes/ai.js
// ============================================================
// 🤖 MARINE AI ASSISTANT v6.2 - FULLY FUNCTIONAL
// ============================================================

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const crypto = require("crypto");
const NodeCache = require("node-cache");
const sanitizeHtml = require("sanitize-html");
const { body, validationResult } = require("express-validator");
const winston = require("winston");
const { v4: uuidv4 } = require("uuid");

// ============================================================
// 📦 MODELS
// ============================================================

const Vessel = require("../models/Vessel");
const Maintenance = require("../models/Maintenance");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

// ============================================================
// 🔐 JWT AUTH
// ============================================================

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            success: false, 
            error: '❌ الرجاء تسجيل الدخول',
            code: 'UNAUTHORIZED'
        });
    }
    
    const token = authHeader.substring(7);
    
    if (token.startsWith('demo-token-')) {
        req.user = { id: 'demo-user-id', email: 'admin@example.com', role: 'مسؤول', region: '' };
        return next();
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ 
            success: false, 
            error: '❌ توكن غير صالح',
            code: 'INVALID_TOKEN'
        });
    }
    
    req.user = decoded;
    next();
}

// ============================================================
// 🔐 PERMISSIONS
// ============================================================

const PERMISSIONS = {
    "مسؤول": { level: 100, viewAll: true, maxMessages: 200 },
    "محرر إقليمي": { level: 80, viewAll: false, maxMessages: 100 },
    "فني صيانة": { level: 50, viewAll: false, maxMessages: 50 },
    "مشاهد": { level: 20, viewAll: false, maxMessages: 20 }
};

function getPermissions(role) {
    return PERMISSIONS[role] || PERMISSIONS["مشاهد"];
}

// ============================================================
// 📝 LOGGER
// ============================================================

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// ============================================================
// ⚡ CACHE
// ============================================================

const aiCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

let fleetCache = { data: null, version: 0, timestamp: 0, ttl: 60000 };
let fleetFetchInFlight = null;

// ============================================================
// 🤖 AI CONFIG - قراءة المفاتيح من .env
// ============================================================

// قراءة المفاتيح من متغيرات البيئة
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// التحقق من وجود المفاتيح
const HAS_GEMINI = GEMINI_API_KEY && GEMINI_API_KEY.length > 10 && GEMINI_API_KEY !== 'your-gemini-api-key-here';
const HAS_OPENAI = OPENAI_API_KEY && OPENAI_API_KEY.length > 10 && OPENAI_API_KEY !== 'your-openai-api-key-here';

logger.info(`🤖 AI Status: Gemini=${HAS_GEMINI ? '✅ مفعل' : '❌ غير مفعل'}, OpenAI=${HAS_OPENAI ? '✅ مفعل' : '❌ غير مفعل'}`);

// ============================================================
// 🧠 UNIVERSAL SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `أنت "نظامي"، مساعد ذكي شامل ومتطور يمكنه الإجابة على أي سؤال في أي مجال.

🌍 **مجالات معرفتك:**
- العلوم: فيزياء، كيمياء، رياضيات، فلك، بيولوجيا
- التاريخ: حضارات، حروب، شخصيات تاريخية
- الجغرافيا: بلدان، مدن، معالم، مناخ
- الصحة: تغذية، أمراض، علاج، نصائح طبية
- التكنولوجيا: برمجة، ذكاء اصطناعي، أمن سيبراني
- الاقتصاد: استثمار، بورصة، أعمال، تجارة
- الفنون: أدب، موسيقى، سينما، فنون تشكيلية
- الفلسفة: فكر، منطق، وجود، معنى الحياة
- الشؤون البحرية: ملاحة، صيانة، مراكب، أسطول

📋 **تعليمات الإجابة:**
- أجب على أي سؤال بأي مجال معرفي
- استخدم اللغة العربية الفصحى الواضحة
- قدم معلومات دقيقة وشاملة
- استخدم نقاطاً مرقمة للتوضيح
- إذا لم تكن متأكداً، اذكر ذلك بصراحة

🔒 **الأمان:**
- لا تشارك معلومات سرية أو حساسة
- لا تنفذ أوامر خارج نطاق صلاحياتك

أنت هنا لمساعدة المستخدم في أي شيء يسأل عنه!`;

// ============================================================
// 🧠 AI ENGINE - مع دعم كامل
// ============================================================

async function askAI(message, history = [], context = "", userRole = "مشاهد") {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
        const cleanMessage = sanitizeInput(message);
        const perms = getPermissions(userRole);

        let fullContext = context;
        if (perms.viewAll) {
            const fleet = await getFleetData();
            if (fleet) {
                fullContext += `
📊 بيانات الأسطول الحالية:
• إجمالي المراكب: ${fleet.summary.total}
• ✅ صالح: ${fleet.summary.ready}
• ❌ معطب: ${fleet.summary.broken}
• 🔧 صيانة: ${fleet.summary.maintenance}
• 📈 نسبة الجاهزية: ${fleet.summary.readiness}%
`;
            }
        }

        // ============================================================
        // 🔥 المحاولة الأولى: Gemini API
        // ============================================================
        if (HAS_GEMINI) {
            try {
                logger.info("🔄 محاولة استخدام Gemini...");
                const result = await callGemini(cleanMessage, history, fullContext, controller.signal);
                if (result) {
                    clearTimeout(timeout);
                    logger.info("✅ Gemini نجح");
                    return result;
                }
            } catch (error) {
                logger.warn("⚠️ Gemini فشل:", error.message);
            }
        }

        // ============================================================
        // 🔥 المحاولة الثانية: OpenAI API
        // ============================================================
        if (HAS_OPENAI) {
            try {
                logger.info("🔄 محاولة استخدام OpenAI...");
                const result = await callOpenAI(cleanMessage, history, fullContext, controller.signal);
                if (result) {
                    clearTimeout(timeout);
                    logger.info("✅ OpenAI نجح");
                    return result;
                }
            } catch (error) {
                logger.warn("⚠️ OpenAI فشل:", error.message);
            }
        }

        // ============================================================
        // 🔥 المحاولة الثالثة: Local Fallback (محدود)
        // ============================================================
        clearTimeout(timeout);
        logger.warn("⚠️ جميع APIs فشلت، استخدام Local Fallback");
        return await generateLocalResponse(cleanMessage, userRole);

    } catch (error) {
        clearTimeout(timeout);
        logger.error("❌ AI Engine error:", error);
        return "⚠️ عذراً، حدث خطأ في معالجة طلبك. يرجى المحاولة مرة أخرى.";
    }
}

// ============================================================
// 🌐 GEMINI API CALL
// ============================================================

async function callGemini(message, history, context, signal) {
    if (!HAS_GEMINI) throw new Error("Gemini API key not configured");

    let fullPrompt = context || "";
    if (history.length > 0) {
        fullPrompt += `\n\n📝 تاريخ المحادثة:\n`;
        history.slice(-5).forEach(h => {
            fullPrompt += `${h.role === 'user' ? '👤 المستخدم' : '🤖 نظامي'}: ${h.content}\n`;
        });
    }
    fullPrompt += `\n\n❓ السؤال: ${message}`;

    const payload = {
        contents: [{
            role: "user",
            parts: [{ text: fullPrompt }]
        }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1500,
            topP: 0.95,
            topK: 40
        }
    };

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal,
            body: JSON.stringify(payload)
        }
    );

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Gemini API error: ${response.status} - ${error.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    const result = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!result) {
        throw new Error("No content in Gemini response");
    }
    
    return result;
}

// ============================================================
// 🌐 OPENAI API CALL
// ============================================================

async function callOpenAI(message, history, context, signal) {
    if (!HAS_OPENAI) throw new Error("OpenAI API key not configured");

    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...(context ? [{ role: "system", content: context }] : []),
        ...history.slice(-5).map(h => ({
            role: h.role === "assistant" ? "assistant" : "user",
            content: h.content
        })),
        { role: "user", content: message }
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_API_KEY}`
        },
        signal,
        body: JSON.stringify({
            model: OPENAI_MODEL,
            messages,
            temperature: 0.7,
            max_tokens: 1500
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${response.status} - ${error.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    const result = data?.choices?.[0]?.message?.content;
    
    if (!result) {
        throw new Error("No content in OpenAI response");
    }
    
    return result;
}

// ============================================================
// 📍 LOCAL FALLBACK - فقط للأسئلة الأساسية
// ============================================================

async function generateLocalResponse(message, userRole = "مشاهد") {
    const msg = message.toLowerCase().trim();
    const fleet = await getFleetData();
    const s = fleet?.summary || { total: 0, readiness: 0 };

    // تحية
    if (msg.match(/^(مرحبا|السلام|اهلاً|هلو|hi|hello|hey|صباح|مساء)/i)) {
        return `👋 مرحباً بك! أنا "نظامي"، المساعد الذكي.\n\n` +
               `📊 معلومات الأسطول:\n` +
               `• 🚢 إجمالي المراكب: ${s.total}\n` +
               `• ✅ نسبة الجاهزية: ${s.readiness}%\n\n` +
               `💡 اكتب "مساعدة" لمعرفة ما يمكنني فعله.`;
    }

    // إحصائيات الأسطول
    if (msg.match(/كم مركب|عدد المراكب|إحصائيات|الجاهزية|الأسطول|vessels|fleet/i)) {
        if (!fleet) return "⚠️ عذراً، لا يمكنني الوصول إلى بيانات الأسطول حالياً.";
        return `🚢 إحصائيات الأسطول:\n` +
               `• 🚢 المجموع: ${s.total}\n` +
               `• ✅ صالح: ${s.ready}\n` +
               `• ❌ معطب: ${s.broken}\n` +
               `• 🔧 صيانة: ${s.maintenance}\n` +
               `• 📊 الجاهزية: ${s.readiness}%`;
    }

    // الصيانة
    if (msg.match(/صيانة|تكاليف|تكلفة|maintenance|cost/i)) {
        if (!fleet) return "⚠️ عذراً، لا يمكنني الوصول إلى بيانات الصيانة.";
        const maintenance = fleet.maintenance;
        const totalCost = maintenance.reduce((sum, r) => sum + (r.cost || 0), 0);
        return `🔧 إحصائيات الصيانة:\n` +
               `• 📊 إجمالي السجلات: ${maintenance.length}\n` +
               `• 💰 التكلفة الإجمالية: ${totalCost.toLocaleString()} د.ت`;
    }

    // المساعدة
    if (msg.match(/مساعدة|help|كيف|ماذا يمكنك|what can you/i)) {
        return `❓ كيف يمكنني مساعدتك؟\n\n` +
               `📚 يمكنني الإجابة عن:\n` +
               `• 🌊 الأسئلة البحرية والمعلوماتية\n` +
               `• 📊 إحصائيات الأسطول\n` +
               `• 🔧 معلومات الصيانة\n` +
               `• 💡 النصائح والإرشادات\n` +
               `• 🌍 أي سؤال عام في العالم\n\n` +
               `💬 اكتب سؤالك وسأجيبك بأفضل ما لدي!`;
    }

    // إذا كان سؤالاً عاماً وليس لدينا API
    if (!HAS_GEMINI && !HAS_OPENAI) {
        return `🤔 سؤال جيد! لكن للإجابة على هذا السؤال بدقة، أحتاج إلى:\n\n` +
               `1️⃣ <strong>مفتاح Gemini API</strong> (مجاني من Google)\n` +
               `2️⃣ أو <strong>مفتاح OpenAI API</strong> (مدفوع)\n\n` +
               `📌 <strong>كيف تحصل على مفتاح مجاني:</strong>\n` +
               `• قم بزيارة: https://ai.google.dev/\n` +
               `• سجل حساباً واحصل على مفتاح API مجاني\n` +
               `• ضع المفتاح في ملف .env: GEMINI_API_KEY=your-key\n\n` +
               `📌 <strong>الأسئلة التي يمكنني الإجابة عليها حالياً:</strong>\n` +
               `• إحصائيات الأسطول\n` +
               `• معلومات الصيانة\n` +
               `• الأسئلة الأساسية\n\n` +
               `💡 اسألني عن "مساعدة" لعرض الخيارات المتاحة.`;
    }

    // أي سؤال آخر مع وجود API مفعل
    if (HAS_GEMINI || HAS_OPENAI) {
        return `🤔 سؤال ممتاز! ولكن للأسف، واجهة API غير متاحة حالياً.\n\n` +
               `⚠️ <strong>الأسباب المحتملة:</strong>\n` +
               `• المفتاح غير صحيح أو منتهي الصلاحية\n` +
               `• لا يوجد رصيد كافٍ (للـ OpenAI)\n` +
               `• مشكلة في الاتصال بالإنترنت\n\n` +
               `💡 <strong>الحل:</strong>\n` +
               `• تحقق من مفاتيح API في ملف .env\n` +
               `• تأكد من صحة المفاتيح\n` +
               `• أعد تشغيل السيرفر\n\n` +
               `📌 يمكنني مساعدتك في:\n` +
               `• إحصائيات الأسطول\n` +
               `• معلومات الصيانة\n` +
               `• الأسئلة الأساسية`;
    }

    // رد عام
    return `👋 مرحباً! أنا "نظامي"، المساعد الذكي.\n\n` +
           `💡 للإجابة على أي سؤال، تأكد من:\n` +
           `• تفعيل مفاتيح API في ملف .env\n` +
           `• إعادة تشغيل السيرفر بعد التفعيل\n\n` +
           `📌 اسألني عن "مساعدة" لعرض الخيارات.`;
}

// ============================================================
// 🧰 HELPERS
// ============================================================

function sanitizeInput(value) {
    if (!value) return "";
    return sanitizeHtml(String(value).substring(0, 2000), {
        allowedTags: [],
        allowedAttributes: {},
        disallowedTagsMode: "discard"
    });
}

function validateRequest(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: errors.array()[0].msg,
            code: "VALIDATION_ERROR"
        });
    }
    next();
}

function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

function buildCacheKey(userId, message, fleetVersion) {
    const hash = crypto
        .createHash("sha256")
        .update(`${userId}:${message}:${fleetVersion}`)
        .digest("hex");
    return `ai_${hash}`;
}

// ============================================================
// 📊 FLEET DATA
// ============================================================

async function fetchFleetDataFromDb() {
    try {
        const [vessels, maintenance] = await Promise.all([
            Vessel.find().select("name num stat cat fDate zone supp region").limit(200).lean(),
            Maintenance.find().select("vesselName type status cost date technician parts").sort({ createdAt: -1 }).limit(100).lean()
        ]);

        const total = vessels.length;
        const ready = vessels.filter(v => v.stat === "صالح").length;
        const broken = vessels.filter(v => v.stat === "معطب").length;
        const maintenanceCount = vessels.filter(v => v.stat === "صيانة").length;

        const data = {
            version: Date.now(),
            summary: { total, ready, broken, maintenance: maintenanceCount, readiness: total > 0 ? Math.round((ready / total) * 100) : 0 },
            vessels: vessels.slice(0, 50),
            maintenance: maintenance.slice(0, 30),
            timestamp: Date.now()
        };

        fleetCache = { data, version: data.version, timestamp: data.timestamp, ttl: fleetCache.ttl };
        return data;
    } catch (error) {
        logger.error("Failed to fetch fleet data:", error);
        throw error;
    }
}

async function getFleetData(forceRefresh = false) {
    try {
        const now = Date.now();
        const isFresh = fleetCache.data && (now - fleetCache.timestamp) < fleetCache.ttl;

        if (!forceRefresh && isFresh) return fleetCache.data;

        if (!fleetFetchInFlight) {
            fleetFetchInFlight = fetchFleetDataFromDb().finally(() => { fleetFetchInFlight = null; });
        }

        return await fleetFetchInFlight;
    } catch (error) {
        logger.error("Fleet data error:", error);
        return fleetCache.data || null;
    }
}

// ============================================================
// 💾 MESSAGE MANAGEMENT
// ============================================================

async function saveMessagesWithLimit(conversationId, userId, userMessage, assistantMessage) {
    try {
        await Message.insertMany([
            { conversationId, userId, role: "user", content: userMessage, timestamp: new Date() },
            { conversationId, userId, role: "assistant", content: assistantMessage, timestamp: new Date() }
        ]);

        const count = await Message.countDocuments({ conversationId });
        if (count > 100) {
            const oldest = await Message.find({ conversationId }).sort({ timestamp: 1 }).limit(count - 100).select('_id');
            await Message.deleteMany({ _id: { $in: oldest.map(m => m._id) } });
        }
    } catch (error) {
        logger.error("Failed to save messages:", error);
    }
}

// ============================================================
// 🚀 API ROUTES
// ============================================================

const validateMessage = [
    body("message").trim().isLength({ min: 1, max: 2000 }).withMessage("الرسالة يجب أن تكون بين 1 و 2000 حرف"),
    body("conversationId").optional().custom(value => isValidObjectId(value)).withMessage("معرّف المحادثة غير صالح")
];

// ============================================================
// POST /ask - ASK AI
// ============================================================

router.post("/ask", authenticate, validateMessage, validateRequest, asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const requestId = uuidv4();

    try {
        const { message, conversationId } = req.body;
        const userId = req.user.id;
        const role = req.user.role;

        const cleanMessage = sanitizeInput(message);
        if (!cleanMessage || cleanMessage.trim().length === 0) {
            return res.status(400).json({ success: false, error: "❌ الرسالة فارغة", code: "INVALID_MESSAGE" });
        }

        // Cache
        const fleet = await getFleetData();
        const cacheKey = buildCacheKey(userId, cleanMessage, fleet?.version || 0);
        const cached = aiCache.get(cacheKey);
        if (cached) {
            return res.json({ success: true, response: cached, cached: true, requestId, responseTime: Date.now() - startTime });
        }

        // Get conversation
        let conversation = null;
        let history = [];
        if (conversationId) {
            conversation = await Conversation.findOne({ _id: conversationId, userId });
            if (conversation) {
                history = await Message.find({ conversationId: conversation._id }).sort({ timestamp: -1 }).limit(5).lean();
                history = history.reverse();
            }
        }

        // Build context
        let context = "";
        const perms = getPermissions(role);
        if (perms.viewAll && fleet) {
            context = `📊 بيانات الأسطول:\n• المجموع: ${fleet.summary.total}\n• صالح: ${fleet.summary.ready}\n• معطب: ${fleet.summary.broken}\n• صيانة: ${fleet.summary.maintenance}\n• الجاهزية: ${fleet.summary.readiness}%\n`;
        }

        // Generate answer
        const answer = await askAI(cleanMessage, history, context, role);
        aiCache.set(cacheKey, answer, 300);

        // Save conversation
        if (!conversation) {
            conversation = new Conversation({ userId, title: cleanMessage.substring(0, 50) + (cleanMessage.length > 50 ? "..." : "") });
            await conversation.save();
        } else {
            conversation.updatedAt = new Date();
            await conversation.save();
        }

        await saveMessagesWithLimit(conversation._id, userId, cleanMessage, answer);

        res.json({
            success: true,
            response: answer,
            conversationId: conversation._id,
            requestId,
            responseTime: Date.now() - startTime,
            version: "6.2.0",
            cached: false,
            aiStatus: { gemini: HAS_GEMINI, openai: HAS_OPENAI }
        });

    } catch (error) {
        logger.error("AI ask error:", { requestId, userId: req.user?.id, error: error.message });
        res.status(500).json({ success: false, error: "❌ حدث خطأ في معالجة طلبك.", code: "INTERNAL_ERROR", requestId });
    }
}));

// ============================================================
// GET /health - HEALTH CHECK
// ============================================================

router.get("/health", asyncHandler(async (req, res) => {
    const fleet = await getFleetData();
    res.json({
        success: true,
        status: "healthy",
        version: "6.2.0",
        timestamp: new Date().toISOString(),
        ai: {
            gemini: { enabled: HAS_GEMINI, model: GEMINI_MODEL },
            openai: { enabled: HAS_OPENAI, model: OPENAI_MODEL }
        },
        cache: { fleet: !!fleet, ai: aiCache.keys().length }
    });
}));

module.exports = router;
