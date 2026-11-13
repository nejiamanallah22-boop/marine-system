const FuelDocument = require('../models/FuelDocument');
const Vessel = require('../models/Vessel');

module.exports = function(app, {
    authenticateAccessToken,
    csrfProtection,
    requirePermission
}) {
    
    // 1. جلب معايير القارب (آخر عداد، سعة الخزان، المعدل)
    app.get('/api/fuel/standards/:boatId', authenticateAccessToken, async (req, res) => {
        try {
            const { boatId } = req.params;
            
            // جلب القارب (نفترض أن لديك حقول tankCapacity و standardRate في موديل Vessel)
            const vessel = await Vessel.findOne({ id: boatId });
            
            const tankCapacity = vessel?.tankCapacity || 1000;
            const standardRate = vessel?.standardRate || 13.33;

            // جلب آخر وثيقة لمعرفة العداد الأخير
            const lastDoc = await FuelDocument.findOne({ boatId }).sort({ date: -1 });
            const lastOdometer = lastDoc ? lastDoc.totalHours : 0;

            res.json({ tankCapacity, standardRate, lastOdometer });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // 2. جلب وثائق التموين (مع الفلترة الزمنية)
    app.get('/api/fuel/documents/:boatId', authenticateAccessToken, async (req, res) => {
        try {
            const { boatId } = req.params;
            const { start, end } = req.query;

            let query = { boatId };
            
            if (start && end) {
                query.date = {
                    $gte: new Date(start),
                    $lte: new Date(end)
                };
            }

            const docs = await FuelDocument.find(query).sort({ date: -1 });
            res.json(docs);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // 3. حفظ وثيقة تموين جديدة
    app.post('/api/fuel/documents', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            const { boatId, date, totalHours, usedHours, requestedLiters, actualRate, deviation, isFraud } = req.body;

            if (!boatId || !usedHours || !requestedLiters) {
                return res.status(400).json({ error: 'بيانات ناقصة' });
            }

            const newDoc = new FuelDocument({
                boatId,
                date: date || new Date(),
                totalHours,
                usedHours,
                requestedLiters,
                actualRate,
                deviation,
                isFraud
            });

            await newDoc.save();
            res.status(201).json({ success: true, message: 'تم حفظ الوثيقة بنجاح', doc: newDoc });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
};
