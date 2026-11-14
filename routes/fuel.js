/**
 * routes/fuel.js — محرك التدقيق لوثائق تموين المحروقات (9 قواعد)
 *
 * افتراضات (عدّلها حسب مشروعك):
 *  - التركيب: app.use('/api/fuel', require('./routes/fuel'))
 *  - authenticateAccessToken و csrfProtection يُصدَّران من ../middleware/auth
 *  - نموذج Vessel: id, name, cat, len, engineCount, tankCapacity, standardRate
 *    وحقل اختياري inactivePeriods: [{ from, to, reason }] لأيام التوقف/الصيانة.
 *  - للربط بمنظومة الصيانة: router.setMaintenanceChecker(async (boatId, date) => bool|string)
 *  - النظام يرصد «شبهة» ولا يثبت سرقة؛ القرار النهائي للمراجعة البشرية.
 */
const express = require('express');
const router = express.Router();
const { authenticateAccessToken, csrfProtection } = require('../middleware/auth');
const Vessel = require('../models/Vessel');
const FuelDocument = require('../models/FuelDocument');

/* ثوابت القواعد */
const T = {
  INFLATION: 0.15,      // (5) تجاوز المعيار 15% فأكثر
  FULL_TANK: 0.9,       // (6) كمية ≥ 90% من السعة
  SHORT_HOURS: 10,      // (6) ... مع ساعات عمل < 10
  SIGMA: 2,             // (9) انحرافان معياريان
  MIN_HIST: 5,          // (9) أقل عدد وثائق تاريخية للمركب
  METER_EPS: 0.01, SUM_EPS: 0.5,
  WEEKEND: [5, 6],      // (7) جمعة وسبت (getUTCDay) — عدّلها إن اختلفت عطلتكم
  FRAUD: 60, WARN: 30   // أحمر > 60 · أصفر 30–60 · أخضر < 30
};
const DAY = 864e5;
const n = v => (Number.isFinite(+v) ? +v : 0);
const dayStart = d => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

let maintenanceChecker = async () => false;
router.setMaintenanceChecker = fn => { maintenanceChecker = fn; };

/* العدد والمتوسط والانحراف المعياري */
function stats(a) {
  const c = a.length;
  if (!c) return { n: 0, mean: 0, sd: 0 };
  const mean = a.reduce((s, x) => s + x, 0) / c;
  return { n: c, mean, sd: Math.sqrt(a.reduce((s, x) => s + (x - mean) ** 2, 0) / c) };
}

/* تنظيف بيانات المحرك القادمة من العميل */
function cleanEngine(e) {
  const g = k => (Number.isFinite(+e?.[k]) && +e[k] >= 0 ? +e[k] : 0);
  return { totalHours: g('totalHours'), usedHours: g('usedHours'), requestedLiters: g('requestedLiters') };
}

/**
 * يطبق القواعد التسع على وثيقة.
 * ctx = { vessel, prev, sameDay, hist, maintenance }
 * يعيد { flags, byRule, riskScore, isFraud, fraudReason }
 */
