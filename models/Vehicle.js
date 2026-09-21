// ============================================================
// 🚛 Vehicle Model — الوسائل البرية v3.1
// إقليم + منطقة + تاريخ العطب
// ============================================================

'use strict';

const mongoose = require('mongoose');

// ============================================================
// 📋 VEHICLE TYPES — الأنواع
// ============================================================
const VEHICLE_TYPES = [
    { value: 'سيارة',           label: '🚗 سيارة' },
    { value: 'كواد',            label: '🛺 كواد (دراجة رباعية)' },
    { value: 'شاحنة',           label: '🚚 شاحنة' },
    { value: 'شاحنة صهريج',     label: '🚛 شاحنة صهريج' },
    { value: 'حافلة',           label: '🚌 حافلة' },
    { value: 'بيك أب',          label: '🛻 بيك أب' },
    { value: 'فان',             label: '🚐 فان' },
    { value: 'جيب',             label: '🚙 جيب (4x4)' },
    { value: 'دراجة',           label: '🏍️ دراجة' },
    { value: 'مدرعة',           label: '🛡️ مدرعة' },
    { value: 'إسعاف',           label: '🚑 إسعاف' },
    { value: 'إطفاء',           label: '🚒 إطفاء' },
    { value: 'رافعة',           label: '🏗️ رافعة' },
    { value: 'جرافة',           label: '🚜 جرافة' },
    { value: 'أخرى',            label: '⚙️ أخرى' }
];

const VEHICLE_TYPES_VALUES = VEHICLE_TYPES.map(t => t.value);

// ============================================================
// 📋 REGIONS — الأقاليم والإدارات (نفس تسميات fleet.html)
// ============================================================
const VEHICLE_REGIONS = [
    // 🌊 الأقاليم البحرية الأربعة
    { value: 'الشمال', label: '🗺️ الحرس البحري بالشمال', group: 'الأقاليم البحرية' },
    { value: 'الساحل', label: '🗺️ الحرس البحري بالساحل', group: 'الأقاليم البحرية' },
    { value: 'الوسط',  label: '🗺️ الحرس البحري بالوسط',  group: 'الأقاليم البحرية' },
    { value: 'الجنوب', label: '🗺️ الحرس البحري بالجنوب', group: 'الأقاليم البحرية' },

    // 🏛️ الإدارة المركزية
    { value: 'إدارة إسناد الوحدات البحرية', label: '🏛️ إدارة إسناد الوحدات البحرية', group: 'الإدارة المركزية' },
    { value: 'إدارة حرس السواحل',          label: '🚢 إدارة حرس السواحل',          group: 'الإدارة المركزية' },

    // 🛠️ وحدات الصيانة والإسناد
    { value: 'وحدة الصيانة والإسناد البحري تونس',     label: '🛠️ وحدة الصيانة تونس',     group: 'وحدات الصيانة والإسناد' },
    { value: 'وحدة الصيانة والإسناد البحري صفاقس',    label: '🛠️ وحدة الصيانة صفاقس',    group: 'وحدات الصيانة والإسناد' },
    { value: 'وحدة الصيانة والإسناد البحري المنستير', label: '🛠️ وحدة الصيانة المنستير', group: 'وحدات الصيانة والإسناد' },
    { value: 'وحدة الصيانة والإسناد البحري جرجيس',    label: '🛠️ وحدة الصيانة جرجيس',    group: 'وحدات الصيانة والإسناد' },

    // 🏛️ أخرى
    { value: 'المجمع الأمني بقبيبة', label: '🏛️ المجمع الأمني بقبيبة', group: 'أخرى' }
];

const VEHICLE_REGIONS_VALUES = VEHICLE_REGIONS.map(r => r.value);

