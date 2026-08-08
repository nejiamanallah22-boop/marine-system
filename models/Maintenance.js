// ============================================================
// 🔧 models/Maintenance.js - نموذج الصيانة
// ============================================================

const mongoose = require('mongoose');

const MaintenanceSchema = new mongoose.Schema({
    vesselId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vessel',
        required: [true, 'رقم القطعة مطلوب']
    },
    vesselName: {
        type: String,
        trim: true
    },
    type: {
        type: String,
        enum: ['مجدولة', 'طارئة', 'دورية', 'إصلاح شامل', 'فحص'],
        required: [true, 'نوع الصيانة مطلوب']
    },
    priority: {
        type: String,
        enum: ['منخفض', 'متوسط', 'عالي', 'حرج'],
        default: 'متوسط'
    },
    description: {
        type: String,
        required: [true, 'وصف الصيانة مطلوب']
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date
    },
    status: {
        type: String,
        enum: ['معلقة', 'قيد التنفيذ', 'مكتملة', 'ملغاة'],
        default: 'معلقة'
    },
    cost: {
        type: Number,
        min: 0,
        default: 0
    },
    contractor: {
        type: String,
        trim: true
    },
    supervisor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    supervisorName: {
        type: String,
        trim: true
    },
    partsUsed: [{
        partName: {
            type: String,
            required: true
        },
        quantity: {
            type: Number,
            min: 1,
            default: 1
        },
        cost: {
            type: Number,
            min: 0,
            default: 0
        }
    }],
    notes: {
        type: String,
        trim: true
    },
    attachments: [{
        name: String,
        url: String,
        type: String
    }]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// ============================================================
// 🔍 الفهارس
// ============================================================

MaintenanceSchema.index({ vesselId: 1 });
MaintenanceSchema.index({ status: 1 });
MaintenanceSchema.index({ priority: 1 });
MaintenanceSchema.index({ startDate: -1 });

// ============================================================
// 🌀 Virtuals
// ============================================================

MaintenanceSchema.virtual('duration').get(function() {
    if (!this.endDate) return null;
    const diff = this.endDate - this.startDate;
    return Math.ceil(diff / (1000 * 60 * 60 * 24)); // بالأيام
});

MaintenanceSchema.virtual('totalCost').get(function() {
    let total = this.cost || 0;
    if (this.partsUsed && this.partsUsed.length > 0) {
        total += this.partsUsed.reduce((sum, part) => {
            return sum + ((part.cost || 0) * (part.quantity || 1));
        }, 0);
    }
    return total;
});

MaintenanceSchema.virtual('isOverdue').get(function() {
    if (this.status === 'مكتملة' || this.status === 'ملغاة') return false;
    if (!this.endDate) return false;
    return this.endDate < new Date();
});

MaintenanceSchema.virtual('progress').get(function() {
    if (this.status === 'مكتملة') return 100;
    if (this.status === 'ملغاة') return 0;
    if (this.status === 'معلقة') return 0;
    if (this.status === 'قيد التنفيذ') return 50;
    return 0;
});

// ============================================================
// 🛠️ دوال النموذج (Methods)
// ============================================================

MaintenanceSchema.methods.complete = async function() {
    this.status = 'مكتملة';
    this.endDate = new Date();
    await this.save();
    return this;
};

MaintenanceSchema.methods.cancel = async function(reason) {
    this.status = 'ملغاة';
    this.notes = this.notes ? `${this.notes}\nملغاة: ${reason}` : `ملغاة: ${reason}`;
    await this.save();
    return this;
};

// ============================================================
// 📌 دوال ثابتة (Statics)
// ============================================================

MaintenanceSchema.statics.findByVessel = function(vesselId) {
    return this.find({ vesselId }).sort({ startDate: -1 });
};

MaintenanceSchema.statics.findActive = function() {
    return this.find({
        status: { $in: ['معلقة', 'قيد التنفيذ'] }
    }).sort({ priority: -1, startDate: 1 });
};

MaintenanceSchema.statics.findOverdue = function() {
    return this.find({
        status: { $in: ['معلقة', 'قيد التنفيذ'] },
        endDate: { $lt: new Date() }
    });
};

MaintenanceSchema.statics.getStats = async function() {
    return await this.aggregate([
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalCost: { $sum: '$cost' }
            }
        }
    ]);
};

MaintenanceSchema.statics.getMonthlyStats = async function(year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);
    
    return await this.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate, $lt: endDate }
            }
        },
        {
            $group: {
                _id: '$type',
                count: { $sum: 1 },
                totalCost: { $sum: '$cost' }
            }
        }
    ]);
};

// ============================================================
// 🔄 Middleware
// ============================================================

MaintenanceSchema.pre('save', async function(next) {
    // جلب اسم القطعة إذا لم يكن موجوداً
    if (!this.vesselName && this.vesselId) {
        try {
            const Vessel = mongoose.model('Vessel');
            const vessel = await Vessel.findById(this.vesselId);
            if (vessel) {
                this.vesselName = vessel.name;
            }
        } catch (error) {
            console.error('Error fetching vessel name:', error);
        }
    }
    next();
});

// ============================================================
// 🚀 تصدير النموذج
// ============================================================

module.exports = mongoose.model('Maintenance', MaintenanceSchema);
