const Redis = require('ioredis');
const config = require('./index');
const logger = require('../services/logger');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    if (this.isConnected && this.client) {
      return this.client;
    }

    try {
      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password || undefined,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3
      });

      this.client.on('connect', () => {
        logger.info('✅ Redis connected');
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        logger.error('❌ Redis error:', err);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        logger.warn('⚠️ Redis connection closed');
        this.isConnected = false;
      });

      await this.client.ping();
      this.isConnected = true;
      logger.info('✅ Redis connection established');
      
      return this.client;
    } catch (error) {
      logger.error('❌ Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
      logger.info('🔌 Redis disconnected');
    }
  }

  getClient() {
    return this.client;
  }

  isConnectedToRedis() {
    return this.isConnected;
  }

  // دوال مساعدة
  async set(key, value, ttl = config.redis.ttl) {
    if (!this.isConnected) return null;
    try {
      const serialized = JSON.stringify(value);
      if (ttl > 0) {
        await this.client.setex(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (error) {
      logger.error('Redis set error:', error);
      return false;
    }
  }

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

  async del(key) {
    if (!this.isConnected) return false;
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('Redis delete error:', error);
      return false;
    }
  }
}

module.exports = new RedisClient();
