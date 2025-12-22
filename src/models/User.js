/**
 * User Model - Represents users who can schedule visits to properties
 * This is separate from Tenants who have actually rented a property
 */
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  mobile: { 
    type: String, 
    required: true 
  },
  role: {
    type: String,
    enum: ['user', 'landlord', 'admin'],
    default: 'user'
  },
  passwordHash: { 
    type: String, 
    required: true 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  profilePicture: { 
    type: String 
  },
  savedProperties: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Property' 
  }],
  lastLogin: { 
    type: Date 
  },
  accountCreated: { 
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.passwordHash;
      return ret;
    }
  }
});

// Create indexes for efficient querying
userSchema.index({ email: 1 });
userSchema.index({ mobile: 1 });
userSchema.index({ role: 1 });

module.exports = mongoose.model('User', userSchema);
