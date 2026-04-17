const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// ==================== التحقق من المتغيرات البيئية ====================
if (!process.env.JWT_SECRET) {
    console.error('❌ خطأ: JWT_SECRET غير موجود في المتغيرات البيئية');
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || JWT_SECRET + '_refresh';

// ==================== إعدادات الأمان المتقدمة ====================
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// ==================== CORS ====================
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'];
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('غير مسموح به من هذا المصدر'));
        }
    },
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ==================== Rate Limiters متعددة ====================
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'طلبات كثيرة، يرجى المحاولة لاحقاً' }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    message: { error: 'محاولات دخول كثيرة، يرجى المحاولة بعد 15 دقيقة' }
});

const strictLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'طلبات كثيرة، يرجى التهدئة' }
});

app.use('/api/', globalLimiter);
app.post('/api/login', loginLimiter);

// ==================== مجلد البيانات ====================
const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_DIR = path.join(__dirname, 'backups');

async function ensureDirectories() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.mkdir(BACKUP_DIR, { recursive: true });
    } catch (error) {
        console.error('خطأ في إنشاء المجلدات:', error);
    }
}

// ==================== دوال قراءة وكتابة غير متزامنة ====================
async function readData(filename) {
    try {
        const filePath = path.join(DATA_DIR, filename);
        try {
            await fs.access(filePath);
        } catch {
            await fs.writeFile(filePath, JSON.stringify([]));
            return [];
        }
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('❌ خطأ قراءة الملف:', filename, error);
        return [];
    }
}

async function writeData(filename, data) {
    try {
        const filePath = path.join(DATA_DIR, filename);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('❌ خطأ كتابة الملف:', filename, error);
        return false;
    }
}

// ==================== نسخ احتياطي تلقائي ====================
async function createBackup() {
    try {
        const vessels = await readData('vessels.json');
        const backup = {
            timestamp: new Date().toISOString(),
            vessels: vessels,
            totalVessels: vessels.length
        };
        const filename = `backup_${new Date().toISOString().replace(/:/g, '-')}.json`;
        await fs.writeFile(path.join(BACKUP_DIR, filename), JSON.stringify(backup, null, 2));
        
        // الاحتفاظ بآخر 10 نسخ فقط
        const backups = await fs.readdir(BACKUP_DIR);
        const oldBackups = backups.filter(f => f.startsWith('backup_')).sort();
        while (oldBackups.length > 10) {
            const oldest = oldBackups.shift();
            await fs.unlink(path.join(BACKUP_DIR, oldest));
        }
        console.log('✅ نسخة احتياطية تم إنشاؤها:', filename);
    } catch (error) {
        console.error('❌ خطأ في النسخ الاحتياطي:', error);
    }
}

// عمل نسخة احتياطية كل 6 ساعات
setInterval(createBackup, 6 * 60 * 60 * 1000);

// ==================== تسجيل النشاطات المتقدم ====================
async function addLog(username, role, action, details, req = null) {
    const logs = await readData('logs.json');
    const now = new Date();
    const log = {
        id: uuidv4(),
        date: now.toLocaleDateString('ar-TN'),
        time: now.toLocaleTimeString('ar-TN'),
        timestamp: now.toISOString(),
        username: username,
        user_role: role,
        action: action,
        details: details,
        ip_address: req ? req.ip || req.socket.remoteAddress : 'unknown',
        user_agent: req ? req.headers['user-agent'] : 'system'
    };
    logs.unshift(log);
    if (logs.length > 2000) logs.pop();
    await writeData('logs.json', logs);
}

// ==================== Middleware التوثيق ====================
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'غير مصرح به - يرجى تسجيل الدخول' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'انتهت الجلسة', expired: true });
        }
        return res.status(403).json({ error: 'رمز غير صالح' });
    }
}

function authorizeRole(...roles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'غير مصرح به' });
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'ليس لديك صلاحية لهذه العملية' });
        }
        next();
    };
}

