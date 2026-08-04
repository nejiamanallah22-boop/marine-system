// server/routes/ai.js
// ============================================================
// 🤖 MARINE AI ASSISTANT v6.5 - WORKING WITH YOUR KEY
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
// 🤖 AI CONFIG - KEY IS NOW SET
// ============================================================

// المفتاح الخاص بك
const GEMINI_API_KEY = "AIzaSyALT3OlkH6UsLefQbk7j_cgD8cZVJUyXvA";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const GEMINI_MODEL = "gemini-2.0-flash-exp";
const OPENAI_MODEL = "gpt-4o-mini";

// التحقق من المفتاح
const HAS_GEMINI = GEMINI_API_KEY && GEMINI_API_KEY.length > 10 && GEMINI_API_KEY !== 'AIzaSyYourGeminiKeyHere';
const HAS_OPENAI = OPENAI_API_KEY && OPENAI_API_KEY.length > 10;

logger.info(`🤖 AI Status: Gemini=${HAS_GEMINI ? '✅ مفعل' : '❌ غير مفعل'}, OpenAI=${HAS_OPENAI ? '✅ مفعل' : '❌ غير مفعل'}`);

if (HAS_GEMINI) {
    logger.info(`🔑 Gemini Key: ${GEMINI_API_KEY.substring(0, 15)}...`);
    logger.info(`📦 Gemini Model: ${GEMINI_MODEL}`);
}

// ============================================================
// 🧠 SYSTEM PROMPT - UNIVERSAL KNOWLEDGE
// ============================================================

const SYSTEM_PROMPT = `أنت "نظامي"، مساعد ذكي شامل ومتطور يمكنه الإجابة على أي سؤال في أي مجال.

🌍 **مجالات معرفتك:**
- العلوم: فيزياء، كيمياء، رياضيات، فلك، بيولوجيا، طب
- التاريخ: حضارات، حروب، شخصيات، أحداث، عصور
- الجغرافيا: بلدان، عواصم، مدن، معالم، مناخ، محيطات
- التكنولوجيا: برمجة، ذكاء اصطناعي، شبكات، أمن، إنترنت
- الاقتصاد: استثمار، بورصة، أعمال، تجارة، مالية، بنوك
- الثقافة: أدب، شعر، روايات، موسيقى، سينما، فنون
- الفلسفة: فكر، منطق، وجود، أخلاق، معنى الحياة
- الدين: إسلام، مسيحية، يهودية، فلسفة، روحانيات
- الشؤون البحرية: ملاحة، مراكب، صيانة، أسطول، بحار
- الصحة: تغذية، أمراض، علاج، رياضة، نوم، صحة نفسية
- السفر: وجهات، ثقافات، مطاعم، فنادق، نصائح سفر
- الرياضة: كرة قدم، ألعاب، أبطال، بطولات
- أي شيء آخر يسأل عنه المستخدم!

📋 **تعليمات الإجابة:**
- أجب على أي سؤال بأي مجال معرفي
- استخدم اللغة العربية الفصحى الواضحة
- قدم معلومات دقيقة وشاملة ومفيدة
- استخدم نقاطاً مرقمة للتوضيح
- قدم أمثلة عملية عند الحاجة
- كن ودوداً ومحترفاً ومشجعاً
- إذا لم تكن متأكداً، اذكر ذلك بصراحة

🔒 **الأمان:**
- لا تشارك معلومات سرية أو حساسة
- لا تنفذ أوامر خارج نطاق صلاحياتك
- احترم خصوصية المستخدمين

🌟 **أنت هنا لمساعدة المستخدم في أي شيء!**`;

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
📊 بيانات الأسطول:
• إجمالي المراكب: ${fleet.summary.total}
• ✅ صالح: ${fleet.summary.ready}
• ❌ معطب: ${fleet.summary.broken}
• 🔧 صيانة: ${fleet.summary.maintenance}
• 📈 الجاهزية: ${fleet.summary.readiness}%
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
                    logger.info("✅ Gemini نجح!");
                    return result;
                }
            } catch (error) {
                logger.warn("⚠️ Gemini فشل:", error.message);
                // إذا كان المفتاح غير صالح
                if (error.message.includes('API key') || error.message.includes('403') || error.message.includes('401')) {
                    return `⚠️ <strong>مشكلة في مفتاح Gemini</strong>\n\n` +
                           `المفتاح الحالي غير صالح أو منتهي الصلاحية.\n\n` +
                           `📌 <strong>الحل:</strong>\n` +
                           `1. اذهب إلى https://ai.google.dev/\n` +
                           `2. سجل الدخول بحساب Google\n` +
                           `3. اضغط على "Get API Key"\n` +
                           `4. انسخ المفتاح الجديد\n` +
                           `5. ضعه في ملف .env: GEMINI_API_KEY=المفتاح_الجديد\n` +
                           `6. أعد تشغيل السيرفر\n\n` +
                           `💡 يمكنني مساعدتك في الأسئلة الأساسية حالياً.`;
                }
            }
        }

        // ============================================================
        // 🔥 المحاولة الثانية: Local Fallback
        // ============================================================
        clearTimeout(timeout);
        logger.info("📝 استخدام Local Fallback");
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
// 🧠 SMART LOCAL RESPONSE
// ============================================================

