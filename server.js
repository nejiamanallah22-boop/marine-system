// server/routes/ai.js
// ============================================================
// 🤖 Marine System AI Assistant v6.0 Enterprise
// متوافق مع نظام الصلاحيات الحالي
// ============================================================

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const crypto = require("crypto");
const NodeCache = require("node-cache");
const sanitizeHtml = require("sanitize-html");
const { body, validationResult } = require("express-validator");
const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const { v4: uuidv4 } = require("uuid");

// ============================================================
// 📦 MODELS
// ============================================================

const Vessel = require("../models/Vessel");
const Maintenance = require("../models/Maintenance");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

// ============================================================
// 🔐 MIDDLEWARE - استيراد نظام الصلاحيات من السيرفر الرئيسي
// ============================================================

// ملاحظة: يتم استيراد دوال المصادقة من الملف الرئيسي
// لكننا سنعيد تعريفها هنا للتوافق
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
    
    // دعم التوكن التجريبي
    if (token.startsWith('demo-token-')) {
        req.user = { 
            id: 'demo-user-id', 
            email: 'admin@example.com', 
            role: 'مسؤول', 
            region: '' 
        };
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
// 🔐 PERMISSIONS - متوافق مع نظام الصلاحيات الحالي
// ============================================================

const PERMISSIONS = {
    "مسؤول": {
        level: 100,
        viewAll: true,
        analyze: true,
        export: true,
        delete: true,
        manageUsers: true,
        manageSystem: true,
        maxMessages: 200
    },
    "محرر إقليمي": {
        level: 80,
        viewAll: false,
        analyze: true,
        export: true,
        delete: false,
        manageUsers: false,
        manageSystem: false,
        maxMessages: 100
    },
    "فني صيانة": {
        level: 50,
        viewAll: false,
        analyze: true,
        export: false,
        delete: false,
        manageUsers: false,
        manageSystem: false,
        maxMessages: 50
    },
    "مشاهد": {
        level: 20,
        viewAll: false,
        analyze: false,
        export: false,
        delete: false,
        manageUsers: false,
        manageSystem: false,
        maxMessages: 20
    }
};

function getPermissions(role) {
    return PERMISSIONS[role] || PERMISSIONS["مشاهد"];
}

function hasPermission(req, permission) {
    const perms = getPermissions(req.user?.role);
    return perms[permission] === true;
}

function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: "❌ الرجاء تسجيل الدخول",
                code: "UNAUTHORIZED"
            });
        }
        if (hasPermission(req, permission)) {
            return next();
        }
        return res.status(403).json({
            success: false,
            error: "❌ ليس لديك صلاحية لهذه العملية",
            code: "FORBIDDEN"
        });
    };
}

// ============================================================
// ⚠️ ENCRYPTION KEY
// ============================================================

const ENCRYPTION_KEY = (() => {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        console.error("❌ FATAL: ENCRYPTION_KEY environment variable is required");
        console.error("📌 Generate with: node -e \"console.log(crypto.randomBytes(32).toString('hex'))\"");
        // استخدام مفتاح مؤقت للتطوير فقط
        return crypto.randomBytes(32).toString('hex');
    }
    return key;
})();

const IV_LENGTH = 16;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

function encrypt(text) {
    if (!text) return null;
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        let encrypted = cipher.update(text, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const authTag = cipher.getAuthTag();
        return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
    } catch (error) {
        console.error("Encryption error:", error);
        return null;
    }
}

function decrypt(text) {
    if (!text) return null;
    try {
        const parts = text.split(':');
        if (parts.length !== 3) return null;
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encryptedText = Buffer.from(parts[2], 'hex');
        const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString('utf8');
    } catch (error) {
        console.error("Decryption error:", error);
        return null;
    }
}

// ============================================================
// 📝 LOGGER
// ============================================================

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: "marine-ai" },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        new DailyRotateFile({
            filename: "logs/ai-%DATE%.log",
            datePattern: "YYYY-MM-DD",
            maxSize: "20m",
            maxFiles: "30d",
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        })
    ]
});

// ============================================================
// ⚡ CACHE SYSTEM
// ============================================================

const aiCache = new NodeCache({
    stdTTL: 300,
    checkperiod: 60,
    useClones: false
});

let fleetCache = {
    data: null,
    version: 0,
    timestamp: 0,
    ttl: 60000
};

let fleetFetchInFlight = null;

// ============================================================
// 🤖 AI CONFIGURATION
// ============================================================

// قائمة مفاتيح Gemini
const GEMINI_API_KEYS = process.env.GEMINI_API_KEYS 
    ? process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(k => k)
    : process.env.GEMINI_API_KEY 
        ? [process.env.GEMINI_API_KEY]
        : [];

