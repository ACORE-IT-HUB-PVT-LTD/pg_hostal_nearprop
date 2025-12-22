const express = require('express');
const router = express.Router();
const reelController = require('../controllers/reelController');
const { getReelsFixed, getReelAnalyticsFixed } = require('../controllers/reelControllerFixed');
const { uploadReelFixed } = require('../controllers/fixedReelUploadController');
const reelUploadService = require('../utils/reelUploadService');
const auth = require('../middleware/auth');
const landlordAuth = require('../middleware/landlordAuth');
const tenantAuth = require('../middleware/tenantAuth');

// Public routes - accessible without authentication
router.get('/', getReelsFixed); // Get all reels - no auth needed
router.get('/:id', reelController.getReelById); // Get single reel - no auth needed
router.post('/:id/view', reelController.recordReelView); // Record view count - no auth needed

// Interaction routes - require authentication
router.post('/:id/like', auth.required, reelController.likeReel); // Like/unlike a reel
router.post('/:id/share', auth.required, reelController.shareReel); // Share a reel
router.post('/:id/comment', auth.required, reelController.commentOnReel); // Comment on a reel
router.post('/:id/save', auth.required, reelController.saveReel); // Save a reel

// User saved reels
router.get('/user/saved', auth.required, reelController.getSavedReels);

// Landlord-specific routes
router.post(
  '/upload', 
  (req, res, next) => {
    console.log('🔍 REEL UPLOAD REQUEST RECEIVED');
    console.log('Headers:', JSON.stringify(req.headers));
    next();
  },
  auth.required,
  landlordAuth, 
  (req, res, next) => {
    // Handle file upload with better error handling
    reelUploadService.upload.single('video')(req, res, function(err) {
      if (err) {
        console.error('File upload error:', err);
        return res.status(400).json({
          success: false,
          message: err.message || 'Error uploading file',
          error: err.message
        });
      }
      next();
    });
  },
  uploadReelFixed // Use the fixed upload controller
);

// Important: Fixed route order to prevent conflicts
// Static routes before dynamic routes
router.get('/landlord/notifications', auth.required, landlordAuth, reelController.getReelNotifications);
router.put('/landlord/notifications/mark-read', auth.required, landlordAuth, reelController.markNotificationsAsRead);
router.get('/landlord/analytics', auth.required, landlordAuth, getReelAnalyticsFixed);
router.get('/landlord/all', auth.required, landlordAuth, reelController.getLandlordReels);
router.get('/landlord/anonymous-interactions', auth.required, landlordAuth, reelController.getAnonymousInteractions);

// Get interactions for a specific reel
router.get('/:id/interactions', auth.required, reelController.getReelInteractions);

// Delete a reel - should be at the end to not conflict with other routes
router.delete('/:id', auth.required, landlordAuth, reelController.deleteReel);

module.exports = router;
