// ============================================================
// 🚢 models/Vessel.js - نموذج القطع البحرية (معدل)
// ============================================================

const mongoose = require('mongoose');

const VesselSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: [true, 'اسم القطعة مطلوب'], 
        trim: true,
        unique: true
    },
    num: { 
        type: String, 
        trim: true,
        unique: true,
        sparse: true
    },
    len: { 
        type: Number, 
        default: 0,
        min: [0, 'الطول يجب أن يكون موجباً']
    },
    cat: { 
        type: String, 
        default: 'زوارق مزدوجة',
        enum: ['زوارق مزدوجة', 'البروق', 'صقور', 'خوافر', 'طوافات']
    },
    reg: { type: String, trim: true },
    zone: { type: String, trim: true },
    port: { type: String, trim: true },
    supp: { type: String, trim: true },
    stat: { 
        type: String, 
        enum: ['صالح', 'معطب', 'صيانة'], 
        default: 'صالح' 
    },
    break: { type: String, trim: true },
    fDate: { 
        type: String,
        match: [/^\d{4}-\d{2}-\d{2}$/, 'تاريخ غير صالح (استخدم YYYY-MM-DD)']
    },
    eDate: { 
        type: String,
        match: [/^\d{4}-\d{2}-\d{2}$/, 'تاريخ غير صالح (استخدم YYYY-MM-DD)']
    },
    ref: { type: String, trim: true }
}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// ============================================================
// 🔍 الفهارس
// ============================================================

VesselSchema.index({ name: 1 });
VesselSchema.index({ num: 1 }, { unique: true });
VesselSchema.index({ stat: 1 });
VesselSchema.index({ cat: 1 });

// ============================================================
// 🌀 Virtuals
// ============================================================

VesselSchema.virtual('isActive').get(function() {
    return this.stat === 'صالح';
});

VesselSchema.virtual('needsMaintenance').get(function() {
    return this.stat === 'صيانة' || this.stat === 'معطب';
});

VesselSchema.virtual('categoryLabel').get(function() {
    return this.cat || this.calculateCategory();
});

// ============================================================
// 🛠️ دوال النموذج (Methods)
// ============================================================

VesselSchema.methods.calculateCategory = function() {
    const n = parseFloat(this.len);
    
    if (!n || isNaN(n)) return this.cat || 'غير معروف';
    
    if (n === 11) return 'البروق';
    if (n >= 8 && n <= 12) return 'صقور';
    if (n > 12 && n <= 25) return 'خوافر';
    if (n > 30) return 'طوافات';
    
    return 'زوارق مزدوجة';
};

VesselSchema.methods.updateCategory = function() {
    this.cat = this.calculateCategory();
    return this;
};

// ============================================================
// 📌 دوال ثابتة (Statics)
// ============================================================

VesselSchema.statics.findByCategory = function(category) {
    return this.find({ cat: category });
};

VesselSchema.statics.findActive = function() {
    return this.find({ stat: 'صالح' });
};

VesselSchema.statics.findMaintenance = function() {
    return this.find({ stat: { $in: ['صيانة', 'معطب'] } });
};

VesselSchema.statics.getStats = async function() {
    return await this.aggregate([
        {
            $group: {
                _id: '$stat',
                count: { $sum: 1 }
            }
        }
    ]);
};

VesselSchema.statics.getCategoryStats = async function() {
    return await this.aggregate([
        {
            $group: {
                _id: '$cat',
                count: { $sum: 1 }
            }
        }
    ]);
};

// ============================================================
// 🔄 Middleware
// ============================================================

VesselSchema.pre('save', function(next) {
    // تحديث الفئة تلقائياً عند حفظ الطول
    if (this.isModified('len')) {
        this.cat = this.calculateCategory();
    }
    next();
});

// ============================================================
// 🚀 تصدير النموذج
// ============================================================

module.exports = mongoose.model('Vessel', VesselSchema);
