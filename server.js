// ============================================================
// 🚀 منظومة الوسائل البحرية - الخادم المتكامل الكامل
// ✅ ملف واحد يحتوي على كل شيء - جاهز للتشغيل الفوري
// ============================================================

const express = require('express');
const http = require('http');
const https = require('https');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const xss = require('xss');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');
const speakeasy = require('speakeasy');
const winston = require('winston');
require('dotenv').config();

// ============================================================
// ✅ إنشاء المجلدات الأساسية
// ============================================================

(async function createDirectories() {
    const dirs = ['logs', 'archive', 'backups', 'public'];
    for (const dir of dirs) {
        try {
            await fs.mkdir(dir, { recursive: true });
        } catch (error) {
            console.error(`❌ فشل إنشاء مجلد ${dir}:`, error);
        }
    }
})();

// ============================================================
// ✅ التحقق من المتغيرات البيئية
// ============================================================

if (!process.env.JWT_SECRET) {
    console.warn('⚠️ تحذير: JWT_SECRET غير معين - سيتم استخدام مفتاح افتراضي');
    process.env.JWT_SECRET = crypto.randomBytes(64).toString('hex');
}

if (!process.env.JWT_REFRESH_SECRET) {
    console.warn('⚠️ تحذير: JWT_REFRESH_SECRET غير معين - سيتم استخدام مفتاح افتراضي');
    process.env.JWT_REFRESH_SECRET = crypto.randomBytes(64).toString('hex');
}

if (!process.env.ENCRYPTION_KEY) {
    console.warn('⚠️ تحذير: ENCRYPTION_KEY غير معين - سيتم استخدام مفتاح افتراضي');
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
}

// ============================================================
// 📝 نظام التسجيل (Winston)
// ============================================================

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 5242880,
            maxFiles: 10,
        }),
        new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 5242880,
            maxFiles: 10,
        }),
        new winston.transports.Console({
            format: process.env.NODE_ENV === 'production'
                ? winston.format.json()
                : winston.format.simple()
        })
    ]
});

// ============================================================
// 📋 الإعدادات
// ============================================================

const CONFIG = {
    port: parseInt(process.env.PORT) || 3443,
    environment: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
    appName: 'MarineSecuritySystem',
    version: '9.0.0',

    security: {
        jwtSecret: process.env.JWT_SECRET,
        jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
        encryptionKey: process.env.ENCRYPTION_KEY,
        saltRounds: parseInt(process.env.SALT_ROUNDS) || 12,
        sessionTimeout: 15 * 60,
        maxLoginAttempts: 5,
        lockoutDuration: 30 * 60,
        maxConcurrentSessions: 3,
        refreshTokenRotation: true,
        jwtIssuer: 'MarineSecuritySystem',
        jwtAudience: 'MarineSecuritySystem-API',
        passwordMinLength: 8,
        passwordRequireUppercase: true,
        passwordRequireLowercase: true,
        passwordRequireNumbers: true,
        passwordRequireSpecialChars: true
    },

    ssl: {
        enabled: process.env.SSL_ENABLED === 'true',
        key: process.env.SSL_KEY_PATH,
        cert: process.env.SSL_CERT_PATH,
        ca: process.env.SSL_CA_PATH
    },

    redis: {
        enabled: process.env.REDIS_ENABLED === 'true',
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB) || 0
    },

    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],

    performance: {
        maxRequestSize: '1mb',
        locationsPerPage: 100,
        maxLocations: 10000,
        maxAuditLogs: 5000,
        sessionCleanupAge: 7 * 24 * 60 * 60 * 1000,
        socketRateLimit: 10,
        socketRateWindow: 1000,
        encryptBatchSize: 50,
        encryptBatchInterval: 5000,
        maxBackups: 24,
        backupInterval: 3600000,
        cleanupInterval: 3600000
    },

    roles: {
        'القيادة_العليا': {
            level: 100,
            permissions: ['*'],
            twoFactorRequired: true,
            sessionTimeout: 15 * 60,
            maxDevices: 2
        },
        'قائد_الوحدة': {
            level: 80,
            permissions: [
                'vessels:read', 'vessels:write', 'vessels:delete',
                'users:read',
                'tickets:read', 'tickets:write', 'tickets:reply', 'tickets:close',
                'logs:read',
                'locations:read', 'locations:write',
                'reports:read',
                'system:read'
            ],
            twoFactorRequired: true,
            sessionTimeout: 30 * 60,
            maxDevices: 3
        },
        'ضابط_عمليات': {
            level: 60,
            permissions: [
                'vessels:read', 'vessels:write',
                'locations:read', 'locations:write',
                'tickets:read', 'tickets:write',
                'reports:read',
                'system:read'
            ],
            twoFactorRequired: false,
            sessionTimeout: 45 * 60,
            maxDevices: 4
        },
        'ضابط_ملاحة': {
            level: 40,
            permissions: [
                'vessels:read',
                'locations:read',
                'logs:read',
                'reports:read'
            ],
            twoFactorRequired: false,
            sessionTimeout: 60 * 60,
            maxDevices: 5
        },
        'مشاهد': {
            level: 20,
            permissions: [
                'vessels:read',
                'locations:read'
            ],
            twoFactorRequired: false,
            sessionTimeout: 120 * 60,
            maxDevices: 10
        }
    }
};

// ============================================================
// 🔐 مدير الأمان
// ============================================================

class SecurityManager {
    constructor() {
        this.encryptionKey = Buffer.from(CONFIG.security.encryptionKey, 'hex');
        this.algorithm = 'aes-256-gcm';

        this.failedAttempts = new Map();
        this.lockedUsers = new Map();
        this.blockedIPs = new Set();
        this.sessionTokens = new Map();
        this.refreshTokens = new Map();
        this.blacklistedTokens = new Set();
        this.onlineUsers = new Map();
        this.auditLogs = [];
        this.socketRateLimits = new Map();

        this.encryptBatch = [];
        this.encryptTimer = null;
        this.isShuttingDown = false;

        this.startCleanup();
        this.startEncryptBatch();
        this.startBackup();
    }

