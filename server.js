const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// ==================== Middlewares ====================
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static('public'));

// ==================== حماية من أخطاء مفاجئة ====================
process.on('uncaughtException', (err) => {
    console.error("❌ UNCAUGHT EXCEPTION:", err);
});

process.on('unhandledRejection', (err) => {
    console.error("❌ UNHANDLED REJECTION:", err);
});

// ==================== MongoDB ====================
async function connectDB() {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error("MONGO_URI غير موجود في Environment Variables");
        }

        await mongoose.connect(process.env.MONGO_URI);

        console.log("✅ تم الاتصال بـ MongoDB Atlas");
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err);
        process.exit(1);
    }
}

// ==================== Routes بسيطة للتجربة ====================
app.get('/', (req, res) => {
    res.send('🚀 Server is running successfully');
});

// ==================== Tickets Model (اختياري إذا عندك) ====================
const ticketSchema = new mongoose.Schema({
    userName: String,
    userRole: String,
    subject: String,
    message: String,
    date: String,
    time: String,
    status: { type: String, default: 'قيد المعالجة' },
    replies: Array
});

const Ticket = mongoose.model('Ticket', ticketSchema);

// ==================== API ====================

// جلب التذاكر
app.get('/api/tickets', async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ _id: -1 });
        res.json(tickets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// إنشاء تذكرة
app.post('/api/tickets', async (req, res) => {
    try {
        const ticket = new Ticket(req.body);
        await ticket.save();
        res.json(ticket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// رد على تذكرة
app.put('/api/tickets/:id/reply', async (req, res) => {
    try {
        const { id } = req.params;

        const ticket = await Ticket.findById(id);
        if (!ticket) return res.status(404).json({ error: "Ticket not found" });

        ticket.replies.push(req.body.reply);
        ticket.status = "تم الرد";

        await ticket.save();

        res.json(ticket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// إغلاق تذكرة
app.put('/api/tickets/:id/close', async (req, res) => {
    try {
        const { id } = req.params;

        const ticket = await Ticket.findById(id);
        if (!ticket) return res.status(404).json({ error: "Ticket not found" });

        ticket.status = "مغلقة";

        await ticket.save();

        res.json(ticket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== تشغيل السيرفر ====================
const PORT = process.env.PORT || 3000;

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log("🚀 السيرفر يعمل على المنفذ", PORT);
        console.log("📡 http://localhost:" + PORT);
    });
});
