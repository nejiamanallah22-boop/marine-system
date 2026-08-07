const { logger } = require('../utils/logger');
const DatabaseManager = require('../config/database');
const RedisManager = require('../config/redis');

class MemoryManager {
    constructor() {
        this.db = DatabaseManager;
        this.redis = RedisManager;
        this.contextWindow = 10;
        this.maxHistory = 50;
    }

    // ====== حفظ السياق ======
    async saveContext(messages, response, metadata = {}) {
        try {
            const userId = metadata.userId || 'anonymous';
            const conversationId = metadata.conversationId || this.generateId();

            // حفظ في قاعدة البيانات
            await this.db.create('Conversation', {
                conversationId: conversationId,
                userId: userId,
                messages: messages.map(m => ({
                    role: m.role,
                    content: m.content,
                    timestamp: new Date()
                })),
                context: metadata,
                summary: this.generateSummary(messages),
                updatedAt: new Date()
            });

            // حفظ في Redis للوصول السريع
            const cacheKey = `context:${userId}`;
            const context = await this.redis.get(cacheKey) || [];
            context.push({
                messages: messages,
                response: response,
                timestamp: new Date(),
                metadata: metadata
            });

            // الاحتفاظ بآخر الرسائل
            if (context.length > this.maxHistory) {
                context.splice(0, context.length - this.maxHistory);
            }

            await this.redis.set(cacheKey, context, 86400); // 24 ساعة

            logger.debug(`💾 Context saved for user ${userId}`);
        } catch (error) {
            logger.error('Error saving context:', error);
        }
    }

    // ====== استرجاع السياق ======
    async getContext(userId, limit = 5) {
        try {
            // محاولة من Redis أولاً
            const cacheKey = `context:${userId}`;
            const cached = await this.redis.get(cacheKey);
            
            if (cached && cached.length > 0) {
                return cached.slice(-limit);
            }

            // من قاعدة البيانات
            const conversations = await this.db.find('Conversation', 
                { userId: userId },
                { limit: limit, sort: { createdAt: -1 } }
            );

            const context = conversations.map(c => ({
                messages: c.messages,
                summary: c.summary,
                timestamp: c.createdAt
            }));

            // حفظ في الكاش
            if (context.length > 0) {
                await this.redis.set(cacheKey, context, 3600);
            }

            return context;
        } catch (error) {
            logger.error('Error getting context:', error);
            return [];
        }
    }

    // ====== كاش الاستجابات ======
    async getCache(key) {
        try {
            const cached = await this.redis.get(`response:${key}`);
            return cached;
        } catch (error) {
            logger.error('Error getting cache:', error);
            return null;
        }
    }

    async setCache(key, value, ttl = 3600) {
        try {
            await this.redis.set(`response:${key}`, value, ttl);
            return true;
        } catch (error) {
            logger.error('Error setting cache:', error);
            return false;
        }
    }

    // ====== توليد ملخص ======
    generateSummary(messages) {
        const userMessages = messages.filter(m => m.role === 'user');
        if (userMessages.length === 0) return 'No user messages';
        
        const lastMessage = userMessages[userMessages.length - 1];
        return lastMessage.content.substring(0, 100) + '...';
    }

    // ====== توليد معرف ======
    generateId() {
        return `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    // ====== تنظيف السياق ======
    async clearContext(userId) {
        try {
            await this.redis.del(`context:${userId}`);
            await this.db.delete('Conversation', { userId: userId });
            logger.info(`🗑️ Context cleared for user ${userId}`);
            return true;
        } catch (error) {
            logger.error('Error clearing context:', error);
            return false;
        }
    }

    // ====== تفضيلات المستخدم ======
    async savePreferences(userId, preferences) {
        try {
            await this.db.update('User', { userId }, { preferences });
            await this.redis.set(`preferences:${userId}`, preferences, 86400);
            logger.info(`💾 Preferences saved for user ${userId}`);
            return true;
        } catch (error) {
            logger.error('Error saving preferences:', error);
            return false;
        }
    }

    async getPreferences(userId) {
        try {
            // محاولة من Redis
            const cached = await this.redis.get(`preferences:${userId}`);
            if (cached) return cached;

            // من قاعدة البيانات
            const user = await this.db.findOne('User', { userId });
            if (user && user.preferences) {
                await this.redis.set(`preferences:${userId}`, user.preferences, 86400);
                return user.preferences;
            }

            return {};
        } catch (error) {
            logger.error('Error getting preferences:', error);
            return {};
        }
    }

    // ====== ذاكرة المراكب ======
    async saveVesselMemory(vesselId, data) {
        try {
            await this.redis.set(`vessel:${vesselId}`, data, 3600);
            await this.db.update('Vessel', { vesselId }, data);
            return true;
        } catch (error) {
            logger.error('Error saving vessel memory:', error);
            return false;
        }
    }

    async getVesselMemory(vesselId) {
        try {
            // محاولة من Redis
            const cached = await this.redis.get(`vessel:${vesselId}`);
            if (cached) return cached;

            // من قاعدة البيانات
            const vessel = await this.db.findOne('Vessel', { vesselId });
            if (vessel) {
                await this.redis.set(`vessel:${vesselId}`, vessel, 3600);
                return vessel;
            }

            return null;
        } catch (error) {
            logger.error('Error getting vessel memory:', error);
            return null;
        }
    }
}

module.exports = { MemoryManager };
