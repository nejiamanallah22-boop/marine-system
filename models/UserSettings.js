// models/UserSettings.js
const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    settings: {
        theme: {
            primary: { type: String, default: '#0a1628' },
            secondary: { type: String, default: '#1a2a4a' },
            gold: { type: String, default: '#e6b31e' }
        },
        layout: {
            darkMode: { type: Boolean, default: true },
            fontSize: {
                type: String,
                default: 'medium',
                enum: ['small', 'medium', 'large']
            },
            sidebarPosition: {
                type: String,
                default: 'right',
                enum: ['right', 'left']
            },
            showStats: { type: Boolean, default: true }
        },
        security: {
            emailNotifications: { type: Boolean, default: true },
            smsNotifications: { type: Boolean, default: false },
            sessionTimeout: { type: Number, default: 60, min: 5, max: 480 }
        },
        notifications: {
            emergencyAlerts: { type: Boolean, default: true },
            maintenanceAlerts: { type: Boolean, default: true },
            performanceReports: {
                type: String,
                default: 'weekly',
                enum: ['daily', 'weekly', 'monthly', 'never']
            }
        },
        branding: {
            logoSize: {
                type: String,
                default: 'medium',
                enum: ['small', 'medium', 'large']
            }
        }
    },
    updatedAt: { type: Date, default: Date.now }
}, { collection: 'user_settings' });

module.exports = mongoose.models.UserSettings ||
                 mongoose.model('UserSettings', settingsSchema);
