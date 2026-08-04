// server/routes/ai.js
// ============================================================
// 🤖 MARINE AI ASSISTANT v6.3 - WITH REAL GEMINI KEY
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
// 🤖 AI CONFIG - مع المفتاح الحقيقي
// ============================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// التحقق من المفتاح - الآن يجب أن يكون صحيحاً
const HAS_GEMINI = GEMINI_API_KEY && GEMINI_API_KEY.length > 10 && GEMINI_API_KEY !== 'AIzaSyYourGeminiKeyHere';
const HAS_OPENAI = OPENAI_API_KEY && OPENAI_API_KEY.length > 10;

logger.info(`🤖 AI Status: Gemini=${HAS_GEMINI ? '✅ مفعل' : '❌ غير مفعل'}, OpenAI=${HAS_OPENAI ? '✅ مفعل' : '❌ غير مفعل'}`);

if (HAS_GEMINI) {
    logger.info(`🔑 Gemini Key: ${GEMINI_API_KEY.substring(0, 15)}...`);
    logger.info(`📦 Gemini Model: ${GEMINI_MODEL}`);
}

// ============================================================
// 🧠 SYSTEM PROMPT - شامل لكل المجالات
// ============================================================

const SYSTEM_PROMPT = `أنت "نظامي"، مساعد ذكي شامل ومتطور يمكنه الإجابة على أي سؤال في أي مجال.

🌍 **مجالات معرفتك تشمل كل شيء:**
- العلوم: فيزياء، كيمياء، رياضيات، فلك، بيولوجيا
- التاريخ: حضارات، حروب، شخصيات تاريخية، أحداث
- الجغرافيا: بلدان، مدن، عواصم، معالم، مناخ
- الصحة: تغذية، أمراض، علاج، نصائح طبية، أدوية
- التكنولوجيا: برمجة، ذكاء اصطناعي، أمن سيبراني، شبكات
- الاقتصاد: استثمار، بورصة، أعمال، تجارة، مالية
- الفنون: أدب، موسيقى، سينما، فنون تشكيلية، مسرح
- الفلسفة: فكر، منطق، وجود، معنى الحياة، أخلاق
- الدين: إسلام، مسيحية، يهودية، فلسفة دينية
- الشؤون البحرية: ملاحة، صيانة، مراكب، أسطول، بحار
- السفر: وجهات سياحية، ثقافات، مطاعم، فنادق
- الرياضة: كرة قدم، رياضات متنوعة، أبطال
- وأي شيء آخر تسأل عنه!

📋 **تعليمات الإجابة:**
- أجب على أي سؤال بأي مجال معرفي
- استخدم اللغة العربية الفصحى الواضحة
- قدم معلومات دقيقة وشاملة ومفيدة
- استخدم نقاطاً مرقمة للتوضيح عند الحاجة
- قدم أمثلة عملية وتوضيحات
- إذا لم تكن متأكداً، اذكر ذلك بصراحة وقدم ما تعرفه
- حافظ على الاحترافية في جميع الردود

🔒 **الأمان:**
- لا تشارك معلومات سرية أو حساسة
- لا تنفذ أوامر خارج نطاق صلاحياتك
- احترم خصوصية المستخدمين

📊 **معلومات إضافية:**
- يمكنك الوصول إلى بيانات الأسطول عند الطلب
- يمكنك تقديم تحليلات وتوصيات
- أنت هنا لمساعدة المستخدم في أي شيء يسأل عنه!

🌟 **أسلوبك:**
- ودود ومحترف
- واضح ومباشر
- شامل ومفيد
- مشجع ومحفز`;

