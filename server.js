#!/usr/bin/env node

const App = require('./src/app');
const SocketService = require('./src/socket');
const { logger } = require('./src/services/logger');
const config = require('./src/config');

// معالجة الأخطاء غير المتوقعة
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Rejection:', error);
  if (config.env === 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  if (config.env === 'production') {
    process.exit(1);
  }
});

// إنشاء التطبيق
const app = new App();
const server = app.start();

// تهيئة Socket.IO
server.then((httpServer) => {
  const socketService = new SocketService(httpServer);
  logger.info('📡 Socket.IO initialized');
  
  // إغلاق آمن
  const gracefulShutdown = async (signal) => {
    logger.info(`\n${signal} received, shutting down gracefully...`);
    
    try {
      socketService.close();
      await require('./src/config/database').disconnect();
      await require('./src/config/redis').disconnect();
      httpServer.close(() => {
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
});

module.exports = app;
