// routes/fuel.js
const FuelDocument = require('../models/FuelDocument');
const Vessel = require('../models/Vessel');

module.exports = function(app, {
    authenticateAccessToken,
    csrfProtection,
    requirePermission
}) {

    // 1. جلب الإعدادات القياسية للقارب
    app.get('/api/fuel/standards/:boatId', authenticateAccessToken, async (req, res) => {
        try {
            const { boatId } = req.params;
            const vessel = await Vessel.findOne({ id: boatId });
            const lastDoc = await FuelDocument.findOne({ boatId }).sort({ date: -1 });

            res.json({
                engineCount: vessel?.engineCount || 1,
                tankCapacity: vessel?.tankCapacity || 1000,
                standardRate: vessel?.standardRate || 13.33,
                lastTotalHours: lastDoc ? lastDoc.docTotalHours : 0,
                lastHoursR: lastDoc?.engines?.right?.totalHours || 0,
                lastHoursL: lastDoc?.engines?.left?.totalHours || 0
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // 2. حفظ وثيقة تموين جديدة (كشف التلاعب)
    app.post('/api/fuel/documents', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            const { boatId, date, docTotalHours, docTotalLiters, engineCount, engines } = req.body;
            const vessel = await Vessel.findOne({ id: boatId });
            const standardRate = vessel?.standardRate || 13.33;
            const tankCapacity = vessel?.tankCapacity || 1000;

            let isFraud = false;
            let fraudReasons = [];

            // فحص الساعات
            const sumHours = (engines.right?.usedHours || 0) + (engines.left?.usedHours || 0);
            if (Math.abs(sumHours - docTotalHours) > 0.5) {
                isFraud = true;
                fraudReasons.push(`تعارض في الساعات: مجموع المحركات (${sumHours}) لا يطابق الإجمالي (${docTotalHours}).`);
            }

            // فحص الكميات
            const sumLiters = (engines.right?.requestedLiters || 0) + (engines.left?.requestedLiters || 0);
            if (Math.abs(sumLiters - docTotalLiters) > 0.5) {
                isFraud = true;
                fraudReasons.push(`تعارض في الكميات: مجموع المحركات (${sumLiters}) لا يطابق الإجمالي (${docTotalLiters}).`);
            }

            // فحص سعة الخزان
            if (docTotalLiters > tankCapacity) {
                isFraud = true;
                fraudReasons.push(`تجاوز الخزان: (${docTotalLiters}) أكبر من السعة (${tankCapacity}).`);
            }

            // فحص المحرك الأيمن
            const processedEngines = { right: null, left: null };
            if (engines.right) {
                const rateR = engines.right.requestedLiters / (engines.right.usedHours || 1);
                processedEngines.right = { ...engines.right, actualRate: rateR, deviation: ((rateR - standardRate) / standardRate) * 100 };
                if (processedEngines.right.deviation > 15) {
                    isFraud = true;
                    fraudReasons.push(`استهلاك مرتفع (أيمن): +${processedEngines.right.deviation.toFixed(1)}%`);
                }
            }

            // فحص المحرك الأيسر
            if (engines.left) {
                const rateL = engines.left.requestedLiters / (engines.left.usedHours || 1);
                processedEngines.left = { ...engines.left, actualRate: rateL, deviation: ((rateL - standardRate) / standardRate) * 100 };
                if (processedEngines.left.deviation > 15) {
                    isFraud = true;
                    fraudReasons.push(`استهلاك مرتفع (أيسر): +${processedEngines.left.deviation.toFixed(1)}%`);
                }
            }

            // المعدل الإجمالي
            const totalActualRate = docTotalLiters / (docTotalHours || 1);
            if (totalActualRate > standardRate * 1.15) {
                isFraud = true;
                fraudReasons.push(`معدل الاستهلاك الإجمالي (${totalActualRate.toFixed(2)}) يتجاوز المعيار.`);
            }

            // حفظ
            const newDoc = new FuelDocument({
                boatId, date: date || new Date(), docTotalHours, docTotalLiters, engineCount,
                engines: processedEngines, isFraud, fraudReason: fraudReasons.join(' | '), totalActualRate
            });

            await newDoc.save();
            res.status(201).json({ success: true, message: isFraud ? 'تم الحفظ (مع تنبيهات)' : 'تم الحفظ بنجاح', isFraud, doc: newDoc });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // 3. جلب وثائق قارب معين (مع فلترة)
    app.get('/api/fuel/documents/:boatId', authenticateAccessToken, async (req, res) => {
        try {
            const { boatId } = req.params;
            const { start, end } = req.query;
            let query = { boatId };
            if (start && end) query.date = { $gte: new Date(start), $lte: new Date(end) };
            const docs = await FuelDocument.find(query).sort({ date: -1 });
            res.json(docs);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // 4. مقارنة المركب مع آخر من نفس الفئة
    app.get('/api/fuel/compare-vessel/:boatId', authenticateAccessToken, async (req, res) => {
        try {
            const { boatId } = req.params;
            const currentVessel = await Vessel.findOne({ id: boatId });
            if (!currentVessel) return res.status(404).json({ error: 'المركب غير موجود' });

            const category = currentVessel.cat || '';
            const otherVessel = await Vessel.findOne({ 
                id: { $ne: boatId },
                $or: [
                    { cat: category },
                    { len: { $gte: (currentVessel.len - 2), $lte: (currentVessel.len + 2) } }
                ]
            });
            
            if (!otherVessel) return res.json({ success: false, message: 'لا يوجد مركب آخر للمقارنة' });

            const currentDoc = await FuelDocument.findOne({ boatId }).sort({ date: -1 });
            const otherDoc = await FuelDocument.findOne({ boatId: otherVessel.id }).sort({ date: -1 });

            res.json({
                success: true,
                current: { name: currentVessel.name, totalLiters: currentDoc ? currentDoc.docTotalLiters : 0, totalHours: currentDoc ? currentDoc.docTotalHours : 0, rate: currentDoc ? currentDoc.totalActualRate : 0 },
                other: { name: otherVessel.name, totalLiters: otherDoc ? otherDoc.docTotalLiters : 0, totalHours: otherDoc ? otherDoc.docTotalHours : 0, rate: otherDoc ? otherDoc.totalActualRate : 0 }
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

};
