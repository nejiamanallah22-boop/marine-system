const mongoose = require('mongoose');
const config = require('./index');
const logger = require('../services/logger');

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
      this.connection = await mongoose.connect(config.database.uri, {
        ...config.database.options,
        autoIndex: config.env === 'development'
      });

      this.isConnected = true;

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

      logger.info(`✅ MongoDB connected to ${mongoose.connection.name}`);
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
      logger.info('🔌 MongoDB disconnected');
    } catch (error) {
      logger.error('❌ Error disconnecting from MongoDB:', error);
      throw error;
    }
  }

  async transaction(fn) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const result = await fn(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
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
