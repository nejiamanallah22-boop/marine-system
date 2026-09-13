// models/SystemLogo.js
const mongoose = require('mongoose');

const logoSchema = new mongoose.Schema({
    key: {
        type: String,
        default: 'system_logo',
        unique: true
    },
    dataUrl: { type: String, required: true },
    mimetype: String,
    size: Number,
    originalName: String,
    uploadedBy: String,
    uploadedAt: { type: Date, default: Date.now }
}, { collection: 'system_assets' });

module.exports = mongoose.models.SystemLogo ||
                 mongoose.model('SystemLogo', logoSchema);
