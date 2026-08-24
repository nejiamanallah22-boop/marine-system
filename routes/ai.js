// routes/ai.js
// ============================================================
// 🚀 AI COMMANDER - MARINE SYSTEM v27.0 (OPENAI FIRST)
// ============================================================

const express = require("express");
const router = express.Router();
const NodeCache = require("node-cache");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");
const winston = require("winston");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

// ============================================================
// 📁 LOGS DIRECTORY
// ============================================================

const logsDir = path.join(__dirname, "..", "logs");
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
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
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        new winston.transports.File({
            filename: path.join(logsDir, "ai-error.log"),
            level: "error",
            maxsize: 10485760,
            maxFiles: 5
        }),
        new winston.transports.File({
            filename: path.join(logsDir, "ai.log"),
            maxsize: 10485760,
            maxFiles: 5
        })
    ]
});

// ============================================================
// 📦 MODELS
// ============================================================

const User = require("../models/User");
const Vessel = require("../models/Vessel");
const Maintenance = require("../models/Maintenance");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const AIUsage = require("../models/AIUsage");
const SecurityEvent = require("../models/SecurityEvent");

// ============================================================
// 🔐 ENCRYPTION
// ============================================================

let ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
    console.warn('⚠️ WARNING: ENCRYPTION_KEY not set, using generated key');
    ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
}

if (!/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY)) {
    console.error('❌ FATAL: ENCRYPTION_KEY must be 64 hex characters');
    process.exit(1);
}

const IV_LENGTH = 12;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

function encryptMessage(text) {
    if (!text) return null;
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        let encrypted = cipher.update(text, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const authTag = cipher.getAuthTag();
        return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
    } catch (error) {
        logger.error('Encryption failed:', error);
        return null;
    }
}

function decryptMessage(text) {
    if (!text) return null;
    try {
        const parts = text.split(':');
        if (parts.length !== 3) return text;
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encryptedText = Buffer.from(parts[2], 'hex');
        const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString('utf8');
    } catch (error) {
        logger.error('Decryption error:', error);
        return text;
    }
}

// ============================================================
// 🔐 JWT SECRET
// ============================================================

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.warn('⚠️ WARNING: JWT_SECRET not set, using generated secret');
    JWT_SECRET = crypto.randomBytes(32).toString('hex');
}

// ============================================================
// 🔑 AI PROVIDERS CONFIG - OPENAI FIRST
// ============================================================

const AI_PROVIDERS_CONFIG = {
    openai: {
        enabled: !!process.env.OPENAI_API_KEY,
        keys: [process.env.OPENAI_API_KEY].filter(Boolean),
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        priority: 1,
        useFor: ['simple', 'chat', 'marine', 'general', 'coding', 'analysis']
    },
    gemini_flash: {
        enabled: !!process.env.GEMINI_API_KEY,
        keys: [process.env.GEMINI_API_KEY].filter(Boolean),
        model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
        priority: 2,
        useFor: ['simple', 'chat', 'marine']
    },
    gemini_pro: {
        enabled: !!process.env.GEMINI_PRO_API_KEY,
        keys: [process.env.GEMINI_PRO_API_KEY].filter(Boolean),
        model: "gemini-2.0-pro",
        priority: 3,
        useFor: ['complex', 'analysis', 'coding']
    },
    deepseek: {
        enabled: false,
        keys: [],
        model: "deepseek-chat",
        priority: 99,
        useFor: []
    }
};

console.log('📊 AI Providers Status:');
Object.entries(AI_PROVIDERS_CONFIG).forEach(([name, config]) => {
    console.log(`   ${name}: ${config.enabled && config.keys.length > 0 ? '✅ Enabled' : '❌ Disabled'} (${config.keys.length} keys)`);
});

// ============================================================
// ⚙️ CONFIGURATION
// ============================================================

const MAX_TOKENS = parseInt(process.env.MAX_TOKENS) || 2000;
const TEMPERATURE = parseFloat(process.env.TEMPERATURE) || 0.7;
const MAX_HISTORY_MESSAGES = parseInt(process.env.MAX_HISTORY_MESSAGES) || 15;
const CACHE_TTL = parseInt(process.env.CACHE_TTL) || 3600;
const ENABLE_CACHE = process.env.ENABLE_CACHE !== 'false';

