const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, maxlength: 254 },
    passwordHash: { type: String, required: true },
    bio: { type: String, maxlength: 500, default: '' },
    skills: { type: String, maxlength: 250, default: '' },
    isBanned: { type: Boolean, default: false },
    banReason: { type: String, default: null },
    creditBalance: { type: Number, default: 1000 },
    pictureUrl: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);