    // ==================== التشفير ====================
    encrypt(data) {
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
            const dataBuffer = Buffer.from(JSON.stringify(data), 'utf8');
            const encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);
            const authTag = cipher.getAuthTag();
            return {
                iv: iv.toString('hex'),
                encrypted: encrypted.toString('hex'),
                authTag: authTag.toString('hex'),
                version: '1.0',
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error('❌ فشل التشفير:', error);
            throw new Error('فشل تشفير البيانات');
        }
    }

    decrypt(encryptedData) {
        try {
            const { iv, encrypted, authTag } = encryptedData;
            const decipher = crypto.createDecipheriv(
                this.algorithm,
                this.encryptionKey,
                Buffer.from(iv, 'hex')
            );
            decipher.setAuthTag(Buffer.from(authTag, 'hex'));
            const decrypted = Buffer.concat([
                decipher.update(Buffer.from(encrypted, 'hex')),
                decipher.final()
            ]);
            return JSON.parse(decrypted.toString('utf8'));
        } catch (error) {
            logger.error('❌ فشل فك التشفير:', error);
            throw new Error('فشل فك تشفير البيانات');
        }
    }

    // ==================== الكتابة الذرية ====================
    async atomicWrite(filePath, data) {
        const tempPath = filePath + '.tmp';
        try {
            await fs.writeFile(tempPath, data);
            await fs.rename(tempPath, filePath);
            return true;
        } catch (error) {
            logger.error('❌ فشل الكتابة الذرية:', error);
            try { await fs.unlink(tempPath); } catch (e) {}
            throw error;
        }
    }

    // ==================== تشفير على دفعات ====================
    startEncryptBatch() {
        if (this.encryptTimer) clearInterval(this.encryptTimer);
        this.encryptTimer = setInterval(() => {
            if (this.encryptBatch.length > 0 && !this.isShuttingDown) {
                this.processEncryptBatch();
            }
        }, CONFIG.performance.encryptBatchInterval);
    }

    async processEncryptBatch() {
        try {
            const batch = this.encryptBatch.splice(0, CONFIG.performance.encryptBatchSize);
            if (batch.length === 0) return;

            const combined = batch.map(item => item.data);
            const encrypted = this.encrypt(combined);
            await this.atomicWrite('data.encrypted', JSON.stringify(encrypted, null, 2));
            logger.info(`💾 تم تشفير وحفظ ${batch.length} عملية`);
        } catch (error) {
            logger.error('❌ فشل معالجة دفعة التشفير:', error);
        }
    }

    queueEncrypt(data) {
        if (this.isShuttingDown) return;
        this.encryptBatch.push({
            id: uuidv4(),
            data,
            timestamp: Date.now()
        });

        if (this.encryptBatch.length >= CONFIG.performance.encryptBatchSize) {
            this.processEncryptBatch();
        }
    }

    // ==================== النسخ الاحتياطي ====================
    startBackup() {
        setInterval(async () => {
            if (!this.isShuttingDown) {
                await this.createBackup();
            }
        }, CONFIG.performance.backupInterval);
    }

    async createBackup() {
        try {
            const dataPath = 'data.encrypted';
            try { await fs.access(dataPath); } catch { return; }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = `backups/data.backup.${timestamp}.encrypted`;

            await fs.copyFile(dataPath, backupPath);

            const files = await fs.readdir('backups');
            const backups = files.filter(f => f.startsWith('data.backup.') && f.endsWith('.encrypted'))
                .sort()
                .reverse();

            if (backups.length > CONFIG.performance.maxBackups) {
                for (let i = CONFIG.performance.maxBackups; i < backups.length; i++) {
                    await fs.unlink(path.join('backups', backups[i]));
                }
            }

            logger.info(`💾 تم إنشاء نسخة احتياطية: ${backupPath}`);
        } catch (error) {
            logger.error('❌ فشل إنشاء النسخة الاحتياطية:', error);
        }
    }

    // ==================== التنظيف التلقائي ====================
    startCleanup() {
        setInterval(() => {
            if (!this.isShuttingDown) {
                this.cleanupExpired();
            }
        }, CONFIG.performance.cleanupInterval);
    }

    cleanupExpired() {
        const now = Date.now();
        const sessionMaxAge = CONFIG.performance.sessionCleanupAge;

        for (const [sessionId, session] of this.sessionTokens) {
            if (session.expires < now || (now - session.createdAt) > sessionMaxAge) {
                this.sessionTokens.delete(sessionId);
            }
        }

        for (const [tokenId, tokenData] of this.refreshTokens) {
            if (tokenData.expires < now) {
                this.refreshTokens.delete(tokenId);
            }
        }

        if (this.auditLogs.length > CONFIG.performance.maxAuditLogs) {
            this.auditLogs = this.auditLogs.slice(-CONFIG.performance.maxAuditLogs);
        }

        for (const [socketId, data] of this.socketRateLimits) {
            if ((now - data.resetTime) > 60000) {
                this.socketRateLimits.delete(socketId);
            }
        }
    }

    // ==================== Blacklist ====================
    async loadBlacklist() {
        try {
            const data = await fs.readFile('blacklist.json', 'utf8');
            const parsed = JSON.parse(data);
            this.blacklistedTokens = new Set(parsed.tokens || []);
            logger.info(`✅ تم تحميل ${this.blacklistedTokens.size} رمز من القائمة السوداء`);
        } catch (error) { }
    }

    async saveBlacklist() {
        if (this.isShuttingDown) return;
        try {
            await fs.writeFile('blacklist.json', JSON.stringify({
                tokens: Array.from(this.blacklistedTokens),
                updatedAt: new Date().toISOString()
            }, null, 2));
        } catch (error) {
            logger.error('❌ فشل حفظ القائمة السوداء:', error);
        }
    }

    // ==================== الجلسات ====================
    createSession(user, deviceInfo = {}) {
        const sessionId = uuidv4();
        const now = Date.now();
        const maxDevices = CONFIG.roles[user.role]?.maxDevices || CONFIG.security.maxConcurrentSessions;

        const userSessions = [];
        for (const [sid, session] of this.sessionTokens) {
            if (session.userId === user.id) {
                userSessions.push({ sid, session });
            }
        }

        if (userSessions.length >= maxDevices) {
            userSessions.sort((a, b) => a.session.createdAt - b.session.createdAt);
            const oldest = userSessions[0];
            this.sessionTokens.delete(oldest.sid);
            if (oldest.session.refreshTokenId) {
                this.refreshTokens.delete(oldest.session.refreshTokenId);
            }
        }

        const session = {
            id: sessionId,
            userId: user.id,
            userName: user.name,
            role: user.role,
            createdAt: now,
            expires: now + CONFIG.security.sessionTimeout * 1000,
            lastActivity: now,
            ip: deviceInfo.ip,
            userAgent: deviceInfo.userAgent,
            deviceId: deviceInfo.deviceId || uuidv4(),
            refreshTokenId: uuidv4()
        };

        this.sessionTokens.set(sessionId, session);

        const accessToken = jwt.sign(
            {
                id: user.id,
                name: user.name,
                role: user.role,
                sessionId,
                deviceId: session.deviceId,
                sub: user.id,
                iss: CONFIG.security.jwtIssuer,
                aud: CONFIG.security.jwtAudience
            },
            CONFIG.security.jwtSecret,
            { expiresIn: '15m', algorithm: 'HS512' }
        );

        const refreshToken = jwt.sign(
            {
                id: user.id,
                refreshTokenId: session.refreshTokenId,
                deviceId: session.deviceId,
                sub: user.id,
                iss: CONFIG.security.jwtIssuer,
                aud: CONFIG.security.jwtAudience
            },
            CONFIG.security.jwtRefreshSecret,
            { expiresIn: '7d', algorithm: 'HS512' }
        );

        this.refreshTokens.set(session.refreshTokenId, {
            userId: user.id,
            sessionId: sessionId,
            deviceId: session.deviceId,
            createdAt: now,
            expires: now + 7 * 24 * 60 * 60 * 1000
        });

        return { session, accessToken, refreshToken };
    }

    validateSession(sessionId) {
        if (!sessionId) return { valid: false, reason: 'no_session_id' };
        const session = this.sessionTokens.get(sessionId);
        if (!session) {
            return { valid: false, reason: 'session_not_found' };
        }
        if (session.expires < Date.now()) {
            this.sessionTokens.delete(sessionId);
            return { valid: false, reason: 'session_expired' };
        }
        if (this.blacklistedTokens.has(sessionId)) {
            return { valid: false, reason: 'session_revoked' };
        }
        return { valid: true, session };
    }

    validateRefreshToken(refreshTokenId) {
        const tokenData = this.refreshTokens.get(refreshTokenId);
        if (!tokenData) {
            return { valid: false, reason: 'token_not_found' };
        }
        if (tokenData.expires < Date.now()) {
            this.refreshTokens.delete(refreshTokenId);
            return { valid: false, reason: 'token_expired' };
        }
        if (this.blacklistedTokens.has(refreshTokenId)) {
            return { valid: false, reason: 'token_revoked' };
        }
        return { valid: true, tokenData };
    }

    verifyToken(token, type = 'access') {
        try {
            const secret = type === 'access'
                ? CONFIG.security.jwtSecret
                : CONFIG.security.jwtRefreshSecret;

            const decoded = jwt.verify(token, secret, {
                issuer: CONFIG.security.jwtIssuer,
                audience: CONFIG.security.jwtAudience
            });

            if (type === 'refresh') {
                const tokenData = this.validateRefreshToken(decoded.refreshTokenId);
                if (!tokenData.valid) {
                    throw new Error(tokenData.reason);
                }
                if (CONFIG.security.refreshTokenRotation) {
                    this.rotateRefreshToken(decoded.refreshTokenId);
                }
            }

            return decoded;
        } catch (error) {
            logger.warn('❌ فشل التحقق من التوكن:', error.message);
            throw error;
        }
    }

    rotateRefreshToken(oldRefreshTokenId) {
        this.blacklistedTokens.add(oldRefreshTokenId);
        this.refreshTokens.delete(oldRefreshTokenId);
        this.saveBlacklist();
        return true;
    }

    revokeSession(sessionId) {
        this.blacklistedTokens.add(sessionId);
        const session = this.sessionTokens.get(sessionId);
        if (session) {
            this.blacklistedTokens.add(session.refreshTokenId);
            this.refreshTokens.delete(session.refreshTokenId);
            this.sessionTokens.delete(sessionId);
        }
        this.saveBlacklist();
    }

    // ==================== إدارة المستخدمين المتصلين ====================
    addOnlineUser(userName) {
        const count = this.onlineUsers.get(userName) || 0;
        this.onlineUsers.set(userName, count + 1);
    }

    removeOnlineUser(userName) {
        const count = this.onlineUsers.get(userName) || 0;
        if (count <= 1) {
            this.onlineUsers.delete(userName);
        } else {
            this.onlineUsers.set(userName, count - 1);
        }
    }

    getOnlineUsers() {
        return Array.from(this.onlineUsers.keys());
    }

    // ==================== معدل Socket ====================
    checkSocketRate(socketId) {
        const now = Date.now();
        const rateData = this.socketRateLimits.get(socketId) || {
            count: 0,
            resetTime: now + CONFIG.performance.socketRateWindow
        };

        if (now > rateData.resetTime) {
            rateData.count = 0;
            rateData.resetTime = now + CONFIG.performance.socketRateWindow;
        }

        rateData.count++;
        this.socketRateLimits.set(socketId, rateData);
        return rateData.count <= CONFIG.performance.socketRateLimit;
    }

    // ==================== إحداثيات GPS ====================
    validateCoordinates(lat, lng) {
        if (typeof lat !== 'number' || typeof lng !== 'number') {
            throw new Error('الإحداثيات يجب أن تكون أرقاماً');
        }
        if (!isFinite(lat) || !isFinite(lng)) {
            throw new Error('الإحداثيات غير صالحة');
        }
        if (lat < -90 || lat > 90) {
            throw new Error('خط العرض خارج النطاق (-90 إلى 90)');
        }
        if (lng < -180 || lng > 180) {
            throw new Error('خط الطول خارج النطاق (-180 إلى 180)');
        }
        return { lat, lng };
    }

    // ==================== إدارة المحاولات ====================
    checkLockout(username) {
        const attempts = this.failedAttempts.get(username) || 0;
        const lockTime = this.lockedUsers.get(username);
        if (lockTime && (Date.now() - lockTime) < CONFIG.security.lockoutDuration * 1000) {
            return {
                locked: true,
                remaining: Math.ceil((CONFIG.security.lockoutDuration * 1000 - (Date.now() - lockTime)) / 60000)
            };
        }
        if (lockTime) {
            this.lockedUsers.delete(username);
            this.failedAttempts.delete(username);
        }
        return { locked: false, attempts };
    }

    recordFailedAttempt(username, ip) {
        const attempts = (this.failedAttempts.get(username) || 0) + 1;
        this.failedAttempts.set(username, attempts);
        if (attempts >= CONFIG.security.maxLoginAttempts) {
            this.lockedUsers.set(username, Date.now());
            this.logSecurityEvent('USER_LOCKED', { username, attempts, ip });
            return { locked: true, attempts };
        }
        return { locked: false, attempts, remaining: CONFIG.security.maxLoginAttempts - attempts };
    }

    resetFailedAttempts(username) {
        this.failedAttempts.delete(username);
        this.lockedUsers.delete(username);
    }

    isIPBlocked(ip) {
        return this.blockedIPs.has(ip);
    }

    blockIP(ip, reason = 'غير محدد') {
        this.blockedIPs.add(ip);
        this.logSecurityEvent('IP_BLOCKED', { ip, reason });
        setTimeout(() => {
            this.blockedIPs.delete(ip);
            this.logSecurityEvent('IP_UNBLOCKED', { ip });
        }, 60 * 60 * 1000);
    }

    // ==================== TOTP ====================
    generateTOTPSecret() {
        const secret = speakeasy.generateSecret({
            name: CONFIG.appName,
            length: 20,
            issuer: CONFIG.appName
        });
        return {
            base32: secret.base32,
            otpauth_url: secret.otpauth_url
        };
    }

    verifyTOTP(secret, token) {
        return speakeasy.totp.verify({
            secret: secret,
            encoding: 'base32',
            token: token,
            window: 1
        });
    }

    // ==================== السجلات الأمنية ====================
    logSecurityEvent(type, data) {
        const safeData = { ...data };
        delete safeData.password;
        delete safeData.token;
        delete safeData.refreshToken;
        delete safeData.accessToken;
        delete safeData.twoFactorSecret;

        const log = {
            type,
            data: safeData,
            timestamp: new Date().toISOString(),
            id: uuidv4()
        };
        this.auditLogs.push(log);
        if (this.auditLogs.length > CONFIG.performance.maxAuditLogs) {
            this.auditLogs = this.auditLogs.slice(-CONFIG.performance.maxAuditLogs);
        }
        logger.info(`🔒 ${type}:`, safeData);
    }

    getAuditLogs(limit = 100) {
        return this.auditLogs.slice(-limit).reverse();
    }

    // ==================== قوة كلمة المرور ====================
    validatePasswordStrength(password) {
        const errors = [];
        if (password.length < CONFIG.security.passwordMinLength) {
            errors.push(`كلمة المرور يجب أن تكون ${CONFIG.security.passwordMinLength} أحرف على الأقل`);
        }
        if (CONFIG.security.passwordRequireUppercase && !/[A-Z]/.test(password)) {
            errors.push('يجب أن تحتوي على حرف كبير');
        }
        if (CONFIG.security.passwordRequireLowercase && !/[a-z]/.test(password)) {
            errors.push('يجب أن تحتوي على حرف صغير');
        }
        if (CONFIG.security.passwordRequireNumbers && !/[0-9]/.test(password)) {
            errors.push('يجب أن تحتوي على رقم');
        }
        if (CONFIG.security.passwordRequireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            errors.push('يجب أن تحتوي على رمز خاص');
        }
        return { valid: errors.length === 0, errors };
    }

    // ==================== الصلاحيات ====================
    hasPermission(role, resource, action) {
        const roleConfig = CONFIG.roles[role];
        if (!roleConfig) return false;

        const permissions = roleConfig.permissions;
        return permissions.includes('*') ||
            permissions.includes(`${resource}:*`) ||
            permissions.includes(`${resource}:${action}`);
    }

    getRoleConfig(role) {
        return CONFIG.roles[role] || null;
    }

    // ==================== إغلاق آمن ====================
    async shutdown() {
        this.isShuttingDown = true;

        if (this.encryptTimer) {
            clearInterval(this.encryptTimer);
            this.encryptTimer = null;
        }

        if (this.encryptBatch.length > 0) {
            await this.processEncryptBatch();
        }

        await this.saveBlacklist();
        logger.info('✅ تم إغلاق الأمان بشكل آمن');
    }

    async initialize() {
        await this.loadBlacklist();
        logger.info('✅ تم تهيئة مدير الأمان');
        return this;
    }
}

