// server/routes/ai.js
// ============================================================
// 🚀 AI COMMANDER - MARINE SYSTEM v23.0
// ============================================================
// Enterprise Platinum - Military Grade Security
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

// ============================================================
// 📁 ENSURE LOGS DIRECTORY EXISTS
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
        }),
        new winston.transports.File({
            filename: path.join(logsDir, "ai-security.log"),
            level: "info",
            maxsize: 10485760,
            maxFiles: 10
        })
    ]
});

// ============================================================
// 📦 MODELS
// ============================================================

const Vessel = require("../models/Vessel");
const Maintenance = require("../models/Maintenance");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const KnowledgeBase = require("../models/KnowledgeBase");
const AIAudit = require("../models/AIAudit");
const User = require("../models/User");
const UserQuota = require("../models/UserQuota");
const AIUsage = require("../models/AIUsage");
const AIReport = require("../models/AIReport");
const AIMemory = require("../models/AIMemory");
const AIAlert = require("../models/AIAlert");
const UserMemory = require("../models/UserMemory");
const Document = require("../models/Document");
const PredictiveMaintenance = require("../models/PredictiveMaintenance");
const AIProviderState = require("../models/AIProviderState");
const SecurityEvent = require("../models/SecurityEvent");

// ============================================================
// 🔐 ENCRYPTION - NO FALLBACK
// ============================================================

