/**
 * routes/fuel.js v4 — محرك التدقيق لوثائق تموين المحروقات
 * - المعيار الذاتي: يُحسب تلقائياً بعد 3 وثائق سليمة (معدل مرجّح لآخر 10 وثائق).
 *   قبل ذلك: المعيار اليدوي إن وُجد، ثم معيار الفئة، وإلا لا معيار.
 * - المقارنة الذكية: كل مركب يُقارن بأقرانه في نفس الفئة (الزوارق، الصقور، الخوافر…).
 * - تعديل وحذف الوثائق مع سجل تغييرات وإعادة تدقيق كل وثائق المركب.
 * يتطلب: models/Vessel.js و models/FuelDocument.js
 */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Vessel = require('../models/Vessel');
const FuelDocument = require('../models/FuelDocument');

let authenticateAccessToken, csrfProtection, normalizeRole = r => String(r || '');
let addLog = async () => {};
const csrf = (req, res, next) => csrfProtection(req, res, next);

// سعر اللتر (دينار تونسي) — يمكن تغييره عبر متغير البيئة FUEL_PRICE_DT
const FUEL_PRICE = Number(process.env.FUEL_PRICE_DT) > 0 ? Number(process.env.FUEL_PRICE_DT) : 1.998;

const WRITE_ROLES = ['admin', 'manager', 'editor', 'maintenance_unit'];
const DELETE_ROLES = ['admin', 'manager'];
const PRIVILEGED = ['admin', 'manager'];
const FRAUD_THRESHOLD = 60;
const WARN_THRESHOLD = 30;

const LEARN_MIN_OWN = 3;        // لا معيار ذاتي قبل 3 وثائق سليمة
const WINDOW = 10;              // بعدها يُحسب من آخر 10 وثائق سليمة
const BASELINE_FIXED = false;   // true = يُثبَّت المعيار على أول 3 وثائق فقط
const LEARN_MIN_CATEGORY = 5;   // أقل عدد وثائق لتعلّم معيار الفئة (احتياطي)

const PEER_WINDOW_DAYS = 120;   // نافذة المقارنة بالأقران
const PEER_MIN_VESSELS = 3;     // أقل عدد أقران للمقارنة
const PEER_TOL = 0.25;          // تسامح عن وسيط الفئة

// وزن كل قاعدة في درجة الخطر (الحد الأقصى 100)
const WEIGHTS = {
  METER_ROLLBACK: 70, TANK_OVERFLOW: 70, PHANTOM_TRIP: 65, TANK_BALANCE: 55,
  CARD_INSUFFICIENT: 50, RATE_INFLATED: 45, DOUBLE_DIP: 45, VOLUME_INFLATION: 40,
  PEER_ANOMALY: 40, HOURS_MISMATCH: 35, CONSUMPTION_GAP: 35, STAT_ANOMALY: 25, METER_GAP: 20
};

/* ───────── أدوات ───────── */
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

// مراكب الفئة نفسها (مع احترام الإقليم)
async function siblingsOf(req, v) {
  if (!v.cat) return [];
  const q = { cat: v.cat, _id: { $ne: v._id }, status: { $ne: 'طرح' } };
  if (req && !isPrivileged(req) && req.user.region) q.region = req.user.region;
  return Vessel.find(q).select('id name').lean();
}

/* ───────── المعيار الفعّال: ذاتي (3+ وثائق) ← يدوي ← فئة ───────── */
const cleanQuery = (ids, excludeId) => {
  const q = { boatId: { $in: ids }, isFraud: false, riskScore: { $lt: WARN_THRESHOLD }, docTotalHours: { $gt: 0 } };
  if (excludeId) q._id = { $ne: excludeId };
  return q;
};

// اللترات المستهلكة فعلاً: المحسوبة من رصيد الخزان إن وُجدت، وإلا (أول وثيقة بلا سابقة) الكمية المطلوبة
const consumedOf = d => (d.actualConsumption > 0 ? d.actualConsumption : d.docTotalLiters);

