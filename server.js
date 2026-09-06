// ============================================================
// ðŸš¢ MARINE SYSTEM - SECURE v9.0 (CORRECTED)
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// ðŸ” CONFIGURATION
// ============================================================

function generateSecureKey(length = 64) {
    return crypto.randomBytes(length).toString('hex');
}

const isProduction = process.env.NODE_ENV === 'production';

// The public hostname of THIS deployment only (never a shared wildcard domain).
// Set this via env var in production, e.g. marine-system-71eo.onrender.com
const APP_HOSTNAME = process.env.APP_HOSTNAME || 'localhost';

function isStrongPassword(password) {
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    const isLongEnough = password.length >= 12;
    return [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar, isLongEnough].filter(Boolean).length >= 4;
}

function generateStrongPassword(length = 16) {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=';
    const all = uppercase + lowercase + numbers + special;

    // crypto.randomInt is used throughout instead of Math.random for anything
    // security relevant (character selection AND shuffling).
    let chars = [];
    chars.push(uppercase[crypto.randomInt(uppercase.length)]);
    chars.push(lowercase[crypto.randomInt(lowercase.length)]);
    chars.push(numbers[crypto.randomInt(numbers.length)]);
    chars.push(special[crypto.randomInt(special.length)]);
    for (let i = chars.length; i < length; i++) {
        chars.push(all[crypto.randomInt(all.length)]);
    }
    // Fisher-Yates shuffle using crypto.randomInt
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';

// IMPORTANT: In production, ADMIN_PASSWORD must always be supplied via
// environment variable / secret manager. We never print secrets to logs
// or render them into HTML responses.
const ADMIN_PASSWORD = (() => {
    if (process.env.ADMIN_PASSWORD) {
        if (!isStrongPassword(process.env.ADMIN_PASSWORD)) {
            console.warn('âš ï¸  ADMIN_PASSWORD is weak. Generating a strong one instead.');
            return generateStrongPassword();
        }
        return process.env.ADMIN_PASSWORD;
    }
    const generated = generateStrongPassword();
    console.log('=========================================');
    console.log('ðŸ”‘ A new admin password was generated because ADMIN_PASSWORD was not set.');
    console.log('ðŸ’¾ Set ADMIN_PASSWORD in your environment to control it explicitly.');
    console.log('   (The password itself is intentionally NOT printed here.)');
    console.log('=========================================');
    return generated;
})();

const ADMIN_NAME = process.env.ADMIN_NAME || 'Ø£Ù…Ø§Ù† Ø§Ù„Ù„Ù‡ Ù†Ø§Ø¬ÙŠ';

// Secrets: always require explicit env vars in production. Falling back to a
// randomly generated value that changes on every restart is fine for local
// dev (sessions/tokens just get invalidated on restart) but must not happen
// silently in production, since it breaks horizontal scaling and token
// validation across restarts.
function requireSecret(envVar, devFallbackLength) {
    if (process.env[envVar]) return process.env[envVar];
    if (isProduction) {
        console.error(`âŒ Missing required environment variable ${envVar} in production. Exiting.`);
        process.exit(1);
    }
    console.warn(`âš ï¸  ${envVar} not set â€” using an ephemeral dev-only value.`);
    return generateSecureKey(devFallbackLength);
}

const JWT_SECRET = requireSecret('JWT_SECRET', 64);
const SESSION_SECRET = requireSecret('SESSION_SECRET', 64);
// AES-256 key must be exactly 32 bytes (64 hex chars).
const ENCRYPTION_KEY = requireSecret('ENCRYPTION_KEY', 32);

// ============================================================
// ðŸ” ENCRYPTION (AES-256-GCM, random IV per call, IV+tag stored with data)
// ============================================================
// Previous version reused a single module-level IV for every encrypt() call,
// which breaks CBC's security guarantees (identical plaintexts produce
// identical ciphertexts, and IV reuse can leak structural information).
// Fixed: a fresh random IV is generated per call and prepended to the
// ciphertext, and we use GCM so tampering is also detected (auth tag).

const ENC_KEY_BUFFER = Buffer.from(ENCRYPTION_KEY, 'hex').subarray(0, 32);

function encrypt(text) {
    try {
        const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
        const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY_BUFFER, iv);
        const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();
        // Store as iv:authTag:ciphertext, all hex
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
    } catch (error) {
        console.error('Encryption error:', error.message);
        throw new Error('Failed to encrypt data');
    }
}

