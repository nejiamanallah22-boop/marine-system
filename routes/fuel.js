/**
 * routes/fuel.js v2 — محرك التدقيق لوثائق تموين المحروقات
 * المعطيات: الكمية المطلوبة، ساعات العمل، عدادات المحرك (بداية/نهاية الشهر)،
 *           الباقي بالخزان (لتر)، الباقي بالبطاقة الذكية (دينار → لتر).
 * يتطلب: models/Vessel.js و models/FuelDocument.js
 */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Vessel = require('../models/Vessel');
const FuelDocument = require('../models/FuelDocument');

let authenticateAccessToken, csrfProtection, normalizeRole = r => String(r || '');
const csrf = (req, res, next) => csrfProtection(req, res, next);

// سعر اللتر (دينار تونسي) — يمكن تغييره عبر متغير البيئة FUEL_PRICE_DT
const FUEL_PRICE = Number(process.env.FUEL_PRICE_DT) > 0 ? Number(process.env.FUEL_PRICE_DT) : 1.998;

const WRITE_ROLES = ['admin', 'manager', 'editor', 'maintenance_unit'];
const PRIVILEGED = ['admin', 'manager'];
const FRAUD_THRESHOLD = 60;
const WARN_THRESHOLD = 30;

// وزن كل قاعدة في درجة الخطر (الحد الأقصى 100)
const WEIGHTS = {
  METER_ROLLBACK: 70, TANK_OVERFLOW: 70, PHANTOM_TRIP: 65, TANK_BALANCE: 55,
  CARD_INSUFFICIENT: 50, RATE_INFLATED: 45, DOUBLE_DIP: 45, VOLUME_INFLATION: 40,
  HOURS_MISMATCH: 35, CONSUMPTION_GAP: 35, STAT_ANOMALY: 25, METER_GAP: 20
};

/* ───────── أدوات ───────── */
const n = v => { const x = Number(v); return Number.isFinite(x) ? x : NaN; };
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
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

// قراءة عدّاد محرك: بداية/نهاية الشهر → الساعات المحتسبة
function readEngine(e, label) {
  const tag = label ? ' المحرك ' + label : ' المحرك';
  if (!e || typeof e !== 'object') return { err: 'بيانات' + tag + ' ناقصة' };
  const s = n(e.startHours), t = n(e.endHours);
  if (!(s >= 0 && s <= 1e7)) return { err: 'عداد بداية' + tag + ' غير صالح' };
  if (!(t >= 0 && t <= 1e7)) return { err: 'عداد نهاية' + tag + ' غير صالح' };
  if (t < s) return { err: 'عداد نهاية' + tag + ' أقل من البداية' };
  return { startHours: r2(s), endHours: r2(t), usedHours: r2(t - s) };
}
const startOf = e => (e && e.startHours != null ? e.startHours : null);
const endOf = e => (e ? (e.endHours != null ? e.endHours : (e.totalHours > 0 ? e.totalHours : null)) : null);

