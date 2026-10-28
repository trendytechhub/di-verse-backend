const mongoose = require('mongoose');

const friendshipSchema = new mongoose.Schema({
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    addresseeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending' }
}, { timestamps: true });

module.exports = mongoose.model('Friendship', friendshipSchema);