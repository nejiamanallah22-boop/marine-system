const mongoose = require('mongoose');

const vesselSchema = new mongoose.Schema({
    id: { type: String, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    num: { type: String, trim: true, default: '' },
    len: { type: Number, default: 0 },
    cat: { type: String, trim: true, default: '' },
    category: { type: String, trim: true, default: '' },
    reg: { type: String, trim: true, default: '' },
    region: { type: String, trim: true, default: '' },
    zone: { type: String, trim: true, default: '' },
    port: { type: String, trim: true, default: '' },
    supp: { type: String, trim: true, default: '' },
    status: { type: String, default: 'صالح' },
    stat: { type: String, default: 'صالح' },
    break: { type: String, trim: true, default: '' },
    fDate: { type: String, default: null },
    eDate: { type: String, default: null },
    ref: { type: String, trim: true, default: '' },
    repairUnit: { type: String, trim: true, default: '' },
    technician: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { strict: false });

module.exports = mongoose.model('Vessel', vesselSchema);
