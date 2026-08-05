const mongoose = require('mongoose');

const aiProviderStateSchema = new mongoose.Schema({
    provider: { type: String, required: true, unique: true, index: true },
    currentIndex: { type: Number, default: 0 },
    failureCount: { type: Object, default: {} },
    updatedAt: { type: Date, default: Date.now }
});

aiProviderStateSchema.index({ provider: 1 });

module.exports = mongoose.model('AIProviderState', aiProviderStateSchema);
