/**
 * 📋 نموذج الجلسة
 * @module models/Session
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const SessionSchema = new mongoose.Schema({
    id: {
        type: String,
        default: uuidv4,
        unique: true,
        index: true
    },
    userId: {
        type: String,
        required: true,
        index: true
    },
    token: {
        type: String,
        required: true,
        unique: true
    },
    refreshToken: {
        type: String,
        unique: true,
        sparse: true
    },
    ip: {
        type: String,
        required: true
    },
    userAgent: {
        type: String,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

/**
 * التحقق من صلاحية الجلسة
 * @returns {boolean}
 */
SessionSchema.methods.isValid = function() {
    return this.isActive && new Date() < this.expiresAt;
};

/**
 * تحديث وقت النشاط
 */
SessionSchema.methods.updateActivity = async function() {
    this.lastActivity = new Date();
    await this.save();
};

/**
 * إنهاء الجلسة
 */
SessionSchema.methods.invalidate = async function() {
    this.isActive = false;
    await this.save();
};

/**
 * الحصول على الجلسات النشطة لمستخدم
 * @param {string} userId - معرف المستخدم
 * @returns {Promise<Array>}
 */
SessionSchema.statics.findActiveByUser = function(userId) {
    return this.find({
        userId: userId,
        isActive: true,
        expiresAt: { $gt: new Date() }
    });
};

/**
 * إنهاء جميع جلسات المستخدم
 * @param {string} userId - معرف المستخدم
 */
SessionSchema.statics.invalidateAllForUser = async function(userId) {
    await this.updateMany(
        { userId: userId, isActive: true },
        { isActive: false }
    );
};

const Session = mongoose.model('Session', SessionSchema);

module.exports = Session;
