const dotenv = require('dotenv');
dotenv.config();

const env = process.env.NODE_ENV || 'development';

const config = {
  development: {
    port: process.env.PORT || 3000,
    mongoURI: process.env.MONGODB_URI || 'mongodb://localhost:27017/vessel_db',
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-key-change-me',
    logLevel: 'debug',
    corsOrigins: ['http://localhost:3000', 'http://localhost:3001']
  },
  production: {
    port: process.env.PORT || 3000,
    mongoURI: process.env.MONGODB_URI,
    jwtSecret: process.env.JWT_SECRET,
    logLevel: 'error',
    corsOrigins: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []
  },
  test: {
    port: 3001,
    mongoURI: 'mongodb://localhost:27017/vessel_test',
    jwtSecret: 'test-secret',
    logLevel: 'silent',
    corsOrigins: ['http://localhost:3001']
  }
};

module.exports = { env, config: config[env] };