/* ───────── محرك التدقيق ───────── */
async function runAudit(vessel, d) {
  const hits = {};
  const add = (rule, msg) => { hits[rule] = hits[rule] ? hits[rule] + ' ؛ ' + msg : msg; };
  const ids = idsOf(vessel);
  const std = Number(vessel.standardRate) || 0;
  const tank = Number(vessel.tankCapacity) || 0;
  const L = d.docTotalLiters, H = d.docTotalHours, T = d.remainingTank, C = d.cardDinars, price = d.price;
  const rate = H > 0 ? L / H : 0;
  const cardL = price > 0 ? C / price : 0;

  // 1) ساعات العمل مقابل عدّادات المحرك (الأعلى بين المحركين)
  const used = [d.engines.right, d.engines.left].filter(Boolean).map(e => e.usedHours);
  const maxUsed = used.length ? Math.max(...used) : 0;
  if (Math.abs(maxUsed - H) > 0.5) add('HOURS_MISMATCH', 'ساعات العمل (' + H + ') لا تطابق ساعات العدّاد (' + maxUsed + ')');

  // 2) الخزان: الباقي + المطلوب لا يتجاوز السعة
  if (tank > 0 && T + L > tank + 1) add('TANK_OVERFLOW', 'الباقي (' + T + ') + المطلوب (' + L + ') = ' + r2(T + L) + ' لتر يتجاوز سعة الخزان (' + tank + ')');

  // 3) البطاقة الذكية: كلفة المطلوب لا تتجاوز الرصيد
  if (L * price > C + price) add('CARD_INSUFFICIENT', 'كلفة ' + L + ' لتر = ' + r3(L * price) + ' د.ت تتجاوز رصيد البطاقة ' + r3(C) + ' د.ت (= ' + r2(cardL) + ' لتر)');

  // 4) معدل الاستهلاك مقابل المعيار + تضخم الكمية
  if (std > 0 && rate >= std * 1.15) add('RATE_INFLATED', 'المعدل ' + r2(rate) + ' يتجاوز المعيار ' + std + ' بـ 15% أو أكثر');
  if (tank > 0 && L >= 0.9 * tank && H < 10) add('VOLUME_INFLATION', 'تعبئة ≥ 90% من الخزان مقابل أقل من 10 ساعات');

  // 5) فترات التوقف
  const t = d.date.getTime();
  if ((vessel.inactivePeriods || []).some(p => p.from && t >= new Date(p.from).getTime() && (!p.to || t <= new Date(p.to).getTime())))
    add('PHANTOM_TRIP', 'الوثيقة داخل فترة توقف مسجلة للمركب');

  // 6) الوثيقة السابقة واللاحقة: اتصال العدّاد + رصيد الخزان
  const [prev, next] = await Promise.all([
    FuelDocument.findOne({ boatId: { $in: ids }, date: { $lt: d.date } }).sort({ date: -1 }).lean(),
    FuelDocument.findOne({ boatId: { $in: ids }, date: { $gt: d.date } }).sort({ date: 1 }).lean()
  ]);
  [['right', 'الأيمن'], ['left', 'الأيسر']].forEach(([side, label]) => {
    const cur = d.engines[side]; if (!cur) return;
    const pEnd = endOf(prev && prev.engines && prev.engines[side]);
    const qStart = startOf(next && next.engines && next.engines[side]);
    const tagE = d.engines.left ? ' (' + label + ')' : '';
    if (pEnd != null) {
      if (cur.startHours < pEnd - 0.5) add('METER_ROLLBACK', 'بداية العداد' + tagE + ' ' + cur.startHours + ' أقل من نهاية الوثيقة السابقة ' + pEnd);
      else if (cur.startHours > pEnd + 0.5) add('METER_GAP', r2(cur.startHours - pEnd) + ' ساعة غير موثقة منذ الوثيقة السابقة' + tagE);
    }
    if (qStart != null && cur.endHours > qStart + 0.5) add('METER_ROLLBACK', 'نهاية العداد' + tagE + ' ' + cur.endHours + ' أكبر من بداية الوثيقة اللاحقة ' + qStart);
  });

  let consumed = null;
  if (prev && prev.remainingTank != null) {
    let afterPrev = prev.remainingTank + (prev.docTotalLiters || 0);
    if (tank > 0) afterPrev = Math.min(afterPrev, tank);
    consumed = r2(afterPrev - T);
    if (consumed < -1) add('TANK_BALANCE', 'الباقي بالخزان (' + T + ') أكبر مما يسمح به رصيد الوثيقة السابقة (' + r2(afterPrev) + ')');
    else if (std > 0 && H > 0 && consumed > std * H * 1.25)
      add('CONSUMPTION_GAP', 'الاستهلاك المحسوب من الخزان (' + consumed + ' لتر) يتجاوز المتوقع (' + r2(std * H) + ') بأكثر من 25%');
  }

  // 7) تموين مكرر: نفس اليوم أو نفس رقم الوثيقة
  const dayEnd = new Date(t + 864e5);
  const dupQ = [{ date: { $gte: d.date, $lt: dayEnd } }];
  if (d.documentNumber) dupQ.push({ documentNumber: d.documentNumber });
  if (await FuelDocument.exists({ boatId: { $in: ids }, $or: dupQ })) add('DOUBLE_DIP', 'وثيقة أخرى بنفس التاريخ أو الرقم لهذا المركب');

  // 8) انحراف إحصائي عن سجل المركب
  const hist = await FuelDocument.find({ boatId: { $in: ids }, isFraud: false }).sort({ date: -1 }).limit(50).select('totalActualRate').lean();
  const rs = hist.map(h => h.totalActualRate).filter(x => x > 0);
  if (rs.length >= 5) {
    const m = rs.reduce((a, b) => a + b, 0) / rs.length;
    const sd = Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / rs.length);
    if (sd > 0 && Math.abs(rate - m) / sd > 3) add('STAT_ANOMALY', 'المعدل ' + r2(rate) + ' منحرف إحصائياً عن متوسط المركب ' + r2(m));
  }

  const rules = Object.keys(hits);
  const score = Math.min(100, rules.reduce((s, k) => s + (WEIGHTS[k] || 0), 0));
  return { rate, rules, score, consumed, cardL, isFraud: score > FRAUD_THRESHOLD, reason: rules.map(k => hits[k]).join(' | ') };
}

