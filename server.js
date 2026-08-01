const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// ✅ حل مشكلة CSS
// ============================================================
app.use((req, res, next) => {
    if (req.url.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
    } else if (req.url.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
    }
    next();
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// ✅ البيانات (Mock Data)
// ============================================================
let vessels = [];
let users = [
    { id: 1, name: 'Admin', email: 'admin', role: 'مسؤول', isActive: true }
];
let tickets = [];
let notes = [];
let locations = [];

// ============================================================
// ✅ نظام الصيانة - البيانات
// ============================================================
let maintenanceRecords = [];
let nextMaintenanceId = 1;

const MAINTENANCE_UNITS = [
    'وحدة الصيانة والإسناد البحري تونس',
    'وحدة الصيانة والإسناد البحري صفاقس',
    'وحدة الصيانة والإسناد البحري المنستير',
    'وحدة الصيانة والإسناد البحري جرجيس',
    'شركة خاصة'
];

// ============================================================
// ✅ دوال مساعدة
// ============================================================
function getCurrentDate() {
    return new Date().toISOString().split('T')[0];
}

function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

function getCurrentDateTime() {
    return new Date().toISOString();
}

function determineCategory(len) {
    const n = parseFloat(len);
    if (isNaN(n)) return 'زوارق مزدوجة';
    if (n === 11) return 'البروق';
    if (n >= 8 && n <= 12) return 'صقور';
    if (n > 12 && n <= 25) return 'خوافر';
    if (n > 30) return 'طوافات';
    return 'زوارق مزدوجة';
}

function generateId() {
    return Date.now() + Math.random() * 1000;
}

// ============================================================
// ✅ API Routes - المصادقة
// ============================================================

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (email === 'admin' && password === '123456') {
        res.json({
            success: true,
            token: 'fake-token-' + Date.now(),
            user: { id: 1, name: 'Admin', email: 'admin', role: 'مسؤول' }
        });
    } else {
        res.status(401).json({ success: false, error: 'بيانات غير صحيحة' });
    }
});

app.get('/api/auth/me', (req, res) => {
    res.json({ success: true, user: { id: 1, name: 'Admin', email: 'admin', role: 'مسؤول' } });
});

// ============================================================
// 🚢 API Routes - المراكب
// ============================================================

app.get('/api/vessels', (req, res) => {
    res.json(vessels);
});

app.post('/api/vessels', (req, res) => {
    const data = req.body;
    
    const newVessel = {
        id: generateId(),
        name: data.name || 'مركب جديد',
        num: data.num || '',
        len: parseFloat(data.len) || 0,
        cat: determineCategory(data.len),
        reg: data.reg || '',
        zone: data.zone || '',
        port: data.port || '',
        supp: data.supp || '',
        stat: data.stat || 'صالح',
        break: data.break || '',
        fDate: data.fDate || '',
        eDate: data.eDate || '',
        ref: data.ref || '',
        repairer: data.repairer || '',
        maintenanceHistory: [],
        lastMaintenance: null,
        nextMaintenance: null
    };
    
    vessels.push(newVessel);
    
    // ✅ إذا كان المركب معطباً، أنشئ سجل صيانة تلقائي
    if (newVessel.stat === 'معطب' || newVessel.stat === 'صيانة') {
        const maintenanceRecord = {
            id: generateId(),
            vesselId: newVessel.id,
            vesselName: newVessel.name,
            vesselNum: newVessel.num,
            unit: newVessel.repairer || 'غير محدد',
            date: getCurrentDateTime(),
            type: 'طارئة',
            description: newVessel.break || 'عطل غير محدد',
            parts: [],
            technician: 'غير محدد',
            cost: 0,
            status: 'قيد الإنجاز',
            notes: 'تم إنشاء تلقائياً عند إضافة المركب',
            createdBy: 'Admin',
            completedAt: null,
            vesselStatus: newVessel.stat
        };
        maintenanceRecords.push(maintenanceRecord);
        
        newVessel.maintenanceHistory.push({
            maintenanceId: maintenanceRecord.id,
            date: maintenanceRecord.date,
            description: maintenanceRecord.description,
            status: 'قيد الإنجاز'
        });
    }
    
    res.status(201).json({ success: true, data: newVessel });
});

