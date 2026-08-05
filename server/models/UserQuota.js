const mongoose = require('mongoose');

const userQuotaSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    dailyLimit: { type: Number, default: 500 },
    dailyUsage: { type: Number, default: 0 },
    monthlyTokenLimit: { type: Number, default: 100000 },
    monthlyTokensUsed: { type: Number, default: 0 },
    requestsPerMinute: { type: Number, default: 20 },
    lastReset: { type: Date, default: Date.now }
}, {
    timestamps: true
});

userQuotaSchema.index({ userId: 1 });

module.exports = mongoose.model('UserQuota', userQuotaSchema);
