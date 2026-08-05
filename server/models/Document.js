const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['pdf', 'word', 'excel', 'image', 'text', 'other'],
        default: 'text'
    },
    filename: { type: String },
    fileSize: { type: Number },
    mimeType: { type: String },
    createdAt: { type: Date, default: Date.now, index: true }
});

documentSchema.index({ userId: 1, createdAt: -1 });
documentSchema.index({ content: 'text' });

module.exports = mongoose.model('Document', documentSchema);
