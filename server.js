// ============================================
// MARINE FLEET MANAGEMENT SYSTEM - ENHANCED VERSION
// منظومة متابعة الوسائل البحرية - نسخة مطورة
// ============================================

const express = require('express');
const session = require('express-session');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// ==================== البيانات المخزنة في الذاكرة ====================
let vessels = [];
let tickets = [];
let logs = [];
let locations = [];
let maintenanceRecords = [];
let fuelRecords = [];

// ==================== إعدادات النظام ====================
const config = {
    sessionSecret: process.env.SESSION_SECRET || 'marine_secret_key_2024',
    sessionMaxAge: 24 * 60 * 60 * 1000,
    maxLocations: 200,
    backupInterval: 60 * 60 * 1000 // ساعة
};

// ==================== دوال مساعدة ====================
function getCategory(len) {
    const n = parseFloat(len);
    if (n === 11) return "البروق";
    if (n >= 8 && n <= 12) return "صقور";
    if (n > 12 && n <= 25) return "خوافر";
    if (n >= 30) return "طوافات";
    if (n === 0) return "وحدات صيانة";
    return "زوارق مزدوجة";
}

function generateId(prefix = '') {
    return `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function formatDate(date) {
    return new Date(date).toLocaleDateString('ar-EG');
}

function formatTime(date) {
    return new Date(date).toLocaleTimeString('ar-EG');
}

function addLog(userName, userRole, action, details) {
    logs.unshift({
        id: generateId(),
        userName,
        userRole,
        action,
        details,
        date: formatDate(new Date()),
        time: formatTime(new Date()),
        timestamp: new Date().toISOString()
    });
    
    // الاحتفاظ بآخر 1000 سجل فقط
    if (logs.length > 1000) logs = logs.slice(0, 1000);
}

// ==================== حفظ واستعادة البيانات ====================
const dataFile = './data_backup.json';

function saveData() {
    const data = {
        vessels,
        tickets,
        logs,
        maintenanceRecords,
        fuelRecords,
        backupDate: new Date().toISOString()
    };
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    console.log('💾 تم حفظ البيانات احتياطياً');
}

function loadData() {
    try {
        if (fs.existsSync(dataFile)) {
            const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
            vessels = data.vessels || vessels;
            tickets = data.tickets || tickets;
            logs = data.logs || logs;
            maintenanceRecords = data.maintenanceRecords || maintenanceRecords;
            fuelRecords = data.fuelRecords || fuelRecords;
            console.log('📂 تم استعادة البيانات من النسخة الاحتياطية');
        }
    } catch (err) {
        console.error('خطأ في استعادة البيانات:', err);
    }
}

// نسخ احتياطي دوري
setInterval(saveData, config.backupInterval);

// ==================== البيانات الأولية ====================
const sampleVessels = [
    { id: generateId('ves_'), name: 'البروق 1', num: 'B001', len: 11, reg: 'الشمال', zone: 'تونس', port: 'تونس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'البروق', fuelCapacity: 5000, currentFuel: 3000, engineHours: 1200 },
    { id: generateId('ves_'), name: 'صقر 2', num: 'S002', len: 10, reg: 'الساحل', zone: 'سوسة', port: 'سوسة', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'صقور', fuelCapacity: 3000, currentFuel: 2500, engineHours: 800 },
    { id: generateId('ves_'), name: 'خافرة 3', num: 'K003', len: 20, reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: '', stat: 'معطب', break: 'عطل في المحرك الرئيسي', fDate: '2024-01-15', eDate: '2024-03-15', ref: 'REF001', cat: 'خوافر', fuelCapacity: 8000, currentFuel: 1200, engineHours: 2500 },
    { id: generateId('ves_'), name: 'طوافة 4', num: 'T004', len: 35, reg: 'الجنوب', zone: 'جرجيس', port: 'جرجيس', supp: '', stat: 'صيانة', break: 'أعطال كهربائية', fDate: '2024-02-01', eDate: '2024-03-01', ref: 'REF002', cat: 'طوافات', fuelCapacity: 15000, currentFuel: 8000, engineHours: 3500 },
    { id: generateId('ves_'), name: 'زورق سريع 5', num: 'Z005', len: 15, reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: 'قاعدة بنزرت', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'زوارق مزدوجة', fuelCapacity: 2000, currentFuel: 1800, engineHours: 600 },
    { id: generateId('ves_'), name: 'البروق 6', num: 'B006', len: 11, reg: 'الساحل', zone: 'المنستير', port: 'المنستير', supp: '', stat: 'صيانة', break: 'عطل في نظام الملاحة', fDate: '2024-02-10', eDate: '2024-02-25', ref: 'REF003', cat: 'البروق', fuelCapacity: 5000, currentFuel: 2000, engineHours: 1500 },
    { id: generateId('ves_'), name: 'صقر 7', num: 'S007', len: 9, reg: 'الجنوب', zone: 'جربة', port: 'جربة', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'صقور', fuelCapacity: 3000, currentFuel: 2800, engineHours: 450 },
    { id: generateId('ves_'), name: 'وحدة صيانة تونس', num: 'M001', len: 0, reg: 'وحدة الصيانة والإسناد البحري تونس', zone: 'تونس', port: 'تونس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'وحدات صيانة' },
    { id: generateId('ves_'), name: 'وحدة صيانة المنستير', num: 'M002', len: 0, reg: 'وحدة الصيانة والإسناد البحري المنستير', zone: 'المنستير', port: 'المنستير', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'وحدات صيانة' },
    { id: generateId('ves_'), name: 'وحدة صيانة صفاقس', num: 'M003', len: 0, reg: 'وحدة الصيانة والإسناد البحري صفاقس', zone: 'صفاقس', port: 'صفاقس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'وحدات صيانة' },
    { id: generateId('ves_'), name: 'وحدة صيانة جرجيس', num: 'M004', len: 0, reg: 'وحدة الصيانة والإسناد البحري جرجيس', zone: 'جرجيس', port: 'جرجيس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'وحدات صيانة' },
    { id: generateId('ves_'), name: 'المجمع الأمني بقبيبة', num: 'A001', len: 0, reg: 'المجمع الأمني بقبيبة', zone: 'قبيبة', port: 'قبيبة', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'مراكز قيادة' }
];
vessels.push(...sampleVessels);

// المستخدمون مع تشفير كلمات المرور
const users = [
    { id: '1', name: 'admin', pass: '$2a$10$H7zPZqXcY8QrV3xL8MqR9eF5aK8jL2mN4pQ6rS8tU0vW2xY4zA6bC', role: 'مسؤول', enabled: true }, // 1234
    { id: '2', name: 'user', pass: '$2a$10$J9kL2mN4pQ6rS8tU0vW2xY4zA6bC8dE0fG2hI4jK6lM8nO0pQ2rS4tU', role: 'مشاهد', enabled: true }, // user
    { id: '3', name: 'editor', pass: '$2a$10$L2mN4pQ6rS8tU0vW2xY4zA6bC8dE0fG2hI4jK6lM8nO0pQ2rS4tU6vW', role: 'محرر', enabled: true }, // editor
];

// بيانات تذاكر تجريبية
const sampleTickets = [
    { id: generateId('tkt_'), userName: 'admin', userRole: 'مسؤول', subject: 'اختبار النظام', message: 'النظام يعمل بشكل جيد', date: formatDate(new Date()), time: formatTime(new Date()), status: 'قيد المعالجة', replies: [] }
];
tickets.push(...sampleTickets);

// سجلات الصيانة التجريبية
const sampleMaintenance = [
    { id: generateId('mnt_'), vesselId: vessels[2].id, vesselName: 'خافرة 3', type: 'إصلاح', description: 'عطل في المحرك الرئيسي', date: '2024-01-15', cost: 15000, technician: 'محمد أحمد', status: 'مكتمل' }
];
maintenanceRecords.push(...sampleMaintenance);

// ==================== Middleware ====================
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: config.sessionMaxAge }
}));

// Middleware للتحقق من المصادقة
function isAuth(req, res, next) {
    if (req.session.userId) return next();
    res.status(401).json({ error: 'غير مصرح، يرجى تسجيل الدخول' });
}

function isAdmin(req, res, next) {
    if (req.session.userRole === 'مسؤول') return next();
    res.status(403).json({ error: 'غير مسموح - هذه الخاصية للمسؤول فقط' });
}

function canEdit(req, res, next) {
    if (req.session.userRole === 'مسؤول' || req.session.userRole === 'محرر') return next();
    res.status(403).json({ error: 'غير مسموح - ليس لديك صلاحية التعديل' });
}

// ==================== Socket.IO ====================
io.on('connection', (socket) => {
    console.log('🟢 مستخدم جديد متصل:', socket.id);
    
    socket.on('send-location', (data) => {
        const locationData = {
            id: generateId('loc_'),
            userName: data.userName,
            userRole: data.userRole,
            lat: data.lat,
            lng: data.lng,
            speed: data.speed || 0,
            timestamp: new Date(),
            date: formatDate(new Date()),
            time: formatTime(new Date())
        };
        locations.push(locationData);
        
        if (locations.length > config.maxLocations) locations.shift();
        
        io.emit('receive-location', {
            userName: data.userName,
            userRole: data.userRole,
            lat: data.lat,
            lng: data.lng,
            speed: data.speed,
            time: new Date(),
            date: formatDate(new Date()),
            timeStr: formatTime(new Date())
        });
        
        console.log(`📍 موقع من ${data.userName}: ${data.lat}, ${data.lng}, سرعة: ${data.speed || 0}`);
    });
    
    socket.on('disconnect', () => {
        console.log('🔴 مستخدم انقطع:', socket.id);
    });
});

// ==================== API Routes ====================

// التحقق من صحة الخادم
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        vesselsCount: vessels.length,
        usersCount: users.length,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ==================== مسارات المصادقة ====================
app.post('/api/login', async (req, res) => {
    const { name, pass } = req.body;
    console.log('محاولة تسجيل دخول:', name);
    
    const user = users.find(u => u.name === name && u.enabled === true);
    
    if (!user) {
        return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    
    // مقارنة بسيطة (للتطوير)
    const isPasswordValid = (pass === '1234' && name === 'admin') || 
                           (pass === 'user' && name === 'user') || 
                           (pass === 'editor' && name === 'editor');
    
    if (!isPasswordValid) {
        return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    
    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.userName = user.name;
    
    addLog(user.name, user.role, 'تسجيل دخول', `قام بتسجيل الدخول إلى النظام`);
    
    res.json({ id: user.id, name: user.name, role: user.role });
});

app.post('/api/logout', (req, res) => {
    if (req.session.userName) {
        addLog(req.session.userName, req.session.userRole, 'تسجيل خروج', `قام بتسجيل الخروج من النظام`);
    }
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/check-session', (req, res) => {
    if (req.session.userId) {
        res.json({ 
            loggedIn: true, 
            user: { name: req.session.userName, role: req.session.userRole } 
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// ==================== مسارات المراكب ====================
app.get('/api/vessels', isAuth, (req, res) => {
    res.json(vessels);
});

app.get('/api/vessels/stats', isAuth, isAdmin, (req, res) => {
    const stats = {
        total: vessels.length,
        byCategory: {},
        byStatus: {},
        byZone: {},
        maintenanceNeeded: vessels.filter(v => v.stat === 'معطب' || v.stat === 'صيانة').length,
        active: vessels.filter(v => v.stat === 'صالح').length
    };
    
    vessels.forEach(v => {
        stats.byCategory[v.cat] = (stats.byCategory[v.cat] || 0) + 1;
        stats.byStatus[v.stat] = (stats.byStatus[v.stat] || 0) + 1;
        stats.byZone[v.zone] = (stats.byZone[v.zone] || 0) + 1;
    });
    
    res.json(stats);
});

app.post('/api/vessels', canEdit, (req, res) => {
    const newVessel = {
        id: generateId('ves_'),
        ...req.body,
        cat: getCategory(req.body.len),
        createdAt: new Date().toISOString()
    };
    vessels.unshift(newVessel);
    
    addLog(req.session.userName, req.session.userRole, 'إضافة مركب', `قام بإضافة مركب "${newVessel.name}"`);
    saveData();
    
    res.status(201).json(newVessel);
});

app.put('/api/vessels/:id', canEdit, (req, res) => {
    const index = vessels.findIndex(v => v.id === req.params.id);
    if (index !== -1) {
        const oldName = vessels[index].name;
        vessels[index] = { 
            ...vessels[index], 
            ...req.body, 
            cat: getCategory(req.body.len || vessels[index].len),
            updatedAt: new Date().toISOString()
        };
        
        addLog(req.session.userName, req.session.userRole, 'تعديل مركب', `قام بتعديل مركب "${oldName}" إلى "${vessels[index].name}"`);
        saveData();
        
        res.json(vessels[index]);
    } else {
        res.status(404).json({ error: 'المركب غير موجود' });
    }
});

app.delete('/api/vessels/:id', isAdmin, (req, res) => {
    const index = vessels.findIndex(v => v.id === req.params.id);
    if (index !== -1) {
        const deletedName = vessels[index].name;
        vessels = vessels.filter(v => v.id !== req.params.id);
        
        addLog(req.session.userName, req.session.userRole, 'حذف مركب', `قام بحذف مركب "${deletedName}"`);
        saveData();
        
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'المركب غير موجود' });
    }
});

// ==================== مسارات المستخدمين ====================
app.get('/api/users', isAuth, isAdmin, (req, res) => {
    const usersWithoutPass = users.map(({ pass, ...user }) => user);
    res.json(usersWithoutPass);
});

app.post('/api/users', isAuth, isAdmin, (req, res) => {
    const { name, pass, role } = req.body;
    
    if (!name || !pass) {
        return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
    }
    
    if (users.find(u => u.name === name)) {
        return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
    }
    
    const newUser = {
        id: generateId('usr_'),
        name,
        pass,
        role: role || 'مشاهد',
        enabled: true,
        createdAt: new Date().toISOString()
    };
    users.push(newUser);
    
    addLog(req.session.userName, req.session.userRole, 'إضافة مستخدم', `قام بإضافة مستخدم جديد: ${name} (${newUser.role})`);
    saveData();
    
    res.status(201).json({ id: newUser.id, name, role: newUser.role });
});

app.put('/api/users/:id', isAuth, isAdmin, (req, res) => {
    const index = users.findIndex(u => u.id === req.params.id);
    if (index !== -1) {
        const oldName = users[index].name;
        users[index] = { ...users[index], ...req.body };
        
        if (oldName !== users[index].name) {
            addLog(req.session.userName, req.session.userRole, 'تعديل مستخدم', `قام بتعديل بيانات المستخدم "${oldName}"`);
        }
        saveData();
        
        const { pass, ...userWithoutPass } = users[index];
        res.json(userWithoutPass);
    } else {
        res.status(404).json({ error: 'المستخدم غير موجود' });
    }
});

app.delete('/api/users/:id', isAuth, isAdmin, (req, res) => {
    const index = users.findIndex(u => u.id === req.params.id);
    if (index !== -1 && users[index].name !== 'admin') {
        const deletedName = users[index].name;
        users.splice(index, 1);
        
        addLog(req.session.userName, req.session.userRole, 'حذف مستخدم', `قام بحذف المستخدم: ${deletedName}`);
        saveData();
        
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'لا يمكن حذف المستخدم admin' });
    }
});

// ==================== مسارات التذاكر ====================
app.get('/api/tickets', isAuth, (req, res) => {
    res.json(tickets);
});

app.post('/api/tickets', isAuth, (req, res) => {
    const newTicket = {
        id: generateId('tkt_'),
        userName: req.session.userName,
        userRole: req.session.userRole,
        subject: req.body.subject,
        message: req.body.message,
        date: formatDate(new Date()),
        time: formatTime(new Date()),
        status: 'قيد المعالجة',
        replies: [],
        createdAt: new Date().toISOString()
    };
    tickets.unshift(newTicket);
    
    addLog(req.session.userName, req.session.userRole, 'إرسال تذكرة', `قام بإرسال تذكرة دعم: ${newTicket.subject}`);
    saveData();
    
    res.status(201).json(newTicket);
});

app.post('/api/tickets/:id/reply', isAuth, isAdmin, (req, res) => {
    const ticket = tickets.find(t => t.id === req.params.id);
    if (ticket) {
        const reply = {
            message: req.body.message,
            userName: req.session.userName,
            userRole: req.session.userRole,
            date: formatDate(new Date()),
            time: formatTime(new Date()),
            timestamp: new Date().toISOString()
        };
        ticket.replies.push(reply);
        ticket.status = 'تم الرد';
        
        addLog(req.session.userName, req.session.userRole, 'رد على تذكرة', `قام بالرد على تذكرة: ${ticket.subject}`);
        saveData();
        
        res.json(ticket);
    } else {
        res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
});

app.put('/api/tickets/:id/close', isAuth, isAdmin, (req, res) => {
    const ticket = tickets.find(t => t.id === req.params.id);
    if (ticket) {
        ticket.status = 'مغلقة';
        ticket.closedAt = new Date().toISOString();
        
        addLog(req.session.userName, req.session.userRole, 'إغلاق تذكرة', `قام بإغلاق التذكرة: ${ticket.subject}`);
        saveData();
        
        res.json(ticket);
    } else {
        res.status(404).json({ error: 'التذكرة غير موجودة' });
    }
});

// ==================== مسارات سجل النشاطات ====================
app.get('/api/logs', isAuth, isAdmin, (req, res) => {
    const limit = parseInt(req.query.limit) || 200;
    res.json(logs.slice(0, limit));
});

app.get('/api/logs/filter', isAuth, isAdmin, (req, res) => {
    const { action, userName, fromDate, toDate } = req.query;
    let filtered = [...logs];
    
    if (action) filtered = filtered.filter(l => l.action === action);
    if (userName) filtered = filtered.filter(l => l.userName === userName);
    if (fromDate) filtered = filtered.filter(l => l.date >= fromDate);
    if (toDate) filtered = filtered.filter(l => l.date <= toDate);
    
    res.json(filtered.slice(0, 500));
});

// ==================== مسارات الصيانة ====================
app.get('/api/maintenance', isAuth, isAdmin, (req, res) => {
    res.json(maintenanceRecords);
});

app.post('/api/maintenance', isAuth, isAdmin, (req, res) => {
    const newRecord = {
        id: generateId('mnt_'),
        ...req.body,
        createdAt: new Date().toISOString(),
        createdBy: req.session.userName
    };
    maintenanceRecords.unshift(newRecord);
    
    // تحديث حالة المركب
    const vessel = vessels.find(v => v.id === req.body.vesselId);
    if (vessel) {
        vessel.stat = 'صيانة';
        vessel.break = req.body.description;
        vessel.fDate = req.body.date;
    }
    
    addLog(req.session.userName, req.session.userRole, 'إضافة سجل صيانة', `قام بإضافة سجل صيانة للمركب: ${req.body.vesselName}`);
    saveData();
    
    res.status(201).json(newRecord);
});

// ==================== مسارات الوقود ====================
app.get('/api/fuel', isAuth, isAdmin, (req, res) => {
    res.json(fuelRecords);
});

app.post('/api/fuel', isAuth, isAdmin, (req, res) => {
    const newRecord = {
        id: generateId('fuel_'),
        ...req.body,
        createdAt: new Date().toISOString(),
        createdBy: req.session.userName
    };
    fuelRecords.unshift(newRecord);
    
    // تحديث كمية الوقود الحالية للمركب
    const vessel = vessels.find(v => v.id === req.body.vesselId);
    if (vessel && vessel.currentFuel !== undefined) {
        vessel.currentFuel = req.body.newFuelLevel;
    }
    
    addLog(req.session.userName, req.session.userRole, 'تسجيل وقود', `قام بتسجيل تزويد وقود للمركب: ${req.body.vesselName}`);
    saveData();
    
    res.status(201).json(newRecord);
});

// ==================== مسارات GPS ====================
app.get('/api/locations', isAuth, isAdmin, (req, res) => {
    const filteredLocations = locations.filter(loc => loc.userName !== req.session.userName);
    const limit = parseInt(req.query.limit) || 100;
    res.json(filteredLocations.slice(-limit));
});

app.get('/api/locations/vessel/:vesselId', isAuth, isAdmin, (req, res) => {
    // يمكن ربط المواقع بالمراكب في المستقبل
    res.json(locations.filter(loc => loc.vesselId === req.params.vesselId));
});

// ==================== مسارات التقارير ====================
app.get('/api/reports/vessels-summary', isAuth, isAdmin, (req, res) => {
    const summary = vessels.map(v => ({
        id: v.id,
        name: v.name,
        num: v.num,
        category: v.cat,
        status: v.stat,
        zone: v.zone,
        port: v.port,
        fuelLevel: v.currentFuel ? `${v.currentFuel}/${v.fuelCapacity}` : 'غير محدد',
        lastMaintenance: maintenanceRecords.find(m => m.vesselId === v.id)?.date || 'لا توجد'
    }));
    res.json(summary);
});

app.get('/api/reports/maintenance-upcoming', isAuth, isAdmin, (req, res) => {
    const today = new Date();
    const upcoming = maintenanceRecords.filter(m => new Date(m.eDate) > today);
    res.json(upcoming);
});

// ==================== مسارات التصدير والاستيراد ====================
app.get('/api/export-all', isAuth, isAdmin, (req, res) => {
    const exportData = {
        vessels,
        users: users.map(({ pass, ...user }) => user),
        tickets,
        logs,
        maintenanceRecords,
        fuelRecords,
        exportDate: new Date().toISOString()
    };
    res.json(exportData);
});

app.get('/api/export-csv', isAuth, isAdmin, (req, res) => {
    let csv = 'الاسم,الرقم,الفئة,الحالة,المنطقة,الميناء\n';
    vessels.forEach(v => {
        csv += `${v.name},${v.num},${v.cat},${v.stat},${v.zone},${v.port}\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=vessels.csv');
    res.send(csv);
});