if (!process.env.ENCRYPTION_KEY) {
    console.error('❌ FATAL: ENCRYPTION_KEY is not set in environment variables');
    console.error('📌 Generate with: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY)) {
    console.error('❌ FATAL: ENCRYPTION_KEY must be 64 hexadecimal characters (32 bytes)');
    console.error('📌 Generate with: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"');
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
        logger.error('❌ Encryption failed:', error);
        throw new Error("Encryption failure - cannot store sensitive data");
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
// 🔐 SECURITY
// ============================================================

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET is not set');
    process.exit(1);
}

// ============================================================
// 🔑 MULTI AI PROVIDER - مع تخزين في قاعدة البيانات
// ============================================================

const AI_PROVIDERS_CONFIG = {
    gemini_flash: {
        enabled: true,
        keys: (() => {
            const keys = [];
            for (let i = 1; i <= 5; i++) {
                const key = process.env[`GEMINI_KEY_${i}`];
                if (key) keys.push(key);
            }
            if (keys.length === 0 && process.env.GEMINI_API_KEY) {
                keys.push(process.env.GEMINI_API_KEY);
            }
            return keys;
        })(),
        model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
        priority: 1,
        useFor: ['simple', 'chat', 'marine']
    },
    gemini_pro: {
        enabled: !!process.env.GEMINI_PRO_API_KEY,
        keys: [process.env.GEMINI_PRO_API_KEY].filter(Boolean),
        model: "gemini-2.0-pro",
        priority: 2,
        useFor: ['complex', 'analysis', 'coding']
    },
    openai: {
        enabled: !!process.env.OPENAI_API_KEY,
        keys: [process.env.OPENAI_API_KEY].filter(Boolean),
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        priority: 3,
        useFor: ['general', 'writing', 'analysis']
    },
    deepseek: {
        enabled: !!process.env.DEEPSEEK_API_KEY,
        keys: [process.env.DEEPSEEK_API_KEY].filter(Boolean),
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
        priority: 4,
        useFor: ['coding', 'analysis']
    }
};

// ============================================================
// 🔄 AI PROVIDER STATE - مع تخزين في MongoDB
// ============================================================

let providerStateCache = {};

async function loadProviderState() {
    try {
        const states = await AIProviderState.find({}).lean();
        states.forEach(state => {
            providerStateCache[state.provider] = {
                currentIndex: state.currentIndex || 0,
                failureCount: state.failureCount || {},
                lastUpdated: state.updatedAt
            };
        });
        logger.info(`✅ Loaded ${states.length} provider states from database`);
    } catch (error) {
        logger.warn('Failed to load provider states, using defaults:', error);
    }
}

async function saveProviderState(provider, state) {
    try {
        await AIProviderState.findOneAndUpdate(
            { provider },
            {
                provider,
                currentIndex: state.currentIndex,
                failureCount: state.failureCount,
                updatedAt: new Date()
            },
            { upsert: true }
        );
        providerStateCache[provider] = state;
    } catch (error) {
        logger.error('Failed to save provider state:', error);
    }
}

function getProviderState(provider) {
    if (!providerStateCache[provider]) {
        providerStateCache[provider] = {
            currentIndex: 0,
            failureCount: {}
        };
    }
    return providerStateCache[provider];
}

function getProviderForTask(taskType = 'general') {
    let candidates = [];
    if (taskType === 'simple' || taskType === 'chat') {
        candidates = ['gemini_flash', 'openai'];
    } else if (taskType === 'complex' || taskType === 'analysis') {
        candidates = ['gemini_pro', 'deepseek'];
    } else if (taskType === 'coding') {
        candidates = ['deepseek', 'gemini_pro'];
    } else if (taskType === 'marine') {
        candidates = ['gemini_flash', 'deepseek'];
    } else {
        candidates = ['gemini_flash', 'openai', 'deepseek'];
    }
    
    for (const name of candidates) {
        const config = AI_PROVIDERS_CONFIG[name];
        if (config && config.enabled && config.keys.length > 0) {
            const state = getProviderState(name);
            const failures = state.failureCount[state.currentIndex] || 0;
            if (failures < 3) {
                const key = config.keys[state.currentIndex];
                if (key) {
                    return { name, config, key, state };
                }
            }
            // Try next key
            state.currentIndex = (state.currentIndex + 1) % config.keys.length;
            saveProviderState(name, state);
        }
    }
    
    for (const [name, config] of Object.entries(AI_PROVIDERS_CONFIG)) {
        if (config.enabled && config.keys.length > 0) {
            const key = config.keys[0];
            if (key) {
                const state = getProviderState(name);
                return { name, config, key, state };
            }
        }
    }
    return null;
}

function markProviderFailure(name, key) {
    const config = AI_PROVIDERS_CONFIG[name];
    if (config) {
        const state = getProviderState(name);
        const index = config.keys.indexOf(key);
        if (index !== -1) {
            state.failureCount[index] = (state.failureCount[index] || 0) + 1;
            if (state.failureCount[index] >= 3) {
                logger.warn(`⚠️ Provider ${name} key ${index} marked as failed`);
            }
            saveProviderState(name, state);
        }
    }
}

function resetProviderFailure(name) {
    const state = getProviderState(name);
    state.failureCount = {};
    saveProviderState(name, state);
}

// ============================================================
// ⚙️ CONFIGURATION
// ============================================================

const MAX_TOKENS = parseInt(process.env.MAX_TOKENS) || 4000;
const TEMPERATURE = parseFloat(process.env.TEMPERATURE) || 0.7;
const MAX_HISTORY_MESSAGES = parseInt(process.env.MAX_HISTORY_MESSAGES) || 15;
const CACHE_TTL = parseInt(process.env.CACHE_TTL) || 3600;
const ENABLE_CACHE = process.env.ENABLE_CACHE !== 'false';
const ENABLE_STREAMING = process.env.ENABLE_STREAMING !== 'false';
const ENABLE_WEB_SEARCH = process.env.ENABLE_WEB_SEARCH !== 'false';
const MAX_SEARCH_LENGTH = parseInt(process.env.MAX_SEARCH_LENGTH) || 1000;

// ============================================================
// 🛡️ DOMAIN WHITELIST
// ============================================================

const DOMAIN_WHITELIST = [
    'wikipedia.org',
    'britannica.com',
    'gov.tn',
    'defense.tn',
    'marine.tn',
    'imo.org',
    'un.org',
    'who.int',
    'nasa.gov',
    'esa.int'
];

function isDomainAllowed(url) {
    if (!url) return false;
    return DOMAIN_WHITELIST.some(domain => url.includes(domain));
}

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
- 🎨 الفنون: أدب، موسيقى، سينما، فنون تشكيلية
- ⚖️ القانون: تشريعات، عقود، حقوق
- 🌊 الشؤون البحرية: ملاحة، مراكب، صيانة، أسطول

🔧 **الميزات الخاصة (Marine System):**
- عرض جاهزية الأسطول
- تحليل أعطال المراكب
- تقارير الصيانة والتكاليف
- التنبؤ بالأعطال (Predictive Maintenance)
- تتبع المراكب على الخريطة

📋 **أسلوب الإجابة:**
1. فهم السؤال بعمق
2. تقديم إجابة شاملة ومنظمة
3. استخدام نقاط مرقمة للتوضيح

🔒 **الأمان:**
- لا تشارك معلومات حساسة
- لا تعرض بيانات المستخدمين الآخرين

🌟 **أنت AI Commander - هنا لمساعدة المستخدم في أي شيء!**`;

// ============================================================
// 🔧 TOOL PERMISSIONS - موحدة مع نظام الصلاحيات
// ============================================================

const TOOL_PERMISSIONS = {
    getFleetReadiness: ['مسؤول', 'محرر إقليمي', 'فني صيانة', 'قائد وحدة', 'ضابط عمليات'],
    getVesselDetails: ['مسؤول', 'محرر إقليمي', 'فني صيانة', 'قائد وحدة', 'ضابط عمليات'],
    getVesselMaintenanceHistory: ['مسؤول', 'فني صيانة', 'ضابط عمليات'],
    getMaintenanceStats: ['مسؤول', 'محرر إقليمي', 'فني صيانة', 'ضابط عمليات'],
    getVesselStats: ['مسؤول', 'محرر إقليمي', 'فني صيانة', 'قائد وحدة', 'ضابط عمليات'],
    searchWeb: ['مسؤول', 'محرر إقليمي', 'قائد وحدة'],
    searchDocuments: ['مسؤول', 'محرر إقليمي', 'فني صيانة', 'ضابط عمليات'],
    predictMaintenance: ['مسؤول', 'فني صيانة', 'ضابط عمليات']
};

function canUseTool(toolName, user) {
    if (!user?.role) return false;
    const allowedRoles = TOOL_PERMISSIONS[toolName] || [];
    return allowedRoles.includes(user.role);
}

// ============================================================
// 🔧 TOOL DEFINITIONS - مع Validation
// ============================================================

const TOOL_DEFINITIONS = [
    {
        name: "getFleetReadiness",
        description: "Get current fleet readiness status",
        parameters: { type: "object", properties: {} }
    },
    {
        name: "getVesselDetails",
        description: "Get detailed information about a specific vessel",
        parameters: {
            type: "object",
            properties: {
                vesselName: { 
                    type: "string", 
                    description: "Name of the vessel",
                    maxLength: 50
                }
            },
            required: ["vesselName"]
        }
    },
    {
        name: "getVesselMaintenanceHistory",
        description: "Get maintenance history for a specific vessel",
        parameters: {
            type: "object",
            properties: {
                vesselName: { 
                    type: "string", 
                    description: "Name of the vessel",
                    maxLength: 50
                },
                limit: { 
                    type: "number", 
                    description: "Maximum number of records",
                    minimum: 1,
                    maximum: 50
                }
            },
            required: ["vesselName"]
        }
    },
    {
        name: "getMaintenanceStats",
        description: "Get statistics about maintenance records",
        parameters: {
            type: "object",
            properties: {
                status: { 
                    type: "string", 
                    enum: ["all", "completed", "in_progress", "pending"] 
                }
            }
        }
    },
    {
        name: "getVesselStats",
        description: "Get statistics about vessels in the fleet",
        parameters: {
            type: "object",
            properties: {
                status: { 
                    type: "string", 
                    enum: ["all", "ready", "broken", "maintenance"] 
                }
            }
        }
    },
    {
        name: "searchWeb",
        description: "Search the web for current information",
        parameters: {
            type: "object",
            properties: {
                query: { 
                    type: "string", 
                    description: "Search query",
                    maxLength: 200
                }
            },
            required: ["query"]
        }
    },
    {
        name: "searchDocuments",
        description: "Search user documents",
        parameters: {
            type: "object",
            properties: {
                query: { 
                    type: "string", 
                    description: "Search query",
                    maxLength: 200
                }
            },
            required: ["query"]
        }
    },
    {
        name: "predictMaintenance",
        description: "Predict maintenance needs for a vessel",
        parameters: {
            type: "object",
            properties: {
                vesselName: { 
                    type: "string", 
                    description: "Name of the vessel",
                    maxLength: 50
                }
            },
            required: ["vesselName"]
        }
    }
];

// ============================================================
// 🔧 TOOL EXECUTORS - مع AI Decision Engine
// ============================================================

const TOOL_EXECUTORS = {
    getFleetReadiness: async (args, user) => {
        if (!canUseTool('getFleetReadiness', user)) {
            return { success: false, error: 'غير مصرح لك' };
        }
        const total = await Vessel.countDocuments();
        const ready = await Vessel.countDocuments({ stat: 'صالح' });
        const broken = await Vessel.countDocuments({ stat: 'معطب' });
        const maintenance = await Vessel.countDocuments({ stat: 'صيانة' });
        return {
            success: true,
            data: {
                summary: { total, ready, broken, maintenance, readiness: total > 0 ? Math.round((ready / total) * 100) : 0 }
            }
        };
    },
    getVesselDetails: async (args, user) => {
        if (!canUseTool('getVesselDetails', user)) {
            return { success: false, error: 'غير مصرح لك' };
        }
        // ✅ Validation
        if (!args.vesselName || args.vesselName.length > 50) {
            return { success: false, error: 'اسم المركب غير صالح' };
        }
        const vessel = await Vessel.findOne({ name: args.vesselName }).lean();
        if (!vessel) return { success: false, error: 'المركب غير موجود' };
        return { success: true, data: { vessel } };
    },
    getVesselMaintenanceHistory: async (args, user) => {
        if (!canUseTool('getVesselMaintenanceHistory', user)) {
            return { success: false, error: 'غير مصرح لك' };
        }
        const limit = Math.min(args.limit || 10, 50);
        const records = await Maintenance.find({ vesselName: args.vesselName })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        return { success: true, data: records };
    },
    getMaintenanceStats: async (args, user) => {
        if (!canUseTool('getMaintenanceStats', user)) {
            return { success: false, error: 'غير مصرح لك' };
        }
        const filter = {};
        if (args.status && args.status !== 'all') {
            const statusMap = { 'completed': 'مكتملة', 'in_progress': 'قيد الإنجاز', 'pending': 'معلقة' };
            filter.status = statusMap[args.status] || args.status;
        }
        const records = await Maintenance.find(filter).lean();
        const totalCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);
        return {
            success: true,
            data: {
                count: records.length,
                totalCost,
                averageCost: records.length > 0 ? totalCost / records.length : 0
            }
        };
    },
    getVesselStats: async (args, user) => {
        if (!canUseTool('getVesselStats', user)) {
            return { success: false, error: 'غير مصرح لك' };
        }
        const filter = {};
        if (args.status && args.status !== 'all') {
            const statusMap = { 'ready': 'صالح', 'broken': 'معطب', 'maintenance': 'صيانة' };
            filter.stat = statusMap[args.status] || args.status;
        }
        const vessels = await Vessel.find(filter).lean();
        return {
            success: true,
            data: {
                count: vessels.length,
                vessels: vessels.slice(0, 10),
                summary: {
                    total: await Vessel.countDocuments(),
                    ready: await Vessel.countDocuments({ stat: 'صالح' }),
                    broken: await Vessel.countDocuments({ stat: 'معطب' }),
                    maintenance: await Vessel.countDocuments({ stat: 'صيانة' })
                }
            }
        };
    },
    searchWeb: async (args, user) => {
        if (!canUseTool('searchWeb', user)) {
            return { success: false, error: 'غير مصرح لك' };
        }
        if (!ENABLE_WEB_SEARCH) {
            return { success: false, error: 'ميزة البحث عن الإنترنت غير مفعلة' };
        }
        if (!args.query || args.query.length > 200) {
            return { success: false, error: 'استعلام بحث غير صالح' };
        }
        try {
            const response = await fetch(
                `https://api.duckduckgo.com/?q=${encodeURIComponent(args.query)}&format=json&no_html=1&skip_disambig=1`,
                { timeout: 10000 }
            );
            if (!response.ok) throw new Error(`Search failed: ${response.status}`);
            const data = await response.json();
            let result = data.AbstractText || '';
            if (result.length > MAX_SEARCH_LENGTH) {
                result = result.substring(0, MAX_SEARCH_LENGTH) + '...';
            }
            return {
                success: true,
                result: result || 'لم يتم العثور على نتائج',
                source: data.AbstractSource || 'DuckDuckGo',
                url: data.AbstractURL || ''
            };
        } catch (error) {
            logger.error('Web search error:', error);
            return { success: false, error: 'خطأ في البحث عن المعلومات' };
        }
    },
    searchDocuments: async (args, user) => {
        if (!canUseTool('searchDocuments', user)) {
            return { success: false, error: 'غير مصرح لك' };
        }
        try {
            const documents = await Document.find({
                userId: user.id,
                $text: { $search: args.query }
            })
            .sort({ score: { $meta: "textScore" } })
            .limit(5)
            .lean();
            return {
                success: true,
                results: documents.map(doc => ({
                    title: doc.title,
                    content: doc.content.substring(0, 500),
                    type: doc.type,
                    createdAt: doc.createdAt
                }))
            };
        } catch (error) {
            logger.error('Document search error:', error);
            return { success: false, error: 'خطأ في البحث عن المستندات' };
        }
    },
    predictMaintenance: async (args, user) => {
        if (!canUseTool('predictMaintenance', user)) {
            return { success: false, error: 'غير مصرح لك' };
        }
        try {
            const vessel = await Vessel.findOne({ name: args.vesselName }).lean();
            if (!vessel) return { success: false, error: 'المركب غير موجود' };
            
            const maintenanceRecords = await Maintenance.find({ vesselName: args.vesselName })
                .sort({ createdAt: -1 })
                .limit(50)
                .lean();
            
            // ✅ AI Decision Engine - تحليل متقدم
            const faultTypes = {};
            const costs = [];
            const timeBetweenFailures = [];
            let totalOperatingHours = 0;
            let lastMaintenanceDate = null;
            
            for (let i = 0; i < maintenanceRecords.length; i++) {
                const record = maintenanceRecords[i];
                faultTypes[record.type] = (faultTypes[record.type] || 0) + 1;
                if (record.cost) costs.push(record.cost);
                if (record.date) {
                    const date = new Date(record.date);
                    if (!lastMaintenanceDate || date > lastMaintenanceDate) {
                        lastMaintenanceDate = date;
                    }
                }
                if (i > 0) {
                    const diff = new Date(record.createdAt) - new Date(maintenanceRecords[i-1].createdAt);
                    if (diff > 0) timeBetweenFailures.push(diff / (1000 * 60 * 60 * 24));
                }
            }
            
            const avgTimeBetween = timeBetweenFailures.length > 0 
                ? timeBetweenFailures.reduce((a, b) => a + b, 0) / timeBetweenFailures.length 
                : 30;
            
            const mostCommonFault = Object.entries(faultTypes)
                .sort((a, b) => b[1] - a[1])[0];
            
            const avgCost = costs.length > 0 
                ? costs.reduce((a, b) => a + b, 0) / costs.length 
                : 0;
            
            const failureCount = maintenanceRecords.length;
            
            // ✅ حساب احتمالية العطل باستخدام عوامل متعددة
            let riskScore = 0;
            riskScore += Math.min(40, (failureCount / 3) * 10);
            riskScore += Math.min(30, (avgTimeBetween < 30 ? (30 - avgTimeBetween) * 2 : 0));
            riskScore += Math.min(20, (avgCost > 1000 ? 10 : 0));
            riskScore += Math.min(10, (vessel.stat === 'معطب' ? 10 : 0));
            riskScore = Math.min(100, riskScore);
            
            const riskLevel = riskScore > 70 ? 'عالية' : riskScore > 40 ? 'متوسطة' : 'منخفضة';
            
            // ✅ توصيات ذكية
            let recommendation = '';
            if (riskScore > 70) {
                recommendation = `🚨 تنبيه عاجل: المركب ${args.vesselName} يحتاج إلى فحص عاجل.`;
                if (mostCommonFault) {
                    recommendation += `\nالعطل الأكثر تكراراً: ${mostCommonFault[0]}`;
                }
                recommendation += `\nيوصى بإدخاله الصيانة خلال 7 أيام.`;
            } else if (riskScore > 40) {
                recommendation = `⚠️ تنبيه: المركب ${args.vesselName} يحتاج إلى صيانة وقائية.`;
                if (mostCommonFault) {
                    recommendation += `\nالعطل الأكثر تكراراً: ${mostCommonFault[0]}`;
                }
                recommendation += `\nيوصى بجدولة صيانة خلال 30 يوم.`;
            } else {
                recommendation = `✅ المركب ${args.vesselName} في حالة جيدة.`;
                recommendation += `\nاستمر في الصيانة الدورية كل 6 أشهر.`;
            }
            
            const prediction = {
                vesselName: args.vesselName,
                riskScore: Math.round(riskScore),
                riskLevel: riskLevel,
                mostCommonFault: mostCommonFault ? mostCommonFault[0] : 'لا يوجد',
                faultCount: failureCount,
                averageCost: Math.round(avgCost),
                averageDaysBetweenFailures: Math.round(avgTimeBetween),
                recommendation: recommendation,
                lastMaintenanceDate: lastMaintenanceDate,
                totalRecords: maintenanceRecords.length,
                createdAt: new Date()
            };
            
            const pred = new PredictiveMaintenance(prediction);
            await pred.save();
            
            return { success: true, data: prediction };
        } catch (error) {
            logger.error('Predict maintenance error:', error);
            return { success: false, error: 'خطأ في التنبؤ بالصيانة' };
        }
    }
};

