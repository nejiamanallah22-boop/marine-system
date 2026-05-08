const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== ملفات التخزين الدائم ====================
// Render يستخدم قرص مؤقت، نحتاج لحل لتخزين البيانات

// الطريقة 1: تخزين في ملف JSON (يعمل على Render)
const DATA_FILE = path.join(__dirname, 'data.json');

// تحميل البيانات من الملف
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('خطأ في تحميل البيانات:', error);
    }
    
    // بيانات افتراضية
    return {
        vessels: [
            { id: 101, name: "البروق 1", num: "B001", len: 11, reg: "الشمال", zone: "تونس", port: "تونس", supp: "قاعدة الشمال", stat: "صالح", break: "", fDate: null, eDate: null, ref: "", cat: "البروق" },
            { id: 102, name: "صقر 1", num: "S001", len: 10, reg: "الساحل", zone: "سوسة", port: "سوسة", supp: "قاعدة الساحل", stat: "صالح", break: "", fDate: null, eDate: null, ref: "", cat: "صقور" },
            { id: 103, name: "خافرة 1", num: "K001", len: 20, reg: "الوسط", zone: "صفاقس", port: "صفاقس", supp: "قاعدة الوسط", stat: "معطب", break: "عطل في المحرك", fDate: "2025-03-10", eDate: "2025-04-10", ref: "REF001", cat: "خوافر" },
            { id: 104, name: "زورق 1", num: "Z001", len: 15, reg: "الجنوب", zone: "جربة", port: "جربة", supp: "قاعدة الجنوب", stat: "صيانة", break: "صيانة دورية", fDate: "2025-03-15", eDate: "2025-04-05", ref: "REF002", cat: "زوارق مزدوجة" },
            { id: 105, name: "طوافة 1", num: "T001", len: 35, reg: "الشمال", zone: "بنزرت", port: "بنزرت", supp: "قاعدة الشمال", stat: "صالح", break: "", fDate: null, eDate: null, ref: "", cat: "طوافات" },
            { id: 106, name: "البروق 2", num: "B002", len: 11, reg: "الساحل", zone: "المنستير", port: "المنستير", supp: "قاعدة الساحل", stat: "معطب", break: "عطل في الكهرباء", fDate: "2025-03-20", eDate: "2025-04-15", ref: "REF003", cat: "البروق" },
            { id: 107, name: "صقر 2", num: "S002", len: 9, reg: "الوسط", zone: "المهدية", port: "المهدية", supp: "قاعدة الوسط", stat: "صيانة", break: "تغيير زيوت", fDate: "2025-03-25", eDate: "2025-04-08", ref: "REF004", cat: "صقور" },
            { id: 108, name: "خافرة 2", num: "K002", len: 22, reg: "الجنوب", zone: "قابس", port: "قابس", supp: "قاعدة الجنوب", stat: "صالح", break: "", fDate: null, eDate: null, ref: "", cat: "خوافر" },
            { id: 109, name: "زورق 2", num: "Z002", len: 8, reg: "الشمال", zone: "طبرقة", port: "طبرقة", supp: "قاعدة الشمال", stat: "معطب", break: "عطل في المضخة", fDate: "2025-03-05", eDate: "2025-04-20", ref: "REF005", cat: "زوارق مزدوجة" },
            { id: 110, name: "طوافة 2", num: "T002", len: 40, reg: "الساحل", zone: "نابل", port: "نابل", supp: "قاعدة الساحل", stat: "صيانة", break: "صيانة شاملة", fDate: "2025-03-01", eDate: "2025-04-25", ref: "REF006", cat: "طوافات" }
        ],
        users: [
            { id: 1, name: "admin", password: "1234", role: "مسؤول", enabled: true },
            { id: 2, name: "editor", password: "1234", role: "محرر", enabled: true },
            { id: 3, name: "viewer", password: "1234", role: "مشاهد", enabled: true }
        ],
        logs: [],
        tickets: [],
        nextId: 111
    };
}

// حفظ البيانات في الملف
function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('✅ تم حفظ البيانات');
    } catch (error) {
        console.error('❌ خطأ في حفظ البيانات:', error);
    }
}

