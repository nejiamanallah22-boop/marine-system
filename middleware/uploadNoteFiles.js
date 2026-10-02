// ============================================================
// 📤 middleware/uploadNoteFiles.js — v1.0
// رفع وثائق Note Verbale → Memory → Cloudinary
// أنواع متعددة: PDF, Word, Excel, صور, نصوص
// ============================================================

'use strict';

const multer = require('multer');

const storage = multer.memoryStorage();

// ✅ الأنواع المسموحة (كل الأنواع المهمة)
const ALLOWED_MIMETYPES = [
    // 📄 PDF
    'application/pdf',

    // 📝 Word
    'application/msword',                                                      // .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx

    // 📊 Excel
    'application/vnd.ms-excel',                                                // .xls
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx

    // 📈 PowerPoint
    'application/vnd.ms-powerpoint',                                           // .ppt
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx

    // 📝 Text
    'text/plain',
    'text/csv',
    'application/csv',

    // 🖼️ Images
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/bmp',
    'image/tiff',

    // 📦 Archives (اختياري — لإرسال حزم)
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',

    // 📎 أخرى
    'application/vnd.oasis.opendocument.text',                                 // .odt
    'application/vnd.oasis.opendocument.spreadsheet'                           // .ods
];

const fileFilter = (req, file, cb) => {
    const mimetype = (file.mimetype || '').toLowerCase();
    const originalname = (file.originalname || '').toLowerCase();
    const ext = originalname.split('.').pop();

    // ✅ التحقق من mimetype
    if (ALLOWED_MIMETYPES.includes(mimetype)) {
        return cb(null, true);
    }

    // ✅ Fallback على الامتداد (لبعض المتصفحات القديمة)
    const allowedExts = [
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
        'txt', 'csv', 'odt', 'ods',
        'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'tif',
        'zip', 'rar'
    ];

    if (allowedExts.includes(ext)) {
        return cb(null, true);
    }

    // ❌ رفض
    cb(new Error(
        'نوع الملف غير مدعوم. الأنواع المسموحة: ' +
        'PDF, Word, Excel, PowerPoint, صور, نصوص, ZIP'
    ));
};

module.exports = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 25 * 1024 * 1024,  // ✅ 25 MB لكل ملف
        files: 5,                     // ✅ حتى 5 ملفات في المرة
        fields: 20,
        parts: 25
    }
});