// ============================================================
// 💾 مدير البيانات
// ============================================================

class DataManager {
    constructor() {
        this.security = new SecurityManager();
        this.data = {
            users: [],
            vessels: [],
            tickets: [],
            logs: [],
            locations: [],
            incidents: []
        };
        this.filePath = 'data.encrypted';
        this.initialized = false;
        this.locationPage = 0;
        this.locationCache = [];
        this.saveTimer = null;
    }

    async initialize() {
        try {
            await this.security.initialize();

            let encryptedData;
            try {
                encryptedData = await fs.readFile(this.filePath, 'utf8');
            } catch (error) {
                const backups = await this.getBackups();
                if (backups.length > 0) {
                    encryptedData = await fs.readFile(backups[0], 'utf8');
                    logger.info(`✅ تم الاستعادة من: ${backups[0]}`);
                } else {
                    throw new Error('لا توجد نسخ احتياطية');
                }
            }

            const decrypted = this.security.decrypt(JSON.parse(encryptedData));
            this.data = decrypted;
            logger.info('✅ تم تحميل البيانات');
        } catch (error) {
            logger.info('📝 إنشاء بيانات جديدة');
            await this.createDefaultData();
        }
        this.initialized = true;
    }

    async getBackups() {
        try {
            const files = await fs.readdir('.');
            return files.filter(f => f.startsWith('data.backup.') && f.endsWith('.encrypted'))
                .sort()
                .reverse();
        } catch {
            return [];
        }
    }

