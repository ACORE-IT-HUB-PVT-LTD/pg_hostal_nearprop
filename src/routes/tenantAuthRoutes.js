const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const tenantAuth = require('../middleware/tenantAuth');
const { 
  registerTenant,
  loginTenant,
  updateTenantProfile
} = require('../controllers/tenantAuthController');

// Authentication routes - no auth required
router.post('/register', registerTenant);
router.post('/login', loginTenant);

// Profile management - auth required
router.put('/profile', auth.required, tenantAuth, updateTenantProfile);

module.exports = router;
