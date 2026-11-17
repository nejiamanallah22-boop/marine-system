/**
 * routes/fuel.js — محرك التدقيق لوثائق تموين المحروقات
 */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Vessel = require('../models/Vessel');
const FuelDocument = require('../models/FuelDocument');

let authenticateAccessToken, csrfProtection;

const T = {
  INFLATION: 0.15, FULL_TANK: 0.9, SHORT_HOURS: 10, SIGMA: 2, MIN_HIST: 5,
  METER_EPS: 0.01, SUM_EPS: 0.5, WEEKEND: [5, 6], FRAUD: 60, WARN: 30
};
const DAY = 864e5;
const n = v => (Number.isFinite(+v) ? +v : 0);
const dayStart = d => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

let maintenanceChecker = async () => false;
router.setMaintenanceChecker = fn => { maintenanceChecker = fn; };

// دالة البحث عن القارب (تقبل id أو _id)
async function findVessel(boatId) {
  let query = { id: boatId };
  if (mongoose.Types.ObjectId.isValid(boatId)) {
    query = { $or: [{ id: boatId }, { _id: boatId }] };
  }
  return await Vessel.findOne(query).lean();
}

function stats(a) {
  const c = a.length;
  if (!c) return { n: 0, mean: 0, sd: 0 };
  const mean = a.reduce((s, x) => s + x, 0) / c;
  return { n: c, mean, sd: Math.sqrt(a.reduce((s, x) => s + (x - mean) ** 2, 0) / c) };
}

function cleanEngine(e) {
  const g = k => (Number.isFinite(+e?.[k]) && +e[k] >= 0 ? +e[k] : 0);
  return { totalHours: g('totalHours'), usedHours: g('usedHours'), requestedLiters: g('requestedLiters') };
}

function analyze(doc, ctx) {
  const flags = [];
  const add = (code, points, msg) => flags.push({ code, points: Math.round(points), msg });
  const v = ctx.vessel, d = new Date(doc.date);
  const hours = n(doc.docTotalHours), liters = n(doc.docTotalLiters);
  const std = n(v.standardRate), tank = n(v.tankCapacity), rate = hours > 0 ? liters / hours : 0;
  const eng = [['right', 'الأيمن', doc.engines?.right], ['left', 'الأيسر', doc.engines?.left]].filter(x => x[2]);

  if (ctx.prev) for (const [k, name, e] of eng) {
    const cur = n(e.totalHours), old = n(ctx.prev.engines?.[k]?.totalHours);
    if (cur > 0 && old > 0 && cur < old - T.METER_EPS) add('METER_ROLLBACK', 40, `عداد المحرك ${name} (${cur}) أقل من القراءة السابقة (${old})`);
  }
  const sh = eng.reduce((s, x) => s + n(x[2].usedHours), 0), sl = eng.reduce((s, x) => s + n(x[2].requestedLiters), 0);
  if (sh > 0 && Math.abs(sh - hours) > T.SUM_EPS) add('HOURS_MISMATCH', 25, `مجموع ساعات المحركات (${sh}) ≠ الإجمالي (${hours})`);
  if (sl > 0 && Math.abs(sl - liters) > T.SUM_EPS) add('LITERS_MISMATCH', 25, `مجموع وقود المحركات (${sl}) ≠ الإجمالي (${liters})`);
  if (tank > 0 && liters > tank) add('TANK_OVERFLOW', 35, `الكمية (${liters}) أكبر من سعة الخزان (${tank})`);
  if (std > 0 && rate >= std * (1 + T.INFLATION)) {
    const over = (rate / std - 1) * 100;
    add('RATE_INFLATED', Math.min(35, over), `المعدل ${rate.toFixed(2)} يتجاوز المعيار ${std} بنسبة ${over.toFixed(0)}%`);
  }
  if (tank > 0 && liters >= T.FULL_TANK * tank && hours < T.SHORT_HOURS)
    add('VOLUME_INFLATION', 25, `تموين ${liters} لتر (≥ 90% من الخزان) مقابل ${hours} ساعة فقط`);
  const reasons = [];
  if (T.WEEKEND.includes(d.getUTCDay())) reasons.push('يوم عطلة أسبوعية');
  const off = (v.inactivePeriods || []).find(p => d >= new Date(p.from) && d <= new Date(p.to));
  if (off) reasons.push('فترة توقف مسجلة' + (off.reason ? ` (${off.reason})` : ''));
  if (ctx.maintenance) reasons.push(typeof ctx.maintenance === 'string' ? ctx.maintenance : 'يوم صيانة مسجل');
  if (reasons.length) add('PHANTOM_TRIP', 30, `وثيقة في ${reasons.join(' / ')}`);
  if (ctx.sameDay.length) add('DOUBLE_DIP', 20, `وثيقة أخرى لنفس المركب في نفس اليوم`);
  const h = ctx.hist;
  if (h && h.n >= T.MIN_HIST && h.sd > 0 && Math.abs(rate - h.mean) > T.SIGMA * h.sd)
    add('STAT_ANOMALY', 20, `المعدل ${rate.toFixed(2)} يبعد أكثر من ${T.SIGMA} انحراف معياري عن المتوسط`);

  const byRule = {};
  flags.forEach(f => { byRule[f.code] = (byRule[f.code] || 0) + 1; });
  const riskScore = Math.min(100, flags.reduce((s, f) => s + f.points, 0));
  return { flags, byRule, riskScore, isFraud: riskScore > T.FRAUD, fraudReason: flags.map(f => f.msg).join(' | ') };
}

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

