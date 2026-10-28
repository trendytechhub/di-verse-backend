const mongoose = require('mongoose');

const gameRoomSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, maxlength: 6 },
    game: { type: String, required: true, enum: ['chess', 'snooker', 'ludo', 'whot'] },
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    guestId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['waiting', 'active', 'finished'], default: 'waiting' },
    stateJson: { type: String, required: true },
    stakeCredits: { type: Number, default: 0 },
    hostResult: { type: Number, default: null },
    guestResult: { type: Number, default: null },
    settledAt: { type: Date, default: null },
    payoutCredits: { type: Number, default: 0 },
    sinkCredits: { type: Number, default: 0 },
    revision: { type: Number, default: 1 }
}, { timestamps: true });

module.exports = mongoose.model('GameRoom', gameRoomSchema);