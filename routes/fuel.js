/**
 * routes/fuel.js — محرك التدقيق لوثائق تموين المحروقات
 * يتطلب: models/Vessel.js و models/FuelDocument.js
 */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Vessel = require('../models/Vessel');
const FuelDocument = require('../models/FuelDocument');

let authenticateAccessToken, csrfProtection, normalizeRole = r => String(r || '');
const csrf = (req, res, next) => csrfProtection(req, res, next);

const WRITE_ROLES = ['admin', 'manager', 'editor', 'maintenance_unit'];
const PRIVILEGED = ['admin', 'manager'];
const FRAUD_THRESHOLD = 60;
const WARN_THRESHOLD = 30;

// وزن كل قاعدة في درجة الخطر (الحد الأقصى 100)
const WEIGHTS = {
  METER_ROLLBACK: 70, RATE_INFLATED: 45, TANK_OVERFLOW: 70, HOURS_MISMATCH: 35,
  LITERS_MISMATCH: 35, PHANTOM_TRIP: 65, STAT_ANOMALY: 25, VOLUME_INFLATION: 40, DOUBLE_DIP: 45
};

/* ───────── أدوات ───────── */
const n = v => { const x = Number(v); return Number.isFinite(x) ? x : NaN; };
const r2 = v => Math.round(v * 100) / 100;
const roleOf = req => normalizeRole(req.user && req.user.role);
const isPrivileged = req => PRIVILEGED.includes(roleOf(req));
const canWrite = req => WRITE_ROLES.includes(roleOf(req));
const validId = s => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(s);
const fail = (res, err, where) => { console.error('❌ [FUEL] ' + where + ':', err && err.message); res.status(500).json({ error: 'خطأ في الخادم' }); };

async function findVessel(boatId) {
  if (!validId(boatId)) return null;
  const q = /^[a-f0-9]{24}$/i.test(boatId) && mongoose.Types.ObjectId.isValid(boatId)
    ? { $or: [{ id: boatId }, { _id: boatId }] } : { id: boatId };
  return Vessel.findOne(q).lean();
}
const idsOf = v => [v.id, String(v._id)].filter(Boolean);
const allowed = (req, v) => isPrivileged(req) || !req.user.region || v.region === req.user.region;

async function loadVessel(req, res) {
  const v = await findVessel(req.params.boatId);
  if (!v || !allowed(req, v)) { res.status(404).json({ error: 'المركب غير موجود' }); return null; }
  return v;
}

function readEngine(e) {
  if (!e || typeof e !== 'object') return null;
  const o = { totalHours: n(e.totalHours), usedHours: n(e.usedHours), requestedLiters: n(e.requestedLiters) };
  if (isNaN(o.totalHours)) o.totalHours = 0;
  if (isNaN(o.usedHours) || isNaN(o.requestedLiters)) return null;
  if (o.totalHours < 0 || o.usedHours < 0 || o.requestedLiters < 0) return null;
  if (o.totalHours > 1e7 || o.usedHours > 1e5 || o.requestedLiters > 1e6) return null;
  return o;
}

