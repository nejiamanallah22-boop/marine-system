// routes/fuel.js
const FuelDocument = require('../models/FuelDocument');
const Vessel = require('../models/Vessel');
const Maintenance = require('../models/Maintenance');

module.exports = function(app, {
    authenticateAccessToken,
    csrfProtection,
    requirePermission
}) {

    // ═══════════════════════════════════════════════════════════
    // 🔍 دوال مساعدة لمحرك التحليل الجنائي
    // ═══════════════════════════════════════════════════════════
    
    // حساب الانحراف المعياري
    function calculateStdDev(values) {
        if (values.length < 2) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
        return Math.sqrt(variance);
    }

    // التحقق من كون التاريخ عطلة (الجمعة/السبت في تونس)
    function isWeekend(date) {
        const day = new Date(date).getDay();
        return day === 5 || day === 6; // الجمعة=5، السبت=6
    }

    // ═══════════════════════════════════════════════════════════
    // 1. جلب معايير القارب
    // GET /api/fuel/standards/:boatId
    // ═══════════════════════════════════════════════════════════
    app.get('/api/fuel/standards/:boatId', authenticateAccessToken, async (req, res) => {
        try {
            const vessel = await Vessel.findOne({ id: req.params.boatId });
            if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
            
            const lastDoc = await FuelDocument.findOne({ boatId: req.params.boatId }).sort({ date: -1 });

            res.json({
                engineCount: vessel.engineCount || 1,
                tankCapacity: vessel.tankCapacity || 0,
                standardRate: vessel.standardRate || 0,
                lastDocDate: lastDoc ? lastDoc.date : null,
                lastHoursR: lastDoc?.engines?.right?.totalHours || 0,
                lastHoursL: lastDoc?.engines?.left?.totalHours || 0
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════
    // 2. حفظ وثيقة تموين جديدة (محرك التحليل الجنائي)
    // POST /api/fuel/documents
    // ═══════════════════════════════════════════════════════════
    app.post('/api/fuel/documents', authenticateAccessToken, csrfProtection, async (req, res) => {
        try {
            const { boatId, documentNumber, date, docTotalHours, docTotalLiters, engineCount, engines } = req.body;
            
            const vessel = await Vessel.findOne({ id: boatId });
            if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });

            const standardRate = vessel.standardRate || 0;
            const tankCapacity = vessel.tankCapacity || 0;

            let riskScore = 0;
            let fraudReasons = [];
            let byRule = {};

            // ─────────────────────────────────────────────────────
            // القاعدة 1: التلاعب في العداد (METER_ROLLBACK)
            // ─────────────────────────────────────────────────────
            const lastDoc = await FuelDocument.findOne({ boatId }).sort({ date: -1 });
            if (lastDoc) {
                if (engines.right && lastDoc.engines?.right && engines.right.totalHours < lastDoc.engines.right.totalHours) {
                    riskScore += 40;
                    byRule.METER_ROLLBACK = true;
                    fraudReasons.push(`تلاعب في عداد المحرك الأيمن: ${engines.right.totalHours} < ${lastDoc.engines.right.totalHours}`);
                }
                if (engines.left && lastDoc.engines?.left && engines.left.totalHours < lastDoc.engines.left.totalHours) {
                    riskScore += 40;
                    byRule.METER_ROLLBACK = true;
                    fraudReasons.push(`تلاعب في عداد المحرك الأيسر: ${engines.left.totalHours} < ${lastDoc.engines.left.totalHours}`);
                }
            }

            // ─────────────────────────────────────────────────────
            // القاعدة 2: تعارض الساعات (HOURS_MISMATCH)
            // ─────────────────────────────────────────────────────
            const sumHours = (engines.right?.usedHours || 0) + (engines.left?.usedHours || 0);
            if (Math.abs(sumHours - docTotalHours) > 0.5) {
                riskScore += 30;
                byRule.HOURS_MISMATCH = true;
                fraudReasons.push(`تعارض الساعات: مجموع المحركات (${sumHours}) ≠ الإجمالي (${docTotalHours})`);
            }

            // ─────────────────────────────────────────────────────
            // القاعدة 3: تعارض الكميات (LITERS_MISMATCH)
            // ─────────────────────────────────────────────────────
            const sumLiters = (engines.right?.requestedLiters || 0) + (engines.left?.requestedLiters || 0);
            if (Math.abs(sumLiters - docTotalLiters) > 0.5) {
                riskScore += 30;
                byRule.LITERS_MISMATCH = true;
                fraudReasons.push(`تعارض الكميات: مجموع المحركات (${sumLiters}) ≠ الإجمالي (${docTotalLiters})`);
            }

            // ─────────────────────────────────────────────────────
            // القاعدة 4: تجاوز سعة الخزان (TANK_OVERFLOW)
            // ─────────────────────────────────────────────────────
            if (tankCapacity > 0 && docTotalLiters > tankCapacity) {
                riskScore += 35;
                byRule.TANK_OVERFLOW = true;
                fraudReasons.push(`تجاوز الخزان: ${docTotalLiters} > ${tankCapacity}`);
            }

            // ─────────────────────────────────────────────────────
            // القاعدة 5: الاستهلاك المرتفع (RATE_INFLATED)
            // ─────────────────────────────────────────────────────
            const totalActualRate = docTotalLiters / (docTotalHours || 1);
            if (standardRate > 0 && totalActualRate > standardRate * 1.15) {
                const inflationPct = ((totalActualRate - standardRate) / standardRate) * 100;
                riskScore += Math.min(40, Math.round(inflationPct));
                byRule.RATE_INFLATED = true;
                fraudReasons.push(`استهلاك مرتفع: ${totalActualRate.toFixed(2)} لتر/ساعة (+${inflationPct.toFixed(1)}% فوق المعيار)`);
            }

            // ─────────────────────────────────────────────────────
            // القاعدة 6: التضخم في الكميات (VOLUME_INFLATION)
            // ─────────────────────────────────────────────────────
            if (tankCapacity > 0 && docTotalLiters >= tankCapacity * 0.9 && docTotalHours < 10) {
                riskScore += 25;
                byRule.VOLUME_INFLATION = true;
                fraudReasons.push(`تضخم الكمية: طلب ${docTotalLiters} لتر لـ ${docTotalHours} ساعة فقط`);
            }

            // ─────────────────────────────────────────────────────
            // القاعدة 7: الرحلات الوهمية (PHANTOM_TRIP)
            // ─────────────────────────────────────────────────────
            if (isWeekend(date)) {
                // تحقق إضافي: هل كان هناك صيانة مسجلة؟
                const maintenanceOnDate = await Maintenance.findOne({
                    vesselId: boatId,
                    date: { $gte: new Date(new Date(date).setHours(0,0,0,0)), $lte: new Date(new Date(date).setHours(23,59,59,999)) }
                });
                if (maintenanceOnDate) {
                    riskScore += 50;
                    byRule.PHANTOM_TRIP = true;
                    fraudReasons.push(`رحلة وهمية: المركب كان تحت الصيانة في هذا التاريخ`);
                }
            }

            // ─────────────────────────────────────────────────────
            // القاعدة 8: التموين المتكرر (DOUBLE_DIP)
            // ─────────────────────────────────────────────────────
            const sameDayDoc = await FuelDocument.findOne({
                boatId,
                date: { $gte: new Date(new Date(date).setHours(0,0,0,0)), $lte: new Date(new Date(date).setHours(23,59,59,999)) }
            });
            if (sameDayDoc) {
                riskScore += 30;
                byRule.DOUBLE_DIP = true;
                fraudReasons.push(`تموين متكرر: توجد وثيقة أخرى في نفس اليوم (${sameDayDoc.documentNumber || sameDayDoc._id})`);
            }

            // ─────────────────────────────────────────────────────
            // القاعدة 9: الانحراف الإحصائي (STAT_ANOMALY)
            // ─────────────────────────────────────────────────────
            if (standardRate > 0) {
                const historicalDocs = await FuelDocument.find({
                    boatId,
                    isFraud: false,
                    totalActualRate: { $gt: 0 }
                }).limit(20);
                
                if (historicalDocs.length >= 3) {
                    const rates = historicalDocs.map(d => d.totalActualRate);
                    const stdDev = calculateStdDev(rates);
                    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
                    
                    if (stdDev > 0 && Math.abs(totalActualRate - mean) > 2 * stdDev) {
                        riskScore += 20;
                        byRule.STAT_ANOMALY = true;
                        fraudReasons.push(`انحراف إحصائي: المعدل ${totalActualRate.toFixed(2)} يبعد بأكثر من انحرافين معياريين عن متوسط المركب (${mean.toFixed(2)})`);
                    }
                }
            }

            // ─────────────────────────────────────────────────────
            // معالجة بيانات المحركات
            // ─────────────────────────────────────────────────────
            const processedEngines = { right: null, left: null };
            if (engines.right) {
                const rateR = engines.right.requestedLiters / (engines.right.usedHours || 1);
                processedEngines.right = {
                    ...engines.right,
                    actualRate: rateR,
                    deviation: standardRate > 0 ? ((rateR - standardRate) / standardRate) * 100 : 0
                };
            }
            if (engines.left) {
                const rateL = engines.left.requestedLiters / (engines.left.usedHours || 1);
                processedEngines.left = {
                    ...engines.left,
                    actualRate: rateL,
                    deviation: standardRate > 0 ? ((rateL - standardRate) / standardRate) * 100 : 0
                };
            }

            // ─────────────────────────────────────────────────────
            // الحفظ النهائي
            // ─────────────────────────────────────────────────────
            const isFraud = riskScore >= 30;
            const finalRisk = Math.min(100, riskScore);

            const newDoc = new FuelDocument({
                boatId,
                documentNumber: documentNumber || '',
                date: date || new Date(),
                docTotalHours,
                docTotalLiters,
                engineCount,
                engines: processedEngines,
                totalActualRate,
                riskScore: finalRisk,
                isFraud,
                fraudReason: fraudReasons.join(' | '),
                byRule,
                createdAt: new Date()
            });

            await newDoc.save();

            res.status(201).json({
                success: true,
                message: isFraud ? 'تم الحفظ (شبهة تلاعب)' : 'تم الحفظ بنجاح',
                riskScore: finalRisk,
                isFraud,
                fraudReason: newDoc.fraudReason,
                doc: newDoc
            });

        } catch (err) {
            console.error('❌ POST /api/fuel/documents:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════
    // 3. جلب وثائق القارب (مع فلترة زمنية)
    // GET /api/fuel/documents/:boatId?start=...&end=...
    // ═══════════════════════════════════════════════════════════
    app.get('/api/fuel/documents/:boatId', authenticateAccessToken, async (req, res) => {
        try {
            const { start, end } = req.query;
            let query = { boatId: req.params.boatId };
            if (start && end) {
                query.date = { $gte: new Date(start), $lte: new Date(end) };
            }
            const docs = await FuelDocument.find(query).sort({ date: -1 });
            res.json(docs);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════
    // 4. تقرير التدقيق الشامل (Audit Report)
    // GET /api/fuel/audit-report/:boatId
    // ═══════════════════════════════════════════════════════════
    app.get('/api/fuel/audit-report/:boatId', authenticateAccessToken, async (req, res) => {
        try {
            const docs = await FuelDocument.find({ boatId: req.params.boatId });
            const vessel = await Vessel.findOne({ id: req.params.boatId });
            const standardRate = vessel?.standardRate || 0;

            let totalLiters = 0;
            let totalHours = 0;
            let flagged = 0;
            let warned = 0;
            let riskSum = 0;
            let riskCount = 0;
            let excessLiters = 0;
            const byRule = {};

            docs.forEach(d => {
                totalLiters += d.docTotalLiters || 0;
                totalHours += d.docTotalHours || 0;
                
                if (d.riskScore > 60) flagged++;
                else if (d.riskScore >= 30) warned++;
                
                if (typeof d.riskScore === 'number') {
                    riskSum += d.riskScore;
                    riskCount++;
                }

                // حساب فائض الوقود عن المعيار
                if (standardRate > 0 && d.docTotalHours > 0) {
                    const expected = d.docTotalHours * standardRate;
                    if (d.docTotalLiters > expected) {
                        excessLiters += (d.docTotalLiters - expected);
                    }
                }

                // تجميع المخالفات حسب القاعدة
                if (d.byRule) {
                    Object.keys(d.byRule).forEach(rule => {
                        byRule[rule] = (byRule[rule] || 0) + 1;
                    });
                }
            });

            res.json({
                boatId: req.params.boatId,
                vesselName: vessel?.name || '—',
                totals: {
                    totalDocs: docs.length,
                    totalLiters,
                    totalHours,
                    flagged,
                    warned,
                    avgRisk: riskCount > 0 ? (riskSum / riskCount) : 0,
                    excessLiters: standardRate > 0 ? excessLiters : null
                },
                byRule
            });

        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════
    // 5. الاكتشاف التلقائي للاستهلاك المعياري
    // GET /api/fuel/auto-standard/:boatId
    // ═══════════════════════════════════════════════════════════
    app.get('/api/fuel/auto-standard/:boatId', authenticateAccessToken, async (req, res) => {
        try {
            const currentVessel = await Vessel.findOne({ id: req.params.boatId });
            if (!currentVessel) return res.status(404).json({ error: 'المركب غير موجود' });
            
            const category = currentVessel.cat;
            if (!category) return res.json({ autoRate: 0, message: 'المركب لا ينتمي لأي فئة' });

            // جلب كل القوارب من نفس الفئة
            const sameCategoryVessels = await Vessel.find({ cat: category }).select('id');
            const vesselIds = sameCategoryVessels.map(v => v.id);

            // جلب الوثائق السليمة فقط
            const docs = await FuelDocument.find({
                boatId: { $in: vesselIds },
                isFraud: false,
                totalActualRate: { $gt: 0 }
            });

            if (docs.length < 3) {
                return res.json({ autoRate: 0, message: 'لا توجد بيانات كافية (أقل من 3 وثائق سليمة)' });
            }

            // استبعاد القيم الشاذة (أكثر من 2 انحراف معياري)
            const rates = docs.map(d => d.totalActualRate);
            const stdDev = calculateStdDev(rates);
            const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
            
            const filteredRates = rates.filter(r => Math.abs(r - mean) <= 2 * stdDev);
            const finalAvg = filteredRates.reduce((a, b) => a + b, 0) / filteredRates.length;

            res.json({
                autoRate: parseFloat(finalAvg.toFixed(2)),
                category,
                basedOn: filteredRates.length,
                totalDocs: docs.length,
                excluded: docs.length - filteredRates.length,
                stdDev: parseFloat(stdDev.toFixed(2)),
                caution: filteredRates.length < 5 ? 'البيانات قليلة، الرقم قد لا يكون دقيقاً' : null
            });

        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ═══════════════════════════════════════════════════════════
    // 6. مقارنة المركب مع مركب من نفس الفئة
    // GET /api/fuel/compare-vessel/:boatId
    // ═══════════════════════════════════════════════════════════
    app.get('/api/fuel/compare-vessel/:boatId', authenticateAccessToken, async (req, res) => {
        try {
            const currentVessel = await Vessel.findOne({ id: req.params.boatId });
            if (!currentVessel) return res.status(404).json({ error: 'المركب غير موجود' });

            const category = currentVessel.cat || '';
            const otherVessel = await Vessel.findOne({
                id: { $ne: req.params.boatId },
                $or: [
                    { cat: category },
                    { len: { $gte: (currentVessel.len - 2), $lte: (currentVessel.len + 2) } }
                ]
            });

            if (!otherVessel) {
                return res.json({ success: false, message: 'لا يوجد مركب آخر للمقارنة' });
            }

            const currentDoc = await FuelDocument.findOne({ boatId: req.params.boatId }).sort({ date: -1 });
            const otherDoc = await FuelDocument.findOne({ boatId: otherVessel.id }).sort({ date: -1 });

            res.json({
                success: true,
                current: {
                    name: currentVessel.name,
                    totalLiters: currentDoc ? currentDoc.docTotalLiters : 0,
                    totalHours: currentDoc ? currentDoc.docTotalHours : 0,
                    rate: currentDoc ? currentDoc.totalActualRate : 0
                },
                other: {
                    name: otherVessel.name,
                    totalLiters: otherDoc ? otherDoc.docTotalLiters : 0,
                    totalHours: otherDoc ? otherDoc.docTotalHours : 0,
                    rate: otherDoc ? otherDoc.totalActualRate : 0
                }
            });

        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

};
