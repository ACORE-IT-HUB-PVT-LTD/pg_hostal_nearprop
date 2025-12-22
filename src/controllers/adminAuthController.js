const Admin = require('../models/Admin');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendEmail } = require('../utils/emailService');

/**
 * Admin Authentication Controller
 * Handles admin login, registration, password reset, etc.
 */
const adminAuthController = {
  /**
   * Login admin user
   * @route POST /api/admin/auth/login
   */
  login: async (req, res) => {
    try {
      const { email, password } = req.body;
      
      // Validate input
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
      }
      
      // Find admin by email
      const admin = await Admin.findOne({ email });
      if (!admin) {
        return res.status(401).json({
          success: false,
          message: 'Authentication failed',
          error: 'Invalid email or password'
        });
      }
      
      // Check if admin is active
      if (!admin.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Authentication failed',
          error: 'Admin account is inactive'
        });
      }
      
      // Verify password
      const isMatch = await admin.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Authentication failed',
          error: 'Invalid email or password'
        });
      }
      
      // Generate JWT token
      const token = admin.generateAuthToken();
      
      // Update last login time
      admin.lastLogin = Date.now();
      await admin.save();
      
      // Return success response with token
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role
        }
      });
    } catch (error) {
      console.error('Admin login error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  /**
   * Create a new admin (public registration endpoint)
   * @route POST /api/admin/auth/register
   */
  register: async (req, res) => {
    try {
      const { name, email, password, role } = req.body;
      
      // Validate input
      if (!name || !email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Name, email and password are required'
        });
      }
      
      // Check if email is already registered
      const existingAdmin = await Admin.findOne({ email });
      if (existingAdmin) {
        return res.status(400).json({
          success: false,
          message: 'Email is already registered'
        });
      }
      
      // For security reasons, regular registrations can only create 'admin' role
      // super_admin role requires separate setup script
      const safeRole = role === 'super_admin' ? 'admin' : (role || 'admin');
      
      // Create new admin
      const newAdmin = new Admin({
        name,
        email,
        password,
        role: safeRole, // Default to 'admin' if role not specified
      });
      
      // Save the new admin
      await newAdmin.save();
      
      // Generate JWT token
      const token = newAdmin.generateAuthToken();
      
      // Update last login time
      newAdmin.lastLogin = Date.now();
      await newAdmin.save();
      
      // Return success response with token
      return res.status(201).json({
        success: true,
        message: 'Admin registered successfully',
        token,
        admin: {
          id: newAdmin._id,
          name: newAdmin.name,
          email: newAdmin.email,
          role: newAdmin.role
        }
      });
    } catch (error) {
      console.error('Admin registration error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  /**
   * Get current admin's profile
   * @route GET /api/admin/auth/profile
   */
  getProfile: async (req, res) => {
    try {
      // Admin is already loaded in req.admin from middleware
      const admin = req.admin;
      
      return res.status(200).json({
        success: true,
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          lastLogin: admin.lastLogin,
          createdAt: admin.createdAt
        }
      });
    } catch (error) {
      console.error('Get admin profile error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  /**
   * Forgot password - send password reset email
   * @route POST /api/admin/auth/forgot-password
   */
  forgotPassword: async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }
      
      // Find admin by email
      const admin = await Admin.findOne({ email });
      if (!admin) {
        // For security reasons, we still return success even if email is not found
        return res.status(200).json({
          success: true,
          message: 'If the email exists, a password reset link has been sent'
        });
      }
      
      // Generate reset token
      const resetToken = admin.generateResetToken();
      await admin.save();
      
      // Create reset URL
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/reset-password/${resetToken}`;
      
      // Send email
      const emailSent = await sendEmail({
        to: admin.email,
        subject: 'PG Hostel Admin - Password Reset',
        text: `You requested a password reset. Please click the following link to reset your password: ${resetUrl}`,
        html: `
          <h1>Password Reset</h1>
          <p>You requested a password reset for your PG Hostel Admin account.</p>
          <p>Please click the button below to reset your password:</p>
          <a href="${resetUrl}" style="background-color: #4CAF50; color: white; padding: 14px 20px; margin: 8px 0; border: none; cursor: pointer; width: 100%; text-align: center; text-decoration: none; display: inline-block; font-size: 16px;">
            Reset Password
          </a>
          <p>If you didn't request this, please ignore this email.</p>
          <p>The reset link will expire in 1 hour.</p>
        `
      });
      
      if (!emailSent) {
        return res.status(500).json({
          success: false,
          message: 'Failed to send reset email',
          error: 'Email service error'
        });
      }
      
      return res.status(200).json({
        success: true,
        message: 'Password reset link sent to your email'
      });
    } catch (error) {
      console.error('Forgot password error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  /**
   * Reset password using token
   * @route POST /api/admin/auth/reset-password
   */
  resetPassword: async (req, res) => {
    try {
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({
          success: false,
          message: 'Token and new password are required'
        });
      }
      
      // Verify token
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired token',
          error: error.message
        });
      }
      
      if (!decoded.id || decoded.purpose !== 'password_reset') {
        return res.status(400).json({
          success: false,
          message: 'Invalid token format'
        });
      }
      
      // Find admin by ID and token
      const admin = await Admin.findOne({
        _id: decoded.id,
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: Date.now() }
      });
      
      if (!admin) {
        return res.status(400).json({
          success: false,
          message: 'Password reset token is invalid or has expired'
        });
      }
      
      // Set new password
      admin.password = password;
      admin.resetPasswordToken = undefined;
      admin.resetPasswordExpires = undefined;
      admin.updatedAt = Date.now();
      
      await admin.save();
      
      return res.status(200).json({
        success: true,
        message: 'Password has been reset successfully'
      });
    } catch (error) {
      console.error('Reset password error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  /**
   * Change admin's password (when logged in)
   * @route POST /api/admin/auth/change-password
   */
  changePassword: async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Current password and new password are required'
        });
      }
      
      // Admin is already loaded in req.admin from middleware
      const admin = req.admin;
      
      // Verify current password
      const isMatch = await admin.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }
      
      // Set new password
      admin.password = newPassword;
      admin.updatedAt = Date.now();
      
      await admin.save();
      
      return res.status(200).json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      console.error('Change password error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  },
  
  /**
   * Refresh admin's token
   * @route POST /api/admin/auth/refresh-token
   */
  refreshToken: async (req, res) => {
    try {
      // Admin is already loaded in req.admin from middleware
      const admin = req.admin;
      
      // Generate new token
      const token = admin.generateAuthToken();
      
      return res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        token
      });
    } catch (error) {
      console.error('Refresh token error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message
      });
    }
  }
};

module.exports = adminAuthController;
