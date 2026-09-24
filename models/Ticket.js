// ============================================================
// 🎫 Ticket Model — v3.0
// Support tickets + replies + sender tracking + SCREEN SHARE
// ============================================================

'use strict';

const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
    message: {
        type: String,
        required: true,
        trim: true,
        maxlength: 5000
    },
    authorName: {
        type: String,
        trim: true,
        default: ''
    },
    authorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    authorUsername: {
        type: String,
        trim: true,
        default: ''
    }
}, {
    timestamps: true,
    _id: true
});

// ============================================================
// 📺 SCREEN SHARE SESSION SUB-SCHEMA
// ============================================================
const screenShareSessionSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        trim: true,
        maxlength: 64
    },
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    requestedByName: {
        type: String,
        trim: true,
        default: '',
        maxlength: 200
    },
    requestedByUsername: {
        type: String,
        trim: true,
        default: '',
        maxlength: 100
    },
    reason: {
        type: String,
        trim: true,
        default: '',
        maxlength: 500
    },
    status: {
        type: String,
        enum: ['معلّق', 'مقبول', 'مرفوض', 'منتهي', 'ملغى'],
        default: 'معلّق'
    },
    requestedAt: {
        type: Date,
        default: Date.now
    },
    respondedAt: {
        type: Date,
        default: null
    },
    startedAt: {
        type: Date,
        default: null
    },
    endedAt: {
        type: Date,
        default: null
    },
    duration: {
        type: Number,
        default: 0,
        min: 0
    },
    rejectionReason: {
        type: String,
        trim: true,
        default: '',
        maxlength: 500
    },
    ipAddress: {
        type: String,
        trim: true,
        default: ''
    },
    userAgent: {
        type: String,
        trim: true,
        default: '',
        maxlength: 500
    }
}, {
    _id: true,
    timestamps: false
});