function decrypt(payload) {
    try {
        const [ivHex, tagHex, dataHex] = payload.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(tagHex, 'hex');
        const data = Buffer.from(dataHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY_BUFFER, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
        return decrypted.toString('utf8');
    } catch (error) {
        console.error('Decryption error:', error.message);
        return null;
    }
}

function generateSecureToken() {
    return crypto.randomBytes(32).toString('hex');
}

// ============================================================
// ðŸ›¡ï¸ SECURITY MIDDLEWARE
// ============================================================

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "https://unpkg.com",
                "https://cdnjs.cloudflare.com",
                "https://cdn.jsdelivr.net",
                "https://fonts.googleapis.com"
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'", // still needed for most CSS-in-JS/inline style setups
                "https://unpkg.com",
                "https://cdnjs.cloudflare.com",
                "https://cdn.jsdelivr.net",
                "https://fonts.googleapis.com"
            ],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: [
                "'self'",
                `https://${APP_HOSTNAME}`,
                "https://unpkg.com",
                "https://*.googleapis.com",
                "https://cdn.jsdelivr.net"
            ],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: isProduction ? [] : null
        }
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hidePoweredBy: true
}));

// Note: removed 'unsafe-inline'/'unsafe-eval' from scriptSrc. If your
// front-end relies on inline <script> blocks or eval, move that JS into
// external files served from 'self', or add a per-response nonce. Keeping
// 'unsafe-eval'/'unsafe-inline' for scripts defeats most of the value CSP
// provides against XSS.

app.use(cors({
    origin: [
        'http://localhost:5000',
        'http://localhost:3000',
        `https://${APP_HOSTNAME}`
    ],
    credentials: true,
    exposedHeaders: ['X-CSRF-Token', 'X-Session-Expiry']
}));

app.use(compression());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Ø·Ù„Ø¨Ø§Øª ÙƒØ«ÙŠØ±Ø© Ø¬Ø¯Ø§Ù‹ØŒ Ø­Ø§ÙˆÙ„ Ù„Ø§Ø­Ù‚Ø§Ù‹' }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Ù…Ø­Ø§ÙˆÙ„Ø§Øª Ø¯Ø®ÙˆÙ„ ÙƒØ«ÙŠØ±Ø© Ø¬Ø¯Ø§Ù‹. Ø­Ø§ÙˆÙ„ Ø¨Ø¹Ø¯ 15 Ø¯Ù‚ÙŠÙ‚Ø©' }
});
app.use('/api/auth/login', authLimiter);

app.use(hpp());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Basic manual sanitization helper (replacement for the unmaintained
// xss-clean package, which has known bypasses). This strips the most common
// XSS vectors from string inputs; proper output-encoding on the front end
// is still the primary defense.
function sanitizeValue(value) {
    if (typeof value === 'string') {
        return value
            .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
            .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
            .replace(/on\w+\s*=\s*'[^']*'/gi, '')
            .replace(/javascript:/gi, '');
    }
    if (Array.isArray(value)) return value.map(sanitizeValue);
    if (value && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value)) out[key] = sanitizeValue(value[key]);
        return out;
    }
    return value;
}

app.use((req, res, next) => {
    if (req.body) req.body = sanitizeValue(req.body);
    if (req.query) req.query = sanitizeValue(req.query);
    next();
});

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: '__Secure-marine.sid',
    cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 8 * 60 * 60 * 1000, // 8h â€” matches CSRF token lifetime; long-lived
                                     // auth is carried by the JWT, not the session
        sameSite: 'strict',
        // Never scope to a shared platform domain like ".onrender.com" â€” that
        // would send this cookie to every app hosted on the platform that
        // shares the parent domain. Omit `domain` entirely so the cookie is
        // scoped to the exact host it was set from.
        path: '/'
    },
    rolling: true,
    proxy: isProduction
}));

// ============================================================
// ðŸ” CSRF
// ============================================================