// ============================================================
// 📋 ZONES — المناطق التابعة
// ============================================================
const VEHICLE_ZONES = {
    'الشمال': ['تونس', 'بنزرت', 'طبرقة'],
    'الساحل': ['سوسة', 'المنستير', 'نابل'],
    'الوسط':  ['صفاقس', 'المهدية', 'قرقنة'],
    'الجنوب': ['جرجيس', 'جربة', 'قابس'],

    'إدارة إسناد الوحدات البحرية': ['تونس'],
    'إدارة حرس السواحل':          ['تونس'],

    'وحدة الصيانة والإسناد البحري تونس':     ['تونس'],
    'وحدة الصيانة والإسناد البحري صفاقس':    ['صفاقس'],
    'وحدة الصيانة والإسناد البحري المنستير': ['المنستير'],
    'وحدة الصيانة والإسناد البحري جرجيس':    ['جرجيس'],

    'المجمع الأمني بقبيبة': ['قبيبة']
};

const VEHICLE_ZONES_ALL = [
    'تونس', 'بنزرت', 'طبرقة',
    'سوسة', 'المنستير', 'نابل',
    'صفاقس', 'المهدية', 'قرقنة',
    'جرجيس', 'جربة', 'قابس',
    'قبيبة'
];

// ============================================================
// 📋 STATUS
// ============================================================
const VEHICLE_STATUS = [
    { value: 'صالحة', label: '✅ صالحة' },
    { value: 'معطبة', label: '🔴 معطبة' },
    { value: 'صيانة', label: '🔧 صيانة' }
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
        enum: {
            values: VEHICLE_REGIONS_VALUES,
            message: 'إقليم غير صالح: {VALUE}'
        },
        default: 'الشمال',
        required: [true, 'الإقليم / الإدارة مطلوب'],
        index: true
    },
    zone: {
        type: String,
        trim: true,
        default: '',
        required: [true, 'المنطقة مطلوبة'],
        index: true,
        maxlength: 100
    },
    status: {
        type: String,
        enum: {
            values: VEHICLE_STATUS_VALUES,
            message: 'حالة غير صالحة: {VALUE}'
        },
        default: 'صالحة',
        required: true,
        index: true
    },
    workCondition: {
        type: String,
        enum: {
            values: VEHICLE_CONDITIONS_VALUES,
            message: 'حالة عمل غير صالحة: {VALUE}'
        },
        default: 'جديدة',
        required: true
    },
    appointmentDate: {
        type: String,
        default: null
    },
    // ✅ تاريخ العطب — يظهر فقط عند الحالة "معطبة"
    faultDate: {
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

vehicleSchema.index({ status: 1, type: 1 });
vehicleSchema.index({ region: 1, zone: 1 });
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

vehicleSchema.virtual('regionLabel').get(function() {
    const r = VEHICLE_REGIONS.find(x => x.value === this.region);
    return r ? r.label : this.region;
});

vehicleSchema.virtual('statusLabel').get(function() {
    const s = VEHICLE_STATUS.find(x => x.value === this.status);
    return s ? s.label : this.status;
});

// ============================================================
// 📤 EXPORT
// ============================================================
const Vehicle = mongoose.model('Vehicle', vehicleSchema);

module.exports = Vehicle;
module.exports.VEHICLE_TYPES = VEHICLE_TYPES;
module.exports.VEHICLE_TYPES_VALUES = VEHICLE_TYPES_VALUES;
module.exports.VEHICLE_REGIONS = VEHICLE_REGIONS;
module.exports.VEHICLE_REGIONS_VALUES = VEHICLE_REGIONS_VALUES;
module.exports.VEHICLE_ZONES = VEHICLE_ZONES;
module.exports.VEHICLE_ZONES_ALL = VEHICLE_ZONES_ALL;
module.exports.VEHICLE_STATUS = VEHICLE_STATUS;
module.exports.VEHICLE_STATUS_VALUES = VEHICLE_STATUS_VALUES;
module.exports.VEHICLE_CONDITIONS = VEHICLE_CONDITIONS;
module.exports.VEHICLE_CONDITIONS_VALUES = VEHICLE_CONDITIONS_VALUES;
