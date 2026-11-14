/** models/FuelDocument.js — نموذج وثيقة تموين المحروقات */
const mongoose = require('mongoose');

const num = { type: Number, default: 0, min: 0 };
const engineSchema = new mongoose.Schema({ totalHours: num, usedHours: num, requestedLiters: num }, { _id: false });

const FuelDocumentSchema = new mongoose.Schema({
  boatId: { type: String, required: true, index: true },
  documentNumber: String,
  date: { type: Date, required: true, index: true },
  docTotalHours: { type: Number, required: true, min: 0 },
  docTotalLiters: { type: Number, required: true, min: 0 },
  engineCount: { type: Number, enum: [1, 2], default: 1 },
  engines: { right: engineSchema, left: engineSchema },
  totalActualRate: Number,              // لتر ÷ ساعة
  riskScore: { type: Number, default: 0, min: 0, max: 100, index: true },
  isFraud: { type: Boolean, default: false, index: true },   // riskScore > 60
  fraudReason: String,                  // أسباب الشبهة مفصولة بـ " | "
  byRule: { type: mongoose.Schema.Types.Mixed, default: {} },   // عدد المخالفات لكل قاعدة
  flags: [{ _id: false, code: String, points: Number, msg: String }],
  createdBy: String
}, { timestamps: true });

FuelDocumentSchema.index({ boatId: 1, date: -1 });

module.exports = mongoose.models.FuelDocument || mongoose.model('FuelDocument', FuelDocumentSchema);
