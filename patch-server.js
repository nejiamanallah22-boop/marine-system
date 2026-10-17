#!/usr/bin/env node
'use strict';
/**
 * patch-server.js — يطبّق الإصلاحات الأمنية على server.js بأمان
 * الاستخدام:  node patch-server.js [مسار server.js]
 *  - ينسخ الملف الأصلي إلى server.js.bak
 *  - يتحقق من وجود كل نقطة تعديل قبل التطبيق
 *  - يفحص صياغة الناتج (node --check) قبل الحفظ
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

process.on('uncaughtException', (e) => { console.error('❌ لم يتم تعديل ملفك. السبب:', e.message); process.exit(1); });

const target = path.resolve(process.argv[2] || 'server.js');
if (!fs.existsSync(target)) { console.error('❌ الملف غير موجود:', target); process.exit(1); }

const raw = fs.readFileSync(target, 'utf8');
const hadCRLF = raw.includes('\r\n');
let src = raw.replace(/\r\n/g, '\n');
const report = [];

function block(fn) { return fn.toString().match(/\/\*\n?([\s\S]*?)\*\/\s*\}$/)[1]; }

// ───────── 3 + 2: DEV TOOLS BLOCKER ─────────
const DEV_BLOCK = block(function () {/*
// ═══ DEV TOOLS BLOCKER (hardened) ═══
const DEV_BLOCKED_PATHS = [
    '/phpinfo', '/phpinfo.php', '/info.php',
    '/_debugbar', '/debugbar', '/telescope', '/horizon',
    '/__clockwork', '/_profiler', '/pma', '/adminer.php',
    '/.git', '/.svn', '/.hg', '/.ds_store'
];
const DANGEROUS_PARAMS = new Set(['debug','dev','test','demo','trace','profiler','xdebug']);

function normalizePath(p) {
    if (typeof p !== 'string') return '';
    let s = p;
    try { s = decodeURIComponent(p); } catch (e) {}
    return s.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase().replace(/\/$/, '') || '/';
}
function isBlockedPath(rawPath) {
    const p = normalizePath(rawPath);
    for (const bp of DEV_BLOCKED_PATHS) {
        if (p === bp || p.startsWith(bp + '/')) return true;
    }
    return false;
}

app.use((req, res, next) => {
    if (process.env.DEV_TOOLS === 'true') return next();

    if (isBlockedPath(req.path)) {
        console.warn(`🚫 Blocked path: ${req.method} ${req.originalUrl} from ${req.ip}`);
        return res.status(404).json({ success: false, error: 'Not Found' });
    }

    if (req.query && typeof req.query === 'object') {
        const cleaned = {};
        let hasDangerous = false;
        for (const [k, v] of Object.entries(req.query)) {
            if (DANGEROUS_PARAMS.has(String(k).toLowerCase())) hasDangerous = true;
            else cleaned[k] = v;
        }
        if (hasDangerous) {
            console.warn(`🚫 Stripped query: ${req.originalUrl} from ${req.ip}`);
            try {
                Object.defineProperty(req, 'query', {
                    value: cleaned, writable: true, configurable: true, enumerable: true
                });
            } catch (e) { req.query = cleaned; }
        }
    }
    next();
});
*/});

// ───────── 6: CORS no-origin writes ─────────
const CORS_BLOCK = block(function () {/*

// 🛡️ في الإنتاج: امنع طلبات الكتابة بدون Origin (curl/Postman/أدوات خارجية)
// للسماح بها مؤقتاً: ALLOW_NO_ORIGIN_WRITES=true
app.use((req, res, next) => {
    if (!isProduction || process.env.ALLOW_NO_ORIGIN_WRITES === 'true') return next();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (!req.headers.origin) {
        console.warn(`🚫 No-origin write blocked: ${req.method} ${req.originalUrl} from ${req.ip}`);
        return res.status(403).json({ success: false, error: 'Origin required' });
    }
    next();
});
*/});

// ───────── 4: screenSessions cleanup ─────────
const SCREEN_BLOCK = block(function () {/*

// 🧹 تنظيف جلسات مشاركة الشاشة المنتهية (منع Memory Leak)
setInterval(() => {
    const now = Date.now();
    const MAX_AGE = 10 * 60 * 1000;
    for (const [id, s] of screenSessions) {
        if (now - s.createdAt > MAX_AGE) screenSessions.delete(id);
    }
}, 60000).unref();
*/});

function applied(marker) { return src.includes(marker); }

// 1) كلمة مرور الأدمن
{
    const a = "if (!isProduction) console.log('🔑 DEV PASSWORD:', ADMIN_PASSWORD);";
    const b = "if (!isProduction) console.log('🔑 DEV PASSWORD: [REDACTED — set ADMIN_PASSWORD in .env]');";
    if (src.includes(b)) report.push('1 ✔ مطبّق مسبقاً');
    else if (src.includes(a)) { src = src.replace(a, b); report.push('1 ✅ إخفاء كلمة المرور'); }
    else throw new Error('لم أجد سطر DEV PASSWORD (1)');
}