// ============================================================
// 🤖 GEMINI SDK
// ============================================================

function getGeminiModel(key, model, withTools = true) {
    const genAI = new GoogleGenerativeAI(key);
    const config = {
        model: model || "gemini-2.0-flash",
        generationConfig: {
            temperature: TEMPERATURE,
            maxOutputTokens: MAX_TOKENS,
            topP: 0.95,
            topK: 40
        },
        systemInstruction: {
            role: "system",
            parts: [{ text: SYSTEM_PROMPT }]
        }
    };
    if (withTools) {
        config.tools = [
            {
                functionDeclarations: TOOL_DEFINITIONS
            }
        ];
    }
    return genAI.getGenerativeModel(config);
}

// ============================================================
// 🌐 CALL AI WITH TOOLS
// ============================================================

async function callAIWithTools(message, history, user) {
    let taskType = 'general';
    const marineKeywords = ['مركب', 'أسطول', 'صيانة', 'جاهزية', 'معطب', 'صالح', 'بحر', 'سفينة', 'قارب', 'زورق'];
    const complexKeywords = ['تحليل', 'تقرير', 'برمجة', 'كود', 'خوارزمية', 'نظرية', 'معادلة'];
    const codingKeywords = ['كود', 'برمجة', 'دالة', 'javascript', 'python'];
    
    const lowerMsg = message.toLowerCase();
    if (marineKeywords.some(k => lowerMsg.includes(k))) taskType = 'marine';
    else if (codingKeywords.some(k => lowerMsg.includes(k))) taskType = 'coding';
    else if (complexKeywords.some(k => lowerMsg.includes(k)) || message.length > 200) taskType = 'complex';
    else taskType = 'simple';
    
    logger.info(`🔍 Task type: ${taskType}`);
    
    const provider = getProviderForTask(taskType);
    if (!provider) throw new Error('No AI providers available');
    
    try {
        let response;
        let toolCalls = [];
        
        if (provider.name.includes('gemini')) {
            const model = getGeminiModel(provider.key, provider.config.model, true);
            const chat = model.startChat({ history: history || [] });
            const result = await chat.sendMessage(message);
            const responseData = result.response;
            
            const functionCalls = responseData.functionCalls?.();
            if (functionCalls && functionCalls.length > 0) {
                for (const call of functionCalls) {
                    const executor = TOOL_EXECUTORS[call.name];
                    if (executor) {
                        try {
                            const result = await executor(call.args, user);
                            toolCalls.push({ name: call.name, result: result });
                        } catch (error) {
                            logger.error(`Tool ${call.name} failed:`, error);
                            toolCalls.push({ name: call.name, error: error.message });
                        }
                    }
                }
                
                if (toolCalls.length > 0) {
                    const functionResults = toolCalls.map(tc => ({
                        functionResponse: {
                            name: tc.name,
                            response: tc.result || { error: tc.error }
                        }
                    }));
                    const finalResult = await chat.sendMessage(functionResults);
                    response = finalResult.response.text();
                } else {
                    response = responseData.text();
                }
            } else {
                response = responseData.text();
            }
            
            if (result.response.usageMetadata) {
                await trackUsage({
                    userId: user?.id || 'system',
                    tokensInput: result.response.usageMetadata.promptTokenCount || 0,
                    tokensOutput: result.response.usageMetadata.candidatesTokenCount || 0,
                    model: provider.config.model,
                    provider: provider.name
                });
            }
            
            resetProviderFailure(provider.name);
            return { text: response || 'عذراً، لم أستطع معالجة طلبك.', provider: provider.name, toolCalls };
        } else {
            const result = await callAIProvider(message, history, user, taskType);
            return { text: result, provider: provider.name, toolCalls: [] };
        }
    } catch (error) {
        markProviderFailure(provider.name, provider.key);
        throw error;
    }
}