/* ───────── محرك التدقيق ───────── */
async function runAudit(vessel, d) {
  const hits = {};
  const add = (rule, msg) => { hits[rule] = msg; };
  const ids = idsOf(vessel);
  const std = Number(vessel.standardRate) || 0;
  const tank = Number(vessel.tankCapacity) || 0;
  const rate = d.docTotalHours > 0 ? d.docTotalLiters / d.docTotalHours : 0;
  const eng = [d.engines.right, d.engines.left].filter(Boolean);

  const sumH = eng.reduce((s, e) => s + e.usedHours, 0);
  const sumL = eng.reduce((s, e) => s + e.requestedLiters, 0);
  if (Math.abs(sumH - d.docTotalHours) > 0.5) add('HOURS_MISMATCH', 'مجموع ساعات المحركات (' + sumH + ') ≠ الإجمالي (' + d.docTotalHours + ')');
  if (Math.abs(sumL - d.docTotalLiters) > 0.5) add('LITERS_MISMATCH', 'مجموع وقود المحركات (' + sumL + ') ≠ الإجمالي (' + d.docTotalLiters + ')');
  if (tank > 0 && d.docTotalLiters > tank) add('TANK_OVERFLOW', 'الكمية (' + d.docTotalLiters + ') تتجاوز سعة الخزان (' + tank + ')');
  if (std > 0 && rate >= std * 1.15) add('RATE_INFLATED', 'المعدل ' + r2(rate) + ' يتجاوز المعيار ' + std + ' بـ 15% أو أكثر');
  if (tank > 0 && d.docTotalLiters >= 0.9 * tank && d.docTotalHours < 10) add('VOLUME_INFLATION', 'تعبئة ≥ 90% من الخزان مقابل أقل من 10 ساعات');

  const t = d.date.getTime();
  if ((vessel.inactivePeriods || []).some(p => p.from && t >= new Date(p.from).getTime() && (!p.to || t <= new Date(p.to).getTime())))
    add('PHANTOM_TRIP', 'الوثيقة داخل فترة توقف مسجلة للمركب');

  // تراجع العداد مقارنة بالوثيقة السابقة واللاحقة
  const [prev, next] = await Promise.all([
    FuelDocument.findOne({ boatId: { $in: ids }, date: { $lt: d.date } }).sort({ date: -1 }).lean(),
    FuelDocument.findOne({ boatId: { $in: ids }, date: { $gt: d.date } }).sort({ date: 1 }).lean()
  ]);
  ['right', 'left'].forEach(side => {
    const cur = d.engines[side]; if (!cur || !(cur.totalHours > 0)) return;
    const p = prev && prev.engines && prev.engines[side], q = next && next.engines && next.engines[side];
    if (p && p.totalHours > cur.totalHours) add('METER_ROLLBACK', 'عداد الساعات (' + cur.totalHours + ') أقل من الوثيقة السابقة (' + p.totalHours + ')');
    if (q && q.totalHours > 0 && q.totalHours < cur.totalHours) add('METER_ROLLBACK', 'عداد الساعات (' + cur.totalHours + ') أكبر من الوثيقة اللاحقة (' + q.totalHours + ')');
  });

  // تموين مكرر: نفس اليوم أو نفس رقم الوثيقة
  const dayEnd = new Date(t + 864e5);
  const dupQ = [{ date: { $gte: d.date, $lt: dayEnd } }];
  if (d.documentNumber) dupQ.push({ documentNumber: d.documentNumber });
  if (await FuelDocument.exists({ boatId: { $in: ids }, $or: dupQ })) add('DOUBLE_DIP', 'وثيقة أخرى بنفس التاريخ أو الرقم لهذا المركب');

  // انحراف إحصائي عن سجل المركب
  const hist = await FuelDocument.find({ boatId: { $in: ids }, isFraud: false }).sort({ date: -1 }).limit(50).select('totalActualRate').lean();
  const rs = hist.map(h => h.totalActualRate).filter(x => x > 0);
  if (rs.length >= 5) {
    const m = rs.reduce((a, b) => a + b, 0) / rs.length;
    const sd = Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / rs.length);
    if (sd > 0 && Math.abs(rate - m) / sd > 3) add('STAT_ANOMALY', 'المعدل ' + r2(rate) + ' منحرف إحصائياً عن متوسط المركب ' + r2(m));
  }

  const rules = Object.keys(hits);
  const score = Math.min(100, rules.reduce((s, k) => s + (WEIGHTS[k] || 0), 0));
  return { rate, rules, score, isFraud: score > FRAUD_THRESHOLD, reason: rules.map(k => hits[k]).join(' | ') };
}

/* ───────── 1. معايير القارب ───────── */
router.get('/standards/:boatId', async (req, res) => {
  try {
    const v = await loadVessel(req, res); if (!v) return;
    res.json({ engineCount: v.engineCount || 1, tankCapacity: v.tankCapacity || 0, standardRate: v.standardRate || 0 });
  } catch (e) { fail(res, e, 'standards'); }
});