// ==================== تحديث البيانات القديمة (Migration) ====================
async function migrateOldUsers() {
    try {
        const users = await readData('users.json');
        let needsUpdate = false;
        
        for (const user of users) {
            // إذا كانت كلمة المرور ليست hash (أقل من 60 حرفاً وتبدأ بـ $2)
            if (user.password && !user.password.startsWith('$2') && user.password.length < 60) {
                const salt = bcrypt.genSaltSync(10);
                user.password = bcrypt.hashSync(user.password, salt);
                needsUpdate = true;
                console.log(`✅ تم تحديث كلمة مرور المستخدم: ${user.username}`);
            }
        }
        
        if (needsUpdate) {
            await writeData('users.json', users);
            console.log('✅ تم ترحيل كلمات المرور القديمة إلى التشفير');
        }
    } catch (error) {
        console.error('❌ خطأ في ترحيل المستخدمين:', error);
    }
}

// ==================== تهيئة البيانات الأولية ====================
async function initData() {
    await ensureDirectories();
    
    let users = await readData('users.json');
    if (users.length === 0) {
        const salt = bcrypt.genSaltSync(10);
        await writeData('users.json', [
            { id: uuidv4(), username: "admin", password: bcrypt.hashSync("admin123", salt), role: "مسؤول", enabled: true, createdAt: new Date().toISOString() },
            { id: uuidv4(), username: "editor", password: bcrypt.hashSync("editor123", salt), role: "محرر", enabled: true, createdAt: new Date().toISOString() },
            { id: uuidv4(), username: "viewer", password: bcrypt.hashSync("viewer123", salt), role: "مشاهد", enabled: true, createdAt: new Date().toISOString() }
        ]);
        console.log('✅ تم إنشاء المستخدمين الافتراضيين');
    } else {
        await migrateOldUsers();
    }

    let vessels = await readData('vessels.json');
    if (vessels.length === 0) {
        await writeData('vessels.json', [
            { id: uuidv4(), name: "البروق-1", number: "B001", length: 11, category: "البروق", region: "الشمال", zone: "تونس", port: "تونس", support_location: "حلق الوادي", status: "صالح", breakdown_type: "", breakdown_date: "", end_date: "", reference: "", createdAt: new Date().toISOString() },
            { id: uuidv4(), name: "صقر-1", number: "S001", length: 10, category: "صقور", region: "الساحل", zone: "سوسة", port: "سوسة", support_location: "المنستير", status: "صالح", breakdown_type: "", breakdown_date: "", end_date: "", reference: "", createdAt: new Date().toISOString() },
            { id: uuidv4(), name: "خوفة-1", number: "K001", length: 20, category: "خوافر", region: "الوسط", zone: "صفاقس", port: "صفاقس", support_location: "المهدية", status: "معطب", breakdown_type: "محرك", breakdown_date: "2024-01-15", end_date: "2024-02-15", reference: "REF001", createdAt: new Date().toISOString() },
            { id: uuidv4(), name: "زورق-1", number: "Z001", length: 15, category: "زوارق مزدوجة", region: "الجنوب", zone: "جربة", port: "جربة", support_location: "قابس", status: "صيانة", breakdown_type: "كهرباء", breakdown_date: "2024-01-20", end_date: "2024-02-20", reference: "REF002", createdAt: new Date().toISOString() }
        ]);
    }

    if ((await readData('logs.json')).length === 0) await writeData('logs.json', []);
    if ((await readData('tickets.json')).length === 0) await writeData('tickets.json', []);
    if ((await readData('refreshTokens.json')).length === 0) await writeData('refreshTokens.json', []);
}

// ==================== Refresh Tokens ====================
async function saveRefreshToken(userId, token) {
    const refreshTokens = await readData('refreshTokens.json');
    refreshTokens.push({ id: uuidv4(), userId, token, createdAt: new Date().toISOString() });
    await writeData('refreshTokens.json', refreshTokens);
}

async function verifyRefreshToken(token) {
    try {
        const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET);
        const refreshTokens = await readData('refreshTokens.json');
        const exists = refreshTokens.find(rt => rt.token === token && rt.userId === decoded.id);
        if (!exists) return null;
        return decoded;
    } catch {
        return null;
    }
}

async function revokeRefreshToken(token) {
    const refreshTokens = await readData('refreshTokens.json');
    const filtered = refreshTokens.filter(rt => rt.token !== token);
    await writeData('refreshTokens.json', filtered);
}

