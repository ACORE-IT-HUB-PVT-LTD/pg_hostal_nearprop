const express = require('express');
const router = express.Router();
const adminLandlordController = require('../controllers/adminLandlordController');
const adminAuth = require('../middleware/adminAuth');

/**
 * Admin Landlord Management Routes
 */

// Custom middleware to allow GET requests without authentication
const adminGETBypass = (req, res, next) => {
  if (req.method === 'GET') {
    console.log('GET request to admin landlord route - bypassing authentication');
    
    // Only set admin context if not already set
    if (!req.admin) {
      req.admin = {
        _id: 'guest-admin-' + Date.now(),
        name: 'Guest Administrator',
        email: 'guest-admin@draze.system',
        role: 'admin',
        isActive: true
      };
    }
    
    // Only set user context if not already set
    if (!req.user) {
      req.user = {
        id: 'guest-admin-' + Date.now(),
        role: 'admin',
        isAdmin: true,
        permissions: ['all']
      };
    }
    
    return next();
  }
  
  // For non-GET requests, use the regular admin auth
  return adminAuth.required(req, res, next);
};

// Use custom middleware that bypasses auth for GET requests
router.use(adminGETBypass);

// Get all landlords with pagination and filtering
router.get('/', adminLandlordController.getAllLandlords);

// Get landlord statistics
router.get('/stats', adminLandlordController.getLandlordStats);

// Get detailed information about a specific landlord
router.get('/:id', adminLandlordController.getLandlordDetails);

// Toggle landlord active status
router.patch('/:id/toggle-status', adminLandlordController.toggleLandlordStatus);

module.exports = router;
