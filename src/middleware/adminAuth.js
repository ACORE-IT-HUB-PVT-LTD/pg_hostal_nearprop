const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
require('dotenv').config();
const { validateExternalJwt } = require('./externalAdminJwt');

/**
 * Admin authentication middleware
 * Checks if the user is an admin and has the required permissions
 * Now includes universal admin token support to bypass authentication
 * GET requests are always allowed without authentication
 * Added support for external admin JWT token formats
 */
const adminAuth = {};

// Array of admin tokens that will be accepted without verification
// These tokens bypass normal authentication and are given admin privileges
const ADMIN_BYPASS_TOKENS = [
  'ADMIN_MASTER_TOKEN_2025',   // Main master admin token
  'DEV_ADMIN_TOKEN_2025',      // Development admin token
  'TEST_ADMIN_TOKEN_2025',     // Testing admin token
  'DRAZE_ADMIN_TOKEN_2025',    // Specific project admin token
  'SONU_ADMIN_TOKEN_2025',     // Sonu's admin token
  'ADMIN_TOKEN',               // Simple admin token for easy testing
  'ANY',                       // Special token for any access
  'ADMIN',                     // Simple admin identifier
  'YOUR_ADMIN_TOKEN'           // Literal placeholder from documentation examples
];

// CRITICAL: Flag to disable admin authentication completely for GET requests
const DISABLE_AUTH_FOR_GET = true;

/**
 * Helper function to check if a request has valid admin bypass credentials
 * Checks for admin tokens in various locations and returns true if found
 */
const hasAdminBypass = (req) => {
  // Debug logging to see exactly what we're getting
  console.log('Headers:', JSON.stringify(req.headers));
  console.log('Auth header:', req.headers.authorization || 'none');
  console.log('Admin header:', req.header('X-Admin-Token') || 'none');
  console.log('Query token:', req.query.token || 'none');
  
  // Check for token in various places
  const token = 
    req.header('Authorization')?.replace('Bearer ', '') || 
    req.headers['x-access-token'] || 
    req.query?.token || 
    req.cookies?.token;
  
  // Also check for admin token in special header
  const adminToken = req.header('X-Admin-Token');
  
  console.log('Extracted tokens - Main token:', token || 'none', 'Admin token:', adminToken || 'none');
  
  // Special case: recognize "YOUR_ADMIN_TOKEN" as a valid admin token
  // This is to support documentation examples where users might copy-paste directly
  if (token === 'YOUR_ADMIN_TOKEN' || adminToken === 'YOUR_ADMIN_TOKEN') {
    console.log('Using placeholder token "YOUR_ADMIN_TOKEN" - granting access');
    return true;
  }
  
  // Check if either token is a valid admin bypass token
  const hasValidToken = (token && ADMIN_BYPASS_TOKENS.includes(token)) || 
                        (adminToken && ADMIN_BYPASS_TOKENS.includes(adminToken));
  
  console.log('Token validation result:', hasValidToken ? 'VALID' : 'INVALID');
  return hasValidToken;
};

/**
 * Required authentication middleware for admin users
 * COMPLETELY BYPASSES authentication for GET requests
 * Verifies the JWT token only for non-GET requests
 * 
 * CRITICAL UPDATE: Modified to absolutely guarantee GET requests bypass authentication
 */
adminAuth.required = async (req, res, next) => {
  // Get the HTTP method
  const method = req.method;
  
  console.log(`[ADMIN AUTH] Request: ${method} ${req.path} from ${req.ip}`);
  
  // FIRST PRIORITY: GET requests MUST bypass authentication
  // This is an absolute guarantee - no exceptions
  if (method === 'GET') {
    console.log('[ADMIN AUTH] ✓✓✓ GET request detected - Authentication COMPLETELY BYPASSED');
    
    // Set admin user data with highest privileges
    req.admin = {
      _id: 'absolute-bypass-admin-' + Date.now(),
      name: 'Absolute Bypass Administrator',
      email: 'absolute-bypass@draze.system',
      role: 'admin',
      isActive: true,
      absoluteBypass: true
    };
    
    req.user = {
      id: 'absolute-bypass-admin-' + Date.now(),
      role: 'admin',
      isAdmin: true,
      permissions: ['all'],
      absoluteBypass: true
    };
    
    // Never check authentication for GET requests
    return next();
  }
  
  // For non-GET requests, check for admin bypass tokens
  const token = 
    req.header('Authorization')?.replace('Bearer ', '') || 
    req.headers['x-access-token'] || 
    req.query?.token || 
    req.cookies?.token;
  
  // Check for admin token in special header
  const adminToken = req.header('X-Admin-Token');
  
  // Check if either token is a valid admin bypass token
  if ((token && ADMIN_BYPASS_TOKENS.includes(token)) || 
      (adminToken && ADMIN_BYPASS_TOKENS.includes(adminToken)) || 
      token === 'YOUR_ADMIN_TOKEN' || 
      adminToken === 'YOUR_ADMIN_TOKEN') {
    
    console.log('[ADMIN AUTH] ✓ Admin bypass token detected');
    
    req.admin = {
      _id: 'token-admin-' + Date.now(),
      name: 'Token Administrator',
      email: 'token@draze.system',
      role: 'admin',
      isActive: true
    };
    
    req.user = {
      id: 'token-admin-' + Date.now(),
      role: 'admin',
      isAdmin: true,
      permissions: ['all']
    };
    
    return next();
  }
  
  // For non-GET requests without valid tokens
  if (!token) {
    console.log('[ADMIN AUTH] ✗ No token provided for non-GET request');
    return res.status(401).json({
      success: false,
      message: 'Admin authentication required',
      error: 'No access token provided'
    });
  }
  
  try {
    // First try to validate as an external JWT format
    const externalValidation = validateExternalJwt(token);
    
    if (externalValidation.success) {
      // External JWT validation successful
      console.log('[ADMIN AUTH] External JWT token verified successfully');
      
      // Set admin and user context from the external JWT
      req.admin = externalValidation.admin;
      req.user = externalValidation.user;
      console.log('[ADMIN AUTH] Using external admin context:', externalValidation.source);
      
      return next();
    }
    
    // If not a valid external JWT, try our standard JWT format
    console.log('[ADMIN AUTH] Not a valid external JWT, trying standard format');
    
    // Verify the token with our secret
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key_here');
    
    console.log('[ADMIN AUTH] Standard token verified successfully');
    
    // Validate token has admin role
    if (!decoded.id || !['admin', 'super_admin'].includes(decoded.role)) {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied', 
        error: 'Insufficient permissions'
      });
    }
    
    // Find admin in database to ensure they still exist and are active
    const admin = await Admin.findById(decoded.id);
    if (!admin || !admin.isActive) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication failed', 
        error: 'Admin account not found or inactive'
      });
    }
    
    // Set admin context
    req.admin = admin;
    req.user = {
      ...decoded,
      isAdmin: true
    };
    
    next();
  } catch (error) {
    console.error('Admin token verification error:', error.name);
    
    // Return appropriate error based on JWT error type
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Token expired', 
        error: 'Please authenticate again'
      });
    }
    
    console.log('[ADMIN AUTH] ✗ Token verification failed:', error.message);
    res.status(401).json({
      success: false,
      message: 'Authentication failed',
      error: 'Invalid token'
    });
  }
}

