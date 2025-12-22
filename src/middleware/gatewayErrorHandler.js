/**
 * API Gateway Error Handler Middleware
 * Standardizes error responses for API gateway environments
 */

// Error types that may occur in the application
const ERROR_TYPES = {
  VALIDATION: 'ValidationError',
  AUTHENTICATION: 'AuthenticationError',
  AUTHORIZATION: 'AuthorizationError',
  NOT_FOUND: 'NotFoundError',
  DUPLICATE: 'DuplicateError',
  DATABASE: 'DatabaseError',
  EXTERNAL: 'ExternalServiceError',
  RATE_LIMIT: 'RateLimitError',
  INTERNAL: 'InternalError'
};

/**
 * Maps error types to appropriate HTTP status codes
 * @param {string} errorType - Type of error
 * @returns {number} - HTTP status code
 */
const getStatusCode = (errorType) => {
  switch (errorType) {
    case ERROR_TYPES.VALIDATION:
      return 400; // Bad Request
    case ERROR_TYPES.AUTHENTICATION:
      return 401; // Unauthorized
    case ERROR_TYPES.AUTHORIZATION:
      return 403; // Forbidden
    case ERROR_TYPES.NOT_FOUND:
      return 404; // Not Found
    case ERROR_TYPES.DUPLICATE:
      return 409; // Conflict
    case ERROR_TYPES.RATE_LIMIT:
      return 429; // Too Many Requests
    default:
      return 500; // Internal Server Error
  }
};

/**
 * Gateway-friendly error handler middleware
 * Formats errors in a consistent way for API gateway consumers
 */
const gatewayErrorHandler = (err, req, res, next) => {
  // Get trace ID from request if available
  const traceId = req.traceId || req.headers['x-request-id'] || req.headers['x-trace-id'];
  
  // Log the error with trace ID for correlation
  console.error(`[${traceId || 'ERROR'}] Gateway error:`, err);
  
  // Extract error details
  const errorType = err.type || ERROR_TYPES.INTERNAL;
  const statusCode = err.statusCode || getStatusCode(errorType);
  
  // Format error for gateway response
  const gatewayError = {
    success: false,
    error: {
      code: err.code || errorType,
      message: err.message || 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'production' ? undefined : err.details || err.stack
    },
    requestId: traceId,
    timestamp: new Date().toISOString()
  };
  
  // Add gateway-specific headers
  res.set('X-Error-Code', errorType);
  res.set('X-Request-ID', traceId);
  
  // Send response
  return res.status(statusCode).json(gatewayError);
};

/**
 * Create a custom error with type
 * @param {string} message - Error message
 * @param {string} type - Error type
 * @param {number} statusCode - HTTP status code
 * @param {*} details - Additional error details
 * @returns {Error} - Custom error object
 */
const createError = (message, type = ERROR_TYPES.INTERNAL, statusCode = null, details = null) => {
  const error = new Error(message);
  error.type = type;
  error.statusCode = statusCode || getStatusCode(type);
  error.details = details;
  return error;
};

module.exports = {
  gatewayErrorHandler,
  createError,
  ERROR_TYPES
};
