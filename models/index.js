// ============================================================
// 📦 models/index.js - v2.7 (SAFE + Vehicle)
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

// ✅ الموديلات المطلوبة (يجب أن تُحمّل بنجاح)
let Vessel, User, Ticket, Log, Maintenance, Note;

// ✅ الموديلات الاختيارية
let Vehicle, Notification, UserSettings, SystemLogo;

try {
    // ============================================================
    // 🔴 المطلوبة — إذا فشل أي واحد → السيرفر يتوقف
    // ============================================================
    Vessel      = tryLoad('Vessel', './Vessel', true);
    User        = tryLoad('User', './User', true);
    Ticket      = tryLoad('Ticket', './Ticket', true);
    Log         = tryLoad('Log', './Log', true);
    Maintenance = tryLoad('Maintenance', './Maintenance', true);
    Note        = tryLoad('Note', './Note', true);

    // ============================================================
    // 🟢 الاختيارية — إذا فشل أي واحد → يتجاهله
    // ============================================================
    Vehicle      = tryLoad('Vehicle', './Vehicle', false);
    Notification = tryLoad('Notification', './Notification', false);
    UserSettings = tryLoad('UserSettings', './UserSettings', false);
    SystemLogo   = tryLoad('SystemLogo', './SystemLogo', false);

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
// ✅ التحقق النهائي — فقط من المطلوبة
// ============================================================
if (!Vessel)      throw new Error('❌ Model "Vessel" is not loaded');
if (!User)        throw new Error('❌ Model "User" is not loaded');
if (!Ticket)      throw new Error('❌ Model "Ticket" is not loaded');
if (!Log)         throw new Error('❌ Model "Log" is not loaded');
if (!Maintenance) throw new Error('❌ Model "Maintenance" is not loaded');
if (!Note)        throw new Error('❌ Model "Note" is not loaded');

console.log('✅ [MODELS] جميع الموديلات المطلوبة جاهزة للاستخدام');
console.log(`   🚢 Vessel: ${Vessel ? '✅' : '❌'}`);
console.log(`   👤 User: ${User ? '✅' : '❌'}`);
console.log(`   🎫 Ticket: ${Ticket ? '✅' : '❌'}`);
console.log(`   📝 Note: ${Note ? '✅' : '❌'}`);
console.log(`   🔧 Maintenance: ${Maintenance ? '✅' : '❌'}`);
console.log(`   📊 Log: ${Log ? '✅' : '❌'}`);
console.log(`   🚛 Vehicle: ${Vehicle ? '✅' : '❌'} (optional)`);
console.log(`   🔔 Notification: ${Notification ? '✅' : '❌'} (optional)`);
console.log(`   ⚙️  UserSettings: ${UserSettings ? '✅' : '❌'} (optional)`);
console.log(`   🖼️  SystemLogo: ${SystemLogo ? '✅' : '❌'} (optional)`);
console.log('');

module.exports = {
    Vessel,
    User,
    Ticket,
    Log,
    Maintenance,
    Note,
    Vehicle,
    Notification,
    UserSettings,
    SystemLogo
};