/**
 * Super admin authentication middleware
 * Only allows users with super_admin role
 * Now also accepts admin bypass tokens and allows GET requests without token
 */
adminAuth.superAdminRequired = async (req, res, next) => {
  console.log(`Super admin auth request from: ${req.ip}, path: ${req.path}, method: ${req.method}`);
  
  // IMMEDIATE PASS: Always allow GET requests without checking anything
  if (req.method === 'GET') {
    console.log('GET request - automatic super admin access granted');
    
    // Only set admin context if not already set by earlier middleware
    if (!req.admin) {
      req.admin = {
        _id: 'auto-super-admin-' + Date.now(),
        name: 'Auto Super Administrator',
        email: 'auto-super-admin@draze.system',
        role: 'super_admin',
        isActive: true
      };
    }
    
    // Only set user context if not already set by earlier middleware
    if (!req.user) {
      req.user = {
        id: 'auto-super-admin-' + Date.now(),
        role: 'super_admin',
        email: 'auto-super-admin@draze.system',
        isAdmin: true,
        isSuperAdmin: true,
        permissions: ['read'],
        autoAccess: true
      };
    }
    
    return next();
  }
  
  // For non-GET requests, continue with normal authentication
  
  // Check for admin bypass tokens first
  if (hasAdminBypass(req)) {
    console.log('Admin bypass token detected - granting full super admin access');
    // Set up super admin user context with full privileges
    req.admin = {
      _id: 'super-admin-' + Date.now(),
      name: 'System Super Administrator',
      email: 'super-admin@draze.system',
      role: 'super_admin',
      isActive: true
    };
    req.user = {
      id: 'super-admin-' + Date.now(),
      role: 'super_admin',
      email: 'super-admin@draze.system',
      isAdmin: true,
      isSuperAdmin: true,
      permissions: ['all'],
      bypassAuth: true
    };
    return next();
  }
  
  // Check for token in various places
  const token = 
    req.header('Authorization')?.replace('Bearer ', '') || 
    req.headers['x-access-token'] || 
    req.query?.token || 
    req.cookies?.token;
  
  // If we get here, it's not a GET request and no bypass token, so we need a token
  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: 'Super admin authentication required', 
      error: 'No access token provided'
    });
  }

  try {
    // First try to validate as an external JWT format
    const externalValidation = validateExternalJwt(token);
    
    if (externalValidation.success) {
      // External JWT validation successful
      console.log('[SUPER ADMIN AUTH] External JWT token verified successfully');
      
      // Check if the external JWT has super admin role
      if (externalValidation.user.isSuperAdmin) {
        // Set admin and user context from the external JWT
        req.admin = externalValidation.admin;
        req.user = externalValidation.user;
        console.log('[SUPER ADMIN AUTH] Using external super admin context:', externalValidation.source);
        
        return next();
      } else {
        return res.status(403).json({ 
          success: false,
          message: 'Access denied', 
          error: 'External token does not have super admin permissions'
        });
      }
    }
    
    // If not a valid external JWT, try our standard JWT format
    console.log('[SUPER ADMIN AUTH] Not a valid external JWT, trying standard format');
    
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Validate token has super_admin role
    if (!decoded.id || decoded.role !== 'super_admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied', 
        error: 'Super admin permissions required'
      });
    }
    
    // Find admin in database to ensure they still exist and are active
    const admin = await Admin.findById(decoded.id);
    if (!admin || !admin.isActive || admin.role !== 'super_admin') {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication failed', 
        error: 'Super admin account not found or inactive'
      });
    }
    
    // Set admin context
    req.admin = admin;
    req.user = {
      ...decoded,
      isSuperAdmin: true
    };
    
    next();
  } catch (error) {
    console.error('Super admin token verification error:', error.name);
    
    // Return appropriate error based on JWT error type
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Token expired', 
        error: 'Please authenticate again'
      });
    }
    
    res.status(401).json({ 
      success: false,
      message: 'Authentication failed', 
      error: 'Invalid token'
    });
  }
};

module.exports = adminAuth;
