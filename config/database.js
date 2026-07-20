const mongoose = require('mongoose');
const logger = require('../services/logger');
const { config, env } = require('./env');

class Database {
  constructor() {
    this.isConnected = false;
    this.connection = null;
  }

  async connect() {
    if (this.isConnected) {
      logger.info('✅ Already connected to MongoDB');
      return this.connection;
    }

    try {
      const options = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
        minPoolSize: 2,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        retryWrites: true,
        w: 'majority'
      };

      if (env === 'production') {
        options.ssl = true;
      }

      this.connection = await mongoose.connect(config.mongoURI, options);
      this.isConnected = true;

      logger.info(`✅ MongoDB connected successfully to ${config.mongoURI}`);

      // إضافة مستمعين للأحداث
      mongoose.connection.on('error', (err) => {
        logger.error('❌ MongoDB connection error:', err);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('⚠️ MongoDB disconnected');
        this.isConnected = false;
      });

      mongoose.connection.on('reconnected', () => {
        logger.info('🔄 MongoDB reconnected');
        this.isConnected = true;
      });

      return this.connection;
    } catch (error) {
      logger.error('❌ Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  async disconnect() {
    if (!this.isConnected) return;
    
    try {
      await mongoose.disconnect();
      this.isConnected = false;
      logger.info('🔌 MongoDB disconnected successfully');
    } catch (error) {
      logger.error('❌ Error disconnecting from MongoDB:', error);
      throw error;
    }
  }

  getConnection() {
    return this.connection;
  }

  isConnectedToDB() {
    return this.isConnected;
  }
}

module.exports = new Database();
