/**
 * Debug routes for API Gateway testing and integration
 */
const express = require('express');
const router = express.Router();
const debugController = require('../controllers/debugController');
const auth = require('../middleware/auth');
const tenantAuth = require('../middleware/tenantAuth');
const landlordAuth = require('../middleware/landlordAuth');

// Record start time for all requests to measure response time
router.use((req, res, next) => {
  req.startTime = Date.now();
  next();
});

// Public debug routes (no auth required)
router.get('/echo-headers', debugController.echoHeaders);
router.get('/response-headers', debugController.testResponseHeaders);

// Auth-required debug routes
router.get('/auth-check', auth.required, debugController.testAuth);

// Tenant-specific debug routes
router.get('/tenant-auth-check', auth.required, tenantAuth, debugController.testAuth);

// Landlord-specific debug routes
router.get('/landlord-auth-check', auth.required, landlordAuth, debugController.testAuth);

module.exports = router;
