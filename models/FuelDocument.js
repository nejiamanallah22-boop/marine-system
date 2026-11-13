const mongoose = require('mongoose');

const fuelDocumentSchema = new mongoose.Schema({
  boatId: { type: String, required: true, index: true },
  date: { type: Date, required: true, default: Date.now },
  totalHours: { type: Number, required: true },
  usedHours: { type: Number, required: true },
  requestedLiters: { type: Number, required: true },
  actualRate: { type: Number, required: true },
  deviation: { type: Number, required: true },
  isFraud: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// فهرسة للبحث السريع بالتاريخ ورقم القارب
fuelDocumentSchema.index({ boatId: 1, date: -1 });

module.exports = mongoose.model('FuelDocument', fuelDocumentSchema);