// ==================== API Routes ====================

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }
    
    const users = await readData('users.json');
    const user = users.find(u => u.username === username && u.enabled === true);
    
    if (!user) {
        await addLog(username, 'غير معروف', 'محاولة دخول فاشلة', 'اسم مستخدم غير موجود', req);
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
        await addLog(username, 'غير معروف', 'محاولة دخول فاشلة', 'كلمة مرور خاطئة', req);
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    const accessToken = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
    
    const refreshToken = jwt.sign(
        { id: user.id, username: user.username },
        REFRESH_TOKEN_SECRET,
        { expiresIn: '7d' }
    );
    
    await saveRefreshToken(user.id, refreshToken);
    await addLog(user.username, user.role, 'تسجيل دخول', 'قام المستخدم بتسجيل الدخول', req);
    
    res.json({
        success: true,
        accessToken,
        refreshToken,
        user: { id: user.id, username: user.username, role: user.role }
    });
});

// تجديد التوكن
app.post('/api/refresh', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token مطلوب' });
    }
    
    const decoded = await verifyRefreshToken(refreshToken);
    if (!decoded) {
        return res.status(403).json({ error: 'Refresh token غير صالح' });
    }
    
    const users = await readData('users.json');
    const user = users.find(u => u.id === decoded.id && u.enabled === true);
    if (!user) {
        return res.status(403).json({ error: 'مستخدم غير موجود أو معطل' });
    }
    
    const newAccessToken = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
    
    res.json({ accessToken: newAccessToken });
});

// تسجيل الخروج
app.post('/api/logout', authenticateToken, async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        await revokeRefreshToken(refreshToken);
    }
    await addLog(req.user.username, req.user.role, 'تسجيل خروج', 'قام المستخدم بتسجيل الخروج', req);
    res.json({ success: true });
});

// ==================== المراكب ====================
app.get('/api/vessels', authenticateToken, async (req, res) => {
    const vessels = await readData('vessels.json');
    res.json(vessels);
});

app.get('/api/vessels/search', authenticateToken, async (req, res) => {
    const { q, category, region, status } = req.query;
    let vessels = await readData('vessels.json');
    
    if (q) {
        vessels = vessels.filter(v => 
            v.name.includes(q) || v.number.includes(q)
        );
    }
    if (category && category !== 'الكل') {
        vessels = vessels.filter(v => v.category === category);
    }
    if (region && region !== 'الكل') {
        vessels = vessels.filter(v => v.region === region);
    }
    if (status && status !== 'الكل') {
        vessels = vessels.filter(v => v.status === status);
    }
    
    res.json(vessels);
});

app.post('/api/vessels', authenticateToken, authorizeRole('مسؤول', 'محرر'), async (req, res) => {
    const { name, number, length, category, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference } = req.body;
    
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'اسم المركب مطلوب' });
    }
    
    const vessels = await readData('vessels.json');
    const newVessel = {
        id: uuidv4(),
        name: name.trim(),
        number: number || '',
        length: parseFloat(length) || 0,
        category: category || '',
        region: region || '',
        zone: zone || '',
        port: port || '',
        support_location: support_location || '',
        status: status || 'صالح',
        breakdown_type: breakdown_type || '',
        breakdown_date: breakdown_date || '',
        end_date: end_date || '',
        reference: reference || '',
        createdAt: new Date().toISOString()
    };
    
    vessels.push(newVessel);
    await writeData('vessels.json', vessels);
    await addLog(req.user.username, req.user.role, 'إضافة مركب', `تم إضافة المركب "${name}"`, req);
    res.json({ success: true, vessel: newVessel });
});

app.put('/api/vessels/:id', authenticateToken, authorizeRole('مسؤول', 'محرر'), async (req, res) => {
    const vessels = await readData('vessels.json');
    const id = req.params.id;
    const index = vessels.findIndex(v => v.id === id);
    
    if (index === -1) {
        return res.status(404).json({ error: 'المركب غير موجود' });
    }
    
    vessels[index] = { ...req.body, id, updatedAt: new Date().toISOString() };
    await writeData('vessels.json', vessels);
    await addLog(req.user.username, req.user.role, 'تعديل مركب', `تم تعديل المركب "${vessels[index].name}"`, req);
    res.json({ success: true });
});

