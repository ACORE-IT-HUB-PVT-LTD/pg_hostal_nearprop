const mongoose = require('mongoose');

const landlordSchema = new mongoose.Schema({
  name: { type: String, required: true },
  mobile: { type: String, required: true, unique: true, sparse: true },
  email: { type: String, required: true, unique: true, sparse: true },
  aadhaarNumber: { 
    type: String, 
    required: true, 
    unique: true, 
    sparse: true, 
    validate: {
      validator: function(v) {
        return /^\d{12}$/.test(v);
      },
      message: props => `${props.value} is not a valid 12-digit Aadhaar number!`
    },
    index: true
  },
  address: { type: String, required: true },
  pinCode: { type: String, required: true, match: /^\d{6}$/ },
  state: { type: String, required: true },
  panNumber: { 
    type: String, 
    required: true, 
    unique: true, 
    sparse: true, 
    validate: {
      validator: function(v) {
        return /^[A-Z]{5}\d{4}[A-Z]{1}$/.test(v);
      },
      message: props => `${props.value} is not a valid PAN number format (5 uppercase letters + 4 digits + 1 uppercase letter)!`
    },
    index: true
  },
  profilePhoto: { type: String },
  dob: { type: Date, required: true },
  gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
  isActive: { type: Boolean, default: true }, // Added for admin control
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  properties: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Property' }]
});

module.exports = mongoose.model('Landlord', landlordSchema);
