/**
 * External Admin JWT Compatibility Module
 * 
 * This module provides compatibility with external admin JWT token formats
 * like the one from NearpropBackend with format:
 * {
 *   "sub": "11",
 *   "roles": ["USER", "ADMIN"],
 *   "sessionId": "62a05d37-59e9-497c-b8c3-de7a7be1dbfb",
 *   "iat": 1754992247,
 *   "exp": 1755597047,
 *   "iss": "NearpropBackend"
 * }
 */

const jwt = require('jsonwebtoken');

/**
 * External JWT token formats and their configurations
 */
const EXTERNAL_JWT_FORMATS = {
  // NearpropBackend JWT format
  NearpropBackend: {
    issuer: 'NearpropBackend',
    // We'll accept tokens with sub claims (user ID) and roles that include 'ADMIN'
    validatePayload: (payload) => {
      // Must have a sub claim (user ID)
      if (!payload.sub) return false;
      // Must have roles that include 'ADMIN'
      if (!payload.roles || !Array.isArray(payload.roles) || !payload.roles.includes('ADMIN')) {
        return false;
      }
      return true;
    },
    // Map the external token format to our internal admin object
    mapToAdmin: (payload) => ({
      _id: `external-${payload.iss.toLowerCase()}-${payload.sub}`,
      name: `External ${payload.iss} Admin`,
      email: `external-${payload.sub}@${payload.iss.toLowerCase()}.admin`,
      role: payload.roles.includes('SUPER_ADMIN') ? 'super_admin' : 'admin',
      isActive: true,
      externalAuth: {
        source: payload.iss,
        userId: payload.sub,
        roles: payload.roles,
        sessionId: payload.sessionId
      }
    }),
    // Map the external token to our internal user object
    mapToUser: (payload) => ({
      id: `external-${payload.iss.toLowerCase()}-${payload.sub}`,
      role: payload.roles.includes('SUPER_ADMIN') ? 'super_admin' : 'admin',
      isAdmin: true,
      isSuperAdmin: payload.roles.includes('SUPER_ADMIN'),
      permissions: ['all'],
      externalAuth: {
        source: payload.iss,
        userId: payload.sub,
        roles: payload.roles,
        sessionId: payload.sessionId
      }
    })
  },
  // Add more external JWT formats here as needed
};

/**
 * Validates an external JWT token
 * @param {string} token - The JWT token to validate
 * @returns {Object} - Object with success status and admin/user objects if successful
 */
function validateExternalJwt(token) {
  console.log('[EXTERNAL JWT] Attempting to validate external JWT token');
  
  try {
    // First decode without verification to determine format
    const decodedWithoutVerification = jwt.decode(token, { complete: true });
    
    if (!decodedWithoutVerification || !decodedWithoutVerification.payload) {
      console.log('[EXTERNAL JWT] Failed to decode token');
      return { success: false, error: 'Invalid token format' };
    }
    
    const payload = decodedWithoutVerification.payload;
    console.log('[EXTERNAL JWT] Decoded payload:', payload);
    
    // Check issuer to determine token format
    const issuer = payload.iss;
    const tokenFormat = EXTERNAL_JWT_FORMATS[issuer];
    
    if (!tokenFormat) {
      console.log(`[EXTERNAL JWT] Unknown issuer: ${issuer}`);
      return { success: false, error: 'Unknown token issuer' };
    }
    
    // For external tokens, we don't verify the signature since we don't have the secret
    // Instead, we validate the payload structure and expiration
    
    // Check if token is expired
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      console.log('[EXTERNAL JWT] Token is expired');
      return { success: false, error: 'Token expired' };
    }
    
    // Validate payload according to the expected format
    if (!tokenFormat.validatePayload(payload)) {
      console.log('[EXTERNAL JWT] Invalid payload structure');
      return { success: false, error: 'Invalid token payload' };
    }
    
    console.log(`[EXTERNAL JWT] Successfully validated token from ${issuer}`);
    
    // Map the external token format to our internal admin and user objects
    const admin = tokenFormat.mapToAdmin(payload);
    const user = tokenFormat.mapToUser(payload);
    
    return {
      success: true,
      admin,
      user,
      source: issuer,
      originalPayload: payload
    };
  } catch (error) {
    console.error('[EXTERNAL JWT] Validation error:', error);
    return { success: false, error: error.message };
  }
}

module.exports = { validateExternalJwt };
