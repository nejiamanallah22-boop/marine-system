const mongoose = require('mongoose');

const UserSettingsSchema = new mongoose.Schema({
    id: { type: String, unique: true, index: true },
    userId: { type: String, index: true },
    theme: { type: String, default: 'dark' },
    language: { type: String, default: 'ar' },
    notifications: { type: Boolean, default: true },
    updatedAt: { type: Date, default: Date.now }
}, { strict: false });

module.exports = mongoose.model('UserSettings', UserSettingsSchema);
