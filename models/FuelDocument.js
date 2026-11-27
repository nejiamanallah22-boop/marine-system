const mongoose = require('mongoose');

const meterSchema = new mongoose.Schema({
    startHours: { type: Number, min: 0 },
    endHours: { type: Number, min: 0 },
    usedHours: { type: Number, min: 0 },
    totalHours: { type: Number, min: 0 },
    requestedLiters: { type: Number, min: 0 }
}, { _id: false });

const historySchema = new mongoose.Schema({
    at: { type: Date, default: Date.now },
    by: { type: String, default: '' },
    byName: { type: String, default: '' },
    before: { type: mongoose.Schema.Types.Mixed }
}, { _id: false });

const fuelDocumentSchema = new mongoose.Schema({
    boatId: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },
    documentNumber: { type: String, default: '', maxlength: 40 },

    fuelType: { type: String, enum: ['gasoil', 'benzine'], default: 'gasoil' },
    quota: { type: Number, default: null, min: 0 },
    extraLiters: { type: Number, default: 0, min: 0 },
    incomingDinars: { type: Number, default: 0, min: 0 },
    incomingLiters: { type: Number, default: 0, min: 0 },

    docTotalLiters: { type: Number, required: true, min: 0 },
    actualConsumedLiters: { type: Number, required: true, min: 0 },
    docTotalHours: { type: Number, required: true, min: 0 },

    remainingTank: { type: Number, default: null, min: 0 },
    cardDinars: { type: Number, default: null, min: 0 },
    cardLiters: { type: Number, default: null, min: 0 },
    fuelPrice: { type: Number, default: null, min: 0 },
    tankAfter: { type: Number, default: null, min: 0 },

    // ✅ v8: حتى ثلاثة محركات (أيمن · أوسط · أيسر)
    engineCount: { type: Number, default: 1, enum: [1, 2, 3] },
    engines: {
        right: { type: meterSchema, default: null },
        center: { type: meterSchema, default: null },
        left: { type: meterSchema, default: null }
    },

    totalActualRate: { type: Number, default: 0 },
    actualConsumption: { type: Number, default: null },
    riskScore: { type: Number, default: 0, min: 0, max: 100 },
    isFraud: { type: Boolean, default: false },
    fraudReason: { type: String, default: '' },
    violations: { type: [String], default: [] },

    balanceLeft: { type: Number, default: null },
    balanceRight: { type: Number, default: null },
    balanceDiff: { type: Number, default: null },
    balanceOk: { type: Boolean, default: null },

    excessLiters: { type: Number, default: null, min: 0 },
    excessDinars: { type: Number, default: null, min: 0 },
    ratePct: { type: Number, default: null },

    createdBy: { type: String, default: '' },
    editedAt: { type: Date, default: null },
    editedBy: { type: String, default: '' },
    editCount: { type: Number, default: 0 },
    history: { type: [historySchema], default: [] }
}, { timestamps: true });

fuelDocumentSchema.index({ boatId: 1, date: -1 });
fuelDocumentSchema.index({ boatId: 1, isFraud: 1, totalActualRate: 1 });

module.exports = mongoose.models.FuelDocument || mongoose.model('FuelDocument', fuelDocumentSchema);
