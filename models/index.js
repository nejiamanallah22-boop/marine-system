// ============================================================
// 📦 models/index.js - v2.3 (Production)
// ============================================================
// يحمّل جميع الموديلات بشكل آمن
// - Note: مطلوب (Note Verbale)
// - Notification: اختياري
// ============================================================

console.log('');
console.log('📦 ============================================');
console.log('📦 [MODELS] تحميل الموديلات...');
console.log('📦 ============================================');

// ============================================================
// 🔧 دالة تحميل آمنة
// ============================================================
function tryLoad(name, path) {
    try {
        const mod = require(path);
        console.log(`✅ [MODELS] ${name} (${typeof mod})`);
        return mod;
    } catch (err) {
        console.error(`❌ [MODELS] فشل تحميل ${name}: ${err.message}`);
        throw err;
    }
}

// ============================================================
// 📦 متغيرات الموديلات
// ============================================================
let Vessel, User, Ticket, Log, Maintenance, Note, Notification;

// ============================================================
// 🚀 التحميل
// ============================================================
try {
    // ✅ الموديلات الأساسية (مطلوبة)
    Vessel      = tryLoad('Vessel', './Vessel');
    User        = tryLoad('User', './User');
    Ticket      = tryLoad('Ticket', './Ticket');
    Log         = tryLoad('Log', './Log');
    Maintenance = tryLoad('Maintenance', './Maintenance');
    Note        = tryLoad('Note', './Note');

    // ✅ Notification — اختياري (لن يكسر التطبيق إن لم يوجد)
    try {
        Notification = tryLoad('Notification', './Notification');
    } catch (e) {
        console.warn('⚠️ [MODELS] Notification غير موجود — سيتم تجاهله');
        Notification = null;
    }

    console.log('📦 [MODELS] ✅ جميع الموديلات تم تحميلها بنجاح');
    console.log('📦 ============================================');
    console.log('');

} catch (err) {
    console.error('');
    console.error('🔴 ============================================');
    console.error('🔴 [MODELS] توقف التحميل بسبب خطأ حرج');
    console.error(`🔴 ${err.message}`);
    console.error('🔴 ============================================');
    console.error('');
    throw err;
}

// ============================================================
// ✅ التحقق النهائي من الموديلات المطلوبة
// ============================================================
if (!Vessel) {
    throw new Error('❌ Model "Vessel" is not loaded correctly');
}
if (!User) {
    throw new Error('❌ Model "User" is not loaded correctly');
}
if (!Ticket) {
    throw new Error('❌ Model "Ticket" is not loaded correctly');
}
if (!Log) {
    throw new Error('❌ Model "Log" is not loaded correctly');
}
if (!Maintenance) {
    throw new Error('❌ Model "Maintenance" is not loaded correctly');
}
if (!Note) {
    throw new Error('❌ Model "Note" is not loaded correctly');
}
// ✅ Notification اختياري — لا نتحقق منه

console.log('✅ [MODELS] جميع الموديلات المطلوبة جاهزة للاستخدام');
console.log('');

// ============================================================
// 📤 التصدير
// ============================================================
module.exports = {
    Vessel,
    User,
    Ticket,
    Log,
    Maintenance,
    Note,
    Notification
};
