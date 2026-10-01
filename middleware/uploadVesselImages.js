const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads', 'vessels');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
        cb(null, `vessel-${req.params.id}-${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    if (/jpeg|jpg|png|webp|gif/.test(file.mimetype)) return cb(null, true);
    cb(new Error('نوع الملف غير مدعوم'));
};

module.exports = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});
