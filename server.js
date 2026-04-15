const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== التحقق من المتغيرات ====================
const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SECRET_KEY'];
const missingEnv = requiredEnv.filter(env => !process.env[env]);

if (missingEnv.length > 0) {
    console.error(`❌ خطأ: المتغيرات التالية غير معرفة: ${missingEnv.join(', ')}`);
    console.log('⚠️ سيتم استخدام القيم الافتراضية للتجربة المحلية');
}

app.set('trust proxy', 1);

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
           req.ip || 
           req.connection?.remoteAddress || 
           'unknown';
}

// ==================== الأمان ====================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https://cdn-icons-png.flaticon.com"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

app.use(cors({
    origin: function(origin, callback) {
        const allowedOrigins = [
            'https://marine-system-71eo.onrender.com',
            'http://localhost:3000',
            'http://localhost:5500'
        ];
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'عدد كبير من المحاولات، حاول بعد 15 دقيقة' },
    keyGenerator: (req) => getClientIp(req)
});

app.use('/api/login', loginLimiter);

// ==================== Supabase ====================
const supabaseUrl = process.env.SUPABASE_URL || 'https://rzcwngkpknilfesxdrkk.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6Y3duZ2twa25pbGZlc3hkcmtrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE2MjY0OCwiZXhwIjoyMDkxNzM4NjQ4fQ.dummy';
const SECRET_KEY = process.env.SECRET_KEY || 'marine_super_secret_key_2024';

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase متصل');

// ==================== دوال مساعدة ====================
function getCurrentDateTime() {
    const now = new Date();
    return {
        date: `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}`,
        time: `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`
    };
}

function getCategory(length) {
    const n = parseFloat(length);
    if (n === 11) return "البروق";
    if (n >= 8 && n <= 12) return "صقور";
    if (n > 12 && n <= 25) return "خوافر";
    if (n >= 30) return "طوافات";
    return "زوارق مزدوجة";
}

async function logActivity(userId, username, userRole, action, details, req = null) {
    const { date, time } = getCurrentDateTime();
    const ip = req ? getClientIp(req) : null;
    try {
        await supabase.from('logs').insert([{
            user_id: userId,
            username: username,
            user_role: userRole,
            action: action,
            details: details,
            date: date,
            time: time,
            ip_address: ip
        }]);
    } catch(e) { console.error('خطأ في تسجيل النشاط:', e.message); }
}

// ==================== Middleware ====================
async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'غير مصرح به - يرجى تسجيل الدخول' });
    }
    
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    
    try {
        const verified = jwt.verify(token, SECRET_KEY);
        req.user = verified;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'جلسة غير صالحة - يرجى إعادة تسجيل الدخول' });
    }
}

function verifyAdmin(req, res, next) {
    if (req.user.role !== 'مسؤول') {
        return res.status(403).json({ error: 'ليس لديك صلاحية - هذه الخاصية للمسؤول فقط' });
    }
    next();
}

function verifyEditor(req, res, next) {
    if (req.user.role === 'مسؤول' || req.user.role === 'محرر') {
        return next();
    }
    return res.status(403).json({ error: 'ليس لديك صلاحية - هذه الخاصية للمحرر أو المسؤول فقط' });
}

