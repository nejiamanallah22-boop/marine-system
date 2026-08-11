const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== تقديم الملفات الثابتة =====
app.use(express.static(path.join(__dirname, 'public')));

// ===== جميع الطلبات تذهب إلى index.html =====
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== تشغيل السيرفر =====
app.listen(PORT, () => {
    console.log(`✅ السيرفر يعمل على http://localhost:${PORT}`);
});
