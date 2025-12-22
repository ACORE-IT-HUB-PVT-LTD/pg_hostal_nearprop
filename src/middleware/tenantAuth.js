/**
 * Enhanced middleware to verify tenant authentication for API Gateway compatibility
 * Supports distributed architecture with multiple services and API gateway forwarded headers
 */
const Tenant = require('../models/Tenant');
const { getCache, setCache } = require('../utils/redis');

module.exports = async (req, res, next) => {
  const startTime = Date.now();
  const traceId = req.headers['x-trace-id'] || req.headers['x-request-id'] || `tenant-auth-${Date.now()}`;
  req.traceId = traceId; // Store for use in downstream middleware/controllers
  
  try {
    console.log(`[${traceId}] Tenant auth check for path: ${req.path}`);
    
    // Check if auth middleware has run and set user info
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required', 
        error: 'Valid authentication token required'
      });
    }

    // Try to get tenant data from cache first for better performance
    const cacheKey = `tenant:${req.user.id}:auth`;
    let tenant = null;
    
    // Use the existing Redis utility functions
    const cachedTenant = await getCache(cacheKey);
    if (cachedTenant) {
      tenant = cachedTenant; // Already parsed by our getCache util
      console.log(`[${traceId}] Tenant auth from cache: ${req.user.id}`);
    }
    
    // If not in cache, get from database
    if (!tenant) {
      console.log(`[${traceId}] Tenant auth from DB for: ${req.user.id}`);
      tenant = await Tenant.findOne({ tenantId: req.user.id });
      
      // Store in cache for future requests if found
      if (tenant) {
        // Extract only needed fields before caching
        const tenantCache = {
          _id: tenant._id,
          tenantId: tenant.tenantId,
          name: tenant.name,
          email: tenant.email,
          mobile: tenant.mobile
        };
        await setCache(cacheKey, tenantCache, 3600); // 1 hour
      }
    }

    // Tenant not found - reject access
    if (!tenant) {
      console.log(`[${traceId}] Tenant auth failed: tenant not found for ${req.user.id}`);
      return res.status(403).json({
        success: false,
        message: 'Access denied',
        error: 'User is not a registered tenant'
      });
    }

    // Add tenant data to the request object for controllers to use
    req.tenant = tenant;
    
    // Add execution time as response header for monitoring
    const execTime = Date.now() - startTime;
    res.set('X-Tenant-Auth-Time', `${execTime}ms`);
    
    next();
  } catch (error) {
    console.error(`[${traceId}] Error in tenantAuth middleware:`, error);
    
    return res.status(500).json({ 
      success: false,
      message: 'Authorization service error',
      error: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred during authorization'
        : error.message
    });
  }
};
