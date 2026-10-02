// ============================================================
// 📝 models/Note.js - نموذج المذكرات + Note Verbale
// ============================================================

const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema({
    // ═══════════════════════════════════════════════════════
    // 🎯 نوع الملاحظة — جديد (بدون كسر القديم)
    // ═══════════════════════════════════════════════════════
    noteType: {
        type: String,
        enum: ['text', 'document'],
        default: 'text',
        index: true
    },

    // ═══════════════════════════════════════════════════════
    // 📄 الحقول الأساسية (الموجودة)
    // ═══════════════════════════════════════════════════════
    title: {
        type: String,
        required: [true, 'عنوان المذكرة مطلوب'],
        trim: true,
        maxlength: [200, 'العنوان طويل جداً']
    },
    content: {
        type: String,
        // ⚠️ يُصبح غير إلزامي للـ document
        required: function() {
            return this.noteType === 'text';
        }
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
    },

    // ═══════════════════════════════════════════════════════
    // ➕ حقول Note Verbale — جديدة (لا تؤثر على الحالي)
    // ═══════════════════════════════════════════════════════

    // 📎 الملف المرفوع (للـ document فقط)
    uploadedFile: {
        filename: {
            type: String,
            trim: true
        },
        originalName: {
            type: String,
            trim: true
        },
        url: {
            type: String,
            trim: true
        },
        cloudinaryId: {
            type: String,
            trim: true
        },
        size: {
            type: Number,
            min: 0
        },
        mimetype: {
            type: String,
            trim: true
        },
        uploadedAt: {
            type: Date
        }
    },

    // 👤 من رفع الوثيقة
    uploadedBy: {
        id: {
            type: String,
            trim: true
        },
        name: {
            type: String,
            trim: true
        },
        username: {
            type: String,
            trim: true
        },
        role: {
            type: String,
            trim: true
        },
        uploadedAt: {
            type: Date
        }
    },

    // 📝 وصف الوثيقة (اختياري)
    description: {
        type: String,
        trim: true,
        maxlength: [1000, 'الوصف طويل جداً'],
        default: ''
    },

    // 🟢 هل هي الوثيقة الحالية؟ (للـ document فقط)
    isCurrent: {
        type: Boolean,
        default: false,
        index: true
    },

    // 📅 تاريخ بداية الأسبوع (للـ document فقط)
    weekOf: {
        type: Date,
        index: true
    },

    // 📌 ملاحظات على الطرح (للأرشيف)
    archiveReason: {
        type: String,
        trim: true,
        default: ''
    }

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// ============================================================
// 🔍 الفهارس (الموجودة + جديدة)
// ============================================================

NoteSchema.index({ title: 'text', content: 'text', description: 'text' });
NoteSchema.index({ weekNumber: 1, year: 1 });
NoteSchema.index({ type: 1 });
NoteSchema.index({ status: 1 });
NoteSchema.index({ number: 1 }, { unique: true });

// ✅ فهارس جديدة
NoteSchema.index({ noteType: 1, isCurrent: 1 });
NoteSchema.index({ noteType: 1, createdAt: -1 });
NoteSchema.index({ 'uploadedBy.id': 1 });
NoteSchema.index({ weekOf: -1 });

// ============================================================
// 🌀 Virtuals
// ============================================================

NoteSchema.virtual('isPublished').get(function() {
    return this.status === 'منشورة';
});

NoteSchema.virtual('isArchived').get(function() {
    return this.status === 'مؤرشفة';
});

NoteSchema.virtual('isDocument').get(function() {
    return this.noteType === 'document';
});

NoteSchema.virtual('isText').get(function() {
    return this.noteType === 'text';
});

NoteSchema.virtual('fileUrl').get(function() {
    return this.uploadedFile && this.uploadedFile.url ? this.uploadedFile.url : null;
});

NoteSchema.virtual('fileSizeFormatted').get(function() {
    const size = this.uploadedFile && this.uploadedFile.size ? this.uploadedFile.size : 0;
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
    if (size < 1024 * 1024 * 1024) return (size / (1024 * 1024)).toFixed(2) + ' MB';
    return (size / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
});

// ============================================================
// 🛠️ دوال النموذج (Methods) — الموجودة
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
// 🛠️ دوال جديدة — Note Verbale
// ============================================================

/**
 * ✅ ترقية وثيقة لتكون الوثيقة الحالية
 * يُلغي تلقائياً حالة "الحالية" عن كل الوثائق الأخرى
 */
NoteSchema.methods.promoteToCurrent = async function() {
    if (this.noteType !== 'document') return this;

    // إلغاء "الحالية" عن كل الوثائق الأخرى
    await this.constructor.updateMany(
        {
            _id: { $ne: this._id },
            noteType: 'document',
            isCurrent: true
        },
        { $set: { isCurrent: false } }
    );

    this.isCurrent = true;
    this.status = 'منشورة';
    this.publishedAt = this.publishedAt || new Date();
    await this.save();
    return this;
};

/**
 * 📦 أرشفة الوثيقة الحالية
 */
NoteSchema.methods.promoteToArchive = async function(reason) {
    this.isCurrent = false;
    this.status = 'مؤرشفة';
    this.archivedAt = new Date();
    if (reason) this.archiveReason = String(reason).substring(0, 500);
    await this.save();
    return this;
};

// ============================================================
// 📌 دوال ثابتة (Statics) — الموجودة
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
// 📌 دوال ثابتة جديدة — Note Verbale
// ============================================================

/**
 * 🟢 جلب الوثيقة الحالية
 */
NoteSchema.statics.getCurrent = function() {
    return this.findOne({
        noteType: 'document',
        isCurrent: true,
        status: { $ne: 'مسودة' }
    });
};

/**
 * 📚 جلب الأرشيف (كل الوثائق السابقة)
 */
NoteSchema.statics.getArchive = function({ limit = 100, skip = 0, year, uploadedBy } = {}) {
    const query = {
        noteType: 'document',
        isCurrent: false,
        status: { $ne: 'مسودة' }
    };

    if (year) {
        const start = new Date(year, 0, 1);
        const end = new Date(year + 1, 0, 1);
        query.createdAt = { $gte: start, $lt: end };
    }

    if (uploadedBy) {
        query['uploadedBy.id'] = uploadedBy;
    }

    return this.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
};

/**
 * 📊 إحصائيات الأرشيف
 */
NoteSchema.statics.getArchiveStats = async function() {
    const [total, current, thisYear, thisMonth] = await Promise.all([
        this.countDocuments({ noteType: 'document' }),
        this.countDocuments({ noteType: 'document', isCurrent: true }),
        this.countDocuments({
            noteType: 'document',
            createdAt: { $gte: new Date(new Date().getFullYear(), 0, 1) }
        }),
        this.countDocuments({
            noteType: 'document',
            createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
        })
    ]);

    return { total, current, thisYear, thisMonth };
};

/**
 * 👥 قائمة الرافعين (للتصفية)
 */
NoteSchema.statics.getUploaders = async function() {
    return await this.aggregate([
        { $match: { noteType: 'document' } },
        {
            $group: {
                _id: '$uploadedBy.id',
                name: { $first: '$uploadedBy.name' },
                username: { $first: '$uploadedBy.username' },
                role: { $first: '$uploadedBy.role' },
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } }
    ]);
};

/**
 * 📅 قائمة السنوات المتاحة (للتصفية)
 */
NoteSchema.statics.getAvailableYears = async function() {
    return await this.distinct('year', {
        noteType: 'document',
        year: { $exists: true, $ne: null }
    }).then(years => years.sort((a, b) => b - a));
};

// ============================================================
// 🔄 Middleware — الموجود
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
// 🔄 Middleware جديد — Note Verbale
// ============================================================

/**
 * 📅 حساب رقم الأسبوع تلقائياً + weekOf
 */
NoteSchema.pre('save', function(next) {
    if (this.noteType === 'document' && !this.weekOf) {
        this.weekOf = this.createdAt || new Date();
    }

    if (!this.weekNumber && this.weekOf) {
        try {
            const d = new Date(this.weekOf);
            const startOfYear = new Date(d.getFullYear(), 0, 1);
            const days = Math.floor((d - startOfYear) / 86400000);
            const week = Math.ceil((days + startOfYear.getDay() + 1) / 7);
            this.weekNumber = Math.max(1, Math.min(53, week));
        } catch (e) {
            this.weekNumber = 1;
        }
    }

    next();
});

/**
 * 🔒 ضمان وثيقة واحدة "حالية" فقط
 */
NoteSchema.pre('save', async function(next) {
    if (this.noteType === 'document' && this.isCurrent && this.isModified('isCurrent')) {
        try {
            await this.constructor.updateMany(
                {
                    _id: { $ne: this._id },
                    noteType: 'document',
                    isCurrent: true
                },
                { $set: { isCurrent: false } }
            );
        } catch (e) {
            console.error('Error promoting current:', e.message);
        }
    }
    next();
});

// ============================================================
// 🚀 تصدير النموذج
// ============================================================

module.exports = mongoose.model('Note', NoteSchema);
