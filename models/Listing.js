const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, required: true, enum: ['business', 'job', 'skill', 'product'] },
    title: { type: String, required: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 1000 },
    price: { type: Number, default: null },
    mediaUrl: { type: String, default: null },
    mediaContentType: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Listing', listingSchema);