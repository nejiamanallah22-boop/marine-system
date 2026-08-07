// ============================================================
// 💬 CHAT ROUTES - مع دعم كامل للأمان
// ============================================================

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { logger } = require('../utils/logger');
const AuthMiddleware = require('../middleware/auth');
const AIOrchestrator = require('../ai/orchestrator');
const DatabaseManager = require('../config/database');
const RateLimiter = require('../middleware/rateLimit');
const { v4: uuidv4 } = require('uuid');

// ============================================================
// 1. إرسال رسالة إلى المساعد الذكي
// ============================================================

router.post('/ask', 
    AuthMiddleware.authenticate,
    RateLimiter.getLimiter('api'),
    [
        body('message').notEmpty().isLength({ min: 1, max: 4000 }),
        body('conversationId').optional().isString()
    ],
    async (req, res) => {
        try {
            // ✅ التحقق من المدخلات
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { message, conversationId } = req.body;
            const userId = req.userId;

            // ✅ التحقق من حد السرعة
            const rateCheck = await RateLimiter.checkRateLimit(userId, 'chat');
            if (!rateCheck.allowed) {
                return res.status(429).json({
                    error: 'Rate limit exceeded',
                    message: `Please wait ${Math.ceil(rateCheck.remaining)} seconds`,
                    remaining: rateCheck.remaining
                });
            }

            // ✅ جلب السياق
            const context = await getConversationContext(userId, conversationId);

            // ✅ معالجة السؤال
            const response = await AIOrchestrator.generateResponse(
                [
                    { role: 'user', content: message }
                ],
                {
                    userId,
                    conversationId,
                    context: context,
                    temperature: 0.7,
                    max_tokens: 2000
                }
            );

            // ✅ حفظ المحادثة
            await saveConversation(userId, message, response, conversationId);

            // ✅ تسجيل الحدث
            logger.info('💬 Chat request processed', {
                userId,
                conversationId,
                messageLength: message.length,
                responseLength: response.content?.length || 0
            });

            res.json({
                success: true,
                response: response.content || response,
                conversationId: conversationId || response.conversationId,
                provider: response.provider,
                tokens: response.tokens,
                timestamp: new Date()
            });

        } catch (error) {
            logger.error('❌ Chat error:', error);
            res.status(500).json({
                error: 'Chat failed',
                message: error.message
            });
        }
    }
);

// ============================================================
// 2. الحصول على تاريخ المحادثات
// ============================================================

router.get('/history', 
    AuthMiddleware.authenticate,
    async (req, res) => {
        try {
            const userId = req.userId;
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;

            // ✅ جلب تاريخ المحادثات
            const conversations = await DatabaseManager.find('Conversation', 
                { userId },
                {
                    limit,
                    skip: offset,
                    sort: { createdAt: -1 },
                    select: 'conversationId messages summary createdAt'
                }
            );

            // ✅ إزالة المحتوى الكامل للرسائل (للملخص فقط)
            const sanitized = conversations.map(c => ({
                conversationId: c.conversationId,
                summary: c.summary || c.messages[0]?.content?.substring(0, 100) || 'Empty',
                messageCount: c.messages.length,
                createdAt: c.createdAt
            }));

            res.json({
                success: true,
                conversations: sanitized,
                total: await DatabaseManager.countDocuments('Conversation', { userId }),
                limit,
                offset
            });

        } catch (error) {
            logger.error('❌ History error:', error);
            res.status(500).json({
                error: 'Failed to get history',
                message: error.message
            });
        }
    }
);

// ============================================================
// 3. الحصول على محادثة محددة
// ============================================================

router.get('/conversation/:conversationId',
    AuthMiddleware.authenticate,
    async (req, res) => {
        try {
            const { conversationId } = req.params;
            const userId = req.userId;

            // ✅ جلب المحادثة
            const conversation = await DatabaseManager.findOne('Conversation', {
                conversationId,
                userId
            });

            if (!conversation) {
                return res.status(404).json({
                    error: 'Conversation not found'
                });
            }

            // ✅ إزالة البيانات الحساسة
            const sanitized = {
                conversationId: conversation.conversationId,
                messages: conversation.messages.map(m => ({
                    role: m.role,
                    content: m.content,
                    timestamp: m.timestamp
                })),
                createdAt: conversation.createdAt,
                updatedAt: conversation.updatedAt
            };

            res.json({
                success: true,
                conversation: sanitized
            });

        } catch (error) {
            logger.error('❌ Get conversation error:', error);
            res.status(500).json({
                error: 'Failed to get conversation',
                message: error.message
            });
        }
    }
);

