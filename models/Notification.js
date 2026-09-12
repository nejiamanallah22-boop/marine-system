/**
 * 🔔 نموذج الإشعارات - v1.0
 * @module models/Notification
 */

const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    id: {
        type: String,
        index: true,
        default: () => require('crypto').randomBytes(8).toString('hex')
    },
    userId: {
        type: String,
        default: null,
        index: true
    },
    type: {
        type: String,
        enum: ['info', 'success', 'warning', 'error'],
        default: 'info',
        index: true
    },
    category: {
        type: String,
        enum: ['user', 'vessel', 'maintenance', 'ticket', 'system', 'auth', 'note'],
        default: 'system',
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    message: {
        type: String,
        default: '',
        trim: true,
        maxlength: 1000
    },
    link: {
        type: String,
        default: null
    },
    icon: {
        type: String,
        default: 'bell'
    },
    isRead: {
        type: Boolean,
        default: false,
        index: true
    },
    actorName: {
        type: String,
        default: null
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ createdAt: -1 });
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

NotificationSchema.statics.getUnreadCount = function(userId) {
    return this.countDocuments({
        $or: [{ userId: userId }, { userId: null }],
        isRead: false
    });
};

NotificationSchema.statics.createNotification = async function(data) {
    try {
        const notif = new this({
            id: require('crypto').randomBytes(8).toString('hex'),
            userId: data.userId || null,
            type: data.type || 'info',
            category: data.category || 'system',
            title: data.title,
            message: data.message || '',
            link: data.link || null,
            icon: data.icon || 'bell',
            actorName: data.actorName || null,
            metadata: data.metadata || {},
            isRead: false
        });
        return await notif.save();
    } catch (e) {
        console.error('❌ createNotification error:', e.message);
        return null;
    }
};

const Notification = mongoose.model('Notification', NotificationSchema);

module.exports = Notification;