    async createDefaultData() {
        if (this.data.users.length > 0) return;

        const hashedPassword = await bcrypt.hash('SecurePass123!', CONFIG.security.saltRounds);
        const totpSecret = this.security.generateTOTPSecret();

        this.data.users = [{
            id: uuidv4(),
            name: 'admin',
            password: hashedPassword,
            role: 'القيادة_العليا',
            enabled: true,
            twoFactorSecret: totpSecret.base32,
            twoFactorEnabled: true,
            twoFactorUrl: totpSecret.otpauth_url,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            isAdmin: true,
            mustChangePassword: true
        }];

        this.data.vessels = [];
        this.data.tickets = [];
        this.data.locations = [];

        await this.save(true);

        logger.warn('⚠️ تم إنشاء حساب إداري افتراضي');
        logger.warn('   👤 admin');
        logger.warn('   🔑 SecurePass123!');
        logger.warn('   ⚠️ يرجى تغيير كلمة المرور فوراً!');
    }

    async addLocation(location) {
        this.locationCache.push(location);

        if (this.locationCache.length >= CONFIG.performance.locationsPerPage) {
            await this.flushLocationPage();
        }

        this.data.locations.push(location);
        if (this.data.locations.length > CONFIG.performance.maxLocations) {
            this.data.locations = this.data.locations.slice(-CONFIG.performance.maxLocations);
        }

        await this.save();
        return location;
    }