// ============================================================
// 🌐 CALL AI PROVIDER (FALLBACK)
// ============================================================

async function callAIProvider(message, history, user, taskType = 'general') {
    const provider = getProviderForTask(taskType);
    if (!provider) throw new Error('No AI providers available');
    
    try {
        let response;
        switch (provider.name) {
            case 'gemini_flash':
            case 'gemini_pro': {
                const model = getGeminiModel(provider.key, provider.config.model, false);
                const chat = model.startChat({ history: history || [] });
                const result = await chat.sendMessage(message);
                response = result.response.text();
                break;
            }
            case 'openai': {
                const messages = [
                    { role: "system", content: SYSTEM_PROMPT },
                    ...history.map(h => ({
                        role: h.role === 'user' ? 'user' : 'assistant',
                        content: h.parts[0].text
                    })),
                    { role: "user", content: message }
                ];
                const result = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${provider.key}`
                    },
                    body: JSON.stringify({
                        model: provider.config.model,
                        messages,
                        temperature: TEMPERATURE,
                        max_tokens: MAX_TOKENS
                    })
                });
                if (!result.ok) throw new Error(`OpenAI error: ${result.status}`);
                const data = await result.json();
                response = data.choices[0].message.content;
                break;
            }
            case 'deepseek': {
                const messages = [
                    { role: "system", content: SYSTEM_PROMPT },
                    ...history.map(h => ({
                        role: h.role === 'user' ? 'user' : 'assistant',
                        content: h.parts[0].text
                    })),
                    { role: "user", content: message }
                ];
                const result = await fetch('https://api.deepseek.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${provider.key}`
                    },
                    body: JSON.stringify({
                        model: provider.config.model,
                        messages,
                        temperature: TEMPERATURE,
                        max_tokens: MAX_TOKENS
                    })
                });
                if (!result.ok) throw new Error(`DeepSeek error: ${result.status}`);
                const data = await result.json();
                response = data.choices[0].message.content;
                break;
            }
            default:
                throw new Error(`Unknown provider: ${provider.name}`);
        }
        resetProviderFailure(provider.name);
        return response;
    } catch (error) {
        markProviderFailure(provider.name, provider.key);
        throw error;
    }
}

// ============================================================
// ⚡ CACHE SYSTEM
// ============================================================

const publicCache = new NodeCache({
    stdTTL: CACHE_TTL,
    checkperiod: 600,
    maxKeys: 500,
    useClones: false
});

const privateCache = new NodeCache({
    stdTTL: CACHE_TTL,
    checkperiod: 600,
    maxKeys: 500,
    useClones: false
});

// ============================================================
// 🚦 RATE LIMITING
// ============================================================

const askLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: {
        success: false,
        error: "⚠️ تم تجاوز حد الطلبات. يرجى الانتظار دقيقة.",
        retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id || req.ip
});

// ============================================================
// 🔐 AUTH MIDDLEWARE - مع tokenVersion
// ============================================================

