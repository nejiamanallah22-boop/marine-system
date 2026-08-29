/**
 * 🚢 نموذج الوسيلة البحرية
 * @module models/Vessel
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * مخطط الوسيلة
 */
const VesselSchema = new mongoose.Schema({
    id: {
        type: String,
        default: uuidv4,
        unique: true,
        index: true
    },
    name: {
        type: String,
        required: [true, 'اسم الوسيلة مطلوب'],
        trim: true,
        minlength: [2, 'الاسم يجب أن يكون حرفين على الأقل'],
        maxlength: [100, 'الاسم يجب أن يكون 100 حرف كحد أقصى']
    },
    type: {
        type: String,
        required: [true, 'نوع الوسيلة مطلوب'],
        trim: true,
        enum: ['زورق دورية', 'سفينة إنزال', 'زورق إنقاذ', 'سفينة دعم', 'زورق استطلاع', 'أخرى']
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'maintenance', 'reserve'],
        default: 'active'
    },
    location: {
        type: String,
        required: [true, 'الموقع مطلوب'],
        trim: true
    },
    specifications: {
        length: { type: Number, default: null },
        width: { type: Number, default: null },
        draft: { type: Number, default: null },
        speed: { type: Number, default: null },
        capacity: { type: Number, default: null }
    },
    maintenanceHistory: [{
        date: { type: Date, default: Date.now },
        type: { type: String, enum: ['routine', 'emergency', 'preventive', 'overhaul'] },
        description: { type: String, required: true },
        cost: { type: Number, default: 0 },
        performedBy: { type: String }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    createdBy: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

/**
 * تحديث وقت التعديل
 */
VesselSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

/**
 * الحصول على الوسائل النشطة
 * @returns {Query} - استعلام الوسائل النشطة
 */
VesselSchema.statics.findActive = function() {
    return this.find({ status: 'active' });
};

/**
 * الحصول على الوسائل حسب النوع
 * @param {string} type - نوع الوسيلة
 * @returns {Query} - استعلام الوسائل حسب النوع
 */
VesselSchema.statics.findByType = function(type) {
    return this.find({ type: type });
};

/**
 * إضافة سجل صيانة
 * @param {Object} maintenanceData - بيانات الصيانة
 * @returns {Promise<Vessel>} - الوسيلة المحدثة
 */
VesselSchema.methods.addMaintenance = async function(maintenanceData) {
    this.maintenanceHistory.push({
        ...maintenanceData,
        date: new Date()
    });
    await this.save();
    return this;
};

/**
 * تغيير حالة الوسيلة
 * @param {string} newStatus - الحالة الجديدة
 * @returns {Promise<Vessel>} - الوسيلة المحدثة
 */
VesselSchema.methods.changeStatus = async function(newStatus) {
    this.status = newStatus;
    await this.save();
    return this;
};

const Vessel = mongoose.model('Vessel', VesselSchema);

module.exports = Vessel;
