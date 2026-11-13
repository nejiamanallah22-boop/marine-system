// models/FuelDocument.js
const mongoose = require('mongoose');

// ═══════════════════════════════════════════════════════════
// مخطط المحرك (يمين / يسار)
// ═══════════════════════════════════════════════════════════
const engineSchema = new mongoose.Schema({
    totalHours: { type: Number, required: true, default: 0 },       // العداد الكلي للمحرك
    usedHours: { type: Number, required: true, default: 0 },        // الساعات المقطوعة
    requestedLiters: { type: Number, required: true, default: 0 },  // الوقود المطلوب للمحرك
    actualRate: { type: Number, default: 0 },                       // معدل الاستهلاك الفعلي (لتر/ساعة)
    deviation: { type: Number, default: 0 }                         // نسبة الانحراف عن المعيار (%)
}, { _id: false });

// ═══════════════════════════════════════════════════════════
// مخطط وثيقة التموين (الشاملة)
// ═══════════════════════════════════════════════════════════
const fuelDocumentSchema = new mongoose.Schema({
    // 🔹 معرّف المركب
    boatId: { 
        type: String, 
        required: true, 
        index: true 
    },
    
    // 🔹 تاريخ الوثيقة
    date: { 
        type: Date, 
        required: true, 
        default: Date.now, 
        index: true 
    },
    
    // 🔹 إجمالي الوثيقة (كما هو مكتوب في ورقة الإدارة)
    docTotalHours: { 
        type: Number, 
        required: true, 
        default: 0 
    },
    docTotalLiters: { 
        type: Number, 
        required: true, 
        default: 0 
    },
    
    // 🔹 عدد المحركات (1 أو 2)
    engineCount: { 
        type: Number, 
        required: true, 
        default: 1,
        enum: [1, 2]
    },
    
    // 🔹 تفاصيل المحركات
    engines: {
        right: { type: engineSchema, default: null },  // المحرك الأيمن (أو الوحيد)
        left:  { type: engineSchema, default: null }   // المحرك الأيسر (اختياري)
    },
    
    // 🔹 معدل الاستهلاك الإجمالي للقارب (لتر/ساعة)
    totalActualRate: { 
        type: Number, 
        required: true, 
        default: 0 
    },
    
    // 🔹 نتائج التحليل (كشف التلاعب)
    isFraud: { 
        type: Boolean, 
        default: false 
    },
    fraudReason: { 
        type: String, 
        default: '' 
    },
    
    // 🔹 بيانات إضافية (من قام بالإدخال)
    createdBy: { 
        type: String, 
        default: null 
    },
    createdByName: { 
        type: String, 
        default: '' 
    },
    
    // 🔹 التواريخ
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    updatedAt: { 
        type: Date, 
        default: Date.now 
    }
});

// ═══════════════════════════════════════════════════════════
// الفهارس (Indexes) لتحسين أداء البحث والفلترة
// ═══════════════════════════════════════════════════════════

// فهرسة مركبة (القارب + التاريخ) للفلترة السريعة
fuelDocumentSchema.index({ boatId: 1, date: -1 });

// فهرسة التاريخ للفلترة العامة
fuelDocumentSchema.index({ date: -1 });

// فهرسة الوثائق المشبوهة
fuelDocumentSchema.index({ isFraud: 1 });

// ═══════════════════════════════════════════════════════════
// Middleware قبل الحفظ: تحديث تاريخ التعديل تلقائياً
// ═══════════════════════════════════════════════════════════
fuelDocumentSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// ═══════════════════════════════════════════════════════════
// طرق مساعدة (Methods) يمكن استدعاؤها على الوثيقة
// ═══════════════════════════════════════════════════════════

// حساب معدل الاستهلاك الإجمالي
fuelDocumentSchema.methods.calculateTotalRate = function() {
    if (this.docTotalHours > 0) {
        this.totalActualRate = this.docTotalLiters / this.docTotalHours;
    } else {
        this.totalActualRate = 0;
    }
    return this.totalActualRate;
};

// التحقق من تطابق الساعات بين المحركات والإجمالي
fuelDocumentSchema.methods.validateHoursMatch = function() {
    const sumUsed = (this.engines.right?.usedHours || 0) + (this.engines.left?.usedHours || 0);
    return Math.abs(sumUsed - this.docTotalHours) < 0.5;
};

// التحقق من تطابق الوقود بين المحركات والإجمالي
fuelDocumentSchema.methods.validateLitersMatch = function() {
    const sumLiters = (this.engines.right?.requestedLiters || 0) + (this.engines.left?.requestedLiters || 0);
    return Math.abs(sumLiters - this.docTotalLiters) < 0.5;
};

// ═══════════════════════════════════════════════════════════
// التصدير
// ═══════════════════════════════════════════════════════════
module.exports = mongoose.model('FuelDocument', fuelDocumentSchema);