const jwt = require("jsonwebtoken");

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
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const freshUser = await User.findById(decoded.id).lean();
        if (!freshUser) {
            return res.status(401).json({
                success: false,
                error: "❌ المستخدم غير موجود",
                code: "USER_NOT_FOUND"
            });
        }
        
        // ✅ التحقق من tokenVersion
        if (freshUser.tokenVersion && decoded.tokenVersion !== freshUser.tokenVersion) {
            return res.status(401).json({
                success: false,
                error: "❌ تم إلغاء التوكن، يرجى تسجيل الدخول مرة أخرى",
                code: "TOKEN_REVOKED"
            });
        }
        
        // ✅ تسجيل Security Event
        await logSecurityEvent({
            userId: decoded.id,
            type: 'AUTH_SUCCESS',
            details: {
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                role: freshUser.role
            }
        });
        
        req.user = {
            ...decoded,
            role: freshUser.role,
            region: freshUser.region || '',
            tokenVersion: freshUser.tokenVersion || 0
        };
        next();
    } catch (error) {
        logger.warn(`Invalid token attempt: ${error.message}`);
        await logSecurityEvent({
            userId: 'unknown',
            type: 'AUTH_FAILURE',
            details: {
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                error: error.message
            }
        });
        return res.status(401).json({
            success: false,
            error: "❌ توكن غير صالح",
            code: "INVALID_TOKEN"
        });
    }
}

// ============================================================
// 🛡️ SECURITY MONITOR
// ============================================================

async function logSecurityEvent(data) {
    try {
        const event = new SecurityEvent({
            userId: data.userId,
            type: data.type,
            details: data.details,
            ip: data.details?.ip || 'unknown',
            timestamp: new Date()
        });
        await event.save();
        logger.info(`🔒 Security event: ${data.type} - User: ${data.userId}`);
    } catch (error) {
        logger.error('Failed to log security event:', error);
    }
}

// ============================================================
// 🔐 PERMISSIONS - موحدة
// ============================================================

const PERMISSIONS = {
    'مسؤول': ['AI_STATS', 'AI_CACHE_CLEAR', 'AI_USAGE_VIEW', 'AI_AUDIT_VIEW', 'AI_QUOTA_VIEW', 'AI_DASHBOARD', 'AI_REPORT', 'AI_ALERTS_VIEW', 'AI_SECURITY_VIEW'],
    'محرر إقليمي': ['AI_STATS'],
    'فني صيانة': ['AI_STATS'],
    'قائد وحدة': ['AI_STATS', 'AI_DASHBOARD'],
    'ضابط عمليات': ['AI_STATS'],
    'ضابط ملاحة': ['AI_STATS'],
    'مشاهد': []
};

function hasPermission(userRole, permission) {
    const perms = PERMISSIONS[userRole] || [];
    return perms.includes(permission);
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
        if (hasPermission(req.user.role, permission)) {
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
// 🛡️ PROMPT INJECTION DEFENSE
// ============================================================

const PROMPT_INJECTION_PATTERNS = [
    /ignore (previous|all) (instructions|rules|prompts)/i,
    /تجاهل (التعليمات|القواعد|الأوامر|السياق)/i,
    /forget (everything|your (role|instructions))/i,
    /انسى (كل شيء|دورك|تعليماتك)/i,
    /override (system|security|constraints)/i,
    /تجاوز (النظام|الأمان|القيود)/i,
    /you are (now|no longer)/i,
    /أنت (الآن|لم تعد)/i,
    /disregard (safety|security|previous)/i,
    /تجاهل (الأمان|السلامة|السابق)/i,
    /reset (yourself|your (memory|state))/i,
    /إعادة تعيين (نفسك|ذاكرتك|حالتك)/i,
    /reveal (instructions|system prompt|prompt)/i,
    /أظهر (التعليمات|برنامج النظام|التوجيه)/i,
    /system (instructions|prompt|message)/i,
    /تعليمات (النظام|البرنامج|التوجيه)/i,
];

function detectPromptInjection(message) {
    if (message.length > 5000) {
        return { detected: true, message: "⚠️ الرسالة طويلة جداً" };
    }
    for (const pattern of PROMPT_INJECTION_PATTERNS) {
        if (pattern.test(message)) {
            return { detected: true, message: "⚠️ تم اكتشاف محاولة اختراق" };
        }
    }
    const commands = message.match(/\b(ignore|override|reset|reveal|تجاهل|تجاوز|إعادة|أظهر)\b/gi) || [];
    if (commands.length > 3) {
        return { detected: true, message: "⚠️ تم اكتشاف نشاط غير عادي" };
    }
    return { detected: false };
}

// ============================================================
// 🛡️ SENSITIVE DATA FILTER
// ============================================================

const SENSITIVE_PATTERNS = [
    { pattern: /password|كلمة المرور|secret|مفتاح|API key|token/i, replacement: '[معلومات محمية]' },
    { pattern: /\b[A-Za-z0-9]{32,}\b/, replacement: '[مفتاح محمي]' },
    { pattern: /\b(eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)\b/, replacement: '[JWT محمي]' },
    { pattern: /جميع المستخدمين|كل المستخدمين|user data|all users/i, replacement: '[بيانات محمية]' },
    { pattern: /صلاحيات|permissions|role|admin|مسؤول/i, replacement: '[صلاحيات محمية]' },
    { pattern: /\b\d{4}-\d{4}-\d{4}-\d{4}\b/, replacement: '[بطاقة محمية]' },
    { pattern: /\b\d{8}\b/, replacement: '[رقم وثيقة محمي]' },
];

function filterSensitiveData(text, userRole) {
    if (userRole === 'مسؤول') return text;
    let filtered = text;
    for (const item of SENSITIVE_PATTERNS) {
        filtered = filtered.replace(item.pattern, item.replacement);
    }
    return filtered;
}

// ============================================================
// 📊 USAGE TRACKING
// ============================================================

async function trackUsage(data) {
    try {
        await AIUsage.create({ ...data, timestamp: new Date() });
    } catch (error) {
        logger.error('Failed to track AI usage:', error);
    }
}

// ============================================================
// 📝 AUDIT LOG
// ============================================================

async function auditLog(userId, action, details) {
    try {
        await AIAudit.create({
            userId,
            action,
            message: details.message,
            ip: details.ip || 'unknown',
            device: details.userAgent || 'unknown',
            conversationId: details.conversationId,
            timestamp: new Date()
        });
    } catch (error) {
        logger.error('Failed to save audit log:', error);
    }
}

// ============================================================
// 📚 RAG - KNOWLEDGE BASE
// ============================================================

async function searchKnowledgeBase(query) {
    try {
        const results = await KnowledgeBase.find(
            { $text: { $search: query } },
            { score: { $meta: "textScore" } }
        )
        .sort({ score: { $meta: "textScore" } })
        .limit(3)
        .lean();
        return results.map(doc => doc.content).join('\n');
    } catch (error) {
        logger.warn('Knowledge base search failed:', error);
        return '';
    }
}

// ============================================================
// 🧠 USER MEMORY
// ============================================================

async function getUserMemory(userId) {
    try {
        const memories = await UserMemory.find({ userId })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();
        return memories.map(m => `- ${m.topic}: ${m.content}`).join('\n');
    } catch (error) {
        logger.error('Failed to get user memory:', error);
        return '';
    }
}

async function saveUserMemory(userId, topic, content) {
    try {
        const filteredContent = filterSensitiveData(content, 'مشاهد');
        const memory = new UserMemory({
            userId,
            topic,
            content: filteredContent,
            createdAt: new Date()
        });
        await memory.save();
        logger.info(`🧠 User memory saved: ${topic}`);
    } catch (error) {
        logger.error('Failed to save user memory:', error);
    }
}

// ============================================================
// 💾 CONVERSATION HISTORY
// ============================================================

async function getConversationHistory(conversationId, userId) {
    if (!conversationId) return [];
    try {
        const userExists = await User.exists({ _id: userId });
        if (!userExists) return [];
        
        const messages = await Message.find({
            conversationId: conversationId,
            userId: userId
        })
        .sort({ timestamp: -1 })
        .limit(MAX_HISTORY_MESSAGES)
        .lean();
        return messages.reverse().map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: decryptMessage(msg.content) }]
        }));
    } catch (error) {
        logger.error('Failed to get conversation history:', error);
        return [];
    }
}

