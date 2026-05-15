const mongoose = require('mongoose');

const TicketSchema = new mongoose.Schema({
    userName: { type: String, required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    date: { type: String, default: '' },
    status: { type: String, default: 'قيد المعالجة' }
});

module.exports = mongoose.model('Ticket', TicketSchema);
