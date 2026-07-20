#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const http = require('http');
const path = require('path');

// ============================================================
// ✅ استيراد الملفات الداخلية
// ============================================================
const { env, config } = require('./src/config/env');
const database = require('./src/config/database');
const { logger, requestLogger } = require('./src/services/logger');
const SocketService = require('./src/services/socketService');
const { 
  errorHandler, 
  notFoundHandler,
  unhandledRejectionHandler,
  uncaughtExceptionHandler
} = require('./src/middleware/errorHandler');
const { authenticate, authorize, updateLastActivity } = require('./src/middleware/auth');
const { validate } = require('./src/middleware/validation');

// ============================================================
// ✅ تهيئة التطبيق
// ============================================================
const app = express();
const server = http.createServer(app);

// تهيئة Socket.IO
const socketService = new SocketService(server);

// ============================================================
// ✅ معالجة الأخطاء غير المتوقعة
// ============================================================
process.on('unhandledRejection', unhandledRejectionHandler);
process.on('uncaughtException', uncaughtExceptionHandler);

// ============================================================
// ✅ Middlewares الأساسية
// ============================================================

// CORS
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
  optionsSuccessStatus: 200
}));

// Security Headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        "https://cdn.jsdelivr.net",
        "https://unpkg.com",
        "https://cdnjs.cloudflare.com",
        "https://*.tile.openstreetmap.org"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://unpkg.com",
        "https://fonts.googleapis.com",
        "https://cdnjs.cloudflare.com"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "https://unpkg.com",
        "https://cdn.jsdelivr.net",
        "https://*.tile.openstreetmap.org",
        "https://*.basemaps.cartocdn.com"
      ],
      connectSrc: [
        "'self'",
        "https://*.tile.openstreetmap.org",
        "https://*.basemaps.cartocdn.com",
        "https://cdn.jsdelivr.net",
        "https://unpkg.com",
        "https://cdnjs.cloudflare.com"
      ]
    }
  }
}));

// Compression
app.use(compression());

// Body Parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Sanitization
app.use(mongoSanitize());

// Request Logging
app.use(requestLogger);

// Rate Limiting
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: '⚠️ تجاوزت الحد المسموح للطلبات',
  standardHeaders: true,
  legacyHeaders: false
}));

// ============================================================
// ✅ الاتصال بقاعدة البيانات
// ============================================================
database.connect();

// ============================================================
// ✅ استيراد Routes
// ============================================================
const authRoutes = require('./src/routes/authRoutes');
const vesselRoutes = require('./src/routes/vesselRoutes');
const ticketRoutes = require('./src/routes/ticketRoutes');
const logRoutes = require('./src/routes/logRoutes');
const locationRoutes = require('./src/routes/locationRoutes');
const noteRoutes = require('./src/routes/noteRoutes');

// ============================================================
// ✅ Routes
// ============================================================

// Routes العامة
app.use('/api/auth', authRoutes);
app.use('/api/vessels', vesselRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/notes', noteRoutes);

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: env,
    database: database.isConnectedToDB() ? 'connected' : 'disconnected'
  });
});

// ============================================================
// ✅ الملفات الثابتة
// ============================================================
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// ✅ معالجة الأخطاء
// ============================================================
app.use(notFoundHandler);
app.use(errorHandler);

// ============================================================
// ✅ تشغيل السيرفر
// ============================================================
const PORT = config.port || 3000;

server.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 Server running on http://localhost:${PORT}`);
  logger.info(`📝 Environment: ${env}`);
  logger.info(`🗄️  Database: ${database.isConnectedToDB() ? '✅ Connected' : '❌ Disconnected'}`);
  
  if (env === 'development') {
    logger.info('========================================');
    logger.info('🔐 Test Credentials:');
    logger.info('   📧 admin');
    logger.info('   🔑 123456');
    logger.info('========================================');
  }
});

// ============================================================
// ✅ إغلاق آمن
// ============================================================
const gracefulShutdown = async (signal) => {
  logger.info(`\n${signal} received, shutting down gracefully...`);
  
  try {
    // إغلاق Socket.IO
    socketService.close();
    
    // إغلاق قاعدة البيانات
    await database.disconnect();
    
    // إغلاق السيرفر
    server.close(() => {
      logger.info('✅ Server closed successfully');
      process.exit(0);
    });
  } catch (error) {
    logger.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { app, server, socketService };
