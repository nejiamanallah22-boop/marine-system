const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    pass: { type: String, required: true },
    role: { type: String, enum: ['مسؤول', 'محرر', 'مشاهد'], default: 'مشاهد' },
    enabled: { type: Boolean, default: true }
}, { timestamps: true });

UserSchema.pre('save', async function(next) {
    if (!this.isModified('pass')) return next();
    try {
        const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 10);
        this.pass = await bcrypt.hash(this.pass, salt);
        next();
    } catch (error) {
        next(error);
    }
});

UserSchema.methods.comparePassword = async function(password) {
    return await bcrypt.compare(password, this.pass);
};

module.exports = mongoose.model('User', UserSchema);
