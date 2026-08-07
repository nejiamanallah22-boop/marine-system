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
                    max_tokens:
