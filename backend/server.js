// إضافة استيراد mongoose والنماذج
const mongoose = require('mongoose');
const User = require('./models/User');
const Vessel = require('./models/Vessel');
const Maintenance = require('./models/Maintenance');
const Ticket = require('./models/Ticket');
const Note = require('./models/Note');

// إضافة اتصال MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ MongoDB Error:', err));

// تعديل دوال CRUD لاستخدام MongoDB بدلاً من JSON
app.get('/api/vessels', async (req, res) => {
    try {
        const vessels = await Vessel.find();
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
