/**
 * 👤 نموذج المستخدم
 * @module models/User
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

/**
 * مخطط المستخدم
 */
const UserSchema = new mongoose.Schema({
    id: {
        type: String,
        default: uuidv4,
        unique: true,
        index: true
    },
    username: {
        type: String,
        required: [true, 'اسم المستخدم مطلوب'],
        unique: true,
        trim: true,
        minlength: [3, 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل'],
        maxlength: [50, 'اسم المستخدم يجب أن يكون 50 حرفاً كحد أقصى'],
        match: [/^[a-zA-Z0-9_\u0600-\u06FF]+$/, 'اسم المستخدم يحتوي على أحرف غير مسموحة']
    },
    email: {
        type: String,
        required: [true, 'البريد الإلكتروني مطلوب'],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'البريد الإلكتروني غير صالح']
    },
    password: {
        type: String,
        required: [true, 'كلمة المرور مطلوبة'],
        minlength: [12, 'كلمة المرور يجب أن تكون 12 حرفاً على الأقل']
    },
    name: {
        type: String,
        required: [true, 'الاسم مطلوب'],
        trim: true,
        minlength: [2, 'الاسم يجب أن يكون حرفين على الأقل']
    },
    role: {
        type: String,
        enum: ['admin', 'manager', 'operator', 'viewer'],
        default: 'viewer'
    },
    permissions: {
        type: [String],
        default: []
    },
    isActive: {
        type: Boolean,
        default: true
    },
    twoFactorEnabled: {
        type: Boolean,
        default: true
    },
    twoFactorSecret: {
        type: String,
        default: null
    },
    lastLogin: {
        type: Date,
        default: null
    },
    loginAttempts: {
        type: Number,
        default: 0
    },
    lockedUntil: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

/**
 * تشفير كلمة المرور قبل الحفظ
 */
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

/**
 * تحديث وقت التعديل
 */
UserSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

/**
 * مقارنة كلمة المرور
 * @param {string} candidatePassword - كلمة المرور المدخلة
 * @returns {Promise<boolean>} - هل هي صحيحة
 */
UserSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

/**
 * التحقق من قفل الحساب
 * @returns {boolean} - هل الحساب مقفل
 */
UserSchema.methods.isLocked = function() {
    if (!this.lockedUntil) return false;
    return new Date() < this.lockedUntil;
};

/**
 * زيادة عدد محاولات الدخول الفاشلة
 */
UserSchema.methods.incrementLoginAttempts = async function() {
    this.loginAttempts += 1;
    
    const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
    const lockoutMinutes = parseInt(process.env.LOCKOUT_MINUTES) || 15;
    
    if (this.loginAttempts >= maxAttempts) {
        this.lockedUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);
    }
    
    await this.save();
};

/**
 * إعادة تعيين محاولات الدخول
 */
UserSchema.methods.resetLoginAttempts = async function() {
    this.loginAttempts = 0;
    this.lockedUntil = null;
    await this.save();
};

/**
 * الحصول على المستخدم بدون بيانات حساسة
 * @returns {Object} - بيانات المستخدم الآمنة
 */
UserSchema.methods.toSafeObject = function() {
    const obj = this.toObject();
    delete obj.password;
    delete obj.twoFactorSecret;
    delete obj.__v;
    return obj;
};

const User = mongoose.model('User', UserSchema);

module.exports = User;
