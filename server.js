const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

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
// 📁 قاعدة البيانات
// ============================================================

const DB_PATH = path.join(__dirname, 'data');
const USERS_FILE = path.join(DB_PATH, 'users.json');
const VESSELS_FILE = path.join(DB_PATH, 'vessels.json');
const MAINTENANCE_FILE = path.join(DB_PATH, 'maintenance.json');
const TICKETS_FILE = path.join(DB_PATH, 'tickets.json');
const NOTES_FILE = path.join(DB_PATH, 'notes.json');
const SESSIONS_FILE = path.join(DB_PATH, 'sessions.json');
const LOCATIONS_FILE = path.join(DB_PATH, 'locations.json');

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
// 👤 دوال المستخدمين
// ============================================================

function getUsers() {
    return readData(USERS_FILE);
}

function getUserByEmail(email) {
    return getUsers().find(u => u.email === email);
}

function getUserById(id) {
    return getUsers().find(u => u.id === id);
}

// ============================================================
// 🕐 دوال الجلسات
// ============================================================

function getSessions() {
    return readData(SESSIONS_FILE);
}

function getSessionByUserId(userId) {
    const sessions = getSessions();
    return sessions.find(s => s.userId === userId && s.isActive === true);
}

function createSession(userId, username, role, deviceInfo, ipAddress) {
    const sessions = getSessions();
    const filtered = sessions.filter(s => s.userId !== userId);
    
    const newSession = {
        sessionId: uuidv4(),
        userId: userId,
        username: username,
        role: role,
        device: deviceInfo.device || 'غير معروف',
        browser: deviceInfo.browser || 'غير معروف',
        os: deviceInfo.os || 'غير معروف',
        ipAddress: ipAddress || 'غير معروف',
        loginTime: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        status: 'online',
        isActive: true,
        lat: null,
        lng: null,
        accuracy: null
    };
    
    filtered.push(newSession);
    writeData(SESSIONS_FILE, filtered);
    return newSession;
}

function updateSessionActivity(sessionId) {
    const sessions = getSessions();
    const session = sessions.find(s => s.sessionId === sessionId);
    if (session) {
        session.lastActivity = new Date().toISOString();
        session.status = 'online';
        writeData(SESSIONS_FILE, sessions);
        return session;
    }
    return null;
}

function logoutSession(sessionId) {
    const sessions = getSessions();
    const session = sessions.find(s => s.sessionId === sessionId);
    if (session) {
        session.status = 'offline';
        session.isActive = false;
        session.logoutTime = new Date().toISOString();
        writeData(SESSIONS_FILE, sessions);
        return session;
    }
    return null;
}

// ============================================================
// 📍 دوال مواقع GPS
// ============================================================

function getLocations() {
    return readData(LOCATIONS_FILE);
}

function updateUserLocation(userId, username, role, lat, lng, accuracy) {
    const locations = getLocations();
    const existing = locations.find(l => l.userId === userId);
    
    const locationData = {
        userId: userId,
        username: username,
        role: role,
        lat: lat,
        lng: lng,
        accuracy: accuracy || null,
        updatedAt: new Date().toISOString(),
        status: 'online'
    };
    
    if (existing) {
        Object.assign(existing, locationData);
    } else {
        locations.push(locationData);
    }
    
    writeData(LOCATIONS_FILE, locations);
    return locationData;
}

function getAllLocations() {
    const locations = getLocations();
    const now = Date.now();
    const timeout = 5 * 60 * 1000;
    
    return locations.map(l => {
        const lastUpdate = new Date(l.updatedAt).getTime();
        if ((now - lastUpdate) > timeout) {
            l.status = 'offline';
        } else {
            l.status = 'online';
        }
        return l;
    });
}

// ============================================================
// 🌐 دوال الجهاز
// ============================================================

