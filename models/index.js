// ============================================================
// 🔍 DIAGNOSTIC MODE — models/index.js
// الهدف: تحديد الملف الذي يُسبب "window is not defined"
// ============================================================

console.log('');
console.log('🔍 ============================================');
console.log('🔍 [DIAGNOSTIC] بدء فحص الموديلات...');
console.log('🔍 ============================================');

function tryLoad(name, path) {
    try {
        console.log(`🔄 [DIAGNOSTIC] محاولة تحميل ${name} من ${path}...`);
        const mod = require(path);
        console.log(`✅ [DIAGNOSTIC] ${name} تم تحميله بنجاح (${typeof mod})`);
        return mod;
    } catch (err) {
        console.error('');
        console.error('❌ ============================================');
        console.error(`❌ [DIAGNOSTIC] فشل تحميل ${name}:`);
        console.error(`   مسار: ${path}`);
        console.error(`   اسم الخطأ: ${err.name}`);
        console.error(`   رسالة الخطأ: ${err.message}`);
        console.error(`   Stack Trace:`);
        console.error(err.stack);
        console.error('❌ ============================================');
        console.error('');
        throw err;
    }
}

let Vessel, User, Ticket, Log, Maintenance;

try {
    Vessel = tryLoad('Vessel', './Vessel');
    User = tryLoad('User', './User');
    Ticket = tryLoad('Ticket', './Ticket');
    Log = tryLoad('Log', './Log');
    Maintenance = tryLoad('Maintenance', './Maintenance');

    console.log('');
    console.log('✅ ============================================');
    console.log('✅ [DIAGNOSTIC] جميع الموديلات تم تحميلها بنجاح');
    console.log('✅ ============================================');
    console.log('');

} catch (err) {
    console.error('');
    console.error('🔴 [DIAGNOSTIC] توقف التحميل بسبب خطأ في أحد الموديلات');
    console.error('🔴 راجع السجل أعلاه لمعرفة الملف المُشكِل');
    console.error('');
    throw err;
}

module.exports = {
    Vessel,
    User,
    Ticket,
    Log,
    Maintenance
};
