const express = require('express');
const router = express.Router();
const PublicRatingController = require('../controllers/publicRatingController');
const ratingValidation = require('../middleware/ratingValidation');
const cors = require('cors');

// Apply CORS middleware for public routes
const corsMiddleware = (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  next();
};

// Handle OPTIONS requests
router.options('*', cors({
  origin: '*',
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Get public rating statistics for a property
router.get('/property/:propertyId/rating-stats', 
  corsMiddleware, 
  PublicRatingController.getPropertyRatingStats
);

// Get public ratings and reviews for a property
router.get('/property/:propertyId/ratings', 
  corsMiddleware, 
  ratingValidation.paginationAndSorting,
  PublicRatingController.getPublicPropertyRatings
);

// Get public comments for a property
router.get('/property/:propertyId/comments', 
  corsMiddleware, 
  ratingValidation.paginationAndSorting,
  PublicRatingController.getPublicPropertyComments
);

module.exports = router;