const ticketSchema = new mongoose.Schema({
    // ============================================================
    // 📝 CORE FIELDS
    // ============================================================
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    description: {
        type: String,
        required: true,
        trim: true,
        maxlength: 5000
    },
    category: {
        type: String,
        enum: ['فني', 'لوجستي', 'إداري', 'تشغيلي', 'أمني', 'أخرى'],
        default: 'فني',
        trim: true
    },
    priority: {
        type: String,
        enum: ['منخفضة', 'متوسطة', 'عالية', 'عاجلة', 'منخفض', 'متوسط', 'عالي', 'حرج'],
        default: 'متوسطة',   // ✅ موحّد مع الواجهة
        trim: true
    },
    status: {
        type: String,
        enum: ['مفتوحة', 'مفتوح', 'قيد المعالجة', 'قيد التنفيذ', 'مغلقة', 'مغلق', 'محلول'],
        default: 'مفتوحة',   // ✅ موحّد مع الواجهة
        trim: true
    },

    // ============================================================
    // 👤 SENDER
    // ============================================================
    sender: {
        type: String,
        trim: true,
        default: '',
        maxlength: 200
    },

    // ============================================================
    // 🧑 WHO CREATED IT
    // ============================================================
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true
    },
    createdByName: {
        type: String,
        trim: true,
        default: ''
    },
    createdByUsername: {
        type: String,
        trim: true,
        default: ''
    },
    createdByRole: {
        type: String,
        trim: true,
        default: ''
    },
    createdByRegion: {
        type: String,
        trim: true,
        default: ''
    },

    // ============================================================
    // 🎯 ASSIGNMENT
    // ============================================================
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true
    },
    assignedToName: {
        type: String,
        trim: true,
        default: ''
    },
    assignedAt: {
        type: Date,
        default: null
    },

    // ============================================================
    // 💬 REPLIES
    // ============================================================
    replies: {
        type: [replySchema],
        default: []
    },
    repliesCount: {
        type: Number,
        default: 0,
        min: 0
    },

    // ============================================================
    // 📺 SCREEN SHARE SESSIONS — ✅ جديد
    // ============================================================
    screenShareSessions: {
        type: [screenShareSessionSchema],
        default: []
    },

    // ============================================================
    // ✅ RESOLUTION
    // ============================================================
    closedAt: {
        type: Date,
        default: null
    },
    closedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    closedByName: {
        type: String,
        trim: true,
        default: ''
    },
    resolution: {
        type: String,
        trim: true,
        default: '',
        maxlength: 3000
    },

    // ============================================================
    // 📎 METADATA
    // ============================================================
    attachments: {
        type: [{
            name: String,
            url: String,
            size: Number,
            mimeType: String
        }],
        default: []
    },
    tags: {
        type: [String],
        default: []
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    // ============================================================
    // 🔍 TRACKING
    // ============================================================
    lastActivityAt: {
        type: Date,
        default: Date.now
    },
    viewsCount: {
        type: Number,
        default: 0,
        min: 0
    }

}, {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// ============================================================
// 🔍 INDEXES
// ============================================================
ticketSchema.index({ createdAt: -1 });
ticketSchema.index({ status: 1, createdAt: -1 });
ticketSchema.index({ priority: 1, createdAt: -1 });
ticketSchema.index({ sender: 1 });
ticketSchema.index({ createdByName: 1 });
ticketSchema.index({ createdBy: 1, createdAt: -1 });

// ============================================================
// 🪝 HOOKS
// ============================================================
ticketSchema.pre('save', function(next) {
    if (this.isModified('replies') && Array.isArray(this.replies)) {
        this.repliesCount = this.replies.length;
    }
    if (this.isModified('replies') || this.isModified('status') ||
        this.isModified('description') || this.isModified('screenShareSessions')) {
        this.lastActivityAt = new Date();
    }
    if (!this.sender && this.createdByName) {
        this.sender = this.createdByName;
    }
    next();
});

// ============================================================
// 🎯 VIRTUALS
// ============================================================
ticketSchema.virtual('subject').get(function() {
    return this.title;
});
ticketSchema.virtual('message').get(function() {
    return this.description;
});
ticketSchema.virtual('user').get(function() {
    return this.sender || this.createdByName || 'مستخدم';
});
ticketSchema.virtual('isOpen').get(function() {
    return ['مفتوح', 'مفتوحة'].includes(this.status);
});
ticketSchema.virtual('isClosed').get(function() {
    return ['مغلق', 'مغلقة', 'محلول'].includes(this.status);
});

// ============================================================
// 🔧 METHODS
// ============================================================
ticketSchema.methods.addReply = function(message, author) {
    this.replies.push({
        message: String(message || '').trim(),
        authorName: author?.name || author?.username || 'مستخدم',
        authorId: author?._id || author?.id || null,
        authorUsername: author?.username || ''
    });
    this.repliesCount = this.replies.length;
    this.lastActivityAt = new Date();
    return this.save();
};

ticketSchema.methods.close = function(user, resolution) {
    this.status = 'مغلقة';
    this.closedAt = new Date();
    this.closedBy = user?._id || user?.id || null;
    this.closedByName = user?.name || user?.username || '';
    this.resolution = String(resolution || '').trim();
    this.lastActivityAt = new Date();
    return this.save();
};

ticketSchema.methods.incrementViews = function() {
    this.viewsCount = (this.viewsCount || 0) + 1;
    return this.save();
};

// ============================================================
// 📺 SCREEN SHARE METHODS — ✅ جديد
// ============================================================
ticketSchema.methods.addScreenRequest = function({ sessionId, requestedBy, requestedByName, requestedByUsername, reason, ipAddress, userAgent }) {
    this.screenShareSessions = this.screenShareSessions || [];
    this.screenShareSessions.push({
        sessionId,
        requestedBy: requestedBy || null,
        requestedByName: requestedByName || '',
        requestedByUsername: requestedByUsername || '',
        reason: String(reason || '').substring(0, 500),
        status: 'معلّق',
        requestedAt: new Date(),
        ipAddress: ipAddress || '',
        userAgent: userAgent || ''
    });
    this.lastActivityAt = new Date();
    return this.save();
};

ticketSchema.methods.updateScreenSession = function(sessionId, updates) {
    const s = this.screenShareSessions.find(x => x.sessionId === sessionId);
    if (!s) return Promise.resolve(this);
    Object.assign(s, updates);
    this.lastActivityAt = new Date();
    return this.save();
};

// ============================================================
// 📊 STATICS
// ============================================================
ticketSchema.statics.findOpenTickets = function(limit) {
    return this.find({ status: { $in: ['مفتوح', 'مفتوحة'] } })
        .sort({ createdAt: -1 })
        .limit(limit || 100);
};

ticketSchema.statics.findBySender = function(senderName, limit) {
    return this.find({ sender: String(senderName || '').trim() })
        .sort({ createdAt: -1 })
        .limit(limit || 100);
};

ticketSchema.statics.getStats = async function() {
    const [total, open, inProgress, closed] = await Promise.all([
        this.countDocuments(),
        this.countDocuments({ status: { $in: ['مفتوح', 'مفتوحة'] } }),
        this.countDocuments({ status: { $in: ['قيد المعالجة', 'قيد التنفيذ'] } }),
        this.countDocuments({ status: { $in: ['مغلق', 'مغلقة', 'محلول'] } })
    ]);
    return { total, open, inProgress, closed };
};

// ============================================================
// 📤 EXPORT
// ============================================================
module.exports = mongoose.model('Ticket', ticketSchema);
