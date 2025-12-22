// Diagnostic middleware to debug admin route issues
const express = require('express');
const router = express.Router();

/**
 * These routes allow us to inspect the middleware chain and
 * debug why admin authentication might be failing
 */

// Debug endpoint to verify admin middleware is working
router.get('/debug-admin-auth', (req, res) => {
  console.log('[DEBUG] Admin auth debug endpoint called');
  console.log('[DEBUG] Request headers:', req.headers);
  console.log('[DEBUG] Admin object:', req.admin);
  console.log('[DEBUG] User object:', req.user);
  
  res.status(200).json({
    success: true,
    message: 'Admin auth debug information',
    requestInfo: {
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip
    },
    adminContext: req.admin || 'No admin context found',
    userContext: req.user || 'No user context found',
    middlewareChain: {
      hasAdminContext: !!req.admin,
      hasUserContext: !!req.user,
      isAdmin: req.user?.isAdmin || false,
      accessLevel: req.user?.permissions || []
    }
  });
});

// Debug endpoint to check route ordering
router.get('/middleware-check', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Admin middleware order check',
    adminBypassWorking: !!req.admin,
    middlewareOrder: [
      'universalAdminBypass (first)',
      'adminBypassMiddleware',
      'methodSpecificAuth', 
      'adminAuth.required (last)'
    ],
    admin: req.admin || 'Missing admin context!'
  });
});

module.exports = router;