async function saveConversation(conversationId, userId, userMessage, assistantMessage) {
    try {
        const userExists = await User.exists({ _id: userId });
        if (!userExists) {
            logger.warn(`User ${userId} not found, cannot save conversation`);
            return conversationId;
        }
        
        let conversation;
        if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
            const objId = new mongoose.Types.ObjectId(conversationId);
            conversation = await Conversation.findOneAndUpdate(
                { _id: objId, userId: userId },
                { $set: { updatedAt: new Date() }, $inc: { messageCount: 1 } },
                { new: true }
            );
        }
        if (!conversation) {
            const title = userMessage.substring(0, 50) + (userMessage.length > 50 ? '...' : '');
            conversation = new Conversation({ userId: userId, title: title, messageCount: 1 });
            await conversation.save();
            conversationId = conversation._id;
        }
        
        // ✅ Encrypt - will throw if fails
        const encryptedUserMsg = encryptMessage(userMessage);
        const encryptedAssistantMsg = encryptMessage(assistantMessage);
        
        await Message.insertMany([
            {
                conversationId: conversation._id,
                userId: userId,
                role: 'user',
                content: encryptedUserMsg,
                timestamp: new Date()
            },
            {
                conversationId: conversation._id,
                userId: userId,
                role: 'assistant',
                content: encryptedAssistantMsg,
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
// 🛡️ SECURITY MIDDLEWARE
// ============================================================

async function securityCheck(req, res, next) {
    try {
        const { message } = req.body;
        const userId = req.user?.id;
        if (!message) {
            return res.status(400).json({ error: "الرسالة مطلوبة" });
        }
        const injection = detectPromptInjection(message);
        if (injection.detected) {
            logger.warn(`🚫 Prompt injection detected`);
            await auditLog(userId, 'AI_INJECTION_ATTEMPT', {
                message: message.substring(0, 100)
            });
            await logSecurityEvent({
                userId: userId || 'unknown',
                type: 'PROMPT_INJECTION',
                details: {
                    ip: req.ip,
                    userAgent: req.headers['user-agent'],
                    pattern: injection.message
                }
            });
            return res.status(403).json({
                success: false,
                error: injection.message,
                code: "PROMPT_INJECTION"
            });
        }
        const quotaCheck = await checkUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(429).json({
                success: false,
                error: "⚠️ تم تجاوز الحد اليومي للاستخدام.",
                code: "QUOTA_EXCEEDED"
            });
        }
        req.quota = quotaCheck.quota;
        next();
    } catch (error) {
        logger.error('Security check error:', error);
        next();
    }
}

// ============================================================
// 📊 USER QUOTA
// ============================================================

const DEFAULT_QUOTA = {
    dailyLimit: 500,
    monthlyTokenLimit: 100000,
    requestsPerMinute: 20
};

async function checkUserQuota(userId) {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let quota = await UserQuota.findOne({ userId });
        if (!quota) {
            quota = new UserQuota({
                userId,
                ...DEFAULT_QUOTA,
                dailyUsage: 0,
                monthlyTokensUsed: 0,
                lastReset: today
            });
            await quota.save();
        }
        if (quota.lastReset < today) {
            quota.dailyUsage = 0;
            quota.lastReset = today;
            await quota.save();
        }
        if (quota.dailyUsage >= quota.dailyLimit) {
            return { allowed: false, reason: 'Daily limit exceeded' };
        }
        return { allowed: true, quota };
    } catch (error) {
        logger.error('Quota check failed:', error);
        return { allowed: true };
    }
}

// ============================================================
// 📝 VALIDATION
// ============================================================

const validateAskRequest = [
    body('message').trim().isLength({ min: 1, max: 5000 }).withMessage('الرسالة يجب أن تكون بين 1 و 5000 حرف'),
    body('conversationId').optional().custom(value => mongoose.Types.ObjectId.isValid(value)).withMessage('معرّف المحادثة غير صالح')
];

// ============================================================
// 🚀 ASK AI - MAIN ENDPOINT
// ============================================================

router.post("/ask", 
    authenticate,
    askLimiter,
    validateAskRequest,
    securityCheck,
    async (req, res) => {
    const startTime = Date.now();
    const requestId = generateRequestId();
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

        await auditLog(userId, 'AI_ASK', {
            message: message.substring(0, 100),
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            conversationId: conversationId
        });

        logger.info(`📤 [${requestId}] سؤال من ${userId}: ${message.substring(0, 100)}...`);

        const userMemory = await getUserMemory(userId);
        const memoryContext = userMemory ? `\n\n🧠 ذاكرة المستخدم:\n${userMemory}\n\n` : '';

        let knowledgeContext = '';
        try {
            knowledgeContext = await searchKnowledgeBase(message);
        } catch (error) {
            logger.warn('RAG search failed:', error);
        }
        
        const enrichedMessage = memoryContext + (knowledgeContext ? `\n📚 وثائق المؤسسة:\n${knowledgeContext}\n\n` : '') + message;

        let cachedResponse = null;
        if (ENABLE_CACHE) {
            const isPublicQuestion = message.length < 100 && !message.match(/مركب|أسطول|صيانة|جاهزية/i);
            const cache = isPublicQuestion ? publicCache : privateCache;
            const cacheKey = generateCacheKey(userId, req.user?.role || 'user', conversationId || 'global', message);
            cachedResponse = cache.get(cacheKey);
            
            if (cachedResponse) {
                logger.info(`✅ [${requestId}] تم الرد من الكاش`);
                if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
                    await saveConversation(conversationId, userId, message, cachedResponse);
                }
                return res.json({
                    success: true,
                    response: cachedResponse,
                    cached: true,
                    requestId,
                    responseTime: Date.now() - startTime,
                    version: "23.0.0"
                });
            }
        }

        let history = [];
        if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
            history = await getConversationHistory(conversationId, userId);
        }

        let result;
        try {
            result = await callAIWithTools(enrichedMessage, history, req.user);
        } catch (error) {
            logger.error(`❌ [${requestId}] AI error:`, error);
            return res.status(500).json({
                success: false,
                error: "⚠️ عذراً، حدث خطأ في معالجة طلبك. يرجى المحاولة مرة أخرى.",
                code: "AI_SERVICE_ERROR",
                requestId
            });
        }

        const filteredResponse = filterSensitiveData(result.text, req.user?.role);

        try {
            if (message.length > 20 && !message.includes('جاهزية') && !message.includes('مركب')) {
                await saveUserMemory(userId, 'موضوع الاهتمام', message.substring(0, 100));
            }
        } catch (error) {
            logger.warn('Failed to save user memory:', error);
        }

        const newConversationId = await saveConversation(
            conversationId,
            userId,
            message,
            filteredResponse
        );

        if (ENABLE_CACHE) {
            const isPublicQuestion = message.length < 100 && !message.match(/مركب|أسطول|صيانة|جاهزية/i);
            const cache = isPublicQuestion ? publicCache : privateCache;
            const cacheKey = generateCacheKey(userId, req.user?.role || 'user', newConversationId || 'global', message);
            cache.set(cacheKey, filteredResponse);
        }

        const responseTime = Date.now() - startTime;
        logger.info(`✅ [${requestId}] تم الرد في ${responseTime}ms`);

        res.json({
            success: true,
            response: filteredResponse,
            conversationId: newConversationId,
            requestId,
            responseTime,
            cached: false,
            version: "23.0.0",
            provider: result.provider || 'gemini',
            toolsUsed: result.toolCalls ? result.toolCalls.length : 0
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
// 📊 STREAMING ENDPOINT
// ============================================================

router.post("/ask/stream", 
    authenticate,
    askLimiter,
    validateAskRequest,
    securityCheck,
    async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const requestId = generateRequestId();
    const userId = req.user.id;
    
    try {
        const { message, conversationId } = req.body;
        const cleanMessage = sanitizeInput(message);
        if (!cleanMessage) {
            res.write(`data: ${JSON.stringify({ error: "الرسالة فارغة" })}\n\n`);
            res.end();
            return;
        }
        
        await auditLog(userId, 'AI_STREAM', {
            message: cleanMessage.substring(0, 100),
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            conversationId: conversationId
        });
        
        let history = [];
        if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
            history = await getConversationHistory(conversationId, userId);
        }
        
        const provider = getProviderForTask('simple');
        if (!provider || !provider.name.includes('gemini')) {
            const result = await callAIWithTools(cleanMessage, history, req.user);
            const chunks = result.text.match(/.{1,50}/g) || [result.text];
            for (const chunk of chunks) {
                res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
                await new Promise(r => setTimeout(r, 50));
            }
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
            return;
        }
        
        const model = getGeminiModel(provider.key, provider.config.model, true);
        const chat = model.startChat({ history: history || [] });
        const result = await chat.sendMessageStream(cleanMessage);
        
        let fullResponse = '';
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
                fullResponse += chunkText;
                res.write(`data: ${JSON.stringify({ chunk: chunkText })}\n\n`);
            }
        }
        
        const filteredResponse = filterSensitiveData(fullResponse, req.user?.role);
        const newConversationId = await saveConversation(
            conversationId,
            userId,
            cleanMessage,
            filteredResponse
        );
        
        res.write(`data: ${JSON.stringify({ done: true, conversationId: newConversationId })}\n\n`);
        res.end();
        
    } catch (error) {
        logger.error(`Stream error:`, error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

// ============================================================
// 📊 AI COMMAND CENTER DASHBOARD
// ============================================================

router.get("/dashboard", authenticate, requirePermission('AI_DASHBOARD'), async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));
        
        const providerStatus = Object.entries(AI_PROVIDERS_CONFIG).map(([name, config]) => ({
            name,
            enabled: config.enabled && config.keys.length > 0,
            keys: config.keys.length,
            model: config.model,
            status: config.enabled && config.keys.length > 0 ? '🟢 Online' : '🔴 Offline'
        }));
        
        const [usage, topUsers, topQuestions, dailyStats, alerts, predictions] = await Promise.all([
            AIUsage.aggregate([
                { $match: { timestamp: { $gte: startDate } } },
                {
                    $group: {
                        _id: null,
                        totalRequests: { $sum: 1 },
                        totalTokens: { $sum: { $add: ["$tokensInput", "$tokensOutput"] } },
                        totalCost: { $sum: "$cost" },
                        uniqueUsers: { $addToSet: "$userId" }
                    }
                }
            ]),
            AIUsage.aggregate([
                { $match: { timestamp: { $gte: startDate } } },
                {
                    $group: {
                        _id: "$userId",
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ]),
            AIAudit.aggregate([
                { $match: { timestamp: { $gte: startDate }, action: "AI_ASK" } },
                {
                    $group: {
                        _id: "$message",
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ]),
            AIUsage.aggregate([
                { $match: { timestamp: { $gte: startDate } } },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
                        requests: { $sum: 1 },
                        cost: { $sum: "$cost" }
                    }
                },
                { $sort: { "_id": 1 } }
            ]),
            AIAlert.find({ resolved: false }).countDocuments(),
            PredictiveMaintenance.find({})
                .sort({ createdAt: -1 })
                .limit(10)
                .lean()
        ]);
        
        const total = await Vessel.countDocuments();
        const broken = await Vessel.countDocuments({ stat: 'معطب' });
        const riskLevel = total > 0 ? Math.round((broken / total) * 100) : 0;
        
        const criticalVessels = await Vessel.find({ stat: 'معطب' })
            .limit(3)
            .lean();
        
        const securityEvents = await SecurityEvent.find({})
            .sort({ timestamp: -1 })
            .limit(10)
            .lean();
        
        const users = await User.find({}, 'name email role');
        const userMap = users.reduce((acc, u) => { acc[u._id] = u.name; return acc; }, {});
        
        res.json({
            success: true,
            data: {
                providers: providerStatus,
                summary: {
                    totalRequests: usage[0]?.totalRequests || 0,
                    totalTokens: usage[0]?.totalTokens || 0,
                    totalCost: usage[0]?.totalCost || 0,
                    uniqueUsers: usage[0]?.uniqueUsers?.length || 0,
                    activeAlerts: alerts || 0,
                    predictions: predictions.length,
                    fleetRisk: riskLevel,
                    criticalVessels: criticalVessels.length
                },
                topUsers: topUsers.map(u => ({
                    userId: u._id,
                    name: userMap[u._id] || u._id,
                    requests: u.count
                })),
                topQuestions: topQuestions.map(q => ({
                    question: q._id.substring(0, 100),
                    count: q.count
                })),
                dailyStats: dailyStats,
                recentPredictions: predictions,
                criticalVessels: criticalVessels.map(v => v.name),
                securityEvents: securityEvents
            },
            timestamp: new Date().toISOString(),
            version: "23.0.0"
        });
    } catch (error) {
        logger.error('Dashboard error:', error);
        res.status(500).json({
            success: false,
            error: "❌ خطأ في جلب إحصائيات لوحة التحكم"
        });
    }
});

// ============================================================
// 🚨 ALERTS
// ============================================================

router.get("/alerts", authenticate, requirePermission('AI_ALERTS_VIEW'), async (req, res) => {
    try {
        const alerts = await AIAlert.find({ resolved: false })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();
        res.json({
            success: true,
            data: alerts,
            count: alerts.length
        });
    } catch (error) {
        logger.error('Alerts error:', error);
        res.status(500).json({
            success: false,
            error: "❌ خطأ في جلب التنبيهات"
        });
    }
});

router.post("/alerts/check", authenticate, requirePermission('AI_ALERTS_VIEW'), async (req, res) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const brokenVessels = await Vessel.find({ 
            stat: 'معطب',
            createdAt: { $lt: thirtyDaysAgo }
        }).lean();
        
        for (const vessel of brokenVessels) {
            const existingAlert = await AIAlert.findOne({
                vesselName: vessel.name,
                type: 'long_downtime',
                resolved: false
            });
            if (!existingAlert) {
                const alert = new AIAlert({
                    vesselName: vessel.name,
                    type: 'long_downtime',
                    severity: 'high',
                    message: `المركب ${vessel.name} متوقف منذ ${Math.floor((Date.now() - new Date(vessel.createdAt).getTime()) / (1000 * 60 * 60 * 24))} يوم`,
                    createdAt: new Date()
                });
                await alert.save();
                logger.info(`🚨 Alert created for ${vessel.name}`);
            }
        }
        
        const alerts = await AIAlert.find({ resolved: false })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();
            
        res.json({
            success: true,
            message: "✅ تم تحديث التنبيهات",
            data: alerts,
            count: alerts.length
        });
    } catch (error) {
        logger.error('Alerts check error:', error);
        res.status(500).json({
            success: false,
            error: "❌ خطأ في تحديث التنبيهات"
        });
    }
});

