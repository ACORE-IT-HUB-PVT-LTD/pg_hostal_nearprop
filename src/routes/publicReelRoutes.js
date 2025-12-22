const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth'); // For optional authentication
const landlordAuth = require('../middleware/landlordAuth');
const { 
  getPublicReel, 
  getPublicReels, 
  likeReel, 
  addComment, 
  viewReel,
  getLandlordReelStats
} = require('../controllers/publicReelController');

/**
 * Public routes - no authentication required
 */

// Get all public reels with filtering and pagination
router.get('/public', getPublicReels);

// Get a specific public reel by ID
router.get('/public/:id', getPublicReel);

// Increment view count for a reel
router.post('/:id/view', viewReel);

/**
 * Routes with optional authentication
 * Will work with or without a token
 */

// Like a reel (works with or without auth)
router.post('/:id/like', auth.optional, likeReel);

// Add a comment to a reel (works with or without auth)
router.post('/:id/comment', auth.optional, addComment);

/**
 * Routes that require landlord authentication
 */

// Get statistics for landlord's reels
router.get('/stats', landlordAuth, getLandlordReelStats);

module.exports = router;
