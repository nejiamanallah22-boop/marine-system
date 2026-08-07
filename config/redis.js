const Redis = require('ioredis');
const { logger } = require('../utils/logger');

class RedisManager {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.retryAttempts = 0;
        this.maxRetries = 5;
    }

    async connect() {
        if (this.isConnected) return this;

        const config = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD || '',
            db: parseInt(process.env.REDIS_DB) || 0,
            retryStrategy: (times) => {
                this.retryAttempts = times;
                if (times > this.maxRetries) {
                    logger.error(`Redis: Max retries (${this.maxRetries}) exceeded`);
                    return null;
                }
                const delay = Math.min(times * 100, 3000);
                logger.warn(`Redis: Retrying connection (${times}/${this.maxRetries})...`);
                return delay;
            },
            maxRetriesPerRequest: 3
        };

        try {
            this.client = new Redis(config);
            
            // أحداث الاتصال
            this.client.on('connect', () => {
                this.isConnected = true;
                this.retryAttempts = 0;
                logger.info('✅ Redis connected successfully');
            });

            this.client.on('ready', () => {
                logger.info('✅ Redis ready');
            });

            this.client.on('error', (error) => {
                this.isConnected = false;
                logger.error('❌ Redis error:', error);
            });

            this.client.on('close', () => {
                this.isConnected = false;
                logger.warn('⚠️ Redis connection closed');
            });

            this.client.on('reconnecting', () => {
                logger.warn('🔄 Redis reconnecting...');
            });

            // اختبار الاتصال
            await this.client.ping();
            this.isConnected = true;

            // إعداد الأحداث
            this.setupEvents();

            return this;
        } catch (error) {
            logger.error('❌ Redis connection failed:', error);
            // استمر بدون Redis
            this.isConnected = false;
            return this;
        }
    }

    setupEvents() {
        // PUB/SUB للأحداث
        this.subscriber = this.client.duplicate();
        this.publisher = this.client.duplicate();

        // إعداد الاشتراكات
        this.subscriber.on('message', (channel, message) => {
            logger.debug(`📨 Redis message on ${channel}:`, message);
            // معالجة الرسائل
            this.handleMessage(channel, JSON.parse(message));
        });

        // الاشتراك في القنوات
        this.subscriber.subscribe('ai:events', 'system:alerts', 'fleet:updates');
    }

    async handleMessage(channel, data) {
        switch (channel) {
            case 'ai:events':
                // معالجة أحداث الذكاء الاصطناعي
                break;
            case 'system:alerts':
                // معالجة تنبيهات النظام
                break;
            case 'fleet:updates':
                // تحديثات الأسطول
                break;
        }
    }

    // ====== عمليات الكاش ======

    async get(key) {
        if (!this.isConnected) return null;
        try {
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error('Redis get error:', error);
            return null;
        }
    }

    async set(key, value, ttl = 3600) {
        if (!this.isConnected) return false;
        try {
            await this.client.setex(key, ttl, JSON.stringify(value));
            return true;
        } catch (error) {
            logger.error('Redis set error:', error);
            return false;
        }
    }

    async del(key) {
        if (!this.isConnected) return false;
        try {
            await this.client.del(key);
            return true;
        } catch (error) {
            logger.error('Redis del error:', error);
            return false;
        }
    }

    async getOrSet(key, fetchFn, ttl = 3600) {
        const cached = await this.get(key);
        if (cached !== null) return cached;

        const data = await fetchFn();
        if (data) {
            await this.set(key, data, ttl);
        }
        return data;
    }

    async incr(key) {
        if (!this.isConnected) return false;
        try {
            return await this.client.incr(key);
        } catch (error) {
            logger.error('Redis incr error:', error);
            return false;
        }
    }

    async expire(key, seconds) {
        if (!this.isConnected) return false;
        try {
            await this.client.expire(key, seconds);
            return true;
        } catch (error) {
            logger.error('Redis expire error:', error);
            return false;
        }
    }

    // ====== هاش (Hash) عمليات ======

    async hset(key, field, value) {
        if (!this.isConnected) return false;
        try {
            await this.client.hset(key, field, JSON.stringify(value));
            return true;
        } catch (error) {
            logger.error('Redis hset error:', error);
            return false;
        }
    }

    async hget(key, field) {
        if (!this.isConnected) return null;
        try {
            const data = await this.client.hget(key, field);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error('Redis hget error:', error);
            return null;
        }
    }

    async hgetall(key) {
        if (!this.isConnected) return null;
        try {
            const data = await this.client.hgetall(key);
            const result = {};
            for (const [field, value] of Object.entries(data)) {
                try {
                    result[field] = JSON.parse(value);
                } catch {
                    result[field] = value;
                }
            }
            return result;
        } catch (error) {
            logger.error('Redis hgetall error:', error);
            return null;
        }
    }

    // ====== قائمة (List) عمليات ======

    async lpush(key, value) {
        if (!this.isConnected) return false;
        try {
            await this.client.lpush(key, JSON.stringify(value));
            return true;
        } catch (error) {
            logger.error('Redis lpush error:', error);
            return false;
        }
    }

    async lrange(key, start = 0, stop = -1) {
        if (!this.isConnected) return [];
        try {
            const data = await this.client.lrange(key, start, stop);
            return data.map(item => {
                try {
                    return JSON.parse(item);
                } catch {
                    return item;
                }
            });
        } catch (error) {
            logger.error('Redis lrange error:', error);
            return [];
        }
    }

    // ====== نشر واشتراك ======

    async publish(channel, message) {
        if (!this.isConnected || !this.publisher) return false;
        try {
            await this.publisher.publish(channel, JSON.stringify(message));
            return true;
        } catch (error) {
            logger.error('Redis publish error:', error);
            return false;
        }
    }

    async subscribe(channel, callback) {
        if (!this.isConnected || !this.subscriber) return false;
        try {
            await this.subscriber.subscribe(channel);
            this.subscriber.on('message', (ch, message) => {
                if (ch === channel) {
                    callback(JSON.parse(message));
                }
            });
            return true;
        } catch (error) {
            logger.error('Redis subscribe error:', error);
            return false;
        }
    }

    // ====== إدارة الجلسات ======

    async setSession(userId, data, ttl = 86400) {
        return await this.set(`session:${userId}`, data, ttl);
    }

    async getSession(userId) {
        return await this.get(`session:${userId}`);
    }

    async deleteSession(userId) {
        return await this.del(`session:${userId}`);
    }

    // ====== كاش البيانات ======

    async cacheVessel(vesselId, data, ttl = 3600) {
        return await this.set(`vessel:${vesselId}`, data, ttl);
    }

    async getCachedVessel(vesselId) {
        return await this.get(`vessel:${vesselId}`);
    }

    async cachePrediction(vesselId, data, ttl = 1800) {
        return await this.set(`prediction:${vesselId}`, data, ttl);
    }

    async getCachedPrediction(vesselId) {
        return await this.get(`prediction:${vesselId}`);
    }

    // ====== تنظيف الكاش ======

    async clearAll() {
        if (!this.isConnected) return false;
        try {
            await this.client.flushall();
            logger.info('Redis cache cleared');
            return true;
        } catch (error) {
            logger.error('Redis clear error:', error);
            return false;
        }
    }

    async disconnect() {
        if (this.isConnected && this.client) {
            await this.client.quit();
            this.isConnected = false;
            logger.info('Redis disconnected');
        }
    }

    // ====== إحصائيات ======

    async getStats() {
        if (!this.isConnected) return null;
        try {
            const info = await this.client.info();
            const stats = {
                connected: this.isConnected,
                memory: {
                    used: this.extractInfo(info, 'used_memory'),
                    peak: this.extractInfo(info, 'used_memory_peak'),
                    fragmentation: this.extractInfo(info, 'mem_fragmentation_ratio')
                },
                clients: {
                    connected: this.extractInfo(info, 'connected_clients'),
                    blocked: this.extractInfo(info, 'blocked_clients')
                },
                keys: {
                    total: this.extractInfo(info, 'db0')?.keys || 0,
                    expires: this.extractInfo(info, 'db0')?.expires || 0
                },
                operations: {
                    total: this.extractInfo(info, 'total_commands_processed'),
                    hits: this.extractInfo(info, 'keyspace_hits'),
                    misses: this.extractInfo(info, 'keyspace_misses')
                }
            };
            return stats;
        } catch (error) {
            logger.error('Redis stats error:', error);
            return null;
        }
    }

    extractInfo(info, key) {
        const lines = info.split('\n');
        for (const line of lines) {
            if (line.startsWith(`${key}:`)) {
                const value = line.split(':')[1];
                if (key === 'db0') {
                    const parts = value.split(',');
                    return {
                        keys: parseInt(parts[0].split('=')[1]),
                        expires: parseInt(parts[1].split('=')[1])
                    };
                }
                return value;
            }
        }
        return null;
    }
}

module.exports = new RedisManager();
