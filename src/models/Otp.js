const mongoose = require('mongoose');

const OtpSchema = new mongoose.Schema({
  mobile: {
    type: String,
    required: true,
    index: true
  },
  otp: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600 // OTP expires after 10 minutes (600 seconds)
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  purpose: {
    type: String,
    enum: ['login', 'register', 'reset_password'],
    default: 'login'
  }
});

// Create a compound index for faster lookups
OtpSchema.index({ mobile: 1, otp: 1 });

module.exports = mongoose.model('Otp', OtpSchema);
