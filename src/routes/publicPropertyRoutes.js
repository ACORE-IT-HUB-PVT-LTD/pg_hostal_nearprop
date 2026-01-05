const express = require('express');
const router = express.Router();
const publicPropertyController = require('../controllers/publicPropertyController');
const cors = require('cors');
const { attachRatingSummary } = require('../middleware/ratingEnhancement');
const authenticate = require('../middleware/authenticate');

// Apply CORS middleware to all public routes
const corsMiddleware = (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  next();
};

// Handle OPTIONS requests for all public routes
router.options('*', cors({
  origin: '*',
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Apply rating summary middleware to all property responses
router.use(attachRatingSummary);

// GET all properties with filters
router.get('/properties', corsMiddleware, publicPropertyController.getAllPublicProperties);

// GET property by ID
router.get('/property/:propertyId', corsMiddleware, authenticate, publicPropertyController.getPublicPropertyById);

// GET recommended properties - must come before the type route
router.get('/properties/recommended', corsMiddleware, publicPropertyController.getRecommendedProperties);

// GET properties by location radius - must come before the type route
router.get('/properties/nearby', corsMiddleware, publicPropertyController.searchPropertiesByRadius);

// GET properties by type
router.get('/properties/:type', corsMiddleware, publicPropertyController.getPublicPropertiesByType);

// GET property statistics 
router.get('/property-stats', corsMiddleware, publicPropertyController.getPublicPropertyStats);

// GET all properties with default sorting by newest
router.get('/all-properties', corsMiddleware, publicPropertyController.getAllPropertiesDefault);

// GET properties near user's current location
router.get('/properties/near-me', corsMiddleware, publicPropertyController.getPropertiesNearMe);

module.exports = router;
