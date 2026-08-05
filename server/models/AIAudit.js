const mongoose = require('mongoose');

const aiAuditSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    action: { type: String, required: true },
    message: { type: String },
    ip: { type: String },
    device: { type: String },
    conversationId: { type: String },
    timestamp: { type: Date, default: Date.now, index: true }
});

aiAuditSchema.index({ userId: 1, timestamp: -1 });
aiAuditSchema.index({ action: 1, timestamp: -1 });

module.exports = mongoose.model('AIAudit', aiAuditSchema);
