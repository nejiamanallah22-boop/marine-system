/**
 * routes/fuel.js — محرك التدقيق لوثائق تموين المحروقات
 * - عدد المحركات (1 أو 2) يُحدَّد لكل وثيقة من الواجهة
 * - حساب الحقول المشتقة (ساعات كل محرك، رصيد البطاقة باللتر، الخزان بعد التعبئة)
 * - قواعد التدقيق → riskScore / isFraud / violations / fraudReason
 * - تقرير التدقيق يعتمد على بيانات حقيقية
 */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Vessel = require('../models/Vessel');
const FuelDocument = require('../models/FuelDocument');

// الميدلوير سيُمرَّر من server.js
let authenticateAccessToken, csrfProtection;

const WEEKEND_DAYS = [5, 6]; // 0=الأحد … 6=السبت
const DEFAULT_PRICE = 1.998;

/* ───────── أدوات ───────── */
const num = (v) => (v === '' || v == null ? NaN : Number(v));
const r3 = (x) => Math.round(x * 1000) / 1000;
const actor = (req) => {
  const u = (req && req.user) || {};
  return { id: String(u.id || u._id || u.userId || ''), name: String(u.name || u.username || u.fullName || '') };
};

// البحث عن القارب (يقبل id أو _id)
async function findVessel(boatId) {
  boatId = String(boatId);
  let query = { id: boatId };
  if (mongoose.Types.ObjectId.isValid(boatId)) query = { $or: [{ id: boatId }, { _id: boatId }] };
  return await Vessel.findOne(query).lean();
}
const vesselKeys = (v) => [v.id, v._id && v._id.toString()].filter(Boolean).map(String);
const vesselKey = (v) => String(v.id || v._id);
const priceOf = (v) => (Number(v.fuelPrice) > 0 ? Number(v.fuelPrice) : DEFAULT_PRICE);

/* ───────── التحقق من المدخلات ───────── */
function meter(m, label) {
  const name = 'المحرك' + (label ? ' ' + label : '');
  if (!m || typeof m !== 'object') return { error: 'أدخل عدادات ' + name };
  const s = num(m.startHours), e = num(m.endHours);
  if (!Number.isFinite(s) || s < 0) return { error: 'عداد بداية ' + name + ' غير صالح' };
  if (!Number.isFinite(e) || e < 0) return { error: 'عداد نهاية ' + name + ' غير صالح' };
  if (e < s) return { error: 'عداد نهاية ' + name + ' أقل من البداية' };
  return { startHours: s, endHours: e, usedHours: r3(e - s) };
}

function parseBody(b, vessel) {
  b = b || {};
  const date = new Date(b.date);
  if (!b.date || isNaN(date)) return { error: 'تاريخ الوثيقة غير صالح' };

  const L = num(b.docTotalLiters), H = num(b.docTotalHours);
  if (!(L > 0)) return { error: 'كمية المحروقات المستعملة يجب أن تكون أكبر من صفر' };
  if (!(H > 0)) return { error: 'ساعات العمل يجب أن تكون أكبر من صفر' };

  const T = num(b.remainingTank), C = num(b.cardDinars);
  const cap = Number(vessel.tankCapacity) || 0;
  if (!(T >= 0)) return { error: 'الباقي بالخزان غير صالح' };
  if (cap && T > cap) return { error: 'الباقي بالخزان يتجاوز سعته (' + cap + ' لتر)' };
  if (!(C >= 0)) return { error: 'رصيد البطاقة غير صالح' };

  const req = b.requestedLiters === '' || b.requestedLiters == null ? 0 : num(b.requestedLiters);
  if (!(req >= 0)) return { error: 'الكمية المطلوبة غير صالحة' };

  // عدد المحركات: من الوثيقة نفسها، وإلا من وجود المحرك الأيسر
  const n = Number(b.engineCount);
  const twin = n === 2 ? true : n === 1 ? false : !!(b.engines && b.engines.left);
  const right = meter(b.engines && b.engines.right, twin ? 'الأيمن' : '');
  if (right.error) return right;
  let left = null;
  if (twin) {
    left = meter(b.engines && b.engines.left, 'الأيسر');
    if (left.error) return left;
  }

  const price = priceOf(vessel);
  return {
    data: {
      date,
      documentNumber: String(b.documentNumber || '').replace(/[<>]/g, '').trim().slice(0, 40),
      docTotalLiters: L,
      docTotalHours: H,
      requestedLiters: req,
      remainingTank: T,
      cardDinars: C,
      cardLiters: r3(C / price),
      fuelPrice: price,
      tankAfter: r3(T + L),
      engineCount: twin ? 2 : 1,
      engines: { right, left },
      totalActualRate: r3(L / H)
    }
  };
}