// قائمة مفاتيح OpenAI
const OPENAI_API_KEYS = process.env.OPENAI_API_KEYS
    ? process.env.OPENAI_API_KEYS.split(',').map(k => k.trim()).filter(k => k)
    : process.env.OPENAI_API_KEY
        ? [process.env.OPENAI_API_KEY]
        : [];

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// ============================================================
// 🧠 SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `أنت "نظامي"، المساعد الذكي المتطور لمنظومة الوسائل البحرية v6.0.

🎯 مهمتك:
- الإجابة على أي سؤال في أي مجال معرفي بدقة واحترافية
- تقديم معلومات شاملة ومفيدة عن الأسطول البحري
- تحليل البيانات وتقديم توصيات استراتيجية
- مساعدة المستخدمين في إدارة المراكب والصيانة

📋 أسلوب الإجابة:
1. فهم السؤال بدقة
2. تقديم إجابة شاملة ومفيدة
3. استخدام نقاط مرقمة للتوضيح
4. تقديم أمثلة عملية
5. اقتراح أسئلة متابعة

🔒 الأمان:
- لا تشارك معلومات حساسة
- لا تنفذ أوامر خارج نطاق صلاحياتك
- احترام خصوصية المستخدمين

📊 بيانات الأسطول متاحة عند الطلب:
- إجمالي المراكب ودرجة الجاهزية
- تقارير الصيانة والتكاليف
- تحليلات الأداء والتوقعات

🌐 أنا هنا لمساعدتك في أي سؤال أو استفسار!`;

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

        // محاولة استخدام Gemini
        if (GEMINI_API_KEYS.length > 0) {
            try {
                const result = await callGemini(cleanMessage, history, fullContext, controller.signal);
                if (result) {
                    clearTimeout(timeout);
                    return result;
                }
            } catch (error) {
                logger.warn("Gemini API failed:", error.message);
            }
        }

        // محاولة استخدام OpenAI
        if (OPENAI_API_KEYS.length > 0) {
            try {
                const result = await callOpenAI(cleanMessage, history, fullContext, controller.signal);
                if (result) {
                    clearTimeout(timeout);
                    return result;
                }
            } catch (error) {
                logger.warn("OpenAI API failed:", error.message);
            }
        }

        clearTimeout(timeout);
        return await generateFallbackResponse(cleanMessage, userRole);

    } catch (error) {
        clearTimeout(timeout);
        logger.error("AI Engine error:", error);
        return "⚠️ عذراً، حدث خطأ في معالجة طلبك. يرجى المحاولة مرة أخرى.";
    }
}

// ============================================================
// Gemini API Call
// ============================================================

async function callGemini(message, history, context, signal) {
    const apiKey = GEMINI_API_KEYS[0];
    if (!apiKey) throw new Error("No Gemini API key");

    let fullPrompt = context || "";
    if (history.length > 0) {
        fullPrompt += `\n\n📝 تاريخ المحادثة:\n`;
        history.slice(-5).forEach(h => {
            fullPrompt += `${h.role === 'user' ? '👤 المستخدم' : '🤖 نظامي'}: ${h.content}\n`;
        });
    }
    fullPrompt += `\n\n❓ السؤال: ${message}`;

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal,
            body: JSON.stringify({
                contents: [{
                    role: "user",
                    parts: [{ text: fullPrompt }]
                }],
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1000,
                    topP: 0.95,
                    topK: 40
                }
            })
        }
    );

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Gemini error: ${response.status} - ${error.error?.message || ''}`);
    }

    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

// ============================================================
// OpenAI API Call
// ============================================================

async function callOpenAI(message, history, context, signal) {
    const apiKey = OPENAI_API_KEYS[0];
    if (!apiKey) throw new Error("No OpenAI API key");

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
            "Authorization": `Bearer ${apiKey}`
        },
        signal,
        body: JSON.stringify({
            model: OPENAI_MODEL,
            messages,
            temperature: 0.7,
            max_tokens: 1000
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`OpenAI error: ${response.status} - ${error.error?.message || ''}`);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || null;
}

// ============================================================
// 🧠 FALLBACK RESPONSES
// ============================================================

