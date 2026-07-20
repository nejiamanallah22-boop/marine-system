const pino = require('pino');
const config = require('../config');

// إنشاء Logger
const logger = pino({
  level: config.env === 'production' ? 'info' : 'debug',
  transport: config.env !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined,
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      env: config.env,
      service: 'marine-system'
    })
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

// دوال مساعدة
const logError = (error, context = {}) => {
  logger.error({
    ...context,
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    }
  });
};

const logSecurity = (event, details = {}) => {
  logger.warn({
    event,
    ...details,
    timestamp: new Date().toISOString()
  });
};

const logRequest = (req, res, duration) => {
  logger.info({
    type: 'request',
    method: req.method,
    url: req.url,
    status: res.statusCode,
    duration: `${duration}ms`,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id || 'anonymous'
  });
};

module.exports = {
  logger,
  logError,
  logSecurity,
  logRequest
};
