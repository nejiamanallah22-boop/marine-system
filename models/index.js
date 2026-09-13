// ============================================================
// 📦 models/index.js - v2.5 (Production + Settings + Logo)
// ============================================================

console.log('');
console.log('📦 ============================================');
console.log('📦 [MODELS] تحميل الموديلات...');
console.log('📦 ============================================');

function tryLoad(name, path, required = true) {
    try {
        const mod = require(path);
        console.log(`✅ [MODELS] ${name} (${typeof mod})`);
        return mod;
    } catch (err) {
        if (required) {
            console.error(`❌ [MODELS] فشل تحميل ${name}: ${err.message}`);
            throw err;
        } else {
            console.warn(`⚠️ [MODELS] ${name} غير موجود — سيتم تجاهله`);
            return null;
        }
    }
}

let Vessel, User, Ticket, Log, Maintenance, Note, Notification;
let UserSettings, SystemLogo;   // 🆕

try {
    Vessel      = tryLoad('Vessel', './Vessel');
    User        = tryLoad('User', './User');
    Ticket      = tryLoad('Ticket', './Ticket');
    Log         = tryLoad('Log', './Log');
    Maintenance = tryLoad('Maintenance', './Maintenance');
    Note        = tryLoad('Note', './Note');

    // ✅ موديلات اختيارية
    Notification = tryLoad('Notification', './Notification', false);
    UserSettings = tryLoad('UserSettings', './UserSettings', false);   // 🆕
    SystemLogo   = tryLoad('SystemLogo', './SystemLogo', false);        // 🆕

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
console.log(`   📝 Note: ${Note ? '✅' : '❌'}`);
console.log(`   🔔 Notification: ${Notification ? '✅' : '❌'}`);
console.log(`   ⚙️  UserSettings: ${UserSettings ? '✅' : '❌'}`);
console.log(`   🖼️  SystemLogo: ${SystemLogo ? '✅' : '❌'}`);
console.log('');

module.exports = {
    Vessel,
    User,
    Ticket,
    Log,
    Maintenance,
    Note,
    Notification,
    UserSettings,   // 🆕
    SystemLogo      // 🆕
};
