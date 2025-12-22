const RatingService = require('../services/ratingService');
const Rating = require('../models/Rating');
const Comment = require('../models/Comment');
const Property = require('../models/Property');
const { validationResult } = require('express-validator');

/**
 * Controller for handling property ratings, reviews, and comments
 */
class RatingController {
  /**
   * Add or update a rating for a property
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Promise<void>}
   */
  static async addOrUpdateRating(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { propertyId } = req.params;
      const { rating, review } = req.body;
      const userId = req.user.id; // Assuming user ID is attached by auth middleware

      const result = await RatingService.addOrUpdateRating(propertyId, userId, rating, review);
      
      res.status(200).json({
        success: true,
        message: 'Rating added/updated successfully',
        rating: result
      });
    } catch (error) {
      console.error('Error in addOrUpdateRating controller:', error);
      res.status(error.message === 'Property not found' ? 404 : 500).json({
        success: false,
        message: error.message || 'Error adding/updating rating'
      });
    }
  }

  /**
   * Add a comment to a property
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Promise<void>}
   */
  static async addComment(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { propertyId } = req.params;
      const { comment } = req.body;
      const userId = req.user.id; // Assuming user ID is attached by auth middleware

      const result = await RatingService.addComment(propertyId, userId, comment);
      
      res.status(200).json({
        success: true,
        message: 'Comment added successfully',
        comment: result
      });
    } catch (error) {
      console.error('Error in addComment controller:', error);
      res.status(error.message === 'Property not found' ? 404 : 500).json({
        success: false,
        message: error.message || 'Error adding comment'
      });
    }
  }

  /**
   * Add a reply to a comment
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Promise<void>}
   */
  static async addReplyToComment(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { commentId } = req.params;
      const { text } = req.body;
      const userId = req.user.id; // Assuming user ID is attached by auth middleware
      const userType = req.user.role || 'user'; // Get user role from auth middleware

      const result = await RatingService.addReplyToComment(commentId, userId, text, userType);
      
      res.status(200).json({
        success: true,
        message: 'Reply added successfully',
        comment: result
      });
    } catch (error) {
      console.error('Error in addReplyToComment controller:', error);
      res.status(error.message === 'Comment not found' ? 404 : 500).json({
        success: false,
        message: error.message || 'Error adding reply'
      });
    }
  }

  /**
   * Get all ratings and reviews for a property
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Promise<void>}
   */
  static async getPropertyRatings(req, res) {
    try {
      const { propertyId } = req.params;
      const { page, limit, sortBy, sortOrder } = req.query;
      
      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        sortBy: sortBy || 'createdAt',
        sortOrder: sortOrder || 'desc'
      };
      
      const result = await RatingService.getPropertyRatings(propertyId, options);
      
      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Error in getPropertyRatings controller:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error fetching property ratings'
      });
    }
  }

  /**
   * Get all comments for a property
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Promise<void>}
   */
  static async getPropertyComments(req, res) {
    try {
      const { propertyId } = req.params;
      const { page, limit } = req.query;
      
      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10
      };
      
      const result = await RatingService.getPropertyComments(propertyId, options);
      
      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Error in getPropertyComments controller:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error fetching property comments'
      });
    }
  }

  /**
   * Get rating statistics for a property
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Promise<void>}
   */
  static async getPropertyRatingStats(req, res) {
    try {
      const { propertyId } = req.params;
      const stats = await RatingService.getPropertyRatingStats(propertyId);
      
      res.status(200).json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Error in getPropertyRatingStats controller:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error fetching property rating statistics'
      });
    }
  }

  /**
   * Get all ratings and reviews for a landlord's properties
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Promise<void>}
   */
  static async getLandlordPropertyRatings(req, res) {
    try {
      // If user is a landlord, use their ID as the landlordId
      // This ensures we don't need an extra landlordId field in the token
      let landlordId;
      if (req.user.role === 'landlord') {
        landlordId = req.user.id; // Use the user id directly when the role is landlord
      } else {
        landlordId = req.user.landlordId || req.params.landlordId;
      }
      
      const { page, limit } = req.query;
      
      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10
      };
      
      const result = await RatingService.getLandlordPropertyRatings(landlordId, options);
      
      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Error in getLandlordPropertyRatings controller:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error fetching landlord property ratings'
      });
    }
  }

  /**
   * Delete a rating/review (user can delete their own, landlord can delete from their properties)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Promise<void>}
   */
  static async deleteRating(req, res) {
    try {
      const { ratingId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;
      
      const rating = await Rating.findById(ratingId);
      if (!rating) {
        return res.status(404).json({
          success: false,
          message: 'Rating not found'
        });
      }
      
      // Check if user owns this rating or is landlord of the property
      const isOwner = rating.userId.toString() === userId.toString();
      const isLandlord = userRole === 'landlord' && rating.landlordId.toString() === req.user.landlordId;
      const isAdmin = userRole === 'admin';
      
      if (!isOwner && !isLandlord && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this rating'
        });
      }
      
      rating.isActive = false;
      await rating.save();
      
      // Recalculate ratings
      await RatingService.recalculatePropertyRating(rating.propertyId);
      
      res.status(200).json({
        success: true,
        message: 'Rating deleted successfully'
      });
    } catch (error) {
      console.error('Error in deleteRating controller:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error deleting rating'
      });
    }
  }

  /**
   * Delete a comment (user can delete their own, landlord can delete from their properties)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Promise<void>}
   */
  static async deleteComment(req, res) {
    try {
      const { commentId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;
      
      const comment = await Comment.findById(commentId);
      if (!comment) {
        return res.status(404).json({
          success: false,
          message: 'Comment not found'
        });
      }
      
      // Check if user owns this comment or is landlord of the property
      const isOwner = comment.userId.toString() === userId.toString();
      const isLandlord = userRole === 'landlord' && comment.landlordId.toString() === req.user.landlordId;
      const isAdmin = userRole === 'admin';
      
      if (!isOwner && !isLandlord && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this comment'
        });
      }
      
      comment.isActive = false;
      await comment.save();
      
      res.status(200).json({
        success: true,
        message: 'Comment deleted successfully'
      });
    } catch (error) {
      console.error('Error in deleteComment controller:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error deleting comment'
      });
    }
  }
}

module.exports = RatingController;
