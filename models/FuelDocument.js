const mongoose = require('mongoose');

// عدّاد محرك: بداية الشهر / نهايته / الساعات المحتسبة (الحقلان الأخيران قديمان للتوافق)
const meterSchema = new mongoose.Schema({
    startHours: { type: Number, min: 0 },
    endHours: { type: Number, min: 0 },
    usedHours: { type: Number, min: 0 },
    totalHours: { type: Number, min: 0 },        // legacy
    requestedLiters: { type: Number, min: 0 }    // legacy
}, { _id: false });

const fuelDocumentSchema = new mongoose.Schema({
    boatId: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },
    documentNumber: { type: String, default: '', maxlength: 40 },

    // المعطيات الأساسية
    docTotalLiters: { type: Number, required: true, min: 0 },   // الكمية المطلوبة
    docTotalHours: { type: Number, required: true, min: 0 },    // ساعات العمل
    remainingTank: { type: Number, default: null, min: 0 },     // الباقي بالخزان (لتر)
    cardDinars: { type: Number, default: null, min: 0 },        // الباقي بالبطاقة الذكية (دينار)
    cardLiters: { type: Number, default: null, min: 0 },        // المعادل بالليتر
    fuelPrice: { type: Number, default: null, min: 0 },         // سعر اللتر وقت التسجيل
    tankAfter: { type: Number, default: null, min: 0 },         // الخزان بعد التعبئة

    engineCount: { type: Number, default: 1, enum: [1, 2] },
    engines: {
        right: { type: meterSchema, default: null },
        left: { type: meterSchema, default: null }
    },

    // نتائج التدقيق
    totalActualRate: { type: Number, default: 0 },
    actualConsumption: { type: Number, default: null },
    riskScore: { type: Number, default: 0, min: 0, max: 100 },
    isFraud: { type: Boolean, default: false },
    fraudReason: { type: String, default: '' },
    violations: { type: [String], default: [] },
    createdBy: { type: String, default: '' }
}, { timestamps: true });

fuelDocumentSchema.index({ boatId: 1, date: -1 });

module.exports = mongoose.models.FuelDocument || mongoose.model('FuelDocument', fuelDocumentSchema);
