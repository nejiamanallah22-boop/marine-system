// ============================================================
// 🚀 app.js - Marine System
// Enterprise Express Application
// ============================================================

'use strict';

// ============================================================
// 📦 Dependencies
// ============================================================

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

// ============================================================
// 🚀 إنشاء تطبيق Express
// ============================================================

const app = express();

// ============================================================
// ⚙️ Environment
// ============================================================

const NODE_ENV =
    process.env.NODE_ENV || 'development';

const IS_PRODUCTION =
    NODE_ENV === 'production';

const PORT =
    Number(process.env.PORT) || 3000;

// ============================================================
// 🌐 Frontend / CORS
// ============================================================

const FRONTEND_URL =
    process.env.FRONTEND_URL || '';

const allowedOrigins =
    FRONTEND_URL
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean);

// في نفس الموقع لا نحتاج CORS أصلاً.
// لكن نبقيه جاهزاً إذا كان لديك Frontend خارجي.
// ============================================================

app.disable('x-powered-by');

// ============================================================
// 🔐 Security Headers
// ============================================================

app.use(
    helmet({
        contentSecurityPolicy: false,

        crossOriginEmbedderPolicy: false,

        crossOriginResourcePolicy: {
            policy: 'cross-origin'
        },

        referrerPolicy: {
            policy: 'strict-origin-when-cross-origin'
        }
    })
);

// ============================================================
// 🌐 CORS
// ============================================================

