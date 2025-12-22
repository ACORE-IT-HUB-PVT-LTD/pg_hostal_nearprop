/**
 * Debug controller for API gateway testing
 * These endpoints help validate API gateway header forwarding and authentication
 */
const debugController = {
  /**
   * Echo back all headers and request information
   * Useful for debugging API gateway integrations
   */
  echoHeaders: async (req, res) => {
    try {
      // Extract request information
      const requestInfo = {
        headers: req.headers,
        originalUrl: req.originalUrl,
        path: req.path,
        method: req.method,
        params: req.params,
        query: req.query,
        userInfo: req.user ? {
          id: req.user.id,
          role: req.user.role
        } : null,
        forwardedInfo: {
          ip: req.headers['x-forwarded-for'] || req.ip,
          host: req.headers['x-forwarded-host'] || req.hostname,
          proto: req.headers['x-forwarded-proto'] || req.protocol,
        },
        tracing: {
          requestId: req.headers['x-request-id'] || req.traceId,
          correlationId: req.headers['x-correlation-id'],
        }
      };
      
      // Set response headers for debugging
      res.set('X-Response-Time', `${Date.now() - req.startTime || 0}ms`);
      res.set('X-Request-ID', requestInfo.tracing.requestId);
      
      return res.status(200).json({
        success: true,
        message: 'Debug info',
        requestInfo
      });
    } catch (error) {
      console.error('Error in debug controller:', error);
      return res.status(500).json({
        success: false,
        message: 'Error processing debug request',
        error: error.message
      });
    }
  },
  
  /**
   * Test authentication and forwarded credentials
   * Helps validate JWT token handling in API gateway environments
   */
  testAuth: async (req, res) => {
    try {
      // This endpoint requires authentication
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }
      
      // Get authentication details
      const authInfo = {
        user: {
          id: req.user.id,
          role: req.user.role,
          iss: req.user.iss,
          exp: req.user.exp,
        },
        token: {
          type: req.headers.authorization?.split(' ')[0] || 'None',
          present: !!req.headers.authorization,
        },
        tenant: req.tenant ? {
          id: req.tenant._id,
          tenantId: req.tenant.tenantId,
          name: req.tenant.name,
        } : null,
        landlord: req.landlord ? {
          id: req.landlord._id,
          landlordId: req.landlord.landlordId,
          name: req.landlord.name,
        } : null,
      };
      
      return res.status(200).json({
        success: true,
        message: 'Authentication successful',
        authInfo
      });
    } catch (error) {
      console.error('Error in auth debug controller:', error);
      return res.status(500).json({
        success: false,
        message: 'Error processing auth debug request',
        error: error.message
      });
    }
  },
  
  /**
   * Test response headers and status codes
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  testResponseHeaders: async (req, res) => {
    try {
      // Extract status code from query
      const statusCode = parseInt(req.query.statusCode) || 200;
      
      // Set various response headers for testing
      res.set('X-Response-Time', `${Date.now() - req.startTime || 0}ms`);
      res.set('X-Request-ID', req.headers['x-request-id'] || req.traceId);
      res.set('X-Rate-Limit-Limit', '100');
      res.set('X-Rate-Limit-Remaining', '99');
      res.set('X-Rate-Limit-Reset', `${Math.floor(Date.now() / 1000) + 60}`);
      
      // Set status code and return response
      return res.status(statusCode).json({
        success: statusCode < 400,
        message: `Response with status code ${statusCode}`,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || req.traceId,
      });
    } catch (error) {
      console.error('Error in response headers debug controller:', error);
      return res.status(500).json({
        success: false,
        message: 'Error processing response headers debug request',
        error: error.message
      });
    }
  },
};

module.exports = debugController;
