const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const adminSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true,
    lowercase: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email address']
  },
  password: { 
    type: String, 
    required: true,
    minlength: 8
  },
  isActive: {
    type: Boolean,
    default: true
  },
  role: {
    type: String,
    default: 'admin',
    enum: ['admin', 'super_admin']
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  lastLogin: Date,
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Hash password before saving
adminSchema.pre('save', async function(next) {
  // Only hash the password if it's modified or new
  if (!this.isModified('password')) return next();
  
  try {
    // Generate salt and hash password
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password for login
adminSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT token
adminSchema.methods.generateAuthToken = function() {
  const token = jwt.sign(
    { 
      id: this._id, 
      role: this.role,
      email: this.email
    }, 
    process.env.JWT_SECRET, 
    {
      expiresIn: '30d' // Token expires in 30 days
    }
  );
  
  return token;
};

// Generate password reset token
adminSchema.methods.generateResetToken = function() {
  const resetToken = jwt.sign(
    { 
      id: this._id, 
      purpose: 'password_reset' 
    }, 
    process.env.JWT_SECRET, 
    {
      expiresIn: '1h' // Reset token expires in 1 hour
    }
  );
  
  this.resetPasswordToken = resetToken;
  this.resetPasswordExpires = Date.now() + 3600000; // 1 hour from now
  
  return resetToken;
};

module.exports = mongoose.model('Admin', adminSchema);