function getDeviceInfo(req) {
    const userAgent = req.headers['user-agent'] || '';
    let device = 'غير معروف';
    let browser = 'غير معروف';
    let os = 'غير معروف';
    
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';
    else if (userAgent.includes('Edg')) browser = 'Edge';
    else if (userAgent.includes('Opera')) browser = 'Opera';
    else if (userAgent.includes('Android') && userAgent.includes('Mobile')) browser = 'Android Browser';
    else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) browser = 'Safari iOS';
    
    if (userAgent.includes('Windows NT 10.0')) os = 'Windows 10/11';
    else if (userAgent.includes('Windows NT 6.1')) os = 'Windows 7';
    else if (userAgent.includes('Mac OS X')) os = 'macOS';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    
    if (userAgent.includes('Mobile')) {
        if (userAgent.includes('iPhone')) device = 'iPhone';
        else if (userAgent.includes('iPad')) device = 'iPad';
        else if (userAgent.includes('Android')) {
            const match = userAgent.match(/Android\s([\d.]+)/);
            device = match ? `Android ${match[1]}` : 'Android Phone';
        } else {
            device = 'Mobile Device';
        }
    } else {
        device = 'Computer / Laptop';
    }
    
    return { device, browser, os };
}

function getClientIP(req) {
    return req.headers['x-forwarded-for'] || 
           req.headers['x-real-ip'] || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress || 
           'غير معروف';
}

// ============================================================
// 🔐 المصادقة
// ============================================================

function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    
    req.user = decoded;
    next();
}

// ============================================================
// 📍 Socket.IO (لتحديث المواقع الفوري)
// ============================================================

const http = require('http');
const socketIo = require('socket.io');

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// تخزين مواقع المستخدمين في الذاكرة
const userLocations = new Map();

io.on('connection', (socket) => {
    console.log('✅ مستخدم متصل:', socket.id);
    
    socket.on('update-location', (data) => {
        const { userId, username, role, lat, lng, accuracy, token } = data;
        
        if (!token) return;
        const decoded = verifyToken(token);
        if (!decoded) return;
        
        userLocations.set(userId, {
            userId,
            username,
            role,
            lat,
            lng,
            accuracy,
            updatedAt: new Date().toISOString(),
            socketId: socket.id,
            status: 'online'
        });
        
        updateUserLocation(userId, username, role, lat, lng, accuracy);
        
        io.emit('location-update', {
            userId,
            username,
            role,
            lat,
            lng,
            accuracy,
            updatedAt: new Date().toISOString(),
            status: 'online'
        });
        
        console.log(`📍 ${username} - ${lat}, ${lng}`);
    });
    
    socket.on('get-locations', () => {
        const allLocations = Array.from(userLocations.values());
        socket.emit('all-locations', allLocations);
    });
    
    socket.on('disconnect', () => {
        console.log('❌ مستخدم disconnected:', socket.id);
        for (const [userId, data] of userLocations) {
            if (data.socketId === socket.id) {
                data.status = 'offline';
                io.emit('user-offline', { userId });
                break;
            }
        }
    });
});

// ============================================================
// 🚀 API Routes
// ============================================================

// ---------- المصادقة ----------
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email and password required' });
    }
    
    const user = getUserByEmail(email);
    if (!user) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    if (!bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    if (!user.isActive) {
        return res.status(401).json({ success: false, error: 'Account is disabled' });
    }
    
    const ipAddress = getClientIP(req);
    const deviceInfo = getDeviceInfo(req);
    
    const session = createSession(
        user.id,
        user.name,
        user.role,
        deviceInfo,
        ipAddress
    );
    
    const token = generateToken(user);
    const { password: _, ...userWithoutPassword } = user;
    
    res.json({
        success: true,
        token: token,
        user: userWithoutPassword,
        session: {
            sessionId: session.sessionId,
            device: session.device,
            browser: session.browser,
            ipAddress: session.ipAddress,
            loginTime: session.loginTime
        }
    });
});

app.post('/api/auth/logout', authenticate, (req, res) => {
    const session = getSessionByUserId(req.user.id);
    if (session) {
        logoutSession(session.sessionId);
    }
    res.json({ success: true, message: 'Logged out successfully' });
});

app.post('/api/auth/activity', authenticate, (req, res) => {
    const session = getSessionByUserId(req.user.id);
    if (session) {
        updateSessionActivity(session.sessionId);
    }
    res.json({ success: true });
});

