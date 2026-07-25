const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// ✅ حل مشكلة CSS و JS
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

// مجلد الرفع
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ============================================================
// ✅ البيانات (Mock Data)
// ============================================================
let vessels = [];
let users = [
    { 
        id: 1, 
        name: 'Admin', 
        email: 'admin', 
        role: 'مسؤول', 
        isActive: true 
    }
];
let tickets = [];
let notes = [];
let locations = [];
let maintenanceRecords = [];

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
function getCurrentDateTime() {
    return new Date().toISOString();
}

function getCurrentDate() {
    return new Date().toISOString().split('T')[0];
}

function getCurrentTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
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
    return Math.floor(Date.now() + Math.random() * 10000);
}

// ============================================================
// ✅ Middleware للمصادقة
// ============================================================
function authenticate(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, error: 'غير مصرح به' });
    }
    if (!token.startsWith('fake-token-')) {
        return res.status(401).json({ success: false, error: 'توكن غير صالح' });
    }
    req.user = { id: 1, name: 'Admin', role: 'مسؤول' };
    next();
}

function requireRole(role) {
    return (req, res, next) => {
        if (req.user?.role !== role && req.user?.role !== 'مسؤول') {
            return res.status(403).json({ success: false, error: 'صلاحيات غير كافية' });
        }
        next();
    };
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

app.get('/api/auth/me', authenticate, (req, res) => {
    res.json({ success: true, user: req.user });
});

// ============================================================
// 🚢 API Routes - المراكب
// ============================================================

app.get('/api/vessels', (req, res) => {
    res.json(vessels);
});

app.post('/api/vessels', authenticate, (req, res) => {
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
        nextMaintenance: null,
        createdAt: getCurrentDateTime()
    };
    
    vessels.push(newVessel);
    
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

app.put('/api/vessels/:id', authenticate, (req, res) => {
    const id = parseFloat(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'المركب غير موجود' });
    }
    
    const oldStat = vessels[index].stat;
    const newStat = req.body.stat;
    
    vessels[index] = { ...vessels[index], ...req.body };
    
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

app.delete('/api/vessels/:id', authenticate, requireRole('مسؤول'), (req, res) => {
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

app.get('/api/maintenance', (req, res) => {
    res.json(maintenanceRecords);
});

app.get('/api/maintenance/filter', (req, res) => {
    let filtered = [...maintenanceRecords];
    
    if (req.query.unit) {
        filtered = filtered.filter(r => r.unit === req.query.unit);
    }
    if (req.query.dateFrom) {
        filtered = filtered.filter(r => r.date >= req.query.dateFrom);
    }
    if (req.query.dateTo) {
        filtered = filtered.filter(r => r.date <= req.query.dateTo);
    }
    if (req.query.status) {
        filtered = filtered.filter(r => r.status === req.query.status);
    }
    
    res.json(filtered);
});

app.get('/api/maintenance/vessel/:vesselId', (req, res) => {
    const vesselId = parseFloat(req.params.vesselId);
    const records = maintenanceRecords.filter(r => r.vesselId === vesselId);
    res.json(records);
});

app.get('/api/maintenance/unit/:unit', (req, res) => {
    const unit = decodeURIComponent(req.params.unit);
    const records = maintenanceRecords.filter(r => r.unit === unit);
    res.json(records);
});

app.post('/api/maintenance', authenticate, (req, res) => {
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

app.put('/api/maintenance/:id', authenticate, (req, res) => {
    const id = parseFloat(req.params.id);
    const index = maintenanceRecords.findIndex(r => r.id === id);
    
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'سجل الصيانة غير موجود' });
    }
    
    const record = maintenanceRecords[index];
    const data = req.body;
    
    if (data.unit) record.unit = data.unit;
    if (data.type) record.type = data.type;
    if (data.description) record.description = data.description;
    if (data.technician) record.technician = data.technician;
    if (data.cost !== undefined) record.cost = data.cost;
    if (data.notes) record.notes = data.notes;
    if (data.parts) record.parts = data.parts;
    
    if (data.unit) {
        const vessel = vessels.find(v => v.id === record.vesselId);
        if (vessel) {
            vessel.repairer = data.unit;
        }
    }
    
    res.json({ success: true, data: record });
});

app.put('/api/maintenance/:id/complete', authenticate, (req, res) => {
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

app.put('/api/maintenance/:id/cancel', authenticate, (req, res) => {
    const id = parseFloat(req.params.id);
    const index = maintenanceRecords.findIndex(r => r.id === id);
    
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'سجل الصيانة غير موجود' });
    }
    
    maintenanceRecords[index].status = 'ملغية';
    maintenanceRecords[index].notes = (maintenanceRecords[index].notes || '') + ' - تم الإلغاء';
    
    res.json({ success: true, message: 'تم إلغاء سجل الصيانة' });
});

app.delete('/api/maintenance/:id', authenticate, requireRole('مسؤول'), (req, res) => {
    const id = parseFloat(req.params.id);
    const index = maintenanceRecords.findIndex(r => r.id === id);
    
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'سجل الصيانة غير موجود' });
    }
    
    maintenanceRecords.splice(index, 1);
    res.json({ success: true, message: 'تم الحذف' });
});

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
// 📝 API Routes - المذكرات
// ============================================================