    async flushLocationPage() {
        if (this.locationCache.length === 0) return;

        try {
            const pageData = {
                page: this.locationPage,
                count: this.locationCache.length,
                data: this.locationCache,
                timestamp: new Date().toISOString()
            };

            const filename = `archive/locations.page.${this.locationPage}.json`;
            await fs.writeFile(filename, JSON.stringify(pageData, null, 2));

            this.locationPage++;
            this.locationCache = [];

            logger.info(`📄 تم حفظ صفحة المواقع #${this.locationPage - 1}`);
        } catch (error) {
            logger.error('❌ فشل حفظ صفحة المواقع:', error);
        }
    }

    async getLocations(page = 0, limit = 100) {
        let locations = this.data.locations.slice(-limit);

        if (page > 0) {
            try {
                const filename = `archive/locations.page.${page}.json`;
                const data = await fs.readFile(filename, 'utf8');
                const parsed = JSON.parse(data);
                locations = parsed.data.concat(locations);
            } catch (error) { }
        }

        return locations.slice(0, limit);
    }

    async save(immediate = false) {
        if (immediate) {
            return this._saveToFile();
        }
        this.security.queueEncrypt(this.data);
    }

    async _saveToFile() {
        try {
            const encrypted = this.security.encrypt(this.data);
            await this.security.atomicWrite(this.filePath, JSON.stringify(encrypted, null, 2));
            logger.info('💾 تم حفظ البيانات');
        } catch (error) {
            logger.error('❌ فشل حفظ البيانات:', error);
            throw error;
        }
    }

    findUser(name) {
        return this.data.users.find(u => u.name === name && u.enabled);
    }

    findUserById(id) {
        return this.data.users.find(u => u.id === id && u.enabled);
    }

    async validateUser(name, password, twoFactorCode = null) {
        const lockStatus = this.security.checkLockout(name);
        if (lockStatus.locked) {
            throw new Error(`المستخدم مقفل لمدة ${lockStatus.remaining} دقيقة`);
        }

        const user = this.findUser(name);
        if (!user) {
            this.security.recordFailedAttempt(name);
            throw new Error('بيانات تسجيل الدخول غير صحيحة');
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            const status = this.security.recordFailedAttempt(name);
            if (status.locked) {
                throw new Error('تم قفل المستخدم');
            }
            throw new Error('بيانات تسجيل الدخول غير صحيحة');
        }

        if (user.mustChangePassword) {
            throw new Error('يجب تغيير كلمة المرور في أول تسجيل دخول');
        }

        if (user.twoFactorEnabled) {
            if (!twoFactorCode) {
                throw new Error('مطلوب رمز التحقق الثنائي');
            }
            const isValid = this.security.verifyTOTP(user.twoFactorSecret, twoFactorCode);
            if (!isValid) {
                throw new Error('رمز التحقق الثنائي غير صحيح');
            }
        }

        this.security.resetFailedAttempts(name);
        user.lastLogin = new Date().toISOString();
        await this.save();

        return user;
    }

    async changePassword(userId, oldPassword, newPassword) {
        const user = this.findUserById(userId);
        if (!user) throw new Error('المستخدم غير موجود');

        const strength = this.security.validatePasswordStrength(newPassword);
        if (!strength.valid) {
            throw new Error(strength.errors.join('. '));
        }

        const valid = await bcrypt.compare(oldPassword, user.password);
        if (!valid) {
            throw new Error('كلمة المرور القديمة غير صحيحة');
        }

        const hashedPassword = await bcrypt.hash(newPassword, CONFIG.security.saltRounds);
        user.password = hashedPassword;
        user.mustChangePassword = false;
        user.passwordChangedAt = new Date().toISOString();

        await this.save();
        return true;
    }

    async shutdown() {
        await this.flushLocationPage();
        await this._saveToFile();
        await this.security.shutdown();
        logger.info('✅ تم إغلاق البيانات بشكل آمن');
    }
}

// ============================================================
// 🚀 تهيئة التطبيق
// ============================================================

const app = express();
const dataManager = new DataManager();
const security = dataManager.security;

// ============================================================
// 🛡️ وسائط الأمان (Express)
// ============================================================

function sanitizeInput(obj) {
    if (typeof obj === 'string') {
        return xss(obj, {
            whiteList: {},
            stripIgnoreTag: true,
            stripIgnoreTagBody: ['script', 'style']
        });
    }
    if (typeof obj === 'object' && obj !== null) {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = sanitizeInput(value);
        }
        return result;
    }
    return obj;
}

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: CONFIG.isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'"],
            styleSrc: CONFIG.isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "https:"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