/* ───────── 1. معايير القارب ───────── */
router.get('/standards/:boatId', async (req, res) => {
  try {
    const v = await loadVessel(req, res); if (!v) return;
    res.json({ engineCount: v.engineCount || 1, tankCapacity: v.tankCapacity || 0, standardRate: v.standardRate || 0, fuelPrice: FUEL_PRICE });
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
    const L = n(b.docTotalLiters), H = n(b.docTotalHours), T = n(b.remainingTank), C = n(b.cardDinars);
    if (!(L > 0 && L <= 1e6)) return res.status(400).json({ error: 'الكمية المطلوبة غير صالحة' });
    if (!(H > 0 && H <= 1e5)) return res.status(400).json({ error: 'ساعات العمل غير صالحة' });
    if (!(T >= 0 && T <= v.tankCapacity)) return res.status(400).json({ error: 'الباقي بالخزان غير صالح (من 0 إلى سعة الخزان)' });
    if (!(C >= 0 && C <= 1e7)) return res.status(400).json({ error: 'رصيد البطاقة غير صالح' });

    const twin = v.engineCount === 2;
    const right = readEngine(b.engines && b.engines.right, twin ? 'الأيمن' : '');
    if (right.err) return res.status(400).json({ error: right.err });
    let left = null;
    if (twin) { left = readEngine(b.engines && b.engines.left, 'الأيسر'); if (left.err) return res.status(400).json({ error: left.err }); }

    const documentNumber = typeof b.documentNumber === 'string' ? b.documentNumber.replace(/[<>]/g, '').trim().slice(0, 40) : '';
    const input = { date, docTotalHours: H, docTotalLiters: L, remainingTank: T, cardDinars: C, price: FUEL_PRICE, documentNumber, engines: { right, left } };
    const a = await runAudit(v, input);

    const doc = await FuelDocument.create({
      boatId: v.id || String(v._id), date, documentNumber,
      docTotalLiters: L, docTotalHours: H, remainingTank: r2(T), cardDinars: r3(C),
      cardLiters: r2(a.cardL), fuelPrice: FUEL_PRICE, tankAfter: r2(T + L),
      engineCount: twin ? 2 : 1, engines: { right, left },
      totalActualRate: r2(a.rate), actualConsumption: a.consumed,
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
      expectedLiters: null, varianceLiters: null, variancePct: null, excessLiters: null,
      balanceLiters: null, balancePct: null,
      lastRemainingTank: null, cardDinars: null, cardLiters: null, fuelPrice: FUEL_PRICE
    };
    if (std > 0 && docs.length) {
      t.expectedLiters = r2(std * hours);
      t.varianceLiters = r2(liters - t.expectedLiters);
      t.variancePct = t.expectedLiters > 0 ? r2(t.varianceLiters / t.expectedLiters * 100) : null;
      t.excessLiters = Math.max(0, t.varianceLiters);
    }
    // أحدث وثيقة: الرصيد الفعلي للخزان والبطاقة
    const latest = docs.slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    if (latest) {
      t.lastRemainingTank = latest.remainingTank != null ? latest.remainingTank : null;
      t.cardDinars = latest.cardDinars != null ? latest.cardDinars : null;
      t.cardLiters = latest.cardLiters != null ? latest.cardLiters : null;
    }
    if (tank > 0) {
      if (latest && latest.tankAfter != null) t.balanceLiters = r2(Math.min(tank, latest.tankAfter));
      else if (t.expectedLiters != null) t.balanceLiters = r2(Math.min(tank, Math.max(0, liters - t.expectedLiters)));
      if (t.balanceLiters != null) t.balancePct = r2(t.balanceLiters / tank * 100);
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
    const ids = idsOf(v).concat(...sibs.map(s => [s.id, String(s._id)].filter(Boolean)));
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
module.exports._test = { runAudit, readEngine, FUEL_PRICE };