function analyze(doc, ctx) {
  const flags = [];
  const add = (code, points, msg) => flags.push({ code, points: Math.round(points), msg });
  const v = ctx.vessel, d = new Date(doc.date);
  const hours = n(doc.docTotalHours), liters = n(doc.docTotalLiters);
  const std = n(v.standardRate), tank = n(v.tankCapacity), rate = hours > 0 ? liters / hours : 0;
  const eng = [['right', 'الأيمن', doc.engines?.right], ['left', 'الأيسر', doc.engines?.left]].filter(x => x[2]);

  // 1) تراجع العداد
  if (ctx.prev) for (const [k, name, e] of eng) {
    const cur = n(e.totalHours), old = n(ctx.prev.engines?.[k]?.totalHours);
    if (cur > 0 && old > 0 && cur < old - T.METER_EPS) add('METER_ROLLBACK', 40, `عداد المحرك ${name} (${cur}) أقل من القراءة السابقة (${old})`);
  }
  // 2) + 3) تعارض ساعات / كميات المحركات مع إجمالي الوثيقة
  const sh = eng.reduce((s, x) => s + n(x[2].usedHours), 0), sl = eng.reduce((s, x) => s + n(x[2].requestedLiters), 0);
  if (sh > 0 && Math.abs(sh - hours) > T.SUM_EPS) add('HOURS_MISMATCH', 25, `مجموع ساعات المحركات (${sh}) ≠ الإجمالي (${hours})`);
  if (sl > 0 && Math.abs(sl - liters) > T.SUM_EPS) add('LITERS_MISMATCH', 25, `مجموع وقود المحركات (${sl}) ≠ الإجمالي (${liters})`);
  // 4) تجاوز سعة الخزان
  if (tank > 0 && liters > tank) add('TANK_OVERFLOW', 35, `الكمية (${liters}) أكبر من سعة الخزان (${tank})`);
  // 5) استهلاك وهمي: ≥ 115% من المعيار
  if (std > 0 && rate >= std * (1 + T.INFLATION)) {
    const over = (rate / std - 1) * 100;
    add('RATE_INFLATED', Math.min(35, over), `المعدل ${rate.toFixed(2)} يتجاوز المعيار ${std} بنسبة ${over.toFixed(0)}%`);
  }
  // 6) تضخم الكمية: ≥ 90% من السعة مع أقل من 10 ساعات
  if (tank > 0 && liters >= T.FULL_TANK * tank && hours < T.SHORT_HOURS)
    add('VOLUME_INFLATION', 25, `تموين ${liters} لتر (≥ 90% من الخزان) مقابل ${hours} ساعة فقط`);
  // 7) رحلة وهمية: عطلة أسبوعية أو فترة توقف/صيانة
  const reasons = [];
  if (T.WEEKEND.includes(d.getUTCDay())) reasons.push('يوم عطلة أسبوعية');
  const off = (v.inactivePeriods || []).find(p => d >= new Date(p.from) && d <= new Date(p.to));
  if (off) reasons.push('فترة توقف مسجلة' + (off.reason ? ` (${off.reason})` : ''));
  if (ctx.maintenance) reasons.push(typeof ctx.maintenance === 'string' ? ctx.maintenance : 'يوم صيانة مسجل');
  if (reasons.length) add('PHANTOM_TRIP', 30, `وثيقة في ${reasons.join(' / ')}`);
  // 8) تموين متكرر في نفس اليوم
  if (ctx.sameDay.length) add('DOUBLE_DIP', 20, `وثيقة أخرى لنفس المركب في نفس اليوم${ctx.sameDay[0].documentNumber ? ' (رقم ' + ctx.sameDay[0].documentNumber + ')' : ''}`);
  // 9) انحراف عن متوسط المركب التاريخي
  const h = ctx.hist;
  if (h && h.n >= T.MIN_HIST && h.sd > 0 && Math.abs(rate - h.mean) > T.SIGMA * h.sd)
    add('STAT_ANOMALY', 20, `المعدل ${rate.toFixed(2)} يبعد أكثر من ${T.SIGMA} انحراف معياري عن متوسط المركب ${h.mean.toFixed(2)}`);

  const byRule = {};
  flags.forEach(f => { byRule[f.code] = (byRule[f.code] || 0) + 1; });
  const riskScore = Math.min(100, flags.reduce((s, f) => s + f.points, 0));
  return { flags, byRule, riskScore, isFraud: riskScore > T.FRAUD, fraudReason: flags.map(f => f.msg).join(' | ') };
}

/* يجمع سياق التحليل: السابقة، نفس اليوم، تاريخ المركب، الصيانة */
async function buildContext(doc, vessel) {
  const d = new Date(doc.date), s = dayStart(d);
  const own = { boatId: doc.boatId, _id: { $ne: doc._id } };
  const [prev, sameDay, histDocs, maintenance] = await Promise.all([
    FuelDocument.findOne({ ...own, date: { $lt: d } }).sort({ date: -1 }).lean(),
    FuelDocument.find({ ...own, date: { $gte: new Date(s), $lt: new Date(s + DAY) } }).select('documentNumber').lean(),
    FuelDocument.find({ ...own, isFraud: false, totalActualRate: { $gt: 0 } }).select('totalActualRate').lean(),
    maintenanceChecker(doc.boatId, d).catch(() => false)
  ]);
  return { vessel, prev, sameDay, hist: stats(histDocs.map(x => x.totalActualRate)), maintenance };
}