app.put('/api/vessels/:id', (req, res) => {
    const id = parseFloat(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'المركب غير موجود' });
    }
    
    const oldStat = vessels[index].stat;
    const newStat = req.body.stat;
    
    vessels[index] = { ...vessels[index], ...req.body };
    
    // ✅ إذا تغيرت الحالة من معطب إلى صالح
    if (oldStat !== 'صالح' && newStat === 'صالح') {
        maintenanceRecords.forEach(record => {
            if (record.vesselId === vessels[index].id && record.status === 'قيد الإنجاز') {
                record.status = 'مكتملة';
                record.completedAt = getCurrentDateTime();
                record.notes = (record.notes || '') + ' - تم إكمال الصيانة تلقائياً عند تغيير حالة المركب';
            }
        });
        
        vessels[index].maintenanceHistory.forEach(record => {
            if (record.status === 'قيد الإنجاز') {
                record.status = 'مكتملة';
            }
        });
        
        vessels[index].lastMaintenance = getCurrentDateTime();
    }
    
    // ✅ إذا تغيرت الحالة إلى معطب أو صيانة
    if (newStat === 'معطب' || newStat === 'صيانة') {
        const hasOpenRecord = maintenanceRecords.some(r => 
            r.vesselId === vessels[index].id && r.status === 'قيد الإنجاز'
        );
        
        if (!hasOpenRecord) {
            const maintenanceRecord = {
                id: generateId(),
                vesselId: vessels[index].id,
                vesselName: vessels[index].name,
                vesselNum: vessels[index].num,
                unit: vessels[index].repairer || 'غير محدد',
                date: getCurrentDateTime(),
                type: 'طارئة',
                description: vessels[index].break || 'عطل غير محدد',
                parts: [],
                technician: 'غير محدد',
                cost: 0,
                status: 'قيد الإنجاز',
                notes: 'تم إنشاء تلقائياً عند تغيير حالة المركب',
                createdBy: 'Admin',
                completedAt: null,
                vesselStatus: newStat
            };
            maintenanceRecords.push(maintenanceRecord);
            
            vessels[index].maintenanceHistory.push({
                maintenanceId: maintenanceRecord.id,
                date: maintenanceRecord.date,
                description: maintenanceRecord.description,
                status: 'قيد الإنجاز'
            });
        }
    }
    
    res.json({ success: true, data: vessels[index] });
});

app.delete('/api/vessels/:id', (req, res) => {
    const id = parseFloat(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'المركب غير موجود' });
    }
    
    maintenanceRecords = maintenanceRecords.filter(r => r.vesselId !== vessels[index].id);
    vessels.splice(index, 1);
    
    res.json({ success: true, message: 'تم الحذف' });
});

// ============================================================
// 🔧 API Routes - نظام الصيانة
// ============================================================

// جلب جميع سجلات الصيانة
app.get('/api/maintenance', (req, res) => {
    res.json(maintenanceRecords);
});

// جلب سجلات صيانة مركب معين
app.get('/api/maintenance/vessel/:vesselId', (req, res) => {
    const vesselId = parseFloat(req.params.vesselId);
    const records = maintenanceRecords.filter(r => r.vesselId === vesselId);
    res.json(records);
});

// جلب سجلات صيانة حسب الوحدة
app.get('/api/maintenance/unit/:unit', (req, res) => {
    const unit = decodeURIComponent(req.params.unit);
    const records = maintenanceRecords.filter(r => r.unit === unit);
    res.json(records);
});

