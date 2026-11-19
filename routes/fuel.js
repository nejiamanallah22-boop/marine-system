/**
 * routes/fuel.js v6 — محرك التدقيق لوثائق تموين المحروقات
 * - المعيار: لا يُعتمد إلا بعد 3 وثائق سليمة (وسيط Median لمقاومة الشواذ).
 * - أي وثيقة تتجاوز المعيار المعتمد تُصنَّف كـ"سرقة/تلاعب" (RATE_THEFT).
 * - تعديل وحذف الوثائق مع سجل تغييرات وإعادة تدقيق.
 */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Vessel = require('../models/Vessel');
const FuelDocument = require('../models/FuelDocument');

let authenticateAccessToken, csrfProtection, normalizeRole = r => String(r || '');
let addLog = async () => {};
const csrf = (req, res, next) => csrfProtection(req, res, next);

// أسعار المحروقات الثابتة حسب النوع (دينار تونسي)
const PRICES = { gasoil: 1.998, benzine: 2.525 };

// الحد الأقصى المنطقي للمعدل (لتجاهل البيانات الخاطئة القديمة)
const MAX_SENSIBLE_RATE = 35;

const WRITE_ROLES = ['admin', 'manager', 'editor', 'maintenance_unit'];
const DELETE_ROLES = ['admin', 'manager'];
const PRIVILEGED = ['admin', 'manager'];
const FRAUD_THRESHOLD = 60;
const WARN_THRESHOLD = 30;

// ✅ التغيير 1: رفع الحد الأدنى لاعتماد المعيار إلى 3 وثائق سليمة
const LEARN_MIN_OWN = 3;        // كان 2 → أصبح 3
const LEARN_MIN_CATEGORY = 3;   // يبقى 3 للفئة

// ✅ التغيير 2: إضافة قاعدة "سرقة" بوزن مرتفع
const WEIGHTS = {
  METER_ROLLBACK: 70, TANK_OVERFLOW: 70, PHANTOM_TRIP: 65, TANK_BALANCE: 55,
  CARD_INSUFFICIENT: 50, RATE_THEFT: 70, RATE_INFLATED: 45, DOUBLE_DIP: 45,
  VOLUME_INFLATION: 40, HOURS_MISMATCH: 35, CONSUMPTION_GAP: 35, STAT_ANOMALY: 25, METER_GAP: 20
};

const n = v => { const x = Number(v); return Number.isFinite(x) ? x : NaN; };
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const roleOf = req => normalizeRole(req.user && req.user.role);
const isPrivileged = req => PRIVILEGED.includes(roleOf(req));
const canWrite = req => WRITE_ROLES.includes(roleOf(req));
const canDelete = req => DELETE_ROLES.includes(roleOf(req));
const validId = s => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(s);
const isOid = s => typeof s === 'string' && /^[a-f0-9]{24}$/i.test(s);
const fail = (res, err, where) => { console.error('❌ [FUEL] ' + where + ':', err && err.message); res.status(500).json({ error: 'خطأ في الخادم' }); };

