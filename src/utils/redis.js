const { redisClient } = require('../config/database');

/**
 * Set a value in Redis cache with expiration
 * @param {string} key - Cache key
 * @param {any} value - Value to cache (will be JSON stringified)
 * @param {number} expiry - Expiration time in seconds (default: 1 hour)
 * @returns {Promise<boolean>} - Success status
 */
const setCache = async (key, value, expiry = 3600) => {
  try {
    if (!redisClient || !redisClient.isReady) {
      console.warn('Redis client not ready, skipping cache set');
      return false;
    }
    
    // Convert object to string if needed
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    
    await redisClient.setEx(key, expiry, stringValue);
    return true;
  } catch (error) {
    console.error(`Redis set error for key ${key}:`, error);
    return false;
  }
};

/**
 * Get a value from Redis cache
 * @param {string} key - Cache key
 * @returns {Promise<any>} - Cached value or null
 */
const getCache = async (key) => {
  try {
    if (!redisClient || !redisClient.isReady) {
      console.warn('Redis client not ready, skipping cache get');
      return null;
    }
    
    const data = await redisClient.get(key);
    
    if (!data) return null;
    
    try {
      // Try to parse as JSON
      return JSON.parse(data);
    } catch (parseError) {
      // If not valid JSON, return as is
      return data;
    }
  } catch (error) {
    console.error(`Redis get error for key ${key}:`, error);
    return null;
  }
};

/**
 * Delete a key from Redis cache
 * @param {string} key - Cache key to delete
 * @returns {Promise<boolean>} - Success status
 */
const deleteCache = async (key) => {
  try {
    if (!redisClient || !redisClient.isReady) {
      console.warn('Redis client not ready, skipping cache delete');
      return false;
    }
    
    await redisClient.del(key);
    return true;
  } catch (error) {
    console.error(`Redis delete error for key ${key}:`, error);
    return false;
  }
};

/**
 * Clear cache keys matching a pattern
 * @param {string} pattern - Pattern to match (e.g., "user:*")
 * @returns {Promise<boolean>} - Success status
 */
const clearCachePattern = async (pattern) => {
  try {
    if (!redisClient || !redisClient.isReady) {
      console.warn('Redis client not ready, skipping pattern clear');
      return false;
    }
    
    const keys = await redisClient.keys(pattern);
    if (keys.length === 0) return true;
    
    const pipeline = redisClient.multi();
    keys.forEach(key => pipeline.del(key));
    await pipeline.exec();
    return true;
  } catch (error) {
    console.error(`Redis pattern clear error for ${pattern}:`, error);
    return false;
  }
};

module.exports = { setCache, getCache, deleteCache, clearCachePattern };