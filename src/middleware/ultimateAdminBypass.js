// Admin direct access middleware
// This script provides direct access to admin GET routes without authentication

const express = require('express');
const router = express.Router();

// IMPORTANT: This middleware will be applied to all admin routes
// It ensures that any GET request to an admin route will bypass authentication
// by adding admin context directly to the request object

router.use((req, res, next) => {
  console.log(`[ULTIMATE BYPASS] Admin route accessed: ${req.method} ${req.originalUrl}`);
  
  // Only process GET requests
  if (req.method === 'GET') {
    console.log('[ULTIMATE BYPASS] GET request - bypassing ALL authentication checks');
    
    // Set admin user data with full privileges
    req.admin = {
      _id: 'super-bypass-' + Date.now(),
      name: 'Ultimate Bypass Administrator',
      email: 'ultimate@draze.system',
      role: 'super_admin',
      isActive: true,
      bypassLevel: 'ultimate'
    };
    
    req.user = {
      id: 'super-bypass-' + Date.now(),
      role: 'super_admin',
      isAdmin: true,
      isSuperAdmin: true,
      permissions: ['all'],
      bypassLevel: 'ultimate'
    };
    
    console.log('[ULTIMATE BYPASS] Admin context set successfully');
  }
  
  // Continue with the request
  next();
});

module.exports = router;