app.use(cors({
    origin: (origin, callback) => {
        if (CONFIG.isProduction) {
            if (!origin || CONFIG.allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Origin غير مسموح به'));
            }
        } else {
            callback(null, true);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-2FA-Token']
}));

app.use(compression());
app.use(express.json({ limit: CONFIG.performance.maxRequestSize }));
app.use(express.urlencoded({ extended: true, limit: CONFIG.performance.maxRequestSize }));

app.use((req, res, next) => {
    if (req.body) req.body = sanitizeInput(req.body);
    if (req.query) req.query = sanitizeInput(req.query);
    if (req.params) req.params = sanitizeInput(req.params);
    next();
});

app.use((req, res, next) => {
    if (security.isIPBlocked(req.ip)) {
        return res.status(403).json({ error: 'عنوان IP محظور' });
    }
    next();
});

const defaultLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'طلبات كثيرة، حاول بعد 15 دقيقة' },
    handler: (req, res) => {
        security.blockIP(req.ip, 'مفرط');
        res.status(429).json({ error: 'تم حظر IP مؤقتاً' });
    }
});
app.use('/api/', defaultLimiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'محاولات كثيرة، حاول بعد 15 دقيقة' }
});

// ============================================================
// ✅ وسيط المصادقة
// ============================================================

const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'مطلوب مصادقة' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'رمز غير صالح' });
        }

        const decoded = security.verifyToken(token, 'access');
        const session = security.validateSession(decoded.sessionId);
        if (!session.valid) {
            return res.status(401).json({ error: 'جلسة غير صالحة' });
        }

        req.user = decoded;
        req.sessionId = decoded.sessionId;
        session.session.lastActivity = Date.now();
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'انتهت صلاحية الجلسة' });
        }
        return res.status(403).json({ error: 'غير مصرح' });
    }
};

const authorize = (resource, action) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'غير مصرح' });
        }

        const user = dataManager.findUserById(req.user.id);
        if (!user || !user.enabled) {
            return res.status(403).json({ error: 'المستخدم غير مفعل' });
        }

        if (!security.hasPermission(user.role, resource, action)) {
            security.logSecurityEvent('UNAUTHORIZED_ACCESS', {
                user: user.name,
                resource,
                action,
                ip: req.ip
            });
            return res.status(403).json({ error: 'ليس لديك صلاحية' });
        }

        const roleConfig = security.getRoleConfig(user.role);
        if (roleConfig?.twoFactorRequired && !req.headers['x-2fa-token']) {
            return res.status(401).json({
                error: 'مطلوب رمز التحقق الثنائي',
                requires2FA: true
            });
        }

        next();
    };
};

const validate = (validations) => {
    return async (req, res, next) => {
        await Promise.all(validations.map(validation => validation.run(req)));

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                errors: errors.array().map(err => ({
                    field: err.param,
                    message: err.msg
                }))
            });
        }
        next();
    };
};

// ============================================================
// 📡 نقاط النهاية
// ============================================================

function getCategory(len) {
    const n = parseFloat(len);
    if (n === 11) return "البروق";
    if (n >= 8 && n <= 12) return "صقور";
    if (n > 12 && n <= 25) return "خوافر";
    if (n >= 30) return "طوافات";
    return "زوارق مزدوجة";
}

// ===== المصادقة =====

app.post('/api/auth/change-password',
    authenticate,
    validate([
        body('oldPassword').notEmpty(),
        body('newPassword').isLength({ min: CONFIG.security.passwordMinLength })
    ]),
    async (req, res) => {
        try {
            await dataManager.changePassword(req.user.id, req.body.oldPassword, req.body.newPassword);
            res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

app.post('/api/auth/login',
    authLimiter,
    validate([
        body('name').notEmpty().trim().escape(),
        body('password').notEmpty()
    ]),
    async (req, res) => {
        try {
            const { name, password, twoFactorCode } = req.body;

            const user = await dataManager.validateUser(name, password, twoFactorCode);
            const { session, accessToken, refreshToken } = security.createSession(user, {
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                deviceId: req.headers['x-device-id'] || uuidv4()
            });

            security.logSecurityEvent('LOGIN_SUCCESS', {
                user: user.name,
                role: user.role,
                ip: req.ip
            });

            res.json({
                success: true,
                user: {
                    id: user.id,
                    name: user.name,
                    role: user.role,
                    permissions: security.getRoleConfig(user.role)?.permissions || []
                },
                accessToken,
                refreshToken,
                sessionId: session.id,
                deviceId: session.deviceId,
                sessionTimeout: security.getRoleConfig(user.role)?.sessionTimeout || 3600,
                twoFactorEnabled: user.twoFactorEnabled
            });

        } catch (error) {
            if (error.message.includes('مقفل')) {
                return res.status(423).json({ error: error.message });
            }
            if (error.message.includes('التحقق الثنائي')) {
                return res.status(401).json({
                    error: error.message,
                    requires2FA: true
                });
            }
            if (error.message.includes('تغيير كلمة المرور')) {
                return res.status(401).json({
                    error: error.message,
                    mustChangePassword: true
                });
            }
            res.status(401).json({ error: 'بيانات تسجيل الدخول غير صحيحة' });
        }
    }
);

app.post('/api/auth/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(401).json({ error: 'مطلوب رمز تحديث' });
        }

        const decoded = security.verifyToken(refreshToken, 'refresh');
        const user = dataManager.findUserById(decoded.id);
        if (!user || !user.enabled) {
            return res.status(401).json({ error: 'مستخدم غير موجود' });
        }

        const { session, accessToken, refreshToken: newRefreshToken } = security.createSession(user, {
            deviceId: decoded.deviceId
        });

        res.json({
            accessToken,
            refreshToken: newRefreshToken,
            sessionId: session.id
        });
    } catch (error) {
        res.status(401).json({ error: 'رمز تحديث غير صالح' });
    }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
    security.revokeSession(req.sessionId);
    security.logSecurityEvent('LOGOUT', { user: req.user.name });
    res.json({ success: true });
});

