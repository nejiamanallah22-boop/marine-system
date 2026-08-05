const mongoose = require('mongoose');

const aiUsageSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    tokensInput: { type: Number, default: 0 },
    tokensOutput: { type: Number, default: 0 },
    cost: { type: Number, default: 0 },
    model: { type: String },
    provider: { type: String, default: 'gemini' },
    timestamp: { type: Date, default: Date.now, index: true }
});

aiUsageSchema.index({ userId: 1, timestamp: -1 });
aiUsageSchema.index({ timestamp: 1 });

module.exports = mongoose.model('AIUsage', aiUsageSchema);
