// ============================================================
// 📜 models/Log.js - نموذج سجلات النظام
// ============================================================

const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
    action: {
        type: String,
        enum: ['login', 'logout', 'create', 'update', 'delete', 'view', 'export', 'import', 'approve', 'reject'],
        required: true
    },
    resource: {
        type: String,
        enum: ['user', 'vessel', 'maintenance', 'ticket', 'note', 'system', 'report'],
        required: true
    },
    resourceId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'resourceModel'
    },
    resourceModel: {
        type: String,
        enum: ['User', 'Vessel', 'Maintenance', 'Ticket', 'Note']
    },
    resourceName: {
        type: String,
        trim: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    userName: {
        type: String,
        trim: true
    },
    userEmail: {
        type: String,
        trim: true
    },
    ipAddress: {
        type: String,
        trim: true
    },
    userAgent: {
        type: String,
        trim: true
    },
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    changes: {
        before: mongoose.Schema.Types.Mixed,
        after: mongoose.Schema.Types.Mixed
    },
    status: {
        type: String,
        enum: ['success', 'error', 'warning', 'info'],
        default: 'success'
    },
    error: {
        type: String,
        trim: true
    },
    duration: {
        type: Number,
        min: 0
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true }
});

// ============================================================
// 🔍 الفهارس
// ============================================================

LogSchema.index({ action: 1 });
LogSchema.index({ resource: 1 });
LogSchema.index({ user: 1 });
LogSchema.index({ createdAt: -1 });
LogSchema.index({ 'details.vesselId': 1 });
LogSchema.index({ 'details.maintenanceId': 1 });

// ============================================================
// 🛠️ دوال النموذج (Methods)
// ============================================================

LogSchema.methods.getSummary = function() {
    return {
        id: this._id,
        action: this.action,
        resource: this.resource,
        user: this.userName || this.userEmail,
        time: this.createdAt,
        status: this.status
    };
};

// ============================================================
// 📌 دوال ثابتة (Statics)
// ============================================================

LogSchema.statics.logAction = async function(data) {
    const log = new this(data);
    return await log.save();
};

LogSchema.statics.logLogin = function(user, req) {
    return this.logAction({
        action: 'login',
        resource: 'user',
        resourceId: user._id,
        resourceModel: 'User',
        user: user._id,
        userName: user.name,
        userEmail: user.email,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        details: { loginTime: new Date() }
    });
};

LogSchema.statics.logLogout = function(user, req) {
    return this.logAction({
        action: 'logout',
        resource: 'user',
        resourceId: user._id,
        resourceModel: 'User',
        user: user._id,
        userName: user.name,
        userEmail: user.email,
        ipAddress: req.ip,
        details: { logoutTime: new Date() }
    });
};

LogSchema.statics.logResourceAction = function(action, resource, resourceId, resourceModel, user, req, details = {}) {
    return this.logAction({
        action,
        resource,
        resourceId,
        resourceModel,
        user: user._id,
        userName: user.name,
        userEmail: user.email,
        ipAddress: req.ip,
        details
    });
};

LogSchema.statics.getUserLogs = function(userId, limit = 50) {
    return this.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(limit);
};

LogSchema.statics.getResourceLogs = function(resource, resourceId, limit = 50) {
    return this.find({ resource, resourceId })
        .sort({ createdAt: -1 })
        .limit(limit);
};

LogSchema.statics.getRecent = function(limit = 100) {
    return this.find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('user', 'name email');
};

LogSchema.statics.getStats = async function(startDate, endDate) {
    const match = {};
    if (startDate) match.createdAt = { $gte: startDate };
    if (endDate) match.createdAt = { ...match.createdAt, $lte: endDate };
    
    return await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$action',
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } }
    ]);
};

// ============================================================
// 🔄 Middleware
// ============================================================

LogSchema.pre('save', async function(next) {
    // جلب اسم المستخدم إذا لم يكن موجوداً
    if (!this.userName && this.user) {
        try {
            const User = mongoose.model('User');
            const user = await User.findById(this.user);
            if (user) {
                this.userName = user.name;
                this.userEmail = user.email;
            }
        } catch (error) {
            console.error('Error fetching user:', error);
        }
    }
    next();
});

// ============================================================
// 🚀 تصدير النموذج
// ============================================================

module.exports = mongoose.model('Log', LogSchema);
