/**
 * Visit routes for scheduling property visits
 */
const express = require('express');
const router = express.Router();
const visitController = require('../controllers/visitController');
const auth = require('../middleware/auth');
const landlordAuth = require('../middleware/landlordAuth');

// Create a visit schedule (for users) - requires authentication
router.post('/', auth.required, visitController.createVisit);

// Get all visits for a user or for properties owned by a landlord - requires authentication
router.get('/user', auth.required, visitController.getUserVisits);

// Get all visits for a landlord's properties - requires landlord authentication
router.get('/landlord', auth.required, landlordAuth, visitController.getLandlordVisits);

// Get a specific visit by ID
router.get('/:visitId', auth.required, visitController.getVisitById);

// Confirm a visit (landlord only) - requires landlord authentication
router.put('/:visitId/confirm', auth.required, landlordAuth, visitController.confirmVisit);

// Cancel a visit (user or landlord) - requires authentication
router.put('/:visitId/cancel', auth.required, visitController.cancelVisit);

// Complete a visit (landlord only) - requires landlord authentication
router.put('/:visitId/complete', auth.required, landlordAuth, visitController.completeVisit);

module.exports = router;