// ===== المراكب =====

app.get('/api/vessels', authenticate, authorize('vessels', 'read'), async (req, res) => {
    try {
        let vessels = dataManager.data.vessels;
        if (req.user.role === 'مشاهد') {
            vessels = vessels.map(v => ({
                id: v.id, name: v.name, num: v.num, len: v.len,
                cat: v.cat, status: v.status, zone: v.zone, port: v.port
            }));
        }
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب البيانات' });
    }
});

app.post('/api/vessels',
    authenticate,
    authorize('vessels', 'write'),
    validate([
        body('name').notEmpty().trim().escape().isLength({ max: 100 }),
        body('num').notEmpty().trim().escape(),
        body('len').isNumeric()
    ]),
    async (req, res) => {
        try {
            const vessel = {
                id: uuidv4(),
                ...req.body,
                cat: getCategory(req.body.len),
                createdAt: new Date().toISOString(),
                createdBy: req.user.name
            };
            dataManager.data.vessels.push(vessel);
            await dataManager.save();
            if (io) io.emit('vessel-added', vessel);
            res.status(201).json(vessel);
        } catch (error) {
            res.status(500).json({ error: 'خطأ في إضافة المركب' });
        }
    }
);

app.put('/api/vessels/:id',
    authenticate,
    authorize('vessels', 'write'),
    async (req, res) => {
        try {
            const index = dataManager.data.vessels.findIndex(v => v.id === req.params.id);
            if (index === -1) return res.status(404).json({ error: 'المركب غير موجود' });

            dataManager.data.vessels[index] = {
                ...dataManager.data.vessels[index],
                ...req.body,
                updatedAt: new Date().toISOString(),
                updatedBy: req.user.name
            };
            await dataManager.save();
            if (io) io.emit('vessel-updated', dataManager.data.vessels[index]);
            res.json(dataManager.data.vessels[index]);
        } catch (error) {
            res.status(500).json({ error: 'خطأ في تحديث المركب' });
        }
    }
);

app.delete('/api/vessels/:id',
    authenticate,
    authorize('vessels', 'delete'),
    async (req, res) => {
        try {
            const index = dataManager.data.vessels.findIndex(v => v.id === req.params.id);
            if (index === -1) return res.status(404).json({ error: 'المركب غير موجود' });

            dataManager.data.vessels.splice(index, 1);
            await dataManager.save();
            if (io) io.emit('vessel-deleted', { id: req.params.id });
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'خطأ في حذف المركب' });
        }
    }
);

// ===== المواقع =====

app.post('/api/locations',
    authenticate,
    authorize('locations', 'write'),
    validate([
        body('lat').isFloat({ min: -90, max: 90 }),
        body('lng').isFloat({ min: -180, max: 180 })
    ]),
    async (req, res) => {
        try {
            const { lat, lng } = security.validateCoordinates(
                parseFloat(req.body.lat),
                parseFloat(req.body.lng)
            );

            const location = {
                id: uuidv4(),
                userId: req.user.id,
                userName: req.user.name,
                userRole: req.user.role,
                lat,
                lng,
                vesselId: req.body.vesselId,
                timestamp: new Date().toISOString()
            };

            await dataManager.addLocation(location);

            const safeLocation = {
                id: location.id,
                lat: location.lat,
                lng: location.lng,
                vesselId: location.vesselId,
                timestamp: location.timestamp
            };

            if (io) io.emit('secure-location', safeLocation);
            res.status(201).json(safeLocation);
        } catch (error) {
            if (error.message.includes('الإحداثيات')) {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: 'خطأ في تسجيل الموقع' });
        }
    }
);

app.get('/api/locations',
    authenticate,
    authorize('locations', 'read'),
    async (req, res) => {
        try {
            const { limit = 100, page = 0, vesselId } = req.query;

            let locations = await dataManager.getLocations(parseInt(page), parseInt(limit));

            if (vesselId) {
                locations = locations.filter(l => l.vesselId === vesselId);
            }

            const safeLocations = locations.map(l => ({
                id: l.id,
                lat: l.lat,
                lng: l.lng,
                vesselId: l.vesselId,
                timestamp: l.timestamp
            }));

            res.json({
                data: safeLocations,
                page: parseInt(page),
                limit: parseInt(limit),
                total: dataManager.data.locations.length
            });
        } catch (error) {
            res.status(500).json({ error: 'خطأ في جلب المواقع' });
        }
    }
);

// ===== النظام =====

app.get('/api/online-users', authenticate, async (req, res) => {
    res.json({
        users: security.getOnlineUsers(),
        count: security.getOnlineUsers().length
    });
});

app.get('/api/security/logs', authenticate, authorize('logs', 'read'), async (req, res) => {
    const { limit = 100 } = req.query;
    res.json(security.getAuditLogs(parseInt(limit)));
});

app.get('/api/system/health', authenticate, authorize('system', 'read'), async (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: CONFIG.version,
        environment: CONFIG.environment,
        connections: io ? io.engine.clientsCount : 0,
        sessions: security.sessionTokens.size,
        locations: dataManager.data.locations.length,
        onlineUsers: security.getOnlineUsers().length,
        memory: process.memoryUsage(),
        pages: dataManager.locationPage
    });
});

// ============================================================
// 🔌 Socket.IO
// ============================================================

let server;
let io;