// تحميل البيانات عند بدء التشغيل
let db = loadData();

// حفظ البيانات كل دقيقة (احتياطي)
setInterval(() => {
    saveData(db);
}, 60000);

// ==================== إعدادات الخادم ====================
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==================== دوال مساعدة ====================
function getCategoryFromLength(len) {
    const n = parseFloat(len);
    if (n === 11) return "البروق";
    if (n >= 8 && n <= 12) return "صقور";
    if (n > 12 && n <= 25) return "خوافر";
    if (n >= 30) return "طوافات";
    return "زوارق مزدوجة";
}

function logActivity(user, action, details) {
    db.logs.unshift({
        id: Date.now(),
        userName: user.name,
        userRole: user.role,
        action: action,
        details: details,
        date: new Date().toLocaleDateString('ar-TN'),
        time: new Date().toLocaleTimeString('ar-TN')
    });
    if (db.logs.length > 500) db.logs.pop();
    saveData(db);
}

// ==================== مسارات API ====================

// تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    const user = db.users.find(u => u.name === username && u.password === password);
    
    if (!user) {
        return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    }
    
    if (!user.enabled) {
        return res.status(401).json({ error: "هذا المستخدم معطل" });
    }
    
    logActivity(user, "تسجيل دخول", "قام بتسجيل الدخول");
    
    res.json({
        success: true,
        user: {
            id: user.id,
            name: user.name,
            role: user.role
        }
    });
});

// جلب جميع المراكب
app.get('/api/vessels', (req, res) => {
    res.json(db.vessels);
});

// إضافة مركب جديد
app.post('/api/vessels', (req, res) => {
    const { user, vessel } = req.body;
    
    // التحقق من الصلاحية
    if (user.role === 'مشاهد') {
        return res.status(403).json({ error: "ليس لديك صلاحية للإضافة" });
    }
    
    if (!vessel.name) {
        return res.status(400).json({ error: "اسم المركب مطلوب" });
    }
    
    if ((vessel.stat === 'معطب' || vessel.stat === 'صيانة') && !vessel.fDate) {
        return res.status(400).json({ error: "تاريخ العطب إلزامي" });
    }
    
    const newVessel = {
        id: db.nextId++,
        ...vessel,
        cat: getCategoryFromLength(vessel.len)
    };
    
    db.vessels.push(newVessel);
    saveData(db);
    logActivity(user, "إضافة مركب", `قام بإضافة مركب: ${vessel.name}`);
    
    res.json({ success: true, vessel: newVessel });
});

// تعديل مركب
app.put('/api/vessels/:id', (req, res) => {
    const { user, vessel } = req.body;
    const id = parseInt(req.params.id);
    
    if (user.role === 'مشاهد') {
        return res.status(403).json({ error: "ليس لديك صلاحية للتعديل" });
    }
    
    const index = db.vessels.findIndex(v => v.id === id);
    if (index === -1) {
        return res.status(404).json({ error: "المركب غير موجود" });
    }
    
    db.vessels[index] = {
        ...db.vessels[index],
        ...vessel,
        cat: getCategoryFromLength(vessel.len)
    };
    
    saveData(db);
    logActivity(user, "تعديل مركب", `قام بتعديل مركب: ${vessel.name}`);
    
    res.json({ success: true, vessel: db.vessels[index] });
});

// حذف مركب
app.delete('/api/vessels/:id', (req, res) => {
    const { user } = req.body;
    const id = parseInt(req.params.id);
    
    if (user.role !== 'مسؤول') {
        return res.status(403).json({ error: "ليس لديك صلاحية للحذف" });
    }
    
    const vessel = db.vessels.find(v => v.id === id);
    if (!vessel) {
        return res.status(404).json({ error: "المركب غير موجود" });
    }
    
    db.vessels = db.vessels.filter(v => v.id !== id);
    saveData(db);
    logActivity(user, "حذف مركب", `قام بحذف مركب: ${vessel.name}`);
    
    res.json({ success: true });
});

