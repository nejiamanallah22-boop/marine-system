// ============================================================
// 📦 models/index.js - v2.1
// ✨ v2.1: Smart loading with verification
// ============================================================

const Vessel = require('./Vessel');
const User = require('./User');
const Ticket = require('./Ticket');
const Log = require('./Log');
const Maintenance = require('./Maintenance');

// ✅ التحقق من التحميل الصحيح
if (!Vessel || !User || !Ticket || !Log || !Maintenance) {
    throw new Error('❌ Failed to load all models');
}

console.log('✅ models/index.js loaded successfully');
console.log('   - Vessel:', typeof Vessel);
console.log('   - User:', typeof User);
console.log('   - Ticket:', typeof Ticket);
console.log('   - Log:', typeof Log);
console.log('   - Maintenance:', typeof Maintenance);

module.exports = {
    Vessel,
    User,
    Ticket,
    Log,
    Maintenance
};
