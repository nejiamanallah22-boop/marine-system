// models/Driver.js
const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
    // 🔗 ربط السائق بالوسيلة البرية
    vehicleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vehicle',
        required: true,
        index: true
    },

    // 👤 معلومات السائق
    firstName: {
        type: String,
        required: [true, 'اسم السائق مطلوب'],
        trim: true,
        maxlength: 100
    },
    lastName: {
        type: String,
        required: [true, 'لقب السائق مطلوب'],
        trim: true,
        maxlength: 100
    },
    cin: {
        type: String,
        trim: true,
        maxlength: 20,
        default: ''
    },

    // 🪪 معلومات رخصة السياقة
    license: {
        type: String,
        trim: true,
        maxlength: 50,
        default: ''
    },
    licenseDate: {
        type: Date,
        default: null
    },
    licenseCat: {
        type: String,
        trim: true,
        maxlength: 20,
        default: ''
    },

    // 📍 مكان تعيين الوسيلة
    assignment: {
        type: String,
        trim: true,
        maxlength: 200,
        default: ''
    },

    // 📝 ملاحظات
    notes: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: ''
    },

    // 📌 معلومات إدارية
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    createdByName: {
        type: String,
        default: ''
    }
}, {
    timestamps: true // ينشئ createdAt و updatedAt تلقائياً
});

// فهرس مركب لتسريع البحث
driverSchema.index({ vehicleId: 1, createdAt: -1 });

// تحويل _id إلى id عند الإرجاع JSON
driverSchema.set('toJSON', {
    virtuals: true,
    transform: function(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
    }
});

module.exports = mongoose.model('Driver', driverSchema);
