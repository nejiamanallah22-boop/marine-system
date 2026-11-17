const mongoose = require('mongoose');

const engineSchema = new mongoose.Schema({
    totalHours: { type: Number, default: 0, min: 0 },
    usedHours: { type: Number, default: 0, min: 0 },
    requestedLiters: { type: Number, default: 0, min: 0 }
}, { _id: false });

const fuelDocumentSchema = new mongoose.Schema({
    boatId: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },
    documentNumber: { type: String, default: '', maxlength: 40 },
    docTotalHours: { type: Number, required: true, min: 0 },
    docTotalLiters: { type: Number, required: true, min: 0 },
    engineCount: { type: Number, default: 1, enum: [1, 2] },
    engines: {
        right: { type: engineSchema, default: null },
        left: { type: engineSchema, default: null }
    },
    totalActualRate: { type: Number, default: 0 },
    riskScore: { type: Number, default: 0, min: 0, max: 100 },
    isFraud: { type: Boolean, default: false },
    fraudReason: { type: String, default: '' },
    violations: { type: [String], default: [] },
    createdBy: { type: String, default: '' }
}, { timestamps: true });

fuelDocumentSchema.index({ boatId: 1, date: -1 });

module.exports = mongoose.models.FuelDocument || mongoose.model('FuelDocument', fuelDocumentSchema);