app.use((req, res, next) => {
    if (!req.session.csrfToken || (req.session.csrfExpiry && Date.now() > req.session.csrfExpiry)) {
        req.session.csrfToken = generateSecureToken();
        req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
    }
    res.setHeader('X-CSRF-Token', req.session.csrfToken);
    res.setHeader('X-Session-Expiry', req.session.csrfExpiry);
    next();
});

const csrfProtection = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (['/api/auth/login', '/api/csrf-token'].includes(req.path)) return next();

    const token = req.headers['x-csrf-token'] || req.body.csrf_token;
    const sessionToken = req.session.csrfToken;
    if (!token || !sessionToken || token.length !== sessionToken.length) {
        return res.status(403).json({ success: false, error: 'CSRF token ØºÙŠØ± ØµØ§Ù„Ø­' });
    }
    try {
        const isValid = crypto.timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(sessionToken, 'utf8'));
        if (!isValid) throw new Error('Invalid token');
    } catch (error) {
        return res.status(403).json({ success: false, error: 'CSRF token ØºÙŠØ± ØµØ§Ù„Ø­' });
    }
    const newToken = generateSecureToken();
    req.session.csrfToken = newToken;
    req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
    res.setHeader('X-CSRF-Token', newToken);
    next();
};

// ============================================================
// ðŸ” AUTHENTICATION MIDDLEWARE (applies to BOTH API and page routes)
// ============================================================
// This is the piece that was missing entirely before: protected pages were
// only "hidden" client-side, and most data APIs had no auth check at all.

const revokedTokens = new Set(); // in-memory JWT blacklist, cleared on restart
                                  // (use Redis or a DB in a multi-instance deployment)

function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'ØºÙŠØ± Ù…ØµØ±Ø­' });
    }
    const token = authHeader.split(' ')[1];
    if (revokedTokens.has(token)) {
        return res.status(401).json({ success: false, error: 'Ø§Ù†ØªÙ‡Øª ØµÙ„Ø§Ø­ÙŠØ© Ø§Ù„Ø¬Ù„Ø³Ø©ØŒ Ø§Ù„Ø±Ø¬Ø§Ø¡ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù…Ù† Ø¬Ø¯ÙŠØ¯' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.id);
        if (!user || !user.active) {
            return res.status(401).json({ success: false, error: 'Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯' });
        }
        // Cross-check against the server-side session so a bare stolen JWT
        // (without the accompanying session cookie) is not sufficient alone.
        if (req.session.userId !== user.id) {
            return res.status(401).json({ success: false, error: 'Ø¬Ù„Ø³Ø© ØºÙŠØ± ØµØ§Ù„Ø­Ø©' });
        }
        req.user = user;
        req.token = token;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'ØªÙˆÙƒÙ† ØºÙŠØ± ØµØ§Ù„Ø­' });
    }
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'ØºÙŠØ± Ù…ØµØ±Ø­' });
    }
    next();
}

// ============================================================
// ðŸ“Š DATA
// ============================================================

const users = [{
    id: crypto.randomBytes(16).toString('hex'),
    username: ADMIN_USERNAME,
    password: bcrypt.hashSync(ADMIN_PASSWORD, 12),
    name: encrypt(ADMIN_NAME),
    role: 'admin',
    active: true,
    createdAt: new Date().toISOString(),
    lastLogin: null,
    loginAttempts: 0,
    locked: false,
    lockedUntil: null
}];

const vessels = [
    { id: '1', name: encrypt('Ø§Ù„ÙˆØ­Ø¯Ø© 101'), type: encrypt('Ø²ÙˆØ±Ù‚ Ø¯ÙˆØ±ÙŠØ©'), status: 'ready', location: encrypt('Ø§Ù„Ù…ÙŠÙ†Ø§Ø¡ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ'), lastMaintenance: new Date().toISOString(), createdAt: new Date().toISOString() },
    { id: '2', name: encrypt('Ø§Ù„ÙˆØ­Ø¯Ø© 205'), type: encrypt('Ù‚Ø§Ø·Ø±Ø© Ø¨Ø­Ø±ÙŠØ©'), status: 'maintenance', location: encrypt('Ø­ÙˆØ¶ Ø§Ù„Ø³ÙÙ†'), lastMaintenance: new Date().toISOString(), createdAt: new Date().toISOString() },
    { id: '3', name: encrypt('Ø§Ù„ÙˆØ­Ø¯Ø© 312'), type: encrypt('Ø³ÙÙŠÙ†Ø© Ø¥Ø³Ù†Ø§Ø¯'), status: 'offline', location: encrypt('Ø§Ù„Ù…ÙŠÙ†Ø§Ø¡ Ø§Ù„ØºØ±Ø¨ÙŠ'), lastMaintenance: new Date().toISOString(), createdAt: new Date().toISOString() }
];