/* ───────── قواعد التدقيق ───────── */
function audit(d, vessel) {
  const v = []; // { rule, w, msg }
  const cap = Number(vessel.tankCapacity) || 0;
  const price = d.fuelPrice || priceOf(vessel);

  if (cap && d.tankAfter > cap + 1)
    v.push({ rule: 'TANK_OVERFLOW', w: 40, msg: 'تجاوز الخزان: الباقي + المستعمل = ' + d.tankAfter + ' لتر والسعة ' + cap });

  if (d.docTotalLiters * price > d.cardDinars + price)
    v.push({ rule: 'CARD_INSUFFICIENT', w: 35, msg: 'رصيد البطاقة لا يكفي: ' + d.docTotalLiters + ' لتر = ' + r3(d.docTotalLiters * price) + ' د.ت، والرصيد ' + d.cardDinars + ' د.ت' });

  const used = [d.engines.right, d.engines.left].filter(Boolean).map((m) => m.usedHours);
  const maxUsed = Math.max.apply(null, used);
  if (Math.abs(maxUsed - d.docTotalHours) > 0.5)
    v.push({ rule: 'HOURS_MISMATCH', w: 30, msg: 'ساعات العمل (' + d.docTotalHours + ') لا تطابق ساعات العدّاد (' + maxUsed + ')' });

  if (cap && d.docTotalLiters >= 0.9 * cap && d.docTotalHours < 10)
    v.push({ rule: 'VOLUME_INFLATION', w: 35, msg: 'تضخم الكمية: ≥ 90% من الخزان مقابل أقل من 10 ساعات' });

  if (WEEKEND_DAYS.indexOf(new Date(d.date).getUTCDay()) !== -1)
    v.push({ rule: 'PHANTOM_TRIP', w: 15, msg: 'التاريخ يوم عطلة أسبوعية' });

  const score = Math.min(100, v.reduce((a, x) => a + x.w, 0));
  return {
    riskScore: score,
    isFraud: v.length > 0,
    violations: v.map((x) => x.rule),
    fraudReason: v.map((x) => x.msg).join(' | ')
  };
}

