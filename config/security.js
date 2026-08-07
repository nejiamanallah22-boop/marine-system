// ============================================================
// 🔒 SECURITY CONFIGURATION
// ============================================================

const crypto = require('crypto');

class SecurityConfig {
    constructor() {
        // قراءة من متغيرات البيئة فقط
        this.encryptionKey = process.env.ENCRYPTION_KEY;
        this.jwtSecret = process.env.JWT_SECRET;
        this.jwtExpiry = process.env.JWT_EXPIRY || '7d';
        this.bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        
        // التحقق من وجود المفاتيح
        this.validateKeys();
    }

    validateKeys() {
        if (!this.encryptionKey || this.encryptionKey === 'your_64_char_encryption_key_here_generated_by_node_crypto') {
            console.warn('⚠️ WARNING: Using default encryption key!');
            if (process.env.NODE_ENV === 'production') {
                throw new Error('ENCRYPTION_KEY must be set in production');
            }
        }

        if (!this.jwtSecret || this.jwtSecret === 'your_super_secret_jwt_key_change_this_in_production') {
            console.warn('⚠️ WARNING: Using default JWT secret!');
            if (process.env.NODE_ENV === 'production') {
                throw new Error('JWT_SECRET must be set in production');
            }
        }
    }

    // توليد مفتاح آمن للتطوير
    generateDevKey() {
        if (process.env.NODE_ENV !== 'production') {
            return crypto.randomBytes(32).toString('hex');
        }
        return this.encryptionKey;
    }

    // التحقق من قوة كلمة المرور
    validatePassword(password) {
        const minLength = parseInt(process.env.PASSWORD_MIN_LENGTH) || 8;
        const requireUppercase = process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false';
        const requireLowercase = process.env.PASSWORD_REQUIRE_LOWERCASE !== 'false';
        const requireNumbers = process.env.PASSWORD_REQUIRE_NUMBERS !== 'false';
        const requireSpecial = process.env.PASSWORD_REQUIRE_SPECIAL !== 'false';

        const errors = [];

        if (password.length < minLength) {
            errors.push(`Password must be at least ${minLength} characters`);
        }

        if (requireUppercase && !/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        }

        if (requireLowercase && !/[a-z]/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        }

        if (requireNumbers && !/[0-9]/.test(password)) {
            errors.push('Password must contain at least one number');
        }

        if (requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            errors.push('Password must contain at least one special character');
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }
}

module.exports = new SecurityConfig();
