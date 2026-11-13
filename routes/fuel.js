const FuelDocument = require('../models/FuelDocument');
const Vessel = require('../models/Vessel');

module.exports = function(app, { authenticateAccessToken, csrfProtection }) {

    // 1. جلب المعايير الخاصة بالقارب
    app.get('/api/fuel/standards/:boatId', authenticateAccessToken, async (req, res) => {
        try {
            const vessel = await Vessel.findOne({ id: req.params.boatId });
            const lastDoc = await FuelDocument.findOne({ boatId: req.params.boatId }).sort({ date: -1 });

            res.json({
                tankCapacity: vessel?.tankCapacity || 1000,
                standardRate: vessel?.standardRate || 13.33,
                engineCount: vessel?.engineCount || 1,
                lastTotalHours: lastDoc ? lastDoc.docTotalHours : 0, // آخر إجمالي عداد
                lastHoursR: lastDoc?.engines?.right?.totalHours || 0,
                lastHoursL: lastDoc?.engines?.left?.totalHours || 0
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // 2. حفظ وثيقة جديدة (مع التحليل الذكي)
    app.post('/api/fuel/documents', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            const { boatId, date, docTotalHours, docTotalLiters, engineCount, engines } = req.body;
            const vessel = await Vessel.findOne({ id: boatId });
            const standardRate = vessel?.standardRate || 13.33;
            const tankCapacity = vessel?.tankCapacity || 1000;

            let isFraud = false;
            let fraudReasons = [];

            // ✅ الفحص 1: مطابقة الساعات
            const sumUsedHours = (engines.right?.usedHours || 0) + (engines.left?.usedHours || 0);
            if (Math.abs(sumUsedHours - docTotalHours) > 0.5) {
                isFraud = true;
                fraudReasons.push(`🚨 تعارض في الساعات: مجموع المحركات (${sumUsedHours}) لا يطابق إجمالي الوثيقة (${docTotalHours}).`);
            }

            // ✅ الفحص 2: مطابقة الوقود
            const sumLiters = (engines.right?.requestedLiters || 0) + (engines.left?.requestedLiters || 0);
            if (Math.abs(sumLiters - docTotalLiters) > 0.5) {
                isFraud = true;
                fraudReasons.push(`🚨 تعارض في الكمية: مجموع المحركات (${sumLiters}) لا يطابق إجمالي الوثيقة (${docTotalLiters}).`);
            }

            // ✅ الفحص 3: تجاوز سعة الخزان
            if (docTotalLiters > tankCapacity) {
                isFraud = true;
                fraudReasons.push(`🚨 تجاوز السعة: المطلوب (${docTotalLiters}) أكبر من سعة الخزان (${tankCapacity}).`);
            }

            // ✅ الفحص 4: حساب معدلات الاستهلاك لكل محرك
            const processedEngines = { right: null, left: null };
            if (engines.right) {
                const rateR = engines.right.requestedLiters / engines.right.usedHours;
                processedEngines.right = { ...engines.right, actualRate: rateR, deviation: ((rateR - standardRate) / standardRate) * 100 };
                if (processedEngines.right.deviation > 15) { isFraud = true; fraudReasons.push(`⚠️ استهلاك مرتفع (أيمن): ${processedEngines.right.deviation.toFixed(1)}%`); }
            }
            if (engines.left) {
                const rateL = engines.left.requestedLiters / engines.left.usedHours;
                processedEngines.left = { ...engines.left, actualRate: rateL, deviation: ((rateL - standardRate) / standardRate) * 100 };
                if (processedEngines.left.deviation > 15) { isFraud = true; fraudReasons.push(`⚠️ استهلاك مرتفع (أيسر): ${processedEngines.left.deviation.toFixed(1)}%`); }
            }

            // ✅ الفحص 5: معدل الاستهلاك الإجمالي
            const totalActualRate = docTotalLiters / (docTotalHours || 1);
            if (totalActualRate > standardRate * 1.15) {
                isFraud = true;
                fraudReasons.push(`⚠️ معدل الاستهلاك الإجمالي (${totalActualRate.toFixed(2)}) يتجاوز المعيار.`);
            }

            // 🔴 حفظ الوثيقة
            const newDoc = new FuelDocument({
                boatId, date: date || new Date(),
                docTotalHours, docTotalLiters, engineCount,
                engines: processedEngines,
                isFraud, fraudReason: fraudReasons.join(' | '),
                totalActualRate
            });
            await newDoc.save();

            res.status(201).json({ success: true, message: isFraud ? 'تم الحفظ (مع تنبيهات)' : 'تم الحفظ بنجاح', isFraud, fraudReason: newDoc.fraudReason, doc: newDoc });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // 3. جلب وثائق القارب
    app.get('/api/fuel/documents/:boatId', authenticateAccessToken, async (req, res) => {
        try {
            const { start, end } = req.query;
            let query = { boatId: req.params.boatId };
            if (start && end) query.date = { $gte: new Date(start), $lte: new Date(end) };
            const docs = await FuelDocument.find(query).sort({ date: -1 });
            res.json(docs);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
};