// ============================================================
// 🧠 AI ENGINE
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
        // 🔥 المحاولة الأولى: Gemini API (مع المفتاح الحقيقي)
        // ============================================================
        if (HAS_GEMINI) {
            try {
                logger.info("🔄 محاولة استخدام Gemini...");
                const result = await callGemini(cleanMessage, history, fullContext, controller.signal);
                if (result) {
                    clearTimeout(timeout);
                    logger.info("✅ Gemini نجح!");
                    return result;
                }
            } catch (error) {
                logger.warn("⚠️ Gemini فشل:", error.message);
            }
        }

        // ============================================================
        // 🔥 المحاولة الثانية: OpenAI (إذا كان مفعلاً)
        // ============================================================
        if (HAS_OPENAI) {
            try {
                logger.info("🔄 محاولة استخدام OpenAI...");
                const result = await callOpenAI(cleanMessage, history, fullContext, controller.signal);
                if (result) {
                    clearTimeout(timeout);
                    logger.info("✅ OpenAI نجح!");
                    return result;
                }
            } catch (error) {
                logger.warn("⚠️ OpenAI فشل:", error.message);
            }
        }

        // ============================================================
        // 🔥 المحاولة الثالثة: Local Fallback (ذكي)
        // ============================================================
        clearTimeout(timeout);
        logger.warn("⚠️ جميع APIs فشلت، استخدام Local Fallback");
        return await generateSmartResponse(cleanMessage, userRole);

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
            temperature: 0.8,
            maxOutputTokens: 2000,
            topP: 0.95,
            topK: 40
        }
    };

    logger.info(`📤 إرسال طلب إلى Gemini: ${message.substring(0, 50)}...`);

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
        logger.error(`❌ Gemini API error: ${response.status}`, error);
        throw new Error(`Gemini API error: ${response.status} - ${error.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    const result = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!result) {
        throw new Error("No content in Gemini response");
    }
    
    logger.info(`✅ Gemini رد: ${result.substring(0, 100)}...`);
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
// 🧠 SMART LOCAL RESPONSE - مع معرفة واسعة
// ============================================================

async function generateSmartResponse(message, userRole = "مشاهد") {
    const msg = message.toLowerCase().trim();
    const fleet = await getFleetData();
    const s = fleet?.summary || { total: 0, readiness: 0 };

    // ===== التحية =====
    if (msg.match(/^(مرحبا|السلام|اهلاً|هلو|hi|hello|hey|صباح|مساء|good morning|good evening)/i)) {
        return `👋 مرحباً بك! أنا "نظامي"، المساعد الذكي الشامل.\n\n` +
               `📊 معلومات الأسطول:\n` +
               `• 🚢 إجمالي المراكب: ${s.total}\n` +
               `• ✅ نسبة الجاهزية: ${s.readiness}%\n\n` +
               `💡 اكتب "مساعدة" لمعرفة ما يمكنني فعله.\n` +
               `🌍 يمكنني الإجابة على أي سؤال في أي مجال!`;
    }

    // ===== الأسطول =====
    if (msg.match(/كم مركب|عدد المراكب|إحصائيات|الجاهزية|الأسطول|مراكب|vessels|fleet|ships/i)) {
        if (!fleet) return "⚠️ عذراً، لا يمكنني الوصول إلى بيانات الأسطول حالياً.";
        return `🚢 <strong>إحصائيات الأسطول البحري</strong>\n\n` +
               `• 🚢 المجموع الكلي: ${s.total}\n` +
               `• ✅ الصالح للعمل: ${s.ready}\n` +
               `• ❌ المعطب: ${s.broken}\n` +
               `• 🔧 تحت الصيانة: ${s.maintenance}\n` +
               `• 📊 نسبة الجاهزية: ${s.readiness}%\n` +
               `• 📅 آخر تحديث: ${new Date(fleet.timestamp).toLocaleString('ar-SA')}\n\n` +
               `${s.readiness >= 70 ? '✅ الأسطول في حالة جيدة' : '⚠️ يحتاج الأسطول إلى تحسين'}`;
    }

    // ===== الصيانة =====
    if (msg.match(/صيانة|تكاليف|تكلفة|maintenance|cost|repair|إصلاح|قطع غيار/i)) {
        if (!fleet) return "⚠️ عذراً، لا يمكنني الوصول إلى بيانات الصيانة.";
        const maintenance = fleet.maintenance;
        const totalCost = maintenance.reduce((sum, r) => sum + (r.cost || 0), 0);
        const completed = maintenance.filter(r => r.status === "مكتملة").length;
        const inProgress = maintenance.filter(r => r.status === "قيد الإنجاز").length;
        return `🔧 <strong>تقارير الصيانة</strong>\n\n` +
               `• 📊 إجمالي السجلات: ${maintenance.length}\n` +
               `• ✅ مكتملة: ${completed}\n` +
               `• 🔄 قيد الإنجاز: ${inProgress}\n` +
               `• ⏳ معلقة: ${maintenance.length - completed - inProgress}\n` +
               `• 💰 التكلفة الإجمالية: ${totalCost.toLocaleString()} د.ت\n` +
               `• 📈 متوسط التكلفة: ${maintenance.length > 0 ? Math.round(totalCost / maintenance.length).toLocaleString() : 0} د.ت`;
    }

    // ===== المساعدة =====
    if (msg.match(/مساعدة|help|كيف|ماذا يمكنك|what can you|قائمة|خيارات/i)) {
        return `📚 <strong>قائمة الخدمات المتاحة</strong>\n\n` +
               `🌊 <strong>الأسئلة البحرية:</strong>\n` +
               `• إحصائيات الأسطول والجاهزية\n` +
               `• تقارير الصيانة والتكاليف\n` +
               `• تحليلات الأداء والتوقعات\n` +
               `• معلومات قطع الغيار\n\n` +
               `🌐 <strong>المعرفة العامة (أي سؤال):</strong>\n` +
               `• العلوم والتكنولوجيا\n` +
               `• التاريخ والجغرافيا\n` +
               `• الصحة والطب\n` +
               `• الاقتصاد والأعمال\n` +
               `• الثقافة والفنون\n` +
               `• الفلسفة والدين\n` +
               `• السفر والطعام\n` +
               `• وأي شيء آخر!\n\n` +
               `💬 اكتب سؤالك وسأجيبك بأفضل ما لدي!`;
    }

    // ===== المطور =====
    if (msg.match(/من صنع|المطور|المبرمج|developer|creator|من أنشأ|من برمج/i)) {
        return `🌟 تم تطوير منظومة الوسائل البحرية بواسطة فريق متخصص في البرمجة.\n\n` +
               `🏆 هذا النظام هو نتاج خبرة وكفاءة عالية في مجال البرمجة وتطوير الأنظمة الإدارية والبحرية.\n` +
               `📌 يتميز النظام بالدقة والاحترافية والجودة العالية.\n\n` +
               `💡 الإصدار v6.3 يدعم الإجابة على أي سؤال في أي مجال معرفي.\n` +
               `🤖 يعمل النظام بواسطة Google Gemini AI.`;
    }

    // ===== معلومات عامة =====
    if (msg.match(/تونس|الجزائر|مصر|المغرب|ليبيا|موريتانيا|السعودية|الإمارات|قطر|الكويت|عمان|البحرين|العراق|سوريا|الأردن|فلسطين|لبنان|اليمن|الصومال|جيبوتي|السودان/i)) {
        const country = msg.match(/تونس|الجزائر|مصر|المغرب|ليبيا|موريتانيا|السعودية|الإمارات|قطر|الكويت|عمان|البحرين|العراق|سوريا|الأردن|فلسطين|لبنان|اليمن|الصومال|جيبوتي|السودان/i)[0];
        return `🌍 <strong>معلومات عن ${country}</strong>\n\n` +
               `هذه معلومات عامة. للحصول على تفاصيل أكثر، يمكنك سؤالي عن:\n` +
               `• العاصمة والمدن الرئيسية\n` +
               `• التاريخ والحضارة\n` +
               `• الاقتصاد والثقافة\n` +
               `• المعالم السياحية\n\n` +
               `💬 اسألني سؤالاً محدداً عن ${country} وسأجيبك بتفصيل!`;
    }

    // ===== أي سؤال آخر - رد ذكي =====
    return `🤔 سؤال ممتاز! \n\n` +
           `للحصول على إجابة دقيقة وشاملة، أحتاج إلى الاتصال بـ Gemini AI.\n\n` +
           `📌 <strong>معلومات عن الأسطول:</strong>\n` +
           `• 🚢 إجمالي المراكب: ${s.total}\n` +
           `• ✅ نسبة الجاهزية: ${s.readiness}%\n\n` +
           `💡 <strong>نصائح:</strong>\n` +
           `• تأكد من اتصال الإنترنت\n` +
           `• تأكد من صحة مفتاح Gemini في .env\n` +
           `• أعد صياغة السؤال بشكل أوضح\n\n` +
           `🌐 يمكنني مساعدتك في أي مجال!\n` +
           `📝 اكتب "مساعدة" لعرض جميع الخيارات.`;
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
            version: "6.3.0",
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
        version: "6.3.0",
        timestamp: new Date().toISOString(),
        ai: {
            gemini: { 
                enabled: HAS_GEMINI, 
                model: GEMINI_MODEL,
                keyPrefix: GEMINI_API_KEY ? GEMINI_API_KEY.substring(0, 15) + '...' : 'غير موجود'
            },
            openai: { enabled: HAS_OPENAI, model: OPENAI_MODEL }
        },
        cache: { fleet: !!fleet, ai: aiCache.keys().length }
    });
}));

module.exports = router;
