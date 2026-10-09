// ============================================================
// 🚛 Vehicle Model — الوسائل البرية v6.2
// + 🆕 الصور + 🆕 الطرح + إصلاح الإملاء
// ============================================================

'use strict';

const mongoose = require('mongoose');

// ============================================================
// 📋 VEHICLE TYPES
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
// 📋 VEHICLE BRANDS — ✅ تصحيح الإملاء
// ============================================================
const VEHICLE_BRANDS = [
    { value: 'تويوتا',       label: '🚗 تويوتا (Toyota)' },
    { value: 'فورد',         label: '🚗 فورد (Ford)' },
    { value: 'إيفيكو',       label: '🚚 إيفيكو (Iveco)' },
    { value: 'مرسيدس',       label: '🚗 مرسيدس (Mercedes)' },
    { value: 'رينو',         label: '🚗 رينو (Renault)' },
    { value: 'بيجو',         label: '🚗 بيجو (Peugeot)' },
    { value: 'سيتروين',      label: '🚗 سيتروين (Citroën)' },      // ✅ إصلاح
    { value: 'فولكس فاجن',   label: '🚗 فولكس فاجن (Volkswagen)' }, // ✅ إصلاح
    { value: 'نيسان',        label: '🚗 نيسان (Nissan)' },
    { value: 'ميتسوبيشي',    label: '🚗 ميتسوبيشي (Mitsubishi)' },
    { value: 'هيونداي',      label: '🚗 هيونداي (Hyundai)' },
    { value: 'كيا',          label: '🚗 كيا (Kia)' },
    { value: 'شيفروليه',     label: '🚗 شيفروليه (Chevrolet)' },
    { value: 'جيب',          label: '🚙 جيب (Jeep)' },
    { value: 'سكودا',        label: '🚗 سكودا (Škoda)' },
    { value: 'فيات',         label: '🚗 فيات (Fiat)' },
    { value: 'مان',          label: '🚚 مان (MAN)' },
    { value: 'سكانيا',       label: '🚚 سكانيا (Scania)' },
    { value: 'فولفو',        label: '🚚 فولفو (Volvo)' },
    { value: 'داف',          label: '🚚 داف (DAF)' },
    { value: 'هينو',         label: '🚚 هينو (Hino)' },
    { value: 'إيسوزو',       label: '🚚 إيسوزو (Isuzu)' },         // ✅ إصلاح
    { value: 'أخرى',         label: '⚙️ أخرى' }
];
const VEHICLE_BRANDS_VALUES = VEHICLE_BRANDS.map(b => b.value);

// ============================================================
// 📋 VEHICLE COLORS
// ============================================================
const VEHICLE_COLORS = [
    { value: 'أبيض',   label: '⚪ أبيض' },
    { value: 'أسود',   label: '⚫ أسود' },
    { value: 'رمادي',  label: '🩶 رمادي' },
    { value: 'فضي',    label: '⚪ فضي' },
    { value: 'أحمر',   label: '🔴 أحمر' },
    { value: 'أزرق',   label: '🔵 أزرق' },
    { value: 'أخضر',   label: '🟢 أخضر' },
    { value: 'أصفر',   label: '🟡 أصفر' },
    { value: 'بني',    label: '🟤 بني' },
    { value: 'بيج',    label: '🟠 بيج' },
    { value: 'أخرى',   label: '⚙️ أخرى' }
];
const VEHICLE_COLORS_VALUES = VEHICLE_COLORS.map(c => c.value);

// ============================================================
// 📋 REGIONS
// ============================================================
const VEHICLE_REGIONS = [
    { value: 'إدارة إسناد الوحدات البحرية', label: '🏛️ إدارة إسناد الوحدات البحرية', group: 'الإدارات المركزية' },
    { value: 'إدارة حرس السواحل',          label: '🚢 إدارة حرس السواحل',          group: 'الإدارات المركزية' },
    { value: 'إقليم الحرس البحري بالشمال', label: '🌊 إقليم الحرس البحري بالشمال', group: 'الأقاليم البحرية' },
    { value: 'إقليم الحرس البحري بالساحل', label: '🌊 إقليم الحرس البحري بالساحل', group: 'الأقاليم البحرية' },
    { value: 'إقليم الحرس البحري بالوسط',  label: '🌊 إقليم الحرس البحري بالوسط',  group: 'الأقاليم البحرية' },
    { value: 'إقليم الحرس البحري بالجنوب', label: '🌊 إقليم الحرس البحري بالجنوب', group: 'الأقاليم البحرية' },
    { value: 'وحدة الصيانة والإسناد البحري تونس',     label: '🛠️ وحدة الصيانة تونس',     group: 'وحدات الصيانة' },
    { value: 'وحدة الصيانة والإسناد البحري صفاقس',    label: '🛠️ وحدة الصيانة صفاقس',    group: 'وحدات الصيانة' },
    { value: 'وحدة الصيانة والإسناد البحري المنستير', label: '🛠️ وحدة الصيانة المنستير', group: 'وحدات الصيانة' },
    { value: 'وحدة الصيانة والإسناد البحري جرجيس',    label: '🛠️ وحدة الصيانة جرجيس',    group: 'وحدات الصيانة' },
    { value: 'المجمع الأمني بقبيبة', label: '🏛️ المجمع الأمني بقبيبة', group: 'أخرى' }
];
const VEHICLE_REGIONS_VALUES = VEHICLE_REGIONS.map(r => r.value);

