const mongoose = require('mongoose');

const VesselSchema = new mongoose.Schema({
    name: { type: String, required: true },
    num: { type: String, default: '' },
    len: { type: Number, default: 0 },
    reg: { type: String, default: '' },
    zone: { type: String, default: '' },
    port: { type: String, default: '' },
    supp: { type: String, default: '' },
    stat: { type: String, default: 'صالح' },
    break: { type: String, default: '' },
    fDate: { type: String, default: '' },
    eDate: { type: String, default: '' },
    ref: { type: String, default: '' },
    cat: { type: String, default: '' }
});

module.exports = mongoose.model('Vessel', VesselSchema);
