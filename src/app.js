const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const path = require('path');

const config = require('./config');
const database = require('./config/database');
const redis = require('./config/redis');
const { logger, logRequest } = require('./services/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { authenticate, authorize } = require('./middleware/auth');
const routes = require('./routes');
const cacheService = require('./services/cacheService');

class App {
  constructor() {
    this.app = express();
    this.setupMiddlewares();
    this.setupRoutes();
    this.setupErrorHandlers();
  }

  setupMiddlewares() {
    // CORS
    this.app.use(cors({
      origin: config.cors.origins,
      credentials: true,
      optionsSuccessStatus: 200
    }));

    // Security Headers - محسّن للإنتاج
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "https://cdn.jsdelivr.net",
            "https://unpkg.com",
            "https://cdnjs.cloudflare.com"
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://cdn.jsdelivr.net",
            "https://unpkg.com",
            "https://fonts.googleapis.com"
          ],
          imgSrc: ["'self'", "data:", "https://unpkg.com", "https://cdn.jsdelivr.net"],
          connectSrc: ["'self'", "https://api.ipify.org"]
        }
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" }
    }));

    // Compression
    this.app.use(compression());

    // Body Parser
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Sanitization
    this.app.use(mongoSanitize());

    // Request Logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        logRequest(req, res, Date.now() - start);
      });
      next();
    });

    // Rate Limiting
    this.app.use('/api', rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      message: '⚠️ تجاوزت الحد المسموح للطلبات',
      standardHeaders: true,
      legacyHeaders: false
    }));

    // Static files
    this.app.use(express.static(path.join(__dirname, '../public')));
  }

  setupRoutes() {
    // API Routes
    this.app.use('/api', routes);

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        env: config.env,
        database: database.isConnectedToDB() ? 'connected' : 'disconnected',
        redis: cacheService.isReady ? 'connected' : 'disconnected'
      });
    });

    // Frontend
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public', 'index.html'));
    });
  }

  setupErrorHandlers() {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  async start() {
    try {
      // اتصال قاعدة البيانات
      await database.connect();
      
      // اتصال Redis (اختياري)
      await redis.connect();
      
      // تهيئة Cache Service
      await cacheService.init();

      const server = this.app.listen(config.port, '0.0.0.0', () => {
        logger.info(`🚀 Server running on http://localhost:${config.port}`);
        logger.info(`📝 Environment: ${config.env}`);
        logger.info(`🗄️  Database: ${database.isConnectedToDB() ? '✅ Connected' : '❌ Disconnected'}`);
        logger.info(`📦 Redis: ${cacheService.isReady ? '✅ Connected' : '❌ Disconnected'}`);
      });

      return server;
    } catch (error) {
      logger.error('❌ Failed to start application:', error);
      process.exit(1);
    }
  }
}

module.exports = App;