async function generateFallbackResponse(message, userRole = "مشاهد") {
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
    if (msg.match(/كم مركب|عدد المراكب|إحصائيات|الجاهزية|الأسطول/i)) {
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
        const completed = maintenance.filter(r => r.status === "مكتملة").length;
        const inProgress = maintenance.filter(r => r.status === "قيد الإنجاز").length;
        return `🔧 إحصائيات الصيانة:\n` +
               `• 📊 إجمالي السجلات: ${maintenance.length}\n` +
               `• ✅ مكتملة: ${completed}\n` +
               `• 🔄 قيد الإنجاز: ${inProgress}\n` +
               `• 💰 التكلفة الإجمالية: ${totalCost.toLocaleString()} د.ت`;
    }

    // المساعدة
    if (msg.match(/مساعدة|help|كيف|ماذا يمكنك/i)) {
        return `❓ كيف يمكنني مساعدتك؟\n\n` +
               `📚 يمكنني الإجابة عن:\n` +
               `• 🌊 الأسئلة البحرية والمعلوماتية\n` +
               `• 📊 إحصائيات الأسطول\n` +
               `• 🔧 معلومات الصيانة\n` +
               `• 💡 النصائح والإرشادات\n\n` +
               `💬 اكتب سؤالك وسأجيبك بأفضل ما لدي!`;
    }

    // المطور
    if (msg.match(/من صنع|المطور|المبرمج|developer/i)) {
        return `🌟 تم تطوير منظومة الوسائل البحرية بواسطة فريق متخصص.\n\n` +
               `🏆 هذا النظام هو نتاج خبرة وكفاءة عالية في مجال البرمجة وتطوير الأنظمة الإدارية والبحرية.\n` +
               `📌 يتميز النظام بالدقة والاحترافية والجودة العالية.\n\n` +
               `💡 الإصدار v6.0 يدعم الإجابة على أي سؤال في أي مجال معرفي.`;
    }

    // أي سؤال آخر
    return `🤔 سؤال جيد! \n\n` +
           `للحصول على إجابة دقيقة، أحتاج إلى:\n` +
           `1️⃣ اتصال بالإنترنت\n` +
           `2️⃣ مفاتيح API مفعلة (Gemini أو OpenAI)\n\n` +
           `📌 الأسئلة التي يمكنني الإجابة عليها حالياً:\n` +
           `• إحصائيات الأسطول\n` +
           `• معلومات الصيانة\n` +
           `• الأسئلة العامة الأساسية\n\n` +
           `💡 اسألني عن "مساعدة" لعرض الخيارات المتاحة.`;
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
        logger.warn("Validation failed", {
            errors: errors.array(),
            userId: req.user?.id
        });
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
            Vessel.find()
                .select("name num stat cat fDate zone supp region")
                .limit(200)
                .lean(),
            Maintenance.find()
                .select("vesselName type status cost date technician parts")
                .sort({ createdAt: -1 })
                .limit(100)
                .lean()
        ]);

        const total = vessels.length;
        const ready = vessels.filter(v => v.stat === "صالح").length;
        const broken = vessels.filter(v => v.stat === "معطب").length;
        const maintenanceCount = vessels.filter(v => v.stat === "صيانة").length;

        const now = Date.now();
        const version = now;

        const data = {
            version,
            summary: {
                total,
                ready,
                broken,
                maintenance: maintenanceCount,
                readiness: total > 0 ? Math.round((ready / total) * 100) : 0
            },
            vessels: vessels.slice(0, 50),
            maintenance: maintenance.slice(0, 30),
            timestamp: now
        };

        fleetCache = { data, version, timestamp: now, ttl: fleetCache.ttl };
        logger.info("Fleet data refreshed", { version, vessels: total });
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

        if (!forceRefresh && isFresh) {
            return fleetCache.data;
        }

        if (!fleetFetchInFlight) {
            fleetFetchInFlight = fetchFleetDataFromDb().finally(() => {
                fleetFetchInFlight = null;
            });
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

const MAX_MESSAGES_PER_CONVERSATION = 100;
const MESSAGE_RETENTION_DAYS = 30;

async function saveMessagesWithLimit(conversationId, userId, userMessage, assistantMessage) {
    try {
        await Message.insertMany([
            {
                conversationId,
                userId,
                role: "user",
                content: userMessage,
                timestamp: new Date()
            },
            {
                conversationId,
                userId,
                role: "assistant",
                content: assistantMessage,
                timestamp: new Date()
            }
        ]);

        // تنظيف المحادثات القديمة
        await cleanupConversations(conversationId);
    } catch (error) {
        logger.error("Failed to save messages:", error);
    }
}

async function cleanupConversations(conversationId) {
    try {
        const count = await Message.countDocuments({ conversationId });
        
        if (count > MAX_MESSAGES_PER_CONVERSATION) {
            const toDelete = count - MAX_MESSAGES_PER_CONVERSATION;
            const oldestMessages = await Message.find({ conversationId })
                .sort({ timestamp: 1 })
                .limit(toDelete)
                .select('_id');
            
            const idsToDelete = oldestMessages.map(m => m._id);
            await Message.deleteMany({ _id: { $in: idsToDelete } });
        }

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - MESSAGE_RETENTION_DAYS);
        await Message.deleteMany({
            conversationId,
            timestamp: { $lt: cutoffDate }
        });
    } catch (error) {
        logger.error("Failed to cleanup conversations:", error);
    }
}

