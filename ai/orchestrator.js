const { logger } = require('../utils/logger');

class CircuitBreaker {
    constructor() {
        this.states = new Map();
        this.config = {
            failureThreshold: 5,      // عدد الفشل قبل الفتح
            successThreshold: 3,      // عدد النجاح قبل الإغلاق
            timeout: 60000,           // 1 دقيقة
            halfOpenTimeout: 30000    // 30 ثانية
        };
        this.stats = {
            totalFailures: 0,
            totalSuccesses: 0,
            totalTimeouts: 0,
            stateChanges: 0
        };
    }

    // ====== حالة المزود ======
    getState(provider) {
        if (!this.states.has(provider)) {
            this.states.set(provider, {
                state: 'closed', // closed, open, half-open
                failures: 0,
                successes: 0,
                lastFailure: null,
                lastSuccess: null,
                openTime: null
            });
        }
        return this.states.get(provider);
    }

    // ====== هل المزود مفتوح؟ ======
    isOpen(provider) {
        const state = this.getState(provider);
        
        // إذا كان مغلقاً
        if (state.state === 'closed') {
            return false;
        }

        // إذا كان مفتوحاً وتحقق الوقت
        if (state.state === 'open') {
            const now = Date.now();
            if (now - state.openTime > this.config.timeout) {
                // الانتقال إلى نصف مفتوح
                state.state = 'half-open';
                state.openTime = null;
                this.stats.stateChanges++;
                logger.info(`🔄 Circuit breaker: ${provider} -> half-open`);
                return false;
            }
            return true;
        }

        // نصف مفتوح - السماح بطلب واحد
        if (state.state === 'half-open') {
            return false;
        }

        return true;
    }

    // ====== تسجيل فشل ======
    recordFailure(provider) {
        const state = this.getState(provider);
        state.failures++;
        state.lastFailure = Date.now();
        this.stats.totalFailures++;

        // إذا تجاوز العتبة
        if (state.failures >= this.config.failureThreshold) {
            this.open(provider);
        }

        // تحديث الإحصائيات
        logger.warn(`⚠️ Circuit breaker: ${provider} failure (${state.failures}/${this.config.failureThreshold})`);
    }

    // ====== تسجيل نجاح ======
    recordSuccess(provider) {
        const state = this.getState(provider);
        state.successes++;
        state.lastSuccess = Date.now();
        this.stats.totalSuccesses++;

        // إذا كان نصف مفتوح
        if (state.state === 'half-open') {
            if (state.successes >= this.config.successThreshold) {
                this.close(provider);
            }
        } else {
            // إعادة تعيين الفشل إذا كان مغلقاً
            state.failures = Math.max(0, state.failures - 1);
        }
    }

    // ====== فتح الدائرة ======
    open(provider) {
        const state = this.getState(provider);
        state.state = 'open';
        state.openTime = Date.now();
        state.failures = 0;
        state.successes = 0;
        this.stats.stateChanges++;
        logger.warn(`🔴 Circuit breaker opened for ${provider}`);
    }

    // ====== إغلاق الدائرة ======
    close(provider) {
        const state = this.getState(provider);
        state.state = 'closed';
        state.failures = 0;
        state.successes = 0;
        state.openTime = null;
        this.stats.stateChanges++;
        logger.info(`🟢 Circuit breaker closed for ${provider}`);
    }

    // ====== إعادة تعيين ======
    reset(provider) {
        if (provider) {
            this.states.delete(provider);
            logger.info(`🔄 Circuit breaker reset for ${provider}`);
        } else {
            this.states.clear();
            this.stats = {
                totalFailures: 0,
                totalSuccesses: 0,
                totalTimeouts: 0,
                stateChanges: 0
            };
            logger.info('🔄 Circuit breaker fully reset');
        }
    }

    // ====== الحصول على إحصائيات ======
    getStats() {
        const stats = {
            ...this.stats,
            providers: {}
        };

        for (const [name, state] of this.states) {
            stats.providers[name] = {
                state: state.state,
                failures: state.failures,
                successes: state.successes,
                lastFailure: state.lastFailure,
                lastSuccess: state.lastSuccess
            };
        }

        return stats;
    }

    // ====== تحديث التهيئة ======
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        logger.info('⚙️ Circuit breaker config updated:', this.config);
    }
}

module.exports = { CircuitBreaker };
