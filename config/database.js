/**
 * 📊 اتصال قاعدة بيانات MongoDB Atlas
 * @module config/database
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * الاتصال بقاعدة البيانات
 * @async
 * @returns {Promise<void>}
 */
async function connectDatabase() {
    try {
        const uri = process.env.MONGODB_URI;
        
        if (!uri) {
            throw new Error('MONGODB_URI غير موجود في متغيرات البيئة');
        }

        await mongoose.connect(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            family: 4 // استخدام IPv4
        });

        logger.info('✅ تم الاتصال بـ MongoDB Atlas بنجاح');
        logger.info(`📊 قاعدة البيانات: ${mongoose.connection.name}`);
        logger.info(`🖥️  المضيف: ${mongoose.connection.host}`);

        // الاستماع لأحداث الاتصال
        mongoose.connection.on('error', (err) => {
            logger.error('❌ خطأ في MongoDB:', err);
        });

        mongoose.connection.on('disconnected', () => {
            logger.warn('⚠️ تم قطع الاتصال بـ MongoDB');
        });

        mongoose.connection.on('reconnected', () => {
            logger.info('✅ تم إعادة الاتصال بـ MongoDB');
        });

    } catch (error) {
        logger.error('❌ فشل الاتصال بقاعدة البيانات:', error.message);
        process.exit(1);
    }
}

/**
 * إغلاق الاتصال بقاعدة البيانات
 * @async
 * @returns {Promise<void>}
 */
async function disconnectDatabase() {
    try {
        await mongoose.disconnect();
        logger.info('✅ تم إغلاق الاتصال بقاعدة البيانات');
    } catch (error) {
        logger.error('❌ خطأ في إغلاق الاتصال:', error.message);
    }
}

module.exports = {
    connectDatabase,
    disconnectDatabase,
    mongoose
};
