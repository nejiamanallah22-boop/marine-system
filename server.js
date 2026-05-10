const express = require('express');
const cors = require('cors');
require('dotenv').config();
const mongoose = require('mongoose');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ================= CONNECT DB =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.log("❌ DB error:", err));

// ================= MODEL =================
const vesselSchema = new mongoose.Schema({
  name: String,
  num: String,
  len: Number,
  reg: String,
  zone: String,
  port: String,
  supp: String,
  stat: String,
  break: String,
  fDate: String,
  eDate: String,
  ref: String,
  cat: String
});

const Vessel = mongoose.model('Vessel', vesselSchema);

// ================= HELPERS =================
function getCategory(len) {
  const n = parseFloat(len);
  if (n === 11) return "البروق";
  if (n >= 8 && n <= 12) return "صقور";
  if (n > 12 && n <= 25) return "خوافر";
  if (n >= 30) return "طوافات";
  return "زوارق مزدوجة";
}

// ================= ROUTES =================

// 🔵 GET ALL
app.get('/api/vessels', async (req, res) => {
  const data = await Vessel.find();
  res.json(data);
});

// 🟢 ADD
app.post('/api/vessels', async (req, res) => {
  try {
    const vessel = req.body;

    const newVessel = await Vessel.create({
      ...vessel,
      cat: getCategory(vessel.len)
    });

    res.json({ success: true, vessel: newVessel });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🟡 UPDATE
app.put('/api/vessels/:id', async (req, res) => {
  try {
    const updated = await Vessel.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        cat: getCategory(req.body.len)
      },
      { new: true }
    );

    res.json({ success: true, vessel: updated });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔴 DELETE
app.delete('/api/vessels/:id', async (req, res) => {
  try {
    await Vessel.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
