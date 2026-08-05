const mongoose = require('mongoose');

const aiReportSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    type: { type: String, enum: ['daily', 'weekly', 'monthly', 'custom'], default: 'monthly' },
    title: { type: String },
    data: { type: Object },
    createdAt: { type: Date, default: Date.now, index: true }
});

aiReportSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AIReport', aiReportSchema);
