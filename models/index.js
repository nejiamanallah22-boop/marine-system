// ============================================================
// 📦 models/index.js - v2.4 (Production)
// ============================================================

console.log('');
console.log('📦 ============================================');
console.log('📦 [MODELS] تحميل الموديلات...');
console.log('📦 ============================================');

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

let Vessel, User, Ticket, Log, Maintenance, Note, Notification;

try {
    Vessel      = tryLoad('Vessel', './Vessel');
    User        = tryLoad('User', './User');
    Ticket      = tryLoad('Ticket', './Ticket');
    Log         = tryLoad('Log', './Log');
    Maintenance = tryLoad('Maintenance', './Maintenance');
    Note        = tryLoad('Note', './Note');

    // ✅ Notification اختياري
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

// ✅ التحقق النهائي
if (!Vessel) throw new Error('❌ Model "Vessel" is not loaded');
if (!User) throw new Error('❌ Model "User" is not loaded');
if (!Ticket) throw new Error('❌ Model "Ticket" is not loaded');
if (!Log) throw new Error('❌ Model "Log" is not loaded');
if (!Maintenance) throw new Error('❌ Model "Maintenance" is not loaded');
if (!Note) throw new Error('❌ Model "Note" is not loaded');

console.log('✅ [MODELS] جميع الموديلات المطلوبة جاهزة للاستخدام');
console.log('');

module.exports = {
    Vessel,
    User,
    Ticket,
    Log,
    Maintenance,
    Note,
    Notification
};
