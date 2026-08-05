const mongoose = require('mongoose');

const knowledgeBaseSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    category: { 
        type: String, 
        enum: ['maintenance', 'safety', 'regulations', 'operations', 'general'],
        default: 'general'
    },
    tags: [String],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

knowledgeBaseSchema.index({ content: 'text', title: 'text' });

module.exports = mongoose.model('KnowledgeBase', knowledgeBaseSchema);
