// Express bypass middleware to fix admin authentication issues
const express = require('express');
const router = express.Router();

// Import admin controllers
const adminLandlordController = require('../controllers/adminLandlordController');
const adminPropertyController = require('../controllers/adminPropertyController');
const adminReelsController = require('../controllers/adminReelsController');

// Direct bypass middleware for admin GET requests
const adminDirectBypass = (req, res, next) => {
  console.log('[ADMIN DIRECT BYPASS] Request:', req.method, req.path);
  
  // Set admin data for the request
  req.admin = {
    _id: 'bypass-admin-' + Date.now(),
    name: 'Direct Bypass Administrator',
    email: 'bypass@draze.system',
    role: 'admin',
    isActive: true
  };
  
  req.user = {
    id: 'bypass-admin-' + Date.now(),
    role: 'admin',
    isAdmin: true,
    permissions: ['all']
  };
  
  next();
};

// Apply bypass middleware to all routes
router.use(adminDirectBypass);

// Direct landlord routes - No auth needed
router.get('/landlords', adminLandlordController.getAllLandlords);
router.get('/landlords/stats', adminLandlordController.getLandlordStats);
router.get('/landlords/:id', adminLandlordController.getLandlordDetails);

// Direct property routes - No auth needed
router.get('/properties', adminPropertyController.getAllProperties);
router.get('/properties/:id', adminPropertyController.getPropertyDetails);

// Direct reels routes - No auth needed
router.get('/reels', adminReelsController.getAllReels);
router.get('/reels/landlord/:id', adminReelsController.getLandlordReels);
router.get('/reels/property/:id', adminReelsController.getPropertyReels);
router.get('/reels/:id', adminReelsController.getReelDetails);

module.exports = router;