async function findVessel(boatId) {
  if (!validId(boatId)) return null;
  const q = isOid(boatId) && mongoose.Types.ObjectId.isValid(boatId)
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

async function siblingsOf(req, v) {
  if (!v.cat) return [];
  const q = { cat: v.cat, _id: { $ne: v._id }, status: { $ne: 'طرح' } };
  if (req && !isPrivileged(req) && req.user.region) q.region = req.user.region;
  return Vessel.find(q).select('id name').lean();
}

async function cleanRates(ids, excludeId) {
  const q = {
    boatId: { $in: ids },
    isFraud: false,
    riskScore: { $lt: WARN_THRESHOLD },
    totalActualRate: { $gt: 0, $lt: MAX_SENSIBLE_RATE }
  };
  if (excludeId) q._id = { $ne: excludeId };
  const docs = await FuelDocument.find(q).select('totalActualRate').limit(500).lean();
  return docs.map(d => d.totalActualRate);
}

/**
 * ✅ التغيير 3: إرجاع حالة "learning" صريحة عندما تكون الوثائق < 3
 * حتى تعرض الواجهة "قيد التعلّم — X / 3".
 */
async function effectiveStandard(v, req, excludeId) {
  const manual = Number(v.standardRate) || 0;
  if (manual > 0 && manual < MAX_SENSIBLE_RATE)
    return { rate: manual, source: 'manual', basedOn: 0, minRequired: LEARN_MIN_OWN };

  const own = await cleanRates(idsOf(v), excludeId);
  if (own.length >= LEARN_MIN_OWN) {
    // ✅ الوسيط (Median) أكثر مقاومة للشواذ من المتوسط
    return { rate: r2(median(own)), source: 'learned', basedOn: own.length, minRequired: LEARN_MIN_OWN };
  }

  const sibs = await siblingsOf(req, v);
  if (sibs.length) {
    const rs = await cleanRates([].concat(...sibs.map(s => [s.id, String(s._id)].filter(Boolean))), excludeId);
    if (rs.length >= LEARN_MIN_CATEGORY)
      return { rate: r2(median(rs)), source: 'category', basedOn: rs.length, minRequired: LEARN_MIN_CATEGORY };
  }

  // ✅ لا معيار معتمد بعد — الواجهة ستعرض "قيد التعلّم"
  return { rate: 0, source: 'learning', basedOn: own.length, minRequired: LEARN_MIN_OWN };
}

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

function parseDoc(b, v) {
  const date = new Date(b.date);
  if (isNaN(date) || date.getTime() > Date.now() + 864e5 || date.getTime() < new Date('2000-01-01').getTime()) return { err: 'تاريخ غير صالح' };

  const fuelType = b.fuelType === 'benzine' ? 'benzine' : 'gasoil';
  const price = PRICES[fuelType];

  const Q = n(b.quota);
  if (!(Q >= 0 && Q <= 1e6)) return { err: 'المقرر غير صالح' };

  const L = n(b.docTotalLiters), H = n(b.docTotalHours), T = n(b.remainingTank), C = n(b.cardDinars);
  const Actual = n(b.actualConsumedLiters);

  if (!(L > 0 && L <= 1e6)) return { err: 'الكمية المطلوبة غير صالحة' };
  if (!(Actual > 0 && Actual <= 1e6)) return { err: 'الكمية المستهلكة غير صالحة ويجب أن تكون أكبر من صفر' };
  if (!(H > 0 && H <= 1e5)) return { err: 'ساعات العمل غير صالحة' };
  if (!(T >= 0 && T <= v.tankCapacity)) return { err: 'الباقي بالخزان غير صالح (من 0 إلى سعة الخزان)' };
  if (!(C >= 0 && C <= 1e7)) return { err: 'رصيد البطاقة غير صالح' };

  const twin = v.engineCount === 2;
  const right = readEngine(b.engines && b.engines.right, twin ? 'الأيمن' : '');
  if (right.err) return { err: right.err };

  let left = null;
  if (twin) { left = readEngine(b.engines && b.engines.left, 'الأيسر'); if (left.err) return { err: left.err }; }

  const documentNumber = typeof b.documentNumber === 'string' ? b.documentNumber.replace(/[<>]/g, '').trim().slice(0, 40) : '';

  return { input: { date, fuelType, quota: Q, actualConsumedLiters: Actual, docTotalHours: H, docTotalLiters: L, remainingTank: T, cardDinars: C, price, documentNumber, engines: { right, left }, twin } };
}

const docFields = (d, a) => ({
  date: d.date, documentNumber: d.documentNumber,
  fuelType: d.fuelType, quota: d.quota, actualConsumedLiters: d.actualConsumedLiters,
  docTotalLiters: d.docTotalLiters, docTotalHours: d.docTotalHours,
  remainingTank: r2(d.remainingTank), cardDinars: r3(d.cardDinars),
  cardLiters: r2(a.cardL), fuelPrice: d.price, tankAfter: r2(d.remainingTank + d.docTotalLiters),
  engineCount: d.twin ? 2 : 1, engines: { right: d.engines.right, left: d.engines.left },
  totalActualRate: r2(a.rate), actualConsumption: a.consumed,
  riskScore: a.score, isFraud: a.isFraud, fraudReason: a.reason, violations: a.rules
});

async function runAudit(vessel, d, opts = {}) {
  const hits = {};
  const add = (rule, msg) => { hits[rule] = hits[rule] ? hits[rule] + ' ؛ ' + msg : msg; };
  const ids = idsOf(vessel);
  const base = { boatId: { $in: ids } };
  if (opts.excludeId) base._id = { $ne: opts.excludeId };
  const std = Number(opts.std) || 0;
  const tank = Number(vessel.tankCapacity) || 0;

  const L = d.docTotalLiters, Actual = d.actualConsumedLiters, H = d.docTotalHours, T = d.remainingTank, C = d.cardDinars, price = d.price;
  const rate = H > 0 ? Actual / H : 0;
  const cardL = price > 0 ? C / price : 0;

  const used = [d.engines.right, d.engines.left].filter(Boolean).map(e => e.usedHours);
  const maxUsed = used.length ? Math.max(...used) : 0;
  if (Math.abs(maxUsed - H) > 0.5) add('HOURS_MISMATCH', 'ساعات العمل (' + H + ') لا تطابق ساعات العدّاد (' + maxUsed + ')');

  if (tank > 0 && T + L > tank + 1) add('TANK_OVERFLOW', 'الباقي (' + T + ') + المطلوب (' + L + ') = ' + r2(T + L) + ' لتر يتجاوز سعة الخزان (' + tank + ')');

  if (L * price > C + price) add('CARD_INSUFFICIENT', 'كلفة ' + L + ' لتر = ' + r3(L * price) + ' د.ت تتجاوز رصيد البطاقة ' + r3(C) + ' د.ت (= ' + r2(cardL) + ' لتر)');

  // ✅ التغيير 4: أي تجاوز للمعيار المعتمد = سرقة (وليس فقط 115%)
  if (std > 0 && rate > std * 1.001) {
    const excessRate = rate - std;
    const excessLiters = r2(excessRate * H);
    const pct = r2((rate / std - 1) * 100);
    add('RATE_THEFT',
      '🚨 سرقة: المعدل ' + r2(rate) + ' لتر/س يتجاوز المعيار المعتمد ' + std +
      ' بنسبة ' + pct + '% — وقود مُبالغ فيه ≈ ' + excessLiters + ' لتر');
  } else if (std > 0 && rate >= std * 1.15) {
    // احتياطي: إذا كان المعيار غير معتمد بعد، نُبقي التحذير القديم
    add('RATE_INFLATED', 'المعدل ' + r2(rate) + ' يتجاوز المعيار ' + std + ' بـ 15% أو أكثر');
  }

  if (tank > 0 && L >= 0.9 * tank && H < 10) add('VOLUME_INFLATION', 'تعبئة ≥ 90% من الخزان مقابل أقل من 10 ساعات');

  const t = d.date.getTime();
  if ((vessel.inactivePeriods || []).some(p => p.from && t >= new Date(p.from).getTime() && (!p.to || t <= new Date(p.to).getTime())))
    add('PHANTOM_TRIP', 'الوثيقة داخل فترة توقف مسجلة للمركب');

  const [prev, next] = await Promise.all([
    FuelDocument.findOne(Object.assign({}, base, { date: { $lt: d.date } })).sort({ date: -1 }).lean(),
    FuelDocument.findOne(Object.assign({}, base, { date: { $gt: d.date } })).sort({ date: 1 }).lean()
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

  const dupQ = [{ date: { $gte: d.date, $lt: new Date(t + 864e5) } }];
  if (d.documentNumber) dupQ.push({ documentNumber: d.documentNumber });
  if (await FuelDocument.exists(Object.assign({}, base, { $or: dupQ }))) add('DOUBLE_DIP', 'وثيقة أخرى بنفس التاريخ أو الرقم لهذا المركب');

  const hist = await FuelDocument.find(Object.assign({}, base, { isFraud: false })).sort({ date: -1 }).limit(50).select('totalActualRate').lean();
  const rs = hist.map(h => h.totalActualRate).filter(x => x > 0 && x < MAX_SENSIBLE_RATE);
  if (rs.length >= 5) {
    const m = rs.reduce((a, b) => a + b, 0) / rs.length;
    const sd = Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / rs.length);
    if (sd > 0 && Math.abs(rate - m) / sd > 3) add('STAT_ANOMALY', 'المعدل ' + r2(rate) + ' منحرف إحصائياً عن متوسط المركب ' + r2(m));
  }

  const rules = Object.keys(hits);
  const score = Math.min(100, rules.reduce((s, k) => s + (WEIGHTS[k] || 0), 0));
  return { rate, rules, score, consumed, cardL, isFraud: score > FRAUD_THRESHOLD, reason: rules.map(k => hits[k]).join(' | ') };
}

async function reauditFrom(v, req, fromDate) {
  try {
    const std = await effectiveStandard(v, req);
    const docs = await FuelDocument.find({ boatId: { $in: idsOf(v) }, date: { $gte: fromDate } }).sort({ date: 1 }).limit(200).lean();
    for (const d of docs) {
      const e = d.engines || {};
      if (d.remainingTank == null || d.cardDinars == null || !e.right || e.right.startHours == null) continue;
      const input = { date: new Date(d.date), fuelType: d.fuelType || 'gasoil', quota: d.quota || 0, actualConsumedLiters: d.actualConsumedLiters || d.docTotalLiters,
        docTotalHours: d.docTotalHours, docTotalLiters: d.docTotalLiters, remainingTank: d.remainingTank,
        cardDinars: d.cardDinars, price: d.fuelPrice || PRICES[d.fuelType || 'gasoil'], documentNumber: d.documentNumber || '', engines: { right: e.right, left: e.left || null } };
      const a = await runAudit(v, input, { std: std.rate, excludeId: d._id });
      await FuelDocument.updateOne({ _id: d._id }, { $set: { riskScore: a.score, isFraud: a.isFraud, fraudReason: a.reason, violations: a.rules, actualConsumption: a.consumed, totalActualRate: r2(a.rate) } });
    }
  } catch (e) { console.error('❌ [FUEL] reaudit:', e.message); }
}

async function getDoc(req, res) {
  const id = req.params.docId;
  if (!isOid(id)) { res.status(400).json({ error: 'معرّف غير صالح' }); return null; }
  const doc = await FuelDocument.findOne({ _id: id }).lean();
  const v = doc && await findVessel(doc.boatId);
  if (!doc || !v || !allowed(req, v)) { res.status(404).json({ error: 'الوثيقة غير موجودة' }); return null; }
  return { doc, v };
}
const snapshot = d => ({ date: d.date, documentNumber: d.documentNumber, fuelType: d.fuelType, quota: d.quota, actualConsumedLiters: d.actualConsumedLiters, docTotalLiters: d.docTotalLiters, docTotalHours: d.docTotalHours,
  remainingTank: d.remainingTank, cardDinars: d.cardDinars, engines: d.engines, riskScore: d.riskScore, isFraud: d.isFraud });
const logDoc = (req, action, v, d, details) => addLog({
  userId: req.user.id, userName: req.user.name, action, resource: 'fuel-document',
  resourceId: String(d._id), resourceName: v.name + ' — ' + new Date(d.date).toISOString().slice(0, 10),
  status: 'success', ip: req.ip, requestId: req.requestId, details
});

router.get('/standards/:boatId', async (req, res) => {
  try {
    const v = await loadVessel(req, res); if (!v) return;
    const sd = await effectiveStandard(v, req);
    res.json({
      engineCount: v.engineCount || 1, tankCapacity: v.tankCapacity || 0,
      standardRate: sd.rate,
      standardSource: sd.source,        // ✅ manual | learned | category | learning
      standardBasedOn: sd.basedOn,      // ✅ عدد الوثائق السليمة
      standardMinRequired: sd.minRequired, // ✅ الحد الأدنى المطلوب (3)
      manualRate: Number(v.standardRate) || 0, fuelPrice: PRICES.gasoil
    });
  } catch (e) { fail(res, e, 'standards'); }
});

router.post('/documents', csrf, async (req, res) => {
  try {
    if (!canWrite(req)) return res.status(403).json({ error: 'ليس لديك صلاحية التسجيل' });
    const b = req.body || {};
    const v = await findVessel(String(b.boatId || ''));
    if (!v || !allowed(req, v)) return res.status(404).json({ error: 'المركب غير موجود' });
    if (!(v.tankCapacity > 0)) return res.status(400).json({ error: 'المركب غير مهيأ: أدخل سعة الخزان أولاً' });
    const p = parseDoc(b, v); if (p.err) return res.status(400).json({ error: p.err });

    const sd = await effectiveStandard(v, req);
    const a = await runAudit(v, p.input, { std: sd.rate });
    const doc = await FuelDocument.create(Object.assign({ boatId: v.id || String(v._id), createdBy: req.user.id }, docFields(p.input, a)));

    // ✅ التغيير 5: إرجاع معلومات المعيار للواجهة
    res.status(201).json({
      ok: true, id: doc._id, riskScore: a.score, isFraud: a.isFraud,
      fraudReason: a.reason, violations: a.rules,
      standardRate: sd.rate, standardSource: sd.source, standardBasedOn: sd.basedOn
    });
  } catch (e) { fail(res, e, 'create'); }
});

router.put('/documents/:docId', csrf, async (req, res) => {
  try {
    if (!canWrite(req)) return res.status(403).json({ error: 'ليس لديك صلاحية التعديل' });
    const found = await getDoc(req, res); if (!found) return;
    const { doc, v } = found;
    const p = parseDoc(req.body || {}, v); if (p.err) return res.status(400).json({ error: p.err });

    const sd = await effectiveStandard(v, req, doc._id);
    const a = await runAudit(v, p.input, { std: sd.rate, excludeId: doc._id });
    const before = snapshot(doc);
    await FuelDocument.updateOne({ _id: doc._id }, {
      $set: Object.assign(docFields(p.input, a), { editedAt: new Date(), editedBy: req.user.id }),
      $inc: { editCount: 1 },
      $push: { history: { $each: [{ at: new Date(), by: req.user.id, byName: req.user.name || req.user.username || '', before }], $slice: -20 } }
    });
    await reauditFrom(v, req, new Date(Math.min(new Date(doc.date).getTime(), p.input.date.getTime())));
    await logDoc(req, 'update', v, doc, { before, after: snapshot(Object.assign({}, p.input, { riskScore: a.score, isFraud: a.isFraud })) });
    res.json({ ok: true, riskScore: a.score, isFraud: a.isFraud, fraudReason: a.reason, violations: a.rules,
      standardRate: sd.rate, standardSource: sd.source, standardBasedOn: sd.basedOn });
  } catch (e) { fail(res, e, 'update'); }
});

router.delete('/documents/:docId', csrf, async (req, res) => {
  try {
    if (!canDelete(req)) return res.status(403).json({ error: 'الحذف للمسؤول والمدير فقط' });
    const found = await getDoc(req, res); if (!found) return;
    const { doc, v } = found;
    await FuelDocument.deleteOne({ _id: doc._id });
    await reauditFrom(v, req, new Date(doc.date));
    await logDoc(req, 'delete', v, doc, { deleted: snapshot(doc) });
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'delete'); }
});

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
    res.json(await FuelDocument.find(q).select('-history').sort({ date: -1 }).limit(1000).lean());
  } catch (e) { fail(res, e, 'list'); }
});