// ============================================================
// 4. حذف محادثة
// ============================================================

router.delete('/conversation/:conversationId',
    AuthMiddleware.authenticate,
    AuthMiddleware.checkPermission('conversation:delete'),
    async (req, res) => {
        try {
            const { conversationId } = req.params;
            const userId = req.userId;

            // ✅ حذف المحادثة
            const result = await DatabaseManager.delete('Conversation', {
                conversationId,
                userId
            });

            if (result.deletedCount === 0) {
                return res.status(404).json({
                    error: 'Conversation not found'
                });
            }

            // ✅ تسجيل الحدث
            logger.security('CONVERSATION_DELETE', userId, {
                conversationId,
                ip: req.ip
            });

            res.json({
                success: true,
                message: 'Conversation deleted successfully'
            });

        } catch (error) {
            logger.error('❌ Delete conversation error:', error);
            res.status(500).json({
                error: 'Failed to delete conversation',
                message: error.message
            });
        }
    }
);

// ============================================================
// 5. محادثة مع دفق (Streaming)
// ============================================================

router.post('/stream',
    AuthMiddleware.authenticate,
    [
        body('message').notEmpty().isLength({ min: 1, max: 4000 })
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { message, conversationId } = req.body;
            const userId = req.userId;

            // ✅ إعداد Headers للدفق
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');

            // ✅ معالجة الدفق
            const stream = await AIOrchestrator.streamResponse(
                [{ role: 'user', content: message }],
                { userId, conversationId }
            );

            let fullResponse = '';
            let chunkCount = 0;

            for await (const chunk of stream) {
                chunkCount++;
                fullResponse += chunk;
                
                // ✅ إرسال كل جزء
                res.write(`data: ${JSON.stringify({ 
                    chunk: chunk,
                    chunkCount: chunkCount,
                    complete: false 
                })}\n\n`);
            }

            // ✅ إرسال إشارة الانتهاء
            res.write(`data: ${JSON.stringify({ 
                complete: true,
                totalChunks: chunkCount,
                conversationId: conversationId || uuidv4()
            })}\n\n`);

            // ✅ حفظ المحادثة الكاملة
            await saveConversation(userId, message, fullResponse, conversationId);

            // ✅ تسجيل الحدث
            logger.info('📡 Stream completed', {
                userId,
                chunkCount,
                responseLength: fullResponse.length
            });

            res.end();

        } catch (error) {
            logger.error('❌ Stream error:', error);
            res.write(`data: ${JSON.stringify({ 
                error: error.message,
                complete: true 
            })}\n\n`);
            res.end();
        }
    }
);

// ============================================================
// 6. دوال مساعدة
// ============================================================

async function getConversationContext(userId, conversationId) {
    if (!conversationId) return null;

    const conversation = await DatabaseManager.findOne('Conversation', {
        conversationId,
        userId
    });

    if (!conversation) return null;

    // ✅ استخراج آخر 10 رسائل للسياق
    const recentMessages = conversation.messages.slice(-10);
    return {
        messages: recentMessages,
        context: conversation.context || {},
        createdAt: conversation.createdAt
    };
}

async function saveConversation(userId, message, response, conversationId) {
    const messages = [
        { role: 'user', content: message, timestamp: new Date() },
        { role: 'assistant', content: typeof response === 'string' ? response : response.content, timestamp: new Date() }
    ];

    if (conversationId) {
        // ✅ تحديث محادثة موجودة
        await DatabaseManager.update('Conversation', { conversationId, userId }, {
            $push: { messages: { $each: messages } },
            $set: { 
                updatedAt: new Date(),
                summary: message.substring(0, 100) + '...'
            }
        });
    } else {
        // ✅ إنشاء محادثة جديدة
        const newConversationId = uuidv4();
        await DatabaseManager.create('Conversation', {
            conversationId: newConversationId,
            userId,
            messages,
            summary: message.substring(0, 100) + '...',
            createdAt: new Date(),
            updatedAt: new Date()
        });
        return newConversationId;
    }
}

// ============================================================
// تصدير الراوتر
// ============================================================

module.exports = router;