// ---------- المواقع GPS ----------
app.post('/api/location', authenticate, (req, res) => {
    const { lat, lng, accuracy } = req.body;
    const user = getUserById(req.user.id);
    
    if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const location = updateUserLocation(
        user.id,
        user.name,
        user.role,
        lat,
        lng,
        accuracy
    );
    
    res.json({ success: true, location });
});

app.get('/api/locations', authenticate, (req, res) => {
    const user = getUserById(req.user.id);
    if (user.role !== 'مسؤول') {
        return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const locations = getAllLocations();
    res.json(locations);
});

// ---------- الجلسات ----------
app.get('/api/sessions', authenticate, (req, res) => {
    const user = getUserById(req.user.id);
    if (user.role !== 'مسؤول') {
        return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const sessions = getSessions();
    const now = Date.now();
    const timeout = 5 * 60 * 1000;
    
    const updatedSessions = sessions.map(s => {
        const lastActivity = new Date(s.lastActivity).getTime();
        if (s.isActive && (now - lastActivity) > timeout) {
            s.status = 'offline';
            s.isActive = false;
        } else if (s.isActive) {
            s.status = 'online';
        }
        return s;
    });
    writeData(SESSIONS_FILE, updatedSessions);
    
    res.json(updatedSessions);
});

// ---------- المراكب ----------
app.get('/api/vessels', authenticate, (req, res) => {
    res.json(readData(VESSELS_FILE));
});

app.post('/api/vessels', authenticate, (req, res) => {
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

app.put('/api/vessels/:id', authenticate, (req, res) => {
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

app.delete('/api/vessels/:id', authenticate, (req, res) => {
    const vessels = readData(VESSELS_FILE);
    const id = parseInt(req.params.id);
    const filtered = vessels.filter(v => v.id !== id);
    if (filtered.length === vessels.length) {
        return res.status(404).json({ success: false, error: 'Vessel not found' });
    }
    writeData(VESSELS_FILE, filtered);
    res.json({ success: true });
});

// ---------- الصيانة ----------
app.get('/api/maintenance', authenticate, (req, res) => {
    res.json(readData(MAINTENANCE_FILE));
});

app.post('/api/maintenance', authenticate, (req, res) => {
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

app.put('/api/maintenance/:id', authenticate, (req, res) => {
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

app.delete('/api/maintenance/:id', authenticate, (req, res) => {
    const maintenance = readData(MAINTENANCE_FILE);
    const id = parseInt(req.params.id);
    const filtered = maintenance.filter(r => r.id !== id);
    if (filtered.length === maintenance.length) {
        return res.status(404).json({ success: false, error: 'Record not found' });
    }
    writeData(MAINTENANCE_FILE, filtered);
    res.json({ success: true });
});

// ---------- التذاكر ----------
app.get('/api/tickets', authenticate, (req, res) => {
    res.json(readData(TICKETS_FILE));
});

app.post('/api/tickets', authenticate, (req, res) => {
    const tickets = readData(TICKETS_FILE);
    const newTicket = {
        id: tickets.length > 0 ? Math.max(...tickets.map(t => t.id)) + 1 : 1,
        ...req.body,
        status: req.body.status || 'قيد المعالجة',
        createdAt: new Date().toISOString()
    };
    tickets.push(newTicket);
    writeData(TICKETS_FILE, tickets);
    res.json({ success: true, ticket: newTicket });
});

// ---------- المذكرات ----------
app.get('/api/notes', authenticate, (req, res) => {
    res.json(readData(NOTES_FILE));
});

app.post('/api/notes', authenticate, (req, res) => {
    const notes = readData(NOTES_FILE);
    const newNote = {
        id: notes.length > 0 ? Math.max(...notes.map(n => n.id)) + 1 : 1,
        ...req.body,
        createdAt: new Date().toISOString()
    };
    notes.push(newNote);
    writeData(NOTES_FILE, notes);
    res.json({ success: true, note: newNote });
});

app.put('/api/notes/:id', authenticate, (req, res) => {
    const notes = readData(NOTES_FILE);
    const id = parseInt(req.params.id);
    const index = notes.findIndex(n => n.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'Note not found' });
    }
    notes[index] = { ...notes[index], ...req.body };
    writeData(NOTES_FILE, notes);
    res.json({ success: true, note: notes[index] });
});

app.delete('/api/notes/:id', authenticate, (req, res) => {
    const notes = readData(NOTES_FILE);
    const id = parseInt(req.params.id);
    const filtered = notes.filter(n => n.id !== id);
    if (filtered.length === notes.length) {
        return res.status(404).json({ success: false, error: 'Note not found' });
    }
    writeData(NOTES_FILE, filtered);
    res.json({ success: true });
});

// ---------- المستخدمين ----------
app.get('/api/users', authenticate, (req, res) => {
    const users = getUsers().map(({ password, ...user }) => user);
    res.json(users);
});

app.post('/api/users', authenticate, (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ success: false, error: 'Name, email and password required' });
    }
    if (getUserByEmail(email)) {
        return res.status(400).json({ success: false, error: 'Email already exists' });
    }
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);
    const user = {
        id: uuidv4(),
        name,
        email,
        password: hashedPassword,
        role: role || 'مشاهد',
        isActive: true,
        createdAt: new Date().toISOString()
    };
    const users = getUsers();
    users.push(user);
    writeData(USERS_FILE, users);
    const { password: _, ...userWithoutPassword } = user;
    res.json({ success: true, user: userWithoutPassword });
});

app.put('/api/users/:id', authenticate, (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    if (updates.password) {
        const salt = bcrypt.genSaltSync(10);
        updates.password = bcrypt.hashSync(updates.password, salt);
    }
    const users = getUsers();
    const index = users.findIndex(u => u.id === id);
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'User not found' });
    }
    users[index] = { ...users[index], ...updates };
    writeData(USERS_FILE, users);
    const { password: _, ...userWithoutPassword } = users[index];
    res.json({ success: true, user: userWithoutPassword });
});

app.delete('/api/users/:id', authenticate, (req, res) => {
    const { id } = req.params;
    if (id === req.user.id) {
        return res.status(400).json({ success: false, error: 'Cannot delete yourself' });
    }
    const users = getUsers();
    const filtered = users.filter(u => u.id !== id);
    if (filtered.length === users.length) {
        return res.status(404).json({ success: false, error: 'User not found' });
    }
    writeData(USERS_FILE, filtered);
    res.json({ success: true });
});

// ============================================================
// 📄 تقديم الصفحات
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
// 🔄 تهيئة المستخدمين الافتراضيين
// ============================================================

function initDefaultUsers() {
    const users = getUsers();
    if (users.length === 0) {
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync('123456', salt);
        const defaultUsers = [
            { id: uuidv4(), name: 'مدير النظام', email: 'admin', password: hashedPassword, role: 'مسؤول', isActive: true, createdAt: new Date().toISOString() },
            { id: uuidv4(), name: 'مدير العمليات', email: 'manager', password: hashedPassword, role: 'مشرف', isActive: true, createdAt: new Date().toISOString() },
            { id: uuidv4(), name: 'محرر', email: 'editor', password: hashedPassword, role: 'محرر', isActive: true, createdAt: new Date().toISOString() },
            { id: uuidv4(), name: 'مشاهد', email: 'viewer', password: hashedPassword, role: 'مشاهد', isActive: true, createdAt: new Date().toISOString() }
        ];
        writeData(USERS_FILE, defaultUsers);
        console.log('✅ تم إنشاء المستخدمين الافتراضيين');
    }
}

// ============================================================
// 🚀 تشغيل الخادم
// ============================================================

initDefaultUsers();

server.listen(PORT, () => {
    console.log('========================================');
    console.log('🚀 نظام إدارة الأسطول البحري');
    console.log('========================================');
    console.log(`✅ الخادم يعمل على: http://localhost:${PORT}`);
    console.log(`✅ WebSocket يعمل على: ws://localhost:${PORT}`);
    console.log('========================================');
    console.log('📝 حسابات الدخول:');
    console.log('   admin   / 123456 (مسؤول)');
    console.log('   manager / 123456 (مشرف)');
    console.log('   editor  / 123456 (محرر)');
    console.log('   viewer  / 123456 (مشاهد)');
    console.log('========================================');
});
