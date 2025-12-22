const express = require('express');
const router = express.Router();
const adminPropertyController = require('../controllers/adminPropertyController');
const adminAuth = require('../middleware/adminAuth');

/**
 * Admin Property Management Routes
 */

// Custom middleware to allow GET requests without authentication
const adminGETBypass = (req, res, next) => {
  if (req.method === 'GET') {
    console.log('GET request to admin property route - bypassing authentication');
    
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

// Get all properties with pagination and filtering
router.get('/', adminPropertyController.getAllProperties);

// Get detailed information about a specific property
router.get('/:id', adminPropertyController.getPropertyDetails);

// Toggle property active status
router.patch('/:id/toggle-status', adminPropertyController.togglePropertyStatus);

// Toggle room active status
router.patch('/rooms/:id/toggle-status', adminPropertyController.toggleRoomStatus);

// Toggle bed active status
router.patch('/beds/:id/toggle-status', adminPropertyController.toggleBedStatus);

module.exports = router;
