const mongoose = require('mongoose');

const aiMemorySchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    vesselName: { type: String, required: true, index: true },
    topic: { type: String, required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, index: true }
});

aiMemorySchema.index({ vesselName: 1, createdAt: -1 });
aiMemorySchema.index({ userId: 1, vesselName: 1 });

module.exports = mongoose.model('AIMemory', aiMemorySchema);
