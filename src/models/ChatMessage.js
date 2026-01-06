const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
    {
        roomId: {
            type: String,
            required: true,
            index: true
        },

        propertyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
            required: true
        },

        senderId: {
            type: String,
            required: true,
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
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("ChatMessage", chatMessageSchema);
