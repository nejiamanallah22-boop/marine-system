const mongoose = require('mongoose');

const predictiveMaintenanceSchema = new mongoose.Schema({
    vesselName: { type: String, required: true, index: true },
    riskScore: { type: Number, required: true },
    riskLevel: { type: String, enum: ['منخفضة', 'متوسطة', 'عالية'], required: true },
    mostCommonFault: { type: String },
    faultCount: { type: Number, default: 0 },
    averageCost: { type: Number, default: 0 },
    averageDaysBetweenFailures: { type: Number, default: 0 },
    recommendation: { type: String },
    lastMaintenanceDate: { type: Date },
    totalRecords: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, index: true }
});

predictiveMaintenanceSchema.index({ vesselName: 1, createdAt: -1 });
predictiveMaintenanceSchema.index({ riskLevel: 1 });

module.exports = mongoose.model('PredictiveMaintenance', predictiveMaintenanceSchema);
