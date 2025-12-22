const mongoose = require('mongoose');

/**
 * Visit scheduling schema for property visits
 */
const visitSchema = new mongoose.Schema({
  // User who requested the visit
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Property being visited
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  // Landlord who owns the property
  landlordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Landlord',
    required: true
  },
  // Date of the scheduled visit
  visitDate: {
    type: Date,
    required: true
  },
  // Time slot (optional - can be implemented later if needed)
  timeSlot: {
    type: String
  },
  // Status of the visit
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending'
  },
  // Additional notes from the user
  notes: {
    type: String
  },
  // When the visit was confirmed by landlord
  confirmedAt: {
    type: Date
  },
  // Cancellation fields
  cancelledAt: {
    type: Date
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId
  },
  cancellationReason: {
    type: String
  },
  // Completion fields
  completedAt: {
    type: Date
  },
  completionNotes: {
    type: String
  },
  // Feedback after visit (optional)
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: {
      type: String
    },
    givenAt: {
      type: Date
    }
  },
  // Additional fields for tracking
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Add indexes for frequent queries
visitSchema.index({ userId: 1, status: 1 });
visitSchema.index({ landlordId: 1, status: 1 });
visitSchema.index({ propertyId: 1 });
visitSchema.index({ visitDate: 1 });

// Pre-save hook to update the updatedAt field
visitSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual for user info (to be populated)
visitSchema.virtual('userInfo', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

// Virtual for property info (to be populated)
visitSchema.virtual('propertyInfo', {
  ref: 'Property',
  localField: 'propertyId',
  foreignField: '_id',
  justOne: true
});

const Visit = mongoose.model('Visit', visitSchema);

module.exports = Visit;