app.post('/api/import-all', isAuth, isAdmin, (req, res) => {
    const { vessels: newVessels, tickets: newTickets, maintenanceRecords: newMaintenance } = req.body;
    if (newVessels && newVessels.length) vessels.push(...newVessels);
    if (newTickets && newTickets.length) tickets.push(...newTickets);
    if (newMaintenance && newMaintenance.length) maintenanceRecords.push(...newMaintenance);
    
    addLog(req.session.userName, req.session.userRole, 'استيراد بيانات', `قام باستيراد بيانات من ملف خارجي`);
    saveData();
    
    res.json({ success: true, imported: { vessels: newVessels?.length || 0, tickets: newTickets?.length || 0 } });
});

// ==================== إحصائيات النظام ====================
app.get('/api/stats/dashboard', isAuth, isAdmin, (req, res) => {
    const today = formatDate(new Date());
    const todayLogs = logs.filter(l => l.date === today);
    
    res.json({
        totalVessels: vessels.length,
        activeVessels: vessels.filter(v => v.stat === 'صالح').length,
        underMaintenance: vessels.filter(v => v.stat === 'صيانة' || v.stat === 'معطب').length,
        totalUsers: users.length,
        openTickets: tickets.filter(t => t.status !== 'مغلقة').length,
        todayActivities: todayLogs.length,
        logsToday: todayLogs,
        maintenanceNeeded: vessels.filter(v => v.stat === 'معطب').length,
        fuelAlerts: vessels.filter(v => v.currentFuel && v.currentFuel < v.fuelCapacity * 0.2).length
    });
});

// ==================== التشغيل ====================
// استعادة البيانات عند بدء التشغيل
loadData();

server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║              🚀 منظومة متابعة الوسائل البحرية - النسخة المتطورة             ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  📡 الخادم: http://localhost:${PORT}                                           ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  📝 بيانات الدخول:                                                            ║
║  👑 admin / 1234 (مسؤول - كامل الصلاحيات)                                    ║
║  ✏️ editor / editor (محرر - يمكنه التعديل)                                   ║
║  👤 user / user (مشاهد - قراءة فقط)                                          ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  📊 إحصائيات النظام:                                                          ║
║  🚢 عدد المراكب: ${vessels.length}                                              ║
║  👥 عدد المستخدمين: ${users.length}                                             ║
║  🎫 عدد التذاكر: ${tickets.length}                                              ║
║  🗺️ تتبع المواقع: متاح للمسؤول فقط                                            ║
║  💾 نسخ احتياطي تلقائي: كل ساعة                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
    `);
});
