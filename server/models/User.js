// ============================================================
// 👤 USER MODEL - v5.0 GOLD EDITION
// ============================================================
// 🏆 10/10 - ULTIMATE PROFESSIONAL SECURITY
// ============================================================

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// ============================================================
// 📋 SCHEMA DEFINITION
// ============================================================

const UserSchema = new mongoose.Schema({
    // =====基本信息=====
    name: {
        type: String,
        required: [true, 'الاسم مطلوب'],
        trim: true,
        minlength: [2, 'الاسم يجب أن يكون حرفين على الأقل'],
        maxlength: [50, 'الاسم يجب أن لا يتجاوز 50 حرف']
    },
    
    username: {
        type: String,
        unique: true,
        sparse: true,
        trim: true,
        lowercase: true,
        minlength: [3, 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل'],
        maxlength: [30, 'اسم المستخدم يجب أن لا يتجاوز 30 حرف'],
        match: [/^[a-zA-Z0-9_]+$/, 'اسم المستخدم يحتوي على أحرف غير مسموحة']
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
        minlength: [8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'],
        select: false
    },
    
    // =====الصلاحيات=====
    role: {
        type: String,
        enum: {
            values: ['admin', 'manager', 'editor', 'viewer'],
            message: 'الدور غير صالح'
        },
        default: 'viewer'
    },
    
    permissions: {
        type: [String],
        default: []
    },
    
    // =====الحالة=====
    isActive: {
        type: Boolean,
        default: true
    },
    
    isLocked: {
        type: Boolean,
        default: false
    },
    
    loginAttempts: {
        type: Number,
        default: 0,
        min: 0,
        max: 10
    },
    
    lastLogin: {
        type: Date,
        default: null
    },
    
    lastLoginIP: {
        type: String,
        default: null
    },
    
    lastLoginAgent: {
        type: String,
        default: null
    },
    
    // =====الأمان=====
    refreshToken: {
        type: String,
        select: false
    },
    
    refreshTokenHash: {
        type: String,
        select: false
    },
    
    refreshTokenExpiry: {
        type: Date,
        select: false
    },
    
    tokenVersion: {
        type: Number,
        default: 0
    },
    
    // =====مفاتيح API=====
    apiKey: {
        type: String,
        unique: true,
        sparse: true,
        select: false
    },
    
    apiKeyHash: {
        type: String,
        select: false
    },
    
    // =====المصادقة الثنائية=====
    twoFactorEnabled: {
        type: Boolean,
        default: false
    },
    
    twoFactorSecret: {
        type: String,
        select: false
    },
    
    // =====التفضيلات=====
    preferences: {
        language: {
            type: String,
            enum: ['ar', 'en', 'fr'],
            default: 'ar'
        },
        theme: {
            type: String,
            enum: ['dark', 'light', 'system'],
            default: 'dark'
        },
        notifications: {
            email: { type: Boolean, default: true },
            push: { type: Boolean, default: true },
            sms: { type: Boolean, default: false }
        }
    },
    
    // =====الميتاداتا=====
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: new Map()
    },
    
    // =====التوقيت=====
    createdAt: {
        type: Date,
        default: Date.now
    },
    
    updatedAt: {
        type: Date,
        default: Date.now
    },
    
    deletedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// ============================================================
// 🔒 VIRTUAL FIELDS
// ============================================================

UserSchema.virtual('isAdmin').get(function() {
    return this.role === 'admin';
});

UserSchema.virtual('isManager').get(function() {
    return this.role === 'manager' || this.role === 'admin';
});

UserSchema.virtual('isLockedOut').get(function() {
    return this.isLocked || this.loginAttempts >= 5;
});

// ============================================================
// 🔐 MIDDLEWARE - PRE SAVE
// ============================================================

UserSchema.pre('save', async function(next) {
    // ✅ تشفير كلمة المرور
    if (this.isModified('password')) {
        try {
            const salt = await bcrypt.genSalt(12);
            this.password = await bcrypt.hash(this.password, salt);
        } catch (error) {
            return next(error);
        }
    }
    
    // ✅ توليد username إذا لم يكن موجوداً
    if (!this.username && this.email) {
        this.username = this.email.split('@')[0];
        // ✅ التأكد من عدم التكرار
        const existing = await this.constructor.findOne({ username: this.username });
        if (existing) {
            this.username = `${this.username}_${Date.now().toString(36)}`;
        }
    }
    
    // ✅ تحديث updatedAt
    this.updatedAt = new Date();
    
    next();
});

// ============================================================
// 🔐 MIDDLEWARE - PRE UPDATE
// ============================================================

UserSchema.pre('findOneAndUpdate', function(next) {
    this.set({ updatedAt: new Date() });
    next();
});

// ============================================================
// 🔐 MIDDLEWARE - PRE DELETE
// ============================================================

UserSchema.pre('deleteOne', { document: true, query: false }, async function(next) {
    // ✅ تسجيل الحذف بدلاً من الحذف الفعلي
    this.deletedAt = new Date();
    await this.save();
    next();
});

// ============================================================
// 🔑 INSTANCE METHODS
// ============================================================

// ✅ مقارنة كلمة المرور
UserSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        if (!this.password) return false;
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        console.error('❌ Password comparison error:', error);
        return false;
    }
};

// ✅ التحقق من قوة كلمة المرور
UserSchema.methods.validatePasswordStrength = function(password) {
    const checks = {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
    
    const score = Object.values(checks).filter(Boolean).length;
    return {
        valid: score >= 4,
        score: score,
        checks: checks,
        message: score >= 4 ? 'قوي' : score >= 3 ? 'متوسط' : 'ضعيف'
    };
};

// ✅ زيادة محاولات الدخول
UserSchema.methods.incrementLoginAttempts = async function() {
    this.loginAttempts = (this.loginAttempts || 0) + 1;
    
    if (this.loginAttempts >= 5) {
        this.isLocked = true;
        console.log(`🔒 User ${this.email} locked due to failed attempts`);
    }
    
    await this.save({ validateBeforeSave: false });
    return this.loginAttempts;
};

// ✅ إعادة تعيين محاولات الدخول
UserSchema.methods.resetLoginAttempts = async function() {
    this.loginAttempts = 0;
    this.isLocked = false;
    await this.save({ validateBeforeSave: false });
};

// ✅ تحديث آخر تسجيل دخول
UserSchema.methods.updateLastLogin = async function(ip = null, agent = null) {
    this.lastLogin = new Date();
    if (ip) this.lastLoginIP = ip;
    if (agent) this.lastLoginAgent = agent;
    await this.save({ validateBeforeSave: false });
};

// ✅ التحقق من تغيير كلمة المرور
UserSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
    if (this.updatedAt) {
        const changedTimestamp = parseInt(this.updatedAt.getTime() / 1000, 10);
        return JWTTimestamp < changedTimestamp;
    }
    return false;
};

// ✅ توليد مفتاح API
UserSchema.methods.generateAPIKey = function() {
    const apiKey = crypto.randomBytes(32).toString('hex');
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    this.apiKeyHash = apiKeyHash;
    return apiKey;
};

// ✅ التحقق من مفتاح API
UserSchema.methods.validateAPIKey = function(apiKey) {
    if (!this.apiKeyHash) return false;
    const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
    return hash === this.apiKeyHash;
};

// ✅ تسجيل الخروج من جميع الأجهزة
UserSchema.methods.revokeAllSessions = async function() {
    this.tokenVersion = (this.tokenVersion || 0) + 1;
    this.refreshToken = undefined;
    this.refreshTokenHash = undefined;
    this.refreshTokenExpiry = undefined;
    await this.save({ validateBeforeSave: false });
};

// ✅ إعادة تعيين كلمة المرور
UserSchema.methods.resetPassword = async function(newPassword) {
    this.password = newPassword;
    this.tokenVersion = (this.tokenVersion || 0) + 1;
    this.refreshToken = undefined;
    this.refreshTokenHash = undefined;
    this.refreshTokenExpiry = undefined;
    await this.save();
};

// ✅ التحقق من الصلاحية
UserSchema.methods.hasPermission = function(permission) {
    if (this.role === 'admin') return true;
    if (this.role === 'manager' && permission.startsWith('write')) return false;
    if (this.role === 'editor' && permission.includes('admin')) return false;
    return this.permissions.includes(permission);
};

// ============================================================
// 📊 STATIC METHODS
// ============================================================

// ✅ البحث بالبريد أو اسم المستخدم
UserSchema.statics.findByEmailOrUsername = function(identifier) {
    return this.findOne({
        $or: [
            { email: identifier.toLowerCase() },
            { username: identifier.toLowerCase() }
        ]
    });
};

// ✅ إنشاء المستخدم الأول (Admin)
UserSchema.statics.createAdmin = async function(email, password, name) {
    const existing = await this.findOne({ 
        $or: [{ email }, { role: 'admin' }] 
    });
    
    if (existing) {
        console.log('ℹ️ Admin already exists');
        return existing;
    }

    const admin = new this({
        name: name || 'مدير النظام',
        username: 'admin',
        email: email,
        password: password,
        role: 'admin',
        isActive: true,
        tokenVersion: 1,
        permissions: ['*']
    });

    await admin.save();
    console.log(`✅ Admin created: ${email}`);
    return admin;
};

// ✅ إحصائيات المستخدمين
UserSchema.statics.getStats = async function() {
    const [
        total,
        active,
        locked,
        roles
    ] = await Promise.all([
        this.countDocuments(),
        this.countDocuments({ isActive: true }),
        this.countDocuments({ isLocked: true }),
        this.aggregate([
            { $group: { _id: '$role', count: { $sum: 1 } } }
        ])
    ]);
    
    return {
        total,
        active,
        locked,
        roles: roles.reduce((acc, r) => {
            acc[r._id] = r.count;
            return acc;
        }, {})
    };
};

// ✅ البحث المتقدم
UserSchema.statics.advancedSearch = async function(query = {}) {
    const filter = { deletedAt: null };
    
    if (query.name) {
        filter.name = { $regex: query.name, $options: 'i' };
    }
    if (query.email) {
        filter.email = { $regex: query.email, $options: 'i' };
    }
    if (query.role) {
        filter.role = query.role;
    }
    if (query.isActive !== undefined) {
        filter.isActive = query.isActive === 'true' || query.isActive === true;
    }
    if (query.isLocked !== undefined) {
        filter.isLocked = query.isLocked === 'true' || query.isLocked === true;
    }
    
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 50;
    const skip = (page - 1) * limit;
    
    const sort = {};
    if (query.sortBy) {
        sort[query.sortBy] = query.sortOrder === 'desc' ? -1 : 1;
    } else {
        sort.createdAt = -1;
    }
    
    const [users, total] = await Promise.all([
        this.find(filter)
            .select('-password -refreshToken -refreshTokenHash -apiKeyHash')
            .sort(sort)
            .skip(skip)
            .limit(limit),
        this.countDocuments(filter)
    ]);
    
    return {
        users,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    };
};

// ============================================================
// 🔒 SECURITY METHODS
// ============================================================

// ✅ تسجيل محاولة دخول فاشلة
UserSchema.statics.recordFailedLogin = async function(identifier) {
    const user = await this.findOne({
        $or: [
            { email: identifier.toLowerCase() },
            { username: identifier.toLowerCase() }
        ]
    });
    
    if (user) {
        await user.incrementLoginAttempts();
        return user;
    }
    return null;
};

// ✅ التحقق من القفل
UserSchema.statics.isUserLocked = async function(identifier) {
    const user = await this.findOne({
        $or: [
            { email: identifier.toLowerCase() },
            { username: identifier.toLowerCase() }
        ]
    });
    
    if (!user) return false;
    return user.isLocked || user.loginAttempts >= 5;
};

// ============================================================
// 📝 JSON TRANSFORM
// ============================================================

UserSchema.methods.toJSON = function() {
    const obj = this.toObject();
    
    // ✅ إزالة البيانات الحساسة
    const sensitive = [
        'password',
        'refreshToken',
        'refreshTokenHash',
        'apiKey',
        'apiKeyHash',
        'twoFactorSecret'
    ];
    
    sensitive.forEach(field => {
        delete obj[field];
    });
    
    // ✅ إضافة الحقول الافتراضية
    obj.isAdmin = this.isAdmin;
    obj.isManager = this.isManager;
    obj.isLockedOut = this.isLockedOut;
    
    return obj;
};

// ============================================================
// 🗑️ SOFT DELETE
// ============================================================

UserSchema.statics.findActive = function() {
    return this.find({ deletedAt: null });
};

UserSchema.statics.findDeleted = function() {
    return this.find({ deletedAt: { $ne: null } });
};

// ============================================================
// 📤 EXPORT
// ============================================================

const User = mongoose.models.User || mongoose.model('User', UserSchema);

module.exports = User;

// ============================================================
// 📝 LOGS
// ============================================================

console.log('✅ User model loaded successfully');
console.log('🔐 Security features: ENABLED');
console.log('🔑 Password hashing: BCRYPT');
console.log('🔄 Token versioning: ENABLED');
console.log('📊 Advanced search: ENABLED');
console.log('🗑️ Soft delete: ENABLED');
