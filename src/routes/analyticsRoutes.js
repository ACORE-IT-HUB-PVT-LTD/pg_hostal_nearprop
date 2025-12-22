const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const landlordAuth = require('../middleware/landlordAuth');
const analyticsController = require('../controllers/analyticsController');
const complaintController = require('../controllers/complaintController');
const collectionController = require('../controllers/collectionController');

// Tenant Dues Routes - All these routes require landlord auth
router.get('/dues', auth.required, landlordAuth, analyticsController.getAllTenantDues);

// Complaint Management Routes - Landlord specific routes
router.get('/complaints', auth.required, landlordAuth, complaintController.getAllComplaints);

// Collections Routes
router.get('/collections', auth.required, landlordAuth, collectionController.getCollectionSummary);
router.get('/property/:propertyId/collections', auth.required, landlordAuth, collectionController.getPropertyCollectionReport);
router.get('/collections/forecast', auth.required, landlordAuth, collectionController.getCollectionForecast);

module.exports = router;
