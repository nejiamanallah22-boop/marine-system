نعم. هذا app.js يكون طبقة إنشاء Express والإعدادات الأساسية، ومتوافق مع نماذج MongoDB التي أرسلتها (User, Vessel, Maintenance, Ticket, Note, Log).

> ملاحظة مهمة: هذا app.js وليس server.js. الأفضل أن يبقى تشغيل الخادم وlisten() في server.js.



// ============================================================
// 🚀 app.js - Marine System
// Express Application
// ============================================================

'use strict';

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// ============================================================
// 📦 إنشاء التطبيق
// ============================================================

const app = express();

// ============================================================
// ⚙️ البيئة
// ============================================================

const NODE_ENV = process.env.NODE_ENV || 'development';

const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    'http://localhost:5500';

// ============================================================
// 🔐 Security Headers
// ============================================================

app.disable('x-powered-by');

app.use(
    helmet({
        contentSecurityPolicy:
            NODE_ENV === 'production'
                ? undefined
                : false,

        crossOriginEmbedderPolicy: false
    })
);

// ============================================================
// 🌐 CORS
// ============================================================

const allowedOrigins = FRONTEND_URL
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: function (origin, callback) {

            // السماح للطلبات بدون Origin
            // مثل بعض أدوات الخادم
            if (!origin) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            return callback(
                new Error('CORS: Origin not allowed')
            );
        },

        credentials: true,

        methods: [
            'GET',
            'POST',
            'PUT',
            'PATCH',
            'DELETE',
            'OPTIONS'
        ],

        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'Accept',
            'X-Requested-With'
        ]
    })
);

// ============================================================
// 📦 Body Parser
// ============================================================

app.use(
    express.json({
        limit: '5mb',
        strict: true
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: '5mb'
    })
);

// ============================================================
// 🗜️ Compression
// ============================================================

app.use(
    compression({
        threshold: 1024
    })
);

// ============================================================
// 🚦 Rate Limit عام
// ============================================================

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,

    max: NODE_ENV === 'production'
        ? 1000
        : 5000,

    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        error: 'طلبات كثيرة جداً، حاول لاحقاً'
    }
});

app.use('/api/', apiLimiter);

// ============================================================
// 🔐 Rate Limit تسجيل الدخول
// ============================================================

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,

    max: 10,

    skipSuccessfulRequests: true,

    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        error: 'محاولات تسجيل الدخول كثيرة جداً، حاول بعد قليل'
    }
});

app.use(
    '/api/auth/login',
    loginLimiter
);

// ============================================================
// 📊 Request Logger
// ============================================================

app.use((req, res, next) => {

    const start = Date.now();

    res.on('finish', () => {

        const duration = Date.now() - start;

        if (NODE_ENV !== 'test') {
            console.log(
                `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`
            );
        }
    });

    next();
});

// ============================================================
// 📁 الملفات الثابتة
// ============================================================

const publicPath = path.join(
    __dirname,
    'public'
);

app.use(
    express.static(publicPath, {
        index: 'index.html',

        maxAge:
            NODE_ENV === 'production'
                ? '1d'
                : 0
    })
);

// مجلدات Frontend

app.use(
    '/css',
    express.static(
        path.join(publicPath, 'css')
    )
);

app.use(
    '/js',
    express.static(
        path.join(publicPath, 'js')
    )
);

app.use(
    '/pages',
    express.static(
        path.join(publicPath, 'pages')
    )
);

app.use(
    '/images',
    express.static(
        path.join(publicPath, 'images')
    )
);

// ============================================================
// 🩺 Health Check
// ============================================================

app.get('/health', async (req, res) => {

    let database = 'unknown';

    try {

        const mongoose = require('mongoose');

        const states = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };

        database =
            states[mongoose.connection.readyState] ||
            'unknown';

    } catch {
        database = 'unknown';
    }

    const healthy =
        database === 'connected';

    res.status(
        healthy ? 200 : 503
    ).json({

        success: healthy,

        application: 'Marine System',

        environment: NODE_ENV,

        database,

        uptime: Math.floor(
            process.uptime()
        ),

        timestamp:
            new Date().toISOString()
    });
});

// ============================================================
// 🏠 الصفحة الرئيسية
// ============================================================

app.get('/', (req, res) => {

    res.sendFile(
        path.join(
            publicPath,
            'index.html'
        )
    );
});

// ============================================================
// 📄 صفحات HTML
// ============================================================

app.get('/pages/:page', (req, res, next) => {

    const page =
        req.params.page;

    // منع Path Traversal
    if (
        page.includes('..') ||
        page.includes('/') ||
        page.includes('\\')
    ) {
        return res.status(400).json({
            success: false,
            error: 'Invalid page name'
        });
    }

    const filePath =
        path.join(
            publicPath,
            'pages',
            `${page}.html`
        );

    res.sendFile(
        filePath,
        error => {

            if (error) {
                next();
            }

        }
    );
});

// ============================================================
// ❌ API 404
// ============================================================

app.use('/api', (req, res) => {

    res.status(404).json({
        success: false,
        error: 'API endpoint not found',
        path: req.originalUrl
    });

});

// ============================================================
// 🌐 HTML 404
// ============================================================

app.use((req, res) => {

    // إذا كان الطلب يتوقع JSON
    if (
        req.path.startsWith('/api') ||
        req.headers.accept?.includes('application/json')
    ) {

        return res.status(404).json({
            success: false,
            error: 'Resource not found'
        });

    }

    res.status(404).send(`
        <!DOCTYPE html>

        <html lang="ar" dir="rtl">

        <head>
            <meta charset="UTF-8">
            <title>404 - الصفحة غير موجودة</title>

            <style>
                body {
                    font-family: Arial, sans-serif;
                    background: #f5f7fa;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                }

                .box {
                    text-align: center;
                    background: white;
                    padding: 40px;
                    border-radius: 16px;
                    box-shadow:
                        0 10px 40px
                        rgba(0,0,0,.08);
                }

                h1 {
                    font-size: 64px;
                    margin: 0;
                }

                p {
                    color: #666;
                }

                a {
                    display: inline-block;
                    margin-top: 15px;
                    padding
