const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// ========== نماذج MongoDB ==========

// نموذج المستخدم
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' }
});
const User = mongoose.model('User', userSchema);

// نموذج المركب
const vesselSchema = new mongoose.Schema({
    name: { type: String, required: true },
    number: { type: String, required: true, unique: true },
    length: { type: Number, default: 0 },
    category: { type: String, default: '' },
    region: { type: String, default: '' },
    zone: { type: String, default: '' },
    port: { type: String, default: '' },
    reinforcement: { type: String, default: '' },
    status: { type: String, default: 'نشط' },
    damage: { type: String, default: '' },
    damageDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    reference: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});
const Vessel = mongoose.model('Vessel', vesselSchema);

// ========== الاتصال بـ MongoDB Atlas ==========
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ تم الاتصال بـ MongoDB Atlas بنجاح');
        initializeDatabase();
    })
    .catch(err => {
        console.error('❌ خطأ في الاتصال بـ MongoDB:', err.message);
    });

// تهيئة قاعدة البيانات (إنشاء مستخدمين افتراضيين)
async function initializeDatabase() {
    try {
        // إنشاء مستخدم admin
        const adminExists = await User.findOne({ username: 'admin' });
        if (!adminExists) {
            await User.create({ username: 'admin', password: 'admin123', role: 'admin' });
            console.log('✅ تم إنشاء المستخدم: admin / admin123');
        }

        // إنشاء مستخدم user
        const userExists = await User.findOne({ username: 'user' });
        if (!userExists) {
            await User.create({ username: 'user', password: 'user123', role: 'user' });
            console.log('✅ تم إنشاء المستخدم: user / user123');
        }
    } catch (error) {
        console.error('خطأ في تهيئة قاعدة البيانات:', error);
    }
}

// ========== API Routes ==========

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const user = await User.findOne({ username, password });
        
        if (user) {
            res.json({ 
                success: true, 
                username: user.username,
                role: user.role 
            });
        } else {
            res.status(401).json({ 
                success: false, 
                message: 'اسم المستخدم أو كلمة المرور غير صحيحة' 
            });
        }
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'خطأ في الخادم' 
        });
    }
});

// جلب جميع المراكب
app.get('/api/vessels', async (req, res) => {
    try {
        const vessels = await Vessel.find().sort({ createdAt: -1 });
        res.json(vessels);
    } catch (error) {
        res.status(500).json({ 
            message: 'خطأ في جلب البيانات' 
        });
    }
});

// إضافة مركب جديد
app.post('/api/vessels', async (req, res) => {
    try {
        // التحقق من عدم وجود مركب بنفس الرقم
        const existingVessel = await Vessel.findOne({ number: req.body.number });
        if (existingVessel) {
            return res.status(400).json({ 
                message: 'مركب بنفس الرقم موجود بالفعل' 
            });
        }
        
        const vessel = new Vessel(req.body);
        await vessel.save();
        res.status(201).json(vessel);
    } catch (error) {
        res.status(500).json({ 
            message: 'خطأ في حفظ البيانات: ' + error.message 
        });
    }
});

// حذف مركب
app.delete('/api/vessels/:number', async (req, res) => {
    try {
        const result = await Vessel.findOneAndDelete({ number: req.params.number });
        if (result) {
            res.json({ message: 'تم الحذف بنجاح' });
        } else {
            res.status(404).json({ message: 'المركب غير موجود' });
        }
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الحذف' });
    }
});

// ========== تشغيل السيرفر ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`);
    console.log(`📡 http://localhost:${PORT}`);
});
