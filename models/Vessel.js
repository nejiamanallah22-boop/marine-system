/**
 * 🚢 نموذج الوسيلة البحرية — v2.2
 * @module models/Vessel
 * @description متوافق 100% مع server.js v11.1 — يدعم الطرح
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const VesselSchema = new mongoose.Schema({
    id: {
        type: String,
        default: uuidv4,
        unique: true
    },

    // ============================================================
    // 📋 المعلومات الأساسية
    // ============================================================
    name: {
        type: String,
        required: [true, 'اسم الوسيلة مطلوب'],
        trim: true,
        minlength: [2, 'الاسم يجب أن يكون حرفين على الأقل'],
        maxlength: [100, 'الاسم يجب أن يكون 100 حرف كحد أقصى']
    },
    num: { type: String, default: '', trim: true },
    len: { type: Number, default: 0 },
    region: { type: String, default: '' },
    zone: { type: String, default: '' },
    port: { type: String, default: '' },
    cat: { type: String, default: '' },
    supp: { type: String, default: '' },
    ref: { type: String, default: '' },
    type: { type: String, default: '', trim: true },
    location: { type: String, default: '', trim: true },

    // ============================================================
    // 📊 الحالة
    // ============================================================
    status: {
        type: String,
        default: 'صالح',
        enum: [
            'صالح',           // ✅ يعمل
            'معطب',           // 🔴 معطل مؤقتاً
            'صيانة',          // 🟡 قيد الصيانة
            'طرح',            // ⚫ مطرح (مسحوب نهائياً) — ✅ جديد
            'احتياط',         // احتياط
            'نشط',            // إنجليزي
            'غير نشط',        // إنجليزي
            'active',         // إنجليزي
            'inactive',       // إنجليزي
            'maintenance',    // إنجليزي
            'reserve'         // إنجليزي
        ],
        trim: true
    },
    stat: {
        type: String,
        default: 'صالح'
    },

    // ============================================================
    // 🔧 معلومات الأعطال والصيانة
    // ============================================================
    break: { type: String, default: '' },
    fDate: { type: String, default: null },
    eDate: { type: String, default: null },
    repairUnit: { type: String, default: '' },

    // ============================================================
    // ⚫ حقول الطرح — v2.2
    // ============================================================
    disposalDate: {
        type: Date,
        default: null
    },
    disposalReason: {
        type: String,
        default: '',
        maxlength: 1000
    },
    disposalDecision: {
        type: String,
        default: '',
        maxlength: 200
    },
    disposedBy: {
        type: String,
        default: '',
        maxlength: 200
    },
    disposalNotes: {
        type: String,
        default: '',
        maxlength: 2000
    },

    // ============================================================
    // 🔧 سجل الصيانة
    // ============================================================
    maintenanceHistory: [{
        date: { type: Date, default: Date.now },
        type: { type: String },
        description: { type: String },
        cost: { type: Number, default: 0 },
        performedBy: { type: String }
    }],

    // ============================================================
    // 📊 التتبع
    // ============================================================
    createdBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }

}, {
    timestamps: true,
    strict: false
});

// ============================================================
// 🪝 HOOKS
// ============================================================
VesselSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    // ✅ مزامنة stat مع status
    if (this.isModified('status')) {
        this.stat = this.status;
    }
    next();
});

// ============================================================
// 🔍 INDEXES
// ============================================================
VesselSchema.index({ status: 1 });
VesselSchema.index({ status: 1, region: 1 });
VesselSchema.index({ disposalDate: -1 });
VesselSchema.index({ createdAt: -1 });

// ============================================================
// 🎯 STATICS
// ============================================================
VesselSchema.statics.findActive = function() {
    return this.find({ status: 'صالح' });
};

VesselSchema.statics.findByStatus = function(status) {
    return this.find({ status });
};

VesselSchema.statics.findDisposed = function() {
    return this.find({ status: 'طرح' }).sort({ disposalDate: -1 });
};

VesselSchema.statics.findNonDisposed = function() {
    return this.find({ status: { $ne: 'طرح' } });
};

// ============================================================
// 🔧 METHODS
// ============================================================
VesselSchema.methods.addMaintenance = async function(maintenanceData) {
    this.maintenanceHistory.push({ ...maintenanceData, date: new Date() });
    await this.save();
    return this;
};

VesselSchema.methods.changeStatus = async function(newStatus) {
    this.status = newStatus;
    this.stat = newStatus;
    await this.save();
    return this;
};

// ⚫ طريقة الطرح
VesselSchema.methods.dispose = async function(reason, decisionNumber, decidedBy, notes) {
    this.status = 'طرح';
    this.stat = 'طرح';
    this.disposalDate = new Date();
    this.disposalReason = String(reason || '').substring(0, 1000);
    this.disposalDecision = String(decisionNumber || '').substring(0, 200);
    this.disposedBy = String(decidedBy || '').substring(0, 200);
    this.disposalNotes = String(notes || '').substring(0, 2000);
    this.break = String(reason || '').substring(0, 500);
    await this.save();
    return this;
};

// 🔓 طريقة إلغاء الطرح
VesselSchema.methods.restore = async function() {
    this.status = 'صالح';
    this.stat = 'صالح';
    this.disposalDate = null;
    this.disposalReason = '';
    this.disposalDecision = '';
    this.disposedBy = '';
    this.disposalNotes = '';
    this.break = '';
    await this.save();
    return this;
};

// ============================================================
// 📤 EXPORT
// ============================================================
const Vessel = mongoose.model('Vessel', VesselSchema);

module.exports = Vessel;