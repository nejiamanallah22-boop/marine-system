const redis = require('../config/redis');

class CacheService {
  constructor() {
    this.client = null;
    this.isReady = false;
  }

  async init() {
    try {
      this.client = await redis.connect();
      this.isReady = true;
      return this.client;
    } catch (error) {
      console.warn('⚠️ Redis не доступен, кэш отключён');
      this.isReady = false;
      return null;
    }
  }

  async get(key) {
    if (!this.isReady) return null;
    try {
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      return null;
    }
  }

  async set(key, value, ttl = 3600) {
    if (!this.isReady) return false;
    try {
      const serialized = JSON.stringify(value);
      await this.client.setex(key, ttl, serialized);
      return true;
    } catch (error) {
      return false;
    }
  }

  async del(key) {
    if (!this.isReady) return false;
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  async clear(pattern) {
    if (!this.isReady) return false;
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = new CacheService();
