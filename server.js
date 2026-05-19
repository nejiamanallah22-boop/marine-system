const express = require('express');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== المستخدمين ====================
let users = [
    { id: 1, username: 'admin', password: '1234', role: 'مسؤول', enabled: true },
    { id: 2, username: 'editor', password: '1234', role: 'محرر', enabled: true },
    { id: 3, username: 'viewer', password: '1234', role: 'مشاهد', enabled: true }
];

// ==================== المراكب ====================
let vessels = [
    { id: 1, name: 'البروق 1', num: 'B001', len: 11, reg: 'الشمال', zone: 'تونس', port: 'تونس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'البروق' },
    { id: 2, name: 'خافرة معطوبة', num: 'K002', len: 20, reg: 'الوسط', zone: 'صفاقس', port: 'صفاقس', supp: '', stat: 'معطب', break: 'محرك محترق', fDate: '2024-05-01', eDate: '2024-06-15', ref: 'REF001', cat: 'خوافر' },
    { id: 3, name: 'زورق صيانة', num: 'Z003', len: 15, reg: 'الجنوب', zone: 'جربة', port: 'جربة', supp: '', stat: 'صيانة', break: 'عطل كهربائي', fDate: '2024-05-10', eDate: '2024-05-30', ref: 'REF002', cat: 'زوارق مزدوجة' },
    { id: 4, name: 'صقر الشمال', num: 'S004', len: 10, reg: 'الشمال', zone: 'بنزرت', port: 'بنزرت', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'صقور' },
    { id: 5, name: 'وحدة صيانة تونس', num: 'M001', len: 0, reg: 'وحدة الصيانة والإسناد البحري تونس', zone: 'تونس', port: 'تونس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'وحدة صيانة' },
    { id: 6, name: 'وحدة صيانة المنستير', num: 'M002', len: 0, reg: 'وحدة الصيانة والإسناد البحري المنستير', zone: 'المنستير', port: 'المنستير', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'وحدة صيانة' },
    { id: 7, name: 'وحدة صيانة صفاقس', num: 'M003', len: 0, reg: 'وحدة الصيانة والإسناد البحري صفاقس', zone: 'صفاقس', port: 'صفاقس', supp: '', stat: 'صيانة', break: 'تجهيزات', fDate: '2024-05-20', eDate: '2024-06-10', ref: 'REF003', cat: 'وحدة صيانة' },
    { id: 8, name: 'وحدة صيانة جرجيس', num: 'M004', len: 0, reg: 'وحدة الصيانة والإسناد البحري جرجيس', zone: 'جرجيس', port: 'جرجيس', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'وحدة صيانة' },
    { id: 9, name: 'المجمع الأمني بقبيبة', num: 'A001', len: 0, reg: 'المجمع الأمني بقبيبة', zone: 'قبيبة', port: 'قبيبة', supp: '', stat: 'صالح', break: '', fDate: '', eDate: '', ref: '', cat: 'مركز أمني' }
];

let tickets = [];

// ==================== جلسات المستخدمين (سيتم تحديد الموقع عبر IP) ====================
let userSessions = [];
let nextId = 10;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'secret_' + Date.now(),
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1';
}

// دالة لتحديد الموقع التقريبي بناءً على IP (بدون طلب إذن)
async function getLocationByIp(ip) {
    try {
        if (ip === '::1' || ip === '127.0.0.1') {
            return { country: 'تونس', city: 'تونس', lat: 36.8065, lon: 10.1815, isp: 'محلي' };
        }
        const response = await fetch(`http://ip-api.com/json/${ip}?lang=ar`);
        const data = await response.json();
        return {
            country: data.country || 'تونس',
            city: data.city || 'تونس',
            lat: data.lat || 36.8065,
            lon: data.lon || 10.1815,
            isp: data.isp || 'غير معروف'
        };
    } catch (error) {
        return { country: 'تونس', city: 'تونس', lat: 36.8065, lon: 10.1815, isp: 'غير معروف' };
    }
}

// ==================== تسجيل الدخول (تحديد الموقع تلقائياً عبر IP) ====================
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    
    if (!user || !user.enabled) {
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    const ip = getClientIp(req);
    const geo = await getLocationByIp(ip);
    
    const sessionData = {
        id: Date.now