async function cleanRates(ids, excludeId) {
  const docs = await FuelDocument.find(cleanQuery(ids, excludeId))
    .select('docTotalLiters docTotalHours actualConsumption').limit(500).lean();
  return docs.map(d => consumedOf(d) / d.docTotalHours).filter(x => x > 0);
}

// المعيار = مجموع الاستهلاك الفعلي (لتر) ÷ مجموع ساعات العمل، للوثائق السليمة، مع استبعاد الشواذ
async function ownStandard(ids, excludeId) {
  let docs = await FuelDocument.find(cleanQuery(ids, excludeId))
    .sort({ date: BASELINE_FIXED ? 1 : -1 })
    .limit(BASELINE_FIXED ? LEARN_MIN_OWN : WINDOW)
    .select('docTotalLiters docTotalHours actualConsumption').lean();
  if (docs.length < LEARN_MIN_OWN) return null;
  if (docs.length >= 5) {
    const rs = docs.map(d => consumedOf(d) / d.docTotalHours), m = median(rs);
    const f = docs.filter((d, i) => m > 0 && Math.abs(rs[i] - m) / m <= 0.30);
    if (f.length >= LEARN_MIN_OWN) docs = f;
  }
  const L = docs.reduce((s, d) => s + consumedOf(d), 0), H = docs.reduce((s, d) => s + d.docTotalHours, 0);
  return H > 0 ? { rate: r2(L / H), basedOn: docs.length } : null;
}

async function effectiveStandard(v, req, excludeId) {
  const own = await ownStandard(idsOf(v), excludeId);
  if (own) return { rate: own.rate, source: 'learned', basedOn: own.basedOn };
  const manual = Number(v.standardRate) || 0;
  if (manual > 0) return { rate: manual, source: 'manual', basedOn: 0 };
  const sibs = await siblingsOf(req, v);
  if (sibs.length) {
    const rs = await cleanRates([].concat(...sibs.map(s => [s.id, String(s._id)].filter(Boolean))), excludeId);
    if (rs.length >= LEARN_MIN_CATEGORY) return { rate: r2(median(rs)), source: 'category', basedOn: rs.length };
  }
  return { rate: 0, source: 'none', basedOn: 0 };
}

/* ───────── المقارنة الذكية مع أقران الفئة ─────────
 * المرجع = وسيط معدلات الأقران (دون المركب نفسه) محسوباً من كل وثائقهم بما فيها المشبوهة،
 * حتى لا يختفي من المقارنة مركب يتلاعب باستمرار. */
async function vesselStats(ids, since) {
  const docs = await FuelDocument.find({ boatId: { $in: ids }, date: { $gte: since }, docTotalHours: { $gt: 0 } })
    .select('docTotalLiters docTotalHours actualConsumption isFraud').lean();
  if (!docs.length) return null;
  const L = docs.reduce((s, d) => s + d.docTotalLiters, 0), H = docs.reduce((s, d) => s + d.docTotalHours, 0);
  const U = docs.reduce((s, d) => s + consumedOf(d), 0);   // الاستهلاك الفعلي
  return { docs: docs.length, liters: r2(L), consumed: r2(U), hours: r2(H), rate: r2(U / H), litersPerDoc: r2(L / docs.length),
    hoursPerDoc: r2(H / docs.length), flagged: docs.filter(d => d.isFraud).length };
}

