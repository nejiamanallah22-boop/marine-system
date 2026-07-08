const mongoose = require('mongoose');

const ReplySchema = new mongoose.Schema({
    adminName: { type: String, required: true },
    reply: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true }
});

const TicketSchema = new mongoose.Schema({
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    status: { type: String, enum: ['قيد المعالجة', 'تم الرد', 'مغلقة'], default: 'قيد المعالجة' },
    replies: [ReplySchema]
}, { timestamps: true });

module.exports = mongoose.model('Ticket', TicketSchema);
