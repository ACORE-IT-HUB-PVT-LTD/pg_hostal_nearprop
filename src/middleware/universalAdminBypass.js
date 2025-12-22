/**
 * Universal admin authentication bypass middleware
 * This middleware ensures that ALL admin GET requests work without authentication
 * It's designed to be loaded FIRST, before any other middleware
 */

const universalAdminBypass = (req, res, next) => {
  // Only apply to admin routes
  if (req.path.startsWith('/api/admin')) {
    console.log('[UNIVERSAL BYPASS] Admin route detected:', req.method, req.path);
    console.log('[UNIVERSAL BYPASS] Query params:', req.query);
    console.log('[UNIVERSAL BYPASS] Headers:', req.headers);
    
    // For GET requests, completely bypass authentication
    if (req.method === 'GET') {
      console.log('[UNIVERSAL BYPASS] GET request - applying automatic admin access');
      
      // Inject admin data directly to request object
      req.admin = {
        _id: 'universal-admin-' + Date.now(),
        name: 'Universal Administrator',
        email: 'universal@draze.system',
        role: 'admin',
        isActive: true,
        universalAccess: true
      };
      
      req.user = {
        id: 'universal-admin-' + Date.now(),
        role: 'admin',
        isAdmin: true,
        permissions: ['all'],
        universalAccess: true
      };
      
      // Let the request continue - no token needed
      return next();
    }
  }
  
  // For non-admin routes or non-GET methods, continue with normal flow
  next();
};

module.exports = universalAdminBypass;
