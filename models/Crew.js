// models/Crew.js
const mongoose = require('mongoose');

const CrewSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    vesselId: {
        type: String,
        required: true,
        index: true
    },
    firstName: { type: String, required: true, trim: true },
    lastName:  { type: String, required: true, trim: true },
    rank:          { type: String, default: '' },
    jobTitle:      { type: String, default: '' },
    phone:         { type: String, default: '' },
    cin:           { type: String, default: '' },
    birthPlace:    { type: String, default: '' },
    hireDate:      { type: Date, default: null },
    qualifications:{ type: String, default: '' },
    familyStatus:  { type: String, default: '' },
    notes:         { type: String, default: '' }
}, {
    timestamps: true,
    collection: 'crews'
});

// فهرس مركب لتحسين الاستعلام
CrewSchema.index({ vesselId: 1, createdAt: 1 });

module.exports = mongoose.models.Crew || mongoose.model('Crew', CrewSchema);
