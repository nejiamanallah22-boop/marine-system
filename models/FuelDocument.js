const mongoose = require('mongoose');

const engineSchema = new mongoose.Schema({
    totalHours: { type: Number, required: true },    // العداد الكلي
    usedHours: { type: Number, required: true },     // الساعات المقطوعة
    requestedLiters: { type: Number, required: true },// الكمية المطلوبة
    actualRate: { type: Number, required: true },    // معدل الاستهلاك
    deviation: { type: Number, required: true }      // نسبة الانحراف
}, { _id: false });

const fuelDocumentSchema = new mongoose.Schema({
    boatId: { type: String, required: true, index: true },
    date: { type: Date, required: true, default: Date.now, index: true },
    
    // 🔴 إجمالي الوثيقة (كما هو مكتوب في ورقة الإدارة)
    docTotalHours: { type: Number, required: true },    // إجمالي الساعات في الوثيقة
    docTotalLiters: { type: Number, required: true },   // إجمالي الوقود في الوثيقة
    
    // 🔴 تفاصيل المحركات
    engineCount: { type: Number, required: true, default: 1 }, // 1 أو 2
    engines: {
        right: engineSchema, // المحرك الأيمن (أو الوحيد)
        left: engineSchema   // المحرك الأيسر (اختياري)
    },
    
    // 🔴 نتائج التحليل
    isFraud: { type: Boolean, default: false },
    fraudReason: { type: String, default: '' }, // سبب التلاعب
    totalActualRate: { type: Number, required: true }, // معدل الاستهلاك الإجمالي للقارب
    
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('FuelDocument', fuelDocumentSchema);
