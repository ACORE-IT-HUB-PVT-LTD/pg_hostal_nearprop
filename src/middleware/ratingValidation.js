const { body, param, query } = require('express-validator');

/**
 * Middleware for validating rating and comment requests
 * Enhanced validation with sanitization and more robust error handling
 */
const ratingValidation = {
  /**
   * Validate add/update rating request
   */
  addRating: [
    param('propertyId')
      .notEmpty()
      .withMessage('Property ID is required')
      .trim()
      .escape(),
    body('rating')
      .notEmpty()
      .withMessage('Rating is required')
      .isInt({ min: 1, max: 5 })
      .withMessage('Rating must be a number between 1 and 5')
      .toInt(),
    body('review')
      .optional()
      .isString()
      .withMessage('Review must be a string')
      .isLength({ max: 1000 })
      .withMessage('Review must be a string with maximum 1000 characters')
      .trim()
      .escape()
  ],

  /**
   * Validate add comment request
   */
  addComment: [
    param('propertyId')
      .notEmpty()
      .withMessage('Property ID is required')
      .trim()
      .escape(),
    body('comment')
      .notEmpty()
      .withMessage('Comment is required')
      .isString()
      .withMessage('Comment must be a string')
      .isLength({ min: 1, max: 500 })
      .withMessage('Comment must be a string with maximum 500 characters')
      .trim()
      .escape()
  ],

  /**
   * Validate add reply to comment request
   */
  addReply: [
    param('commentId')
      .notEmpty()
      .withMessage('Comment ID is required')
      .trim()
      .escape(),
    body('text')
      .notEmpty()
      .withMessage('Reply text is required')
      .isString()
      .withMessage('Reply must be a string')
      .isLength({ min: 1, max: 300 })
      .withMessage('Reply must be a string with maximum 300 characters')
      .trim()
      .escape()
  ],
  
  /**
   * Validate pagination and sorting parameters
   * This can be used in any API that has pagination/sorting
   */
  paginationAndSorting: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer')
      .toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be a positive integer (max 100)')
      .toInt(),
    query('sortBy')
      .optional()
      .isString()
      .withMessage('sortBy must be a string')
      .isIn(['createdAt', 'rating', 'updatedAt'])
      .withMessage('sortBy must be one of: createdAt, rating, updatedAt')
      .trim(),
    query('sortOrder')
      .optional()
      .isString()
      .withMessage('sortOrder must be a string')
      .isIn(['asc', 'desc'])
      .withMessage('sortOrder must be either "asc" or "desc"')
      .trim()
  ]
};

module.exports = ratingValidation;
