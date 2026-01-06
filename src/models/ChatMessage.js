const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        index: true
    },
    senderId: {
        type: String,
        required: true
    },
    senderRole: {
        type: String,
        enum: ['ADVISOR',
            'USER',
            'FRANCHISEE',
            'DEVELOPER',
            'SELLER',
            'landlord'],
        required: true
    },
    message: {
        type: String,
        required: true
    },
    isRead: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
