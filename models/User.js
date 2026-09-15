/**
 * 👤 نموذج المستخدم - v2.2
 * @module models/User
 * 
 * ✨ v2.1: إضافة حقل region (الإقليم/الوحدة)
 * ✨ v2.2: إضافة حقول الموقع (lat, lng, accuracy) + النشاط + userAgent
 *          لتفعيل نظام المراقبة الشاملة (monitoring)
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

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
    
    // ✅ الدور
    role: {
        type: String,
        default: 'viewer',
        trim: true
    },
    
    // ✅ الإقليم / الوحدة (جديد v2.1)
    region: {
        type: String,
        default: '',
        trim: true
    },
    
    permissions: {
        type: [String],
        default: []
    },
    
    // ✅ isActive
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    
    twoFactorEnabled: {
        type: Boolean,
        default: false
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
    
    tokenVersion: {
        type: Number,
        default: 0
    },
    
    createdAt: {
        type: Date,
        default: Date.now
    },
    
    updatedAt: {
        type: Date,
        default: Date.now
    },

    // ============================================================
    // 📍 v2.2 — حقول الموقع (GPS / Geolocation)
    // ============================================================
    lat: {
        type: Number,
        default: null,
        min: [-90, 'خط العرض يجب أن يكون بين -90 و 90'],
        max: [90, 'خط العرض يجب أن يكون بين -90 و 90']
    },

    lng: {
        type: Number,
        default: null,
        min: [-180, 'خط الطول يجب أن يكون بين -180 و 180'],
        max: [180, 'خط الطول يجب أن يكون بين -180 و 180']
    },

    // دقة الموقع بالمتر (من Geolocation API)
    accuracy: {
        type: Number,
        default: null,
        min: 0
    },

    // العنوان النصي (reverse geocoding — اختياري)
    location: {
        type: String,
        default: null,
        trim: true,
        maxlength: [300, 'العنوان طويل جداً']
    },

    // آخر تحديث للموقع
    lastLatLngUpdate: {
        type: Date,
        default: null
    },

    // ============================================================
    // 📱 v2.2 — حقول النشاط والجهاز
    // ============================================================
    lastActive: {
        type: Date,
        default: null,
        index: true
    },

    userAgent: {
        type: String,
        default: null,
        maxlength: [500, 'User-Agent طويل جداً']
    },

    // آخر IP مسجّل (اختياري للأمان)
    lastIp: {
        type: String,
        default: null,
        maxlength: 45 // IPv6 max length
    }

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    minimize: false // للحفاظ على null بدل حذفها
});

// ============================================================
// ✅ Indexes (v2.2 — للبحث الجغرافي السريع)
// ============================================================

// فهرس مركب للموقع (للاستعلامات "من موجود في هذه المنطقة؟")
UserSchema.index({ lat: 1, lng: 1 }, { 
    sparse: true,
    name: 'idx_geo'
});

// فهرس لآخر نشاط (للفلترة الزمنية)
UserSchema.index({ lastActive: -1 }, { 
    sparse: true,
    name: 'idx_lastActive'
});

// فهرس للبحث بالدور + الحالة (للإحصائيات)
UserSchema.index({ role: 1, isActive: 1 }, {
    name: 'idx_role_active'
});

// ============================================================
// ✅ Virtuals (للتوافق مع server.js)
// ============================================================

// ✅ `active` = `isActive`
UserSchema.virtual('active').get(function() {
    return this.isActive;
});

UserSchema.virtual('active').set(function(val) {
    this.isActive = Boolean(val);
});

// ✅ v2.2: هل المستخدم لديه موقع صالح؟
UserSchema.virtual('hasLocation').get(function() {
    return (
        typeof this.lat === 'number' && 
        typeof this.lng === 'number' &&
        this.lat >= -90 && this.lat <= 90 &&
        this.lng >= -180 && this.lng <= 180
    );
});

// ✅ v2.2: هل المستخدم نشط الآن (خلال آخر 5 دقائق)؟
UserSchema.virtual('isOnline').get(function() {
    if (!this.lastActive) return false;
    const diff = Date.now() - new Date(this.lastActive).getTime();
    return diff < 5 * 60 * 1000; // 5 دقائق
});

// ============================================================
// ✅ Hooks
// ============================================================

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

UserSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// ✅ v2.2: التحقق من صحة الإحداثيات قبل الحفظ
UserSchema.pre('save', function(next) {
    // إذا كان أحدهما موجوداً، يجب أن يكون الآخر موجوداً
    const hasLat = typeof this.lat === 'number';
    const hasLng = typeof this.lng === 'number';

    if (hasLat !== hasLng) {
        // اسمح بذلك — قد يكون تحديث جزئي
        // لكن تأكد من النطاقات
    }

    // التحقق من النطاقات (احتياطي)
    if (hasLat && (this.lat < -90 || this.lat > 90)) {
        return next(new Error('خط العرض خارج النطاق المسموح'));
    }
    if (hasLng && (this.lng < -180 || this.lng > 180)) {
        return next(new Error('خط الطول خارج النطاق المسموح'));
    }

    next();
});

// ============================================================
// ✅ Methods
// ============================================================

UserSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.isLocked = function() {
    if (!this.lockedUntil) return false;
    return new Date() < this.lockedUntil;
};

UserSchema.methods.incrementLoginAttempts = async function() {
    this.loginAttempts += 1;
    
    const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
    const lockoutMinutes = parseInt(process.env.LOCKOUT_MINUTES) || 30;
    
    if (this.loginAttempts >= maxAttempts) {
        this.lockedUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);
    }
    
    await this.save();
};

UserSchema.methods.resetLoginAttempts = async function() {
    this.loginAttempts = 0;
    this.lockedUntil = null;
    await this.save();
};

// ✅ v2.2: تحديث الموقع + النشاط (يُستدعى من monitoring route)
UserSchema.methods.updateLocation = async function(lat, lng, accuracy, userAgent, ip) {
    // التحقق من صحة الإحداثيات
    if (typeof lat !== 'number' || typeof lng !== 'number' ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new Error('إحداثيات غير صالحة');
    }

    this.lat = Number(lat.toFixed(6));
    this.lng = Number(lng.toFixed(6));
    this.accuracy = (typeof accuracy === 'number') ? Math.round(accuracy) : null;
    this.lastLatLngUpdate = new Date();
    this.lastActive = new Date();

    if (userAgent) {
        this.userAgent = String(userAgent).substring(0, 500);
    }
    if (ip) {
        this.lastIp = String(ip).substring(0, 45);
    }

    await this.save();
    return this;
};

// ✅ v2.2: تحديث النشاط فقط (بدون موقع) — heartbeat
UserSchema.methods.touchActivity = async function() {
    this.lastActive = new Date();
    // استخدم updateOne لتجنب تشغيل hooks كاملة
    await this.constructor.updateOne(
        { _id: this._id },
        { $set: { lastActive: this.lastActive } }
    );
    return this;
};

UserSchema.methods.toSafeObject = function() {
    const obj = this.toObject();
    delete obj.password;
    delete obj.twoFactorSecret;
    delete obj.__v;
    
    // ✅ أضف active
    obj.active = this.isActive;
    
    // ✅ v2.2: تأكد من أن الحقول الحساسة لا تُرسل
    // (lastIp يُرسل فقط للمسؤولين — يمكنك التحكم من الـ route)
    
    return obj;
};

// ============================================================
// ✅ Statics
// ============================================================

UserSchema.statics.findActive = function() {
    return this.find({ isActive: true });
};

UserSchema.statics.findByRole = function(role) {
    return this.find({ role: role });
};

// ✅ v2.2: جلب المستخدمين الذين لديهم موقع
UserSchema.statics.findWithLocation = function() {
    return this.find({
        lat: { $ne: null, $gte: -90, $lte: 90 },
        lng: { $ne: null, $gte: -180, $lte: 180 }
    });
};

// ✅ v2.2: جلب المستخدمين النشطين خلال آخر X دقيقة
UserSchema.statics.findRecentlyActive = function(minutes = 5) {
    const since = new Date(Date.now() - minutes * 60 * 1000);
    return this.find({ lastActive: { $gte: since } });
};

// ✅ v2.2: إحصائيات سريعة (للوحة المراقبة)
UserSchema.statics.getMonitoringStats = async function() {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const [total, active, admins, noLocation] = await Promise.all([
        this.countDocuments({}),
        this.countDocuments({ isActive: true, lastActive: { $gte: fiveMinAgo } }),
        this.countDocuments({ role: { $in: ['admin', 'manager'] }, isActive: true }),
        this.countDocuments({
            $or: [
                { lat: null },
                { lng: null },
                { lat: { $exists: false } },
                { lng: { $exists: false } }
            ]
        })
    ]);

    return { total, active, admins, noLocation };
};

const User = mongoose.model('User', UserSchema);

module.exports = User;