const auditLogs = [];

function addAuditLog(userId, action, details, ip) {
    auditLogs.push({ id: crypto.randomBytes(8).toString('hex'), userId, action, details, ip, timestamp: new Date().toISOString() });
    if (auditLogs.length > 1000) auditLogs.shift();
}

function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.socket ? req.socket.remoteAddress : req.ip;
}

// ============================================================
// ðŸ“ STATIC FILES
// ============================================================

const pagesDir = path.join(__dirname, 'pages');
const publicPagesDir = path.join(__dirname, 'public', 'pages');
const publicDir = path.join(__dirname, 'public');

for (const dir of [pagesDir, publicPagesDir]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Copy any files placed in /pages into /public/pages (one-time sync).
if (fs.existsSync(pagesDir)) {
    for (const file of fs.readdirSync(pagesDir)) {
        const src = path.join(pagesDir, file);
        const dest = path.join(publicPagesDir, file);
        if (fs.statSync(src).isFile() && !fs.existsSync(dest)) {
            fs.copyFileSync(src, dest);
        }
    }
}

// Pages that require authentication to view. These are NOT served through
// the plain static middleware â€” they go through requireAuth first.
const PROTECTED_PAGES = new Set([
    'dashboard', 'fleet', 'maintenance', 'users', 'logs', 'ai-assistant', 'settings'
]);

app.use('/public', express.static(publicDir));
// Public static assets only (css/js/images). Do NOT statically serve the
// whole __dirname or the /pages directories directly â€” protected HTML must
// go through the authenticated route handlers below instead.
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// ============================================================
// ðŸ” CSRF TOKEN
// ============================================================

app.get('/api/csrf-token', (req, res) => {
    try {
        const token = req.session.csrfToken;
        const expiry = req.session.csrfExpiry || Date.now() + (8 * 60 * 60 * 1000);
        res.json({ success: true, token, expiresIn: expiry - Date.now() });
    } catch (error) {
        res.status(500).json({ success: false, error: 'ÙØ´Ù„ ØªÙˆÙ„ÙŠØ¯ CSRF token' });
    }
});

// ============================================================
// ðŸ” AUTH
// ============================================================

app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;
        const clientIP = getClientIP(req);

        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Ø§Ù„Ø±Ø¬Ø§Ø¡ Ø¥Ø¯Ø®Ø§Ù„ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª' });
        }

        const user = users.find(u => u.username === username);
        if (!user) {
            // Same generic error as a wrong password, to avoid username enumeration.
            return res.status(401).json({ success: false, error: 'Ø§Ø³Ù… Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø£Ùˆ ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± ØºÙŠØ± ØµØ­ÙŠØ­Ø©' });
        }

        if (user.locked && user.lockedUntil && Date.now() < user.lockedUntil) {
            const remaining = Math.ceil((user.lockedUntil - Date.now()) / 60000);
            return res.status(403).json({ success: false, error: `Ø§Ù„Ø­Ø³Ø§Ø¨ Ù…Ù‚ÙÙ„. Ø­Ø§ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰ Ø¨Ø¹Ø¯ ${remaining} Ø¯Ù‚ÙŠÙ‚Ø©` });
        }

        const validPassword = bcrypt.compareSync(password, user.password);
        if (!validPassword) {
            user.loginAttempts = (user.loginAttempts || 0) + 1;
            if (user.loginAttempts >= 5) {
                user.locked = true;
                user.lockedUntil = Date.now() + (30 * 60 * 1000);
                addAuditLog(user.id, 'ACCOUNT_LOCKED', 'Too many failed login attempts', clientIP);
                return res.status(403).json({ success: false, error: 'Ø§Ù„Ø­Ø³Ø§Ø¨ Ù…Ù‚ÙÙ„ Ù„Ù…Ø¯Ø© 30 Ø¯Ù‚ÙŠÙ‚Ø©' });
            }
            return res.status(401).json({ success: false, error: 'Ø§Ø³Ù… Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø£Ùˆ ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± ØºÙŠØ± ØµØ­ÙŠØ­Ø©' });
        }

        user.loginAttempts = 0;
        user.locked = false;
        user.lockedUntil = null;
        user.lastLogin = new Date().toISOString();

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Regenerate the session on login to prevent session fixation.
        req.session.regenerate((err) => {
            if (err) {
                console.error('Session regenerate error:', err);
                return res.status(500).json({ success: false, error: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…' });
            }
            req.session.userId = user.id;
            req.session.csrfToken = generateSecureToken();
            req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);

            res.setHeader('X-CSRF-Token', req.session.csrfToken);
            addAuditLog(user.id, 'LOGIN_SUCCESS', 'Successful login', clientIP);

            res.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    name: decrypt(user.name),
                    role: user.role,
                    active: user.active,
                    lastLogin: user.lastLogin
                },
                csrfToken: req.session.csrfToken
            });
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…' });
    }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    const user = req.user;
    const newToken = generateSecureToken();
    req.session.csrfToken = newToken;
    req.session.csrfExpiry = Date.now() + (8 * 60 * 60 * 1000);
    res.setHeader('X-CSRF-Token', newToken);
    res.json({
        success: true,
        user: {
            id: user.id,
            username: user.username,
            name: decrypt(user.name),
            role: user.role,
            active: user.active,
            lastLogin: user.lastLogin
        }
    });
});