// ============================================================
// 📋 ZONES — ✅ محدَّث ومتطابق مع الواجهة
// ============================================================
const VEHICLE_ZONES = {
    // الإدارات المركزية — وحدة إدارية واحدة
    'إدارة إسناد الوحدات البحرية': ['الإدارة المركزية بتونس'],
    'إدارة حرس السواحل':          ['الإدارة المركزية بتونس'],

    // الأقاليم البحرية — مناطق كاملة
    'إقليم الحرس البحري بالشمال': [
        'تونس', 'بنزرت', 'طبرقة', 'منزل بورقيبة',
        'غار الملح', 'رأس الجبل', 'منزل تميم', 'قليبية',
        'الحمامات', 'سجنان'
    ],
    'إقليم الحرس البحري بالساحل': [
        'سوسة', 'المنستير', 'نابل', 'حمامات',
        'المهدية', 'قصر هلال', 'هرقلة', 'شربان',
        'المكنين', 'جمال'
    ],
    'إقليم الحرس البحري بالوسط': [
        'صفاقس', 'قرقنة', 'المهدية', 'الشابة',
        'سيدي بوزيد', 'الوردانين', 'المزونة', 'جبنيانة',
        'العامرة', 'ماطر'
    ],
    'إقليم الحرس البحري بالجنوب': [
        'جرجيس', 'جربة', 'قابس', 'بن قردان',
        'مدنين', 'زازيس', 'حومة السوق', 'أجيم',
        'ميدون', 'مارث'
    ],

    // وحدات الصيانة
    'وحدة الصيانة والإسناد البحري تونس': [
        'تونس', 'أريانة', 'بن عروس', 'منوبة'
    ],
    'وحدة الصيانة والإسناد البحري صفاقس': [
        'صفاقس', 'قرقنة', 'سيدي بوزيد'
    ],
    'وحدة الصيانة والإسناد البحري المنستير': [
        'المنستير', 'سوسة', 'المهدية'
    ],
    'وحدة الصيانة والإسناد البحري جرجيس': [
        'جرجيس', 'جربة', 'بن قردان', 'زازيس'
    ],

    // المجمعات الأمنية
    'المجمع الأمني بقبيبة': ['قبيبة "صفاقس"', 'قبيبة', 'تونس', 'بنزرت']
};

// ✅ قائمة شاملة لكل المناطق (للفلترة والتحقق)
const VEHICLE_ZONES_ALL = [
    'الإدارة المركزية بتونس',
    'تونس', 'بنزرت', 'طبرقة', 'منزل بورقيبة',
    'غار الملح', 'رأس الجبل', 'منزل تميم', 'قليبية',
    'الحمامات', 'سجنان',
    'سوسة', 'المنستير', 'نابل', 'حمامات',
    'المهدية', 'قصر هلال', 'هرقلة', 'شربان',
    'المكنين', 'جمال',
    'صفاقس', 'قرقنة', 'الشابة',
    'سيدي بوزيد', 'الوردانين', 'المزونة', 'جبنيانة',
    'العامرة', 'ماطر',
    'جرجيس', 'جربة', 'قابس', 'بن قردان',
    'مدنين', 'زازيس', 'حومة السوق', 'أجيم',
    'ميدون', 'مارث',
    'أريانة', 'بن عروس', 'منوبة',
    'قبيبة "صفاقس"', 'قبيبة'
];

// ============================================================
// 📋 STATUS
// ============================================================
const VEHICLE_STATUS = [
    { value: 'صالحة', label: '✅ صالحة' },
    { value: 'معطبة', label: '🔴 معطبة' },
    { value: 'صيانة', label: '🔧 صيانة' },
    { value: 'طرح',   label: '⚫ طرح (سحب نهائي)' }
];
const VEHICLE_STATUS_VALUES = VEHICLE_STATUS.map(s => s.value);