/* ───────── 2. حفظ وثيقة جديدة ───────── */
router.post('/documents', csrf, async (req, res) => {
  try {
    if (!canWrite(req)) return res.status(403).json({ error: 'ليس لديك صلاحية التسجيل' });
    const b = req.body || {};
    const v = await findVessel(String(b.boatId || ''));
    if (!v || !allowed(req, v)) return res.status(404).json({ error: 'المركب غير موجود' });
    if (!(v.tankCapacity > 0)) return res.status(400).json({ error: 'المركب غير مهيأ: أدخل سعة الخزان أولاً' });

    const date = new Date(b.date);
    if (isNaN(date) || date.getTime() > Date.now() + 864e5 || date.getTime() < new Date('2000-01-01').getTime())
      return res.status(400).json({ error: 'تاريخ غير صالح' });
    const hrs = n(b.docTotalHours), ltr = n(b.docTotalLiters);
    if (!(hrs > 0 && hrs <= 1e5)) return res.status(400).json({ error: 'إجمالي الساعات غير صالح' });
    if (!(ltr > 0 && ltr <= 1e6)) return res.status(400).json({ error: 'إجمالي الوقود غير صالح' });

    const twin = v.engineCount === 2;
    const right = readEngine(b.engines && b.engines.right);
    const left = twin ? readEngine(b.engines && b.engines.left) : null;
    if (!right) return res.status(400).json({ error: 'بيانات المحرك غير صالحة' });
    if (twin && !left) return res.status(400).json({ error: 'بيانات المحرك الأيسر غير صالحة' });

    const documentNumber = typeof b.documentNumber === 'string' ? b.documentNumber.replace(/[<>]/g, '').trim().slice(0, 40) : '';
    const input = { date, docTotalHours: hrs, docTotalLiters: ltr, documentNumber, engines: { right, left } };
    const a = await runAudit(v, input);

    const doc = await FuelDocument.create({
      boatId: v.id || String(v._id), date, documentNumber,
      docTotalHours: hrs, docTotalLiters: ltr, engineCount: twin ? 2 : 1,
      engines: { right, left }, totalActualRate: r2(a.rate),
      riskScore: a.score, isFraud: a.isFraud, fraudReason: a.reason, violations: a.rules,
      createdBy: req.user.id
    });
    res.status(201).json({ ok: true, id: doc._id, riskScore: a.score, isFraud: a.isFraud, fraudReason: a.reason, violations: a.rules });
  } catch (e) { fail(res, e, 'create'); }
});

/* ───────── 3. جلب وثائق القارب (مع فلتر التاريخ) ───────── */
router.get('/documents/:boatId', async (req, res) => {
  try {
    const v = await loadVessel(req, res); if (!v) return;
    const q = { boatId: { $in: idsOf(v) } };
    const { start, end } = req.query;
    if (start || end) {
      const s = new Date(String(start || '2000-01-01')), e = new Date(String(end || '2100-01-01'));
      if (isNaN(s) || isNaN(e)) return res.status(400).json({ error: 'تاريخ غير صالح' });
      q.date = { $gte: s, $lt: new Date(e.getTime() + 864e5) };
    }
    res.json(await FuelDocument.find(q).sort({ date: -1 }).limit(1000).lean());
  } catch (e) { fail(res, e, 'list'); }
});

/* ───────── 4. تقرير التدقيق ───────── */
router.get('/audit-report/:boatId', async (req, res) => {
  try {
    const v = await loadVessel(req, res); if (!v) return;
    const docs = await FuelDocument.find({ boatId: { $in: idsOf(v) } }).lean();
    let liters = 0, hours = 0, risk = 0, flagged = 0, warned = 0;
    const byRule = {};
    docs.forEach(d => {
      liters += d.docTotalLiters || 0; hours += d.docTotalHours || 0; risk += d.riskScore || 0;
      if (d.isFraud) flagged++; else if ((d.riskScore || 0) >= WARN_THRESHOLD) warned++;
      (d.violations || []).forEach(k => { byRule[k] = (byRule[k] || 0) + 1; });
    });
    const std = Number(v.standardRate) || 0, tank = Number(v.tankCapacity) || 0;
    const t = {
      docs: docs.length, totalHours: r2(hours), avgHours: docs.length ? r2(hours / docs.length) : 0,
      requestedLiters: r2(liters), avgRisk: docs.length ? r2(risk / docs.length) : 0, flagged, warned,
      expectedLiters: null, varianceLiters: null, variancePct: null, excessLiters: null, balanceLiters: null, balancePct: null
    };
    if (std > 0 && docs.length) {
      t.expectedLiters = r2(std * hours);
      t.varianceLiters = r2(liters - t.expectedLiters);
      t.variancePct = t.expectedLiters > 0 ? r2(t.varianceLiters / t.expectedLiters * 100) : null;
      t.excessLiters = Math.max(0, t.varianceLiters);
      if (tank > 0) {
        t.balanceLiters = r2(Math.min(tank, Math.max(0, liters - t.expectedLiters)));
        t.balancePct = r2(t.balanceLiters / tank * 100);
      }
    }
    res.json({ vessel: { id: v.id || String(v._id), name: v.name }, totals: t, byRule });
  } catch (e) { fail(res, e, 'audit-report'); }
});

