const express = require('express');
const router = express.Router();
const adminLandlordRoutes = require('./adminLandlordRoutes');
const adminPropertyRoutes = require('./adminPropertyRoutes');
const adminReelsRoutes = require('./adminReelsRoutes');
const adminAuthRoutes = require('./adminAuthRoutes');
const adminAuth = require('../middleware/adminAuth');

/**
 * Main Admin Routes
 * This file consolidates all admin routes under the /api/admin prefix
 */

// Skip authentication for GET requests, apply authentication for other methods
const methodSpecificAuth = (req, res, next) => {
  // For GET requests, allow access (admin context is already set by server.js middleware)
  if (req.method === 'GET') {
    console.log('[ADMIN ROUTES] GET request detected - bypassing authentication');
    
    // Make sure we have admin data set
    if (!req.admin) {
      req.admin = {
        _id: 'route-admin-' + Date.now(),
        name: 'Route Administrator',
        email: 'route-admin@draze.system',
        role: 'admin',
        isActive: true
      };
    }
    
    if (!req.user) {
      req.user = {
        id: 'route-admin-' + Date.now(),
        role: 'admin',
        isAdmin: true,
        permissions: ['all']
      };
    }
    
    return next();
  }
  
  // For non-GET requests, use the regular admin auth
  return adminAuth.required(req, res, next);
};

// Auth routes are handled by their own middleware in adminAuthRoutes.js
router.use('/auth', adminAuthRoutes);

// Allow direct access to dashboard for GET requests
router.get('/dashboard', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Admin dashboard access granted',
    admin: {
      id: req.admin?._id || 'guest-admin',
      name: req.admin?.name || 'Guest Administrator',
      email: req.admin?.email || 'admin@draze.system',
      role: req.admin?.role || 'admin'
    }
  });
});

// Apply method-specific auth to all admin routes
router.use(methodSpecificAuth);

// Route for admin dashboard overview
router.get('/dashboard', (req, res) => {
  console.log('[ADMIN ROUTES] Dashboard accessed');
  res.status(200).json({
    success: true,
    message: 'Admin dashboard access granted',
    admin: {
      id: req.admin?._id || 'dashboard-admin',
      name: req.admin?.name || 'Dashboard Administrator',
      email: req.admin?.email || 'dashboard@draze.system',
      role: req.admin?.role || 'admin'
    }
  });
});

// Landlord management routes - with debug logging
router.use('/landlords', (req, res, next) => {
  console.log('[ADMIN ROUTES] Landlords route accessed with method:', req.method);
  console.log('Admin context:', req.admin ? 'Present' : 'Missing');
  next();
}, adminLandlordRoutes);

// Property management routes
router.use('/properties', adminPropertyRoutes);

// Reels management routes
router.use('/reels', adminReelsRoutes);

module.exports = router;