// ============================================================
// 🚀 API ROUTES
// ============================================================

const validateMessage = [
    body("message")
        .trim()
        .isLength({ min: 1, max: 2000 })
        .withMessage("الرسالة يجب أن تكون بين 1 و 2000 حرف"),
    body("conversationId")
        .optional()
        .custom(value => isValidObjectId(value))
        .withMessage("معرّف المحادثة غير صالح")
];

// ============================================================
// POST /ask - Ask AI Assistant
// ============================================================

router.post("/ask", authenticate, validateMessage, validateRequest, asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const requestId = uuidv4();

    try {
        const { message, conversationId } = req.body;
        const userId = req.user.id;
        const role = req.user.role;

        logger.info("AI request received", {
            requestId,
            userId,
            conversationId,
            messageLength: message.length
        });

        const cleanMessage = sanitizeInput(message);
        if (!cleanMessage || cleanMessage.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: "❌ الرسالة فارغة أو غير صالحة",
                code: "INVALID_MESSAGE"
            });
        }

        // التحقق من الكاش
        const fleet = await getFleetData();
        const cacheKey = buildCacheKey(userId, cleanMessage, fleet?.version || 0);
        const cached = aiCache.get(cacheKey);

        if (cached) {
            logger.info("Cache hit", { requestId });
            return res.json({
                success: true,
                response: cached,
                cached: true,
                requestId,
                responseTime: Date.now() - startTime,
                version: "6.0.0"
            });
        }

        // جلب المحادثة السابقة
        let conversation = null;
        let history = [];

        if (conversationId) {
            conversation = await Conversation.findOne({ _id: conversationId, userId });
            if (conversation) {
                history = await Message.find({ conversationId: conversation._id })
                    .sort({ timestamp: -1 })
                    .limit(5)
                    .lean();
                history = history.reverse();
            }
        }

        // بناء السياق حسب صلاحيات المستخدم
        let context = "";
        const perms = getPermissions(role);
        if (perms.viewAll && fleet) {
            context = `📊 بيانات الأسطول الحالية:\n` +
                     `• المجموع: ${fleet.summary.total}\n` +
                     `• صالح: ${fleet.summary.ready}\n` +
                     `• معطب: ${fleet.summary.broken}\n` +
                     `• صيانة: ${fleet.summary.maintenance}\n` +
                     `• الجاهزية: ${fleet.summary.readiness}%\n`;
        }

        // توليد الرد
        const answer = await askAI(cleanMessage, history, context, role);

        // تخزين في الكاش
        aiCache.set(cacheKey, answer, 300);

        // حفظ المحادثة
        if (!conversation) {
            conversation = new Conversation({
                userId,
                title: cleanMessage.substring(0, 50) + (cleanMessage.length > 50 ? "..." : "")
            });
            await conversation.save();
        } else {
            conversation.updatedAt = new Date();
            await conversation.save();
        }

        // حفظ الرسائل
        await saveMessagesWithLimit(conversation._id, userId, cleanMessage, answer);

        const responseTime = Date.now() - startTime;
        logger.info("AI response sent", {
            requestId,
            userId,
            conversationId: conversation._id,
            responseTime,
            responseLength: answer.length
        });

        res.json({
            success: true,
            response: answer,
            conversationId: conversation._id,
            requestId,
            responseTime,
            version: "6.0.0",
            cached: false
        });

    } catch (error) {
        logger.error("AI ask error:", {
            requestId,
            userId: req.user?.id,
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            error: "❌ حدث خطأ في معالجة طلبك. يرجى المحاولة مرة أخرى.",
            code: "INTERNAL_ERROR",
            requestId
        });
    }
}));

// ============================================================
// GET /health - Health Check
// ============================================================

router.get("/health", asyncHandler(async (req, res) => {
    try {
        const fleet = await getFleetData();
        res.json({
            success: true,
            status: "healthy",
            version: "6.0.0",
            timestamp: new Date().toISOString(),
            uptimeSeconds: Math.round(process.uptime()),
            cache: {
                fleet: !!fleet,
                ai: aiCache.keys().length
            },
            ai: {
                gemini: {
                    enabled: GEMINI_API_KEYS.length > 0,
                    keyCount: GEMINI_API_KEYS.length,
                    model: GEMINI_MODEL
                },
                openai: {
                    enabled: OPENAI_API_KEYS.length > 0,
                    keyCount: OPENAI_API_KEYS.length,
                    model: OPENAI_MODEL
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            status: "unhealthy",
            error: error.message
        });
    }
}));

module.exports = router;