app.use(
    cors({

        origin: function (origin, callback) {

            // طلبات نفس الخادم / أدوات الخادم
            if (!origin) {
                return callback(null, true);
            }

            // إذا لم يتم تحديد FRONTEND_URL
            // نسمح بالطلبات القادمة من نفس التطبيق
            if (allowedOrigins.length === 0) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            console.warn(
                `⚠️ CORS blocked: ${origin}`
            );

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
// 🚦 API Rate Limit
// ============================================================

const apiLimiter =
    rateLimit({

        windowMs:
            15 * 60 * 1000,

        max:
            IS_PRODUCTION
                ? 1000
                : 5000,

        standardHeaders: true,

        legacyHeaders: false,

        message: {
            success: false,
            error:
                'طلبات كثيرة جداً، حاول لاحقاً'
        }
    });

// ============================================================
// 🔐 Login Rate Limit
// ============================================================

const loginLimiter =
    rateLimit({

        windowMs:
            15 * 60 * 1000,

        max: 10,

        skipSuccessfulRequests: true,

        standardHeaders: true,

        legacyHeaders: false,

        message: {
            success: false,
            error:
                'محاولات تسجيل الدخول كثيرة جداً، حاول بعد قليل'
        }
    });

// ============================================================
// 📊 Request Logger
// ============================================================

app.use(
    (req, res, next) => {

        const start =
            Date.now();

        res.on(
            'finish',
            () => {

                const duration =
                    Date.now() - start;

                if (NODE_ENV !== 'test') {

                    console.log(
                        `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`
                    );

                }
            }
        );

        next();
    }
);

// ============================================================
// 🚦 تطبيق Rate Limit على API
// ============================================================

app.use(
    '/api',
    apiLimiter
);

// ============================================================
// 🔐 حماية Login
// ============================================================

app.use(
    '/api/auth/login',
    loginLimiter
);

// ============================================================
// 📁 Public Directory
// ============================================================

const publicPath =
    path.resolve(
        __dirname,
        'public'
    );

// ============================================================
// 📂 Static Files
// ============================================================

app.use(
    express.static(
        publicPath,
        {
            index: 'index.html',

            maxAge:
                IS_PRODUCTION
                    ? '1d'
                    : 0,

            etag: true,

            dotfiles: 'deny'
        }
    )
);

// ============================================================
// 📁 CSS
// ============================================================

app.use(
    '/css',
    express.static(
        path.join(
            publicPath,
            'css'
        ),
        {
            maxAge:
                IS_PRODUCTION
                    ? '1d'
                    : 0
        }
    )
);

// ============================================================
// 📁 JavaScript
// ============================================================

app.use(
    '/js',
    express.static(
        path.join(
            publicPath,
            'js'
        ),
        {
            maxAge:
                IS_PRODUCTION
                    ? '1d'
                    : 0
        }
    )
);

// ============================================================
// 📁 Pages
// ============================================================

app.use(
    '/pages',
    express.static(
        path.join(
            publicPath,
            'pages'
        ),
        {
            maxAge:
                IS_PRODUCTION
                    ? '1d'
                    : 0
        }
    )
);

// ============================================================
// 📁 Images
// ============================================================

app.use(
    '/images',
    express.static(
        path.join(
            publicPath,
            'images'
        ),
        {
            maxAge:
                IS_PRODUCTION
                    ? '1d'
                    : 0
        }
    )
);

// ============================================================
// 🩺 HEALTH CHECK
// ============================================================

app.get(
    '/health',
    (req, res) => {

        const states = {

            0: 'disconnected',

            1: 'connected',

            2: 'connecting',

            3: 'disconnecting'
        };

        const database =
            states[
                mongoose
                    .connection
                    .readyState
            ] || 'unknown';

        const healthy =
            database === 'connected';

        res
            .status(
                healthy
                    ? 200
                    : 503
            )
            .json({

                success:
                    healthy,

                status:
                    healthy
                        ? 'ok'
                        : 'degraded',

                service:
                    'Marine System',

                application:
                    'Marine System',

                environment:
                    NODE_ENV,

                database,

                uptime:
                    process.uptime(),

                timestamp:
                    new Date()
                        .toISOString()
            });
    }
);

// ============================================================
// 🩺 READY CHECK
// ============================================================

app.get(
    '/ready',
    (req, res) => {

        const database =
            mongoose
                .connection
                .readyState === 1;

        if (!database) {

            return res
                .status(503)
                .json({

                    success: false,

                    ready: false,

                    database:
                        'disconnected'
                });
        }

        res.json({

            success: true,

            ready: true,

            database:
                'connected'
        });
    }
);

// ============================================================
// 🏠 الصفحة الرئيسية
// ============================================================

app.get(
    '/',
    (req, res, next) => {

        const indexPath =
            path.join(
                publicPath,
                'index.html'
            );

        res.sendFile(
            indexPath,
            error => {

                if (error) {
                    next(error);
                }

            }
        );
    }
);

// ============================================================
// 📄 صفحات HTML
// ============================================================

app.get(
    '/pages/:page',
    (req, res, next) => {

        const page =
            String(
                req.params.page
            );

        // منع Path Traversal
        if (
            !/^[a-zA-Z0-9_-]+$/
                .test(page)
        ) {

            return res
                .status(400)
                .json({

                    success: false,

                    error:
                        'Invalid page name'
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
    }
);

// ============================================================
// ❌ API 404
// ============================================================

app.use(
    '/api',
    (req, res) => {

        res
            .status(404)
            .json({

                success: false,

                error:
                    'API endpoint not found',

                path:
                    req.originalUrl,

                method:
                    req.method,

                timestamp:
                    new Date()
                        .toISOString()
            });
    }
);

// ============================================================
// 🌐 HTML / Web 404
// ============================================================

app.use(
    (req, res) => {

        // API / JSON
        if (
            req.path.startsWith('/api') ||
            req.headers.accept?.includes(
                'application/json'
            )
        ) {

            return res
                .status(404)
                .json({

                    success: false,

                    error:
                        'Resource not found',

                    path:
                        req.originalUrl
                });
        }

        // HTML 404
        res
            .status(404)
            .type('html')
            .send(`<!DOCTYPE html>

<html lang="ar" dir="rtl">

<head>

    <meta charset="UTF-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <title>
        404 - الصفحة غير موجودة
    </title>

    <style>

        * {
            box-sizing: border-box;
        }

        body {

            margin: 0;

            min-height: 100vh;

            display: flex;

            align-items: center;

            justify-content: center;

            font-family:
                Arial,
                Tahoma,
                sans-serif;

            background:
                linear-gradient(
                    135deg,
                    #eef3f8,
                    #dce7f1
                );

            color: #1f2937;
        }

        .box {

            width:
                min(90%,
                520px);

            text-align: center;

            background: #ffffff;

            padding: 45px 35px;

            border-radius: 22px;

            box-shadow:
                0 20px 60px
                rgba(0, 0, 0, 0.12);
        }

        .icon {

            font-size: 55px;

            margin-bottom: 10px;
        }

        h1 {

            font-size: 72px;

            margin: 0;

            font-weight: 900;
        }

        h2 {

            margin:
                5px 0 15px;

            font-size: 24px;
        }

        p {

            color: #6b7280;

            line-height: 1.8;

            margin-bottom: 25px;
        }

        a {

            display: inline-block;

            padding:
                13px 28px;

            background:
                #0f4c81;

            color: white;

            text-decoration: none;

            border-radius: 10px;

            font-weight: bold;

            transition:
                transform .2s,
                opacity .2s;
        }

        a:hover {

            transform:
                translateY(-2px);

            opacity: .9;
        }

        .service {

            margin-top: 20px;

            font-size: 13px;

            color: #9ca3af;
        }

    </style>

</head>

<body>

    <div class="box">

        <div class="icon">
            ⚓
        </div>

        <h1>
            404
        </h1>

        <h2>
            الصفحة غير موجودة
        </h2>

        <p>
            عذراً، الصفحة التي تبحث عنها
            غير موجودة أو تم نقلها.
        </p>

        <a href="/">
            العودة إلى منظومة الوسائل البحرية
        </a>

        <div class="service">
            Marine System
        </div>

    </div>

</body>

</html>`);
    }
);

// ============================================================
// 🛑 GLOBAL ERROR HANDLER
// ============================================================

app.use(
    (err, req, res, next) => {

        console.error(
            '❌ Express Error:',
            err
        );

        // CORS
        if (
            err.message &&
            err.message.startsWith(
                'CORS:'
            )
        ) {

            return res
                .status(403)
                .json({

                    success: false,

                    error:
                        'Origin not allowed'
                });
        }

        // JSON Parse Error
        if (
            err instanceof SyntaxError &&
            err.status === 400 &&
            'body' in err
        ) {

            return res
                .status(400)
                .json({

                    success: false,

                    error:
                        'Invalid JSON body'
                });
        }

        // Payload Too Large
        if (
            err.type ===
            'entity.too.large'
        ) {

            return res
                .status(413)
                .json({

                    success: false,

                    error:
                        'حجم البيانات كبير جداً'
                });
        }

        // لا نكشف تفاصيل الخطأ في Production
        const message =
            IS_PRODUCTION
                ? 'حدث خطأ داخلي في الخادم'
                : err.message;

        res
            .status(
                err.statusCode ||
                err.status ||
                500
            )
            .json({

                success: false,

                error: message,

                ...(IS_PRODUCTION
                    ? {}
                    : {
                        stack:
                            err.stack
                    })
            });
    }
);

// ============================================================
// 📤 Export
// ============================================================

module.exports = app;

// ============================================================
// 🏁 ملاحظة
// ============================================================
//
// لا يوجد app.listen() هنا.
//
// server.js هو المسؤول عن:
//
// 1. تحميل dotenv
// 2. الاتصال بـ MongoDB
// 3. تحميل routes
// 4. إنشاء Admin
// 5. app.listen()
//
// ============================================================

console.log(
    '✅ Marine System Express App جاهز'
);