router.put("/alerts/:id/resolve", authenticate, requirePermission('AI_ALERTS_VIEW'), async (req, res) => {
    try {
        const alert = await AIAlert.findByIdAndUpdate(
            req.params.id,
            { resolved: true, resolvedAt: new Date() },
            { new: true }
        );
        if (!alert) {
            return res.status(404).json({
                success: false,
                error: "❌ التنبيه غير موجود"
            });
        }
        res.json({
            success: true,
            message: "✅ تم حل التنبيه",
            data: alert
        });
    } catch (error) {
        logger.error('Alert resolve error:', error);
        res.status(500).json({
            success: false,
            error: "❌ خطأ في حل التنبيه"
        });
    }
});

// ============================================================
// 📄 REPORT
// ============================================================

router.post("/report", authenticate, requirePermission('AI_REPORT'), async (req, res) => {
    try {
        const { type = 'monthly' } = req.body;
        const total = await Vessel.countDocuments();
        const ready = await Vessel.countDocuments({ stat: 'صالح' });
        const broken = await Vessel.countDocuments({ stat: 'معطب' });
        const maintenance = await Vessel.countDocuments({ stat: 'صيانة' });
        
        const predictions = await PredictiveMaintenance.find({})
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();
        
        const report = {
            title: `تقرير ${type === 'monthly' ? 'شهري' : 'أسبوعي'} - الأسطول البحري`,
            generatedAt: new Date(),
            summary: {
                total,
                ready,
                broken,
                maintenance,
                readiness: total > 0 ? Math.round((ready / total) * 100) : 0
            },
            alerts: await AIAlert.find({ resolved: false }).countDocuments(),
            predictions: predictions,
            fleetRisk: total > 0 ? Math.round((broken / total) * 100) : 0
        };
        
        const savedReport = new AIReport({
            userId: req.user.id,
            type,
            data: report,
            createdAt: new Date()
        });
        await savedReport.save();
        
        res.json({
            success: true,
            data: report,
            message: "✅ تم إنشاء التقرير بنجاح"
        });
    } catch (error) {
        logger.error('Report generation error:', error);
        res.status(500).json({
            success: false,
            error: "❌ خطأ في إنشاء التقرير"
        });
    }
});