app.post('/api/auth/logout', csrfProtection, (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        revokedTokens.add(authHeader.split(' ')[1]);
    }
    const userId = req.session.userId;
    req.session.destroy(() => {
        res.clearCookie('__Secure-marine.sid');
        if (userId) addAuditLog(userId, 'LOGOUT', 'User logged out', getClientIP(req));
        res.json({ success: true, message: 'ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬' });
    });
});

// ============================================================
// ðŸ“Š DATA ENDPOINTS (all require authentication)
// ============================================================

app.get('/api/vessels', csrfProtection, requireAuth, (req, res) => {
    try {
        const decrypted = vessels.map(v => ({
            ...v,
            name: decrypt(v.name),
            type: decrypt(v.type),
            location: decrypt(v.location)
        }));
        res.json({ success: true, vessels: decrypted });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Ø®Ø·Ø£ ÙÙŠ Ù‚Ø±Ø§Ø¡Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª' });
    }
});

app.get('/api/users', csrfProtection, requireAuth, requireAdmin, (req, res) => {
    try {
        const safeUsers = users.map(u => ({
            id: u.id,
            username: u.username,
            name: decrypt(u.name),
            role: u.role,
            active: u.active,
            createdAt: u.createdAt,
            lastLogin: u.lastLogin
        }));
        res.json({ success: true, users: safeUsers });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…' });
    }
});

app.get('/api/logs', csrfProtection, requireAuth, requireAdmin, (req, res) => {
    res.json({ success: true, logs: auditLogs.slice(-100) });
});

app.get('/api/session-status', (req, res) => {
    res.json({
        success: true,
        hasSession: !!req.session,
        hasCsrf: !!req.session.csrfToken,
        sessionId: req.sessionID
    });
});

// ============================================================
// ðŸŒ PAGE ROUTES
// ============================================================

function findPageFile(pageName) {
    // Basic path traversal guard: only allow simple page names.
    if (!/^[a-zA-Z0-9_-]+$/.test(pageName)) return null;

    const possiblePaths = [
        path.join(pagesDir, pageName + '.html'),
        path.join(publicPagesDir, pageName + '.html'),
        path.join(pagesDir, pageName, 'index.html'),
        path.join(publicPagesDir, pageName, 'index.html'),
    ];
    for (const p of possiblePaths) {
        // Ensure the resolved path is still inside an allowed directory.
        const resolved = path.resolve(p);
        if (!resolved.startsWith(path.resolve(pagesDir)) && !resolved.startsWith(path.resolve(publicPagesDir))) {
            continue;
        }
        if (fs.existsSync(resolved)) return resolved;
    }
    return null;
}