// ============================================================
// 🧠 SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `أنت "نظامي" - AI Commander، مساعد ذكاء اصطناعي عام ومتخصص في الشؤون البحرية.

🌍 **أنت مساعد ذكاء اصطناعي عام تجيب عن جميع المجالات:**
- 🔬 العلوم: فيزياء، كيمياء، رياضيات، فلك، بيولوجيا
- 🏛️ التاريخ: حضارات، حروب، شخصيات، أحداث
- 🌎 الجغرافيا: بلدان، مدن، عواصم، معالم، مناخ
- 🏥 الصحة: تغذية، أمراض، علاج، نصائح طبية
- 💻 التكنولوجيا: برمجة، ذكاء اصطناعي، شبكات، أمن
- 💰 الاقتصاد: استثمار، بورصة، أعمال، تجارة
- 🌊 الشؤون البحرية: ملاحة، مراكب، صيانة، أسطول

📋 **أسلوب الإجابة:**
1. فهم السؤال بعمق
2. تقديم إجابة شاملة ومنظمة
3. استخدام نقاط مرقمة للتوضيح

🔒 **الأمان:**
- لا تشارك معلومات حساسة
- لا تعرض بيانات المستخدمين الآخرين

🌟 **أنت AI Commander - هنا لمساعدة المستخدم في أي شيء!**`;

// ============================================================
// 🌐 CALL AI PROVIDER
// ============================================================

async function callAIProvider(message, history = [], user = null) {
    // ✅ 1. حاول استخدام OpenAI أولاً
    const openai = AI_PROVIDERS_CONFIG.openai;
    if (openai.enabled && openai.keys.length > 0) {
        try {
            const messages = [
                { role: "system", content: SYSTEM_PROMPT },
                ...history.map(h => ({
                    role: h.role || 'user',
                    content: h.content || h.parts?.[0]?.text || ''
                })),
                { role: "user", content: message }
            ];

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openai.keys[0]}`
                },
                body: JSON.stringify({
                    model: openai.model,
                    messages: messages,
                    temperature: TEMPERATURE,
                    max_tokens: MAX_TOKENS
                })
            });

            if (!response.ok) {
                const error = await response.json();
                if (error.error?.message?.includes('insufficient_quota') || 
                    error.error?.message?.includes('Insufficient Balance')) {
                    throw new Error('⚠️ رصيد OpenAI غير كافٍ. يرجى شحن الرصيد.');
                }
                if (error.error?.message?.includes('API key') || 
                    error.error?.message?.includes('invalid_api_key')) {
                    throw new Error('⚠️ مفتاح OpenAI غير صالح. يرجى التحقق من المفتاح.');
                }
                throw new Error(`OpenAI error: ${error.error?.message || response.status}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            logger.error('OpenAI error:', error.message);
            // استمر إلى المزود التالي
        }
    }

    // ✅ 2. حاول استخدام Gemini Flash
    const geminiFlash = AI_PROVIDERS_CONFIG.gemini_flash;
    if (geminiFlash.enabled && geminiFlash.keys.length > 0) {
        try {
            const genAI = new GoogleGenerativeAI(geminiFlash.keys[0]);
            const model = genAI.getGenerativeModel({ 
                model: geminiFlash.model,
                generationConfig: {
                    temperature: TEMPERATURE,
                    maxOutputTokens: MAX_TOKENS
                }
            });
            
            // تحويل التاريخ إلى نص
            let fullMessage = message;
            if (history && history.length > 0) {
                const historyText = history.map(h => 
                    `${h.role || 'user'}: ${h.content || h.parts?.[0]?.text || ''}`
                ).join('\n');
                fullMessage = historyText + '\n' + message;
            }

            const result = await model.generateContent(fullMessage);
            return result.response.text();
        } catch (error) {
            logger.error('Gemini Flash error:', error.message);
        }
    }

    // ✅ 3. حاول استخدام Gemini Pro
    const geminiPro = AI_PROVIDERS_CONFIG.gemini_pro;
    if (geminiPro.enabled && geminiPro.keys.length > 0) {
        try {
            const genAI = new GoogleGenerativeAI(geminiPro.keys[0]);
            const model = genAI.getGenerativeModel({ 
                model: geminiPro.model,
                generationConfig: {
                    temperature: TEMPERATURE,
                    maxOutputTokens: MAX_TOKENS
                }
            });
            
            let fullMessage = message;
            if (history && history.length > 0) {
                const historyText = history.map(h => 
                    `${h.role || 'user'}: ${h.content || h.parts?.[0]?.text || ''}`
                ).join('\n');
                fullMessage = historyText + '\n' + message;
            }

            const result = await model.generateContent(fullMessage);
            return result.response.text();
        } catch (error) {
            logger.error('Gemini Pro error:', error.message);
        }
    }

    // ✅ 4. إذا كل شيء فشل
    return "⚠️ عذراً، لا يتوفر مزود ذكاء اصطناعي حالياً. يرجى التحقق من إعدادات المفاتيح في متغيرات البيئة.\n\nالمفاتيح المطلوبة:\n- OPENAI_API_KEY (مفتاح ChatGPT)\n- GEMINI_API_KEY (مفتاح Gemini)";
}

// ============================================================
// 🔐 AUTH MIDDLEWARE
// ============================================================

async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: "❌ الرجاء تسجيل الدخول",
            code: "UNAUTHORIZED"
        });
    }
    
    const token = authHeader.substring(7);
    if (!token || token.length < 10) {
        return res.status(401).json({
            success: false,
            error: "❌ توكن غير صالح",
            code: "INVALID_TOKEN"
        });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).lean();
        if (!user) {
            return res.status(401).json({
                success: false,
                error: "❌ المستخدم غير موجود",
                code: "USER_NOT_FOUND"
            });
        }
        req.user = {
            id: decoded.id,
            username: user.username,
            role: user.role || 'مشاهد'
        };
        next();
    } catch (error) {
        let errorMessage = "❌ توكن غير صالح";
        if (error.name === 'TokenExpiredError') {
            errorMessage = "❌ انتهت صلاحية التوكن، يرجى تسجيل الدخول مرة أخرى";
        }
        return res.status(401).json({
            success: false,
            error: errorMessage,
            code: "INVALID_TOKEN"
        });
    }
}

// ============================================================
// ⚡ CACHE
// ============================================================

const cache = new NodeCache({
    stdTTL: CACHE_TTL,
    checkperiod: 600,
    maxKeys: 500
});

// ============================================================
// 🚦 RATE LIMITING
// ============================================================

const askLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: {
        success: false,
        error: "⚠️ تم تجاوز حد الطلبات. يرجى الانتظار دقيقة."
    },
    keyGenerator: (req) => req.user?.id || req.ip
});

// ============================================================
// 📝 VALIDATION
// ============================================================

const validateAskRequest = [
    body('message').trim().isLength({ min: 1, max: 5000 })
        .withMessage('الرسالة يجب أن تكون بين 1 و 5000 حرف'),
    body('conversationId').optional()
        .custom(value => mongoose.Types.ObjectId.isValid(value))
        .withMessage('معرّف المحادثة غير صالح')
];

// ============================================================
// 💾 CONVERSATION FUNCTIONS
// ============================================================

async function getConversationHistory(conversationId, userId) {
    if (!conversationId) return [];
    try {
        const messages = await Message.find({
            conversationId: conversationId,
            userId: userId
        })
        .sort({ timestamp: -1 })
        .limit(MAX_HISTORY_MESSAGES)
        .lean();
        
        return messages.reverse().map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: decryptMessage(msg.content) || msg.content
        }));
    } catch (error) {
        logger.error('Failed to get conversation history:', error);
        return [];
    }
}

async function saveConversation(conversationId, userId, userMessage, assistantMessage) {
    try {
        let conversation;
        if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
            conversation = await Conversation.findOneAndUpdate(
                { _id: conversationId, userId: userId },
                { $set: { updatedAt: new Date() }, $inc: { messageCount: 1 } },
                { new: true }
            );
        }
        
        if (!conversation) {
            const title = userMessage.substring(0, 50) + (userMessage.length > 50 ? '...' : '');
            conversation = new Conversation({ 
                userId: userId, 
                title: title, 
                messageCount: 1 
            });
            await conversation.save();
            conversationId = conversation._id;
        }
        
        const encryptedUserMsg = encryptMessage(userMessage);
        const encryptedAssistantMsg = encryptMessage(assistantMessage);
        
        await Message.insertMany([
            {
                conversationId: conversation._id,
                userId: userId,
                role: 'user',
                content: encryptedUserMsg || userMessage,
                timestamp: new Date()
            },
            {
                conversationId: conversation._id,
                userId: userId,
                role: 'assistant',
                content: encryptedAssistantMsg || assistantMessage,
                timestamp: new Date()
            }
        ]);
        return conversation._id;
    } catch (error) {
        logger.error('Failed to save conversation:', error);
        return conversationId;
    }
}

// ============================================================
// 🧹 INPUT SANITIZATION
// ============================================================

function sanitizeInput(input) {
    if (!input) return '';
    return input.replace(/<[^>]*>/g, '').substring(0, 5000);
}

// ============================================================
// 🚀 ASK AI - MAIN ENDPOINT
// ============================================================

router.post("/ask", 
    authenticate,
    askLimiter,
    validateAskRequest,
    async (req, res) => {
    const startTime = Date.now();
    const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    const userId = req.user.id;

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: errors.array()[0].msg,
                code: "VALIDATION_ERROR"
            });
        }

        const rawMessage = req.body.message;
        const conversationId = req.body.conversationId;
        const message = sanitizeInput(rawMessage);
        
        if (!message) {
            return res.status(400).json({
                success: false,
                error: "❌ الرسالة فارغة أو غير صالحة",
                code: "INVALID_MESSAGE"
            });
        }

        logger.info(`📤 [${requestId}] سؤال من ${userId}: ${message.substring(0, 100)}...`);

        // ✅ التحقق من الكاش
        let cachedResponse = null;
        if (ENABLE_CACHE) {
            const cacheKey = `ai_${userId}_${message.substring(0, 50)}`;
            cachedResponse = cache.get(cacheKey);
            if (cachedResponse) {
                logger.info(`✅ [${requestId}] تم الرد من الكاش`);
                return res.json({
                    success: true,
                    response: cachedResponse,
                    cached: true,
                    requestId,
                    responseTime: Date.now() - startTime
                });
            }
        }

        // ✅ جلب تاريخ المحادثة
        let history = [];
        if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
            history = await getConversationHistory(conversationId, userId);
        }

        // ✅ استدعاء الذكاء الاصطناعي
        const response = await callAIProvider(message, history, req.user);
        
        if (!response || response.includes('لا يتوفر مزود')) {
            return res.status(500).json({
                success: false,
                error: response || "⚠️ لم يتم الحصول على رد من الذكاء الاصطناعي",
                code: "NO_RESPONSE",
                requestId
            });
        }

        // ✅ حفظ المحادثة
        const newConversationId = await saveConversation(
            conversationId,
            userId,
            message,
            response
        );

        // ✅ حفظ في الكاش
        if (ENABLE_CACHE) {
            const cacheKey = `ai_${userId}_${message.substring(0, 50)}`;
            cache.set(cacheKey, response);
        }

        const responseTime = Date.now() - startTime;
        logger.info(`✅ [${requestId}] تم الرد في ${responseTime}ms`);

        res.json({
            success: true,
            response: response,
            conversationId: newConversationId || conversationId,
            requestId,
            responseTime,
            cached: false,
            version: "27.0.0"
        });

    } catch (error) {
        logger.error(`❌ [${requestId}] خطأ:`, error);
        res.status(500).json({
            success: false,
            error: "⚠️ حدث خطأ في معالجة طلبك. يرجى المحاولة مرة أخرى.",
            code: "INTERNAL_ERROR",
            requestId
        });
    }
});

// ============================================================
// 🏥 HEALTH CHECK
// ============================================================

router.get("/health", (req, res) => {
    const providerStatus = Object.entries(AI_PROVIDERS_CONFIG).map(([name, config]) => ({
        name,
        enabled: config.enabled && config.keys.length > 0,
        keys: config.keys.length,
        model: config.model
    }));

    res.json({
        success: true,
        status: "healthy",
        version: "27.0.0",
        timestamp: new Date().toISOString(),
        providers: providerStatus
    });
});

// ============================================================
// 🔍 CHECK OPENAI
// ============================================================

router.get("/check-openai", authenticate, async (req, res) => {
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return res.json({ 
                success: false, 
                error: "OPENAI_API_KEY غير موجود في البيئة"
            });
        }
        
        const response = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            res.json({
                success: true,
                models: data.data?.map(m => m.id) || [],
                status: response.status,
                message: "✅ مفتاح OpenAI صالح"
            });
        } else {
            res.json({
                success: false,
                error: data.error?.message || "المفتاح غير صالح",
                status: response.status
            });
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

module.exports = router;
