const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ملفات ثابتة
app.use(express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/pages', express.static(path.join(__dirname, 'public/pages')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// ============================================================
// قاعدة بيانات بسيطة (JSON)
// ============================================================

const DB_PATH = path.join(__dirname, 'data');
const VESSELS_FILE = path.join(DB_PATH, 'vessels.json');
const MAINTENANCE_FILE = path.join(DB_PATH, 'maintenance.json');

if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(DB_PATH, { recursive: true });
}

function readData(filePath, defaultData = []) {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return defaultData;
    }
}

function writeData(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch {
        return false;
    }
}

// ============================================================
// بيانات تجريبية أولية
// ============================================================

function getInitialVessels() {
    return [
        { id: 1, name: 'البروق 1', num: 'B001', len: 25, cat: 'البروق', reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: 'الوحدة 1', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-001', repairer: 'فني 1' },
        { id: 2, name: 'البروق 2', num: 'B002', len: 25, cat: 'البروق', reg: 'الشمال', zone: 'طبرقة', port: 'طبرقة', supp: 'الوحدة 1', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-002', repairer: 'فني 1' },
        { id: 3, name: 'البروق 3', num: 'B003', len: 25, cat: 'البروق', reg: 'الساحل', zone: 'سوسة', port: 'سوسة', supp: 'الوحدة 2', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-003', repairer: 'فني 2' },
        { id: 4, name: 'البروق 4', num: 'B004', len: 25, cat: 'البروق', reg: 'الساحل', zone: 'المنستير', port: 'المنستير', supp: 'الوحدة 2', stat: 'معطب', break: 'عطل محرك', fDate: '2026-01-15', eDate: '2026-12-31', ref: 'REF-004', repairer: 'فني 2' },
        { id: 5, name: 'البروق 5', num: 'B005', len: 25, cat: 'البروق', reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: 'الوحدة 3', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-005', repairer: 'فني 3' },
        { id: 6, name: 'البروق 6', num: 'B006', len: 25, cat: 'البروق', reg: 'الوسط', zone: 'قابس', port: 'قابس', supp: 'الوحدة 3', stat: 'معطب', break: 'عطل كهربائي', fDate: '2026-02-01', eDate: '2026-12-31', ref: 'REF-006', repairer: 'فني 3' },
        { id: 7, name: 'البروق 7', num: 'B007', len: 25, cat: 'البروق', reg: 'الجنوب', zone: 'جرجيس', port: 'جرجيس', supp: 'الوحدة 4', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-007', repairer: 'فني 4' },
        { id: 8, name: 'صقر 1', num: 'S001', len: 30, cat: 'صقور', reg: 'الشمال', zone: 'المرسى', port: 'المرسى', supp: 'الوحدة 1', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-008', repairer: 'فني 1' },
        { id: 9, name: 'صقر 2', num: 'S002', len: 30, cat: 'صقور', reg: 'الشمال', zone: 'غار الملح', port: 'غار الملح', supp: 'الوحدة 1', stat: 'معطب', break: 'عطل هيدروليك', fDate: '2026-01-20', eDate: '2026-12-31', ref: 'REF-009', repairer: 'فني 1' },
        { id: 10, name: 'صقر 3', num: 'S003', len: 30, cat: 'صقور', reg: 'الساحل', zone: 'حمام سوسة', port: 'حمام سوسة', supp: 'الوحدة 2', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-010', repairer: 'فني 2' },
        { id: 11, name: 'صقر 4', num: 'S004', len: 30, cat: 'صقور', reg: 'الساحل', zone: 'قليبية', port: 'قليبية', supp: 'الوحدة 2', stat: 'معطب', break: 'عطل محرك', fDate: '2026-02-10', eDate: '2026-12-31', ref: 'REF-011', repairer: 'فني 2' },
        { id: 12, name: 'صقر 5', num: 'S005', len: 30, cat: 'صقور', reg: 'الجنوب', zone: 'بن قردان', port: 'بن قردان', supp: 'الوحدة 4', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-012', repairer: 'فني 4' },
        { id: 13, name: 'خافر 1', num: 'K001', len: 20, cat: 'خوافر', reg: 'الساحل', zone: 'المهدية', port: 'المهدية', supp: 'الوحدة 2', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-013', repairer: 'فني 2' },
        { id: 14, name: 'خافر 2', num: 'K002', len: 20, cat: 'خوافر', reg: 'الساحل', zone: 'نابل', port: 'نابل', supp: 'الوحدة 2', stat: 'صيانة', break: 'صيانة دورية', fDate: '2026-02-15', eDate: '2026-12-31', ref: 'REF-014', repairer: 'فني 2' },
        { id: 15, name: 'خافر 3', num: 'K003', len: 20, cat: 'خوافر', reg: 'الوسط', zone: 'جربة', port: 'جربة', supp: 'الوحدة 3', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-015', repairer: 'فني 3' },
        { id: 16, name: 'طوافة 1', num: 'T001', len: 15, cat: 'طوافات', reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: 'الوحدة 1', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-016', repairer: 'فني 1' },
        { id: 17, name: 'زورق مزدوج 1', num: 'Z001', len: 35, cat: 'زوارق مزدوجة', reg: 'الشمال', zone: 'المرسى', port: 'المرسى', supp: 'الوحدة 1', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-017', repairer: 'فني 1' },
        { id: 18, name: 'زورق مزدوج 2', num: 'Z002', len: 35, cat: 'زوارق مزدوجة', reg: 'الساحل', zone: 'سوسة', port: 'سوسة', supp: 'الوحدة 2', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-018', repairer: 'فني 2' },
        { id: 19, name: 'زورق مزدوج 3', num: 'Z003', len: 35, cat: 'زوارق مزدوجة', reg: 'الساحل', zone: 'المنستير', port: 'المنستير', supp: 'الوحدة 2', stat: 'معطب', break: 'عطل محرك', fDate: '2026-01-25', eDate: '2026-12-31', ref: 'REF-019', repairer: 'فني 2' },
        { id: 20, name: 'زورق مزدوج 4', num: 'Z004', len: 35, cat: 'زوارق مزدوجة', reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: 'الوحدة 3', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-020', repairer: 'فني 3' },
        { id: 21, name: 'زورق مزدوج 5', num: 'Z005', len: 35, cat: 'زوارق مزدوجة', reg: 'الوسط', zone: 'القطار', port: 'القطار', supp: 'الوحدة 3', stat: 'صالح', break: '', fDate: '2026-01-01', eDate: '2026-12-31', ref: 'REF-021', repairer: 'فني 3' }
    ];
}

function getInitialMaintenance() {
    return [
        {
            id: 1,
            vesselId: 4,
            vesselName: 'البروق 4',
            type: 'كبرى',
            unit: 'وحدة الصيانة والإسناد البحري تونس',
            technician: 'فني 1',
            description: 'عطل في المحرك الرئيسي',
            repair: 'تم تغيير طلمبة الزيت والمضخة',
            faultType: 'محرك',
            cost: 4500,
            notes: 'تم تغيير طلمبة الزيت والمضخة بالكامل',
            status: 'مغلقة',
            date: '2026-01-20',
            startDate: '2026-01-15',
            endDate: '2026-01-20',
            parts: [{ name: 'طلمبة زيت', quantity: 1, price: 1200 }, { name: 'مضخة ماء', quantity: 1, price: 800 }, { name: 'فلتر زيت', quantity: 2, price: 150 }],
            createdBy: 'Admin'
        },
        {
            id: 2,
            vesselId: 9,
            vesselName: 'صقر 2',
            type: 'دورية',
            unit: 'وحدة الصيانة والإسناد البحري صفاقس',
            technician: 'فني 2',
            description: 'صيانة دورية للمحرك',
            repair: 'تم تغيير الزيوت والفلتر',
            faultType: 'محرك',
            cost: 300,
            notes: 'تم تغيير الزيوت والفلتر',
            status: 'مغلقة',
            date: '2026-05-15',
            startDate: '2026-05-14',
            endDate: '2026-05-15',
            parts: [{ name: 'زيت محرك', quantity: 5, price: 100 }, { name: 'فلتر هواء', quantity: 1, price: 300 }],
            createdBy: 'Admin'
        },
        {
            id: 3,
            vesselId: 14,
            vesselName: 'خافر 2',
            type: 'كبرى',
            unit: 'وحدة الصيانة والإسناد البحري المنستير',
            technician: 'فني 3',
            description: 'إصلاح شامل للهيكل',
            repair: 'تم تغيير ألواح الهيكل والدهان',
            faultType: 'هيكل',
            cost: 5000,
            notes: 'تم تغيير ألواح الهيكل والدهان المضاد للصدأ',
            status: 'مغلقة',
            date: '2026-01-10',
            startDate: '2026-01-05',
            endDate: '2026-01-10',
            parts: [{ name: 'ألواح فولاذ', quantity: 10, price: 350 }, { name: 'دهان مضاد للصدأ', quantity: 5, price: 200 }],
            createdBy: 'Admin'
        },
        {
            id: 4,
            vesselId: 6,
            vesselName: 'البروق 6',
            type: 'عادية',
            unit: 'وحدة الصيانة والإسناد البحري جرجيس',
            technician: 'فني 4',
            description: 'عطل في النظام الكهربائي',
            repair: 'تم تغيير البطاريات والكابلات',
            faultType: 'كهرباء',
            cost: 1200,
            notes: 'تم تغيير البطاريات والكابلات',
            status: 'مغلقة',
            date: '2026-02-05',
            startDate: '2026-02-03',
            endDate: '2026-02-05',
            parts: [{ name: 'بطارية', quantity: 2, price: 450 }, { name: 'كابلات', quantity: 3, price: 100 }],
            createdBy: 'Admin'
        },
        {
            id: 5,
            vesselId: 19,
            vesselName: 'زورق مزدوج 3',
            type: 'طارئة',
            unit: 'وحدة الصيانة والإسناد البحري تونس',
            technician: 'فني 1',
            description: 'عطل في نظام التوجيه',
            repair: 'تم تغيير طرمبة التوجيه',
            faultType: 'توجيه',
            cost: 1800,
            notes: 'تم تغيير طرمبة التوجيه بالكامل',
            status: 'قيد الإنجاز',
            date: '2026-02-10',
            startDate: '2026-02-08',
            endDate: null,
            parts: [{ name: 'طرمبة توجيه', quantity: 1, price: 1500 }, { name: 'زيت هيدروليك', quantity: 3, price: 100 }],
            createdBy: 'Admin'
        },
        {
            id: 6,
            vesselId: 11,
            vesselName: 'صقر 4',
            type: 'كبرى',
            unit: 'وحدة الصيانة والإسناد البحري صفاقس',
            technician: 'فني 2',
            description: 'عطل في نظام التبريد',
            repair: 'تم تغيير الراديتر والمراوح',
            faultType: 'تبريد',
            cost: 3200,
            notes: 'تم تغيير نظام التبريد بالكامل',
            status: 'مغلقة',
            date: '2026-07-15',
            startDate: '2026-07-10',
            endDate: '2026-07-15',
            parts: [{ name: 'راديتر', quantity: 1, price: 2000 }, { name: 'مراوح تبريد', quantity: 2, price: 400 }, { name: 'ماء مقطر', quantity: 10, price: 40 }],
            createdBy: 'Admin'
        }
    ];
}

// ============================================================
// API Routes
// ============================================================

// المراكب
app.get('/api/vessels', (req, res) => {
    let vessels = readData(VESSELS_FILE);
    if (vessels.length === 0) {
        vessels = getInitialVessels();
        writeData(VESSELS_FILE, vessels);
    }
    res.json(vessels);
});

app.post('/api/vessels', (req, res) => {
    const vessels = readData(VESSELS_FILE);
    const newVessel = {
        id: vessels.length > 0 ? Math.max(...vessels.map(v => v.id)) + 1 : 1,
        ...req.body,
        createdAt: new Date().toISOString()
    };
    vessels.push(newVessel);
    writeData(VESSELS_FILE, vessels);
    res.json({ success: true, vessel: newVessel });
});

app.put('/api/vessels/:id', (req, res) => {
    const vessels = readData(VESSELS_FILE);
    const id = parseInt(req.params.id);
    const index = vessels.findIndex(v => v.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'Vessel not found' });
    }
    vessels[index] = { ...vessels[index], ...req.body };
    writeData(VESSELS_FILE, vessels);
    res.json({ success: true, vessel: vessels[index] });
});

app.delete('/api/vessels/:id', (req, res) => {
    const vessels = readData(VESSELS_FILE);
    const id = parseInt(req.params.id);
    const filtered = vessels.filter(v => v.id !== id);
    if (filtered.length === vessels.length) {
        return res.status(404).json({ success: false, error: 'Vessel not found' });
    }
    writeData(VESSELS_FILE, filtered);
    res.json({ success: true });
});

// الصيانة
app.get('/api/maintenance', (req, res) => {
    let maintenance = readData(MAINTENANCE_FILE);
    if (maintenance.length === 0) {
        maintenance = getInitialMaintenance();
        writeData(MAINTENANCE_FILE, maintenance);
    }
    res.json(maintenance);
});

app.post('/api/maintenance', (req, res) => {
    const maintenance = readData(MAINTENANCE_FILE);
    const newRecord = {
        id: maintenance.length > 0 ? Math.max(...maintenance.map(r => r.id)) + 1 : 1,
        ...req.body,
        createdAt: new Date().toISOString()
    };
    maintenance.push(newRecord);
    writeData(MAINTENANCE_FILE, maintenance);
    res.json({ success: true, record: newRecord });
});

app.put('/api/maintenance/:id', (req, res) => {
    const maintenance = readData(MAINTENANCE_FILE);
    const id = parseInt(req.params.id);
    const index = maintenance.findIndex(r => r.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'Record not found' });
    }
    maintenance[index] = { ...maintenance[index], ...req.body };
    writeData(MAINTENANCE_FILE, maintenance);
    res.json({ success: true, record: maintenance[index] });
});

app.delete('/api/maintenance/:id', (req, res) => {
    const maintenance = readData(MAINTENANCE_FILE);
    const id = parseInt(req.params.id);
    const filtered = maintenance.filter(r => r.id !== id);
    if (filtered.length === maintenance.length) {
        return res.status(404).json({ success: false, error: 'Record not found' });
    }
    writeData(MAINTENANCE_FILE, filtered);
    res.json({ success: true });
});

// ============================================================
// تقديم الصفحات
// ============================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/pages/:page', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'pages', `${req.params.page}.html`);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Page not found');
    }
});

// ============================================================
// تشغيل الخادم
// ============================================================

app.listen(PORT, () => {
    console.log('========================================');
    console.log('🚀 نظام إدارة الأسطول البحري');
    console.log('========================================');
    console.log(`✅ الخادم يعمل على: http://localhost:${PORT}`);
    console.log('========================================');
    console.log('📁 قاعدة البيانات: data/');
    console.log('========================================');
});
