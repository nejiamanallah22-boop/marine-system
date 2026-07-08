const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    action: { type: String, required: true },
    details: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Log', LogSchema);