async function peerBenchmark(v, req) {
  const since = new Date(Date.now() - PEER_WINDOW_DAYS * 864e5);
  const sibs = await siblingsOf(req, v);
  const peers = [];
  for (const s of sibs.slice(0, 60)) {
    const st = await vesselStats([s.id, String(s._id)].filter(Boolean), since);
    if (st && st.docs >= 2) peers.push(Object.assign({ name: s.name }, st));
  }
  const mine = await vesselStats(idsOf(v), since);
  if (peers.length < PEER_MIN_VESSELS) return { ok: false, peers: peers.length, mine };

  const rates = peers.map(p => p.rate), med = median(rates);
  const mad = median(rates.map(x => Math.abs(x - med)));
  const sigma = Math.max(1.4826 * mad, med * 0.05);   // حد أدنى 5% لتفادي القسمة على صفر
  const mean = k => peers.reduce((s, p) => s + p[k], 0) / peers.length;
  return { ok: true, since, peers, mine, median: r2(med), sigma: r2(sigma), min: Math.min(...rates), max: Math.max(...rates),
    avgLitersPerDoc: r2(mean('litersPerDoc')), avgHoursPerDoc: r2(mean('hoursPerDoc')) };
}

/* ───────── قراءة والتحقق من المدخلات ───────── */
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
  const L = n(b.docTotalLiters), H = n(b.docTotalHours), T = n(b.remainingTank), C = n(b.cardDinars);
  if (!(L > 0 && L <= 1e6)) return { err: 'الكمية المطلوبة غير صالحة' };
  if (!(H > 0 && H <= 1e5)) return { err: 'ساعات العمل غير صالحة' };
  if (!(T >= 0 && T <= v.tankCapacity)) return { err: 'الباقي بالخزان غير صالح (من 0 إلى سعة الخزان)' };
  if (!(C >= 0 && C <= 1e7)) return { err: 'رصيد البطاقة غير صالح' };
  const twin = v.engineCount === 2;
  const right = readEngine(b.engines && b.engines.right, twin ? 'الأيمن' : '');
  if (right.err) return { err: right.err };
  let left = null;
  if (twin) { left = readEngine(b.engines && b.engines.left, 'الأيسر'); if (left.err) return { err: left.err }; }
  const documentNumber = typeof b.documentNumber === 'string' ? b.documentNumber.replace(/[<>]/g, '').trim().slice(0, 40) : '';
  return { input: { date, docTotalHours: H, docTotalLiters: L, remainingTank: T, cardDinars: C, price: FUEL_PRICE, documentNumber, engines: { right, left }, twin } };
}

const docFields = (d, a) => ({
  date: d.date, documentNumber: d.documentNumber,
  docTotalLiters: d.docTotalLiters, docTotalHours: d.docTotalHours,
  remainingTank: r2(d.remainingTank), cardDinars: r3(d.cardDinars),
  cardLiters: r2(a.cardL), fuelPrice: d.price, tankAfter: r2(d.remainingTank + d.docTotalLiters),
  engineCount: d.twin ? 2 : 1, engines: { right: d.engines.right, left: d.engines.left },
  totalActualRate: r2(a.rate), actualConsumption: a.consumed,
  riskScore: a.score, isFraud: a.isFraud, fraudReason: a.reason, violations: a.rules
});

