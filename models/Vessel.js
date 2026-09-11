/**
 * 🚢 نموذج الوسيلة البحرية — v2.0
 * @module models/Vessel
 * 
 * ✨ v2.0: توافق كامل مع server.js v9.11
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const VesselSchema = new mongoose.Schema({
    // 🆔 المعرفات
    id: {
        type: String,
        default: uuidv4,
        unique: true,
        index: true
    },
    
    // 🚢 بيانات أساسية
    name: {
        type: String,
        required: [true, 'اسم الوسيلة مطلوب'],
        trim: true,
        minlength: [2, 'الاسم يجب أن يكون حرفين على الأقل'],
        maxlength: [100, 'الاسم يجب أن يكون 100 حرف كحد أقصى']
    },
    num: {
        type: String,
        default: '',
        trim: true
    },
    len: {
        type: Number,
        default: 0
    },
    
    // 🌍 الموقع الجغرافي
    region: { type: String, default: '' },
    zone: { type: String, default: '' },
    port: { type: String, default: '' },
    
    // 📋 الحالة التشغيلية
    status: {
        type: String,
        default: 'صالح',
        // ✅ يقبل كل القيم العربية المستخدمة في server.js
        enum: ['صالح', 'معطب', 'صيانة', 'احتياط', 'نشط', 'غير نشط'],
        trim: true
    },
    break: {
        type: String,
        default: ''
    },
    cat: {
        type: String,
        default: ''
    },
    supp: {
        type: String,
        default: ''
    },
    
    // 📅 تواريخ
    fDate: {
        type: String,
        default: null
    },
    eDate: {
        type: String,
        default: null
    },
    ref: {
        type: String,
        default: ''
    },
    repairUnit: {
        type: String,
        default: ''
    },
    
    // 📦 حقول اختيارية (للتوافق مع النسخة القديمة)
    type: {
        type: String,
        default: '',
        trim: true
    },
    location: {
        type: String,
        default: '',
        trim: true
    },
    
    // 🔧 سجل الصيانة
    maintenanceHistory: [{
        date: { type: Date, default: Date.now },
        type: { type: String },
        description: { type: String },
        cost: { type: Number, default: 0 },
        performedBy: { type: String }
    }],
    
    // 👤 من أنشأ
    createdBy: {
        type: String,
        default: 'system'
    },
    
    // ⏰ طوابع زمنية
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    strict: false  // ⚠️ مهم: يسمح بحقول غير معرّفة (لتفادي الأخطاء)
});

// ✅ تحديث updatedAt تلقائيًا
VesselSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// ✅ Statics
VesselSchema.statics.findActive = function() {
    return this.find({ status: 'صالح' });
};

VesselSchema.statics.findByStatus = function(status) {
    return this.find({ status });
};

// ✅ Methods
VesselSchema.methods.addMaintenance = async function(maintenanceData) {
    this.maintenanceHistory.push({
        ...maintenanceData,
        date: new Date()
    });
    await this.save();
    return this;
};

VesselSchema.methods.changeStatus = async function(newStatus) {
    this.status = newStatus;
    await this.save();
    return this;
};

const Vessel = mongoose.model('Vessel', VesselSchema);

module.exports = Vessel;