router.post('/documents', async (req, res) => {
  try {
    const b = req.body || {};
    const hours = +b.docTotalHours, liters = +b.docTotalLiters, date = new Date(b.date);
    if (!b.boatId || !(hours > 0) || !(liters > 0) || isNaN(date)) return res.status(400).json({ error: 'بيانات غير صالحة' });
    const vessel = await findVessel(String(b.boatId));
    if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
    const twin = vessel.engineCount === 2;
    const doc = new FuelDocument({
      boatId: vessel.id || vessel._id.toString(), date, docTotalHours: hours, docTotalLiters: liters,
      documentNumber: b.documentNumber ? String(b.documentNumber).slice(0, 40) : undefined,
      engineCount: twin ? 2 : 1,
      engines: { right: cleanEngine(b.engines?.right), left: twin ? cleanEngine(b.engines?.left) : undefined },
      totalActualRate: liters / hours, createdBy: req.user?.id
    });
    Object.assign(doc, analyze(doc, await buildContext(doc, vessel)));
    await doc.save();
    res.status(201).json({ ok: true, id: doc._id, riskScore: doc.riskScore, isFraud: doc.isFraud, fraudReason: doc.fraudReason, byRule: doc.byRule, flags: doc.flags });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/standards/:boatId', async (req, res) => {
  try {
    const v = await findVessel(req.params.boatId);
    if (!v) return res.status(404).json({ error: 'المركب غير موجود' });
    res.json({ engineCount: v.engineCount || null, tankCapacity: n(v.tankCapacity) || null, standardRate: n(v.standardRate) || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/documents/:boatId', async (req, res) => {
  try {
    const docs = await FuelDocument.find({ boatId: req.params.boatId }).sort({ date: -1 });
    res.json(docs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/audit-report/:boatId', async (req, res) => {
  try {
    const v = await findVessel(req.params.boatId);
    if (!v) return res.status(404).json({ error: 'المركب غير موجود' });
    const bId = v.id || v._id.toString();
    const docs = await FuelDocument.find({ boatId: bId }).sort({ date: 1 }).lean();
    const std = n(v.standardRate), tank = n(v.tankCapacity);
    let liters = 0, hours = 0, riskSum = 0;
    docs.forEach(d => { liters += n(d.docTotalLiters); hours += n(d.docTotalHours); riskSum += n(d.riskScore); });
    res.json({ vessel: { id: bId, name: v.name }, totals: { docs: docs.length, totalHours: hours, requestedLiters: liters, avgRisk: docs.length ? riskSum / docs.length : 0 }, byRule: {} });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/auto-standard/:boatId', async (req, res) => {
  try {
    const v = await findVessel(req.params.boatId);
    if (!v) return res.status(404).json({ error: 'المركب غير موجود' });
    res.json({ autoRate: n(v.standardRate) || 0, message: 'الاستهلاك المعياري المسجل' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/compare-vessel/:boatId', async (req, res) => {
  try {
    const cur = await findVessel(req.params.boatId);
    if (!cur) return res.status(404).json({ error: 'المركب غير موجود' });
    res.json({ success: false, message: 'المقارنة غير متاحة حالياً' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = function(app, middlewares) {
    authenticateAccessToken = middlewares.authenticateAccessToken;
    csrfProtection = middlewares.csrfProtection;
    app.use('/api/fuel', authenticateAccessToken, router);
};