app.delete('/api/vessels/:id', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const vessels = await readData('vessels.json');
    const id = req.params.id;
    const vessel = vessels.find(v => v.id === id);
    
    if (!vessel) {
        return res.status(404).json({ error: 'المركب غير موجود' });
    }
    
    const filtered = vessels.filter(v => v.id !== id);
    await writeData('vessels.json', filtered);
    await addLog(req.user.username, req.user.role, 'حذف مركب', `تم حذف المركب "${vessel.name}"`, req);
    res.json({ success: true });
});

// ==================== المستخدمين (للمسؤول فقط) ====================
app.get('/api/users', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const users = await readData('users.json');
    const safeUsers = users.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
        enabled: u.enabled,
        createdAt: u.createdAt
    }));
    res.json(safeUsers);
});

app.post('/api/users', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const { username, password, role } = req.body;
    
    if (!username || !username.trim()) {
        return res.status(400).json({ error: 'اسم المستخدم مطلوب' });
    }
    if (!password || password.length < 4) {
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
    }
    
    const users = await readData('users.json');
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
    }
    
    const salt = bcrypt.genSaltSync(10);
    const newUser = {
        id: uuidv4(),
        username: username.trim(),
        password: bcrypt.hashSync(password, salt),
        role: role || 'مشاهد',
        enabled: true,
        createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    await writeData('users.json', users);
    await addLog(req.user.username, req.user.role, 'إضافة مستخدم', `تم إضافة المستخدم "${username}" برتبة ${role}`, req);
    res.json({ success: true });
});

app.put('/api/users/:id/password', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const { password } = req.body;
    const userId = req.params.id;
    
    if (!password || password.length < 4) {
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
    }
    
    const users = await readData('users.json');
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    const salt = bcrypt.genSaltSync(10);
    users[userIndex].password = bcrypt.hashSync(password, salt);
    await writeData('users.json', users);
    await addLog(req.user.username, req.user.role, 'تغيير كلمة مرور', `تم تغيير كلمة مرور المستخدم "${users[userIndex].username}"`, req);
    res.json({ success: true });
});

app.put('/api/users/:id/toggle', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const { enabled } = req.body;
    const userId = req.params.id;
    
    const users = await readData('users.json');
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    if (users[userIndex].username === 'admin' && enabled === false) {
        return res.status(403).json({ error: 'لا يمكن تعطيل المستخدم الرئيسي' });
    }
    
    users[userIndex].enabled = enabled;
    await writeData('users.json', users);
    await addLog(req.user.username, req.user.role, enabled ? 'تفعيل مستخدم' : 'تعطيل مستخدم', `تم ${enabled ? 'تفعيل' : 'تعطيل'} المستخدم "${users[userIndex].username}"`, req);
    res.json({ success: true });
});

app.delete('/api/users/:id', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const userId = req.params.id;
    const users = await readData('users.json');
    const user = users.find(u => u.id === userId);
    
    if (!user) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    if (user.username === 'admin') {
        return res.status(403).json({ error: 'لا يمكن حذف المستخدم الرئيسي' });
    }
    
    if (user.id === req.user.id) {
        return res.status(403).json({ error: 'لا يمكن حذف حسابك الحالي' });
    }
    
    const filtered = users.filter(u => u.id !== userId);
    await writeData('users.json', filtered);
    await addLog(req.user.username, req.user.role, 'حذف مستخدم', `تم حذف المستخدم "${user.username}"`, req);
    res.json({ success: true });
});

// ==================== السجلات ====================
app.get('/api/logs', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const { limit = 200, startDate, endDate } = req.query;
    let logs = await readData('logs.json');
    
    if (startDate) {
        logs = logs.filter(l => l.date && l.date.split('/').reverse().join('-') >= startDate);
    }
    if (endDate) {
        logs = logs.filter(l => l.date && l.date.split('/').reverse().join('-') <= endDate);
    }
    
    res.json(logs.slice(0, parseInt(limit)));
});

app.post('/api/logs', async (req, res) => {
    // هذا المسار للتسجيل من الواجهة الأمامية
    const logs = await readData('logs.json');
    logs.unshift(req.body);
    if (logs.length > 2000) logs.pop();
    await writeData('logs.json', logs);
    res.json({ success: true });
});