app.post('/api/notes/upload', authenticate, (req, res) => {
    res.json({ 
        success: true, 
        files: [
            { 
                name: 'ملف مرفق.pdf', 
                url: '/uploads/sample.pdf', 
                type: 'application/pdf', 
                size: 1024,
                filename: 'sample.pdf'
            }
        ] 
    });
});

app.get('/api/notes', (req, res) => {
    res.json(notes);
});

app.post('/api/notes', authenticate, (req, res) => {
    const data = req.body;
    const newNote = {
        id: generateId(),
        title: data.title || 'مذكرة جديدة',
        content: data.content || '',
        date: data.date || getCurrentDate(),
        time: getCurrentTime(),
        week: data.week || '1',
        createdBy: req.user.name || 'Admin',
        attachments: data.attachments || [],
        createdAt: getCurrentDateTime()
    };
    notes.push(newNote);
    res.status(201).json({ success: true, data: newNote });
});

app.delete('/api/notes/:id', authenticate, requireRole('مسؤول'), (req, res) => {
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
// 👥 API Routes - المستخدمين
// ============================================================

app.get('/api/users', authenticate, (req, res) => {
    res.json(users.map(u => ({ ...u, password: undefined })));
});

app.post('/api/users', authenticate, requireRole('مسؤول'), (req, res) => {
    const data = req.body;
    const newUser = {
        id: generateId(),
        name: data.name || 'مستخدم جديد',
        email: data.email || data.name?.toLowerCase().replace(/\s/g, '') + '@test.com',
        role: data.role || 'مشاهد',
        isActive: true,
        createdAt: getCurrentDateTime()
    };
    users.push(newUser);
    res.status(201).json({ success: true, data: { ...newUser, password: undefined } });
});

app.put('/api/users/:id', authenticate, (req, res) => {
    const id = parseFloat(req.params.id);
    const user = users.find(u => u.id === id);
    if (!user) {
        return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }
    Object.assign(user, req.body);
    res.json({ success: true, data: { ...user, password: undefined } });
});

app.delete('/api/users/:id', authenticate, requireRole('مسؤول'), (req, res) => {
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

app.get('/api/tickets', authenticate, (req, res) => {
    res.json(tickets);
});

app.post('/api/tickets', authenticate, (req, res) => {
    const data = req.body;
    const newTicket = {
        id: generateId(),
        subject: data.subject || 'موضوع جديد',
        message: data.message || '',
        status: 'قيد المعالجة',
        userName: req.user.name || 'Admin',
        date: getCurrentDate(),
        time: getCurrentTime(),
        replies: [],
        createdAt: getCurrentDateTime()
    };
    tickets.push(newTicket);
    res.status(201).json({ success: true, data: newTicket });
});

// ============================================================
// 📍 API Routes - المواقع
// ============================================================

app.get('/api/locations', (req, res) => {
    res.json(locations);
});

app.post('/api/locations', authenticate, (req, res) => {
    const { lat, lng } = req.body;
    const newLocation = {
        id: generateId(),
        userName: req.user.name || 'Admin',
        lat: parseFloat(lat) || 0,
        lng: parseFloat(lng) || 0,
        timestamp: getCurrentDateTime()
    };
    locations.push(newLocation);
    if (locations.length > 100) {
        locations = locations.slice(-100);
    }
    res.status(201).json({ success: true, data: newLocation });
});

app.delete('/api/locations', authenticate, requireRole('مسؤول'), (req, res) => {
    locations = [];
    res.json({ success: true, message: 'تم مسح جميع المواقع' });
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
        users: users.length,
        notes: notes.length
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
    console.log(`✅ نظام الصيانة متكامل`);
});