/* ───────── 1. معايير القارب ───────── */
router.get('/standards/:boatId', async (req, res) => {
  try {
    const v = await findVessel(req.params.boatId);
    if (!v) return res.status(404).json({ error: 'المركب غير موجود' });
    res.json({
      engineCount: v.engineCount || 1,
      tankCapacity: v.tankCapacity || 0,
      standardRate: v.standardRate || 0,
      fuelPrice: priceOf(v)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ───────── 2. حفظ وثيقة جديدة ───────── */
router.post('/documents', async (req, res) => {
  try {
    const vessel = await findVessel(req.body && req.body.boatId);
    if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });

    const p = parseBody(req.body, vessel);
    if (p.error) return res.status(400).json({ error: p.error });

    const a = audit(p.data, vessel);
    const doc = new FuelDocument(Object.assign({ boatId: vesselKey(vessel), createdBy: actor(req).id }, p.data, a));
    await doc.save();
    res.status(201).json({ ok: true, id: doc._id, riskScore: a.riskScore, isFraud: a.isFraud, fraudReason: a.fraudReason });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ───────── 3. جلب وثائق القارب ───────── */
router.get('/documents/:boatId', async (req, res) => {
  try {
    const vessel = await findVessel(req.params.boatId);
    if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });

    const q = { boatId: { $in: vesselKeys(vessel) } };
    const s = req.query.start ? new Date(req.query.start) : null;
    const e = req.query.end ? new Date(req.query.end) : null;
    if ((s && !isNaN(s)) || (e && !isNaN(e))) {
      q.date = {};
      if (s && !isNaN(s)) q.date.$gte = s;
      if (e && !isNaN(e)) { e.setUTCHours(23, 59, 59, 999); q.date.$lte = e; }
    }
    const docs = await FuelDocument.find(q).select('-history').sort({ date: -1 }).lean();
    res.json(docs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ───────── 4. تعديل وثيقة ───────── */
router.put('/documents/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'معرّف الوثيقة غير صالح' });
    const doc = await FuelDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'الوثيقة غير موجودة' });

    const vessel = await findVessel(doc.boatId);
    if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });

    const p = parseBody(req.body, vessel);
    if (p.error) return res.status(400).json({ error: p.error });
    const a = audit(p.data, vessel);

    const who = actor(req);
    const before = doc.toObject();
    delete before.history;
    doc.history.push({ at: new Date(), by: who.id, byName: who.name, before });

    doc.set(Object.assign({}, p.data, a));
    doc.editedAt = new Date();
    doc.editedBy = who.id;
    doc.editCount = (doc.editCount || 0) + 1;
    await doc.save();

    const out = doc.toObject();
    delete out.history;
    res.json({ success: true, document: out, riskScore: a.riskScore, isFraud: a.isFraud, fraudReason: a.fraudReason });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ───────── 5. حذف وثيقة ───────── */
router.delete('/documents/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'معرّف الوثيقة غير صالح' });
    const deleted = await FuelDocument.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'الوثيقة غير موجودة' });
    res.json({ success: true, message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ───────── 6. تقرير التدقيق ───────── */
router.get('/audit-report/:boatId', async (req, res) => {
  try {
    const v = await findVessel(req.params.boatId);
    if (!v) return res.status(404).json({ error: 'المركب غير موجود' });
    const docs = await FuelDocument.find({ boatId: { $in: vesselKeys(v) } }).select('-history').sort({ date: -1 }).lean();

    let liters = 0, hours = 0, risk = 0, flagged = 0, warned = 0;
    const byRule = {};
    docs.forEach((d) => {
      liters += Number(d.docTotalLiters) || 0;
      hours += Number(d.docTotalHours) || 0;
      const rs = Number(d.riskScore) || 0;
      risk += rs;
      if (d.isFraud) flagged++; else if (rs >= 30) warned++;
      (d.violations || []).forEach((k) => { byRule[k] = (byRule[k] || 0) + 1; });
    });

    const last = docs[0] || null; // الأحدث تاريخاً
    const cap = Number(v.tankCapacity) || 0;
    const bal = last && last.tankAfter != null ? Number(last.tankAfter) : null;

    res.json({
      vessel: { id: vesselKey(v), name: v.name },
      totals: {
        docs: docs.length,
        totalHours: hours,
        avgHours: docs.length ? hours / docs.length : 0,
        requestedLiters: liters,
        avgRisk: docs.length ? risk / docs.length : 0,
        flagged, warned,
        expectedLiters: null, varianceLiters: null, variancePct: null, excessLiters: null,
        balanceLiters: bal,
        balancePct: bal != null && cap ? Math.min(100, (bal / cap) * 100) : null,
        cardLiters: last && last.cardLiters != null ? last.cardLiters : null,
        cardDinars: last && last.cardDinars != null ? last.cardDinars : null
      },
      byRule
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ───────── 7. مسارات ناقصة (لاستكمال الواجهة) ───────── */
router.get('/auto-standard/:boatId', async (req, res) => {
  res.json({ autoRate: 0, message: 'غير متاح حالياً' });
});

router.get('/compare-vessel/:boatId', async (req, res) => {
  res.json({ success: false, message: 'غير متاح حالياً' });
});

/* ───────── تصدير ───────── */
module.exports = function (app, middlewares) {
  authenticateAccessToken = middlewares.authenticateAccessToken;
  csrfProtection = middlewares.csrfProtection;
  app.use('/api/fuel', authenticateAccessToken, router);
};
module.exports._internals = { parseBody, audit };
