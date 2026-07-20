// src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const path = require('path');

const config = require('./config');
const database = require('./config/database');
const { logger } = require('./services/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { authenticate, authorize } = require('./middleware/auth');

// ✅ استيراد Routes مباشرة
const authRoutes = require('./routes/authRoutes');
const vesselRoutes = require('./routes/vesselRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const logRoutes = require('./routes/logRoutes');
const locationRoutes = require('./routes/locationRoutes');
const noteRoutes = require('./routes/noteRoutes');

class App {
  constructor() {
    this.app = express();
    this.setupMiddlewares();
    this.setupRoutes();
    this.setupErrorHandlers();
  }

  setupMiddlewares() {
    this.app.use(cors({ origin: config.cors.origins, credentials: true }));
    this.app.use(helmet({ contentSecurityPolicy: false }));
    this.app.use(compression());
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    this.app.use(mongoSanitize());
    this.app.use('/api', rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100
    }));
    this.app.use(express.static(path.join(__dirname, '../public')));
  }

  setupRoutes() {
    // ✅ استخدام Routes مباشرة
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/vessels', vesselRoutes);
    this.app.use('/api/tickets', ticketRoutes);
    this.app.use('/api/logs', logRoutes);
    this.app.use('/api/locations', locationRoutes);
    this.app.use('/api/notes', noteRoutes);

    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

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
      await database.connect();
      this.server = this.app.listen(config.port, '0.0.0.0', () => {
        logger.info(`🚀 Server running on http://localhost:${config.port}`);
      });
      return this.server;
    } catch (error) {
      logger.error('❌ Failed to start application:', error);
      process.exit(1);
    }
  }
}

module.exports = App;
