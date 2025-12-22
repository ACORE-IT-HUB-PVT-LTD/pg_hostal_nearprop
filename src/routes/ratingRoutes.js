const express = require('express');
const router = express.Router();
const RatingController = require('../controllers/ratingController');
const ratingValidation = require('../middleware/ratingValidation');
const auth = require('../middleware/auth');

// Routes for authenticated users
// Add or update a rating and review for a property
router.post('/property/:propertyId/ratings', 
  auth.required, 
  ratingValidation.addRating, 
  RatingController.addOrUpdateRating
);

// Add a comment to a property
router.post('/property/:propertyId/comments', 
  auth.required, 
  ratingValidation.addComment, 
  RatingController.addComment
);

// Add a reply to a comment
router.post('/comments/:commentId/replies', 
  auth.required, 
  ratingValidation.addReply, 
  RatingController.addReplyToComment
);

// Get all ratings and reviews for a property
router.get('/property/:propertyId/ratings', 
  auth.required, 
  ratingValidation.paginationAndSorting,
  RatingController.getPropertyRatings
);

// Get all comments for a property
router.get('/property/:propertyId/comments', 
  auth.required, 
  ratingValidation.paginationAndSorting,
  RatingController.getPropertyComments
);

// Get rating statistics for a property
router.get('/property/:propertyId/rating-stats', 
  auth.required, 
  RatingController.getPropertyRatingStats
);

// Get all ratings and reviews for a landlord's properties
router.get('/landlord/ratings', 
  auth.required, 
  ratingValidation.paginationAndSorting,
  RatingController.getLandlordPropertyRatings
);

// Delete a rating/review
router.delete('/ratings/:ratingId', 
  auth.required, 
  RatingController.deleteRating
);

// Delete a comment
router.delete('/comments/:commentId', 
  auth.required, 
  RatingController.deleteComment
);

module.exports = router;
