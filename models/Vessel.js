/**
 * 🚢 نموذج الوسيلة البحرية — v2.3
 * @description متوافق 100% مع server.js — يدعم الطرح + الصور
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// ============================================================
// 🖼️ IMAGE SUB-SCHEMA
// ============================================================
const VesselImageSchema = new mongoose.Schema({
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
            'صالح', 'معطب', 'صيانة', 'طرح',
            'احتياط', 'نشط', 'غير نشط',
            'active', 'inactive', 'maintenance', 'reserve'
        ],
        trim: true
    },
    stat: { type: String, default: 'صالح' },

    // ============================================================
    // 🔧 معلومات الأعطال والصيانة
    // ============================================================
    break: { type: String, default: '' },
    fDate: { type: String, default: null },
    eDate: { type: String, default: null },
    repairUnit: { type: String, default: '' },

    // ============================================================
    // ⚫ حقول الطرح
    // ============================================================
    disposalDate:     { type: Date, default: null },
    disposalReason:   { type: String, default: '', maxlength: 1000 },
    disposalDecision: { type: String, default: '', maxlength: 200 },
    disposedBy:       { type: String, default: '', maxlength: 200 },
    disposalNotes:    { type: String, default: '', maxlength: 2000 },

    // ============================================================
    // 🖼️ الصور
    // ============================================================
    images: [VesselImageSchema],

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
    // مزامنة stat مع status
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

// ⚫ طريقة الطرح — تقبل كائناً أو args مفردة
VesselSchema.methods.dispose = async function(arg1, decisionNumber, decidedBy, notes) {
    let reason, decision, byUser, noteText, dateVal;
    
    if (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1)) {
        reason    = arg1.reason;
        decision  = arg1.decision;
        byUser    = arg1.disposedBy;
        noteText  = arg1.notes;
        dateVal   = arg1.date;
    } else {
        reason    = arg1;
        decision  = decisionNumber;
        byUser    = decidedBy;
        noteText  = notes;
        dateVal   = null;
    }
    
    this.status = 'طرح';
    this.stat = 'طرح';
    this.disposalDate = dateVal ? new Date(dateVal) : new Date();
    this.disposalReason   = String(reason || '').substring(0, 1000);
    this.disposalDecision = String(decision || '').substring(0, 200);
    this.disposedBy       = String(byUser || '').substring(0, 200);
    this.disposalNotes    = String(noteText || '').substring(0, 2000);
    this.break            = String(reason || '').substring(0, 500);
    await this.save();
    return this;
};

// 🔓 طريقة إلغاء الطرح — تقبل newStatus
VesselSchema.methods.restore = async function(arg) {
    let newStatus = 'صالح';
    if (arg && typeof arg === 'object' && arg.newStatus) {
        newStatus = arg.newStatus;
    } else if (typeof arg === 'string') {
        newStatus = arg;
    }
    
    const allowed = ['صالح', 'صيانة', 'معطب', 'احتياط', 'نشط'];
    if (!allowed.includes(newStatus)) {
        newStatus = 'صيانة';
    }
    
    this.status = newStatus;
    this.stat = newStatus;
    this.disposalDate = null;
    this.disposalReason = '';
    this.disposalDecision = '';
    this.disposedBy = '';
    this.disposalNotes = '';
    this.break = '';
    await this.save();
    return this;
};

// 🖼️ حذف صورة
VesselSchema.methods.removeImage = function(imageId) {
    if (!this.images) return false;
    const img = this.images.id(imageId);
    if (!img) return false;
    const wasPrimary = img.isPrimary;
    img.deleteOne();
    if (wasPrimary && this.images.length > 0) {
        this.images[0].isPrimary = true;
    }
    return true;
};

// ⭐ تعيين صورة رئيسية
VesselSchema.methods.setPrimaryImage = function(imageId) {
    if (!this.images) return false;
    this.images.forEach(img => {
        img.isPrimary = img._id.toString() === imageId.toString();
    });
    return true;
};

// 🔍 جلب الصورة الرئيسية
VesselSchema.methods.getPrimaryImage = function() {
    if (!this.images || this.images.length === 0) return null;
    return this.images.find(i => i.isPrimary) || this.images[0];
};

// ============================================================
// 📤 EXPORT
// ============================================================
const Vessel = mongoose.model('Vessel', VesselSchema);

module.exports = Vessel;