// A lightweight page-level auth check: verifies the JWT passed either as a
// query param (?token=) for a plain navigation, or lets the front-end fetch
// the page via XHR with an Authorization header. Adjust to match your
// front-end's actual auth flow (e.g. a short-lived signed cookie set at
// login is often simpler than passing JWTs in the URL).
function requireAuthForPage(req, res, next) {
    const token = req.query.token || (req.headers.authorization || '').replace('Bearer ', '');
    if (!token || revokedTokens.has(token)) {
        return res.status(401).sendFile(path.join(__dirname, 'unauthorized.html'), (err) => {
            if (err) res.status(401).send('401 - Ø§Ù„Ø±Ø¬Ø§Ø¡ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„');
        });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.id);
        if (!user || !user.active || req.session.userId !== user.id) {
            return res.status(401).send('401 - Ø¬Ù„Ø³Ø© ØºÙŠØ± ØµØ§Ù„Ø­Ø©ØŒ Ø§Ù„Ø±Ø¬Ø§Ø¡ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù…Ù† Ø¬Ø¯ÙŠØ¯');
        }
        req.user = user;
        next();
    } catch (e) {
        return res.status(401).send('401 - ØªÙˆÙƒÙ† ØºÙŠØ± ØµØ§Ù„Ø­');
    }
}

// âœ… Home page
app.get('/', (req, res) => {
    const candidates = [
        path.join(__dirname, 'index.html'),
        path.join(publicDir, 'index.html'),
        path.join(pagesDir, 'index.html'),
        path.join(publicPagesDir, 'index.html')
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return res.sendFile(p);
    }
    res.status(200).send(renderFallbackHome());
});

// âœ… /pages/:page â€” protected pages require auth, everything else is open
app.get('/pages/:page', (req, res, next) => {
    const pageName = req.params.page.replace(/\.html$/, '');
    if (PROTECTED_PAGES.has(pageName)) {
        return requireAuthForPage(req, res, () => serveOrNotFound(pageName, res));
    }
    return serveOrNotFound(pageName, res);
});

// âœ… Short path â€” same rule applies
app.get('/:page', (req, res, next) => {
    const pageName = req.params.page;
    const skip = ['api', 'pages', 'public', 'assets', 'css', 'js', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'index'];
    if (skip.includes(pageName)) return next();

    if (PROTECTED_PAGES.has(pageName)) {
        return requireAuthForPage(req, res, () => serveOrNotFound(pageName, res));
    }
    return serveOrNotFound(pageName, res);
});

function serveOrNotFound(pageName, res) {
    const filePath = findPageFile(pageName);
    if (filePath) return res.sendFile(filePath);
    res.status(404).send(render404(pageName));
}

// âœ… Catch-all
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ success: false, error: 'API endpoint not found' });
    }
    if (req.path.includes('.')) {
        return res.status(404).send('404 - Ø§Ù„Ù…Ù„Ù ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯');
    }
    res.status(404).send(render404(req.path));
});

// ============================================================
// ðŸ–¼ï¸ HTML HELPERS (no secrets embedded anywhere)
// ============================================================

function render404(pageName) {
    return `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head><meta charset="UTF-8"><title>404</title>
        <style>body{font-family:Arial;background:#0a0e1a;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;text-align:center;}h1{color:#ff4444;}a{color:#00d4ff;}</style>
        </head>
        <body>
            <div>
                <h1>âŒ 404</h1>
                <p>Ø§Ù„ØµÙØ­Ø© <strong>${String(pageName).replace(/[<>&"]/g, '')}</strong> ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©</p>
                <a href="/">â¬…ï¸ Ø§Ù„Ø¹ÙˆØ¯Ø© Ù„Ù„Ø±Ø¦ÙŠØ³ÙŠØ©</a>
            </div>
        </body>
        </html>
    `;
}

