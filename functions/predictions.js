const { logger } = require('../utils/logger');
const DatabaseManager = require('../config/database');

class PredictionEngine {
    constructor() {
        this.db = DatabaseManager;
        this.models = {
            failure: this.predictFailure.bind(this),
            maintenance: this.predictMaintenance.bind(this),
            performance: this.predictPerformance.bind(this),
            cost: this.predictCost.bind(this)
        };
    }

    // ====== توقع الأعطال المتقدم ======
    async predictFailure(vesselId, options = {}) {
        try {
            // جلب جميع البيانات
            const vessel = await this.db.findOne('Vessel', { vesselId });
            if (!vessel) {
                throw new Error(`Vessel ${vesselId} not found`);
            }

            // جلب تاريخ الصيانة
            const maintenance = await this.db.find('Maintenance', 
                { vesselId, status: 'completed' },
                { sort: { createdAt: -1 }, limit: 50 }
            );

            // جلب التوقعات السابقة
            const predictions = await this.db.find('Prediction',
                { vesselId, type: 'failure' },
                { sort: { createdAt: -1 }, limit: 10 }
            );

            // ====== تحليل البيانات ======
            
            // 1. تحليل عمر المركب
            const ageInYears = vessel.year ? 
                new Date().getFullYear() - vessel.year : 0;

            // 2. تحليل ساعات التشغيل
            const engineHours = vessel.engineHours || 0;
            const avgDailyHours = this.calculateAverageDailyHours(vessel);

            // 3. تحليل الأعطال السابقة
            const failureCount = maintenance.filter(m => m.type === 'corrective').length;
            const avgInterval = this.calculateAverageInterval(maintenance);
            const daysSinceLast = this.daysSinceLastMaintenance(maintenance);

            // 4. تحليل أنماط الأعطال
            const failurePatterns = this.analyzeFailurePatterns(maintenance);

            // 5. بيانات الحساسات (IoT)
            const sensorData = await this.getSensorData(vesselId);

            // ====== حساب المخاطر ======
            
            // المخاطر حسب العمر
            let ageRisk = 0;
            if (ageInYears < 5) ageRisk = 0.1;
            else if (ageInYears < 10) ageRisk = 0.3;
            else if (ageInYears < 15) ageRisk = 0.6;
            else ageRisk = 0.9;

            // المخاطر حسب ساعات التشغيل
            let hoursRisk = 0;
            if (engineHours < 1000) hoursRisk = 0.1;
            else if (engineHours < 5000) hoursRisk = 0.3;
            else if (engineHours < 10000) hoursRisk = 0.6;
            else hoursRisk = 0.9;

            // المخاطر حسب الأعطال السابقة
            let failureRisk = 0;
            if (failureCount === 0) failureRisk = 0.1;
            else if (failureCount < 3) failureRisk = 0.3;
            else if (failureCount < 6) failureRisk = 0.6;
            else failureRisk = 0.9;

            // المخاطر حسب الفترة منذ آخر صيانة
            let maintenanceRisk = 0;
            if (daysSinceLast < 30) maintenanceRisk = 0.1;
            else if (daysSinceLast < 90) maintenanceRisk = 0.3;
            else if (daysSinceLast < 180) maintenanceRisk = 0.6;
            else maintenanceRisk = 0.9;

            // المخاطر حسب بيانات الحساسات
            let sensorRisk = await this.calculateSensorRisk(sensorData);

            // ====== حساب النتيجة النهائية ======
            const weights = {
                age: 0.15,
                hours: 0.20,
                failures: 0.25,
                maintenance: 0.20,
                sensors: 0.20
            };

            const riskScore = 
                ageRisk * weights.age +
                hoursRisk * weights.hours +
                failureRisk * weights.failures +
                maintenanceRisk * weights.maintenance +
                sensorRisk * weights.sensors;

            // ====== تحديد مستوى المخاطر ======
            let riskLevel, estimatedDate, recommendations = [];

            if (riskScore >= 0.8) {
                riskLevel = 'critical';
                estimatedDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                recommendations = [
                    '🔴 عطل وشيك خلال 7 أيام - إجراء صيانة فورية',
                    '📋 تجهيز قطع الغيار اللازمة',
                    '👨‍🔧 تخصيص فريق صيانة متخصص',
                    '📊 مراجعة سجل الصيانة بالكامل'
                ];
            } else if (riskScore >= 0.6) {
                riskLevel = 'high';
                estimatedDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
                recommendations = [
                    '🟡 خطر مرتفع - جدولة صيانة عاجلة',
                    '📋 فحص شامل للمركب',
                    '🔧 تجهيز خطة صيانة وقائية'
                ];
            } else if (riskScore >= 0.4) {
                riskLevel = 'medium';
                estimatedDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                recommendations = [
                    '🟢 خطر متوسط - صيانة وقائية مقررة',
                    '📊 مراقبة الأداء عن كثب',
                    '🔍 فحص دوري للمعدات'
                ];
            } else {
                riskLevel = 'low';
                estimatedDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
                recommendations = [
                    '✅ خطر منخفض - استمر في الصيانة الدورية',
                    '📋 تحديث سجل الصيانة',
                    '📊 متابعة الأداء العام'
                ];
            }

            // ====== إنشاء التوقع ======
            const prediction = {
                predictionId: `pred_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                vesselId: vesselId,
                type: 'failure',
                confidence: Math.min(0.95, 0.7 + (1 - riskScore) * 0.25),
                result: {
                    riskLevel: riskLevel,
                    riskScore: Math.round(riskScore * 100),
                    estimatedDate: estimatedDate,
                    recommendations: recommendations
                },
                features: {
                    ageInYears,
                    engineHours,
                    failureCount,
                    daysSinceLast,
                    avgInterval,
                    sensorData: sensorData,
                    failurePatterns: failurePatterns
                },
                modelVersion: '5.0',
                createdAt: new Date()
            };

            // حفظ التوقع
            await this.db.create('Prediction', prediction);

            // حفظ في الكاش
            await this.redis.set(`prediction:${vesselId}`, prediction, 1800);

            logger.info(`🔮 Prediction generated for vessel ${vesselId}: ${riskLevel} risk`);
            return prediction;

        } catch (error) {
            logger.error('Error predicting failure:', error);
            throw error;
        }
    }

    // ====== دوال مساعدة ======

    calculateAverageDailyHours(vessel) {
        if (!vessel.createdAt) return 0;
        const days = (new Date() - new Date(vessel.createdAt)) / (1000 * 60 * 60 * 24);
        return days > 0 ? (vessel.engineHours || 0) / days : 0;
    }

    calculateAverageInterval(maintenance) {
        if (maintenance.length < 2) return 30;
        const intervals = [];
        for (let i = 1; i < maintenance.length; i++) {
            const diff = (maintenance[i-1].createdAt - maintenance[i].createdAt) / (1000 * 60 * 60 * 24);
            intervals.push(Math.abs(diff));
        }
        return intervals.reduce((a, b) => a + b, 0) / intervals.length;
    }

    daysSinceLastMaintenance(maintenance) {
        if (maintenance.length === 0) return 365;
        const last = maintenance[0];
        return (new Date() - new Date(last.createdAt)) / (1000 * 60 * 60 * 24);
    }

    analyzeFailurePatterns(maintenance) {
        const patterns = {
            total: maintenance.length,
            corrective: maintenance.filter(m => m.type === 'corrective').length,
            preventive: maintenance.filter(m => m.type === 'preventive').length,
            emergency: maintenance.filter(m => m.type === 'emergency').length
        };
        
        // تحليل الأنماط المتكررة
        const descriptions = maintenance.map(m => m.description || '');
        const wordFrequency = {};
        for (const desc of descriptions) {
            const words = desc.split(' ');
            for (const word of words) {
                if (word.length > 3) {
                    wordFrequency[word] = (wordFrequency[word] || 0) + 1;
                }
            }
        }
        
        patterns.commonIssues = Object.entries(wordFrequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([word, count]) => ({ word, count }));

        return patterns;
    }

    async getSensorData(vesselId) {
        try {
            // محاكاة بيانات حساسات
            // في الحقيقة: جلب من قاعدة بيانات IoT
            const vessel = await this.db.findOne('Vessel', { vesselId });
            if (!vessel) return null;

            return {
                engineTemp: vessel.sensors?.engineTemp || 85 + Math.random() * 20,
                fuelLevel: vessel.sensors?.fuelLevel || 60 + Math.random() * 40,
                oilPressure: vessel.sensors?.oilPressure || 40 + Math.random() * 30,
                vibration: vessel.sensors?.vibration || 2 + Math.random() * 3,
                timestamp: new Date()
            };
        } catch (error) {
            logger.error('Error getting sensor data:', error);
            return null;
        }
    }

    async calculateSensorRisk(sensorData) {
        if (!sensorData) return 0.3;

        let risk = 0;
        
        // درجة حرارة المحرك (طبيعي: 70-95°C)
        if (sensorData.engineTemp > 100) risk += 0.3;
        else if (sensorData.engineTemp > 90) risk += 0.2;
        else risk += 0.1;

        // ضغط الزيت (طبيعي: 30-60 PSI)
        if (sensorData.oilPressure < 30) risk += 0.3;
        else if (sensorData.oilPressure < 40) risk += 0.2;
        else risk += 0.1;

        // مستوى الوقود
        if (sensorData.fuelLevel < 20) risk += 0.2;
        else if (sensorData.fuelLevel < 40) risk += 0.1;

        // الاهتزاز
        if (sensorData.vibration > 5) risk += 0.3;
        else if (sensorData.vibration > 3) risk += 0.2;

        return Math.min(risk, 0.9);
    }

    // ====== توقع الصيانة ======
    async predictMaintenance(vesselId) {
        // تنفيذ توقع الصيانة باستخدام تحليل البيانات
        // ...
    }

    // ====== توقع الأداء ======
    async predictPerformance(vesselId) {
        // تنفيذ توقع الأداء
        // ...
    }

    // ====== توقع التكاليف ======
    async predictCost(vesselId) {
        // تنفيذ توقع التكاليف
        // ...
    }
}

module.exports = new PredictionEngine();
