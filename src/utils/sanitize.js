/**
 * Utility functions for sanitizing and validating data
 */

/**
 * Safely checks if an array has elements
 * @param {Array} arr - The array to check
 * @returns {boolean} - True if the array exists and has at least one element
 */
exports.hasItems = (arr) => {
  return Array.isArray(arr) && arr.length > 0;
};

/**
 * Gets an array safely (returns empty array if null/undefined)
 * @param {Array} arr - The array to check
 * @returns {Array} - The original array or an empty array if null/undefined
 */
exports.safeArray = (arr) => {
  return Array.isArray(arr) ? arr : [];
};

/**
 * Validates a MongoDB ObjectId
 * @param {string} id - The id to validate
 * @returns {boolean} - True if the id is a valid MongoDB ObjectId
 */
exports.isValidObjectId = (id) => {
  const ObjectId = require('mongoose').Types.ObjectId;
  if (!id) return false;
  try {
    return ObjectId.isValid(id) && String(new ObjectId(id)) === String(id);
  } catch (e) {
    return false;
  }
};

/**
 * Safely trim a string
 * @param {string} str - The string to trim
 * @returns {string} - The trimmed string or empty string if null/undefined
 */
exports.safeTrim = (str) => {
  return typeof str === 'string' ? str.trim() : '';
};