// ============================================================
// 📋 CONDITIONS
// ============================================================
const VEHICLE_CONDITIONS = [
    { value: 'جديدة',  label: '✨ جديدة' },
    { value: 'متوسطة', label: '⚖️ متوسطة' },
    { value: 'قديمة',  label: '⏳ قديمة' }
];
const VEHICLE_CONDITIONS_VALUES = VEHICLE_CONDITIONS.map(c => c.value);

// ============================================================
// 🖼️ IMAGE SUB-SCHEMA
// ============================================================
const vehicleImageSchema = new mongoose.Schema({
    filename:     { type: String, default: '' },
    originalName: { type: String, default: '' },
    url:          { type: String, required: true },
    size:         { type: Number, default: 0 },
    mimetype:     { type: String, default: '' },
    caption:      { type: String, default: '', maxlength: 200 },
    isPrimary:    { type: Boolean, default: false },
    source:       { type: String, enum: ['upload', 'camera'], default: 'upload' },
    uploadedAt:   { type: Date, default: Date.now },
    uploadedBy:   { type: String, default: 'system' }
}, { _id: true });

// ============================================================
// 📋 MAIN SCHEMA
// ============================================================
const vehicleSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, sparse: true, index: true },
    name: { type: String, trim: true, default: '', maxlength: 200 },
    plateNumber: {
        type: String, trim: true,
        required: [true, 'رقم الوسيلة مطلوب'],
        unique: true, index: true, maxlength: 50
    },
    type: {
        type: String,
        enum: { values: VEHICLE_TYPES_VALUES, message: 'نوع غير صالح: {VALUE}' },
        default: 'سيارة', required: true, index: true
    },
    brand: { type: String, trim: true, default: '', index: true, maxlength: 50 },
    model: { type: String, trim: true, default: '', maxlength: 100 },
    year:  { type: Number, default: null, min: 1900, max: 2100 },
    color: { type: String, trim: true, default: '', maxlength: 50 },
    region: {
        type: String,
        enum: { values: VEHICLE_REGIONS_VALUES, message: 'إدارة / إقليم غير صالح: {VALUE}' },
        default: 'إقليم الحرس البحري بالشمال',
        required: [true, 'الإدارة / الإقليم مطلوب'],
        index: true
    },
    zone: {
        type: String, trim: true, default: '',
        // ✅ لم يعد required — الإدارات المركزية لا تحتاج منطقة
        index: true, maxlength: 100
    },
    status: {
        type: String,
        enum: { values: VEHICLE_STATUS_VALUES, message: 'حالة غير صالحة: {VALUE}' },
        default: 'صالحة', required: true, index: true
    },
    workCondition: {
        type: String,
        enum: { values: VEHICLE_CONDITIONS_VALUES, message: 'حالة عمل غير صالحة: {VALUE}' },
        default: 'جديدة', required: true
    },
    appointmentDate: { type: String, default: null },
    faultDate: { type: String, default: null },
    notes: { type: String, trim: true, default: '', maxlength: 1000 },

    // 🆕 حقول الطرح
    disposalDate:     { type: Date, default: null },
    disposalReason:   { type: String, trim: true, default: '', maxlength: 1000 },
    disposalDecision: { type: String, trim: true, default: '', maxlength: 100 },
    disposedBy:       { type: String, trim: true, default: '', maxlength: 100 },
    disposalNotes:    { type: String, trim: true, default: '', maxlength: 1000 },
    disposedAt:       { type: Date, default: null },

    // 🆕 الصور
    images: [vehicleImageSchema],

    createdBy: { type: String, default: 'system' }
}, {
    timestamps: true, versionKey: false, collection: 'vehicles'
});

vehicleSchema.index({ status: 1, type: 1 });
vehicleSchema.index({ region: 1, zone: 1 });
vehicleSchema.index({ brand: 1, model: 1 });
vehicleSchema.index({ createdAt: -1 });
vehicleSchema.index({ disposedAt: -1 });
vehicleSchema.index({ status: 1, disposedAt: -1 });

// ============================================================
// 🎯 VIRTUALS
// ============================================================
vehicleSchema.virtual('isOperational').get(function() { return this.status === 'صالحة'; });
vehicleSchema.virtual('isDisposed').get(function() { return this.status === 'طرح'; });
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
vehicleSchema.virtual('fullName').get(function() {
    const parts = [];
    if (this.brand) parts.push(this.brand);
    if (this.model) parts.push(this.model);
    if (this.year) parts.push('(' + this.year + ')');
    return parts.join(' ') || this.type;
});
vehicleSchema.virtual('primaryImage').get(function() {
    if (!this.images || this.images.length === 0) return null;
    return this.images.find(i => i.isPrimary) || this.images[0];
});
vehicleSchema.virtual('imagesCount').get(function() {
    return (this.images || []).length;
});

