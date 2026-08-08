const mongoose = require('mongoose');

const maintenanceSchema = new mongoose.Schema({
    vesselId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Vessel',
        required: true 
    },
    type: {
        type: String,
        enum: ['مجدولة', 'طارئة', 'دورية', 'إصلاح'],
        required: true
    },
    priority: {
        type: String,
        enum: ['منخفض', 'متوسط', 'عالي', 'حرج'],
        default: 'متوسط'
    },
    description: String,
    startDate: Date,
    endDate: Date,
    status: {
        type: String,
        enum: ['معلقة', 'قيد التنفيذ', 'مكتملة', 'ملغاة'],
        default: 'معلقة'
    },
    cost: Number,
    contractor: String,
    supervisor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    partsUsed: [{
        partName: String,
        quantity: Number,
        cost: Number
    }],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Maintenance', maintenanceSchema);
