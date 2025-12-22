const mongoose = require('mongoose');

/**
 * Schema for property ratings and reviews
 * This schema handles ratings, reviews, and comments for properties
 */
const ratingSchema = new mongoose.Schema({
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
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  review: {
    type: String,
    trim: true,
    maxlength: 1000 // Limit review length to 1000 characters
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
  updatedAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Field for landlord or admin to mark a review as verified
  isVerified: {
    type: Boolean,
    default: false
  }
});

// Create compound index to ensure a user can only review a property once
ratingSchema.index({ propertyId: 1, userId: 1 }, { unique: true });

// Pre-save middleware to update timestamps
ratingSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Rating', ratingSchema);
