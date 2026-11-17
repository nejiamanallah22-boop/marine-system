/**
 * routes/fuel.js — محرك التدقيق لوثائق تموين المحروقات
 */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Vessel = require('../models/Vessel');
const FuelDocument = require('../models/FuelDocument');

// الميدلوير سيُمرَّر من server.js
let authenticateAccessToken, csrfProtection;

// دالة البحث عن القارب (تقبل id أو _id)
async function findVessel(boatId) {
  let query = { id: boatId };
  if (mongoose.Types.ObjectId.isValid(boatId)) {
    query = { $or: [{ id: boatId }, { _id: boatId }] };
  }
  return await Vessel.findOne(query).lean();
}

/* ───────── 1. معايير القارب ───────── */
router.get('/standards/:boatId', async (req, res) => {
  try {
    const v = await findVessel(req.params.boatId);
    if (!v) return res.status(404).json({ error: 'المركب غير موجود' });
    
    res.json({ 
        engineCount: v.engineCount || 1, 
        tankCapacity: v.tankCapacity || 0, 
        standardRate: v.standardRate || 0 
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ───────── 2. حفظ وثيقة جديدة ───────── */
router.post('/documents', async (req, res) => {
  try {
    const b = req.body;
    const vessel = await findVessel(String(b.boatId));
    if (!vessel) return res.status(404).json({ error: 'المركب غير موجود' });
    
    const doc = new FuelDocument({
      boatId: vessel.id || vessel._id.toString(), 
      date: new Date(b.date), 
      docTotalHours: Number(b.docTotalHours), 
      docTotalLiters: Number(b.docTotalLiters),
      documentNumber: b.documentNumber || '',
      engineCount: vessel.engineCount || 1,
      engines: { right: b.engines?.right, left: b.engines?.left },
      totalActualRate: Number(b.docTotalLiters) / (Number(b.docTotalHours) || 1),
      riskScore: 0, 
      isFraud: false
    });
    await doc.save();
    res.status(201).json({ ok: true, id: doc._id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ───────── 3. جلب وثائق القارب ───────── */
router.get('/documents/:boatId', async (req, res) => {
  try {
    const docs = await FuelDocument.find({ boatId: req.params.boatId }).sort({ date: -1 });
    res.json(docs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ───────── 4. تعديل وثيقة ───────── */
router.put('/documents/:id', async (req, res) => {
  try {
    const b = req.body;
    const updated = await FuelDocument.findByIdAndUpdate(
      req.params.id,
      {
        date: new Date(b.date),
        documentNumber: b.documentNumber,
        docTotalHours: Number(b.docTotalHours),
        docTotalLiters: Number(b.docTotalLiters),
        engines: b.engines,
        totalActualRate: Number(b.docTotalLiters) / (Number(b.docTotalHours) || 1)
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'الوثيقة غير موجودة' });
    res.json({ success: true, document: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ───────── 5. حذف وثيقة ───────── */
router.delete('/documents/:id', async (req, res) => {
  try {
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
    const bId = v.id || v._id.toString();
    const docs = await FuelDocument.find({ boatId: bId }).lean();
    
    let liters = 0, hours = 0;
    docs.forEach(d => { liters += Number(d.docTotalLiters) || 0; hours += Number(d.docTotalHours) || 0; });
    
    res.json({ 
        vessel: { id: bId, name: v.name }, 
        totals: { 
            docs: docs.length, totalHours: hours, avgHours: docs.length ? hours/docs.length : 0, 
            requestedLiters: liters, avgRisk: 0, flagged: 0, warned: 0, 
            expectedLiters: null, varianceLiters: null, variancePct: null, excessLiters: null, 
            balanceLiters: null, balancePct: null 
        }, 
        byRule: {} 
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
module.exports = function(app, middlewares) {
    authenticateAccessToken = middlewares.authenticateAccessToken;
    csrfProtection = middlewares.csrfProtection;
    app.use('/api/fuel', authenticateAccessToken, router);
};
