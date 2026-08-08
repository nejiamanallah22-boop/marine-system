// ============================================================
// 🎫 models/Ticket.js - نموذج التذاكر
// ============================================================

const mongoose = require('mongoose');

const TicketSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'عنوان التذكرة مطلوب'],
        trim: true,
        minlength: [3, 'العنوان قصير جداً'],
        maxlength: [100, 'العنوان طويل جداً']
    },
    description: {
        type: String,
        required: [true, 'وصف التذكرة مطلوب'],
        minlength: [10, 'الوصف قصير جداً']
    },
    category: {
        type: String,
        enum: ['فني', 'لوجستي', 'إداري', 'تشغيلي', 'أمني', 'أخرى'],
        default: 'فني'
    },
    status: {
        type: String,
        enum: ['مفتوح', 'قيد المعالجة', 'بانتظار المراجعة', 'مغلق'],
        default: 'مفتوح'
    },
    priority: {
        type: String,
        enum: ['منخفض', 'متوسط', 'عالي', 'حرج'],
        default: 'متوسط'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdByName: {
        type: String,
        trim: true
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    assignedToName: {
        type: String,
        trim: true
    },
    replies: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        userName: {
            type: String,
            trim: true
        },
        message: {
            type: String,
            required: true
        },
        isInternal: {
            type: Boolean,
            default: false
        },
        attachments: [{
            name: String,
            url: String,
            type: String,
            size: Number
        }],
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    closedAt: {
        type: Date
    },
    closedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    resolution: {
        type: String,
        trim: true
    },
    tags: [{
        type: String,
        trim: true
    }]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// ============================================================
// 🔍 الفهارس
// ============================================================

TicketSchema.index({ status: 1 });
TicketSchema.index({ priority: 1 });
TicketSchema.index({ createdBy: 1 });
TicketSchema.index({ assignedTo: 1 });
TicketSchema.index({ createdAt: -1 });

// ============================================================
// 🌀 Virtuals
// ============================================================

TicketSchema.virtual('isOpen').get(function() {
    return this.status !== 'مغلق';
});

TicketSchema.virtual('replyCount').get(function() {
    return this.replies?.length || 0;
});

TicketSchema.virtual('age').get(function() {
    const now = new Date();
    const diff = now - this.createdAt;
    return Math.ceil(diff / (1000 * 60 * 60 * 24)); // بالأيام
});

// ============================================================
// 🛠️ دوال النموذج (Methods)
// ============================================================

TicketSchema.methods.addReply = async function(userId, userName, message, isInternal = false) {
    this.replies.push({
        user: userId,
        userName: userName,
        message: message,
        isInternal: isInternal
    });
    
    if (this.status === 'مفتوح') {
        this.status = 'قيد المعالجة';
    }
    
    await this.save();
    return this;
};

TicketSchema.methods.close = async function(userId, resolution) {
    this.status = 'مغلق';
    this.closedAt = new Date();
    this.closedBy = userId;
    if (resolution) {
        this.resolution = resolution;
    }
    await this.save();
    return this;
};

TicketSchema.methods.assign = async function(userId, userName) {
    this.assignedTo = userId;
    this.assignedToName = userName;
    this.status = 'قيد المعالجة';
    await this.save();
    return this;
};

// ============================================================
// 📌 دوال ثابتة (Statics)
// ============================================================

TicketSchema.statics.findOpen = function() {
    return this.find({ status: { $ne: 'مغلق' } })
        .sort({ priority: -1, createdAt: 1 });
};

TicketSchema.statics.findByUser = function(userId) {
    return this.find({
        $or: [
            { createdBy: userId },
            { assignedTo: userId }
        ]
    }).sort({ createdAt: -1 });
};

TicketSchema.statics.getStats = async function() {
    return await this.aggregate([
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);
};

TicketSchema.statics.getPriorityStats = async function() {
    return await this.aggregate([
        {
            $match: { status: { $ne: 'مغلق' } }
        },
        {
            $group: {
                _id: '$priority',
                count: { $sum: 1 }
            }
        }
    ]);
};

// ============================================================
// 🔄 Middleware
// ============================================================

TicketSchema.pre('save', async function(next) {
    // جلب اسم المنشئ
    if (!this.createdByName && this.createdBy) {
        try {
            const User = mongoose.model('User');
            const user = await User.findById(this.createdBy);
            if (user) {
                this.createdByName = user.name;
            }
        } catch (error) {
            console.error('Error fetching user name:', error);
        }
    }
    next();
});

// ============================================================
// 🚀 تصدير النموذج
// ============================================================

module.exports = mongoose.model('Ticket', TicketSchema);
