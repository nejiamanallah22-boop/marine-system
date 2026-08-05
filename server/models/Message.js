const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    conversationId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Conversation' },
    userId: { type: String, required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

messageSchema.index({ conversationId: 1, userId: 1, timestamp: -1 });
messageSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('Message', messageSchema);
