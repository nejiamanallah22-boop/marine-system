const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB, getDB } = require('./db');
const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

let db;

// ==================== دوال مساعدة ====================
function getCurrentDate() {
  const now = new Date();
  return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
}

function getCurrentTime() {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

// ==================== API - المراكب ====================
app.get('/api/vessels', async (req, res) => {
  try {
    const vessels = await db.collection('vessels').find({}).sort({ createdAt: -1 }).toArray();
    res.json(vessels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vessels', async (req, res) => {
  try {
    const vessel = { ...req.body, createdAt: new Date() };
    const result = await db.collection('vessels').insertOne(vessel);
    res.json({ ...vessel, _id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/vessels/:id', async (req, res) => {
  try {
    await db.collection('vessels').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body }
    );
    res.json({ message: 'updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/vessels/:id', async (req, res) => {
  try {
    await db.collection('vessels').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ message: 'deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== API - المستخدمين ====================
app.get('/api/users', async (req, res) => {
  try {
    const users = await db.collection('users').find({}).project({ pass: 0 }).toArray();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { name, pass, role, enabled } = req.body;
    const hashedPass = bcrypt.hashSync(pass, 10);
    const result = await db.collection('users').insertOne({
      name, pass: hashedPass, role, enabled, createdAt: new Date()
    });
    res.json({ id: result.insertedId, name, role, enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { name, pass, role, enabled } = req.body;
    const updateData = { name, role, enabled };
    if (pass) {
      updateData.pass = bcrypt.hashSync(pass, 10);
    }
    await db.collection('users').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateData }
    );
    res.json({ message: 'updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await db.collection('users').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ message: 'deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== API - تسجيل الدخول ====================
app.post('/api/login', async (req, res) => {
  try {
    const { name, pass } = req.body;
    const user = await db.collection('users').findOne({ name });
    
    if (!user) return res.json({ error: 'اسم المستخدم غير موجود' });
    if (!user.enabled) return res.json({ error: 'هذا الحساب معطل' });
    
    const isValid = bcrypt.compareSync(pass, user.pass);
    if (!isValid) return res.json({ error: 'كلمة المرور غير صحيحة' });
    
    res.json({ id: user._id, name: user.name, role: user.role, enabled: user.enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== API - التذاكر ====================
app.get('/api/tickets', async (req, res) => {
  try {
    const tickets = await db.collection('tickets').find({}).sort({ createdAt: -1 }).toArray();
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tickets', async (req, res) => {
  try {
    const ticket = { ...req.body, createdAt: new Date() };
    const result = await db.collection('tickets').insertOne(ticket);
    res.json({ ...ticket, _id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tickets/:id/reply', async (req, res) => {
  try {
    const ticket = await db.collection('tickets').findOne({ _id: new ObjectId(req.params.id) });
    if (!ticket) return res.status(404).json({ error: 'التذكرة غير موجودة' });
    
    const replies = ticket.replies || [];
    replies.push(req.body.reply);
    
    await db.collection('tickets').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { replies, status: 'تم الرد' } }
    );
    res.json({ message: 'reply added' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tickets/:id/close', async (req, res) => {
  try {
    await db.collection('tickets').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: 'مغلقة' } }
    );
    res.json({ message: 'closed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== API - سجل التتبع ====================
app.get('/api/logs', async (req, res) => {
  try {
    const logs = await db.collection('logs').find({}).sort({ createdAt: -1 }).toArray();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logs', async (req, res) => {
  try {
    const log = { ...req.body, createdAt: new Date() };
    const result = await db.collection('logs').insertOne(log);
    res.json({ id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== API - تصدير واستيراد ====================
app.get('/api/export-all', async (req, res) => {
  try {
    const vessels = await db.collection('vessels').find({}).toArray();
    const users = await db.collection('users').find({}).project({ pass: 0 }).toArray();
    const tickets = await db.collection('tickets').find({}).toArray();
    const logs = await db.collection('logs').find({}).toArray();
    res.json({ vessels, users, tickets, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/import-all', async (req, res) => {
  try {
    const { vessels, tickets, logs } = req.body;
    
    if (vessels && Array.isArray(vessels)) {
      await db.collection('vessels').deleteMany({});
      if (vessels.length > 0) await db.collection('vessels').insertMany(vessels);
    }
    
    if (tickets && Array.isArray(tickets)) {
      await db.collection('tickets').deleteMany({});
      if (tickets.length > 0) await db.collection('tickets').insertMany(tickets);
    }
    
    if (logs && Array.isArray(logs)) {
      await db.collection('logs').deleteMany({});
      if (logs.length > 0) await db.collection('logs').insertMany(logs);
    }
    
    res.json({ message: 'تم الاستيراد بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== تشغيل الخادم ====================
async function startServer() {
  db = await connectDB();
  
  app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
  });
}

startServer();
