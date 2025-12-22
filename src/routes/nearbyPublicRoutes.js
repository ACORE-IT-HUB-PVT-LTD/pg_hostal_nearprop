// Public routes for accessing nearby property data
const express = require('express');
const router = express.Router();

// Import nearby property controller
const { 
  findNearbyProperties,
  findNearbyPropertiesByType,
  findNearbyPropertiesByAddress
} = require('../controllers/nearbyPropertyController');

// Public endpoints that don't require authentication
router.get('/', findNearbyProperties);
router.get('/type', findNearbyPropertiesByType);
router.get('/address', findNearbyPropertiesByAddress);

module.exports = router;
