const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: {
        type: String,
        enum: ['مفتوح', 'قيد المعالجة', 'مغلق'],
        default: 'مفتوح'
    },
    priority: {
        type: String,
        enum: ['منخفض', 'متوسط', 'عالي'],
        default: 'متوسط'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    replies: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        message: String,
        createdAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now },
    closedAt: Date
});

module.exports = mongoose.model('Ticket', ticketSchema);
