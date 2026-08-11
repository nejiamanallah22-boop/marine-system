const path = require('path');

module.exports = {
    // الملف المدخل (الذي يحتوي على require)
    entry: './public/js/app.js',
    
    // ملف الإخراج (الذي سيتم تحميله في المتصفح)
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'public/dist'),
    },
    
    // بيئة المتصفح
    target: 'web',
    
    // وضع الإنتاج (لتصغير الكود)
    mode: 'production',
    
    // معالجة الأخطاء
    stats: {
        errorDetails: true
    }
};
