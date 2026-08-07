// ============================================================
// 💬 SLACK SERVICE - مع دعم آمن
// ============================================================

const axios = require('axios');
const { logger } = require('../utils/logger');

class SlackService {
    constructor() {
        // ✅ القراءة من متغيرات البيئة فقط
        this.webhookUrl = process.env.SLACK_WEBHOOK || null;
        this.enabled = !!this.webhookUrl && this.webhookUrl !== 'your_slack_webhook_here';
        
        // التحقق من التهيئة
        if (this.enabled) {
            // التحقق من صحة الـ URL (بدون تسجيله في logs)
            if (!this.webhookUrl.startsWith('https://hooks.slack.com/services/')) {
                logger.warn('⚠️ Invalid Slack webhook URL format');
                this.enabled = false;
            } else {
                logger.info('✅ Slack service initialized');
            }
        } else {
            logger.info('ℹ️ Slack service disabled (no webhook configured)');
        }
    }

    // إرسال رسالة إلى Slack
    async sendMessage(message, options = {}) {
        if (!this.enabled) {
            logger.debug('Slack service disabled, skipping message');
            return false;
        }

        try {
            const payload = {
                text: message,
                username: options.username || 'AI Commander',
                icon_emoji: options.icon || '⚓',
                channel: options.channel || '#general',
                attachments: options.attachments || []
            };

            // ⚠️ لا تسجل الـ webhook في logs
            logger.info(`📨 Sending Slack message: ${message.substring(0, 50)}...`);

            const response = await axios.post(this.webhookUrl, payload, {
                timeout: 5000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 200) {
                logger.info('✅ Slack message sent successfully');
                return true;
            } else {
                logger.error(`❌ Slack error: ${response.status}`);
                return false;
            }

        } catch (error) {
            logger.error('❌ Slack service error:', error.message);
            // لا تسجل التفاصيل الحساسة
            return false;
        }
    }

    // إرسال تنبيه
    async sendAlert(title, message, level = 'warning') {
        const emojis = {
            'info': 'ℹ️',
            'warning': '⚠️',
            'error': '🚨',
            'success': '✅'
        };

        const color = {
            'info': '#3498db',
            'warning': '#f39c12',
            'error': '#e74c3c',
            'success': '#2ecc71'
        };

        return await this.sendMessage(
            `${emojis[level] || '📢'} *${title}*`,
            {
                attachments: [{
                    color: color[level] || '#3498db',
                    text: message,
                    fields: [
                        {
                            title: '🕐 Time',
                            value: new Date().toISOString(),
                            short: true
                        },
                        {
                            title: '📊 Level',
                            value: level.toUpperCase(),
                            short: true
                        }
                    ]
                }]
            }
        );
    }

    // إرسال تقرير
    async sendReport(report) {
        if (!this.enabled) return false;

        const attachments = report.sections?.map(section => ({
            title: section.title,
            text: section.content,
            color: section.color || '#3498db',
            fields: section.fields || []
        })) || [];

        return await this.sendMessage(
            `📊 *${report.title || 'System Report'}*`,
            { attachments }
        );
    }

    // التحقق من صحة التهيئة
    isEnabled() {
        return this.enabled;
    }

    // إعادة تهيئة الخدمة (لتحديث webhook)
    reconfigure(webhookUrl) {
        if (webhookUrl && webhookUrl.startsWith('https://hooks.slack.com/services/')) {
            this.webhookUrl = webhookUrl;
            this.enabled = true;
            logger.info('✅ Slack service reconfigured');
            return true;
        } else {
            logger.warn('⚠️ Invalid Slack webhook URL provided');
            return false;
        }
    }

    // تعطيل الخدمة
    disable() {
        this.enabled = false;
        logger.info('ℹ️ Slack service disabled');
    }
}

module.exports = new SlackService();