async function createServer() {
    let httpServer;

    if (CONFIG.isProduction && CONFIG.ssl.enabled) {
        try {
            const sslOptions = {
                key: await fs.readFile(CONFIG.ssl.key),
                cert: await fs.readFile(CONFIG.ssl.cert),
                ca: CONFIG.ssl.ca ? await fs.readFile(CONFIG.ssl.ca) : undefined
            };
            httpServer = https.createServer(sslOptions, app);
            logger.info('🔒 خادم HTTPS جاهز');
        } catch (error) {
            logger.error('❌ فشل تحميل شهادات SSL:', error);
            process.exit(1);
        }
    } else {
        httpServer = http.createServer(app);
    }

    let ioOptions = {
        cors: {
            origin: CONFIG.isProduction ? CONFIG.allowedOrigins : '*',
            methods: ['GET', 'POST'],
            credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000
    };

    if (CONFIG.redis.enabled) {
        try {
            const redisAdapter = require('@socket.io/redis-adapter');
            const { createClient } = require('redis');

            const redisClient = createClient({
                url: `redis://${CONFIG.redis.host}:${CONFIG.redis.port}`,
                password: CONFIG.redis.password,
                db: CONFIG.redis.db
            });

            await redisClient.connect();

            const pubClient = redisClient.duplicate();
            await pubClient.connect();

            ioOptions.adapter = redisAdapter(pubClient, redisClient);
            logger.info('✅ تم تفعيل Redis Adapter');
        } catch (error) {
            logger.warn('⚠️ فشل تفعيل Redis Adapter:', error.message);
        }
    }

    const ioInstance = socketIo(httpServer, ioOptions);

    ioInstance.use((socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) return next(new Error('مطلوب مصادقة'));

            const decoded = security.verifyToken(token, 'access');
            const session = security.validateSession(decoded.sessionId);
            if (!session.valid) {
                return next(new Error('جلسة غير صالحة'));
            }

            socket.user = decoded;
            socket.session = session.session;
            next();
        } catch (error) {
            next(new Error('مصادقة غير صالحة'));
        }
    });

    ioInstance.on('connection', (socket) => {
        const userName = socket.user?.name || 'مجهول';
        logger.info(`📡 اتصال SocketIO: ${userName}`);

        security.addOnlineUser(userName);
        ioInstance.emit('online-users', security.getOnlineUsers());

        socket.on('send-location', async (data) => {
            try {
                if (!security.checkSocketRate(socket.id)) {
                    socket.emit('error', { message: 'معدل الطلبات مرتفع' });
                    return;
                }

                const { lat, lng } = security.validateCoordinates(
                    parseFloat(data.lat),
                    parseFloat(data.lng)
                );

                const location = {
                    id: uuidv4(),
                    userId: socket.user.id,
                    userName: socket.user.name,
                    userRole: socket.user.role,
                    lat,
                    lng,
                    vesselId: data.vesselId,
                    timestamp: new Date().toISOString()
                };

                await dataManager.addLocation(location);

                const safeLocation = {
                    id: location.id,
                    lat: location.lat,
                    lng: location.lng,
                    vesselId: location.vesselId,
                    timestamp: location.timestamp
                };

                socket.broadcast.emit('receive-location', safeLocation);
            } catch (error) {
                if (error.message.includes('الإحداثيات')) {
                    socket.emit('error', { message: error.message });
                } else {
                    socket.emit('error', { message: 'خطأ في إرسال الموقع' });
                }
            }
        });

        socket.on('get-online-users', () => {
            socket.emit('online-users', security.getOnlineUsers());
        });

        socket.heartbeatInterval = setInterval(() => {
            if (socket.session?.id) {
                const session = security.validateSession(socket.session.id);
                if (!session.valid) {
                    socket.emit('error', { message: 'انتهت صلاحية الجلسة' });
                    socket.disconnect(true);
                }
            }
        }, 30000);

        socket.on('disconnect', () => {
            if (socket.heartbeatInterval) {
                clearInterval(socket.heartbeatInterval);
            }
            security.removeOnlineUser(userName);
            ioInstance.emit('online-users', security.getOnlineUsers());
            logger.info(`📡 قطع اتصال: ${userName}`);
        });
    });

    return { server: httpServer, io: ioInstance };
}

// ============================================================
// 📂 الملفات الثابتة
// ============================================================

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// 🚀 تشغيل الخادم وإغلاقه بشكل آمن
// ============================================================

let isShuttingDown = false;

async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n🛑 إيقاف الخادم (${signal})...`);

    try {
        if (server) {
            server.close(() => logger.info('🔌 تم إغلاق الخادم'));
        }
        if (io) {
            io.close(() => logger.info('🔌 تم إغلاق Socket.IO'));
        }

        await dataManager.shutdown();

        logger.info('✅ تم إيقاف الخادم بشكل آمن');
        process.exit(0);
    } catch (error) {
        logger.error('❌ خطأ أثناء الإيقاف:', error);
        process.exit(1);
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGQUIT', () => shutdown('SIGQUIT'));

process.on('uncaughtException', (error) => {
    logger.error('❌ استثناء غير متوقع:', error);
    shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
    logger.error('❌ رفض غير معالج:', reason);
    shutdown('unhandledRejection');
});

async function startServer() {
    try {
        await dataManager.initialize();

        const { server: createdServer, io: createdIo } = await createServer();
        server = createdServer;
        io = createdIo;

        server.listen(CONFIG.port, '0.0.0.0', () => {
            console.log('========================================');
            console.log(`🚀 ${CONFIG.appName} v${CONFIG.version}`);
            console.log(`🌐 ${CONFIG.isProduction ? 'https' : 'http'}://localhost:${CONFIG.port}`);
            console.log('========================================');
            console.log('✅ نظام متكامل بالكامل - ملف واحد');
            console.log('========================================');
            console.log(`🔒 الجلسات: ${security.sessionTokens.size}`);
            console.log(`📍 المواقع: ${dataManager.data.locations.length}`);
            console.log(`📄 صفحات المواقع: ${dataManager.locationPage}`);
            console.log(`🚫 القائمة السوداء: ${security.blacklistedTokens.size}`);
            console.log(`👥 المستخدمين المتصلين: ${security.getOnlineUsers().length}`);
            console.log('========================================');
            console.log('👤 حساب المسؤول:');
            console.log('   📧 admin');
            console.log('   🔑 SecurePass123!');
            console.log('   ⚠️  يجب تغيير كلمة المرور فوراً!');
            console.log('========================================');
        });

        // حفظ تلقائي كل 30 ثانية
        setInterval(async () => {
            try {
                await dataManager._saveToFile();
            } catch (error) {
                logger.error('❌ فشل الحفظ التلقائي:', error);
            }
        }, 30000);

    } catch (error) {
        logger.error('❌ فشل بدء الخادم:', error);
        process.exit(1);
    }
}

startServer();

// ============================================================
// ✅ نهاية الخادم المتكامل
// ============================================================