// إنشاء سجل صيانة جديد
app.post('/api/maintenance', (req, res) => {
    const data = req.body;
    
    const vessel = vessels.find(v => v.id === data.vesselId);
    if (!vessel) {
        return res.status(404).json({ success: false, error: 'المركب غير موجود' });
    }
    
    const newRecord = {
        id: generateId(),
        vesselId: vessel.id,
        vesselName: vessel.name,
        vesselNum: vessel.num,
        unit: data.unit || vessel.repairer || 'غير محدد',
        date: getCurrentDateTime(),
        type: data.type || 'عادية',
        description: data.description || 'صيانة',
        parts: data.parts || [],
        technician: data.technician || 'غير محدد',
        cost: data.cost || 0,
        status: 'قيد الإنجاز',
        notes: data.notes || '',
        createdBy: data.createdBy || 'Admin',
        completedAt: null,
        vesselStatus: vessel.stat
    };
    
    maintenanceRecords.push(newRecord);
    
    vessel.stat = 'صيانة';
    vessel.break = data.description || 'صيانة';
    vessel.maintenanceHistory.push({
        maintenanceId: newRecord.id,
        date: newRecord.date,
        description: newRecord.description,
        status: 'قيد الإنجاز'
    });
    
    res.status(201).json({ success: true, data: newRecord });
});

// تحديث سجل صيانة (كامل)
app.put('/api/maintenance/:id', (req, res) => {
    const id = parseFloat(req.params.id);
    const index = maintenanceRecords.findIndex(r => r.id === id);
    
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'سجل الصيانة غير موجود' });
    }
    
    const record = maintenanceRecords[index];
    const data = req.body;
    
    // تحديث البيانات
    if (data.unit) record.unit = data.unit;
    if (data.type) record.type = data.type;
    if (data.description) record.description = data.description;
    if (data.technician) record.technician = data.technician;
    if (data.cost !== undefined) record.cost = data.cost;
    if (data.notes) record.notes = data.notes;
    if (data.parts) record.parts = data.parts;
    
    // تحديث المركب إذا تغيرت الوحدة
    if (data.unit) {
        const vessel = vessels.find(v => v.id === record.vesselId);
        if (vessel) {
            vessel.repairer = data.unit;
        }
    }
    
    res.json({ success: true, data: record });
});

// إكمال الصيانة
app.put('/api/maintenance/:id/complete', (req, res) => {
    const id = parseFloat(req.params.id);
    const index = maintenanceRecords.findIndex(r => r.id === id);
    
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'سجل الصيانة غير موجود' });
    }
    
    const record = maintenanceRecords[index];
    
    record.status = 'مكتملة';
    record.completedAt = getCurrentDateTime();
    if (req.body.notes) record.notes = (record.notes || '') + ' - ' + req.body.notes;
    if (req.body.cost !== undefined) record.cost = req.body.cost;
    if (req.body.parts) record.parts = req.body.parts;
    if (req.body.technician) record.technician = req.body.technician;
    
    const vessel = vessels.find(v => v.id === record.vesselId);
    if (vessel) {
        vessel.stat = 'صالح';
        vessel.lastMaintenance = getCurrentDateTime();
        
        vessel.maintenanceHistory.forEach(record => {
            if (record.maintenanceId === id) {
                record.status = 'مكتملة';
            }
        });
    }
    
    res.json({ success: true, data: record });
});

// إلغاء سجل صيانة
app.put('/api/maintenance/:id/cancel', (req, res) => {
    const id = parseFloat(req.params.id);
    const index = maintenanceRecords.findIndex(r => r.id === id);
    
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'سجل الصيانة غير موجود' });
    }
    
    maintenanceRecords[index].status = 'ملغية';
    maintenanceRecords[index].notes = (maintenanceRecords[index].notes || '') + ' - تم الإلغاء';
    
    res.json({ success: true, message: 'تم إلغاء سجل الصيانة' });
});

