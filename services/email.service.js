// ============================================================
// 📧 EMAIL SERVICE - آمن ومتكامل
// ============================================================

const nodemailer = require('nodemailer');
const { logger } = require('../utils/logger');

class EmailService {
    constructor() {
        this.transporter = null;
        this.enabled = false;
        this.initialize();
    }

    initialize() {
        // قراءة الإعدادات من متغيرات البيئة
        const host = process.env.SMTP_HOST;
        const port = parseInt(process.env.SMTP_PORT);
        const secure = process.env.SMTP_SECURE === 'true';
        const user = process.env.SMTP_USER;
        const pass = process.env.SMTP_PASS;

        // التحقق من وجود الإعدادات
        if (!host || !user || !pass || user === 'your-email@gmail.com') {
            logger.info('ℹ️ Email service disabled (no valid configuration)');
            return;
        }

        try {
            this.transporter = nodemailer.createTransport({
                host,
                port,
                secure,
                auth: {
                    user,
                    pass
                },
                // إعدادات إضافية للأمان
                tls: {
                    rejectUnauthorized: true
                },
                connectionTimeout: 10000
            });

            // التحقق من الاتصال
            this.verifyConnection();
            
            this.enabled = true;
            this.from = process.env.SMTP_FROM || user;
            logger.info('✅ Email service initialized');

        } catch (error) {
            logger.error('❌ Email service initialization failed:', error.message);
            this.enabled = false;
        }
    }

    async verifyConnection() {
        try {
            await this.transporter.verify();
            logger.info('✅ Email connection verified');
        } catch (error) {
            logger.error('❌ Email verification failed:', error.message);
            this.enabled = false;
        }
    }

    // إرسال إيميل
    async sendEmail(options) {
        if (!this.enabled) {
            logger.debug('Email service disabled, skipping email');
            return false;
        }

        try {
            const mailOptions = {
                from: options.from || this.from,
                to: options.to,
                subject: options.subject,
                text: options.text || options.html?.replace(/<[^>]*>/g, ''),
                html: options.html,
                attachments: options.attachments || []
            };

            logger.info(`📧 Sending email to ${options.to}`);

            const info = await this.transporter.sendMail(mailOptions);
            
            logger.info(`✅ Email sent: ${info.messageId}`);
            return true;

        } catch (error) {
            logger.error('❌ Email sending failed:', error.message);
            return false;
        }
    }

    // إرسال إيميل تأكيد
    async sendVerificationEmail(email, token) {
        const verificationUrl = `${process.env.APP_URL || 'http://localhost:3000'}/verify/${token}`;
        
        return await this.sendEmail({
            to: email,
            subject: '🔐 Verify Your Email Address',
            html: `
                <h1>Email Verification</h1>
                <p>Please click the link below to verify your email:</p>
                <a href="${verificationUrl}">${verificationUrl}</a>
                <p>This link will expire in 24 hours.</p>
            `
        });
    }

    // إرسال إيميل إعادة تعيين كلمة المرور
    async sendPasswordResetEmail(email, token) {
        const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password/${token}`;
        
        return await this.sendEmail({
            to: email,
            subject: '🔑 Password Reset Request',
            html: `
                <h1>Password Reset</h1>
                <p>You requested a password reset. Click the link below:</p>
                <a href="${resetUrl}">${resetUrl}</a>
                <p>This link will expire in 1 hour.</p>
                <p>If you didn't request this, please ignore this email.</p>
            `
        });
    }

    // إرسال تقرير
    async sendReportEmail(email, report) {
        return await this.sendEmail({
            to: email,
            subject: `📊 ${report.title || 'System Report'}`,
            html: `
                <h1>${report.title || 'System Report'}</h1>
                <pre>${JSON.stringify(report.data, null, 2)}</pre>
                <p>Generated: ${new Date().toISOString()}</p>
            `
        });
    }

    // التحقق من حالة الخدمة
    isEnabled() {
        return this.enabled;
    }

    // إعادة تهيئة الخدمة
    reconfigure(config) {
        // تحديث التهيئة
        if (config.host && config.user && config.pass) {
            process.env.SMTP_HOST = config.host;
            process.env.SMTP_USER = config.user;
            process.env.SMTP_PASS = config.pass;
            this.initialize();
            return this.enabled;
        }
        return false;
    }
}

module.exports = new EmailService();
