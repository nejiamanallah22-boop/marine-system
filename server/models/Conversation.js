const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    title: { type: String, default: 'محادثة جديدة' },
    messageCount: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now }
}, {
    timestamps: { createdAt: 'createdAt' }
});

conversationSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
