const cacheService = require('../services/cacheService');
const { logger } = require('../services/logger');

const cache = (duration) => {
  return async (req, res, next) => {
    const key = `cache:${req.originalUrl || req.url}`;
    
    try {
      const cachedData = await cacheService.get(key);
      
      if (cachedData) {
        logger.debug(`Cache hit: ${key}`);
        return res.json(cachedData);
      }
      
      // تخزين الـ Response الأصلي
      const originalJson = res.json.bind(res);
      res.json = function(data) {
        // تخزين في الكاش إذا كان ناجحاً
        if (res.statusCode === 200) {
          cacheService.set(key, data, duration);
        }
        originalJson(data);
      };
      
      next();
    } catch (error) {
      logger.error('Cache middleware error:', error);
      next();
    }
  };
};

const invalidateCache = (pattern) => {
  return async (req, res, next) => {
    try {
      const keys = await cacheService.client?.keys(`cache:${pattern}*`);
      if (keys && keys.length > 0) {
        await Promise.all(keys.map(key => cacheService.del(key)));
        logger.debug(`Cache invalidated: ${pattern}`);
      }
    } catch (error) {
      logger.error('Cache invalidation error:', error);
    }
    next();
  };
};

module.exports = {
  cache,
  invalidateCache
};