/* ───────── محرك التدقيق ───────── */
async function runAudit(vessel, d, opts = {}) {
  const hits = {};
  const add = (rule, msg) => { hits[rule] = hits[rule] ? hits[rule] + ' ؛ ' + msg : msg; };
  const ids = idsOf(vessel);
  const base = { boatId: { $in: ids } };
  if (opts.excludeId) base._id = { $ne: opts.excludeId };
  const std = Number(opts.std) || 0;
  const peer = Number(opts.peerRate) || 0;
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

  // 4) المعدل مقابل المعيار الذاتي، ومقابل وسيط الفئة، وتضخم الكمية
  if (std > 0 && rate >= std * 1.15) add('RATE_INFLATED', 'المعدل ' + r2(rate) + ' يتجاوز المعيار ' + std + ' بـ 15% أو أكثر');
  if (peer > 0 && rate >= peer * (1 + PEER_TOL)) add('PEER_ANOMALY', 'المعدل ' + r2(rate) + ' يتجاوز وسيط مراكب الفئة ' + peer + ' بـ ' + Math.round((rate / peer - 1) * 100) + '%');
  if (tank > 0 && L >= 0.9 * tank && H < 10) add('VOLUME_INFLATION', 'تعبئة ≥ 90% من الخزان مقابل أقل من 10 ساعات');

  // 5) فترات التوقف
  const t = d.date.getTime();
  if ((vessel.inactivePeriods || []).some(p => p.from && t >= new Date(p.from).getTime() && (!p.to || t <= new Date(p.to).getTime())))
    add('PHANTOM_TRIP', 'الوثيقة داخل فترة توقف مسجلة للمركب');

  // 6) الوثيقة السابقة واللاحقة: اتصال العدّاد + رصيد الخزان
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

  // 7) تموين مكرر: نفس اليوم أو نفس رقم الوثيقة
  const dupQ = [{ date: { $gte: d.date, $lt: new Date(t + 864e5) } }];
  if (d.documentNumber) dupQ.push({ documentNumber: d.documentNumber });
  if (await FuelDocument.exists(Object.assign({}, base, { $or: dupQ }))) add('DOUBLE_DIP', 'وثيقة أخرى بنفس التاريخ أو الرقم لهذا المركب');

  // 8) انحراف إحصائي عن سجل المركب
  const hist = await FuelDocument.find(Object.assign({}, base, { isFraud: false })).sort({ date: -1 }).limit(50).select('totalActualRate').lean();
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

// إعادة تدقيق وثائق المركب (يتجدد المعيار مع كل إضافة/تعديل/حذف، فتُحدَّث كل الوثائق)
async function reauditFrom(v, req, fromDate) {
  try {
    const pb = await peerBenchmark(v, req);
    const peerRate = pb.ok ? pb.median : 0;
    const docs = await FuelDocument.find({ boatId: { $in: idsOf(v) }, date: { $gte: fromDate } }).sort({ date: 1 }).limit(200).lean();
    for (const d of docs) {
      const e = d.engines || {};
      if (d.remainingTank == null || d.cardDinars == null || !e.right || e.right.startHours == null) continue; // وثائق النسخة القديمة
      const std = await effectiveStandard(v, req, d._id);   // المعيار لا يتضمن الوثيقة نفسها
      const input = { date: new Date(d.date), docTotalHours: d.docTotalHours, docTotalLiters: d.docTotalLiters, remainingTank: d.remainingTank,
        cardDinars: d.cardDinars, price: d.fuelPrice || FUEL_PRICE, documentNumber: d.documentNumber || '', engines: { right: e.right, left: e.left || null } };
      const a = await runAudit(v, input, { std: std.rate, peerRate, excludeId: d._id });
      await FuelDocument.updateOne({ _id: d._id }, { $set: { riskScore: a.score, isFraud: a.isFraud, fraudReason: a.reason, violations: a.rules, actualConsumption: a.consumed } });
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
const snapshot = d => ({ date: d.date, documentNumber: d.documentNumber, docTotalLiters: d.docTotalLiters, docTotalHours: d.docTotalHours,
  remainingTank: d.remainingTank, cardDinars: d.cardDinars, engines: d.engines, riskScore: d.riskScore, isFraud: d.isFraud });
const logDoc = (req, action, v, d, details) => addLog({
  userId: req.user.id, userName: req.user.name, action, resource: 'fuel-document',
  resourceId: String(d._id), resourceName: v.name + ' — ' + new Date(d.date).toISOString().slice(0, 10),
  status: 'success', ip: req.ip, requestId: req.requestId, details
});
const auditOut = async id => {
  const x = await FuelDocument.findById(id).select('riskScore isFraud fraudReason violations').lean();
  return x ? { riskScore: x.riskScore, isFraud: x.isFraud, fraudReason: x.fraudReason, violations: x.violations } : {};
};

/* ───────── 1. معايير القارب ───────── */
router.get('/standards/:boatId', async (req, res) => {
  try {
    const v = await loadVessel(req, res); if (!v) return;
    const sd = await effectiveStandard(v, req);
    const cleanCount = await FuelDocument.countDocuments(cleanQuery(idsOf(v)));
    res.json({ engineCount: v.engineCount || 1, tankCapacity: v.tankCapacity || 0, standardRate: sd.rate,
      standardSource: sd.source, standardBasedOn: sd.basedOn, cleanCount, learnMin: LEARN_MIN_OWN,
      manualRate: Number(v.standardRate) || 0, fuelPrice: FUEL_PRICE });
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
    const p = parseDoc(b, v); if (p.err) return res.status(400).json({ error: p.err });

    const sd = await effectiveStandard(v, req);
    const pb = await peerBenchmark(v, req);
    const a = await runAudit(v, p.input, { std: sd.rate, peerRate: pb.ok ? pb.median : 0 });
    const doc = await FuelDocument.create(Object.assign({ boatId: v.id || String(v._id), createdBy: req.user.id }, docFields(p.input, a)));
    await reauditFrom(v, req, new Date(0));   // المعيار تجدد: حدّث كل الوثائق
    res.status(201).json(Object.assign({ ok: true, id: doc._id }, await auditOut(doc._id)));
  } catch (e) { fail(res, e, 'create'); }
});

/* ───────── 2b. تعديل وثيقة ───────── */
router.put('/documents/:docId', csrf, async (req, res) => {
  try {
    if (!canWrite(req)) return res.status(403).json({ error: 'ليس لديك صلاحية التعديل' });
    const found = await getDoc(req, res); if (!found) return;
    const { doc, v } = found;
    const p = parseDoc(req.body || {}, v); if (p.err) return res.status(400).json({ error: p.err });

    const sd = await effectiveStandard(v, req, doc._id);
    const pb = await peerBenchmark(v, req);
    const a = await runAudit(v, p.input, { std: sd.rate, peerRate: pb.ok ? pb.median : 0, excludeId: doc._id });
    const before = snapshot(doc);
    await FuelDocument.updateOne({ _id: doc._id }, {
      $set: Object.assign(docFields(p.input, a), { editedAt: new Date(), editedBy: req.user.id }),
      $inc: { editCount: 1 },
      $push: { history: { $each: [{ at: new Date(), by: req.user.id, byName: req.user.name || req.user.username || '', before }], $slice: -20 } }
    });
    await reauditFrom(v, req, new Date(0));
    await logDoc(req, 'update', v, doc, { before, after: snapshot(Object.assign({}, p.input, { riskScore: a.score, isFraud: a.isFraud })) });
    res.json(Object.assign({ ok: true }, await auditOut(doc._id)));
  } catch (e) { fail(res, e, 'update'); }
});

/* ───────── 2c. حذف وثيقة ───────── */
router.delete('/documents/:docId', csrf, async (req, res) => {
  try {
    if (!canDelete(req)) return res.status(403).json({ error: 'الحذف للمسؤول والمدير فقط' });
    const found = await getDoc(req, res); if (!found) return;
    const { doc, v } = found;
    await FuelDocument.deleteOne({ _id: doc._id });
    await reauditFrom(v, req, new Date(0));
    await logDoc(req, 'delete', v, doc, { deleted: snapshot(doc) });
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'delete'); }
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
    res.json(await FuelDocument.find(q).select('-history').sort({ date: -1 }).limit(1000).lean());
  } catch (e) { fail(res, e, 'list'); }
});

/* ───────── 4. تقرير التدقيق ───────── */
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
      lastRemainingTank: null, cardDinars: null, cardLiters: null, fuelPrice: FUEL_PRICE,
      standard: { rate: std, source: sd.source, basedOn: sd.basedOn }
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

/* ───────── 5. الاستهلاك المعياري التلقائي (تفصيلي: المركب + الفئة) ───────── */
router.get('/auto-standard/:boatId', async (req, res) => {
  try {
    const v = await loadVessel(req, res); if (!v) return;
    const sibs = await siblingsOf(req, v);
    const ids = idsOf(v).concat(...sibs.map(s => [s.id, String(s._id)].filter(Boolean)));
    let rs = await cleanRates(ids);
    if (rs.length < 5) return res.json({ autoRate: 0, message: 'لا توجد بيانات كافية (يلزم 5 وثائق سليمة على الأقل)' });
    const stat = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return { m, sd: Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) }; };
    let s = stat(rs); const before = rs.length;
    if (s.sd > 0) { rs = rs.filter(x => Math.abs(x - s.m) <= 2 * s.sd); s = stat(rs); }
    res.json({ autoRate: r2(s.m), category: v.cat || 'المركب نفسه', basedOn: rs.length, excluded: before - rs.length, stdDev: r2(s.sd),
      caution: rs.length < 10 ? 'عينة صغيرة، راجع النتيجة قبل الاعتماد' : '' });
  } catch (e) { fail(res, e, 'auto-standard'); }
});

