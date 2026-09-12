// ============================================================
// 🔧 models/Maintenance.js - v2.1
// ============================================================

const mongoose = require('mongoose');

const MaintenanceSchema = new mongoose.Schema({
    id: {
        type: String
    },
    vesselId: {
        type: String,
        default: ''
    },
    vesselName: {
        type: String,
        trim: true,
        default: '—'
    },
    vesselNum: {
        type: String,
        default: ''
    },
    type: {
        type: String,
        required: [true, 'نوع الصيانة مطلوب'],
        default: 'صيانة دورية',
        trim: true
    },
    priority: {
        type: String,
        default: 'متوسط',
        trim: true
    },
    description: {
        type: String,
        default: '',
        trim: true
    },
    date: {
        type: String,
        default: null
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: {
            values: [
                'معلقة', 'قيد التنفيذ', 'مكتملة', 'ملغاة', 'متأخرة',
                'pending', 'in-progress', 'completed', 'cancelled', 'overdue',
                'قيد الانتظار', 'قيد الإنجاز'
            ],
            message: 'حالة غير صالحة'
        },
        default: 'قيد الانتظار'
    },
    repairUnit: {
        type: String,
        default: '—',
        trim: true
    },
    cost: {
        type: Number,
        min: 0,
        default: 0
    },
    contractor: {
        type: String,
        default: '',
        trim: true
    },
    supervisor: {
        type: String,
        default: null
    },
    supervisorName: {
        type: String,
        default: '',
        trim: true
    },
    partsUsed: [{
        partName: { type: String, required: true },
        quantity: { type: Number, min: 1, default: 1 },
        cost: { type: Number, min: 0, default: 0 }
    }],
    notes: {
        type: String,
        default: '',
        trim: true
    },
    attachments: [{
        name: String,
        url: String,
        type: String
    }],
    createdBy: {
        type: String,
        default: 'system'
    },
    updatedBy: {
        type: String,
        default: null
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

MaintenanceSchema.index({ id: 1 });
MaintenanceSchema.index({ vesselId: 1 });
MaintenanceSchema.index({ status: 1 });
MaintenanceSchema.index({ priority: 1 });
MaintenanceSchema.index({ startDate: -1 });
MaintenanceSchema.index({ createdAt: -1 });

MaintenanceSchema.virtual('duration').get(function() {
    if (!this.endDate) return null;
    const diff = this.endDate - this.startDate;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
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
    if (this.status === 'قيد التنفيذ' || this.status === 'قيد الإنجاز') return 50;
    return 0;
});

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

MaintenanceSchema.statics.findByVessel = function(vesselId) {
    return this.find({ vesselId }).sort({ startDate: -1 });
};

MaintenanceSchema.statics.findActive = function() {
    return this.find({
        status: { $in: ['معلقة', 'قيد التنفيذ', 'قيد الانتظار', 'قيد الإنجاز'] }
    }).sort({ priority: -1, startDate: 1 });
};

MaintenanceSchema.statics.findOverdue = function() {
    return this.find({
        status: { $in: ['معلقة', 'قيد التنفيذ', 'قيد الانتظار', 'قيد الإنجاز'] },
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

MaintenanceSchema.pre('save', async function(next) {
    if (!this.vesselName || this.vesselName === '—') {
        if (this.vesselId) {
            try {
                const Vessel = mongoose.model('Vessel');
                const vessel = await Vessel.findOne({ id: this.vesselId });
                if (vessel) {
                    this.vesselName = vessel.name;
                    this.vesselNum = vessel.num || this.vesselNum;
                }
            } catch (error) {
                console.error('Error fetching vessel name:', error);
            }
        }
    }
    next();
});

module.exports = mongoose.model('Maintenance', MaintenanceSchema);
