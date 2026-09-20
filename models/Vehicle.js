// ============================================================
// 🚛 Vehicle Model — الوسائل البرية v1.0
// مصدر واحد للحقيقة (Single Source of Truth)
// ============================================================

'use strict';

const mongoose = require('mongoose');

// ============================================================
// 📋 VEHICLE TYPES — القائمة الموحدة
// ============================================================
const VEHICLE_TYPES = [
    { value: 'سيارة',           label: '🚗 سيارة',                   icon: 'car' },
    { value: 'كواد',            label: '🛺 كواد (دراجة رباعية)',     icon: 'motorcycle' },
    { value: 'شاحنة',           label: '🚚 شاحنة',                   icon: 'truck' },
    { value: 'شاحنة صهريج',     label: '🚛 شاحنة صهريج',             icon: 'truck-moving' },
    { value: 'حافلة',           label: '🚌 حافلة',                   icon: 'bus' },
    { value: 'بيك أب',          label: '🛻 بيك أب',                  icon: 'truck-pickup' },
    { value: 'فان',             label: '🚐 فان',                     icon: 'shuttle-van' },
    { value: 'جيب',             label: '🚙 جيب (4x4)',               icon: 'car-side' },
    { value: 'دراجة',           label: '🏍️ دراجة',                   icon: 'motorcycle' },
    { value: 'مدرعة',           label: '🛡️ مدرعة',                   icon: 'shield-halved' },
    { value: 'إسعاف',           label: '🚑 إسعاف',                   icon: 'truck-medical' },
    { value: 'إطفاء',           label: '🚒 إطفاء',                   icon: 'fire-extinguisher' },
    { value: 'رافعة',           label: '🏗️ رافعة',                   icon: 'arrow-up-from-ground-water' },
    { value: 'جرافة',           label: '🚜 جرافة',                   icon: 'tractor' },
    { value: 'أخرى',            label: '⚙️ أخرى',                    icon: 'gear' }
];

const VEHICLE_TYPES_VALUES = VEHICLE_TYPES.map(t => t.value);

// ============================================================
// 📋 STATUS
// ============================================================
const VEHICLE_STATUS = [
    { value: 'صالحة', label: '✅ صالحة', color: 'green' },
    { value: 'معطبة', label: '🔴 معطبة', color: 'red' },
    { value: 'صيانة', label: '🔧 صيانة', color: 'orange' }
];

const VEHICLE_STATUS_VALUES = VEHICLE_STATUS.map(s => s.value);

// ============================================================
// 📋 WORK CONDITION
// ============================================================
const VEHICLE_CONDITIONS = [
    { value: 'جديدة',  label: '✨ جديدة' },
    { value: 'متوسطة', label: '⚖️ متوسطة' },
    { value: 'قديمة',  label: '⏳ قديمة' }
];

const VEHICLE_CONDITIONS_VALUES = VEHICLE_CONDITIONS.map(c => c.value);

// ============================================================
// 📋 SCHEMA
// ============================================================
const vehicleSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        unique: true,
        sparse: true,
        index: true
    },
    name: {
        type: String,
        trim: true,
        default: '',
        maxlength: 200
    },
    plateNumber: {
        type: String,
        trim: true,
        required: [true, 'رقم الوسيلة مطلوب'],
        unique: true,
        index: true,
        maxlength: 50
    },
    type: {
        type: String,
        enum: {
            values: VEHICLE_TYPES_VALUES,
            message: 'نوع غير صالح: {VALUE}'
        },
        default: 'سيارة',
        required: true,
        index: true
    },
    region: {
        type: String,
        trim: true,
        default: '',
        index: true
    },
    status: {
        type: String,
        enum: {
            values: VEHICLE_STATUS_VALUES,
            message: 'حالة غير صالحة: {VALUE}'
        },
        default: 'صالحة',
        index: true
    },
    workCondition: {
        type: String,
        enum: {
            values: VEHICLE_CONDITIONS_VALUES,
            message: 'حالة عمل غير صالحة: {VALUE}'
        },
        default: 'جديدة'
    },
    appointmentDate: {
        type: String,
        default: null
    },
    notes: {
        type: String,
        trim: true,
        default: '',
        maxlength: 1000
    },
    createdBy: {
        type: String,
        default: 'system'
    }
}, {
    timestamps: true,
    versionKey: false,
    collection: 'vehicles'
});

// Compound indexes للأداء
vehicleSchema.index({ status: 1, type: 1 });
vehicleSchema.index({ region: 1, status: 1 });
vehicleSchema.index({ createdAt: -1 });

// ============================================================
// 🎯 VIRTUALS
// ============================================================
vehicleSchema.virtual('isOperational').get(function() {
    return this.status === 'صالحة';
});

vehicleSchema.virtual('typeLabel').get(function() {
    const t = VEHICLE_TYPES.find(x => x.value === this.type);
    return t ? t.label : this.type;
});

// ============================================================
// 📤 EXPORT
// ============================================================
const Vehicle = mongoose.model('Vehicle', vehicleSchema);

module.exports = Vehicle;
module.exports.VEHICLE_TYPES = VEHICLE_TYPES;
module.exports.VEHICLE_TYPES_VALUES = VEHICLE_TYPES_VALUES;
module.exports.VEHICLE_STATUS = VEHICLE_STATUS;
module.exports.VEHICLE_STATUS_VALUES = VEHICLE_STATUS_VALUES;
module.exports.VEHICLE_CONDITIONS = VEHICLE_CONDITIONS;
module.exports.VEHICLE_CONDITIONS_VALUES = VEHICLE_CONDITIONS_VALUES;
