const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  floor: {
    type: Number,
    required: false
  },
  roomNumber: {
    type: String,
    required: true
  },
  capacity: {
    type: Number,
    required: true
  },
  occupancy: {
    type: String,
    enum: ['Single', 'Double', 'Triple', 'Multiple'],
    required: true
  },
  area: {
    type: Number, // in sq ft
    required: false
  },
  rent: {
    type: Number,
    required: true
  },
  securityDeposit: {
    type: Number,
    required: false
  },
  amenities: {
    type: [String],
    default: []
  },
  images: {
    type: [String],
    default: []
  },
  availability: {
    type: Boolean,
    default: true
  },
  availableBeds: {
    type: Number,
    default: function() {
      return this.capacity;
    }
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
  description: {
    type: String,
    trim: true
  }
}, { timestamps: true });

roomSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Room = mongoose.model('Room', roomSchema);

module.exports = Room;
