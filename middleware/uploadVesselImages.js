// ============================================================
// 📤 middleware/uploadVesselImages.js — v2.0
// رفع صور المراكب البحرية → Memory → Cloudinary
// ============================================================

'use strict';

const multer = require('multer');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    const ext = (file.originalname || '').toLowerCase();
    const okExt  = allowed.test(ext);
    const okMime = allowed.test(file.mimetype);
    if (okExt && okMime) return cb(null, true);
    cb(new Error('نوع الملف غير مدعوم (JPG, PNG, WEBP, GIF فقط)'));
};

module.exports = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 10
    }
});