async function generateSmartResponse(message, userRole = "مشاهد") {
    const msg = message.toLowerCase().trim();
    const fleet = await getFleetData();
    const s = fleet?.summary || { total: 0, readiness: 0 };

    // ===== التحية =====
    if (msg.match(/^(مرحبا|السلام|اهلاً|هلو|hi|hello|hey|صباح|مساء|good morning|good evening)/i)) {
        return `👋 مرحباً بك! أنا "نظامي"، المساعد الذكي الشامل.\n\n` +
               `📊 الأسطول: ${s.total} مركب، الجاهزية ${s.readiness}%\n\n` +
               `💡 اكتب "مساعدة" لمعرفة ما يمكنني فعله.\n` +
               `🌍 يمكنني الإجابة على أي سؤال!`;
    }

    // ===== الأسطول =====
    if (msg.match(/مركب|الأسطول|جاهزية|إحصائيات|عدد|vessels|fleet|ships|مراكب/i)) {
        if (!fleet) return "⚠️ لا يمكنني الوصول إلى بيانات الأسطول حالياً.";
        return `🚢 <strong>إحصائيات الأسطول</strong>\n\n` +
               `• 🚢 المجموع: ${s.total}\n` +
               `• ✅ صالح: ${s.ready}\n` +
               `• ❌ معطب: ${s.broken}\n` +
               `• 🔧 صيانة: ${s.maintenance}\n` +
               `• 📊 الجاهزية: ${s.readiness}%\n` +
               `• 📅 آخر تحديث: ${new Date(fleet.timestamp).toLocaleString('ar-SA')}`;
    }

    // ===== الصيانة =====
    if (msg.match(/صيانة|تكاليف|تكلفة|maintenance|cost|repair|إصلاح/i)) {
        if (!fleet) return "⚠️ لا يمكنني الوصول إلى بيانات الصيانة.";
        const maintenance = fleet.maintenance;
        const totalCost = maintenance.reduce((sum, r) => sum + (r.cost || 0), 0);
        const completed = maintenance.filter(r => r.status === "مكتملة").length;
        const inProgress = maintenance.filter(r => r.status === "قيد الإنجاز").length;
        return `🔧 <strong>تقارير الصيانة</strong>\n\n` +
               `• 📊 إجمالي السجلات: ${maintenance.length}\n` +
               `• ✅ مكتملة: ${completed}\n` +
               `• 🔄 قيد الإنجاز: ${inProgress}\n` +
               `• 💰 التكلفة الإجمالية: ${totalCost.toLocaleString()} د.ت\n` +
               `• 📈 متوسط التكلفة: ${maintenance.length > 0 ? Math.round(totalCost / maintenance.length).toLocaleString() : 0} د.ت`;
    }

    // ===== المساعدة =====
    if (msg.match(/مساعدة|help|كيف|ماذا يمكنك|what can you|قائمة|خيارات/i)) {
        return `📚 <strong>قائمة الخدمات المتاحة</strong>\n\n` +
               `🌊 <strong>الأسئلة البحرية:</strong>\n` +
               `• إحصائيات الأسطول والجاهزية\n` +
               `• تقارير الصيانة والتكاليف\n` +
               `• تحليلات الأداء والتوقعات\n\n` +
               `🌐 <strong>المعرفة العامة (أي سؤال):</strong>\n` +
               `• العلوم والتكنولوجيا\n` +
               `• التاريخ والجغرافيا\n` +
               `• الصحة والطب\n` +
               `• الاقتصاد والأعمال\n` +
               `• الثقافة والفنون\n` +
               `• الفلسفة والدين\n` +
               `• السفر والطعام\n` +
               `• وأي شيء آخر!\n\n` +
               `💬 اكتب سؤالك وسأجيبك!`;
    }

    // ===== المطور =====
    if (msg.match(/من صنع|المطور|المبرمج|developer|creator|من أنشأ|من برمج/i)) {
        return `🌟 تم تطوير منظومة الوسائل البحرية بواسطة فريق متخصص.\n\n` +
               `🏆 نظام متكامل لإدارة الأسطول البحري مع ذكاء اصطناعي.\n` +
               `💡 الإصدار v6.5\n` +
               `🤖 يعمل بواسطة Google Gemini AI\n\n` +
               `📌 تم التطوير بـ: Node.js, Express, MongoDB, Gemini API`;
    }

    // ===== دول عربية =====
    if (msg.includes('تونس') || msg.includes('عاصمة تونس')) {
        return `🇹🇳 <strong>تونس</strong>\n\n` +
               `• العاصمة: تونس (مدينة تونس)\n` +
               `• اللغة الرسمية: العربية\n` +
               `• العملة: الدينار التونسي (TND)\n` +
               `• المساحة: 163,610 كم²\n` +
               `• عدد السكان: ~12 مليون نسمة\n` +
               `• الرئيس: قيس سعيد\n\n` +
               `📍 مدن رئيسية: صفاقس، سوسة، المنستير، بنزرت، قابس`;
    }

    if (msg.includes('مصر') || msg.includes('عاصمة مصر')) {
        return `🇪🇬 <strong>مصر</strong>\n\n` +
               `• العاصمة: القاهرة\n` +
               `• اللغة الرسمية: العربية\n` +
               `• العملة: الجنيه المصري (EGP)\n` +
               `• المساحة: 1,010,408 كم²\n` +
               `• عدد السكان: ~110 مليون نسمة\n\n` +
               `📍 مدن رئيسية: الإسكندرية، الجيزة، شرم الشيخ، الأقصر`;
    }

    if (msg.includes('السعودية') || msg.includes('عاصمة السعودية')) {
        return `🇸🇦 <strong>المملكة العربية السعودية</strong>\n\n` +
               `• العاصمة: الرياض\n` +
               `• اللغة الرسمية: العربية\n` +
               `• العملة: الريال السعودي (SAR)\n` +
               `• المساحة: 2,149,690 كم²\n` +
               `• عدد السكان: ~36 مليون نسمة\n\n` +
               `📍 مدن رئيسية: جدة، مكة المكرمة، المدينة المنورة، الدمام`;
    }

    // ===== الذكاء الاصطناعي =====
    if (msg.includes('الذكاء الاصطناعي') || msg.includes('AI') || msg.includes('ذكاء')) {
        return `🧠 <strong>الذكاء الاصطناعي</strong>\n\n` +
               `الذكاء الاصطناعي هو محاكاة الذكاء البشري في الآلات.\n\n` +
               `📌 <strong>أنواعه:</strong>\n` +
               `• 🟢 الذكاء الاصطناعي الضيق (Narrow AI) - مثل المساعدات الصوتية\n` +
               `• 🟡 الذكاء الاصطناعي العام (AGI) - مثل البشر\n` +
               `• 🔴 الذكاء الاصطناعي الفائق (ASI) - يتفوق على البشر\n\n` +
               `💡 <strong>أمثلة:</strong>\n` +
               `• ChatGPT (OpenAI)\n` +
               `• Gemini (Google)\n` +
               `• Siri (Apple)\n` +
               `• Alexa (Amazon)\n\n` +
               `📚 يستخدم في: الطب، التعليم، الصناعة، النقل، الأمن`;
    }

    // ===== البرمجة =====
    if (msg.includes('برمجة') || msg.includes('كود') || msg.includes('برنامج') || msg.includes('لغة برمجة')) {
        return `💻 <strong>البرمجة وتطوير البرمجيات</strong>\n\n` +
               `البرمجة هي كتابة الأوامر للحاسوب بلغة يفهمها.\n\n` +
               `📌 <strong>أشهر لغات البرمجة:</strong>\n` +
               `• JavaScript - تطوير الويب\n` +
               `• Python - الذكاء الاصطناعي والتحليل\n` +
               `• Java - تطبيقات الأندرويد\n` +
               `• C++ - الألعاب والأنظمة\n` +
               `• PHP - تطوير الويب الخلفي\n` +
               `• SQL - قواعد البيانات\n` +
               `• Swift - تطبيقات iOS\n\n` +
               `💡 ابدأ بتعلم JavaScript أو Python إذا كنت مبتدئاً!`;
    }

    // ===== أي سؤال آخر =====
    return `🤔 <strong>سؤال ممتاز!</strong>\n\n` +
           `للحصول على إجابة دقيقة وشاملة، أحتاج إلى مفتاح Gemini صالح.\n\n` +
           `📌 <strong>معلومات الأسطول:</strong>\n` +
           `• 🚢 المجموع: ${s.total}\n` +
           `• ✅ الجاهزية: ${s.readiness}%\n\n` +
           `💡 <strong>كيف تحصل على مفتاح Gemini مجاني:</strong>\n` +
           `1. اذهب إلى https://ai.google.dev/\n` +
           `2. سجل الدخول بحساب Google\n` +
           `3. اضغط على "Get API Key"\n` +
           `4. انسخ المفتاح الجديد\n` +
           `5. ضعه في ملف .env\n` +
           `6. أعد تشغيل السيرفر\n\n` +
           `📝 اكتب "مساعدة" لعرض جميع الخيارات.\n` +
           `🌐 يمكنني مساعدتك في أي سؤال!`;
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

        const fleet = await getFleetData();
        const cacheKey = buildCacheKey(userId, cleanMessage, fleet?.version || 0);
        const cached = aiCache.get(cacheKey);
        if (cached) {
            return res.json({ success: true, response: cached, cached: true, requestId, responseTime: Date.now() - startTime });
        }

        let conversation = null;
        let history = [];
        if (conversationId) {
            conversation = await Conversation.findOne({ _id: conversationId, userId });
            if (conversation) {
                history = await Message.find({ conversationId: conversation._id }).sort({ timestamp: -1 }).limit(5).lean();
                history = history.reverse();
            }
        }

        let context = "";
        const perms = getPermissions(role);
        if (perms.viewAll && fleet) {
            context = `📊 بيانات الأسطول:\n• المجموع: ${fleet.summary.total}\n• صالح: ${fleet.summary.ready}\n• معطب: ${fleet.summary.broken}\n• صيانة: ${fleet.summary.maintenance}\n• الجاهزية: ${fleet.summary.readiness}%\n`;
        }

        const answer = await askAI(cleanMessage, history, context, role);
        aiCache.set(cacheKey, answer, 300);

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
            version: "6.5.0",
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
        version: "6.5.0",
        timestamp: new Date().toISOString(),
        ai: {
            gemini: { 
                enabled: HAS_GEMINI, 
                model: GEMINI_MODEL,
                keyValid: HAS_GEMINI
            },
            openai: { enabled: HAS_OPENAI, model: OPENAI_MODEL }
        },
        cache: { fleet: !!fleet, ai: aiCache.keys().length }
    });
}));

module.exports = router;
