const mongoose = require('mongoose');

const vesselSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { type: String, required: true },
    hullNumber: { type: String, required: true, unique: true },
    status: { type: String, default: 'نشط' },
    specifications: {
        displacement: Number,
        length: Number,
        beam: Number,
        draft: Number,
        speed: { max: Number, cruise: Number },
        crew: { officers: Number, enlisted: Number }
    },
    armament: [{
        name: String,
        type: String,
        quantity: Number
    }],
    homePort: String,
    commissioningDate: Date,
    lastMaintenance: Date,
    nextMaintenance: Date,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Vessel', vesselSchema);
