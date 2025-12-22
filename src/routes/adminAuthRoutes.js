const express = require('express');
const router = express.Router();
const adminAuthController = require('../controllers/adminAuthController');
const adminAuth = require('../middleware/adminAuth');

/**
 * Admin Authentication Routes
 */

// Public routes (no authentication required)
router.post('/login', adminAuthController.login);
router.post('/forgot-password', adminAuthController.forgotPassword);
router.post('/reset-password', adminAuthController.resetPassword);
router.post('/register', adminAuthController.register);

// Custom middleware for GET requests
const adminGETBypass = (req, res, next) => {
  if (req.method === 'GET') {
    console.log('GET request to admin auth route - bypassing authentication');
    
    // Set up default admin context
    req.admin = {
      _id: 'guest-admin-' + Date.now(),
      name: 'Guest Administrator',
      email: 'guest-admin@draze.system',
      role: 'admin',
      isActive: true
    };
    
    return next();
  }
  
  // For non-GET requests, use the regular admin auth
  return adminAuth.required(req, res, next);
};

// Protected routes with bypass for GET requests
router.get('/profile', adminGETBypass, adminAuthController.getProfile);
router.post('/change-password', adminAuth.required, adminAuthController.changePassword);
router.post('/refresh-token', adminAuth.required, adminAuthController.refreshToken);

module.exports = router;