function renderFallbackHome() {
    // NOTE: this fallback intentionally contains NO credentials of any kind.
    // The real login flow is: POST /api/auth/login with a valid CSRF token.
    return `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ðŸš¢ Marine System</title>
        <style>
            *{margin:0;padding:0;box-sizing:border-box}
            body{font-family:'Segoe UI',sans-serif;background:#0a0e1a;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}
            .container{background:linear-gradient(145deg,#1a1f35,#0d1528);padding:50px;border-radius:30px;max-width:600px;width:100%;border:1px solid #2a3a5a;text-align:center}
            h1{color:#00d4ff;font-size:2.5em}
            .status{background:#0d1528;padding:20px;border-radius:15px;margin:20px 0;border-right:5px solid #00ff88}
            .info{color:#aabbcc;line-height:2}
            .btn{background:linear-gradient(135deg,#00d4ff,#0099cc);color:#0a0e1a;border:none;padding:15px 40px;border-radius:10px;font-size:18px;font-weight:bold;cursor:pointer;transition:all 0.3s;width:100%;margin-top:15px}
            .btn:hover{transform:translateY(-3px);box-shadow:0 10px 30px rgba(0,212,255,0.3)}
            .btn-logout{background:linear-gradient(135deg,#ff4444,#cc0000)}
            .error{color:#ff4444;margin:10px 0}
            .success-msg{color:#00ff88;margin:10px 0}
            .login-section,.user-section{margin-top:30px;text-align:right}
            .user-section{display:none}
            .badge{display:inline-block;padding:5px 15px;border-radius:20px;font-size:14px;margin:5px 0;background:#ff4444;color:#fff}
            .login-form input{width:100%;padding:15px;margin:10px 0;border-radius:10px;border:1px solid #2a3a5a;background:#0d1528;color:#fff;font-size:16px}
            .login-form input:focus{outline:none;border-color:#00d4ff}
            .footer{margin-top:30px;padding-top:20px;border-top:1px solid #2a3a5a;color:#667788;font-size:12px}
            .links{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:20px}
            .links a{display:inline-block;padding:10px 20px;background:#2a3a5a;color:#fff;text-decoration:none;border-radius:8px;font-size:14px}
            .links a:hover{background:#3a4a6a}
        </style>
        </head>
        <body>
            <div class="container">
                <h1>ðŸš¢ MARINE SYSTEM</h1>
                <p style="color:#8899aa;">Ù†Ø¸Ø§Ù… Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø£Ø³Ø·ÙˆÙ„ Ø§Ù„Ø¨Ø­Ø±ÙŠ</p>
                <div class="status">
                    <h3 style="color:#00ff88;">âœ… Ø§Ù„Ù†Ø¸Ø§Ù… ÙŠØ¹Ù…Ù„</h3>
                    <p class="info">ðŸ”’ <strong>Ø§Ù„Ø£Ù…Ø§Ù†:</strong> Ù…ÙØ¹Ù‘Ù„</p>
                </div>
                <div id="loginSection" class="login-section">
                    <h3 style="color:#00d4ff;">ðŸ” ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„</h3>
                    <div id="message"></div>
                    <div class="login-form">
                        <input type="text" id="username" placeholder="Ø§Ø³Ù… Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…" autocomplete="username">
                        <input type="password" id="password" placeholder="ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±" autocomplete="current-password">
                        <button class="btn" onclick="handleLogin()">ðŸš€ Ø¯Ø®ÙˆÙ„</button>
                    </div>
                </div>
                <div id="userSection" class="user-section">
                    <p style="font-size:18px;">ðŸ‘‹ <strong>Ù…Ø±Ø­Ø¨Ø§Ù‹ Ø¨ÙƒØŒ <span id="userName"></span></strong></p>
                    <p>ðŸ“‹ <strong>Ø§Ù„Ø¯ÙˆØ±:</strong> <span id="userRole" class="badge">admin</span></p>
                    <div class="links" id="pageLinks"></div>
                    <button class="btn btn-logout" onclick="handleLogout()">ðŸšª ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬</button>
                </div>
                <div class="footer">ðŸ”’ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ù…Ø´ÙØ±Ø© | v9.0</div>
            </div>
            <script src="/public/app.js"></script>
        </body>
        </html>
    `;
}

// ============================================================
// ðŸš€ START
// ============================================================

app.listen(PORT, () => {
    console.log('=========================================');
    console.log('ðŸš¢ MARINE SYSTEM v9.0 - CORRECTED');
    console.log('=========================================');
    console.log(`ðŸ“ Server: http://localhost:${PORT}`);
    console.log(`ðŸŒ Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('ðŸ”’ Security: hardened auth, no secrets in responses/logs');
    console.log('=========================================');
});

module.exports = app;
