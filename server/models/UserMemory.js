const mongoose = require('mongoose');

const userMemorySchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    topic: { type: String, required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, index: true }
});

userMemorySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('UserMemory', userMemorySchema);