// ============================================================
// 🔮 PREDICTIVE MAINTENANCE
// ============================================================

router.get("/predictions", authenticate, requirePermission('AI_STATS'), async (req, res) => {
    try {
        const predictions = await PredictiveMaintenance.find({})
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();
        res.json({
            success: true,
            data: predictions,
            count: predictions.length
        });
    } catch (error) {
        logger.error('Predictions error:', error);
        res.status(500).json({
            success: false,
            error: "❌ خطأ في جلب توقعات الصيانة"
        });
    }
});

// ============================================================
// 🛡️ SECURITY EVENTS
// ============================================================

router.get("/security", authenticate, requirePermission('AI_SECURITY_VIEW'), async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const events = await SecurityEvent.find({})
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .lean();
        res.json({
            success: true,
            data: events,
            count: events.length
        });
    } catch (error) {
        logger.error('Security events error:', error);
        res.status(500).json({
            success: false,
            error: "❌ خطأ في جلب أحداث الأمان"
        });
    }
});

// ============================================================
// 🧰 HELPER FUNCTIONS
// ============================================================

function generateRequestId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function generateCacheKey(userId, role, conversationId, message) {
    const hash = crypto
        .createHash('sha256')
        .update(`${userId}:${role}:${conversationId}:${message}`)
        .digest('hex');
    return `ai_${hash}`;
}

// ============================================================
// 📊 STATS
// ============================================================

router.get("/stats", authenticate, requirePermission('AI_STATS'), (req, res) => {
    res.json({
        success: true,
        stats: {
            cacheSize: {
                public: publicCache.keys().length,
                private: privateCache.keys().length
            },
            uptime: process.uptime(),
            version: "23.0.0",
            providers: Object.keys(AI_PROVIDERS_CONFIG).filter(p => AI_PROVIDERS_CONFIG[p].enabled),
            functions: TOOL_DEFINITIONS.length,
            ragEnabled: true,
            memoryEnabled: true,
            alertsEnabled: true,
            webSearchEnabled: ENABLE_WEB_SEARCH,
            predictiveMaintenanceEnabled: true,
            securityEnabled: true
        }
    });
});

// ============================================================
// 🏥 HEALTH
// ============================================================

router.get("/health", authenticate, (req, res) => {
    res.json({
        success: true,
        status: "healthy",
        version: "23.0.0",
        timestamp: new Date().toISOString(),
        cacheSize: {
            public: publicCache.keys().length,
            private: privateCache.keys().length
        },
        providers: Object.keys(AI_PROVIDERS_CONFIG).filter(p => AI_PROVIDERS_CONFIG[p].enabled),
        functions: TOOL_DEFINITIONS.length,
        ragEnabled: true,
        memoryEnabled: true,
        alertsEnabled: true,
        webSearchEnabled: ENABLE_WEB_SEARCH,
        predictiveMaintenanceEnabled: true,
        securityEnabled: true
    });
});

// ============================================================
// 🗑️ CLEAR CACHE
// ============================================================

router.delete("/cache", authenticate, requirePermission('AI_CACHE_CLEAR'), (req, res) => {
    const publicSize = publicCache.keys().length;
    const privateSize = privateCache.keys().length;
    publicCache.flushAll();
    privateCache.flushAll();
    logger.info(`Cache cleared by admin: ${req.user.id}, public: ${publicSize}, private: ${privateSize}`);
    res.json({
        success: true,
        message: `✅ تم مسح الكاش (public: ${publicSize}, private: ${privateSize})`,
        cleared: { public: publicSize, private: privateSize }
    });
});

module.exports = router;
