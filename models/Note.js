// ============================================================
// 📝 models/Note.js - نموذج المذكرات (Note Verbale)
// ============================================================

const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'عنوان المذكرة مطلوب'],
        trim: true,
        maxlength: [200, 'العنوان طويل جداً']
    },
    content: {
        type: String,
        required: [true, 'محتوى المذكرة مطلوب']
    },
    type: {
        type: String,
        enum: ['عام', 'سرية', 'عاجلة', 'مهمة', 'دورية'],
        default: 'عام'
    },
    number: {
        type: String,
        unique: true,
        sparse: true,
        trim: true
    },
    weekNumber: {
        type: Number,
        min: 1,
        max: 53
    },
    year: {
        type: Number,
        default: new Date().getFullYear()
    },
    status: {
        type: String,
        enum: ['مسودة', 'منشورة', 'مؤرشفة'],
        default: 'مسودة'
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
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedByName: {
        type: String,
        trim: true
    },
    approvedAt: {
        type: Date
    },
    attachments: [{
        name: {
            type: String,
            required: true
        },
        url: {
            type: String,
            required: true
        },
        type: String,
        size: Number
    }],
    tags: [{
        type: String,
        trim: true
    }],
    views: {
        type: Number,
        default: 0
    },
    publishedAt: {
        type: Date
    },
    archivedAt: {
        type: Date
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// ============================================================
// 🔍 الفهارس
// ============================================================

NoteSchema.index({ title: 'text', content: 'text' });
NoteSchema.index({ weekNumber: 1, year: 1 });
NoteSchema.index({ type: 1 });
NoteSchema.index({ status: 1 });
NoteSchema.index({ number: 1 }, { unique: true });

// ============================================================
// 🌀 Virtuals
// ============================================================

NoteSchema.virtual('isPublished').get(function() {
    return this.status === 'منشورة';
});

NoteSchema.virtual('isArchived').get(function() {
    return this.status === 'مؤرشفة';
});

// ============================================================
// 🛠️ دوال النموذج (Methods)
// ============================================================

NoteSchema.methods.publish = async function(approvedBy) {
    this.status = 'منشورة';
    this.approvedBy = approvedBy;
    this.publishedAt = new Date();
    await this.save();
    return this;
};

NoteSchema.methods.archive = async function() {
    this.status = 'مؤرشفة';
    this.archivedAt = new Date();
    await this.save();
    return this;
};

NoteSchema.methods.incrementViews = async function() {
    this.views += 1;
    await this.save();
    return this;
};

// ============================================================
// 📌 دوال ثابتة (Statics)
// ============================================================

NoteSchema.statics.findByWeek = function(week, year) {
    return this.find({
        weekNumber: week,
        year: year || new Date().getFullYear()
    }).sort({ createdAt: -1 });
};

NoteSchema.statics.findPublished = function() {
    return this.find({ status: 'منشورة' })
        .sort({ createdAt: -1 });
};

NoteSchema.statics.getLatest = function(limit = 10) {
    return this.find({ status: 'منشورة' })
        .sort({ createdAt: -1 })
        .limit(limit);
};

NoteSchema.statics.search = function(query) {
    return this.find(
        {
            $text: { $search: query },
            status: 'منشورة'
        },
        { score: { $meta: 'textScore' } }
    ).sort({ score: { $meta: 'textScore' } });
};

NoteSchema.statics.getWeeklyReport = async function(week, year) {
    return await this.aggregate([
        {
            $match: {
                weekNumber: week,
                year: year || new Date().getFullYear()
            }
        },
        {
            $group: {
                _id: '$type',
                count: { $sum: 1 }
            }
        }
    ]);
};

// ============================================================
// 🔄 Middleware
// ============================================================

NoteSchema.pre('save', async function(next) {
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

NoteSchema.pre('save', function(next) {
    // توليد رقم المذكرة إذا لم يكن موجوداً
    if (!this.number && this.status === 'منشورة') {
        const year = this.year || new Date().getFullYear();
        const week = this.weekNumber || 1;
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        this.number = `NV-${year}-${week}-${random}`;
    }
    next();
});

// ============================================================
// 🚀 تصدير النموذج
// ============================================================

module.exports = mongoose.model('Note', NoteSchema);