// ============================================================
// ✅ PRE-VALIDATE HOOK — التحقق من المنطقة حسب الإقليم
// ============================================================
vehicleSchema.pre('validate', function(next) {
    // إذا كانت منطقة فارغة، لا مشكلة (مثلاً: إدارة مركزية)
    if (!this.zone || !String(this.zone).trim()) {
        // امسح القيمة لتكون string فارغة
        this.zone = '';
        return next();
    }

    // إذا كانت المنطقة موجودة، تحقق من أنها تابعة للإقليم
    const allowedZones = VEHICLE_ZONES[this.region] || [];
    const zoneTrimmed = String(this.zone).trim();

    if (allowedZones.length > 0 && allowedZones.indexOf(zoneTrimmed) === -1) {
        // اسمح بأي منطقة إذا كانت في القائمة العامة (مرونة)
        if (VEHICLE_ZONES_ALL.indexOf(zoneTrimmed) === -1) {
            return next(new Error(
                `المنطقة "${zoneTrimmed}" لا تتبع "${this.region}"`
            ));
        }
    }

    next();
});

// ============================================================
// ⚙️ METHODS — الطرح
// ============================================================
vehicleSchema.methods.dispose = function({ reason, decision, disposedBy, notes, date } = {}) {
    if (!reason || !String(reason).trim()) {
        throw new Error('سبب الطرح مطلوب');
    }
    this.status = 'طرح';
    this.disposalReason = String(reason).trim();
    this.disposalDecision = decision ? String(decision).trim() : '';
    this.disposedBy = disposedBy ? String(disposedBy).trim() : '';
    this.disposalNotes = notes ? String(notes).trim() : '';
    this.disposalDate = date ? new Date(date) : new Date();
    this.disposedAt = new Date();
    return this;
};

vehicleSchema.methods.restore = function({ newStatus } = {}) {
    const allowed = ['صالحة', 'صيانة', 'معطبة'];
    const target = allowed.includes(newStatus) ? newStatus : 'صيانة';

    this.status = target;
    this.disposalReason = '';
    this.disposalDecision = '';
    this.disposedBy = '';
    this.disposalNotes = '';
    this.disposalDate = null;
    this.disposedAt = null;
    return this;
};

// ============================================================
// 🖼️ METHODS — الصور
// ============================================================
vehicleSchema.methods.removeImage = function(imageId) {
    const img = this.images.id(imageId);
    if (!img) return false;
    const wasPrimary = img.isPrimary;
    img.deleteOne();
    if (wasPrimary && this.images.length > 0) {
        this.images[0].isPrimary = true;
    }
    return true;
};

vehicleSchema.methods.setPrimaryImage = function(imageId) {
    this.images.forEach(img => {
        img.isPrimary = img._id.toString() === imageId.toString();
    });
    return this;
};

vehicleSchema.methods.getPrimaryImage = function() {
    if (!this.images || this.images.length === 0) return null;
    return this.images.find(i => i.isPrimary) || this.images[0];
};

// ============================================================
// 📤 EXPORT
// ============================================================
const Vehicle = mongoose.model('Vehicle', vehicleSchema);

module.exports = Vehicle;
module.exports.VEHICLE_TYPES = VEHICLE_TYPES;
module.exports.VEHICLE_TYPES_VALUES = VEHICLE_TYPES_VALUES;
module.exports.VEHICLE_BRANDS = VEHICLE_BRANDS;
module.exports.VEHICLE_BRANDS_VALUES = VEHICLE_BRANDS_VALUES;
module.exports.VEHICLE_COLORS = VEHICLE_COLORS;
module.exports.VEHICLE_COLORS_VALUES = VEHICLE_COLORS_VALUES;
module.exports.VEHICLE_REGIONS = VEHICLE_REGIONS;
module.exports.VEHICLE_REGIONS_VALUES = VEHICLE_REGIONS_VALUES;
module.exports.VEHICLE_ZONES = VEHICLE_ZONES;
module.exports.VEHICLE_ZONES_ALL = VEHICLE_ZONES_ALL;
module.exports.VEHICLE_STATUS = VEHICLE_STATUS;
module.exports.VEHICLE_STATUS_VALUES = VEHICLE_STATUS_VALUES;
module.exports.VEHICLE_CONDITIONS = VEHICLE_CONDITIONS;
module.exports.VEHICLE_CONDITIONS_VALUES = VEHICLE_CONDITIONS_VALUES;
