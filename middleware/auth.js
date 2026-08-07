const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { logger } = require('../utils/logger');
const User = require('../models/User');

class AuthManager {
    constructor() {
        this.secret = process.env.JWT_SECRET;
        this.expiry = process.env.JWT_EXPIRY || '7d';
        this.saltRounds = parseInt(process.env.SALT_ROUNDS) || 12;
    }

    // ====== توليد JWT ======
    generateToken(userId, role, permissions = []) {
        return jwt.sign(
            { 
                userId, 
                role, 
                permissions,
                iat: Math.floor(Date.now() / 1000)
            },
            this.secret,
            { expiresIn: this.expiry }
        );
    }

    // ====== التحقق من JWT ======
    verifyToken(token) {
        try {
            const decoded = jwt.verify(token, this.secret);
            return { valid: true, data: decoded };
        } catch (error) {
            logger.warn('JWT verification failed:', error.message);
            return { valid: false, error: error.message };
        }
    }

    // ====== Middleware للمصادقة ======
    authenticate(req, res, next) {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Missing or invalid token'
            });
        }

        const token = authHeader.split(' ')[1];
        const result = this.verifyToken(token);

        if (!result.valid) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: result.error
            });
        }

        req.user = result.data;
        next();
    }

    // ====== RBAC - التحقق من الصلاحيات ======
    checkPermission(requiredPermission) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'User not authenticated'
                });
            }

            const userPermissions = req.user.permissions || [];
            
            // Admin لديه جميع الصلاحيات
            if (req.user.role === 'admin') {
                return next();
            }

            if (!userPermissions.includes(requiredPermission)) {
                logger.warn(`Permission denied: ${req.user.userId} -> ${requiredPermission}`);
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Insufficient permissions'
                });
            }

            next();
        };
    }

    // ====== تشفير البيانات الحساسة ======
    encrypt(text) {
        const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return `${iv.toString('hex')}:${encrypted}`;
    }

    decrypt(encryptedText) {
        const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
        const [ivHex, encrypted] = encryptedText.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    // ====== التحقق من كلمة المرور ======
    async hashPassword(password) {
        return await bcrypt.hash(password, this.saltRounds);
    }

    async comparePassword(password, hash) {
        return await bcrypt.compare(password, hash);
    }

    // ====== توليد مفاتيح API ======
    generateApiKey() {
        return crypto.randomBytes(32).toString('hex');
    }

    hashApiKey(apiKey) {
        return crypto.createHash('sha256').update(apiKey).digest('hex');
    }
}

module.exports = new AuthManager();
