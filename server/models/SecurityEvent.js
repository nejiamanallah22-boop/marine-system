const mongoose = require('mongoose');

const securityEventSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    type: { 
        type: String, 
        enum: ['AUTH_SUCCESS', 'AUTH_FAILURE', 'PROMPT_INJECTION', 'TOKEN_REVOKED', 'PERMISSION_DENIED'],
        required: true 
    },
    details: { type: Object },
    ip: { type: String },
    timestamp: { type: Date, default: Date.now, index: true }
});

securityEventSchema.index({ userId: 1, timestamp: -1 });
securityEventSchema.index({ type: 1, timestamp: -1 });

module.exports = mongoose.model('SecurityEvent', securityEventSchema);
