// Room availability routes for tenant assignment
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getAvailableRoomsAndBeds } = require('../controllers/roomAvailabilityController');

// Get available rooms and beds for tenant assignment in a property
router.get('/properties/:propertyId/availability', auth.required, getAvailableRoomsAndBeds);

module.exports = router;