// 2+3) DEV TOOLS BLOCKER
{
    if (applied('function isBlockedPath(')) report.push('2+3 ✔ مطبّق مسبقاً');
    else {
        const marker = "const DEV_ENABLED = process.env.DEV_TOOLS === 'true';";
        const mi = src.indexOf(marker);
        if (mi === -1) throw new Error('لم أجد DEV TOOLS BLOCKER (2+3)');
        const start = src.lastIndexOf('app.use((req, res, next) => {', mi);
        const endMarker = "app.use((req, res, next) => {\n    res.setHeader('X-System-Name'";
        const end = src.indexOf(endMarker, mi);
        if (start === -1 || end === -1 || end < mi) throw new Error('حدود DEV TOOLS BLOCKER غير مطابقة (2+3)');
        src = src.slice(0, start) + DEV_BLOCK + src.slice(end);
        report.push('2+3 ✅ حجب المسارات + تنظيف query');
    }
}

// 4) screenSessions
{
    const a = 'const screenSessions = new Map();';
    if (applied('تنظيف جلسات مشاركة الشاشة')) report.push('4 ✔ مطبّق مسبقاً');
    else if (src.includes(a)) { src = src.replace(a, a + SCREEN_BLOCK.replace(/\n$/, '')); report.push('4 ✅ تنظيف screenSessions'); }
    else throw new Error('لم أجد screenSessions (4)');
}

// 5) refresh limiter
{
    const a = "app.post('/api/auth/refresh', async (req, res) => {";
    const b = "app.post('/api/auth/refresh', authLimiter, async (req, res) => {";
    if (src.includes(b)) report.push('5 ✔ مطبّق مسبقاً');
    else if (src.includes(a)) { src = src.replace(a, b); report.push('5 ✅ Rate limit على refresh'); }
    else throw new Error('لم أجد مسار refresh (5)');
}

// 6) CORS
{
    if (applied('ALLOW_NO_ORIGIN_WRITES')) report.push('6 ✔ مطبّق مسبقاً');
    else {
        const s = src.indexOf('app.use(cors({');
        if (s === -1) throw new Error('لم أجد إعداد cors (6)');
        const e = src.indexOf('}));', s);
        if (e === -1) throw new Error('نهاية cors غير موجودة (6)');
        const at = e + 4;
        src = src.slice(0, at) + CORS_BLOCK.replace(/\n$/, '') + src.slice(at);
        report.push('6 ✅ منع الكتابة بدون Origin في الإنتاج');
    }
}

// ───────── فحص الصياغة قبل الحفظ ─────────
const out = hadCRLF ? src.replace(/\n/g, '\r\n') : src;
const tmp = path.join(os.tmpdir(), 'server.patched.check.js');
fs.writeFileSync(tmp, out);
try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
catch (e) {
    console.error('❌ فشل فحص الصياغة — لم يتم تعديل ملفك.\n', String(e.stderr || e.message));
    process.exit(1);
}
console.log('\n' + report.join('\n'));
if (out === raw) {
    console.log('\nℹ️ لا تغييرات جديدة — الملف مُصلَح بالكامل مسبقاً.');
} else {
    let bak = target + '.bak';
    if (fs.existsSync(bak)) bak = target + '.' + Date.now() + '.bak';
    fs.copyFileSync(target, bak);
    fs.writeFileSync(target, out);
    console.log('\n✅ تم. نسخة احتياطية من الأصل: ' + bak);
}

// ───────── 7) Multer ─────────
const up = path.join(path.dirname(target), 'middleware', 'uploadVesselImages.js');
const SUGGESTED = [
    "'use strict';",
    "const multer = require('multer');",
    "const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);",
    "module.exports = multer({",
    "    storage: multer.memoryStorage(),",
    "    limits: { fileSize: 3 * 1024 * 1024, files: 10, fields: 10 },",
    "    fileFilter: (req, file, cb) => {",
    "        if (ALLOWED.has(file.mimetype)) cb(null, true);",
    "        else cb(new Error('يُسمح بالصور فقط (JPG, PNG, WEBP, GIF)'));",
    "    }",
    "});",
    ""
].join('\n');
if (fs.existsSync(up)) {
    const cur = fs.readFileSync(up, 'utf8');
    if (/fileSize/.test(cur)) console.log('7 ✔ uploadVesselImages.js فيه حد للحجم بالفعل');
    else {
        fs.writeFileSync(up.replace(/\.js$/, '.suggested.js'), SUGGESTED);
        console.log('7 ⚠ الملف بلا fileSize — كتبت النسخة المقترحة في uploadVesselImages.suggested.js (راجعها ثم استبدل)');
    }
} else {
    console.log('7 ℹ لم أجد middleware/uploadVesselImages.js — أضف limits.fileSize = 3MB فيه (انظر الرسالة)');
}