/* ───────── 6. مقارنة مع أكثر مركب مماثل وثائقاً ───────── */
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

/* ───────── 7. المقارنة الذكية مع أقران الفئة ───────── */
router.get('/peer-analysis/:boatId', async (req, res) => {
  try {
    const v = await loadVessel(req, res); if (!v) return;
    if (!v.cat) return res.json({ ok: false, reason: 'no_category' });
    const b = await peerBenchmark(v, req);
    if (!b.ok) return res.json({ ok: false, reason: 'few_peers', peers: b.peers, need: PEER_MIN_VESSELS });
    if (!b.mine) return res.json({ ok: false, reason: 'no_data' });

    const m = b.mine, dev = (m.rate - b.median) / b.median, z = (m.rate - b.median) / b.sigma;
    const level = (z >= 3 || dev >= 0.35) ? 'high' : (z >= 2 || dev >= PEER_TOL) ? 'warn' : 'ok';
    const excess = Math.max(0, m.consumed - b.median * m.hours);
    const signals = [];
    if (level !== 'ok') signals.push('المعدل أعلى من وسيط الفئة بـ ' + r2(dev * 100) + '%');
    if (m.litersPerDoc > b.avgLitersPerDoc * 1.2 && m.hoursPerDoc < b.avgHoursPerDoc * 0.85)
      signals.push('كمية الوثيقة أكبر من أقرانها وساعاتها أقل: نمط تضخيم الكميات');
    if (m.flagged / m.docs >= 0.3) signals.push('أكثر من 30% من وثائق المركب مشبوهة');
    const all = b.peers.map(p => p.rate).concat(m.rate).sort((a, c) => c - a);

    res.json({ ok: true, cat: v.cat, windowDays: PEER_WINDOW_DAYS, level, signals,
      mine: m, categoryRate: b.median, min: b.min, max: b.max, zScore: r2(z), devPct: r2(dev * 100),
      excessLiters: r2(excess), excessCost: r3(excess * FUEL_PRICE),
      rank: all.indexOf(m.rate) + 1, total: all.length,
      vessels: b.peers.map(p => ({ name: p.name, rate: p.rate, docs: p.docs })) });
  } catch (e) { fail(res, e, 'peer-analysis'); }
});

/* ───────── تصدير ───────── */
module.exports = function (app, middlewares) {
  authenticateAccessToken = middlewares.authenticateAccessToken;
  csrfProtection = middlewares.csrfProtection;
  if (typeof middlewares.normalizeRole === 'function') normalizeRole = middlewares.normalizeRole;
  if (typeof middlewares.addSystemLog === 'function') addLog = middlewares.addSystemLog;
  app.use('/api/fuel', authenticateAccessToken, router);
};
module.exports._test = { runAudit, readEngine, parseDoc, effectiveStandard, ownStandard, peerBenchmark, FUEL_PRICE };
