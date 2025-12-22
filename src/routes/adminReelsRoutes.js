const express = require('express');
const router = express.Router();
const adminReelsController = require('../controllers/adminReelsController');
const adminAuth = require('../middleware/adminAuth');

/**
 * Admin Reels Management Routes
 */

// Custom middleware to allow GET requests without authentication
const adminGETBypass = (req, res, next) => {
  if (req.method === 'GET') {
    console.log('GET request to admin reels route - bypassing authentication');
    
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

// Use custom middleware that bypasses auth for GET requests
router.use(adminGETBypass);

// Get all reels with pagination and filtering
router.get('/', adminReelsController.getAllReels);

// Get landlord's reels - specific routes with parameters first
router.get('/landlord/:id', adminReelsController.getLandlordReels);

// Get property's reels - specific routes with parameters first
router.get('/property/:id', adminReelsController.getPropertyReels);

// Get detailed information about a specific reel
router.get('/:id', adminReelsController.getReelDetails);

// Toggle reel active status
router.patch('/:id/toggle-status', adminReelsController.toggleReelStatus);

module.exports = router;
