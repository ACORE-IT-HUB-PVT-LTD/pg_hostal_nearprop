const mongoose = require('mongoose');

/**
 * Schema for property comments
 * Users can add comments to properties separate from ratings/reviews
 */
const commentSchema = new mongoose.Schema({
  propertyId: {
    type: String,
    ref: 'Property',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  comment: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500 // Limit comment length to 500 characters
  },
  landlordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Landlord',
    required: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Comment can have replies from landlord or other users
  replies: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    userName: {
      type: String
    },
    userType: {
      type: String,
      enum: ['user', 'landlord', 'admin'],
      default: 'user'
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  }
});

// Create index for efficient querying
commentSchema.index({ propertyId: 1 });
commentSchema.index({ userId: 1 });
commentSchema.index({ landlordId: 1 });
commentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);