router.get('/audit-report/:boatId', async (req, res) => {
  try {
    const v = await loadVessel(req, res); if (!v) return;
    const docs = await FuelDocument.find({ boatId: { $in: idsOf(v) } }).select('-history').lean();
    let liters = 0, hours = 0, risk = 0, flagged = 0, warned = 0;
    const byRule = {};
    docs.forEach(d => {
      liters += d.docTotalLiters || 0; hours += d.docTotalHours || 0; risk += d.riskScore || 0;
      if (d.isFraud) flagged++; else if ((d.riskScore || 0) >= WARN_THRESHOLD) warned++;
      (d.violations || []).forEach(k => { byRule[k] = (byRule[k] || 0) + 1; });
    });
    const sd = await effectiveStandard(v, req);
    const std = sd.rate, tank = Number(v.tankCapacity) || 0;
    const t = {
      docs: docs.length, totalHours: r2(hours), avgHours: docs.length ? r2(hours / docs.length) : 0,
      requestedLiters: r2(liters), avgRisk: docs.length ? r2(risk / docs.length) : 0, flagged, warned,
      expectedLiters: null, varianceLiters: null, variancePct: null, excessLiters: null,
      balanceLiters: null, balancePct: null,
      lastRemainingTank: null, cardDinars: null, cardLiters: null, fuelPrice: PRICES.gasoil,
      // ✅ التغيير 6: إرجاع minRequired و source بدقة
      standard: { rate: std, source: sd.source, basedOn: sd.basedOn, minRequired: sd.minRequired }
    };
    if (std > 0 && docs.length) {
      t.expectedLiters = r2(std * hours);
      t.varianceLiters = r2(liters - t.expectedLiters);
      t.variancePct = t.expectedLiters > 0 ? r2(t.varianceLiters / t.expectedLiters * 100) : null;
      t.excessLiters = Math.max(0, t.varianceLiters);
    }
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

router.get('/auto-standard/:boatId', async (req, res) => {
  try {
    const v = await loadVessel(req, res); if (!v) return;
    const sibs = await siblingsOf(req, v);
    const ids = idsOf(v).concat(...sibs.map(s => [s.id, String(s._id)].filter(Boolean)));
    let rs = await cleanRates(ids);
    // ✅ التغيير 7: رفع الحد الأدنى إلى 3 للاعتماد اليدوي أيضاً
    if (rs.length < 3) return res.json({ autoRate: 0, message: 'لا توجد بيانات كافية (يلزم 3 وثائق سليمة على الأقل)' });
    const stat = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return { m, sd: Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) }; };
    let s = stat(rs); const before = rs.length;
    if (s.sd > 0) { rs = rs.filter(x => Math.abs(x - s.m) <= 2 * s.sd); s = stat(rs); }
    res.json({ autoRate: r2(s.m), category: v.cat || 'المركب نفسه', basedOn: rs.length, excluded: before - rs.length, stdDev: r2(s.sd),
      caution: rs.length < 5 ? 'عينة صغيرة، راجع النتيجة قبل الاعتماد' : '' });
  } catch (e) { fail(res, e, 'auto-standard'); }
});

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

module.exports = function (app, middlewares) {
  authenticateAccessToken = middlewares.authenticateAccessToken;
  csrfProtection = middlewares.csrfProtection;
  if (typeof middlewares.normalizeRole === 'function') normalizeRole = middlewares.normalizeRole;
  if (typeof middlewares.addSystemLog === 'function') addLog = middlewares.addSystemLog;
  app.use('/api/fuel', authenticateAccessToken, router);
};
module.exports._test = { runAudit, readEngine, parseDoc, effectiveStandard, PRICES };
