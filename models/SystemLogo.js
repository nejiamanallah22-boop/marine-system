/**
 * 🖼️ نموذج الشعار - v1.0
 * @module models/SystemLogo
 */

const mongoose = require('mongoose');

const SystemLogoSchema = new mongoose.Schema({
    id: {
        type: String,
        default: 'main-logo',
        unique: true,
        index: true
    },
    dataUrl: {
        type: String,
        default: ''
    },
    filename: {
        type: String,
        default: ''
    },
    mimetype: {
        type: String,
        default: ''
    },
    size: {
        type: Number,
        default: 0
    },
    uploadedBy: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    strict: false
});

SystemLogoSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('SystemLogo', SystemLogoSchema);