// حذف سجل صيانة
app.delete('/api/maintenance/:id', (req, res) => {
    const id = parseFloat(req.params.id);
    const index = maintenanceRecords.findIndex(r => r.id === id);
    
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'سجل الصيانة غير موجود' });
    }
    
    maintenanceRecords.splice(index, 1);
    res.json({ success: true, message: 'تم الحذف' });
});

// إحصائيات الصيانة
app.get('/api/maintenance/stats', (req, res) => {
    const total = maintenanceRecords.length;
    const inProgress = maintenanceRecords.filter(r => r.status === 'قيد الإنجاز').length;
    const completed = maintenanceRecords.filter(r => r.status === 'مكتملة').length;
    const cancelled = maintenanceRecords.filter(r => r.status === 'ملغية').length;
    
    const unitStats = {};
    MAINTENANCE_UNITS.forEach(unit => {
        const records = maintenanceRecords.filter(r => r.unit === unit);
        unitStats[unit] = {
            total: records.length,
            completed: records.filter(r => r.status === 'مكتملة').length,
            inProgress: records.filter(r => r.status === 'قيد الإنجاز').length
        };
    });
    
    res.json({
        total,
        inProgress,
        completed,
        cancelled,
        unitStats
    });
});

// ============================================================
// 👥 API Routes - المستخدمين
// ============================================================

app.get('/api/users', (req, res) => {
    res.json(users);
});

app.post('/api/users', (req, res) => {
    const data = req.body;
    const newUser = {
        id: generateId(),
        name: data.name || 'مستخدم جديد',
        email: data.email || data.name?.toLowerCase().replace(/\s/g, '') + '@test.com',
        role: data.role || 'مشاهد',
        isActive: true
    };
    users.push(newUser);
    res.status(201).json({ success: true, data: newUser });
});

app.put('/api/users/:id', (req, res) => {
    const id = parseFloat(req.params.id);
    const user = users.find(u => u.id === id);
    if (!user) {
        return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }
    Object.assign(user, req.body);
    res.json({ success: true, data: user });
});

app.delete('/api/users/:id', (req, res) => {
    const id = parseFloat(req.params.id);
    const index = users.findIndex(u => u.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }
    users.splice(index, 1);
    res.json({ success: true, message: 'تم الحذف' });
});

// ============================================================
// 🎫 API Routes - التذاكر
// ============================================================

app.get('/api/tickets', (req, res) => {
    res.json(tickets);
});

app.post('/api/tickets', (req, res) => {
    const data = req.body;
    const newTicket = {
        id: generateId(),
        subject: data.subject || 'موضوع جديد',
        message: data.message || '',
        status: 'قيد المعالجة',
        userName: 'Admin',
        date: getCurrentDate(),
        time: getCurrentTime(),
        replies: []
    };
    tickets.push(newTicket);
    res.status(201).json({ success: true, data: newTicket });
});

// ============================================================
// 📝 API Routes - المذكرات
// ============================================================

app.get('/api/notes', (req, res) => {
    res.json(notes);
});

app.post('/api/notes', (req, res) => {
    const data = req.body;
    const newNote = {
        id: generateId(),
        title: data.title || 'مذكرة جديدة',
        content: data.content || '',
        date: data.date || getCurrentDate(),
        time: getCurrentTime(),
        week: '1',
        createdBy: 'Admin'
    };
    notes.push(newNote);
    res.status(201).json({ success: true, data: newNote });
});

app.delete('/api/notes/:id', (req, res) => {
    const id = parseFloat(req.params.id);
    const index = notes.findIndex(n => n.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'المذكرة غير موجودة' });
    }
    notes.splice(index, 1);
    res.json({ success: true, message: 'تم الحذف' });
});

app.get('/api/notes/latest', (req, res) => {
    res.json(notes.length > 0 ? notes[notes.length - 1] : null);
});

