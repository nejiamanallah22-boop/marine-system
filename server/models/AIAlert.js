const mongoose = require('mongoose');

const aiAlertSchema = new mongoose.Schema({
    vesselName: { type: String, required: true, index: true },
    type: { 
        type: String, 
        enum: ['long_downtime', 'high_cost', 'frequent_issues', 'safety_risk', 'predictive'],
        default: 'long_downtime'
    },
    severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    message: { type: String, required: true },
    data: { type: Object },
    resolved: { type: Boolean, default: false },
    resolvedAt: { type: Date },
    createdAt: { type: Date, default: Date.now, index: true }
});

aiAlertSchema.index({ resolved: 1, createdAt: -1 });
aiAlertSchema.index({ vesselName: 1, resolved: 1 });

module.exports = mongoose.model('AIAlert', aiAlertSchema);