// ==================== التذاكر ====================
app.get('/api/tickets', authenticateToken, async (req, res) => {
    const tickets = await readData('tickets.json');
    if (req.user.role !== 'مسؤول') {
        const userTickets = tickets.filter(t => t.username === req.user.username);
        return res.json(userTickets);
    }
    res.json(tickets);
});

app.post('/api/tickets', authenticateToken, async (req, res) => {
    const { subject, message } = req.body;
    
    if (!subject || !subject.trim()) {
        return res.status(400).json({ error: 'عنوان التذكرة مطلوب' });
    }
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'الرسالة مطلوبة' });
    }
    
    const tickets = await readData('tickets.json');
    const newTicket = {
        id: uuidv4(),
        date: new Date().toLocaleDateString('ar-TN'),
        time: new Date().toLocaleTimeString('ar-TN'),
        username: req.user.username,
        subject: subject.trim(),
        message: message.trim(),
        status: 'قيد المعالجة',
        createdAt: new Date().toISOString()
    };
    
    tickets.push(newTicket);
    await writeData('tickets.json', tickets);
    await addLog(req.user.username, req.user.role, 'إرسال تذكرة', `تم إرسال تذكرة: "${subject}"`, req);
    res.json({ success: true });
});

// ==================== تصدير واستيراد ====================
app.get('/api/export', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const data = {
        vessels: await readData('vessels.json'),
        exportDate: new Date().toISOString(),
        exportedBy: req.user.username
    };
    res.json(data);
});

app.post('/api/import', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    const { vessels } = req.body;
    if (vessels && Array.isArray(vessels)) {
        await writeData('vessels.json', vessels);
        await addLog(req.user.username, req.user.role, 'استيراد بيانات', `تم استيراد ${vessels.length} مركب`, req);
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'بيانات غير صالحة' });
    }
});

// ==================== إحصائيات ====================
app.get('/api/stats', authenticateToken, async (req, res) => {
    const vessels = await readData('vessels.json');
    const total = vessels.length;
    const good = vessels.filter(v => v.status === 'صالح').length;
    const broken = vessels.filter(v => v.status === 'معطب').length;
    const maint = vessels.filter(v => v.status === 'صيانة').length;
    
    const categories = {};
    const regions = {};
    
    vessels.forEach(v => {
        categories[v.category] = (categories[v.category] || 0) + 1;
        regions[v.region] = (regions[v.region] || 0) + 1;
    });
    
    res.json({
        total,
        good,
        broken,
        maint,
        efficiency: total ? ((good / total) * 100).toFixed(1) : 0,
        categories,
        regions
    });
});

// ==================== النسخ الاحتياطي اليدوي ====================
app.post('/api/backup', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    await createBackup();
    res.json({ success: true, message: 'تم إنشاء نسخة احتياطية' });
});

app.get('/api/backups', authenticateToken, authorizeRole('مسؤول'), async (req, res) => {
    try {
        const backups = await fs.readdir(BACKUP_DIR);
        const backupFiles = backups.filter(f => f.startsWith('backup_')).map(f => ({
            name: f,
            path: `/backups/${f}`
        }));
        res.json(backupFiles);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في قراءة النسخ الاحتياطية' });
    }
});

// ==================== تشغيل السيرفر ====================
async function startServer() {
    await initData();
    await createBackup(); // نسخة أولية
    
    app.listen(PORT, () => {
        console.log(`\n🚀 السيرفر الآمن النهائي يعمل على http://localhost:${PORT}`);
        console.log(`📁 مجلد البيانات: ${DATA_DIR}`);
        console.log(`📁 مجلد النسخ الاحتياطية: ${BACKUP_DIR}`);
        console.log(`\n🔑 بيانات الدخول (مشفرة):`);
        console.log(`   admin / admin123 (مسؤول كامل الصلاحيات)`);
        console.log(`   editor / editor123 (محرر)`);
        console.log(`   viewer / viewer123 (مشاهد)`);
        console.log(`\n✅ JWT + Refresh Token | ✅ تشفير كلمات المرور | ✅ حماية المسؤول`);
        console.log(`✅ Rate Limiting | ✅ Helmet | ✅ CORS محدود | ✅ نسخ احتياطي تلقائي`);
        console.log(`✅ بحث متقدم | ✅ API إحصائيات | ✅ ترحيل تلقائي للبيانات القديمة\n`);
    });
}

startServer();