// ============================================================
// 📍 API Routes - المواقع
// ============================================================

app.get('/api/locations', (req, res) => {
    res.json(locations);
});

app.post('/api/locations', (req, res) => {
    const { lat, lng } = req.body;
    const newLocation = {
        id: generateId(),
        userName: 'Admin',
        lat: parseFloat(lat) || 0,
        lng: parseFloat(lng) || 0,
        timestamp: new Date()
    };
    locations.push(newLocation);
    res.status(201).json({ success: true, data: newLocation });
});

// ============================================================
// ❤️ Health Check
// ============================================================

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        vessels: vessels.length,
        maintenance: maintenanceRecords.length,
        users: users.length
    });
});

// ============================================================
// 🏠 الصفحة الرئيسية
// ============================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// 🚀 تشغيل السيرفر
// ============================================================

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server: http://localhost:${PORT}`);
    console.log(`📧 admin / 🔑 123456`);
    console.log(`🔧 وحدات الصيانة المدعومة: ${MAINTENANCE_UNITS.join(', ')}`);
    console.log(`✅ نظام الصيانة متكامل مع إمكانية التعديل`);
});
// أضف هذا بعد تعريف vessels وقبل app.listen
if (vessels.length === 0) {
    const sampleVessels = [
        { id: 1, name: 'البروق 1', num: '101', len: 11, cat: 'البروق', reg: 'الشمال', zone: 'بنزرت', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', repairer: 'وحدة الصيانة تونس' },
        { id: 2, name: 'البروق 2', num: '102', len: 11, cat: 'البروق', reg: 'الساحل', zone: 'سوسة', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', repairer: 'وحدة الصيانة صفاقس' },
        { id: 3, name: 'البروق 3', num: '103', len: 11, cat: 'البروق', reg: 'الوسط', zone: 'صفاقس', stat: 'معطب', break: 'عطل محرك', fDate: '2026-07-01', eDate: '', ref: '', repairer: 'وحدة الصيانة صفاقس' },
        { id: 4, name: 'الصقر 1', num: '201', len: 10, cat: 'صقور', reg: 'الشمال', zone: 'طبرقة', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', repairer: 'وحدة الصيانة تونس' },
        { id: 5, name: 'الصقر 2', num: '202', len: 10, cat: 'صقور', reg: 'الساحل', zone: 'المنستير', stat: 'معطب', break: 'عطل كهرباء', fDate: '2026-07-05', eDate: '', ref: '', repairer: 'وحدة الصيانة صفاقس' },
        { id: 6, name: 'الخفارة 1', num: '301', len: 20, cat: 'خوافر', reg: 'الوسط', zone: 'جربة', stat: 'صيانة', break: 'صيانة دورية', fDate: '2026-07-10', eDate: '', ref: '', repairer: 'وحدة الصيانة المنستير' },
        { id: 7, name: 'الخفارة 2', num: '302', len: 20, cat: 'خوافر', reg: 'الجنوب', zone: 'جرجيس', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', repairer: 'وحدة الصيانة جرجيس' },
        { id: 8, name: 'الطوافة 1', num: '401', len: 35, cat: 'طوافات', reg: 'الشمال', zone: 'المرسى', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', repairer: 'وحدة الصيانة تونس' },
        { id: 9, name: 'الزورق 1', num: '501', len: 5, cat: 'زوارق مزدوجة', reg: 'الساحل', zone: 'المهدية', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', repairer: 'شركة خاصة' },
        { id: 10, name: 'الزورق 2', num: '502', len: 5, cat: 'زوارق مزدوجة', reg: 'الجنوب', zone: 'بن قردان', stat: 'معطب', break: 'عطل هيكل', fDate: '2026-07-15', eDate: '', ref: '', repairer: 'شركة خاصة' },
    ];
    vessels = sampleVessels;
    console.log('✅ تم إضافة 10 مراكب تجريبية');
}