/* ───────── تسجيل وثيقة + تحليلها ───────── */
router.post('/documents', authenticateAccessToken, csrfProtection, async (req, res) => {
  try {
    const b = req.body || {};
    const hours = +b.docTotalHours, liters = +b.docTotalLiters, date = new Date(b.date);
    if (!b.boatId || !(hours > 0) || !(liters > 0) || isNaN(date)) return res.status(400).json({ error: 'بيانات الوثيقة غير صالحة' });
    const vessel = await Vessel.findOne({ id: String(b.boatId) }).lean();
    if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
    const twin = vessel.engineCount === 2;
    const doc = new FuelDocument({
      boatId: vessel.id, date, docTotalHours: hours, docTotalLiters: liters,
      documentNumber: b.documentNumber ? String(b.documentNumber).replace(/[<>]/g, '').slice(0, 40) : undefined,
      engineCount: twin ? 2 : 1,
      engines: { right: cleanEngine(b.engines?.right), left: twin ? cleanEngine(b.engines?.left) : undefined },
      totalActualRate: liters / hours, createdBy: req.user?.id
    });
    Object.assign(doc, analyze(doc, await buildContext(doc, vessel)));
    await doc.save();
    res.status(201).json({ ok: true, id: doc._id, riskScore: doc.riskScore, isFraud: doc.isFraud, fraudReason: doc.fraudReason, byRule: doc.byRule, flags: doc.flags });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ───────── معايير القارب ───────── */
router.get('/standards/:boatId', authenticateAccessToken, async (req, res) => {
  try {
    const v = await Vessel.findOne({ id: req.params.boatId }).lean();
    if (!v) return res.status(404).json({ error: 'المركب غير موجود' });
    const last = await FuelDocument.findOne({ boatId: v.id }).sort({ date: -1 }).lean();
    res.json({
      engineCount: v.engineCount || null, tankCapacity: n(v.tankCapacity) || null, standardRate: n(v.standardRate) || null,
      lastHours: last ? { date: last.date, right: last.engines?.right?.totalHours ?? null, left: last.engines?.left?.totalHours ?? null } : null
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ───────── تقرير التدقيق لمركب ───────── */
router.get('/audit-report/:boatId', authenticateAccessToken, async (req, res) => {
  try {
    const v = await Vessel.findOne({ id: req.params.boatId }).lean();
    if (!v) return res.status(404).json({ error: 'المركب غير موجود' });
    const docs = await FuelDocument.find({ boatId: v.id }).sort({ date: 1 }).lean();
    const std = n(v.standardRate), tank = n(v.tankCapacity);
    let liters = 0, hours = 0, expected = 0, excess = 0, riskSum = 0, bal = 0;
    const byRule = {};
    docs.forEach(d => {
      const L = n(d.docTotalLiters), H = n(d.docTotalHours), exp = H * std;
      liters += L; hours += H; riskSum += n(d.riskScore);
      if (std > 0) { expected += exp; excess += Math.max(0, L - exp); if (tank > 0) bal = Math.min(tank, Math.max(0, bal + L - exp)); }
      const br = d.byRule && Object.keys(d.byRule).length ? d.byRule : Object.fromEntries((d.flags || []).map(f => [f.code, 1]));
      Object.entries(br).forEach(([k, c]) => { byRule[k] = (byRule[k] || 0) + c; });
    });
    const hasStd = std > 0;
    res.json({
      vessel: { id: v.id, name: v.name, cat: v.cat, standardRate: std || null, tankCapacity: tank || null },
      totals: {
        docs: docs.length, totalHours: hours, avgHours: docs.length ? hours / docs.length : 0,
        requestedLiters: liters,
        flagged: docs.filter(d => d.riskScore > T.FRAUD).length,
        warned: docs.filter(d => d.riskScore >= T.WARN && d.riskScore <= T.FRAUD).length,
        avgRisk: docs.length ? riskSum / docs.length : 0,
        expectedLiters: hasStd ? expected : null,
        varianceLiters: hasStd ? liters - expected : null,                       // موجب = فائض · سالب = توفير
        variancePct: hasStd && expected > 0 ? ((liters - expected) / expected) * 100 : null,
        excessLiters: hasStd ? excess : null,
        // رصيد تقديري: تراكم (المُموَّن − المتوقع) محصوراً بين 0 والسعة، ويفترض خزاناً فارغاً قبل أول وثيقة
        balanceLiters: hasStd && tank > 0 && docs.length ? bal : null,
        balancePct: hasStd && tank > 0 && docs.length ? (bal / tank) * 100 : null
      },
      byRule,
      topRisks: docs.filter(d => d.riskScore > 0).sort((a, b) => b.riskScore - a.riskScore).slice(0, 5)
        .map(d => ({ id: d._id, date: d.date, documentNumber: d.documentNumber, riskScore: d.riskScore, fraudReason: d.fraudReason }))
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ───────── ملخص الأسطول ───────── */
router.get('/fleet-summary', authenticateAccessToken, async (req, res) => {
  try {
    const vessels = await Vessel.find().select('id standardRate').lean();
    const std = Object.fromEntries(vessels.map(v => [v.id, n(v.standardRate)]));
    const docs = await FuelDocument.find().select('boatId docTotalHours docTotalLiters riskScore').lean();
    let requested = 0, expected = 0, excess = 0, flagged = 0, warned = 0, noStd = 0;
    docs.forEach(d => {
      const s = std[d.boatId] || 0, L = n(d.docTotalLiters);
      requested += L;
      if (s > 0) { const e = n(d.docTotalHours) * s; expected += e; excess += Math.max(0, L - e); } else noStd++;
      if (d.riskScore > T.FRAUD) flagged++; else if (d.riskScore >= T.WARN) warned++;
    });
    res.json({ vessels: vessels.length, docs: docs.length, requestedLiters: requested, expectedLiters: expected, excessLiters: excess, flagged, warned, docsWithoutStandard: noStd });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ───────── اكتشاف الاستهلاك المعياري من الفئة ───────── */
router.get('/auto-standard/:boatId', authenticateAccessToken, async (req, res) => {
  try {
    const v = await Vessel.findOne({ id: req.params.boatId }).lean();
    if (!v) return res.status(404).json({ error: 'المركب غير موجود' });
    if (!v.cat) return res.json({ autoRate: 0, source: 'none', message: 'المركب لا ينتمي لأي فئة' });
    const ids = (await Vessel.find({ cat: v.cat }).select('id').lean()).map(x => x.id);
    const docs = await FuelDocument.find({ boatId: { $in: ids }, isFraud: false, totalActualRate: { $gt: 0 } }).select('totalActualRate').lean();
    if (docs.length < 3) return res.json({ autoRate: 0, source: 'insufficient', message: 'لا توجد بيانات كافية (أقل من 3 وثائق سليمة في الفئة)' });

    const rates = docs.map(d => d.totalActualRate), all = stats(rates);
    const kept = rates.filter(r => Math.abs(r - all.mean) <= T.SIGMA * all.sd);
    const fin = stats(kept.length ? kept : rates);
    const cautions = ['يُحسب من بيانات الأسطول نفسه؛ قارنه بمواصفات المحرك قبل الاعتماد.'];
    if (docs.length < 10) cautions.unshift('البيانات قليلة (' + docs.length + ' وثائق) فالرقم تقريبي.');
    res.json({
      autoRate: +fin.mean.toFixed(2), source: 'category', category: v.cat,
      basedOn: kept.length || rates.length, totalDocs: docs.length, excluded: docs.length - (kept.length || rates.length),
      stdDev: +all.sd.toFixed(2), currentRate: n(v.standardRate) || null, caution: cautions.join(' ')
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ───────── مقارنة مع مركب مشابه (نفس الفئة، وإلا طول مقارب ±15%) ───────── */
router.get('/compare-vessel/:boatId', authenticateAccessToken, async (req, res) => {
  try {
    const cur = await Vessel.findOne({ id: req.params.boatId }).lean();
    if (!cur) return res.status(404).json({ error: 'المركب غير موجود' });
    let others = cur.cat ? await Vessel.find({ cat: cur.cat, id: { $ne: cur.id } }).lean() : [], basis = 'cat';
    if (!others.length && n(cur.len) > 0) {
      others = await Vessel.find({ id: { $ne: cur.id }, len: { $gte: cur.len * 0.85, $lte: cur.len * 1.15 } }).lean();
      basis = 'len';
    }
    if (!others.length) return res.json({ success: false, reason: 'no_similar', message: 'لا يوجد مركب مشابه' });

    const agg = await FuelDocument.aggregate([
      { $match: { boatId: { $in: [cur.id, ...others.map(o => o.id)] } } },
      { $group: { _id: '$boatId', liters: { $sum: '$docTotalLiters' }, hours: { $sum: '$docTotalHours' }, docs: { $sum: 1 } } }
    ]);
    const m = Object.fromEntries(agg.map(a => [a._id, a]));
    const mk = x => { const a = m[x.id] || { liters: 0, hours: 0, docs: 0 }; return { id: x.id, name: x.name, totalLiters: a.liters, totalHours: a.hours, docs: a.docs, rate: a.hours > 0 ? a.liters / a.hours : 0 }; };
    const withData = others.filter(o => m[o.id] && m[o.id].hours > 0)
      .sort((a, b) => Math.abs(n(a.len) - n(cur.len)) - Math.abs(n(b.len) - n(cur.len)));
    if (!withData.length) return res.json({ success: false, reason: 'no_data', message: 'لا توجد بيانات استهلاك للمراكب المشابهة' });
    res.json({ success: true, basis, current: mk(cur), other: mk(withData[0]), rateDiff: mk(cur).rate - mk(withData[0]).rate });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
