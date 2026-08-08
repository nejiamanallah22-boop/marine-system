const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    type: {
        type: String,
        enum: ['عام', 'سرية', 'عاجلة'],
        default: 'عام'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    weekNumber: Number,
    year: Number,
    attachments: [{
        name: String,
        url: String,
        type: String
    }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Note', noteSchema);
