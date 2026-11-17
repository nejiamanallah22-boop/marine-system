const mongoose = require('mongoose');

const vesselSchema = new mongoose.Schema({
    // --- الحقول الأساسية ---
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    num: { type: String, default: '' },
    len: { type: Number, default: 0 },
    region: { type: String, default: '' },
    zone: { type: String, default: '' },
    port: { type: String, default: '' },
    supp: { type: String, default: '' },
    status: { type: String, default: 'صالح' },
    stat: { type: String, default: 'صالح' },
    break: { type: String, default: '' },
    fDate: { type: Date },
    eDate: { type: Date },
    ref: { type: String, default: '' },
    repairUnit: { type: String, default: '' },
    cat: { type: String, default: '' },
    
    // --- الصور ---
    images: [{
        filename: String,
        originalName: String,
        url: String,
        size: Number,
        mimetype: String,
        caption: String,
        isPrimary: { type: Boolean, default: false },
        source: { type: String, default: 'upload' },
        uploadedAt: { type: Date, default: Date.now },
        uploadedBy: String
    }],

    // --- الطرح ---
    disposalDate: { type: Date },
    disposalReason: String,
    disposalDecision: String,
    disposedBy: String,
    disposalNotes: String,
    disposedAt: { type: Date },

    // ✅ الحقول الجديدة الخاصة بإعدادات المحروقات
    engineCount: { type: Number, default: 1, enum: [1, 2] },
    tankCapacity: { type: Number, default: 0, min: 0 },
    standardRate: { type: Number, default: 0, min: 0 },
    engineRight: { type: String, default: '' },
    engineLeft: { type: String, default: '' },

    // --- إضافات ---
    inactivePeriods: [{
        from: Date,
        to: Date,
        reason: String
    }],
    createdBy: { type: String }

}, { timestamps: true });

// دالة مساعدة لتعيين الصورة الرئيسية
vesselSchema.methods.setPrimaryImage = function(imageId) {
    this.images.forEach(img => {
        img.isPrimary = (img._id.toString() === imageId);
    });
};

// دالة مساعدة لحذف صورة
vesselSchema.methods.removeImage = function(imageId) {
    this.images = this.images.filter(img => img._id.toString() !== imageId);
};

// دالة مساعدة لاستعادة القارب من الطرح
vesselSchema.methods.restore = function({ newStatus }) {
    this.status = newStatus || 'صالح';
    this.stat = newStatus || 'صالح';
    this.disposalDate = null;
    this.disposedAt = null;
    this.disposalReason = '';
    this.disposalDecision = '';
    this.disposedBy = '';
    this.disposalNotes = '';
    this.break = '';
    this.updatedAt = new Date();
    return this.save();
};

module.exports = mongoose.models.Vessel || mongoose.model('Vessel', vesselSchema);