/* ───────── مركبات الفئة نفسها (مع احترام الإقليم) ───────── */
async function siblingsOf(req, v) {
  if (!v.cat) return [];
  const q = { cat: v.cat, _id: { $ne: v._id }, status: { $ne: 'طرح' } };
  if (!isPrivileged(req) && req.user.region) q.region = req.user.region;
  return Vessel.find(q).select('id name').lean();
}

/* ───────── 5. الاستهلاك المعياري التلقائي ───────── */
router.get('/auto-standard/:boatId', async (req, res) => {
  try {
    const v = await loadVessel(req, res); if (!v) return;
    const sibs = await siblingsOf(req, v);
    const ids = idsOf(v).concat(...sibs.map(s => [s.id, String(s._id)]).map(a => a.filter(Boolean)));
    const docs = await FuelDocument.find({ boatId: { $in: ids }, isFraud: false, riskScore: { $lt: WARN_THRESHOLD }, totalActualRate: { $gt: 0 } })
      .select('totalActualRate').limit(2000).lean();
    let rs = docs.map(d => d.totalActualRate);
    if (rs.length < 5) return res.json({ autoRate: 0, message: 'لا توجد بيانات كافية (يلزم 5 وثائق سليمة على الأقل)' });
    const stat = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return { m, sd: Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) }; };
    let s = stat(rs); const before = rs.length;
    if (s.sd > 0) { rs = rs.filter(x => Math.abs(x - s.m) <= 2 * s.sd); s = stat(rs); }
    res.json({
      autoRate: r2(s.m), category: v.cat || 'المركب نفسه', basedOn: rs.length, excluded: before - rs.length, stdDev: r2(s.sd),
      caution: rs.length < 10 ? 'عينة صغيرة، راجع النتيجة قبل الاعتماد' : ''
    });
  } catch (e) { fail(res, e, 'auto-standard'); }
});

/* ───────── 6. مقارنة مع مركب من نفس الفئة ───────── */
router.get('/compare-vessel/:boatId', async (req, res) => {
  try {
    const v = await loadVessel(req, res); if (!v) return;
    const sibs = await siblingsOf(req, v);
    if (!sibs.length) return res.status(404).json({ success: false, error: 'لا يوجد مركب مشابه' });
    const agg = async ids => {
      const d = await FuelDocument.find({ boatId: { $in: ids } }).select('docTotalHours docTotalLiters').lean();
      const h = d.reduce((x, y) => x + (y.docTotalHours || 0), 0), l = d.reduce((x, y) => x + (y.docTotalLiters || 0), 0);
      return { totalLiters: r2(l), rate: h > 0 ? r2(l / h) : 0, docs: d.length };
    };
    const cur = await agg(idsOf(v));
    let best = null;
    for (const s of sibs.slice(0, 30)) {
      const a = await agg([s.id, String(s._id)].filter(Boolean));
      if (a.docs > 0 && (!best || a.docs > best.docs)) best = Object.assign({ name: s.name }, a);
    }
    if (!best || cur.docs === 0) return res.json({ success: false, reason: 'no_data' });
    res.json({ success: true, current: Object.assign({ name: v.name }, cur), other: best });
  } catch (e) { fail(res, e, 'compare'); }
});

/* ───────── تصدير ───────── */
module.exports = function (app, middlewares) {
  authenticateAccessToken = middlewares.authenticateAccessToken;
  csrfProtection = middlewares.csrfProtection;
  if (typeof middlewares.normalizeRole === 'function') normalizeRole = middlewares.normalizeRole;
  app.use('/api/fuel', authenticateAccessToken, router);
};