// جلب المستخدمين
app.get('/api/users', (req, res) => {
    const { user } = req.query;
    const parsedUser = JSON.parse(user);
    
    if (parsedUser.role !== 'مسؤول') {
        return res.status(403).json({ error: "غير مصرح" });
    }
    
    const safeUsers = db.users.map(u => ({
        id: u.id,
        name: u.name,
        role: u.role,
        enabled: u.enabled
    }));
    
    res.json(safeUsers);
});

// إضافة مستخدم
app.post('/api/users', (req, res) => {
    const { adminUser, newUser } = req.body;
    
    if (adminUser.role !== 'مسؤول') {
        return res.status(403).json({ error: "غير مصرح" });
    }
    
    if (db.users.find(u => u.name === newUser.name)) {
        return res.status(400).json({ error: "المستخدم موجود" });
    }
    
    const user = {
        id: Date.now(),
        ...newUser,
        enabled: true
    };
    
    db.users.push(user);
    saveData(db);
    logActivity(adminUser, "إضافة مستخدم", `قام بإضافة مستخدم: ${newUser.name}`);
    
    res.json({ success: true, user });
});

// تغيير كلمة المرور
app.put('/api/users/:id/password', (req, res) => {
    const { adminUser, newPassword } = req.body;
    const id = parseInt(req.params.id);
    
    if (adminUser.role !== 'مسؤول') {
        return res.status(403).json({ error: "غير مصرح" });
    }
    
    const user = db.users.find(u => u.id === id);
    if (user) {
        user.password = newPassword;
        saveData(db);
        logActivity(adminUser, "تغيير كلمة مرور", `قام بتغيير كلمة مرور المستخدم: ${user.name}`);
    }
    
    res.json({ success: true });
});

// تعطيل/تفعيل مستخدم
app.patch('/api/users/:id/toggle', (req, res) => {
    const { adminUser } = req.body;
    const id = parseInt(req.params.id);
    
    if (adminUser.role !== 'مسؤول') {
        return res.status(403).json({ error: "غير مصرح" });
    }
    
    const user = db.users.find(u => u.id === id);
    if (user) {
        user.enabled = !user.enabled;
        saveData(db);
        logActivity(adminUser, `${user.enabled ? 'تفعيل' : 'تعطيل'} مستخدم`, `قام ${user.enabled ? 'بتفعيل' : 'بتعطيل'} المستخدم: ${user.name}`);
    }
    
    res.json({ success: true });
});

// حذف مستخدم
app.delete('/api/users/:id', (req, res) => {
    const { adminUser } = req.body;
    const id = parseInt(req.params.id);
    
    if (adminUser.role !== 'مسؤول') {
        return res.status(403).json({ error: "غير مصرح" });
    }
    
    const user = db.users.find(u => u.id === id);
    if (user) {
        db.users = db.users.filter(u => u.id !== id);
        saveData(db);
        logActivity(adminUser, "حذف مستخدم", `قام بحذف المستخدم: ${user.name}`);
    }
    
    res.json({ success: true });
});

// جلب سجل التتبع
app.get('/api/logs', (req, res) => {
    const { user } = req.query;
    const parsedUser = JSON.parse(user);
    
    if (parsedUser.role !== 'مسؤول') {
        return res.status(403).json({ error: "غير مصرح" });
    }
    
    res.json(db.logs);
});

// جلب الإحصائيات
app.get('/api/statistics', (req, res) => {
    const total = db.vessels.length;
    const ok = db.vessels.filter(v => v.stat === 'صالح').length;
    const maint = db.vessels.filter(v => v.stat === 'صيانة').length;
    const broken = db.vessels.filter(v => v.stat === 'معطب').length;
    
    res.json({ total, ok, maint, broken });
});

// جلب المناطق
app.get('/api/zones', (req, res) => {
    const zones = {
        "الشمال": ["تونس", "بنزرت", "طبرقة"],
        "الساحل": ["سوسة", "المنستير", "نابل"],
        "الوسط": ["صفاقس", "المهدية", "قرقنة"],
        "الجنوب": ["جرجيس", "جربة", "قابس"]
    };
    res.json(zones);
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
});