// ==================== تسجيل الدخول ====================
app.post('/api/login', [
    body('username').isLength({ min: 3 }).trim().escape(),
    body('password').isLength({ min: 4 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'بيانات غير صالحة' });
    }
    
    const { username, password } = req.body;
    
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();
        
        if (error || !user) {
            return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
        
        if (!user.enabled) {
            return res.status(401).json({ error: 'هذا الحساب معطل' });
        }
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
        
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            SECRET_KEY,
            { expiresIn: '8h' }
        );
        
        await logActivity(user.id, user.username, user.role, 'تسجيل دخول', 'قام بتسجيل الدخول بنجاح', req);
        
        res.json({ 
            success: true,
            token: token,
            user: { id: user.id, username: user.username, role: user.role } 
        });
    } catch(err) {
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// ==================== المراكب ====================
app.get('/api/vessels', verifyToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('vessels')
            .select('*')
            .order('id', { ascending: false });
        
        if (error) throw error;
        res.json(data || []);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/vessels', verifyToken, verifyEditor, [
    body('name').isLength({ min: 2 }).trim().escape()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'اسم المركب غير صالح' });
    }
    
    const { name, number, length, region, zone, port, support_location, status, breakdown_type, breakdown_date, end_date, reference } = req.body;
    const category = getCategory(length);
    
    try {
        const { data, error } = await supabase
            .from('vessels')
            .insert([{
                name: name.trim(),
                number, length, region, zone, port, support_location,
                status, breakdown_type, breakdown_date, end_date, reference, category
            }])
            .select();
        
        if (error) throw error;
        
        await logActivity(req.user.id, req.user.username, req.user.role, 'إضافة مركب', `قام بإضافة مركب: ${name}`, req);
        res.json({ success: true, vessel: data[0] });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/vessels/:id', verifyToken, verifyEditor, async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    
    try {
        const { error } = await supabase
            .from('vessels')
            .update({ ...updates, updated_at: new Date() })
            .eq('id', id);
        
        if (error) throw error;
        
        await logActivity(req.user.id, req.user.username, req.user.role, 'تعديل مركب', `قام بتعديل مركب ID: ${id}`, req);
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/vessels/:id', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;
    
    try {
        const { data: vessel } = await supabase
            .from('vessels')
            .select('name')
            .eq('id', id)
            .single();
        
        const { error } = await supabase
            .from('vessels')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        await logActivity(req.user.id, req.user.username, req.user.role, 'حذف مركب', `قام بحذف مركب: ${vessel?.name || 'غير معروف'}`, req);
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== المستخدمين ====================
app.get('/api/users', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, username, role, enabled, created_at')
            .order('id');
        
        if (error) throw error;
        res.json(data || []);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', verifyToken, verifyAdmin, [
    body('username').isLength({ min: 3 }).trim().escape(),
    body('password').isLength({ min: 6 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل وكلمة المرور 6 أحرف' });
    }
    
    const { username, password, role } = req.body;
    
    try {
        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .single();
        
        if (existing) {
            return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
        }
        
        const hash = await bcrypt.hash(password, 10);
        const { error } = await supabase
            .from('users')
            .insert([{ username, password: hash, role: role || 'مشاهد', enabled: true }]);
        
        if (error) throw error;
        
        await logActivity(req.user.id, req.user.username, req.user.role, 'إضافة مستخدم', `تم إضافة مستخدم جديد: ${username}`, req);
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id/password', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    
    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }
    
    try {
        const hash = await bcrypt.hash(password, 10);
        const { error } = await supabase
            .from('users')
            .update({ password: hash })
            .eq('id', id);
        
        if (error) throw error;
        
        await logActivity(req.user.id, req.user.username, req.user.role, 'تغيير كلمة مرور', `تم تغيير كلمة مرور المستخدم ID: ${id}`, req);
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id/toggle', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;
    const { enabled } = req.body;
    
    try {
        const { error } = await supabase
            .from('users')
            .update({ enabled })
            .eq('id', id);
        
        if (error) throw error;
        
        await logActivity(req.user.id, req.user.username, req.user.role, enabled ? 'تفعيل مستخدم' : 'تعطيل مستخدم', `تم ${enabled ? 'تفعيل' : 'تعطيل'} المستخدم ID: ${id}`, req);
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', verifyToken, verifyAdmin, async (req, res) => {
    const { id } = req.params;
    
    try {
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        await logActivity(req.user.id, req.user.username, req.user.role, 'حذف مستخدم', `تم حذف المستخدم ID: ${id}`, req);
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== سجل النشاطات ====================
app.get('/api/logs', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(500);
        
        if (error) throw error;
        res.json(data || []);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== تذاكر الدعم ====================
app.get('/api/tickets', verifyToken, async (req, res) => {
    try {
        let query = supabase.from('tickets').select('*').order('created_at', { ascending: false }).limit(50);
        
        if (req.user.role !== 'مسؤول') {
            query = query.eq('username', req.user.username);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        res.json(data || []);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tickets', verifyToken, [
    body('subject').isLength({ min: 3 }).trim().escape(),
    body('message').isLength({ min: 5 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'العنوان والرسالة غير صالحين' });
    }
    
    const { subject, message } = req.body;
    const { date } = getCurrentDateTime();
    
    try {
        const { error } = await supabase
            .from('tickets')
            .insert([{
                user_id: req.user.id,
                username: req.user.username,
                subject, message, date,
                status: 'قيد المعالجة'
            }]);
        
        if (error) throw error;
        
        await logActivity(req.user.id, req.user.username, req.user.role, 'إرسال تذكرة', `قام بإرسال تذكرة: ${subject}`, req);
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== إحصائيات ====================
app.get('/api/stats', verifyToken, async (req, res) => {
    try {
        const { data: vessels, error } = await supabase.from('vessels').select('*');
        
        if (error) throw error;
        
        const total = vessels.length;
        const salih = vessels.filter(v => v.status === 'صالح').length;
        const mo3atab = vessels.filter(v => v.status === 'معطب').length;
        const siyana = vessels.filter(v => v.status === 'صيانة').length;
        const efficiency = total > 0 ? ((salih / total) * 100).toFixed(1) : 0;
        
        res.json({ total, salih, mo3atab, siyana, efficiency });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== تصدير واستيراد ====================
app.get('/api/export', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { data: vessels, error } = await supabase.from('vessels').select('*').order('id', { ascending: false });
        
        if (error) throw error;
        
        await logActivity(req.user.id, req.user.username, req.user.role, 'تصدير بيانات', 'قام بتصدير البيانات', req);
        res.json({ vessels: vessels || [] });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/import', verifyToken, verifyAdmin, async (req, res) => {
    const { vessels } = req.body;
    
    if (!vessels || !Array.isArray(vessels)) {
        return res.status(400).json({ error: 'بيانات غير صالحة' });
    }
    
    let imported = 0;
    
    const vesselsToInsert = vessels.map(v => ({
        name: v.name,
        number: v.number || '',
        length: v.length || 0,
        region: v.region || '',
        zone: v.zone || '',
        port: v.port || '',
        support_location: v.support_location || '',
        status: v.status || 'صالح',
        breakdown_type: v.breakdown_type || '',
        breakdown_date: v.breakdown_date || '',
        end_date: v.end_date || '',
        reference: v.reference || '',
        category: getCategory(v.length)
    }));
    
    try {
        const { error } = await supabase.from('vessels').insert(vesselsToInsert);
        
        if (error) throw error;
        imported = vesselsToInsert.length;
        
        await logActivity(req.user.id, req.user.username, req.user.role, 'استيراد بيانات', `تم استيراد ${imported} مركب`, req);
        res.json({ success: true, imported });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== تهيئة المستخدمين ====================
async function initializeDefaultUsers() {
    try {
        const { data: existingAdmin } = await supabase
            .from('users')
            .select('id')
            .eq('username', 'admin')
            .single();
        
        if (!existingAdmin) {
            const hash = await bcrypt.hash('1234', 10);
            
            await supabase.from('users').insert([
                { username: 'admin', password: hash, role: 'مسؤول', enabled: true },
                { username: 'editor', password: hash, role: 'محرر', enabled: true },
                { username: 'viewer', password: hash, role: 'مشاهد', enabled: true }
            ]);
            
            console.log('✅ تم إنشاء المستخدمين الافتراضيين (admin/1234, editor/1234, viewer/1234)');
        }
    } catch(err) {
        console.log('⚠️ خطأ في تهيئة المستخدمين:', err.message);
    }
}

// ==================== تشغيل الخادم ====================
initializeDefaultUsers();

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ═══════════════════════════════════════════════════════════════
    🌊 منظومة الوسائل البحرية - الخادم يعمل بنجاح!
    📍 http://localhost:${PORT}
    ───────────────────────────────────────────────────────────────
    👤 حسابات الدخول:
       🔐 مسؤول (admin): admin / 1234
       ✏️ محرر (editor): editor / 1234
       👁️ مشاهد (viewer): viewer / 1234
    ═══════════════════════════════════════════════════════════════
    `);
});
