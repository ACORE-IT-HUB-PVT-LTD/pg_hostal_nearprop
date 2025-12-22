const mongoose = require('mongoose');

const bedSchema = new mongoose.Schema({
  bedNumber: {
    type: String,
    required: true
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  isOccupied: {
    type: Boolean,
    default: false
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null
  },
  rentAmount: {
    type: Number,
    required: false
  },
  bedType: {
    type: String,
    enum: ['Single', 'Double', 'Queen', 'King', 'Bunk'],
    default: 'Single'
  },
  position: {
    type: String,
    enum: ['Window', 'Middle', 'Door', 'Corner'],
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
  isActive: {
    type: Boolean,
    default: true
  },
  lastOccupiedDate: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

bedSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Bed = mongoose.model('Bed', bedSchema);

module.exports = Bed;
